import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';
import CopyTradingManager, { DerivClient } from './copy-trading-manager';
import { getToken } from '@/external/bot-skeleton/services/api/appId';
import { isSpecialCRAccount, getDemoAccountIdForSpecialCR } from '@/utils/special-accounts-config';
import DBot from '@/external/bot-skeleton/scratch/dbot';
import { getAppId } from '@/components/shared/utils/config/config';

// Simple duplicate guard by purchase_reference or timestamp
const recentKeys = new Set<string>();
const RECENT_TTL_MS = 15000;

// Status update function for UI - exported for use in copy-trading.tsx
export function updateReplicationStatus(
    status: 'disabled' | 'no_clients' | 'copying' | 'success' | 'error',
    message: string
) {
    const statusEl = document.getElementById('replication-status');
    const statusMsgEl = document.getElementById('replication-status-msg');

    if (statusEl) {
        statusEl.textContent =
            status === 'success' ? '✅' : status === 'error' ? '❌' : status === 'copying' ? '📤' : '⚠️';
        statusEl.style.color =
            status === 'success'
                ? '#10b981'
                : status === 'error'
                  ? '#ef4444'
                  : status === 'copying'
                    ? '#3b82f6'
                    : '#f59e0b';
    }

    if (statusMsgEl) {
        statusMsgEl.textContent = message;
        statusMsgEl.style.color =
            status === 'success'
                ? '#10b981'
                : status === 'error'
                  ? '#ef4444'
                  : status === 'copying'
                    ? '#3b82f6'
                    : '#f59e0b';
    }
}

type TradeLog = { id: string; accountId: string; payload: any; time: number; error?: string };
const tradeLogs: TradeLog[] = [];
export const getTradeLogs = () => tradeLogs.slice(-50).reverse();

function makeKey(payload: any) {
    const ref =
        payload?.request?.parameters?.passthrough?.purchase_reference ||
        payload?.request?.passthrough?.purchase_reference;
    return ref || `${payload?.contract_type}-${payload?.request?.buy || ''}-${Date.now()}`;
}

function cleanupKeys() {
    for (const k of Array.from(recentKeys)) {
        if (recentKeys.size > 1000) recentKeys.delete(k);
    }
}

