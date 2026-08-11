import { BridgeStateMachine, BridgeState } from './bridge-state-machine';
import { SessionManager as _SessionManager, sessionManager } from './session-manager';
import { BridgeEvent, BridgeMessage, createMessage, isValidBridgeMessage, SessionPayload } from './protocol';
import { getActiveToken, getAccountsList, truncateToken, resolveValidDerivWSToken } from '@/utils/token-bridge';
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
    
    // Diagnostics
    private diagnostics: BridgeDiagnosticInfo = {
        state: BridgeState.IDLE,
        appId: 'unknown',
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

        // Proactively attempt to send a minimal NEWDTRADER_BRIDGE_AUTH handshake
        // to help cross-origin iframes that initialize listeners after load.
        (async () => {
            try {
                const session = sessionManager.getSession();
                let loginid = session?.loginid || localStorage.getItem('active_loginid') || localStorage.getItem('client.loginid') || '';
                const token = await resolveValidDerivWSToken(loginid);
                const tokenPresent = !!token && !String(token).startsWith('ory_at_');

                const payload = {
                    type: 'NEWDTRADER_BRIDGE_AUTH',
                    status: tokenPresent ? 'success' : 'pending',
                    tokenPresent,
                    loginid: loginid || null,
                    loginId: loginid || null,
                    appId: Number(session?.appId || '121856') || 121856,
                    server: 'green',
                    timestamp: Date.now(),
                    authMode: tokenPresent ? 'derivws_otp' : 'derivws_otp',
                };

                if (this.iframeWindow) {
                    try {
                        this.logger.debug('PROACTIVE_HANDSHAKE', { loginid, tokenPresent });
                        this.iframeWindow.postMessage(payload, this.iframeOrigin === '*' ? '*' : this.iframeOrigin);
                    } catch (e) {
                        this.logger.debug('PROACTIVE_HANDSHAKE_ERROR', { error: String(e) });
                    }
                }
            } catch (e) {
                // ignore
            }
        })();

        // The state will stay in LOADING_IFRAME or WAITING_READY until the iframe replies with BRIDGE_READY
        setTimeout(() => {
            if (this.stateMachine.getState() === BridgeState.LOADING_IFRAME) {
                this.stateMachine.transitionTo(BridgeState.WAITING_READY);
            }
        }, 500);
    }

    public detach() {
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
        const appId = session?.appId || 'unknown';
        this.diagnostics.appId = appId;

        const msg = createMessage(type, appId, 'parent', payload);
        this.logMessage('out', msg);
        this.logger.messageSent(this.iframeOrigin, msg.type as string);
        try {
            this.iframeWindow.postMessage(msg, this.iframeOrigin === '*' ? '*' : this.iframeOrigin);
        } catch (error) {
            console.error('[ParentBridge] Failed to send message', error);
        }
    }

    private sanitizeOrigin(url: string): string {
        if (!url || url === '*') return '*';
        try {
            return new URL(url).origin;
        } catch {
            return url;
        }
    }

    private handleMessage = (event: MessageEvent) => {
        const expectedOrigin = this.sanitizeOrigin(this.iframeOrigin);
        const allowedOrigins = [
            expectedOrigin,
            'https://dtraderphub.vercel.app',
            'https://deriv-dtrader.vercel.app',
            'https://trader.deriv.com',
            'https://app.deriv.com',
            window.location.origin,
        ];

        if (this.iframeOrigin !== '*' && !allowedOrigins.includes(event.origin)) {
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

        const msgType = parsedData.type || parsedData.action || parsedData.event || '';
        const handshakeEvents = [BridgeEvent.BRIDGE_READY, BridgeEvent.REQUEST_SESSION, 'PING', 'HANDSHAKE_REQUEST'];
        const isHandshake = handshakeEvents.includes(msgType as BridgeEvent | string);

        if (isHandshake) {
            this.logger.debug('HANDSHAKE_EVENT', { origin: event.origin, type: msgType });
            this.handleBridgeReady();
            this.handleSessionRequest();

            if (event.source && typeof (event.source as Window).postMessage === 'function') {
                (async () => {
                    try {
                        const session = sessionManager.getSession();
                        let loginid = session?.loginid || localStorage.getItem('active_loginid') || localStorage.getItem('client.loginid') || '';
                        const token = await resolveValidDerivWSToken(loginid);
                        const tokenPresent = !!token && !token.startsWith('ory_at_');

                        if (loginid && tokenPresent) {
                            const handshakePayload = {
                                type: 'NEWDTRADER_BRIDGE_AUTH',
                                status: 'success',
                                tokenPresent: true,
                                loginid,
                                loginId: loginid,
                                appId: Number(session?.appId || '121856') || 121856,
                                server: 'green',
                                timestamp: Date.now(),
                                authMode: 'derivws_otp',
                                accountType: 'ZOOM',
                                bt_secret: 'binarytool',
                                theme: 'dark',
                                payload: { loginid, currency: 'USD' },
                            };

                            this.logger.debug('HANDSHAKE_SEND', { loginid, tokenPresent: true });
                            (event.source as Window).postMessage(handshakePayload, '*');
                            const handshakeResponse = {
                                type: 'HANDSHAKE_RESPONSE',
                                status: handshakePayload.status,
                                tokenPresent: handshakePayload.tokenPresent,
                                loginid: handshakePayload.loginid,
                                loginId: handshakePayload.loginId,
                                appId: handshakePayload.appId,
                                server: handshakePayload.server,
                                timestamp: handshakePayload.timestamp,
                                authMode: handshakePayload.authMode,
                                accountType: handshakePayload.accountType,
                                bt_secret: handshakePayload.bt_secret,
                                theme: handshakePayload.theme,
                                payload: handshakePayload.payload,
                            };
                            const bridgeAuthSuccess = {
                                type: 'BRIDGE_AUTH_SUCCESS',
                                status: handshakePayload.status,
                                tokenPresent: handshakePayload.tokenPresent,
                                loginid: handshakePayload.loginid,
                                loginId: handshakePayload.loginId,
                                appId: handshakePayload.appId,
                                server: handshakePayload.server,
                                timestamp: handshakePayload.timestamp,
                                authMode: handshakePayload.authMode,
                                accountType: handshakePayload.accountType,
                                bt_secret: handshakePayload.bt_secret,
                                theme: handshakePayload.theme,
                                payload: handshakePayload.payload,
                            };
                            (event.source as Window).postMessage(handshakeResponse, '*');
                            (event.source as Window).postMessage(bridgeAuthSuccess, '*');
                        } else {
                            this.logger.debug('HANDSHAKE_SEND_MINIMAL', { loginid, tokenPresent: !!token });
                            const minimalPayload = {
                                type: 'NEWDTRADER_BRIDGE_AUTH',
                                status: 'pending',
                                loginid: loginid || null,
                                appId: Number(session?.appId || '121856') || 121856,
                                timestamp: Date.now(),
                                authMode: 'derivws_otp',
                            };
                            (event.source as Window).postMessage(minimalPayload, '*');
                            const handshakeResponse = {
                                type: 'HANDSHAKE_RESPONSE',
                                status: minimalPayload.status,
                                loginid: minimalPayload.loginid,
                                appId: minimalPayload.appId,
                                timestamp: minimalPayload.timestamp,
                                authMode: minimalPayload.authMode,
                            };
                            (event.source as Window).postMessage(handshakeResponse, '*');
                        }
                    } catch (e) {
                        this.logger.debug('HANDSHAKE_ERROR', { error: String(e) });
                    }
                })();
            }
        }

        if (!isValidBridgeMessage(parsedData)) {
            return;
        }

        if (parsedData.source !== 'iframe') {
            return; // Ignore messages not from iframe
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
                // Iframe logged out, sync parent
                this.stateMachine.transitionTo(BridgeState.LOGGED_OUT);
                break;
            case BridgeEvent.ERROR:
                this.diagnostics.lastError = parsedData.payload?.message || 'Unknown Error';
                break;
        }
    };

    private handleBridgeReady() {
        if (this.stateMachine.transitionTo(BridgeState.READY)) {
            this.handleSessionRequest(); // Preemptively send session
        }
    }

    private handleSessionRequest() {
        let session = sessionManager.getSession();

        if (!session) {
            let loginid = localStorage.getItem('active_loginid') || localStorage.getItem('client.loginid') || '';
            let token = getActiveToken() || localStorage.getItem('token') || localStorage.getItem('authToken') || '';
            const accountsList = getAccountsList();

            if (!loginid || !token || token.startsWith('ory_at_')) {
                const keys = Object.keys(accountsList);
                for (const k of keys) {
                    if (accountsList[k] && !accountsList[k].startsWith('ory_at_')) {
                        loginid = k;
                        token = accountsList[k];
                        break;
                    }
                }
            }

            if (loginid && token && !token.startsWith('ory_at_')) {
                session = {
                    token,
                    loginid,
                    currency: 'USD',
                    isDemo: loginid.startsWith('VR'),
                    appId: '121856'
                };
            }
        }
        
        if (session) {
            this.diagnostics.sessionStatus = 'valid';
            this.diagnostics.appId = session.appId || '121856';
            this.stateMachine.transitionTo(BridgeState.REQUESTING_SESSION);
            this.sendMessage(BridgeEvent.SESSION_DATA, session);
            
            this.stateMachine.transitionTo(BridgeState.AUTHENTICATING);
            this.sendMessage(BridgeEvent.AUTH_START, { timestamp: Date.now() });

            // Broadcast legacy and NewdtraderBridge payloads so iframe auth resolves immediately
            if (this.iframeWindow) {
                try {
                    const legacyPayload = {
                        token: session.token,
                        loginid: session.loginid,
                        loginId: session.loginid,
                        appId: Number(session.appId || '121856') || 121856,
                        server: 'green',
                        timestamp: Date.now(),
                        status: 'success',
                        authMode: 'derivws_otp',
                        accountType: 'ZOOM',
                        bt_secret: 'binarytool',
                        theme: 'dark'
                    };
                    // Surface masked session info in logs for diagnostics
                    try {
                        console.info(`[ParentBridge] Broadcasting session to iframe origin=${this.iframeOrigin} loginid=${session.loginid} token=${truncateToken(session.token)}`);
                    } catch (e) {
                        // ignore logging errors
                    }

                    const target = this.iframeOrigin === '*' ? '*' : this.iframeOrigin;
                    this.iframeWindow.postMessage({ type: 'AUTH_TOKEN', ...legacyPayload }, target);
                    this.iframeWindow.postMessage({ type: 'DERIV_AUTH', ...legacyPayload }, target);
                    this.iframeWindow.postMessage({ action: 'setToken', ...legacyPayload }, target);
                    this.iframeWindow.postMessage({ type: 'BRIDGE_READY', ...legacyPayload }, target);
                    this.iframeWindow.postMessage({ type: 'AUTH_SUCCESS', ...legacyPayload }, target);
                    this.iframeWindow.postMessage({ type: 'SESSION_DATA', payload: session }, target);
                } catch (e) {
                    console.error('[ParentBridge] Error broadcasting legacy auth:', e);
                }
            }
        } else {
            this.diagnostics.sessionStatus = 'none';
            // Do NOT send LOGOUT postMessage during startup to avoid unlogging iframe
        }
    }

    private handleSessionChange(session: SessionPayload | null) {
        if (!session) {
            this.diagnostics.sessionStatus = 'none';
            return;
        }
        this.diagnostics.sessionStatus = 'valid';
        if (this.stateMachine.getState() === BridgeState.CONNECTED) {
            this.stateMachine.transitionTo(BridgeState.SYNCING);
            this.sendMessage(BridgeEvent.ACCOUNT_CHANGED, session);
            this.sendMessage(BridgeEvent.SESSION_DATA, session);
            setTimeout(() => this.stateMachine.transitionTo(BridgeState.CONNECTED), 200);
        } else if (this.stateMachine.getState() === BridgeState.READY || this.stateMachine.getState() === BridgeState.WAITING_READY) {
            this.handleSessionRequest();
        }
    }

    private attemptRecovery() {
        if (this.reconnectAttempts < this.maxReconnects) {
            this.reconnectAttempts++;
            this.stateMachine.transitionTo(BridgeState.RECOVERING);
            
            const backoff = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
            console.log(`[ParentBridge] Attempting recovery in ${backoff}ms (Attempt ${this.reconnectAttempts})`);
            
            setTimeout(() => {
                this.stateMachine.transitionTo(BridgeState.WAITING_READY);
                // Ping iframe to see if it's there
                this.sendMessage(BridgeEvent.PING, { timestamp: Date.now() });
                
                // Retry auth after a short delay assuming iframe might have reloaded
                setTimeout(() => this.handleSessionRequest(), 500);
            }, backoff);
        } else {
            console.error('[ParentBridge] Max recovery attempts reached.');
        }
    }
}
