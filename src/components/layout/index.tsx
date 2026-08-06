import { useEffect, useState, useRef, useCallback } from 'react';
import clsx from 'clsx';
import { observer } from 'mobx-react-lite';
import { Outlet } from 'react-router-dom';
import { api_base } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { useDevice } from '@deriv-com/ui';
import { crypto_currencies_display_order, fiat_currencies_display_order } from '../shared';
import Footer from './footer';
import AppHeader from './header';
import Body from './main-body';
import { RiskDisclaimer } from '../shared_ui/risk-disclaimer/risk-disclaimer';
import AccountInfoModal from './footer/AccountInfoModal';
import {
    getSiteConfig, SiteConfig, sendChatMessage, getChatMessages, ChatMessage,
} from '@/utils/supabase-copy';
import './layout.scss';

// ─── Floating Chat Widget ─────────────────────────────────────────────────────
const FloatingChat = () => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [draft, setDraft] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    // Open support chat automatically ONLY on user's first visit to the site
    useEffect(() => {
        const hasVisited = localStorage.getItem('ph_first_visit_done');
        if (!hasVisited) {
            setOpen(true);
        }
    }, []);

    const handleClose = () => {
        setOpen(false);
        localStorage.setItem('ph_first_visit_done', 'true');
    };

    // Use a stable loginid for the client
    const clientId = (() => {
        try {
            const accts = JSON.parse(localStorage.getItem('accountsList') || '{}');
            const keys = Object.keys(accts);
            return keys.length > 0 ? keys[0] : 'guest';
        } catch { return 'guest'; }
    })();

    const refreshMessages = useCallback(() => {
        setMessages(getChatMessages(clientId));
    }, [clientId]);

    useEffect(() => {
        if (!open) return;
        refreshMessages();
        const iv = setInterval(refreshMessages, 3000);
        return () => clearInterval(iv);
    }, [open, refreshMessages]);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    const handleSend = () => {
        const text = draft.trim();
        if (!text) return;
        sendChatMessage({ sender: 'client', loginid: clientId, text, timestamp: Date.now() });
        setDraft('');
        refreshMessages();
    };

    if (!open) return null;

    return (
        <div className='ph-chat-panel'>
            <div className='ph-chat-panel__header'>
                <div className='ph-chat-panel__hdr-left'>
                    <span className='ph-chat-panel__dot' />
                    <span>ProfitHub Support</span>
                </div>
                <button onClick={handleClose} className='ph-chat-panel__close' type='button'>
                    <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round'><line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/></svg>
                </button>
            </div>
            <div className='ph-chat-panel__body' ref={scrollRef}>
                {messages.length === 0 && (
                    <div className='ph-chat-panel__empty'>
                        <p>👋 Welcome! How can we help?</p>
                        <span>Send a message and our admin will reply shortly.</span>
                    </div>
                )}
                {messages.map(m => (
                    <div key={m.id} className={`ph-chat-bubble ph-chat-bubble--${m.sender}`}>
                        <span className='ph-chat-bubble__text'>{m.text}</span>
                        <span className='ph-chat-bubble__time'>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                ))}
            </div>
            <div className='ph-chat-panel__footer'>
                <input
                    type='text'
                    placeholder='Type a message…'
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                />
                <button onClick={handleSend} type='button' className='ph-chat-panel__send'>
                    <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'><line x1='22' y1='2' x2='11' y2='13'/><polygon points='22 2 15 22 11 13 2 9 22 2'/></svg>
                </button>
            </div>
        </div>
    );
};

