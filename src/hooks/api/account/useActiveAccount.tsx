import { useMemo } from 'react';
import { isVirtualAccount } from '@/utils/account-helpers';
import { CurrencyIcon } from '@/components/currency/currency-icon';
import { addComma, getDecimalPlaces } from '@/components/shared';
import { useApiBase } from '@/hooks/useApiBase';
import { Balance } from '@deriv/api-types';

/** A custom hook that returns the account object for the current active account. */
const useActiveAccount = ({
    allBalanceData,
    directBalance,
}: {
    allBalanceData: Balance | null;
    directBalance?: string;
}) => {
    const { accountList, activeLoginid, authData } = useApiBase();

    const resolvedLoginId =
        activeLoginid ||
        authData?.loginid ||
        localStorage.getItem('active_loginid') ||
        localStorage.getItem('client.loginid') ||
        '';

    const activeAccount = useMemo(() => {
        if (!resolvedLoginId) return undefined;
        
        const found = accountList?.find(account => account.loginid === resolvedLoginId);
        if (found) return found;

        return {
            loginid: resolvedLoginId,
            currency: authData?.currency || 'USD',
            balance: authData?.balance ?? 0,
            is_virtual: isVirtualAccount(resolvedLoginId) ? 1 : 0,
        };
    }, [resolvedLoginId, accountList, authData]);

    const currentBalanceData = allBalanceData?.accounts?.[activeAccount?.loginid ?? ''];

    const modifiedAccount = useMemo(() => {
        if (!activeAccount) return undefined;

        const isVirtual = isVirtualAccount(activeAccount.loginid);
        const accCurrency = activeAccount?.currency || 'USD';

        return {
            ...activeAccount,
            balance: currentBalanceData?.balance !== undefined
                ? addComma(Number(currentBalanceData.balance).toFixed(getDecimalPlaces(currentBalanceData.currency || accCurrency)))
                : directBalance
                  ? addComma(parseFloat(directBalance).toFixed(getDecimalPlaces(accCurrency)))
                  : addComma(Number(activeAccount.balance || 0).toFixed(getDecimalPlaces(accCurrency))),
            currencyLabel: isVirtual ? 'Demo' : accCurrency,
            icon: <CurrencyIcon currency={accCurrency.toLowerCase()} isVirtual={isVirtual} />,
            isVirtual: isVirtual,
            isActive: true,
        };
    }, [activeAccount, currentBalanceData, directBalance]);

    return {
        /** User's current active account. */
        data: modifiedAccount,
    };
};

export default useActiveAccount;
