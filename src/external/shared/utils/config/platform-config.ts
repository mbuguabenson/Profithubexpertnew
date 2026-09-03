import React from 'react';
import { getInitialLanguage } from '@deriv/translations';
import { setLocale, initMoment } from '../date';
import { routes } from '../routes';
import { getDomainUrl } from '../url';

type TPlatform = {
    icon_text?: string;
    is_hard_redirect: boolean;
    platform_name: string;
    route_to_path: string;
    url?: string;
};

type TPlatforms = Record<'p2p' | 'p2p_v2' | 'derivgo' | 'tradershub_os', TPlatform>;
export const tradershub_os_url =
    process.env.NODE_ENV === 'production'
        ? `https://hub.${getDomainUrl()}/tradershub`
        : `https://staging-hub.${getDomainUrl()}/tradershub`;

// TODO: This should be moved to PlatformContext
export const platforms: TPlatforms = {
    p2p: {
        icon_text: undefined,
        is_hard_redirect: true,
        platform_name: 'Deriv P2P',
        route_to_path: routes.cashier_p2p,
        url: 'https://app.deriv.com/cashier/p2p',
    },
    derivgo: {
        icon_text: undefined,
        is_hard_redirect: true,
        platform_name: 'Deriv GO',
        route_to_path: '',
        url: 'https://app.deriv.com/redirect/derivgo',
    },
    p2p_v2: {
        icon_text: undefined,
        is_hard_redirect: true,
        platform_name: 'Deriv P2P',
        route_to_path: '',
        url: process.env.NODE_ENV === 'production' ? 'https://p2p.deriv.com' : 'https://staging-p2p.deriv.com',
    },
    tradershub_os: {
        icon_text: undefined,
        is_hard_redirect: true,
        platform_name: 'TradersHub',
        route_to_path: '',
        url: tradershub_os_url,
    },
};

export const useOnLoadTranslation = () => {
    const [is_loaded, setLoaded] = React.useState(true);

    React.useEffect(() => {
        const lang = getInitialLanguage();
        (async () => {
            await initMoment(lang);
            await setLocale(lang);
        })();
        setLoaded(true);
    }, []);

    return [is_loaded, setLoaded];
};
