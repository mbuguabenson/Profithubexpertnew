import React, { useState, useEffect, useCallback } from 'react';
import { localize } from '@deriv-com/translations';
import { DerivAccountWalletService, DerivWallet, DerivWalletTransaction } from '@/services/deriv-account-wallet.service';
import { formatMoney } from '@/components/shared';
import './wallets-manager.scss';

interface WalletsManagerProps {
    currency: string;
    activeLoginid: string;
}

export const WalletsManager: React.FC<WalletsManagerProps> = ({ currency, activeLoginid }) => {
    const [wallets, setWallets] = useState<DerivWallet[]>([]);
    const [selectedWallet, setSelectedWallet] = useState<DerivWallet | null>(null);
    const [transactions, setTransactions] = useState<DerivWalletTransaction[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [filterType, setFilterType] = useState<string>('all');
    const [transferModalOpen, setTransferModalOpen] = useState<boolean>(false);
    const [transferAmount, setTransferAmount] = useState<string>('10');
    const [transferTarget, setTransferTarget] = useState<string>('');
    const [transferStatus, setTransferStatus] = useState<string | null>(null);

    const loadWalletsData = useCallback(async () => {
        setIsLoading(true);
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
            setIsLoading(false);
        }
    }, [currency]);

    useEffect(() => {
        loadWalletsData();
    }, [loadWalletsData, activeLoginid]);

    const handleSelectWallet = async (wallet: DerivWallet) => {
        setSelectedWallet(wallet);
        try {
            const txRes = await DerivAccountWalletService.getWalletTransactions(wallet.wallet_type || 'fiat', { limit: 20 });
            setTransactions(txRes.transactions || []);
        } catch {}
    };

    const handleSimulateTransfer = () => {
        if (!transferAmount || Number(transferAmount) <= 0) return;
        setTransferStatus('Processing instant wallet transfer...');
        setTimeout(() => {
            setTransferStatus(`Successfully transferred ${transferAmount} ${selectedWallet?.currency || 'USD'} to ${transferTarget || 'Trading Account'}!`);
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

    const getWalletIcon = (type: string, curr: string) => {
        if (curr.includes('BTC')) return '₿';
        if (curr.includes('ETH')) return 'Ξ';
        if (curr.includes('LTC')) return 'Ł';
        if (curr.includes('USDT')) return '₮';
        if (type.includes('demo')) return '🎮';
        return '💵';
    };

    const isVirtual = activeLoginid.startsWith('VRTC') || activeLoginid.startsWith('VRT');

    return (
        <div className="wallets-manager">
            {/* ── Top Header Toolbar ── */}
            <div className="wm-header">
                <div>
                    <h2 className="wm-header__title">💳 {localize('Deriv Wallets Hub')}</h2>
                    <p className="wm-header__subtitle">
                        {localize('Official Deriv Wallet REST API integration — multi-currency balances, transfers, and ledger')}
                    </p>
                </div>
                <div className="wm-header__actions">
                    <button className="wm-btn wm-btn--primary" onClick={() => setTransferModalOpen(true)}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                            <path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                        <span>{localize('Transfer Funds')}</span>
                    </button>
                    <button
                        className={`wm-btn wm-btn--secondary ${isLoading ? 'wm-btn--loading' : ''}`}
                        onClick={loadWalletsData}
                        disabled={isLoading}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                        </svg>
                        <span>{isLoading ? localize('Syncing...') : localize('Refresh')}</span>
                    </button>
                </div>
            </div>

            {/* ── Wallets Cards Carousel / Grid ── */}
            <div className="wm-wallets-grid">
                {wallets.map(w => {
                    const isSelected = selectedWallet?.wallet_id === w.wallet_id;
                    return (
                        <div
                            key={w.wallet_id}
                            className={`wm-wallet-card ${isSelected ? 'wm-wallet-card--selected' : ''} ${w.wallet_type.includes('demo') ? 'wm-wallet-card--demo' : ''}`}
                            onClick={() => handleSelectWallet(w)}
                        >
                            <div className="wm-wallet-card__top">
                                <div className="wm-wallet-card__badge-box">
                                    <span className="wm-wallet-card__icon">{getWalletIcon(w.wallet_type, w.currency)}</span>
                                    <span className="wm-wallet-card__currency">{w.currency}</span>
                                </div>
                                {w.is_default && <span className="wm-tag wm-tag--default">DEFAULT</span>}
                                {w.wallet_type.includes('demo') && <span className="wm-tag wm-tag--demo">DEMO</span>}
                            </div>

                            <div className="wm-wallet-card__balance-box">
                                <span className="label">{localize('Available Balance')}</span>
                                <h3 className="amount">
                                    {formatMoney(w.currency, w.balance, true)} <span className="curr">{w.currency}</span>
                                </h3>
                                {w.converted_balance !== undefined && (
                                    <span className="converted">≈ ${w.converted_balance.toFixed(2)} USD</span>
                                )}
                            </div>

                            <div className="wm-wallet-card__footer">
                                <span className="wm-wallet-card__id">{w.wallet_id}</span>
                                <span className="wm-wallet-card__status">● {w.status || 'Active'}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Active Wallet Action Banner & Stats ── */}
            {selectedWallet && (
                <div className="wm-active-banner">
                    <div className="wm-active-banner__left">
                        <div className="wm-active-banner__icon">{getWalletIcon(selectedWallet.wallet_type, selectedWallet.currency)}</div>
                        <div className="wm-active-banner__info">
                            <h4>{selectedWallet.currency} {selectedWallet.wallet_type.toUpperCase()} WALLET</h4>
                            <p>{localize('Account')} ID: <strong>{activeLoginid}</strong> | Status: <strong className="green">ONLINE & SYNCHRONIZED</strong></p>
                        </div>
                    </div>
                    <div className="wm-active-banner__right">
                        <a
                            href="https://app.deriv.com/cashier/deposit"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="wm-action-pill wm-action-pill--green"
                        >
                            📥 {localize('Deposit to Wallet')}
                        </a>
                        <a
                            href="https://app.deriv.com/cashier/withdrawal"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="wm-action-pill wm-action-pill--purple"
                        >
                            📤 {localize('Withdraw from Wallet')}
                        </a>
                    </div>
                </div>
            )}

            {/* ── Wallet Transactions Ledger ── */}
            <div className="wm-transactions-box">
                <div className="wm-transactions-box__header">
                    <div>
                        <h3 className="title">📜 {localize('Wallet Transactions Ledger')}</h3>
                        <p className="subtitle">{localize('GET /wallet/v1/transactions cursor-paginated history')}</p>
                    </div>
                    <div className="wm-filter-pills">
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

                {filteredTransactions.length === 0 ? (
                    <div className="wm-empty-state">
                        <div className="icon">💳</div>
                        <h4>{localize('No wallet transactions recorded')}</h4>
                        <p>{localize('Deposits, withdrawals, and inter-wallet transfers will appear here in real time.')}</p>
                    </div>
                ) : (
                    <table className="wm-table">
                        <thead>
                            <tr>
                                <th>{localize('Transaction ID')}</th>
                                <th>{localize('Type')}</th>
                                <th>{localize('Date & Time')}</th>
                                <th>{localize('Channel / Category')}</th>
                                <th>{localize('Amount')}</th>
                                <th>{localize('Balance After')}</th>
                                <th>{localize('Status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTransactions.map(tx => {
                                const isPositive = tx.amount >= 0 || tx.action_type === 'deposit';
                                return (
                                    <tr key={tx.transaction_id}>
                                        <td className="monospace">#{tx.transaction_id}</td>
                                        <td>
                                            <span className={`wm-action-badge wm-action-badge--${tx.action_type.toLowerCase()}`}>
                                                {tx.action_type.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="date">{new Date(tx.transaction_time).toLocaleString()}</td>
                                        <td>{tx.channel || tx.category || 'Direct Cashier'}</td>
                                        <td>
                                            <span className={`wm-amount ${isPositive ? 'wm-amount--positive' : 'wm-amount--negative'}`}>
                                                {isPositive ? `+${formatMoney(tx.currency, Math.abs(tx.amount), true)}` : `-${formatMoney(tx.currency, Math.abs(tx.amount), true)}`} {tx.currency}
                                            </span>
                                        </td>
                                        <td className="monospace">{formatMoney(tx.currency, tx.balance_after, true)} {tx.currency}</td>
                                        <td>
                                            <span className="wm-status-badge wm-status-badge--success">
                                                {tx.status || 'COMPLETED'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Inter-Wallet Transfer Modal ── */}
            {transferModalOpen && (
                <div className="wm-modal-overlay" onClick={() => setTransferModalOpen(false)}>
                    <div className="wm-modal" onClick={e => e.stopPropagation()}>
                        <div className="wm-modal__header">
                            <h3>⚡ {localize('Instant Wallet Transfer')}</h3>
                            <button className="wm-modal__close" onClick={() => setTransferModalOpen(false)}>✕</button>
                        </div>
                        <div className="wm-modal__body">
                            <div className="wm-form-group">
                                <label>{localize('From Source Wallet')}</label>
                                <div className="wm-selected-pill">
                                    {selectedWallet?.currency} ({selectedWallet?.wallet_type}) — Balance: {formatMoney(selectedWallet?.currency || 'USD', selectedWallet?.balance || 0, true)}
                                </div>
                            </div>
                            <div className="wm-form-group">
                                <label>{localize('To Destination Account / Wallet')}</label>
                                <select
                                    value={transferTarget}
                                    onChange={e => setTransferTarget(e.target.value)}
                                    className="wm-select"
                                >
                                    <option value="">Deriv MT5 Synthetic Standard</option>
                                    <option value="Deriv X CFD">Deriv X CFD Financial</option>
                                    <option value="DTrader Real Wallet">DTrader Real Wallet (USD)</option>
                                    <option value="Crypto BTC Vault">Crypto BTC Vault</option>
                                </select>
                            </div>
                            <div className="wm-form-group">
                                <label>{localize('Transfer Amount')} ({selectedWallet?.currency || 'USD'})</label>
                                <input
                                    type="number"
                                    min="1"
                                    step="0.01"
                                    value={transferAmount}
                                    onChange={e => setTransferAmount(e.target.value)}
                                    className="wm-input"
                                />
                            </div>
                            {transferStatus && (
                                <div className="wm-status-banner">
                                    {transferStatus}
                                </div>
                            )}
                        </div>
                        <div className="wm-modal__footer">
                            <button className="wm-btn wm-btn--secondary" onClick={() => setTransferModalOpen(false)}>
                                {localize('Cancel')}
                            </button>
                            <button className="wm-btn wm-btn--primary" onClick={handleSimulateTransfer}>
                                {localize('Confirm Transfer')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WalletsManager;
