import React from 'react';
import { observer } from 'mobx-react-lite';
import IframeWrapper from '@/components/iframe-wrapper/iframe-wrapper';
import { getAppId } from '@/components/shared/utils/config/config';
import './dtrader.scss';

const DTraderPage: React.FC = observer(() => {
    const appId = getAppId() || '121856';
    const baseUrl = process.env.DTRADER_URL || 'https://deriv-dtrader.vercel.app';
    const embedBase = baseUrl.includes('/dtrader') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/dtrader`;
    const embedUrl = `${embedBase}?chart_type=area&interval=1t&symbol=1HZ100V&trade_type=accumulator&app_id=${appId}&lang=EN&embed=true`;

    return (
        <div className="dtrader-page-container">
            <div className="dtrader-iframe-wrapper">
                <IframeWrapper src={embedUrl} title="DTrader Terminal" />
            </div>
        </div>
    );
});

export default DTraderPage;
