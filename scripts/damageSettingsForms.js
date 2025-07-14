import { AutomateDamageModule } from './config.js';

Handlebars.registerHelper('eq', function(v1, v2) {
    return v1 === v2;
});

Handlebars.registerHelper('includes', function(array, value) {
    return Array.isArray(array) && array.includes(value);
});

Handlebars.registerHelper('array', function(...args) {
    return args.slice(0, -1);
});

export function getDamageTypes(category = "immunity") {
    const systemDamageTypes = pf1.registry.damageTypes
        .filter(dt => dt.id !== "untyped")
        .map(dt => ({
            id: dt.id,
            label: dt.name,
            isPhysical: !!dt.isPhysical,
            isEnergy: !!dt.isEnergy,
            isUtility: !!dt.isUtility,
            category: dt.category || "misc"
        }));

    const materialMap = new Map();
    pf1.registry.materials
        .filter(m => m.dr === true)
        .forEach(m => {
            if (m.treatedAs) {
                const treated = pf1.registry.materials.find(mat => mat.id === m.treatedAs);
                if (treated && !materialMap.has(treated.id)) {
                    materialMap.set(treated.id, {
                        id: treated.id,
                        label: treated.shortName || treated.name,
                        isMaterial: true
                    });
                }
            } else if (!materialMap.has(m.id)) {
                materialMap.set(m.id, {
                    id: m.id,
                    label: m.shortName || m.name,
                    isMaterial: true
                });
            }
        });
    const materials = Array.from(materialMap.values());

    const alignments = Object.entries(pf1.config.damageResistances).map(([id, name]) => ({
        id,
        label: name,
        isAlignment: true
    }));

    const customTypes = systemDamageTypes.filter(dt => !["misc", "energy", "physical"].includes(dt.category));

    let filteredTypes = [];
    if (category === "immunity") {
        filteredTypes = [
            ...systemDamageTypes,
            ...materials,
            ...alignments
        ];
    } else if (category === "resistance") {
        const energyOrUtility = systemDamageTypes.filter(dt => dt.isEnergy || dt.isUtility);
        filteredTypes = [
            ...energyOrUtility,
            ...customTypes
        ];
    } else if (category === "damageReduction") {
        const physical = systemDamageTypes.filter(dt => dt.isPhysical);
        filteredTypes = [
            ...physical,
            ...customTypes,
            ...materials,
            ...alignments
        ];
    } else {
        filteredTypes = [...systemDamageTypes];
    }

    const seen = new Set();
    let uniqueTypes = filteredTypes.filter(dt => {
        if (seen.has(dt.id)) return false;
        seen.add(dt.id);
        return true;
    });

    const specialOptions = [{ id: "all", label: "All" }];
    if (category === "damageReduction") {
        specialOptions.push({ id: "dr-none", label: "DR/-" });
    }
    const sortedTypes = uniqueTypes
        .filter(dt => dt.id !== "all" && dt.id !== "dr-none")
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    let result = [];
    if (category === "damageReduction") {
        result = [
            specialOptions[0],
            specialOptions[1],
            ...sortedTypes
        ];
    } else {
        result = [
            specialOptions[0],
            ...sortedTypes
        ];
    }
    return result;
}

/**
 * Helper function to get a value from the itemActionSettings structure
 * Rewritten to use the new nested path format and properly handle inheritance.
 */
function getActionSetting(item, actionId, settingPath, defaultValue = null) {
    const itemActionSettings = item.getFlag(AutomateDamageModule.MODULE.ID, 'itemActionSettings') || {};
    const globalSettings = item.getFlag(AutomateDamageModule.MODULE.ID, 'globalItemSettings') || {};
    
    const parts = settingPath.split('.');
    
    const actionSettings = itemActionSettings.actions?.find(a => a.id === actionId);
    
    if (!actionSettings) {
        return {
            value: defaultValue,
            isInherited: true
        };
    }
    
    if (parts[0] === 'attacks' && parts.length >= 3) {
        const attackKey = parts[1];
        const category = parts[2];
        
        const propertyPath = parts.length > 3 ? parts.slice(3).join('.') : '';
        
        const attack = actionSettings.attacks?.find(a => a.key === attackKey);
        
        if (!attack) {
            return {
                value: defaultValue,
                isInherited: true
            };
        }
        
        const attackCategoryObj = attack[category];
        
        if (attackCategoryObj && attackCategoryObj.inherit === false) {
            if (propertyPath) {
                let current = attackCategoryObj;
                const propParts = propertyPath.split('.');
                for (let i = 0; i < propParts.length; i++) {
                    if (!current || typeof current !== 'object') {
                        return {
                            value: defaultValue,
                            isInherited: false
                        };
                    }
                    current = current[propParts[i]];
                }
                return {
                    value: current !== undefined ? current : defaultValue,
                    isInherited: false
                };
            } else {
                return {
                    value: attackCategoryObj,
                    isInherited: false
                };
            }
        } else if (
            category === 'hardness' &&
            (propertyPath === 'bypass' || propertyPath.startsWith('bypass.') || propertyPath === 'ignore' || propertyPath.startsWith('ignore.'))
        ) {
            const sub = propertyPath.split('.')[0];
            const subObj = attackCategoryObj && attackCategoryObj[sub];
            if (subObj && subObj.inherit === false) {
                let current = subObj;
                const propParts = propertyPath.split('.').slice(1);
                if (propParts.length === 0) {
                    return {
                        value: current,
                        isInherited: false
                    };
                }
                for (let i = 0; i < propParts.length; i++) {
                    if (!current || typeof current !== 'object') {
                        return {
                            value: defaultValue,
                            isInherited: false
                        };
                    }
                    current = current[propParts[i]];
                }
                return {
                    value: current !== undefined ? current : defaultValue,
                    isInherited: false
                };
            } else if (subObj && subObj.inherit === true) {
                const actionLevelPath = settingPath.replace(/^attacks\.[^.]+\./, '');
                return getActionSetting(item, actionId, actionLevelPath, defaultValue);
            }
        }
        const actionCategoryObj = actionSettings[category];
        if (!actionCategoryObj || actionCategoryObj.inherit) {
            let globalValue = defaultValue;
            if (globalSettings[category]) {
                if (propertyPath) {
                    let current = globalSettings[category];
                    const propParts = propertyPath.split('.');
                    for (let i = 0; i < propParts.length; i++) {
                        if (!current || typeof current !== 'object') {
                            break;
                        }
                        current = current[propParts[i]];
                    }
                    if (current !== undefined) {
                        globalValue = current;
                    }
                } else {
                    globalValue = globalSettings[category];
                }
            }
            return {
                value: globalValue,
                isInherited: true
            };
        }
        if (propertyPath && parts[0] != 'attacks') {
            let current = actionCategoryObj;
            const propParts = propertyPath.split('.');
            for (let i = 0; i < propParts.length; i++) {
                if (!current || typeof current !== 'object') {
                    return {
                        value: defaultValue,
                        isInherited: false
                    };
                }
                current = current[propParts[i]];
            }
            if (
                category === 'hardness' &&
                (propertyPath === 'bypass' || propertyPath === 'ignore') &&
                current &&
                typeof current === 'object' &&
                'inherit' in current &&
                current.inherit === true
            ) {
                let actionValue = defaultValue;
                if (actionCategoryObj && typeof actionCategoryObj[propertyPath] === 'object' && 'enabled' in actionCategoryObj[propertyPath]) {
                    actionValue = actionCategoryObj[propertyPath].enabled;
                } else if (actionCategoryObj && typeof actionCategoryObj[propertyPath] !== 'undefined') {
                    actionValue = actionCategoryObj[propertyPath];
                }
                return {
                    value: actionValue,
                    isInherited: true
                };
            }
            if (category === 'hardness' && (propertyPath === 'bypass' || propertyPath === 'ignore')) {
                if (current && typeof current === 'object' && 'inherit' in current) {
                    if (propertyPath === 'bypass') {
                        return {
                            value: current.enabled !== undefined ? current.enabled : defaultValue,
                            isInherited: !!current.inherit
                        };
                    } else if (propertyPath === 'ignore') {
                        return {
                            value: current.enabled !== undefined ? current.enabled : defaultValue,
                            isInherited: !!current.inherit,
                            valueObj: current
                        };
                    }
                }
            }
            if (category === 'hardness' && (propertyPath.startsWith('bypass') || propertyPath.startsWith('ignore'))) {
                let parent = attackCategoryObj;
                const propParts = propertyPath.split('.');
                for (let i = 0; i < propParts.length - 1; i++) {
                    if (!parent || typeof parent !== 'object') break;
                    parent = parent[propParts[i]];
                }
                if (parent && typeof parent === 'object' && 'inherit' in parent) {
                    return {
                        value: current !== undefined ? current : defaultValue,
                        isInherited: !!parent.inherit
                    };
                }
            }
            return {
                value: current !== undefined ? current : defaultValue,
                isInherited: false
            };
        } else {
            return {
                value: actionCategoryObj,
                isInherited: true
            };
        }
    }
    else if (parts.length >= 1) {
        const category = parts[0];
        const propertyPath = parts.length > 1 ? parts.slice(1).join('.') : '';
        const actionCategoryObj = actionSettings[category];
        if (!actionCategoryObj || actionCategoryObj.inherit) {
            let globalValue = defaultValue;
            if (globalSettings[category]) {
                if (propertyPath) {
                    let current = globalSettings[category];
                    const propParts = propertyPath.split('.');
                    for (let i = 0; i < propParts.length; i++) {
                        if (!current || typeof current !== 'object') {
                            break;
                        }
                        current = current[propParts[i]];
                    }
                    if (current !== undefined) {
                        globalValue = current;
                    }
                } else {
                    globalValue = globalSettings[category];
                }
            }
            return {
                value: globalValue,
                isInherited: true
            };
        }
        if (propertyPath) {
            let current = actionCategoryObj;
            const propParts = propertyPath.split('.');
            for (let i = 0; i < propParts.length; i++) {
                if (!current || typeof current !== 'object') {
                    return {
                        value: defaultValue,
                        isInherited: false
                    };
                }
                current = current[propParts[i]];
            }
            if (
                category === 'hardness' &&
                propertyPath === 'bypass' &&
                current &&
                typeof current === 'object' &&
                'inherit' in current &&
                current.inherit === true
            ) {
                let globalValue = defaultValue;
                if (globalSettings[category] && typeof globalSettings[category].bypass === 'boolean') {
                    globalValue = globalSettings[category].bypass;
                }
                return {
                    value: globalValue,
                    isInherited: true
                };
            }
            if (category === 'hardness' && (propertyPath.startsWith('bypass') || propertyPath.startsWith('ignore'))) {
                let parent = actionCategoryObj;
                const propParts = propertyPath.split('.');
                for (let i = 0; i < propParts.length - 1; i++) {
                    if (!parent || typeof parent !== 'object') break;
                    parent = parent[propParts[i]];
                }
                if (parent && typeof parent === 'object' && 'inherit' in parent) {
                    return {
                        value: current !== undefined ? current : defaultValue,
                        isInherited: !!parent.inherit
                    };
                }
            }
            return {
                value: current !== undefined ? current : defaultValue,
                isInherited: false
            };
        } else {
            return {
                value: actionCategoryObj,
                isInherited: false
            };
        }
    }
    return {
        value: defaultValue,
        isInherited: true
    };
}
    
/**
 * Helper function to set a value in the itemActionSettings structure
 * Now supports only the new nested format for paths
 */
