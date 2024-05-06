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
    const added_types = JSON.parse(args[0]);
    if(added_types.length<1) return ui.notification.error('Bad weapon type format.');
    added_types.forEach((types,i)=>{
        types.forEach((type,n)=>{
            types[i][n] = type.trim().toLowerCase();
        })

        types = types.filter(type=>type!="");
        types = types.filter((type, pos)=>types.indexOf(type)===pos);
    });

    automateDamageConfig.weaponDamageTypes.push(...added_types);
    console.log(automateDamageConfig);
}