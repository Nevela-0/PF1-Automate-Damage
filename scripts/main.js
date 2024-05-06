import {automateDamageConfig, registerSettings} from './config.js';

Hooks.once('ready', overrideApplyDamage);
Hooks.once("setup", function() {
    registerSettings();
});

function overrideApplyDamage () {
    libWrapper.register('pf1-automate-damage', 'pf1.documents.item.ItemPF._onChatCardAction', interceptCardData, libWrapper.MIXED);
    const originalApplyDamage = pf1.documents.actor.ActorPF.applyDamage;
    libWrapper.register('pf1-automate-damage', 'pf1.documents.actor.ActorPF.applyDamage', function (value, config) {
        customApplyDamage(originalApplyDamage, value, config);
        return;
    }, 'OVERRIDE');
}

const targetInfo = {
    id: "",
    buttonType: ""
}

function interceptCardData(wrapped, actionName, elementObject) {
    if(actionName == "applyDamage") {
        targetInfo.id = elementObject.button.closest('.chat-message').getAttribute('data-message-id');
        targetInfo.buttonType = elementObject.button.dataset.tooltip;
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
        }
        const itemSource = game.messages.get(messageId).itemSource;
        const itemType = game.messages.get(messageId).itemSource?.type;
        const damageMult = targetInfo.buttonType == "PF1.ApplyHalf" ? 0.5 : 1;
        if (systemRolls?.attacks?.length > 0) {
            systemRolls.attacks.forEach(attack => {
                if (attack.damage?.length > 0) {
                    const attackDamage = JSON.parse(JSON.stringify(attack.damage));
                    const {damageSortObjects, damageTypes} = sortDamage(attackDamage);
                    damageImmunityCalculation(damageImmunities, attackDamage, damageSortObjects);
                    damageVulnerabilityCalculation(damageVulnerabilities, attackDamage, damageSortObjects);
                    elementalResistancesCalculation(eRes, attackDamage, damageTypes, damageSortObjects);
                    damageReductionCalculation(attackDamage, damageReductions, damageTypes, damageSortObjects)
                    attackDamage.forEach(damage => {
                        const damageTypes = damage.options?.damageType?.values || []
                            const customDamageTypeValue = damage.options?.damagetype?.custom?.trim() || "";
                            if(customDamageTypeValue.length>0) {
                                damageTypes.push(customDamageTypeValue)
                            }
                            if(damageTypes.length < 1) {
                                damageTypes[0] = "untyped"

                            }
                            
                                let damageForType = Math.floor(damage.total * damageMult)|| 0; // Default to 0 if total damage is not defined

                                totalDamage += Math.max(0, damageForType);
                         
                    });
                }
            });
        } else {
            systemRolls.forEach(damage => {
                let rolledDamage = Math.floor(damage.total * damageMult)|| 0; // Default to 0 if total damage is not defined

                totalDamage += Math.max(0, rolledDamage);
            })
        }
            originalApplyDamage(totalDamage, config);
    });
}

function sortDamage(attackDamage) {
    // Handle Actual Reduction from incoming damage
    const damageSortObjects = [];
    const damageTypes = attackDamage.map((damage, index) => {
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
    }).flat();
    damageSortObjects.sort((a, b) => b.amount - a.amount);

    return { damageSortObjects, damageTypes };
}



function damageReductionCalculation (attackDamage, damageReductions, damageTypes, damageSortObjects) {
//Get Character Damage Reduction
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
        }
        if(splitted[1]=='') {
            splitted = splitted[0].split(' ');
        }
        types = splitted;
        totalDR.push({amount:parseInt(damageAmountResult[0]),types,operator:regexResult[0]=='and'?false:true})
    } else {
        let splitted = string.replace('/',' ').replace(/\d+/,'').toLowerCase().replace('dr','').trim();
        types = [splitted];
        totalDR.push({amount:parseInt(damageAmountResult[0]), types, operator:true})
    }
});
};

const damagePriorityArray = [...automateDamageConfig.weaponDamageTypes];
let biggestDamageTypePriority = 0;
for(let i=damagePriorityArray.length-1;i>-1;i--) {
    const currentPrioritySegment = damagePriorityArray[i];
    if(currentPrioritySegment.find(priorityType=>damageTypes.includes(priorityType))) {
        biggestDamageTypePriority = i;
        break;
    }
}

