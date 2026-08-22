import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { api_base } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { SUPPORTED_VOLATILITY_MARKETS } from '@/utils/digit-strategy';
import { isLoggedIn } from '@/utils/token-bridge';
import { buyContractForUi, streamContractUntilSettled } from '@/utils/trade-purchase';
import { safeSubscribe } from '@/utils/websocket-handler';
import './elite-pro.scss';

// ─── Types ─────────────────────────────────────────────────────────────────────

type MarketDigitData = {
    symbol: string;
    label: string;
    digits: number[];
    currentPrice: string;
    lastDigit: number;
};

type AutoState = 'IDLE' | 'SCANNING' | 'WAITING_TRIGGER' | 'TRADING' | 'PAUSED';

const MARKETS = SUPPORTED_VOLATILITY_MARKETS.map(m => ({
    symbol: m.symbol,
    label: m.label.replace('Volatility ', 'Vol ').replace(' Index', ''),
}));

const MAX_DIGITS = 100;
const CHART_DIGITS = 50;
const ANALYSIS_WINDOW = 50;

// ─── Helpers ───────────────────────────────────────────────────────────────────

const extractDigitFromPrice = (quote: number | string): number => {
    const s = String(quote);
    const parts = s.split('.');
    const dec = parts[1] || '0';
    return parseInt(dec[dec.length - 1] || '0', 10);
};

const countDigitsInRange = (digits: number[], low: number, high: number): number =>
    digits.filter(d => d >= low && d <= high).length;

const cleanMoneyInput = (v: string) => v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');

