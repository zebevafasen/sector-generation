import { state } from './config.js';
import { createSectorRecord } from './generation.js';
import { isAutoSeedEnabled, showStatusMessage } from './core.js';
import { EVENTS, emitEvent } from './events.js';
import { readGenerationConfigFromUi } from './sector-config.js';
import { HOME_SECTOR_KEY, offsetSectorKey, parseSectorKeyToCoords } from './sector-address.js';
import { getGlobalHexDisplayIdForSector } from './render-shared.js';
import { applySectorPayload } from './storage.js';
import { centerViewOnSector, findHexGroup, redrawHex, selectHex, updateViewTransform } from './render.js';
import { deepClone } from './utils.js';
import { createJumpGateService } from './multi-sector-jump-gates.js';
import { createCorridorService } from './multi-sector-corridors.js';
import { createNavigationService } from './multi-sector-navigation.js';

const DIRECTIONS = {
    north: { dx: 0, dy: -1 },
    south: { dx: 0, dy: 1 },
    west: { dx: -1, dy: 0 },
    east: { dx: 1, dy: 0 }
};

const jumpGateService = createJumpGateService(state, ensureState);
const corridorService = createCorridorService(state, {
    ensureState,
    parseKey,
    getOrCreateSectorRecordByKey,
    renderSectorLinksUi,
    saveCurrentSectorRecord,
    emitSectorDataChanged,
    showStatusMessage
});
const navigationService = createNavigationService(state, {
    directions: DIRECTIONS,
    ensureState,
    saveCurrentSectorRecord,
    applySectorRecord,
    getOrCreateSectorRecord,
    getOrCreateSectorRecordByKey,
    getOrCreateSectorRecordFromSource,
    centerViewOnSector,
    emitSectorDataChanged,
    showStatusMessage,
    offsetSectorKey
});

function getRefs() {
    return {
        currentLabel: document.getElementById('currentSectorLabel'),
        knownLabel: document.getElementById('knownSectorsLabel'),
        chartGateCorridorsBtn: document.getElementById('chartGateCorridorsBtn'),
        expandedViewBtn: document.getElementById('toggleExpandedSectorViewBtn'),
        northBtn: document.getElementById('sectorNorthBtn'),
        southBtn: document.getElementById('sectorSouthBtn'),
        westBtn: document.getElementById('sectorWestBtn'),
        eastBtn: document.getElementById('sectorEastBtn'),
        homeBtn: document.getElementById('sectorHomeBtn')
    };
}

function parseKey(key) {
    return parseSectorKeyToCoords(key || HOME_SECTOR_KEY);
}

function emitSectorDataChanged(label) {
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label });
}

function getCurrentConfig() {
    const snapshot = state.sectorConfigSnapshot || (state.lastSectorSnapshot && state.lastSectorSnapshot.sectorConfigSnapshot);
    if (snapshot) return deepClone(snapshot);
    return readGenerationConfigFromUi({
        sizeMode: state.sizeMode || 'preset',
        sizePreset: 'standard',
        width: 8,
        height: 10,
        densityMode: state.densityMode || 'preset',
        densityPreset: 'standard',
        manualMin: 0,
        manualMax: 0,
        generationProfile: 'high_adventure',
        starDistribution: 'standard',
        realisticPlanetWeights: false
    });
}

function ensureState() {
    if (!state.multiSector || typeof state.multiSector !== 'object') {
        state.multiSector = { currentKey: HOME_SECTOR_KEY, selectedSectorKey: HOME_SECTOR_KEY, sectorsByKey: {}, jumpGateRegistry: {}, chartGateCorridorsPending: false, expandedView: false };
    }
    if (!state.multiSector.currentKey) state.multiSector.currentKey = HOME_SECTOR_KEY;
    if (typeof state.multiSector.selectedSectorKey === 'undefined') {
        state.multiSector.selectedSectorKey = state.multiSector.currentKey;
    }
    if (!state.multiSector.sectorsByKey || typeof state.multiSector.sectorsByKey !== 'object') {
        state.multiSector.sectorsByKey = {};
    }
    if (!state.multiSector.jumpGateRegistry || typeof state.multiSector.jumpGateRegistry !== 'object') {
        state.multiSector.jumpGateRegistry = {};
    }
    if (typeof state.multiSector.chartGateCorridorsPending !== 'boolean') {
        state.multiSector.chartGateCorridorsPending = false;
    }
    if (typeof state.multiSector.expandedView !== 'boolean') {
        state.multiSector.expandedView = false;
    }
}

