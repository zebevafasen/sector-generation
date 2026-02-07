import {
    GRID_PRESETS,
    NAME_PREFIX,
    NAME_SUFFIX,
    PLANET_TYPES,
    POI_TYPES,
    STAR_VISUALS,
    state
} from './config.js';
import { generateStarAge, generateSeedString, isAutoSeedEnabled, rand, setSeed, showStatusMessage } from './core.js';
import { autoSaveSectorState, buildSectorPayload } from './storage.js';
import { clearInfoPanel, drawGrid, selectHex, updateInfoPanel } from './render.js';
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
const ADJACENT_DUPLICATE_NAME_CHANCE = 0.35;
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

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function isHexIdInBounds(hexId, width, height) {
    const [cRaw, rRaw] = String(hexId).split('-');
    const c = parseInt(cRaw, 10);
    const r = parseInt(rRaw, 10);
    return Number.isInteger(c) && Number.isInteger(r) && c >= 0 && r >= 0 && c < width && r < height;
}

function readGenerationConfigFromUi() {
    const sizePresetSelect = document.getElementById('sizePreset');
    const densityPresetSelect = document.getElementById('densityPreset');
    const manualMinInput = document.getElementById('manualMin');
    const manualMaxInput = document.getElementById('manualMax');
    const profileSelect = document.getElementById('generationProfile');
    const weightedToggle = document.getElementById('realisticPlanetWeightsToggle');

    return {
        sizeMode: state.sizeMode || 'preset',
        sizePreset: sizePresetSelect ? sizePresetSelect.value : 'standard',
        width: parseInt(document.getElementById('gridWidth')?.value || '8', 10),
        height: parseInt(document.getElementById('gridHeight')?.value || '10', 10),
        densityMode: state.densityMode || 'preset',
        densityPreset: densityPresetSelect ? parseFloat(densityPresetSelect.value) : 0.2,
        manualMin: manualMinInput ? parseInt(manualMinInput.value, 10) : 0,
        manualMax: manualMaxInput ? parseInt(manualMaxInput.value, 10) : 0,
        generationProfile: profileSelect ? profileSelect.value : 'cinematic',
        realisticPlanetWeights: !!(weightedToggle && weightedToggle.checked)
    };
}

function normalizeGenerationConfig(config) {
    const source = config || {};
    const sizeMode = source.sizeMode === 'custom' ? 'custom' : 'preset';
    const presetKey = source.sizePreset && GRID_PRESETS[source.sizePreset] ? source.sizePreset : 'standard';

    let width = parseInt(source.width, 10);
    let height = parseInt(source.height, 10);
    if (sizeMode === 'preset') {
        width = GRID_PRESETS[presetKey].width;
        height = GRID_PRESETS[presetKey].height;
    }
    if (!Number.isFinite(width) || width < 1) width = GRID_PRESETS.standard.width;
    if (!Number.isFinite(height) || height < 1) height = GRID_PRESETS.standard.height;

    const densityMode = source.densityMode === 'manual' ? 'manual' : 'preset';
    let densityPreset = parseFloat(source.densityPreset);
    if (!Number.isFinite(densityPreset)) densityPreset = 0.2;
    densityPreset = Math.min(Math.max(densityPreset, 0), 1);

    let manualMin = parseInt(source.manualMin, 10);
    let manualMax = parseInt(source.manualMax, 10);
    if (!Number.isFinite(manualMin) || manualMin < 0) manualMin = 0;
    if (!Number.isFinite(manualMax) || manualMax < 0) manualMax = 0;

    const generationProfile = GENERATION_PROFILES[source.generationProfile] ? source.generationProfile : 'cinematic';

    return {
        sizeMode,
        sizePreset: presetKey,
        width,
        height,
        densityMode,
        densityPreset,
        manualMin,
        manualMax,
        generationProfile,
        realisticPlanetWeights: !!source.realisticPlanetWeights
    };
}

function getGenerationConfigSnapshot() {
    if (state.sectorConfigSnapshot) return normalizeGenerationConfig(state.sectorConfigSnapshot);
    if (state.lastSectorSnapshot && state.lastSectorSnapshot.sectorConfigSnapshot) {
        return normalizeGenerationConfig(state.lastSectorSnapshot.sectorConfigSnapshot);
    }
    return normalizeGenerationConfig(readGenerationConfigFromUi());
}

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

