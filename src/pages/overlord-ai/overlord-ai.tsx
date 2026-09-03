import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { api_base } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { buyContractForUi, streamContractUntilSettled } from '@/utils/trade-purchase';
import { safeSubscribe } from '@/utils/websocket-handler';
import {
    Activity,
    ArrowDownRight,
    ArrowUpRight,
    Award,
    BarChart2,
    Cpu,
    Crosshair,
    Download,
    Flame,
    Layers,
    LineChart,
    Maximize2,
    Minimize2,
    Play,
    Radio,
    RotateCcw,
    ShieldAlert,
    ShieldCheck,
    Sparkles,
    Square,
    Target,
    TrendingUp,
    Volume2,
    VolumeX,
    Wallet,
    Workflow,
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

export type OverlordStrategyMode =
    | 'OVER_1_UNDER_8'
    | 'OVER_2_UNDER_7'
    | 'OVER_3_UNDER_6'
    | 'ALL_AUTO';

export interface TradeLogItem {
    id: string;
    time: string;
    market: string;
    contractType: 'DIGITUNDER' | 'DIGITOVER';
    prediction: number;
    stake: number;
    result: 'WIN' | 'LOSS' | 'PENDING';
    profit: number;
    burstRunIndex?: number;
    burstTotalRuns?: number;
}

type AutoRunState =
    | 'IDLE'
    | 'SCANNING'
    | 'WAITING_SIGNAL'
    | 'WAITING_TRIGGER'
    | 'BURST_TRADING'
    | 'BURST_PAUSED'
    | 'TP_REACHED'
    | 'SL_REACHED'
    | 'PAUSED';

// Derived Synthetic Volatility Markets
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
const STORAGE_CONFIG_KEY = 'overlord_super_trader_config_v4';

// ─── Web Audio Sound Effects ──────────────────────────────────────────────────

const playSoundCue = (type: 'win' | 'loss' | 'signal' | 'burst_complete') => {
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
        } else if (type === 'burst_complete') {
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.3);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
            osc.start(now);
            osc.stop(now + 0.45);
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
    const scanAllMarkets = true;
    const [isWideViewOpen, setIsWideViewOpen] = useState<boolean>(false);
    const [marketSearchTerm, setMarketSearchTerm] = useState<string>('');
    const [autoPickBestMarket, setAutoPickBestMarket] = useState<boolean>(true);
    const [mobileActiveTab, setMobileActiveTab] = useState<
        'DASHBOARD' | 'AI_CONFIG' | 'MARKETS' | 'TRADES'
    >('DASHBOARD');

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

    // ── User Configuration & Strategy Parameters ──
    const [manualStake, setManualStake] = useState<string>('1.00');
    const [takeProfit, setTakeProfit] = useState<string>('20.00');
    const [stopLoss, setStopLoss] = useState<string>('50.00');
    const [strategyMode, setStrategyMode] = useState<OverlordStrategyMode>('ALL_AUTO');
    const [martingaleMultiplier, setMartingaleMultiplier] = useState<string>('2.5');
    const [isMartingaleEnabled, setIsMartingaleEnabled] = useState<boolean>(true);
    const maxMartingaleSteps = 4;
    const tickDuration = '1';

    // ── Continuous Burst Trading & Market Rotation ──
    const [burstRunSize, setBurstRunSize] = useState<number>(10); // 7 to 12 runs default: 10
    const [currentBurstRun, setCurrentBurstRun] = useState<number>(0);
    const [burstCountTotal, setBurstCountTotal] = useState<number>(0);
    const [marketRotationRuns, setMarketRotationRuns] = useState<number>(4); // Change market after 4 runs
    const [runsOnCurrentMarket, setRunsOnCurrentMarket] = useState<number>(0);
    const [isMarketRotationEnabled, setIsMarketRotationEnabled] = useState<boolean>(true);

    // ── Session State & Execution Engine ──
    const [botState, setBotState] = useState<AutoRunState>('IDLE');
    const [currentStake, setCurrentStake] = useState<number>(1.0);
    const [martingaleStage, setMartingaleStage] = useState<number>(0);
    const [isInRecovery, setIsInRecovery] = useState<boolean>(false);
    const [winsCount, setWinsCount] = useState<number>(0);
    const [lossesCount, setLossesCount] = useState<number>(0);
    const [sessionProfit, setSessionProfit] = useState<number>(0);
    const [tradeLog, setTradeLog] = useState<TradeLogItem[]>([]);
    const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
    const executionLockRef = useRef<boolean>(false);

    // Initial Manual Stake parse
    const initialBaseStake = useMemo(() => {
        const parsed = parseFloat(manualStake);
        return isNaN(parsed) || parsed <= 0 ? 1.0 : parsed;
    }, [manualStake]);

    // Throttle UI rerenders to maintain 60 FPS
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

    // ── Load & Persist Config ──
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_CONFIG_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.manualStake) setManualStake(parsed.manualStake);
                if (parsed.takeProfit) setTakeProfit(parsed.takeProfit);
                if (parsed.stopLoss) setStopLoss(parsed.stopLoss);
                if (parsed.strategyMode) setStrategyMode(parsed.strategyMode);
                if (parsed.martingaleMultiplier) setMartingaleMultiplier(parsed.martingaleMultiplier);
                if (parsed.isMartingaleEnabled !== undefined) setIsMartingaleEnabled(parsed.isMartingaleEnabled);
                if (parsed.burstRunSize) setBurstRunSize(parsed.burstRunSize);
                if (parsed.marketRotationRuns) setMarketRotationRuns(parsed.marketRotationRuns);
                if (parsed.isMarketRotationEnabled !== undefined) setIsMarketRotationEnabled(parsed.isMarketRotationEnabled);
                if (parsed.selectedSymbol) setSelectedSymbol(parsed.selectedSymbol);
            }
        } catch {
            /* ignore */
        }
    }, []);

    const saveConfigToStorage = useCallback(() => {
        try {
            const cfg = {
                manualStake,
                takeProfit,
                stopLoss,
                strategyMode,
                martingaleMultiplier,
                isMartingaleEnabled,
                burstRunSize,
                marketRotationRuns,
                isMarketRotationEnabled,
                selectedSymbol,
            };
            localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(cfg));
        } catch {
            /* ignore */
        }
    }, [
        manualStake,
        takeProfit,
        stopLoss,
        strategyMode,
        martingaleMultiplier,
        isMartingaleEnabled,
        burstRunSize,
        marketRotationRuns,
        isMarketRotationEnabled,
        selectedSymbol,
    ]);

    useEffect(() => {
        saveConfigToStorage();
    }, [saveConfigToStorage]);

    // ── WebSocket Tick Streaming ──
    useEffect(() => {
        isMountedRef.current = true;
        const activeSubs = subscriptionsRef.current;
        const symbolsToStream = scanAllMarkets
            ? DERIVED_SYNTHETIC_MARKETS.map(m => m.symbol)
            : [selectedSymbol];

        const subscribeSymbol = async (sym: string) => {
            if (activeSubs.has(sym)) return;
            try {
                const pip = DERIVED_SYNTHETIC_MARKETS.find(m => m.symbol === sym)?.pip || 2;

                // 1. Initial 100 ticks history
                const histRes = (await (api_base.api as any)?.send?.({
                    ticks_history: sym,
                    end: 'latest',
                    count: MAX_TICKS_STORED,
                    style: 'ticks',
                })) as any;

                if (isMountedRef.current && histRes?.history?.prices) {
                    const mData = marketsDataRef.current.get(sym);
                    if (mData) {
                        const prices = histRes.history.prices;
                        const digits = prices.map((p: any) => extractLastDigit(p, pip));
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
                await new Promise(r => setTimeout(r, 80));
            }
        };

        void initAllStreams();

        // Heartbeat Keepalive
        const keepaliveInterval = setInterval(() => {
            if (api_base?.api && typeof (api_base.api as any).send === 'function') {
                (api_base.api as any).send({ ping: 1 }).catch(() => {});
            }
        }, 25000);

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

    // ── Advanced Multi-Timeframe Pattern Engine ──
    const patternEngine = useMemo(() => {
        const last50 = currentMarket.digits.slice(-50);
        const total = last50.length || 1;

        // Breakdown: Low (0-4) vs High (5-9)
        const low04Count = last50.filter(d => d <= 4).length;
        const high59Count = last50.filter(d => d >= 5).length;
        const low04Pct = Math.round((low04Count / total) * 100);
        const high59Pct = Math.round((high59Count / total) * 100);

        // Sub-ranges for strategy evaluation:
        // Over 1 (digits 2-9) vs Under 8 (digits 0-7)
        const under8Count = last50.filter(d => d <= 7).length;
        const over1Count = last50.filter(d => d >= 2).length;
        const under8Pct = Math.round((under8Count / total) * 100);
        const over1Pct = Math.round((over1Count / total) * 100);

        // Over 2 (digits 3-9) vs Under 7 (digits 0-6)
        const under7Count = last50.filter(d => d <= 6).length;
        const over2Count = last50.filter(d => d >= 3).length;
        const under7Pct = Math.round((under7Count / total) * 100);
        const over2Pct = Math.round((over2Count / total) * 100);

        // Over 3 (digits 4-9) vs Under 6 (digits 0-5)
        const under6Count = last50.filter(d => d <= 5).length;
        const over3Count = last50.filter(d => d >= 4).length;
        const under6Pct = Math.round((under6Count / total) * 100);
        const over3Pct = Math.round((over3Count / total) * 100);

        // Momentum checks
        const last15 = currentMarket.digits.slice(-15);
        const prev15 = currentMarket.digits.slice(-30, -15);
        const last15Low = last15.filter(d => d <= 4).length;
        const prev15Low = prev15.filter(d => d <= 4).length;
        const isLowIncreasing = last15Low >= prev15Low;
        const isHighIncreasing = 15 - last15Low >= 15 - prev15Low;

        // Micro-confirmation: Last 10 & Last 7 Ticks
        const last10 = currentMarket.digits.slice(-10);
        const last10Low = last10.filter(d => d <= 4).length;
        const last10High = last10.filter(d => d >= 5).length;

        const last7 = currentMarket.digits.slice(-7);
        const last7Low = last7.filter(d => d <= 4).length;
        const last7High = last7.filter(d => d >= 5).length;

        // Ranked entry triggers
        const lowDigitsRanked = digitStats.filter(s => s.digit <= 4).sort((a, b) => b.count - a.count);
        const highDigitsRanked = digitStats.filter(s => s.digit >= 5).sort((a, b) => b.count - a.count);
        const topLowTrigger = lowDigitsRanked[0]?.digit ?? 2;
        const topHighTrigger = highDigitsRanked[0]?.digit ?? 7;

        // Strategy selection evaluation
        let signal: 'UNDER' | 'OVER' | 'NEUTRAL' = 'NEUTRAL';
        let targetBarrier = 8;
        let signalConfidence = 0;

        // Evaluate Strategy Modes:
        if (strategyMode === 'OVER_1_UNDER_8') {
            if (under8Pct >= 78 && isLowIncreasing && last10Low >= 6) {
                signal = 'UNDER';
                targetBarrier = 8;
                signalConfidence = Math.min(99, under8Pct + (last7Low >= 4 ? 8 : 3));
            } else if (over1Pct >= 78 && isHighIncreasing && last10High >= 6) {
                signal = 'OVER';
                targetBarrier = 1;
                signalConfidence = Math.min(99, over1Pct + (last7High >= 4 ? 8 : 3));
            } else {
                signalConfidence = Math.max(under8Pct, over1Pct);
            }
        } else if (strategyMode === 'OVER_2_UNDER_7') {
            if (under7Pct >= 70 && isLowIncreasing && last10Low >= 6) {
                signal = 'UNDER';
                targetBarrier = 7;
                signalConfidence = Math.min(98, under7Pct + (last7Low >= 4 ? 8 : 3));
            } else if (over2Pct >= 70 && isHighIncreasing && last10High >= 6) {
                signal = 'OVER';
                targetBarrier = 2;
                signalConfidence = Math.min(98, over2Pct + (last7High >= 4 ? 8 : 3));
            } else {
                signalConfidence = Math.max(under7Pct, over2Pct);
            }
        } else if (strategyMode === 'OVER_3_UNDER_6') {
            if (under6Pct >= 62 && isLowIncreasing && last10Low >= 6) {
                signal = 'UNDER';
                targetBarrier = 6;
                signalConfidence = Math.min(96, under6Pct + (last7Low >= 4 ? 8 : 3));
            } else if (over3Pct >= 62 && isHighIncreasing && last10High >= 6) {
                signal = 'OVER';
                targetBarrier = 3;
                signalConfidence = Math.min(96, over3Pct + (last7High >= 4 ? 8 : 3));
            } else {
                signalConfidence = Math.max(under6Pct, over3Pct);
            }
        } else {
            // ALL_AUTO: Dynamic Adaptive Engine
            // Check highest probability match across all barriers
            if (under8Pct >= 80 && isLowIncreasing && last10Low >= 6) {
                signal = 'UNDER';
                targetBarrier = 8;
                signalConfidence = Math.min(99, under8Pct + 6);
            } else if (over1Pct >= 80 && isHighIncreasing && last10High >= 6) {
                signal = 'OVER';
                targetBarrier = 1;
                signalConfidence = Math.min(99, over1Pct + 6);
            } else if (under7Pct >= 72 && isLowIncreasing && last10Low >= 6) {
                signal = 'UNDER';
                targetBarrier = 7;
                signalConfidence = Math.min(97, under7Pct + 5);
            } else if (over2Pct >= 72 && isHighIncreasing && last10High >= 6) {
                signal = 'OVER';
                targetBarrier = 2;
                signalConfidence = Math.min(97, over2Pct + 5);
            } else if (under6Pct >= 64 && isLowIncreasing && last10Low >= 6) {
                signal = 'UNDER';
                targetBarrier = 6;
                signalConfidence = Math.min(95, under6Pct + 4);
            } else if (over3Pct >= 64 && isHighIncreasing && last10High >= 6) {
                signal = 'OVER';
                targetBarrier = 3;
                signalConfidence = Math.min(95, over3Pct + 4);
            } else {
                signalConfidence = Math.max(under8Pct, over1Pct, under7Pct, over2Pct);
            }
        }

        // Trigger condition
        const isTriggerReady =
            signal === 'UNDER'
                ? currentMarket.lastDigit === topLowTrigger || currentMarket.lastDigit <= 4
                : signal === 'OVER'
                ? currentMarket.lastDigit === topHighTrigger || currentMarket.lastDigit >= 5
                : false;

        return {
            low04Pct,
            high59Pct,
            under8Pct,
            over1Pct,
            under7Pct,
            over2Pct,
            under6Pct,
            over3Pct,
            isLowIncreasing,
            isHighIncreasing,
            topLowTrigger,
            topHighTrigger,
            last10Low,
            last10High,
            last7Low,
            last7High,
            signal,
            targetBarrier,
            signalConfidence,
            isTriggerReady,
        };
    }, [currentMarket.digits, currentMarket.lastDigit, digitStats, strategyMode]);

    // ── Multi-Market Dynamic Scanner (Auto-Pick Best) ──
    const rankedMarketCandidates = useMemo(() => {
        const candidates: {
            symbol: string;
            label: string;
            score: number;
            bias: 'UNDER' | 'OVER' | 'BALANCED';
            optimalBarrier: number;
            lastDigit: number;
        }[] = [];

        marketsDataRef.current.forEach((mState, sym) => {
            if (mState.digits.length < 25) return;
            const last50 = mState.digits.slice(-50);
            const total = last50.length || 1;
            const u8 = last50.filter(d => d <= 7).length;
            const o1 = last50.filter(d => d >= 2).length;
            const u7 = last50.filter(d => d <= 6).length;
            const o2 = last50.filter(d => d >= 3).length;

            const u8Pct = Math.round((u8 / total) * 100);
            const o1Pct = Math.round((o1 / total) * 100);
            const u7Pct = Math.round((u7 / total) * 100);
            const o2Pct = Math.round((o2 / total) * 100);

            const maxUnder = Math.max(u8Pct, u7Pct);
            const maxOver = Math.max(o1Pct, o2Pct);
            const topScore = Math.max(maxUnder, maxOver);

            const bias = maxUnder > maxOver ? 'UNDER' : maxOver > maxUnder ? 'OVER' : 'BALANCED';
            const optimalBarrier =
                bias === 'UNDER' ? (u8Pct >= u7Pct ? 8 : 7) : o1Pct >= o2Pct ? 1 : 2;

            candidates.push({
                symbol: sym,
                label: mState.label,
                score: topScore,
                bias,
                optimalBarrier,
                lastDigit: mState.lastDigit,
            });
        });

        return candidates.sort((a, b) => b.score - a.score);
    }, [renderTrigger]);

    // Auto-switch to highest scoring market if enabled and not trading
    useEffect(() => {
        if (
            autoPickBestMarket &&
            botState !== 'BURST_TRADING' &&
            rankedMarketCandidates.length > 0 &&
            rankedMarketCandidates[0].symbol !== selectedSymbol &&
            rankedMarketCandidates[0].score >= 75
        ) {
            setSelectedSymbol(rankedMarketCandidates[0].symbol);
        }
    }, [autoPickBestMarket, rankedMarketCandidates, botState, selectedSymbol]);

    // ── Push Contracts to Deriv Drawer & Summary ──
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

    // ── Trade Log Management ──
    const addLogEntry = useCallback(
        (
            market: string,
            contractType: 'DIGITUNDER' | 'DIGITOVER',
            prediction: number,
            stake: number,
            result: 'WIN' | 'LOSS' | 'PENDING',
            profit: number,
            burstRunIndex?: number,
            burstTotalRuns?: number
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
                burstRunIndex,
                burstTotalRuns,
            };
            setTradeLog(prev => [item, ...prev.slice(0, 49)]);
            return item.id;
        },
        []
    );

    const updateLogResult = useCallback((id: string, result: 'WIN' | 'LOSS', profit: number) => {
        setTradeLog(prev => prev.map(item => (item.id === id ? { ...item, result, profit } : item)));
    }, []);

    // ── Single Trade Execution Function ──
    const executeSingleTrade = useCallback(
        async (
            market: string,
            contractType: 'DIGITUNDER' | 'DIGITOVER',
            barrier: number,
            stake: number,
            runIndex: number,
            totalRuns: number
        ) => {
            if (executionLockRef.current) return false;
            executionLockRef.current = true;
            setBotState('BURST_TRADING');
            if (soundEnabled) playSoundCue('signal');

            const logId = addLogEntry(
                market,
                contractType,
                barrier,
                stake,
                'PENDING',
                0,
                runIndex,
                totalRuns
            );

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
                const marketLabel =
                    DERIVED_SYNTHETIC_MARKETS.find(m => m.symbol === market)?.label || market;

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
                        const newP = p + profitVal;
                        return newP;
                    });

                    // Reset Martingale on win
                    setIsInRecovery(false);
                    setMartingaleStage(0);
                    setCurrentStake(initialBaseStake);
                } else {
                    if (soundEnabled) playSoundCue('loss');
                    updateLogResult(logId, 'LOSS', profitVal);
                    setLossesCount(l => l + 1);
                    setSessionProfit(p => {
                        const newP = p + profitVal;
                        return newP;
                    });

                    // Apply Martingale if enabled
                    if (isMartingaleEnabled && martingaleStage < maxMartingaleSteps) {
                        setIsInRecovery(true);
                        setMartingaleStage(s => s + 1);
                        const mult = parseFloat(martingaleMultiplier) || 2.5;
                        const nextStake = Math.round(stake * mult * 100) / 100;
                        setCurrentStake(nextStake);
                    } else {
                        // Max steps reached or fixed stake mode
                        setIsInRecovery(false);
                        setMartingaleStage(0);
                        setCurrentStake(initialBaseStake);
                    }
                }

                // Increment market runs counter
                setRunsOnCurrentMarket(r => r + 1);

                return isWin;
            } catch (err: any) {
                console.error('[OVERLORD AI] Trade execution failed:', err);
                updateLogResult(logId, 'LOSS', 0);
                return false;
            } finally {
                executionLockRef.current = false;
            }
        },
        [
            soundEnabled,
            addLogEntry,
            tickDuration,
            currency,
            pushContractToDrawer,
            updateLogResult,
            initialBaseStake,
            isMartingaleEnabled,
            martingaleStage,
            maxMartingaleSteps,
            martingaleMultiplier,
        ]
    );

    // ── Continuous Burst Trading & Automated Loop Engine ──
    useEffect(() => {
        if (
            botState === 'IDLE' ||
            botState === 'PAUSED' ||
            botState === 'TP_REACHED' ||
            botState === 'SL_REACHED' ||
            executionLockRef.current
        ) {
            return;
        }

        // 1. Take Profit / Stop Loss Guard Checks
        const tpVal = parseFloat(takeProfit);
        const slVal = parseFloat(stopLoss);

        if (!isNaN(tpVal) && tpVal > 0 && sessionProfit >= tpVal) {
            setBotState('TP_REACHED');
            if (soundEnabled) playSoundCue('burst_complete');
            return;
        }

        if (!isNaN(slVal) && slVal > 0 && sessionProfit <= -Math.abs(slVal)) {
            setBotState('SL_REACHED');
            if (soundEnabled) playSoundCue('loss');
            return;
        }

        // 2. Check if active in a Continuous Burst Streak (runs 1..burstRunSize)
        if (currentBurstRun > 0 && currentBurstRun < burstRunSize) {
            // In a continuous burst: trade next consecutive run immediately on trigger / active trend
            const nextRun = currentBurstRun + 1;
            const contractType = patternEngine.signal === 'OVER' ? 'DIGITOVER' : 'DIGITUNDER';
            const barrier = patternEngine.targetBarrier;
            const stakeToUse = isInRecovery ? currentStake : initialBaseStake;

            void (async () => {
                setCurrentBurstRun(nextRun);
                await executeSingleTrade(
                    selectedSymbol,
                    contractType,
                    barrier,
                    stakeToUse,
                    nextRun,
                    burstRunSize
                );

                // If this run completed the full burst streak (e.g. 10 of 10)
                if (nextRun >= burstRunSize) {
                    if (soundEnabled) playSoundCue('burst_complete');
                    setCurrentBurstRun(0);
                    setBurstCountTotal(b => b + 1);

                    // Pause briefly (3 seconds) for multi-market AI re-analysis
                    setBotState('BURST_PAUSED');
                    setAnalysisPauseTime(3);

                    // Market Rotation check:
                    if (
                        isMarketRotationEnabled &&
                        rankedMarketCandidates.length > 0 &&
                        (runsOnCurrentMarket >= marketRotationRuns ||
                            rankedMarketCandidates[0].symbol !== selectedSymbol)
                    ) {
                        const nextBest =
                            rankedMarketCandidates.find(c => c.symbol !== selectedSymbol) ||
                            rankedMarketCandidates[0];
                        if (nextBest && nextBest.score >= 70) {
                            setSelectedSymbol(nextBest.symbol);
                            setRunsOnCurrentMarket(0);
                        }
                    }

                    setTimeout(() => {
                        if (isMountedRef.current) {
                            setBotState(curr => (curr === 'BURST_PAUSED' ? 'WAITING_SIGNAL' : curr));
                        }
                    }, 3000);
                }
            })();
            return;
        }

        // 3. Waiting for High-Confidence Entry Signal to Trigger New Burst
        if (patternEngine.signal === 'NEUTRAL' || patternEngine.signalConfidence < 65) {
            if (botState !== 'WAITING_SIGNAL' && botState !== 'BURST_PAUSED') {
                setBotState('WAITING_SIGNAL');
            }
            return;
        }

        // 4. Signal detected -> Check trigger confirmation
        if (patternEngine.isTriggerReady) {
            const contractType = patternEngine.signal === 'OVER' ? 'DIGITOVER' : 'DIGITUNDER';
            const barrier = patternEngine.targetBarrier;
            const stakeToUse = isInRecovery ? currentStake : initialBaseStake;

            void (async () => {
                setCurrentBurstRun(1);
                await executeSingleTrade(
                    selectedSymbol,
                    contractType,
                    barrier,
                    stakeToUse,
                    1,
                    burstRunSize
                );
            })();
        } else {
            if (botState !== 'WAITING_TRIGGER' && botState !== 'BURST_PAUSED') {
                setBotState('WAITING_TRIGGER');
            }
        }
    }, [
        botState,
        currentBurstRun,
        burstRunSize,
        patternEngine,
        sessionProfit,
        takeProfit,
        stopLoss,
        soundEnabled,
        selectedSymbol,
        isInRecovery,
        currentStake,
        initialBaseStake,
        executeSingleTrade,
        isMarketRotationEnabled,
        runsOnCurrentMarket,
        marketRotationRuns,
        rankedMarketCandidates,
    ]);

    // ── 50-Digit Bezier Spline Chart Data ──
    const chartData = useMemo(() => {
        const last50 = currentMarket.digits.slice(-CHART_TICKS);
        const count = last50.length;
        if (count < 2) return { path: '', points: [], currentPoint: null, areaPath: '' };

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
        const areaPath =
            path && points.length > 1
                ? `${path} L ${currentPoint.x.toFixed(1)},175 L ${points[0].x.toFixed(1)},175 Z`
                : '';

        return { path, points, currentPoint, areaPath };
    }, [currentMarket.digits]);

    // ── Quick Controls & Handlers ──
    const handleStartBot = useCallback(() => {
        setBotState('WAITING_SIGNAL');
        setCurrentBurstRun(0);
        setIsInRecovery(false);
        setMartingaleStage(0);
        setCurrentStake(initialBaseStake);
        if (soundEnabled) playSoundCue('signal');
    }, [initialBaseStake, soundEnabled]);

    const handleStopBot = useCallback(() => {
        setBotState('PAUSED');
        setCurrentBurstRun(0);
        executionLockRef.current = false;
    }, []);

    const handleResetStats = useCallback(() => {
        setWinsCount(0);
        setLossesCount(0);
        setSessionProfit(0);
        setBurstCountTotal(0);
        setCurrentBurstRun(0);
        setRunsOnCurrentMarket(0);
        setTradeLog([]);
    }, []);

    const handleExportCSV = useCallback(() => {
        if (tradeLog.length === 0) return;
        const headers = 'ID,Time,Market,Contract,Barrier,Stake,Result,Profit\n';
        const rows = tradeLog
            .map(
                t =>
                    `${t.id},${t.time},${t.market},${t.contractType},${t.prediction},${t.stake},${t.result},${t.profit}`
            )
            .join('\n');
        const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `OVERLORD_AI_Trades_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [tradeLog]);

    const winRate = useMemo(() => {
        const total = winsCount + lossesCount;
        return total > 0 ? Math.round((winsCount / total) * 100) : 0;
    }, [winsCount, lossesCount]);

    // Quick Stake adjuster helper
    const handleAddStake = (delta: number) => {
        const curr = parseFloat(manualStake) || 1.0;
        const next = Math.max(0.35, Math.round((curr + delta) * 100) / 100);
        setManualStake(next.toFixed(2));
    };

    return (
        <div className={`overlord-ai-wrapper ${isWideViewOpen ? 'wide-view-active' : ''}`}>
            {/* ── Top Header & HUD ── */}
            <header className='overlord-top-bar'>
                <div className='brand-section'>
                    <div className='brand-icon-box'>
                        <Zap size={26} className='brand-pulse-icon' />
                    </div>
                    <div className='brand-info'>
                        <div className='brand-title-row'>
                            <h1 className='brand-title'>OVERLORD AI 👑</h1>
                            <span className='version-tag'>v4.0 QUANTUM MATRIX</span>
                            <span className='mode-badge'>
                                {strategyMode === 'OVER_1_UNDER_8' && '⚡ OVER 1 / UNDER 8'}
                                {strategyMode === 'OVER_2_UNDER_7' && '🛡️ OVER 2 / UNDER 7'}
                                {strategyMode === 'OVER_3_UNDER_6' && '🎯 OVER 3 / UNDER 6'}
                                {strategyMode === 'ALL_AUTO' && '🤖 ALL AUTO-ADAPTIVE'}
                            </span>
                        </div>
                        <p className='brand-subtitle'>
                            Autonomous Pattern Recognition • Continuous Burst Execution (7-12 Runs) • Dynamic Market Rotation
                        </p>
                    </div>
                </div>

                <div className='top-metrics-cluster'>
                    {/* Live Balance Card */}
                    <div className='cyber-metric-card balance-card'>
                        <div className='metric-label-row'>
                            <Wallet size={14} className='metric-icon' />
                            <span>BALANCE</span>
                            <span className={`acc-type-pill ${client?.is_virtual ? 'demo' : 'real'}`}>
                                {client?.is_virtual ? 'DEMO' : 'REAL'}
                            </span>
                        </div>
                        <div className='metric-value-row'>
                            <span className='currency-prefix'>{currency}</span>
                            <span className='balance-number'>{rawBalance.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Session Net Profit Card */}
                    <div
                        className={`cyber-metric-card pnl-card ${
                            sessionProfit > 0 ? 'profit' : sessionProfit < 0 ? 'loss' : ''
                        }`}
                    >
                        <div className='metric-label-row'>
                            <TrendingUp size={14} className='metric-icon' />
                            <span>SESSION P&amp;L</span>
                        </div>
                        <div className='metric-value-row'>
                            <span className='pnl-number'>
                                {sessionProfit >= 0 ? `+${sessionProfit.toFixed(2)}` : sessionProfit.toFixed(2)}{' '}
                                {currency}
                            </span>
                        </div>
                    </div>

                    {/* Win Rate & Burst Stats */}
                    <div className='cyber-metric-card winrate-card'>
                        <div className='metric-label-row'>
                            <Award size={14} className='metric-icon' />
                            <span>WIN RATE</span>
                        </div>
                        <div className='metric-value-row'>
                            <span className='winrate-pct'>{winRate}%</span>
                            <span className='win-loss-split'>
                                ({winsCount}W - {lossesCount}L)
                            </span>
                        </div>
                    </div>

                    {/* Header Action Tools */}
                    <div className='header-tools'>
                        <button
                            className={`tool-btn ${soundEnabled ? 'active' : ''}`}
                            onClick={() => setSoundEnabled(s => !s)}
                            title='Toggle Sound FX'
                        >
                            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                        </button>
                        <button
                            className='tool-btn'
                            onClick={handleResetStats}
                            title='Reset Session Metrics'
                        >
                            <RotateCcw size={16} />
                        </button>
                        <button
                            className={`tool-btn ${isWideViewOpen ? 'active' : ''}`}
                            onClick={() => setIsWideViewOpen(w => !w)}
                            title='Toggle Ultrawide Mode'
                        >
                            {isWideViewOpen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Mobile Navigation Tabs ── */}
            <div className='overlord-mobile-nav'>
                <button
                    className={`mobile-tab-btn ${mobileActiveTab === 'DASHBOARD' ? 'active' : ''}`}
                    onClick={() => setMobileActiveTab('DASHBOARD')}
                >
                    <LineChart size={16} />
                    <span>DASHBOARD</span>
                </button>
                <button
                    className={`mobile-tab-btn ${mobileActiveTab === 'AI_CONFIG' ? 'active' : ''}`}
                    onClick={() => setMobileActiveTab('AI_CONFIG')}
                >
                    <Cpu size={16} />
                    <span>AI TRADER</span>
                </button>
                <button
                    className={`mobile-tab-btn ${mobileActiveTab === 'MARKETS' ? 'active' : ''}`}
                    onClick={() => setMobileActiveTab('MARKETS')}
                >
                    <Layers size={16} />
                    <span>MARKETS</span>
                </button>
                <button
                    className={`mobile-tab-btn ${mobileActiveTab === 'TRADES' ? 'active' : ''}`}
                    onClick={() => setMobileActiveTab('TRADES')}
                >
                    <Activity size={16} />
                    <span>LOGS ({tradeLog.length})</span>
                </button>
            </div>

            {/* ── Top Control Ribbon ── */}
            <div className='overlord-controls-ribbon'>
                {/* 1. Strategy Selector */}
                <div className='control-group strategy-selector-group'>
                    <label className='control-label'>
                        <Cpu size={14} />
                        <span>AI STRATEGY MODE</span>
                    </label>
                    <div className='strategy-pills-row'>
                        <button
                            className={`strategy-pill ${strategyMode === 'OVER_1_UNDER_8' ? 'active' : ''}`}
                            onClick={() => setStrategyMode('OVER_1_UNDER_8')}
                        >
                            <span className='pill-title'>Over 1 / Under 8</span>
                            <span className='pill-sub'>~90% Win Rate</span>
                        </button>
                        <button
                            className={`strategy-pill ${strategyMode === 'OVER_2_UNDER_7' ? 'active' : ''}`}
                            onClick={() => setStrategyMode('OVER_2_UNDER_7')}
                        >
                            <span className='pill-title'>Over 2 / Under 7</span>
                            <span className='pill-sub'>~80% Balanced</span>
                        </button>
                        <button
                            className={`strategy-pill ${strategyMode === 'OVER_3_UNDER_6' ? 'active' : ''}`}
                            onClick={() => setStrategyMode('OVER_3_UNDER_6')}
                        >
                            <span className='pill-title'>Over 3 / Under 6</span>
                            <span className='pill-sub'>~70% High Yield</span>
                        </button>
                        <button
                            className={`strategy-pill auto-pill ${strategyMode === 'ALL_AUTO' ? 'active' : ''}`}
                            onClick={() => setStrategyMode('ALL_AUTO')}
                        >
                            <Sparkles size={14} className='sparkle-icon' />
                            <span className='pill-title'>ALL AUTO-ADAPT</span>
                            <span className='pill-sub'>AI Dynamic Choice</span>
                        </button>
                    </div>
                </div>

                {/* 2. Manual Stake & Risk Controls */}
                <div className='control-group inputs-cluster-group'>
                    <div className='input-box-unit'>
                        <label className='control-label'>
                            <Target size={14} />
                            <span>STAKE ({currency})</span>
                        </label>
                        <div className='stake-input-container'>
                            <input
                                type='number'
                                step='0.5'
                                min='0.35'
                                value={manualStake}
                                onChange={e => setManualStake(e.target.value)}
                                className='cyber-text-input'
                                placeholder='1.00'
                            />
                            <div className='quick-stake-pills'>
                                <button type='button' onClick={() => handleAddStake(1)}>+1</button>
                                <button type='button' onClick={() => handleAddStake(5)}>+5</button>
                                <button type='button' onClick={() => handleAddStake(10)}>+10</button>
                                <button type='button' onClick={() => setManualStake('1.00')}>$1</button>
                            </div>
                        </div>
                    </div>

                    <div className='input-box-unit'>
                        <label className='control-label'>
                            <ShieldCheck size={14} className='tp-icon' />
                            <span>TAKE PROFIT ({currency})</span>
                        </label>
                        <input
                            type='number'
                            step='5'
                            min='1'
                            value={takeProfit}
                            onChange={e => setTakeProfit(e.target.value)}
                            className='cyber-text-input tp-input'
                            placeholder='20.00'
                        />
                    </div>

                    <div className='input-box-unit'>
                        <label className='control-label'>
                            <ShieldAlert size={14} className='sl-icon' />
                            <span>STOP LOSS ({currency})</span>
                        </label>
                        <input
                            type='number'
                            step='10'
                            min='1'
                            value={stopLoss}
                            onChange={e => setStopLoss(e.target.value)}
                            className='cyber-text-input sl-input'
                            placeholder='50.00'
                        />
                    </div>

                    <div className='input-box-unit'>
                        <label className='control-label'>
                            <Workflow size={14} />
                            <span>BURST SIZE (RUNS)</span>
                        </label>
                        <div className='burst-stepper'>
                            <select
                                value={burstRunSize}
                                onChange={e => setBurstRunSize(Number(e.target.value))}
                                className='cyber-select-input'
                            >
                                <option value={5}>5 Continuous Runs</option>
                                <option value={7}>7 Continuous Runs</option>
                                <option value={8}>8 Continuous Runs</option>
                                <option value={10}>10 Continuous Runs (Recommended)</option>
                                <option value={12}>12 Continuous Runs</option>
                                <option value={15}>15 Continuous Runs</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* 3. Primary Execution Trigger Buttons */}
                <div className='control-group action-trigger-group'>
                    {botState === 'IDLE' ||
                    botState === 'PAUSED' ||
                    botState === 'TP_REACHED' ||
                    botState === 'SL_REACHED' ? (
                        <button className='btn-overlord-start' onClick={handleStartBot}>
                            <Play size={20} className='btn-play-icon' />
                            <div className='btn-text-block'>
                                <span className='btn-main-label'>START OVERLORD AUTOTRADE</span>
                                <span className='btn-sub-label'>
                                    {strategyMode} • {burstRunSize} RUNS BURST
                                </span>
                            </div>
                        </button>
                    ) : (
                        <button className='btn-overlord-stop' onClick={handleStopBot}>
                            <Square size={20} />
                            <div className='btn-text-block'>
                                <span className='btn-main-label'>STOP AUTOTRADE</span>
                                <span className='btn-sub-label'>Halt Continuous Execution</span>
                            </div>
                        </button>
                    )}
                </div>
            </div>

            {/* ── Main Dashboard Layout ── */}
            <div className='overlord-main-layout'>
                {/* ── Left Sidebar: Market Scanner ── */}
                <aside
                    className={`overlord-side-scanner ${
                        mobileActiveTab === 'MARKETS' ? 'mobile-active' : ''
                    }`}
                >
                    <div className='scanner-header'>
                        <div className='scanner-title-row'>
                            <Radio size={16} className='radar-pulse-icon' />
                            <h3>ACTIVE MARKETS</h3>
                        </div>
                        <div className='scanner-options'>
                            <label className='checkbox-label'>
                                <input
                                    type='checkbox'
                                    checked={autoPickBestMarket}
                                    onChange={e => setAutoPickBestMarket(e.target.checked)}
                                />
                                <span>Auto-Rotate</span>
                            </label>
                        </div>
                    </div>

                    <div className='scanner-search-box'>
                        <input
                            type='text'
                            placeholder='Filter markets (e.g. 100, R_10)...'
                            value={marketSearchTerm}
                            onChange={e => setMarketSearchTerm(e.target.value)}
                            className='scanner-search-input'
                        />
                    </div>

                    <div className='markets-list-scroll'>
                        {rankedMarketCandidates
                            .filter(
                                m =>
                                    m.label.toLowerCase().includes(marketSearchTerm.toLowerCase()) ||
                                    m.symbol.toLowerCase().includes(marketSearchTerm.toLowerCase())
                            )
                            .map(mCandidate => {
                                const isSelected = mCandidate.symbol === selectedSymbol;
                                return (
                                    <div
                                        key={mCandidate.symbol}
                                        className={`market-card-item ${isSelected ? 'selected' : ''}`}
                                        onClick={() => setSelectedSymbol(mCandidate.symbol)}
                                    >
                                        <div className='market-card-left'>
                                            <div className='market-symbol-row'>
                                                <span className='market-label'>{mCandidate.label}</span>
                                                {isSelected && <span className='active-indicator'>ACTIVE</span>}
                                            </div>
                                            <div className='market-bias-badge'>
                                                {mCandidate.bias === 'UNDER' && (
                                                    <span className='bias-pill under'>
                                                        <ArrowDownRight size={12} /> Under {mCandidate.optimalBarrier}
                                                    </span>
                                                )}
                                                {mCandidate.bias === 'OVER' && (
                                                    <span className='bias-pill over'>
                                                        <ArrowUpRight size={12} /> Over {mCandidate.optimalBarrier}
                                                    </span>
                                                )}
                                                {mCandidate.bias === 'BALANCED' && (
                                                    <span className='bias-pill neutral'>Balanced</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className='market-card-right'>
                                            <div className='market-conf-score'>{mCandidate.score}%</div>
                                            <div className='last-digit-bubble'>{mCandidate.lastDigit}</div>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </aside>

                {/* ── Center Content: Live Digit Wave Chart & Deep AI Analytics ── */}
                <main
                    className={`overlord-center-content ${
                        mobileActiveTab === 'DASHBOARD' ? 'mobile-active' : ''
                    }`}
                >
                    {/* Active Market HUD Strip */}
                    <div className='active-market-hud-strip'>
                        <div className='hud-left'>
                            <span className='hud-symbol'>{currentMarket.label}</span>
                            <span className='hud-price'>{currentMarket.currentPrice}</span>
                            <span className='hud-digit-badge'>L-DIGIT: {currentMarket.lastDigit}</span>
                        </div>
                        <div className='hud-right'>
                            <div className='hud-signal-box'>
                                <span className='signal-title'>AI SIGNAL:</span>
                                <span className={`signal-badge ${patternEngine.signal.toLowerCase()}`}>
                                    {patternEngine.signal === 'UNDER' && `UNDER ${patternEngine.targetBarrier}`}
                                    {patternEngine.signal === 'OVER' && `OVER ${patternEngine.targetBarrier}`}
                                    {patternEngine.signal === 'NEUTRAL' && 'SCANNING PATTERNS...'}
                                </span>
                                <span className='confidence-text'>
                                    {patternEngine.signalConfidence}% CONFIDENCE
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* 50-Digit Bezier Wave Spline Chart */}
                    <div className='chart-container-card'>
                        <div className='chart-card-header'>
                            <div className='chart-title-group'>
                                <LineChart size={16} />
                                <h4>50-DIGIT LIVE TRAJECTORY</h4>
                            </div>
                            <div className='chart-legend'>
                                <span className='legend-item high'>● Over (5-9)</span>
                                <span className='legend-item low'>● Under (0-4)</span>
                            </div>
                        </div>

                        <div className='svg-chart-wrapper'>
                            <svg viewBox='0 0 600 180' className='digit-spline-svg' preserveAspectRatio='none'>
                                <defs>
                                    <linearGradient id='waveGradient' x1='0' y1='0' x2='0' y2='1'>
                                        <stop offset='0%' stopColor='#00f5ff' stopOpacity='0.35' />
                                        <stop offset='100%' stopColor='#00f5ff' stopOpacity='0.0' />
                                    </linearGradient>
                                </defs>

                                {/* Grid Guide Lines */}
                                {[0, 2, 4, 6, 8].map(d => {
                                    const y = 180 - 20 - (d / 9) * (180 - 40);
                                    return (
                                        <g key={d}>
                                            <line x1='24' y1={y} x2='576' y2={y} stroke='rgba(255,255,255,0.06)' strokeDasharray='4,4' />
                                            <text x='8' y={y + 3} fill='rgba(255,255,255,0.3)' fontSize='9'>
                                                {d}
                                            </text>
                                        </g>
                                    );
                                })}

                                {/* Spline Fill & Stroke */}
                                {chartData.areaPath && <path d={chartData.areaPath} fill='url(#waveGradient)' />}
                                {chartData.path && (
                                    <path
                                        d={chartData.path}
                                        fill='none'
                                        stroke='#00f5ff'
                                        strokeWidth='2.5'
                                        strokeLinecap='round'
                                    />
                                )}

                                {/* Data Nodes */}
                                {chartData.points.map((pt, idx) => (
                                    <circle
                                        key={idx}
                                        cx={pt.x}
                                        cy={pt.y}
                                        r={idx === chartData.points.length - 1 ? 5 : 2.5}
                                        fill={pt.digit >= 5 ? '#00e676' : '#ff3d71'}
                                        stroke='#0d1629'
                                        strokeWidth='1'
                                        className={idx === chartData.points.length - 1 ? 'active-pulse-node' : ''}
                                    />
                                ))}
                            </svg>
                        </div>
                    </div>

                    {/* 0-9 Digit Spectrum & Heatmap Bar Visualizer */}
                    <div className='digit-spectrum-card'>
                        <div className='spectrum-header'>
                            <BarChart2 size={16} />
                            <h4>DIGIT FREQUENCY SPECTRUM (LAST 50 TICKS)</h4>
                        </div>
                        <div className='spectrum-bars-grid'>
                            {digitStats.map(stat => {
                                const isHot = stat.rank <= 3;
                                const isCold = stat.rank >= 8;
                                const isLatest = currentMarket.lastDigit === stat.digit;
                                return (
                                    <div
                                        key={stat.digit}
                                        className={`spectrum-bar-item ${isHot ? 'hot' : ''} ${
                                            isCold ? 'cold' : ''
                                        } ${isLatest ? 'latest-digit' : ''}`}
                                    >
                                        <div className='bar-meta-top'>
                                            <span className='digit-num'>{stat.digit}</span>
                                            <span className='rank-badge'>#{stat.rank}</span>
                                        </div>
                                        <div className='bar-track'>
                                            <div
                                                className='bar-fill'
                                                style={{ height: `${Math.min(100, stat.percentage * 3.5)}%` }}
                                            />
                                        </div>
                                        <div className='bar-meta-bottom'>
                                            <span className='pct-text'>{stat.percentage}%</span>
                                            <span className='trend-arrow'>
                                                {stat.isIncreasing ? '▲' : '▼'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* AI Pattern Recognition Matrix */}
                    <div className='pattern-matrix-card'>
                        <div className='matrix-header'>
                            <Cpu size={16} />
                            <h4>NEURAL PATTERN ANALYSIS ENGINE</h4>
                        </div>

                        <div className='matrix-quad-grid'>
                            {/* Quad 1: Under 0-4 vs Over 5-9 */}
                            <div className='quad-box'>
                                <div className='quad-title'>0-4 (UNDER) vs 5-9 (OVER)</div>
                                <div className='quad-ratio-bar'>
                                    <div
                                        className='ratio-segment under'
                                        style={{ width: `${patternEngine.low04Pct}%` }}
                                    >
                                        {patternEngine.low04Pct}%
                                    </div>
                                    <div
                                        className='ratio-segment over'
                                        style={{ width: `${patternEngine.high59Pct}%` }}
                                    >
                                        {patternEngine.high59Pct}%
                                    </div>
                                </div>
                                <div className='quad-footer'>
                                    <span>Low Momentum: {patternEngine.isLowIncreasing ? '🟢 Bullish' : '🔴 Fading'}</span>
                                </div>
                            </div>

                            {/* Quad 2: Strategy Optimal Probability */}
                            <div className='quad-box'>
                                <div className='quad-title'>THRESHOLD PROBABILITIES</div>
                                <div className='threshold-metrics-list'>
                                    <div className='threshold-row'>
                                        <span>Under 8: <strong>{patternEngine.under8Pct}%</strong></span>
                                        <span>Over 1: <strong>{patternEngine.over1Pct}%</strong></span>
                                    </div>
                                    <div className='threshold-row'>
                                        <span>Under 7: <strong>{patternEngine.under7Pct}%</strong></span>
                                        <span>Over 2: <strong>{patternEngine.over2Pct}%</strong></span>
                                    </div>
                                </div>
                            </div>

                            {/* Quad 3: Micro Confirmation Ticks */}
                            <div className='quad-box'>
                                <div className='quad-title'>MICRO-CONFIRMATION RADAR</div>
                                <div className='radar-stats-list'>
                                    <div className='radar-stat-item'>
                                        <span>Last 10 Ticks (Low 0-4):</span>
                                        <span className='val'>{patternEngine.last10Low} / 10</span>
                                    </div>
                                    <div className='radar-stat-item'>
                                        <span>Last 7 Ticks (Low 0-4):</span>
                                        <span className='val'>{patternEngine.last7Low} / 7</span>
                                    </div>
                                </div>
                            </div>

                            {/* Quad 4: Best Entry Trigger Digits */}
                            <div className='quad-box'>
                                <div className='quad-title'>KEY ENTRY TRIGGER DIGITS</div>
                                <div className='trigger-badges-row'>
                                    <div className='trigger-pill under'>
                                        <span className='t-label'>Under Trigger:</span>
                                        <span className='t-digit'>{patternEngine.topLowTrigger}</span>
                                    </div>
                                    <div className='trigger-pill over'>
                                        <span className='t-label'>Over Trigger:</span>
                                        <span className='t-digit'>{patternEngine.topHighTrigger}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>

                {/* ── Right Panel: Live Burst Monitor & Trade Log ── */}
                <aside
                    className={`overlord-right-panel ${
                        mobileActiveTab === 'AI_CONFIG' || mobileActiveTab === 'TRADES'
                            ? 'mobile-active'
                            : ''
                    }`}
                >
                    {/* Live Burst Execution Monitor Card */}
                    <div className='burst-monitor-card'>
                        <div className='burst-header'>
                            <div className='burst-title-row'>
                                <Flame size={18} className='burst-flame-icon' />
                                <h4>CONTINUOUS BURST EXECUTION</h4>
                            </div>
                            <span
                                className={`burst-status-badge ${
                                    botState === 'BURST_TRADING'
                                        ? 'trading'
                                        : botState === 'BURST_PAUSED'
                                        ? 'paused'
                                        : botState === 'TP_REACHED'
                                        ? 'tp-hit'
                                        : botState === 'SL_REACHED'
                                        ? 'sl-hit'
                                        : 'idle'
                                }`}
                            >
                                {botState === 'BURST_TRADING' && `BURST RUN ${currentBurstRun}/${burstRunSize}`}
                                {botState === 'BURST_PAUSED' && 'PAUSED (AI RE-ANALYSIS)'}
                                {botState === 'WAITING_SIGNAL' && 'WAITING SIGNAL'}
                                {botState === 'WAITING_TRIGGER' && 'TRIGGER ARMED'}
                                {botState === 'TP_REACHED' && '🎯 TAKE PROFIT HIT!'}
                                {botState === 'SL_REACHED' && '🛑 STOP LOSS HIT!'}
                                {botState === 'IDLE' && 'IDLE'}
                                {botState === 'PAUSED' && 'PAUSED'}
                            </span>
                        </div>

                        {/* Burst Progress Bar */}
                        <div className='burst-progress-container'>
                            <div className='burst-progress-labels'>
                                <span>Burst Streak Progress</span>
                                <span>
                                    {currentBurstRun} / {burstRunSize} Runs
                                </span>
                            </div>
                            <div className='burst-progress-track'>
                                <div
                                    className='burst-progress-fill'
                                    style={{
                                        width: `${(currentBurstRun / Math.max(1, burstRunSize)) * 100}%`,
                                    }}
                                />
                            </div>
                        </div>

                        {/* Risk / TP & SL Progress Meters */}
                        <div className='risk-meters-dual'>
                            <div className='risk-meter-box tp'>
                                <div className='meter-header'>
                                    <span>Target Take Profit</span>
                                    <span>+${takeProfit}</span>
                                </div>
                                <div className='meter-bar'>
                                    <div
                                        className='meter-fill tp-fill'
                                        style={{
                                            width: `${Math.min(
                                                100,
                                                Math.max(
                                                    0,
                                                    (sessionProfit / Math.max(1, parseFloat(takeProfit))) * 100
                                                )
                                            )}%`,
                                        }}
                                    />
                                </div>
                            </div>

                            <div className='risk-meter-box sl'>
                                <div className='meter-header'>
                                    <span>Stop Loss Guard</span>
                                    <span>-${stopLoss}</span>
                                </div>
                                <div className='meter-bar'>
                                    <div
                                        className='meter-fill sl-fill'
                                        style={{
                                            width: `${Math.min(
                                                100,
                                                Math.max(
                                                    0,
                                                    (Math.abs(Math.min(0, sessionProfit)) /
                                                        Math.max(1, parseFloat(stopLoss))) *
                                                        100
                                                )
                                            )}%`,
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Money Management Info */}
                        <div className='money-mgmt-strip'>
                            <div className='mgmt-stat'>
                                <span className='label'>Next Stake:</span>
                                <span className='val'>${currentStake.toFixed(2)}</span>
                            </div>
                            <div className='mgmt-stat'>
                                <span className='label'>Martingale:</span>
                                <span className='val'>
                                    {isMartingaleEnabled
                                        ? `${martingaleMultiplier}x (Stage ${martingaleStage}/${maxMartingaleSteps})`
                                        : 'Fixed Stake'}
                                </span>
                            </div>
                            <div className='mgmt-stat'>
                                <span className='label'>Total Bursts:</span>
                                <span className='val'>{burstCountTotal} Completed</span>
                            </div>
                        </div>
                    </div>

                    {/* Live Trade Journal & Stream */}
                    <div className='trade-journal-card'>
                        <div className='journal-header'>
                            <div className='journal-title-row'>
                                <Activity size={16} />
                                <h4>LIVE TRADE STREAM</h4>
                            </div>
                            {tradeLog.length > 0 && (
                                <button className='btn-export-csv' onClick={handleExportCSV}>
                                    <Download size={14} /> Export CSV
                                </button>
                            )}
                        </div>

                        <div className='trade-logs-scroll'>
                            {tradeLog.length === 0 ? (
                                <div className='empty-logs-placeholder'>
                                    <Crosshair size={28} className='empty-icon' />
                                    <p>Ready to trade. Start OVERLORD to execute AI pattern bursts.</p>
                                </div>
                            ) : (
                                tradeLog.map(log => (
                                    <div key={log.id} className={`trade-log-entry ${log.result.toLowerCase()}`}>
                                        <div className='log-left'>
                                            <span className='log-time'>{log.time}</span>
                                            <span className='log-market'>{log.market}</span>
                                            <span className='log-contract'>
                                                {log.contractType === 'DIGITOVER' ? 'Over' : 'Under'} {log.prediction}
                                            </span>
                                            {log.burstRunIndex && (
                                                <span className='log-burst-pill'>
                                                    Run {log.burstRunIndex}/{log.burstTotalRuns}
                                                </span>
                                            )}
                                        </div>
                                        <div className='log-right'>
                                            <span className='log-stake'>${log.stake.toFixed(2)}</span>
                                            <span className={`log-result-badge ${log.result.toLowerCase()}`}>
                                                {log.result === 'WIN' && `+${log.profit.toFixed(2)}`}
                                                {log.result === 'LOSS' && `-${log.stake.toFixed(2)}`}
                                                {log.result === 'PENDING' && 'PENDING...'}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
});

export default OverlordAi;
