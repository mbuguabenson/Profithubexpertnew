import { DerivWSAccountsService } from '../derivws-accounts.service';

describe('DerivWSAccountsService - createAccount', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        DerivWSAccountsService.clearCache();
        localStorage.clear();
        sessionStorage.clear();
        global.fetch = jest.fn();
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it('successfully creates a demo options account (201 Created)', async () => {
        const mockResponse = {
            data: [
                {
                    account_id: 'DOT90004580',
                    balance: 10000,
                    currency: 'USD',
                    group: 'row',
                    status: 'active',
                    account_type: 'demo',
                },
            ],
            meta: {
                endpoint: '/accounts',
                method: 'POST',
                timing: 345,
            },
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 201,
            json: async () => mockResponse,
        });

        const account = await DerivWSAccountsService.createAccount('valid-access-token', {
            account_type: 'demo',
            currency: 'USD',
            group: 'row',
        });

        expect(account).toEqual({
            account_id: 'DOT90004580',
            balance: '10000',
            currency: 'USD',
            group: 'row',
            status: 'active',
            account_type: 'demo',
        });

        // Verify stored accounts
        const stored = DerivWSAccountsService.getStoredAccounts();
        expect(stored).toHaveLength(1);
        expect(stored?.[0].account_id).toBe('DOT90004580');

        // Verify fetch was called with correct endpoint and headers
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/trading/v1/options/accounts'),
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer valid-access-token',
                    'Content-Type': 'application/json',
                }),
                body: JSON.stringify({
                    currency: 'USD',
                    group: 'row',
                    account_type: 'demo',
                }),
            })
        );
    });

    it('handles existing account response (200 OK)', async () => {
        const mockResponse = {
            data: {
                account_id: 'DOT90004580',
                balance: 10000,
                currency: 'USD',
                group: 'row',
                status: 'active',
                account_type: 'demo',
            },
            meta: {
                endpoint: '/accounts',
                method: 'POST',
                timing: 245,
            },
        };

        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => mockResponse,
        });

        const account = await DerivWSAccountsService.createAccount('valid-access-token', {
            account_type: 'demo',
        });

        expect(account.account_id).toBe('DOT90004580');
        expect(account.balance).toBe('10000');
    });

    it('throws error when access token is missing', async () => {
        await expect(
            DerivWSAccountsService.createAccount('', {
                account_type: 'demo',
            })
        ).rejects.toThrow('Deriv OAuth access token is required');
    });

    it('throws error when account_type is invalid', async () => {
        await expect(
            DerivWSAccountsService.createAccount('token', {
                account_type: 'invalid' as any,
            })
        ).rejects.toThrow('Invalid account_type');
    });

    it('throws descriptive error on 400 Bad Request', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            json: async () => ({
                errors: [
                    {
                        status: 400,
                        code: 'FieldIsRequired',
                        message: 'currency field is required',
                    },
                ],
            }),
        });

        await expect(
            DerivWSAccountsService.createAccount('token', {
                account_type: 'demo',
            })
        ).rejects.toThrow('currency field is required');
    });

    it('throws descriptive error on 403 Forbidden', async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
            json: async () => ({
                errors: [
                    {
                        status: 403,
                        code: 'AccessDenied',
                        message: 'You do not have permission to access this resource',
                    },
                ],
            }),
        });

        await expect(
            DerivWSAccountsService.createAccount('token', {
                account_type: 'real',
            })
        ).rejects.toThrow('You do not have permission to access this resource');
    });
});
