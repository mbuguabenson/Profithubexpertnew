import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { addComma, getCurrencyDisplayCode, getDecimalPlaces } from '@/components/shared';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { isDemoAccount } from '@/utils/account-helpers';
import { Localize, localize } from '@deriv-com/translations';
import { DerivAccountWalletService, DerivWallet } from '@/services/deriv-account-wallet.service';
import { TAccountSwitcher } from './common/types';
import AccountInfoWrapper from './account-info-wrapper';
const realAccountImg = '/real-account.jpg';
import './account-switcher.scss';


const getCurrencyLabel = (currency: string): string => {
    const labels: Record<string, string> = {
        USD: 'US Dollar',
        EUR: 'Euro',
        GBP: 'British Pound',
        AUD: 'Australian Dollar',
        CAD: 'Canadian Dollar',
        KES: 'Kenyan Shilling',
        NGN: 'Nigerian Naira',
        ZAR: 'South African Rand',
        GHS: 'Ghanaian Cedi',
    };
    return labels[currency] || currency;
};

// ─── Demo account icon ────────────────────────────────────────────────────────
const DemoIcon = () => (
    <div className='acc-icon acc-icon--demo'>
        <span className='acc-icon__letter'>D</span>
    </div>
);

// ─── Real account icon ────────────────────────────────────────────────────────
const RealIcon = ({ src }: { src: string }) => (
    <div className='acc-icon acc-icon--real'>
        <img src={src} alt='Real Account' className='acc-icon__img' />
    </div>
);

