import { SessionPayload } from './protocol';
import { V2GetActiveToken, V2GetActiveAccountId } from '@/external/bot-skeleton/services/api/appId';
import { getAppId } from '@/components/shared/utils/config/config';

export class SessionManager {
    private listeners: Set<(session: SessionPayload | null) => void> = new Set();
    private checkInterval: NodeJS.Timeout | null = null;
    private lastSessionStr: string | null = null;

    constructor() {
        this.startMonitoring();
    }

    /**
     * Retrieves the current effective session data.
     */
    public getSession(): SessionPayload | null {
        let loginid = V2GetActiveAccountId() || 
                      localStorage.getItem('active_loginid') || 
                      localStorage.getItem('client.loginid') || '';
        
        let accountsList: Record<string, string> = {};
        try {
            accountsList = JSON.parse(localStorage.getItem('accountsList') || '{}');
        } catch (e) {
            // ignore parse error
        }

        let token = (loginid && accountsList[loginid]) ? accountsList[loginid] : V2GetActiveToken() || localStorage.getItem('token') || '';
        
        // If token is missing or starts with ory_at_, search accountsList for ANY valid WS token
        if (!token || token.startsWith('ory_at_')) {
            const accKeys = Object.keys(accountsList);
            for (const key of accKeys) {
                if (accountsList[key] && !accountsList[key].startsWith('ory_at_')) {
                    loginid = key;
                    token = accountsList[key];
                    break;
                }
            }
        }

        if (!token || token.startsWith('ory_at_')) {
            const altToken = localStorage.getItem('authToken') || localStorage.getItem('token');
            if (altToken && !altToken.startsWith('ory_at_')) {
                token = altToken;
            }
        }

        const isDemoToReal = localStorage.getItem('demo_to_real') === 'true';
        
        // Handling real/demo token alignment
        if (isDemoToReal && loginid && !loginid.startsWith('VR')) {
            try {
                const demoAccountId = Object.keys(accountsList).find(k => k.startsWith('VR'));
                if (demoAccountId) {
                    loginid = demoAccountId;
                    token = accountsList[demoAccountId] || token;
                }
            } catch (e) {
                console.warn('Error reading accountsList from localStorage', e);
            }
        }

        const appId = getAppId() || '114292';

        if (!loginid || !token) {
            return null;
        }

        return {
            token,
            loginid,
            currency: localStorage.getItem('client.currency') || 'USD', // simplistic fallback
            isDemo: loginid.startsWith('VR'),
            appId
        };
    }

    /**
     * Subscribe to session changes.
     */
    public subscribe(listener: (session: SessionPayload | null) => void) {
        this.listeners.add(listener);
        // Send initial state
        listener(this.getSession());
        return () => this.listeners.delete(listener);
    }

    /**
     * Manually refresh the session state and broadcast if changed.
     */
    public refreshSession() {
        const currentSession = this.getSession();
        const currentStr = currentSession ? JSON.stringify(currentSession) : null;

        if (currentStr !== this.lastSessionStr) {
            this.lastSessionStr = currentStr;
            this.notifyListeners(currentSession);
        }
    }

    public dispose() {
        this.stopMonitoring();
        this.listeners.clear();
    }

    private startMonitoring() {
        if (this.checkInterval) return;
        // Check for session changes every 1s
        this.checkInterval = setInterval(() => {
            this.refreshSession();
        }, 1000);

        // Also listen to storage events across tabs
        window.addEventListener('storage', this.handleStorageEvent);
    }

    private stopMonitoring() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        window.removeEventListener('storage', this.handleStorageEvent);
    }

    private handleStorageEvent = (e: StorageEvent) => {
        if (['active_loginid', 'token', 'accountsList', 'client.accounts'].includes(e.key || '')) {
            this.refreshSession();
        }
    };

    private notifyListeners(session: SessionPayload | null) {
        this.listeners.forEach(listener => {
            try {
                listener(session);
            } catch (err) {
                console.error('Error notifying session listener', err);
            }
        });
    }
}

// Singleton instance
export const sessionManager = new SessionManager();
