import { AutomateDamageModule } from './config.js';
import { onRenderChatMessage } from './buttons.js';

Hooks.on("renderChatMessage", (app, html, data) => {onRenderChatMessage(html)});
Hooks.on('pf1RegisterDamageTypes', (registry) => {AutomateDamageModule.handleRegistryHook(registry)});
Hooks.once("setup", AutomateDamageModule.handleSetupHook);
Hooks.once("ready", () => {
    AutomateDamageModule.handleReadyHook();
    overrideApplyDamage();
});

function overrideApplyDamage () {
    libWrapper.register('pf1-automate-damage', 'pf1.utils.chat.onButton', interceptCardData, libWrapper.MIXED);

    libWrapper.register('pf1-automate-damage', 'pf1.documents.actor.ActorPF.applyDamage', function (wrapped, value, config) {
        if (canvas.tokens.controlled.length && (!config.healing && value >= 0)) {
            customApplyDamage(wrapped, value, config);
        } else {
            return wrapped(value, config);
        };
    }, 'MIXED');
};

const targetInfo = {
    id: "",
    buttonType: "",
    attackIndex: "",
    isCritical: false
};

function interceptCardData(wrapped, message, elementObject) {
    const actionName = elementObject.target?.dataset?.action;
    const button = elementObject.target;
    if (actionName == "applyDamage" && button) {
        const chatMessage = button.closest('.chat-message');
        const chatAttack = button.closest('.chat-attack');

        if (chatMessage) {
            targetInfo.id = chatMessage.getAttribute('data-message-id');
        };
        targetInfo.buttonType = button.dataset.tooltip || button.innerText;
        if (chatAttack) {
            targetInfo.attackIndex = chatAttack.getAttribute('data-index');
            let damageElement = button.closest('th[data-damage-type]');
            if (!damageElement) {
                const buttonType = button.getAttribute('data-type'); // 'critical' or 'normal'
                if (buttonType) {
                    damageElement = chatAttack.querySelector(`th[data-damage-type="${buttonType}"]`);
                };
            };
            if (damageElement) {
                targetInfo.isCritical = damageElement.getAttribute('data-damage-type') === 'critical';
            } else {
                targetInfo.isCritical = false;
            };
        };
    };
    return wrapped(message, elementObject);
};

