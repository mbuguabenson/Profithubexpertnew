import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { api_base } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { buyContractForUi, streamContractUntilSettled } from '@/utils/trade-purchase';
import { safeSubscribe } from '@/utils/websocket-handler';
import {
    Activity,
    ChevronDown,
    ChevronUp,
    Download,
    Flame,
    Grid,
    Layers,
    LineChart,
    Pause,
    Play,
    RefreshCw,
    RotateCcw,
    Sparkles,
    Square,
    Target,
    TrendingUp,
    Volume2,
    VolumeX,
    Zap,
} from 'lucide-react';
import './overlord-ai.scss';

// ─── Interfaces & Types ───────────────────────────────────────────────────────

export interface MarketDigitState {
    symbol: string;
    label: string;
    digits: number[];
    currentPrice: string;
    lastDigit: number;
    pip: number;
}

export interface DigitStat {
    digit: number;
    count: number;
    percentage: number;
    rank: number;
    isIncreasing: boolean;
}

export interface CompoundingStep {
    step: number;
    label: string;
    startingBalance: number;
    targetProfit: number;
    endingBalance: number;
    completed: boolean;
}

export interface TradeLogItem {
    id: string;
    time: string;
    market: string;
    contractType: 'DIGITUNDER' | 'DIGITOVER';
    prediction: number;
    stake: number;
    result: 'WIN' | 'LOSS' | 'PENDING';
    profit: number;
}

type AutoRunState = 'IDLE' | 'SCANNING' | 'WAITING_SIGNAL' | 'WAITING_TRIGGER' | 'TRADING' | 'PAUSED';

// Derived Synthetic Volatility Markets (150 1s and 250 1s removed)
const DERIVED_SYNTHETIC_MARKETS = [
    { symbol: '1HZ10V', label: 'Vol 10 (1s)', pip: 2 },
    { symbol: '1HZ15V', label: 'Vol 15 (1s)', pip: 3 },
    { symbol: '1HZ25V', label: 'Vol 25 (1s)', pip: 2 },
    { symbol: '1HZ30V', label: 'Vol 30 (1s)', pip: 3 },
    { symbol: '1HZ50V', label: 'Vol 50 (1s)', pip: 2 },
    { symbol: '1HZ75V', label: 'Vol 75 (1s)', pip: 2 },
    { symbol: '1HZ90V', label: 'Vol 90 (1s)', pip: 3 },
    { symbol: '1HZ100V', label: 'Vol 100 (1s)', pip: 2 },
    { symbol: 'R_10', label: 'Vol 10', pip: 3 },
    { symbol: 'R_25', label: 'Vol 25', pip: 3 },
    { symbol: 'R_50', label: 'Vol 50', pip: 3 },
    { symbol: 'R_75', label: 'Vol 75', pip: 3 },
    { symbol: 'R_100', label: 'Vol 100', pip: 2 },
];

const MAX_TICKS_STORED = 100;
const CHART_TICKS = 50;
const STORAGE_PLAN_KEY = 'overlord_compounding_plan_v2';
const STORAGE_CONFIG_KEY = 'overlord_bot_config_v2';

// ─── Web Audio Sound Effects ──────────────────────────────────────────────────

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
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.18); // A5
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);
        } else if (type === 'loss') {
            osc.frequency.setValueAtTime(369.99, now); // F#4
            osc.frequency.exponentialRampToValueAtTime(220, now + 0.22); // A3
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);
        } else {
            osc.frequency.setValueAtTime(659.25, now); // E5
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        }
    } catch {
        // Silently ignore audio context restrictions
    }
};

// ─── SVG Bezier Spline Line Chart Path Generator ──────────────────────────────

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

// ─── Digit Extraction Helper ──────────────────────────────────────────────────

const extractLastDigit = (quote: number | string, pip = 2): number => {
    const p = Number(quote);
    if (isNaN(p)) return 0;
    const fixed = p.toFixed(pip);
    const lastChar = fixed[fixed.length - 1];
    const digit = parseInt(lastChar, 10);
    return isNaN(digit) ? 0 : digit;
};

// ─── Main OVERLORD AI Component ───────────────────────────────────────────────

