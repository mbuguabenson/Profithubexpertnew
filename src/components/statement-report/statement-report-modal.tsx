import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import {
    DerivAccountWalletService,
    DerivStatementTransaction,
} from '@/services/deriv-account-wallet.service';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { addComma, getCurrencyDisplayCode, getDecimalPlaces } from '@/components/shared';
import { isDemoAccount } from '@/utils/account-helpers';
import { localize } from '@deriv-com/translations';
import {
    ArrowDownLeft,
    ArrowUpRight,
    Calendar,
    ChevronDown,
    Download,
    FileSpreadsheet,
    FileText,
    Filter,
    Layers,
    Loader2,
    RefreshCw,
    Search,
    Wallet,
    X,
} from 'lucide-react';
import './statement-report-modal.scss';

export type TStatementReportModalProps = {
    isOpen: boolean;
    onClose: () => void;
    initialLoginId?: string;
};

export const StatementReportModal = observer(({ isOpen, onClose, initialLoginId }: TStatementReportModalProps) => {
    const { accountList, activeLoginid } = useApiBase();
    const { client } = useStore() ?? {};

    const [selectedLoginId, setSelectedLoginId] = useState<string>(
        initialLoginId || activeLoginid || localStorage.getItem('active_loginid') || client?.loginid || ''
    );
    const [transactions, setTransactions] = useState<DerivStatementTransaction[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [apiSource, setApiSource] = useState<'legacy_rest' | 'websocket' | 'cache'>('legacy_rest');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Filters
    const [actionFilter, setActionFilter] = useState<string>('all');
    const [dateRangeFilter, setDateRangeFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');
    const [limit, setLimit] = useState<number>(100);
    const [searchQuery, setSearchQuery] = useState<string>('');

    // Currency conversion display
    const displayCurrency = (localStorage.getItem('converter_display_currency') as 'USD' | 'KES') || 'USD';
    const rate = parseFloat(localStorage.getItem('converter_kes_rate') || '129.5');

    // Sync selectedLoginId when activeLoginid changes if not set
    useEffect(() => {
        if (!selectedLoginId && activeLoginid) {
            setSelectedLoginId(activeLoginid);
        }
    }, [activeLoginid, selectedLoginId]);

    // Calculate unix timestamps based on dateRangeFilter
    const { dateFrom, dateTo } = useMemo(() => {
        const now = Math.floor(Date.now() / 1000);
        if (dateRangeFilter === 'today') {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            return { dateFrom: Math.floor(startOfDay.getTime() / 1000), dateTo: now };
        }
        if (dateRangeFilter === '7d') {
            return { dateFrom: now - 7 * 86400, dateTo: now };
        }
        if (dateRangeFilter === '30d') {
            return { dateFrom: now - 30 * 86400, dateTo: now };
        }
        return { dateFrom: undefined, dateTo: undefined };
    }, [dateRangeFilter]);

    // Fetch Statement Data
    const fetchStatement = useCallback(async () => {
        const targetLoginId = selectedLoginId || activeLoginid || client?.loginid;
        if (!targetLoginId) return;

        setIsLoading(true);
        setErrorMessage(null);

        try {
            const response = await DerivAccountWalletService.getStatementReport({
                loginid: targetLoginId,
                limit,
                date_from: dateFrom,
                date_to: dateTo,
                action_type: actionFilter !== 'all' ? actionFilter : undefined,
            });

            setTransactions(response.transactions || []);
            setApiSource(response.source);
            if (response.error && response.transactions.length === 0) {
                setErrorMessage(response.error);
            }
        } catch (err: any) {
            console.error('[StatementReportModal] Fetch error:', err);
            setErrorMessage(err?.message || 'Failed to load statement report.');
            setTransactions([]);
        } finally {
            setIsLoading(false);
        }
    }, [selectedLoginId, activeLoginId, client?.loginid, limit, dateFrom, dateTo, actionFilter]);

    useEffect(() => {
        if (isOpen) {
            fetchStatement();
        }
    }, [isOpen, fetchStatement]);

    // Handle Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Filter transactions by search query and action
    const filteredTransactions = useMemo(() => {
        let result = transactions;

        if (actionFilter !== 'all') {
            result = result.filter(t => t.action_type.toLowerCase() === actionFilter.toLowerCase());
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter(t => {
                const transId = String(t.transaction_id || '').toLowerCase();
                const contractId = String(t.contract_id || '').toLowerCase();
                const symbol = String(t.symbol || '').toLowerCase();
                const shortcode = String(t.shortcode || '').toLowerCase();
                const action = String(t.action_type || '').toLowerCase();
                const desc = String(t.longcode || '').toLowerCase();
                return (
                    transId.includes(query) ||
                    contractId.includes(query) ||
                    symbol.includes(query) ||
                    shortcode.includes(query) ||
                    action.includes(query) ||
                    desc.includes(query)
                );
            });
        }

        return result;
    }, [transactions, actionFilter, searchQuery]);

    // Financial Metrics Calculation
    const metrics = useMemo(() => {
        let totalCredits = 0;
        let totalDebits = 0;

        filteredTransactions.forEach(t => {
            const amt = Number(t.amount) || 0;
            if (amt > 0) {
                totalCredits += amt;
            } else {
                totalDebits += Math.abs(amt);
            }
        });

        const netCashFlow = totalCredits - totalDebits;
        const currentBalance =
            filteredTransactions.length > 0 ? Number(filteredTransactions[0].balance_after) || 0 : 0;

        return {
            totalCredits,
            totalDebits,
            netCashFlow,
            currentBalance,
            count: filteredTransactions.length,
        };
    }, [filteredTransactions]);

    // Format Amount Display
    const formatAmount = (amount: number, curr = 'USD') => {
        const isKes = displayCurrency === 'KES' && curr === 'USD';
        const displayVal = isKes ? amount * rate : amount;
        const finalCurr = isKes ? 'KES' : getCurrencyDisplayCode(curr);
        const prefix = displayVal > 0 ? '+' : '';
        const decimals = isKes ? 2 : getDecimalPlaces(curr);
        return `${prefix}${addComma(displayVal.toFixed(decimals))} ${finalCurr}`;
    };

    // Format Date Display
    const formatTimestamp = (epoch: number) => {
        if (!epoch) return '—';
        const date = new Date(epoch > 1e11 ? epoch : epoch * 1000);
        return date.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
    };

    // Export to CSV
    const exportCSV = () => {
        if (!filteredTransactions.length) return;
        const headers = ['Transaction ID', 'Date & Time', 'Action', 'Amount', 'Currency', 'Balance After', 'Contract ID', 'Symbol', 'Description'];
        const rows = filteredTransactions.map(t => [
            t.transaction_id,
            formatTimestamp(t.transaction_time),
            t.action_type,
            t.amount,
            t.currency || 'USD',
            t.balance_after,
            t.contract_id || '',
            t.symbol || '',
            `"${(t.longcode || t.shortcode || '').replace(/"/g, '""')}"`,
        ]);

        const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `statement_${selectedLoginId}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Export to JSON
    const exportJSON = () => {
        if (!filteredTransactions.length) return;
        const dataStr = JSON.stringify(filteredTransactions, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `statement_${selectedLoginId}_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (!isOpen) return null;

    const isDemo = isDemoAccount(selectedLoginId);

    return (
        <div className='statement-report-modal__overlay' onClick={onClose}>
            <div className='statement-report-modal__container' onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className='statement-report-modal__header'>
                    <div className='statement-report-modal__title-group'>
                        <div className='statement-report-modal__icon-badge'>
                            <FileText size={18} />
                        </div>
                        <div>
                            <div className='statement-report-modal__title-wrapper'>
                                <h3>{localize('Account Statement Report')}</h3>
                                <span
                                    className={`statement-report-modal__source-badge ${
                                        apiSource === 'legacy_rest' ? 'source-rest' : 'source-ws'
                                    }`}
                                    title={
                                        apiSource === 'legacy_rest'
                                            ? 'Connected via Deriv Legacy Statement REST API (developers.deriv.com/docs/options-legacy/legacy-statement/)'
                                            : 'Connected via Live Deriv WebSocket Ledger API'
                                    }
                                >
                                    {apiSource === 'legacy_rest' ? '⚡ Deriv Legacy REST' : '🌐 Deriv WS Ledger'}
                                </span>
                            </div>
                            <p className='statement-report-modal__subtitle'>
                                {localize('Historical transactions, financial ledger movements, buy/sell and payouts')}
                            </p>
                        </div>
                    </div>

                    <div className='statement-report-modal__header-actions'>
                        {/* Account Selector */}
                        <div className='statement-report-modal__account-select-wrapper'>
                            <select
                                className='statement-report-modal__account-select'
                                value={selectedLoginId}
                                onChange={e => setSelectedLoginId(e.target.value)}
                            >
                                {accountList && accountList.length > 0 ? (
                                    accountList.map(acc => (
                                        <option key={acc.loginid} value={acc.loginid}>
                                            {acc.loginid} ({isDemoAccount(acc.loginid) ? 'Demo' : 'Real'} -{' '}
                                            {acc.currency || 'USD'})
                                        </option>
                                    ))
                                ) : (
                                    <option value={selectedLoginId || 'Active'}>
                                        {selectedLoginId || 'Active Account'}
                                    </option>
                                )}
                            </select>
                            <ChevronDown size={14} className='select-chevron' />
                        </div>

                        <button
                            className='statement-report-modal__refresh-btn'
                            onClick={fetchStatement}
                            disabled={isLoading}
                            title={localize('Refresh statement ledger')}
                        >
                            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
                        </button>

                        <button
                            className='statement-report-modal__close-btn'
                            onClick={onClose}
                            aria-label='Close'
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Metrics Strip */}
                <div className='statement-report-modal__metrics-strip'>
                    <div className='metric-card'>
                        <div className='metric-card__header'>
                            <span className='metric-card__label'>{localize('Net Cash Flow')}</span>
                            {metrics.netCashFlow >= 0 ? (
                                <ArrowUpRight size={15} className='text-success' />
                            ) : (
                                <ArrowDownLeft size={15} className='text-danger' />
                            )}
                        </div>
                        <div
                            className={`metric-card__value ${
                                metrics.netCashFlow >= 0 ? 'text-success' : 'text-danger'
                            }`}
                        >
                            {formatAmount(metrics.netCashFlow)}
                        </div>
                    </div>

                    <div className='metric-card'>
                        <div className='metric-card__header'>
                            <span className='metric-card__label'>{localize('Total Credits / Payouts')}</span>
                            <ArrowUpRight size={15} className='text-success' />
                        </div>
                        <div className='metric-card__value text-success'>
                            {formatAmount(metrics.totalCredits)}
                        </div>
                    </div>

                    <div className='metric-card'>
                        <div className='metric-card__header'>
                            <span className='metric-card__label'>{localize('Total Debits / Stakes')}</span>
                            <ArrowDownLeft size={15} className='text-danger' />
                        </div>
                        <div className='metric-card__value text-danger'>
                            {formatAmount(metrics.totalDebits)}
                        </div>
                    </div>

                    <div className='metric-card'>
                        <div className='metric-card__header'>
                            <span className='metric-card__label'>{localize('Transactions')}</span>
                            <Layers size={15} className='text-muted' />
                        </div>
                        <div className='metric-card__value'>{metrics.count}</div>
                    </div>
                </div>

                {/* Filters & Export Toolbar */}
                <div className='statement-report-modal__toolbar'>
                    <div className='statement-report-modal__toolbar-left'>
                        {/* Search Input */}
                        <div className='toolbar-search'>
                            <Search size={14} className='search-icon' />
                            <input
                                type='text'
                                placeholder={localize('Search by ID, contract, symbol, action...')}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button className='clear-search' onClick={() => setSearchQuery('')}>
                                    ✕
                                </button>
                            )}
                        </div>

                        {/* Action Filter */}
                        <div className='toolbar-filter'>
                            <Filter size={13} />
                            <select
                                value={actionFilter}
                                onChange={e => setActionFilter(e.target.value)}
                                aria-label='Filter action type'
                            >
                                <option value='all'>{localize('All Actions')}</option>
                                <option value='buy'>{localize('Buy')}</option>
                                <option value='sell'>{localize('Sell')}</option>
                                <option value='deposit'>{localize('Deposit')}</option>
                                <option value='withdrawal'>{localize('Withdrawal')}</option>
                                <option value='transfer'>{localize('Transfer')}</option>
                                <option value='adjustment'>{localize('Adjustment')}</option>
                            </select>
                        </div>

                        {/* Date Range Filter */}
                        <div className='toolbar-filter'>
                            <Calendar size={13} />
                            <select
                                value={dateRangeFilter}
                                onChange={e => setDateRangeFilter(e.target.value as any)}
                                aria-label='Filter date range'
                            >
                                <option value='all'>{localize('All Time')}</option>
                                <option value='today'>{localize('Today')}</option>
                                <option value='7d'>{localize('Last 7 Days')}</option>
                                <option value='30d'>{localize('Last 30 Days')}</option>
                            </select>
                        </div>

                        {/* Limit Filter */}
                        <div className='toolbar-filter'>
                            <select
                                value={limit}
                                onChange={e => setLimit(Number(e.target.value))}
                                aria-label='Limit results'
                            >
                                <option value={25}>25 rows</option>
                                <option value={50}>50 rows</option>
                                <option value={100}>100 rows</option>
                                <option value={200}>200 rows</option>
                            </select>
                        </div>
                    </div>

                    <div className='statement-report-modal__toolbar-right'>
                        <button
                            className='export-btn'
                            onClick={exportCSV}
                            disabled={!filteredTransactions.length}
                            title={localize('Export to CSV spreadsheet')}
                        >
                            <FileSpreadsheet size={14} />
                            <span>CSV</span>
                        </button>
                        <button
                            className='export-btn'
                            onClick={exportJSON}
                            disabled={!filteredTransactions.length}
                            title={localize('Export to JSON')}
                        >
                            <Download size={14} />
                            <span>JSON</span>
                        </button>
                    </div>
                </div>

                {/* Table Body */}
                <div className='statement-report-modal__body'>
                    {isLoading ? (
                        <div className='statement-report-modal__loading'>
                            <Loader2 size={32} className='animate-spin' />
                            <p>{localize('Fetching statement ledger from Deriv Gateway...')}</p>
                        </div>
                    ) : errorMessage && filteredTransactions.length === 0 ? (
                        <div className='statement-report-modal__error'>
                            <div className='error-icon'>⚠️</div>
                            <h4>{localize('Unable to load statement ledger')}</h4>
                            <p>{errorMessage}</p>
                            <button className='retry-btn' onClick={fetchStatement}>
                                <RefreshCw size={13} />
                                <span>{localize('Retry Connection')}</span>
                            </button>
                        </div>
                    ) : filteredTransactions.length === 0 ? (
                        <div className='statement-report-modal__empty'>
                            <div className='empty-icon'>📜</div>
                            <h4>{localize('No transactions found')}</h4>
                            <p>
                                {searchQuery || actionFilter !== 'all'
                                    ? localize('No transactions match the selected filters or search terms.')
                                    : localize('This account has no historical transactions recorded yet.')}
                            </p>
                        </div>
                    ) : (
                        <div className='statement-table-wrapper'>
                            <table className='statement-table'>
                                <thead>
                                    <tr>
                                        <th>{localize('Date & Time')}</th>
                                        <th>{localize('Ref / ID')}</th>
                                        <th>{localize('Action')}</th>
                                        <th>{localize('Market / Contract')}</th>
                                        <th className='text-right'>{localize('Amount')}</th>
                                        <th className='text-right'>{localize('Balance After')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTransactions.map((tx, idx) => {
                                        const isCredit = Number(tx.amount) > 0;
                                        const isDebit = Number(tx.amount) < 0;
                                        const actionType = (tx.action_type || 'transaction').toLowerCase();

                                        return (
                                            <tr key={`${tx.transaction_id}-${idx}`}>
                                                <td className='cell-time'>
                                                    {formatTimestamp(tx.transaction_time)}
                                                </td>
                                                <td className='cell-id'>
                                                    <code>#{tx.transaction_id}</code>
                                                    {tx.contract_id && (
                                                        <span className='sub-id'>
                                                            CID: {tx.contract_id}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className='cell-action'>
                                                    <span className={`action-badge action-${actionType}`}>
                                                        {tx.action_type.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className='cell-desc'>
                                                    {tx.symbol ? (
                                                        <div className='desc-symbol'>
                                                            <strong>{tx.symbol}</strong>
                                                            {tx.bet_type && <span className='bet-pill'>{tx.bet_type}</span>}
                                                        </div>
                                                    ) : (
                                                        <div className='desc-text' title={tx.longcode || tx.shortcode}>
                                                            {tx.longcode || tx.shortcode || 'Ledger Movement'}
                                                        </div>
                                                    )}
                                                </td>
                                                <td
                                                    className={`cell-amount text-right ${
                                                        isCredit ? 'text-success' : isDebit ? 'text-danger' : ''
                                                    }`}
                                                >
                                                    {formatAmount(Number(tx.amount) || 0, tx.currency)}
                                                </td>
                                                <td className='cell-balance text-right'>
                                                    {formatAmount(Number(tx.balance_after) || 0, tx.currency)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className='statement-report-modal__footer'>
                    <div className='footer-left'>
                        <span className='info-dot' />
                        <span>
                            {localize('Official Deriv Ledger')} &bull;{' '}
                            <a
                                href='https://developers.deriv.com/docs/options-legacy/legacy-statement/'
                                target='_blank'
                                rel='noopener noreferrer'
                            >
                                Legacy Statement API Spec ↗
                            </a>
                        </span>
                    </div>

                    <div className='footer-right'>
                        <button className='close-btn' onClick={onClose}>
                            {localize('Close')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default StatementReportModal;
