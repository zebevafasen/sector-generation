import {
    LOCAL_STORAGE_KEY,
    state
} from './config.js';
import { isAutoSeedEnabled, isRealisticPlanetWeightingEnabled, setSeed, showStatusMessage } from './core.js';
import { setDensityMode, setSizeMode, syncDensityPresetForProfile } from './controls.js';
import { EVENTS, emitEvent } from './events.js';
import { normalizeDensityPresetKey } from './generation-data.js';
import { getGlobalHexDisplayId } from './render-shared.js';
import { clearInfoPanel, drawGrid, selectHex } from './render.js';
import { readGenerationConfigFromUi } from './sector-config.js';
import { validateSectorPayload } from './sector-payload-validation.js';
import { ensureSystemStarFields, getSystemStars } from './star-system.js';
import { sortHexIds } from './utils.js';

const AUTO_SAVE_STORAGE_KEY = `${LOCAL_STORAGE_KEY}:autosave`;
const MANUAL_SAVE_STORAGE_KEY = `${LOCAL_STORAGE_KEY}:manual`;

function getStorageUiRefs() {
    return {
        gridWidthInput: document.getElementById('gridWidth'),
        gridHeightInput: document.getElementById('gridHeight'),
        sizePresetSelect: document.getElementById('sizePreset'),
        densityPresetSelect: document.getElementById('densityPreset'),
        manualMinInput: document.getElementById('manualMin'),
        manualMaxInput: document.getElementById('manualMax'),
        generationProfileSelect: document.getElementById('generationProfile'),
        starDistributionSelect: document.getElementById('starDistribution'),
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

function readFirstValidPayloadFromStorage(keys) {
    if (!(typeof window !== 'undefined' && window.localStorage)) {
        return { payload: null, sourceKey: null, errors: [] };
    }

    const errors = [];
    for (const key of keys) {
        if (!key) continue;
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        try {
            const parsed = JSON.parse(raw);
            const validation = validateSectorPayload(parsed);
            if (!validation.ok) {
                errors.push(`${key}: ${validation.error}`);
                continue;
            }
            return { payload: validation.payload, sourceKey: key, errors };
        } catch {
            errors.push(`${key}: unreadable JSON`);
        }
    }

    return { payload: null, sourceKey: null, errors };
}

function getSafeSeedValue(seed) {
    return String(seed || 'sector').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'sector';
}

function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function hasSectorDataForExport() {
    if (state.lastSectorSnapshot) return true;
    return Object.keys(state.sectors || {}).length > 0;
}

function getExportSvgSnapshot() {
    const sourceSvg = document.getElementById('hexGrid');
    if (!sourceSvg) return null;
    const rect = sourceSvg.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || sourceSvg.clientWidth || 1200));
    const height = Math.max(1, Math.round(rect.height || sourceSvg.clientHeight || 800));

    const clone = sourceSvg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', '0');
    bgRect.setAttribute('y', '0');
    bgRect.setAttribute('width', String(width));
    bgRect.setAttribute('height', String(height));
    bgRect.setAttribute('fill', '#020617');
    clone.insertBefore(bgRect, clone.firstChild);

    const markup = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
    return { markup, width, height };
}

function classifyBody(body) {
    const type = String(body && body.type ? body.type : '');
    if (type === 'Artificial') return 'station';
    if (type === 'Asteroid Belt' || type === 'Debris Field') return 'belt';
    return 'planet';
}

function formatBodyPopulation(pop) {
    const numeric = Number(pop);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return `${numeric.toFixed(1)}B`;
}

