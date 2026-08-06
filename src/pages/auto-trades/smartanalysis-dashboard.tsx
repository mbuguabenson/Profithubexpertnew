import React, { useMemo } from 'react';
import classNames from 'classnames';
import { localize } from '@deriv-com/translations';
import './smartanalysis-dashboard.scss';

type SmartanalysisDashboardProps = {
    market: {
        symbol: string;
        label: string;
        lastDigits: number[];
        digitPercentages: Record<number, number>;
        directionHistory: (1 | -1 | 0)[];
        lastQuote: number | null;
        confidenceScore: number;
    } | null;
    strategyType: string;
    isModal?: boolean;
    consecutiveLosses?: number;
};

const SmartanalysisDashboard = ({
    market,
    strategyType,
    isModal = false,
    consecutiveLosses = 0,
}: SmartanalysisDashboardProps) => {
    if (!market) {
        return (
            <div className="smart-dashboard__empty">
                <p>{localize('Select an active market to see smartanalysis statistics.')}</p>
            </div>
        );
    }

    const { lastDigits, digitPercentages, lastQuote, confidenceScore } = market;

    // 1. Last 7 Digits (distinct colors)
    const last7Digits = useMemo(() => {
        return lastDigits.slice(-7);
    }, [lastDigits]);

    // 2. Over (5-9) vs Under (0-4) dominance
    const { overPct, underPct, dominantSide, isGlowing, highestUnderDigit, highestOverDigit } = useMemo(() => {
        let over = 0;
        let under = 0;
        let highestUnderVal = 0;
        let highestUnderDigitNum = 0;
        let highestOverVal = 0;
        let highestOverDigitNum = 5;

        for (let d = 0; d <= 9; d++) {
            const pct = digitPercentages[d] || 0;
            if (d <= 4) {
                under += pct;
                if (pct > highestUnderVal) {
                    highestUnderVal = pct;
                    highestUnderDigitNum = d;
                }
            } else {
                over += pct;
                if (pct > highestOverVal) {
                    highestOverVal = pct;
                    highestOverDigitNum = d;
                }
            }
        }

        const total = (under + over) || 100;
        const normalizedUnder = Math.round((under / total) * 100);
        const normalizedOver = Math.round((over / total) * 100);

        let side = 'balanced';
        if (normalizedUnder >= 55) side = 'under';
        if (normalizedOver >= 55) side = 'over';

        return {
            overPct: normalizedOver,
            underPct: normalizedUnder,
            dominantSide: side,
            isGlowing: normalizedUnder >= 55 || normalizedOver >= 55,
            highestUnderDigit: highestUnderDigitNum,
            highestOverDigit: highestOverDigitNum,
        };
    }, [digitPercentages]);

    // 3. Disturbing Digit Warning & Sync Ticks suggestion
    const { disturbanceWarning, syncTicksAdvice, strongSignal } = useMemo(() => {
        let warning = '';
        let advice = 'No delay required. Executing immediately.';
        let signal = '';

        if (lastDigits.length < 15) {
            return { disturbanceWarning: warning, syncTicksAdvice: advice, strongSignal: signal };
        }

        // Analyze last 15 ticks for drift
        const last15 = lastDigits.slice(-15);
        const last5 = lastDigits.slice(-5);
        
        // Count opposite digits in the last 5 ticks
        if (dominantSide === 'under') {
            const overCountLast5 = last5.filter(d => d >= 5).length;
            if (overCountLast5 >= 2) {
                warning = `Disturbance detected: Over digits (${last5.filter(d => d >= 5).join(', ')}) increasing in last 5 ticks!`;
                // If default execution takes 2-3 ticks, recommend skipping
                advice = `Latency Warning: Suggest skipping ${overCountLast5 + 1} ticks to bypass Over digit drift.`;
            }

            // Strong under signal condition
            const underAppearances = last15.filter(d => d <= 4).length;
            if (underPct > 55 && underAppearances >= 9) {
                signal = `Strong Under Signal: Dominance is ${underPct}% with high frequency (${underAppearances}/15 ticks in Under). Entry target: Under ${highestUnderDigit}.`;
            }
        } else if (dominantSide === 'over') {
            const underCountLast5 = last5.filter(d => d <= 4).length;
            if (underCountLast5 >= 2) {
                warning = `Disturbance detected: Under digits (${last5.filter(d => d <= 4).join(', ')}) increasing in last 5 ticks!`;
                advice = `Latency Warning: Suggest skipping ${underCountLast5 + 1} ticks to bypass Under digit drift.`;
            }

            const overAppearances = last15.filter(d => d >= 5).length;
            if (overPct > 55 && overAppearances >= 9) {
                signal = `Strong Over Signal: Dominance is ${overPct}% with high frequency (${overAppearances}/15 ticks in Over). Entry target: Over ${highestOverDigit}.`;
            }
        }

        return {
            disturbanceWarning: warning,
            syncTicksAdvice: advice,
            strongSignal: signal,
        };
    }, [lastDigits, dominantSide, underPct, overPct, highestUnderDigit, highestOverDigit]);

    // 4. Suggestive prediction guide using last 500 ticks lookback
    const suggestiveGuide = useMemo(() => {
        if (underPct > overPct + 5) {
            return `Strategy Advice: Under markets have been dominant. Suggest trading Under 8 or Under 9 with 2-3 ticks duration.`;
        } else if (overPct > underPct + 5) {
            return `Strategy Advice: Over markets have been dominant. Suggest trading Over 0 or Over 1 with 2-3 ticks duration.`;
        }
        return `Strategy Advice: Market is balanced. Safe recovery prediction: Over 0 or Under 9.`;
    }, [underPct, overPct]);

    // 5. Line Graph (SVG path) for last 50 digits
    const svgPath = useMemo(() => {
        if (lastDigits.length === 0) return '';
        const width = 500;
        const height = 80;
        const padding = 10;
        const maxIndex = Math.min(lastDigits.length, 50);
        const data = lastDigits.slice(-maxIndex);

        const xStep = (width - padding * 2) / Math.max(1, data.length - 1);
        const yStep = (height - padding * 2) / 9; // Digit values range 0-9

        return data.map((digit, idx) => {
            const x = padding + idx * xStep;
            const y = height - (padding + digit * yStep); // Invert y since SVG 0 is top
            return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        }).join(' ');
    }, [lastDigits]);

    return (
        <div className={classNames('smart-dashboard', { 'smart-dashboard--modal': isModal })}>
            <div className="smart-dashboard__grid">
                
                {/* 1. Digit Distribution (smartanalysis style) */}
                <div className="smart-dashboard__card smart-dashboard__distribution">
                    <h3>{localize('Digit Distribution (smartanalysis)')}</h3>
                    <div className="smart-dashboard__chart-bars">
                        {[...Array(10)].map((_, d) => {
                            const pct = Math.round(digitPercentages[d] || 0);
                            const isHottest = pct >= 15;
                            const isColdest = pct <= 5;
                            return (
                                <div key={d} className="smart-dashboard__bar-col">
                                    <span className="smart-dashboard__bar-pct">{pct}%</span>
                                    <div className="smart-dashboard__bar-bg">
                                        <div
                                            className={classNames('smart-dashboard__bar-fill', {
                                                'smart-dashboard__bar-fill--hot': isHottest,
                                                'smart-dashboard__bar-fill--cold': isColdest,
                                            })}
                                            style={{ height: `${pct * 2.5}px` }}
                                        />
                                    </div>
                                    <span className={classNames('smart-dashboard__bar-num', {
                                        'smart-dashboard__bar-num--hot': isHottest,
                                        'smart-dashboard__bar-num--cold': isColdest,
                                    })}>
                                        {d}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 2. Last Digit Line Graph & Last 7 Digits Cards */}
                <div className="smart-dashboard__card smart-dashboard__sparkline">
                    <h3>{localize('Last Digits Line Graph')}</h3>
                    <div className="smart-dashboard__graph-container">
                        {svgPath ? (
                            <svg width="100%" height="80" viewBox="0 0 500 80" preserveAspectRatio="none">
                                <path
                                    d={svgPath}
                                    fill="none"
                                    stroke="var(--auto-trades-accent-bright)"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                                {lastDigits.slice(-50).map((digit, idx) => {
                                    const width = 500;
                                    const height = 80;
                                    const padding = 10;
                                    const dataLen = Math.min(lastDigits.length, 50);
                                    const xStep = (width - padding * 2) / Math.max(1, dataLen - 1);
                                    const yStep = (height - padding * 2) / 9;
                                    const x = padding + idx * xStep;
                                    const y = height - (padding + digit * yStep);

                                    return (
                                        <circle
                                            key={idx}
                                            cx={x}
                                            cy={y}
                                            r="3.5"
                                            fill={digit >= 5 ? '#ff4a6b' : '#39d353'}
                                            stroke="rgba(8, 14, 29, 0.8)"
                                            strokeWidth="1"
                                        />
                                    );
                                })}
                            </svg>
                        ) : (
                            <div className="smart-dashboard__graph-loading">{localize('Collecting ticks...')}</div>
                        )}
                    </div>

                    <div className="smart-dashboard__last7">
                        <h4>{localize('Last 7 Digits')}</h4>
                        <div className="smart-dashboard__cards">
                            {last7Digits.map((d, i) => {
                                const isHigh = d >= 5;
                                return (
                                    <div
                                        key={i}
                                        className={classNames('smart-dashboard__digit-card', {
                                            'smart-dashboard__digit-card--high': isHigh,
                                            'smart-dashboard__digit-card--low': !isHigh,
                                            'smart-dashboard__digit-card--new': i === last7Digits.length - 1,
                                        })}
                                    >
                                        <span className="smart-dashboard__digit-val">{d}</span>
                                        <span className="smart-dashboard__digit-label">{isHigh ? 'Over' : 'Under'}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* 3. Dominance Progress Bar */}
                <div className="smart-dashboard__card smart-dashboard__dominance">
                    <h3>{localize('Dominance Progress (Under 0-4 vs Over 5-9)')}</h3>
                    <div className="smart-dashboard__dominance-container">
                        <div className="smart-dashboard__dominance-labels">
                            <span className="under-label">Under 0-4 ({underPct}%)</span>
                            <span className="over-label">Over 5-9 ({overPct}%)</span>
                        </div>
                        <div className={classNames('smart-dashboard__progress-bar', {
                            'smart-dashboard__progress-bar--glow-under': dominantSide === 'under' && isGlowing,
                            'smart-dashboard__progress-bar--glow-over': dominantSide === 'over' && isGlowing,
                        })}>
                            <div className="progress-under" style={{ width: `${underPct}%` }} />
                            <div className="progress-over" style={{ width: `${overPct}%` }} />
                        </div>
                        <div className="smart-dashboard__dominance-digits">
                            <span>Highest Under Digit: <strong className="under-color">{highestUnderDigit}</strong></span>
                            <span>Highest Over Digit: <strong className="over-color">{highestOverDigit}</strong></span>
                        </div>
                    </div>
                </div>

                {/* 4. AI Signals & Sync Ticks Guidance */}
                <div className="smart-dashboard__card smart-dashboard__signals">
                    <h3>{localize('AI Signals & Sync Ticks Guidance')}</h3>
                    <div className="smart-dashboard__signals-body">
                        {strongSignal && (
                            <div className="smart-dashboard__signal-alert pulse-glow">
                                <span className="signal-icon">⚡</span>
                                <span>{strongSignal}</span>
                            </div>
                        )}
                        {disturbanceWarning && (
                            <div className="smart-dashboard__warning-alert">
                                <span className="warning-icon">⚠</span>
                                <span>{disturbanceWarning}</span>
                            </div>
                        )}
                        <div className="smart-dashboard__advice-card">
                            <div className="advice-title">{localize('Sync Ticks Recommendation')}</div>
                            <div className="advice-text">{syncTicksAdvice}</div>
                        </div>
                        <div className="smart-dashboard__advice-card">
                            <div className="advice-title">{localize('Historical Market Trend (500t)')}</div>
                            <div className="advice-text">{suggestiveGuide}</div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default SmartanalysisDashboard;
