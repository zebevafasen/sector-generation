import { parseHexId } from './utils.js';

function collectCoords(sectors = {}) {
    return Object.keys(sectors)
        .map((hexId) => ({ hexId, parsed: parseHexId(hexId) }))
        .filter((item) => !!item.parsed);
}

function centerPoint(width, height) {
    return {
        x: (Math.max(1, width) - 1) / 2,
        y: (Math.max(1, height) - 1) / 2
    };
}

export function computeSectorGenerationMetrics({ width, height, sectors }) {
    const coords = collectCoords(sectors);
    if (!coords.length) {
        return {
            centerOccupancyRatio: 0,
            edgeOccupancyRatio: 0,
            clusterCompactness: 0,
            averageNearestNeighborDistance: 0
        };
    }
    const center = centerPoint(width, height);
    const maxDistance = Math.max(1, Math.hypot(center.x, center.y));
    const centerBandRadius = Math.max(1, Math.min(width, height) * 0.22);
    const edgeBand = 1;
    const centerCount = coords.filter((item) => (
        Math.hypot(item.parsed.col - center.x, item.parsed.row - center.y) <= centerBandRadius
    )).length;
    const edgeCount = coords.filter((item) => (
        item.parsed.col <= edgeBand
        || item.parsed.row <= edgeBand
        || item.parsed.col >= (width - 1 - edgeBand)
        || item.parsed.row >= (height - 1 - edgeBand)
    )).length;
    const compactnessSamples = coords.map((item) => (
        1 - (Math.hypot(item.parsed.col - center.x, item.parsed.row - center.y) / maxDistance)
    ));
    const nearestDistances = coords.map((item) => {
        let nearest = Number.POSITIVE_INFINITY;
        coords.forEach((other) => {
            if (item.hexId === other.hexId) return;
            const dx = item.parsed.col - other.parsed.col;
            const dy = item.parsed.row - other.parsed.row;
            const distance = Math.hypot(dx, dy);
            if (distance < nearest) nearest = distance;
        });
        return Number.isFinite(nearest) ? nearest : 0;
    });

    const avgCompactness = compactnessSamples.reduce((sum, value) => sum + value, 0) / compactnessSamples.length;
    const avgNearest = nearestDistances.reduce((sum, value) => sum + value, 0) / nearestDistances.length;
    return {
        centerOccupancyRatio: centerCount / coords.length,
        edgeOccupancyRatio: edgeCount / coords.length,
        clusterCompactness: avgCompactness,
        averageNearestNeighborDistance: avgNearest
    };
}

export function computeBoundarySeamMismatch(a = null, b = null, direction = 'east') {
    if (!a || !b) return 0;
    const aCoords = collectCoords(a.sectors || {});
    const bCoords = collectCoords(b.sectors || {});
    const aWidth = Math.max(1, Number(a.width) || Number(a.config && a.config.width) || 8);
    const aHeight = Math.max(1, Number(a.height) || Number(a.config && a.config.height) || 10);
    const bWidth = Math.max(1, Number(b.width) || Number(b.config && b.config.width) || 8);
    const bHeight = Math.max(1, Number(b.height) || Number(b.config && b.config.height) || 10);
    const edgeBand = 1;
    const aEdgeCount = aCoords.filter((item) => {
        if (direction === 'east') return item.parsed.col >= (aWidth - 1 - edgeBand);
        if (direction === 'west') return item.parsed.col <= edgeBand;
        if (direction === 'south') return item.parsed.row >= (aHeight - 1 - edgeBand);
        return item.parsed.row <= edgeBand;
    }).length;
    const bEdgeCount = bCoords.filter((item) => {
        if (direction === 'east') return item.parsed.col <= edgeBand;
        if (direction === 'west') return item.parsed.col >= (bWidth - 1 - edgeBand);
        if (direction === 'south') return item.parsed.row <= edgeBand;
        return item.parsed.row >= (bHeight - 1 - edgeBand);
    }).length;
    const denominator = Math.max(1, aCoords.length + bCoords.length);
    return Math.abs(aEdgeCount - bEdgeCount) / denominator;
}
