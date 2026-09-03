import React from 'react';

const useIsRtl = () => {
    const is_rtl = React.useMemo(() => {
        const lang = (localStorage.getItem('i18n_language') || 'EN').toUpperCase();
        return ['AR', 'HE'].includes(lang);
    }, []);

    return is_rtl;
};

export default useIsRtl;
