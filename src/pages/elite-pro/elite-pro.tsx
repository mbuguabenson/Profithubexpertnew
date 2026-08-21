import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { api_base } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { SUPPORTED_VOLATILITY_MARKETS } from '@/utils/digit-strategy';
import { DBOT_TABS } from '@/constants/bot-contents';

import { buyContractForUi, streamContractUntilSettled } from '@/utils/trade-purchase';
import { safeSubscribe } from '@/utils/websocket-handler';
import { isLoggedIn } from '@/utils/token-bridge';
import { generateOAuthURL } from '@/components/shared';
import './elite-pro.scss';

// ─── Types ─────────────────────────────────────────────────────────────────────

type MarketDigitData = {
    symbol: string;
    label: string;
    digits: number[];
    currentPrice: string;
    lastDigit: number;
};

type TradeLogEntry = {
    id: string;
    time: string;
    type: string;
    market: string;
    result: 'WIN' | 'LOSS' | 'PENDING' | 'ABORTED';
    profit: number;
    contractId?: number;
};

type AutoState = 'IDLE' | 'SCANNING' | 'TRADING' | 'PAUSED';

// ─── Constants ─────────────────────────────────────────────────────────────────

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

// Generates smooth bezier curves for SVG line chart
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

// ─── SVG Line Chart ────────────────────────────────────────────────────────────

