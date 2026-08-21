import { BridgeStateMachine, BridgeState } from './bridge-state-machine';
import { SessionManager as _SessionManager, sessionManager } from './session-manager';
import { BridgeEvent, BridgeMessage, createMessage, isValidBridgeMessage } from './protocol';
import { getActiveToken, resolveValidDerivWSToken, getAccountsList } from '@/utils/token-bridge';
import { getClientId } from '@/components/shared/utils/config/config';
import { makeBridgeLogger, generateInstanceId } from './bridge-diagnostics';

export interface BridgeDiagnosticInfo {
    state: BridgeState;
    appId: string;
    parentOrigin: string;
    iframeOrigin: string;
    sessionStatus: 'valid' | 'invalid' | 'none';
    lastEvent: BridgeEvent | string | null;
    lastError: string | null;
    reconnects: number;
    pendingMessages: number;
    messageHistory: Array<{ direction: 'in' | 'out'; msg: BridgeMessage; time: Date }>;
}

export class ParentBridgeClient {
    public stateMachine: BridgeStateMachine;
    private iframeWindow: Window | null = null;
    private iframeOrigin: string = '*';
    private reconnectAttempts: number = 0;
    private maxReconnects: number = 5;
    private instanceId: string;
    private logger: ReturnType<typeof makeBridgeLogger>;
    private retryIntervalId: any = null;
    
    // Diagnostics
    private diagnostics: BridgeDiagnosticInfo = {
        state: BridgeState.IDLE,
        appId: getClientId() || '33Mmq9JHMrJaUKT2KIhKZ',
        parentOrigin: typeof window !== 'undefined' ? window.location.origin : 'unknown',
        iframeOrigin: 'unknown',
        sessionStatus: 'none',
        lastEvent: null,
        lastError: null,
        reconnects: 0,
        pendingMessages: 0,
        messageHistory: []
    };
    
    private listeners: Set<() => void> = new Set();
    private sessionUnsubscribe: (() => void) | null = null;

    constructor() {
        this.stateMachine = new BridgeStateMachine(BridgeState.IDLE);
        this.diagnostics.state = this.stateMachine.getState();
        this.instanceId = generateInstanceId();
        this.logger = makeBridgeLogger(this.instanceId);
        this.logger.debug('BRIDGE_INIT', { appId: this.diagnostics.appId, parentOrigin: this.diagnostics.parentOrigin });
        
        this.stateMachine.subscribe((state) => {
            const previous = this.diagnostics.state;
            this.diagnostics.state = state;
            this.logger.stateChange(previous, state as string, 'stateMachine.subscribe');
            this.notifyDiagnosticListeners();
        });
        
        if (typeof window !== 'undefined') {
            window.addEventListener('message', this.handleMessage);
        }
    }

    public attach(iframe: HTMLIFrameElement, expectedOrigin: string) {
        this.iframeWindow = iframe.contentWindow;
        this.iframeOrigin = expectedOrigin;
        this.diagnostics.iframeOrigin = expectedOrigin;
        this.logger.debug('IFRAME_ATTACH', { iframeOrigin: expectedOrigin });
        
        this.stateMachine.transitionTo(BridgeState.LOADING_IFRAME);
        
        this.sessionUnsubscribe = sessionManager.subscribe((session) => {
            this.handleSessionChange(session);
        });

        // Proactively send auth handshakes to iframe continuously for 30s
        this.startProactiveAuthLoop();

        setTimeout(() => {
            if (this.stateMachine.getState() === BridgeState.LOADING_IFRAME) {
                this.stateMachine.transitionTo(BridgeState.WAITING_READY);
            }
        }, 500);
    }

