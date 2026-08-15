import { api_base } from './api-base';

const autoListStrategies = async () => {
    if (!api_base.api) {
        throw new Error('Deriv API is not initialized');
    }
    return api_base.api.send({ auto_list_strategies: 1 });
};

const autoList = async ({ subscribe = 0 } = {}) => {
    if (!api_base.api) {
        throw new Error('Deriv API is not initialized');
    }
    return api_base.api.send({ auto_list: 1, ...(subscribe ? { subscribe: 1 } : {}) });
};

const autoStart = async ({
    contract_template,
    strategy_id = 'martingale',
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

const autoPause = async (auto_id) => {
    if (!api_base.api) {
        throw new Error('Deriv API is not initialized');
    }
    return api_base.api.send({ auto_pause: 1, auto_id });
};

const autoResume = async (auto_id) => {
    if (!api_base.api) {
        throw new Error('Deriv API is not initialized');
    }
    return api_base.api.send({ auto_resume: 1, auto_id });
};

const autoStop = async (auto_id) => {
    if (!api_base.api) {
        throw new Error('Deriv API is not initialized');
    }
    return api_base.api.send({ auto_stop: 1, ...(auto_id ? { auto_id } : {}) });
};

export { autoListStrategies, autoList, autoStart, autoGet, autoPause, autoResume, autoStop };
export default {
    autoListStrategies,
    autoList,
    autoStart,
    autoGet,
    autoPause,
    autoResume,
    autoStop,
};