function customApplyDamage(originalApplyDamage, value, config) {
    canvas.tokens.controlled.forEach(token => {
        let totalDamage = 0;
        const traits = token.actor.system.traits;
        const abilities = token.actor.system.abilities // Used to apply ability damage \ drain \ penalty
        const eRes = traits.eres; // Energy Resistances
        const conditionImmunities = traits.ci // Condition Immunities
        const damageImmunities = traits.di; // Damage Immunities
        const damageReductions = traits.dr; // Damage Reductions
        const damageVulnerabilities = traits.dv; // Damage Vulnerabilities
        const hardness = traits.hardness
        const messageId = targetInfo.id;
        const message = game.messages.get(messageId);
        let systemRolls = game.messages.get(messageId).systemRolls;
        if(Object.keys(systemRolls).length == 0 && systemRolls.constructor == Object && game.messages.get(messageId).rolls) {
            systemRolls = game.messages.get(messageId).rolls;
        };
        const itemSource = game.messages.get(messageId).itemSource;
        const itemType = game.messages.get(messageId).itemSource?.type;
        let damageMult = targetInfo.buttonType == "PF1.ApplyHalf" || targetInfo.buttonType == "Apply Half" ? 0.5 : 1;
        if (targetInfo.buttonType.includes("percentage")) {
            const percentageMatch = targetInfo.buttonType.match(/(\d+)%/);
            if (percentageMatch) {
                const percentageValue = parseInt(percentageMatch[1], 10);
                if (percentageValue === 50) {
                    damageMult = 0.5;
                } else if (percentageValue === 100) {
                    damageMult = 1;
                };
            };
        };
        if (systemRolls?.attacks?.length > 0) {
            const attack = systemRolls.attacks[targetInfo.attackIndex];
            if (attack.damage?.length > 0) {
                const attackDamage = targetInfo.isCritical ? JSON.parse(JSON.stringify([...attack.damage, ...attack.critDamage])) : JSON.parse(JSON.stringify(attack.damage));
                const {damageSortObjects, damageTypes, itemAction, abilityDmg} = sortDamage(attackDamage, itemSource, message);
                damageImmunityCalculation(damageImmunities, attackDamage, damageSortObjects);
                damageVulnerabilityCalculation(damageVulnerabilities, attackDamage, damageSortObjects);
                hardnessCalculation(attackDamage, eRes, damageReductions, damageTypes, damageSortObjects, itemSource, hardness);
                elementalResistancesCalculation(eRes, attackDamage, damageTypes, damageSortObjects);
                damageReductionCalculation(attackDamage, damageReductions, damageTypes, damageSortObjects, itemSource, itemAction, message, hardness);
                abilityDamageCalculation(damageImmunities, conditionImmunities, abilities, abilityDmg);
                attackDamage.forEach(damage => {
                    const damageTypes = damage.options?.damageType || [];
                    if(damageTypes.length < 1) {
                        damageTypes[0] = "untyped";
                    };
                    const type = damageTypes[0];
                    if (!abilityDmg.some(dmgType => dmgType.type === type) || abilityDmg.length == 0) { // Apply damage if the type is not an ability damage type
                        let damageForType = Math.floor(damage.total * damageMult) || 0; // Default to 0 if total damage is not defined
    
                        totalDamage += Math.max(0, damageForType);
                    } else if (abilityDmg && abilityDmg.length > 0) {
                        let updates = {};
                        for (const key in abilities) {
                            updates[`system.abilities.${key}.damage`] = Math.floor(abilities[key].damage * damageMult) || 0;
                            updates[`system.abilities.${key}.drain`] = Math.floor(abilities[key].drain * damageMult) || 0;
                            updates[`system.abilities.${key}.userPenalty`] = Math.floor(abilities[key].userPenalty * damageMult) || 0;
                        };
                        token.actor.update(updates);
                    };
                });
            };
        } else {
            systemRolls.forEach(roll => {
                const attackDamage = JSON.parse(JSON.stringify(roll?.terms));
                const {damageSortObjects, damageTypes} = sortDamage(attackDamage, messageId, message);
                damageImmunityCalculation(damageImmunities, attackDamage, damageSortObjects);
                damageVulnerabilityCalculation(damageVulnerabilities, attackDamage, damageSortObjects);
                hardnessCalculation(attackDamage, eRes, damageReductions, damageTypes, damageSortObjects, itemSource, hardness);
                elementalResistancesCalculation(eRes, attackDamage, damageTypes, damageSortObjects);
                damageReductionCalculation(attackDamage, damageReductions, damageTypes, damageSortObjects, itemSource, hardness);
        
                attackDamage.forEach(damage => {
                    const flags = game.messages.get(messageId).flags?.pf1?.subject?.health;
                    const healthFlag = (flags === undefined || flags === null || Object.keys(game.messages.get(messageId).flags).length === 0 || flags === "damage") ? 1 : -1;
                    let rolledDamage = Math.floor((damage.total * healthFlag) * damageMult) || 0; // Default to 0 if total damage is not defined

                    totalDamage += rolledDamage;
                });
            });
        };
        originalApplyDamage(totalDamage, config);
    });
};

