const DEFAULT_STAR_CLASS_PLANET_WEIGHTS = {
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

const DEFAULT_HABITABLE_PLANET_TYPES = ['Terrestrial', 'Oceanic', 'Desert', 'Arctic'];

const DEFAULT_BASE_HABITABILITY_TYPE_WEIGHT = {
    Terrestrial: 2.2,
    Oceanic: 1.0,
    Desert: 0.8,
    Arctic: 0.75
};

const DEFAULT_ADJACENT_DUPLICATE_NAME_CHANCE = 0.35;

const DEFAULT_HABITABLE_WORLD_SUFFIXES = [
    'Haven', 'Eden', 'Sanctuary', 'Harbor', 'Bastion', 'Refuge',
    'Prospect', 'Utopia', 'Arcadia', 'New Dawn', 'Greenfall', 'Crossing'
];

const DEFAULT_DENSITY_PRESET_BASE_RATIOS = {
    void: 0.05,
    sparse: 0.15,
    busy: 0.33,
    dense: 0.50,
    core: 0.70
};

const DEFAULT_DENSITY_PRESET_RATIOS_BY_PROFILE = {
    high_adventure: {
        void: 0.05,
        sparse: 0.15,
        standard: 0.20,
        busy: 0.33,
        dense: 0.50,
        core: 0.70
    },
    hard_scifi: {
        void: 0.03,
        sparse: 0.10,
        standard: 0.15,
        busy: 0.25,
        dense: 0.40,
        core: 0.55
    },
    cinematic: {
        void: 0.08,
        sparse: 0.20,
        standard: 0.33,
        busy: 0.50,
        dense: 0.70,
        core: 0.85
    }
};

const DEFAULT_DENSITY_PRESET_ORDER = ['void', 'sparse', 'standard', 'busy', 'dense', 'core'];

const DEFAULT_DENSITY_PRESET_LABELS = {
    void: 'Void',
    sparse: 'Sparse',
    standard: 'Standard',
    busy: 'Busy',
    dense: 'Dense',
    core: 'Core'
};

const DEFAULT_GENERATION_PROFILES = {
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

const DEFAULT_DEEP_SPACE_POI_TEMPLATES = [
    {
        kind: 'Navigation',
        name: 'Relay Beacon',
        summary: 'A functioning long-range navigation relay anchored to old trade routes.',
        risk: 'Low',
        rewardHint: 'Improves navigation confidence for nearby travel plans.'
    },
    {
        kind: 'Hazard',
        name: 'Ion Storm Front',
        summary: 'A volatile electromagnetic storm pocket that scrambles sensors.',
        risk: 'High',
        rewardHint: 'Forcing a crossing can save time at elevated danger.'
    },
    {
        kind: 'Opportunity',
        name: 'Drift Wreck Cluster',
        summary: 'Scattered hulks from an old convoy battle with salvage potential.',
        risk: 'Medium',
        rewardHint: 'Potential salvage, encrypted logs, and recoverable cargo.'
    },
    {
        kind: 'Mystery',
        name: 'Anomalous Signal Echo',
        summary: 'A periodic deep-space signal with no stable origin point.',
        risk: 'Unknown',
        rewardHint: 'Could indicate hidden structures, traps, or first-contact traces.'
    },
    {
        kind: 'Opportunity',
        name: 'Smuggler Dead-Drop',
        summary: 'A masked cache buoy linked to covert transport networks.',
        risk: 'Medium',
        rewardHint: 'Useful supplies and faction leads if intercepted quietly.'
    },
    {
        kind: 'Navigation',
        name: 'Ancient Lane Marker',
        summary: 'A pre-collapse gravimetric marker still broadcasting weak lane data.',
        risk: 'Low',
        rewardHint: 'Can reveal safer micro-routes and old map fragments.',
        weight: 1
    },
    {
        kind: 'Navigation',
        poiCategory: 'jump_gate',
        name: 'Active Jump-Gate',
        summary: 'A functioning gate nexus that can sling ships across major corridor distances.',
        risk: 'Low',
        rewardHint: 'Can open rapid transit options between distant regions.',
        weight: 0.14,
        jumpGateState: 'active'
    },
    {
        kind: 'Navigation',
        poiCategory: 'jump_gate',
        name: 'Inactive Jump-Gate',
        summary: 'A dormant gate structure with partial telemetry and unstable startup traces.',
        risk: 'Medium',
        rewardHint: 'Potential to restore long-range transit if reactivated.',
        weight: 0.32,
        jumpGateState: 'inactive'
    },
    {
        kind: 'Navigation',
        name: 'Refueling Station',
        summary: 'An autonomous tanker dock with reserve fuel cells and transfer hardpoints.',
        risk: 'Low',
        rewardHint: 'Extends long-haul range by enabling mid-route fuel top-offs.',
        weight: 0.22,
        isRefuelingStation: true
    }
];

const DEFAULT_STAR_CLASS_ROLL_TABLE = [
    { minRollExclusive: 0.99, starClass: 'Black Hole' },
    { minRollExclusive: 0.97, starClass: 'Neutron' },
    { minRollExclusive: 0.94, starClass: 'O' },
    { minRollExclusive: 0.90, starClass: 'B' },
    { minRollExclusive: 0.80, starClass: 'A' },
    { minRollExclusive: 0.65, starClass: 'F' },
    { minRollExclusive: 0.45, starClass: 'G' },
    { minRollExclusive: 0.20, starClass: 'K' }
];

const DEFAULT_STAR_COUNT_THRESHOLDS_BY_PROFILE = {
    hard_scifi: { triMaxExclusive: 0.03, binaryMaxExclusive: 0.21 },
    cinematic: { triMaxExclusive: 0.02, binaryMaxExclusive: 0.16 },
    high_adventure: { triMaxExclusive: 0.015, binaryMaxExclusive: 0.115 }
};

export let STAR_CLASS_PLANET_WEIGHTS = DEFAULT_STAR_CLASS_PLANET_WEIGHTS;
export let HABITABLE_PLANET_TYPES = new Set(DEFAULT_HABITABLE_PLANET_TYPES);
export let BASE_HABITABILITY_TYPE_WEIGHT = DEFAULT_BASE_HABITABILITY_TYPE_WEIGHT;
export let ADJACENT_DUPLICATE_NAME_CHANCE = DEFAULT_ADJACENT_DUPLICATE_NAME_CHANCE;
export let HABITABLE_WORLD_SUFFIXES = DEFAULT_HABITABLE_WORLD_SUFFIXES;
export let DENSITY_PRESET_BASE_RATIOS = DEFAULT_DENSITY_PRESET_BASE_RATIOS;
export let DENSITY_PRESET_RATIOS_BY_PROFILE = DEFAULT_DENSITY_PRESET_RATIOS_BY_PROFILE;
export let DENSITY_PRESET_ORDER = DEFAULT_DENSITY_PRESET_ORDER;
export let DENSITY_PRESET_LABELS = DEFAULT_DENSITY_PRESET_LABELS;
export let GENERATION_PROFILES = DEFAULT_GENERATION_PROFILES;
export let DEEP_SPACE_POI_TEMPLATES = DEFAULT_DEEP_SPACE_POI_TEMPLATES;
export let STAR_CLASS_ROLL_TABLE = DEFAULT_STAR_CLASS_ROLL_TABLE;
export let STAR_COUNT_THRESHOLDS_BY_PROFILE = DEFAULT_STAR_COUNT_THRESHOLDS_BY_PROFILE;

export function hydrateGenerationData(loadedData = {}) {
    STAR_CLASS_PLANET_WEIGHTS = loadedData.starClassPlanetWeights || DEFAULT_STAR_CLASS_PLANET_WEIGHTS;
    HABITABLE_PLANET_TYPES = new Set(loadedData.habitablePlanetTypes || DEFAULT_HABITABLE_PLANET_TYPES);
    BASE_HABITABILITY_TYPE_WEIGHT = loadedData.baseHabitabilityTypeWeight || DEFAULT_BASE_HABITABILITY_TYPE_WEIGHT;
    ADJACENT_DUPLICATE_NAME_CHANCE = loadedData.adjacentDuplicateNameChance ?? DEFAULT_ADJACENT_DUPLICATE_NAME_CHANCE;
    HABITABLE_WORLD_SUFFIXES = loadedData.habitableWorldSuffixes || DEFAULT_HABITABLE_WORLD_SUFFIXES;
    DENSITY_PRESET_BASE_RATIOS = loadedData.densityPresetBaseRatios || DEFAULT_DENSITY_PRESET_BASE_RATIOS;
    DENSITY_PRESET_RATIOS_BY_PROFILE = loadedData.densityPresetRatiosByProfile || DEFAULT_DENSITY_PRESET_RATIOS_BY_PROFILE;
    DENSITY_PRESET_ORDER = loadedData.densityPresetOrder || DEFAULT_DENSITY_PRESET_ORDER;
    DENSITY_PRESET_LABELS = loadedData.densityPresetLabels || DEFAULT_DENSITY_PRESET_LABELS;
    GENERATION_PROFILES = loadedData.generationProfiles || DEFAULT_GENERATION_PROFILES;
    DEEP_SPACE_POI_TEMPLATES = loadedData.deepSpacePoiTemplates || DEFAULT_DEEP_SPACE_POI_TEMPLATES;
    STAR_CLASS_ROLL_TABLE = loadedData.starClassRollTable || DEFAULT_STAR_CLASS_ROLL_TABLE;
    STAR_COUNT_THRESHOLDS_BY_PROFILE = loadedData.starCountThresholdsByProfile || DEFAULT_STAR_COUNT_THRESHOLDS_BY_PROFILE;
}

export function normalizeDensityPresetKey(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw in DENSITY_PRESET_BASE_RATIOS || raw === 'standard') return raw;

    const numeric = Number.parseFloat(raw);
    if (!Number.isFinite(numeric)) return 'standard';
    if (Math.abs(numeric - 0.05) < 0.001) return 'void';
    if (Math.abs(numeric - 0.15) < 0.001) return 'sparse';
    if (Math.abs(numeric - 0.20) < 0.001) return 'standard';
    if (Math.abs(numeric - 0.33) < 0.001) return 'busy';
    if (Math.abs(numeric - 0.50) < 0.001) return 'dense';
    if (Math.abs(numeric - 0.70) < 0.001) return 'core';
    return 'standard';
}

export function getDensityRatioForPreset(presetKey, profileKey) {
    const normalizedPreset = normalizeDensityPresetKey(presetKey);
    const profileRatios = DENSITY_PRESET_RATIOS_BY_PROFILE[profileKey] || DENSITY_PRESET_RATIOS_BY_PROFILE.high_adventure;
    return profileRatios[normalizedPreset] || DENSITY_PRESET_BASE_RATIOS[normalizedPreset] || DENSITY_PRESET_RATIOS_BY_PROFILE.high_adventure.standard;
}
