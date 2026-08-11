import type { RefObject } from 'react';
import { resolveValidDerivWSToken } from '@/utils/token-bridge';

/**
 * IframeAuthService
 * - Centralizes postMessage handshake retries for the embedded DTrader iframe
 * - Calls the provided `syncSession(includeToken: boolean)` to send session/auth payloads
 * - Listens for iframe requests and auth-success signals to cancel retries
 */
export class IframeAuthService {
    private iframeRef: RefObject<HTMLIFrameElement>;
    private syncSession: (includeToken?: boolean) => Promise<void>;
    private logger: any;
    private running = false;
    private retryTimers: number[] = [];
    private attempt = 0;
    private readonly delays = [0, 100, 300, 600, 1200, 2500, 5000];

    constructor(
        iframeRef: RefObject<HTMLIFrameElement>,
        syncSession: (includeToken?: boolean) => Promise<void>,
        logger?: any,
    ) {
        this.iframeRef = iframeRef;
        this.syncSession = syncSession;
        this.logger = logger || console;
        this.onMessage = this.onMessage.bind(this);
    }

    start() {
        if (this.running) return;
        this.running = true;
        window.addEventListener('message', this.onMessage);
        this.scheduleNext();
        try { this.logger?.debug?.('IframeAuthService started'); } catch (e) {}
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        window.removeEventListener('message', this.onMessage);
        this.retryTimers.forEach(id => clearTimeout(id));
        this.retryTimers = [];
        try { this.logger?.debug?.('IframeAuthService stopped'); } catch (e) {}
    }

    private scheduleNext() {
        if (!this.running) return;
        const delay = this.delays[Math.min(this.attempt, this.delays.length - 1)];
        const timer = window.setTimeout(async () => {
            try {
                // Initial few attempts send minimal session (no token).
                const includeToken = this.attempt >= 2;
                try { this.logger?.debug?.('IframeAuthService posting handshake', { attempt: this.attempt, includeToken }); } catch (e) {}
                await this.syncSession(includeToken);
            } catch (e) {
                try { this.logger?.warn?.('IframeAuthService syncSession error', e); } catch (err) {}
            }
            this.attempt += 1;
            // stop after many attempts to avoid infinite loops
            if (this.attempt > 8) {
                try { this.logger?.warn?.('IframeAuthService giving up after max attempts'); } catch (e) {}
                this.stop();
                return;
            }
            this.scheduleNext();
        }, delay);
        this.retryTimers.push(timer as unknown as number);
    }

    private onMessage(event: MessageEvent) {
        if (!this.running) return;
        if (!event.data || typeof event.data !== 'object') return;
        const type = event.data.type || event.data.action;

        try { this.logger?.debug?.('IframeAuthService message received', { origin: event.origin, type }); } catch (e) {}

        // Common iframe requests that indicate it needs the session/token now.
        if (type === 'REQUEST_SESSION' || type === 'REQUEST_AUTH' || type === 'GET_SESSION' || type === 'CHECK_AUTH') {
            // Immediately send full session including token
            try { this.logger?.debug?.('IframeAuthService immediate syncSession(true)'); } catch (e) {}
            this.syncSession(true).catch(() => {});

            // Also attempt a direct legacy DERIV_AUTH post using OTP if available
            try {
                const token = await resolveValidDerivWSToken();
                const iframeWindow = this.iframeRef.current?.contentWindow;
                if (iframeWindow && token) {
                    const payload = { type: 'DERIV_AUTH', token, authMode: 'derivws_otp' };
                    try { this.logger?.debug?.('IframeAuthService posting direct DERIV_AUTH fallback', { tokenPrefix: String(token).slice(0, 8) }); } catch (e) {}
                    iframeWindow.postMessage(payload, '*');
                }
            } catch (e) {
                try { this.logger?.debug?.('IframeAuthService failed to post direct DERIV_AUTH', e); } catch (err) {}
            }

            return;
        }

        // If iframe signals auth success, stop retries
        if (type === 'AUTH_SUCCESS' || type === 'SESSION_ACK' || type === 'DERIV_AUTH_SUCCESS' || type === 'AUTH_OK') {
            try { this.logger?.debug?.('IframeAuthService detected auth success, stopping retries'); } catch (e) {}
            this.stop();
            return;
        }
    }
}

export default IframeAuthService;
