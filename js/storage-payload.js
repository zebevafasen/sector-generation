import { LOCAL_STORAGE_KEY, state } from './config.js';
import { isAutoSeedEnabled, isRealisticPlanetWeightingEnabled } from './core.js';
import { getGlobalHexDisplayId } from './render-shared.js';
import { readGenerationConfigFromUi } from './sector-config.js';
import { validateSectorPayload } from './sector-payload-validation.js';
import { getSystemStars } from './star-system.js';
import { sortHexIds } from './utils.js';

export const AUTO_SAVE_STORAGE_KEY = `${LOCAL_STORAGE_KEY}:autosave`;
export const MANUAL_SAVE_STORAGE_KEY = `${LOCAL_STORAGE_KEY}:manual`;
export const VIEW_STATE_STORAGE_KEY = `${LOCAL_STORAGE_KEY}:view`;

export function readFirstValidPayloadFromStorage(keys) {
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

export function getSafeSeedValue(seed) {
    return String(seed || 'sector').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'sector';
}

export function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function hasSectorDataForExport() {
    if (state.lastSectorSnapshot) return true;
    return Object.keys(state.sectors || {}).length > 0;
}

export function getExportSvgSnapshot() {
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

export function buildGmBrief(payload) {
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
        const starClassLabel = stars.map((star) => star.class).join(' + ');
        lines.push(`Stars: ${starClassLabel || '--'} | Primary Age: ${system.starAge || '--'} | Total Pop: ${system.totalPop || 'None'}`);
        lines.push(`Hex: ${globalHexId}`);
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
        viewState: {
            x: Number.isFinite(state.viewState && state.viewState.x) ? state.viewState.x : 0,
            y: Number.isFinite(state.viewState && state.viewState.y) ? state.viewState.y : 0,
            scale: Number.isFinite(state.viewState && state.viewState.scale) ? state.viewState.scale : 1
        },
        multiSector: state.multiSector || null,
        dimensions: { width, height },
        stats: { totalHexes, totalSystems },
        deepSpacePois: JSON.parse(JSON.stringify(state.deepSpacePois || {})),
        sectors: JSON.parse(JSON.stringify(state.sectors))
    };
}
