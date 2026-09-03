import { action, makeObservable, observable, runInAction } from 'mobx';
import { api_base } from '@/external/bot-skeleton';
import { TDigitStat } from '@/stores/analysis-store';

export type TTradeConfig = {
    stake: number;
    multiplier: number;
    ticks: number;
    max_loss: number;
    use_max_loss: boolean;
    switch_condition: boolean;
    prediction: number;
    is_running: boolean;
    is_auto: boolean;
    take_profit?: number;
    max_runs?: number;
    runs_count?: number;
    use_compounding?: boolean;
    use_martingale?: boolean;
    max_stake?: number;
    global_max_loss?: number;
    bulk_trades_count?: number;
    // Special Matches configs
    martingale_enabled?: boolean;
    martingale_multiplier?: number;
};

export type TTradeLog = {
    timestamp: number;
    message: string;
    type: 'info' | 'success' | 'error' | 'trade' | 'journal';
};

export class DigitTradeEngine {
    @observable accessor even_odd_config: TTradeConfig = {
        stake: 0.35,
        multiplier: 2.1,
        ticks: 1,
        max_loss: 5,
        use_max_loss: true,
        take_profit: 10,
        switch_condition: false,
        prediction: 0,
        is_running: false,
        is_auto: false,
        use_compounding: false,
        use_martingale: true,
        max_stake: 10,
        global_max_loss: 50,
        max_runs: 12,
        runs_count: 0,
        bulk_trades_count: 1,
    };
    @observable accessor over_under_config: TTradeConfig = {
        stake: 0.35,
        multiplier: 2.1,
        ticks: 1,
        max_loss: 5,
        use_max_loss: true,
        take_profit: 10,
        switch_condition: false,
        prediction: 4,
        is_running: false,
        is_auto: false,
        use_compounding: false,
        use_martingale: true,
        max_stake: 10,
        global_max_loss: 50,
        max_runs: 12,
        runs_count: 0,
        bulk_trades_count: 1,
    };
    @observable accessor differs_config: TTradeConfig = {
        stake: 0.35,
        multiplier: 11,
        ticks: 1,
        max_loss: 5,
        use_max_loss: true,
        take_profit: 10,
        switch_condition: false,
        prediction: 0,
        is_running: false,
        is_auto: false,
        use_compounding: false,
        use_martingale: true,
        max_stake: 10,
        global_max_loss: 50,
        max_runs: 12,
        runs_count: 0,
        bulk_trades_count: 1,
    };
    @observable accessor matches_config: TTradeConfig = {
        stake: 0.35,
        multiplier: 11,
        ticks: 1,
        max_loss: 5,
        use_max_loss: true,
        take_profit: 10,
        switch_condition: false,
        prediction: 0,
        is_running: false,
        is_auto: false,
        use_compounding: false,
        use_martingale: true,
        max_stake: 10,
        global_max_loss: 50,
        max_runs: 12,
        runs_count: 0,
        bulk_trades_count: 1,
    };

    @observable accessor active_strategy: 'even_odd' | 'over_under' | 'differs' | 'matches' | null = null;
    @observable accessor trade_status: string = 'IDLE';
    @observable accessor session_profit: number = 0;
    @observable accessor total_profit: number = 0;
    @observable accessor is_executing = false;
    @observable accessor logs: TTradeLog[] = [];

    // Martingale State
    @observable accessor last_result: 'WIN' | 'LOSS' | null = null;
    @observable accessor current_streak: number = 0;

    // Strategy State
    private consecutive_even = 0;
    private consecutive_odd = 0;
    private consecutive_over = 0;
    private consecutive_under = 0;

    constructor() {
        makeObservable(this);
    }

    @action
    addLog = (message: string, type: 'info' | 'success' | 'error' | 'trade' | 'journal' = 'info') => {
        this.logs.unshift({ timestamp: Date.now(), message, type });
        if (this.logs.length > 100) this.logs.pop();
    };

    @action
    clearLogs = () => {
        this.logs = [];
    };

    @action
    updateConfig = <K extends keyof TTradeConfig>(strategy: string, key: K, value: TTradeConfig[K]) => {
        const config = (this as Record<string, unknown>)[`${strategy}_config`] as TTradeConfig;
        if (config) config[key] = value;
    };

