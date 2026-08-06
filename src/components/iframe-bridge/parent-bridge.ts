import { BridgeStateMachine, BridgeState } from './bridge-state-machine';
import { SessionManager as _SessionManager, sessionManager } from './session-manager';
import { BridgeEvent, BridgeMessage, createMessage, isValidBridgeMessage, SessionPayload } from './protocol';

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
        
        this.stateMachine.subscribe((state) => {
            this.diagnostics.state = state;
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
        
        this.stateMachine.transitionTo(BridgeState.LOADING_IFRAME);
        
        this.sessionUnsubscribe = sessionManager.subscribe((session) => {
            this.handleSessionChange(session);
        });

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
            'https://deriv-dtrader.vercel.app',
            'https://trader.deriv.com',
            'https://app.deriv.com',
            window.location.origin
        ];

        if (this.iframeOrigin !== '*' && !allowedOrigins.includes(event.origin)) {
            return;
        }

        const data = event.data;
        if (!data || (typeof data !== 'object' && typeof data !== 'string')) {
            return;
        }

        // Parse JSON string data if needed
        let parsedData = data;
        if (typeof data === 'string') {
            try {
                parsedData = JSON.parse(data);
            } catch {
                return;
            }
        }

        const msgType = parsedData.type || parsedData.action || parsedData.event || '';

        // Handle NewdtraderBridge or legacy iframe initiation requests
        if (
            msgType === 'BRIDGE_READY' ||
            msgType === 'INIT' ||
            msgType === 'init' ||
            msgType === 'REQUEST_SESSION' ||
            msgType === 'requestAuth' ||
            msgType === 'PING' ||
            msgType === 'get_session' ||
            msgType === 'CHECK_AUTH' ||
            msgType === 'NEWDTRADER_BRIDGE_INIT'
        ) {
            this.handleBridgeReady();
            this.handleSessionRequest();
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
            let token = localStorage.getItem('token') || localStorage.getItem('authToken') || '';
            let accountsList: Record<string, string> = {};
            try {
                accountsList = JSON.parse(localStorage.getItem('accountsList') || '{}');
            } catch {}
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
                    appId: '134205'
                };
            }
        }
        
        if (session) {
            this.diagnostics.sessionStatus = 'valid';
            this.diagnostics.appId = session.appId || '134205';
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
                        appId: Number(session.appId || '134205') || 134205,
                        server: 'green',
                        timestamp: Date.now(),
                        status: 'success',
                        authMode: 'derivws_otp',
                        accountType: 'ZOOM',
                        bt_secret: 'binarytool',
                        theme: 'dark'
                    };
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