function sortDamage(attackDamage, itemSource, message) {
    // Handle Actual Reduction from incoming damage
    const damageSortObjects = [];
    const dataActionId = message.system?.action;
    const itemAction = [];
    const abilityDmg = [];
    
    const damageTypes = attackDamage.map((damage, index) => {
        if(damage.options.damageType) {
            const dmgNames = [];
            const dmgTypes = damage.options.damageType;
            for (const [key, value] of pf1.registry.damageTypes.entries()) {
                for (const type of dmgTypes) {
                    if (type === key) {
                        const flags = value.flags?.['pf1-automate-damage'];
                        if (!flags) {
                            dmgNames.push(type);
                        } else {
                            if (flags?.vsAbility) {
                                const vsAbility = flags?.abilities;
                                const ablType = flags?.type;
                                abilityDmg.push({ type: type, amount: damage.total, vs: vsAbility, ablDmgType: ablType });
                            } else {
                                dmgNames.push(type);
                            };
                        };
                    };
                };
            };
            const alignments = itemSource?.system?.alignments;
            const materials = itemSource?.system?.material;
            if (itemSource.actions.size >= 1) {
                const actionIds = [];
                const itemActions = [];

                for (const [id, action] of itemSource.actions.entries()) {
                    actionIds.push(id);
                    itemActions.push(action);

                    if (id == dataActionId) {
                        itemAction.push(action);
                    };
                };
                const hasAmmo = itemSource.system?.ammo;
                const rangedAction = itemAction[0]?.isRanged
                if (hasAmmo?.type !== "" && rangedAction) {
                    let parser = new DOMParser();
                    let doc = parser.parseFromString(message.content, 'text/html');
                    let ammoElement = doc.querySelector('[data-ammo-id]');
                    let ammoId = ammoElement ? ammoElement.getAttribute('data-ammo-id') : null;
                    const ammoItem = itemSource.parent.items.get(ammoId);
                    const ammoAddons = ammoItem?.system?.flags?.dictionary;
                    for (let addon in ammoAddons) {
                        if (addon.toLowerCase() == "material" || addon.toLowerCase() == "alignment") {
                            dmgNames.push(ammoAddons[addon].toLowerCase());
                        };
                    };
                } else {
                    const overrideMaterials = itemAction[0]?.data?.material?.normal?.value;
                    const overrideAddons = itemAction[0]?.data?.material?.addon;
                    const overrideAlignments = itemAction[0]?.data?.alignments;
                    if (overrideAlignments && Object.values(overrideAlignments).some(value => value !== null)) {
                        for (const [alignment, value] of Object.entries(overrideAlignments)) {
                            if (value === true && alignments[alignment] === false) {
                                dmgNames.push(alignment);
                            } else if (value === null && alignments[alignment] === true) {
                                dmgNames.push(alignment);
                            };
                        };
                    };
                    for (const [alignment, value] of Object.entries(alignments || {})) {
                        if (value === true && !(overrideAlignments && overrideAlignments[alignment] === false)) {
                            if (!dmgNames.includes(alignment)) {
                                dmgNames.push(alignment);
                            };
                        };
                    };
                    if (overrideMaterials && overrideMaterials.trim() !== "") {
                        if (itemAction[0]?.data?.material?.custom) {
                            const customMaterials = overrideMaterials.split(',').map(name => name.trim().toLowerCase());
                            dmgNames.push(...customMaterials);
                        } else {
                            dmgNames.push(overrideMaterials);
                        };
                    } else {
                        if (materials?.normal?.value) {
                            if (!materials.normal.custom) {
                                const material = materials.normal.value;
                                dmgNames.push(material);
                            } else {
                                const customMaterials = materials.normal.value.split(',').map(name => name.trim().toLowerCase());
                                dmgNames.push(...customMaterials);
                            };
                        };
                    };
    
                    if (materials?.addon?.length > 0) {
                        materials.addon.forEach(addon => {
                            if (!dmgNames.includes(addon)) {
                                dmgNames.push(addon);
                            };
                        });
                    };
                    
                    if (overrideAddons?.length > 0) {
                        overrideAddons.forEach(addon => {
                            if (!dmgNames.includes(addon)) {
                                dmgNames.push(addon);
                            };
                        });
                    };
                };
            };
            const damageAmount = damage.total;
            dmgNames.forEach((name, i) => {
                dmgNames[i] = name.trim().toLowerCase();
            });
            if (dmgNames.length > 0) {
                damageSortObjects.push({ names: dmgNames, amount: damageAmount, index });
            }
            return dmgNames;
        } else {
            if (damage.class === "NumericTerm" || damage.class === "Die") {
                if (!damage.options?.flavor) {
                    const dmgNames = ["untyped"]
                    const damageAmount = damage.class === "NumericTerm"
                    ? damage.number
                    : damage.results.filter(result => result.active).reduce((sum, result) => sum + result.result, 0);
                    damage.total = damageAmount;
                    dmgNames.forEach((name, i) => {
                        dmgNames[i] = name.trim().toLowerCase();
                    });
                    damageSortObjects.push({ names: dmgNames, amount: damageAmount, index });
                    return dmgNames;
                } else {
                    const dmgNames = damage.options?.flavor.split(',').map(name => name.trim());
                    const damageAmount = damage.class === "NumericTerm"
                    ? damage.number
                    : damage.results.filter(result => result.active).reduce((sum, result) => sum + result.result, 0);
                    damage.total = damageAmount;
                    dmgNames.forEach((name, i) => {
                        dmgNames[i] = name.trim().toLowerCase();
                    });
                    damageSortObjects.push({ names: dmgNames, amount: damageAmount, index });
                    return dmgNames;
                };
            };
        };
    }).flat();
    damageSortObjects.sort((a, b) => b.amount - a.amount);

    return { damageSortObjects, damageTypes, itemAction, abilityDmg };
}

