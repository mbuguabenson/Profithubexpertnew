import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';

type TDigitCirclesProps = {
    onSelectDigit?: (digit: number) => void;
    selectedDigit?: number;
};

const DigitCircles: React.FC<TDigitCirclesProps> = observer(({ onSelectDigit, selectedDigit }) => {
    const { analysis } = useStore();
    const { digit_stats, last_digit } = analysis;

    // Find min and max for color normalization
    const maxCount = Math.max(...digit_stats.map(s => s.count), 1);
    const minCount = Math.min(...digit_stats.map(s => s.count), 0);

    return (
        <div className='digit-circles-hud'>
            <div className='hud-header'>
                <div className='title-wrap'>
                    <div className='live-dot-pulse' />
                    <span className='hud-title'>10-Digit Dynamic Radial Spectrum</span>
                </div>
                <span className='hud-hint'>Click any circle to set prediction target</span>
            </div>

            <div className='circles-flex-grid'>
                {digit_stats.map(stat => {
                    const isCurrent = stat.digit === last_digit;
                    const isSelected = selectedDigit === stat.digit;
                    const normalizedPct = stat.percentage;

                    // Color grading: Hot (Emerald/Amber) vs Cold (Slate/Indigo)
                    const isHot = stat.count === maxCount && maxCount > minCount;
                    const isCold = stat.count === minCount && maxCount > minCount;

                    let strokeColor = '#6366f1'; // Default Indigo
                    if (isHot) strokeColor = '#10b981'; // Hot Emerald
                    else if (isCold) strokeColor = '#f43f5e'; // Cold Rose
                    else if (stat.digit % 2 === 0) strokeColor = '#06b6d4'; // Even Cyan
                    else strokeColor = '#a855f7'; // Odd Purple

                    if (isCurrent) strokeColor = '#f59e0b'; // Amber Gold for live

                    const radius = 34;
                    const circumference = 2 * Math.PI * radius;
                    const strokeDashoffset = circumference - (normalizedPct / 100) * circumference;

                    return (
                        <div
                            key={stat.digit}
                            className={classNames('circle-node', {
                                'is-live': isCurrent,
                                'is-selected': isSelected,
                                'is-hot': isHot,
                                'is-cold': isCold,
                            })}
                            onClick={() => onSelectDigit?.(stat.digit)}
                        >
                            <div className='svg-wrap'>
                                <svg width='84' height='84' viewBox='0 0 84 84'>
                                    <defs>
                                        <filter id={`glow-${stat.digit}`} x='-20%' y='-20%' width='140%' height='140%'>
                                            <feGaussianBlur stdDeviation='3' result='blur' />
                                            <feComposite in='SourceGraphic' in2='blur' operator='over' />
                                        </filter>
                                    </defs>
                                    {/* Background Track */}
                                    <circle
                                        cx='42'
                                        cy='42'
                                        r={radius}
                                        fill='none'
                                        stroke='rgba(255, 255, 255, 0.05)'
                                        strokeWidth='4'
                                    />
                                    {/* Progress Ring */}
                                    <circle
                                        cx='42'
                                        cy='42'
                                        r={radius}
                                        fill='none'
                                        stroke={strokeColor}
                                        strokeWidth={isCurrent ? '5' : '4'}
                                        strokeDasharray={circumference}
                                        strokeDashoffset={strokeDashoffset}
                                        strokeLinecap='round'
                                        transform='rotate(-90 42 42)'
                                        style={{
                                            filter: isCurrent ? `url(#glow-${stat.digit})` : 'none',
                                            transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.3s ease',
                                        }}
                                    />
                                </svg>

                                <div className='center-content'>
                                    <span className='digit-val num'>{stat.digit}</span>
                                    <span className='pct-val num'>{stat.percentage.toFixed(1)}%</span>
                                </div>

                                {isCurrent && (
                                    <div className='active-radar-ping' />
                                )}
                            </div>

                            <div className='node-footer'>
                                <span className='sample-count num'>n={stat.count}</span>
                                {isHot && <span className='badge hot'>HOT</span>}
                                {isCold && <span className='badge cold'>COLD</span>}
                                {isCurrent && <span className='badge now'>LIVE</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
});

export default DigitCircles;
