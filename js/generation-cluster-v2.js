import { hexDistanceById } from './generation-spatial.js';
import { parseHexId } from './utils.js';

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function countLocalNeighbors(selectedHexIds, hexId, distanceCap = 2) {
    return selectedHexIds.reduce((count, otherHexId) => (
        count + (hexDistanceById(otherHexId, hexId) <= distanceCap ? 1 : 0)
    ), 0);
}

function isEdgeHex(hexId, width, height) {
    const parsed = parseHexId(hexId);
    if (!parsed) return false;
    return parsed.col === 0 || parsed.row === 0 || parsed.col === (width - 1) || parsed.row === (height - 1);
}

function getDirectionForHex(hexId, width, height) {
    const parsed = parseHexId(hexId);
    if (!parsed) return null;
    const top = parsed.row;
    const bottom = Math.max(0, height - 1 - parsed.row);
    const left = parsed.col;
    const right = Math.max(0, width - 1 - parsed.col);
    const nearest = Math.min(top, bottom, left, right);
    if (nearest === top) return 'north';
    if (nearest === bottom) return 'south';
    if (nearest === left) return 'west';
    return 'east';
}

function getEdgeDistance(hexId, width, height) {
    const parsed = parseHexId(hexId);
    if (!parsed) return Number.POSITIVE_INFINITY;
    return Math.min(parsed.row, Math.max(0, height - 1 - parsed.row), parsed.col, Math.max(0, width - 1 - parsed.col));
}

function sortByCoordThenScore(items) {
    return [...items].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.coord.col !== b.coord.col) return a.coord.col - b.coord.col;
        if (a.coord.row !== b.coord.row) return a.coord.row - b.coord.row;
        return String(a.hexId).localeCompare(String(b.hexId));
    });
}

function choosePrimaryAnchor(parsedCandidates, randomFn, width, height, jitter) {
    const centerX = (Math.max(1, width) - 1) / 2;
    const centerY = (Math.max(1, height) - 1) / 2;
    const targetX = centerX + ((randomFn() - 0.5) * 2 * jitter);
    const targetY = centerY + ((randomFn() - 0.5) * 2 * jitter);

    const scored = parsedCandidates.map((item) => {
        const dx = item.coord.col - targetX;
        const dy = item.coord.row - targetY;
        const distance = Math.sqrt((dx * dx) + (dy * dy));
        return {
            ...item,
            score: -distance
        };
    });
    return sortByCoordThenScore(scored)[0];
}

function chooseSecondaryAnchors(primaryAnchor, parsedCandidates, systemsToGenerate, randomFn, settings) {
    const threshold = Math.max(1, Number(settings.clusterSecondaryAnchorThreshold) || 11);
    if (systemsToGenerate < threshold) return [];
    const maxAdditional = systemsToGenerate >= (threshold * 2) ? 2 : 1;
    const anchors = [];
    for (let i = 0; i < maxAdditional; i++) {
        const scored = parsedCandidates
            .filter((item) => item.hexId !== primaryAnchor.hexId && !anchors.some((anchor) => anchor.hexId === item.hexId))
            .map((item) => {
                const nearestDistance = [primaryAnchor, ...anchors]
                    .reduce((min, anchor) => Math.min(min, hexDistanceById(anchor.hexId, item.hexId)), Number.POSITIVE_INFINITY);
                return {
                    ...item,
                    score: nearestDistance + (randomFn() * 0.25)
                };
            });
        const picked = sortByCoordThenScore(scored)[0];
        if (!picked) break;
        anchors.push(picked);
    }
    return anchors;
}

function computeAnchorAffinity(item, anchors, growthDecay) {
    return anchors.reduce((best, anchor) => {
        const distance = hexDistanceById(item.hexId, anchor.hexId);
        const score = Math.pow(Math.max(0.01, growthDecay), distance);
        return Math.max(best, score);
    }, 0);
}