function saveCurrentSectorRecord() {
    ensureState();
    const key = state.multiSector.currentKey || HOME_SECTOR_KEY;
    const config = getCurrentConfig();
    const totalHexes = config.width * config.height;
    const nextRecord = {
        seed: state.currentSeed || '',
        config,
        sectors: deepClone(state.sectors || {}),
        deepSpacePois: deepClone(state.deepSpacePois || {}),
        pinnedHexIds: deepClone(state.pinnedHexIds || []),
        coreSystemHexId: typeof state.coreSystemHexId === 'string' ? state.coreSystemHexId : null,
        coreSystemManual: !!state.coreSystemManual,
        totalHexes,
        systemCount: Object.keys(state.sectors || {}).length
    };
    state.multiSector.sectorsByKey[key] = nextRecord;
    jumpGateService.ensureJumpGateLinksForRecord(key, nextRecord);
    jumpGateService.ensureInboundJumpGatesForRecord(key, nextRecord);

    if (key === state.multiSector.currentKey) {
        state.deepSpacePois = deepClone(nextRecord.deepSpacePois || {});
    }
}

function applySectorRecord(key, record, options = {}) {
    if (!record || !record.config || !record.sectors) return;
    ensureState();

    state.multiSector.currentKey = key;
    state.multiSector.selectedSectorKey = key;
    const preferredSelectedHexId = options.preferredSelectedHexId || null;
    const preserveView = !!options.preserveView;
    const showLoadedToast = options.showLoadedToast !== false;
    const previousView = preserveView ? deepClone(state.viewState) : null;
    const payload = {
        version: 1,
        generatedAt: new Date().toISOString(),
        seed: record.seed || '',
        sizeMode: record.config.sizeMode,
        sizePreset: record.config.sizePreset,
        densityMode: record.config.densityMode,
        densityPreset: record.config.densityPreset,
        manualRange: {
            min: record.config.manualMin || 0,
            max: record.config.manualMax || 0
        },
        autoSeed: isAutoSeedEnabled(),
        realisticPlanetWeights: !!record.config.realisticPlanetWeights,
        generationProfile: record.config.generationProfile || 'high_adventure',
        starDistribution: record.config.starDistribution || 'standard',
        sectorConfigSnapshot: deepClone(record.config),
        deepSpacePois: deepClone(record.deepSpacePois || {}),
        pinnedHexIds: deepClone(record.pinnedHexIds || []),
        coreSystemHexId: record.coreSystemHexId || null,
        coreSystemManual: !!record.coreSystemManual,
        selectedHexId: null,
        multiSector: deepClone(state.multiSector),
        dimensions: {
            width: record.config.width,
            height: record.config.height
        },
        stats: {
            totalHexes: record.totalHexes || (record.config.width * record.config.height),
            totalSystems: record.systemCount || Object.keys(record.sectors).length
        },
        sectors: deepClone(record.sectors)
    };
    applySectorPayload(payload);
    if (preferredSelectedHexId) {
        const group = findHexGroup(preferredSelectedHexId, key);
        if (group) {
            selectHex(preferredSelectedHexId, group);
        }
    }
    if (preserveView && previousView) {
        state.viewState = { ...state.viewState, ...previousView };
        updateViewTransform();
    }
    renderSectorLinksUi();
    if (showLoadedToast) showStatusMessage(`Loaded sector ${key}.`, 'info');
}

