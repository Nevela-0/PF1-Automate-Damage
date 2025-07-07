/**
 * Chat Commands for PF1 Automate Damage
 * Adds the ability to create damage rolls with specific damage types using the /ad command
 */

import { AutomateDamageModule } from './config.js';

export class AutomateDamageCommands {
  /**
   * Initialize the chat commands
   */
  static initialize() {
    Hooks.on('chatMessage', this.handleChatCommand.bind(this));
    
    window.AutomateDamage = {
      roll: this.macroRoll.bind(this)
    };
  }

  /**
   * Macro-friendly function to create a damage roll
   * This can be called from a macro using AutomateDamage.roll()
   * @param {Object|string} options - Options for the damage roll or a string in format "type: X, for: Y"
   * @returns {Promise<ChatMessage>} The created chat message
   * 
   * @example
   * // Simple usage with string format
   * AutomateDamage.roll("type: fire, for: 1d8+5")
   * 
   * @example
   * // Object format with multiple damage types
   * AutomateDamage.roll({
   *   formula: "1d8+5",
   *   damageTypes: ["fire", "acid"]
   * })
   * 
   * @example
   * // Mixed damage types (each component has its own type)
   * AutomateDamage.roll("1d8 fire + 2d6 acid + 5 bludgeoning")
   * 
   * @example
   * // Component-based approach (recommended)
   * AutomateDamage.roll({
   *   components: [
   *     { formula: "1d8", damageTypes: ["fire"] },
   *     { formula: "2d6+5", damageTypes: ["slashing"] },
   *     { formula: "10", damageTypes: ["acid"] }
   *   ]
   * })
   */
  static async macroRoll(options) {
    let formula = "";
    let damageTypes = [];
    let mixedDamage = false;
    
    if (typeof options === "string") {
      if (this.isMixedDamageFormat(options)) {
        return this.createMixedDamageRoll(options);
      }
      
      const typeMatch = options.match(/type\s*:\s*([^,]+)/i);
      const forMatch = options.match(/for\s*:\s*([^,]+)/i);
      
      if (typeMatch && forMatch) {
        damageTypes = typeMatch[1].split(/\s*\+\s*/).map(t => t.trim());
        formula = forMatch[1].trim();
      } else {
        ui.notifications.error("Invalid format for AutomateDamage.roll(). Use 'type: X, for: Y' or '1d8 fire + 2d6 acid'");
        return null;
      }
    } else if (typeof options === "object") {
      if (options.components) {
        return this.createComponentDamageRoll(options.components);
      } else if (options.mixedDamage) {
        return this.createMixedDamageRoll(options.mixedDamage);
      }
      
      formula = options.formula || "";
      damageTypes = Array.isArray(options.damageTypes) ? options.damageTypes : [options.damageType || ""];
    } else {
      ui.notifications.error("Invalid argument for AutomateDamage.roll(). Use a string or object.");
      return null;
    }
    
    if (!formula) {
      ui.notifications.error("No formula provided for damage roll");
      return null;
    }
    
    if (!damageTypes.length || !damageTypes[0]) {
      ui.notifications.warn("No damage type provided, using 'untyped'");
      damageTypes = ["untyped"];
    }
    
    return this.createDamageRoll(formula, damageTypes);
  }
  
  /**
   * Check if a string appears to be in mixed damage format
   * @param {string} str - The string to check
   * @returns {boolean} True if it appears to be in mixed damage format
   */
  static isMixedDamageFormat(str) {
    const mixedPattern = /(\d+d\d+|\d+)\s+([a-zA-Z]+)/;
    return mixedPattern.test(str);
  }
  
