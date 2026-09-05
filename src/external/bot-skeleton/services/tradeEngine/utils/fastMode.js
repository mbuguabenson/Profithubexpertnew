const FAST_FLAG = '__dbot_fast_execution';

const isTruthyFastField = value =>
    value === 'TRUE' || value === true || value === 'true' || value === 1 || value === '1';

export const setFastExecutionOverride = enabled => {
    if (typeof window !== 'undefined') {
        window[FAST_FLAG] = Boolean(enabled);
    }
};

export const isPurchaseFastExecutionEnabled = () => {
    try {
        const workspace = window.Blockly?.derivWorkspace || window.Blockly?.getMainWorkspace?.();
        if (!workspace || typeof workspace.getAllBlocks !== 'function') {
            return false;
        }
        return workspace.getAllBlocks(false).some(block => {
            if (!block || block.type !== 'purchase' || block.disabled) {
                return false;
            }
            return isTruthyFastField(block.getFieldValue('FAST_EXECUTION'));
        });
    } catch {
        return false;
    }
};

export const isFastModeActive = () => {
    if (typeof window !== 'undefined' && window[FAST_FLAG] === true) {
        return true;
    }
    if (typeof window !== 'undefined' && isPurchaseFastExecutionEnabled()) {
        return true;
    }
    if (typeof localStorage === 'undefined') {
        return false;
    }
    return (
        localStorage.getItem('dbot_every_tick_mode') === 'true' || localStorage.getItem('bot_execution_speed') === '2'
    );
};

export const isHeaderFastModeEnabled = () => {
    if (typeof localStorage === 'undefined') return false;
    return (
        localStorage.getItem('dbot_every_tick_mode') === 'true' || localStorage.getItem('bot_execution_speed') === '2'
    );
};

export const syncFastExecutionOverride = () => {
    setFastExecutionOverride(isHeaderFastModeEnabled() || isPurchaseFastExecutionEnabled());
};
