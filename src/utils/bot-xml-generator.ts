export type TAltTradeType = {
  purchaseType: string;
  entryOp: string;
  entryThreshold: number;
  prediction: number;
  tradeTypeCat: string;
  tradeType: string;
  hasPrediction: boolean;
};

export const mapAltTradeType = (tradeTypeId: string): TAltTradeType => {
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

export const mapSignalToBestSignal = (sig: any) => {
  if (!sig) return null;
  const strat = sig.strategy;
  const targetDigit = sig.details?.targetDigit ?? sig.targetDigit;
  let tradeDirection = '';

  if (strat === 'even_odd' || strat === 'pro_even_odd' || strat === 'super') {
    const rec = (sig.details?.recommendation ?? sig.recommendation ?? '').toLowerCase();
    if (rec.includes('even')) tradeDirection = 'EVEN';
    else if (rec.includes('odd')) tradeDirection = 'ODD';
  } else if (strat === 'over_under' || strat === 'pro_over_under') {
    const bias = sig.details?.signalDetails?.bias ?? sig.signalDetails?.bias;
    const digit = targetDigit ?? 5;
    const rec = (sig.details?.recommendation ?? sig.recommendation ?? '').toLowerCase();
    if (bias === 'high' || rec.includes('over')) {
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
    const trend = sig.details?.signalDetails?.trend ?? sig.signalDetails?.trend ?? ((sig.details?.recommendation ?? sig.recommendation ?? '').toLowerCase().includes('rise') ? 'rise' : 'fall');
    tradeDirection = trend.toUpperCase();
  }

  return {
    ...(sig.details || sig),
    tradeDirection,
    targetDigit,
    entryDigits: targetDigit !== undefined ? [targetDigit] : [],
  };
};

export function generateBotXML(opts: {
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
    const strategy = tradeTypeLabel.toLowerCase().replace(/[\s/]/g, '_');
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
