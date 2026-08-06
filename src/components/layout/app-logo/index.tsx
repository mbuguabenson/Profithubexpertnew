// Updated to use brand configuration from brand.config.json
// Logo is now customizable for white-labeling
import brandConfig from '@/../brand.config.json';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import { BrandLogo } from './BrandLogo';
import './app-logo.scss';

export const AppLogo = () => {
    const { isDesktop } = useDevice();

    if (!isDesktop) return null;

    // Get logo configuration from brand.config.json
    const logoConfig = brandConfig.platform.logo;
    const logoUrl = logoConfig.link_url || '/';

    return (
        <a href={logoUrl} className='app-header__logo' aria-label={localize('Home')}>
            {/* Configurable brand logo from brand.config.json */}
            <BrandLogo width={isDesktop ? 120 : 90} height={isDesktop ? 32 : 24} fill='var(--text-general)' />
        </a>
    );
};
