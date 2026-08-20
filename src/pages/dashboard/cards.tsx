import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import GoogleDrive from '@/components/load-modal/google-drive';
import Dialog from '@/components/shared_ui/dialog';
import MobileFullPageModal from '@/components/shared_ui/mobile-full-page-modal';
import Text from '@/components/shared_ui/text';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { Localize, localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import DashboardBotList from './bot-list/dashboard-bot-list';

type TCardProps = {
    has_dashboard_strategies: boolean;
    is_mobile: boolean;
};

type TCardArray = {
    id: string;
    icon: React.ReactElement;
    title: React.ReactElement;
    description: string;
    colorClass: string;
    callback: () => void;
};

const SoftIcons = {
    computer: (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
        </svg>
    ),
    drive: (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
            <path d="M12 12v6" />
            <path d="M9 15l3-3 3 3" />
        </svg>
    ),
    builder: (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <circle cx="12" cy="5" r="2" />
            <path d="M12 7v4" />
            <path d="M8 16h.01" />
            <path d="M16 16h.01" />
        </svg>
    ),
    lightning: (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
    ),
};

const Cards = observer(({ is_mobile, has_dashboard_strategies }: TCardProps) => {
    const { dashboard, load_modal, quick_strategy } = useStore();
    const { toggleLoadModal, setActiveTabIndex } = load_modal;
    const { isDesktop } = useDevice();
    const { onCloseDialog, dialog_options, is_dialog_open, setActiveTab, setPreviewOnPopup } = dashboard;
    const { setFormVisibility } = quick_strategy;

    const openFileLoader = () => {
        toggleLoadModal();
        setActiveTabIndex(is_mobile ? 0 : 1);
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    const openGoogleDriveDialog = () => {
        const google_drive_tab_index = isDesktop ? 2 : 1;
        toggleLoadModal();
        setActiveTabIndex(google_drive_tab_index);
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    const actions: TCardArray[] = [
        {
            id: 'my-computer',
            icon: SoftIcons.computer,
            title: is_mobile ? <Localize i18n_default_text='Local' /> : <Localize i18n_default_text='My Computer' />,
            description: 'Import local XML bots',
            colorClass: 'soft-card--cyan',
            callback: () => {
                openFileLoader();
            },
        },
        {
            id: 'google-drive',
            icon: SoftIcons.drive,
            title: <Localize i18n_default_text='Google Drive' />,
            description: 'Load from Google Drive',
            colorClass: 'soft-card--emerald',
            callback: () => {
                openGoogleDriveDialog();
            },
        },
        {
            id: 'bot-builder',
            icon: SoftIcons.builder,
            title: <Localize i18n_default_text='Bot Builder' />,
            description: 'Build strategy visual blocks',
            colorClass: 'soft-card--purple',
            callback: () => {
                setActiveTab(DBOT_TABS.BOT_BUILDER);
            },
        },
        {
            id: 'quick-strategy',
            icon: SoftIcons.lightning,
            title: <Localize i18n_default_text='Quick Strategy' />,
            description: 'Launch ready-made algorithms',
            colorClass: 'soft-card--amber',
            callback: () => {
                setActiveTab(DBOT_TABS.BOT_BUILDER);
                setFormVisibility(true);
            },
        },
    ];

    return React.useMemo(
        () => (
            <div
                className={classNames('tab__dashboard__table', {
                    'tab__dashboard__table--minimized': has_dashboard_strategies && is_mobile,
                })}
            >
                <div
                    className={classNames('tab__dashboard__table__tiles', {
                        'tab__dashboard__table__tiles--minimized': has_dashboard_strategies && is_mobile,
                    })}
                    id='tab__dashboard__table__tiles'
                >
                    {actions.map(action => {
                        const { icon, title, description, callback, id, colorClass } = action;
                        return (
                            <div
                                key={id}
                                className={classNames('tab__dashboard__table__block', colorClass, {
                                    'tab__dashboard__table__block--minimized': has_dashboard_strategies && is_mobile,
                                })}
                                onClick={callback}
                            >
                                <div className='soft-icon-orb'>
                                    {icon}
                                </div>
                                <div className="soft-card-body">
                                    <Text color='prominent' size={is_mobile ? 'xxs' : 'xs'} className="soft-card-title">
                                        {title}
                                    </Text>
                                    {!is_mobile && (
                                        <span className="soft-card-desc">{description}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {!isDesktop ? (
                        <Dialog
                            title={dialog_options.title}
                            is_visible={is_dialog_open}
                            onCancel={onCloseDialog}
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
                <DashboardBotList />
            </div>
        ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [is_dialog_open, has_dashboard_strategies]
    );
});

export default Cards;
