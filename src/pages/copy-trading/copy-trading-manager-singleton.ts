import CopyTradingManager from './copy-trading-manager';
import { initReplicator } from './replicator';

let globalCopyTradingManager: CopyTradingManager | null = null;

export const getGlobalCopyTradingManager = (): CopyTradingManager => {
    if (!globalCopyTradingManager) {
        globalCopyTradingManager = new CopyTradingManager();
        initReplicator(globalCopyTradingManager);

        // Sync tokens from localStorage
        const syncTokens = async () => {
            if (!globalCopyTradingManager) return;

            const isDemoToReal = localStorage.getItem('demo_to_real') === 'true';
            if (isDemoToReal) {
                const accounts_list = JSON.parse(localStorage.getItem('accountsList') || '{}');
                const keys = Object.keys(accounts_list);
                const key = keys.find(k => !k.startsWith('VR'));
                if (key) {
                    const value = accounts_list[key];
                    globalCopyTradingManager.setMasterToken(value);
                }
            }

            const copyTokensArray = JSON.parse(localStorage.getItem('copyTokensArray') || '[]');
            for (const token of copyTokensArray) {
                if (!globalCopyTradingManager.copiers.find(c => c.token === token)) {
                    try {
                        globalCopyTradingManager.addCopier(token);
                    } catch (e) {
                        // Token might already exist
                    }
                }
            }
        };

        // Wait a bit for manager to restore state, then sync tokens
        setTimeout(syncTokens, 500);
    }
    return globalCopyTradingManager;
};
