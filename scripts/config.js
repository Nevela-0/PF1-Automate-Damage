export const MODULE = {ID: "pf1-automate-damage"};

export const automateDamageConfig = {
    weaponDamageTypes: [],
    additionalPhysicalDamageTypes: []
};

function registerSettings() {
    Handlebars.registerHelper('colorStyle', function(color) {
        return new Handlebars.SafeString(`style="color: ${color};"`);
    });

    game.settings.register(MODULE.ID, "damageTypePriority", {
        name: game.i18n.localize("SETTINGS.damageTypePriority.name"),
        hint: game.i18n.localize("SETTINGS.damageTypePriority.hint"),
        default: JSON.stringify([[], ["magic"], [], ["alchemicalsilver", "coldiron", "mithral", "nexavarianSteel", "sunsilver"], ["adamantine"], ["lawful", "chaotic", "good", "evil"], ["epic"]]),
        scope: "world",
        type: String,
        config: false
    });

    game.settings.registerMenu(MODULE.ID, "damageTypePriorityMenu", {
        name: game.i18n.localize("SETTINGS.damageTypePriorityMenu.name"),
        label: game.i18n.localize("SETTINGS.damageTypePriorityMenu.label"),
        hint: game.i18n.localize("SETTINGS.damageTypePriorityMenu.hint"),
        icon: "fas fa-cogs",
        type: DamagePriorityForm,
        restricted: true
    });

    game.settings.registerMenu(MODULE.ID, "customSetting", {
        name: game.i18n.localize("SETTINGS.customSetting.name"),
        label: game.i18n.localize("SETTINGS.customSetting.label"),
        hint: game.i18n.localize("SETTINGS.customSetting.hint"),
        icon: "fas fa-cogs",
        type: DamageTypeFormApplication,
        restricted: true
    });

    game.settings.register(MODULE.ID, 'customDamageTypes', {
        scope: 'world',
        config: false,
        type: Array,
        default: [],
        requiresReload: true
    });

    game.settings.register(MODULE.ID, "translations", {
        name: "Translation Settings",
        scope: "world",
        config: false,
        type: Object,
        default: {
            hardness: "",
            construct: "",
            undead: ""
        }
    });

    game.settings.registerMenu(MODULE.ID, "translationMenu", {
        name: "Configure Translations",
        label: "Translations",
        hint: "Set the translations for various terms for the module to recognize.",
        icon: "fas fa-language",
        type: TranslationForm,
        restricted: true
    });
    game.settings.register(MODULE.ID, "migrationVersion", {
        name: "Migration Version",
        scope: "world",
        config: false,
        type: String,
        default: ""
    });
}

function syncWeaponDamageTypes() {
    const damageTypePriority = JSON.parse(game.settings.get(MODULE.ID, "damageTypePriority"));
    const materialTypes = pf1.registry.materialTypes;
    const alignments = pf1.config.damageResistances;

    const weaponDamageTypes = damageTypePriority.map(priorityLevel => {
        return priorityLevel.map(type => {
            if (!type || type.trim() === '') {
                return null;
            }
            const material = materialTypes.find(m => m.name === type);
            const alignmentKey = Object.keys(alignments).find(key => alignments[key] === type);

            if (material) {
                return material.id;
            } else if (alignmentKey) {
                return alignmentKey;
            } else {
                return type.toLowerCase();
            }
        }).filter(type => type !== null);
    });
    automateDamageConfig.weaponDamageTypes = weaponDamageTypes;
    pf1.registry.damageTypes.forEach(damageType => {
        if (['slashing', 'bludgeoning', 'piercing'].includes(damageType.id)) {
            automateDamageConfig.additionalPhysicalDamageTypes.push(damageType.id);
        }
    });
}

