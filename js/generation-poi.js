import { DEEP_SPACE_POI_TEMPLATES, JUMP_GATE_RULES } from './generation-data.js';
import { HOME_SECTOR_KEY, parseSectorKeyToCoords } from './sector-address.js';
import { countNeighborSystems, hexDistanceById } from './generation-spatial.js';
import {
    isActiveJumpGatePoi,
    isJumpGatePoi as isJumpGatePoiModel,
    JUMP_GATE_POI_CATEGORY,
    normalizePoiCategory
} from './jump-gate-model.js';

function parseSectorKey(sectorKey) {
    return parseSectorKeyToCoords(sectorKey || HOME_SECTOR_KEY);
}

function getNearbyActiveJumpGateStats(sectorKey, knownSectorRecords = {}) {
    const center = parseSectorKey(sectorKey);
    let nearestDistance = Number.POSITIVE_INFINITY;
    let adjacentCount = 0;
    let withinTwoCount = 0;
    let withinThreeCount = 0;
    Object.entries(knownSectorRecords).forEach(([otherKey, record]) => {
        if (!record || !record.deepSpacePois || otherKey === sectorKey) return;
        const other = parseSectorKey(otherKey);
        const dx = Math.abs(other.x - center.x);
        const dy = Math.abs(other.y - center.y);
        const distance = Math.max(dx, dy);
        if (!Number.isFinite(distance)) return;
        const activeInSector = Object.values(record.deepSpacePois).some(isActiveJumpGatePoi);
        if (!activeInSector) return;
        nearestDistance = Math.min(nearestDistance, distance);
        if (distance <= 1) adjacentCount++;
        if (distance <= 2) withinTwoCount++;
        if (distance <= 3) withinThreeCount++;
    });
    return {
        nearestDistance,
        adjacentCount,
        withinTwoCount,
        withinThreeCount
    };
}

function canSpawnActiveJumpGateInSector(sectorKey, knownSectorRecords = {}) {
    const stats = getNearbyActiveJumpGateStats(sectorKey, knownSectorRecords);
    const minSeparation = Number.isFinite(Number(JUMP_GATE_RULES.minSectorSeparation))
        ? Math.max(1, Number(JUMP_GATE_RULES.minSectorSeparation))
        : 2;
    // Minimum separation requirement: nearest active gate must be >= 2 sectors away.
    return !Number.isFinite(stats.nearestDistance) || stats.nearestDistance >= minSeparation;
}

export function getActiveJumpGateSectorWeightMultiplier(sectorKey, knownSectorRecords = {}) {
    if (!knownSectorRecords || typeof knownSectorRecords !== 'object') return 1;
    const stats = getNearbyActiveJumpGateStats(sectorKey, knownSectorRecords);
    const suppression = JUMP_GATE_RULES.activeSuppressionByDistance || {};
    const atOne = Number.isFinite(Number(suppression[1])) ? Math.max(0, Number(suppression[1])) : 0;
    const atTwo = Number.isFinite(Number(suppression[2])) ? Math.max(0, Number(suppression[2])) : 0.35;
    const atThree = Number.isFinite(Number(suppression[3])) ? Math.max(0, Number(suppression[3])) : 0.65;
    if (stats.adjacentCount > 0) return atOne;
    if (stats.withinTwoCount > 0) return atTwo;
    if (stats.withinThreeCount > 0) return atThree;
    return 1;
}

function getJumpGateEdgeWeightMultiplier(edgeDistance) {
    const weights = JUMP_GATE_RULES.edgeWeightByDistance || {};
    const atOne = Number.isFinite(Number(weights[1])) ? Number(weights[1]) : 1.8;
    const atTwo = Number.isFinite(Number(weights[2])) ? Number(weights[2]) : 1.35;
    const atThree = Number.isFinite(Number(weights[3])) ? Number(weights[3]) : 1.05;
    const fallback = Number.isFinite(Number(weights.default)) ? Number(weights.default) : 0.28;
    if (edgeDistance <= 1) return atOne;
    if (edgeDistance <= 2) return atTwo;
    if (edgeDistance <= 3) return atThree;
    return fallback;
}

function isJumpGateTemplate(template) {
    if (!template || typeof template !== 'object') return false;
    if (normalizePoiCategory(template.poiCategory) === JUMP_GATE_POI_CATEGORY) return true;
    return template.jumpGateState === 'active' || template.jumpGateState === 'inactive';
}

export function createDeepSpacePoi(options = {}) {
    const randomFn = options.randomFn || Math.random;
    const edgeDistance = Number.isFinite(options.edgeDistance) ? options.edgeDistance : Number.POSITIVE_INFINITY;
    const allowJumpGates = options.allowJumpGates !== false;
    const activeJumpGateWeightMultiplier = Number.isFinite(options.activeJumpGateWeightMultiplier)
        ? Math.max(0.01, options.activeJumpGateWeightMultiplier)
        : 1;
    const weightedTemplates = DEEP_SPACE_POI_TEMPLATES.filter((template) =>
        allowJumpGates || !isJumpGateTemplate(template)
    ).map((template) => {
        const baseWeight = Number.isFinite(template.weight) && template.weight > 0 ? template.weight : 1;
        const isJumpGate = isJumpGateTemplate(template);
        const isActiveJumpGate = template.jumpGateState === 'active';
        const edgeAdjustedWeight = isJumpGate
            ? baseWeight * getJumpGateEdgeWeightMultiplier(edgeDistance)
            : baseWeight;
        const suppressionAdjustedWeight = isActiveJumpGate
            ? edgeAdjustedWeight * activeJumpGateWeightMultiplier
            : edgeAdjustedWeight;
        return {
            template,
            weight: suppressionAdjustedWeight
        };
    });

    const totalWeight = weightedTemplates.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = randomFn() * totalWeight;
    let template = weightedTemplates[weightedTemplates.length - 1].template;
    for (let i = 0; i < weightedTemplates.length; i++) {
        const candidate = weightedTemplates[i];
        roll -= candidate.weight;
        if (roll <= 0) {
            template = candidate.template;
            break;
        }
    }
    const serial = Math.floor(randomFn() * 900) + 100;
    return {
        kind: template.kind,
        poiCategory: isJumpGateTemplate(template)
            ? JUMP_GATE_POI_CATEGORY
            : normalizePoiCategory(template.poiCategory),
        name: `${template.name} ${serial}`,
        summary: template.summary,
        risk: template.risk,
        rewardHint: template.rewardHint,
        isRefuelingStation: !!template.isRefuelingStation,
        jumpGateState: template.jumpGateState || null,
        jumpGatePairId: null,
        jumpGateLink: null,
        jumpGateMeta: template.jumpGateMeta && typeof template.jumpGateMeta === 'object'
            ? JSON.parse(JSON.stringify(template.jumpGateMeta))
            : null
    };
}

