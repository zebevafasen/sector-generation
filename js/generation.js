import {
    STAR_VISUALS,
    state
} from './config.js';
import { EVENTS, emitEvent } from './events.js';
import { reportSystemInvariantIssues } from './invariants.js';
import { generateSeedString, isAutoSeedEnabled, rand, setRandomStream, setSeed, showStatusMessage } from './core.js';
import { isPlanetaryBody } from './body-classification.js';
import { generatePlanetEnvironment } from './planet-environment.js';
import { refreshSystemPlanetPopulation } from './planet-population.js';
import { refreshSystemPlanetTags } from './planet-tags.js';
import {
    applyPlanetaryOrderAndNames,
    assignSystemHabitability,
    generatePlanetSize,
    isHabitableCandidateType,
    pickPlanetTypeForStarClass,
    pickRandomPlanetType
} from './planetary-rules.js';
import { autoSaveSectorState, buildSectorPayload } from './storage.js';
import { readGenerationConfigFromUi } from './sector-config.js';
import { getGlobalHexDisplayId } from './render-shared.js';
import { HOME_SECTOR_KEY } from './sector-address.js';
import { ensureSystemStarFields } from './star-system.js';
import { redrawGridAndReselect, redrawHexAndReselect, redrawHexAndSelectHex, refreshHexInfo, clearSelectionInfo } from './ui-sync.js';
import { deepClone, isHexIdInBounds, romanize, shuffleArray, sortHexIds } from './utils.js';
import { computeSystemCount, getActiveGenerationProfile, getGenerationConfigSnapshot, normalizeGenerationConfig } from './generation-config.js';
import { createDeepSpacePoi, generateDeepSpacePois, getActiveJumpGateSectorWeightMultiplier } from './generation-poi.js';
import { selectClusteredSystemCoords } from './generation-spatial.js';
import { generateSystemName, generateSystemStars } from './generation-system.js';
import {
    addBodyToSelectedSystemAction,
    addPoiAtHexAction,
    addSystemAtHexAction,
    deletePoiAtHexAction,
    deleteSelectedBodyAction,
    deleteSelectedSystemAction,
    renamePoiAtHexAction
} from './generation-actions.js';

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

function buildSectorFromConfig(config, fixedSystems = {}, options = {}) {
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
    const generatedCoords = normalized.starDistribution === 'clusters'
        ? selectClusteredSystemCoords(candidateCoords, systemsToGenerate, rand)
        : candidateCoords.slice(0, systemsToGenerate);

    generatedCoords.forEach(hexId => {
        nextSectors[hexId] = generateSystemData(normalized, {
            coordId: hexId,
            usedNames,
            sectorsByCoord: nextSectors
        });
    });
    const activeJumpGateWeightMultiplier = getActiveJumpGateSectorWeightMultiplier(
        options.sectorKey || HOME_SECTOR_KEY,
        options.knownSectorRecords || {}
    );
    const deepSpacePois = generateDeepSpacePois(width, height, nextSectors, { activeJumpGateWeightMultiplier, randomFn: rand });

    return {
        config: normalized,
        width,
        height,
        totalHexes,
        systemCount: Object.keys(nextSectors).length,
        sectors: nextSectors,
        deepSpacePois
    };
}

function hasPinnedContentAtHex(hexId) {
    return !!(state.sectors && state.sectors[hexId]) || !!(state.deepSpacePois && state.deepSpacePois[hexId]);
}

function sanitizePinnedHexes(width, height) {
    state.pinnedHexIds = (state.pinnedHexIds || []).filter(hexId => isHexIdInBounds(hexId, width, height) && hasPinnedContentAtHex(hexId));
}