function buildGmBrief(payload) {
    const lines = [];
    const pinnedSet = new Set(Array.isArray(state.pinnedHexIds) ? state.pinnedHexIds : []);
    const hexIds = sortHexIds(Object.keys(state.sectors || {}));
    const generatedAt = payload && payload.generatedAt ? payload.generatedAt : new Date().toISOString();
    const width = payload && payload.dimensions ? payload.dimensions.width : 0;
    const height = payload && payload.dimensions ? payload.dimensions.height : 0;
    const stats = payload && payload.stats ? payload.stats : { totalHexes: 0, totalSystems: hexIds.length };

    lines.push('Hex Star Sector GM Brief');
    lines.push(`Generated: ${generatedAt}`);
    lines.push(`Seed: ${payload && payload.seed ? payload.seed : 'N/A'}`);
    lines.push(`Layout Seed: ${payload && payload.layoutSeed ? payload.layoutSeed : 'N/A'}`);
    lines.push(`Grid: ${width} x ${height} (${stats.totalHexes} hexes)`);
    lines.push(`Systems: ${stats.totalSystems}`);
    lines.push('');

    if (!hexIds.length) {
        lines.push('No systems generated.');
        return lines.join('\n');
    }

    hexIds.forEach((hexId) => {
        const system = state.sectors[hexId];
        if (!system) return;
        const bodies = Array.isArray(system.planets) ? system.planets : [];
        let planetCount = 0;
        let habitableCount = 0;
        let beltCount = 0;
        let stationCount = 0;
        const tags = new Set();
        const features = new Set();
        const notableWorlds = [];

        bodies.forEach((body) => {
            const bodyKind = classifyBody(body);
            if (bodyKind === 'planet') {
                planetCount++;
                if (body && body.habitable) habitableCount++;
            } else if (bodyKind === 'belt') {
                beltCount++;
            } else if (bodyKind === 'station') {
                stationCount++;
            }

            const popLabel = formatBodyPopulation(body && body.pop);
            if (popLabel) {
                notableWorlds.push(`${body.name || body.type || 'Body'} (${popLabel})`);
            }
            if (Array.isArray(body && body.tags)) {
                body.tags.forEach((tag) => {
                    if (typeof tag === 'string' && tag.trim()) tags.add(tag.trim());
                });
            }
            if (Array.isArray(body && body.features)) {
                body.features.forEach((feature) => {
                    if (typeof feature === 'string' && feature.trim()) features.add(feature.trim());
                });
            }
        });

        const globalHexId = getGlobalHexDisplayId(hexId);
        lines.push(`[${globalHexId}] ${system.name || 'Unnamed System'}${pinnedSet.has(hexId) ? ' [PINNED]' : ''}`);
        const stars = getSystemStars(system);
        const starClassLabel = stars.map(star => star.class).join(' + ');
        lines.push(`Stars: ${starClassLabel || '--'} | Primary Age: ${system.starAge || '--'} | Total Pop: ${system.totalPop || 'None'}`);
        lines.push(`Local Hex: ${hexId}`);
        lines.push(`Bodies: ${planetCount} planets (${habitableCount} habitable), ${beltCount} belts/fields, ${stationCount} stations`);
        if (tags.size) lines.push(`Tags: ${Array.from(tags).sort().join(', ')}`);
        if (features.size) lines.push(`POI/Features: ${Array.from(features).sort().join(', ')}`);
        if (notableWorlds.length) {
            const topWorlds = notableWorlds.slice(0, 4).join('; ');
            lines.push(`Notable Worlds: ${topWorlds}`);
        }
        lines.push('');
    });

    return lines.join('\n');
}

