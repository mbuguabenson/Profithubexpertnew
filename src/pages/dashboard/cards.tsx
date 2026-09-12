import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import GoogleDrive from '@/components/load-modal/google-drive';
import Dialog from '@/components/shared_ui/dialog';
import MobileFullPageModal from '@/components/shared_ui/mobile-full-page-modal';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import DashboardBotList from './bot-list/dashboard-bot-list';
import {
    TrendingUp,
    Bot,
    Cpu,
    Zap,
    BarChart3,
    ShieldCheck,
    ArrowUpRight,
    FolderPlus,
    Target,
    Radio,
    Sparkles,
    MessageCircle,
    Layers,
    Wand2,
    UserCheck
} from 'lucide-react';

type TCardProps = {
    has_dashboard_strategies: boolean;
    is_mobile: boolean;
};

const Cards = observer(({ is_mobile, has_dashboard_strategies }: TCardProps) => {
    const { dashboard, load_modal, client, quick_strategy } = useStore();
    const { toggleLoadModal, setActiveTabIndex } = load_modal;
    const { isDesktop } = useDevice();
    const { onCloseDialog, dialog_options, is_dialog_open, setActiveTab, setPreviewOnPopup } = dashboard;
    const { setFormVisibility } = quick_strategy;
    const { accountList, activeLoginid } = useApiBase();

    // Resolve active account details
    const activeAccount =
        accountList?.find(acc => acc.loginid === activeLoginid) ||
        client?.account_list?.find(acc => acc.loginid === (client?.loginid || activeLoginid));

    const accountName =
        activeAccount?.loginid ||
        client?.loginid ||
        activeLoginid ||
        localStorage.getItem('active_loginid') ||
        '';

    const isVirtual = Boolean(activeAccount?.is_virtual || client?.is_virtual || accountName.startsWith('VR'));

    const openFileLoader = () => {
        toggleLoadModal();
        setActiveTabIndex(is_mobile ? 0 : 1);
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    const handleOpenQuickStrategy = () => {
        setActiveTab(DBOT_TABS.BOT_BUILDER);
        setFormVisibility(true);
    };

    // ─── Top Row: 5 Compact Strategy Loading Cards in ONE Single Line ─────
    const loadingCards = [
        {
            id: 'bot-builder',
            title: 'Bot Builder',
            subtitle: 'Visual IDE workspace',
            icon: <Layers size={18} className='load-card__icon text-indigo' />,
            badge: 'IDE',
            theme: 'card--indigo',
            callback: () => setActiveTab(DBOT_TABS.BOT_BUILDER),
        },
        {
            id: 'quick-strategy',
            title: 'Quick Strategy',
            subtitle: 'Automated wizard',
            icon: <Wand2 size={18} className='load-card__icon text-cyan' />,
            badge: 'WIZARD',
            theme: 'card--cyan',
            callback: () => handleOpenQuickStrategy(),
        },
        {
            id: 'import-xml',
            title: 'Import XML',
            subtitle: 'Load local file/cloud',
            icon: <FolderPlus size={18} className='load-card__icon text-purple' />,
            badge: 'FILE',
            theme: 'card--purple',
            callback: () => openFileLoader(),
        },
        {
            id: 'free-bots',
            title: '24+ Free Bots',
            subtitle: 'Pre-loaded systems',
            icon: <Zap size={18} className='load-card__icon text-amber' />,
            badge: 'PRE-BUILT',
            theme: 'card--amber',
            callback: () => setActiveTab(DBOT_TABS.TRADING_BOTS),
        },
        {
            id: 'smart-trader',
            title: 'AI Smart Trader',
            subtitle: 'Live execution terminal',
            icon: <TrendingUp size={18} className='load-card__icon text-emerald' />,
            badge: 'LIVE',
            theme: 'card--emerald',
            callback: () => setActiveTab(DBOT_TABS.MANUAL_TRADING),
        },
    ];

    // ─── Secondary Modules: 4 Compact Quantitative Intelligence Cards ───
    const intelligenceModules = [
        {
            id: 'ai-engine',
            title: 'AI Trading Engine',
            desc: 'Neural entry scanner & high-probability signals',
            icon: <Cpu size={18} className='text-purple' />,
            callback: () => setActiveTab(DBOT_TABS.AI_TRADING_ENGINE),
        },
        {
            id: 'market-hunter',
            title: 'Market Hunter Pro',
            desc: 'Multi-symbol volatility pattern & trend alert suite',
            icon: <Target size={18} className='text-amber' />,
            callback: () => setActiveTab(DBOT_TABS.MARKET_HUNTER_PRO),
        },
        {
            id: 'signals',
            title: 'Market Radar & Signals',
            desc: 'Real-time digit flow, bias heatmap & momentum',
            icon: <Radio size={18} className='text-rose' />,
            callback: () => setActiveTab(DBOT_TABS.SIGNALS),
        },
        {
            id: 'charts',
            title: 'Live Interactive Charts',
            desc: 'High-speed ticks, indicators & barrier analysis',
            icon: <BarChart3 size={18} className='text-cyan' />,
            callback: () => setActiveTab(DBOT_TABS.CHART),
        },
    ];

    return React.useMemo(
        () => (
            <div
                className={classNames('dash-compact-cockpit', {
                    'dash-compact-cockpit--minimized': has_dashboard_strategies && is_mobile,
                })}
            >
                {/* ─── 1. Welcome Greeting Header Strip ───────────────────────── */}
                <div className='dash-welcome-strip'>
                    <div className='dash-welcome-strip__left'>
                        <div className='dash-welcome-avatar'>
                            <UserCheck size={18} />
                        </div>
                        <div className='dash-welcome-texts'>
                            <h1 className='dash-welcome-title'>
                                Welcome user{accountName ? ` (${accountName})` : ''}! Start your trading journey here.
                            </h1>
                            <p className='dash-welcome-sub'>
                                Institutional quantitative bot execution, AI market radar, and low-latency Deriv API trading.
                            </p>
                        </div>
                    </div>

                    <div className='dash-welcome-strip__right'>
                        {accountName && (
                            <span className={classNames('dash-pill-acc', isVirtual ? 'dash-pill-acc--demo' : 'dash-pill-acc--real')}>
                                {isVirtual ? 'DEMO' : 'REAL'} • {accountName}
                            </span>
                        )}
                        <div className='dash-pill-status'>
                            <span className='dash-live-dot' />
                            <span>API CONNECTED</span>
                        </div>
                    </div>
                </div>

                {/* ─── 2. Top Strategy Loading Cards (IN ONE SINGLE LINE) ─────── */}
                <div className='dash-load-cards-row'>
                    {loadingCards.map(card => (
                        <div
                            key={card.id}
                            className={classNames('dash-load-card', card.theme)}
                            onClick={card.callback}
                            role='button'
                            tabIndex={0}
                        >
                            <div className='dash-load-card__top'>
                                <div className='dash-load-card__icon-box'>{card.icon}</div>
                                <span className='dash-load-card__badge'>{card.badge}</span>
                            </div>
                            <div className='dash-load-card__info'>
                                <h4 className='dash-load-card__title'>{card.title}</h4>
                                <span className='dash-load-card__sub'>{card.subtitle}</span>
                            </div>
                            <div className='dash-load-card__arrow'>
                                <ArrowUpRight size={13} />
                            </div>
                        </div>
                    ))}
                </div>

                {/* ─── 3. Intelligence & Scanner Grid (4 Compact Cards) ────────── */}
                <div className='dash-intel-grid'>
                    {intelligenceModules.map(mod => (
                        <div
                            key={mod.id}
                            className='dash-intel-card'
                            onClick={mod.callback}
                            role='button'
                            tabIndex={0}
                        >
                            <div className='dash-intel-card__icon-box'>{mod.icon}</div>
                            <div className='dash-intel-card__text'>
                                <h5 className='dash-intel-card__title'>{mod.title}</h5>
                                <p className='dash-intel-card__desc'>{mod.desc}</p>
                            </div>
                            <ArrowUpRight size={14} className='dash-intel-card__arrow' />
                        </div>
                    ))}
                </div>

                {/* ─── 4. Broker Partnership & Community Compact Row ─────────── */}
                <div className='dash-partner-row'>
                    <div className='dash-partner-box dash-partner-box--deriv'>
                        <div className='dash-partner-box__left'>
                            <ShieldCheck size={20} className='text-amber' />
                            <div>
                                <h5 className='partner-title'>Deriv Verified Live Account</h5>
                                <span className='partner-desc'>Instant deposits, fast withdrawals & tight spreads</span>
                            </div>
                        </div>
                        <a
                            href='https://track.deriv.com/_b_FkYd-u53x-m-sZlUf1gWNd7ZgqdRLk/1/'
                            target='_blank'
                            rel='noopener noreferrer'
                            className='partner-btn partner-btn--gold'
                        >
                            <span>Open Account</span>
                            <ArrowUpRight size={13} />
                        </a>
                    </div>

                    <div className='dash-partner-box dash-partner-box--community'>
                        <div className='dash-partner-box__left'>
                            <MessageCircle size={20} className='text-emerald' />
                            <div>
                                <h5 className='partner-title'>VIP Trading Community</h5>
                                <span className='partner-desc'>5,000+ traders, free bot XML releases & daily setups</span>
                            </div>
                        </div>
                        <a
                            href='https://chat.whatsapp.com/L1n7hNl9ZJ8ErYVvXk1z6D'
                            target='_blank'
                            rel='noopener noreferrer'
                            className='partner-btn partner-btn--emerald'
                        >
                            <span>Join WhatsApp</span>
                            <ArrowUpRight size={13} />
                        </a>
                    </div>
                </div>

                {/* ─── 5. Strategy Workspace / Bot List ───────────────────────── */}
                <div className='dash-workspace-compact'>
                    <div className='dash-workspace-compact__header'>
                        <div className='dash-workspace-compact__title-wrap'>
                            <Bot size={17} className='text-emerald' />
                            <h4 className='dash-workspace-compact__title'>Saved Bots & Local Workspaces</h4>
                        </div>
                        <div className='dash-workspace-compact__btns'>
                            <button
                                type='button'
                                className='dash-btn-mini'
                                onClick={() => openFileLoader()}
                            >
                                <FolderPlus size={13} />
                                <span>Import XML</span>
                            </button>
                            <button
                                type='button'
                                className='dash-btn-mini dash-btn-mini--highlight'
                                onClick={() => setActiveTab(DBOT_TABS.TRADING_BOTS)}
                            >
                                <Sparkles size={13} />
                                <span>Free Bots Vault</span>
                            </button>
                        </div>
                    </div>

                    {has_dashboard_strategies ? (
                        <div className='dash-bot-list-area'>
                            <DashboardBotList />
                        </div>
                    ) : (
                        <div className='dash-workspace-empty'>
                            <p className='empty-text'>
                                No custom strategies saved in this browser yet. Build one in the IDE or choose from 24+ free bots.
                            </p>
                        </div>
                    )}
                </div>

                {/* ─── 6. Google Drive Modal Dialog ───────────────────────────── */}
                {!isDesktop ? (
                    <Dialog
                        title={dialog_options.title}
                        is_visible={is_dialog_open}
                        onCancel={onCloseDialog}
                        onConfirm={() => {}}
                        is_mobile_full_width
                        className='dc-dialog__wrapper--google-drive'
                        has_close_icon
                    >
                        <GoogleDrive />
                    </Dialog>
                ) : (
                    <MobileFullPageModal
                        is_modal_open={is_dialog_open}
                        className='load-strategy__wrapper'
                        header={localize('Load strategy')}
                        onClickClose={() => {
                            setPreviewOnPopup(false);
                            onCloseDialog();
                        }}
                        height_offset='80px'
                    >
                        <div label='Google Drive' className='google-drive-label'>
                            <GoogleDrive />
                        </div>
                    </MobileFullPageModal>
                )}
            </div>
        ),
        [
            is_dialog_open,
            has_dashboard_strategies,
            is_mobile,
            isDesktop,
            accountName,
            isVirtual,
            dialog_options.title,
            onCloseDialog,
            openFileLoader,
            handleOpenQuickStrategy,
            setActiveTab,
            setPreviewOnPopup
        ]
    );
});

export default Cards;
