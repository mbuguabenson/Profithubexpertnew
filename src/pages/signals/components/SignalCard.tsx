import React from 'react';
import clsx from 'clsx';
import { SignalStatus } from '../engine/SignalEngine';
import { SignalWithSymbol } from '../engine/TickSubscriber';
import { useStore } from '@/hooks/useStore';
import { Zap, Target, ArrowRight, Activity } from 'lucide-react';
import './SignalCard.scss';

interface SignalCardProps {
    signal: SignalWithSymbol;
    isSuper?: boolean;
}

export const SignalCard: React.FC<SignalCardProps> = ({ signal, isSuper = false }) => {
    const { scanner } = useStore();

    const getStatusClass = (status: SignalStatus) => {
        switch (status) {
            case 'STRONG':
                return 'status-strong';
            case 'TRADE NOW':
                return 'status-trade-now';
            case 'WAIT':
                return 'status-wait';
            case 'NEUTRAL':
                return 'status-neutral';
            default:
                return 'status-neutral';
        }
    };

    const formatType = (type: string) => {
        return type
            .split('_')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    };

    const probPct = Math.min(100, Math.max(0, Math.round(signal.probability || 0)));
    const isTradeNow = signal.status === 'TRADE NOW' || signal.status === 'STRONG';

    return (
        <div
            className={clsx(
                'modern-signal-card',
                isSuper && 'modern-signal-card--super',
                getStatusClass(signal.status)
            )}
        >
            {/* Top glowing accent line */}
            <div className='modern-signal-card__top-bar' />

            {/* Header: Type, Symbol & Status */}
            <div className='modern-signal-card__header'>
                <div className='modern-signal-card__title-row'>
                    <span className='modern-signal-card__type'>{formatType(signal.type)}</span>
                    {signal.symbol && (
                        <span className='modern-signal-card__symbol'>{signal.symbol.toUpperCase()}</span>
                    )}
                </div>
                <div className={clsx('modern-signal-card__badge', getStatusClass(signal.status))}>
                    <span className='badge-dot' />
                    <span className='badge-text'>{signal.status}</span>
                </div>
            </div>

            {/* Power / Confidence Gauge */}
            <div className='modern-signal-card__meter'>
                <div className='meter-header'>
                    <span className='meter-label'>
                        <Activity size={12} className='meter-icon' /> Confidence
                    </span>
                    <span className='meter-val'>{probPct}%</span>
                </div>
                <div className='meter-track'>
                    <div
                        className='meter-bar'
                        style={{
                            width: `${probPct}%`,
                            background: isSuper
                                ? 'linear-gradient(90deg, #7c3aed, #c084fc)'
                                : isTradeNow
                                ? 'linear-gradient(90deg, #059669, #10b981, #34d399)'
                                : 'linear-gradient(90deg, #d97706, #f59e0b)',
                        }}
                    />
                </div>
            </div>

            {/* Recommendation & Trigger Box */}
            <div className='modern-signal-card__content'>
                <div className='modern-signal-card__recom-wrap'>
                    <span className='recom-tag'>SIGNAL</span>
                    <span className='recom-text'>{signal.recommendation}</span>
                </div>

                <div className='modern-signal-card__trigger-box'>
                    <span className='trigger-tag'>TRIGGER</span>
                    <span className='trigger-text'>{signal.entryCondition}</span>
                </div>

                {signal.targetDigit !== undefined && (
                    <div className='modern-signal-card__target-row'>
                        <span className='target-label'>
                            <Target size={12} className='target-icon' /> Target Digit:
                        </span>
                        <span className='target-val'>{signal.targetDigit}</span>
                    </div>
                )}
            </div>

            {/* Footer Trade Action */}
            <button
                type='button'
                className='modern-signal-card__btn'
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
                <Zap size={13} className='btn-zap' />
                <span>Trade Strategy</span>
                <ArrowRight size={13} className='btn-arrow' />
            </button>
        </div>
    );
};
