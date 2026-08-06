import { action, makeObservable, observable } from 'mobx';
import RootStore from './root-store';

export type TCompoundingMode = 'compound_wins' | 'fixed_stake' | 'martingale';
export type TDollarflipperStrategy = 'over_under' | 'even_odd' | 'differs' | 'auto_ai';

export interface TDollarflipperTradeLog {
  id: string;
  symbol: string;
  tradeType: string;
  stake: number;
  profit: number;
  result: 'WIN' | 'LOSS';
  timestamp: number;
  compoundStep: number;
}

export interface IDollarflipperStore {
  target_profit: number;
  stake_percentage: number;
  challenge_days: number;
  sessions_per_day: number;
  completed_sessions: number;
  compounding_mode: TCompoundingMode;
  strategy_type: TDollarflipperStrategy;
  
  is_running: boolean;
  current_session_profit: number;
  current_session_target: number;
  session_wins: number;
  session_losses: number;
  consecutive_wins: number;
  consecutive_losses: number;
  compound_step: number;
  initial_session_stake: number;
  current_stake: number;
  status_message: string;
  recent_trades: TDollarflipperTradeLog[];

  setTargetProfit: (val: number) => void;
  setStakePercentage: (val: number) => void;
  setChallengeDays: (val: number) => void;
  setSessionsPerDay: (val: number) => void;
  setCompoundingMode: (mode: TCompoundingMode) => void;
  setStrategyType: (type: TDollarflipperStrategy) => void;
  startDollarflipper: () => void;
  stopDollarflipper: () => void;
  resetChallenge: () => void;
  recordTradeResult: (result: 'WIN' | 'LOSS', profit: number, symbol: string, tradeType: string, stakeUsed: number) => void;
}

export default class DollarflipperStore implements IDollarflipperStore {
  root_store: RootStore;

  target_profit = 10;
  stake_percentage = 2; // 2% of balance
  challenge_days = 30;
  sessions_per_day = 1;
  completed_sessions = 0;
  compounding_mode: TCompoundingMode = 'compound_wins';
  strategy_type: TDollarflipperStrategy = 'over_under';

  is_running = false;
  current_session_profit = 0;
  current_session_target = 10;
  session_wins = 0;
  session_losses = 0;
  consecutive_wins = 0;
  consecutive_losses = 0;
  compound_step = 1;
  initial_session_stake = 0.35;
  current_stake = 0.35;
  status_message = 'Engine Ready. Configure target and click Launch.';
  recent_trades: TDollarflipperTradeLog[] = [];

  constructor(root_store: RootStore) {
    makeObservable(this, {
      target_profit: observable,
      stake_percentage: observable,
      challenge_days: observable,
      sessions_per_day: observable,
      completed_sessions: observable,
      compounding_mode: observable,
      strategy_type: observable,
      is_running: observable,
      current_session_profit: observable,
      current_session_target: observable,
      session_wins: observable,
      session_losses: observable,
      consecutive_wins: observable,
      consecutive_losses: observable,
      compound_step: observable,
      initial_session_stake: observable,
      current_stake: observable,
      status_message: observable,
      recent_trades: observable,

      setTargetProfit: action,
      setStakePercentage: action,
      setChallengeDays: action,
      setSessionsPerDay: action,
      setCompoundingMode: action,
      setStrategyType: action,
      startDollarflipper: action,
      stopDollarflipper: action,
      resetChallenge: action,
      recordTradeResult: action,
    });

    this.root_store = root_store;
    this.loadState();
  }

  loadState() {
    try {
      const saved = localStorage.getItem('dollarflipper_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.target_profit = parsed.target_profit || 10;
        this.stake_percentage = parsed.stake_percentage || 2;
        this.challenge_days = parsed.challenge_days || 30;
        this.sessions_per_day = parsed.sessions_per_day || 1;
        this.completed_sessions = parsed.completed_sessions || 0;
        this.compounding_mode = parsed.compounding_mode || 'compound_wins';
        this.strategy_type = parsed.strategy_type || 'over_under';
        this.recent_trades = parsed.recent_trades || [];
      }
    } catch (e) {
      console.error('Failed to load dollarflipper state', e);
    }
  }

