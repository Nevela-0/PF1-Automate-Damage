Hooks.once('ready', overrideApplyDamage);

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
        const systemRolls = game.messages.get(messageId).systemRolls;
        const itemSource = game.messages.get(messageId).itemSource;
        const itemType = game.messages.get(messageId).itemSource.type;
        const damageMult = targetInfo.buttonType == "PF1.ApplyHalf" ? 0.5 : 1;
        if (systemRolls?.attacks?.length > 0) {
            systemRolls.attacks.forEach(attack => {
                if (attack.damage?.length > 0) {
                    attack.damage.forEach(damage => {
                        const damageTypes = damage.options?.damageType?.values || []
                            if(damageTypes.length < 1) {
                                damageTypes[0] = "untyped"

                            }
                            damageTypes.forEach(type => {
                                let damageForType = Math.floor(damage.total * damageMult)|| 0; // Default to 0 if total damage is not defined
                                        
                                if (itemType === "weapon" || (itemType === "attack" && itemSource.system.subType === "weapon")) {
                                    damageForType = weaponReductionCalculation(itemSource, damageReductions, damageForType, type);

                                } else {
                                    damageReductions.value.forEach(reduction => {
                                        if (reduction.types.includes(type)) {
                                            damageForType -= reduction.amount;
                                        }
                                    });
                                }
                                    
                                damageForType = damageImmunityCalculation(damageImmunities, type, damageForType);

                                damageForType = damageVulnerabilityCalculation(damageVulnerabilities, type, damageForType);

                                damageForType = calculateElementalReduction(eRes, type, damageForType);

                                totalDamage += Math.max(0, damageForType);
                            });
                    });
                }
            });
        }
            originalApplyDamage(totalDamage, config);
    });
}

function damageImmunityCalculation(damageImmunities, type, damageForType) {
    if (damageImmunities.value.includes(type)) {
        damageForType = 0;
    }
    return damageForType;
}

function damageVulnerabilityCalculation(damageVulnerabilities, type, damageForType) {
    if (damageVulnerabilities.value.includes(type)) {
        damageForType *= 1.5;
        damageForType = Math.floor(damageForType);
    }
    return damageForType;
}

function weaponReductionCalculation(itemSource, damageReductions, damageForType, type) {
    const isMagic = itemSource.system.enh;
    const hasDR = damageReductions.value.map(reduction => ({
        amount: reduction.amount,
        types: reduction.types
    }));
    const magicReduction = damageReductions.custom.split(';').find(reduction => reduction.trim().includes("magic"));
    const epicReduction = damageReductions.custom.split(';').find(reduction => reduction.trim().includes("epic"));
    const hasMagicReduction = magicReduction && magicReduction.trim().split('/')[1];
    const hasEpicReduction = epicReduction && epicReduction.trim().split('/')[1];

    if (!isMagic && (type == "slashing" || type == "piercing" || type == "bludgeoning")) {
        damageForType = nonMagicalWeaponCalculation(hasMagicReduction, hasEpicReduction, magicReduction, epicReduction, damageForType, type, hasDR);
    } else {
        damageForType = magicalWeaponCalculation(hasEpicReduction, epicReduction, isMagic, damageForType, type, hasDR);
    }
    return damageForType;
}

function nonMagicalWeaponCalculation(hasMagicReduction, hasEpicReduction, magicReduction, epicReduction, damageForType, type, hasDR) {
    let reductionAmount = 0;
    for (let i = 0; i < hasDR.length; i++) {
        if (!hasDR[i].types.includes(type) && (type == "slashing" || type == "piercing" || type == "bludgeoning")) {
            reductionAmount = hasDR[i].amount;
            break;
        }
    }

    if (hasMagicReduction && hasEpicReduction) {
        const magicReductionAmount = Math.max(parseInt(magicReduction.trim()), parseInt(epicReduction.trim()));
        if (!isNaN(magicReductionAmount)) {
            damageForType -= Math.max(reductionAmount, magicReductionAmount);
        }
    } else if (hasMagicReduction) {
        const magicReductionAmount = parseInt(magicReduction.trim());
        if (!isNaN(magicReductionAmount)) {
            damageForType -= Math.max(reductionAmount, magicReductionAmount);
        }
    } else if (hasEpicReduction) {
        const epicReductionAmount = parseInt(epicReduction.trim());
        if (!isNaN(epicReductionAmount)) {
            damageForType -= Math.max(reductionAmount, epicReductionAmount);
        }
    } else {
        damageForType -= reductionAmount;
    }
    return damageForType;
}

function magicalWeaponCalculation(hasEpicReduction, epicReduction, isMagic, damageForType, type, hasDR) {
    let reductionAmount = 0;
    for (let i = 0; i < hasDR.length; i++) {
        if (!hasDR[i].types.includes(type) && (type == "slashing" || type == "piercing" || type == "bludgeoning")) {
            reductionAmount = hasDR[i].amount;
            break;
        }
    }

    if (hasEpicReduction && (type == "slashing" || type == "piercing" || type == "bludgeoning")) {
        const epicReductionAmount = parseInt(epicReduction.trim());
        if (!isNaN(epicReductionAmount)) {
            if (epicReductionAmount === 0 || (epicReductionAmount > 0 && isMagic <= 6)) {
                damageForType -= Math.max(reductionAmount, epicReductionAmount);
            }
        }
    } else {
        damageForType -= reductionAmount
    }
    return damageForType;
}

function calculateElementalReduction(eRes, type, damageForType) {
    eRes.value.forEach(resistance => {
        if (resistance.types.includes(type)) {
            damageForType = Math.max(0, damageForType - resistance.amount);
        }
    });
    return damageForType;
}