import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import ContractResultOverlay from '@/components/contract-result-overlay';
import { DBOT_TABS } from '@/constants/bot-contents';
import { contract_stages } from '@/constants/contract-stage';
import { useStore } from '@/hooks/useStore';
import {
    LabelPairedPauseLgFillIcon,
    LabelPairedPlayLgFillIcon,
    LabelPairedSquareLgFillIcon,
} from '@deriv/quill-icons/LabelPaired';
import { Localize, localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
/* [AI] - Analytics event tracking removed - see migrate-docs/MONITORING_PACKAGES.md for re-implementation guide */
/* [/AI] */
import Button from '../shared_ui/button';
import Tooltip from '../shared_ui/tooltip/tooltip';
import CircularWrapper from './circular-wrapper';
import ContractStageText from './contract-stage-text';
import './run-panel-tooltip.scss';

type TTradeAnimation = {
    className?: string;
    should_show_overlay?: boolean;
};

const TradeAnimation = observer(({ className, should_show_overlay }: TTradeAnimation) => {
    const { dashboard, run_panel, summary_card, blockly_store, scanner } = useStore();
    const { active_tab } = dashboard;
    const { has_active_bot, has_saved_bots } = blockly_store;
    const { isMobile } = useDevice();

    const { is_contract_completed, profit } = summary_card;
    const { contract_stage, is_stop_button_visible, is_stop_button_disabled, is_paused, onRunButtonClick, onStopBotClick } =
        run_panel;
    const [shouldDisable, setShouldDisable] = React.useState(false);
    const is_unavailable_for_payment_agent = false;

    // Get the load_modal store to monitor strategy deletions
    const { load_modal } = useStore();
    const { dashboard_strategies, is_delete_modal_open } = load_modal;

    // Track previous state of delete modal to detect when it closes
    const prevDeleteModalOpen = React.useRef(is_delete_modal_open);

    // Check for saved bots whenever the component renders or when strategies are deleted
    React.useEffect(() => {
        const checkBots = async () => {
            await blockly_store.checkForSavedBots();
        };
        checkBots();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dashboard_strategies, is_delete_modal_open, is_stop_button_visible]);

    // Force re-render when delete modal is closed (which happens after deletion)
    React.useEffect(() => {
        // If delete modal was open and is now closed, force a re-check
        if (prevDeleteModalOpen.current && !is_delete_modal_open) {
            const checkBotsAfterDelete = async () => {
                // Small delay to ensure the deletion has completed
                await new Promise(resolve => setTimeout(resolve, 100));
                await blockly_store.checkForSavedBots();
                // Force component to re-render
                if (!is_stop_button_visible) {
                    setShouldDisable(true);
                    setTimeout(() => setShouldDisable(false), 0);
                }
            };
            checkBotsAfterDelete();
        }
        // Update ref for next render
        prevDeleteModalOpen.current = is_delete_modal_open;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [is_delete_modal_open, is_stop_button_visible]);

    React.useEffect(() => {
        if (shouldDisable) {
            setTimeout(() => {
                setShouldDisable(false);
            }, 1000);
        }
    }, [shouldDisable, is_stop_button_visible]);

    const status_classes = ['', '', ''];
    const is_purchase_sent = contract_stage === (contract_stages.PURCHASE_SENT as unknown);
    const is_purchase_received = contract_stage === (contract_stages.PURCHASE_RECEIVED as unknown);

    let progress_status = contract_stage - (is_purchase_sent || is_purchase_received ? 2 : 3);

    if (progress_status >= 0) {
        if (progress_status < status_classes.length) {
            status_classes[progress_status] = 'active';
        }

        if (is_contract_completed) {
            progress_status += 1;
        }

        for (let i = 0; i < progress_status - 1; i++) {
            status_classes[i] = 'completed';
        }
    }

    // Check if there are no active or saved bots
    const has_no_bots = !has_active_bot && !has_saved_bots;
    const is_bot_builder_tab = active_tab === DBOT_TABS.BOT_BUILDER;

    // Disable the RUN button if:
    // 1. There are no active or saved bots AND the user is not in the bot builder tab
    const should_disable_run = has_no_bots && !is_bot_builder_tab;

    const is_disabled = is_stop_button_visible ? false : shouldDisable || should_disable_run;

    // Show the tooltip when:
    // 1. The user is NOT in the bot builder tab, AND
    // 2. There are no bots
    const should_show_tooltip = !is_stop_button_visible && !is_bot_builder_tab && has_no_bots;

    const button_props = React.useMemo(() => {
        if (is_stop_button_visible && !is_stop_button_disabled) {
            return {
                id: 'db-animation__stop-button',
                class: classNames('animation__stop-button', {
                    'animation__stop-button--ai-active': scanner?.is_auto_trading,
                }),
                text: scanner?.is_auto_trading ? (
                    <Localize i18n_default_text='AI Stop' />
                ) : (
                    <Localize i18n_default_text='Stop' />
                ),
                icon: <LabelPairedSquareLgFillIcon fill='#fff' />,
            };
        }
        return {
            id: 'db-animation__run-button',
            class: classNames('animation__run-button', {
                'animation__run-button--ai-active': scanner?.is_auto_trading,
            }),
            text: scanner?.is_auto_trading ? (
                <Localize i18n_default_text='AI Run' />
            ) : (
                <Localize i18n_default_text='Run' />
            ),
            icon: <LabelPairedPlayLgFillIcon fill='#fff' />,
        };
    }, [is_stop_button_visible, is_stop_button_disabled, scanner?.is_auto_trading]);
    const show_overlay = should_show_overlay && is_contract_completed;

    // Fix TypeScript error by ensuring active_tab is a number
    // Use a fallback to dashboard if active_tab is undefined

    // Function to determine tooltip alignment based on run panel position
    const determineTooltipAlignment = (): string => {
        // Force tooltip to always appear on top for mobile devices
        if (isMobile) {
            return 'top';
        } else {
            // On desktop, determine based on run panel position
            try {
                const runPanelElement = document.querySelector('.run__button_wrapper');
                if (runPanelElement) {
                    const rect = runPanelElement.getBoundingClientRect();
                    // Ensure we have valid numbers for the comparison
                    const rectBottom = typeof rect.bottom === 'number' ? rect.bottom : 0;
                    const windowHeight = typeof window.innerHeight === 'number' ? window.innerHeight : 0;
                    const isNearBottom = rectBottom > windowHeight - 150; // 150px threshold from bottom

                    // If the run panel is near the bottom of the screen, show tooltip on top
                    // Otherwise, show it on the left
                    return isNearBottom ? 'top' : 'left';
                }
            } catch (error) {
                console.error('Error determining tooltip position:', error);
            }

            // Default to left if we can't determine position
            return 'left';
        }
    };

    return (
        <div className={classNames('animation__wrapper', className)}>
            {should_show_tooltip ? (
                <div className='run__button_wrapper'>
                    <Tooltip
                        alignment={determineTooltipAlignment()}
                        message={localize('The Run button is disabled because no Bot has been created yet.')}
                        icon='info'
                        className='qs__tooltip'
                    />
                    <div style={{ opacity: 0.5, marginLeft: '8px' }}>
                        <Button
                            is_disabled={true}
                            className={button_props.class}
                            id={button_props.id}
                            icon={button_props.icon}
                            onClick={() => {
                                // Disabled button, no action
                            }}
                            has_effect
                            {...(is_stop_button_visible || !is_unavailable_for_payment_agent
                                ? { primary: true }
                                : { green: true })}
                        >
                            {button_props.text}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className='animation__run-stop-group'>
                    {/* Pause / Resume button — visible while running or when paused */}
                    {(is_stop_button_visible || is_paused) && (
                        <button
                            id='db-animation__pause-button'
                            className={classNames('animation__pause-button', {
                                'animation__pause-button--paused': is_paused,
                            })}
                            disabled={is_stop_button_visible && is_stop_button_disabled}
                            title={is_paused ? localize('Resume bot') : localize('Pause bot after current contract')}
                            onClick={() => {
                                if (is_paused) {
                                    // Resume: continue trading from where we left off
                                    run_panel.onResumeFromPause();
                                } else {
                                    // Pause: finish current contract, don't open new ones
                                    run_panel.onPauseButtonClick();
                                }
                            }}
                        >
                            {is_paused ? (
                                <LabelPairedPlayLgFillIcon fill='#f5c542' width={16} height={16} />
                            ) : (
                                <LabelPairedPauseLgFillIcon fill='var(--text-general)' width={16} height={16} />
                            )}
                            <span>{is_paused ? <Localize i18n_default_text='Resume' /> : <Localize i18n_default_text='Pause' />}</span>
                        </button>
                    )}
                    <Button
                        is_disabled={(is_disabled && !is_unavailable_for_payment_agent) || contract_stage === 3}
                        className={button_props.class}
                        id={button_props.id}
                        icon={button_props.icon}
                        onClick={() => {
                            setShouldDisable(true);
                            if (is_stop_button_visible) {
                                onStopBotClick();
                                return;
                            }
                            onRunButtonClick();
                        }}
                        has_effect
                        {...(is_stop_button_visible || !is_unavailable_for_payment_agent
                            ? { primary: true }
                            : { green: true })}
                    >
                        {button_props.text}
                    </Button>
                </div>
            )}
            <div
                className={classNames('animation__container', className, {
                    'animation--running': contract_stage > 0,
                    'animation--completed': show_overlay,
                    'animation--disabled': is_disabled,
                })}
            >
                {show_overlay && <ContractResultOverlay profit={profit as number} />}
                <span className='animation__text'>
                    <ContractStageText contract_stage={contract_stage as number} />
                </span>
                <div className='animation__progress'>
                    <div className='animation__progress-line'>
                        <div className={`animation__progress-bar animation__progress-${contract_stage}`} />
                    </div>
                    {status_classes.map((status_class, i) => (
                        <CircularWrapper key={`status_class-${status_class}-${i}`} className={status_class} />
                    ))}
                </div>
            </div>
        </div>
    );
});

export default TradeAnimation;
