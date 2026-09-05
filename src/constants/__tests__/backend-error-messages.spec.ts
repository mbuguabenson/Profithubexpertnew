import { getBackendErrorMessages, getLocalizedErrorMessage } from '../backend-error-messages';

// Mock the localize function
jest.mock('@deriv-com/translations', () => ({
    localize: jest.fn((message, params) => {
        // Simple mock that replaces {{param}} with actual values
        let result = message;
        if (params) {
            Object.keys(params).forEach(key => {
                result = result.replace(new RegExp(`{{${key}}}`, 'g'), params[key]);
            });
        }
        return result;
    }),
}));

describe('Backend Error Messages', () => {
    describe('getBackendErrorMessages', () => {
        it('should return all error message mappings', () => {
            const errorMessages = getBackendErrorMessages();

            // Test that we have the main backend errors
            expect(errorMessages.AccountBalanceExceedsLimit).toBeDefined();
            expect(errorMessages.InsufficientBalance).toBeDefined();
            expect(errorMessages.InvalidContractType).toBeDefined();

            // Test that we have bot-skeleton specific errors
            expect(errorMessages.RateLimit).toBeDefined();
            expect(errorMessages.NotInitialized).toBeDefined();
            expect(errorMessages.ProposalsNotReady).toBeDefined();
        });

        it('should have all original backend error codes', () => {
            const errorMessages = getBackendErrorMessages();
            const originalErrorCodes = [
                'AccountBalanceExceedsLimit',
                'AlreadyExpired',
                'AuthorizationRequired',
                'BarrierNotAllowed',
                'InsufficientBalance',
                'InvalidContractType',
                'MarketIsClosed',
                'PriceMoved',
                'RateLimitExceeded',
                'TradingDisabled',
            ];

            originalErrorCodes.forEach(code => {
                expect(errorMessages[code as keyof typeof errorMessages]).toBeDefined();
            });
        });
    });

    describe('getLocalizedErrorMessage', () => {
        it('should return localized message for known error code', () => {
            const message = getLocalizedErrorMessage('InsufficientBalance');
            expect(message).toContain('insufficient');
        });

        it('should handle parameters correctly', () => {
            const message = getLocalizedErrorMessage('AccountBalanceExceedsLimit', {
                _1: '1000 USD',
                _2: '500 USD',
            });
            expect(message).toContain('1000 USD');
            expect(message).toContain('500 USD');
        });

        it('should return fallback message for unknown error code', () => {
            const message = getLocalizedErrorMessage('UnknownErrorCode');
            expect(message).toBe('An error occurred. Please try again.');
        });

        it('should handle bot-skeleton specific errors', () => {
            const message = getLocalizedErrorMessage('RateLimit', {
                message_type: 'buy',
                delay: '5',
                request: '12345',
            });
            expect(message).toContain('buy');
            expect(message).toContain('5');
            expect(message).toContain('12345');
        });

        it('should extract parameters from raw backend message for InvalidtoBuy without code_args', () => {
            const message = getLocalizedErrorMessage('InvalidtoBuy', {
                code: 'InvalidtoBuy',
                message: 'Minimum stake of 0.35 and maximum payout of 50000. Current payout is 0.20.',
            });
            expect(message).not.toContain('{{param');
            expect(message).toContain('0.35');
            expect(message).toContain('50000');
            expect(message).toContain('0.20');
        });

        it('should not display raw template placeholders if errorResponse is a string with numbers', () => {
            const message = getLocalizedErrorMessage('InvalidtoBuy', {
                error: {
                    code: 'InvalidtoBuy',
                    message: 'Minimum stake of 0.50 and maximum payout of 20000. Current payout is 0.10.',
                },
            });
            expect(message).not.toContain('{{param1}}');
            expect(message).not.toContain('{{param2}}');
            expect(message).not.toContain('{{param3}}');
            expect(message).toContain('0.50');
            expect(message).toContain('20000');
            expect(message).toContain('0.10');
        });

        it('should never expose unresolved {{param}} placeholders in output', () => {
            const message = getLocalizedErrorMessage('InvalidtoBuy');
            expect(message).not.toContain('{{param1}}');
            expect(message).not.toContain('{{param2}}');
            expect(message).not.toContain('{{param3}}');
        });
    });
});
