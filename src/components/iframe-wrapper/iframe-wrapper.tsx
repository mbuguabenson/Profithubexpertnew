import React, { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import './iframe-wrapper.scss';
import { useStore } from '@/hooks/useStore';
import { contract_stages } from '@/constants/contract-stage';

interface IframeWrapperProps {
    src: string;
    title: string;
    className?: string;
}

/**
 * IframeWrapper — generic iframe container for third-party bot tools.
 *
 * IMPORTANT: This component intentionally does NOT attempt any Deriv cookie-bridge
 * auth (postMessage / ParentBridgeClient). That approach is blocked by SameSite cookie
 * restrictions when Deriv's domain is embedded in a third-party iframe.
 * For DTrader, use the OAuth launcher panel in dtrader.tsx instead.
 *
 * What this component DOES:
 * - Renders a third-party bot iframe (Hyperbot, Diffbot, Profihub Analysis, etc.)
 * - Listens for TRADE_PLACED / CONTRACT_EVENT / CONTRACT_UPDATE messages from those
 *   bot iframes and forwards them into the MobX run-panel / transactions store.
 */
const IframeWrapper: React.FC<IframeWrapperProps> = observer(({ src, title, className = '' }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [hasError, setHasError] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const { transactions, run_panel, client } = useStore();

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        // Allowed origins for third-party bot iframes (Hyperbot, Diffbot, etc.)
        // NOTE: deriv.com / trader.deriv.com are intentionally NOT listed here.
        // Auth via postMessage bridge is not supported for Deriv's cross-origin
        // iframes due to SameSite cookie restrictions. Use the OAuth launcher for DTrader.
        const allowedOrigins = [
            'https://deriv-dtrader.vercel.app',   // Vercel DTrader (iframe embed)
            'https://www.derivcircles.com',
            'https://bot-analysis-tool-belex.web.app',
            'https://analysisprofithub.vercel.app',
            'https://www.smartanalysistool.com',
            'https://dcircles.netlify.app',
            'https://dcircles-six.vercel.app',
            'https://xenontool.netlify.app',
            window.location.origin,
        ];

        const handleMessage = (event: MessageEvent) => {
            const isAllowed =
                allowedOrigins.includes(event.origin) ||
                /^http:\/\/localhost(:\d+)?$/i.test(event.origin);
            if (!isAllowed) return;
            if (!event.data) return;

            // Forward trade events from bot iframes into the run panel / transactions store
            if (event.data.type === 'TRADE_PLACED' || event.data.type === 'CONTRACT_EVENT') {
                const tradeData = event.data;

                // DTrader no longer uses IframeWrapper — guard kept for safety
                if (title === 'DTrader Terminal') return;

                if (run_panel && !run_panel.run_id) {
                    const botName = title.toLowerCase().replace(/\s+/g, '');
                    run_panel.run_id = `${botName}-${Date.now()}`;
                    run_panel.setIsRunning(true);
                    run_panel.setContractStage(contract_stages.STARTING);
                }

                if (transactions?.onBotContractEvent && tradeData.contract_id) {
                    try {
                        const contractData = {
                            contract_id: tradeData.contract_id,
                            transaction_ids: tradeData.transaction_ids || {
                                buy: tradeData.transaction_id || tradeData.buy_transaction_id,
                                sell: tradeData.sell_transaction_id || tradeData.transaction_ids?.sell,
                            },
                            buy_price: tradeData.buy_price || tradeData.price || tradeData.stake || tradeData.amount || 0,
                            currency: tradeData.currency || client?.currency || 'USD',
                            contract_type:
                                tradeData.contract_type ||
                                (title.toLowerCase().includes('matches')
                                    ? 'DIGITMATCH'
                                    : title.toLowerCase().includes('diffbot')
                                      ? 'DIGITDIFF'
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
                        transactions.onBotContractEvent(contractData);
                        if (run_panel) {
                            run_panel.setHasOpenContract(true);
                            run_panel.setContractStage(contract_stages.PURCHASE_SENT);
                            if (!run_panel.is_drawer_open) run_panel.toggleDrawer(true);
                            run_panel.setActiveTabIndex(1);
                        }
                    } catch (error) {
                        console.error(`[IframeWrapper] Error forwarding trade to Run Panel:`, error);
                    }
                }
                return;
            }

            // Forward contract updates
            if (event.data.type === 'CONTRACT_UPDATE') {
                const updateData = event.data;
                if (updateData.contract_id && transactions?.onBotContractEvent) {
                    transactions.onBotContractEvent(updateData);
                }
                return;
            }
        };

        window.addEventListener('message', handleMessage);

        const handleLoad = () => {
            setIsLoading(false);
            setHasError(false);
        };
        const handleError = () => {
            setIsLoading(false);
            setHasError(true);
        };
        const loadTimeout = setTimeout(() => setIsLoading(false), 10000);

        iframe.addEventListener('load', handleLoad);
        iframe.addEventListener('error', handleError);

        return () => {
            iframe.removeEventListener('load', handleLoad);
            iframe.removeEventListener('error', handleError);
            window.removeEventListener('message', handleMessage);
            clearTimeout(loadTimeout);
        };
    }, [src, title]);

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
                    <p style={{ fontSize: '1rem', marginTop: '1rem', color: 'var(--text-less-prominent)', marginBottom: '1.5rem' }}>
                        The external site may be blocking iframe embedding or serving downloads instead of HTML.
                        <br /><br />
                        <strong>Possible causes:</strong><br />
                        • X-Frame-Options header blocking embedding<br />
                        • Content-Type header causing downloads<br />
                        • CORS policy restrictions
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
                sandbox='allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads'
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
                onLoad={() => setIsLoading(false)}
            />
        </div>
    );
});

export default IframeWrapper;
