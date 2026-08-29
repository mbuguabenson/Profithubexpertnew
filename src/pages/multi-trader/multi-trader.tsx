import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/hooks/useStore';
import { observer } from 'mobx-react-lite';
import { getSocketURL } from '@/components/shared/utils/config/config';
import { resolveValidDerivWSToken, getActiveToken } from '@/utils/token-bridge';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { getGroupedMarkets, ALL_DERIV_MARKETS } from '@/constants/markets';
import { localize } from '@deriv-com/translations';
import './multi-trader.scss';

// ─── Types ───────────────────────────────────────────────────────────────────

export type TradeType = 'highlow' | 'risefall' | 'evenodd' | 'overunder' | 'accumulator' | 'multiplier';
export type StatusVariant = 'connected' | 'disconnected' | 'connecting';

export interface TradeConfig {
    proposal: number;
    amount: number;
    basis: string;
    currency: string;
    duration?: number;
    duration_unit?: string;
    contract_type: string;
    label: string;
    strategyId: string;
    selected_tick?: number;
    barrier?: number | string;
    prediction?: number;
    growth_rate?: number;
    multiplier?: number;
}

export interface LogEntry {
    id: number;
    time: string;
    message: string;
    type: 'default' | 'success' | 'error' | 'warning' | 'info';
}

export interface Transaction {
    id: number;
    time: string;
    type: string;
    entry: string | number;
    exit: string | number;
    buy_price: number;
    profit: number;
}