// ─── Dynamic Theme Injector ───────────────────────────────────────────────────
const DynamicThemeStyle = () => {
    const [cfg, setCfg] = useState<any>(getSiteConfig());

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail as SiteConfig;
            if (detail) setCfg(detail);
        };
        window.addEventListener('profithub_config_changed', handler);
        // Also poll periodically in case the event was missed (cross-tab)
        const iv = setInterval(() => setCfg(getSiteConfig()), 5000);
        return () => {
            window.removeEventListener('profithub_config_changed', handler);
            clearInterval(iv);
        };
    }, []);

    // Load custom Google Font dynamically
    useEffect(() => {
        if (cfg.fontFamily) {
            const fontName = cfg.fontFamily.replace(/\s+/g, '+');
            let link = document.getElementById('ph-custom-font') as HTMLLinkElement;
            if (!link) {
                link = document.createElement('link');
                link.id = 'ph-custom-font';
                link.rel = 'stylesheet';
                document.head.appendChild(link);
            }
            link.href = `https://fonts.googleapis.com/css2?family=${fontName}:wght@300;400;500;600;700;800&display=swap`;
        }
    }, [cfg.fontFamily]);

    // Update Favicon dynamically
    useEffect(() => {
        if (cfg.faviconBase64) {
            let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }
            link.href = cfg.faviconBase64;
        }
    }, [cfg.faviconBase64]);

    const primary = cfg.primaryColor || '#f5c542';
    const secondary = cfg.secondaryColor || '#0e0e0e';
    const accent = cfg.accentColor || '#3b82f6';
    const fontFamily = cfg.fontFamily || 'Inter';

    const tabColor = cfg.tabColor || 'rgba(255,255,255,0.6)';
    const activeTabColor = cfg.activeTabColor || '#ffffff';
    
    const loginBg = cfg.loginBtnBg || 'transparent';
    const loginText = cfg.loginBtnText || '#ffffff';
    const signupBg = cfg.signupBtnBg || primary;
    const signupText = cfg.signupBtnText || '#000000';
    
    const runPanelBg = cfg.runPanelBg || '#0e0e0e';
    const runPanelText = cfg.runPanelText || '#ffffff';

    const css = `
        :root {
            --ph-primary: ${primary};
            --ph-secondary: ${secondary};
            --ph-accent: ${accent};
            --ph-font: '${fontFamily}', sans-serif;
            
            --ph-tab-color: ${tabColor};
            --ph-tab-active-color: ${activeTabColor};
            
            --ph-login-bg: ${loginBg};
            --ph-login-text: ${loginText};
            --ph-signup-bg: ${signupBg};
            --ph-signup-text: ${signupText};
            
            --ph-run-panel-bg: ${runPanelBg};
            --ph-run-panel-text: ${runPanelText};
        }
        
        body, html, button, input, select, textarea {
            font-family: '${fontFamily}', -apple-system, sans-serif !important;
        }

        /* Active & Inactive Tabs */
        .dc-tabs__item:not(.dc-tabs__active) {
            color: var(--ph-tab-color) !important;
        }
        .dc-tabs__active {
            color: var(--ph-tab-active-color) !important;
        }
        .dc-tabs__active-line {
            background: var(--ph-tab-active-color) !important;
        }

        /* Custom Login / Signup button overrides */
        .app-header__login-btn {
            background-color: var(--ph-login-bg) !important;
            color: var(--ph-login-text) !important;
            border: 1px solid var(--ph-login-text) !important;
        }
        .app-header__signup-btn {
            background-color: var(--ph-signup-bg) !important;
            color: var(--ph-signup-text) !important;
            border: 1px solid var(--ph-signup-bg) !important;
        }

        /* Run panel styles */
        body.theme--dark .run-panel, body.theme--dark .run-panel__container {
            background-color: var(--ph-run-panel-bg) !important;
            color: var(--ph-run-panel-text) !important;
        }
        body.theme--light .run-panel, body.theme--light .run-panel__container {
            background-color: var(--general-main-1) !important;
            color: var(--text-general) !important;
        }
        body.theme--light .run-panel .dc-tabs__item:not(.dc-tabs__active) {
            color: var(--text-less-prominent) !important;
        }
        body.theme--light .run-panel .dc-tabs__active {
            color: var(--text-prominent) !important;
        }
        body.theme--light .run-panel .dc-tabs__active-line {
            background: var(--text-prominent) !important;
        }
        body.theme--light .run-panel__tile-title {
            color: var(--text-less-prominent) !important;
        }
    `;

    return <style dangerouslySetInnerHTML={{ __html: css }} />;
};


