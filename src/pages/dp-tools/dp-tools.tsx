import React from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper';
import { useStore } from '@/hooks/useStore';
import { V2GetActiveToken, V2GetActiveAccountId } from '@/external/bot-skeleton/services/api/appId';

const LEGACY_APP_ID = '134249';

const DpTools: React.FC = observer(() => {
    const { client } = useStore() ?? {};
    
    const token = V2GetActiveToken() || (client as any)?.token || localStorage.getItem('token') || '';
    const loginid = V2GetActiveAccountId() || client?.loginid || localStorage.getItem('active_loginid') || '';

    const baseUrl = 'https://xenontool.netlify.app/';
    const params = new URLSearchParams();
    
    // Do NOT include legacy tokens or login ids in the iframe URL querystring.
    // Auth and session data are sent securely via the iframe bridge (postMessage).
    params.set('app_id', LEGACY_APP_ID);
    params.set('appId', LEGACY_APP_ID);
    params.set('server', 'green');

    const dpToolsUrl = `${baseUrl}?${params.toString()}`;

    return (
        <IframeWrapper
            src={dpToolsUrl}
            title='Bot Analysis Tool'
            className='dp-tools-container'
        />
    );
});

export default DpTools;

