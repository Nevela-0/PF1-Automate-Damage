import { AutomateDamageModule } from './config.js';
export function onRenderChatMessage(html) {
    const root = (typeof jQuery !== 'undefined' && html instanceof jQuery) ? html[0] : html;
    const messages = root?.querySelectorAll('div.chat-attack');
    if (!messages?.length) return;
    messages.forEach(message => {
        const rows = Array.from(message.querySelectorAll('tr'));
        const normalDamageInfo = [];
        const criticalDamageInfo = [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.classList.contains('damage')) {
                let j = i + 1;
                let foundComponent = false;
                while (j < rows.length && rows[j].querySelector('td.roll.damage.normal')) {
                    foundComponent = true;
                    const rollCell = rows[j].querySelector('td.roll.damage.normal a.inline-roll');
                    const typeCell = rows[j].querySelector('td.damage-types');
                    let value = null, types = [];
                    if (rollCell) value = parseInt(rollCell.textContent.trim(), 10);
                    if (typeCell) {
                        types = Array.from(typeCell.querySelectorAll('.damage-type, .custom')).map(dt =>
                            dt.getAttribute('data-tooltip')?.trim() || dt.textContent.trim()
                        );
                    }
                    if (value !== null && types.length > 0) {
                        normalDamageInfo.push({ damageType: types, totalDamage: value });
                    }
                    j++;
                }
                if (!foundComponent) {
                    const normalRollElement = row.querySelector('td.roll.damage.normal a[data-tooltip]');
                    let normalDamageTypes = [];
                    const normalTDs = row.querySelectorAll('td.damage-types');
                    if (normalTDs.length > 0) {
                        normalDamageTypes = Array.from(normalTDs).flatMap(td =>
                            Array.from(td.querySelectorAll('.damage-type, .custom')).map(dt =>
                                dt.getAttribute('data-tooltip')?.trim() || dt.textContent.trim()
                            )
                        );
                    } else {
                        normalDamageTypes = Array.from(row.querySelectorAll('td.damage-types .damage-type, td.damage-types .custom'))
                            .map(dt => dt.getAttribute('data-tooltip')?.trim() || dt.textContent.trim());
                    }
                    if (normalRollElement && normalDamageTypes.length > 0) {
                        const totalDamage = parseInt(normalRollElement.textContent.trim(), 10);
                        normalDamageInfo.push({ damageType: normalDamageTypes, totalDamage });
                    }
                    const criticalRollElement = row.querySelector('td.roll.damage.critical a[data-tooltip]');
                    let criticalDamageTypes = [];
                    const criticalTDs = row.querySelectorAll('td.damage-type');
                    if (criticalTDs.length > 0) {
                        criticalDamageTypes = Array.from(criticalTDs).flatMap(td =>
                            Array.from(td.querySelectorAll('.damage-type, .custom')).map(dt =>
                                dt.getAttribute('data-tooltip')?.trim() || dt.textContent.trim()
                            )
                        );
                    } else {
                        criticalDamageTypes = Array.from(row.querySelectorAll('td.damage-type .damage-type, td.damage-type .custom'))
                            .map(dt => dt.getAttribute('data-tooltip')?.trim() || dt.textContent.trim());
                    }
                    if (criticalRollElement && criticalDamageTypes.length > 0) {
                        const totalDamage = parseInt(criticalRollElement.textContent.trim(), 10);
                        criticalDamageInfo.push({ damageType: criticalDamageTypes, totalDamage });
                    }
                }
            }
        }

        const sections = message.querySelectorAll('tr.damage > th, th.attack-damage');
    
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

export async function addClusteredShotsButton(html) {
    const root = (typeof jQuery !== 'undefined' && html instanceof jQuery) ? html[0] : html;
    const cards = root?.querySelectorAll('div.pf1.chat-card.item-card, div.chat-card.item-card.pf1');
    
    if (cards?.length) {
        for (const card of cards) {
            const tokenUuid = card.getAttribute('data-token-uuid');
            const itemId = card.getAttribute('data-item-id');
            const actionId = card.getAttribute('data-action-id');
            let shouldAddButton = false;
            if (tokenUuid && itemId && typeof fromUuid === 'function') {
                try {
                    const token = await fromUuid(tokenUuid);
                    const item = token?.actor?.items?.get(itemId);
                    let action = undefined;
                    if (item && item.actions && typeof item.actions.get === 'function' && actionId) {
                        action = item.actions.get(actionId);
                        if (action && action.isRanged) {
                            shouldAddButton = true;
                        }
                    }
                } catch (e) {
                }
            }
            if (!shouldAddButton) {
                card._skipClusteredShots = true;
            }
        }
    }
    const filteredCards = Array.from(cards).filter(card => {
        if (card._skipClusteredShots) return false;
        const chatAttacks = card.querySelectorAll('.chat-attack');
        return chatAttacks.length >= 2;
    });
    if (!filteredCards.length) {
        return;
    }
    filteredCards.forEach(card => {
        const chatAttacks = card.querySelectorAll('.chat-attack');
        if (!chatAttacks.length) return;
        
        const chatMessage = card.closest('.chat-message');
        if (!chatMessage || !chatMessage.getAttribute('data-message-id')) {
            return;
        }
        
        chatAttacks.forEach((attack, index) => {
            attack.style.position = 'relative';
            
            const hasCriticalDamage = attack.querySelector('tr.damage th[data-damage-type="critical"]') !== null;
            
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'cs-checkbox-container';
            checkboxContainer.style.position = 'absolute';
            checkboxContainer.style.right = '10px';
            checkboxContainer.style.top = '5px';
            checkboxContainer.style.visibility = 'hidden';
            checkboxContainer.style.zIndex = '100';
            checkboxContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
            checkboxContainer.style.padding = '3px 6px';
            checkboxContainer.style.borderRadius = '3px';
            checkboxContainer.style.display = 'flex';
            checkboxContainer.style.flexDirection = 'column';
            checkboxContainer.style.gap = '3px';
            
            const normalCheckbox = document.createElement('input');
            normalCheckbox.type = 'checkbox';
            normalCheckbox.className = 'cs-attack-checkbox cs-normal-checkbox';
            normalCheckbox.dataset.attackIndex = attack.getAttribute('data-index');
            normalCheckbox.dataset.damageType = 'normal';
            normalCheckbox.checked = false;
            normalCheckbox.style.cursor = 'pointer';
            normalCheckbox.style.verticalAlign = 'middle';
            
            const normalLabel = document.createElement('label');
            normalLabel.htmlFor = `cs-normal-checkbox-${index}`;
            normalLabel.style.marginLeft = '4px';
            normalLabel.style.cursor = 'pointer';
            normalLabel.style.color = 'white';
            normalLabel.style.fontSize = '12px';
            normalLabel.textContent = 'Normal';
            
            const normalContainer = document.createElement('div');
            normalContainer.appendChild(normalCheckbox);
            normalContainer.appendChild(normalLabel);
            
            checkboxContainer.setAttribute('data-tooltip', 'Include in Clustered Shots');
            
            checkboxContainer.appendChild(normalContainer);
            
            if (hasCriticalDamage) {
                const criticalCheckbox = document.createElement('input');
                criticalCheckbox.type = 'checkbox';
                criticalCheckbox.className = 'cs-attack-checkbox cs-critical-checkbox';
                criticalCheckbox.dataset.attackIndex = attack.getAttribute('data-index');
                criticalCheckbox.dataset.damageType = 'critical';
                criticalCheckbox.checked = false;
                criticalCheckbox.style.cursor = 'pointer';
                criticalCheckbox.style.verticalAlign = 'middle';
                
                const criticalLabel = document.createElement('label');
                criticalLabel.htmlFor = `cs-critical-checkbox-${index}`;
                criticalLabel.style.marginLeft = '4px';
                criticalLabel.style.cursor = 'pointer';
                criticalLabel.style.color = 'white';
                criticalLabel.style.fontSize = '12px';
                criticalLabel.textContent = 'Critical';
                
                const criticalContainer = document.createElement('div');
                criticalContainer.appendChild(criticalCheckbox);
                criticalContainer.appendChild(criticalLabel);
                
                checkboxContainer.appendChild(criticalContainer);
            }
            
            attack.appendChild(checkboxContainer);
            
            attack.addEventListener('mouseenter', () => {
                checkboxContainer.style.visibility = 'visible';
            });
            
            attack.addEventListener('mouseleave', () => {
                const anyChecked = checkboxContainer.querySelectorAll('input:checked').length > 0;
                if (!anyChecked) {
                    checkboxContainer.style.visibility = 'hidden';
                }
            });
            
            checkboxContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                checkbox.addEventListener('change', () => {
                    const anyChecked = checkboxContainer.querySelectorAll('input:checked').length > 0;
                    if (anyChecked) {
                        checkboxContainer.style.visibility = 'visible';
                    } else {
                        if (!attack.matches(':hover')) {
                            checkboxContainer.style.visibility = 'hidden';
                        }
                    }
                });
            });
        });
        
        const topButton = document.createElement('div');
        const bottomButton = document.createElement('div');
        
        topButton.innerHTML = "🎯 Clustered Shots 🎯";
        bottomButton.innerHTML = "🎯 Clustered Shots 🎯";

        styleClusteredShotButton(topButton);
        styleClusteredShotButton(bottomButton);
        
        [topButton, bottomButton].forEach(button => {
            button.dataset.action = "applyClusteredDamage";
            button.dataset.type = "normal";
            button.dataset.ratio = "1";
            button.dataset.tags = "";
            button.dataset.clusteredShots = "true";
        });
        
        topButton.setAttribute("data-tooltip", "Apply damage before DR (Clustered Shots)");
        bottomButton.setAttribute("data-tooltip", "Apply damage before DR (Clustered Shots)");
        
        const firstAttack = chatAttacks[0];
        const lastAttack = chatAttacks[chatAttacks.length - 1];
        
        firstAttack.parentNode.insertBefore(topButton, firstAttack);
        lastAttack.parentNode.insertBefore(bottomButton, lastAttack.nextSibling);
        
        [topButton, bottomButton].forEach(button => {
            button.addEventListener('click', (event) => {
                applyClusteredShots(card, event.currentTarget);
            });
        });
    });
}