export function buildSectorPayload(meta = {}) {
    const uiConfig = readGenerationConfigFromUi({
        sizeMode: state.sizeMode,
        densityMode: state.densityMode
    });
    const width = Number.isFinite(meta.width) ? meta.width : (parseInt(String(uiConfig.width), 10) || 0);
    const height = Number.isFinite(meta.height) ? meta.height : (parseInt(String(uiConfig.height), 10) || 0);
    const totalHexes = Number.isFinite(meta.totalHexes) ? meta.totalHexes : width * height;
    const totalSystems = Number.isFinite(meta.systemCount) ? meta.systemCount : Object.keys(state.sectors).length;

    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        seed: state.currentSeed,
        layoutSeed: state.layoutSeed || state.currentSeed || '',
        rerollIteration: Number.isFinite(Number(state.rerollIteration)) ? Number(state.rerollIteration) : 0,
        sizeMode: uiConfig.sizeMode,
        sizePreset: uiConfig.sizeMode === 'preset'
            ? uiConfig.sizePreset
            : 'custom',
        densityMode: uiConfig.densityMode,
        densityPreset: uiConfig.densityPreset,
        manualRange: {
            min: Number.isFinite(uiConfig.manualMin) ? uiConfig.manualMin : 0,
            max: Number.isFinite(uiConfig.manualMax) ? uiConfig.manualMax : 0
        },
        autoSeed: isAutoSeedEnabled(),
        realisticPlanetWeights: isRealisticPlanetWeightingEnabled() || !!uiConfig.realisticPlanetWeights,
        generationProfile: uiConfig.generationProfile || 'high_adventure',
        starDistribution: uiConfig.starDistribution || 'standard',
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
        window.localStorage.setItem(AUTO_SAVE_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
        console.error(err);
    }
}

export function restoreCachedSectorState() {
    if (!(typeof window !== 'undefined' && window.localStorage)) return false;
    try {
        const result = readFirstValidPayloadFromStorage([
            AUTO_SAVE_STORAGE_KEY,
            MANUAL_SAVE_STORAGE_KEY,
            LOCAL_STORAGE_KEY
        ]);
        if (!result.payload) return false;
        applySectorPayload(result.payload);
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
        window.localStorage.setItem(MANUAL_SAVE_STORAGE_KEY, JSON.stringify(payload));
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
        const result = readFirstValidPayloadFromStorage([
            MANUAL_SAVE_STORAGE_KEY,
            LOCAL_STORAGE_KEY
        ]);
        if (!result.payload) {
            showStatusMessage('No saved sector found.', 'warn');
            return;
        }
        applySectorPayload(result.payload);
        if (result.errors.length) {
            const firstError = result.errors[0];
            showStatusMessage(`Loaded saved sector (ignored invalid older save: ${firstError}).`, 'warn');
            return;
        }
        showStatusMessage('Loaded saved sector.', 'success');
    } catch (err) {
        console.error(err);
        showStatusMessage('Failed to load saved sector.', 'error');
    }
}

export function exportSector() {
    if (!hasSectorDataForExport()) {
        showStatusMessage('Generate a sector before exporting.', 'warn');
        return;
    }
    try {
        const payload = buildSectorPayload();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const safeSeed = getSafeSeedValue(payload.seed);
        triggerBlobDownload(blob, `sector-${safeSeed}.json`);
        showStatusMessage('Exported sector JSON.', 'success');
    } catch (err) {
        console.error(err);
        showStatusMessage('Export failed.', 'error');
    }
}

export function exportSectorSvg() {
    if (!hasSectorDataForExport()) {
        showStatusMessage('Generate a sector before exporting.', 'warn');
        return;
    }
    try {
        const payload = buildSectorPayload();
        const snapshot = getExportSvgSnapshot();
        if (!snapshot) {
            showStatusMessage('Map export unavailable.', 'error');
            return;
        }
        const blob = new Blob([snapshot.markup], { type: 'image/svg+xml;charset=utf-8' });
        triggerBlobDownload(blob, `sector-${getSafeSeedValue(payload.seed)}.svg`);
        showStatusMessage('Exported map as SVG.', 'success');
    } catch (err) {
        console.error(err);
        showStatusMessage('SVG export failed.', 'error');
    }
}

