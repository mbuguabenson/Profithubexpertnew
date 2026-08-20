import React, { useMemo } from 'react';
import './LastDigitsLineChart.scss';

type TLastDigitsLineChartProps = {
    ticks: any[];
};

const LastDigitsLineChart: React.FC<TLastDigitsLineChartProps> = ({ ticks }) => {
    // Process last 15 ticks
    const chartData = useMemo(() => {
        const sliced = ticks.slice(-15);
        return sliced.map((t, idx) => {
            const digit = typeof t === 'object' && t !== null ? (t.digit ?? 0) : (typeof t === 'number' ? t : 0);
            return {
                index: idx,
                digit,
            };
        });
    }, [ticks]);

    // Dimensions of the SVG workspace
    const svgWidth = 500;
    const svgHeight = 120;
    const paddingX = 25;
    const paddingY = 20;

    // Calculate coordinates for each data point
    const points = useMemo(() => {
        if (chartData.length === 0) return [];
        
        const usableWidth = svgWidth - 2 * paddingX;
        const usableHeight = svgHeight - 2 * paddingY;
        const xStep = chartData.length > 1 ? usableWidth / (chartData.length - 1) : usableWidth;

        return chartData.map((d, i) => {
            const x = paddingX + i * xStep;
            // Map digit 0-9 to Y coordinate (9 at the top, 0 at the bottom)
            const y = svgHeight - paddingY - (d.digit / 9) * usableHeight;
            return {
                ...d,
                x,
                y,
            };
        });
    }, [chartData]);

    // Build the SVG path string for the line
    const pathD = useMemo(() => {
        if (points.length === 0) return '';
        return points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
    }, [points]);

    // Build the SVG path area string for the glowing gradient under the line
    const areaD = useMemo(() => {
        if (points.length === 0) return '';
        const firstPoint = points[0];
        const lastPoint = points[points.length - 1];
        const baselineY = svgHeight - paddingY + 5;
        
        return `${pathD} L ${lastPoint.x} ${baselineY} L ${firstPoint.x} ${baselineY} Z`;
    }, [points, pathD]);

    return (
        <div className="last-digits-line-chart-card glass-card">
            <div className="card-header">
                <h4>Last 15 Digits Trend</h4>
                <span className="live-status">LIVE Ticks</span>
            </div>
            <div className="chart-svg-container">
                {points.length === 0 ? (
                    <div className="no-data-placeholder">Awaiting tick data...</div>
                ) : (
                    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height="100%">
                        <defs>
                            {/* Line glow filter */}
                            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="3" result="blur" />
                                <feMerge>
                                    <feMergeNode in="blur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                            {/* Area fill gradient */}
                            <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.0" />
                            </linearGradient>
                        </defs>

                        {/* Horizontal reference grid lines */}
                        <line x1={paddingX} y1={paddingY} x2={svgWidth - paddingX} y2={paddingY} className="grid-line" />
                        <line x1={paddingX} y1={svgHeight / 2} x2={svgWidth - paddingX} y2={svgHeight / 2} className="grid-line" />
                        <line x1={paddingX} y1={svgHeight - paddingY} x2={svgWidth - paddingX} y2={svgHeight - paddingY} className="grid-line" />

                        {/* Area gradient under the line */}
                        <path d={areaD} fill="url(#areaGradient)" className="chart-area" />

                        {/* Trend Line */}
                        <path d={pathD} className="chart-line" filter="url(#glow)" />

                        {/* Point Badges */}
                        {points.map((pt, i) => {
                            const isLatest = i === points.length - 1;
                            return (
                                <g key={pt.index} className={`point-group ${isLatest ? 'is-latest' : ''}`}>
                                    {/* Ripple effect for latest tick */}
                                    {isLatest && (
                                        <circle cx={pt.x} cy={pt.y} r="16" className="ripple-circle" />
                                    )}
                                    <circle cx={pt.x} cy={pt.y} r="10" className="point-dot" />
                                    <text 
                                        x={pt.x} 
                                        y={pt.y} 
                                        dy="3.5" 
                                        className="point-text"
                                    >
                                        {pt.digit}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                )}
            </div>
        </div>
    );
};

export default LastDigitsLineChart;
