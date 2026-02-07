import { state } from './config.js';
import { createSectorRecord } from './generation.js';
import { showStatusMessage } from './core.js';
import { EVENTS, emitEvent } from './events.js';
import { applySectorPayload } from './storage.js';
import { selectHex, updateViewTransform } from './render.js';

const DIRECTIONS = {
    north: { dx: 0, dy: -1 },
    south: { dx: 0, dy: 1 },
    west: { dx: -1, dy: 0 },
    east: { dx: 1, dy: 0 }
};

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function getRefs() {
    return {
        currentLabel: document.getElementById('currentSectorLabel'),
        knownLabel: document.getElementById('knownSectorsLabel'),
        northBtn: document.getElementById('sectorNorthBtn'),
        southBtn: document.getElementById('sectorSouthBtn'),
        westBtn: document.getElementById('sectorWestBtn'),
        eastBtn: document.getElementById('sectorEastBtn'),
        homeBtn: document.getElementById('sectorHomeBtn')
    };
}

function parseKey(key) {
    const [xRaw, yRaw] = String(key || '').split(',');
    const x = parseInt(xRaw, 10);
    const y = parseInt(yRaw, 10);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return { x: 0, y: 0 };
    return { x, y };
}

function makeKey(x, y) {
    return `${x},${y}`;
}

function mapSelectedHexForDirection(selectedHexId) {
    if (!selectedHexId) return null;
    const [cRaw, rRaw] = String(selectedHexId).split('-');
    const c = parseInt(cRaw, 10);
    const r = parseInt(rRaw, 10);
    if (!Number.isInteger(c) || !Number.isInteger(r)) return null;
    return `${c}-${r}`;
}

function getCurrentConfig() {
    const snapshot = state.sectorConfigSnapshot || (state.lastSectorSnapshot && state.lastSectorSnapshot.sectorConfigSnapshot);
    if (snapshot) return deepClone(snapshot);
    return {
        sizeMode: 'preset',
        sizePreset: 'standard',
        width: parseInt(document.getElementById('gridWidth')?.value || '8', 10) || 8,
        height: parseInt(document.getElementById('gridHeight')?.value || '10', 10) || 10,
        densityMode: 'preset',
        densityPreset: parseFloat(document.getElementById('densityPreset')?.value || '0.2'),
        manualMin: parseInt(document.getElementById('manualMin')?.value || '0', 10) || 0,
        manualMax: parseInt(document.getElementById('manualMax')?.value || '0', 10) || 0,
        generationProfile: document.getElementById('generationProfile')?.value || 'cinematic',
        realisticPlanetWeights: !!document.getElementById('realisticPlanetWeightsToggle')?.checked
    };
}

function ensureState() {
    if (!state.multiSector || typeof state.multiSector !== 'object') {
        state.multiSector = { currentKey: '0,0', sectorsByKey: {} };
    }
    if (!state.multiSector.currentKey) state.multiSector.currentKey = '0,0';
    if (!state.multiSector.sectorsByKey || typeof state.multiSector.sectorsByKey !== 'object') {
        state.multiSector.sectorsByKey = {};
    }
}

function saveCurrentSectorRecord() {
    ensureState();
    const key = state.multiSector.currentKey || '0,0';
    const config = getCurrentConfig();
    const totalHexes = config.width * config.height;
    state.multiSector.sectorsByKey[key] = {
        seed: state.currentSeed || '',
        config,
        sectors: deepClone(state.sectors || {}),
        pinnedHexIds: deepClone(state.pinnedHexIds || []),
        totalHexes,
        systemCount: Object.keys(state.sectors || {}).length
    };
}

function applySectorRecord(key, record, options = {}) {
    if (!record || !record.config || !record.sectors) return;
    ensureState();

    state.multiSector.currentKey = key;
    const preferredSelectedHexId = options.preferredSelectedHexId || null;
    const preserveView = !!options.preserveView;
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
        autoSeed: !!document.getElementById('autoSeedToggle')?.checked,
        realisticPlanetWeights: !!record.config.realisticPlanetWeights,
        generationProfile: record.config.generationProfile || 'cinematic',
        sectorConfigSnapshot: deepClone(record.config),
        pinnedHexIds: deepClone(record.pinnedHexIds || []),
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
        const group = document.querySelector(`.hex-group[data-id="${preferredSelectedHexId}"]`);
        if (group) {
            selectHex(preferredSelectedHexId, group);
        }
    }
    if (preserveView && previousView) {
        state.viewState = { ...state.viewState, ...previousView };
        updateViewTransform();
    }
    renderSectorLinksUi();
    showStatusMessage(`Loaded sector ${key}.`, 'info');
}

