import React, { lazy, Suspense, useEffect, useState, useMemo } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSiteConfig } from '@/utils/supabase-copy';
import ChunkLoader from '@/components/loader/chunk-loader';
import { generateOAuthURL } from '@/components/shared';
import DesktopWrapper from '@/components/shared_ui/desktop-wrapper';
import Dialog from '@/components/shared_ui/dialog';
import MobileWrapper from '@/components/shared_ui/mobile-wrapper';
import Tabs from '@/components/shared_ui/tabs/tabs';
import TradingViewModal from '@/components/trading-view-chart/trading-view-modal';
import ProfihubModal from '@/components/profihub-analysis/profihub-modal';
import ProToolAiModal from '@/components/protool-ai/protool-ai-modal';
import { DBOT_TABS, TAB_IDS } from '@/constants/bot-contents';
import { api_base, updateWorkspaceName } from '@/external/bot-skeleton';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { isDbotRTL } from '@/external/bot-skeleton/utils/workspace';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { disableUrlParameterApplication, enableUrlParameterApplication, setupTradeTypeChangeListener } from '@/utils/blockly-url-param-handler';
import { checkAndShowTradeTypeModal, getModalState, handleTradeTypeCancel, handleTradeTypeConfirm, resetUrlParamProcessing, setModalStateChangeCallback } from '@/utils/trade-type-modal-handler';
import TradeTypeConfirmationModal from '@/components/trade-type-confirmation-modal';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import RunPanel from '../../components/run-panel';
import ChartModal from '../chart/chart-modal';
import Dashboard from '../dashboard';
import RunStrategy from '../dashboard/run-strategy';
import Scanner from '../bot-builder/scanner/scanner';
import { TabIcon } from './tab-icons';
import './main.scss';

const ChartWrapper = lazy(() => import('../chart/chart-wrapper'));

const TradingView = lazy(() => import('../tradingview'));
const AnalysisTools = lazy(() => import('../analysis-tool'));
const Signals = lazy(() => import('../signals'));
const ScannerPage = lazy(() => import('../scanner/scanner'));


const ManualTrading = lazy(() => import('../manual-trading'));
const EasyTool = lazy(() => import('../easy-tool'));
const MultiTrader = lazy(() => import('../multi-trader'));
const SignalCentrePage = lazy(() => import('../smart-trading/components/signal-centre-tab'));
const Marketkiller = lazy(() => import('../marketkiller'));
const MarketHunterPro = lazy(() => import('../market-hunter-pro'));
const TradingBots = lazy(() => import('../free-bots/trading-bots'));
const DTraderPage = lazy(() => import('../dtrader/index'));
const ProJournal = lazy(() => import('../pro-journal'));

import { TabErrorBoundary } from '@/components/shared/TabErrorBoundary';
import { initNetworkInterceptor } from '@/services/network-interceptor';
import { initWebSocketMonitor } from '@/services/websocket-monitor';

