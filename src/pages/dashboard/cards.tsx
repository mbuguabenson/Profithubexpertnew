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
import { TrendingUp, MessageCircle, ShieldCheck, Zap, BarChart3, ArrowUpRight } from 'lucide-react';

type TCardProps = {
    has_dashboard_strategies: boolean;
    is_mobile: boolean;
};

// ─── Custom Glassmorphism Vector Icons ─────────────────────────────────────
const GlassImportIcon = () => (
    <svg width="34" height="34" viewBox="0 0 48 48" fill="none" className="glass-icon-svg">
        <defs>
            <linearGradient id="gImpBg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#c084fc" stop-opacity="0.8" />
                <stop offset="100%" stop-color="#6366f1" stop-opacity="0.8" />
            </linearGradient>
            <linearGradient id="gImpSheen" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="0.6" />
                <stop offset="100%" stop-color="#ffffff" stop-opacity="0.05" />
            </linearGradient>
        </defs>
        <rect x="6" y="10" width="36" height="30" rx="8" fill="url(#gImpBg)" fill-opacity="0.25" stroke="url(#gImpSheen)" stroke-width="1.5" />
        <path d="M14 18 H22 L26 22 H34 C36.2 22 38 23.8 38 26 V36 C38 38.2 36.2 40 34 40 H14 C11.8 40 10 38.2 10 36 V22 C10 19.8 11.8 18 14 18 Z" fill="url(#gImpBg)" fill-opacity="0.4" stroke="#c084fc" stroke-width="1.5" />
        <path d="M24 34 V24 M20 28 L24 24 L28 28" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="34" cy="14" r="3" fill="#a855f7" />
    </svg>
);

const GlassSmartIcon = () => (
    <svg width="34" height="34" viewBox="0 0 48 48" fill="none" className="glass-icon-svg">
        <defs>
            <linearGradient id="gSmartBg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#34d399" stop-opacity="0.85" />
                <stop offset="100%" stop-color="#059669" stop-opacity="0.85" />
            </linearGradient>
            <linearGradient id="gSmartSheen" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="0.65" />
                <stop offset="100%" stop-color="#ffffff" stop-opacity="0.05" />
            </linearGradient>
        </defs>
        <rect x="8" y="8" width="32" height="32" rx="10" fill="url(#gSmartBg)" fill-opacity="0.22" stroke="url(#gSmartSheen)" stroke-width="1.5" />
        <rect x="14" y="14" width="20" height="20" rx="5" fill="url(#gSmartBg)" fill-opacity="0.35" stroke="#34d399" stroke-width="1.5" />
        <path d="M25 18 L20 26 H27 L23 31" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="8" cy="24" r="2" fill="#10b981" />
        <circle cx="40" cy="24" r="2" fill="#10b981" />
        <circle cx="24" cy="8" r="2" fill="#34d399" />
        <circle cx="24" cy="40" r="2" fill="#34d399" />
    </svg>
);

const GlassFreeIcon = () => (
    <svg width="34" height="34" viewBox="0 0 48 48" fill="none" className="glass-icon-svg">
        <defs>
            <linearGradient id="gFreeBg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.85" />
                <stop offset="100%" stop-color="#2563eb" stop-opacity="0.85" />
            </linearGradient>
            <linearGradient id="gFreeSheen" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="0.65" />
                <stop offset="100%" stop-color="#ffffff" stop-opacity="0.05" />
            </linearGradient>
        </defs>
        <rect x="8" y="8" width="32" height="32" rx="10" fill="url(#gFreeBg)" fill-opacity="0.22" stroke="url(#gFreeSheen)" stroke-width="1.5" />
        <path d="M24 14 V17 M16 20 H32 C34.2 20 36 21.8 36 24 V31 C36 33.2 34.2 35 32 35 H16 C13.8 35 12 33.2 12 31 V24 C12 21.8 13.8 20 16 20 Z" fill="url(#gFreeBg)" fill-opacity="0.35" stroke="#38bdf8" stroke-width="1.5" />
        <circle cx="19" cy="27" r="2.5" fill="#ffffff" />
        <circle cx="29" cy="27" r="2.5" fill="#ffffff" />
        <path d="M20 31 H28" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" />
    </svg>
);

