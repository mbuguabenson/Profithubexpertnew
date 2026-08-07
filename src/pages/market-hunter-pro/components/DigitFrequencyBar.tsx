import { AnalysisResult } from '../lib/analysis';

type Props = {
  analysis?: AnalysisResult;
  frequencies?: { digit: number; percentage: number }[];
  totalTicks?: number;
  theme?: 'dark' | 'light';
};

export function DigitFrequencyBar({ analysis, frequencies, totalTicks, theme = 'dark' }: Props) {
  const digitFrequencies = frequencies || analysis?.digitFrequencies || [];
  const ticksCount = totalTicks || analysis?.totalTicks || 1000;
  const max = Math.max(...digitFrequencies.map((d) => d.percentage), 1);
  const isDark = theme === 'dark';

  const lowCount = digitFrequencies.filter(d => d.digit <= 4).reduce((acc, d) => acc + d.percentage, 0);
  const highCount = digitFrequencies.filter(d => d.digit >= 5).reduce((acc, d) => acc + d.percentage, 0);

  return (
    <div className={`rounded-2xl p-3.5 transition-all duration-300 ${isDark ? 'mhp-neu-inset-dark' : 'mhp-neu-inset-light'}`}>
      <div className="flex items-center justify-between mb-2 text-xs">
        <span className={`font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Digit Distribution</span>
        <span className={`font-mono font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{ticksCount} ticks</span>
      </div>

      <div className="flex items-end gap-1.5 h-20 pt-2">
        {digitFrequencies.map((df) => {
          const isHigh = df.digit >= 5;
          const heightPct = max > 0 ? (df.percentage / max) * 100 : 0;
          const isHot = df.percentage >= 12;

          return (
            <div key={df.digit} className="flex-1 flex flex-col items-center gap-1 group relative">
              <span className={`text-[9px] font-mono font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{df.percentage.toFixed(0)}%</span>
              <div className={`w-full flex items-end h-12 rounded-lg p-0.5 ${isDark ? 'bg-slate-950/40' : 'bg-slate-300/40'}`}>
                <div
                  className="w-full rounded-md transition-all duration-500"
                  style={{
                    height: `${Math.max(heightPct, 8)}%`,
                    background: isHot
                      ? 'linear-gradient(180deg, #f43f5e 0%, #be123c 100%)'
                      : isHigh
                      ? 'linear-gradient(180deg, #10b981 0%, #047857 100%)'
                      : 'linear-gradient(180deg, #38bdf8 0%, #0284c7 100%)'
                  }}
                />
              </div>
              <span className={`text-xs font-black font-mono ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{df.digit}</span>
            </div>
          );
        })}
      </div>

      <div className={`flex justify-between mt-2.5 pt-2 border-t text-xs font-bold ${isDark ? 'border-slate-800' : 'border-slate-300/60'}`}>
        <span className="text-sky-500">Low (0-4): {lowCount.toFixed(1)}%</span>
        <span className="text-emerald-500">High (5-9): {highCount.toFixed(1)}%</span>
      </div>
    </div>
  );
}