const DigitLineChart = ({ digits }: { digits: number[] }) => {
    const slice = digits.slice(-CHART_DIGITS);
    if (slice.length < 2) {
        return (
            <div className="ep-chart-empty">
                <span className="ep-chart-empty__icon">📊</span>
                Waiting for tick data...
            </div>
        );
    }

    const W = Math.max(700, slice.length * 15);
    const H = 120;
    const padTop = 20;
    const padBot = 15;
    const usableH = H - padTop - padBot;
    const stepX = W / (slice.length - 1);

    const points = slice.map((d, i) => ({
        x: i * stepX,
        y: padTop + usableH - (d / 9) * usableH,
        d,
    }));

    const pathD = getBezierPath(points);
    const fillD = pathD ? `${pathD} L ${points[points.length - 1].x.toFixed(1)},${H} L ${points[0].x.toFixed(1)},${H} Z` : '';

    return (
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
            <defs>
                <linearGradient id="ep-line-grad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="50%" stopColor="#06b6d4" />
                    <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
                <linearGradient id="ep-area-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                </linearGradient>
            </defs>
            {/* Grid lines */}
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(v => {
                const y = padTop + usableH - (v / 9) * usableH;
                return (
                    <line key={v} x1={0} y1={y} x2={W} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
                );
            })}
            {/* Shaded Area */}
            {fillD && <path d={fillD} fill="url(#ep-area-grad)" />}
            {/* Main Spline path */}
            {pathD && (
                <path
                    d={pathD}
                    fill="none"
                    stroke="url(#ep-line-grad)"
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
            )}
            {/* Dots and labels */}
            {points.map((p, i) => {
                const isUnder = p.d < 5;
                const pointColor = isUnder ? '#10b981' : '#f59e0b';
                return (
                    <g key={i}>
                        <circle
                            cx={p.x}
                            cy={p.y}
                            r={3.5}
                            fill={pointColor}
                            stroke="#0b1511"
                            strokeWidth={1.5}
                            style={{ transition: 'all 0.2s' }}
                        />
                        <text
                            x={p.x}
                            y={p.y - 8}
                            textAnchor="middle"
                            fill="rgba(255,255,255,0.65)"
                            fontSize={9}
                            fontWeight={700}
                            fontFamily="monospace"
                        >
                            {p.d}
                        </text>
                    </g>
                );
            })}
        </svg>
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
    const [scanAll, setScanAll] = useState(true); // Default to scanning all derived synthetic indices
    const [marketsExpanded, setMarketsExpanded] = useState(false);
    const marketsRef = useRef<Map<string, MarketDigitData>>(new Map());
    const [, forceRender] = useState(0);
    const subscriptionsRef = useRef<Map<string, { unsubscribe: () => void }>>(new Map());
    const unmountedRef = useRef(false);
    const uiThrottleRef = useRef(0);

    // ── Autotrading state ──
    const [autoState, setAutoState] = useState<AutoState>('IDLE');
    const [stake, setStake] = useState('0.35');
    const [takeProfit, setTakeProfit] = useState('10');
    const [stopLoss, setStopLoss] = useState('5');
    const [martingale, setMartingale] = useState('2.6');
    const [tickDuration, setTickDuration] = useState('1'); // Default to 1 tick
    const [tradeLog, setTradeLog] = useState<TradeLogEntry[]>([]);
    const [totalProfit, setTotalProfit] = useState(0);
    const [wins, setWins] = useState(0);
    const [losses, setLosses] = useState(0);
    
    const currentStakeRef = useRef(0.35);
    const autoAbortRef = useRef<AbortController | null>(null);
    const autoStateRef = useRef<AutoState>('IDLE');
    const contractStreamAbortRef = useRef<Set<AbortController>>(new Set());

    const totalProfitRef = useRef(0);
    const winsRef = useRef(0);
    const lossesRef = useRef(0);

    // Keep ref in sync with state
    useEffect(() => { autoStateRef.current = autoState; }, [autoState]);
    useEffect(() => { currentStakeRef.current = parseFloat(stake) || 0.35; }, [stake]);
    useEffect(() => { totalProfitRef.current = totalProfit; }, [totalProfit]);
    useEffect(() => { winsRef.current = wins; }, [wins]);
    useEffect(() => { lossesRef.current = losses; }, [losses]);

    // ── Get active market data ──
    const getActiveData = useCallback((): MarketDigitData | null => {
        return marketsRef.current.get(selectedSymbol) || null;
    }, [selectedSymbol]);

    // ── Compute analysis for a digit array ──
    const computeAnalysis = useCallback((digits: number[]) => {
        const slice = digits.slice(-ANALYSIS_WINDOW);
        const total = slice.length || 1;

        // 1. Under 0-4 vs Over 5-9
        const under04 = countDigitsInRange(slice, 0, 4);
        const over59 = countDigitsInRange(slice, 5, 9);
        const pctUnder04 = (under04 / total) * 100;
        const pctOver59 = (over59 / total) * 100;

        // 2. Under 0-5 vs Over 4-9
        const under05 = countDigitsInRange(slice, 0, 5);
        const over49 = countDigitsInRange(slice, 4, 9);
        const pctUnder05 = (under05 / total) * 100;
        const pctOver49 = (over49 / total) * 100;

        // Trend momentum calculation (is percentage increasing?)
        const prevSlice = digits.slice(-(ANALYSIS_WINDOW + 10), -10);
        const prevTotal = prevSlice.length || 1;
        
        const prevUnder04 = prevSlice.length > 0 ? (countDigitsInRange(prevSlice, 0, 4) / prevTotal) * 100 : 50;
        const prevOver59 = prevSlice.length > 0 ? (countDigitsInRange(prevSlice, 5, 9) / prevTotal) * 100 : 50;
        
        const underIncreasing = pctUnder04 > prevUnder04;
        const overIncreasing = pctOver59 > prevOver59;

        // Frequency distribution & Highest Digit overall
        const freq = new Array(10).fill(0);
        slice.forEach(d => { if (d >= 0 && d <= 9) freq[d]++; });
        const highestDigitOverall = freq.indexOf(Math.max(...freq));

        // Find highest entry digit in Under (0-5)
        const underFreq = freq.slice(0, 6);
        const highestUnderDigit = underFreq.indexOf(Math.max(...underFreq));
        const highestUnderPct = ((freq[highestUnderDigit] || 0) / total) * 100;

        // Find highest entry digit in Over (4-9)
        const overFreq = freq.slice(4, 10);
        const highestOverDigit = overFreq.indexOf(Math.max(...overFreq)) + 4;
        const highestOverPct = ((freq[highestOverDigit] || 0) / total) * 100;

        // Determine bias
        const bias: 'under' | 'over' | 'neutral' =
            pctUnder04 > 55 ? 'under' : pctOver59 > 55 ? 'over' : 'neutral';

        // Last 10 ticks
        const last10 = slice.slice(-10);
        const last10Under = last10.length === 10 && last10.every(d => d < 6);
        const last10Over = last10.length === 10 && last10.every(d => d > 3);

        // Last 7 ticks
        const last7 = slice.slice(-7);
        const last7Under = last7.length === 7 && last7.every(d => d < 6);
        const last7Over = last7.length === 7 && last7.every(d => d > 3);

        return {
            under04,
            over59,
            pctUnder04,
            pctOver59,
            under05,
            over49,
            pctUnder05,
            pctOver49,
            highestDigitOverall,
            highestUnderDigit,
            highestUnderPct,
            highestOverDigit,
            highestOverPct,
            freq,
            bias,
            last10Under,
            last10Over,
            last7Under,
            last7Over,
            underIncreasing,
            overIncreasing,
            total,
        };
    }, []);

    // ── Check entry conditions (Internal Logic) ──
    const checkEntrySignal = useCallback((digits: number[]): { direction: 'UNDER' | 'OVER'; prediction: number } | null => {
        const a = computeAnalysis(digits);

        // Condition 1: Under 0-4 vs Over 5-9 threshold is above 55% and increasing
        // Condition 2: Under 0-5 count is >= 34 and Over 4-9 count is <= 25 in last 50 ticks
        // Condition 3: Last 10 ticks are under 6
        // Condition 4: Last 7 ticks are under 6
        const underSignal =
            a.pctUnder04 > 55 &&
            a.underIncreasing &&
            a.under05 >= 34 &&
            a.over49 <= 25 &&
            a.last10Under &&
            a.last7Under;

        if (underSignal) return { direction: 'UNDER', prediction: 6 };

        // Condition 1: Over 5-9 vs Under 0-4 threshold is above 55% and increasing
        // Condition 2: Over 4-9 count is >= 34 and Under 0-5 count is <= 25 in last 50 ticks
        // Condition 3: Last 10 ticks are over 3
        // Condition 4: Last 7 ticks are over 3
        const overSignal =
            a.pctOver59 > 55 &&
            a.overIncreasing &&
            a.over49 >= 34 &&
            a.under05 <= 25 &&
            a.last10Over &&
            a.last7Over;

        if (overSignal) return { direction: 'OVER', prediction: 3 };

        return null;
    }, [computeAnalysis]);

    // ── Subscribe to ticks ──
    useEffect(() => {
        unmountedRef.current = false;
        const shouldSubscribe = showElitePro || autoStateRef.current !== 'IDLE';
        if (!shouldSubscribe) {
            subscriptionsRef.current.forEach(sub => {
                try { sub.unsubscribe(); } catch {}
            });
            subscriptionsRef.current.clear();
            return;
        }

        const symbolsToSubscribe = scanAll ? MARKETS.map(m => m.symbol) : [selectedSymbol];

        // Initialize market data structures
        symbolsToSubscribe.forEach(sym => {
            if (!marketsRef.current.has(sym)) {
                const label = MARKETS.find(m => m.symbol === sym)?.label || sym;
                marketsRef.current.set(sym, {
                    symbol: sym,
                    label,
                    digits: [],
                    currentPrice: '—',
                    lastDigit: 0,
                });
            }
        });

        let isEffectMounted = true;

        const startSubscription = async (sym: string) => {
            if (!api_base.api) return;

            try {
                // 1. Fetch history of ticks
                const res = await api_base.api.send({
                    ticks_history: sym,
                    end: 'latest',
                    count: MAX_DIGITS,
                    style: 'ticks',
                });
                if (!isEffectMounted || unmountedRef.current) return;

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

                // 2. Subscribe to live updates
                const tickObservable = api_base.api.subscribe({ ticks: sym });
                const sub = safeSubscribe(tickObservable, (data: any) => {
                    if (!isEffectMounted || unmountedRef.current) return;

                    const activeMarket = marketsRef.current.get(sym);
                    if (!activeMarket) return;

                    const quote = data?.tick?.quote;
                    if (quote !== undefined && quote !== null) {
                        const digit = extractDigitFromPrice(quote);
                        activeMarket.digits.push(digit);
                        if (activeMarket.digits.length > MAX_DIGITS) activeMarket.digits.shift();
                        activeMarket.currentPrice = String(quote);
                        activeMarket.lastDigit = digit;
                        throttleRender();
                    }
                });

                subscriptionsRef.current.get(sym)?.unsubscribe();
                subscriptionsRef.current.set(sym, sub);
            } catch (err) {
                console.error(`[ElitePro] Subscription error for ${sym}:`, err);
            }
        };

        // Poll if API layer is loading
        let retryTimeout: ReturnType<typeof setTimeout> | null = null;
        
        const initSubscriptions = () => {
            if (!api_base.api) {
                retryTimeout = setTimeout(initSubscriptions, 1000);
                return;
            }
            symbolsToSubscribe.forEach(sym => {
                void startSubscription(sym);
            });
        };

        initSubscriptions();

        // Clean up redundant subscriptions
        subscriptionsRef.current.forEach((sub, sym) => {
            if (!symbolsToSubscribe.includes(sym)) {
                try { sub.unsubscribe(); } catch {}
                subscriptionsRef.current.delete(sym);
            }
        });

        return () => {
            isEffectMounted = false;
            unmountedRef.current = true;
            if (retryTimeout) clearTimeout(retryTimeout);
            
            subscriptionsRef.current.forEach(sub => {
                try { sub.unsubscribe(); } catch {}
            });
            subscriptionsRef.current.clear();
        };
    }, [selectedSymbol, scanAll, showElitePro, client?.loginid, autoState === 'IDLE']);

    const throttleRender = useCallback(() => {
        const now = Date.now();
        if (now - uiThrottleRef.current < 80) return;
        uiThrottleRef.current = now;
        forceRender(n => n + 1);
    }, []);

    // ── Get current active data and analysis ──
    const activeData = getActiveData();
    const analysis = useMemo(() => {
        if (!activeData || activeData.digits.length < 15) return null;
        return computeAnalysis(activeData.digits);
    }, [activeData, activeData?.digits?.length, computeAnalysis]);

    const signal = useMemo(() => {
        if (!activeData || activeData.digits.length < 30) return null;
        return checkEntrySignal(activeData.digits);
    }, [activeData, activeData?.digits?.length, checkEntrySignal]);

    // ── All markets data for dropdown & grid ──
    const allMarketsData = useMemo(() => {
        const result: Array<{ symbol: string; label: string; bias: string; strength: number; pctUnder: number; pctOver: number; lastDigit: number; hasSignal: boolean }> = [];
        marketsRef.current.forEach((data, sym) => {
            if (data.digits.length < 10) return;
            const a = computeAnalysis(data.digits);
            const entrySignal = checkEntrySignal(data.digits);
            const strength = Math.max(a.pctUnder04, a.pctOver59);
            result.push({
                symbol: sym,
                label: data.label,
                bias: a.bias,
                strength,
                pctUnder: a.pctUnder04,
                pctOver: a.pctOver59,
                lastDigit: data.lastDigit,
                hasSignal: !!entrySignal,
            });
        });
        // Sort by strongest bias strength
        result.sort((a, b) => b.strength - a.strength);
        return result;
    }, [computeAnalysis, checkEntrySignal, activeData?.digits?.length]);

    // Find best market automatically
    const bestMarket = useMemo(() => {
        if (allMarketsData.length === 0) return null;
        // Best market has the highest deviation from 50%
        return allMarketsData[0];
    }, [allMarketsData]);

    // Auto switch selected symbol to best market if Scan All is active and collapsed
    useEffect(() => {
        if (scanAll && !marketsExpanded && bestMarket && bestMarket.symbol !== selectedSymbol) {
            setSelectedSymbol(bestMarket.symbol);
        }
    }, [scanAll, marketsExpanded, bestMarket, selectedSymbol]);

    // ── Push transaction to drawer ──
    const pushContract = useCallback((data: any) => {
        try {
            transactions.pushTransaction({ ...data, run_id: run_panel.run_id });
            run_panel.onBotContractEvent(data);
            summary_card.onBotContractEvent(data);
        } catch {
            // ignore
        }
    }, [run_panel, summary_card, transactions]);

    // ── Execute a single trade ──
    const executeTrade = useCallback(async (
        symbol: string,
        direction: 'UNDER' | 'OVER',
        prediction: number,
        stakeAmount: number,
        _abortSignal: AbortSignal,
    ): Promise<number> => {
        const contractType = direction === 'UNDER' ? 'DIGITUNDER' : 'DIGITOVER';
        const dur = parseInt(tickDuration) || 1;
        const params: Record<string, any> = {
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
        const verificationId = `EP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        try {
            const buy = await buyContractForUi({ parameters: params, price: stakeAmount, source: 'ElitePro' });
            const { contract_id, buy_price, transaction_id } = buy;

            pushContract({
                buy_price,
                contract_id,
                transaction_ids: { buy: transaction_id },
                date_start: tradeStartTime,
                display_name: symbol,
                underlying_symbol: symbol,
                shortcode: `ELITE_${contractType}_${symbol}`,
                contract_type: contractType,
                currency: currency || 'USD',
                verification_id: verificationId,
            });

            const abortController = new AbortController();
            contractStreamAbortRef.current.add(abortController);

            const contract = await streamContractUntilSettled({
                contractId: contract_id,
                fallback: {
                    buy_price,
                    contract_id,
                    transaction_ids: { buy: transaction_id },
                    date_start: tradeStartTime,
                    display_name: symbol,
                    underlying_symbol: symbol,
                    shortcode: `ELITE_${contractType}_${symbol}`,
                    contract_type: contractType,
                    currency: currency || 'USD',
                    verification_id: verificationId,
                },
                onUpdate: snapshot => {
                    if (!unmountedRef.current) pushContract(snapshot);
                },
                signal: abortController.signal,
                source: 'ElitePro',
            });

            contractStreamAbortRef.current.delete(abortController);
            const profit = Number(contract.profit ?? 0);
            return profit;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[ElitePro] Trade execution error:', msg);
            throw err;
        }
    }, [tickDuration, currency, pushContract]);

    // ── Add trade log entry ──
    const addLogEntry = useCallback((type: string, market: string, result: 'WIN' | 'LOSS' | 'PENDING' | 'ABORTED', profit: number) => {
        setTradeLog(prev => [{
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            time: new Date().toLocaleTimeString(),
            type,
            market,
            result,
            profit,
        }, ...prev].slice(0, 100));
    }, []);

    // ── Autotrading loop ──
    const startAutoTrading = useCallback(async () => {
        if (autoStateRef.current !== 'IDLE' && autoStateRef.current !== 'PAUSED') return;

        // Reset metrics on fresh start
        if (autoStateRef.current === 'IDLE') {
            setTotalProfit(0);
            totalProfitRef.current = 0;
            setWins(0);
            winsRef.current = 0;
            setLosses(0);
            lossesRef.current = 0;
        }

        setAutoState('SCANNING');
        autoAbortRef.current = new AbortController();
        const abortSignal = autoAbortRef.current.signal;

        const tp = parseFloat(takeProfit) || 999;
        const sl = parseFloat(stopLoss) || 999;
        const mgMultiplier = parseFloat(martingale) || 2.6;
        const baseStake = parseFloat(stake) || 0.35;
        currentStakeRef.current = baseStake;
        let consecutiveLosses = 0;

        const loop = async () => {
            while (!abortSignal.aborted && autoStateRef.current !== 'IDLE') {
                if (autoStateRef.current === 'PAUSED') {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }

                // Check P&L limits
                if (totalProfitRef.current >= tp) {
                    addLogEntry('TARGET REACHED', 'TP Hit', 'PENDING', 0);
                    setAutoState('IDLE');
                    break;
                }
                if (totalProfitRef.current <= -sl) {
                    addLogEntry('STOP LOSS REACHED', 'SL Hit', 'PENDING', 0);
                    setAutoState('IDLE');
                    break;
                }

                const currentData = marketsRef.current.get(selectedSymbol);
                if (!currentData || currentData.digits.length < 30) {
                    await new Promise(r => setTimeout(r, 1500));
                    continue;
                }

                const entrySignal = checkEntrySignal(currentData.digits);
                if (!entrySignal) {
                    if (autoStateRef.current !== 'SCANNING') setAutoState('SCANNING');
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }

                // Pre-entry verification checklist:
                // Verify last 7 ticks still favor the direction
                const recentDigits = currentData.digits.slice(-7);
                const isUnderAborted = entrySignal.direction === 'UNDER' && recentDigits.some(d => d >= 6);
                const isOverAborted = entrySignal.direction === 'OVER' && recentDigits.some(d => d <= 3);

                if (isUnderAborted || isOverAborted) {
                    addLogEntry(
                        `ABORTED ${entrySignal.direction}`,
                        currentData.label,
                        'ABORTED',
                        0
                    );
                    console.log('[ElitePro] Last tick trend flip check aborted execution.');
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }

                // Execute contract purchase
                setAutoState('TRADING');
                try {
                    const profit = await executeTrade(
                        selectedSymbol,
                        entrySignal.direction,
                        entrySignal.prediction,
                        currentStakeRef.current,
                        abortSignal,
                    );

                    const isWin = profit > 0;
                    const resultStr = isWin ? 'WIN' : 'LOSS';
                    addLogEntry(
                        `${entrySignal.direction} ${entrySignal.prediction}`,
                        currentData.label,
                        resultStr as 'WIN' | 'LOSS',
                        profit,
                    );

                    const nextProfit = Number((totalProfitRef.current + profit).toFixed(2));
                    totalProfitRef.current = nextProfit;
                    setTotalProfit(nextProfit);

                    if (isWin) {
                        winsRef.current++;
                        setWins(winsRef.current);
                        consecutiveLosses = 0;
                        currentStakeRef.current = baseStake;
                    } else {
                        lossesRef.current++;
                        setLosses(lossesRef.current);
                        consecutiveLosses++;
                        currentStakeRef.current = Number((currentStakeRef.current * mgMultiplier).toFixed(2));
                    }

                    // Cooldown between trades
                    await new Promise(r => setTimeout(r, 1500));
                } catch (err) {
                    console.error('[ElitePro] Trade loop error:', err);
                    addLogEntry('EXECUTION FAILED', currentData.label, 'LOSS', 0);
                    await new Promise(r => setTimeout(r, 3000));
                }
            }
        };

        loop();
    }, [selectedSymbol, stake, takeProfit, stopLoss, martingale, checkEntrySignal, executeTrade, addLogEntry]);

    const pauseAutoTrading = useCallback(() => {
        setAutoState('PAUSED');
    }, []);

    const resumeAutoTrading = useCallback(() => {
        if (autoStateRef.current === 'PAUSED') {
            setAutoState('SCANNING');
        }
    }, []);

    const stopAutoTrading = useCallback(() => {
        setAutoState('IDLE');
        autoAbortRef.current?.abort();
        autoAbortRef.current = null;
        contractStreamAbortRef.current.forEach(c => c.abort());
        contractStreamAbortRef.current.clear();
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopAutoTrading();
        };
    }, []);

    const handleLogin = async () => {
        const oauthUrl = await generateOAuthURL();
        if (oauthUrl) window.location.replace(oauthUrl);
    };

    return (
        <div className="elite-pro">
            <div className="ep-background-blobs">
                <div className="blob blob-1" />
                <div className="blob blob-2" />
                <div className="blob blob-3" />
            </div>

            {!logged_in && (
                <div className="ep-login-overlay">
                    <div className="ep-login-overlay__panel">
                        <span className="ep-login-overlay__icon">👑</span>
                        <h3>ProfitHub Elite Pro</h3>
                        <p>Authenticate with your Deriv account to unlock advanced scanners and auto-trading features.</p>
                        <button className="ep-login-overlay__btn" onClick={handleLogin}>
                            Connect Account
                        </button>
                    </div>
                </div>
            )}

            <div className="ep-content">
                {/* ── Header ── */}
                <div className="ep-glass ep-header">
                    <div className="ep-header__title">
                        <span className="ep-crown">👑</span>
                        <div className="ep-title-meta">
                            <span className="ep-title-text">Elite Pro</span>
                            <span className="ep-title-sub">Multi-Market Neural Scanner</span>
                        </div>
                    </div>
                    <div className="ep-header__actions">
                        {bestMarket && (
                            <div className="ep-best-market-badge">
                                🏆 Best Market: <strong>{bestMarket.label}</strong>
                            </div>
                        )}
                        <span className="ep-header__badge">LIVE ENGINE ACTIVE</span>
                    </div>
                </div>

                {/* ── Market Scanner Panel ── */}
                <div className="ep-glass ep-market-selector">
                    <div className="ep-market-selector__header">
                        <div className="select-container">
                            <select
                                className="ep-market-selector__select"
                                value={selectedSymbol}
                                onChange={e => {
                                    setSelectedSymbol(e.target.value);
                                    if (scanAll) setScanAll(false); // disable auto-scan all if manually selecting
                                }}
                            >
                                {MARKETS.map(m => (
                                    <option key={m.symbol} value={m.symbol}>{m.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="toggle-container">
                            <label className="ep-market-selector__toggle">
                                <input
                                    type="checkbox"
                                    checked={scanAll}
                                    onChange={e => setScanAll(e.target.checked)}
                                />
                                <span className="custom-checkbox" />
                                Scan All Derived Indices
                            </label>
                        </div>
                    </div>

                    {/* All Markets Stats Dropdown Accordion */}
                    {scanAll && (
                        <div className="ep-markets-accordion">
                            <div
                                className={`ep-markets-accordion__toggle ${marketsExpanded ? 'open' : ''}`}
                                onClick={() => setMarketsExpanded(!marketsExpanded)}
                            >
                                <span>📊 Multi-Market Indices Real-Time Scanner ({allMarketsData.length} active)</span>
                                <span className="arrow">▼</span>
                            </div>
                            {marketsExpanded && (
                                <div className="ep-markets-accordion__grid">
                                    {allMarketsData.map(m => {
                                        const isSelected = m.symbol === selectedSymbol;
                                        return (
                                            <div
                                                key={m.symbol}
                                                className={`ep-market-card ${isSelected ? 'active' : ''} ${m.hasSignal ? 'signal-glowing' : ''}`}
                                                onClick={() => {
                                                    setSelectedSymbol(m.symbol);
                                                }}
                                            >
                                                <div className="ep-market-card__head">
                                                    <span className="name">{m.label}</span>
                                                    {m.hasSignal && <span className="pulse-signal-dot" />}
                                                </div>
                                                <div className="ep-market-card__body">
                                                    <div className="row">
                                                        <span className="price">L: {m.lastDigit}</span>
                                                        <span className={`bias bias--${m.bias}`}>{m.bias.toUpperCase()}</span>
                                                    </div>
                                                    <div className="stat-bars">
                                                        <span className="u-bar" style={{ color: '#10b981' }}>U: {m.pctUnder.toFixed(0)}%</span>
                                                        <span className="o-bar" style={{ color: '#f59e0b' }}>O: {m.pctOver.toFixed(0)}%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Price & Last Digit Indicator ── */}
                <div className="ep-price-panel-wrapper">
                    <div className="ep-glass ep-price-card">
                        <span className="label">Current Quote</span>
                        <span className="value">{activeData?.currentPrice ?? '—'}</span>
                    </div>
                    <div className="ep-glass ep-digit-card">
                        <span className="label">Last Tick Digit</span>
                        <div className={`digit-orb-wrapper digit-orb-wrapper--${(activeData?.lastDigit ?? 0) < 5 ? 'under' : 'over'}`}>
                            <div className="digit-orb">{activeData?.lastDigit ?? '—'}</div>
                        </div>
                    </div>
                </div>

                {/* ── Digit Line Chart ── */}
                <div className="ep-glass ep-chart-card">
                    <div className="ep-chart-card__label">
                        📊 50-Ticks Spline Line Chart ({MARKETS.find(m => m.symbol === selectedSymbol)?.label})
                    </div>
                    <div className="ep-chart-wrap">
                        <DigitLineChart digits={activeData?.digits || []} />
                    </div>
                </div>

                {/* ── Statistical Ratios & Highest Entry Digits ── */}
                {analysis && (
                    <div className="ep-glass ep-stats-card">
                        <div className="ep-stats-card__header">
                            <span className="title">Neural Ratio Metrics</span>
                            <span className={`ep-bias-tag ep-bias-tag--${analysis.bias}`}>
                                {analysis.bias === 'under' ? '📉 UNDER DOMINANT' : analysis.bias === 'over' ? '📈 OVER DOMINANT' : '⚖️ NEUTRAL'}
                            </span>
                        </div>

                        {/* Under 0-4 vs Over 5-9 */}
                        <div className="ep-ratio-bar-wrapper">
                            <div className="labels">
                                <span>Under (0-4): {analysis.under04} ticks ({analysis.pctUnder04.toFixed(1)}%)</span>
                                <span>Over (5-9): {analysis.over59} ticks ({analysis.pctOver59.toFixed(1)}%)</span>
                            </div>
                            <div className="bar-track">
                                <div className="bar-fill bar-fill--under" style={{ width: `${analysis.pctUnder04}%` }} />
                                <div className="bar-fill bar-fill--over" style={{ width: `${analysis.pctOver59}%` }} />
                            </div>
                            {analysis.underIncreasing && analysis.pctUnder04 > 55 && (
                                <span className="momentum-tip under-up">⚡ Under Momentum increasing (Target met)</span>
                            )}
                            {analysis.overIncreasing && analysis.pctOver59 > 55 && (
                                <span className="momentum-tip over-up">⚡ Over Momentum increasing (Target met)</span>
                            )}
                        </div>

                        {/* Under 0-5 vs Over 4-9 */}
                        <div className="ep-ratio-bar-wrapper">
                            <div className="labels">
                                <span>Under (0-5): {analysis.under05} ticks ({analysis.pctUnder05.toFixed(1)}%)</span>
                                <span>Over (4-9): {analysis.over49} ticks ({analysis.pctOver49.toFixed(1)}%)</span>
                            </div>
                            <div className="bar-track">
                                <div className="bar-fill bar-fill--under" style={{ width: `${analysis.pctUnder05}%` }} />
                                <div className="bar-fill bar-fill--over" style={{ width: `${analysis.pctOver49}%` }} />
                            </div>
                        </div>

                        {/* Highest Entry Digits Glowing badges */}
                        <div className="ep-entry-digits-row">
                            <div className="digit-badge-card">
                                <span className="badge-title">Under Entry Digit</span>
                                <div className={`glowing-badge glowing-badge--under ${analysis.highestUnderPct >= analysis.highestOverPct ? 'primary-glowing' : ''}`}>
                                    <span className="digit">{analysis.highestUnderDigit}</span>
                                    <span className="pct">{analysis.highestUnderPct.toFixed(0)}%</span>
                                </div>
                            </div>
                            <div className="digit-badge-card">
                                <span className="badge-title">Over Entry Digit</span>
                                <div className={`glowing-badge glowing-badge--over ${analysis.highestOverPct >= analysis.highestUnderPct ? 'primary-glowing' : ''}`}>
                                    <span className="digit">{analysis.highestOverDigit}</span>
                                    <span className="pct">{analysis.highestOverPct.toFixed(0)}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Auto-Trading Panel ── */}
                <div className="ep-glass ep-auto-section">
                    <div className="ep-auto-section__title">
                        <span>🤖 Auto Trading Engine</span>
                        {signal && (
                            <span className="ep-active-signal-indicator">
                                {signal.direction} {signal.prediction} Triggered
                            </span>
                        )}
                        {autoState !== 'IDLE' && <span className="scanning-pulse" />}
                    </div>

                    {/* Signal Requirements List */}
                    {analysis && (
                        <div className="ep-signal-checklist">
                            <div className="checklist-column">
                                <h4>Under 6 Requirements</h4>
                                <div className={`check-item ${analysis.pctUnder04 > 55 && analysis.underIncreasing ? 'met' : ''}`}>
                                    <span className="bullet">✓</span> Under 0-4 &gt; 55% &amp; Increasing ({analysis.pctUnder04.toFixed(1)}%)
                                </div>
                                <div className={`check-item ${analysis.under05 >= 34 && analysis.over49 <= 25 ? 'met' : ''}`}>
                                    <span className="bullet">✓</span> Under 0-5 &gt;= 34 &amp; Over 4-9 &lt;= 25 (U:{analysis.under05} / O:{analysis.over49})
                                </div>
                                <div className={`check-item ${analysis.last10Under ? 'met' : ''}`}>
                                    <span className="bullet">✓</span> Last 10 ticks under 6 ({analysis.last10Under ? 'YES' : 'NO'})
                                </div>
                            </div>

                            <div className="checklist-column">
                                <h4>Over 3 Requirements</h4>
                                <div className={`check-item ${analysis.pctOver59 > 55 && analysis.overIncreasing ? 'met' : ''}`}>
                                    <span className="bullet">✓</span> Over 5-9 &gt; 55% &amp; Increasing ({analysis.pctOver59.toFixed(1)}%)
                                </div>
                                <div className={`check-item ${analysis.over49 >= 34 && analysis.under05 <= 25 ? 'met' : ''}`}>
                                    <span className="bullet">✓</span> Over 4-9 &gt;= 34 &amp; Under 0-5 &lt;= 25 (O:{analysis.over49} / U:{analysis.under05})
                                </div>
                                <div className={`check-item ${analysis.last10Over ? 'met' : ''}`}>
                                    <span className="bullet">✓</span> Last 10 ticks over 3 ({analysis.last10Over ? 'YES' : 'NO'})
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Controls */}
                    <div className="ep-controls-grid">
                        <div className="ep-input-group">
                            <span className="ep-input-group__label">Base Stake ({currency})</span>
                            <input
                                className="ep-input-group__input"
                                value={stake}
                                onChange={e => setStake(cleanMoneyInput(e.target.value))}
                                disabled={autoState !== 'IDLE'}
                            />
                        </div>
                        <div className="ep-input-group">
                            <span className="ep-input-group__label">Martingale Factor</span>
                            <input
                                className="ep-input-group__input"
                                value={martingale}
                                onChange={e => setMartingale(cleanMoneyInput(e.target.value))}
                                disabled={autoState !== 'IDLE'}
                            />
                        </div>
                        <div className="ep-input-group">
                            <span className="ep-input-group__label">Take Profit ({currency})</span>
                            <input
                                className="ep-input-group__input"
                                value={takeProfit}
                                onChange={e => setTakeProfit(cleanMoneyInput(e.target.value))}
                                disabled={autoState !== 'IDLE'}
                            />
                        </div>
                        <div className="ep-input-group">
                            <span className="ep-input-group__label">Stop Loss ({currency})</span>
                            <input
                                className="ep-input-group__input"
                                value={stopLoss}
                                onChange={e => setStopLoss(cleanMoneyInput(e.target.value))}
                                disabled={autoState !== 'IDLE'}
                            />
                        </div>
                        <div className="ep-input-group">
                            <span className="ep-input-group__label">Ticks Duration</span>
                            <select
                                className="ep-input-group__input select"
                                value={tickDuration}
                                onChange={e => setTickDuration(e.target.value)}
                                disabled={autoState !== 'IDLE'}
                            >
                                <option value="1">1 Tick (Recommended)</option>
                                <option value="2">2 Ticks</option>
                            </select>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="ep-btn-row">
                        {autoState === 'IDLE' && (
                            <button className="ep-btn ep-btn--start" onClick={startAutoTrading} disabled={!logged_in}>
                                ▶ Launch Neural Auto Bot
                            </button>
                        )}
                        {(autoState === 'SCANNING' || autoState === 'TRADING') && (
                            <>
                                <button className="ep-btn ep-btn--pause" onClick={pauseAutoTrading}>⏸ Pause Engine</button>
                                <button className="ep-btn ep-btn--stop" onClick={stopAutoTrading}>⏹ Stop Engine</button>
                            </>
                        )}
                        {autoState === 'PAUSED' && (
                            <>
                                <button className="ep-btn ep-btn--start" onClick={resumeAutoTrading}>▶ Resume Engine</button>
                                <button className="ep-btn ep-btn--stop" onClick={stopAutoTrading}>⏹ Stop Engine</button>
                            </>
                        )}
                    </div>

                    {/* Statistics and P&L */}
                    <div className="ep-pnl-row">
                        <div className="ep-pnl-row__item">
                            <span className="label">Total P&L</span>
                            <span className={`value ${totalProfit >= 0 ? 'value--green' : 'value--red'}`}>
                                {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(2)} {currency}
                            </span>
                        </div>
                        <div className="ep-pnl-row__item">
                            <span className="label">Wins</span>
                            <span className="value value--green">{wins}</span>
                        </div>
                        <div className="ep-pnl-row__item">
                            <span className="label">Losses</span>
                            <span className="value value--red">{losses}</span>
                        </div>
                        <div className="ep-pnl-row__item">
                            <span className="label">Next Stake</span>
                            <span className="value value--white">{currentStakeRef.current.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                {/* ── Local Logs ── */}
                <div className="ep-glass ep-trade-log">
                    <div className="ep-trade-log__title">📋 Engine Logs</div>
                    {tradeLog.length === 0 ? (
                        <div className="ep-trade-log__empty">Bot is currently idle. Launch the bot to start logging.</div>
                    ) : (
                        <div className="ep-trade-log__list">
                            {tradeLog.map(entry => (
                                <div key={entry.id} className="ep-log-item">
                                    <span className="ep-log-item__time">{entry.time}</span>
                                    <span className="ep-log-item__type">{entry.type} • {entry.market}</span>
                                    <span className={`ep-log-item__result ep-log-item__result--${entry.result.toLowerCase()}`}>
                                        {entry.result}
                                    </span>
                                    <span className={`ep-log-item__profit ep-log-item__profit--${entry.profit >= 0 ? 'positive' : 'negative'}`}>
                                        {entry.profit >= 0 ? '+' : ''}{entry.profit.toFixed(2)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export { ElitePro };
export default ElitePro;
