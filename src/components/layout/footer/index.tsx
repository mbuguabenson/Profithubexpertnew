// Updated to include WhatsApp contact link and ensure theme toggle is always present
// Controls language settings and theme toggle via brand.config.json
import brandConfig from '@/../brand.config.json';
import { useApiBase } from '@/hooks/useApiBase';
import useModalManager from '@/hooks/useModalManager';
import { getActiveTabUrl } from '@/utils/getActiveTabUrl';
import { FILTERED_LANGUAGES } from '@/utils/languages';
import { isLoggedIn } from '@/utils/token-bridge';
import { useTranslations } from '@deriv-com/translations';
import { DesktopLanguagesModal, useDevice, Tooltip } from '@deriv-com/ui';
import { LabelPairedUserMdRegularIcon } from '@deriv/quill-icons/LabelPaired';
import ChangeTheme from './ChangeTheme';
import FullScreen from './FullScreen';
import LanguageSettings from './LanguageSettings';
import LogoutFooter from './LogoutFooter';
import NetworkStatus from './NetworkStatus';
import ServerTime from './ServerTime';
import './footer.scss';

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp icon button (moved from header)
// ─────────────────────────────────────────────────────────────────────────────
const WhatsAppFooterLink = () => (
    <a
        href='https://wa.me/254757722344'
        target='_blank'
        rel='noopener noreferrer'
        className='app-footer__whatsapp'
        title='Contact us on WhatsApp'
        aria-label='Contact on WhatsApp'
    >
        <svg viewBox='0 0 24 24' width='16' height='16' fill='currentColor'>
            <path d='M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.27 11.4 11.4 0 0 0 3.58.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .57 3.58 1 1 0 0 1-.27 1.02z' />
        </svg>
    </a>
);

const Footer = () => {
    const { currentLang = 'EN', localize, switchLanguage } = useTranslations();
    const { hideModal, isModalOpenFor, showModal } = useModalManager();
    const { isAuthorized } = useApiBase();

    // Get footer configuration from brand.config.json
    const enableLanguageSettings = brandConfig.platform.footer?.enable_language_settings ?? true;
    const enableThemeToggle = brandConfig.platform.footer?.enable_theme_toggle ?? true;

    const { isDesktop } = useDevice();

    const openLanguageSettingModal = () => showModal('DesktopLanguagesModal');

    return (
        <footer className='app-footer'>
            <FullScreen />
            {(isAuthorized || isLoggedIn()) && <LogoutFooter />}
            <div className='app-footer__vertical-line' />

            {/* Account Info Modal (Desktop) */}
            {isDesktop && (isAuthorized || isLoggedIn()) && (
                <>
                    <Tooltip
                        as='button'
                        className='app-footer__icon'
                        onClick={() => window.dispatchEvent(new Event('open_account_info'))}
                        tooltipContent={localize('Account Info')}
                    >
                        <LabelPairedUserMdRegularIcon fill='var(--text-general)' width={16} height={16} />
                    </Tooltip>
                    <div className='app-footer__vertical-line' />
                </>
            )}

            {/* WhatsApp contact link (migrated from header) */}
            <>
                <WhatsAppFooterLink />
                <div className='app-footer__vertical-line' />
            </>

            {/* Language settings */}
            {enableLanguageSettings && (
                <>
                    <LanguageSettings openLanguageSettingModal={openLanguageSettingModal} />
                    <div className='app-footer__vertical-line' />
                </>
            )}

            {/* Theme toggle */}
            {enableThemeToggle && (
                <>
                    <ChangeTheme />
                    <div className='app-footer__vertical-line' />
                </>
            )}

            <ServerTime />
            <div className='app-footer__vertical-line' />
            <NetworkStatus />

            {/* Language modal */}
            {enableLanguageSettings && isModalOpenFor('DesktopLanguagesModal') && (
                <DesktopLanguagesModal
                    headerTitle={localize('Select Language')}
                    isModalOpen
                    languages={FILTERED_LANGUAGES as any}
                    onClose={hideModal}
                    onLanguageSwitch={code => {
                        try {
                            switchLanguage(code);
                            hideModal();
                            window.location.replace(getActiveTabUrl());
                        } catch (error) {
                            console.error('Failed to switch language:', error);
                            hideModal();
                        }
                    }}
                    selectedLanguage={currentLang}
                />
            )}
        </footer>
    );
};

export default Footer;