// ─── Maintenance Mode Overlay ─────────────────────────────────────────────────
const MaintenanceOverlay = () => {
    const [cfg, setCfg] = useState<SiteConfig>(getSiteConfig());

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail as SiteConfig;
            if (detail) setCfg(detail);
        };
        window.addEventListener('profithub_config_changed', handler);
        const iv = setInterval(() => setCfg(getSiteConfig()), 5000);
        return () => {
            window.removeEventListener('profithub_config_changed', handler);
            clearInterval(iv);
        };
    }, []);

    if (!cfg.maintenanceMode) return null;

    return (
        <div className='ph-maintenance'>
            <div className='ph-maintenance__bg'>
                <div className='ph-maintenance__orb ph-maintenance__orb--1' />
                <div className='ph-maintenance__orb ph-maintenance__orb--2' />
                <div className='ph-maintenance__orb ph-maintenance__orb--3' />
            </div>
            <div className='ph-maintenance__card'>
                <div className='ph-maintenance__icon'>
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="url(#maint-grad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <defs>
                            <linearGradient id="maint-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#3b82f6" />
                                <stop offset="100%" stopColor="#8b5cf6" />
                            </linearGradient>
                        </defs>
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                    </svg>
                </div>
                <h1 className='ph-maintenance__title'>Under Maintenance</h1>
                <p className='ph-maintenance__message'>{cfg.maintenanceMessage}</p>
                <div className='ph-maintenance__progress'>
                    <div className='ph-maintenance__progress-bar' />
                </div>
                <p className='ph-maintenance__footer'>We&rsquo;ll be back shortly. Thank you for your patience.</p>
            </div>
        </div>
    );
};