async function setActionSetting(item, actionId, settingPath, value, isInherited = false, parentEnabled = undefined, parentTypes = undefined) {
    const itemActionSettings = item.getFlag(AutomateDamageModule.MODULE.ID, 'itemActionSettings') || { actions: [] };
    
    if (!itemActionSettings.actions) {
        itemActionSettings.actions = [];
    }
    
    let actionIndex = itemActionSettings.actions.findIndex(a => a.id === actionId);
    let action;
    
    if (actionIndex === -1) {
        let actionName = `Action ${actionId}`;
        if (item.actions) {
            for (const action of item.actions) {
                if (action.id === actionId) {
                    actionName = (action && action.name) || actionName;
                    break;
                }
            }
        }
        action = {
            id: actionId,
            name: actionName,
            hardness: {
                bypass: { inherit: true },
                ignore: { inherit: true }
            },
            immunity: { inherit: true },
            resistance: { inherit: true },
            damageReduction: { inherit: true },
            attacks: []
        };
        itemActionSettings.actions.push(action);
        actionIndex = itemActionSettings.actions.length - 1;
    } else {
        action = itemActionSettings.actions[actionIndex];
    }
    
    const parts = settingPath.split('.');
    
    if (parts[0] === 'attacks') {
        const attackKey = parts[1];
        
        if (!attackKey || attackKey === 'undefined' || attackKey === 'null') {
            return;
        }
        
        if (parts.length < 3) {
            return;
        }
        
        const category = parts[2];
        const propertyPath = parts.slice(3).join('.');
        
        let attackIndex = action.attacks.findIndex(a => a.key === attackKey);
        let attack;
        
        if (attackIndex === -1) {
            attack = {
                name: attackKey,
                hardness: {
                    bypass: { inherit: true },
                    ignore: { inherit: true }
                },
                immunity: { inherit: true },
                resistance: { inherit: true },
                damageReduction: { inherit: true }
            };
            action.attacks.push(attack);
            attackIndex = action.attacks.length - 1;
        } else {
            attack = action.attacks[attackIndex];
        }
        
        if (isInherited) {
            if (category === 'hardness' && (propertyPath === 'bypass.inherit' || propertyPath === 'ignore.inherit')) {
                const sub = propertyPath.split('.')[0];
                if (!attack[category][sub]) attack[category][sub] = {};
                attack[category][sub].inherit = true;
            } else if (category === 'hardness' && !propertyPath) {
                // Do nothing: never set root-level inherit
            } else if (['immunity', 'resistance', 'damageReduction'].includes(category)) {
                if (!attack[category]) {
                    attack[category] = { inherit: true };
                } else {
                    attack[category].inherit = true;
                    if (attack[category].bypass) {
                        if (typeof parentEnabled !== 'undefined') attack[category].bypass.enabled = parentEnabled;
                        if (typeof parentTypes !== 'undefined') attack[category].bypass.types = Array.isArray(parentTypes) ? [...parentTypes] : parentTypes;
                    }
                }
            }
        } else {
            if (category === 'hardness' && (propertyPath === 'bypass.inherit' || propertyPath === 'ignore.inherit')) {
                const sub = propertyPath.split('.')[0];
                if (!attack[category][sub]) attack[category][sub] = {};
                attack[category][sub].inherit = false;
            } else if (category === 'hardness' && !propertyPath) {
                // Do nothing: never set root-level inherit
            } else if (['immunity', 'resistance', 'damageReduction'].includes(category)) {
                if (!attack[category]) {
                    attack[category] = { inherit: false };
                } else {
                    attack[category].inherit = false;
                }
            }
            if (propertyPath) {
                const propParts = propertyPath.split('.');
                let current = attack[category];
                for (let i = 0; i < propParts.length - 1; i++) {
                    if (!current[propParts[i]] || typeof current[propParts[i]] !== 'object') {
                        current[propParts[i]] = {};
                    }
                    current = current[propParts[i]];
                }
                current[propParts[propParts.length - 1]] = value;
            }
        }
        
        itemActionSettings.actions[actionIndex] = action;
        
        await item.setFlag(AutomateDamageModule.MODULE.ID, 'itemActionSettings', itemActionSettings);
    } 
    else {
        const category = parts[0];
        const propertyPath = parts.slice(1).join('.');
        
        if (isInherited) {
            if (category === 'hardness' && (propertyPath === 'bypass.inherit' || propertyPath === 'ignore.inherit')) {
                const sub = propertyPath.split('.')[0];
                if (!action[category][sub]) action[category][sub] = {};
                action[category][sub].inherit = true;
            } else if (category === 'hardness' && !propertyPath) {
                // Do nothing: never set root-level inherit
            } else if (['immunity', 'resistance', 'damageReduction'].includes(category)) {
                if (!action[category]) {
                    action[category] = { inherit: true };
                } else {
                    action[category].inherit = true;
                    if (action[category].bypass) {
                        if (typeof parentEnabled !== 'undefined') action[category].bypass.enabled = parentEnabled;
                        if (typeof parentTypes !== 'undefined') action[category].bypass.types = Array.isArray(parentTypes) ? [...parentTypes] : parentTypes;
                    }
                }
            }
        } else {
            if (category === 'hardness' && (propertyPath === 'bypass.inherit' || propertyPath === 'ignore.inherit')) {
                const sub = propertyPath.split('.')[0];
                if (!action[category][sub]) action[category][sub] = {};
                action[category][sub].inherit = false;
            } else if (category === 'hardness' && !propertyPath) {
            } else if (['immunity', 'resistance', 'damageReduction'].includes(category)) {
                if (!action[category]) {
                    action[category] = { inherit: false };
                } else {
                    action[category].inherit = false;
                }
            }
            if (propertyPath) {
                const propParts = propertyPath.split('.');
                let current = action[category];
                for (let i = 0; i < propParts.length - 1; i++) {
                    if (!current[propParts[i]] || typeof current[propParts[i]] !== 'object') {
                        current[propParts[i]] = {};
                    }
                    current = current[propParts[i]];
                }
                current[propParts[propParts.length - 1]] = value;
            }
        }
        
        itemActionSettings.actions[actionIndex] = action;
    }
    
    if (!parts[0] === 'attacks') {
        await item.setFlag(AutomateDamageModule.MODULE.ID, 'itemActionSettings', itemActionSettings);
    }
    
    if (typeof window !== 'undefined') {
        window._lastItemActionSettings = JSON.parse(JSON.stringify(itemActionSettings));
    }
}
    
/**
 * Global Item Settings Form Application
 * This handles the global damage automation settings for an item
 */
