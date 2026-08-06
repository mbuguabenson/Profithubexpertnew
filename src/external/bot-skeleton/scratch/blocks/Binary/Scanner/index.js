import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../../utils';

// 1. scanner_best_market
window.Blockly.Blocks.scanner_best_market = {
    init() { this.jsonInit(this.definition()); },
    definition() {
        return {
            message0: localize('AI Scanner Best Market'),
            output: 'String',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: '#10b981',
            colourSecondary: '#059669',
            colourTertiary: '#047857',
            tooltip: localize('Returns the highest confidence market symbol currently scanned by AI Scanner'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('AI Scanner Best Market'),
            description: localize('Returns the top recommended volatility/jump market symbol from live AI scanner analysis.'),
        };
    },
    customContextMenu(menu) { modifyContextMenu(menu); },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.scanner_best_market = () => [
    'Bot.getScannerBestMarket()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];

// 2. scanner_last_digit
window.Blockly.Blocks.scanner_last_digit = {
    init() { this.jsonInit(this.definition()); },
    definition() {
        return {
            message0: localize('AI Scanner Live Last Digit'),
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: '#10b981',
            colourSecondary: '#059669',
            colourTertiary: '#047857',
            tooltip: localize('Returns live streaming last digit for the active scanner market'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('AI Scanner Live Last Digit'),
            description: localize('Returns the live streaming last digit for the active scanner symbol.'),
        };
    },
    customContextMenu(menu) { modifyContextMenu(menu); },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.scanner_last_digit = () => [
    'Bot.getScannerLastDigit()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];

// 3. scanner_signal_confidence
window.Blockly.Blocks.scanner_signal_confidence = {
    init() { this.jsonInit(this.definition()); },
    definition() {
        return {
            message0: localize('AI Scanner Signal Confidence (%)'),
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: '#10b981',
            colourSecondary: '#059669',
            colourTertiary: '#047857',
            tooltip: localize('Returns the signal confidence percentage (0-100) for the scanner market'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('AI Scanner Signal Confidence (%)'),
            description: localize('Returns the live signal confidence percentage.'),
        };
    },
    customContextMenu(menu) { modifyContextMenu(menu); },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.scanner_signal_confidence = () => [
    'Bot.getScannerConfidence()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];

// 4. scanner_over_under_bias
window.Blockly.Blocks.scanner_over_under_bias = {
    init() { this.jsonInit(this.definition()); },
    definition() {
        return {
            message0: localize('AI Scanner Over/Under Bias'),
            output: 'String',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: '#10b981',
            colourSecondary: '#059669',
            colourTertiary: '#047857',
            tooltip: localize('Returns OVER or UNDER based on dominant 55% threshold analysis'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('AI Scanner Over/Under Bias'),
            description: localize('Returns OVER or UNDER depending on which side has >= 55% dominance.'),
        };
    },
    customContextMenu(menu) { modifyContextMenu(menu); },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.scanner_over_under_bias = () => [
    'Bot.getScannerOverUnderBias()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];

// 5. scanner_coldest_digit
window.Blockly.Blocks.scanner_coldest_digit = {
    init() { this.jsonInit(this.definition()); },
    definition() {
        return {
            message0: localize('AI Scanner Coldest Digit'),
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: '#10b981',
            colourSecondary: '#059669',
            colourTertiary: '#047857',
            tooltip: localize('Returns the coldest digit (0-9) calculated from recent 120 ticks'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('AI Scanner Coldest Digit'),
            description: localize('Returns the digit with lowest historical frequency in recent ticks.'),
        };
    },
    customContextMenu(menu) { modifyContextMenu(menu); },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.scanner_coldest_digit = () => [
    'Bot.getScannerColdestDigit()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];

// 6. scanner_hottest_digit
window.Blockly.Blocks.scanner_hottest_digit = {
    init() { this.jsonInit(this.definition()); },
    definition() {
        return {
            message0: localize('AI Scanner Hottest Digit'),
            output: 'Number',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: '#10b981',
            colourSecondary: '#059669',
            colourTertiary: '#047857',
            tooltip: localize('Returns the hottest digit (0-9) calculated from recent 120 ticks'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('AI Scanner Hottest Digit'),
            description: localize('Returns the digit with highest recurring frequency in recent ticks.'),
        };
    },
    customContextMenu(menu) { modifyContextMenu(menu); },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.scanner_hottest_digit = () => [
    'Bot.getScannerHottestDigit()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];

// 7. scanner_is_strong_signal
window.Blockly.Blocks.scanner_is_strong_signal = {
    init() { this.jsonInit(this.definition()); },
    definition() {
        return {
            message0: localize('AI Scanner Is Strong Signal'),
            output: 'Boolean',
            outputShape: window.Blockly.OUTPUT_SHAPE_ROUND,
            colour: '#10b981',
            colourSecondary: '#059669',
            colourTertiary: '#047857',
            tooltip: localize('Returns true if AI Scanner detects a strong high-probability signal'),
            category: window.Blockly.Categories.Tick_Analysis,
        };
    },
    meta() {
        return {
            display_name: localize('AI Scanner Is Strong Signal'),
            description: localize('Returns true when high-confidence signal is verified by AI Scanner.'),
        };
    },
    customContextMenu(menu) { modifyContextMenu(menu); },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.scanner_is_strong_signal = () => [
    'Bot.getScannerIsStrongSignal()',
    window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC,
];
