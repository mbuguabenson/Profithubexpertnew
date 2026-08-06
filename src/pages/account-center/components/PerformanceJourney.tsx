import React, { useEffect, useState, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useApiBase } from '@/hooks/useApiBase';
import { Localize } from '@deriv-com/translations';
import { api_base } from '@/external/bot-skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#f43f5e', '#06b6d4'];

const PerformanceJourney = observer(() => {
    const { activeLoginid } = useApiBase();
    const [profitTable, setProfitTable] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchProfitTable = async () => {
            if (!activeLoginid) return;
            setIsLoading(true);
            try {
                const response = await api_base.api.send({ profit_table: 1, description: 1, limit: 500 });
                if (response?.profit_table?.transactions) {
                    setProfitTable(response.profit_table.transactions);
                }
            } catch (err) {
                console.error("Failed to fetch profit table:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchProfitTable();
    }, [activeLoginid]);

    const { marketData, strategyData, totalWins, totalLosses, winRate } = useMemo(() => {
        let wins = 0;
        let losses = 0;
        const markets: Record<string, number> = {};
        const strategies: Record<string, number> = {};

        profitTable.forEach(trade => {
            const profit = Number(trade.sell_price) - Number(trade.buy_price);
            if (profit > 0) wins++;
            else if (profit < 0) losses++;

            // Market stats (using shortcode prefix as proxy)
            const marketMatch = trade.shortcode ? trade.shortcode.split('_')[1] : 'Unknown';
            if (!markets[marketMatch]) markets[marketMatch] = 0;
            markets[marketMatch] += profit > 0 ? 1 : 0;

            // Strategy stats (Contract Type)
            const contractType = trade.contract_type || 'Unknown';
            if (!strategies[contractType]) strategies[contractType] = 0;
            strategies[contractType] += profit > 0 ? 1 : 0;
        });

        const mData = Object.entries(markets).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
        const sData = Object.entries(strategies).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
        const wRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;

        return { marketData: mData, strategyData: sData, totalWins: wins, totalLosses: losses, winRate: wRate };
    }, [profitTable]);

    return (
        <div className='performance-journey'>
            <h3 style={{ margin: '0 0 20px 0', color: 'var(--text-prominent)' }}><Localize i18n_default_text='Performance Journey' /></h3>
            
            <div className='account-overview__kpi-grid' style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '30px' }}>
                <div className='kpi-card' style={{ background: 'var(--general-section-1)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-normal)' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-less-prominent)', fontSize: '0.85rem' }}>WIN RATE</h4>
                    <h2 style={{ margin: '0', fontSize: '1.5rem', color: winRate >= 50 ? '#10b981' : '#f59e0b' }}>{winRate.toFixed(1)}%</h2>
                </div>
                <div className='kpi-card' style={{ background: 'var(--general-section-1)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-normal)' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-less-prominent)', fontSize: '0.85rem' }}>TOTAL WINS</h4>
                    <h2 style={{ margin: '0', fontSize: '1.5rem', color: '#10b981' }}>{totalWins}</h2>
                </div>
                <div className='kpi-card' style={{ background: 'var(--general-section-1)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-normal)' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-less-prominent)', fontSize: '0.85rem' }}>TOTAL LOSSES</h4>
                    <h2 style={{ margin: '0', fontSize: '1.5rem', color: '#f43f5e' }}>{totalLosses}</h2>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
                <div style={{ background: 'var(--general-section-1)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-normal)' }}>
                    <h4 style={{ margin: '0 0 15px 0', color: 'var(--text-prominent)' }}>Best Market Trades (By Win Volume)</h4>
                    {marketData.length > 0 ? (
                        <div style={{ width: '100%', height: 250 }}>
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie data={marketData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                        {marketData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-less-prominent)' }}>No market data available.</p>
                    )}
                </div>

                <div style={{ background: 'var(--general-section-1)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-normal)' }}>
                    <h4 style={{ margin: '0 0 15px 0', color: 'var(--text-prominent)' }}>Best Strategies (Contract Types)</h4>
                    {strategyData.length > 0 ? (
                        <div style={{ width: '100%', height: 250 }}>
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie data={strategyData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                        {strategyData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-less-prominent)' }}>No strategy data available.</p>
                    )}
                </div>
            </div>
            
            <h4 style={{ margin: '0 0 15px 0', color: 'var(--text-prominent)' }}>Recent Trade Performance</h4>
            <div className='portfolio-table-wrapper' style={{ overflowX: 'auto', background: 'var(--general-section-1)', borderRadius: '12px', border: '1px solid var(--border-normal)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-normal)', background: 'rgba(0,0,0,0.1)' }}>
                            <th style={{ padding: '12px 20px', fontSize: '0.85rem', color: 'var(--text-less-prominent)' }}>Contract Type</th>
                            <th style={{ padding: '12px 20px', fontSize: '0.85rem', color: 'var(--text-less-prominent)' }}>Stake</th>
                            <th style={{ padding: '12px 20px', fontSize: '0.85rem', color: 'var(--text-less-prominent)' }}>Payout</th>
                            <th style={{ padding: '12px 20px', fontSize: '0.85rem', color: 'var(--text-less-prominent)' }}>Profit / Loss</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center' }}>Loading...</td></tr>
                        ) : profitTable.length === 0 ? (
                            <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center' }}>No recent trades found.</td></tr>
                        ) : (
                            profitTable.slice(0, 10).map((tx, idx) => {
                                const profit = Number(tx.sell_price) - Number(tx.buy_price);
                                return (
                                <tr key={idx} style={{ borderBottom: '1px solid var(--border-normal)' }}>
                                    <td style={{ padding: '12px 20px', fontSize: '0.9rem' }}>{tx.contract_type}</td>
                                    <td style={{ padding: '12px 20px', fontSize: '0.9rem' }}>{tx.buy_price}</td>
                                    <td style={{ padding: '12px 20px', fontSize: '0.9rem' }}>{tx.sell_price}</td>
                                    <td style={{ padding: '12px 20px', fontSize: '0.9rem', color: profit >= 0 ? '#10b981' : '#f43f5e', fontWeight: 600 }}>
                                        {profit > 0 ? '+' : ''}{profit.toFixed(2)}
                                    </td>
                                </tr>
                            )})
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
});

export default PerformanceJourney;
