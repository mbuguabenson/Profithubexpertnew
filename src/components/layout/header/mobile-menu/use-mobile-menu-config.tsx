import { ComponentProps, ReactNode, useMemo } from 'react';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import RootStore from '@/stores/root-store';
import { LegacyLogout1pxIcon, LegacyTheme1pxIcon } from '@deriv/quill-icons/Legacy';
import { useTranslations } from '@deriv-com/translations';
import { ToggleSwitch } from '@deriv-com/ui';


export type TSubmenuSection = 'accountSettings' | 'cashier' | 'reports';

type TMenuConfig = {
    LeftComponent: React.ElementType;
    RightComponent?: ReactNode;
    as: 'a' | 'button';
    href?: string;
    label: ReactNode;
    onClick?: () => void;
    removeBorderBottom?: boolean;
    submenu?: TSubmenuSection;
    target?: ComponentProps<'a'>['target'];
    isActive?: boolean;
}[];

// Icon for Account Info in mobile menu
const UserIcon = ({ className }: { className?: string }) => (
    <svg
        className={className}
        viewBox='0 0 24 24'
        width='16'
        height='16'
        fill='currentColor'
        style={{ color: 'var(--text-general)' }}
    >
        <path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' />
    </svg>
);



// WhatsApp icon for mobile menu
const WhatsAppIcon = ({ className, iconSize: _iconSize }: { className?: string; iconSize?: string }) => (
    <svg
        className={className}
        viewBox='0 0 24 24'
        width='16'
        height='16'
        fill='currentColor'
        style={{ color: 'var(--text-general)' }}
    >
        <path d='M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.27 11.4 11.4 0 0 0 3.58.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .57 3.58 1 1 0 0 1-.27 1.02z' />
    </svg>
);

// Info icon for Risk Disclaimer
const InfoIcon = ({ className }: { className?: string }) => (
    <svg
        className={className}
        viewBox='0 0 24 24'
        width='16'
        height='16'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
        style={{ color: 'var(--text-general)' }}
    >
        <circle cx='12' cy='12' r='10' />
        <line x1='12' y1='16' x2='12' y2='12' />
        <line x1='12' y1='8' x2='12.01' y2='8' />
    </svg>
);

const useMobileMenuConfig = (
    client?: RootStore['client'],
    onLogout?: () => void,
    enableThemeToggle: boolean = true,
    onOpenDisclaimer?: () => void
) => {
    const { localize } = useTranslations();
    const { is_dark_mode_on, toggleTheme } = useThemeSwitcher();

    const menuConfig = useMemo((): TMenuConfig[] => {
        return [
            [
                // WhatsApp contact link (migrated from header)
                {
                    as: 'a',
                    label: localize('WhatsApp Support'),
                    LeftComponent: WhatsAppIcon,
                    href: 'https://wa.me/254757722344',
                    target: '_blank',
                },
                // Theme toggle (conditionally shown based on brand config)
                enableThemeToggle && {
                    as: 'button',
                    label: localize('Dark theme'),
                    LeftComponent: LegacyTheme1pxIcon,
                    RightComponent: <ToggleSwitch value={is_dark_mode_on} onChange={toggleTheme} />,
                },
            ].filter(Boolean) as TMenuConfig,
            [
                // Mobile Account Info Option
                client?.is_logged_in && {
                    as: 'button',
                    label: localize('Account Info'),
                    LeftComponent: UserIcon,
                    onClick: () => {
                        window.dispatchEvent(new Event('open_account_info'));
                    },
                },
                // Risk Disclaimer Option
                onOpenDisclaimer && {
                    as: 'button',
                    label: localize('Risk Disclaimer'),
                    LeftComponent: InfoIcon,
                    onClick: onOpenDisclaimer,
                },
            ].filter(Boolean) as TMenuConfig,
            [
                client?.is_logged_in &&
                    onLogout && {
                        as: 'button',
                        label: localize('Log out'),
                        LeftComponent: LegacyLogout1pxIcon,
                        onClick: onLogout,
                        removeBorderBottom: true,
                    },
            ].filter(Boolean) as TMenuConfig,
        ].filter(section => section.length > 0);
    }, [
        client,
        onLogout,
        is_dark_mode_on,
        toggleTheme,
        localize,
        enableThemeToggle,
    ]);

    // Check if menu has any items to determine if mobile menu should be shown
    const hasMenuItems = menuConfig.some(section => section.length > 0);

    return {
        config: menuConfig,
        hasMenuItems,
    };
};

export default useMobileMenuConfig;