export function isJumpGatePoi(poi) {
    return isJumpGatePoiModel(poi);
}

export function generateDeepSpacePois(width, height, sectors, options = {}) {
    const randomFn = options.randomFn || Math.random;
    const sectorKey = typeof options.sectorKey === 'string' && options.sectorKey.trim()
        ? options.sectorKey.trim().toUpperCase()
        : HOME_SECTOR_KEY;
    const knownSectorRecords = options.knownSectorRecords && typeof options.knownSectorRecords === 'object'
        ? options.knownSectorRecords
        : {};
    const pois = {};
    const activeJumpGateWeightMultiplier = Number.isFinite(options.activeJumpGateWeightMultiplier)
        ? Math.max(0.01, options.activeJumpGateWeightMultiplier)
        : 1;
    const jumpGateHexes = [];
    const maxJumpGatesPerSector = Number.isFinite(Number(JUMP_GATE_RULES.maxPerSector))
        ? Math.max(0, Number(JUMP_GATE_RULES.maxPerSector))
        : 1;
    const minJumpGateSeparation = Number.isFinite(Number(JUMP_GATE_RULES.minHexSeparation))
        ? Math.max(1, Number(JUMP_GATE_RULES.minHexSeparation))
        : 4;
    const edgeDistanceMax = Number.isFinite(Number(JUMP_GATE_RULES.edgeDistanceMax))
        ? Math.max(0, Number(JUMP_GATE_RULES.edgeDistanceMax))
        : 2;
    const canSpawnActiveJumpGate = canSpawnActiveJumpGateInSector(sectorKey, knownSectorRecords);
    const coreSystemHexId = typeof options.coreSystemHexId === 'string' ? options.coreSystemHexId : null;
    let edgeSlotCount = 0;
    for (let c = 0; c < width; c++) {
        for (let r = 0; r < height; r++) {
            const hexId = `${c}-${r}`;
            if (sectors[hexId]) continue;
            const edgeDistance = Math.min(c, r, (width - 1) - c, (height - 1) - r);
            if (edgeDistance <= edgeDistanceMax) edgeSlotCount++;
        }
    }
    const canSpawnJumpGateAtAll = edgeSlotCount > 0;

    for (let c = 0; c < width; c++) {
        for (let r = 0; r < height; r++) {
            const hexId = `${c}-${r}`;
            if (sectors[hexId]) continue;

            const nearbySystems = countNeighborSystems(hexId, sectors);
            const baseChance = 0.035;
            const nearbyBoost = nearbySystems > 0 ? Math.min(0.05, nearbySystems * 0.015) : 0;
            const remoteBoost = nearbySystems === 0 ? 0.015 : 0;
            const coreDistance = coreSystemHexId ? hexDistanceById(coreSystemHexId, hexId) : Number.POSITIVE_INFINITY;
            const coreRadialBoost = Number.isFinite(coreDistance)
                ? Math.max(0, 0.018 - (coreDistance * 0.0035))
                : 0;
            const spawnChance = baseChance + nearbyBoost + remoteBoost + coreRadialBoost;
            if (randomFn() > spawnChance) continue;
            const edgeDistance = Math.min(c, r, (width - 1) - c, (height - 1) - r);
            const canRollJumpGateAtHex = canSpawnJumpGateAtAll
                && jumpGateHexes.length < maxJumpGatesPerSector
                && edgeDistance <= edgeDistanceMax;
            let poi = createDeepSpacePoi({
                edgeDistance,
                allowJumpGates: canRollJumpGateAtHex,
                activeJumpGateWeightMultiplier,
                randomFn
            });
            if (isJumpGatePoi(poi)) {
                const isAtGateCap = jumpGateHexes.length >= maxJumpGatesPerSector;
                const isTooCloseToOtherGate = jumpGateHexes.some((otherHexId) =>
                    hexDistanceById(otherHexId, hexId) < minJumpGateSeparation
                );
                const isOutsideEdgeWindow = edgeDistance > edgeDistanceMax;
                const isBlockedActiveGate = poi.jumpGateState === 'active' && !canSpawnActiveJumpGate;
                if (isAtGateCap || isTooCloseToOtherGate || isOutsideEdgeWindow || isBlockedActiveGate) {
                    poi = createDeepSpacePoi({ edgeDistance, allowJumpGates: false, activeJumpGateWeightMultiplier, randomFn });
                }
            }
            if (isJumpGatePoi(poi)) {
                jumpGateHexes.push(hexId);
            }
            pois[hexId] = poi;
        }
    }
    return pois;
}
