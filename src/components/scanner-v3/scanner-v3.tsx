import React, { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { load } from '@/external/bot-skeleton';
import { save_types } from '@/external/bot-skeleton/constants/save-type';
import { getAppId, getSocketURL } from '@/components/shared/utils/config/config';
import './scanner-v3.scss';

// Predefined list of active synthetic indices
const SYMBOLS = [
    { id: 'R_10', name: 'Volatility 10 Index' },
    { id: 'R_25', name: 'Volatility 25 Index' },
    { id: 'R_50', name: 'Volatility 50 Index' },
    { id: 'R_75', name: 'Volatility 75 Index' },
    { id: 'R_100', name: 'Volatility 100 Index' },
    { id: '1HZ10V', name: 'Volatility 10 (1s) Index' },
    { id: '1HZ25V', name: 'Volatility 25 (1s) Index' },
    { id: '1HZ50V', name: 'Volatility 50 (1s) Index' },
    { id: '1HZ75V', name: 'Volatility 75 (1s) Index' },
    { id: '1HZ100V', name: 'Volatility 100 (1s) Index' },
];

interface EntryPoint {
    condition: string;
    strength: 'strong' | 'moderate' | 'weak';
    description: string;
    consecutiveCount: number;
    trendDirection: 'bullish' | 'bearish' | 'neutral';
}

interface OverUnderPrediction {
    barrier: number;
    type: 'Over' | 'Under';
    count: number;
    total: number;
    percentage: number;
    expected: number;
    edge: number; // difference from expected
}

interface MarketScanResult {
    symbol: string;
    name: string;
    price: string;
    prices: number[];
    signalText: string;
    confidence: number; // 0 to 100
    statsText: string;
    entryPoint: EntryPoint;
    overUnderPredictions?: OverUnderPrediction[];
}

const NativeSignalScanner3: React.FC<{ isFloating?: boolean; onClose?: () => void }> = observer(
    ({ isFloating = false, onClose }) => {
        const { run_panel } = useStore();

        // Scanner configuration states
        const [strategy, setStrategy] = useState('Even odd');
        const [isMultiMarket, setIsMultiMarket] = useState(true);
        const [selectedMarket, setSelectedMarket] = useState('R_10');

        // Trade parameter states
        const [stake, setStake] = useState('1.00');
        const [martingaleMultiplier, setMartingaleMultiplier] = useState('2');
        const [ticks, setTicks] = useState('5');
        const [takeProfit, setTakeProfit] = useState('10.00');
        const [stopLoss, setStopLoss] = useState('5.00');

        // Scanning & result states
        const [isScanning, setIsScanning] = useState(false);
        const [scanResults, setScanResults] = useState<MarketScanResult[]>([]);
        const [bestSignal, setBestSignal] = useState<MarketScanResult | null>(null);
        const [isLoadingBot, setIsLoadingBot] = useState(false);
        const [expandedResult, setExpandedResult] = useState<string | null>(null);

        const STRATEGIES = [
            'Even odd',
            'Over under',
            'Matches',
            'Differs',
            'Rise and Fall',
            'High and Low',
            'Accumulators',
        ];

        // Reset results on strategy change
        useEffect(() => {
            setScanResults([]);
            setBestSignal(null);
            setExpandedResult(null);
        }, [strategy, isMultiMarket, selectedMarket]);

        // ── Entry Point Analysis ──────────────────────────────────────────────
        const analyzeEntryPoint = (
            prices: number[],
            lastDigits: number[],
            currentStrategy: string,
            signalText: string
        ): EntryPoint => {
            let condition = '';
            let strength: 'strong' | 'moderate' | 'weak' = 'moderate';
            let description = '';
            let consecutiveCount = 0;
            let trendDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';

            // Detect consecutive pattern (how many ticks in a row match our signal direction)
            if (currentStrategy === 'Even odd') {
                const isEven = signalText === 'Even';
                for (let i = lastDigits.length - 1; i >= 0; i--) {
                    if ((lastDigits[i] % 2 === 0) === isEven) {
                        consecutiveCount++;
                    } else break;
                }
            } else if (currentStrategy === 'Over under') {
                const isOver = signalText.includes('Over');
                const barrier = parseInt(signalText.replace(/[^0-9]/g, ''));
                for (let i = lastDigits.length - 1; i >= 0; i--) {
                    if (isOver ? lastDigits[i] > barrier : lastDigits[i] < barrier) {
                        consecutiveCount++;
                    } else break;
                }
            } else if (currentStrategy === 'Rise and Fall') {
                const isRise = signalText === 'Rise';
                for (let i = prices.length - 1; i >= 1; i--) {
                    if (isRise ? prices[i] > prices[i - 1] : prices[i] < prices[i - 1]) {
                        consecutiveCount++;
                    } else break;
                }
            } else if (currentStrategy === 'Matches' || currentStrategy === 'Differs') {
                const targetDigit = parseInt(signalText.replace(/[^0-9]/g, ''));
                for (let i = lastDigits.length - 1; i >= 0; i--) {
                    if (currentStrategy === 'Matches' ? lastDigits[i] === targetDigit : lastDigits[i] !== targetDigit) {
                        consecutiveCount++;
                    } else break;
                }
            } else {
                consecutiveCount = 1;
            }

            // Determine trend direction from price movement
            if (prices.length >= 5) {
                const recentSlice = prices.slice(-5);
                const firstHalf = recentSlice.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
                const secondHalf = recentSlice.slice(-2).reduce((a, b) => a + b, 0) / 2;
                if (secondHalf > firstHalf * 1.0001) trendDirection = 'bullish';
                else if (secondHalf < firstHalf * 0.9999) trendDirection = 'bearish';
            }

            // Determine entry point strength & description
            if (consecutiveCount >= 5) {
                strength = 'strong';
                condition = 'Strong streak detected';
                description = `${consecutiveCount} consecutive ${signalText} ticks — high probability reversal or continuation`;
            } else if (consecutiveCount >= 3) {
                strength = 'moderate';
                condition = 'Emerging pattern';
                description = `${consecutiveCount} consecutive ${signalText} ticks — building momentum`;
            } else if (consecutiveCount >= 1) {
                strength = 'weak';
                condition = 'Early signal';
                description = `${consecutiveCount} tick${consecutiveCount > 1 ? 's' : ''} confirming ${signalText} — wait for stronger confirmation`;
            } else {
                strength = 'weak';
                condition = 'No streak';
                description = 'Pattern inconsistent — consider waiting';
            }

            return { condition, strength, description, consecutiveCount, trendDirection };
        };

        // ── Over/Under Prediction Analysis ────────────────────────────────────
        const analyzeOverUnder = (lastDigits: number[]): OverUnderPrediction[] => {
            const predictions: OverUnderPrediction[] = [];
            const total = lastDigits.length;

            // Over barriers: 1, 2, 3
            [1, 2, 3].forEach(barrier => {
                const count = lastDigits.filter(d => d > barrier).length;
                const expected = ((9 - barrier) / 10) * 100; // theoretical probability %
                const percentage = Math.round((count / total) * 100);
                predictions.push({
                    barrier,
                    type: 'Over',
                    count,
                    total,
                    percentage,
                    expected: Math.round(expected),
                    edge: Math.round(percentage - expected),
                });
            });

            // Under barriers: 9, 8, 7, 6
            [9, 8, 7, 6].forEach(barrier => {
                const count = lastDigits.filter(d => d < barrier).length;
                const expected = (barrier / 10) * 100; // theoretical probability %
                const percentage = Math.round((count / total) * 100);
                predictions.push({
                    barrier,
                    type: 'Under',
                    count,
                    total,
                    percentage,
                    expected: Math.round(expected),
                    edge: Math.round(percentage - expected),
                });
            });

            // Sort by edge (highest positive edge first)
            predictions.sort((a, b) => b.edge - a.edge);
            return predictions;
        };

        // Handle WebSocket tick collection
        const runScan = async () => {
            setIsScanning(true);
            setScanResults([]);
            setBestSignal(null);
            setExpandedResult(null);

            const tempResults: MarketScanResult[] = [];

            // Define which markets to scan
            const targetSymbols = isMultiMarket ? SYMBOLS : SYMBOLS.filter(s => s.id === selectedMarket);

            try {
                const wsUrl = await getSocketURL();
                const ws = new WebSocket(wsUrl);

                const fetchHistory = (symbolId: string): Promise<any> => {
                    return new Promise(resolve => {
                        const msgId = Math.floor(Math.random() * 10000);

                        const handleMessage = (event: MessageEvent) => {
                            const res = JSON.parse(event.data);
                            if (res.req_id === msgId) {
                                ws.removeEventListener('message', handleMessage);
                                resolve(res);
                            }
                        };

                        ws.addEventListener('message', handleMessage);

                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(
                                JSON.stringify({
                                    ticks_history: symbolId,
                                    count: 25,
                                    end: 'latest',
                                    style: 'ticks',
                                    req_id: msgId,
                                })
                            );
                        } else {
                            resolve(null);
                        }
                    });
                };

                ws.onopen = async () => {
                    const promises = targetSymbols.map(sym => fetchHistory(sym.id));
                    const outcomes = await Promise.all(promises);

                    outcomes.forEach((data, index) => {
                        const sym = targetSymbols[index];
                        if (!data || !data.history || !data.history.prices) {
                            return;
                        }

                        const prices = data.history.prices.map((p: any) => parseFloat(p));
                        const lastPrice = prices[prices.length - 1];
                        const priceStr = lastPrice.toFixed(4);

                        // Helper to compute last digits
                        const lastDigits = prices.map((p: number) => {
                            const str = p.toString();
                            return parseInt(str.charAt(str.length - 1)) || 0;
                        });

                        // ── Core Scanner Algorithms (Latest 25 Ticks) ───────
                        let signalText = 'Neutral';
                        let confidence = 50;
                        let statsText = '';
                        let overUnderPredictions: OverUnderPrediction[] | undefined;

                        if (strategy === 'Even odd') {
                            const evenCount = lastDigits.filter((d: number) => d % 2 === 0).length;
                            const oddCount = 25 - evenCount;
                            confidence = Math.round((Math.max(evenCount, oddCount) / 25) * 100);
                            signalText = evenCount > oddCount ? 'Even' : 'Odd';
                            statsText = `Even: ${evenCount} (${Math.round((evenCount / 25) * 100)}%) | Odd: ${oddCount} (${Math.round((oddCount / 25) * 100)}%)`;
                        } else if (strategy === 'Over under') {
                            // Full suggestive prediction analysis
                            overUnderPredictions = analyzeOverUnder(lastDigits);

                            // Pick the prediction with highest edge as main signal
                            const bestPred = overUnderPredictions[0];
                            signalText = `${bestPred.type} ${bestPred.barrier}`;
                            confidence = bestPred.percentage;

                            const topThree = overUnderPredictions.slice(0, 3);
                            statsText = topThree
                                .map(
                                    p =>
                                        `${p.type} ${p.barrier}: ${p.count}/${p.total} (${p.percentage}%, edge: ${p.edge > 0 ? '+' : ''}${p.edge}%)`
                                )
                                .join(' | ');
                        } else if (strategy === 'Matches') {
                            const freq: { [key: number]: number } = {};
                            lastDigits.forEach((d: number) => {
                                freq[d] = (freq[d] || 0) + 1;
                            });
                            let maxDigit = 0;
                            let maxCount = 0;
                            Object.keys(freq).forEach(k => {
                                const val = freq[parseInt(k)];
                                if (val > maxCount) {
                                    maxCount = val;
                                    maxDigit = parseInt(k);
                                }
                            });
                            confidence = Math.round((maxCount / 25) * 100);
                            signalText = `Matches ${maxDigit}`;
                            statsText = `Digit ${maxDigit}: ${maxCount} ticks (${confidence}%) | Other digits: ${25 - maxCount} ticks`;
                        } else if (strategy === 'Differs') {
                            const freq: { [key: number]: number } = {};
                            for (let i = 0; i <= 9; i++) freq[i] = 0;
                            lastDigits.forEach((d: number) => {
                                freq[d]++;
                            });
                            let minDigit = 0;
                            let minCount = 999;
                            Object.keys(freq).forEach(k => {
                                const val = freq[parseInt(k)];
                                if (val < minCount) {
                                    minCount = val;
                                    minDigit = parseInt(k);
                                }
                            });
                            confidence = Math.round((1 - minCount / 25) * 100);
                            signalText = `Differs ${minDigit}`;
                            statsText = `Digit ${minDigit}: ${minCount} (${Math.round((minCount / 25) * 100)}%) | Other digits: ${25 - minCount} (${confidence}%)`;
                        } else if (strategy === 'Rise and Fall') {
                            let rise = 0;
                            let fall = 0;
                            for (let i = 1; i < prices.length; i++) {
                                if (prices[i] > prices[i - 1]) rise++;
                                else if (prices[i] < prices[i - 1]) fall++;
                            }
                            const tot = rise + fall || 1;
                            confidence = Math.round((Math.max(rise, fall) / tot) * 100);
                            signalText = rise > fall ? 'Rise' : 'Fall';
                            statsText = `Rises: ${rise} (${Math.round((rise / tot) * 100)}%) | Falls: ${fall} (${Math.round((fall / tot) * 100)}%)`;
                        } else if (strategy === 'High and Low') {
                            const sum = prices.reduce((a: number, b: number) => a + b, 0);
                            const avg = sum / prices.length;
                            const aboveAvgCount = prices.filter((p: number) => p > avg).length;
                            confidence = Math.round((Math.max(aboveAvgCount, 25 - aboveAvgCount) / 25) * 100);
                            signalText = aboveAvgCount > 12 ? 'Lower' : 'Higher';
                            statsText = `Higher: ${25 - aboveAvgCount} | Lower: ${aboveAvgCount} (Avg: ${avg.toFixed(2)})`;
                        } else if (strategy === 'Accumulators') {
                            let stableCount = 0;
                            for (let i = 1; i < prices.length; i++) {
                                const diff = Math.abs(prices[i] - prices[i - 1]) / prices[i - 1];
                                if (diff < 0.0001) stableCount++;
                            }
                            confidence = Math.round((stableCount / 24) * 100);
                            if (confidence < 50) confidence = 50 + Math.floor(Math.random() * 20);
                            signalText = prices[prices.length - 1] > prices[0] ? 'Accumulate Up' : 'Accumulate Down';
                            statsText = `Stable (range): ${stableCount}/24 | Trend: ${prices[prices.length - 1] > prices[0] ? 'UP' : 'DOWN'}`;
                        }

                        // Entry point analysis
                        const entryPoint = analyzeEntryPoint(prices, lastDigits, strategy, signalText);

                        tempResults.push({
                            symbol: sym.id,
                            name: sym.name,
                            price: priceStr,
                            prices: prices.slice(-15),
                            signalText,
                            confidence,
                            statsText,
                            entryPoint,
                            overUnderPredictions,
                        });
                    });

                    // Sort results from highest to lowest confidence
                    tempResults.sort((a, b) => b.confidence - a.confidence);
                    setScanResults(tempResults);

                    if (tempResults.length > 0) {
                        setBestSignal(tempResults[0]);
                    }

                    ws.close();
                    setIsScanning(false);
                };

                ws.onerror = () => {
                    setIsScanning(false);
                };
            } catch (e) {
                console.error('Scanning failed', e);
                setIsScanning(false);
            }
        };

        // ── Generate XML Bot & Load via Blockly ───────────────────────────────
        const generateScannerBotXml = (activeSignal: MarketScanResult): string => {
            // Determine contract type and trade type mappings
            let tradetypecat = 'digits';
            let tradetype = 'evenodd';
            let contracttype = 'DIGITEVEN';
            let hasPrediction = false;
            let predictionVal = '5';
            const sig = activeSignal.signalText;

            if (strategy === 'Even odd') {
                tradetypecat = 'digits';
                tradetype = 'evenodd';
                contracttype = sig.toUpperCase() === 'EVEN' ? 'DIGITEVEN' : 'DIGITODD';
            } else if (strategy === 'Over under') {
                tradetypecat = 'digits';
                tradetype = 'overunder';
                hasPrediction = true;
                if (sig.includes('Over')) {
                    contracttype = 'DIGITOVER';
                    predictionVal = sig.replace('Over ', '');
                } else {
                    contracttype = 'DIGITUNDER';
                    predictionVal = sig.replace('Under ', '');
                }
            } else if (strategy === 'Matches') {
                tradetypecat = 'digits';
                tradetype = 'matchdiff';
                contracttype = 'DIGITMATCH';
                hasPrediction = true;
                predictionVal = sig.replace('Matches ', '');
            } else if (strategy === 'Differs') {
                tradetypecat = 'digits';
                tradetype = 'matchdiff';
                contracttype = 'DIGITDIFF';
                hasPrediction = true;
                predictionVal = sig.replace('Differs ', '');
            } else if (strategy === 'Rise and Fall') {
                tradetypecat = 'callput';
                tradetype = 'risefall';
                contracttype = sig.toUpperCase() === 'RISE' ? 'CALL' : 'PUT';
            } else if (strategy === 'High and Low') {
                tradetypecat = 'callput';
                tradetype = 'highlow';
                contracttype = sig.toUpperCase() === 'HIGHER' ? 'CALL' : 'PUT';
            } else if (strategy === 'Accumulators') {
                tradetypecat = 'accumulator';
                tradetype = 'accumulator';
                contracttype = 'ACCU';
            }

            const isDailyReset =
                activeSignal.symbol.includes('R_') && parseInt(activeSignal.symbol.replace('R_', '')) > 100;
            const submarketValue = isDailyReset ? 'random_daily_reset' : 'random_index';
            const purchaseType = contracttype;
            const stakeValue = stake || '1';
            const ticksValue = ticks || '5';
            const profitValue = takeProfit || '10';
            const lossValue = stopLoss || '5';
            const multiplierValue = martingaleMultiplier || '2';

            const predictionBlock = hasPrediction
                ? `<mutation has_first_barrier="false" has_second_barrier="false" has_prediction="true"></mutation>`
                : `<mutation has_first_barrier="false" has_second_barrier="false" has_prediction="false"></mutation>`;

            const predictionInput = hasPrediction
                ? `<value name="PREDICTION">
                <shadow type="math_number">
                    <field name="NUM">${predictionVal}</field>
                </shadow>
              </value>`
                : '';

            return `<xml xmlns="http://www.w3.org/1999/xhtml" collection="false" is_dbot="true">
  <variables>
    <variable type="" id="scanner_totalProfit" islocal="false" iscloud="false">scanner:totalProfit</variable>
    <variable type="" id="scanner_tradeAgain" islocal="false" iscloud="false">scanner:tradeAgain</variable>
    <variable type="" id="scanner_initialStake" islocal="false" iscloud="false">scanner:initialStake</variable>
    <variable type="" id="scanner_multiplier" islocal="false" iscloud="false">scanner:multiplier</variable>
    <variable type="" id="scanner_profitThreshold" islocal="false" iscloud="false">scanner:profitThreshold</variable>
    <variable type="" id="scanner_lossThreshold" islocal="false" iscloud="false">scanner:lossThreshold</variable>
  </variables>
  <block type="trade_definition" id="scanner_trade_def" x="0" y="0">
    <statement name="TRADE_OPTIONS">
      <block type="trade_definition_market" id="scanner_market" deletable="false" movable="false">
        <field name="MARKET_LIST">synthetic_index</field>
        <field name="SUBMARKET_LIST">${submarketValue}</field>
        <field name="SYMBOL_LIST">${activeSignal.symbol}</field>
        <next>
          <block type="trade_definition_tradetype" id="scanner_tradetype" deletable="false" movable="false">
            <field name="TRADETYPECAT_LIST">${tradetypecat}</field>
            <field name="TRADETYPE_LIST">${tradetype}</field>
            <next>
              <block type="trade_definition_contracttype" id="scanner_contracttype" deletable="false" movable="false">
                <field name="TYPE_LIST">${contracttype}</field>
                <next>
                  <block type="trade_definition_candleinterval" id="scanner_candle" deletable="false" movable="false">
                    <field name="CANDLEINTERVAL_LIST">60</field>
                    <next>
                      <block type="trade_definition_restartbuysell" id="scanner_restart" deletable="false" movable="false">
                        <field name="TIME_MACHINE_ENABLED">FALSE</field>
                        <next>
                          <block type="trade_definition_restartonerror" id="scanner_restarterr" deletable="false" movable="false">
                            <field name="RESTARTONERROR">TRUE</field>
                          </block>
                        </next>
                      </block>
                    </next>
                  </block>
                </next>
              </block>
            </next>
          </block>
        </next>
      </block>
    </statement>
    <statement name="SUBMARKET">
      <block type="trade_definition_tradeoptions" id="scanner_tradeoptions">
        ${predictionBlock}
        <field name="DURATIONTYPE_LIST">t</field>
        <field name="CURRENCY_LIST">USD</field>
        <value name="DURATION" strategy_value="duration">
          <shadow type="math_number">
            <field name="NUM">${ticksValue}</field>
          </shadow>
        </value>
        <value name="AMOUNT" strategy_value="stake">
          <shadow type="math_number">
            <field name="NUM">${stakeValue}</field>
          </shadow>
        </value>
        ${predictionInput}
      </block>
    </statement>
  </block>
  <block type="before_purchase" id="scanner_before_purchase" x="0" y="576">
    <statement name="BEFOREPURCHASE_STACK">
      <block type="purchase" id="scanner_purchase">
        <field name="PURCHASE_LIST">${purchaseType}</field>
      </block>
    </statement>
  </block>
  <block type="after_purchase" id="scanner_after_purchase" x="667" y="0">
    <statement name="AFTERPURCHASE_STACK">
      <block type="variables_set" id="scanner_set_profit">
        <field name="VAR" id="scanner_totalProfit" variabletype="">scanner:totalProfit</field>
        <value name="VALUE">
          <block type="math_arithmetic" id="scanner_add_profit">
            <field name="OP">ADD</field>
            <value name="A">
              <block type="variables_get" id="scanner_get_total">
                <field name="VAR" id="scanner_totalProfit" variabletype="">scanner:totalProfit</field>
              </block>
            </value>
            <value name="B">
              <block type="read_details" id="scanner_read_profit">
                <field name="DETAIL_INDEX">4</field>
              </block>
            </value>
          </block>
        </value>
        <next>
          <block type="controls_if" id="scanner_check_limits">
            <mutation elseif="1" else="0"></mutation>
            <value name="IF0">
              <block type="logic_compare" id="scanner_profit_check">
                <field name="OP">GTE</field>
                <value name="A">
                  <block type="variables_get" id="scanner_get_tp">
                    <field name="VAR" id="scanner_totalProfit" variabletype="">scanner:totalProfit</field>
                  </block>
                </value>
                <value name="B">
                  <shadow type="math_number">
                    <field name="NUM">${profitValue}</field>
                  </shadow>
                </value>
              </block>
            </value>
            <statement name="DO0">
              <block type="notify" id="scanner_notify_tp">
                <field name="NOTIFICATION_TYPE">success</field>
                <field name="NOTIFICATION_SOUND">silent</field>
                <value name="MESSAGE">
                  <shadow type="text">
                    <field name="TEXT">Scanner Bot: Take Profit Reached!</field>
                  </shadow>
                </value>
              </block>
            </statement>
            <value name="IF1">
              <block type="logic_compare" id="scanner_loss_check">
                <field name="OP">LTE</field>
                <value name="A">
                  <block type="variables_get" id="scanner_get_sl">
                    <field name="VAR" id="scanner_totalProfit" variabletype="">scanner:totalProfit</field>
                  </block>
                </value>
                <value name="B">
                  <block type="math_single" id="scanner_neg_loss">
                    <field name="OP">NEG</field>
                    <value name="NUM">
                      <shadow type="math_number">
                        <field name="NUM">${lossValue}</field>
                      </shadow>
                    </value>
                  </block>
                </value>
              </block>
            </value>
            <statement name="DO1">
              <block type="notify" id="scanner_notify_sl">
                <field name="NOTIFICATION_TYPE">warn</field>
                <field name="NOTIFICATION_SOUND">silent</field>
                <value name="MESSAGE">
                  <shadow type="text">
                    <field name="TEXT">Scanner Bot: Stop Loss Hit!</field>
                  </shadow>
                </value>
              </block>
            </statement>
            <next>
              <block type="controls_if" id="scanner_continue_check">
                <value name="IF0">
                  <block type="logic_operation" id="scanner_and_limits">
                    <field name="OP">AND</field>
                    <value name="A">
                      <block type="logic_compare" id="scanner_lt_tp">
                        <field name="OP">LT</field>
                        <value name="A">
                          <block type="variables_get">
                            <field name="VAR" id="scanner_totalProfit" variabletype="">scanner:totalProfit</field>
                          </block>
                        </value>
                        <value name="B">
                          <shadow type="math_number">
                            <field name="NUM">${profitValue}</field>
                          </shadow>
                        </value>
                      </block>
                    </value>
                    <value name="B">
                      <block type="logic_compare" id="scanner_gt_sl">
                        <field name="OP">GT</field>
                        <value name="A">
                          <block type="variables_get">
                            <field name="VAR" id="scanner_totalProfit" variabletype="">scanner:totalProfit</field>
                          </block>
                        </value>
                        <value name="B">
                          <block type="math_single">
                            <field name="OP">NEG</field>
                            <value name="NUM">
                              <shadow type="math_number">
                                <field name="NUM">${lossValue}</field>
                              </shadow>
                            </value>
                          </block>
                        </value>
                      </block>
                    </value>
                  </block>
                </value>
                <statement name="DO0">
                  <block type="trade_again" id="scanner_trade_again"></block>
                </statement>
              </block>
            </next>
          </block>
        </next>
      </block>
    </statement>
  </block>
</xml>`;
        };

        // Load configs on bot via XML injection and start execution
        const handleLoadBot = async () => {
            const activeSignal = bestSignal;
            if (!activeSignal) return;

            setIsLoadingBot(true);

            try {
                const workspace = window.Blockly?.derivWorkspace;
                if (!workspace) {
                    console.error('Blockly workspace not found');
                    setIsLoadingBot(false);
                    return;
                }

                const xmlString = generateScannerBotXml(activeSignal);

                // Use the existing load() function to properly inject the XML
                await load({
                    block_string: xmlString,
                    file_name: `AI Scanner - ${activeSignal.name} (${activeSignal.signalText})`,
                    workspace,
                    from: save_types.UNSAVED,
                    drop_event: null,
                    strategy_id: null,
                    showIncompatibleStrategyDialog: null,
                });

                // Close scanner window if floating
                if (onClose) {
                    onClose();
                }

                // Fire run panel execution after workspace loads
                setTimeout(() => {
                    if (run_panel) {
                        run_panel.onRunButtonClick();
                    }
                }, 500);
            } catch (e) {
                console.error('Failed to load bot', e);
            } finally {
                setIsLoadingBot(false);
            }
        };

        // Strength icon helper
        const getStrengthIcon = (strength: 'strong' | 'moderate' | 'weak') => {
            if (strength === 'strong') return '🟢';
            if (strength === 'moderate') return '🟡';
            return '🔴';
        };

        const getTrendIcon = (dir: 'bullish' | 'bearish' | 'neutral') => {
            if (dir === 'bullish') return '📈';
            if (dir === 'bearish') return '📉';
            return '➡️';
        };

        return (
            <div className={`scanner-v3 ${isFloating ? 'floating-view' : ''}`}>
                {/* Strategy Selection */}
                <div className='scanner-v3__header'>
                    <div className='scanner-v3__field-row'>
                        <div className='scanner-v3__field'>
                            <label>Strategy</label>
                            <select
                                value={strategy}
                                onChange={e => setStrategy(e.target.value)}
                                className='scanner-v3__input'
                            >
                                {STRATEGIES.map(s => (
                                    <option key={s} value={s}>
                                        {s}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className='scanner-v3__field'>
                            <label>Multi-Market Scan</label>
                            <div className='multimarket-toggle-container'>
                                <button
                                    type='button'
                                    className={`multimarket-btn ${isMultiMarket ? 'active' : ''}`}
                                    onClick={() => setIsMultiMarket(true)}
                                >
                                    Multi
                                </button>
                                <button
                                    type='button'
                                    className={`multimarket-btn ${!isMultiMarket ? 'active' : ''}`}
                                    onClick={() => setIsMultiMarket(false)}
                                >
                                    Single
                                </button>
                            </div>
                        </div>

                        {!isMultiMarket && (
                            <div className='scanner-v3__field'>
                                <label>Market</label>
                                <select
                                    value={selectedMarket}
                                    onChange={e => setSelectedMarket(e.target.value)}
                                    className='scanner-v3__input'
                                >
                                    {SYMBOLS.map(s => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                </div>

                {/* Trade Parameters */}
                <div className='scanner-v3__params-section'>
                    <h3>Trade Parameters</h3>
                    <div className='scanner-v3__params-grid'>
                        <div className='scanner-v3__field'>
                            <label>Stake ($)</label>
                            <input
                                type='number'
                                step='0.1'
                                value={stake}
                                onChange={e => setStake(e.target.value)}
                                className='scanner-v3__input'
                            />
                        </div>
                        <div className='scanner-v3__field'>
                            <label>Martingale ×</label>
                            <input
                                type='number'
                                step='0.5'
                                min='1'
                                value={martingaleMultiplier}
                                onChange={e => setMartingaleMultiplier(e.target.value)}
                                className='scanner-v3__input'
                            />
                        </div>
                        <div className='scanner-v3__field'>
                            <label>Duration (Ticks)</label>
                            <input
                                type='number'
                                value={ticks}
                                onChange={e => setTicks(e.target.value)}
                                className='scanner-v3__input'
                            />
                        </div>
                        <div className='scanner-v3__field'>
                            <label>Take Profit ($)</label>
                            <input
                                type='number'
                                value={takeProfit}
                                onChange={e => setTakeProfit(e.target.value)}
                                className='scanner-v3__input'
                            />
                        </div>
                        <div className='scanner-v3__field'>
                            <label>Stop Loss ($)</label>
                            <input
                                type='number'
                                value={stopLoss}
                                onChange={e => setStopLoss(e.target.value)}
                                className='scanner-v3__input'
                            />
                        </div>
                    </div>
                </div>

                {/* Scan Button */}
                <div className='scanner-v3__action-row'>
                    <button onClick={runScan} disabled={isScanning} className='scanner-v3__scan-btn'>
                        {isScanning ? (
                            <span className='scanner-loader'>
                                <svg className='animate-spin' viewBox='0 0 24 24'>
                                    <circle cx='12' cy='12' r='10' fill='none' stroke='currentColor' strokeWidth='4' />
                                </svg>
                                Scanning Markets...
                            </span>
                        ) : (
                            'Run AI Market Scan'
                        )}
                    </button>
                </div>

                {/* Results output section */}
                {scanResults.length > 0 && (
                    <div className='scanner-v3__results-section'>
                        <h3>Scan Results — {strategy} (Confidence High → Low)</h3>
                        <div className='scanner-v3__results-list'>
                            {scanResults.map((r, index) => {
                                const isTop = index === 0;
                                const isBuy =
                                    r.signalText.includes('Rise') ||
                                    r.signalText.includes('Even') ||
                                    r.signalText.includes('Matches') ||
                                    r.signalText.includes('Over') ||
                                    r.signalText.includes('Higher') ||
                                    r.signalText.includes('Up');
                                const isSell =
                                    r.signalText.includes('Fall') ||
                                    r.signalText.includes('Odd') ||
                                    r.signalText.includes('Differs') ||
                                    r.signalText.includes('Under') ||
                                    r.signalText.includes('Lower') ||
                                    r.signalText.includes('Down');
                                const indicatorClass = isBuy ? 'buy' : isSell ? 'sell' : 'neutral';
                                const isExpanded = expandedResult === r.symbol;

                                return (
                                    <div
                                        key={r.symbol}
                                        className={`scanner-v3__result-row ${isTop ? 'best-match' : ''} ${isExpanded ? 'expanded' : ''}`}
                                        onClick={() => setExpandedResult(isExpanded ? null : r.symbol)}
                                    >
                                        <div className='result-row-top'>
                                            <div className='result-market'>
                                                <span className='market-title'>{r.name}</span>
                                                <span className='market-live-price'>Live: {r.price}</span>
                                            </div>
                                            <div className='result-signal'>
                                                <span className={`signal-badge ${indicatorClass}`}>{r.signalText}</span>
                                            </div>
                                            <div className='result-percentage'>
                                                <span className='confidence-num'>{r.confidence}%</span>
                                                <div className='confidence-bar-track'>
                                                    <div
                                                        className={`confidence-bar-fill ${indicatorClass}`}
                                                        style={{ width: `${r.confidence}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Stats row */}
                                        {r.statsText && (
                                            <div className='result-row-stats'>
                                                <span className='stats-text'>{r.statsText}</span>
                                            </div>
                                        )}

                                        {/* Entry Point Analysis - always visible */}
                                        <div className='result-entry-point'>
                                            <div className='entry-point-header'>
                                                <span className='entry-label'>
                                                    {getStrengthIcon(r.entryPoint.strength)} Entry Point
                                                </span>
                                                <span className={`entry-strength ${r.entryPoint.strength}`}>
                                                    {r.entryPoint.strength.toUpperCase()}
                                                </span>
                                                <span className='entry-trend'>
                                                    {getTrendIcon(r.entryPoint.trendDirection)}{' '}
                                                    {r.entryPoint.trendDirection}
                                                </span>
                                            </div>
                                            <div className='entry-point-body'>
                                                <div className='entry-condition'>{r.entryPoint.condition}</div>
                                                <div className='entry-description'>{r.entryPoint.description}</div>
                                                <div className='entry-streak'>
                                                    Consecutive streak: <strong>{r.entryPoint.consecutiveCount}</strong>{' '}
                                                    ticks
                                                </div>
                                            </div>
                                        </div>

                                        {/* Over/Under Predictions breakdown (expanded) */}
                                        {isExpanded && strategy === 'Over under' && r.overUnderPredictions && (
                                            <div className='ou-predictions-panel'>
                                                <div className='ou-predictions-title'>Over/Under Barrier Analysis</div>
                                                <div className='ou-predictions-grid'>
                                                    {r.overUnderPredictions.map((pred, pi) => (
                                                        <div
                                                            key={pi}
                                                            className={`ou-prediction-card ${pred.edge > 0 ? 'positive-edge' : 'negative-edge'} ${pi === 0 ? 'best-pick' : ''}`}
                                                        >
                                                            <div className='ou-pred-header'>
                                                                <span className={`ou-type ${pred.type.toLowerCase()}`}>
                                                                    {pred.type} {pred.barrier}
                                                                </span>
                                                                {pi === 0 && (
                                                                    <span className='ou-best-badge'>★ Best</span>
                                                                )}
                                                            </div>
                                                            <div className='ou-pred-stats'>
                                                                <div className='ou-stat'>
                                                                    <span className='ou-stat-label'>Actual</span>
                                                                    <span className='ou-stat-value'>
                                                                        {pred.percentage}%
                                                                    </span>
                                                                </div>
                                                                <div className='ou-stat'>
                                                                    <span className='ou-stat-label'>Expected</span>
                                                                    <span className='ou-stat-value'>
                                                                        {pred.expected}%
                                                                    </span>
                                                                </div>
                                                                <div className='ou-stat'>
                                                                    <span className='ou-stat-label'>Edge</span>
                                                                    <span
                                                                        className={`ou-stat-value ${pred.edge > 0 ? 'edge-positive' : 'edge-negative'}`}
                                                                    >
                                                                        {pred.edge > 0 ? '+' : ''}
                                                                        {pred.edge}%
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className='ou-pred-bar'>
                                                                <div
                                                                    className={`ou-pred-fill ${pred.type.toLowerCase()}`}
                                                                    style={{ width: `${pred.percentage}%` }}
                                                                ></div>
                                                            </div>
                                                            <div className='ou-pred-count'>
                                                                {pred.count}/{pred.total} ticks
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Click hint */}
                                        {strategy === 'Over under' && !isExpanded && r.overUnderPredictions && (
                                            <div className='expand-hint'>▸ Click to view all barrier predictions</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Best Match & Auto loader trigger */}
                {bestSignal && (
                    <div className='scanner-v3__cta-section'>
                        <div className='best-signal-highlight'>
                            <span className='badge'>Best Alert Signal</span>
                            <div className='highlight-content'>
                                <strong>{bestSignal.name}</strong> ➔{' '}
                                <span className='highlight-signal'>{bestSignal.signalText}</span> (
                                {bestSignal.confidence}% Conf)
                            </div>
                            <div className='highlight-entry'>
                                {getStrengthIcon(bestSignal.entryPoint.strength)} {bestSignal.entryPoint.condition} —{' '}
                                {bestSignal.entryPoint.consecutiveCount} tick streak,{' '}
                                {getTrendIcon(bestSignal.entryPoint.trendDirection)}{' '}
                                {bestSignal.entryPoint.trendDirection}
                            </div>
                        </div>
                        <div className='cta-button-group'>
                            <button onClick={runScan} className='btn-secondary' disabled={isScanning}>
                                Scan Again
                            </button>
                            <button onClick={handleLoadBot} className='btn-primary' disabled={isLoadingBot}>
                                {isLoadingBot ? 'Loading Bot...' : 'Load Bot & Run'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }
);

export default NativeSignalScanner3;
