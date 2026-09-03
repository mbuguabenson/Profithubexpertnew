import React, { useMemo } from 'react';
import classNames from 'classnames';
import './DigitDistribution.scss';

type TDigitDistributionProps = {
    digit_stats: { digit: number; count: number; percentage: number }[];
    last_digit: number | null;
};

const DigitDistribution: React.FC<TDigitDistributionProps> = ({ digit_stats, last_digit }) => {
    // Find highest, second highest, and lowest counts for color coding
    const colorRanking = useMemo(() => {
        if (!digit_stats || digit_stats.length === 0) return { highest: -1, second: -1, lowest: -1 };

        const sorted = [...digit_stats].sort((a, b) => b.count - a.count);
        const uniqueCounts = Array.from(new Set(sorted.map(s => s.count))).filter(c => c > 0);

        const highest = uniqueCounts[0] ?? -1;
        const second = uniqueCounts[1] ?? -1;
        const lowest = uniqueCounts[uniqueCounts.length - 1] ?? -1;

        return { highest, second, lowest };
    }, [digit_stats]);

    // Ensure all digits 0-9 are present
    const completeStats = useMemo(() => {
        const statsMap = new Map(digit_stats.map(s => [s.digit, s]));
        return Array.from({ length: 10 }, (_, digit) => {
            return statsMap.get(digit) || { digit, count: 0, percentage: 0 };
        });
    }, [digit_stats]);

    return (
        <div className='digit-distribution-card glass-card'>
            <div className='card-header'>
                <h4>Digit Frequency Distribution</h4>
                <div className='legend'>
                    <span className='legend-item'>
                        <span className='dot highest' /> Highest
                    </span>
                    <span className='legend-item'>
                        <span className='dot second' /> 2nd Highest
                    </span>
                    <span className='legend-item'>
                        <span className='dot lowest' /> Lowest
                    </span>
                    <span className='legend-item'>
                        <span className='dot current' /> Live
                    </span>
                </div>
            </div>
            <div className='distribution-chart-wrapper'>
                <div className='bars-container'>
                    {completeStats.map(stat => {
                        const isCurrent = stat.digit === last_digit;
                        const { highest, second, lowest } = colorRanking;

                        let rankClass = '';
                        if (stat.count > 0) {
                            if (stat.count === highest) rankClass = 'highest';
                            else if (stat.count === second) rankClass = 'second';
                            else if (stat.count === lowest) rankClass = 'lowest';
                        }

                        return (
                            <div
                                key={stat.digit}
                                className={classNames('bar-column', {
                                    'is-current': isCurrent,
                                    [rankClass]: rankClass && !isCurrent,
                                })}
                            >
                                <div className='bar-track'>
                                    <div className='bar-fill' style={{ height: `${Math.max(4, stat.percentage)}%` }}>
                                        <span className='percentage-label'>{stat.percentage.toFixed(0)}%</span>
                                    </div>
                                </div>
                                <div className='digit-label-wrapper'>
                                    <span className='digit-number'>{stat.digit}</span>
                                    {isCurrent && <span className='active-arrow-indicator'>▲</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default DigitDistribution;
