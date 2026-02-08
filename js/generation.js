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
import { getGlobalHexDisplayId } from './render-shared.js';
import { HOME_SECTOR_KEY } from './sector-address.js';
import { ensureSystemStarFields } from './star-system.js';
import { redrawGridAndReselect, redrawHexAndReselect, redrawHexAndSelectHex, refreshHexInfo, clearSelectionInfo } from './ui-sync.js';
import { deepClone, isHexIdInBounds, romanize, shuffleArray, sortHexIds } from './utils.js';
import { computeSystemCount, getActiveGenerationProfile, getGenerationConfigSnapshot, normalizeGenerationConfig } from './generation-config.js';
import { createDeepSpacePoi, generateDeepSpacePois, getActiveJumpGateSectorWeightMultiplier } from './generation-poi.js';
import { selectClusteredSystemCoords } from './generation-spatial.js';
import { generateSystemName, generateSystemStars } from './generation-system.js';
import { readGenerationConfigFromUi } from './sector-config.js';
import {
    addBodyToSelectedSystemAction,
    addPoiAtHexAction,
    addSystemAtHexAction,
    deletePoiAtHexAction,
    deleteSelectedBodyAction,
    deleteSelectedSystemAction,
    renamePoiAtHexAction
} from './generation-actions.js';
import {
    rerollSelectedPlanetAction,
    rerollSelectedSystemAction,
    rerollUnpinnedSystemsAction,
    togglePinSelectedSystemAction
} from './generation-reroll.js';
import {
    buildSectorFromConfig as buildSectorFromConfigCore,
    composeContentSeed,
    createSectorRecordAction,
    generateSectorAction,
    refreshSectorSnapshot as refreshSectorSnapshotCore,
    setAndUseNewSeed as setAndUseNewSeedCore,
    updateSectorStatus as updateSectorStatusCore
} from './generation-orchestration.js';

function buildOrchestrationCoreDeps() {
    return {
        state,
        normalizeGenerationConfig,
        generateSeedString,
        setSeed,
        isHexIdInBounds,
        computeSystemCount,
        shuffleArray,
        rand,
        deepClone,
        selectClusteredSystemCoords,
        getActiveJumpGateSectorWeightMultiplier,
        generateDeepSpacePois,
        autoSaveSectorState,
        buildSectorPayload,
        emitEvent,
        events: EVENTS,
        homeSectorKey: HOME_SECTOR_KEY
    };
}

function updateSectorStatus(totalHexes, systemCount) {
    updateSectorStatusCore(totalHexes, systemCount);
}

function setAndUseNewSeed(updateInput = true) {
    return setAndUseNewSeedCore(updateInput, {
        generateSeedString,
        setSeed
    });
}

function buildSectorFromConfig(config, fixedSystems = {}, options = {}) {
    return buildSectorFromConfigCore(config, fixedSystems, options, {
        ...buildOrchestrationCoreDeps(),
        generateSystemData
    });
}

function refreshSectorSnapshot(config, width, height, changeLabel = 'Update Sector') {
    refreshSectorSnapshotCore(config, width, height, changeLabel, buildOrchestrationCoreDeps());
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
    generateSectorAction({
        state,
        isAutoSeedEnabled,
        generateSeedString,
        setSeed,
        setAndUseNewSeed,
        normalizeGenerationConfig,
        readGenerationConfigFromUi,
        homeSectorKey: HOME_SECTOR_KEY,
        buildSectorFromConfig,
        deepClone,
        clearSelectionInfo,
        redrawGridAndReselect,
        updateSectorStatus,
        refreshSectorSnapshot,
        showStatusMessage
    });
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

function buildGenerationRerollDeps() {
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
        redrawGridAndReselect,
        refreshHexInfo,
        refreshSectorSnapshot,
        updateSectorStatus,
        sanitizePinnedHexes,
        generateSystemData,
        createDeepSpacePoi,
        generateDeepSpacePois,
        isPlanetaryBody,
        pickPlanetTypeForStarClass,
        pickRandomPlanetType,
        isHabitableCandidateType,
        generatePlanetEnvironment,
        generatePlanetSize,
        deepClone,
        sortHexIds,
        setRandomStream,
        setAndUseNewSeed,
        composeContentSeed,
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
    rerollSelectedPlanetAction(buildGenerationRerollDeps());
}

export function rerollSelectedSystem() {
    rerollSelectedSystemAction(buildGenerationRerollDeps());
}

export function togglePinSelectedSystem() {
    togglePinSelectedSystemAction(buildGenerationRerollDeps());
}

export function rerollUnpinnedSystems() {
    rerollUnpinnedSystemsAction(buildGenerationRerollDeps());
}

export function createSectorRecord(options = {}) {
    return createSectorRecordAction(options, {
        state,
        normalizeGenerationConfig,
        getGenerationConfigSnapshot,
        generateSeedString,
        setSeed,
        buildSectorFromConfig,
        deepClone,
        homeSectorKey: HOME_SECTOR_KEY
    });
}