const OverlordAi: React.FC = observer(() => {
    const store = useStore();
    const { client, transactions, run_panel, summary_card } = store || {};
    const currency = client?.currency || 'USD';
    const rawBalance = Number(client?.balance || 0);

    // ── Market States ──
    const [selectedSymbol, setSelectedSymbol] = useState<string>('1HZ100V');
    const [scanAllMarkets, setScanAllMarkets] = useState<boolean>(true);
    const [isWideViewOpen, setIsWideViewOpen] = useState<boolean>(false);
    const [marketSearchTerm, setMarketSearchTerm] = useState<string>('');
    const [autoPickBestMarket, setAutoPickBestMarket] = useState<boolean>(true);
    const [activeRightTab, setActiveRightTab] = useState<'AUTOTRADER' | 'COMPOUNDING'>('AUTOTRADER');

    // ── Markets Tick Storage ──
    const marketsDataRef = useRef<Map<string, MarketDigitState>>(
        new Map(
            DERIVED_SYNTHETIC_MARKETS.map(m => [
                m.symbol,
                {
                    symbol: m.symbol,
                    label: m.label,
                    digits: [],
                    currentPrice: '0.00',
                    lastDigit: 0,
                    pip: m.pip,
                },
            ])
        )
    );

    const subscriptionsRef = useRef<Map<string, { unsubscribe?: () => void }>>(new Map());
    const [renderTrigger, setRenderTrigger] = useState<number>(0);
    const isMountedRef = useRef<boolean>(true);
    const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Autotrading & Strategy Parameters ──
    const [botState, setBotState] = useState<AutoRunState>('IDLE');
    const [isAutoStake, setIsAutoStake] = useState<boolean>(true);
    const [autoStakePercent, setAutoStakePercent] = useState<string>('7'); // Default 7% of account balance
    const [manualStake, setManualStake] = useState<string>('1.00');
    const [currentStake, setCurrentStake] = useState<number>(1.0);
    const [martingale, setMartingale] = useState<string>('2.6'); // Default 2.6x
    const [tickDuration, setTickDuration] = useState<string>('1'); // Default 1 tick
    const [predictionMode, setPredictionMode] = useState<'AUTO' | 'CUSTOM'>('AUTO');
    const [customUnderPrediction, setCustomUnderPrediction] = useState<number>(6); // 6, 7, or 8
    const [customOverPrediction, setCustomOverPrediction] = useState<number>(3); // 1, 2, or 3
    const [takeProfitTarget, setTakeProfitTarget] = useState<string>('50.00');

    // ── Session Trading Statistics ──
    const [winsCount, setWinsCount] = useState<number>(0);
    const [lossesCount, setLossesCount] = useState<number>(0);
    const [sessionProfit, setSessionProfit] = useState<number>(0);
    const [isInRecovery, setIsInRecovery] = useState<boolean>(false);
    const [tradeLog, setTradeLog] = useState<TradeLogItem[]>([]);
    const executionLockRef = useRef<boolean>(false);

    // ── Compounding Generator State ──
    const [compoundingMode, setCompoundingMode] = useState<'HOURS' | 'DAYS'>('HOURS');
    const [startingCapital, setStartingCapital] = useState<string>('100.00');
    const [targetGoal, setTargetGoal] = useState<string>('1000.00');
    const [planPeriods, setPlanPeriods] = useState<string>('24');
    const [periodProfitPct, setPeriodProfitPct] = useState<string>('7'); // Default 7%
    const [compoundingPlan, setCompoundingPlan] = useState<CompoundingStep[]>([]);
    const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

    // Throttle UI rerenders to keep high performance
    const throttleRender = useCallback(() => {
        if (!throttleTimerRef.current) {
            throttleTimerRef.current = setTimeout(() => {
                throttleTimerRef.current = null;
                if (isMountedRef.current) {
                    setRenderTrigger(Date.now());
                }
            }, 120);
        }
    }, []);

    // ── Load & Restore Compounding Plan from localStorage ──
    useEffect(() => {
        try {
            const savedPlan = localStorage.getItem(STORAGE_PLAN_KEY);
            if (savedPlan) {
                const parsed = JSON.parse(savedPlan);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setCompoundingPlan(parsed);
                }
            }
            const savedConfig = localStorage.getItem(STORAGE_CONFIG_KEY);
            if (savedConfig) {
                const cfg = JSON.parse(savedConfig);
                if (cfg.startingCapital) setStartingCapital(cfg.startingCapital);
                if (cfg.targetGoal) setTargetGoal(cfg.targetGoal);
                if (cfg.periodProfitPct) setPeriodProfitPct(cfg.periodProfitPct);
                if (cfg.planPeriods) setPlanPeriods(cfg.planPeriods);
                if (cfg.compoundingMode) setCompoundingMode(cfg.compoundingMode);
            }
        } catch {
            /* ignore */
        }
    }, []);

    // Save compounding plan on changes
    const savePlanToStorage = useCallback((plan: CompoundingStep[]) => {
        try {
            localStorage.setItem(STORAGE_PLAN_KEY, JSON.stringify(plan));
        } catch {
            /* ignore */
        }
    }, []);

    // ── Fetch Live Balance ──
    const handleFetchBalance = useCallback(() => {
        if (rawBalance > 0) {
            setStartingCapital(rawBalance.toFixed(2));
        }
    }, [rawBalance]);

    // ── Generate Compounding Plan Formula ──
    const handleGenerateCompoundingPlan = useCallback(() => {
        const start = parseFloat(startingCapital) || 100;
        const pct = parseFloat(periodProfitPct) || 7;
        const periods = parseInt(planPeriods, 10) || 24;

        let currentBal = start;
        const steps: CompoundingStep[] = [];

        for (let i = 1; i <= periods; i++) {
            const startBal = Math.round(currentBal * 100) / 100;
            const profit = Math.round(startBal * (pct / 100) * 100) / 100;
            const endBal = Math.round((startBal + profit) * 100) / 100;
            currentBal = endBal;

            steps.push({
                step: i,
                label: compoundingMode === 'HOURS' ? `Hour ${i}` : `Day ${i}`,
                startingBalance: startBal,
                targetProfit: profit,
                endingBalance: endBal,
                completed: false,
            });
        }

        setCompoundingPlan(steps);
        savePlanToStorage(steps);

        try {
            localStorage.setItem(
                STORAGE_CONFIG_KEY,
                JSON.stringify({
                    startingCapital,
                    targetGoal,
                    periodProfitPct,
                    planPeriods,
                    compoundingMode,
                })
            );
        } catch {
            /* ignore */
        }
    }, [startingCapital, periodProfitPct, planPeriods, compoundingMode, targetGoal, savePlanToStorage]);

    // Auto-generate initial compounding plan if empty
    useEffect(() => {
        if (compoundingPlan.length === 0) {
            handleGenerateCompoundingPlan();
        }
    }, [compoundingPlan.length, handleGenerateCompoundingPlan]);

    // Toggle completion of a step
    const handleToggleStep = useCallback(
        (stepIndex: number) => {
            setCompoundingPlan(prev => {
                const updated = prev.map((s, idx) => (idx === stepIndex ? { ...s, completed: !s.completed } : s));
                savePlanToStorage(updated);
                return updated;
            });
        },
        [savePlanToStorage]
    );

    // Target a specific step's profit
    const handleTargetStep = useCallback((step: CompoundingStep) => {
        setTakeProfitTarget(step.targetProfit.toFixed(2));
    }, []);

    // Export compounding plan to CSV (Excel compatible)
    const handleExportToExcel = useCallback(() => {
        if (compoundingPlan.length === 0) return;

        let csvContent = 'data:text/csv;charset=utf-8,\uFEFF';
        csvContent += 'Step,Period,Starting Balance,Target Profit,Ending Balance,Status\n';

        compoundingPlan.forEach(s => {
            csvContent += `${s.step},"${s.label}",${s.startingBalance.toFixed(2)},${s.targetProfit.toFixed(2)},${s.endingBalance.toFixed(2)},"${s.completed ? 'Completed' : 'Pending'}"\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `OVERLORD_AI_Compounding_Plan_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [compoundingPlan]);

    // ── Calculate Dynamic Auto Stake ──
    const effectiveStake = useMemo(() => {
        if (isAutoStake) {
            const pct = parseFloat(autoStakePercent) || 7;
            const bal = rawBalance > 0 ? rawBalance : parseFloat(startingCapital) || 100;
            const calculated = Math.max(0.35, Math.round(bal * (pct / 100) * 100) / 100);
            return calculated;
        }
        return Math.max(0.35, parseFloat(manualStake) || 1.0);
    }, [isAutoStake, autoStakePercent, rawBalance, startingCapital, manualStake]);

    // ── Real-Time Multi-Market WebSocket Streams ──
    useEffect(() => {
        isMountedRef.current = true;
        const activeSubs = subscriptionsRef.current;
        const symbolsToStream = scanAllMarkets
            ? DERIVED_SYNTHETIC_MARKETS.map(m => m.symbol)
            : [selectedSymbol];

        const subscribeSymbol = async (sym: string) => {
            if (!api_base?.api || !isMountedRef.current) return;
            const pip = DERIVED_SYNTHETIC_MARKETS.find(m => m.symbol === sym)?.pip || 2;

            try {
                const mData = marketsDataRef.current.get(sym);
                // 1. Initial tick history fetch
                if (!mData || mData.digits.length < 20) {
                    const res = await api_base.api.send({
                        ticks_history: sym,
                        end: 'latest',
                        count: MAX_TICKS_STORED,
                        style: 'ticks',
                    });

                    if (!isMountedRef.current) return;

                    if (mData && res?.history?.prices) {
                        const prices: number[] = res.history.prices || [];
                        const digits = prices.map(p => extractLastDigit(p, pip));
                        mData.digits = digits;
                        if (prices.length > 0) {
                            const lastP = prices[prices.length - 1];
                            mData.currentPrice = Number(lastP).toFixed(pip);
                            mData.lastDigit = digits[digits.length - 1];
                        }
                        throttleRender();
                    }
                }

                // 2. Real-time live tick subscription
                const tickObservable = (api_base.api as any)?.subscribe?.({ ticks: sym });
                const sub = safeSubscribe(tickObservable, (tickRes: any) => {
                    if (!isMountedRef.current) return;
                    if (tickRes?.tick?.symbol === sym && tickRes?.tick?.quote !== undefined) {
                        const quote = Number(tickRes.tick.quote);
                        const lastD = extractLastDigit(quote, pip);
                        const item = marketsDataRef.current.get(sym);
                        if (item) {
                            item.currentPrice = quote.toFixed(pip);
                            item.lastDigit = lastD;
                            item.digits = [...item.digits, lastD].slice(-MAX_TICKS_STORED);
                            throttleRender();
                        }
                    }
                });

                if (isMountedRef.current) {
                    activeSubs.get(sym)?.unsubscribe?.();
                    activeSubs.set(sym, sub);
                }
            } catch (err) {
                console.error(`[OVERLORD AI] Error streaming ${sym}:`, err);
            }
        };

        const initAllStreams = async () => {
            if (!api_base?.api) {
                setTimeout(initAllStreams, 1000);
                return;
            }
            for (const sym of symbolsToStream) {
                if (!isMountedRef.current) break;
                await subscribeSymbol(sym);
                await new Promise(r => setTimeout(r, 100)); // Rate-limiting guard
            }
        };

        void initAllStreams();

        // Heartbeat Keepalive (Ping every 30s to maintain 24/7 uninterrupted connection)
        const keepaliveInterval = setInterval(() => {
            if (api_base?.api && typeof (api_base.api as any).send === 'function') {
                (api_base.api as any).send({ ping: 1 }).catch(() => {});
            }
        }, 30000);

        return () => {
            clearInterval(keepaliveInterval);
        };
    }, [scanAllMarkets, selectedSymbol, throttleRender]);

    // Component unmount cleanup
    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            subscriptionsRef.current.forEach(sub => {
                try {
                    sub?.unsubscribe?.();
                } catch {
                    /* ignore */
                }
            });
            subscriptionsRef.current.clear();
        };
    }, []);

    // ── Current Active Market Data ──
    const currentMarket = useMemo(() => {
        const m = marketsDataRef.current.get(selectedSymbol);
        if (m) return m;
        return {
            symbol: selectedSymbol,
            label: DERIVED_SYNTHETIC_MARKETS.find(x => x.symbol === selectedSymbol)?.label || selectedSymbol,
            digits: [],
            currentPrice: '0.00',
            lastDigit: 0,
            pip: 2,
        };
    }, [selectedSymbol, renderTrigger]);

    // ── Digit Statistics Spectrum (0-9 on Last 50 Ticks) ──
    const digitStats: DigitStat[] = useMemo(() => {
        const recent50 = currentMarket.digits.slice(-50);
        const total = recent50.length || 1;
        const counts = new Array(10).fill(0);

        recent50.forEach(d => {
            if (d >= 0 && d <= 9) counts[d]++;
        });

        const last15 = currentMarket.digits.slice(-15);
        const prev15 = currentMarket.digits.slice(-30, -15);

        const stats: DigitStat[] = counts.map((count, digit) => {
            const percentage = Math.round((count / total) * 1000) / 10;
            const c15 = last15.filter(d => d === digit).length;
            const p15 = prev15.filter(d => d === digit).length;
            const isIncreasing = c15 >= p15;

            return {
                digit,
                count,
                percentage,
                rank: 0,
                isIncreasing,
            };
        });

        const sorted = [...stats].sort((a, b) => b.count - a.count);
        sorted.forEach((item, index) => {
            const original = stats.find(s => s.digit === item.digit);
            if (original) original.rank = index + 1;
        });

        return stats;
    }, [currentMarket.digits]);

    // ── Dual Statistical Breakdown & Analysis ──
    const statisticalAnalysis = useMemo(() => {
        const last50 = currentMarket.digits.slice(-50);
        const total = last50.length || 1;

        // Breakdown 1: Under 0-4 vs Over 5-9
        const under04Count = last50.filter(d => d <= 4).length;
        const over59Count = last50.filter(d => d >= 5).length;
        const under04Pct = Math.round((under04Count / total) * 100);
        const over59Pct = Math.round((over59Count / total) * 100);

        // Trend calculation for Under 0-4 vs Over 5-9 (last 15 vs prev 15)
        const last15 = currentMarket.digits.slice(-15);
        const prev15 = currentMarket.digits.slice(-30, -15);
        const last15Under04 = last15.filter(d => d <= 4).length;
        const prev15Under04 = prev15.filter(d => d <= 4).length;
        const isUnder04Increasing = last15Under04 >= prev15Under04;
        const isOver59Increasing = 15 - last15Under04 >= 15 - prev15Under04;

        // Breakdown 2: Under 0-5 vs Over 4-9
        const under05Count = last50.filter(d => d <= 5).length;
        const over49Count = last50.filter(d => d >= 4).length;
        const under05Pct = Math.round((under05Count / total) * 100);
        const over49Pct = Math.round((over49Count / total) * 100);

        // Highest Entry Digit in Under and Over
        const underDigitsRanked = digitStats.filter(s => s.digit <= 4).sort((a, b) => b.count - a.count);
        const overDigitsRanked = digitStats.filter(s => s.digit >= 5).sort((a, b) => b.count - a.count);
        const highestUnderEntryDigit = underDigitsRanked[0]?.digit ?? 2;
        const highestOverEntryDigit = overDigitsRanked[0]?.digit ?? 7;

        // Micro-confirmation: Last 10 & Last 7 Ticks
        const last10 = currentMarket.digits.slice(-10);
        const last10Under = last10.filter(d => d <= 4).length;
        const last10Over = last10.filter(d => d >= 5).length;

        const last7 = currentMarket.digits.slice(-7);
        const last7Under = last7.filter(d => d <= 4).length;
        const last7Over = last7.filter(d => d >= 5).length;

        // OVERLORD Strategy Signal Evaluation
        let signal: 'UNDER' | 'OVER' | 'NEUTRAL' = 'NEUTRAL';
        let signalConfidence = 0;

        // Under Signal Criteria:
        // 1. Under 0-4 threshold > 55% and increasing
        // 2. Under 0-5 count > Over 4-9 count (e.g. 34 vs 25)
        // 3. Last 10 ticks has >= 7 under and last 7 ticks favor under
        const underCondition1 = under04Pct >= 55 && isUnder04Increasing;
        const underCondition2 = under05Count > over49Count;
        const underCondition3 = last10Under >= 7 && last7Under >= 4;

        // Over Signal Criteria:
        // 1. Over 5-9 threshold > 55% and increasing
        // 2. Over 4-9 count > Under 0-5 count
        // 3. Last 10 ticks has >= 7 over and last 7 ticks favor over
        const overCondition1 = over59Pct >= 55 && isOver59Increasing;
        const overCondition2 = over49Count > under05Count;
        const overCondition3 = last10Over >= 7 && last7Over >= 4;

        if (underCondition1 && underCondition2 && underCondition3) {
            signal = 'UNDER';
            signalConfidence = Math.min(98, under04Pct + (last10Under >= 8 ? 10 : 5));
        } else if (overCondition1 && overCondition2 && overCondition3) {
            signal = 'OVER';
            signalConfidence = Math.min(98, over59Pct + (last10Over >= 8 ? 10 : 5));
        } else if (under04Pct > over59Pct) {
            signalConfidence = under04Pct;
        } else {
            signalConfidence = over59Pct;
        }

        // Check if current tick last digit matches entry trigger digit
        const isUnderTriggerReady = currentMarket.lastDigit === highestUnderEntryDigit;
        const isOverTriggerReady = currentMarket.lastDigit === highestOverEntryDigit;

        return {
            under04Count,
            over59Count,
            under04Pct,
            over59Pct,
            isUnder04Increasing,
            isOver59Increasing,
            under05Count,
            over49Count,
            under05Pct,
            over49Pct,
            highestUnderEntryDigit,
            highestOverEntryDigit,
            last10Under,
            last10Over,
            last7Under,
            last7Over,
            signal,
            signalConfidence,
            isUnderTriggerReady,
            isOverTriggerReady,
            underCondition1,
            underCondition2,
            underCondition3,
            overCondition1,
            overCondition2,
            overCondition3,
        };
    }, [currentMarket.digits, currentMarket.lastDigit, digitStats]);

    // ── Auto-Select Best Market Candidate ──
    const bestMarketCandidate = useMemo(() => {
        let bestSym = selectedSymbol;
        let bestScore = -1;
        let bestType = 'NEUTRAL';

        marketsDataRef.current.forEach((mState, sym) => {
            if (mState.digits.length < 30) return;
            const last50 = mState.digits.slice(-50);
            const total = last50.length || 1;
            const uCount = last50.filter(d => d <= 4).length;
            const oCount = last50.filter(d => d >= 5).length;
            const maxUO = Math.max(uCount, oCount);
            const uoPct = Math.round((maxUO / total) * 100);

            // Calculate directional dominance
            const u05 = last50.filter(d => d <= 5).length;
            const o49 = last50.filter(d => d >= 4).length;
            const disparity = Math.abs(u05 - o49);

            const score = uoPct * 0.7 + disparity * 1.5;

            if (score > bestScore) {
                bestScore = score;
                bestSym = sym;
                bestType = uCount > oCount ? 'UNDER' : 'OVER';
            }
        });

        return { symbol: bestSym, score: Math.round(bestScore), type: bestType };
    }, [selectedSymbol, renderTrigger]);

    // Auto-switch to best market when enabled and not actively in a trade
    useEffect(() => {
        if (autoPickBestMarket && botState !== 'TRADING' && bestMarketCandidate.symbol !== selectedSymbol) {
            if (bestMarketCandidate.score >= 50) {
                setSelectedSymbol(bestMarketCandidate.symbol);
            }
        }
    }, [autoPickBestMarket, bestMarketCandidate, botState, selectedSymbol]);

    // ── Push Contracts to Deriv Transaction Drawer & Summary ──
    const pushContractToDrawer = useCallback(
        (contractSnapshot: Record<string, unknown>) => {
            try {
                transactions?.pushTransaction?.({ ...contractSnapshot, run_id: run_panel?.run_id });
                run_panel?.onBotContractEvent?.(contractSnapshot);
                summary_card?.onBotContractEvent?.(contractSnapshot);
            } catch {
                /* ignore */
            }
        },
        [run_panel, summary_card, transactions]
    );

    // ── Add Trade Log Entry ──
    const addLogEntry = useCallback(
        (
            market: string,
            contractType: 'DIGITUNDER' | 'DIGITOVER',
            prediction: number,
            stake: number,
            result: 'WIN' | 'LOSS' | 'PENDING',
            profit: number
        ) => {
            const item: TradeLogItem = {
                id: `ovl-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                time: new Date().toLocaleTimeString(),
                market,
                contractType,
                prediction,
                stake,
                result,
                profit,
            };
            setTradeLog(prev => [item, ...prev.slice(0, 49)]);
            return item.id;
        },
        []
    );

    const updateLogResult = useCallback((id: string, result: 'WIN' | 'LOSS', profit: number) => {
        setTradeLog(prev => prev.map(item => (item.id === id ? { ...item, result, profit } : item)));
    }, []);

    // ── Execute Trade Order ──
    const executeTradeOrder = useCallback(
        async (
            market: string,
            contractType: 'DIGITUNDER' | 'DIGITOVER',
            barrier: number,
            stake: number
        ) => {
            if (executionLockRef.current) return;
            executionLockRef.current = true;
            setBotState('TRADING');
            if (soundEnabled) playSoundCue('signal');

            const logId = addLogEntry(market, contractType, barrier, stake, 'PENDING', 0);

            try {
                const duration = parseInt(tickDuration, 10) || 1;
                const params: Record<string, any> = {
                    amount: stake,
                    basis: 'stake',
                    contract_type: contractType,
                    currency,
                    duration,
                    duration_unit: 't',
                    symbol: market,
                    barrier: String(barrier),
                };

                const buyResult = await buyContractForUi({
                    parameters: params,
                    price: stake,
                    source: 'OVERLORD AI',
                });

                if (!buyResult?.contract_id) {
                    throw new Error('No contract ID received');
                }

                const contractId = buyResult.contract_id;
                const transactionId = buyResult.transaction_id || contractId;
                const startTime = Math.floor(Date.now() / 1000);
                const marketLabel = DERIVED_SYNTHETIC_MARKETS.find(m => m.symbol === market)?.label || market;

                const initSnapshot = {
                    contract_id: contractId,
                    transaction_ids: { buy: transactionId },
                    buy_price: stake,
                    underlying: market,
                    underlying_symbol: market,
                    display_name: marketLabel,
                    shortcode: `OVERLORD_${contractType}_${barrier}`,
                    contract_type: contractType,
                    currency: currency || 'USD',
                    date_start: startTime,
                    status: 'open',
                    barrier: String(barrier),
                };
                pushContractToDrawer(initSnapshot);

                // Stream contract until settled
                const settledSnapshot = await streamContractUntilSettled({
                    contractId,
                    fallback: initSnapshot,
                    onUpdate: snapshot => {
                        pushContractToDrawer(snapshot);
                    },
                    source: 'OVERLORD AI',
                });

                pushContractToDrawer(settledSnapshot);
                const profitVal = Number(settledSnapshot?.profit || 0);
                const isWin = profitVal > 0;

                if (isWin) {
                    if (soundEnabled) playSoundCue('win');
                    updateLogResult(logId, 'WIN', profitVal);
                    setWinsCount(w => w + 1);
                    setSessionProfit(p => {
                        const newProfit = p + profitVal;
                        // Auto-tick compounding plan step if target met
                        setCompoundingPlan(prevPlan => {
                            let updated = false;
                            const newPlan = prevPlan.map(step => {
                                if (!step.completed && newProfit >= step.targetProfit && !updated) {
                                    updated = true;
                                    return { ...step, completed: true };
                                }
                                return step;
                            });
                            if (updated) savePlanToStorage(newPlan);
                            return newPlan;
                        });
                        return newProfit;
                    });

                    if (isInRecovery) {
                        setIsInRecovery(false);
                        setCurrentStake(effectiveStake);
                    } else {
                        setCurrentStake(effectiveStake);
                    }
                } else {
                    if (soundEnabled) playSoundCue('loss');
                    updateLogResult(logId, 'LOSS', profitVal);
                    setLossesCount(l => l + 1);
                    setSessionProfit(p => p + profitVal);

                    // Martingale multiplier
                    setIsInRecovery(true);
                    const martMult = parseFloat(martingale) || 2.6;
                    const nextStake = Math.round(stake * martMult * 100) / 100;
                    setCurrentStake(nextStake);
                }
            } catch (err: any) {
                console.error('[OVERLORD AI] Trade execution failed:', err);
                updateLogResult(logId, 'LOSS', 0);
            } finally {
                executionLockRef.current = false;
                setBotState(botState === 'PAUSED' ? 'PAUSED' : 'WAITING_SIGNAL');
            }
        },
        [
            soundEnabled,
            addLogEntry,
            tickDuration,
            currency,
            pushContractToDrawer,
            updateLogResult,
            isInRecovery,
            effectiveStake,
            savePlanToStorage,
            martingale,
            botState,
        ]
    );

    // ── Continuous Autotrading Strategy Loop ──
    useEffect(() => {
        if (botState === 'IDLE' || botState === 'PAUSED' || executionLockRef.current) return;

        const {
            signal,
            isUnderTriggerReady,
            isOverTriggerReady,
        } = statisticalAnalysis;

        // Check Take Profit condition
        const targetTp = parseFloat(takeProfitTarget) || 50;
        if (sessionProfit >= targetTp && targetTp > 0) {
            setBotState('PAUSED');
            return;
        }

        if (signal === 'NEUTRAL') {
            if (botState !== 'WAITING_SIGNAL') setBotState('WAITING_SIGNAL');
            return;
        }

        // Stake to use (normal vs recovery)
        const stakeToUse = isInRecovery ? currentStake : effectiveStake;

        // If Under signal: Under predictions strictly 6, 7, or 8 ONLY
        if (signal === 'UNDER') {
            if (isUnderTriggerReady) {
                let underPrediction = customUnderPrediction;
                if (predictionMode === 'AUTO') {
                    underPrediction = 6; // Default highly resilient Under 6
                }
                if (![6, 7, 8].includes(underPrediction)) underPrediction = 6;

                void executeTradeOrder(selectedSymbol, 'DIGITUNDER', underPrediction, stakeToUse);
            } else {
                if (botState !== 'WAITING_TRIGGER') setBotState('WAITING_TRIGGER');
            }
        }
        // If Over signal: Over predictions strictly 1, 2, or 3 ONLY
        else if (signal === 'OVER') {
            if (isOverTriggerReady) {
                let overPrediction = customOverPrediction;
                if (predictionMode === 'AUTO') {
                    overPrediction = 3; // Default highly resilient Over 3
                }
                if (![1, 2, 3].includes(overPrediction)) overPrediction = 3;

                void executeTradeOrder(selectedSymbol, 'DIGITOVER', overPrediction, stakeToUse);
            } else {
                if (botState !== 'WAITING_TRIGGER') setBotState('WAITING_TRIGGER');
            }
        }
    }, [
        botState,
        statisticalAnalysis,
        sessionProfit,
        takeProfitTarget,
        isInRecovery,
        currentStake,
        effectiveStake,
        customUnderPrediction,
        predictionMode,
        executeTradeOrder,
        selectedSymbol,
        customOverPrediction,
    ]);

    // ── Compounding Summary Metrics ──
    const compoundingSummary = useMemo(() => {
        if (compoundingPlan.length === 0) {
            return { totalProfit: 0, finalBalance: 0, completedSteps: 0, totalSteps: 0 };
        }
        const lastStep = compoundingPlan[compoundingPlan.length - 1];
        const start = compoundingPlan[0].startingBalance;
        const finalBal = lastStep.endingBalance;
        const totalProfit = Math.round((finalBal - start) * 100) / 100;
        const completedSteps = compoundingPlan.filter(s => s.completed).length;

        return {
            totalProfit,
            finalBalance: finalBal,
            completedSteps,
            totalSteps: compoundingPlan.length,
        };
    }, [compoundingPlan]);

    // ── 50-Digit Spline Line Chart Calculations ──
    const chartData = useMemo(() => {
        const last50 = currentMarket.digits.slice(-CHART_TICKS);
        const count = last50.length;
        if (count < 2) return { path: '', points: [], currentPoint: null };

        const width = 600;
        const height = 180;
        const padX = 24;
        const padY = 20;

        const points = last50.map((digit, idx) => {
            const x = padX + (idx / (CHART_TICKS - 1)) * (width - padX * 2);
            // Inverted Y: Digit 9 at top (padY), Digit 0 at bottom (height - padY)
            const y = height - padY - (digit / 9) * (height - padY * 2);
            return { x, y, digit, idx };
        });

        const path = getBezierSplinePath(points);
        const currentPoint = points[points.length - 1];

        return { path, points, currentPoint };
    }, [currentMarket.digits]);

    // ── Compounding Growth Chart Curve ──
    const growthChartPath = useMemo(() => {
        if (compoundingPlan.length < 2) return '';
        const width = 340;
        const height = 100;
        const padX = 10;
        const padY = 12;

        const maxBal = compoundingPlan[compoundingPlan.length - 1].endingBalance || 1;
        const minBal = compoundingPlan[0].startingBalance || 0;
        const range = maxBal - minBal || 1;

        const points = compoundingPlan.map((step, idx) => {
            const x = padX + (idx / (compoundingPlan.length - 1)) * (width - padX * 2);
            const y = height - padY - ((step.endingBalance - minBal) / range) * (height - padY * 2);
            return { x, y };
        });

        return getBezierSplinePath(points);
    }, [compoundingPlan]);

    // Filtered Market List for Search
    const filteredMarkets = useMemo(() => {
        if (!marketSearchTerm.trim()) return DERIVED_SYNTHETIC_MARKETS;
        const term = marketSearchTerm.toLowerCase();
        return DERIVED_SYNTHETIC_MARKETS.filter(
            m => m.label.toLowerCase().includes(term) || m.symbol.toLowerCase().includes(term)
        );
    }, [marketSearchTerm]);

    return (
        <div className='overlord-ai-wrapper'>
            {/* ── Top Header & Stats Bar ── */}
            <header className='overlord-top-bar'>
                <div className='brand-section'>
                    <div className='brand-icon-box'>
                        <Zap size={24} />
                    </div>
                    <div className='brand-info'>
                        <h1 className='brand-title'>
                            OVERLORD AI
                            <span className='version-tag'>SYNTHETICS ENGINE</span>
                        </h1>
                        <span className='brand-subtitle'>
                            Deep Statistical Scanning • 24/7 Resilient Autotrader • Precision Compounding
                        </span>
                    </div>
                </div>

                <div className='top-stats-group'>
                    {/* Live Deriv Account Balance */}
                    <div className='stat-pill balance-pill'>
                        <span>Live Balance:</span>
                        <strong>
                            {rawBalance > 0 ? `${rawBalance.toFixed(2)} ${currency}` : `Loading...`}
                        </strong>
                        <button
                            className='refresh-icon-btn'
                            title='Sync Balance'
                            onClick={handleFetchBalance}
                        >
                            <RefreshCw size={14} />
                        </button>
                    </div>

                    {/* 24/7 Resilience Indicator */}
                    <div className='stat-pill uptime-pill'>
                        <div className='uptime-dot' />
                        <span>24/7 Active Engine</span>
                    </div>

                    {/* Sound Toggle */}
                    <button
                        className='stat-pill'
                        style={{ cursor: 'pointer', background: 'transparent' }}
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        title={soundEnabled ? 'Mute Sounds' : 'Enable Sounds'}
                    >
                        {soundEnabled ? <Volume2 size={16} color='#00f5ff' /> : <VolumeX size={16} color='#64748b' />}
                    </button>
                </div>
            </header>

            {/* ── Control Ribbon: Scanner Mode & Autotrade Actions ── */}
            <div className='overlord-controls-ribbon'>
                <div className='left-controls'>
                    {/* Wide View Toggle */}
                    <button
                        className={`btn-control btn-scan-wide ${isWideViewOpen ? 'active' : ''}`}
                        onClick={() => setIsWideViewOpen(!isWideViewOpen)}
                    >
                        <Grid size={15} />
                        <span>{isWideViewOpen ? 'Collapse Scanner Grid' : 'All Markets Wide View'}</span>
                        {isWideViewOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>

                    {/* Auto Pick Best Market */}
                    <button
                        className={`btn-control btn-best-market ${autoPickBestMarket ? 'active' : ''}`}
                        onClick={() => setAutoPickBestMarket(!autoPickBestMarket)}
                        title='Auto-inputs the best market with highest statistical advantage'
                    >
                        <Flame size={15} />
                        <span>Best Market: {bestMarketCandidate.symbol} ({bestMarketCandidate.type} {bestMarketCandidate.score}%)</span>
                    </button>

                    {/* Multi-Market Scanner Toggle */}
                    <button
                        className={`btn-control btn-toggle-scan ${scanAllMarkets ? 'active' : ''}`}
                        onClick={() => setScanAllMarkets(!scanAllMarkets)}
                    >
                        <Layers size={15} />
                        <span>Scan Entire Synthetics ({scanAllMarkets ? 'Active' : 'Single Only'})</span>
                    </button>
                </div>

                <div className='right-controls'>
                    {botState === 'IDLE' || botState === 'PAUSED' ? (
                        <button
                            className='btn-control btn-autotrade-start'
                            onClick={() => {
                                setBotState('WAITING_SIGNAL');
                                setCurrentStake(effectiveStake);
                            }}
                        >
                            <Play size={16} />
                            <span>Start OVERLORD Autotrade</span>
                        </button>
                    ) : (
                        <>
                            <button
                                className='btn-control btn-autotrade-pause'
                                onClick={() => setBotState('PAUSED')}
                            >
                                <Pause size={16} />
                                <span>Pause</span>
                            </button>
                            <button
                                className='btn-control btn-autotrade-stop'
                                onClick={() => setBotState('IDLE')}
                            >
                                <Square size={16} />
                                <span>Stop Bot</span>
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* ── Wide View All Markets Dropdown / Grid ── */}
            {isWideViewOpen && (
                <div className='wide-scanner-grid-container'>
                    <div className='wide-grid-header'>
                        <h3 className='wide-title'>
                            <Activity size={18} />
                            <span>Derived Synthetics Real-Time Multi-Market Grid</span>
                        </h3>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                            Click any market to trade immediately
                        </span>
                    </div>

                    <div className='wide-market-cards-grid'>
                        {DERIVED_SYNTHETIC_MARKETS.map(m => {
                            const data = marketsDataRef.current.get(m.symbol);
                            const last50 = data?.digits.slice(-50) || [];
                            const total = last50.length || 1;
                            const u04 = last50.filter(d => d <= 4).length;
                            const o59 = last50.filter(d => d >= 5).length;
                            const u04Pct = Math.round((u04 / total) * 100);
                            const o59Pct = Math.round((o59 / total) * 100);
                            const u05 = last50.filter(d => d <= 5).length;
                            const o49 = last50.filter(d => d >= 4).length;
                            const isBest = bestMarketCandidate.symbol === m.symbol;

                            return (
                                <div
                                    key={m.symbol}
                                    className={`wide-card ${isBest ? 'is-best-candidate' : ''}`}
                                    onClick={() => {
                                        setSelectedSymbol(m.symbol);
                                        setAutoPickBestMarket(false);
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <strong style={{ color: '#ffffff', fontSize: '13px' }}>{m.label}</strong>
                                        {isBest && (
                                            <span style={{ fontSize: '10px', background: '#00e676', color: '#04140c', fontWeight: '800', padding: '1px 6px', borderRadius: '4px' }}>
                                                BEST EDGE
                                            </span>
                                        )}
                                        <span style={{ fontFamily: 'monospace', color: '#00f5ff', fontSize: '12px' }}>
                                            {data?.currentPrice || '0.00'}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                                        <span style={{ color: '#00e676' }}>U (0-4): {u04Pct}% ({u05} U)</span>
                                        <span style={{ color: '#ffb700' }}>O (5-9): {o59Pct}% ({o49} O)</span>
                                    </div>

                                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', display: 'flex', overflow: 'hidden' }}>
                                        <div style={{ width: `${u04Pct}%`, background: '#00e676' }} />
                                        <div style={{ width: `${o59Pct}%`, background: '#ffb700' }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Main Layout: 3 Columns ── */}
            <div className='overlord-main-layout'>
                {/* ── LEFT COLUMN: Market List & Side Scanner ── */}
                <aside className='overlord-side-scanner'>
                    <div className='glass-panel'>
                        <div className='panel-header'>
                            <h3 className='panel-title'>
                                <Activity size={16} />
                                <span>Derived Markets</span>
                            </h3>
                            <span className='panel-tag tag-cyan'>{DERIVED_SYNTHETIC_MARKETS.length} Vol Indices</span>
                        </div>

                        <div className='market-search-box'>
                            <input
                                type='text'
                                placeholder='Search synthetic index...'
                                value={marketSearchTerm}
                                onChange={e => setMarketSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className='market-list-scroll'>
                            {filteredMarkets.map(m => {
                                const mData = marketsDataRef.current.get(m.symbol);
                                const last50 = mData?.digits.slice(-50) || [];
                                const total = last50.length || 1;
                                const uCount = last50.filter(d => d <= 4).length;
                                const oCount = last50.filter(d => d >= 5).length;
                                const uPct = Math.round((uCount / total) * 100);
                                const oPct = Math.round((oCount / total) * 100);
                                const isSelected = selectedSymbol === m.symbol;
                                const lastDigit = mData?.lastDigit ?? 0;
                                const isUnderDigit = lastDigit <= 4;

                                return (
                                    <div
                                        key={m.symbol}
                                        className={`market-item-card ${isSelected ? 'active' : ''}`}
                                        onClick={() => {
                                            setSelectedSymbol(m.symbol);
                                            setAutoPickBestMarket(false);
                                        }}
                                    >
                                        <div className='market-header-row'>
                                            <span className='market-name'>{m.label}</span>
                                            <div className={`last-digit-badge ${isUnderDigit ? 'digit-under' : 'digit-over'}`}>
                                                {lastDigit}
                                            </div>
                                        </div>

                                        <div className='market-data-row'>
                                            <span className='market-price'>{mData?.currentPrice || '0.00'}</span>
                                            <span className={`market-bias-badge ${uPct > 55 ? 'bias-under' : oPct > 55 ? 'bias-over' : 'bias-neutral'}`}>
                                                {uPct > 55 ? `Under ${uPct}%` : oPct > 55 ? `Over ${oPct}%` : 'Balanced'}
                                            </span>
                                        </div>

                                        <div className='market-mini-bar'>
                                            <div className='mini-bar-under' style={{ width: `${uPct}%` }} />
                                            <div className='mini-bar-over' style={{ width: `${oPct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </aside>

                {/* ── CENTER COLUMN: Real-Time Visualizers & Statistical Analysis ── */}
                <main className='overlord-center-content'>
                    {/* Active Market Banner */}
                    <div className='active-market-hero'>
                        <div className='market-left-info'>
                            <div>
                                <h2 className='active-market-title'>{currentMarket.label}</h2>
                                <div className='active-price-display'>
                                    <span className='price-label'>SPOT PRICE</span>
                                    <span>{currentMarket.currentPrice}</span>
                                </div>
                            </div>
                        </div>

                        <div className='market-right-digit'>
                            <div className='last-digit-hero-box'>
                                <div
                                    key={`digit-beat-${currentMarket.lastDigit}-${renderTrigger}`}
                                    className={`digit-avatar ${currentMarket.lastDigit <= 4 ? 'digit-under' : 'digit-over'}`}
                                >
                                    {currentMarket.lastDigit}
                                </div>
                                <div className='digit-labels'>
                                    <span className='digit-sub'>Last Digit</span>
                                    <span className={`digit-type-text ${currentMarket.lastDigit <= 4 ? 'text-under' : 'text-over'}`}>
                                        {currentMarket.lastDigit <= 4 ? 'UNDER (0-4)' : 'OVER (5-9)'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 50-Digit Spline Line Chart */}
                    <div className='glass-panel glowing-cyan'>
                        <div className='digit-chart-container'>
                            <div className='chart-header-row'>
                                <h3 className='panel-title'>
                                    <LineChart size={16} />
                                    <span>Live 50 Last Digits Trend Line</span>
                                </h3>
                                <div className='chart-legend'>
                                    <div className='legend-item'>
                                        <div className='dot dot-under' />
                                        <span>Under (0-4)</span>
                                    </div>
                                    <div className='legend-item'>
                                        <div className='dot dot-over' />
                                        <span>Over (5-9)</span>
                                    </div>
                                </div>
                            </div>

                            <div className='svg-chart-wrapper'>
                                <svg viewBox='0 0 600 180' preserveAspectRatio='none'>
                                    <defs>
                                        <linearGradient id='splineGradient' x1='0' y1='0' x2='1' y2='0'>
                                            <stop offset='0%' stopColor='#00f5ff' />
                                            <stop offset='50%' stopColor='#9d4edd' />
                                            <stop offset='100%' stopColor='#00e676' />
                                        </linearGradient>
                                        <filter id='glowSpline' x='-20%' y='-20%' width='140%' height='140%'>
                                            <feGaussianBlur stdDeviation='3' result='blur' />
                                            <feMerge>
                                                <feMergeNode in='blur' />
                                                <feMergeNode in='SourceGraphic' />
                                            </feMerge>
                                        </filter>
                                    </defs>

                                    {/* Grid Lines */}
                                    <line x1='0' y1='20' x2='600' y2='20' stroke='rgba(255,255,255,0.05)' strokeDasharray='4 4' />
                                    <line x1='0' y1='90' x2='600' y2='90' stroke='rgba(0, 245, 255, 0.2)' strokeWidth='1.5' strokeDasharray='6 6' />
                                    <line x1='0' y1='160' x2='600' y2='160' stroke='rgba(255,255,255,0.05)' strokeDasharray='4 4' />

                                    {/* Spline Path */}
                                    {chartData.path && (
                                        <path
                                            d={chartData.path}
                                            fill='none'
                                            stroke='url(#splineGradient)'
                                            strokeWidth='2.5'
                                            filter='url(#glowSpline)'
                                        />
                                    )}

                                    {/* Data Points */}
                                    {chartData.points.map((p, idx) => {
                                        const isUnder = p.digit <= 4;
                                        return (
                                            <circle
                                                key={idx}
                                                cx={p.x}
                                                cy={p.y}
                                                r={idx === chartData.points.length - 1 ? '5' : '2.5'}
                                                fill={isUnder ? '#00e676' : '#ffb700'}
                                                stroke='#070a13'
                                                strokeWidth='1'
                                            />
                                        );
                                    })}

                                    {/* Pulsing Head for Current Digit */}
                                    {chartData.currentPoint && (
                                        <circle
                                            cx={chartData.currentPoint.x}
                                            cy={chartData.currentPoint.y}
                                            r='8'
                                            fill='none'
                                            stroke='#00f5ff'
                                            strokeWidth='1.5'
                                            opacity='0.8'
                                        >
                                            <animate attributeName='r' values='4;12;4' dur='1.5s' repeatCount='indefinite' />
                                            <animate attributeName='opacity' values='0.9;0.1;0.9' dur='1.5s' repeatCount='indefinite' />
                                        </circle>
                                    )}
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Dual Statistical Analysis Grid */}
                    <div className='overlord-stats-dual-grid'>
                        {/* Analysis 1: Under 0-4 vs Over 5-9 */}
                        <div className='glass-panel stat-split-card'>
                            <div className='split-title-row'>
                                <span className='split-title'>Under (0-4) vs Over (5-9)</span>
                                <span className='split-badge'>
                                    {statisticalAnalysis.under04Pct >= 55
                                        ? 'Under Edge (>55%)'
                                        : statisticalAnalysis.over59Pct >= 55
                                        ? 'Over Edge (>55%)'
                                        : 'Neutral Range'}
                                </span>
                            </div>

                            <div className='split-meter-box'>
                                <div className='meter-bar'>
                                    <div
                                        className='meter-left'
                                        style={{ width: `${statisticalAnalysis.under04Pct}%` }}
                                    />
                                    <div
                                        className='meter-right'
                                        style={{ width: `${statisticalAnalysis.over59Pct}%` }}
                                    />
                                </div>
                                <div className='meter-labels'>
                                    <span className='label-left'>
                                        Under: {statisticalAnalysis.under04Pct}% ({statisticalAnalysis.under04Count}/50)
                                    </span>
                                    <span className='label-right'>
                                        Over: {statisticalAnalysis.over59Pct}% ({statisticalAnalysis.over59Count}/50)
                                    </span>
                                </div>
                            </div>

                            <div className='stat-metrics-row'>
                                <span>Trend: <strong>{statisticalAnalysis.isUnder04Increasing ? 'Under ↗ Rising' : 'Over ↗ Rising'}</strong></span>
                                <span>Condition 1: <strong style={{ color: statisticalAnalysis.underCondition1 || statisticalAnalysis.overCondition1 ? '#00e676' : '#94a3b8' }}>
                                    {statisticalAnalysis.underCondition1 || statisticalAnalysis.overCondition1 ? 'PASSED ✓' : 'WAITING'}
                                </strong></span>
                            </div>
                        </div>

                        {/* Analysis 2: Under 0-5 vs Over 4-9 */}
                        <div className='glass-panel stat-split-card'>
                            <div className='split-title-row'>
                                <span className='split-title'>Under (0-5) vs Over (4-9) Split</span>
                                <span className='split-badge'>
                                    {statisticalAnalysis.under05Count > statisticalAnalysis.over49Count
                                        ? 'Under Power Dominant'
                                        : 'Over Power Dominant'}
                                </span>
                            </div>

                            <div className='split-meter-box'>
                                <div className='meter-bar'>
                                    <div
                                        className='meter-left'
                                        style={{ width: `${statisticalAnalysis.under05Pct}%` }}
                                    />
                                    <div
                                        className='meter-right'
                                        style={{ width: `${statisticalAnalysis.over49Pct}%` }}
                                    />
                                </div>
                                <div className='meter-labels'>
                                    <span className='label-left'>
                                        {statisticalAnalysis.under05Count} Unders (0-5)
                                    </span>
                                    <span className='label-right'>
                                        {statisticalAnalysis.over49Count} Overs (4-9)
                                    </span>
                                </div>
                            </div>

                            <div className='stat-metrics-row'>
                                <span>Last 10: <strong>{statisticalAnalysis.last10Under} Under / {statisticalAnalysis.last10Over} Over</strong></span>
                                <span>Last 7: <strong>{statisticalAnalysis.last7Under} Under / {statisticalAnalysis.last7Over} Over</strong></span>
                            </div>
                        </div>
                    </div>

                    {/* Glowing Highest Entry Digit Panel */}
                    <div className='glass-panel glowing-entry-digits-panel'>
                        <div className='panel-header'>
                            <h3 className='panel-title'>
                                <Target size={16} />
                                <span>Highest Entry Digits & Trigger Matrix</span>
                            </h3>
                            <span className='panel-tag tag-emerald'>
                                Live Trigger: {statisticalAnalysis.signal}
                            </span>
                        </div>

                        <div className='entry-digits-grid'>
                            {/* Under Highest Entry Digit */}
                            <div className={`entry-digit-card under-glow ${statisticalAnalysis.isUnderTriggerReady ? 'is-active-trigger' : ''}`}>
                                <div className='digit-orb orb-under'>
                                    {statisticalAnalysis.highestUnderEntryDigit}
                                </div>
                                <div className='entry-details'>
                                    <span className='entry-type'>Highest Under Entry Digit</span>
                                    <span className='entry-status'>
                                        Digit {statisticalAnalysis.highestUnderEntryDigit} ({digitStats.find(s => s.digit === statisticalAnalysis.highestUnderEntryDigit)?.percentage}%)
                                    </span>
                                    <span className='entry-subtext'>
                                        {statisticalAnalysis.isUnderTriggerReady ? '⚡ TRIGGER PULSING - READY TO BUY' : 'Awaiting spot trigger digit...'}
                                    </span>
                                </div>
                            </div>

                            {/* Over Highest Entry Digit */}
                            <div className={`entry-digit-card over-glow ${statisticalAnalysis.isOverTriggerReady ? 'is-active-trigger' : ''}`}>
                                <div className='digit-orb orb-over'>
                                    {statisticalAnalysis.highestOverEntryDigit}
                                </div>
                                <div className='entry-details'>
                                    <span className='entry-type'>Highest Over Entry Digit</span>
                                    <span className='entry-status'>
                                        Digit {statisticalAnalysis.highestOverEntryDigit} ({digitStats.find(s => s.digit === statisticalAnalysis.highestOverEntryDigit)?.percentage}%)
                                    </span>
                                    <span className='entry-subtext'>
                                        {statisticalAnalysis.isOverTriggerReady ? '⚡ TRIGGER PULSING - READY TO BUY' : 'Awaiting spot trigger digit...'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Full 0-9 Digit Spectrum Bar */}
                        <div className='digit-spectrum-row'>
                            {digitStats.map(s => {
                                const isUnder = s.digit <= 4;
                                const isHighest =
                                    (isUnder && s.digit === statisticalAnalysis.highestUnderEntryDigit) ||
                                    (!isUnder && s.digit === statisticalAnalysis.highestOverEntryDigit);

                                return (
                                    <div
                                        key={s.digit}
                                        className={`spectrum-bar-item ${isUnder ? 'is-under' : 'is-over'} ${isHighest ? 'is-highest' : ''}`}
                                    >
                                        <span className='digit-num'>{s.digit}</span>
                                        <span className='digit-freq-pct'>{s.percentage}%</span>
                                        <span className='digit-rank-badge'>#{s.rank}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </main>

                {/* ── RIGHT COLUMN: Autotrader & Compounding Generator Tabs ── */}
                <aside className='overlord-right-panel'>
                    {/* Tab Selector */}
                    <div className='right-panel-tabs'>
                        <button
                            className={`tab-btn ${activeRightTab === 'AUTOTRADER' ? 'active' : ''}`}
                            onClick={() => setActiveRightTab('AUTOTRADER')}
                        >
                            <Zap size={14} />
                            <span>Autotrader Engine</span>
                        </button>
                        <button
                            className={`tab-btn ${activeRightTab === 'COMPOUNDING' ? 'active' : ''}`}
                            onClick={() => setActiveRightTab('COMPOUNDING')}
                        >
                            <TrendingUp size={14} />
                            <span>Compounding Plan</span>
                        </button>
                    </div>

                    {/* ── TAB 1: AUTOTRADER ENGINE ── */}
                    {activeRightTab === 'AUTOTRADER' && (
                        <div className='glass-panel autotrader-config-section'>
                            <div className='strategy-alert-box'>
                                <Sparkles size={16} />
                                <span>
                                    OVERLORD Strategy: Only Over (1, 2, 3) & Under (6, 7, 8) with 2.6x Martingale.
                                </span>
                            </div>

                            <div className='form-row'>
                                <div className='form-group'>
                                    <label>Stake Mode</label>
                                    <select
                                        value={isAutoStake ? 'AUTO' : 'MANUAL'}
                                        onChange={e => setIsAutoStake(e.target.value === 'AUTO')}
                                    >
                                        <option value='AUTO'>Auto (7% Balance)</option>
                                        <option value='MANUAL'>Manual Fixed Stake</option>
                                    </select>
                                </div>

                                <div className='form-group'>
                                    <label>{isAutoStake ? 'Auto Stake %' : 'Fixed Stake ($)'}</label>
                                    {isAutoStake ? (
                                        <input
                                            type='number'
                                            value={autoStakePercent}
                                            onChange={e => setAutoStakePercent(e.target.value)}
                                            placeholder='7'
                                        />
                                    ) : (
                                        <input
                                            type='number'
                                            value={manualStake}
                                            onChange={e => setManualStake(e.target.value)}
                                            placeholder='1.00'
                                        />
                                    )}
                                </div>
                            </div>

                            <div className='form-row'>
                                <div className='form-group'>
                                    <label>Martingale Multiplier</label>
                                    <input
                                        type='number'
                                        step='0.1'
                                        value={martingale}
                                        onChange={e => setMartingale(e.target.value)}
                                        placeholder='2.6'
                                    />
                                </div>

                                <div className='form-group'>
                                    <label>Duration (Ticks)</label>
                                    <select
                                        value={tickDuration}
                                        onChange={e => setTickDuration(e.target.value)}
                                    >
                                        <option value='1'>1 Tick (Recommended)</option>
                                        <option value='2'>2 Ticks</option>
                                    </select>
                                </div>
                            </div>

                            <div className='form-row'>
                                <div className='form-group'>
                                    <label>Prediction Mode</label>
                                    <select
                                        value={predictionMode}
                                        onChange={e => setPredictionMode(e.target.value as 'AUTO' | 'CUSTOM')}
                                    >
                                        <option value='AUTO'>Auto (Smart Barrier)</option>
                                        <option value='CUSTOM'>Custom Fixed Barrier</option>
                                    </select>
                                </div>

                                <div className='form-group'>
                                    <label>Take Profit ($)</label>
                                    <input
                                        type='number'
                                        value={takeProfitTarget}
                                        onChange={e => setTakeProfitTarget(e.target.value)}
                                        placeholder='50.00'
                                    />
                                </div>
                            </div>

                            {predictionMode === 'CUSTOM' && (
                                <div className='form-row'>
                                    <div className='form-group'>
                                        <label>Under Prediction</label>
                                        <select
                                            value={customUnderPrediction}
                                            onChange={e => setCustomUnderPrediction(parseInt(e.target.value, 10))}
                                        >
                                            <option value={6}>Under 6 (High Safety)</option>
                                            <option value={7}>Under 7 (Balanced)</option>
                                            <option value={8}>Under 8 (Aggressive)</option>
                                        </select>
                                    </div>

                                    <div className='form-group'>
                                        <label>Over Prediction</label>
                                        <select
                                            value={customOverPrediction}
                                            onChange={e => setCustomOverPrediction(parseInt(e.target.value, 10))}
                                        >
                                            <option value={3}>Over 3 (High Safety)</option>
                                            <option value={2}>Over 2 (Balanced)</option>
                                            <option value={1}>Over 1 (Aggressive)</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            <div className='form-row'>
                                <div className='form-group' style={{ gridColumn: 'span 2' }}>
                                    <label>Effective Stake</label>
                                    <div style={{ padding: '8px 12px', background: 'rgba(0, 245, 255, 0.1)', border: '1px solid rgba(0, 245, 255, 0.3)', borderRadius: '8px', color: '#00f5ff', fontWeight: '800', fontFamily: 'monospace' }}>
                                        ${isInRecovery ? currentStake.toFixed(2) : effectiveStake.toFixed(2)}
                                    </div>
                                </div>
                            </div>

                            {/* Session Performance Metrics */}
                            <div className='session-metrics-grid'>
                                <div className='metric-mini-card'>
                                    <span className='m-label'>Session Profit</span>
                                    <span className={`m-val ${sessionProfit >= 0 ? 'val-win' : 'val-loss'}`}>
                                        ${sessionProfit.toFixed(2)}
                                    </span>
                                </div>
                                <div className='metric-mini-card'>
                                    <span className='m-label'>Wins</span>
                                    <span className='m-val val-win'>{winsCount}</span>
                                </div>
                                <div className='metric-mini-card'>
                                    <span className='m-label'>Losses</span>
                                    <span className='m-val val-loss'>{lossesCount}</span>
                                </div>
                            </div>

                            {/* Live Trade Execution Logs */}
                            <div className='panel-header' style={{ marginTop: '8px', marginBottom: '6px' }}>
                                <span className='panel-title' style={{ fontSize: '12px' }}>Live Order Stream</span>
                                <span style={{ fontSize: '10px', color: '#64748b' }}>{tradeLog.length} Executed</span>
                            </div>

                            <div className='live-trade-log-container'>
                                {tradeLog.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '16px', color: '#64748b', fontSize: '11px' }}>
                                        No trades executed yet. Start bot to begin trading.
                                    </div>
                                ) : (
                                    tradeLog.map(item => (
                                        <div key={item.id} className='log-item-row'>
                                            <div className='log-left'>
                                                <span>{item.time}</span>
                                                <strong style={{ color: item.contractType === 'DIGITUNDER' ? '#00e676' : '#ffb700' }}>
                                                    {item.contractType === 'DIGITUNDER' ? `U${item.prediction}` : `O${item.prediction}`}
                                                </strong>
                                                <span>${item.stake.toFixed(2)}</span>
                                            </div>
                                            <div className={`log-right ${item.result.toLowerCase()}`}>
                                                {item.result === 'WIN' ? `+$${item.profit.toFixed(2)}` : item.result === 'LOSS' ? `-$${item.stake.toFixed(2)}` : 'PENDING'}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── TAB 2: SIMPLE COMPOUNDING GENERATOR ── */}
                    {activeRightTab === 'COMPOUNDING' && (
                        <div className='glass-panel compounding-generator-section'>
                            <div className='compounding-inputs-grid'>
                                <div className='input-item'>
                                    <label>Starting Capital ($)</label>
                                    <div className='input-with-button'>
                                        <input
                                            type='number'
                                            value={startingCapital}
                                            onChange={e => setStartingCapital(e.target.value)}
                                        />
                                        <button onClick={handleFetchBalance} title='Fetch Deriv Balance'>
                                            Auto
                                        </button>
                                    </div>
                                </div>

                                <div className='input-item'>
                                    <label>Target Amount ($)</label>
                                    <input
                                        type='number'
                                        value={targetGoal}
                                        onChange={e => setTargetGoal(e.target.value)}
                                    />
                                </div>

                                <div className='input-item'>
                                    <label>Timeframe</label>
                                    <select
                                        value={compoundingMode}
                                        onChange={e => setCompoundingMode(e.target.value as any)}
                                    >
                                        <option value='HOURS'>Hourly Plan</option>
                                        <option value='DAYS'>Daily Plan</option>
                                    </select>
                                </div>

                                <div className='input-item'>
                                    <label>Number of {compoundingMode === 'HOURS' ? 'Hours' : 'Days'}</label>
                                    <input
                                        type='number'
                                        value={planPeriods}
                                        onChange={e => setPlanPeriods(e.target.value)}
                                    />
                                </div>

                                <div className='input-item' style={{ gridColumn: 'span 2' }}>
                                    <label>Profit % per {compoundingMode === 'HOURS' ? 'Hour' : 'Day'}</label>
                                    <input
                                        type='number'
                                        value={periodProfitPct}
                                        onChange={e => setPeriodProfitPct(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Plan Action Buttons */}
                            <div className='compounding-actions-row'>
                                <button className='btn-gen-plan' onClick={handleGenerateCompoundingPlan}>
                                    <Sparkles size={14} />
                                    <span>Generate Plan</span>
                                </button>
                                <button
                                    className='btn-reset-plan'
                                    onClick={() => {
                                        setStartingCapital('100.00');
                                        setPeriodProfitPct('7');
                                        setPlanPeriods('24');
                                        handleGenerateCompoundingPlan();
                                    }}
                                >
                                    <RotateCcw size={13} />
                                    <span>Reset</span>
                                </button>
                                <button className='btn-export-excel' onClick={handleExportToExcel} title='Export to Excel CSV'>
                                    <Download size={14} />
                                    <span>Excel</span>
                                </button>
                            </div>

                            {/* KPI Summary Banner */}
                            <div className='compounding-summary-banner'>
                                <div className='summary-kpi'>
                                    <span className='kpi-label'>Total Net Profit</span>
                                    <span className='kpi-value text-profit'>
                                        +${compoundingSummary.totalProfit.toFixed(2)}
                                    </span>
                                </div>
                                <div className='summary-kpi'>
                                    <span className='kpi-label'>Final Balance</span>
                                    <span className='kpi-value text-final'>
                                        ${compoundingSummary.finalBalance.toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            {/* Growth Projection Chart */}
                            <div className='growth-chart-wrapper'>
                                <svg viewBox='0 0 340 100' preserveAspectRatio='none'>
                                    <defs>
                                        <linearGradient id='growthGradient' x1='0' y1='0' x2='1' y2='0'>
                                            <stop offset='0%' stopColor='#00f5ff' />
                                            <stop offset='100%' stopColor='#00e676' />
                                        </linearGradient>
                                    </defs>
                                    {growthChartPath && (
                                        <path
                                            d={growthChartPath}
                                            fill='none'
                                            stroke='url(#growthGradient)'
                                            strokeWidth='2.5'
                                        />
                                    )}
                                </svg>
                            </div>

                            {/* Step-by-Step Schedule Table */}
                            <div className='compounding-table-wrapper'>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>✓</th>
                                            <th>Period</th>
                                            <th>Start</th>
                                            <th>Target</th>
                                            <th>End</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {compoundingPlan.map((step, idx) => (
                                            <tr
                                                key={step.step}
                                                className={step.completed ? 'completed-step' : ''}
                                            >
                                                <td>
                                                    <input
                                                        type='checkbox'
                                                        className='tick-checkbox'
                                                        checked={step.completed}
                                                        onChange={() => handleToggleStep(idx)}
                                                    />
                                                </td>
                                                <td>{step.label}</td>
                                                <td>${step.startingBalance.toFixed(2)}</td>
                                                <td style={{ color: '#00e676' }}>+${step.targetProfit.toFixed(2)}</td>
                                                <td>${step.endingBalance.toFixed(2)}</td>
                                                <td>
                                                    <button
                                                        className='target-btn'
                                                        onClick={() => handleTargetStep(step)}
                                                        title='Set session TP to this step'
                                                    >
                                                        Target
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
});

export default OverlordAi;