function reconcilePlanetaryBodies(system) {
    if (!system || !Array.isArray(system.planets)) return;
    ensureSystemStarFields(system);
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

    const config = normalizeGenerationConfig(readGenerationConfigFromUi({
        sizeMode: state.sizeMode,
        densityMode: state.densityMode
    }));
    state.layoutSeed = seedUsed;
    state.rerollIteration = 0;
    const built = buildSectorFromConfig(config, {}, {
        sectorKey: HOME_SECTOR_KEY,
        knownSectorRecords: {}
    });

    state.sectors = built.sectors;
    state.deepSpacePois = built.deepSpacePois;
    state.pinnedHexIds = [];
    state.selectedHexId = null;
    state.multiSector = {
        currentKey: HOME_SECTOR_KEY,
        selectedSectorKey: HOME_SECTOR_KEY,
        jumpGateRegistry: {},
        expandedView: false,
        sectorsByKey: {
            [HOME_SECTOR_KEY]: {
                seed: seedUsed,
                config: deepClone(config),
                sectors: deepClone(built.sectors),
                deepSpacePois: deepClone(built.deepSpacePois),
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
    const name = generateSystemName(coordId, usedNames, sectorsByCoord, rand);
    const stars = generateSystemStars(normalized.generationProfile, name, rand);
    const primaryStar = stars[0];
    const sClass = primaryStar.class;

    const planetCount = Math.floor(rand() * 6) + 1;
    const planets = [];
    let hasTerrestrial = false;
    const starAge = primaryStar.starAge;

    const useWeightedTypes = normalized.realisticPlanetWeights;
    for (let i = 0; i < planetCount; i++) {
        const excludedTypes = hasTerrestrial ? new Set(['Terrestrial']) : new Set();
        const type = useWeightedTypes
            ? pickPlanetTypeForStarClass(sClass, rand, excludedTypes)
            : pickRandomPlanetType(rand, excludedTypes);
        if (type === 'Terrestrial') hasTerrestrial = true;
        const environment = generatePlanetEnvironment(type, rand);
        planets.push({
            name: `${name} ${romanize(i + 1)}`,
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
        planets.push({
            name: `Station Alpha-${Math.floor(rand() * 99)}`,
            type: 'Artificial',
            features: [],
            pop: 0
        });
    }

    const visuals = STAR_VISUALS[sClass] || STAR_VISUALS.default;
    const generatedSystem = {
        name,
        stars,
        starClass: sClass,
        color: visuals.core,
        glow: visuals.halo,
        palette: visuals,
        starAge,
        planets,
        totalPop: 'None'
    };
    ensureSystemStarFields(generatedSystem);
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

function buildGenerationActionDeps() {
    return {
        state,
        rand,
        showStatusMessage,
        reportSystemInvariantIssues,
        getGenerationConfigSnapshot,
        isHexIdInBounds,
        getGlobalHexDisplayId,
        redrawHexAndReselect,
        redrawHexAndSelectHex,
        refreshHexInfo,
        clearSelectionInfo,
        refreshSectorSnapshot,
        updateSectorStatus,
        sanitizePinnedHexes,
        generateSystemData,
        createDeepSpacePoi,
        isPlanetaryBody,
        pickRandomPlanetType,
        generatePlanetEnvironment,
        generatePlanetSize,
        romanize,
        reconcilePlanetaryBodies
    };
}

export function addSystemAtHex(hexId) {
    addSystemAtHexAction(hexId, buildGenerationActionDeps());
}

export function deleteSelectedSystem() {
    deleteSelectedSystemAction(buildGenerationActionDeps());
}

export function addPoiAtHex(hexId) {
    addPoiAtHexAction(hexId, buildGenerationActionDeps());
}

export function deletePoiAtHex(hexId) {
    deletePoiAtHexAction(hexId, buildGenerationActionDeps());
}

export function renamePoiAtHex(hexId) {
    renamePoiAtHexAction(hexId, buildGenerationActionDeps());
}

export function addBodyToSelectedSystem(kind) {
    addBodyToSelectedSystemAction(kind, buildGenerationActionDeps());
}

export function deleteSelectedBody() {
    deleteSelectedBodyAction(buildGenerationActionDeps());
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
    if (!selectedHexId) {
        showStatusMessage('Select a system or POI before rerolling.', 'warn');
        return;
    }

    const config = getGenerationConfigSnapshot();
    const selectedPoi = state.deepSpacePois && state.deepSpacePois[selectedHexId] ? state.deepSpacePois[selectedHexId] : null;
    if (selectedPoi && !state.sectors[selectedHexId]) {
        state.deepSpacePois[selectedHexId] = createDeepSpacePoi({ randomFn: rand });
        redrawHexAndSelectHex(selectedHexId);
        refreshSectorSnapshot(config, config.width, config.height, 'Reroll POI');
        showStatusMessage(`Rerolled POI at ${getGlobalHexDisplayId(selectedHexId)}.`, 'success');
        return;
    }
    if (!state.sectors[selectedHexId]) {
        showStatusMessage('Select an existing system before rerolling.', 'warn');
        return;
    }

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

    redrawHexAndReselect(selectedHexId);
    sanitizePinnedHexes(config.width, config.height);
    refreshSectorSnapshot(config, config.width, config.height, 'Reroll System');
    showStatusMessage(`Rerolled system ${getGlobalHexDisplayId(selectedHexId)} with seed ${seedUsed}.`, 'success');
}

export function togglePinSelectedSystem() {
    const selectedHexId = state.selectedHexId;
    if (!selectedHexId) {
        showStatusMessage('Select a system or POI to pin.', 'warn');
        return;
    }
    const isSystem = !!state.sectors[selectedHexId];
    const isPoi = !!(state.deepSpacePois && state.deepSpacePois[selectedHexId]);
    if (!isSystem && !isPoi) {
        showStatusMessage('Select a system or POI to pin.', 'warn');
        return;
    }

    const pinned = new Set(state.pinnedHexIds || []);
    if (pinned.has(selectedHexId)) {
        pinned.delete(selectedHexId);
        showStatusMessage(`Unpinned ${isSystem ? 'system' : 'POI'} ${getGlobalHexDisplayId(selectedHexId)}.`, 'info');
    } else {
        pinned.add(selectedHexId);
        showStatusMessage(`Pinned ${isSystem ? 'system' : 'POI'} ${getGlobalHexDisplayId(selectedHexId)}.`, 'success');
    }

    state.pinnedHexIds = Array.from(pinned);

    const activeSectorKey = state.multiSector && state.multiSector.currentKey ? state.multiSector.currentKey : '';
    const group = document.querySelector(`.hex-group[data-id="${selectedHexId}"][data-sector-key="${activeSectorKey}"]`);
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
    const fixedPois = {};
    (state.pinnedHexIds || []).forEach(hexId => {
        if (isHexIdInBounds(hexId, width, height) && state.sectors[hexId]) {
            fixedSystems[hexId] = state.sectors[hexId];
        }
        if (isHexIdInBounds(hexId, width, height) && state.deepSpacePois && state.deepSpacePois[hexId] && !state.sectors[hexId]) {
            fixedPois[hexId] = state.deepSpacePois[hexId];
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
    state.deepSpacePois = generateDeepSpacePois(width, height, nextSectors, { randomFn: rand });
    Object.entries(fixedPois).forEach(([hexId, poi]) => {
        if (!state.sectors[hexId]) {
            state.deepSpacePois[hexId] = deepClone(poi);
        }
    });
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
    const built = buildSectorFromConfig(config, fixedSystems, {
        sectorKey: options && options.sectorKey ? options.sectorKey : HOME_SECTOR_KEY,
        knownSectorRecords: options && options.knownSectorRecords ? options.knownSectorRecords : {}
    });
    state.currentSeed = previousSeed;
    state.seededRandomFn = previousRandom;

    return {
        seed,
        config,
        sectors: deepClone(built.sectors),
        deepSpacePois: deepClone(built.deepSpacePois),
        pinnedHexIds: [],
        totalHexes: built.totalHexes,
        systemCount: built.systemCount
    };
}
