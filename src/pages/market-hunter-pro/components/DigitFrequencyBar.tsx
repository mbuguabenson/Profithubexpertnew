import { AnalysisResult } from '../lib/analysis';

type Props = {
  analysis: AnalysisResult;
};

export function DigitFrequencyBar({ analysis }: Props) {
  const { digitFrequencies } = analysis;
  const max = Math.max(...digitFrequencies.map((d) => d.percentage), 1);

  return (
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 text-center">
        Digit Distribution ({analysis.totalTicks} ticks)
      </p>
      <div className="flex items-end gap-1 h-16">
        {digitFrequencies.map((df) => {
          const isHigh = df.digit >= 5;
          const heightPct = max > 0 ? (df.percentage / max) * 100 : 0;
          return (
            <div key={df.digit} className="flex-1 flex flex-col items-center gap-0.5">
              <span className="text-[8px] font-bold text-gray-500">{df.percentage.toFixed(0)}%</span>
              <div className="w-full flex items-end" style={{ height: '36px' }}>
                <div
                  className="w-full rounded-sm transition-all duration-500"
                  style={{
                    height: `${Math.max(heightPct, 4)}%`,
                    background: isHigh
                      ? 'linear-gradient(180deg, #f5c542, #e67e22)'
                      : 'linear-gradient(180deg, #3b82f6, #1d4ed8)',
                  }}
                />
              </div>
              <span className="text-[9px] font-black text-gray-600">{df.digit}</span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-[9px] font-bold">
        <span style={{ color: '#3b82f6' }}>Low (0-4): {analysis.lowPercentage.toFixed(1)}%</span>
        <span style={{ color: '#f5c542' }}>High (5-9): {analysis.highPercentage.toFixed(1)}%</span>
      </div>
    </div>
  );
}
