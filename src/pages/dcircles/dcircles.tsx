import React from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper/iframe-wrapper';
import { useStore } from '@/hooks/useStore';
import { V2GetActiveToken, V2GetActiveAccountId } from '@/external/bot-skeleton/services/api/appId';

const LEGACY_APP_ID = '134249';

const DCirclesPage: React.FC = observer(() => {
    const { client } = useStore();
    const token = V2GetActiveToken() || (client as any)?.token || localStorage.getItem('token') || '';
    const loginid = V2GetActiveAccountId() || client?.loginid || localStorage.getItem('active_loginid') || '';

    const baseUrl = 'https://dcircles-six.vercel.app/';
    const params = new URLSearchParams();

    if (token) params.set('token', token);
    if (loginid) {
        params.set('acct', loginid);
        params.set('loginid', loginid);
    }
    params.set('app_id', LEGACY_APP_ID);
    params.set('appId', LEGACY_APP_ID);
    params.set('server', 'green');

    const dcirclesUrl = `${baseUrl}/?${params.toString()}`;

    return (
        <div style={{ width: '100%', height: '100%', minHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <IframeWrapper
                src={dcirclesUrl}
                title='DCircles'
                className='dcircles-iframe'
            />
        </div>
    );
});

export default DCirclesPage;
