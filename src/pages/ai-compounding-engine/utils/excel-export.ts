import { CompoundingSummary } from './compounding-calculator';

export function exportChallengeToCSV(summary: CompoundingSummary, filename: string = 'ACE_Compounding_Challenge.csv') {
    const headers = [
        'Day',
        'Start Balance ($)',
        'Target Profit ($)',
        'Target End Balance ($)',
        'Actual End Balance ($)',
        'Variance ($)',
        'Progress (%)'
    ];

    const rows = summary.daysPlan.map((d) => {
        const actual = d.actualEndBalance ?? d.targetBalance;
        const variance = d.variance ?? (actual - d.targetBalance);
        return [
            d.day,
            d.startBalance.toFixed(2),
            d.targetProfit.toFixed(2),
            d.targetBalance.toFixed(2),
            actual.toFixed(2),
            variance.toFixed(2),
            `${d.progressPct.toFixed(1)}%`
        ];
    });

    const csvContent = [
        `AI Compounding Engine (ACE) — Challenge Workbook`,
        `Initial Balance: $${summary.initialBalance} | Target Balance: $${summary.targetBalance} | Duration: ${summary.days} Days`,
        `Daily Growth Rate: ${summary.dailyGrowthPct}% | Projected Stake: $${summary.projectedStake}`,
        ``,
        headers.join(','),
        ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export function exportTransactionsToCSV(transactions: any[], filename: string = 'ACE_Transaction_History.csv') {
    const headers = [
        'ID',
        'Date & Time',
        'Market Symbol',
        'Strategy',
        'Contract Type',
        'Stake ($)',
        'Entry Price',
        'Exit Price',
        'Profit / Loss ($)',
        'Running Balance ($)',
        'Result',
        'Duration (t)',
        'Signal Strength',
        'Recovery Used'
    ];

    const rows = transactions.map((t) => [
        t.id || 'N/A',
        new Date(t.timestamp || Date.now()).toLocaleString(),
        t.symbol || '1HZ100V',
        t.strategy || 'Over / Under',
        t.contractType || 'DIGITOVER',
        (t.stake || 0).toFixed(2),
        t.entryPrice || 0,
        t.exitPrice || 0,
        (t.pnl || 0).toFixed(2),
        (t.runningBalance || 0).toFixed(2),
        t.result || (t.pnl >= 0 ? 'WIN' : 'LOSS'),
        t.duration || 1,
        `${t.signalStrength || 85}%`,
        t.recoveryUsed ? 'YES' : 'NO'
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