const getBezierPath = (points: { x: number; y: number }[]) => {
    if (points.length < 2) return '';
    let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        const cpX1 = p0.x + (p1.x - p0.x) / 2;
        const cpY1 = p0.y;
        const cpX2 = p0.x + (p1.x - p0.x) / 2;
        const cpY2 = p1.y;
        d += ` C ${cpX1.toFixed(1)},${cpY1.toFixed(1)} ${cpX2.toFixed(1)},${cpY2.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
    }
    return d;
};

// ─── Chart Component ───────────────────────────────────────────────────────────

const DigitLineChart: React.FC<{ digits: number[] }> = ({ digits }) => {
    const slice = digits.slice(-CHART_DIGITS);
    if (slice.length < 2) {
        return (
            <div className="ep-chart-empty">
                <span className="ep-chart-empty__icon">📊</span>
                Waiting for tick stream...
            </div>
        );
    }

    const W = Math.max(760, slice.length * 15.5);
    const H = 140;
    const padTop = 26;
    const padBot = 18;
    const usableH = H - padTop - padBot;
    const stepX = (W - 20) / (slice.length - 1);

    const points = slice.map((d, i) => ({
        x: 10 + i * stepX,
        y: padTop + usableH - (d / 9) * usableH,
        d,
    }));

    const pathD = getBezierPath(points);

    return (
        <div className="ep-chart-inner-scroll">
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', minWidth: `${W}px` }}>
                <defs>
                    <linearGradient id="epLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.7" />
                        <stop offset="50%" stopColor="#a855f7" stopOpacity="1" />
                        <stop offset="100%" stopColor="#c084fc" stopOpacity="0.9" />
                    </linearGradient>
                    <filter id="epGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#9333ea" floodOpacity="0.6" />
                    </filter>
                </defs>

                {[0, 3, 6, 9].map(level => {
                    const y = padTop + usableH - (level / 9) * usableH;
                    return (
                        <g key={level} className="ep-chart-grid-line">
                            <line x1="0" y1={y} x2={W} y2={y} stroke="rgba(255, 255, 255, 0.06)" strokeWidth="1" strokeDasharray={level === 3 || level === 6 ? '3 3' : undefined} />
                            <text x="4" y={y - 3} fill="rgba(255, 255, 255, 0.25)" fontSize="9" fontFamily="monospace">{level}</text>
                        </g>
                    );
                })}

                {pathD && <path d={pathD} fill="none" stroke="url(#epLineGrad)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" filter="url(#epGlow)" />}

                {points.map((p, i) => {
                    const isLatest = i === points.length - 1;
                    const isUnder = p.d < 5;
                    return (
                        <g key={i} className={`ep-chart-point ${isLatest ? 'ep-chart-point--latest' : ''}`}>
                            <rect x={p.x - 3} y={p.y - 3} width={6} height={6} rx={1.5} fill={isLatest ? '#ffffff' : isUnder ? '#10b981' : '#f59e0b'} stroke="#8b5cf6" strokeWidth={1.5} />
                            <text x={p.x} y={p.y - 8} textAnchor="middle" fill={isLatest ? '#38bdf8' : '#c084fc'} fontSize={isLatest ? 12 : 11} fontWeight={800}>{p.d}</text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};

// ─── Main Component ────────────────────────────────────────────────────────────

const ElitePro = observer(() => {
    const store = useStore();
    const { client, dashboard, run_panel, summary_card, transactions } = store;
    const { active_tab } = dashboard;
    const showElitePro = active_tab === DBOT_TABS.ELITE_PRO;
    const currency = client?.currency || 'USD';
    const logged_in = client?.is_logged_in ?? isLoggedIn();

    // ── Market state ──
    const [selectedSymbol, setSelectedSymbol] = useState(MARKETS[0].symbol);
    const [scanAll, setScanAll] = useState(true);
    const [autoInputBestMarket, setAutoInputBestMarket] = useState(true);
    
    const marketsRef = useRef<Map<string, MarketDigitData>>(new Map());
    const [, forceRender] = useState(0);
    const subscriptionsRef = useRef<Map<string, { unsubscribe: () => void }>>(new Map());
    const unmountedRef = useRef(false);
    const uiThrottleRef = useRef(0);

    // ── Autotrading parameters ──
    const [autoState, setAutoState] = useState<AutoState>('IDLE');
    const [stake, setStake] = useState('0.35');
    const [takeProfit, setTakeProfit] = useState('10');
    const [stopLoss, setStopLoss] = useState('5');
    const [martingale, setMartingale] = useState('2.6');
    const [tickDuration, setTickDuration] = useState('1');
    const [totalProfit, setTotalProfit] = useState(0);

    const currentStakeRef = useRef(0.35);
    const autoAbortRef = useRef<AbortController | null>(null);
    const autoStateRef = useRef<AutoState>('IDLE');
    const contractStreamAbortRef = useRef<Set<AbortController>>(new Set());

    useEffect(() => { autoStateRef.current = autoState; }, [autoState]);
    useEffect(() => { currentStakeRef.current = parseFloat(stake) || 0.35; }, [stake]);

    // ── Compute full statistical analysis ──
    const computeAnalysis = useCallback((digits: number[]) => {
        const slice = digits.slice(-ANALYSIS_WINDOW);
        const total = slice.length || 1;

        const under04 = countDigitsInRange(slice, 0, 4);
        const over59 = countDigitsInRange(slice, 5, 9);
        const pctUnder04 = (under04 / total) * 100;
        const pctOver59 = (over59 / total) * 100;

        const under05 = countDigitsInRange(slice, 0, 5);
        const over49 = countDigitsInRange(slice, 4, 9);
        const pctUnder05 = (under05 / total) * 100;
        const pctOver49 = (over49 / total) * 100;

        const firstHalf = slice.slice(0, 25);
        const secondHalf = slice.slice(25);
        const firstHalfUnder = firstHalf.length > 0 ? (countDigitsInRange(firstHalf, 0, 4) / 25) * 100 : 50;
        const firstHalfOver = firstHalf.length > 0 ? (countDigitsInRange(firstHalf, 5, 9) / 25) * 100 : 50;
        const secondHalfUnder = secondHalf.length > 0 ? (countDigitsInRange(secondHalf, 0, 4) / 25) * 100 : 50;
        const secondHalfOver = secondHalf.length > 0 ? (countDigitsInRange(secondHalf, 5, 9) / 25) * 100 : 50;

        const underIncreasing = secondHalfUnder >= firstHalfUnder;
        const overIncreasing = secondHalfOver >= firstHalfOver;

        const freq = new Array(10).fill(0);
        slice.forEach(d => { if (d >= 0 && d <= 9) freq[d]++; });

        // Highest Entry Digit in Under (0-5)
        let maxUnderCount = -1;
        let highestUnderDigit = 0;
        freq.slice(0, 6).forEach((c, idx) => {
            if (c > maxUnderCount) {
                maxUnderCount = c;
                highestUnderDigit = idx;
            }
        });

        // Highest Entry Digit in Over (4-9)
        let maxOverCount = -1;
        let highestOverDigit = 4;
        freq.slice(4, 10).forEach((c, idx) => {
            if (c > maxOverCount) {
                maxOverCount = c;
                highestOverDigit = idx + 4;
            }
        });

        let bias: 'under' | 'over' | 'neutral' = 'neutral';
        if (pctUnder04 > 55 || (under05 >= 30 && under05 > over49)) bias = 'under';
        else if (pctOver59 > 55 || (over49 >= 30 && over49 > under05)) bias = 'over';

        const last10 = slice.slice(-10);
        const last10UnderCount = last10.filter(d => d <= 5).length;
        const last10OverCount = last10.filter(d => d >= 4).length;
        
        return {
            under04, over59, pctUnder04, pctOver59,
            under05, over49, pctUnder05, pctOver49,
            highestUnderDigit, highestUnderCount: maxUnderCount,
            highestOverDigit, highestOverCount: maxOverCount,
            bias, last10UnderCount, last10OverCount,
            underIncreasing, overIncreasing, total
        };
    }, []);

    // ── Check entry signal based on exact user trading conditions ──
    const checkEntrySignal = useCallback((digits: number[]): { direction: 'UNDER' | 'OVER'; prediction: number; triggerDigit: number } | null => {
        if (digits.length < 50) return null;
        const a = computeAnalysis(digits);
        const currentLastDigit = digits[digits.length - 1];

        // UNDER 6 Conditions
        const underRatioMet = a.pctUnder04 > 55 && a.underIncreasing;
        const underDominant = (a.under05 - a.over49) >= 7;
        const underRecentTicksMet = a.last10UnderCount >= 7;

        if (underRatioMet && underDominant && underRecentTicksMet) {
            if (currentLastDigit === a.highestUnderDigit) {
                return { direction: 'UNDER', prediction: 6, triggerDigit: a.highestUnderDigit };
            }
        }

        // OVER 3 Conditions
        const overRatioMet = a.pctOver59 > 55 && a.overIncreasing;
        const overDominant = (a.over49 - a.under05) >= 7; 
        const overRecentTicksMet = a.last10OverCount >= 7;

        if (overRatioMet && overDominant && overRecentTicksMet) {
            if (currentLastDigit === a.highestOverDigit) {
                return { direction: 'OVER', prediction: 3, triggerDigit: a.highestOverDigit };
            }
        }

        return null;
    }, [computeAnalysis]);

    const getActiveData = useCallback((): MarketDigitData | null => {
        return marketsRef.current.get(selectedSymbol) || null;
    }, [selectedSymbol]);

    const throttleRender = useCallback(() => {
        const now = Date.now();
        if (now - uiThrottleRef.current < 80) return;
        uiThrottleRef.current = now;
        forceRender(n => n + 1);
    }, []);

    useEffect(() => {
        unmountedRef.current = false;
        const shouldSubscribe = showElitePro || autoState !== 'IDLE';
        const activeSubs = subscriptionsRef.current;

        if (!shouldSubscribe) {
            activeSubs.forEach(sub => { try { sub.unsubscribe(); } catch {} });
            activeSubs.clear();
            return;
        }

        const symbolsToSubscribe = scanAll ? MARKETS.map(m => m.symbol) : [selectedSymbol];

        symbolsToSubscribe.forEach(sym => {
            if (!marketsRef.current.has(sym)) {
                marketsRef.current.set(sym, {
                    symbol: sym, label: MARKETS.find(m => m.symbol === sym)?.label || sym,
                    digits: [], currentPrice: '—', lastDigit: 0,
                });
            }
        });

        let isMounted = true;

        const startSubscription = async (sym: string) => {
            if (!api_base.api) return;
            try {
                const res = await api_base.api.send({ ticks_history: sym, end: 'latest', count: MAX_DIGITS, style: 'ticks' });
                if (!isMounted || unmountedRef.current) return;

                const market = marketsRef.current.get(sym);
                if (market && res?.history?.prices) {
                    const prices: number[] = res.history.prices || [];
                    const newDigits = prices.map(p => extractDigitFromPrice(p));
                    market.digits = newDigits.slice(-MAX_DIGITS);
                    if (prices.length > 0) {
                        const lastPrice = prices[prices.length - 1];
                        market.currentPrice = String(lastPrice);
                        market.lastDigit = extractDigitFromPrice(lastPrice);
                    }
                    throttleRender();
                }

                const tickObservable = api_base.api.subscribe({ ticks: sym });
                const sub = safeSubscribe(tickObservable, (data: Record<string, unknown>) => {
                    if (!isMounted || unmountedRef.current) return;

                    const activeMarket = marketsRef.current.get(sym);
                    if (!activeMarket) return;

                    const tickData = data?.tick as { quote?: number | string } | undefined;
                    const quote = tickData?.quote;
                    if (quote !== undefined && quote !== null) {
                        const digit = extractDigitFromPrice(quote);
                        activeMarket.digits.push(digit);
                        if (activeMarket.digits.length > MAX_DIGITS) activeMarket.digits.shift();
                        activeMarket.currentPrice = String(quote);
                        activeMarket.lastDigit = digit;
                        throttleRender();
                    }
                });

                activeSubs.get(sym)?.unsubscribe();
                activeSubs.set(sym, sub);
            } catch (err) {
                console.error(`[ElitePro] Sub error ${sym}:`, err);
            }
        };

        let retryTimeout: ReturnType<typeof setTimeout> | null = null;
        const initSubscriptions = () => {
            if (!api_base.api) { retryTimeout = setTimeout(initSubscriptions, 1000); return; }
            symbolsToSubscribe.forEach(sym => { void startSubscription(sym); });
        };
        initSubscriptions();

        activeSubs.forEach((sub, sym) => {
            if (!symbolsToSubscribe.includes(sym)) {
                try { sub.unsubscribe(); } catch {}
                activeSubs.delete(sym);
            }
        });

        return () => {
            isMounted = false;
            unmountedRef.current = true;
            if (retryTimeout) clearTimeout(retryTimeout);
            activeSubs.forEach(sub => { try { sub.unsubscribe(); } catch {} });
            activeSubs.clear();
        };
    }, [selectedSymbol, scanAll, showElitePro, autoState, throttleRender]);

    const activeData = getActiveData();
    const analysis = useMemo(() => {
        if (!activeData || activeData.digits.length < 15) return null;
        return computeAnalysis(activeData.digits);
    }, [activeData, computeAnalysis]);

    const allMarketsData = useMemo(() => {
        const result: any[] = [];
        marketsRef.current.forEach((data, sym) => {
            if (data.digits.length < 10) return;
            const a = computeAnalysis(data.digits);
            result.push({
                symbol: sym,
                label: data.label,
                currentPrice: data.currentPrice,
                lastDigit: data.lastDigit,
                bias: a.bias,
                pctUnder04: a.pctUnder04,
                pctOver59: a.pctOver59
            });
        });
        return result;
    }, [computeAnalysis, forceRender]); // forceRender dependency to trigger updates

    useEffect(() => {
        if (autoInputBestMarket && allMarketsData.length > 0 && autoState === 'IDLE') {
            // Find strongest market
            let best = allMarketsData[0];
            let highestStrength = 0;
            allMarketsData.forEach(m => {
                const s = Math.max(m.pctUnder04, m.pctOver59);
                if (s > highestStrength) {
                    highestStrength = s;
                    best = m;
                }
            });
            if (best && best.symbol !== selectedSymbol) {
                setSelectedSymbol(best.symbol);
            }
        }
    }, [autoInputBestMarket, allMarketsData, selectedSymbol, autoState]);

    const pushContract = useCallback((data: Record<string, unknown>) => {
        try {
            transactions.pushTransaction({ ...data, run_id: run_panel.run_id });
            run_panel.onBotContractEvent(data);
            summary_card.onBotContractEvent(data);
        } catch {}
    }, [run_panel, summary_card, transactions]);

    const executeTrade = useCallback(async (
        symbol: string,
        direction: 'UNDER' | 'OVER',
        prediction: number,
        stakeAmount: number,
    ): Promise<number> => {
        const contractType = direction === 'UNDER' ? 'DIGITUNDER' : 'DIGITOVER';
        const dur = parseInt(tickDuration) || 1;
        const params: Record<string, unknown> = {
            amount: stakeAmount,
            basis: 'stake',
            contract_type: contractType,
            currency: currency || 'USD',
            duration: dur,
            duration_unit: 't',
            symbol,
            barrier: String(prediction),
        };

        const tradeStartTime = Math.floor(Date.now() / 1000);
        const verificationId = `EP-${Date.now()}`;
        const marketLabel = MARKETS.find(m => m.symbol === symbol)?.label || symbol;

        try {
            const buy = await buyContractForUi({ parameters: params, price: stakeAmount, source: 'ElitePro' });
            const { contract_id, buy_price, transaction_id } = buy;

            const initialContractSnapshot = {
                buy_price, contract_id, transaction_ids: { buy: transaction_id },
                date_start: tradeStartTime, display_name: marketLabel,
                underlying_symbol: symbol, shortcode: `ELITE_${contractType}_${symbol}`,
                contract_type: contractType, currency: currency || 'USD',
                verification_id: verificationId, barrier: String(prediction),
            };

            pushContract(initialContractSnapshot);

            const abortController = new AbortController();
            contractStreamAbortRef.current.add(abortController);

            const settledContract = await streamContractUntilSettled({
                contractId: contract_id,
                fallback: initialContractSnapshot,
                onUpdate: snapshot => { if (!unmountedRef.current) pushContract(snapshot); },
                signal: abortController.signal,
                source: 'ElitePro',
            });

            contractStreamAbortRef.current.delete(abortController);
            return Number(settledContract.profit ?? 0);
        } catch (err) {
            throw err;
        }
    }, [tickDuration, currency, pushContract]);

    const startAutoTrading = useCallback(async () => {
        if (!logged_in || autoState !== 'IDLE') return;
        setAutoState('SCANNING');
        autoAbortRef.current = new AbortController();
        const signal = autoAbortRef.current.signal;
        let cumulativeProfit = 0;
        let tradeRuns = 0;

        try {
            while (!signal.aborted) {
                if (autoStateRef.current === 'PAUSED') {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }

                setAutoState('WAITING_TRIGGER');
                
                // Active Scan Loop
                let tradeSignal = null;
                while (!tradeSignal && !signal.aborted && autoStateRef.current !== 'PAUSED') {
                    if (scanAll) {
                        for (const [sym, data] of marketsRef.current.entries()) {
                            const sig = checkEntrySignal(data.digits);
                            if (sig) {
                                tradeSignal = { ...sig, symbol: sym };
                                break;
                            }
                        }
                    } else {
                        const d = marketsRef.current.get(selectedSymbol);
                        if (d) {
                            const sig = checkEntrySignal(d.digits);
                            if (sig) tradeSignal = { ...sig, symbol: selectedSymbol };
                        }
                    }
                    if (!tradeSignal) await new Promise(r => setTimeout(r, 500));
                }

                if (signal.aborted || !tradeSignal) break;

                setAutoState('TRADING');
                const pft = await executeTrade(tradeSignal.symbol, tradeSignal.direction, tradeSignal.prediction, currentStakeRef.current);
                
                cumulativeProfit += pft;
                setTotalProfit(prev => prev + pft);
                tradeRuns++;

                if (pft < 0) {
                    currentStakeRef.current = Number((currentStakeRef.current * parseFloat(martingale)).toFixed(2));
                } else {
                    currentStakeRef.current = parseFloat(stake);
                }

                if (cumulativeProfit <= -parseFloat(stopLoss) || cumulativeProfit >= parseFloat(takeProfit)) {
                    break;
                }

                if (tradeRuns >= 7) {
                    tradeRuns = 0;
                    setAutoState('PAUSED');
                    autoStateRef.current = 'PAUSED';
                }

                await new Promise(r => setTimeout(r, 1500)); // Cool down
            }
        } catch (e) {
            console.error(e);
        } finally {
            setAutoState('IDLE');
        }
    }, [logged_in, autoState, scanAll, selectedSymbol, stake, martingale, stopLoss, takeProfit, checkEntrySignal, executeTrade]);

    const stopAutoTrading = () => {
        if (autoAbortRef.current) autoAbortRef.current.abort();
        contractStreamAbortRef.current.forEach(c => c.abort());
        contractStreamAbortRef.current.clear();
        setAutoState('IDLE');
    };

    if (!showElitePro) return null;

    return (
        <div className="ep-container">
            {/* ── Left Sidebar ── */}
            <div className="ep-sidebar">
                <div className="ep-sidebar-header">
                    <h2>Markets Scanner</h2>
                    <label className="ep-switch-label">
                        <input type="checkbox" checked={scanAll} onChange={e => setScanAll(e.target.checked)} />
                        Scan Entire Indices
                    </label>
                    <label className="ep-switch-label">
                        <input type="checkbox" checked={autoInputBestMarket} onChange={e => setAutoInputBestMarket(e.target.checked)} />
                        Auto Input Best Market
                    </label>
                </div>
                <div className="ep-market-list">
                    {allMarketsData.map(m => (
                        <div key={m.symbol} className={`ep-market-item ${selectedSymbol === m.symbol ? 'active' : ''}`} onClick={() => { setSelectedSymbol(m.symbol); setAutoInputBestMarket(false); }}>
                            <div className="ep-market-item-top">
                                <span className="ep-m-name">{m.label}</span>
                                <span className="ep-m-price">{m.currentPrice}</span>
                            </div>
                            <div className="ep-market-item-bottom">
                                <span className="ep-m-digit">Last Digit: <strong>{m.lastDigit}</strong></span>
                                <span className={`ep-m-bias ep-m-bias--${m.bias}`}>{m.bias.toUpperCase()}</span>
                            </div>
                            <div className="ep-m-stats-mini">
                                <span>0-4: {m.pctUnder04.toFixed(0)}%</span>
                                <span>5-9: {m.pctOver59.toFixed(0)}%</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Main Dashboard ── */}
            <div className="ep-dashboard">
                {/* Header */}
                <div className="ep-header-card">
                    <div className="ep-header-left">
                        <span className="ep-hero-title">{activeData?.label || selectedSymbol}</span>
                        <span className="ep-hero-price">{activeData?.currentPrice || '—'}</span>
                    </div>
                    <div className="ep-header-right">
                        <span className="ep-digit-big-label">Last Digit</span>
                        <span className="ep-digit-big-val">{activeData?.lastDigit ?? '—'}</span>
                    </div>
                </div>

                {/* 50 Tick Line Chart */}
                <div className="ep-chart-container">
                    <h3>Live 50 Ticks Trend</h3>
                    <DigitLineChart digits={activeData?.digits || []} />
                </div>

                {/* Statistics Row */}
                {analysis && (
                    <div className="ep-stats-grid">
                        <div className="ep-stat-box">
                            <h4>Under 0-4 vs Over 5-9</h4>
                            <div className="ep-bar-wrap">
                                <div className="ep-bar under" style={{ width: `${analysis.pctUnder04}%` }}>{analysis.pctUnder04.toFixed(1)}%</div>
                                <div className="ep-bar over" style={{ width: `${analysis.pctOver59}%` }}>{analysis.pctOver59.toFixed(1)}%</div>
                            </div>
                            <span className="ep-note">Under (0-4): {analysis.under04} | Over (5-9): {analysis.over59}</span>
                        </div>
                        <div className="ep-stat-box">
                            <h4>Under 0-5 vs Over 4-9</h4>
                            <div className="ep-bar-wrap">
                                <div className="ep-bar under" style={{ width: `${analysis.pctUnder05}%` }}>{analysis.pctUnder05.toFixed(1)}%</div>
                                <div className="ep-bar over" style={{ width: `${analysis.pctOver49}%` }}>{analysis.pctOver49.toFixed(1)}%</div>
                            </div>
                            <span className="ep-note">Under (0-5): {analysis.under05} | Over (4-9): {analysis.over49}</span>
                        </div>
                    </div>
                )}

                {/* Glowing Trigger Cards */}
                {analysis && (
                    <div className="ep-trigger-grid">
                        <div className="ep-glowing-card under-card">
                            <h4>Highest Entry Digit (Under 0-5)</h4>
                            <div className="glow-digit">{analysis.highestUnderDigit}</div>
                        </div>
                        <div className="ep-glowing-card over-card">
                            <h4>Highest Entry Digit (Over 4-9)</h4>
                            <div className="glow-digit">{analysis.highestOverDigit}</div>
                        </div>
                    </div>
                )}

                {/* Autotrading Controls */}
                <div className="ep-bot-controls">
                    <div className="ep-bot-header">
                        <h3>Autotrading Setup</h3>
                        <span className="ep-status-badge">Status: {autoState}</span>
                    </div>
                    
                    <div className="ep-bot-inputs">
                        <div className="ep-input-group">
                            <label>Stake</label>
                            <input value={stake} onChange={e => setStake(cleanMoneyInput(e.target.value))} disabled={autoState !== 'IDLE'} />
                        </div>
                        <div className="ep-input-group">
                            <label>Martingale</label>
                            <input value={martingale} onChange={e => setMartingale(cleanMoneyInput(e.target.value))} disabled={autoState !== 'IDLE'} />
                        </div>
                        <div className="ep-input-group">
                            <label>Take Profit</label>
                            <input value={takeProfit} onChange={e => setTakeProfit(cleanMoneyInput(e.target.value))} disabled={autoState !== 'IDLE'} />
                        </div>
                        <div className="ep-input-group">
                            <label>Stop Loss</label>
                            <input value={stopLoss} onChange={e => setStopLoss(cleanMoneyInput(e.target.value))} disabled={autoState !== 'IDLE'} />
                        </div>
                        <div className="ep-input-group">
                            <label>Ticks</label>
                            <select value={tickDuration} onChange={e => setTickDuration(e.target.value)} disabled={autoState !== 'IDLE'}>
                                <option value="1">1 Tick</option>
                                <option value="2">2 Ticks</option>
                            </select>
                        </div>
                    </div>

                    <div className="ep-bot-actions">
                        {autoState === 'IDLE' ? (
                            <button className="ep-btn start" onClick={startAutoTrading}>Start Auto-Trading</button>
                        ) : (
                            <>
                                {autoState === 'PAUSED' ? (
                                    <button className="ep-btn start" onClick={() => { autoStateRef.current = 'SCANNING'; setAutoState('SCANNING'); }}>Resume</button>
                                ) : (
                                    <button className="ep-btn pause" onClick={() => { autoStateRef.current = 'PAUSED'; setAutoState('PAUSED'); }}>Pause</button>
                                )}
                                <button className="ep-btn stop" onClick={stopAutoTrading}>Stop</button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

export default ElitePro;
