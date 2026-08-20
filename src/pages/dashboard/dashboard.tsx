import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useDevice } from '@deriv-com/ui';
import OnboardTourHandler from '../tutorials/dbot-tours/onboarding-tour';
import Announcements from './announcements';
import Cards from './cards';
import InfoPanel from './info-panel';
import UltimateWelcomePage from './UltimateWelcomePage';

type TMobileIconGuide = {
    handleTabChange: (active_number: number) => void;
};

const DashboardComponent = observer(({ handleTabChange }: TMobileIconGuide) => {
    const { load_modal, dashboard, client } = useStore();
    const { dashboard_strategies } = load_modal;
    const { active_tab, active_tour } = dashboard;
    const has_dashboard_strategies = !!dashboard_strategies?.length;
    const { isDesktop, isTablet } = useDevice();

    return (
        <React.Fragment>
            {has_dashboard_strategies ? (
                <div
                    className={classNames('tab__dashboard', {
                        'tab__dashboard--tour-active': active_tour,
                    })}
                >
                    <div className='tab__dashboard__content'>
                        {client.is_logged_in && (
                            <Announcements is_mobile={!isDesktop} is_tablet={isTablet} handleTabChange={handleTabChange} />
                        )}
                        <div className='quick-panel'>
                            {/* Top Hub Welcome Notice */}
                            <div className='dash-hub-header-notice'>
                                <p className='notice-text'>
                                    Welcome to 360 Trading Hub. Serving your trading needs for more than 3 years and still strong with more advanced tools & Bots.
                                </p>
                            </div>

                            <Cards has_dashboard_strategies={has_dashboard_strategies} is_mobile={!isDesktop} />
                        </div>
                    </div>
                </div>
            ) : (
                <UltimateWelcomePage handleTabChange={handleTabChange} />
            )}
            <InfoPanel />
            {active_tab === 0 && <OnboardTourHandler is_mobile={!isDesktop} />}
        </React.Fragment>
    );
});

export default DashboardComponent;