function getActiveGenerationProfile(profileKey) {
    return GENERATION_PROFILES[profileKey] || GENERATION_PROFILES.cinematic;
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

function generateNameCandidate() {
    const p1 = NAME_PREFIX[Math.floor(rand() * NAME_PREFIX.length)];
    const p2 = NAME_SUFFIX[Math.floor(rand() * NAME_SUFFIX.length)];
    const num = Math.floor(rand() * 999) + 1;
    return rand() > 0.5 ? `${p1}-${num}` : `${p1} ${p2}`;
}

function parseCoordId(coordId) {
    const [cRaw, rRaw] = String(coordId || '').split('-');
    return { c: parseInt(cRaw, 10), r: parseInt(rRaw, 10) };
}

function areCoordsAdjacent(coordA, coordB) {
    const a = parseCoordId(coordA);
    const b = parseCoordId(coordB);
    if (!Number.isInteger(a.c) || !Number.isInteger(a.r) || !Number.isInteger(b.c) || !Number.isInteger(b.r)) {
        return false;
    }
    const dc = Math.abs(a.c - b.c);
    const dr = Math.abs(a.r - b.r);
    return (dc <= 1 && dr <= 1) && !(dc === 0 && dr === 0);
}

function hasAdjacentDuplicateName(coordId, name, sectorsByCoord) {
    return Object.entries(sectorsByCoord || {}).some(([otherCoord, system]) =>
        !!system && system.name === name && areCoordsAdjacent(coordId, otherCoord)
    );
}

function generateSystemName(coordId, usedNames, sectorsByCoord) {
    const MAX_ATTEMPTS = 400;
    const registry = usedNames || new Set();

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const candidate = generateNameCandidate();
        if (!registry.has(candidate)) {
            registry.add(candidate);
            return candidate;
        }
        if (
            hasAdjacentDuplicateName(coordId, candidate, sectorsByCoord) &&
            rand() < ADJACENT_DUPLICATE_NAME_CHANCE
        ) {
            return candidate;
        }
    }

    let fallback = `${generateNameCandidate()}-${Math.floor(rand() * 900) + 100}`;
    while (registry.has(fallback)) {
        fallback = `${generateNameCandidate()}-${Math.floor(rand() * 900) + 100}`;
    }
    registry.add(fallback);
    return fallback;
}

function computeSystemCount(totalHexes, config) {
    if (config.densityMode === 'preset') {
        return Math.floor(totalHexes * config.densityPreset);
    }

    let min = config.manualMin;
    let max = config.manualMax;
    if (min < 0) min = 0;
    if (max > totalHexes) max = totalHexes;
    if (min > max) {
        const temp = min;
        min = max;
        max = temp;
    }
    return Math.floor(rand() * (max - min + 1)) + min;
}

function refreshSectorSnapshot(config, width, height) {
    const totalHexes = width * height;
    const systemCount = Object.keys(state.sectors).length;
    state.sectorConfigSnapshot = normalizeGenerationConfig(config);
    state.lastSectorSnapshot = buildSectorPayload({ width, height, totalHexes, systemCount });
    autoSaveSectorState();
}

function updateSectorStatus(totalHexes, systemCount) {
    document.getElementById('statusTotalHexes').innerText = `${totalHexes} Hexes`;
    document.getElementById('statusTotalSystems').innerText = `${systemCount} Systems`;
}

function setAndUseNewSeed(updateInput = true) {
    const seed = generateSeedString();
    if (updateInput) {
        const input = document.getElementById('seedInput');
        if (input) input.value = seed;
    }
    setSeed(seed);
    return seed;
}

function buildSectorFromConfig(config, fixedSystems = {}) {
    const normalized = normalizeGenerationConfig(config);
    const width = normalized.width;
    const height = normalized.height;
    const totalHexes = width * height;

    const validFixedEntries = Object.entries(fixedSystems)
        .filter(([hexId, system]) => !!system && isHexIdInBounds(hexId, width, height));

    const allCoords = [];
    for (let c = 0; c < width; c++) {
        for (let r = 0; r < height; r++) {
            allCoords.push(`${c}-${r}`);
        }
    }

    const fixedHexIds = new Set(validFixedEntries.map(([hexId]) => hexId));
    const candidateCoords = allCoords.filter(hexId => !fixedHexIds.has(hexId));

    let systemCount = computeSystemCount(totalHexes, normalized);
    if (validFixedEntries.length > systemCount) {
        systemCount = validFixedEntries.length;
    }

    shuffleArray(candidateCoords, rand);

    const nextSectors = {};
    validFixedEntries.forEach(([hexId, system]) => {
        nextSectors[hexId] = deepClone(system);
    });
    const usedNames = new Set(
        Object.values(nextSectors)
            .map(system => (system && system.name ? system.name : null))
            .filter(Boolean)
    );

    const systemsToGenerate = Math.max(0, systemCount - validFixedEntries.length);
    candidateCoords.slice(0, systemsToGenerate).forEach(hexId => {
        nextSectors[hexId] = generateSystemData(normalized, {
            coordId: hexId,
            usedNames,
            sectorsByCoord: nextSectors
        });
    });

    return {
        config: normalized,
        width,
        height,
        totalHexes,
        systemCount: Object.keys(nextSectors).length,
        sectors: nextSectors
    };
}

function sanitizePinnedHexes(width, height) {
    state.pinnedHexIds = (state.pinnedHexIds || []).filter(hexId => isHexIdInBounds(hexId, width, height) && !!state.sectors[hexId]);
}

function reselectionAfterDraw(selectedHexId) {
    if (!selectedHexId || !state.sectors[selectedHexId]) {
        state.selectedHexId = null;
        clearInfoPanel();
        return;
    }
    const group = document.querySelector(`.hex-group[data-id="${selectedHexId}"]`);
    if (group) {
        selectHex(selectedHexId, group);
    } else {
        state.selectedHexId = null;
        clearInfoPanel();
    }
}

