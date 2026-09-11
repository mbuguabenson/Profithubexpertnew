import config_data from '../../../../../brand.config.json';

type TLandingCompany = {
    fx: string;
    malta: string;
    maltainvest: string;
    mx: string;
    samoa: string;
    svg: string;
    v: string;
};

type TPlatform = {
    name: string;
    icon: string;
};

type TPlatformAppstore = {
    name: string;
    icon: string;
    availability: string;
};

type TPlatforms = {
    ctrader: TPlatform;
    trader: TPlatform;
    dbot: TPlatform;
    mt5: TPlatform;
    dxtrade: TPlatform;
    smarttrader: TPlatform;
    go: TPlatform;
};

type TPlatformsAppstore = {
    ctrader: TPlatformAppstore;
    trader: TPlatformAppstore;
    dbot: TPlatformAppstore;
    smarttrader: TPlatformAppstore;
    go: TPlatformAppstore;
};

const isDomainAllowed = (domain_name: string) => {
    // This regex will match any official deriv production and testing domain names.
    // Allowed deriv domains: localhost, binary.sx, binary.com, deriv.com, deriv.be, deriv.me and their subdomains.
    return /^(((.*)\.)?(localhost:8443|pages.dev|binary\.(sx|com)|deriv.(com|me|be|dev)))$/.test(domain_name);
};

export const getLegalEntityName = (landing_company: keyof TLandingCompany) => {
    return (config_data as any).legal_entities?.[landing_company] || landing_company;
};

export const getBrandWebsiteName = () => {
    return config_data.domain_name;
};

export const getPlatformSettings = (platform_key: keyof TPlatforms): TPlatform => {
    const default_platforms: Record<string, TPlatform> = {
        ctrader: { name: 'cTrader', icon: '' },
        trader: { name: 'DTrader', icon: 'IcBrandDtrader' },
        dbot: { name: 'DBot', icon: 'IcBrandDbot' },
        mt5: { name: 'Deriv MT5', icon: 'IcBrandDmt5' },
        dxtrade: { name: 'Deriv X', icon: 'IcBrandDxtrade' },
        smarttrader: { name: 'SmartTrader', icon: 'IcBrandSmarttrader' },
        go: { name: 'Deriv GO', icon: 'IcBrandDerivGo' },
    };

    const platforms = (config_data as any).platforms || default_platforms;
    const allowed_config_data = { ...(platforms[platform_key] || default_platforms[platform_key] || { name: String(platform_key), icon: '' }) };

    if (!isDomainAllowed(window.location.host)) {
        // Remove all official platform logos if the app is hosted under unofficial domain
        allowed_config_data.icon = '';
    }

    return allowed_config_data;
};

export const getAppstorePlatforms = () => {
    const platform_data: Record<string, Record<string, string>> = (config_data as any).platforms_appstore || {};
    return Object.keys(platform_data).map(key => platform_data[key]);
};

export const getPlatformSettingsAppstore = (platform_key: keyof TPlatformsAppstore): TPlatformAppstore => {
    return (config_data as any).platforms_appstore?.[platform_key] || { name: String(platform_key), icon: '', availability: 'all' };
};

export const getDomainName = () => {
    // Split the hostname into parts
    const domainParts = window.location.hostname.split('.');

    // Ensure we have at least two parts (SLD and TLD)
    if (domainParts.length >= 2) {
        // Combine the SLD and TLD
        const domain = `${domainParts[domainParts.length - 2]}.${domainParts[domainParts.length - 1]}`;
        return domain;
    }

    return '';
};