function damageReductionCalculation (attackDamage, damageReductions, damageTypes, damageSortObjects, itemSource, itemAction, message, hardness) {
    const drCustom = damageReductions.custom.split(';');
    const totalDR = [];
    if(drCustom.length > 0 && drCustom[0].length > 0) {
        
        const andOrRegex = /\b(and|or)\b/;
        const damageAmount = /\d+/;

        drCustom.forEach(string=>{
        const regexResult = string.match(andOrRegex);
        const damageAmountResult = string.match(damageAmount);
        if(!damageAmountResult) return console.warn('Amount missing from reduction');
            let types = [];
            if(regexResult) {
                let splitted = string.split(regexResult[0]);
                for(let i=0;i<splitted.length;i++) {
                    splitted[i] = splitted[i].replace('/',' ').replace(/\d+/,'').toLowerCase().replace('dr','').trim();
                };
                if(splitted[1]=='') {
                    splitted = splitted[0].split(' ');
                };
                types = splitted;
                totalDR.push({amount:parseInt(damageAmountResult[0]),types,operator:regexResult[0]=='and'?false:true});
            } else {
                let splitted = string.replace('/',' ').replace(/\d+/,'').toLowerCase().replace('dr','').trim();
                types = [splitted];
                totalDR.push({amount:parseInt(damageAmountResult[0]), types, operator:true})
            };
        });
    };
    const damagePriorityArray = [...AutomateDamageModule?.automateDamageConfig?.weaponDamageTypes];
    let biggestDamageTypePriority = 0;
    if((itemSource?.type == "attack" && (itemSource?.subType == "weapon" || itemSource?.subType == "natural")) || itemSource?.type == "weapon") {
        let enhBonus = 0;
        const actionEnhBonus = itemAction[0]?.enhancementBonus;
        const addons = itemSource.system.material?.addon;
        const hasAmmo = itemSource.system?.ammo;
        const rangedAction = itemAction[0]?.isRanged
        if (hasAmmo?.type !== "" && rangedAction) { // Check if the action is a ranged attack done with ammo
            let parser = new DOMParser();
            let doc = parser.parseFromString(message.content, 'text/html');
            let ammoElement = doc.querySelector('[data-ammo-id]');
            let ammoId = ammoElement ? ammoElement.getAttribute('data-ammo-id') : null;
            const ammoItem = itemSource.parent.items.get(ammoId);
            let ckl = ammoItem?.['ckl-roll-bonuses'] ?? {};
            if (ckl.hasOwnProperty('ammo-enhancement') || ckl.hasOwnProperty('ammo-enhancement-stacks')) {
                const enh = +ckl['ammo-enhancement'] || 0;
                const stacks = +ckl['ammo-enhancement-stacks'] || 0;
                enhBonus = enh + stacks;
            } else if (actionEnhBonus > 0) {
                enhBonus = 1;
            } else {
                const magicFlag = ammoItem.system?.flags?.boolean;
                for (let key in magicFlag) {
                    if (key.toLowerCase() == "magic") {
                        enhBonus = 1;
                        break;
                    };
                };
            };
        } else { 
            if (addons?.includes("magic")) {
                enhBonus = 1;
            } else if (addons?.includes("epic") && actionEnhBonus >= 6) {
                enhBonus = Math.max(6, actionEnhBonus);
            } else {
                enhBonus = actionEnhBonus || 0;
            };
        };
        biggestDamageTypePriority = enhBonus;
    } else {
        for(let i=damagePriorityArray.length-1;i>-1;i--) {
            const currentPrioritySegment = damagePriorityArray[i];
            if(currentPrioritySegment.find(priorityType=>damageTypes.includes(priorityType))) {
                biggestDamageTypePriority = i;
                break;
            };
        };
    };
    
    if(biggestDamageTypePriority>0) {
        damagePriorityArray.splice(biggestDamageTypePriority+1);
        damageTypes = damageTypes.concat(damagePriorityArray.flat());
    };
    
    const drValue = damageReductions.value;
    totalDR.unshift(...drValue);
    let highestDR = 0
    for(let i=0;i<totalDR.length;i++) {
        totalDR.forEach(dr => {
            if (dr.types.length === 2 && dr.types[0] === "" && dr.types[1] === "") {
                dr.types = ["-"];
            } else {
                dr.types = dr.types.filter(type => type !== "");
            }
            if(dr.amount > highestDR) {
                highestDR = dr.amount;
            };
        });
    };
    let appliedDR = false;
    totalDR.forEach(dr => {
        const allWeaponDamageTypes = [...AutomateDamageModule?.automateDamageConfig?.weaponDamageTypes,...AutomateDamageModule?.automateDamageConfig?.additionalPhysicalDamageTypes].flat(2);

        let remainder = {
            types: null,
            index: null,
            value: null
        };

        if(dr.operator == false) {
            for(let i = 0; i < dr.types.length ;i++) {
                const drType = dr.types[i];
                const hasDamageType = damageTypes.includes(drType)
                if(!hasDamageType && dr.amount == highestDR && !appliedDR) {
                    let found = false;
                    for(let i=0;i<damageSortObjects.length;i++) {
                        const currentDamageSortObject = damageSortObjects[i];
                        for(let t=0;t<allWeaponDamageTypes.length;t++) {
                            const currentWeaponDamageType = allWeaponDamageTypes[t];
                            if(currentDamageSortObject.names.includes(currentWeaponDamageType)) {
                                found = true;
                                if (attackDamage[currentDamageSortObject.index].total) { // If made through the system
                                    if (attackDamage[currentDamageSortObject.index].total-dr.amount < 0) {
                                        remainder.value = attackDamage[currentDamageSortObject.index].total-dr.amount;
                                        remainder.index = currentDamageSortObject.index
                                        remainder.types = currentDamageSortObject.names

                                        for (let index = 0; index < attackDamage.length; index++) {
                                            const damageRoll = attackDamage[index];
                                            if (index !== currentDamageSortObject.index) {
                                                const allDamageTypes = damageRoll.options.damageType;
                                            
                                                const exactMatch = remainder.types.every(type => allDamageTypes.includes(type));
                                            
                                                if (exactMatch) {
                                                    attackDamage[index].total =  Math.max(0, attackDamage[index].total+remainder.value);
                                                    if(attackDamage[index].total >= 0) {
                                                        break;
                                                    }
                                                };
                                            };
                                        };
                                    };
                                    attackDamage[currentDamageSortObject.index].total = Math.max(0, attackDamage[currentDamageSortObject.index].total-dr.amount);
                                    break;
                                } else { // If made through chat or macro
                                    attackDamage[currentDamageSortObject.index].number = Math.max(0, attackDamage[currentDamageSortObject.index].number-dr.amount);
                                    break;
                                };
                            };
                        };
                        if(found) break;
                    };
                    appliedDR = true;
                    break;
                };
            };
        
        } else {
            let passes = 0
            for(let i = 0; i < dr.types.length ;i++) {
                const drType = dr.types[i];
                const typeIndex = damageTypes.includes(drType)
                if(!typeIndex) {
                    passes++
                    if((passes == 2||dr.types.length==1) && dr.amount == highestDR && !appliedDR) {
                        let found = false;
                        for(let i=0;i<damageSortObjects.length;i++) {
                            const currentDamageSortObject = damageSortObjects[i];
                            for(let t=0;t<allWeaponDamageTypes.length;t++) {
                                const currentWeaponDamageType = allWeaponDamageTypes[t];
                                if(currentDamageSortObject.names.includes(currentWeaponDamageType)) {
                                    found = true;
                                    if (attackDamage[currentDamageSortObject.index].total) { // If made through the system
                                        if (attackDamage[currentDamageSortObject.index].total-dr.amount < 0) {
                                            remainder.value = attackDamage[currentDamageSortObject.index].total-dr.amount;
                                            remainder.index = currentDamageSortObject.index
                                            remainder.types = currentDamageSortObject.names
    
                                            for (let index = 0; index < attackDamage.length; index++) {
                                                const damageRoll = attackDamage[index];
                                                if (index !== currentDamageSortObject.index) {
                                                    const allDamageTypes = damageRoll.options.damageType;
                                                
                                                    const exactMatch = remainder.types.every(type => allDamageTypes.includes(type));
                                                
                                                    if (exactMatch) {
                                                        attackDamage[index].total =  Math.max(0, attackDamage[index].total+remainder.value);
                                                        if(attackDamage[index].total >= 0) {
                                                            break;
                                                        }
                                                    };
                                                };
                                            };
                                        };
                                        attackDamage[currentDamageSortObject.index].total = Math.max(0, attackDamage[currentDamageSortObject.index].total-dr.amount);
                                        break;
                                    } else { // If made through chat or macro
                                        attackDamage[currentDamageSortObject.index].number = Math.max(0, attackDamage[currentDamageSortObject.index].number-dr.amount);
                                        break;
                                    };
                                };
                            };
                            appliedDR = true;
                            if(found) break;
                        };
                    };
                };
            };
        };
    });
};

