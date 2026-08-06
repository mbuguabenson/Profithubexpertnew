import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { ToastContainer } from 'react-toastify';
import AuthLoadingWrapper from '@/components/auth-loading-wrapper';
import useLiveChat from '@/components/chat/useLiveChat';
import ChunkLoader from '@/components/loader/chunk-loader';
import { getUrlBase } from '@/components/shared';
import TransactionDetailsModal from '@/components/transaction-details';
import { api_base, ApiHelpers, ServerTime } from '@/external/bot-skeleton';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useApiBase } from '@/hooks/useApiBase';
import useDevMode from '@/hooks/useDevMode';
import { useStore } from '@/hooks/useStore';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import { ThemeProvider } from '@deriv-com/quill-ui';
import { setSmartChartsPublicPath } from '@deriv-com/smartcharts-champion';
import Audio from '../components/audio';
import BlocklyLoading from '../components/blockly-loading';
import BotStopped from '../components/bot-stopped';
import BotBuilder from '../pages/bot-builder';
import Main from '../pages/main';
import { getBrandLabel } from '@/components/shared/utils/brand/brand';
import './app.scss';
import 'react-toastify/dist/ReactToastify.css';
import '../components/bot-notification/bot-notification.scss';

const AppContent = observer(() => {
    const [is_api_initialized, setIsApiInitialized] = React.useState(false);
    const [is_loading, setIsLoading] = React.useState(true);

    const store = useStore();
    const { app, transactions, common, client } = store;
    const { is_dark_mode_on } = useThemeSwitcher();
    const brandLabel = getBrandLabel();

    const { recovered_transactions, recoverPendingContracts } = transactions;
    const is_subscribed_to_msg_listener = React.useRef(false);
    const msg_listener = React.useRef(null);
    const activeSymbolsPoller = React.useRef({ intervalId: undefined, timeoutId: undefined });
    const { connectionStatus } = useApiBase();

    // Initialize dev mode keyboard shortcuts
    useDevMode();

    const livechat_client_information = {
        is_client_store_initialized: client?.is_logged_in ? true : !!client,
        is_logged_in: client?.is_logged_in,
        loginid: client?.loginid,
        currency: client?.currency,
        residence: client?.residence,
        email: '',
        first_name: '',
        last_name: '',
    };

    useLiveChat(livechat_client_information);

    // NOTE: Disabled Intercom until further notice
    // const token = V2GetActiveToken() ?? null;
    // useIntercom(token);

    useEffect(() => {
        if (connectionStatus === CONNECTION_STATUS.OPENED) {
            setIsApiInitialized(true);
            common.setSocketOpened(true);
        } else if (connectionStatus !== CONNECTION_STATUS.OPENED) {
            common.setSocketOpened(false);
        }
    }, [common, connectionStatus]);

    const { current_language } = common;
    const html = document.documentElement;
    React.useEffect(() => {
        html?.setAttribute('lang', current_language.toLowerCase());
        html?.setAttribute('dir', current_language.toLowerCase() === 'ar' ? 'rtl' : 'ltr');
    }, [current_language, html]);

    const handleMessage = React.useCallback(
        ({ data }) => {
            if (data?.msg_type === 'proposal_open_contract' && !data?.error) {
                const { proposal_open_contract } = data;
                if (
                    proposal_open_contract?.status !== 'open' &&
                    !recovered_transactions?.includes(proposal_open_contract?.contract_id)
                ) {
                    recoverPendingContracts(proposal_open_contract);
                }
            }
        },
        [recovered_transactions, recoverPendingContracts]
    );

    React.useEffect(() => {
        setSmartChartsPublicPath(getUrlBase('/js/smartcharts/'));
    }, []);

    React.useEffect(() => {
        // Check if api is initialized and then subscribe to the api messages
        // Also we should only subscribe to the messages once user is logged in
        // And is not already subscribed to the messages
        if (!is_subscribed_to_msg_listener.current && client.is_logged_in && is_api_initialized && api_base?.api) {
            is_subscribed_to_msg_listener.current = true;
            msg_listener.current = api_base.api.onMessage()?.subscribe(handleMessage);
        }
        return () => {
            if (is_subscribed_to_msg_listener.current && msg_listener.current) {
                is_subscribed_to_msg_listener.current = false;
                msg_listener.current.unsubscribe?.();
            }
        };
    }, [is_api_initialized, client.is_logged_in, client.loginid, handleMessage, connectionStatus]);

    const init = () => {
        ServerTime.init(common);
        app.setDBotEngineStores();
        ApiHelpers.setInstance(app.api_helpers_store);
        import('@/utils/gtm').then(({ default: GTM }) => {
            GTM.init(store);
        });
    };

    const changeActiveSymbolLoadingState = () => {
        init();

        const retrieveActiveSymbols = () => {
            const active_symbols = ApiHelpers?.instance?.active_symbols;
            if (!active_symbols || typeof active_symbols.retrieveActiveSymbols !== 'function') {
                console.warn('Active symbol service unavailable, continuing without blocking UI.');
                setIsLoading(false);
                return;
            }

            const fallbackTimeout = window.setTimeout(() => {
                console.warn('Active symbol retrieval timed out, continuing without blocking UI.');
                setIsLoading(false);
            }, 12000);

            try {
                active_symbols
                    .retrieveActiveSymbols(true)
                    .then(() => {
                        setIsLoading(false);
                    })
                    .catch(error => {
                        console.error('Active symbol retrieval failed:', error);
                        setIsLoading(false);
                    })
                    .finally(() => clearTimeout(fallbackTimeout));
            } catch (error) {
                console.error('Active symbol retrieval error:', error);
                clearTimeout(fallbackTimeout);
                setIsLoading(false);
            }
        };

        if (ApiHelpers?.instance?.active_symbols) {
            retrieveActiveSymbols();
        } else {
            activeSymbolsPoller.current.intervalId = window.setInterval(() => {
                if (ApiHelpers?.instance?.active_symbols) {
                    window.clearInterval(activeSymbolsPoller.current.intervalId);
                    retrieveActiveSymbols();
                }
            }, 1000);

            activeSymbolsPoller.current.timeoutId = window.setTimeout(() => {
                window.clearInterval(activeSymbolsPoller.current.intervalId);
                console.warn('Active symbol instance did not become available in time, continuing.');
                setIsLoading(false);
            }, 12000);

            return () => {
                if (activeSymbolsPoller.current.intervalId) {
                    window.clearInterval(activeSymbolsPoller.current.intervalId);
                }
                if (activeSymbolsPoller.current.timeoutId) {
                    window.clearTimeout(activeSymbolsPoller.current.timeoutId);
                }
            };
        }
    };

    React.useEffect(() => {
        let cleanup;

        if (is_api_initialized) {
            init();
            setIsLoading(true);
            if (!client.is_logged_in) {
                cleanup = changeActiveSymbolLoadingState();
            }
        }

        return () => {
            if (typeof cleanup === 'function') {
                cleanup();
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [is_api_initialized]);

    React.useEffect(() => {
        let cleanup;

        if (client.is_logged_in && is_api_initialized) {
            cleanup = changeActiveSymbolLoadingState();
        }

        return () => {
            if (typeof cleanup === 'function') {
                cleanup();
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [is_api_initialized, client.loginid]);

    React.useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            if (is_loading) {
                console.warn('App content loading timeout reached, rendering UI anyway.');
                setIsLoading(false);
            }
        }, 20000);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [is_loading]);

    if (common?.error) return null;

    return is_loading ? (
        <ChunkLoader message={`Initializing ${brandLabel} account...`} />
    ) : (
        <AuthLoadingWrapper>
            <ThemeProvider theme={is_dark_mode_on ? 'dark' : 'light'}>
                <BlocklyLoading />
                <div className='bot-dashboard bot' data-testid='dt_bot_dashboard'>
                    <Audio />
                    <Main />
                    <BotBuilder />
                    <BotStopped />
                    <TransactionDetailsModal />
                    <ToastContainer limit={3} draggable={false} />
                </div>
            </ThemeProvider>
        </AuthLoadingWrapper>
    );
});

export default AppContent;