  saveState() {
    try {
      localStorage.setItem('dollarflipper_state', JSON.stringify({
        target_profit: this.target_profit,
        stake_percentage: this.stake_percentage,
        challenge_days: this.challenge_days,
        sessions_per_day: this.sessions_per_day,
        completed_sessions: this.completed_sessions,
        compounding_mode: this.compounding_mode,
        strategy_type: this.strategy_type,
        recent_trades: this.recent_trades.slice(0, 30),
      }));
    } catch (e) {
      console.error('Failed to save dollarflipper state', e);
    }
  }

  setTargetProfit = (val: number) => {
    this.target_profit = val;
    this.current_session_target = val;
    this.saveState();
  };

  setStakePercentage = (val: number) => {
    this.stake_percentage = val;
    this.saveState();
  };

  setChallengeDays = (val: number) => {
    this.challenge_days = val;
    this.saveState();
  };

  setSessionsPerDay = (val: number) => {
    this.sessions_per_day = val;
    this.saveState();
  };

  setCompoundingMode = (mode: TCompoundingMode) => {
    this.compounding_mode = mode;
    this.saveState();
  };

  setStrategyType = (type: TDollarflipperStrategy) => {
    this.strategy_type = type;
    this.saveState();
  };

  startDollarflipper = () => {
    this.is_running = true;
    this.current_session_profit = 0;
    this.current_session_target = this.target_profit;
    this.session_wins = 0;
    this.session_losses = 0;
    this.consecutive_wins = 0;
    this.consecutive_losses = 0;
    this.compound_step = 1;

    // Calculate initial stake from balance
    const balance = Number(this.root_store.client?.balance || 10);
    const computedStake = balance * (this.stake_percentage / 100);
    this.initial_session_stake = computedStake > 0.35 ? Number(computedStake.toFixed(2)) : 0.35;
    this.current_stake = this.initial_session_stake;

    this.status_message = `🚀 Engine Active. Target: $${this.target_profit} | Initial Stake: $${this.current_stake}`;

    // Configure Market Hunter / Scanner store for execution
    const scanner = this.root_store.scanner;
    scanner.stake = this.current_stake;
    scanner.take_profit = this.target_profit;

    if (this.strategy_type === 'over_under') {
      scanner.selected_trade_type = 'over_under';
      scanner.selected_strategies = ['over_under'];
    } else if (this.strategy_type === 'even_odd') {
      scanner.selected_trade_type = 'even_odd';
      scanner.selected_strategies = ['even_odd'];
    } else if (this.strategy_type === 'differs') {
      scanner.selected_trade_type = 'differs';
      scanner.selected_strategies = ['differs'];
    } else {
      scanner.selected_strategies = ['even_odd', 'over_under', 'differs', 'matches', 'rise_fall'];
    }

    // Activate AI Automation engine
    scanner.setFullAiAutomation(true);
    if (!scanner.is_scanning) {
      scanner.startScanning();
    }
  };

  stopDollarflipper = () => {
    this.is_running = false;
    this.status_message = '⏸️ Engine Paused by User.';
    this.root_store.scanner.setFullAiAutomation(false);
    this.root_store.scanner.stopScanning();
  };

  resetChallenge = () => {
    this.is_running = false;
    this.completed_sessions = 0;
    this.current_session_profit = 0;
    this.session_wins = 0;
    this.session_losses = 0;
    this.consecutive_wins = 0;
    this.consecutive_losses = 0;
    this.compound_step = 1;
    this.recent_trades = [];
    this.status_message = '🔄 Challenge Reset. Ready for Step 1.';
    this.saveState();
  };

