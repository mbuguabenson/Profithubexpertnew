import React, { useState, useEffect } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import Text from '@/components/shared_ui/text';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
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
                        <div className='ultimate-landing__bg-glow ultimate-landing__bg-glow--primary' style={{ zIndex: 0 }} />
                        <div className='ultimate-landing__bg-glow ultimate-landing__bg-glow--secondary' style={{ zIndex: 0 }} />
                        {client.is_logged_in && (
                            <Announcements is_mobile={!isDesktop} is_tablet={isTablet} handleTabChange={handleTabChange} />
                        )}
                        <div className='quick-panel'>
                            <div
                                className={classNames('tab__dashboard__header', {
                                    'tab__dashboard__header--listed': isDesktop && has_dashboard_strategies,
                                })}
                            >
                                <div className='welcome-section'>
                                    <Text
                                        className='welcome-title'
                                        as='h1'
                                        color='prominent'
                                        size={isDesktop ? 'lg' : 'md'}
                                        lineHeight='xxl'
                                        weight='bold'
                                    >
                                        {localize('Hello Trader, Welcome to Ultimate traders site')}
                                    </Text>
                                    <Text
                                        className='get-started-text'
                                        as='p'
                                        color='prominent'
                                        lineHeight='m'
                                        size={isDesktop ? 'md' : 'sm'}
                                    >
                                        {localize('Get started')}
                                    </Text>
                                </div>
                                <Text
                                    as='p'
                                    color='prominent'
                                    lineHeight='s'
                                    size={isDesktop ? 's' : 'xxs'}
                                    className={classNames('subtitle', { 'subtitle__has-list': has_dashboard_strategies })}
                                >
                                    {localize(
                                        'Import a bot from your computer or Google Drive, build it from scratch, or start with a quick strategy.'
                                    )}
                                </Text>
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
