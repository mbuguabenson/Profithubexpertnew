// Updated to use brand configuration from brand.config.json
// Logo is now customizable for white-labeling
import brandConfig from '@/../brand.config.json';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import { BrandLogo } from './BrandLogo';
import './app-logo.scss';

/**
 * Mobile logo: Modern card with "PH" symbol, "profithub" below, "Powered by Deriv"
 * Desktop logo: Original BrandLogo component
 */
const MobileLogo = () => (
    <div className='app-header__mobile-logo'>
        <div className='app-header__mobile-logo-card'>
            <span className='app-header__mobile-logo-symbol'>PH</span>
        </div>
        <div className='app-header__mobile-logo-text'>
            <span className='app-header__mobile-logo-name'>profithub</span>
            <span className='app-header__mobile-logo-powered'>Powered by Deriv</span>
        </div>
    </div>
);

export const AppLogo = () => {
    const { isDesktop } = useDevice();

    // Get logo configuration from brand.config.json
    const logoConfig = brandConfig.platform.logo;
    const logoUrl = logoConfig.link_url || '/';

    return (
        <a href={logoUrl} className='app-header__logo' aria-label={localize('Home')}>
            {isDesktop ? (
                <BrandLogo width={120} height={32} fill='var(--text-general)' />
            ) : (
                <MobileLogo />
            )}
        </a>
    );
};
