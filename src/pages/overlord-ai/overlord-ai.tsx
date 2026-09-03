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

// ─── Type Definitions ─────────────────────────────────────────────────────────

export type OverlordStrategyMode =
    | 'OVER_1_UNDER_8'
    | 'OVER_2_UNDER_7'
    | 'OVER_3_UNDER_6'
    | 'ALL_AUTO';

export type AutoRunState =
    | 'IDLE'
    | 'WAITING_SIGNAL'
    | 'WAITING_TRIGGER'
    | 'BURST_TRADING'
    | 'BURST_PAUSED'
    | 'TP_REACHED'
    | 'SL_REACHED'
    | 'PAUSED';

export interface MarketDigitState {
    symbol: string;
    label: string;
    digits: number[];
    currentPrice: string;
    lastDigit: number;
    pip: number;
}

export interface TradeLogItem {
    id: string;
    timestamp: number;
    symbol: string;
    contractType: 'DIGITOVER' | 'DIGITUNDER';
    barrier: number;
    stake: number;
    result: 'WIN' | 'LOSS' | 'PENDING';
    profit: number;
    exitDigit?: number;
    burstRunIndex?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DERIVED_SYNTHETIC_MARKETS = [
    { symbol: '1HZ100V', label: 'Volatility 100 (1s) Index', pip: 2 },
    { symbol: '1HZ10V', label: 'Volatility 10 (1s) Index', pip: 2 },
    { symbol: '1HZ25V', label: 'Volatility 25 (1s) Index', pip: 2 },
    { symbol: '1HZ50V', label: 'Volatility 50 (1s) Index', pip: 2 },
    { symbol: '1HZ75V', label: 'Volatility 75 (1s) Index', pip: 2 },
    { symbol: 'R_100', label: 'Volatility 100 Index', pip: 2 },
    { symbol: 'R_10', label: 'Volatility 10 Index', pip: 3 },
    { symbol: 'R_25', label: 'Volatility 25 Index', pip: 3 },
    { symbol: 'R_50', label: 'Volatility 50 Index', pip: 4 },
    { symbol: 'R_75', label: 'Volatility 75 Index', pip: 4 },
];

const MAX_HISTORY_TICKS = 1000;
const CHART_TICKS = 50;

// Sound Synthesizer for Audio Feedback
const playSoundCue = (type: 'win' | 'loss' | 'start' | 'burst_complete' | 'alert') => {
    try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        if (type === 'win') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
            osc.frequency.setValueAtTime(880.0, ctx.currentTime + 0.1); // A5
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            osc.start();
            osc.stop(ctx.currentTime + 0.35);
        } else if (type === 'loss') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(320, ctx.currentTime);
            osc.frequency.setValueAtTime(180, ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.start();
            osc.stop(ctx.currentTime + 0.4);
        } else if (type === 'start') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08);
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.16);
            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } else if (type === 'burst_complete') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(523.25, ctx.currentTime);
            osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
            osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2);
            osc.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.start();
            osc.stop(ctx.currentTime + 0.5);
        }
    } catch {
        // AudioContext not allowed or disabled
    }
};

