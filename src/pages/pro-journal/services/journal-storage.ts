// ─── Pro Compounding Journal — Storage & Validation Service ─────────────────
import {
    type IJournalDeposit,
    type IJournalWithdrawal,
    type IJournalTrade,
    type IJournalSession,
    type ICompoundingChallenge,
    type ICompoundingDay,
    type ILedgerEntry,
    type IAuditLogEntry,
    type IAccountProfile,
    type IStrategyPerformance,
    type IJournalOverview,
    type IValidationResult,
    type ITransactionFilter,
    type ITradeFilter,
    TransactionStatus,
    ChallengeStatus,
    SessionStatus,
    LedgerEntryType,
    AuditAction,
} from './journal-types';

// ─── Helpers ────────────────────────────────────────────────────────────────

const uid = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const now = (): string => new Date().toISOString();

function readStore<T>(key: string): T[] {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function writeStore<T>(key: string, data: T[]): void {
    localStorage.setItem(key, JSON.stringify(data));
}

// ─── Storage Keys ───────────────────────────────────────────────────────────

const KEYS = {
    DEPOSITS: 'pj_deposits',
    WITHDRAWALS: 'pj_withdrawals',
    TRADES: 'pj_trades',
    SESSIONS: 'pj_sessions',
    CHALLENGES: 'pj_challenges',
    LEDGER: 'pj_ledger',
    AUDIT: 'pj_audit_log',
    SETTINGS: 'pj_settings',
} as const;

// ─── Validation ─────────────────────────────────────────────────────────────

const VALID_CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'BTC', 'ETH', 'USDT', 'LTC', 'IDR', 'JPY', 'CAD', 'CHF', 'NZD', 'SGD', 'HKD', 'ZAR', 'KES'];

export function validateDeposit(d: Partial<IJournalDeposit>, existing: IJournalDeposit[]): IValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!d.date) errors.push('Date is required.');
    if (!d.reference || d.reference.trim().length === 0) errors.push('Reference is required.');
    if (d.reference && existing.some(e => e.reference === d.reference && !e.is_deleted && e.id !== (d as any).id)) errors.push('Duplicate reference detected.');
    if (d.amount === undefined || d.amount === null) errors.push('Amount is required.');
    else if (d.amount <= 0) errors.push('Amount must be greater than zero.');
    if (d.currency && !VALID_CURRENCIES.includes(d.currency)) warnings.push(`Currency "${d.currency}" is non-standard.`);
    if (d.date && isNaN(Date.parse(d.date))) errors.push('Invalid date format.');
    return { is_valid: errors.length === 0, errors, warnings };
}

export function validateWithdrawal(w: Partial<IJournalWithdrawal>, existing: IJournalWithdrawal[]): IValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!w.date) errors.push('Date is required.');
    if (!w.reference || w.reference.trim().length === 0) errors.push('Reference is required.');
    if (w.reference && existing.some(e => e.reference === w.reference && !e.is_deleted && e.id !== (w as any).id)) errors.push('Duplicate reference detected.');
    if (w.amount === undefined || w.amount === null) errors.push('Amount is required.');
    else if (w.amount <= 0) errors.push('Amount must be greater than zero.');
    if (w.currency && !VALID_CURRENCIES.includes(w.currency)) warnings.push(`Currency "${w.currency}" is non-standard.`);
    if (w.date && isNaN(Date.parse(w.date))) errors.push('Invalid date format.');
    return { is_valid: errors.length === 0, errors, warnings };
}

export function validateTrade(t: Partial<IJournalTrade>, existing: IJournalTrade[]): IValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!t.date) errors.push('Date is required.');
    if (!t.market || t.market.trim().length === 0) errors.push('Market is required.');
    if (!t.strategy_name || t.strategy_name.trim().length === 0) warnings.push('Strategy name is empty — analytics will be limited.');
    if (t.stake !== undefined && t.stake < 0) errors.push('Stake cannot be negative.');
    if (t.date && isNaN(Date.parse(t.date))) errors.push('Invalid date format.');
    return { is_valid: errors.length === 0, errors, warnings };
}

