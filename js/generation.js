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
import { selectClusteredSystemCoordsV2 } from './generation-cluster-v2.js';
import { createGenerationContext } from './generation-context.js';
import { generateSystemName, generateSystemStars } from './generation-system.js';
import { resolveCoreSystemHexId } from './core-system.js';
import { readGenerationConfigFromUi } from './sector-config.js';
import { generateSystemDataAction, reconcilePlanetaryBodiesAction } from './generation-system-data.js';
import { setEditModeAction, toggleEditModeAction } from './generation-edit-mode.js';
import { buildGenerationDepInputs, buildOrchestrationCoreDeps } from './generation-composition.js';
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
    renamePoiAtHexAction,
    toggleSelectedCoreSystemAction
} from './generation-actions.js';
import {
    rerollSelectedPlanetAction,
    rerollSelectedSystemAction,
    rerollUnpinnedSystemsAction,
    togglePinSelectedSystemAction
} from './generation-reroll.js';
import {
    buildSectorFromConfigAction as buildSectorFromConfigCoreAction,
    composeContentSeed,
    createSectorRecordAction,
    generateSectorAction,
    refreshSectorSnapshotAction as refreshSectorSnapshotCoreAction,
    setAndUseNewSeedAction as setAndUseNewSeedCoreAction,
    updateSectorStatusAction as updateSectorStatusCoreAction
} from './generation-orchestration.js';

function getOrchestrationCoreDeps() {
    return buildOrchestrationCoreDeps({
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
        selectClusteredSystemCoordsV2,
        createGenerationContext,
        getActiveJumpGateSectorWeightMultiplier,
        generateDeepSpacePois,
        resolveCoreSystemHexId,
        autoSaveSectorState,
        buildSectorPayload,
        emitEvent,
        events: EVENTS,
        homeSectorKey: HOME_SECTOR_KEY
    });
}

function updateSectorStatus(totalHexes, systemCount) {
    updateSectorStatusCoreAction(totalHexes, systemCount);
}

function setAndUseNewSeed(updateInput = true) {
    return setAndUseNewSeedCoreAction(updateInput, {
        generateSeedString,
        setSeed
    });
}

function buildSectorFromConfig(config, fixedSystems = {}, options = {}) {
    return buildSectorFromConfigCoreAction(config, fixedSystems, options, {
        ...getOrchestrationCoreDeps(),
        generateSystemData
    });
}

function refreshSectorSnapshot(config, width, height, changeLabel = 'Update Sector') {
    refreshSectorSnapshotCoreAction(config, width, height, changeLabel, getOrchestrationCoreDeps());
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

function getGenerationDepInputs() {
    return buildGenerationDepInputs({
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
        composeContentSeed,
        resolveCoreSystemHexId
    });
}

export function addSystemAtHex(hexId) {
    addSystemAtHexAction(hexId, buildGenerationActionDeps(getGenerationDepInputs()));
}

export function deleteSelectedSystem() {
    deleteSelectedSystemAction(buildGenerationActionDeps(getGenerationDepInputs()));
}

export function addPoiAtHex(hexId) {
    addPoiAtHexAction(hexId, buildGenerationActionDeps(getGenerationDepInputs()));
}

export function deletePoiAtHex(hexId) {
    deletePoiAtHexAction(hexId, buildGenerationActionDeps(getGenerationDepInputs()));
}

export function renamePoiAtHex(hexId) {
    renamePoiAtHexAction(hexId, buildGenerationActionDeps(getGenerationDepInputs()));
}

export function addBodyToSelectedSystem(kind) {
    addBodyToSelectedSystemAction(kind, buildGenerationActionDeps(getGenerationDepInputs()));
}

export function deleteSelectedBody() {
    deleteSelectedBodyAction(buildGenerationActionDeps(getGenerationDepInputs()));
}

export function toggleSelectedCoreSystem() {
    toggleSelectedCoreSystemAction(buildGenerationActionDeps(getGenerationDepInputs()));
}

export function rerollSelectedPlanet() {
    rerollSelectedPlanetAction(buildGenerationRerollDeps(getGenerationDepInputs()));
}

export function rerollSelectedSystem() {
    rerollSelectedSystemAction(buildGenerationRerollDeps(getGenerationDepInputs()));
}

export function togglePinSelectedSystem() {
    togglePinSelectedSystemAction(buildGenerationRerollDeps(getGenerationDepInputs()));
}

export function rerollUnpinnedSystems() {
    rerollUnpinnedSystemsAction(buildGenerationRerollDeps(getGenerationDepInputs()));
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