export function generateSector() {
    if (isAutoSeedEnabled()) {
        const input = document.getElementById('seedInput');
        if (input) input.value = generateSeedString();
    }

    const input = document.getElementById('seedInput');
    let seedUsed = '';
    if (input && (input.value || '').trim()) {
        setSeed((input.value || '').trim());
        seedUsed = (input.value || '').trim();
    } else {
        seedUsed = setAndUseNewSeed();
    }

    const config = normalizeGenerationConfig(readGenerationConfigFromUi());
    const built = buildSectorFromConfig(config, {});

    state.sectors = built.sectors;
    state.pinnedHexIds = [];
    state.selectedHexId = null;
    clearInfoPanel();

    drawGrid(built.width, built.height);
    updateSectorStatus(built.totalHexes, built.systemCount);
    refreshSectorSnapshot(config, built.width, built.height);
    showStatusMessage(seedUsed ? `Generated seed ${seedUsed}` : 'Sector regenerated.', 'info');
}

export function generateSystemData(config = null, context = null) {
    const normalized = normalizeGenerationConfig(config || getGenerationConfigSnapshot());
    const generationProfile = getActiveGenerationProfile(normalized.generationProfile);
    const coordId = context && context.coordId ? context.coordId : null;
    const usedNames = context && context.usedNames ? context.usedNames : new Set();
    const sectorsByCoord = context && context.sectorsByCoord ? context.sectorsByCoord : state.sectors;
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

    const name = generateSystemName(coordId, usedNames, sectorsByCoord);

    const planetCount = Math.floor(rand() * 6) + 1;
    const planets = [];
    let population = 0;
    let hasTerrestrial = false;
    const starAge = generateStarAge(sClass);

    const useWeightedTypes = normalized.realisticPlanetWeights;
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

export function rerollSelectedSystem() {
    const selectedHexId = state.selectedHexId;
    if (!selectedHexId || !state.sectors[selectedHexId]) {
        showStatusMessage('Select an existing system before rerolling.', 'warn');
        return;
    }

    const config = getGenerationConfigSnapshot();
    const seedUsed = setAndUseNewSeed(false);
    const otherSystems = { ...state.sectors };
    delete otherSystems[selectedHexId];
    const usedNames = new Set(
        Object.values(otherSystems)
            .map(system => (system && system.name ? system.name : null))
            .filter(Boolean)
    );
    state.sectors[selectedHexId] = generateSystemData(config, {
        coordId: selectedHexId,
        usedNames,
        sectorsByCoord: otherSystems
    });

    drawGrid(config.width, config.height, { resetView: false });
    reselectionAfterDraw(selectedHexId);
    sanitizePinnedHexes(config.width, config.height);
    refreshSectorSnapshot(config, config.width, config.height);
    showStatusMessage(`Rerolled system ${selectedHexId} with seed ${seedUsed}.`, 'success');
}

export function togglePinSelectedSystem() {
    const selectedHexId = state.selectedHexId;
    if (!selectedHexId || !state.sectors[selectedHexId]) {
        showStatusMessage('Select a populated system to pin.', 'warn');
        return;
    }

    const pinned = new Set(state.pinnedHexIds || []);
    if (pinned.has(selectedHexId)) {
        pinned.delete(selectedHexId);
        showStatusMessage(`Unpinned system ${selectedHexId}.`, 'info');
    } else {
        pinned.add(selectedHexId);
        showStatusMessage(`Pinned system ${selectedHexId}.`, 'success');
    }

    state.pinnedHexIds = Array.from(pinned);

    const group = document.querySelector(`.hex-group[data-id="${selectedHexId}"]`);
    const poly = group ? group.querySelector('polygon.hex') : null;
    if (poly) {
        poly.classList.toggle('pinned', state.pinnedHexIds.includes(selectedHexId));
    }

    updateInfoPanel(selectedHexId);
    const config = getGenerationConfigSnapshot();
    refreshSectorSnapshot(config, config.width, config.height);
}

export function rerollUnpinnedSystems() {
    if (!Object.keys(state.sectors || {}).length) {
        showStatusMessage('Generate a sector before rerolling.', 'warn');
        return;
    }

    const config = getGenerationConfigSnapshot();
    const width = config.width;
    const height = config.height;

    const fixedSystems = {};
    (state.pinnedHexIds || []).forEach(hexId => {
        if (isHexIdInBounds(hexId, width, height) && state.sectors[hexId]) {
            fixedSystems[hexId] = state.sectors[hexId];
        }
    });

    const seedUsed = setAndUseNewSeed(false);
    const built = buildSectorFromConfig(config, fixedSystems);
    const selectedHexId = state.selectedHexId;

    state.sectors = built.sectors;
    sanitizePinnedHexes(built.width, built.height);

    drawGrid(built.width, built.height, { resetView: false });
    reselectionAfterDraw(selectedHexId);
    updateSectorStatus(built.totalHexes, built.systemCount);
    refreshSectorSnapshot(config, built.width, built.height);
    showStatusMessage(`Rerolled unpinned systems with seed ${seedUsed}.`, 'success');
}
