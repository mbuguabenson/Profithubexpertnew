import { getRoundedNumber } from '@/components/shared';
import { getLocalizedErrorMessage } from '@/constants/backend-error-messages';
import { LogTypes } from '../../../constants/messages';
import { createError } from '../../../utils/error';
import { observer as globalObserver } from '../../../utils/observer';
import { info, log } from '../utils/broadcast';
import { api_base } from '../../api/api-base';

const skeleton = {
    totalProfit: 0,
    totalWins: 0,
    totalLosses: 0,
    totalStake: 0,
    totalPayout: 0,
    totalRuns: 0,
};

const globalStat = {};

export default Engine =>
    class Total extends Engine {
        constructor() {
            super();
            this.sessionRuns = 0;
            this.sessionProfit = 0;

            globalObserver.register('statistics.clear', this.clearStatistics.bind(this));
        }

        clearStatistics() {
            this.sessionRuns = 0;
            this.sessionProfit = 0;
            const accountID = this.accountInfo?.loginid || api_base?.account_info?.loginid;
            if (!accountID) return;
            globalStat[accountID] = { ...skeleton };
        }

        updateTotals(contract) {
            try {
                if (!contract) return;
                const { sell_price: sellPrice = 0, buy_price: buyPrice = 0, currency = 'USD' } = contract;

                const profit = getRoundedNumber(Number(sellPrice) - Number(buyPrice), currency);
                const win = profit > 0;
                const accountStat = this.getAccountStat();
                const accountID = this.accountInfo?.loginid || api_base?.account_info?.loginid || 'CR_DEFAULT';

                accountStat.totalWins += win ? 1 : 0;
                accountStat.totalLosses += !win ? 1 : 0;
                this.sessionProfit = getRoundedNumber(Number(this.sessionProfit) + Number(profit), currency);
                accountStat.totalProfit = getRoundedNumber(Number(accountStat.totalProfit) + Number(profit), currency);
                accountStat.totalStake = getRoundedNumber(Number(accountStat.totalStake) + Number(buyPrice), currency);
                accountStat.totalPayout = getRoundedNumber(
                    Number(accountStat.totalPayout) + Number(sellPrice),
                    currency
                );

                info({
                    profit,
                    contract,
                    accountID,
                    totalProfit: accountStat.totalProfit,
                    totalWins: accountStat.totalWins,
                    totalLosses: accountStat.totalLosses,
                    totalStake: accountStat.totalStake,
                    totalPayout: accountStat.totalPayout,
                });

                log(win ? LogTypes.PROFIT : LogTypes.LOST, { currency, profit });

                if (typeof window !== 'undefined' && window.scanner_store) {
                    try {
                        window.scanner_store.recordTradeResult(win ? 'WIN' : 'LOSS', profit, Number(buyPrice));
                    } catch (err) {
                        console.warn('[Total] Error recording trade result in scanner:', err);
                    }
                }

                // ⚡ Strictly enforce the user's defined input market.
                // Never hijack or switch the symbol without the user's explicit consent.
                const isExplicitAltMarkets =
                    typeof window !== 'undefined' && window.DBot?.__alt_markets?.enabled === true;
                if (isExplicitAltMarkets) {
                    const availableSymbols = [
                        'R_10',
                        'R_25',
                        'R_50',
                        'R_75',
                        'R_100',
                        '1HZ10V',
                        '1HZ15V',
                        '1HZ25V',
                        '1HZ30V',
                        '1HZ50V',
                        '1HZ75V',
                        '1HZ90V',
                        '1HZ100V',
                    ];
                    const currentSymbol =
                        (this.tradeOptions && this.tradeOptions.symbol) || this.options?.symbol || 'R_100';
                    const idx = availableSymbols.indexOf(currentSymbol);
                    const nextSymbol = availableSymbols[(idx + 1) % availableSymbols.length];

                    if (nextSymbol && nextSymbol !== currentSymbol) {
                        if (this.tradeOptions) {
                            this.tradeOptions.symbol = nextSymbol;
                        }
                        log(LogTypes.INFO, { message: `[ALTERNATE MARKETS] Market switched to ${nextSymbol}` });
                    }
                } else if (this.options?.symbol) {
                    // Lock symbol strictly to the user's configured input market
                    if (this.tradeOptions) {
                        this.tradeOptions.symbol = this.options.symbol;
                    }
                }
            } catch (error) {
                console.error('[Total] updateTotals error:', error);
            }
        }

        updateAndReturnTotalRuns() {
            this.sessionRuns++;
            const accountStat = this.getAccountStat();

            return ++accountStat.totalRuns;
        }

        /* eslint-disable class-methods-use-this */
        getTotalRuns() {
            const accountStat = this.getAccountStat();
            return accountStat.totalRuns;
        }

        getTotalProfit(toString, currency) {
            const accountStat = this.getAccountStat();

            return toString && accountStat.totalProfit !== 0
                ? getRoundedNumber(+accountStat.totalProfit, currency)
                : +accountStat.totalProfit;
        }

        /* eslint-enable */
        checkLimits(tradeOption) {
            if (!tradeOption.limitations) {
                return;
            }

            const {
                limitations: { maxLoss, maxTrades },
            } = tradeOption;

            if (maxLoss && maxTrades) {
                if (this.sessionRuns >= maxTrades) {
                    throw createError('CustomLimitsReached', getLocalizedErrorMessage('MaxTradesReached'));
                }
                if (this.sessionProfit <= -maxLoss) {
                    throw createError('CustomLimitsReached', getLocalizedErrorMessage('MaxLossReached'));
                }
            }
        }

        /* eslint-disable class-methods-use-this */
        validateTradeOptions(tradeOptions) {
            if (!tradeOptions) return {};
            const take_profit = tradeOptions.take_profit;
            const stop_loss = tradeOptions.stop_loss;

            if (take_profit || stop_loss) {
                tradeOptions.limit_order = tradeOptions.limit_order || {};
            }

            if (take_profit && tradeOptions.limit_order) {
                tradeOptions.limit_order.take_profit = take_profit;
            }
            if (stop_loss && tradeOptions.limit_order) {
                tradeOptions.limit_order.stop_loss = stop_loss;
            }

            return tradeOptions;
        }

        getAccountStat() {
            const accountID = this.accountInfo?.loginid || api_base?.account_info?.loginid || 'CR_DEFAULT';

            if (!(accountID in globalStat)) {
                globalStat[accountID] = { ...skeleton };
            }

            return globalStat[accountID];
        }
    };