export function exportSectorPng() {
    if (!hasSectorDataForExport()) {
        showStatusMessage('Generate a sector before exporting.', 'warn');
        return;
    }
    try {
        const payload = buildSectorPayload();
        const snapshot = getExportSvgSnapshot();
        if (!snapshot) {
            showStatusMessage('Map export unavailable.', 'error');
            return;
        }

        const svgBlob = new Blob([snapshot.markup], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        const image = new Image();
        image.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = snapshot.width;
                canvas.height = snapshot.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    URL.revokeObjectURL(url);
                    showStatusMessage('PNG export unavailable.', 'error');
                    return;
                }
                ctx.drawImage(image, 0, 0, snapshot.width, snapshot.height);
                canvas.toBlob((blob) => {
                    URL.revokeObjectURL(url);
                    if (!blob) {
                        showStatusMessage('PNG export failed.', 'error');
                        return;
                    }
                    triggerBlobDownload(blob, `sector-${getSafeSeedValue(payload.seed)}.png`);
                    showStatusMessage('Exported map as PNG.', 'success');
                }, 'image/png');
            } catch (err) {
                URL.revokeObjectURL(url);
                console.error(err);
                showStatusMessage('PNG export failed.', 'error');
            }
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            showStatusMessage('PNG export failed.', 'error');
        };
        image.src = url;
    } catch (err) {
        console.error(err);
        showStatusMessage('PNG export failed.', 'error');
    }
}

export function exportSectorGmBrief() {
    if (!hasSectorDataForExport()) {
        showStatusMessage('Generate a sector before exporting.', 'warn');
        return;
    }
    try {
        const payload = buildSectorPayload();
        const brief = buildGmBrief(payload);
        const blob = new Blob([brief], { type: 'text/plain;charset=utf-8' });
        triggerBlobDownload(blob, `sector-${getSafeSeedValue(payload.seed)}-gm-brief.txt`);
        showStatusMessage('Exported GM brief.', 'success');
    } catch (err) {
        console.error(err);
        showStatusMessage('GM brief export failed.', 'error');
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
            const validation = validateSectorPayload(payload);
            if (!validation.ok) {
                showStatusMessage(`Invalid sector file: ${validation.error}`, 'error');
                return;
            }
            applySectorPayload(validation.payload);
            if (validation.warning) {
                showStatusMessage(`Imported sector with warnings: ${validation.warning}`, 'warn');
                return;
            }
            showStatusMessage('Imported sector data.', 'success');
        } catch (err) {
            console.error(err);
            showStatusMessage('Invalid sector file.', 'error');
        }
    };
    reader.readAsText(file);
}

