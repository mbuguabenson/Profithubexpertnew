import { action, makeObservable, observable, reaction, runInAction } from 'mobx';
import { api_base } from '@/external/bot-skeleton';
import { normalizeTradeParameters } from '@/utils/trade-purchase';
import { TDigitStat } from './analysis-store';
import RootStore from './root-store';

type TStrategyStats = {
    percentages: { even: number; odd: number; over: number; under: number; rise: number; fall: number };
    digit_stats: TDigitStat[];
    prev_streak_odd: number;
    prev_streak_even: number;
    prev_streak_over: number;
    prev_streak_under: number;
    is_new_digit: boolean;
};

export type TBotConfig = {
    stake: number;
    multiplier: number;
    ticks: number;
    max_loss: number;
    use_max_loss: boolean;
    switch_condition: boolean;
    prediction: number;
    is_running: boolean;
    is_auto: boolean;
    use_compounding?: boolean;
    compound_resets_on_loss?: boolean;
    use_martingale?: boolean;
    take_profit?: number;
    max_runs?: number;
    runs_count?: number;
    max_stake?: number;
    global_max_loss?: number;
    bulk_trades_count?: number;
    // Manual Overrides
    manual_contract_type?: string;
    manual_prediction?: number;
    manual_use_martingale?: boolean;
    manual_multiplier?: number;
};

export default class SmartAutoStore {
    root_store: RootStore;

    @observable accessor rise_fall_config: TBotConfig = {
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
        max_stake: 999999,
        global_max_loss: 50,
        bulk_trades_count: 1,
        manual_contract_type: 'CALL',
        manual_prediction: 0,
        manual_use_martingale: true,
        manual_multiplier: 2.1,
    };

    @observable accessor even_odd_config: TBotConfig = {
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
        max_runs: 999999,
        runs_count: 0,
        max_stake: 999999,
        global_max_loss: 50,
        bulk_trades_count: 1,
        manual_contract_type: 'DIGITEVEN',
        manual_prediction: 0,
        manual_use_martingale: true,
        manual_multiplier: 2.1,
    };

    @observable accessor over_under_config: TBotConfig = {
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
        max_runs: 999999,
        runs_count: 0,
        max_stake: 999999,
        global_max_loss: 50,
        bulk_trades_count: 1,
        manual_contract_type: 'DIGITOVER',
        manual_prediction: 4,
        manual_use_martingale: true,
        manual_multiplier: 2.1,
    };

    @observable accessor differs_config: TBotConfig = {
        stake: 0.35,
        multiplier: 11,
        ticks: 1,
        max_loss: 5,
        use_max_loss: true,
        switch_condition: false,
        prediction: 0,
        is_running: false,
        is_auto: false,
        use_compounding: false,
        use_martingale: true,
        max_runs: 999999,
        runs_count: 0,
        max_stake: 999999,
        global_max_loss: 50,
        bulk_trades_count: 1,
        manual_contract_type: 'DIGITDIFF',
        manual_prediction: 0,
        manual_use_martingale: true,
        manual_multiplier: 11,
    };

    @observable accessor matches_config: TBotConfig = {
        stake: 0.35,
        multiplier: 11,
        ticks: 1,
        max_loss: 5,
        use_max_loss: true,
        switch_condition: false,
        prediction: 0,
        is_running: false,
        is_auto: false,
        use_compounding: false,
        use_martingale: true,
        max_runs: 999999,
        runs_count: 0,
        max_stake: 999999,
        global_max_loss: 50,
        bulk_trades_count: 1,
        manual_contract_type: 'DIGITMATCH',
        manual_prediction: 0,
        manual_use_martingale: true,
        manual_multiplier: 11,
    };

    @observable accessor smart_auto_24_config: TBotConfig = {
        stake: 0.35,
        multiplier: 2.1,
        ticks: 1,
        max_loss: 5,
        use_max_loss: true,
        switch_condition: false,
        prediction: 0,
        is_running: false,
        is_auto: false,
        max_runs: 999999,
        runs_count: 0,
        use_compounding: false,
        use_martingale: true,
        max_stake: 999999,
        global_max_loss: 50,
        bulk_trades_count: 1,
        manual_contract_type: 'DIGITOVER',
        manual_prediction: 1,
        manual_use_martingale: true,
        manual_multiplier: 2.1,
    };

