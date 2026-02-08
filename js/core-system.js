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

export function computeCoreSystemScore(system, hexId, width, height) {
    if (!system || !Array.isArray(system.planets)) return Number.NEGATIVE_INFINITY;
    const parsed = parseHexId(hexId);
    if (!parsed) return Number.NEGATIVE_INFINITY;

    const totalPop = system.planets.reduce((sum, body) => sum + parseBodyPopulation(body), 0);
    const habitableWorlds = system.planets.reduce((count, body) => count + (body && body.habitable ? 1 : 0), 0);
    const centerX = (Math.max(1, width) - 1) / 2;
    const centerY = (Math.max(1, height) - 1) / 2;
    const maxDistance = Math.max(1, Math.hypot(centerX, centerY));
    const distance = Math.hypot(parsed.col - centerX, parsed.row - centerY);
    const centrality = Math.max(0, 1 - (distance / maxDistance));

    return (totalPop * 10) + (habitableWorlds * 25) + (centrality * 5);
}

export function pickCoreSystemHexId(sectors, width, height) {
    const entries = Object.entries(sectors || {}).filter(([, system]) => !!system);
    if (!entries.length) return null;

    entries.sort(([hexA, systemA], [hexB, systemB]) => {
        const scoreA = computeCoreSystemScore(systemA, hexA, width, height);
        const scoreB = computeCoreSystemScore(systemB, hexB, width, height);
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
    preferredIsManual = false
}) {
    const hasPreferred = !!(preferredHexId && sectors && sectors[preferredHexId]);
    if (hasPreferred) {
        return {
            coreSystemHexId: preferredHexId,
            coreSystemManual: !!preferredIsManual
        };
    }
    return {
        coreSystemHexId: pickCoreSystemHexId(sectors, width, height),
        coreSystemManual: false
    };
}
