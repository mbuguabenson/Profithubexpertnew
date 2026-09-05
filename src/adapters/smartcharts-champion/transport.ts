/**
 * Transport layer wrapper for SmartCharts Champion Adapter
 * Wraps the existing chart_api.api to match the TTransport interface
 */

import chart_api from '@/external/bot-skeleton/services/api/chart-api';
import type { TTransport } from './types';

// Logger utility for transport layer
const logger = {
    log: () => {}, // Disabled in production
    warn: console.warn.bind(console, '[SmartCharts Transport]'),
    error: console.error.bind(console, '[SmartCharts Transport]'),
};

/**
 * Create transport wrapper around chart_api.api
 * @returns TTransport implementation
 */
export function createTransport(): TTransport {
    const subscriptions = new Map<string, any>();

    return {
        /**
         * Send one-shot API request
         */
        async send(request: any): Promise<any> {
            if (typeof chart_api.waitForConnection === 'function') {
                await chart_api.waitForConnection(10000);
            } else if (!chart_api.api) {
                await chart_api.init();
            }
            if (!chart_api.api) throw new Error('Chart API not initialized');
            return chart_api.api.send(request);
        },

        /**
         * Subscribe to streaming data
         * @param request - API request with subscribe: 1
         * @param callback - Callback for streaming updates
         * @returns subscription ID
         */
        subscribe(request: any, callback: (response: any) => void): string {
            // Generate a unique temporary ID for tracking
            const tempId = `temp-${Date.now()}-${Math.random()}`;

            // Send initial subscription request
            const subscribeRequest = { ...request, subscribe: 1 };

            // Store subscription info with temp ID
            subscriptions.set(tempId, {
                request: subscribeRequest,
                callback,
                messageSubscription: null,
                realSubscriptionId: null,
            });

            const sendSubscription = async () => {
                try {
                    if (typeof chart_api.waitForConnection === 'function') {
                        await chart_api.waitForConnection(10000);
                    } else if (!chart_api.api) {
                        await chart_api.init();
                    }
                    if (!chart_api.api) return;

                    // Set up global message listener first
                    const messageSubscription = chart_api.api.onMessage()?.subscribe(({ data }: { data: any }) => {
                        const subscriptionId = data?.subscription?.id;
                        const symbolToMatch = subscribeRequest.ticks_history || subscribeRequest.symbol;

                        // Check if this message belongs to our subscription
                        const storedSub = subscriptions.get(tempId);
                        if (storedSub) {
                            const matchesSubId = Boolean(
                                subscriptionId &&
                                storedSub.realSubscriptionId &&
                                subscriptionId === storedSub.realSubscriptionId
                            );
                            const matchesSymbol = Boolean(
                                (data?.tick && (data.tick.symbol === symbolToMatch || data.tick.underlying === symbolToMatch)) ||
                                (data?.ohlc && (data.ohlc.symbol === symbolToMatch || data.ohlc.underlying === symbolToMatch))
                            );

                            if (matchesSubId || matchesSymbol) {
                                if (subscriptionId && !storedSub.realSubscriptionId) {
                                    storedSub.realSubscriptionId = subscriptionId;
                                    subscriptions.set(tempId, storedSub);
                                }
                                if (data?.tick || data?.ohlc) {
                                    callback(data);
                                }
                            }
                        }
                    });

                    const storedSub = subscriptions.get(tempId);
                    if (storedSub) {
                        storedSub.messageSubscription = messageSubscription;
                    }

                    const response = await chart_api.api.send(subscribeRequest);
                    const isAlreadySubscribed =
                        response?.error?.code === 'AlreadySubscribed' ||
                        String(response?.error?.message || '').toLowerCase().includes('already subscribed');

                    if (response?.error && !isAlreadySubscribed) {
                        logger.warn('Subscription returned API error:', response.error?.message || response.error);
                        const currentSub = subscriptions.get(tempId);
                        if (currentSub?.messageSubscription) {
                            currentSub.messageSubscription.unsubscribe();
                        }
                        subscriptions.delete(tempId);
                        return;
                    }

                    if (isAlreadySubscribed) {
                        const currentSub = subscriptions.get(tempId);
                        if (currentSub) {
                            currentSub.isReusedStream = true;
                            subscriptions.set(tempId, currentSub);
                        }
                        logger.log('[SmartCharts Transport] Reusing active socket stream for:', subscribeRequest.ticks_history || subscribeRequest.symbol);
                        return;
                    }

                    const subscriptionId = response?.subscription?.id;

                    if (subscriptionId) {
                        const currentSub = subscriptions.get(tempId);
                        if (currentSub) {
                            currentSub.realSubscriptionId = subscriptionId;
                            subscriptions.set(tempId, currentSub);
                        }
                        if (response?.tick || response?.ohlc) {
                            callback(response);
                        }
                    } else if (response?.tick || response?.ohlc) {
                        callback(response);
                    } else {
                        logger.warn('No subscription ID in response:', response);
                    }
                } catch (error: any) {
                    const errorMsg = String(error?.error?.message || error?.message || error || '');
                    const isAlreadySubscribed =
                        error?.error?.code === 'AlreadySubscribed' ||
                        error?.code === 'AlreadySubscribed' ||
                        errorMsg.toLowerCase().includes('already subscribed');

                    if (isAlreadySubscribed) {
                        const currentSub = subscriptions.get(tempId);
                        if (currentSub) {
                            currentSub.isReusedStream = true;
                            subscriptions.set(tempId, currentSub);
                        }
                        logger.log('[SmartCharts Transport] Reusing active socket stream (caught) for:', subscribeRequest.ticks_history || subscribeRequest.symbol);
                        return;
                    }

                    logger.warn(
                        'Subscription request failed gracefully:',
                        errorMsg
                    );
                    const currentSub = subscriptions.get(tempId);
                    if (currentSub?.messageSubscription) {
                        currentSub.messageSubscription.unsubscribe();
                    }
                    subscriptions.delete(tempId);
                }
            };

            sendSubscription();
            return tempId;
        },

        /**
         * Unsubscribe from streaming data
         * @param subscriptionId - Subscription ID to cancel (temp ID)
         */
        unsubscribe(subscriptionId: string): void {
            const subscription = subscriptions.get(subscriptionId);

            if (subscription) {
                // Cancel RxJS subscription
                if (subscription.messageSubscription) {
                    subscription.messageSubscription.unsubscribe();
                }

                // Only send server forget request if we are not sharing an external reused stream
                if (chart_api.api && subscription.realSubscriptionId && !subscription.isReusedStream) {
                    chart_api.api.forget(subscription.realSubscriptionId);
                }

                // Clean up local storage
                subscriptions.delete(subscriptionId);
            } else {
                logger.warn('No subscription found for ID:', subscriptionId);
            }
        },

        /**
         * Unsubscribe from all streaming data of a specific type
         * @param msgType - Message type to unsubscribe from (optional)
         */
        unsubscribeAll(msgType?: string): void {
            if (chart_api.api) {
                if (msgType) {
                    chart_api.api.forgetAll(msgType);
                } else {
                    // Forget all ticks by default
                    chart_api.api.forgetAll('ticks');
                }
            }

            // Clean up local subscriptions
            subscriptions.clear();
        },
    };
}