export interface TradeResult {
    profit: number;
    message: string;
    strategyId: string;
    stakeUsed: number;
    label?: string;
    transaction: Transaction;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

function getTradeConfigs(
    type: TradeType,
    stake: number,
    ticks: number,
    predictions: { over: number; under: number },
    currency: string = 'USD'
): TradeConfig[] {
    const common = {
        proposal: 1,
        amount: stake,
        basis: 'stake',
        currency: currency || 'USD',
        duration: Math.max(1, ticks),
        duration_unit: 't',
    };

    switch (type) {
        case 'highlow':
            return [
                { ...common, duration: 5, contract_type: 'TICKHIGH', selected_tick: 1, label: 'High Tick', strategyId: 'highlow_TICKHIGH' },
                { ...common, duration: 5, contract_type: 'TICKLOW',  selected_tick: 1, label: 'Low Tick',  strategyId: 'highlow_TICKLOW'  },
            ];
        case 'risefall':
            return [
                { ...common, contract_type: 'CALL', label: 'Rise', strategyId: 'risefall_CALL' },
                { ...common, contract_type: 'PUT',  label: 'Fall', strategyId: 'risefall_PUT'  },
            ];
        case 'evenodd':
            return [
                { ...common, duration: 1, contract_type: 'DIGITEVEN', label: 'Even Digit', strategyId: 'evenodd_DIGITEVEN' },
                { ...common, duration: 1, contract_type: 'DIGITODD',  label: 'Odd Digit',  strategyId: 'evenodd_DIGITODD'  },
            ];
        case 'overunder':
            return [
                { ...common, duration: 1, contract_type: 'DIGITOVER',  barrier: String(predictions.over),  label: `Over ${predictions.over}`,  strategyId: 'overunder_DIGITOVER'  },
                { ...common, duration: 1, contract_type: 'DIGITUNDER', barrier: String(predictions.under), label: `Under ${predictions.under}`, strategyId: 'overunder_DIGITUNDER' },
            ];
        case 'accumulator':
            return [
                { proposal: 1, amount: stake, basis: 'stake', currency: currency || 'USD', contract_type: 'ACCU', growth_rate: 0.01, label: 'Accumulator', strategyId: 'accumulator_ACCU' }
            ];
        case 'multiplier':
            return [
                { proposal: 1, amount: stake, basis: 'stake', currency: currency || 'USD', contract_type: 'MULTUP',   multiplier: 10, label: 'Multiplier Up',   strategyId: 'multiplier_MULTUP' },
                { proposal: 1, amount: stake, basis: 'stake', currency: currency || 'USD', contract_type: 'MULTDOWN', multiplier: 10, label: 'Multiplier Down', strategyId: 'multiplier_MULTDOWN' }
            ];
        default:
            return [];
    }
}

// ─── Component ───────────────────────────────────────────────────────────────

const MultiTrader: React.FC = observer(() => {
    const { client } = useStore();
    
    // Connection
    const [status, setStatus] = useState<StatusVariant>('disconnected');
    const wsRef = useRef<WebSocket | null>(null);
    const reqCounter = useRef(1);
    const resolvers = useRef<Map<number, { resolve: (d: any) => void; reject: (e: any) => void; isSubscription?: boolean }>>(new Map());

    // Config
    const [market,     setMarket]     = useState('R_100');
    const [baseStake,  setBaseStake]  = useState(0.5);
    const [ticks,      setTicks]      = useState(5);
    const [martingale, setMartingale] = useState(2.0);
    const [takeProfit, setTakeProfit] = useState(10);
    const [stopLoss,   setStopLoss]   = useState(5);
    const [tradeTypes, setTradeTypes] = useState<TradeType[]>(['highlow']);

    // State
    const [running,  setRunning]  = useState(false);
    const [totalProfit, setTotalProfit] = useState(0);
    const [totalRounds, setTotalRounds] = useState(0);
    const [roundWins,   setRoundWins]   = useState(0);
    const [roundLosses, setRoundLosses] = useState(0);
    const [totalStakeUsed, setTotalStakeUsed] = useState(0);
    const [totalPayout, setTotalPayout] = useState(0);
    const [totalTrades, setTotalTrades] = useState(0);
    const [overPrediction, setOverPrediction] = useState(5);
    const [underPrediction, setUnderPrediction] = useState(4);
    const [logs, setLogs] = useState<LogEntry[]>([{ id: 0, time: '', message: 'Awaiting connection…', type: 'default' }]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLogExpanded, setIsLogExpanded] = useState(false);

    // Grouped markets from constants
    const marketGroups = getGroupedMarkets();

    // Mutable refs for trading loop
    const runningRef       = useRef(false);
    const totalProfitRef   = useRef(0);
    const totalRoundsRef   = useRef(0);
    const roundWinsRef     = useRef(0);
    const roundLossesRef   = useRef(0);
    const totalTradesRef   = useRef(0);
    const strategyStakes   = useRef<Record<string, number>>({});
    const logId            = useRef(1);

    // ── Logging ──────────────────────────────────────────────────────────────

    const addLog = useCallback((message: string, type: LogEntry['type'] = 'default') => {
        const entry: LogEntry = {
            id: logId.current++,
            time: new Date().toLocaleTimeString(),
            message,
            type,
        };
        setLogs(prev => [entry, ...prev].slice(0, 300));
    }, []);

    // ── WebSocket helpers ─────────────────────────────────────────────────────

    const sendJSON = useCallback(async (obj: Record<string, any>): Promise<any> => {
        // If main api_base is connected & authorized, try it first for speed
        if (api_base.api && api_base.api.connection?.readyState === WebSocket.OPEN) {
            try {
                const res = await api_base.api.send(obj);
                if (res?.error) {
                    throw new Error(res.error.message || 'API Error');
                }
                return res;
            } catch (err: any) {
                // If it's a subscription or standard call, pass error or fallback
                if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                    throw err;
                }
            }
        }

        // Standalone WebSocket fallback
        return new Promise((resolve, reject) => {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                return reject(new Error('WebSocket not connected. Please connect your account.'));
            }
            const req_id = reqCounter.current++;
            resolvers.current.set(req_id, { resolve, reject });
            wsRef.current.send(JSON.stringify({ ...obj, req_id }));
        });
    }, []);

    const handleMessage = useCallback((raw: MessageEvent) => {
        try {
            const data = JSON.parse(raw.data as string);
            const req_id = data.req_id;

            if (req_id && resolvers.current.has(req_id)) {
                const { resolve, reject, isSubscription } = resolvers.current.get(req_id)!;
                if (isSubscription) {
                    const poc = data.proposal_open_contract;
                    if (poc?.is_sold || poc?.status === 'won' || poc?.status === 'lost') {
                        resolve(data);
                        resolvers.current.delete(req_id);
                    } else if (data.error) {
                        reject(data.error.message);
                        resolvers.current.delete(req_id);
                    }
                    return;
                }
                resolvers.current.delete(req_id);
                if (data.error) reject(data.error.message);
                else resolve(data);
                return;
            }

            if (data.msg_type === 'authorize') {
                if (data.error) {
                    // Only disconnect if api_base is also not authorized
                    if (!api_base.is_authorized) {
                        setStatus('disconnected');
                        addLog(`Authorization notice: ${data.error.message}`, 'warning');
                    }
                } else {
                    setStatus('connected');
                    addLog(`Authorized as ${data.authorize.loginid} (${data.authorize.currency || 'USD'})`, 'success');
                    wsRef.current?.send(JSON.stringify({ balance: 1, subscribe: 1 }));
                }
            }
            if (data.error && data.msg_type !== 'authorize') {
                addLog(`[API Error] ${data.error.message}`, 'error');
            }
        } catch {
            // Ignore parse errors
        }
    }, [addLog]);

