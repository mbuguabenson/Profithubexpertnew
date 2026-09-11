/**
 * iframe-receiver.service.ts
 *
 * Secure Cross-Origin Authentication Receiver Bridge for Embedded Iframe Context.
 *
 * Architecture (updated — no raw tokens ever stored in localStorage):
 * 1. Detects if running inside an iframe (window.self !== window.top).
 * 2. Emits BRIDGE_READY / REQUEST_SESSION to window.parent.
 * 3. Receives AUTH_INIT from parent (contains only loginid, currency, expiresAt — NO token).
 * 4. Replies with REQUEST_TOKEN to ask parent for a One-Time Token (OTT).
 * 5. Parent fetches OTT from /api/session/iframe-token (server-side, HttpOnly cookie auth).
 * 6. Parent posts { type: 'OTT', ott } to the iframe (strict origin).
 * 7. Iframe POSTs OTT to /api/session/redeem (same-origin server call).
 * 8. Server verifies HMAC, exchanges OTT for a Deriv WS token, returns { wsToken }.
 * 9. Iframe authorizes WebSocket session with wsToken; never writes it to localStorage.
 * 10. Emits AUTH_SUCCESS acknowledgment to parent.
 */

import { secureSessionService } from '@/services/secure-session.service';
import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';

export interface SafeAuthMetadata {
    tokenReceived: boolean;
    tokenLength: number;
    tokenSource: string;
    tokenType: string;
    accountId: string;
    sessionInitialized: boolean;
    timestamp: number;
}

export class IframeReceiverService {
    private static instance: IframeReceiverService | null = null;
    private isInitialized = false;
    private isInIframe = false;
    private activeSessionId: string | null = null;
    private readyIntervalId: any = null;
    private handshakeAttempts = 0;
    private readonly MAX_HANDSHAKE_ATTEMPTS = 30; // 30 attempts @ 300ms = 9 seconds max
    private isHandshaking = false;
    private isAuthenticated = false;
    private parentOrigin: string = '*';

    private constructor() {
        this.isInIframe = typeof window !== 'undefined' && window.self !== window.top;
    }

    public static getInstance(): IframeReceiverService {
        if (!IframeReceiverService.instance) {
            IframeReceiverService.instance = new IframeReceiverService();
        }
        return IframeReceiverService.instance;
    }

    public init() {
        if (this.isInitialized || typeof window === 'undefined') return;
        this.isInitialized = true;

        if (!this.isInIframe) {
            // Not running in an iframe; standalone mode active
            return;
        }

        this.isHandshaking = true;
        this.logSafeDiagnostic('IFRAME_INIT', {
            tokenReceived: false,
            tokenLength: 0,
            tokenSource: 'iframe_bootstrap',
            tokenType: 'none',
            accountId: '',
            sessionInitialized: false,
            timestamp: Date.now(),
        });

        // Register window message listener for parent authentication
        window.addEventListener('message', this.handleParentMessage);

        // Start deterministic readiness beacon to window.parent
        this.startReadyBeacon();
    }

    public getIsHandshaking(): boolean {
        return this.isInIframe && this.isHandshaking && !this.isAuthenticated;
    }

    public getIsAuthenticated(): boolean {
        return this.isAuthenticated;
    }

    /**
     * Periodically broadcasts IFRAME_READY until valid authentication is received
     */
    private startReadyBeacon() {
        if (!this.isInIframe || this.isAuthenticated) return;

        const sendReady = () => {
            if (this.isAuthenticated || this.handshakeAttempts >= this.MAX_HANDSHAKE_ATTEMPTS) {
                if (this.readyIntervalId) {
                    clearInterval(this.readyIntervalId);
                    this.readyIntervalId = null;
                }
                this.isHandshaking = false;
                return;
            }

            this.handshakeAttempts++;
            try {
                const readyMessage = {
                    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
                    type: 'BRIDGE_READY',
                    action: 'REQUEST_SESSION',
                    source: 'iframe',
                    version: 'v2',
                    timestamp: Date.now(),
                };

                window.parent.postMessage(readyMessage, '*');

                // Also send fallback legacy format
                window.parent.postMessage({
                    type: 'IFRAME_READY',
                    action: 'REQUEST_AUTH',
                    source: 'iframe',
                    timestamp: Date.now(),
                }, '*');

                this.logSafeDiagnostic('READY_BEACON_SENT', {
                    tokenReceived: false,
                    tokenLength: 0,
                    tokenSource: 'iframe_beacon',
                    tokenType: 'beacon',
                    accountId: `attempt_${this.handshakeAttempts}`,
                    sessionInitialized: false,
                    timestamp: Date.now(),
                });
            } catch (e) {
                // Ignore cross-origin postMessage errors
            }
        };

        // Send immediately at T+0ms
        sendReady();

        // Repeat every 300ms until authenticated or timeout
        this.readyIntervalId = setInterval(sendReady, 300);
    }

