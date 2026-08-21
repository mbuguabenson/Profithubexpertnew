import { localize } from '@deriv-com/translations';
import { emptyTextValidator, modifyContextMenu } from '../../utils';

window.Blockly.Blocks.money8gg_print = {
    init() {
        this.jsonInit(this.definition());
    },
    definition() {
        return {
            message0: localize('Print Profit: %1'),
            args0: [
                {
                    type: 'input_value',
                    name: 'TEXT',
                },
            ],
            colour: window.Blockly.Colours.Special3.colour,
            colourSecondary: window.Blockly.Colours.Special3.colourSecondary,
            colourTertiary: window.Blockly.Colours.Special3.colourTertiary,
            previousStatement: null,
            nextStatement: null,
            tooltip: localize('Displays a success notification in the journal'),
            category: window.Blockly.Categories.Text,
        };
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
    meta() {
        return {
            display_name: localize('Print Profit'),
            description: localize('Displays a success notification in the journal'),
        };
    },
    getRequiredValueInputs() {
        return {
            TEXT: emptyTextValidator,
        };
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.money8gg_print = block => {
    const msg =
        window.Blockly.JavaScript.javascriptGenerator.valueToCode(
            block,
            'TEXT',
            window.Blockly.JavaScript.javascriptGenerator.ORDER_ATOMIC
        ) || `"${localize('<empty message>')}"`;
    const code = `Bot.notify({ className: 'journal__text--success', message: ${msg}, sound: 'silent', block_id: '${block.id}' });\n`;
    return code;
};