    @action
    toggleStrategy = (strategy: 'even_odd' | 'over_under' | 'differs' | 'matches') => {
        const config = (this as Record<string, unknown>)[`${strategy}_config`] as TTradeConfig;

        if (config.is_running) {
            // Stop
            config.is_running = false;
            this.active_strategy = null;
            this.trade_status = 'STOPPED';
            this.is_executing = false;
        } else {
            // Start
            // Ensure others are stopped
            ['even_odd', 'over_under', 'differs', 'matches'].forEach(s => {
                const c = (this as Record<string, unknown>)[`${s}_config`] as TTradeConfig;
                if (c) c.is_running = false;
            });

            config.is_running = true;
            this.active_strategy = strategy;
            this.trade_status = 'RUNNING';
            this.addLog(`Strategy started: ${strategy.toUpperCase()}`, 'success');
        }
    };

    @action
    executeManualTrade = (
        strategy: 'even_odd' | 'over_under' | 'differs' | 'matches',
        symbol: string,
        currency: string,
        runs_count = 1
    ) => {
        if (!symbol || String(symbol).trim() === '') {
            this.addLog('⛔ Manual trade aborted: invalid symbol.', 'error');
            return;
        }

        const config = (this as Record<string, unknown>)[`${strategy}_config`] as TTradeConfig;
        if (!config) return;

        let contract_type = '';
        const prediction = config.prediction;

        switch (strategy) {
            case 'even_odd':
                contract_type = prediction === 0 ? 'DIGITEVEN' : 'DIGITODD';
                break;
            case 'over_under':
                contract_type = prediction > 4 ? 'DIGITOVER' : 'DIGITUNDER';
                break;
            case 'differs':
                contract_type = 'DIGITDIFF';
                break;
            case 'matches':
                contract_type = 'DIGITMATCH';
                break;
        }

        config.is_running = true;
        const count = runs_count || config.bulk_trades_count || 1;
        if (count > 1) {
            this.executeBulkTrade(strategy, symbol, currency, count);
        } else {
            this.executeTrade(strategy, symbol, contract_type, prediction, currency);
        }
    };

    @action
    executeBulkTrade = async (
        strategy: 'even_odd' | 'over_under' | 'differs' | 'matches',
        symbol: string,
        currency: string,
        runs_count = 1
    ) => {
        if (this.is_executing) return;
        this.is_executing = true;
        const count = Math.max(1, Math.min(runs_count, 20));
        this.trade_status = `EXECUTING ${count} BULK RUNS`;

        try {
            const api = api_base?.api;
            if (!api) throw new Error('WebSocket API not connected.');
            if (!api_base.is_authorized) throw new Error('API not authorized. Please log in.');

            const config = (this as Record<string, unknown>)[`${strategy}_config`] as TTradeConfig;
            if (!config) return;

            let contract_type = '';
            const prediction = config.prediction;

            switch (strategy) {
                case 'even_odd':
                    contract_type = prediction === 0 ? 'DIGITEVEN' : 'DIGITODD';
                    break;
                case 'over_under':
                    contract_type = prediction > 4 ? 'DIGITOVER' : 'DIGITUNDER';
                    break;
                case 'differs':
                    contract_type = 'DIGITDIFF';
                    break;
                case 'matches':
                    contract_type = 'DIGITMATCH';
                    break;
            }

            const stake = this.calculateStake(config);
            const max_stake = config.max_stake || 10;
            const final_stake = Math.max(0.35, Math.min(stake, max_stake));

            this.addLog(
                `🚀 Placing ${count} Bulk Trade(s) (${contract_type} on ${symbol} @ $${final_stake}) simultaneously...`,
                'info'
            );

            const proposal_data: any = {
                proposal: 1,
                amount: String(final_stake),
                basis: 'stake',
                contract_type,
                currency: currency || 'USD',
                duration: 1,
                duration_unit: 't',
                symbol,
            };

            if (!['DIGITEVEN', 'DIGITODD'].includes(contract_type)) {
                proposal_data.barrier = String(prediction);
            }

            const proposal = (await api.send(proposal_data)) as any;
            if (proposal.error) throw new Error(proposal.error.message);
            if (!proposal.proposal?.id) throw new Error('Failed to get proposal ID');

            const buy_price = proposal.proposal.ask_price || final_stake;

            // Trigger parallel buy requests for bulk execution
            const buyPromises = Array.from({ length: count }, () =>
                api
                    .send({
                        buy: proposal.proposal.id,
                        price: buy_price,
                    })
                    .catch(err => ({ error: err }))
            );

            const buyResults = await Promise.all(buyPromises);
            const successfulContracts = buyResults
                .filter((r: any) => r && r.buy && !r.error)
                .map((r: any) => String(r.buy.contract_id));

            if (successfulContracts.length === 0) {
                const firstErr = buyResults.find((r: any) => r && r.error)?.error?.message || 'Bulk purchase failed';
                throw new Error(firstErr);
            }

            this.addLog(
                `✅ Successfully placed ${successfulContracts.length} bulk contract(s)! Monitoring outcomes...`,
                'trade'
            );
            this.monitorBulkTrades(successfulContracts, config);
        } catch (e: any) {
            const message = e.message || 'Bulk trade failed';
            runInAction(() => {
                this.addLog(`❌ Bulk Trade Error: ${message}`, 'error');
                this.is_executing = false;
                this.trade_status = 'ERROR';
            });
        }
    };