function damageImmunityCalculation(damageImmunities, attackDamage, damageSortObjects) {
    const diCustom = damageImmunities.custom.map(name => name.toLowerCase());

    damageSortObjects.forEach(object => {
        object.names.forEach(type => {
            if(damageImmunities.standard.has(type) || diCustom.has(type)) {
                object.amount = 0;
                if (attackDamage[object.index].total) { // If made through the system
                    attackDamage[object.index].total = object.amount
                } else { // If made through chat or macro
                    attackDamage[object.index].number = object.amount
                };
            };
        });
    });
};

function damageVulnerabilityCalculation(damageVulnerabilities, attackDamage, damageSortObjects) {
    const dvCustom = damageVulnerabilities.custom.map(name => name.toLowerCase());

    damageSortObjects.forEach(object => {
        object.names.forEach(type=>{
            if (damageVulnerabilities.standard.has(type) || dvCustom.has(type)) {
                object.amount *= 1.5;
                object.amount = Math.floor(object.amount);
                if (attackDamage[object.index].total) { // If made through the system
                    attackDamage[object.index].total = object.amount
                } else { // If made through chat or macro
                    attackDamage[object.index].number = object.amount
                };
            };
        });
    
    });
};

function elementalResistancesCalculation(eRes, attackDamage, damageTypes, damageSortObjects) {
    const erCustom = eRes.custom.split(';').map(name => name.toLowerCase());

    const totalER = [];
    if (erCustom.length > 0 && erCustom[0].length > 0) {
        const andOrRegex = /\b(and|or)\b/;
        const damageAmount = /\d+/;

        erCustom.forEach(string => {
            const regexResult = string.match(andOrRegex);
            const damageAmountResult = string.match(damageAmount);
            if (!damageAmountResult) return console.warn('Amount missing from reduction');
            let types = [];
            if (regexResult) {
                let splitted = string.split(regexResult[0]);
                for (let i = 0; i < splitted.length; i++) {
                    splitted[i] = splitted[i].replace('/', ' ').replace(/\d+/, '').toLowerCase().replace('dr', '').trim();
                }
                if (splitted[1] == '') {
                    splitted = splitted[0].split(' ');
                }
                types = splitted;
                totalER.push({ amount: parseInt(damageAmountResult[0]), types, operator: regexResult[0] == 'and' ? false : true })
            } else {
                let splitted = string.replace('/', ' ').replace(/\d+/, '').toLowerCase().replace('dr', '').trim();
                types = [splitted];
                totalER.push({ amount: parseInt(damageAmountResult[0]), types, operator: true })
            };
        });
    };

    const erValue = eRes.value;
    totalER.unshift(...erValue);

    totalER.forEach(er => {
        let found = false;
        let remainder = {
            types: null,
            index: null,
            value: null
        };
        if (er.operator === false) {
            for (let i = 0; i < er.types.length; i++) {
                const erType = er.types[i];
                if (!damageTypes.includes(erType)) {
                    found = false;
                    break;
                } else {
                    found = true;
                };
            };
            if (found) {
                for (let j = 0; j < damageSortObjects.length; j++) {
                    const currentDamageSortObject = damageSortObjects[j];
                    if (er.types.every(type => currentDamageSortObject.names.includes(type))) {
                        if (attackDamage[currentDamageSortObject.index].total) { // If made through the system
                            if (attackDamage[currentDamageSortObject.index].total-er.amount < 0) {
                                remainder.value = attackDamage[currentDamageSortObject.index].total-er.amount;
                                remainder.index = currentDamageSortObject.index
                                remainder.types = currentDamageSortObject.names

                                for (let index = 0; index < attackDamage.length; index++) {
                                    const damageRoll = attackDamage[index];
                                    if (index !== currentDamageSortObject.index) {
                                        const allDamageTypes = damageRoll.options.damageType;
                                    
                                        const exactMatch = remainder.types.every(type => allDamageTypes.includes(type));
                                    
                                        if (exactMatch) {
                                            attackDamage[index].total =  Math.max(0, attackDamage[index].total+remainder.value);
                                            if(attackDamage[index].total >= 0) {
                                                break;
                                            }
                                        };
                                    };
                                };
                            };
                            const newTotal = Math.max(0, attackDamage[currentDamageSortObject.index].total - er.amount);
                            attackDamage[currentDamageSortObject.index].total = newTotal;
                        } else { // If made through chat or macro
                            const newTotal = Math.max(0, attackDamage[currentDamageSortObject.index].number - er.amount);
                            attackDamage[currentDamageSortObject.index].number = newTotal;
                        };
                    };
                };
            };
        } else {
            for (let i = 0; i < er.types.length; i++) {
                const erType = er.types[i];
                if (damageTypes.includes(erType)) {
                    for (let j = 0; j < damageSortObjects.length; j++) {
                        const currentDamageSortObject = damageSortObjects[j];
                        if (currentDamageSortObject.names.includes(erType)) {
                            if (attackDamage[currentDamageSortObject.index].total) {
                                if (attackDamage[currentDamageSortObject.index].total-er.amount < 0) {
                                    remainder.value = attackDamage[currentDamageSortObject.index].total-er.amount;
                                    remainder.index = currentDamageSortObject.index
                                    remainder.types = currentDamageSortObject.names

                                    for (let index = 0; index < attackDamage.length; index++) {
                                        const damageRoll = attackDamage[index];
                                        if (index !== currentDamageSortObject.index) {
                                            const allDamageTypes = damageRoll.options.damageType;
                                        
                                            const exactMatch = remainder.types.every(type => allDamageTypes.includes(type));
                                        
                                            if (exactMatch) {
                                                attackDamage[index].total =  Math.max(0, attackDamage[index].total+remainder.value);
                                                if(attackDamage[index].total >= 0) {
                                                    break;
                                                }
                                            };
                                        };
                                    };
                                };
                                const newTotal = Math.max(0, attackDamage[currentDamageSortObject.index].total - er.amount);
                                attackDamage[currentDamageSortObject.index].total = newTotal;
                                break;
                            } else {
                                const newTotal = Math.max(0, attackDamage[currentDamageSortObject.index].number - er.amount);
                                attackDamage[currentDamageSortObject.index].number = newTotal;
                                break;

                            };
                        };
                    };
                    break;
                };
            };
        };
    });
};

