import {
    GRID_PRESETS,
    NAME_PREFIX,
    NAME_SUFFIX,
    POI_TYPES,
    STAR_VISUALS,
    state
} from './config.js';
import {
    ADJACENT_DUPLICATE_NAME_CHANCE,
    GENERATION_PROFILES
} from './generation-data.js';
import { EVENTS, emitEvent } from './events.js';
import { reportSystemInvariantIssues } from './invariants.js';
import { generateStarAge, generateSeedString, isAutoSeedEnabled, rand, setRandomStream, setSeed, showStatusMessage } from './core.js';
import { isArtificialBodyType, isBeltOrFieldBodyType } from './body-classification.js';
import { generatePlanetEnvironment } from './planet-environment.js';
import { refreshSystemPlanetPopulation } from './planet-population.js';
import { refreshSystemPlanetTags } from './planet-tags.js';
import {
    applyPlanetaryOrderAndNames,
    assignSystemHabitability,
    generatePlanetSize,
    isHabitableCandidateType,
    isPlanetaryBody,
    pickPlanetTypeForStarClass,
    pickRandomPlanetType
} from './planetary-rules.js';
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
    const totalHexes = width * height;
    manualMin = Math.min(manualMin, totalHexes);
    manualMax = Math.min(manualMax, totalHexes);
    if (manualMin > manualMax) {
        const temp = manualMin;
        manualMin = manualMax;
        manualMax = temp;
    }

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

function getActiveGenerationProfile(profileKey) {
    return GENERATION_PROFILES[profileKey] || GENERATION_PROFILES.cinematic;
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
    if (min > totalHexes) min = totalHexes;
    if (max > totalHexes) max = totalHexes;
    if (min > max) {
        const temp = min;
        min = max;
        max = temp;
    }
    return Math.floor(rand() * (max - min + 1)) + min;
}

function refreshSectorSnapshot(config, width, height, changeLabel = 'Update Sector') {
    const totalHexes = width * height;
    const systemCount = Object.keys(state.sectors).length;
    state.sectorConfigSnapshot = normalizeGenerationConfig(config);
    state.lastSectorSnapshot = buildSectorPayload({ width, height, totalHexes, systemCount });
    autoSaveSectorState();
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: changeLabel });
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

function composeContentSeed(layoutSeed, iteration) {
    return `${layoutSeed}::content:${iteration}`;
}