function buildEdgeContinuityFixedSystems(fromRecord, direction) {
    const width = fromRecord.config.width;
    const height = fromRecord.config.height;
    const fixed = {};
    const sectors = fromRecord.sectors || {};

    if (direction === 'east') {
        for (let r = 0; r < height; r++) {
            const fromHex = `${width - 1}-${r}`;
            if (!sectors[fromHex]) continue;
            fixed[`0-${r}`] = deepClone(sectors[fromHex]);
        }
        return fixed;
    }
    if (direction === 'west') {
        for (let r = 0; r < height; r++) {
            const fromHex = `0-${r}`;
            if (!sectors[fromHex]) continue;
            fixed[`${width - 1}-${r}`] = deepClone(sectors[fromHex]);
        }
        return fixed;
    }
    if (direction === 'north') {
        for (let c = 0; c < width; c++) {
            const fromHex = `${c}-0`;
            if (!sectors[fromHex]) continue;
            fixed[`${c}-${height - 1}`] = deepClone(sectors[fromHex]);
        }
        return fixed;
    }
    if (direction === 'south') {
        for (let c = 0; c < width; c++) {
            const fromHex = `${c}-${height - 1}`;
            if (!sectors[fromHex]) continue;
            fixed[`${c}-0`] = deepClone(sectors[fromHex]);
        }
    }
    return fixed;
}

function getOrCreateSectorRecord(targetKey, direction) {
    ensureState();
    const existing = state.multiSector.sectorsByKey[targetKey];
    if (existing) return existing;

    const fromRecord = state.multiSector.sectorsByKey[state.multiSector.currentKey];
    if (!fromRecord) return null;

    const continuityFixed = buildEdgeContinuityFixedSystems(fromRecord, direction);
    const homeSeed = state.multiSector.sectorsByKey['0,0']?.seed || '';
    const baseSeed = homeSeed || fromRecord.seed || 'sector';
    const seed = `${baseSeed} / ${targetKey}`;
    const record = createSectorRecord({
        config: fromRecord.config,
        seed,
        fixedSystems: continuityFixed
    });
    state.multiSector.sectorsByKey[targetKey] = record;
    return record;
}

function moveDirection(direction) {
    ensureState();
    saveCurrentSectorRecord();
    const delta = DIRECTIONS[direction];
    if (!delta) return;
    const { x, y } = parseKey(state.multiSector.currentKey);
    const targetKey = makeKey(x + delta.dx, y + delta.dy);
    const targetRecord = getOrCreateSectorRecord(targetKey, direction);
    if (!targetRecord) return;
    const fromRecord = state.multiSector.sectorsByKey[state.multiSector.currentKey];
    const mappedSelectedHexId = mapSelectedHexForDirection(state.selectedHexId);
    applySectorRecord(targetKey, targetRecord, {
        preferredSelectedHexId: mappedSelectedHexId,
        preserveView: true
    });
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: `Switch Sector ${direction}` });
}

function goHome() {
    ensureState();
    saveCurrentSectorRecord();
    const homeKey = '0,0';
    const home = state.multiSector.sectorsByKey[homeKey];
    if (!home) return;
    applySectorRecord(homeKey, home, { preferredSelectedHexId: state.selectedHexId, preserveView: true });
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Switch Sector Home' });
}

function renderSectorLinksUi() {
    const refs = getRefs();
    ensureState();
    if (refs.currentLabel) refs.currentLabel.innerText = `Current: ${state.multiSector.currentKey}`;
    if (refs.knownLabel) refs.knownLabel.innerText = `Loaded: ${Object.keys(state.multiSector.sectorsByKey).length}`;
}

export function setupMultiSectorLinks() {
    const refs = getRefs();
    if (!refs.northBtn || !refs.southBtn || !refs.westBtn || !refs.eastBtn || !refs.homeBtn) return;
    ensureState();
    if (!state.multiSector.sectorsByKey[state.multiSector.currentKey]) {
        saveCurrentSectorRecord();
    }

    refs.northBtn?.addEventListener('click', () => moveDirection('north'));
    refs.southBtn?.addEventListener('click', () => moveDirection('south'));
    refs.westBtn?.addEventListener('click', () => moveDirection('west'));
    refs.eastBtn?.addEventListener('click', () => moveDirection('east'));
    refs.homeBtn?.addEventListener('click', goHome);

    window.addEventListener(EVENTS.SECTOR_DATA_CHANGED, () => {
        saveCurrentSectorRecord();
        renderSectorLinksUi();
    });

    renderSectorLinksUi();
}
