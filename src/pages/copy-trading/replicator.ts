import { observer as globalObserver } from '@/external/bot-skeleton/utils/observer';
import CopyTradingManager from './copy-trading-manager';
import { getToken } from '@/external/bot-skeleton/services/api/appId';
import { isSpecialCRAccount, getDemoAccountIdForSpecialCR } from '@/utils/special-accounts-config';
import DBot from '@/external/bot-skeleton/scratch/dbot';

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

            // Check if copy trading is active
            const isCopyTrading = localStorage.getItem('iscopyTrading') === 'true';
            const isDemoToReal = localStorage.getItem('demo_to_real') === 'true';

            if (!isCopyTrading && !isDemoToReal) {
                updateReplicationStatus('disabled', 'Copy trading not started');
                return;
            }

            // Get tokens array from localStorage (like the working code)
            let tokens: string[] = [];
            const copyTokensArray = JSON.parse(localStorage.getItem('copyTokensArray') || '[]');

            // Check if special CR account is active (SPECIAL CR LOGIC)
            const showAsCR = typeof window !== 'undefined' ? localStorage.getItem('show_as_cr') : null;
            const isSpecialCR = showAsCR && isSpecialCRAccount(showAsCR);

            // Get current user token
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
                        console.log('[Replicator] 🎯 Special CR mode - using demo token as master:', demoAccountId);
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

            if (!masterToken) {
                updateReplicationStatus('error', 'No master token found');
                return;
            }

            if (isCopyTrading) {
                const uniqueCopierTokens = copyTokensArray.filter(
                    (token: string) => token && token.trim() && token !== masterToken
                );
                tokens = [masterToken, ...uniqueCopierTokens];
                const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
                tokens = uniqueTokens
                    .filter((t: string) => t === masterToken)
                    .concat(uniqueTokens.filter((t: string) => t !== masterToken));
            } else if (isDemoToReal) {
                const realToken = manager.master.token;
                if (realToken && realToken !== masterToken) {
                    tokens = [masterToken, realToken];
                } else {
                    const accountsList = JSON.parse(localStorage.getItem('accountsList') || '{}');
                    const realLoginId = Object.keys(accountsList).find(k => !k.startsWith('VR') && (k.startsWith('CR') || k.startsWith('ROT')));
                    if (realLoginId) {
                        const realTokenFromList = accountsList[realLoginId];
                        if (realTokenFromList && realTokenFromList !== masterToken) {
                            tokens = [masterToken, realTokenFromList];
                        } else {
                            tokens = [masterToken];
                        }
                    } else {
                        tokens = [masterToken];
                    }
                }
                tokens = Array.from(new Set(tokens.filter(Boolean)));
            }

            if (tokens.length < 1) {
                updateReplicationStatus('no_clients', 'No tokens added - Add tokens first');
                return;
            }

            tokens = Array.from(new Set(tokens.filter((t: string) => t && t.trim() && t.length > 0)));

            if (tokens.length < 1) {
                updateReplicationStatus('no_clients', 'No valid tokens - Add tokens first');
                return;
            }

            updateReplicationStatus('copying', `Copying to ${tokens.length} account(s)...`);

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
                };
            }

            // Apply multiplier/cap to amount
            if (contract_parameters.amount) {
                let amt = Number(contract_parameters.amount) * (settings.stakeMultiplier || 1);
                if (settings.stakeCap) amt = Math.min(amt, settings.stakeCap);
                contract_parameters.amount = Number(amt.toFixed(2));
            }

            // ── Execute trade purchases in parallel across all accounts via WebSocket ──
            const connectedClients = manager.getConnectedClients();
            let successCount = 0;
            let failCount = 0;

            const executionPromises = tokens.map(async (token) => {
                let targetClient = connectedClients.find(c => c.client.loginId && (token === c.client.loginId || token.includes(c.client.loginId)))?.client;
                
                // If client not connected in manager, try finding in manager copierClients map
                if (!targetClient) {
                    for (const [, client] of (manager as any).copierClients.entries()) {
                        if (client.status === 'connected') {
                            targetClient = client;
                            break;
                        }
                    }
                }

                try {
                    if (targetClient && targetClient.status === 'connected') {
                        const buyRes = await targetClient.buyContract(contract_parameters);
                        successCount++;
                        tradeLogs.push({
                            id: `trade-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                            accountId: targetClient.loginId || 'Connected Account',
                            payload: contract_parameters,
                            time: Date.now(),
                        });
                        return buyRes;
                    } else {
                        // Fallback: connect standalone client for this token
                        const { DerivClient } = await import('./copy-trading-manager-singleton').then(m => m) as any;
                        const standalone = new DerivClient();
                        await standalone.connectAndAuthorize(token);
                        const buyRes = await standalone.buyContract(contract_parameters);
                        standalone.disconnect();
                        successCount++;
                        tradeLogs.push({
                            id: `trade-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                            accountId: standalone.loginId || 'Copier Account',
                            payload: contract_parameters,
                            time: Date.now(),
                        });
                        return buyRes;
                    }
                } catch (tradeErr: any) {
                    failCount++;
                    const errorMsg = tradeErr?.message || 'Trade purchase failed';
                    console.warn(`[Replicator] ⚠️ Purchase failed for token ${token.slice(0, 6)}...:`, errorMsg);
                    tradeLogs.push({
                        id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                        accountId: 'Copier Account',
                        payload: contract_parameters,
                        time: Date.now(),
                        error: errorMsg,
                    });
                }
            });

            await Promise.allSettled(executionPromises);

            if (successCount > 0) {
                updateReplicationStatus('success', `Copied to ${successCount} account(s) successfully${failCount > 0 ? ` (${failCount} failed)` : ''}`);
            } else {
                updateReplicationStatus('error', `Trade replication failed for all accounts`);
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
