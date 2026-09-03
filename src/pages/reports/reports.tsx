import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { localize } from '@deriv-com/translations';
import { formatMoney, addComma } from '@/components/shared';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { useApiBase } from '@/hooks/useApiBase';
import { resolveValidDerivWSToken } from '@/utils/token-bridge';
import { isDemoAccount } from '@/utils/account-helpers';
import { PortfolioAnalytics } from './components/portfolio-analytics';
import { WalletsManager } from './components/wallets-manager';
import { AccountManagement } from './components/account-management';
import './reports.scss';

type ActiveSubTab = 'positions' | 'profit_table' | 'statement' | 'portfolio' | 'wallets' | 'account';

interface OpenPosition {
    contract_id: number;
    underlying?: string;
    contract_type?: string;
    buy_price: number;
    payout: number;
    profit: number;
    bid_price?: number;
    barrier?: string;
    entry_spot?: number;
    current_spot?: number;
    purchase_time?: number;
    date_expiry?: number;
    is_valid_to_sell?: number;
    longcode?: string;
    status?: string;
}

interface StatementTransaction {
    action_type: string;
    amount: number;
    balance_after: number;
    contract_id?: number;
    longcode?: string;
    shortcode?: string;
    transaction_id: number;
    transaction_time: number;
}

interface ProfitTransaction {
    app_id?: number;
    buy_price: number;
    contract_id: number;
    duration?: string;
    duration_type?: string;
    longcode?: string;
    payout?: number;
    purchase_time: number;
    sell_price: number;
    sell_time: number;
    shortcode?: string;
    transaction_id: number;
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

    const currentLoginId = activeLoginid || localStorage.getItem('active_loginid') || '';
    const isVirtual = isDemoAccount(currentLoginId);

    const currency = useMemo(() => {
        try {
            const accounts = JSON.parse(localStorage.getItem('client.accounts') || '{}');
            const activeAcc = accounts[currentLoginId] || {};
            return activeAcc.currency || 'USD';
        } catch {
            return 'USD';
        }
    }, [currentLoginId]);