    const connect = useCallback(async (): Promise<boolean> => {
        // 1. Check if main api_base is already active and authorized (supports PKCE OAuth OTP & Tokens)
        if (api_base.api && api_base.api.connection?.readyState === WebSocket.OPEN && (api_base.is_authorized || client?.is_logged_in)) {
            setStatus('connected');
            const loginid = api_base.account_info?.loginid || client?.loginid || 'Active Account';
            const curr = api_base.account_info?.currency || client?.currency || 'USD';
            addLog(`MultiTrader ready and connected as ${loginid} (${curr})`, 'success');
            return true;
        }

        if (wsRef.current?.readyState === WebSocket.OPEN && status === 'connected') return true;
        
        const activeLogin = localStorage.getItem('active_loginid') || client?.loginid;
        const currentToken = (typeof client?.getToken === 'function' ? client.getToken() : null) || 
                             (activeLogin ? getActiveToken(activeLogin) : null) || 
                             (await resolveValidDerivWSToken(activeLogin || undefined));
                             
        if (!currentToken && !api_base.is_authorized && !client?.is_logged_in) {
            addLog('Please log in or connect your Deriv account first.', 'error');
            return false;
        }

        setStatus('connecting');

        try {
            const wsUrl = await getSocketURL();
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            return await new Promise<boolean>((resolve) => {
                const timeout = setTimeout(() => {
                    if (api_base.api && api_base.api.connection?.readyState === WebSocket.OPEN && (api_base.is_authorized || client?.is_logged_in)) {
                        setStatus('connected');
                        resolve(true);
                    } else if (status !== 'connected') {
                        setStatus('disconnected');
                        resolve(false);
                    }
                }, 8000);

                ws.onopen = () => {
                    addLog('Connected to Deriv WebSocket. Initializing…', 'info');
                    if (currentToken) {
                        ws.send(JSON.stringify({ authorize: currentToken }));
                    } else if (api_base.is_authorized) {
                        clearTimeout(timeout);
                        setStatus('connected');
                        resolve(true);
                    }
                };

                ws.onmessage = (raw) => {
                    handleMessage(raw);
                    try {
                        const data = JSON.parse(raw.data as string);
                        if (data.msg_type === 'authorize') {
                            clearTimeout(timeout);
                            if (!data.error) {
                                setStatus('connected');
                                resolve(true);
                            } else if (api_base.is_authorized) {
                                setStatus('connected');
                                resolve(true);
                            } else {
                                setStatus('disconnected');
                                resolve(false);
                            }
                        }
                    } catch {
                        // ignore
                    }
                };

                ws.onclose = () => {
                    clearTimeout(timeout);
                    if (!api_base.is_authorized && !client?.is_logged_in) {
                        setStatus('disconnected');
                        if (runningRef.current) {
                            runningRef.current = false;
                            setRunning(false);
                            addLog('Connection lost. Bot stopped.', 'error');
                        }
                    }
                };

                ws.onerror = () => {
                    clearTimeout(timeout);
                    if (api_base.is_authorized || client?.is_logged_in) {
                        setStatus('connected');
                        resolve(true);
                    } else {
                        addLog('WebSocket connection notice.', 'warning');
                        resolve(false);
                    }
                };
            });
        } catch (err: any) {
            if (api_base.is_authorized || client?.is_logged_in) {
                setStatus('connected');
                return true;
            }
            setStatus('disconnected');
            addLog(`WebSocket connection error: ${err?.message || err}`, 'error');
            return false;
        }
    }, [client, handleMessage, addLog, status]);

