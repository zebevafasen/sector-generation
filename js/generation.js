import {
    GRID_PRESETS,
    NAME_PREFIX,
    NAME_SUFFIX,
    PLANET_TYPES,
    POI_TYPES,
    STAR_VISUALS,
    state
} from './config.js';
import {
    ADJACENT_DUPLICATE_NAME_CHANCE,
    BASE_HABITABILITY_TYPE_WEIGHT,
    GENERATION_PROFILES,
    HABITABLE_PLANET_TYPES,
    HABITABLE_WORLD_SUFFIXES,
    STAR_CLASS_PLANET_WEIGHTS
} from './generation-data.js';
import { EVENTS, emitEvent } from './events.js';
import { reportSystemInvariantIssues } from './invariants.js';
import { generateStarAge, generateSeedString, isAutoSeedEnabled, rand, setSeed, showStatusMessage } from './core.js';
import { autoSaveSectorState, buildSectorPayload } from './storage.js';
import { redrawGridAndReselect, refreshHexInfo, clearSelectionInfo } from './ui-sync.js';
import { romanize, shuffleArray } from './utils.js';

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

function pickWeightedLabel(candidates) {
    const total = candidates.reduce((sum, item) => sum + item.weight, 0);
    let roll = rand() * total;
    for (const item of candidates) {
        roll -= item.weight;
        if (roll <= 0) return item.label;
    }
    return candidates[candidates.length - 1].label;
}

function generatePlanetSize(type) {
    if (type === 'Gas Giant') {
        return pickWeightedLabel([
            { label: 'Large', weight: 0.35 },
            { label: 'Huge', weight: 0.55 },
            { label: 'Massive', weight: 0.10 }
        ]);
    }
    return pickWeightedLabel([
        { label: 'Tiny', weight: 0.12 },
        { label: 'Small', weight: 0.30 },
        { label: 'Medium', weight: 0.36 },
        { label: 'Large', weight: 0.18 },
        { label: 'Huge', weight: 0.04 }
    ]);
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

function getUniqueHabitableSuffixes(count) {
    const pool = [...HABITABLE_WORLD_SUFFIXES];
    shuffleArray(pool, rand);
    const picked = [];
    for (let i = 0; i < count; i++) {
        if (i < pool.length) {
            picked.push(pool[i]);
        } else {
            picked.push(`Colony ${i - pool.length + 1}`);
        }
    }
    return picked;
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

function isPlanetaryBody(body) {
    return !!body && body.type !== 'Artificial' && !/belt|field/i.test(body.type);
}

function applyPlanetaryOrderAndNames(systemName, bodies) {
    const planetary = bodies.filter(isPlanetaryBody);
    const nonPlanetary = bodies.filter(body => !isPlanetaryBody(body));
    if (!planetary.length) return nonPlanetary;

    let primary = planetary.find(body => body.habitable);
    if (!primary) {
        primary = planetary[0];
        primary.habitable = true;
    }

    const orderedPlanetary = [primary, ...planetary.filter(body => body !== primary)];
    const secondaryHabitable = orderedPlanetary.filter((body, index) => index > 0 && body.habitable);
    const inhabitedSuffixes = getUniqueHabitableSuffixes(secondaryHabitable.length);
    let nonHabitableNumeral = 1;
    let inhabitedSuffixIndex = 0;

    orderedPlanetary.forEach((planet, index) => {
        if (index === 0) {
            planet.habitable = true;
            planet.name = `${systemName} Prime`;
            return;
        }
        if (planet.habitable) {
            planet.name = `${systemName} ${inhabitedSuffixes[inhabitedSuffixIndex]}`;
            inhabitedSuffixIndex++;
            return;
        }
        planet.name = `${systemName} ${romanize(nonHabitableNumeral)}`;
        nonHabitableNumeral++;
    });

    return [...orderedPlanetary, ...nonPlanetary];
}

function reconcilePlanetaryBodies(system) {
    if (!system || !Array.isArray(system.planets)) return;
    system.planets = applyPlanetaryOrderAndNames(system.name, system.planets);
    reportSystemInvariantIssues(system, 'reconcile');
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
    clearSelectionInfo();

    redrawGridAndReselect(built.width, built.height, { resetView: true });
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
            size: generatePlanetSize(type),
            features,
            pop,
            habitable: false
        });
    }

    assignSystemHabitability(planets, generationProfile);
    const normalizedPlanetaryBodies = applyPlanetaryOrderAndNames(name, planets);
    planets.length = 0;
    planets.push(...normalizedPlanetaryBodies);

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
    const generatedSystem = {
        name,
        starClass: sClass,
        color: visuals.core,
        glow: visuals.halo,
        palette: visuals,
        starAge,
        planets,
        totalPop: population > 0 ? `${population} Billion` : 'None'
    };
    reportSystemInvariantIssues(generatedSystem, 'generate');
    return generatedSystem;
}

function notifyEditModeChanged() {
    emitEvent(EVENTS.EDIT_MODE_CHANGED);
}

export function setEditMode(enabled) {
    state.editMode = !!enabled;
    state.selectedBodyIndex = null;
    notifyEditModeChanged();
}

