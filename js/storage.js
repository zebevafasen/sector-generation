import {
    LOCAL_STORAGE_KEY,
    state
} from './config.js';
import { isAutoSeedEnabled, isRealisticPlanetWeightingEnabled, setSeed, showStatusMessage } from './core.js';
import { setDensityMode, setSizeMode } from './controls.js';
import { EVENTS, emitEvent } from './events.js';
import { clearInfoPanel, drawGrid, selectHex } from './render.js';

function getStorageUiRefs() {
    return {
        gridWidthInput: document.getElementById('gridWidth'),
        gridHeightInput: document.getElementById('gridHeight'),
        sizePresetSelect: document.getElementById('sizePreset'),
        densityPresetSelect: document.getElementById('densityPreset'),
        manualMinInput: document.getElementById('manualMin'),
        manualMaxInput: document.getElementById('manualMax'),
        generationProfileSelect: document.getElementById('generationProfile'),
        autoSeedToggle: document.getElementById('autoSeedToggle'),
        realisticWeightsToggle: document.getElementById('realisticPlanetWeightsToggle'),
        seedInput: document.getElementById('seedInput'),
        statusTotalHexes: document.getElementById('statusTotalHexes'),
        statusTotalSystems: document.getElementById('statusTotalSystems')
    };
}

function updateStatusLabels(refs, totalHexes, totalSystems) {
    if (refs.statusTotalHexes) refs.statusTotalHexes.innerText = `${totalHexes} Hexes`;
    if (refs.statusTotalSystems) refs.statusTotalSystems.innerText = `${totalSystems} Systems`;
}

export function buildSectorPayload(meta = {}) {
    const refs = getStorageUiRefs();
    const width = Number.isFinite(meta.width) ? meta.width : (parseInt(refs.gridWidthInput.value, 10) || 0);
    const height = Number.isFinite(meta.height) ? meta.height : (parseInt(refs.gridHeightInput.value, 10) || 0);
    const totalHexes = Number.isFinite(meta.totalHexes) ? meta.totalHexes : width * height;
    const totalSystems = Number.isFinite(meta.systemCount) ? meta.systemCount : Object.keys(state.sectors).length;

    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        seed: state.currentSeed,
        sizeMode: state.sizeMode,
        sizePreset: state.sizeMode === 'preset' && refs.sizePresetSelect
            ? refs.sizePresetSelect.value
            : 'custom',
        densityMode: state.densityMode,
        densityPreset: refs.densityPresetSelect ? refs.densityPresetSelect.value : null,
        manualRange: {
            min: refs.manualMinInput ? parseInt(refs.manualMinInput.value, 10) || 0 : 0,
            max: refs.manualMaxInput ? parseInt(refs.manualMaxInput.value, 10) || 0 : 0
        },
        autoSeed: isAutoSeedEnabled(),
        realisticPlanetWeights: isRealisticPlanetWeightingEnabled(),
        generationProfile: refs.generationProfileSelect ? refs.generationProfileSelect.value : 'cinematic',
        sectorConfigSnapshot: state.sectorConfigSnapshot || null,
        pinnedHexIds: Array.isArray(state.pinnedHexIds) ? state.pinnedHexIds : [],
        selectedHexId: state.selectedHexId || null,
        multiSector: state.multiSector || null,
        dimensions: { width, height },
        stats: { totalHexes, totalSystems },
        sectors: JSON.parse(JSON.stringify(state.sectors))
    };
}

export function autoSaveSectorState() {
    if (!(typeof window !== 'undefined' && window.localStorage)) return;
    try {
        const payload = buildSectorPayload();
        window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
        console.error(err);
    }
}

export function restoreCachedSectorState() {
    if (!(typeof window !== 'undefined' && window.localStorage)) return false;
    try {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!raw) return false;
        const payload = JSON.parse(raw);
        if (!payload || !payload.dimensions || !payload.sectors) return false;
        applySectorPayload(payload);
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}

export function saveSectorLocal() {
    if (!state.lastSectorSnapshot) {
        showStatusMessage('Generate a sector before saving.', 'warn');
        return;
    }
    if (!(typeof window !== 'undefined' && window.localStorage)) {
        showStatusMessage('Local storage unavailable.', 'error');
        return;
    }
    try {
        const payload = buildSectorPayload();
        window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
        showStatusMessage('Sector saved to this browser.', 'success');
    } catch (err) {
        console.error(err);
        showStatusMessage('Unable to save sector locally.', 'error');
    }
}

export function loadSectorLocal() {
    if (!(typeof window !== 'undefined' && window.localStorage)) {
        showStatusMessage('Local storage unavailable.', 'error');
        return;
    }
    try {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!raw) {
            showStatusMessage('No saved sector found.', 'warn');
            return;
        }
        const payload = JSON.parse(raw);
        applySectorPayload(payload);
        showStatusMessage('Loaded saved sector.', 'success');
    } catch (err) {
        console.error(err);
        showStatusMessage('Failed to load saved sector.', 'error');
    }
}

