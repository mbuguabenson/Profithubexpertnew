import React, { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { api_base } from '@/external/bot-skeleton';
import './automated-trading.scss';

// Type definitions for configurations
interface StrategyConfig {
    is_running: boolean;
    // Condition block fields
    prob_type?: string;
    operator?: string;
    threshold?: number;
    ticks_count?: number;
    ticks_condition?: string;
    action?: string;
    // Pattern check specific
    pattern_check_count?: number;
    pattern_check_side?: string;
    pattern_check_condition?: string;
    pattern_check_barrier?: number;
    pattern_action?: string;
    pattern_action_prediction?: number;
    // Over/Under specific
    barrier?: number;
    barrier_check?: number;
    prediction_digit?: number;
    // Matches/Differs specific
    target_digit?: number;
    // Inputs block
    stake: number;
    ticks: number;
    martingale: number;
    // Runtime counters
    consecutive_losses: number;
    current_stake: number;
}

const AutomatedTradingView = observer(() => {
    const { smart_trading, common } = useStore();
    const { symbol, digit_stats, ticks, current_price, last_digit, setSymbol } = smart_trading;
    const { is_socket_opened, latency } = common;

    // Load configurations from local storage or set defaults
    const [configs, setConfigs] = useState<Record<string, StrategyConfig>>(() => {
        try {
            const saved = localStorage.getItem('smart_auto_configs');
            if (saved) {
                const parsed = JSON.parse(saved);
                // Ensure all default keys exist
                if (parsed.rise_fall && parsed.even_odd && parsed.even_odd_pattern && parsed.over_under && parsed.over_under_pattern && parsed.matches_differs) {
                    return parsed;
                }
            }
        } catch (e) {}

        return {
            rise_fall: {
                is_running: false,
                prob_type: 'riseProb',
                operator: '>',
                threshold: 55,
                ticks_count: 3,
                ticks_condition: 'Rising',
                action: 'Buy Rise',
                stake: 0.5,
                ticks: 1,
                martingale: 1,
                consecutive_losses: 0,
                current_stake: 0.5,
            },
            even_odd: {
                is_running: false,
                prob_type: 'even',
                operator: '>',
                threshold: 60,
                ticks_count: 3,
                ticks_condition: 'Even',
                action: 'Buy Even',
                stake: 0.5,
                ticks: 1,
                martingale: 1,
                consecutive_losses: 0,
                current_stake: 0.5,
            },
            even_odd_pattern: {
                is_running: false,
                pattern_check_count: 3,
                pattern_check_side: 'Even',
                pattern_action: 'Buy Even',
                stake: 0.5,
                ticks: 1,
                martingale: 1,
                consecutive_losses: 0,
                current_stake: 0.5,
            },
            over_under: {
                is_running: false,
                barrier: 5,
                prob_type: 'over',
                operator: '>',
                threshold: 55,
                ticks_count: 3,
                ticks_condition: 'Over',
                barrier_check: 5,
                action: 'Buy Over',
                prediction_digit: 5,
                stake: 0.5,
                ticks: 1,
                martingale: 1,
                consecutive_losses: 0,
                current_stake: 0.5,
            },
            over_under_pattern: {
                is_running: false,
                barrier: 5,
                pattern_check_count: 3,
                pattern_check_condition: 'Over',
                pattern_check_barrier: 5,
                pattern_action: 'Buy Over',
                pattern_action_prediction: 5,
                stake: 0.5,
                ticks: 1,
                martingale: 1,
                consecutive_losses: 0,
                current_stake: 0.5,
            },
            matches_differs: {
                is_running: false,
                prob_type: 'matches',
                operator: '>',
                threshold: 55,
                target_digit: 5,
                action: 'Buy Matches',
                stake: 0.5,
                ticks: 1,
                martingale: 1,
                consecutive_losses: 0,
                current_stake: 0.5,
            }
        };
    });

    const [executingMap, setExecutingMap] = useState<Record<string, boolean>>({});

    // Save configs when changed
    const updateConfig = (key: string, field: keyof StrategyConfig, value: any) => {
        setConfigs(prev => {
            const updated = {
                ...prev,
                [key]: {
                    ...prev[key],
                    [field]: value,
                    // If stake changes, also reset current_stake
                    ...(field === 'stake' ? { current_stake: parseFloat(value) || 0.5 } : {})
                }
            };
            localStorage.setItem('smart_auto_configs', JSON.stringify(updated));
            return updated;
        });
    };

    // Calculate probabilities & statistics
    const probs = smart_trading.calculateProbabilities();

    const statsMap = useMemo(() => {
        const sorted = [...digit_stats].sort((a, b) => b.count - a.count);
        const most = sorted[0]?.digit ?? 5;
        const mostPct = sorted[0]?.percentage ?? 10;
        const least = sorted[sorted.length - 1]?.digit ?? 0;
        return { most, mostPct, least };
    }, [digit_stats]);

    // Live streak calculation
    const streakInfo = useMemo(() => {
        if (ticks.length === 0) return { side: 'EVEN', count: 0 };
        const lastIsEven = ticks[ticks.length - 1] % 2 === 0;
        let count = 0;
        for (let i = ticks.length - 1; i >= 0; i--) {
            const isEven = ticks[i] % 2 === 0;
            if (isEven === lastIsEven) count++;
            else break;
        }
        return { side: lastIsEven ? 'EVEN' : 'ODD', count };
    }, [ticks]);

    // Over/Under Probability calculations based on active barrier config
    const getOverUnderProbs = (barrier: number) => {
        let over = 0;
        let under = 0;
        let total = 0;
        digit_stats.forEach(stat => {
            total += stat.count;
            if (stat.digit > barrier) over += stat.count;
            if (stat.digit < barrier) under += stat.count;
        });
        return {
            over: total > 0 ? (over / total) * 100 : 0,
            under: total > 0 ? (under / total) * 100 : 0,
        };
    };

    // Purchase Trades implementation
    const purchaseTrade = async (strategyId: string, contractType: string, prediction?: number) => {
        if (executingMap[strategyId] || !api_base.api) return;

        setExecutingMap(prev => ({ ...prev, [strategyId]: true }));

        try {
            const config = configs[strategyId];
            const currentStake = config.current_stake || config.stake;

            const proposal = await api_base.api.send({
                proposal: 1,
                amount: currentStake,
                basis: 'stake',
                contract_type: contractType,
                currency: smart_trading.root_store.client.currency || 'USD',
                duration: config.ticks || 1,
                duration_unit: 't',
                symbol: symbol,
                ...(prediction !== undefined ? { barrier: String(prediction) } : {}),
            });

            if (proposal.error) {
                console.warn(`[SmartAuto] Proposal error: ${proposal.error.message}`);
                setExecutingMap(prev => ({ ...prev, [strategyId]: false }));
                return;
            }

            const buy = await api_base.api.send({
                buy: proposal.proposal.id,
                price: currentStake,
                subscribe: 1,
            });

            if (buy.error) {
                console.warn(`[SmartAuto] Buy error: ${buy.error.message}`);
                setExecutingMap(prev => ({ ...prev, [strategyId]: false }));
                return;
            }

            const contract_id = buy.buy.contract_id;

            const subscription = api_base.api.onMessage().subscribe((msg: any) => {
                if (
                    msg.msg_type === 'proposal_open_contract' &&
                    msg.proposal_open_contract.contract_id === contract_id
                ) {
                    const contract = msg.proposal_open_contract;
                    if (contract.is_sold) {
                        subscription.unsubscribe();
                        
                        const status = contract.status; // 'won' or 'lost'
                        const is_win = status === 'won';

                        setConfigs(prev => {
                            const newConfig = { ...prev[strategyId] };
                            if (is_win) {
                                newConfig.consecutive_losses = 0;
                                newConfig.current_stake = newConfig.stake;
                            } else {
                                newConfig.consecutive_losses = (newConfig.consecutive_losses || 0) + 1;
                                newConfig.current_stake = Number(((newConfig.current_stake || newConfig.stake) * (newConfig.martingale || 1)).toFixed(2));
                            }
                            const updated = { ...prev, [strategyId]: newConfig };
                            localStorage.setItem('smart_auto_configs', JSON.stringify(updated));
                            return updated;
                        });

                        // Play audio notification
                        if (smart_trading.sound_notifications) {
                            try {
                                const audio = new Audio(is_win ? '/media/win.mp3' : '/media/loss.mp3');
                                audio.play().catch(() => {});
                            } catch (e) {}
                        }

                        setExecutingMap(prev => ({ ...prev, [strategyId]: false }));
                    }
                }
            });

        } catch (e) {
            console.error('[SmartAuto] Trade purchase exception:', e);
            setExecutingMap(prev => ({ ...prev, [strategyId]: false }));
        }
    };

    // React logic runner triggered on every tick
    useEffect(() => {
        if (ticks.length < 15 || !is_socket_opened) return;

        const lastDigits = ticks.slice(-10);

        // 1. Rise/Fall Bot
        const rf = configs.rise_fall;
        if (rf.is_running && !executingMap.rise_fall) {
            const probVal = rf.prob_type === 'riseProb' ? probs.riseProb : probs.fallProb;
            const probOk = rf.operator === '>' ? (probVal > (rf.threshold || 55)) : (probVal < (rf.threshold || 55));
            
            // Check ticks streak direction
            let trendOk = false;
            const checkTicks = ticks.slice(-(rf.ticks_count || 3));
            if (checkTicks.length === (rf.ticks_count || 3)) {
                if (rf.ticks_condition === 'Rising') {
                    trendOk = checkTicks.every((val, i) => i === 0 || val > checkTicks[i - 1]);
                } else if (rf.ticks_condition === 'Falling') {
                    trendOk = checkTicks.every((val, i) => i === 0 || val < checkTicks[i - 1]);
                } else {
                    trendOk = true;
                }
            }

            if (probOk && trendOk) {
                purchaseTrade('rise_fall', rf.action === 'Buy Rise' ? 'CALL' : 'PUT');
            }
        }

        // 2. Even/Odd Bot
        const eo = configs.even_odd;
        if (eo.is_running && !executingMap.even_odd) {
            const probVal = eo.prob_type === 'even' ? probs.even : probs.odd;
            const probOk = eo.operator === '>' ? (probVal > (eo.threshold || 60)) : (probVal < (eo.threshold || 60));

            let streakOk = false;
            const checkTicks = ticks.slice(-(eo.ticks_count || 3));
            if (checkTicks.length === (eo.ticks_count || 3)) {
                if (eo.ticks_condition === 'Even') {
                    streakOk = checkTicks.every(v => v % 2 === 0);
                } else if (eo.ticks_condition === 'Odd') {
                    streakOk = checkTicks.every(v => v % 2 !== 0);
                } else {
                    streakOk = true;
                }
            }

            if (probOk && streakOk) {
                purchaseTrade('even_odd', eo.action === 'Buy Even' ? 'DIGITEVEN' : 'DIGITODD');
            }
        }

        // 3. Even/Odd Pattern Bot
        const eop = configs.even_odd_pattern;
        if (eop.is_running && !executingMap.even_odd_pattern) {
            const checkTicks = ticks.slice(-(eop.pattern_check_count || 3));
            if (checkTicks.length === (eop.pattern_check_count || 3)) {
                const targetSide = eop.pattern_check_side === 'Even';
                const patternOk = checkTicks.every(v => (v % 2 === 0) === targetSide);

                if (patternOk) {
                    purchaseTrade('even_odd_pattern', eop.pattern_action === 'Buy Even' ? 'DIGITEVEN' : 'DIGITODD');
                }
            }
        }

        // 4. Over/Under Bot
        const ou = configs.over_under;
        if (ou.is_running && !executingMap.over_under) {
            const ouProbs = getOverUnderProbs(ou.barrier || 5);
            const probVal = ou.prob_type === 'over' ? ouProbs.over : ouProbs.under;
            const probOk = ou.operator === '>' ? (probVal > (ou.threshold || 55)) : (probVal < (ou.threshold || 55));

            let streakOk = false;
            const checkTicks = ticks.slice(-(ou.ticks_count || 3));
            if (checkTicks.length === (ou.ticks_count || 3)) {
                const barrierVal = ou.barrier_check ?? 5;
                if (ou.ticks_condition === 'Over') {
                    streakOk = checkTicks.every(v => (v % 10) > barrierVal);
                } else if (ou.ticks_condition === 'Under') {
                    streakOk = checkTicks.every(v => (v % 10) < barrierVal);
                } else {
                    streakOk = true;
                }
            }

            if (probOk && streakOk) {
                purchaseTrade('over_under', ou.action === 'Buy Over' ? 'DIGITOVER' : 'DIGITUNDER', ou.prediction_digit);
            }
        }

        // 5. Over/Under Pattern Bot
        const oup = configs.over_under_pattern;
        if (oup.is_running && !executingMap.over_under_pattern) {
            const checkTicks = ticks.slice(-(oup.pattern_check_count || 3));
            if (checkTicks.length === (oup.pattern_check_count || 3)) {
                const barrierVal = oup.pattern_check_barrier ?? 5;
                let patternOk = false;
                if (oup.pattern_check_condition === 'Over') {
                    patternOk = checkTicks.every(v => (v % 10) > barrierVal);
                } else if (oup.pattern_check_condition === 'Under') {
                    patternOk = checkTicks.every(v => (v % 10) < barrierVal);
                } else if (oup.pattern_check_condition === 'Equal') {
                    patternOk = checkTicks.every(v => (v % 10) === barrierVal);
                }

                if (patternOk) {
                    purchaseTrade('over_under_pattern', oup.pattern_action === 'Buy Over' ? 'DIGITOVER' : 'DIGITUNDER', oup.pattern_action_prediction);
                }
            }
        }

        // 6. Matches/Differs Bot
        const md = configs.matches_differs;
        if (md.is_running && !executingMap.matches_differs) {
            const matchesProb = (digit_stats.find(s => s.digit === md.target_digit)?.percentage) || 0;
            const differsProb = 100 - matchesProb;
            const probVal = md.prob_type === 'matches' ? matchesProb : differsProb;
            const probOk = md.operator === '>' ? (probVal > (md.threshold || 55)) : (probVal < (md.threshold || 55));

            if (probOk) {
                purchaseTrade('matches_differs', md.action === 'Buy Matches' ? 'DIGITMATCH' : 'DIGITDIFF', md.target_digit);
            }
        }

    }, [last_digit, ticks.length]);

    const handleReconnect = () => {
        smart_trading.root_store.client.checkAndRegenerateWebSocket();
    };

    return (
        <div className='smart-auto-tab'>
            {/* 1. Header Control Strip */}
            <div className='smart-auto-header-strip'>
                <div className='strip-item'>
                    <label>Symbol:</label>
                    <select value={symbol} onChange={e => setSymbol(e.target.value)} className='strip-select'>
                        {smart_trading.markets.flatMap(g => g.items).map(item => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                    </select>
                </div>

                <div className='strip-item'>
                    <label>Ticks:</label>
                    <input
                        type='number'
                        value={smart_trading.stats_sample_size}
                        onChange={e => smart_trading.setStatsSampleSize(parseInt(e.target.value) || 120)}
                        className='strip-input'
                    />
                </div>

                <div className='strip-item price-badge'>
                    <span>Price: <strong>{current_price || '0.00'}</strong></span>
                </div>

                <div className='strip-item last-digit-badge'>
                    <span className={classNames('digit-square', {
                        even: last_digit !== null && last_digit % 2 === 0,
                        odd: last_digit !== null && last_digit % 2 !== 0,
                    })}>
                        {last_digit ?? '-'}
                    </span>
                </div>

                <button onClick={handleReconnect} className='reconnect-btn'>
                    🔄 {is_socket_opened ? 'Connected' : 'Reconnect'}
                </button>
            </div>

            {/* 2. Grid of 6 Columns */}
            <div className='smart-auto-grid'>
                {/* 1. Rise/Fall */}
                <div className={classNames('strategy-card', { active: configs.rise_fall.is_running })}>
                    <div className='card-header'>
                        <span className='title'>Rise/Fall</span>
                        <div
                            className={classNames('card-switch', { on: configs.rise_fall.is_running })}
                            onClick={() => updateConfig('rise_fall', 'is_running', !configs.rise_fall.is_running)}
                        >
                            <div className='switch-knob' />
                        </div>
                    </div>
                    
                    <div className='card-visuals'>
                        <div className='progress-row'>
                            <span className='label'>Rise</span>
                            <div className='progress-bar-wrap'>
                                <div className='progress-fill rise' style={{ width: `${probs.riseProb}%` }} />
                            </div>
                            <span className='percentage-text'>{probs.riseProb.toFixed(1)}%</span>
                        </div>
                        <div className='progress-row'>
                            <span className='label'>Fall</span>
                            <div className='progress-bar-wrap'>
                                <div className='progress-fill fall' style={{ width: `${probs.fallProb}%` }} />
                            </div>
                            <span className='percentage-text'>{probs.fallProb.toFixed(1)}%</span>
                        </div>
                    </div>

                    <div className='trading-condition-box'>
                        <span className='cond-title'>Trading Condition</span>
                        <div className='sentence-row'>
                            <span>If</span>
                            <select
                                value={configs.rise_fall.prob_type}
                                onChange={e => updateConfig('rise_fall', 'prob_type', e.target.value)}
                            >
                                <option value='riseProb'>Rise Prob</option>
                                <option value='fallProb'>Fall Prob</option>
                            </select>
                            <select
                                value={configs.rise_fall.operator}
                                onChange={e => updateConfig('rise_fall', 'operator', e.target.value)}
                            >
                                <option value='>'>&gt;</option>
                                <option value='<'>&lt;</option>
                            </select>
                            <input
                                type='number'
                                value={configs.rise_fall.threshold}
                                onChange={e => updateConfig('rise_fall', 'threshold', parseFloat(e.target.value) || 0)}
                                className='inline-input'
                            />
                            <span>% and last</span>
                            <input
                                type='number'
                                value={configs.rise_fall.ticks_count}
                                onChange={e => updateConfig('rise_fall', 'ticks_count', parseInt(e.target.value) || 3)}
                                className='inline-input short'
                            />
                            <span>ticks are</span>
                            <select
                                value={configs.rise_fall.ticks_condition}
                                onChange={e => updateConfig('rise_fall', 'ticks_condition', e.target.value)}
                            >
                                <option value='Rising'>Rising</option>
                                <option value='Falling'>Falling</option>
                                <option value='None'>None</option>
                            </select>
                            <span>, Then</span>
                            <select
                                value={configs.rise_fall.action}
                                onChange={e => updateConfig('rise_fall', 'action', e.target.value)}
                            >
                                <option value='Buy Rise'>Buy Rise</option>
                                <option value='Buy Fall'>Buy Fall</option>
                                <option value='Disable'>Disable</option>
                            </select>
                        </div>
                    </div>

                    <div className='card-inputs'>
                        <div className='input-item'>
                            <label>Stake</label>
                            <input
                                type='number'
                                value={configs.rise_fall.stake}
                                onChange={e => updateConfig('rise_fall', 'stake', parseFloat(e.target.value) || 0.5)}
                            />
                        </div>
                        <div className='input-item'>
                            <label>Ticks</label>
                            <input
                                type='number'
                                value={configs.rise_fall.ticks}
                                onChange={e => updateConfig('rise_fall', 'ticks', parseInt(e.target.value) || 1)}
                            />
                        </div>
                        <div className='input-item'>
                            <label>Martingale</label>
                            <input
                                type='number'
                                value={configs.rise_fall.martingale}
                                onChange={e => updateConfig('rise_fall', 'martingale', parseFloat(e.target.value) || 1)}
                            />
                        </div>
                    </div>
                </div>

                {/* 2. Even/Odd */}
                <div className={classNames('strategy-card', { active: configs.even_odd.is_running })}>
                    <div className='card-header'>
                        <span className='title'>Even/Odd</span>
                        <div
                            className={classNames('card-switch', { on: configs.even_odd.is_running })}
                            onClick={() => updateConfig('even_odd', 'is_running', !configs.even_odd.is_running)}
                        >
                            <div className='switch-knob' />
                        </div>
                    </div>

                    <div className='card-visuals'>
                        <div className='progress-row'>
                            <span className='label'>Even</span>
                            <div className='progress-bar-wrap'>
                                <div className='progress-fill even' style={{ width: `${probs.even}%` }} />
                            </div>
                            <span className='percentage-text'>{probs.even.toFixed(1)}%</span>
                        </div>
                        <div className='progress-row'>
                            <span className='label'>Odd</span>
                            <div className='progress-bar-wrap'>
                                <div className='progress-fill odd' style={{ width: `${probs.odd}%` }} />
                            </div>
                            <span className='percentage-text'>{probs.odd.toFixed(1)}%</span>
                        </div>
                    </div>

                    <div className='trading-condition-box'>
                        <span className='cond-title'>Trading Condition</span>
                        <div className='sentence-row'>
                            <span>If</span>
                            <select
                                value={configs.even_odd.prob_type}
                                onChange={e => updateConfig('even_odd', 'prob_type', e.target.value)}
                            >
                                <option value='even'>Even Prob</option>
                                <option value='odd'>Odd Prob</option>
                            </select>
                            <select
                                value={configs.even_odd.operator}
                                onChange={e => updateConfig('even_odd', 'operator', e.target.value)}
                            >
                                <option value='>'>&gt;</option>
                                <option value='<'>&lt;</option>
                            </select>
                            <input
                                type='number'
                                value={configs.even_odd.threshold}
                                onChange={e => updateConfig('even_odd', 'threshold', parseFloat(e.target.value) || 0)}
                                className='inline-input'
                            />
                            <span>% and last</span>
                            <input
                                type='number'
                                value={configs.even_odd.ticks_count}
                                onChange={e => updateConfig('even_odd', 'ticks_count', parseInt(e.target.value) || 3)}
                                className='inline-input short'
                            />
                            <span>ticks are</span>
                            <select
                                value={configs.even_odd.ticks_condition}
                                onChange={e => updateConfig('even_odd', 'ticks_condition', e.target.value)}
                            >
                                <option value='Even'>Even</option>
                                <option value='Odd'>Odd</option>
                                <option value='None'>None</option>
                            </select>
                            <span>, Then</span>
                            <select
                                value={configs.even_odd.action}
                                onChange={e => updateConfig('even_odd', 'action', e.target.value)}
                            >
                                <option value='Buy Even'>Buy Even</option>
                                <option value='Buy Odd'>Buy Odd</option>
                                <option value='Disable'>Disable</option>
                            </select>
                        </div>
                    </div>

                    <div className='card-inputs'>
                        <div className='input-item'>
                            <label>Stake</label>
                            <input
                                type='number'
                                value={configs.even_odd.stake}
                                onChange={e => updateConfig('even_odd', 'stake', parseFloat(e.target.value) || 0.5)}
                            />
                        </div>
                        <div className='input-item'>
                            <label>Ticks</label>
                            <input
                                type='number'
                                value={configs.even_odd.ticks}
                                onChange={e => updateConfig('even_odd', 'ticks', parseInt(e.target.value) || 1)}
                            />
                        </div>
                        <div className='input-item'>
                            <label>Martingale</label>
                            <input
                                type='number'
                                value={configs.even_odd.martingale}
                                onChange={e => updateConfig('even_odd', 'martingale', parseFloat(e.target.value) || 1)}
                            />
                        </div>
                    </div>
                </div>

                {/* 3. Even/Odd (Pattern) */}
                <div className={classNames('strategy-card', { active: configs.even_odd_pattern.is_running })}>
                    <div className='card-header'>
                        <span className='title'>Even/Odd (Pattern)</span>
                        <div
                            className={classNames('card-switch', { on: configs.even_odd_pattern.is_running })}
                            onClick={() => updateConfig('even_odd_pattern', 'is_running', !configs.even_odd_pattern.is_running)}
                        >
                            <div className='switch-knob' />
                        </div>
                    </div>

                    <div className='card-visuals pattern-style'>
                        <span className='visual-label'>Last Digits Pattern</span>
                        <div className='digits-badge-row'>
                            {ticks.slice(-10).map((tick, i) => (
                                <span key={i} className={classNames('pattern-badge', tick % 2 === 0 ? 'even' : 'odd')}>
                                    {tick % 2 === 0 ? 'E' : 'O'}
                                </span>
                            ))}
                        </div>
                        <span className='pattern-subtext'>Recent digit pattern (E=Even, O=Odd)</span>
                        <span className='pattern-streak-text'>Current streak: <strong>{streakInfo.count} {streakInfo.side === 'EVEN' ? 'Even' : 'Odd'}</strong></span>
                    </div>

                    <div className='trading-condition-box'>
                        <span className='cond-title'>Trading Condition</span>
                        <div className='sentence-row'>
                            <span>Check if the last</span>
                            <input
                                type='number'
                                value={configs.even_odd_pattern.pattern_check_count}
                                onChange={e => updateConfig('even_odd_pattern', 'pattern_check_count', parseInt(e.target.value) || 3)}
                                className='inline-input short'
                            />
                            <span>digits are</span>
                            <select
                                value={configs.even_odd_pattern.pattern_check_side}
                                onChange={e => updateConfig('even_odd_pattern', 'pattern_check_side', e.target.value)}
                            >
                                <option value='Even'>Even</option>
                                <option value='Odd'>Odd</option>
                            </select>
                            <span>, Then</span>
                            <select
                                value={configs.even_odd_pattern.pattern_action}
                                onChange={e => updateConfig('even_odd_pattern', 'pattern_action', e.target.value)}
                            >
                                <option value='Buy Even'>Buy Even</option>
                                <option value='Buy Odd'>Buy Odd</option>
                                <option value='Disable'>Disable</option>
                            </select>
                        </div>
                    </div>

                    <div className='card-inputs'>
                        <div className='input-item'>
                            <label>Stake</label>
                            <input
                                type='number'
                                value={configs.even_odd_pattern.stake}
                                onChange={e => updateConfig('even_odd_pattern', 'stake', parseFloat(e.target.value) || 0.5)}
                            />
                        </div>
                        <div className='input-item'>
                            <label>Ticks</label>
                            <input
                                type='number'
                                value={configs.even_odd_pattern.ticks}
                                onChange={e => updateConfig('even_odd_pattern', 'ticks', parseInt(e.target.value) || 1)}
                            />
                        </div>
                        <div className='input-item'>
                            <label>Martingale</label>
                            <input
                                type='number'
                                value={configs.even_odd_pattern.martingale}
                                onChange={e => updateConfig('even_odd_pattern', 'martingale', parseFloat(e.target.value) || 1)}
                            />
                        </div>
                    </div>
                </div>

                {/* 4. Over/Under */}
                <div className={classNames('strategy-card', { active: configs.over_under.is_running })}>
                    <div className='card-header'>
                        <span className='title'>Over/Under</span>
                        <div
                            className={classNames('card-switch', { on: configs.over_under.is_running })}
                            onClick={() => updateConfig('over_under', 'is_running', !configs.over_under.is_running)}
                        >
                            <div className='switch-knob' />
                        </div>
                    </div>

                    <div className='card-visuals'>
                        <div className='barrier-input-row'>
                            <label>Barrier:</label>
                            <input
                                type='number'
                                min='0'
                                max='9'
                                value={configs.over_under.barrier}
                                onChange={e => updateConfig('over_under', 'barrier', Math.min(9, Math.max(0, parseInt(e.target.value) || 5)))}
                                className='barrier-field'
                            />
                            <span className='barrier-limits-text'>
                                Under: 0-{Math.max(0, (configs.over_under.barrier || 5) - 1)}, Equals: {configs.over_under.barrier || 5}, Over: {Math.min(9, (configs.over_under.barrier || 5) + 1)}-9
                            </span>
                        </div>

                        {(() => {
                            const ouProbs = getOverUnderProbs(configs.over_under.barrier || 5);
                            return (
                                <>
                                    <div className='progress-row'>
                                        <span className='label'>Over</span>
                                        <div className='progress-bar-wrap'>
                                            <div className='progress-fill over' style={{ width: `${ouProbs.over}%` }} />
                                        </div>
                                        <span className='percentage-text'>{ouProbs.over.toFixed(1)}%</span>
                                    </div>
                                    <div className='progress-row'>
                                        <span className='label'>Under</span>
                                        <div className='progress-bar-wrap'>
                                            <div className='progress-fill under' style={{ width: `${ouProbs.under}%` }} />
                                        </div>
                                        <span className='percentage-text'>{ouProbs.under.toFixed(1)}%</span>
                                    </div>
                                </>
                            );
                        })()}
                    </div>

                    <div className='trading-condition-box'>
                        <span className='cond-title'>Trading Condition</span>
                        <div className='sentence-row'>
                            <span>If</span>
                            <select
                                value={configs.over_under.prob_type}
                                onChange={e => updateConfig('over_under', 'prob_type', e.target.value)}
                            >
                                <option value='over'>Over Prob</option>
                                <option value='under'>Under Prob</option>
                            </select>
                            <select
                                value={configs.over_under.operator}
                                onChange={e => updateConfig('over_under', 'operator', e.target.value)}
                            >
                                <option value='>'>&gt;</option>
                                <option value='<'>&lt;</option>
                            </select>
                            <input
                                type='number'
                                value={configs.over_under.threshold}
                                onChange={e => updateConfig('over_under', 'threshold', parseFloat(e.target.value) || 0)}
                                className='inline-input'
                            />
                            <span>% and last</span>
                            <input
                                type='number'
                                value={configs.over_under.ticks_count}
                                onChange={e => updateConfig('over_under', 'ticks_count', parseInt(e.target.value) || 3)}
                                className='inline-input short'
                            />
                            <span>ticks are</span>
                            <select
                                value={configs.over_under.ticks_condition}
                                onChange={e => updateConfig('over_under', 'ticks_condition', e.target.value)}
                            >
                                <option value='Over'>Over</option>
                                <option value='Under'>Under</option>
                            </select>
                            <input
                                type='number'
                                value={configs.over_under.barrier_check}
                                onChange={e => updateConfig('over_under', 'barrier_check', parseInt(e.target.value) || 5)}
                                className='inline-input short'
                            />
                            <span>, Then</span>
                            <select
                                value={configs.over_under.action}
                                onChange={e => updateConfig('over_under', 'action', e.target.value)}
                            >
                                <option value='Buy Over'>Buy Over</option>
                                <option value='Buy Under'>Buy Under</option>
                                <option value='Disable'>Disable</option>
                            </select>
                            <span>digit</span>
                            <input
                                type='number'
                                value={configs.over_under.prediction_digit}
                                onChange={e => updateConfig('over_under', 'prediction_digit', parseInt(e.target.value) || 5)}
                                className='inline-input short'
                            />
                        </div>
                    </div>

                    <div className='card-inputs'>
                        <div className='input-item'>
                            <label>Stake</label>
                            <input
                                type='number'
                                value={configs.over_under.stake}
                                onChange={e => updateConfig('over_under', 'stake', parseFloat(e.target.value) || 0.5)}
                            />
                        </div>
                        <div className='input-item'>
                            <label>Ticks</label>
                            <input
                                type='number'
                                value={configs.over_under.ticks}
                                onChange={e => updateConfig('over_under', 'ticks', parseInt(e.target.value) || 1)}
                            />
                        </div>
                        <div className='input-item'>
                            <label>Martingale</label>
                            <input
                                type='number'
                                value={configs.over_under.martingale}
                                onChange={e => updateConfig('over_under', 'martingale', parseFloat(e.target.value) || 1)}
                            />
                        </div>
                    </div>
                </div>

                {/* 5. Over/Under (Pattern) */}
                <div className={classNames('strategy-card', { active: configs.over_under_pattern.is_running })}>
                    <div className='card-header'>
                        <span className='title'>Over/Under (Pattern)</span>
                        <div
                            className={classNames('card-switch', { on: configs.over_under_pattern.is_running })}
                            onClick={() => updateConfig('over_under_pattern', 'is_running', !configs.over_under_pattern.is_running)}
                        >
                            <div className='switch-knob' />
                        </div>
                    </div>

                    <div className='card-visuals pattern-style'>
                        <span className='visual-label'>Last Digits Pattern</span>
                        <div className='digits-badge-row'>
                            {ticks.slice(-10).map((t, i) => {
                                const barrier = configs.over_under_pattern.barrier || 5;
                                const type = t > barrier ? 'over' : t === barrier ? 'equal' : 'under';
                                return (
                                    <span key={i} className={classNames('pattern-badge', type)}>
                                        {t}_{type[0].toUpperCase()}
                                    </span>
                                );
                            })}
                        </div>
                        <span className='pattern-subtext'>O=Over (&gt;{configs.over_under_pattern.barrier || 5}), E=Equal (={configs.over_under_pattern.barrier || 5}), U=Under (&lt;{configs.over_under_pattern.barrier || 5})</span>

                        {/* Frequency grid table */}
                        <div className='digit-frequency-grid-v2'>
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => {
                                const stat = digit_stats.find(s => s.digit === d);
                                return (
                                    <div key={d} className='grid-cell'>
                                        <span className='d-lbl'>{d}</span>
                                        <span className='d-pct'>{stat ? stat.percentage.toFixed(1) : '0.0'}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className='trading-condition-box'>
                        <span className='cond-title'>Trading Condition</span>
                        <div className='sentence-row'>
                            <span>Check if the last</span>
                            <input
                                type='number'
                                value={configs.over_under_pattern.pattern_check_count}
                                onChange={e => updateConfig('over_under_pattern', 'pattern_check_count', parseInt(e.target.value) || 3)}
                                className='inline-input short'
                            />
                            <span>digits are</span>
                            <select
                                value={configs.over_under_pattern.pattern_check_condition}
                                onChange={e => updateConfig('over_under_pattern', 'pattern_check_condition', e.target.value)}
                            >
                                <option value='Over'>Over</option>
                                <option value='Under'>Under</option>
                                <option value='Equal'>Equal</option>
                            </select>
                            <input
                                type='number'
                                value={configs.over_under_pattern.pattern_check_barrier}
                                onChange={e => updateConfig('over_under_pattern', 'pattern_check_barrier', parseInt(e.target.value) || 5)}
                                className='inline-input short'
                            />
                            <span>, Then</span>
                            <select
                                value={configs.over_under_pattern.pattern_action}
                                onChange={e => updateConfig('over_under_pattern', 'pattern_action', e.target.value)}
                            >
                                <option value='Buy Over'>Buy Over</option>
                                <option value='Buy Under'>Buy Under</option>
                                <option value='Disable'>Disable</option>
                            </select>
                            <span>digit</span>
                            <input
                                type='number'
                                value={configs.over_under_pattern.pattern_action_prediction}
                                onChange={e => updateConfig('over_under_pattern', 'pattern_action_prediction', parseInt(e.target.value) || 5)}
                                className='inline-input short'
                            />
                        </div>
                    </div>

                    <div className='card-inputs'>
                        <div className='input-item'>
                            <label>Stake</label>
                            <input
                                type='number'
                                value={configs.over_under_pattern.stake}
                                onChange={e => updateConfig('over_under_pattern', 'stake', parseFloat(e.target.value) || 0.5)}
                            />
                        </div>
                        <div className='input-item'>
                            <label>Ticks</label>
                            <input
                                type='number'
                                value={configs.over_under_pattern.ticks}
                                onChange={e => updateConfig('over_under_pattern', 'ticks', parseInt(e.target.value) || 1)}
                            />
                        </div>
                        <div className='input-item'>
                            <label>Martingale</label>
                            <input
                                type='number'
                                value={configs.over_under_pattern.martingale}
                                onChange={e => updateConfig('over_under_pattern', 'martingale', parseFloat(e.target.value) || 1)}
                            />
                        </div>
                    </div>
                </div>

                {/* 6. Matches/Differs */}
                <div className={classNames('strategy-card', { active: configs.matches_differs.is_running })}>
                    <div className='card-header'>
                        <span className='title'>Matches/Differs</span>
                        <div
                            className={classNames('card-switch', { on: configs.matches_differs.is_running })}
                            onClick={() => updateConfig('matches_differs', 'is_running', !configs.matches_differs.is_running)}
                        >
                            <div className='switch-knob' />
                        </div>
                    </div>

                    <div className='card-visuals'>
                        <span className='freq-header-text'>Most frequent: <strong>{statsMap.most} ({statsMap.mostPct.toFixed(1)}%)</strong></span>
                        
                        {(() => {
                            const targetDigit = configs.matches_differs.target_digit ?? 5;
                            const matchesProb = (digit_stats.find(s => s.digit === targetDigit)?.percentage) || 0;
                            const differsProb = 100 - matchesProb;
                            return (
                                <>
                                    <div className='progress-row'>
                                        <span className='label'>Matches</span>
                                        <div className='progress-bar-wrap'>
                                            <div className='progress-fill matches' style={{ width: `${matchesProb}%` }} />
                                        </div>
                                        <span className='percentage-text'>{matchesProb.toFixed(1)}%</span>
                                    </div>
                                    <div className='progress-row'>
                                        <span className='label'>Differs</span>
                                        <div className='progress-bar-wrap'>
                                            <div className='progress-fill differs' style={{ width: `${differsProb}%` }} />
                                        </div>
                                        <span className='percentage-text'>{differsProb.toFixed(1)}%</span>
                                    </div>
                                    <span className='visual-subtext-info'>Barrier digit {targetDigit} appears {matchesProb.toFixed(1)}% of the time</span>
                                </>
                            );
                        })()}

                        {/* Frequency vertical mini bar chart */}
                        <div className='digit-bar-chart-spectrum'>
                            {digit_stats.map(stat => (
                                <div key={stat.digit} className='bar-column'>
                                    <div className='bar-wrapper'>
                                        <div
                                            className='inner-bar-fill'
                                            style={{ height: `${(stat.count / Math.max(...digit_stats.map(s => s.count), 1)) * 100}%` }}
                                        />
                                    </div>
                                    <span className='bar-digit-num'>{stat.digit}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className='trading-condition-box'>
                        <span className='cond-title'>Trading Condition</span>
                        <div className='sentence-row'>
                            <span>If</span>
                            <select
                                value={configs.matches_differs.prob_type}
                                onChange={e => updateConfig('matches_differs', 'prob_type', e.target.value)}
                            >
                                <option value='matches'>Matches Prob</option>
                                <option value='differs'>Differs Prob</option>
                            </select>
                            <select
                                value={configs.matches_differs.operator}
                                onChange={e => updateConfig('matches_differs', 'operator', e.target.value)}
                            >
                                <option value='>'>&gt;</option>
                                <option value='<'>&lt;</option>
                            </select>
                            <input
                                type='number'
                                value={configs.matches_differs.threshold}
                                onChange={e => updateConfig('matches_differs', 'threshold', parseFloat(e.target.value) || 0)}
                                className='inline-input'
                            />
                            <span>% for</span>
                            <input
                                type='number'
                                value={configs.matches_differs.target_digit}
                                onChange={e => updateConfig('matches_differs', 'target_digit', parseInt(e.target.value) || 5)}
                                className='inline-input short'
                            />
                            <span>, Then</span>
                            <select
                                value={configs.matches_differs.action}
                                onChange={e => updateConfig('matches_differs', 'action', e.target.value)}
                            >
                                <option value='Buy Matches'>Buy Matches</option>
                                <option value='Buy Differs'>Buy Differs</option>
                                <option value='Disable'>Disable</option>
                            </select>
                        </div>
                    </div>

                    <div className='card-inputs'>
                        <div className='input-item'>
                            <label>Stake</label>
                            <input
                                type='number'
                                value={configs.matches_differs.stake}
                                onChange={e => updateConfig('matches_differs', 'stake', parseFloat(e.target.value) || 0.5)}
                            />
                        </div>
                        <div className='input-item'>
                            <label>Ticks</label>
                            <input
                                type='number'
                                value={configs.matches_differs.ticks}
                                onChange={e => updateConfig('matches_differs', 'ticks', parseInt(e.target.value) || 1)}
                            />
                        </div>
                        <div className='input-item'>
                            <label>Martingale</label>
                            <input
                                type='number'
                                value={configs.matches_differs.martingale}
                                onChange={e => updateConfig('matches_differs', 'martingale', parseFloat(e.target.value) || 1)}
                            />
                        </div>
                    </div>
                </div>

            </div>

            <div className='smart-auto-controls' style={{ marginTop: '40px', marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
                <button
                    className={`btn-speed-trade ${Object.values(configs).some(c => c.is_running) ? 'running' : ''}`}
                    onClick={() => {
                        const isAnyRunning = Object.values(configs).some(c => c.is_running);
                        Object.keys(configs).forEach(key => {
                            updateConfig(key, 'is_running', !isAnyRunning);
                        });
                    }}
                    style={{
                        width: '100%',
                        maxWidth: '450px',
                        padding: '20px 40px',
                        fontSize: '18px',
                        fontWeight: '900',
                        letterSpacing: '2px',
                        borderRadius: '12px',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#fff',
                        background: Object.values(configs).some(c => c.is_running)
                            ? 'linear-gradient(135deg, #ef4444, #f43f5e)'
                            : 'linear-gradient(135deg, #6366f1, #a855f7)',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                        transition: 'all 0.3s ease'
                    }}
                >
                    {Object.values(configs).some(c => c.is_running) ? 'STOP ALL STRATEGIES' : 'START ALL STRATEGIES'}
                </button>
            </div>
        </div>
    );
});

export default AutomatedTradingView;
