import { localize } from '@deriv-com/translations';

export const getDefaultError = () => ({
    header: localize('Application Notice'),
    description: localize('A temporary connection or render update occurred.'),
    cta_label: localize('Continue'),
});

export const getAuthError = () => ({
    header: localize('The token is invalid'),
    description: localize('Please log in'),
    cta_label: localize('Log in'),
});

export const STATUS_CODES = Object.freeze({
    NONE: 'none',
    PENDING: 'pending',
    REJECTED: 'rejected',
    VERIFIED: 'verified',
    EXPIRED: 'expired',
    SUSPECTED: 'suspected',
});
