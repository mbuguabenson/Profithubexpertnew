import { systemCenterStore, TWsMessage } from '@/stores/system-center-store';

/**
 * Global WebSocket Monkey-Patch wrapper.
 * Captures all WebSocket traffic to populate the NOC Phase 2 WS Monitor.
 */
export const initWebSocketMonitor = () => {
    if ((window as any).__WS_MONITOR_INIT__) return;
    (window as any).__WS_MONITOR_INIT__ = true;

    const OriginalWebSocket = window.WebSocket;

    class MonitoredWebSocket extends OriginalWebSocket {
        private pingInterval: any = null;
        private lastPingTime: number = 0;

        constructor(url: string | URL, protocols?: string | string[]) {
            super(url, protocols);

            this.addEventListener('open', () => {
                // If it's the main Deriv WS, report connected
                if (this.url.includes('deriv')) {
                    systemCenterStore.setWsConnectionState(true);
                    this.startPingLoop();
                }
            });

            this.addEventListener('close', () => {
                if (this.url.includes('deriv')) {
                    systemCenterStore.setWsConnectionState(false);
                    this.stopPingLoop();
                }
            });

            this.addEventListener('message', event => {
                let size = 0;
                let data = event.data;

                if (typeof event.data === 'string') {
                    size = event.data.length * 2;
                    try {
                        const parsed = JSON.parse(event.data);
                        data = parsed;

                        // Handle latency measurement from manual pings
                        if (parsed.msg_type === 'ping' && this.lastPingTime > 0) {
                            const latency = Math.round(performance.now() - this.lastPingTime);
                            systemCenterStore.updateWsLatency(latency);
                            this.lastPingTime = 0;
                        }

                        // Also track latency from server time responses
                        if (parsed.msg_type === 'time' && parsed.time) {
                            systemCenterStore.setServerTime(parsed.time);
                        }
                    } catch (e) {}
                } else if (event.data instanceof Blob) {
                    size = event.data.size;
                } else if (event.data instanceof ArrayBuffer) {
                    size = event.data.byteLength;
                }

                const msg: TWsMessage = {
                    id: Math.random().toString(36).substr(2, 9),
                    direction: 'IN',
                    type: typeof data === 'object' && data.msg_type ? data.msg_type : 'unknown',
                    size,
                    timestamp: Date.now(),
                    data,
                };
                systemCenterStore.logWsMessage(msg);
            });
        }

        send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
            // Always send first — the log must never block the actual WS message.
            super.send(data);

            try {
                let size = 0;
                let parsedData: any = data;

                if (typeof data === 'string') {
                    size = data.length * 2;
                    try {
                        parsedData = JSON.parse(data);
                    } catch (e) {}
                } else if (data instanceof Blob) {
                    size = data.size;
                } else if (data instanceof ArrayBuffer) {
                    size = data.byteLength;
                } else if (ArrayBuffer.isView(data)) {
                    size = data.byteLength;
                }

                const msg: TWsMessage = {
                    id: Math.random().toString(36).substr(2, 9),
                    direction: 'OUT',
                    type:
                        typeof parsedData === 'object' && Object.keys(parsedData)[0]
                            ? Object.keys(parsedData)[0]
                            : 'unknown',
                    size,
                    timestamp: Date.now(),
                    data: parsedData,
                };
                systemCenterStore.logWsMessage(msg);
            } catch (e) {
                // Log errors must never surface — WS communication is more important.
            }
        }

        private startPingLoop() {
            this.stopPingLoop();
            // Ping every 30 seconds to match Deriv's recommendation and measure true latency
            this.pingInterval = setInterval(() => {
                if (this.readyState === WebSocket.OPEN) {
                    this.lastPingTime = performance.now();
                    this.send(JSON.stringify({ ping: 1 }));
                }
            }, 30000);
        }

        private stopPingLoop() {
            if (this.pingInterval) clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    (window as any).WebSocket = MonitoredWebSocket;
};
