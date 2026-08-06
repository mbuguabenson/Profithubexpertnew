import { observer } from 'mobx-react-lite';
import { addComma, getCurrencyDisplayCode, getDecimalPlaces } from '@/components/shared';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { isDemoAccount } from '@/utils/account-helpers';
import { LegacyWalletIcon } from '@deriv/quill-icons/Legacy';
import { LabelPairedUserMdRegularIcon } from '@deriv/quill-icons/LabelPaired';
import { localize } from '@deriv-com/translations';
import './AccountInfoModal.scss';

type TAccountInfoModalProps = {
    isOpen: boolean;
    onClose: () => void;
};

const AccountInfoModal = observer(({ isOpen, onClose }: TAccountInfoModalProps) => {
    const { accountList } = useApiBase();
    const { client } = useStore() ?? {};

    // Get display settings
    const displayCurrency = (localStorage.getItem('converter_display_currency') as 'USD' | 'KES') || 'USD';
    const rate = parseFloat(localStorage.getItem('converter_kes_rate') || '129.5');

    if (!isOpen) return null;

    return (
        <div className='account-info-modal__overlay' onClick={onClose}>
            <div className='account-info-modal__container' onClick={e => e.stopPropagation()}>
                <div className='account-info-modal__header'>
                    <div className='account-info-modal__title-group'>
                        <LabelPairedUserMdRegularIcon fill='#f5c542' width={20} height={20} />
                        <h3>{localize('Account & Wallet Status')}</h3>
                    </div>
                    <button className='account-info-modal__close' onClick={onClose} aria-label='Close'>
                        ✕
                    </button>
                </div>

                <div className='account-info-modal__body'>
                    {/* Wallets & Funds Section */}
                    <div className='account-info-modal__section'>
                        <h4 className='account-info-modal__section-title'>
                            <LegacyWalletIcon iconSize='xs' fill='var(--text-general)' />
                            <span>{localize('Wallets & Balances')}</span>
                        </h4>
                        <div className='account-info-modal__accounts-list'>
                            {accountList && accountList.length > 0 ? (
                                accountList.map(acc => {
                                    const accCurr = acc.currency || 'USD';
                                    const balanceNum = Number(acc.balance ?? 0);
                                    const isDemo = isDemoAccount(acc.loginid);

                                    // Calc display balance
                                    const displayBal =
                                        displayCurrency === 'KES' && accCurr === 'USD'
                                            ? new Intl.NumberFormat('en-US', {
                                                  minimumFractionDigits: 2,
                                                  maximumFractionDigits: 2,
                                              }).format(balanceNum * rate)
                                            : addComma(balanceNum.toFixed(getDecimalPlaces(accCurr)));
                                    const displayCurr =
                                        displayCurrency === 'KES' && accCurr === 'USD'
                                            ? 'KES'
                                            : getCurrencyDisplayCode(accCurr);

                                    const isActive = acc.loginid === client?.loginid;

                                    return (
                                        <div
                                            key={acc.loginid}
                                            className={`account-info-modal__account-card ${
                                                isActive ? 'account-info-modal__account-card--active' : ''
                                            }`}
                                        >
                                            <div className='account-info-modal__account-id-group'>
                                                <span className='account-info-modal__account-id'>{acc.loginid}</span>
                                                <span
                                                    className={`account-info-modal__badge ${
                                                        isDemo ? 'account-info-modal__badge--demo' : 'account-info-modal__badge--real'
                                                    }`}
                                                >
                                                    {isDemo ? localize('Demo') : localize('Real')}
                                                </span>
                                                {isActive && (
                                                    <span className='account-info-modal__active-indicator'>
                                                        {localize('Active')}
                                                    </span>
                                                )}
                                            </div>
                                            <div className='account-info-modal__account-balance'>
                                                <span className='account-info-modal__balance-val'>{displayBal}</span>
                                                <span className='account-info-modal__balance-curr'>{displayCurr}</span>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className='account-info-modal__empty'>
                                    {localize('No connected accounts found. Please log in.')}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Developer Documentation Links */}
                    <div className='account-info-modal__section'>
                        <h4 className='account-info-modal__section-title'>{localize('Developer References')}</h4>
                        <div className='account-info-modal__links'>
                            <a
                                href='https://developers.deriv.com/docs/wallet/'
                                target='_blank'
                                rel='noopener noreferrer'
                                className='account-info-modal__link-card'
                            >
                                <span className='account-info-modal__link-title'>Deriv Wallet API Docs ↗</span>
                                <p className='account-info-modal__link-desc'>
                                    {localize('Reference details on wallets, deposits, and withdrawal APIs.')}
                                </p>
                            </a>
                            <a
                                href='https://developers.deriv.com/docs/account/'
                                target='_blank'
                                rel='noopener noreferrer'
                                className='account-info-modal__link-card'
                            >
                                <span className='account-info-modal__link-title'>Deriv Account API Docs ↗</span>
                                <p className='account-info-modal__link-desc'>
                                    {localize('Reference details on authorization, preferences, and account metadata.')}
                                </p>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default AccountInfoModal;
