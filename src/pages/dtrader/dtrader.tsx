import React, { useState, useCallback, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { getAppId } from '@/components/shared/utils/config/config';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import { ExternalLink, TrendingUp, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import './dtrader.scss';

type LaunchState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * DTraderPage — OAuth 2.0 launcher.
 *
 * The previous implementation embedded trader.deriv.com in an <iframe> and
 * forwarded session tokens via postMessage. This is blocked by cross-origin
 * SameSite cookie restrictions — deriv.com cookies cannot be set when the
 * site is loaded inside a third-party iframe from profithub.co.ke.
 *
 * Instead, we open DTrader in a new tab on trader.deriv.com where the user
 * is already authenticated on Deriv's own origin.
 */
const DTraderPage: React.FC = observer(() => {
    const { client } = useStore();
    const [launchState, setLaunchState] = useState<LaunchState>('idle');
    const [errorMessage, setErrorMessage] = useState('');

    const loginid = client?.loginid || localStorage.getItem('active_loginid') || '—';
    const balance = client?.balance ?? '—';
    const currency = client?.currency || '';
    const isDemo = loginid.startsWith('VR');

    const handleOpen = useCallback(async () => {
        setLaunchState('loading');
        setErrorMessage('');
        try {
            const authInfo = OAuthTokenExchangeService.getAuthInfo();
            if (!authInfo?.access_token) {
                setErrorMessage('Session expired. Please log in again.');
                setLaunchState('error');
                return;
            }

            // Verify token validity via OTP endpoint
            await DerivWSAccountsService.fetchOTPWebSocketURL(authInfo.access_token, loginid);

            const appId = getAppId() || '121856';
            const params = new URLSearchParams({
                app_id: appId,
                chart_type: 'area',
                interval: '1t',
                symbol: '1HZ100V',
                trade_type: 'accumulator',
                lang: 'EN',
            });

            window.open(`https://trader.deriv.com?${params.toString()}`, '_blank', 'noopener,noreferrer');
            setLaunchState('ready');
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : 'Could not connect to Deriv. Please try again.');
            setLaunchState('error');
        }
    }, [loginid]);

    return (
        <div className="dtrader-page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: 'linear-gradient(135deg, #090d16 0%, #0d1321 50%, #0a0f1e 100%)', position: 'relative', overflow: 'hidden' }}>

            {/* Decorative glow */}
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(37,99,235,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, padding: '48px 32px', maxWidth: 480, width: '100%', position: 'relative', zIndex: 1 }}>

                {/* Icon + heading */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(37,99,235,0.35)' }}>
                        <TrendingUp size={36} color="#fff" />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <h2 style={{ color: '#f1f5f9', fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>DTrader Terminal</h2>
                        <p style={{ color: '#64748b', fontSize: 13, margin: '8px 0 0', lineHeight: 1.6 }}>
                            Opens securely in a new tab on{' '}
                            <span style={{ color: '#94a3b8' }}>trader.deriv.com</span>
                        </p>
                    </div>
                </div>

                {/* Account card */}
                <div style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backdropFilter: 'blur(8px)' }}>
                    <div>
                        <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Active Account</div>
                        <div style={{ color: '#f1f5f9', fontSize: 15, fontWeight: 600, marginTop: 4 }}>{loginid}</div>
                        <div style={{ marginTop: 4 }}>
                            <span style={{ background: isDemo ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)', color: isDemo ? '#f59e0b' : '#10b981', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, letterSpacing: '0.05em' }}>
                                {isDemo ? 'DEMO' : 'REAL'}
                            </span>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Balance</div>
                        <div style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, marginTop: 4 }}>{balance}</div>
                        <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{currency}</div>
                    </div>
                </div>

                {/* Status messages */}
                {launchState === 'error' && (
                    <div style={{ width: '100%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
                        <span style={{ color: '#fca5a5', fontSize: 13 }}>{errorMessage}</span>
                    </div>
                )}
                {launchState === 'ready' && (
                    <div style={{ width: '100%', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <CheckCircle size={16} color="#10b981" />
                        <span style={{ color: '#6ee7b7', fontSize: 13 }}>DTrader opened in a new tab.</span>
                    </div>
                )}

                {/* CTA */}
                <button
                    id="open-dtrader-page-btn"
                    onClick={handleOpen}
                    disabled={launchState === 'loading'}
                    style={{ width: '100%', padding: '14px 24px', borderRadius: 12, border: 'none', cursor: launchState === 'loading' ? 'not-allowed' : 'pointer', background: launchState === 'loading' ? 'rgba(37,99,235,0.5)' : 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)', color: '#fff', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'opacity 0.2s, transform 0.15s', boxShadow: launchState === 'loading' ? 'none' : '0 4px 20px rgba(37,99,235,0.4)' }}
                    onMouseEnter={e => { if (launchState !== 'loading') (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
                >
                    {launchState === 'loading' ? (
                        <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />Connecting…</>
                    ) : (
                        <><ExternalLink size={16} />Open DTrader</>
                    )}
                </button>

                <p style={{ color: '#475569', fontSize: 12, textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
                    DTrader runs on Deriv's domain where your session cookies are set correctly.
                    Cross-origin embedding is not supported by Deriv's platform.{' '}
                    <a href="https://developers.deriv.com/docs/" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'none' }}>Developer docs ↗</a>
                </p>
            </div>

            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
});

export default DTraderPage;
