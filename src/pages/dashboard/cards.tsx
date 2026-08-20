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
import { Smartphone, TrendingUp, Bot, Radio, MessageCircle, ShieldCheck, Zap, BarChart3 } from 'lucide-react';

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

    const actionTiles = [
        {
            id: 'import',
            title: 'Import',
            icon: <Smartphone size={28} className="tile-icon text-purple" />,
            orbBg: 'orb-purple',
            callback: () => openFileLoader(),
        },
        {
            id: 'smart-trader',
            title: 'Smart Trader',
            icon: <TrendingUp size={28} className="tile-icon text-emerald" />,
            orbBg: 'orb-emerald',
            callback: () => setActiveTab(DBOT_TABS.MANUAL_TRADING),
        },
        {
            id: 'free-bots',
            title: 'Free Bots',
            icon: <Bot size={28} className="tile-icon text-blue" />,
            orbBg: 'orb-blue',
            callback: () => setActiveTab(DBOT_TABS.TRADING_BOTS),
        },
        {
            id: 'signal-tools',
            title: 'Signal Tools',
            icon: <Radio size={28} className="tile-icon text-amber" />,
            orbBg: 'orb-amber',
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
                {/* 1. Account Creation Gold Notice Banner */}
                <div className="dash-gold-notice-card">
                    <div className="notice-left-text">
                        <strong className="text-amber">Dont have an Account?</strong> Use this link to create your account with Deriv.
                    </div>
                    <a
                        href="https://track.deriv.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="dash-gold-btn"
                    >
                        Open Account
                    </a>
                </div>

                {/* 2. Quick Platform Metrics Bar */}
                <div className="dash-quick-metrics-row">
                    <div className="metric-pill">
                        <Zap size={14} className="text-emerald" />
                        <span><strong>24+</strong> Free Pre-loaded Bots</span>
                    </div>
                    <div className="metric-pill">
                        <BarChart3 size={14} className="text-blue" />
                        <span><strong>Live</strong> Market Scanner</span>
                    </div>
                    <div className="metric-pill">
                        <ShieldCheck size={14} className="text-purple" />
                        <span><strong>Encrypted</strong> Deriv API Node</span>
                    </div>
                </div>

                {/* 3. Floating Manual Trader Action Row */}
                <div className="dash-manual-trader-row">
                    <button
                        onClick={() => setActiveTab(DBOT_TABS.MANUAL_TRADING)}
                        className="dash-manual-trader-btn"
                    >
                        <TrendingUp size={18} />
                        <span>MANUAL TRADER</span>
                    </button>
                </div>

                {/* 4. 4 Main Soft Action Tiles */}
                <div className="dash-action-tiles-grid">
                    {actionTiles.map(tile => (
                        <div
                            key={tile.id}
                            className="dash-action-tile"
                            onClick={tile.callback}
                        >
                            <div className={classNames('tile-icon-orb', tile.orbBg)}>
                                {tile.icon}
                            </div>
                            <span className="tile-title">{tile.title}</span>
                        </div>
                    ))}
                </div>

                {/* 5. Community WhatsApp Group Card */}
                <div className="dash-whatsapp-card">
                    <div className="whatsapp-info">
                        <div className="whatsapp-icon-circle">
                            <MessageCircle size={24} className="wa-icon" />
                        </div>
                        <p className="whatsapp-desc">
                            Get daily insights by joining our thriving community of profitable traders.
                        </p>
                    </div>
                    <a
                        href="https://chat.whatsapp.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="dash-whatsapp-btn"
                    >
                        Join WhatsApp Group
                    </a>
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
                    <h3 className="dash-bot-list-title">Your bots:</h3>
                    <DashboardBotList />
                </div>
            </div>
        ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [is_dialog_open, has_dashboard_strategies]
    );
});

export default Cards;