function populateDefaultTypes() {
    return new Promise(async (resolve, reject) => {
        try {
            const materialTypes = pf1.registry.materialTypes;
            const alignments = Object.keys(pf1.config.damageResistances);
            const priorityLevels = {
                1: [],
                2: [],
                3: [],
                4: [],
                5: alignments.map(key => pf1.config.damageResistances[key]),
                6: []
            };

            materialTypes.forEach(material => {
                let targetArray;

                switch (material.id) {
                    case 'magic':
                        targetArray = priorityLevels[1];
                        break;
                    case 'coldiron':
                    case 'alchemicalsilver':
                        targetArray = priorityLevels[3];
                        break;
                    case 'adamantine':
                        targetArray = priorityLevels[4];
                        break;
                    case 'epic':
                        targetArray = priorityLevels[6];
                        break;
                }

                if (material.treatedAs) {
                    switch (material.treatedAs) {
                        case 'magic':
                            targetArray = priorityLevels[1];
                            break;
                        case 'coldiron':
                        case 'alchemicalsilver':
                            targetArray = priorityLevels[3];
                            break;
                        case 'adamantine':
                            targetArray = priorityLevels[4];
                            break;
                        case 'epic':
                            targetArray = priorityLevels[6];
                            break;
                    }
                }

                if (targetArray && !targetArray.includes(material.name)) {
                    targetArray.push(material.name);
                }
            });

            automateDamageConfig.weaponDamageTypes = [
                [],
                ...Object.values(priorityLevels)
            ];
            await game.settings.set(MODULE.ID, "damageTypePriority", JSON.stringify(automateDamageConfig.weaponDamageTypes));
            resolve();
        } catch (error) {
            console.error("Error populating default types:", error);
            reject(error);
        }
    });
}

async function handleReadyHook() {
    const migrationKey = `migrationVersion`;
    const currentVersion = game.modules.get(MODULE.ID).version;
    let previousMigrationVersion;

    try {
        previousMigrationVersion = game.settings.get(MODULE.ID, migrationKey);
    } catch (e) {
        previousMigrationVersion = "0.0.0";
    }
    if (compareVersions(currentVersion, previousMigrationVersion) > 0) {
        await performMigration();
        await game.settings.set(MODULE.ID, migrationKey, currentVersion);
    }
    
    const customDamageTypes = game.settings.get(MODULE.ID, "customDamageTypes");
    
    customDamageTypes.forEach(damageType => {
        const { value } = damageType;
        if (!["physical", "energy", "misc"].includes(value.category.toLowerCase())) {
            const localizationKey = `PF1.DamageTypeCategory.${value.category.toLowerCase()}`;
            if (!game.i18n.translations.PF1.DamageTypeCategory) {
                game.i18n.translations.PF1.DamageTypeCategory = {};
            }
            const capitalizedCategory = value.category
                .split(/[\s-]/)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')
                .replace(/\b([A-Za-z]+)-([A-Za-z]+)\b/g, (match, p1, p2) => `${p1}-${p2.charAt(0).toUpperCase()}${p2.slice(1)}`);

            game.i18n.translations.PF1.DamageTypeCategory[value.category.toLowerCase()] = capitalizedCategory;
        }
    });
}

function handleRegistryHook(registry) {
    registerSettings();
    const customDamageTypes = game.settings.get(MODULE.ID, "customDamageTypes");

    customDamageTypes.forEach(damageType => {
        const { key, value } = damageType;

        // Register the custom category if it's not "physical," "energy," or "misc"
        if (!["physical", "energy", "misc"].includes(value.category.toLowerCase().trim())) {
            registry.constructor.CATEGORIES.push(value.category);
        }

        // Register the damage type
        registry.register(MODULE.ID, key, value);
    });
}

function handleSetupHook() {
    syncWeaponDamageTypes();
}

function compareVersions(v1, v2) {
    const [major1, minor1 = 0, patch1 = 0] = v1.split('.').map(Number);
    const [major2, minor2 = 0, patch2 = 0] = v2.split('.').map(Number);

    if (major1 > major2) return 1;
    if (major1 < major2) return -1;
    if (minor1 > minor2) return 1;
    if (minor1 < minor2) return -1;
    if (patch1 > patch2) return 1;
    if (patch1 < patch2) return -1;

    return 0;
}

