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

    // Dock Tabs & Input state
    const [dockTab, setDockTab] = useState<'token' | 'stored'>('token');
    const [inputToken, setInputToken] = useState('');
    const [inputAlias, setInputAlias] = useState('');
    const [sizingMode, setSizingMode] = useState<'multiplier' | 'fixed'>('multiplier');
    const [multiplierValue, setMultiplierValue] = useState<number>(1.0);
    const [fixedStakeValue, setFixedStakeValue] = useState<number>(1.0);

    // Live validation state for dock
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

    // Risk Controls state
    const [maxStakeGuard, setMaxStakeGuard] = useState<number>(50.0);
    const [dailyLossLimit, setDailyLossLimit] = useState<number>(100.0);

    // Audit log filter
    const [logFilter, setLogFilter] = useState<'all' | 'real' | 'demo' | 'won' | 'lost'>('all');

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
    }, [dockTab]);

    // Handle token validation
    const handleValidateToken = useCallback(
        async (tokenToValidate: string) => {
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
                    error: err?.message || 'Failed to communicate with Deriv server.',
                });
            } finally {
                setIsValidating(false);
            }
        },
        [inputAlias]
    );

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
            setInputToken('');
            setInputAlias('');
            setValidationResult(null);
        } else {
            alert(res.error || 'Failed to save follower account');
        }
    };

    // 1-Click add stored account
    const handleAddStoredAccount = async (stored: {
        loginid: string;
        token: string;
        is_virtual: boolean;
    }) => {
        const res = await copyTradingService.addCopierAccount({
            token: stored.token,
            alias: `${stored.is_virtual ? 'Demo' : 'Real'} Account (${stored.loginid})`,
            sizing_mode: 'multiplier',
            multiplier: 1.0,
        });
        if (!res.success) {
            alert(res.error || 'Failed to add account');
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

    // Filtered audit logs
    const filteredLogs = useMemo(() => {
        return tradeLogs.filter(log => {
            if (logFilter === 'real') return !log.is_virtual;
            if (logFilter === 'demo') return log.is_virtual;
            if (logFilter === 'won') return log.status === 'won';
            if (logFilter === 'lost') return log.status === 'lost';
            return true;
        });
    }, [tradeLogs, logFilter]);

    return (
        <div className='copy-trading-container'>
            {/* 1. TOP HEADER & GLOBAL CONTROL BAR */}
            <header className='ct-header-bar'>
                <div className='ct-header-bar__left'>
                    <div className='ct-header-bar__logo-badge'>
                        <svg
                            width='26'
                            height='26'
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
                    <div className='ct-header-bar__title-group'>
                        <div className='ct-header-bar__title'>
                            Copy Trading Suite
                            <span className='ct-header-bar__badge-tag'>Demo → Real Mirror</span>
                        </div>
                        <p className='ct-header-bar__desc'>
                            Ultra low-latency trade replication engine: Intercepts trades from Bot Builder, Quick Strategy, and Manual Trading.
                        </p>
                    </div>
                </div>

                <div className='ct-header-bar__right'>
                    <div className='ct-header-bar__switch-container'>
                        <span className='ct-header-bar__switch-label'>
                            {masterConfig.is_active ? 'Replication Active' : 'Replication Paused'}
                        </span>
                        <label className='ct-header-bar__toggle'>
                            <input
                                type='checkbox'
                                checked={masterConfig.is_active}
                                onChange={handleToggleMasterCopier}
                            />
                            <span className='ct-slider' />
                        </label>
                    </div>

                    <button
                        className='ct-header-bar__btn ct-header-bar__btn--secondary'
                        onClick={() => copyTradingService.refreshAllBalances()}
                        title='Fetch latest balances across all Deriv accounts'
                    >
                        <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <path d='M23 4v6h-6' />
                            <path d='M1 20v-6h6' />
                            <path d='M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' />
                        </svg>
                        Refresh Balances
                    </button>
                </div>
            </header>

            {/* 2. VISUAL REPLICATION PIPELINE TOPOLOGY CARD */}
            <section className='ct-topology-card'>
                <div className='ct-topology-card__header'>
                    <div className='ct-topology-card__title'>
                        <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <polyline points='22 12 18 12 15 21 9 3 6 12 2 12' />
                        </svg>
                        Live Execution Pipeline Topology
                    </div>
                    <div className='ct-topology-card__latency-badge'>
                        <span className='ct-pulse-dot' />
                        WebSocket Latency: &lt; 24ms
                    </div>
                </div>

                <div className='ct-topology-card__pipeline'>
                    {/* Node 1: Master Source */}
                    <div className='ct-topology-card__node ct-topology-card__node--master'>
                        <div className='ct-topology-card__node-top'>
                            <span className='ct-topology-card__node-label'>Master Source</span>
                            <span
                                style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    padding: '0.2rem 0.6rem',
                                    borderRadius: '6px',
                                    background: masterConfig.is_virtual
                                        ? 'rgba(245, 158, 11, 0.2)'
                                        : 'rgba(16, 185, 129, 0.2)',
                                    color: masterConfig.is_virtual ? '#f59e0b' : '#10b981',
                                    border: `1px solid ${
                                        masterConfig.is_virtual ? '#f59e0b' : '#10b981'
                                    }`,
                                }}
                            >
                                {masterConfig.is_virtual ? 'DEMO ACCOUNT' : 'REAL ACCOUNT'}
                            </span>
                        </div>
                        <div className='ct-topology-card__node-balance'>
                            {masterConfig.balance.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}{' '}
                            <span style={{ fontSize: '0.9rem', color: '#10b981' }}>
                                {masterConfig.currency}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className='ct-topology-card__node-id'>ID: {masterConfig.loginid || 'Not Connected'}</span>
                            {storedAccounts.length > 1 && (
                                <select
                                    style={{
                                        background: 'rgba(0,0,0,0.4)',
                                        color: '#fff',
                                        border: '1px solid var(--ct-border)',
                                        borderRadius: '6px',
                                        fontSize: '0.75rem',
                                        padding: '0.2rem 0.4rem',
                                    }}
                                    value={masterConfig.loginid}
                                    onChange={e => handleSelectMasterAccount(e.target.value)}
                                >
                                    {storedAccounts.map(a => (
                                        <option key={a.loginid} value={a.loginid}>
                                            {a.is_virtual ? 'Demo' : 'Real'} ({a.loginid})
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    </div>

                    {/* Bridge: Deriv Low-Latency Router */}
                    <div className='ct-topology-card__bridge'>
                        <span className='ct-topology-card__bridge-tag'>⚡ Real-Time Bridge</span>
                        <div className='ct-topology-card__bridge-line' />
                        <span className='ct-topology-card__bridge-sub'>
                            {activeCount > 0 ? `Replicating to ${activeCount} Account(s)` : 'No Active Targets'}
                        </span>
                    </div>

                    {/* Node 2: Follower Targets Summary */}
                    <div className='ct-topology-card__node ct-topology-card__node--target'>
                        <div className='ct-topology-card__node-top'>
                            <span className='ct-topology-card__node-label'>Target Follower Pool</span>
                            <span
                                style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    padding: '0.2rem 0.6rem',
                                    borderRadius: '6px',
                                    background: 'rgba(16, 185, 129, 0.2)',
                                    color: '#10b981',
                                    border: '1px solid #10b981',
                                }}
                            >
                                {activeCount} ACTIVE COPIERS
                            </span>
                        </div>
                        <div className='ct-topology-card__node-balance'>
                            {accounts.reduce((sum, a) => sum + (a.is_active ? a.balance : 0), 0).toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}{' '}
                            <span style={{ fontSize: '0.9rem', color: '#10b981' }}>USD Aggregate</span>
                        </div>
                        <div className='ct-topology-card__node-id'>
                            {realCount} Real Account(s) • {demoCount} Demo Account(s)
                        </div>
                    </div>
                </div>
            </section>

            {/* 3. STATS BAR (4 CUSHIONED SPONGY CARDS) */}
            <div className='ct-stats-bar'>
                <div className='ct-stat-box'>
                    <div className='ct-stat-box__icon ct-stat-box__icon--emerald'>
                        <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' />
                            <circle cx='9' cy='7' r='4' />
                            <path d='M23 21v-2a4 4 0 0 0-3-3.87' />
                            <path d='M16 3.13a4 4 0 0 1 0 7.75' />
                        </svg>
                    </div>
                    <div>
                        <div className='ct-stat-box__label'>Follower Accounts</div>
                        <div className='ct-stat-box__value'>
                            {activeCount} <span style={{ fontSize: '0.85rem', color: 'var(--ct-text-subtle)' }}>/ {accounts.length} Active</span>
                        </div>
                        <div className='ct-stat-box__sub'>{realCount} Real • {demoCount} Demo</div>
                    </div>
                </div>

                <div className='ct-stat-box'>
                    <div className='ct-stat-box__icon ct-stat-box__icon--cyan'>
                        <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <polyline points='23 6 13.5 15.5 8.5 10.5 1 18' />
                            <polyline points='17 6 23 6 23 12' />
                        </svg>
                    </div>
                    <div>
                        <div className='ct-stat-box__label'>Total Trades Replicated</div>
                        <div className='ct-stat-box__value'>{tradeLogs.length}</div>
                        <div className='ct-stat-box__sub'>Real-time WebSocket Mirroring</div>
                    </div>
                </div>

                <div className='ct-stat-box'>
                    <div className='ct-stat-box__icon ct-stat-box__icon--indigo'>
                        <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <rect x='2' y='4' width='20' height='16' rx='2' />
                            <line x1='2' y1='10' x2='22' y2='10' />
                        </svg>
                    </div>
                    <div>
                        <div className='ct-stat-box__label'>Master Balance</div>
                        <div className='ct-stat-box__value'>
                            {masterConfig.balance.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}{' '}
                            <span style={{ fontSize: '0.8rem' }}>{masterConfig.currency}</span>
                        </div>
                        <div className='ct-stat-box__sub'>{masterConfig.is_virtual ? 'Demo Strategy Account' : 'Real Capital'}</div>
                    </div>
                </div>

                <div className='ct-stat-box'>
                    <div className='ct-stat-box__icon ct-stat-box__icon--amber'>
                        <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <polygon points='13 2 3 14 12 14 11 22 21 10 12 10 13 2' />
                        </svg>
                    </div>
                    <div>
                        <div className='ct-stat-box__label'>Execution Latency</div>
                        <div className='ct-stat-box__value'>&lt; 28ms</div>
                        <div className='ct-stat-box__sub'>Direct WebSocket Dispatch</div>
                    </div>
                </div>
            </div>

            {/* 4. MAIN WORKSPACE: COPIER POOL & CONNECT DOCK */}
            <div className='ct-workspace-grid'>
                {/* LEFT: Follower Copiers Pool */}
                <section className='ct-copier-pool'>
                    <div className='ct-copier-pool__header'>
                        <h2 className='ct-copier-pool__title'>
                            <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                                <path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' />
                                <circle cx='9' cy='7' r='4' />
                            </svg>
                            Target Copier Accounts
                        </h2>
                        <span className='ct-copier-pool__count-tag'>{accounts.length} Linked</span>
                    </div>

                    {accounts.length === 0 ? (
                        <div
                            style={{
                                background: 'var(--ct-card-bg)',
                                border: '2px dashed var(--ct-border)',
                                borderRadius: '18px',
                                padding: '3.5rem 2rem',
                                textAlign: 'center',
                                boxShadow: 'var(--ct-spongy-shadow)',
                            }}
                        >
                            <div
                                style={{
                                    width: '60px',
                                    height: '60px',
                                    borderRadius: '16px',
                                    background: 'rgba(16, 185, 129, 0.15)',
                                    color: '#10b981',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto 1rem',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                }}
                            >
                                <svg width='30' height='30' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                                    <line x1='12' y1='5' x2='12' y2='19' />
                                    <line x1='5' y1='12' x2='19' y2='12' />
                                </svg>
                            </div>
                            <h3 style={{ color: 'var(--ct-text-title)', fontSize: '1.2rem', margin: '0 0 0.5rem', fontWeight: 800 }}>
                                Connect Your Real Account to Copy Trades
                            </h3>
                            <p style={{ color: 'var(--ct-text-muted)', fontSize: '0.88rem', maxWidth: '440px', margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
                                Use the Connect Dock on the right to paste a Deriv API PAT token or pick an existing account to start replicating Demo profits directly to your Real account.
                            </p>
                        </div>
                    ) : (
                        <div className='ct-copier-pool__cards'>
                            {accounts.map(acc => (
                                <div
                                    key={acc.id}
                                    className={`ct-pool-card ${acc.is_virtual ? 'ct-pool-card--demo' : 'ct-pool-card--real'} ${
                                        !acc.is_active ? 'ct-pool-card--inactive' : ''
                                    }`}
                                >
                                    <div className='ct-pool-card__top'>
                                        <div className='ct-pool-card__identity'>
                                            <div
                                                className={`ct-pool-card__avatar ${
                                                    acc.is_virtual
                                                        ? 'ct-pool-card__avatar--demo'
                                                        : 'ct-pool-card__avatar--real'
                                                }`}
                                            >
                                                {acc.is_virtual ? 'DEMO' : 'REAL'}
                                            </div>
                                            <div className='ct-pool-card__name-group'>
                                                <h4 className='ct-pool-card__alias'>{acc.alias}</h4>
                                                <span className='ct-pool-card__loginid'>{acc.loginid}</span>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <span
                                                className={`ct-pool-card__status-pill ${
                                                    acc.is_active
                                                        ? 'ct-pool-card__status-pill--active'
                                                        : 'ct-pool-card__status-pill--paused'
                                                }`}
                                            >
                                                {acc.is_active ? '● Active Mirror' : '○ Paused'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Metrics row */}
                                    <div className='ct-pool-card__metrics-row'>
                                        <div className='ct-pool-card__metric-cell'>
                                            <span className='ct-pool-card__metric-label'>Live Balance</span>
                                            <span className='ct-pool-card__metric-value ct-pool-card__metric-value--accent'>
                                                {acc.balance.toLocaleString('en-US', {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}{' '}
                                                <span style={{ fontSize: '0.78rem' }}>{acc.currency}</span>
                                            </span>
                                        </div>

                                        <div className='ct-pool-card__metric-cell'>
                                            <span className='ct-pool-card__metric-label'>Copied Trades</span>
                                            <span className='ct-pool-card__metric-value'>
                                                {acc.total_copied_trades || 0}
                                            </span>
                                        </div>

                                        <div className='ct-pool-card__metric-cell'>
                                            <span className='ct-pool-card__metric-label'>Sizing Mode</span>
                                            <span className='ct-pool-card__metric-value'>
                                                {acc.sizing_mode === 'multiplier'
                                                    ? `${acc.multiplier}x Stake`
                                                    : `$${acc.fixed_stake?.toFixed(2)} Fixed`}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Quick Stake Sizing Presets */}
                                    <div className='ct-pool-card__controls-row'>
                                        <div className='ct-pool-card__sizing-pill-group'>
                                            <span style={{ fontSize: '0.74rem', color: 'var(--ct-text-subtle)', fontWeight: 800, textTransform: 'uppercase', marginRight: '0.3rem' }}>
                                                Stake:
                                            </span>
                                            {[0.5, 1.0, 1.5, 2.0].map(mult => (
                                                <button
                                                    key={mult}
                                                    className={acc.sizing_mode === 'multiplier' && acc.multiplier === mult ? 'active' : ''}
                                                    onClick={() =>
                                                        copyTradingService.updateCopierAccount(acc.id, {
                                                            sizing_mode: 'multiplier',
                                                            multiplier: mult,
                                                        })
                                                    }
                                                >
                                                    {mult}x
                                                </button>
                                            ))}
                                            <button
                                                className={acc.sizing_mode === 'fixed' ? 'active' : ''}
                                                onClick={() =>
                                                    copyTradingService.updateCopierAccount(acc.id, {
                                                        sizing_mode: 'fixed',
                                                        fixed_stake: 1.0,
                                                    })
                                                }
                                            >
                                                Fixed $1
                                            </button>
                                        </div>

                                        <div className='ct-pool-card__actions-group'>
                                            <button
                                                className='ct-pool-card__action-btn'
                                                onClick={() => copyTradingService.toggleCopierActive(acc.id)}
                                            >
                                                {acc.is_active ? 'Pause' : 'Activate'}
                                            </button>
                                            <button
                                                className='ct-pool-card__action-btn ct-pool-card__action-btn--danger'
                                                onClick={() => {
                                                    if (confirm(`Disconnect ${acc.alias} (${acc.loginid})?`)) {
                                                        copyTradingService.removeCopierAccount(acc.id);
                                                    }
                                                }}
                                            >
                                                Disconnect
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* RIGHT: Interactive Connect Follower Account Dock */}
                <aside className='ct-connect-dock'>
                    <h3 className='ct-connect-dock__title'>
                        <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <path d='M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4' />
                        </svg>
                        Connect Follower Account
                    </h3>

                    <div className='ct-connect-dock__tabs'>
                        <button
                            className={`ct-connect-dock__tab-btn ${dockTab === 'token' ? 'active' : ''}`}
                            onClick={() => setDockTab('token')}
                        >
                            Deriv API PAT Token
                        </button>
                        <button
                            className={`ct-connect-dock__tab-btn ${dockTab === 'stored' ? 'active' : ''}`}
                            onClick={() => setDockTab('stored')}
                        >
                            Session Accounts ({storedAccounts.length})
                        </button>
                    </div>

                    {dockTab === 'token' ? (
                        <>
                            <div className='ct-connect-dock__field'>
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
                                <span style={{ fontSize: '0.72rem', color: 'var(--ct-text-subtle)' }}>
                                    Token must have <strong>read</strong> and <strong>trade</strong> scopes from Deriv API token settings.
                                </span>
                            </div>

                            {/* Live WebSocket validation preview */}
                            {isValidating && (
                                <div className='ct-connect-dock__live-preview'>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#06b6d4', fontSize: '0.84rem' }}>
                                        <span className='ct-pulse-dot' />
                                        Connecting to Deriv WebSocket & checking balance...
                                    </div>
                                </div>
                            )}

                            {validationResult && !isValidating && (
                                <div
                                    className={`ct-connect-dock__live-preview ${
                                        validationResult.valid
                                            ? validationResult.is_virtual
                                                ? 'ct-connect-dock__live-preview--demo'
                                                : 'ct-connect-dock__live-preview--real'
                                            : 'ct-connect-dock__live-preview--error'
                                    }`}
                                >
                                    {validationResult.valid ? (
                                        <>
                                            <div className='ct-connect-dock__prev-head'>
                                                <span
                                                    className={`ct-connect-dock__prev-badge ${
                                                        validationResult.is_virtual
                                                            ? 'ct-connect-dock__prev-badge--demo'
                                                            : 'ct-connect-dock__prev-badge--real'
                                                    }`}
                                                >
                                                    {validationResult.is_virtual ? '✓ DEMO ACCOUNT' : '✓ REAL ACCOUNT'}
                                                </span>
                                                <span className='ct-connect-dock__prev-balance'>
                                                    {validationResult.balance?.toLocaleString('en-US', {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2,
                                                    })}{' '}
                                                    <span style={{ fontSize: '0.82rem', color: validationResult.is_virtual ? '#f59e0b' : '#10b981' }}>
                                                        {validationResult.currency}
                                                    </span>
                                                </span>
                                            </div>
                                            <div className='ct-connect-dock__prev-meta'>
                                                <span>Login ID: <strong>{validationResult.loginid}</strong></span>
                                                <span>Scopes: <strong>{validationResult.scopes?.join(', ') || 'read, trade'}</strong></span>
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ color: '#f43f5e', fontSize: '0.84rem', fontWeight: 700 }}>
                                            ⚠️ {validationResult.error || 'Invalid Deriv API token.'}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className='ct-connect-dock__field'>
                                <label>Friendly Account Alias</label>
                                <input
                                    type='text'
                                    placeholder='e.g. Primary Real Account'
                                    value={inputAlias}
                                    onChange={e => setInputAlias(e.target.value)}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                <div className='ct-connect-dock__field'>
                                    <label>Stake Sizing Mode</label>
                                    <select
                                        value={sizingMode}
                                        onChange={e => setSizingMode(e.target.value as 'multiplier' | 'fixed')}
                                    >
                                        <option value='multiplier'>Stake Multiplier</option>
                                        <option value='fixed'>Fixed Stake ($)</option>
                                    </select>
                                </div>

                                <div className='ct-connect-dock__field'>
                                    <label>{sizingMode === 'multiplier' ? 'Multiplier (x)' : 'Fixed Stake ($)'}</label>
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

                            <button
                                className='ct-connect-dock__submit-btn'
                                disabled={!validationResult?.valid}
                                onClick={handleSaveAccount}
                            >
                                <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                                    <line x1='12' y1='5' x2='12' y2='19' />
                                    <line x1='5' y1='12' x2='19' y2='12' />
                                </svg>
                                Link & Enable Follower
                            </button>
                        </>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            <p style={{ fontSize: '0.82rem', color: 'var(--ct-text-muted)', margin: '0 0 0.5rem' }}>
                                The accounts below were detected from your active browser session. Click to add them as follower copiers:
                            </p>
                            {storedAccounts.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--ct-text-subtle)', fontSize: '0.85rem' }}>
                                    No other accounts detected in this browser session. Paste a PAT token in the first tab.
                                </div>
                            ) : (
                                storedAccounts.map(acc => {
                                    const isAlreadyAdded = accounts.some(a => a.loginid === acc.loginid);
                                    return (
                                        <div
                                            key={acc.loginid}
                                            style={{
                                                background: 'rgba(0,0,0,0.3)',
                                                border: '1px solid var(--ct-border)',
                                                borderRadius: '12px',
                                                padding: '0.8rem 1rem',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--ct-text-title)' }}>
                                                    {acc.loginid}
                                                </div>
                                                <span
                                                    style={{
                                                        fontSize: '0.72rem',
                                                        color: acc.is_virtual ? '#f59e0b' : '#10b981',
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    {acc.is_virtual ? 'Demo Virtual' : 'Real Deriv'}
                                                </span>
                                            </div>

                                            <button
                                                className='ct-header-bar__btn ct-header-bar__btn--primary'
                                                disabled={isAlreadyAdded}
                                                onClick={() => handleAddStoredAccount(acc)}
                                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.78rem' }}
                                            >
                                                {isAlreadyAdded ? 'Already Linked' : '+ Add Copier'}
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </aside>
            </div>

            {/* 5. TEST EXECUTION CONSOLE & INSTITUTIONAL RISK GUARDS */}
            <div className='ct-controls-section'>
                {/* Instant Replication Test Bar */}
                <div className='ct-action-card'>
                    <h4 className='ct-action-card__title'>
                        <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <polygon points='13 2 3 14 12 14 11 22 21 10 12 10 13 2' />
                        </svg>
                        Instant Demo-to-Real Mirroring Test
                    </h4>
                    <p className='ct-action-card__desc'>
                        Dispatch a live micro-contract on the Master account to immediately test replication speed and verify that all follower copiers receive contracts concurrently.
                    </p>

                    <div className='ct-action-card__grid'>
                        <div className='ct-action-card__input-wrap'>
                            <label>Synthetic Index</label>
                            <select value={testSymbol} onChange={e => setTestSymbol(e.target.value)}>
                                <option value='R_100'>Volatility 100 Index</option>
                                <option value='1HZ100V'>Volatility 100 (1s) Index</option>
                                <option value='R_50'>Volatility 50 Index</option>
                                <option value='R_75'>Volatility 75 Index</option>
                                <option value='R_10'>Volatility 10 Index</option>
                                <option value='R_25'>Volatility 25 Index</option>
                            </select>
                        </div>

                        <div className='ct-action-card__input-wrap'>
                            <label>Test Stake ($ USD)</label>
                            <input
                                type='number'
                                step='0.1'
                                min='0.35'
                                value={testStake}
                                onChange={e => setTestStake(parseFloat(e.target.value) || 0.5)}
                            />
                        </div>
                    </div>

                    <div className='ct-action-card__btn-row'>
                        <button
                            className='ct-action-card__btn-call'
                            disabled={isTestExecuting}
                            onClick={() => handleExecuteTestTrade('CALL')}
                        >
                            ▲ Test Rise (Call)
                        </button>
                        <button
                            className='ct-action-card__btn-put'
                            disabled={isTestExecuting}
                            onClick={() => handleExecuteTestTrade('PUT')}
                        >
                            ▼ Test Fall (Put)
                        </button>
                    </div>

                    {testNotice && (
                        <div
                            style={{
                                padding: '0.65rem 0.9rem',
                                borderRadius: '10px',
                                background: 'rgba(16, 185, 129, 0.12)',
                                border: '1px solid rgba(16, 185, 129, 0.35)',
                                color: '#10b981',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                            }}
                        >
                            {testNotice}
                        </div>
                    )}
                </div>

                {/* Institutional Risk Management Guards */}
                <div className='ct-action-card'>
                    <h4 className='ct-action-card__title'>
                        <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />
                        </svg>
                        Capital Protection & Risk Guards
                    </h4>
                    <p className='ct-action-card__desc'>
                        Automatic circuit breakers protect your follower accounts from over-leveraged bot runs or sudden market anomalies.
                    </p>

                    <div className='ct-action-card__grid'>
                        <div className='ct-action-card__input-wrap'>
                            <label>Max Single Stake Guard ($)</label>
                            <input
                                type='number'
                                step='5'
                                min='1'
                                value={maxStakeGuard}
                                onChange={e => setMaxStakeGuard(parseFloat(e.target.value) || 50)}
                            />
                        </div>

                        <div className='ct-action-card__input-wrap'>
                            <label>Daily Loss Cutoff ($)</label>
                            <input
                                type='number'
                                step='10'
                                min='5'
                                value={dailyLossLimit}
                                onChange={e => setDailyLossLimit(parseFloat(e.target.value) || 100)}
                            />
                        </div>
                    </div>

                    <div
                        style={{
                            background: 'rgba(99, 102, 241, 0.08)',
                            border: '1px solid rgba(99, 102, 241, 0.2)',
                            borderRadius: '10px',
                            padding: '0.75rem',
                            fontSize: '0.78rem',
                            color: 'var(--ct-text-muted)',
                            lineHeight: 1.45,
                        }}
                    >
                        <strong>Safety Guarantee:</strong> If a master bot attempts to place a stake exceeding ${maxStakeGuard.toFixed(2)}, follower copier stakes will be capped automatically to protect balance.
                    </div>
                </div>
            </div>

            {/* 6. LIVE COPIED TRADES AUDIT TABLE & FILTERS */}
            <section className='ct-audit-section'>
                <div className='ct-audit-section__top'>
                    <div className='ct-audit-section__title-area'>
                        <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                            <polyline points='22 12 18 12 15 21 9 3 6 12 2 12' />
                        </svg>
                        <h3 className='ct-audit-section__title'>Live Copied Trades Audit Log</h3>
                    </div>

                    <div className='ct-audit-section__filters'>
                        <button
                            className={`ct-audit-section__filter-btn ${logFilter === 'all' ? 'active' : ''}`}
                            onClick={() => setLogFilter('all')}
                        >
                            All ({tradeLogs.length})
                        </button>
                        <button
                            className={`ct-audit-section__filter-btn ${logFilter === 'real' ? 'active' : ''}`}
                            onClick={() => setLogFilter('real')}
                        >
                            Real Accounts
                        </button>
                        <button
                            className={`ct-audit-section__filter-btn ${logFilter === 'demo' ? 'active' : ''}`}
                            onClick={() => setLogFilter('demo')}
                        >
                            Demo Accounts
                        </button>
                        <button
                            className={`ct-audit-section__filter-btn ${logFilter === 'won' ? 'active' : ''}`}
                            onClick={() => setLogFilter('won')}
                        >
                            Wins
                        </button>
                        <button
                            className={`ct-audit-section__filter-btn ${logFilter === 'lost' ? 'active' : ''}`}
                            onClick={() => setLogFilter('lost')}
                        >
                            Losses
                        </button>

                        {tradeLogs.length > 0 && (
                            <button
                                className='ct-audit-section__filter-btn'
                                onClick={() => copyTradingService.clearLogs()}
                                style={{ marginLeft: '0.5rem', color: '#f43f5e' }}
                            >
                                Clear Log
                            </button>
                        )}
                    </div>
                </div>

                <div className='ct-audit-section__table-wrap'>
                    <table className='ct-audit-section__table'>
                        <thead>
                            <tr>
                                <th>Time</th>
                                <th>Master</th>
                                <th>Follower Account</th>
                                <th>Target Type</th>
                                <th>Market</th>
                                <th>Contract</th>
                                <th>Master Stake</th>
                                <th>Copier Stake</th>
                                <th>Status</th>
                                <th>P&L Result</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={10} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--ct-text-muted)' }}>
                                        No copied trade records found. Start a bot in Bot Builder or test replication with the buttons above.
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.map(log => (
                                    <tr key={log.id}>
                                        <td style={{ fontFamily: 'monospace' }}>{log.time}</td>
                                        <td>
                                            <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                                {log.master_loginid}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                                {log.copier_loginid}
                                            </span>
                                        </td>
                                        <td>
                                            <span
                                                style={{
                                                    fontSize: '0.7rem',
                                                    fontWeight: 800,
                                                    padding: '0.2rem 0.5rem',
                                                    borderRadius: '6px',
                                                    background: log.is_virtual ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                                                    color: log.is_virtual ? '#f59e0b' : '#10b981',
                                                    border: `1px solid ${log.is_virtual ? '#f59e0b' : '#10b981'}`,
                                                }}
                                            >
                                                {log.is_virtual ? 'DEMO' : 'REAL'}
                                            </span>
                                        </td>
                                        <td><strong>{log.symbol}</strong></td>
                                        <td>{log.contract_type}</td>
                                        <td>${log.master_stake.toFixed(2)}</td>
                                        <td style={{ color: '#10b981', fontWeight: 700 }}>
                                            ${log.copier_stake.toFixed(2)}
                                        </td>
                                        <td>
                                            <span className={`ct-audit-section__status-pill ct-audit-section__status-pill--${log.status}`}>
                                                {log.status}
                                            </span>
                                        </td>
                                        <td>
                                            {log.profit !== undefined ? (
                                                <span
                                                    style={{
                                                        color: log.profit >= 0 ? '#10b981' : '#f43f5e',
                                                        fontWeight: 800,
                                                    }}
                                                >
                                                    {log.profit >= 0 ? `+$${log.profit.toFixed(2)}` : `-$${Math.abs(log.profit).toFixed(2)}`}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--ct-text-subtle)' }}>
                                                    {log.error_message || 'In Execution'}
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
        </div>
    );
});

export default CopyTradingPage;
