import React from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';
import { useStore } from '@/hooks/useStore';
import { getAppId } from '@/components/shared/utils/config/config';

const DpTools: React.FC = observer(() => {
    const { client } = useStore() ?? {};
    
    // Obtain active token and login ID to authenticate Deriv WebSocket streams in DP Tools
    const token = (client as any)?.token || localStorage.getItem('active_token') || localStorage.getItem('token') || localStorage.getItem('deriv_api_token') || '';
    const loginid = client?.loginid || localStorage.getItem('active_loginid') || localStorage.getItem('client.loginid') || '';
    const appId = getAppId() || '1089';

    // Construct target iframe URL with parameters required for live market price feeds
    const baseUrl = 'https://bot-analysis-tool-belex.web.app/';
    const params = new URLSearchParams();
    
    if (token) params.set('token', token);
    if (loginid) {
        params.set('acct', loginid);
        params.set('loginid', loginid);
    }
    params.set('app_id', appId);
    params.set('appId', appId);
    params.set('server', 'green');

    const dpToolsUrl = `${baseUrl}?${params.toString()}`;

    return (
        <IframeWrapper
            src={dpToolsUrl}
            title='DP Tools'
            className='dp-tools-container'
        />
    );
});

export default DpTools;