    @observable accessor active_bot:
        | 'even_odd'
        | 'over_under'
        | 'differs'
        | 'matches'
        | 'smart_auto_24'
        | 'rise_fall'
        | null = null;
    @observable accessor bot_status: string = 'IDLE';
    @observable accessor session_profit: number = 0;
    @observable accessor total_profit: number = 0;
    @observable accessor is_executing = false;
    @observable accessor logs: { timestamp: number; message: string; type: 'info' | 'success' | 'error' | 'trade' }[] =
        [];

    // Martingale State
    @observable accessor last_result: 'WIN' | 'LOSS' | null = null;
    @observable accessor current_streak: number = 0;

    // Pattern recognition state
    private consecutive_even = 0;
    private consecutive_odd = 0;
    private consecutive_over = 0;
    private consecutive_under = 0;

    constructor(root_store: RootStore) {
        makeObservable(this);
        this.root_store = root_store;

        // Auto-subscribe to analysis engine's tick stream
        reaction(
            () => this.root_store.analysis.last_digit,
            digit => {
                if (digit !== null) {
                    this.processTick();
                }
            }
        );
    }

    @action
    toggleBot = (
        bot_type: 'even_odd' | 'over_under' | 'differs' | 'matches' | 'smart_auto_24' | 'rise_fall',
        mode: 'manual' | 'auto',
        runs_count = 1
    ) => {
        const configKey = `${bot_type}_config` as keyof SmartAutoStore;
        const config = this[configKey] as unknown as TBotConfig;
        if (config.is_running) {
            runInAction(() => {
                config.is_running = false;
                this.active_bot = null;
                this.bot_status = 'STOPPED';
                this.is_executing = false;
            });
        } else {
            // Stop other bots
            (['even_odd', 'over_under', 'differs', 'matches', 'smart_auto_24', 'rise_fall'] as const).forEach(b => {
                const c = this[`${b}_config` as keyof SmartAutoStore] as unknown as TBotConfig;
                if (c)
                    runInAction(() => {
                        c.is_running = false;
                    });
            });
            runInAction(() => {
                config.is_running = true;
                config.is_auto = mode === 'auto';
                this.active_bot = bot_type;
                this.bot_status = 'RUNNING';
            });
            this.addLog(`Bot started [${bot_type.toUpperCase()}] in ${mode} mode`, 'success');

            if (mode === 'manual') {
                const count = runs_count || config.bulk_trades_count || 1;
                if (count > 1) {
                    this.executeBulkManualTrade(bot_type, count);
                } else {
                    this.executeManualTrade(bot_type);
                }
            }
        }
    };

    @action
    updateConfig = <K extends keyof TBotConfig>(bot_type: string, key: K, value: TBotConfig[K]) => {
        const configKey = `${bot_type}_config` as keyof SmartAutoStore;
        const config = this[configKey] as unknown as TBotConfig;
        if (config) {
            config[key] = value;
        }
    };

