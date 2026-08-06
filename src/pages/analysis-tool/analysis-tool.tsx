import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';
import { useStore } from '@/hooks/useStore';
import { getAppId } from '@/components/shared/utils/config/config';
import Tabs from '@/components/shared_ui/tabs/tabs';
import DCirclesPage from '../dcircles/dcircles';
import DpTools from '../dp-tools/dp-tools';
import './analysis-tool.scss';

const ProfithubAnalysis: React.FC = observer(() => {
    const { client } = useStore() ?? {};
    
    const token = (client as any)?.token || localStorage.getItem('active_token') || localStorage.getItem('token') || localStorage.getItem('deriv_api_token') || '';
    const loginid = client?.loginid || localStorage.getItem('active_loginid') || localStorage.getItem('client.loginid') || '';
    const appId = getAppId() || '1089';

    const baseUrl = 'https://analysisprofithub.vercel.app/';
    const params = new URLSearchParams();
    
    if (token) params.set('token', token);
    if (loginid) {
        params.set('acct', loginid);
        params.set('loginid', loginid);
    }
    params.set('app_id', appId);
    params.set('appId', appId);

    const url = `${baseUrl}?${params.toString()}`;

    return (
        <IframeWrapper
            src={url}
            title='Analysis Tool'
            className='analysis-tool-container'
        />
    );
});

const AnalysisTool: React.FC = observer(() => {
    const [activeTab, setActiveTab] = useState(0);

    return (
        <div className="analysis-tools-wrapper">
            <Tabs 
                active_index={activeTab} 
                onTabItemClick={setActiveTab} 
                top
                className="analysis-tools-tabs"
                history={window.history as any}
            >
                <div label="Profithub Analysis">
                    <ProfithubAnalysis />
                </div>
                <div label="Xenon Tool (DP Tools)">
                    <DpTools />
                </div>
                <div label="DCircles">
                    <DCirclesPage />
                </div>
            </Tabs>
        </div>
    );
});

export default AnalysisTool;
