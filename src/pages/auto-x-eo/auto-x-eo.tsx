import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { api_base } from '@/external/bot-skeleton';
import { safeSubscribe } from '@/utils/websocket-handler';
import { buyContractForUi, streamContractUntilSettled } from '@/utils/trade-purchase';
import {
    Activity,
    ArrowUpRight,
    CheckCircle2,
    Clock,
    Cpu,
    DollarSign,
    Grid,
    Layers,
    Minus,
    Pause,
    Percent,
    Play,
    Radio,
    RefreshCw,
    Shield,
    ShieldAlert,
    ShieldCheck,
    Sliders,
    Sparkles,
    Square,
    TrendingDown,
    TrendingUp,
    Zap,
} from 'lucide-react';
import './auto-x-eo.scss';

// ─── Types & Interfaces ────────────────────────────────────────────────────────

export interface MarketItem {
    symbol: string;
    label: string;
    pip: number;
}

export const MARKETS: MarketItem[] = [
    { symbol: '1HZ100V', label: 'Vol 100 (1s)', pip: 2 },
    { symbol: '1HZ75V', label: 'Vol 75 (1s)', pip: 2 },
    { symbol: '1HZ50V', label: 'Vol 50 (1s)', pip: 2 },
    { symbol: '1HZ25V', label: 'Vol 25 (1s)', pip: 2 },
    { symbol: '1HZ10V', label: 'Vol 10 (1s)', pip: 2 },
    { symbol: 'R_100', label: 'Vol 100', pip: 2 },
    { symbol: 'R_75', label: 'Vol 75', pip: 4 },
    { symbol: 'R_50', label: 'Vol 50', pip: 4 },
    { symbol: 'R_25', label: 'Vol 25', pip: 3 },
    { symbol: 'R_10', label: 'Vol 10', pip: 3 },
];

interface MarketDataState {
    digits: number[];
    currentPrice: string;
    lastDigit: number;
    lastTickTime: number;
}

interface TradeLogEntry {
    id: string;
    timestamp: string;
    market: string;
    strategy: 'EVEN_ODD' | 'RECOVERY_OVER' | 'RECOVERY_UNDER';
    contractType: string;
    prediction?: number;
    stake: number;
    result: 'WIN' | 'LOSS' | 'PENDING';
    profit: number;
}

type AutoRunState = 'IDLE' | 'SCANNING' | 'WAITING_SIGNAL' | 'WAITING_TRIGGER' | 'TRADING' | 'PAUSED';

const MAX_TICKS_STORED = 100;
const CHART_TICKS = 50;

// ─── Web Audio API Sound Effects ───────────────────────────────────────────────

const playSoundCue = (type: 'win' | 'loss' | 'signal') => {
    try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        if (type === 'win') {
            osc.frequency.setValueAtTime(587.33, now); // D5
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);
        } else if (type === 'loss') {
            osc.frequency.setValueAtTime(392.00, now); // G4
            osc.frequency.exponentialRampToValueAtTime(220, now + 0.2); // A3
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        } else {
            osc.frequency.setValueAtTime(659.25, now); // E5
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        }
    } catch {
        // Silently ignore audio context failures
    }
};

// ─── SVG Spline Line Chart Helper ──────────────────────────────────────────────

