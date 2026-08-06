import React from 'react';
import { useFormikContext } from 'formik';
import { observer } from 'mobx-react-lite';
import Button from '@/components/shared_ui/button';
import Text from '@/components/shared_ui/text';
import ThemedScrollbars from '@/components/shared_ui/themed-scrollbars';
import { useStore } from '@/hooks/useStore';
import { LegacyClose1pxIcon } from '@deriv/quill-icons/Legacy';
import { localize } from '@deriv-com/translations';
/* [AI] - Analytics event tracking removed - see migrate-docs/MONITORING_PACKAGES.md for re-implementation guide */
/* [/AI] */
import { STRATEGIES } from '../config';
import { TFormData, TFormValues } from '../types';
import QSStepper from './qs-stepper';
import StrategyTabContent from './strategy-tab-content';
import StrategyTemplatePicker from './strategy-template-picker';
import { QsSteps } from './trade-constants';
import useQsSubmitHandler from './useQsSubmitHandler';

type TDesktopFormWrapper = {
    children: React.ReactNode;
    current_step: QsSteps;
    setCurrentStep: (current_step: QsSteps) => void;
    onClickClose: () => void;
    selected_trade_type: string;
    setSelectedTradeType: (selected_trade_type: string) => void;
};

const QuickSelectionPanel = observer(({
    selected_trade_type,
    selected_startegy_label,
    children,
}: Pick<TDesktopFormWrapper, 'selected_trade_type' | 'children'> & { selected_startegy_label: string }) => {
    const { scanner } = useStore();
    return (
        <>
            <div className='qs__selected-options'>
                <div className='qs__selected-options__item'>
                    <Text size='xs' lineHeight='s'>
                        {localize('Trade type')}
                    </Text>
                    <Text size='xs' weight='bold' lineHeight='s'>
                        {selected_trade_type}
                    </Text>
                </div>
                <div className='qs__selected-options__item'>
                    <Text size='xs' lineHeight='s'>
                        {localize('Strategy')}
                    </Text>
                    <Text className='qs__selected-options__item__description' weight='bold' lineHeight='s'>
                        {selected_startegy_label}
                    </Text>
                </div>
            </div>
            <StrategyTabContent formfields={children} active_tab={'TRADE_PARAMETERS'} />

            {/* Bot Builder Advanced Trade Parameters (Auto Switch, Bulk Trades & Virtual Hook) */}
            <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                <Text size='xs' weight='bold' style={{ marginBottom: 8, display: 'block', color: '#f5c542' }}>
                    {localize('Bot Builder Advanced Parameters')}
                </Text>

                {/* 1. Auto Switch Markets Toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text size='xs' color='general'>⚡ {localize('Auto Switch Markets on Loss / Strategy Shift')}</Text>
                    <input
                        type='checkbox'
                        checked={scanner.auto_switch_markets}
                        onChange={e => { scanner.auto_switch_markets = e.target.checked; }}
                    />
                </div>

                {/* 2. Deriv Bulk Trades Engine */}
                <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <Text size='xs' color='general'>📦 {localize('Deriv Bulk Trades Engine')}</Text>
                        <input
                            type='checkbox'
                            checked={scanner.is_bulk_trades_enabled}
                            onChange={e => scanner.setBulkTradesEnabled(e.target.checked)}
                        />
                    </div>
                    {scanner.is_bulk_trades_enabled && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                            <Text size='xs' color='less-prominent'>{localize('Parallel Contracts:')}</Text>
                            <select
                                style={{ background: '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}
                                value={scanner.bulk_trades_count}
                                onChange={e => scanner.setBulkTradesCount(parseInt(e.target.value, 10))}
                            >
                                <option value={2}>2 Parallel Contracts</option>
                                <option value={3}>3 Parallel Contracts</option>
                                <option value={4}>4 Parallel Contracts</option>
                                <option value={5}>5 Parallel Contracts</option>
                            </select>
                        </div>
                    )}
                </div>

                {/* 3. Virtual Hook Risk Filter */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <Text size='xs' color='general'>🛡️ {localize('Virtual Hook Risk Filter')}</Text>
                        <input
                            type='checkbox'
                            checked={scanner.is_virtual_hook_enabled}
                            onChange={e => scanner.setVirtualHookEnabled(e.target.checked)}
                        />
                    </div>
                    {scanner.is_virtual_hook_enabled && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                            <Text size='xs' color='less-prominent'>{localize('Virtual Loss Threshold:')}</Text>
                            <select
                                style={{ background: '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}
                                value={scanner.virtual_loss_threshold}
                                onChange={e => scanner.setVirtualLossThreshold(parseInt(e.target.value, 10))}
                            >
                                <option value={1}>1 Virtual Loss First</option>
                                <option value={2}>2 Virtual Losses First</option>
                                <option value={3}>3 Virtual Losses First</option>
                                <option value={5}>5 Virtual Losses First</option>
                            </select>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
});

const FormWrapper = observer(
    ({
        children,
        current_step,
        setCurrentStep,
        onClickClose,
        selected_trade_type,
        setSelectedTradeType,
    }: TDesktopFormWrapper) => {
        const scroll_ref = React.useRef<HTMLDivElement & SVGSVGElement>(null);
        const { submitForm, isValid, setFieldValue, validateForm } = useFormikContext<TFormValues>();
        const { quick_strategy } = useStore();
        const { selected_strategy, onSubmit, is_stop_bot_dialog_open } = quick_strategy;
        const { handleSubmit } = useQsSubmitHandler();

        const selected_startegy_label = STRATEGIES()[selected_strategy as keyof typeof STRATEGIES].label;
        const is_selected_strategy_step = current_step === QsSteps.StrategySelect;

        React.useEffect(() => {
            if (isValid && current_step === QsSteps.StrategyVerified) {
                setCurrentStep(QsSteps.StrategyCompleted);
            }
            if (!isValid && current_step === QsSteps.StrategyCompleted) {
                setCurrentStep(QsSteps.StrategyVerified);
            }
        }, [isValid, current_step]);

        React.useEffect(() => {
            validateForm();
        }, [selected_strategy, validateForm]);

        const onEdit = async () => {
            await setFieldValue('action', 'EDIT');
            validateForm();
            submitForm().then((form_data: TFormData | void) => {
                if (isValid && form_data) {
                    /* [AI] - Analytics event tracking removed - see migrate-docs/MONITORING_PACKAGES.md for re-implementation guide */
                    /* [/AI] */
                    onSubmit(form_data); // true to load and run the bot
                }
            });
        };

        const onRun = () => {
            handleSubmit();
        };

        const onBack = () => {
            setCurrentStep(QsSteps.StrategySelect);
        };

        const renderContent = React.useCallback(() => {
            switch (current_step) {
                case QsSteps.StrategySelect:
                    return (
                        <StrategyTemplatePicker
                            setCurrentStep={setCurrentStep}
                            setSelectedTradeType={setSelectedTradeType}
                        />
                    );
                case QsSteps.StrategyVerified:
                    return (
                        <QuickSelectionPanel
                            selected_trade_type={selected_trade_type}
                            selected_startegy_label={selected_startegy_label}
                        >
                            {children}
                        </QuickSelectionPanel>
                    );
                case QsSteps.StrategyCompleted:
                    return (
                        <QuickSelectionPanel
                            selected_trade_type={selected_trade_type}
                            selected_startegy_label={selected_startegy_label}
                        >
                            {children}
                        </QuickSelectionPanel>
                    );
                default:
                    return null;
            }
        }, [
            current_step,
            selected_trade_type,
            selected_startegy_label,
            children,
            setCurrentStep,
            setSelectedTradeType,
        ]);

        return (
            !is_stop_bot_dialog_open && (
                <div className='qs'>
                    <div className='qs__head'>
                        <div className='qs__head__title'>
                            <Text weight='bold'>{localize('Quick Strategy')}</Text>
                        </div>
                        <div className='qs__head__action'>
                            <span
                                data-testid='qs-desktop-close-button'
                                onClick={onClickClose}
                                tabIndex={0}
                                onKeyDown={(e: React.KeyboardEvent) => {
                                    if (e.key === 'Enter') {
                                        onClickClose();
                                    }
                                }}
                            >
                                <LegacyClose1pxIcon height='20px' width='20px' />
                            </span>
                        </div>
                    </div>
                    <div className='qs__body'>
                        <div className='qs__body__sidebar'>
                            <div className='qs__body__sidebar__subtitle'>
                                <Text size='xs'>
                                    {localize('Choose a template below and set your trade parameters.')}
                                </Text>
                            </div>
                            <QSStepper current_step={current_step} />
                        </div>
                        <div className='qs__body__content'>
                            <ThemedScrollbars
                                className='qs__form__container qs__form__container--footer'
                                autohide={false}
                                refSetter={scroll_ref}
                            >
                                {renderContent()}
                            </ThemedScrollbars>
                            {!is_selected_strategy_step && (
                                <div className='qs__body__content__footer'>
                                    <Button
                                        transparent
                                        classNameSpan='qs__body__content__footer--back'
                                        disabled={is_selected_strategy_step}
                                        onClick={onBack}
                                    >
                                        {localize('Back')}
                                    </Button>
                                    <Button secondary disabled={!isValid} onClick={onEdit}>
                                        {localize('Load')}
                                    </Button>
                                    <Button
                                        data-testid='qs-run-button'
                                        primary
                                        onClick={e => {
                                            e.preventDefault();
                                            onRun();
                                        }}
                                        disabled={!isValid || quick_strategy.is_options_loading}
                                    >
                                        {localize('Run')}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )
        );
    }
);

export default React.memo(FormWrapper);
