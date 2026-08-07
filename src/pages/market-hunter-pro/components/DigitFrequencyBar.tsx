import { AnalysisResult } from '../lib/analysis';

type Props = {
  analysis?: AnalysisResult;
  frequencies?: { digit: number; percentage: number }[];
  totalTicks?: number;
};

export function DigitFrequencyBar({ analysis, frequencies, totalTicks }: Props) {
  const digitFrequencies = frequencies || analysis?.digitFrequencies || [];
  const ticksCount = totalTicks || analysis?.totalTicks || 1000;
  const max = Math.max(...digitFrequencies.map((d) => d.percentage), 1);

  const lowCount = digitFrequencies.filter(d => d.digit <= 4).reduce((acc, d) => acc + d.percentage, 0);
  const highCount = digitFrequencies.filter(d => d.digit >= 5).reduce((acc, d) => acc + d.percentage, 0);

  return (
    <div className="bg-slate-900/60 rounded-xl p-3 border border-white/10 shadow-inner">
      <div className="flex items-center justify-between mb-2 text-[10px]">
        <span className="font-bold text-slate-400 uppercase tracking-wider">Digit Distribution</span>
        <span className="font-mono font-semibold text-slate-400">{ticksCount} ticks</span>
      </div>

      <div className="flex items-end gap-1 h-20 pt-2">
        {digitFrequencies.map((df) => {
          const isHigh = df.digit >= 5;
          const heightPct = max > 0 ? (df.percentage / max) * 100 : 0;
          const isHot = df.percentage >= 12;

          return (
            <div key={df.digit} className="flex-1 flex flex-col items-center gap-1 group relative">
              <span className="text-[8px] font-mono font-bold text-slate-400">{df.percentage.toFixed(0)}%</span>
              <div className="w-full flex items-end h-12 bg-slate-950/50 rounded-sm p-0.5 border border-white/5">
                <div
                  className="w-full rounded-sm transition-all duration-500"
                  style={{
                    height: `${Math.max(heightPct, 6)}%`,
                    background: isHot
                      ? 'linear-gradient(180deg, #f43f5e 0%, #be123c 100%)'
                      : isHigh
                      ? 'linear-gradient(180deg, #10b981 0%, #047857 100%)'
                      : 'linear-gradient(180deg, #38bdf8 0%, #0284c7 100%)',
                    boxShadow: isHot ? '0 0 10px rgba(244, 63, 94, 0.5)' : 'none'
                  }}
                />
              </div>
              <span className="text-[10px] font-black font-mono text-slate-200">{df.digit}</span>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between mt-2.5 pt-2 border-t border-white/5 text-[10px] font-bold">
        <span className="text-sky-400">Low (0-4): {lowCount.toFixed(1)}%</span>
        <span className="text-emerald-400">High (5-9): {highCount.toFixed(1)}%</span>
      </div>
    </div>
  );
}