    private monitorBulkTrades = (contract_ids: string[], config: TTradeConfig) => {
        let remaining = [...contract_ids];
        let totalBatchProfit = 0;
        let batchWins = 0;
        let batchLosses = 0;

        const check = setInterval(async () => {
            try {
                if (remaining.length === 0) {
                    clearInterval(check);
                    return;
                }

                const checkPromises = remaining.map(cid =>
                    api_base.api?.send({ proposal_open_contract: 1, contract_id: cid }).catch(() => null)
                );

                const responses = await Promise.all(checkPromises);
                const stillOpen: string[] = [];

                responses.forEach((res: any, idx) => {
                    const poc = res?.proposal_open_contract;
                    if (poc && poc.is_sold) {
                        const profit = Number(poc.profit || 0);
                        totalBatchProfit += profit;
                        if (profit > 0) batchWins++;
                        else batchLosses++;
                    } else {
                        stillOpen.push(remaining[idx]);
                    }
                });

                remaining = stillOpen;

                if (remaining.length === 0) {
                    clearInterval(check);
                    runInAction(() => {
                        this.handleBulkResult(totalBatchProfit, batchWins, batchLosses, config);
                    });
                }
            } catch (e) {
                clearInterval(check);
                runInAction(() => {
                    this.is_executing = false;
                });
            }
        }, 1000);
    };

    @action
    private handleBulkResult = (totalProfit: number, wins: number, losses: number, config: TTradeConfig) => {
        const isWin = totalProfit > 0;
        this.last_result = isWin ? 'WIN' : 'LOSS';
        this.session_profit += totalProfit;
        this.total_profit += totalProfit;
        this.is_executing = false;

        if (isWin) {
            this.current_streak = 0;
            this.addLog(`🏆 BULK BATCH WON: +$${totalProfit.toFixed(2)} (${wins}W / ${losses}L)`, 'success');
            if (config.take_profit && this.session_profit >= config.take_profit) {
                this.stopAll('TAKE PROFIT HIT');
            }
        } else {
            this.current_streak++;
            this.addLog(`❌ BULK BATCH LOSS: -$${Math.abs(totalProfit).toFixed(2)} (${wins}W / ${losses}L)`, 'error');
            const total_loss = Math.abs(this.session_profit);
            if (config.use_max_loss && total_loss >= config.max_loss) {
                this.stopAll('INDIVIDUAL STOP LOSS HIT');
            }
            if (config.global_max_loss && total_loss >= config.global_max_loss) {
                this.stopAll('GLOBAL MAX LOSS HIT');
            }
        }

        if (config.runs_count !== undefined) config.runs_count += wins + losses;
        this.trade_status = 'IDLE';
    };

    @action
    processTick = (
        last_digit: number,
        stats: {
            percentages: { even: number; odd: number; over: number; under: number; rise: number; fall: number };
            digit_stats: TDigitStat[];
            recent_powers?: number[][];
            ticks?: number[];
            ranks?: { most: number | null; second: number | null; least: number | null };
        },
        symbol: string,
        currency: string
    ) => {
        // Update local counters
        if (last_digit % 2 === 0) {
            this.consecutive_even++;
            this.consecutive_odd = 0;
        } else {
            this.consecutive_odd++;
            this.consecutive_even = 0;
        }

        if (last_digit >= 5) {
            this.consecutive_over++;
            this.consecutive_under = 0;
        } else {
            this.consecutive_under++;
            this.consecutive_over = 0;
        }

        if (!this.active_strategy) return;

        const config = (this as Record<string, unknown>)[`${this.active_strategy}_config`] as TTradeConfig;
        if (!config || !config.is_running) return;

        if (this.is_executing) return;

        // Check Max Runs
        if ((config.runs_count || 0) >= (config.max_runs || 100)) {
            this.stopAll('MAX RUNS REACHED');
            return;
        }

        switch (this.active_strategy) {
            case 'even_odd':
                this.checkEvenOdd(stats.percentages, config, symbol, currency);
                break;
            case 'over_under':
                this.checkOverUnder(stats.percentages, config, symbol, currency);
                break;
            case 'differs':
                this.checkDiffers(stats.digit_stats, config, symbol, currency);
                break;
            case 'matches':
                this.checkMatches(stats, config, symbol, currency);
                break;
        }
    };