const getBezierSplinePath = (points: { x: number; y: number }[]) => {
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

// ─── Main Component ────────────────────────────────────────────────────────────

export const AutoXEo: React.FC = observer(() => {
    const { client, transactions, run_panel, summary_card } = useStore();
    const currency = client?.currency || 'USD';

    // ─── Settings & Trading State ───
    const [selectedSymbol, setSelectedSymbol] = useState<string>('1HZ100V');
    const [scanAllMarkets, setScanAllMarkets] = useState<boolean>(true);
    const [autoSwitchMarkets, setAutoSwitchMarkets] = useState<boolean>(true);
    const [switchRunThreshold, setSwitchRunThreshold] = useState<number>(5);
    const [targetProbabilityThreshold, setTargetProbabilityThreshold] = useState<number>(58);
    const [initialStake, setInitialStake] = useState<string>('0.50');
    const [takeProfit, setTakeProfit] = useState<string>('10.00');
    const [stopLoss, setStopLoss] = useState<string>('50.00');
    const [martingaleMultiplier, setMartingaleMultiplier] = useState<string>('2.6');
    const [tickDuration, setTickDuration] = useState<number>(1);
    const [autoRecoveryMode, setAutoRecoveryMode] = useState<boolean>(true);

    // ─── Live Bot Engine State ───
    const [botState, setBotState] = useState<AutoRunState>('IDLE');
    const [currentStake, setCurrentStake] = useState<number>(parseFloat(initialStake) || 0.50);
    const [sessionProfit, setSessionProfit] = useState<number>(0);
    const [winsCount, setWinsCount] = useState<number>(0);
    const [lossesCount, setLossesCount] = useState<number>(0);
    const [runsOnCurrentMarket, setRunsOnCurrentMarket] = useState<number>(0);
    const [isInRecovery, setIsInRecovery] = useState<boolean>(false);
    const [accumulatedLoss, setAccumulatedLoss] = useState<number>(0);
    const [tradeLogs, setTradeLogs] = useState<TradeLogEntry[]>([]);
    const [patternTriggerState, setPatternTriggerState] = useState<{
        targetParity: 'EVEN' | 'ODD';
        oppositeStreak: number;
        requiredOpposite: number;
        statusText: string;
    }>({
        targetParity: 'EVEN',
        oppositeStreak: 0,
        requiredOpposite: 2,
        statusText: 'Waiting for pattern setup',
    });

    // ─── Market & Tick Stream State ───
    const [activeTicks, setActiveTicks] = useState<{ [symbol: string]: MarketDataState }>({});
    const [showWideView, setShowWideView] = useState<boolean>(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
    const [bestMarketCandidate, setBestMarketCandidate] = useState<string>('1HZ100V');

    // ─── References for Persistent Streaming & Execution ───
    const subscriptionsRef = useRef<{ [symbol: string]: { unsubscribe?: () => void } }>({});
    const isBotRunningRef = useRef<boolean>(false);
    const botStateRef = useRef<AutoRunState>('IDLE');
    const marketsDataRef = useRef<Map<string, MarketDataState>>(new Map());
    const isProcessingTradeRef = useRef<boolean>(false);

    // Keep refs synchronized
    useEffect(() => {
        botStateRef.current = botState;
        isBotRunningRef.current = botState !== 'IDLE' && botState !== 'PAUSED';
    }, [botState]);

    // Update initial stake when input changes and not actively running
    useEffect(() => {
        if (botState === 'IDLE') {
            const parsed = parseFloat(initialStake);
            if (!isNaN(parsed) && parsed > 0) {
                setCurrentStake(parsed);
            }
        }
    }, [initialStake, botState]);

    // ─── Drawer Transaction Dispatcher ───
    const pushContractToDrawer = useCallback(
        (contract: any) => {
            try {
                if (contract) {
                    transactions?.pushTransaction?.(contract);
                    run_panel?.onBotContractEvent?.(contract);
                    summary_card?.onBotContractEvent?.(contract);
                }
            } catch (err) {
                console.error('[AUTO X E/O] Drawer dispatch error:', err);
            }
        },
        [transactions, run_panel, summary_card]
    );

    // ─── Log Appender & Updater ───
    const addTradeLog = useCallback((entry: Omit<TradeLogEntry, 'id' | 'timestamp'>): string => {
        const id = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const newEntry: TradeLogEntry = {
            ...entry,
            id,
            timestamp: new Date().toLocaleTimeString(),
        };
        setTradeLogs(prev => [newEntry, ...prev.slice(0, 49)]);
        return id;
    }, []);

    const updateLogResult = useCallback((id: string, result: 'WIN' | 'LOSS', profit: number) => {
        setTradeLogs(prev =>
            prev.map(item => (item.id === id ? { ...item, result, profit } : item))
        );
    }, []);

    // ─── Tick Stream Subscription Manager ───
    const handleTickUpdate = useCallback(
        (symbol: string, tick: any) => {
            if (!tick || tick.quote === undefined) return;
            const quoteNum = Number(tick.quote);
            if (isNaN(quoteNum)) return;

            const marketConf = MARKETS.find((m: MarketItem) => m.symbol === symbol);
            const pip = marketConf ? marketConf.pip : 2;
            const priceStr = quoteNum.toFixed(pip);
            const lastDigitChar = priceStr.slice(-1);
            const digit = parseInt(lastDigitChar, 10);
            if (isNaN(digit)) return;

            const existing = marketsDataRef.current.get(symbol) || {
                digits: [],
                currentPrice: priceStr,
                lastDigit: digit,
                lastTickTime: Date.now(),
            };

            const updatedDigits = [...existing.digits, digit].slice(-MAX_TICKS_STORED);
            const updatedState: MarketDataState = {
                digits: updatedDigits,
                currentPrice: priceStr,
                lastDigit: digit,
                lastTickTime: Date.now(),
            };

            marketsDataRef.current.set(symbol, updatedState);

            // Throttle state update for UI reactivity
            setActiveTicks(prev => ({
                ...prev,
                [symbol]: updatedState,
            }));
        },
        []
    );

    // Manage WebSocket subscriptions
    useEffect(() => {
        const symbolsToSubscribe: string[] = scanAllMarkets ? MARKETS.map((m: MarketItem) => m.symbol) : [selectedSymbol];

        // Clean up unneeded subscriptions
        Object.keys(subscriptionsRef.current).forEach((sym: string) => {
            if (!symbolsToSubscribe.includes(sym)) {
                try {
                    subscriptionsRef.current[sym]?.unsubscribe?.();
                } catch { /* ignore */ }
                delete subscriptionsRef.current[sym];
            }
        });

        // Add new subscriptions
        symbolsToSubscribe.forEach((sym: string) => {
            if (!subscriptionsRef.current[sym]) {
                try {
                    const sub = safeSubscribe(
                        (api_base.api as any)?.subscribe?.({ ticks: sym }),
                        (data: any) => {
                            if (data?.tick) {
                                handleTickUpdate(sym, data.tick);
                            }
                        },
                        (err: any) => {
                            console.warn(`[AUTO X E/O] Stream error on ${sym}:`, err);
                        }
                    );
                    subscriptionsRef.current[sym] = sub;
                } catch (err) {
                    console.error(`[AUTO X E/O] Failed to subscribe to ${sym}:`, err);
                }
            }
        });

        return () => {
            // Unsubscribe on unmount
            Object.values(subscriptionsRef.current).forEach(sub => {
                try {
                    sub?.unsubscribe?.();
                } catch { /* ignore */ }
            });
            subscriptionsRef.current = {};
        };
    }, [scanAllMarkets, selectedSymbol, handleTickUpdate]);

    // ─── Current Market State & Calculations ───
    const currentMarket = useMemo(() => {
        const state = activeTicks[selectedSymbol] || {
            digits: [],
            currentPrice: '0.00',
            lastDigit: 0,
            lastTickTime: 0,
        };
        return state;
    }, [activeTicks, selectedSymbol]);

    // Digit Distribution (0 to 9) in last 60 ticks
    const digitStats = useMemo(() => {
        const last60 = currentMarket.digits.slice(-60);
        const total = last60.length || 1;
        const counts = Array(10).fill(0);
        last60.forEach(d => {
            if (d >= 0 && d <= 9) counts[d]++;
        });

        // Trend calculation (last 20 vs previous 20)
        const last20 = currentMarket.digits.slice(-20);
        const prev20 = currentMarket.digits.slice(-40, -20);
        const countLast20 = Array(10).fill(0);
        const countPrev20 = Array(10).fill(0);
        last20.forEach(d => countLast20[d]++);
        prev20.forEach(d => countPrev20[d]++);

        const maxCount = Math.max(...counts, 1);

        return counts.map((count, digit) => {
            const percentage = parseFloat(((count / total) * 100).toFixed(1));
            const isEven = digit % 2 === 0;
            const power = Math.min(Math.round((count / maxCount) * 100), 100);
            const isIncreasing = countLast20[digit] > countPrev20[digit];

            return {
                digit,
                count,
                percentage,
                isEven,
                power,
                isIncreasing,
            };
        });
    }, [currentMarket.digits]);

    // Rankings: Most, 2nd Highest, Least
    const { mostAppearing, secondHighest, leastAppearing } = useMemo(() => {
        const sorted = [...digitStats].sort((a, b) => b.count - a.count);
        return {
            mostAppearing: sorted[0]?.digit ?? null,
            secondHighest: sorted[1]?.digit ?? null,
            leastAppearing: sorted[sorted.length - 1]?.digit ?? null,
        };
    }, [digitStats]);

    // Even vs Odd Analysis (Last 60 Ticks & Last 15 Ticks)
    const eoAnalysis = useMemo(() => {
        const last60 = currentMarket.digits.slice(-60);
        const total60 = last60.length || 1;
        const evens60 = last60.filter(d => d % 2 === 0).length;
        const odds60 = last60.filter(d => d % 2 !== 0).length;

        const evenPct = Math.round((evens60 / total60) * 100);
        const oddPct = Math.round((odds60 / total60) * 100);

        // Trend (Increasing power in last 20 ticks)
        const last20 = currentMarket.digits.slice(-20);
        const evens20 = last20.filter(d => d % 2 === 0).length;
        const odds20 = last20.filter(d => d % 2 !== 0).length;
        const isEvenIncreasing = evens20 / (last20.length || 1) >= evenPct / 100;
        const isOddIncreasing = odds20 / (last20.length || 1) >= oddPct / 100;

        // Last 15 ticks check (>= 10 matches)
        const last15 = currentMarket.digits.slice(-15);
        const evens15 = last15.filter(d => d % 2 === 0).length;
        const odds15 = last15.filter(d => d % 2 !== 0).length;
        const last15EvenPassed = evens15 >= 10;
        const last15OddPassed = odds15 >= 10;

        // Target digits >= 3 with > 10.5% in last 60 ticks
        const evenDigitsAboveThreshold = [0, 2, 4, 6, 8].filter(d => digitStats[d]?.percentage >= 10.5).length;
        const oddDigitsAboveThreshold = [1, 3, 5, 7, 9].filter(d => digitStats[d]?.percentage >= 10.5).length;

        // Pattern trigger readiness
        const evenSignalReady =
            evenPct >= targetProbabilityThreshold &&
            isEvenIncreasing &&
            last15EvenPassed &&
            evenDigitsAboveThreshold >= 3;

        const oddSignalReady =
            oddPct >= targetProbabilityThreshold &&
            isOddIncreasing &&
            last15OddPassed &&
            oddDigitsAboveThreshold >= 3;

        let activeSignal: 'EVEN' | 'ODD' | 'NONE' = 'NONE';
        if (evenSignalReady) activeSignal = 'EVEN';
        else if (oddSignalReady) activeSignal = 'ODD';

        return {
            evenPct,
            oddPct,
            evenCount: evens60,
            oddCount: odds60,
            isEvenIncreasing,
            isOddIncreasing,
            last15EvenPassed,
            last15OddPassed,
            evenDigitsAboveThreshold,
            oddDigitsAboveThreshold,
            activeSignal,
        };
    }, [currentMarket.digits, digitStats, targetProbabilityThreshold]);

    // Over vs Under Recovery Analysis
    const ouAnalysis = useMemo(() => {
        const last60 = currentMarket.digits.slice(-60);
        const total = last60.length || 1;

        // Under 0-4 vs Over 5-9
        const count0to4 = last60.filter(d => d <= 4).length;
        const count5to9 = last60.filter(d => d >= 5).length;
        const pct0to4 = Math.round((count0to4 / total) * 100);
        const pct5to9 = Math.round((count5to9 / total) * 100);

        // Under 0-5 vs Over 4-9
        const count0to5 = last60.filter(d => d <= 5).length;
        const count4to9 = last60.filter(d => d >= 4).length;
        const pct0to5 = Math.round((count0to5 / total) * 100);
        const pct4to9 = Math.round((count4to9 / total) * 100);

        // Last 10 ticks bias
        const last10 = currentMarket.digits.slice(-10);
        const under10Count = last10.filter(d => d <= 4).length;
        const over10Count = last10.filter(d => d >= 5).length;

        // Pick highest appearing in Under and Over
        const underDigits = [0, 1, 2, 3, 4].map(d => ({ digit: d, count: digitStats[d]?.count || 0 }));
        const overDigits = [5, 6, 7, 8, 9].map(d => ({ digit: d, count: digitStats[d]?.count || 0 }));
        const bestUnderDigit = underDigits.sort((a, b) => b.count - a.count)[0]?.digit ?? 2;
        const bestOverDigit = overDigits.sort((a, b) => b.count - a.count)[0]?.digit ?? 7;

        // Recommended Recovery Trade
        let recommendedStrategy: 'UNDER_8' | 'OVER_2' | 'UNDER_6' | 'OVER_3' | 'NEUTRAL' = 'NEUTRAL';
        let contractType: 'DIGITUNDER' | 'DIGITOVER' = 'DIGITUNDER';
        let barrier = 8;

        if (pct0to4 > 55 && under10Count >= 7) {
            recommendedStrategy = 'UNDER_8';
            contractType = 'DIGITUNDER';
            barrier = 8;
        } else if (pct5to9 > 55 && over10Count >= 7) {
            recommendedStrategy = 'OVER_2';
            contractType = 'DIGITOVER';
            barrier = 2;
        } else if (pct0to5 > 55 && under10Count >= 6) {
            recommendedStrategy = 'UNDER_6';
            contractType = 'DIGITUNDER';
            barrier = 6;
        } else if (pct4to9 > 55 && over10Count >= 6) {
            recommendedStrategy = 'OVER_3';
            contractType = 'DIGITOVER';
            barrier = 3;
        } else {
            // Default safe recovery: UNDER 8 or OVER 2 based on bias
            if (pct0to4 >= pct5to9) {
                recommendedStrategy = 'UNDER_8';
                contractType = 'DIGITUNDER';
                barrier = 8;
            } else {
                recommendedStrategy = 'OVER_2';
                contractType = 'DIGITOVER';
                barrier = 2;
            }
        }

        return {
            pct0to4,
            pct5to9,
            pct0to5,
            pct4to9,
            under10Count,
            over10Count,
            bestUnderDigit,
            bestOverDigit,
            recommendedStrategy,
            contractType,
            barrier,
        };
    }, [currentMarket.digits, digitStats]);

    // ─── Best Market Evaluation for Auto-Switching ───
    useEffect(() => {
        let bestSym = selectedSymbol;
        let highestScore = -1;

        MARKETS.forEach((m: MarketItem) => {
            const state = marketsDataRef.current.get(m.symbol);
            if (!state || state.digits.length < 30) return;

            const digits = state.digits.slice(-60);
            const total = digits.length || 1;
            const evens = digits.filter(d => d % 2 === 0).length;
            const odds = digits.filter(d => d % 2 !== 0).length;
            const maxParityPct = Math.max(evens / total, odds / total) * 100;

            if (maxParityPct > highestScore) {
                highestScore = maxParityPct;
                bestSym = m.symbol;
            }
        });

        setBestMarketCandidate(bestSym);
    }, [activeTicks, selectedSymbol]);

    // ─── 50-Digit Spline Chart Coordinates with In-Node Digits ───
    const { chartPoints, chartPath, chartAreaPath } = useMemo(() => {
        const last50 = currentMarket.digits.slice(-CHART_TICKS);
        if (last50.length < 2) {
            return { chartPoints: [], chartPath: '', chartAreaPath: '' };
        }

        const width = 1000;
        const height = 220;
        const padX = 35;
        const padY = 28;
        const usableWidth = width - padX * 2;
        const usableHeight = height - padY * 2;

        const points = last50.map((digit, index) => {
            const x = padX + (index / (last50.length - 1)) * usableWidth;
            // Digits 0-9 mapped to Y (0 at bottom, 9 at top)
            const y = padY + ((9 - digit) / 9) * usableHeight;
            const isEven = digit % 2 === 0;
            return { x, y, digit, isEven, index };
        });

        const path = getBezierSplinePath(points);
        const lastPt = points[points.length - 1];
        const firstPt = points[0];
        const areaPath = `${path} L ${lastPt.x.toFixed(1)},${(height - 10).toFixed(1)} L ${firstPt.x.toFixed(1)},${(height - 10).toFixed(1)} Z`;

        return { chartPoints: points, chartPath: path, chartAreaPath: areaPath };
    }, [currentMarket.digits]);

    // ─── Trade Execution Handler ───
    const executeTrade = useCallback(
        async (
            market: string,
            contractType: string,
            stake: number,
            strategy: 'EVEN_ODD' | 'RECOVERY_OVER' | 'RECOVERY_UNDER',
            barrier?: number
        ) => {
            if (isProcessingTradeRef.current) return;
            isProcessingTradeRef.current = true;
            setBotState('TRADING');

            const logId = addTradeLog({
                market,
                strategy,
                contractType,
                prediction: barrier,
                stake,
                result: 'PENDING',
                profit: 0,
            });

            playSoundCue('signal');

            try {
                const parameters: any = {
                    amount: stake,
                    basis: 'stake',
                    contract_type: contractType,
                    currency,
                    duration: tickDuration,
                    duration_unit: 't',
                    symbol: market,
                    ...(barrier !== undefined ? { barrier: String(barrier) } : {}),
                };

                const buyResult = await buyContractForUi({
                    parameters,
                    price: stake,
                    source: 'AUTO X E/O',
                });

                if (!buyResult || !buyResult.contract_id) {
                    console.error('[AUTO X E/O] Purchase failed or was rejected:', buyResult);
                    updateLogResult(logId, 'LOSS', -stake);
                    setLossesCount(l => l + 1);
                    setSessionProfit(p => p - stake);
                    isProcessingTradeRef.current = false;
                    setBotState(isBotRunningRef.current ? 'SCANNING' : 'IDLE');
                    return;
                }

                const contractId = buyResult.contract_id;
                const transactionId = buyResult.transaction_id || contractId;
                const startTime = Math.floor(Date.now() / 1000);
                const marketLabel = MARKETS.find((m: MarketItem) => m.symbol === market)?.label || market;

                const initSnapshot = {
                    contract_id: contractId,
                    transaction_ids: { buy: transactionId },
                    buy_price: stake,
                    underlying: market,
                    underlying_symbol: market,
                    display_name: marketLabel,
                    shortcode: `AUTO_X_${contractType}`,
                    contract_type: contractType,
                    currency: currency || 'USD',
                    date_start: startTime,
                    status: 'open',
                    ...(barrier !== undefined ? { barrier: String(barrier) } : {}),
                };
                pushContractToDrawer(initSnapshot);

                // Stream until settled
                const settledSnapshot = await streamContractUntilSettled({
                    contractId,
                    fallback: initSnapshot,
                    onUpdate: snapshot => {
                        pushContractToDrawer(snapshot);
                    },
                    source: 'AUTO X E/O',
                });

                pushContractToDrawer(settledSnapshot);
                const profitVal = Number(settledSnapshot?.profit || 0);
                const isWin = profitVal > 0;

                if (isWin) {
                    playSoundCue('win');
                    updateLogResult(logId, 'WIN', profitVal);
                    setWinsCount(w => w + 1);
                    setSessionProfit(p => p + profitVal);

                    if (isInRecovery) {
                        // Recovered! Reset back to initial stake and exit recovery
                        setIsInRecovery(false);
                        setAccumulatedLoss(0);
                        setCurrentStake(parseFloat(initialStake) || 0.50);
                    } else {
                        // Normal win -> reset stake
                        setCurrentStake(parseFloat(initialStake) || 0.50);
                    }
                } else {
                    playSoundCue('loss');
                    updateLogResult(logId, 'LOSS', profitVal);
                    setLossesCount(l => l + 1);
                    setSessionProfit(p => p + profitVal);

                    const mult = parseFloat(martingaleMultiplier) || 2.6;
                    const nextStake = parseFloat((stake * mult).toFixed(2));

                    if (autoRecoveryMode) {
                        setIsInRecovery(true);
                        setAccumulatedLoss(prev => prev + Math.abs(profitVal || stake));
                        setCurrentStake(nextStake);
                    } else {
                        setCurrentStake(nextStake);
                    }
                }

                // Manage Run count & Auto-Switching
                setRunsOnCurrentMarket(prev => {
                    const newRuns = prev + 1;
                    if (autoSwitchMarkets && newRuns >= switchRunThreshold && !isInRecovery) {
                        if (bestMarketCandidate && bestMarketCandidate !== selectedSymbol) {
                            setSelectedSymbol(bestMarketCandidate);
                            return 0;
                        }
                    }
                    return newRuns;
                });
            } catch (error) {
                console.error('[AUTO X E/O] Trade cycle error:', error);
                updateLogResult(logId, 'LOSS', -stake);
            } finally {
                isProcessingTradeRef.current = false;
                if (isBotRunningRef.current) {
                    setBotState('SCANNING');
                } else {
                    setBotState('IDLE');
                }
            }
        },
        [
            currency,
            tickDuration,
            addTradeLog,
            updateLogResult,
            pushContractToDrawer,
            isInRecovery,
            initialStake,
            martingaleMultiplier,
            autoRecoveryMode,
            autoSwitchMarkets,
            switchRunThreshold,
            bestMarketCandidate,
            selectedSymbol,
        ]
    );

    // ─── Automated AI Strategy & Trigger Scanner Loop ───
    useEffect(() => {
        if (!isBotRunningRef.current || isProcessingTradeRef.current) return;

        // Check TP / SL Limits
        const tpNum = parseFloat(takeProfit);
        const slNum = parseFloat(stopLoss);
        if (!isNaN(tpNum) && sessionProfit >= tpNum) {
            setBotState('IDLE');
            alert(`Take Profit reached! Profit: +${sessionProfit.toFixed(2)} ${currency}`);
            return;
        }
        if (!isNaN(slNum) && sessionProfit <= -slNum) {
            setBotState('IDLE');
            alert(`Stop Loss reached! Loss: ${sessionProfit.toFixed(2)} ${currency}`);
            return;
        }

        // ── 1. Recovery Mode Execution ──
        if (isInRecovery) {
            setBotState('WAITING_SIGNAL');
            const { contractType, barrier, recommendedStrategy } = ouAnalysis;
            const stratType =
                contractType === 'DIGITOVER' ? 'RECOVERY_OVER' : 'RECOVERY_UNDER';

            setPatternTriggerState({
                targetParity: 'EVEN',
                oppositeStreak: 0,
                requiredOpposite: 0,
                statusText: `Single Loss Recovery Active: ${recommendedStrategy} (Barrier: ${barrier})`,
            });

            // Execute recovery trade
            executeTrade(selectedSymbol, contractType, currentStake, stratType, barrier);
            return;
        }

        // ── 2. Standard Even / Odd AI Mode ──
        const targetSignal = eoAnalysis.activeSignal;
        if (targetSignal === 'NONE') {
            setBotState('SCANNING');
            setPatternTriggerState(prev => ({
                ...prev,
                statusText: `Scanning ${selectedSymbol}: Even ${eoAnalysis.evenPct}% / Odd ${eoAnalysis.oddPct}% (Requires &ge; ${targetProbabilityThreshold}%)`,
            }));
            return;
        }

        // Target signal is active (e.g. 'EVEN' or 'ODD')
        const targetParity = targetSignal;
        const oppositeParity = targetParity === 'EVEN' ? 'ODD' : 'EVEN';

        // Check last 3 ticks for pattern trigger: 2+ opposite ticks followed by 1 matching tick
        const digits = currentMarket.digits;
        if (digits.length < 3) return;

        const last1 = digits[digits.length - 1];
        const last2 = digits[digits.length - 2];
        const last3 = digits[digits.length - 3];

        const last1Parity = last1 % 2 === 0 ? 'EVEN' : 'ODD';
        const last2Parity = last2 % 2 === 0 ? 'EVEN' : 'ODD';
        const last3Parity = last3 % 2 === 0 ? 'EVEN' : 'ODD';

        const isTriggerHit =
            last3Parity === oppositeParity &&
            last2Parity === oppositeParity &&
            last1Parity === targetParity;

        if (isTriggerHit) {
            setBotState('WAITING_TRIGGER');
            setPatternTriggerState({
                targetParity,
                oppositeStreak: 2,
                requiredOpposite: 2,
                statusText: `Trigger Confirmed: [${oppositeParity}] -> [${oppositeParity}] -> [${targetParity}]. Executing Trade!`,
            });

            const contractType = targetParity === 'EVEN' ? 'DIGITEVEN' : 'DIGITODD';
            executeTrade(selectedSymbol, contractType, currentStake, 'EVEN_ODD');
        } else {
            setBotState('WAITING_TRIGGER');
            const oppCount =
                (last1Parity === oppositeParity ? 1 : 0) + (last2Parity === oppositeParity ? 1 : 0);
            setPatternTriggerState({
                targetParity,
                oppositeStreak: oppCount,
                requiredOpposite: 2,
                statusText: `Waiting for 2 consecutive [${oppositeParity}] ticks followed by 1 [${targetParity}] tick (Current: [${last2Parity}] -> [${last1Parity}])`,
            });
        }
    }, [
        currentMarket.digits,
        eoAnalysis,
        ouAnalysis,
        isInRecovery,
        selectedSymbol,
        currentStake,
        sessionProfit,
        takeProfit,
        stopLoss,
        currency,
        targetProbabilityThreshold,
        executeTrade,
    ]);

    // ─── Control Handlers ───
    const handleStartBot = () => {
        const parsedStake = parseFloat(initialStake);
        if (isNaN(parsedStake) || parsedStake <= 0) {
            alert('Please enter a valid initial stake');
            return;
        }
        setCurrentStake(parsedStake);
        setBotState('SCANNING');
        playSoundCue('signal');
    };

    const handlePauseBot = () => {
        setBotState(prev => (prev === 'PAUSED' ? 'SCANNING' : 'PAUSED'));
    };

    const handleStopBot = () => {
        setBotState('IDLE');
        setIsInRecovery(false);
        setAccumulatedLoss(0);
        setCurrentStake(parseFloat(initialStake) || 0.50);
    };

    const handleResetStats = () => {
        setSessionProfit(0);
        setWinsCount(0);
        setLossesCount(0);
        setRunsOnCurrentMarket(0);
        setTradeLogs([]);
    };

    // ─── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="auto-x-eo">
            {/* 1. Classical Luxury Glassmorphic Header */}
            <div className="auto-x-eo__header">
                <div className="auto-x-eo__header-brand">
                    <div className="brand-icon">
                        <Zap size={24} />
                    </div>
                    <div className="brand-text">
                        <div className="brand-title-wrap">
                            <h1>AUTO X E/O</h1>
                            <span className="badge-luxury">PRO SUITE</span>
                        </div>
                        <span>Continuous Synthetic Wave Scanner &amp; AI Parity Engine</span>
                    </div>
                </div>

                <div className="auto-x-eo__header-metrics">
                    <div className="metric-pill">
                        <span className="label">Session P/L</span>
                        <span className={`val ${sessionProfit >= 0 ? 'profit' : 'loss'}`}>
                            {sessionProfit >= 0 ? `+${sessionProfit.toFixed(2)}` : sessionProfit.toFixed(2)} {currency}
                        </span>
                    </div>
                    <div className="metric-pill">
                        <span className="label">Win / Loss</span>
                        <span className="val">
                            <span className="win-text">{winsCount}W</span>
                            <span className="divider">/</span>
                            <span className="loss-text">{lossesCount}L</span>
                        </span>
                    </div>
                    <div className="metric-pill">
                        <span className="label">Win Rate</span>
                        <span className="val gold">
                            {winsCount + lossesCount > 0
                                ? `${Math.round((winsCount / (winsCount + lossesCount)) * 100)}%`
                                : '0%'}
                        </span>
                    </div>
                    <div className="metric-pill">
                        <span className="label">Runs / Switch</span>
                        <span className="val cyan">
                            {runsOnCurrentMarket} / {switchRunThreshold}
                        </span>
                    </div>
                    <div className="metric-pill">
                        <span className="label">Current Stake</span>
                        <span className="val gold">{currentStake.toFixed(2)} {currency}</span>
                    </div>
                    <div className="metric-pill">
                        <span className="label">Engine State</span>
                        <span className={`val badge-state ${botState.toLowerCase()}`}>
                            {botState === 'IDLE' && '⏹ IDLE'}
                            {botState === 'SCANNING' && '🔍 SCANNING'}
                            {botState === 'WAITING_SIGNAL' && '⏳ SIGNAL DETECTED'}
                            {botState === 'WAITING_TRIGGER' && '⚡ TRIGGER SETUP'}
                            {botState === 'TRADING' && '🚀 TRADING'}
                            {botState === 'PAUSED' && '⏸ PAUSED'}
                        </span>
                    </div>
                </div>

                <div className="auto-x-eo__header-controls">
                    {botState === 'IDLE' ? (
                        <button className="btn-start" onClick={handleStartBot}>
                            <Play size={18} /> START AUTO TRADER
                        </button>
                    ) : (
                        <>
                            <button className="btn-pause" onClick={handlePauseBot}>
                                {botState === 'PAUSED' ? <Play size={16} /> : <Pause size={16} />}
                                {botState === 'PAUSED' ? 'RESUME' : 'PAUSE'}
                            </button>
                            <button className="btn-stop" onClick={handleStopBot}>
                                <Square size={16} /> STOP
                            </button>
                        </>
                    )}
                    <button className="btn-reset" onClick={handleResetStats} title="Reset Stats & Logs">
                        <RefreshCw size={15} />
                    </button>
                </div>
            </div>

            {/* 2. Market Control Toolbar */}
            <div className="auto-x-eo__market-toolbar">
                <div className="market-select-group">
                    <div className="select-wrapper">
                        <Activity size={16} className="select-icon" />
                        <select
                            className="custom-select"
                            value={selectedSymbol}
                            onChange={e => {
                                setSelectedSymbol(e.target.value);
                                setRunsOnCurrentMarket(0);
                            }}
                        >
                            {MARKETS.map((m: MarketItem) => (
                                <option key={m.symbol} value={m.symbol}>
                                    {m.label} ({m.symbol})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="badge-live-price">
                        <span className="dot-pulse" />
                        <span className="price-label">PRICE:</span>
                        <span className="price-value">{currentMarket.currentPrice}</span>
                    </div>

                    <div
                        className={`badge-digit-glow ${currentMarket.lastDigit % 2 === 0 ? 'even' : 'odd'}`}
                        title="Current Live Last Digit"
                    >
                        <span className="digit-glow-val">{currentMarket.lastDigit}</span>
                        <span className="digit-glow-tag">
                            {currentMarket.lastDigit % 2 === 0 ? 'EVEN' : 'ODD'}
                        </span>
                    </div>

                    {bestMarketCandidate && bestMarketCandidate !== selectedSymbol && (
                        <div
                            className="badge-best-candidate"
                            onClick={() => setSelectedSymbol(bestMarketCandidate)}
                            title="Click to switch to highest probability market"
                        >
                            <Sparkles size={14} /> Best: {MARKETS.find((m: MarketItem) => m.symbol === bestMarketCandidate)?.label}
                        </div>
                    )}
                </div>

                <div className="market-toggles">
                    <label className={`toggle-chip ${scanAllMarkets ? 'active' : ''}`}>
                        <input
                            type="checkbox"
                            checked={scanAllMarkets}
                            onChange={e => setScanAllMarkets(e.target.checked)}
                        />
                        <Radio size={14} />
                        <span>Continuous Market Scan</span>
                    </label>

                    <label className={`toggle-chip ${autoSwitchMarkets ? 'active' : ''}`}>
                        <input
                            type="checkbox"
                            checked={autoSwitchMarkets}
                            onChange={e => setAutoSwitchMarkets(e.target.checked)}
                        />
                        <Cpu size={14} />
                        <span>Auto-Switch Market ({switchRunThreshold} Runs)</span>
                    </label>

                    <button
                        className={`btn-view-toggle ${showWideView ? 'active' : ''}`}
                        onClick={() => setShowWideView(prev => !prev)}
                    >
                        <Grid size={15} />
                        {showWideView ? 'Collapse Matrix' : 'Wide Market Explorer'}
                    </button>
                </div>
            </div>

            {/* 3. Wide View Market Explorer Grid (Expandable) */}
            {showWideView && (
                <div className="auto-x-eo__wide-view">
                    <div className="wide-view-header">
                        <div className="wide-view-title">
                            <Layers size={18} />
                            <h3>Synthetic Indices Live Statistics Matrix</h3>
                        </div>
                        <button className="close-btn" onClick={() => setShowWideView(false)}>
                            ✕
                        </button>
                    </div>

                    <div className="wide-grid">
                        {MARKETS.map((m: MarketItem) => {
                            const state = marketsDataRef.current.get(m.symbol) || {
                                digits: [],
                                currentPrice: '0.00',
                                lastDigit: 0,
                            };
                            const last60 = state.digits.slice(-60);
                            const total = last60.length || 1;
                            const evens = last60.filter(d => d % 2 === 0).length;
                            const odds = last60.filter(d => d % 2 !== 0).length;
                            const evenPct = Math.round((evens / total) * 100);
                            const oddPct = Math.round((odds / total) * 100);
                            const isSelected = m.symbol === selectedSymbol;
                            const isBest = m.symbol === bestMarketCandidate;

                            return (
                                <div
                                    key={m.symbol}
                                    className={`wide-card ${isSelected ? 'selected' : ''} ${isBest ? 'recommended' : ''}`}
                                    onClick={() => {
                                        setSelectedSymbol(m.symbol);
                                        setRunsOnCurrentMarket(0);
                                        setShowWideView(false);
                                    }}
                                >
                                    <div className="card-top">
                                        <div className="card-market-info">
                                            <span className="market-name">{m.label}</span>
                                            {isBest && <span className="badge-best-tag">TOP SCAN</span>}
                                        </div>
                                        <div className={`last-digit-badge ${state.lastDigit % 2 === 0 ? 'even' : 'odd'}`}>
                                            {state.lastDigit}
                                        </div>
                                    </div>
                                    <div className="card-stats">
                                        <div className="stat-row">
                                            <span className="stat-lbl">Price</span>
                                            <span className="stat-val">{state.currentPrice}</span>
                                        </div>
                                        <div className="stat-row">
                                            <span className="stat-lbl">Even / Odd</span>
                                            <span className="stat-val">
                                                <span className="cyan">{evenPct}%</span> / <span className="purple">{oddPct}%</span>
                                            </span>
                                        </div>
                                        <div className="mini-bar">
                                            <div className="bar-even" style={{ width: `${evenPct}%` }} />
                                            <div className="bar-odd" style={{ width: `${oddPct}%` }} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 4. Main Trading Floor (Sidebar + Analytics Board) */}
            <div className={`auto-x-eo__body ${sidebarCollapsed ? 'auto-x-eo__body--collapsed' : ''}`}>
                {/* Left Derived Markets Sidebar */}
                <div className="auto-x-eo__sidebar">
                    <div className="auto-x-eo__sidebar-header">
                        <div className="sidebar-title">
                            <Activity size={16} />
                            <span>Live Synthetics</span>
                        </div>
                        <button
                            className="collapse-btn"
                            onClick={() => setSidebarCollapsed(prev => !prev)}
                            title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
                        >
                            {sidebarCollapsed ? '▶' : '◀'}
                        </button>
                    </div>

                    <div className="auto-x-eo__sidebar-list">
                        {MARKETS.map((m: MarketItem) => {
                            const state = marketsDataRef.current.get(m.symbol) || {
                                digits: [],
                                currentPrice: '0.00',
                                lastDigit: 0,
                            };
                            const last60 = state.digits.slice(-60);
                            const total = last60.length || 1;
                            const evens = last60.filter(d => d % 2 === 0).length;
                            const evenPct = Math.round((evens / total) * 100);
                            const oddPct = 100 - evenPct;
                            const isSelected = m.symbol === selectedSymbol;
                            const isBest = m.symbol === bestMarketCandidate;

                            return (
                                <div
                                    key={m.symbol}
                                    className={`market-item ${isSelected ? 'active' : ''} ${isBest ? 'best' : ''}`}
                                    onClick={() => {
                                        setSelectedSymbol(m.symbol);
                                        setRunsOnCurrentMarket(0);
                                    }}
                                >
                                    <div className="item-row-top">
                                        <span className="item-name">{m.label}</span>
                                        <span className={`item-digit ${state.lastDigit % 2 === 0 ? 'even' : 'odd'}`}>
                                            {state.lastDigit}
                                        </span>
                                    </div>
                                    <div className="item-row-bottom">
                                        <span className="item-price">{state.currentPrice}</span>
                                        <span className="item-eo-pill">
                                            E:{evenPct}% O:{oddPct}%
                                        </span>
                                    </div>
                                    <div className="item-bar">
                                        <div className="bar-even" style={{ width: `${evenPct}%` }} />
                                        <div className="bar-odd" style={{ width: `${oddPct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right Analytics & Trading Control Board */}
                <div className="auto-x-eo__workspace">
                    {/* Live Pattern Setup Alert Bar */}
                    <div className={`auto-x-eo__pattern-bar ${patternTriggerState.targetParity.toLowerCase()}`}>
                        <div className="pattern-icon">
                            <Zap size={18} />
                        </div>
                        <div className="pattern-info">
                            <span className="pattern-label">Smart AI Strategy State:</span>
                            <span className="pattern-desc">{patternTriggerState.statusText}</span>
                        </div>
                        {isInRecovery && (
                            <div className="badge-recovery-active">
                                <ShieldAlert size={14} /> RECOVERY 2.6x ACTIVE
                            </div>
                        )}
                    </div>

                    {/* ─── LIVE DIGIT WAVE STREAM WITH IN-NODE NUMBERS & CALLOUT ─── */}
                    <div className="auto-x-eo__chart-card">
                        <div className="chart-header">
                            <div className="chart-title-box">
                                <div className="title-row">
                                    <Activity size={18} className="icon-pulse" />
                                    <h2>Live Digit Wave Stream</h2>
                                </div>
                                <span className="pill-ticks">Real-Time Last 50 Ticks</span>
                            </div>

                            <div className="chart-legend">
                                <div className="legend-item">
                                    <span className="dot even" />
                                    <span>Even (0, 2, 4, 6, 8)</span>
                                </div>
                                <div className="legend-item">
                                    <span className="dot odd" />
                                    <span>Odd (1, 3, 5, 7, 9)</span>
                                </div>
                                <div className="legend-item">
                                    <span className="dot zone-under" />
                                    <span>Under Zone (0–4)</span>
                                </div>
                                <div className="legend-item">
                                    <span className="dot zone-over" />
                                    <span>Over Zone (5–9)</span>
                                </div>
                            </div>
                        </div>

                        <div className="chart-container">
                            {chartPoints.length > 1 ? (
                                <svg viewBox="0 0 1000 220" preserveAspectRatio="none" className="wave-svg">
                                    <defs>
                                        <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor="#00d2ff" />
                                            <stop offset="50%" stopColor="#f5c542" />
                                            <stop offset="100%" stopColor="#a855f7" />
                                        </linearGradient>

                                        <linearGradient id="waveAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                            <stop offset="0%" stopColor="rgba(0, 210, 255, 0.18)" />
                                            <stop offset="60%" stopColor="rgba(245, 197, 66, 0.06)" />
                                            <stop offset="100%" stopColor="rgba(168, 85, 247, 0.0)" />
                                        </linearGradient>

                                        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                            <feGaussianBlur stdDeviation="3" result="blur" />
                                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                        </filter>
                                    </defs>

                                    {/* Background Zone Indicators (Under 0-4 vs Over 5-9) */}
                                    <rect x="0" y="28" width="1000" height="85" fill="rgba(168, 85, 247, 0.035)" />
                                    <rect x="0" y="113" width="1000" height="85" fill="rgba(16, 185, 129, 0.035)" />

                                    {/* Horizontal Digit Gridlines 0 through 9 */}
                                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => {
                                        const yPos = 28 + ((9 - d) / 9) * 164;
                                        return (
                                            <g key={`grid_${d}`}>
                                                <line
                                                    x1="35"
                                                    y1={yPos}
                                                    x2="965"
                                                    y2={yPos}
                                                    stroke={d === 4.5 ? 'rgba(245, 197, 66, 0.3)' : 'rgba(255, 255, 255, 0.06)'}
                                                    strokeWidth={d === 4.5 ? 1.5 : 1}
                                                    strokeDasharray={d === 4.5 ? '4 4' : '2 4'}
                                                />
                                                <text
                                                    x="18"
                                                    y={yPos + 3.5}
                                                    fontSize="10"
                                                    fontWeight="600"
                                                    fill="rgba(255, 255, 255, 0.35)"
                                                    textAnchor="middle"
                                                >
                                                    {d}
                                                </text>
                                                <text
                                                    x="982"
                                                    y={yPos + 3.5}
                                                    fontSize="10"
                                                    fontWeight="600"
                                                    fill="rgba(255, 255, 255, 0.35)"
                                                    textAnchor="middle"
                                                >
                                                    {d}
                                                </text>
                                            </g>
                                        );
                                    })}

                                    {/* Wave Area Fill */}
                                    <path d={chartAreaPath} fill="url(#waveAreaGrad)" />

                                    {/* Smooth Spline Curve */}
                                    <path
                                        d={chartPath}
                                        fill="none"
                                        stroke="url(#lineGrad)"
                                        strokeWidth="3"
                                        strokeLinecap="round"
                                        filter="url(#glow)"
                                    />

                                    {/* Dynamic In-Node Digit Circles & Numbers */}
                                    {chartPoints.map((pt, idx: number) => {
                                        const isLatest = idx === chartPoints.length - 1;
                                        const nodeRadius = isLatest ? 12 : 8;

                                        return (
                                            <g key={idx} transform={`translate(${pt.x}, ${pt.y})`}>
                                                {/* Pulsing Radar Ring for Latest Digit */}
                                                {isLatest && (
                                                    <>
                                                        <circle
                                                            r={20}
                                                            fill="none"
                                                            stroke={pt.isEven ? '#00d2ff' : '#a855f7'}
                                                            strokeWidth="1.5"
                                                            opacity="0.6"
                                                            className="radar-pulse-fast"
                                                        />
                                                        <circle
                                                            r={28}
                                                            fill="none"
                                                            stroke="#f5c542"
                                                            strokeWidth="1"
                                                            opacity="0.35"
                                                            className="radar-pulse-slow"
                                                        />
                                                    </>
                                                )}

                                                {/* Node Background Circle */}
                                                <circle
                                                    r={nodeRadius}
                                                    fill={isLatest ? '#f5c542' : pt.isEven ? '#00d2ff' : '#a855f7'}
                                                    stroke="#080c14"
                                                    strokeWidth={isLatest ? 2.5 : 1.5}
                                                    filter={isLatest ? 'url(#glow)' : undefined}
                                                />

                                                {/* Digit Value inside the node */}
                                                <text
                                                    textAnchor="middle"
                                                    dy={isLatest ? 4 : 3}
                                                    fontSize={isLatest ? '11' : '8.5'}
                                                    fontWeight="800"
                                                    fill={isLatest ? '#080c14' : '#ffffff'}
                                                >
                                                    {pt.digit}
                                                </text>
                                            </g>
                                        );
                                    })}
                                </svg>
                            ) : (
                                <div className="chart-empty">
                                    <RefreshCw className="spin" size={24} />
                                    <span>Connecting to Synthetic Tick Stream...</span>
                                </div>
                            )}

                            {/* Floating Callout for Current Last Digit */}
                            {chartPoints.length > 0 && (
                                <div className="chart-live-callout">
                                    <div className="callout-header">
                                        <span className="callout-dot" />
                                        <span className="callout-title">LATEST TICK</span>
                                    </div>
                                    <div className="callout-body">
                                        <span className="callout-digit">{currentMarket.lastDigit}</span>
                                        <div className="callout-meta">
                                            <span className={`callout-parity ${currentMarket.lastDigit % 2 === 0 ? 'even' : 'odd'}`}>
                                                {currentMarket.lastDigit % 2 === 0 ? 'EVEN' : 'ODD'}
                                            </span>
                                            <span className="callout-price">{currentMarket.currentPrice}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ─── DIGITS 0–9 STATISTICAL GRID ─── */}
                    <div className="auto-x-eo__digits-grid">
                        {digitStats.map(stat => {
                            const isTarget =
                                (eoAnalysis.activeSignal === 'EVEN' && stat.isEven) ||
                                (eoAnalysis.activeSignal === 'ODD' && !stat.isEven);
                            const isCurrent = currentMarket.lastDigit === stat.digit;

                            return (
                                <div
                                    key={stat.digit}
                                    className={`digit-stat-card ${stat.isEven ? 'is-even' : 'is-odd'} ${isTarget ? 'is-target' : ''} ${isCurrent ? 'is-current' : ''}`}
                                >
                                    <div className="card-digit-header">
                                        <span className="digit-num">{stat.digit}</span>
                                        <span className="digit-tag">{stat.isEven ? 'EVEN' : 'ODD'}</span>
                                    </div>

                                    <div className="digit-pct-box">
                                        <span className={`digit-pct ${stat.percentage >= 10.5 ? 'highlight' : ''}`}>
                                            {stat.percentage}%
                                        </span>
                                        <span className="digit-count">{stat.count} hits</span>
                                    </div>

                                    <div className="power-bar-wrap">
                                        <div
                                            className={`power-bar-fill ${stat.isEven ? 'even-fill' : 'odd-fill'}`}
                                            style={{ width: `${stat.power}%` }}
                                        />
                                    </div>

                                    <div className={`trend-indicator ${stat.isIncreasing ? 'up' : 'steady'}`}>
                                        {stat.isIncreasing ? (
                                            <>
                                                <ArrowUpRight size={12} /> Rising
                                            </>
                                        ) : (
                                            <>
                                                <Minus size={12} /> Neutral
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ─── KEY RANKINGS STRIP (PODIUM) ─── */}
                    <div className="auto-x-eo__ranks-strip">
                        <div className="rank-card rank-gold">
                            <div className="rank-badge">🥇 #1 MOST FREQUENT</div>
                            <div className="rank-content">
                                <div className="rank-digit">{mostAppearing ?? '-'}</div>
                                <div className="rank-details">
                                    <span className="rank-title">Leader Digit</span>
                                    <span className="rank-stat">
                                        {mostAppearing !== null ? `${digitStats[mostAppearing]?.percentage}% (${digitStats[mostAppearing]?.count} hits)` : '--'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="rank-card rank-silver">
                            <div className="rank-badge">🥈 #2 RUNNER UP</div>
                            <div className="rank-content">
                                <div className="rank-digit">{secondHighest ?? '-'}</div>
                                <div className="rank-details">
                                    <span className="rank-title">2nd Highest Digit</span>
                                    <span className="rank-stat">
                                        {secondHighest !== null ? `${digitStats[secondHighest]?.percentage}% (${digitStats[secondHighest]?.count} hits)` : '--'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="rank-card rank-cold">
                            <div className="rank-badge">❄️ LEAST APPEARING</div>
                            <div className="rank-content">
                                <div className="rank-digit">{leastAppearing ?? '-'}</div>
                                <div className="rank-details">
                                    <span className="rank-title">Coldest Digit</span>
                                    <span className="rank-stat">
                                        {leastAppearing !== null ? `${digitStats[leastAppearing]?.percentage}% (${digitStats[leastAppearing]?.count} hits)` : '--'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── DUAL STRATEGY SUITE: EVEN/ODD + OVER/UNDER RECOVERY ─── */}
                    <div className="auto-x-eo__strategy-grid">
                        {/* Even / Odd AI Engine Card */}
                        <div className="strategy-card eo-card">
                            <div className="card-head">
                                <div className="head-title">
                                    <Zap size={18} />
                                    <h3>Even / Odd Smart AI Engine</h3>
                                </div>
                                <span className={`badge-indicator ${eoAnalysis.activeSignal !== 'NONE' ? 'ready' : 'waiting'}`}>
                                    {eoAnalysis.activeSignal !== 'NONE' ? `SIGNAL: ${eoAnalysis.activeSignal}` : 'SCANNING'}
                                </span>
                            </div>

                            <div className="eo-progress-section">
                                <div className="eo-stats-row">
                                    <span className="even-text">
                                        Even: <strong>{eoAnalysis.evenPct}%</strong> ({eoAnalysis.evenCount} hits)
                                    </span>
                                    <span className="odd-text">
                                        Odd: <strong>{eoAnalysis.oddPct}%</strong> ({eoAnalysis.oddCount} hits)
                                    </span>
                                </div>
                                <div className="eo-progress-bar">
                                    <div className="fill-even" style={{ width: `${eoAnalysis.evenPct}%` }} />
                                    <div className="fill-odd" style={{ width: `${eoAnalysis.oddPct}%` }} />
                                </div>
                            </div>

                            <div className="conditions-list">
                                <div
                                    className={`condition-item ${
                                        eoAnalysis.evenPct >= targetProbabilityThreshold || eoAnalysis.oddPct >= targetProbabilityThreshold
                                            ? 'passed'
                                            : 'pending'
                                    }`}
                                >
                                    <CheckCircle2 size={14} />
                                    <span>Target Probability &ge; {targetProbabilityThreshold}% &amp; Power Trending Up</span>
                                </div>
                                <div
                                    className={`condition-item ${
                                        eoAnalysis.last15EvenPassed || eoAnalysis.last15OddPassed ? 'passed' : 'pending'
                                    }`}
                                >
                                    <CheckCircle2 size={14} />
                                    <span>Last 15 Ticks Filter (&ge; 10 matches on signal side)</span>
                                </div>
                                <div
                                    className={`condition-item ${
                                        eoAnalysis.evenDigitsAboveThreshold >= 3 || eoAnalysis.oddDigitsAboveThreshold >= 3
                                            ? 'passed'
                                            : 'pending'
                                    }`}
                                >
                                    <CheckCircle2 size={14} />
                                    <span>Multi-Digit Strength (&ge; 3 digits &gt; 10.5% in last 60 ticks)</span>
                                </div>
                                <div
                                    className={`condition-item ${
                                        botState === 'WAITING_TRIGGER' || botState === 'TRADING' ? 'passed' : 'pending'
                                    }`}
                                >
                                    <CheckCircle2 size={14} />
                                    <span>Consecutive Reversal Pattern (2+ Opposite Ticks &rarr; 1 Matching Tick)</span>
                                </div>
                            </div>
                        </div>

                        {/* Over / Under Recovery Suite Card */}
                        <div className="strategy-card ou-card">
                            <div className="card-head">
                                <div className="head-title">
                                    <ShieldCheck size={18} />
                                    <h3>Single-Loss Over/Under Recovery Suite</h3>
                                </div>
                                <span className="badge-recovery-label">
                                    {autoRecoveryMode ? '2.6x MARTINGALE ON' : 'MANUAL'}
                                </span>
                            </div>

                            <div className="recovery-metrics">
                                <div className="ou-row">
                                    <div className="ou-label">
                                        <span>Under (0–4): <strong>{ouAnalysis.pct0to4}%</strong></span>
                                        <span>Over (5–9): <strong>{ouAnalysis.pct5to9}%</strong></span>
                                    </div>
                                    <div className="ou-bar">
                                        <div className="bar-under" style={{ width: `${ouAnalysis.pct0to4}%` }} />
                                        <div className="bar-over" style={{ width: `${ouAnalysis.pct5to9}%` }} />
                                    </div>
                                </div>

                                <div className="ou-row">
                                    <div className="ou-label">
                                        <span>Under (0–5): <strong>{ouAnalysis.pct0to5}%</strong></span>
                                        <span>Over (4–9): <strong>{ouAnalysis.pct4to9}%</strong></span>
                                    </div>
                                    <div className="ou-bar">
                                        <div className="bar-under" style={{ width: `${ouAnalysis.pct0to5}%` }} />
                                        <div className="bar-over" style={{ width: `${ouAnalysis.pct4to9}%` }} />
                                    </div>
                                </div>

                                <div className="recovery-recommendation">
                                    <div className="rec-box">
                                        <span className="rec-label">Recommended Recovery:</span>
                                        <span className="rec-val gold">{ouAnalysis.recommendedStrategy}</span>
                                    </div>
                                    <div className="rec-box">
                                        <span className="rec-label">Accumulated Loss:</span>
                                        <span className="rec-val loss">
                                            {accumulatedLoss > 0 ? `-${accumulatedLoss.toFixed(2)} ${currency}` : `0.00 ${currency}`}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── TRADING PARAMETERS & RISK CONTROLS ─── */}
                    <div className="auto-x-eo__controls-card">
                        <div className="controls-header">
                            <Sliders size={18} />
                            <h3>Trading Parameters &amp; Risk Management</h3>
                        </div>

                        <div className="controls-grid">
                            <div className="input-group">
                                <label>
                                    <DollarSign size={14} /> Initial Stake ({currency})
                                </label>
                                <input
                                    type="number"
                                    step="0.10"
                                    min="0.35"
                                    value={initialStake}
                                    disabled={botState !== 'IDLE'}
                                    onChange={e => setInitialStake(e.target.value)}
                                />
                            </div>

                            <div className="input-group">
                                <label>
                                    <Percent size={14} /> Min Probability Threshold (%)
                                </label>
                                <input
                                    type="number"
                                    min="50"
                                    max="80"
                                    value={targetProbabilityThreshold}
                                    disabled={botState !== 'IDLE'}
                                    onChange={e => setTargetProbabilityThreshold(parseInt(e.target.value, 10) || 58)}
                                />
                            </div>

                            <div className="input-group">
                                <label>
                                    <TrendingUp size={14} /> Take Profit ({currency})
                                </label>
                                <input
                                    type="number"
                                    step="1.00"
                                    min="1.00"
                                    value={takeProfit}
                                    disabled={botState !== 'IDLE'}
                                    onChange={e => setTakeProfit(e.target.value)}
                                />
                            </div>

                            <div className="input-group">
                                <label>
                                    <TrendingDown size={14} /> Stop Loss ({currency})
                                </label>
                                <input
                                    type="number"
                                    step="5.00"
                                    min="1.00"
                                    value={stopLoss}
                                    disabled={botState !== 'IDLE'}
                                    onChange={e => setStopLoss(e.target.value)}
                                />
                            </div>

                            <div className="input-group">
                                <label>
                                    <Shield size={14} /> Martingale Multiplier
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="1.0"
                                    value={martingaleMultiplier}
                                    disabled={botState !== 'IDLE'}
                                    onChange={e => setMartingaleMultiplier(e.target.value)}
                                />
                            </div>

                            <div className="input-group">
                                <label>
                                    <Clock size={14} /> Tick Duration
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="10"
                                    value={tickDuration}
                                    disabled={botState !== 'IDLE'}
                                    onChange={e => setTickDuration(parseInt(e.target.value, 10) || 1)}
                                />
                            </div>

                            <div className="input-group">
                                <label>
                                    <Cpu size={14} /> Auto-Switch Threshold (Runs)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="20"
                                    value={switchRunThreshold}
                                    disabled={botState !== 'IDLE'}
                                    onChange={e => setSwitchRunThreshold(parseInt(e.target.value, 10) || 5)}
                                />
                            </div>

                            <div className="input-group checkbox-group">
                                <label className="chk-label">
                                    <input
                                        type="checkbox"
                                        checked={autoRecoveryMode}
                                        onChange={e => setAutoRecoveryMode(e.target.checked)}
                                    />
                                    <span>Enable Single-Loss Over/Under Recovery</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* ─── LIVE TRADE LOGS TABLE ─── */}
                    <div className="auto-x-eo__logs-card">
                        <div className="logs-header">
                            <Activity size={18} />
                            <h3>Session Trade Activity &amp; Settlement Log</h3>
                            <span className="logs-count">{tradeLogs.length} Records</span>
                        </div>

                        <div className="logs-table-wrapper">
                            {tradeLogs.length > 0 ? (
                                <table className="logs-table">
                                    <thead>
                                        <tr>
                                            <th>TIME</th>
                                            <th>MARKET</th>
                                            <th>STRATEGY</th>
                                            <th>CONTRACT</th>
                                            <th>BARRIER</th>
                                            <th>STAKE</th>
                                            <th>STATUS</th>
                                            <th>PROFIT</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tradeLogs.map(log => (
                                            <tr key={log.id}>
                                                <td>{log.timestamp}</td>
                                                <td>
                                                    <strong>{log.market}</strong>
                                                </td>
                                                <td>
                                                    <span className="pill-strategy">{log.strategy}</span>
                                                </td>
                                                <td>
                                                    <span className={`pill-type ${log.contractType.toLowerCase()}`}>
                                                        {log.contractType}
                                                    </span>
                                                </td>
                                                <td>{log.prediction !== undefined ? log.prediction : '-'}</td>
                                                <td>
                                                    {log.stake.toFixed(2)} {currency}
                                                </td>
                                                <td>
                                                    <span className={`pill-result ${log.result.toLowerCase()}`}>
                                                        {log.result}
                                                    </span>
                                                </td>
                                                <td className={log.profit >= 0 ? 'profit' : 'loss'}>
                                                    {log.result === 'PENDING'
                                                        ? 'Pending...'
                                                        : log.profit >= 0
                                                        ? `+${log.profit.toFixed(2)} ${currency}`
                                                        : `${log.profit.toFixed(2)} ${currency}`}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="logs-empty">
                                    <Clock size={20} />
                                    <span>No trades executed in this session yet. Click START to begin.</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default AutoXEo;
