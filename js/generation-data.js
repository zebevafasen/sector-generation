export const STAR_CLASS_PLANET_WEIGHTS = {
    O: { 'Gas Giant': 0.28, Terrestrial: 0.07, Oceanic: 0.02, Volcanic: 0.24, Desert: 0.17, Barren: 0.20, Arctic: 0.02 },
    B: { 'Gas Giant': 0.26, Terrestrial: 0.09, Oceanic: 0.03, Volcanic: 0.20, Desert: 0.17, Barren: 0.20, Arctic: 0.05 },
    A: { 'Gas Giant': 0.24, Terrestrial: 0.15, Oceanic: 0.08, Volcanic: 0.16, Desert: 0.16, Barren: 0.13, Arctic: 0.08 },
    F: { 'Gas Giant': 0.20, Terrestrial: 0.23, Oceanic: 0.17, Volcanic: 0.10, Desert: 0.14, Barren: 0.08, Arctic: 0.08 },
    G: { 'Gas Giant': 0.19, Terrestrial: 0.24, Oceanic: 0.19, Volcanic: 0.09, Desert: 0.12, Barren: 0.08, Arctic: 0.09 },
    K: { 'Gas Giant': 0.17, Terrestrial: 0.22, Oceanic: 0.16, Volcanic: 0.11, Desert: 0.13, Barren: 0.10, Arctic: 0.11 },
    M: { 'Gas Giant': 0.12, Terrestrial: 0.20, Oceanic: 0.11, Volcanic: 0.18, Desert: 0.11, Barren: 0.16, Arctic: 0.12 },
    Neutron: { 'Gas Giant': 0.20, Terrestrial: 0.04, Oceanic: 0.01, Volcanic: 0.30, Desert: 0.08, Barren: 0.35, Arctic: 0.02 },
    'Black Hole': { 'Gas Giant': 0.22, Terrestrial: 0.02, Oceanic: 0.00, Volcanic: 0.32, Desert: 0.06, Barren: 0.36, Arctic: 0.02 },
    default: { 'Gas Giant': 0.18, Terrestrial: 0.22, Oceanic: 0.14, Volcanic: 0.11, Desert: 0.15, Barren: 0.12, Arctic: 0.08 }
};

export const HABITABLE_PLANET_TYPES = new Set(['Terrestrial', 'Oceanic', 'Desert', 'Arctic']);

export const BASE_HABITABILITY_TYPE_WEIGHT = {
    Terrestrial: 2.2,
    Oceanic: 1.0,
    Desert: 0.8,
    Arctic: 0.75
};

export const ADJACENT_DUPLICATE_NAME_CHANCE = 0.35;

export const HABITABLE_WORLD_SUFFIXES = [
    'Haven', 'Eden', 'Sanctuary', 'Harbor', 'Bastion', 'Refuge',
    'Prospect', 'Utopia', 'Arcadia', 'New Dawn', 'Greenfall', 'Crossing'
];

export const GENERATION_PROFILES = {
    cinematic: {
        inhabitedChance: 0.45,
        planetPoiChance: 0.2,
        beltChance: 0.35,
        stationChance: 0.3,
        extraHabitableBaseChance: 0.12,
        extraHabitableDecay: 0.45,
        habitabilityTypeMultipliers: { Terrestrial: 1.15, Oceanic: 1.0, Desert: 0.95, Arctic: 0.9 }
    },
    hard_scifi: {
        inhabitedChance: 0.3,
        planetPoiChance: 0.12,
        beltChance: 0.48,
        stationChance: 0.2,
        extraHabitableBaseChance: 0.06,
        extraHabitableDecay: 0.35,
        habitabilityTypeMultipliers: { Terrestrial: 1.1, Oceanic: 0.9, Desert: 0.75, Arctic: 0.65 }
    },
    high_adventure: {
        inhabitedChance: 0.58,
        planetPoiChance: 0.32,
        beltChance: 0.28,
        stationChance: 0.5,
        extraHabitableBaseChance: 0.16,
        extraHabitableDecay: 0.55,
        habitabilityTypeMultipliers: { Terrestrial: 1.05, Oceanic: 1.1, Desert: 1.0, Arctic: 0.95 }
    }
};