  recordTradeResult = (
    result: 'WIN' | 'LOSS',
    profit: number,
    symbol: string,
    tradeType: string,
    stakeUsed: number
  ) => {
    if (!this.is_running) return;

    this.current_session_profit += profit;

    const newLog: TDollarflipperTradeLog = {
      id: `df_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      symbol,
      tradeType,
      stake: stakeUsed,
      profit,
      result,
      timestamp: Date.now(),
      compoundStep: this.compound_step,
    };

    this.recent_trades = [newLog, ...this.recent_trades].slice(0, 30);

    // Push Journal Notification
    try {
      const journal = this.root_store.journal;
      if (journal && journal.pushMessage) {
        const logMsg = `[DOLLARFLIPPER] ${result === 'WIN' ? '🎉 WIN' : '💔 LOSS'} (${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}) | Market: ${symbol} | Type: ${tradeType} | Stake: $${stakeUsed.toFixed(2)} | Step: ${this.compound_step} | Session Profit: $${this.current_session_profit.toFixed(2)} / $${this.target_profit.toFixed(2)}`;
        journal.pushMessage(
          logMsg,
          result === 'WIN' ? 'success' : 'warn',
          result === 'WIN' ? 'journal__text--success' : 'journal__text--warn'
        );
      }
    } catch (e) {
      // ignore
    }

    if (result === 'WIN') {
      this.session_wins += 1;
      this.consecutive_wins += 1;
      this.consecutive_losses = 0;

      // Handle Compounding Logic
      if (this.compounding_mode === 'compound_wins') {
        // Reinvest profit for next step
        this.compound_step += 1;
        this.current_stake = Number((stakeUsed + profit).toFixed(2));
        this.status_message = `🎉 WIN (+$${profit.toFixed(2)})! Compounding to Step ${this.compound_step} ($${this.current_stake})`;
      } else if (this.compounding_mode === 'fixed_stake') {
        this.current_stake = this.initial_session_stake;
        this.status_message = `🎉 WIN (+$${profit.toFixed(2)})! Maintaining fixed stake ($${this.current_stake})`;
      } else if (this.compounding_mode === 'martingale') {
        // Reset stake back to initial after a win
        this.compound_step = 1;
        this.current_stake = this.initial_session_stake;
        this.status_message = `🎉 WIN (+$${profit.toFixed(2)})! Reset stake to initial ($${this.current_stake})`;
      }

      // Check if Session Target Reached
      if (this.current_session_profit >= this.current_session_target) {
        this.completed_sessions += 1;
        this.is_running = false;
        this.status_message = `🏆 SESSION COMPLETED! Goal $${this.target_profit} reached! (Session #${this.completed_sessions})`;
        this.root_store.scanner.setFullAiAutomation(false);
        this.root_store.scanner.stopScanning();
        this.saveState();
        return;
      }
    } else {
      this.session_losses += 1;
      this.consecutive_losses += 1;
      this.consecutive_wins = 0;

      // Reset compounding step on loss
      this.compound_step = 1;

      if (this.compounding_mode === 'martingale') {
        // Multiply stake by 2 on loss
        this.current_stake = Number((stakeUsed * 2).toFixed(2));
        this.status_message = `💔 LOSS (-$${Math.abs(profit).toFixed(2)}). Martingale recovery stake: $${this.current_stake}`;
      } else {
        // Reset to initial stake
        this.current_stake = this.initial_session_stake;
        this.status_message = `💔 LOSS (-$${Math.abs(profit).toFixed(2)}). Resetting compound step to initial stake ($${this.current_stake})`;
      }

      // Safety guard: max 3 consecutive losses stops session
      if (this.consecutive_losses >= 3) {
        this.is_running = false;
        this.status_message = `⚠️ RISK GUARD: 3 consecutive losses detected. Session paused for capital protection.`;
        this.root_store.scanner.setFullAiAutomation(false);
        this.root_store.scanner.stopScanning();
      }
    }

    // Update scanner stake for next automated run
    this.root_store.scanner.stake = this.current_stake;
    this.saveState();
  };
}
