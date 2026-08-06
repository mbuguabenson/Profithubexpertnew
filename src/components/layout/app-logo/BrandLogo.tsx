import { observer } from 'mobx-react-lite';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import { getSiteConfig } from '@/utils/supabase-copy';

type TBrandLogoProps = {
    width?: number;
    height?: number;
    fill?: string;
    className?: string;
};

export const BrandLogo = observer(({ width, height = 32, className = '' }: TBrandLogoProps) => {
    const { is_dark_mode_on } = useThemeSwitcher();
    const cfg = getSiteConfig();
    const customLogo = cfg.logoBase64;

    const src = customLogo
        ? customLogo
        : is_dark_mode_on ? '/logo_dark.png' : '/logo_light.png';

    return (
        <img
            src={src}
            alt='Logo'
            style={{ width: width ? `${width}px` : 'auto', height: `${height}px`, display: 'block' }}
            className={className}
        />
    );
});
