import React, { useEffect, useState, useCallback, useMemo } from 'react';
import RunStrategy from '@/pages/dashboard/run-strategy';
import './topbar-trade-controller.scss';

export interface TopBarTradeControllerProps {
    currentTabKey: string;
}

type EngineStatus = {
    isRunning: boolean;
    state?: string;
    profit?: number;
};

export const TopBarTradeController: React.FC<TopBarTradeControllerProps> = ({ currentTabKey }) => {
    const [engineStatuses, setEngineStatuses] = useState<Record<string, EngineStatus>>({});

    // Listen to real-time status updates dispatched by individual trading pages
    useEffect(() => {
        const handleStatusUpdate = (e: Event) => {
            const customEvent = e as CustomEvent<{ tab: string; isRunning: boolean; state?: string; profit?: number }>;
            if (customEvent.detail && customEvent.detail.tab) {
                setEngineStatuses(prev => ({
                    ...prev,
                    [customEvent.detail.tab]: {
                        isRunning: customEvent.detail.isRunning,
                        state: customEvent.detail.state,
                        profit: customEvent.detail.profit,
                    },
                }));
            }
        };

        window.addEventListener('PH_ENGINE_STATUS_UPDATE', handleStatusUpdate);
        return () => {
            window.removeEventListener('PH_ENGINE_STATUS_UPDATE', handleStatusUpdate);
        };
    }, []);

    const normalizedTab = (currentTabKey || '').toLowerCase();
    const currentStatus = engineStatuses[normalizedTab] || { isRunning: false };

    // Trigger action on the active trading engine
    const handleTriggerAction = useCallback(() => {
        // 1. Dispatch custom event
        window.dispatchEvent(
            new CustomEvent('PH_TRIGGER_ENGINE_ACTION', {
                detail: {
                    tab: normalizedTab,
                    action: 'toggle',
                },
            })
        );

        // 2. DOM fallback trigger in case page hasn't mounted listener yet
        setTimeout(() => {
            if (normalizedTab === 'elite_pro') {
                const btn = document.querySelector(
                    '.ep-btn--start, .ep-btn--stop, button[data-testid="elite_pro_toggle"]'
                ) as HTMLElement;
                if (btn) btn.click();
            } else if (normalizedTab === 'poverty_hunter') {
                const btn = document.querySelector(
                    '.ph-btn--start, .ph-btn--stop, button[data-testid="poverty_hunter_toggle"]'
                ) as HTMLElement;
                if (btn) btn.click();
            } else if (normalizedTab === 'auto_x_eo') {
                const btn = document.querySelector(
                    '.btn-start-auto, .btn-stop-auto, button[data-testid="auto_x_eo_toggle"]'
                ) as HTMLElement;
                if (btn) btn.click();
            } else if (normalizedTab === 'marketkiller') {
                const btn = document.querySelector(
                    '.strike-btn, .mkill-btn, button[data-testid="marketkiller_strike"]'
                ) as HTMLElement;
                if (btn) btn.click();
            } else if (normalizedTab === 'market_hunter_pro') {
                const btn = document.querySelector(
                    '.mhp-auto-btn, .proai-btn-load, button[data-testid="market_hunter_start"]'
                ) as HTMLElement;
                if (btn) btn.click();
            } else if (normalizedTab === 'ai_trading_engine') {
                const btn = document.querySelector(
                    '.entry-scanner-start, .ai-engine-run-btn, button[data-testid="ai_engine_start"]'
                ) as HTMLElement;
                if (btn) btn.click();
            } else if (normalizedTab === 'scanner') {
                const btn = document.querySelector(
                    '.scanner-auto-btn, .scanner-run-btn, button[data-testid="scanner_start"]'
                ) as HTMLElement;
                if (btn) btn.click();
            } else if (normalizedTab === 'manual_trading') {
                const btn = document.querySelector(
                    '.manual-trade-btn, .smart-trading-buy, button[data-testid="manual_trade_buy"]'
                ) as HTMLElement;
                if (btn) btn.click();
            }
        }, 10);
    }, [normalizedTab]);

    const tabConfig = useMemo(() => {
        switch (normalizedTab) {
            case 'elite_pro':
                return {
                    name: 'Elite Pro',
                    startLabel: 'START ELITE PRO',
                    stopLabel: 'STOP ELITE PRO',
                    icon: '⚡',
                    canToggle: true,
                };
            case 'poverty_hunter':
                return {
                    name: 'Poverty Hunter',
                    startLabel: 'START POVERTY HUNTER',
                    stopLabel: 'STOP POVERTY HUNTER',
                    icon: '🎯',
                    canToggle: true,
                };
            case 'auto_x_eo':
                return {
                    name: 'AUTO X E/O',
                    startLabel: 'START AUTO X E/O',
                    stopLabel: 'STOP AUTO X E/O',
                    icon: '🚀',
                    canToggle: true,
                };
            case 'marketkiller':
                return {
                    name: 'Market Killer',
                    startLabel: 'STRIKE MARKET KILLER',
                    stopLabel: 'STOP MARKET KILLER',
                    icon: '⚔️',
                    canToggle: true,
                };
            case 'market_hunter_pro':
                return {
                    name: 'Market Hunter',
                    startLabel: 'START AUTO-HUNTER',
                    stopLabel: 'STOP AUTO-HUNTER',
                    icon: '🏹',
                    canToggle: true,
                };
            case 'ai_trading_engine':
                return {
                    name: 'AI Trading Engine',
                    startLabel: 'START AI ENGINE',
                    stopLabel: 'STOP AI ENGINE',
                    icon: '🤖',
                    canToggle: true,
                };
            case 'scanner':
                return {
                    name: 'AI Scanner',
                    startLabel: 'START AI SCANNER',
                    stopLabel: 'STOP SCANNER',
                    icon: '🔍',
                    canToggle: true,
                };
            case 'manual_trading':
                return {
                    name: 'Manual Trading',
                    startLabel: 'QUICK STRIKE TRADE',
                    stopLabel: 'CANCEL TRADE',
                    icon: '🔥',
                    canToggle: false,
                };
            default:
                return null;
        }
    }, [normalizedTab]);

    // If on standard bot builder, dashboard, chart, etc., render the standard RunStrategy button
    if (!tabConfig) {
        return <RunStrategy />;
    }

    const isRunning = Boolean(currentStatus.isRunning);

    return (
        <div className='topbar-trade-controller'>
            <button
                className={`topbar-trade-btn ${isRunning ? 'topbar-trade-btn--running' : 'topbar-trade-btn--idle'}`}
                onClick={handleTriggerAction}
                title={`${isRunning ? 'Stop' : 'Start'} ${tabConfig.name}`}
            >
                <div className='topbar-trade-btn__pulse' />
                <div className='topbar-trade-btn__icon-box'>
                    {isRunning ? (
                        <svg width='14' height='14' viewBox='0 0 24 24' fill='currentColor'>
                            <rect x='4' y='4' width='16' height='16' rx='3' />
                        </svg>
                    ) : (
                        <svg width='14' height='14' viewBox='0 0 24 24' fill='currentColor'>
                            <polygon points='5 3 19 12 5 21 5 3' />
                        </svg>
                    )}
                </div>
                <span className='topbar-trade-btn__label'>
                    {isRunning ? tabConfig.stopLabel : tabConfig.startLabel}
                </span>
                <span className='topbar-trade-btn__tag'>{tabConfig.icon}</span>
            </button>
        </div>
    );
};

export default TopBarTradeController;
