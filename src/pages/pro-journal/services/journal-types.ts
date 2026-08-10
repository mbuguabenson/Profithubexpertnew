// ─── Pro Compounding Journal — Type Definitions ────────────────────────────

// ─── Enums ──────────────────────────────────────────────────────────────────

export enum TransactionStatus {
    PENDING = 'pending',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',
    FAILED = 'failed',
}

export enum ChallengeStatus {
    ACTIVE = 'active',
    COMPLETED = 'completed',
    FAILED = 'failed',
    PAUSED = 'paused',
}

export enum SessionStatus {
    TARGET_ACHIEVED = 'target_achieved',
    BELOW_TARGET = 'below_target',
    ABOVE_TARGET = 'above_target',
    NO_ACTIVITY = 'no_activity',
}

export enum LedgerEntryType {
    STARTING_CAPITAL = 'starting_capital',
    DEPOSIT = 'deposit',
    WITHDRAWAL = 'withdrawal',
    JOURNAL_PROFIT = 'journal_profit',
    JOURNAL_LOSS = 'journal_loss',
    ADJUSTMENT = 'adjustment',
}

export enum AuditAction {
    DEPOSIT_CREATED = 'deposit_created',
    DEPOSIT_EDITED = 'deposit_edited',
    DEPOSIT_DELETED = 'deposit_deleted',
    WITHDRAWAL_CREATED = 'withdrawal_created',
    WITHDRAWAL_EDITED = 'withdrawal_edited',
    WITHDRAWAL_DELETED = 'withdrawal_deleted',
    TRADE_CREATED = 'trade_created',
    TRADE_EDITED = 'trade_edited',
    TRADE_DELETED = 'trade_deleted',
    SESSION_CREATED = 'session_created',
    SESSION_EDITED = 'session_edited',
    SESSION_DELETED = 'session_deleted',
    CHALLENGE_CREATED = 'challenge_created',
    CHALLENGE_EDITED = 'challenge_edited',
    CHALLENGE_DELETED = 'challenge_deleted',
    TRANSACTION_DELETED = 'transaction_deleted',
    STRATEGY_RENAMED = 'strategy_renamed',
    DATA_IMPORTED = 'data_imported',
    DATA_EXPORTED = 'data_exported',
    ADJUSTMENT_CREATED = 'adjustment_created',
}

export type TradeDirection = 'buy' | 'sell' | 'call' | 'put' | 'over' | 'under' | 'rise' | 'fall' | 'other';

// ─── Core Interfaces ────────────────────────────────────────────────────────

export interface IJournalDeposit {
    id: string;
    date: string;            // ISO 8601
    reference: string;
    amount: number;
    currency: string;
    method: string;          // e.g. 'bank_transfer', 'crypto', 'ewallet'
    notes: string;
    status: TransactionStatus;
    created_at: string;
    updated_at: string;
    is_deleted: boolean;
    deleted_at?: string;
    import_source?: string;
    import_timestamp?: string;
    original_reference?: string;
    validation_status?: 'valid' | 'warning' | 'invalid';
}

export interface IJournalWithdrawal {
    id: string;
    date: string;
    reference: string;
    amount: number;
    currency: string;
    method: string;
    notes: string;
    status: TransactionStatus;
    created_at: string;
    updated_at: string;
    is_deleted: boolean;
    deleted_at?: string;
    import_source?: string;
    import_timestamp?: string;
    original_reference?: string;
    validation_status?: 'valid' | 'warning' | 'invalid';
}

export interface IJournalTrade {
    id: string;
    date: string;            // ISO 8601 date-time
    market: string;
    strategy_name: string;
    direction: TradeDirection;
    entry_value: number;
    exit_value: number;
    stake: number;
    result: 'win' | 'loss' | 'tie';
    profit_loss: number;
    session_id?: string;
    reason_entry: string;
    reason_exit: string;
    notes: string;
    screenshot?: string;     // base64 data URI (optional)
    emotional_notes: string;
    currency: string;
    created_at: string;
    updated_at: string;
    is_deleted: boolean;
    deleted_at?: string;
    import_source?: string;
    import_timestamp?: string;
    original_reference?: string;
    validation_status?: 'valid' | 'warning' | 'invalid';
}