export function validateChallenge(c: Partial<ICompoundingChallenge>): IValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!c.name || c.name.trim().length === 0) errors.push('Challenge name is required.');
    if (!c.starting_capital || c.starting_capital <= 0) errors.push('Starting capital must be positive.');
    if (!c.target_capital || c.target_capital <= 0) errors.push('Target capital must be positive.');
    if (c.starting_capital && c.target_capital && c.target_capital <= c.starting_capital) errors.push('Target must exceed starting capital.');
    if (!c.num_days || c.num_days < 1) errors.push('Number of days must be at least 1.');
    if (c.num_days && c.num_days > 365) warnings.push('Challenge exceeds 1 year — consider shorter milestones.');
    if (!c.target_percent || c.target_percent <= 0) errors.push('Target % must be positive.');
    if (c.max_risk_percent && c.max_risk_percent > 100) errors.push('Max risk cannot exceed 100%.');
    return { is_valid: errors.length === 0, errors, warnings };
}

// ─── Compounding Plan Generator ─────────────────────────────────────────────

export function generateCompoundingPlan(
    starting_capital: number,
    target_capital: number,
    num_days: number,
    target_percent: number
): ICompoundingDay[] {
    const days: ICompoundingDay[] = [];
    let balance = starting_capital;
    for (let i = 1; i <= num_days; i++) {
        const growth = balance * (target_percent / 100);
        const target_bal = balance + growth;
        days.push({
            day: i,
            starting_balance: Math.round(balance * 100) / 100,
            planned_growth: Math.round(growth * 100) / 100,
            target_balance: Math.round(target_bal * 100) / 100,
            actual_balance: null,
            difference: null,
            progress_percent: null,
            status: 'pending',
        });
        balance = target_bal;
    }
    return days;
}

// ─── Audit Logger ───────────────────────────────────────────────────────────

export function addAuditEntry(
    action: AuditAction,
    record_affected: string,
    previous_value: string,
    new_value: string,
    source: string = 'user_action'
): void {
    const entries = readStore<IAuditLogEntry>(KEYS.AUDIT);
    entries.push({
        id: uid(),
        action,
        user: 'current_user',
        timestamp: now(),
        previous_value,
        new_value,
        record_affected,
        source,
    });
    writeStore(KEYS.AUDIT, entries);
}

// ─── Ledger Management ──────────────────────────────────────────────────────