function sortHexIds(hexIds) {
    return [...hexIds].sort((a, b) => {
        const [acRaw, arRaw] = String(a).split('-');
        const [bcRaw, brRaw] = String(b).split('-');
        const ac = parseInt(acRaw, 10);
        const ar = parseInt(arRaw, 10);
        const bc = parseInt(bcRaw, 10);
        const br = parseInt(brRaw, 10);
        if (ac !== bc) return ac - bc;
        return ar - br;
    });
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

function reconcilePlanetaryBodies(system) {
    if (!system || !Array.isArray(system.planets)) return;
    system.planets = applyPlanetaryOrderAndNames(system.name, system.planets, rand);
    refreshSystemPlanetPopulation(system, { randomFn: rand });
    refreshSystemPlanetTags(system, { randomFn: rand });
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
    state.layoutSeed = seedUsed;
    state.rerollIteration = 0;
    const built = buildSectorFromConfig(config, {});

    state.sectors = built.sectors;
    state.pinnedHexIds = [];
    state.selectedHexId = null;
    state.multiSector = {
        currentKey: '0,0',
        sectorsByKey: {
            '0,0': {
                seed: seedUsed,
                config: deepClone(config),
                sectors: deepClone(built.sectors),
                pinnedHexIds: [],
                totalHexes: built.totalHexes,
                systemCount: built.systemCount
            }
        }
    };
    clearSelectionInfo();

    redrawGridAndReselect(built.width, built.height, { resetView: true });
    updateSectorStatus(built.totalHexes, built.systemCount);
    refreshSectorSnapshot(config, built.width, built.height, 'Generate Sector');
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
    let hasTerrestrial = false;
    const starAge = generateStarAge(sClass);

    const useWeightedTypes = normalized.realisticPlanetWeights;
    for (let i = 0; i < planetCount; i++) {
        const excludedTypes = hasTerrestrial ? new Set(['Terrestrial']) : new Set();
        const type = useWeightedTypes
            ? pickPlanetTypeForStarClass(sClass, rand, excludedTypes)
            : pickRandomPlanetType(rand, excludedTypes);
        if (type === 'Terrestrial') hasTerrestrial = true;
        const environment = generatePlanetEnvironment(type, rand);
        const features = [];

        if (rand() < generationProfile.planetPoiChance) {
            const poi = POI_TYPES[Math.floor(rand() * POI_TYPES.length)];
            features.push(poi);
        }

        planets.push({
            name: `${name} ${romanize(i + 1)}`,
            type,
            size: generatePlanetSize(type, rand),
            atmosphere: environment.atmosphere,
            temperature: environment.temperature,
            features,
            pop: 0,
            basePop: 0,
            tags: [],
            habitable: false
        });
    }

    assignSystemHabitability(planets, generationProfile, rand);
    const normalizedPlanetaryBodies = applyPlanetaryOrderAndNames(name, planets, rand);
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
        totalPop: 'None'
    };
    refreshSystemPlanetPopulation(generatedSystem, { forceRecalculate: true, randomFn: rand });
    refreshSystemPlanetTags(generatedSystem, { forceRecalculate: true, randomFn: rand });
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
    refreshSectorSnapshot(config, config.width, config.height, 'Add System');
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
    refreshSectorSnapshot(config, config.width, config.height, 'Delete System');
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
        const type = pickRandomPlanetType(rand, excluded);
        const environment = generatePlanetEnvironment(type, rand);
        system.planets.push({
            name: `${system.name} ${romanize(1)}`,
            type,
            size: generatePlanetSize(type, rand),
            atmosphere: environment.atmosphere,
            temperature: environment.temperature,
            features: [],
            pop: 0,
            basePop: 0,
            tags: [],
            habitable: false
        });
        reconcilePlanetaryBodies(system);
    } else if (kind === 'belt') {
        const existing = system.planets.filter(body => isBeltOrFieldBodyType(body.type)).length;
        system.planets.push({
            name: `${system.name} Belt ${romanize(existing + 1)}`,
            type: rand() > 0.6 ? 'Debris Field' : 'Asteroid Belt',
            features: [],
            pop: 0
        });
    } else if (kind === 'station') {
        const existing = system.planets.filter(body => isArtificialBodyType(body.type)).length;
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
    refreshSectorSnapshot(config, config.width, config.height, 'Add Object');
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
    refreshSectorSnapshot(config, config.width, config.height, 'Delete Object');
    showStatusMessage('Deleted selected object.', 'success');
}

