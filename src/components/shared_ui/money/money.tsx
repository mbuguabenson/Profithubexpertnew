import React, { useEffect, useState } from 'react';
import { formatMoney, getCurrencyDisplayCode } from '@/components/shared';
import { convertCurrencyAmount } from '@/utils/currency-converter';

type TMoneyProps = {
    amount: number | string;
    className: string;
    currency: string;
    has_sign: boolean;
    should_format: boolean;
    show_currency: boolean; // if true, append currency symbol
    disable_conversion?: boolean;
};

const Money = ({
    amount = 0,
    className,
    currency = 'USD',
    has_sign,
    should_format = true,
    show_currency = false,
    disable_conversion = false,
}: Partial<TMoneyProps>) => {
    const [, setTick] = useState(0);

    useEffect(() => {
        const handleSync = () => setTick(t => t + 1);
        window.addEventListener('currency_changed', handleSync);
        return () => window.removeEventListener('currency_changed', handleSync);
    }, []);

    const { amount: convertedAmount, currency: targetCurrency } = disable_conversion
        ? { amount: typeof amount === 'string' ? parseFloat(amount) || 0 : Number(amount), currency }
        : convertCurrencyAmount(amount, currency);

    let sign = '';
    if (convertedAmount && (convertedAmount < 0 || has_sign)) {
        sign = convertedAmount > 0 ? '+' : '-';
    }

    // if it's formatted already then don't make any changes unless we should remove extra -/+ signs
    const value = has_sign || should_format ? Math.abs(convertedAmount) : convertedAmount;
    const final_amount = should_format ? formatMoney(targetCurrency, value, true, 0, 0) : value;

    return (
        <React.Fragment>
            <span>{has_sign && sign}</span>
            <span data-testid='dt_span' className={className}>
                {final_amount} {show_currency && getCurrencyDisplayCode(targetCurrency)}
            </span>
        </React.Fragment>
    );
};

export default React.memo(Money);
