const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export class AIBotGeneratorService {
    /**
     * Sends the prompt to our backend AI proxy to generate the Blockly XML.
     */
    static async generateBotFromPrompt(prompt: string): Promise<string> {
        console.log(`[AIBotGeneratorService] Sending prompt: "${prompt}" to backend...`);

        try {
            // Determine backend URL
            const isProd = import.meta.env.PROD;
            const baseUrl = isProd ? '' : 'http://localhost:4000';
            const endpoint = `${baseUrl}/api/admin/bot-ai`;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch AI response');
            }

            const data = await response.json();
            if (!data.xml) {
                throw new Error('No XML returned from AI API');
            }

            return data.xml.trim();
        } catch (error) {
            console.error('[AIBotGeneratorService] AI Generation failed:', error);
            // Fallback mock XML if the server fails
            const mockXML = `
<xml xmlns="http://www.w3.org/1999/xhtml" is_dbot="true" collection="false">
  <variables>
    <variable type="" id="X_Y_Z">mock_variable</variable>
  </variables>
  <block type="trade_definition" id="trade_def_1" x="0" y="0">
    <statement name="TRADE_OPTIONS">
      <block type="trade_definition_market" id="market_1">
        <field name="MARKET_LIST">synthetic_index</field>
        <field name="SUBMARKET_LIST">random_index</field>
        <field name="SYMBOL_LIST">R_100</field>
        <next>
          <block type="trade_definition_tradetype" id="tradetype_1">
            <field name="TRADETYPECAT_LIST">callput</field>
            <field name="TRADETYPE_LIST">callput</field>
            <next>
              <block type="trade_definition_contracttype" id="contracttype_1">
                <field name="TYPE_LIST">both</field>
                <next>
                  <block type="trade_definition_candleinterval" id="candle_1">
                    <field name="CANDLEINTERVAL_LIST">60</field>
                  </block>
                </next>
              </block>
            </next>
          </block>
        </next>
      </block>
    </statement>
  </block>
</xml>`;
            return mockXML.trim();
        }
    }
}
