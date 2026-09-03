/**
 * iframe-receiver.service.ts
 *
 * Deterministic Cross-Origin Authentication Receiver Bridge for Embedded Iframe Context.
 *
 * Architecture:
 * 1. Detects if running inside an iframe (window.self !== window.top).
 * 2. Emits an immediate IFRAME_READY / REQUEST_SESSION handshake to window.parent.
 * 3. Listens for parent postMessage authentication payloads (AUTH_INIT, deriv:dtrader:auth, NEWDTRADER_BRIDGE_AUTH, etc.).
 * 4. Atomically ingests tokens into localStorage, sessionManager, and clientStore.
 * 5. Authenticates the WebSocket session with Deriv API.
 * 6. Emits AUTH_SUCCESS / SESSION_READY acknowledgment back to window.parent.
 * 7. Enforces strict session isolation with unique authSessionId to prevent stale race conditions.
 * 8. Never exposes raw credentials in diagnostic logs.
 */

import { isDemoAccount } from '@/utils/account-helpers';
import { sessionManager } from '@/components/iframe-bridge/session-manager';
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

        const msgType = parsed.type || parsed.action || '';
        const isAuthMsg =
            msgType === 'AUTH_INIT' ||
            msgType === 'deriv:dtrader:auth' ||
            msgType === 'newdtrader:auth' ||
            msgType === 'NEWDTRADER_BRIDGE_AUTH' ||
            msgType === 'NEWDTRADER_BRIDGE_AUTH_RESPONSE' ||
            msgType === 'SESSION_DATA' ||
            msgType === 'DERIV_AUTH' ||
            msgType === 'AUTH_TOKEN' ||
            msgType === 'setToken' ||
            msgType === 'login' ||
            msgType === 'SYNC_SESSION' ||
            msgType === 'HANDSHAKE_RESPONSE' ||
            msgType === 'BRIDGE_AUTH_SUCCESS' ||
            msgType === 'AUTH_SUCCESS' ||
            msgType === 'AUTHORIZE';

        const isLogoutMsg = msgType === 'LOGOUT' || msgType === 'CLEAR_SESSION' || msgType === 'SIGN_OUT';

        if (isLogoutMsg) {
            this.handleParentLogout(event.origin);
            return;
        }

        if (!isAuthMsg && !parsed.auth && !parsed.token && !parsed.access_token) {
            return;
        }

        // Store detected parent origin for secure future replies
        if (event.origin && event.origin !== 'null') {
            this.parentOrigin = event.origin;
        }

        // Process authentication payload
        await this.processAuthPayload(parsed, event.origin);
    };

    /**
     * Atomically extracts credentials and authenticates session
     */
    private async processAuthPayload(msg: any, origin: string) {
        try {
            const rawPayload = msg.payload || msg.auth || msg;

            // Extract token from various supported formats
            const token =
                rawPayload.access_token ||
                rawPayload.token ||
                rawPayload.token1 ||
                rawPayload.authToken ||
                rawPayload.active_token ||
                msg.token ||
                msg.token1 ||
                msg.authToken ||
                '';

            if (!token || typeof token !== 'string' || token.trim() === '' || token === 'null' || token === 'undefined') {
                return;
            }

            // Extract active account login ID
            const loginid =
                msg.activeAccountId ||
                rawPayload.activeAccountId ||
                rawPayload.loginid ||
                rawPayload.loginId ||
                rawPayload.acct1 ||
                rawPayload.account_id ||
                msg.loginid ||
                msg.loginId ||
                msg.acct1 ||
                '';

            // Extract currency
            const currency =
                rawPayload.currency ||
                rawPayload.cur1 ||
                rawPayload.userProfile?.currency ||
                msg.currency ||
                msg.cur1 ||
                'USD';

            // Extract App ID
            const appId = String(
                msg.clientId ||
                rawPayload.clientId ||
                rawPayload.appId ||
                rawPayload.app_id ||
                msg.appId ||
                msg.app_id ||
                '121856'
            );

            // Assign unique session identifier for this auth cycle to prevent race conditions
            const sessionId = crypto.randomUUID ? crypto.randomUUID() : `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            this.activeSessionId = sessionId;

            // Stop readiness beacon now that a payload has arrived
            if (this.readyIntervalId) {
                clearInterval(this.readyIntervalId);
                this.readyIntervalId = null;
            }

            // Safe diagnostic log (NO RAW SECRETS)
            this.logSafeDiagnostic('AUTH_PAYLOAD_RECEIVED', {
                tokenReceived: true,
                tokenLength: token.length,
                tokenSource: 'parent_postMessage',
                tokenType: msg.type || 'deriv:auth',
                accountId: loginid || 'UNKNOWN',
                sessionInitialized: true,
                timestamp: Date.now(),
            });

            // Ingest and persist accounts in localStorage
            this.persistSessionCredentials({
                token,
                loginid,
                currency,
                appId,
                accounts: rawPayload.accounts || msg.accounts || msg.account_list,
            });

            // Update sessionManager singleton
            sessionManager.setSession({
                token,
                loginid,
                currency,
                isDemo: isDemoAccount(loginid),
                appId,
            });

            // Initialize / re-authenticate APIBase WebSocket
            const { api_base } = await import('@/external/bot-skeleton');
            if (api_base) {
                await api_base.init(true);
                const authRes = await api_base.authorizeAndSubscribe();

                // Ensure another newer session hasn't superseded this one
                if (this.activeSessionId !== sessionId) {
                    return;
                }

                if (authRes && !(authRes as any).localizedMessage) {
                    this.isAuthenticated = true;
                    this.isHandshaking = false;

                    this.logSafeDiagnostic('SESSION_READY', {
                        tokenReceived: true,
                        tokenLength: token.length,
                        tokenSource: 'websocket_authorized',
                        tokenType: 'authorized_session',
                        accountId: loginid,
                        sessionInitialized: true,
                        timestamp: Date.now(),
                    });

                    // Send AUTH_SUCCESS & SESSION_READY handshake reply to parent
                    this.sendReplyToParent({
                        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
                        type: 'AUTH_SUCCESS',
                        action: 'SESSION_READY',
                        source: 'iframe',
                        payload: {
                            status: 'success',
                            loginid,
                            currency,
                            sessionId,
                            timestamp: Date.now(),
                        },
                    }, origin);
                } else {
                    this.logSafeDiagnostic('AUTH_RETRY_OR_ERROR', {
                        tokenReceived: true,
                        tokenLength: token.length,
                        tokenSource: 'websocket_auth_failed',
                        tokenType: 'auth_error',
                        accountId: loginid,
                        sessionInitialized: false,
                        timestamp: Date.now(),
                    });
                }
            }
        } catch (error) {
            console.error('[IframeReceiver] Error processing auth payload:', error);
        }
    }

    /**
     * Synchronizes and writes session state across all localStorage storage keys
     */
    private persistSessionCredentials({
        token,
        loginid,
        currency,
        appId,
        accounts,
    }: {
        token: string;
        loginid: string;
        currency: string;
        appId: string;
        accounts?: any[];
    }) {
        try {
            const isDemo = isDemoAccount(loginid);
            const activeId = loginid || (isDemo ? 'VRTC100000' : 'CR100000');

            // Build accountsList map
            const accountsList: Record<string, string> = {};
            const clientAccounts: Record<string, { currency: string; token: string }> = {};
            const client_account_details: Array<{ loginid: string; currency: string; token: string; is_virtual: number }> = [];

            if (Array.isArray(accounts) && accounts.length > 0) {
                accounts.forEach((acc: any) => {
                    const accId = acc.account_id || acc.loginid;
                    const accTok = acc.token || token;
                    const accCur = acc.currency || currency || 'USD';
                    if (accId) {
                        accountsList[accId] = accTok;
                        clientAccounts[accId] = { currency: accCur, token: accTok };
                        client_account_details.push({
                            loginid: accId,
                            currency: accCur,
                            token: accTok,
                            is_virtual: isDemoAccount(accId) ? 1 : 0,
                        });
                    }
                });
            } else {
                accountsList[activeId] = token;
                clientAccounts[activeId] = { currency: currency || 'USD', token };
                client_account_details.push({
                    loginid: activeId,
                    currency: currency || 'USD',
                    token,
                    is_virtual: isDemo ? 1 : 0,
                });
            }

            localStorage.setItem('accountsList', JSON.stringify(accountsList));
            localStorage.setItem('client.accounts', JSON.stringify(clientAccounts));
            localStorage.setItem('clientAccounts', JSON.stringify(clientAccounts));
            localStorage.setItem('client_account_details', JSON.stringify(client_account_details));

            localStorage.setItem('active_loginid', activeId);
            localStorage.setItem('client.loginid', activeId);
            localStorage.setItem('authToken', token);
            localStorage.setItem('active_token', token);
            localStorage.setItem('token1', token);
            localStorage.setItem('token', token);
            localStorage.setItem('account_type', isDemo ? 'demo' : 'real');
            localStorage.setItem('client.currency', currency || 'USD');
            if (appId) {
                localStorage.setItem('config.app_id', appId);
            }

            // Sync with active client store if already instantiated
            const clientStore = globalObserver.getState('client.store');
            if (clientStore) {
                clientStore.setLoginId?.(activeId);
                clientStore.setCurrency?.(currency || 'USD');
                clientStore.setIsLoggedIn?.(true);
            }
        } catch (err) {
            console.error('[IframeReceiver] Error persisting session credentials:', err);
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
