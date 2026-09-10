import { useState, useEffect, useMemo, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import {
    DerivAccountWalletService,
    DerivStatementTransaction,
    DerivPortfolioPosition,
    DerivProfitTableEntry,
    DerivTransactionStreamItem,
} from '@/services/deriv-account-wallet.service';

import { addComma, getCurrencyDisplayCode, getDecimalPlaces } from '@/components/shared';
import { isDemoAccount } from '@/utils/account-helpers';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { localize } from '@deriv-com/translations';
import {
    Activity,
    ArrowLeft,
    Briefcase,
    Calendar,
    CheckCircle2,
    Copy,
    Download,
    ExternalLink,
    FileSpreadsheet,
    FileText,
    Filter,
    BarChart2,
    LogOut,
    Radio,
    RefreshCw,
    RotateCcw,
    Search,
    Shield,
    TrendingUp,
    User,
    Wallet,
} from 'lucide-react';
import './account-page.scss';

type TActiveTab = 'statement' | 'portfolio' | 'profit_table' | 'transactions';

const AccountPage = observer(() => {
    const navigate = useNavigate();
    const { accountList, activeLoginid } = useApiBase();
    const { client } = useStore() ?? {};

    const [selectedLoginId, setSelectedLoginId] = useState<string>(
        activeLoginid || localStorage.getItem('active_loginid') || client?.loginid || ''
    );
    const [activeTab, setActiveTab] = useState<TActiveTab>('statement');

    // 1. Statement Data
    const [transactions, setTransactions] = useState<DerivStatementTransaction[]>([]);
    const [isLoadingStatement, setIsLoadingStatement] = useState<boolean>(false);
    const [actionFilter, setActionFilter] = useState<string>('all');
    const [dateRangeFilter, setDateRangeFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');

    // 2. Portfolio Data (Open Positions)
    const [portfolioPositions, setPortfolioPositions] = useState<DerivPortfolioPosition[]>([]);
    const [isLoadingPortfolio, setIsLoadingPortfolio] = useState<boolean>(false);

    // 3. Profit Table Data (Closed Contracts)
    const [profitEntries, setProfitEntries] = useState<DerivProfitTableEntry[]>([]);
    const [isLoadingProfitTable, setIsLoadingProfitTable] = useState<boolean>(false);

    // 4. Transaction Stream Data
    const [streamEvents, setStreamEvents] = useState<DerivTransactionStreamItem[]>([]);
    const [latestTransaction, setLatestTransaction] = useState<DerivTransactionStreamItem | null>(null);
    const [isStreamSubscribed, setIsStreamSubscribed] = useState<boolean>(false);

    // UI state
    const [copiedId, setCopiedId] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [resetMsg, setResetMsg] = useState<string | null>(null);

    const displayCurrency = (localStorage.getItem('converter_display_currency') as 'USD' | 'KES') || 'USD';
    const rate = parseFloat(localStorage.getItem('converter_kes_rate') || '129.5');

    // Keep selectedLoginId in sync with activeLoginid initially
    useEffect(() => {
        if (!selectedLoginId && activeLoginid) {
            setSelectedLoginId(activeLoginid);
        }
    }, [activeLoginid, selectedLoginId]);

    // Active account data
    const activeAccountData = useMemo(() => {
        const found = accountList?.find(a => a.loginid === selectedLoginId);
        const isDemo = isDemoAccount(selectedLoginId);
        const curr = found?.currency || 'USD';
        let balance = Number(found?.balance ?? 0);

        if (selectedLoginId === activeLoginid && client?.balance !== undefined && client?.balance !== null) {
            const parsedLive = parseFloat(String(client.balance));
            if (!isNaN(parsedLive)) balance = parsedLive;
        }

        return {
            loginid: selectedLoginId,
            currency: curr,
            balance,
            isDemo,
        };
    }, [selectedLoginId, accountList, activeLoginid, client?.balance]);

    // Calculate timestamps for filtering
    const { dateFrom, dateTo } = useMemo(() => {
        const now = Math.floor(Date.now() / 1000);
        if (dateRangeFilter === 'today') {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            return { dateFrom: Math.floor(startOfDay.getTime() / 1000), dateTo: now };
        }
        if (dateRangeFilter === '7d') return { dateFrom: now - 7 * 86400, dateTo: now };
        if (dateRangeFilter === '30d') return { dateFrom: now - 30 * 86400, dateTo: now };
        return { dateFrom: undefined, dateTo: undefined };
    }, [dateRangeFilter]);

    // ─── API 1: Statement (https://developers.deriv.com/docs/account/statement/) ───
    const fetchStatement = useCallback(async () => {
        const target = selectedLoginId || activeLoginid;
        if (!target) return;

        setIsLoadingStatement(true);
        try {
            const res = await DerivAccountWalletService.getStatementReport({
                loginid: target,
                limit: 100,
                date_from: dateFrom,
                date_to: dateTo,
                action_type: actionFilter !== 'all' ? actionFilter : undefined,
            });
            setTransactions(res.transactions || []);
        } catch (e) {
            console.error('[AccountPage] fetchStatement error:', e);
            setTransactions([]);
        } finally {
            setIsLoadingStatement(false);
        }
    }, [selectedLoginId, activeLoginid, dateFrom, dateTo, actionFilter]);

    // ─── API 2: Portfolio (https://developers.deriv.com/docs/account/portfolio/) ───
    const fetchPortfolio = useCallback(async () => {
        setIsLoadingPortfolio(true);
        try {
            const positions = await DerivAccountWalletService.getPortfolio();
            setPortfolioPositions(positions);
        } catch (e) {
            console.error('[AccountPage] fetchPortfolio error:', e);
            setPortfolioPositions([]);
        } finally {
            setIsLoadingPortfolio(false);
        }
    }, []);

    // ─── API 3: Profit Table (https://developers.deriv.com/docs/account/profit-table/) ───
    const fetchProfitTable = useCallback(async () => {
        setIsLoadingProfitTable(true);
        try {
            const res = await DerivAccountWalletService.getProfitTable({
                date_from: dateFrom,
                date_to: dateTo,
                limit: 100,
                sort: 'DESC',
            });
            setProfitEntries(res.transactions || []);
        } catch (e) {
            console.error('[AccountPage] fetchProfitTable error:', e);
            setProfitEntries([]);
        } finally {
            setIsLoadingProfitTable(false);
        }
    }, [dateFrom, dateTo]);

    // Fetch tab data when parameters change
    useEffect(() => {
        if (activeTab === 'statement') fetchStatement();
        else if (activeTab === 'portfolio') fetchPortfolio();
        else if (activeTab === 'profit_table') fetchProfitTable();
    }, [activeTab, fetchStatement, fetchPortfolio, fetchProfitTable]);

    // ─── API 4: Transaction Stream (https://developers.deriv.com/docs/account/transaction/) ───
    useEffect(() => {
        setIsStreamSubscribed(true);
        const unsubscribe = DerivAccountWalletService.subscribeTransactions(
            tx => {
                setLatestTransaction(tx);
                setStreamEvents(prev => [tx, ...prev.slice(0, 49)]);

                // Sync live balance
                if (typeof tx.balance === 'number' && client?.setBalance) {
                    client.setBalance(String(tx.balance));
                }

                // If active tab matches relevant transactions, refresh
                if (tx.action === 'buy' || tx.action === 'sell') {
                    fetchPortfolio();
                    fetchProfitTable();
                    fetchStatement();
                }
            },
            err => {
                console.warn('[AccountPage] Transaction stream notification:', err);
            }
        );

        return () => {
            setIsStreamSubscribed(false);
            unsubscribe();
        };
    }, [client, fetchPortfolio, fetchProfitTable, fetchStatement]);

    // Format money helper
    const formatAmount = (amount: number, curr = 'USD') => {
        const isKes = displayCurrency === 'KES' && curr === 'USD';
        const val = isKes ? amount * rate : amount;
        const code = isKes ? 'KES' : getCurrencyDisplayCode(curr);
        const prefix = val > 0 ? '+' : '';
        const dec = isKes ? 2 : getDecimalPlaces(curr);
        return `${prefix}${addComma(val.toFixed(dec))} ${code}`;
    };

    // Filter statement transactions
    const filteredTransactions = useMemo(() => {
        let list = transactions;
        if (actionFilter !== 'all') {
            list = list.filter(t => t.action_type.toLowerCase() === actionFilter.toLowerCase());
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(t =>
                String(t.transaction_id || '').toLowerCase().includes(q) ||
                String(t.contract_id || '').toLowerCase().includes(q) ||
                String(t.symbol || '').toLowerCase().includes(q) ||
                String(t.action_type || '').toLowerCase().includes(q) ||
                String(t.longcode || '').toLowerCase().includes(q)
            );
        }
        return list;
    }, [transactions, actionFilter, searchQuery]);

    // Statement metrics
    const statementMetrics = useMemo(() => {
        let totalCredits = 0;
        let totalDebits = 0;

        filteredTransactions.forEach(t => {
            const amt = Number(t.amount) || 0;
            if (amt > 0) totalCredits += amt;
            else totalDebits += Math.abs(amt);
        });

        const netCashFlow = totalCredits - totalDebits;
        const currentBalance =
            filteredTransactions.length > 0 ? Number(filteredTransactions[0].balance_after) || 0 : activeAccountData.balance;

        return {
            totalCredits,
            totalDebits,
            netCashFlow,
            currentBalance,
            count: filteredTransactions.length,
        };
    }, [filteredTransactions, activeAccountData.balance]);

    // Portfolio metrics
    const portfolioMetrics = useMemo(() => {
        let totalStake = 0;
        let totalPotentialPayout = 0;

        portfolioPositions.forEach(p => {
            totalStake += p.buy_price || 0;
            totalPotentialPayout += p.payout || 0;
        });

        return {
            count: portfolioPositions.length,
            totalStake,
            totalPotentialPayout,
        };
    }, [portfolioPositions]);

    // Profit table metrics
    const profitMetrics = useMemo(() => {
        let totalBuy = 0;
        let totalSell = 0;
        let winCount = 0;

        profitEntries.forEach(p => {
            totalBuy += p.buy_price || 0;
            totalSell += p.sell_price || 0;
            if (p.profit_loss > 0) winCount++;
        });

        const netProfit = totalSell - totalBuy;
        const count = profitEntries.length;
        const winRate = count > 0 ? (winCount / count) * 100 : 0;

        return {
            count,
            winCount,
            winRate,
            totalBuy,
            totalSell,
            netProfit,
        };
    }, [profitEntries]);

    const handleCopyId = () => {
        if (!selectedLoginId) return;
        navigator.clipboard?.writeText(selectedLoginId);
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2000);
    };



    const handleResetDemoBalance = async () => {
        setIsResetting(true);
        setResetMsg(null);
        try {
            if (api_base.api) {
                const topupRes = await api_base.api.send({ topup_virtual: 1 });
                if (topupRes?.topup_virtual) {
                    const newAmount = topupRes.topup_virtual.amount ?? 10000;
                    if (client?.setBalance) {
                        client.setBalance(String(newAmount));
                    }
                    setResetMsg(localize('Demo balance successfully reset to $10,000.00'));
                    fetchStatement();
                } else if (topupRes?.error) {
                    setResetMsg(topupRes.error.message || localize('Unable to reset demo balance'));
                }
            } else {
                setResetMsg(localize('Connection not available to reset balance'));
            }
        } catch (e: any) {
            setResetMsg(e?.message || localize('Error resetting balance'));
        } finally {
            setIsResetting(false);
            setTimeout(() => setResetMsg(null), 4000);
        }
    };

    // CSV Exports
    const handleExportCSV = () => {
        if (activeTab === 'statement') {
            if (filteredTransactions.length === 0) return;
            const headers = ['Transaction ID', 'Contract ID', 'Date & Time', 'Action', 'Market', 'Amount', 'Currency', 'Balance After'];
            const rows = filteredTransactions.map(t => [
                t.transaction_id,
                t.contract_id || '',
                new Date(t.transaction_time * 1000).toISOString(),
                t.action_type.toUpperCase(),
                t.symbol || t.shortcode || '',
                t.amount,
                t.currency || 'USD',
                t.balance_after,
            ]);
            downloadCSV(`statement_${selectedLoginId}_${Date.now()}.csv`, headers, rows);
        } else if (activeTab === 'portfolio') {
            if (portfolioPositions.length === 0) return;
            const headers = ['Contract ID', 'Symbol', 'Type', 'Buy Price', 'Payout', 'Purchase Time', 'Expiry Time'];
            const rows = portfolioPositions.map(p => [
                p.contract_id,
                p.symbol,
                p.contract_type,
                p.buy_price,
                p.payout,
                new Date(p.purchase_time * 1000).toISOString(),
                p.expiry_time ? new Date(p.expiry_time * 1000).toISOString() : '',
            ]);
            downloadCSV(`portfolio_${selectedLoginId}_${Date.now()}.csv`, headers, rows);
        } else if (activeTab === 'profit_table') {
            if (profitEntries.length === 0) return;
            const headers = ['Contract ID', 'Purchase Time', 'Sell Time', 'Buy Price', 'Sell Price', 'Profit/Loss', 'Summary'];
            const rows = profitEntries.map(p => [
                p.contract_id,
                new Date(p.purchase_time * 1000).toISOString(),
                new Date(p.sell_time * 1000).toISOString(),
                p.buy_price,
                p.sell_price,
                p.profit_loss,
                p.shortcode || p.longcode || '',
            ]);
            downloadCSV(`profit_table_${selectedLoginId}_${Date.now()}.csv`, headers, rows);
        }
    };

    const downloadCSV = (filename: string, headers: string[], rows: any[][]) => {
        const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleRefreshCurrentTab = () => {
        if (activeTab === 'statement') fetchStatement();
        else if (activeTab === 'portfolio') fetchPortfolio();
        else if (activeTab === 'profit_table') fetchProfitTable();
    };

    const isCurrentTabLoading =
        (activeTab === 'statement' && isLoadingStatement) ||
        (activeTab === 'portfolio' && isLoadingPortfolio) ||
        (activeTab === 'profit_table' && isLoadingProfitTable);

    return (
        <div className='account-page'>
            {/* Topbar */}
            <div className='account-page__topbar'>
                <button type='button' className='account-page__back-btn' onClick={() => navigate(-1)}>
                    <ArrowLeft size={18} />
                    <span>{localize('Back')}</span>
                </button>
                <h1 className='account-page__title'>{localize('Account Overview & Reports')}</h1>
                <button
                    type='button'
                    className='account-page__refresh-btn'
                    onClick={handleRefreshCurrentTab}
                    disabled={isCurrentTabLoading}
                    title={localize('Refresh data')}
                >
                    <RefreshCw size={16} className={isCurrentTabLoading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className='account-page__content'>
                {/* Real-time Stream Ticker Bar */}
                <div className='account-stream-banner'>
                    <div className='stream-indicator'>
                        <span className={`live-pulse-dot ${isStreamSubscribed ? 'is-active' : ''}`} />
                        <span className='stream-label'>{localize('Live Transaction Feed')}</span>
                    </div>
                    {latestTransaction ? (
                        <div className='stream-ticker-item'>
                            <span className={`stream-action-badge ${latestTransaction.amount >= 0 ? 'badge-credit' : 'badge-debit'}`}>
                                {latestTransaction.action.toUpperCase()}
                            </span>
                            <span className='stream-amount'>
                                {formatAmount(latestTransaction.amount, latestTransaction.currency)}
                            </span>
                            <span className='stream-sep'>•</span>
                            <span className='stream-balance'>
                                {localize('Bal')}: {addComma(latestTransaction.balance.toFixed(2))} {latestTransaction.currency}
                            </span>
                            {latestTransaction.symbol && (
                                <>
                                    <span className='stream-sep'>•</span>
                                    <span className='stream-symbol'>{latestTransaction.symbol}</span>
                                </>
                            )}
                        </div>
                    ) : (
                        <span className='stream-idle-text'>{localize('Listening for real-time transactions...')}</span>
                    )}
                </div>

                {/* 1. Account Hero Card */}
                <div className='account-card account-card--hero'>
                    <div className='hero-header'>
                        <div className='hero-avatar'>
                            <User size={26} />
                            <span className='avatar-online-dot' />
                        </div>
                        <div className='hero-meta'>
                            <div className='hero-id-row'>
                                <span className='hero-loginid'>{activeAccountData.loginid || 'Deriv Account'}</span>
                                <button type='button' className='copy-id-btn' onClick={handleCopyId} title={localize('Copy Login ID')}>
                                    {copiedId ? <CheckCircle2 size={13} className='text-success' /> : <Copy size={13} />}
                                </button>
                                <span className={`hero-type-badge ${activeAccountData.isDemo ? 'badge-demo' : 'badge-real'}`}>
                                    {activeAccountData.isDemo ? localize('Virtual Demo') : localize('Real Account')}
                                </span>
                            </div>
                            <span className='hero-subtitle'>{localize('Official Deriv Connected Client')}</span>
                        </div>
                    </div>

                    <div className='hero-balance-section'>
                        <span className='balance-label'>{localize('Available Balance')}</span>
                        <div className='balance-amount'>
                            {formatAmount(activeAccountData.balance, activeAccountData.currency)}
                        </div>
                        {displayCurrency === 'KES' && activeAccountData.currency === 'USD' && (
                            <div className='balance-converted'>
                                &asymp; KES {addComma((activeAccountData.balance * rate).toFixed(2))}
                            </div>
                        )}
                    </div>

                    <div className='hero-quick-actions'>
                        <button
                            type='button'
                            className='action-btn action-btn--primary'
                            onClick={() => window.open('https://app.deriv.com/cashier/deposit', '_blank')}
                        >
                            <span>{localize('Cashier / Deposit')}</span>
                            <ExternalLink size={14} />
                        </button>

                        <button
                            type='button'
                            className='action-btn action-btn--secondary'
                            onClick={() => window.dispatchEvent(new Event('open_wallet_management'))}
                        >
                            <Wallet size={15} />
                            <span>{localize('Wallets & Transfers')}</span>
                        </button>

                        {activeAccountData.isDemo && (
                            <button
                                type='button'
                                className='action-btn action-btn--reset'
                                onClick={handleResetDemoBalance}
                                disabled={isResetting}
                            >
                                <RotateCcw size={14} className={isResetting ? 'animate-spin' : ''} />
                                <span>{isResetting ? localize('Resetting...') : localize('Reset to $10,000')}</span>
                            </button>
                        )}
                    </div>

                    {resetMsg && <div className='hero-toast-msg'>{resetMsg}</div>}
                </div>

                {/* 2. Account Balances Strip */}
                {accountList && accountList.length > 0 && (
                    <div className='account-card'>
                        <div className='card-header'>
                            <div className='card-header-left'>
                                <BarChart2 size={18} className='card-icon' />
                                <h3>{localize('Account Balances')}</h3>
                            </div>
                            <span className='card-badge'>{accountList.length} {localize('accounts')}</span>
                        </div>

                        <div className='balances-only-list'>
                            {accountList.map(acc => {
                                const isDemo = isDemoAccount(acc.loginid);
                                const isActive = acc.loginid === activeLoginid;
                                const accCurr = acc.currency || 'USD';
                                const balanceVal = Number(acc.balance ?? 0);

                                return (
                                    <div key={acc.loginid} className={`balance-row ${isActive ? 'balance-row--active' : ''}`}>
                                        <div className='balance-row__left'>
                                            <span className={`balance-row__type-dot ${isDemo ? 'dot--demo' : 'dot--real'}`} />
                                            <span className='balance-row__loginid'>{acc.loginid}</span>
                                            <span className={`balance-row__badge ${isDemo ? 'badge-demo' : 'badge-real'}`}>
                                                {isDemo ? localize('Demo') : localize('Real')}
                                            </span>
                                            {isActive && <span className='balance-row__active-tag'>{localize('Active')}</span>}
                                        </div>
                                        <div className='balance-row__right'>
                                            <span className='balance-row__currency'>{accCurr}</span>
                                            <span className='balance-row__amount'>
                                                {formatAmount(balanceVal, accCurr)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* 3. Fully Wired Deriv APIs Card (Statement | Portfolio | Profit Table | Transactions) */}
                <div className='account-card account-card--tabs'>
                    {/* Live Stream Real-Time Banner */}
                    {latestTransaction && (
                        <div className='account-stream-banner'>
                            <div className='stream-indicator'>
                                <span className='live-pulse-dot' />
                                <span className='stream-label'>{localize('Live Transaction Event')}:</span>
                            </div>
                            <div className='stream-details'>
                                <span className={`action-pill action-pill--${latestTransaction.action.toLowerCase()}`}>
                                    {latestTransaction.action.toUpperCase()}
                                </span>
                                {latestTransaction.symbol && (
                                    <span className='stream-symbol font-bold'>{latestTransaction.symbol}</span>
                                )}
                                <span className={`stream-amount font-mono font-bold ${latestTransaction.amount >= 0 ? 'text-success' : 'text-danger'}`}>
                                    {formatAmount(latestTransaction.amount, latestTransaction.currency)}
                                </span>
                                <span className='stream-balance font-mono text-muted'>
                                    {localize('Balance')}: {addComma(latestTransaction.balance.toFixed(2))} {latestTransaction.currency}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Navigation Tabs Bar */}
                    <div className='account-nav-tabs'>
                        <button
                            type='button'
                            className={`nav-tab-btn ${activeTab === 'statement' ? 'is-active' : ''}`}
                            onClick={() => setActiveTab('statement')}
                        >
                            <FileText size={15} />
                            <span>{localize('Statement & Ledger')}</span>
                        </button>
                        <button
                            type='button'
                            className={`nav-tab-btn ${activeTab === 'portfolio' ? 'is-active' : ''}`}
                            onClick={() => setActiveTab('portfolio')}
                        >
                            <Briefcase size={15} />
                            <span>{localize('Open Positions')}</span>
                            {portfolioPositions.length > 0 && (
                                <span className='nav-tab-count'>{portfolioPositions.length}</span>
                            )}
                        </button>
                        <button
                            type='button'
                            className={`nav-tab-btn ${activeTab === 'profit_table' ? 'is-active' : ''}`}
                            onClick={() => setActiveTab('profit_table')}
                        >
                            <TrendingUp size={15} />
                            <span>{localize('Profit & Loss Table')}</span>
                        </button>
                        <button
                            type='button'
                            className={`nav-tab-btn ${activeTab === 'transactions' ? 'is-active' : ''}`}
                            onClick={() => setActiveTab('transactions')}
                        >
                            <Radio size={15} />
                            <span>{localize('Live Stream')}</span>
                            {streamEvents.length > 0 && (
                                <span className='nav-tab-count nav-tab-count--live'>{streamEvents.length}</span>
                            )}
                        </button>
                    </div>

                    {/* TAB 1: STATEMENT & LEDGER */}
                    {activeTab === 'statement' && (
                        <div className='tab-pane'>
                            {/* Header Actions */}
                            <div className='pane-header'>
                                <div>
                                    <h3>{localize('Account Financial Ledger')}</h3>
                                    <span className='pane-sub'>{localize('All credits, debits, deposits, withdrawals and buy/sell flows')}</span>
                                </div>
                                <button
                                    type='button'
                                    className='card-action-btn'
                                    onClick={handleExportCSV}
                                    disabled={filteredTransactions.length === 0}
                                    title={localize('Export statement as CSV')}
                                >
                                    <Download size={14} />
                                    <span>{localize('Export CSV')}</span>
                                </button>
                            </div>

                            {/* Metrics Strip */}
                            <div className='statement-metrics-grid'>
                                <div className='metric-tile'>
                                    <span className='metric-label'>{localize('Total Records')}</span>
                                    <span className='metric-val'>{statementMetrics.count}</span>
                                </div>
                                <div className='metric-tile'>
                                    <span className='metric-label'>{localize('Net Cash Flow')}</span>
                                    <span className={`metric-val ${statementMetrics.netCashFlow >= 0 ? 'text-success' : 'text-danger'}`}>
                                        {formatAmount(statementMetrics.netCashFlow, activeAccountData.currency)}
                                    </span>
                                </div>
                                <div className='metric-tile'>
                                    <span className='metric-label'>{localize('Total Inflow')}</span>
                                    <span className='metric-val text-success'>
                                        +{formatAmount(statementMetrics.totalCredits, activeAccountData.currency)}
                                    </span>
                                </div>
                                <div className='metric-tile'>
                                    <span className='metric-label'>{localize('Total Outflow')}</span>
                                    <span className='metric-val text-danger'>
                                        -{formatAmount(statementMetrics.totalDebits, activeAccountData.currency)}
                                    </span>
                                </div>
                            </div>

                            {/* Filter Bar */}
                            <div className='statement-filters-bar'>
                                <div className='filter-group filter-group--search'>
                                    <Search size={14} className='search-icon' />
                                    <input
                                        type='text'
                                        placeholder={localize('Search by ID, contract, action...')}
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className='search-input'
                                    />
                                    {searchQuery && (
                                        <button type='button' className='clear-search' onClick={() => setSearchQuery('')}>
                                            &times;
                                        </button>
                                    )}
                                </div>

                                <div className='filter-group'>
                                    <Filter size={13} className='filter-icon' />
                                    <select
                                        value={actionFilter}
                                        onChange={e => setActionFilter(e.target.value)}
                                        className='filter-select'
                                    >
                                        <option value='all'>{localize('All Actions')}</option>
                                        <option value='buy'>{localize('Buy Contracts')}</option>
                                        <option value='sell'>{localize('Sell / Payouts')}</option>
                                        <option value='deposit'>{localize('Deposits')}</option>
                                        <option value='withdrawal'>{localize('Withdrawals')}</option>
                                        <option value='transfer'>{localize('Transfers')}</option>
                                        <option value='adjustment'>{localize('Adjustments')}</option>
                                    </select>
                                </div>

                                <div className='filter-group'>
                                    <Calendar size={13} className='filter-icon' />
                                    <select
                                        value={dateRangeFilter}
                                        onChange={e => setDateRangeFilter(e.target.value as any)}
                                        className='filter-select'
                                    >
                                        <option value='all'>{localize('All Time')}</option>
                                        <option value='today'>{localize('Today')}</option>
                                        <option value='7d'>{localize('Last 7 Days')}</option>
                                        <option value='30d'>{localize('Last 30 Days')}</option>
                                    </select>
                                </div>
                            </div>

                            {/* Statement Table */}
                            {isLoadingStatement ? (
                                <div className='table-loading-state'>
                                    <RefreshCw size={24} className='animate-spin' />
                                    <p>{localize('Fetching statement via WebSocket API (statement: 1)...')}</p>
                                </div>
                            ) : filteredTransactions.length === 0 ? (
                                <div className='table-empty-state'>
                                    <FileSpreadsheet size={32} />
                                    <p>{localize('No transactions found for the selected criteria.')}</p>
                                </div>
                            ) : (
                                <div className='statement-table-wrapper'>
                                    <table className='statement-table'>
                                        <thead>
                                            <tr>
                                                <th>{localize('Transaction ID')}</th>
                                                <th>{localize('Date & Time')}</th>
                                                <th>{localize('Action')}</th>
                                                <th>{localize('Contract / Details')}</th>
                                                <th className='text-right'>{localize('Amount')}</th>
                                                <th className='text-right'>{localize('Balance After')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredTransactions.map(tx => {
                                                const isCredit = Number(tx.amount) >= 0;
                                                const date = new Date(tx.transaction_time * 1000);
                                                const formattedDate = date.toLocaleDateString(undefined, {
                                                    month: 'short',
                                                    day: '2-digit',
                                                    year: 'numeric',
                                                });
                                                const formattedTime = date.toLocaleTimeString(undefined, {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    second: '2-digit',
                                                });

                                                return (
                                                    <tr key={String(tx.transaction_id)}>
                                                        <td className='font-mono text-muted'>
                                                            #{String(tx.transaction_id)}
                                                        </td>
                                                        <td className='text-nowrap'>
                                                            <div className='date-cell'>
                                                                <span className='date-val'>{formattedDate}</span>
                                                                <span className='time-val'>{formattedTime}</span>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span className={`action-pill action-pill--${tx.action_type.toLowerCase()}`}>
                                                                {tx.action_type.toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td className='details-cell'>
                                                            {tx.contract_id && (
                                                                <span className='contract-tag'>ID: {tx.contract_id}</span>
                                                            )}
                                                            <span className='details-text' title={tx.longcode || tx.shortcode}>
                                                                {tx.longcode || tx.shortcode || '—'}
                                                            </span>
                                                        </td>
                                                        <td className={`text-right font-mono font-bold ${isCredit ? 'text-success' : 'text-danger'}`}>
                                                            {formatAmount(tx.amount, tx.currency || activeAccountData.currency)}
                                                        </td>
                                                        <td className='text-right font-mono text-bold'>
                                                            {addComma(Number(tx.balance_after).toFixed(2))} {tx.currency || activeAccountData.currency}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className='table-totals-row'>
                                                <td colSpan={4} className='text-right totals-label'>
                                                    {localize('Net Totals (%{count} items):', { count: filteredTransactions.length })}
                                                </td>
                                                <td className={`text-right font-mono font-bold ${statementMetrics.netCashFlow >= 0 ? 'text-success' : 'text-danger'}`}>
                                                    {formatAmount(statementMetrics.netCashFlow, activeAccountData.currency)}
                                                </td>
                                                <td className='text-right font-mono text-muted'>—</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 2: OPEN POSITIONS (PORTFOLIO) */}
                    {activeTab === 'portfolio' && (
                        <div className='tab-pane'>
                            <div className='pane-header'>
                                <div>
                                    <h3>{localize('Open Positions & Contracts')}</h3>
                                    <span className='pane-sub'>{localize('Active trade positions currently open in Deriv markets')}</span>
                                </div>
                                <div className='pane-actions'>
                                    <button
                                        type='button'
                                        className='card-action-btn'
                                        onClick={handleExportCSV}
                                        disabled={portfolioPositions.length === 0}
                                        title={localize('Export portfolio as CSV')}
                                    >
                                        <Download size={14} />
                                        <span>{localize('Export CSV')}</span>
                                    </button>
                                </div>
                            </div>

                            {/* Portfolio Metrics */}
                            <div className='statement-metrics-grid'>
                                <div className='metric-tile'>
                                    <span className='metric-label'>{localize('Active Positions')}</span>
                                    <span className='metric-val'>{portfolioMetrics.count}</span>
                                </div>
                                <div className='metric-tile'>
                                    <span className='metric-label'>{localize('Total Active Stake')}</span>
                                    <span className='metric-val text-primary'>
                                        {formatAmount(portfolioMetrics.totalStake, activeAccountData.currency)}
                                    </span>
                                </div>
                                <div className='metric-tile'>
                                    <span className='metric-label'>{localize('Potential Payout')}</span>
                                    <span className='metric-val text-success'>
                                        +{formatAmount(portfolioMetrics.totalPotentialPayout, activeAccountData.currency)}
                                    </span>
                                </div>
                                <div className='metric-tile'>
                                    <span className='metric-label'>{localize('Potential Profit')}</span>
                                    <span className='metric-val text-success'>
                                        +{formatAmount(portfolioMetrics.totalPotentialPayout - portfolioMetrics.totalStake, activeAccountData.currency)}
                                    </span>
                                </div>
                            </div>

                            {/* Portfolio Table */}
                            {isLoadingPortfolio ? (
                                <div className='table-loading-state'>
                                    <RefreshCw size={24} className='animate-spin' />
                                    <p>{localize('Fetching live open positions...')}</p>
                                </div>
                            ) : portfolioPositions.length === 0 ? (
                                <div className='table-empty-state'>
                                    <Briefcase size={32} />
                                    <p>{localize('No active open positions. Contracts bought by bots or manual trades will display here live.')}</p>
                                </div>
                            ) : (
                                <div className='statement-table-wrapper'>
                                    <table className='statement-table'>
                                        <thead>
                                            <tr>
                                                <th>{localize('Contract ID')}</th>
                                                <th>{localize('Symbol / Market')}</th>
                                                <th>{localize('Contract Type')}</th>
                                                <th className='text-right'>{localize('Stake')}</th>
                                                <th className='text-right'>{localize('Potential Payout')}</th>
                                                <th>{localize('Purchase Time')}</th>
                                                <th>{localize('Expiry Time')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {portfolioPositions.map(p => {
                                                const pDate = new Date(p.purchase_time * 1000).toLocaleTimeString();
                                                const eDate = p.expiry_time ? new Date(p.expiry_time * 1000).toLocaleTimeString() : '—';
                                                return (
                                                    <tr key={String(p.contract_id)}>
                                                        <td className='font-mono text-muted'>#{p.contract_id}</td>
                                                        <td className='font-bold'>{p.symbol}</td>
                                                        <td>
                                                            <span className='action-pill action-pill--buy'>
                                                                {p.contract_type}
                                                            </span>
                                                        </td>
                                                        <td className='text-right font-mono font-bold'>
                                                            {formatAmount(p.buy_price, p.currency || activeAccountData.currency)}
                                                        </td>
                                                        <td className='text-right font-mono font-bold text-success'>
                                                            +{formatAmount(p.payout, p.currency || activeAccountData.currency)}
                                                        </td>
                                                        <td className='text-muted'>{pDate}</td>
                                                        <td className='text-muted'>{eDate}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 3: PROFIT & LOSS TABLE (PROFIT TABLE) */}
                    {activeTab === 'profit_table' && (
                        <div className='tab-pane'>
                            <div className='pane-header'>
                                <div>
                                    <h3>{localize('Profit & Loss Summary')}</h3>
                                    <span className='pane-sub'>{localize('Closed contracts and trading performance history')}</span>
                                </div>
                                <button
                                    type='button'
                                    className='card-action-btn'
                                    onClick={handleExportCSV}
                                    disabled={profitEntries.length === 0}
                                    title={localize('Export profit table as CSV')}
                                >
                                    <Download size={14} />
                                    <span>{localize('Export CSV')}</span>
                                </button>
                            </div>

                            {/* Profit Metrics */}
                            <div className='statement-metrics-grid'>
                                <div className='metric-tile'>
                                    <span className='metric-label'>{localize('Total Trades')}</span>
                                    <span className='metric-val'>{profitMetrics.count}</span>
                                </div>
                                <div className='metric-tile'>
                                    <span className='metric-label'>{localize('Win Rate')}</span>
                                    <span className={`metric-val ${profitMetrics.winRate >= 50 ? 'text-success' : 'text-danger'}`}>
                                        {profitMetrics.winRate.toFixed(1)}% ({profitMetrics.winCount}/{profitMetrics.count})
                                    </span>
                                </div>
                                <div className='metric-tile'>
                                    <span className='metric-label'>{localize('Net P/L')}</span>
                                    <span className={`metric-val ${profitMetrics.netProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                                        {profitMetrics.netProfit >= 0 ? '+' : ''}{formatAmount(profitMetrics.netProfit, activeAccountData.currency)}
                                    </span>
                                </div>
                                <div className='metric-tile'>
                                    <span className='metric-label'>{localize('Total Turnover')}</span>
                                    <span className='metric-val'>
                                        {formatAmount(profitMetrics.totalBuy, activeAccountData.currency)}
                                    </span>
                                </div>
                            </div>

                            {/* Date Filter Bar */}
                            <div className='statement-filters-bar'>
                                <div className='filter-group'>
                                    <Calendar size={13} className='filter-icon' />
                                    <select
                                        value={dateRangeFilter}
                                        onChange={e => setDateRangeFilter(e.target.value as any)}
                                        className='filter-select'
                                    >
                                        <option value='all'>{localize('All Time')}</option>
                                        <option value='today'>{localize('Today')}</option>
                                        <option value='7d'>{localize('Last 7 Days')}</option>
                                        <option value='30d'>{localize('Last 30 Days')}</option>
                                    </select>
                                </div>
                            </div>

                            {/* Profit Table */}
                            {isLoadingProfitTable ? (
                                <div className='table-loading-state'>
                                    <RefreshCw size={24} className='animate-spin' />
                                    <p>{localize('Fetching closed contracts...')}</p>
                                </div>
                            ) : profitEntries.length === 0 ? (
                                <div className='table-empty-state'>
                                    <TrendingUp size={32} />
                                    <p>{localize('No closed contracts found for this period.')}</p>
                                </div>
                            ) : (
                                <div className='statement-table-wrapper'>
                                    <table className='statement-table'>
                                        <thead>
                                            <tr>
                                                <th>{localize('Contract ID')}</th>
                                                <th>{localize('Purchase Time')}</th>
                                                <th>{localize('Sell Time')}</th>
                                                <th className='text-right'>{localize('Buy Price')}</th>
                                                <th className='text-right'>{localize('Sell Price')}</th>
                                                <th className='text-right'>{localize('Profit / Loss')}</th>
                                                <th>{localize('Details')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {profitEntries.map(p => {
                                                const isWon = p.profit_loss > 0;
                                                const pTime = new Date(p.purchase_time * 1000).toLocaleString();
                                                const sTime = new Date(p.sell_time * 1000).toLocaleTimeString();
                                                return (
                                                    <tr key={String(p.contract_id)}>
                                                        <td className='font-mono text-muted'>#{p.contract_id}</td>
                                                        <td className='text-nowrap'>{pTime}</td>
                                                        <td className='text-nowrap'>{sTime}</td>
                                                        <td className='text-right font-mono'>
                                                            {formatAmount(p.buy_price, activeAccountData.currency)}
                                                        </td>
                                                        <td className='text-right font-mono font-bold'>
                                                            {formatAmount(p.sell_price, activeAccountData.currency)}
                                                        </td>
                                                        <td className={`text-right font-mono font-bold ${isWon ? 'text-success' : 'text-danger'}`}>
                                                            {isWon ? '+' : ''}{formatAmount(p.profit_loss, activeAccountData.currency)}
                                                        </td>
                                                        <td className='details-cell' title={p.longcode || p.shortcode}>
                                                            <span className='details-text'>{p.shortcode || p.longcode || '—'}</span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className='table-totals-row'>
                                                <td colSpan={5} className='text-right totals-label'>
                                                    {localize('Net Profit/Loss Total (%{count} trades):', { count: profitEntries.length })}
                                                </td>
                                                <td className={`text-right font-mono font-bold ${profitMetrics.netProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                                                    {profitMetrics.netProfit >= 0 ? '+' : ''}{formatAmount(profitMetrics.netProfit, activeAccountData.currency)}
                                                </td>
                                                <td className='text-muted'>—</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 4: LIVE TRANSACTION STREAM */}
                    {activeTab === 'transactions' && (
                        <div className='tab-pane'>
                            <div className='pane-header'>
                                <div>
                                    <div className='pane-title-row'>
                                        <h3>{localize('Real-Time Transaction Stream')}</h3>
                                        <span className='live-badge'>
                                            <span className='live-dot' />
                                            {localize('LIVE')}
                                        </span>
                                    </div>
                                    <span className='pane-sub'>{localize('Instant WebSocket stream notifications from Deriv gateway')}</span>
                                </div>
                            </div>

                            {streamEvents.length === 0 ? (
                                <div className='table-empty-state'>
                                    <Activity size={32} />
                                    <p>{localize('Active subscription listening for transaction updates... Run a bot or place a trade to view stream events in real time.')}</p>
                                </div>
                            ) : (
                                <div className='statement-table-wrapper'>
                                    <table className='statement-table'>
                                        <thead>
                                            <tr>
                                                <th>{localize('Time')}</th>
                                                <th>{localize('Action')}</th>
                                                <th>{localize('Contract ID')}</th>
                                                <th>{localize('Market')}</th>
                                                <th className='text-right'>{localize('Amount')}</th>
                                                <th className='text-right'>{localize('Balance After')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {streamEvents.map((st, idx) => {
                                                const isCredit = st.amount >= 0;
                                                const tDate = new Date(st.transaction_time * 1000).toLocaleTimeString();
                                                return (
                                                    <tr key={`${st.transaction_id}-${idx}`}>
                                                        <td className='text-nowrap font-mono text-muted'>{tDate}</td>
                                                        <td>
                                                            <span className={`action-pill action-pill--${st.action.toLowerCase()}`}>
                                                                {st.action.toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td className='font-mono'>
                                                            {st.contract_id ? `#${st.contract_id}` : '—'}
                                                        </td>
                                                        <td className='font-bold'>{st.symbol || st.display_name || '—'}</td>
                                                        <td className={`text-right font-mono font-bold ${isCredit ? 'text-success' : 'text-danger'}`}>
                                                            {formatAmount(st.amount, st.currency)}
                                                        </td>
                                                        <td className='text-right font-mono font-bold'>
                                                            {addComma(st.balance.toFixed(2))} {st.currency}
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
                </div>

                {/* 4. Account Session Card */}
                <div className='account-card'>
                    <div className='card-header'>
                        <div className='card-header-left'>
                            <Shield size={18} className='card-icon' />
                            <h3>{localize('Account Session')}</h3>
                        </div>
                    </div>

                    <div className='security-grid'>
                        <div className='security-row'>
                            <span className='security-label'>{localize('Active Account')}</span>
                            <span className='security-val'>{selectedLoginId || '—'}</span>
                        </div>
                        <div className='security-row'>
                            <span className='security-label'>{localize('Account Type')}</span>
                            <span className='security-val'>
                                {isDemoAccount(selectedLoginId) ? localize('Demo Virtual Account') : localize('Real Money Account')}
                            </span>
                        </div>
                        <div className='security-row'>
                            <span className='security-label'>{localize('Session Status')}</span>
                            <span className='security-val text-success'>
                                <CheckCircle2 size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                                {localize('Active & Connected')}
                            </span>
                        </div>
                    </div>

                    <div className='security-footer'>
                        <button
                            type='button'
                            className='logout-action-btn'
                            onClick={() => {
                                if (client?.logout) client.logout();
                                else {
                                    localStorage.clear();
                                    sessionStorage.clear();
                                    window.location.href = '/';
                                }
                            }}
                        >
                            <LogOut size={15} />
                            <span>{localize('Log out of Deriv')}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default AccountPage;
