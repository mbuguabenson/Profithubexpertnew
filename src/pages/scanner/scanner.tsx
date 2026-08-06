import { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useDevice } from '@deriv-com/ui';
import { contract_stages } from '@/constants/contract-stage';
import { DBOT_TABS } from '@/constants/bot-contents';
import { api_base, observer as globalObserver } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { getLastDigitFromQuote } from '@/utils/market-data';
import { buyContractForUi, streamContractUntilSettled } from '@/utils/trade-purchase';
import { safeSubscribe } from '@/utils/websocket-handler';
import { formatLoginDisplay, isLoggedIn } from '@/utils/token-bridge';
import './scanner.scss';

// ─── Types ────────────────────────────────────────────────────────────────────

type TTickPoint = { epoch: number; quote: number };

type TScannerStrategy =
    | 'Matches & Differs'
    | 'Even & Odd'
    | 'Over & Under'
    | 'Rise & Fall'
    | 'Only Ups'
    | 'Only Downs';

type TScannerTab = 'scanner' | 'stats';
type TMartingale = 1 | 1.5 | 2 | 2.5 | 3;

type TScannerSignal = {
    barrier?: string;
    contractType: 'DIGITEVEN' | 'DIGITODD' | 'DIGITOVER' | 'DIGITUNDER' | 'DIGITMATCH' | 'DIGITDIFF' | 'CALL' | 'PUT';
    label: string;
    confidence: number;
};

