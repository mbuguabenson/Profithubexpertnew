import React from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper/iframe-wrapper';
import { useStore } from '@/hooks/useStore';
import { V2GetActiveToken, V2GetActiveAccountId } from '@/external/bot-skeleton/services/api/appId';
import { getAppId } from '@/components/shared/utils/config/config';
import './dcircles.scss';

const LEGACY_APP_ID = '134249';

const DCirclesPage: React.FC = observer(() => {
    const { client } = useStore();

    const token = V2GetActiveToken() || (client as any)?.token || localStorage.getItem('token') || '';
    const loginid = V2GetActiveAccountId() || client?.loginid || localStorage.getItem('active_loginid') || '';
    const appId = getAppId() || LEGACY_APP_ID;

    const params = new URLSearchParams();
    params.set('app_id', appId);
    params.set('appId', appId);
    params.set('server', 'green');
    params.set('theme', 'dark');

    if (token) params.set('token1', token);
    if (loginid) params.set('acct1', loginid);

    const dcirclesUrl = `/circles/index.html?${params.toString()}`;

    return (
        <div className="dcircles-container-wrapper">
            <div className="dcircles-iframe-box">
                <IframeWrapper
                    src={dcirclesUrl}
                    title="DCircles Analysis"
                    className="dcircles-iframe"
                />
            </div>
        </div>
    );
});

export default DCirclesPage;
