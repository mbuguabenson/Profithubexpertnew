import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useCompoundingWS } from './hooks/useCompoundingWS';
import { calculateCompoundingPlan, CompoundingSummary } from './utils/compounding-calculator';
import { DashboardTab } from './components/DashboardTab';
import { ChallengeGeneratorTab } from './components/ChallengeGeneratorTab';
import { MarketScannerTab } from './components/MarketScannerTab';
import { StrategyAnalyticsTab } from './components/StrategyAnalyticsTab';
import { TradingConsoleTab } from './components/TradingConsoleTab';
import { AutoCompoundingTab } from './components/AutoCompoundingTab';
import { RecoveryEngineTab } from './components/RecoveryEngineTab';
import { SmartZonesTab } from './components/SmartZonesTab';
import { PerformanceTab } from './components/PerformanceTab';
import { TransactionHistoryTab } from './components/TransactionHistoryTab';
import './ai-compounding-engine.scss';

type ACEActiveTab =
    | 'dashboard'
    | 'scanner'
    | 'analytics'
    | 'console'
    | 'autocompounding'
    | 'recovery'
    | 'smartzones'
    | 'history'
    | 'performance'
    | 'settings';

const AICompoundingEngine = observer(() => {
    const [activeTab, setActiveTab] = useState<ACEActiveTab>('dashboard');
    const [botStatus, setBotStatus] = useState<string>('AUTO');
    const [summary, setSummary] = useState<CompoundingSummary>(() => calculateCompoundingPlan(400, 4000, 150));
    const [tradeLogs, setTradeLogs] = useState<any[]>([]);

    const {
        isConnected,
        isAuthorized,
        accountLoginId,
        activeSymbol,
        changeActiveSymbol,
        balance,
        marketsData,
        buyProposal,
    } = useCompoundingWS();

    const activeMarketData = marketsData[activeSymbol];

    const handleAddTradeLog = (newLog: any) => {
        setTradeLogs(prev => [newLog, ...prev]);
    };

    return (
        <div className="ace-container">
            {/* Header Bar */}
            <div className="ace-header">
                <div className="ace-brand">
                    <div>
                        <h1 className="ace-title">⭐ AI Compounding Engine</h1>
                        <p className="ace-subtitle">Quantum Statistical Trading Brain & Challenge Automation</p>
                    </div>
                </div>

                <div className="ace-header-status">
                    {/* Connection & Account Badge */}
                    <div className="ace-status-badge">
                        <span className={`ace-dot ${isConnected ? 'ace-dot--connected' : 'ace-dot--disconnected'}`} />
                        <span className="ace-status-text">
                            {isAuthorized
                                ? accountLoginId
                                    ? `${accountLoginId}`
                                    : 'Authorized'
                                : isConnected
                                  ? 'Connecting…'
                                  : 'Offline'}
                        </span>
                    </div>

                    {/* Balance pill */}
                    {balance !== undefined && balance !== null && (
                        <div className="ace-balance-pill">
                            <span className="ace-balance-label">Balance</span>
                            <span className="ace-balance-value">{Number(balance).toFixed(2)}</span>
                        </div>
                    )}

                    {/* Bot status pill */}
                    <span className={`ace-status-pill status-${botStatus}`}>{botStatus}</span>
                </div>
            </div>

            {/* Sub-Tabs Bar */}
            <div className="ace-nav-tabs">
                <button
                    className={`ace-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
                    onClick={() => setActiveTab('dashboard')}
                >
                    📊 Dashboard
                </button>
                <button
                    className={`ace-tab-btn ${activeTab === 'scanner' ? 'active' : ''}`}
                    onClick={() => setActiveTab('scanner')}
                >
                    🔍 Market Scanner
                </button>
                <button
                    className={`ace-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
                    onClick={() => setActiveTab('analytics')}
                >
                    📈 Strategy Analytics
                </button>
                <button
                    className={`ace-tab-btn ${activeTab === 'console' ? 'active' : ''}`}
                    onClick={() => setActiveTab('console')}
                >
                    ⚡ Trading Console
                </button>
                <button
                    className={`ace-tab-btn ${activeTab === 'autocompounding' ? 'active' : ''}`}
                    onClick={() => setActiveTab('autocompounding')}
                >
                    🚀 Auto Compounding
                </button>
                <button
                    className={`ace-tab-btn ${activeTab === 'recovery' ? 'active' : ''}`}
                    onClick={() => setActiveTab('recovery')}
                >
                    🛡️ Recovery Engine
                </button>
                <button
                    className={`ace-tab-btn ${activeTab === 'smartzones' ? 'active' : ''}`}
                    onClick={() => setActiveTab('smartzones')}
                >
                    🎯 Smart Zones
                </button>
                <button
                    className={`ace-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                    onClick={() => setActiveTab('history')}
                >
                    📜 Transaction History
                </button>
                <button
                    className={`ace-tab-btn ${activeTab === 'performance' ? 'active' : ''}`}
                    onClick={() => setActiveTab('performance')}
                >
                    📊 Performance
                </button>
                <button
                    className={`ace-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
                    onClick={() => setActiveTab('settings')}
                >
                    ⚙️ Settings
                </button>
            </div>

            {/* Active Content Area */}
            <div className="ace-content-area">
                {activeTab === 'dashboard' && (
                    <DashboardTab
                        summary={summary}
                        botStatus={botStatus}
                        setBotStatus={setBotStatus}
                        activeMarketData={activeMarketData}
                        balance={balance}
                        tradeLogs={tradeLogs}
                    />
                )}

                {activeTab === 'scanner' && (
                    <MarketScannerTab
                        marketsData={marketsData}
                        activeSymbol={activeSymbol}
                        onSelectSymbol={changeActiveSymbol}
                    />
                )}

                {activeTab === 'analytics' && (
                    <StrategyAnalyticsTab activeMarketData={activeMarketData} />
                )}

                {activeTab === 'console' && (
                    <TradingConsoleTab
                        activeSymbol={activeSymbol}
                        activeMarketData={activeMarketData}
                        balance={balance}
                        buyProposal={buyProposal}
                        botStatus={botStatus}
                        setBotStatus={setBotStatus}
                        onAddTradeLog={handleAddTradeLog}
                    />
                )}

                {activeTab === 'autocompounding' && (
                    <AutoCompoundingTab summary={summary} balance={balance} />
                )}

                {activeTab === 'recovery' && <RecoveryEngineTab />}

                {activeTab === 'smartzones' && <SmartZonesTab marketsData={marketsData} />}

                {activeTab === 'history' && <TransactionHistoryTab tradeLogs={tradeLogs} />}

                {activeTab === 'performance' && (
                    <PerformanceTab summary={summary} balance={balance} tradeLogs={tradeLogs} />
                )}

                {activeTab === 'settings' && (
                    <ChallengeGeneratorTab summary={summary} onUpdateSummary={setSummary} />
                )}
            </div>
        </div>
    );
});

export default AICompoundingEngine;
