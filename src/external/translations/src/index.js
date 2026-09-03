import * as DerivTranslations from '@deriv-com/translations';

export * from '@deriv-com/translations';

export const getLanguage = () => (localStorage.getItem('i18n_language') || 'EN').toUpperCase();
export const currentLanguage = getLanguage();

export default {
    ...DerivTranslations,
    getLanguage,
    currentLanguage,
};
