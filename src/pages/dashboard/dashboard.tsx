import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import OnboardTourHandler from '../tutorials/dbot-tours/onboarding-tour';
import Announcements from './announcements';
import Cards from './cards';
import InfoPanel from './info-panel';
import UltimateWelcomePage from './UltimateWelcomePage';
import { Zap, ShieldCheck, Cpu } from 'lucide-react';

type TMobileIconGuide = {
    handleTabChange: (active_number: number) => void;
};

const DashboardComponent = observer(({ handleTabChange }: TMobileIconGuide) => {
    const { load_modal, dashboard, client } = useStore();
    const { dashboard_strategies } = load_modal;
    const { active_tab, active_tour } = dashboard;
    const has_dashboard_strategies = !!dashboard_strategies?.length;
    const { isDesktop, isTablet } = useDevice();

    const userName = client.account_settings?.first_name || (client.email ? client.email.split('@')[0] : 'Trader');

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
                            
                            {/* 5.0 Executive Command Center Header */}
                            <div className='dash-5-header-card'>
                                <div className='dash-5-header-left'>
                                    <div className='dash-5-pulse-pill'>
                                        <span className='dash-5-pulse-dot' />
                                        <Cpu size={12} className='dash-5-icon' />
                                        <span>AI TRADING HUB 5.0</span>
                                    </div>
                                    <h1 className='dash-5-title'>
                                        {localize('Welcome back,')} <span className='dash-5-name'>{userName} 👋</span>
                                    </h1>
                                    <p className='dash-5-subtitle'>
                                        {localize(
                                            'Launch ready automated trading algorithms, load local XML strategies, or connect directly to Google Drive.'
                                        )}
                                    </p>
                                </div>

                                <div className='dash-5-header-telemetry'>
                                    <div className='telemetry-pill'>
                                        <ShieldCheck size={14} className='text-purple' />
                                        <div className='telemetry-info'>
                                            <span className='lbl'>SYSTEM STATUS</span>
                                            <span className='val text-green'>ONLINE & SECURE</span>
                                        </div>
                                    </div>
                                    <div className='telemetry-pill'>
                                        <Zap size={14} className='text-amber' />
                                        <div className='telemetry-info'>
                                            <span className='lbl'>LATENCY</span>
                                            <span className='val text-amber'>0.8ms (WS Direct)</span>
                                        </div>
                                    </div>
                                </div>
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
