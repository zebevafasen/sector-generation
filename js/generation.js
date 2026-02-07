import {
    NAME_PREFIX,
    NAME_SUFFIX,
    PLANET_TYPES,
    POI_TYPES,
    STAR_VISUALS,
    state
} from './config.js';
import { generateStarAge, generateSeedString, isAutoSeedEnabled, isRealisticPlanetWeightingEnabled, prepareSeed, rand, showStatusMessage } from './core.js';
import { getSelectedGridSize } from './controls.js';
import { autoSaveSectorState, buildSectorPayload } from './storage.js';
import { clearInfoPanel, drawGrid } from './render.js';
import { romanize, shuffleArray } from './utils.js';

const STAR_CLASS_PLANET_WEIGHTS = {
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
const HABITABLE_PLANET_TYPES = new Set(['Terrestrial', 'Oceanic', 'Desert', 'Arctic']);
const BASE_HABITABILITY_TYPE_WEIGHT = {
    Terrestrial: 2.2,
    Oceanic: 1.0,
    Desert: 0.8,
    Arctic: 0.75
};
const GENERATION_PROFILES = {
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

function pickWeightedType(weights, excludedTypes = new Set()) {
    const candidates = PLANET_TYPES
        .filter(type => !excludedTypes.has(type))
        .map(type => ({ type, weight: weights[type] || 0 }))
        .filter(item => item.weight > 0);

    if (!candidates.length) {
        return PLANET_TYPES[Math.floor(rand() * PLANET_TYPES.length)];
    }

    const total = candidates.reduce((sum, item) => sum + item.weight, 0);
    let roll = rand() * total;
    for (const item of candidates) {
        roll -= item.weight;
        if (roll <= 0) return item.type;
    }

    return candidates[candidates.length - 1].type;
}

function pickPlanetTypeForStarClass(starClass, excludedTypes = new Set()) {
    const weights = STAR_CLASS_PLANET_WEIGHTS[starClass] || STAR_CLASS_PLANET_WEIGHTS.default;
    return pickWeightedType(weights, excludedTypes);
}

function pickRandomPlanetType(excludedTypes = new Set()) {
    const candidates = PLANET_TYPES.filter(type => !excludedTypes.has(type));
    if (!candidates.length) {
        return PLANET_TYPES[Math.floor(rand() * PLANET_TYPES.length)];
    }
    return candidates[Math.floor(rand() * candidates.length)];
}

function isHabitableCandidateType(type) {
    return HABITABLE_PLANET_TYPES.has(type);
}

function getActiveGenerationProfile() {
    const select = document.getElementById('generationProfile');
    const key = select ? select.value : 'cinematic';
    return GENERATION_PROFILES[key] || GENERATION_PROFILES.cinematic;
}

function getHabitabilityTypeWeight(type, profile) {
    const baseWeight = BASE_HABITABILITY_TYPE_WEIGHT[type] || 1;
    const typeMultiplier = profile.habitabilityTypeMultipliers && profile.habitabilityTypeMultipliers[type]
        ? profile.habitabilityTypeMultipliers[type]
        : 1;
    return baseWeight * typeMultiplier;
}

function pickWeightedCandidateIndex(candidateIndexes, planets, profile) {
    const weightedCandidates = candidateIndexes.map(index => ({
        index,
        weight: getHabitabilityTypeWeight(planets[index].type, profile)
    }));
    const total = weightedCandidates.reduce((sum, item) => sum + item.weight, 0);
    let roll = rand() * total;
    for (const item of weightedCandidates) {
        roll -= item.weight;
        if (roll <= 0) return item.index;
    }
    return weightedCandidates[weightedCandidates.length - 1].index;
}

function assignSystemHabitability(planets, profile) {
    if (!planets.length) return;

    const candidateIndexes = [];
    planets.forEach((planet, index) => {
        if (isHabitableCandidateType(planet.type)) candidateIndexes.push(index);
    });

    if (!candidateIndexes.length) {
        const fallbackIndex = Math.floor(rand() * planets.length);
        planets[fallbackIndex].type = 'Terrestrial';
        candidateIndexes.push(fallbackIndex);
    }

    const primaryIndex = pickWeightedCandidateIndex(candidateIndexes, planets, profile);
    const remainingIndexes = candidateIndexes.filter(index => index !== primaryIndex);
    planets[primaryIndex].habitable = true;

    let extraHabitableCount = 0;
    shuffleArray(remainingIndexes, rand);
    remainingIndexes.forEach(index => {
        const typeWeight = getHabitabilityTypeWeight(planets[index].type, profile);
        const extraChance = profile.extraHabitableBaseChance * typeWeight * Math.pow(profile.extraHabitableDecay, extraHabitableCount);
        if (rand() < extraChance) {
            planets[index].habitable = true;
            extraHabitableCount++;
        }
    });
}

export function generateSector() {
    if (isAutoSeedEnabled()) {
        const input = document.getElementById('seedInput');
        if (input) input.value = generateSeedString();
    }

    const seedUsed = prepareSeed();
    const size = getSelectedGridSize();
    const w = size.width;
    const h = size.height;

    document.getElementById('gridWidth').value = w;
    document.getElementById('gridHeight').value = h;

    const totalHexes = w * h;
    let systemCount = 0;

    if (state.densityMode === 'preset') {
        const percent = parseFloat(document.getElementById('densityPreset').value);
        systemCount = Math.floor(totalHexes * percent);
    } else {
        let min = parseInt(document.getElementById('manualMin').value, 10);
        let max = parseInt(document.getElementById('manualMax').value, 10);
        if (min < 0) min = 0;
        if (max > totalHexes) max = totalHexes;
        if (min > max) {
            const temp = min;
            min = max;
            max = temp;
        }
        systemCount = Math.floor(rand() * (max - min + 1)) + min;
    }

    state.sectors = {};
    state.selectedHexId = null;
    clearInfoPanel();

    const allCoords = [];
    for (let c = 0; c < w; c++) {
        for (let r = 0; r < h; r++) {
            allCoords.push(`${c}-${r}`);
        }
    }

    shuffleArray(allCoords, rand);
    allCoords.slice(0, systemCount).forEach(coordId => {
        state.sectors[coordId] = generateSystemData();
    });

    drawGrid(w, h);

    document.getElementById('statusTotalHexes').innerText = `${totalHexes} Hexes`;
    document.getElementById('statusTotalSystems').innerText = `${systemCount} Systems`;
    state.lastSectorSnapshot = buildSectorPayload({ width: w, height: h, totalHexes, systemCount });
    autoSaveSectorState();
    showStatusMessage(seedUsed ? `Generated seed ${seedUsed}` : 'Sector regenerated.', 'info');
}

export function generateSystemData() {
    const generationProfile = getActiveGenerationProfile();
    const randChance = rand();
    let sClass = 'M';
    if (randChance > 0.99) sClass = 'Black Hole';
    else if (randChance > 0.97) sClass = 'Neutron';
    else if (randChance > 0.94) sClass = 'O';
    else if (randChance > 0.90) sClass = 'B';
    else if (randChance > 0.80) sClass = 'A';
    else if (randChance > 0.65) sClass = 'F';
    else if (randChance > 0.45) sClass = 'G';
    else if (randChance > 0.20) sClass = 'K';

    const p1 = NAME_PREFIX[Math.floor(rand() * NAME_PREFIX.length)];
    const p2 = NAME_SUFFIX[Math.floor(rand() * NAME_SUFFIX.length)];
    const num = Math.floor(rand() * 999) + 1;
    const name = rand() > 0.5 ? `${p1}-${num}` : `${p1} ${p2}`;

    const planetCount = Math.floor(rand() * 6) + 1;
    const planets = [];
    let population = 0;
    let hasTerrestrial = false;
    const starAge = generateStarAge(sClass);

    const useWeightedTypes = isRealisticPlanetWeightingEnabled();
    for (let i = 0; i < planetCount; i++) {
        const excludedTypes = hasTerrestrial ? new Set(['Terrestrial']) : new Set();
        const type = useWeightedTypes
            ? pickPlanetTypeForStarClass(sClass, excludedTypes)
            : pickRandomPlanetType(excludedTypes);
        if (type === 'Terrestrial') hasTerrestrial = true;
        let pop = 0;
        const features = [];

        if (['Terrestrial', 'Oceanic', 'Desert', 'Arctic'].includes(type) && rand() < generationProfile.inhabitedChance) {
            pop = Math.floor(rand() * 10) + 1;
            population += pop;
            features.push('Inhabited');
        }

        if (rand() < generationProfile.planetPoiChance) {
            const poi = POI_TYPES[Math.floor(rand() * POI_TYPES.length)];
            features.push(poi);
        }

        planets.push({
            name: `${name} ${romanize(i + 1)}`,
            type,
            features,
            pop,
            habitable: false
        });
    }

    assignSystemHabitability(planets, generationProfile);

    if (rand() < generationProfile.beltChance) {
        planets.push({
            name: `${name} Belt`,
            type: rand() > 0.6 ? 'Debris Field' : 'Asteroid Belt',
            features: rand() > 0.55 ? ['Resource-Rich'] : [],
            pop: 0
        });
    }

    if (rand() < generationProfile.stationChance) {
        const poi = POI_TYPES[Math.floor(rand() * POI_TYPES.length)];
        planets.push({
            name: `Station Alpha-${Math.floor(rand() * 99)}`,
            type: 'Artificial',
            features: [poi],
            pop: 0
        });
    }

    const visuals = STAR_VISUALS[sClass] || STAR_VISUALS.default;
    return {
        name,
        starClass: sClass,
        color: visuals.core,
        glow: visuals.halo,
        palette: visuals,
        starAge,
        planets,
        totalPop: population > 0 ? `${population} Billion` : 'None'
    };
}