class GlobalDamageSettingsForm extends FormApplication {
    constructor(item, options = {}) {
        super(item, options);
        this.item = item;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "global-damage-settings",
            title: game.i18n.localize("PF1.AutomateDamage.GlobalSettings.Title"),
            template: `modules/${AutomateDamageModule.MODULE.ID}/templates/global-damage-settings.html`,
            width: 550,
            height: "auto",
            closeOnSubmit: true
        });
    }

    getData() {
        const globalSettings = this.item.getFlag(AutomateDamageModule.MODULE.ID, 'globalItemSettings') || {};
        
        const data = {
            itemId: this.item.id,
            itemName: this.item.name,
            bypassHardness: globalSettings.hardness?.bypass || false,
            ignoreHardness: globalSettings.hardness?.ignore?.enabled || false,
            ignoreHardnessValue: globalSettings.hardness?.ignore?.value || 0,
            bypassImmunityList: globalSettings.immunity?.bypass?.types || [],
            bypassResistanceList: globalSettings.resistance?.bypass?.types || [],
            bypassDRList: globalSettings.damageReduction?.bypass?.types || [],
            damageTypesImmunity: getDamageTypes('immunity'),
            damageTypesResistance: getDamageTypes('resistance'),
            damageTypesDR: getDamageTypes('damageReduction')
        };

        const allImmunityIds = data.damageTypesImmunity.map(dt => dt.id);
        data.bypassImmunityShowAllTag =
            data.bypassImmunityList.includes('all') &&
            data.bypassImmunityList.length === allImmunityIds.length;
        const allResistanceIds = data.damageTypesResistance.map(dt => dt.id);
        data.bypassResistanceShowAllTag =
            data.bypassResistanceList.includes('all') &&
            data.bypassResistanceList.length === allResistanceIds.length;
        const allDRIds = data.damageTypesDR.map(dt => dt.id);
        data.bypassDRShowAllTag =
            data.bypassDRList.includes('all') &&
            data.bypassDRList.length === allDRIds.length;
        
        return data;
    }

    async _updateObject(event, formData) {
        await initializeAutomateDamageFlags(this.item);
        const processedData = foundry.utils.expandObject(formData);
        
        ['bypassImmunityList', 'bypassResistanceList', 'bypassDRList'].forEach(key => {
            if (processedData[key]) {
                if (!Array.isArray(processedData[key])) {
                    processedData[key] = [processedData[key]];
                }
                processedData[key] = processedData[key].filter(item => item !== null && item !== undefined);
            } else {
                processedData[key] = [];
            }
        });
        
        if (processedData.ignoreHardnessValue === "" || 
            processedData.ignoreHardnessValue === null || 
            processedData.ignoreHardnessValue === undefined || 
            isNaN(Number(processedData.ignoreHardnessValue))) {
            processedData.ignoreHardnessValue = 0;
        } else {
            processedData.ignoreHardnessValue = Number(processedData.ignoreHardnessValue);
        }
        
        if (processedData.ignoreHardnessValue === 0) {
            processedData.ignoreHardness = false;
        }
        
        if (!processedData.ignoreHardness) {
            processedData.ignoreHardnessValue = 0;
        }
        
        const newStructure = {
            hardness: {
                bypass: processedData.bypassHardness || false,
                ignore: {
                    enabled: processedData.ignoreHardness || false,
                    value: processedData.ignoreHardnessValue || 0
                }
            },
            immunity: {
                bypass: {
                    enabled: processedData.bypassImmunityList.length > 0,
                    types: processedData.bypassImmunityList
                }
            },
            resistance: {
                bypass: {
                    enabled: processedData.bypassResistanceList.length > 0,
                    types: processedData.bypassResistanceList
                }
            },
            damageReduction: {
                bypass: {
                    enabled: processedData.bypassDRList.length > 0,
                    types: processedData.bypassDRList
                }
            }
        };
        
        await this.item.setFlag(AutomateDamageModule.MODULE.ID, 'globalItemSettings', newStructure);
        
        const itemActionSettings = this.item.getFlag(AutomateDamageModule.MODULE.ID, 'itemActionSettings') || { actions: [] };
        
        if (this.item.actions && this.item.actions.size > 0) {
            let needsUpdate = false;
        
            if (!itemActionSettings.actions) {
                itemActionSettings.actions = [];
                needsUpdate = true;
            }
            
            for (const systemAction of this.item.actions) {
                const existingAction = itemActionSettings.actions.find(a => a.id === systemAction.id);
                
                if (!existingAction) {
                    const newAction = {
                        id: systemAction.id,
                        name: systemAction.name || `Action ${systemAction.id}`,
                        hardness: {
                            bypass: { inherit: true },
                            ignore: { inherit: true }
                        },
                        immunity: { inherit: true },
                        resistance: { inherit: true },
                        damageReduction: { inherit: true },
                        attacks: []
                    };
                    
                    if (systemAction.getAttacks) {
                        const attacks = systemAction.getAttacks();
                        if (attacks && attacks.length > 0) {
                            for (const attack of attacks) {
                                const attackName = attack.label || `Attack`;
                                const attackKey = attackName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
                                newAction.attacks.push({
                                    name: attackName,
                                    key: attackKey,
                                    hardness: {
                                        bypass: { inherit: true },
                                        ignore: { inherit: true }
                                    },
                                    immunity: { inherit: true },
                                    resistance: { inherit: true },
                                    damageReduction: { inherit: true }
                                });
                            }
                        }
                    }
                    
                    const hasteKey = "haste";
                    const rapidShotKey = "rapid_shot";
                    
                    const existingAttackKeys = newAction.attacks.map(a => a.key || a.name);
                    
                    if (!existingAttackKeys.includes(hasteKey)) {
                        newAction.attacks.push({
                            name: hasteKey,
                            key: hasteKey,
                            hardness: {
                                bypass: { inherit: true },
                                ignore: { inherit: true }
                            },
                            immunity: { inherit: true },
                            resistance: { inherit: true },
                            damageReduction: { inherit: true }
                        });
                    }
                    
                    if (!existingAttackKeys.includes(rapidShotKey)) {
                        newAction.attacks.push({
                            name: rapidShotKey,
                            key: rapidShotKey,
                            hardness: {
                                bypass: { inherit: true },
                                ignore: { inherit: true }
                            },
                            immunity: { inherit: true },
                            resistance: { inherit: true },
                            damageReduction: { inherit: true }
                        });
                    }
                    
                    itemActionSettings.actions.push(newAction);
                    needsUpdate = true;
                }
            }
            
            if (needsUpdate) {
                await this.item.setFlag(AutomateDamageModule.MODULE.ID, 'itemActionSettings', itemActionSettings);
            }
        }
        
        if (!itemActionSettings.actions || itemActionSettings.actions.length === 0) {
            return;
        }
        
        let needsUpdate = false;
        
        for (const action of itemActionSettings.actions) {
            if (!action.hardness) {
                action.hardness = {
                    bypass: { enabled: false, inherit: true },
                    ignore: { enabled: false, inherit: true, value: 0 }
                };
                needsUpdate = true;
            }
            
            if (!action.immunity) {
                action.immunity = { inherit: true };
                needsUpdate = true;
            }
            
            if (!action.resistance) {
                action.resistance = { inherit: true };
                needsUpdate = true;
            }
            
            if (!action.damageReduction) {
                action.damageReduction = { inherit: true };
                needsUpdate = true;
            }
            
            if (
                (action.hardness.bypass?.inherit !== false && action.hardness.ignore?.inherit !== false)
            ) {
                const bypassSame = action.hardness.bypass?.enabled === newStructure.hardness.bypass;
                const ignoreSame = action.hardness.ignore?.enabled === newStructure.hardness.ignore.enabled &&
                                   action.hardness.ignore?.value === newStructure.hardness.ignore.value;
                if (!bypassSame || !ignoreSame) {
                    action.hardness = {
                        bypass: {
                            enabled: newStructure.hardness.bypass,
                            inherit: true
                        },
                        ignore: {
                            enabled: newStructure.hardness.ignore.enabled,
                            inherit: true,
                            value: newStructure.hardness.ignore.value
                        }
                    };
                    needsUpdate = true;
                }
            } else {
                if (!action.hardness.bypass || typeof action.hardness.bypass !== 'object') {
                    action.hardness.bypass = {
                        enabled: !!action.hardness.bypass,
                        inherit: false
                    };
                    needsUpdate = true;
                }
                if (!action.hardness.ignore || typeof action.hardness.ignore !== 'object') {
                    action.hardness.ignore = {
                        enabled: false,
                        inherit: false,
                        value: 0
                    };
                    needsUpdate = true;
                }
                if (action.hardness.ignore.enabled === undefined) {
                    action.hardness.ignore.enabled = false;
                    needsUpdate = true;
                }
                if (action.hardness.ignore.inherit === undefined) {
                    action.hardness.ignore.inherit = false;
                    needsUpdate = true;
                }
                if (action.hardness.ignore.value === undefined) {
                    action.hardness.ignore.value = 0;
                    needsUpdate = true;
                }
            }
            
            if (action.immunity.inherit) {
                const immunityBypassSame = (action.immunity.bypass?.enabled === newStructure.immunity.bypass.enabled) &&
                    Array.isArray(action.immunity.bypass?.types) && Array.isArray(newStructure.immunity.bypass.types) &&
                    action.immunity.bypass.types.length === newStructure.immunity.bypass.types.length &&
                    action.immunity.bypass.types.every(type => newStructure.immunity.bypass.types.includes(type));
                if (!immunityBypassSame) {
                    action.immunity.bypass = {
                        enabled: newStructure.immunity.bypass.enabled,
                        types: [...newStructure.immunity.bypass.types]
                    };
                    needsUpdate = true;
                }
            } else {
                if (!action.immunity.bypass) {
                    action.immunity.bypass = {
                        enabled: newStructure.immunity.bypass.enabled,
                        types: [...newStructure.immunity.bypass.types]
                    };
                    needsUpdate = true;
                } else {
                    if (action.immunity.bypass.enabled === undefined) {
                        action.immunity.bypass.enabled = newStructure.immunity.bypass.enabled;
                        needsUpdate = true;
                    }
                    if (!action.immunity.bypass.types) {
                        action.immunity.bypass.types = [...newStructure.immunity.bypass.types];
                        needsUpdate = true;
                    }
                }
            }
            
            if (action.resistance.inherit) {
                const resistanceBypassSame = (action.resistance.bypass?.enabled === newStructure.resistance.bypass.enabled) &&
                    Array.isArray(action.resistance.bypass?.types) && Array.isArray(newStructure.resistance.bypass.types) &&
                    action.resistance.bypass.types.length === newStructure.resistance.bypass.types.length &&
                    action.resistance.bypass.types.every(type => newStructure.resistance.bypass.types.includes(type));
                if (!resistanceBypassSame) {
                    action.resistance.bypass = {
                        enabled: newStructure.resistance.bypass.enabled,
                        types: [...newStructure.resistance.bypass.types]
                    };
                    needsUpdate = true;
                }
            } else {
                if (!action.resistance.bypass) {
                    action.resistance.bypass = {
                        enabled: newStructure.resistance.bypass.enabled,
                        types: [...newStructure.resistance.bypass.types]
                    };
                    needsUpdate = true;
                } else {
                    if (action.resistance.bypass.enabled === undefined) {
                        action.resistance.bypass.enabled = newStructure.resistance.bypass.enabled;
                        needsUpdate = true;
                    }
                    if (!action.resistance.bypass.types) {
                        action.resistance.bypass.types = [...newStructure.resistance.bypass.types];
                        needsUpdate = true;
                    }
                }
            }
            
            if (action.damageReduction.inherit) {
                const drBypassSame = (action.damageReduction.bypass?.enabled === newStructure.damageReduction.bypass.enabled) &&
                    Array.isArray(action.damageReduction.bypass?.types) && Array.isArray(newStructure.damageReduction.bypass.types) &&
                    action.damageReduction.bypass.types.length === newStructure.damageReduction.bypass.types.length &&
                    action.damageReduction.bypass.types.every(type => newStructure.damageReduction.bypass.types.includes(type));
                if (!drBypassSame) {
                    action.damageReduction.bypass = {
                        enabled: newStructure.damageReduction.bypass.enabled,
                        types: [...newStructure.damageReduction.bypass.types]
                    };
                    needsUpdate = true;
                }
            } else {
                if (!action.damageReduction.bypass) {
                    action.damageReduction.bypass = {
                        enabled: newStructure.damageReduction.bypass.enabled,
                        types: [...newStructure.damageReduction.bypass.types]
                    };
                    needsUpdate = true;
                } else {
                    if (action.damageReduction.bypass.enabled === undefined) {
                        action.damageReduction.bypass.enabled = newStructure.damageReduction.bypass.enabled;
                        needsUpdate = true;
                    }
                    if (!action.damageReduction.bypass.types) {
                        action.damageReduction.bypass.types = [...newStructure.damageReduction.bypass.types];
                        needsUpdate = true;
                    }
                }
            }
            
            if (!action.attacks) {
                action.attacks = [];
                needsUpdate = true;
            }
            
            if (action.attacks && action.attacks.length > 0) {
                for (const attack of action.attacks) {
                    if (!attack.hardness) {
                        attack.hardness = {
                            bypass: { enabled: false, inherit: true },
                            ignore: { enabled: false, inherit: true, value: 0 }
                        };
                        needsUpdate = true;
                    }
                    
                    if (!attack.immunity) {
                        attack.immunity = { inherit: true };
                        needsUpdate = true;
                    }
                    
                    if (!attack.resistance) {
                        attack.resistance = { inherit: true };
                        needsUpdate = true;
                    }
                    
                    if (!attack.damageReduction) {
                        attack.damageReduction = { inherit: true };
                        needsUpdate = true;
                    }
                    
                    if (attack.hardness.bypass?.inherit !== false && attack.hardness.ignore?.inherit !== false) {
                        let compareBypass, compareIgnoreEnabled, compareIgnoreValue;
                        if (action.hardness.bypass?.inherit !== false && action.hardness.ignore?.inherit !== false) {
                            compareBypass = newStructure.hardness.bypass;
                            compareIgnoreEnabled = newStructure.hardness.ignore.enabled;
                            compareIgnoreValue = newStructure.hardness.ignore.value;
                        } else {
                            compareBypass = action.hardness.bypass?.enabled;
                            compareIgnoreEnabled = action.hardness.ignore?.enabled;
                            compareIgnoreValue = action.hardness.ignore?.value;
                        }
                        const bypassSame = attack.hardness.bypass?.enabled === compareBypass;
                        const ignoreSame = attack.hardness.ignore?.enabled === compareIgnoreEnabled &&
                                           attack.hardness.ignore?.value === compareIgnoreValue;
                        if (!bypassSame || !ignoreSame) {
                            attack.hardness = {
                                bypass: {
                                    enabled: compareBypass,
                                    inherit: true
                                },
                                ignore: {
                                    enabled: compareIgnoreEnabled,
                                    inherit: true,
                                    value: compareIgnoreValue
                                }
                            };
                            needsUpdate = true;
                        }
                    } else {
                        if (!attack.hardness.bypass || typeof attack.hardness.bypass !== 'object') {
                            attack.hardness.bypass = {
                                enabled: !!attack.hardness.bypass,
                                inherit: false
                            };
                            needsUpdate = true;
                        }
                        if (!attack.hardness.ignore || typeof attack.hardness.ignore !== 'object') {
                            attack.hardness.ignore = {
                                enabled: false,
                                inherit: false,
                                value: 0
                            };
                            needsUpdate = true;
                        }
                        if (attack.hardness.ignore.enabled === undefined) {
                            attack.hardness.ignore.enabled = false;
                            needsUpdate = true;
                        }
                        if (attack.hardness.ignore.inherit === undefined) {
                            attack.hardness.ignore.inherit = false;
                            needsUpdate = true;
                        }
                        if (attack.hardness.ignore.value === undefined) {
                            attack.hardness.ignore.value = 0;
                            needsUpdate = true;
                        }
                    }
                    if (
                        attack.immunity.inherit || 
                        attack.resistance.inherit || 
                        attack.damageReduction.inherit
                    ) {
                    function updateAttackBypassCategory(cat, globalCat, actionCat) {
                        if (!attack[cat]) attack[cat] = { inherit: true };
                        if (attack[cat].inherit === true) {
                            let compareEnabled, compareTypes;
                            if (actionCat?.inherit !== false) {
                                compareEnabled = newStructure[globalCat].bypass.enabled;
                                compareTypes = Array.isArray(newStructure[globalCat].bypass.types) ? [...newStructure[globalCat].bypass.types] : [];
                            } else {
                                compareEnabled = actionCat?.bypass?.enabled ?? false;
                                compareTypes = Array.isArray(actionCat?.bypass?.types) ? [...actionCat.bypass.types] : [];
                            }
                            const enabledSame = attack[cat].bypass?.enabled === compareEnabled;
                            const typesSame = Array.isArray(attack[cat].bypass?.types) && Array.isArray(compareTypes) &&
                                attack[cat].bypass.types.length === compareTypes.length &&
                                attack[cat].bypass.types.every(type => compareTypes.includes(type));
                            if (!enabledSame || !typesSame) {
                                attack[cat].bypass = {
                                    enabled: compareEnabled,
                                    types: [...compareTypes]
                                };
                                needsUpdate = true;
                            }
                        }
                    }
                    updateAttackBypassCategory('immunity', 'immunity', action.immunity);
                    updateAttackBypassCategory('resistance', 'resistance', action.resistance);
                    updateAttackBypassCategory('damageReduction', 'damageReduction', action.damageReduction);
                    }
                }
            }
        }
        
        if (needsUpdate) {
            await this.item.setFlag(AutomateDamageModule.MODULE.ID, 'itemActionSettings', itemActionSettings);
        }
    }

    activateListeners(html) {
        super.activateListeners(html);
        
        const initializeMultiselectContainers = () => {
            html.find('.multiselect-container').each((index, container) => {
                const tagsContainer = $(container).find('.multiselect-tags-container');
                const tags = tagsContainer.find('.multiselect-tag');
                
                if (tags.length === 0 && !tagsContainer.find('.multiselect-placeholder').length) {
                    tagsContainer.html('<span class="multiselect-placeholder">None Selected</span>');
                }
            });
        };
        
        initializeMultiselectContainers();
        
        html.find('.toggle-input').change(event => {
            const target = event.currentTarget;
            const targetClass = target.dataset.target;
            const targetElement = html.find(`.${targetClass}`);
            targetElement.toggleClass('hidden', !target.checked);
        });
        
        html.find('.multiselect-tags-container, .multiselect-dropdown-toggle').click(event => {
            const container = $(event.currentTarget).closest('.multiselect-container');
            const dropdown = container.find('.multiselect-dropdown');
            
            html.find('.multiselect-dropdown.visible').not(dropdown).removeClass('visible');
            
            if (!dropdown.hasClass('visible')) {
                const rect = container[0].getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                
                dropdown.css({
                    'left': rect.left + 'px',
                    'top': rect.bottom + 'px',
                    'width': rect.width + 'px'
                });
                
                const dropdownHeight = 300;
                if (rect.bottom + dropdownHeight > viewportHeight) {
                    dropdown.css('top', (rect.top - dropdownHeight) + 'px');
                }
            }
            
            dropdown.toggleClass('visible');
            
            if (dropdown.hasClass('visible')) {
                const searchInput = dropdown.find('.multiselect-search-input');
                searchInput.focus();
                
                container.find('.multiselect-dropdown-toggle i').css('transform', 'rotate(180deg)');
            } else {
                container.find('.multiselect-dropdown-toggle i').css('transform', '');
            }
        });
        
        $(document).on('click.multiSelectDropdowns', event => {
            if (!$(event.target).closest('.multiselect-container').length &&
                !$(event.target).closest('.multiselect-dropdown').length) {
                $('.multiselect-dropdown.visible').removeClass('visible');
                $('.multiselect-dropdown-toggle i').css('transform', '');
            }
        });
        
        html.find('.multiselect-search-input').on('input', event => {
            const searchValue = $(event.currentTarget).val().toLowerCase();
            const dropdown = $(event.currentTarget).closest('.multiselect-dropdown');
            
            dropdown.find('.multiselect-option').each(function() {
                const option = $(this);
                const text = option.text().toLowerCase();
                option.toggle(text.includes(searchValue));
            });
        });
        
        $(document).on('click.tagRemoval', '.global-damage-settings .remove-tag', function(event) {
            event.stopPropagation();
            const tag = $(this).closest('.multiselect-tag');
            const value = tag.data('value');
            const container = tag.closest('.multiselect-container');
            const dropdown = container.find('.multiselect-dropdown');
            if (value === 'all') {
                container.find('input[type="checkbox"]').prop('checked', false);
                container.find('.multiselect-option').removeClass('selected');
            } else {
                container.find(`input[value="${value}"]`).prop('checked', false);
            }
            tag.remove();
            dropdown.find(`.multiselect-option input[value="${value}"]`).closest('.multiselect-option').removeClass('selected');
            const tagsContainer = container.find('.multiselect-tags-container');
            if (tagsContainer.find('.multiselect-tag').length === 0) {
                tagsContainer.html('<span class="multiselect-placeholder">None Selected</span>');
            }
        });
        
        html.find('.multiselect-option input[type="checkbox"]').change(function() {
            const option = $(this).closest('.multiselect-option');
            const container = option.closest('.multiselect-container');
            const tagsContainer = container.find('.multiselect-tags-container');
            const checkbox = $(this);
            const optionElement = checkbox.closest('.multiselect-option');
            const value = checkbox.attr('data-value') || optionElement.attr('data-value') || optionElement.find('span').text().toLowerCase();
            const label = option.find('span').text();
            const isChecked = $(this).prop('checked');
            const allCheckbox = container.find('input[type="checkbox"][value="all"]');
            const allOption = container.find('.multiselect-option input[value="all"]').closest('.multiselect-option');
            const allTag = `<div class="multiselect-tag" data-value="all"><span>All</span><i class="fas fa-times remove-tag"></i></div>`;
            const checkboxes = container.find('.multiselect-option input[type="checkbox"]');
            const nonAllCheckboxes = checkboxes.filter(function() { return $(this).val() !== 'all'; });
            if (value === 'all') {
                if (isChecked) {
                    checkboxes.prop('checked', true);
                    checkboxes.closest('.multiselect-option').addClass('selected');
                    tagsContainer.empty().append(allTag);
                } else {
                    checkboxes.prop('checked', false);
                    checkboxes.closest('.multiselect-option').removeClass('selected');
                    tagsContainer.empty().html('<span class="multiselect-placeholder">None Selected</span>');
                }
            } else {
                if (!isChecked && allCheckbox.prop('checked')) {
                    allCheckbox.prop('checked', false);
                    allOption.removeClass('selected');
                    tagsContainer.find('.multiselect-tag[data-value="all"]').remove();
                }
                if (nonAllCheckboxes.length > 0 && nonAllCheckboxes.filter(':checked').length === nonAllCheckboxes.length) {
                    allCheckbox.prop('checked', true);
                    allOption.addClass('selected');
                    tagsContainer.empty().append(allTag);
                } else {
                    tagsContainer.find('.multiselect-tag[data-value="all"]').remove();
                    if (isChecked) {
                        tagsContainer.find('.multiselect-placeholder').remove();
                        const tag = $(`<div class="multiselect-tag" data-value="${value}"><span>${label}</span><i class="fas fa-times remove-tag"></i></div>`);
                        tagsContainer.append(tag);
                    } else {
                        tagsContainer.find(`.multiselect-tag[data-value="${value}"]`).remove();
                        if (tagsContainer.find('.multiselect-tag').length === 0) {
                            tagsContainer.html('<span class="multiselect-placeholder">None Selected</span>');
                        }
                    }
                }
            }
            let selected = checkboxes.filter(':checked').map(function() { return $(this).attr('data-value'); }).get();
            const hiddenInputsContainer = container.find(hiddenInputsClass);
            hiddenInputsContainer.empty();
            selected.forEach(typeId => {
                let inputName;
                if (attackKey) {
                    inputName = `attacks.${attackKey}.${category}.bypass.types`;
                } else {
                    inputName = `${category}.bypass.types`;
                }
                hiddenInputsContainer.append(`<input type="hidden" name="${inputName}" value="${typeId}">`);
            });
        });
    }

    close(options) {
        $(document).off('click.multiSelectDropdowns');
        $(document).off('click.tagRemoval');
        
        return super.close(options);
    }
}

