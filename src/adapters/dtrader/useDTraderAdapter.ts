import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/hooks/useStore';
import { dtraderAdapter } from './dtrader-adapter';
import type {
    ContractType,
    OpenPosition,
    ProposalData,
    SettledContract,
    TradeCategory,
    TradeParams,
} from './types';

export const DEFAULT_TRADE_PARAMS: TradeParams = {
    symbol: 'R_100',
    category: 'rise_fall',
    basis: 'stake',
    amount: 10,
    duration: 5,
    durationUnit: 't',
    barrier: '',
    selectedDigit: 5,
    growthRate: 0.03,
    multiplier: 20,
    takeProfit: undefined,
    stopLoss: undefined,
};

export function useDTraderAdapter(initialSymbol?: string) {
    const rootStore = useStore();
    const client = rootStore?.client;

    const currency = client?.currency || 'USD';
    const balance = Number(client?.balance ?? 0);
    const isLoggedIn = Boolean(client?.is_logged_in);
    const isVirtual = Boolean(client?.is_virtual);

    const [params, setParamsState] = useState<TradeParams>(() => ({
        ...DEFAULT_TRADE_PARAMS,
        symbol: initialSymbol || 'R_100',
    }));

    const [proposals, setProposals] = useState<Record<string, ProposalData>>({});
    const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
    const [settledContracts, setSettledContracts] = useState<SettledContract[]>(() =>
        dtraderAdapter.getSettledContracts()
    );
    const [lastSettledContract, setLastSettledContract] = useState<SettledContract | null>(null);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [purchaseError, setPurchaseError] = useState<string | null>(null);

    // Keep active currency reference
    const currencyRef = useRef(currency);
    currencyRef.current = currency;

    // Helper updates
    const updateParams = useCallback((patch: Partial<TradeParams>) => {
        setParamsState(prev => ({ ...prev, ...patch }));
    }, []);

    const setSymbol = useCallback((symbol: string) => {
        updateParams({ symbol });
    }, [updateParams]);

    const setCategory = useCallback((category: TradeCategory) => {
        // Reset category defaults appropriately
        const patch: Partial<TradeParams> = { category };
        if (category === 'rise_fall') {
            patch.duration = 5;
            patch.durationUnit = 't';
            patch.barrier = '';
        } else if (category === 'high_low') {
            patch.duration = 5;
            patch.durationUnit = 'm';
            patch.barrier = '+0.5';
        } else if (category.startsWith('digits')) {
            patch.duration = 1;
            patch.durationUnit = 't';
            patch.barrier = '';
            patch.selectedDigit = 5;
        } else if (category === 'touch_notouch') {
            patch.duration = 15;
            patch.durationUnit = 'm';
            patch.barrier = '+1.5';
        } else if (category === 'accumulator') {
            patch.growthRate = 0.03;
        } else if (category === 'multiplier') {
            patch.multiplier = 20;
        }
        updateParams(patch);
    }, [updateParams]);

    // Listen to adapter subscriptions
    useEffect(() => {
        dtraderAdapter.init();

        const unsubProposals = dtraderAdapter.onProposalsChange(newProposals => {
            setProposals(newProposals);
        });

        const unsubPositions = dtraderAdapter.onPositionsChange(newPositions => {
            setOpenPositions(newPositions);
        });

        const unsubSettled = dtraderAdapter.onContractSettled(contract => {
            setLastSettledContract(contract);
            setSettledContracts(dtraderAdapter.getSettledContracts());
        });

        return () => {
            unsubProposals();
            unsubPositions();
            unsubSettled();
        };
    }, []);

    // Subscribe to proposals with a small debounce when parameters change
    const proposalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (proposalTimerRef.current) {
            clearTimeout(proposalTimerRef.current);
        }

        proposalTimerRef.current = setTimeout(() => {
            dtraderAdapter.subscribeProposals(params, currencyRef.current);
        }, 120);

        return () => {
            if (proposalTimerRef.current) {
                clearTimeout(proposalTimerRef.current);
            }
        };
    }, [
        params.symbol,
        params.category,
        params.amount,
        params.basis,
        params.duration,
        params.durationUnit,
        params.barrier,
        params.barrier2,
        params.selectedDigit,
        params.growthRate,
        params.multiplier,
        params.takeProfit,
        params.stopLoss,
        currency,
    ]);

    // Buy execution
    const buy = useCallback(
        async (type: ContractType) => {
            setIsPurchasing(true);
            setPurchaseError(null);

            try {
                const res = await dtraderAdapter.buyContract(type, params, currencyRef.current);
                if (!res.success) {
                    setPurchaseError(res.error || 'Failed to place trade.');
                }
                return res;
            } catch (err: any) {
                const msg = err?.message || 'Trade purchase error.';
                setPurchaseError(msg);
                return { success: false, error: msg };
            } finally {
                setIsPurchasing(false);
            }
        },
        [params]
    );

    // Sell execution (Close early / Cash out)
    const sell = useCallback(async (contractId: number) => {
        return await dtraderAdapter.sellContract(contractId);
    }, []);

    const clearSettledHistory = useCallback(() => {
        dtraderAdapter.clearSettledHistory();
        setSettledContracts([]);
        setLastSettledContract(null);
    }, []);

    const totalOpenProfit = useMemo(() => {
        return openPositions.reduce((acc, pos) => acc + (pos.profit || 0), 0);
    }, [openPositions]);

    return {
        params,
        updateParams,
        setSymbol,
        setCategory,
        proposals,
        openPositions,
        hasOpenPositions: openPositions.length > 0,
        totalOpenProfit,
        settledContracts,
        lastSettledContract,
        setLastSettledContract,
        buy,
        sell,
        clearSettledHistory,
        isPurchasing,
        purchaseError,
        setPurchaseError,
        currency,
        balance,
        isLoggedIn,
        isVirtual,
    };
}
