const defaultTypes = [[],['magic'],[],['cold iron','silver'],['adamantine'],['law','chaos','good','evil'],['epic']];
const additionalPhysicalDamageTypes = ['slashing','bludgeoning','piercing']

export const automateDamageConfig = {
    weaponDamageTypes:defaultTypes,
    additionalPhysicalDamageTypes
}

export function registerSettings() {
    game.settings.register("pf1-automate-damage", "option1", { // Name will be changed
        name: "Custom Damage types",
        hint: "Add custom damage types to be counted as damage reduction types. Magic is at least 1, Cold Iron and Silver types are 3, Adamantine is 4 and Alignments are 5 by default.",
        default: JSON.stringify(defaultTypes),
        scope: "world",
        type: String,
        config: true,
        onChange: update
    });
}

function update (...args) {
    if(args.length == 0) {
        automateDamageConfig.weaponDamageTypes = defaultTypes
        return;
    }
    automateDamageConfig.weaponDamageTypes = defaultTypes;
    if(args[0]?.length==0) return;
    try {
        const jsonString = args[0].replace(/'/g, '"');

        let added_types = JSON.parse(jsonString);
        if(added_types.length<1) return ui.notification.error('Bad weapon type format.');
        for(let i=0;i<added_types.length;i++) {
            let types = added_types[i];
            for(let n=0;n<types.length;n++) {
                added_types[i][n] = types[n].trim().toLowerCase();
            }

            added_types[i] = types.filter(type=>type!="");
            added_types[i] = types.filter((type, pos)=>types.indexOf(type)===pos);
        }

        console.log(added_types);
        automateDamageConfig.weaponDamageTypes.push(...added_types);
    } catch(e) {
        console.log(`There was an error parsing the new damage types! ` +e);
    }

}