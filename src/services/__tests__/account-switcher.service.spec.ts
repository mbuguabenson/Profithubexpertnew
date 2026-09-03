describe('AccountSwitcherService', () => {
    beforeEach(() => {
        jest.resetModules();
        localStorage.clear();
    });

    it('defers client state updates until authorize confirms the target account', async () => {
        const mockAuthorize = jest.fn();
        const clientStore = {
            account_list: [],
            setLoginId: jest.fn(),
            setBalance: jest.fn(),
            setCurrency: jest.fn(),
            setIsVirtual: jest.fn(),
            setWebSocketLoginId: jest.fn(),
            setIsLoggedIn: jest.fn(),
            setAccountList: jest.fn(),
        };

        const mockApiBase = {
            account_id: '',
            token: '',
            is_authorized: false,
            api: {
                connection: { readyState: WebSocket.OPEN },
                authorize: mockAuthorize,
                send: jest.fn(),
            },
        };

        jest.doMock('@/external/bot-skeleton/services/api/api-base', () => ({ api_base: mockApiBase }));
        jest.doMock('@/external/bot-skeleton/utils/observer', () => ({ observer: { emit: jest.fn() } }));
        jest.doMock('@/utils/token-bridge', () => ({
            getAccountsList: jest.fn(() => ({ CR123: 'token-for-cr123' })),
            getActiveToken: jest.fn(() => ''),
        }));
        jest.doMock('@/utils/account-helpers', () => ({
            isDemoAccount: jest.fn((loginid: string) => loginid.startsWith('V')), 
        }));

        const { AccountSwitcherService } = await import('../account-switcher.service');

        let resolveAuthorize: (value: any) => void;
        mockAuthorize.mockImplementation(
            () =>
                new Promise(resolve => {
                    resolveAuthorize = resolve;
                })
        );

        const switchPromise = AccountSwitcherService.switchAccount('CR123', clientStore);

        expect(clientStore.setLoginId).not.toHaveBeenCalled();
        expect(clientStore.setBalance).not.toHaveBeenCalled();

        resolveAuthorize!({
            authorize: {
                loginid: 'CR123',
                balance: 321,
                currency: 'USD',
                account_list: [{ loginid: 'CR123', currency: 'USD', balance: 321, is_virtual: 0 }],
                email: 'user@example.com',
                fullname: 'Test User',
                landing_company_name: 'svg',
                user_id: 42,
            },
        });

        await switchPromise;

        expect(clientStore.setLoginId).toHaveBeenCalledWith('CR123');
        expect(clientStore.setBalance).toHaveBeenCalledWith('321');
    });

    it('reuses the active interpreter instead of replacing it on a healthy session', async () => {
        const mockInterpreter = {
            bot: {
                tradeEngine: {
                    checkTicksPromiseExists: jest.fn(() => true),
                    watchTicks: jest.fn().mockResolvedValue(undefined),
                },
            },
            run: jest.fn().mockResolvedValue(undefined),
        };

        const mockApiBase = {
            is_stopping: false,
            is_running: false,
            is_authorized: true,
            api: { connection: { readyState: 1 } },
            setIsRunning: jest.fn(),
        };

        jest.doMock('@/external/bot-skeleton/services/api/api-base', () => ({ api_base: mockApiBase }));
        jest.doMock('@/external/bot-skeleton', () => ({
            observer: { register: jest.fn(), unregisterAll: jest.fn(), emit: jest.fn() },
        }));
        jest.doMock('@/external/bot-skeleton/services/tradeEngine/utils/interpreter', () => () => mockInterpreter);

        const { default: DBot } = await import('@/external/bot-skeleton/scratch/dbot');
        const bot = new DBot();
        bot.generateCode = jest.fn(() => 'var x = 1;');
        bot.interpreter = mockInterpreter;
        bot.symbol = 'R_100';

        await bot.runBot();

        expect(bot.interpreter).toBe(mockInterpreter);
        expect(mockInterpreter.run).toHaveBeenCalledWith('var x = 1;');
    });
});