    private checkEvenOdd = (
        percentages: { even: number; odd: number },
        config: TTradeConfig,
        symbol: string,
        currency: string
    ) => {
        if (percentages.even > 55 && this.consecutive_odd >= 2) {
            this.executeTrade('even_odd', symbol, 'DIGITEVEN', 0, currency);
        } else if (percentages.odd > 55 && this.consecutive_even >= 2) {
            this.executeTrade('even_odd', symbol, 'DIGITODD', 0, currency);
        }
    };

    private checkOverUnder = (
        percentages: { over: number; under: number },
        config: TTradeConfig,
        symbol: string,
        currency: string
    ) => {
        if (percentages.over > 55 && this.consecutive_under >= 2) {
            this.executeTrade('over_under', symbol, 'DIGITOVER', config.prediction, currency);
        } else if (percentages.under > 55 && this.consecutive_over >= 2) {
            this.executeTrade('over_under', symbol, 'DIGITUNDER', config.prediction, currency);
        }
    };

    private checkDiffers = (digit_stats: TDigitStat[], config: TTradeConfig, symbol: string, currency: string) => {
        const leastFrequent = [...digit_stats].sort((a, b) => a.count - b.count)[0];
        if (leastFrequent && leastFrequent.percentage < 8) {
            this.executeTrade('differs', symbol, 'DIGITDIFF', leastFrequent.digit, currency);
        }
    };

    private checkMatches = (
        stats: {
            percentages: { even: number; odd: number; over: number; under: number; rise: number; fall: number };
            digit_stats: TDigitStat[];
            recent_powers?: number[][];
            ticks?: number[];
            ranks?: { most: number | null; second: number | null; least: number | null };
        },
        config: TTradeConfig,
        symbol: string,
        currency: string
    ) => {
        const targetDigit = stats.ranks?.most ?? 0;
        const targetStat = stats.digit_stats.find(s => s.digit === targetDigit);
        const condition1 = (stats.ticks?.length || 0) >= 5;
        const condition2 = targetStat && targetStat.percentage >= 12;

        if (condition1 && condition2) {
            this.executeTrade('matches', symbol, 'DIGITMATCH', targetDigit, currency);
        }
    };

