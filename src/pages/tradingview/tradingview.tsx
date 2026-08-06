import React, { useState } from 'react';
import { Maximize2, RefreshCw, BarChart2 } from 'lucide-react';
import './tradingview.scss';

const TradingView: React.FC = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [iframeKey, setIframeKey] = useState(0);

    const handleReload = () => {
        setIsLoading(true);
        setIframeKey(prev => prev + 1);
    };

    const toggleFullscreen = () => {
        const elem = document.getElementById('trading-view-tab-iframe');
        if (elem) {
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            }
        }
    };

    return (
        <div className='tradingview-container'>
            <header className='tradingview-container__toolbar'>
                <div className='tradingview-container__brand'>
                    <div className='brand-logo'>
                        <BarChart2 size={18} />
                    </div>
                    <div className='brand-text'>
                        <span className='title'>TradingView Workstation</span>
                        <span className='subtitle'>SmartCharts HD Pro</span>
                    </div>
                </div>

                <div className='tradingview-container__controls'>
                    <div className='tradingview-container__status-badge'>
                        <span className='pulse-dot' />
                        <span>Live Stream</span>
                    </div>

                    <button 
                        type='button'
                        className='tradingview-container__action-btn'
                        onClick={handleReload}
                        title='Reload Chart Stream'
                    >
                        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                        <span>Reload</span>
                    </button>

                    <button 
                        type='button'
                        className='tradingview-container__action-btn active'
                        onClick={toggleFullscreen}
                        title='Expand Fullscreen'
                    >
                        <Maximize2 size={14} />
                        <span>Fullscreen</span>
                    </button>
                </div>
            </header>

            <div className='tradingview-container__iframe-wrapper'>
                {isLoading && (
                    <div className='loading-overlay'>
                        <div className='spinner-ring' />
                        <span className='loading-text'>Initializing SmartCharts Workstation...</span>
                    </div>
                )}
                <iframe
                    key={iframeKey}
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