    // Auto-connect on mount and listen to account switches
    useEffect(() => {
        connect();

        const handleAccountSwitch = () => {
            addLog('Account switch detected. Synchronizing MultiTrader…', 'info');
            if (wsRef.current) {
                try { wsRef.current.close(); } catch {}
            }
            setStatus('connecting');
            setTimeout(() => connect(), 300);
        };

        window.addEventListener('account_switched', handleAccountSwitch);
        window.addEventListener('currency_changed', handleAccountSwitch);
        return () => {
            window.removeEventListener('account_switched', handleAccountSwitch);
            window.removeEventListener('currency_changed', handleAccountSwitch);
            runningRef.current = false;
            try { wsRef.current?.close(); } catch {}
        };
    }, []);

    // ── Strategy stakes init ──────────────────────────────────────────────────

    const initStakes = useCallback((stake: number) => {
        strategyStakes.current = {};
        const activeCurr = client?.currency || 'USD';
        tradeTypes.forEach(type => {
            getTradeConfigs(type, stake, ticks, { over: overPrediction, under: underPrediction }, activeCurr).forEach(c => {
                strategyStakes.current[c.strategyId] = stake;
            });
        });
    }, [tradeTypes, ticks, overPrediction, underPrediction, client?.currency]);

    // ── Track contract ────────────────────────────────────────────────────────

