import { observer } from 'mobx-react-lite';
import { getSiteConfig } from '@/utils/supabase-copy';
import { getBrandLabel } from '@/components/shared/utils/brand/brand';
import './app-logo.scss';

type TBrandLogoProps = {
    width?: number;
    height?: number;
    fill?: string;
    className?: string;
    showTagline?: boolean;
};

export const BrandLogo = observer(({ height = 36, className = '', showTagline = true }: TBrandLogoProps) => {
    const cfg = getSiteConfig();
    const customLogo = cfg?.logoBase64;
    const brandName = getBrandLabel() || 'Legacy Trading Hub';

    return (
        <div className={`lth-brand-logo ${className}`}>
            <div className='lth-brand-logo__row'>
                {customLogo ? (
                    <img
                        src={customLogo}
                        alt={brandName}
                        style={{ height: `${height}px`, width: 'auto', display: 'block', objectFit: 'contain' }}
                    />
                ) : (
                    <img
                        src='/logo_icon.svg'
                        alt={brandName}
                        className='lth-brand-logo__icon'
                        style={{
                            height: `${height}px`,
                            width: `${height}px`,
                        }}
                    />
                )}
                <div className='lth-brand-logo__text-col'>
                    <div className='lth-brand-logo__title-row'>
                        <span className='lth-brand-logo__legacy'>
                            LEGACY
                        </span>
                    </div>
                    <span className='lth-brand-logo__trading-hub'>
                        TRADING HUB
                    </span>
                    {showTagline && (
                        <span className='lth-brand-logo__subtitle'>
                            WHERE STRATEGY MEETS PRECISION.
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
});
