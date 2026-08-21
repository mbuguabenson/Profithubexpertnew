import { localize } from '@deriv-com/translations';

window.Blockly.Blocks.multiple_trades = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Multiple Identical Trades: %1'),
            args0: [
                {
                    type: 'input_value',
                    name: 'TRADE_COUNT',
                },
            ],
            previousStatement: null,
            nextStatement: null,
            colour: window.Blockly.Colours.Special1.colour,
            colourSecondary: window.Blockly.Colours.Special1.colourSecondary,
            colourTertiary: window.Blockly.Colours.Special1.colourTertiary,
            tooltip: localize('This block executes multiple identical trades simultaneously with the same entry and exit conditions.'),
            category: window.Blockly.Categories.Before_Purchase,
        };
    },
    meta() {
        return {
            display_name: localize('Multiple Identical Trades'),
            description: localize('This block executes multiple identical trades simultaneously with the same entry and exit conditions. All trades are placed at exactly the same time with identical parameters, resulting in the same outcome for all trades. Connect a number block to specify how many trades to execute (1-50).'),
        };
    },
    restricted_parents: ['before_purchase'],
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.multiple_trades = (block, generator) => {
    const tradeCount = generator.valueToCode(block, 'TRADE_COUNT', window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC) || '1';
    return `
        Bot.setBulkPurchaseCount(${tradeCount});
    `;
};