const Layout = observer(() => {
    const [isAccountInfoOpen, setIsAccountInfoOpen] = useState(false);

    useEffect(() => {
        const handleOpen = () => setIsAccountInfoOpen(true);
        window.addEventListener('open_account_info', handleOpen);
        return () => window.removeEventListener('open_account_info', handleOpen);
    }, []);
    const { isDesktop } = useDevice();
    const store = useStore();
    const is_quick_strategy_active = store?.quick_strategy?.is_open;
    const isCallbackPage = window.location.pathname === '/callback';

    const checkClientAccount = JSON.parse(localStorage.getItem('clientAccounts') ?? '{}');
    const getQueryParams = new URLSearchParams(window.location.search);
    const currency = getQueryParams.get('account') ?? '';
    const accountsList = JSON.parse(localStorage.getItem('accountsList') ?? '{}');
    const isClientAccountsPopulated = Object.keys(accountsList).length > 0;
    const ifClientAccountHasCurrency =
        Object.values(checkClientAccount).some((account: any) => account.currency === currency) ||
        currency === 'demo' ||
        currency === '';
    const [clientHasCurrency, setClientHasCurrency] = useState(ifClientAccountHasCurrency);
    const [isAuthenticating, setIsAuthenticating] = useState(true); // Start with true to prevent flashing

    // Expose setClientHasCurrency to window for global access
    useEffect(() => {
        (window as any).setClientHasCurrency = setClientHasCurrency;

        return () => {
            delete (window as any).setClientHasCurrency;
        };
    }, []);

    const validCurrencies = [...fiat_currencies_display_order, ...crypto_currencies_display_order];
    const query_currency = (getQueryParams.get('account') ?? '')?.toUpperCase();
    const isCurrencyValid = validCurrencies.includes(query_currency);
    const api_accounts: any[][] = [];
    let subscription: { unsubscribe: () => void };

    const validateApiAccounts = ({ data }: any) => {
        //TO do work on this with account switcher
        if (data.msg_type === 'authorize') {
            const account_list = data?.authorize?.account_list || [];
            const account_list_filter = account_list.filter((acc: any) => acc.is_disabled === 0);
            api_accounts.push(account_list_filter || []);
            const allCurrencies = new Set(Object.values(checkClientAccount).map((acc: any) => acc.currency));

            // Skip disabled accounts when checking for missing currency
            const accounts = api_accounts.flat();
            const hasMissingCurrency = accounts.some(data => {
                if (!allCurrencies.has(data.currency)) {
                    sessionStorage.setItem('query_param_currency', data.currency);
                    return true;
                }
                return false;
            });

            let hasMissingToken = false;
            let missingTokenCurrency = '';

            for (const acc of account_list_filter) {
                if (acc.loginid && !accountsList[acc.loginid]) {
                    hasMissingToken = true;
                    missingTokenCurrency = acc.currency || '';
                    // Store the missing token's currency in session storage
                    if (missingTokenCurrency) {
                        sessionStorage.setItem('query_param_currency', missingTokenCurrency);
                    }
                    break;
                }
            }

            if (hasMissingCurrency || hasMissingToken) {
                setClientHasCurrency(false);
            } else {
                const account_list_ =
                    account_list_filter?.find((acc: { currency: string }) => acc.currency === currency) ||
                    account_list_filter?.[0];

                let session_storage_currency =
                    sessionStorage.getItem('query_param_currency') || account_list_?.currency || 'USD';

                session_storage_currency = `account=${session_storage_currency}`;
                setClientHasCurrency(true);
                if (!new URLSearchParams(window.location.search).has('account')) {
                    window.history.pushState({}, '', `${window.location.pathname}?${session_storage_currency}`);
                }

                setClientHasCurrency(true);
            }

            if (subscription) {
                subscription?.unsubscribe();
            }
        }
    };

    useEffect(() => {
        if (isCurrencyValid && api_base.api) {
            // Subscribe to the onMessage event
            const is_valid_currency = currency && validCurrencies.includes(currency.toUpperCase());
            if (!is_valid_currency) return;
            subscription = api_base.api.onMessage().subscribe(validateApiAccounts);
        }
    }, []);

    useEffect(() => {
        // Always set the currency in session storage, even if the user is not logged in
        // This ensures the currency is available on the callback page
        setIsAuthenticating(true);
        if (currency) {
            sessionStorage.setItem('query_param_currency', currency);
        }

        // Authentication is now handled by the OAuth flow
        setIsAuthenticating(false);
    }, [isClientAccountsPopulated, isCallbackPage, clientHasCurrency, currency]);

    // Add a state to track if initial authentication check is complete
    const [isInitialAuthCheckComplete, setIsInitialAuthCheckComplete] = useState(false);

    // Effect to mark initial auth check as complete after a short delay
    useEffect(() => {
        if (!isAuthenticating && !isInitialAuthCheckComplete) {
            // Wait a bit to ensure all state updates have propagated
            const timer = setTimeout(() => {
                setIsInitialAuthCheckComplete(true);
            }, 500); // Give it enough time to stabilize

            return () => clearTimeout(timer);
        }
    }, [isAuthenticating, isInitialAuthCheckComplete]);

    const isAdminPage = window.location.pathname.startsWith('/admin');

    return (
        <div
            className={clsx('layout', {
                responsive: isDesktop && !isAdminPage,
                'quick-strategy-active': is_quick_strategy_active && !isDesktop && !isAdminPage,
            })}
        >
            {/* Dynamic theme variables */}
            {!isAdminPage && <DynamicThemeStyle />}

            {/* Maintenance Mode Overlay (blocks client pages, not admin) */}
            {!isAdminPage && !isCallbackPage && <MaintenanceOverlay />}

            {!isCallbackPage && !isAdminPage && <AppHeader />}
            <Body>
                <Outlet />
            </Body>
            {!isCallbackPage && !isAdminPage && isDesktop && <Footer />}
            {!isAdminPage && <RiskDisclaimer />}
            <AccountInfoModal isOpen={isAccountInfoOpen} onClose={() => setIsAccountInfoOpen(false)} />

            {/* Floating Chat Widget (only on client-facing pages) */}
            {!isAdminPage && !isCallbackPage && <FloatingChat />}
        </div>
    );
});

export default Layout;
