import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useSmartChartAdaptor } from '@/hooks/useSmartChartAdaptor';
import { useDevice } from '@deriv-com/ui';
import { SmartChart, ChartTitle, TGranularity, TStateChangeListener } from '@deriv-com/smartcharts-champion';
import chart_api from '@/external/bot-skeleton/services/api/chart-api';
import { TTradeCategory } from '@/stores/trader-store';
import '@deriv-com/smartcharts-champion/dist/smartcharts.css';
import './dtrader.scss';

const TRADE_CATEGORIES: { id: TTradeCategory; label: string }[] = [
    { id: 'rise_fall', label: 'Rise / Fall' },
    { id: 'high_low', label: 'Higher / Lower' },
    { id: 'digits_match_diff', label: 'Matches / Differs' },
    { id: 'digits_over_under', label: 'Over / Under' },
    { id: 'digits_even_odd', label: 'Even / Odd' },
    { id: 'touch_no_touch', label: 'Touch / No Touch' },
    { id: 'multiplier', label: 'Multipliers' },
    { id: 'accumulator', label: 'Accumulator' },
];

const POPULAR_SYMBOLS = [
    { value: '1HZ10V', label: 'Volatility 10 (1s) Index' },
    { value: '1HZ25V', label: 'Volatility 25 (1s) Index' },
    { value: '1HZ50V', label: 'Volatility 50 (1s) Index' },
    { value: '1HZ75V', label: 'Volatility 75 (1s) Index' },
    { value: '1HZ100V', label: 'Volatility 100 (1s) Index' },
    { value: 'R_10', label: 'Volatility 10 Index' },
    { value: 'R_25', label: 'Volatility 25 Index' },
    { value: 'R_50', label: 'Volatility 50 Index' },
    { value: 'R_75', label: 'Volatility 75 Index' },
    { value: 'R_100', label: 'Volatility 100 Index' },
    { value: 'stpRNG', label: 'Step Index' },
    { value: 'JD50', label: 'Jump 50 Index' },
    { value: 'JD100', label: 'Jump 100 Index' },
];

const QUICK_STAKES = [0.5, 1, 2, 5, 10, 20, 50, 100];

