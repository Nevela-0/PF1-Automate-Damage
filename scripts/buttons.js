export function onRenderChatMessage(html) {
    const messages = html[0]?.querySelectorAll('div.chat-attack');
    if (!messages?.length) return;
    messages.forEach(message => {
        const sections = message.querySelectorAll('tr.damage > th, th.attack-damage');
        
        const damageTypes = message.querySelectorAll('td.damage-types .damage-type .name, td.roll.damage.critical + td.damage-type .name');
        const damageRolls = message.querySelectorAll('td.roll.damage.normal a[data-tooltip], td.roll.damage.critical a[data-tooltip]');
    
        const normalDamageInfo = [];
        const criticalDamageInfo = [];
    
        damageTypes.forEach((damageTypeElement, index) => {
            const damageRollElement = damageRolls[index];
            const damageType = damageTypeElement?.textContent.trim();
            const totalDamage = parseInt(damageRollElement?.textContent.trim(), 10);
            const damageData = { damageType, totalDamage };
    
            // Check if the damageTypeElement is from normal or critical damage
            const parentTd = damageTypeElement.closest('td');
            if (parentTd.classList.contains('damage-types')) {
                // Normal Damage
                normalDamageInfo.push(damageData);
            } else {
                // Critical Damage
                criticalDamageInfo.push(damageData);
            }
        });
    
        sections.forEach((section, index) => {
            const heal = document.createElement('div');
            heal.innerHTML = "❤️";
            const healHalf = document.createElement('div');
            healHalf.innerHTML = "🩹";
            modifyElementStyles(heal, true);
            modifyElementStyles(healHalf);
            modifyElementAttributes(heal, "Heal");
            modifyElementAttributes(healHalf, "Heal Half");
            section.appendChild(heal);
            section.appendChild(healHalf);
    
            message.addEventListener('mouseenter', () => {
                heal.style.visibility = "visible";
                healHalf.style.visibility = "visible";
            });
    
            message.addEventListener('mouseleave', () => {
                heal.style.visibility = "hidden";
                healHalf.style.visibility = "hidden";
            });
    
            // Check if the button corresponds to a critical hit or normal hit
            const isCritical = section.getAttribute('data-damage-type') === 'critical';
    
            heal.addEventListener('click', () => {
                // If it's a critical button, add both normal and critical damage
                if (isCritical) {
                    applyHealing([...normalDamageInfo, ...criticalDamageInfo], 1);
                } else {
                    // If it's a normal button, only use normal damage
                    applyHealing(normalDamageInfo, 1);
                }
            });
    
            healHalf.addEventListener('click', () => {
                // If it's a critical button, add both normal and critical damage
                if (isCritical) {
                    applyHealing([...normalDamageInfo, ...criticalDamageInfo], 0.5);
                } else {
                    // If it's a normal button, only use normal damage
                    applyHealing(normalDamageInfo, 0.5);
                }
            });
        });
    });
}

function applyHealing(damageInfo, multiplier) {
    let healDamage = 0;
    damageInfo.forEach(({ damageType, totalDamage }) => {
        for (const [key, value] of pf1.registry.damageTypes.entries()) {
            if (damageType === value.name) {
                let healAmount = totalDamage * -1 * multiplier;
                if (multiplier === 0.5) {
                    healAmount = Math.ceil(healAmount);
                }
                if (value.flags?.['pf1-automate-damage']?.vsAbility) {
                    const ability = value.flags?.['pf1-automate-damage']?.abilities;
                    const ablDmgType = value.flags?.['pf1-automate-damage']?.type;

                    canvas.tokens.controlled.forEach(token => {
                        const tokenAbilities = token.actor.system.abilities;
                        const dmg = {
                            vs: ability,
                            amount: healAmount,
                            ablDmgType: ablDmgType
                        };
                        
                        // Iterate over all keys in the vs object
                        for (const abilityKey in dmg.vs) {
                            if (tokenAbilities.hasOwnProperty(abilityKey) && dmg.amount < 0) {
                                // Apply the healing based on the ablDmgType, ensuring it doesn't go below 0
                                switch (dmg.ablDmgType) {
                                    case "damage":
                                        tokenAbilities[abilityKey].damage = Math.max(tokenAbilities[abilityKey].damage + dmg.amount, 0);
                                        break;
                                    case "drain":
                                        tokenAbilities[abilityKey].drain = Math.max(tokenAbilities[abilityKey].drain + dmg.amount, 0);
                                        break;
                                    case "penalty":
                                        tokenAbilities[abilityKey].userPenalty = Math.max(tokenAbilities[abilityKey].userPenalty + dmg.amount, 0);
                                        break;
                                }
                            }
                        }
                        

                        let updates = {};
                        for (const key in tokenAbilities) {
                            updates[`system.abilities.${key}.damage`] = tokenAbilities[key].damage;
                            updates[`system.abilities.${key}.drain`] = tokenAbilities[key].drain;
                            updates[`system.abilities.${key}.userPenalty`] = tokenAbilities[key].userPenalty;
                        }
                        token.actor.update(updates);
                    });
                } else {
                    // Treat as normal damage to be healed
                    healDamage += totalDamage;
                }
            }
        }
    });

    // Apply the accumulated healing as normal damage healing
    if (healDamage > 0) {
        healDamage = healDamage * -1 * multiplier;
        if (multiplier === 0.5) {
            healDamage = Math.floor(healDamage);
        }
        const originalApplyDamage = pf1.documents.actor.ActorPF.applyDamage;
        originalApplyDamage(healDamage, { asNonLethal: false, healing: true });
    }
}


function modifyElementStyles (element, pulsating=false) {
    element.style.visibility="hidden";
    element.style.display="inline-block";

    if(pulsating) {
        const keyframes = [
            { transform: 'scale(1)' },
            { transform: 'scale(1.1)' },
            { transform: 'scale(1)' },
          ];
          
          const options = {
            duration: 600, 
            iterations: Infinity,
            easing: 'ease-in-out'
          };

          const animation = element.animate(keyframes, options);
          animation.pause()

          element.addEventListener('mouseenter',()=>{animation.play()});
          element.addEventListener('mouseleave',()=>{animation.pause()});

    } else {
        element.addEventListener('mouseenter',()=>{element.style.transform = 'scale(1.1)'});
        element.style.transition = "transform 150ms";
        element.addEventListener('mouseleave',()=>{element.style.transform = 'scale(1)'});
    };
};

function modifyElementAttributes (element, tooltipText) {
    element.setAttribute("data-tooltip", tooltipText);
};