function hardnessCalculation(attackDamage, eRes, damageReductions, damageTypes, damageSortObjects, itemSource, hardness) {
    if (hardness <= 0) return;

    // Check if the attack can ignore or reduce hardness
    let hardnessToIgnore = 0;
    let isAdamantine = false;

    // Check for ignoreHardness flags on the item
    const booleanFlags = itemSource?.system?.flags?.boolean || {};
    const dictionaryFlags = itemSource?.system?.flags?.dictionary || {};

    // Check boolean flags for ignoreHardness
    for (let key in booleanFlags) {
        if (key.toLowerCase() === "ignorehardness" && booleanFlags[key]) {
            hardnessToIgnore = hardness; // Ignore all hardness
            break;
        }
    }

    // Check dictionary flags for ignoreHardness value
    for (let key in dictionaryFlags) {
        if (key.toLowerCase() === "ignorehardness") {
            const value = parseInt(dictionaryFlags[key], 10);
            if (!isNaN(value)) {
                hardnessToIgnore = Math.max(hardnessToIgnore, value); // Use the maximum value if multiple exist
            }
        }
    }

    // If hardness is being ignored by the flags
    if (hardnessToIgnore >= hardness) {
        return; // Skip applying hardness reduction
    } else if (hardnessToIgnore > 0) {
        hardness -= hardnessToIgnore; // Reduce the hardness by the ignored amount
    }

    // Check if the weapon is made of adamantine
    const materials = itemSource?.system?.material;
    if (materials) {
        if (materials.normal?.value?.toLowerCase() === 'adamantine' ||
            materials.addon?.includes('adamantine')) {
            isAdamantine = true;
        }
    }

    if (isAdamantine && hardness <= 20) {
        return; // Skip applying hardness reduction
    }

    let remainder = {
        types: null,
        index: null,
        value: null
    };


    let remainingHardness = hardness;

    for (let i = 0; i < damageSortObjects.length && remainingHardness > 0; i++) {
        const object = damageSortObjects[i];
        const index = object.index;
        const damageTerm = attackDamage[index];

        let damageValue = 0;

        if (damageTerm.total !== undefined) {
            // System-generated rolls
            damageValue = damageTerm.total;
        } else if (damageTerm.number !== undefined) {
            // Manual rolls
            damageValue = damageTerm.number;
        } else {
            continue; // Skip if no damage value found
        }

        const damageAfterHardness = Math.max(0, damageValue - remainingHardness);

        const hardnessUsed = damageValue - damageAfterHardness;

        remainingHardness -= hardnessUsed;

        if (damageTerm.total !== undefined) {
            attackDamage[index].total = damageAfterHardness;
        } else if (damageTerm.number !== undefined) {
            attackDamage[index].number = damageAfterHardness;
        }
    }
};

