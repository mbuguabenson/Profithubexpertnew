export interface CompoundingDayPlan {
    day: number;
    startBalance: number;
    targetProfit: number;
    targetBalance: number;
    actualEndBalance?: number;
    variance?: number;
    progressPct: number;
}

export interface CompoundingSummary {
    initialBalance: number;
    targetBalance: number;
    days: number;
    dailyGrowthPct: number;
    targetDailyProfit: number;
    dailyTargetBalance: number;
    expectedFinalBalance: number;
    projectedMonthlyGrowthPct: number;
    requiredWinRatePct: number;
    projectedStake: number;
    daysPlan: CompoundingDayPlan[];
}

export function calculateCompoundingPlan(
    initialBalance: number = 400,
    targetBalance: number = 4000,
    days: number = 150
): CompoundingSummary {
    const start = Math.max(initialBalance, 1);
    const target = Math.max(targetBalance, start + 1);
    const totalDays = Math.max(days, 1);

    // Compound daily growth rate formula: r = (target / start)^(1 / days) - 1
    const dailyGrowthRate = Math.pow(target / start, 1 / totalDays) - 1;
    const dailyGrowthPct = parseFloat((dailyGrowthRate * 100).toFixed(2));

    const targetDailyProfit = parseFloat((start * dailyGrowthRate).toFixed(2));
    const dailyTargetBalance = parseFloat((start * (1 + dailyGrowthRate)).toFixed(2));
    const expectedFinalBalance = target;
    const projectedMonthlyGrowthPct = parseFloat(((Math.pow(1 + dailyGrowthRate, 30) - 1) * 100).toFixed(2));
    const requiredWinRatePct = parseFloat(Math.min(65 + dailyGrowthPct * 1.2, 92).toFixed(1));
    const projectedStake = parseFloat(Math.max(start * 0.02, 0.35).toFixed(2));

    const daysPlan: CompoundingDayPlan[] = [];
    let currentBal = start;

    for (let i = 1; i <= totalDays; i++) {
        const profit = parseFloat((currentBal * dailyGrowthRate).toFixed(2));
        const endBal = parseFloat((currentBal + profit).toFixed(2));
        const progressPct = parseFloat(((endBal / target) * 100).toFixed(1));

        daysPlan.push({
            day: i,
            startBalance: parseFloat(currentBal.toFixed(2)),
            targetProfit: profit,
            targetBalance: endBal,
            progressPct: Math.min(progressPct, 100),
        });

        currentBal = endBal;
    }

    return {
        initialBalance: start,
        targetBalance: target,
        days: totalDays,
        dailyGrowthPct,
        targetDailyProfit,
        dailyTargetBalance,
        expectedFinalBalance,
        projectedMonthlyGrowthPct,
        requiredWinRatePct,
        projectedStake,
        daysPlan,
    };
}
