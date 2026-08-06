// Updated to use brand configuration from brand.config.json
// Logo is now customizable for white-labeling
import brandConfig from '@/../brand.config.json';
import { localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import { BrandLogo } from './BrandLogo';
import './app-logo.scss';

export const AppLogo = () => {
    const { isDesktop } = useDevice();

    // Get logo configuration from brand.config.json
    const logoConfig = brandConfig.platform.logo;
    const logoUrl = logoConfig.link_url || '/';
    const brandName = brandConfig.platform.name || 'ProfitHub';

    return (
        <a href={logoUrl} className='app-header__logo' aria-label={localize('Home')} style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            {/* Configurable brand logo from brand.config.json */}
            <BrandLogo width={isDesktop ? 120 : 90} height={isDesktop ? 32 : 24} fill='var(--text-general)' />
            {!isDesktop && (
                <span className="app-header__site-name" style={{ color: 'var(--text-general)', fontWeight: 'bold', fontSize: '14px' }}>
                    {brandName}
                </span>
            )}
        </a>
    );
};
