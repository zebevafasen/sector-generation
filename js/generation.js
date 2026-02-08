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
import { generateSystemDataAction, reconcilePlanetaryBodiesAction } from './generation-system-data.js';
import { setEditModeAction, toggleEditModeAction } from './generation-edit-mode.js';
import {
    buildGenerationActionDeps,
    buildGenerationRerollDeps
} from './generation-deps.js';
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
    reconcilePlanetaryBodiesAction(system, {
        ensureSystemStarFields,
        applyPlanetaryOrderAndNames,
        refreshSystemPlanetPopulation,
        refreshSystemPlanetTags,
        reportSystemInvariantIssues,
        rand
    });
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
    return generateSystemDataAction(config, context, {
        state,
        normalizeGenerationConfig,
        getGenerationConfigSnapshot,
        getActiveGenerationProfile,
        generateSystemName,
        generateSystemStars,
        rand,
        pickPlanetTypeForStarClass,
        pickRandomPlanetType,
        generatePlanetEnvironment,
        romanize,
        generatePlanetSize,
        assignSystemHabitability,
        applyPlanetaryOrderAndNames,
        starVisuals: STAR_VISUALS,
        ensureSystemStarFields,
        refreshSystemPlanetPopulation,
        refreshSystemPlanetTags,
        reportSystemInvariantIssues
    });
}

export function setEditMode(enabled) {
    setEditModeAction(enabled, {
        state,
        emitEvent,
        events: EVENTS
    });
}

export function toggleEditMode() {
    toggleEditModeAction({
        state,
        setEditMode,
        showStatusMessage
    });
}

function buildGenerationDepInputs() {
    return {
        state,
        rand,
        showStatusMessage,
        reportSystemInvariantIssues,
        getGenerationConfigSnapshot,
        isHexIdInBounds,
        getGlobalHexDisplayId,
        refreshSectorSnapshot,
        updateSectorStatus,
        sanitizePinnedHexes,
        generateSystemData,
        createDeepSpacePoi,
        isPlanetaryBody,
        pickRandomPlanetType,
        generatePlanetEnvironment,
        generatePlanetSize,
        reconcilePlanetaryBodies,
        redrawHexAndReselect,
        redrawHexAndSelectHex,
        refreshHexInfo,
        clearSelectionInfo,
        romanize,
        redrawGridAndReselect,
        generateDeepSpacePois,
        pickPlanetTypeForStarClass,
        isHabitableCandidateType,
        deepClone,
        sortHexIds,
        setRandomStream,
        setAndUseNewSeed,
        composeContentSeed
    };
}

export function addSystemAtHex(hexId) {
    addSystemAtHexAction(hexId, buildGenerationActionDeps(buildGenerationDepInputs()));
}

export function deleteSelectedSystem() {
    deleteSelectedSystemAction(buildGenerationActionDeps(buildGenerationDepInputs()));
}

export function addPoiAtHex(hexId) {
    addPoiAtHexAction(hexId, buildGenerationActionDeps(buildGenerationDepInputs()));
}

export function deletePoiAtHex(hexId) {
    deletePoiAtHexAction(hexId, buildGenerationActionDeps(buildGenerationDepInputs()));
}

export function renamePoiAtHex(hexId) {
    renamePoiAtHexAction(hexId, buildGenerationActionDeps(buildGenerationDepInputs()));
}

export function addBodyToSelectedSystem(kind) {
    addBodyToSelectedSystemAction(kind, buildGenerationActionDeps(buildGenerationDepInputs()));
}

export function deleteSelectedBody() {
    deleteSelectedBodyAction(buildGenerationActionDeps(buildGenerationDepInputs()));
}

export function rerollSelectedPlanet() {
    rerollSelectedPlanetAction(buildGenerationRerollDeps(buildGenerationDepInputs()));
}

export function rerollSelectedSystem() {
    rerollSelectedSystemAction(buildGenerationRerollDeps(buildGenerationDepInputs()));
}

export function togglePinSelectedSystem() {
    togglePinSelectedSystemAction(buildGenerationRerollDeps(buildGenerationDepInputs()));
}

export function rerollUnpinnedSystems() {
    rerollUnpinnedSystemsAction(buildGenerationRerollDeps(buildGenerationDepInputs()));
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
