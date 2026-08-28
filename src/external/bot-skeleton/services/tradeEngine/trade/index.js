import { applyMiddleware, createStore } from 'redux';
import { thunk } from 'redux-thunk';
import { getLocalizedErrorMessage } from '@/constants/backend-error-messages';
import { createError } from '../../../utils/error';
import { observer as globalObserver } from '../../../utils/observer';
import { api_base } from '../../api/api-base';
import { checkBlocksForProposalRequest, doUntilDone } from '../utils/helpers';
import { expectInitArg } from '../utils/sanitize';
import { proposalsReady, start } from './state/actions';
import * as constants from './state/constants';
import rootReducer from './state/reducers';
import Balance from './Balance';
import OpenContract from './OpenContract';
import Proposal from './Proposal';
import Purchase from './Purchase';
import Sell from './Sell';
import Ticks from './Ticks';
import Total from './Total';

const watchBefore = store =>
    watchScope({
        store,
        stopScope: constants.DURING_PURCHASE,
        passScope: constants.BEFORE_PURCHASE,
        passFlag: 'proposalsReady',
    });

const watchDuring = store =>
    watchScope({
        store,
        stopScope: constants.STOP,
        passScope: constants.DURING_PURCHASE,
        passFlag: 'openContract',
    });

/* The watchScope function is called randomly and resets the prevTick
 * which leads to the same problem we try to solve. So prevTick is isolated
 */
export let prevTick;
export const resetPrevTick = () => {
    prevTick = undefined;
};

const watchScope = ({ store, stopScope, passScope, passFlag }) => {
    const currentState = store.getState();
    // in case watch is called after stop is fired
    if (currentState.scope === stopScope) {
        return Promise.resolve(false);
    }

    const isFastMode = typeof localStorage !== 'undefined' && localStorage.getItem('dbot_every_tick_mode') === 'true';

    // In Fast Mode: If conditions are already met and current tick hasn't been consumed, resolve immediately!
    if (
        isFastMode &&
        currentState.scope === passScope &&
        currentState[passFlag] &&
        currentState.newTick &&
        currentState.newTick !== prevTick
    ) {
        prevTick = currentState.newTick;
        return Promise.resolve(true);
    }

    return new Promise(resolve => {
        let isResolved = false;
        const unsubscribe = store.subscribe(() => {
            if (isResolved) return;
            const newState = store.getState();

            if (newState.newTick === prevTick) return;
            prevTick = newState.newTick;

            if (newState.scope === passScope && newState[passFlag]) {
                isResolved = true;
                unsubscribe();
                resolve(true);
            }

            if (newState.scope === stopScope) {
                isResolved = true;
                unsubscribe();
                resolve(false);
            }
        });
    });
};

export default class TradeEngine extends Balance(Purchase(Sell(OpenContract(Proposal(Ticks(Total(class {}))))))) {
    constructor($scope) {
        super();
        this.observer = $scope.observer;
        this.$scope = $scope;
        this.observe();
        this.data = {
            contract: {},
            proposals: [],
        };
        this.subscription_id_for_accumulators = null;
        this.is_proposal_requested_for_accumulators = false;
        this.store = createStore(rootReducer, applyMiddleware(thunk));
    }

    init(...args) {
        const [token, options] = expectInitArg(args);
        const { symbol } = options;

        this.initArgs = args;
        this.options = options;
        this.startPromise = this.loginAndGetBalance(token);

        if (!this.checkTicksPromiseExists()) this.watchTicks(symbol);
    }

    start(tradeOptions) {
        if (!this.options) {
            throw createError('NotInitialized', getLocalizedErrorMessage('NotInitialized'));
        }

        globalObserver.emit('bot.running');

        const validated_trade_options = this.validateTradeOptions(tradeOptions);

        this.tradeOptions = { ...validated_trade_options, symbol: this.options.symbol };
        this.store.dispatch(start());
        this.checkLimits(validated_trade_options);

        this.makeDirectPurchaseDecision();
    }

    loginAndGetBalance(token) {
        const activeLoginId =
            (typeof localStorage !== 'undefined' && (localStorage.getItem('active_loginid') || localStorage.getItem('client.loginid'))) ||
            '';

        this.accountInfo = {
            ...api_base.account_info,
            loginid: activeLoginId || api_base.account_info?.loginid || token,
        };
        this.token = activeLoginId || api_base.token || token;

        // ─── Bug 1 fix: Guard against duplicate subscriptions ─────────────────────
        // Without this flag, every bot start re-registers a new transaction recovery
        // listener on the WebSocket message stream. After many runs these accumulate,
        // slow down message processing, and degrade trade cycle times.
        if (!this._txRecoverySubscribed && api_base.api) {
            this._txRecoverySubscribed = true;
            try {
                const subscription = api_base.api.onMessage().subscribe(({ data }) => {
                    if (data?.msg_type === 'transaction' && data.transaction?.action === 'sell') {
                        this.transaction_recovery_timeout = setTimeout(() => {
                            const { contract } = this.data;
                            const is_same_contract = contract?.contract_id === data.transaction?.contract_id;
                            const is_open_contract = contract?.status === 'open';
                            if (is_same_contract && is_open_contract) {
                                doUntilDone(() => {
                                    api_base.api?.send({ proposal_open_contract: 1, contract_id: contract.contract_id });
                                }, ['PriceMoved']);
                            }
                        }, 1500);
                    }
                });
                api_base.pushSubscription(subscription);
            } catch (err) {
                this._txRecoverySubscribed = false;
                console.warn('[TradeEngine] Failed to register transaction recovery subscription:', err);
            }
        }

        return Promise.resolve();
    }

    observe() {
        this.observeOpenContract();
        this.observeBalance();
        this.observeProposals();
    }

    watch(watchName) {
        if (watchName === 'before') {
            return watchBefore(this.store);
        }
        return watchDuring(this.store);
    }

    makeDirectPurchaseDecision() {
        const { has_payout_block, is_basis_payout } = checkBlocksForProposalRequest();
        const isEveryTickMode = localStorage.getItem('dbot_every_tick_mode') === 'true';
        const speed = isEveryTickMode ? '2' : (localStorage.getItem('bot_execution_speed') || '1');
        const isSpeedMode = speed !== '1' || isEveryTickMode;
        this.is_proposal_subscription_required = !isSpeedMode && (has_payout_block || is_basis_payout);

        if (this.is_proposal_subscription_required) {
            this.makeProposals({ ...this.options, ...this.tradeOptions });
            this.checkProposalReady();
        } else {
            this.store.dispatch(proposalsReady());
        }
    }
}
