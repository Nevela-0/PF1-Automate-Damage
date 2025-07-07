import { AutomateDamageModule } from './config.js';

let socket;

/**
 * Initialize socket functionality
 */
export function initializeSockets() {
    if (!game.modules.get("socketlib")?.active) {
        if (game.settings.get(AutomateDamageModule.MODULE.ID, "massiveDamage")) {
            ui.notifications.warn("SocketLib is required for the Massive Damage rule to work properly. Please install and activate the socketlib module.");
        }
        return;
    }
    socket = socketlib.registerModule(AutomateDamageModule.MODULE.ID);
    socket.register("rollMassiveDamageSave", rollMassiveDamageSave);
}

/**
 * Function to handle massive damage saving throw (executed on the target user's client)
 * @param {string} actorId - The ID of the actor making the save
 * @param {number} damageAmount - The amount of damage that triggered massive damage
 * @param {number} threshold - The massive damage threshold
 * @returns {Object} Result data with name, total, success status, etc.
 */
async function rollMassiveDamageSave(actorId, damageAmount, threshold) {
    const actor = game.actors.get(actorId);
    if (!actor) return { name: "Unknown", result: "No actor found" };

    const roll = await actor.rollSavingThrow("fort", { dc: 15 });
    
    let total = 0;
    if (roll.rolls && roll.rolls.length > 0) {
        total = roll.rolls[0].total || 0;
    }
    
    const success = total >= 15;
    
    if (!success) {
        await actor.setCondition('dead', {overlay: true});
    }
    
    let content = `<p><strong>${actor.name}</strong> took massive damage (${damageAmount} damage, threshold: ${threshold})!</p>`;
    content += `<p>Fortitude save result: <strong>${total}</strong> - ${success ? "Success! " + actor.name + " survives the massive damage." : "Failure! " + actor.name + " dies from massive damage."}</p>`;
    
    ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({actor}),
        content: content,
        type: CONST.CHAT_MESSAGE_TYPES.OTHER
    });
    
    return { 
        name: actor.name, 
        total: total, 
        success: success,
        damage: damageAmount,
        threshold: threshold
    };
}

/**
 * Check if an actor should make a massive damage saving throw and trigger it
 * @param {number} damage - The amount of damage to check
 * @param {number} maxHP - The actor's maximum HP
 * @param {TokenDocument} token - The token representing the actor
 */
export function checkMassiveDamage(damage, maxHP, token) {
    const massiveDamageEnabled = game.settings.get(AutomateDamageModule.MODULE.ID, "massiveDamage");
    if (!massiveDamageEnabled) return;
    
    const damageThreshold = Math.max(Math.floor(maxHP / 2), 50);
    
    if (damage >= damageThreshold) {
        if (!game.modules.get("socketlib")?.active) {
            ui.notifications.warn(`${token.name} has taken massive damage (${damage} damage)! SocketLib is not available, cannot roll save remotely.`);
            if (game.user.isGM) {
                const actor = token.actor;
                ChatMessage.create({
                    content: `<p><strong>${actor.name}</strong> took massive damage (${damage}). Roll a DC 15 Fortitude save or die.</p>`,
                    speaker: ChatMessage.getSpeaker({token})
                });
            }
            return;
        }
        
        if (typeof socketlib === 'undefined' || !socket) {
            ui.notifications.warn(`${token.name} has taken massive damage (${damage} damage)! Socket not initialized yet.`);
            if (typeof socketlib !== 'undefined' && !socket) {
                initializeSockets();
            }
            return;
        }
        
        const actorId = token.actor.id;
        const nonGmOwners = Object.entries(token.actor.ownership)
            .filter(([userId, level]) => level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && 
                    userId !== "default" && 
                    game.users.get(userId)?.active && 
                    !game.users.get(userId)?.isGM);
        
        if (nonGmOwners.length > 0) {
            const targetUserId = nonGmOwners[0][0];
            socket.executeAsUser("rollMassiveDamageSave", targetUserId, actorId, damage, damageThreshold)
                .then(result => {
                })
                .catch(error => {
                    const activeGm = game.users.find(u => u.active && u.isGM);
                    if (activeGm) {
                        socket.executeAsUser("rollMassiveDamageSave", activeGm.id, actorId, damage, damageThreshold);
                    }
                });
        } else {
            const activeGm = game.users.find(u => u.active && u.isGM);
            if (activeGm) {
                socket.executeAsUser("rollMassiveDamageSave", activeGm.id, actorId, damage, damageThreshold);
            } else {
                ui.notifications.warn(`${token.name} has taken massive damage (${damage} damage), but no user was found to roll the save.`);
            }
        }
    }
} 