  /**
   * Parse mixed damage string into components
   * @param {string} mixedStr - String with mixed damage format
   * @returns {Array} Array of {formula, damageType} objects
   */
  static parseMixedDamageString(mixedStr) {
    const components = [];
    
    let inParentheses = 0;
    let currentComponent = "";
    
    for (let i = 0; i < mixedStr.length; i++) {
      const char = mixedStr[i];
      
      if (char === '(') inParentheses++;
      else if (char === ')') inParentheses--;
      
      if (char === '+' && inParentheses === 0) {
        components.push(currentComponent.trim());
        currentComponent = "";
      } else {
        currentComponent += char;
      }
    }
    
    if (currentComponent.trim()) {
      components.push(currentComponent.trim());
    }
    
    return components.map(component => {
      component = component.trim();
      if (component.startsWith('(') && component.endsWith(')')) {
        component = component.substring(1, component.length - 1).trim();
      }
      
      const formulaAndTypes = component.match(/^([\d\s\+\-\*\/\(\)d]+)\s+([a-zA-Z\s]+)$/);
      
      if (formulaAndTypes) {
        const formula = formulaAndTypes[1].trim();
        const damageTypesStr = formulaAndTypes[2].trim();
        
        const damageTypes = damageTypesStr.split(/\s+/).filter(type => type.length > 0);
        
        return {
          formula: formula,
          damageType: damageTypes[0] || "untyped"
        };
      } else {
        return {
          formula: component.trim(),
          damageType: "untyped"
        };
      }
    });
  }
  
  /**
   * Create a damage roll with components from the UI
   * @param {Array} components - Array of {formula, damageTypes} objects
   * @returns {Promise<ChatMessage>} The created chat message
   */
  static async createComponentDamageRoll(components) {
    try {
      if (components.length === 0) {
        ui.notifications.error("No damage components provided");
        return null;
      }
      
      const damageTypeMap = this.getDamageTypes();
      
      const allDamageTypes = new Set();
      components.forEach(c => c.damageTypes.forEach(t => allDamageTypes.add(t)));
      const damageTypesArray = Array.from(allDamageTypes);
      
      const localizedDamageNames = damageTypesArray.map(type => 
        damageTypeMap[type] || type
      );
      
      const componentRolls = [];
      let totalDamage = 0;
      
      for (const component of components) {
        const localizedComponentTypes = component.damageTypes.map(type => 
          damageTypeMap[type] || type
        );
        
        const roll = new pf1.dice.DamageRoll(component.formula, {}, {
          damageType: component.damageTypes,
          type: "normal"
        });
        
        await roll.evaluate();
        
        for (const term of roll.terms) {
          if (term.class !== "OperatorTerm") {
            if (!term.options) term.options = {};
            term.options.flavor = localizedComponentTypes.join(", ");
            term.options.damageType = component.damageTypes;
          }
        }
        
        componentRolls.push(roll);
        totalDamage += roll.total;
      }
      
      const fullDamage = totalDamage;
      const halfDamage = Math.floor(totalDamage / 2);
      
      const buttonsHtml = `
        <div class="card-buttons flexrow">
          <button type="button" data-action="applyDamage" data-value="${fullDamage}" data-damage-types="${damageTypesArray.join(',')}">Apply</button>
          <button type="button" data-action="applyDamage" data-value="${halfDamage}" data-damage-types="${damageTypesArray.join(',')}">Apply Half</button>
        </div>
      `;
      
      let content = `<div class="dice-roll">`;
      content += `<h2>PF1 Automate Damage</h2>`;
      content += `<div class="dice-result">`;
      
      content += `<div class="dice-tooltip">`;
      for (let i = 0; i < componentRolls.length; i++) {
        const roll = componentRolls[i];
        const rollContent = await roll.render();
        
        const $rollContent = $(rollContent);
        const $tooltip = $rollContent.find('.dice-tooltip');
        
        const $diceElements = $tooltip.find('.dice');
        if ($diceElements.length > 1) {
          const $firstDice = $diceElements.first();
          $diceElements.not(':first').each(function() {
            $(this).find('.dice-result').appendTo($firstDice);
            $(this).remove();
          });
        }
        
        const $partFormula = $tooltip.find('.part-formula');
        if ($partFormula.length > 0) {
          $partFormula.text(components[i].formula);
        }
        
        const $partTotals = $tooltip.find('.part-total');
        if ($partTotals.length > 0) {
          $partTotals.html(roll.total);
        }
        
        content += `\n  <section class=\"component-tooltip\">\n    <div class=\"component-label\"><strong>Damage Roll ${i + 1}</strong></div>\n    ${$tooltip.html()}\n  </section>\n`;
      }
      content += `</div>`;
      
      content += `<h4 class="dice-total">${totalDamage}</h4>`;
      content += `</div>`;
      content += `</div>`;
      
      content += buttonsHtml;
      
      const messageData = {
        flavor: `Damage: ${localizedDamageNames.join(", ")}`,
        content: content,
        speaker: ChatMessage.getSpeaker(),
        rolls: componentRolls,
        flags: {
          [AutomateDamageModule.MODULE.ID]: {
            damageRoll: true,
            damageTotal: fullDamage,
            damageTypes: damageTypesArray,
            componentRoll: true,
            subject: {
              health: "damage"
            }
          }
        }
      };
      
      const message = await ChatMessage.create(messageData);
      
      return message;
    } catch (error) {
      ui.notifications.error("Error creating damage roll");
      return null;
    }
  }

