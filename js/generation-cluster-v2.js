import { hexDistanceById } from './generation-spatial.js';
import { parseHexId } from './utils.js';

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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

function sortByCoordThenScore(items) {
    return [...items].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.coord.col !== b.coord.col) return a.coord.col - b.coord.col;
        return a.coord.row - b.coord.row;
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
        boundaryContinuityStrength
    } = options;
    const centerX = (Math.max(1, width) - 1) / 2;
    const centerY = (Math.max(1, height) - 1) / 2;
    const maxCenterDistance = Math.max(1, Math.hypot(centerX, centerY));
    const centerDistance = Math.hypot(item.coord.col - centerX, item.coord.row - centerY);
    const centerAffinity = 1 - (centerDistance / maxCenterDistance);

    const anchorAffinity = anchors.reduce((best, anchor) => {
        const distance = hexDistanceById(item.hexId, anchor.hexId);
        const score = Math.pow(Math.max(0.01, growthDecay), distance);
        return Math.max(best, score);
    }, 0);

    const localNeighbors = selectedHexIds.reduce((count, hexId) => (
        count + (hexDistanceById(hexId, item.hexId) <= 2 ? 1 : 0)
    ), 0);
    const overpackPenalty = Math.max(0, localNeighbors - 2) * 0.35;

    const direction = getDirectionForHex(item.hexId, width, height);
    const edgePressure = direction && generationContext
        ? generationContext.getEdgePressure(sectorKey, direction)
        : 0;
    const boundaryBias = clamp(edgePressure * Math.max(0, boundaryContinuityStrength), 0, 1.5);
    const edgePenalty = isEdgeHex(item.hexId, width, height) ? Math.max(0, edgeBalance * 0.4) : 0;
    const homeCenterMultiplier = isHomeSector ? 1.2 : 0.85;
    const variance = (randomFn() - 0.5) * 0.12;

    return (
        (anchorAffinity * 2.6)
        + (centerAffinity * centerBiasStrength * homeCenterMultiplier)
        + boundaryBias
        - overpackPenalty
        - edgePenalty
        + variance
    );
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

    const primaryAnchor = choosePrimaryAnchor(
        parsedCandidates,
        randomFn,
        width,
        height,
        Math.max(0, Number(settings.clusterAnchorJitter) || 0)
    );
    if (!primaryAnchor) return candidateCoords.slice(0, systemsToGenerate);
    const secondaryAnchors = chooseSecondaryAnchors(primaryAnchor, parsedCandidates, systemsToGenerate, randomFn, settings);
    const anchors = [primaryAnchor, ...secondaryAnchors];

    const selectedHexIds = [];
    const selectedSet = new Set();
    while (selectedHexIds.length < systemsToGenerate) {
        const scored = parsedCandidates
            .filter((item) => !selectedSet.has(item.hexId))
            .map((item) => ({
                ...item,
                score: computeCandidateScore(item, anchors, selectedHexIds, randomFn, {
                    width,
                    height,
                    centerBiasStrength: Math.max(0, Number(settings.centerBiasStrength) || 0),
                    growthDecay: Math.max(0.05, Number(settings.clusterGrowthDecay) || 0.82),
                    edgeBalance: Math.max(0, Number(settings.clusterEdgeBalance) || 0),
                    isHomeSector: !!options.isHomeSector,
                    generationContext: options.generationContext || null,
                    sectorKey: options.sectorKey || '',
                    boundaryContinuityStrength: Math.max(0, Number(settings.boundaryContinuityStrength) || 0)
                })
            }));
        const next = sortByCoordThenScore(scored)[0];
        if (!next) break;
        selectedHexIds.push(next.hexId);
        selectedSet.add(next.hexId);
    }

    return postBiasCleanup(selectedHexIds, parsedCandidates, {
        width,
        height,
        centerVoidProtection: Math.max(0, Number(settings.clusterCenterVoidProtection) || 0)
    });
}