    private sendAuthPayloadToWindow(targetWindow: Window, tok: string, loginid: string, currency: string, appIdStr: string) {
        if (!targetWindow || targetWindow === window) return;
        try {
            const hasToken = !!tok && tok !== 'null' && tok !== 'undefined' && tok !== 'a1-guest' && tok !== 'dummy_token';
            const authMode = hasToken ? 'derivws_otp' : 'none';
            const effectiveToken = hasToken ? tok : '';

            const accountsList = getAccountsList();
            const isDemo = loginid.startsWith('VR') || loginid.startsWith('VRT') || loginid.startsWith('DOT') || loginid.startsWith('DEM');

            const accounts = Object.keys(accountsList).length > 0
                ? Object.entries(accountsList).map(([id]) => ({
                    account_id: id,
                    account_type: (id.startsWith('VR') || id.startsWith('VRT') || id.startsWith('DOT') || id.startsWith('DEM') ? 'demo' : 'real') as 'demo' | 'real',
                    currency: currency || 'USD',
                    balance: '10000.00',
                    status: 'active',
                }))
                : [{
                    account_id: loginid || 'DOT100000',
                    account_type: isDemo ? ('demo' as const) : ('real' as const),
                    currency: currency || 'USD',
                    balance: '10000.00',
                    status: 'active',
                }];

            const activeAccId = loginid || accounts[0].account_id;
            const profileCountry =
                localStorage.getItem('residence') ||
                localStorage.getItem('country') ||
                localStorage.getItem('client.country') ||
                'ke';

            // Exact NewdtraderAuthMsg schema required by isAuthMsg in @deriv/api-v2 bridge-types.ts
            const v2AuthMsg = {
                type: 'deriv:dtrader:auth',
                version: 'v2',
                auth: {
                    access_token: effectiveToken,
                    token_type: 'Bearer',
                    expires_at: Date.now() + 86400000,
                },
                activeAccountId: activeAccId,
                accounts: accounts,
                otpUrl: '',
                userProfile: {
                    country: profileCountry.toLowerCase(),
                    currency: currency || 'USD',
                    email: 'user@profithub.co.ke',
                    fullname: 'Profithub Trader',
                },
                clientId: appIdStr || '121856',
                apiBase: 'https://ws.derivws.com/websockets/v3',
                authBase: 'https://oauth.deriv.com',
            };


            const legacyV2AuthMsg = {
                ...v2AuthMsg,
                type: 'newdtrader:auth',
            };

            const payloadInner = {
                status: 'success',
                tokenPresent: hasToken,
                token: effectiveToken,
                token1: effectiveToken,
                loginid: activeAccId,
                loginId: activeAccId,
                acct1: activeAccId,
                account_id: activeAccId,
                currency: currency || 'USD',
                cur1: currency || 'USD',
                accountType: 'ZOOM',
                account_type: 'ZOOM',
                appId: Number(appIdStr) || 121856,
                app_id: appIdStr,
                server: 'green',
                timestamp: Date.now(),
                authMode: authMode,
                defaultSymbol: '1HZ100V',
                embedBase: 'https://deriv-dtrader.vercel.app',
            };

            const payloadData = {
                ...payloadInner,
                payload: payloadInner,
            };

            const structuredMsg = createMessage('NEWDTRADER_BRIDGE_AUTH', appIdStr, 'parent', payloadInner);

            const postBoth = (msg: any) => {
                try {
                    targetWindow.postMessage(msg, '*');
                    if (typeof msg === 'object') {
                        targetWindow.postMessage(JSON.stringify(msg), '*');
                    }
                } catch (e) {
                    // ignore
                }
            };

            // Post exact @deriv/api-v2 bridge payloads FIRST
            postBoth(v2AuthMsg);
            postBoth(legacyV2AuthMsg);

            // Post fallback & legacy variations
            postBoth(structuredMsg);
            postBoth({ type: 'NEWDTRADER_BRIDGE_AUTH', ...payloadData });
            postBoth({ action: 'NEWDTRADER_BRIDGE_AUTH', ...payloadData });
            postBoth({ type: 'NEWDTRADER_BRIDGE_AUTH_RESPONSE', ...payloadData });
            postBoth({ type: 'NEW_DTRADER_BRIDGE_AUTH', ...payloadData });
            postBoth({ type: 'SESSION_DATA', ...payloadData });
            postBoth({ type: 'DERIV_AUTH', ...payloadData });
            postBoth({ type: 'AUTH_TOKEN', ...payloadData });
            postBoth({ type: 'HANDSHAKE_RESPONSE', ...payloadData });
            postBoth({ type: 'BRIDGE_AUTH_SUCCESS', ...payloadData });
            postBoth({ type: 'AUTH_SUCCESS', ...payloadData });
            postBoth({ action: 'setToken', ...payloadData });
            postBoth({ action: 'AUTHORIZE', ...payloadData });
        } catch (e) {
            // ignore
        }
    }