    const trackContract = useCallback((contractId: number, strategyId: string, label: string, stakeUsed: number): Promise<TradeResult> => {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(async () => {
                // If contract hasn't resolved in 45s, query explicitly
                try {
                    const res = await sendJSON({ proposal_open_contract: 1, contract_id: contractId });
                    const poc = res?.proposal_open_contract;
                    if (poc) {
                        const profit = parseFloat(poc.profit ?? 0);
                        const stat = (poc.status || 'CLOSED').toUpperCase();
                        resolve({
                            strategyId,
                            label,
                            stakeUsed,
                            profit,
                            message: `[${label}] ${stat} ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} USD`,
                            transaction: {
                                id: contractId,
                                time: new Date().toLocaleTimeString(),
                                type: label,
                                entry: poc.entry_tick_display_value || poc.entry_spot_display_value || 'N/A',
                                exit: poc.exit_tick_display_value || poc.exit_spot_display_value || 'N/A',
                                buy_price: stakeUsed,
                                profit,
                            },
                        });
                    }
                } catch {}
            }, 45000);

            const req_id = reqCounter.current++;
            resolvers.current.set(req_id, {
                isSubscription: true,
                resolve: (data: any) => {
                    clearTimeout(timeout);
                    const poc = data.proposal_open_contract;
                    const profit = parseFloat(poc?.profit ?? 0);
                    const contractStatus = (poc?.status || 'CLOSED').toUpperCase();
                    const entry = poc?.entry_tick_display_value || poc?.entry_spot_display_value || 'N/A';
                    const exit = poc?.exit_tick_display_value || poc?.exit_spot_display_value || 'N/A';
                    resolve({
                        strategyId,
                        label,
                        stakeUsed,
                        profit,
                        message: `[${label}] ${contractStatus} ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} USD`,
                        transaction: {
                            id: contractId,
                            time: new Date().toLocaleTimeString(),
                            type: label,
                            entry,
                            exit,
                            buy_price: stakeUsed,
                            profit,
                        },
                    } as TradeResult);
                },
                reject: (err) => {
                    clearTimeout(timeout);
                    reject(err);
                },
            });

            sendJSON({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1 }).catch(() => {});
        });
    }, [sendJSON]);

    // ── Execution loop ────────────────────────────────────────────────────────

    const placeTrades = useCallback(async (
        _market: string,
        _baseStake: number,
        _ticks: number,
        _martingale: number,
        _takeProfit: number,
        _stopLoss: number,
        _tradeTypes: TradeType[]
    ) => {
        if (!runningRef.current) return;

        // Check TP/SL
        if (totalProfitRef.current >= _takeProfit) {
            addLog(`🎯 Take Profit reached (+${totalProfitRef.current.toFixed(2)} USD). Stopping bot!`, 'success');
            runningRef.current = false;
            setRunning(false);
            return;
        }
        if (totalProfitRef.current <= -_stopLoss) {
            addLog(`🛑 Stop Loss hit (${totalProfitRef.current.toFixed(2)} USD). Stopping bot!`, 'error');
            runningRef.current = false;
            setRunning(false);
            return;
        }

        // Build configs for all active strategies
        const activeCurr = client?.currency || 'USD';
        const allConfigs: TradeConfig[] = [];
        _tradeTypes.forEach(t => {
            const configs = getTradeConfigs(t, _baseStake, _ticks, { over: overPrediction, under: underPrediction }, activeCurr);
            allConfigs.push(...configs);
        });

        if (allConfigs.length === 0) {
            addLog('No strategies selected. Stopping.', 'error');
            runningRef.current = false;
            setRunning(false);
            return;
        }

        addLog(`[Round ${totalRoundsRef.current + 1}] Requesting proposals for ${allConfigs.length} strategy variations on ${_market}…`, 'info');

        // Fetch proposals concurrently
        const proposalPromises = allConfigs.map(c => {
            const currentStake = strategyStakes.current[c.strategyId] || _baseStake;
            const payload: Record<string, any> = {
                proposal: 1,
                amount: currentStake,
                basis: c.basis,
                currency: activeCurr,
                symbol: _market,
                contract_type: c.contract_type,
            };
            if (c.duration && c.duration > 0 && c.duration_unit) {
                payload.duration = c.duration;
                payload.duration_unit = c.duration_unit;
            }
            if (c.barrier !== undefined) payload.barrier = String(c.barrier);
            if (c.prediction !== undefined) payload.prediction = c.prediction;
            if (c.selected_tick !== undefined) payload.selected_tick = c.selected_tick;
            if (c.growth_rate !== undefined) payload.growth_rate = c.growth_rate;
            if (c.multiplier !== undefined) payload.multiplier = c.multiplier;
            return sendJSON(payload);
        });

        let proposalResults: any[] = [];
        try {
            proposalResults = await Promise.all(proposalPromises);
        } catch (err: any) {
            addLog(`Proposal error: ${err?.message || err}`, 'error');
            await new Promise(r => setTimeout(r, 3000));
            if (runningRef.current) placeTrades(_market, _baseStake, _ticks, _martingale, _takeProfit, _stopLoss, _tradeTypes);
            return;
        }

        // Buy proposals concurrently
        const buyPromises: Promise<any>[] = [];
        const buyMeta: { config: TradeConfig; idx: number }[] = [];

        proposalResults.forEach((res, i) => {
            if (res?.proposal) {
                const id = res.proposal.id;
                const stakeUsed = strategyStakes.current[allConfigs[i].strategyId] || _baseStake;
                buyMeta.push({ config: { ...allConfigs[i], amount: stakeUsed }, idx: buyPromises.length });
                buyPromises.push(sendJSON({ buy: id, price: stakeUsed }));
            }
        });

        if (buyPromises.length === 0) {
            addLog('All trade proposals failed or market unavailable. Retrying in 5s…', 'error');
            await new Promise(r => setTimeout(r, 5000));
            if (runningRef.current) placeTrades(_market, _baseStake, _ticks, _martingale, _takeProfit, _stopLoss, _tradeTypes);
            return;
        }

        addLog(`Executing ${buyPromises.length} simultaneous contracts…`, 'info');
        const buyResults = await Promise.all(buyPromises);

        // Track contracts
        const trackPromises: Promise<TradeResult>[] = [];
        let bought = 0;
        buyMeta.forEach(({ config, idx }) => {
            const contractId = buyResults[idx]?.buy?.contract_id;
            if (contractId) {
                trackPromises.push(trackContract(contractId, config.strategyId, config.label, config.amount));
                bought++;
            } else {
                addLog(`[${config.label}] Purchase failed: ${buyResults[idx]?.error?.message || 'Rejected'}`, 'error');
            }
        });

        if (bought === 0) {
            await new Promise(r => setTimeout(r, 3000));
            if (runningRef.current) placeTrades(_market, _baseStake, _ticks, _martingale, _takeProfit, _stopLoss, _tradeTypes);
            return;
        }

        totalTradesRef.current += bought;
        setTotalTrades(totalTradesRef.current);
        addLog(`Tracking ${bought} active contracts…`, 'info');

        const results = await Promise.all(trackPromises);

        // Process results
        let roundProfit = 0;
        let roundWon    = false;
        results.forEach(r => {
            const res = r as any;
            roundProfit += res.profit;
            addLog(res.message, res.profit >= 0 ? 'success' : 'error');
            setTransactions(prev => [res.transaction, ...prev].slice(0, 50));

            if (res.profit > 0) {
                strategyStakes.current[res.strategyId] = _baseStake;
                roundWon = true;
            } else {
                const newStake = round2(res.stakeUsed * _martingale);
                strategyStakes.current[res.strategyId] = newStake;
            }
        });

        totalProfitRef.current += roundProfit;
        totalRoundsRef.current++;
        if (roundWon) {
            roundWinsRef.current++;
        } else {
            roundLossesRef.current++;
        }
        
        const totalStakeInRound = results.reduce((acc, curr) => acc + curr.stakeUsed, 0);
        const totalPayoutInRound = results.reduce((acc, curr) => acc + (curr.stakeUsed + curr.profit), 0);
        
        setTotalStakeUsed(prev => prev + totalStakeInRound);
        setTotalPayout(prev => prev + totalPayoutInRound);
        setTotalProfit(totalProfitRef.current);
        setTotalRounds(totalRoundsRef.current);
        setRoundWins(roundWinsRef.current);
        setRoundLosses(roundLossesRef.current);

        addLog(
            `Round P/L: ${roundProfit >= 0 ? '+' : ''}${roundProfit.toFixed(2)} | Net Total: ${totalProfitRef.current >= 0 ? '+' : ''}${totalProfitRef.current.toFixed(2)} USD`,
            roundProfit >= 0 ? 'success' : 'error'
        );

        // Delay before next round
        if (runningRef.current) {
            await new Promise(r => setTimeout(r, 2000));
            placeTrades(_market, _baseStake, _ticks, _martingale, _takeProfit, _stopLoss, _tradeTypes);
        }
    }, [addLog, sendJSON, trackContract, overPrediction, underPrediction, client?.currency]);

    // ── Controls ──────────────────────────────────────────────────────────────

    const startBot = useCallback(async () => {
        if (runningRef.current) return;

        if (status !== 'connected') {
            addLog('Connecting to Deriv WebSocket...', 'info');
            const connected = await connect();
            if (!connected) {
                addLog('Failed to connect. Please check credentials.', 'error');
                return;
            }
        }

        const stake = round2(Math.max(0.35, baseStake));
        initStakes(stake);
        totalProfitRef.current = 0; totalRoundsRef.current = 0; roundWinsRef.current = 0; roundLossesRef.current = 0; totalTradesRef.current = 0;
        setTotalProfit(0); setTotalRounds(0); setRoundWins(0); setRoundLosses(0); setTotalTrades(0); setTotalStakeUsed(0); setTotalPayout(0);
        setTransactions([]);
        runningRef.current = true;
        setRunning(true);
        addLog(`MultiTrader activated with ${tradeTypes.length} strategy module(s)!`, 'success');
        placeTrades(market, stake, ticks, martingale, takeProfit, stopLoss, tradeTypes);
    }, [baseStake, market, ticks, martingale, takeProfit, stopLoss, tradeTypes, initStakes, placeTrades, addLog, connect, status]);

    const stopBot = useCallback(() => {
        runningRef.current = false;
        setRunning(false);
        addLog('MultiTrader manually paused.', 'warning');
    }, [addLog]);

    const resetStats = useCallback(() => {
        totalProfitRef.current = 0; totalRoundsRef.current = 0; roundWinsRef.current = 0; roundLossesRef.current = 0; totalTradesRef.current = 0;
        setTotalProfit(0); setTotalRounds(0); setRoundWins(0); setRoundLosses(0); setTotalTrades(0); setTotalStakeUsed(0); setTotalPayout(0);
        setTransactions([]);
        initStakes(round2(Math.max(0.35, baseStake)));
        setLogs([{ id: logId.current++, time: '', message: 'Session statistics reset.', type: 'warning' }]);
    }, [baseStake, initStakes]);

    const isConnected = status === 'connected';
    const winRate = totalRounds > 0 ? ((roundWins / totalRounds) * 100).toFixed(1) : '--';

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className='multi-trader'>
            <div className='multi-trader__content'>
                {/* Parameters Section */}
                <div className='multi-trader__card multi-trader__config-card'>
                    <div className='multi-trader__card-header'>
                        <h2>⚙️ Trading Parameters</h2>
                        <div className={`multi-trader__status-pill multi-trader__status-pill--${status}`}>
                            <span className='dot'></span>
                            <span>{status.toUpperCase()}</span>
                        </div>
                    </div>
                    <div className='multi-trader__config-grid'>
                        <div className='multi-trader__field'>
                            <label>Market (Symbol)</label>
                            <select value={market} onChange={e => setMarket(e.target.value)} disabled={running}>
                                {marketGroups.map(group => (
                                    <optgroup key={group.group} label={group.group}>
                                        {group.items.map(item => (
                                            <option key={item.value} value={item.value}>{item.label}</option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>
                        <div className='multi-trader__field'>
                            <label>Base Stake ($)</label>
                            <input 
                                type='number' 
                                value={baseStake} 
                                min={0.35} 
                                step={0.01} 
                                disabled={running} 
                                onChange={e => setBaseStake(round2(Math.max(0.35, parseFloat(e.target.value) || 0.35)))} 
                            />
                        </div>
                        <div className='multi-trader__field'>
                            <label>Duration (Ticks)</label>
                            <input 
                                type='number' 
                                value={ticks} 
                                min={1} 
                                max={10} 
                                step={1} 
                                disabled={running} 
                                onChange={e => setTicks(Math.max(1, parseInt(e.target.value) || 1))} 
                            />
                        </div>
                        <div className='multi-trader__field'>
                            <label>Martingale Factor</label>
                            <input 
                                type='number' 
                                value={martingale} 
                                min={1.0} 
                                step={0.01} 
                                disabled={running} 
                                onChange={e => setMartingale(parseFloat(e.target.value) || 2)} 
                            />
                        </div>
                        <div className='multi-trader__field'>
                            <label>Take Profit ($)</label>
                            <input 
                                type='number' 
                                value={takeProfit} 
                                min={0} 
                                step={1} 
                                disabled={running} 
                                onChange={e => setTakeProfit(parseFloat(e.target.value) || 10)} 
                            />
                        </div>
                        <div className='multi-trader__field'>
                            <label>Stop Loss ($)</label>
                            <input 
                                type='number' 
                                value={stopLoss} 
                                min={0} 
                                step={1} 
                                disabled={running} 
                                onChange={e => setStopLoss(Math.max(0, parseFloat(e.target.value) || 5))} 
                            />
                        </div>
                    </div>

                    <div className='multi-trader__config-strategies'>
                        <label>Active Trading Strategies</label>
                        <div className='multi-trader__strategy-grid'>
                            {[
                                { id: 'highlow', label: 'High / Low', icon: '📈' },
                                { id: 'risefall', label: 'Rise / Fall', icon: '↕️' },
                                { id: 'evenodd', label: 'Even / Odd', icon: '🔢' },
                                { id: 'overunder', label: 'Over / Under', icon: '🎯' },
                                { id: 'accumulator', label: 'Accumulator', icon: '🔋' },
                                { id: 'multiplier', label: 'Multiplier', icon: '✖️' }
                            ].map(strat => {
                                const isActive = tradeTypes.includes(strat.id as TradeType);
                                return (
                                    <div 
                                        key={strat.id} 
                                        className={`multi-trader__strategy-card ${isActive ? 'active' : ''}`}
                                        onClick={() => {
                                            if (running) return;
                                            setTradeTypes(prev => 
                                                prev.includes(strat.id as TradeType) 
                                                    ? prev.filter(t => t !== strat.id) 
                                                    : [...prev, strat.id as TradeType]
                                            );
                                        }}
                                    >
                                        <span className='icon'>{strat.icon}</span>
                                        <span className='label'>{strat.label}</span>
                                        <div className='indicator'></div>
                                    </div>
                                );
                            })}
                        </div>
                        
                        {tradeTypes.includes('overunder') && (
                            <div className='multi-trader__predictions-row animate-fade-in'>
                                <div className='multi-trader__field'>
                                    <label>Over Prediction (0-9)</label>
                                    <input 
                                        type='number' 
                                        value={overPrediction} 
                                        min={0} 
                                        max={9} 
                                        disabled={running} 
                                        onChange={e => setOverPrediction(parseInt(e.target.value))} 
                                    />
                                </div>
                                <div className='multi-trader__field'>
                                    <label>Under Prediction (0-9)</label>
                                    <input 
                                        type='number' 
                                        value={underPrediction} 
                                        min={0} 
                                        max={9} 
                                        disabled={running} 
                                        onChange={e => setUnderPrediction(parseInt(e.target.value))} 
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Control & Stats Section */}
                <div className='multi-trader__card multi-trader__controls-card'>
                    <div className='multi-trader__buttons-row'>
                        <button 
                            className='multi-trader__btn multi-trader__btn--start' 
                            onClick={startBot} 
                            disabled={!isConnected || running}
                        >
                            ▶ Start
                        </button>
                        <button 
                            className='multi-trader__btn multi-trader__btn--stop' 
                            onClick={stopBot} 
                            disabled={!running}
                        >
                            ■ Stop
                        </button>
                        <button 
                            className='multi-trader__btn multi-trader__btn--reset' 
                            onClick={resetStats} 
                            disabled={running}
                        >
                            ↺ Reset
                        </button>
                    </div>

                    <div className='multi-trader__stats-display'>
                        <div className='multi-trader__stats-grid'>
                            <div className='multi-trader__stat-item'>
                                <label>STAKE</label>
                                <span>{totalStakeUsed.toFixed(2)}</span>
                            </div>
                            <div className='multi-trader__stat-item'>
                                <label>PAYOUT</label>
                                <span>{totalPayout.toFixed(2)}</span>
                            </div>
                            <div className='multi-trader__stat-item'>
                                <label>TRADES</label>
                                <span>{totalTrades}</span>
                            </div>
                            <div className='multi-trader__stat-item'>
                                <label>WIN RATE</label>
                                <span>{winRate}%</span>
                            </div>
                            <div className='multi-trader__stat-item'>
                                <label>WINS</label>
                                <span className='success'>{roundWins}</span>
                            </div>
                            <div className='multi-trader__stat-item'>
                                <label>LOSSES</label>
                                <span className='error'>{roundLosses}</span>
                            </div>
                        </div>
                        <div className='multi-trader__profit-bar'>
                            <label>TOTAL PROFIT/LOSS</label>
                            <span className={totalProfit >= 0 ? 'success' : 'error'}>
                                {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(2)} USD
                            </span>
                        </div>
                    </div>
                </div>

                {/* Log Section (Expandable) */}
                <div className='multi-trader__card multi-trader__log-card'>
                    <div 
                        className='multi-trader__card-header' 
                        onClick={() => setIsLogExpanded(!isLogExpanded)} 
                        style={{ cursor: 'pointer' }}
                    >
                        <h2>📋 Bot Activity Log {isLogExpanded ? '▼' : '▶'}</h2>
                        <span className='multi-trader__expand-hint'>{isLogExpanded ? 'Click to collapse' : 'Click to expand'}</span>
                    </div>
                    {isLogExpanded && (
                        <div className='multi-trader__log-container'>
                            <div className='multi-trader__log-output'>
                                {logs.map(entry => (
                                    <div key={entry.id} className={`multi-trader__log-entry multi-trader__log-entry--${entry.type}`}>
                                        {entry.time && <span className='log-time'>[{entry.time}]</span>}
                                        <span dangerouslySetInnerHTML={{ __html: entry.message }} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Transactions Section */}
                <div className='multi-trader__card multi-trader__transactions-card'>
                    <div className='multi-trader__card-header'>
                        <h2>🔄 Recent Transactions</h2>
                    </div>
                    <div className='multi-trader__transactions-list'>
                        <div className='multi-trader__transactions-header'>
                            <span>Type</span>
                            <span>Spots</span>
                            <span>Buy</span>
                            <span>P/L</span>
                        </div>
                        <div className='multi-trader__transactions-scroll'>
                            {transactions.map(tx => (
                                <div key={tx.id} className='multi-trader__transactions-row'>
                                    <span>{tx.type}</span>
                                    <span className='spots'>{tx.entry} → {tx.exit}</span>
                                    <span>{tx.buy_price.toFixed(2)}</span>
                                    <span className={tx.profit >= 0 ? 'success' : 'error'}>
                                        {tx.profit >= 0 ? '+' : ''}{tx.profit.toFixed(2)}
                                    </span>
                                </div>
                            ))}
                            {transactions.length === 0 && <div className='multi-trader__empty'>No recent transactions</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default MultiTrader;
