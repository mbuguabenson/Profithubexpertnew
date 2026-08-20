import { localize } from '@deriv-com/translations';

window.Blockly.Blocks.multiple_trades = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Multiple Trades: %1'),
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
            tooltip: localize('Define multiple trades execution count.'),
            category: window.Blockly.Categories.Before_Purchase,
        };
    },
    meta() {
        return {
            display_name: localize('Multiple Trades'),
            description: localize('Configures multiple trades execution count.'),
        };
    },
    restricted_parents: ['before_purchase'],
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.multiple_trades = (block, generator) => {
    const tradeCount = generator.valueToCode(block, 'TRADE_COUNT', window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC) || '1';
    return `
        // Configured Multiple Trades: ${tradeCount}
    `;
};
