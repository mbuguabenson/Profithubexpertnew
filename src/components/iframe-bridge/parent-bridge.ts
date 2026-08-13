import { BridgeStateMachine, BridgeState } from './bridge-state-machine';
import { SessionManager as _SessionManager, sessionManager } from './session-manager';
import { BridgeEvent, BridgeMessage, createMessage, isValidBridgeMessage, SessionPayload } from './protocol';
import { getActiveToken, resolveValidDerivWSToken } from '@/utils/token-bridge';
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
        appId: '121856',
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

        // Proactively send NEWDTRADER_BRIDGE_AUTH & companion messages to iframe.
        // Retries for up to 30 seconds to handle slow Vercel bundle loading.
        this.startProactiveAuthLoop();

        setTimeout(() => {
            if (this.stateMachine.getState() === BridgeState.LOADING_IFRAME) {
                this.stateMachine.transitionTo(BridgeState.WAITING_READY);
            }
        }, 500);
    }

    private startProactiveAuthLoop() {
        if (this.retryIntervalId) {
            clearInterval(this.retryIntervalId);
        }

        let attempts = 0;
        const maxAttempts = 60; // 30 seconds @ 500ms interval

        const postAuth = async () => {
            if (!this.iframeWindow) return;
            try {
                const session = sessionManager.getSession();
                let loginid = session?.loginid || localStorage.getItem('active_loginid') || localStorage.getItem('client.loginid') || '';
                const token = await resolveValidDerivWSToken(loginid);
                const currency = session?.currency || localStorage.getItem('client.currency') || 'USD';
                const appIdStr = String(session?.appId || '121856');

                const payloadData = {
                    status: 'success',
                    tokenPresent: !!token && !String(token).startsWith('ory_at_'),
                    token: token || '',
                    loginid: loginid || null,
                    loginId: loginid || null,
                    acct1: loginid || null,
                    currency: currency,
                    cur1: currency,
                    accountType: 'ZOOM',
                    appId: Number(appIdStr) || 121856,
                    app_id: appIdStr,
                    server: 'green',
                    timestamp: Date.now(),
                    authMode: 'derivws_otp',
                    defaultSymbol: '1HZ100V',
                    embedBase: 'https://deriv-dtrader.vercel.app/dtrader',
                    payload: { loginid, currency },
                };

                const payloadMsg = createMessage('NEWDTRADER_BRIDGE_AUTH', appIdStr, 'parent', payloadData);

                // Use '*' so cross-origin delivery to iframe is guaranteed
                this.iframeWindow.postMessage(payloadMsg, '*');
                this.iframeWindow.postMessage({ type: 'NEWDTRADER_BRIDGE_AUTH', ...payloadData }, '*');
                this.iframeWindow.postMessage({ type: 'SESSION_DATA', ...payloadData }, '*');
                this.iframeWindow.postMessage({ type: 'DERIV_AUTH', ...payloadData }, '*');
                this.iframeWindow.postMessage({ type: 'AUTH_TOKEN', ...payloadData }, '*');
                this.iframeWindow.postMessage({ type: 'HANDSHAKE_RESPONSE', ...payloadData }, '*');
                this.iframeWindow.postMessage({ type: 'BRIDGE_AUTH_SUCCESS', ...payloadData }, '*');
                this.iframeWindow.postMessage({ action: 'setToken', ...payloadData }, '*');
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
        }, 500);
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
        const appId = session?.appId || '121856';
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
        const allowedOrigins = [
            'https://deriv-dtrader.vercel.app',
            'https://trader.deriv.com',
            'https://app.deriv.com',
            window.location.origin,
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

        // On ANY message from iframe window, immediately reply with auth handshake
        if (event.source && typeof (event.source as Window).postMessage === 'function') {
            (async () => {
                try {
                    const session = sessionManager.getSession();
                    let loginid = session?.loginid || localStorage.getItem('active_loginid') || localStorage.getItem('client.loginid') || '';
                    const token = await resolveValidDerivWSToken(loginid);
                    const currency = session?.currency || localStorage.getItem('client.currency') || 'USD';
                    const appIdStr = String(session?.appId || '121856');

                    const handshakePayloadObj = {
                        status: 'success',
                        tokenPresent: !!token && !String(token).startsWith('ory_at_'),
                        token: token || '',
                        loginid: loginid || null,
                        loginId: loginid || null,
                        acct1: loginid || null,
                        currency: currency,
                        cur1: currency,
                        accountType: 'ZOOM',
                        appId: Number(appIdStr) || 121856,
                        app_id: appIdStr,
                        server: 'green',
                        timestamp: Date.now(),
                        authMode: 'derivws_otp',
                        defaultSymbol: '1HZ100V',
                        embedBase: 'https://deriv-dtrader.vercel.app/dtrader',
                        payload: { loginid, currency },
                    };

                    const handshakePayloadMsg = createMessage('NEWDTRADER_BRIDGE_AUTH', appIdStr, 'parent', handshakePayloadObj);
                    const win = event.source as Window;
                    win.postMessage(handshakePayloadMsg, '*');
                    win.postMessage({ type: 'NEWDTRADER_BRIDGE_AUTH', ...handshakePayloadObj }, '*');
                    win.postMessage({ type: 'HANDSHAKE_RESPONSE', ...handshakePayloadObj }, '*');
                    win.postMessage({ type: 'BRIDGE_AUTH_SUCCESS', ...handshakePayloadObj }, '*');
                    win.postMessage({ type: 'SESSION_DATA', ...handshakePayloadObj }, '*');
                    win.postMessage({ type: 'DERIV_AUTH', ...handshakePayloadObj }, '*');
                    win.postMessage({ type: 'AUTH_TOKEN', ...handshakePayloadObj }, '*');
                    win.postMessage({ action: 'setToken', ...handshakePayloadObj }, '*');
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

    private handleSessionRequest() {
        const session = sessionManager.getSession();
        let loginid = session?.loginid || localStorage.getItem('active_loginid') || localStorage.getItem('client.loginid') || '';
        let token = session?.token || getActiveToken() || localStorage.getItem('token') || '';
        const currency = session?.currency || localStorage.getItem('client.currency') || 'USD';
        const appIdStr = String(session?.appId || '121856');

        this.diagnostics.sessionStatus = 'valid';
        this.diagnostics.appId = appIdStr;
        this.stateMachine.transitionTo(BridgeState.REQUESTING_SESSION);

        const payloadObj = {
            status: 'success',
            tokenPresent: !!token && !token.startsWith('ory_at_'),
            token: token || '',
            loginid: loginid || null,
            loginId: loginid || null,
            acct1: loginid || null,
            currency: currency,
            cur1: currency,
            accountType: 'ZOOM',
            appId: Number(appIdStr) || 121856,
            app_id: appIdStr,
            server: 'green',
            timestamp: Date.now(),
            authMode: 'derivws_otp',
            defaultSymbol: '1HZ100V',
            embedBase: 'https://deriv-dtrader.vercel.app/dtrader',
            payload: { loginid, currency },
        };

        this.sendMessage(BridgeEvent.SESSION_DATA, payloadObj);
        this.stateMachine.transitionTo(BridgeState.AUTHENTICATING);
        this.sendMessage(BridgeEvent.AUTH_START, { timestamp: Date.now() });

        if (this.iframeWindow) {
            try {
                this.iframeWindow.postMessage({ type: 'AUTH_TOKEN', ...payloadObj }, '*');
                this.iframeWindow.postMessage({ type: 'DERIV_AUTH', ...payloadObj }, '*');
                this.iframeWindow.postMessage({ action: 'setToken', ...payloadObj }, '*');
                this.iframeWindow.postMessage({ type: 'BRIDGE_READY', ...payloadObj }, '*');
                this.iframeWindow.postMessage({ type: 'AUTH_SUCCESS', ...payloadObj }, '*');
                this.iframeWindow.postMessage({ type: 'SESSION_DATA', ...payloadObj }, '*');
                this.iframeWindow.postMessage({ type: 'NEWDTRADER_BRIDGE_AUTH', ...payloadObj }, '*');
            } catch (e) {
                console.error('[ParentBridge] Error broadcasting legacy auth:', e);
            }
        }
    }

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
