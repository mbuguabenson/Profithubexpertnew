import React, { useEffect, useState, useRef } from 'react';
import { api_base } from '@/external/bot-skeleton';
import { safeSubscribe } from '@/utils/websocket-handler';
import './markets-sidebar.scss';

const CURATED_MARKETS = [
    { symbol: 'R_10', name: 'Volatility 10 Index' },
    { symbol: 'R_25', name: 'Volatility 25 Index' },
    { symbol: 'R_50', name: 'Volatility 50 Index' },
    { symbol: 'R_75', name: 'Volatility 75 Index' },
    { symbol: 'R_100', name: 'Volatility 100 Index' },
    { symbol: 'BOOM1000', name: 'Boom 1000 Index' },
    { symbol: 'CRASH1000', name: 'Crash 1000 Index' },
];

export type MarketData = {
    symbol: string;
    name: string;
    price: number | null;
    lastDigit: number | null;
    direction: 'up' | 'down' | 'flat';
};

interface MarketsSidebarProps {
    onSelectMarket: (symbol: string) => void;
    selectedSymbol: string | null;
}

export const MarketsSidebar: React.FC<MarketsSidebarProps> = ({ onSelectMarket, selectedSymbol }) => {
    const [marketsData, setMarketsData] = useState<Record<string, MarketData>>(
        CURATED_MARKETS.reduce((acc, m) => ({ ...acc, [m.symbol]: { ...m, price: null, lastDigit: null, direction: 'flat' } }), {})
    );
    
    const unsubs = useRef<Array<() => void>>([]);

    useEffect(() => {
        const subscribeToMarkets = async () => {
            unsubs.current.forEach(unsub => unsub());
            unsubs.current = [];

            if (!api_base.api) return;

            CURATED_MARKETS.forEach(({ symbol }) => {
                const observable = api_base.api.subscribe({
                    ticks: symbol,
                    subscribe: 1,
                });

                const subscription = safeSubscribe(
                    observable,
                    (res: any) => {
                        if (res.tick && res.tick.quote) {
                            setMarketsData(prev => {
                                const current = prev[symbol];
                                const price = res.tick.quote;
                                // Deriv tick prices often have 4 or 5 decimal places depending on market.
                                // A safe fallback for last digit:
                                const pipSize = symbol.includes('BOOM') || symbol.includes('CRASH') ? 4 : 3;
                                const lastDigitStr = price.toFixed(pipSize).slice(-1);
                                const lastDigit = parseInt(lastDigitStr, 10);
                                const direction = current.price ? (price > current.price ? 'up' : price < current.price ? 'down' : 'flat') : 'flat';
                                
                                return {
                                    ...prev,
                                    [symbol]: {
                                        ...current,
                                        price,
                                        lastDigit,
                                        direction
                                    }
                                };
                            });
                        }
                    },
                    (err) => console.warn('[MarketsSidebar] Tick error for', symbol, err)
                );
                
                if (subscription && typeof subscription.unsubscribe === 'function') {
                    unsubs.current.push(() => subscription.unsubscribe());
                }
            });
        };

        const timeout = setTimeout(() => {
            subscribeToMarkets();
        }, 1500);

        return () => {
            clearTimeout(timeout);
            unsubs.current.forEach(unsub => unsub());
        };
    }, []);

    return (
        <div className="markets-sidebar">
            <div className="markets-sidebar__header">
                <h3>Live Markets</h3>
            </div>
            <div className="markets-sidebar__list">
                {CURATED_MARKETS.map(({ symbol, name }) => {
                    const data = marketsData[symbol];
                    const isSelected = selectedSymbol === symbol;
                    
                    return (
                        <div 
                            key={symbol} 
                            className={`market-card ${isSelected ? 'market-card--selected' : ''}`}
                            onClick={() => onSelectMarket(symbol)}
                        >
                            <div className="market-card__info">
                                <span className="market-card__name">{name}</span>
                                <span className="market-card__symbol">{symbol}</span>
                            </div>
                            <div className="market-card__data">
                                <span className={`market-card__price market-card__price--${data.direction}`}>
                                    {data.price ? data.price.toFixed(4) : '---'}
                                </span>
                                <span className="market-card__digit">
                                    {data.lastDigit !== null ? data.lastDigit : '-'}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
