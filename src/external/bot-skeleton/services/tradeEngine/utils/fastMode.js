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

let isSyncingWorkspace = false;

export const getIsSyncingWorkspace = () => isSyncingWorkspace;

/**
 * Synchronizes all purchase blocks in the active Blockly workspace
 * to match the fast execution state.
 */
export const syncBlocklyPurchaseBlocks = isFast => {
    if (typeof window === 'undefined' || !window.Blockly) return;
    const workspace = window.Blockly.derivWorkspace || window.Blockly.getMainWorkspace?.();
    if (!workspace || typeof workspace.getAllBlocks !== 'function') return;

    const targetValue = isFast ? 'TRUE' : 'FALSE';
    isSyncingWorkspace = true;
    try {
        const blocks = workspace.getAllBlocks(false);
        blocks.forEach(block => {
            if (block && block.type === 'purchase' && typeof block.getField === 'function') {
                const field = block.getField('FAST_EXECUTION');
                if (field && field.getValue() !== targetValue) {
                    field.setValue(targetValue);
                }
            }
        });
    } catch (e) {
        console.warn('[syncBlocklyPurchaseBlocks] Error updating purchase blocks:', e);
    } finally {
        isSyncingWorkspace = false;
    }
};

if (typeof window !== 'undefined') {
    window.addEventListener('dbot_speed_mode_changed', event => {
        if (event?.detail && typeof event.detail.isFast === 'boolean') {
            syncBlocklyPurchaseBlocks(event.detail.isFast);
        }
    });
}
