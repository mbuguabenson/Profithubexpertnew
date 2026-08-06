import { getAppId } from '@/components/shared/utils/config/config';

type TCallback = (data: any) => void;

class DerivWebSocket {
    private ws: WebSocket | null = null;
    private appId: string;
    private listeners: Map<string, Set<TCallback>> = new Map();
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private endpoint = 'wss://ws.derivws.com/websockets/v3';

    private pingInterval: ReturnType<typeof setInterval> | null = null;
    private reqIdCounter = 1;

    constructor(appId?: string) {
        this.appId = appId || getAppId();
    }

    public connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                if (this.ws) {
                    this.disconnect();
                }

                console.log(`[DerivWebSocket] Connecting with App ID: ${this.appId}`);
                this.ws = new WebSocket(`${this.endpoint}?app_id=${this.appId}`);

                this.ws.onopen = () => {
                    console.log('[DerivWebSocket] Connected');
                    this.reconnectAttempts = 0;
                    this.startKeepAlive();
                    resolve();
                };

                this.ws.onmessage = event => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.error) {
                            console.warn('[DerivWebSocket] Response error:', data.error);
                        }
                        const msgType = data.msg_type;
                        if (msgType && this.listeners.has(msgType)) {
                            this.listeners.get(msgType)?.forEach(callback => callback(data));
                        }
                    } catch (e) {
                        console.error('[DerivWebSocket] Failed to parse message:', e);
                    }
                };

                this.ws.onerror = error => {
                    if (this.ws) {
                        console.error('[DerivWebSocket] Error:', error);
                        reject(error);
                    }
                };

                this.ws.onclose = event => {
                    console.log('[DerivWebSocket] Disconnected', event.wasClean ? 'Cleanly' : 'Abruptly');
                    this.stopKeepAlive();
                    if (this.ws) {
                        this.handleReconnect();
                    }
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    private startKeepAlive() {
        this.stopKeepAlive();
        // 30s keepalive ping interval to keep socket active and detect early disconnects
        this.pingInterval = setInterval(() => {
            if (this.isConnected()) {
                this.send({ ping: 1 });
            }
        }, 30000);
    }

    private stopKeepAlive() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    private handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            // Exponential backoff capped at 30s + random jitter up to 1000ms
            const baseDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            const jitter = Math.floor(Math.random() * 1000);
            const delay = baseDelay + jitter;
            console.log(`[DerivWebSocket] Reconnecting in ${delay}ms (Attempt ${this.reconnectAttempts})`);
            setTimeout(() => this.connect(), delay);
        }
    }

    public disconnect(): void {
        this.stopKeepAlive();
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.onopen = null;
            this.ws.onerror = null;
            this.ws.onmessage = null;

            if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                this.ws.close();
            }
            this.ws = null;
        }
    }

    public subscribeTicks(symbol: string): void {
        this.send({
            ticks: symbol,
            subscribe: 1,
        });
    }

    public unsubscribeTicks(): void {
        this.send({
            forget_all: 'ticks',
        });
    }

    public send(message: any): void {
        if (this.isConnected()) {
            const reqWithId = {
                ...message,
                req_id: message.req_id || this.reqIdCounter++,
            };
            this.ws?.send(JSON.stringify(reqWithId));
        } else {
            console.warn('[DerivWebSocket] Cannot send message: Not connected');
        }
    }

    public subscribe(msgType: string, callback: TCallback): () => void {
        if (!this.listeners.has(msgType)) {
            this.listeners.set(msgType, new Set());
        }
        this.listeners.get(msgType)?.add(callback);

        return () => {
            this.listeners.get(msgType)?.delete(callback);
        };
    }

    public isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }
}

export default DerivWebSocket;