  /**
   * Create a damage roll with mixed damage types
   * @param {string} mixedDamageString - String with mixed damage format
   * @returns {Promise<ChatMessage>} The created chat message
   */
  static async createMixedDamageRoll(mixedDamageString) {
    try {
      const damageComponents = this.parseMixedDamageString(mixedDamageString);
      
      if (damageComponents.length === 0) {
        ui.notifications.error("Failed to parse mixed damage formula");
        return null;
      }
      
      const components = damageComponents.map(component => ({
        formula: component.formula,
        damageTypes: [component.damageType]
      }));
      
      return this.createComponentDamageRoll(components);
    } catch (error) {
      ui.notifications.error("Error creating mixed damage roll");
      return null;
    }
  }

  /**
   * Get all available damage types from the system
   * @returns {Object} Object with damage type IDs as keys and localized names as values
   */
  static getDamageTypes() {
    const damageTypes = pf1.registry.damageTypes;
    const alignments = pf1.config.damageResistances;
    
    const allTypes = {};
    
    if (damageTypes && damageTypes instanceof Map) {
      for (const [key, value] of damageTypes.entries()) {
        if (value.name) {
          allTypes[key] = value.name;
        }
      }
    }
    
    if (alignments) {
      for (const [key, value] of Object.entries(alignments)) {
        if (!allTypes[key]) {
          allTypes[key] = value;
        }
      }
    }
    
    return allTypes;
  }

