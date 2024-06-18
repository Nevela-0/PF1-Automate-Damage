import {automateDamageConfig, registerSettings} from './config.js';
import { onRenderChatMessage } from './buttons.js';
Hooks.on("renderChatMessage", (app, html, data) => {onRenderChatMessage(html)});
Hooks.once("ready", overrideApplyDamage);
Hooks.once("setup", function() {
    registerSettings();
});

function overrideApplyDamage () {
    libWrapper.register('pf1-automate-damage', 'pf1.documents.item.ItemPF._onChatCardAction', interceptCardData, libWrapper.MIXED);

    libWrapper.register('pf1-automate-damage', 'pf1.documents.actor.ActorPF.applyDamage', function (wrapped, value, config) {
        if (canvas.tokens.controlled.length && !config.healing) {
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
    isCritical: false,
    isCriticalButton: false
};

function interceptCardData(wrapped, actionName, elementObject) {
    if (actionName == "applyDamage" && elementObject.button) {
        const chatMessage = elementObject.button.closest('.chat-message');
        const chatAttack = elementObject.button.closest('.chat-attack');

        if (chatMessage) {
            targetInfo.id = chatMessage.getAttribute('data-message-id');
        };
        targetInfo.buttonType = elementObject.button.dataset.tooltip || elementObject.button.innerText;
        if (chatAttack) {
            targetInfo.attackIndex = chatAttack.getAttribute('data-index');
            const isCriticalConfirmation = chatAttack.querySelector('.attack-flavor.crit-confirm');
            const isCriticalDamage = chatAttack.querySelector('.damage .inline-action[data-tooltip*="Critical Damage"]');
            targetInfo.isCritical = !!isCriticalConfirmation || !!isCriticalDamage;
            const damageElement = elementObject.button.closest('th');
            if (damageElement && damageElement.textContent.includes('Critical Damage')) {
                targetInfo.isCriticalButton = true;
            } else {
                targetInfo.isCriticalButton = false;
            };
        };
    };
    return wrapped(actionName, elementObject);
};

function customApplyDamage(originalApplyDamage, value, config) {
    canvas.tokens.controlled.forEach(token => {
        let totalDamage = 0;
        const traits = token.actor.system.traits;
        const eRes = traits.eres; // Energy resistances
        const damageImmunities = traits.di; // Damage Immunities
        const damageReductions = traits.dr; // Damage Reductions
        const damageVulnerabilities = traits.dv; // Damage Vulnerabilities
        const messageId = targetInfo.id;
        let systemRolls = game.messages.get(messageId).systemRolls;
        if(Object.keys(systemRolls).length == 0 && systemRolls.constructor == Object && game.messages.get(messageId).rolls) {
            systemRolls = game.messages.get(messageId).rolls;
        };
        const itemSource = game.messages.get(messageId).itemSource;
        const itemType = game.messages.get(messageId).itemSource?.type;
        const damageMult = targetInfo.buttonType == "PF1.ApplyHalf" || targetInfo.buttonType == "Apply Half" ? 0.5 : 1;
        if (systemRolls?.attacks?.length > 0) {
            const attack = systemRolls.attacks[targetInfo.attackIndex];
            if (attack.damage?.length > 0) {
                const attackDamage = targetInfo.isCriticalButton ? JSON.parse(JSON.stringify([...attack.damage, ...attack.critDamage])) : JSON.parse(JSON.stringify(attack.damage));
                const {damageSortObjects, damageTypes} = sortDamage(attackDamage);
                damageImmunityCalculation(damageImmunities, attackDamage, damageSortObjects);
                damageVulnerabilityCalculation(damageVulnerabilities, attackDamage, damageSortObjects);
                elementalResistancesCalculation(eRes, attackDamage, damageTypes, damageSortObjects);
                damageReductionCalculation(attackDamage, damageReductions, damageTypes, damageSortObjects, itemSource);
                attackDamage.forEach(damage => {
                    const damageTypes = damage.options?.damageType?.values || [];
                    const customDamageTypeValue = damage.options?.damagetype?.custom?.trim() || "";
                    if(customDamageTypeValue.length>0) {
                        damageTypes.push(customDamageTypeValue);
                    };
                    if(damageTypes.length < 1) {
                        damageTypes[0] = "untyped";
                    };
                    const type = damageTypes[0];
                    let damageForType = Math.floor(damage.total * damageMult) || 0; // Default to 0 if total damage is not defined

                    totalDamage += Math.max(0, damageForType);
                });
            };
        } else {
            systemRolls.forEach(roll => {
                const attackDamage = JSON.parse(JSON.stringify(roll.terms));
                const {damageSortObjects, damageTypes} = sortDamage(attackDamage, messageId);
                damageImmunityCalculation(damageImmunities, attackDamage, damageSortObjects);
                damageVulnerabilityCalculation(damageVulnerabilities, attackDamage, damageSortObjects);
                elementalResistancesCalculation(eRes, attackDamage, damageTypes, damageSortObjects);
                damageReductionCalculation(attackDamage, damageReductions, damageTypes, damageSortObjects, itemSource);
        
                attackDamage.forEach(damage => {
                    const healthFlag = game.messages.get(messageId).flags.pf1.subject.health == "damage" ? 1 : -1;
                    let rolledDamage = Math.floor((damage.number * healthFlag) * damageMult) || 0; // Default to 0 if total damage is not defined

                    totalDamage += rolledDamage;
                });
            });
        };
        originalApplyDamage(totalDamage, config);
    });
};

function sortDamage(attackDamage) {
    // Handle Actual Reduction from incoming damage
    const damageSortObjects = [];
    const damageTypes = attackDamage.map((damage, index) => {
        if(damage.options.damageType) {
            const dmgNames = damage.options.damageType.values;
            let customNames = damage.options.damageType.custom.trim(); // Make sure to declare customNames with let to reassign it later
            if (customNames.length > 0) {
                customNames = customNames.split(',').map(name => name.trim()); // Split by comma and trim whitespace
                dmgNames.push(...customNames); // Add custom names to dmgNames array
            }
            const damageAmount = damage.total;
            dmgNames.forEach((name, i) => {
                dmgNames[i] = name.trim().toLowerCase();
            });
            damageSortObjects.push({ names: dmgNames, amount: damageAmount, index });
            return dmgNames;
        } else {
            if (!damage.options.flavor){
                const dmgNames = ["untyped"]
                const damageAmount = damage.number;
                dmgNames.forEach((name, i) => {
                    dmgNames[i] = name.trim().toLowerCase();
                });
                damageSortObjects.push({ names: dmgNames, amount: damageAmount, index });
                return dmgNames;
            } else {
                const dmgNames = damage.options.flavor.split(',').map(name => name.trim());
                const damageAmount = damage.number;
                dmgNames.forEach((name, i) => {
                    dmgNames[i] = name.trim().toLowerCase();
                });
                damageSortObjects.push({ names: dmgNames, amount: damageAmount, index });
                return dmgNames;
            }
        }
    }).flat();
    damageSortObjects.sort((a, b) => b.amount - a.amount);

    return { damageSortObjects, damageTypes };
}



function damageReductionCalculation (attackDamage, damageReductions, damageTypes, damageSortObjects, itemSource) { 
    //Get Character Damage reduction
    const drCustom = damageReductions.custom.split(';');
    const totalDR = [];
    if(drCustom.length > 0 && drCustom[0].length > 0) {
        
        const andOrRegex = /\b(and|or)\b/;
        const damageAmount = /\d+/;

        const object = drCustom.forEach(string=>{
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
    const damagePriorityArray = [...automateDamageConfig.weaponDamageTypes];
    let biggestDamageTypePriority = 0;
    if((itemSource?.type == "attack" && (itemSource?.subType == "weapon" || itemSource?.subType == "natural")) || itemSource?.type == "weapon") {
        const weaponMaterial = itemSource.system.material.normal.value;
        if (weaponMaterial && typeof weaponMaterial == 'string') {
            damageTypes.push(weaponMaterial.toLowerCase().trim());
        }
        let isMagic = 0;
        if ((itemSource?.['ckl-roll-bonuses'] ?? {}).hasOwnProperty('enhancement')) {
            const { baseEnh, stackingEnh } = itemSource['ckl-roll-bonuses'].enhancement;
            isMagic = (baseEnh || 0) + (stackingEnh || 0);
        } else {
            const magicBox = itemSource.system.material.addon;
            if (magicBox.includes("magic")) {
                isMagic = 1;
            } else if (magicBox.includes("epic") && itemSource.system.enh >= 6) {
                isMagic = Math.max(6, itemSource.system.enh);
            } else {
                isMagic = itemSource.system.enh || 0;
            };
        };
        biggestDamageTypePriority = isMagic;
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
            if(dr.amount > highestDR) {
                highestDR = dr.amount;
            };
        });
    };
    totalDR.forEach(dr => {
        const allWeaponDamageTypes = [...automateDamageConfig.weaponDamageTypes,...automateDamageConfig.additionalPhysicalDamageTypes].flat(2);
        // operator true = "or"; operator false = "and"
        if(dr.operator == false) {
            for(let i = 0; i < dr.types.length ;i++) {
                const drType = dr.types[i];
                const hasDamageType = damageTypes.includes(drType)
                if(!hasDamageType && dr.amount == highestDR) {
                    let found = false;
                    for(let i=0;i<damageSortObjects.length;i++) {
                        const currentDamageSortObject = damageSortObjects[i];
                        for(let t=0;t<allWeaponDamageTypes.length;t++) {
                            const currentWeaponDamageType = allWeaponDamageTypes[t];
                            if(currentDamageSortObject.names.includes(currentWeaponDamageType)) {
                                found = true;
                                if (attackDamage[currentDamageSortObject.index].total) { // If made through the system
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
                    if((passes == 2||dr.types.length==1) && dr.amount == highestDR) {
                        let found = false;
                        for(let i=0;i<damageSortObjects.length;i++) {
                            const currentDamageSortObject = damageSortObjects[i];
                            for(let t=0;t<allWeaponDamageTypes.length;t++) {
                                const currentWeaponDamageType = allWeaponDamageTypes[t];
                                if(currentDamageSortObject.names.includes(currentWeaponDamageType)) {
                                    found = true;
                                    if (attackDamage[currentDamageSortObject.index].total) { // If made through the system
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
            if(damageImmunities.value.includes(type) || diCustom.includes(type)) {
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
            if (damageVulnerabilities.value.includes(type) || dvCustom.includes(type)) {
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
    //const customDamageTypes = damageTypes.split(';');

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
                                const newTotal = Math.max(0, attackDamage[currentDamageSortObject.index].total - er.amount);
                                attackDamage[currentDamageSortObject.index].total = newTotal;
                            } else {
                                const newTotal = Math.max(0, attackDamage[currentDamageSortObject.index].number - er.amount);
                                attackDamage[currentDamageSortObject.index].number = newTotal;

                            };
                        };
                    };
                    break;
                };
            };
        };
    });
};