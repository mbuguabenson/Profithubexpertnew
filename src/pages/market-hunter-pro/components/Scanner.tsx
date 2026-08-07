import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ChevronDown,
  RefreshCw,
  Zap,
  TrendingUp,
  TrendingDown,
  Download,
  Play,
  Check,
  AlertTriangle,
  Layers,
  Target,
  Sparkles,
  BarChart2,
  Sun,
  Moon,
} from 'lucide-react';
import MarketMonitor from './MarketMonitor';
import { AutoHunterBotModal } from './AutoHunterBotModal';
import { useDerivWS } from '../hooks/useDerivWS';
import { analyzeMultiWindow, MultiWindowAnalysis } from '../lib/analysis';
import { generateCombinedRankedSignals, Signal, SignalType } from '../lib/signals';
import { SYMBOLS } from '../lib/symbols';
import { useStore } from '@/hooks/useStore';
import { generateBotXML } from '@/utils/bot-xml-generator';
import '../index.css';


type Step = 'orb' | 'open' | 'scanning';
type PanelTab = 'scanner' | 'monitor';

const TRADE_TYPES = [
  { id: 'over_under', label: 'Over / Under', types: ['over_under', 'pro_over_under', 'under_7', 'over_2'] as SignalType[] },
  { id: 'even_odd', label: 'Even / Odd', types: ['even_odd', 'pro_even_odd'] as SignalType[] },
  { id: 'matches', label: 'Matches', types: ['matches'] as SignalType[] },
  { id: 'differs', label: 'Differs', types: ['differs'] as SignalType[] },
  { id: 'rise_fall', label: 'Rise / Fall', types: ['rise_fall'] as SignalType[] },
  { id: 'pro_over_under', label: 'Pro Over / Under', types: ['pro_over_under', 'under_7', 'over_2'] as SignalType[] },
  { id: 'pro_even_odd', label: 'Pro Even / Odd', types: ['pro_even_odd'] as SignalType[] },
  { id: 'all', label: 'All Strategies', types: ['over_under', 'even_odd', 'matches', 'differs', 'rise_fall', 'pro_over_under', 'pro_even_odd', 'under_7', 'over_2'] as SignalType[] },
];

// ─── Draggable Orb Hook ───────────────────────────────────────────────────────
function useDraggableOrb() {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const pos = useRef({ x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const lastTime = useRef(0);
  const raf = useRef(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    dragging.current = true;
    setIsDragging(true);
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    lastTime.current = performance.now();
    velocity.current = { x: 0, y: 0 };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const now = performance.now();
    const dt = Math.max(now - lastTime.current, 1);
    const newX = e.clientX - offset.current.x;
    const newY = e.clientY - offset.current.y;
    velocity.current = {
      x: ((newX - pos.current.x) / dt) * 16,
      y: ((newY - pos.current.y) / dt) * 16,
    };
    pos.current = { x: newX, y: newY };
    lastTime.current = now;
    setPosition({ x: newX, y: newY });
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    setIsDragging(false);

    // Spring physics
    let vx = velocity.current.x;
    let vy = velocity.current.y;
    let px = pos.current.x;
    let py = pos.current.y;
    const decay = 0.92;

    const animate = () => {
      if (dragging.current) return;
      vx *= decay;
      vy *= decay;
      px += vx;
      py += vy;

      // Boundary bounce
      const w = window.innerWidth;
      const h = window.innerHeight;
      const size = 72;
      if (px < 0) { px = 0; vx = Math.abs(vx) * 0.5; }
      if (px > w - size) { px = w - size; vx = -Math.abs(vx) * 0.5; }
      if (py < 0) { py = 0; vy = Math.abs(vy) * 0.5; }
      if (py > h - size) { py = h - size; vy = -Math.abs(vy) * 0.5; }

      pos.current = { x: px, y: py };
      setPosition({ x: px, y: py });

      if (Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1) {
        raf.current = requestAnimationFrame(animate);
      }
    };
    raf.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    // Center the orb initially
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = w / 2 - 36;
    const y = h / 2 - 36;
    pos.current = { x, y };
    setPosition({ x, y });
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(raf.current);
  }, []);

  return { ref, position, isDragging, onPointerDown, onPointerMove, onPointerUp };
}

// ─── StatBar Component ────────────────────────────────────────────────────────
function StatBar({
  label, leftLabel, rightLabel, leftValue, leftColor, rightColor,
}: {
  label: string; leftLabel: string; rightLabel: string;
  leftValue: number; leftColor: string; rightColor: string;
}) {
  const rightValue = 100 - leftValue;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">{label}</span>
        <span className="text-[10px] text-white/40">{leftValue.toFixed(1)}% / {rightValue.toFixed(1)}%</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-black w-10 text-right" style={{ color: leftColor }}>{leftLabel}</span>
        <div className="flex-1 h-3 rounded-full overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-700" style={{ width: `${leftValue}%`, background: leftColor }} />
          <div className="absolute right-0 top-0 h-full rounded-full transition-all duration-700" style={{ width: `${rightValue}%`, background: rightColor }} />
        </div>
        <span className="text-xs font-black w-10" style={{ color: rightColor }}>{rightLabel}</span>
      </div>
    </div>
  );
}