function abilityDamageCalculation(damageImmunities, conditionImmunities, abilities, abilityDmg) {
    if (!abilityDmg || abilityDmg.length === 0) return;
    const translations = game.settings.get(AutomateDamageModule?.MODULE.ID, "translations") || {};
    const constructTranslation = translations.construct || "Construct Traits";
    const undeadTranslation = translations.undead || "Undead Traits";
    const abilityFullNames = {
        str: translations.str || "Strength",
        dex: translations.dex || "Dexterity",
        con: translations.con || "Constitution",
        int: translations.int || "Intelligence",
        wis: translations.wis || "Wisdom",
        cha: translations.cha || "Charisma"
    };
    const reverseAbilityMap = Object.entries(abilityFullNames).reduce((acc, [key, fullName]) => {
        acc[key] = key;
        acc[fullName.toLowerCase()] = key;
        return acc;
    }, {});
    const abilityPatterns = Object.entries(abilityFullNames).map(
        ([key, fullName]) => `${key}|${fullName}`
    ).join("|");
    const patterns = {
        allAbilities: /^All Ability Damage$/i,
        allDamage: /^Ability Damage$/i,
        allDrain: /^Ability Drain$/i,
        allPenalty: /^Ability Penalty$/i,
        keyDamage: new RegExp(`^(${abilityPatterns}) Damage$`, "i"),
        keyDrain: new RegExp(`^(${abilityPatterns}) Drain$`, "i"),
        keyPenalty: new RegExp(`^(${abilityPatterns}) Penalty$`, "i"),
        allKey: new RegExp(`^All (${abilityPatterns}) Damage$`, "i"),
        mentalDamage: /^Mental Ability Damage$/i,
        mentalDrain: /^Mental Ability Drain$/i,
        mentalPenalty: /^Mental Ability Penalty$/i,
        allMental: /^All Mental Abilities$/i,
        physicalDamage: /^Physical Ability Damage$/i,
        physicalDrain: /^Physical Ability Drain$/i,
        physicalPenalty: /^Physical Ability Penalty$/i,
        allPhysical: /^All Physical Abilities$/i
    };
    for (const dmg of abilityDmg) {
        const { vs, amount, ablDmgType, type } = dmg;
        if (amount <= 0) continue; // Skip if there's no damage amount

        let isImmune = false;
        if (damageImmunities.standard.find(v => v.toLowerCase() === type.toLowerCase())) {
            isImmune = true;
            break;
        }
        if (conditionImmunities.custom.some(trait => trait.toLowerCase() === constructTranslation.toLowerCase())) {
            dmg.amount = 0;
            continue;
        } else if (conditionImmunities.custom.some(trait => trait.toLowerCase() === undeadTranslation.toLowerCase())) {
            if (ablDmgType === "damage" && (vs === "str" || vs === "dex" || vs === "con")) {
                dmg.amount = 0;
            } else if (ablDmgType === "drain" || ablDmgType === "penalty") {
                dmg.amount = 0;
            }
            continue;
        }
        for (const immunity of damageImmunities.custom) {
            const matchedKey = immunity.match(patterns.keyDamage) || immunity.match(patterns.keyDrain) || immunity.match(patterns.keyPenalty);
            const immunityKey = matchedKey && reverseAbilityMap[matchedKey[1].toLowerCase()];

            if (patterns.allAbilities.test(immunity)) {
                dmg.amount = 0;
                isImmune = true;
                break;
            } else if (patterns.allDamage.test(immunity) && ablDmgType === "damage") {
                dmg.amount = 0;
                isImmune = true;
                break;
            } else if (patterns.allDrain.test(immunity) && ablDmgType === "drain") {
                dmg.amount = 0;
                isImmune = true;
                break;
            } else if (patterns.allPenalty.test(immunity) && ablDmgType === "penalty") {
                dmg.amount = 0;
                isImmune = true;
                break;
            } else if (patterns.keyDamage.test(immunity) && ablDmgType === "damage" && immunityKey === vs) {
                dmg.amount = 0;
                isImmune = true;
                break;
            } else if (patterns.keyDrain.test(immunity) && ablDmgType === "drain" && immunityKey === vs) {
                dmg.amount = 0;
                isImmune = true;
                break;
            } else if (patterns.keyPenalty.test(immunity) && ablDmgType === "penalty" && immunityKey === vs) {
                dmg.amount = 0;
                isImmune = true;
                break;
            } else if (patterns.allKey.test(immunity) && immunityKey === vs) {
                dmg.amount = 0;
                isImmune = true;
                break;
            } else if (patterns.mentalDamage.test(immunity) && ablDmgType === "damage" && (vs === "int" || vs === "wis" || vs === "cha")) {
                dmg.amount = 0;
                isImmune = true;
                break;
            } else if (patterns.mentalDrain.test(immunity) && ablDmgType === "drain" && (vs === "int" || vs === "wis" || vs === "cha")) {
                dmg.amount = 0;
                isImmune = true;
                break;
            } else if (patterns.mentalPenalty.test(immunity) && ablDmgType === "penalty" && (vs === "int" || vs === "wis" || vs === "cha")) {
                dmg.amount = 0;
                isImmune = true;
                break;
            } else if (patterns.allMental.test(immunity) && (vs === "int" || vs === "wis" || vs === "cha")) {
                dmg.amount = 0;
                isImmune = true;
                break;
            } else if (patterns.physicalDamage.test(immunity) && ablDmgType === "damage" && (vs === "str" || vs === "dex" || vs === "con")) {
                dmg.amount = 0;
                isImmune = true;
                break;
            } else if (patterns.physicalDrain.test(immunity) && ablDmgType === "drain" && (vs === "str" || vs === "dex" || vs === "con")) {
                dmg.amount = 0;
                isImmune = true;
                break;
            } else if (patterns.physicalPenalty.test(immunity) && ablDmgType === "penalty" && (vs === "str" || vs === "dex" || vs === "con")) {
                dmg.amount = 0;
                isImmune = true;
                break;
            } else if (patterns.allPhysical.test(immunity) && (vs === "str" || vs === "dex" || vs === "con")) {
                dmg.amount = 0;
                isImmune = true;
                break;
            }
        }
        if (!isImmune && abilities.hasOwnProperty(vs) && dmg.amount > 0) {
            switch (ablDmgType) {
                case "damage":
                    abilities[vs].damage += dmg.amount;
                    break;
                case "drain":
                    abilities[vs].drain += dmg.amount;
                    break;
                case "penalty":
                    abilities[vs].userPenalty += dmg.amount;
                    break;
            }
        }
    }
}