export function rerollSelectedPlanet() {
    const selectedHexId = state.selectedHexId;
    const system = selectedHexId ? state.sectors[selectedHexId] : null;
    if (!system) {
        showStatusMessage('Select a system first.', 'warn');
        return;
    }
    if (!Number.isInteger(state.selectedBodyIndex) || state.selectedBodyIndex < 0 || state.selectedBodyIndex >= system.planets.length) {
        showStatusMessage('Select a planet to reroll.', 'warn');
        return;
    }

    const targetPlanet = system.planets[state.selectedBodyIndex];
    if (!isPlanetaryBody(targetPlanet)) {
        showStatusMessage('Only planets can be rerolled.', 'warn');
        return;
    }

    const config = getGenerationConfigSnapshot();
    const hasOtherTerrestrial = system.planets.some((body, idx) =>
        idx !== state.selectedBodyIndex && isPlanetaryBody(body) && body.type === 'Terrestrial'
    );
    const excludedTypes = hasOtherTerrestrial ? new Set(['Terrestrial']) : new Set();
    const nextType = config.realisticPlanetWeights
        ? pickPlanetTypeForStarClass(system.starClass, rand, excludedTypes)
        : pickRandomPlanetType(rand, excludedTypes);
    const nextEnvironment = generatePlanetEnvironment(nextType, rand);

    const wasHabitable = !!targetPlanet.habitable;
    targetPlanet.type = nextType;
    targetPlanet.size = generatePlanetSize(nextType, rand);
    targetPlanet.atmosphere = nextEnvironment.atmosphere;
    targetPlanet.temperature = nextEnvironment.temperature;
    targetPlanet.features = [];
    targetPlanet.pop = 0;
    targetPlanet.basePop = 0;
    targetPlanet.tags = [];
    targetPlanet.habitable = wasHabitable && isHabitableCandidateType(nextType);

    const planetaryBodies = system.planets.filter(isPlanetaryBody);
    const hasAnyHabitable = planetaryBodies.some(planet => !!planet.habitable);
    if (!hasAnyHabitable) {
        const fallbackCandidate = planetaryBodies.find(planet => isHabitableCandidateType(planet.type));
        if (fallbackCandidate) {
            fallbackCandidate.habitable = true;
        } else {
            targetPlanet.type = 'Terrestrial';
            targetPlanet.size = generatePlanetSize('Terrestrial', rand);
            const fallbackEnvironment = generatePlanetEnvironment('Terrestrial', rand);
            targetPlanet.atmosphere = fallbackEnvironment.atmosphere;
            targetPlanet.temperature = fallbackEnvironment.temperature;
            targetPlanet.habitable = true;
        }
    }
    reconcilePlanetaryBodies(system);

    const updatedIndex = system.planets.indexOf(targetPlanet);
    state.selectedBodyIndex = updatedIndex >= 0 ? updatedIndex : null;
    refreshHexInfo(selectedHexId, state.selectedBodyIndex);
    reportSystemInvariantIssues(system, 'reroll-planet');
    refreshSectorSnapshot(config, config.width, config.height, 'Reroll Planet');
    showStatusMessage('Rerolled selected planet.', 'success');
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
    refreshSectorSnapshot(config, config.width, config.height, 'Reroll System');
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
    refreshSectorSnapshot(config, config.width, config.height, 'Toggle Pin');
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

    const layoutSeed = state.layoutSeed || state.currentSeed || setAndUseNewSeed(false);
    const nextIteration = (parseInt(state.rerollIteration, 10) || 0) + 1;
    const contentSeed = composeContentSeed(layoutSeed, nextIteration);
    setRandomStream(contentSeed);

    const nextSectors = {};
    Object.entries(fixedSystems).forEach(([hexId, system]) => {
        nextSectors[hexId] = deepClone(system);
    });
    const usedNames = new Set(
        Object.values(nextSectors)
            .map(system => (system && system.name ? system.name : null))
            .filter(Boolean)
    );
    const targetHexIds = sortHexIds(Object.keys(state.sectors || {}));
    targetHexIds.forEach((hexId) => {
        if (nextSectors[hexId]) return;
        nextSectors[hexId] = generateSystemData(config, {
            coordId: hexId,
            usedNames,
            sectorsByCoord: nextSectors
        });
        reportSystemInvariantIssues(nextSectors[hexId], 'reroll-unpinned');
    });
    const selectedHexId = state.selectedHexId;

    state.layoutSeed = layoutSeed;
    state.rerollIteration = nextIteration;
    state.currentSeed = layoutSeed;
    state.sectors = nextSectors;
    sanitizePinnedHexes(width, height);

    redrawGridAndReselect(width, height, { selectedHexId });
    updateSectorStatus(width * height, Object.keys(nextSectors).length);
    refreshSectorSnapshot(config, width, height, 'Reroll Unpinned');
    showStatusMessage(`Rerolled unpinned systems (layout seed ${layoutSeed}, pass ${nextIteration}).`, 'success');
}

export function createSectorRecord(options = {}) {
    const config = normalizeGenerationConfig(options.config || getGenerationConfigSnapshot());
    const fixedSystems = options && options.fixedSystems ? options.fixedSystems : {};
    const requestedSeed = options && options.seed ? String(options.seed).trim() : '';
    const seed = requestedSeed || generateSeedString();

    const previousSeed = state.currentSeed;
    const previousRandom = state.seededRandomFn;
    setSeed(seed);
    const built = buildSectorFromConfig(config, fixedSystems);
    state.currentSeed = previousSeed;
    state.seededRandomFn = previousRandom;

    return {
        seed,
        config,
        sectors: deepClone(built.sectors),
        pinnedHexIds: [],
        totalHexes: built.totalHexes,
        systemCount: built.systemCount
    };
}