/**
 * Action-specific Damage Settings Form Application
 * This handles the damage automation settings for a specific action
 */
class ActionDamageSettingsForm extends FormApplication {
    constructor(item, actionId, options = {}) {
        super(item, options);
        this.item = item;
        this.actionId = actionId;
        
        this.action = null;
        if (item.actions) {
            for (const action of item.actions) {
                    if (action.id === actionId) {
                    this.action = action;
                        break;
                    }
                }
            }
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "action-damage-settings",
            title: game.i18n.localize("PF1.AutomateDamage.ActionSettings.Title"),
            template: `modules/${AutomateDamageModule.MODULE.ID}/templates/action-damage-settings.html`,
            width: 620,
            height: 620,
            closeOnSubmit: true
        });
    }

    getData() {
        const globalSettings = this.item.getFlag(AutomateDamageModule.MODULE.ID, 'globalItemSettings') || {};
        const globalBypassHardness = globalSettings.hardness?.bypass || false;
        const globalIgnoreHardness = globalSettings.hardness?.ignore?.enabled || false;
        const globalIgnoreHardnessValue = globalSettings.hardness?.ignore?.value || 0;
        const globalBypassImmunityList = globalSettings.immunity?.bypass?.types || [];
        const globalBypassResistanceList = globalSettings.resistance?.bypass?.types || [];
        const globalBypassDRList = globalSettings.damageReduction?.bypass?.types || [];
        this.globalIgnoreHardnessValue = globalIgnoreHardnessValue;
        
        const bypassHardnessResult = getActionSetting(this.item, this.actionId, 'hardness.bypass', globalBypassHardness);
        const ignoreHardnessResult = getActionSetting(this.item, this.actionId, 'hardness.ignore.enabled', globalIgnoreHardness);
        const ignoreHardnessValueResult = getActionSetting(this.item, this.actionId, 'hardness.ignore.value', globalIgnoreHardnessValue);
        
        const actionHardness = {
            bypass: {
                inherit: !!bypassHardnessResult.isInherited,
                enabled: (typeof bypassHardnessResult.value === 'object' && bypassHardnessResult.value !== null && 'enabled' in bypassHardnessResult.value)
                    ? !!bypassHardnessResult.value.enabled
                    : !!bypassHardnessResult.value
            },
            ignore: {
                inherit: !!ignoreHardnessResult.isInherited,
                enabled: (typeof ignoreHardnessResult.value === 'object' && ignoreHardnessResult.value !== null && 'enabled' in ignoreHardnessResult.value)
                    ? !!ignoreHardnessResult.value.enabled
                    : !!ignoreHardnessResult.value,
                value: ignoreHardnessValueResult.value
            }
        };
        
        const bypassImmunityListResult = getActionSetting(this.item, this.actionId, 'immunity.bypass.types', globalBypassImmunityList);
        const bypassResistanceListResult = getActionSetting(this.item, this.actionId, 'resistance.bypass.types', globalBypassResistanceList);
        const bypassDRListResult = getActionSetting(this.item, this.actionId, 'damageReduction.bypass.types', globalBypassDRList);
        
        let bypassImmunityList = bypassImmunityListResult.isInherited 
            ? [...globalBypassImmunityList] 
            : bypassImmunityListResult.value;
        let bypassResistanceList = bypassResistanceListResult.isInherited
            ? [...globalBypassResistanceList]
            : bypassResistanceListResult.value;
        let bypassDRList = bypassDRListResult.isInherited
            ? [...globalBypassDRList]
            : bypassDRListResult.value;
        const labelForId = id => getDamageTypes().find(dt => dt.id === id)?.label || id;
        bypassImmunityList = (bypassImmunityList || []).slice().sort((a, b) => labelForId(a).localeCompare(labelForId(b), undefined, { sensitivity: 'base' }));
        bypassResistanceList = (bypassResistanceList || []).slice().sort((a, b) => labelForId(a).localeCompare(labelForId(b), undefined, { sensitivity: 'base' }));
        bypassDRList = (bypassDRList || []).slice().sort((a, b) => labelForId(a).localeCompare(labelForId(b), undefined, { sensitivity: 'base' }));

        const bypassImmunity = bypassImmunityList.length > 0;
        const bypassResistance = bypassResistanceList.length > 0;
        const bypassDR = bypassDRList.length > 0;

        let attacks = [];
        if (this.action?.getAttacks) {
            attacks = this.action.getAttacks().map(a => {
                if (!a.key) {
                    return {
                        ...a,
                        key: a.label ? a.label.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') : undefined
                    };
                }
                return a;
            });
        }
        
        const hasteLabel = game.i18n.localize("PF1.Haste");
        const rapidShotLabel = game.i18n.localize("PF1.RapidShot");
        
        const hasteKey = "haste";
        const rapidShotKey = "rapid_shot";
        
        const attackKeys = attacks.map(a => a.key).filter(k => k !== null && k !== undefined);
        
        if (!attackKeys.includes(hasteKey)) {
            attacks.push({
                label: hasteLabel,
                key: hasteKey
            });
        }
        
        if (!attackKeys.includes(rapidShotKey)) {
            attacks.push({
                label: rapidShotLabel,
                key: rapidShotKey
            });
        }
        
        const attackSettings = [];
        attacks.forEach((attack, index) => {
            const attackName = attack.label || `Attack ${index + 1}`;
            const attackKey = attack.key || attackName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
            
            const itemActionSettings = this.item.getFlag(AutomateDamageModule.MODULE.ID, 'itemActionSettings') || { actions: [] };
            const actionEntry = itemActionSettings.actions?.find(a => a.id === this.actionId);
            const attackEntry = actionEntry?.attacks?.find(a => a.key === attackKey);
            
            let bypassHardnessEnabled;
            if (attackEntry && attackEntry.hardness && attackEntry.hardness.bypass && attackEntry.hardness.bypass.inherit === false) {
                bypassHardnessEnabled = attackEntry.hardness.bypass.enabled ?? false;
            } else {
                bypassHardnessEnabled = getActionSetting(this.item, this.actionId, `attacks.${attackKey}.hardness.bypass`, actionHardness.bypass.enabled).value;
            }
            const bypassHardnessResult = getActionSetting(this.item, this.actionId, `attacks.${attackKey}.hardness.bypass`, actionHardness.bypass.enabled);
            const ignoreHardnessResult = getActionSetting(this.item, this.actionId, `attacks.${attackKey}.hardness.ignore.enabled`, actionHardness.ignore.enabled);
            let ignoreHardnessValue;
            if (attackEntry && attackEntry.hardness && attackEntry.hardness.ignore && attackEntry.hardness.ignore.inherit === false) {
                ignoreHardnessValue = attackEntry.hardness.ignore.value ?? 0;
            } else {
                ignoreHardnessValue = getActionSetting(this.item, this.actionId, `attacks.${attackKey}.hardness.ignore.value`, actionHardness.ignore.value).value;
            }
            const attackHardness = {
                bypass: {
                    inherit: !!bypassHardnessResult.isInherited,
                    enabled: !!bypassHardnessEnabled
                },
                ignore: {
                    inherit: !!ignoreHardnessResult.isInherited,
                    enabled: (typeof ignoreHardnessResult.value === 'object' && ignoreHardnessResult.value !== null && 'enabled' in ignoreHardnessResult.value)
                        ? !!ignoreHardnessResult.value.enabled
                        : !!ignoreHardnessResult.value,
                    value: ignoreHardnessValue
                }
            };
            
            const bypassImmunityListResult = getActionSetting(this.item, this.actionId, `attacks.${attackKey}.immunity.bypass.types`, bypassImmunityList);
            const attackBypassImmunityList = bypassImmunityListResult.isInherited 
                ? [...bypassImmunityList]
                : bypassImmunityListResult.value;
            const attackBypassImmunity = attackBypassImmunityList.length > 0;
            
            const bypassResistanceListResult = getActionSetting(this.item, this.actionId, `attacks.${attackKey}.resistance.bypass.types`, bypassResistanceList);
            const attackBypassResistanceList = bypassResistanceListResult.isInherited
                ? [...bypassResistanceList]
                : bypassResistanceListResult.value;
            const attackBypassResistance = attackBypassResistanceList.length > 0;
            
            const bypassDRListResult = getActionSetting(this.item, this.actionId, `attacks.${attackKey}.damageReduction.bypass.types`, bypassDRList);
            const attackBypassDRList = bypassDRListResult.isInherited
                ? [...bypassDRList]
                : bypassDRListResult.value;
            const attackBypassDR = attackBypassDRList.length > 0;

            const attackSettingObj = {
                name: attackName,
                key: attackKey,
                hardness: attackHardness,
                immunity: {
                    inherit: attackEntry?.immunity?.inherit || false,
                    bypass: {
                        enabled: attackBypassImmunity,
                        types: attackBypassImmunityList,
                        isInheritedTypes: bypassImmunityListResult.isInherited
                    }
                },
                resistance: {
                    inherit: attackEntry?.resistance?.inherit || false,
                    bypass: {
                        enabled: attackBypassResistance,
                        types: attackBypassResistanceList,
                        isInheritedTypes: bypassResistanceListResult.isInherited
                    }
                },
                damageReduction: {
                    inherit: attackEntry?.damageReduction?.inherit || false,
                    bypass: {
                        enabled: attackBypassDR,
                        types: attackBypassDRList,
                        isInheritedTypes: bypassDRListResult.isInherited
                    }
                }
            };
            
            attackSettings.push(attackSettingObj);
        });
        
        const hasNoActiveAttackSettings = attackSettings.every(attack =>
            (attack.hardness.bypass.inherit && attack.hardness.ignore.inherit) &&
            attack.immunity.bypass.isInheritedTypes &&
            attack.resistance.bypass.isInheritedTypes &&
            attack.damageReduction.bypass.isInheritedTypes
        );
        
        const damageTypesImmunity = getDamageTypes('immunity');
        const damageTypesResistance = getDamageTypes('resistance');
        const damageTypesDR = getDamageTypes('damageReduction');
        
        const itemActionSettings = this.item.getFlag(AutomateDamageModule.MODULE.ID, 'itemActionSettings') || { actions: [] };
        const actionEntry = itemActionSettings.actions?.find(a => a.id === this.actionId) || {
            hardness: {
                bypass: { inherit: true },
                ignore: { inherit: true }
            },
            immunity: { inherit: true },
            resistance: { inherit: true },
            damageReduction: { inherit: true }
        };
        
        const data = {
            itemId: this.item.id,
            itemName: this.item.name,
            actionId: this.actionId,
            actionName: this.action?.name || `Action ${this.actionId}`,
            
            action: {
                hardness: actionHardness,
                immunity: {
                    inherit: actionEntry.immunity?.inherit || false,
                    bypass: {
                        enabled: bypassImmunity,
                        types: bypassImmunityList,
                        isInheritedTypes: bypassImmunityListResult.isInherited
                    }
                },
                resistance: {
                    inherit: actionEntry.resistance?.inherit || false,
                    bypass: {
                        enabled: bypassResistance,
                        types: bypassResistanceList,
                        isInheritedTypes: bypassResistanceListResult.isInherited
                    }
                },
                damageReduction: {
                    inherit: actionEntry.damageReduction?.inherit || false,
                    bypass: {
                        enabled: bypassDR,
                        types: bypassDRList,
                        isInheritedTypes: bypassDRListResult.isInherited
                    }
                }
            },
            
            global: {
                immunity: { bypass: { types: globalBypassImmunityList } },
                resistance: { bypass: { types: globalBypassResistanceList } },
                damageReduction: { bypass: { types: globalBypassDRList } }
            },
            
            attacks: attackSettings,
            
            damageTypesImmunity: damageTypesImmunity,
            damageTypesResistance: damageTypesResistance,
            damageTypesDR: damageTypesDR,
            
            helpers: {
                includes: function(array, value) {
                    return Array.isArray(array) && array.includes(value);
                }
            },
            hasNoActiveAttackSettings,
        };
        
        const allImmunityIds = damageTypesImmunity.map(dt => dt.id);
        data.actionBypassImmunityShowAllTag =
            data.action.immunity.bypass.types.includes('all') &&
            data.action.immunity.bypass.types.length === allImmunityIds.length;
        const allResistanceIds = damageTypesResistance.map(dt => dt.id);
        data.actionBypassResistanceShowAllTag =
            data.action.resistance.bypass.types.includes('all') &&
            data.action.resistance.bypass.types.length === allResistanceIds.length;
        const allDRIds = damageTypesDR.map(dt => dt.id);
        data.actionBypassDRShowAllTag =
            data.action.damageReduction.bypass.types.includes('all') &&
            data.action.damageReduction.bypass.types.length === allDRIds.length;

        data.actionBypassImmunityShowAllTagInherited =
            data.action.immunity.bypass.isInheritedTypes &&
            data.action.immunity.bypass.types.includes('all') &&
            data.action.immunity.bypass.types.length === allImmunityIds.length;
        data.actionBypassResistanceShowAllTagInherited =
            data.action.resistance.bypass.isInheritedTypes &&
            data.action.resistance.bypass.types.includes('all') &&
            data.action.resistance.bypass.types.length === allResistanceIds.length;
        data.actionBypassDRShowAllTagInherited =
            data.action.damageReduction.bypass.isInheritedTypes &&
            data.action.damageReduction.bypass.types.includes('all') &&
            data.action.damageReduction.bypass.types.length === allDRIds.length;
        
        window.actionData = data;
        
        return data;
    }
    
    async _updateObject(event, formData) {
        await initializeAutomateDamageFlags(this.item);
        const data = foundry.utils.expandObject(formData);
        
        const globalSettings = this.item.getFlag(AutomateDamageModule.MODULE.ID, 'globalItemSettings') || {};
        const globalBypassHardness = globalSettings.hardness?.bypass || false;
        const globalIgnoreHardness = globalSettings.hardness?.ignore?.enabled || false;
        const globalIgnoreHardnessValue = globalSettings.hardness?.ignore?.value || 0;
        const globalBypassImmunityList = globalSettings.immunity?.bypass?.types || [];
        const globalBypassResistanceList = globalSettings.resistance?.bypass?.types || [];
        const globalBypassDRList = globalSettings.damageReduction?.bypass?.types || [];
        
        const currentSettings = this.item.getFlag(AutomateDamageModule.MODULE.ID, 'itemActionSettings') || { actions: [] };
        const currentAction = currentSettings.actions?.find(a => a.id === this.actionId);
        
        const hardnessInherited = data.hardness?.inherit === true || data.hardness?.inherit === 'true';
        const immunityInherited = data.immunity?.inherit === true || data.immunity?.inherit === 'true';
        const resistanceInherited = data.resistance?.inherit === true || data.resistance?.inherit === 'true';
        const damageReductionInherited = data.damageReduction?.inherit === true || data.damageReduction?.inherit === 'true';
        
        const processDamageTypeList = (nestedList) => {
            if (!nestedList) {
                return [];
            }
            
            if (Array.isArray(nestedList)) {
                return nestedList.filter(item => item !== null && item !== undefined);
            } else if (typeof nestedList === 'string') {
                return [nestedList];
            }
            
            return [];
        };
        
        const bypassImmunityList = processDamageTypeList(
            data.immunity?.bypass?.types
        );
        
        const bypassResistanceList = processDamageTypeList(
            data.resistance?.bypass?.types
        );
        
        const bypassDRList = processDamageTypeList(
            data.damageReduction?.bypass?.types
        );
        
        const bypassImmunity = bypassImmunityList.length > 0;
        const bypassResistance = bypassResistanceList.length > 0;
        const bypassDR = bypassDRList.length > 0;
        
        const bypassHardnessInherited = data.hardness?.bypass?.inherit === true || data.hardness?.bypass?.inherit === 'true';
        const bypassHardnessNotInherited = data.hardness?.bypass?.inherit === false || data.hardness?.bypass?.inherit === 'false';
        const bypassHardnessEnabled = data.hardness?.bypass?.enabled === 'true' || data.hardness?.bypass?.enabled === true;
        const ignoreHardnessInherited = data.hardness?.ignore?.inherit === true || data.hardness?.ignore?.inherit === 'true';
        const ignoreHardnessNotInherited = data.hardness?.ignore?.inherit === false || data.hardness?.ignore?.inherit === 'false';
        const ignoreHardnessEnabled = data.hardness?.ignore?.enabled === 'true' || data.hardness?.ignore?.enabled === true;
        let ignoreHardnessValue = data.hardness?.ignore?.value;
        if (ignoreHardnessValue === '' || ignoreHardnessValue === undefined || ignoreHardnessValue === null || isNaN(Number(ignoreHardnessValue))) {
            ignoreHardnessValue = 0;
        } else {
            ignoreHardnessValue = Number(ignoreHardnessValue);
        }

        if (bypassHardnessInherited) {
            await setActionSetting(this.item, this.actionId, 'hardness.bypass.inherit', true, false);
        } else if (bypassHardnessNotInherited) {
            await setActionSetting(this.item, this.actionId, 'hardness.bypass.inherit', false, false);
            await setActionSetting(this.item, this.actionId, 'hardness.bypass.enabled', bypassHardnessEnabled, false);
        }
        if (ignoreHardnessInherited) {
            await setActionSetting(this.item, this.actionId, 'hardness.ignore.inherit', true, false);
            await setActionSetting(this.item, this.actionId, 'hardness.ignore.enabled', globalIgnoreHardness, false);
            await setActionSetting(this.item, this.actionId, 'hardness.ignore.value', globalIgnoreHardnessValue, false);
        } else if (ignoreHardnessNotInherited) {
            await setActionSetting(this.item, this.actionId, 'hardness.ignore.inherit', false, false);
            await setActionSetting(this.item, this.actionId, 'hardness.ignore.enabled', ignoreHardnessEnabled, false);
            await setActionSetting(this.item, this.actionId, 'hardness.ignore.value', ignoreHardnessEnabled ? ignoreHardnessValue : 0, false);
        }
        
        if (immunityInherited) {
            const globalEnabled = globalBypassImmunityList.length > 0;
            const globalTypes = [...globalBypassImmunityList];
            await setActionSetting(this.item, this.actionId, 'immunity', {}, true, globalEnabled, globalTypes);
        } else {
            const matchesGlobalImmunity = this.arraysMatchUnordered(bypassImmunityList, globalBypassImmunityList);
            if (matchesGlobalImmunity) {
                await setActionSetting(this.item, this.actionId, 'immunity', {}, true);
            } else {
                await setActionSetting(this.item, this.actionId, 'immunity.bypass.enabled', bypassImmunity, false);
                await setActionSetting(this.item, this.actionId, 'immunity.bypass.types', bypassImmunityList, false);
            }
        }
        if (resistanceInherited) {
            const globalEnabled = globalBypassResistanceList.length > 0;
            const globalTypes = [...globalBypassResistanceList];
            await setActionSetting(this.item, this.actionId, 'resistance', {}, true, globalEnabled, globalTypes);
        } else {
            const matchesGlobalResistance = this.arraysMatchUnordered(bypassResistanceList, globalBypassResistanceList);
            if (matchesGlobalResistance) {
                await setActionSetting(this.item, this.actionId, 'resistance', {}, true);
            } else {
                await setActionSetting(this.item, this.actionId, 'resistance.bypass.enabled', bypassResistance, false);
                await setActionSetting(this.item, this.actionId, 'resistance.bypass.types', bypassResistanceList, false);
            }
        }
        if (damageReductionInherited) {
            const globalEnabled = globalBypassDRList.length > 0;
            const globalTypes = [...globalBypassDRList];
            await setActionSetting(this.item, this.actionId, 'damageReduction', {}, true, globalEnabled, globalTypes);
        } else {
            const matchesGlobalDR = this.arraysMatchUnordered(bypassDRList, globalBypassDRList);
            if (matchesGlobalDR) {
                await setActionSetting(this.item, this.actionId, 'damageReduction', {}, true);
            } else {
                await setActionSetting(this.item, this.actionId, 'damageReduction.bypass.enabled', bypassDR, false);
                await setActionSetting(this.item, this.actionId, 'damageReduction.bypass.types', bypassDRList, false);
            }
        }
        
        if (data.attacks) {
            const actionBypassHardness = getActionSetting(this.item, this.actionId, 'hardness.bypass', globalBypassHardness).value;
            const actionIgnoreHardness = getActionSetting(this.item, this.actionId, 'hardness.ignore.enabled', globalIgnoreHardness).value;
            const actionIgnoreHardnessValue = getActionSetting(this.item, this.actionId, 'hardness.ignore.value', globalIgnoreHardnessValue).value;
            const actionBypassImmunityList = getActionSetting(this.item, this.actionId, 'immunity.bypass.types', globalBypassImmunityList).value;
            const actionBypassResistanceList = getActionSetting(this.item, this.actionId, 'resistance.bypass.types', globalBypassResistanceList).value;
            const actionBypassDRList = getActionSetting(this.item, this.actionId, 'damageReduction.bypass.types', globalBypassDRList).value;
            
            const itemActionSettings = this.item.getFlag(AutomateDamageModule.MODULE.ID, 'itemActionSettings') || { actions: [] };
            const action = itemActionSettings.actions.find(a => a.id === this.actionId);
            
            if (action) {
                if (!action.attacks) action.attacks = [];
                
                const existingAttackKeys = action.attacks.map(a => a.name);
                
            for (const [attackKey, attackData] of Object.entries(data.attacks)) {
                    const attackHardnessInherited = attackData.hardness?.bypass?.inherit === true || attackData.hardness?.bypass?.inherit === 'true' ||
                    attackData.hardness?.ignore?.inherit === true || attackData.hardness?.ignore?.inherit === 'true';
                    const attackBypassHardnessInherited = attackData.hardness?.bypass?.inherit === true || attackData.hardness?.bypass?.inherit === 'true';
                    const attackBypassHardnessNotInherited = attackData.hardness?.bypass?.inherit === false || attackData.hardness?.bypass?.inherit === 'false';
                    const attackIgnoreHardnessInherited = attackData.hardness?.ignore?.inherit === true || attackData.hardness?.ignore?.inherit === 'true';
                    const attackIgnoreHardnessNotInherited = attackData.hardness?.ignore?.inherit === false || attackData.hardness?.ignore?.inherit === 'false';

                    const attackImmunityInherited = attackData.immunity?.inherit === true || attackData.immunity?.inherit === 'true';
                    const attackResistanceInherited = attackData.resistance?.inherit === true || attackData.resistance?.inherit === 'true';
                    const attackDRInherited = attackData.damageReduction?.inherit === true || attackData.damageReduction?.inherit === 'true';
                    
                    const attackBypassImmunityList = processDamageTypeList(
                        attackData.immunity?.bypass?.types
                    );
                    
                    const attackBypassResistanceList = processDamageTypeList(
                        attackData.resistance?.bypass?.types
                    );
                    
                    const attackBypassDRList = processDamageTypeList(
                        attackData.damageReduction?.bypass?.types
                    );
                    
                    const attackBypassImmunity = attackBypassImmunityList.length > 0;
                    const attackBypassResistance = attackBypassResistanceList.length > 0;
                    const attackBypassDR = attackBypassDRList.length > 0;
                    
                    const attackBypassHardness = attackData.hardness?.bypass?.enabled === true || attackData.hardness?.bypass?.enabled === 'true';
                    const attackIgnoreHardness = attackData.hardness?.ignore?.enabled === true || attackData.hardness?.ignore?.enabled === 'true';
                    const attackIgnoreHardnessValue = attackData.hardness?.ignore?.value || 0;
                    
                    const finalAttackIgnoreHardnessValue = (attackIgnoreHardness ? Number(attackIgnoreHardnessValue) : 0);
                    
                    if (attackBypassHardnessInherited) {
                        await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.hardness.bypass.inherit`, true, false);
                        await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.hardness.bypass.enabled`, actionBypassHardness, false);
                    } else if (attackBypassHardnessNotInherited) {
                        await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.hardness.bypass.inherit`, false, false);
                        await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.hardness.bypass.enabled`, attackBypassHardness, false);
                    }
                    if (attackIgnoreHardnessInherited) {
                        await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.hardness.ignore.inherit`, true, false);
                        await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.hardness.ignore.enabled`, actionIgnoreHardness, false);
                        await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.hardness.ignore.value`, actionIgnoreHardnessValue, false);
                    } else if (attackIgnoreHardnessNotInherited) {
                        await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.hardness.ignore.inherit`, false, false);
                        await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.hardness.ignore.enabled`, attackIgnoreHardness, false);
                        await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.hardness.ignore.value`, finalAttackIgnoreHardnessValue, false);
                    }
                    
                    if (attackImmunityInherited) {
                        const actionEnabled = actionBypassImmunityList.length > 0;
                        const actionTypes = [...actionBypassImmunityList];
                        await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.immunity`, {}, true, actionEnabled, actionTypes);
                    } else {
                        const matchesActionImmunity = this.arraysMatchUnordered(attackBypassImmunityList, actionBypassImmunityList);
                        
                        if (matchesActionImmunity) {
                            await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.immunity`, {}, true);
                        } else {
                            await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.immunity.bypass.enabled`, 
                                attackBypassImmunity, false);
                            await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.immunity.bypass.types`, 
                                attackBypassImmunityList, false);
                        }
                    }
                    
                    if (attackResistanceInherited) {
                        const actionEnabled = actionBypassResistanceList.length > 0;
                        const actionTypes = [...actionBypassResistanceList];
                        await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.resistance`, {}, true, actionEnabled, actionTypes);
                    } else {
                        const matchesActionResistance = this.arraysMatchUnordered(attackBypassResistanceList, actionBypassResistanceList);
                        
                        
                        if (matchesActionResistance) {
                            await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.resistance`, {}, true);
                        } else {
                            
                            await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.resistance.bypass.enabled`, 
                                attackBypassResistance, false);
                            await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.resistance.bypass.types`, 
                                attackBypassResistanceList, false);
                        }
                    }
                    
                    if (attackDRInherited) {
                        const actionEnabled = actionBypassDRList.length > 0;
                        const actionTypes = [...actionBypassDRList];
                        await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.damageReduction`, {}, true, actionEnabled, actionTypes);
                    } else {
                        const matchesActionDR = this.arraysMatchUnordered(attackBypassDRList, actionBypassDRList);
                        
                        if (matchesActionDR) {
                            await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.damageReduction`, {}, true);
                        } else {
                            await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.damageReduction.bypass.enabled`, 
                                attackBypassDR, false);
                            await setActionSetting(this.item, this.actionId, `attacks.${attackKey}.damageReduction.bypass.types`, 
                                attackBypassDRList, false);
                }
            }
        }
        
                action.attacks = action.attacks.filter(attack => {
                    return attack.name && attack.name !== 'undefined' && attack.name !== 'null';
                });
            }
        }
        
        if (typeof window !== 'undefined' && window._lastItemActionSettings) {
            await this.item.setFlag(AutomateDamageModule.MODULE.ID, 'itemActionSettings', window._lastItemActionSettings);
            window._lastItemActionSettings = null;
        }
        
        const finalSettings = this.item.getFlag(AutomateDamageModule.MODULE.ID, 'itemActionSettings');
        const finalAction = finalSettings?.actions?.find(a => a.id === this.actionId);
    }

    /**
     * Helper method to compare arrays regardless of order
     */
    arraysMatchUnordered(array1, array2) {
        if (array1.length !== array2.length) return false;
        
        const array2Copy = [...array2];
        
        for (const item of array1) {
            const index = array2Copy.indexOf(item);
            if (index === -1) return false;
            
            array2Copy.splice(index, 1);
        }
        
        return true;
    }
    
    close(options) {
            $(document).off('click.actionMultiSelectDropdowns');
            $(document).off('click.actionTagRemoval');
        
        if (window.actionData) {
            delete window.actionData;
        }
        
        return super.close(options);
    }

    _getSubmitData(updateData = null) {
        if (this.form && this.updateHiddenInputs) {
            this.updateHiddenInputs($(this.form));
            $(this.form).find('input[type="hidden"]').each(function() {});
        }
        return super._getSubmitData(updateData);
    }

    activateListeners(html) {
        super.activateListeners(html);
        function setupTriStateCheckboxes(html, selector, globalIgnoreHardnessValue) {
            html.find(selector).each(function() {
                const checkbox = $(this);
                checkbox.off('click').on('click', function(event) {
                    const currentState = checkbox.attr('data-state');
                    const inheritInput = checkbox.find('input[name$=".bypass.inherit"], input[name$=".ignore.inherit"]');
                    const enabledInput = checkbox.find('input[name$=".bypass.enabled"], input[name$=".ignore.enabled"]');
                    const targetClass = checkbox.attr('data-target');
                    let newState;
                    if (currentState === 'false') {
                        newState = 'true';
                        inheritInput.val('false');
                        enabledInput.val('true');
                    } else if (currentState === 'true') {
                        newState = 'inherit';
                        inheritInput.val('true');
                        enabledInput.val('false');
                    } else {
                        newState = 'false';
                        inheritInput.val('false');
                        enabledInput.val('false');
                    }
                    checkbox.attr('data-state', newState);
                    if (targetClass) {
                        const targetElement = html.find(`.${targetClass}`);
                        targetElement.toggleClass('hidden', newState === 'false');
                        targetElement.prop('disabled', newState === 'inherit');
                        const inheritedLabel = targetElement.siblings('.inherited-label');
                        if (newState === 'inherit') {
                            inheritedLabel.show();
                            if (globalIgnoreHardnessValue !== undefined) {
                                targetElement.val(globalIgnoreHardnessValue);
                            }
                        } else {
                            inheritedLabel.hide();
                        }
                    }
                });
            });
        }

        setupTriStateCheckboxes(html, '.tri-state-checkbox[data-name="hardness.bypass"]');
        setupTriStateCheckboxes.call(this, html, '.tri-state-checkbox[data-name="hardness.ignore.enabled"]', this.globalIgnoreHardnessValue);
        setupTriStateCheckboxes(html, '.attack-section .tri-state-checkbox[data-name$=".hardness.bypass"]');
        setupTriStateCheckboxes.call(this, html, '.attack-section .tri-state-checkbox[data-name$=".hardness.ignore.enabled"]', this.globalIgnoreHardnessValue);

        function setupMultiSelect(html, containerSelector, category, globalListKey, damageTypes) {
            const labelForId = id => {
                if (id === 'dr-none') return 'DR/-';
                return (damageTypes.find(dt => dt.id === id) || {}).label || id;
            };
            html.find(containerSelector).each(function(index) {
                const container = $(this);
                const tagsContainer = container.find('.multiselect-tags-container');
                const dropdownToggle = container.find('.multiselect-dropdown-toggle');
                const dropdown = container.find('.multiselect-dropdown');
                const searchInput = container.find('.multiselect-search-input');
                const optionCheckboxes = container.find('input[type="checkbox"]');
                const attackSection = container.closest('.attack-section');
                const attackKey = attackSection.length ? attackSection.data('attack-key') : null;
                const enabledInput = attackKey
                    ? container.find(`input[name="attacks.${attackKey}.${category}.bypass.enabled"]`)
                    : html.find(`input[name="${category}.bypass.enabled"]`);
                const inheritInput = attackKey
                    ? container.find(`input[name="attacks.${attackKey}.${category}.inherit"]`)
                    : html.find(`input[name="${category}.inherit"]`);
                const hiddenInputsClass = attackKey
                    ? `.${category}-hidden-inputs-${index}`
                    : `.${category}-hidden-inputs`;
                let globalList;
                if (attackKey) {
                    globalList = (typeof window !== 'undefined' && window.actionData && window.actionData.action && window.actionData.action[category] && window.actionData.action[category].bypass && window.actionData.action[category].bypass.types) ? window.actionData.action[category].bypass.types : [];
                } else {
                    globalList = (typeof window !== 'undefined' && window.actionData && window.actionData.global && window.actionData.global[globalListKey] && window.actionData.global[globalListKey].bypass && window.actionData.global[globalListKey].bypass.types) ? window.actionData.global[globalListKey].bypass.types : [];
                }

                function arraysMatchUnordered(array1, array2) {
                    if (array1.length !== array2.length) return false;
                    const array2Copy = [...array2];
                    for (const item of array1) {
                        const index = array2Copy.indexOf(item);
                        if (index === -1) return false;
                        array2Copy.splice(index, 1);
                    }
                    return true;
                }

                tagsContainer.add(dropdownToggle).click(event => {
                    html.find('.multiselect-dropdown.visible').not(dropdown).removeClass('visible');
                    if (!dropdown.hasClass('visible')) {
                        dropdown.addClass('visible');
                        searchInput.focus();
                        dropdownToggle.find('i').css('transform', 'rotate(180deg)');
                    } else {
                        dropdown.removeClass('visible');
                        dropdownToggle.find('i').css('transform', '');
                    }
                });
                $(document).on(`click.${globalListKey}MultiSelectDropdowns`, event => {
                    if (!$(event.target).closest(containerSelector).length &&
                        !$(event.target).closest('.multiselect-dropdown').length) {
                        dropdown.removeClass('visible');
                        dropdownToggle.find('i').css('transform', '');
                    }
                });
                searchInput.on('input', function() {
                    const searchValue = $(this).val().toLowerCase();
                    dropdown.find('.multiselect-option').each(function() {
                        const option = $(this);
                        const text = option.text().toLowerCase();
                        option.toggle(text.includes(searchValue));
                    });
                });
                optionCheckboxes.change(function() {
                    if (tagsContainer.attr('data-inherited') === 'true' || tagsContainer.find('.inherited-tag').length > 0) {
                        tagsContainer.attr('data-inherited', 'false');
                        tagsContainer.empty();
                    }
                    const allCheckbox = optionCheckboxes.filter('[value="all"]');
                    const allOption = optionCheckboxes.filter('[value="all"]').closest('.multiselect-option');
                    const allTag = `<div class="multiselect-tag" data-value="all"><span>All</span><i class="fas fa-times remove-tag"></i></div>`;
                    const nonAllCheckboxes = optionCheckboxes.filter(function() { return $(this).val() !== 'all'; });
                    const checkbox = $(this);
                    const value = checkbox.attr('data-value') || checkbox.val();
                    const label = optionCheckboxes.filter(`[data-value="${value}"]`).closest('.multiselect-option').find('span').text() || value;
                    const isChecked = checkbox.prop('checked');
                    if (value === 'all') {
                        if (isChecked) {
                            optionCheckboxes.prop('checked', true);
                            optionCheckboxes.closest('.multiselect-option').addClass('selected');
                            tagsContainer.empty().append(allTag);
                        } else {
                            optionCheckboxes.prop('checked', false);
                            optionCheckboxes.closest('.multiselect-option').removeClass('selected');
                            tagsContainer.empty().html('<span class="multiselect-placeholder">None Selected</span>');
                        }
                    } else {
                        if (!isChecked && allCheckbox.prop('checked')) {
                            allCheckbox.prop('checked', false);
                            allOption.removeClass('selected');
                            tagsContainer.find('.multiselect-tag[data-value="all"]').remove();
                        }
                        if (nonAllCheckboxes.length > 0 && nonAllCheckboxes.filter(':checked').length === nonAllCheckboxes.length) {
                            allCheckbox.prop('checked', true);
                            allOption.addClass('selected');
                            tagsContainer.empty().append(allTag);
                        } else {
                            tagsContainer.find('.multiselect-tag[data-value="all"]').remove();
                            if (isChecked) {
                                tagsContainer.find('.multiselect-placeholder').remove();
                                const tag = $(`<div class="multiselect-tag" data-value="${value}"><span>${label}</span><i class="fas fa-times remove-tag"></i></div>`);
                                tagsContainer.append(tag);
                            } else {
                                tagsContainer.find(`.multiselect-tag[data-value="${value}"]`).remove();
                                if (tagsContainer.find('.multiselect-tag').length === 0) {
                                    tagsContainer.html('<span class="multiselect-placeholder">None Selected</span>');
                                }
                            }
                        }
                    }
                    let selected = optionCheckboxes.filter(':checked').map(function() { return $(this).attr('data-value'); }).get();
                    const hiddenInputsContainer = container.find(hiddenInputsClass);
                    hiddenInputsContainer.empty();
                    if (arraysMatchUnordered(selected, globalList)) {
                        tagsContainer.attr('data-inherited', 'true');
                        tagsContainer.empty();
                        hiddenInputsContainer.empty();
                        if (globalList.length > 0) {
                            for (const typeId of globalList) {
                                const label = labelForId(typeId);
                                const tag = $(`<div class="multiselect-tag inherited-tag" data-value="${typeId}" data-inherited="true"><span>${label} (Inherited)</span></div>`);
                                tagsContainer.append(tag);
                                let inputName;
                                if (attackKey) {
                                    inputName = `attacks.${attackKey}.${category}.bypass.types`;
                                } else {
                                    inputName = `${category}.bypass.types`;
                                }
                                hiddenInputsContainer.append(`<input type="hidden" name="${inputName}" value="${typeId}">`);
                            }
                        } else {
                            tagsContainer.html('<span class="multiselect-placeholder inherited-tag">None Selected (Inherited)</span>');
                        }
                        if (attackKey) {
                            html.find(`input[name="attacks.${attackKey}.${category}.inherit"]`).val('true');
                        } else {
                            html.find(`input[name="${category}.inherit"]`).val('true');
                        }
                        if (enabledInput.length) enabledInput.val(globalList.length > 0 ? 'true' : 'false');
                        optionCheckboxes.prop('checked', false);
                        optionCheckboxes.each(function() {
                            const val = $(this).attr('data-value');
                            if (globalList.includes(val)) {
                                $(this).prop('checked', true);
                            }
                        });
                        return;
                    } else {
                        if (attackKey) {
                            html.find(`input[name="attacks.${attackKey}.${category}.inherit"]`).val('false');
                        } else {
                            html.find(`input[name="${category}.inherit"]`).val('false');
                        }
                    }
                    selected.forEach(typeId => {
                        let inputName;
                        if (attackKey) {
                            inputName = `attacks.${attackKey}.${category}.bypass.types`;
                        } else {
                            inputName = `${category}.bypass.types`;
                        }
                        hiddenInputsContainer.append(`<input type="hidden" name="${inputName}" value="${typeId}">`);
                    });
                    tagsContainer.empty();
                    if (selected.includes('all')) {
                        tagsContainer.append('<div class="multiselect-tag" data-value="all"><span>All</span><i class="fas fa-times remove-tag"></i></div>');
                    } else if (selected.length === 0) {
                        tagsContainer.html('<span class="multiselect-placeholder">None Selected</span>');
                    } else {
                        const sortedSelected = selected.slice().sort((a, b) => labelForId(a).localeCompare(labelForId(b), undefined, { sensitivity: 'base' }));
                        sortedSelected.forEach(typeId => {
                            const label = labelForId(typeId);
                            const tag = $(`<div class="multiselect-tag" data-value="${typeId}"><span>${label}</span><i class="fas fa-times remove-tag"></i></div>`);
                            tagsContainer.append(tag);
                        });
                    }
                    const enabled = sortedSelected.length > 0;
                    if (enabledInput.length) enabledInput.val(enabled ? 'true' : 'false');
                });
                container.on('click', '.remove-tag', function(event) {
                    event.stopPropagation();
                    const tag = $(this).closest('.multiselect-tag');
                    const value = tag.data('value');
                    if (value === 'all') {
                        optionCheckboxes.prop('checked', false).trigger('change');
                        optionCheckboxes.closest('.multiselect-option').removeClass('selected');
                    } else {
                        optionCheckboxes.filter(`[data-value="${value}"]`).prop('checked', false).trigger('change');
                    }
                    tag.remove();
                    let selected = optionCheckboxes.filter(':checked').map(function() { return $(this).attr('data-value'); }).get();
                    const labelForId = id => (damageTypes.find(dt => dt.id === id) || {}).label || id;
                    selected = selected.slice().sort((a, b) => labelForId(a).localeCompare(labelForId(b), undefined, { sensitivity: 'base' }));
                    tagsContainer.empty();
                    if (selected.length === 0) {
                        tagsContainer.html('<span class="multiselect-placeholder">None Selected</span>');
                    } else {
                        selected.forEach(typeId => {
                            const label = labelForId(typeId);
                            const tag = $(`<div class="multiselect-tag" data-value="${typeId}"><span>${label}</span><i class="fas fa-times remove-tag"></i></div>`);
                            tagsContainer.append(tag);
                        });
                    }
                    const enabled = selected.length > 0;
                    if (enabledInput.length) enabledInput.val(enabled ? 'true' : 'false');
                    const hiddenInputsContainer = container.find(hiddenInputsClass);
                    hiddenInputsContainer.empty();
                    selected.forEach(typeId => {
                        let inputName;
                        if (attackKey) {
                            inputName = `attacks.${attackKey}.${category}.bypass.types`;
                        } else {
                            inputName = `${category}.bypass.types`;
                        }
                        hiddenInputsContainer.append(`<input type=\"hidden\" name=\"${inputName}\" value=\"${typeId}\">`);
                    });
                    if (arraysMatchUnordered(selected, globalList)) {
                        tagsContainer.attr('data-inherited', 'true');
                        tagsContainer.empty();
                        hiddenInputsContainer.empty();
                        if (globalList.length > 0) {
                            for (const typeId of globalList) {
                                const damageType = (damageTypes || []).find(dt => dt.id === typeId);
                                const label = damageType ? damageType.label : typeId;
                                const tag = $(`<div class="multiselect-tag inherited-tag" data-value="${typeId}" data-inherited="true"><span>${label} (Inherited)</span></div>`);
                                tagsContainer.append(tag);
                            }
                        } else {
                            tagsContainer.html('<span class="multiselect-placeholder inherited-tag">None Selected (Inherited)</span>');
                        }
                        if (attackKey) {
                            html.find(`input[name="attacks.${attackKey}.${category}.inherit"]`).val('true');
                        } else {
                            html.find(`input[name="${category}.inherit"]`).val('true');
                        }
                        if (enabledInput.length) enabledInput.val(globalList.length > 0 ? 'true' : 'false');
                        optionCheckboxes.prop('checked', false);
                        optionCheckboxes.each(function() {
                            const val = $(this).attr('data-value');
                            if (globalList.includes(val)) {
                                $(this).prop('checked', true);
                            }
                        });
                        return;
                    } else {
                        if (attackKey) {
                            html.find(`input[name="attacks.${attackKey}.${category}.inherit"]`).val('false');
                        } else {
                            html.find(`input[name="${category}.inherit"]`).val('false');
                        }
                    }
                });
                let initialSelected = optionCheckboxes.filter(':checked').map(function() { return $(this).attr('data-value'); }).get();
                const hiddenInputsContainer = container.find(hiddenInputsClass);
                hiddenInputsContainer.empty();
                initialSelected.forEach(typeId => {
                    let inputName;
                    if (attackKey) {
                        inputName = `attacks.${attackKey}.${category}.bypass.types`;
                    } else {
                        inputName = `${category}.bypass.types`;
                    }
                    hiddenInputsContainer.append(`<input type="hidden" name="${inputName}" value="${typeId}">`);
                });
            });
        }

        setupMultiSelect(html, '#bypass-immunity-list-container', 'immunity', 'immunity', getDamageTypes());
        setupMultiSelect(html, '#bypass-resistance-list-container', 'resistance', 'resistance', getDamageTypes());
        setupMultiSelect(html, '#bypass-dr-list-container', 'damageReduction', 'damageReduction', getDamageTypes());
        setupMultiSelect(html, '.attack-section .multiselect-container[data-category="immunity"]', 'immunity', 'immunity', getDamageTypes());
        setupMultiSelect(html, '.attack-section .multiselect-container[data-category="resistance"]', 'resistance', 'resistance', getDamageTypes());
        setupMultiSelect(html, '.attack-section .multiselect-container[data-category="damageReduction"]', 'damageReduction', 'damageReduction', getDamageTypes());

        html.find('.attack-settings-toggle').click(function() {
            const content = html.find('.attack-settings-content');
            const caret = $(this).find('i');
            content.toggleClass('collapsed');
            if (content.hasClass('collapsed')) {
                caret.removeClass('fa-caret-down').addClass('fa-caret-right');
            } else {
                caret.removeClass('fa-caret-right').addClass('fa-caret-down');
            }
        });
    }
}