// Bezier Spline Path Generator for Smooth Wave Curve
const getBezierSplinePath = (points: { x: number; y: number }[]): string => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = i > 0 ? points[i - 1] : points[0];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = i != points.length - 2 ? points[i + 2] : p2;
        const cpX1 = p1.x + (p2.x - p0.x) / 6;
        const cpY1 = p1.y + (p2.y - p0.y) / 6;
        const cpX2 = p2.x - (p3.x - p1.x) / 6;
        const cpY2 = p2.y - (p3.y - p1.y) / 6;
        d += ` C ${cpX1.toFixed(1)},${cpY1.toFixed(1)} ${cpX2.toFixed(1)},${cpY2.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
};

// Digit Extraction Helper
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
        'DASHBOARD' | 'AUTOTRADER' | 'MARKETS' | 'TRADES'
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

    // Throttle UI rerenders for maximum frame-rate
    const throttleRender = useCallback(() => {
        if (!throttleTimerRef.current) {
            throttleTimerRef.current = setTimeout(() => {
                throttleTimerRef.current = null;
                if (isMountedRef.current) {
                    setRenderTrigger(prev => prev + 1);
                }
            }, 120);
        }
    }, []);

    // ── WebSocket Tick Ingestion ──
    useEffect(() => {
        isMountedRef.current = true;
        const activeSymbols = scanAllMarkets
            ? DERIVED_SYNTHETIC_MARKETS.map(m => m.symbol)
            : [selectedSymbol];

        activeSymbols.forEach(symbol => {
            if (subscriptionsRef.current.has(symbol)) return;

            const marketMeta = DERIVED_SYNTHETIC_MARKETS.find(m => m.symbol === symbol);
            const pip = marketMeta?.pip || 2;

            const sub = safeSubscribe(
                api_base?.api,
                { ticks: symbol },
                (res: any) => {
                    if (res?.tick && res.tick.symbol === symbol) {
                        const quote = res.tick.quote;
                        const digit = extractLastDigit(quote, pip);
                        const mState = marketsDataRef.current.get(symbol);
                        if (mState) {
                            mState.digits.push(digit);
                            if (mState.digits.length > MAX_HISTORY_TICKS) {
                                mState.digits.shift();
                            }
                            mState.currentPrice = Number(quote).toFixed(pip);
                            mState.lastDigit = digit;
                            throttleRender();
                        }
                    }
                },
                (err: any) => {
                    console.warn(`[Overlord AI] Tick subscription warning for ${symbol}:`, err);
                }
            );

            subscriptionsRef.current.set(symbol, sub);
        });

        return () => {
            // Keep persistent socket stream open for seamless trading
        };
    }, [scanAllMarkets, selectedSymbol, throttleRender]);

    // Current Selected Market State
    const currentMarket = useMemo(() => {
        return (
            marketsDataRef.current.get(selectedSymbol) || {
                symbol: selectedSymbol,
                label: 'Selected Volatility',
                digits: [],
                currentPrice: '0.00',
                lastDigit: 0,
                pip: 2,
            }
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedSymbol, renderTrigger]);

    // ── Smart AI Pattern & Statistical Analysis Engine ──
    const patternEngine = useMemo(() => {
        const digits = currentMarket.digits;
        const totalTicks = digits.length;

        const frequencies: Record<number, number> = {
            0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0,
        };

        digits.forEach(d => {
            if (frequencies[d] !== undefined) frequencies[d]++;
        });

        const sampleSize = Math.max(1, totalTicks);
        const percentages: Record<number, number> = {};
        for (let i = 0; i <= 9; i++) {
            percentages[i] = Math.round((frequencies[i] / sampleSize) * 1000) / 10;
        }

        // Low Digits (0–4) vs High Digits (5–9)
        const lowCount = [0, 1, 2, 3, 4].reduce((sum, d) => sum + frequencies[d], 0);
        const highCount = [5, 6, 7, 8, 9].reduce((sum, d) => sum + frequencies[d], 0);
        const lowRatio = Math.round((lowCount / sampleSize) * 100);
        const highRatio = 100 - lowRatio;

        // Specific Barriers Frequency
        const under8Count = [0, 1, 2, 3, 4, 5, 6, 7].reduce((s, d) => s + frequencies[d], 0);
        const over1Count = [2, 3, 4, 5, 6, 7, 8, 9].reduce((s, d) => s + frequencies[d], 0);
        const under7Count = [0, 1, 2, 3, 4, 5, 6].reduce((s, d) => s + frequencies[d], 0);
        const over2Count = [3, 4, 5, 6, 7, 8, 9].reduce((s, d) => s + frequencies[d], 0);
        const under6Count = [0, 1, 2, 3, 4, 5].reduce((s, d) => s + frequencies[d], 0);
        const over3Count = [4, 5, 6, 7, 8, 9].reduce((s, d) => s + frequencies[d], 0);

        const under8Pct = Math.round((under8Count / sampleSize) * 100);
        const over1Pct = Math.round((over1Count / sampleSize) * 100);
        const under7Pct = Math.round((under7Count / sampleSize) * 100);
        const over2Pct = Math.round((over2Count / sampleSize) * 100);
        const under6Pct = Math.round((under6Count / sampleSize) * 100);
        const over3Pct = Math.round((over3Count / sampleSize) * 100);

        // Micro-momentum (last 10 & last 5 ticks)
        const last10 = digits.slice(-10);
        const last10Low = last10.filter(d => d <= 4).length;
        const last10High = 10 - last10Low;

        // Strategy Resolution
        let chosenStrategy: OverlordStrategyMode = strategyMode;
        if (strategyMode === 'ALL_AUTO') {
            const scores = [
                { mode: 'OVER_1_UNDER_8' as OverlordStrategyMode, edge: Math.max(under8Pct, over1Pct) },
                { mode: 'OVER_2_UNDER_7' as OverlordStrategyMode, edge: Math.max(under7Pct, over2Pct) * 1.05 },
                { mode: 'OVER_3_UNDER_6' as OverlordStrategyMode, edge: Math.max(under6Pct, over3Pct) * 1.15 },
            ];
            scores.sort((a, b) => b.edge - a.edge);
            chosenStrategy = scores[0].mode;
        }

        let targetBarrier = 8;
        let signal: 'UNDER' | 'OVER' | 'NEUTRAL' = 'NEUTRAL';
        let signalConfidence = 50;
        let isTriggerReady = false;
        let triggerDigits: number[] = [];

        if (chosenStrategy === 'OVER_1_UNDER_8') {
            if (under8Pct >= 78 || last10Low >= 6) {
                signal = 'UNDER';
                targetBarrier = 8;
                signalConfidence = Math.min(98, Math.round(under8Pct * 0.9 + last10Low * 2));
                triggerDigits = [0, 1, 2, 3, 4, 5, 6, 7];
                isTriggerReady = triggerDigits.includes(currentMarket.lastDigit);
            } else if (over1Pct >= 78 || last10High >= 6) {
                signal = 'OVER';
                targetBarrier = 1;
                signalConfidence = Math.min(98, Math.round(over1Pct * 0.9 + last10High * 2));
                triggerDigits = [2, 3, 4, 5, 6, 7, 8, 9];
                isTriggerReady = triggerDigits.includes(currentMarket.lastDigit);
            }
        } else if (chosenStrategy === 'OVER_2_UNDER_7') {
            if (under7Pct >= 68 || last10Low >= 6) {
                signal = 'UNDER';
                targetBarrier = 7;
                signalConfidence = Math.min(95, Math.round(under7Pct * 0.9 + last10Low * 2.5));
                triggerDigits = [0, 1, 2, 3, 4, 5, 6];
                isTriggerReady = triggerDigits.includes(currentMarket.lastDigit);
            } else if (over2Pct >= 68 || last10High >= 6) {
                signal = 'OVER';
                targetBarrier = 2;
                signalConfidence = Math.min(95, Math.round(over2Pct * 0.9 + last10High * 2.5));
                triggerDigits = [3, 4, 5, 6, 7, 8, 9];
                isTriggerReady = triggerDigits.includes(currentMarket.lastDigit);
            }
        } else if (chosenStrategy === 'OVER_3_UNDER_6') {
            if (under6Pct >= 58 || last10Low >= 6) {
                signal = 'UNDER';
                targetBarrier = 6;
                signalConfidence = Math.min(92, Math.round(under6Pct * 0.95 + last10Low * 3));
                triggerDigits = [0, 1, 2, 3, 4, 5];
                isTriggerReady = triggerDigits.includes(currentMarket.lastDigit);
            } else if (over3Pct >= 58 || last10High >= 6) {
                signal = 'OVER';
                targetBarrier = 3;
                signalConfidence = Math.min(92, Math.round(over3Pct * 0.95 + last10High * 3));
                triggerDigits = [4, 5, 6, 7, 8, 9];
                isTriggerReady = triggerDigits.includes(currentMarket.lastDigit);
            }
        }

        // Find Highest & Lowest Frequency Digits
        let highestDigit = 0;
        let highestFreq = -1;
        let lowestDigit = 0;
        let lowestFreq = 999999;

        for (let i = 0; i <= 9; i++) {
            if (frequencies[i] > highestFreq) {
                highestFreq = frequencies[i];
                highestDigit = i;
            }
            if (frequencies[i] < lowestFreq) {
                lowestFreq = frequencies[i];
                lowestDigit = i;
            }
        }

        return {
            totalTicks,
            frequencies,
            percentages,
            lowRatio,
            highRatio,
            under8Pct,
            over1Pct,
            under7Pct,
            over2Pct,
            under6Pct,
            over3Pct,
            last10Low,
            last10High,
            chosenStrategy,
            signal,
            targetBarrier,
            signalConfidence,
            isTriggerReady,
            triggerDigits,
            highestDigit,
            lowestDigit,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentMarket, strategyMode, renderTrigger]);

    // ── Multi-Market Cross Scanner Ranking ──
    const rankedMarketCandidates = useMemo(() => {
        return DERIVED_SYNTHETIC_MARKETS.map(meta => {
            const data = marketsDataRef.current.get(meta.symbol);
            const digits = data?.digits || [];
            const count = digits.length;
            if (count < 20) {
                return {
                    ...meta,
                    digitsCount: count,
                    bias: 'NEUTRAL',
                    score: 50,
                    lastDigit: data?.lastDigit || 0,
                    currentPrice: data?.currentPrice || '0.00',
                };
            }

            const lowC = digits.filter(d => d <= 4).length;
            const lowPct = Math.round((lowC / count) * 100);
            const last10 = digits.slice(-10);
            const last10Low = last10.filter(d => d <= 4).length;

            let score = 50;
            let bias: 'UNDER' | 'OVER' | 'NEUTRAL' = 'NEUTRAL';

            if (lowPct >= 56 || last10Low >= 7) {
                bias = 'UNDER';
                score = Math.min(99, 50 + (lowPct - 50) * 2.5 + (last10Low - 5) * 6);
            } else if (lowPct <= 44 || last10Low <= 3) {
                bias = 'OVER';
                score = Math.min(99, 50 + (50 - lowPct) * 2.5 + (5 - last10Low) * 6);
            }

            return {
                ...meta,
                digitsCount: count,
                bias,
                score: Math.round(score),
                lastDigit: data?.lastDigit || 0,
                currentPrice: data?.currentPrice || '0.00',
            };
        }).sort((a, b) => b.score - a.score);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [renderTrigger]);

    // Push Contract Details to Deriv System Drawer
    const pushContractToDrawer = useCallback(
        (poc: any, contractType: string, barrierVal: number, stakeVal: number) => {
            try {
                if (summary_card?.setContractInfo) {
                    summary_card.setContractInfo(poc);
                }
                if (transactions?.contracts) {
                    const isSold = Boolean(poc.is_sold || poc.status === 'won' || poc.status === 'lost');
                    const profitVal = Number(poc.profit || 0);
                    const txItem = {
                        barrier: barrierVal,
                        buy_price: stakeVal,
                        contract_id: poc.contract_id,
                        contract_type: contractType,
                        currency,
                        display_name: currentMarket.label,
                        date_start: poc.date_start || Math.floor(Date.now() / 1000),
                        date_expiry: poc.date_expiry,
                        entry_tick: poc.entry_tick,
                        exit_tick: poc.exit_tick,
                        is_completed: isSold,
                        payout: Number(poc.payout || 0),
                        profit: profitVal,
                        reference_id: poc.transaction_ids?.buy || poc.contract_id,
                        status: isSold ? (profitVal >= 0 ? 'won' : 'lost') : 'open',
                        symbol: currentMarket.symbol,
                        underlying: currentMarket.symbol,
                    };
                    const existingIdx = transactions.contracts.findIndex(
                        (c: any) => c.contract_id === poc.contract_id
                    );
                    if (existingIdx >= 0) {
                        transactions.contracts[existingIdx] = txItem as any;
                    } else {
                        transactions.contracts.unshift(txItem as any);
                    }
                }
            } catch (err) {
                console.debug('[Overlord AI] Drawer update notice:', err);
            }
        },
        [summary_card, transactions, currency, currentMarket]
    );

    // ── Trade Order Execution ──
    const executeTradeOrder = useCallback(
        async (
            symbolToTrade: string,
            contractType: 'DIGITOVER' | 'DIGITUNDER',
            barrierValue: number,
            stakeAmount: number,
            burstRunNumber: number
        ) => {
            if (executionLockRef.current) return;
            executionLockRef.current = true;

            const logId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            const newLog: TradeLogItem = {
                id: logId,
                timestamp: Date.now(),
                symbol: symbolToTrade,
                contractType,
                barrier: barrierValue,
                stake: stakeAmount,
                result: 'PENDING',
                profit: 0,
                burstRunIndex: burstRunNumber,
            };

            setTradeLog(prev => [newLog, ...prev.slice(0, 49)]);

            try {
                const buyRes = await buyContractForUi({
                    symbol: symbolToTrade,
                    contract_type: contractType,
                    amount: stakeAmount,
                    basis: 'stake',
                    currency,
                    duration: 1,
                    duration_unit: 't',
                    barrier: String(barrierValue),
                });

                const contractId = buyRes.contract_id;

                const settledContract = await streamContractUntilSettled(
                    api_base?.api,
                    contractId,
                    poc => {
                        pushContractToDrawer(poc, contractType, barrierValue, stakeAmount);
                    },
                    12000
                );

                const isWon = settledContract.status === 'won' || settledContract.profit > 0;
                const profitVal = Number(settledContract.profit || 0);
                const exitDigit = extractLastDigit(settledContract.exit_tick || settledContract.current_spot || 0);

                // Update Session Log
                setTradeLog(prev =>
                    prev.map(item =>
                        item.id === logId
                            ? {
                                  ...item,
                                  result: isWon ? 'WIN' : 'LOSS',
                                  profit: profitVal,
                                  exitDigit,
                              }
                            : item
                    )
                );

                // Update Session Statistics
                if (isWon) {
                    if (soundEnabled) playSoundCue('win');
                    setWinsCount(w => w + 1);
                    setSessionProfit(p => Math.round((p + profitVal) * 100) / 100);
                    setIsInRecovery(false);
                    setMartingaleStage(0);
                    setCurrentStake(initialBaseStake);
                } else {
                    if (soundEnabled) playSoundCue('loss');
                    setLossesCount(l => l + 1);
                    setSessionProfit(p => Math.round((p + profitVal) * 100) / 100);

                    if (isMartingaleEnabled) {
                        setIsInRecovery(true);
                        setMartingaleStage(s => s + 1);
                        const mult = parseFloat(martingaleMultiplier) || 2.5;
                        const nextStakeVal = Math.round(stakeAmount * mult * 100) / 100;
                        setCurrentStake(nextStakeVal);
                    } else {
                        setCurrentStake(initialBaseStake);
                    }
                }

                return isWon;
            } catch (tradeErr: any) {
                console.error('[Overlord AI] Trade error:', tradeErr);
                setTradeLog(prev =>
                    prev.map(item =>
                        item.id === logId ? { ...item, result: 'LOSS', profit: -stakeAmount } : item
                    )
                );
                setLossesCount(l => l + 1);
                setSessionProfit(p => Math.round((p - stakeAmount) * 100) / 100);
                return false;
            } finally {
                executionLockRef.current = false;
            }
        },
        [
            currency,
            pushContractToDrawer,
            soundEnabled,
            initialBaseStake,
            isMartingaleEnabled,
            martingaleMultiplier,
        ]
    );

    // ── Continuous Burst Trading & Autopilot Orchestrator ──
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

        // 1. Risk Guards (Take Profit & Stop Loss)
        const targetTp = parseFloat(takeProfit) || 20.0;
        const targetSl = parseFloat(stopLoss) || 50.0;

        if (sessionProfit >= targetTp && targetTp > 0) {
            setBotState('TP_REACHED');
            if (soundEnabled) playSoundCue('burst_complete');
            return;
        }

        if (sessionProfit <= -targetSl && targetSl > 0) {
            setBotState('SL_REACHED');
            if (soundEnabled) playSoundCue('loss');
            return;
        }

        // 2. Active Burst Execution
        if (botState === 'BURST_TRADING') {
            void (async () => {
                const nextRun = currentBurstRun + 1;
                setCurrentBurstRun(nextRun);
                setRunsOnCurrentMarket(r => r + 1);

                const contractType = patternEngine.signal === 'OVER' ? 'DIGITOVER' : 'DIGITUNDER';
                const barrier = patternEngine.targetBarrier;
                const stakeToUse = isInRecovery ? currentStake : initialBaseStake;

                await executeTradeOrder(selectedSymbol, contractType, barrier, stakeToUse, nextRun);

                // If completed full burst streak (e.g. 10 of 10)
                if (nextRun >= burstRunSize) {
                    if (soundEnabled) playSoundCue('burst_complete');
                    setCurrentBurstRun(0);
                    setBurstCountTotal(b => b + 1);

                    // Pause briefly for multi-market AI re-analysis
                    setBotState('BURST_PAUSED');

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

            setBotState('BURST_TRADING');
            setCurrentBurstRun(1);
            setRunsOnCurrentMarket(r => r + 1);

            void executeTradeOrder(selectedSymbol, contractType, barrier, stakeToUse, 1);
        } else {
            if (botState !== 'WAITING_TRIGGER') {
                setBotState('WAITING_TRIGGER');
            }
        }
    }, [
        botState,
        currentBurstRun,
        burstRunSize,
        sessionProfit,
        takeProfit,
        stopLoss,
        patternEngine,
        isInRecovery,
        currentStake,
        initialBaseStake,
        selectedSymbol,
        executeTradeOrder,
        soundEnabled,
        isMarketRotationEnabled,
        runsOnCurrentMarket,
        marketRotationRuns,
        rankedMarketCandidates,
    ]);

    // ── 50-Digit Bezier Wave Spline Line Chart ──
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
            // Inverted Y: Digit 9 at top, Digit 0 at bottom
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

    // Filtered Market List for Search
    const filteredMarkets = useMemo(() => {
        if (!marketSearchTerm.trim()) return DERIVED_SYNTHETIC_MARKETS;
        const term = marketSearchTerm.toLowerCase();
        return DERIVED_SYNTHETIC_MARKETS.filter(
            m => m.label.toLowerCase().includes(term) || m.symbol.toLowerCase().includes(term)
        );
    }, [marketSearchTerm]);

    // Controls Action Handlers
    const handleStartTrading = () => {
        if (soundEnabled) playSoundCue('start');
        setBotState('WAITING_SIGNAL');
    };

    const handleStopTrading = () => {
        setBotState('IDLE');
        setCurrentBurstRun(0);
    };

    const handleResetStats = () => {
        setWinsCount(0);
        setLossesCount(0);
        setSessionProfit(0);
        setTradeLog([]);
        setCurrentBurstRun(0);
        setBurstCountTotal(0);
        setMartingaleStage(0);
        setIsInRecovery(false);
        setCurrentStake(initialBaseStake);
    };

    // Quick Stake Setters
    const handleAdjustStake = (delta: number) => {
        const current = parseFloat(manualStake) || 1.0;
        const next = Math.max(0.35, Math.round((current + delta) * 100) / 100);
        setManualStake(next.toFixed(2));
    };

    const totalTrades = winsCount + lossesCount;
    const winRate = totalTrades > 0 ? Math.round((winsCount / totalTrades) * 100) : 0;

    return (
        <div className={`overlord-ai-wrapper ${isWideViewOpen ? 'wide-view-active' : ''}`}>
            {/* ── Top Header & Cyber Wallet Bar ── */}
            <header className='overlord-top-bar'>
                <div className='brand-section'>
                    <div className='brand-icon-box'>
                        <Zap size={24} />
                    </div>
                    <div className='brand-info'>
                        <div className='brand-title-row'>
                            <h1 className='brand-title'>OVERLORD AI</h1>
                            <span className='version-tag'>QUANTUM TRADER v4.0</span>
                            <span className='status-live-badge'>
                                <span className='pulse-dot' />
                                24/7 ONLINE
                            </span>
                        </div>
                        <span className='brand-subtitle'>
                            Neural Pattern Detection • 7–12 Run Continuous Bursts • Dynamic Market Rotation
                        </span>
                    </div>
                </div>

                {/* Cyber Wallet Card */}
                <div className='cyber-wallet-card'>
                    <div className='wallet-account-header'>
                        <span
                            className={`account-badge ${client?.is_virtual ? 'badge-demo' : 'badge-real'}`}
                        >
                            {client?.is_virtual ? 'DEMO ACCOUNT' : 'REAL ACCOUNT'}
                        </span>
                        <span className='account-loginid'>{client?.loginid || 'CR000000'}</span>
                    </div>
                    <div className='wallet-balance-row'>
                        <div className='balance-icon-wrap'>
                            <Wallet size={18} />
                        </div>
                        <div className='balance-data'>
                            <span className='balance-label'>AVAILABLE BALANCE</span>
                            <span className='balance-amount'>
                                {rawBalance.toLocaleString('en-US', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                                <span className='currency-code'>{currency}</span>
                            </span>
                        </div>
                        <button
                            className='refresh-balance-btn'
                            title='Toggle Sound'
                            onClick={() => setSoundEnabled(!soundEnabled)}
                        >
                            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                        </button>
                    </div>
                    <div className='wallet-chips-row'>
                        <span
                            className={`chip chip-profit ${sessionProfit >= 0 ? 'profit-pos' : 'profit-neg'}`}
                        >
                            P&L: {sessionProfit >= 0 ? `+$${sessionProfit.toFixed(2)}` : `-$${Math.abs(sessionProfit).toFixed(2)}`}
                        </span>
                        <span className='chip chip-winrate'>
                            WIN: {winRate}% ({winsCount}W / {lossesCount}L)
                        </span>
                        <button
                            className='sound-chip-btn'
                            title='Reset Session Stats'
                            onClick={handleResetStats}
                        >
                            <RotateCcw size={12} />
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Mobile Segmented Navigation Bar ── */}
            <nav className='mobile-segmented-nav'>
                <button
                    className={`nav-pill ${mobileActiveTab === 'DASHBOARD' ? 'active' : ''}`}
                    onClick={() => setMobileActiveTab('DASHBOARD')}
                >
                    <BarChart2 size={14} /> DASHBOARD
                </button>
                <button
                    className={`nav-pill ${mobileActiveTab === 'AUTOTRADER' ? 'active' : ''}`}
                    onClick={() => setMobileActiveTab('AUTOTRADER')}
                >
                    <Cpu size={14} /> AI TRADER
                </button>
                <button
                    className={`nav-pill ${mobileActiveTab === 'MARKETS' ? 'active' : ''}`}
                    onClick={() => setMobileActiveTab('MARKETS')}
                >
                    <Radio size={14} /> MARKETS
                </button>
                <button
                    className={`nav-pill ${mobileActiveTab === 'TRADES' ? 'active' : ''}`}
                    onClick={() => setMobileActiveTab('TRADES')}
                >
                    <Layers size={14} /> JOURNAL
                </button>
            </nav>

            {/* ── Control Ribbon & Strategy Selector ── */}
            <div className='overlord-controls-ribbon'>
                <div className='left-controls'>
                    {botState === 'IDLE' || botState === 'PAUSED' || botState === 'TP_REACHED' || botState === 'SL_REACHED' ? (
                        <button
                            className='btn-control btn-autotrade-start'
                            onClick={handleStartTrading}
                        >
                            <Play size={16} /> START AI TRADER
                        </button>
                    ) : (
                        <button
                            className='btn-control btn-autotrade-stop'
                            onClick={handleStopTrading}
                        >
                            <Square size={16} /> STOP TRADING
                        </button>
                    )}

                    <button
                        className={`btn-control btn-best-market ${autoPickBestMarket ? 'active' : ''}`}
                        onClick={() => setAutoPickBestMarket(!autoPickBestMarket)}
                        title='Auto-select the highest scoring volatility market'
                    >
                        <Sparkles size={14} />
                        {autoPickBestMarket ? 'AUTO-MARKET ACTIVE' : 'MANUAL MARKET'}
                    </button>
                </div>

                <div className='right-controls'>
                    <button
                        className={`btn-control ${isWideViewOpen ? 'active' : ''}`}
                        onClick={() => setIsWideViewOpen(!isWideViewOpen)}
                    >
                        {isWideViewOpen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        {isWideViewOpen ? 'COMPACT VIEW' : 'EXPAND VIEW'}
                    </button>
                </div>
            </div>

            {/* ── Main 3-Column Grid Layout ── */}
            <div className='overlord-main-layout'>
                {/* ── LEFT COLUMN: Market Scanner ── */}
                <aside
                    className={`overlord-side-scanner ${mobileActiveTab === 'MARKETS' ? 'mobile-active' : ''}`}
                >
                    <div className='scanner-header'>
                        <h3 className='scanner-title'>
                            <Radio size={14} /> SYNTHETICS SCANNER
                        </h3>
                    </div>

                    <div className='scanner-search-box'>
                        <input
                            type='text'
                            placeholder='Search markets...'
                            value={marketSearchTerm}
                            onChange={e => setMarketSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className='market-list-scroll'>
                        {filteredMarkets.map(m => {
                            const marketData = marketsDataRef.current.get(m.symbol);
                            const ranked = rankedMarketCandidates.find(c => c.symbol === m.symbol);
                            const isSelected = m.symbol === selectedSymbol;
                            const lastD = marketData?.lastDigit || 0;
                            const isUnder = lastD <= 4;

                            return (
                                <div
                                    key={m.symbol}
                                    className={`market-item-card ${isSelected ? 'active' : ''}`}
                                    onClick={() => setSelectedSymbol(m.symbol)}
                                >
                                    <div className='market-header-row'>
                                        <span className='market-name'>{m.label}</span>
                                        <span
                                            className={`last-digit-badge ${isUnder ? 'digit-under' : 'digit-over'}`}
                                        >
                                            {lastD}
                                        </span>
                                    </div>
                                    <div className='market-data-row'>
                                        <span className='market-price'>
                                            {marketData?.currentPrice || '0.00'}
                                        </span>
                                        <span
                                            className={`market-bias-badge ${
                                                ranked?.bias === 'UNDER'
                                                    ? 'bias-under'
                                                    : ranked?.bias === 'OVER'
                                                    ? 'bias-over'
                                                    : 'bias-neutral'
                                            }`}
                                        >
                                            {ranked?.bias || 'NEUTRAL'} ({ranked?.score || 50}%)
                                        </span>
                                    </div>
                                    <div className='market-mini-bar'>
                                        <div
                                            className='mini-bar-under'
                                            style={{ width: `${ranked?.score || 50}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </aside>

                {/* ── CENTER COLUMN: Live Wave & Deep Analytics ── */}
                <main
                    className={`overlord-center-content ${mobileActiveTab === 'DASHBOARD' ? 'mobile-active' : ''}`}
                >
                    {/* Active Market Hero */}
                    <div className='active-market-hero'>
                        <div className='market-left-info'>
                            <h2 className='active-market-title'>{currentMarket.label}</h2>
                            <div className='active-price-display'>
                                <span className='price-label'>LIVE SPOT</span>
                                {currentMarket.currentPrice}
                            </div>
                        </div>

                        <div className='market-right-digit'>
                            <div className='last-digit-hero-box'>
                                <div
                                    className={`digit-avatar ${currentMarket.lastDigit <= 4 ? 'digit-under' : 'digit-over'}`}
                                >
                                    {currentMarket.lastDigit}
                                </div>
                                <div className='digit-labels'>
                                    <span className='digit-sub'>AI SIGNAL</span>
                                    <span
                                        className={`digit-type-text ${
                                            patternEngine.signal === 'UNDER'
                                                ? 'text-under'
                                                : patternEngine.signal === 'OVER'
                                                ? 'text-over'
                                                : ''
                                        }`}
                                    >
                                        {patternEngine.signal === 'NEUTRAL'
                                            ? 'SCANNING...'
                                            : `${patternEngine.signal} ${patternEngine.targetBarrier} (${patternEngine.signalConfidence}%)`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 50-Digit Bezier Wave Spline Chart */}
                    <div className='digit-chart-container'>
                        <div className='chart-header-row'>
                            <span className='split-title'>
                                <Activity size={14} /> LIVE DIGIT TRAJECTORY (LAST 50 TICKS)
                            </span>
                            <div className='chart-legend'>
                                <div className='legend-item'>
                                    <span className='dot dot-under' /> UNDER 0–4
                                </div>
                                <div className='legend-item'>
                                    <span className='dot dot-over' /> OVER 5–9
                                </div>
                            </div>
                        </div>

                        <div className='svg-chart-wrapper'>
                            <svg viewBox='0 0 600 180' preserveAspectRatio='none'>
                                <defs>
                                    <linearGradient
                                        id='splineAreaGrad'
                                        x1='0'
                                        y1='0'
                                        x2='0'
                                        y2='1'
                                    >
                                        <stop offset='0%' stopColor='#00f5ff' stopOpacity='0.25' />
                                        <stop offset='100%' stopColor='#00f5ff' stopOpacity='0.0' />
                                    </linearGradient>
                                </defs>
                                {chartData.areaPath && (
                                    <path d={chartData.areaPath} fill='url(#splineAreaGrad)' />
                                )}
                                {chartData.path && (
                                    <path
                                        d={chartData.path}
                                        fill='none'
                                        stroke='#00f5ff'
                                        strokeWidth='2.5'
                                    />
                                )}
                                {chartData.points.map(pt => (
                                    <circle
                                        key={pt.idx}
                                        cx={pt.x}
                                        cy={pt.y}
                                        r={pt.digit === currentMarket.lastDigit ? 4.5 : 2.5}
                                        fill={pt.digit <= 4 ? '#00e676' : '#ffb700'}
                                    />
                                ))}
                            </svg>
                        </div>
                    </div>

                    {/* Dual Statistical Analysis Grid */}
                    <div className='overlord-stats-dual-grid'>
                        <div className='stat-split-card'>
                            <div className='split-title-row'>
                                <span className='split-title'>LOW vs HIGH RATIO</span>
                                <span className='split-badge'>ENTROPY SCAN</span>
                            </div>
                            <div className='split-meter-box'>
                                <div className='meter-bar'>
                                    <div
                                        className='meter-left'
                                        style={{ width: `${patternEngine.lowRatio}%` }}
                                    />
                                    <div
                                        className='meter-right'
                                        style={{ width: `${patternEngine.highRatio}%` }}
                                    />
                                </div>
                                <div className='meter-labels'>
                                    <span className='label-left'>LOW (0–4): {patternEngine.lowRatio}%</span>
                                    <span className='label-right'>HIGH (5–9): {patternEngine.highRatio}%</span>
                                </div>
                            </div>
                            <div className='stat-metrics-row'>
                                <span>Recent Momentum (10 Ticks):</span>
                                <strong>
                                    {patternEngine.last10Low} Low / {patternEngine.last10High} High
                                </strong>
                            </div>
                        </div>

                        <div className='stat-split-card'>
                            <div className='split-title-row'>
                                <span className='split-title'>HIGH-PROBABILITY BARRIERS</span>
                                <span className='split-badge'>EDGE CALC</span>
                            </div>
                            <div className='stat-metrics-row'>
                                <span>Under 8 Frequency:</span>
                                <strong>{patternEngine.under8Pct}%</strong>
                            </div>
                            <div className='stat-metrics-row'>
                                <span>Under 7 Frequency:</span>
                                <strong>{patternEngine.under7Pct}%</strong>
                            </div>
                            <div className='stat-metrics-row'>
                                <span>Under 6 Frequency:</span>
                                <strong>{patternEngine.under6Pct}%</strong>
                            </div>
                        </div>
                    </div>

                    {/* Glowing Highest Entry Digit Panel & 0-9 Spectrum */}
                    <div className='glowing-entry-digits-panel'>
                        <div className='entry-digits-grid'>
                            <div
                                className={`entry-digit-card under-glow ${
                                    patternEngine.signal === 'UNDER' && patternEngine.isTriggerReady
                                        ? 'is-active-trigger'
                                        : ''
                                }`}
                            >
                                <div className='digit-orb orb-under'>
                                    {patternEngine.highestDigit}
                                </div>
                                <div className='entry-details'>
                                    <span className='entry-type'>DOMINANT HOT DIGIT</span>
                                    <span className='entry-status'>
                                        Digit {patternEngine.highestDigit} ({patternEngine.percentages[patternEngine.highestDigit]}%)
                                    </span>
                                    <span className='entry-subtext'>
                                        High probability catalyst for Under triggers
                                    </span>
                                </div>
                            </div>

                            <div
                                className={`entry-digit-card over-glow ${
                                    patternEngine.signal === 'OVER' && patternEngine.isTriggerReady
                                        ? 'is-active-trigger'
                                        : ''
                                }`}
                            >
                                <div className='digit-orb orb-over'>
                                    {patternEngine.lowestDigit}
                                </div>
                                <div className='entry-details'>
                                    <span className='entry-type'>COLD DIGIT / REVERSAL</span>
                                    <span className='entry-status'>
                                        Digit {patternEngine.lowestDigit} ({patternEngine.percentages[patternEngine.lowestDigit]}%)
                                    </span>
                                    <span className='entry-subtext'>
                                        Oversold anomaly for Over triggers
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 0 to 9 Spectrum Bars */}
                        <div className='digit-spectrum-row'>
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit => {
                                const pct = patternEngine.percentages[digit] || 0;
                                const isHighest = digit === patternEngine.highestDigit;
                                const isUnder = digit <= 4;

                                return (
                                    <div
                                        key={digit}
                                        className={`spectrum-bar-item ${
                                            isUnder ? 'is-under' : 'is-over'
                                        } ${isHighest ? 'is-highest' : ''}`}
                                    >
                                        <span className='digit-num'>{digit}</span>
                                        <span className='digit-freq-pct'>{pct}%</span>
                                        <span className='digit-rank-badge'>
                                            {isHighest ? 'HOT' : `${digit}`}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </main>

                {/* ── RIGHT COLUMN: Standalone AI Trader & Journal ── */}
                <aside
                    className={`overlord-right-panel ${
                        mobileActiveTab === 'AUTOTRADER' || mobileActiveTab === 'TRADES'
                            ? 'mobile-active'
                            : ''
                    }`}
                >
                    {/* Strategy Mode Selector */}
                    <div className='right-panel-tabs'>
                        <button
                            className={`tab-btn ${strategyMode === 'OVER_1_UNDER_8' ? 'active' : ''}`}
                            onClick={() => setStrategyMode('OVER_1_UNDER_8')}
                        >
                            Over 1 / Under 8
                        </button>
                        <button
                            className={`tab-btn ${strategyMode === 'OVER_2_UNDER_7' ? 'active' : ''}`}
                            onClick={() => setStrategyMode('OVER_2_UNDER_7')}
                        >
                            Over 2 / Under 7
                        </button>
                    </div>

                    <div className='right-panel-tabs' style={{ marginTop: '-8px' }}>
                        <button
                            className={`tab-btn ${strategyMode === 'OVER_3_UNDER_6' ? 'active' : ''}`}
                            onClick={() => setStrategyMode('OVER_3_UNDER_6')}
                        >
                            Over 3 / Under 6
                        </button>
                        <button
                            className={`tab-btn ${strategyMode === 'ALL_AUTO' ? 'active' : ''}`}
                            onClick={() => setStrategyMode('ALL_AUTO')}
                        >
                            <Sparkles size={12} /> ALL AUTO-CHOOSE
                        </button>
                    </div>

                    {/* Continuous Burst Monitor */}
                    <div className='compounding-timer-hud'>
                        <div className='timer-header'>
                            <span className='step-badge'>
                                <Flame size={14} /> CONTINUOUS BURST STREAK
                            </span>
                            <span className='live-clock-display'>
                                RUN {currentBurstRun} / {burstRunSize}
                            </span>
                        </div>
                        <div className='progress-stats-row'>
                            <span className='profit-track'>
                                Target Profit: <strong>+${takeProfit}</strong>
                            </span>
                            <span className='pct-track'>
                                Stop Loss: <strong>-${stopLoss}</strong>
                            </span>
                        </div>
                        <div className='dual-progress-bar'>
                            <div className='progress-track'>
                                <div
                                    className='progress-fill'
                                    style={{
                                        width: `${Math.min(100, (currentBurstRun / burstRunSize) * 100)}%`,
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Stake & Risk Controls */}
                    <div className='form-row'>
                        <div className='form-group'>
                            <label>MANUAL STAKE ({currency})</label>
                            <input
                                type='number'
                                step='0.1'
                                min='0.35'
                                value={manualStake}
                                onChange={e => setManualStake(e.target.value)}
                            />
                        </div>
                        <div className='form-group'>
                            <label>BURST RUNS (7–12)</label>
                            <select
                                value={burstRunSize}
                                onChange={e => setBurstRunSize(Number(e.target.value))}
                            >
                                <option value={7}>7 Consecutive Runs</option>
                                <option value={8}>8 Consecutive Runs</option>
                                <option value={10}>10 Consecutive Runs</option>
                                <option value={12}>12 Consecutive Runs</option>
                            </select>
                        </div>
                    </div>

                    {/* Quick Stake Adjustment Pills */}
                    <div className='wallet-chips-row' style={{ marginBottom: '12px' }}>
                        <button
                            className='chip'
                            onClick={() => handleAdjustStake(1)}
                            style={{ cursor: 'pointer', background: 'rgba(0, 245, 255, 0.15)', color: '#00f5ff' }}
                        >
                            +$1
                        </button>
                        <button
                            className='chip'
                            onClick={() => handleAdjustStake(5)}
                            style={{ cursor: 'pointer', background: 'rgba(0, 245, 255, 0.15)', color: '#00f5ff' }}
                        >
                            +$5
                        </button>
                        <button
                            className='chip'
                            onClick={() => handleAdjustStake(10)}
                            style={{ cursor: 'pointer', background: 'rgba(0, 245, 255, 0.15)', color: '#00f5ff' }}
                        >
                            +$10
                        </button>
                        <button
                            className='chip'
                            onClick={() => setManualStake('1.00')}
                            style={{ cursor: 'pointer', background: 'rgba(255, 255, 255, 0.1)', color: '#cbd5e1' }}
                        >
                            Reset ($1.00)
                        </button>
                    </div>

                    <div className='form-row'>
                        <div className='form-group'>
                            <label>TAKE PROFIT (${currency})</label>
                            <input
                                type='number'
                                value={takeProfit}
                                onChange={e => setTakeProfit(e.target.value)}
                            />
                        </div>
                        <div className='form-group'>
                            <label>STOP LOSS (${currency})</label>
                            <input
                                type='number'
                                value={stopLoss}
                                onChange={e => setStopLoss(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className='form-row'>
                        <div className='form-group'>
                            <label>MARTINGALE MULTIPLIER</label>
                            <input
                                type='number'
                                step='0.1'
                                value={martingaleMultiplier}
                                onChange={e => setMartingaleMultiplier(e.target.value)}
                            />
                        </div>
                        <div className='form-group'>
                            <label>MARKET ROTATION</label>
                            <select
                                value={marketRotationRuns}
                                onChange={e => setMarketRotationRuns(Number(e.target.value))}
                            >
                                <option value={3}>Every 3 Runs</option>
                                <option value={4}>Every 4 Runs</option>
                                <option value={6}>Every 6 Runs</option>
                                <option value={10}>After Every Burst</option>
                            </select>
                        </div>
                    </div>

                    {/* Session Performance Grid */}
                    <div className='session-metrics-grid'>
                        <div className='metric-mini-card'>
                            <span className='m-label'>WINS</span>
                            <span className='m-val val-win'>{winsCount}</span>
                        </div>
                        <div className='metric-mini-card'>
                            <span className='m-label'>LOSSES</span>
                            <span className='m-val val-loss'>{lossesCount}</span>
                        </div>
                        <div className='metric-mini-card'>
                            <span className='m-label'>BURSTS</span>
                            <span className='m-val' style={{ color: '#00f5ff' }}>
                                {burstCountTotal}
                            </span>
                        </div>
                    </div>

                    {/* Live Trade Journal */}
                    <div className='trade-journal-card'>
                        <div className='chart-header-row'>
                            <span className='split-title'>
                                <Layers size={14} /> LIVE EXECUTION LOGS
                            </span>
                            <button
                                className='chip'
                                onClick={() => {
                                    const csvContent =
                                        'data:text/csv;charset=utf-8,' +
                                        ['Time,Market,Type,Barrier,Stake,Result,Profit,ExitDigit']
                                            .concat(
                                                tradeLog.map(
                                                    t =>
                                                        `${new Date(t.timestamp).toLocaleTimeString()},${t.symbol},${t.contractType},${t.barrier},${t.stake},${t.result},${t.profit},${t.exitDigit || ''}`
                                                )
                                            )
                                            .join('\n');
                                    const encodedUri = encodeURI(csvContent);
                                    const link = document.createElement('a');
                                    link.setAttribute('href', encodedUri);
                                    link.setAttribute('download', `overlord_trades_${Date.now()}.csv`);
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                }}
                                style={{ cursor: 'pointer', background: 'rgba(255, 255, 255, 0.08)' }}
                            >
                                <Download size={11} /> CSV
                            </button>
                        </div>

                        <div className='live-trade-log-container'>
                            {tradeLog.length === 0 ? (
                                <div
                                    style={{
                                        padding: '24px',
                                        textAlign: 'center',
                                        color: '#64748b',
                                        fontSize: '11px',
                                    }}
                                >
                                    Awaiting trade execution triggers...
                                </div>
                            ) : (
                                tradeLog.map(item => (
                                    <div
                                        key={item.id}
                                        className='log-item-row'
                                        style={{
                                            borderLeft: `3px solid ${
                                                item.result === 'WIN'
                                                    ? '#00e676'
                                                    : item.result === 'LOSS'
                                                    ? '#ff4757'
                                                    : '#94a3b8'
                                            }`,
                                        }}
                                    >
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <span style={{ fontSize: '10px', color: '#64748b' }}>
                                                {new Date(item.timestamp).toLocaleTimeString([], {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    second: '2-digit',
                                                })}
                                            </span>
                                            <span style={{ fontWeight: 800, fontSize: '11px', color: '#f1f5f9' }}>
                                                {item.symbol}
                                            </span>
                                            <span
                                                style={{
                                                    fontSize: '10px',
                                                    fontWeight: 800,
                                                    color: item.contractType === 'DIGITOVER' ? '#ffb700' : '#00e676',
                                                }}
                                            >
                                                {item.contractType === 'DIGITOVER' ? 'OVER' : 'UNDER'} {item.barrier}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                                ${item.stake.toFixed(2)}
                                            </span>
                                            <span
                                                style={{
                                                    fontSize: '11px',
                                                    fontWeight: 900,
                                                    color:
                                                        item.result === 'WIN'
                                                            ? '#00e676'
                                                            : item.result === 'LOSS'
                                                            ? '#ff4757'
                                                            : '#94a3b8',
                                                }}
                                            >
                                                {item.result === 'WIN'
                                                    ? `+$${item.profit.toFixed(2)}`
                                                    : item.result === 'LOSS'
                                                    ? `-$${Math.abs(item.profit).toFixed(2)}`
                                                    : 'PENDING'}
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
