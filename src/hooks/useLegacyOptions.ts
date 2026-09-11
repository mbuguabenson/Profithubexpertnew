import { useCallback, useEffect, useState } from 'react';
import {
    DerivLegacyOptionsService,
    LegacyMigrationStatus,
    LegacyOptionsAccount,
    LegacyStatementTransaction,
} from '@/services/deriv-legacy-options.service';
import { getLegacyDTraderToken, isLegacyToken } from '@/utils/token-bridge';

export interface UseLegacyOptionsResult {
    migrationStatus: LegacyMigrationStatus | null;
    legacyAccounts: LegacyOptionsAccount[];
    legacyStatement: LegacyStatementTransaction[];
    isLoading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
    fetchStatement: (loginid: string, limit?: number, offset?: number) => Promise<void>;
}

/**
 * Hook providing reactive access to Deriv Options Legacy API data
 * (migration status, accounts, and historical statements) for DTrader.
 */
export const useLegacyOptions = (explicitLoginId?: string): UseLegacyOptionsResult => {
    const [migrationStatus, setMigrationStatus] = useState<LegacyMigrationStatus | null>(null);
    const [legacyAccounts, setLegacyAccounts] = useState<LegacyOptionsAccount[]>([]);
    const [legacyStatement, setLegacyStatement] = useState<LegacyStatementTransaction[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        const token = getLegacyDTraderToken(explicitLoginId);
        if (!token || !isLegacyToken(token)) {
            setMigrationStatus(null);
            setLegacyAccounts([]);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // 1. Fetch migration status
            const statusRes = await DerivLegacyOptionsService.getMigrationStatus(token);
            const status = statusRes?.data?.status || 'not_applicable';
            setMigrationStatus(status);

            // 2. If status is complete, fetch pre-upgrade accounts
            if (status === 'complete') {
                const accountsRes = await DerivLegacyOptionsService.getLegacyAccounts(token);
                if (Array.isArray(accountsRes?.data)) {
                    setLegacyAccounts(accountsRes.data);
                }
            } else {
                setLegacyAccounts([]);
            }
        } catch (err: any) {
            console.warn('[useLegacyOptions] Failed to fetch legacy options data:', err?.message || err);
            setError(err?.message || 'Failed to fetch legacy options data');
        } finally {
            setIsLoading(false);
        }
    }, [explicitLoginId]);

    const fetchStatement = useCallback(
        async (loginid: string, limit = 50, offset = 0) => {
            const token = getLegacyDTraderToken(explicitLoginId);
            if (!token || !loginid) return;

            setIsLoading(true);
            try {
                const statementRes = await DerivLegacyOptionsService.getLegacyStatement(loginid, { limit, offset }, token);
                if (Array.isArray(statementRes?.data)) {
                    setLegacyStatement(statementRes.data);
                }
            } catch (err: any) {
                console.warn('[useLegacyOptions] Failed to fetch legacy statement:', err?.message || err);
                setError(err?.message || 'Failed to fetch statement');
            } finally {
                setIsLoading(false);
            }
        },
        [explicitLoginId]
    );

    useEffect(() => {
        refetch();
    }, [refetch]);

    return {
        migrationStatus,
        legacyAccounts,
        legacyStatement,
        isLoading,
        error,
        refetch,
        fetchStatement,
    };
};

export default useLegacyOptions;
