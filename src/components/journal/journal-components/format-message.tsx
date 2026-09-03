import React, { useEffect, useState } from 'react';
import classnames from 'classnames';
import { formatMoney, getCurrencyDisplayCode } from '@/components/shared';
import Text from '@/components/shared_ui/text';
import { LogTypes } from '@/external/bot-skeleton';
import { Localize, localize } from '@deriv-com/translations';
import { convertCurrencyAmount } from '@/utils/currency-converter';
import { TFormatMessageProps } from '../journal.types';

const FormatMessage = ({ logType, className, extra }: TFormatMessageProps) => {
    const [, setTick] = useState(0);

    useEffect(() => {
        const handleSync = () => setTick(t => t + 1);
        window.addEventListener('currency_changed', handleSync);
        return () => window.removeEventListener('currency_changed', handleSync);
    }, []);

    const getLogMessage = () => {
        switch (logType) {
            case LogTypes.LOAD_BLOCK: {
                return localize('Blocks are loaded successfully');
            }
            case LogTypes.NOT_OFFERED: {
                return localize('Resale of this contract is not offered.');
            }
            case LogTypes.PURCHASE: {
                const { transaction_id } = extra;
                return (
                    <Localize
                        i18n_default_text='<0>Bought</0>: Contract purchased (ID: {{transaction_id}})'
                        values={{ transaction_id }}
                        components={[<Text key={0} size='xxs' styles={{ color: 'var(--status-info)' }} />]}
                        options={{ interpolation: { escapeValue: false } }}
                    />
                );
            }
            case LogTypes.SELL: {
                const { sold_for } = extra;
                let display_sold = sold_for;
                if (
                    typeof sold_for === 'number' ||
                    (typeof sold_for === 'string' && !isNaN(parseFloat(sold_for)) && isFinite(Number(sold_for)))
                ) {
                    const { amount: convertedSold, currency: targetCurrency } = convertCurrencyAmount(
                        sold_for,
                        extra?.currency || 'USD'
                    );
                    display_sold = `${formatMoney(targetCurrency, convertedSold, true)} ${getCurrencyDisplayCode(targetCurrency)}`;
                }
                return (
                    <Localize
                        i18n_default_text='<0>Sold for</0>: {{sold_for}}'
                        values={{ sold_for: display_sold }}
                        components={[<Text key={0} size='xxs' styles={{ color: 'var(--status-warning)' }} />]}
                    />
                );
            }
            case LogTypes.PROFIT: {
                const { currency = 'USD', profit } = extra;
                const { amount: convertedProfit, currency: targetCurrency } = convertCurrencyAmount(profit, currency);
                return (
                    <Localize
                        i18n_default_text='Profit amount: <0>{{profit}}</0>'
                        values={{
                            profit: `${formatMoney(targetCurrency, convertedProfit, true)} ${getCurrencyDisplayCode(targetCurrency)}`,
                        }}
                        components={[<Text key={0} size='xxs' styles={{ color: 'var(--status-success)' }} />]}
                    />
                );
            }
            case LogTypes.LOST: {
                const { currency = 'USD', profit } = extra;
                const { amount: convertedProfit, currency: targetCurrency } = convertCurrencyAmount(profit, currency);
                return (
                    <Localize
                        i18n_default_text='Loss amount: <0>{{profit}}</0>'
                        values={{
                            profit: `${formatMoney(targetCurrency, convertedProfit, true)} ${getCurrencyDisplayCode(targetCurrency)}`,
                        }}
                        components={[<Text key={0} size='xxs' styles={{ color: 'var(--status-danger)' }} />]}
                    />
                );
            }
            case LogTypes.WELCOME_BACK: {
                const { current_currency } = extra;
                if (current_currency)
                    return (
                        <Localize
                            i18n_default_text='Welcome back! Your messages have been restored. You are using your {{current_currency}} account.'
                            values={{
                                current_currency,
                            }}
                        />
                    );
                return <Localize i18n_default_text='Welcome back! Your messages have been restored.' />;
            }

            case LogTypes.WELCOME: {
                const { current_currency } = extra;
                if (current_currency)
                    return (
                        <Localize
                            i18n_default_text='You are using your {{current_currency}} account.'
                            values={{
                                current_currency,
                            }}
                        />
                    );
                break;
            }
            default:
                return null;
        }
    };

    return <div className={classnames('journal__text', className)}>{getLogMessage()}</div>;
};

export default FormatMessage;