  /**
   * Show the damage dialog box
   */
  static showDamageDialog() {
    const damageTypes = this.getDamageTypes();
    const sortedTypes = Object.entries(damageTypes)
      .sort((a, b) => a[1].localeCompare(b[1]))
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});
    
    let content = `
      <form>
        <div class="form-group">
          <label>Damage Components:</label>
          <div id="damage-components-list">
            <div class="empty-message">No damage components yet. Click "Add Roll" to create a damage roll.</div>
          </div>
        </div>
        
        <div class="form-group">
          <button type="button" id="add-damage-component" class="damage-component-add-btn">
            <i class="fas fa-plus"></i> Add Roll
          </button>
        </div>
        
        <div class="components-info" style="font-size: 0.9em; color: #777; margin-top: 5px;">
          Add one or more damage rolls with their own formulas and damage types.
        </div>
      </form>
    `;
    
    const damageComponents = [];
    
    const mainDialog = new Dialog({
      title: "Automate Damage",
      content: content,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice-d20"></i>',
          label: "Roll Damage",
          callback: (html) => {
            if (damageComponents.length === 0) {
              ui.notifications.error("Please add at least one damage component");
              return;
            }
            
            this.createComponentDamageRoll(damageComponents);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "roll",
      render: (html) => {
        const style = document.createElement('style');
        style.textContent = `
          .damage-components-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 10px;
          }
          .damage-component {
            border: 1px solid #ccc;
            border-radius: 4px;
            padding: 10px;
            margin-bottom: 10px;
            background: rgba(0, 0, 0, 0.05);
            position: relative;
          }
          .damage-component-formula {
            font-family: monospace;
            font-weight: bold;
            margin-bottom: 5px;
          }
          .damage-component-type {
            font-style: italic;
            color: #555;
          }
          .damage-component-remove {
            position: absolute;
            top: 5px;
            right: 5px;
            cursor: pointer;
            color: #a00;
            font-size: 12px;
          }
          .damage-component-add-btn {
            width: 100%;
            margin-top: 5px;
            background: #f0f0f0;
            border: 1px solid #ccc;
            padding: 5px;
            border-radius: 4px;
            cursor: pointer;
          }
          .damage-component-add-btn:hover {
            background: #e8e8e8;
          }
          .empty-message {
            font-style: italic;
            color: #777;
            padding: 10px;
            text-align: center;
          }
          .checkbox-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 5px;
            max-height: 200px;
            overflow-y: auto;
            margin-top: 10px;
            padding: 5px;
            border: 1px solid #ddd;
            border-radius: 3px;
          }
          .checkbox-item {
            display: flex;
            align-items: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .checkbox-item label {
            margin-left: 5px;
            overflow: hidden;
            text-overflow: ellipsis;
            font-weight: normal;
          }
        `;
        html.find('form').prepend(style);
        
        html.find('#add-damage-component').click(() => {
          this.showDamageComponentDialog(sortedTypes, (component) => {
            damageComponents.push(component);
            
            updateComponentsList();
          });
        });
        
        const updateComponentsList = () => {
          const list = html.find('#damage-components-list');
          
          list.empty();
          
          if (damageComponents.length === 0) {
            list.append(`<div class="empty-message">No damage components yet. Click "Add Roll" to create a damage roll.</div>`);
            const dialog = html.closest('.app');
            dialog.css({
              'height': '210px',
              'min-height': '',
              'max-height': '',
              'overflow-y': '',
              'width': '500px',
              'min-width': '400px',
              'max-width': '500px'
            });
            return;
          } else {
            const dialog = html.closest('.app');
            dialog.css({
              'height': '',
              'min-height': '210px',
              'max-height': '420px',
              'overflow-y': 'auto',
              'width': '500px',
              'min-width': '400px',
              'max-width': '500px'
            });
          }
          
          damageComponents.forEach((component, index) => {
            const typeNames = component.damageTypes.map(type => sortedTypes[type] || type);
            const typeLabel = typeNames.length === 1 ? "Damage Type:" : "Damage Types:";
            const componentHtml = `
              <div class="damage-component" data-index="${index}">
                <div class="damage-component-formula">${component.formula}</div>
                <div class="damage-component-type">${typeLabel} ${typeNames.join(", ")}</div>
                <a class="damage-component-remove"><i class="fas fa-times"></i></a>
              </div>
            `;
            list.append(componentHtml);
          });
          
          list.find('.damage-component-remove').click(function() {
            const index = $(this).parent().data('index');
            damageComponents.splice(index, 1);
            updateComponentsList();
          });
        };
        
        updateComponentsList();
      },
      width: 400
    }).render(true);
  }
  
  /**
   * Show a dialog to create a new damage component
   * @param {Object} sortedTypes - The sorted damage types
   * @param {Function} callback - Function to call with the new component
   */
  static showDamageComponentDialog(sortedTypes, callback) {
    let content = `
      <form>
        <div class="form-group">
          <label for="component-formula">Damage Formula:</label>
          <input type="text" id="component-formula" name="formula" placeholder="e.g. 1d8+5" style="width: 100%;">
        </div>
        
        <div class="form-group">
          <label>Damage Type(s):</label>
        </div>
        
        <div class="checkbox-grid">
    `;
    
    for (const [key, name] of Object.entries(sortedTypes)) {
      content += `
        <div class="checkbox-item">
          <input type="checkbox" id="component-type-${key}" name="damageTypes" value="${key}">
          <div class="checkbox-label-container">
            <label for="component-type-${key}" title="${name}">${name}</label>
          </div>
        </div>
      `;
    }
    
    content += `
        </div>
      </form>
    `;
    
    const dialog = new Dialog({
      title: "Add Damage Roll",
      content: content,
      buttons: {
        add: {
          icon: '<i class="fas fa-plus"></i>',
          label: "Add",
          callback: (html) => {
            const formula = html.find('#component-formula').val().trim();
            if (!formula) {
              ui.notifications.error("Please enter a damage formula");
              return;
            }
            
            const selectedTypes = [];
            html.find('input[name="damageTypes"]:checked').each((i, cb) => {
              selectedTypes.push(cb.value);
            });
            
            if (selectedTypes.length === 0) {
              ui.notifications.error("Please select at least one damage type");
              return;
            }
            
            callback({
              formula: formula,
              damageTypes: selectedTypes
            });
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "add",
      render: (html) => {
        const style = document.createElement('style');
        style.textContent = `
          .checkbox-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            margin-bottom: 10px;
          }
          .checkbox-label-container {
            margin-top: 3px;
            text-align: center;
          }
          .checkbox-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            max-height: 250px;
            overflow-y: auto;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 3px;
          }
        `;
        html.find('form').append(style);
        
        const dialog = html.closest('.app');
        dialog.css('min-width', '400px');
        dialog.css('max-width', '500px');
      },
      width: 400
    }).render(true);
  }

  /**
   * Process the damage roll command
   * @param {string} args - The command arguments
   * @param {object} chatData - Chat data
   * @returns {boolean} - Return false to prevent default command processing
   */
  static processDamageCommand(args, chatData) {
    const argsParts = args.trim().split(/\s+/);
    if (argsParts.length > 0) {
      const firstArg = argsParts[0].toLowerCase();
      
      if (firstArg === 'macro') {
        this.showMacroCreationDialog();
        return false;
      }
    }
    
    if (!args || args.trim().length === 0) {
      this.showDamageDialog();
      return false;
    }
    
    if (this.isMixedDamageFormat(args)) {
      this.createMixedDamageRoll(args);
      return false;
    }
    
    const parts = args.trim().split(/\s+/);
    
    if (parts.length < 2) {
      this.showFormatError();
      return false;
    }
    
    const formula = parts[0];
    
    const damageTypes = parts.slice(1);

    this.createDamageRoll(formula, damageTypes);
    return false;
  }

  /**
   * Create and display a damage roll
   * @param {string} formula - The damage roll formula
   * @param {string[]} damageTypes - Array of damage types
   */
  static async createDamageRoll(formula, damageTypes) {
    try {
      const roll = new pf1.dice.DamageRoll(formula, {}, {
        damageType: damageTypes,
        type: "normal"
      });
      
      await roll.evaluate();
      
      const damageTypeString = damageTypes.join(", ");
      for (const term of roll.terms) {
        if (term.class !== "OperatorTerm") {
          if (!term.options) term.options = {};
          term.options.flavor = damageTypeString;
        }
      }
      
      const fullDamage = roll.total;
      const halfDamage = Math.floor(roll.total / 2);
      
      const buttonsHtml = `
        <div class="card-buttons flexrow">
          <button type="button" data-action="applyDamage" data-value="${fullDamage}" data-damage-types="${damageTypes.join(',')}">Apply</button>
          <button type="button" data-action="applyDamage" data-value="${halfDamage}" data-damage-types="${damageTypes.join(',')}">Apply Half</button>
        </div>
      `;
      
      const rollContent = await roll.render();
      
      const messageData = {
        flavor: `Damage: ${damageTypes.join(", ")}`,
        content: rollContent + buttonsHtml,
        speaker: ChatMessage.getSpeaker(),
        rolls: [roll],
        flags: {
          [AutomateDamageModule.MODULE.ID]: {
            damageRoll: true,
            damageTotal: roll.total,
            damageTypes: damageTypes,
            subject: {
              health: "damage"
            }
          }
        }
      };
      
      const message = await ChatMessage.create(messageData);
      
      return message;
    } catch (error) {
      console.error(`${AutomateDamageModule.MODULE.ID} | Error creating damage roll`, error);
      this.showFormatError();
    }
  }

  /**
   * Show an error message for invalid command format
   */
  static showFormatError() {
    ui.notifications.error("Invalid format for /ad command");
    ui.notifications.info("Examples: /ad 1d8+5 fire  or  /ad 1d8 fire + 2d6 acid");
  }

  /**
   * Show the macro creation dialog with damage components
   */
  static showMacroCreationDialog() {
    const damageTypes = this.getDamageTypes();
    
    const sortedTypes = Object.entries(damageTypes)
      .sort((a, b) => a[1].localeCompare(b[1]))
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});
    
    let content = `
      <form>
        <div class="form-group">
          <label for="macro-name">Macro Name:</label>
          <input type="text" id="macro-name" name="macro-name" placeholder="Automate Damage Macro" style="width: 100%;">
        </div>
        
        <div class="form-group">
          <label>Damage Components:</label>
          <div id="damage-components-list">
            <div class="empty-message">No damage components yet. Click "Add Roll" to create a damage roll.</div>
          </div>
        </div>
        
        <div class="form-group">
          <button type="button" id="add-damage-component" class="damage-component-add-btn">
            <i class="fas fa-plus"></i> Add Roll
          </button>
        </div>
        
        <div class="components-info" style="font-size: 0.9em; color: #777; margin-top: 5px;">
          Add one or more damage rolls with their own formulas and damage types.
        </div>
      </form>
    `;
    
    const damageComponents = [];
    
    const mainDialog = new Dialog({
      title: "Create Damage Macro",
      content: content,
      buttons: {
        create: {
          icon: '<i class="fas fa-save"></i>',
          label: "Create Macro",
          callback: (html) => {
            if (damageComponents.length === 0) {
              ui.notifications.error("Please add at least one damage component");
              return;
            }
            
            let macroName = html.find('#macro-name').val().trim();
            if (!macroName) {
              macroName = this.getAvailableMacroName();
            }
            
            this.createDamageMacro(macroName, damageComponents);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "create",
      render: (html) => {
        const style = document.createElement('style');
        style.textContent = `
          .damage-components-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 10px;
          }
          .damage-component {
            border: 1px solid #ccc;
            border-radius: 4px;
            padding: 10px;
            margin-bottom: 10px;
            background: rgba(0, 0, 0, 0.05);
            position: relative;
          }
          .damage-component-formula {
            font-family: monospace;
            font-weight: bold;
            margin-bottom: 5px;
          }
          .damage-component-type {
            font-style: italic;
            color: #555;
          }
          .damage-component-remove {
            position: absolute;
            top: 5px;
            right: 5px;
            cursor: pointer;
            color: #a00;
            font-size: 12px;
          }
          .damage-component-add-btn {
            width: 100%;
            margin-top: 5px;
            background: #f0f0f0;
            border: 1px solid #ccc;
            padding: 5px;
            border-radius: 4px;
            cursor: pointer;
          }
          .damage-component-add-btn:hover {
            background: #e8e8e8;
          }
          .empty-message {
            font-style: italic;
            color: #777;
            padding: 10px;
            text-align: center;
          }
          .checkbox-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 5px;
            max-height: 200px;
            overflow-y: auto;
            margin-top: 10px;
            padding: 5px;
            border: 1px solid #ddd;
            border-radius: 3px;
          }
          .checkbox-item {
            display: flex;
            align-items: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .checkbox-item label {
            margin-left: 5px;
            overflow: hidden;
            text-overflow: ellipsis;
            font-weight: normal;
          }
        `;
        html.find('form').prepend(style);
        
        html.find('#add-damage-component').click(() => {
          this.showDamageComponentDialog(sortedTypes, (component) => {
            damageComponents.push(component);
            
            updateComponentsList();
          });
        });
        
        const updateComponentsList = () => {
          const list = html.find('#damage-components-list');
          
          list.empty();
          
          if (damageComponents.length === 0) {
            list.append(`<div class="empty-message">No damage components yet. Click "Add Roll" to create a damage roll.</div>`);
            const dialog = html.closest('.app');
            dialog.css({
              'height': '235px',
              'min-height': '',
              'max-height': '',
              'overflow-y': '',
              'width': '500px',
              'min-width': '400px',
              'max-width': '500px'
            });
            return;
          } else {
            const dialog = html.closest('.app');
            dialog.css({
              'height': '',
              'min-height': '235px',
              'max-height': '470px',
              'overflow-y': 'auto',
              'width': '500px',
              'min-width': '400px',
              'max-width': '500px'
            });
          }
          
          damageComponents.forEach((component, index) => {
            const typeNames = component.damageTypes.map(type => sortedTypes[type] || type);
            const typeLabel = typeNames.length === 1 ? "Damage Type:" : "Damage Types:";
            const componentHtml = `
              <div class="damage-component" data-index="${index}">
                <div class="damage-component-formula">${component.formula}</div>
                <div class="damage-component-type">${typeLabel} ${typeNames.join(", ")}</div>
                <a class="damage-component-remove"><i class="fas fa-times"></i></a>
              </div>
            `;
            list.append(componentHtml);
          });
          
          list.find('.damage-component-remove').click(function() {
            const index = $(this).parent().data('index');
            damageComponents.splice(index, 1);
            updateComponentsList();
          });
        };
        
        updateComponentsList();
      },
      width: 400
    }).render(true);
  }
  
  /**
   * Generate an available macro name
   * @returns {string} An available macro name
   */
  static getAvailableMacroName() {
    const baseName = "Automate Damage Macro";
    let counter = 1;
    let name = baseName;
    
    while (game.macros.find(m => m.name === name)) {
      name = `${baseName} ${counter}`;
      counter++;
    }
    
    return name;
  }
  
  /**
   * Create a macro for damage components
   * @param {string} name - Name for the macro
   * @param {Array} components - Damage components array
   */
  static createDamageMacro(name, components) {
    try {
      const macroCommand = `
// Automatically generated by PF1 Automate Damage
AutomateDamage.roll({
  components: ${JSON.stringify(components, null, 2)}
});`;
      
      Macro.create({
        name: name,
        type: "script",
        img: "icons/svg/fire.svg",
        command: macroCommand,
        flags: {
          [AutomateDamageModule.MODULE.ID]: {
            isAutomatedDamageMacro: true
          }
        }
      }).then(macro => {
        ui.notifications.info(`Macro "${name}" created successfully.`);
      });
    } catch (error) {
      ui.notifications.error("Error creating damage macro");
    }
  }

  /**
   * Handle chat commands
   * @param {ChatLog} log - The chat log
   * @param {string} message - The message text
   * @param {object} chatData - The chat data
   * @returns {boolean|void} - Return false to prevent default command processing
   */
  static handleChatCommand(log, message, chatData) {
    if (!message.startsWith('/')) return;
    
    const command = message.split(' ')[0].substring(1);
    const args = message.substring(command.length + 2);
    
    if (command === 'ad') {
      try {
        return this.processDamageCommand(args, chatData);
      } catch (error) {
        console.error(`${AutomateDamageModule.MODULE.ID} | Error processing command`, error);
      }
      return false;
    }
  }
} 