function getOrCreateSectorRecord(targetKey) {
    ensureState();
    const existing = state.multiSector.sectorsByKey[targetKey];
    if (existing) return existing;

    const fromRecord = state.multiSector.sectorsByKey[state.multiSector.currentKey];
    if (!fromRecord) return null;

    const homeSeed = state.multiSector.sectorsByKey[HOME_SECTOR_KEY]?.seed || '';
    const baseSeed = homeSeed || fromRecord.seed || 'sector';
    const seed = `${baseSeed} / ${targetKey}`;
    const record = createSectorRecord({
        config: fromRecord.config,
        seed,
        fixedSystems: {},
        sectorKey: targetKey,
        knownSectorRecords: state.multiSector.sectorsByKey
    });
    state.multiSector.sectorsByKey[targetKey] = record;
    jumpGateService.ensureJumpGateLinksForRecord(targetKey, record);
    jumpGateService.ensureInboundJumpGatesForRecord(targetKey, record);
    return record;
}

function getOrCreateSectorRecordByKey(targetKey) {
    ensureState();
    const existing = state.multiSector.sectorsByKey[targetKey];
    if (existing) {
        jumpGateService.ensureJumpGateLinksForRecord(targetKey, existing);
        jumpGateService.ensureInboundJumpGatesForRecord(targetKey, existing);
        return existing;
    }

    const fromRecord = state.multiSector.sectorsByKey[state.multiSector.currentKey];
    if (!fromRecord) return null;
    const homeSeed = state.multiSector.sectorsByKey[HOME_SECTOR_KEY]?.seed || '';
    const baseSeed = homeSeed || fromRecord.seed || 'sector';
    const seed = `${baseSeed} / ${targetKey}`;
    const record = createSectorRecord({
        config: fromRecord.config,
        seed,
        fixedSystems: {},
        sectorKey: targetKey,
        knownSectorRecords: state.multiSector.sectorsByKey
    });
    state.multiSector.sectorsByKey[targetKey] = record;
    jumpGateService.ensureJumpGateLinksForRecord(targetKey, record);
    jumpGateService.ensureInboundJumpGatesForRecord(targetKey, record);
    return record;
}

function getMissingGateCorridorSectorKeys() {
    return corridorService.getMissingGateCorridorSectorKeys();
}

function chartMissingGateCorridors() {
    corridorService.chartMissingGateCorridors();
}

function moveDirection(direction) {
    navigationService.moveDirection(direction);
}

function getOrCreateSectorRecordFromSource(sourceKey, targetKey) {
    ensureState();
    const existing = state.multiSector.sectorsByKey[targetKey];
    if (existing) return existing;

    const sourceRecord = state.multiSector.sectorsByKey[sourceKey];
    if (!sourceRecord) return null;

    const homeSeed = state.multiSector.sectorsByKey[HOME_SECTOR_KEY]?.seed || '';
    const baseSeed = homeSeed || sourceRecord.seed || 'sector';
    const seed = `${baseSeed} / ${targetKey}`;
    const record = createSectorRecord({
        config: sourceRecord.config,
        seed,
        fixedSystems: {},
        sectorKey: targetKey,
        knownSectorRecords: state.multiSector.sectorsByKey
    });
    state.multiSector.sectorsByKey[targetKey] = record;
    jumpGateService.ensureJumpGateLinksForRecord(targetKey, record);
    jumpGateService.ensureInboundJumpGatesForRecord(targetKey, record);
    return record;
}

function toggleExpandedSectorView() {
    navigationService.toggleExpandedSectorView();
}

function switchToSectorHex(sectorKey, hexId) {
    navigationService.switchToSectorHex(sectorKey, hexId);
}

function moveFromSectorEdge(sourceSectorKey, direction) {
    navigationService.moveFromSectorEdge(sourceSectorKey, direction);
}

function goHome() {
    navigationService.goHome();
}

