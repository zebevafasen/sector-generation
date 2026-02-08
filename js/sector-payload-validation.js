import { normalizeDensityPresetKey } from './generation-data.js';
import { JUMP_GATE_POI_CATEGORY, normalizeJumpGateState, normalizePoiCategory } from './jump-gate-model.js';
import { MAX_GRID_DIMENSION, MIN_GRID_DIMENSION } from './config.js';
import { HOME_SECTOR_KEY, isSectorKey } from './sector-address.js';
import { isHexCoordInBounds, parseHexId } from './utils.js';

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toPositiveInt(value, fallback) {
    const parsed = Number.parseInt(String(value), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toBoundedPositiveInt(value, fallback) {
    const parsed = toPositiveInt(value, fallback);
    return Math.max(MIN_GRID_DIMENSION, Math.min(MAX_GRID_DIMENSION, parsed));
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
    const tags = Array.isArray(system.tags)
        ? system.tags.map((tag) => String(tag || '').trim()).filter(Boolean)
        : [];
    const starTags = Array.isArray(system.starTags)
        ? system.starTags.map((tag) => String(tag || '').trim()).filter(Boolean)
        : [];
    const planets = Array.isArray(system.planets)
        ? system.planets.map(sanitizeBody).filter(Boolean)
        : [];
    return {
        ...system,
        tags,
        starTags,
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
    const currentKey = typeof value.currentKey === 'string' && isSectorKey(value.currentKey)
        ? value.currentKey.trim().toUpperCase()
        : HOME_SECTOR_KEY;
    const selectedSectorKey = typeof value.selectedSectorKey === 'string' && isSectorKey(value.selectedSectorKey)
        ? value.selectedSectorKey.trim().toUpperCase()
        : currentKey;
    const sectorsByKey = {};
    Object.entries(value.sectorsByKey).forEach(([key, record]) => {
        if (!isPlainObject(record)) return;
        const coreHexId = typeof record.coreSystemHexId === 'string' && isPlainObject(record.sectors) && record.sectors[record.coreSystemHexId]
            ? record.coreSystemHexId
            : null;
        sectorsByKey[key] = {
            ...record,
            coreSystemHexId: coreHexId,
            coreSystemManual: !!(coreHexId && record.coreSystemManual)
        };
    });
    return {
        currentKey,
        selectedSectorKey,
        sectorsByKey,
        jumpGateRegistry: sanitizeJumpGateRegistry(value.jumpGateRegistry),
        expandedView: !!value.expandedView
    };
}

function sanitizeJumpGateRegistry(value) {
    if (!isPlainObject(value)) return {};
    const next = {};
    Object.entries(value).forEach(([pairId, pair]) => {
        if (typeof pairId !== 'string' || !pairId.trim()) return;
        if (!isPlainObject(pair) || !isPlainObject(pair.a) || !isPlainObject(pair.b)) return;
        const isValidEndpoint = (endpoint) => (
            endpoint
            && typeof endpoint.sectorKey === 'string'
            && isSectorKey(endpoint.sectorKey)
            && typeof endpoint.hexId === 'string'
            && !!parseHexId(endpoint.hexId)
        );
        if (!isValidEndpoint(pair.a) || !isValidEndpoint(pair.b)) return;
        const state = normalizeJumpGateState(pair.state);
        next[pairId.trim()] = {
            a: { sectorKey: pair.a.sectorKey, hexId: pair.a.hexId },
            b: { sectorKey: pair.b.sectorKey, hexId: pair.b.hexId },
            state: state || 'inactive'
        };
    });
    return next;
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
        const isRefuelingStation = !!poi.isRefuelingStation
            || (kind.toLowerCase() === 'navigation' && /refueling station/i.test(name));
        const parsedJumpGateState = normalizeJumpGateState(poi.jumpGateState);
        const parsedCategory = normalizePoiCategory(poi.poiCategory);
        const isJumpGateCategory = parsedCategory === JUMP_GATE_POI_CATEGORY || parsedJumpGateState !== null;
        const jumpGateState = isJumpGateCategory ? parsedJumpGateState : null;
        if (isJumpGateCategory && !jumpGateState) {
            dropped++;
            return;
        }
        const jumpGatePairId = isJumpGateCategory && typeof poi.jumpGatePairId === 'string' && poi.jumpGatePairId.trim()
            ? poi.jumpGatePairId.trim()
            : null;
        const hasValidLinkShape = isJumpGateCategory && isPlainObject(poi.jumpGateLink)
            && typeof poi.jumpGateLink.sectorKey === 'string'
            && typeof poi.jumpGateLink.hexId === 'string'
            && isSectorKey(poi.jumpGateLink.sectorKey)
            && !!parseHexId(poi.jumpGateLink.hexId);
        const jumpGateLink = isJumpGateCategory && isPlainObject(poi.jumpGateLink)
            && hasValidLinkShape
            ? { sectorKey: poi.jumpGateLink.sectorKey, hexId: poi.jumpGateLink.hexId }
            : null;
        if (isJumpGateCategory && jumpGateState === 'active' && (!jumpGatePairId || !jumpGateLink)) {
            dropped++;
            return;
        }
        if (isJumpGateCategory && jumpGateState === 'inactive' && jumpGatePairId && !jumpGateLink) {
            dropped++;
            return;
        }
        const jumpGateMeta = isJumpGateCategory && isPlainObject(poi.jumpGateMeta)
            ? JSON.parse(JSON.stringify(poi.jumpGateMeta))
            : null;
        deepSpacePois[hexId] = {
            name,
            kind,
            poiCategory: isJumpGateCategory ? JUMP_GATE_POI_CATEGORY : parsedCategory,
            summary,
            risk,
            rewardHint,
            isRefuelingStation,
            jumpGateState,
            jumpGatePairId,
            jumpGateLink,
            jumpGateMeta
        };
    });

    return { deepSpacePois, dropped };
}

function sanitizeViewState(value) {
    if (!isPlainObject(value)) return null;
    const x = Number(value.x);
    const y = Number(value.y);
    const scale = Number(value.scale);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(scale)) return null;
    return {
        x,
        y,
        scale: Math.max(0.2, Math.min(5, scale))
    };
}