export interface IJournalSession {
    id: string;
    date: string;            // ISO 8601 date
    starting_balance: number;
    ending_balance: number;
    deposits: number;
    withdrawals: number;
    total_trades: number;
    winning_trades: number;
    losing_trades: number;
    session_pl: number;
    planned_target: number;
    target_achieved: boolean;
    strategy_used: string;
    notes: string;
    status: SessionStatus;
    currency: string;
    created_at: string;
    updated_at: string;
    is_deleted: boolean;
    deleted_at?: string;
}

export interface ICompoundingDay {
    day: number;
    starting_balance: number;
    planned_growth: number;
    target_balance: number;
    actual_balance: number | null;
    difference: number | null;
    progress_percent: number | null;
    status: 'pending' | 'achieved' | 'missed' | 'exceeded';
}

export interface ICompoundingChallenge {
    id: string;
    name: string;
    starting_capital: number;
    target_capital: number;
    num_days: number;
    sessions_per_day: number;
    target_percent: number;
    max_risk_percent: number;
    start_date: string;
    status: ChallengeStatus;
    days: ICompoundingDay[];
    currency: string;
    created_at: string;
    updated_at: string;
    is_deleted: boolean;
    deleted_at?: string;
}

export interface ILedgerEntry {
    id: string;
    date: string;
    type: LedgerEntryType;
    reference: string;
    description: string;
    credit: number;
    debit: number;
    balance: number;         // running balance
    source_id?: string;      // links to deposit/withdrawal/trade id
    created_at: string;
}

export interface IAuditLogEntry {
    id: string;
    action: AuditAction;
    user: string;
    timestamp: string;
    previous_value: string;
    new_value: string;
    record_affected: string;
    source: string;
}

// ─── Account Adapter Interfaces ─────────────────────────────────────────────

export interface IAccountProfile {
    account_id: string;
    currency: string;
    account_type: 'demo' | 'real';
    country: string;
    created_date: string;
    account_status: string;
    is_virtual: boolean;
    balance: number;
    last_sync: string;
    data_source: string;
    connection_status: 'connected' | 'disconnected' | 'unknown';
}

// ─── Strategy Performance (computed) ────────────────────────────────────────

export interface IStrategyPerformance {
    strategy_name: string;
    total_trades: number;
    wins: number;
    losses: number;
    ties: number;
    win_rate: number;
    total_pl: number;
    average_pl: number;
    best_result: number;
    worst_result: number;
    longest_win_streak: number;
    longest_loss_streak: number;
    average_session_result: number;
}

// ─── Journal Overview (computed) ────────────────────────────────────────────

export interface IJournalOverview {
    account_name: string;
    account_id: string;
    currency: string;
    current_balance: number;
    starting_capital: number;
    current_equity: number;
    total_deposits: number;
    total_withdrawals: number;
    net_deposits: number;
    total_journal_pl: number;
    total_return_percent: number;
    current_compounding_cycle: string;
    challenge_start_date: string;
    challenge_target: number;
    target_progress_percent: number;
    challenge_status: ChallengeStatus | 'none';
}

// ─── Validation ─────────────────────────────────────────────────────────────

export interface IValidationResult {
    is_valid: boolean;
    errors: string[];
    warnings: string[];
}

// ─── Filter types ───────────────────────────────────────────────────────────

export interface ITransactionFilter {
    date_from?: string;
    date_to?: string;
    type?: 'deposit' | 'withdrawal' | 'all';
    status?: TransactionStatus | 'all';
    currency?: string;
}

export interface ITradeFilter {
    date_from?: string;
    date_to?: string;
    strategy?: string;
    result?: 'win' | 'loss' | 'tie' | 'all';
    market?: string;
}

export type TimeRange = '7d' | '30d' | '90d' | 'full';
