import React, { useState, useEffect } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import Text from '@/components/shared_ui/text';
import Button from '@/components/shared_ui/button';
import Dialog from '@/components/shared_ui/dialog';
import MobileFullPageModal from '@/components/shared_ui/mobile-full-page-modal';
import { Localize, localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import './risk-disclaimer.scss';

const RISK_DISCLAIMER_ACKNOWLEDGED_KEY = 'risk_disclaimer_acknowledged';

type TRiskDisclaimerProps = {
    is_mobile?: boolean;
    is_modal?: boolean;
    onClose?: () => void;
    is_open?: boolean;
};

const RiskDisclaimer = observer(({ is_mobile, is_modal = false, onClose, is_open = true }: TRiskDisclaimerProps) => {
    const { isDesktop } = useDevice();
    const [isAcknowledged, setIsAcknowledged] = useState(() => {
        return localStorage.getItem(RISK_DISCLAIMER_ACKNOWLEDGED_KEY) === 'true';
    });

    const handleAcknowledge = () => {
        setIsAcknowledged(true);
        localStorage.setItem(RISK_DISCLAIMER_ACKNOWLEDGED_KEY, 'true');
        if (is_modal && onClose) {
            onClose();
        }
    };

    const DisclaimerContent = () => (
        <div className={classNames('risk-disclaimer', {
            'risk-disclaimer--mobile': is_mobile,
        })}>
            <div className='risk-disclaimer__content'>
                <div className='risk-disclaimer__header'>
                    <Text 
                        className='risk-disclaimer__title'
                        as='h3'
                        color='prominent'
                        size='md'
                        weight='bold'
                    >
                        <Localize i18n_default_text='Risk Disclaimer' />
                    </Text>
                </div>
                <div className='risk-disclaimer__body'>
                    <Text as='p' color='prominent' size='sm' lineHeight='m'>
                        <span className='risk-disclaimer__important'>
                            <Localize i18n_default_text='Important Risk Warning' />
                        </span>
                        <Localize i18n_default_text='Deriv offers complex derivatives, such as options and contracts for difference ("CFDs"). These products may not be suitable for all clients, and trading them puts you at risk. Please make sure that you understand the following risks before trading Deriv products: a) you may lose some or all of the money you invest in the trade, b) your trade involves currency conversion, exchange rates will affect your profit and loss. You should never trade with borrowed money or with money that you cannot afford to lose.' />
                    </Text>
                </div>
                <div className='risk-disclaimer__footer'>
                    <Button 
                        primary
                        onClick={handleAcknowledge}
                    >
                        <Localize i18n_default_text='I Understand' />
                    </Button>
                </div>
            </div>
        </div>
    );

    if (!is_modal && isAcknowledged) return null;
    if (is_modal && !is_open) return null;

    if (is_modal) {
        if (!isDesktop) {
            return (
                <MobileFullPageModal
                    is_modal_open={is_open}
                    header={localize('Risk Disclaimer')}
                    onClickClose={onClose}
                >
                    <DisclaimerContent />
                </MobileFullPageModal>
            );
        }
        return (
            <Dialog
                {...({
                    title: localize('Risk Disclaimer'),
                    is_visible: is_open,
                    onCancel: onClose,
                    has_close_icon: true,
                } as any)}
            >
                <DisclaimerContent />
            </Dialog>
        );
    }

    return <DisclaimerContent />;
});

export default RiskDisclaimer;
