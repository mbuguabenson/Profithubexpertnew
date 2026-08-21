import React, { useMemo } from 'react';
import './LastDigitsLineChart.scss';

export type TLastDigitsLineChartProps = {
    ticks: any[];
    count?: number;
    title?: string;
    showCardWrapper?: boolean;
    className?: string;
};

// Monotone Cubic Spline (Fritsch-Carlson) for smooth curves with horizontal plateaus
function getMonotoneSplinePath(points: { x: number; y: number }[]): string {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

    const n = points.length;
    const dxs: number[] = [];
    const dys: number[] = [];
    const ms: number[] = [];

    // 1. Calculate secant slopes
    for (let i = 0; i < n - 1; i++) {
        const dx = points[i + 1].x - points[i].x;
        const dy = points[i + 1].y - points[i].y;
        dxs.push(dx);
        dys.push(dy);
        ms.push(dx === 0 ? 0 : dy / dx);
    }

    // 2. Calculate tangents
    const tangents: number[] = [ms[0]];
    for (let i = 1; i < n - 1; i++) {
        const m0 = ms[i - 1];
        const m1 = ms[i];
        if (m0 * m1 <= 0) {
            tangents.push(0);
        } else {
            const dx0 = dxs[i - 1];
            const dx1 = dxs[i];
            const common = dx0 + dx1;
            tangents.push((3 * common) / ((common + dx1) / m0 + (common + dx0) / m1));
        }
    }
    tangents.push(ms[ms.length - 1]);

    // 3. Construct Bezier curve
    let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    for (let i = 0; i < n - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        const dx = dxs[i];
        const cp1x = p0.x + dx / 3;
        const cp1y = p0.y + (tangents[i] * dx) / 3;
        const cp2x = p1.x - dx / 3;
        const cp2y = p1.y - (tangents[i + 1] * dx) / 3;
        path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
    }

    return path;
}

const LastDigitsLineChart: React.FC<TLastDigitsLineChartProps> = ({
    ticks,
    count = 50,
    title = 'Last Digits Trend',
    showCardWrapper = true,
    className = '',
}) => {
    // Process last N ticks (default 50 for the exact dense visual shown in the design)
    const chartData = useMemo(() => {
        if (!ticks || !Array.isArray(ticks)) return [];
        const sliced = ticks.slice(-count);
        return sliced.map((t, idx) => {
            let digit = 0;
            if (typeof t === 'number') {
                digit = Math.abs(Math.floor(t)) % 10;
            } else if (typeof t === 'object' && t !== null) {
                if (typeof t.digit === 'number') {
                    digit = t.digit;
                } else if (t.quote !== undefined) {
                    const quoteStr = String(t.quote);
                    const parsed = parseInt(quoteStr[quoteStr.length - 1], 10);
                    digit = isNaN(parsed) ? 0 : parsed;
                }
            }
            return {
                index: idx,
                digit,
            };
        });
    }, [ticks, count]);

    // SVG coordinates setup
    const svgWidth = 1000;
    const svgHeight = 130;
    const paddingX = 22;
    const paddingTop = 26;
    const paddingBottom = 18;

    const points = useMemo(() => {
        if (chartData.length === 0) return [];
        const usableWidth = svgWidth - 2 * paddingX;
        const usableHeight = svgHeight - paddingTop - paddingBottom;
        const xStep = chartData.length > 1 ? usableWidth / (chartData.length - 1) : usableWidth;

        return chartData.map((d, i) => {
            const x = paddingX + i * xStep;
            // 9 at top, 0 at bottom
            const y = paddingTop + (9 - d.digit) * (usableHeight / 9);
            return {
                ...d,
                x,
                y,
            };
        });
    }, [chartData]);

    const splinePath = useMemo(() => {
        return getMonotoneSplinePath(points);
    }, [points]);

    const chartContent = (
        <div className={`exact-line-chart-viewport ${className}`}>
            {points.length === 0 ? (
                <div className="no-data-placeholder">Waiting for tick stream...</div>
            ) : (
                <svg
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    preserveAspectRatio="none"
                    className="exact-line-chart-svg"
                >
                    {/* The Smooth Connected Spline Line */}
                    <path
                        d={splinePath}
                        className="exact-chart-spline"
                        fill="none"
                    />

                    {/* Data Points and Value Labels */}
                    {points.map((pt, i) => (
                        <g key={i} className="exact-point-group">
                            {/* Value Label above point */}
                            <text
                                x={pt.x}
                                y={pt.y - 8}
                                className="exact-point-label"
                            >
                                {pt.digit}
                            </text>
                            {/* Square Point Dot with White Center */}
                            <rect
                                x={pt.x - 2.5}
                                y={pt.y - 2.5}
                                width={5}
                                height={5}
                                rx={1}
                                className="exact-point-marker"
                            />
                        </g>
                    ))}
                </svg>
            )}
        </div>
    );

    if (!showCardWrapper) {
        return chartContent;
    }

    return (
        <div className="last-digits-line-chart-card">
            {title && (
                <div className="card-header">
                    <h4>{title}</h4>
                    <span className="live-status">LIVE</span>
                </div>
            )}
            {chartContent}
        </div>
    );
};

export default LastDigitsLineChart;