async function applyClusteredShots(card, button) {
    const chatMessage = card.closest('.chat-message');
    const messageId = chatMessage ? chatMessage.getAttribute('data-message-id') : null;
    
    if (!messageId) {
        ui.notifications.error("Could not find message ID.");
        return;
    }
    
    const clickedButton = button;
    
    const chatAttacks = card.querySelectorAll('.chat-attack');
    if (!chatAttacks.length) {
        ui.notifications.warn("No attacks found in this message.");
        return;
    }
    
    const messageObject = game.messages.get(messageId);
    
    if (!messageObject) {
        ui.notifications.error("Could not find message data.");
        return;
    }
    
    const anyAttackSelected = Array.from(chatAttacks).some(attack => {
        const attackIndex = attack.getAttribute('data-index');
        const checkboxes = attack.querySelectorAll(`.cs-attack-checkbox[data-attack-index="${attackIndex}"]`);
        return Array.from(checkboxes).some(checkbox => checkbox.checked);
    });
    
    if (!anyAttackSelected) {
        ui.notifications.warn("No attacks selected for Clustered Shots. Please check at least one attack to include.");
        return;
    }
    
    if (typeof pf1?.utils?.chat?.onButton === 'function') {
        pf1.utils.chat.onButton(messageObject, { target: clickedButton });
    }
    
    const criticalHits = [];
    
    let totalDamage = 0;
    const damageTypes = new Set();
    
    for (const attack of chatAttacks) {
        const attackIndex = attack.getAttribute('data-index');
        
        const normalCheckbox = attack.querySelector(`.cs-normal-checkbox[data-attack-index="${attackIndex}"]`);
        const includeNormalDamage = normalCheckbox && normalCheckbox.checked;
        
        const criticalCheckbox = attack.querySelector(`.cs-critical-checkbox[data-attack-index="${attackIndex}"]`);
        const includeCriticalDamage = criticalCheckbox && criticalCheckbox.checked;
        
        if (!includeNormalDamage && !includeCriticalDamage) {
            continue;
        }
        
        let normalDamage = 0;
        if (includeNormalDamage) {
            const damageRow = attack.querySelector('tr.damage th:not([data-damage-type="critical"])');
            if (damageRow) {
                const damageValue = damageRow.querySelector('a.fake-inline-roll');
                if (damageValue) {
                    normalDamage = parseInt(damageValue.textContent.trim(), 10);
                    if (!isNaN(normalDamage)) {
                        totalDamage += normalDamage;
                    } else {
                        normalDamage = 0;
                    }
                }
            }
        }
        
        let criticalDamage = 0;
        if (includeCriticalDamage) {
            const criticalRow = attack.querySelector('tr.damage th[data-damage-type="critical"]');
            if (criticalRow) {
                const critDamageValue = criticalRow.querySelector('a.fake-inline-roll');
                if (critDamageValue) {
                    criticalDamage = parseInt(critDamageValue.textContent.trim(), 10);
                    if (!isNaN(criticalDamage)) {
                        totalDamage += criticalDamage;
                        
                        if (includeNormalDamage) {
                            criticalHits.push({
                                index: attackIndex,
                                normalDamage: normalDamage,
                                criticalDamage: criticalDamage,
                                attackName: `Attack #${parseInt(attackIndex) + 1}`
                            });
                        }
                    }
                }
            }
        }
        
        if (includeNormalDamage || includeCriticalDamage) {
            const damageTypeElements = attack.querySelectorAll('.damage-type');
            damageTypeElements.forEach(element => {
                const damageType = element.getAttribute('data-tooltip')?.trim() || element.textContent.trim();
                if (damageType) {
                    damageTypes.add(damageType.toLowerCase());
                }
            });
        }

        let ammoItem = null;
        const ammoContainer = attack.querySelector('.ammo.group-container');
        if (ammoContainer) {
            const ammoId = ammoContainer.getAttribute('data-ammo-id');
            const cardElem = attack.closest('.pf1.chat-card.item-card');
            if (ammoId && cardElem) {
                const tokenUuid = cardElem.getAttribute('data-token-uuid');
                const actorId = cardElem.getAttribute('data-actor-id');
                if (tokenUuid) {
                    try {
                        const token = await fromUuid(tokenUuid);
                        if (token && token.actor) {
                            ammoItem = token.actor.items.get(ammoId);
                        }
                    } catch (e) {
                        console.warn('Could not fetch token or ammo item from tokenUuid', tokenUuid, e);
                        ammoItem = null;
                    }
                } else if (actorId) {
                    try {
                        const actor = game.actors.get(actorId);
                        if (actor) {
                            ammoItem = actor.items.get(ammoId);
                        }
                    } catch (e) {
                        console.warn('Could not fetch actor or ammo item from actorId', actorId, e);
                        ammoItem = null;
                    }
                }
            }
        }

        if (includeNormalDamage || includeCriticalDamage) {
            criticalHits.push({
                index: attackIndex,
                normalDamage: normalDamage,
                criticalDamage: criticalDamage,
                attackName: `Attack #${parseInt(attackIndex) + 1}`,
                ammoItem: ammoItem
            });
        }
    }

    if (clickedButton && clickedButton.dataset) {
        clickedButton.dataset.value = totalDamage.toString();
    }

    const originalApplyDamage = pf1.documents.actor.ActorPF.applyDamage;
    
    if (canvas.tokens.controlled.length > 0) {
        canvas.tokens.controlled.forEach(token => {
            originalApplyDamage.call(token.actor, totalDamage, {
                asNonlethal: false,
                healing: false,
                flags: {
                    [AutomateDamageModule.MODULE.ID]: {
                        clusteredShots: {
                            totalDamage: totalDamage,
                            damageTypes: Array.from(damageTypes),
                            messageId: messageId,
                            message: messageObject,
                            buttonElement: clickedButton,
                            buttonType: "Clustered Shots", 
                            criticalHits: criticalHits
                        }
                    }
                }
            });
        });
        
        ui.notifications.info(`Applied ${totalDamage} points of Clustered Shots damage to ${canvas.tokens.controlled.length} targets.`);
    } else {
        ui.notifications.warn("Please select at least one token to apply damage to.");
    }
}

