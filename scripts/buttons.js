export function onRenderChatMessage(html) {
    const messages = html[0]?.querySelectorAll('div.chat-attack');
    if (!messages?.length) return;
    messages.forEach(message => {
        const sections = message.querySelectorAll('tr.damage > th, th.attack-damage');
const rows = message.querySelectorAll('tr');

const normalDamageInfo = [];
const criticalDamageInfo = [];

rows.forEach(row => {
    const normalRollElement = row.querySelector('td.roll.damage.normal a[data-tooltip]');
    const criticalRollElement = row.querySelector('td.roll.damage.critical a[data-tooltip]');
    const normalDamageTypes = Array.from(row.querySelectorAll('td.damage-types .damage-type, td.damage-types .custom'))
        .map(dt => dt.getAttribute('data-tooltip')?.trim() || dt.textContent.trim());
        
    const criticalDamageTypes = Array.from(row.querySelectorAll('td.damage-type .damage-type, td.damage-type .custom'))
        .map(dt => dt.getAttribute('data-tooltip')?.trim() || dt.textContent.trim());
    if (normalRollElement && normalDamageTypes.length > 0) {
        const totalDamage = parseInt(normalRollElement.textContent.trim(), 10);
        normalDamageInfo.push({ damageType: normalDamageTypes, totalDamage });
    }
    if (criticalRollElement && criticalDamageTypes.length > 0) {
        const totalDamage = parseInt(criticalRollElement.textContent.trim(), 10);
        criticalDamageInfo.push({ damageType: criticalDamageTypes, totalDamage });
    }
});

    
        sections.forEach((section, index) => {
            const applyDamageElements = section.querySelectorAll('a.inline-action[data-action="applyDamage"]');
            applyDamageElements.forEach(element => {
                const tooltip = element.getAttribute('data-tooltip');
                if (tooltip === 'PF1.ApplyHealing') {
                    element.setAttribute('data-tooltip', 'PF1.ApplyDamage');
                }
            });
            
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
            const isCritical = section.getAttribute('data-damage-type') === 'critical';
    
            heal.addEventListener('click', () => {
                if (isCritical) {
                    applyHealing([...normalDamageInfo, ...criticalDamageInfo], 1);
                } else {
                    applyHealing(normalDamageInfo, 1);
                }
            });
    
            healHalf.addEventListener('click', () => {
                if (isCritical) {
                    applyHealing([...normalDamageInfo, ...criticalDamageInfo], 0.5);
                } else {
                    applyHealing(normalDamageInfo, 0.5);
                }
            });
        });
    });
}

function applyHealing(damageInfo, multiplier) {
    let healDamage = 0;

    damageInfo.forEach(({ damageType, totalDamage }) => {
        damageType.forEach(dt => {
            for (const [key, value] of pf1.registry.damageTypes.entries()) {
                if (dt === value.name) {
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
                            
                            if (tokenAbilities.hasOwnProperty(dmg.vs) && dmg.amount < 0) {
                                switch (dmg.ablDmgType) {
                                    case "damage":
                                        tokenAbilities[dmg.vs].damage = Math.max(tokenAbilities[dmg.vs].damage + dmg.amount, 0);
                                        break;
                                    case "drain":
                                        tokenAbilities[dmg.vs].drain = Math.max(tokenAbilities[dmg.vs].drain + dmg.amount, 0);
                                        break;
                                    case "penalty":
                                        tokenAbilities[dmg.vs].userPenalty = Math.max(tokenAbilities[dmg.vs].userPenalty + dmg.amount, 0);
                                        break;
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
                        healDamage += totalDamage;
                    }
                }
            }
        });
    });
    if (healDamage > 0) {
        healDamage = healDamage * -1 * multiplier;
        if (multiplier === 0.5) {
            healDamage = Math.ceil(healDamage);
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