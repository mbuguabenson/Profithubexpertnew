import React, { useMemo } from 'react';
import classNames from 'classnames';
import './Last20DigitsGrid.scss';

type TLast20DigitsGridProps = {
    ticks: any[];
};

const Last20DigitsGrid: React.FC<TLast20DigitsGridProps> = ({ ticks }) => {
    // Process last 20 ticks
    const displayDigits = useMemo(() => {
        const last20 = ticks.slice(-20).map(t => {
            return typeof t === 'object' && t !== null ? (t.digit ?? 0) : typeof t === 'number' ? t : 0;
        });

        // Pad with nulls at the start if ticks count is < 20
        return Array.from({ length: 20 }, (_, idx) => {
            const dataIdx = idx - (20 - last20.length);
            return dataIdx >= 0 ? last20[dataIdx] : null;
        });
    }, [ticks]);

    // Split into 2 rows of 10 for a clean grid layout
    const row1 = useMemo(() => displayDigits.slice(0, 10), [displayDigits]);
    const row2 = useMemo(() => displayDigits.slice(10, 20), [displayDigits]);

    const renderRow = (rowItems: (number | null)[], rowStartIndex: number) => {
        return (
            <div className='grid-row'>
                {rowItems.map((digit, colIdx) => {
                    const globalIdx = rowStartIndex + colIdx;
                    // The very last item in chronological order is the latest tick
                    // (Ensure it's not a null placeholder)
                    const isLatest = globalIdx === 19 && digit !== null;
                    const isEven = digit !== null && digit % 2 === 0;

                    return (
                        <div
                            key={globalIdx}
                            className={classNames('grid-cell', {
                                'is-empty': digit === null,
                                'is-latest': isLatest,
                                'is-even': digit !== null && isEven && !isLatest,
                                'is-odd': digit !== null && !isEven && !isLatest,
                            })}
                        >
                            <span className='cell-digit'>{digit !== null ? digit : '-'}</span>
                            {isLatest && <span className='beacon-ping' />}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className='last-20-digits-grid-card glass-card'>
            <div className='card-header'>
                <h4>Last 20 Digits Feed</h4>
                <div className='grid-legend'>
                    <span className='legend-item'>
                        <span className='indicator-box even' /> Even
                    </span>
                    <span className='legend-item'>
                        <span className='indicator-box odd' /> Odd
                    </span>
                </div>
            </div>
            <div className='grid-content-wrapper'>
                {renderRow(row1, 0)}
                {renderRow(row2, 10)}
            </div>
        </div>
    );
};

export default Last20DigitsGrid;
