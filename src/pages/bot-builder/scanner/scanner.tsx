import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import DraggableResizeWrapper from '@/components/draggable/draggable-resize-wrapper';
import { api_base } from '@/external/bot-skeleton';
import classNames from 'classnames';
import './scanner.scss';

// ─── Helper: stats for Stats tab ──────────────────────────────────────────────
const getStatsForStrategy = (analysis: any, strategy: string) => {
  if (!analysis) return { strength: 0, text: '-', details: {} as any };
  const lastDigits = analysis.lastDigits || [];
  const totalTicks = analysis.totalTicks || lastDigits.length || 1;

  if (strategy === 'even_odd') {
    const e = analysis.evenPercentage, o = analysis.oddPercentage;
    return { strength: Math.max(e, o), text: `Even ${e.toFixed(0)}% / Odd ${o.toFixed(0)}%`, details: { bias: e >= o ? 'even' : 'odd' } };
  }
  if (strategy === 'over_under') {
    const pO1 = (lastDigits.filter((d: number) => d > 1).length / totalTicks) * 100;
    const pO2 = (lastDigits.filter((d: number) => d > 2).length / totalTicks) * 100;
    const pO3 = (lastDigits.filter((d: number) => d > 3).length / totalTicks) * 100;
    const pU6 = (lastDigits.filter((d: number) => d < 6).length / totalTicks) * 100;
    const pU7 = (lastDigits.filter((d: number) => d < 7).length / totalTicks) * 100;
    const pU8 = (lastDigits.filter((d: number) => d < 8).length / totalTicks) * 100;
    const maxO = Math.max(pO1, pO2, pO3);
    const maxU = Math.max(pU6, pU7, pU8);
    const isOver = maxO >= maxU;
    const strength = isOver ? maxO : maxU;
    let targetDigit = isOver ? (pO3 === maxO ? 3 : pO2 === maxO ? 2 : 1) : (pU6 === maxU ? 6 : pU7 === maxU ? 7 : 8);
    return { strength, text: isOver ? `Over ${targetDigit}: ${strength.toFixed(0)}%` : `Under ${targetDigit}: ${strength.toFixed(0)}%`, details: { bias: isOver ? 'high' : 'low', targetDigit } };
  }
  if (strategy === 'differs') {
    const w = analysis.powerIndex.weakest;
    const p = analysis.digitFrequencies[w]?.percentage || 0;
    return { strength: 100 - p, text: `Differs ${w}: ${(100 - p).toFixed(0)}%`, details: { targetDigit: w } };
  }
  if (strategy === 'matches') {
    const s = analysis.powerIndex.strongest;
    const p = analysis.digitFrequencies[s]?.percentage || 0;
    return { strength: p, text: `Matches ${s}: ${p.toFixed(0)}%`, details: { targetDigit: s } };
  }
  if (strategy === 'rise_fall') {
    if (lastDigits.length >= 10) {
      const last10 = lastDigits.slice(-10);
      const trend = last10[last10.length - 1] - last10[0];
      const dir = trend > 0 ? 'rise' : 'fall';
      const s = Math.min(60 + Math.abs(trend) * 100, 75);
      return { strength: s, text: `${dir === 'rise' ? 'Rise' : 'Fall'}: ${s.toFixed(0)}%`, details: { bias: dir === 'rise' ? 'high' : 'low' } };
    }
  }
  return { strength: 0, text: '-', details: {} as any };
};

// ─── Strategy options ──────────────────────────────────────────────────────────
const STRATEGY_OPTIONS = [
  { value: 'even_odd', label: 'Even/Odd' },
  { value: 'over_under', label: 'Over/Under' },
  { value: 'matches', label: 'Matches' },
  { value: 'differs', label: 'Differs' },
  { value: 'rise_fall', label: 'Rise/Fall' },
  { value: 'pro_even_odd', label: 'Pro E/O' },
  { value: 'pro_over_under', label: 'Pro O/U' },
  { value: 'pro_differs', label: 'Pro Diff' },
  { value: 'under_7', label: 'Under 7' },
  { value: 'over_2', label: 'Over 2' },
  { value: 'super', label: 'Super' },
];

const mapAltTradeType = (tradeTypeId: string): {
  purchaseType: string; entryOp: string; entryThreshold: number;
  prediction: number; tradeTypeCat: string; tradeType: string; hasPrediction: boolean;
} => {
  switch (tradeTypeId) {
    case 'even_odd':
      return { purchaseType: 'DIGITEVEN', entryOp: 'EQ', entryThreshold: 1, prediction: 0, tradeTypeCat: 'digits', tradeType: 'evenodd', hasPrediction: false };
    case 'over_under':
      return { purchaseType: 'DIGITOVER', entryOp: 'LTE', entryThreshold: 2, prediction: 2, tradeTypeCat: 'digits', tradeType: 'overunder', hasPrediction: true };
    case 'matches':
      return { purchaseType: 'DIGITMATCH', entryOp: 'EQ', entryThreshold: 5, prediction: 5, tradeTypeCat: 'digits', tradeType: 'matchesdiffers', hasPrediction: true };
    case 'differs':
      return { purchaseType: 'DIGITDIFF', entryOp: 'NEQ', entryThreshold: 5, prediction: 5, tradeTypeCat: 'digits', tradeType: 'matchesdiffers', hasPrediction: true };
    case 'rise_fall':
      return { purchaseType: 'CALL', entryOp: 'GTE', entryThreshold: 5, prediction: 0, tradeTypeCat: 'callput', tradeType: 'risefall', hasPrediction: false };
    default:
      return { purchaseType: 'DIGITEVEN', entryOp: 'EQ', entryThreshold: 1, prediction: 0, tradeTypeCat: 'digits', tradeType: 'evenodd', hasPrediction: false };
  }
};