/**
 * Automate Damage UI class
 * This now just manages the hooks and button additions
 */
class AutomateDamageUI {
    static init() {
        Hooks.on('getItemSheetPFHeaderButtons', this._onGetItemSheetHeaderButtons.bind(this));
        Hooks.on('getItemActionSheetHeaderButtons', this._onGetItemActionSheetHeaderButtons.bind(this));
        
        Handlebars.registerHelper('hasNoActiveAttackSettings', function(attacks) {
            if (!attacks || attacks.length === 0) return true;
            for (const attack of attacks) {
                if (
                    (attack.hardness && attack.hardness.bypass.inherit === false) ||
                    (attack.hardness && attack.hardness.ignore.inherit === false) ||
                    (attack.immunity && attack.immunity.inherit === false) ||
                    (attack.resistance && attack.resistance.inherit === false) ||
                    (attack.damageReduction && attack.damageReduction.inherit === false)
                ) {
                    return false;
                }
                if (
                    attack.bypassHardness || attack.ignoreHardness ||
                    (attack.bypassImmunityList && attack.bypassImmunityList.length > 0) ||
                    (attack.bypassResistanceList && attack.bypassResistanceList.length > 0) ||
                    (attack.bypassDRList && attack.bypassDRList.length > 0)
                ) {
                    return false;
                }
            }
            return true;
        });
    }
    
