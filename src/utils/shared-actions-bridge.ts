/**
 * Shared Actions Bridge for DTrader & Multi-App Communication
 * Implementing the @deriv-com/shared-actions protocol specification:
 * - SWITCH_ACCOUNT (sync active token, loginid, currency across frames)
 * - THEME_CHANGE (sync dark/light theme)
 * - CURRENCY_CHANGE (sync active display currency)
 * - SYMBOL_CHANGE (sync current active market)
 * - BALANCE_UPDATE (sync balance updates)
 */

export interface SharedActionMessage<T = any> {
    action:
        | 'SWITCH_ACCOUNT'
        | 'THEME_CHANGE'
        | 'CURRENCY_CHANGE'
        | 'SYMBOL_CHANGE'
        | 'BALANCE_UPDATE'
        | 'POPUP_ACTIONS'
        | 'INITIALIZE_AUTH';
    payload: T;
    source?: string;
}

export class SharedActionsBridge {
    private static channel: BroadcastChannel | null = null;
    private static listeners: Set<(message: SharedActionMessage) => void> = new Set();

    /**
     * Initialize the broadcast channel and window postMessage listeners
     */
    static initialize(): void {
        if (typeof window === 'undefined') return;

        if (!this.channel && 'BroadcastChannel' in window) {
            try {
                this.channel = new BroadcastChannel('deriv_shared_actions_channel');
                this.channel.onmessage = event => {
                    if (event.data?.action) {
                        this.notifyListeners(event.data);
                    }
                };
            } catch (e) {
                console.warn('[SharedActionsBridge] BroadcastChannel notice:', e);
            }
        }

        window.addEventListener('message', event => {
            if (event.data && typeof event.data === 'object' && event.data.action) {
                this.notifyListeners(event.data);
            }
        });
    }

    /**
     * Send shared action to embedded iframes and other tabs
     */
    static dispatch<T = any>(
        action: SharedActionMessage<T>['action'],
        payload: T,
        targetIframe?: HTMLIFrameElement | null
    ): void {
        const message: SharedActionMessage<T> = {
            action,
            payload,
            source: 'profithub-platform',
        };

        // 1. Send via BroadcastChannel
        try {
            if (this.channel) {
                this.channel.postMessage(message);
            }
        } catch {}

        // 2. Post to window
        try {
            window.postMessage(message, '*');
        } catch {}

        // 3. Post directly to target iframe
        if (targetIframe && targetIframe.contentWindow) {
            try {
                targetIframe.contentWindow.postMessage(message, '*');
            } catch {}
        }
    }

    /**
     * Subscribe to incoming shared actions
     */
    static subscribe(listener: (message: SharedActionMessage) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private static notifyListeners(message: SharedActionMessage): void {
        this.listeners.forEach(listener => {
            try {
                listener(message);
            } catch {}
        });
    }
}
