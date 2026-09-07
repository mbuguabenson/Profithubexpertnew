import { useState, useEffect, useMemo, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { DerivAccountWalletService, DerivStatementTransaction } from '@/services/deriv-account-wallet.service';
import { AccountSwitcherService } from '@/services/account-switcher.service';
import { addComma, getCurrencyDisplayCode, getDecimalPlaces } from '@/components/shared';
import { isDemoAccount } from '@/utils/account-helpers';
import { getAccountsList } from '@/utils/token-bridge';
import { localize } from '@deriv-com/translations';
import {
    ArrowLeft,
    ArrowUpRight,
    ArrowDownLeft,
    CheckCircle2,
    Copy,
    Download,
    ExternalLink,
    FileSpreadsheet,
    FileText,
    Filter,
    Layers,
    LogOut,
    RefreshCw,
    RotateCcw,
    Search,
    Shield,
    User,
    Wallet,
} from 'lucide-react';
import './account-page.scss';

const AccountPage = observer(() => {
    const navigate = useNavigate();
    const { accountList, activeLoginid } = useApiBase();
    const { client } = useStore() ?? {};

    const [selectedLoginId, setSelectedLoginId] = useState<string>(
        activeLoginid || localStorage.getItem('active_loginid') || client?.loginid || ''
    );
    const [transactions, setTransactions] = useState<DerivStatementTransaction[]>([]);
    const [isLoadingStatement, setIsLoadingStatement] = useState<boolean>(false);
    const [actionFilter, setActionFilter] = useState<string>('all');
    const [dateRangeFilter, setDateRangeFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
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

    // Fetch real statement from Deriv
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

    useEffect(() => {
        fetchStatement();
    }, [fetchStatement]);

    // Filter transactions
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

    // Financial totals calculation
    const metrics = useMemo(() => {
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

    const formatAmount = (amount: number, curr = 'USD') => {
        const isKes = displayCurrency === 'KES' && curr === 'USD';
        const val = isKes ? amount * rate : amount;
        const code = isKes ? 'KES' : getCurrencyDisplayCode(curr);
        const prefix = val > 0 ? '+' : '';
        const dec = isKes ? 2 : getDecimalPlaces(curr);
        return `${prefix}${addComma(val.toFixed(dec))} ${code}`;
    };

    const handleCopyId = () => {
        if (!selectedLoginId) return;
        navigator.clipboard?.writeText(selectedLoginId);
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2000);
    };

    const handleSwitchAccount = async (targetId: string) => {
        if (targetId === activeLoginid) {
            setSelectedLoginId(targetId);
            return;
        }
        setSelectedLoginId(targetId);
        const tokens = getAccountsList();
        const targetToken = tokens[targetId];
        if (targetToken) {
            await AccountSwitcherService.switchAccount(targetId, targetToken);
        }
    };

    const handleResetDemoBalance = async () => {
        setIsResetting(true);
        setResetMsg(null);
        try {
            const res = await AccountSwitcherService.resetDemoBalance();
            if (res.success) {
                setResetMsg(localize('Demo balance successfully reset to $10,000.00'));
                fetchStatement();
            } else {
                setResetMsg(res.message || localize('Unable to reset demo balance'));
            }
        } catch (e: any) {
            setResetMsg(e?.message || localize('Error resetting balance'));
        } finally {
            setIsResetting(false);
            setTimeout(() => setResetMsg(null), 4000);
        }
    };

    const handleExportCSV = () => {
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
        const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `statement_${selectedLoginId}_${Date.now()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className='account-page'>
            {/* Navigation Header */}
            <div className='account-page__topbar'>
                <button type='button' className='account-page__back-btn' onClick={() => navigate(-1)}>
                    <ArrowLeft size={18} />
                    <span>{localize('Back')}</span>
                </button>
                <h1 className='account-page__title'>{localize('Account Overview & Reports')}</h1>
                <button
                    type='button'
                    className='account-page__refresh-btn'
                    onClick={fetchStatement}
                    disabled={isLoadingStatement}
                    title={localize('Refresh data')}
                >
                    <RefreshCw size={16} className={isLoadingStatement ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className='account-page__content'>
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

                {/* 2. Linked Accounts Card */}
                {accountList && accountList.length > 1 && (
                    <div className='account-card'>
                        <div className='card-header'>
                            <div className='card-header-left'>
                                <Layers size={18} className='card-icon' />
                                <h3>{localize('Linked Accounts')}</h3>
                            </div>
                            <span className='card-badge'>{accountList.length} {localize('accounts')}</span>
                        </div>

                        <div className='linked-accounts-grid'>
                            {accountList.map(acc => {
                                const isDemo = isDemoAccount(acc.loginid);
                                const isSelected = acc.loginid === selectedLoginId;
                                const isActive = acc.loginid === activeLoginid;
                                const accCurr = acc.currency || 'USD';
                                const balanceVal = Number(acc.balance ?? 0);

                                return (
                                    <div
                                        key={acc.loginid}
                                        className={`account-tile ${isSelected ? 'account-tile--selected' : ''}`}
                                        onClick={() => handleSwitchAccount(acc.loginid)}
                                    >
                                        <div className='tile-top'>
                                            <span className='tile-loginid'>{acc.loginid}</span>
                                            <span className={`tile-badge ${isDemo ? 'badge-demo' : 'badge-real'}`}>
                                                {isDemo ? 'Demo' : 'Real'}
                                            </span>
                                        </div>
                                        <div className='tile-balance'>
                                            {formatAmount(balanceVal, accCurr)}
                                        </div>
                                        {isActive && (
                                            <div className='tile-active-indicator'>
                                                <span className='active-dot' />
                                                <span>{localize('Active Session')}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* 3. Real-Time Financial Statement & Totals Card */}
                <div className='account-card'>
                    <div className='card-header'>
                        <div className='card-header-left'>
                            <FileText size={18} className='card-icon' />
                            <div>
                                <h3>{localize('Statement & Ledger')}</h3>
                                <span className='card-header-sub'>
                                    {localize('Live Account Ledger')}
                                </span>
                            </div>
                        </div>
                        <div className='card-header-actions'>
                            <button
                                type='button'
                                className='card-action-btn'
                                onClick={handleExportCSV}
                                disabled={filteredTransactions.length === 0}
                                title={localize('Export to CSV')}
                            >
                                <Download size={14} />
                                <span>{localize('CSV')}</span>
                            </button>
                        </div>
                    </div>

                    {/* Totals Metric Strip */}
                    <div className='statement-metrics-grid'>
                        <div className='metric-tile'>
                            <span className='metric-label'>{localize('Net Cash Flow')}</span>
                            <div className={`metric-val ${metrics.netCashFlow >= 0 ? 'text-success' : 'text-danger'}`}>
                                {formatAmount(metrics.netCashFlow, activeAccountData.currency)}
                            </div>
                        </div>

                        <div className='metric-tile'>
                            <span className='metric-label'>{localize('Total Credits')}</span>
                            <div className='metric-val text-success'>
                                {formatAmount(metrics.totalCredits, activeAccountData.currency)}
                            </div>
                        </div>

                        <div className='metric-tile'>
                            <span className='metric-label'>{localize('Total Debits')}</span>
                            <div className='metric-val text-danger'>
                                {formatAmount(metrics.totalDebits, activeAccountData.currency)}
                            </div>
                        </div>

                        <div className='metric-tile'>
                            <span className='metric-label'>{localize('Records')}</span>
                            <div className='metric-val'>{metrics.count}</div>
                        </div>
                    </div>

                    {/* Filter & Search Toolbar */}
                    <div className='statement-toolbar'>
                        <div className='search-input-wrapper'>
                            <Search size={14} className='search-icon' />
                            <input
                                type='text'
                                placeholder={localize('Search by ID, contract, action...')}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button type='button' className='clear-btn' onClick={() => setSearchQuery('')}>✕</button>
                            )}
                        </div>

                        <div className='filter-controls'>
                            <div className='select-pill'>
                                <Filter size={12} />
                                <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
                                    <option value='all'>{localize('All Actions')}</option>
                                    <option value='buy'>{localize('Buy')}</option>
                                    <option value='sell'>{localize('Sell')}</option>
                                    <option value='deposit'>{localize('Deposit')}</option>
                                    <option value='withdrawal'>{localize('Withdrawal')}</option>
                                </select>
                            </div>

                            <div className='date-pills'>
                                {(['all', 'today', '7d', '30d'] as const).map(k => (
                                    <button
                                        key={k}
                                        type='button'
                                        className={`date-pill ${dateRangeFilter === k ? 'date-pill--active' : ''}`}
                                        onClick={() => setDateRangeFilter(k)}
                                    >
                                        {k === 'all' ? localize('All') : k === 'today' ? localize('Today') : k}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Statement Table */}
                    <div className='statement-table-box'>
                        {isLoadingStatement ? (
                            <div className='statement-loading'>
                                <RefreshCw size={22} className='animate-spin' />
                                <span>{localize('Loading real Deriv statement records...')}</span>
                            </div>
                        ) : filteredTransactions.length === 0 ? (
                            <div className='statement-empty'>
                                <FileSpreadsheet size={32} />
                                <h4>{localize('No transactions found')}</h4>
                                <p>{localize('No transaction records match the current account or selected filters.')}</p>
                            </div>
                        ) : (
                            <div className='table-responsive'>
                                <table className='modern-deriv-table'>
                                    <thead>
                                        <tr>
                                            <th>{localize('Date & Time')}</th>
                                            <th>{localize('Transaction ID')}</th>
                                            <th>{localize('Action')}</th>
                                            <th>{localize('Market / Symbol')}</th>
                                            <th className='text-right'>{localize('Amount')}</th>
                                            <th className='text-right'>{localize('Balance After')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredTransactions.map((tx, i) => {
                                            const isCredit = Number(tx.amount) > 0;
                                            const isDebit = Number(tx.amount) < 0;
                                            const actionType = (tx.action_type || 'transaction').toLowerCase();

                                            return (
                                                <tr key={`${tx.transaction_id}-${i}`}>
                                                    <td className='cell-time'>
                                                        {new Date(tx.transaction_time * 1000).toLocaleString()}
                                                    </td>
                                                    <td className='cell-id'>
                                                        <code>#{tx.transaction_id}</code>
                                                        {tx.contract_id && <span className='sub-id'>CID: {tx.contract_id}</span>}
                                                    </td>
                                                    <td>
                                                        <span className={`badge-action action-${actionType}`}>
                                                            {tx.action_type.toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td className='cell-market'>
                                                        <strong>{tx.symbol || tx.shortcode || 'Deriv Trade'}</strong>
                                                    </td>
                                                    <td className={`cell-amount text-right ${isCredit ? 'text-success' : isDebit ? 'text-danger' : ''}`}>
                                                        {formatAmount(Number(tx.amount) || 0, tx.currency)}
                                                    </td>
                                                    <td className='cell-balance text-right'>
                                                        {formatAmount(Number(tx.balance_after) || 0, tx.currency)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr className='table-totals-row'>
                                            <td colSpan={4}>
                                                <strong>{localize('Total Summary')}</strong> ({metrics.count} {localize('entries')})
                                            </td>
                                            <td className={`cell-amount text-right ${metrics.netCashFlow >= 0 ? 'text-success' : 'text-danger'}`}>
                                                <strong>{formatAmount(metrics.netCashFlow, activeAccountData.currency)}</strong>
                                            </td>
                                            <td className='cell-balance text-right'>
                                                <strong>{formatAmount(metrics.currentBalance, activeAccountData.currency)}</strong>
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
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