    /**
     * Add a button to the ItemSheetPF header
     */
    static _onGetItemSheetHeaderButtons(sheet, buttons) {
        buttons.unshift({
            label: game.i18n.localize("PF1.AutomateDamage.Buttons.GlobalSettings"),
            class: "automate-damage-settings",
            icon: "fas fa-bolt",
            onclick: () => {
                new GlobalDamageSettingsForm(sheet.item).render(true);
            }
        });
    }

    /**
     * Add a button to the ItemActionSheet header
     */
    static _onGetItemActionSheetHeaderButtons(sheet, buttons) {
        buttons.unshift({
            label: game.i18n.localize("PF1.AutomateDamage.Buttons.ActionSettings"),
            class: "automate-damage-action-settings",
            icon: "fas fa-bolt",
            onclick: () => {
                new ActionDamageSettingsForm(sheet.item, sheet.action.id).render(true);
            }
        });
    }
}

Hooks.once('ready', () => {
    AutomateDamageUI.init();
}); 

const DEFAULT_HARDNESS = {
    bypass: { enabled: false, inherit: true },
    ignore: { enabled: false, inherit: true, value: 0 }
};
const DEFAULT_IMMUNITY = {
    inherit: true,
    bypass: { enabled: false, types: [] }
};
const DEFAULT_RESISTANCE = {
    inherit: true,
    bypass: { enabled: false, types: [] }
};
const DEFAULT_DAMAGE_REDUCTION = {
    inherit: true,
    bypass: { enabled: false, types: [] }
};
function normalizeHardness(hardness = {}, isGlobal = false) {
    if (isGlobal) {
        return {
            bypass: typeof hardness?.bypass === 'boolean' ? hardness.bypass : false,
            ignore: {
                enabled: typeof hardness?.ignore?.enabled === 'boolean'
                    ? hardness.ignore.enabled
                    : (typeof hardness?.ignore === 'boolean' ? hardness.ignore : false),
                value: typeof hardness?.ignore?.value === 'number' ? hardness.ignore.value : 0
            }
        };
    } else {
        return {
            bypass: {
                enabled: typeof hardness?.bypass?.enabled === 'boolean' ? hardness.bypass.enabled : false,
                inherit: typeof hardness?.bypass?.inherit === 'boolean' ? hardness.bypass.inherit : true
            },
            ignore: {
                enabled: typeof hardness?.ignore?.enabled === 'boolean' ? hardness.ignore.enabled : false,
                inherit: typeof hardness?.ignore?.inherit === 'boolean' ? hardness.ignore.inherit : true,
                value: typeof hardness?.ignore?.value === 'number' ? hardness.ignore.value : 0
            }
        };
    }
}
function normalizeImmunity(immunity = {}, isGlobal = false) {
    return {
        ...(isGlobal ? {} : { inherit: typeof immunity?.inherit === 'boolean' ? immunity.inherit : true }),
        bypass: {
            enabled: typeof immunity?.bypass?.enabled === 'boolean' ? immunity.bypass.enabled : false,
            types: Array.isArray(immunity?.bypass?.types) ? immunity.bypass.types : []
        }
    };
}
function normalizeResistance(resistance = {}, isGlobal = false) {
    return {
        ...(isGlobal ? {} : { inherit: typeof resistance?.inherit === 'boolean' ? resistance.inherit : true }),
        bypass: {
            enabled: typeof resistance?.bypass?.enabled === 'boolean' ? resistance.bypass.enabled : false,
            types: Array.isArray(resistance?.bypass?.types) ? resistance.bypass.types : []
        }
    };
}
function normalizeDamageReduction(dr = {}, isGlobal = false) {
    return {
        ...(isGlobal ? {} : { inherit: typeof dr?.inherit === 'boolean' ? dr.inherit : true }),
        bypass: {
            enabled: typeof dr?.bypass?.enabled === 'boolean' ? dr.bypass.enabled : false,
            types: Array.isArray(dr?.bypass?.types) ? dr.bypass.types : []
        }
    };
}
function normalizeAttack(attack = {}) {
    return {
        name: typeof attack.name === 'string' ? attack.name : '',
        key: typeof attack.key === 'string' ? attack.key : '',
        hardness: normalizeHardness(attack.hardness),
        immunity: normalizeImmunity(attack.immunity),
        resistance: normalizeResistance(attack.resistance),
        damageReduction: normalizeDamageReduction(attack.damageReduction)
    };
}
function normalizeAction(action = {}) {
    return {
        id: typeof action.id === 'string' ? action.id : '',
        name: typeof action.name === 'string' ? action.name : '',
        hardness: normalizeHardness(action.hardness),
        immunity: normalizeImmunity(action.immunity),
        resistance: normalizeResistance(action.resistance),
        damageReduction: normalizeDamageReduction(action.damageReduction),
        attacks: Array.isArray(action.attacks) ? action.attacks.map(normalizeAttack) : []
    };
}