    @action
    processTick = () => {
        const { analysis } = this.root_store;
        const last_digit = analysis.last_digit;

        if (last_digit === null) return;

        let prev_streak_odd = 0;
        let prev_streak_even = 0;
        let prev_streak_over = 0;
        let prev_streak_under = 0;

        // Track live streaks
        if (last_digit % 2 === 0) {
            prev_streak_odd = this.consecutive_odd;
            this.consecutive_even++;
            this.consecutive_odd = 0;
        } else {
            prev_streak_even = this.consecutive_even;
            this.consecutive_odd++;
            this.consecutive_even = 0;
        }

        if (last_digit >= 5) {
            prev_streak_under = this.consecutive_under;
            this.consecutive_over++;
            this.consecutive_under = 0;
        } else {
            prev_streak_over = this.consecutive_over;
            this.consecutive_under++;
            this.consecutive_over = 0;
        }

        if (!this.active_bot || this.is_executing) return;

        const configKey = `${this.active_bot}_config` as keyof SmartAutoStore;
        const config = this[configKey] as unknown as TBotConfig;

        if (!config || !config.is_running || !config.is_auto) return;

        // Check Max Runs
        if ((config.runs_count || 0) >= (config.max_runs || 100)) {
            this.stopAllBots('MAX RUNS REACHED');
            return;
        }

        const stats: TStrategyStats = {
            percentages: analysis.percentages,
            digit_stats: analysis.digit_stats,
            prev_streak_odd,
            prev_streak_even,
            prev_streak_over,
            prev_streak_under,
            is_new_digit: true,
        };

        switch (this.active_bot) {
            case 'even_odd':
                this.runEvenOddLogic(stats);
                break;
            case 'over_under':
                this.runOverUnderLogic(stats);
                break;
            case 'differs':
                this.runDiffersLogic(stats.digit_stats);
                break;
            case 'matches':
                this.runMatchesLogic(stats.digit_stats);
                break;
            case 'smart_auto_24':
                this.runSmartAuto24Logic(stats.percentages as { over: number; under: number });
                break;
            case 'rise_fall':
                this.runRiseFallLogic(stats.percentages as { rise: number; fall: number });
                break;
        }
    };

    private runEvenOddLogic = (stats: TStrategyStats) => {
        const config = this.even_odd_config;
        const { percentages } = stats;

        if (percentages.even > 55) {
            if (this.consecutive_even === 1 && this.consecutive_odd === 0) {
                this.addLog(
                    `[Pattern Match] EVEN Strong (${percentages.even.toFixed(1)}%) & Sequence Triggered.`,
                    'info'
                );
                this.executeContract('DIGITEVEN', 0, config);
            }
        } else if (percentages.odd > 55) {
            if (this.consecutive_odd === 1 && this.consecutive_even === 0) {
                this.addLog(
                    `[Pattern Match] ODD Strong (${percentages.odd.toFixed(1)}%) & Sequence Triggered.`,
                    'info'
                );
                this.executeContract('DIGITODD', 0, config);
            }
        }
    };

    private runOverUnderLogic = (stats: TStrategyStats) => {
        const config = this.over_under_config;
        const { percentages } = stats;

        if (percentages.under > 55) {
            let prediction = config.prediction;
            if (prediction < 6) prediction = 8;

            if (this.consecutive_under === 1 && this.consecutive_over === 0) {
                this.addLog(
                    `[Pattern Match] UNDER Strong (${percentages.under.toFixed(1)}%) & Sequence Triggered.`,
                    'info'
                );
                this.executeContract('DIGITUNDER', prediction, config);
            }
        } else if (percentages.over > 55) {
            let prediction = config.prediction;
            if (prediction > 3) prediction = 1;

            if (this.consecutive_over === 1 && this.consecutive_under === 0) {
                this.addLog(
                    `[Pattern Match] OVER Strong (${percentages.over.toFixed(1)}%) & Sequence Triggered.`,
                    'info'
                );
                this.executeContract('DIGITOVER', prediction, config);
            }
        }
    };

    private runDiffersLogic = (digit_stats: TDigitStat[]) => {
        const config = this.differs_config;
        const leastFrequent = [...digit_stats].sort((a, b) => a.count - b.count)[0];
        if (leastFrequent && leastFrequent.percentage < 8) {
            this.executeContract('DIGITDIFF', leastFrequent.digit, config);
        }
    };

    private runMatchesLogic = (digit_stats: TDigitStat[]) => {
        const config = this.matches_config;
        const mostFrequent = [...digit_stats].sort((a, b) => b.count - a.count)[0];
        if (mostFrequent && mostFrequent.percentage > 12) {
            this.executeContract('DIGITMATCH', mostFrequent.digit, config);
        }
    };

    private runSmartAuto24Logic = (percentages: { over: number; under: number }) => {
        const config = this.smart_auto_24_config;
        if (percentages.over > 60) {
            this.executeContract('DIGITOVER', 1, config);
        } else if (percentages.under > 60) {
            this.executeContract('DIGITUNDER', 8, config);
        }
    };