    @action
    executeTrade = async (
        strategy: string,
        symbol: string,
        contract_type: string,
        prediction: number,
        currency: string
    ) => {
        if (this.is_executing) return;
        this.is_executing = true;
        this.trade_status = 'EXECUTING';

        try {
            const api = api_base?.api;
            if (!api) throw new Error('WebSocket API not connected. Please wait for connection.');

            if (!api_base.is_authorized) {
                this.addLog('⛔ API not authorized. Please log in first.', 'error');
                throw new Error('API not authorized');
            }

            const config = (this as Record<string, unknown>)[`${strategy}_config`] as TTradeConfig;
            if (!config || !config.is_running) return;

            const stake = this.calculateStake(config);
            const max_stake = config.max_stake || 10;
            if (stake > max_stake) {
                this.addLog(`⚠️ Max Stake hit! Capping ${stake} at ${max_stake}`, 'journal');
            }
            const final_stake = Math.min(stake, max_stake);

            if (final_stake < 0.35) {
                this.addLog(`⛔ Final stake ${final_stake} is below 0.35 minimum.`, 'error');
                throw new Error(`Minimum stake required: 0.35`);
            }

            if (!symbol || String(symbol).trim() === '') {
                this.addLog('⛔ Invalid or missing symbol supplied for trade proposal.', 'error');
                throw new Error('Invalid trading symbol. Please select a valid market before trading.');
            }

            const proposal_data: any = {
                proposal: 1,
                amount: String(final_stake),
                basis: 'stake',
                contract_type,
                currency: currency || 'USD',
                duration: 1,
                duration_unit: 't',
                symbol,
            };

            if (!['DIGITEVEN', 'DIGITODD'].includes(contract_type)) {
                proposal_data.barrier = String(prediction);
            }

            this.addLog(
                `📤 Proposal: ${contract_type} @ ${symbol} | stake=${final_stake} | barrier=${proposal_data.barrier ?? 'N/A'}`,
                'journal'
            );

            const proposal = (await api.send(proposal_data)) as {
                error?: { message: string; code: string };
                proposal?: { id: string; ask_price: number };
            };

            if (proposal.error) {
                const errorMsg = `Proposal error: ${proposal.error.message} (${proposal.error.code})`;
                this.addLog(errorMsg, 'error');
                throw new Error(errorMsg);
            }
            if (!proposal.proposal?.id) throw new Error('No proposal ID returned from server');

            const buy_request = {
                buy: proposal.proposal.id,
                price: proposal.proposal.ask_price || final_stake,
            };

            const buy = (await api.send(buy_request)) as {
                error?: { message: string; code: string };
                buy?: { contract_id: string; buy_price: number };
            };

            if (buy.error) {
                const errorMsg = `Buy error: ${buy.error.message} (${buy.error.code})`;
                this.addLog(errorMsg, 'error');
                throw new Error(errorMsg);
            }
            if (!buy.buy?.contract_id) throw new Error('No contract ID returned from server');

            this.trade_status = `TRADING ${contract_type}`;
            this.addLog(`✅ Contract purchased: ${buy.buy.contract_id}`, 'trade');

            // Monitor result
            this.monitorTrade(buy.buy.contract_id, config);
        } catch (e: unknown) {
            const message = (e as Error).message || 'Unknown Error';
            console.error('[DigitTradeEngine] Trade error:', message);
            runInAction(() => {
                this.addLog(`❌ Error: ${message}`, 'error');
                this.is_executing = false;
                this.trade_status = 'ERROR';
            });
        }
    };

    private monitorTrade = (contract_id: string, config: TTradeConfig) => {
        const check = setInterval(async () => {
            try {
                const data = (await api_base.api?.send({ proposal_open_contract: 1, contract_id })) as {
                    proposal_open_contract?: { is_sold: number; profit: number };
                };
                if (data.proposal_open_contract && data.proposal_open_contract.is_sold) {
                    clearInterval(check);
                    this.handleResult(data.proposal_open_contract, config);
                }
            } catch (e) {
                clearInterval(check);
                runInAction(() => (this.is_executing = false));
            }
        }, 1000);
    };

    @action
    handleResult = (contract: { profit: number }, config: TTradeConfig) => {
        const profit = Number(contract.profit);
        const result = profit > 0 ? 'WIN' : 'LOSS';

        this.last_result = result;
        this.session_profit += profit;
        this.total_profit += profit;
        this.is_executing = false;

        if (result === 'WIN') {
            this.current_streak = 0;
            this.addLog(`WIN: +${profit.toFixed(2)}`, 'success');
            if (config.take_profit && this.session_profit >= config.take_profit) {
                this.stopAll('TAKE PROFIT HIT');
            }
        } else {
            this.current_streak++;
            this.addLog(`LOSS: ${profit.toFixed(2)}`, 'error');
            const total_loss = Math.abs(this.session_profit);
            if (config.use_max_loss && total_loss >= config.max_loss) {
                this.stopAll('INDIVIDUAL STOP LOSS HIT');
            }
            if (config.global_max_loss && total_loss >= config.global_max_loss) {
                this.stopAll('GLOBAL MAX LOSS HIT');
            }
        }

        if (config.runs_count !== undefined) config.runs_count++;
        this.trade_status = 'RUNNING';
    };

    @action
    stopAll = (reason: string) => {
        ['even_odd', 'over_under', 'differs', 'matches'].forEach(s => {
            const c = (this as Record<string, unknown>)[`${s}_config`] as TTradeConfig;
            if (c) c.is_running = false;
        });
        this.active_strategy = null;
        this.trade_status = reason;
        this.addLog(reason, 'info');
    };

    private calculateStake = (config: TTradeConfig & any) => {
        let stake = config.stake || 0.35;
        if (this.last_result === 'LOSS') {
            const isMatch = this.active_strategy === 'matches';
            const martingaleEnabled = isMatch ? config.martingale_enabled : config.use_martingale;
            const multiplier = isMatch ? config.martingale_multiplier || 11 : config.multiplier || 2.1;

            if (martingaleEnabled) {
                stake = stake * Math.pow(multiplier, this.current_streak);
            }
        }
        return Number(stake.toFixed(2));
    };
}
