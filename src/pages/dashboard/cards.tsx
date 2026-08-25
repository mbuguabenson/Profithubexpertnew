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
    Activity,
    ArrowRight,
    Bot,
    Boxes,
    Cpu,
    ExternalLink,
    FileCode,
    Flame,
    FolderOpen,
    Layers,
    MessageCircle,
    Radio,
    ShieldCheck,
    Sparkles,
    TrendingUp,
    Zap,
} from 'lucide-react';

type TCardProps = {
    has_dashboard_strategies: boolean;
    is_mobile: boolean;
};

const Cards = observer(({ is_mobile, has_dashboard_strategies }: TCardProps) => {
    const { dashboard, load_modal, client } = useStore();
    const { toggleLoadModal, setActiveTabIndex } = load_modal;
    const { isDesktop } = useDevice();
    const { onCloseDialog, dialog_options, is_dialog_open, setActiveTab, setPreviewOnPopup } = dashboard;
    const currency = client?.currency || 'USD';
    const balance = client?.balance || '0.00';
    const is_logged_in = client?.is_logged_in;

    const openFileLoader = () => {
        toggleLoadModal();
        setActiveTabIndex(is_mobile ? 0 : 1);
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    const coreHubModules = [
        {
            id: 'auto-x-eo',
            title: 'AUTO X E/O',
            badge: 'AI PARITY',
            badgeColor: 'badge-gold',
            description: 'Continuous Synthetic Wave Scanner, 58%+ Parity AI Engine & 2.6x Martingale Recovery.',
            icon: <Zap size={24} className="module-icon text-gold" />,
            gradient: 'grad-gold',
            tabIndex: DBOT_TABS.AUTO_X_EO,
            highlight: true,
        },
        {
            id: 'free-bots',
            title: 'Free Trading Bots',
            badge: '24+ BOTS',
            badgeColor: 'badge-cyan',
            description: 'Pre-loaded automated trading algorithms including Martingale, Differ, Even/Odd & Over/Under.',
            icon: <Bot size={24} className="module-icon text-cyan" />,
            gradient: 'grad-cyan',
            tabIndex: DBOT_TABS.TRADING_BOTS,
        },
        {
            id: 'smart-trader',
            title: 'Manual Trader Pro',
            badge: 'LIVE DIGITS',
            badgeColor: 'badge-emerald',
            description: 'Ultra-fast manual execution with live digit frequency analysis and automated TP/SL guardrails.',
            icon: <TrendingUp size={24} className="module-icon text-emerald" />,
            gradient: 'grad-emerald',
            tabIndex: DBOT_TABS.MANUAL_TRADING,
        },
        {
            id: 'poverty-hunter',
            title: 'Poverty Hunter',
            badge: 'NEURAL AI',
            badgeColor: 'badge-purple',
            description: 'Multi-market high-probability hunter targeting long streak reversals and momentum patterns.',
            icon: <Flame size={24} className="module-icon text-purple" />,
            gradient: 'grad-purple',
            tabIndex: DBOT_TABS.POVERTY_HUNTER,
        },
        {
            id: 'scanner',
            title: 'AI Market Scanner',
            badge: 'MULTI-TICK',
            badgeColor: 'badge-blue',
            description: 'Real-time multi-synthetic index heatmaps and automated best market candidate detection.',
            icon: <Activity size={24} className="module-icon text-blue" />,
            gradient: 'grad-blue',
            tabIndex: DBOT_TABS.SCANNER,
        },
        {
            id: 'bot-builder',
            title: 'Strategy Bot Builder',
            badge: 'BLOCKLY XML',
            badgeColor: 'badge-rose',
            description: 'Visual drag-and-drop bot builder, custom XML strategy import, and Google Drive cloud sync.',
            icon: <Boxes size={24} className="module-icon text-rose" />,
            gradient: 'grad-rose',
            tabIndex: DBOT_TABS.BOT_BUILDER,
        },
    ];

    return React.useMemo(
        () => (
            <div
                className={classNames('tab__dashboard__table', {
                    'tab__dashboard__table--minimized': has_dashboard_strategies && is_mobile,
                })}
            >
                {/* 1. Hero Luxury Welcome Banner */}
                <div className="dash-hero-banner">
                    <div className="hero-badge-row">
                        <span className="hero-pill-badge">
                            <Sparkles size={14} className="text-gold" />
                            <span>NEXT-GEN TRADING SUITE 3.0</span>
                        </span>
                        <span className="hero-status-pill">
                            <span className="dot-live" />
                            <span>Deriv API Connected</span>
                        </span>
                    </div>

                    <div className="hero-content">
                        <h1 className="hero-title">
                            Welcome to <span className="text-glow-gold">ProfitHub Expert</span>
                        </h1>
                        <p className="hero-subtitle">
                            Institutional-grade algorithmic trading platform with real-time synthetic market intelligence,
                            automated AI pattern scanners, and institutional risk management.
                        </p>
                    </div>

                    {/* Quick Account Header Bar */}
                    <div className="hero-account-strip">
                        <div className="account-stat">
                            <span className="stat-label">ACCOUNT STATUS</span>
                            <span className="stat-value">
                                {is_logged_in ? (
                                    <span className="text-emerald">● Verified Active</span>
                                ) : (
                                    <span className="text-amber">Demo / Disconnected</span>
                                )}
                            </span>
                        </div>

                        {is_logged_in && (
                            <div className="account-stat">
                                <span className="stat-label">AVAILABLE BALANCE</span>
                                <span className="stat-value text-gold font-mono">
                                    {balance} {currency}
                                </span>
                            </div>
                        )}

                        <div className="account-actions">
                            <button
                                className="hero-btn-primary"
                                onClick={() => setActiveTab(DBOT_TABS.AUTO_X_EO)}
                            >
                                <Zap size={16} />
                                <span>Launch AUTO X E/O</span>
                                <ArrowRight size={14} />
                            </button>
                            <button
                                className="hero-btn-secondary"
                                onClick={openFileLoader}
                            >
                                <FolderOpen size={16} />
                                <span>Import XML Strategy</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* 2. Featured Strategy Spotlight: AUTO X E/O */}
                <div className="dash-spotlight-card">
                    <div className="spotlight-left">
                        <div className="spotlight-badge">
                            <Flame size={14} />
                            <span>NEW FEATURED ENGINE</span>
                        </div>
                        <h2 className="spotlight-title">AUTO X E/O Algorithm</h2>
                        <p className="spotlight-desc">
                            Continuous multi-synthetic indices scanner with live 50-tick Spline Wave Chart, 58%+ Parity
                            Probability triggers, and smart Single-Loss Over/Under 2.6x Martingale Recovery.
                        </p>
                        <div className="spotlight-tags">
                            <span className="tag-chip">Continuous Scan</span>
                            <span className="tag-chip">Smart Auto-Switch</span>
                            <span className="tag-chip">In-Node Digits</span>
                            <span className="tag-chip">Martingale 2.6x</span>
                        </div>
                    </div>
                    <div className="spotlight-right">
                        <button
                            className="spotlight-launch-btn"
                            onClick={() => setActiveTab(DBOT_TABS.AUTO_X_EO)}
                        >
                            <Zap size={18} />
                            <span>Trade AUTO X E/O</span>
                        </button>
                    </div>
                </div>

                {/* 3. Core Modules Bento Grid (6 Cards) */}
                <div className="dash-section-header">
                    <div className="section-title-wrap">
                        <Layers size={18} className="text-gold" />
                        <h2>Trading Hub Ecosystem</h2>
                    </div>
                    <span className="section-sub">Select an automated suite or analytics module to begin</span>
                </div>

                <div className="dash-modules-grid">
                    {coreHubModules.map(module => (
                        <div
                            key={module.id}
                            className={classNames('dash-module-card', module.gradient, {
                                'dash-module-card--featured': module.highlight,
                            })}
                            onClick={() => setActiveTab(module.tabIndex)}
                        >
                            <div className="card-top-row">
                                <div className="module-icon-wrap">{module.icon}</div>
                                <span className={classNames('module-badge', module.badgeColor)}>
                                    {module.badge}
                                </span>
                            </div>

                            <div className="card-body">
                                <h3 className="module-title">{module.title}</h3>
                                <p className="module-desc">{module.description}</p>
                            </div>

                            <div className="card-footer">
                                <span className="open-link">
                                    <span>Launch Module</span>
                                    <ArrowRight size={14} className="arrow-icon" />
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* 4. Platform Performance & Reliability Metrics */}
                <div className="dash-metrics-strip">
                    <div className="metric-box">
                        <div className="metric-icon-circle bg-gold-soft">
                            <Zap size={20} className="text-gold" />
                        </div>
                        <div className="metric-info">
                            <span className="metric-number">&lt; 10ms</span>
                            <span className="metric-caption">Execution Speed</span>
                        </div>
                    </div>

                    <div className="metric-box">
                        <div className="metric-icon-circle bg-emerald-soft">
                            <ShieldCheck size={20} className="text-emerald" />
                        </div>
                        <div className="metric-info">
                            <span className="metric-number">256-Bit</span>
                            <span className="metric-caption">End-to-End Encryption</span>
                        </div>
                    </div>

                    <div className="metric-box">
                        <div className="metric-icon-circle bg-cyan-soft">
                            <Cpu size={20} className="text-cyan" />
                        </div>
                        <div className="metric-info">
                            <span className="metric-number">24+ Bots</span>
                            <span className="metric-caption">Pre-Built Algorithmic Library</span>
                        </div>
                    </div>

                    <div className="metric-box">
                        <div className="metric-icon-circle bg-purple-soft">
                            <Radio size={20} className="text-purple" />
                        </div>
                        <div className="metric-info">
                            <span className="metric-number">99.98%</span>
                            <span className="metric-caption">System Stream Uptime</span>
                        </div>
                    </div>
                </div>

                {/* 5. Community VIP Lounge & Broker Signup */}
                <div className="dash-community-row">
                    {/* WhatsApp VIP Community Card */}
                    <div className="dash-community-card wa-theme">
                        <div className="community-content">
                            <div className="community-icon-box">
                                <MessageCircle size={28} className="text-emerald" />
                            </div>
                            <div className="community-text">
                                <h3>Official VIP WhatsApp Community</h3>
                                <p>
                                    Join 10,000+ active profitable traders receiving daily automated bot setups, live signals,
                                    and real-time market updates.
                                </p>
                            </div>
                        </div>
                        <a
                            href="https://chat.whatsapp.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="community-btn wa-btn"
                        >
                            <span>Join WhatsApp VIP</span>
                            <ExternalLink size={14} />
                        </a>
                    </div>

                    {/* Deriv Broker Account Card */}
                    <div className="dash-community-card deriv-theme">
                        <div className="community-content">
                            <div className="community-icon-box">
                                <Sparkles size={28} className="text-gold" />
                            </div>
                            <div className="community-text">
                                <h3>Create Your Deriv Trading Account</h3>
                                <p>
                                    Experience zero-spread execution on synthetic indices. Open a free demo or real account
                                    with our official Deriv institutional partner link.
                                </p>
                            </div>
                        </div>
                        <a
                            href="https://track.deriv.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="community-btn deriv-btn"
                        >
                            <span>Open Free Account</span>
                            <ExternalLink size={14} />
                        </a>
                    </div>
                </div>

                {/* 6. Google Drive Strategy Loader Dialog */}
                {!isDesktop ? (
                    <Dialog
                        title={dialog_options.title}
                        is_visible={is_dialog_open}
                        onCancel={onCloseDialog}
                        onConfirm={() => {}}
                        is_mobile_full_width
                        className="dc-dialog__wrapper--google-drive"
                        has_close_icon
                    >
                        <GoogleDrive />
                    </Dialog>
                ) : (
                    <MobileFullPageModal
                        is_modal_open={is_dialog_open}
                        className="load-strategy__wrapper"
                        header={localize('Load strategy')}
                        onClickClose={() => {
                            setPreviewOnPopup(false);
                            onCloseDialog();
                        }}
                        height_offset="80px"
                    >
                        <div label="Google Drive" className="google-drive-label">
                            <GoogleDrive />
                        </div>
                    </MobileFullPageModal>
                )}

                {/* 7. Strategy Management & Recent Bots Manager */}
                <div className="dash-bot-list-wrapper">
                    <div className="bot-list-header-bar">
                        <div className="bot-list-title-wrap">
                            <FileCode size={18} className="text-gold" />
                            <h3>Your Custom Strategies &amp; Saved Bots</h3>
                        </div>
                        <button className="btn-import-quick" onClick={openFileLoader}>
                            <FolderOpen size={14} />
                            <span>Load Strategy</span>
                        </button>
                    </div>
                    <DashboardBotList />
                </div>
            </div>
        ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [is_dialog_open, has_dashboard_strategies, is_logged_in, balance, currency]
    );
});

export default Cards;