    private runRiseFallLogic = (percentages: { rise: number; fall: number }) => {
        const config = this.rise_fall_config;
        if (percentages.rise > 55) {
            this.executeContract('CALL', 0, config);
        } else if (percentages.fall > 55) {
            this.executeContract('PUT', 0, config);
        }
    };

    private executeManualTrade = (
        bot_type: 'even_odd' | 'over_under' | 'differs' | 'matches' | 'smart_auto_24' | 'rise_fall'
    ) => {
        const configKey = `${bot_type}_config` as keyof SmartAutoStore;
        const config = this[configKey] as unknown as TBotConfig;

        const contract_type = config.manual_contract_type || 'DIGITEVEN';
        const prediction = config.manual_prediction ?? 0;

        this.executeContract(contract_type, prediction, config);

        setTimeout(
            () =>
                runInAction(() => {
                    config.is_running = false;
                    this.active_bot = null;
                }),
            1000
        );
    };

    private executeBulkManualTrade = async (
        bot_type: 'even_odd' | 'over_under' | 'differs' | 'matches' | 'smart_auto_24' | 'rise_fall',
        count: number
    ) => {
        const configKey = `${bot_type}_config` as keyof SmartAutoStore;
        const config = this[configKey] as unknown as TBotConfig;

        const contract_type = config.manual_contract_type || 'DIGITEVEN';
        const prediction = config.manual_prediction ?? 0;

        await this.executeBulkContract(contract_type, prediction, config, count);

        setTimeout(
            () =>
                runInAction(() => {
                    config.is_running = false;
                    this.active_bot = null;
                }),
            1000
        );
    };

    private executeBulkContract = async (
        contract_type: string,
        prediction: number,
        config: TBotConfig,
        count: number
    ) => {
        if (this.is_executing) return;
        this.is_executing = true;
        const runs = Math.max(1, Math.min(count, 20));

        try {
            if (!api_base.api) throw new Error('API not initialized');

            const stake = this.calculateStake(config);
            const max_stake = config.max_stake || 10;
            const final_stake = Math.max(0.35, Math.min(stake, max_stake));

            const targetSymbol =
                this.root_store.analysis?.symbol || (api_base.active_symbols?.[0] as any)?.symbol || 'R_100';

            this.addLog(
                `🚀 Placing ${runs} Bulk ${contract_type} trade(s) on ${targetSymbol} @ $${final_stake.toFixed(2)} simultaneously...`,
                'trade'
            );

            const proposal_request = normalizeTradeParameters({
                proposal: 1,
                amount: final_stake,
                basis: 'stake',
                contract_type,
                currency: this.root_store.client.currency || 'USD',
                duration: config.ticks || 1,
                duration_unit: 't',
                symbol: targetSymbol,
                ...(contract_type.includes('DIGIT')
                    ? contract_type.includes('EVEN') || contract_type.includes('ODD')
                        ? {}
                        : { barrier: prediction.toString() }
                    : {}),
            });

            const proposal = (await api_base.api.send(proposal_request)) as any;
            if (proposal.error) throw new Error(proposal.error.message);
            if (!proposal.proposal?.id) throw new Error('Proposal failed');

            const ask_price = proposal.proposal.ask_price || final_stake;

            const buyPromises = Array.from({ length: runs }, () =>
                api_base.api
                    .send({
                        buy: proposal.proposal.id,
                        price: ask_price,
                    })
                    .catch((err: any) => ({ error: err }))
            );

            const buyResults = await Promise.all(buyPromises);
            const successfulContracts = buyResults
                .filter((r: any) => r && r.buy && !r.error)
                .map((r: any) => String(r.buy.contract_id));

            if (successfulContracts.length === 0) {
                const firstErr = buyResults.find((r: any) => r && r.error)?.error?.message || 'Bulk buy failed';
                throw new Error(firstErr);
            }

            this.bot_status = `TRADING ${successfulContracts.length} BULK CONTRACTS`;
            this.addLog(
                `✅ Successfully purchased ${successfulContracts.length} contract(s). Monitoring results...`,
                'trade'
            );

            // Monitor parallel bulk results
            this.monitorBulkContracts(successfulContracts, config);
        } catch (error: any) {
            console.error('[SmartAuto] Bulk Error:', error);
            runInAction(() => {
                const errMsg = error?.message || 'Bulk execution failed';
                this.bot_status = `ERROR: ${errMsg}`;
                this.addLog(`Error: ${errMsg}`, 'error');
                this.is_executing = false;
            });
        }
    };

