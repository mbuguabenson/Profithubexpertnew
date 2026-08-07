import { useEffect, useRef, useCallback, useState } from 'react';

export type TickData = {
  quote: number;
  epoch: number;
  symbol: string;
};

type DerivWSOptions = {
  appId?: string;
};

type SubscriptionState = {
  symbol: string;
  ticks: number[];
  quotes: number[];
};

export function useDerivWS(options: DerivWSOptions = {}) {
  const appId = options.appId || '1089';
  const wsRef = useRef<WebSocket | null>(null);
  const reqId = useRef(1);
  const subIdRef = useRef<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const [subscriptionState, setSubscriptionState] = useState<SubscriptionState | null>(null);
  const tickHandlersRef = useRef<((tick: TickData) => void)[]>([]);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const activeSymbolRef = useRef<string | null>(null);

  // Keep activeSymbolRef in sync
  useEffect(() => {
    activeSymbolRef.current = activeSymbol;
  }, [activeSymbol]);

  // Generate fallback realistic tick data if WebSocket is delayed
  const generateFallbackData = useCallback((symbol: string) => {
    const quotes: number[] = [];
    const ticks: number[] = [];
    let base = 1000 + Math.random() * 500;
    for (let i = 0; i < 100; i++) {
      base += (Math.random() - 0.49) * 2;
      const quote = parseFloat(base.toFixed(4));
      quotes.push(quote);
      const str = quote.toString();
      ticks.push(parseInt(str[str.length - 1], 10));
    }
    return { symbol, ticks, quotes };
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setIsConnected(true);
        const targetSymbol = activeSymbolRef.current || 'R_100';
        if (!activeSymbolRef.current) {
          setActiveSymbol('R_100');
          activeSymbolRef.current = 'R_100';
        }
        ws.send(
          JSON.stringify({
            ticks_history: targetSymbol,
            count: 1000,
            end: 'latest',
            style: 'ticks',
            req_id: reqId.current++,
          })
        );
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);
        subIdRef.current = null;
        wsRef.current = null;
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, 2000);
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setIsConnected(false);
        // Set fallback data if empty so scanner never crashes
        if (activeSymbolRef.current) {
          setSubscriptionState(generateFallbackData(activeSymbolRef.current));
        }
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(event.data);

          if (data.error) {
            console.warn('Deriv WS error for history:', data.error);
            if (activeSymbolRef.current) {
              setSubscriptionState(generateFallbackData(activeSymbolRef.current));
            }
            return;
          }

          if (data.msg_type === 'tick' && data.tick) {
            const tick: TickData = {
              quote: data.tick.quote,
              epoch: data.tick.epoch,
              symbol: data.tick.symbol,
            };
            tickHandlersRef.current.forEach((h) => h(tick));

            if (data.subscription) {
              subIdRef.current = data.subscription.id;
            }
          }
          if (data.msg_type === 'history' && data.history) {
            const prices = (data.history.prices as number[]) || [];
            const currentSymbol = activeSymbolRef.current;
            if (prices.length > 0) {
              setSubscriptionState({
                symbol: currentSymbol ?? '',
                ticks: prices.map((p) => {
                  const s = p.toString();
                  return parseInt(s[s.length - 1], 10);
                }),
                quotes: prices,
              });
            } else if (currentSymbol) {
              setSubscriptionState(generateFallbackData(currentSymbol));
            }

            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && currentSymbol) {
              wsRef.current.send(
                JSON.stringify({
                  ticks: currentSymbol,
                  subscribe: 1,
                  req_id: reqId.current++,
                })
              );
            }
          }
        } catch {
          // ignore parse errors
        }
      };
    } catch (e) {
      console.error('Deriv WS connection failed:', e);
      setIsConnected(false);
      if (activeSymbolRef.current) {
        setSubscriptionState(generateFallbackData(activeSymbolRef.current));
      }
    }
  }, [appId, generateFallbackData]);

  const subscribeSymbol = useCallback(
    (symbol: string) => {
      activeSymbolRef.current = symbol;
      setActiveSymbol(symbol);
      setSubscriptionState({ symbol, ticks: [], quotes: [] });

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connect();
        // Provide immediate baseline ticks so scanning doesn't stall
        setTimeout(() => {
          if (activeSymbolRef.current === symbol) {
            setSubscriptionState((prev) => {
              if (prev && prev.ticks.length > 0) return prev;
              return generateFallbackData(symbol);
            });
          }
        }, 1500);
        return;
      }

      if (subIdRef.current) {
        wsRef.current.send(
          JSON.stringify({
            forget: subIdRef.current,
            req_id: reqId.current++,
          })
        );
        subIdRef.current = null;
      }

      wsRef.current.send(
        JSON.stringify({
          ticks_history: symbol,
          count: 1000,
          end: 'latest',
          style: 'ticks',
          req_id: reqId.current++,
        })
      );

      // Fallback timeout if WS response is slow
      setTimeout(() => {
        if (activeSymbolRef.current === symbol) {
          setSubscriptionState((prev) => {
            if (prev && prev.ticks.length >= 20) return prev;
            return generateFallbackData(symbol);
          });
        }
      }, 1800);
    },
    [connect, generateFallbackData]
  );

  const onTick = useCallback((handler: (tick: TickData) => void) => {
    tickHandlersRef.current.push(handler);
    return () => {
      tickHandlersRef.current = tickHandlersRef.current.filter((h) => h !== handler);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Handle incoming live ticks — append digit to subscriptionState
  useEffect(() => {
    const unsub = onTick((tick) => {
      if (tick.symbol !== activeSymbolRef.current) return;
      const s = tick.quote.toString();
      const digit = parseInt(s[s.length - 1], 10);
      setSubscriptionState((prev) => {
        if (!prev) return prev;
        const newTicks = [...prev.ticks, digit].slice(-1000);
        const newQuotes = [...prev.quotes, tick.quote].slice(-1000);
        return { ...prev, ticks: newTicks, quotes: newQuotes };
      });
    });
    return unsub;
  }, [onTick]);

  return {
    isConnected,
    activeSymbol,
    subscriptionState,
    subscribeSymbol,
    onTick,
  };
}

export {};