function styleClusteredShotButton(button) {
    button.style.display = "flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.visibility = "visible";
    button.style.cursor = "pointer";
    button.style.fontSize = "1em";
    button.style.margin = "8px 0";
    button.style.padding = "5px 10px";
    button.style.width = "100%";
    button.style.backgroundColor = "#4b4a44";
    button.style.color = "white";
    button.style.borderRadius = "3px";
    button.style.textAlign = "center";
    button.style.fontWeight = "bold";
    button.style.border = "1px solid #777";
    button.style.boxShadow = "0 1px 3px rgba(0,0,0,0.2)";
    
    button.addEventListener('mouseenter', () => {
        button.style.backgroundColor = "#5e5d57";
        button.style.boxShadow = "0 2px 5px rgba(0,0,0,0.3)";
    });
    
    button.style.transition = "all 150ms";
    
    button.addEventListener('mouseleave', () => {
        button.style.backgroundColor = "#4b4a44";
        button.style.boxShadow = "0 1px 3px rgba(0,0,0,0.2)";
    });
}

function applyHealing(damageInfo, multiplier) {
    let healDamage = 0;

    damageInfo.forEach(({ damageType, totalDamage }) => {
        let abilityHealingApplied = false;
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
                                abilityHealingApplied = true;
                            }

                            let updates = {};
                            for (const key in tokenAbilities) {
                                updates[`system.abilities.${key}.damage`] = tokenAbilities[key].damage;
                                updates[`system.abilities.${key}.drain`] = tokenAbilities[key].drain;
                                updates[`system.abilities.${key}.userPenalty`] = tokenAbilities[key].userPenalty;
                            }
                            token.actor.update(updates);
                        });
                    }
                }
            }
        });
        if (!abilityHealingApplied) {
            healDamage += totalDamage;
        }
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