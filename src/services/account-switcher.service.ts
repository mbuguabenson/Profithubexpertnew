/**
 * Instant Account Switcher Service
 * High-performance, zero-reload in-memory account switching.
 * - Instantly updates UI, stores, and local storage (0ms perceived delay)
 * - Seamlessly re-authorizes active WebSocket session without tearing down TCP/SSL connections
 * - Dispatches global sync events to update all open tabs and components
 */

import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import {
    setAuthData,
    setIsAuthorized,
    setIsAuthorizing,
} from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { getAccountsList } from '@/utils/token-bridge';
import { isDemoAccount } from '@/utils/account-helpers';

export class AccountSwitcherService {
    private static isSwitching = false;

    /**
     * Instantly switch the active account across the entire platform
     * @param targetLoginId The loginid to switch to (e.g. 'CR123456', 'VRTC987654')
     * @param clientStore Optional reference to MobX ClientStore
     */
    public static async switchAccount(targetLoginId: string, clientStore?: any): Promise<boolean> {
        if (!targetLoginId) return false;
        if (this.isSwitching) return false;

        this.isSwitching = true;

        try {
            console.log(`[AccountSwitcherService] Initiating instant switch to ${targetLoginId}...`);

            // 1. Update localStorage identifiers
            localStorage.setItem('active_loginid', targetLoginId);
            localStorage.setItem('client.loginid', targetLoginId);

            // 2. Resolve token for the target account
            const accountsList = getAccountsList();
            const targetToken = accountsList[targetLoginId] || '';

            if (targetToken) {
                localStorage.setItem('authToken', targetToken);
                localStorage.setItem('active_token', targetToken);
                localStorage.setItem('deriv_api_token', targetToken);
                localStorage.setItem('token', targetToken);
            }

            // 3. Resolve target account metadata from clientAccounts or accountsList
            let clientAccounts: Record<string, any> = {};
            try {
                const rawClientAccounts = localStorage.getItem('clientAccounts');
                if (rawClientAccounts) {
                    clientAccounts = JSON.parse(rawClientAccounts);
                }
            } catch {}

            const targetAccData = clientAccounts[targetLoginId] || {};
            const isVirtual = isDemoAccount(targetLoginId);
            const currency = targetAccData.currency || (isVirtual ? 'USD' : 'USD');
            const balance = Number(targetAccData.balance || 0);

            // 4. INSTANT OPTIMISTIC STORE UPDATES (0ms perceived UI latency)
            if (clientStore) {
                if (typeof clientStore.setLoginId === 'function') clientStore.setLoginId(targetLoginId);
                if (typeof clientStore.setBalance === 'function') clientStore.setBalance(String(balance));
                if (typeof clientStore.setCurrency === 'function') clientStore.setCurrency(currency);
                if (typeof clientStore.setIsVirtual === 'function') clientStore.setIsVirtual(isVirtual ? 1 : 0);
            }

            // Update RxJS connection status observables
            setAuthData({
                loginid: targetLoginId,
                currency,
                balance,
                is_virtual: isVirtual ? 1 : 0,
                email: targetAccData.email || '',
                fullname: targetAccData.fullname || '',
                landing_company_name: targetAccData.landing_company_name || 'svg',
                user_id: targetAccData.user_id || 0,
            } as any);

            setIsAuthorized(true);
            setIsAuthorizing(false);

            // 5. Broadcast global instant sync events for all listening components
            window.dispatchEvent(new CustomEvent('account_switched', { detail: { loginid: targetLoginId, currency, balance } }));
            window.dispatchEvent(new Event('currency_changed'));
            window.dispatchEvent(new Event('storage'));

            // 6. Seamless live WebSocket re-authorization over existing connection
            if (api_base.api && api_base.api.connection && api_base.api.connection.readyState === WebSocket.OPEN) {
                try {
                    if (targetToken && typeof api_base.api.authorize === 'function') {
                        // Fast path: Authorize on existing live connection (~50ms)
                        const res = await api_base.api.authorize(targetToken);
                        if (res?.authorize) {
                            console.log('[AccountSwitcherService] Live WebSocket authorized instantly:', res.authorize.loginid);
                            // Subscribe to balance stream
                            api_base.api.send({ balance: 1, subscribe: 1 }).catch(() => {});
                        }
                    } else {
                        // Fallback: Run authorizeAndSubscribe
                        await api_base.authorizeAndSubscribe();
                    }
                } catch (wsErr) {
                    console.warn('[AccountSwitcherService] Live authorize warning, reinitializing socket:', wsErr);
                    api_base.init(true).catch(() => {});
                }
            } else {
                // If socket not open, init
                api_base.init(true).catch(() => {});
            }

            return true;
        } catch (err) {
            console.error('[AccountSwitcherService] Error during switch:', err);
            return false;
        } finally {
            this.isSwitching = false;
        }
    }
}