function renderSectorLinksUi() {
    const refs = getRefs();
    ensureState();
    if (refs.currentLabel) refs.currentLabel.innerText = `Current: ${state.multiSector.currentKey}`;
    if (refs.knownLabel) refs.knownLabel.innerText = `Loaded: ${Object.keys(state.multiSector.sectorsByKey).length}`;
    if (refs.expandedViewBtn) {
        refs.expandedViewBtn.innerText = state.multiSector.expandedView ? 'Expanded View: On' : 'Expanded View: Off';
        refs.expandedViewBtn.className = state.multiSector.expandedView
            ? 'w-auto h-8 px-2 inline-flex items-center justify-center rounded-md bg-sky-800/90 border border-sky-500 text-sky-100 hover:text-white hover:border-sky-300 transition-colors text-[10px]'
            : 'w-auto h-8 px-2 inline-flex items-center justify-center rounded-md bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white hover:border-sky-500 transition-colors text-[10px]';
        refs.expandedViewBtn.title = state.multiSector.expandedView ? 'Disable expanded sector view' : 'Enable expanded sector view';
        refs.expandedViewBtn.setAttribute('aria-label', refs.expandedViewBtn.title);
    }
    if (refs.chartGateCorridorsBtn) {
        const missingCount = getMissingGateCorridorSectorKeys().length;
        if (missingCount > 0) state.multiSector.chartGateCorridorsPending = true;
        refs.chartGateCorridorsBtn.classList.toggle('hidden', !state.multiSector.chartGateCorridorsPending);
        refs.chartGateCorridorsBtn.innerText = missingCount > 0
            ? `Chart Gate Corridors (${missingCount})`
            : 'Chart Gate Corridors';
    }
}

export function travelSelectedJumpGate() {
    ensureState();
    saveCurrentSectorRecord();

    const sourceSectorKey = state.multiSector.currentKey || HOME_SECTOR_KEY;
    const sourceHexId = state.selectedHexId;
    const sourceRecord = state.multiSector.sectorsByKey[sourceSectorKey];
    if (!sourceHexId || !sourceRecord || !sourceRecord.deepSpacePois || !sourceRecord.deepSpacePois[sourceHexId]) {
        showStatusMessage('Select an active jump-gate first.', 'warn');
        return;
    }

    const sourcePoi = sourceRecord.deepSpacePois[sourceHexId];
    if (!jumpGateService.isActiveJumpGatePoi(sourcePoi) || !sourcePoi.jumpGateLink || !sourcePoi.jumpGateLink.sectorKey) {
        showStatusMessage('Selected POI has no active jump link.', 'warn');
        return;
    }

    const targetSectorKey = sourcePoi.jumpGateLink.sectorKey;
    let targetRecord = getOrCreateSectorRecordByKey(targetSectorKey);
    if (!targetRecord) {
        showStatusMessage('Unable to resolve jump destination sector.', 'error');
        return;
    }

    jumpGateService.ensureJumpGateLinksForRecord(sourceSectorKey, sourceRecord);
    jumpGateService.ensureInboundJumpGatesForRecord(sourceSectorKey, sourceRecord);
    jumpGateService.ensureJumpGateLinksForRecord(targetSectorKey, targetRecord);
    jumpGateService.ensureInboundJumpGatesForRecord(targetSectorKey, targetRecord);

    const refreshedSource = state.multiSector.sectorsByKey[sourceSectorKey];
    const refreshedPoi = refreshedSource && refreshedSource.deepSpacePois ? refreshedSource.deepSpacePois[sourceHexId] : null;
    const targetHexId = refreshedPoi && refreshedPoi.jumpGateLink ? refreshedPoi.jumpGateLink.hexId : (sourcePoi.jumpGateLink.hexId || null);
    if (!targetHexId) {
        showStatusMessage('Jump destination link is unresolved.', 'warn');
        return;
    }

    targetRecord = state.multiSector.sectorsByKey[targetSectorKey];
    applySectorRecord(targetSectorKey, targetRecord, {
        preferredSelectedHexId: targetHexId,
        preserveView: true
    });
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Travel Jump Gate' });
    showStatusMessage(`Jumped to sector ${targetSectorKey} at ${getGlobalHexDisplayIdForSector(targetSectorKey, targetHexId)}.`, 'success');
}

