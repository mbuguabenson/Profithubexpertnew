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
import { HardDrive, Cloud, Bot, Zap, ArrowRight } from 'lucide-react';

type TCardProps = {
    has_dashboard_strategies: boolean;
    is_mobile: boolean;
};

type TCardArray = {
    id: string;
    icon: React.ReactElement;
    title: React.ReactElement;
    description: string;
    pillText: string;
    pillColor: string;
    callback: () => void;
};

const Soft5Icons = {
    computer: <HardDrive size={28} className="soft-5-icon text-cyan" />,
    drive: <Cloud size={28} className="soft-5-icon text-emerald" />,
    builder: <Bot size={28} className="soft-5-icon text-purple" />,
    lightning: <Zap size={28} className="soft-5-icon text-amber" />,
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
            icon: Soft5Icons.computer,
            title: is_mobile ? <Localize i18n_default_text='Local' /> : <Localize i18n_default_text='My Computer' />,
            description: 'Import saved XML bots',
            pillText: 'IMPORT XML',
            pillColor: 'pill--cyan',
            callback: () => openFileLoader(),
        },
        {
            id: 'google-drive',
            icon: Soft5Icons.drive,
            title: <Localize i18n_default_text='Google Drive' />,
            description: 'Cloud storage integration',
            pillText: 'GOOGLE DRIVE',
            pillColor: 'pill--emerald',
            callback: () => openGoogleDriveDialog(),
        },
        {
            id: 'bot-builder',
            icon: Soft5Icons.builder,
            title: <Localize i18n_default_text='Bot Builder' />,
            description: 'Visual block programming',
            pillText: 'VISUAL BUILDER',
            pillColor: 'pill--purple',
            callback: () => setActiveTab(DBOT_TABS.BOT_BUILDER),
        },
        {
            id: 'quick-strategy',
            icon: Soft5Icons.lightning,
            title: <Localize i18n_default_text='Quick Strategy' />,
            description: 'Pre-built trading algorithms',
            pillText: 'PRESET ALGOS',
            pillColor: 'pill--amber',
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
                        const { icon, title, description, pillText, pillColor, callback, id } = action;
                        return (
                            <div
                                key={id}
                                className={classNames('tab__dashboard__table__block', {
                                    'tab__dashboard__table__block--minimized': has_dashboard_strategies && is_mobile,
                                })}
                                onClick={callback}
                            >
                                <div className="dash-5-top-row">
                                    <div className='soft-icon-orb'>
                                        {icon}
                                    </div>
                                    <span className={classNames('dash-5-pill', pillColor)}>
                                        {pillText}
                                    </span>
                                </div>

                                <div className="soft-card-body">
                                    <Text color='prominent' size={is_mobile ? 'xxs' : 'xs'} className="soft-card-title">
                                        {title}
                                    </Text>
                                    {!is_mobile && (
                                        <span className="soft-card-desc">{description}</span>
                                    )}
                                </div>

                                <div className="dash-5-card-arrow">
                                    <span>Launch</span>
                                    <ArrowRight size={14} />
                                </div>
                            </div>
                        );
                    })}

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
                <DashboardBotList />
            </div>
        ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [is_dialog_open, has_dashboard_strategies]
    );
});

export default Cards;
