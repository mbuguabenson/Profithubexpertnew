import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import './iframe-wrapper.scss';
import { V2GetActiveAccountId } from '@/external/bot-skeleton/services/api/appId';
import { resolveValidDerivWSToken } from '@/utils/token-bridge';
import { getAppId } from '@/components/shared/utils/config/config';
import { useStore } from '@/hooks/useStore';
import { contract_stages } from '@/constants/contract-stage';
import { ParentBridgeClient, DiagnosticsPanel } from '../iframe-bridge';

interface IframeWrapperProps {
    src: string;
    title: string;
    className?: string;
}

const IframeWrapper: React.FC<IframeWrapperProps> = observer(({ src, title, className = '' }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [hasError, setHasError] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [bridgeClient, setBridgeClient] = useState<ParentBridgeClient | null>(null);
    const { transactions, run_panel, client } = useStore();

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        // Verify stores are available
        if (!transactions || !run_panel) {
            console.warn(`⚠️ [${title}] Stores not available:`, {
                transactions: !!transactions,
                run_panel: !!run_panel,
                client: !!client,
            });
        } else {
            console.log(`✅ [${title}] Stores available:`, {
                transactions: !!transactions,
                run_panel: !!run_panel,
                client: !!client,
            });
        }

        // Initialize the new bridge client
        const bridge = new ParentBridgeClient();
        setBridgeClient(bridge);
        bridge.attach(iframe, '*');

        const sendLegacyAuthData = async () => {
            let loginid = V2GetActiveAccountId() || client?.loginid || localStorage.getItem('active_loginid') || localStorage.getItem('client.loginid') || '';
            const accountsList = JSON.parse(localStorage.getItem('accountsList') || '{}');
            let token = await resolveValidDerivWSToken(loginid);

            const isDemoToReal = localStorage.getItem('demo_to_real') === 'true';
            if (isDemoToReal && loginid && !loginid.startsWith('VR') && title !== 'DTrader Terminal') {
                 const demoAccountId = Object.keys(accountsList).find(k => k.startsWith('VR'));
                 if (demoAccountId) {
                     loginid = demoAccountId;
                     token = accountsList[demoAccountId] || token;
                 }
            }

            // IMPORTANT: If we use OAuth tokens (ory_at_...), we MUST pass the parent's App ID to the iframe.
            // Hardcoding legacy IDs will cause Deriv to reject the OAuth token.
            const appId = getAppId() || '121856';

            const effectiveLoginId = loginid || (client as any)?.active_account_loginid || localStorage.getItem('active_loginid');
            const effectiveToken = token || localStorage.getItem('token');

            if (!effectiveLoginId || !effectiveToken) return;

            if (iframe.contentWindow) {
                try {
                    const embedBase = process.env.DTRADER_URL ? `${process.env.DTRADER_URL}` : 'https://deriv-dtrader.vercel.app';
                    const authPayload = {
                        token: effectiveToken,
                        loginid: effectiveLoginId,
                        loginId: effectiveLoginId,
                        appId: appId,
                        server: 'green',
                        timestamp: Date.now(),
                        authMode: 'derivws_otp',
                        accountType: 'ZOOM',
                        currency: 'USD',
                        defaultSymbol: '1HZ100V',
                        embedBase,
                        iframeUrl: `${embedBase}/?acct1=${effectiveLoginId}&token1=${effectiveToken}&cur1=USD&api_version=v2&chart_type=area&interval=1t&symbol=1HZ100V&trade_type=accumulator&app_id=${appId}&lang=EN`
                    };

                    iframe.contentWindow.postMessage({ type: 'AUTH_TOKEN', ...authPayload }, '*');
                    iframe.contentWindow.postMessage({ type: 'DERIV_AUTH', ...authPayload }, '*');
                    iframe.contentWindow.postMessage({ action: 'setToken', ...authPayload }, '*');
                    iframe.contentWindow.postMessage({ action: 'init', ...authPayload }, '*');
                    iframe.contentWindow.postMessage({ action: 'login', ...authPayload }, '*');
                    iframe.contentWindow.postMessage({ type: 'BRIDGE_READY', ...authPayload }, '*');
                    iframe.contentWindow.postMessage({ type: 'AUTH_SUCCESS', ...authPayload }, '*');
                    iframe.contentWindow.postMessage({ type: 'SESSION_DATA', payload: authPayload }, '*');
                    
                    iframe.contentWindow.postMessage({ 
                        action: 'sync_client_data', 
                        payload: { client_accounts: JSON.parse(localStorage.getItem('client.accounts') || '{}') } 
                    }, '*');

                } catch (error) {
                    console.error('Error sending auth data to iframe:', error);
                }
            }
        };

        // Initial broadcasts for iframe terminals and bots that listen to postMessage
        iframe.addEventListener('load', sendLegacyAuthData);
        sendLegacyAuthData();
        setTimeout(sendLegacyAuthData, 500);
        setTimeout(sendLegacyAuthData, 1000);
        setTimeout(sendLegacyAuthData, 3000);
        setTimeout(sendLegacyAuthData, 5000);
        setTimeout(sendLegacyAuthData, 8000);

        const expectedOrigin = process.env.DTRADER_PROXY_URL || process.env.DTRADER_URL || 'https://deriv-dtrader.vercel.app';
        
        const allowedOrigins = [
            expectedOrigin,
            'https://trader.deriv.com',
            'https://app.deriv.com',
            'https://deriv-dtrader.vercel.app',
            'https://www.derivcircles.com',
            'https://bot-analysis-tool-belex.web.app',
            'https://analysisprofithub.vercel.app',
            'https://www.smartanalysistool.com',
            'https://dcircles.netlify.app',
            'https://dcircles-six.vercel.app',
            'https://xenontool.netlify.app',
            window.location.origin
        ];

        // Listen for messages from iframe (auth requests and trade events)
        const handleMessage = (event: MessageEvent) => {
            const isAllowed = allowedOrigins.includes(event.origin) || 
                              /^http:\/\/localhost(:\d+)?$/i.test(event.origin);

            if (!isAllowed) return;

            // Debug: Log all messages from iframe
            if (event.data) {
                // (Legacy support)
                // We used to blindly call sendLegacyAuthData() here for unrecognized messages.
                // DO NOT DO THAT! If the iframe emits periodic pings or state updates, 
                // blindly replying with 'login' commands creates a ping-pong loop that 
                // triggers Deriv API rate limits and causes 'Session expired' after a few minutes.
            }

            if (!event.data) return;

            // Handle trade events from Hyperbot iframe
            if (event.data.type === 'TRADE_PLACED' || event.data.type === 'CONTRACT_EVENT') {
                const tradeData = event.data;

                console.log(`📊 [${title}] Received trade event from iframe:`, tradeData);

                // Ignore trade events from DTrader to prevent Run Panel from popping up
                if (title === 'DTrader Terminal') {
                    return;
                }

                // Initialize run panel on first trade (like other bots do)
                if (run_panel && !run_panel.run_id) {
                    // Generate run_id based on title (e.g., "Hyperbot" -> "hyperbot", "Diffbot" -> "diffbot")
                    const botName = title.toLowerCase().replace(/\s+/g, '');
                    run_panel.run_id = `${botName}-${Date.now()}`;
                    run_panel.setIsRunning(true);
                    run_panel.setContractStage(contract_stages.STARTING);
                    console.log(`🚀 [${title}] Initialized run panel with run_id:`, run_panel.run_id);
                }

                // Add to transactions panel
                if (transactions?.onBotContractEvent && tradeData.contract_id) {
                    try {
                        const contractData = {
                            contract_id: tradeData.contract_id,
                            transaction_ids: tradeData.transaction_ids || {
                                buy:
                                    tradeData.transaction_id ||
                                    tradeData.buy_transaction_id ||
                                    tradeData.buy_transaction_id,
                                sell: tradeData.sell_transaction_id || tradeData.transaction_ids?.sell,
                            },
                            buy_price:
                                tradeData.buy_price || tradeData.price || tradeData.stake || tradeData.amount || 0,
                            currency: tradeData.currency || client?.currency || 'USD',
                            contract_type:
                                tradeData.contract_type ||
                                (title.toLowerCase().includes('matches')
                                    ? 'DIGITMATCH'
                                    : title.toLowerCase().includes('diffbot')
                                      ? 'DIGITDIFF'
                                      : title.toLowerCase().includes('speedbot')
                                        ? 'DIGITUNDER'
                                        : 'DIGITUNDER'),
                            underlying: tradeData.underlying || tradeData.symbol || '',
                            display_name: tradeData.display_name || tradeData.underlying || tradeData.symbol || '',
                            date_start: tradeData.date_start || Math.floor(Date.now() / 1000),
                            status: tradeData.status || 'open',
                            entry_tick_display_value:
                                tradeData.entry_tick_display_value ||
                                tradeData.entry_spot_display_value ||
                                tradeData.entry_tick ||
                                tradeData.entry_spot,
                            exit_tick_display_value:
                                tradeData.exit_tick_display_value ||
                                tradeData.exit_spot_display_value ||
                                tradeData.exit_tick ||
                                tradeData.exit_spot,
                            entry_tick_time: tradeData.entry_tick_time || tradeData.entry_spot_time,
                            exit_tick_time: tradeData.exit_tick_time || tradeData.exit_spot_time,
                            profit: tradeData.profit ?? tradeData.margin ?? tradeData.payout ?? undefined,
                            sell_price: tradeData.sell_price || tradeData.bid_price,
                            bid_price: tradeData.bid_price || tradeData.sell_price,
                            is_expired: tradeData.is_expired,
                            is_settleable: tradeData.is_settleable,
                            is_valid_to_sell: tradeData.is_valid_to_sell,
                            is_sold: tradeData.is_sold,
                        };

                        console.log(`📝 [${title}] Calling onBotContractEvent with:`, contractData);
                        transactions.onBotContractEvent(contractData);
                        console.log(`✅ [${title}] Added trade to Run Panel:`, contractData.contract_id);

                        // Update run panel state
                        if (run_panel) {
                            run_panel.setHasOpenContract(true);
                            run_panel.setContractStage(contract_stages.PURCHASE_SENT);
                            // Open run panel drawer if not already open
                            if (!run_panel.is_drawer_open) {
                                run_panel.toggleDrawer(true);
                            }
                            // Switch to transactions tab
                            run_panel.setActiveTabIndex(1);
                        }

                        // Verify transaction was added
                        setTimeout(() => {
                            const transactionList = transactions?.transactions || [];
                            console.log(`🔍 [${title}] Current transactions count:`, transactionList.length);
                            const found = transactionList.find(
                                (t: any) => t.data?.contract_id === contractData.contract_id
                            );
                            if (found) {
                                console.log(`✅ [${title}] Transaction confirmed in store:`, found);
                            } else {
                                console.warn(`⚠️ [${title}] Transaction not found in store!`);
                            }
                        }, 100);
                    } catch (error) {
                        console.error(`❌ [${title}] Error adding trade to Run Panel:`, error);
                        console.error(`❌ [${title}] Error details:`, error instanceof Error ? error.stack : error);
                    }
                } else {
                    console.warn(`⚠️ [${title}] Cannot add trade - missing transactions store or contract_id`);
                    console.warn(
                        `⚠️ [${title}] transactions:`,
                        !!transactions,
                        'onBotContractEvent:',
                        !!transactions?.onBotContractEvent,
                        'contract_id:',
                        tradeData.contract_id
                    );
                }
                return;
            }

            // Handle contract updates (when trades complete)
            if (event.data.type === 'CONTRACT_UPDATE') {
                const updateData = event.data;

                console.log(`🔄 [${title}] Received contract update from iframe:`, updateData);

                if (updateData.contract_id && transactions?.onBotContractEvent) {
                    console.log(
                        `📝 [${title}] Forwarding contract update to transactions store for contract_id:`,
                        updateData.contract_id
                    );
                    transactions.onBotContractEvent(updateData);
                }
                return;
            }
        };

        window.addEventListener('message', handleMessage);

        // Send auth data when iframe loads
        const handleLoad = () => {
            console.log('✅ Iframe loaded successfully:', src);
            setIsLoading(false);
            setHasError(false);
            setTimeout(() => {
                sendLegacyAuthData();
                setIsLoading(false);
                // Check if iframe has content
                try {
                    if (iframe.contentWindow) {
                        console.log('✅ Iframe contentWindow accessible');
                        // Check if iframe actually has content (not just blank)
                        try {
                            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                            if (iframeDoc) {
                                const body = iframeDoc.body;
                                if (body && body.innerHTML.trim() === '') {
                                    console.warn(
                                        '⚠️ Iframe loaded but body is empty - might be blocked or downloading'
                                    );
                                }
                            }
                        } catch (e) {
                            // Cross-origin, can't access - this is normal
                            console.log('ℹ️ Cross-origin iframe (cannot check content directly)');
                        }
                    }
                } catch (e) {
                    console.warn('⚠️ Cannot access iframe contentWindow (cross-origin):', e);
                }
            }, 500);
        };

        // Handle iframe errors
        const handleError = () => {
            console.error('❌ Iframe failed to load:', src);
            console.error('💡 This might indicate the site is blocking iframe embedding or serving downloads');
            setIsLoading(false);
            setHasError(true);
        };

        // Check if iframe content is accessible (for X-Frame-Options detection)
        const checkIframeAccess = () => {
            try {
                // Try to access iframe content - if blocked, this will throw
                if (iframe.contentWindow) {
                    // Iframe is accessible (cross-origin is normal)
                    console.log('✅ Iframe contentWindow exists');
                    // Don't set loading to false here, wait for load event
                }
            } catch (e) {
                // Cross-origin or blocked - this is normal for cross-origin iframes
                console.log('ℹ️ Cross-origin iframe (normal):', e instanceof Error ? e.message : String(e));
                // Still wait for load event
            }
        };



        // Timeout to detect if iframe never loads
        const loadTimeout = setTimeout(() => {
            if (isLoading) {
                console.warn('⏱️ Iframe load timeout after 10s:', src);
                console.warn('💡 Check if the external site allows iframe embedding');
                setIsLoading(false);
                // Don't set error yet, might still be loading
            }
        }, 10000); // 10 second timeout

        // Listen for iframe load
        iframe.addEventListener('load', handleLoad);
        iframe.addEventListener('error', handleError);

        console.log('🚀 Initializing iframe:', src);

        // Test the URL to check if it's serving HTML or downloads
        fetch(src, { method: 'HEAD', mode: 'no-cors' })
            .then(() => {
                console.log('✅ URL is accessible');
            })
            .catch(err => {
                console.warn('⚠️ Could not test URL (CORS):', err);
            });

        // Check access after a short delay
        setTimeout(checkIframeAccess, 2000);

        setTimeout(() => {
            sendLegacyAuthData();
        }, 1000);

        // Cleanup
        return () => {
            bridge.detach();
            iframe.removeEventListener('load', handleLoad);
            iframe.removeEventListener('error', handleError);
            window.removeEventListener('message', handleMessage);
            clearTimeout(loadTimeout);
        };
    }, [src, isLoading, title]);

    return (
        <div className={`iframe-wrapper ${className}`} style={{ pointerEvents: 'auto', position: 'relative' }}>
            {isLoading && !hasError && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: 'var(--text-prominent)',
                        fontSize: '1.4rem',
                        zIndex: 100,
                        pointerEvents: 'none',
                        userSelect: 'none',
                    }}
                >
                    Loading {title}...
                </div>
            )}
            {hasError && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: 'var(--text-prominent)',
                        fontSize: '1.4rem',
                        textAlign: 'center',
                        padding: '2rem',
                        zIndex: 1000,
                        backgroundColor: 'var(--general-main-1)',
                        borderRadius: '0.8rem',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                >
                    <p style={{ fontWeight: 'bold', marginBottom: '1rem' }}>Failed to load {title}</p>
                    <p
                        style={{
                            fontSize: '1rem',
                            marginTop: '1rem',
                            color: 'var(--text-less-prominent)',
                            marginBottom: '1.5rem',
                        }}
                    >
                        The external site may be blocking iframe embedding or serving downloads instead of HTML.
                        <br />
                        <br />
                        <strong>Possible causes:</strong>
                        <br />
                        • X-Frame-Options header blocking embedding
                        <br />
                        • Content-Type header causing downloads
                        <br />• CORS policy restrictions
                    </p>
                    <a
                        href={src}
                        target='_blank'
                        rel='noopener noreferrer'
                        style={{
                            display: 'inline-block',
                            padding: '0.8rem 1.6rem',
                            backgroundColor: 'var(--button-primary-default)',
                            color: 'white',
                            textDecoration: 'none',
                            borderRadius: '0.4rem',
                            fontSize: '1.2rem',
                            marginTop: '1rem',
                        }}
                    >
                        Open in New Tab
                    </a>
                </div>
            )}
            <iframe
                ref={iframeRef}
                src={src}
                title={title}
                className='iframe-wrapper__frame'
                frameBorder='0'
                allowFullScreen
                loading='eager'
                allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; display-capture'
                referrerPolicy='no-referrer-when-downgrade'
                style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    minHeight: '100%',
                    opacity: hasError ? 0 : 1,
                    transition: 'opacity 0.3s',
                    border: 'none',
                    background: 'transparent',
                    visibility: hasError ? 'hidden' : 'visible',
                    pointerEvents: hasError ? 'none' : 'auto',
                    zIndex: 10,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                }}
                onLoad={() => {
                    // Additional load handler to catch any issues
                    console.log('📦 Iframe onLoad event fired');
                    setIsLoading(false);
                    // Force set loading to false after a short delay to ensure it's clickable
                    setTimeout(() => {
                        setIsLoading(false);
                        console.log('✅ Iframe should now be fully interactive');
                    }, 100);
                }}
            />
            {title === 'DTrader Terminal' && <DiagnosticsPanel bridge={bridgeClient} />}
        </div>
    );
});

export default IframeWrapper;
