import { systemCenterStore, TApiRequest } from '@/stores/system-center-store';

/**
 * Initializes the global network interceptors to capture all REST/XHR traffic
 * for the System Operations Center Phase 4 API Inspector.
 */
export const initNetworkInterceptor = () => {
    // Prevent double initialization
    if ((window as any).__NETWORK_INTERCEPTOR_INIT__) return;
    (window as any).__NETWORK_INTERCEPTOR_INIT__ = true;

    // 1. Intercept Fetch
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        const start = performance.now();
        const requestUrl = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
        const method = typeof args[0] === 'string' ? (args[1]?.method || 'GET') : ((args[0] as Request).method || 'GET');

        try {
            const response = await originalFetch(...args);
            const duration = performance.now() - start;
            
            // Clone response to get size without consuming original body
            let size = 0;
            try {
                const clone = response.clone();
                const text = await clone.text();
                size = new Blob([text]).size;
            } catch (e) {
                // Ignore clone errors for opaque responses or streams
            }

            const reqLog: TApiRequest = {
                id: Math.random().toString(36).substr(2, 9),
                endpoint: requestUrl.split('?')[0],
                method: method.toUpperCase(),
                status: response.status,
                duration: Math.round(duration),
                size,
                timestamp: Date.now(),
                type: 'REST'
            };
            
            systemCenterStore.logApiRequest(reqLog);
            return response;
        } catch (error: any) {
            const duration = performance.now() - start;
            const reqLog: TApiRequest = {
                id: Math.random().toString(36).substr(2, 9),
                endpoint: requestUrl.split('?')[0],
                method: method.toUpperCase(),
                status: 0,
                duration: Math.round(duration),
                size: 0,
                timestamp: Date.now(),
                error: error?.message || 'Network Failure',
                type: 'REST'
            };
            systemCenterStore.logApiRequest(reqLog);
            throw error;
        }
    };

    // 2. Intercept XMLHttpRequest
    const XHR = XMLHttpRequest.prototype;
    const originalOpen = XHR.open;
    const originalSend = XHR.send;

    XHR.open = function(method: string, url: string | URL, ...rest: any[]) {
        (this as any)._method = method;
        (this as any)._url = url.toString();
        return originalOpen.apply(this, [method, url, ...rest] as any);
    };

    XHR.send = function(body?: Document | XMLHttpRequestBodyInit | null) {
        (this as any)._startTime = performance.now();

        this.addEventListener('load', function() {
            const duration = performance.now() - (this as any)._startTime;
            const reqLog: TApiRequest = {
                id: Math.random().toString(36).substr(2, 9),
                endpoint: (this as any)._url.split('?')[0],
                method: (this as any)._method.toUpperCase(),
                status: this.status,
                duration: Math.round(duration),
                size: this.responseText ? new Blob([this.responseText]).size : 0,
                timestamp: Date.now(),
                type: 'REST'
            };
            systemCenterStore.logApiRequest(reqLog);
        });

        this.addEventListener('error', function() {
            const duration = performance.now() - (this as any)._startTime;
            const reqLog: TApiRequest = {
                id: Math.random().toString(36).substr(2, 9),
                endpoint: (this as any)._url.split('?')[0],
                method: (this as any)._method.toUpperCase(),
                status: 0,
                duration: Math.round(duration),
                size: 0,
                timestamp: Date.now(),
                error: 'XHR Network Error',
                type: 'REST'
            };
            systemCenterStore.logApiRequest(reqLog);
        });

        this.addEventListener('timeout', function() {
            const duration = performance.now() - (this as any)._startTime;
            const reqLog: TApiRequest = {
                id: Math.random().toString(36).substr(2, 9),
                endpoint: (this as any)._url.split('?')[0],
                method: (this as any)._method.toUpperCase(),
                status: 0,
                duration: Math.round(duration),
                size: 0,
                timestamp: Date.now(),
                error: 'XHR Timeout',
                type: 'REST'
            };
            systemCenterStore.logApiRequest(reqLog);
        });

        return originalSend.apply(this, [body] as any);
    };
};
