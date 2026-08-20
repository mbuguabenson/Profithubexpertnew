import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper/iframe-wrapper';
import { useStore } from '@/hooks/useStore';
import { V2GetActiveToken, V2GetActiveAccountId } from '@/external/bot-skeleton/services/api/appId';
import { getAppId } from '@/components/shared/utils/config/config';
import { Globe, Cpu } from 'lucide-react';
import './dcircles.scss';

const LEGACY_APP_ID = '134249';

const DCirclesPage: React.FC = observer(() => {
    const { client } = useStore();
    const [engineSource, setEngineSource] = useState<'local' | 'remote'>(() => {
        return (localStorage.getItem('dcircles_engine_source') as 'local' | 'remote') || 'local';
    });

    const token = V2GetActiveToken() || (client as any)?.token || localStorage.getItem('token') || '';
    const loginid = V2GetActiveAccountId() || client?.loginid || localStorage.getItem('active_loginid') || '';
    const appId = getAppId() || LEGACY_APP_ID;

    const handleSourceToggle = (source: 'local' | 'remote') => {
        setEngineSource(source);
        localStorage.setItem('dcircles_engine_source', source);
    };

    const params = new URLSearchParams();
    params.set('app_id', appId);
    params.set('appId', appId);
    params.set('server', 'green');
    params.set('theme', 'dark');

    if (token) params.set('token1', token);
    if (loginid) params.set('acct1', loginid);

    const baseUrl = engineSource === 'remote'
        ? 'https://dcircles-six.vercel.app/'
        : '/circles/index.html';

    const dcirclesUrl = `${baseUrl}?${params.toString()}`;

    return (
        <div className="dcircles-container-wrapper">
            <div className="dcircles-toolbar">
                <div className="toolbar-info">
                    <span className="live-dot" />
                    <span className="toolbar-title">DCircles Radial Analysis</span>
                </div>

                <div className="source-switcher">
                    <button
                        type="button"
                        className={`source-btn ${engineSource === 'local' ? 'source-btn--active' : ''}`}
                        onClick={() => handleSourceToggle('local')}
                        title="Local Engine with full native CSS & styling (/circles/index.html)"
                    >
                        <Cpu size={14} /> Local Engine (Styled)
                    </button>
                    <button
                        type="button"
                        className={`source-btn ${engineSource === 'remote' ? 'source-btn--active' : ''}`}
                        onClick={() => handleSourceToggle('remote')}
                        title="Remote Vercel Engine (https://dcircles-six.vercel.app/)"
                    >
                        <Globe size={14} /> Vercel Server
                    </button>
                </div>
            </div>

            <div className="dcircles-iframe-box">
                <IframeWrapper
                    src={dcirclesUrl}
                    title="DCircles"
                    className="dcircles-iframe"
                />
            </div>
        </div>
    );
});

export default DCirclesPage;