async function performMigration() {
    const customDamageTypes = game.settings.get(MODULE.ID, "customDamageTypes");

    if (Array.isArray(customDamageTypes) && customDamageTypes.length > 0) {
        const damageTypesToReRegister = [];

        customDamageTypes.forEach(damageType => {
            const flags = damageType.value.flags[MODULE.ID];
            if (typeof flags.abilities === "object") {
                damageTypesToReRegister.push(damageType);
                const abilityKeys = Object.keys(flags.abilities);
                flags.abilities = abilityKeys.join(",");
            }
        });
        if (damageTypesToReRegister.length > 0) {
            ui.notifications.info("Starting migration for custom damage types...");
            unregisterDamageTypes(damageTypesToReRegister);
            await game.settings.set(MODULE.ID, "customDamageTypes", customDamageTypes);
            reRegisterDamageTypes(damageTypesToReRegister);

            ui.notifications.info("Migration completed successfully!");
        }
    }
}

function unregisterDamageTypes(damageTypesToUnregister) {
    const registry = pf1.registry.damageTypes;

    damageTypesToUnregister.forEach(damageType => {
        const { key } = damageType;
        registry.unregister(MODULE.ID, key);
    });

    console.log("Unregistered damage types:", damageTypesToUnregister.map(dt => dt.key));
}

function reRegisterDamageTypes(damageTypesToReRegister) {
    const registry = pf1.registry.damageTypes;

    damageTypesToReRegister.forEach(damageType => {
        const { key, value } = damageType;
        registry.register(MODULE.ID, key, value);
    });

    console.log("Re-registered damage types:", damageTypesToReRegister.map(dt => dt.key));
}
export const AutomateDamageModule = {
    MODULE,
    automateDamageConfig,
    registerSettings,
    handleReadyHook,
    handleRegistryHook,
    handleSetupHook,
    syncWeaponDamageTypes,
    populateDefaultTypes
};