const GlassSignalsIcon = () => (
    <svg width="34" height="34" viewBox="0 0 48 48" fill="none" className="glass-icon-svg">
        <defs>
            <linearGradient id="gSigBg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.85" />
                <stop offset="100%" stop-color="#ea580c" stop-opacity="0.85" />
            </linearGradient>
            <linearGradient id="gSigSheen" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="0.65" />
                <stop offset="100%" stop-color="#ffffff" stop-opacity="0.05" />
            </linearGradient>
        </defs>
        <rect x="8" y="8" width="32" height="32" rx="10" fill="url(#gSigBg)" fill-opacity="0.22" stroke="url(#gSigSheen)" stroke-width="1.5" />
        <path d="M15 33 C12 29 12 23 15 19 M33 19 C36 23 36 29 33 33" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" />
        <path d="M19 29 C17.5 27 17.5 24 19 22 M29 22 C30.5 24 30.5 27 29 29" stroke="#fb923c" stroke-width="2" stroke-linecap="round" />
        <circle cx="24" cy="26" r="3" fill="#ffffff" stroke="#f59e0b" stroke-width="1.5" />
        <path d="M24 13 V17" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
    </svg>
);

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

    const actionTiles = [
        {
            id: 'smart-trader',
            title: 'AI Smart Trader',
            subtitle: 'AI Automated & Manual Execution',
            badge: 'LIVE TRADING',
            icon: <GlassSmartIcon />,
            cardTheme: 'glass-emerald',
            callback: () => setActiveTab(DBOT_TABS.MANUAL_TRADING),
        },
        {
            id: 'bot-builder',
            title: 'Bot Builder IDE',
            subtitle: 'Visual Drag & Drop Workspace',
            badge: 'BLOCKLY IDE',
            icon: <GlassImportIcon />,
            cardTheme: 'glass-purple',
            callback: () => openFileLoader(),
        },
        {
            id: 'free-bots',
            title: '24+ Free Bots',
            subtitle: 'Pre-loaded Institutional Systems',
            badge: 'PRE-LOADED',
            icon: <GlassFreeIcon />,
            cardTheme: 'glass-blue',
            callback: () => setActiveTab(DBOT_TABS.TRADING_BOTS),
        },
        {
            id: 'signal-tools',
            title: 'Market Radar & Signals',
            subtitle: 'Real-time Live Digit Analysis',
            badge: 'RADAR INTEL',
            icon: <GlassSignalsIcon />,
            cardTheme: 'glass-amber',
            callback: () => setActiveTab(DBOT_TABS.SIGNALS),
        },
    ];

    return React.useMemo(
        () => (
            <div
                className={classNames('tab__dashboard__table', {
                    'tab__dashboard__table--minimized': has_dashboard_strategies && is_mobile,
                })}
            >
                {/* 1. Quick Platform Status & Metric Chips */}
                <div className="dash-quick-metrics-row">
                    <div className="metric-pill">
                        <Zap size={14} className="text-emerald" />
                        <span><strong>24+</strong> Pre-Loaded Strategies</span>
                    </div>
                    <div className="metric-pill">
                        <BarChart3 size={14} className="text-blue" />
                        <span><strong>Live</strong> AI Market Radar</span>
                    </div>
                    <div className="metric-pill">
                        <ShieldCheck size={14} className="text-purple" />
                        <span><strong>High-Speed</strong> Deriv API WebSocket</span>
                    </div>
                </div>

                {/* 2. Primary 4-Tile Navigation Grid */}
                <div className="dash-action-tiles-grid">
                    {actionTiles.map(tile => (
                        <div
                            key={tile.id}
                            className={classNames('dash-glass-card', tile.cardTheme)}
                            onClick={tile.callback}
                        >
                            <div className="glass-card-glow" />
                            <div className="glass-card-header">
                                <div className="glass-icon-wrapper">
                                    {tile.icon}
                                </div>
                                <span className="glass-badge">{tile.badge}</span>
                            </div>
                            <div className="glass-card-body">
                                <h4 className="glass-title">{tile.title}</h4>
                                <p className="glass-subtitle">{tile.subtitle}</p>
                            </div>
                            <div className="glass-card-footer">
                                <span className="glass-explore-text">Open Module</span>
                                <ArrowUpRight size={14} className="glass-explore-arrow" />
                            </div>
                        </div>
                    ))}
                </div>

                {/* 3. Primary Execution Launcher Row */}
                <div className="dash-launchers-row">
                    <button
                        onClick={() => setActiveTab(DBOT_TABS.MANUAL_TRADING)}
                        className="dash-manual-trader-btn"
                    >
                        <TrendingUp size={18} />
                        <span>LAUNCH AI SMART TRADER</span>
                        <ArrowUpRight size={16} />
                    </button>
                    <button
                        onClick={() => openFileLoader()}
                        className="dash-import-btn"
                    >
                        <Zap size={16} />
                        <span>IMPORT STRATEGY XML</span>
                    </button>
                </div>

                {/* 4. Utility & Community 2-Column Row */}
                <div className="dash-utility-dual-grid">
                    {/* Account Registration Card */}
                    <div className="dash-gold-notice-card">
                        <div className="notice-left-content">
                            <h5 className="notice-title"><strong className="text-amber">Deriv Verified Account</strong></h5>
                            <p className="notice-left-text">
                                Don't have an account? Open a live Deriv account with instant deposit & low latency trading.
                            </p>
                        </div>
                        <a
                            href="https://track.deriv.com/_b_FkYd-u53x-m-sZlUf1gWNd7ZgqdRLk/1/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="dash-gold-btn"
                        >
                            <span>Open Account</span>
                            <ArrowUpRight size={15} />
                        </a>
                    </div>

                    {/* Community WhatsApp Card */}
                    <div className="dash-whatsapp-card">
                        <div className="whatsapp-info">
                            <div className="whatsapp-icon-circle">
                                <MessageCircle size={22} className="wa-icon" />
                            </div>
                            <div>
                                <h5 className="wa-title">VIP Trading Network</h5>
                                <p className="whatsapp-desc">
                                    Join our community for daily setups, bot releases, and market signals.
                                </p>
                            </div>
                        </div>
                        <a
                            href="https://chat.whatsapp.com/L1n7hNl9ZJ8ErYVvXk1z6D"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="dash-whatsapp-btn"
                        >
                            <span>Join Group</span>
                            <ArrowUpRight size={15} />
                        </a>
                    </div>
                </div>

                {/* 6. Google Drive Modal Dialog */}
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

                {/* 7. Strategy Management & Bot List Table */}
                <div className="dash-bot-list-wrapper">
                    <div className="dash-bot-list-header">
                        <h3 className="dash-bot-list-title">Your Trading Bots & Strategies</h3>
                        <span className="dash-bot-list-sub">Saved locally in your browser workspace</span>
                    </div>
                    <DashboardBotList />
                </div>
            </div>
        ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [is_dialog_open, has_dashboard_strategies]
    );
});

export default Cards;
