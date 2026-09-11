/**
 * deriv-legacy-options.service.ts
 *
 * Implements Deriv Options Trading (Legacy) REST API:
 * https://developers.deriv.com/docs/options-legacy/
 *
 * Header requirements:
 * - OAuth token: send Authorization: Bearer <token>; do NOT add Deriv-App-ID.
 * - Personal Access Token (PAT): send Authorization: Bearer <token> and Deriv-App-ID header.
 *
 * Endpoints:
 * - GET /trading/v1/options/legacy/migration-status
 * - GET /trading/v1/options/legacy/accounts
 * - GET /trading/v1/options/legacy/statement
 */

import { isProduction } from '@/components/shared';
import brandConfig from '../../brand.config.json';
import { getActiveToken, getDerivAuthHeaders } from '@/utils/token-bridge';

export type LegacyMigrationStatus = 'complete' | 'pending' | 'failed' | 'not_applicable';

export interface MigrationStatusResponse {
    data: {
        status: LegacyMigrationStatus;
        upgrade_date?: string | null;
        message?: string;
    };
    meta?: Record<string, any>;
}

export interface LegacyOptionsAccount {
    loginid: string;
    account_type: 'demo' | 'real';
    currency: string;
    balance?: number;
    landing_company_name?: string;
    is_virtual?: number;
}

export interface LegacyAccountsResponse {
    data: LegacyOptionsAccount[];
    meta?: Record<string, any>;
}

export interface LegacyStatementTransaction {
    contract_id?: number;
    transaction_id: number;
    action_type: 'buy' | 'sell' | 'deposit' | 'withdrawal' | string;
    amount: number;
    balance_after: number;
    transaction_time: number;
    shortcode?: string;
    longcode?: string;
    payout?: number;
    purchase_time?: number;
}

export interface LegacyStatementResponse {
    data: LegacyStatementTransaction[];
    meta?: {
        count: number;
        limit: number;
        offset: number;
    };
}

export class DerivLegacyOptionsService {
    /**
     * Resolves the Deriv REST API base URL based on active environment.
     */
    public static getBaseURL(): string {
        const environment = isProduction() ? 'production' : 'staging';
        return (brandConfig as any)?.platform?.derivws?.url?.[environment] || 'https://api.derivws.com';
    }

    /**
     * Returns request headers adhering strictly to Deriv documentation:
     * - OAuth token: send Authorization: Bearer <token>; do NOT add Deriv-App-ID.
     * - Personal Access Token: send Authorization: Bearer <token> and Deriv-App-ID header.
     */
    public static getHeaders(explicitToken?: string): Record<string, string> {
        const token = explicitToken || getActiveToken() || '';
        if (!token) {
            throw new Error('No valid Deriv authorization token found for legacy options request.');
        }
        return getDerivAuthHeaders(token);
    }

    /**
     * GET /trading/v1/options/legacy/migration-status
     *
     * Returns the current state of the authenticated user's platform upgrade.
     * While status is 'pending' or 'failed', legacy accounts & statement return HTTP 409.
     */
    public static async getMigrationStatus(explicitToken?: string): Promise<MigrationStatusResponse> {
        const baseUrl = this.getBaseURL();
        const headers = this.getHeaders(explicitToken);

        const response = await fetch(`${baseUrl}/trading/v1/options/legacy/migration-status`, {
            method: 'GET',
            headers,
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Migration status request failed (${response.status}): ${errorBody}`);
        }

        return response.json();
    }

    /**
     * GET /trading/v1/options/legacy/accounts
     *
     * List the authenticated user's legacy options accounts, grouped by loginid.
     * Returns HTTP 409 if migration is still pending or failed.
     */
    public static async getLegacyAccounts(explicitToken?: string): Promise<LegacyAccountsResponse> {
        const baseUrl = this.getBaseURL();
        const headers = this.getHeaders(explicitToken);

        const response = await fetch(`${baseUrl}/trading/v1/options/legacy/accounts`, {
            method: 'GET',
            headers,
        });

        if (response.status === 409) {
            return {
                data: [],
                meta: {
                    migrationConflict: true,
                    message: 'User migration is pending or failed. Legacy accounts unavailable.',
                },
            };
        }

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Legacy accounts request failed (${response.status}): ${errorBody}`);
        }

        return response.json();
    }

    /**
     * GET /trading/v1/options/legacy/statement
     *
     * Get the historical transaction statement from the legacy options platform.
     * @param loginid The account login ID (e.g. CR123456 or VRTC123456)
     * @param options Pagination parameters (limit, offset)
     */
    public static async getLegacyStatement(
        loginid: string,
        options: { limit?: number; offset?: number } = {},
        explicitToken?: string
    ): Promise<LegacyStatementResponse> {
        if (!loginid) {
            throw new Error('loginid parameter is required for legacy statement query.');
        }

        const baseUrl = this.getBaseURL();
        const headers = this.getHeaders(explicitToken);
        const params = new URLSearchParams();
        params.set('loginid', loginid);
        if (options.limit !== undefined) params.set('limit', String(options.limit));
        if (options.offset !== undefined) params.set('offset', String(options.offset));

        const response = await fetch(`${baseUrl}/trading/v1/options/legacy/statement?${params.toString()}`, {
            method: 'GET',
            headers,
        });

        if (response.status === 409) {
            return {
                data: [],
                meta: {
                    count: 0,
                    limit: options.limit || 50,
                    offset: options.offset || 0,
                },
            };
        }

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Legacy statement request failed (${response.status}): ${errorBody}`);
        }

        return response.json();
    }
}