export function exportSector() {
    if (!state.lastSectorSnapshot) {
        showStatusMessage('Generate a sector before exporting.', 'warn');
        return;
    }
    try {
        const payload = buildSectorPayload();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const safeSeed = (payload.seed || 'sector').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'sector';
        link.href = url;
        link.download = `sector-${safeSeed}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showStatusMessage('Exported sector JSON.', 'success');
    } catch (err) {
        console.error(err);
        showStatusMessage('Export failed.', 'error');
    }
}

export function triggerImport() {
    const input = document.getElementById('importFileInput');
    if (!input) return;
    input.value = '';
    input.click();
}

export function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const payload = JSON.parse(e.target.result);
            applySectorPayload(payload);
            showStatusMessage('Imported sector data.', 'success');
        } catch (err) {
            console.error(err);
            showStatusMessage('Invalid sector file.', 'error');
        }
    };
    reader.readAsText(file);
}

export function applySectorPayload(payload) {
    if (!payload || !payload.dimensions || !payload.sectors) {
        showStatusMessage('Sector file missing required data.', 'error');
        return;
    }

    const refs = getStorageUiRefs();
    if (payload.sizePreset && payload.sizePreset !== 'custom' && refs.sizePresetSelect) {
        refs.sizePresetSelect.value = payload.sizePreset;
    }
    if (payload.sizeMode) {
        setSizeMode(payload.sizeMode);
    }

    const width = parseInt(payload.dimensions.width, 10) || 1;
    const height = parseInt(payload.dimensions.height, 10) || 1;
    refs.gridWidthInput.value = width;
    refs.gridHeightInput.value = height;

    if (payload.densityMode) {
        setDensityMode(payload.densityMode);
    }
    if (payload.densityPreset && refs.densityPresetSelect) {
        refs.densityPresetSelect.value = payload.densityPreset;
    }
    if (payload.manualRange) {
        if (typeof payload.manualRange.min === 'number') {
            refs.manualMinInput.value = payload.manualRange.min;
        }
        if (typeof payload.manualRange.max === 'number') {
            refs.manualMaxInput.value = payload.manualRange.max;
        }
    }
    if (typeof payload.autoSeed === 'boolean') {
        if (refs.autoSeedToggle) refs.autoSeedToggle.checked = payload.autoSeed;
    }
    if (typeof payload.realisticPlanetWeights === 'boolean') {
        if (refs.realisticWeightsToggle) refs.realisticWeightsToggle.checked = payload.realisticPlanetWeights;
    }
    if (payload.generationProfile && refs.generationProfileSelect) {
        refs.generationProfileSelect.value = payload.generationProfile;
    }

    if (refs.seedInput) refs.seedInput.value = payload.seed || '';

    if (payload.seed) {
        setSeed(payload.seed);
    } else {
        state.currentSeed = '';
        state.seededRandomFn = () => Math.random();
    }

    state.sectors = payload.sectors || {};
    state.pinnedHexIds = Array.isArray(payload.pinnedHexIds)
        ? payload.pinnedHexIds.filter(hexId => !!state.sectors[hexId])
        : [];
    state.sectorConfigSnapshot = payload.sectorConfigSnapshot || {
        sizeMode: payload.sizeMode || state.sizeMode,
        sizePreset: payload.sizePreset || 'standard',
        width,
        height,
        densityMode: payload.densityMode || state.densityMode,
        densityPreset: payload.densityPreset,
        manualMin: payload.manualRange && typeof payload.manualRange.min === 'number' ? payload.manualRange.min : 0,
        manualMax: payload.manualRange && typeof payload.manualRange.max === 'number' ? payload.manualRange.max : 0,
        generationProfile: payload.generationProfile || 'cinematic',
        realisticPlanetWeights: !!payload.realisticPlanetWeights
    };
    state.selectedHexId = null;
    clearInfoPanel();
    drawGrid(width, height);
    if (payload.selectedHexId && state.sectors[payload.selectedHexId]) {
        const group = document.querySelector(`.hex-group[data-id="${payload.selectedHexId}"]`);
        if (group) selectHex(payload.selectedHexId, group);
    }

    const totalHexes = payload.stats && Number.isFinite(payload.stats.totalHexes) ? payload.stats.totalHexes : width * height;
    const systemCount = payload.stats && Number.isFinite(payload.stats.totalSystems) ? payload.stats.totalSystems : Object.keys(state.sectors).length;
    updateStatusLabels(refs, totalHexes, systemCount);
    state.lastSectorSnapshot = buildSectorPayload({ width, height, totalHexes, systemCount });
    if (payload.generatedAt) {
        state.lastSectorSnapshot.generatedAt = payload.generatedAt;
    }
    if (payload.multiSector && typeof payload.multiSector === 'object') {
        state.multiSector = payload.multiSector;
    } else {
        state.multiSector = {
            currentKey: '0,0',
            sectorsByKey: {}
        };
    }
    autoSaveSectorState();
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Load Sector' });
}
