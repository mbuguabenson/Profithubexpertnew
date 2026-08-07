import { ReactNode } from 'react';
import { Signal, SignalStatus } from '../lib/signals';
import { Zap, Clock, MinusCircle, CheckCircle2 } from 'lucide-react';

const statusConfig: Record<SignalStatus, { bg: string; text: string; border: string; icon: ReactNode }> = {
  'TRADE NOW': {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-500',
    border: 'border-emerald-500/30',
    icon: <Zap size={13} className="text-emerald-500 animate-pulse" />,
  },
  WAIT: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-500',
    border: 'border-amber-500/30',
    icon: <Clock size={13} className="text-amber-500" />,
  },
  NEUTRAL: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    icon: <MinusCircle size={13} className="text-slate-400" />,
  },
};

type Props = {
  signal: Signal;
  compact?: boolean;
  theme?: 'dark' | 'light';
};

export function SignalCard({ signal, compact = false, theme = 'dark' }: Props) {
  const cfg = statusConfig[signal.status];
  const barWidth = Math.min(signal.probability, 100);
  const isDark = theme === 'dark';

  return (
    <div
      className={`rounded-2xl p-4 transition-all duration-300 ${
        isDark ? 'mhp-neu-card-dark' : 'mhp-neu-card-light'
      }`}
    >
      <div className="flex items-start justify-between gap-2.5 mb-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{signal.label}</span>
            {signal.tradeDirection && (
              <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-lg ${isDark ? 'mhp-neu-button-dark text-sky-400' : 'mhp-neu-button-light text-sky-600'}`}>
                {signal.tradeDirection}
              </span>
            )}
          </div>
          <p className={`text-xs font-bold leading-snug ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{signal.recommendation}</p>
        </div>
        
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`flex items-center gap-1 text-[10px] font-black px-2.5 py-0.5 rounded-full border ${cfg.border} ${cfg.text} shadow-sm`}
          >
            {cfg.icon}
            {signal.status}
          </span>
          <span className={`text-sm font-black font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>{signal.probability.toFixed(0)}%</span>
        </div>
      </div>

      {/* Recessed Neumorphic progress bar */}
      <div className={`w-full h-2.5 rounded-full overflow-hidden mb-2 p-0.5 ${isDark ? 'mhp-neu-inset-dark' : 'mhp-neu-inset-light'}`}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${barWidth}%`,
            background:
              signal.status === 'TRADE NOW'
                ? 'linear-gradient(90deg, #10b981, #0284c7)'
                : signal.status === 'WAIT'
                ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
                : '#64748b'
          }}
        />
      </div>

      {!compact && (
        <div className={`flex items-center gap-1.5 text-[10px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          <CheckCircle2 size={11} className="text-slate-400 shrink-0" />
          <span className="truncate"><strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>Condition:</strong> {signal.entryCondition}</span>
        </div>
      )}
    </div>
  );
}