function sanitizeSectorConfigSnapshot(value) {
    if (!isPlainObject(value)) return null;
    const toFinite = (raw, fallback) => {
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    const coreTagWeights = isPlainObject(value.coreTagWeights)
        ? Object.fromEntries(
            Object.entries(value.coreTagWeights).map(([key, weight]) => [
                String(key).trim().toLowerCase(),
                toFinite(weight, 0)
            ])
        )
        : {};
    const coreScoreWeights = isPlainObject(value.coreScoreWeights)
        ? Object.fromEntries(
            Object.entries(value.coreScoreWeights).map(([key, weight]) => [
                String(key),
                toFinite(weight, 0)
            ])
        )
        : {};
    return {
        ...value,
        starDistribution: value.starDistribution === 'standard' ? 'standard' : 'clusters',
        clusterV2Enabled: value.clusterV2Enabled ?? true,
        crossSectorContextEnabled: value.crossSectorContextEnabled ?? true,
        centerBiasStrength: Math.max(0, toFinite(value.centerBiasStrength, 1.35)),
        boundaryContinuityStrength: Math.max(0, toFinite(value.boundaryContinuityStrength, 0.55)),
        clusterAnchorJitter: Math.max(0, toFinite(value.clusterAnchorJitter, 1.25)),
        clusterGrowthDecay: Math.max(0.05, toFinite(value.clusterGrowthDecay, 0.82)),
        clusterSecondaryAnchorThreshold: Math.max(1, Math.floor(toFinite(value.clusterSecondaryAnchorThreshold, 11))),
        clusterEdgeBalance: Math.max(0, toFinite(value.clusterEdgeBalance, 0.26)),
        clusterCenterVoidProtection: Math.max(0, toFinite(value.clusterCenterVoidProtection, 0.35)),
        coreTagWeights,
        coreTagContributionCap: Math.max(0, toFinite(value.coreTagContributionCap, 16)),
        coreTagPerTagCap: Math.max(0, toFinite(value.coreTagPerTagCap, 8)),
        coreScoreWeights
    };
}

export function validateSectorPayload(rawPayload) {
    if (!isPlainObject(rawPayload)) {
        return { ok: false, error: 'Payload must be an object.' };
    }
    if (!isPlainObject(rawPayload.dimensions)) {
        return { ok: false, error: 'Missing dimensions.' };
    }

    const width = toBoundedPositiveInt(rawPayload.dimensions.width, 8);
    const height = toBoundedPositiveInt(rawPayload.dimensions.height, 10);
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
        starDistribution: rawPayload.starDistribution === 'standard' ? 'standard' : 'clusters',
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
        coreSystemHexId: typeof rawPayload.coreSystemHexId === 'string' && Object.prototype.hasOwnProperty.call(sectors, rawPayload.coreSystemHexId)
            ? rawPayload.coreSystemHexId
            : null,
        coreSystemManual: !!(typeof rawPayload.coreSystemHexId === 'string' && Object.prototype.hasOwnProperty.call(sectors, rawPayload.coreSystemHexId) && rawPayload.coreSystemManual),
        selectedHexId: typeof rawPayload.selectedHexId === 'string'
            && (Object.prototype.hasOwnProperty.call(sectors, rawPayload.selectedHexId)
                || Object.prototype.hasOwnProperty.call(deepSpacePois, rawPayload.selectedHexId))
            ? rawPayload.selectedHexId
            : null,
        viewState: sanitizeViewState(rawPayload.viewState),
        stats: {
            totalHexes: toPositiveInt(rawPayload.stats && rawPayload.stats.totalHexes, width * height),
            totalSystems: toNonNegativeInt(rawPayload.stats && rawPayload.stats.totalSystems, Object.keys(sectors).length)
        },
        multiSector: sanitizeMultiSector(rawPayload.multiSector),
        sectorConfigSnapshot: sanitizeSectorConfigSnapshot(rawPayload.sectorConfigSnapshot)
    };

    const totalDropped = dropped + droppedPois;
    return { ok: true, payload, warning: totalDropped > 0 ? `${totalDropped} invalid entries were ignored.` : null };
}
