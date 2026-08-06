import { observer } from 'mobx-react-lite';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import { getSiteConfig } from '@/utils/supabase-copy';

type TBrandLogoProps = {
    width?: number;
    height?: number;
    fill?: string;
    className?: string;
};

export const BrandLogo = observer(({ height = 32, className = '' }: TBrandLogoProps) => {
    const { is_dark_mode_on } = useThemeSwitcher();
    const cfg = getSiteConfig();
    const customLogo = cfg.logoBase64;

    const src = customLogo
        ? customLogo
        : is_dark_mode_on ? '/logo_dark.png' : '/logo_light.png';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }} className={className}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <img
                    src={src}
                    alt='Profit Hub Logo'
                    style={{ height: `${height}px`, width: 'auto', display: 'block', objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.6))' }}
                />
                <span style={{ 
                    fontSize: '1.4rem', 
                    fontWeight: 800, 
                    background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)', 
                    WebkitBackgroundClip: 'text', 
                    WebkitTextFillColor: 'transparent',
                    letterSpacing: '0.5px'
                }}>Pfhub</span>
            </div>
            <div style={{ 
                fontSize: '0.65rem', 
                color: 'var(--text-less-prominent)', 
                marginTop: '0px', 
                marginLeft: '42px', 
                letterSpacing: '0.5px',
                fontWeight: 600,
                textTransform: 'uppercase'
            }}>
                Powered by Deriv
            </div>
        </div>
    );
});
