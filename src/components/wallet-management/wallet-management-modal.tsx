import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import {
    DerivAccountWalletService,
    DerivWallet,
    DerivWalletTransaction,
} from '@/services/deriv-account-wallet.service';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { addComma, getCurrencyDisplayCode, getDecimalPlaces } from '@/components/shared';
import { isDemoAccount } from '@/utils/account-helpers';
import { localize } from '@deriv-com/translations';
import {
    ArrowLeftRight,
    ArrowRight,
    CheckCircle2,
    Coins,
    CreditCard,
    DollarSign,
    ExternalLink,
    History,
    Info,
    Loader2,
    RefreshCw,
    ShieldAlert,
    Wallet as WalletIcon,
    X,
} from 'lucide-react';
import './wallet-management-modal.scss';

export type TWalletManagementModalProps = {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: 'wallets' | 'transfer' | 'history';
};

export const WalletManagementModal = observer(({ isOpen, onClose, initialTab = 'wallets' }: TWalletManagementModalProps) => {
    const { accountList, activeLoginid } = useApiBase();
    const { client } = useStore() ?? {};

    const [activeTab, setActiveTab] = useState<'wallets' | 'transfer' | 'history'>(initialTab);
    const [wallets, setWallets] = useState<DerivWallet[]>([]);
    const [isLoadingWallets, setIsLoadingWallets] = useState<boolean>(false);

    // Selected Wallet for transaction history
    const [selectedWalletType, setSelectedWalletType] = useState<string>('fiat');
    const [walletTransactions, setWalletTransactions] = useState<DerivWalletTransaction[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

    // Transfer State
    const [fromAccount, setFromAccount] = useState<string>('');
    const [toAccount, setToAccount] = useState<string>('');
    const [transferAmount, setTransferAmount] = useState<string>('');
    const [exchangeRateInfo, setExchangeRateInfo] = useState<{ rate: number; token: string } | null>(null);
    const [isLoadingRate, setIsLoadingRate] = useState<boolean>(false);
    const [validationResult, setValidationResult] = useState<{
        isValid: boolean;
        fee?: number;
        netAmount?: number;
        estimatedReceived?: number;
        error?: string;
    } | null>(null);
    const [isValidating, setIsValidating] = useState<boolean>(false);
    const [isExecutingTransfer, setIsExecutingTransfer] = useState<boolean>(false);
    const [transferSuccessMsg, setTransferSuccessMsg] = useState<string | null>(null);
    const [transferErrorMsg, setTransferErrorMsg] = useState<string | null>(null);

    // Currency settings
    const displayCurrency = (localStorage.getItem('converter_display_currency') as 'USD' | 'KES') || 'USD';
    const rate = parseFloat(localStorage.getItem('converter_kes_rate') || '129.5');

    // Fetch Wallets
    const fetchWallets = useCallback(async () => {
        setIsLoadingWallets(true);
        try {
            const list = await DerivAccountWalletService.getWallets('USD');
            setWallets(list || []);

            // Set default transfer accounts if empty
            if (list && list.length > 1) {
                if (!fromAccount) setFromAccount(list[0].wallet_id);
                if (!toAccount) setToAccount(list[1].wallet_id);
            }
        } catch (err) {
            console.error('[WalletManagementModal] fetchWallets error:', err);
        } finally {
            setIsLoadingWallets(false);
        }
    }, [fromAccount, toAccount]);

    // Fetch Transactions for selected wallet
    const fetchWalletHistory = useCallback(async (type: string) => {
        setIsLoadingHistory(true);
        try {
            const res = await DerivAccountWalletService.getWalletTransactions(type, { limit: 50 });
            setWalletTransactions(res.transactions || []);
        } catch (err) {
            console.error('[WalletManagementModal] fetchWalletHistory error:', err);
            setWalletTransactions([]);
        } finally {
            setIsLoadingHistory(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchWallets();
        }
    }, [isOpen, fetchWallets]);

    useEffect(() => {
        if (isOpen && activeTab === 'history') {
            fetchWalletHistory(selectedWalletType);
        }
    }, [isOpen, activeTab, selectedWalletType, fetchWalletHistory]);

    // Lookup account currency
    const getAccountCurrency = (accId: string): string => {
        const found = wallets.find(w => w.wallet_id === accId);
        if (found) return found.currency.replace(' (Demo)', '');
        const matched = accountList?.find(a => a.loginid === accId);
        return matched?.currency || 'USD';
    };

    const fromCurrency = useMemo(() => getAccountCurrency(fromAccount), [fromAccount, wallets, accountList]);
    const toCurrency = useMemo(() => getAccountCurrency(toAccount), [toAccount, wallets, accountList]);
    const isCrossCurrency = fromCurrency && toCurrency && fromCurrency !== toCurrency;

    // Fetch exchange rate if cross currency
    useEffect(() => {
        if (isCrossCurrency && fromCurrency && toCurrency) {
            setIsLoadingRate(true);
            setExchangeRateInfo(null);
            DerivAccountWalletService.getExchangeRate(fromCurrency, toCurrency)
                .then(res => {
                    if (res.exchange_rate && res.rate_token) {
                        setExchangeRateInfo({ rate: res.exchange_rate, token: res.rate_token });
                    }
                })
                .catch(() => {})
                .finally(() => setIsLoadingRate(false));
        } else {
            setExchangeRateInfo(null);
        }
    }, [isCrossCurrency, fromCurrency, toCurrency]);

    // Handle Transfer Validation Preview
    const handleValidateTransfer = async () => {
        const amt = parseFloat(transferAmount);
        if (!fromAccount || !toAccount || isNaN(amt) || amt <= 0) {
            setValidationResult({ isValid: false, error: 'Please enter a valid transfer amount and select distinct accounts.' });
            return;
        }

        if (fromAccount === toAccount) {
            setValidationResult({ isValid: false, error: 'Source and destination accounts must be different.' });
            return;
        }

        setIsValidating(true);
        setValidationResult(null);
        setTransferErrorMsg(null);
        setTransferSuccessMsg(null);

        try {
            const res = await DerivAccountWalletService.validateTransfer({
                from_account: fromAccount,
                to_account: toAccount,
                amount: amt,
            });

            if (res.is_valid) {
                setValidationResult({
                    isValid: true,
                    fee: res.fee || 0,
                    netAmount: res.net_amount || amt,
                    estimatedReceived: res.estimated_amount_received || (isCrossCurrency && exchangeRateInfo ? amt * exchangeRateInfo.rate : amt),
                });
            } else {
                setValidationResult({
                    isValid: false,
                    error: res.error || 'Transfer validation failed.',
                });
            }
        } catch (err: any) {
            setValidationResult({
                isValid: false,
                error: err?.message || 'Failed to validate transfer with Deriv Gateway.',
            });
        } finally {
            setIsValidating(false);
        }
    };

    // Handle Transfer Execution
    const handleExecuteTransfer = async () => {
        const amt = parseFloat(transferAmount);
        if (!validationResult?.isValid || isNaN(amt) || amt <= 0) return;

        setIsExecutingTransfer(true);
        setTransferErrorMsg(null);
        setTransferSuccessMsg(null);

        const requestId = `transfer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        try {
            if (isCrossCurrency && exchangeRateInfo) {
                await DerivAccountWalletService.executeCrossCurrencyTransfer({
                    from_account: fromAccount,
                    to_account: toAccount,
                    amount: amt,
                    exchange_rate: exchangeRateInfo.rate,
                    rate_token: exchangeRateInfo.token,
                    request_id: requestId,
                });
            } else {
                await DerivAccountWalletService.executeTransfer({
                    from_account: fromAccount,
                    to_account: toAccount,
                    amount: amt,
                    request_id: requestId,
                });
            }

            setTransferSuccessMsg(`Successfully transferred ${amt} ${fromCurrency} to ${toAccount}.`);
            setTransferAmount('');
            setValidationResult(null);
            fetchWallets();
        } catch (err: any) {
            setTransferErrorMsg(err?.message || 'Transfer execution failed. Please check balance and try again.');
        } finally {
            setIsExecutingTransfer(false);
        }
    };

    // Format currency amount helper
    const formatBalance = (amount: number, curr = 'USD') => {
        const isKes = displayCurrency === 'KES' && curr === 'USD';
        const displayVal = isKes ? amount * rate : amount;
        const finalCurr = isKes ? 'KES' : getCurrencyDisplayCode(curr);
        const decimals = isKes ? 2 : getDecimalPlaces(curr);
        return `${addComma(displayVal.toFixed(decimals))} ${finalCurr}`;
    };

    if (!isOpen) return null;

    return (
        <div className='wallet-modal__overlay' onClick={onClose}>
            <div className='wallet-modal__container' onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className='wallet-modal__header'>
                    <div className='wallet-modal__title-group'>
                        <div className='wallet-modal__icon-badge'>
                            <WalletIcon size={18} />
                        </div>
                        <div>
                            <div className='wallet-modal__title-wrapper'>
                                <h3>{localize('Deriv Wallet & Funds Center')}</h3>
                                <span className='wallet-modal__badge-rest'>
                                    REST API v1
                                </span>
                            </div>
                            <p className='wallet-modal__subtitle'>
                                {localize('Official Deriv Wallet REST API (developers.deriv.com/docs/wallet/)')}
                            </p>
                        </div>
                    </div>

                    <button className='wallet-modal__close-btn' onClick={onClose} aria-label='Close'>
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs Bar */}
                <div className='wallet-modal__nav'>
                    <button
                        className={`wallet-modal__tab-btn ${activeTab === 'wallets' ? 'active' : ''}`}
                        onClick={() => setActiveTab('wallets')}
                    >
                        <WalletIcon size={15} />
                        <span>{localize('My Wallets')}</span>
                    </button>
                    <button
                        className={`wallet-modal__tab-btn ${activeTab === 'transfer' ? 'active' : ''}`}
                        onClick={() => setActiveTab('transfer')}
                    >
                        <ArrowLeftRight size={15} />
                        <span>{localize('Transfer Funds')}</span>
                    </button>
                    <button
                        className={`wallet-modal__tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                        onClick={() => setActiveTab('history')}
                    >
                        <History size={15} />
                        <span>{localize('Wallet History')}</span>
                    </button>
                </div>

                {/* Body Content */}
                <div className='wallet-modal__body'>
                    {/* TAB 1: WALLETS OVERVIEW */}
                    {activeTab === 'wallets' && (
                        <div className='wallet-tab-wallets'>
                            <div className='section-intro'>
                                <h4>{localize('Connected Wallets & Trading Accounts')}</h4>
                                <button className='refresh-icon-btn' onClick={fetchWallets} disabled={isLoadingWallets}>
                                    <RefreshCw size={13} className={isLoadingWallets ? 'animate-spin' : ''} />
                                    <span>{localize('Refresh Balances')}</span>
                                </button>
                            </div>

                            {isLoadingWallets ? (
                                <div className='loading-state'>
                                    <Loader2 size={28} className='animate-spin' />
                                    <p>{localize('Querying GET /wallet/v1/wallets from Deriv Gateway...')}</p>
                                </div>
                            ) : (
                                <div className='wallets-grid'>
                                    {wallets.map(w => {
                                        const isDemo = w.wallet_type.includes('demo') || w.wallet_id.startsWith('VR');
                                        const isDefault = w.is_default || w.wallet_id === activeLoginid;

                                        return (
                                            <div
                                                key={w.wallet_id}
                                                className={`wallet-card ${isDefault ? 'wallet-card--default' : ''}`}
                                            >
                                                <div className='wallet-card__header'>
                                                    <div className='wallet-card__id-group'>
                                                        <span className='wallet-id'>{w.wallet_id}</span>
                                                        <span
                                                            className={`wallet-badge ${
                                                                isDemo ? 'badge-demo' : 'badge-real'
                                                            }`}
                                                        >
                                                            {isDemo ? 'DEMO WALLET' : 'REAL WALLET'}
                                                        </span>
                                                        {isDefault && (
                                                            <span className='badge-active'>{localize('Active')}</span>
                                                        )}
                                                    </div>
                                                    <span className='wallet-type-tag'>{w.wallet_type.toUpperCase()}</span>
                                                </div>

                                                <div className='wallet-card__balance-block'>
                                                    <div className='balance-label'>{localize('Available Balance')}</div>
                                                    <div className='balance-val'>
                                                        {formatBalance(w.balance, w.currency)}
                                                    </div>
                                                    {w.converted_balance !== undefined && (
                                                        <div className='balance-converted'>
                                                            &asymp; {addComma(w.converted_balance.toFixed(2))} USD
                                                        </div>
                                                    )}
                                                </div>

                                                <div className='wallet-card__actions'>
                                                    <button
                                                        className='card-action-btn'
                                                        onClick={() => {
                                                            setFromAccount(w.wallet_id);
                                                            setActiveTab('transfer');
                                                        }}
                                                    >
                                                        <ArrowLeftRight size={13} />
                                                        <span>{localize('Transfer')}</span>
                                                    </button>
                                                    <button
                                                        className='card-action-btn card-action-btn--sec'
                                                        onClick={() => {
                                                            setSelectedWalletType(w.wallet_type.replace('demo_', ''));
                                                            setActiveTab('history');
                                                        }}
                                                    >
                                                        <History size={13} />
                                                        <span>{localize('History')}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 2: TRANSFER & EXCHANGE */}
                    {activeTab === 'transfer' && (
                        <div className='wallet-tab-transfer'>
                            <div className='transfer-card'>
                                <h4>{localize('Move Money Between Wallets & Accounts')}</h4>
                                <p className='transfer-desc'>
                                    {localize(
                                        'Move funds in same currency or cross-currency with real-time rate quotation and validation.'
                                    )}
                                </p>

                                {transferSuccessMsg && (
                                    <div className='transfer-alert transfer-alert--success'>
                                        <CheckCircle2 size={16} />
                                        <span>{transferSuccessMsg}</span>
                                    </div>
                                )}

                                {transferErrorMsg && (
                                    <div className='transfer-alert transfer-alert--danger'>
                                        <ShieldAlert size={16} />
                                        <span>{transferErrorMsg}</span>
                                    </div>
                                )}

                                <div className='transfer-fields'>
                                    {/* Source Account */}
                                    <div className='field-group'>
                                        <label>{localize('From Wallet / Account')}</label>
                                        <select
                                            value={fromAccount}
                                            onChange={e => {
                                                setFromAccount(e.target.value);
                                                setValidationResult(null);
                                            }}
                                        >
                                            <option value=''>{localize('Select source account')}</option>
                                            {wallets.map(w => (
                                                <option key={w.wallet_id} value={w.wallet_id}>
                                                    {w.wallet_id} ({w.currency}) &mdash; {formatBalance(w.balance, w.currency)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Destination Account */}
                                    <div className='field-group'>
                                        <label>{localize('To Wallet / Account')}</label>
                                        <select
                                            value={toAccount}
                                            onChange={e => {
                                                setToAccount(e.target.value);
                                                setValidationResult(null);
                                            }}
                                        >
                                            <option value=''>{localize('Select destination account')}</option>
                                            {wallets.map(w => (
                                                <option key={w.wallet_id} value={w.wallet_id}>
                                                    {w.wallet_id} ({w.currency}) &mdash; {formatBalance(w.balance, w.currency)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Transfer Amount */}
                                    <div className='field-group'>
                                        <label>{localize('Transfer Amount')} ({fromCurrency})</label>
                                        <input
                                            type='number'
                                            step='any'
                                            min='0.01'
                                            placeholder='0.00'
                                            value={transferAmount}
                                            onChange={e => {
                                                setTransferAmount(e.target.value);
                                                setValidationResult(null);
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Cross-Currency Rate Quote Display */}
                                {isCrossCurrency && (
                                    <div className='exchange-rate-banner'>
                                        <Coins size={15} />
                                        <span>
                                            {isLoadingRate ? (
                                                localize('Fetching live exchange rate quote...')
                                            ) : exchangeRateInfo ? (
                                                <>
                                                    1 {fromCurrency} = {exchangeRateInfo.rate.toFixed(4)} {toCurrency} &bull;{' '}
                                                    <span className='token-tag'>Quote locked for execution</span>
                                                </>
                                            ) : (
                                                localize('No exchange quote available.')
                                            )}
                                        </span>
                                    </div>
                                )}

                                {/* Validation Preview Box */}
                                {validationResult && (
                                    <div
                                        className={`validation-preview ${
                                            validationResult.isValid ? 'valid' : 'invalid'
                                        }`}
                                    >
                                        {validationResult.isValid ? (
                                            <>
                                                <div className='preview-row'>
                                                    <span>{localize('Source Debit:')}</span>
                                                    <strong>
                                                        {validationResult.netAmount} {fromCurrency}
                                                    </strong>
                                                </div>
                                                <div className='preview-row'>
                                                    <span>{localize('Transfer Fee:')}</span>
                                                    <strong>
                                                        {validationResult.fee || 0} {fromCurrency}
                                                    </strong>
                                                </div>
                                                <div className='preview-row highlight'>
                                                    <span>{localize('Estimated Destination Receives:')}</span>
                                                    <strong>
                                                        {validationResult.estimatedReceived?.toFixed(2)} {toCurrency}
                                                    </strong>
                                                </div>
                                            </>
                                        ) : (
                                            <div className='preview-error'>
                                                <ShieldAlert size={15} />
                                                <span>{validationResult.error}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className='transfer-actions'>
                                    {!validationResult?.isValid ? (
                                        <button
                                            className='btn-preview'
                                            onClick={handleValidateTransfer}
                                            disabled={isValidating || !transferAmount || !fromAccount || !toAccount}
                                        >
                                            {isValidating ? (
                                                <Loader2 size={15} className='animate-spin' />
                                            ) : (
                                                <CheckCircle2 size={15} />
                                            )}
                                            <span>{localize('Preview & Validate Transfer')}</span>
                                        </button>
                                    ) : (
                                        <div className='confirm-buttons-group'>
                                            <button
                                                className='btn-confirm'
                                                onClick={handleExecuteTransfer}
                                                disabled={isExecutingTransfer}
                                            >
                                                {isExecutingTransfer ? (
                                                    <Loader2 size={15} className='animate-spin' />
                                                ) : (
                                                    <ArrowRight size={15} />
                                                )}
                                                <span>{localize('Confirm & Execute Transfer')}</span>
                                            </button>
                                            <button
                                                className='btn-cancel'
                                                onClick={() => setValidationResult(null)}
                                            >
                                                {localize('Edit Details')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: WALLET TRANSACTIONS */}
                    {activeTab === 'history' && (
                        <div className='wallet-tab-history'>
                            <div className='history-toolbar'>
                                <div className='history-type-picker'>
                                    <label>{localize('Wallet Type:')}</label>
                                    <select
                                        value={selectedWalletType}
                                        onChange={e => setSelectedWalletType(e.target.value)}
                                    >
                                        <option value='fiat'>{localize('Fiat Wallet')}</option>
                                        <option value='crypto'>{localize('Crypto Wallet')}</option>
                                        <option value='doughflow'>{localize('Doughflow Wallet')}</option>
                                        <option value='payment_agent'>{localize('Payment Agent')}</option>
                                    </select>
                                </div>

                                <button
                                    className='refresh-icon-btn'
                                    onClick={() => fetchWalletHistory(selectedWalletType)}
                                    disabled={isLoadingHistory}
                                >
                                    <RefreshCw size={13} className={isLoadingHistory ? 'animate-spin' : ''} />
                                    <span>{localize('Reload')}</span>
                                </button>
                            </div>

                            {isLoadingHistory ? (
                                <div className='loading-state'>
                                    <Loader2 size={28} className='animate-spin' />
                                    <p>{localize('Fetching GET /wallet/v1/transactions/{wallet_type}...')}</p>
                                </div>
                            ) : walletTransactions.length === 0 ? (
                                <div className='empty-state'>
                                    <History size={32} className='text-muted' />
                                    <h4>{localize('No wallet transactions recorded')}</h4>
                                    <p>{localize('Transactions for this wallet type will appear here.')}</p>
                                </div>
                            ) : (
                                <div className='history-table-wrapper'>
                                    <table className='history-table'>
                                        <thead>
                                            <tr>
                                                <th>{localize('ID')}</th>
                                                <th>{localize('Action')}</th>
                                                <th>{localize('Channel')}</th>
                                                <th className='text-right'>{localize('Amount')}</th>
                                                <th className='text-right'>{localize('Balance After')}</th>
                                                <th>{localize('Status')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {walletTransactions.map(tx => {
                                                const isCredit = tx.amount > 0;
                                                return (
                                                    <tr key={tx.transaction_id}>
                                                        <td><code>#{tx.transaction_id}</code></td>
                                                        <td>
                                                            <span className={`status-badge status-${tx.action_type}`}>
                                                                {tx.action_type.toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td>{tx.channel || tx.category || 'Deriv Transfer'}</td>
                                                        <td
                                                            className={`text-right font-mono ${
                                                                isCredit ? 'text-success' : 'text-danger'
                                                            }`}
                                                        >
                                                            {isCredit ? '+' : ''}
                                                            {addComma(tx.amount.toFixed(2))} {tx.currency}
                                                        </td>
                                                        <td className='text-right font-mono'>
                                                            {addComma(tx.balance_after.toFixed(2))} {tx.currency}
                                                        </td>
                                                        <td>
                                                            <span className='pill-completed'>{tx.status}</span>
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

                {/* Footer */}
                <div className='wallet-modal__footer'>
                    <div className='footer-info'>
                        <Info size={14} className='text-muted' />
                        <span>
                            {localize('All wallet operations secured by Deriv Payment Protocol')} &bull;{' '}
                            <a
                                href='https://developers.deriv.com/docs/wallet/'
                                target='_blank'
                                rel='noopener noreferrer'
                            >
                                Deriv Wallet REST Docs ↗
                            </a>
                        </span>
                    </div>

                    <button className='footer-close-btn' onClick={onClose}>
                        {localize('Close')}
                    </button>
                </div>
            </div>
        </div>
    );
});

export default WalletManagementModal;
