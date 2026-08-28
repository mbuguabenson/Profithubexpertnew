/**
 * High-Speed Instant Account Switcher Service
 * Zero-reload in-memory account switching with timeout guardrails.
 * - Instantly updates UI, stores, and local storage (0ms perceived latency)
 * - Seamlessly re-authorizes active WebSocket session without tearing down TCP/SSL connections
 * - Automatically falls back to background socket refresh if authorization times out (>2500ms)
 * - Dispatches global sync events to update all open tabs and components
 */

import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import {
    setAuthData,
    setIsAuthorized,
    setIsAuthorizing,
} from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { getAccountsList, getActiveToken } from '@/utils/token-bridge';
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
        if (this.isSwitching) {
            console.warn('[AccountSwitcherService] Switch already in progress, proceeding with latest target...');
        }

        this.isSwitching = true;

        try {
            console.log(`[AccountSwitcherService] Initiating high-speed switch to ${targetLoginId}...`);

            // 1. Update localStorage identifiers immediately
            localStorage.setItem('active_loginid', targetLoginId);
            localStorage.setItem('client.loginid', targetLoginId);

            // 2. Resolve token for the target account
            const accountsList = getAccountsList();
            let targetToken = accountsList[targetLoginId] || '';
            if (!targetToken) {
                targetToken = getActiveToken(targetLoginId) || getActiveToken() || '';
            }

            if (targetToken) {
                localStorage.setItem('authToken', targetToken);
                localStorage.setItem('active_token', targetToken);
                localStorage.setItem('deriv_api_token', targetToken);
                localStorage.setItem('token', targetToken);
            }

            // 3. Resolve target account metadata from clientAccounts or accountsList
            let clientAccounts: Record<string, any> = {};
            try {
                const rawClientAccounts = localStorage.getItem('client.accounts') || localStorage.getItem('clientAccounts');
                if (rawClientAccounts) {
                    clientAccounts = JSON.parse(rawClientAccounts);
                }
            } catch {}

            const targetAccData = clientAccounts[targetLoginId] || {};
            const isVirtual = isDemoAccount(targetLoginId);
            localStorage.setItem('account_type', isVirtual ? 'demo' : 'real');
            const currency = targetAccData.currency || (isVirtual ? 'USD' : 'USD');
            localStorage.setItem('active_currency', currency);
            const balance = Number(targetAccData.balance || 0);

            // 4. INSTANT OPTIMISTIC STORE UPDATES (0ms perceived UI latency)
            if (clientStore) {
                if (typeof clientStore.setLoginId === 'function') clientStore.setLoginId(targetLoginId);
                if (typeof clientStore.setBalance === 'function') clientStore.setBalance(String(balance));
                if (typeof clientStore.setCurrency === 'function') clientStore.setCurrency(currency);
                if (typeof clientStore.setIsVirtual === 'function') clientStore.setIsVirtual(isVirtual ? 1 : 0);
                if (typeof clientStore.setWebSocketLoginId === 'function') clientStore.setWebSocketLoginId(targetLoginId);
                if (typeof clientStore.setIsLoggedIn === 'function') clientStore.setIsLoggedIn(true);
            }

            api_base.account_info = {
                balance,
                currency,
                loginid: targetLoginId,
            };
            api_base.token = targetLoginId;

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
            window.dispatchEvent(new CustomEvent('account_switched', { detail: { loginid: targetLoginId, currency, balance, token: targetToken } }));
            window.dispatchEvent(new Event('currency_changed'));
            window.dispatchEvent(new Event('storage'));

            // 6. Seamless live WebSocket re-authorization with strict 2500ms timeout guard
            if (api_base.api && api_base.api.connection && api_base.api.connection.readyState === WebSocket.OPEN) {
                const authorizePromise = (async () => {
                    if (targetToken && typeof api_base.api.authorize === 'function') {
                        return api_base.api.authorize(targetToken);
                    }
                    return null;
                })();

                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('WebSocket authorize timeout (2500ms)')), 2500)
                );

                try {
                    const res: any = await Promise.race([authorizePromise, timeoutPromise]);
                    if (res?.authorize) {
                        console.log('[AccountSwitcherService] WebSocket authorized successfully for:', res.authorize.loginid);
                        api_base.account_info = {
                            balance: res.authorize.balance,
                            currency: res.authorize.currency,
                            loginid: res.authorize.loginid,
                        };
                        api_base.token = res.authorize.loginid;
                        api_base.is_authorized = true;

                        if (clientStore) {
                            if (typeof clientStore.setBalance === 'function') {
                                clientStore.setBalance(String(res.authorize.balance));
                            }
                            if (typeof clientStore.setCurrency === 'function') {
                                clientStore.setCurrency(res.authorize.currency);
                            }
                            if (typeof clientStore.setLoginId === 'function') {
                                clientStore.setLoginId(res.authorize.loginid);
                            }
                            if (res.authorize.account_list && typeof clientStore.setAccountList === 'function') {
                                clientStore.setAccountList(res.authorize.account_list);
                            }
                        }

                        // Subscribe to live balance & transaction stream on new account
                        api_base.api.send({ balance: 1, subscribe: 1 }).catch(() => {});
                        api_base.api.send({ transaction: 1, subscribe: 1 }).catch(() => {});
                    } else if (res?.error) {
                        console.warn('[AccountSwitcherService] Authorize error, refreshing socket in background:', res.error);
                        api_base.init(true).catch(() => {});
                    }
                } catch (timeoutOrWsErr: any) {
                    console.warn('[AccountSwitcherService] Fast authorize non-fatal notice:', timeoutOrWsErr?.message);
                    // Background socket refresh so user is never blocked
                    api_base.init(true).catch(() => {});
                }
            } else {
                // If socket not open, initialize in background
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
