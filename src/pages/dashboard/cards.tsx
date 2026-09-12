import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import GoogleDrive from '@/components/load-modal/google-drive';
import Dialog from '@/components/shared_ui/dialog';
import MobileFullPageModal from '@/components/shared_ui/mobile-full-page-modal';
import { DBOT_TABS } from '@/constants/bot-contents';
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
    CheckCircle2,
    Play,
    Activity
} from 'lucide-react';

type TCardProps = {
    has_dashboard_strategies: boolean;
    is_mobile: boolean;
};

const Cards = observer(({ is_mobile, has_dashboard_strategies }: TCardProps) => {
    const { dashboard, load_modal } = useStore();
    const { toggleLoadModal, setActiveTabIndex } = load_modal;
    const { isDesktop } = useDevice();
    const { onCloseDialog, dialog_options, is_dialog_open, setActiveTab, setPreviewOnPopup } = dashboard;

    const openFileLoader = () => {
        toggleLoadModal();
        setActiveTabIndex(is_mobile ? 0 : 1);
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    // 6 Core Quantitative Modules
    const actionModules = [
        {
            id: 'smart-trader',
            title: 'AI Smart Trader',
            tagline: 'Autonomous AI & Manual Order Execution',
            badge: 'LIVE EXECUTION',
            badgeColor: 'emerald',
            glowColor: 'emerald',
            icon: <Bot className='module-icon' size={24} />,
            features: ['Zero-latency ticks', 'Auto stop-loss & take-profit', 'One-click entries'],
            actionText: 'Open Terminal',
            callback: () => setActiveTab(DBOT_TABS.MANUAL_TRADING),
        },
        {
            id: 'bot-builder',
            title: 'Visual Bot Builder IDE',
            tagline: 'Blockly Visual Strategy Design Workspace',
            badge: 'BLOCKLY IDE',
            badgeColor: 'indigo',
            glowColor: 'indigo',
            icon: <Layers className='module-icon' size={24} />,
            features: ['Drag & drop logic', 'Custom indicator formulas', 'XML export & import'],
            actionText: 'Build Strategy',
            callback: () => openFileLoader(),
        },
        {
            id: 'free-bots',
            title: '24+ Institutional Bots',
            tagline: 'Pre-Loaded Algorithmic Trading Systems',
            badge: 'FREE PRE-LOADED',
            badgeColor: 'cyan',
            glowColor: 'cyan',
            icon: <Zap className='module-icon' size={24} />,
            features: ['Speed Bot & Martingale', 'Accumulator sniper logic', 'Even / Odd algorithms'],
            actionText: 'Browse Systems',
            callback: () => setActiveTab(DBOT_TABS.TRADING_BOTS),
        },
        {
            id: 'ai-engine',
            title: 'AI Trading Engine',
            tagline: 'Neural Market Scanner & Entry Filter',
            badge: 'AI NEURAL',
            badgeColor: 'purple',
            glowColor: 'purple',
            icon: <Cpu className='module-icon' size={24} />,
            features: ['Real-time digit flow', 'High-probability triggers', 'Multi-timeframe scanner'],
            actionText: 'Launch Engine',
            callback: () => setActiveTab(DBOT_TABS.AI_TRADING_ENGINE),
        },
        {
            id: 'market-hunter',
            title: 'Market Hunter Pro',
            tagline: 'Multi-Symbol Volatility Pattern Scanner',
            badge: 'PRO SCANNER',
            badgeColor: 'amber',
            glowColor: 'amber',
            icon: <Target className='module-icon' size={24} />,
            features: ['Tick momentum analyzer', 'Volatility index alerts', 'Trend bias detection'],
            actionText: 'Launch Hunter',
            callback: () => setActiveTab(DBOT_TABS.MARKET_HUNTER_PRO),
        },
        {
            id: 'signal-radar',
            title: 'Market Radar & Signals',
            tagline: 'Live Statistical Digit Bias Intelligence',
            badge: 'RADAR INTEL',
            badgeColor: 'rose',
            glowColor: 'rose',
            icon: <Radio className='module-icon' size={24} />,
            features: ['Live frequency heatmap', 'Over/Under edge metrics', 'Consecutive tick alerts'],
            actionText: 'Analyze Signals',
            callback: () => setActiveTab(DBOT_TABS.SIGNALS),
        },
    ];

    return React.useMemo(
        () => (
            <div
                className={classNames('dash-cockpit-container', {
                    'dash-cockpit-container--minimized': has_dashboard_strategies && is_mobile,
                })}
            >
                {/* ─── 1. Cockpit Hero Command Center ─────────────────────── */}
                <div className='dash-cockpit-hero'>
                    <div className='dash-cockpit-hero__mesh-bg' />
                    <div className='dash-cockpit-hero__content'>
                        <div className='dash-cockpit-hero__badge'>
                            <span className='dash-pulse-dot' />
                            <span className='dash-badge-text'>INSTITUTIONAL QUANT SUITE</span>
                            <span className='dash-badge-ver'>v4.2 PRO</span>
                        </div>

                        <h1 className='dash-cockpit-hero__title'>
                            Next-Generation <span className='text-gradient-gold'>Algorithmic Trading</span> Cockpit
                        </h1>

                        <p className='dash-cockpit-hero__desc'>
                            Execute autonomous quantitative bots, craft custom visual Blockly logic, monitor real-time
                            digit momentum, and trade synthetic indices with ultra-low latency on Deriv.
                        </p>

                        {/* Quick Metrics Bar */}
                        <div className='dash-hero-stats-row'>
                            <div className='hero-stat-card'>
                                <div className='hero-stat-card__icon-wrap text-emerald'>
                                    <Activity size={18} />
                                </div>
                                <div className='hero-stat-card__text'>
                                    <span className='hero-stat-val'>&lt; 20ms</span>
                                    <span className='hero-stat-label'>WebSocket Latency</span>
                                </div>
                            </div>

                            <div className='hero-stat-card'>
                                <div className='hero-stat-card__icon-wrap text-cyan'>
                                    <Zap size={18} />
                                </div>
                                <div className='hero-stat-card__text'>
                                    <span className='hero-stat-val'>24+ Bots</span>
                                    <span className='hero-stat-label'>Pre-Loaded Vault</span>
                                </div>
                            </div>

                            <div className='hero-stat-card'>
                                <div className='hero-stat-card__icon-wrap text-purple'>
                                    <BarChart3 size={18} />
                                </div>
                                <div className='hero-stat-card__text'>
                                    <span className='hero-stat-val'>Real-Time</span>
                                    <span className='hero-stat-label'>AI Market Radar</span>
                                </div>
                            </div>

                            <div className='hero-stat-card'>
                                <div className='hero-stat-card__icon-wrap text-amber'>
                                    <ShieldCheck size={18} />
                                </div>
                                <div className='hero-stat-card__text'>
                                    <span className='hero-stat-val'>Active</span>
                                    <span className='hero-stat-label'>Drawdown Sentinel</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ─── 2. Quick Execution Action Deck ─────────────────────── */}
                <div className='dash-quick-action-deck'>
                    <button
                        type='button'
                        className='dash-action-btn dash-action-btn--primary'
                        onClick={() => setActiveTab(DBOT_TABS.MANUAL_TRADING)}
                    >
                        <div className='btn-inner-glow' />
                        <TrendingUp size={18} className='btn-icon' />
                        <span className='btn-text'>Launch AI Smart Trader</span>
                        <ArrowUpRight size={16} className='btn-arrow' />
                    </button>

                    <button
                        type='button'
                        className='dash-action-btn dash-action-btn--secondary'
                        onClick={() => openFileLoader()}
                    >
                        <FolderPlus size={18} className='btn-icon text-indigo' />
                        <span className='btn-text'>Import Strategy XML</span>
                    </button>

                    <button
                        type='button'
                        className='dash-action-btn dash-action-btn--tertiary'
                        onClick={() => setActiveTab(DBOT_TABS.CHART)}
                    >
                        <BarChart3 size={18} className='btn-icon text-cyan' />
                        <span className='btn-text'>Live Interactive Charts</span>
                    </button>

                    <button
                        type='button'
                        className='dash-action-btn dash-action-btn--quaternary'
                        onClick={() => setActiveTab(DBOT_TABS.AI_TRADING_ENGINE)}
                    >
                        <Cpu size={18} className='btn-icon text-purple' />
                        <span className='btn-text'>AI Trading Engine</span>
                    </button>
                </div>

                {/* ─── 3. Core Modules 6-Card Interactive Grid ────────────── */}
                <div className='dash-section-header'>
                    <div className='dash-section-header__title-group'>
                        <h2 className='dash-section-title'>Institutional Trading Modules</h2>
                        <p className='dash-section-subtitle'>
                            Select a quantitative engine to launch instant automated execution or analytical scanner
                        </p>
                    </div>
                </div>

                <div className='dash-modules-grid'>
                    {actionModules.map(module => (
                        <div
                            key={module.id}
                            className={classNames('dash-module-card', `dash-module-card--${module.glowColor}`)}
                            onClick={module.callback}
                        >
                            <div className='card-sheen-line' />
                            <div className='dash-module-card__header'>
                                <div className={`dash-module-card__icon-box icon-box--${module.glowColor}`}>
                                    {module.icon}
                                </div>
                                <span className={`dash-module-badge badge--${module.badgeColor}`}>
                                    {module.badge}
                                </span>
                            </div>

                            <div className='dash-module-card__body'>
                                <h3 className='dash-module-card__title'>{module.title}</h3>
                                <p className='dash-module-card__tagline'>{module.tagline}</p>

                                <ul className='dash-module-card__features'>
                                    {module.features.map((feat, idx) => (
                                        <li key={idx} className='feature-item'>
                                            <CheckCircle2 size={13} className={`check-icon check--${module.glowColor}`} />
                                            <span>{feat}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className='dash-module-card__footer'>
                                <span className='action-label'>{module.actionText}</span>
                                <div className='action-arrow-circle'>
                                    <ArrowUpRight size={14} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ─── 4. Broker Partnership & Community Row ─────────────── */}
                <div className='dash-ecosystem-row'>
                    {/* Deriv Account Card */}
                    <div className='dash-ecosystem-card dash-ecosystem-card--deriv'>
                        <div className='card-glow-mesh' />
                        <div className='dash-ecosystem-card__content'>
                            <div className='card-header-pill'>
                                <ShieldCheck size={16} className='text-amber' />
                                <span>OFFICIAL BROKER PARTNER</span>
                            </div>
                            <h3 className='card-title'>Deriv Verified Trading Account</h3>
                            <p className='card-desc'>
                                Trade with zero spread manipulation, instantaneous local deposits & withdrawals, and
                                uninterrupted 24/7 liquidity feeds on synthetic indices.
                            </p>
                            <a
                                href='https://track.deriv.com/_b_FkYd-u53x-m-sZlUf1gWNd7ZgqdRLk/1/'
                                target='_blank'
                                rel='noopener noreferrer'
                                className='dash-partner-btn dash-partner-btn--gold'
                            >
                                <span>Open Live Account</span>
                                <ArrowUpRight size={16} />
                            </a>
                        </div>
                    </div>

                    {/* VIP Trading Community Card */}
                    <div className='dash-ecosystem-card dash-ecosystem-card--community'>
                        <div className='card-glow-mesh' />
                        <div className='dash-ecosystem-card__content'>
                            <div className='card-header-pill'>
                                <MessageCircle size={16} className='text-emerald' />
                                <span>EXCLUSIVE VIP TRADERS GROUP</span>
                            </div>
                            <h3 className='card-title'>VIP Trading Network</h3>
                            <p className='card-desc'>
                                Join 5,000+ quantitative traders. Receive tested bot XML releases, daily high-probability
                                market setups, and real-time community insights.
                            </p>
                            <a
                                href='https://chat.whatsapp.com/L1n7hNl9ZJ8ErYVvXk1z6D'
                                target='_blank'
                                rel='noopener noreferrer'
                                className='dash-partner-btn dash-partner-btn--emerald'
                            >
                                <span>Join WhatsApp Group</span>
                                <ArrowUpRight size={16} />
                            </a>
                        </div>
                    </div>
                </div>

                {/* ─── 5. Strategy Management & Bot List ──────────────────── */}
                <div className='dash-workspace-section'>
                    <div className='dash-workspace-header'>
                        <div className='dash-workspace-header__title-group'>
                            <div className='dash-workspace-icon-box'>
                                <Bot size={20} className='text-emerald' />
                            </div>
                            <div>
                                <h3 className='dash-workspace-title'>Your Trading Bots & Workspaces</h3>
                                <span className='dash-workspace-subtitle'>
                                    Saved locally in your browser storage for instant execution
                                </span>
                            </div>
                        </div>

                        <div className='dash-workspace-actions'>
                            <button
                                type='button'
                                className='dash-mini-btn'
                                onClick={() => openFileLoader()}
                            >
                                <FolderPlus size={14} />
                                <span>Import XML</span>
                            </button>
                            <button
                                type='button'
                                className='dash-mini-btn dash-mini-btn--accent'
                                onClick={() => setActiveTab(DBOT_TABS.TRADING_BOTS)}
                            >
                                <Sparkles size={14} />
                                <span>Load Free Bot</span>
                            </button>
                        </div>
                    </div>

                    {has_dashboard_strategies ? (
                        <div className='dash-bot-list-container'>
                            <DashboardBotList />
                        </div>
                    ) : (
                        <div className='dash-empty-workspace'>
                            <div className='dash-empty-workspace__icon'>
                                <Layers size={32} />
                            </div>
                            <h4 className='dash-empty-workspace__title'>No Custom Strategies Saved Yet</h4>
                            <p className='dash-empty-workspace__desc'>
                                Build custom algorithmic strategies in the visual IDE, or choose from our 24+ pre-loaded institutional bots to see them here.
                            </p>
                            <div className='dash-empty-workspace__btns'>
                                <button
                                    type='button'
                                    className='dash-empty-btn dash-empty-btn--primary'
                                    onClick={() => setActiveTab(DBOT_TABS.TRADING_BOTS)}
                                >
                                    <Zap size={15} />
                                    <span>Explore 24+ Free Bots</span>
                                </button>
                                <button
                                    type='button'
                                    className='dash-empty-btn dash-empty-btn--outline'
                                    onClick={() => openFileLoader()}
                                >
                                    <FolderPlus size={15} />
                                    <span>Import From XML</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ─── 6. Google Drive Modal Dialog ────────────────────────── */}
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
        [is_dialog_open, has_dashboard_strategies, is_mobile, isDesktop, dialog_options.title, onCloseDialog, openFileLoader, setActiveTab, setPreviewOnPopup]
    );
});

export default Cards;