if(biggestDamageTypePriority>0) {
     damagePriorityArray.splice(biggestDamageTypePriority,1);
     damageTypes.push(damagePriorityArray.flat());
}

const drValue = damageReductions.value;
totalDR.unshift(...drValue);
totalDR.forEach(dr => {
    const allWeaponDamageTypes = [...automateDamageConfig.weaponDamageTypes,...automateDamageConfig.additionalPhysicalDamageTypes].flat(2);
    // operator true = "or"; operator false = "and"
    if(dr.operator == false) {
            for(let i = 0; i < dr.types.length ;i++) {
                const drType = dr.types[i];
                const hasDamageType = damageTypes.includes(drType)
                if(!hasDamageType) {
                    let found = false;
                   for(let i=0;i<damageSortObjects.length;i++) {
                    const currentDamageSortObject = damageSortObjects[i];
                    for(let t=0;t<allWeaponDamageTypes.length;t++) {
                        const currentWeaponDamageType = allWeaponDamageTypes[t];
                        if(currentDamageSortObject.names.includes(currentWeaponDamageType)) {
                            found = true;
                            attackDamage[currentDamageSortObject.index].total = Math.max(0, attackDamage[currentDamageSortObject.index].total-dr.amount);
                            break;
                        }
                    }
                    if(found) break;
                   }
                    break;
                }
            }

    } else {
        let passes = 0
        for(let i = 0; i < dr.types.length ;i++) {
            const drType = dr.types[i];
            const typeIndex = damageTypes.includes(drType)
            if(!typeIndex) {
                passes++
                if(passes == 2||dr.types.length==1) {
                    let found = false;
                    for(let i=0;i<damageSortObjects.length;i++) {
                        const currentDamageSortObject = damageSortObjects[i];
                        for(let t=0;t<allWeaponDamageTypes.length;t++) {
                            const currentWeaponDamageType = allWeaponDamageTypes[t];
                            if(currentDamageSortObject.names.includes(currentWeaponDamageType)) {
                                found = true;
                                attackDamage[currentDamageSortObject.index].total = Math.max(0, attackDamage[currentDamageSortObject.index].total-dr.amount);
                                break;
                            }
                        }
                        if(found) break;
                    }
                }
            }
        }
    }
})

}

function damageImmunityCalculation(damageImmunities, attackDamage, damageSortObjects) {
    const diCustom = damageImmunities.custom.split(';').map(name => name.toLowerCase());

    damageSortObjects.forEach(object => {
        object.names.forEach(type => {
            if(damageImmunities.value.includes(type) || diCustom.includes(type)) {
                object.amount = 0;
                attackDamage[object.index].total = object.amount
            }
        })
    })
}

function damageVulnerabilityCalculation(damageVulnerabilities, attackDamage, damageSortObjects) {
    const dvCustom = damageVulnerabilities.custom.split(';').map(name => name.toLowerCase());

    damageSortObjects.forEach(object => {
        object.names.forEach(type=>{
            if (damageVulnerabilities.value.includes(type) || dvCustom.includes(type)) {
                object.amount *= 1.5;
                object.amount = Math.floor(object.amount);
                attackDamage[object.index].total = object.amount
            }
        })
    
    })
}

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
            }
        });
    }

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
                }
            }
            if (found) {
                for (let j = 0; j < damageSortObjects.length; j++) {
                    const currentDamageSortObject = damageSortObjects[j];
                    if (er.types.every(type => currentDamageSortObject.names.includes(type))) {
                        const newTotal = Math.max(0, attackDamage[currentDamageSortObject.index].total - er.amount);
                        attackDamage[currentDamageSortObject.index].total = newTotal;
                    }
                }
            }
        } else {
            for (let i = 0; i < er.types.length; i++) {
                const erType = er.types[i];
                if (damageTypes.includes(erType)) {
                    for (let j = 0; j < damageSortObjects.length; j++) {
                        const currentDamageSortObject = damageSortObjects[j];
                        if (currentDamageSortObject.names.includes(erType)) {
                            const newTotal = Math.max(0, attackDamage[currentDamageSortObject.index].total - er.amount);
                            attackDamage[currentDamageSortObject.index].total = newTotal;
                        }
                    }
                    break;
                }
            }
        }
    });
}