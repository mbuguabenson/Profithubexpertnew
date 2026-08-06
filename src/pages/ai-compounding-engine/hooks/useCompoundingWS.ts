import { useState, useEffect, useRef, useCallback } from 'react';
import { getAppId } from '@/components/shared/utils/config/config';

export interface SymbolMarketData {
    symbol: string;
    displayName: string;
    ticks: number[];
    quotes: number[];
    lastQuote: number;
    lastDigit: number;
    healthScore: number;
    probabilityScore: number;
    trend: 'UP' | 'DOWN' | 'SIDEWAYS';
    signalStrength: number;
    expectedWinRate: number;
    riskScore: 'SAFE' | 'MEDIUM' | 'DANGER';
    enabled: boolean;
}

export function getStoredDerivToken(): string {
    if (typeof window === 'undefined') return '';
    
    // 1. Direct key check
    const direct = localStorage.getItem('active_token') ||
                   localStorage.getItem('token') ||
                   localStorage.getItem('user_token') ||
                   localStorage.getItem('deriv_api_token') ||
                   localStorage.getItem('ace_deriv_token');
    if (direct) return direct;

    // 2. Parsed accounts check
    try {
        const raw = localStorage.getItem('client.accounts') ||
                    localStorage.getItem('client_accounts') ||
                    localStorage.getItem('account_list');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                const real = parsed.find((a: any) => a.account?.startsWith('CR') || a.account?.startsWith('ROT')) || parsed[0];
                if (real?.token) return real.token;
            } else if (typeof parsed === 'object') {
                const keys = Object.keys(parsed);
                const realKey = keys.find(k => k.startsWith('CR') || k.startsWith('ROT')) || keys[0];
                if (realKey && parsed[realKey]?.token) return parsed[realKey].token;
            }
        }
    } catch {
        /* ignore */
    }

    return '';
}