export function rebuildLedger(): ILedgerEntry[] {
    const deposits = readStore<IJournalDeposit>(KEYS.DEPOSITS).filter(d => !d.is_deleted && d.status === TransactionStatus.COMPLETED);
    const withdrawals = readStore<IJournalWithdrawal>(KEYS.WITHDRAWALS).filter(w => !w.is_deleted && w.status === TransactionStatus.COMPLETED);
    const trades = readStore<IJournalTrade>(KEYS.TRADES).filter(t => !t.is_deleted);
    const challenges = readStore<ICompoundingChallenge>(KEYS.CHALLENGES).filter(c => !c.is_deleted);

    const events: { date: string; type: LedgerEntryType; ref: string; desc: string; credit: number; debit: number; source_id: string }[] = [];

    // Starting capital from active challenge
    const activeChallenge = challenges.find(c => c.status === ChallengeStatus.ACTIVE) || challenges[0];
    if (activeChallenge) {
        events.push({
            date: activeChallenge.start_date || activeChallenge.created_at,
            type: LedgerEntryType.STARTING_CAPITAL,
            ref: `SC-${activeChallenge.id.slice(0, 6)}`,
            desc: `Starting capital for ${activeChallenge.name}`,
            credit: activeChallenge.starting_capital,
            debit: 0,
            source_id: activeChallenge.id,
        });
    }

    deposits.forEach(d => {
        events.push({
            date: d.date,
            type: LedgerEntryType.DEPOSIT,
            ref: d.reference,
            desc: `Deposit via ${d.method || 'unspecified'}`,
            credit: d.amount,
            debit: 0,
            source_id: d.id,
        });
    });

    withdrawals.forEach(w => {
        events.push({
            date: w.date,
            type: LedgerEntryType.WITHDRAWAL,
            ref: w.reference,
            desc: `Withdrawal via ${w.method || 'unspecified'}`,
            credit: 0,
            debit: w.amount,
            source_id: w.id,
        });
    });

    trades.forEach(t => {
        if (t.profit_loss >= 0) {
            events.push({
                date: t.date,
                type: LedgerEntryType.JOURNAL_PROFIT,
                ref: `TR-${t.id.slice(0, 6)}`,
                desc: `${t.market} ${t.direction} — ${t.strategy_name || 'No strategy'}`,
                credit: t.profit_loss,
                debit: 0,
                source_id: t.id,
            });
        } else {
            events.push({
                date: t.date,
                type: LedgerEntryType.JOURNAL_LOSS,
                ref: `TR-${t.id.slice(0, 6)}`,
                desc: `${t.market} ${t.direction} — ${t.strategy_name || 'No strategy'}`,
                credit: 0,
                debit: Math.abs(t.profit_loss),
                source_id: t.id,
            });
        }
    });

    // Sort chronologically
    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Build running balance
    let balance = 0;
    const ledger: ILedgerEntry[] = events.map(e => {
        balance += e.credit - e.debit;
        return {
            id: uid(),
            date: e.date,
            type: e.type,
            reference: e.ref,
            description: e.desc,
            credit: Math.round(e.credit * 100) / 100,
            debit: Math.round(e.debit * 100) / 100,
            balance: Math.round(balance * 100) / 100,
            source_id: e.source_id,
            created_at: now(),
        };
    });

    writeStore(KEYS.LEDGER, ledger);
    return ledger;
}

// ─── CRUD: Deposits ─────────────────────────────────────────────────────────

