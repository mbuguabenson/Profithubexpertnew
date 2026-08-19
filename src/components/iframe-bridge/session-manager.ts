import { SessionPayload } from './protocol';
import { V2GetActiveToken, V2GetActiveAccountId } from '@/external/bot-skeleton/services/api/appId';
import { getAppId } from '@/components/shared/utils/config/config';
import { getAccountsList, getActiveToken } from '@/utils/token-bridge';

const isInvalidToken = (token: string | null | undefined): boolean =>
    !token || token === 'null' || token === 'undefined' || token === 'a1-guest';

import { isDemoAccount } from '@/utils/account-helpers';

export class SessionManager {
    private listeners: Set<(session: SessionPayload | null) => void> = new Set();
    private checkInterval: NodeJS.Timeout | null = null;
    private lastSessionStr: string | null = null;

    constructor() {
        this.startMonitoring();
    }

    /**
     * Retrieves the current effective session data.
     * Does NOT override active loginid with demo account during login / session check.
     */
    public getSession(): SessionPayload | null {
        let loginid = V2GetActiveAccountId() || 
                      localStorage.getItem('active_loginid') || 
                      localStorage.getItem('client.loginid') || '';
        
        const accountsList = getAccountsList();

        let token = (loginid && accountsList[loginid] && !isInvalidToken(accountsList[loginid]))
            ? accountsList[loginid]
            : null;

        if (!token) {
            const activeToken = getActiveToken() || V2GetActiveToken();
            if (!isInvalidToken(activeToken)) {
                token = activeToken || null;
            }
        }

        if (!token) {
            const storedToken = localStorage.getItem('token') || localStorage.getItem('active_token') || localStorage.getItem('authToken');
            if (!isInvalidToken(storedToken)) {
                token = storedToken || null;
            }
        }

        if (!token) {
            const keys = Object.keys(accountsList);
            for (const key of keys) {
                if (!isInvalidToken(accountsList[key])) {
                    loginid = key;
                    token = accountsList[key];
                    break;
                }
            }
        }

        const appId = getAppId() || '121856';

        // Fallback loginid if empty
        if (!loginid && Object.keys(accountsList).length > 0) {
            loginid = Object.keys(accountsList)[0];
        }

        return {
            token: token || '',
            loginid: loginid || '',
            currency: localStorage.getItem('client.currency') || 'USD',
            isDemo: isDemoAccount(loginid),
            appId
        };
    }

    /**
     * Subscribe to session changes.
     */
    public subscribe(listener: (session: SessionPayload | null) => void) {
        this.listeners.add(listener);
        listener(this.getSession());
        return () => this.listeners.delete(listener);
    }

    /**
     * Manually refresh the session state and broadcast if changed.
     */
    public refreshSession() {
        const session = this.getSession();
        const str = JSON.stringify(session);
        if (str !== this.lastSessionStr) {
            this.lastSessionStr = str;
            this.listeners.forEach(l => l(session));
        }
    }

    private startMonitoring() {
        if (this.checkInterval) return;
        this.checkInterval = setInterval(() => {
            this.refreshSession();
        }, 3000);
    }

    public stopMonitoring() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }
}

export const sessionManager = new SessionManager();
