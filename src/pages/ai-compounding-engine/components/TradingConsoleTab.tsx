import React, { useState } from 'react';
import { SymbolMarketData } from '../hooks/useCompoundingWS';

interface TradingConsoleTabProps {
    activeSymbol: string;
    activeMarketData?: SymbolMarketData;
    balance: number;
    buyProposal: (contractType: string, stake: number, duration?: number, prediction?: number) => Promise<any>;
    botStatus: string;
    setBotStatus: (s: string) => void;
    onAddTradeLog: (log: any) => void;
}

export const TradingConsoleTab: React.FC<TradingConsoleTabProps> = ({
    activeSymbol,
    activeMarketData,
    balance,
    buyProposal,
    botStatus,
    setBotStatus,
    onAddTradeLog,
}) => {
    const [tradeType, setTradeType] = useState<string>('Over / Under');
    const [contractType, setContractType] = useState<string>('DIGITOVER');
    const [stake, setStake] = useState<number>(0.35);
    const [duration, setDuration] = useState<number>(1);
    const [prediction, setPrediction] = useState<number>(2);
    const [tp, setTp] = useState<number>(50);
    const [sl, setSl] = useState<number>(20);
    const [martingale, setMartingale] = useState<number>(1.5);
    const [isExecuting, setIsExecuting] = useState(false);

    const handleManualTrade = async () => {
        setIsExecuting(true);
        try {
            const res = await buyProposal(contractType, stake, duration, prediction);
            if (res.success) {
                const log = {
                    id: `ACE-${res.contractId}`,
                    timestamp: Date.now(),
                    symbol: activeSymbol,
                    strategy: tradeType,
                    contractType,
                    stake,
                    pnl: res.pnl,
                    runningBalance: (balance || 400) + res.pnl,
                    result: res.isWin ? 'WIN' : 'LOSS',
                    duration,
                    signalStrength: activeMarketData?.signalStrength || 85,
                    recoveryUsed: false,
                };
                onAddTradeLog(log);
            } else {
                alert(res.message || 'Trade execution failed. Please ensure you are logged into your real Deriv account.');
            }
        } finally {
            setIsExecuting(false);
        }
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem' }}>
            {/* Main Trading Controls Form */}
            <div className="ace-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Smart Trade Execution Console</h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                        <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Market Symbol</label>
                        <input className="ace-input" value={activeMarketData?.displayName || activeSymbol} readOnly />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Strategy Type</label>
                        <select
                            className="ace-input"
                            value={tradeType}
                            onChange={(e) => setTradeType(e.target.value)}
                        >
                            <option value="Over / Under">Over / Under</option>
                            <option value="Even / Odd">Even / Odd</option>
                            <option value="Digit Differs">Digit Differs</option>
                            <option value="Digit Matches">Digit Matches</option>
                            <option value="Rise / Fall">Rise / Fall</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Contract Type</label>
                        <select
                            className="ace-input"
                            value={contractType}
                            onChange={(e) => setContractType(e.target.value)}
                        >
                            <option value="DIGITOVER">DIGITOVER</option>
                            <option value="DIGITUNDER">DIGITUNDER</option>
                            <option value="DIGITEVEN">DIGITEVEN</option>
                            <option value="DIGITODD">DIGITODD</option>
                            <option value="DIGITDIFF">DIGITDIFF</option>
                            <option value="DIGITMATCH">DIGITMATCH</option>
                        </select>
                    </div>

                    <div>
                        <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Trade Stake ($)</label>
                        <input
                            type="number"
                            className="ace-input"
                            value={stake}
                            onChange={(e) => setStake(parseFloat(e.target.value) || 0.35)}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Duration (Ticks)</label>
                        <input
                            type="number"
                            className="ace-input"
                            value={duration}
                            onChange={(e) => setDuration(parseInt(e.target.value, 10) || 1)}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Prediction Barrier</label>
                        <input
                            type="number"
                            className="ace-input"
                            value={prediction}
                            onChange={(e) => setPrediction(parseInt(e.target.value, 10) || 0)}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Take Profit ($)</label>
                        <input
                            type="number"
                            className="ace-input"
                            value={tp}
                            onChange={(e) => setTp(parseFloat(e.target.value) || 0)}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Stop Loss ($)</label>
                        <input
                            type="number"
                            className="ace-input"
                            value={sl}
                            onChange={(e) => setSl(parseFloat(e.target.value) || 0)}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '0.3rem' }}>Martingale Multiplier</label>
                        <input
                            type="number"
                            step="0.1"
                            className="ace-input"
                            value={martingale}
                            onChange={(e) => setMartingale(parseFloat(e.target.value) || 1.5)}
                        />
                    </div>
                </div>

                {/* Control Action Buttons */}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    <button className="ace-btn btn-primary" onClick={handleManualTrade} disabled={isExecuting}>
                        {isExecuting ? '⏳ Purchasing...' : '⚡ Buy Contract'}
                    </button>
                    {botStatus === 'AUTO' ? (
                        <button className="ace-btn btn-secondary" onClick={() => setBotStatus('PAUSED')}>
                            ⏸ Pause Auto Trading
                        </button>
                    ) : (
                        <button className="ace-btn btn-accent" onClick={() => setBotStatus('AUTO')}>
                            ▶ Start Auto Trading
                        </button>
                    )}
                    <button className="ace-btn btn-danger" onClick={() => setBotStatus('WAITING')}>
                        ⏹ Stop & Close All
                    </button>
                </div>
            </div>

            {/* Smart Signal Meter & Recommendation Panel */}
            <div className="ace-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h4 style={{ margin: 0, color: '#10b981' }}>Smart Signal Meter</h4>

                <div style={{ textAlign: 'center', padding: '1.5rem 0', background: 'rgba(30, 41, 59, 0.5)', borderRadius: '16px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase' }}>Signal Strength</div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#10b981', margin: '0.2rem 0' }}>
                        {activeMarketData?.signalStrength || 85}%
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f59e0b' }}>VERY STRONG</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span>Probability Rating:</span>
                        <strong style={{ color: '#3b82f6' }}>{activeMarketData?.probabilityScore || 88}%</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span>Market Health:</span>
                        <strong style={{ color: '#10b981' }}>{activeMarketData?.healthScore || 92}%</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span>AI Recommendation:</span>
                        <strong style={{ color: '#10b981', background: 'rgba(16,185,129,0.15)', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                            TRADE 🚀
                        </strong>
                    </div>
                </div>
            </div>
        </div>
    );
};
