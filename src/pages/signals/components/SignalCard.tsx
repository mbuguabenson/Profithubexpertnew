import React from 'react';
import clsx from 'clsx';
import { SignalStatus } from '../engine/SignalEngine';
import { SignalWithSymbol } from '../engine/TickSubscriber';
import { useStore } from '@/hooks/useStore';
import { Zap, Target, ArrowRight } from 'lucide-react';
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
        <div className={clsx('soft-signal-card', isSuper && 'soft-signal-card--super', getStatusClass(signal.status))}>
            <div className="soft-signal-card__top-glow" />
            
            {/* Header: Title, Symbol Badge & Status Chip */}
            <div className="soft-signal-card__header">
                <div className="title-group">
                    <h4 className="soft-signal-card__title">{formatType(signal.type)}</h4>
                    {signal.symbol && (
                        <span className="soft-signal-card__symbol-badge">
                            {signal.symbol.toUpperCase()}
                        </span>
                    )}
                </div>
                <span className={clsx('soft-signal-card__status-chip', getStatusClass(signal.status))}>
                    {isTradeNow && <Zap size={12} className="chip-icon" />}
                    {signal.status}
                </span>
            </div>
            
            {/* Body: Conic Power Orb & Details */}
            <div className="soft-signal-card__body">
                <div className="soft-signal-card__power-orb-wrap">
                    <div 
                        className="soft-signal-card__power-orb"
                        style={{
                            background: `conic-gradient(from 0deg, ${isSuper ? '#a855f7' : isTradeNow ? '#10b981' : '#f59e0b'} ${probPct}%, rgba(15, 23, 42, 0.9) ${probPct}%)`
                        }}
                    >
                        <div className="soft-signal-card__power-orb-inner">
                            <span className="power-text">{probPct.toFixed(0)}%</span>
                            <span className="power-label">POWER</span>
                        </div>
                    </div>
                </div>

                <div className="soft-signal-card__details">
                    <p className="soft-signal-card__recommendation">{signal.recommendation}</p>
                    
                    <div className="soft-signal-card__entry-box">
                        <span className="entry-label">TRIGGER:</span> {signal.entryCondition}
                    </div>

                    {signal.targetDigit !== undefined && (
                        <div className="soft-signal-card__target">
                            <Target size={14} className="target-icon" />
                            <span>Target Digit:</span>
                            <span className="target-digit-badge">{signal.targetDigit}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer Action */}
            <div className="soft-signal-card__footer">
                <button
                    type="button"
                    className="soft-signal-card__trade-btn"
                    onClick={() => {
                        if (scanner) {
                            void scanner.loadSignalStrategyToBuilder({
                                symbol: signal.symbol,
                                type: signal.type as any,
                                status: signal.status === 'STRONG' ? 'TRADE NOW' : signal.status,
                                probability: signal.probability,
                                recommendation: signal.recommendation,
                                entryCondition: signal.entryCondition,
                                targetDigit: signal.targetDigit,
                            });
                        }
                    }}
                >
                    <span>Trade Strategy ⚡</span>
                    <ArrowRight size={14} />
                </button>
            </div>
        </div>
    );
};
