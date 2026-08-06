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

    private handleMessage = (event: MessageEvent) => {
        // Validation of origin can be relaxed or strict based on env. Let's do basic validation.
        if (this.iframeOrigin !== '*' && event.origin !== this.iframeOrigin && event.origin !== window.location.origin) {
            // Ignore messages from unknown origins
            return;
        }

        const data = event.data;
        if (!isValidBridgeMessage(data)) {
            // Ignore legacy or unformatted messages here unless we want backward compatibility
            return;
        }

        if (data.source !== 'iframe') {
            return; // Ignore messages not from iframe
        }

        this.logMessage('in', data);

        switch (data.type as BridgeEvent) {
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
                this.diagnostics.lastError = data.payload?.message || 'Authentication Failed';
                this.stateMachine.transitionTo(BridgeState.FAILED);
                this.attemptRecovery();
                break;
            case BridgeEvent.LOGOUT:
                // Iframe logged out, sync parent
                this.stateMachine.transitionTo(BridgeState.LOGGED_OUT);
                break;
            case BridgeEvent.ERROR:
                this.diagnostics.lastError = data.payload?.message || 'Unknown Error';
                break;
        }
    };

    private handleBridgeReady() {
        if (this.stateMachine.transitionTo(BridgeState.READY)) {
            this.handleSessionRequest(); // Preemptively send session
        }
    }

    private handleSessionRequest() {
        if (
            this.stateMachine.getState() !== BridgeState.READY &&
            this.stateMachine.getState() !== BridgeState.CONNECTED &&
            this.stateMachine.getState() !== BridgeState.AUTHENTICATED &&
            this.stateMachine.getState() !== BridgeState.WAITING_READY
        ) {
            return;
        }
        
        const session = sessionManager.getSession();
        
        if (session) {
            this.diagnostics.sessionStatus = 'valid';
            this.stateMachine.transitionTo(BridgeState.REQUESTING_SESSION);
            this.sendMessage(BridgeEvent.SESSION_DATA, session);
            
            this.stateMachine.transitionTo(BridgeState.AUTHENTICATING);
            this.sendMessage(BridgeEvent.AUTH_START, { timestamp: Date.now() });
        } else {
            this.diagnostics.sessionStatus = 'none';
            this.sendMessage(BridgeEvent.LOGOUT, {});
            this.stateMachine.transitionTo(BridgeState.LOGGED_OUT);
        }
    }

    private handleSessionChange(session: SessionPayload | null) {
        if (!session) {
            this.diagnostics.sessionStatus = 'none';
            this.sendMessage(BridgeEvent.LOGOUT, {});
            this.stateMachine.transitionTo(BridgeState.LOGGED_OUT);
        } else {
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