function computeCenterAffinity(item, width, height) {
    const centerX = (Math.max(1, width) - 1) / 2;
    const centerY = (Math.max(1, height) - 1) / 2;
    const maxCenterDistance = Math.max(1, Math.hypot(centerX, centerY));
    const centerDistance = Math.hypot(item.coord.col - centerX, item.coord.row - centerY);
    return 1 - (centerDistance / maxCenterDistance);
}

function computeCandidateScore(item, anchors, selectedHexIds, randomFn, options) {
    const {
        width,
        height,
        centerBiasStrength,
        growthDecay,
        edgeBalance,
        isHomeSector,
        generationContext,
        sectorKey,
        boundaryContinuityStrength,
        localNeighborCap,
        capRelaxation,
        stageEdgeOccupancy
    } = options;
    const centerAffinity = computeCenterAffinity(item, width, height);
    const anchorAffinity = computeAnchorAffinity(item, anchors, growthDecay);
    const localNeighbors = countLocalNeighbors(selectedHexIds, item.hexId, 2);
    if (localNeighbors >= (localNeighborCap + capRelaxation)) {
        return Number.NEGATIVE_INFINITY;
    }
    const overpackPenalty = Math.max(0, localNeighbors - 2) * 0.35;

    const direction = getDirectionForHex(item.hexId, width, height);
    const edgePressure = direction && generationContext
        ? generationContext.getEdgePressure(sectorKey, direction)
        : 0;
    const boundaryBias = clamp(edgePressure * Math.max(0, boundaryContinuityStrength), 0, 1.5);
    const edgeDistance = getEdgeDistance(item.hexId, width, height);
    const isNearEdge = Number.isFinite(edgeDistance) && edgeDistance <= 1;
    const edgePenalty = isEdgeHex(item.hexId, width, height) ? Math.max(0, edgeBalance * 0.4) : 0;
    const continuityStrength = Math.max(0, boundaryContinuityStrength);
    let seamSmoothingBias = 0;
    if (direction && isNearEdge) {
        const selectedEdgeRatio = stageEdgeOccupancy && Number.isFinite(stageEdgeOccupancy[direction])
            ? stageEdgeOccupancy[direction]
            : 0;
        if (edgePressure >= 0.2) {
            const continuationNeed = Math.max(0, edgePressure - selectedEdgeRatio);
            seamSmoothingBias += continuationNeed * (0.9 + continuityStrength);
        } else {
            const overfill = Math.max(0, selectedEdgeRatio - edgePressure);
            seamSmoothingBias -= overfill * (0.45 + (edgeBalance * 0.5));
        }
    }
    const homeCenterMultiplier = isHomeSector ? 1.2 : 0.85;
    const variance = (randomFn() - 0.5) * 0.12;

    return (
        (anchorAffinity * 2.6)
        + (centerAffinity * centerBiasStrength * homeCenterMultiplier)
        + boundaryBias
        + seamSmoothingBias
        - overpackPenalty
        - edgePenalty
        + variance
    );
}

function stageASelectAnchors(parsedCandidates, systemsToGenerate, randomFn, width, height, settings) {
    const primaryAnchor = choosePrimaryAnchor(
        parsedCandidates,
        randomFn,
        width,
        height,
        Math.max(0, Number(settings.clusterAnchorJitter) || 0)
    );
    if (!primaryAnchor) return [];
    const secondaryAnchors = chooseSecondaryAnchors(primaryAnchor, parsedCandidates, systemsToGenerate, randomFn, settings);
    return [primaryAnchor, ...secondaryAnchors];
}