    // ── Fetch Statements & Profit Table (Real & Demo Support) ──
    const fetchReportsData = useCallback(async () => {
        setIsLoading(true);

        try {
            if (api_base.api) {
                // Ensure the WebSocket session matches the current target account
                const currentAuthId = (api_base.account_info as any)?.loginid;
                const targetLoginId = currentLoginId;

                if (targetLoginId && currentAuthId !== targetLoginId) {
                    const token = await resolveValidDerivWSToken(targetLoginId);
                    if (token && typeof api_base.api.authorize === 'function') {
                        try {
                            const authRes = await api_base.api.authorize(token);
                            if (authRes?.authorize) {
                                api_base.account_info = {
                                    balance: authRes.authorize.balance,
                                    currency: authRes.authorize.currency,
                                    loginid: authRes.authorize.loginid,
                                };
                                api_base.is_authorized = true;
                            }
                        } catch (authErr) {
                            console.warn('[Reports] Auth check note:', authErr);
                        }
                    }
                }

                // 1. Fetch Profit Table
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
    }, [currentLoginId]);

    // ── Fetch Archived Historical Statements ──
    const fetchArchivedStatements = useCallback(async () => {
        if (!api_base.api) return;
        setIsFetchingArchive(true);
        try {
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
    }, []);

    useEffect(() => {
        fetchReportsData();
    }, [fetchReportsData, refreshIndex]);

    // ── Listen for real-time account switching ──
    useEffect(() => {
        const handleAccountSwitch = (e: any) => {
            console.log('[Reports] Account switch detected:', e?.detail?.loginid);
            setProfitList([]);
            setStatementList([]);
            setOpenPositions([]);
            setTimeout(() => {
                fetchReportsData();
            }, 100);
        };
        window.addEventListener('account_switched', handleAccountSwitch);
        return () => window.removeEventListener('account_switched', handleAccountSwitch);
    }, [fetchReportsData]);

    // ── Live WebSocket Contract & Transaction Telemetry ──
    useEffect(() => {
        let isSubscribed = true;
        let subId = '';

        const subscribeToOpenPositions = async () => {
            if (!api_base.api) return;
            try {
                const res = await api_base.api.send({
                    proposal_open_contract: 1,
                    subscribe: 1,
                });
                if (res?.subscription) {
                    subId = res.subscription.id;
                }
            } catch {}
        };

        subscribeToOpenPositions();

        const handleContractUpdate = (e: any) => {
            if (!isSubscribed || !e?.data) return;
            try {
                const data = JSON.parse(e.data);
                if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract) {
                    const poc = data.proposal_open_contract;
                    if (poc.is_sold || poc.status !== 'open') {
                        setOpenPositions(prev => prev.filter(c => c.contract_id !== poc.contract_id));
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
    }, [fetchReportsData]);

    // ── Handle Sell Contract ──
    const handleSellContract = async (contractId: number, price = 0) => {
        if (!api_base.api || sellingId) return;
        setSellingId(contractId);
        try {
            await api_base.api.send({
                sell: contractId,
                price: price,
            });
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
            if (net >= 0) wins++;
            else losses++;
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

    // ── Filtered Profit Table ──
    const filteredProfitList = useMemo(() => {
        const now = Math.floor(Date.now() / 1000);
        let startTimestamp = 0;

        if (dateRange === 'today') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            startTimestamp = Math.floor(today.getTime() / 1000);
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
                  (item.longcode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                  (item.shortcode || '').toLowerCase().includes(searchQuery.toLowerCase())
                : true;
            return matchesDate && matchesQuery;
        });
    }, [profitList, dateRange, searchQuery]);

    // ── Filtered Statements ──
    const filteredStatementList = useMemo(() => {
        const now = Math.floor(Date.now() / 1000);
        let startTimestamp = 0;

        if (dateRange === 'today') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            startTimestamp = Math.floor(today.getTime() / 1000);
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
        <div className='reports-page'>
            {/* ── Top Header Banner (Deriv Official Style) ── */}
            <div className='reports-page__header'>
                <div className='reports-page__title-box'>
                    <h1 className='reports-page__title'>{localize('Reports')}</h1>
                    <div className='reports-page__account-badge'>
                        <span
                            className={`reports-page__account-dot ${isVirtual ? 'reports-page__account-dot--demo' : 'reports-page__account-dot--real'}`}
                        />
                        <span className='reports-page__account-id'>
                            {currentLoginId || (isVirtual ? 'Demo' : 'Real')}
                        </span>
                        <span className='reports-page__account-type-tag'>{isVirtual ? 'DEMO' : 'REAL'}</span>
                    </div>
                </div>

                {/* Header Action / Refresh Icon Button (Mobile & Desktop) */}
                <div className='reports-page__actions'>
                    <button
                        className={`reports-page__refresh-btn ${isLoading ? 'reports-page__refresh-btn--loading' : ''}`}
                        onClick={() => {
                            setRefreshIndex(prev => prev + 1);
                        }}
                        disabled={isLoading}
                        title={localize('Refresh reports data')}
                        aria-label='Refresh'
                    >
                        <svg
                            width='16'
                            height='16'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='2.2'
                        >
                            <path d='M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67' />
                        </svg>
                        <span className='reports-page__refresh-label'>
                            {isLoading ? localize('Refreshing...') : localize('Refresh')}
                        </span>
                    </button>
                </div>
            </div>

            {/* ── Deriv Official Segmented Sub-Tabs Bar ── */}
            <div className='reports-nav-bar'>
                <button
                    className={`reports-nav-item ${activeSubTab === 'positions' ? 'reports-nav-item--active' : ''}`}
                    onClick={() => setActiveSubTab('positions')}
                >
                    <span className='reports-nav-item__label'>{localize('Open Positions')}</span>
                    {openPositions.length > 0 && (
                        <span className='reports-nav-item__badge reports-nav-item__badge--active'>
                            {openPositions.length}
                        </span>
                    )}
                </button>

                <button
                    className={`reports-nav-item ${activeSubTab === 'profit_table' ? 'reports-nav-item--active' : ''}`}
                    onClick={() => setActiveSubTab('profit_table')}
                >
                    <span className='reports-nav-item__label'>{localize('Profit Table')}</span>
                    <span className='reports-nav-item__badge'>{filteredProfitList.length}</span>
                </button>

                <button
                    className={`reports-nav-item ${activeSubTab === 'statement' ? 'reports-nav-item--active' : ''}`}
                    onClick={() => setActiveSubTab('statement')}
                >
                    <span className='reports-nav-item__label'>{localize('Statement')}</span>
                    <span className='reports-nav-item__badge'>{filteredStatementList.length}</span>
                </button>

                <button
                    className={`reports-nav-item ${activeSubTab === 'portfolio' ? 'reports-nav-item--active' : ''}`}
                    onClick={() => setActiveSubTab('portfolio')}
                >
                    <span className='reports-nav-item__label'>{localize('Analytics')}</span>
                </button>

                <button
                    className={`reports-nav-item ${activeSubTab === 'wallets' ? 'reports-nav-item--active' : ''}`}
                    onClick={() => setActiveSubTab('wallets')}
                >
                    <span className='reports-nav-item__label'>{localize('Wallets')}</span>
                </button>

                <button
                    className={`reports-nav-item ${activeSubTab === 'account' ? 'reports-nav-item--active' : ''}`}
                    onClick={() => setActiveSubTab('account')}
                >
                    <span className='reports-nav-item__label'>{localize('Settings')}</span>
                </button>
            </div>

            {/* ── Compact Summary KPI Strip ── */}
            {!['portfolio', 'wallets', 'account'].includes(activeSubTab) && (
                <div className='reports-summary-strip'>
                    <div className='reports-summary-card'>
                        <span className='reports-summary-card__label'>{localize('Net Realized P&L')}</span>
                        <div
                            className={`reports-summary-card__value ${metrics.totalProfit >= 0 ? 'reports-summary-card__value--profit' : 'reports-summary-card__value--loss'}`}
                        >
                            {metrics.totalProfit >= 0
                                ? `+${formatMoney(currency, metrics.totalProfit, true)}`
                                : formatMoney(currency, metrics.totalProfit, true)}{' '}
                            {currency}
                        </div>
                    </div>

                    <div className='reports-summary-card'>
                        <span className='reports-summary-card__label'>{localize('Win Rate')}</span>
                        <div className='reports-summary-card__value'>
                            {metrics.winRate.toFixed(1)}%{' '}
                            <span className='reports-summary-card__sub'>
                                ({metrics.wins}W / {metrics.losses}L)
                            </span>
                        </div>
                    </div>

                    <div className='reports-summary-card'>
                        <span className='reports-summary-card__label'>{localize('Total Executed')}</span>
                        <div className='reports-summary-card__value'>
                            {addComma(metrics.totalTrades)}
                            {openPositions.length > 0 && (
                                <span className='reports-summary-card__live-tag'>{openPositions.length} LIVE</span>
                            )}
                        </div>
                    </div>

                    <div className='reports-summary-card'>
                        <span className='reports-summary-card__label'>{localize('Total Payout')}</span>
                        <div className='reports-summary-card__value'>
                            {formatMoney(currency, metrics.totalPayout, true)} {currency}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Main Tab Content ── */}
            <div className='reports-content'>
                {/* 1. PORTFOLIO & ANALYTICS */}
                {activeSubTab === 'portfolio' && (
                    <PortfolioAnalytics currency={currency} activeLoginid={currentLoginId} />
                )}

                {/* 2. WALLETS MANAGER */}
                {activeSubTab === 'wallets' && <WalletsManager currency={currency} activeLoginid={currentLoginId} />}

                {/* 3. ACCOUNT SETTINGS */}
                {activeSubTab === 'account' && <AccountManagement currency={currency} activeLoginid={currentLoginId} />}

                {/* 4. TABLES & POSITIONS */}
                {!['portfolio', 'wallets', 'account'].includes(activeSubTab) && (
                    <div className='reports-panel'>
                        {/* Filter Bar (Search & Date Range) */}
                        <div className='reports-filter-bar'>
                            <div className='reports-search-input-box'>
                                <svg
                                    width='15'
                                    height='15'
                                    viewBox='0 0 24 24'
                                    fill='none'
                                    stroke='currentColor'
                                    strokeWidth='2.2'
                                >
                                    <circle cx='11' cy='11' r='8' />
                                    <line x1='21' y1='21' x2='16.65' y2='16.65' />
                                </svg>
                                <input
                                    type='text'
                                    placeholder={localize('Search by ID or contract...')}
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                                {searchQuery && (
                                    <button className='reports-clear-search' onClick={() => setSearchQuery('')}>
                                        ✕
                                    </button>
                                )}
                            </div>

                            <div className='reports-date-filter'>
                                {(['today', '7d', '30d', 'all'] as const).map(range => (
                                    <button
                                        key={range}
                                        className={`reports-date-filter-btn ${dateRange === range ? 'reports-date-filter-btn--active' : ''}`}
                                        onClick={() => setDateRange(range)}
                                    >
                                        {range === 'today'
                                            ? localize('Today')
                                            : range === '7d'
                                              ? localize('7 Days')
                                              : range === '30d'
                                                ? localize('30 Days')
                                                : localize('All')}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* OPEN POSITIONS */}
                        {activeSubTab === 'positions' && (
                            <div className='reports-table-card'>
                                {openPositions.length === 0 ? (
                                    <div className='reports-empty-state'>
                                        <div className='reports-empty-state__icon'>⚡</div>
                                        <h3>{localize('No open positions')}</h3>
                                        <p>
                                            {localize(
                                                'Active running trades and bot orders will appear here in real-time.'
                                            )}
                                        </p>
                                    </div>
                                ) : (
                                    <div className='reports-positions-grid'>
                                        {openPositions.map(pos => {
                                            const pnl = pos.profit || (pos.bid_price || pos.buy_price) - pos.buy_price;
                                            const isWin = pnl >= 0;
                                            return (
                                                <div
                                                    key={pos.contract_id}
                                                    className={`reports-pos-item ${isWin ? 'reports-pos-item--win' : 'reports-pos-item--loss'}`}
                                                >
                                                    <div className='reports-pos-item__header'>
                                                        <div className='reports-pos-item__tags'>
                                                            <span className='reports-pos-item__symbol'>
                                                                {pos.underlying || 'Market'}
                                                            </span>
                                                            <span className='reports-pos-item__type'>
                                                                {pos.contract_type || 'Contract'}
                                                            </span>
                                                            <span className='reports-pos-item__live-dot'>LIVE</span>
                                                        </div>
                                                        <span className='reports-badge-id'>#{pos.contract_id}</span>
                                                    </div>

                                                    <div className='reports-pos-item__desc'>
                                                        {pos.longcode || 'Active running contract'}
                                                    </div>

                                                    <div className='reports-pos-item__stats'>
                                                        <div>
                                                            <span className='label'>{localize('Buy Price')}</span>
                                                            <span className='val'>
                                                                {formatMoney(currency, pos.buy_price, true)} {currency}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <span className='label'>{localize('Current Spot')}</span>
                                                            <span className='val'>
                                                                {pos.current_spot || pos.entry_spot || '—'}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <span className='label'>
                                                                {localize('Potential Payout')}
                                                            </span>
                                                            <span className='val'>
                                                                {formatMoney(currency, pos.payout, true)} {currency}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className='reports-pos-item__footer'>
                                                        <div className='reports-pos-item__pnl'>
                                                            <span className='label'>{localize('Profit/Loss')}</span>
                                                            <span className={`val ${isWin ? 'val--win' : 'val--loss'}`}>
                                                                {isWin
                                                                    ? `+${formatMoney(currency, pnl, true)}`
                                                                    : formatMoney(currency, pnl, true)}{' '}
                                                                {currency}
                                                            </span>
                                                        </div>
                                                        {pos.is_valid_to_sell ? (
                                                            <button
                                                                className='reports-pos-item__sell-btn'
                                                                onClick={() =>
                                                                    handleSellContract(pos.contract_id, pos.bid_price)
                                                                }
                                                                disabled={sellingId === pos.contract_id}
                                                            >
                                                                {sellingId === pos.contract_id
                                                                    ? localize('Selling...')
                                                                    : `${localize('Sell')} (${formatMoney(currency, pos.bid_price || 0, true)})`}
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

                        {/* PROFIT TABLE */}
                        {activeSubTab === 'profit_table' && (
                            <div className='reports-table-card'>
                                {filteredProfitList.length === 0 ? (
                                    <div className='reports-empty-state'>
                                        <div className='reports-empty-state__icon'>📊</div>
                                        <h3>{localize('No completed trades found')}</h3>
                                        <p>
                                            {localize(
                                                'Completed contracts will automatically appear in your profit table.'
                                            )}
                                        </p>
                                    </div>
                                ) : (
                                    <div className='reports-table-responsive'>
                                        <table className='reports-table'>
                                            <thead>
                                                <tr>
                                                    <th>{localize('Contract ID')}</th>
                                                    <th>{localize('Details')}</th>
                                                    <th>{localize('Purchase Time')}</th>
                                                    <th>{localize('Buy Price')}</th>
                                                    <th>{localize('Sell Price')}</th>
                                                    <th>{localize('Profit/Loss')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredProfitList.map(item => {
                                                    const net = (item.sell_price || 0) - (item.buy_price || 0);
                                                    const isWin = net >= 0;
                                                    return (
                                                        <tr key={item.transaction_id}>
                                                            <td>
                                                                <span className='reports-badge-id'>
                                                                    #{item.contract_id}
                                                                </span>
                                                            </td>
                                                            <td className='reports-cell-desc'>
                                                                <div
                                                                    className='reports-desc-text'
                                                                    title={item.longcode}
                                                                >
                                                                    {item.longcode ||
                                                                        item.shortcode ||
                                                                        'Deriv Contract'}
                                                                </div>
                                                            </td>
                                                            <td className='reports-cell-date'>
                                                                {formatDate(item.purchase_time)}
                                                            </td>
                                                            <td>
                                                                {formatMoney(currency, item.buy_price, true)} {currency}
                                                            </td>
                                                            <td>
                                                                {formatMoney(currency, item.sell_price, true)}{' '}
                                                                {currency}
                                                            </td>
                                                            <td>
                                                                <span
                                                                    className={`reports-pnl-tag ${isWin ? 'reports-pnl-tag--win' : 'reports-pnl-tag--loss'}`}
                                                                >
                                                                    {isWin
                                                                        ? `+${formatMoney(currency, net, true)}`
                                                                        : formatMoney(currency, net, true)}{' '}
                                                                    {currency}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* STATEMENT */}
                        {activeSubTab === 'statement' && (
                            <div className='reports-statement-section'>
                                {/* Archived Statements Official Notice Banner */}
                                <div className='reports-archive-banner'>
                                    <div className='reports-archive-banner__left'>
                                        <span className='reports-archive-banner__icon'>ℹ️</span>
                                        <div className='reports-archive-banner__text'>
                                            <strong>
                                                {localize(
                                                    'Statements generated before the system upgrade are archived separately.'
                                                )}
                                            </strong>
                                            <span>
                                                {localize('View pre-upgrade financial ledgers and historical logs.')}
                                            </span>
                                        </div>
                                    </div>
                                    <div className='reports-archive-banner__actions'>
                                        <button
                                            className={`reports-btn reports-btn--sm ${showArchived ? 'reports-btn--primary' : 'reports-btn--secondary'}`}
                                            onClick={() => {
                                                const next = !showArchived;
                                                setShowArchived(next);
                                                if (next && archivedList.length === 0) {
                                                    fetchArchivedStatements();
                                                }
                                            }}
                                        >
                                            {isFetchingArchive
                                                ? localize('Loading Archive...')
                                                : showArchived
                                                  ? localize('View Current Statements')
                                                  : localize('View Archived Statements')}
                                        </button>
                                        <a
                                            href='https://app.deriv.com/reports/statement'
                                            target='_blank'
                                            rel='noopener noreferrer'
                                            className='reports-btn reports-btn--sm reports-btn--outline'
                                        >
                                            {localize('Deriv Archive Portal ↗')}
                                        </a>
                                    </div>
                                </div>

                                <div className='reports-table-card'>
                                    {(showArchived ? archivedList : filteredStatementList).length === 0 ? (
                                        <div className='reports-empty-state'>
                                            <div className='reports-empty-state__icon'>📜</div>
                                            <h3>
                                                {showArchived
                                                    ? localize('No archived transactions')
                                                    : localize('No transactions found')}
                                            </h3>
                                            <p>
                                                {showArchived
                                                    ? localize(
                                                          'Historical transactions prior to system upgrades will show here.'
                                                      )
                                                    : localize(
                                                          'Account deposits, withdrawals, and trades will appear here.'
                                                      )}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className='reports-table-responsive'>
                                            <table className='reports-table'>
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
                                                                    <span className='reports-badge-id'>
                                                                        #{item.transaction_id}
                                                                    </span>
                                                                </td>
                                                                <td>
                                                                    <span
                                                                        className={`reports-action-badge reports-action-badge--${item.action_type.toLowerCase()}`}
                                                                    >
                                                                        {item.action_type.toUpperCase()}
                                                                    </span>
                                                                </td>
                                                                <td className='reports-cell-date'>
                                                                    {formatDate(item.transaction_time)}
                                                                </td>
                                                                <td className='reports-cell-desc'>
                                                                    <div
                                                                        className='reports-desc-text'
                                                                        title={item.longcode}
                                                                    >
                                                                        {item.longcode ||
                                                                            item.shortcode ||
                                                                            `${item.action_type} transaction`}
                                                                    </div>
                                                                </td>
                                                                <td>
                                                                    <span
                                                                        className={`reports-amount ${isCredit ? 'reports-amount--credit' : 'reports-amount--debit'}`}
                                                                    >
                                                                        {isCredit
                                                                            ? `+${formatMoney(currency, item.amount, true)}`
                                                                            : formatMoney(
                                                                                  currency,
                                                                                  item.amount,
                                                                                  true
                                                                              )}{' '}
                                                                        {currency}
                                                                    </span>
                                                                </td>
                                                                <td className='reports-cell-balance'>
                                                                    {formatMoney(currency, item.balance_after, true)}{' '}
                                                                    {currency}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReportsPage;
