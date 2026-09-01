import { isInvalidBearerToken } from '../token-bridge';

describe('token-bridge auth validation', () => {
    it('allows valid JWT/OAuth access tokens to pass validation', () => {
        const jwtLikeToken =
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature';
        const oauthToken = 'eyJzdWIiOiJ1c2VyIiwiY2xpZW50X2lkIjoiY2xpZW50In0.abc123';

        expect(isInvalidBearerToken(jwtLikeToken)).toBe(false);
        expect(isInvalidBearerToken(oauthToken)).toBe(false);
        expect(isInvalidBearerToken('a1-guest')).toBe(true);
        expect(isInvalidBearerToken('guest')).toBe(true);
        expect(isInvalidBearerToken(null)).toBe(true);
    });

    it('only rejects empty, placeholder, or blank tokens', () => {
        expect(isInvalidBearerToken('')).toBe(true);
        expect(isInvalidBearerToken('null')).toBe(true);
        expect(isInvalidBearerToken('undefined')).toBe(true);
        expect(isInvalidBearerToken('   ')).toBe(false);
    });
});
