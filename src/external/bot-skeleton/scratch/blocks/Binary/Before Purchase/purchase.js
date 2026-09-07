import { localize } from '@deriv-com/translations';
import { getContractTypeOptions } from '../../../shared';
import { excludeOptionFromContextMenu, modifyContextMenu } from '../../../utils';
import {
    isFastModeActive,
    getIsSyncingWorkspace,
    syncBlocklyPurchaseBlocks,
} from '../../../../services/tradeEngine/utils/fastMode';

window.Blockly.Blocks.purchase = {
    init() {
        this.jsonInit(this.definition());

        // Ensure one of this type per statement-stack
        this.setNextStatement(false);

        // Synchronize with active fast mode state from header/localStorage
        const fastField = this.getField('FAST_EXECUTION');
        if (fastField && typeof isFastModeActive === 'function') {
            fastField.setValue(isFastModeActive() ? 'TRUE' : 'FALSE');
        }
    },
    definition() {
        return {
            message0: localize('Purchase {{ contract_type }} ⚡ Fast: {{ fast_exec }}', {
                contract_type: '%1',
                fast_exec: '%2',
            }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'PURCHASE_LIST',
                    options: [['', '']],
                },
                {
                    type: 'field_checkbox',
                    name: 'FAST_EXECUTION',
                    checked: typeof isFastModeActive === 'function' ? isFastModeActive() : true,
                },
            ],
            previousStatement: null,
            colour: window.Blockly.Colours.Special1.colour,
            colourSecondary: window.Blockly.Colours.Special1.colourSecondary,
            colourTertiary: window.Blockly.Colours.Special1.colourTertiary,
            tooltip: localize(
                'This block purchases contract of a specified type. Enable Fast Execution for instant zero-latency tick trading.'
            ),
            category: window.Blockly.Categories.Before_Purchase,
        };
    },
    meta() {
        return {
            display_name: localize('Purchase'),
            description: localize(
                'Use this block to purchase the specific contract you want. Enable Fast Execution checkbox for 0ms execution without quote delays.'
            ),
            key_words: localize('buy'),
        };
    },
    onchange(event) {
        if (!this.workspace || window.Blockly.derivWorkspace.isFlyoutVisible || this.workspace.isDragging()) {
            return;
        }

        // Two-way synchronization: if user toggles Fast checkbox in Blockly, update header button & other purchase blocks
        if (
            event.type === window.Blockly.Events.BLOCK_CHANGE &&
            event.blockId === this.id &&
            event.name === 'FAST_EXECUTION' &&
            !getIsSyncingWorkspace()
        ) {
            const isChecked = event.newValue === 'TRUE' || event.newValue === true || event.newValue === 'true';
            window.dispatchEvent(
                new CustomEvent('set_dbot_speed_mode', { detail: { isFast: isChecked, source: 'blockly' } })
            );
            syncBlocklyPurchaseBlocks(isChecked);
        }

        if (event.type === window.Blockly.Events.BLOCK_CREATE && event.ids.includes(this.id)) {
            this.populatePurchaseList(event);
            // Newly created block reflects the active fast mode
            const fastField = this.getField('FAST_EXECUTION');
            if (fastField && !getIsSyncingWorkspace() && typeof isFastModeActive === 'function') {
                const isFast = isFastModeActive();
                if (fastField.getValue() !== (isFast ? 'TRUE' : 'FALSE')) {
                    fastField.setValue(isFast ? 'TRUE' : 'FALSE');
                }
            }
        } else if (event.type === window.Blockly.Events.BLOCK_CHANGE) {
            if (event.name === 'TYPE_LIST' || event.name === 'TRADETYPE_LIST') {
                this.populatePurchaseList(event);
            }
        } else if (event.type === window.Blockly.Events.BLOCK_DRAG && !event.isStart && event.blockId === this.id) {
            const purchase_type_list = this.getField('PURCHASE_LIST');
            const purchase_options = purchase_type_list.menuGenerator_; // eslint-disable-line

            if (purchase_options[0][0] === '') {
                this.populatePurchaseList(event);
            }
        }
    },
    populatePurchaseList(event) {
        const trade_definition_block = this.workspace.getTradeDefinitionBlock();

        if (trade_definition_block) {
            const trade_type_block = trade_definition_block.getChildByType('trade_definition_tradetype');
            const trade_type = trade_type_block.getFieldValue('TRADETYPE_LIST');
            const contract_type_block = trade_definition_block.getChildByType('trade_definition_contracttype');
            const contract_type = contract_type_block.getFieldValue('TYPE_LIST');
            const purchase_type_list = this.getField('PURCHASE_LIST');
            const purchase_type = purchase_type_list.getValue();
            const contract_type_options = getContractTypeOptions(contract_type, trade_type);

            purchase_type_list.updateOptions(contract_type_options, {
                default_value: purchase_type,
                event_group: event.group,
                should_pretend_empty: true,
            });
        }
    },
    customContextMenu(menu) {
        const menu_items = [localize('Enable Block'), localize('Disable Block')];
        excludeOptionFromContextMenu(menu, menu_items);
        modifyContextMenu(menu);
    },
    restricted_parents: ['before_purchase'],
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.purchase = block => {
    const purchaseList = block.getFieldValue('PURCHASE_LIST') || 'CALL';
    const fastField = block.getFieldValue('FAST_EXECUTION');
    const isFast = fastField === 'TRUE' || fastField === true || fastField === 'true';

    return `Bot.purchase('${purchaseList}', ${isFast});
`;
};
