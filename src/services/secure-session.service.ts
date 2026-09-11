/**
 * secure-session.service.ts
 *
 * Client-side secure session manager.
 *
 * - Fetches session metadata (loginid, currency, expiresAt) from /api/session/meta
 *   using credentials: 'include' so the HttpOnly cookie is sent automatically.
 * - Never reads the raw OAuth token from localStorage.
 * - Manages silent token refresh 5 minutes before expiry.
 * - Provides getOTT() for the parent bridge to obtain a One-Time Token for the
 *   DTrader iframe without exposing the raw credential.
 * - Exposes an in-memory wsToken for the WebSocket authorize call, set only by the
 *   OTT redeem flow, never written to localStorage.
 */

type SessionMeta = {
    loggedIn: boolean;
    loginid: string;
    currency: string;
    account_type: string;
    expiresAt: number;
};

type Listener = (meta: SessionMeta | null) => void;

class SecureSessionService {
    private static instance: SecureSessionService | null = null;

    private meta: SessionMeta | null = null;
    private wsTokenInMemory: string | null = null;
    private listeners: Set<Listener> = new Set();
    private refreshTimer: ReturnType<typeof setTimeout> | null = null;
    private isFetching = false;

    private constructor() {}

    public static getInstance(): SecureSessionService {
        if (!SecureSessionService.instance) {
            SecureSessionService.instance = new SecureSessionService();
        }
        return SecureSessionService.instance;
    }

    /** Bootstrap: load metadata from server. Call once on app start. */
    public async init(): Promise<SessionMeta | null> {
        return this.fetchMeta();
    }

    /** Returns current session metadata (or null if not logged in). */
    public getSessionMeta(): SessionMeta | null {
        return this.meta;
    }

    /**
     * Returns an in-memory WebSocket token set by the iframe OTT redeem flow.
     * This is the ONLY place a WS token is held in the browser; it is never
     * written to localStorage.
     */
    public getWsToken(): string | null {
        return this.wsTokenInMemory;
    }

    /** Called by the iframe receiver after a successful OTT redeem. */
    public setWsToken(token: string): void {
        this.wsTokenInMemory = token;
    }

    /** Clears the in-memory WS token on logout. */
    public clearWsToken(): void {
        this.wsTokenInMemory = null;
    }

    /** Subscribe to session change events. Returns an unsubscribe function. */
    public subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /** Requests a One-Time Token from the server for the iframe. */
    public async getOTT(): Promise<string | null> {
        try {
            const res = await fetch('/api/session/iframe-token', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!res.ok) return null;
            const data = await res.json();
            return data?.ott || null;
        } catch {
            return null;
        }
    }

    /** Force refresh the server session (called on 401 or near expiry). */
    public async refresh(): Promise<SessionMeta | null> {
        try {
            const res = await fetch('/api/session/refresh', {
                method: 'POST',
                credentials: 'include',
            });
            if (res.status === 401) {
                this.setMeta(null);
                return null;
            }
            const data: SessionMeta & { requiresLogin?: boolean } = await res.json();
            if (data.requiresLogin) {
                this.setMeta(null);
                return null;
            }
            const meta: SessionMeta = {
                loggedIn: true,
                loginid: data.loginid,
                currency: data.currency || 'USD',
                account_type: data.account_type || 'real',
                expiresAt: data.expiresAt,
            };
            this.setMeta(meta);
            this.scheduleRefresh(meta.expiresAt);
            return meta;
        } catch {
            return null;
        }
    }

    /** Log out: clear cookies server-side and wipe in-memory state. */
    public async logout(): Promise<void> {
        try {
            await fetch('/api/session', { method: 'DELETE', credentials: 'include' });
        } catch {}
        this.wsTokenInMemory = null;
        this.setMeta(null);
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
    }

    // ── Private ─────────────────────────────────────────────────────────────

    private async fetchMeta(): Promise<SessionMeta | null> {
        if (this.isFetching) return this.meta;
        this.isFetching = true;
        try {
            const res = await fetch('/api/session/meta', { credentials: 'include' });
            if (!res.ok) {
                this.setMeta(null);
                return null;
            }
            const data = await res.json() as SessionMeta;
            this.setMeta(data.loggedIn ? data : null);
            if (data.loggedIn && data.expiresAt) {
                this.scheduleRefresh(data.expiresAt);
            }
            return this.meta;
        } catch {
            this.setMeta(null);
            return null;
        } finally {
            this.isFetching = false;
        }
    }

    private setMeta(meta: SessionMeta | null): void {
        this.meta = meta;
        this.listeners.forEach(l => { try { l(meta); } catch {} });
    }

    /** Schedule a silent refresh 5 minutes before the token expires. */
    private scheduleRefresh(expiresAt: number): void {
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        const delay = expiresAt - Date.now() - 5 * 60 * 1000; // 5 min before expiry
        if (delay <= 0) {
            this.refresh();
            return;
        }
        this.refreshTimer = setTimeout(() => this.refresh(), delay);
    }
}

export const secureSessionService = SecureSessionService.getInstance();
export default secureSessionService;