// ─── XML Bot Generator ─────────────────────────────────────────────────────────
function generateBotXML(opts: {
  stake: string;
  takeProfit: string;
  stopLoss: string;
  martingale: string;
  symbol: string;
  tradeTypeLabel: string;
  bestSignal: any;
  entryDigit?: number;
  recovery?: { lossThreshold: number; altTradeTypeId: string };
}): string {
  const { stake, takeProfit, stopLoss, martingale, symbol, tradeTypeLabel, bestSignal, entryDigit, recovery } = opts;

  let tradeTypeCat = 'digits';
  let tradeType = 'overunder';
  let predictionNum = 7;
  let underDigitNum = 7;
  let overDigitNum = 2;
  let singleMode = false;
  let singlePurchaseType = 'DIGITUNDER';
  let singleEntryOp = 'GTE';
  let singleEntryThreshold = 6;
  let singlePrediction = 7;

  if (bestSignal) {
    const dir = (bestSignal.tradeDirection ?? '').toUpperCase();
    const overMatch = dir.match(/^OVER\s+(\d+)$/);
    const underMatch = dir.match(/^UNDER\s+(\d+)$/);
    const matchesMatch = dir.match(/^MATCHES\s+(\d+)$/);
    const differsMatch = dir.match(/^DIFFERS\s+(\d+)$/);

    if (underMatch) {
      const underDigit = parseInt(underMatch[1], 10);
      tradeTypeCat = 'digits'; tradeType = 'overunder';
      singleMode = true; singlePurchaseType = 'DIGITUNDER';
      singlePrediction = underDigit;
      singleEntryOp = 'GTE'; singleEntryThreshold = underDigit;
    } else if (overMatch) {
      const overDigit = parseInt(overMatch[1], 10);
      tradeTypeCat = 'digits'; tradeType = 'overunder';
      singleMode = true; singlePurchaseType = 'DIGITOVER';
      singlePrediction = overDigit;
      singleEntryOp = 'LTE'; singleEntryThreshold = overDigit;
    } else if (dir === 'EVEN') {
      tradeTypeCat = 'digits'; tradeType = 'evenodd';
      singleMode = true; singlePurchaseType = 'DIGITEVEN';
      singlePrediction = 0; singleEntryOp = 'EQ'; singleEntryThreshold = 1;
    } else if (dir === 'ODD') {
      tradeTypeCat = 'digits'; tradeType = 'evenodd';
      singleMode = true; singlePurchaseType = 'DIGITODD';
      singlePrediction = 0; singleEntryOp = 'EQ'; singleEntryThreshold = 0;
    } else if (matchesMatch) {
      const matchDigit = parseInt(matchesMatch[1], 10);
      tradeTypeCat = 'digits'; tradeType = 'matchesdiffers';
      singleMode = true; singlePurchaseType = 'DIGITMATCH';
      singlePrediction = matchDigit; singleEntryOp = 'EQ'; singleEntryThreshold = matchDigit;
    } else if (differsMatch) {
      const differsDigit = parseInt(differsMatch[1], 10);
      tradeTypeCat = 'digits'; tradeType = 'matchesdiffers';
      singleMode = true; singlePurchaseType = 'DIGITDIFF';
      singlePrediction = differsDigit; singleEntryOp = 'NEQ'; singleEntryThreshold = differsDigit;
    } else if (dir === 'RISE') {
      tradeTypeCat = 'callput'; tradeType = 'risefall';
      singleMode = true; singlePurchaseType = 'CALL';
      singlePrediction = 0; singleEntryOp = 'GTE'; singleEntryThreshold = 5;
    } else if (dir === 'FALL') {
      tradeTypeCat = 'callput'; tradeType = 'risefall';
      singleMode = true; singlePurchaseType = 'PUT';
      singlePrediction = 0; singleEntryOp = 'LTE'; singleEntryThreshold = 4;
    }

    if (entryDigit !== undefined) {
      if (overMatch || underMatch) {
        singlePrediction = entryDigit;
        if (overMatch) { singleEntryOp = 'LTE'; singleEntryThreshold = entryDigit; }
        else { singleEntryOp = 'GTE'; singleEntryThreshold = entryDigit; }
      } else if (matchesMatch || differsMatch) {
        singlePrediction = entryDigit;
        singleEntryThreshold = entryDigit;
      }
    }
  } else {
    // Fallback manual configurations
    singleMode = true;
    const strategy = tradeTypeLabel.toLowerCase();
    if (strategy.includes('over_under') || strategy.includes('under_7')) {
      tradeTypeCat = 'digits'; tradeType = 'overunder';
      singlePurchaseType = 'DIGITUNDER';
      singlePrediction = entryDigit ?? 7;
      singleEntryOp = 'GTE';
      singleEntryThreshold = singlePrediction;
    } else if (strategy.includes('over_2')) {
      tradeTypeCat = 'digits'; tradeType = 'overunder';
      singlePurchaseType = 'DIGITOVER';
      singlePrediction = entryDigit ?? 2;
      singleEntryOp = 'LTE';
      singleEntryThreshold = singlePrediction;
    } else if (strategy.includes('even_odd')) {
      tradeTypeCat = 'digits'; tradeType = 'evenodd';
      singlePurchaseType = 'DIGITEVEN';
      singlePrediction = 0;
      singleEntryOp = 'EQ';
      singleEntryThreshold = 1;
    } else if (strategy.includes('matches')) {
      tradeTypeCat = 'digits'; tradeType = 'matchesdiffers';
      singlePurchaseType = 'DIGITMATCH';
      singlePrediction = entryDigit ?? 5;
      singleEntryOp = 'EQ';
      singleEntryThreshold = singlePrediction;
    } else if (strategy.includes('differs')) {
      tradeTypeCat = 'digits'; tradeType = 'matchesdiffers';
      singlePurchaseType = 'DIGITDIFF';
      singlePrediction = entryDigit ?? 5;
      singleEntryOp = 'NEQ';
      singleEntryThreshold = singlePrediction;
    } else if (strategy.includes('rise_fall')) {
      tradeTypeCat = 'callput'; tradeType = 'risefall';
      singlePurchaseType = 'CALL';
      singlePrediction = 0;
      singleEntryOp = 'GTE';
      singleEntryThreshold = 5;
    }
  }

  const noPredictionTypes = ['CALL', 'PUT', 'DIGITEVEN', 'DIGITODD'];
  const hasPrediction = singleMode ? !noPredictionTypes.includes(singlePurchaseType) : true;
  const predVal = singleMode ? singlePrediction : predictionNum;

  const isEvenOddParity = singlePurchaseType === 'DIGITEVEN' || singlePurchaseType === 'DIGITODD';
  const parityRemainder = singlePurchaseType === 'DIGITEVEN' ? 1 : 0;

  const altMap = recovery ? mapAltTradeType(recovery.altTradeTypeId) : null;

  const altPurchaseXml = recovery && altMap ? `
      <block type="controls_if" id="bp_rec_if">
        <value name="IF0">
          <block type="variables_get" id="bp_rec_get">
            <field name="VAR" id="v_rec_mode">Recovery Mode</field>
          </block>
        </value>
        <statement name="DO0">
          <block type="purchase" id="bp_rec_pur">
            <field name="PURCHASE_LIST">${altMap.purchaseType}</field>
          </block>
        </statement>
        <statement name="ELSE">
          <block type="controls_if" id="bp_if1">
            <value name="IF0">
              <block type="logic_compare" id="bp_cmp1">
                <field name="OP">${isEvenOddParity ? 'EQ' : singleEntryOp}</field>
                <value name="A">
                  ${isEvenOddParity ? `<block type="math_arithmetic" id="bp_mod_arith">
                    <field name="OP">MODULO</field>
                    <value name="A">
                      <shadow type="math_number" id="bp_mod_a_sh"><field name="NUM">0</field></shadow>
                      <block type="last_digit" id="bp_ld1"></block>
                    </value>
                    <value name="B">
                      <shadow type="math_number" id="bp_mod_b_sh"><field name="NUM">2</field></shadow>
                      <block type="math_number" id="bp_mod_b"><field name="NUM">2</field></block>
                    </value>
                  </block>` : `<block type="last_digit" id="bp_ld1"></block>`}
                </value>
                <value name="B">
                  <block type="math_number" id="bp_mn1">
                    <field name="NUM">${isEvenOddParity ? parityRemainder : singleEntryThreshold}</field>
                  </block>
                </value>
              </block>
            </value>
            <statement name="DO0">
              <block type="purchase" id="bp_pur1">
                <field name="PURCHASE_LIST">${singlePurchaseType}</field>
              </block>
            </statement>
          </block>
        </statement>
      </block>` : '';

  const beforePurchaseStack = recovery
    ? altPurchaseXml
    : singleMode
      ? isEvenOddParity
        ? `
      <block type="controls_if" id="bp_if1">
        <value name="IF0">
          <block type="logic_compare" id="bp_cmp1">
            <field name="OP">EQ</field>
            <value name="A">
              <block type="math_arithmetic" id="bp_mod_arith">
                <field name="OP">MODULO</field>
                <value name="A">
                  <shadow type="math_number" id="bp_mod_a_sh"><field name="NUM">0</field></shadow>
                  <block type="last_digit" id="bp_ld1"></block>
                </value>
                <value name="B">
                  <shadow type="math_number" id="bp_mod_b_sh"><field name="NUM">2</field></shadow>
                  <block type="math_number" id="bp_mod_b"><field name="NUM">2</field></block>
                </value>
              </block>
            </value>
            <value name="B">
              <block type="math_number" id="bp_mn1">
                <field name="NUM">${parityRemainder}</field>
              </block>
            </value>
          </block>
        </value>
        <statement name="DO0">
          <block type="purchase" id="bp_pur1">
            <field name="PURCHASE_LIST">${singlePurchaseType}</field>
          </block>
        </statement>
      </block>`
        : `
      <block type="controls_if" id="bp_if1">
        <value name="IF0">
          <block type="logic_compare" id="bp_cmp1">
            <field name="OP">${singleEntryOp}</field>
            <value name="A">
              <block type="last_digit" id="bp_ld1"></block>
            </value>
            <value name="B">
              <block type="math_number" id="bp_mn1">
                <field name="NUM">${singleEntryThreshold}</field>
              </block>
            </value>
          </block>
        </value>
        <statement name="DO0">
          <block type="purchase" id="bp_pur1">
            <field name="PURCHASE_LIST">${singlePurchaseType}</field>
          </block>
        </statement>
      </block>`
      : `
      <block type="controls_if" id="bp_if1">
        <value name="IF0">
          <block type="logic_compare" id="bp_cmp1">
            <field name="OP">GTE</field>
            <value name="A">
              <block type="last_digit" id="bp_ld1"></block>
            </value>
            <value name="B">
              <block type="math_number" id="bp_mn1">
                <field name="NUM">0</field>
              </block>
            </value>
          </block>
        </value>
        <statement name="DO0">
          <block type="purchase" id="bp_pur1">
            <field name="PURCHASE_LIST">DIGITOVER</field>
          </block>
        </statement>
      </block>`;

  const recLossThreshold = recovery?.lossThreshold ?? 3;

  const winRecResetXml = recovery ? `
                        <next>
                          <block type="variables_set" id="ap_win_rec_rst">
                            <field name="VAR" id="v_rec_mode">Recovery Mode</field>
                            <value name="VALUE">
                              <block type="logic_boolean" id="lb_win_rec">
                                <field name="BOOL">FALSE</field>
                              </block>
                            </value>` : '';

  const winRecCloseXml = recovery ? `
                          </block>
                        </next>` : '';

  const lossRecCheckXml = recovery ? `
                        <next>
                          <block type="controls_if" id="ap_loss_rec_chk">
                            <value name="IF0">
                              <block type="logic_compare" id="ap_loss_rec_cmp">
                                <field name="OP">GTE</field>
                                <value name="A">
                                  <block type="variables_get" id="ap_loss_lc_get">
                                    <field name="VAR" id="v_loss_cnt">Loss Count</field>
                                  </block>
                                </value>
                                <value name="B">
                                  <block type="math_number" id="ap_loss_thresh">
                                    <field name="NUM">${recLossThreshold}</field>
                                  </block>
                                </value>
                              </block>
                            </value>
                            <statement name="DO0">
                              <block type="variables_set" id="ap_loss_rec_set">
                                <field name="VAR" id="v_rec_mode">Recovery Mode</field>
                                <value name="VALUE">
                                  <block type="logic_boolean" id="lb_loss_rec">
                                    <field name="BOOL">TRUE</field>
                                  </block>
                                </value>
                              </block>
                            </statement>` : '';

  const lossRecCloseXml = recovery ? `
                          </block>
                        </next>` : '';

  const afterPurchaseWinLoss = singleMode
    ? `
              <block type="controls_if" id="ap_wl">
                <mutation xmlns="http://www.w3.org/1999/xhtml" else="1"></mutation>
                <value name="IF0">
                  <block type="contract_check_result" id="ap_win_chk">
                    <field name="CHECK_RESULT">win</field>
                  </block>
                </value>
                <statement name="DO0">
                  <block type="variables_set" id="ap_win_rs">
                    <field name="VAR" id="v_stake">Stake</field>
                    <value name="VALUE">
                      <block type="variables_get" id="ap_win_init">
                        <field name="VAR" id="v_init_stake">Initial Stake</field>
                      </block>
                    </value>
                    <next>
                      <block type="variables_set" id="ap_win_lc">
                        <field name="VAR" id="v_loss_cnt">Loss Count</field>
                        <value name="VALUE">
                          <block type="math_number" id="ap_win_lc_zero">
                            <field name="NUM">0</field>
                          </block>
                        </value>${winRecResetXml}
                        <next>
                          <block type="trade_again" id="ap_win_ta"></block>
                        </next>
                      </block>${winRecCloseXml}
                    </next>
                  </block>
                </statement>
                <statement name="ELSE">
                  <block type="variables_set" id="ap_loss_mg">
                    <field name="VAR" id="v_stake">Stake</field>
                    <value name="VALUE">
                      <block type="math_arithmetic" id="ap_mg_arith">
                        <field name="OP">MULTIPLY</field>
                        <value name="A">
                          <shadow type="math_number" id="ap_mg_a_sh">
                            <field name="NUM">1</field>
                          </shadow>
                          <block type="variables_get" id="ap_mg_stake_get">
                            <field name="VAR" id="v_stake">Stake</field>
                          </block>
                        </value>
                        <value name="B">
                          <shadow type="math_number" id="ap_mg_b_sh">
                            <field name="NUM">2</field>
                          </shadow>
                          <block type="variables_get" id="ap_mg_get">
                            <field name="VAR" id="v_mg">Martingale</field>
                          </block>
                        </value>
                      </block>
                    </value>
                    <next>
                      <block type="math_change" id="ap_loss_lc_inc">
                        <field name="VAR" id="v_loss_cnt">Loss Count</field>
                        <value name="DELTA">
                          <shadow type="math_number" id="ap_lc_delta">
                            <field name="NUM">1</field>
                          </shadow>
                        </value>${lossRecCheckXml}
                        <next>
                          <block type="trade_again" id="ap_loss_ta"></block>
                        </next>
                      </block>${lossRecCloseXml}
                    </next>
                  </block>
                </statement>
              </block>`
    : `
              <block type="controls_if" id="ap_wl">
                <mutation xmlns="http://www.w3.org/1999/xhtml" else="1"></mutation>
                <value name="IF0">
                  <block type="contract_check_result" id="ap_win_chk">
                    <field name="CHECK_RESULT">win</field>
                  </block>
                </value>
                <statement name="DO0">
                  <block type="variables_set" id="ap_win_rs">
                    <field name="VAR" id="v_stake">Stake</field>
                    <value name="VALUE">
                      <block type="variables_get" id="ap_win_init">
                        <field name="VAR" id="v_init_stake">Initial Stake</field>
                      </block>
                    </value>
                    <next>
                      <block type="variables_set" id="ap_win_lc">
                        <field name="VAR" id="v_loss_cnt">Loss Count</field>
                        <value name="VALUE">
                          <block type="math_number" id="ap_win_lc_zero">
                            <field name="NUM">0</field>
                          </block>
                        </value>${winRecResetXml}
                        <next>
                          <block type="trade_again" id="ap_win_ta"></block>
                        </next>
                      </block>${winRecCloseXml}
                    </next>
                  </block>
                </statement>
                <statement name="ELSE">
                  <block type="variables_set" id="ap_loss_mg">
                    <field name="VAR" id="v_stake">Stake</field>
                    <value name="VALUE">
                      <block type="math_arithmetic" id="ap_mg_arith">
                        <field name="OP">MULTIPLY</field>
                        <value name="A">
                          <shadow type="math_number" id="ap_mg_a_sh">
                            <field name="NUM">1</field>
                          </shadow>
                          <block type="variables_get" id="ap_mg_stake_get">
                            <field name="VAR" id="v_stake">Stake</field>
                          </block>
                        </value>
                        <value name="B">
                          <shadow type="math_number" id="ap_mg_b_sh">
                            <field name="NUM">2</field>
                          </shadow>
                          <block type="variables_get" id="ap_mg_get">
                            <field name="VAR" id="v_mg">Martingale</field>
                          </block>
                        </value>
                      </block>
                    </value>
                    <next>
                      <block type="math_change" id="ap_loss_lc_inc">
                        <field name="VAR" id="v_loss_cnt">Loss Count</field>
                        <value name="DELTA">
                          <shadow type="math_number" id="ap_lc_delta">
                            <field name="NUM">1</field>
                          </shadow>
                        </value>${lossRecCheckXml}
                        <next>
                          <block type="trade_again" id="ap_loss_ta"></block>
                        </next>
                      </block>${lossRecCloseXml}
                    </next>
                  </block>
                </statement>
              </block>`;

  const extraVars = singleMode
    ? ''
    : `
    <variable id="v_pred">Prediction</variable>
    <variable id="v_under_digit">Under Digit</variable>
    <variable id="v_over_digit">Over Digit</variable>`;

  const recoveryInitXml = recovery ? `
                                <next>
                                  <block type="variables_set" id="vs_rec_mode">
                                    <field name="VAR" id="v_rec_mode">Recovery Mode</field>
                                    <value name="VALUE">
                                      <block type="logic_boolean" id="lb_rec_mode">
                                        <field name="BOOL">FALSE</field>
                                      </block>
                                    </value>
                                  </block>
                                </next>` : '';

  const extraInit = singleMode
    ? recovery ? `
                        <next>
                          <block type="variables_set" id="vs_rec_mode">
                            <field name="VAR" id="v_rec_mode">Recovery Mode</field>
                            <value name="VALUE">
                              <block type="logic_boolean" id="lb_rec_mode">
                                <field name="BOOL">FALSE</field>
                              </block>
                            </value>
                          </block>
                        </next>` : ''
    : `
                        <next>
                          <block type="variables_set" id="vs_under">
                            <field name="VAR" id="v_under_digit">Under Digit</field>
                            <value name="VALUE">
                              <block type="math_number" id="mn_under">
                                <field name="NUM">${underDigitNum}</field>
                              </block>
                            </value>
                            <next>
                              <block type="variables_set" id="vs_over">
                                <field name="VAR" id="v_over_digit">Over Digit</field>
                                <value name="VALUE">
                                  <block type="math_number" id="mn_over">
                                    <field name="NUM">${overDigitNum}</field>
                                  </block>
                                </value>
                                <next>
                                  <block type="variables_set" id="vs_pred">
                                    <field name="VAR" id="v_pred">Prediction</field>
                                    <value name="VALUE">
                                      <block type="variables_get" id="vg_under_init">
                                        <field name="VAR" id="v_under_digit">Under Digit</field>
                                      </block>
                                    </value>${recoveryInitXml}
                                  </block>
                                </next>
                              </block>
                            </next>
                          </block>
                        </next>`;

  const predictionBlock = hasPrediction
    ? `
        <value name="PREDICTION">
          <block type="math_number_positive" id="pred_block">
            <field name="NUM">${predVal}</field>
          </block>
        </value>`
    : '';

  return `<xml xmlns="https://developers.google.com/blockly/xml" is_dbot="true" collection="false">
  <variables>
    <variable id="v_stake">Stake</variable>
    <variable id="v_init_stake">Initial Stake</variable>
    <variable id="v_tp">Take Profit</variable>
    <variable id="v_sl">Stop Loss</variable>
    <variable id="v_mg">Martingale</variable>
    <variable id="v_loss_cnt">Loss Count</variable>
    <variable id="v_rec_mode">Recovery Mode</variable>${extraVars}
  </variables>

  <block type="trade_definition" id="td_main" deletable="false" x="0" y="60">
    <statement name="TRADE_OPTIONS">
      <block type="trade_definition_market" id="tdm1" deletable="false" movable="false">
        <field name="MARKET_LIST">synthetic_index</field>
        <field name="SUBMARKET_LIST">random_index</field>
        <field name="SYMBOL_LIST">${symbol}</field>
        <next>
          <block type="trade_definition_tradetype" id="tdt1" deletable="false" movable="false">
            <field name="TRADETYPECAT_LIST">${tradeTypeCat}</field>
            <field name="TRADETYPE_LIST">${tradeType}</field>
            <next>
              <block type="trade_definition_contracttype" id="tdct1" deletable="false" movable="false">
                <field name="TYPE_LIST">${singlePurchaseType === 'DIGITMATCH' ? 'DIGITMATCH' : singlePurchaseType === 'DIGITDIFF' ? 'DIGITDIFF' : 'both'}</field>
                <next>
                  <block type="trade_definition_candleinterval" id="tdci1" deletable="false" movable="false">
                    <field name="CANDLEINTERVAL_LIST">60</field>
                    <next>
                      <block type="trade_definition_restartbuysell" id="tdrbs1" deletable="false" movable="false">
                        <field name="TIME_MACHINE_ENABLED">FALSE</field>
                        <next>
                          <block type="trade_definition_restartonerror" id="tdroe1" deletable="false" movable="false">
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

    <statement name="INITIALIZATION">
      <block type="variables_set" id="vs_stake">
        <field name="VAR" id="v_stake">Stake</field>
        <value name="VALUE">
          <block type="math_number" id="mn_stake">
            <field name="NUM">${stake}</field>
          </block>
        </value>
        <next>
          <block type="variables_set" id="vs_init_stake">
            <field name="VAR" id="v_init_stake">Initial Stake</field>
            <value name="VALUE">
              <block type="math_number" id="mn_init">
                <field name="NUM">${stake}</field>
              </block>
            </value>
            <next>
              <block type="variables_set" id="vs_tp">
                <field name="VAR" id="v_tp">Take Profit</field>
                <value name="VALUE">
                  <block type="math_number" id="mn_tp">
                    <field name="NUM">${takeProfit}</field>
                  </block>
                </value>
                <next>
                  <block type="variables_set" id="vs_sl">
                    <field name="VAR" id="v_sl">Stop Loss</field>
                    <value name="VALUE">
                      <block type="math_number" id="mn_sl">
                        <field name="NUM">${stopLoss}</field>
                      </block>
                    </value>
                    <next>
                      <block type="variables_set" id="vs_mg">
                        <field name="VAR" id="v_mg">Martingale</field>
                        <value name="VALUE">
                          <block type="math_number" id="mn_mg">
                            <field name="NUM">${martingale}</field>
                          </block>
                        </value>
                        <next>
                          <block type="variables_set" id="vs_loss_cnt">
                            <field name="VAR" id="v_loss_cnt">Loss Count</field>
                            <value name="VALUE">
                              <block type="math_number" id="mn_lc">
                                <field name="NUM">0</field>
                              </block>
                            </value>${extraInit}
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
      <block type="trade_definition_tradeoptions" id="tdto1">
        <mutation xmlns="http://www.w3.org/1999/xhtml" has_first_barrier="false" has_second_barrier="false" has_prediction="${hasPrediction}"></mutation>
        <field name="DURATIONTYPE_LIST">t</field>
        <value name="DURATION">
          <shadow type="math_number_positive" id="dur1">
            <field name="NUM">1</field>
          </shadow>
        </value>
        <value name="AMOUNT">
          <shadow type="math_number_positive" id="amt1">
            <field name="NUM">${stake}</field>
          </shadow>
          <block type="variables_get" id="vg_stake_sub">
            <field name="VAR" id="v_stake">Stake</field>
          </block>
        </value>${predictionBlock}
      </block>
    </statement>
  </block>

  <block type="before_purchase" id="bp1" deletable="false" x="0" y="900">
    <statement name="BEFOREPURCHASE_STACK">
      ${beforePurchaseStack}
    </statement>
  </block>

  <block type="after_purchase" id="ap1" collapsed="true" x="900" y="60">
    <statement name="AFTERPURCHASE_STACK">
      <block type="controls_if" id="ap_if_tp_sl">
        <mutation xmlns="http://www.w3.org/1999/xhtml" elseif="1" else="1"></mutation>

        <value name="IF0">
          <block type="logic_compare" id="ap_cmp_tp">
            <field name="OP">GTE</field>
            <value name="A">
              <block type="total_profit" id="ap_tp_val"></block>
            </value>
            <value name="B">
              <block type="variables_get" id="ap_vg_tp">
                <field name="VAR" id="v_tp">Take Profit</field>
              </block>
            </value>
          </block>
        </value>
        <statement name="DO0">
          <block type="text_print" id="ap_tp_msg">
            <value name="TEXT">
              <shadow type="text" id="ap_tp_shadow">
                <field name="TEXT">Pro AI ${tradeTypeLabel}: Take Profit Hit!</field>
              </shadow>
            </value>
          </block>
        </statement>

        <value name="IF1">
          <block type="logic_compare" id="ap_cmp_sl">
            <field name="OP">GTE</field>
            <value name="A">
              <block type="variables_get" id="ap_vg_lc">
                <field name="VAR" id="v_loss_cnt">Loss Count</field>
              </block>
            </value>
            <value name="B">
              <block type="variables_get" id="ap_vg_sl">
                <field name="VAR" id="v_sl">Stop Loss</field>
              </block>
            </value>
          </block>
        </value>
        <statement name="DO1">
          <block type="text_print" id="ap_sl_msg">
            <value name="TEXT">
              <shadow type="text" id="ap_sl_shadow">
                <field name="TEXT">Pro AI ${tradeTypeLabel}: Stop Loss Reached.</field>
              </shadow>
            </value>
          </block>
        </statement>

        <statement name="ELSE">
          ${afterPurchaseWinLoss}
        </statement>
      </block>
    </statement>
  </block>

</xml>`;
}

