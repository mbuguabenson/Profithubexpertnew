import { ReactNode } from 'react';
import { Signal, SignalStatus } from '../lib/signals';
import { Zap, Clock, MinusCircle, CheckCircle2 } from 'lucide-react';

const statusConfig: Record<SignalStatus, { bg: string; text: string; border: string; glow: string; icon: ReactNode }> = {
  'TRADE NOW': {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    glow: '0 0 15px rgba(16, 185, 129, 0.2)',
    icon: <Zap size={13} className="text-emerald-400 animate-pulse" />,
  },
  WAIT: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    glow: '0 0 15px rgba(245, 158, 11, 0.2)',
    icon: <Clock size={13} className="text-amber-400" />,
  },
  NEUTRAL: {
    bg: 'bg-slate-800/40',
    text: 'text-slate-400',
    border: 'border-slate-700/40',
    glow: 'none',
    icon: <MinusCircle size={13} className="text-slate-400" />,
  },
};

type Props = {
  signal: Signal;
  compact?: boolean;
};

export function SignalCard({ signal, compact = false }: Props) {
  const cfg = statusConfig[signal.status];
  const barWidth = Math.min(signal.probability, 100);

  return (
    <div
      className={`mhp-glass-card rounded-2xl border ${cfg.border} ${cfg.bg} p-3.5 transition-all duration-300`}
      style={{ boxShadow: cfg.glow }}
    >
      <div className="flex items-start justify-between gap-2.5 mb-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{signal.label}</span>
            {signal.tradeDirection && (
              <span className="bg-slate-800 border border-slate-700 text-sky-400 text-[10px] font-black px-2 py-0.5 rounded-lg shadow-sm">
                {signal.tradeDirection}
              </span>
            )}
          </div>
          <p className="text-xs font-bold text-slate-100 leading-snug">{signal.recommendation}</p>
        </div>
        
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`flex items-center gap-1 text-[10px] font-black px-2.5 py-0.5 rounded-full border ${cfg.border} ${cfg.text} shadow-sm`}
          >
            {cfg.icon}
            {signal.status}
          </span>
          <span className="text-sm font-black font-mono text-white">{signal.probability.toFixed(0)}%</span>
        </div>
      </div>

      {/* Glowing probability bar */}
      <div className="w-full bg-slate-800/80 h-2 rounded-full overflow-hidden mb-2 p-0.5 border border-white/5">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${barWidth}%`,
            background:
              signal.status === 'TRADE NOW'
                ? 'linear-gradient(90deg, #10b981, #0284c7)'
                : signal.status === 'WAIT'
                ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
                : '#64748b',
            boxShadow: signal.status === 'TRADE NOW' ? '0 0 10px rgba(16, 185, 129, 0.5)' : 'none'
          }}
        />
      </div>

      {!compact && (
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1">
          <CheckCircle2 size={11} className="text-slate-500 shrink-0" />
          <span className="truncate"><strong className="text-slate-300">Condition:</strong> {signal.entryCondition}</span>
        </div>
      )}
    </div>
  );
}