function stageBGrowSelection(parsedCandidates, systemsToGenerate, anchors, randomFn, options) {
    const selectedHexIds = [];
    const selectedSet = new Set();
    const localNeighborCap = Math.max(1, Number(options.settings.clusterLocalNeighborCap) || 5);
    let capRelaxation = 0;
    const edgeCounts = { north: 0, south: 0, west: 0, east: 0 };
    const edgeTotals = {
        north: parsedCandidates.filter((item) => getDirectionForHex(item.hexId, options.width, options.height) === 'north' && getEdgeDistance(item.hexId, options.width, options.height) <= 1).length,
        south: parsedCandidates.filter((item) => getDirectionForHex(item.hexId, options.width, options.height) === 'south' && getEdgeDistance(item.hexId, options.width, options.height) <= 1).length,
        west: parsedCandidates.filter((item) => getDirectionForHex(item.hexId, options.width, options.height) === 'west' && getEdgeDistance(item.hexId, options.width, options.height) <= 1).length,
        east: parsedCandidates.filter((item) => getDirectionForHex(item.hexId, options.width, options.height) === 'east' && getEdgeDistance(item.hexId, options.width, options.height) <= 1).length
    };
    while (selectedHexIds.length < systemsToGenerate) {
        const stageEdgeOccupancy = {
            north: edgeCounts.north / Math.max(1, edgeTotals.north),
            south: edgeCounts.south / Math.max(1, edgeTotals.south),
            west: edgeCounts.west / Math.max(1, edgeTotals.west),
            east: edgeCounts.east / Math.max(1, edgeTotals.east)
        };
        const scored = parsedCandidates
            .filter((item) => !selectedSet.has(item.hexId))
            .map((item) => ({
                ...item,
                score: computeCandidateScore(item, anchors, selectedHexIds, randomFn, {
                    width: options.width,
                    height: options.height,
                    centerBiasStrength: Math.max(0, Number(options.settings.centerBiasStrength) || 0),
                    growthDecay: Math.max(0.05, Number(options.settings.clusterGrowthDecay) || 0.82),
                    edgeBalance: Math.max(0, Number(options.settings.clusterEdgeBalance) || 0),
                    isHomeSector: !!options.isHomeSector,
                    generationContext: options.generationContext || null,
                    sectorKey: options.sectorKey || '',
                    boundaryContinuityStrength: Math.max(0, Number(options.settings.boundaryContinuityStrength) || 0),
                    localNeighborCap,
                    capRelaxation,
                    stageEdgeOccupancy
                })
            }))
            .filter((item) => Number.isFinite(item.score));
        const next = sortByCoordThenScore(scored)[0];
        if (!next) {
            if (capRelaxation < 2) {
                capRelaxation++;
                continue;
            }
            break;
        }
        selectedHexIds.push(next.hexId);
        selectedSet.add(next.hexId);
        const direction = getDirectionForHex(next.hexId, options.width, options.height);
        if (direction && getEdgeDistance(next.hexId, options.width, options.height) <= 1 && Number.isFinite(edgeCounts[direction])) {
            edgeCounts[direction] += 1;
        }
    }
    return selectedHexIds;
}

