import { observer } from 'mobx-react-lite';
import { getSiteConfig } from '@/utils/supabase-copy';
import { getBrandLabel } from '@/components/shared/utils/brand/brand';

type TBrandLogoProps = {
    width?: number;
    height?: number;
    fill?: string;
    className?: string;
    showTagline?: boolean;
};

export const BrandLogo = observer(({ height = 34, className = '', showTagline = true }: TBrandLogoProps) => {
    const cfg = getSiteConfig();
    const customLogo = cfg?.logoBase64;
    const brandName = getBrandLabel() || 'ProfitHub';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }} className={className}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                        style={{
                            height: `${height}px`,
                            width: `${height}px`,
                            display: 'block',
                            objectFit: 'contain',
                            filter: 'drop-shadow(0 0 10px rgba(124, 58, 237, 0.45))',
                        }}
                    />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <span style={{ 
                            fontSize: '1.25rem', 
                            fontWeight: 900, 
                            color: '#ffffff',
                            letterSpacing: '0.8px',
                            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                        }}>PROFIT</span>
                        <span style={{ 
                            fontSize: '1.25rem', 
                            fontWeight: 900, 
                            background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', 
                            WebkitBackgroundClip: 'text', 
                            WebkitTextFillColor: 'transparent',
                            letterSpacing: '0.8px',
                            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                        }}>HUB</span>
                    </div>
                    {showTagline && (
                        <span style={{ 
                            fontSize: '0.55rem', 
                            color: 'rgba(255, 255, 255, 0.55)', 
                            marginTop: '2px', 
                            letterSpacing: '1px',
                            fontWeight: 700,
                            textTransform: 'uppercase'
                        }}>
                            EXPERT ALGO TRADING
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
});