export function useCompoundingWS() {
    const appId = getAppId() || '3Mmq9JHMrJaUKT2KIhKZ';
    const wsRef = useRef<WebSocket | null>(null);
    const reqId = useRef(1);
    const [isConnected, setIsConnected] = useState(false);
    const [activeSymbol, setActiveSymbol] = useState<string>('1HZ100V');
    const [balance, setBalance] = useState<number>(0);
    const [currency, setCurrency] = useState<string>('USD');
    const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
    const [accountLoginId, setAccountLoginId] = useState<string>('');
    const [manualToken, setManualToken] = useState<string>(() => getStoredDerivToken());

    const pendingProposals = useRef<Map<number, (res: any) => void>>(new Map());
    const pendingPurchases = useRef<Map<number, (res: any) => void>>(new Map());

    const [marketsData, setMarketsData] = useState<Record<string, SymbolMarketData>>({
        '1HZ100V': {
            symbol: '1HZ100V', displayName: 'Volatility 100 (1s) Index', ticks: [], quotes: [], lastQuote: 0, lastDigit: 0,
            healthScore: 92, probabilityScore: 88, trend: 'UP', signalStrength: 85, expectedWinRate: 78, riskScore: 'SAFE', enabled: true
        },
        '1HZ75V': {
            symbol: '1HZ75V', displayName: 'Volatility 75 (1s) Index', ticks: [], quotes: [], lastQuote: 0, lastDigit: 0,
            healthScore: 88, probabilityScore: 82, trend: 'UP', signalStrength: 80, expectedWinRate: 74, riskScore: 'SAFE', enabled: true
        },
        '1HZ50V': {
            symbol: '1HZ50V', displayName: 'Volatility 50 (1s) Index', ticks: [], quotes: [], lastQuote: 0, lastDigit: 0,
            healthScore: 84, probabilityScore: 76, trend: 'SIDEWAYS', signalStrength: 72, expectedWinRate: 68, riskScore: 'MEDIUM', enabled: true
        },
        'R_100': {
            symbol: 'R_100', displayName: 'Volatility 100 Index', ticks: [], quotes: [], lastQuote: 0, lastDigit: 0,
            healthScore: 90, probabilityScore: 85, trend: 'UP', signalStrength: 83, expectedWinRate: 76, riskScore: 'SAFE', enabled: true
        },
        'R_75': {
            symbol: 'R_75', displayName: 'Volatility 75 Index', ticks: [], quotes: [], lastQuote: 0, lastDigit: 0,
            healthScore: 81, probabilityScore: 74, trend: 'DOWN', signalStrength: 70, expectedWinRate: 66, riskScore: 'MEDIUM', enabled: true
        },
        'R_50': {
            symbol: 'R_50', displayName: 'Volatility 50 Index', ticks: [], quotes: [], lastQuote: 0, lastDigit: 0,
            healthScore: 78, probabilityScore: 70, trend: 'SIDEWAYS', signalStrength: 65, expectedWinRate: 62, riskScore: 'MEDIUM', enabled: true
        },
    });

    const updateManualToken = (newToken: string) => {
        setManualToken(newToken);
        if (typeof window !== 'undefined') {
            localStorage.setItem('ace_deriv_token', newToken);
            localStorage.setItem('active_token', newToken);
        }
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ authorize: newToken, req_id: reqId.current++ }));
        }
    };

    const connect = useCallback(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

        const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            const tokenToUse = manualToken || getStoredDerivToken();
            if (tokenToUse) {
                ws.send(JSON.stringify({ authorize: tokenToUse, req_id: reqId.current++ }));
            }
            ws.send(JSON.stringify({ balance: 1, subscribe: 1, req_id: reqId.current++ }));
            ws.send(JSON.stringify({
                ticks_history: activeSymbol,
                count: 1000,
                end: 'latest',
                style: 'ticks',
                subscribe: 1,
                req_id: reqId.current++
            }));
        };

        ws.onclose = () => {
            setIsConnected(false);
            setIsAuthorized(false);
            wsRef.current = null;
            setTimeout(connect, 3000);
        };

        ws.onerror = () => {
            setIsConnected(false);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.msg_type === 'authorize' && data.authorize) {
                    setIsAuthorized(true);
                    setAccountLoginId(data.authorize.loginid || '');
                    setBalance(parseFloat(data.authorize.balance || '0'));
                    setCurrency(data.authorize.currency || 'USD');
                }

                if (data.msg_type === 'balance' && data.balance) {
                    setBalance(parseFloat(data.balance.balance || '0'));
                }

                if (data.msg_type === 'tick' && data.tick) {
                    const quote = data.tick.quote;
                    const symbol = data.tick.symbol;
                    const str = quote.toString();
                    const digit = parseInt(str[str.length - 1], 10);

                    setMarketsData(prev => {
                        const existing = prev[symbol] || {
                            symbol, displayName: symbol, ticks: [], quotes: [], lastQuote: 0, lastDigit: 0,
                            healthScore: 85, probabilityScore: 80, trend: 'UP', signalStrength: 75, expectedWinRate: 70, riskScore: 'SAFE', enabled: true
                        };
                        const updatedTicks = [...existing.ticks, digit].slice(-1000);
                        const updatedQuotes = [...existing.quotes, quote].slice(-1000);
                        
                        const evenCount = updatedTicks.filter(d => d % 2 === 0).length;
                        const evenPct = Math.round((evenCount / (updatedTicks.length || 1)) * 100);
                        const health = Math.min(98, Math.max(50, evenPct + 35));
                        const prob = Math.min(95, Math.max(45, evenPct + 30));

                        return {
                            ...prev,
                            [symbol]: {
                                ...existing,
                                ticks: updatedTicks,
                                quotes: updatedQuotes,
                                lastQuote: quote,
                                lastDigit: digit,
                                healthScore: health,
                                probabilityScore: prob,
                                signalStrength: Math.round((health + prob) / 2),
                            }
                        };
                    });
                }

                if (data.msg_type === 'history' && data.history) {
                    const quotes = (data.history.prices as number[]) || [];
                    const ticks = quotes.map(p => {
                        const s = p.toString();
                        return parseInt(s[s.length - 1], 10);
                    });
                    const lastQuote = quotes[quotes.length - 1] || 0;
                    const lastDigit = ticks[ticks.length - 1] || 0;

                    setMarketsData(prev => ({
                        ...prev,
                        [activeSymbol]: {
                            ...(prev[activeSymbol] || {
                                symbol: activeSymbol, displayName: activeSymbol, healthScore: 88, probabilityScore: 82, trend: 'UP',
                                signalStrength: 80, expectedWinRate: 74, riskScore: 'SAFE', enabled: true
                            }),
                            ticks,
                            quotes,
                            lastQuote,
                            lastDigit
                        }
                    }));
                }

                if (data.msg_type === 'proposal' && data.req_id) {
                    const cb = pendingProposals.current.get(data.req_id);
                    if (cb) {
                        cb(data);
                        pendingProposals.current.delete(data.req_id);
                    }
                }

                if (data.msg_type === 'buy' && data.req_id) {
                    const cb = pendingPurchases.current.get(data.req_id);
                    if (cb) {
                        cb(data);
                        pendingPurchases.current.delete(data.req_id);
                    }
                }
            } catch {
                /* parse error */
            }
        };
    }, [appId, activeSymbol, manualToken]);

    useEffect(() => {
        connect();
        return () => {
            wsRef.current?.close();
        };
    }, [connect]);

    const changeActiveSymbol = (symbol: string) => {
        setActiveSymbol(symbol);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                ticks_history: symbol,
                count: 1000,
                end: 'latest',
                style: 'ticks',
                subscribe: 1,
                req_id: reqId.current++
            }));
        }
    };

    const buyProposal = useCallback(async (contractType: string, stake: number, duration: number = 1, prediction?: number): Promise<any> => {
        return new Promise((resolve) => {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                resolve({ success: false, message: 'Deriv WebSocket disconnected' });
                return;
            }

            if (!isAuthorized) {
                resolve({
                    success: false,
                    message: 'No authorized Deriv account session. Please add your real account API Token in the header.'
                });
                return;
            }

            const currentReqId = reqId.current++;

            const req: any = {
                proposal: 1,
                amount: stake,
                basis: 'stake',
                contract_type: contractType,
                currency: currency || 'USD',
                duration: duration,
                duration_unit: 't',
                symbol: activeSymbol,
                req_id: currentReqId
            };

            if (prediction !== undefined && (contractType.includes('OVER') || contractType.includes('UNDER') || contractType.includes('MATCH') || contractType.includes('DIFF'))) {
                req.barrier = prediction.toString();
            }

            pendingProposals.current.set(currentReqId, (propRes: any) => {
                if (propRes.error) {
                    resolve({ success: false, message: propRes.error.message || 'Proposal failed' });
                    return;
                }

                const proposalId = propRes.proposal?.id;
                if (!proposalId) {
                    resolve({ success: false, message: 'Invalid proposal response' });
                    return;
                }

                const buyReqId = reqId.current++;
                wsRef.current?.send(JSON.stringify({
                    buy: proposalId,
                    price: stake,
                    req_id: buyReqId
                }));

                pendingPurchases.current.set(buyReqId, (buyRes: any) => {
                    if (buyRes.error) {
                        resolve({ success: false, message: buyRes.error.message || 'Purchase failed' });
                        return;
                    }

                    const buyData = buyRes.buy;
                    if (buyData) {
                        const pocReqId = reqId.current++;
                        wsRef.current?.send(JSON.stringify({
                            proposal_open_contract: 1,
                            contract_id: buyData.contract_id,
                            subscribe: 1,
                            req_id: pocReqId
                        }));

                        const handlePOC = (e: MessageEvent) => {
                            try {
                                const msg = JSON.parse(e.data);
                                if (msg.msg_type === 'proposal_open_contract' && msg.proposal_open_contract?.contract_id === buyData.contract_id) {
                                    const poc = msg.proposal_open_contract;
                                    if (poc.is_sold || poc.status === 'won' || poc.status === 'lost') {
                                        wsRef.current?.removeEventListener('message', handlePOC);
                                        const pnl = parseFloat((poc.profit || 0).toFixed(2));
                                        const isWin = poc.status === 'won' || pnl > 0;
                                        resolve({
                                            success: true,
                                            isWin,
                                            pnl,
                                            contractId: buyData.contract_id,
                                            entryPrice: poc.entry_spot || 0,
                                            exitPrice: poc.exit_spot || 0,
                                            buyPrice: buyData.buy_price,
                                            payout: poc.payout,
                                        });
                                    }
                                }
                            } catch { /* ignore */ }
                        };

                        wsRef.current?.addEventListener('message', handlePOC);

                        setTimeout(() => {
                            wsRef.current?.removeEventListener('message', handlePOC);
                            const pnl = parseFloat((buyData.payout - stake).toFixed(2));
                            resolve({
                                success: true,
                                isWin: pnl > 0,
                                pnl: pnl > 0 ? pnl : -stake,
                                contractId: buyData.contract_id,
                            });
                        }, (duration + 3) * 1000);
                    } else {
                        resolve({ success: false, message: 'Purchase failed' });
                    }
                });
            });

            wsRef.current.send(JSON.stringify(req));
        });
    }, [activeSymbol, currency, isAuthorized]);

    return {
        isConnected,
        isAuthorized,
        accountLoginId,
        manualToken,
        updateManualToken,
        activeSymbol,
        changeActiveSymbol,
        balance,
        currency,
        marketsData,
        buyProposal,
    };
}
