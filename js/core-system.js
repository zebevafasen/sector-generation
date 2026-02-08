import { parseHexId } from './utils.js';

function parseBodyPopulation(body) {
    const value = Number(body && body.pop);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

function parseHexSortKey(hexId) {
    const parsed = parseHexId(hexId);
    if (!parsed) return { col: Number.POSITIVE_INFINITY, row: Number.POSITIVE_INFINITY };
    return parsed;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function normalizeTag(tag) {
    return String(tag || '').trim().toLowerCase();
}

function collectSystemTags(system) {
    const allTags = [];
    const pushTag = (tag) => {
        const normalized = normalizeTag(tag);
        if (!normalized) return;
        allTags.push(normalized);
    };

    if (Array.isArray(system && system.tags)) {
        system.tags.forEach(pushTag);
    }
    if (Array.isArray(system && system.starTags)) {
        system.starTags.forEach(pushTag);
    }
    const planets = Array.isArray(system && system.planets) ? system.planets : [];
    planets.forEach((body) => {
        const tags = Array.isArray(body && body.tags) ? body.tags : [];
        tags.forEach(pushTag);
    });
    return allTags;
}

function computeTagWeightContribution(system, settings = {}) {
    const coreTagWeights = settings.coreTagWeights || {};
    const perTagCap = Math.max(0, Number(settings.coreTagPerTagCap) || 0);
    const totalCap = Math.max(0, Number(settings.coreTagContributionCap) || 0);
    const tags = collectSystemTags(system);
    const weighted = tags.reduce((sum, tag) => {
        const value = Number(coreTagWeights[tag] || 0);
        if (!Number.isFinite(value) || value === 0) return sum;
        const bounded = perTagCap > 0
            ? clamp(value, -perTagCap, perTagCap)
            : value;
        return sum + bounded;
    }, 0);
    if (totalCap <= 0) return weighted;
    return clamp(weighted, -totalCap, totalCap);
}

function buildScoreWeights(settings = {}) {
    const source = settings.coreScoreWeights || {};
    return {
        base: Number(source.base) || 0,
        centrality: Number(source.centrality) || 5,
        population: Number(source.population) || 10,
        habitability: Number(source.habitability) || 25,
        context: Number(source.context) || 0
    };
}

function getContextBiasForHex(generationContext, sectorKey, hexId, width, height) {
    if (!generationContext || !hexId || !sectorKey) return 0;
    const parsed = parseHexId(hexId);
    if (!parsed) return 0;
    const top = parsed.row;
    const bottom = Math.max(0, height - 1 - parsed.row);
    const left = parsed.col;
    const right = Math.max(0, width - 1 - parsed.col);
    const nearest = Math.min(top, bottom, left, right);
    if (nearest === top) return generationContext.getEdgePressure(sectorKey, 'north');
    if (nearest === bottom) return generationContext.getEdgePressure(sectorKey, 'south');
    if (nearest === left) return generationContext.getEdgePressure(sectorKey, 'west');
    return generationContext.getEdgePressure(sectorKey, 'east');
}

export function computeCoreSystemScore(system, hexId, width, height, options = {}) {
    if (!system || !Array.isArray(system.planets)) return Number.NEGATIVE_INFINITY;
    const parsed = parseHexId(hexId);
    if (!parsed) return Number.NEGATIVE_INFINITY;
    const settings = options.settings || {};
    const scoreWeights = buildScoreWeights(settings);

    const totalPop = system.planets.reduce((sum, body) => sum + parseBodyPopulation(body), 0);
    const habitableWorlds = system.planets.reduce((count, body) => count + (body && body.habitable ? 1 : 0), 0);
    const centerX = (Math.max(1, width) - 1) / 2;
    const centerY = (Math.max(1, height) - 1) / 2;
    const maxDistance = Math.max(1, Math.hypot(centerX, centerY));
    const distance = Math.hypot(parsed.col - centerX, parsed.row - centerY);
    const centrality = Math.max(0, 1 - (distance / maxDistance));
    const tagWeightSum = computeTagWeightContribution(system, settings);
    const globalContextBias = options.generationContext && options.sectorKey
        ? Number(options.generationContext.getCoreBias(options.sectorKey) || 0)
        : 0;
    const edgeContextBias = getContextBiasForHex(
        options.generationContext,
        options.sectorKey,
        hexId,
        width,
        height
    );
    const contextBias = clamp(globalContextBias + (edgeContextBias * 0.5), 0, 2);

    const score = scoreWeights.base
        + (totalPop * scoreWeights.population)
        + (habitableWorlds * scoreWeights.habitability)
        + (centrality * scoreWeights.centrality)
        + tagWeightSum
        + (contextBias * scoreWeights.context);

    if (options.debugCollector) {
        options.debugCollector[hexId] = {
            totalPop,
            habitableWorlds,
            centrality,
            tagWeightSum,
            contextBias,
            score
        };
    }

    return score;
}

export function pickCoreSystemHexId(sectors, width, height, options = {}) {
    const entries = Object.entries(sectors || {}).filter(([, system]) => !!system);
    if (!entries.length) return null;

    entries.sort(([hexA, systemA], [hexB, systemB]) => {
        const scoreA = computeCoreSystemScore(systemA, hexA, width, height, options);
        const scoreB = computeCoreSystemScore(systemB, hexB, width, height, options);
        if (scoreA !== scoreB) return scoreB - scoreA;

        const coordA = parseHexSortKey(hexA);
        const coordB = parseHexSortKey(hexB);
        if (coordA.col !== coordB.col) return coordA.col - coordB.col;
        return coordA.row - coordB.row;
    });

    return entries[0][0] || null;
}

export function resolveCoreSystemHexId({
    sectors,
    width,
    height,
    preferredHexId = null,
    preferredIsManual = false,
    settings = null,
    generationContext = null,
    sectorKey = null,
    debugScoring = false
}) {
    const hasPreferred = !!(preferredHexId && sectors && sectors[preferredHexId]);
    if (hasPreferred) {
        return {
            coreSystemHexId: preferredHexId,
            coreSystemManual: !!preferredIsManual
        };
    }
    const debugCollector = debugScoring ? {} : null;
    const resolved = {
        coreSystemHexId: pickCoreSystemHexId(sectors, width, height, {
            settings,
            generationContext,
            sectorKey,
            debugCollector
        }),
        coreSystemManual: false
    };
    if (debugCollector) {
        resolved.debugScores = debugCollector;
    }
    return resolved;
}
