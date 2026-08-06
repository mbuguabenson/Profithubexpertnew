import { generateBotXML, mapAltTradeType, mapSignalToBestSignal } from '../bot-xml-generator';

describe('bot-xml-generator', () => {
  describe('mapAltTradeType', () => {
    it('should map even_odd correctly', () => {
      const result = mapAltTradeType('even_odd');
      expect(result.purchaseType).toBe('DIGITEVEN');
      expect(result.tradeType).toBe('evenodd');
      expect(result.hasPrediction).toBe(false);
    });

    it('should map over_under correctly', () => {
      const result = mapAltTradeType('over_under');
      expect(result.purchaseType).toBe('DIGITOVER');
      expect(result.tradeType).toBe('overunder');
      expect(result.hasPrediction).toBe(true);
    });

    it('should map matches correctly', () => {
      const result = mapAltTradeType('matches');
      expect(result.purchaseType).toBe('DIGITMATCH');
      expect(result.tradeType).toBe('matchesdiffers');
      expect(result.hasPrediction).toBe(true);
    });

    it('should map differs correctly', () => {
      const result = mapAltTradeType('differs');
      expect(result.purchaseType).toBe('DIGITDIFF');
      expect(result.tradeType).toBe('matchesdiffers');
      expect(result.hasPrediction).toBe(true);
    });

    it('should map rise_fall correctly', () => {
      const result = mapAltTradeType('rise_fall');
      expect(result.purchaseType).toBe('CALL');
      expect(result.tradeType).toBe('risefall');
      expect(result.hasPrediction).toBe(false);
    });

    it('should fallback to even_odd on unknown types', () => {
      const result = mapAltTradeType('unknown_type');
      expect(result.purchaseType).toBe('DIGITEVEN');
    });
  });

  describe('mapSignalToBestSignal', () => {
    it('should return null if no signal is provided', () => {
      expect(mapSignalToBestSignal(null)).toBeNull();
    });

    it('should map even_odd signal correctly', () => {
      const sig = { strategy: 'even_odd', recommendation: 'Strong EVEN bias' };
      const mapped = mapSignalToBestSignal(sig);
      expect(mapped.tradeDirection).toBe('EVEN');
    });

    it('should map pro_even_odd signal with odd bias correctly', () => {
      const sig = { strategy: 'pro_even_odd', recommendation: 'ODD STRATEGY: streak detected' };
      const mapped = mapSignalToBestSignal(sig);
      expect(mapped.tradeDirection).toBe('ODD');
    });

    it('should map over_under signal correctly', () => {
      const sig = { strategy: 'over_under', targetDigit: 3, signalDetails: { bias: 'high' } };
      const mapped = mapSignalToBestSignal(sig);
      expect(mapped.tradeDirection).toBe('OVER 3');
      expect(mapped.entryDigits).toEqual([3]);
    });

    it('should map under_7 correctly', () => {
      const sig = { strategy: 'under_7', targetDigit: 7 };
      const mapped = mapSignalToBestSignal(sig);
      expect(mapped.tradeDirection).toBe('UNDER 7');
    });

    it('should map over_2 correctly', () => {
      const sig = { strategy: 'over_2', targetDigit: 2 };
      const mapped = mapSignalToBestSignal(sig);
      expect(mapped.tradeDirection).toBe('OVER 2');
    });

    it('should map differs correctly', () => {
      const sig = { strategy: 'differs', targetDigit: 8 };
      const mapped = mapSignalToBestSignal(sig);
      expect(mapped.tradeDirection).toBe('DIFFERS 8');
    });

    it('should map rise_fall correctly', () => {
      const sig = { strategy: 'rise_fall', signalDetails: { trend: 'fall' } };
      const mapped = mapSignalToBestSignal(sig);
      expect(mapped.tradeDirection).toBe('FALL');
    });
  });

  describe('generateBotXML', () => {
    const baseOpts = {
      stake: '10',
      takeProfit: '50',
      stopLoss: '5',
      martingale: '2',
      symbol: 'R_100',
      tradeTypeLabel: 'Over/Under',
      bestSignal: null,
    };

    it('should generate valid manual config fallback XML when bestSignal is null', () => {
      const xml = generateBotXML(baseOpts);
      expect(xml).toContain('<xml');
      expect(xml).toContain('<variable id="v_stake">Stake</variable>');
      expect(xml).toContain('<field name="NUM">10</field>'); // Stake
      expect(xml).toContain('<field name="NUM">50</field>'); // TP
      expect(xml).toContain('<field name="NUM">5</field>');  // SL
      expect(xml).toContain('<field name="NUM">2</field>');  // martingale
      expect(xml).toContain('<field name="SYMBOL_LIST">R_100</field>');
    });

    it('should output the selected prediction value for over_under in fallback', () => {
      const xml = generateBotXML({
        ...baseOpts,
        tradeTypeLabel: 'Over/Under',
        entryDigit: 4,
      });
      expect(xml).toContain('<field name="NUM">4</field>');
    });

    it('should generate XML for active EVEN signal', () => {
      const signal = { tradeDirection: 'EVEN' };
      const xml = generateBotXML({
        ...baseOpts,
        bestSignal: signal,
      });
      expect(xml).toContain('<field name="TRADETYPE_LIST">evenodd</field>');
      expect(xml).toContain('<field name="PURCHASE_LIST">DIGITEVEN</field>');
    });

    it('should generate XML for active OVER 3 signal', () => {
      const signal = { tradeDirection: 'OVER 3' };
      const xml = generateBotXML({
        ...baseOpts,
        bestSignal: signal,
      });
      expect(xml).toContain('<field name="TRADETYPE_LIST">overunder</field>');
      expect(xml).toContain('<field name="PURCHASE_LIST">DIGITOVER</field>');
      expect(xml).toContain('<field name="OP">LTE</field>');
      expect(xml).toContain('<field name="NUM">3</field>');
    });

    it('should apply entry digit override to active OVER 3 signal', () => {
      const signal = { tradeDirection: 'OVER 3' };
      const xml = generateBotXML({
        ...baseOpts,
        bestSignal: signal,
        entryDigit: 1,
      });
      expect(xml).toContain('<field name="OP">LTE</field>');
      expect(xml).toContain('<field name="NUM">1</field>');
    });

    it('should incorporate recovery mode when recovery is defined', () => {
      const xml = generateBotXML({
        ...baseOpts,
        recovery: {
          lossThreshold: 3,
          altTradeTypeId: 'even_odd',
        },
      });
      expect(xml).toContain('<block type="controls_if" id="bp_rec_if">');
      expect(xml).toContain('Recovery Mode');
      expect(xml).toContain('<field name="NUM">3</field>'); // lossThreshold
      expect(xml).toContain('<block type="purchase" id="bp_rec_pur">');
    });
  });
});
