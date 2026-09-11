import { BridgeStateMachine, BridgeState } from './bridge-state-machine';
import { SessionManager as _SessionManager, sessionManager } from './session-manager';
import { BridgeEvent, BridgeMessage, createMessage, isValidBridgeMessage } from './protocol';
import { secureSessionService } from '@/services/secure-session.service';
import { getAppId } from '@/components/shared/utils/config/config';
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
        appId: getAppId() || '121856',
        parentOrigin: typeof window !== 'undefined' ? window.location.origin : 'unknown',
        iframeOrigin: 'unknown',
        sessionStatus: 'none',
        lastEvent: null,
        lastError: null,
        reconnects: 0,
        pendingMessages: 0,
        messageHistory: [],
    };

    private listeners: Set<() => void> = new Set();
    private sessionUnsubscribe: (() => void) | null = null;
    private activeTimeouts: Set<any> = new Set();

    private safeTimeout(fn: () => void, delay: number) {
        const id = setTimeout(() => {
            this.activeTimeouts.delete(id);
            if (!this.iframeWindow) return;
            fn();
        }, delay);
        this.activeTimeouts.add(id);
        return id;
    }

    constructor() {
        this.stateMachine = new BridgeStateMachine(BridgeState.IDLE);
        this.diagnostics.state = this.stateMachine.getState();
        this.instanceId = generateInstanceId();
        this.logger = makeBridgeLogger(this.instanceId);
        this.logger.debug('BRIDGE_INIT', {
            appId: this.diagnostics.appId,
            parentOrigin: this.diagnostics.parentOrigin,
        });

        this.stateMachine.subscribe(state => {
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

        this.sessionUnsubscribe = sessionManager.subscribe(session => {
            this.handleSessionChange(session);
        });

        // Proactively send auth handshakes to iframe continuously for 30s
        this.startProactiveAuthLoop();

        this.safeTimeout(() => {
            if (this.stateMachine.getState() === BridgeState.LOADING_IFRAME) {
                this.stateMachine.transitionTo(BridgeState.WAITING_READY);
            }
        }, 500);
    }

    /**
     * Sends AUTH_INIT to the iframe: loginid + expiresAt ONLY, NO raw token.
     * The iframe will reply with REQUEST_TOKEN, which triggers sendOTT().
     */
    private sendAuthInit() {
        if (!this.iframeWindow) return;
        const meta = secureSessionService.getSessionMeta();
        if (!meta?.loggedIn || !meta.loginid) return;

        const targetOrigin = this.iframeOrigin && this.iframeOrigin !== '*'
            ? this.iframeOrigin
            : '*';

        try {
            this.iframeWindow.postMessage({
                type:      'AUTH_INIT',
                source:    'parent',
                loginid:   meta.loginid,
                currency:  meta.currency,
                expiresAt: meta.expiresAt,
            }, targetOrigin);
        } catch (e) {
            this.logger.debug('AUTH_INIT_SEND_FAILED', { error: String(e) });
        }
    }

    /**
     * Fetches a One-Time Token from the server and posts it to the iframe.
     * Called when the iframe sends REQUEST_TOKEN.
     */
    private async sendOTT(targetWindow: Window, replyOrigin: string) {
        const ott = await secureSessionService.getOTT();
        if (!ott) {
            this.logger.debug('OTT_FETCH_FAILED', {});
            return;
        }
        const targetOrigin = replyOrigin && replyOrigin !== '*' ? replyOrigin : this.iframeOrigin;
        try {
            targetWindow.postMessage({ type: 'OTT', ott }, targetOrigin);
        } catch (e) {
            this.logger.debug('OTT_SEND_FAILED', { error: String(e) });
        }
    }


    private startProactiveAuthLoop() {
        if (this.retryIntervalId) clearInterval(this.retryIntervalId);

        let attempts = 0;
        const maxAttempts = 20; // ~5s @ 250ms

        const tryInit = () => {
            if (!this.iframeWindow) return;
            this.sendAuthInit();
        };

        tryInit();
        this.retryIntervalId = setInterval(() => {
            attempts++;
            if (!this.iframeWindow || attempts >= maxAttempts) {
                if (this.retryIntervalId) clearInterval(this.retryIntervalId);
                return;
            }
            tryInit();
        }, 250);
    }

    public detach() {
        if (this.retryIntervalId) {
            clearInterval(this.retryIntervalId);
            this.retryIntervalId = null;
        }
        this.activeTimeouts.forEach(id => clearTimeout(id));
        this.activeTimeouts.clear();
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
        return () => {
            this.listeners.delete(listener);
        };
    }

    private notifyDiagnosticListeners() {
        this.listeners.forEach(listener => {
            try {
                listener();
            } catch (e) {
                console.error(e);
            }
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
        const appId = session?.appId || getAppId() || '121856';
        this.diagnostics.appId = appId;

        const msg = createMessage(type, appId, 'parent', payload);
        this.logMessage('out', msg);
        this.logger.messageSent(this.iframeOrigin, msg.type as string);
        const origin = this.iframeOrigin && this.iframeOrigin !== '*' ? this.iframeOrigin : '*';
        try {
            this.iframeWindow.postMessage(msg, origin);
        } catch (error) {
            if (origin !== '*') {
                try {
                    this.iframeWindow.postMessage(msg, '*');
                } catch (fallbackErr) {
                    console.error('[ParentBridge] Failed to send message', fallbackErr);
                }
            } else {
                console.error('[ParentBridge] Failed to send message', error);
            }
        }
    }

    private handleMessage = (event: MessageEvent) => {
        // Prevent postMessage feedback loops from window itself
        if (!event.source || event.source === window) {
            return;
        }

        const allowedOrigins = [
            this.iframeOrigin,
            'https://deriv-dtrader.vercel.app',
            'https://trader.deriv.com',
            'https://app.deriv.com',
            'https://www.derivcircles.com',
            'https://analysisprofithub.vercel.app',
            'https://xenontool.netlify.app',
            'https://dcircles.netlify.app',
            'https://dcircles-six.vercel.app',
        ];

        const isAllowed =
            (this.iframeOrigin && this.iframeOrigin !== '*' && event.origin === this.iframeOrigin) ||
            allowedOrigins.some(o => o && o !== '*' && (event.origin === o || event.origin.startsWith(o))) ||
            /\.vercel\.app$/i.test(new URL(event.origin).hostname) ||
            /\.deriv\.com$/i.test(new URL(event.origin).hostname) ||
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

        // On ANY message from the iframe, reply with AUTH_INIT (no raw token)
        if (event.source && typeof (event.source as Window).postMessage === 'function') {
            const msgType = parsedData?.type || parsedData?.action || '';
            if (msgType === 'REQUEST_TOKEN') {
                // Iframe is explicitly asking for an OTT — fetch and relay it
                this.sendOTT(event.source as Window, event.origin);
            } else if (
                msgType === 'IFRAME_READY' || msgType === 'BRIDGE_READY' ||
                msgType === 'REQUEST_SESSION' || msgType === 'REQUEST_AUTH'
            ) {
                this.sendAuthInit();
            }
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
                this.safeTimeout(() => this.stateMachine.transitionTo(BridgeState.CONNECTED), 100);
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
        // Secure: send AUTH_INIT (loginid only) instead of raw session tokens
        this.sendAuthInit();
        this.stateMachine.transitionTo(BridgeState.AUTHENTICATING);
        this.sendMessage(BridgeEvent.AUTH_START, { timestamp: Date.now() });

        this.safeTimeout(() => {
            this.stateMachine.transitionTo(BridgeState.AUTHENTICATED);
            this.safeTimeout(() => {
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
        // Re-send AUTH_INIT when session changes (e.g. account switch)
        this.sendAuthInit();
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
