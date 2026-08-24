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

export const BrandLogo = observer(({ height = 36, className = '', showTagline = true }: TBrandLogoProps) => {
    const cfg = getSiteConfig();
    const customLogo = cfg?.logoBase64;
    const brandName = getBrandLabel() || 'ProfitHub Expert';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', userSelect: 'none' }} className={className}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
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
                            filter: 'drop-shadow(0 0 14px rgba(0, 242, 254, 0.45)) drop-shadow(0 0 8px rgba(124, 58, 237, 0.35))',
                            transition: 'transform 0.25s ease',
                        }}
                    />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <span style={{ 
                            fontSize: '1.35rem', 
                            fontWeight: 900, 
                            color: '#ffffff',
                            letterSpacing: '0.6px',
                            fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif",
                            textShadow: '0 2px 10px rgba(0, 0, 0, 0.5)'
                        }}>PROFIT</span>
                        <span style={{ 
                            fontSize: '1.35rem', 
                            fontWeight: 900, 
                            background: 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 40%, #a855f7 100%)', 
                            WebkitBackgroundClip: 'text', 
                            WebkitTextFillColor: 'transparent',
                            letterSpacing: '0.6px',
                            fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif"
                        }}>HUB</span>
                        <span style={{
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(245, 197, 66, 0.2))',
                            color: '#10b981',
                            border: '1px solid rgba(16, 185, 129, 0.5)',
                            padding: '1px 5px',
                            borderRadius: '5px',
                            marginLeft: '4px',
                            letterSpacing: '0.5px',
                            textTransform: 'uppercase'
                        }}>EXPERT</span>
                    </div>
                    {showTagline && (
                        <span style={{ 
                            fontSize: '0.58rem', 
                            color: '#94a3b8', 
                            marginTop: '2px', 
                            letterSpacing: '1.2px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            fontFamily: 'monospace'
                        }}>
                            ALGORITHMIC TRADING SUITE
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
});