    private startProactiveAuthLoop() {
        if (this.retryIntervalId) {
            clearInterval(this.retryIntervalId);
        }

        let attempts = 0;
        const maxAttempts = 100; // 25 seconds @ 250ms interval

        const postAuth = async () => {
            if (!this.iframeWindow) return;
            try {
                const session = sessionManager.getSession();
                let loginid = session?.loginid || localStorage.getItem('active_loginid') || localStorage.getItem('client.loginid') || 'DOT100000';
                const syncToken = getActiveToken() || '';
                const currency = session?.currency || localStorage.getItem('client.currency') || 'USD';
                const appIdStr = String(session?.appId || getClientId() || '33Mmq9JHMrJaUKT2KIhKZ');

                // Send synchronous payload immediately (<1ms)
                this.sendAuthPayloadToWindow(this.iframeWindow, syncToken, loginid, currency, appIdStr);

                // Refine with async token resolution if syncToken was empty
                if (!syncToken) {
                    const resolvedToken = await resolveValidDerivWSToken(loginid);
                    if (resolvedToken && resolvedToken !== syncToken && this.iframeWindow) {
                        this.sendAuthPayloadToWindow(this.iframeWindow, resolvedToken, loginid, currency, appIdStr);
                    }
                }
            } catch (e) {
                // ignore
            }
        };

        postAuth();
        this.retryIntervalId = setInterval(() => {
            attempts++;
            if (!this.iframeWindow || attempts >= maxAttempts) {
                if (this.retryIntervalId) clearInterval(this.retryIntervalId);
                return;
            }
            postAuth();
        }, 250);
    }


    public detach() {
        if (this.retryIntervalId) {
            clearInterval(this.retryIntervalId);
            this.retryIntervalId = null;
        }
        if (typeof window !== 'undefined') {
            window.removeEventListener('message', this.handleMessage);
        }
        if (this.sessionUnsubscribe) {
            this.sessionUnsubscribe();
            this.sessionUnsubscribe = null;
        }
        this.iframeWindow = null;
        this.logger.debug('IFRAME_DETACH');
        this.stateMachine.transitionTo(BridgeState.IDLE);
    }

    public getDiagnostics(): BridgeDiagnosticInfo {
        return this.diagnostics;
    }

    public subscribeDiagnostics(listener: () => void) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    private notifyDiagnosticListeners() {
        this.listeners.forEach(listener => {
            try { listener(); } catch (e) { console.error(e); }
        });
    }

    private logMessage(direction: 'in' | 'out', msg: BridgeMessage) {
        this.diagnostics.messageHistory.unshift({ direction, msg, time: new Date() });
        if (this.diagnostics.messageHistory.length > 50) {
            this.diagnostics.messageHistory.pop();
        }
        this.diagnostics.lastEvent = msg.type;
        this.notifyDiagnosticListeners();
    }

    private sendMessage<T>(type: BridgeEvent | string, payload: T) {
        if (!this.iframeWindow) return;
        
        const session = sessionManager.getSession();
        const appId = session?.appId || getClientId() || '33Mmq9JHMrJaUKT2KIhKZ';
        this.diagnostics.appId = appId;

        const msg = createMessage(type, appId, 'parent', payload);
        this.logMessage('out', msg);
        this.logger.messageSent(this.iframeOrigin, msg.type as string);
        try {
            this.iframeWindow.postMessage(msg, '*');
        } catch (error) {
            console.error('[ParentBridge] Failed to send message', error);
        }
    }

