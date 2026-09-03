export enum BridgeEvent {
    BRIDGE_READY = 'BRIDGE_READY',
    REQUEST_SESSION = 'REQUEST_SESSION',
    SESSION_DATA = 'SESSION_DATA',
    AUTH_START = 'AUTH_START',
    AUTH_SUCCESS = 'AUTH_SUCCESS',
    AUTH_FAILED = 'AUTH_FAILED',
    TOKEN_REFRESH = 'TOKEN_REFRESH',
    ACCOUNT_CHANGED = 'ACCOUNT_CHANGED',
    LOGOUT = 'LOGOUT',
    THEME_CHANGE = 'THEME_CHANGE',
    SYMBOL_CHANGE = 'SYMBOL_CHANGE',
    CONTRACT_PURCHASE_NOTIFY = 'CONTRACT_PURCHASE_NOTIFY',
    BALANCE_UPDATE = 'BALANCE_UPDATE',
    PING = 'PING',
    PONG = 'PONG',
    HEARTBEAT = 'HEARTBEAT',
    RECONNECT = 'RECONNECT',
    ERROR = 'ERROR',
}

export interface BridgeMessage<T = any> {
    id: string;
    type: BridgeEvent | string;
    timestamp: number;
    appId: string;
    source: 'parent' | 'iframe';
    payload: T;
}

export interface SessionPayload {
    token: string;
    loginid: string;
    currency?: string;
    isDemo?: boolean;
    appId?: string;
}

export interface ErrorPayload {
    code: string;
    message: string;
    details?: any;
}

/**
 * Validates whether an incoming postMessage event is a valid BridgeMessage.
 */
export const isValidBridgeMessage = (data: any): data is BridgeMessage => {
    return (
        data &&
        typeof data === 'object' &&
        typeof data.id === 'string' &&
        typeof data.type === 'string' &&
        typeof data.timestamp === 'number' &&
        typeof data.appId === 'string' &&
        (data.source === 'parent' || data.source === 'iframe')
    );
};

export const createMessage = <T>(
    type: BridgeEvent | string,
    appId: string,
    source: 'parent' | 'iframe',
    payload: T
): BridgeMessage<T> => {
    return {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
        type,
        timestamp: Date.now(),
        appId,
        source,
        payload,
    };
};