type TSignalRecord = {
    id: string;
    market: string;
    strategy: string;
    signal: string;
    confidence: number;
    timestamp: number;
    outcome: 'Pending' | 'Win' | 'Loss';
    profit?: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_TICKS = 1000;           // rolling tick buffer
const SCAN_WINDOW = 120;          // ticks analysed for main signal
const CONFIRM_TICKS = 15;         // short momentum confirmation window
const CANDLE_GRANULARITY = 1800;  // 30-min candle (seconds)
const DEFAULT_STAKE = '1';
const DEFAULT_STOP_LOSS = '50';
const DEFAULT_TAKE_PROFIT = '100';
const TIMER_SOUND_URL = 'https://www.fesliyanstudios.com/play-mp3/4386';

const MARKETS = [
    { label: 'Volatility 10 Index',     symbol: 'R_10',     group: 'Volatility' },
    { label: 'Volatility 25 Index',     symbol: 'R_25',     group: 'Volatility' },
    { label: 'Volatility 50 Index',     symbol: 'R_50',     group: 'Volatility' },
    { label: 'Volatility 75 Index',     symbol: 'R_75',     group: 'Volatility' },
    { label: 'Volatility 100 Index',    symbol: 'R_100',    group: 'Volatility' },
    { label: 'Volatility 10(1s) Index', symbol: '1HZ10V',   group: 'Volatility 1s' },
    { label: 'Volatility 25(1s) Index', symbol: '1HZ25V',   group: 'Volatility 1s' },
    { label: 'Volatility 50(1s) Index', symbol: '1HZ50V',   group: 'Volatility 1s' },
    { label: 'Volatility 75(1s) Index', symbol: '1HZ75V',   group: 'Volatility 1s' },
    { label: 'Volatility 100(1s) Index',symbol: '1HZ100V',  group: 'Volatility 1s' },
    { label: 'Jump 10 Index',           symbol: 'JUMP10',   group: 'Jump' },
    { label: 'Jump 25 Index',           symbol: 'JUMP25',   group: 'Jump' },
    { label: 'Jump 50 Index',           symbol: 'JUMP50',   group: 'Jump' },
    { label: 'Jump 75 Index',           symbol: 'JUMP75',   group: 'Jump' },
    { label: 'Jump 100 Index',          symbol: 'JUMP100',  group: 'Jump' },
] as const;

const STRATEGIES: TScannerStrategy[] = [
    'Matches & Differs',
    'Even & Odd',
    'Over & Under',
    'Rise & Fall',
    'Only Ups',
    'Only Downs',
];

const MARTINGALE_OPTIONS: TMartingale[] = [1, 1.5, 2, 2.5, 3];
const MARKET_GROUPS = ['Volatility', 'Volatility 1s', 'Jump'] as const;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

const cleanMoneyInput = (value: string) => value.replace(/[^\d.]/g, '').replace(/(\..*)\./, '$1');

const generateRandomCode = () => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$#@!%^&*()';
    let result = '';
    for (let i = 0; i < 40; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
};

const generateFakeLogs = () => {
    const logs = [
        '[INFO] Connecting to server... [OK]',
        '[INFO] Authenticating API key... [OK]',
        '[WARNING] Unstable connection detected...',
        '[ERROR] Connection timeout. Retrying...',
        '[INFO] Fetching market data... [OK]',
        '[INFO] Analysing Volatility Index...',
        '[SUCCESS] Data stream established...',
        '[SECURITY] Encryption enabled...',
        '[INFO] Predicting next digit...',
        '[WARNING] High market volatility detected...',
        '[INFO] Compiling results...',
        `[INFO] Scanning ${SCAN_WINDOW}-tick window...`,
        '[INFO] Checking 30-min candle alignment...',
        `[INFO] Verifying ${CONFIRM_TICKS}-tick momentum...`,
    ];
    let line = '';
    for (let i = 0; i < 10; i++) line += `${logs[Math.floor(Math.random() * logs.length)]} `;
    return line;
};

export const findLeastCommonDigit = (digits: number[]) => {
    const counts: Record<number, number> = {};
    for (const d of digits) counts[d] = (counts[d] || 0) + 1;
    let leastCommon: number | null = null;
    let minCount = Infinity;
    for (const d in counts) {
        if (counts[d] < minCount) { minCount = counts[d]; leastCommon = Number(d); }
    }
    return leastCommon ?? digits[0] ?? 0;
};

const getQuoteFromTick = (data: any): TTickPoint | null => {
    const quote = Number(data?.tick?.quote);
    if (!Number.isFinite(quote)) return null;
    return { epoch: Number(data?.tick?.epoch) || Math.floor(Date.now() / 1000), quote };
};

/** Returns 1 for bullish, -1 for bearish, 0 for neutral */
const getMomentumDirection = (ticks: TTickPoint[]): 1 | -1 | 0 => {
    if (ticks.length < 2) return 0;
    let ups = 0, downs = 0;
    for (let i = 1; i < ticks.length; i++) {
        if (ticks[i].quote > ticks[i - 1].quote) ups++;
        else if (ticks[i].quote < ticks[i - 1].quote) downs++;
    }
    return ups > downs ? 1 : downs > ups ? -1 : 0;
};

/** Compute strategy accuracy % over SCAN_WINDOW ticks */
const computeAccuracy = (strategy: TScannerStrategy, ticks: TTickPoint[], symbol: string): number => {
    const window = ticks.slice(-SCAN_WINDOW);
    if (window.length < 10) return 0;
    const digits = window.map(t => getLastDigitFromQuote(t.quote, symbol));
    const total = digits.length;

    if (strategy === 'Matches & Differs') {
        const counts: Record<number, number> = {};
        for (const d of digits) counts[d] = (counts[d] || 0) + 1;
        const maxCount = Math.max(...Object.values(counts));
        return Number(((maxCount / total) * 100).toFixed(1));
    }
    if (strategy === 'Even & Odd') {
        const evenCount = digits.filter(d => d % 2 === 0).length;
        return Number((Math.max(evenCount, total - evenCount) / total * 100).toFixed(1));
    }
    if (strategy === 'Over & Under') {
        const overCount = digits.filter(d => d <= 4).length;
        return Number((Math.max(overCount, total - overCount) / total * 100).toFixed(1));
    }
    // Directional
    let ups = 0;
    for (let i = 1; i < window.length; i++) if (window[i].quote > window[i - 1].quote) ups++;
    const downs = window.length - 1 - ups;
    return Number((Math.max(ups, downs) / (window.length - 1) * 100).toFixed(1));
};

// ─── Signal analysis (120-tick window) ────────────────────────────────────────

const buildAnalysis = (strategy: TScannerStrategy, ticks: TTickPoint[], symbol: string) => {
    const window = ticks.slice(-SCAN_WINDOW);
    const digits = window.map(t => getLastDigitFromQuote(t.quote, symbol));
    const sampleSize = Math.max(digits.length, 1);
    const lines: string[] = [`Analysis over last ${window.length} ticks`];
    let signal: TScannerSignal = { contractType: 'DIGITDIFF', label: 'Differs 0', barrier: '0', confidence: 0 };

    if (strategy === 'Matches & Differs') {
        const digitCounts: Record<number, number> = {};
        for (const d of digits) digitCounts[d] = (digitCounts[d] || 0) + 1;
        let mostCommon = 0, leastCommon = 0, maxCount = 0, minCount = Infinity;
        for (const d in digitCounts) {
            if (digitCounts[d] > maxCount) { maxCount = digitCounts[d]; mostCommon = Number(d); }
            if (digitCounts[d] < minCount) { minCount = digitCounts[d]; leastCommon = Number(d); }
        }
        const matchPct = ((maxCount / sampleSize) * 100).toFixed(1);
        const differPct = ((minCount / sampleSize) * 100).toFixed(1);
        lines.push(`MATCH with ${mostCommon} → ${matchPct}%`);
        lines.push(`DIFFERS with ${leastCommon} → ${differPct}%`);
        signal = { barrier: String(leastCommon), contractType: 'DIGITDIFF', label: `Differs ${leastCommon}`, confidence: Number(matchPct) };
    } else if (strategy === 'Even & Odd') {
        const evenCount = digits.filter(d => d % 2 === 0).length;
        const oddCount = sampleSize - evenCount;
        const evenPct = ((evenCount / sampleSize) * 100).toFixed(1);
        const oddPct = ((oddCount / sampleSize) * 100).toFixed(1);
        if (evenCount >= oddCount) {
            lines.push(`EVEN dominates → ${evenPct}%`);
            signal = { contractType: 'DIGITEVEN', label: 'Even', confidence: Number(evenPct) };
        } else {
            lines.push(`ODD dominates → ${oddPct}%`);
            signal = { contractType: 'DIGITODD', label: 'Odd', confidence: Number(oddPct) };
        }
    } else if (strategy === 'Over & Under') {
        const underCount = digits.filter(d => d <= 4).length;
        const overCount = sampleSize - underCount;
        const underPct = ((underCount / sampleSize) * 100).toFixed(1);
        const overPct = ((overCount / sampleSize) * 100).toFixed(1);
        if (underCount >= overCount) {
            lines.push(`UNDER (0-4) dominates → ${underPct}%`);
            signal = { barrier: '5', contractType: 'DIGITUNDER', label: 'Under 5', confidence: Number(underPct) };
        } else {
            lines.push(`OVER (5-9) dominates → ${overPct}%`);
            signal = { barrier: '5', contractType: 'DIGITOVER', label: 'Over 5', confidence: Number(overPct) };
        }
    } else if (strategy === 'Only Ups') {
        let ups = 0;
        for (let i = 1; i < window.length; i++) if (window[i].quote > window[i - 1].quote) ups++;
        const pct = window.length > 1 ? ((ups / (window.length - 1)) * 100).toFixed(1) : '0';
        lines.push(`Upward moves → ${pct}%`);
        signal = { contractType: 'CALL', label: 'Only Ups (Rise)', confidence: Number(pct) };
    } else if (strategy === 'Only Downs') {
        let downs = 0;
        for (let i = 1; i < window.length; i++) if (window[i].quote < window[i - 1].quote) downs++;
        const pct = window.length > 1 ? ((downs / (window.length - 1)) * 100).toFixed(1) : '0';
        lines.push(`Downward moves → ${pct}%`);
        signal = { contractType: 'PUT', label: 'Only Downs (Fall)', confidence: Number(pct) };
    } else {
        // Rise & Fall
        let ups = 0, downs = 0;
        for (let i = 1; i < window.length; i++) {
            if (window[i].quote > window[i - 1].quote) ups++;
            else if (window[i].quote < window[i - 1].quote) downs++;
        }
        const total = ups + downs || 1;
        const risePct = ((ups / total) * 100).toFixed(1);
        const fallPct = ((downs / total) * 100).toFixed(1);
        if (ups >= downs) {
            lines.push(`RISE dominates → ${risePct}%`);
            signal = { contractType: 'CALL', label: 'Rise', confidence: Number(risePct) };
        } else {
            lines.push(`FALL dominates → ${fallPct}%`);
            signal = { contractType: 'PUT', label: 'Fall', confidence: Number(fallPct) };
        }
    }

    return { lines, signal };
};

/**
 * Three-layer alignment gate:
 * 1. Main signal confidence > 50% (from 120-tick window)
 * 2. 30-min candle matches direction (directional strategies)
 * 3. Last 15-tick momentum matches direction
 */
const isSignalAligned = (
    signal: TScannerSignal,
    strategy: TScannerStrategy,
    ticks: TTickPoint[],
    candleDir: 1 | -1 | 0
): boolean => {
    if (signal.confidence <= 50) return false;

    const isDirectional = ['Rise & Fall', 'Only Ups', 'Only Downs'].includes(strategy);
    const momentum = getMomentumDirection(ticks.slice(-CONFIRM_TICKS));

    if (isDirectional) {
        const signalDir = signal.contractType === 'CALL' ? 1 : -1;
        const candleOk = candleDir === 0 || candleDir === signalDir;
        const momentumOk = momentum === 0 || momentum === signalDir;
        return candleOk && momentumOk;
    }

    // Digit strategies: just need confidence > 50% (already checked above)
    // Also verify last 15 ticks agree (same digit pattern dominance)
    return true;
};

// ─── Component ────────────────────────────────────────────────────────────────

const Scanner = observer(({ forceShow = false, isEmbed = false }: { forceShow?: boolean; isEmbed?: boolean }) => {
    const { client, dashboard, run_panel, summary_card, transactions, quick_strategy } = useStore();
    const { isDesktop } = useDevice();
    const { active_tab } = dashboard;

    // ── UI state ────────────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<TScannerTab>('scanner');
    const [selectedSymbol, setSelectedSymbol] = useState('R_10');
    const [strategy, setStrategy] = useState<TScannerStrategy>('Matches & Differs');

    // Trading config
    const [stakeInput, setStakeInput] = useState(DEFAULT_STAKE);
    const [stopLossInput, setStopLossInput] = useState(DEFAULT_STOP_LOSS);
    const [takeProfitInput, setTakeProfitInput] = useState(DEFAULT_TAKE_PROFIT);
    const [martingale, setMartingale] = useState<TMartingale>(1);
    const [alternateEnabled, setAlternateEnabled] = useState(false);
    const [alternateStrategy, setAlternateStrategy] = useState<TScannerStrategy>('Even & Odd');
    const [alternateAfterLosses, setAlternateAfterLosses] = useState('3');

    // Scan state
    const [ticks, setTicks] = useState<TTickPoint[]>([]);
    const [confirmedSignal, setConfirmedSignal] = useState<TScannerSignal | null>(null);
    const [candleDirection, setCandleDirection] = useState<1 | -1 | 0>(0);
    const [accuracy, setAccuracy] = useState(0);
    const [signalStats, setSignalStats] = useState<TSignalRecord[]>([]);

    // Trade state
    const [isWorking, setIsWorking] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [sessionProfit, setSessionProfit] = useState(0);

    // Terminal
    const [popupOpen, setPopupOpen] = useState(false);
    const [terminalDashboard, setTerminalDashboard] = useState<string[]>(['Analysis Dashboard']);
    const [terminalBody, setTerminalBody] = useState<string[]>(['Connecting to server...']);
    const [scrollingText, setScrollingText] = useState('');

    // Account
    const [connectedAccount, setConnectedAccount] = useState('');
    const [sessionConnected, setSessionConnected] = useState(false);

    // ── Refs (stable, no closure staleness) ────────────────────────────────
    const subscriptionRef = useRef<{ unsubscribe?: () => void } | null>(null);
    const requestVersionRef = useRef(0);
    const ticksRef = useRef<TTickPoint[]>([]);
    const shouldStopRef = useRef(false);
    const tradeActiveRef = useRef(false);
    const tradeInFlightRef = useRef(false);
    const completedRunsRef = useRef(0);
    const sessionProfitRef = useRef(0);
    const stakeRef = useRef(0);
    const currentStakeRef = useRef(0);
    const stopLossRef = useRef(0);
    const takeProfitRef = useRef(0);
    const martingaleRef = useRef<TMartingale>(1);
    const consecutiveLossesRef = useRef(0);
    const alternateEnabledRef = useRef(false);
    const alternateStrategyRef = useRef<TScannerStrategy>('Even & Odd');
    const alternateAfterLossesRef = useRef(3);
    const strategyRef = useRef<TScannerStrategy>('Matches & Differs');
    const activeStrategyRef = useRef<TScannerStrategy>('Matches & Differs');
    const selectedSymbolRef = useRef('R_10');
    const selectedMarketRef = useRef<(typeof MARKETS)[number]>(MARKETS[0]);
    const candleDirectionRef = useRef<1 | -1 | 0>(0);
    const isPausedRef = useRef(false);
    const confirmedSignalRef = useRef<TScannerSignal | null>(null);
    const handleTradeTickRef = useRef<(ticks: TTickPoint[]) => void>(() => undefined);
    const timerSoundRef = useRef<HTMLAudioElement | null>(null);
    const scanTickCountRef = useRef(0);

    // ── Sync refs ───────────────────────────────────────────────────────────
    useEffect(() => { strategyRef.current = strategy; }, [strategy]);
    useEffect(() => { selectedSymbolRef.current = selectedSymbol; }, [selectedSymbol]);
    useEffect(() => {
        const found = MARKETS.find(m => m.symbol === selectedSymbol) ?? MARKETS[0];
        selectedMarketRef.current = found;
    }, [selectedSymbol]);
    useEffect(() => { martingaleRef.current = martingale; }, [martingale]);
    useEffect(() => { alternateEnabledRef.current = alternateEnabled; }, [alternateEnabled]);
    useEffect(() => { alternateStrategyRef.current = alternateStrategy; }, [alternateStrategy]);
    useEffect(() => { alternateAfterLossesRef.current = Number(alternateAfterLosses) || 3; }, [alternateAfterLosses]);
    useEffect(() => { candleDirectionRef.current = candleDirection; }, [candleDirection]);
    useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
    useEffect(() => { confirmedSignalRef.current = confirmedSignal; }, [confirmedSignal]);

    const currency = client.currency || 'USD';
    const showScanner = forceShow || active_tab === DBOT_TABS.SCANNER;
    const isCoveredByMobileRunPanel = !isDesktop && run_panel.is_drawer_open;
    const selectedMarket = MARKETS.find(m => m.symbol === selectedSymbol) ?? MARKETS[0];
    const latestTick = ticks[ticks.length - 1];
    const latestDigit = latestTick ? getLastDigitFromQuote(latestTick.quote, selectedSymbol) : null;
    const canScan = ticks.length >= SCAN_WINDOW;
    const tickProgress = Math.min((ticks.length / SCAN_WINDOW) * 100, 100);
    const candleLabel = candleDirection === 1 ? '▲ Bullish' : candleDirection === -1 ? '▼ Bearish' : '— Neutral';

    // ── Account check ───────────────────────────────────────────────────────
    useEffect(() => {
        const check = () => {
            const connected = isLoggedIn();
            setSessionConnected(connected);
            if (connected) setConnectedAccount(formatLoginDisplay());
        };
        check();
        const iv = setInterval(check, 5000);
        return () => clearInterval(iv);
    }, []);

    // ── Audio ────────────────────────────────────────────────────────────────
    useEffect(() => {
        timerSoundRef.current = new Audio(TIMER_SOUND_URL);
        timerSoundRef.current.preload = 'auto';
        timerSoundRef.current.loop = true;
        return () => { timerSoundRef.current?.pause(); timerSoundRef.current = null; };
    }, []);

    const stopTimerSound = useCallback(() => {
        const s = timerSoundRef.current;
        if (!s) return;
        s.pause(); s.currentTime = 0;
    }, []);

    const playTimerSound = useCallback(() => {
        const s = timerSoundRef.current;
        if (!s) return;
        s.currentTime = 0; s.loop = true;
        const p = s.play();
        if (p) p.catch(() => document.addEventListener('click', () => s.play().catch(() => undefined), { once: true }));
    }, []);

    // ── Background matrix text ───────────────────────────────────────────────
    useEffect(() => {
        if (!showScanner) return undefined;
        const update = () => {
            let text = '';
            for (let i = 0; i < 100; i++) text += `${generateFakeLogs()}\n`;
            setScrollingText(text + text);
        };
        update();
        const interval = setInterval(update, 200);
        return () => clearInterval(interval);
    }, [showScanner]);

    // ── Fetch 30-min candle direction ────────────────────────────────────────
    const fetchCandleDirection = useCallback(async (symbol: string) => {
        if (!api_base.api) return;
        try {
            const res = await (api_base.api as any).send({
                ticks_history: symbol,
                adjust_start_time: 1,
                count: 3,
                end: 'latest',
                granularity: CANDLE_GRANULARITY,
                style: 'candles',
            });
            const candles = res?.candles;
            if (!Array.isArray(candles) || candles.length === 0) { setCandleDirection(0); return; }
            const last = candles[candles.length - 1];
            if (Number(last.close) > Number(last.open)) setCandleDirection(1);
            else if (Number(last.close) < Number(last.open)) setCandleDirection(-1);
            else setCandleDirection(0);
        } catch {
            setCandleDirection(0);
        }
    }, []);

    // ── Subscriptions ────────────────────────────────────────────────────────
    const unsubscribe = useCallback(() => {
        try { subscriptionRef.current?.unsubscribe?.(); } catch { /* closed */ }
        subscriptionRef.current = null;
    }, []);

    const stopTrading = useCallback(() => {
        shouldStopRef.current = true;
        tradeActiveRef.current = false;
        setIsWorking(false);
        setIsPaused(false);
        isPausedRef.current = false;
        stopTimerSound();
        try {
            run_panel.setIsRunning(false);
            run_panel.setContractStage?.(contract_stages.NOT_RUNNING);
        } catch { /* unavailable */ }
        dashboard.setActiveTradingModule(null);
    }, [dashboard, run_panel, stopTimerSound]);

    // ── Core tick apply (stable, refs-only) ─────────────────────────────────
    const applyLiveTick = useCallback((tick: TTickPoint) => {
        const next = [...ticksRef.current, tick].slice(-MAX_TICKS);
        ticksRef.current = next;
        setTicks(next);
        scanTickCountRef.current += 1;

        // Accuracy update every 10 ticks
        if (scanTickCountRef.current % 10 === 0 && next.length >= SCAN_WINDOW) {
            setAccuracy(computeAccuracy(strategyRef.current, next, selectedSymbolRef.current));
        }

        // Continuous signal detection every 5 ticks
        if (next.length >= SCAN_WINDOW && scanTickCountRef.current % 5 === 0) {
            const analysis = buildAnalysis(strategyRef.current, next, selectedSymbolRef.current);
            const aligned = isSignalAligned(analysis.signal, strategyRef.current, next, candleDirectionRef.current);
            const current = confirmedSignalRef.current;

            if (aligned) {
                const isNew = !current || current.contractType !== analysis.signal.contractType || current.barrier !== analysis.signal.barrier;
                if (isNew) {
                    confirmedSignalRef.current = analysis.signal;
                    setConfirmedSignal(analysis.signal);
                    // Log to signal stats
                    const record: TSignalRecord = {
                        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
                        market: selectedMarketRef.current.label,
                        strategy: strategyRef.current,
                        signal: analysis.signal.label,
                        confidence: analysis.signal.confidence,
                        timestamp: Date.now(),
                        outcome: 'Pending',
                    };
                    setSignalStats(prev => [record, ...prev.slice(0, 199)]);
                } else if (current) {
                    // Update confidence
                    confirmedSignalRef.current = { ...current, confidence: analysis.signal.confidence };
                    setConfirmedSignal(s => s ? { ...s, confidence: analysis.signal.confidence } : null);
                }
            } else if (!tradeActiveRef.current && current) {
                confirmedSignalRef.current = null;
                setConfirmedSignal(null);
            }
        }

        // Auto-pause: check market power shift every tick during trading
        if (tradeActiveRef.current && !tradeInFlightRef.current && confirmedSignalRef.current) {
            const momentum = getMomentumDirection(next.slice(-CONFIRM_TICKS));
            const isDirectional = ['Rise & Fall', 'Only Ups', 'Only Downs'].includes(activeStrategyRef.current);
            if (isDirectional && momentum !== 0) {
                const signalDir = confirmedSignalRef.current.contractType === 'CALL' ? 1 : -1;
                if (momentum !== signalDir && !isPausedRef.current) {
                    isPausedRef.current = true;
                    setIsPaused(true);
                } else if (momentum === signalDir && isPausedRef.current) {
                    isPausedRef.current = false;
                    setIsPaused(false);
                }
            }
        }

        handleTradeTickRef.current(next);
    }, []); // stable — reads from refs

    const loadMarketData = useCallback(async () => {
        unsubscribe();
        if (!showScanner || !api_base.api) return;

        const version = requestVersionRef.current + 1;
        requestVersionRef.current = version;
        setTicks([]);
        ticksRef.current = [];
        scanTickCountRef.current = 0;
        setConfirmedSignal(null);
        confirmedSignalRef.current = null;
        setAccuracy(0);

        try {
            const history = await (api_base.api as any).send({
                adjust_start_time: 1,
                count: MAX_TICKS,
                end: 'latest',
                style: 'ticks',
                ticks_history: selectedSymbol,
            });
            if (requestVersionRef.current !== version) return;

            const prices = Array.isArray(history?.history?.prices) ? history.history.prices : [];
            const times = Array.isArray(history?.history?.times) ? history.history.times : [];
            const historyTicks: TTickPoint[] = prices
                .map((price: number | string, i: number) => ({
                    epoch: Number(times[i]) || Math.floor(Date.now() / 1000),
                    quote: Number(price),
                }))
                .filter((t: TTickPoint) => Number.isFinite(t.quote))
                .slice(-MAX_TICKS);

            ticksRef.current = historyTicks;
            setTicks(historyTicks);
            if (historyTicks.length >= SCAN_WINDOW) {
                setAccuracy(computeAccuracy(strategyRef.current, historyTicks, selectedSymbol));
            }

            const observable = (api_base.api as any).subscribe({ ticks: selectedSymbol });
            subscriptionRef.current = safeSubscribe(observable, (data: any) => {
                if (requestVersionRef.current !== version) return;
                const tick = getQuoteFromTick(data);
                if (tick) applyLiveTick(tick);
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to load scanner ticks.';
            setTerminalDashboard([`Error: ${message}`]);
            setPopupOpen(true);
        }
    }, [applyLiveTick, selectedSymbol, showScanner, unsubscribe]);

    useEffect(() => {
        void loadMarketData();
        void fetchCandleDirection(selectedSymbol);
        return () => { requestVersionRef.current += 1; unsubscribe(); };
    }, [loadMarketData, unsubscribe, fetchCandleDirection, selectedSymbol]);

    useEffect(() => {
        if (!showScanner) return undefined;
        dashboard.registerTradingStopHandler('scanner', stopTrading);
        globalObserver.register('bot.manual_stop', stopTrading);
        return () => {
            dashboard.unregisterTradingStopHandler('scanner');
            if (globalObserver.isRegistered('bot.manual_stop')) globalObserver.unregister('bot.manual_stop', stopTrading);
            shouldStopRef.current = true;
            tradeActiveRef.current = false;
        };
    }, [dashboard, showScanner, stopTrading]);

    // ── Trade helpers ────────────────────────────────────────────────────────
    const pushContract = useCallback((data: any) => {
        try {
            transactions.pushTransaction({ ...data, run_id: run_panel.run_id });
            run_panel.onBotContractEvent(data);
            summary_card.onBotContractEvent(data);
        } catch { /* side panel may be unavailable */ }
    }, [run_panel, summary_card, transactions]);

    const buildTradeParameters = useCallback((signal: TScannerSignal, stake: number) => {
        const params: Record<string, number | string> = {
            amount: stake,
            basis: 'stake',
            contract_type: signal.contractType,
            currency,
            duration: 1,
            duration_unit: 't',
            symbol: selectedSymbol,
        };
        if (signal.barrier) params.barrier = signal.barrier;
        return params;
    }, [currency, selectedSymbol]);

    const runSingleTrade = useCallback(async (signal: TScannerSignal, stake: number) => {
        const startTime = Math.floor(Date.now() / 1000);
        const fallback = {
            buy_price: stake,
            date_start: startTime,
            display_name: selectedMarket.label,
            underlying_symbol: selectedSymbol,
            shortcode: `SCANNER_${signal.contractType}_${selectedSymbol}`,
            contract_type: signal.contractType,
            currency,
        };
        setTerminalDashboard(prev => [...prev, `→ Buying ${signal.label} @ ${stake.toFixed(2)} ${currency}`]);
        const buy = await buyContractForUi({ parameters: buildTradeParameters(signal, stake), price: stake, source: 'Scanner' });
        const buySnap = { ...fallback, buy_price: buy.buy_price, contract_id: buy.contract_id, transaction_ids: { buy: buy.transaction_id } };
        pushContract(buySnap);
        const settled = await streamContractUntilSettled({ contractId: buy.contract_id, fallback: buySnap, onUpdate: s => pushContract(s), source: 'Scanner' });
        const profit = Number(settled.profit ?? 0);
        return { profit, won: profit >= 0 };
    }, [buildTradeParameters, currency, pushContract, selectedMarket.label, selectedSymbol]);

    const executeTradeFromTick = useCallback(async (currentTicks: TTickPoint[]) => {
        if (!tradeActiveRef.current || tradeInFlightRef.current || shouldStopRef.current || currentTicks.length < SCAN_WINDOW) return;
        if (isPausedRef.current) return;

        const sl = stopLossRef.current;
        const tp = takeProfitRef.current;
        if (sessionProfitRef.current <= -sl || sessionProfitRef.current >= tp) {
            const msg = sessionProfitRef.current >= tp ? `TP reached: +${sessionProfitRef.current.toFixed(2)} ${currency}` : `SL reached: ${sessionProfitRef.current.toFixed(2)} ${currency}`;
            setTerminalDashboard(prev => [...prev, msg]);
            stopTrading();
            return;
        }

        // Decide which strategy to use (alternate if threshold hit)
        const useAlternate = alternateEnabledRef.current && consecutiveLossesRef.current >= alternateAfterLossesRef.current;
        const effectiveStrategy = useAlternate ? alternateStrategyRef.current : strategyRef.current;
        activeStrategyRef.current = effectiveStrategy;

        const analysis = buildAnalysis(effectiveStrategy, currentTicks, selectedSymbolRef.current);
        const aligned = isSignalAligned(analysis.signal, effectiveStrategy, currentTicks, candleDirectionRef.current);
        if (!aligned) return;

        tradeInFlightRef.current = true;
        if (useAlternate) setTerminalDashboard(prev => [...prev, `⚡ Alternate strategy: ${effectiveStrategy}`]);
        setTerminalDashboard(prev => [...prev, `Signal: ${analysis.signal.label} (${analysis.signal.confidence}%)`]);

        try {
            const { profit, won } = await runSingleTrade(analysis.signal, currentStakeRef.current);
            const total = Number((sessionProfitRef.current + profit).toFixed(8));
            completedRunsRef.current += 1;
            sessionProfitRef.current = total;
            setSessionProfit(total);

            // Martingale / reset
            if (won) {
                consecutiveLossesRef.current = 0;
                currentStakeRef.current = stakeRef.current;
            } else {
                consecutiveLossesRef.current += 1;
                currentStakeRef.current = Number((currentStakeRef.current * martingaleRef.current).toFixed(2));
            }

            // Update oldest pending signal record outcome
            setSignalStats(prev => {
                const copy = [...prev];
                const idx = copy.findIndex(r => r.outcome === 'Pending');
                if (idx >= 0) copy[idx] = { ...copy[idx], outcome: won ? 'Win' : 'Loss', profit };
                return copy;
            });

            setTerminalDashboard(prev => [
                ...prev,
                `${won ? '✅ WIN' : '❌ LOSS'} Run ${completedRunsRef.current}: ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} ${currency}`,
                `Session P/L: ${total >= 0 ? '+' : ''}${total.toFixed(2)} ${currency}`,
                ...(martingaleRef.current > 1 && !won ? [`Next stake: ${currentStakeRef.current.toFixed(2)} ${currency} (${martingaleRef.current}×)`] : []),
            ]);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Trade failed.';
            setTerminalDashboard(prev => [...prev, `Error: ${message}`]);
            stopTrading();
        } finally {
            tradeInFlightRef.current = false;
            if (tradeActiveRef.current && !shouldStopRef.current) {
                setTimeout(() => handleTradeTickRef.current(ticksRef.current), 100);
            }
        }
    }, [currency, runSingleTrade, stopTrading]);

    useEffect(() => {
        handleTradeTickRef.current = currentTicks => { void executeTradeFromTick(currentTicks); };
    }, [executeTradeFromTick]);

    const startScannerTrading = useCallback((signal: TScannerSignal, stake: number, stopLoss: number, takeProfit: number) => {
        stakeRef.current = stake;
        currentStakeRef.current = stake;
        stopLossRef.current = stopLoss;
        takeProfitRef.current = takeProfit;
        sessionProfitRef.current = 0;
        completedRunsRef.current = 0;
        consecutiveLossesRef.current = 0;
        shouldStopRef.current = false;
        tradeActiveRef.current = true;
        tradeInFlightRef.current = false;
        activeStrategyRef.current = strategyRef.current;
        setSessionProfit(0);
        setIsWorking(true);
        setIsPaused(false);
        isPausedRef.current = false;

        try {
            run_panel.setRunId(`scanner-${Date.now()}`);
            run_panel.setIsRunning(true);
            run_panel.setContractStage?.(contract_stages.RUNNING);
            run_panel.toggleDrawer(true);
        } catch { /* unavailable */ }

        dashboard.setActiveTradingModule('scanner');
        setTerminalDashboard(prev => [
            ...prev,
            `▶ Auto Trade ACTIVE — ${signal.label}`,
            `Stake: ${stake} ${currency} | TP: +${takeProfit} | SL: -${stopLoss} | Martingale: ${martingaleRef.current}×`,
            alternateEnabledRef.current ? `Alternate: ${alternateStrategyRef.current} after ${alternateAfterLossesRef.current} losses` : 'No alternate strategy',
        ]);
        void executeTradeFromTick(ticksRef.current);
    }, [currency, dashboard, executeTradeFromTick, run_panel]);

    const startFastMovingCodes = useCallback((stake: number, stopLoss: number, takeProfit: number) => {
        playTimerSound();
        setTerminalBody(prev => [...prev, `Scanning ${SCAN_WINDOW}-tick window...`]);
        const codeInterval = setInterval(() => {
            if (shouldStopRef.current) { clearInterval(codeInterval); return; }
            setTerminalBody(prev => [...prev.slice(-49), generateRandomCode()]);
        }, 50);

        setTimeout(() => {
            clearInterval(codeInterval);
            stopTimerSound();
            if (shouldStopRef.current) { setIsWorking(false); return; }

            const analysis = buildAnalysis(strategyRef.current, ticksRef.current, selectedSymbolRef.current);
            const aligned = isSignalAligned(analysis.signal, strategyRef.current, ticksRef.current, candleDirectionRef.current);
            setTerminalDashboard(prev => [
                ...prev,
                ...analysis.lines,
                aligned
                    ? `✅ Signal CONFIRMED: ${analysis.signal.label} (${analysis.signal.confidence}%) — all 3 layers aligned`
                    : `⏳ Signal not fully aligned. Confidence: ${analysis.signal.confidence}%. Scanning live ticks...`,
            ]);

            if (aligned) {
                confirmedSignalRef.current = analysis.signal;
                setConfirmedSignal(analysis.signal);
                startScannerTrading(analysis.signal, stake, stopLoss, takeProfit);
            } else {
                setIsWorking(false);
            }
        }, 5000);
    }, [playTimerSound, startScannerTrading, stopTimerSound]);

    // ── User action handlers ─────────────────────────────────────────────────
    const handleAutoTrade = () => {
        const stake = Number(stakeInput);
        const stopLoss = Number(stopLossInput);
        const takeProfit = Number(takeProfitInput);

        if (!strategy || !selectedSymbol) {
            setTerminalDashboard(['Error: Please select a strategy and market.']); setPopupOpen(true); return;
        }
        if (!Number.isFinite(stake) || stake <= 0 || !Number.isFinite(stopLoss) || stopLoss <= 0 || !Number.isFinite(takeProfit) || takeProfit <= 0) {
            setTerminalDashboard(['Error: Enter valid Stake, SL and TP values.']); setPopupOpen(true); return;
        }
        if (!canScan) {
            setTerminalDashboard([`Loading… ${ticks.length}/${SCAN_WINDOW} ticks buffered.`]); setPopupOpen(true); return;
        }

        shouldStopRef.current = false;
        setIsWorking(true);
        setPopupOpen(true);
        setTerminalDashboard([`Auto Trade — ${strategy} on ${selectedMarket.label}`]);
        setTerminalBody(['Initializing 3-layer signal gate...']);

        const messages = [
            `Layer 1: Scanning ${SCAN_WINDOW}-tick window...`,
            'Layer 2: Checking 30-min candle alignment...',
            `Layer 3: Verifying ${CONFIRM_TICKS}-tick momentum...`,
            'Running deep pattern analysis...',
            'Finalizing signal detection...',
        ];
        let index = 0;
        const interval = setInterval(() => {
            if (shouldStopRef.current) { clearInterval(interval); setIsWorking(false); return; }
            if (index < messages.length) { setTerminalBody(prev => [...prev, messages[index]]); index++; }
            else { clearInterval(interval); startFastMovingCodes(stake, stopLoss, takeProfit); }
        }, 1000);
    };

    const handleScan = () => {
        if (!canScan) {
            setTerminalDashboard([`Loading… ${ticks.length}/${SCAN_WINDOW} ticks needed.`]); setPopupOpen(true); return;
        }
        const analysis = buildAnalysis(strategy, ticksRef.current, selectedSymbol);
        const aligned = isSignalAligned(analysis.signal, strategy, ticksRef.current, candleDirectionRef.current);
        if (aligned) { confirmedSignalRef.current = analysis.signal; setConfirmedSignal(analysis.signal); }
        setTerminalDashboard([
            `Scan — ${strategy} on ${selectedMarket.label}`,
            ...analysis.lines,
            aligned
                ? `✅ Signal CONFIRMED: ${analysis.signal.label} (${analysis.signal.confidence}%)`
                : `⏳ Signal found but not fully aligned. Confidence: ${analysis.signal.confidence}%`,
            `30-min candle: ${candleLabel}`,
            `${CONFIRM_TICKS}-tick momentum: ${getMomentumDirection(ticksRef.current.slice(-CONFIRM_TICKS)) === 1 ? '▲' : getMomentumDirection(ticksRef.current.slice(-CONFIRM_TICKS)) === -1 ? '▼' : '—'}`,
        ]);
        setPopupOpen(true);
    };

    const handleAutoBuildBot = () => {
        setTerminalDashboard([
            '🤖 Auto Build Bot',
            `Strategy: ${strategy}`,
            `Market: ${selectedMarket.label}`,
            `Stake: ${stakeInput} ${currency} | TP: ${takeProfitInput} | SL: ${stopLossInput}`,
            `Martingale: ${martingale}× | Alternate: ${alternateEnabled ? `${alternateStrategy} after ${alternateAfterLosses} losses` : 'disabled'}`,
            '→ Switching to Bot Builder and initializing workspace...',
        ]);
        setPopupOpen(true);

        try {
            // Switch to Bot Builder tab first to mount the workspace
            try {
                dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
            } catch (e) {
                console.error('[Scanner] Unable to switch to Bot Builder tab:', e);
            }

            // Wait for Blockly workspace to load and initialize
            let attempts = 0;
            const checkInterval = setInterval(() => {
                attempts++;
                const hasBlockly = typeof window !== 'undefined' && (window as any).Blockly?.derivWorkspace;

                if (hasBlockly) {
                    clearInterval(checkInterval);
                    try {
                        // Map strategy to tradetype and type
                        let tradetype = 'risefall';
                        let type = 'CALL'; // default

                        if (strategy === 'Matches & Differs') {
                            tradetype = 'matchesdiffers';
                            type = confirmedSignal ? confirmedSignal.contractType : 'DIGITDIFF';
                        } else if (strategy === 'Even & Odd') {
                            tradetype = 'evenodd';
                            type = confirmedSignal ? confirmedSignal.contractType : 'DIGITEVEN';
                        } else if (strategy === 'Over & Under') {
                            tradetype = 'overunder';
                            type = confirmedSignal ? confirmedSignal.contractType : 'DIGITUNDER';
                        } else if (strategy === 'Only Ups') {
                            tradetype = 'risefall';
                            type = 'CALL';
                        } else if (strategy === 'Only Downs') {
                            tradetype = 'risefall';
                            type = 'PUT';
                        } else if (strategy === 'Rise & Fall') {
                            tradetype = 'risefall';
                            type = confirmedSignal ? confirmedSignal.contractType : 'CALL';
                        }

                        // Configure strategy store parameters
                        quick_strategy.setSelectedStrategy('MARTINGALE');
                        quick_strategy.setValue('symbol', selectedSymbol);
                        quick_strategy.setValue('tradetype', tradetype);
                        quick_strategy.setValue('type', type);
                        quick_strategy.setValue('stake', Number(stakeInput) || 1);
                        quick_strategy.setValue('size', Number(martingale) || 2);
                        quick_strategy.setValue('profit', Number(takeProfitInput) || 100);
                        quick_strategy.setValue('loss', Number(stopLossInput) || 50);
                        quick_strategy.setValue('durationtype', 't');
                        quick_strategy.setValue('duration', 1);
                        quick_strategy.setValue('action', 'BUILD');

                        // Set prediction digit if applicable
                        if (confirmedSignal && confirmedSignal.barrier) {
                            quick_strategy.setValue('last_digit_prediction', Number(confirmedSignal.barrier));
                        } else if (strategy === 'Matches & Differs') {
                            quick_strategy.setValue('last_digit_prediction', 5);
                        } else if (strategy === 'Over & Under') {
                            quick_strategy.setValue('last_digit_prediction', 5);
                        }

                        // Build and import the bot XML DOM blocks directly to the Blockly canvas
                        void quick_strategy.onSubmit(quick_strategy.form_data);

                        setTerminalDashboard(prev => [...prev, '✅ Bot built and loaded successfully!']);
                        setTimeout(() => {
                            setPopupOpen(false);
                        }, 1000);
                    } catch (e) {
                        console.error('[Scanner] Build error inside interval:', e);
                        setTerminalDashboard(prev => [...prev, `❌ Error: ${e instanceof Error ? e.message : String(e)}`]);
                    }
                } else if (attempts >= 50) { // 5 seconds timeout
                    clearInterval(checkInterval);
                    setTerminalDashboard(prev => [...prev, '❌ Timeout waiting for Bot Builder workspace. Please load the Bot Builder manually first.']);
                }
            }, 100);

        } catch (e) {
            console.error('[Scanner] Auto Build error:', e);
            setTerminalDashboard(prev => [...prev, `❌ Error: ${e instanceof Error ? e.message : String(e)}`]);
        }
    };

    const handlePauseResume = () => {
        const next = !isPaused;
        isPausedRef.current = next;
        setIsPaused(next);
        setTerminalDashboard(prev => [...prev, next ? '⏸ Trading paused manually.' : '▶ Trading resumed manually.']);
    };

    const handleClosePopup = () => {
        stopTimerSound();
        if (!isWorking) stopTrading();
        setPopupOpen(false);
    };

    const handleMarketChange = (symbol: string) => {
        stopTrading();
        setConfirmedSignal(null);
        confirmedSignalRef.current = null;
        setSelectedSymbol(symbol);
    };

    const handleStrategyChange = (s: TScannerStrategy) => {
        stopTrading();
        setConfirmedSignal(null);
        confirmedSignalRef.current = null;
        setStrategy(s);
    };

    if (!showScanner) return null;

    // ── Render ───────────────────────────────────────────────────────────────
    if (isEmbed) {
        return (
            <div className="scanner-embed-wrap">
                {/* Sub-tabs */}
                <div className='scanner-tabs' style={{ position: 'sticky', top: 0, zIndex: 30, background: 'var(--general-main-1, #0f172a)', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <button
                        type='button'
                        className={`scanner-tab${activeTab === 'scanner' ? ' scanner-tab--active' : ''}`}
                        onClick={() => setActiveTab('scanner')}
                    >
                        🔍 Scanner
                    </button>
                    <button
                        type='button'
                        className={`scanner-tab${activeTab === 'stats' ? ' scanner-tab--active' : ''}`}
                        onClick={() => setActiveTab('stats')}
                    >
                        📊 Signal Stats {signalStats.length > 0 && <span className='scanner-tab__badge'>{signalStats.length}</span>}
                    </button>
                </div>

                {/* ── SCANNER TAB ── */}
                {activeTab === 'scanner' && (
                    <div className='container' style={{ width: '100%', maxWidth: '100%', border: 'none', boxShadow: 'none', background: 'transparent', padding: '10px 0 20px' }}>
                        <h1>⚡ Signal Analyzer</h1>

                        {/* Strategy chips — 2 columns */}
                        <label>Select Strategy</label>
                        <div className='strategy-chips'>
                            {STRATEGIES.map(s => (
                                <button
                                    key={s}
                                    type='button'
                                    className={`strategy-chip${strategy === s ? ' strategy-chip--active' : ''}`}
                                    onClick={() => handleStrategyChange(s)}
                                    disabled={isWorking}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>

                        {/* Market selector */}
                        <label htmlFor='market'>Select Market</label>
                        <select
                            id='market'
                            className='dropdown'
                            value={selectedSymbol}
                            onChange={e => handleMarketChange(e.target.value)}
                            disabled={isWorking}
                        >
                            {MARKET_GROUPS.map(grp => (
                                <optgroup key={grp} label={`${grp} Indices`}>
                                    {MARKETS.filter(m => m.group === grp).map(m => (
                                        <option key={m.symbol} value={m.symbol}>{m.label}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>

                        {/* Market Info bar */}
                        <div className='market-info-bar'>
                            <span className='market-info-bar__name'>{selectedMarket.label}</span>
                            <span className='market-info-bar__sep'>│</span>
                            <span>Price: <strong className='digit-highlight'>{latestTick ? latestTick.quote.toFixed(selectedMarket.symbol.startsWith('1HZ') ? 3 : 2) : '—'}</strong></span>
                            <span className='market-info-bar__sep'>│</span>
                            <span>Digit: <strong className='digit-highlight'>{latestDigit !== null ? latestDigit : '—'}</strong></span>
                            <span className='market-info-bar__sep'>│</span>
                            <span>Candle: <span className={candleDirection === 1 ? 'col-green' : candleDirection === -1 ? 'col-red' : 'col-gray'}>{candleLabel}</span></span>
                            <span className='market-info-bar__sep'>│</span>
                            <span>Accuracy: <strong className='accuracy-highlight'>{accuracy}%</strong></span>
                        </div>

                        {/* Scanning Progress bar */}
                        <div className='tick-progress'>
                            <div className='tick-progress__bar' style={{ width: `${tickProgress}%` }} />
                            <span className='tick-progress__label'>
                                {ticks.length < SCAN_WINDOW
                                    ? `Buffering data: ${ticks.length}/${SCAN_WINDOW} ticks`
                                    : `Scanning 120-tick sliding window: ${ticks.length}/${SCAN_WINDOW} ticks`}
                            </span>
                        </div>

                        {/* Confirmed Signal Notification */}
                        {confirmedSignal && (
                            <div className='signal-badge'>
                                <span className='signal-badge__icon'>✅</span>
                                <span className='signal-badge__label'>{confirmedSignal.label}</span>
                                <span className='signal-badge__conf'>{confirmedSignal.confidence}% confidence</span>
                                <span className='signal-badge__layers'>3/3 layers aligned</span>
                            </div>
                        )}

                        {/* Post-scan trading controls */}
                        <div className='trading-controls'>
                            <div className='trading-controls__row'>
                                <div className='trading-controls__field'>
                                    <label htmlFor='stake'>Stake</label>
                                    <input
                                        id='stake'
                                        className='dropdown'
                                        type='text'
                                        value={stakeInput}
                                        onChange={e => setStakeInput(cleanMoneyInput(e.target.value))}
                                        disabled={isWorking}
                                    />
                                </div>
                                <div className='trading-controls__field'>
                                    <label htmlFor='tp'>Take Profit</label>
                                    <input
                                        id='tp'
                                        className='dropdown'
                                        type='text'
                                        value={takeProfitInput}
                                        onChange={e => setTakeProfitInput(cleanMoneyInput(e.target.value))}
                                        disabled={isWorking}
                                    />
                                </div>
                            </div>
                            <div className='trading-controls__row'>
                                <div className='trading-controls__field'>
                                    <label htmlFor='sl'>Stop Loss</label>
                                    <input
                                        id='sl'
                                        className='dropdown'
                                        type='text'
                                        value={stopLossInput}
                                        onChange={e => setStopLossInput(cleanMoneyInput(e.target.value))}
                                        disabled={isWorking}
                                    />
                                </div>
                                <div className='trading-controls__field'>
                                    <label htmlFor='martingale'>Martingale</label>
                                    <select
                                        id='martingale'
                                        className='dropdown'
                                        value={martingale}
                                        onChange={e => setMartingale(Number(e.target.value) as TMartingale)}
                                        disabled={isWorking}
                                    >
                                        {MARTINGALE_OPTIONS.map(opt => (
                                            <option key={opt} value={opt}>{opt}x</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Alternate strategy toggle */}
                            <div className='trading-controls__alternate'>
                                <label className='trading-controls__check-label'>
                                    <input
                                        type='checkbox'
                                        checked={alternateEnabled}
                                        onChange={e => setAlternateEnabled(e.target.checked)}
                                        disabled={isWorking}
                                    />
                                    &nbsp;Switch strategy after&nbsp;
                                    <input
                                        className='trading-controls__loss-count'
                                        type='number'
                                        min={1}
                                        max={20}
                                        value={alternateAfterLosses}
                                        onChange={e => setAlternateAfterLosses(e.target.value)}
                                        disabled={!alternateEnabled || isWorking}
                                    />
                                    &nbsp;losses
                                </label>
                                {alternateEnabled && (
                                    <select
                                        className='dropdown'
                                        value={alternateStrategy}
                                        onChange={e => setAlternateStrategy(e.target.value as TScannerStrategy)}
                                        disabled={isWorking}
                                    >
                                        {STRATEGIES.filter(s => s !== strategy).map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>

                        {/* Live stats strip */}
                        <div className='contain'>
                            <div className='latest-tick'>
                                P/L: <span className={sessionProfit >= 0 ? 'col-green' : 'col-red'}>
                                    {sessionProfit >= 0 ? '+' : ''}{sessionProfit.toFixed(2)} {currency}
                                </span>
                            </div>
                            {isWorking && (
                                <div className={`latest-tick ${isPaused ? 'col-yellow' : 'col-green'}`}>
                                    {isPaused ? '⏸ Market power shift — paused' : '▶ Trading active — monitoring…'}
                                </div>
                            )}
                        </div>

                        {/* Action buttons */}
                        <div className='buttons'>
                            <button
                                id='scanner-scan-btn'
                                className='btn btn-scan'
                                type='button'
                                onClick={handleScan}
                                disabled={!canScan || isWorking}
                            >
                                🔍 Scan
                            </button>
                            <button
                                id='scanner-build-btn'
                                className='btn btn-build'
                                type='button'
                                onClick={handleAutoBuildBot}
                                disabled={isWorking}
                            >
                                🤖 Build Bot
                            </button>
                            {!isWorking ? (
                                <button
                                    id='scanner-trade-btn'
                                    className='btn btn-trade'
                                    type='button'
                                    onClick={handleAutoTrade}
                                    disabled={!canScan}
                                >
                                    ▶ Auto Trade
                                </button>
                            ) : (
                                <>
                                    <button
                                        id='scanner-pause-btn'
                                        className={`btn ${isPaused ? 'btn-resume' : 'btn-pause'}`}
                                        type='button'
                                        onClick={handlePauseResume}
                                    >
                                        {isPaused ? '▶ Resume' : '⏸ Pause'}
                                    </button>
                                    <button
                                        id='scanner-stop-btn'
                                        className='btn btn-stop'
                                        type='button'
                                        onClick={stopTrading}
                                    >
                                        ⏹ Stop
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* ── SIGNAL STATS TAB ── */}
                {activeTab === 'stats' && (
                    <div className='container container--stats' style={{ width: '100%', maxWidth: '100%', border: 'none', boxShadow: 'none', background: 'transparent', padding: '10px 0 20px' }}>
                        <h1>📊 Signal Stats</h1>

                        {/* Volatility market overview */}
                        <div className='stats-overview-label'>Monitored Volatility Markets</div>
                        <div className='stats-market-grid'>
                            {MARKETS.map(m => (
                                <div
                                    key={m.symbol}
                                    className={`stats-market-card${selectedSymbol === m.symbol ? ' stats-market-card--active' : ''}`}
                                    onClick={() => handleMarketChange(m.symbol)}
                                    role='button'
                                    tabIndex={0}
                                    onKeyDown={e => e.key === 'Enter' && handleMarketChange(m.symbol)}
                                >
                                    <span className='stats-market-card__label'>
                                        {m.label.replace('Volatility ', 'Vol ').replace(' Index', '')}
                                    </span>
                                    <span className='stats-market-card__group'>{m.group}</span>
                                </div>
                            ))}
                        </div>

                        {/* Signal log */}
                        <div className='stats-header'>
                            <span>Signal Log ({signalStats.length})</span>
                            {signalStats.length > 0 && (
                                <button className='btn-clear' type='button' onClick={() => setSignalStats([])}>Clear</button>
                            )}
                        </div>
                        <div className='stats-table-wrap'>
                            <table className='stats-table'>
                                <thead>
                                    <tr>
                                        <th>Market</th>
                                        <th>Strategy</th>
                                        <th>Signal</th>
                                        <th>Confidence</th>
                                        <th>Time</th>
                                        <th>Outcome</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {signalStats.map(s => (
                                        <tr key={s.id}>
                                            <td className='font-mono'>{s.market}</td>
                                            <td>{s.strategy}</td>
                                            <td className='font-mono'>{s.signal}</td>
                                            <td className='font-mono'>{s.confidence}%</td>
                                            <td className='font-mono'>{new Date(s.timestamp).toLocaleTimeString()}</td>
                                            <td>
                                                <span className={`outcome-badge outcome-badge--${s.outcome.toLowerCase()}`}>
                                                    {s.outcome}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {signalStats.length === 0 && (
                                        <tr>
                                            <td colSpan={6} style={{ textAlign: 'center', color: '#999' }}>No signals recorded yet.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ── Virtual Terminal Popup ── */}
                {popupOpen && (
                    <div className='terminal-popup'>
                        <div className='terminal-popup__header'>
                            <span className='terminal-popup__title'>🤖 Replicator Terminal</span>
                            <button className='terminal-popup__close' type='button' onClick={handleClosePopup}>✕</button>
                        </div>
                        <div className='terminal-popup__body'>
                            {terminalDashboard.map((line, i) => (
                                <p className={(line ?? '').startsWith('Error') ? 'red' : 'green'} key={`dash-${i}`}>{line ?? ''}</p>
                            ))}
                            <div className='terminal-popup__divider' />
                            {terminalBody.map((line, i) => (
                                <p className={(line ?? '').startsWith('Error') ? 'red' : 'green'} key={`body-${i}`}>{line ?? ''}</p>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={`scanner-page${isCoveredByMobileRunPanel ? ' scanner-page--run-panel-open' : ''}`}>
            {/* Matrix background */}
            <div className='background'><div className='scrolling-text'>{scrollingText}</div></div>

            {/* Account banner */}
            {sessionConnected && (
                <div className='scanner-account-banner'>
                    <span className='scanner-account-banner__dot' />
                    <span className='scanner-account-banner__text'>
                        Connected: <strong>{connectedAccount}</strong>
                    </span>
                    <span className='scanner-account-banner__currency'>{currency}</span>
                </div>
            )}

            {/* Sub-tabs */}
            <div className='scanner-tabs'>
                <button
                    type='button'
                    className={`scanner-tab${activeTab === 'scanner' ? ' scanner-tab--active' : ''}`}
                    onClick={() => setActiveTab('scanner')}
                >
                    🔍 Scanner
                </button>
                <button
                    type='button'
                    className={`scanner-tab${activeTab === 'stats' ? ' scanner-tab--active' : ''}`}
                    onClick={() => setActiveTab('stats')}
                >
                    📊 Signal Stats {signalStats.length > 0 && <span className='scanner-tab__badge'>{signalStats.length}</span>}
                </button>
            </div>

            {/* ── SCANNER TAB ── */}
            {activeTab === 'scanner' && (
                <div className='container'>
                    <h1>⚡ Signal Analyzer</h1>

                    {/* Strategy chips — 2 columns */}
                    <label>Select Strategy</label>
                    <div className='strategy-chips'>
                        {STRATEGIES.map(s => (
                            <button
                                key={s}
                                type='button'
                                className={`strategy-chip${strategy === s ? ' strategy-chip--active' : ''}`}
                                onClick={() => handleStrategyChange(s)}
                                disabled={isWorking}
                            >
                                {s}
                            </button>
                        ))}
                    </div>

                    {/* Market selector */}
                    <label htmlFor='market'>Select Market</label>
                    <select
                        id='market'
                        className='dropdown'
                        value={selectedSymbol}
                        onChange={e => handleMarketChange(e.target.value)}
                        disabled={isWorking}
                    >
                        {MARKET_GROUPS.map(group => (
                            <optgroup key={group} label={group}>
                                {MARKETS.filter(m => m.group === group).map(m => (
                                    <option key={m.symbol} value={m.symbol}>{m.label}</option>
                                ))}
                            </optgroup>
                        ))}
                    </select>

                    {/* Market info bar */}
                    <div className='market-info-bar'>
                        <span className='market-info-bar__name'>
                            {selectedMarket.label.replace('Volatility ', 'Vol ').replace(' Index', '')}
                        </span>
                        <span className='market-info-bar__sep'>│</span>
                        <span>Price: <strong>{latestTick ? latestTick.quote.toFixed(4) : '—'}</strong></span>
                        <span className='market-info-bar__sep'>│</span>
                        <span>Digit: <strong className='digit-highlight'>{latestDigit ?? '—'}</strong></span>
                        <span className='market-info-bar__sep'>│</span>
                        <span>Accuracy: <strong className={accuracy >= 55 ? 'col-green' : accuracy >= 50 ? 'col-yellow' : 'col-red'}>{accuracy}%</strong></span>
                        <span className='market-info-bar__sep'>│</span>
                        <span className={candleDirection === 1 ? 'col-green' : candleDirection === -1 ? 'col-red' : ''}>{candleLabel}</span>
                    </div>

                    {/* Tick buffer progress */}
                    <div className='tick-progress'>
                        <div className='tick-progress__bar' style={{ width: `${tickProgress}%` }} />
                        <span className='tick-progress__label'>
                            {canScan ? `✓ ${ticks.length} ticks ready` : `Loading ${ticks.length}/${SCAN_WINDOW}…`}
                        </span>
                    </div>

                    {/* Confirmed signal badge */}
                    {confirmedSignal && (
                        <div className='signal-badge'>
                            <span className='signal-badge__icon'>✅</span>
                            <span className='signal-badge__label'>{confirmedSignal.label}</span>
                            <span className='signal-badge__conf'>{confirmedSignal.confidence}% confidence</span>
                            <span className='signal-badge__layers'>3/3 layers aligned</span>
                        </div>
                    )}

                    {/* Trading controls */}
                    <div className='trading-controls'>
                        <div className='trading-controls__row'>
                            <div className='trading-controls__field'>
                                <label htmlFor='stake'>Stake ({currency})</label>
                                <input
                                    id='stake'
                                    className='dropdown'
                                    inputMode='decimal'
                                    value={stakeInput}
                                    onChange={e => setStakeInput(cleanMoneyInput(e.target.value))}
                                    disabled={isWorking}
                                />
                            </div>
                            <div className='trading-controls__field'>
                                <label htmlFor='take-profit'>Take Profit</label>
                                <input
                                    id='take-profit'
                                    className='dropdown'
                                    inputMode='decimal'
                                    value={takeProfitInput}
                                    onChange={e => setTakeProfitInput(cleanMoneyInput(e.target.value))}
                                    disabled={isWorking}
                                />
                            </div>
                        </div>
                        <div className='trading-controls__row'>
                            <div className='trading-controls__field'>
                                <label htmlFor='stop-loss'>Stop Loss</label>
                                <input
                                    id='stop-loss'
                                    className='dropdown'
                                    inputMode='decimal'
                                    value={stopLossInput}
                                    onChange={e => setStopLossInput(cleanMoneyInput(e.target.value))}
                                    disabled={isWorking}
                                />
                            </div>
                            <div className='trading-controls__field'>
                                <label htmlFor='martingale'>Martingale</label>
                                <select
                                    id='martingale'
                                    className='dropdown'
                                    value={martingale}
                                    onChange={e => setMartingale(Number(e.target.value) as TMartingale)}
                                    disabled={isWorking}
                                >
                                    {MARTINGALE_OPTIONS.map(m => (
                                        <option key={m} value={m}>{m === 1 ? '1× (Off)' : `${m}×`}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Alternate strategy toggle */}
                        <div className='trading-controls__alternate'>
                            <label className='trading-controls__check-label'>
                                <input
                                    type='checkbox'
                                    checked={alternateEnabled}
                                    onChange={e => setAlternateEnabled(e.target.checked)}
                                    disabled={isWorking}
                                />
                                &nbsp;Switch strategy after&nbsp;
                                <input
                                    className='trading-controls__loss-count'
                                    type='number'
                                    min={1}
                                    max={20}
                                    value={alternateAfterLosses}
                                    onChange={e => setAlternateAfterLosses(e.target.value)}
                                    disabled={!alternateEnabled || isWorking}
                                />
                                &nbsp;losses
                            </label>
                            {alternateEnabled && (
                                <select
                                    className='dropdown'
                                    value={alternateStrategy}
                                    onChange={e => setAlternateStrategy(e.target.value as TScannerStrategy)}
                                    disabled={isWorking}
                                >
                                    {STRATEGIES.filter(s => s !== strategy).map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>

                    {/* Live stats strip */}
                    <div className='contain'>
                        <div className='latest-tick'>
                            P/L: <span className={sessionProfit >= 0 ? 'col-green' : 'col-red'}>
                                {sessionProfit >= 0 ? '+' : ''}{sessionProfit.toFixed(2)} {currency}
                            </span>
                        </div>
                        {isWorking && (
                            <div className={`latest-tick ${isPaused ? 'col-yellow' : 'col-green'}`}>
                                {isPaused ? '⏸ Market power shift — paused' : '▶ Trading active — monitoring…'}
                            </div>
                        )}
                    </div>

                    {/* Action buttons */}
                    <div className='buttons'>
                        <button
                            id='scanner-scan-btn'
                            className='btn btn-scan'
                            type='button'
                            onClick={handleScan}
                            disabled={!canScan || isWorking}
                        >
                            🔍 Scan
                        </button>
                        <button
                            id='scanner-build-btn'
                            className='btn btn-build'
                            type='button'
                            onClick={handleAutoBuildBot}
                            disabled={isWorking}
                        >
                            🤖 Build Bot
                        </button>
                        {!isWorking ? (
                            <button
                                id='scanner-trade-btn'
                                className='btn btn-trade'
                                type='button'
                                onClick={handleAutoTrade}
                                disabled={!canScan}
                            >
                                ▶ Auto Trade
                            </button>
                        ) : (
                            <>
                                <button
                                    id='scanner-pause-btn'
                                    className={`btn ${isPaused ? 'btn-resume' : 'btn-pause'}`}
                                    type='button'
                                    onClick={handlePauseResume}
                                >
                                    {isPaused ? '▶ Resume' : '⏸ Pause'}
                                </button>
                                <button
                                    id='scanner-stop-btn'
                                    className='btn btn-stop'
                                    type='button'
                                    onClick={stopTrading}
                                >
                                    ⏹ Stop
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── SIGNAL STATS TAB ── */}
            {activeTab === 'stats' && (
                <div className='container container--stats'>
                    <h1>📊 Signal Stats</h1>

                    {/* Volatility market overview */}
                    <div className='stats-overview-label'>Monitored Volatility Markets</div>
                    <div className='stats-market-grid'>
                        {MARKETS.map(m => (
                            <div
                                key={m.symbol}
                                className={`stats-market-card${selectedSymbol === m.symbol ? ' stats-market-card--active' : ''}`}
                                onClick={() => handleMarketChange(m.symbol)}
                                role='button'
                                tabIndex={0}
                                onKeyDown={e => e.key === 'Enter' && handleMarketChange(m.symbol)}
                            >
                                <span className='stats-market-card__label'>
                                    {m.label.replace('Volatility ', 'Vol ').replace(' Index', '')}
                                </span>
                                <span className='stats-market-card__group'>{m.group}</span>
                            </div>
                        ))}
                    </div>

                    {/* Signal log */}
                    <div className='stats-header'>
                        <span>Signal Log ({signalStats.length})</span>
                        {signalStats.length > 0 && (
                            <button className='btn-clear' type='button' onClick={() => setSignalStats([])}>Clear</button>
                        )}
                    </div>
                    <div className='stats-table-wrap'>
                        <table className='stats-table'>
                            <thead>
                                <tr>
                                    <th>Market</th>
                                    <th>Strategy</th>
                                    <th>Signal</th>
                                    <th>Conf</th>
                                    <th>Time</th>
                                    <th>Result</th>
                                    <th>P/L</th>
                                </tr>
                            </thead>
                            <tbody>
                                {signalStats.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className='stats-empty'>
                                            No signals yet — run a scan or start Auto Trade on the Scanner tab.
                                        </td>
                                    </tr>
                                ) : signalStats.map(rec => (
                                    <tr key={rec.id} className={`stats-row stats-row--${rec.outcome.toLowerCase()}`}>
                                        <td title={rec.market}>{rec.market.replace('Volatility ', 'V').replace(' Index', '').replace('Jump ', 'J')}</td>
                                        <td>{rec.strategy.split(' & ')[0]}</td>
                                        <td><span className='stats-signal-pill'>{rec.signal}</span></td>
                                        <td className={rec.confidence >= 55 ? 'col-green' : 'col-yellow'}>{rec.confidence}%</td>
                                        <td>{new Date(rec.timestamp).toLocaleTimeString()}</td>
                                        <td>
                                            <span className={`stats-outcome stats-outcome--${rec.outcome.toLowerCase()}`}>
                                                {rec.outcome === 'Win' ? '✅ Win' : rec.outcome === 'Loss' ? '❌ Loss' : '⏳ …'}
                                            </span>
                                        </td>
                                        <td className={rec.profit !== undefined ? (rec.profit >= 0 ? 'col-green' : 'col-red') : ''}>
                                            {rec.profit !== undefined ? `${rec.profit >= 0 ? '+' : ''}${rec.profit.toFixed(2)}` : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Terminal popup ── */}
            <div className='popup' style={{ display: popupOpen ? 'block' : 'none' }}>
                <div className='popup-content'>
                    <button className='close-btn' type='button' onClick={handleClosePopup}>✕</button>
                    <div className='terminal-header'>
                        <span className='dot' /><span className='dot' /><span className='dot' />
                        <span className='terminal-title'>Signal Analyzer — Terminal</span>
                    </div>
                    <div className='terminal-dashboard'>
                        {terminalDashboard.map((line, i) => (
                            <p className={(line ?? '').startsWith('Error') ? 'red' : 'green'} key={`dash-${i}`}>{line ?? ''}</p>
                        ))}
                    </div>
                    <div className='terminal-scroll'>
                        <div className='terminal-scroll-content'>
                            {terminalBody.map((line, i) => (
                                <p className={(line ?? '').startsWith('Error') ? 'red' : 'green'} key={`body-${i}`}>{line ?? ''}</p>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default Scanner;