class DamageTypeFormApplication extends FormApplication {
    constructor(...args) {
        super(...args);
        this.customData = {
            name: "", img: "", category: "", abbr: "", icon: "", isModifier: false, color: "#000000", flag: ""
        };
        this.savedDamageTypes = game.settings.get(MODULE.ID, "customDamageTypes");
    }
  
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "damage-type-form",
            title: game.i18n.localize("FORM.damageTypeForm.title"),
            template: "modules/pf1-automate-damage/templates/custom-damage-type-form.html",
            width: 600,
            height: "auto",
            closeOnSubmit: true
        });
    }
  
    getData() {
        return {
            customData: this.customData,
            savedDamageTypes: this.savedDamageTypes,
            hassavedDamageTypes: this.savedDamageTypes.length > 0
        };
    }
  
    activateListeners(html) {
        super.activateListeners(html);
        html.find('button[name="save"]').click(this._onSave.bind(this));
        html.find('button[name="clear"]').click(this._onClear.bind(this));
        html.find('button.file-picker').click(this._onFilePicker.bind(this));
        html.find('button.edit-btn').click(this._onEdit.bind(this));
        html.find('button.delete-btn').click(this._onDelete.bind(this));
        html.find('input[name="custom-category"]').on('focus', this._onCustomCategoryFocus.bind(this));
        html.find('input[name="flag-type"]').on('click', this._onRadioClick.bind(this));
        html.find('input[name="custom-category"]').on('focus', this._onCustomCategoryFocus.bind(this));
    }
  
    _onCustomCategoryFocus(event) {
        $('input[name="category"]').prop('checked', false);
    }

    _onRadioClick(event) {
        const clickedRadio = $(event.currentTarget);
        if (this.selectedRadio && this.selectedRadio[0] === clickedRadio[0]) {
            clickedRadio.prop('checked', false);
            this.selectedRadio = null;
        } else {
            this.selectedRadio = clickedRadio;
        }
    }
  
    async _onSave(event) {
        event.preventDefault();
        const form = $(event.currentTarget).parents("form")[0];
        const name = form.name.value.capitalize().trim();
        const img = form.img.value.trim();
        let category = form.category.value.trim();
        const customCategory = form["custom-category"].value.trim();
        if (customCategory) {
            category = customCategory.toLowerCase().trim()
        }
        const abbr = form.abbr.value.trim();
        const icon = form.icon.value.trim();
        const color = form.color.value;
        const isModifier = form.isModifier.checked;
        const flagType = form["flag-type"].value;
        const flagAbility = form["flag-ability"].value;
        let vsAbility = false;
        let abilities = [];

        if (flagType && !flagAbility) {
            return ui.notifications.error(game.i18n.localize("FORM.damageTypeForm.errors.selectAbility"));
        }

        if (!flagType && flagAbility) {
            ui.notifications.error(game.i18n.localize("FORM.damageTypeForm.errors.flagTypeRequired"));
            return;
        }
  
        if (flagType && flagAbility) {
            vsAbility = true;
            abilities.push(flagAbility);
        }
    
        const flags = {
            [MODULE.ID]: {
                vsAbility: vsAbility,
                abilities: abilities.join(','),
                type: flagType || ""
            }
        };
        if (!name) return ui.notifications.error(game.i18n.localize("NOTIFICATIONS.errors.nameRequired"));
        if (!img && !icon) return ui.notifications.error(game.i18n.localize("NOTIFICATIONS.errors.imgOrIconRequired"));
        if (!category) return ui.notifications.error(game.i18n.localize("NOTIFICATIONS.errors.categoryRequired"));
  
        const key = name.toLowerCase();
        const newDamageType = {
            key,
            value: {
                name,
                img,
                category,
                flags,
                namespace: MODULE.ID,
                _id: key,
                abbr,
                icon,
                isModifier,
                color
            }
        };
        this.savedDamageTypes.push(newDamageType);
        await game.settings.set(MODULE.ID, "customDamageTypes", this.savedDamageTypes);
        this.render();
        this._promptReload();
    }
  
    async _onClear(event) {
        event.preventDefault();
        const dialog = new Dialog({
            title: game.i18n.localize("FORM.damageTypeForm.clearTitle"),
            content: `<p>${game.i18n.localize("NOTIFICATIONS.confirmations.clearAll")}</p>`,
            buttons: {
                yes: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("BUTTONS.yes"),
                    callback: async () => {
                        await game.settings.set(MODULE.ID, "customDamageTypes", []);
                        this.savedDamageTypes = game.settings.get(MODULE.ID, "customDamageTypes");
                        this.render();
                    }
                },
                no: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("BUTTONS.no")
                }
            },
            default: "no"
        });
        dialog.render(true);
    }
  
    async _onFilePicker(event) {
        event.preventDefault();
        const options = {};
        const filePicker = new FilePicker({
            type: event.currentTarget.dataset.type,
            current: this.form.img.value,
            callback: path => {
                this.form.img.value = path;
            },
            options: options
        });
    }
  
    async _onEdit(event) {
        event.preventDefault();
        const index = event.currentTarget.dataset.index;
        const item = this.savedDamageTypes[index];
        new EditDamageType(item, index, async (newValues) => {
            const key = newValues.name.toLowerCase();
            this.savedDamageTypes[index] = {
                key,
                value: {
                    ...newValues,
                    flags: {
                        ...item.value.flags,
                        [MODULE.ID]: {
                            ...item.value.flags[MODULE.ID],
                            ...newValues.flags[MODULE.ID],
                        }
                    },
                    namespace: MODULE.ID,
                    _id: key,
                    color: newValues.color
                }
            };
            await game.settings.set(MODULE.ID, "customDamageTypes", this.savedDamageTypes);
            this.render();
            this._promptReload();
        }).render(true);
    }
  
    _promptReload() {
        new Dialog({
            title: game.i18n.localize("NOTIFICATIONS.confirmations.reloadRequired"),
            content: `<p>${game.i18n.localize("NOTIFICATIONS.confirmations.reload")}</p>`,
            buttons: {
                yes: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("BUTTONS.yes"),
                    callback: () => window.location.reload()
                },
                no: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("BUTTONS.no")
                }
            },
            default: "yes"
        }).render(true);
    }
  
    async _onDelete(event) {
        event.preventDefault();
        const index = event.currentTarget.dataset.index;
        const item = this.savedDamageTypes[index];
        const dialog = new Dialog({
            title: game.i18n.localize("FORM.damageTypeForm.deleteTitle").replace("{value}", item.value.name),
            content: `<p>${game.i18n.localize("NOTIFICATIONS.confirmations.deleteValue").replace("{value}", item.value.name)}</p>`,
            buttons: {
                yes: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("BUTTONS.yes"),
                    callback: async () => {
                        this.savedDamageTypes.splice(index, 1);
                        await game.settings.set(MODULE.ID, "customDamageTypes", this.savedDamageTypes);
                        this.render();
                    }
                },
                no: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("BUTTONS.no")
                }
            },
            default: "no"
        });
        dialog.render(true);
    }
  
    async _updateObject(event, formData) {
    }
}  