// ─── Wallet icon ──────────────────────────────────────────────────────────────
const WalletIcon = () => (
    <div className='acc-icon acc-icon--real' style={{ background: '#ff444f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', borderRadius: '50%' }}>
        <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.2' strokeLinecap='round' strokeLinejoin='round'>
            <path d='M21 12V7H5a2 2 0 0 1 0-4h14v4' />
            <path d='M3 5v14a2 2 0 0 0 2 2h16v-5' />
            <path d='M18 12a2 2 0 0 0 0 4h4v-4Z' />
        </svg>
    </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────
const AccountSwitcher = observer(({ activeAccount }: TAccountSwitcher) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'real' | 'demo' | 'wallets'>('real');
    const [wallets, setWallets] = useState<DerivWallet[]>([]);
    const [userNickname, setUserNickname] = useState<string>('');
    const wrapperRef = useRef<HTMLDivElement>(null);
    const { accountList, activeLoginid } = useApiBase();
    const { client, run_panel } = useStore() ?? {};

    const [displayCurrency, setDisplayCurrency] = useState<'USD' | 'KES'>(() => {
        return (localStorage.getItem('converter_display_currency') as 'USD' | 'KES') || 'USD';
    });
    const [rate, setRate] = useState<number>(() => {
        return parseFloat(localStorage.getItem('converter_kes_rate') || '129.5');
    });

    // Reset balance state
    const [isResettingBalance, setIsResettingBalance] = useState(false);
    const [resetMessage, setResetMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Balance visibility state
    const [isBalanceVisible, setIsBalanceVisible] = useState(() => {
        return localStorage.getItem('is_balance_visible') !== 'false';
    });

    const toggleBalanceVisibility = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsBalanceVisible(prev => {
            const next = !prev;
            localStorage.setItem('is_balance_visible', String(next));
            return next;
        });
    }, []);

    useEffect(() => {
        const handleSync = () => {
            setDisplayCurrency((localStorage.getItem('converter_display_currency') as 'USD' | 'KES') || 'USD');
            setRate(parseFloat(localStorage.getItem('converter_kes_rate') || '129.5'));
        };
        window.addEventListener('currency_changed', handleSync);
        return () => window.removeEventListener('currency_changed', handleSync);
    }, []);

    useEffect(() => {
        let isMounted = true;
        DerivAccountWalletService.getAccountNickname()
            .then(nick => {
                if (isMounted && nick) setUserNickname(nick);
            })
            .catch(() => {});

        DerivAccountWalletService.getWallets(displayCurrency)
            .then(w => {
                if (isMounted && w) setWallets(w);
            })
            .catch(() => {});

        return () => {
            isMounted = false;
        };
    }, [displayCurrency, isOpen]);

    const is_bot_running = run_panel?.is_running || api_base.is_running;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    const toggleDropdown = useCallback(() => {
        if (is_bot_running) return;
        setIsOpen(prev => !prev);
    }, [is_bot_running]);

    const handleAccountSelect = useCallback(
        (loginid: string) => {
            localStorage.setItem('active_loginid', loginid);
            client?.checkAndRegenerateWebSocket();
            setIsOpen(false);
        },
        [client]
    );

    // Reset demo balance handler
    const handleResetBalance = useCallback(
        async (e: React.MouseEvent) => {
            e.stopPropagation();
            if (isResettingBalance) return;

            setIsResettingBalance(true);
            setResetMessage(null);

            let success = false;
            let errorMessage = '';

            try {
                const { OAuthTokenExchangeService } = await import('@/services/oauth-token-exchange.service');
                const { getAppId } = await import('@/components/shared/utils/config/config');
                const { getAccountsList } = await import('@/utils/token-bridge');

                // Method 1: Deriv Options REST API (Official Reset Demo Balance)
                const authInfo = OAuthTokenExchangeService.getAuthInfo();
                const appId = getAppId() || '121856';
                const currentLoginId = activeLoginid || localStorage.getItem('active_loginid') || client?.loginid;

                if (authInfo?.access_token && currentLoginId) {
                    try {
                        const res = await fetch(
                            `https://api.derivws.com/trading/v1/options/accounts/${encodeURIComponent(currentLoginId)}/reset-demo-balance`,
                            {
                                method: 'POST',
                                headers: {
                                    'Deriv-App-ID': appId,
                                    'Authorization': `Bearer ${authInfo.access_token}`,
                                    'Content-Type': 'application/json',
                                },
                            }
                        );

                        if (res.ok || res.status === 200) {
                            success = true;
                        } else {
                            const errData = await res.json().catch(() => null);
                            if (errData?.errors?.[0]?.message) {
                                errorMessage = errData.errors[0].message;
                            }
                        }
                    } catch (restErr: any) {
                        console.warn('[AccountSwitcher] REST reset failed, trying WebSocket:', restErr);
                    }
                }

                // Method 2: Deriv Classic WebSocket topup_virtual
                if (!success && api_base.api) {
                    try {
                        const response = (await api_base.api.send({ topup_virtual: 1 })) as any;
                        if (response?.error) {
                            errorMessage = response.error.message;
                        } else if (response?.topup_virtual) {
                            success = true;
                        }
                    } catch (wsErr: any) {
                        errorMessage = wsErr?.message || errorMessage;
                    }
                }

                // Method 3: Standalone WebSocket with demo token if stored
                if (!success) {
                    try {
                        const accountsList = getAccountsList();
                        const demoToken = currentLoginId ? accountsList[currentLoginId] : null;
                        if (demoToken && !demoToken.startsWith('ory_at_')) {
                            const { DerivClient } = await import('@/pages/copy-trading/copy-trading-manager');
                            const standalone = new DerivClient();
                            await standalone.connectAndAuthorize(demoToken);
                            if (standalone.ws && standalone.ws.readyState === WebSocket.OPEN) {
                                await new Promise<void>((resolve, reject) => {
                                    const handler = (event: MessageEvent) => {
                                        try {
                                            const data = JSON.parse(event.data);
                                            if (data.msg_type === 'topup_virtual') {
                                                standalone.ws?.removeEventListener('message', handler);
                                                if (data.error) {
                                                    reject(new Error(data.error.message));
                                                } else {
                                                    resolve();
                                                }
                                            }
                                        } catch {}
                                    };
                                    standalone.ws?.addEventListener('message', handler);
                                    standalone.ws?.send(JSON.stringify({ topup_virtual: 1 }));
                                    setTimeout(() => reject(new Error('Topup timeout')), 8000);
                                });
                                standalone.disconnect();
                                success = true;
                            }
                        }
                    } catch (standaloneErr: any) {
                        if (!errorMessage) errorMessage = standaloneErr?.message;
                    }
                }

                if (success) {
                    setResetMessage({
                        type: 'success',
                        text: localize('Balance reset to 10,000.00 USD'),
                    });
                    // Refresh balance
                    if (api_base.api) {
                        try {
                            await api_base.api.send({ balance: 1 });
                        } catch {}
                    }
                    client?.checkAndRegenerateWebSocket();
                } else {
                    setResetMessage({
                        type: 'error',
                        text: errorMessage || localize('Failed to reset balance. Balance may already be 10,000 USD.'),
                    });
                }
            } catch (error: any) {
                setResetMessage({
                    type: 'error',
                    text: error?.message || localize('Failed to reset balance'),
                });
            } finally {
                setIsResettingBalance(false);
                setTimeout(() => setResetMessage(null), 4000);
            }
        },
        [isResettingBalance, client, activeLoginid]
    );

    const formattedAccounts = useMemo(() => {
        if (!accountList) return [];
        return accountList
            .map(account => {
                const accCurr = account.currency || 'USD';
                const balanceNum = Number(account.balance ?? 0);
                const displayBal =
                    displayCurrency === 'KES' && accCurr === 'USD'
                        ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                              balanceNum * rate
                          )
                        : addComma(balanceNum.toFixed(getDecimalPlaces(accCurr)));
                const displayCurr =
                    displayCurrency === 'KES' && accCurr === 'USD' ? 'KES' : getCurrencyDisplayCode(accCurr);

                return {
                    loginid: account.loginid,
                    currency: account.currency ? displayCurr : '',
                    rawCurrency: accCurr,
                    balance: displayBal,
                    isVirtual: isDemoAccount(account.loginid),
                    isActive: account.loginid === activeLoginid,
                };
            })
            .sort((a, b) => (a.isActive ? -1 : b.isActive ? 1 : 0));
    }, [accountList, activeLoginid, displayCurrency, rate]);

    const realAccounts = formattedAccounts.filter(a => !a.isVirtual);
    const demoAccounts = formattedAccounts.filter(a => a.isVirtual);
    const tabAccounts = activeTab === 'real' ? realAccounts : demoAccounts;

    if (!activeAccount) return null;

    const { currency, isVirtual, balance } = activeAccount;
    const showChevron = !is_bot_running;

    // ─── Format balance for header chip ──────────────────────────────────────
    const chipBalance = (() => {
        if (!currency) return localize('No currency');
        const accCurr = currency || 'USD';
        if (displayCurrency === 'KES' && accCurr === 'USD') {
            const num = parseFloat((balance || '0').replace(/,/g, '')) || 0;
            const converted = num * rate;
            return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(converted)} KES`;
        }
        return `${balance} ${getCurrencyDisplayCode(accCurr)}`;
    })();

    // Sync active tab with active account type
    useEffect(() => {
        setActiveTab(isVirtual ? 'demo' : 'real');
    }, [isVirtual]);

    return (
        <div className='acc-info__wrapper' ref={wrapperRef}>
            <AccountInfoWrapper>
                {/* ── Header Account Button ──────────────────────────────── */}
                <div
                    data-testid='dt_acc_info'
                    id='dt_core_account-info_acc-info'
                    role={showChevron ? 'button' : undefined}
                    tabIndex={showChevron ? 0 : -1}
                    aria-expanded={showChevron ? isOpen : undefined}
                    aria-haspopup={showChevron ? 'listbox' : undefined}
                    className={classNames('acc-chip', {
                        'acc-chip--virtual': isVirtual,
                        'acc-chip--interactive': showChevron,
                        'acc-chip--open': isOpen,
                    })}
                    onClick={toggleDropdown}
                    onKeyDown={e => {
                        if (showChevron && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            toggleDropdown();
                        }
                    }}
                >
                    {/* Currency circle icon */}
                    <div className={classNames('acc-chip__currency-icon', {
                        'acc-chip__currency-icon--demo': isVirtual,
                        'acc-chip__currency-icon--real': !isVirtual,
                    })}>
                        {isVirtual ? (
                            <span className='acc-icon__letter' style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>D</span>
                        ) : (
                            <img
                                src={realAccountImg}
                                alt='Real Account'
                                className='acc-chip__real-img'
                            />
                        )}
                    </div>

                    {/* Two-line text block */}
                    <div className='acc-chip__text-block'>
                        {/* Line 1: Account label + chevron */}
                        <div className='acc-chip__label-row'>
                            <span className='acc-chip__account-label'>
                                {isVirtual ? localize('Demo account') : (
                                    <>
                                        <span className='acc-chip__real-label'>Real</span>
                                        {currency && <span className='acc-chip__real-currency'>· {getCurrencyDisplayCode(currency)}</span>}
                                    </>
                                )}
                            </span>
                            {showChevron && (
                                <svg
                                    className={classNames('acc-chip__chevron', {
                                        'acc-chip__chevron--open': isOpen,
                                    })}
                                    width='10'
                                    height='10'
                                    viewBox='0 0 12 12'
                                    fill='none'
                                >
                                    <path
                                        d='M2 4L6 8L10 4'
                                        stroke='currentColor'
                                        strokeWidth='1.8'
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                    />
                                </svg>
                            )}
                        </div>

                        {/* Line 2: Balance */}
                        <span
                            data-testid='dt_balance'
                            className={classNames('acc-chip__balance', {
                                'acc-chip__balance--no-currency': !currency && !isVirtual,
                            })}
                        >
                            {isBalanceVisible ? chipBalance : '••••'}
                        </span>
                    </div>

                    {/* Eye toggle button */}
                    <button
                        type='button'
                        className='acc-chip__visibility-btn'
                        onClick={toggleBalanceVisibility}
                        aria-label={isBalanceVisible ? 'Hide balance' : 'Show balance'}
                    >
                        {isBalanceVisible ? (
                            <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                                <path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' />
                                <circle cx='12' cy='12' r='3' />
                            </svg>
                        ) : (
                            <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                                <path d='M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' />
                                <line x1='1' y1='1' x2='23' y2='23' />
                            </svg>
                        )}
                    </button>
                </div>
            </AccountInfoWrapper>

            {/* ── Dropdown Panel ──────────────────────────────────────────── */}
            {isOpen && (
                <div className='acc-panel' role='dialog' aria-label={localize('Account switcher')}>
                    {/* Real / Demo / Wallets tab toggle */}
                    <div className='acc-panel__tabs'>
                        <button
                            className={classNames('acc-panel__tab', {
                                'acc-panel__tab--active-real': activeTab === 'real',
                                'acc-panel__tab--inactive': activeTab !== 'real',
                            })}
                            onClick={() => setActiveTab('real')}
                            id='acc-tab-real'
                        >
                            <Localize i18n_default_text='Real' />
                            {activeTab === 'real' && <span className='acc-panel__tab-underline acc-panel__tab-underline--real' />}
                        </button>
                        <button
                            className={classNames('acc-panel__tab', {
                                'acc-panel__tab--active-demo': activeTab === 'demo',
                                'acc-panel__tab--inactive': activeTab !== 'demo',
                            })}
                            onClick={() => setActiveTab('demo')}
                            id='acc-tab-demo'
                        >
                            <Localize i18n_default_text='Demo' />
                            {activeTab === 'demo' && <span className='acc-panel__tab-underline acc-panel__tab-underline--demo' />}
                        </button>
                        <button
                            className={classNames('acc-panel__tab', {
                                'acc-panel__tab--active-wallets': activeTab === 'wallets',
                                'acc-panel__tab--inactive': activeTab !== 'wallets',
                            })}
                            onClick={() => setActiveTab('wallets')}
                            id='acc-tab-wallets'
                        >
                            <Localize i18n_default_text='Wallets' />
                            {activeTab === 'wallets' && <span className='acc-panel__tab-underline acc-panel__tab-underline--wallets' />}
                        </button>
                    </div>

                    {/* Account / Wallet list */}
                    <div className='acc-panel__body'>
                        <p className='acc-panel__section-label'>
                            {activeTab === 'wallets'
                                ? localize('Deriv Wallets')
                                : userNickname
                                ? `${localize('Deriv accounts')} (${userNickname})`
                                : localize('Deriv accounts')}
                        </p>

                        {activeTab === 'wallets' ? (
                            wallets.length === 0 ? (
                                <p className='acc-panel__empty'>
                                    <Localize i18n_default_text='No wallets found' />
                                </p>
                            ) : (
                                <div className='acc-panel__account-list' role='listbox'>
                                    {wallets.map(wallet => (
                                        <div
                                            key={wallet.wallet_id}
                                            role='option'
                                            aria-selected={wallet.is_default}
                                            tabIndex={0}
                                            className='acc-panel__account'
                                            onClick={() => {
                                                window.open('https://app.deriv.com/wallets', '_blank');
                                                setIsOpen(false);
                                            }}
                                        >
                                            <div className='acc-panel__account-icon'>
                                                <WalletIcon />
                                            </div>
                                            <div className='acc-panel__account-info'>
                                                <span className='acc-panel__account-name'>
                                                    {wallet.wallet_type.toUpperCase()} WALLET
                                                </span>
                                                <span className='acc-panel__account-id'>
                                                    {wallet.currency}
                                                </span>
                                            </div>
                                            <span className='acc-panel__account-balance'>
                                                {displayCurrency === 'KES' && wallet.currency === 'USD'
                                                    ? `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(wallet.balance * rate)} KES`
                                                    : `${wallet.balance.toFixed(2)} ${wallet.currency}`}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )
                        ) : tabAccounts.length === 0 ? (
                            <p className='acc-panel__empty'>
                                {activeTab === 'real'
                                    ? localize('No real accounts')
                                    : localize('No demo accounts')}
                            </p>
                        ) : (
                            <div className='acc-panel__account-list' role='listbox'>
                                {tabAccounts.map(account => (
                                    <div
                                        key={account.loginid}
                                        role='option'
                                        aria-selected={account.isActive}
                                        tabIndex={0}
                                        className={classNames('acc-panel__account', {
                                            'acc-panel__account--active': account.isActive,
                                        })}
                                        onClick={() => !account.isActive && handleAccountSelect(account.loginid)}
                                        onKeyDown={e => {
                                            if (!account.isActive && (e.key === 'Enter' || e.key === ' ')) {
                                                e.preventDefault();
                                                handleAccountSelect(account.loginid);
                                            }
                                        }}
                                    >
                                        {/* Icon */}
                                        <div className='acc-panel__account-icon'>
                                            {account.isVirtual ? (
                                                <DemoIcon />
                                            ) : (
                                                <RealIcon src={realAccountImg} />
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div className='acc-panel__account-info'>
                                            <span className='acc-panel__account-name'>
                                                {account.isVirtual
                                                    ? localize('Demo')
                                                    : getCurrencyLabel(account.rawCurrency)}
                                            </span>
                                            <span className='acc-panel__account-id'>
                                                {account.loginid.slice(0, 10)}..
                                            </span>
                                        </div>

                                        {/* Balance */}
                                        <span className='acc-panel__account-balance'>
                                            {account.currency
                                                ? `${account.balance} ${account.currency}`
                                                : localize('No currency')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer actions */}
                    <div className='acc-panel__footer'>
                        <button
                            className='acc-panel__manage-btn'
                            onClick={() => {
                                window.open('https://app.deriv.com/account/personal-details', '_blank');
                                setIsOpen(false);
                            }}
                            id='acc-manage-accounts-btn'
                        >
                            <Localize i18n_default_text='manage accounts' />
                        </button>

                        <div className='acc-panel__footer-right'>
                            {activeTab === 'demo' && demoAccounts.length > 0 && (
                                <button
                                    className={classNames('acc-panel__reset-btn', {
                                        'acc-panel__reset-btn--loading': isResettingBalance,
                                    })}
                                    onClick={handleResetBalance}
                                    disabled={isResettingBalance}
                                    id='acc-reset-balance-btn'
                                >
                                    {isResettingBalance ? (
                                        <>
                                            <svg
                                                className='acc-panel__reset-spinner'
                                                viewBox='0 0 24 24'
                                                width='14'
                                                height='14'
                                            >
                                                <circle
                                                    cx='12'
                                                    cy='12'
                                                    r='10'
                                                    stroke='currentColor'
                                                    strokeWidth='2.5'
                                                    strokeLinecap='round'
                                                    strokeDasharray='31.416'
                                                    strokeDashoffset='10'
                                                    fill='none'
                                                />
                                            </svg>
                                            <Localize i18n_default_text='Resetting...' />
                                        </>
                                    ) : (
                                        <>
                                            <svg
                                                width='14'
                                                height='14'
                                                viewBox='0 0 24 24'
                                                fill='none'
                                                stroke='currentColor'
                                                strokeWidth='2.2'
                                                strokeLinecap='round'
                                                strokeLinejoin='round'
                                            >
                                                <path d='M1 4v6h6' />
                                                <path d='M3.51 15a9 9 0 102.13-9.36L1 10' />
                                            </svg>
                                            <Localize i18n_default_text='Reset Balance' />
                                        </>
                                    )}
                                </button>
                            )}

                            <button
                                className='acc-panel__logout-btn'
                                onClick={async () => {
                                    setIsOpen(false);
                                    await client?.logout();
                                }}
                                id='acc-logout-btn'
                            >
                                <Localize i18n_default_text='Logout' />
                                <svg
                                    width='18'
                                    height='18'
                                    viewBox='0 0 24 24'
                                    fill='none'
                                    stroke='currentColor'
                                    strokeWidth='2'
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                    className='acc-panel__logout-icon'
                                >
                                    <path d='M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4' />
                                    <polyline points='16 17 21 12 16 7' />
                                    <line x1='21' y1='12' x2='9' y2='12' />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Reset message toast */}
                    {resetMessage && (
                        <div
                            className={classNames('acc-panel__toast', {
                                'acc-panel__toast--success': resetMessage.type === 'success',
                                'acc-panel__toast--error': resetMessage.type === 'error',
                            })}
                        >
                            {resetMessage.text}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

export default AccountSwitcher;
