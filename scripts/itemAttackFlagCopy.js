import { AutomateDamageModule } from './config.js';

const MODULE_ID = AutomateDamageModule.MODULE.ID;

/**
 * Wrapper for ItemAttackPF.fromItem to copy pf1-automate-damage flags from the item to the created attack.
 * @param {function(ItemPF): any} wrapped
 * @param {ItemPF} item
 * @returns {any}
 */
function itemAttackFromItemFlagCopy(wrapped, item) {
    const data = wrapped(item);

    const flags = item.flags?.[MODULE_ID] || {};
    data.flags ||= {};
    data.flags[MODULE_ID] = foundry.utils.mergeObject(flags, data.flags[MODULE_ID] || {});

    const newActions = data.system?.actions;
    const copiedActions = data.flags[MODULE_ID]?.itemActionSettings?.actions;
    if (Array.isArray(newActions) && Array.isArray(copiedActions) && newActions.length === copiedActions.length) {
        for (let i = 0; i < copiedActions.length; i++) {
            copiedActions[i].id = newActions[i]._id;
        }
    }

    return data;
}

export function initItemAttackFlagCopy() {
    if (!globalThis.libWrapper) {
        console.error(`[${MODULE_ID}] libWrapper is required for item attack flag copying.`);
        return;
    }
    globalThis.libWrapper.register(
        MODULE_ID,
        'pf1.documents.item.ItemAttackPF.fromItem',
        itemAttackFromItemFlagCopy,
        'WRAPPER'
    );
} 