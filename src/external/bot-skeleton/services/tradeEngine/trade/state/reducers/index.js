import * as constants from '../constants';

const initialState = {
    scope: constants.STOP,
    proposalsReady: false,
};

// eslint-disable-next-line default-param-last
const signal = (state = initialState, action) => {
    switch (action.type) {
        case constants.START:
            return {
                ...state,
                scope: constants.BEFORE_PURCHASE,
                hasFiredFastBefore: false,
            };
        case 'FAST_BEFORE_FIRED':
            return {
                ...state,
                hasFiredFastBefore: true,
            };
        case constants.PROPOSALS_READY:
            return {
                ...state,
                proposalsReady: true,
            };
        case constants.CLEAR_PROPOSALS:
            return {
                ...state,
                proposalsReady: false,
            };
        case constants.PURCHASE_SUCCESSFUL:
            return {
                ...state,
                scope: constants.DURING_PURCHASE,
                openContract: false,
            };
        case constants.OPEN_CONTRACT:
            return {
                ...state,
                scope: constants.DURING_PURCHASE,
                openContract: true,
            };
        case constants.SELL:
            return {
                ...state,
                scope: constants.STOP,
            };
        case constants.NEW_TICK:
            return {
                ...state,
                newTick: action.payload,
            };
        default:
            return state;
    }
};

export default signal;