export function getDeposits(filter?: ITransactionFilter): IJournalDeposit[] {
    let items = readStore<IJournalDeposit>(KEYS.DEPOSITS).filter(d => !d.is_deleted);
    if (filter?.date_from) items = items.filter(d => d.date >= filter.date_from!);
    if (filter?.date_to) items = items.filter(d => d.date <= filter.date_to!);
    if (filter?.status && filter.status !== ('all' as any)) items = items.filter(d => d.status === filter.status);
    if (filter?.currency) items = items.filter(d => d.currency === filter.currency);
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function addDeposit(data: Omit<IJournalDeposit, 'id' | 'created_at' | 'updated_at' | 'is_deleted'>): IValidationResult & { id?: string } {
    const all = readStore<IJournalDeposit>(KEYS.DEPOSITS);
    const validation = validateDeposit(data, all);
    if (!validation.is_valid) return { ...validation };
    const entry: IJournalDeposit = { ...data, id: uid(), created_at: now(), updated_at: now(), is_deleted: false };
    all.push(entry);
    writeStore(KEYS.DEPOSITS, all);
    addAuditEntry(AuditAction.DEPOSIT_CREATED, entry.id, '', JSON.stringify({ amount: entry.amount, ref: entry.reference }), 'user_action');
    rebuildLedger();
    return { ...validation, id: entry.id };
}

export function updateDeposit(id: string, updates: Partial<IJournalDeposit>): IValidationResult {
    const all = readStore<IJournalDeposit>(KEYS.DEPOSITS);
    const idx = all.findIndex(d => d.id === id && !d.is_deleted);
    if (idx === -1) return { is_valid: false, errors: ['Deposit not found.'], warnings: [] };
    const prev = { ...all[idx] };
    const merged = { ...all[idx], ...updates, id, updated_at: now() };
    const validation = validateDeposit(merged, all);
    if (!validation.is_valid) return validation;
    all[idx] = merged;
    writeStore(KEYS.DEPOSITS, all);
    addAuditEntry(AuditAction.DEPOSIT_EDITED, id, JSON.stringify({ amount: prev.amount, ref: prev.reference }), JSON.stringify({ amount: merged.amount, ref: merged.reference }));
    rebuildLedger();
    return validation;
}

export function deleteDeposit(id: string): void {
    const all = readStore<IJournalDeposit>(KEYS.DEPOSITS);
    const idx = all.findIndex(d => d.id === id);
    if (idx === -1) return;
    const prev = all[idx];
    all[idx] = { ...all[idx], is_deleted: true, deleted_at: now(), updated_at: now() };
    writeStore(KEYS.DEPOSITS, all);
    addAuditEntry(AuditAction.DEPOSIT_DELETED, id, JSON.stringify({ amount: prev.amount }), 'soft_deleted');
    rebuildLedger();
}

// ─── CRUD: Withdrawals ──────────────────────────────────────────────────────

export function getWithdrawals(filter?: ITransactionFilter): IJournalWithdrawal[] {
    let items = readStore<IJournalWithdrawal>(KEYS.WITHDRAWALS).filter(w => !w.is_deleted);
    if (filter?.date_from) items = items.filter(w => w.date >= filter.date_from!);
    if (filter?.date_to) items = items.filter(w => w.date <= filter.date_to!);
    if (filter?.status && filter.status !== ('all' as any)) items = items.filter(w => w.status === filter.status);
    if (filter?.currency) items = items.filter(w => w.currency === filter.currency);
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function addWithdrawal(data: Omit<IJournalWithdrawal, 'id' | 'created_at' | 'updated_at' | 'is_deleted'>): IValidationResult & { id?: string } {
    const all = readStore<IJournalWithdrawal>(KEYS.WITHDRAWALS);
    const validation = validateWithdrawal(data, all);
    if (!validation.is_valid) return { ...validation };
    const entry: IJournalWithdrawal = { ...data, id: uid(), created_at: now(), updated_at: now(), is_deleted: false };
    all.push(entry);
    writeStore(KEYS.WITHDRAWALS, all);
    addAuditEntry(AuditAction.WITHDRAWAL_CREATED, entry.id, '', JSON.stringify({ amount: entry.amount, ref: entry.reference }));
    rebuildLedger();
    return { ...validation, id: entry.id };
}

export function updateWithdrawal(id: string, updates: Partial<IJournalWithdrawal>): IValidationResult {
    const all = readStore<IJournalWithdrawal>(KEYS.WITHDRAWALS);
    const idx = all.findIndex(w => w.id === id && !w.is_deleted);
    if (idx === -1) return { is_valid: false, errors: ['Withdrawal not found.'], warnings: [] };
    const prev = { ...all[idx] };
    const merged = { ...all[idx], ...updates, id, updated_at: now() };
    const validation = validateWithdrawal(merged, all);
    if (!validation.is_valid) return validation;
    all[idx] = merged;
    writeStore(KEYS.WITHDRAWALS, all);
    addAuditEntry(AuditAction.WITHDRAWAL_EDITED, id, JSON.stringify({ amount: prev.amount }), JSON.stringify({ amount: merged.amount }));
    rebuildLedger();
    return validation;
}

export function deleteWithdrawal(id: string): void {
    const all = readStore<IJournalWithdrawal>(KEYS.WITHDRAWALS);
    const idx = all.findIndex(w => w.id === id);
    if (idx === -1) return;
    all[idx] = { ...all[idx], is_deleted: true, deleted_at: now(), updated_at: now() };
    writeStore(KEYS.WITHDRAWALS, all);
    addAuditEntry(AuditAction.WITHDRAWAL_DELETED, id, JSON.stringify({ amount: all[idx].amount }), 'soft_deleted');
    rebuildLedger();
}

// ─── CRUD: Trades ───────────────────────────────────────────────────────────

export function getTrades(filter?: ITradeFilter): IJournalTrade[] {
    let items = readStore<IJournalTrade>(KEYS.TRADES).filter(t => !t.is_deleted);
    if (filter?.date_from) items = items.filter(t => t.date >= filter.date_from!);
    if (filter?.date_to) items = items.filter(t => t.date <= filter.date_to!);
    if (filter?.strategy) items = items.filter(t => t.strategy_name === filter.strategy);
    if (filter?.result && filter.result !== 'all') items = items.filter(t => t.result === filter.result);
    if (filter?.market) items = items.filter(t => t.market === filter.market);
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function addTrade(data: Omit<IJournalTrade, 'id' | 'created_at' | 'updated_at' | 'is_deleted'>): IValidationResult & { id?: string } {
    const all = readStore<IJournalTrade>(KEYS.TRADES);
    const validation = validateTrade(data, all);
    if (!validation.is_valid) return { ...validation };
    const entry: IJournalTrade = { ...data, id: uid(), created_at: now(), updated_at: now(), is_deleted: false };
    all.push(entry);
    writeStore(KEYS.TRADES, all);
    addAuditEntry(AuditAction.TRADE_CREATED, entry.id, '', JSON.stringify({ market: entry.market, pl: entry.profit_loss }));
    rebuildLedger();
    return { ...validation, id: entry.id };
}

export function updateTrade(id: string, updates: Partial<IJournalTrade>): IValidationResult {
    const all = readStore<IJournalTrade>(KEYS.TRADES);
    const idx = all.findIndex(t => t.id === id && !t.is_deleted);
    if (idx === -1) return { is_valid: false, errors: ['Trade not found.'], warnings: [] };
    const prev = { ...all[idx] };
    const merged = { ...all[idx], ...updates, id, updated_at: now() };
    const validation = validateTrade(merged, all);
    if (!validation.is_valid) return validation;
    all[idx] = merged;
    writeStore(KEYS.TRADES, all);
    addAuditEntry(AuditAction.TRADE_EDITED, id, JSON.stringify({ pl: prev.profit_loss }), JSON.stringify({ pl: merged.profit_loss }));
    rebuildLedger();
    return validation;
}

export function deleteTrade(id: string): void {
    const all = readStore<IJournalTrade>(KEYS.TRADES);
    const idx = all.findIndex(t => t.id === id);
    if (idx === -1) return;
    all[idx] = { ...all[idx], is_deleted: true, deleted_at: now(), updated_at: now() };
    writeStore(KEYS.TRADES, all);
    addAuditEntry(AuditAction.TRADE_DELETED, id, JSON.stringify({ market: all[idx].market }), 'soft_deleted');
    rebuildLedger();
}

// ─── CRUD: Sessions ─────────────────────────────────────────────────────────

export function getSessions(): IJournalSession[] {
    return readStore<IJournalSession>(KEYS.SESSIONS).filter(s => !s.is_deleted).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function addSession(data: Omit<IJournalSession, 'id' | 'created_at' | 'updated_at' | 'is_deleted'>): string {
    const all = readStore<IJournalSession>(KEYS.SESSIONS);
    const entry: IJournalSession = { ...data, id: uid(), created_at: now(), updated_at: now(), is_deleted: false };
    all.push(entry);
    writeStore(KEYS.SESSIONS, all);
    addAuditEntry(AuditAction.SESSION_CREATED, entry.id, '', JSON.stringify({ date: entry.date, pl: entry.session_pl }));
    return entry.id;
}

export function updateSession(id: string, updates: Partial<IJournalSession>): void {
    const all = readStore<IJournalSession>(KEYS.SESSIONS);
    const idx = all.findIndex(s => s.id === id && !s.is_deleted);
    if (idx === -1) return;
    const prev = { ...all[idx] };
    all[idx] = { ...all[idx], ...updates, id, updated_at: now() };
    writeStore(KEYS.SESSIONS, all);
    addAuditEntry(AuditAction.SESSION_EDITED, id, JSON.stringify({ pl: prev.session_pl }), JSON.stringify({ pl: all[idx].session_pl }));
}

export function deleteSession(id: string): void {
    const all = readStore<IJournalSession>(KEYS.SESSIONS);
    const idx = all.findIndex(s => s.id === id);
    if (idx === -1) return;
    all[idx] = { ...all[idx], is_deleted: true, deleted_at: now(), updated_at: now() };
    writeStore(KEYS.SESSIONS, all);
    addAuditEntry(AuditAction.SESSION_DELETED, id, '', 'soft_deleted');
}

// ─── CRUD: Challenges ───────────────────────────────────────────────────────

export function getChallenges(): ICompoundingChallenge[] {
    return readStore<ICompoundingChallenge>(KEYS.CHALLENGES).filter(c => !c.is_deleted).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function getActiveChallenge(): ICompoundingChallenge | null {
    const challenges = getChallenges();
    return challenges.find(c => c.status === ChallengeStatus.ACTIVE) || challenges[0] || null;
}

export function addChallenge(data: {
    name: string; starting_capital: number; target_capital: number; num_days: number;
    sessions_per_day: number; target_percent: number; max_risk_percent: number; currency: string;
}): IValidationResult & { id?: string } {
    const validation = validateChallenge(data);
    if (!validation.is_valid) return { ...validation };
    const days = generateCompoundingPlan(data.starting_capital, data.target_capital, data.num_days, data.target_percent);
    const entry: ICompoundingChallenge = {
        ...data,
        id: uid(),
        start_date: new Date().toISOString().split('T')[0],
        status: ChallengeStatus.ACTIVE,
        days,
        created_at: now(),
        updated_at: now(),
        is_deleted: false,
    };
    const all = readStore<ICompoundingChallenge>(KEYS.CHALLENGES);
    // Pause other active challenges
    all.forEach(c => { if (c.status === ChallengeStatus.ACTIVE) c.status = ChallengeStatus.PAUSED; });
    all.push(entry);
    writeStore(KEYS.CHALLENGES, all);
    addAuditEntry(AuditAction.CHALLENGE_CREATED, entry.id, '', JSON.stringify({ name: entry.name, target: entry.target_capital }));
    rebuildLedger();
    return { ...validation, id: entry.id };
}

export function updateChallengeDay(challengeId: string, dayNumber: number, actualBalance: number): void {
    const all = readStore<ICompoundingChallenge>(KEYS.CHALLENGES);
    const idx = all.findIndex(c => c.id === challengeId);
    if (idx === -1) return;
    const dayIdx = all[idx].days.findIndex(d => d.day === dayNumber);
    if (dayIdx === -1) return;
    const day = all[idx].days[dayIdx];
    const prev = day.actual_balance;
    day.actual_balance = actualBalance;
    day.difference = Math.round((actualBalance - day.target_balance) * 100) / 100;
    day.progress_percent = Math.round((actualBalance / all[idx].target_capital) * 10000) / 100;
    day.status = actualBalance >= day.target_balance ? 'achieved' : actualBalance > day.starting_balance ? 'missed' : 'missed';
    if (actualBalance >= day.target_balance) day.status = 'exceeded';
    else if (actualBalance >= day.starting_balance) day.status = 'achieved';
    else day.status = 'missed';
    all[idx].updated_at = now();
    writeStore(KEYS.CHALLENGES, all);
    addAuditEntry(AuditAction.CHALLENGE_EDITED, challengeId, `day${dayNumber}:${prev}`, `day${dayNumber}:${actualBalance}`);
}

export function updateChallengeStatus(challengeId: string, status: ChallengeStatus): void {
    const all = readStore<ICompoundingChallenge>(KEYS.CHALLENGES);
    const idx = all.findIndex(c => c.id === challengeId);
    if (idx === -1) return;
    const prev = all[idx].status;
    all[idx].status = status;
    all[idx].updated_at = now();
    writeStore(KEYS.CHALLENGES, all);
    addAuditEntry(AuditAction.CHALLENGE_EDITED, challengeId, prev, status);
}

// ─── Ledger & Audit Read ────────────────────────────────────────────────────

export function getLedger(): ILedgerEntry[] {
    return readStore<ILedgerEntry>(KEYS.LEDGER);
}

export function getAuditLog(): IAuditLogEntry[] {
    return readStore<IAuditLogEntry>(KEYS.AUDIT).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// ─── Strategy Analytics ─────────────────────────────────────────────────────

export function getStrategyPerformance(): IStrategyPerformance[] {
    const trades = getTrades();
    const strategyMap = new Map<string, IJournalTrade[]>();
    trades.forEach(t => {
        const name = t.strategy_name || 'Unnamed';
        if (!strategyMap.has(name)) strategyMap.set(name, []);
        strategyMap.get(name)!.push(t);
    });

    const results: IStrategyPerformance[] = [];
    strategyMap.forEach((strades, name) => {
        const wins = strades.filter(t => t.result === 'win').length;
        const losses = strades.filter(t => t.result === 'loss').length;
        const ties = strades.filter(t => t.result === 'tie').length;
        const total_pl = strades.reduce((s, t) => s + t.profit_loss, 0);
        const pls = strades.map(t => t.profit_loss);

        // Streaks
        let maxWin = 0, maxLoss = 0, curWin = 0, curLoss = 0;
        strades.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(t => {
            if (t.result === 'win') { curWin++; curLoss = 0; maxWin = Math.max(maxWin, curWin); }
            else if (t.result === 'loss') { curLoss++; curWin = 0; maxLoss = Math.max(maxLoss, curLoss); }
            else { curWin = 0; curLoss = 0; }
        });

        results.push({
            strategy_name: name,
            total_trades: strades.length,
            wins,
            losses,
            ties,
            win_rate: strades.length > 0 ? Math.round((wins / strades.length) * 10000) / 100 : 0,
            total_pl: Math.round(total_pl * 100) / 100,
            average_pl: strades.length > 0 ? Math.round((total_pl / strades.length) * 100) / 100 : 0,
            best_result: pls.length > 0 ? Math.max(...pls) : 0,
            worst_result: pls.length > 0 ? Math.min(...pls) : 0,
            longest_win_streak: maxWin,
            longest_loss_streak: maxLoss,
            average_session_result: 0, // computed at display time from sessions
        });
    });

    return results.sort((a, b) => b.total_pl - a.total_pl);
}

// ─── Journal Overview ───────────────────────────────────────────────────────

export function getJournalOverview(accountId: string, accountCurrency: string, accountBalance: number): IJournalOverview {
    const deposits = getDeposits();
    const withdrawals = getWithdrawals();
    const trades = getTrades();
    const challenge = getActiveChallenge();

    const totalDeposits = deposits.filter(d => d.status === TransactionStatus.COMPLETED).reduce((s, d) => s + d.amount, 0);
    const totalWithdrawals = withdrawals.filter(w => w.status === TransactionStatus.COMPLETED).reduce((s, w) => s + w.amount, 0);
    const netDeposits = totalDeposits - totalWithdrawals;
    const totalPL = trades.reduce((s, t) => s + t.profit_loss, 0);

    const startingCapital = challenge?.starting_capital || 0;
    const journalBalance = startingCapital + netDeposits + totalPL;
    const totalReturn = startingCapital > 0 ? Math.round(((journalBalance - startingCapital) / startingCapital) * 10000) / 100 : 0;

    // Challenge progress
    const targetProgress = challenge ? Math.round(((journalBalance - challenge.starting_capital) / (challenge.target_capital - challenge.starting_capital)) * 10000) / 100 : 0;

    return {
        account_name: `Account ${accountId}`,
        account_id: accountId,
        currency: accountCurrency,
        current_balance: journalBalance,
        starting_capital: startingCapital,
        current_equity: accountBalance,
        total_deposits: Math.round(totalDeposits * 100) / 100,
        total_withdrawals: Math.round(totalWithdrawals * 100) / 100,
        net_deposits: Math.round(netDeposits * 100) / 100,
        total_journal_pl: Math.round(totalPL * 100) / 100,
        total_return_percent: totalReturn,
        current_compounding_cycle: challenge?.name || 'No active challenge',
        challenge_start_date: challenge?.start_date || 'N/A',
        challenge_target: challenge?.target_capital || 0,
        target_progress_percent: Math.max(0, Math.min(100, targetProgress)),
        challenge_status: challenge?.status || 'none',
    };
}

// ─── External Account Adapter ───────────────────────────────────────────────

export class ExternalAccountAdapter {
    static getAccountProfile(
        loginid: string,
        currency: string,
        balance: string | number,
        isVirtual: boolean,
        isConnected: boolean
    ): IAccountProfile {
        return {
            account_id: loginid || 'Not available',
            currency: currency || 'Not available',
            account_type: isVirtual ? 'demo' : 'real',
            country: 'Not available',
            created_date: 'Not available',
            account_status: loginid ? 'Active' : 'Not available',
            is_virtual: isVirtual,
            balance: typeof balance === 'number' ? balance : parseFloat(balance) || 0,
            last_sync: now(),
            data_source: 'Deriv API',
            connection_status: isConnected ? 'connected' : 'disconnected',
        };
    }

    static getBalance(balance: string | number): number {
        return typeof balance === 'number' ? balance : parseFloat(balance) || 0;
    }
}

// ─── Import/Export ──────────────────────────────────────────────────────────

export function exportAllData(): string {
    const data = {
        version: '1.0.0',
        exported_at: now(),
        deposits: readStore<IJournalDeposit>(KEYS.DEPOSITS),
        withdrawals: readStore<IJournalWithdrawal>(KEYS.WITHDRAWALS),
        trades: readStore<IJournalTrade>(KEYS.TRADES),
        sessions: readStore<IJournalSession>(KEYS.SESSIONS),
        challenges: readStore<ICompoundingChallenge>(KEYS.CHALLENGES),
        audit_log: readStore<IAuditLogEntry>(KEYS.AUDIT),
    };
    addAuditEntry(AuditAction.DATA_EXPORTED, 'all', '', `Exported ${data.trades.length} trades, ${data.deposits.length} deposits`);
    return JSON.stringify(data, null, 2);
}

export function importData(jsonString: string): IValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    try {
        const data = JSON.parse(jsonString);
        if (!data.version) warnings.push('No version field detected — import may be partial.');
        if (data.deposits && Array.isArray(data.deposits)) {
            const existing = readStore<IJournalDeposit>(KEYS.DEPOSITS);
            data.deposits.forEach((d: any) => {
                d.import_source = 'json_import';
                d.import_timestamp = now();
                d.validation_status = 'valid';
                if (!d.id) d.id = uid();
                if (!existing.some(e => e.reference === d.reference)) {
                    existing.push(d);
                } else {
                    warnings.push(`Deposit ref "${d.reference}" already exists — skipped.`);
                }
            });
            writeStore(KEYS.DEPOSITS, existing);
        }
        if (data.withdrawals && Array.isArray(data.withdrawals)) {
            const existing = readStore<IJournalWithdrawal>(KEYS.WITHDRAWALS);
            data.withdrawals.forEach((w: any) => {
                w.import_source = 'json_import';
                w.import_timestamp = now();
                w.validation_status = 'valid';
                if (!w.id) w.id = uid();
                if (!existing.some(e => e.reference === w.reference)) {
                    existing.push(w);
                } else {
                    warnings.push(`Withdrawal ref "${w.reference}" already exists — skipped.`);
                }
            });
            writeStore(KEYS.WITHDRAWALS, existing);
        }
        if (data.trades && Array.isArray(data.trades)) {
            const existing = readStore<IJournalTrade>(KEYS.TRADES);
            data.trades.forEach((t: any) => {
                t.import_source = 'json_import';
                t.import_timestamp = now();
                t.validation_status = 'valid';
                if (!t.id) t.id = uid();
                existing.push(t);
            });
            writeStore(KEYS.TRADES, existing);
        }
        if (data.sessions && Array.isArray(data.sessions)) {
            const existing = readStore<IJournalSession>(KEYS.SESSIONS);
            data.sessions.forEach((s: any) => {
                if (!s.id) s.id = uid();
                existing.push(s);
            });
            writeStore(KEYS.SESSIONS, existing);
        }
        addAuditEntry(AuditAction.DATA_IMPORTED, 'all', '', `Imported from JSON`, 'import');
        rebuildLedger();
    } catch (e) {
        errors.push(`Invalid JSON: ${(e as Error).message}`);
    }
    return { is_valid: errors.length === 0, errors, warnings };
}
