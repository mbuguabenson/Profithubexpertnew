import React from 'react';
import clsx from 'clsx';
import { SignalStatus } from '../engine/SignalEngine';
import { SignalWithSymbol } from '../engine/TickSubscriber';
import { useStore } from '@/hooks/useStore';
import './SignalCard.scss';

interface SignalCardProps {
    signal: SignalWithSymbol;
    isSuper?: boolean;
}

export const SignalCard: React.FC<SignalCardProps> = ({ signal, isSuper = false }) => {
    const { scanner } = useStore();

    const getStatusClass = (status: SignalStatus) => {
        switch (status) {
            case 'STRONG': return 'status-strong';
            case 'TRADE NOW': return 'status-trade-now';
            case 'WAIT': return 'status-wait';
            case 'NEUTRAL': return 'status-neutral';
            default: return 'status-neutral';
        }
    };

    const formatType = (type: string) => {
        return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };

    const probPct = Math.min(100, Math.max(0, signal.probability));
    const isTradeNow = signal.status === 'TRADE NOW' || signal.status === 'STRONG';

    return (
        <div className={clsx('signal-card', isSuper && 'super-signal', getStatusClass(signal.status))}>
            <div className="signal-card__glow" />
            <div className="signal-card__header">
                <div className="title-group">
                    <h3 className="signal-card__title">{formatType(signal.type)}</h3>
                    {signal.symbol && (
                        <span className="signal-card__symbol-badge">
                            {signal.symbol.toUpperCase()}
                        </span>
                    )}
                </div>
                <span className={clsx('signal-card__status-chip', getStatusClass(signal.status))}>
                    {signal.status}
                </span>
            </div>
            
            <div className="signal-card__body">
                <div className="signal-card__probability-container">
                    <div 
                        className="signal-card__probability-circle"
                        style={{
                            background: `conic-gradient(from 0deg, ${isSuper ? '#8b5cf6' : isTradeNow ? '#10b981' : '#f59e0b'} ${probPct}%, rgba(255, 255, 255, 0.08) ${probPct}%)`
                        }}
                    >
                        <div className="signal-card__probability-inner">
                            <span className="signal-card__probability-text">{probPct.toFixed(0)}%</span>
                            <span className="signal-card__probability-label">POWER</span>
                        </div>
                    </div>
                </div>

                <div className="signal-card__details">
                    <p className="signal-card__recommendation">{signal.recommendation}</p>
                    <div className="signal-card__entry-condition">
                        <span className="entry-label">ENTRY TRIGGER:</span> {signal.entryCondition}
                    </div>
                    {signal.targetDigit !== undefined && (
                        <div className="signal-card__target">
                            Target Digit: <span className="signal-card__target-digit">{signal.targetDigit}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="signal-card__footer">
                <button
                    className="signal-card__trade-btn"
                    onClick={() => {
                        if (scanner) {
                            scanner.setSelectedStrategy(signal.type as any);
                            if (signal.symbol) scanner.setSingleMarketSymbol(signal.symbol);
                            scanner.setScannerVisibility(true);
                        }
                    }}
                >
                    Trade Strategy ⚡
                </button>
            </div>
        </div>
    );
};
