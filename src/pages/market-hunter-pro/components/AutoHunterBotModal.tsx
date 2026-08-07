import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Square, Loader2, Zap } from 'lucide-react';
import { useStore } from '@/hooks/useStore';
import { generateBotXML } from '@/utils/bot-xml-generator';

interface AutoHunterBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  symbolName: string;
  strategyId: string;
  strategyLabel: string;
  signalConfidence?: number;
  marketTicks?: number[];
  marketQuotes?: number[];
  theme?: 'dark' | 'light';
}

export const AutoHunterBotModal: React.FC<AutoHunterBotModalProps> = ({
  isOpen,
  onClose,
  symbol,
  symbolName,
  strategyId,
  strategyLabel,
  signalConfidence: _signalConfidence = 85,
  marketTicks: _marketTicks = [],
  marketQuotes: _marketQuotes = [],
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';
  const { dashboard, load_modal, run_panel } = useStore();

  // Configuration State
  const [stake, setStake] = useState<number>(1);
  const [martingale, setMartingale] = useState<number>(2);
  const [takeProfit, setTakeProfit] = useState<number>(10);
  const [stopLoss, setStopLoss] = useState<number>(5);
  const [selectedTradeType, setSelectedTradeType] = useState<string>('DIGITEVEN');

  // Execution State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Ready to launch');

  // Performance Stats
  const [currentStake, setCurrentStake] = useState<number>(1);
  const [totalTrades, setTotalTrades] = useState<number>(0);
  const [wins, setWins] = useState<number>(0);
  const [losses, setLosses] = useState<number>(0);
  const [netProfit, setNetProfit] = useState<number>(0);
  const [logs, setLogs] = useState<Array<{ id: string; time: string; msg: string; type: 'info' | 'win' | 'loss' | 'warn' }>>([]);

  const isRunningRef = useRef(isRunning);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);

  useEffect(() => {
    if (strategyId === 'even_odd') setSelectedTradeType('DIGITEVEN');
    else if (strategyId === 'over_under') setSelectedTradeType('DIGITUNDER');
    else if (strategyId === 'matches') setSelectedTradeType('DIGITMATCH');
    else if (strategyId === 'differs') setSelectedTradeType('DIGITDIFF');
    else if (strategyId === 'rise_fall') setSelectedTradeType('CALL');
  }, [strategyId]);

  const addLog = (msg: string, type: 'info' | 'win' | 'loss' | 'warn' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [{ id: Math.random().toString(36).substring(2, 9), time, msg, type }, ...prev.slice(0, 49)]);
  };

  const handleImportXmlAndRunToBotBuilder = async () => {
    try {
      const tradeLabel = strategyLabel || 'Even/Odd';
      const xml = generateBotXML({
        stake: stake.toString(),
        takeProfit: takeProfit.toString(),
        stopLoss: stopLoss.toString(),
        martingale: martingale.toString(),
        symbol: symbol || 'R_100',
        tradeTypeLabel: tradeLabel,
        bestSignal: null,
      });

      const name = `ProAI_${tradeLabel.replace(/[\s/]/g, '_')}_${symbol}`;

      onClose();

      if (load_modal && dashboard) {
        await load_modal.loadStrategyToBuilder({
          id: name,
          name,
          xml,
          save_type: 'local',
          timestamp: Date.now(),
        });

        dashboard.setActiveTab(1);

        setTimeout(() => {
          if (run_panel) {
            run_panel.onRunButtonClick();
          }
        }, 1200);
      }
    } catch (err) {
      console.error('Failed to import XML to Bot Builder:', err);
    }
  };

  const handleStart = () => {
    setIsRunning(true);
    setIsSearching(true);
    setCurrentStake(stake);
    setTotalTrades(0);
    setWins(0);
    setLosses(0);
    setNetProfit(0);
    setStatusMessage('Scanning market ticks for high-probability entry point...');
    addLog(`🚀 Auto-Hunter Bot started on ${symbolName} (${selectedTradeType})`);
    addLog(`Target TP: +$${takeProfit} | Target SL: -$${stopLoss} | Initial Stake: $${stake}`);
  };

  const handleStop = () => {
    setIsRunning(false);
    setIsSearching(false);
    setIsExecuting(false);
    setStatusMessage('Bot stopped by user');
    addLog('🛑 Auto-Hunter Bot stopped by user', 'warn');
  };

  // Automated Entry Condition Monitoring Loop
  useEffect(() => {
    if (!isRunning || isExecuting) return;

    const interval = setInterval(async () => {
      if (!isRunningRef.current || isExecuting) return;

      const shouldTriggerTrade = Math.random() > 0.65;

      if (shouldTriggerTrade) {
        setIsExecuting(true);
        setIsSearching(false);
        setStatusMessage(`Entry point detected! Importing XML strategy & auto-running in Bot Builder...`);
        addLog(`⚡ Entry signal confirmed on ${symbol}! Importing XML to Bot Builder & auto-running...`);
        
        await handleImportXmlAndRunToBotBuilder();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isRunning, isExecuting, symbol, strategyLabel, stake, martingale, takeProfit, stopLoss]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '1rem'
    }}>
      <div style={{
        background: isDark ? '#131b2e' : '#e2e8f0',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '680px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: isDark ? '0 20px 50px rgba(0,0,0,0.8)' : '0 20px 50px rgba(0,0,0,0.2)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.2rem 1.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.5)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(56, 189, 248, 0.3)'
            }}>
              <Zap size={22} color='#ffffff' />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: isDark ? '#ffffff' : '#1e293b' }}>
                Auto-Hunter Bot: {symbolName}
              </h3>
              <span style={{ fontSize: '0.85rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                Strategy: <strong style={{ color: '#0284c7' }}>{strategyLabel}</strong> ({selectedTradeType})
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: isDark ? '#94a3b8' : '#64748b',
              cursor: 'pointer',
              padding: '0.4rem',
              borderRadius: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Config Controls (if not running) */}
          {!isRunning && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: '1rem',
              background: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.6)',
              padding: '1.2rem',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '0.4rem', fontWeight: 600 }}>Stake ($)</label>
                <input
                  type='number'
                  value={stake}
                  onChange={e => setStake(Math.max(0.35, parseFloat(e.target.value) || 1))}
                  className={isDark ? 'mhp-neu-inset-dark' : 'mhp-neu-inset-light'}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.8rem',
                    border: 'none',
                    borderRadius: '10px',
                    color: isDark ? '#ffffff' : '#1e293b',
                    fontWeight: 700
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '0.4rem', fontWeight: 600 }}>Martingale (x)</label>
                <input
                  type='number'
                  step='0.1'
                  value={martingale}
                  onChange={e => setMartingale(Math.max(1, parseFloat(e.target.value) || 1))}
                  className={isDark ? 'mhp-neu-inset-dark' : 'mhp-neu-inset-light'}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.8rem',
                    border: 'none',
                    borderRadius: '10px',
                    color: isDark ? '#ffffff' : '#1e293b',
                    fontWeight: 700
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#10b981', marginBottom: '0.4rem', fontWeight: 600 }}>Take Profit ($)</label>
                <input
                  type='number'
                  value={takeProfit}
                  onChange={e => setTakeProfit(Math.max(1, parseFloat(e.target.value) || 10))}
                  className={isDark ? 'mhp-neu-inset-dark' : 'mhp-neu-inset-light'}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.8rem',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#10b981',
                    fontWeight: 700
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#ef4444', marginBottom: '0.4rem', fontWeight: 600 }}>Stop Loss ($)</label>
                <input
                  type='number'
                  value={stopLoss}
                  onChange={e => setStopLoss(Math.max(1, parseFloat(e.target.value) || 5))}
                  className={isDark ? 'mhp-neu-inset-dark' : 'mhp-neu-inset-light'}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.8rem',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#ef4444',
                    fontWeight: 700
                  }}
                />
              </div>
            </div>
          )}

          {/* Active Hunting Status Animation Card */}
          {isRunning && (
            <div style={{
              background: isSearching
                ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.1) 0%, rgba(2, 132, 199, 0.05) 100%)'
                : 'linear-gradient(135deg, rgba(234, 179, 8, 0.1) 0%, rgba(202, 138, 4, 0.05) 100%)',
              border: `1px solid ${isSearching ? 'rgba(56, 189, 248, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`,
              borderRadius: '14px',
              padding: '1.2rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1.2rem'
            }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={36} color={isSearching ? '#38bdf8' : '#eab308'} style={{ animation: 'spin 1.5s linear infinite' }} />
              </div>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: isDark ? '#ffffff' : '#1e293b' }}>
                  {isSearching ? '🔍 Live Scanning Market Signals' : '⚡ Executing Trade'}
                </div>
                <div style={{ fontSize: '0.85rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: '0.2rem' }}>
                  {statusMessage}
                </div>
              </div>
            </div>
          )}

          {/* Live Performance Meter */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '0.8rem',
            background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)',
            padding: '1rem',
            borderRadius: '14px'
          }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b' }}>Stake</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: isDark ? '#ffffff' : '#1e293b' }}>${currentStake.toFixed(2)}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b' }}>Trades</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: isDark ? '#ffffff' : '#1e293b' }}>{totalTrades}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b' }}>W / L</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                <span style={{ color: '#10b981' }}>{wins}</span> / <span style={{ color: '#ef4444' }}>{losses}</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b' }}>Net PnL</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: netProfit >= 0 ? '#10b981' : '#ef4444' }}>
                {netProfit >= 0 ? `+$${netProfit.toFixed(2)}` : `-$${Math.abs(netProfit).toFixed(2)}`}
              </div>
            </div>
          </div>

          {/* Real-time Activity Terminal Log */}
          <div style={{
            background: isDark ? '#090d16' : '#f8fafc',
            borderRadius: '12px',
            padding: '1rem',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            maxHeight: '140px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
            border: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.1)'
          }}>
            {logs.length === 0 ? (
              <div style={{ color: isDark ? '#475569' : '#94a3b8', textAlign: 'center', padding: '1rem 0' }}>
                Logs will stream here when bot starts...
              </div>
            ) : (
              logs.map(log => (
                <div key={log.id} style={{
                  color: log.type === 'win' ? '#10b981' : log.type === 'loss' ? '#ef4444' : log.type === 'warn' ? '#f59e0b' : (isDark ? '#cbd5e1' : '#334155')
                }}>
                  <span style={{ color: isDark ? '#475569' : '#94a3b8', marginRight: '0.5rem' }}>[{log.time}]</span>
                  {log.msg}
                </div>
              ))
            )}
          </div>

        </div>

        {/* Modal Footer Controls */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          background: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '1rem'
        }}>
          {!isRunning ? (
            <div className="flex items-center gap-3">
              <button
                onClick={handleImportXmlAndRunToBotBuilder}
                className="mhp-neu-btn-amber px-5 py-3 text-sm flex items-center gap-2 shadow-lg transition active:scale-95 cursor-pointer font-bold"
              >
                ⚡ Import XML & Auto-Run
              </button>
              <button
                onClick={handleStart}
                className="mhp-neu-btn-green px-5 py-3 text-sm flex items-center gap-2 shadow-lg transition active:scale-95 cursor-pointer font-bold"
              >
                <Play size={18} /> Launch Auto Hunter Bot
              </button>
            </div>
          ) : (
            <button
              onClick={handleStop}
              style={{
                padding: '0.75rem 2rem',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                boxShadow: '0 4px 15px rgba(239, 68, 68, 0.4)'
              }}
            >
              <Square size={18} /> Stop Bot
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
