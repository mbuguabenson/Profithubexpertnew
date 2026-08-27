import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { localize } from '@deriv-com/translations';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { useApiBase } from '@/hooks/useApiBase';
import { addComma, formatMoney } from '@/components/shared';
import { PortfolioAnalytics } from './components/portfolio-analytics';
import { WalletsManager } from './components/wallets-manager';
import { AccountManagement } from './components/account-management';
import './reports.scss';

type ActiveSubTab = 'portfolio' | 'wallets' | 'account' | 'profit_table' | 'positions' | 'statement';

interface StatementTransaction {
    action_type: string;
    amount: number;
    app_id?: number;
    balance_after: number;
    contract_id?: number;
    display_name?: string;
    longcode?: string;
    payout?: number;
    purchase_time?: number;
    shortcode?: string;
    transaction_id: number;
    transaction_time: number;
}

interface ProfitTransaction {
    app_id?: number;
    buy_price: number;
    contract_id: number;
    duration_type?: string;
    longcode: string;
    payout: number;
    purchase_time: number;
    sell_price: number;
    sell_time: number;
    shortcode?: string;
    transaction_id: number;
}

interface OpenPosition {
    contract_id: number;
    underlying?: string;
    contract_type?: string;
    buy_price: number;
    bid_price?: number;
    payout?: number;
    profit?: number;
    barrier?: string;
    entry_spot?: number;
    current_spot?: number;
    purchase_time?: number;
    date_expiry?: number;
    is_valid_to_sell?: number;
    longcode?: string;
    status?: string;
}