// ─── Adapter: Map TScanSignal to bestSignal structure expected by generateBotXML ───
const mapSignalToBestSignal = (sig: any) => {
  if (!sig) return null;
  const strat = sig.strategy;
  const targetDigit = sig.details.targetDigit;
  let tradeDirection = '';

  if (strat === 'even_odd' || strat === 'pro_even_odd' || strat === 'super') {
    const rec = sig.details.recommendation.toLowerCase();
    if (rec.includes('even')) tradeDirection = 'EVEN';
    else if (rec.includes('odd')) tradeDirection = 'ODD';
  } else if (strat === 'over_under' || strat === 'pro_over_under') {
    const bias = sig.details.signalDetails?.bias;
    const digit = targetDigit ?? 5;
    if (bias === 'high' || sig.details.recommendation.toLowerCase().includes('over')) {
      tradeDirection = `OVER ${digit}`;
    } else {
      tradeDirection = `UNDER ${digit}`;
    }
  } else if (strat === 'under_7') {
    tradeDirection = 'UNDER 7';
  } else if (strat === 'over_2') {
    tradeDirection = 'OVER 2';
  } else if (strat === 'matches') {
    tradeDirection = `MATCHES ${targetDigit ?? 5}`;
  } else if (strat === 'differs' || strat === 'pro_differs') {
    tradeDirection = `DIFFERS ${targetDigit ?? 5}`;
  } else if (strat === 'rise_fall') {
    const trend = sig.details.signalDetails?.trend || (sig.details.recommendation.toLowerCase().includes('rise') ? 'rise' : 'fall');
    tradeDirection = trend.toUpperCase();
  }

  return {
    ...sig.details,
    tradeDirection,
    targetDigit,
    entryDigits: targetDigit !== undefined ? [targetDigit] : [],
  };
};

