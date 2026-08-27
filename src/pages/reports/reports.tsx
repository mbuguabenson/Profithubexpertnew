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
    const [activeSubTab, setActiveSubTab] = useState<ActiveSubTab>('positions');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [refreshIndex, setRefreshIndex] = useState<number>(0);

    // Data states
    const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
    const [statementList, setStatementList] = useState<StatementTransaction[]>([]);
    const [archivedList, setArchivedList] = useState<StatementTransaction[]>([]);
    const [profitList, setProfitList] = useState<ProfitTransaction[]>([]);
    const [showArchived, setShowArchived] = useState<boolean>(false);
    const [isFetchingArchive, setIsFetchingArchive] = useState<boolean>(false);

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

    // ── Fetch Archived Historical Statements ──
    const fetchArchivedStatements = useCallback(async () => {
        if (!isAuthorized || !api_base.api) return;
        setIsFetchingArchive(true);
        try {
            // Query older historical statement ledger batches
            const archiveRes = await api_base.api.send({
                statement: 1,
                description: 1,
                limit: 100,
                offset: 50,
            });
            if (archiveRes?.statement?.transactions) {
                setArchivedList(archiveRes.statement.transactions);
            }
        } catch (err) {
            console.warn('[Reports] Archived statement fetch notice:', err);
        } finally {
            setIsFetchingArchive(false);
        }
    }, [isAuthorized]);

    useEffect(() => {
        fetchReportsData();
    }, [fetchReportsData, refreshIndex, activeLoginid]);

    useEffect(() => {
        const handleAccountSwitch = () => {
            fetchReportsData();
        };
        window.addEventListener('account_switched', handleAccountSwitch);
        return () => window.removeEventListener('account_switched', handleAccountSwitch);
    }, [fetchReportsData]);

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
                    if (poc.is_sold || poc.status !== 'open') {
                        setOpenPositions(prev => prev.filter(c => c.contract_id !== poc.contract_id));
                        // Automatically refresh profit table & statement when trade closes
                        fetchReportsData();
                        return;
                    }

                    setOpenPositions(prev => {
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
                } else if (data.msg_type === 'transaction' && data.transaction) {
                    // Live transaction received (buy/sell/deposit/withdrawal)
                    fetchReportsData();
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
    }, [isAuthorized, fetchReportsData]);

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
                    <h1 className="reports-page__title">{localize('Reports & Activity')}</h1>
                    <div className="reports-page__account-chip">
                        <span className="reports-page__account-dot"></span>
                        <span className="reports-page__account-id">{activeLoginid || 'Active'}</span>
                    </div>
                </div>
                <div className="reports-page__actions">
                    <button
                        className={`reports-page__refresh-btn ${isLoading ? 'reports-page__refresh-btn--loading' : ''}`}
                        onClick={() => setRefreshIndex(prev => prev + 1)}
                        disabled={isLoading}
                        title={localize('Sync live reports')}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                        </svg>
                        <span>{isLoading ? localize('Syncing...') : localize('Sync')}</span>
                    </button>
                </div>
            </div>

            {/* ── Apple WWDC25 Floating Segmented Dock Sub-Tabs ── */}
            <div className="reports-dock-wrapper">
                <div className="reports-dock">
                    <button
                        className={`reports-dock__item ${activeSubTab === 'positions' ? 'reports-dock__item--active' : ''}`}
                        onClick={() => setActiveSubTab('positions')}
                    >
                        <div className="reports-dock__icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <circle cx="12" cy="12" r="10" />
                                <circle cx="12" cy="12" r="3" />
                                <path d="M12 2a10 10 0 0 1 10 10" />
                            </svg>
                        </div>
                        <span className="reports-dock__label">{localize('Positions')}</span>
                        {openPositions.length > 0 && (
                            <span className="reports-dock__badge reports-dock__badge--pulse">{openPositions.length}</span>
                        )}
                    </button>

                    <button
                        className={`reports-dock__item ${activeSubTab === 'profit_table' ? 'reports-dock__item--active' : ''}`}
                        onClick={() => setActiveSubTab('profit_table')}
                    >
                        <div className="reports-dock__icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <path d="M18 20V10M12 20V4M6 20v-6" />
                            </svg>
                        </div>
                        <span className="reports-dock__label">{localize('Profit Table')}</span>
                        <span className="reports-dock__badge">{filteredProfitList.length}</span>
                    </button>

                    <button
                        className={`reports-dock__item ${activeSubTab === 'statement' ? 'reports-dock__item--active' : ''}`}
                        onClick={() => setActiveSubTab('statement')}
                    >
                        <div className="reports-dock__icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                            </svg>
                        </div>
                        <span className="reports-dock__label">{localize('Statement')}</span>
                        <span className="reports-dock__badge">{filteredStatementList.length}</span>
                    </button>

                    <button
                        className={`reports-dock__item ${activeSubTab === 'portfolio' ? 'reports-dock__item--active' : ''}`}
                        onClick={() => setActiveSubTab('portfolio')}
                    >
                        <div className="reports-dock__icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                                <path d="M22 12A10 10 0 0 0 12 2v10z" />
                            </svg>
                        </div>
                        <span className="reports-dock__label">{localize('Analytics')}</span>
                    </button>

                    <button
                        className={`reports-dock__item ${activeSubTab === 'wallets' ? 'reports-dock__item--active' : ''}`}
                        onClick={() => setActiveSubTab('wallets')}
                    >
                        <div className="reports-dock__icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
                            </svg>
                        </div>
                        <span className="reports-dock__label">{localize('Wallets')}</span>
                    </button>

                    <button
                        className={`reports-dock__item ${activeSubTab === 'account' ? 'reports-dock__item--active' : ''}`}
                        onClick={() => setActiveSubTab('account')}
                    >
                        <div className="reports-dock__icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
                                <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                                <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                                <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
                            </svg>
                        </div>
                        <span className="reports-dock__label">{localize('Settings')}</span>
                    </button>
                </div>
            </div>

            {/* ── Modern Fintech KPI Tiles Strip ── */}
            {!['portfolio', 'wallets', 'account'].includes(activeSubTab) && (
                <div className="reports-metrics-grid">
                    {/* 1. Net P&L Card */}
                    <div className={`reports-metric-card ${metrics.totalProfit >= 0 ? 'reports-metric-card--profit' : 'reports-metric-card--loss'}`}>
                        <div className="reports-metric-card__header">
                            <div className="reports-metric-card__icon-box">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                    {metrics.totalProfit >= 0 ? (
                                        <path d="M23 6l-9.5 9.5-5-5L1 18M17 6h6v6" />
                                    ) : (
                                        <path d="M23 18l-9.5-9.5-5 5L1 6M17 18h6v-6" />
                                    )}
                                </svg>
                            </div>
                            <span className={`reports-metric-card__tag ${metrics.totalProfit >= 0 ? 'reports-metric-card__tag--win' : 'reports-metric-card__tag--loss'}`}>
                                {metrics.totalProfit >= 0 ? '+ PROFIT' : '- LOSS'}
                            </span>
                        </div>
                        <div className="reports-metric-card__body">
                            <span className="reports-metric-card__label">{localize('Net Realized P&L')}</span>
                            <div className="reports-metric-card__value">
                                {metrics.totalProfit >= 0 ? `+${formatMoney(currency, metrics.totalProfit, true)}` : formatMoney(currency, metrics.totalProfit, true)}
                                <span className="reports-metric-card__unit"> {currency}</span>
                            </div>
                        </div>
                    </div>

                    {/* 2. Win Rate Card */}
                    <div className="reports-metric-card">
                        <div className="reports-metric-card__header">
                            <div className="reports-metric-card__icon-box reports-metric-card__icon-box--blue">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="m9 12 2 2 4-4" />
                                </svg>
                            </div>
                            <span className="reports-metric-card__tag reports-metric-card__tag--neutral">
                                {metrics.wins}W / {metrics.losses}L
                            </span>
                        </div>
                        <div className="reports-metric-card__body">
                            <span className="reports-metric-card__label">{localize('Win Rate')}</span>
                            <div className="reports-metric-card__value">
                                {metrics.winRate.toFixed(1)}%
                            </div>
                        </div>
                    </div>

                    {/* 3. Executed Orders */}
                    <div className="reports-metric-card">
                        <div className="reports-metric-card__header">
                            <div className="reports-metric-card__icon-box reports-metric-card__icon-box--purple">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="16" y1="13" x2="8" y2="13" />
                                    <line x1="16" y1="17" x2="8" y2="17" />
                                    <line x1="10" y1="9" x2="8" y2="9" />
                                </svg>
                            </div>
                            {openPositions.length > 0 && (
                                <span className="reports-metric-card__tag reports-metric-card__tag--win">
                                    {openPositions.length} LIVE
                                </span>
                            )}
                        </div>
                        <div className="reports-metric-card__body">
                            <span className="reports-metric-card__label">{localize('Total Executed')}</span>
                            <div className="reports-metric-card__value">
                                {addComma(metrics.totalTrades)}
                            </div>
                        </div>
                    </div>

                    {/* 4. Total Payout Card */}
                    <div className="reports-metric-card">
                        <div className="reports-metric-card__header">
                            <div className="reports-metric-card__icon-box reports-metric-card__icon-box--amber">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                                </svg>
                            </div>
                            <span className="reports-metric-card__tag reports-metric-card__tag--neutral">
                                VOLUME
                            </span>
                        </div>
                        <div className="reports-metric-card__body">
                            <span className="reports-metric-card__label">{localize('Gross Payout')}</span>
                            <div className="reports-metric-card__value">
                                {formatMoney(currency, metrics.totalPayout, true)}
                                <span className="reports-metric-card__unit"> {currency}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Main Content Container ── */}
            <div className="reports-content-card">
                {/* ── Floating Capsule Filter Toolbar ── */}
                {!['portfolio', 'wallets', 'account'].includes(activeSubTab) && (
                    <div className="reports-filter-bar">
                        {/* Search Pill */}
                        <div className="reports-search-pill">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                type="text"
                                placeholder={localize('Search by ID, market, or type...')}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* Date Filter Segmented Capsule */}
                        <div className="reports-date-capsule">
                            <button
                                className={`reports-date-btn ${dateRange === 'today' ? 'reports-date-btn--active' : ''}`}
                                onClick={() => setDateRange('today')}
                            >
                                Today
                            </button>
                            <button
                                className={`reports-date-btn ${dateRange === '7d' ? 'reports-date-btn--active' : ''}`}
                                onClick={() => setDateRange('7d')}
                            >
                                7D
                            </button>
                            <button
                                className={`reports-date-btn ${dateRange === '30d' ? 'reports-date-btn--active' : ''}`}
                                onClick={() => setDateRange('30d')}
                            >
                                30D
                            </button>
                            <button
                                className={`reports-date-btn ${dateRange === 'all' ? 'reports-date-btn--active' : ''}`}
                                onClick={() => setDateRange('all')}
                            >
                                All
                            </button>
                        </div>
                    </div>
                )}

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
                        <div className="reports-statement-wrapper">
                            {/* ── Official Deriv Archived Statements Banner ── */}
                            <div className="reports-archive-banner">
                                <div className="reports-archive-banner__left">
                                    <div className="reports-archive-banner__icon">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                            <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" />
                                        </svg>
                                    </div>
                                    <div className="reports-archive-banner__text">
                                        <span className="reports-archive-banner__title">
                                            {localize('Statements generated before the system upgrade are archived separately.')}
                                        </span>
                                        <span className="reports-archive-banner__sub">
                                            {localize('Access pre-upgrade transaction logs, historical trades, and account ledgers.')}
                                        </span>
                                    </div>
                                </div>
                                <div className="reports-archive-banner__actions">
                                    <button
                                        className={`reports-archive-btn ${showArchived ? 'reports-archive-btn--active' : ''}`}
                                        onClick={() => {
                                            const next = !showArchived;
                                            setShowArchived(next);
                                            if (next && archivedList.length === 0) {
                                                fetchArchivedStatements();
                                            }
                                        }}
                                    >
                                        {isFetchingArchive ? localize('Loading Archive...') : showArchived ? localize('View Live Statement') : localize('View Archived Statements')}
                                    </button>
                                    <button
                                        className="reports-archive-external-btn"
                                        onClick={() => window.open('https://app.deriv.com/reports/statement', '_blank')}
                                        title={localize('Open Deriv Statement Archive Portal')}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                                        </svg>
                                        <span>{localize('Deriv Archive Portal')}</span>
                                    </button>
                                </div>
                            </div>

                            {/* ── Table Container ── */}
                            <div className="reports-table-container">
                                {((showArchived ? archivedList : filteredStatementList).length === 0) ? (
                                    <div className="reports-empty-state">
                                        <div className="reports-empty-state__icon">📜</div>
                                        <h3>{showArchived ? localize('No archived transactions found') : localize('No transactions found')}</h3>
                                        <p>{showArchived ? localize('Historical transactions prior to system upgrades will show here.') : localize('Account deposits, withdrawals, and trade entries will appear here.')}</p>
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
                                            {(showArchived ? archivedList : filteredStatementList).map(item => {
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
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReportsPage;