const DTraderPage: React.FC = observer(() => {
    const { trader, client, common, ui, chart_store } = useStore();
    const { isDesktop, isMobile } = useDevice();
    const { chartData, getQuotes, subscribeQuotes, unsubscribeQuotes } = useSmartChartAdaptor();

    const {
        symbol,
        symbol_display_name,
        category,
        amount,
        duration,
        duration_unit,
        barrier,
        prediction,
        multiplier,
        growth_rate,
        proposal_1,
        proposal_2,
        is_proposal_loading,
        proposal_error,
        is_purchasing,
        purchase_error,
        active_contracts,
        setSymbol,
        setCategory,
        setAmount,
        setDuration,
        setDurationUnit,
        setBarrier,
        setPrediction,
        setMultiplier,
        setGrowthRate,
        purchaseContract,
        requestProposals,
    } = trader;

    useEffect(() => {
        requestProposals();
    }, [symbol, category, amount, duration, duration_unit, barrier, prediction, multiplier, growth_rate]);

    const settings = {
        assetInformation: false,
        countdown: true,
        isHighestLowestMarkerEnabled: false,
        language: common.current_language.toLowerCase(),
        position: 'bottom',
        theme: ui.is_dark_mode_on ? 'dark' : 'light',
    };

    const handleStateChange: TStateChangeListener = (state) => {
        if (state === 'READY') {
            chart_store.setChartStatus(true);
        }
    };

    const is_logged_in = !!client?.is_logged_in;
    const balance = client?.balance || '0.00';
    const currency = client?.currency || 'USD';
    const loginid = client?.loginid || '';

    if (!is_logged_in) {
        return (
            <div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'radial-gradient(circle at center, #121c30 0%, #080c16 100%)',
                color: '#e2e8f0',
                padding: '20px'
            }}>
                <div style={{
                    maxWidth: '480px',
                    width: '100%',
                    background: 'rgba(20, 30, 50, 0.85)',
                    backdropFilter: 'blur(20px)',
                    border: '1.5px solid rgba(0, 242, 254, 0.35)',
                    borderRadius: '20px',
                    padding: '36px',
                    textAlign: 'center',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '16px'
                }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '16px',
                        background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.2), rgba(124, 58, 237, 0.2))',
                        border: '1.5px solid #00f2fe',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#00f2fe',
                        boxShadow: '0 0 24px rgba(0, 242, 254, 0.3)'
                    }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                    </div>
                    <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#f8fafc', margin: 0 }}>
                        DTrader Pro Terminal
                    </h2>
                    <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0, lineHeight: 1.6 }}>
                        Please log in to your Deriv account to access real-time market execution and direct WebSocket trading.
                    </p>
                    <button
                        onClick={async () => {
                            const { generateOAuthURL } = await import('@/components/shared');
                            const url = await generateOAuthURL();
                            if (url) window.location.replace(url);
                        }}
                        style={{
                            marginTop: '8px',
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '12px',
                            padding: '12px 32px',
                            fontSize: '15px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            boxShadow: '0 4px 20px rgba(16, 185, 129, 0.4)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Log in with Deriv
                    </button>
                </div>
            </div>
        );
    }

    // Helper titles for dual buttons
    const getButtonLabels = () => {
        switch (category) {
            case 'rise_fall':
                return { top: 'Rise ↗', bottom: 'Fall ↘', typeTop: 'CALL', typeBottom: 'PUT' };
            case 'high_low':
                return { top: 'Higher ↗', bottom: 'Lower ↘', typeTop: 'HIGHER', typeBottom: 'LOWER' };
            case 'digits_match_diff':
                return { top: `Matches (${prediction}) 🎯`, bottom: `Differs (${prediction}) ⚡`, typeTop: 'DIGITMATCH', typeBottom: 'DIGITDIFF' };
            case 'digits_over_under':
                return { top: `Over (${prediction}) ▲`, bottom: `Under (${prediction}) ▼`, typeTop: 'DIGITOVER', typeBottom: 'DIGITUNDER' };
            case 'digits_even_odd':
                return { top: 'Even 🟢', bottom: 'Odd 🟣', typeTop: 'DIGITEVEN', typeBottom: 'DIGITODD' };
            case 'touch_no_touch':
                return { top: 'Touches 🎯', bottom: 'Does Not Touch 🛡️', typeTop: 'ONETOUCH', typeBottom: 'NOTOUCH' };
            case 'multiplier':
                return { top: 'Up (Multiplier) ↗', bottom: 'Down (Multiplier) ↘', typeTop: 'MULTUP', typeBottom: 'MULTDOWN' };
            case 'accumulator':
                return { top: 'Accumulate 📈', bottom: '', typeTop: 'ACCU', typeBottom: '' };
            default:
                return { top: 'Buy Top', bottom: 'Buy Bottom', typeTop: 'CALL', typeBottom: 'PUT' };
        }
    };

    const btnConfig = getButtonLabels();

    const getPayoutReturnPct = (proposal: any) => {
        if (!proposal?.payout || !proposal?.ask_price) return '0%';
        const profit = proposal.payout - proposal.ask_price;
        const returnPct = ((profit / proposal.ask_price) * 100).toFixed(1);
        return `+${returnPct}%`;
    };

    return (
        <div className='dtrader-native'>
            {/* Top Status Header */}
            <div className='dtrader-native__header'>
                <div className='dtrader-brand'>
                    <div className='dtrader-icon'>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                    </div>
                    <div className='dtrader-title'>
                        <h2>DTRADER PRO TERMINAL</h2>
                        <span>Live Direct Market Execution &amp; Deriv SmartCharts</span>
                    </div>
                </div>

                <div className='dtrader-account-pill'>
                    <span className='account-id'>{loginid}</span>
                    <span className='balance-text'>{currency} {Number(balance).toFixed(2)}</span>
                </div>
            </div>

            {/* Main Trading Floor Grid */}
            <div className='dtrader-native__layout'>
                {/* Left Live Interactive Chart */}
                <div className='dtrader-native__chart-pane'>
                    <SmartChart
                        id={`dtrader-${symbol}`}
                        key={`dtrader-chart-${symbol}`}
                        chartControlsWidgets={null}
                        enabledChartFooter={false}
                        stateChangeListener={handleStateChange}
                        chartType={chart_store.chart_type}
                        isMobile={isMobile}
                        enabledNavigationWidget={isDesktop}
                        granularity={chart_store.granularity as TGranularity}
                        getQuotes={getQuotes}
                        subscribeQuotes={subscribeQuotes}
                        unsubscribeQuotes={unsubscribeQuotes}
                        chartData={{ activeSymbols: chartData.activeSymbols, tradingTimes: chartData.tradingTimes }}
                        settings={settings}
                        symbol={symbol}
                        topWidgets={() => (
                            <ChartTitle
                                onChange={(selectedSymbol: string) => {
                                    setSymbol(selectedSymbol);
                                    chart_store.onSymbolChange(selectedSymbol);
                                }}
                            />
                        )}
                        isConnectionOpened={!!chart_api?.api}
                        isLive
                        leftMargin={isDesktop ? 20 : 10}
                        yAxisMargin={{ top: 0, bottom: 0 }}
                    />
                </div>

                {/* Right Trading Strategy & Execution Console */}
                <div className='dtrader-native__action-pane'>
                    {/* Category Selector */}
                    <div className='dtrader-category-grid'>
                        {TRADE_CATEGORIES.map((cat) => (
                            <button
                                key={cat.id}
                                className={`cat-btn ${category === cat.id ? 'cat-btn--active' : ''}`}
                                onClick={() => setCategory(cat.id)}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Market Selector */}
                    <div className='dtrader-form-group'>
                        <label>Underlying Market</label>
                        <select
                            value={symbol}
                            onChange={(e) => {
                                const selected = POPULAR_SYMBOLS.find(s => s.value === e.target.value);
                                setSymbol(e.target.value, selected?.label);
                                chart_store.onSymbolChange(e.target.value);
                            }}
                        >
                            {POPULAR_SYMBOLS.map((s) => (
                                <option key={s.value} value={s.value}>
                                    {s.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Duration Input */}
                    {category !== 'accumulator' && (
                        <div className='dtrader-form-group'>
                            <label>Duration</label>
                            <div className='input-row'>
                                <input
                                    type='number'
                                    min='1'
                                    max='3600'
                                    value={duration}
                                    onChange={(e) => setDuration(Number(e.target.value))}
                                />
                                <select
                                    value={duration_unit}
                                    onChange={(e) => setDurationUnit(e.target.value as any)}
                                    style={{ maxWidth: '110px' }}
                                >
                                    <option value='t'>Ticks</option>
                                    <option value='s'>Seconds</option>
                                    <option value='m'>Minutes</option>
                                    <option value='h'>Hours</option>
                                    <option value='d'>Days</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Digits Prediction Selector */}
                    {(category === 'digits_match_diff' || category === 'digits_over_under') && (
                        <div className='dtrader-form-group'>
                            <label>Prediction Digit (0–9)</label>
                            <input
                                type='number'
                                min='0'
                                max='9'
                                value={prediction}
                                onChange={(e) => setPrediction(Number(e.target.value))}
                            />
                        </div>
                    )}

                    {/* Barrier Input for High/Low or Touch */}
                    {(category === 'high_low' || category === 'touch_no_touch') && (
                        <div className='dtrader-form-group'>
                            <label>Barrier Offset</label>
                            <input
                                type='text'
                                value={barrier}
                                onChange={(e) => setBarrier(e.target.value)}
                            />
                        </div>
                    )}

                    {/* Multiplier / Accumulator Specifics */}
                    {category === 'multiplier' && (
                        <div className='dtrader-form-group'>
                            <label>Multiplier</label>
                            <select
                                value={multiplier}
                                onChange={(e) => setMultiplier(Number(e.target.value))}
                            >
                                <option value='10'>x10</option>
                                <option value='20'>x20</option>
                                <option value='50'>x50</option>
                                <option value='100'>x100</option>
                                <option value='200'>x200</option>
                                <option value='500'>x500</option>
                            </select>
                        </div>
                    )}

                    {category === 'accumulator' && (
                        <div className='dtrader-form-group'>
                            <label>Growth Rate</label>
                            <select
                                value={growth_rate}
                                onChange={(e) => setGrowthRate(Number(e.target.value))}
                            >
                                <option value='0.01'>1% per tick</option>
                                <option value='0.02'>2% per tick</option>
                                <option value='0.03'>3% per tick</option>
                                <option value='0.04'>4% per tick</option>
                                <option value='0.05'>5% per tick</option>
                            </select>
                        </div>
                    )}

                    {/* Stake Input */}
                    <div className='dtrader-form-group'>
                        <label>Stake Amount ({currency})</label>
                        <input
                            type='number'
                            step='0.5'
                            min='0.35'
                            value={amount}
                            onChange={(e) => setAmount(Number(e.target.value))}
                        />
                        <div className='quick-stake-chips'>
                            {QUICK_STAKES.map((s) => (
                                <button
                                    key={s}
                                    type='button'
                                    className='stake-chip'
                                    onClick={() => setAmount(s)}
                                >
                                    ${s}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Errors Notification */}
                    {(proposal_error || purchase_error) && (
                        <div style={{ color: '#ef4444', fontSize: '12px', fontWeight: 700, padding: '6px 10px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                            {proposal_error || purchase_error}
                        </div>
                    )}

                    {/* Dual Action Execution Buttons */}
                    <div className='dtrader-proposals-cluster'>
                        <button
                            type='button'
                            disabled={is_purchasing || is_proposal_loading}
                            className='proposal-btn proposal-btn--buy-top'
                            onClick={() => purchaseContract(btnConfig.typeTop)}
                        >
                            <div className='proposal-info'>
                                <span className='name'>{btnConfig.top}</span>
                                <span className='payout'>
                                    Payout: {currency} {proposal_1?.payout ? Number(proposal_1.payout).toFixed(2) : (amount * 1.95).toFixed(2)}
                                </span>
                            </div>
                            <div className='proposal-stake'>
                                <span className='stake-val'>{currency} {Number(amount).toFixed(2)}</span>
                                <span className='return-pct'>{getPayoutReturnPct(proposal_1)}</span>
                            </div>
                        </button>

                        {btnConfig.bottom && (
                            <button
                                type='button'
                                disabled={is_purchasing || is_proposal_loading}
                                className='proposal-btn proposal-btn--buy-bottom'
                                onClick={() => purchaseContract(btnConfig.typeBottom)}
                            >
                                <div className='proposal-info'>
                                    <span className='name'>{btnConfig.bottom}</span>
                                    <span className='payout'>
                                        Payout: {currency} {proposal_2?.payout ? Number(proposal_2.payout).toFixed(2) : (amount * 1.95).toFixed(2)}
                                    </span>
                                </div>
                                <div className='proposal-stake'>
                                    <span className='stake-val'>{currency} {Number(amount).toFixed(2)}</span>
                                    <span className='return-pct'>{getPayoutReturnPct(proposal_2)}</span>
                                </div>
                            </button>
                        )}
                    </div>

                    {/* Active Open Positions Section */}
                    {active_contracts.length > 0 && (
                        <div className='dtrader-native__positions'>
                            <div className='pos-header'>
                                <span>Active Positions ({active_contracts.length})</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {active_contracts.map((c) => (
                                    <div key={c.contract_id} className='pos-card'>
                                        <span>#{c.contract_id} ({c.contract_type})</span>
                                        <span className={`pos-profit ${Number(c.profit) >= 0 ? 'pos-profit--win' : 'pos-profit--loss'}`}>
                                            {Number(c.profit) >= 0 ? '+' : ''}{Number(c.profit).toFixed(2)} {currency}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default DTraderPage;
