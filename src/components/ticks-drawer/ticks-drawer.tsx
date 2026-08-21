import React, { useEffect, useState, useRef } from 'react';
import { api_base } from '@/external/bot-skeleton';
import { safeSubscribe } from '@/utils/websocket-handler';
import './ticks-drawer.scss';

interface TicksDrawerProps {
    symbol: string | null;
    isOpen: boolean;
    onClose: () => void;
}

export const TicksDrawer: React.FC<TicksDrawerProps> = ({ symbol, isOpen, onClose }) => {
    const [ticks, setTicks] = useState<{ quote: number; epoch: number; digit: number }[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const unsubRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (!symbol || !isOpen) return;

        let isMounted = true;
        setTicks([]);
        setIsLoading(true);

        const fetchHistoryAndSubscribe = async () => {
            if (unsubRef.current) {
                unsubRef.current();
                unsubRef.current = null;
            }

            try {
                // Fetch history
                const historyRes = await api_base.api.send({
                    ticks_history: symbol,
                    count: 120,
                    end: 'latest',
                    style: 'ticks'
                });

                if (!isMounted) return;

                if (historyRes.history && historyRes.history.prices) {
                    const pipSize = symbol.includes('BOOM') || symbol.includes('CRASH') ? 4 : 3;
                    const formattedTicks = historyRes.history.prices.map((price: number, idx: number) => {
                        const digit = parseInt(price.toFixed(pipSize).slice(-1), 10);
                        return {
                            quote: price,
                            epoch: historyRes.history.times[idx],
                            digit
                        };
                    });
                    setTicks(formattedTicks);
                }
                setIsLoading(false);

                // Subscribe to live updates
                const observable = api_base.api.subscribe({
                    ticks: symbol,
                    subscribe: 1
                });

                const subscription = safeSubscribe(
                    observable,
                    (res: any) => {
                        if (res.tick && res.tick.quote) {
                            setTicks(prev => {
                                const pipSize = symbol.includes('BOOM') || symbol.includes('CRASH') ? 4 : 3;
                                const price = res.tick.quote;
                                const digit = parseInt(price.toFixed(pipSize).slice(-1), 10);
                                const newTick = { quote: price, epoch: res.tick.epoch, digit };
                                
                                // Keep only the last 120
                                const updated = [...prev, newTick];
                                if (updated.length > 120) {
                                    updated.shift();
                                }
                                return updated;
                            });
                        }
                    },
                    (err) => console.warn('[TicksDrawer] Live tick error', err)
                );

                if (subscription && typeof subscription.unsubscribe === 'function') {
                    unsubRef.current = () => subscription.unsubscribe();
                }
            } catch (err) {
                console.error('[TicksDrawer] Error fetching history', err);
                setIsLoading(false);
            }
        };

        fetchHistoryAndSubscribe();

        return () => {
            isMounted = false;
            if (unsubRef.current) unsubRef.current();
        };
    }, [symbol, isOpen]);

    if (!isOpen) return null;

    const stats = ticks.reduce((acc, tick) => {
        const d = tick.digit;
        if (d >= 0 && d <= 9) acc[d] = (acc[d] || 0) + 1;
        return acc;
    }, {} as Record<number, number>);

    return (
        <div className="ticks-drawer">
            <div className="ticks-drawer__overlay" onClick={onClose} />
            <div className="ticks-drawer__content">
                <div className="ticks-drawer__header">
                    <h3>{symbol} - Last 120 Ticks</h3>
                    <button className="ticks-drawer__close" onClick={onClose}>×</button>
                </div>
                
                {isLoading ? (
                    <div className="ticks-drawer__loading">Loading ticks...</div>
                ) : (
                    <>
                        <div className="ticks-drawer__stats">
                            {Array.from({ length: 10 }).map((_, i) => (
                                <div key={i} className="ticks-drawer__stat-box">
                                    <span className="stat-digit">{i}</span>
                                    <span className="stat-count">
                                        {stats[i] || 0}
                                        <small>{(((stats[i] || 0) / 120) * 100).toFixed(1)}%</small>
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div className="ticks-drawer__grid">
                            {ticks.map((t, idx) => (
                                <div 
                                    key={t.epoch + '-' + idx} 
                                    className={`tick-box tick-box--${t.digit % 2 === 0 ? 'even' : 'odd'}`}
                                >
                                    {t.digit}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