function applyEdgeBalancing(selectedHexIds, parsedCandidates, anchors, options) {
    const { width, height, settings } = options;
    const edgeBalanceStrength = Math.max(0, Number(settings.clusterEdgeBalance) || 0);
    if (selectedHexIds.length < 4 || edgeBalanceStrength <= 0) return selectedHexIds;
    const candidateEdgeRatio = parsedCandidates.length
        ? parsedCandidates.filter((item) => isEdgeHex(item.hexId, width, height)).length / parsedCandidates.length
        : 0;
    const selectedEdgeHexIds = selectedHexIds.filter((hexId) => isEdgeHex(hexId, width, height));
    const selectedEdgeRatio = selectedEdgeHexIds.length / Math.max(1, selectedHexIds.length);
    const allowedEdgeRatio = clamp(candidateEdgeRatio + (0.08 / (edgeBalanceStrength + 0.2)), 0.15, 0.7);
    if (selectedEdgeRatio <= allowedEdgeRatio) return selectedHexIds;

    const swapsNeeded = Math.min(
        selectedEdgeHexIds.length,
        Math.max(0, Math.floor((selectedEdgeRatio - allowedEdgeRatio) * selectedHexIds.length))
    );
    if (swapsNeeded <= 0) return selectedHexIds;
    const selectedSet = new Set(selectedHexIds);
    const dropCandidates = selectedEdgeHexIds
        .map((hexId) => ({ hexId, coord: parseHexId(hexId) }))
        .filter((item) => !!item.coord)
        .map((item) => ({
            ...item,
            score: computeCenterAffinity(item, width, height) + (computeAnchorAffinity(item, anchors, settings.clusterGrowthDecay || 0.82) * 0.6)
        }))
        .sort((a, b) => a.score - b.score || a.coord.col - b.coord.col || a.coord.row - b.coord.row);
    const addCandidates = parsedCandidates
        .filter((item) => !selectedSet.has(item.hexId) && !isEdgeHex(item.hexId, width, height))
        .map((item) => ({
            ...item,
            score: computeCenterAffinity(item, width, height) + (computeAnchorAffinity(item, anchors, settings.clusterGrowthDecay || 0.82) * 0.6)
        }))
        .sort((a, b) => b.score - a.score || a.coord.col - b.coord.col || a.coord.row - b.coord.row);
    if (!dropCandidates.length || !addCandidates.length) return selectedHexIds;

    const next = [...selectedHexIds];
    for (let i = 0; i < swapsNeeded; i++) {
        const drop = dropCandidates[i];
        const add = addCandidates[i];
        if (!drop || !add) break;
        const index = next.indexOf(drop.hexId);
        if (index < 0) continue;
        next[index] = add.hexId;
    }
    return next;
}

function enforceLocalOccupancyCap(selectedHexIds, parsedCandidates, anchors, options) {
    const localNeighborCap = Math.max(1, Number(options.settings.clusterLocalNeighborCap) || 5);
    if (selectedHexIds.length < 4) return selectedHexIds;
    const centerX = (Math.max(1, options.width) - 1) / 2;
    const centerY = (Math.max(1, options.height) - 1) / 2;
    const selectedSet = new Set(selectedHexIds);
    const next = [...selectedHexIds];
    const replacementPool = parsedCandidates
        .filter((item) => !selectedSet.has(item.hexId))
        .map((item) => ({
            ...item,
            score: computeCenterAffinity(item, options.width, options.height)
                + (computeAnchorAffinity(item, anchors, options.settings.clusterGrowthDecay || 0.82) * 0.6)
        }))
        .sort((a, b) => b.score - a.score || a.coord.col - b.coord.col || a.coord.row - b.coord.row);
    if (!replacementPool.length) return next;

    for (let pass = 0; pass < next.length; pass++) {
        const offender = next
            .map((hexId) => ({
                hexId,
                coord: parseHexId(hexId),
                neighbors: countLocalNeighbors(next.filter((other) => other !== hexId), hexId, 2)
            }))
            .filter((item) => !!item.coord && item.neighbors > localNeighborCap)
            .sort((a, b) => {
                if (b.neighbors !== a.neighbors) return b.neighbors - a.neighbors;
                const aCenterDist = Math.hypot(a.coord.col - centerX, a.coord.row - centerY);
                const bCenterDist = Math.hypot(b.coord.col - centerX, b.coord.row - centerY);
                if (bCenterDist !== aCenterDist) return bCenterDist - aCenterDist;
                if (b.coord.col !== a.coord.col) return b.coord.col - a.coord.col;
                return b.coord.row - a.coord.row;
            })[0];
        if (!offender) break;

        const offenderIndex = next.indexOf(offender.hexId);
        if (offenderIndex < 0) break;
        let replacementIndex = -1;
        for (let i = 0; i < replacementPool.length; i++) {
            const candidate = replacementPool[i];
            const localCount = countLocalNeighbors(next.filter((_, idx) => idx !== offenderIndex), candidate.hexId, 2);
            if (localCount <= localNeighborCap) {
                replacementIndex = i;
                break;
            }
        }
        if (replacementIndex < 0) break;
        const replacement = replacementPool.splice(replacementIndex, 1)[0];
        selectedSet.delete(offender.hexId);
        selectedSet.add(replacement.hexId);
        next[offenderIndex] = replacement.hexId;
    }

    return next;
}