export function applySectorPayload(payload) {
    const validation = validateSectorPayload(payload);
    if (!validation.ok) {
        showStatusMessage(`Sector file invalid: ${validation.error}`, 'error');
        return;
    }
    const nextPayload = validation.payload;

    const refs = getStorageUiRefs();
    if (nextPayload.sizePreset && nextPayload.sizePreset !== 'custom' && refs.sizePresetSelect) {
        refs.sizePresetSelect.value = nextPayload.sizePreset;
    }
    if (nextPayload.sizeMode) {
        setSizeMode(nextPayload.sizeMode);
    }

    const width = parseInt(nextPayload.dimensions.width, 10) || 1;
    const height = parseInt(nextPayload.dimensions.height, 10) || 1;
    refs.gridWidthInput.value = width;
    refs.gridHeightInput.value = height;

    if (nextPayload.generationProfile && refs.generationProfileSelect) {
        refs.generationProfileSelect.value = nextPayload.generationProfile;
    }
    if (refs.starDistributionSelect) {
        refs.starDistributionSelect.value = nextPayload.starDistribution === 'clusters' ? 'clusters' : 'standard';
    }
    syncDensityPresetForProfile(refs.generationProfileSelect ? refs.generationProfileSelect.value : 'high_adventure');
    if (nextPayload.densityMode) {
        setDensityMode(nextPayload.densityMode);
    }
    if (refs.densityPresetSelect) {
        refs.densityPresetSelect.value = normalizeDensityPresetKey(nextPayload.densityPreset);
    }
    if (nextPayload.manualRange) {
        if (typeof nextPayload.manualRange.min === 'number') {
            refs.manualMinInput.value = nextPayload.manualRange.min;
        }
        if (typeof nextPayload.manualRange.max === 'number') {
            refs.manualMaxInput.value = nextPayload.manualRange.max;
        }
    }
    if (typeof nextPayload.autoSeed === 'boolean') {
        if (refs.autoSeedToggle) refs.autoSeedToggle.checked = nextPayload.autoSeed;
    }
    if (typeof nextPayload.realisticPlanetWeights === 'boolean') {
        if (refs.realisticWeightsToggle) refs.realisticWeightsToggle.checked = nextPayload.realisticPlanetWeights;
    }
    if (refs.seedInput) refs.seedInput.value = nextPayload.seed || '';

    if (nextPayload.seed) {
        setSeed(nextPayload.seed);
    } else {
        state.currentSeed = '';
        state.seededRandomFn = () => Math.random();
    }
    state.layoutSeed = String(nextPayload.layoutSeed || nextPayload.seed || state.currentSeed || '');
    state.rerollIteration = Number.isFinite(Number(nextPayload.rerollIteration)) ? Number(nextPayload.rerollIteration) : 0;

    state.sectors = nextPayload.sectors || {};
    Object.values(state.sectors).forEach((system) => ensureSystemStarFields(system));
    state.pinnedHexIds = Array.isArray(nextPayload.pinnedHexIds)
        ? nextPayload.pinnedHexIds.filter(hexId => !!state.sectors[hexId])
        : [];
    state.sectorConfigSnapshot = nextPayload.sectorConfigSnapshot || {
        sizeMode: nextPayload.sizeMode || state.sizeMode,
        sizePreset: nextPayload.sizePreset || 'standard',
        width,
        height,
        densityMode: nextPayload.densityMode || state.densityMode,
        densityPreset: normalizeDensityPresetKey(nextPayload.densityPreset),
        manualMin: nextPayload.manualRange && typeof nextPayload.manualRange.min === 'number' ? nextPayload.manualRange.min : 0,
        manualMax: nextPayload.manualRange && typeof nextPayload.manualRange.max === 'number' ? nextPayload.manualRange.max : 0,
        generationProfile: nextPayload.generationProfile || 'high_adventure',
        starDistribution: nextPayload.starDistribution === 'clusters' ? 'clusters' : 'standard',
        realisticPlanetWeights: !!nextPayload.realisticPlanetWeights
    };
    state.selectedHexId = null;
    clearInfoPanel();
    drawGrid(width, height);
    if (nextPayload.selectedHexId && state.sectors[nextPayload.selectedHexId]) {
        const group = document.querySelector(`.hex-group[data-id="${nextPayload.selectedHexId}"]`);
        if (group) selectHex(nextPayload.selectedHexId, group);
    }

    const totalHexes = nextPayload.stats && Number.isFinite(nextPayload.stats.totalHexes) ? nextPayload.stats.totalHexes : width * height;
    const systemCount = nextPayload.stats && Number.isFinite(nextPayload.stats.totalSystems) ? nextPayload.stats.totalSystems : Object.keys(state.sectors).length;
    updateStatusLabels(refs, totalHexes, systemCount);
    state.lastSectorSnapshot = buildSectorPayload({ width, height, totalHexes, systemCount });
    if (nextPayload.generatedAt) {
        state.lastSectorSnapshot.generatedAt = nextPayload.generatedAt;
    }
    if (nextPayload.multiSector && typeof nextPayload.multiSector === 'object') {
        state.multiSector = nextPayload.multiSector;
    } else {
        state.multiSector = {
            currentKey: '0,0',
            sectorsByKey: {}
        };
    }
    autoSaveSectorState();
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Load Sector' });
}
