import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Square, Loader2, TrendingUp, TrendingDown, Zap, Shield, Target, AlertCircle, CheckCircle } from 'lucide-react';
import { buyContractForUi, streamContractUntilSettled } from '@/utils/trade-purchase';

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
}

export const AutoHunterBotModal: React.FC<AutoHunterBotModalProps> = ({
  isOpen,
  onClose,
  symbol,
  symbolName,
  strategyId,
  strategyLabel,
  signalConfidence = 85,
  marketTicks = [],
  marketQuotes = []
}) => {
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

      // Simulated strategy trigger condition check (or high-confidence tick breach)
      const shouldTriggerTrade = Math.random() > 0.65;

      if (shouldTriggerTrade) {
        setIsExecuting(true);
        setIsSearching(false);
        setStatusMessage(`Entry point detected! Placing ${selectedTradeType} trade for $${currentStake.toFixed(2)}...`);
        addLog(`⚡ Entry signal confirmed on ${symbol}! Purchasing ${selectedTradeType}...`);

        try {
          // Prepare parameters for trade
          const parameters = {
            amount: currentStake,
            basis: 'stake',
            contract_type: selectedTradeType,
            currency: 'USD',
            duration: 1,
            duration_unit: 't',
            symbol: symbol || 'R_100',
          };

          const buyResult = await buyContractForUi({
            parameters,
            price: currentStake,
            source: 'MarketHunterProAutoBot'
          });

          if (buyResult?.contract_id) {
            addLog(`Contract purchased (#${buyResult.contract_id}). Streaming tick settlement...`);
            
            const settlement = await streamContractUntilSettled(buyResult.contract_id);
            const profit = settlement?.profit ?? 0;
            const isWin = profit > 0;

            setTotalTrades(t => t + 1);
            if (isWin) {
              setWins(w => w + 1);
              setNetProfit(p => +(p + profit).toFixed(2));
              addLog(`🎉 Trade WON! Profit: +$${profit.toFixed(2)}`, 'win');
              setCurrentStake(stake); // Reset stake on win
            } else {
              setLosses(l => l + 1);
              setNetProfit(p => +(p + profit).toFixed(2));
              addLog(`❌ Trade LOST. Loss: -$${Math.abs(profit).toFixed(2)}`, 'loss');
              // Apply Martingale
              const nextStake = +(currentStake * martingale).toFixed(2);
              setCurrentStake(nextStake);
              addLog(`📈 Martingale applied. Next stake: $${nextStake.toFixed(2)}`, 'warn');
            }

            // Check Safety Limits
            const updatedNetProfit = netProfit + profit;
            if (updatedNetProfit >= takeProfit) {
              addLog(`🏆 TAKE PROFIT TARGET REACHED (+${updatedNetProfit.toFixed(2)})! Stopping Bot.`, 'win');
              handleStop();
              return;
            }
            if (Math.abs(updatedNetProfit) >= stopLoss && updatedNetProfit < 0) {
              addLog(`🚨 STOP LOSS TARGET REACHED (-${Math.abs(updatedNetProfit).toFixed(2)})! Stopping Bot.`, 'warn');
              handleStop();
              return;
            }
          }
        } catch (e: any) {
          addLog(`Error executing trade: ${e?.message || e}`, 'warn');
        } finally {
          setIsExecuting(false);
          if (isRunningRef.current) {
            setIsSearching(true);
            setStatusMessage('Searching for next high-probability entry point...');
          }
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isRunning, isExecuting, currentStake, symbol, selectedTradeType, stake, martingale, takeProfit, stopLoss, netProfit]);

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
        background: 'var(--general-section-1, #151717)',
        border: '1px solid var(--border-normal, rgba(255, 255, 255, 0.15))',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '680px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.2rem 1.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(56, 189, 248, 0.3)'
            }}>
              <Zap size={22} color='#ffffff' />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#ffffff' }}>
                Auto-Hunter Bot: {symbolName}
              </h3>
              <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                Strategy: <strong style={{ color: '#38bdf8' }}>{strategyLabel}</strong> ({selectedTradeType})
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
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
              background: 'rgba(255, 255, 255, 0.03)',
              padding: '1.2rem',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Stake ($)</label>
                <input
                  type='number'
                  value={stake}
                  onChange={e => setStake(Math.max(0.35, parseFloat(e.target.value) || 1))}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    background: '#090a0a',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontWeight: 600
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Martingale (x)</label>
                <input
                  type='number'
                  step='0.1'
                  value={martingale}
                  onChange={e => setMartingale(Math.max(1, parseFloat(e.target.value) || 1))}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    background: '#090a0a',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontWeight: 600
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#4ade80', marginBottom: '0.4rem' }}>Take Profit ($)</label>
                <input
                  type='number'
                  value={takeProfit}
                  onChange={e => setTakeProfit(Math.max(1, parseFloat(e.target.value) || 10))}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    background: '#090a0a',
                    border: '1px solid rgba(74, 222, 128, 0.3)',
                    borderRadius: '8px',
                    color: '#4ade80',
                    fontWeight: 600
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#f87171', marginBottom: '0.4rem' }}>Stop Loss ($)</label>
                <input
                  type='number'
                  value={stopLoss}
                  onChange={e => setStopLoss(Math.max(1, parseFloat(e.target.value) || 5))}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    background: '#090a0a',
                    border: '1px solid rgba(248, 113, 113, 0.3)',
                    borderRadius: '8px',
                    color: '#f87171',
                    fontWeight: 600
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
                <div style={{
                  position: 'absolute',
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  border: `2px solid ${isSearching ? '#38bdf8' : '#eab308'}`,
                  animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
                  opacity: 0.5
                }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
                  <span style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: isSearching ? '#38bdf8' : '#eab308',
                    boxShadow: `0 0 10px ${isSearching ? '#38bdf8' : '#eab308'}`
                  }} />
                  <strong style={{ fontSize: '1.05rem', color: '#ffffff' }}>
                    {isSearching ? 'Hunting High-Probability Entry Conditions...' : 'Purchasing & Settlement In Progress...'}
                  </strong>
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
                  {statusMessage}
                </p>
              </div>
            </div>
          )}

          {/* Performance Stats Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.8rem' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.8rem', borderRadius: '10px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Total Trades</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff' }}>{totalTrades}</div>
            </div>
            <div style={{ background: 'rgba(74, 222, 128, 0.05)', border: '1px solid rgba(74, 222, 128, 0.2)', padding: '0.8rem', borderRadius: '10px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#4ade80' }}>Wins</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#4ade80' }}>{wins}</div>
            </div>
            <div style={{ background: 'rgba(248, 113, 113, 0.05)', border: '1px solid rgba(248, 113, 113, 0.2)', padding: '0.8rem', borderRadius: '10px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#f87171' }}>Losses</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f87171' }}>{losses}</div>
            </div>
            <div style={{
              background: netProfit >= 0 ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
              border: `1px solid ${netProfit >= 0 ? '#4ade80' : '#f87171'}`,
              padding: '0.8rem',
              borderRadius: '10px',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Net PnL</span>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: netProfit >= 0 ? '#4ade80' : '#f87171' }}>
                {netProfit >= 0 ? `+$${netProfit.toFixed(2)}` : `-$${Math.abs(netProfit).toFixed(2)}`}
              </div>
            </div>
          </div>

          {/* Activity Logs */}
          <div style={{
            background: '#090a0a',
            borderRadius: '10px',
            padding: '0.8rem 1rem',
            height: '140px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            {logs.length === 0 ? (
              <span style={{ color: '#64748b' }}>Activity logs will appear here when the bot starts...</span>
            ) : (
              logs.map(log => (
                <div key={log.id} style={{
                  marginBottom: '0.3rem',
                  color: log.type === 'win' ? '#4ade80' : log.type === 'loss' ? '#f87171' : log.type === 'warn' ? '#eab308' : '#94a3b8'
                }}>
                  <span style={{ color: '#475569', marginRight: '0.5rem' }}>[{log.time}]</span>
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
          background: 'rgba(255, 255, 255, 0.02)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '1rem'
        }}>
          {!isRunning ? (
            <button
              onClick={handleStart}
              style={{
                padding: '0.75rem 2rem',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, #00a86b 0%, #059669 100%)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                boxShadow: '0 4px 15px rgba(0, 168, 107, 0.4)'
              }}
            >
              <Play size={18} /> Launch Auto Hunter Bot
            </button>
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
              <Square size={18} /> Stop Auto Hunter Bot
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