export function initReplicator(manager: CopyTradingManager) {
    const sub = async (payload: any) => {
        try {
            const key = makeKey(payload);
            if (recentKeys.has(key)) {
                return;
            }
            recentKeys.add(key);
            setTimeout(() => recentKeys.delete(key), RECENT_TTL_MS);

            const settings = manager.getSettings?.() ?? {
                replicationEnabled: true,
                stakeCap: null,
                stakeMultiplier: 1,
            };

            if (!settings.replicationEnabled) {
                updateReplicationStatus('disabled', 'Replication is disabled');
                return;
            }

            // Check if copy trading or demo-to-real is active
            const isCopyTrading = localStorage.getItem('iscopyTrading') === 'true';
            const isDemoToReal = localStorage.getItem('demo_to_real') === 'true';

            if (!isCopyTrading && !isDemoToReal) {
                updateReplicationStatus('disabled', 'Copy trading not started');
                return;
            }

            // Check if special CR account is active (SPECIAL CR LOGIC)
            const showAsCR = typeof window !== 'undefined' ? localStorage.getItem('show_as_cr') : null;
            const isSpecialCR = showAsCR && isSpecialCRAccount(showAsCR);

            // Get current user / master token
            let currentToken: any = null;
            let masterToken: string | undefined = undefined;

            if (isSpecialCR && showAsCR) {
                const demoAccountId = getDemoAccountIdForSpecialCR(showAsCR);
                if (demoAccountId) {
                    const accountsList = JSON.parse(localStorage.getItem('accountsList') || '{}');
                    const demoToken = accountsList[demoAccountId];
                    if (demoToken) {
                        masterToken = demoToken;
                        currentToken = { token: demoToken, account_id: demoAccountId };
                    } else {
                        currentToken = getToken();
                        masterToken = currentToken?.token;
                    }
                } else {
                    currentToken = getToken();
                    masterToken = currentToken?.token;
                }
            } else {
                currentToken = getToken();
                masterToken = currentToken?.token;
            }

            // Collect all target copier tokens (PAT tokens)
            let copierTokens: string[] = [];
            const copyTokensArray: string[] = JSON.parse(localStorage.getItem('copyTokensArray') || '[]');
            const managerCopierTokens = manager.copiers
                .filter(c => c.enabled !== false && c.token)
                .map(c => c.token.trim());

            if (isCopyTrading) {
                const combined = [...copyTokensArray, ...managerCopierTokens];
                copierTokens = Array.from(new Set(combined.filter(t => t && t.trim() && t !== masterToken)));
            }

            if (isDemoToReal) {
                const realToken = manager.master?.token;
                if (realToken && realToken !== masterToken) {
                    copierTokens.push(realToken);
                } else {
                    const accountsList = JSON.parse(localStorage.getItem('accountsList') || '{}');
                    const realLoginId = Object.keys(accountsList).find(k => !k.startsWith('VR') && (k.startsWith('CR') || k.startsWith('ROT') || k.startsWith('MLT')));
                    if (realLoginId) {
                        const realTokenFromList = accountsList[realLoginId];
                        if (realTokenFromList && realTokenFromList !== masterToken) {
                            copierTokens.push(realTokenFromList);
                        }
                    }
                }
                copierTokens = Array.from(new Set(copierTokens.filter(t => t && t.trim() && t !== masterToken)));
            }

            if (copierTokens.length < 1) {
                updateReplicationStatus('no_clients', 'No copier tokens active — Add PAT tokens in Copy Trading');
                return;
            }

            updateReplicationStatus('copying', `Mirroring to ${copierTokens.length} PAT copier account(s)...`);

            // Build request contract parameters
            let contract_parameters: any = null;

            if (payload.mode === 'proposal_id') {
                const proposalId = payload.request?.buy || payload.request?.id;
                const proposals = (DBot as any).interpreter?.bot?.tradeEngine?.data?.proposals || [];
                const matchedProposal = proposals.find((p: any) => p.id === proposalId);

                if (matchedProposal) {
                    contract_parameters = {
                        contract_type: matchedProposal.contract_type,
                        underlying_symbol: matchedProposal.symbol || matchedProposal.underlying_symbol || matchedProposal.echo_req?.underlying_symbol,
                        currency: matchedProposal.currency || 'USD',
                        amount: matchedProposal.amount || matchedProposal.ask_price,
                        basis: matchedProposal.basis || 'stake',
                        duration: matchedProposal.duration,
                        duration_unit: matchedProposal.duration_unit,
                        ...(matchedProposal.barrier !== undefined && { barrier: matchedProposal.barrier }),
                        ...(matchedProposal.barrier2 !== undefined && { barrier2: matchedProposal.barrier2 }),
                        ...(matchedProposal.selected_tick !== undefined && { selected_tick: matchedProposal.selected_tick }),
                        ...(matchedProposal.prediction !== undefined && { prediction: matchedProposal.prediction }),
                        ...(matchedProposal.multiplier !== undefined && { multiplier: matchedProposal.multiplier }),
                        ...(matchedProposal.growth_rate !== undefined && { growth_rate: matchedProposal.growth_rate }),
                    };
                }
            }

            if (!contract_parameters) {
                const params = JSON.parse(JSON.stringify(payload.request?.parameters || payload.request || {}));
                const tradeEngine = (DBot as any).interpreter?.bot?.tradeEngine;
                const tradeOptions = tradeEngine?.tradeOptions || {};

                contract_parameters = {
                    contract_type: params.contract_type || payload.contract_type || tradeOptions.contract_type,
                    underlying_symbol: params.symbol || params.underlying_symbol || payload.request?.symbol || tradeOptions.symbol || tradeOptions.underlying_symbol,
                    currency: params.currency || tradeOptions.currency || 'USD',
                    amount: params.amount || params.price || payload.request?.price || tradeOptions.amount,
                    basis: params.basis || tradeOptions.basis || 'stake',
                    duration: params.duration || tradeOptions.duration,
                    duration_unit: params.duration_unit || tradeOptions.duration_unit,
                    ...((params.barrier !== undefined || tradeOptions.barrier !== undefined) && { barrier: params.barrier ?? tradeOptions.barrier }),
                    ...((params.barrier2 !== undefined || tradeOptions.barrier2 !== undefined) && { barrier2: params.barrier2 ?? tradeOptions.barrier2 }),
                    ...((params.selected_tick !== undefined || tradeOptions.selected_tick !== undefined) && { selected_tick: params.selected_tick ?? tradeOptions.selected_tick }),
                    ...((params.prediction !== undefined || tradeOptions.prediction !== undefined) && { prediction: params.prediction ?? tradeOptions.prediction }),
                    ...((params.multiplier !== undefined || tradeOptions.multiplier !== undefined) && { multiplier: params.multiplier ?? tradeOptions.multiplier }),
                    ...((params.growth_rate !== undefined || tradeOptions.growth_rate !== undefined) && { growth_rate: params.growth_rate ?? tradeOptions.growth_rate }),
                };
            }

            // Apply multiplier/cap to amount
            if (contract_parameters.amount) {
                let amt = Number(contract_parameters.amount) * (settings.stakeMultiplier || 1);
                if (settings.stakeCap) amt = Math.min(amt, settings.stakeCap);
                contract_parameters.amount = Number(amt.toFixed(2));
            }

            // ── Resolve account IDs (login ID) for all copier tokens ──
            const accountsToPurchase: Array<{ token: string; account: string }> = [];

            for (const token of copierTokens) {
                const cleanTok = token.trim();
                let loginId = manager.copiers.find(c => c.token === cleanTok)?.loginId;

                if (!loginId) {
                    try {
                        const standalone = new DerivClient();
                        const auth = await standalone.connectAndAuthorize(cleanTok);
                        loginId = auth.loginid;
                        const copier = manager.copiers.find(c => c.token === cleanTok);
                        if (copier) {
                            copier.loginId = loginId;
                            copier.status = 'connected';
                            copier.balance = standalone.balance;
                            void manager.saveState();
                        }
                    } catch (err) {
                        console.warn(`[Replicator] Could not retrieve login ID for token ${cleanTok.slice(0, 6)}...:`, err);
                    }
                }

                if (loginId) {
                    accountsToPurchase.push({ token: cleanTok, account: loginId });
                }
            }

            if (accountsToPurchase.length === 0) {
                updateReplicationStatus('error', 'Could not resolve login IDs for any copier tokens');
                return;
            }

            // Partition accounts by type (real vs demo)
            const realAccounts = accountsToPurchase.filter(a => !a.account.startsWith('VR'));
            const demoAccounts = accountsToPurchase.filter(a => a.account.startsWith('VR'));

            const appId = getAppId() || '121856';
            let successCount = 0;
            let failCount = 0;

            const runBulkForType = async (type: 'real' | 'demo', list: typeof accountsToPurchase) => {
                if (list.length === 0) return;
                try {
                    const url = `https://api.derivws.com/trading/v1/options/contracts/bulk-purchase/${type}`;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Deriv-App-ID': appId,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            accounts: list,
                            parameters: contract_parameters
                        })
                    });

                    if (!response.ok) {
                        const errorJson = await response.json().catch(() => ({}));
                        const errMsg = errorJson?.errors?.[0]?.message || `HTTP error ${response.status}`;
                        throw new Error(errMsg);
                    }

                    const result = await response.json();
                    const transactions = result?.transactions || [];

                    transactions.forEach((tx: any) => {
                        if (tx.error) {
                            failCount++;
                            const errorMsg = tx.error.message || 'Bulk trade purchase failed';
                            tradeLogs.push({
                                id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                                accountId: tx.account || 'PAT Copier',
                                payload: contract_parameters,
                                time: Date.now(),
                                error: errorMsg,
                            });
                        } else if (tx.buy) {
                            successCount++;
                            tradeLogs.push({
                                id: `trade-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                                accountId: tx.account || 'PAT Account',
                                payload: contract_parameters,
                                time: Date.now(),
                            });
                        }
                    });
                } catch (err: any) {
                    failCount += list.length;
                    const errMsg = err?.message || 'Bulk API call failed';
                    list.forEach(a => {
                        tradeLogs.push({
                            id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                            accountId: a.account || 'PAT Copier',
                            payload: contract_parameters,
                            time: Date.now(),
                            error: errMsg,
                        });
                    });
                }
            };

            await Promise.all([
                runBulkForType('real', realAccounts),
                runBulkForType('demo', demoAccounts)
            ]);

            if (successCount > 0) {
                updateReplicationStatus('success', `Copied to ${successCount} PAT account(s) successfully${failCount > 0 ? ` (${failCount} failed)` : ''}`);
            } else {
                updateReplicationStatus('error', `Trade mirroring failed for all PAT copier accounts`);
            }

            cleanupKeys();
        } catch (e) {
            const errMsg = e instanceof Error ? e.message : 'Unknown error';
            updateReplicationStatus('error', `Error: ${errMsg}`);
            tradeLogs.push({
                id: `fatal-${Date.now()}`,
                accountId: 'system',
                payload: null,
                time: Date.now(),
                error: errMsg,
            });
        }
    };

    globalObserver.register('replicator.purchase', sub);

    return () => {
        try {
            globalObserver.unregister('replicator.purchase', sub);
        } catch {}
    };
}
