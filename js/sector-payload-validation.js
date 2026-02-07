import { normalizeDensityPresetKey } from './generation-data.js';
import { isHexCoordInBounds, parseHexId } from './utils.js';

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toPositiveInt(value, fallback) {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toNonNegativeInt(value, fallback = 0) {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function sanitizeBody(body) {
    if (!isPlainObject(body)) return null;
    const nextType = typeof body.type === 'string' && body.type.trim() ? body.type.trim() : 'Barren';
    return {
        ...body,
        type: nextType
    };
}

function sanitizeSystem(system) {
    if (!isPlainObject(system)) return null;
    const planets = Array.isArray(system.planets)
        ? system.planets.map(sanitizeBody).filter(Boolean)
        : [];
    return {
        ...system,
        planets
    };
}

function sanitizeSectors(rawSectors, width, height) {
    if (!isPlainObject(rawSectors)) {
        return { sectors: null, dropped: 0 };
    }

    const sectors = {};
    let dropped = 0;
    Object.entries(rawSectors).forEach(([hexId, system]) => {
        const parsed = parseHexId(hexId);
        if (!parsed || !isHexCoordInBounds(parsed.col, parsed.row, width, height)) {
            dropped++;
            return;
        }
        const normalizedSystem = sanitizeSystem(system);
        if (!normalizedSystem) {
            dropped++;
            return;
        }
        sectors[hexId] = normalizedSystem;
    });

    return { sectors, dropped };
}

function sanitizeMultiSector(value) {
    if (!isPlainObject(value) || !isPlainObject(value.sectorsByKey)) return null;
    return {
        currentKey: typeof value.currentKey === 'string' && value.currentKey.trim() ? value.currentKey : '0,0',
        sectorsByKey: value.sectorsByKey
    };
}

function sanitizeDeepSpacePois(rawPois, width, height, sectors) {
    if (!isPlainObject(rawPois)) return { deepSpacePois: {}, dropped: 0 };
    const deepSpacePois = {};
    let dropped = 0;

    Object.entries(rawPois).forEach(([hexId, poi]) => {
        const parsed = parseHexId(hexId);
        if (!parsed || !isHexCoordInBounds(parsed.col, parsed.row, width, height) || sectors[hexId]) {
            dropped++;
            return;
        }
        if (!isPlainObject(poi)) {
            dropped++;
            return;
        }
        const name = typeof poi.name === 'string' && poi.name.trim() ? poi.name.trim() : 'Unknown Site';
        const kind = typeof poi.kind === 'string' && poi.kind.trim() ? poi.kind.trim() : 'Unknown';
        const summary = typeof poi.summary === 'string' && poi.summary.trim()
            ? poi.summary.trim()
            : 'Uncatalogued deep-space point of interest.';
        const risk = typeof poi.risk === 'string' && poi.risk.trim() ? poi.risk.trim() : 'Unknown';
        const rewardHint = typeof poi.rewardHint === 'string' && poi.rewardHint.trim()
            ? poi.rewardHint.trim()
            : 'No additional intel.';
        deepSpacePois[hexId] = { name, kind, summary, risk, rewardHint };
    });

    return { deepSpacePois, dropped };
}

export function validateSectorPayload(rawPayload) {
    if (!isPlainObject(rawPayload)) {
        return { ok: false, error: 'Payload must be an object.' };
    }
    if (!isPlainObject(rawPayload.dimensions)) {
        return { ok: false, error: 'Missing dimensions.' };
    }

    const width = toPositiveInt(rawPayload.dimensions.width, 8);
    const height = toPositiveInt(rawPayload.dimensions.height, 10);
    const { sectors, dropped } = sanitizeSectors(rawPayload.sectors, width, height);
    if (!sectors) {
        return { ok: false, error: 'Missing or invalid sectors object.' };
    }
    if (Object.keys(rawPayload.sectors || {}).length > 0 && !Object.keys(sectors).length) {
        return { ok: false, error: 'No valid systems were found in sector data.' };
    }
    const { deepSpacePois, dropped: droppedPois } = sanitizeDeepSpacePois(rawPayload.deepSpacePois, width, height, sectors);

    const manualMin = toNonNegativeInt(rawPayload.manualRange && rawPayload.manualRange.min, 0);
    const manualMax = toNonNegativeInt(rawPayload.manualRange && rawPayload.manualRange.max, 0);
    const normalizedMin = Math.min(manualMin, manualMax);
    const normalizedMax = Math.max(manualMin, manualMax);

    const payload = {
        ...rawPayload,
        dimensions: { width, height },
        sizeMode: rawPayload.sizeMode === 'custom' ? 'custom' : 'preset',
        sizePreset: typeof rawPayload.sizePreset === 'string' ? rawPayload.sizePreset : 'standard',
        densityMode: rawPayload.densityMode === 'manual' ? 'manual' : 'preset',
        densityPreset: normalizeDensityPresetKey(rawPayload.densityPreset),
        generationProfile: typeof rawPayload.generationProfile === 'string' && rawPayload.generationProfile
            ? rawPayload.generationProfile
            : 'high_adventure',
        starDistribution: rawPayload.starDistribution === 'clusters' ? 'clusters' : 'standard',
        seed: typeof rawPayload.seed === 'string' ? rawPayload.seed : '',
        layoutSeed: typeof rawPayload.layoutSeed === 'string'
            ? rawPayload.layoutSeed
            : (typeof rawPayload.seed === 'string' ? rawPayload.seed : ''),
        rerollIteration: toNonNegativeInt(rawPayload.rerollIteration, 0),
        manualRange: { min: normalizedMin, max: normalizedMax },
        autoSeed: typeof rawPayload.autoSeed === 'boolean' ? rawPayload.autoSeed : false,
        realisticPlanetWeights: !!rawPayload.realisticPlanetWeights,
        sectors,
        deepSpacePois,
        pinnedHexIds: Array.isArray(rawPayload.pinnedHexIds)
            ? rawPayload.pinnedHexIds.filter((hexId) =>
                typeof hexId === 'string'
                && (Object.prototype.hasOwnProperty.call(sectors, hexId) || Object.prototype.hasOwnProperty.call(deepSpacePois, hexId))
            )
            : [],
        selectedHexId: typeof rawPayload.selectedHexId === 'string'
            && (Object.prototype.hasOwnProperty.call(sectors, rawPayload.selectedHexId)
                || Object.prototype.hasOwnProperty.call(deepSpacePois, rawPayload.selectedHexId))
            ? rawPayload.selectedHexId
            : null,
        stats: {
            totalHexes: toPositiveInt(rawPayload.stats && rawPayload.stats.totalHexes, width * height),
            totalSystems: toNonNegativeInt(rawPayload.stats && rawPayload.stats.totalSystems, Object.keys(sectors).length)
        },
        multiSector: sanitizeMultiSector(rawPayload.multiSector),
        sectorConfigSnapshot: isPlainObject(rawPayload.sectorConfigSnapshot) ? rawPayload.sectorConfigSnapshot : null
    };

    const totalDropped = dropped + droppedPois;
    return { ok: true, payload, warning: totalDropped > 0 ? `${totalDropped} invalid entries were ignored.` : null };
}