export function activateSelectedJumpGate() {
    ensureState();
    saveCurrentSectorRecord();
    const sectorKey = state.multiSector.currentKey || HOME_SECTOR_KEY;
    const hexId = state.selectedHexId;
    if (!hexId) {
        showStatusMessage('Select an inactive jump-gate first.', 'warn');
        return;
    }
    const activated = jumpGateService.activateJumpGateAt(sectorKey, hexId);
    if (!activated) {
        showStatusMessage('Selected POI is not an inactive jump-gate.', 'warn');
        return;
    }

    const currentRecord = state.multiSector.sectorsByKey[sectorKey];
    if (currentRecord) {
        state.deepSpacePois = deepClone(currentRecord.deepSpacePois || {});
    }
    const refreshedGroup = redrawHex(hexId);
    if (refreshedGroup) {
        selectHex(hexId, refreshedGroup);
    } else {
        const group = findHexGroup(hexId, sectorKey);
        if (group) selectHex(hexId, group);
    }
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Activate Jump Gate' });
    showStatusMessage('Jump-gate activated and linked endpoint synchronized.', 'success');
}

export function setupMultiSectorLinks() {
    const refs = getRefs();
    if (!refs.northBtn || !refs.southBtn || !refs.westBtn || !refs.eastBtn || !refs.homeBtn || !refs.expandedViewBtn) return;
    ensureState();
    if (!state.multiSector.sectorsByKey[state.multiSector.currentKey]) {
        saveCurrentSectorRecord();
    } else {
        const currentRecord = state.multiSector.sectorsByKey[state.multiSector.currentKey];
        jumpGateService.ensureJumpGateLinksForRecord(state.multiSector.currentKey, currentRecord);
        jumpGateService.ensureInboundJumpGatesForRecord(state.multiSector.currentKey, currentRecord);
        state.deepSpacePois = deepClone(currentRecord.deepSpacePois || {});
        state.coreSystemHexId = typeof currentRecord.coreSystemHexId === 'string' ? currentRecord.coreSystemHexId : null;
        state.coreSystemManual = !!currentRecord.coreSystemManual;
    }

    refs.northBtn?.addEventListener('click', () => moveDirection('north'));
    refs.southBtn?.addEventListener('click', () => moveDirection('south'));
    refs.westBtn?.addEventListener('click', () => moveDirection('west'));
    refs.eastBtn?.addEventListener('click', () => moveDirection('east'));
    refs.homeBtn?.addEventListener('click', goHome);
    refs.chartGateCorridorsBtn?.addEventListener('click', chartMissingGateCorridors);
    refs.expandedViewBtn?.addEventListener('click', toggleExpandedSectorView);

    window.addEventListener(EVENTS.SECTOR_DATA_CHANGED, () => {
        saveCurrentSectorRecord();
        renderSectorLinksUi();
    });
    window.addEventListener(EVENTS.REQUEST_SWITCH_SECTOR_HEX, (event) => {
        const sectorKey = event && event.detail ? event.detail.sectorKey : null;
        const hexId = event && event.detail ? event.detail.hexId : null;
        if (!sectorKey || !hexId) return;
        switchToSectorHex(sectorKey, hexId);
    });
    window.addEventListener(EVENTS.REQUEST_MOVE_SECTOR_EDGE, (event) => {
        const sourceSectorKey = event && event.detail ? event.detail.sourceSectorKey : null;
        const direction = event && event.detail ? event.detail.direction : null;
        if (!sourceSectorKey || !direction) return;
        moveFromSectorEdge(sourceSectorKey, direction);
    });

    renderSectorLinksUi();
}
