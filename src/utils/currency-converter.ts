import { useState, useEffect } from 'react';

/**
 * Currency Converter Utilities
 * Provides synchronized access to the global display currency (USD / KES)
 * and conversion rates.
 */

export const getDisplayCurrency = (): 'USD' | 'KES' => {
    try {
        return (localStorage.getItem('converter_display_currency') as 'USD' | 'KES') || 'USD';
    } catch {
        return 'USD';
    }
};

export const getDisplayRate = (): number => {
    try {
        return parseFloat(localStorage.getItem('converter_kes_rate') || '129.5') || 129.5;
    } catch {
        return 129.5;
    }
};

export interface ConvertedAmount {
    amount: number;
    currency: string;
    rate: number;
    isConverted: boolean;
    formatted: string;
}

export const convertCurrencyAmount = (
    amount: number | string | undefined | null,
    baseCurrency = 'USD'
): ConvertedAmount => {
    const displayCurrency = getDisplayCurrency();
    const rate = getDisplayRate();
    const isKes = displayCurrency === 'KES' && (baseCurrency === 'USD' || !baseCurrency);
    const finalRate = isKes ? rate : 1;
    const finalCurrency = isKes ? 'KES' : baseCurrency || 'USD';
    const numAmount = typeof amount === 'string' ? parseFloat(amount) || 0 : (amount ?? 0);
    const convertedAmount = numAmount * finalRate;

    return {
        amount: convertedAmount,
        currency: finalCurrency,
        rate: finalRate,
        isConverted: isKes,
        formatted: `${convertedAmount < 0 ? '-' : ''}${Math.abs(convertedAmount).toFixed(2)} ${finalCurrency}`,
    };
};

/**
 * React hook that triggers re-render whenever the user switches currency in the header.
 */
export const useDisplayCurrency = () => {
    const [currency, setCurrency] = useState<'USD' | 'KES'>(() => getDisplayCurrency());
    const [rate, setRate] = useState<number>(() => getDisplayRate());

    useEffect(() => {
        const handleSync = () => {
            setCurrency(getDisplayCurrency());
            setRate(getDisplayRate());
        };
        window.addEventListener('currency_changed', handleSync);
        return () => window.removeEventListener('currency_changed', handleSync);
    }, []);

    const convert = (amount: number | string | undefined | null, baseCurrency = 'USD') => {
        const isKes = currency === 'KES' && (baseCurrency === 'USD' || !baseCurrency);
        const finalRate = isKes ? rate : 1;
        const finalCurrency = isKes ? 'KES' : baseCurrency || 'USD';
        const numAmount = typeof amount === 'string' ? parseFloat(amount) || 0 : (amount ?? 0);
        const convertedAmount = numAmount * finalRate;

        return {
            amount: convertedAmount,
            currency: finalCurrency,
            rate: finalRate,
            isConverted: isKes,
            formatted: `${convertedAmount < 0 ? '-' : ''}${Math.abs(convertedAmount).toFixed(2)} ${finalCurrency}`,
        };
    };

    return { displayCurrency: currency, rate, convert };
};
