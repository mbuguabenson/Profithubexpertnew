/**
 * TraderApp Adapter
 * Adapts ProfitHub's rootStore, chart_api, and api_base into Deriv's TCoreStores and TWebSocket
 * so Deriv's original TraderApp runs natively with 100% original UI and layout.
 */

import { api_base } from '@/external/bot-skeleton';
import chart_api from '@/external/bot-skeleton/services/api/chart-api';
import type { TCoreStores } from '@deriv/stores/types';
import type { TWebSocket } from '@/external/trader/src/Types';

export function createTraderWSAdapter(): TWebSocket {
    const subCallbacks = new Map<string, (data: any) => void>();

    // Global listener for streaming messages
    const ensureListener = async () => {
        if (typeof chart_api.waitForConnection === 'function') {
            await chart_api.waitForConnection(5000);
        } else if (!chart_api.api) {
            await chart_api.init();
        }

        const api = chart_api.api || api_base.api;
        if (!api) return;

        api.onMessage?.().subscribe(({ data }: { data: any }) => {
            if (!data) return;

            const subId = data.subscription?.id;
            if (subId && subCallbacks.has(subId)) {
                try {
                    subCallbacks.get(subId)!(data);
                } catch (e) {
                    console.error('[TraderWSAdapter] Error in subscription callback:', e);
                }
            }

            // Also check message type subscriptions
            if (data.msg_type === 'proposal' && data.echo_req?.req_id) {
                const reqCallback = subCallbacks.get(data.echo_req.req_id);
                if (reqCallback) reqCallback(data);
            }
        });
    };

    ensureListener().catch(() => {});

    const getApi = async () => {
        if (chart_api.api?.connection?.readyState === WebSocket.OPEN) {
            return chart_api.api;
        }
        if (api_base.api?.connection?.readyState === WebSocket.OPEN) {
            return api_base.api;
        }
        if (typeof chart_api.waitForConnection === 'function') {
            await chart_api.waitForConnection(5000);
            return chart_api.api || api_base.api;
        }
        return chart_api.api || api_base.api;
    };

    const getActiveSymbolsData = async () => {
        if (api_base.active_symbols && api_base.active_symbols.length > 0) {
            return { active_symbols: api_base.active_symbols };
        }
        try {
            const api = await getApi();
            const res = await api?.send({ active_symbols: 'brief' });
            if (res?.active_symbols?.length) return res;
        } catch {}
        return { active_symbols: [] };
    };

    const ws: Record<string, any> = {
        authorized: {
            activeSymbols: async () => getActiveSymbolsData(),
            send: async (req: any) => {
                const api = await getApi();
                return api?.send(req);
            },
            subscribeProposalOpenContract: (contract_id: number, callback: (res: any) => void) => {
                ws.subscribeProposalOpenContract(contract_id, callback);
            },
        },
        storage: {
            contractsFor: async (symbol: string) => {
                const api = await getApi();
                return api?.send({ contracts_for: symbol });
            },
            send: async (req: any) => {
                const api = await getApi();
                return api?.send(req);
            },
        },
        activeSymbols: async () => getActiveSymbolsData(),
        contractsFor: async (symbol: string) => {
            const api = await getApi();
            return api?.send({ contracts_for: symbol });
        },
        buy: async (req: any) => {
            const api = await getApi();
            return api?.send(req);
        },
        contractUpdate: async (contract_id: number, limit_order: any) => {
            const api = await getApi();
            return api?.send({ contract_update: 1, contract_id, limit_order });
        },
        contractUpdateHistory: async (contract_id: number) => {
            const api = await getApi();
            return api?.send({ contract_update_history: 1, contract_id });
        },
        forget: async (id: string) => {
            if (subCallbacks.has(id)) subCallbacks.delete(id);
            const api = await getApi();
            return api?.send({ forget: id });
        },
        forgetAll: async (value: string) => {
            const api = await getApi();
            return api?.send({ forget_all: value });
        },
        forgetStream: (stream_id: string) => {
            if (subCallbacks.has(stream_id)) subCallbacks.delete(stream_id);
            getApi().then(api => api?.send({ forget: stream_id })).catch(() => {});
        },
        send: async (req: any) => {
            const api = await getApi();
            return api?.send(req);
        },
        subscribeProposal: async (req: any, callback: (res: any) => void) => {
            const api = await getApi();
            const reqId = `prop-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
            const payload = { ...req, proposal: 1, subscribe: 1, req_id: reqId };

            try {
                const res = await api?.send(payload);
                if (res?.subscription?.id) {
                    subCallbacks.set(res.subscription.id, callback);
                }
                subCallbacks.set(reqId, callback);
                if (res?.proposal) {
                    callback(res);
                }
                return res;
            } catch (err) {
                return { error: err };
            }
        },
        subscribeTicks: (symbol: string, callback: (res: any) => void) => {
            getApi().then(async api => {
                try {
                    const res = await api?.send({ ticks: symbol, subscribe: 1 });
                    if (res?.subscription?.id) {
                        subCallbacks.set(res.subscription.id, callback);
                    }
                    if (res?.tick) callback(res);
                } catch (e) {
                    console.warn('[TraderWSAdapter] subscribeTicks error:', e);
                }
            }).catch(() => {});
        },
        subscribeTicksHistory: async (req: any, callback: (res: any) => void) => {
            const api = await getApi();
            try {
                const res = await api?.send(req);
                if (res?.subscription?.id) {
                    subCallbacks.set(res.subscription.id, callback);
                }
                callback(res);
                return res;
            } catch (err) {
                return { error: err };
            }
        },
        subscribeProposalOpenContract: (contract_id: number, callback: (res: any) => void) => {
            getApi().then(async api => {
                try {
                    const res = await api?.send({ proposal_open_contract: 1, contract_id, subscribe: 1 });
                    if (res?.subscription?.id) {
                        subCallbacks.set(res.subscription.id, callback);
                    }
                    if (res?.proposal_open_contract) callback(res);
                } catch (e) {
                    console.warn('[TraderWSAdapter] subscribePOC error:', e);
                }
            }).catch(() => {});
        },
        time: async () => {
            const api = await getApi();
            try {
                const res = await api?.send({ time: 1 });
                if (res?.time) return res;
            } catch {}
            return { time: Math.floor(Date.now() / 1000) };
        },
        tradingTimes: async (date: string) => {
            const api = await getApi();
            return api?.send({ trading_times: date || 'today' });
        },
        wait: async (endpoint: string) => {
            if (endpoint === 'website_status') {
                try {
                    const api = await getApi();
                    const res = await api?.send({ website_status: 1 });
                    if (res?.website_status) return res;
                } catch {}
                return {
                    website_status: {
                        site_status: 'up',
                        currencies_config: {
                            USD: { type: 'fiat', fractional_digits: 2 },
                            AUD: { type: 'fiat', fractional_digits: 2 },
                            EUR: { type: 'fiat', fractional_digits: 2 },
                            GBP: { type: 'fiat', fractional_digits: 2 },
                        },
                    },
                };
            }
            if (endpoint === 'get_settings') {
                try {
                    const api = await getApi();
                    const res = await api?.send({ get_settings: 1 });
                    if (res?.get_settings) return res;
                } catch {}
                return {
                    get_settings: {
                        country_code: 'ke',
                        country: 'Kenya',
                    },
                };
            }
            if (endpoint === 'authorize') {
                if (api_base.is_authorized) return { authorize: api_base.account_info };
                return { authorize: {} };
            }
            try {
                const api = await getApi();
                return await api?.send({ [endpoint]: 1 });
            } catch {
                return { [endpoint]: {} };
            }
        },
    };

    return ws as unknown as TWebSocket;
}

export function createTraderCoreStoreAdapter(rootStore: any): TCoreStores {
    const isSocketOpen = Boolean(
        rootStore.common?.is_socket_opened ||
        chart_api.api?.connection?.readyState === WebSocket.OPEN ||
        api_base.api?.connection?.readyState === WebSocket.OPEN
    );

    const client = {
        ...rootStore.client,
        is_populating_account_list: false,
        is_switching: false,
        landing_company_shortcode: 'svg',
        default_currency: 'USD',
        is_virtual: Boolean(rootStore.client?.is_virtual),
        is_logged_in: Boolean(rootStore.client?.is_logged_in),
        is_single_logging_in: false,
        currency: rootStore.client?.currency || 'USD',
        balance: String(rootStore.client?.balance ?? '0'),
        loginid: rootStore.client?.loginid || '',
        is_eu: false,
        has_active_real_account: false,
        account_list: rootStore.client?.account_list || [],
        accounts: rootStore.client?.accounts || {},
    };

    const common = {
        ...rootStore.common,
        showError: (err: any) => console.warn('[TraderApp]', err),
        setSelectedContractType: () => {},
        is_network_online: true,
        network_status: { class: 'online', tooltip: 'Online' },
        server_time: { get: () => Math.floor(Date.now() / 1000) },
        has_error: false,
        error: {},
        current_language: rootStore.common?.current_language || 'en',
        is_socket_opened: isSocketOpen,
    };

    const ui = {
        ...rootStore.ui,
        populateHeaderExtensions: () => {},
        populateFooterExtensions: () => {},
        populateSettingsExtensions: () => {},
        setPromptHandler: () => {},
        toggleUrlUnavailableModal: () => {},
        is_dark_mode_on: Boolean(rootStore.ui?.is_dark_mode_on),
        is_mobile: false,
        is_tablet: false,
        is_chart_layout_default: true,
        is_positions_drawer_on: false,
        togglePositionsDrawer: () => {},
        notification_messages_ui: () => null,
        addNotificationMessage: () => {},
        removeNotificationMessage: () => {},
    };

    const core: Record<string, any> = {
        client,
        common,
        ui,
        modules: {
            cashier: {
                general_store: {
                    onMountCommon: () => {},
                    setAccountSwitchListener: () => {},
                },
            },
        },
        portfolio: {
            onMount: () => {},
            onUnmount: () => {},
            setContractType: () => {},
            active_positions: [],
            active_positions_count: 0,
            all_positions: [],
        },
        contract_trade: {
            has_crossed_accu_barriers: false,
            markers_array: [],
            updateChartType: () => {},
            updateGranularity: () => {},
        },
        contract_replay: {},
        chart_barrier_store: {},
        active_symbols: {},
        gtm: { pushData: () => {} },
        notifications: {},
    };

    return core as unknown as TCoreStores;
}