async function initializeAutomateDamageFlags(item) {
    let globalItemSettings = item.getFlag(AutomateDamageModule.MODULE.ID, 'globalItemSettings') || {};
    globalItemSettings = {
        hardness: normalizeHardness(globalItemSettings.hardness, true),
        immunity: normalizeImmunity(globalItemSettings.immunity, true),
        resistance: normalizeResistance(globalItemSettings.resistance, true),
        damageReduction: normalizeDamageReduction(globalItemSettings.damageReduction, true)
    };
    await item.setFlag(AutomateDamageModule.MODULE.ID, 'globalItemSettings', globalItemSettings);

    let itemActionSettings = item.getFlag(AutomateDamageModule.MODULE.ID, 'itemActionSettings');
    let actions = [];
    if (itemActionSettings && Array.isArray(itemActionSettings.actions)) {
        actions = itemActionSettings.actions.map(normalizeAction);
    } else if (item.actions && item.actions.size > 0) {
        for (const systemAction of item.actions) {
            const newAction = {
                id: systemAction.id,
                name: systemAction.name || `Action ${systemAction.id}`,
                hardness: {},
                immunity: {},
                resistance: {},
                damageReduction: {},
                attacks: []
            };
            if (systemAction.getAttacks) {
                const attacks = systemAction.getAttacks();
                if (attacks && attacks.length > 0) {
                    for (const attack of attacks) {
                        const attackName = attack.label || `Attack`;
                        const attackKey = attackName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
                        newAction.attacks.push({ name: attackName, key: attackKey });
                    }
                }
            }
            const hasteKey = "haste";
            const rapidShotKey = "rapid_shot";
            const existingAttackKeys = newAction.attacks.map(a => a.key || a.name);
            if (!existingAttackKeys.includes(hasteKey)) {
                newAction.attacks.push({ name: hasteKey, key: hasteKey });
            }
            if (!existingAttackKeys.includes(rapidShotKey)) {
                newAction.attacks.push({ name: rapidShotKey, key: rapidShotKey });
            }
            actions.push(normalizeAction(newAction));
        }
    }
    itemActionSettings = { actions };
    await item.setFlag(AutomateDamageModule.MODULE.ID, 'itemActionSettings', itemActionSettings);
} 