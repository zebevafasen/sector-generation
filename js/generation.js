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
import { buildSectorPayload } from './storage.js';
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
const HABITABILITY_TYPE_WEIGHT = {
    Terrestrial: 2.2,
    Oceanic: 1.0,
    Desert: 0.8,
    Arctic: 0.75
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

function getHabitabilityTypeWeight(type) {
    return HABITABILITY_TYPE_WEIGHT[type] || 1;
}

function pickWeightedCandidateIndex(candidateIndexes, planets) {
    const weightedCandidates = candidateIndexes.map(index => ({
        index,
        weight: getHabitabilityTypeWeight(planets[index].type)
    }));
    const total = weightedCandidates.reduce((sum, item) => sum + item.weight, 0);
    let roll = rand() * total;
    for (const item of weightedCandidates) {
        roll -= item.weight;
        if (roll <= 0) return item.index;
    }
    return weightedCandidates[weightedCandidates.length - 1].index;
}

function assignSystemHabitability(planets) {
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

    const primaryIndex = pickWeightedCandidateIndex(candidateIndexes, planets);
    const remainingIndexes = candidateIndexes.filter(index => index !== primaryIndex);
    planets[primaryIndex].habitable = true;

    let extraHabitableCount = 0;
    shuffleArray(remainingIndexes, rand);
    remainingIndexes.forEach(index => {
        const typeWeight = getHabitabilityTypeWeight(planets[index].type);
        const extraChance = 0.12 * typeWeight * Math.pow(0.45, extraHabitableCount);
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
    showStatusMessage(seedUsed ? `Generated seed ${seedUsed}` : 'Sector regenerated.', 'info');
}

export function generateSystemData() {
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

    const planetCount = Math.floor(rand() * 10) + 1;
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

        if (['Terrestrial', 'Oceanic', 'Desert', 'Arctic'].includes(type) && rand() > 0.6) {
            pop = Math.floor(rand() * 10) + 1;
            population += pop;
            features.push('Inhabited');
        }

        if (rand() > 0.8) {
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

    assignSystemHabitability(planets);

    if (rand() > 0.65) {
        planets.push({
            name: `${name} Belt`,
            type: rand() > 0.6 ? 'Debris Field' : 'Asteroid Belt',
            features: rand() > 0.55 ? ['Resource-Rich'] : [],
            pop: 0
        });
    }

    if (rand() > 0.7) {
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