class EditDamageType extends FormApplication {
    constructor(item, index, onSubmit) {
        super();
        this.item = item;
        this.index = index;
        this.onSubmitCallback = onSubmit;
        this.initialImg = item.value.img;
        this.initialIcon = item.value.icon;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "edit-damage-type",
            title: game.i18n.localize("FORM.damageTypeForm.editTitle"),
            template: "modules/pf1-automate-damage/templates/damage-type-editor.html",
            width: 400,
            height: "auto",
            closeOnSubmit: true
        });
    }

    getData() {
        let categoryDisplay = this.item.value.category;
        if (!["physical", "energy", "misc"].includes(this.item.value.category)) {
            categoryDisplay = this.item.value.category.capitalize();
        }
    
        return {
            item: {
                ...this.item.value,
                category: categoryDisplay
            },
            moduleId: MODULE.ID
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        this.selectedRadio = html.find('input[name="flag-type"]:checked');
        html.find(`input[name="flag-type"][value="${this.item.value.flags[MODULE.ID]?.type}"]`).prop('checked', true);
        html.find(`select[name="flag-ability"]`).val(Object.keys(this.item.value.flags[MODULE.ID]?.abilities));
    
        html.find('button.file-picker').click(this._onFilePicker.bind(this));
        html.find('input[name="custom-category"]').on('focus', this._onCustomCategoryFocus.bind(this));
        html.find('input[name="flag-type"]').on('click', this._onRadioClick.bind(this));
        html.find('button[name="save"]').on('click', (event) => {
            this._onSubmit(event);
        });
    }

    async _onFilePicker(event) {
        event.preventDefault();
        const options = {};
        const filePicker = new FilePicker({
            type: event.currentTarget.dataset.type,
            current: this.form.img.value,
            callback: (path) => {
                this.form.img.value = path;
            },
            options: options
        });
    }

    _onCustomCategoryFocus(event) {
        $('input[name="category"]').prop('checked', false);
    }

    _onRadioClick(event) {
        const clickedRadio = $(event.currentTarget);
        if (this.selectedRadio && this.selectedRadio[0] === clickedRadio[0]) {
            clickedRadio.prop('checked', false);
            this.selectedRadio = null;
        } else {
            this.selectedRadio = clickedRadio;
        }
    }

    async _onSubmit(event, options = {}) {
        event.preventDefault();
        const formData = new FormData(this.element.find('form')[0]);

        const name = formData.get("name").trim().capitalize();
        const img = formData.get("img").trim();
        let category = formData.get("category");
        const customCategory = formData.get("custom-category").trim();
        if (!["physical", "energy", "misc"].includes(category)) {
            category = customCategory.toLowerCase().trim()
        }

        const abbr = formData.get("abbr").trim();
        const icon = formData.get("icon").trim();
        const color = formData.get("color").trim();
        const isModifier = formData.get("isModifier") === "on";

        const flagType = formData.get("flag-type");
        const flagAbility = formData.get("flag-ability");

        let vsAbility = false;
        let abilities = {};
        if (!name) {
            ui.notifications.error(game.i18n.localize("FORM.damageTypeForm.errors.nameRequired"));
            return;
        }
        if (!img && !icon) {
            ui.notifications.error(game.i18n.localize("FORM.damageTypeForm.errors.imgOrIconRequired"));
            return;
        }
        if (!category) {
            ui.notifications.error(game.i18n.localize("FORM.damageTypeForm.errors.categoryRequired"));
            return;
        }
        if (flagType && !flagAbility) {
            ui.notifications.error(game.i18n.localize("FORM.damageTypeForm.errors.selectAbility"));
            return;
        }

        if (!flagType && flagAbility) {
            ui.notifications.error(game.i18n.localize("FORM.damageTypeForm.errors.flagTypeRequired"));
            return;
        }

        if (flagType && flagAbility) {
            vsAbility = true;
            abilities[flagAbility] = flagAbility;
        }

        const updatedFlags = {
            ...this.item.value.flags,
            [MODULE.ID]: {
                vsAbility: vsAbility,
                abilities: abilities,
                type: flagType || ""
            }
        };

        const updatedItem = {
            name,
            img: (this.initialImg && img === this.initialImg && icon && !this.initialIcon) ? "" : img,
            category,
            abbr,
            icon: (this.initialIcon && icon === this.initialIcon && img && !this.initialImg) ? "" : icon,
            color,
            isModifier,
            flags: updatedFlags
        };

        this.item.value = updatedItem;

        this.onSubmitCallback(updatedItem);

        let savedDamageTypes = game.settings.get(MODULE.ID, "customDamageTypes");
        savedDamageTypes[this.index] = this.item;
        await game.settings.set(MODULE.ID, "customDamageTypes", savedDamageTypes);
        this.close();
    }

    async _updateObject(event, formData) {
    }
}

