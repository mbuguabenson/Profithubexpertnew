import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { localize } from '@deriv-com/translations';
import { DerivAccountWalletService, DerivWallet, DerivWalletTransaction } from '@/services/deriv-account-wallet.service';
import { formatMoney } from '@/components/shared';
import './wallets-manager.scss';

interface WalletsManagerProps {
    currency: string;
    activeLoginid: string;
}

type WalletSubTab = 'overview' | 'wallet' | 'partners' | 'trading' | 'p2p';

export const WalletsManager: React.FC<WalletsManagerProps> = ({ currency, activeLoginid }) => {
    const [wallets, setWallets] = useState<DerivWallet[]>([]);
    const [selectedWallet, setSelectedWallet] = useState<DerivWallet | null>(null);
    const [transactions, setTransactions] = useState<DerivWalletTransaction[]>([]);
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
    const [activeSubTab, setActiveSubTab] = useState<WalletSubTab>('overview');
    const [hideBalance, setHideBalance] = useState<boolean>(false);
    const [showTransactionsLedger, setShowTransactionsLedger] = useState<boolean>(false);

    // Filter and Modals
    const [filterType, setFilterType] = useState<string>('all');
    const [transferModalOpen, setTransferModalOpen] = useState<boolean>(false);
    const [transferAmount, setTransferAmount] = useState<string>('10');
    const [transferSource, setTransferSource] = useState<string>('wallet');
    const [transferTarget, setTransferTarget] = useState<string>('options');
    const [transferStatus, setTransferStatus] = useState<string | null>(null);

    const loadWalletsData = useCallback(async () => {
        setIsRefreshing(true);
        try {
            const list = await DerivAccountWalletService.getWallets(currency || 'USD');
            setWallets(list);
            const defaultWallet = list.find(w => w.is_default) || list[0] || null;
            setSelectedWallet(defaultWallet);

            if (defaultWallet) {
                const txRes = await DerivAccountWalletService.getWalletTransactions(defaultWallet.wallet_type || 'fiat', { limit: 20 });
                setTransactions(txRes.transactions || []);
            }
        } catch (err) {
            console.error('[WalletsManager] load error:', err);
        } finally {
            setIsRefreshing(false);
        }
    }, [currency]);

    useEffect(() => {
        loadWalletsData();
    }, [loadWalletsData, activeLoginid]);

    const totalEstValue = useMemo(() => {
        if (!wallets.length) return 0;
        return wallets.reduce((acc, w) => acc + (w.converted_balance || w.balance || 0), 0);
    }, [wallets]);

    const handleSimulateTransfer = () => {
        if (!transferAmount || Number(transferAmount) <= 0) return;
        setTransferStatus('Processing instant transfer...');
        setTimeout(() => {
            setTransferStatus(`Successfully transferred ${transferAmount} ${currency || 'USD'} to ${transferTarget.toUpperCase()}!`);
            setTimeout(() => {
                setTransferModalOpen(false);
                setTransferStatus(null);
                loadWalletsData();
            }, 1200);
        }, 800);
    };

    const filteredTransactions = transactions.filter(t => {
        if (filterType === 'all') return true;
        return t.action_type.toLowerCase() === filterType.toLowerCase();
    });

    const displayBalance = (amount: number, curr = currency || 'USD') => {
        if (hideBalance) return '••••••';
        return `${formatMoney(curr, amount, true)} ${curr}`;
    };

    return (
        <div className="deriv-wallets-hub">
            {/* ════════════════ 1. TOP DARK OVERVIEW HERO CARD ════════════════ */}
            <div className="dw-hero-card">
                {/* ── Subtabs Navigation Bar ── */}
                <div className="dw-hero-card__top">
                    <div className="dw-subtabs">
                        <button
                            className={`dw-subtab ${activeSubTab === 'overview' ? 'dw-subtab--active' : ''}`}
                            onClick={() => setActiveSubTab('overview')}
                        >
                            {localize('Overview')}
                        </button>
                        <button
                            className={`dw-subtab ${activeSubTab === 'wallet' ? 'dw-subtab--active' : ''}`}
                            onClick={() => setActiveSubTab('wallet')}
                        >
                            {localize('Wallet')}
                        </button>
                        <button
                            className={`dw-subtab ${activeSubTab === 'partners' ? 'dw-subtab--active' : ''}`}
                            onClick={() => setActiveSubTab('partners')}
                        >
                            {localize('Partners')}
                        </button>
                        <button
                            className={`dw-subtab ${activeSubTab === 'trading' ? 'dw-subtab--active' : ''}`}
                            onClick={() => setActiveSubTab('trading')}
                        >
                            {localize('Trading')}
                        </button>
                        <button
                            className={`dw-subtab ${activeSubTab === 'p2p' ? 'dw-subtab--active' : ''}`}
                            onClick={() => setActiveSubTab('p2p')}
                        >
                            {localize('P2P')}
                        </button>
                    </div>

                    {/* Show / Hide Balance Eye Toggle */}
                    <button
                        className="dw-eye-toggle"
                        onClick={() => setHideBalance(!hideBalance)}
                        title={hideBalance ? localize('Show balance') : localize('Hide balance')}
                    >
                        {hideBalance ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        )}
                    </button>
                </div>

                {/* ── Balance Value & Circular Action Buttons ── */}
                <div className="dw-hero-card__body">
                    {/* Left: Total Value */}
                    <div className="dw-balance-group">
                        <span className="dw-balance-group__caption">{localize('Est. total value')}</span>
                        <div className="dw-balance-group__amount-row">
                            <h2 className="dw-balance-group__value">
                                {hideBalance ? '••••••••' : `${formatMoney(currency, totalEstValue || 0, true)} ${currency}`}
                            </h2>
                            <button
                                className={`dw-refresh-icon-btn ${isRefreshing ? 'dw-refresh-icon-btn--spinning' : ''}`}
                                onClick={loadWalletsData}
                                title={localize('Refresh balance')}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                                </svg>
                            </button>
                        </div>
                        <span className="dw-balance-group__updated">{localize('Updated just now')}</span>
                    </div>

                    {/* Right: 3 Circular Action Buttons */}
                    <div className="dw-actions-group">
                        {/* 1. Deposit (Red / Coral Circle) */}
                        <div className="dw-action-item">
                            <button
                                className="dw-circle-btn dw-circle-btn--deposit"
                                onClick={() => {
                                    window.open('https://app.deriv.com/cashier/deposit', '_blank');
                                }}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                            </button>
                            <span className="dw-action-label">{localize('Deposit')}</span>
                        </div>

                        {/* 2. Transfer (Dark Circle with Swap Icon) */}
                        <div className="dw-action-item">
                            <button
                                className="dw-circle-btn dw-circle-btn--transfer"
                                onClick={() => setTransferModalOpen(true)}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                    <path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                </svg>
                            </button>
                            <span className="dw-action-label">{localize('Transfer')}</span>
                        </div>

                        {/* 3. Withdraw (Dark Circle with Minus Icon) */}
                        <div className="dw-action-item">
                            <button
                                className="dw-circle-btn dw-circle-btn--withdraw"
                                onClick={() => {
                                    window.open('https://app.deriv.com/cashier/withdrawal', '_blank');
                                }}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                            </button>
                            <span className="dw-action-label">{localize('Withdraw')}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ════════════════ 2. WALLET SECTION ════════════════ */}
            <div className="dw-section">
                <h3 className="dw-section__title">{localize('Wallet')}</h3>
                <div className="dw-section__list">
                    {wallets.length === 0 ? (
                        <div className="dw-item-row">
                            <div className="dw-item-row__left">
                                <div className="dw-currency-flag">
                                    <span>🇺🇸</span>
                                </div>
                                <span className="dw-item-row__name">{localize('US Dollar')}</span>
                            </div>
                            <div className="dw-item-row__right">
                                <span className="dw-item-row__balance">{displayBalance(0, 'USD')}</span>
                            </div>
                        </div>
                    ) : (
                        wallets.map(w => (
                            <div
                                key={w.wallet_id}
                                className={`dw-item-row ${selectedWallet?.wallet_id === w.wallet_id ? 'dw-item-row--selected' : ''}`}
                                onClick={() => setSelectedWallet(w)}
                            >
                                <div className="dw-item-row__left">
                                    <div className="dw-currency-flag">
                                        {w.currency.includes('USD') ? (
                                            <span>🇺🇸</span>
                                        ) : w.currency.includes('EUR') ? (
                                            <span>🇪🇺</span>
                                        ) : w.currency.includes('BTC') ? (
                                            <span>₿</span>
                                        ) : w.currency.includes('ETH') ? (
                                            <span>Ξ</span>
                                        ) : (
                                            <span>💵</span>
                                        )}
                                    </div>
                                    <div className="dw-item-row__info">
                                        <span className="dw-item-row__name">
                                            {w.currency === 'USD' ? localize('US Dollar') : `${w.currency} Wallet`}
                                        </span>
                                    </div>
                                </div>
                                <div className="dw-item-row__right">
                                    <span className="dw-item-row__balance">{displayBalance(w.balance || 0, w.currency)}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* ════════════════ 3. TRADING SECTION ════════════════ */}
            <div className="dw-section">
                <h3 className="dw-section__title">{localize('Trading')}</h3>
                <div className="dw-trading-grid">
                    {/* 1. Options */}
                    <div className="dw-item-row dw-item-row--card">
                        <div className="dw-item-row__left">
                            <div className="dw-trading-icon dw-trading-icon--options">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                                </svg>
                            </div>
                            <span className="dw-item-row__name">{localize('Options')}</span>
                        </div>
                        <div className="dw-item-row__right">
                            <span className="dw-item-row__balance">{displayBalance(selectedWallet?.balance || 0, currency)}</span>
                        </div>
                    </div>

                    {/* 2. TradingView */}
                    <div className="dw-item-row dw-item-row--card">
                        <div className="dw-item-row__left">
                            <div className="dw-trading-icon dw-trading-icon--tv">
                                <span className="tv-logo-text">17</span>
                            </div>
                            <span className="dw-item-row__name">{localize('TradingView')}</span>
                        </div>
                        <div className="dw-item-row__right">
                            <span className="dw-item-row__balance">{displayBalance(0, currency)}</span>
                        </div>
                    </div>

                    {/* 3. Standard MT5 */}
                    <div className="dw-item-row dw-item-row--card">
                        <div className="dw-item-row__left">
                            <div className="dw-trading-icon dw-trading-icon--mt5">
                                <span className="mt5-badge-text">MT5</span>
                            </div>
                            <span className="dw-item-row__name">{localize('Standard')}</span>
                        </div>
                        <div className="dw-item-row__right">
                            <span className="dw-item-row__balance">{displayBalance(0, currency)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ════════════════ 4. VIEW ALL TRANSACTIONS PILL BUTTON ════════════════ */}
            <div className="dw-transactions-action-box">
                <button
                    className="dw-view-transactions-btn"
                    onClick={() => setShowTransactionsLedger(!showTransactionsLedger)}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                    <span>{showTransactionsLedger ? localize('Hide transactions') : localize('View all transactions')}</span>
                </button>
            </div>

            {/* ════════════════ 5. EXPANDABLE TRANSACTIONS LEDGER ════════════════ */}
            {showTransactionsLedger && (
                <div className="dw-transactions-ledger">
                    <div className="dw-transactions-ledger__header">
                        <h4>{localize('Wallet Statement & Transactions')}</h4>
                        <div className="wm-filters">
                            {['all', 'deposit', 'withdrawal', 'transfer'].map(f => (
                                <button
                                    key={f}
                                    className={`wm-filter-pill ${filterType === f ? 'wm-filter-pill--active' : ''}`}
                                    onClick={() => setFilterType(f)}
                                >
                                    {f.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="reports-table-wrapper">
                        <table className="reports-table">
                            <thead>
                                <tr>
                                    <th>{localize('Action Type')}</th>
                                    <th>{localize('Reference ID')}</th>
                                    <th>{localize('Date & Time')}</th>
                                    <th>{localize('Amount')}</th>
                                    <th>{localize('Balance After')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTransactions.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} style={{ textAlign: 'center', padding: '3.6rem', color: '#858b97' }}>
                                            {localize('No transactions recorded for this wallet.')}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredTransactions.map(tx => (
                                        <tr key={tx.transaction_id}>
                                            <td>
                                                <span className={`reports-action-badge reports-action-badge--${tx.action_type.toLowerCase()}`}>
                                                    {tx.action_type.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="reports-badge-id">#{tx.transaction_id}</td>
                                            <td className="reports-cell-date">
                                                {tx.transaction_time ? new Date(tx.transaction_time * 1000).toLocaleString() : '—'}
                                            </td>
                                            <td className={`reports-amount-text ${Number(tx.amount) >= 0 ? 'reports-amount-text--credit' : 'reports-amount-text--debit'}`}>
                                                {Number(tx.amount) >= 0 ? `+${formatMoney(currency, tx.amount, true)}` : formatMoney(currency, tx.amount, true)} {currency}
                                            </td>
                                            <td className="reports-balance-after">
                                                {formatMoney(currency, tx.balance_after, true)} {currency}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ════════════════ 6. INTER-WALLET TRANSFER MODAL ════════════════ */}
            {transferModalOpen && (
                <div className="wm-modal-backdrop" onClick={() => setTransferModalOpen(false)}>
                    <div className="wm-modal" onClick={e => e.stopPropagation()}>
                        <div className="wm-modal__header">
                            <h3>{localize('Transfer Funds')}</h3>
                            <button onClick={() => setTransferModalOpen(false)}>×</button>
                        </div>

                        <div className="wm-modal__field">
                            <label>{localize('From')}</label>
                            <select value={transferSource} onChange={e => setTransferSource(e.target.value)}>
                                <option value="wallet">US Dollar Wallet ({formatMoney(currency, selectedWallet?.balance || 0, true)} {currency})</option>
                            </select>
                        </div>

                        <div className="wm-modal__field">
                            <label>{localize('To')}</label>
                            <select value={transferTarget} onChange={e => setTransferTarget(e.target.value)}>
                                <option value="options">Options Account</option>
                                <option value="tradingview">TradingView Account</option>
                                <option value="standard">Standard MT5 Account</option>
                            </select>
                        </div>

                        <div className="wm-modal__field">
                            <label>{localize('Amount')} ({currency})</label>
                            <input
                                type="number"
                                min="1"
                                value={transferAmount}
                                onChange={e => setTransferAmount(e.target.value)}
                            />
                        </div>

                        {transferStatus && (
                            <div className="wm-modal__status-msg">{transferStatus}</div>
                        )}

                        <button className="wm-btn wm-btn--primary" onClick={handleSimulateTransfer}>
                            {localize('Confirm Transfer')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WalletsManager;
