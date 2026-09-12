import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import {
    copyTradingService,
    CopierAccount,
    CopierTradeLog,
    MasterAccountConfig,
    TradeParameters,
} from './services/copy-trading.service';
import { getAccountsList } from '@/utils/token-bridge';
import './copy-trading.scss';

export const CopyTradingPage: React.FC = observer(() => {
    const { client } = useStore();

    // Local reactive copies from service
    const [accounts, setAccounts] = useState<CopierAccount[]>([]);
    const [tradeLogs, setTradeLogs] = useState<CopierTradeLog[]>([]);
    const [masterConfig, setMasterConfig] = useState<MasterAccountConfig>(
        copyTradingService.getMasterConfig()
    );

    // Modal state
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [inputToken, setInputToken] = useState('');
    const [inputAlias, setInputAlias] = useState('');
    const [sizingMode, setSizingMode] = useState<'multiplier' | 'fixed'>('multiplier');
    const [multiplierValue, setMultiplierValue] = useState<number>(1.0);
    const [fixedStakeValue, setFixedStakeValue] = useState<number>(1.0);

    // Live validation state for modal
    const [isValidating, setIsValidating] = useState(false);
    const [validationResult, setValidationResult] = useState<{
        valid?: boolean;
        loginid?: string;
        is_virtual?: boolean;
        balance?: number;
        currency?: string;
        scopes?: string[];
        error?: string;
    } | null>(null);

    // Test bar state
    const [testSymbol, setTestSymbol] = useState('R_100');
    const [testStake, setTestStake] = useState(0.5);
    const [isTestExecuting, setIsTestExecuting] = useState(false);
    const [testNotice, setTestNotice] = useState<string | null>(null);

    // Synchronize with copyTradingService
    useEffect(() => {
        copyTradingService.init();

        const updateState = () => {
            setAccounts(copyTradingService.getAccounts());
            setTradeLogs(copyTradingService.getTradeLogs());
            setMasterConfig(copyTradingService.getMasterConfig());
        };

        updateState();
        const unsubscribe = copyTradingService.subscribe(updateState);

        // Auto sync active client account if master is unset
        if (client?.loginid) {
            const currentToken = getAccountsList()[client.loginid] || '';
            const isVirtual = Boolean(
                client.is_virtual ||
                client.loginid.startsWith('VRTC') ||
                client.loginid.startsWith('VRW')
            );
            const currentBal = Number(client.balance || 0);
            const currentCurr = client.currency || 'USD';

            const currentMaster = copyTradingService.getMasterConfig();
            if (!currentMaster.loginid || currentMaster.loginid === client.loginid) {
                copyTradingService.setMasterConfig({
                    loginid: client.loginid,
                    token: currentToken,
                    is_virtual: isVirtual,
                    balance: currentBal,
                    currency: currentCurr,
                    alias: `Active (${client.loginid})`,
                });
            }
        }

        return () => {
            unsubscribe();
        };
    }, [client?.loginid, client?.balance, client?.is_virtual]);

    // Available stored accounts from browser
    const storedAccounts = useMemo(() => {
        return copyTradingService.getAvailableStoredAccounts();
    }, [isAddModalOpen]);

    // Handle token validation
    const handleValidateToken = useCallback(async (tokenToValidate: string) => {
        if (!tokenToValidate || tokenToValidate.trim().length < 4) {
            setValidationResult(null);
            return;
        }

        setIsValidating(true);
        try {
            const res = await copyTradingService.validateToken(tokenToValidate);
            setValidationResult(res);
            if (res.valid && !inputAlias) {
                setInputAlias(`${res.is_virtual ? 'Demo' : 'Real'} (${res.loginid})`);
            }
        } catch (err: any) {
            setValidationResult({
                valid: false,
                error: err?.message || 'Failed to communicate with Deriv.',
            });
        } finally {
            setIsValidating(false);
        }
    }, [inputAlias]);

    // Save token as follower account
    const handleSaveAccount = async () => {
        if (!inputToken || !validationResult?.valid) return;

        const res = await copyTradingService.addCopierAccount({
            token: inputToken,
            alias: inputAlias,
            sizing_mode: sizingMode,
            multiplier: multiplierValue,
            fixed_stake: fixedStakeValue,
        });

        if (res.success) {
            setIsAddModalOpen(false);
            setInputToken('');
            setInputAlias('');
            setValidationResult(null);
        } else {
            alert(res.error || 'Failed to save account');
        }
    };

    // Toggle master global copier status
    const handleToggleMasterCopier = () => {
        copyTradingService.setMasterConfig({
            is_active: !masterConfig.is_active,
        });
    };

    // Switch Master account source
    const handleSelectMasterAccount = (loginid: string) => {
        const found = storedAccounts.find(a => a.loginid === loginid);
        if (found) {
            copyTradingService.setMasterConfig({
                loginid: found.loginid,
                token: found.token,
                is_virtual: found.is_virtual,
                alias: `Selected (${found.loginid})`,
            });
            copyTradingService.refreshAllBalances();
        }
    };

    // Execute instant test replication
    const handleExecuteTestTrade = async (type: 'CALL' | 'PUT') => {
        if (accounts.length === 0) {
            setTestNotice('Please add at least one follower copier account first.');
            return;
        }

        const activeCopiers = accounts.filter(a => a.is_active);
        if (activeCopiers.length === 0) {
            setTestNotice('All copier accounts are paused. Enable at least one account.');
            return;
        }

        setIsTestExecuting(true);
        setTestNotice(null);

        const tradeParams: TradeParameters = {
            symbol: testSymbol,
            contract_type: type,
            stake: testStake,
            duration: 5,
            duration_unit: 't',
            currency: masterConfig.currency || 'USD',
        };

        try {
            const results = await copyTradingService.replicateTradeToCopiers(
                tradeParams,
                masterConfig.loginid || 'MASTER_DIRECT'
            );

            const successCount = results.filter(r => r.status === 'success').length;
            setTestNotice(
                `Replication dispatched to ${results.length} account(s): ${successCount} successful!`
            );
        } catch (err: any) {
            setTestNotice(`Test trade error: ${err?.message || 'Unknown error'}`);
        } finally {
            setIsTestExecuting(false);
        }
    };

    // Derived counts
    const activeCount = accounts.filter(a => a.is_active).length;
    const realCount = accounts.filter(a => !a.is_virtual).length;
    const demoCount = accounts.filter(a => a.is_virtual).length;

    return (
        <div className='copy-trading-container'>
            {/* HERO BANNER & STATUS */}
            <header className='ct-hero'>
                <div className='ct-hero__left'>
                    <div className='ct-hero__icon-box'>
                        <svg
                            width='28'
                            height='28'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='2'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                        >
                            <path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' />
                            <circle cx='9' cy='7' r='4' />
                            <path d='M22 21v-2a4 4 0 0 0-3-3.87' />
                            <path d='M16 3.13a4 4 0 0 1 0 7.75' />
                        </svg>
                    </div>
                    <div>
                        <h1 className='ct-hero__title'>
                            Copy Trading <span className='ct-gradient-text'>Multi-Account Suite</span>
                        </h1>
                        <p className='ct-hero__subtitle'>
                            Institutional low-latency trade mirroring: Replicate trades from Demo to Real or between accounts in real-time.
                        </p>
                    </div>
                </div>

                <div className='ct-hero__right'>
                    <div
                        className={`ct-hero__status-pill ${
                            !masterConfig.is_active ? 'ct-hero__status-pill--paused' : ''
                        }`}
                    >
                        <span className='ct-pulse-dot' />
                        {masterConfig.is_active ? 'Copy Engine Active' : 'Copy Engine Paused'}
                    </div>

                    <button
                        className='ct-hero__btn ct-hero__btn--secondary'
                        onClick={handleToggleMasterCopier}
                        title='Toggle global copy replication on/off'
                    >
                        {masterConfig.is_active ? 'Pause Mirroring' : 'Resume Mirroring'}
                    </button>

                    <button
                        className='ct-hero__btn ct-hero__btn--secondary'
                        onClick={() => copyTradingService.refreshAllBalances()}
                        title='Update live balances across all connected accounts'
                    >
                        <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <path d='M23 4v6h-6' />
                            <path d='M1 20v-6h6' />
                            <path d='M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' />
                        </svg>
                        Refresh Balances
                    </button>

                    <button
                        className='ct-hero__btn ct-hero__btn--primary'
                        onClick={() => {
                            setIsAddModalOpen(true);
                            setValidationResult(null);
                            setInputToken('');
                        }}
                    >
                        <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <line x1='12' y1='5' x2='12' y2='19' />
                            <line x1='5' y1='12' x2='19' y2='12' />
                        </svg>
                        Add Follower Token
                    </button>
                </div>
            </header>

            {/* STATS OVERVIEW CARDS */}
            <div className='ct-stats-grid'>
                <div className='ct-stat-card'>
                    <div className='ct-stat-card__icon ct-stat-card__icon--emerald'>
                        <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' />
                            <circle cx='9' cy='7' r='4' />
                            <path d='M23 21v-2a4 4 0 0 0-3-3.87' />
                            <path d='M16 3.13a4 4 0 0 1 0 7.75' />
                        </svg>
                    </div>
                    <div>
                        <div className='ct-stat-card__label'>Active Copier Accounts</div>
                        <div className='ct-stat-card__value'>
                            {activeCount} <span style={{ fontSize: '0.85rem', color: 'var(--ct-text-subtle)' }}>/ {accounts.length}</span>
                        </div>
                        <div className='ct-stat-card__hint'>
                            {realCount} Real • {demoCount} Demo
                        </div>
                    </div>
                </div>

                <div className='ct-stat-card'>
                    <div className='ct-stat-card__icon ct-stat-card__icon--cyan'>
                        <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <circle cx='12' cy='12' r='10' />
                            <path d='M12 6v6l4 2' />
                        </svg>
                    </div>
                    <div>
                        <div className='ct-stat-card__label'>Total Trades Replicated</div>
                        <div className='ct-stat-card__value'>{tradeLogs.length}</div>
                        <div className='ct-stat-card__hint'>Real-time WebSocket mirroring</div>
                    </div>
                </div>

                <div className='ct-stat-card'>
                    <div className='ct-stat-card__icon ct-stat-card__icon--indigo'>
                        <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <rect x='2' y='4' width='20' height='16' rx='2' />
                            <line x1='2' y1='10' x2='22' y2='10' />
                        </svg>
                    </div>
                    <div>
                        <div className='ct-stat-card__label'>Master Balance</div>
                        <div className='ct-stat-card__value'>
                            {masterConfig.balance.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}{' '}
                            <span style={{ fontSize: '0.8rem' }}>{masterConfig.currency}</span>
                        </div>
                        <div className='ct-stat-card__hint'>
                            {masterConfig.is_virtual ? 'Demo Virtual Account' : 'Real Deriv Account'}
                        </div>
                    </div>
                </div>

                <div className='ct-stat-card'>
                    <div className='ct-stat-card__icon ct-stat-card__icon--amber'>
                        <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <polygon points='13 2 3 14 12 14 11 22 21 10 12 10 13 2' />
                        </svg>
                    </div>
                    <div>
                        <div className='ct-stat-card__label'>Execution Latency</div>
                        <div className='ct-stat-card__value'>&lt; 35ms</div>
                        <div className='ct-stat-card__hint'>Direct WebSocket connection</div>
                    </div>
                </div>
            </div>

            {/* TWO-COLUMN LAYOUT: MASTER ACCOUNT & COPIER ACCOUNTS */}
            <div className='ct-main-layout'>
                {/* MASTER ACCOUNT CONFIG */}
                <aside className='ct-master-card'>
                    <div className='ct-master-card__header'>
                        <div className='ct-master-card__title'>
                            <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                                <path d='M12 2L2 7l10 5 10-5-10-5z' />
                                <path d='M2 17l10 5 10-5' />
                                <path d='M2 12l10 5 10-5' />
                            </svg>
                            Master Account
                        </div>
                        <span
                            className={`ct-master-card__badge ${
                                masterConfig.is_virtual
                                    ? 'ct-master-card__badge--demo'
                                    : 'ct-master-card__badge--real'
                            }`}
                        >
                            {masterConfig.is_virtual ? 'DEMO' : 'REAL'}
                        </span>
                    </div>

                    <div className='ct-master-card__balance-box'>
                        <div className='ct-master-card__balance-label'>Account Balance</div>
                        <div className='ct-master-card__balance-amount'>
                            {masterConfig.balance.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}{' '}
                            <span style={{ fontSize: '1rem', color: '#10b981' }}>{masterConfig.currency}</span>
                        </div>
                        <div className='ct-master-card__account-id'>ID: {masterConfig.loginid || 'Not Set'}</div>
                    </div>

                    <div className='ct-master-card__source-select'>
                        <label>Switch Master Account</label>
                        <select
                            value={masterConfig.loginid}
                            onChange={e => handleSelectMasterAccount(e.target.value)}
                        >
                            {storedAccounts.map(acc => (
                                <option key={acc.loginid} value={acc.loginid}>
                                    {acc.is_virtual ? 'Demo (Virtual)' : 'Real'} — {acc.loginid}
                                </option>
                            ))}
                            {!storedAccounts.some(a => a.loginid === masterConfig.loginid) && masterConfig.loginid && (
                                <option value={masterConfig.loginid}>
                                    Current ({masterConfig.loginid})
                                </option>
                            )}
                        </select>
                    </div>

                    <div className='ct-master-card__info-row'>
                        <span>Mirroring Mode:</span>
                        <span>{masterConfig.is_virtual ? 'Demo → Real Copier' : 'Real → Multi-Account'}</span>
                    </div>
                    <div className='ct-master-card__info-row'>
                        <span>Replication Engine:</span>
                        <span style={{ color: '#10b981' }}>Synchronized</span>
                    </div>

                    <div className='ct-master-card__explain'>
                        <strong>Institutional Demo-to-Real Trading:</strong> Trades executed on this master account (via Bot Builder, Quick Strategy, Free Bots, or Manual Trading) are automatically duplicated in parallel to all active follower accounts below.
                    </div>
                </aside>

                {/* COPIER / FOLLOWER ACCOUNTS SECTION */}
                <section className='ct-copiers-section'>
                    <div className='ct-copiers-section__top'>
                        <div className='ct-copiers-section__title'>
                            <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                                <circle cx='12' cy='12' r='10' />
                                <line x1='2' y1='12' x2='22' y2='12' />
                                <path d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' />
                            </svg>
                            Follower Copier Accounts
                            <span className='ct-copiers-section__count'>{accounts.length} Connected</span>
                        </div>
                    </div>

                    {accounts.length === 0 ? (
                        <div className='ct-empty-state'>
                            <div className='ct-empty-state__icon'>
                                <svg width='32' height='32' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                                    <path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' />
                                    <circle cx='9' cy='7' r='4' />
                                    <path d='M22 21v-2a4 4 0 0 0-3-3.87' />
                                    <path d='M16 3.13a4 4 0 0 1 0 7.75' />
                                </svg>
                            </div>
                            <h3 className='ct-empty-state__title'>No Follower Accounts Added</h3>
                            <p className='ct-empty-state__desc'>
                                Add your Real account (or additional follower accounts) using a Deriv API Personal Access Token (PAT) to begin copying trades from your Demo account.
                            </p>
                            <button
                                className='ct-hero__btn ct-hero__btn--primary'
                                onClick={() => {
                                    setIsAddModalOpen(true);
                                    setValidationResult(null);
                                    setInputToken('');
                                }}
                            >
                                <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                                    <line x1='12' y1='5' x2='12' y2='19' />
                                    <line x1='5' y1='12' x2='19' y2='12' />
                                </svg>
                                Add Follower Account
                            </button>
                        </div>
                    ) : (
                        <div className='ct-accounts-grid'>
                            {accounts.map(acc => (
                                <div
                                    key={acc.id}
                                    className={`ct-copier-card ${!acc.is_active ? 'ct-copier-card--inactive' : ''}`}
                                >
                                    <div className='ct-copier-card__head'>
                                        <div>
                                            <h4 className='ct-copier-card__alias'>{acc.alias}</h4>
                                            <div className='ct-copier-card__loginid'>{acc.loginid}</div>
                                        </div>
                                        <div className='ct-copier-card__badges'>
                                            <span
                                                className={`ct-copier-card__badge ${
                                                    acc.is_virtual
                                                        ? 'ct-copier-card__badge--demo'
                                                        : 'ct-copier-card__badge--real'
                                                }`}
                                            >
                                                {acc.is_virtual ? 'DEMO' : 'REAL'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className='ct-copier-card__balance-row'>
                                        <span className='ct-copier-card__balance-title'>Account Balance</span>
                                        <span className='ct-copier-card__balance-val'>
                                            {acc.balance.toLocaleString('en-US', {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                            })}{' '}
                                            <span style={{ fontSize: '0.8rem', color: acc.is_virtual ? '#f59e0b' : '#10b981' }}>
                                                {acc.currency}
                                            </span>
                                        </span>
                                    </div>

                                    <div className='ct-copier-card__controls'>
                                        <div className='ct-copier-card__field'>
                                            <label>Sizing Mode</label>
                                            <select
                                                value={acc.sizing_mode}
                                                onChange={e =>
                                                    copyTradingService.updateCopierAccount(acc.id, {
                                                        sizing_mode: e.target.value as 'multiplier' | 'fixed',
                                                    })
                                                }
                                            >
                                                <option value='multiplier'>Stake Multiplier</option>
                                                <option value='fixed'>Fixed Stake ($)</option>
                                            </select>
                                        </div>

                                        <div className='ct-copier-card__field'>
                                            <label>
                                                {acc.sizing_mode === 'multiplier' ? 'Multiplier (x)' : 'Fixed Amount'}
                                            </label>
                                            {acc.sizing_mode === 'multiplier' ? (
                                                <input
                                                    type='number'
                                                    step='0.1'
                                                    min='0.1'
                                                    max='10'
                                                    value={acc.multiplier}
                                                    onChange={e =>
                                                        copyTradingService.updateCopierAccount(acc.id, {
                                                            multiplier: parseFloat(e.target.value) || 1,
                                                        })
                                                    }
                                                />
                                            ) : (
                                                <input
                                                    type='number'
                                                    step='0.5'
                                                    min='0.35'
                                                    value={acc.fixed_stake ?? 1}
                                                    onChange={e =>
                                                        copyTradingService.updateCopierAccount(acc.id, {
                                                            fixed_stake: parseFloat(e.target.value) || 1,
                                                        })
                                                    }
                                                />
                                            )}
                                        </div>
                                    </div>

                                    <div className='ct-copier-card__footer'>
                                        <label className='ct-copier-card__toggle'>
                                            <input
                                                type='checkbox'
                                                checked={acc.is_active}
                                                onChange={() => copyTradingService.toggleCopierActive(acc.id)}
                                            />
                                            {acc.is_active ? 'Active Mirroring' : 'Paused'}
                                        </label>

                                        <button
                                            className='ct-copier-card__delete-btn'
                                            onClick={() => {
                                                if (confirm(`Remove account ${acc.alias} (${acc.loginid})?`)) {
                                                    copyTradingService.removeCopierAccount(acc.id);
                                                }
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            {/* INSTANT REPLICATION TEST BAR */}
            <section className='ct-test-bar'>
                <div className='ct-test-bar__info'>
                    <div className='ct-test-bar__icon'>
                        <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <polygon points='13 2 3 14 12 14 11 22 21 10 12 10 13 2' />
                        </svg>
                    </div>
                    <div>
                        <h4 className='ct-test-bar__title'>Instant Demo-to-Real Mirroring Test</h4>
                        <p className='ct-test-bar__desc'>
                            Dispatch a sample contract on the Master account to immediately test replication speed across all follower accounts.
                        </p>
                    </div>
                </div>

                <div className='ct-test-bar__actions'>
                    <select
                        className='ct-test-bar__select'
                        value={testSymbol}
                        onChange={e => setTestSymbol(e.target.value)}
                    >
                        <option value='R_100'>Volatility 100 Index</option>
                        <option value='1HZ100V'>Volatility 100 (1s) Index</option>
                        <option value='R_50'>Volatility 50 Index</option>
                        <option value='R_75'>Volatility 75 Index</option>
                        <option value='R_10'>Volatility 10 Index</option>
                        <option value='R_25'>Volatility 25 Index</option>
                    </select>

                    <button
                        className='ct-test-bar__btn-rise'
                        disabled={isTestExecuting}
                        onClick={() => handleExecuteTestTrade('CALL')}
                    >
                        ▲ Test Rise (Call)
                    </button>

                    <button
                        className='ct-test-bar__btn-fall'
                        disabled={isTestExecuting}
                        onClick={() => handleExecuteTestTrade('PUT')}
                    >
                        ▼ Test Fall (Put)
                    </button>
                </div>
            </section>

            {testNotice && (
                <div
                    style={{
                        padding: '0.8rem 1.2rem',
                        borderRadius: '12px',
                        background: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: '#10b981',
                        fontSize: '0.86rem',
                        fontWeight: '700',
                        marginBottom: '1.5rem',
                    }}
                >
                    {testNotice}
                </div>
            )}

            {/* LIVE AUDIT LOG TABLE */}
            <section className='ct-audit-card'>
                <div className='ct-audit-card__header'>
                    <h3 className='ct-audit-card__title'>
                        <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <polyline points='22 12 18 12 15 21 9 3 6 12 2 12' />
                        </svg>
                        Live Copied Trades Audit Log
                    </h3>
                    {tradeLogs.length > 0 && (
                        <button
                            className='ct-audit-card__clear-btn'
                            onClick={() => copyTradingService.clearLogs()}
                        >
                            Clear Audit Log
                        </button>
                    )}
                </div>

                <div className='ct-audit-card__table-wrapper'>
                    <table className='ct-audit-card__table'>
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Master</th>
                                <th>Follower Copier</th>
                                <th>Type</th>
                                <th>Market</th>
                                <th>Contract</th>
                                <th>Master Stake</th>
                                <th>Copier Stake</th>
                                <th>Status</th>
                                <th>Result</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tradeLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: 'var(--ct-text-muted)' }}>
                                        No copied trade executions yet. Place a trade with your bot or run the instant test above to see replication logs.
                                    </td>
                                </tr>
                            ) : (
                                tradeLogs.map(log => (
                                    <tr key={log.id}>
                                        <td style={{ fontFamily: 'monospace' }}>{log.time}</td>
                                        <td>
                                            <span style={{ fontFamily: 'monospace', fontWeight: '700' }}>
                                                {log.master_loginid}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{ fontFamily: 'monospace', fontWeight: '700' }}>
                                                {log.copier_loginid}
                                            </span>
                                        </td>
                                        <td>
                                            <span
                                                className={`ct-copier-card__badge ${
                                                    log.is_virtual
                                                        ? 'ct-copier-card__badge--demo'
                                                        : 'ct-copier-card__badge--real'
                                                }`}
                                            >
                                                {log.is_virtual ? 'DEMO' : 'REAL'}
                                            </span>
                                        </td>
                                        <td><strong>{log.symbol}</strong></td>
                                        <td>{log.contract_type}</td>
                                        <td>${log.master_stake.toFixed(2)}</td>
                                        <td style={{ color: '#10b981', fontWeight: '700' }}>
                                            ${log.copier_stake.toFixed(2)}
                                        </td>
                                        <td>
                                            <span
                                                className={`ct-audit-card__status-badge ct-audit-card__status-badge--${log.status}`}
                                            >
                                                {log.status}
                                            </span>
                                        </td>
                                        <td>
                                            {log.profit !== undefined ? (
                                                <span
                                                    style={{
                                                        color: log.profit >= 0 ? '#10b981' : '#f43f5e',
                                                        fontWeight: '800',
                                                    }}
                                                >
                                                    {log.profit >= 0 ? `+$${log.profit.toFixed(2)}` : `-$${Math.abs(log.profit).toFixed(2)}`}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--ct-text-subtle)' }}>
                                                    {log.error_message || 'In execution'}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* ADD FOLLOWER TOKEN MODAL */}
            {isAddModalOpen && (
                <div className='ct-modal-backdrop' onClick={() => setIsAddModalOpen(false)}>
                    <div className='ct-modal' onClick={e => e.stopPropagation()}>
                        <div className='ct-modal__head'>
                            <h3 className='ct-modal__title'>
                                <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                                    <path d='M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4' />
                                </svg>
                                Add Follower Account
                            </h3>
                            <button className='ct-modal__close' onClick={() => setIsAddModalOpen(false)}>
                                ✕
                            </button>
                        </div>

                        <div className='ct-modal__body'>
                            {/* Quick selection from browser session accounts */}
                            {storedAccounts.length > 0 && (
                                <div className='ct-modal__field'>
                                    <label>Pick from Logged-In Accounts</label>
                                    <select
                                        onChange={e => {
                                            const found = storedAccounts.find(a => a.loginid === e.target.value);
                                            if (found) {
                                                setInputToken(found.token);
                                                handleValidateToken(found.token);
                                            }
                                        }}
                                        defaultValue=''
                                    >
                                        <option value='' disabled>
                                            -- Select an account to auto-fill token --
                                        </option>
                                        {storedAccounts.map(acc => (
                                            <option key={acc.loginid} value={acc.loginid}>
                                                {acc.is_virtual ? 'Demo' : 'Real'} • {acc.loginid}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Deriv API PAT Token Input */}
                            <div className='ct-modal__field'>
                                <label>Deriv API Token (PAT)</label>
                                <input
                                    type='text'
                                    placeholder='Paste Deriv API Token (e.g. a1-abcdef12345...)'
                                    value={inputToken}
                                    onChange={e => {
                                        setInputToken(e.target.value);
                                        handleValidateToken(e.target.value);
                                    }}
                                />
                                <span style={{ fontSize: '0.74rem', color: 'var(--ct-text-subtle)' }}>
                                    Token requires <strong>read</strong> and <strong>trade</strong> permissions from Deriv Account Settings.
                                </span>
                            </div>

                            {/* Live Verification Status Box */}
                            {isValidating && (
                                <div className='ct-modal__validation-box'>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#06b6d4', fontSize: '0.85rem' }}>
                                        <span className='ct-pulse-dot' />
                                        Connecting to Deriv WebSocket & validating token...
                                    </div>
                                </div>
                            )}

                            {validationResult && !isValidating && (
                                <div
                                    className={`ct-modal__validation-box ${
                                        validationResult.valid
                                            ? 'ct-modal__validation-box--success'
                                            : 'ct-modal__validation-box--error'
                                    }`}
                                >
                                    {validationResult.valid ? (
                                        <>
                                            <div className='ct-modal__val-header'>
                                                <span
                                                    className={`ct-modal__val-badge ${
                                                        validationResult.is_virtual
                                                            ? 'ct-modal__val-badge--demo'
                                                            : 'ct-modal__val-badge--real'
                                                    }`}
                                                >
                                                    {validationResult.is_virtual ? 'DEMO ACCOUNT' : 'REAL ACCOUNT'}
                                                </span>
                                                <span className='ct-modal__val-balance'>
                                                    {validationResult.balance?.toLocaleString('en-US', {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2,
                                                    })}{' '}
                                                    <span style={{ fontSize: '0.85rem', color: validationResult.is_virtual ? '#f59e0b' : '#10b981' }}>
                                                        {validationResult.currency}
                                                    </span>
                                                </span>
                                            </div>
                                            <div className='ct-modal__val-info'>
                                                <div><strong>Account Login ID:</strong> {validationResult.loginid}</div>
                                                <div>
                                                    <strong>Permissions:</strong>{' '}
                                                    {validationResult.scopes?.join(', ') || 'read, trade'}
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ color: '#f43f5e', fontSize: '0.85rem', fontWeight: '700' }}>
                                            ⚠️ {validationResult.error || 'Invalid Deriv API token.'}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Alias input */}
                            <div className='ct-modal__field'>
                                <label>Account Alias / Friendly Name</label>
                                <input
                                    type='text'
                                    placeholder='e.g. Primary Real Account'
                                    value={inputAlias}
                                    onChange={e => setInputAlias(e.target.value)}
                                />
                            </div>

                            {/* Sizing & Multiplier */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className='ct-modal__field'>
                                    <label>Stake Sizing</label>
                                    <select
                                        value={sizingMode}
                                        onChange={e => setSizingMode(e.target.value as 'multiplier' | 'fixed')}
                                    >
                                        <option value='multiplier'>Stake Multiplier</option>
                                        <option value='fixed'>Fixed Stake Amount</option>
                                    </select>
                                </div>

                                <div className='ct-modal__field'>
                                    <label>
                                        {sizingMode === 'multiplier' ? 'Multiplier (e.g. 1.0 = exact)' : 'Fixed Stake ($)'}
                                    </label>
                                    {sizingMode === 'multiplier' ? (
                                        <input
                                            type='number'
                                            step='0.1'
                                            min='0.1'
                                            max='10'
                                            value={multiplierValue}
                                            onChange={e => setMultiplierValue(parseFloat(e.target.value) || 1)}
                                        />
                                    ) : (
                                        <input
                                            type='number'
                                            step='0.5'
                                            min='0.35'
                                            value={fixedStakeValue}
                                            onChange={e => setFixedStakeValue(parseFloat(e.target.value) || 1)}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className='ct-modal__actions'>
                            <button
                                className='ct-hero__btn ct-hero__btn--secondary'
                                onClick={() => setIsAddModalOpen(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className='ct-hero__btn ct-hero__btn--primary'
                                disabled={!validationResult?.valid}
                                onClick={handleSaveAccount}
                            >
                                Save & Enable Copier
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

export default CopyTradingPage;