export function toggleEditMode() {
    setEditMode(!state.editMode);
    showStatusMessage(state.editMode ? 'Edit mode enabled.' : 'Edit mode disabled.', 'info');
}

export function addSystemAtHex(hexId) {
    const config = getGenerationConfigSnapshot();
    if (!isHexIdInBounds(hexId, config.width, config.height)) return;
    if (state.sectors[hexId]) return;

    const usedNames = new Set(
        Object.values(state.sectors)
            .map(system => (system && system.name ? system.name : null))
            .filter(Boolean)
    );
    state.sectors[hexId] = generateSystemData(config, {
        coordId: hexId,
        usedNames,
        sectorsByCoord: state.sectors
    });
    reportSystemInvariantIssues(state.sectors[hexId], 'add-system');

    redrawGridAndReselect(config.width, config.height, { selectedHexId: hexId });
    sanitizePinnedHexes(config.width, config.height);
    refreshSectorSnapshot(config, config.width, config.height);
    updateSectorStatus(config.width * config.height, Object.keys(state.sectors).length);
    showStatusMessage(`Added system at ${hexId}.`, 'success');
}

export function deleteSelectedSystem() {
    const selectedHexId = state.selectedHexId;
    if (!selectedHexId || !state.sectors[selectedHexId]) {
        showStatusMessage('Select a system to delete.', 'warn');
        return;
    }

    const config = getGenerationConfigSnapshot();
    delete state.sectors[selectedHexId];
    state.pinnedHexIds = (state.pinnedHexIds || []).filter(id => id !== selectedHexId);
    state.selectedHexId = null;
    state.selectedBodyIndex = null;

    redrawGridAndReselect(config.width, config.height);
    sanitizePinnedHexes(config.width, config.height);
    refreshSectorSnapshot(config, config.width, config.height);
    updateSectorStatus(config.width * config.height, Object.keys(state.sectors).length);
    showStatusMessage(`Deleted system ${selectedHexId}.`, 'success');
}

export function addBodyToSelectedSystem(kind) {
    const selectedHexId = state.selectedHexId;
    const system = selectedHexId ? state.sectors[selectedHexId] : null;
    if (!system) {
        showStatusMessage('Select a system first.', 'warn');
        return;
    }

    if (kind === 'planet') {
        const hasTerrestrial = system.planets.some(body => isPlanetaryBody(body) && body.type === 'Terrestrial');
        const excluded = hasTerrestrial ? new Set(['Terrestrial']) : new Set();
        const type = pickRandomPlanetType(excluded);
        system.planets.push({
            name: `${system.name} ${romanize(1)}`,
            type,
            size: generatePlanetSize(type),
            features: [],
            pop: 0,
            habitable: false
        });
        reconcilePlanetaryBodies(system);
    } else if (kind === 'belt') {
        const existing = system.planets.filter(body => /belt|field/i.test(body.type)).length;
        system.planets.push({
            name: `${system.name} Belt ${romanize(existing + 1)}`,
            type: rand() > 0.6 ? 'Debris Field' : 'Asteroid Belt',
            features: [],
            pop: 0
        });
    } else if (kind === 'station') {
        const existing = system.planets.filter(body => body.type === 'Artificial').length;
        system.planets.push({
            name: `Station ${system.name} ${romanize(existing + 1)}`,
            type: 'Artificial',
            features: [],
            pop: 0
        });
    } else {
        return;
    }

    state.selectedBodyIndex = null;
    refreshHexInfo(selectedHexId);
    reportSystemInvariantIssues(system, 'add-body');
    const config = getGenerationConfigSnapshot();
    refreshSectorSnapshot(config, config.width, config.height);
    showStatusMessage('Added new object.', 'success');
}

export function deleteSelectedBody() {
    const selectedHexId = state.selectedHexId;
    const system = selectedHexId ? state.sectors[selectedHexId] : null;
    if (!system) {
        showStatusMessage('Select a system first.', 'warn');
        return;
    }
    if (!Number.isInteger(state.selectedBodyIndex) || state.selectedBodyIndex < 0 || state.selectedBodyIndex >= system.planets.length) {
        showStatusMessage('Select an object to delete.', 'warn');
        return;
    }

    const [removed] = system.planets.splice(state.selectedBodyIndex, 1);
    state.selectedBodyIndex = null;
    if (removed && isPlanetaryBody(removed)) {
        reconcilePlanetaryBodies(system);
    }

    refreshHexInfo(selectedHexId);
    reportSystemInvariantIssues(system, 'delete-body');
    const config = getGenerationConfigSnapshot();
    refreshSectorSnapshot(config, config.width, config.height);
    showStatusMessage('Deleted selected object.', 'success');
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
    reportSystemInvariantIssues(state.sectors[selectedHexId], 'reroll-selected');

    redrawGridAndReselect(config.width, config.height, { selectedHexId });
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

    refreshHexInfo(selectedHexId);
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

    redrawGridAndReselect(built.width, built.height, { selectedHexId });
    updateSectorStatus(built.totalHexes, built.systemCount);
    refreshSectorSnapshot(config, built.width, built.height);
    showStatusMessage(`Rerolled unpinned systems with seed ${seedUsed}.`, 'success');
}