    private monitorBulkContracts = (contract_ids: string[], config: TBotConfig) => {
        let remaining = [...contract_ids];
        let totalProfit = 0;
        let wins = 0;
        let losses = 0;

        const check = setInterval(async () => {
            try {
                if (remaining.length === 0) {
                    clearInterval(check);
                    return;
                }

                const checkPromises = remaining.map(cid =>
                    api_base.api.send({ proposal_open_contract: 1, contract_id: cid }).catch(() => null)
                );

                const responses = await Promise.all(checkPromises);
                const stillOpen: string[] = [];

                responses.forEach((res: any, idx) => {
                    const poc = res?.proposal_open_contract;
                    if (poc && poc.is_sold) {
                        const profit = Number(poc.profit || 0);
                        totalProfit += profit;
                        if (profit > 0) wins++;
                        else losses++;
                    } else {
                        stillOpen.push(remaining[idx]);
                    }
                });

                remaining = stillOpen;

                if (remaining.length === 0) {
                    clearInterval(check);
                    runInAction(() => {
                        this.handleBulkResult(totalProfit, wins, losses, config);
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
    private handleBulkResult = (totalProfit: number, wins: number, losses: number, config: TBotConfig) => {
        const isWin = totalProfit > 0;
        this.last_result = isWin ? 'WIN' : 'LOSS';
        this.session_profit += totalProfit;
        this.total_profit += totalProfit;
        this.is_executing = false;

        if (config.runs_count !== undefined) {
            config.runs_count += wins + losses;
        }

        if (isWin) {
            this.current_streak = 0;
            this.addLog(
                `🏆 BULK BATCH WON: +$${totalProfit.toFixed(2)} (${wins}W / ${losses}L) [Session: $${this.session_profit.toFixed(2)}]`,
                'success'
            );
            if (config.take_profit && this.session_profit >= config.take_profit) {
                this.addLog(`Take Profit Reached ($${config.take_profit}). Stopping bot.`, 'success');
                this.stopAllBots('TAKE PROFIT HIT');
            }
        } else {
            this.current_streak++;
            this.addLog(
                `❌ BULK BATCH LOSS: -$${Math.abs(totalProfit).toFixed(2)} (${wins}W / ${losses}L) [Streak: ${this.current_streak}]`,
                'error'
            );
            const total_loss = Math.abs(this.session_profit);
            if (config.use_max_loss && total_loss >= config.max_loss) {
                this.addLog(`Individual Stop Loss Hit ($${config.max_loss})`, 'error');
                this.stopAllBots('INDIVIDUAL STOP LOSS HIT');
            }
            if (config.global_max_loss && total_loss >= config.global_max_loss) {
                this.addLog(`Global Max Loss Hit ($${config.global_max_loss})`, 'error');
                this.stopAllBots('GLOBAL MAX LOSS HIT');
            }
        }

        this.bot_status = 'IDLE';
    };

    private executeContract = async (contract_type: string, prediction: number, config: TBotConfig) => {
        if (this.is_executing) return;
        this.is_executing = true;

        try {
            if (!api_base.api) throw new Error('API not initialized');

            const stake = this.calculateStake(config);
            const max_stake = config.max_stake || 10;
            const final_stake = Math.min(stake, max_stake);

            if (stake > max_stake) {
                this.addLog(`[Safety] Capping stake $${stake} at $${max_stake}`, 'info');
            }

            const targetSymbol =
                this.root_store.analysis?.symbol || (api_base.active_symbols?.[0] as any)?.symbol || 'R_100';

            this.addLog(`Buying ${contract_type} on ${targetSymbol} for $${final_stake.toFixed(2)}`, 'trade');

            const proposal_request = normalizeTradeParameters({
                proposal: 1,
                amount: final_stake,
                basis: 'stake',
                contract_type,
                currency: this.root_store.client.currency || 'USD',
                duration: config.ticks,
                duration_unit: 't',
                symbol: targetSymbol,
                ...(contract_type.includes('DIGIT')
                    ? contract_type.includes('EVEN') || contract_type.includes('ODD')
                        ? {}
                        : { barrier: prediction.toString() }
                    : {}),
            });

            const proposal = (await api_base.api.send(proposal_request)) as {
                error?: { message: string };
                proposal?: { id: string };
            };

            if (proposal.error) throw new Error(proposal.error.message);
            if (!proposal.proposal) throw new Error('Proposal failed');

            this.addLog(`Buying ${contract_type} contract...`, 'trade');
            const res = (await api_base.api.send({
                buy: proposal.proposal.id,
                price: stake,
            })) as { error?: { message: string }; buy?: { contract_id: string } };

            if (res.error) throw new Error(res.error.message);
            if (!res.buy) throw new Error('Buy failed');

            this.bot_status = `TRADING: ${contract_type}`;

            // Wait for result
            setTimeout(
                async () => {
                    const poc = (await api_base.api.send({
                        proposal_open_contract: 1,
                        contract_id: (res.buy as { contract_id: string }).contract_id,
                    })) as { proposal_open_contract?: Record<string, unknown> };
                    if (poc.proposal_open_contract) {
                        this.handleResult(poc.proposal_open_contract, config);
                    }
                    runInAction(() => {
                        this.is_executing = false;
                    });
                },
                config.ticks * 1000 + 2000
            );
        } catch (error: unknown) {
            console.error('SmartAuto Error:', JSON.stringify(error, null, 2));
            runInAction(() => {
                const err = error as { error?: { message?: string }; message?: string };
                const errorMessage = err?.error?.message || err?.message || 'Unknown error';
                this.bot_status = `ERROR: ${errorMessage}`;
                this.addLog(`Error: ${errorMessage}`, 'error');
                this.is_executing = false;
            });
        }
    };

    private handleResult = (contract: Record<string, unknown>, config: TBotConfig) => {
        const profit = parseFloat((contract.profit as string) || '0');
        const result = profit > 0 ? 'WIN' : 'LOSS';

        runInAction(() => {
            this.last_result = result;
            this.is_executing = false;

            // Increment runs count for all strategies on every trade
            if (config.runs_count !== undefined) {
                config.runs_count = (config.runs_count || 0) + 1;
            }

            if (result === 'WIN') {
                this.session_profit += profit;
                this.total_profit += profit;
                this.current_streak = 0;
                const exit_tick = contract.exit_tick;
                const exit_price = String(exit_tick);
                const exit_digit = exit_price[exit_price.length - 1];
                const prediction_val = config.prediction;
                const contract_type = contract.contract_type;

                let log_detail = '';
                if (contract_type === 'DIGITEVEN') log_detail = `Predicted EVEN, Exit Digit: ${exit_digit}`;
                else if (contract_type === 'DIGITODD') log_detail = `Predicted ODD, Exit Digit: ${exit_digit}`;
                else if (contract_type === 'DIGITOVER')
                    log_detail = `Predicted OVER ${prediction_val}, Exit Digit: ${exit_digit}`;
                else if (contract_type === 'DIGITUNDER')
                    log_detail = `Predicted UNDER ${prediction_val}, Exit Digit: ${exit_digit}`;
                else if (contract_type === 'DIGITMATCH')
                    log_detail = `Predicted MATCH ${prediction_val}, Exit Digit: ${exit_digit}`;
                else if (contract_type === 'DIGITDIFF')
                    log_detail = `Predicted DIFF ${prediction_val}, Exit Digit: ${exit_digit}`;

                this.addLog(
                    `Trade WON: +$${profit.toFixed(2)} | ${log_detail} [Session: ${this.session_profit.toFixed(2)}]`,
                    'success'
                );

                if (config.take_profit && this.session_profit >= config.take_profit) {
                    this.addLog(`Take Profit Reached ($${config.take_profit}). Stopping bot.`, 'success');
                    this.stopAllBots('TAKE PROFIT HIT');
                }
            } else {
                this.session_profit += profit; // profit is negative on loss
                this.total_profit += profit;
                this.current_streak++;
                const exit_tick = contract.exit_tick;
                const exit_price = String(exit_tick);
                const exit_digit = exit_price[exit_price.length - 1];
                const prediction_val = config.prediction;
                const contract_type = contract.contract_type;

                let log_detail = '';
                if (contract_type === 'DIGITEVEN') log_detail = `Predicted EVEN, Exit Digit: ${exit_digit}`;
                else if (contract_type === 'DIGITODD') log_detail = `Predicted ODD, Exit Digit: ${exit_digit}`;
                else if (contract_type === 'DIGITOVER')
                    log_detail = `Predicted OVER ${prediction_val}, Exit Digit: ${exit_digit}`;
                else if (contract_type === 'DIGITUNDER')
                    log_detail = `Predicted UNDER ${prediction_val}, Exit Digit: ${exit_digit}`;
                else if (contract_type === 'DIGITMATCH')
                    log_detail = `Predicted MATCH ${prediction_val}, Exit Digit: ${exit_digit}`;
                else if (contract_type === 'DIGITDIFF')
                    log_detail = `Predicted DIFF ${prediction_val}, Exit Digit: ${exit_digit}`;

                this.addLog(
                    `Trade LOST: -$${Math.abs(profit).toFixed(2)} | ${log_detail} [Streak: ${this.current_streak}]`,
                    'error'
                );

                const total_loss = Math.abs(this.session_profit);
                if (config.use_max_loss && total_loss >= config.max_loss) {
                    this.addLog(`Individual Stop Loss Hit ($${config.max_loss})`, 'error');
                    this.stopAllBots('INDIVIDUAL STOP LOSS HIT');
                }
                if (config.global_max_loss && total_loss >= config.global_max_loss) {
                    this.addLog(`Global Max Loss Hit ($${config.global_max_loss})`, 'error');
                    this.stopAllBots('GLOBAL MAX LOSS HIT');
                }

                if (config.switch_condition) {
                    this.switchMarket((config as any).is_smart24);
                }
            }
        });
    };

    private stopAllBots = (reason: string) => {
        const bot_types = ['even_odd', 'over_under', 'differs', 'matches', 'smart_auto_24', 'rise_fall'] as const;
        bot_types.forEach(b => {
            const config = (this as any)[`${b}_config`] as TBotConfig | undefined;
            if (config) config.is_running = false;
        });
        this.active_bot = null;
        this.bot_status = reason;
    };

    private switchMarket = (isSmart24 = false) => {
        if (isSmart24) {
            this.toggleBot('even_odd', 'auto');
            this.bot_status = 'SWITCHED TO EVEN/ODD';
            return;
        }
        if (this.active_bot === 'even_odd') this.toggleBot('over_under', 'auto');
        else if (this.active_bot === 'over_under') this.toggleBot('even_odd', 'auto');
    };

    private calculateStake = (config: TBotConfig) => {
        let base_stake = config.stake;

        if (config.use_compounding && this.session_profit > 0 && this.last_result === 'WIN') {
            base_stake = config.stake + this.session_profit;
        }

        const isMartingale = config.is_auto ? config.use_martingale : config.manual_use_martingale;
        const multiplier = config.is_auto ? config.multiplier : config.manual_multiplier;

        if (this.last_result === 'LOSS' && isMartingale) {
            base_stake = base_stake * Math.pow(multiplier || 2.1, this.current_streak);
        }

        return parseFloat(base_stake.toFixed(2));
    };

    @action
    addLog = (message: string, type: 'info' | 'success' | 'error' | 'trade' = 'info') => {
        this.logs.unshift({ timestamp: Date.now(), message, type });
        if (this.logs.length > 100) this.logs.pop();
    };

    @action
    clearLogs = () => {
        this.logs = [];
    };
}