// ─── Main Scanner Component ────────────────────────────────────────────────────
const Scanner = observer(() => {
  const store = useStore();
  const { scanner } = store;
  const {
    is_open, is_scanning, selected_symbols, current_signal,
    setScannerVisibility, setSelectedSymbols, startScanning, stopScanning,
    selected_strategies, scan_market_mode, single_market_symbol, single_market_price,
    single_market_last_digit, connection_status, ticks_counter,
    toggleStrategy, setScanMarketMode, setSingleMarketSymbol,
  } = scanner;

  // ── Local UI state ──
  const [available_symbols, setAvailableSymbols] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'scanner' | 'ai_automation' | 'stats' | 'dollarflipper'>('scanner');
  const [statsStrategy, setStatsStrategy] = useState<'even_odd' | 'over_under' | 'differs' | 'rise_fall' | 'matches'>('even_odd');

  // Prediction picker
  const [predictionChoice, setPredictionChoice] = useState<number | null>(null);

  // Recovery mode
  const [recMode, setRecMode] = useState(false);
  const [recLossThreshold, setRecLossThreshold] = useState('3');
  const [recAltType, setRecAltType] = useState('even_odd');

  // AI Full Automation Console inputs
  const [consoleMarket, setConsoleMarket] = useState('R_100');
  const [consoleTradeType, setConsoleTradeType] = useState('over_under');
  const [consoleEntryPoint, setConsoleEntryPoint] = useState<number | null>(null);



  // Load available symbols
  useEffect(() => {
    if (api_base.active_symbols && api_base.active_symbols.length > 0) {
      const symbols = api_base.active_symbols.filter((s: any) => {
        const sym = (s.symbol || s.underlying_symbol || '').toUpperCase();
        if (sym.includes('BOOM') || sym.includes('CRASH')) return false;
        if (sym.includes('1HZ15V') || sym.includes('1HZ30V') || sym.includes('1HZ90V')) return false;
        return sym.includes('1HZ') || sym.startsWith('R_') || sym.includes('JD') || sym.includes('JUMP');
      });
      const final = symbols.length > 0 ? symbols : api_base.active_symbols;
      setAvailableSymbols(final);
      if (selected_symbols.length === 0) {
        setSelectedSymbols(final.map((s: any) => s.symbol || s.underlying_symbol));
      }
    }
  }, []);

  // Auto-subscribe to single market ticks when modal opens or symbol changes
  useEffect(() => {
    if (is_open && single_market_symbol) {
      scanner.subscribeToSymbolTicks(single_market_symbol);
    }
  }, [is_open, single_market_symbol, scanner]);

  const displayPrice = single_market_price !== null
    ? single_market_price
    : (scanner.symbol_analysis[single_market_symbol]?.lastQuote ?? null);

  const displayDigit = single_market_last_digit !== null
    ? single_market_last_digit
    : (scanner.symbol_analysis[single_market_symbol]?.lastDigits?.slice(-1)[0] ?? null);

  // Sync prediction override to store
  useEffect(() => {
    (scanner as any).prediction_override = predictionChoice;
  }, [predictionChoice, scanner]);

  // Sync rec mode to store
  useEffect(() => {
    (scanner as any).rec_mode = recMode;
    (scanner as any).rec_loss_threshold = parseInt(recLossThreshold) || 3;
    (scanner as any).rec_alt_type = recAltType;
  }, [recMode, recLossThreshold, recAltType, scanner]);

  // Custom Bot Loader that loads generated XML directly into Blockly
  const handleLoadBot = async () => {
    const signalToUse = mapSignalToBestSignal(current_signal);
    const entryDigit = predictionChoice ?? signalToUse?.targetDigit ?? undefined;

    const strategyName = current_signal?.strategy || 'even_odd';
    const tradeTypeLabel = STRATEGY_OPTIONS.find(t => t.value === strategyName)?.label ?? strategyName;

    const recovery = recMode
      ? { lossThreshold: parseInt(recLossThreshold, 10) || 3, altTradeTypeId: recAltType }
      : undefined;

    const targetSymbol = current_signal?.symbol || single_market_symbol;

    const xml = generateBotXML({
      stake: scanner.stake.toString(),
      takeProfit: scanner.take_profit.toString(),
      stopLoss: scanner.stop_loss.toString(),
      martingale: scanner.martingale_multiplier.toString(),
      symbol: targetSymbol,
      tradeTypeLabel,
      bestSignal: signalToUse,
      entryDigit,
      recovery,
    });

    try {
      if (typeof window !== 'undefined' && window.Blockly?.derivWorkspace) {
        const name = `ProAI_${tradeTypeLabel.replace(/[\s/]/g, '_')}_${targetSymbol}`;
        const { load_modal, dashboard } = store;
        if (load_modal && dashboard) {
          await load_modal.loadStrategyToBuilder({
            id: name,
            name,
            xml,
            save_type: 'local',
            timestamp: Date.now(),
          });
          dashboard.setActiveTab(1); // Switched directly to Blockly Workspace tab
          return;
        }
      }
    } catch (e) {
      console.error('Failed to load strategy directly to Blockly workspace:', e);
    }
  };

  const handleLoadBotAndRun = async () => {
    await handleLoadBot();
    setTimeout(() => {
      store.run_panel.onRunButtonClick();
    }, 1000);
  };

  const handleLoadBotFromStats = (sym: any, strategy: string, statsData: any, analysis: any) => {
    const symbolKey = sym.symbol || sym.underlying_symbol;
    scanner.current_signal = {
      symbol: symbolKey,
      strategy: strategy as any,
      confidence: statsData.strength / 100,
      timestamp: Date.now(),
      details: {
        type: strategy as any,
        status: 'TRADE NOW',
        probability: statsData.strength / 100,
        recommendation: statsData.text,
        entryCondition: 'Manual trigger from stats tab',
        targetDigit: statsData.details.targetDigit,
        signalDetails: { bias: statsData.details.bias },
      },
      analysisResult: analysis,
    };
    scanner.is_manual_selection = true;
    handleLoadBot();
  };

  // Compute active analysis for Over/Under AI Automation tab
  const activeAnalysis = scanner.symbol_analysis[single_market_symbol] || scanner.symbol_analysis[current_signal?.symbol || 'R_100'];

  const underPct = activeAnalysis?.lowPercentage ?? 50;
  const overPct = activeAnalysis?.highPercentage ?? 50;
  const isUnderDominant = underPct >= overPct;

  const highestUnderDigit = (() => {
    if (!activeAnalysis) return 2;
    const underFreqs = activeAnalysis.digitFrequencies.filter(f => f.digit <= 4);
    underFreqs.sort((a, b) => b.count - a.count);
    return underFreqs[0]?.digit ?? 2;
  })();

  const highestOverDigit = (() => {
    if (!activeAnalysis) return 7;
    const overFreqs = activeAnalysis.digitFrequencies.filter(f => f.digit >= 5);
    overFreqs.sort((a, b) => b.count - a.count);
    return overFreqs[0]?.digit ?? 7;
  })();

  // Even/Odd metrics
  const evenPct = activeAnalysis?.evenPercentage ?? 50;
  const oddPct = activeAnalysis?.oddPercentage ?? 50;
  const isEvenDominant = evenPct >= oddPct;
  const evenOddDev = Math.abs(evenPct - oddPct);

  const highestEvenDigit = (() => {
    if (!activeAnalysis) return 2;
    const evens = activeAnalysis.digitFrequencies.filter(f => f.digit % 2 === 0);
    evens.sort((a, b) => b.count - a.count);
    return evens[0]?.digit ?? 2;
  })();

  const highestOddDigit = (() => {
    if (!activeAnalysis) return 7;
    const odds = activeAnalysis.digitFrequencies.filter(f => f.digit % 2 !== 0);
    odds.sort((a, b) => b.count - a.count);
    return odds[0]?.digit ?? 7;
  })();

  // Differs metrics
  const coldestDigitInfo = (() => {
    if (!activeAnalysis) return { digit: 4, pct: 4.2 };
    const sorted = [...activeAnalysis.digitFrequencies].sort((a, b) => a.percentage - b.percentage);
    return { digit: sorted[0].digit, pct: sorted[0].percentage };
  })();

  // Matches metrics
  const hottestDigitInfo = (() => {
    if (!activeAnalysis) return { digit: 7, pct: 18.5 };
    const sorted = [...activeAnalysis.digitFrequencies].sort((a, b) => b.percentage - a.percentage);
    return { digit: sorted[0].digit, pct: sorted[0].percentage };
  })();

  // Rise/Fall metrics
  const riseFallTrend = (() => {
    if (!activeAnalysis || !activeAnalysis.lastDigits || activeAnalysis.lastDigits.length < 10) {
      return { dir: 'RISE', pct: 62 };
    }
    const last10 = activeAnalysis.lastDigits.slice(-10);
    const trend = last10[last10.length - 1] - last10[0];
    const dir = trend >= 0 ? 'RISE' : 'FALL';
    const confidence = Math.min(60 + Math.abs(trend) * 10, 88);
    return { dir, pct: confidence };
  })();

  // Disturber digit detection
  const disturberDigit = (() => {
    if (!activeAnalysis || !activeAnalysis.lastDigits) return null;
    const last25 = activeAnalysis.lastDigits.slice(-25);
    if (isUnderDominant && underPct >= 55) {
      const overDigitsIn25 = last25.filter(d => d >= 5);
      if (overDigitsIn25.length >= 8) {
        const counts: Record<number, number> = {};
        overDigitsIn25.forEach(d => { counts[d] = (counts[d] || 0) + 1; });
        const maxDigit = Object.keys(counts).reduce((a, b) => counts[Number(a)] > counts[Number(b)] ? a : b, '7');
        return { digit: Number(maxDigit), side: 'Over' };
      }
    } else if (!isUnderDominant && overPct >= 55) {
      const underDigitsIn25 = last25.filter(d => d <= 4);
      if (underDigitsIn25.length >= 8) {
        const counts: Record<number, number> = {};
        underDigitsIn25.forEach(d => { counts[d] = (counts[d] || 0) + 1; });
        const maxDigit = Object.keys(counts).reduce((a, b) => counts[Number(a)] > counts[Number(b)] ? a : b, '2');
        return { digit: Number(maxDigit), side: 'Under' };
      }
    }
    return null;
  })();

  // Strong Signal condition check
  const isStrongSignal = (() => {
    if (!activeAnalysis) return false;
    const dominantPct = isUnderDominant ? underPct : overPct;
    if (dominantPct < 55) return false;
    const topDigitsOnSide = activeAnalysis.digitFrequencies
      .filter(f => isUnderDominant ? f.digit <= 4 : f.digit >= 5)
      .filter(f => f.percentage >= 12);
    return topDigitsOnSide.length >= 2;
  })();

  // Filter signals matching the selected strategy
  const activeSelectedStrategySignals = scanner.signals.filter(s => {
    if (!selected_strategies.length) return true;
    return selected_strategies.includes(s.strategy as any);
  });

  const autoDigit = (() => {
    if (current_signal?.details?.targetDigit !== undefined) return current_signal.details.targetDigit;
    const strat = current_signal?.strategy || '';
    if (strat === 'over_2') return 2;
    if (strat === 'under_7') return 7;
    return 5;
  })();

  const statusColor = (sig: any) => {
    const c = sig.confidence;
    if (c >= 0.9) return '#10b981';
    if (c >= 0.7) return '#f5c542';
    return '#64748b';
  };

  return (
    <React.Fragment>
      {is_open && (
        <DraggableResizeWrapper
          boundary=".main"
          header={
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', paddingRight: 10 }}>
              <span>{localize('AI Market Scanner')}</span>
              <span className={classNames('mhp-conn-badge', connection_status)}>
                <span className="mhp-conn-dot" />
                {connection_status === 'connected' ? 'LIVE' : connection_status.toUpperCase()}
              </span>
            </div>
          }
          onClose={setScannerVisibility}
          modalWidth={560}
          modalHeight={700}
          minWidth={360}
          minHeight={500}
          enableResizing
        >
          <div className="mhp-scanner">
            {/* ── Tab Bar ── */}
            <div className="mhp-tabs">
              <button
                className={classNames('mhp-tab', { active: activeTab === 'scanner' })}
                onClick={() => setActiveTab('scanner')}
              >
                {localize('Scanner')}
                {activeTab === 'scanner' && <span className="mhp-tab-indicator" />}
              </button>
              <button
                className={classNames('mhp-tab', { active: activeTab === 'stats' })}
                onClick={() => setActiveTab('stats')}
              >
                {localize('Stats')}
                {activeTab === 'stats' && <span className="mhp-tab-indicator" />}
              </button>
              <button
                className={classNames('mhp-tab', { active: activeTab === 'dollarflipper' })}
                onClick={() => setActiveTab('dollarflipper')}
              >
                {localize('Dollarflipper')}
                {activeTab === 'dollarflipper' && <span className="mhp-tab-indicator" />}
              </button>
            </div>

            {/* ── Scrollable Body ── */}
            <div className="mhp-body">

              {/* ═══════════ SUBTAB 1: SCANNER ═══════════ */}
              {activeTab === 'scanner' && (
                <React.Fragment>
                  {/* Market Selection */}
                  <div className="mhp-card">
                    <div className="mhp-card-header">
                      <span className="mhp-card-title">{localize('Markets')}</span>
                      <div className="mhp-mode-toggle">
                        <button className={classNames('mhp-mode-btn', { active: scan_market_mode === 'multi' })} onClick={() => setScanMarketMode('multi')}>
                          {localize('All Markets')}
                        </button>
                        <button className={classNames('mhp-mode-btn', { active: scan_market_mode === 'single' })} onClick={() => setScanMarketMode('single')}>
                          {localize('Single')}
                        </button>
                      </div>
                    </div>
                    {scan_market_mode === 'single' ? (
                      <React.Fragment>
                        <select
                          className="mhp-select"
                          value={single_market_symbol}
                          onChange={e => setSingleMarketSymbol(e.target.value)}
                        >
                          {available_symbols.map((sym: any) => (
                            <option key={sym.symbol || sym.underlying_symbol} value={sym.symbol || sym.underlying_symbol}>
                              {sym.display_name}
                            </option>
                          ))}
                        </select>
                        <div className="mhp-single-price-box">
                          <div>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', display: 'block' }}>Market Price</span>
                            <span className="mhp-single-price">
                              {displayPrice !== null ? Number(displayPrice).toFixed(single_market_symbol.includes('1HZ') ? 2 : 4) : 'Loading...'}
                            </span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', display: 'block' }}>Last Digit</span>
                            <span className="mhp-single-digit">
                              {displayDigit !== null ? displayDigit : '-'}
                            </span>
                          </div>
                        </div>
                      </React.Fragment>
                    ) : (
                      <p className="mhp-info-text">{localize('Scanning all volatility indices and jump markets')}</p>
                    )}
                  </div>

                  {/* Single Line Strategy Buttons */}
                  <div className="mhp-card">
                    <span className="mhp-card-title" style={{ marginBottom: 8, display: 'block' }}>
                      {localize('Select Strategy')}
                    </span>
                    <div className="mhp-strategy-line">
                      {[
                        { key: 'even_odd', label: 'Even/Odd' },
                        { key: 'over_under', label: 'Over/Under' },
                        { key: 'differs', label: 'Differs' },
                        { key: 'matches', label: 'Matches' },
                        { key: 'rise_fall', label: 'Rise/Fall' },
                      ].map(opt => {
                        const isSelected = selected_strategies.includes(opt.key as any);
                        return (
                          <button
                            key={opt.key}
                            className={classNames('mhp-strategy-chip-single', { active: isSelected })}
                            onClick={() => toggleStrategy(opt.key as any)}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Trade Config */}
                  <div className="mhp-card">
                    <span className="mhp-card-title" style={{ marginBottom: 8, display: 'block' }}>
                      {localize('Trade Configuration')}
                    </span>
                    <div className="mhp-grid-2">
                      <div>
                        <label className="mhp-label">{localize('Stake ($)')}</label>
                        <input type="number" className="mhp-input" value={scanner.stake}
                          onChange={e => { scanner.stake = parseFloat(e.target.value) || 0; }} />
                      </div>
                      <div>
                        <label className="mhp-label">{localize('Martingale x')}</label>
                        <input type="number" step="0.1" className="mhp-input" value={scanner.martingale_multiplier}
                          onChange={e => { scanner.martingale_multiplier = parseFloat(e.target.value) || 0; }} />
                      </div>
                      <div>
                        <label className="mhp-label">{localize('Take Profit ($)')}</label>
                        <input type="number" className="mhp-input" value={scanner.take_profit}
                          onChange={e => { scanner.take_profit = parseFloat(e.target.value) || 0; }} />
                      </div>
                      <div>
                        <label className="mhp-label">{localize('Stop Loss (losses)')}</label>
                        <input type="number" className="mhp-input" value={scanner.stop_loss}
                          onChange={e => { scanner.stop_loss = parseFloat(e.target.value) || 0; }} />
                      </div>
                    </div>
                  </div>

                  {/* Suggestive Over/Under Predictions Picker */}
                  {selected_strategies.includes('over_under') && (
                    <div className="mhp-card mhp-pred-card">
                      <div className="mhp-pred-header">
                        <span className="mhp-card-title">🎯 {localize('Over/Under Suggestive Predictions')}</span>
                        <span className="mhp-pred-auto">
                          {predictionChoice !== null ? `Digit ${predictionChoice}` : `Auto AI: ${autoDigit}`}
                        </span>
                      </div>
                      <div className="mhp-digit-grid">
                        {[1, 2, 3, 6, 7, 8].map(d => (
                          <button
                            key={d}
                            className={classNames('mhp-digit-btn', {
                              selected: predictionChoice === d,
                              auto: autoDigit === d && predictionChoice === null,
                            })}
                            onClick={() => setPredictionChoice(predictionChoice === d ? null : d)}
                          >
                            <span className="mhp-digit-lbl">
                              {d <= 3 ? 'OVER' : 'UNDER'}
                            </span>
                            <span className="mhp-digit-num">{d}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recovery Mode */}
                  <div className={classNames('mhp-card mhp-rec-card', { active: recMode })}>
                    <button className="mhp-rec-toggle" onClick={() => setRecMode(v => !v)}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>🔄</span>
                        <span>{localize('Alternate / Recovery Entry Mode')}</span>
                        {recMode && <span className="mhp-rec-badge">{localize('ON')}</span>}
                      </span>
                      <span className={classNames('mhp-chevron', { open: recMode })}>▾</span>
                    </button>
                    {recMode && (
                      <div className="mhp-rec-body">
                        <div className="mhp-rec-row">
                          <label className="mhp-label">{localize('Trigger after losses')}</label>
                          <input
                            type="number" min={1} max={10}
                            value={recLossThreshold}
                            onChange={e => setRecLossThreshold(e.target.value)}
                            className="mhp-input mhp-input-sm"
                          />
                        </div>
                        <div className="mhp-rec-row">
                          <label className="mhp-label">{localize('Recovery Strategy')}</label>
                          <select
                            className="mhp-select"
                            value={recAltType}
                            onChange={e => setRecAltType(e.target.value)}
                          >
                            {STRATEGY_OPTIONS.map(s => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <input
                            type="checkbox"
                            id="auto_switch_chk"
                            checked={scanner.auto_switch_markets}
                            onChange={e => { scanner.auto_switch_markets = e.target.checked; }}
                          />
                          <label htmlFor="auto_switch_chk" style={{ fontSize: 11, color: '#cbd5e1', cursor: 'pointer' }}>
                            {localize('Auto Switch Markets on Recovery')}
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Scan Progress */}
                  <div className="mhp-card mhp-progress-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className={classNames('mhp-dot', { scanning: is_scanning })} />
                      <span style={{ fontSize: 12, fontWeight: 700 }}>
                        {is_scanning
                          ? `${localize('Scanning All Markets')}... (${ticks_counter}/25)`
                          : localize('Ready to scan')}
                      </span>
                    </div>
                    <div className="mhp-progress-bg">
                      <div className="mhp-progress-fill" style={{ width: is_scanning ? `${(ticks_counter / 25) * 100}%` : '0%' }} />
                    </div>
                  </div>

                  {/* Active Signals Card (Increased Size) */}
                  <div className="mhp-card mhp-signals-card" style={{ minHeight: 220 }}>
                    <span className="mhp-card-title" style={{ marginBottom: 8, display: 'block' }}>
                      {localize('Active Signals')} ({selected_strategies.join(', ').toUpperCase() || 'ALL'})
                      {activeSelectedStrategySignals.length > 0 && (
                        <span className="mhp-signal-count">{activeSelectedStrategySignals.length}</span>
                      )}
                    </span>
                    {activeSelectedStrategySignals.length === 0 ? (
                      <div className="mhp-empty-signals" style={{ padding: '24px 0' }}>
                        <div className="mhp-empty-icon" style={{ fontSize: 24 }}>⚡</div>
                        <p>{is_scanning ? localize('Scanning markets for strategy signals...') : localize('Click Scan to detect high-probability signals')}</p>
                      </div>
                    ) : (
                      <div className="mhp-signals-list">
                        {activeSelectedStrategySignals.map((sig, idx) => {
                          const isSelected = current_signal && current_signal.symbol === sig.symbol && current_signal.strategy === sig.strategy;
                          const isStrong = sig.confidence >= 0.9;
                          const color = statusColor(sig);
                          return (
                            <div
                              key={idx}
                              className={classNames('mhp-signal-row', { selected: isSelected, strong: isStrong })}
                              onClick={() => {
                                scanner.current_signal = sig;
                                scanner.is_manual_selection = true;
                              }}
                            >
                              <div className="mhp-signal-rank" style={{
                                background: idx === 0 ? 'linear-gradient(135deg,#f5c542,#e67e22)' : idx === 1 ? 'linear-gradient(135deg,#0ea5e9,#6366f1)' : 'rgba(148,163,184,0.3)'
                              }}>
                                {idx + 1}
                              </div>
                              <div className="mhp-signal-info">
                                <div className="mhp-signal-header">
                                  <span className="mhp-signal-symbol">{sig.symbol}</span>
                                  <span className="mhp-signal-strategy">{sig.strategy.replace(/_/g, ' ').toUpperCase()}</span>
                                  <span className="mhp-signal-pct" style={{ color }}>
                                    {(sig.confidence * 100).toFixed(0)}%
                                  </span>
                                </div>
                                <p className="mhp-signal-rec">{sig.details.recommendation}</p>
                                <p className="mhp-signal-entry">{localize('Entry')}: {sig.details.entryCondition}</p>
                              </div>
                              {isSelected && <span className="mhp-selected-indicator">✓</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </React.Fragment>
              )}

              {/* ═══════════ SUBTAB 2: AI FULL AUTOMATION ═══════════ */}
              {activeTab === 'ai_automation' && (
                <React.Fragment>
                  {/* Automation Header Toggle */}
                  <div className={classNames('mhp-card mhp-automation-box', { active: scanner.is_full_ai_automation })} style={{ padding: 14 }}>
                    <div className="mhp-automation-header">
                      <span className="mhp-automation-title" style={{ fontSize: 13, fontWeight: 800 }}>🤖 {localize('AI FULL AUTOMATION ENGINE')}</span>
                      <button
                        className={classNames('mhp-auto-badge', { active: scanner.is_full_ai_automation })}
                        onClick={() => scanner.setFullAiAutomation(!scanner.is_full_ai_automation)}
                      >
                        {scanner.is_full_ai_automation ? localize('ACTIVATED') : localize('OFF')}
                      </button>
                    </div>
                    <p className="mhp-dim" style={{ fontSize: 10, marginTop: 4 }}>
                      {localize('Actively scans live market feeds, auto-switches best market, limits auto-trades to 4 runs max before re-analyzing conditions.')}
                    </p>
                  </div>

                  {/* Strategy Selection Chips Bar inside AI Automation */}
                  <div className="mhp-card" style={{ padding: '10px 12px' }}>
                    <span className="mhp-card-title" style={{ marginBottom: 6, display: 'block' }}>
                      {localize('Selected Strategy Analysis')}
                    </span>
                    <div className="mhp-strategy-line">
                      {[
                        { key: 'even_odd', label: 'Even/Odd' },
                        { key: 'over_under', label: 'Over/Under' },
                        { key: 'differs', label: 'Differs' },
                        { key: 'matches', label: 'Matches' },
                        { key: 'rise_fall', label: 'Rise/Fall' },
                      ].map(opt => (
                        <button
                          key={opt.key}
                          className={classNames('mhp-strategy-chip-single', { active: consoleTradeType === opt.key })}
                          onClick={() => {
                            setConsoleTradeType(opt.key);
                            scanner.setSelectedStrategy(opt.key as any);
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 1. OVER / UNDER DYNAMIC ANALYSIS */}
                  {consoleTradeType === 'over_under' && (
                    <React.Fragment>
                      <div className="mhp-ou-box">
                        <span className="mhp-card-title">📊 {localize('Over / Under Live Market Analysis')} ({single_market_symbol})</span>

                        <div className="mhp-ou-bar-container">
                          <div
                            className={classNames('mhp-ou-fill-under', { 'glowing-win': isUnderDominant && underPct >= 55 })}
                            style={{ width: `${underPct}%` }}
                          >
                            Under 0-4: {underPct.toFixed(0)}%
                          </div>
                          <div
                            className={classNames('mhp-ou-fill-over', { 'glowing-win': !isUnderDominant && overPct >= 55 })}
                            style={{ width: `${overPct}%` }}
                          >
                            Over 5-9: {overPct.toFixed(0)}%
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#cbd5e1' }}>
                          <span>Highest in Under: <strong style={{ color: '#60a5fa' }}>Digit {highestUnderDigit}</strong></span>
                          <span>Highest in Over: <strong style={{ color: '#34d399' }}>Digit {highestOverDigit}</strong></span>
                        </div>

                        {/* Disturber Warning Alert */}
                        {disturberDigit && (
                          <div className="mhp-disturber-warning">
                            <span>⚠️ WARNING:</span>
                            <span>
                              {disturberDigit.side} Digit <strong>{disturberDigit.digit}</strong> power is increasing in recent 25 ticks (disturbing trend).
                            </span>
                          </div>
                        )}

                        {/* Strong Signal Banner */}
                        {isStrongSignal && (
                          <div className="mhp-strong-signal-banner">
                            <span>⚡ STRONG {isUnderDominant ? 'UNDER' : 'OVER'} SIGNAL</span>
                            <span>{isUnderDominant ? underPct.toFixed(0) : overPct.toFixed(0)}% Dominance + Price Trend Aligned</span>
                          </div>
                        )}

                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                          💡 <strong>Tick Sync & Pattern Skip:</strong> Entry point triggers when Digit {isUnderDominant ? highestUnderDigit : highestOverDigit} appears. Recommended <strong>2 ticks skip</strong> to bypass opposite digit latency.
                        </div>
                      </div>

                      {/* Suggestive Over / Under Predictions */}
                      <div className="mhp-card">
                        <span className="mhp-card-title" style={{ marginBottom: 8, display: 'block' }}>
                          🎯 {localize('Suggestive Prediction Options')}
                        </span>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div style={{ background: 'rgba(59,130,246,0.1)', padding: 10, borderRadius: 8, border: '1px solid rgba(59,130,246,0.2)' }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: '#60a5fa', display: 'block', marginBottom: 6 }}>UNDER PREDICTIONS</span>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {[9, 8, 7, 6, 5].map(d => (
                                <button
                                  key={d}
                                  className={classNames('mhp-mode-btn', { active: consoleEntryPoint === d })}
                                  onClick={() => setConsoleEntryPoint(d)}
                                  style={{ flex: 1, padding: '4px 6px' }}
                                >
                                  U{d}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div style={{ background: 'rgba(16,185,129,0.1)', padding: 10, borderRadius: 8, border: '1px solid rgba(16,185,129,0.2)' }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: '#34d399', display: 'block', marginBottom: 6 }}>OVER PREDICTIONS</span>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {[0, 1, 2, 3, 4].map(d => (
                                <button
                                  key={d}
                                  className={classNames('mhp-mode-btn', { active: consoleEntryPoint === d })}
                                  onClick={() => setConsoleEntryPoint(d)}
                                  style={{ flex: 1, padding: '4px 6px' }}
                                >
                                  O{d}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  )}

                  {/* 2. EVEN / ODD DYNAMIC ANALYSIS */}
                  {consoleTradeType === 'even_odd' && (
                    <div className="mhp-ou-box">
                      <span className="mhp-card-title">📊 {localize('Even / Odd Live Market Analysis')} ({single_market_symbol})</span>

                      <div className="mhp-ou-bar-container">
                        <div
                          className={classNames('mhp-ou-fill-under', { 'glowing-win': isEvenDominant && evenOddDev >= 7 })}
                          style={{ width: `${evenPct}%`, background: 'linear-gradient(90deg, #3b82f6, #60a5fa)' }}
                        >
                          Even: {evenPct.toFixed(0)}%
                        </div>
                        <div
                          className={classNames('mhp-ou-fill-over', { 'glowing-win': !isEvenDominant && evenOddDev >= 7 })}
                          style={{ width: `${oddPct}%`, background: 'linear-gradient(90deg, #a855f7, #c084fc)', color: '#fff' }}
                        >
                          Odd: {oddPct.toFixed(0)}%
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#cbd5e1' }}>
                        <span>Highest Even Digit: <strong style={{ color: '#60a5fa' }}>Digit {highestEvenDigit}</strong></span>
                        <span>Highest Odd Digit: <strong style={{ color: '#c084fc' }}>Digit {highestOddDigit}</strong></span>
                      </div>

                      {/* Even/Odd Signal Condition Banner */}
                      {evenOddDev >= 7 ? (
                        <div className="mhp-strong-signal-banner">
                          <span>⚡ STRONG {isEvenDominant ? 'EVEN' : 'ODD'} SIGNAL</span>
                          <span>{isEvenDominant ? evenPct.toFixed(0) : oddPct.toFixed(0)}% Dominance ({evenOddDev.toFixed(0)}% Deviation ≥ 7%)</span>
                        </div>
                      ) : (
                        <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                          ℹ️ NEUTRAL EVEN/ODD BIAS: Current deviation is <strong>{evenOddDev.toFixed(1)}%</strong> (Wait for ≥ 7% threshold).
                        </div>
                      )}

                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                        💡 <strong>Action:</strong> Auto-trades <strong>{isEvenDominant ? 'EVEN' : 'ODD'}</strong> when dominant side deviation reaches ≥ 7%.
                      </div>
                    </div>
                  )}

                  {/* 3. DIFFERS DYNAMIC ANALYSIS */}
                  {consoleTradeType === 'differs' && (
                    <div className="mhp-ou-box">
                      <span className="mhp-card-title">📊 {localize('Digit Differs Coldest Analysis')} ({single_market_symbol})</span>

                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Digit Frequencies (0-9)</span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4, height: 45, alignItems: 'flex-end' }}>
                          {activeAnalysis?.digitFrequencies.map(f => {
                            const isColdest = f.digit === coldestDigitInfo.digit;
                            return (
                              <div key={f.digit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                                <div style={{
                                  width: '100%',
                                  height: `${Math.max(10, f.percentage * 2)}%`,
                                  background: isColdest ? '#3b82f6' : 'rgba(255,255,255,0.15)',
                                  borderRadius: 2,
                                  boxShadow: isColdest ? '0 0 8px #3b82f6' : 'none'
                                }} />
                                <span style={{ fontSize: 9, fontWeight: 700, color: isColdest ? '#60a5fa' : 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                                  {f.digit}
                                </span>
                              </div>
                            );
                          }) || null}
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#cbd5e1' }}>
                        <span>Coldest Digit: <strong style={{ color: '#60a5fa' }}>Digit {coldestDigitInfo.digit}</strong></span>
                        <span>Frequency: <strong style={{ color: '#f5c542' }}>{coldestDigitInfo.pct.toFixed(1)}%</strong> (Expected 10.0%)</span>
                      </div>

                      {coldestDigitInfo.pct <= 6.0 ? (
                        <div className="mhp-strong-signal-banner">
                          <span>⚡ STRONG DIFFERS SIGNAL</span>
                          <span>Digit {coldestDigitInfo.digit} is Coldest at {coldestDigitInfo.pct.toFixed(1)}%</span>
                        </div>
                      ) : (
                        <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                          ℹ️ WAITING FOR COLD DIGIT DROP: Digit {coldestDigitInfo.digit} is at {coldestDigitInfo.pct.toFixed(1)}% (Threshold ≤ 6.0%).
                        </div>
                      )}

                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                        💡 <strong>Action:</strong> Buys <strong>Digit Differs {coldestDigitInfo.digit}</strong> when cold digit drops significantly below 10% mathematical expectation.
                      </div>
                    </div>
                  )}

                  {/* 4. MATCHES DYNAMIC ANALYSIS */}
                  {consoleTradeType === 'matches' && (
                    <div className="mhp-ou-box">
                      <span className="mhp-card-title">📊 {localize('Digit Matches Hottest Analysis')} ({single_market_symbol})</span>

                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Digit Frequencies (0-9)</span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4, height: 45, alignItems: 'flex-end' }}>
                          {activeAnalysis?.digitFrequencies.map(f => {
                            const isHottest = f.digit === hottestDigitInfo.digit;
                            return (
                              <div key={f.digit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                                <div style={{
                                  width: '100%',
                                  height: `${Math.max(10, f.percentage * 2)}%`,
                                  background: isHottest ? 'linear-gradient(180deg, #f5c542, #e67e22)' : 'rgba(255,255,255,0.15)',
                                  borderRadius: 2,
                                  boxShadow: isHottest ? '0 0 8px #f5c542' : 'none'
                                }} />
                                <span style={{ fontSize: 9, fontWeight: 700, color: isHottest ? '#f5c542' : 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                                  {f.digit}
                                </span>
                              </div>
                            );
                          }) || null}
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#cbd5e1' }}>
                        <span>Hottest Digit: <strong style={{ color: '#f5c542' }}>Digit {hottestDigitInfo.digit}</strong></span>
                        <span>Power Index: <strong style={{ color: '#10b981' }}>{hottestDigitInfo.pct.toFixed(1)}%</strong></span>
                      </div>

                      {hottestDigitInfo.pct >= 18.0 ? (
                        <div className="mhp-strong-signal-banner">
                          <span>⚡ STRONG MATCHES SIGNAL</span>
                          <span>Digit {hottestDigitInfo.digit} is Hottest at {hottestDigitInfo.pct.toFixed(1)}% Recurring Power</span>
                        </div>
                      ) : (
                        <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                          ℹ️ WAITING FOR HOT DIGIT SPIKE: Digit {hottestDigitInfo.digit} is at {hottestDigitInfo.pct.toFixed(1)}% (Threshold ≥ 18.0%).
                        </div>
                      )}

                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                        💡 <strong>Action:</strong> Buys <strong>Digit Matches {hottestDigitInfo.digit}</strong> on recurring high power score.
                      </div>
                    </div>
                  )}

                  {/* 5. RISE / FALL DYNAMIC ANALYSIS */}
                  {consoleTradeType === 'rise_fall' && (
                    <div className="mhp-ou-box">
                      <span className="mhp-card-title">📊 {localize('Rise / Fall Directional Trend Analysis')} ({single_market_symbol})</span>

                      <div className="mhp-ou-bar-container">
                        <div
                          className={classNames('mhp-ou-fill-under', { 'glowing-win': riseFallTrend.dir === 'RISE' })}
                          style={{ width: `${riseFallTrend.pct}%`, background: 'linear-gradient(90deg, #10b981, #34d399)', color: '#000' }}
                        >
                          RISE: {riseFallTrend.pct.toFixed(0)}%
                        </div>
                        <div
                          className={classNames('mhp-ou-fill-over', { 'glowing-win': riseFallTrend.dir === 'FALL' })}
                          style={{ width: `${100 - riseFallTrend.pct}%`, background: 'linear-gradient(90deg, #ef4444, #f87171)', color: '#fff' }}
                        >
                          FALL: {(100 - riseFallTrend.pct).toFixed(0)}%
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#cbd5e1' }}>
                        <span>Current Trend: <strong style={{ color: riseFallTrend.dir === 'RISE' ? '#34d399' : '#f87171' }}>{riseFallTrend.dir}</strong></span>
                        <span>Confidence: <strong style={{ color: '#f5c542' }}>{riseFallTrend.pct.toFixed(0)}%</strong> (Deviation ≥ 8%)</span>
                      </div>

                      <div className="mhp-strong-signal-banner">
                        <span>⚡ STRONG {riseFallTrend.dir} TREND</span>
                        <span>{riseFallTrend.pct.toFixed(0)}% Directional Confidence</span>
                      </div>

                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                        💡 <strong>Action:</strong> Buys <strong>{riseFallTrend.dir}</strong> following tick-by-tick price direction deviation.
                      </div>
                    </div>
                  )}

                  {/* Trading Console & Transaction History Stats */}
                  <div className="mhp-console-card">
                    <span className="mhp-card-title" style={{ color: '#f5c542' }}>⚡ {localize('TRADING CONSOLE')}</span>

                    <div className="mhp-grid-2">
                      <div>
                        <label className="mhp-label">{localize('Market Selection')}</label>
                        <select className="mhp-select" value={consoleMarket} onChange={e => setConsoleMarket(e.target.value)}>
                          {available_symbols.map((sym: any) => (
                            <option key={sym.symbol || sym.underlying_symbol} value={sym.symbol || sym.underlying_symbol}>
                              {sym.display_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mhp-label">{localize('Strategy / Contract')}</label>
                        <select className="mhp-select" value={consoleTradeType} onChange={e => setConsoleTradeType(e.target.value)}>
                          <option value="even_odd">Even / Odd</option>
                          <option value="over_under">Over / Under</option>
                          <option value="differs">Differs</option>
                          <option value="matches">Matches</option>
                          <option value="rise_fall">Rise / Fall</option>
                        </select>
                      </div>

                      <div>
                        <label className="mhp-label">{localize('Stake ($)')}</label>
                        <input type="number" className="mhp-input" value={scanner.stake} onChange={e => { scanner.stake = parseFloat(e.target.value) || 0; }} />
                      </div>

                      <div>
                        <label className="mhp-label">{localize('Martingale x')}</label>
                        <input type="number" step="0.1" className="mhp-input" value={scanner.martingale_multiplier} onChange={e => { scanner.martingale_multiplier = parseFloat(e.target.value) || 0; }} />
                      </div>
                    </div>

                    {/* Transaction History Stats Row */}
                    <div className="mhp-console-stats">
                      <div className="mhp-stat-box">
                        <span className="mhp-stat-lbl">{localize('Total Runs')}</span>
                        <span className="mhp-stat-val">{scanner.total_runs}</span>
                      </div>
                      <div className="mhp-stat-box">
                        <span className="mhp-stat-lbl">{localize('Wins')}</span>
                        <span className="mhp-stat-val" style={{ color: '#10b981' }}>{scanner.wins}</span>
                      </div>
                      <div className="mhp-stat-box">
                        <span className="mhp-stat-lbl">{localize('Losses')}</span>
                        <span className="mhp-stat-val" style={{ color: '#ef4444' }}>{scanner.losses}</span>
                      </div>
                      <div className="mhp-stat-box">
                        <span className="mhp-stat-lbl">{localize('Total Stake')}</span>
                        <span className="mhp-stat-val">${scanner.total_stake.toFixed(2)}</span>
                      </div>
                      <div className="mhp-stat-box">
                        <span className="mhp-stat-lbl">{localize('Total Profit')}</span>
                        <span className={classNames('mhp-stat-val', scanner.total_profit >= 0 ? 'mhp-profit-pos' : 'mhp-profit-neg')}>
                          {scanner.total_profit >= 0 ? `+$${scanner.total_profit.toFixed(2)}` : `-$${Math.abs(scanner.total_profit).toFixed(2)}`}
                        </span>
                      </div>
                    </div>

                    <div className="mhp-console-btns">
                      <button className="mhp-btn-manual" onClick={handleLoadBot}>
                        {localize('Manual Run Purchase')}
                      </button>
                      <button className="mhp-btn-auto" onClick={handleLoadBotAndRun}>
                        🚀 {localize('Start Auto Trading Loop')}
                      </button>
                    </div>
                  </div>
                </React.Fragment>
              )}

              {/* ═══════════ SUBTAB 3: STATS ═══════════ */}
              {activeTab === 'stats' && (
                <div className="mhp-card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <span className="mhp-card-title" style={{ marginBottom: 10, display: 'block' }}>
                    {localize('Market Statistics')}
                  </span>
                  <div className="mhp-stats-strategy-row">
                    {[
                      { key: 'even_odd', label: 'Even/Odd' },
                      { key: 'over_under', label: 'Over/Under' },
                      { key: 'differs', label: 'Differs' },
                      { key: 'rise_fall', label: 'Rise/Fall' },
                      { key: 'matches', label: 'Matches' },
                    ].map(btn => (
                      <button
                        key={btn.key}
                        onClick={() => setStatsStrategy(btn.key as any)}
                        className={classNames('mhp-stats-btn', { active: statsStrategy === btn.key })}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    <table className="mhp-stats-table">
                      <thead>
                        <tr>
                          <th>{localize('Index')}</th>
                          <th>{localize('Price')}</th>
                          <th style={{ textAlign: 'center' }}>{localize('Digit')}</th>
                          <th style={{ textAlign: 'right' }}>{localize('Stats')}</th>
                          <th style={{ textAlign: 'right' }}>{localize('Action')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...available_symbols]
                          .map((sym: any) => {
                            const key = sym.symbol || sym.underlying_symbol;
                            const analysis = scanner.symbol_analysis[key];
                            const statsData = getStatsForStrategy(analysis, statsStrategy);
                            return { sym, key, analysis, statsData };
                          })
                          .sort((a, b) => b.statsData.strength - a.statsData.strength)
                          .map(({ sym, key, analysis, statsData }) => (
                            <tr key={key}>
                              <td style={{ fontWeight: 600, color: '#cbd5e1' }}>{sym.display_name.replace('Index', '')}</td>
                              <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                                {analysis ? analysis.lastQuote.toFixed(sym.display_name.includes('1s') ? 2 : 4) : '…'}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {analysis && analysis.lastDigits.length > 0 ? (
                                  <span className="mhp-digit-badge">
                                    {analysis.lastDigits[analysis.lastDigits.length - 1]}
                                  </span>
                                ) : '-'}
                              </td>
                              <td style={{ textAlign: 'right', color: '#f5c542', fontWeight: 700, fontSize: 11 }}>
                                {statsData.text}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {analysis ? (
                                  <button
                                    className="mhp-load-mini-btn"
                                    onClick={() => handleLoadBotFromStats(sym, statsStrategy, statsData, analysis)}
                                  >
                                    {localize('Load')}
                                  </button>
                                ) : <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>-</span>}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ═══════════ SUBTAB 4: DOLLARFLIPPER ═══════════ */}
              {activeTab === 'dollarflipper' && (
                <div className="mhp-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="mhp-card-title" style={{ color: '#10b981', fontSize: 14 }}>
                      💎 {localize('Dollarflipper Compounding Engine')}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#f5c542' }}>
                      ${Number(store.client.balance || 0).toFixed(2)}
                    </span>
                  </div>

                  {/* Engine Status Banner */}
                  <div className={classNames('mhp-df-status-banner', { running: store.dollarflipper.is_running })}>
                    <span>{store.dollarflipper.is_running ? '⚡' : 'ℹ️'}</span>
                    <span>{store.dollarflipper.status_message}</span>
                  </div>

                  {/* Parameters Form Grid */}
                  <div className="mhp-grid-2">
                    <div>
                      <label className="mhp-label">{localize('Session Target Profit ($)')}</label>
                      <input
                        type="number" className="mhp-input" min={1}
                        value={store.dollarflipper.target_profit}
                        onChange={e => store.dollarflipper.setTargetProfit(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <label className="mhp-label">{localize('Initial Stake (% of Capital)')}</label>
                      <select
                        className="mhp-select"
                        value={store.dollarflipper.stake_percentage}
                        onChange={e => store.dollarflipper.setStakePercentage(parseFloat(e.target.value) || 2)}
                      >
                        {[1, 2, 3, 5, 10].map(v => <option key={v} value={v}>{v}%</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mhp-label">{localize('Compounding Mode')}</label>
                      <select
                        className="mhp-select"
                        value={store.dollarflipper.compounding_mode}
                        onChange={e => store.dollarflipper.setCompoundingMode(e.target.value as any)}
                      >
                        <option value="compound_wins">Reinvest Wins (High Compound)</option>
                        <option value="fixed_stake">Fixed Stake (Conservative)</option>
                        <option value="martingale">Martingale Recovery</option>
                      </select>
                    </div>
                    <div>
                      <label className="mhp-label">{localize('Strategy Focus')}</label>
                      <select
                        className="mhp-select"
                        value={store.dollarflipper.strategy_type}
                        onChange={e => store.dollarflipper.setStrategyType(e.target.value as any)}
                      >
                        <option value="over_under">Over/Under AI</option>
                        <option value="even_odd">Even/Odd Bias</option>
                        <option value="differs">Coldest Differs</option>
                        <option value="auto_ai">Auto-Hybrid AI (All Markets)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mhp-label">{localize('Challenge Duration')}</label>
                      <input
                        type="number" className="mhp-input" min={1} max={100}
                        value={store.dollarflipper.challenge_days}
                        onChange={e => store.dollarflipper.setChallengeDays(parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div>
                      <label className="mhp-label">{localize('Sessions / Day')}</label>
                      <select
                        className="mhp-select"
                        value={store.dollarflipper.sessions_per_day}
                        onChange={e => store.dollarflipper.setSessionsPerDay(parseInt(e.target.value) || 1)}
                      >
                        <option value="1">1 Session / Day</option>
                        <option value="2">2 Sessions / Day</option>
                        <option value="3">3 Sessions / Day</option>
                        <option value="4">4 Sessions / Day</option>
                        <option value="24">24hrs Continuous</option>
                      </select>
                    </div>
                  </div>

                  {/* Compounding Progression Step Matrix */}
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 800 }}>
                        Compounding Progression Matrix
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#f5c542' }}>
                        Current Stake: ${store.dollarflipper.current_stake.toFixed(2)}
                      </span>
                    </div>
                    <div className="mhp-df-step-container">
                      {[1, 2, 3, 4, 5].map(step => (
                        <div
                          key={step}
                          className={classNames('mhp-df-step-chip', { active: store.dollarflipper.compound_step === step })}
                        >
                          Step {step} {store.dollarflipper.compound_step === step ? '⚡' : ''}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Session Target Profit Progress */}
                  <div className="mhp-df-progress-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>{localize('Session Profit Target')}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: store.dollarflipper.current_session_profit >= 0 ? '#10b981' : '#ef4444' }}>
                        ${store.dollarflipper.current_session_profit.toFixed(2)} / ${store.dollarflipper.target_profit.toFixed(2)}
                      </span>
                    </div>
                    <div className="mhp-progress-bg">
                      <div
                        className="mhp-progress-fill mhp-progress-green"
                        style={{ width: `${Math.min(100, Math.max(0, (store.dollarflipper.current_session_profit / store.dollarflipper.target_profit) * 100))}%` }}
                      />
                    </div>
                  </div>

                  {/* Challenge Overall Progress */}
                  <div className="mhp-df-progress-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{localize('Completed Challenge Sessions:')}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>
                        {store.dollarflipper.completed_sessions} / {store.dollarflipper.challenge_days * store.dollarflipper.sessions_per_day}
                      </span>
                    </div>
                    <div className="mhp-progress-bg">
                      <div
                        className="mhp-progress-fill mhp-progress-green"
                        style={{ width: `${Math.min(100, (store.dollarflipper.completed_sessions / (store.dollarflipper.challenge_days * store.dollarflipper.sessions_per_day)) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Recent Trade Log Table */}
                  {store.dollarflipper.recent_trades.length > 0 && (
                    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 8, border: '1px solid rgba(255,255,255,0.06)', maxHeight: 150, overflowY: 'auto' }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', display: 'block', marginBottom: 6, fontWeight: 800 }}>
                        Engine Executions
                      </span>
                      <table className="mhp-df-trade-table">
                        <thead>
                          <tr>
                            <th>Market</th>
                            <th>Type</th>
                            <th>Stake</th>
                            <th style={{ textAlign: 'right' }}>P/L</th>
                          </tr>
                        </thead>
                        <tbody>
                          {store.dollarflipper.recent_trades.map(t => (
                            <tr key={t.id}>
                              <td style={{ fontWeight: 600, color: '#cbd5e1' }}>{t.symbol}</td>
                              <td>{t.tradeType}</td>
                              <td>${t.stake.toFixed(2)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 800, color: t.result === 'WIN' ? '#34d399' : '#f87171' }}>
                                {t.result === 'WIN' ? `+$${t.profit.toFixed(2)}` : `-$${Math.abs(t.profit).toFixed(2)}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Actions Row */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                    <button
                      className="mhp-btn-scan"
                      onClick={() => store.dollarflipper.resetChallenge()}
                      style={{ flex: '0 0 100px' }}
                    >
                      🔄 Reset
                    </button>
                    <button
                      className={classNames('mhp-df-btn', { running: store.dollarflipper.is_running })}
                      onClick={() => store.dollarflipper.is_running ? store.dollarflipper.stopDollarflipper() : store.dollarflipper.startDollarflipper()}
                      style={{ flex: 1 }}
                    >
                      {store.dollarflipper.is_running ? localize('⏸️ Pause Dollarflipper Engine') : localize('🚀 Launch Dollar Flipper Engine')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="mhp-footer">
              <button className="mhp-btn mhp-btn-scan" onClick={is_scanning ? stopScanning : startScanning}>
                {is_scanning ? localize('Stop Scanning') : localize('Start Scan')}
              </button>
              <button className="mhp-btn mhp-btn-load" onClick={handleLoadBot} disabled={!current_signal}>
                {localize('Load Bot')}
              </button>
              <button className="mhp-btn mhp-btn-run" onClick={handleLoadBotAndRun} disabled={!current_signal}>
                {localize('Load & Run')}
              </button>
            </div>
          </div>
        </DraggableResizeWrapper>
      )}
    </React.Fragment>
  );
});

export default Scanner;
