import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { resolveValidDerivWSToken, isInvalidBearerToken } from '@/utils/token-bridge';
import { V2GetActiveClientId } from '@/external/bot-skeleton/services/api/appId';
import { getAppId } from '@/components/shared/utils/config/config';
import { generateOAuthURL } from '@/components/shared';
import { Loader2 } from 'lucide-react';
import './dtrader-iframe-container.scss';

const DTRADER_BASE_URL = 'https://deriv-dtrader-ten.vercel.app';

interface DTraderIframeContainerProps {
    className?: string;
}

/**
 * Deeply extracts the active Deriv session & all accounts from all possible storage locations.
 * Ensures synchronous resolution so initial render and iframe src already contain the credentials.
 */
const extractCurrentSession = () => {
    let loginid = '';
    let token = '';
    let currency = 'USD';
    const accounts: Record<string, string> = {};

    try {
        // 1. Scan accountsList
        const rawAccountsList = localStorage.getItem('accountsList');
        if (rawAccountsList) {
            const parsed = JSON.parse(rawAccountsList);
            if (parsed && typeof parsed === 'object') {
                for (const k in parsed) {
                    const t = typeof parsed[k] === 'string' ? parsed[k] : parsed[k]?.token;
                    if (t && !isInvalidBearerToken(t)) {
                        accounts[k] = t;
                    }
                }
            }
        }
    } catch {}

    try {
        // 2. Scan client.accounts & clientAccounts
        const rawClientAccounts = localStorage.getItem('client.accounts') || localStorage.getItem('clientAccounts');
        if (rawClientAccounts) {
            const parsed = JSON.parse(rawClientAccounts);
            if (parsed && typeof parsed === 'object') {
                for (const k in parsed) {
                    const t = parsed[k]?.token || (typeof parsed[k] === 'string' ? parsed[k] : '');
                    if (t && !isInvalidBearerToken(t)) {
                        accounts[k] = t;
                    }
                    if (parsed[k]?.currency) {
                        currency = parsed[k].currency;
                    }
                }
            }
        }
    } catch {}

    try {
        // 3. Scan client_account_details
        const rawDetails = localStorage.getItem('client_account_details');
        if (rawDetails) {
            const parsed = JSON.parse(rawDetails);
            if (Array.isArray(parsed)) {
                parsed.forEach(item => {
                    const id = item?.loginid || item?.account_id;
                    const t = item?.token;
                    if (id && t && !isInvalidBearerToken(t)) {
                        accounts[id] = t;
                    }
                    if (item?.currency) {
                        currency = item.currency;
                    }
                });
            }
        }
    } catch {}

    // 4. Scan acct1..acct10 & token1..token10
    for (let i = 1; i <= 10; i++) {
        const a = localStorage.getItem(`acct${i}`) || sessionStorage.getItem(`acct${i}`);
        const t = localStorage.getItem(`token${i}`) || sessionStorage.getItem(`token${i}`);
        if (a && t && !isInvalidBearerToken(t)) {
            accounts[a] = t;
        }
    }

    // 5. Determine active loginid
    loginid =
        localStorage.getItem('active_loginid') ||
        localStorage.getItem('client.loginid') ||
        localStorage.getItem('acct1') ||
        sessionStorage.getItem('active_loginid') ||
        sessionStorage.getItem('acct1') ||
        V2GetActiveClientId() ||
        '';

    // If active loginid is still empty, pick the first account key (preferring real account)
    if (!loginid && Object.keys(accounts).length > 0) {
        const keys = Object.keys(accounts);
        loginid = keys.find(k => !k.startsWith('VR')) || keys[0];
    }

    // 6. Determine active token
    if (loginid && accounts[loginid]) {
        token = accounts[loginid];
    } else {
        token =
            localStorage.getItem('token1') ||
            localStorage.getItem('active_token') ||
            localStorage.getItem('authToken') ||
            localStorage.getItem('token') ||
            sessionStorage.getItem('token1') ||
            sessionStorage.getItem('active_token') ||
            '';
        if ((!token || isInvalidBearerToken(token)) && Object.keys(accounts).length > 0) {
            token = accounts[Object.keys(accounts)[0]] || '';
        }
    }

    // 7. Currency fallback
    const storedCur = localStorage.getItem('currency') || localStorage.getItem('cur1');
    if (storedCur) currency = storedCur;

    return { loginid, token, currency, accounts };
};

