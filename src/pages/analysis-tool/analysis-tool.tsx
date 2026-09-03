import React from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';
import { useStore } from '@/hooks/useStore';
import { getAppId } from '@/components/shared/utils/config/config';
import './analysis-tool.scss';

const ProfithubAnalysis: React.FC = observer(() => {
    const { client } = useStore() ?? {};

    const token =
        (client as any)?.token ||
        localStorage.getItem('active_token') ||
        localStorage.getItem('token') ||
        localStorage.getItem('deriv_api_token') ||
        '';
    const loginid =
        client?.loginid || localStorage.getItem('active_loginid') || localStorage.getItem('client.loginid') || '';
    const appId = getAppId() || '1089';

    const baseUrl = 'https://analysisprofithub.vercel.app/';
    const params = new URLSearchParams();

    // Do NOT include legacy tokens or login ids in the iframe URL querystring.
    // Auth and session data are sent securely via the iframe bridge (postMessage).
    params.set('app_id', appId);
    params.set('appId', appId);

    const url = `${baseUrl}?${params.toString()}`;

    return <IframeWrapper src={url} title='Analysis Tool' className='analysis-tool-container' />;
});

const AnalysisTool: React.FC = observer(() => {
    return (
        <div className='analysis-tools-wrapper' style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <ProfithubAnalysis />
        </div>
    );
});

export default AnalysisTool;
