import { createGenerationContext } from './generation-context.js';

function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

function sanitizeEdgeOccupancy(value) {
    if (!value || typeof value !== 'object') {
        return { north: 0, south: 0, west: 0, east: 0 };
    }
    return {
        north: clamp01(Number(value.north) || 0),
        south: clamp01(Number(value.south) || 0),
        west: clamp01(Number(value.west) || 0),
        east: clamp01(Number(value.east) || 0)
    };
}

function sanitizeDominantTags(tags) {
    if (!Array.isArray(tags)) return [];
    return tags
        .map((tag) => String(tag || '').trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8);
}

function sanitizeDensityMap(value) {
    if (!Array.isArray(value)) return [];
    return value
        .slice(0, 3)
        .map((row) => (Array.isArray(row)
            ? row.slice(0, 3).map((cell) => clamp01(Number(cell) || 0))
            : []));
}

export function toMinimalGenerationContextSummary(summary) {
    if (!summary || typeof summary !== 'object') return null;
    return {
        densityRatio: clamp01(Number(summary.densityRatio) || 0),
        edgeOccupancy: sanitizeEdgeOccupancy(summary.edgeOccupancy),
        coreHexId: summary.core && typeof summary.core.hexId === 'string' ? summary.core.hexId : null,
        dominantTagSignals: sanitizeDominantTags(summary.dominantTagSignals),
        densityMap: sanitizeDensityMap(summary.densityMap)
    };
}

export function rebuildGenerationContextSummaries({
    layoutSeed,
    sectorsByKey,
    settings = {}
}) {
    if (!sectorsByKey || typeof sectorsByKey !== 'object') return sectorsByKey;
    const context = createGenerationContext(layoutSeed || '', sectorsByKey, {
        crossSectorContextEnabled: true,
        boundaryContinuityStrength: Number(settings.boundaryContinuityStrength) || 0.55
    });
    Object.entries(sectorsByKey).forEach(([sectorKey, record]) => {
        if (!record || typeof record !== 'object') return;
        const summary = context.getSummary(sectorKey);
        record.generationContextSummary = toMinimalGenerationContextSummary(summary);
    });
    return sectorsByKey;
}