    private handleMessage = (event: MessageEvent) => {
        // Prevent postMessage feedback loops from window itself
        if (!event.source || event.source === window) {
            return;
        }

        const allowedOrigins = [
            'https://deriv-dtrader.vercel.app',
            'https://trader.deriv.com',
            'https://app.deriv.com',
        ];

        const isAllowed = allowedOrigins.some(o => event.origin.startsWith(o)) ||
            /^http:\/\/localhost(:\d+)?$/i.test(event.origin);

        if (!isAllowed) {
            return;
        }

        const data = event.data;
        if (!data || (typeof data !== 'object' && typeof data !== 'string')) {
            return;
        }

        let parsedData: any = data;
        if (typeof data === 'string') {
            try {
                parsedData = JSON.parse(data);
            } catch {
                return;
            }
        }

        // On ANY message from iframe window, immediately reply with full auth payload
        if (event.source && typeof (event.source as Window).postMessage === 'function') {
            (async () => {
                try {
                    const session = sessionManager.getSession();
                    let loginid = session?.loginid || localStorage.getItem('active_loginid') || localStorage.getItem('client.loginid') || '';
                    const syncToken = getActiveToken() || '';
                    const currency = session?.currency || localStorage.getItem('client.currency') || 'USD';
                    const appIdStr = String(session?.appId || getClientId() || '33Mmq9JHMrJaUKT2KIhKZ');
                    const targetWin = event.source as Window;

                    this.sendAuthPayloadToWindow(targetWin, syncToken, loginid, currency, appIdStr);

                    if (!syncToken) {
                        const resolvedToken = await resolveValidDerivWSToken(loginid);
                        if (resolvedToken && resolvedToken !== syncToken) {
                            this.sendAuthPayloadToWindow(targetWin, resolvedToken, loginid, currency, appIdStr);
                        }
                    }
                } catch (e) {
                    // ignore
                }
            })();
        }

        if (!isValidBridgeMessage(parsedData)) {
            return;
        }

        if (parsedData.source !== 'iframe') {
            return;
        }

        this.logMessage('in', parsedData);

        switch (parsedData.type as BridgeEvent) {
            case BridgeEvent.BRIDGE_READY:
                this.handleBridgeReady();
                break;
            case BridgeEvent.REQUEST_SESSION:
                this.handleSessionRequest();
                break;
            case BridgeEvent.AUTH_SUCCESS:
                this.stateMachine.transitionTo(BridgeState.AUTHENTICATED);
                setTimeout(() => this.stateMachine.transitionTo(BridgeState.CONNECTED), 100);
                this.reconnectAttempts = 0;
                break;
            case BridgeEvent.AUTH_FAILED:
                this.diagnostics.lastError = parsedData.payload?.message || 'Authentication Failed';
                this.stateMachine.transitionTo(BridgeState.FAILED);
                this.attemptRecovery();
                break;
            case BridgeEvent.LOGOUT:
                this.stateMachine.transitionTo(BridgeState.LOGGED_OUT);
                break;
            case BridgeEvent.ERROR:
                this.diagnostics.lastError = parsedData.payload?.message || 'Unknown Error';
                break;
        }
    };

    private handleBridgeReady() {
        if (this.stateMachine.transitionTo(BridgeState.READY)) {
            this.handleSessionRequest();
        }
    }

    private handleSessionRequest = () => {
        const session = sessionManager.getSession();
        let loginid = session?.loginid || localStorage.getItem('active_loginid') || localStorage.getItem('client.loginid') || '';
        let token = session?.token || getActiveToken() || localStorage.getItem('token') || '';
        const currency = session?.currency || localStorage.getItem('client.currency') || 'USD';
        const appIdStr = String(session?.appId || getClientId() || '33Mmq9JHMrJaUKT2KIhKZ');

        this.diagnostics.sessionStatus = 'valid';
        this.diagnostics.appId = appIdStr;
        this.stateMachine.transitionTo(BridgeState.REQUESTING_SESSION);

        if (this.iframeWindow) {
            this.sendAuthPayloadToWindow(this.iframeWindow, token, loginid, currency, appIdStr);
        }

        this.stateMachine.transitionTo(BridgeState.AUTHENTICATING);
        this.sendMessage(BridgeEvent.AUTH_START, { timestamp: Date.now() });

        setTimeout(() => {
            this.stateMachine.transitionTo(BridgeState.AUTHENTICATED);
            setTimeout(() => {
                this.stateMachine.transitionTo(BridgeState.CONNECTED);
            }, 100);
        }, 300);
    };

    private handleSessionChange = (session: any) => {
        if (!session) {
            this.diagnostics.sessionStatus = 'none';
            return;
        }
        this.diagnostics.sessionStatus = 'valid';
        this.handleSessionRequest();
    };

    private attemptRecovery() {
        if (this.reconnectAttempts < this.maxReconnects) {
            this.reconnectAttempts++;
            this.stateMachine.transitionTo(BridgeState.RECOVERING);
            
            const backoff = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
            setTimeout(() => {
                this.stateMachine.transitionTo(BridgeState.WAITING_READY);
                this.sendMessage(BridgeEvent.PING, { timestamp: Date.now() });
                setTimeout(() => this.handleSessionRequest(), 500);
            }, backoff);
        }
    }
}