class DamagePriorityForm extends FormApplication {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "damage-priority-form",
            title: game.i18n.localize("FORM.damagePriorityForm.title"),
            template: "modules/pf1-automate-damage/templates/damage-priority-form.html",
            width: 500,
            height: "auto",
            closeOnSubmit: true
        });
    }

    constructor(...args) {
        super(...args);
        this.originalPriorityLevels = JSON.parse(JSON.stringify(game.settings.get(MODULE.ID, "damageTypePriority")));
    }

    getData() {
        const data = super.getData();
        this.priorityLevels = JSON.parse(game.settings.get(MODULE.ID, "damageTypePriority"));
        data.priorityLevels = this.priorityLevels;
        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('.add-row').click(this._onAddRow.bind(this));
        html.find('.delete-row').click(this._onDeleteRow.bind(this));
        html.find('.reset-defaults').click(this._onResetDefaults.bind(this));
        html.find('.edit-row').click(this._onEditRow.bind(this));
        html.find('.edit-row, .delete-row').on('click', function(event) {
            setTimeout(() => {
                event.currentTarget.blur();
            }, 100);
        });
    }

    async _onAddRow(event) {
        event.preventDefault();
        if (!this.priorityLevels) {
            console.error("priorityLevels is undefined in _onAddRow");
            return;
        }
        this.priorityLevels.push([]);
        await game.settings.set(MODULE.ID, "damageTypePriority", JSON.stringify(this.priorityLevels));
        this.render(false);
    }

    async _onDeleteRow(event) {
        event.preventDefault();
        const row = event.currentTarget.closest('tr');
        const index = row.rowIndex - 1;
        if (!this.priorityLevels) {
            console.error("priorityLevels is undefined in _onDeleteRow");
            return;
        }

        this._showDeleteConfirmationDialog(index);
    }

    async _onResetDefaults(event) {
        event.preventDefault();
        this._showResetConfirmationDialog();
    }

    async _onEditRow(event) {
        event.preventDefault();
        const index = $(event.currentTarget).data('index');
        const drTypes = this.priorityLevels[index];
        new DRTypeEditor(drTypes, async (updatedTypes) => {
            this.priorityLevels[index] = updatedTypes;
            await game.settings.set(MODULE.ID, "damageTypePriority", JSON.stringify(this.priorityLevels));
            this.render(false);
        }).render(true);
    }

    async _updateObject(event, formData) {
        event.preventDefault();
        const form = event.currentTarget;
        const disabledFields = form.querySelectorAll('input[disabled]');
        disabledFields.forEach(field => field.disabled = false);
        const priorityLevels = [];
        const formDataUpdated = new FormData(form);
        formDataUpdated.forEach((value, key) => {
            if (key.startsWith('priority')) {
                const index = parseInt(key.split('.')[1]);
                const types = value.split(',')
                    .map(type => type.trim())
                    .filter(type => type !== '');
                priorityLevels[index] = types;
            }
        });
        await game.settings.set(MODULE.ID, "damageTypePriority", JSON.stringify(priorityLevels));
        this.priorityLevels = priorityLevels;
        this.render(false);
        this._promptReload();
    }

    _showDeleteConfirmationDialog(index) {
        new Dialog({
            title: game.i18n.localize("NOTIFICATIONS.confirmations.deleteTitle"),
            content: `<p>${game.i18n.localize("NOTIFICATIONS.confirmations.deleteRow")}</p>`,
            buttons: {
                yes: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("BUTTONS.yes"),
                    callback: async () => {
                        this.priorityLevels.splice(index, 1);
                        await game.settings.set(MODULE.ID, "damageTypePriority", JSON.stringify(this.priorityLevels));
                        this.render(false);
                    }
                },
                no: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("BUTTONS.no")
                }
            },
            default: "no"
        }).render(true);
    }

    _showResetConfirmationDialog() {
        new Dialog({
            title: game.i18n.localize("NOTIFICATIONS.confirmations.resetTitle"),
            content: `<p>${game.i18n.localize("NOTIFICATIONS.confirmations.resetDefaults")}</p>`,
            buttons: {
                yes: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("BUTTONS.yes"),
                    callback: async () => {
                        await populateDefaultTypes();
                        this.priorityLevels = JSON.parse(await game.settings.get(MODULE.ID, "damageTypePriority"));
                        this.render(true);
                    }
                },
                no: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("BUTTONS.no")
                }
            },
            default: "no"
        }).render(true);
    }

    _promptReload() {
        new Dialog({
            title: game.i18n.localize("NOTIFICATIONS.confirmations.reloadRequired"),
            content: `<p>${game.i18n.localize("NOTIFICATIONS.confirmations.reload")}</p>`,
            buttons: {
                yes: {
                    icon: '<i class="fas fa-check"></i>',
                    label: game.i18n.localize("BUTTONS.yes"),
                    callback: () => window.location.reload()
                },
                no: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("BUTTONS.no")
                }
            },
            default: "yes"
        }).render(true);
    }

    close(options = {}) {
        if (!options.force && !options.submit) {
            game.settings.set(MODULE.ID, "damageTypePriority", this.originalPriorityLevels);
        }
        super.close(options);
    }
}

