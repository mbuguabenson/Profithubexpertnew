import { SignalEngine, AnalysisResult, Signal } from './SignalEngine';
import { getSocketURL } from '@/components/shared/utils/config/config';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';

export type SignalWithSymbol = Signal & { symbol?: string };

export type EngineState = {
    analysis: AnalysisResult | null;
    standard: SignalWithSymbol[];
    pro: SignalWithSymbol[];
    super: SignalWithSymbol[];
};

export class TickSubscriber {
    private engines: Map<string, SignalEngine> = new Map();
    private activeSymbols: string[] = [];
    private callbacks: ((state: EngineState) => void)[] = [];
    private isStreaming = false;
    private ws: WebSocket | null = null;
    private currentMode: string = '';

    constructor() {}

    public subscribe(callback: (state: EngineState) => void) {
        this.callbacks.push(callback);
    }

    public unsubscribe(callback: (state: EngineState) => void) {
        this.callbacks = this.callbacks.filter(cb => cb !== callback);
    }

    private emit() {
        if (!this.isStreaming) return;

        let allStandard: SignalWithSymbol[] = [];
        let allPro: SignalWithSymbol[] = [];
        let allSuper: SignalWithSymbol[] = [];
        let primaryAnalysis: AnalysisResult | null = null;

        this.engines.forEach((engine, symbol) => {
            const analysis = engine.analyze();
            if (analysis) {
                const standard = engine.generateStandardSignals(analysis).map(s => ({ ...s, symbol }));
                const pro = engine.generateProSignals(analysis).map(s => ({ ...s, symbol }));
                const superSignals = engine.generateSuperSignals(analysis, standard, pro).map(s => ({ ...s, symbol }));

                allStandard.push(...standard);
                allPro.push(...pro);
                allSuper.push(...superSignals);

                // Use the first available analysis for stats UI if none exists
                if (!primaryAnalysis) {
                    primaryAnalysis = analysis;
                }
            }
        });

        // Bubble highest confidence signals to the top
        allStandard.sort((a, b) => b.probability - a.probability);
        allPro.sort((a, b) => b.probability - a.probability);
        allSuper.sort((a, b) => b.probability - a.probability);

        const state = { 
            analysis: primaryAnalysis, 
            standard: allStandard, 
            pro: allPro, 
            super: allSuper 
        };
        
        this.callbacks.forEach(cb => cb(state));
    }

    public async startStreaming(symbol: string = 'R_100') {
        if (this.isStreaming && this.currentMode === symbol) return;
        
        this.stopStreaming();
        this.currentMode = symbol;
        this.engines.clear();
        this.activeSymbols = [];
        this.isStreaming = true;

        if (symbol === 'ALL') {
            if (api_base.active_symbols && api_base.active_symbols.length > 0) {
                this.activeSymbols = api_base.active_symbols
                    .filter((s: any) => {
                        if (!s.symbol && !s.underlying_symbol) return false;
                        const sym = (s.symbol || s.underlying_symbol).toUpperCase();
                        if (sym.includes('BOOM') || sym.includes('CRASH')) return false;
                        if (sym.includes('1HZ15V') || sym.includes('1HZ30V') || sym.includes('1HZ90V')) return false;
                        return sym.includes('1HZ') || sym.startsWith('R_') || sym.includes('JD') || sym.includes('JUMP');
                    })
                    .map((s: any) => s.symbol || s.underlying_symbol);
            } else {
                this.activeSymbols = ['R_100', 'R_10', 'R_25', 'R_50', 'R_75', '1HZ100V', '1HZ10V'];
            }
        } else {
            this.activeSymbols = [symbol];
        }

        this.activeSymbols.forEach(sym => {
            this.engines.set(sym, new SignalEngine());
        });

        try {
            const wsUrl = await getSocketURL();
            if (!this.isStreaming || this.currentMode !== symbol) return;

            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.activeSymbols.forEach(sym => {
                        this.ws!.send(JSON.stringify({
                            ticks_history: sym,
                            adjust_start_time: 1,
                            count: 100,
                            end: 'latest',
                            style: 'ticks',
                            subscribe: 1
                        }));
                    });
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    
                    if (msg.error) {
                        console.warn('WebSocket error in TickSubscriber:', msg.error);
                        return;
                    }

                    if (msg.msg_type === 'history') {
                        if (msg.history && msg.history.prices && msg.echo_req && msg.echo_req.ticks_history) {
                            const sym = msg.echo_req.ticks_history;
                            const engine = this.engines.get(sym);
                            if (engine) {
                                msg.history.prices.forEach((price: number) => {
                                    engine.addTick(price);
                                });
                                this.emit();
                            }
                        }
                    } else if (msg.msg_type === 'tick') {
                        if (msg.tick && msg.tick.symbol) {
                            const sym = msg.tick.symbol;
                            const engine = this.engines.get(sym);
                            if (engine) {
                                engine.addTick(msg.tick.quote);
                                this.emit();
                            }
                        }
                    }
                } catch (e) {
                    console.error('Error parsing tick message:', e);
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket connection error in TickSubscriber:', error);
            };

            this.ws.onclose = () => {
                this.isStreaming = false;
            };
        } catch (e) {
            console.error('Failed to get socket URL for TickSubscriber:', e);
            this.isStreaming = false;
        }
    }

    public stopStreaming() {
        if (!this.isStreaming) return;

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        this.isStreaming = false;
        this.engines.clear();
        this.activeSymbols = [];
        this.currentMode = '';
    }
}

export const tickSubscriber = new TickSubscriber();
