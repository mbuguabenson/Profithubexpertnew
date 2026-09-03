module.exports = {
    localize: (str) => str,
    Localize: ({ i18n_default_text }) => i18n_default_text,
    getInitialLanguage: () => 'en',
    useTranslations: () => ({ localize: (str) => str }),
};
