# PF1 Automate Damage
Automate Damage is a module for Foundry Virtual Tabletop (FoundryVTT) designed to enhance and streamline the damage calculation and application process for Pathfinder First Edition (PF1) games.

**WARNING: This module is currently in beta stage. As my first module ever, I have released it to receive feedback and identify potential issues with the way it handles damage. Your feedback and suggestions are highly appreciated to improve the module.**

## Features

- **Damage Calculation**: The module seamlessly integrates into the FoundryVTT interface and PF1E system. It changes the way damage is applied and calculates damage based on various factors, including resistances, immunities, vulnerabilities, and whether the damage source is a spell or weapon. The module always calculates the damage based on the target's damage reduction, resistances, immunities, and vulnerabilities. However, you can always shift-click to apply damage differently as usual with the PF1E system.
- **Personalized Damage Types**: The module gives you the ability to add your own damage types to it. Those types will also be taken into account when calculating the applied damage. These types are also ordered in priority so you can make your own custom logic for the types. The priority follows an array index (I will find a way to make it more user-friendly in the future). The current default types are: magic, cold iron, silver, adamantine, law, chaos, good, evil, and epic. To add your own type, add it inside a bracket in the module's configuration window. To put it in your desired priority, choose the index number of the brackets.

  **For example**:
  The current array of types look like this: [[],['magic'],[],['cold iron','silver'],['adamantine'],['law','chaos','good','evil'],['epic']]. Each bracket is an index number starting from 0. This means that magic is 1 which is followed by an empty bracket which is 2 which is followed by cold iron and silver which are 3 in the index.
  Let's say you want to add a type called "Steel" to the list of types and you want it to have a higher priority than silver (3), then the array should look like this: [[],['magic'],[],['cold iron','silver'],['adamantine','steel'],['law','chaos','good','evil'],['epic']].
  With that, you successfully made Steel a type that bypasses anything before it in the array.

  **This feature is not yet complete so it might not work as intended.**

## Installation
Manifest URL: https://github.com/Nevela-0/PF1-Automate-Damage/releases/latest/download/module.json

## Usage

Once the module is installed and enabled, it automatically enhances the damage calculation and application process in your PF1 games without requiring any additional configuration. Simply apply damage as usual, and the module will handle the rest.

- When adding a custom Damage Reduction (DR) type or Elemental Resistance (ER) type to a token, remember to separate each type by a semicolon (;). The module can also handle operators (and\or) in the custom section. The amount can be before or after the type.

  **Examples**:
  5/Cold Iron and Silver; 10/Glass
  Magma or Frost/10; Poison/5

## License

This module is licensed under the [MIT License](https://github.com/Nevela-0/PF1-Automate-Damage/blob/main/LICENSE).
## Credits

- **Nevela**: Lead developer and creator of the Automate Damage module.
- **Contributors**: The PF1E system and module developers for their support.

## Acknowledgements

Special thanks to the FoundryVTT community for their support and feedback during the development of this module.