export const ReportsPage: React.FC = () => {
    const { isAuthorized, activeLoginid } = useApiBase();
    const [activeSubTab, setActiveSubTab] = useState<ActiveSubTab>('portfolio');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [refreshIndex, setRefreshIndex] = useState<number>(0);

    // Data states
    const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
    const [statementList, setStatementList] = useState<StatementTransaction[]>([]);
    const [profitList, setProfitList] = useState<ProfitTransaction[]>([]);

    // Search and filters
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [dateRange, setDateRange] = useState<'today' | '7d' | '30d' | 'all'>('all');
    const [sellingId, setSellingId] = useState<number | null>(null);

    const currency = useMemo(() => {
        try {
            const accounts = JSON.parse(localStorage.getItem('client.accounts') || '{}');
            const activeAcc = accounts[activeLoginid] || {};
            return activeAcc.currency || 'USD';
        } catch {
            return 'USD';
        }
    }, [activeLoginid]);

    // ── Fetch Statements & Profit Table ──
    const fetchReportsData = useCallback(async () => {
        if (!isAuthorized) return;
        setIsLoading(true);

        try {
            // 1. Fetch Profit Table
            if (api_base.api) {
                const profitRes = await api_base.api.send({
                    profit_table: 1,
                    description: 1,
                    limit: 100,
                    sort: 'DESC',
                });
                if (profitRes?.profit_table?.transactions) {
                    setProfitList(profitRes.profit_table.transactions);
                }

                // 2. Fetch Statement
                const statementRes = await api_base.api.send({
                    statement: 1,
                    description: 1,
                    limit: 100,
                });
                if (statementRes?.statement?.transactions) {
                    setStatementList(statementRes.statement.transactions);
                }

                // 3. Fetch Open Positions / Portfolio
                const portfolioRes = await api_base.api.send({
                    portfolio: 1,
                });
                if (portfolioRes?.portfolio?.contracts) {
                    const contracts: OpenPosition[] = portfolioRes.portfolio.contracts.map((c: any) => ({
                        contract_id: c.contract_id,
                        underlying: c.symbol,
                        contract_type: c.contract_type,
                        buy_price: c.buy_price,
                        payout: c.payout,
                        profit: (c.bid_price || c.buy_price) - c.buy_price,
                        bid_price: c.bid_price,
                        barrier: c.barrier,
                        purchase_time: c.purchase_time,
                        date_expiry: c.expiry_time,
                        longcode: c.longcode,
                    }));
                    setOpenPositions(contracts);
                }
            }
        } catch (err) {
            console.warn('[Reports] Data fetch notice:', err);
        } finally {
            setIsLoading(false);
        }
    }, [isAuthorized]);

    useEffect(() => {
        fetchReportsData();
    }, [fetchReportsData, refreshIndex, activeLoginid]);

    // ── Subscribe to Open Positions stream for real-time updates ──
    useEffect(() => {
        if (!isAuthorized || !api_base.api) return;

        let isSubscribed = true;
        let subId: string | null = null;

        const subscribeOpenContracts = async () => {
            try {
                const res = await api_base.api.send({
                    proposal_open_contract: 1,
                    subscribe: 1,
                });
                if (res?.subscription?.id) {
                    subId = res.subscription.id;
                }
            } catch (err) {
                console.warn('[Reports] Open contract subscription warning:', err);
            }
        };

        void subscribeOpenContracts();

        const handleContractUpdate = (e: any) => {
            if (!isSubscribed || !e?.data) return;
            try {
                const data = JSON.parse(e.data);
                if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract) {
                    const poc = data.proposal_open_contract;
                    setOpenPositions(prev => {
                        if (poc.is_sold || poc.status !== 'open') {
                            return prev.filter(c => c.contract_id !== poc.contract_id);
                        }
                        const existingIdx = prev.findIndex(c => c.contract_id === poc.contract_id);
                        const updated: OpenPosition = {
                            contract_id: poc.contract_id,
                            underlying: poc.underlying,
                            contract_type: poc.contract_type,
                            buy_price: poc.buy_price,
                            bid_price: poc.bid_price,
                            payout: poc.payout,
                            profit: poc.profit,
                            barrier: poc.barrier,
                            entry_spot: poc.entry_spot,
                            current_spot: poc.current_spot,
                            purchase_time: poc.purchase_time,
                            date_expiry: poc.date_expiry,
                            is_valid_to_sell: poc.is_valid_to_sell,
                            longcode: poc.longcode,
                            status: poc.status,
                        };
                        if (existingIdx > -1) {
                            const clone = [...prev];
                            clone[existingIdx] = updated;
                            return clone;
                        }
                        return [updated, ...prev];
                    });
                }
            } catch {}
        };

        if (api_base.api?.ws) {
            api_base.api.ws.addEventListener('message', handleContractUpdate);
        }

        return () => {
            isSubscribed = false;
            if (api_base.api?.ws) {
                api_base.api.ws.removeEventListener('message', handleContractUpdate);
            }
            if (subId && api_base.api) {
                api_base.api.send({ forget: subId }).catch(() => {});
            }
        };
    }, [isAuthorized]);

    // ── Handle Sell Contract ──
    const handleSellContract = async (contractId: number, price = 0) => {
        if (!api_base.api || sellingId) return;
        setSellingId(contractId);
        try {
            await api_base.api.send({
                sell: contractId,
                price: price,
            });
            // Refresh table
            setTimeout(() => {
                fetchReportsData();
                setSellingId(null);
            }, 800);
        } catch (err) {
            console.error('[Reports] Sell contract error:', err);
            setSellingId(null);
        }
    };

    // ── Summary Metrics Calculation ──
    const metrics = useMemo(() => {
        let totalProfit = 0;
        let wins = 0;
        let losses = 0;
        let totalPayout = 0;

        profitList.forEach(t => {
            const net = (t.sell_price || 0) - (t.buy_price || 0);
            totalProfit += net;
            if (net > 0) wins++;
            else if (net < 0) losses++;
            totalPayout += t.sell_price || 0;
        });

        const totalTrades = profitList.length;
        const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

        return {
            totalProfit,
            wins,
            losses,
            totalTrades,
            winRate,
            totalPayout,
        };
    }, [profitList]);

    // ── Date Filtering ──
    const filteredProfitList = useMemo(() => {
        const now = Math.floor(Date.now() / 1000);
        let startTimestamp = 0;

        if (dateRange === 'today') {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            startTimestamp = Math.floor(d.getTime() / 1000);
        } else if (dateRange === '7d') {
            startTimestamp = now - 7 * 86400;
        } else if (dateRange === '30d') {
            startTimestamp = now - 30 * 86400;
        }

        return profitList.filter(item => {
            const matchesDate = item.purchase_time >= startTimestamp;
            const matchesQuery = searchQuery
                ? String(item.contract_id).includes(searchQuery) ||
                  String(item.transaction_id).includes(searchQuery) ||
                  (item.longcode || '').toLowerCase().includes(searchQuery.toLowerCase())
                : true;
            return matchesDate && matchesQuery;
        });
    }, [profitList, dateRange, searchQuery]);

    const filteredStatementList = useMemo(() => {
        const now = Math.floor(Date.now() / 1000);
        let startTimestamp = 0;

        if (dateRange === 'today') {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            startTimestamp = Math.floor(d.getTime() / 1000);
        } else if (dateRange === '7d') {
            startTimestamp = now - 7 * 86400;
        } else if (dateRange === '30d') {
            startTimestamp = now - 30 * 86400;
        }

        return statementList.filter(item => {
            const matchesDate = item.transaction_time >= startTimestamp;
            const matchesQuery = searchQuery
                ? String(item.transaction_id).includes(searchQuery) ||
                  String(item.contract_id || '').includes(searchQuery) ||
                  (item.longcode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                  item.action_type.toLowerCase().includes(searchQuery.toLowerCase())
                : true;
            return matchesDate && matchesQuery;
        });
    }, [statementList, dateRange, searchQuery]);

    const formatDate = (timestamp?: number) => {
        if (!timestamp) return '—';
        return new Date(timestamp * 1000).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    };

    return (
        <div className="reports-page">
            {/* ── Top Header Banner ── */}
            <div className="reports-page__header">
                <div className="reports-page__title-box">
                    <h1 className="reports-page__title">{localize('Trading Reports & Portfolio')}</h1>
                    <p className="reports-page__subtitle">
                        {localize('Live streaming positions, transaction statement ledger, and performance analytics')}
                    </p>
                </div>
                <div className="reports-page__actions">
                    <button
                        className={`reports-page__refresh-btn ${isLoading ? 'reports-page__refresh-btn--loading' : ''}`}
                        onClick={() => setRefreshIndex(prev => prev + 1)}
                        disabled={isLoading}
                        title={localize('Refresh reports')}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                        </svg>
                        <span>{isLoading ? localize('Syncing...') : localize('Refresh')}</span>
                    </button>
                </div>
            </div>

            {/* ── Top Metrics Cards (For Table Subtabs) ── */}
            {!['portfolio', 'wallets', 'account'].includes(activeSubTab) && (
                <div className="reports-metrics-grid">
                    {/* 1. Total Net Profit */}
                    <div className={`reports-metric-card ${metrics.totalProfit >= 0 ? 'reports-metric-card--profit' : 'reports-metric-card--loss'}`}>
                        <div className="reports-metric-card__header">
                            <span className="reports-metric-card__label">{localize('Total Net Profit')}</span>
                            <div className="reports-metric-card__icon-box">
                                {metrics.totalProfit >= 0 ? '📈' : '📉'}
                            </div>
                        </div>
                        <div className="reports-metric-card__value">
                            {metrics.totalProfit >= 0 ? `+${formatMoney(currency, metrics.totalProfit, true)}` : formatMoney(currency, metrics.totalProfit, true)} {currency}
                        </div>
                        <div className="reports-metric-card__footer">
                            <span className={`reports-metric-card__tag ${metrics.totalProfit >= 0 ? 'reports-metric-card__tag--win' : 'reports-metric-card__tag--loss'}`}>
                                {metrics.totalProfit >= 0 ? 'PROFITABLE' : 'DRAWDOWN'}
                            </span>
                            <span className="reports-metric-card__subtext">Across {metrics.totalTrades} closed trades</span>
                        </div>
                    </div>

                    {/* 2. Win Rate */}
                    <div className="reports-metric-card">
                        <div className="reports-metric-card__header">
                            <span className="reports-metric-card__label">{localize('Win Rate %')}</span>
                            <div className="reports-metric-card__icon-box">🎯</div>
                        </div>
                        <div className="reports-metric-card__value">
                            {metrics.winRate.toFixed(1)}%
                        </div>
                        <div className="reports-metric-card__footer">
                            <span className="reports-metric-card__tag reports-metric-card__tag--neutral">
                                {metrics.wins}W / {metrics.losses}L
                            </span>
                            <span className="reports-metric-card__subtext">Success ratio</span>
                        </div>
                    </div>

                    {/* 3. Total Contracts */}
                    <div className="reports-metric-card">
                        <div className="reports-metric-card__header">
                            <span className="reports-metric-card__label">{localize('Total Contracts')}</span>
                            <div className="reports-metric-card__icon-box">📑</div>
                        </div>
                        <div className="reports-metric-card__value">
                            {addComma(metrics.totalTrades)}
                        </div>
                        <div className="reports-metric-card__footer">
                            <span className="reports-metric-card__tag reports-metric-card__tag--neutral">
                                {openPositions.length} LIVE OPEN
                            </span>
                            <span className="reports-metric-card__subtext">Executed orders</span>
                        </div>
                    </div>

                    {/* 4. Total Payout */}
                    <div className="reports-metric-card">
                        <div className="reports-metric-card__header">
                            <span className="reports-metric-card__label">{localize('Total Payout Volume')}</span>
                            <div className="reports-metric-card__icon-box">💎</div>
                        </div>
                        <div className="reports-metric-card__value">
                            {formatMoney(currency, metrics.totalPayout, true)} {currency}
                        </div>
                        <div className="reports-metric-card__footer">
                            <span className="reports-metric-card__tag reports-metric-card__tag--neutral">
                                RETURN VOLUME
                            </span>
                            <span className="reports-metric-card__subtext">Gross proceeds</span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Main Reports Container ── */}
            <div className="reports-content-card">
                {/* ── Sub-Tabs & Filter Toolbar ── */}
                <div className="reports-toolbar">
                    <div className="reports-subtabs">
                        <button
                            className={`reports-subtab-btn ${activeSubTab === 'portfolio' ? 'reports-subtab-btn--active' : ''}`}
                            onClick={() => setActiveSubTab('portfolio')}
                        >
                            <span>💼 {localize('Portfolio & Analytics')}</span>
                            <span className="reports-subtab-badge reports-subtab-badge--live">LIVE</span>
                        </button>
                        <button
                            className={`reports-subtab-btn ${activeSubTab === 'wallets' ? 'reports-subtab-btn--active' : ''}`}
                            onClick={() => setActiveSubTab('wallets')}
                        >
                            <span>💳 {localize('Wallets')}</span>
                            <span className="reports-subtab-badge">REST API</span>
                        </button>
                        <button
                            className={`reports-subtab-btn ${activeSubTab === 'account' ? 'reports-subtab-btn--active' : ''}`}
                            onClick={() => setActiveSubTab('account')}
                        >
                            <span>👤 {localize('Account Management')}</span>
                        </button>
                        <button
                            className={`reports-subtab-btn ${activeSubTab === 'profit_table' ? 'reports-subtab-btn--active' : ''}`}
                            onClick={() => setActiveSubTab('profit_table')}
                        >
                            <span>📊 {localize('Profit Table')}</span>
                            <span className="reports-subtab-badge">{filteredProfitList.length}</span>
                        </button>
                        <button
                            className={`reports-subtab-btn ${activeSubTab === 'positions' ? 'reports-subtab-btn--active' : ''}`}
                            onClick={() => setActiveSubTab('positions')}
                        >
                            <span>⚡ {localize('Open Positions')}</span>
                            <span className={`reports-subtab-badge ${openPositions.length > 0 ? 'reports-subtab-badge--live' : ''}`}>
                                {openPositions.length}
                            </span>
                        </button>
                        <button
                            className={`reports-subtab-btn ${activeSubTab === 'statement' ? 'reports-subtab-btn--active' : ''}`}
                            onClick={() => setActiveSubTab('statement')}
                        >
                            <span>📑 {localize('Statement')}</span>
                            <span className="reports-subtab-badge">{filteredStatementList.length}</span>
                        </button>
                    </div>

                    {!['portfolio', 'wallets', 'account'].includes(activeSubTab) && (
                        <div className="reports-filter-group">
                            {/* Search Input */}
                            <div className="reports-search-box">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder={localize('Filter by ID or details...')}
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>

                            {/* Date Filter Pills */}
                            <div className="reports-date-pills">
                                <button
                                    className={`reports-date-pill ${dateRange === 'today' ? 'reports-date-pill--active' : ''}`}
                                    onClick={() => setDateRange('today')}
                                >
                                    Today
                                </button>
                                <button
                                    className={`reports-date-pill ${dateRange === '7d' ? 'reports-date-pill--active' : ''}`}
                                    onClick={() => setDateRange('7d')}
                                >
                                    7D
                                </button>
                                <button
                                    className={`reports-date-pill ${dateRange === '30d' ? 'reports-date-pill--active' : ''}`}
                                    onClick={() => setDateRange('30d')}
                                >
                                    30D
                                </button>
                                <button
                                    className={`reports-date-pill ${dateRange === 'all' ? 'reports-date-pill--active' : ''}`}
                                    onClick={() => setDateRange('all')}
                                >
                                    All
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Tab Views ── */}
                <div className="reports-table-wrapper">
                    {/* 0. PORTFOLIO & ANALYTICS */}
                    {activeSubTab === 'portfolio' && (
                        <PortfolioAnalytics
                            profitList={profitList}
                            statementList={statementList}
                            openPositionsCount={openPositions.length}
                            currency={currency}
                            activeLoginid={activeLoginid}
                        />
                    )}

                    {/* 0.1 WALLETS */}
                    {activeSubTab === 'wallets' && (
                        <WalletsManager
                            currency={currency}
                            activeLoginid={activeLoginid}
                        />
                    )}

                    {/* 0.2 ACCOUNT MANAGEMENT */}
                    {activeSubTab === 'account' && (
                        <AccountManagement
                            currency={currency}
                            activeLoginid={activeLoginid}
                        />
                    )}
                    {/* 1. PROFIT TABLE */}
                    {activeSubTab === 'profit_table' && (
                        <div className="reports-table-container">
                            {filteredProfitList.length === 0 ? (
                                <div className="reports-empty-state">
                                    <div className="reports-empty-state__icon">📊</div>
                                    <h3>{localize('No closed contracts found')}</h3>
                                    <p>{localize('Completed trades will automatically appear in your profit table.')}</p>
                                </div>
                            ) : (
                                <table className="reports-table">
                                    <thead>
                                        <tr>
                                            <th>{localize('Contract ID')}</th>
                                            <th>{localize('Details')}</th>
                                            <th>{localize('Purchase Time')}</th>
                                            <th>{localize('Buy Price')}</th>
                                            <th>{localize('Sell Price')}</th>
                                            <th>{localize('Net Profit/Loss')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredProfitList.map(item => {
                                            const net = (item.sell_price || 0) - (item.buy_price || 0);
                                            const isWin = net >= 0;
                                            return (
                                                <tr key={item.transaction_id}>
                                                    <td>
                                                        <span className="reports-badge-id">#{item.contract_id}</span>
                                                    </td>
                                                    <td className="reports-cell-desc">
                                                        <div className="reports-desc-text" title={item.longcode}>
                                                            {item.longcode || item.shortcode || 'Deriv Contract'}
                                                        </div>
                                                    </td>
                                                    <td className="reports-cell-date">{formatDate(item.purchase_time)}</td>
                                                    <td>{formatMoney(currency, item.buy_price, true)} {currency}</td>
                                                    <td>{formatMoney(currency, item.sell_price, true)} {currency}</td>
                                                    <td>
                                                        <span className={`reports-profit-pill ${isWin ? 'reports-profit-pill--win' : 'reports-profit-pill--loss'}`}>
                                                            {isWin ? `+${formatMoney(currency, net, true)}` : formatMoney(currency, net, true)} {currency}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {/* 2. OPEN POSITIONS */}
                    {activeSubTab === 'positions' && (
                        <div className="reports-table-container">
                            {openPositions.length === 0 ? (
                                <div className="reports-empty-state">
                                    <div className="reports-empty-state__icon">⚡</div>
                                    <h3>{localize('No active open positions')}</h3>
                                    <p>{localize('When a bot or manual order is executing, live running positions stream here.')}</p>
                                </div>
                            ) : (
                                <div className="reports-positions-grid">
                                    {openPositions.map(pos => {
                                        const pnl = pos.profit || ((pos.bid_price || pos.buy_price) - pos.buy_price);
                                        const isWin = pnl >= 0;
                                        return (
                                            <div key={pos.contract_id} className={`reports-pos-card ${isWin ? 'reports-pos-card--green' : 'reports-pos-card--red'}`}>
                                                <div className="reports-pos-card__top">
                                                    <div className="reports-pos-card__badge-row">
                                                        <span className="reports-pos-card__symbol">{pos.underlying || 'Market'}</span>
                                                        <span className="reports-pos-card__type">{pos.contract_type || 'Contract'}</span>
                                                        <span className="reports-pos-card__live-indicator">LIVE</span>
                                                    </div>
                                                    <span className="reports-badge-id">#{pos.contract_id}</span>
                                                </div>

                                                <div className="reports-pos-card__desc">
                                                    {pos.longcode || 'Active running contract'}
                                                </div>

                                                <div className="reports-pos-card__metrics">
                                                    <div className="reports-pos-card__metric-item">
                                                        <span className="label">Stake</span>
                                                        <span className="value">{formatMoney(currency, pos.buy_price, true)} {currency}</span>
                                                    </div>
                                                    <div className="reports-pos-card__metric-item">
                                                        <span className="label">Current Spot</span>
                                                        <span className="value">{pos.current_spot ?? '—'}</span>
                                                    </div>
                                                    <div className="reports-pos-card__metric-item">
                                                        <span className="label">Potential Payout</span>
                                                        <span className="value">{formatMoney(currency, pos.payout || 0, true)} {currency}</span>
                                                    </div>
                                                </div>

                                                <div className="reports-pos-card__bottom">
                                                    <div className="reports-pos-card__pnl-box">
                                                        <span className="label">Live Profit/Loss</span>
                                                        <span className={`pnl-val ${isWin ? 'pnl-val--win' : 'pnl-val--loss'}`}>
                                                            {isWin ? `+${formatMoney(currency, pnl, true)}` : formatMoney(currency, pnl, true)} {currency}
                                                        </span>
                                                    </div>
                                                    {pos.is_valid_to_sell ? (
                                                        <button
                                                            className="reports-pos-card__sell-btn"
                                                            onClick={() => handleSellContract(pos.contract_id, pos.bid_price)}
                                                            disabled={sellingId === pos.contract_id}
                                                        >
                                                            {sellingId === pos.contract_id ? 'Selling...' : `Sell at ${formatMoney(currency, pos.bid_price || 0, true)}`}
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 3. STATEMENT LEDGER */}
                    {activeSubTab === 'statement' && (
                        <div className="reports-table-container">
                            {filteredStatementList.length === 0 ? (
                                <div className="reports-empty-state">
                                    <div className="reports-empty-state__icon">📜</div>
                                    <h3>{localize('No transactions found')}</h3>
                                    <p>{localize('Account deposits, withdrawals, and trade entries will appear here.')}</p>
                                </div>
                            ) : (
                                <table className="reports-table">
                                    <thead>
                                        <tr>
                                            <th>{localize('Ref ID')}</th>
                                            <th>{localize('Action')}</th>
                                            <th>{localize('Date & Time')}</th>
                                            <th>{localize('Description')}</th>
                                            <th>{localize('Amount')}</th>
                                            <th>{localize('Balance After')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredStatementList.map(item => {
                                            const isCredit = item.amount >= 0;
                                            return (
                                                <tr key={item.transaction_id}>
                                                    <td>
                                                        <span className="reports-badge-id">#{item.transaction_id}</span>
                                                    </td>
                                                    <td>
                                                        <span className={`reports-action-badge reports-action-badge--${item.action_type.toLowerCase()}`}>
                                                            {item.action_type.toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td className="reports-cell-date">{formatDate(item.transaction_time)}</td>
                                                    <td className="reports-cell-desc">
                                                        <div className="reports-desc-text" title={item.longcode}>
                                                            {item.longcode || item.shortcode || `${item.action_type} transaction`}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className={`reports-amount-text ${isCredit ? 'reports-amount-text--credit' : 'reports-amount-text--debit'}`}>
                                                            {isCredit ? `+${formatMoney(currency, item.amount, true)}` : formatMoney(currency, item.amount, true)} {currency}
                                                        </span>
                                                    </td>
                                                    <td className="reports-balance-after">
                                                        {formatMoney(currency, item.balance_after, true)} {currency}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReportsPage;