class DRTypeEditor extends FormApplication {
    constructor(drTypes, onSubmit) {
        super();
        this.drTypes = drTypes;
        this.onSubmit = onSubmit;
        this.materialTypes = pf1.registry.materialTypes;
        this.damageResistances = pf1.config.damageResistances;
        this.availableTypes = ["Custom", ...this.materialTypes.map(m => m.name), ...Object.values(this.damageResistances).sort((a, b) => a.localeCompare(b))];
        this.originalDrTypes = [...drTypes];
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "dr-type-editor",
            title: game.i18n.localize("FORM.drTypeEditor.title"),
            template: "modules/pf1-automate-damage/templates/dr-type-editor.html",
            width: 300,
            height: "auto",
            closeOnSubmit: true
        });
    }

    getData() {
        return {
            drTypes: this.drTypes,
            availableTypes: this.availableTypes
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('.add-entry').click(this._onAddType.bind(this));
        html.find('.delete-entry').click(this._onRemoveType.bind(this));
        html.find('#new-type-select').change(this._onNewTypeSelect.bind(this));
        html.find('form').submit(this._onSubmit.bind(this));
    }

    _onAddType(event) {
        event.preventDefault();
        const newTypeSelect = document.getElementById('new-type-select');
        const newType = newTypeSelect.value;
        if (newType && newType !== "Custom") {
            this.drTypes.push(newType);
        } else if (newType === "Custom") {
            const customTypeInput = document.getElementById('custom-type-input');
            const customType = customTypeInput.value.trim();
            if (customType) {
                this.drTypes.push(customType);
                customTypeInput.value = '';
            }
        }
        this.render(false);
    }

    _onRemoveType(event) {
        event.preventDefault();
        const index = $(event.currentTarget).data('index');
        this.drTypes.splice(index, 1);
        this.render(false);
    }

    _onNewTypeSelect(event) {
        const selectedType = event.target.value;
        const customTypeInput = document.getElementById('custom-type-input');
        if (selectedType === "Custom") {
            customTypeInput.style.display = 'block';
        } else {
            customTypeInput.style.display = 'none';
        }
    }

    _onSubmit(event) {
        event.preventDefault();
        const inputs = event.currentTarget.querySelectorAll('input[disabled]');
        inputs.forEach(input => input.disabled = false);
        const formData = {};
        const formElements = event.currentTarget.elements;
        for (let element of formElements) {
            if (element.name) {
                formData[element.name] = element.value;
            }
        }
        this._updateObject(event, formData);
        inputs.forEach(input => input.disabled = true);
    }

    async _updateObject(event, formData) {
        const updatedTypes = [];

        for (const key in formData) {
            if (formData.hasOwnProperty(key) && key.startsWith('type')) {
                let value = formData[key].trim();
                if (value) {
                    if (this.availableTypes.includes(value)) {
                        const material = this.materialTypes.find(m => m.name === value);
                        const resistanceKey = Object.keys(this.damageResistances).find(key => this.damageResistances[key] === value);

                        if (material) {
                            updatedTypes.push(material.name);
                        } else if (resistanceKey) {
                            updatedTypes.push(this.damageResistances[resistanceKey]);
                        } else {
                            updatedTypes.push(value.capitalize());
                        }
                    } else {
                        updatedTypes.push(value.capitalize());
                    }
                }
            }
        }
        this.onSubmit(updatedTypes);
        this.close();
    }

    close(options = {}) {
        if (!options.force && !options.submit) {
            this.drTypes.splice(0, this.drTypes.length, ...this.originalDrTypes);
        }
        super.close(options);
    }
}

class TranslationForm extends FormApplication {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "translation-form",
            title: game.i18n.localize("FORM.translationForm.title"),
            template: "modules/pf1-automate-damage/templates/translation-form.html",
            width: 400,
            height: "auto",
            closeOnSubmit: true
        });
    }

    getData() {
        const translations = game.settings.get(MODULE.ID, "translations") || {};
        translations.hardness ||= "Hardness";
        translations.construct ||= "Construct Traits";
        translations.undead ||= "Undead Traits";

        return translations;
    }

    async _updateObject(event, formData) {
        const translations = {
            hardness: formData.hardness.trim() || "Hardness",
            construct: formData.construct.trim() || "Construct Traits",
            undead: formData.undead.trim() || "Undead Traits"
        };

        await game.settings.set(MODULE.ID, "translations", translations);
    }
}