# PF1 Automate Damage
Automate Damage is a module for Foundry Virtual Tabletop (FoundryVTT) designed to enhance and streamline the damage calculation and application process for Pathfinder First Edition (PF1) games.

## Features

- **Damage Calculation**: The module seamlessly integrates into the FoundryVTT interface and PF1E system. It changes the way damage is applied and calculates damage based on various factors, including resistances, immunities, vulnerabilities, and whether the damage source is a spell or weapon. The module always calculates the damage based on the target's damage reduction, resistances, immunities, and vulnerabilities. However, you can always shift-click to apply damage differently as usual with the PF1E system.
- **Personalized Damage Types**: The module comes with configurations that allow you to add custom damage types, change the default Pathfinder damage reduction priority rules, add additional categories for damage types and more!
  - **Custom Damage Type**: When you add a new damage type, you must include a name, an image or an icon class*, and a category. By default, the system has 3 categories: "Physical", "Energy", and "Miscellaneous", however, you can define additional categories if you wish. This will register the damage types directly to the system and in so you will be able to select them as DR and ER.
    
    *An icon class is what the system uses currently. You can search online for the correct icon class names as there are a few sources, for example, Font Awesome.
  - **Ability Score Damage**: Each custom damage type you create can also target one specific ability score and be defined as ability damage, ability drain, or ability penalty. These will be applied when you attempt to apply the damage to the selected token(s).
    - **Ability Damage Immunity**: The module also supports ability damage immunity. Use the following table to enter the immunity you desire in the damage immunities custom section:

    | Immunity Type              | Description                                                                                               |
    |----------------------------|-----------------------------------------------------------------------------------------------------------|
    | **Ability Damage**         | Immunity to any form of ability damage.                                                                    |
    | **Ability Drain**          | Immunity to any form of ability drain.                                                                     |
    | **Ability Penalty**        | Immunity to any form of ability penalty.                                                                   |
    | **All Ability Damage**     | Complete immunity to any effect that causes ability damage, drain, or penalty.                             |
    | **<span title="Strength (STR), Dexterity (DEX), Constitution (CON), Intelligence (INT), Wisdom (WIS), Charisma (CHA)">`Specific Ability`</span> Damage** | Immunity to damage to a specific ability score.                                                            |
    | **<span title="Strength (STR), Dexterity (DEX), Constitution (CON), Intelligence (INT), Wisdom (WIS), Charisma (CHA)">`Specific Ability`</span> Drain**  | Immunity to drain of a specific ability score.                                                             |
    | **<span title="Strength (STR), Dexterity (DEX), Constitution (CON), Intelligence (INT), Wisdom (WIS), Charisma (CHA)">`Specific Ability`</span> Penalty**| Immunity to penalties to a specific ability score.                                                         |
    | **All <span title="Strength (STR), Dexterity (DEX), Constitution (CON), Intelligence (INT), Wisdom (WIS), Charisma (CHA)">`Specific Ability`</span> Damage** | Complete immunity to any effect that causes damage, drain, or penalty to a specific ability score.         |
    | **Mental Ability Damage**  | Immunity to damage to any mental ability score (INT, WIS, CHA).                                            |
    | **Mental Ability Drain**   | Immunity to drain of any mental ability score (INT, WIS, CHA).                                             |
    | **Mental Ability Penalty** | Immunity to penalties to any mental ability score (INT, WIS, CHA).                                         |
    | **All Mental Abilities**   | Complete immunity to any effect that causes damage, drain, or penalty to any mental ability score.          |
    | **Physical Ability Damage** | Immunity to damage to any physical ability score (STR, DEX, CON).                                          |
    | **Physical Ability Drain**  | Immunity to drain of any physical ability score (STR, DEX, CON).                                           |
    | **Physical Ability Penalty**| Immunity to penalties to any physical ability score (STR, DEX, CON).                                       |
    | **All Physical Abilities**  | Complete immunity to any effect that causes damage, drain, or penalty to any physical ability score.       |

    *`Specific Ability` refers to the ability score's full name or abbreviation (e.g., STR for Strength, DEX for Dexterity, etc.) which can be uppercase, lowercase or capitalized.
    If you check the damage type's checkbox, both damage and ability damage from this damage type will be nullified.

  - **Custom Priority**: The module comes ready with the Pathfinder's default damage reduction table. You can change that table as you wish. You can add, remove, and edit the default table to suit your own needs. There is a "Reset to Defaults" button should you ever need it. Each enhancement row bypasses the damage types in the enhancement row before it. You can add all the materials and alignments the system currently provides but if that's not enough, you can also enter a custom value.

### Damage Reduction

- When adding a custom Damage Reduction (DR) type or Elemental Resistance (ER) type to a token, remember to separate each type by a semicolon (;). The module can also handle operators (and\or) in the custom section. The amount can be before or after the type.

  **Examples**:
  - 5/Cold Iron and Silver; 10/Glass
  - Magma or Frost/10; Poison/5
  
- The module will identify a weapon with an enhancement bonus greater than 0. If you possess a magical weapon lacking enhancement bonuses for attack and damage rolls (such as claws gained from the sorcerer's draconic bloodline), to bypass DR magic, you can check the magic checkbox in the attack's detail tab.

### Hardness

- **(New)** Hardness reduces damage from all sources (except ability score damage) by the amount entered in the Damage Reduction section of the actor's sheet. This means that whenever damage is applied to an actor, the hardness value will reduce the incoming damage before it’s applied. The only exception to this rule is **adamantine**: if the hardness value is less than or equal to 20, adamantine will bypass hardness completely.

#### Ignoring or Bypassing Hardness

- You can ignore or bypass an amount of hardness by adding specific flags to your weapon or attack.
  - To **completely bypass hardness**, add a boolean flag named `"ignoreHardness"` to your weapon or attack.
  - To **bypass a specific amount of hardness**, add a dictionary flag named `"ignoreHardness"` with the value set to the desired amount you want to bypass.

This allows for flexible handling of hardness in different combat scenarios, giving you control over how much damage reduction is applied based on the type of weapon or material used.

### Notes
- **Silver and Alchemical Silver are treated as the same material.** If you add Silver as a custom material it will not bypass the Silver DR from the system. You will have to add a custom DR with the same name for that.

### Damage Roll Cards
- When creating a macro or chat for damage rolls (using /d or /damage), you can specify a "type" for the damage using what the system refers to as "flavor," indicated by brackets after the damage. You can include multiple types by separating each type with a comma (,). 
  
  **Example**:
  - /d 3d6[Fire, Slashing].

### Ammunition
- **Material**: Since ammunition does not have material supported by the PF1E system yet, you can add a dictionary flag named "Material" with a value of the material you want the ammo to be. You can add magic in this dictionary flag to treat the ammo as magic to overcome DR in case it does not have an enhancement bonus.
- **Enhancement Bonus**: Ammunition also does not have enhancement yet, so I would recommend checking out [Roll Bonuses](https://github.com/dmrickey/fvtt-ckl-roll-bonuses) to add those to the ammo. However, if you do not use Roll Bonuses, you can add a boolean flag in the ammo named "Magic" and that will treat the ammo as magic to overcome magic DR.

## License

This module is licensed under the [MIT License](https://github.com/Nevela-0/PF1-Automate-Damage/blob/main/LICENSE).

## Credits

- **Nevela**: Lead developer and creator of the Automate Damage module.
- **Contributors**: The PF1E system and module developers for their support.
- **Claudekennilol**: Huge general support with compatibility and module settings.