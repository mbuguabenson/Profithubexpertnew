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
    result: 'WIN' | 'LOSS' | 'PENDING';
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

// ─── SVG Line Chart ────────────────────────────────────────────────────────────

const DigitLineChart = ({ digits }: { digits: number[] }) => {
    const slice = digits.slice(-CHART_DIGITS);
    if (slice.length < 2) return <div style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Waiting for tick data...</div>;

    const W = Math.max(700, slice.length * 14);
    const H = 110;
    const padTop = 18;
    const padBot = 10;
    const usableH = H - padTop - padBot;
    const stepX = W / (slice.length - 1);

    const points = slice.map((d, i) => ({
        x: i * stepX,
        y: padTop + usableH - (d / 9) * usableH,
        d,
    }));

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <defs>
                <linearGradient id='ep-line-grad' x1='0' y1='0' x2='1' y2='0'>
                    <stop offset='0%' stopColor='#8b5cf6' />
                    <stop offset='50%' stopColor='#06b6d4' />
                    <stop offset='100%' stopColor='#8b5cf6' />
                </linearGradient>
            </defs>
            {/* Grid lines */}
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(v => {
                const y = padTop + usableH - (v / 9) * usableH;
                return (
                    <line key={v} x1={0} y1={y} x2={W} y2={y} stroke='rgba(255,255,255,0.06)' strokeWidth={0.5} />
                );
            })}
            {/* Main path */}
            <path d={pathD} fill='none' stroke='url(#ep-line-grad)' strokeWidth={2} strokeLinejoin='round' strokeLinecap='round' />
            {/* Dots and labels */}
            {points.map((p, i) => (
                <g key={i}>
                    <circle cx={p.x} cy={p.y} r={3} fill='#8b5cf6' stroke='#0e1424' strokeWidth={1.5} />
                    <text x={p.x} y={p.y - 7} textAnchor='middle' fill='rgba(255,255,255,0.55)' fontSize={8} fontWeight={600}>{p.d}</text>
                </g>
            ))}
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
    const [scanAll, setScanAll] = useState(false);
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
    const [tickDuration, setTickDuration] = useState('1');
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

        // Under 0-4 vs Over 5-9
        const under04 = countDigitsInRange(slice, 0, 4);
        const over59 = countDigitsInRange(slice, 5, 9);
        const pctUnder04 = (under04 / total) * 100;
        const pctOver59 = (over59 / total) * 100;

        // Under 0-5 vs Over 4-9
        const under05 = countDigitsInRange(slice, 0, 5);
        const over49 = countDigitsInRange(slice, 4, 9);

        // Frequency distribution
        const freq = new Array(10).fill(0);
        slice.forEach(d => { if (d >= 0 && d <= 9) freq[d]++; });
        const highestDigit = freq.indexOf(Math.max(...freq));

        // Determine bias
        const bias: 'under' | 'over' | 'neutral' =
            pctUnder04 > 55 ? 'under' : pctOver59 > 55 ? 'over' : 'neutral';

        // Last 10 ticks analysis
        const last10 = slice.slice(-10);
        const last10Under = countDigitsInRange(last10, 0, 5);
        const last10Over = countDigitsInRange(last10, 4, 9);

        // Last 7 ticks analysis
        const last7 = slice.slice(-7);
        const last7UnderCount = last7.filter(d => d < 6).length;
        const last7OverCount = last7.filter(d => d > 3).length;

        // Momentum (is the under04 % increasing?)
        const prevSlice = digits.slice(-(ANALYSIS_WINDOW + 10), -10);
        const prevUnder04 = prevSlice.length > 0 ? (countDigitsInRange(prevSlice, 0, 4) / (prevSlice.length || 1)) * 100 : 50;
        const isIncreasing = pctUnder04 > prevUnder04;

        return {
            under04,
            over59,
            pctUnder04,
            pctOver59,
            under05,
            over49,
            pctUnder05: (under05 / total) * 100,
            pctOver49: (over49 / total) * 100,
            highestDigit,
            freq,
            bias,
            last10Under,
            last10Over,
            last7UnderCount,
            last7OverCount,
            isIncreasing,
            total,
        };
    }, []);

    // ── Check entry conditions ──
    const checkEntrySignal = useCallback((digits: number[]): { direction: 'UNDER' | 'OVER'; prediction: number } | null => {
        const a = computeAnalysis(digits);

        // Condition 1: Under 0-4 threshold above 55% and increasing → Under 6
        // Condition 2: under05 > over49 AND last 10 are mostly under → Under 6
        // Condition 3: Last 7 ticks favour under direction (digits < 6)
        const underSignal =
            a.pctUnder04 > 55 &&
            a.isIncreasing &&
            a.under05 > a.over49 &&
            a.last10Under >= 7 &&
            a.last7UnderCount >= 5;

        if (underSignal) return { direction: 'UNDER', prediction: 6 };

        // Mirror for Over: Over 5-9 threshold above 55% and trend is towards over
        const overSlice = digits.slice(-(ANALYSIS_WINDOW + 10), -10);
        const prevOver59 = overSlice.length > 0 ? (countDigitsInRange(overSlice, 5, 9) / (overSlice.length || 1)) * 100 : 50;
        const overIncreasing = a.pctOver59 > prevOver59;

        const overSignal =
            a.pctOver59 > 55 &&
            overIncreasing &&
            a.over49 > a.under05 &&
            a.last10Over >= 7 &&
            a.last7OverCount >= 5;

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

        // Initialize market data
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
                // 1. Fetch history
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

                    const market = marketsRef.current.get(sym);
                    if (!market) return;

                    const quote = data?.tick?.quote;
                    if (quote !== undefined && quote !== null) {
                        const digit = extractDigitFromPrice(quote);
                        market.digits.push(digit);
                        if (market.digits.length > MAX_DIGITS) market.digits.shift();
                        market.currentPrice = String(quote);
                        market.lastDigit = digit;
                        throttleRender();
                    }
                });

                subscriptionsRef.current.get(sym)?.unsubscribe();
                subscriptionsRef.current.set(sym, sub);
            } catch (err) {
                console.error(`[ElitePro] Subscription error for ${sym}:`, err);
            }
        };

        // If api_base.api is not ready, poll until it is
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

        // Clean up symbols that are no longer needed
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
        if (now - uiThrottleRef.current < 100) return;
        uiThrottleRef.current = now;
        forceRender(n => n + 1);
    }, []);

    // ── Get current active data and analysis ──
    const activeData = getActiveData();
    const analysis = useMemo(() => {
        if (!activeData || activeData.digits.length < 10) return null;
        return computeAnalysis(activeData.digits);
    }, [activeData, activeData?.digits?.length, computeAnalysis]);

    const signal = useMemo(() => {
        if (!activeData || activeData.digits.length < 30) return null;
        return checkEntrySignal(activeData.digits);
    }, [activeData, activeData?.digits?.length, checkEntrySignal]);

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
    const addLogEntry = useCallback((type: string, market: string, result: 'WIN' | 'LOSS' | 'PENDING', profit: number) => {
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

        // Reset metrics if starting from IDLE
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
                // If paused, wait
                if (autoStateRef.current === 'PAUSED') {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }

                // Check PnL limits
                if (totalProfitRef.current >= tp) {
                    console.log('[ElitePro] Take profit reached:', totalProfitRef.current);
                    setAutoState('IDLE');
                    break;
                }
                if (totalProfitRef.current <= -sl) {
                    console.log('[ElitePro] Stop loss reached:', totalProfitRef.current);
                    setAutoState('IDLE');
                    break;
                }

                // Get current signal
                const currentData = marketsRef.current.get(selectedSymbol);
                if (!currentData || currentData.digits.length < 30) {
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }

                const entrySignal = checkEntrySignal(currentData.digits);
                if (!entrySignal) {
                    setAutoState('SCANNING');
                    await new Promise(r => setTimeout(r, 1500));
                    continue;
                }

                // Signal found - execute trade
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

                    // Brief cooldown between trades
                    await new Promise(r => setTimeout(r, 1200));
                } catch (err) {
                    console.error('[ElitePro] Trade loop error:', err);
                    addLogEntry('ERROR', currentData.label, 'LOSS', 0);
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

    // ── All markets data for dropdown ──
    const allMarketsData = useMemo(() => {
        const result: Array<{ symbol: string; label: string; bias: string; pctUnder: number; pctOver: number }> = [];
        marketsRef.current.forEach((data, sym) => {
            if (data.digits.length < 10) return;
            const a = computeAnalysis(data.digits);
            result.push({
                symbol: sym,
                label: data.label,
                bias: a.bias,
                pctUnder: a.pctUnder04,
                pctOver: a.pctOver59,
            });
        });
        // Sort by strongest bias
        result.sort((a, b) => Math.abs(b.pctUnder - 50) - Math.abs(a.pctUnder - 50));
        return result;
    }, [computeAnalysis, activeData?.digits?.length]);

    // Find best market automatically
    type BestMarketInfo = { symbol: string; label: string; bias: string; strength: number };
    const bestMarket = useMemo((): BestMarketInfo | null => {
        let best: BestMarketInfo | null = null;
        const entries = Array.from(marketsRef.current.entries());
        for (const [sym, data] of entries) {
            if (data.digits.length < 30) continue;
            const a = computeAnalysis(data.digits);
            const strength = Math.max(a.pctUnder04, a.pctOver59);
            if (!best || strength > best.strength) {
                best = { symbol: sym, label: data.label, bias: a.bias, strength };
            }
        }
        return best;
    }, [computeAnalysis, activeData?.digits?.length]);

    // ── Render ──

    return (
        <div className='elite-pro'>
            {/* Aurora blobs */}
            <div className='ep-aurora ep-aurora--1' />
            <div className='ep-aurora ep-aurora--2' />
            <div className='ep-aurora ep-aurora--3' />

            {!logged_in && (
                <div className='ep-login-overlay'>
                    <div className='ep-login-overlay__text'>Log in to access Elite Pro Trading</div>
                    <button className='ep-login-overlay__btn' onClick={handleLogin}>Log In</button>
                </div>
            )}

            <div className='ep-content'>
                {/* ── Header ── */}
                <div className='ep-glass ep-header'>
                    <div className='ep-header__title'>
                        <span className='ep-crown'>👑</span>
                        <span className='ep-title-text'>Elite Pro</span>
                    </div>
                    <span className='ep-header__badge'>Live Scanner</span>
                </div>

                {/* ── Market Selector ── */}
                <div className='ep-glass ep-market-selector'>
                    <div className='ep-market-selector__row'>
                        <select
                            className='ep-market-selector__select'
                            value={selectedSymbol}
                            onChange={e => setSelectedSymbol(e.target.value)}
                        >
                            {MARKETS.map(m => (
                                <option key={m.symbol} value={m.symbol}>{m.label}</option>
                            ))}
                        </select>
                        <label className='ep-market-selector__toggle'>
                            <input type='checkbox' checked={scanAll} onChange={e => setScanAll(e.target.checked)} />
                            Scan All Markets
                        </label>
                    </div>
                    {bestMarket && (
                        <div className='ep-best-market'>
                            🏆 Best Market: <strong>{bestMarket.label}</strong>
                            {' '}({bestMarket.bias === 'under' ? '🟢 Under' : bestMarket.bias === 'over' ? '🔴 Over' : '⚪ Neutral'} — {bestMarket.strength.toFixed(1)}%)
                        </div>
                    )}
                </div>

                {/* ── Price & Last Digit ── */}
                <div className='ep-glass ep-price-row'>
                    <div className='ep-price-row__price'>
                        <span className='label'>Current Price</span>
                        <span className='value'>{activeData?.currentPrice ?? '—'}</span>
                    </div>
                    <div className='ep-price-row__digit'>
                        <span className='label'>Last Digit</span>
                        <div className='digit-orb'>{activeData?.lastDigit ?? '—'}</div>
                    </div>
                </div>

                {/* ── Digit Line Chart ── */}
                <div className='ep-glass ep-chart-card'>
                    <div className='ep-chart-card__label'>
                        📊 Last {CHART_DIGITS} Digits Line Chart
                    </div>
                    <div className='ep-chart-wrap'>
                        <DigitLineChart digits={activeData?.digits || []} />
                    </div>
                </div>

                {/* ── Statistical Analysis: Under 0-4 vs Over 5-9 ── */}
                {analysis && (
                    <div className='ep-glass ep-stats-section'>
                        <div className='ep-stats-section__title'>
                            Under 0-4 vs Over 5-9 Analysis
                            <span className={`ep-trend-badge ep-trend-badge--${analysis.bias}`}>
                                {analysis.bias === 'under' ? '📉 Under Dominant' : analysis.bias === 'over' ? '📈 Over Dominant' : '⚖️ Neutral'}
                            </span>
                        </div>
                        <div className='ep-stat-bar'>
                            <div className='ep-stat-bar__header'>
                                <span>Under (0-4): {analysis.under04} digits ({analysis.pctUnder04.toFixed(1)}%)</span>
                                <span>Over (5-9): {analysis.over59} digits ({analysis.pctOver59.toFixed(1)}%)</span>
                            </div>
                            <div className='ep-stat-bar__track'>
                                <div className='ep-stat-bar__fill ep-stat-bar__fill--under' style={{ width: `${analysis.pctUnder04}%` }} />
                                <div className='ep-stat-bar__fill ep-stat-bar__fill--over' style={{ width: `${analysis.pctOver59}%` }} />
                            </div>
                        </div>
                        {analysis.isIncreasing && analysis.pctUnder04 > 55 && (
                            <div style={{ fontSize: 11, color: '#10b981' }}>⬆️ Under trend is increasing — strong signal</div>
                        )}
                    </div>
                )}

                {/* ── Statistical Analysis: Under 0-5 vs Over 4-9 ── */}
                {analysis && (
                    <div className='ep-glass ep-stats-section'>
                        <div className='ep-stats-section__title'>Under 0-5 vs Over 4-9 Analysis</div>
                        <div className='ep-stat-bar'>
                            <div className='ep-stat-bar__header'>
                                <span>Under (0-5): {analysis.under05} digits ({analysis.pctUnder05.toFixed(1)}%)</span>
                                <span>Over (4-9): {analysis.over49} digits ({analysis.pctOver49.toFixed(1)}%)</span>
                            </div>
                            <div className='ep-stat-bar__track'>
                                <div className='ep-stat-bar__fill ep-stat-bar__fill--under' style={{ width: `${analysis.pctUnder05}%` }} />
                                <div className='ep-stat-bar__fill ep-stat-bar__fill--over' style={{ width: `${analysis.pctOver49}%` }} />
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Highest Entry Digit Card ── */}
                {analysis && (
                    <div className='ep-glass ep-entry-card'>
                        <div className='ep-entry-card__label'>🎯 Highest Entry Digit</div>
                        <div className={`ep-entry-card__digit-glow ep-entry-card__digit-glow--${analysis.bias}`}>
                            {analysis.highestDigit}
                        </div>
                        <div className='ep-entry-card__direction-row'>
                            <div className='ep-entry-card__direction-item ep-entry-card__direction-item--under'>
                                <span className='dir-label'>Under Entry</span>
                                <span className='dir-val'>Under 6</span>
                            </div>
                            <div className='ep-entry-card__direction-item ep-entry-card__direction-item--over'>
                                <span className='dir-label'>Over Entry</span>
                                <span className='dir-val'>Over 3</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Markets Wide Dropdown (when scanning all) ── */}
                {scanAll && (
                    <div className='ep-glass ep-markets-dropdown'>
                        <div
                            className={`ep-markets-dropdown__toggle ${marketsExpanded ? 'open' : ''}`}
                            onClick={() => setMarketsExpanded(!marketsExpanded)}
                        >
                            <span>📊 All Markets Stats ({allMarketsData.length} markets)</span>
                            <span className='arrow'>▼</span>
                        </div>
                        {marketsExpanded && (
                            <div className='ep-markets-dropdown__list'>
                                {allMarketsData.map(m => (
                                    <div
                                        key={m.symbol}
                                        className={`ep-market-row ${m.symbol === selectedSymbol ? 'active' : ''}`}
                                        onClick={() => setSelectedSymbol(m.symbol)}
                                    >
                                        <span className='ep-market-row__name'>{m.label}</span>
                                        <span className={`ep-trend-badge ep-trend-badge--${m.bias}`}>
                                            {m.bias === 'under' ? 'Under' : m.bias === 'over' ? 'Over' : 'Neutral'}
                                        </span>
                                        <span className='ep-market-row__stat' style={{ color: '#10b981' }}>U: {m.pctUnder.toFixed(0)}%</span>
                                        <span className='ep-market-row__stat' style={{ color: '#ef4444' }}>O: {m.pctOver.toFixed(0)}%</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Autotrading Controls ── */}
                <div className='ep-glass ep-auto-section'>
                    <div className='ep-auto-section__title'>
                        🤖 Auto Trading Engine
                    </div>

                    {/* Signal Status */}
                    <div className='ep-auto-section__signal-status'>
                        <span className={`dot dot--${signal ? 'green' : autoState === 'SCANNING' ? 'yellow' : 'gray'}`} />
                        <span style={{ color: signal ? '#10b981' : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 600 }}>
                            {signal
                                ? `✅ Signal: ${signal.direction} ${signal.prediction} — Ready to trade`
                                : autoState === 'SCANNING'
                                ? '🔍 Scanning for entry signal...'
                                : autoState === 'TRADING'
                                ? '⚡ Trade in progress...'
                                : autoState === 'PAUSED'
                                ? '⏸️ Paused — waiting for resume'
                                : '⬜ Idle — Start to begin scanning'}
                        </span>
                    </div>

                    {/* Controls */}
                    <div className='ep-controls-grid'>
                        <div className='ep-input-group'>
                            <span className='ep-input-group__label'>Base Stake ({currency})</span>
                            <input className='ep-input-group__input' value={stake} onChange={e => setStake(cleanMoneyInput(e.target.value))} />
                        </div>
                        <div className='ep-input-group'>
                            <span className='ep-input-group__label'>Martingale (x)</span>
                            <input className='ep-input-group__input' value={martingale} onChange={e => setMartingale(cleanMoneyInput(e.target.value))} />
                        </div>
                        <div className='ep-input-group'>
                            <span className='ep-input-group__label'>Take Profit ({currency})</span>
                            <input className='ep-input-group__input' value={takeProfit} onChange={e => setTakeProfit(cleanMoneyInput(e.target.value))} />
                        </div>
                        <div className='ep-input-group'>
                            <span className='ep-input-group__label'>Stop Loss ({currency})</span>
                            <input className='ep-input-group__input' value={stopLoss} onChange={e => setStopLoss(cleanMoneyInput(e.target.value))} />
                        </div>
                        <div className='ep-input-group'>
                            <span className='ep-input-group__label'>Ticks (1 or 2)</span>
                            <select
                                className='ep-input-group__input'
                                value={tickDuration}
                                onChange={e => setTickDuration(e.target.value)}
                            >
                                <option value='1'>1 Tick</option>
                                <option value='2'>2 Ticks</option>
                            </select>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className='ep-btn-row'>
                        {autoState === 'IDLE' && (
                            <button className='ep-btn ep-btn--start' onClick={startAutoTrading} disabled={!logged_in}>
                                ▶ Start Auto Trading
                            </button>
                        )}
                        {(autoState === 'SCANNING' || autoState === 'TRADING') && (
                            <>
                                <button className='ep-btn ep-btn--pause' onClick={pauseAutoTrading}>⏸ Pause</button>
                                <button className='ep-btn ep-btn--stop' onClick={stopAutoTrading}>⏹ Stop</button>
                            </>
                        )}
                        {autoState === 'PAUSED' && (
                            <>
                                <button className='ep-btn ep-btn--start' onClick={resumeAutoTrading}>▶ Resume</button>
                                <button className='ep-btn ep-btn--stop' onClick={stopAutoTrading}>⏹ Stop</button>
                            </>
                        )}
                    </div>

                    {/* PnL Row */}
                    <div className='ep-pnl-row'>
                        <div className='ep-pnl-row__item'>
                            <span className='label'>Total P&L</span>
                            <span className={`value ${totalProfit >= 0 ? 'value--green' : 'value--red'}`}>
                                {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(2)} {currency}
                            </span>
                        </div>
                        <div className='ep-pnl-row__item'>
                            <span className='label'>Wins</span>
                            <span className='value value--green'>{wins}</span>
                        </div>
                        <div className='ep-pnl-row__item'>
                            <span className='label'>Losses</span>
                            <span className='value value--red'>{losses}</span>
                        </div>
                        <div className='ep-pnl-row__item'>
                            <span className='label'>Current Stake</span>
                            <span className='value value--white'>{currentStakeRef.current.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                {/* ── Trade Log ── */}
                <div className='ep-glass ep-trade-log'>
                    <div className='ep-trade-log__title'>📋 Trade History</div>
                    {tradeLog.length === 0 ? (
                        <div className='ep-trade-log__empty'>No trades yet. Start auto trading to begin.</div>
                    ) : (
                        <div className='ep-trade-log__list'>
                            {tradeLog.map(entry => (
                                <div key={entry.id} className='ep-log-item'>
                                    <span className='ep-log-item__time'>{entry.time}</span>
                                    <span className='ep-log-item__type'>{entry.type} • {entry.market}</span>
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
