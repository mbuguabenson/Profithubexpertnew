import { action, makeObservable, reaction } from 'mobx';
import { api_base, ApiHelpers, DBot, runIrreversibleEvents } from '@/external/bot-skeleton';
import { setCurrency } from '@/external/bot-skeleton/scratch/utils';
import { TApiHelpersStore } from '@/types/stores.types';
import RootStore from './root-store';

export default class AppStore {
    root_store: RootStore;
    core: RootStore['core'];
    dbot_store: RootStore | null;
    api_helpers_store: TApiHelpersStore | null;
    timer: ReturnType<typeof setInterval> | null;
    disposeReloadOnLanguageChangeReaction: unknown;
    disposeCurrencyReaction: unknown;
    disposeSwitchAccountListener: unknown;

    disposeResidenceChangeReaction: unknown;

    constructor(root_store: RootStore, core: RootStore['core']) {
        makeObservable(this, {
            onMount: action,
            onUnmount: action,
            registerCurrencyReaction: action,
            registerOnAccountSwitch: action,

            registerResidenceChangeReaction: action,
            setDBotEngineStores: action,
            onClickOutsideBlockly: action,
        });

        this.root_store = root_store;
        this.core = core;
        this.dbot_store = null;
        this.api_helpers_store = null;
        this.timer = null;
    }

    onMount = async () => {
        const { blockly_store, run_panel } = this.root_store;
        const { ui } = this.core;

        if (!this.dbot_store || !this.api_helpers_store) {
            this.setDBotEngineStores();
        }

        let timer_counter = 1;

        this.timer = setInterval(() => {
            if (window.sendRequestsStatistic) {
                window.sendRequestsStatistic(false);
                performance.clearMeasures();
                if (timer_counter === 6 || run_panel?.is_running) {
                    if (this.timer) clearInterval(this.timer);
                } else {
                    timer_counter++;
                }
            }
        }, 10000);

        if (!this.dbot_store) return;

        blockly_store.setLoading(true);
        try {
            await DBot.initWorkspace('/', this.dbot_store, this.api_helpers_store, ui?.is_mobile || false, false);
        } catch (err) {
            console.error('Error initializing DBot workspace:', err);
        } finally {
            blockly_store.setLoading(false);
        }

        blockly_store.setContainerSize();

        this.registerCurrencyReaction.call(this);
        this.registerOnAccountSwitch.call(this);

        this.registerResidenceChangeReaction.call(this);

        window.addEventListener('click', this.onClickOutsideBlockly);

        blockly_store.getCachedActiveTab();
    };

    onUnmount = () => {
        DBot.terminateBot();
        DBot.terminateConnection();
        if (window.Blockly?.derivWorkspace) {
            clearInterval(window.Blockly?.derivWorkspace.save_workspace_interval);
            window.Blockly.derivWorkspace?.dispose();
        }
        if (typeof this.disposeReloadOnLanguageChangeReaction === 'function') {
            this.disposeReloadOnLanguageChangeReaction();
        }
        if (typeof this.disposeCurrencyReaction === 'function') {
            this.disposeCurrencyReaction();
        }
        if (typeof this.disposeSwitchAccountListener === 'function') {
            this.disposeSwitchAccountListener();
        }

        if (typeof this.disposeResidenceChangeReaction === 'function') {
            this.disposeResidenceChangeReaction();
        }

        window.removeEventListener('click', this.onClickOutsideBlockly);

        // Ensure account switch is re-enabled.
        // TODO: fix
        const { ui } = this.core;

        if (ui) {
            ui.setAccountSwitcherDisabledMessage('');
        }
        ui.setPromptHandler(false);

        if (this.timer) clearInterval(this.timer);
        performance.clearMeasures();
    };

    registerCurrencyReaction = () => {
        // Dynamic subscription to currency from reactive account stream
        const { client } = this.core;
        this.disposeCurrencyReaction = reaction(
            () => client?.currency,
            currency => {
                if (!currency) return;
                const { contracts_for } = ApiHelpers.instance;
                if (!contracts_for) return;
                contracts_for.disposeCache();
            }
        );
    };

    registerOnAccountSwitch = () => {
        const { client } = this.core;

        this.disposeSwitchAccountListener = reaction(
            () => client?.loginid,
            () => {
                const { contracts_for } = ApiHelpers.instance;
                if (window.Blockly?.derivWorkspace) {
                    if (contracts_for) {
                        runIrreversibleEvents(() => {
                            contracts_for.disposeCache();
                            window.Blockly?.derivWorkspace
                                .getAllBlocks()
                                .filter(block => block.type === 'trade_definition_market')
                                .forEach(block => {
                                    const fake_create_event = new window.Blockly.Events.BlockCreate(block);
                                    window.Blockly.Events.fire(fake_create_event);
                                });
                        });
                    }
                    DBot.initializeInterpreter();
                }
            }
        );
    };

    registerResidenceChangeReaction = () => {
        // Country code no longer available from removed get_settings API
        // Previously set up residence change reaction here
    };

    setDBotEngineStores = () => {
        const { flyout, toolbar, save_modal, dashboard, load_modal, run_panel, blockly_store, summary_card } =
            this.root_store || {};
        const { client, common, ui } = this.core || {};
        const handleFileChange = load_modal?.handleFileChange;
        const setLoading = blockly_store?.setLoading;
        const setContractUpdateConfig = summary_card?.setContractUpdateConfig;
        const is_mobile = ui?.is_mobile;

        this.dbot_store = {
            client,
            flyout,
            toolbar,
            save_modal,
            dashboard,
            load_modal,
            run_panel,
            setLoading,
            setContractUpdateConfig,
            handleFileChange,
            is_mobile,
            common,
        };

        this.api_helpers_store = {
            server_time: this.core?.common?.server_time,
            ws: api_base.api,
        };
    };

    onClickOutsideBlockly = (event: Event) => {
        if (document.querySelector('.injectionDiv')) {
            const path = event.path || (event.composedPath && event.composedPath());
            const is_click_outside_blockly = !path.some(
                (el: Element) => el.classList && el.classList.contains('injectionDiv')
            );

            if (is_click_outside_blockly) {
                window.Blockly?.hideChaff(/* allowToolbox */ false);
            }
        }
    };
}