function DigitStat({ label, digit, percentage, color, badge }: { label: string; digit: number; percentage: number; color: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-base shadow-lg shrink-0"
        style={{ background: color, boxShadow: `0 0 12px ${color}66` }}>
        {digit}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">{label}</span>
          {badge && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full text-white" style={{ background: color }}>
              {badge}
            </span>
          )}
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(percentage, 100)}%`, background: color }} />
        </div>
      </div>
      <span className="text-sm font-black text-white/80 shrink-0">{percentage.toFixed(1)}%</span>
    </div>
  );
}

// ─── StatsCard ────────────────────────────────────────────────────────────────
function StatsCard({ mwa, tradeTypeId }: { mwa: MultiWindowAnalysis; tradeTypeId: string }) {
  const [collapsed, setCollapsed] = useState(true);
  const a = mwa.w1000;
  const a120 = mwa.w120;
  const a15 = mwa.w15;

  const alignColor = mwa.alignmentScore >= 80 ? '#10b981' : mwa.alignmentScore >= 60 ? '#f59e0b' : '#ef4444';
  const alignLabel = mwa.alignmentScore >= 80 ? 'Strong' : mwa.alignmentScore >= 60 ? 'Moderate' : 'Weak';

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10"
      style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))', backdropFilter: 'blur(12px)' }}>
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full px-4 py-2.5 flex items-center justify-between select-none"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))' }}
      >
        <div className="flex items-center gap-2">
          <Layers size={13} style={{ color: alignColor }} />
          <span className="text-xs font-bold text-white/70">Window Alignment</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(['1000', '120', '15'] as const).map((w) => {
              const aw = w === '1000' ? a : w === '120' ? a120 : a15;
              const active = aw.totalTicks >= parseInt(w) * 0.5;
              return (
                <span key={w} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${active ? 'text-white' : 'bg-white/5 text-white/30'}`}
                  style={active ? { background: alignColor } : {}}>
                  {w}T
                </span>
              );
            })}
          </div>
          <span className="text-xs font-black" style={{ color: alignColor }}>{mwa.alignmentScore}%</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: alignColor }}>{alignLabel}</span>
          <ChevronDown size={12} className={`text-white/40 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
        </div>
      </button>

      <div className="h-1.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div className="h-full transition-all duration-700" style={{ width: `${mwa.alignmentScore}%`, background: `linear-gradient(90deg, ${alignColor}, ${alignColor}cc)` }} />
      </div>

      {!collapsed && (
        <>
          <div className="p-4 space-y-4">
            {tradeTypeId === 'even_odd' && (
              <StatBar label="Even / Odd Split" leftLabel="EVEN" rightLabel="ODD" leftValue={a.evenPercentage} leftColor="#6366f1" rightColor="#ec4899" />
            )}
            {tradeTypeId === 'over_under' && (
              <StatBar label="Over / Under 4.5" leftLabel="OVER" rightLabel="UNDR" leftValue={a.highPercentage} leftColor="#0ea5e9" rightColor="#f97316" />
            )}
            {tradeTypeId === 'matches' && (
              <DigitStat label="Strongest Digit" digit={a.powerIndex.strongest} percentage={a.digitFrequencies[a.powerIndex.strongest]?.percentage ?? 0} color="#f5c542" badge="MATCHES" />
            )}
            {tradeTypeId === 'differs' && (
              <DigitStat label="Weakest Digit" digit={a.powerIndex.weakest} percentage={a.digitFrequencies[a.powerIndex.weakest]?.percentage ?? 0} color="#64748b" badge="DIFFERS" />
            )}
            {tradeTypeId === 'rise_fall' && (() => {
              const q = a.last10quotes;
              const rising = q.length >= 2 && q[q.length - 1] >= q[0];
              return (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Trend Direction</span>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ background: rising ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' }}>
                    {rising ? <TrendingUp size={14} className="text-green-400" /> : <TrendingDown size={14} className="text-red-400" />}
                    <span className="text-xs font-black" style={{ color: rising ? '#10b981' : '#ef4444' }}>{rising ? 'RISING' : 'FALLING'}</span>
                  </div>
                </div>
              );
            })()}

            {mwa.lastDigit !== null && (
              <div className="flex items-center justify-between pt-1 border-t border-white/10">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Last Digit</span>
                <div className="flex items-center gap-1.5">
                  <Target size={12} className="text-white/40" />
                  <span className="text-base font-black text-white/80">{mwa.lastDigit}</span>
                  <span className="text-[9px] font-bold text-white/40">({mwa.lastDigit % 2 === 0 ? 'EVEN' : 'ODD'} · {mwa.lastDigit >= 5 ? 'HIGH' : 'LOW'})</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-1.5 pt-0.5">
              {([
                { label: '1000T', a: a, color: '#6366f1' },
                { label: '120T', a: a120, color: '#0ea5e9' },
                { label: '15T', a: a15, color: '#f5c542' },
              ] as const).map(({ label, a: wa, color }) => {
                const val = tradeTypeId === 'even_odd' ? wa.evenPercentage
                  : tradeTypeId === 'over_under' ? wa.highPercentage
                  : tradeTypeId === 'matches' ? ((wa.digitFrequencies[wa.powerIndex.strongest]?.percentage ?? 0) * 5) || 0
                  : tradeTypeId === 'differs' ? 100 - wa.digitFrequencies[wa.powerIndex.weakest]?.percentage
                  : 50;
                return (
                  <div key={label} className="rounded-xl p-2 text-center" style={{ background: `${color}10`, border: `1px solid ${color}30` }}>
                    <div className="text-[9px] font-bold text-white/40 mb-0.5">{label}</div>
                    <div className="text-sm font-black" style={{ color }}>{val.toFixed(1)}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Signal Card ──────────────────────────────────────────────────────────────
function UnifiedSignalCard({ signal, rank, selected, lastDigit, isTop, marketLabel }: {
  signal: Signal; rank: number; selected?: boolean; lastDigit: number | null; isTop?: boolean; marketLabel?: string;
}) {
  const isTradeNow = signal.status === 'TRADE NOW';
  const isWait = signal.status === 'WAIT';
  const entryMatch = signal.targetDigit !== undefined && lastDigit !== null && signal.targetDigit === lastDigit;
  const statusColor = isTradeNow ? '#10b981' : isWait ? '#f59e0b' : 'rgba(255,255,255,0.4)';
  const statusBg = isTradeNow ? 'rgba(16,185,129,0.15)' : isWait ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)';
  const statusBorder = isTradeNow ? 'rgba(16,185,129,0.3)' : isWait ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.1)';

  const rankBg = rank === 1 ? 'linear-gradient(135deg, #f5c542, #e67e22)'
    : rank === 2 ? 'linear-gradient(135deg, #0ea5e9, #6366f1)'
    : rank === 3 ? 'linear-gradient(135deg, #f59e0b, #ef4444)'
    : 'rgba(148,163,184,0.4)';

  return (
    <div
      className="rounded-2xl border transition-all duration-200 cursor-pointer"
      style={{
        borderColor: selected ? '#f5c542' : (isTop && signal.windowsAligned) ? 'rgba(16,185,129,0.3)' : statusBorder,
        background: selected ? 'rgba(245,197,66,0.08)' : 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(8px)',
        boxShadow: selected ? '0 0 0 2px rgba(245,197,66,0.3)' : undefined,
      }}
    >
      <div className="p-3">
        <div className="flex items-start gap-2 mb-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white shrink-0 mt-0.5"
            style={{ background: rankBg }}>
            {rank}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-black text-white/50 uppercase tracking-wider">{signal.label}</span>
              {marketLabel && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/20">{marketLabel}</span>
              )}
              {signal.tradeDirection && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white"
                  style={{ background: isTradeNow ? '#10b981' : '#f59e0b' }}>
                  {signal.tradeDirection}
                </span>
              )}
              {/* Windows-aligned badge only on best (rank 1) signal */}
              {isTop && signal.windowsAligned && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 flex items-center gap-0.5">
                  <Check size={8} /> ALIGNED
                </span>
              )}
              {signal.window && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">{signal.window}T</span>
              )}
            </div>
            <p className="text-xs font-semibold text-white/70 mt-0.5 leading-snug">{signal.recommendation}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: statusBg, color: statusColor, border: `1px solid ${statusBorder}` }}>
              {isTradeNow ? <Zap size={8} /> : null}
              {signal.status}
            </span>
            <span className="text-sm font-black" style={{ color: statusColor }}>{signal.probability.toFixed(0)}%</span>
          </div>
        </div>

        <div className="w-full h-1.5 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(signal.probability, 100)}%`,
              background: isTradeNow ? 'linear-gradient(90deg, #10b981, #059669)' : isWait ? 'linear-gradient(90deg, #f59e0b, #d97706)' : 'rgba(255,255,255,0.2)',
            }} />
        </div>

        <div className="flex items-start gap-1.5">
          <Target size={10} className="text-white/40 mt-0.5 shrink-0" />
          <p className="text-[10px] text-white/40 leading-snug flex-1">
            <span className="font-bold text-white/60">Entry: </span>{signal.entryCondition}
          </p>
        </div>

        {signal.targetDigit !== undefined && (
          <div className={`mt-2 flex items-center gap-1.5 rounded-xl px-3 py-1.5 border ${entryMatch ? 'bg-green-500/10 border-green-500/30' : 'bg-white/5 border-white/10'}`}>
            <div className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black text-white ${entryMatch ? 'bg-green-500' : 'bg-white/20'}`}>
              {signal.targetDigit}
            </div>
            <span className={`text-[10px] font-bold ${entryMatch ? 'text-green-400' : 'text-white/40'}`}>
              {entryMatch ? 'Entry digit matches last tick — TRADE NOW!' : `Waiting for digit ${signal.targetDigit}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Scanner ─────────────────────────────────────────────────────────────
export default function Scanner() {
  const store = useStore();
  const [step, setStep] = useState<Step>('scanning');
  const [minimized] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('1HZ100V');
  const [selectedTradeType, setSelectedTradeType] = useState('over_under');
  const [stake, setStake] = useState('1');
  const [takeProfit, setTakeProfit] = useState('10');
  const [stopLoss, setStopLoss] = useState('5');
  const [martingale, setMartingale] = useState('2');
  const [multiMarket, setMultiMarket] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanTarget, setScanTarget] = useState(1);
  const [mwa, setMwa] = useState<MultiWindowAnalysis | null>(null);
  const [combinedSignals, setCombinedSignals] = useState<Signal[]>([]);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [predictionChoice, setPredictionChoice] = useState<number | null>(null);
  const [autoScan, setAutoScan] = useState(false);
  const [signalShift, setSignalShift] = useState(false);
  const [signalUpdated, setSignalUpdated] = useState(false);
  const signalUpdatedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showTradeTypePicker, setShowTradeTypePicker] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>('scanner');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  // Bulk trade
  const [bulkCount, setBulkCount] = useState('3');
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  // Recovery mode
  const [recMode, setRecMode] = useState(false);
  const [recLossThreshold, setRecLossThreshold] = useState('3');
  const [recAltType, setRecAltType] = useState('over_under');
  const [showRecTypePicker, setShowRecTypePicker] = useState(false);
  const recTypePickerRef = useRef<HTMLDivElement>(null);
  const tradeTypePickerRef = useRef<HTMLDivElement>(null);
  const symbolPickerRef = useRef<HTMLDivElement>(null);
  const prevSignalKeyRef = useRef<string>('');
  const shiftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoScanRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isBotModalOpen, setIsBotModalOpen] = useState(false);
  const [botSymbol, setBotSymbol] = useState('R_100');
  const [botSymbolName, setBotSymbolName] = useState('Volatility 100 Index');
  const [botStrategyId, setBotStrategyId] = useState('even_odd');
  const [botStrategyLabel, setBotStrategyLabel] = useState('Even / Odd');

  const { isConnected, subscriptionState, subscribeSymbol } = useDerivWS();
  const orb = useDraggableOrb();

  const allowedTypes = useMemo(() => {
    const tt = TRADE_TYPES.find((t) => t.id === selectedTradeType);
    return tt?.types ?? [];
  }, [selectedTradeType]);

  useEffect(() => {
    if (!subscriptionState || subscriptionState.ticks.length < 20) return;
    const result = analyzeMultiWindow(subscriptionState.ticks, subscriptionState.quotes);
    setMwa(result);
    const allSignals = generateCombinedRankedSignals(result, allowedTypes);
    // Only keep actionable signals (exclude WAIT / MONITOR status)
    const newSignals = allSignals.filter(s => s.status === 'TRADE NOW');
    setCombinedSignals(newSignals);

    // If currently selected signal no longer exists in the new list, clear it
    setSelectedSignal(prev => {
      if (!prev) return null;
      const still = newSignals.find(s => s.type === prev.type && s.tradeDirection === prev.tradeDirection);
      return still ?? null;
    });

    // Signal shift detection
    const topSignal = newSignals[0];
    const currentKey = topSignal
      ? `${topSignal.type}__${topSignal.tradeDirection ?? ''}__${topSignal.status}`
      : '';
    if (prevSignalKeyRef.current && prevSignalKeyRef.current !== currentKey) {
      setSignalShift(true);
      if (shiftTimeoutRef.current) clearTimeout(shiftTimeoutRef.current);
      shiftTimeoutRef.current = setTimeout(() => setSignalShift(false), 5000);
    }
    prevSignalKeyRef.current = currentKey;

    // Flash "UPDATED" badge
    if (signalUpdatedTimer.current) clearTimeout(signalUpdatedTimer.current);
    setSignalUpdated(true);
    signalUpdatedTimer.current = setTimeout(() => setSignalUpdated(false), 2000);
  }, [subscriptionState?.ticks.length, allowedTypes]);

  const startScan = useCallback(() => {
    setStep('scanning');
    setScanProgress(0);
    const targets = multiMarket ? SYMBOLS.length : 1;
    setScanTarget(targets);
    let i = 0;
    scanIntervalRef.current = setInterval(() => {
      i++;
      setScanProgress(i);
      if (multiMarket) {
        const sym = SYMBOLS[i - 1];
        if (sym) subscribeSymbol(sym.id);
      } else {
        subscribeSymbol(selectedSymbol);
      }
      if (i >= targets) {
        clearInterval(scanIntervalRef.current!);
        setTimeout(() => { setStep('open'); }, 600);
      }
    }, 400);
  }, [multiMarket, selectedSymbol, subscribeSymbol]);

  const runScanOnce = useCallback(() => {
    if (!isConnected) return;
    startScan();
  }, [isConnected, startScan]);

  // Continuous automatic scanner — runs every 60 seconds when enabled
  useEffect(() => {
    if (!autoScan) return;
    runScanOnce();
    if (autoScanRef.current) clearInterval(autoScanRef.current);
    autoScanRef.current = setInterval(runScanOnce, 60000);
    return () => { if (autoScanRef.current) clearInterval(autoScanRef.current); };
  }, [autoScan, runScanOnce]);

  // Close rec type dropdown on outside click
  useEffect(() => {
    if (!showRecTypePicker) return;
    const handler = (e: MouseEvent) => {
      if (recTypePickerRef.current && !recTypePickerRef.current.contains(e.target as Node)) {
        setShowRecTypePicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showRecTypePicker]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showTradeTypePicker) return;
    const handler = (e: MouseEvent) => {
      if (tradeTypePickerRef.current && !tradeTypePickerRef.current.contains(e.target as Node)) {
        setShowTradeTypePicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showTradeTypePicker]);

  // Close symbol dropdown on outside click
  useEffect(() => {
    if (!showSymbolPicker) return;
    const handler = (e: MouseEvent) => {
      if (symbolPickerRef.current && !symbolPickerRef.current.contains(e.target as Node)) {
        setShowSymbolPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSymbolPicker]);

  // Auto-advance from orb → config once connected & ticks flow in
  useEffect(() => {
    if (step === 'orb' && isConnected && subscriptionState && subscriptionState.ticks.length >= 20) {
      setStep('open');
    }
  }, [step, isConnected, subscriptionState?.ticks.length]);

  const resetScan = useCallback(() => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    if (shiftTimeoutRef.current) clearTimeout(shiftTimeoutRef.current);
    setSignalShift(false);
    setStep('open');
    setActiveTab('scanner');
    setScanProgress(0);
    setMwa(null);
    setSelectedSignal(null);
    setPredictionChoice(null);
  }, []);

  const handleLoadBot = useCallback(async () => {
    const signalToUse = selectedSignal || combinedSignals[0] || null;
    const entryDigit = predictionChoice ?? signalToUse?.entryDigits?.[0] ?? signalToUse?.targetDigit ?? undefined;
    const tradeTypeLabel = TRADE_TYPES.find(t => t.id === selectedTradeType)?.label ?? selectedTradeType;
    const recovery = recMode
      ? { lossThreshold: parseInt(recLossThreshold, 10) || 3, altTradeTypeId: recAltType }
      : undefined;
    const xml = generateBotXML({
      stake, takeProfit, stopLoss, martingale,
      symbol: selectedSymbol, tradeTypeLabel, bestSignal: signalToUse, entryDigit,
      recovery,
    });

    try {
      if (typeof window !== 'undefined' && window.Blockly?.derivWorkspace) {
        const name = `ProAI_${tradeTypeLabel.replace(/[\s/]/g, '_')}_${selectedSymbol}`;
        const { load_modal, dashboard } = store ?? {};
        if (load_modal && dashboard) {
          await load_modal.loadStrategyToBuilder({
            id: name,
            name,
            xml,
            save_type: 'local',
            timestamp: Date.now(),
          });
          // Switch to Bot Builder tab (index 1 is BOT_BUILDER in DBOT_TABS)
          dashboard.setActiveTab(1);
          return;
        }
      }
    } catch (e) {
      console.error('Failed to load strategy directly to Blockly workspace:', e);
    }

    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const tradeLabel = TRADE_TYPES.find(t => t.id === selectedTradeType)?.label?.replace(/[\s/]/g, '_') ?? selectedTradeType;
    a.download = `proai_${tradeLabel}_${selectedSymbol}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  }, [store, stake, takeProfit, stopLoss, martingale, selectedSymbol, selectedSignal, combinedSignals, predictionChoice, recMode, recLossThreshold, recAltType]);

  const selectedSymbolInfo = SYMBOLS.find((s) => s.id === selectedSymbol);
  const lastDigit = mwa?.lastDigit ?? null;

  // Clicking orb toggles the panel
  const handleOrbClick = useCallback(() => {
    if (orb.isDragging) return;
    if (step === 'orb') setStep('open');
    // Do NOT close on orb click — only Cancel button closes
  }, [orb.isDragging, step]);

  // Panel never closes on outside click — only the Cancel/X button closes it
  // (orb click opens it, Cancel closes it)

  // ── Floating AI Scanner Orb ──
  const isActive = step !== 'orb';
  const hasScanResults = mwa !== null || combinedSignals.length > 0;
  const orbEl = (
    <div
      ref={orb.ref}
      onPointerDown={orb.onPointerDown}
      onPointerMove={orb.onPointerMove}
      onPointerUp={orb.onPointerUp}
      onClick={handleOrbClick}
      className="fixed z-[60] cursor-grab active:cursor-grabbing select-none"
      style={{
        transform: `translate(${orb.position.x}px, ${orb.position.y}px)`,
        touchAction: 'none',
      }}
    >
      {/* Signal ripple rings (active only) */}
      {isActive && (
        <>
          <div className="absolute inset-0 m-auto rounded-full pointer-events-none"
            style={{ width: 72, height: 72, animation: 'signal-ripple 2s ease-out infinite', background: 'transparent', border: '1.5px solid rgba(245,197,66,0.6)' }} />
          <div className="absolute inset-0 m-auto rounded-full pointer-events-none"
            style={{ width: 72, height: 72, animation: 'signal-ripple 2s ease-out 0.7s infinite', background: 'transparent', border: '1.5px solid rgba(230,126,34,0.4)' }} />
        </>
      )}

      {/* Outer ambient glow */}
      <div className="absolute pointer-events-none"
        style={{
          width: 96, height: 96, top: -12, left: -12,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245,197,66,0.22) 0%, rgba(230,126,34,0.1) 55%, transparent 75%)',
          animation: 'orb-pulse 3s ease-in-out infinite',
        }} />

      {/* Loader orb */}
      <div className="relative" style={{ width: 72, height: 72 }}>

        {/* Core orb — uiverse loader (joao-canais) */}
        <div className="loader-wrapper">
          <div className="loader-circle" />
          {/* Inner content */}
          <div className="relative z-10 flex flex-col items-center leading-none">
            {step === 'orb' ? (
              <>
                <span className="text-base font-black text-white tracking-wide" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>AI</span>
              </>
            ) : step === 'scanning' ? (
              <div className="flex items-end gap-[2px] h-4">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="w-[3px] rounded-full bg-amber-300"
                    style={{ height: 14, animation: `dot-bounce 1s ease-in-out ${i * 0.12}s infinite`, boxShadow: '0 0 4px rgba(245,197,66,0.9)' }} />
                ))}
              </div>
            ) : (
              <>
                <Sparkles size={18} className="text-amber-200" style={{ filter: 'drop-shadow(0 0 4px rgba(245,197,66,0.9))' }} />
                <span className="text-[7px] font-black text-amber-100 mt-0.5 tracking-widest">LIVE</span>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );

  // ── Scanner Panel (Full Page Site Fit) ──
  const panel = step !== 'orb' && (
    <div className="w-full h-full min-h-[calc(100vh-80px)] p-4 bg-[#070a12] box-border">
      <div className="flex flex-col h-full w-full bg-[#0e0e12] overflow-y-auto text-white rounded-2xl border border-white/10 p-5 shadow-2xl">
        {/* Tab bar */}
      {!minimized && (
        <div className="flex border-b shrink-0" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          {([
            { id: 'scanner', label: 'Scanner' },
            { id: 'monitor', label: 'Market Monitor' },
          ] as { id: PanelTab; label: string }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 py-2.5 text-[11px] font-black tracking-wide transition relative"
              style={{ color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.35)' }}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full"
                  style={{ background: 'linear-gradient(90deg,#f5c542,#e67e22)' }} />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      {!minimized && (
        <>
          {/* ── SCANNER TAB ── */}
          {activeTab === 'scanner' && (
            <div className="p-5 space-y-4" style={{ background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.02))' }}>
              {/* Symbol selector */}
              <div>
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider block mb-1">Market</label>
                <div className="relative" ref={symbolPickerRef}>
                  <button
                    onClick={() => setShowSymbolPicker((v) => !v)}
                    className="w-full flex items-center justify-between border rounded-xl px-4 py-2.5 transition"
                    style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)' }}
                  >
                    <span className="font-bold text-white/80 text-sm">{selectedSymbolInfo?.label ?? selectedSymbol}</span>
                    <ChevronDown size={14} className={`text-white/40 transition-transform ${showSymbolPicker ? 'rotate-180' : ''}`} />
                  </button>
                  {showSymbolPicker && (
                    <div className="absolute z-[60] top-full left-0 right-0 mt-1 rounded-xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto"
                      style={{ background: 'rgba(15,10,30,0.98)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(20px)' }}>
                      {['Volatility', 'DEX', 'Crash/Boom', 'Jump', 'Bear/Bull', 'Range', 'Step', 'Forex', 'Commodities', 'Crypto'].map((cat) => (
                        <div key={cat}>
                          <div className="px-4 py-1.5 text-[10px] font-bold text-white/40 uppercase tracking-wider sticky top-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            {cat}
                          </div>
                          {SYMBOLS.filter((s) => s.category === cat).map((s) => (
                            <button
                              key={s.id}
                              onClick={() => { setSelectedSymbol(s.id); setShowSymbolPicker(false); }}
                              className={`w-full text-left px-4 py-2 text-sm font-medium transition ${selectedSymbol === s.id ? 'text-[#f5c542] font-bold' : 'text-white/70 hover:bg-white/5'}`}
                              style={selectedSymbol === s.id ? { background: 'rgba(245,197,66,0.12)' } : {}}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Trade type */}
              <div>
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider block mb-2">Trade Type</label>
                <div className="relative" ref={tradeTypePickerRef}>
                  <button
                    onClick={() => setShowTradeTypePicker(v => !v)}
                    className="w-full border rounded-xl p-2.5 text-xs font-bold text-left flex items-center justify-between transition"
                    style={{ borderColor: '#f5c542', color: '#f5c542', background: 'rgba(245,197,66,0.12)' }}
                  >
                    <span>{TRADE_TYPES.find(t => t.id === selectedTradeType)?.label ?? 'Select'}</span>
                    <ChevronDown size={14} className={showTradeTypePicker ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>
                  {showTradeTypePicker && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/10 bg-[#1a0a14] shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
                      {TRADE_TYPES.map(t => (
                        <button
                          key={t.id}
                          onClick={() => { setSelectedTradeType(t.id); setSelectedSignal(null); setShowTradeTypePicker(false); }}
                          className="w-full px-3 py-2 text-xs font-bold text-left transition flex items-center justify-between hover:bg-white/5"
                          style={selectedTradeType === t.id ? { color: '#f5c542', background: 'rgba(245,197,66,0.12)' } : { color: 'rgba(255,255,255,0.6)' }}
                        >
                          <span>{t.label}</span>
                          {selectedTradeType === t.id && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Parameters */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Stake ($)', value: stake, setter: setStake },
                  { label: 'Martingale x', value: martingale, setter: setMartingale },
                  { label: 'Take Profit ($)', value: takeProfit, setter: setTakeProfit },
                  { label: 'Stop Loss (losses)', value: stopLoss, setter: setStopLoss },
                ].map(({ label, value, setter }) => (
                  <div key={label}>
                    <label className="text-[9px] font-bold text-white/50 uppercase tracking-wider block mb-1">{label}</label>
                    <input
                      type="number"
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      className="w-full border rounded-xl px-3 py-2 text-white/80 font-bold text-sm focus:outline-none transition"
                      style={{ borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)' }}
                    />
                  </div>
                ))}
              </div>

              {/* Multi-market */}
              <div className="rounded-xl p-3 flex items-center justify-between"
                style={{ border: '1px solid rgba(230,126,34,0.2)', background: 'rgba(230,126,34,0.06)' }}>
                <div>
                  <h4 className="text-[#E67E22] font-bold text-xs">Multi-Market Scan</h4>
                  <p className="text-[10px] text-white/40">Scan all synthetic markets</p>
                </div>
                <button
                  onClick={() => setMultiMarket((v) => !v)}
                  className={`w-11 h-6 flex items-center rounded-full p-0.5 transition-colors duration-300 ${multiMarket ? 'bg-[#f5c542]' : 'bg-white/20'}`}
                >
                  <div className={`bg-white w-5 h-5 rounded-full shadow transform transition-transform duration-300 ${multiMarket ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Scanning progress */}
              {step === 'scanning' && (
                <div className="space-y-3">
                  <div className="rounded-xl p-3" style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)' }}>
                    <div className="flex justify-between text-xs font-bold text-white/70 mb-2">
                      <span>Synthetic Indices</span>
                      <span>{scanProgress}/{scanTarget}</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-full transition-all duration-300 rounded-full"
                        style={{ width: `${(scanProgress / scanTarget) * 100}%`, background: 'linear-gradient(90deg, #f5c542, #e67e22)' }} />
                    </div>
                  </div>
                  <div className="w-full text-white font-bold text-center py-3 rounded-xl text-xs flex items-center justify-center gap-2"
                    style={{ background: 'linear-gradient(90deg, #E67E22, #f5c542, #d97706)' }}>
                    <RefreshCw size={14} className="animate-spin" />
                    Collecting 1000 ticks across 3 windows...
                  </div>
                </div>
              )}

              {/* Actions */}
              {step !== 'scanning' && (
                <div className="space-y-3 pt-1">
                  <button
                    onClick={() => setAutoScan(a => !a)}
                    className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 border transition active:scale-95"
                    style={{
                      borderColor: autoScan ? 'rgba(245,197,66,0.5)' : 'rgba(255,255,255,0.15)',
                      background: autoScan ? 'rgba(245,197,66,0.12)' : 'rgba(255,255,255,0.05)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <RefreshCw size={13} className={autoScan ? 'animate-spin text-[#f5c542]' : 'text-white/40'} />
                      <span className="text-xs font-bold text-white/80">Continuous scan (60s)</span>
                    </div>
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full"
                      style={{ background: autoScan ? '#f5c542' : 'rgba(255,255,255,0.15)', color: autoScan ? '#000' : '#fff' }}>
                      {autoScan ? 'ON' : 'OFF'}
                    </span>
                  </button>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={resetScan}
                      className="border-2 rounded-xl font-bold py-3 transition active:scale-95 text-sm"
                      style={{ borderColor: 'rgba(230,126,34,0.5)', color: 'rgba(255,255,255,0.6)', background: 'transparent' }}
                    >
                      Reset
                    </button>
                    <button
                      onClick={startScan}
                      disabled={!isConnected}
                      className="text-white font-bold py-3 rounded-xl shadow-lg transition active:scale-95 text-sm disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #e67e22, #f5c542)', color: '#000' }}
                    >
                      {isConnected ? 'Scan' : 'Connecting...'}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Signals (inline in Scanner tab) ── */}
              {hasScanResults && (
                <>
                  <div className="pt-2">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">
                        Signals · {combinedSignals.length} active
                      </span>
                      {signalUpdated && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 flex items-center gap-1">
                          <Zap size={7} /> LIVE
                        </span>
                      )}
                      {signalShift && (
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 flex items-center gap-1 animate-pulse">
                          <AlertTriangle size={8} /> Shift
                        </span>
                      )}
                      {combinedSignals[0]?.windowsAligned && (
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 flex items-center gap-1">
                          <Zap size={8} /> Aligned
                        </span>
                      )}
                    </div>
                  </div>

                  {mwa && <StatsCard mwa={mwa} tradeTypeId={selectedTradeType} />}

                  {selectedSignal && (
                    <div className="rounded-2xl p-3 flex items-center justify-between gap-3"
                      style={{ background: 'linear-gradient(135deg, rgba(245,197,66,0.12), rgba(230,126,34,0.08))', border: '1.5px solid rgba(245,197,66,0.3)' }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Check size={12} className="text-green-400" />
                          <span className="text-xs font-black text-[#f5c542]">Selected Signal</span>
                        </div>
                        <p className="text-xs font-bold text-white/70 truncate">{selectedSignal.recommendation}</p>
                      </div>
                      <span className="shrink-0 text-[10px] font-black px-2.5 py-1 rounded-xl text-white"
                        style={{ background: 'linear-gradient(135deg, #f5c542, #e67e22)' }}>
                        {selectedSignal.tradeDirection ?? selectedSignal.label}
                      </span>
                    </div>
                  )}

                  {/* Bulk Trade */}
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                    <button onClick={() => setShowBulkPanel(v => !v)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-white/70 hover:text-white transition">
                      <span className="flex items-center gap-2">
                        <BarChart2 size={12} className="text-sky-400" />
                        Bulk Trade
                        {showBulkPanel && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300">{bulkCount}x</span>}
                      </span>
                      <ChevronDown size={12} className={showBulkPanel ? 'rotate-180 transition-transform' : 'transition-transform'} />
                    </button>
                    {showBulkPanel && (
                      <div className="px-3 pb-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] text-white/50 w-24 shrink-0">No. of trades</label>
                          <input type="number" min={1} max={20} value={bulkCount} onChange={e => setBulkCount(e.target.value)}
                            className="flex-1 rounded-lg px-2 py-1 text-xs font-bold text-white text-center border"
                            style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.12)' }} />
                        </div>
                        <button className="w-full py-2 rounded-xl text-xs font-black text-white transition active:scale-95"
                          style={{ background: 'linear-gradient(135deg, #0ea5e9, #6366f1)' }}
                          onClick={() => { setBulkCount(String(Math.max(1, Math.min(20, parseInt(bulkCount) || 3)))); setShowBulkPanel(false); }}>
                          Queue {bulkCount} Trades
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Recovery Mode */}
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: recMode ? 'rgba(245,158,11,0.35)' : 'rgba(255,255,255,0.08)', background: recMode ? 'rgba(245,158,11,0.04)' : 'rgba(255,255,255,0.03)' }}>
                    <button onClick={() => setRecMode(v => !v)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold transition"
                      style={{ color: recMode ? '#f59e0b' : 'rgba(255,255,255,0.7)' }}>
                      <span className="flex items-center gap-2">
                        <RefreshCw size={12} style={{ color: recMode ? '#f59e0b' : 'rgba(255,255,255,0.5)' }} />
                        Recovery Mode
                        {recMode && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">ON</span>}
                      </span>
                      <ChevronDown size={12} className={recMode ? 'rotate-180 transition-transform' : 'transition-transform'} />
                    </button>
                    {recMode && (
                      <div className="px-3 pb-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] text-white/50 w-24 shrink-0">Loss threshold</label>
                          <input type="number" min={1} max={10} value={recLossThreshold} onChange={e => setRecLossThreshold(e.target.value)}
                            className="flex-1 rounded-lg px-2 py-1 text-xs font-bold text-white text-center border"
                            style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.12)' }} />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] text-white/50 w-24 shrink-0">Alt trade type</label>
                          <div className="flex-1 relative" ref={recTypePickerRef}>
                            <button onClick={() => setShowRecTypePicker(v => !v)}
                              className="w-full rounded-lg px-2 py-1 text-xs font-bold text-left flex items-center justify-between border"
                              style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                              <span>{TRADE_TYPES.find(t => t.id === recAltType)?.label ?? recAltType}</span>
                              <ChevronDown size={10} />
                            </button>
                            {showRecTypePicker && (
                              <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/10 bg-[#1a1200] shadow-2xl overflow-hidden">
                                {TRADE_TYPES.map(t => (
                                  <button key={t.id} onClick={() => { setRecAltType(t.id); setShowRecTypePicker(false); }}
                                    className="w-full px-3 py-2 text-xs font-bold text-left transition hover:bg-white/5 flex items-center justify-between"
                                    style={recAltType === t.id ? { color: '#f59e0b' } : { color: 'rgba(255,255,255,0.5)' }}>
                                    {t.label} {recAltType === t.id && <Check size={10} />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const suggested = suggestAltTradeType(selectedTradeType, combinedSignals);
                            setRecAltType(suggested);
                          }}
                          className="w-full rounded-lg px-2 py-1.5 text-[10px] font-black flex items-center justify-center gap-1.5 border transition active:scale-95"
                          style={{ background: 'rgba(56,189,248,0.08)', borderColor: 'rgba(56,189,248,0.3)', color: '#38bdf8' }}>
                          <Sparkles size={11} />
                          Auto-Suggest Best Alt Strategy
                        </button>
                        {(() => {
                          const suggested = suggestAltTradeType(selectedTradeType, combinedSignals);
                          const suggestedLabel = TRADE_TYPES.find(t => t.id === suggested)?.label ?? suggested;
                          if (suggested === recAltType) return null;
                          return (
                            <p className="text-[9px] text-sky-400/70 leading-snug">
                              Based on current signals, <strong className="text-sky-300">{suggestedLabel}</strong> has the strongest alignment. Tap to apply.
                            </p>
                          );
                        })()}
                        <p className="text-[9px] text-white/30 leading-snug">
                          {TRADE_TYPES.find(t => t.id === selectedTradeType)?.label} → <strong className="text-amber-300">{TRADE_TYPES.find(t => t.id === recAltType)?.label}</strong> after {recLossThreshold} losses
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Prediction picker */}
                  {(selectedTradeType === 'over_under' || selectedTradeType === 'pro_over_under' || selectedTradeType === 'under_7' || selectedTradeType === 'over_2' || selectedTradeType === 'matches' || selectedTradeType === 'differs') && (() => {
                    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
                    const autoDigit = selectedSignal?.targetDigit ?? (selectedTradeType === 'over_2' ? 2 : (selectedTradeType === 'under_7' ? 7 : 5));
                    const dir = selectedSignal?.tradeDirection ?? (selectedTradeType === 'over_2' ? 'OVER' : (selectedTradeType === 'under_7' ? 'UNDER' : (selectedTradeType === 'matches' ? 'MATCH' : (selectedTradeType === 'differs' ? 'DIFF' : 'UNDER'))));
                    const lbl = dir.toUpperCase().startsWith('OVER') ? 'OVER' : dir.toUpperCase().startsWith('UNDER') ? 'UNDER' : dir.toUpperCase().startsWith('MATCH') ? 'MATCH' : 'DIFF';
                    return (
                      <div className="rounded-xl border p-3" style={{ borderColor: 'rgba(245,197,66,0.35)', background: 'rgba(245,197,66,0.06)' }}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <TrendingUp size={11} className="text-[#f5c542]" />
                          <span className="text-[10px] font-black text-white/80 uppercase tracking-wide">Set Prediction</span>
                          <span className="text-[9px] text-white/40 ml-auto">
                            {predictionChoice !== null ? `Digit ${predictionChoice}` : `Auto: ${autoDigit}`}
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                          {digits.map((d) => (
                            <button key={d} onClick={() => setPredictionChoice(predictionChoice === d ? null : d)}
                              className="rounded-lg py-1.5 text-center font-black transition active:scale-95 animate-none"
                              style={{
                                background: predictionChoice === d ? 'linear-gradient(135deg,#e67e22,#f5c542)' : autoDigit === d && predictionChoice === null ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)',
                                color: predictionChoice === d ? '#000' : '#fff',
                                border: predictionChoice === d ? '1px solid #f5c542' : autoDigit === d && predictionChoice === null ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.1)',
                              }}>
                              <span className="block text-[8px] leading-none font-bold text-white/45">{lbl}</span>
                              <span className="block text-sm font-black mt-0.5">{d}</span>
                              {autoDigit === d && predictionChoice === null && (
                                <span className="block text-[8px] text-green-400 mt-0.5">AI</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Signal list */}
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-0.5">
                    {combinedSignals.length > 0
                      ? combinedSignals.map((s, i) => (
                          <button key={`${s.type}-${s.tradeDirection}-${i}`} onClick={() => setSelectedSignal(s)} className="w-full text-left">
                            <UnifiedSignalCard signal={s} rank={i + 1} selected={selectedSignal === s} lastDigit={lastDigit} isTop={i === 0} marketLabel={selectedSymbol} />
                          </button>
                        ))
                      : (
                          <div className="rounded-2xl border p-6 text-center" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                            <AlertTriangle size={20} className="text-white/20 mx-auto mb-2" />
                            <p className="text-sm font-bold text-white/50">No signals detected</p>
                            <p className="text-[10px] text-white/30 mt-1">Collecting ticks...</p>
                          </div>
                        )}
                  </div>

                  {/* Bot action buttons */}
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={resetScan} className="border rounded-xl text-white/60 text-xs font-black py-3 transition active:scale-95"
                      style={{ borderColor: 'rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)' }}>
                      New Scan
                    </button>
                    <button onClick={handleLoadBot} className="bg-green-500 hover:bg-green-600 text-white text-xs font-black py-3 rounded-xl transition active:scale-95 flex items-center justify-center gap-1">
                      <Download size={12} />
                      Load Bot
                    </button>
                    <button onClick={handleLoadBot} className="text-white text-xs font-black py-3 rounded-xl transition active:scale-95 flex items-center justify-center gap-1"
                      style={{ background: 'linear-gradient(135deg, #E67E22, #8E44AD)' }}>
                      <Play size={12} />
                      Load & Run
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── MARKET MONITOR TAB ── */}
          {activeTab === 'monitor' && (
            <div className="p-3 flex-1 flex flex-col min-h-0">
              <MarketMonitor
                embedded
                theme={theme}
                onSelectSymbol={(symId: string) => {
                  setSelectedSymbol(symId);
                  setActiveTab('scanner');
                }}
                onLoadBot={(symId: string, symName: string, stratId: string) => {
                  setBotSymbol(symId);
                  setBotSymbolName(symName);
                  setBotStrategyId(stratId);
                  setBotStrategyLabel(stratId === 'even_odd' ? 'Even / Odd' : stratId === 'over_under' ? 'Over / Under' : stratId === 'matches' ? 'Matches' : 'Differs');
                  setIsBotModalOpen(true);
                }}
              />
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );

  return (
    <>
      {step === 'orb' && orbEl}
      {panel}
      <AutoHunterBotModal
        isOpen={isBotModalOpen}
        onClose={() => setIsBotModalOpen(false)}
        symbol={botSymbol}
        symbolName={botSymbolName}
        strategyId={botStrategyId}
        strategyLabel={botStrategyLabel}
        marketTicks={subscriptionState?.ticks}
        marketQuotes={subscriptionState?.quotes}
        theme={theme}
      />
    </>
  );
}

function suggestAltTradeType(currentTypeId: string, signals: Signal[]): string {
  const hasStrong = (types: string[]) => signals.some(s =>
    types.includes(s.type) && s.status === 'TRADE NOW' && s.probability >= 55
  );
  const suggestions: Record<string, string> = {
    over_under: 'even_odd',
    even_odd: 'over_under',
    matches: 'differs',
    differs: 'matches',
    rise_fall: 'even_odd',
    pro_over_under: 'pro_even_odd',
    pro_even_odd: 'pro_over_under',
  };
  const suggested = suggestions[currentTypeId] ?? 'even_odd';
  const altTradeTypeMap: Record<string, string[]> = {
    even_odd: ['even_odd', 'pro_even_odd'],
    over_under: ['over_under', 'pro_over_under', 'under_7', 'over_2'],
    matches: ['matches'],
    differs: ['differs'],
    rise_fall: ['rise_fall'],
  };
  if (hasStrong(altTradeTypeMap[suggested] ?? ['even_odd'])) return suggested;
  for (const alt of ['even_odd', 'over_under', 'matches', 'differs', 'rise_fall']) {
    if (alt === currentTypeId) continue;
    if (hasStrong(altTradeTypeMap[alt] ?? [])) return alt;
  }
  return suggested;
}