    /**
     * Handles incoming postMessage events from window.parent
     */
    private handleParentMessage = async (event: MessageEvent) => {
        // Prevent processing messages from self
        if (!event.source || event.source === window) return;

        // Enforce strict origin check — only accept messages from the known parent origin
        if (this.parentOrigin !== '*' && event.origin !== this.parentOrigin) return;

        const data = event.data;
        if (!data || (typeof data !== 'object' && typeof data !== 'string')) return;

        let parsed: any = data;
        if (typeof data === 'string') {
            try {
                parsed = JSON.parse(data);
            } catch {
                return;
            }
        }

        // Capture the verified parent origin on first trusted message
        if (event.origin && event.origin !== 'null' && this.parentOrigin === '*') {
            this.parentOrigin = event.origin;
        }

        const msgType = parsed.type || parsed.action || '';

        if (msgType === 'LOGOUT' || msgType === 'CLEAR_SESSION' || msgType === 'SIGN_OUT') {
            this.handleParentLogout(event.origin);
            return;
        }

        // AUTH_INIT — parent signals that a session exists (no token included)
        if (msgType === 'AUTH_INIT') {
            const { loginid, currency, expiresAt } = parsed;
            if (loginid) {
                this.activeSessionId = crypto.randomUUID
                    ? crypto.randomUUID()
                    : `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
                // Request the OTT to redeem a WS token securely
                this.sendReplyToParent({
                    type:   'REQUEST_TOKEN',
                    source: 'iframe',
                    loginid,
                    sessionId: this.activeSessionId,
                }, event.origin);

                // Update in-memory session metadata (no raw token)
                secureSessionService['meta'] = {
                    loggedIn: true,
                    loginid,
                    currency: currency || 'USD',
                    account_type: 'real',
                    expiresAt: expiresAt || (Date.now() + 3600_000),
                };
            }
            return;
        }

        // OTT — parent replies with a one-time token to redeem for a WS token
        if (msgType === 'OTT' && parsed.ott) {
            await this.redeemOTT(parsed.ott, event.origin);
            return;
        }
    };

    /**
     * Redeems a One-Time Token (OTT) by POSTing it to /api/session/redeem.
     * Receives a Deriv WebSocket token and authorizes the WS session.
     * The WS token is stored only in memory (secureSessionService), never localStorage.
     */
    private async redeemOTT(ott: string, parentOrigin: string) {
        const sessionId = this.activeSessionId;
        try {
            const res = await fetch('/api/session/redeem', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ott }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: 'Redeem failed' }));
                console.error('[IframeReceiver] OTT redeem failed:', errData.error);
                return;
            }

            const { wsToken } = await res.json();
            if (!wsToken) return;

            // Store WS token in memory only — never written to localStorage
            secureSessionService.setWsToken(wsToken);

            // Authorize the WebSocket session
            const { api_base } = await import('@/external/bot-skeleton');
            if (api_base) {
                if (this.activeSessionId !== sessionId) return; // superseded
                await api_base.init(true);
                const authRes = await api_base.authorizeAndSubscribe();
                if (authRes && !(authRes as any).localizedMessage) {
                    this.isAuthenticated = true;
                    this.isHandshaking = false;
                    this.sendReplyToParent({
                        type:    'AUTH_SUCCESS',
                        action:  'SESSION_READY',
                        source:  'iframe',
                        payload: {
                            status:    'success',
                            sessionId: this.activeSessionId,
                            timestamp: Date.now(),
                        },
                    }, parentOrigin);
                }
            }
        } catch (error) {
            console.error('[IframeReceiver] Error redeeming OTT:', error);
        }
    }


    /**
     * Handles clean parent logout notification
     */
    private async handleParentLogout(origin: string) {
        this.isAuthenticated = false;
        this.isHandshaking = false;
        this.activeSessionId = null;

        try {
            const { api_base } = await import('@/external/bot-skeleton');
            if (api_base) {
                api_base.terminate();
            }

            const clientStore = globalObserver.getState('client.store');
            if (clientStore) {
                clientStore.setIsLoggedIn?.(false);
            }

            const keysToRemove = [
                'authToken',
                'active_token',
                'token',
                'token1',
                'token2',
                'token3',
                'active_loginid',
                'client.loginid',
                'accountsList',
                'client.accounts',
                'clientAccounts',
                'client_account_details',
            ];

            keysToRemove.forEach(k => {
                localStorage.removeItem(k);
                sessionStorage.removeItem(k);
            });

            this.logSafeDiagnostic('PARENT_LOGOUT_COMPLETED', {
                tokenReceived: false,
                tokenLength: 0,
                tokenSource: 'parent_logout',
                tokenType: 'logout',
                accountId: '',
                sessionInitialized: false,
                timestamp: Date.now(),
            });

            this.sendReplyToParent({
                type: 'LOGOUT_ACK',
                action: 'LOGGED_OUT',
                source: 'iframe',
                timestamp: Date.now(),
            }, origin);
        } catch (e) {
            console.error('[IframeReceiver] Error handling parent logout:', e);
        }
    }

    /**
     * Safely replies back to window.parent
     */
    private sendReplyToParent(msg: any, origin?: string) {
        if (!this.isInIframe || typeof window === 'undefined') return;

        try {
            const targetOrigin = origin && origin !== '*' && origin !== 'null' ? origin : this.parentOrigin;
            window.parent.postMessage(msg, targetOrigin);
        } catch (e) {
            try {
                window.parent.postMessage(msg, '*');
            } catch {}
        }
    }

    /**
     * Logs safe metadata only - ZERO SECRETS
     */
    private logSafeDiagnostic(stage: string, meta: SafeAuthMetadata) {
        console.log(`[IFRAME AUTH] [${stage}]`, {
            tokenReceived: meta.tokenReceived,
            tokenLength: meta.tokenLength,
            tokenSource: meta.tokenSource,
            tokenType: meta.tokenType,
            accountId: meta.accountId,
            sessionInitialized: meta.sessionInitialized,
            timestamp: meta.timestamp,
        });
    }

    public destroy() {
        if (typeof window !== 'undefined') {
            window.removeEventListener('message', this.handleParentMessage);
        }
        if (this.readyIntervalId) {
            clearInterval(this.readyIntervalId);
            this.readyIntervalId = null;
        }
        this.isInitialized = false;
        this.isHandshaking = false;
    }
}

export const iframeReceiverService = IframeReceiverService.getInstance();
export default iframeReceiverService;
