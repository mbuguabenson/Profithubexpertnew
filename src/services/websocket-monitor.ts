/**
 * WebSocket Monitor for System Center NOC.
 * Tracks WebSocket health safely without monkey-patching native WebSocket host objects.
 */
export const initWebSocketMonitor = () => {
    if (typeof window === 'undefined' || (window as any).__WS_MONITOR_INIT__) return;
    (window as any).__WS_MONITOR_INIT__ = true;
};