function postBiasCleanup(selectedHexIds, parsedCandidates, options) {
    const { width, height, centerVoidProtection } = options;
    if (selectedHexIds.length < 3 || centerVoidProtection <= 0) return selectedHexIds;
    const centerX = (Math.max(1, width) - 1) / 2;
    const centerY = (Math.max(1, height) - 1) / 2;
    const hasCenterish = selectedHexIds.some((hexId) => {
        const parsed = parseHexId(hexId);
        if (!parsed) return false;
        const distance = Math.hypot(parsed.col - centerX, parsed.row - centerY);
        return distance <= Math.max(1.4, centerVoidProtection * 2.2);
    });
    if (hasCenterish) return selectedHexIds;

    const selectedSet = new Set(selectedHexIds);
    const centerCandidate = sortByCoordThenScore(parsedCandidates.map((item) => {
        const distance = Math.hypot(item.coord.col - centerX, item.coord.row - centerY);
        return { ...item, score: -distance };
    }))
        .find((item) => !selectedSet.has(item.hexId));
    if (!centerCandidate) return selectedHexIds;

    const dropIndex = selectedHexIds.reduce((worstIndex, hexId, index, list) => {
        const parsed = parseHexId(hexId);
        if (!parsed) return worstIndex;
        const distance = Math.hypot(parsed.col - centerX, parsed.row - centerY);
        if (worstIndex < 0) return index;
        const prev = parseHexId(list[worstIndex]);
        const prevDistance = prev ? Math.hypot(prev.col - centerX, prev.row - centerY) : Number.NEGATIVE_INFINITY;
        return distance > prevDistance ? index : worstIndex;
    }, -1);
    if (dropIndex < 0) return selectedHexIds;
    const next = [...selectedHexIds];
    next.splice(dropIndex, 1, centerCandidate.hexId);
    return next;
}

export function selectClusteredSystemCoordsV2(candidateCoords, systemsToGenerate, randomFn = Math.random, options = {}) {
    if (systemsToGenerate <= 2 || candidateCoords.length <= 2) {
        return candidateCoords.slice(0, systemsToGenerate);
    }
    const width = Math.max(1, Number(options.width) || 8);
    const height = Math.max(1, Number(options.height) || 10);
    const settings = options.settings || {};
    const parsedCandidates = candidateCoords
        .map((hexId) => ({ hexId, coord: parseHexId(hexId) }))
        .filter((item) => !!item.coord);
    if (!parsedCandidates.length) return candidateCoords.slice(0, systemsToGenerate);

    const anchors = stageASelectAnchors(parsedCandidates, systemsToGenerate, randomFn, width, height, settings);
    if (!anchors.length) return candidateCoords.slice(0, systemsToGenerate);
    const stageBGrown = stageBGrowSelection(parsedCandidates, systemsToGenerate, anchors, randomFn, {
        width,
        height,
        sectorKey: options.sectorKey || '',
        isHomeSector: !!options.isHomeSector,
        settings,
        generationContext: options.generationContext || null
    });
    const stageCEdgeBalanced = applyEdgeBalancing(stageBGrown, parsedCandidates, anchors, {
        width,
        height,
        settings
    });

    const stageCCenterProtected = postBiasCleanup(stageCEdgeBalanced, parsedCandidates, {
        width,
        height,
        centerVoidProtection: Math.max(0, Number(settings.clusterCenterVoidProtection) || 0)
    });
    return enforceLocalOccupancyCap(stageCCenterProtected, parsedCandidates, anchors, {
        width,
        height,
        settings
    });
}
