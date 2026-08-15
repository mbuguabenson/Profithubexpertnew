import React from 'react';
import classNames from 'classnames';
import { useFormikContext } from 'formik';
import { observer } from 'mobx-react-lite';
import Text from '@/components/shared_ui/text';
import ThemedScrollbars from '@/components/shared_ui/themed-scrollbars';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { STRATEGIES } from '../config';
import { TFormValues } from '../types';
import QSStepper from './qs-stepper';
import StrategyTabContent from './strategy-tab-content';
import StrategyTemplatePicker from './strategy-template-picker';
import { QsSteps } from './trade-constants';

type TMobileFormWrapper = {
    children: React.ReactNode;
    selected_trade_type: string;
    setSelectedTradeType: (selected_trade_type: string) => void;
    current_step: QsSteps;
    setCurrentStep: (current_step: QsSteps) => void;
};

const MobileFormWrapper = observer(
    ({ children, current_step, selected_trade_type, setCurrentStep, setSelectedTradeType }: TMobileFormWrapper) => {
        const { isValid, validateForm } = useFormikContext<TFormValues>();
        const { quick_strategy, scanner } = useStore();
        const { selected_strategy } = quick_strategy;
        const selected_startegy_label = STRATEGIES()[selected_strategy as keyof typeof STRATEGIES].label;
        const is_verified_or_completed_step =
            current_step === QsSteps.StrategyVerified || current_step === QsSteps.StrategyCompleted;
        const is_selected_strategy_step = current_step === QsSteps.StrategySelect;

        React.useEffect(() => {
            validateForm();
        }, [selected_strategy, validateForm]);

        React.useEffect(() => {
            if (isValid && current_step === QsSteps.StrategyVerified) {
                setCurrentStep(QsSteps.StrategyCompleted);
            }
            if (!isValid && current_step === QsSteps.StrategyCompleted) {
                setCurrentStep(QsSteps.StrategyVerified);
            }
        }, [isValid, current_step]);

        return (
            <div className='qs'>
                <div className='qs__body'>
                    <div className='qs__body__content'>
                        <ThemedScrollbars
                            className={classNames('qs__form__container qs__form__container--footer', {
                                'qs__form__container--template': is_selected_strategy_step,
                            })}
                            autohide={false}
                        >
                            <QSStepper
                                current_step={current_step}
                                is_mobile
                            />
                            {is_selected_strategy_step && (
                                <StrategyTemplatePicker
                                    setSelectedTradeType={setSelectedTradeType}
                                    setCurrentStep={setCurrentStep}
                                />
                            )}
                            {is_verified_or_completed_step && (
                                <>
                                    <div className='qs__selected-options'>
                                        <div className='qs__selected-options__item'>
                                            <Text size='xs'>{localize('Trade type')}</Text>
                                            <Text size='xs' weight='bold'>
                                                {selected_trade_type}
                                            </Text>
                                        </div>
                                        <div className='qs__selected-options__item'>
                                            <Text size='xs'>{localize('Strategy')}</Text>
                                            <Text
                                                className='qs__selected-options__item__description'
                                                size='xs'
                                                weight='bold'
                                            >
                                                {selected_startegy_label}
                                            </Text>
                                        </div>
                                    </div>
                                    <StrategyTabContent formfields={children} active_tab={'TRADE_PARAMETERS'} />

                                    {/* Bot Builder Advanced Trade Parameters */}
                                    <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                                        <Text size='xs' weight='bold' style={{ marginBottom: 8, display: 'block', color: '#f5c542' }}>
                                            {localize('Bot Builder Advanced Parameters')}
                                        </Text>

                                        {/* 1. Auto Switch Markets Toggle */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                            <Text size='xs' color='general'>⚡ {localize('Auto Switch Markets')}</Text>
                                            <input
                                                type='checkbox'
                                                checked={scanner.auto_switch_markets}
                                                onChange={e => { scanner.auto_switch_markets = e.target.checked; }}
                                            />
                                        </div>

                                        {/* 2. Deriv Bulk Trades Engine */}
                                        <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                <Text size='xs' color='general'>📦 {localize('Bulk Trades Engine')}</Text>
                                                <input
                                                    type='checkbox'
                                                    checked={scanner.is_bulk_trades_enabled}
                                                    onChange={e => scanner.setBulkTradesEnabled(e.target.checked)}
                                                />
                                            </div>
                                            {scanner.is_bulk_trades_enabled && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                                                    <Text size='xs' color='less-prominent'>{localize('Number of runs:')}</Text>
                                                    <input
                                                        type='number'
                                                        min={1}
                                                        max={100}
                                                        style={{
                                                            width: '60px',
                                                            background: '#1e293b',
                                                            color: '#fff',
                                                            border: '1px solid #334155',
                                                            borderRadius: 4,
                                                            padding: '2px 6px',
                                                            fontSize: 11,
                                                        }}
                                                        value={scanner.bulk_trades_count}
                                                        onChange={e => scanner.setBulkTradesCount(parseInt(e.target.value, 10) || 1)}
                                                    />
                                                    <Text size='xxs' color='less-prominent'>{localize('trades at once')}</Text>
                                                </div>
                                            )}
                                        </div>

                                        {/* 3. Virtual Hook Risk Filter */}
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Text size='xs' color='general'>🛡️ {localize('Virtual Hook')}</Text>
                                                <input
                                                    type='checkbox'
                                                    checked={scanner.is_virtual_hook_enabled}
                                                    onChange={e => scanner.setVirtualHookEnabled(e.target.checked)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </ThemedScrollbars>
                    </div>
                </div>
            </div>
        );
    }
);

export default MobileFormWrapper;