const AppWrapper = observer(() => {
    const { connectionStatus } = useApiBase();
    const store = useStore();

    const { dashboard, load_modal, run_panel, quick_strategy, summary_card, blockly_store } = store || {};
    const { is_loading = false } = blockly_store || {};
    const {
        active_tab = 0,
        active_tour = '',
        is_chart_modal_visible = false,
        is_trading_view_modal_visible = false,
        setActiveTab = () => {},
        setWebSocketState = () => {},
        setActiveTour = () => {},
        setTourDialogVisibility = () => {},
        setSystemCenterVisibility = () => {},
    } = dashboard || {};
    const { dashboard_strategies = [] } = load_modal || {};
    const {
        is_dialog_open = false,
        is_drawer_open = false,
        dialog_options = {},
        onCancelButtonClick,
        onCloseDialog,
        onOkButtonClick,
        stopBot = () => {},
    } = run_panel || {};
    const { is_open = false } = quick_strategy || {};
    const { cancel_button_text = '', ok_button_text = '', title = '', message = '', dismissable = false, is_closed_on_cancel = false } = (dialog_options as {
        [key: string]: string;
    }) || {};
    const { clear = () => {} } = summary_card || {};
    const { DASHBOARD, BOT_BUILDER } = DBOT_TABS;
    const init_render = React.useRef(true);
    const pollTimeoutId = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const hash = [
        'dashboard',
        'bot_builder',
        'chart',
        'trading_bots',
        'analysis_tool',
        'copy_trading',
        'tradingview',
        'signals',
        'auto_trades',
        'scanner',
        'manual_trading',
        'easy_tool',
        'signal_centre',
        'marketkiller',
        'multi_trader',
        'market_hunter_pro',
        'ai_compounding_engine',
        'dtrader',
        'ai_trading_engine',
        'dcircles',
        'account_center',
        'system_center',
        'pro_journal',
    ];
    const { isDesktop } = useDevice();
    const location = useLocation();
    const navigate = useNavigate();

    const [siteConfig, setSiteConfig] = useState(() => getSiteConfig());

    useEffect(() => {
        // Initialize NOC interceptors
        initNetworkInterceptor();
        initWebSocketMonitor();

        const handler = () => {
            setSiteConfig(getSiteConfig());
        };
        const handleOpenSystemCenter = () => setSystemCenterVisibility(true);
        const handleCloseSystemCenter = () => setSystemCenterVisibility(false);

        window.addEventListener('profithub_config_changed', handler);
        window.addEventListener('open_system_center', handleOpenSystemCenter);
        window.addEventListener('close_system_center', handleCloseSystemCenter);
        
        return () => {
            window.removeEventListener('profithub_config_changed', handler);
            window.removeEventListener('open_system_center', handleOpenSystemCenter);
            window.removeEventListener('close_system_center', handleCloseSystemCenter);
        };
    }, []);

    const [tradeTypeModalState, setTradeTypeModalState] = useState(getModalState());

    const getTradeTypeModalProps = () => {
        const { tradeTypeData } = tradeTypeModalState;

        return {
            is_visible: tradeTypeModalState.isVisible,
            trade_type_display_name: tradeTypeData?.displayName || '',
            current_trade_type: tradeTypeData?.currentTradeType
                ? `${tradeTypeData.currentTradeType.tradeTypeCategory}/${tradeTypeData.currentTradeType.tradeType}`
                : 'N/A',
            current_trade_type_display_name: tradeTypeData?.currentTradeTypeDisplayName || 'N/A',
            onConfirm: handleTradeTypeConfirm,
            onCancel: handleTradeTypeCancel,
        };
    };

    let tab_value: number | string = active_tab;
    const GetHashedValue = (tab: number) => {
        tab_value = location.hash?.split('#')[1];
        if (!tab_value) return tab;
        return Number(hash.indexOf(String(tab_value)));
    };
    const active_hash_tab = GetHashedValue(active_tab);

    React.useEffect(() => {
        setModalStateChangeCallback(new_state => {
            setTradeTypeModalState(new_state);
        });
    }, [is_loading]);

    React.useEffect(() => {
        resetUrlParamProcessing();
    }, [location.search]);

    React.useEffect(() => {
        if (connectionStatus !== CONNECTION_STATUS.OPENED) {
            const is_bot_running = document.getElementById('db-animation__stop-button') !== null;
            if (is_bot_running) {
                clear();
                stopBot();
                api_base.setIsRunning(false);
                setWebSocketState(false);
            }
        }
    }, [clear, connectionStatus, setWebSocketState, stopBot]);

    React.useEffect(() => {
        if (active_tab === BOT_BUILDER) {
            requestAnimationFrame(() => {
                disableUrlParameterApplication();
                setupTradeTypeChangeListener();

                const handleTradeTypeModal = () => {
                    checkAndShowTradeTypeModal(
                        () => {
                            enableUrlParameterApplication();
                        },
                        () => {}
                    );
                };

                if (!blockly_store.is_loading) {
                    setTimeout(() => {
                        handleTradeTypeModal();
                    }, 500);
                } else {
                    let pollAttempts = 0;
                    const maxPollAttempts = 10;

                    const checkBlocklyLoaded = () => {
                        if (!blockly_store.is_loading) {
                            handleTradeTypeModal();
                            return;
                        }

                        if (pollAttempts < maxPollAttempts) {
                            pollAttempts++;
                            pollTimeoutId.current = setTimeout(checkBlocklyLoaded, 500);
                        }
                    };

                    checkBlocklyLoaded();
                }
            });
        }

        return () => {
            if (pollTimeoutId.current) {
                clearTimeout(pollTimeoutId.current);
                pollTimeoutId.current = null;
            }
        };
    }, [active_tab, is_loading, blockly_store.is_loading]);

    React.useEffect(() => {
        if (is_open) {
            setTourDialogVisibility(false);
        }
        if (init_render.current) {
            setActiveTab(Number(active_hash_tab));
            if (!isDesktop) handleTabChange(Number(active_hash_tab));
            init_render.current = false;
        } else {
            const currentSearch = window.location.search;
            navigate(`${currentSearch}#${hash[active_tab] || hash[0]}`);
        }
        if (active_tour !== '') {
            setActiveTour('');
        }

        const mainElement = document.querySelector('.main__container');
        if (run_panel.is_drawer_open && !isDesktop) {
            document.body.style.overflow = 'hidden';
            if (mainElement instanceof HTMLElement) {
                mainElement.classList.add('no-scroll');
            }
        } else {
            document.body.style.overflow = '';
            if (mainElement instanceof HTMLElement) {
                mainElement.classList.remove('no-scroll');
            }
        }
    }, [active_tab, run_panel.is_drawer_open]);

    React.useEffect(() => {
        const trashcan_init_id = setTimeout(() => {
            if (active_tab === BOT_BUILDER && (Blockly as any)?.derivWorkspace?.trashcan) {
                const trashcanY = window.innerHeight - 250;
                let trashcanX;
                if (is_drawer_open) {
                    trashcanX = isDbotRTL() ? 380 : window.innerWidth - 460;
                } else {
                    trashcanX = isDbotRTL() ? 20 : window.innerWidth - 100;
                }
                (Blockly as any)?.derivWorkspace?.trashcan?.setTrashcanPosition(trashcanX, trashcanY);
            }
        }, 100);

        return () => {
            clearTimeout(trashcan_init_id);
        };
    }, [active_tab, is_drawer_open]);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (dashboard_strategies.length > 0) {
            timer = setTimeout(() => {
                updateWorkspaceName();
            });
        }
        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [dashboard_strategies, active_tab]);

    const handleTabChange = React.useCallback(
        (tab_index: number) => {
            setActiveTab(tab_index);
            const el_id = TAB_IDS[tab_index];
            if (el_id) {
                const el_tab = document.getElementById(el_id);
                setTimeout(() => {
                    el_tab?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                }, 10);
            }
        },
        [active_tab]
    );

    const handleLoginGeneration = async () => {
        const oauthUrl = await generateOAuthURL();
        if (oauthUrl) {
            window.location.replace(oauthUrl);
        } else {
            console.error('Failed to generate OAuth URL');
        }
    };

    const allTabDescriptors = useMemo(() => [
        {
            key: 'dashboard',
            id: 'id-dbot-dashboard',
            label: <TabIcon iconKey='dashboard' label='Dashboard' />,
            content: <TabErrorBoundary tabId='id-dbot-dashboard' tabName='Dashboard'><Dashboard handleTabChange={handleTabChange} /></TabErrorBoundary>
        },
        {
            key: 'bot_builder',
            id: 'id-bot-builder',
            label: <TabIcon iconKey='bot_builder' label='Bot Builder' />,
            content: null
        },
        {
            key: 'chart',
            id: is_chart_modal_visible || is_trading_view_modal_visible ? 'id-charts--disabled' : 'id-charts',
            label: <TabIcon iconKey='chart' label='Charts' />,
            content: (
                <TabErrorBoundary tabId='id-charts' tabName='Charts'>
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading chart...')} />}>
                        <ChartWrapper show_digits_stats={true} />
                    </Suspense>
                </TabErrorBoundary>
            )
        },
        {
            key: 'trading_bots',
            id: 'id-trading-bots',
            label: <TabIcon iconKey='trading_bots' label='Trading Bots' />,
            content: (
                <TabErrorBoundary tabId='id-trading-bots' tabName='Trading Bots'>
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading Trading Bots...')} />}>
                        <TradingBots />
                    </Suspense>
                </TabErrorBoundary>
            )
        },
        {
            key: 'analysis_tool',
            id: 'id-analysis-tool',
            label: <TabIcon iconKey='analysis_tool' label='Analysis Tool' />,
            content: (
                <TabErrorBoundary tabId='id-analysis-tool' tabName='Analysis Tool'>
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading Analysis Tool...')} />}>
                        <AnalysisTools />
                    </Suspense>
                </TabErrorBoundary>
            )
        },
        {
            key: 'tradingview',
            id: 'id-tradingview',
            label: <TabIcon iconKey='tradingview' label='TradingView' />,
            content: (
                <TabErrorBoundary tabId='id-tradingview' tabName='TradingView'>
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading TradingView...')} />}>
                        <TradingView />
                    </Suspense>
                </TabErrorBoundary>
            )
        },
        {
            key: 'signals',
            id: 'id-signals',
            label: <TabIcon iconKey='signals' label='Signals' />,
            content: (
                <TabErrorBoundary tabId='id-signals' tabName='Signals'>
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading Signals...')} />}>
                        <Signals />
                    </Suspense>
                </TabErrorBoundary>
            )
        },
        {
            key: 'scanner',
            id: 'id-scanner',
            label: <TabIcon iconKey='scanner' label='AI Strategy Scanner' />,
            content: (
                <TabErrorBoundary tabId='id-scanner' tabName='AI Strategy Scanner'>
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading Scanner...')} />}>
                        <ScannerPage />
                    </Suspense>
                </TabErrorBoundary>
            )
        },

        {
            key: 'manual_trading',
            id: 'id-manual-trading',
            label: <TabIcon iconKey='manual_trading' label='Manual Trading' />,
            content: (
                <TabErrorBoundary tabId='id-manual-trading' tabName='Manual Trading'>
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading Manual Trading...')} />}>
                        <ManualTrading />
                    </Suspense>
                </TabErrorBoundary>
            )
        },
        {
            key: 'easy_tool',
            id: 'id-easy-tool',
            label: <TabIcon iconKey='easy_tool' label='Easy Tool' />,
            content: (
                <TabErrorBoundary tabId='id-easy-tool' tabName='Easy Tool'>
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading Easy Tool...')} />}>
                        <EasyTool />
                    </Suspense>
                </TabErrorBoundary>
            )
        },
        {
            key: 'signal_centre',
            id: 'id-signal-centre',
            label: <TabIcon iconKey='signal_centre' label='Signal Centre' />,
            content: (
                <TabErrorBoundary tabId='id-signal-centre' tabName='Signal Centre'>
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading Signal Centre...')} />}>
                        <SignalCentrePage />
                    </Suspense>
                </TabErrorBoundary>
            )
        },
        {
            key: 'marketkiller',
            id: 'id-marketkiller',
            label: <TabIcon iconKey='marketkiller' label='Marketkiller' />,
            content: (
                <TabErrorBoundary tabId='id-marketkiller' tabName='Marketkiller'>
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading Marketkiller...')} />}>
                        <Marketkiller />
                    </Suspense>
                </TabErrorBoundary>
            )
        },
        {
            key: 'multi_trader',
            id: 'id-multi-trader',
            label: <TabIcon iconKey='multi_trader' label='Multi Trader' />,
            content: (
                <TabErrorBoundary tabId='id-multi-trader' tabName='Multi Trader'>
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading Multi Trader...')} />}>
                        <MultiTrader />
                    </Suspense>
                </TabErrorBoundary>
            )
        },
        {
            key: 'market_hunter_pro',
            id: 'id-market-hunter-pro',
            label: <TabIcon iconKey='market_hunter_pro' label='Market Hunter Pro' />,
            content: (
                <TabErrorBoundary tabId='id-market-hunter-pro' tabName='Market Hunter Pro'>
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading Market Hunter Pro...')} />}>
                        <MarketHunterPro />
                    </Suspense>
                </TabErrorBoundary>
            )
        },
        {
            key: 'dtrader',
            id: 'id-dtrader',
            label: <TabIcon iconKey='dtrader' label='DTrader' />,
            content: (
                <TabErrorBoundary tabId='id-dtrader' tabName='DTrader'>
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading DTrader...')} />}>
                        <DTraderPage />
                    </Suspense>
                </TabErrorBoundary>
            )
        },
        {
            key: 'pro_journal',
            id: 'id-pro-journal',
            label: <TabIcon iconKey='pro_journal' label='Pro Journal' />,
            content: (
                <TabErrorBoundary tabId='id-pro-journal' tabName='Pro Journal'>
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading Pro Journal...')} />}>
                        <ProJournal />
                    </Suspense>
                </TabErrorBoundary>
            )
        },
    ], [is_chart_modal_visible, is_trading_view_modal_visible, handleTabChange]);

    const activeTabsList = useMemo(() => {
        const list = [...allTabDescriptors];
        const configs = siteConfig.tabConfig || [];
        const orderMap = new Map<string, number>();
        const enabledMap = new Map<string, boolean>();

        configs.forEach(c => {
            orderMap.set(c.key, c.order);
            enabledMap.set(c.key, c.enabled);
        });

        return list
            .filter(tab => enabledMap.get(tab.key) !== false)
            .sort((a, b) => {
                const orderA = orderMap.has(a.key) ? orderMap.get(a.key)! : 99;
                const orderB = orderMap.has(b.key) ? orderMap.get(b.key)! : 99;
                return orderA - orderB;
            });
    }, [siteConfig, allTabDescriptors]);

    const currentTabKey = hash[active_hash_tab] ?? hash[0];
    const filteredActiveIndex = Math.max(0, activeTabsList.findIndex(t => t.key === currentTabKey));

    const handleFilteredTabChange = React.useCallback(
        (filteredIndex: number) => {
            const targetTab = activeTabsList[filteredIndex];
            if (targetTab) {
                const globalIndex = hash.indexOf(targetTab.key);
                if (globalIndex > -1) {
                    setActiveTab(globalIndex);
                    window.location.hash = targetTab.key;
                    const el_id = targetTab.id;
                    if (el_id) {
                        const el_tab = document.getElementById(el_id);
                        setTimeout(() => {
                            el_tab?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                        }, 10);
                    }
                }
            }
        },
        [activeTabsList, setActiveTab]
    );

    if (!store) return null;

    return (
        <React.Fragment>
            <div className='main'>
                <div
                    className={classNames('main__container', {
                        'main__container--active': active_tour && active_tab === DASHBOARD && !isDesktop,
                        'main__container--drawer-open': isDesktop && is_drawer_open && active_tab !== DBOT_TABS.MANUAL_TRADING && active_tab !== DBOT_TABS.DASHBOARD && active_tab !== DBOT_TABS.DTRADER && active_tab !== DBOT_TABS.ACCOUNT_CENTER,
                    })}
                >
                    <div style={{ height: '100%', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <Tabs active_index={filteredActiveIndex} className='main__tabs' onTabItemClick={handleFilteredTabChange} history={window.history as any} top>
                            {activeTabsList.map(tab => (
                                <div key={tab.key} label={tab.label} id={tab.id} style={{ height: '100%', overflowY: 'auto' }}>
                                    {tab.content}
                                </div>
                            ))}
                        </Tabs>
                    </div>
                </div>
            </div>
            <DesktopWrapper>
                <div className='main__run-strategy-wrapper'>
                    {active_tab !== DBOT_TABS.TRADING_BOTS && active_tab !== DBOT_TABS.MANUAL_TRADING && active_tab !== DBOT_TABS.DASHBOARD && active_tab !== DBOT_TABS.DTRADER && active_tab !== DBOT_TABS.ACCOUNT_CENTER && <RunStrategy />}
                    {active_tab !== DBOT_TABS.MANUAL_TRADING && active_tab !== DBOT_TABS.DASHBOARD && active_tab !== DBOT_TABS.DTRADER && active_tab !== DBOT_TABS.ACCOUNT_CENTER && <RunPanel />}
                </div>
            </DesktopWrapper>
            <MobileWrapper>
                {!is_open && active_tab !== DBOT_TABS.MANUAL_TRADING && active_tab !== DBOT_TABS.DASHBOARD && active_tab !== DBOT_TABS.DTRADER && active_tab !== DBOT_TABS.ACCOUNT_CENTER && <RunPanel />}
            </MobileWrapper>

            <ChartModal />
            <TradingViewModal />
            <ProfihubModal />
            <ProToolAiModal />

            <Dialog
                cancel_button_text={cancel_button_text || localize('Cancel')}
                className='dc-dialog__wrapper--fixed'
                confirm_button_text={ok_button_text || localize('Ok')}
                has_close_icon
                is_mobile_full_width={false}
                is_visible={is_dialog_open}
                onCancel={onCancelButtonClick || undefined}
                onClose={onCloseDialog}
                onConfirm={onOkButtonClick || onCloseDialog}
                portal_element_id='modal_root'
                title={title}
                login={handleLoginGeneration}
                dismissable={dismissable as unknown as boolean}
                is_closed_on_cancel={is_closed_on_cancel as unknown as boolean}
            >
                {message}
            </Dialog>
            <TradeTypeConfirmationModal
                is_visible={getTradeTypeModalProps().is_visible}
                trade_type_display_name={getTradeTypeModalProps().trade_type_display_name}
                current_trade_type={getTradeTypeModalProps().current_trade_type}
                current_trade_type_display_name={getTradeTypeModalProps().current_trade_type_display_name}
                onConfirm={getTradeTypeModalProps().onConfirm}
                onCancel={getTradeTypeModalProps().onCancel}
            />
            <Scanner />
        </React.Fragment>
    );
});

export default AppWrapper;
