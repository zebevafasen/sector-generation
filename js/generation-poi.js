import { DEEP_SPACE_POI_TEMPLATES, JUMP_GATE_RULES, getDensityRatioForPreset, normalizeDensityPresetKey } from './generation-data.js';
import { HOME_SECTOR_KEY, parseSectorKeyToCoords } from './sector-address.js';
import { hexDistanceById } from './generation-spatial.js';
import { parseHexId } from './utils.js';
import {
    isActiveJumpGatePoi,
    isJumpGatePoi as isJumpGatePoiModel,
    JUMP_GATE_POI_CATEGORY,
    normalizePoiCategory
} from './jump-gate-model.js';

function parseSectorKey(sectorKey) {
    return parseSectorKeyToCoords(sectorKey || HOME_SECTOR_KEY);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function shuffleInPlace(values, randomFn) {
    for (let i = values.length - 1; i > 0; i--) {
        const j = Math.floor(randomFn() * (i + 1));
        const tmp = values[i];
        values[i] = values[j];
        values[j] = tmp;
    }
}

function computeNeighborhoodEmptinessScore(hexId, width, height, occupiedHexIds) {
    const parsed = parseHexId(hexId);
    if (!parsed) return 0;
    let immediateTotal = 0;
    let immediateOccupied = 0;
    let nearbyTotal = 0;
    let nearbyOccupied = 0;

    const minCol = Math.max(0, parsed.col - 2);
    const maxCol = Math.min(width - 1, parsed.col + 2);
    const minRow = Math.max(0, parsed.row - 2);
    const maxRow = Math.min(height - 1, parsed.row + 2);

    for (let c = minCol; c <= maxCol; c++) {
        for (let r = minRow; r <= maxRow; r++) {
            const otherHexId = `${c}-${r}`;
            if (otherHexId === hexId) continue;
            const distance = hexDistanceById(hexId, otherHexId);
            if (!Number.isFinite(distance) || distance <= 0 || distance > 2) continue;
            const isOccupied = occupiedHexIds.has(otherHexId);
            nearbyTotal++;
            if (isOccupied) nearbyOccupied++;
            if (distance <= 1) {
                immediateTotal++;
                if (isOccupied) immediateOccupied++;
            }
        }
    }

    const immediateEmptyRatio = immediateTotal > 0
        ? 1 - (immediateOccupied / immediateTotal)
        : 1;
    const nearbyEmptyRatio = nearbyTotal > 0
        ? 1 - (nearbyOccupied / nearbyTotal)
        : 1;
    return clamp((immediateEmptyRatio * 0.72) + (nearbyEmptyRatio * 0.28), 0, 1);
}

function getDensityRatioFromConfig(config, totalHexes, sectors) {
    if (!config || typeof config !== 'object') {
        return clamp(Object.keys(sectors || {}).length / Math.max(1, totalHexes), 0, 1);
    }
    if (config.densityMode === 'manual') {
        const min = Number(config.manualMin);
        const max = Number(config.manualMax);
        if (Number.isFinite(min) && Number.isFinite(max)) {
            return clamp(((Math.max(0, min) + Math.max(0, max)) / 2) / Math.max(1, totalHexes), 0, 1);
        }
    }
    const preset = normalizeDensityPresetKey(config.densityPreset);
    const profile = String(config.generationProfile || 'high_adventure');
    return clamp(getDensityRatioForPreset(preset, profile), 0, 1);
}

function computePoiTargetCount(width, height, sectors, options, randomFn) {
    const totalHexes = Math.max(1, width * height);
    const systemCount = Object.keys(sectors || {}).length;
    const availableHexes = Math.max(0, totalHexes - systemCount);
    const densityRatio = getDensityRatioFromConfig(options.config, totalHexes, sectors);
    const basePoiRatio = clamp(0.018 + (densityRatio * 0.13), 0.012, 0.11);
    const baseTarget = totalHexes * basePoiRatio;
    const variance = ((randomFn() - 0.5) * 2) * 1.2;
    const target = Math.round(baseTarget + variance);
    return clamp(target, 0, availableHexes);
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

function buildPoiFromTemplate(template, randomFn) {
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

function pickWeightedTemplate(weightedTemplates, randomFn) {
    const totalWeight = weightedTemplates.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) return weightedTemplates.length ? weightedTemplates[weightedTemplates.length - 1].template : null;
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
    return template;
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

    const template = pickWeightedTemplate(weightedTemplates, randomFn);
    return template ? buildPoiFromTemplate(template, randomFn) : null;
}

function createJumpGatePoi(options = {}) {
    const randomFn = options.randomFn || Math.random;
    const edgeDistance = Number.isFinite(options.edgeDistance) ? options.edgeDistance : Number.POSITIVE_INFINITY;
    const activeJumpGateWeightMultiplier = Number.isFinite(options.activeJumpGateWeightMultiplier)
        ? Math.max(0.01, options.activeJumpGateWeightMultiplier)
        : 1;
    const allowActiveJumpGates = options.allowActiveJumpGates !== false;
    const weightedTemplates = DEEP_SPACE_POI_TEMPLATES
        .filter((template) => isJumpGateTemplate(template))
        .filter((template) => allowActiveJumpGates || template.jumpGateState !== 'active')
        .map((template) => {
            const baseWeight = Number.isFinite(template.weight) && template.weight > 0 ? template.weight : 1;
            const isActiveJumpGate = template.jumpGateState === 'active';
            const edgeAdjustedWeight = baseWeight * getJumpGateEdgeWeightMultiplier(edgeDistance);
            const suppressionAdjustedWeight = isActiveJumpGate
                ? edgeAdjustedWeight * activeJumpGateWeightMultiplier
                : edgeAdjustedWeight;
            return {
                template,
                weight: suppressionAdjustedWeight
            };
        });
    if (!weightedTemplates.length) return null;
    const picked = pickWeightedTemplate(weightedTemplates, randomFn);
    return picked ? buildPoiFromTemplate(picked, randomFn) : null;
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
    const occupiedHexIds = new Set(Object.keys(sectors || {}));
    const targetPoiCount = computePoiTargetCount(width, height, sectors, options, randomFn);
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
    let poiCount = 0;
    const candidateHexes = [];
    for (let c = 0; c < width; c++) {
        for (let r = 0; r < height; r++) {
            const hexId = `${c}-${r}`;
            if (!sectors[hexId]) candidateHexes.push(hexId);
        }
    }
    shuffleInPlace(candidateHexes, randomFn);

    for (let i = 0; i < candidateHexes.length; i++) {
        const hexId = candidateHexes[i];
        if (occupiedHexIds.has(hexId)) continue;
        const parsed = parseHexId(hexId);
        if (!parsed) continue;
        const edgeDistance = Math.min(parsed.col, parsed.row, (width - 1) - parsed.col, (height - 1) - parsed.row);
        const canRollJumpGateAtHex = canSpawnJumpGateAtAll
            && jumpGateHexes.length < maxJumpGatesPerSector
            && edgeDistance <= edgeDistanceMax;

        if (canRollJumpGateAtHex) {
            const edgeWeight = getJumpGateEdgeWeightMultiplier(edgeDistance);
            const jumpGateBypassChance = clamp(0.0025 * edgeWeight, 0.0008, 0.0085);
            if (randomFn() <= jumpGateBypassChance) {
                const bypassGate = createJumpGatePoi({
                    edgeDistance,
                    activeJumpGateWeightMultiplier,
                    randomFn,
                    allowActiveJumpGates: canSpawnActiveJumpGate
                });
                if (bypassGate) {
                    jumpGateHexes.push(hexId);
                    pois[hexId] = bypassGate;
                    occupiedHexIds.add(hexId);
                    poiCount++;
                    continue;
                }
            }
        }

        if (poiCount >= targetPoiCount) continue;

        const emptinessScore = computeNeighborhoodEmptinessScore(hexId, width, height, occupiedHexIds);
        const remainingTarget = Math.max(0, targetPoiCount - poiCount);
        const remainingCandidates = Math.max(1, candidateHexes.length - i);
        const quotaChance = remainingTarget / remainingCandidates;
        const emptinessBias = 0.35 + (emptinessScore * 0.95);
        const spawnChance = clamp(quotaChance * emptinessBias, 0, 1);
        if (randomFn() > spawnChance) continue;

        let poi = createDeepSpacePoi({
            edgeDistance,
            allowJumpGates: canRollJumpGateAtHex,
            activeJumpGateWeightMultiplier,
            randomFn
        });
        if (!poi) continue;
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
        occupiedHexIds.add(hexId);
        poiCount++;
    }
    return pois;
}
