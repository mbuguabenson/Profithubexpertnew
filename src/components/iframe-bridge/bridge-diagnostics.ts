export type DebugData = { [key: string]: any };

const sanitize = (data: DebugData): DebugData => {
    const copy: DebugData = {};
    for (const k of Object.keys(data || {})) {
        if (/token|otp|secret|password|auth/i.test(k)) {
            // Replace sensitive fields with presence flag
            copy[`${k}Present`] = !!data[k];
        } else {
            copy[k] = data[k];
        }
    }
    return copy;
};

export const makeBridgeLogger = (instanceId: string) => {
    const bridgeDebug = (event: string, data: DebugData = {}) => {
        try {
            const safe = sanitize(data);
            // Keep the log concise and safe
            console.debug('[DTRADER-BRIDGE]', {
                timestamp: new Date().toISOString(),
                instanceId,
                event,
                ...safe,
            });
        } catch (e) {
            // noop
        }
    };

    return {
        debug: bridgeDebug,
        messageReceived: (origin: string, type?: string, action?: string) =>
            bridgeDebug('MESSAGE_RECEIVED', { origin, type, action }),
        messageSent: (targetOrigin: string, type?: string) => bridgeDebug('MESSAGE_SENT', { targetOrigin, type }),
        stateChange: (previousState: string, nextState: string, reason?: string) =>
            bridgeDebug('STATE_CHANGE', { previousState, nextState, reason }),
    };
};

export const generateInstanceId = (): string => {
    try {
        return (crypto as any).randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).slice(2, 10);
    } catch {
        return Math.random().toString(36).slice(2, 10);
    }
};

export default makeBridgeLogger;
