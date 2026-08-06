import { api_base } from './api-base';

const autoListStrategies = async () => {
    if (!api_base.api) {
        throw new Error('Deriv API is not initialized');
    }
    return api_base.api.send({ auto_list_strategies: 1 });
};

const autoStart = async ({
    contract_template,
    strategy_id,
    strategy_parameters,
    subscribe = 1,
    passthrough,
    req_id,
}) => {
    if (!api_base.api) {
        throw new Error('Deriv API is not initialized');
    }

    const request = {
        auto_start: 1,
        contract_template,
        strategy_id,
        strategy_parameters: strategy_parameters || {},
        subscribe,
    };

    if (passthrough) {
        request.passthrough = passthrough;
    }

    if (req_id !== undefined) {
        request.req_id = req_id;
    }

    return api_base.api.send(request);
};

const autoGet = async ({ auto_id, subscribe = 1, passthrough, req_id }) => {
    if (!api_base.api) {
        throw new Error('Deriv API is not initialized');
    }

    const request = {
        auto_get: 1,
        auto_id,
        subscribe,
    };

    if (passthrough) {
        request.passthrough = passthrough;
    }

    if (req_id !== undefined) {
        request.req_id = req_id;
    }

    return api_base.api.send(request);
};

export { autoListStrategies, autoStart, autoGet };
export default {
    autoListStrategies,
    autoStart,
    autoGet,
};