export const DTraderIframeContainer: React.FC<DTraderIframeContainerProps> = observer(({ className = '' }) => {
    const { client } = useStore();
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isLoading, setIsLoading] = useState(true);

    const [sessionData, setSessionData] = useState(() => {
        const current = extractCurrentSession();
        return {
            loginid: client?.loginid || current.loginid,
            token: client?.token || current.token,
            currency: client?.currency || current.currency,
            accounts: current.accounts,
        };
    });

    const activeAppId = useMemo(() => {
        const appId = getAppId();
        if (appId && /^\d+$/.test(appId)) {
            return appId;
        }
        return '121856';
    }, []);

    // Sync session on mount, store updates, and account switch events
    const refreshSession = useCallback(async () => {
        const current = extractCurrentSession();
        const activeId = client?.loginid || current.loginid;
        let activeTok = client?.token || current.token;

        if (activeId && (!activeTok || isInvalidBearerToken(activeTok))) {
            const resolved = await resolveValidDerivWSToken(activeId);
            if (resolved) activeTok = resolved;
        }

        setSessionData({
            loginid: activeId,
            token: activeTok,
            currency: client?.currency || current.currency,
            accounts: current.accounts,
        });
    }, [client?.loginid, client?.token, client?.currency]);

    useEffect(() => {
        refreshSession();

        const handleStorageOrAuthChange = () => {
            refreshSession();
        };

        window.addEventListener('account_switched', handleStorageOrAuthChange);
        window.addEventListener('storage', handleStorageOrAuthChange);
        window.addEventListener('session_updated', handleStorageOrAuthChange);

        return () => {
            window.removeEventListener('account_switched', handleStorageOrAuthChange);
            window.removeEventListener('storage', handleStorageOrAuthChange);
            window.removeEventListener('session_updated', handleStorageOrAuthChange);
        };
    }, [refreshSession]);

    const activeLoginId = sessionData.loginid;
    const activeToken = sessionData.token;
    const currency = sessionData.currency || 'USD';
    const isDemo = activeLoginId.startsWith('VR') || activeLoginId.toLowerCase().includes('demo');
    const isAuthenticated = Boolean(activeLoginId && activeToken);

    // Automatic login redirection if user has no session stored yet
    useEffect(() => {
        if (!isAuthenticated && !activeToken) {
            const hasAttempted = sessionStorage.getItem('dtrader_auto_login_attempted');
            if (!hasAttempted) {
                sessionStorage.setItem('dtrader_auto_login_attempted', 'true');
                generateOAuthURL().then(oauthUrl => {
                    if (oauthUrl) {
                        window.location.replace(oauthUrl);
                    }
                }).catch(() => {});
            }
        }
    }, [isAuthenticated, activeToken]);

    // Build the query URL ensuring credentials & embed flags are passed for auto-login
    const iframeSrc = useMemo(() => {
        const params = new URLSearchParams();

        // 1. Mandatory token parameter (bypasses anti-clickjack):
        params.set('token', activeToken || '');

        // 2. Overridden App ID and Client ID
        params.set('app_id', activeAppId);
        params.set('client_id', activeAppId);

        // 3. User account details for automatic login
        if (activeLoginId && activeToken) {
            params.set('loginid', activeLoginId);
            params.set('account', activeLoginId);
            params.set('acct1', activeLoginId);
            params.set('token1', activeToken);
            params.set('cur1', currency);
        }

        // 4. Secondary accounts mapped from storage
        try {
            let index = 1;
            for (const accId in sessionData.accounts) {
                const accToken = sessionData.accounts[accId];
                if (accToken && accId !== activeLoginId) {
                    index++;
                    params.set(`acct${index}`, accId);
                    params.set(`token${index}`, accToken);
                    params.set(`cur${index}`, currency || 'USD');
                }
            }
        } catch {}

        // 5. Environment & theme flags - hide login, signup and top header
        params.set('theme', 'dark');
        params.set('lang', 'EN');
        params.set('embed', 'true');
        params.set('is_embedded', 'true');
        params.set('standalone', 'true');
        params.set('hide_header', 'true');
        params.set('hideHeader', 'true');
        params.set('hide_login', 'true');
        params.set('hide_signup', 'true');
        params.set('has_top_bar', 'false');

        return `${DTRADER_BASE_URL}/?${params.toString()}`;
    }, [activeAppId, activeLoginId, activeToken, currency, sessionData.accounts]);

    // Dispatch authentication postMessage directly into iframe on load or account switch
    const syncSessionToIframe = useCallback(() => {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow) return;

        const sessionPayload = {
            loginid: activeLoginId,
            loginId: activeLoginId,
            acct1: activeLoginId,
            token: activeToken,
            token1: activeToken,
            currency,
            cur1: currency,
            isDemo,
            appId: activeAppId,
            app_id: activeAppId,
            theme: 'dark',
            standalone: true,
            embed: true,
            is_embedded: true,
            hideHeader: true,
            hide_login: true,
            hide_signup: true,
        };

        const targetOrigin = (() => {
            try {
                return new URL(DTRADER_BASE_URL).origin;
            } catch {
                return '*';
            }
        })();

        const safePost = (msg: any) => {
            try {
                iframe.contentWindow?.postMessage(msg, targetOrigin);
            } catch {
                try {
                    iframe.contentWindow?.postMessage(msg, '*');
                } catch {}
            }
        };

        safePost({ type: 'SESSION_DATA', ...sessionPayload });
        safePost({ type: 'DERIV_AUTH', ...sessionPayload });
        safePost({ type: 'AUTH_TOKEN', ...sessionPayload });
        safePost({ action: 'setToken', ...sessionPayload });
        safePost({ action: 'login', ...sessionPayload });
        safePost({ action: 'SYNC_SESSION', ...sessionPayload });
    }, [activeLoginId, activeToken, activeAppId, currency, isDemo]);

    // Listen for iframe readiness messages to respond with session data immediately
    useEffect(() => {
        const handleIframeMessage = (event: MessageEvent) => {
            if (!event.data) return;
            const data = typeof event.data === 'string' ? (() => {
                try { return JSON.parse(event.data); } catch { return null; }
            })() : event.data;

            const type = data?.type || data?.action || '';
            if (
                type === 'IFRAME_READY' ||
                type === 'BRIDGE_READY' ||
                type === 'REQUEST_AUTH' ||
                type === 'REQUEST_SESSION' ||
                type === 'PING'
            ) {
                syncSessionToIframe();
            }
        };

        window.addEventListener('message', handleIframeMessage);
        return () => window.removeEventListener('message', handleIframeMessage);
    }, [syncSessionToIframe]);

    const handleIframeLoad = () => {
        setIsLoading(false);
        syncSessionToIframe();

        // Repeat session broadcast at intervals to ensure React tree inside iframe ingests tokens
        const t1 = setTimeout(syncSessionToIframe, 400);
        const t2 = setTimeout(syncSessionToIframe, 1200);
        const t3 = setTimeout(syncSessionToIframe, 2500);
        const t4 = setTimeout(syncSessionToIframe, 4500);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
            clearTimeout(t4);
        };
    };

    return (
        <div className={`dtrader-container ${className}`}>
            {/* Iframe Viewport Container (Edge-to-edge, no texts above) */}
            <div className='dtrader-container__frame-wrapper'>
                {isLoading && (
                    <div className='dtrader-container__loader'>
                        <Loader2 className='animate-spin' size={32} style={{ color: '#ff444f' }} />
                        <span className='loader-sub'>Loading DTrader...</span>
                    </div>
                )}

                {/* Seamlessly mask the iframe's internal top-right auth buttons when unauthenticated */}
                {!isAuthenticated && <div className='dtrader-container__auth-mask' />}

                <iframe
                    ref={iframeRef}
                    key={iframeSrc}
                    src={iframeSrc}
                    title='Deriv DTrader'
                    className='dtrader-container__iframe'
                    sandbox='allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads'
                    allow='autoplay; clipboard-write; camera; microphone; geolocation'
                    onLoad={handleIframeLoad}
                />
            </div>
        </div>
    );
});

export default DTraderIframeContainer;
