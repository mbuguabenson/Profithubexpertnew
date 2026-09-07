import React, { useState } from 'react';
import './tradingview.scss';

const TradingView: React.FC = () => {
    const [isLoading, setIsLoading] = useState(true);

    return (
        <div className='tradingview-container'>
            <div className='tradingview-container__iframe-wrapper'>
                {isLoading && (
                    <div className='loading-overlay'>
                        <div className='spinner-ring' />
                        <span className='loading-text'>Initializing SmartCharts Workstation...</span>
                    </div>
                )}
                <iframe
                    id='trading-view-tab-iframe'
                    src='https://charts.deriv.com/deriv'
                    title='TradingView Charts'
                    allow='fullscreen'
                    onLoad={() => setIsLoading(false)}
                />
            </div>
        </div>
    );
};

export default TradingView;
