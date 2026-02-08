import { offsetSectorKey, parseSectorKeyToCoords } from './sector-address.js';
import { parseHexId } from './utils.js';

const MAX_CONTEXT_CACHE = 24;
const DIRECTION_OFFSETS = {
    north: { dx: 0, dy: -1, opposite: 'south' },
    south: { dx: 0, dy: 1, opposite: 'north' },
    west: { dx: -1, dy: 0, opposite: 'east' },
    east: { dx: 1, dy: 0, opposite: 'west' }
};

const contextCache = new Map();

function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

function makeCacheKey(layoutSeed, knownSectorRecords, settings) {
    const signatures = Object.entries(knownSectorRecords || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sectorKey, record]) => {
            const config = record && record.config ? record.config : {};
            const width = Math.max(1, Number(config.width) || 8);
            const height = Math.max(1, Number(config.height) || 10);
            const systems = record && record.sectors ? record.sectors : {};
            const systemKeys = Object.keys(systems).sort();
            const checksum = systemKeys
                .reduce((sum, key) => {
                    const parsed = parseHexId(key);
                    if (!parsed) return sum;
                    return sum + ((parsed.col + 1) * 31) + ((parsed.row + 1) * 17);
                }, 0);
            return [
                sectorKey,
                width,
                height,
                record && record.coreSystemHexId ? record.coreSystemHexId : '',
                systemKeys.length,
                checksum
            ].join(':');
        })
        .join('|');
    const flags = [
        settings && settings.crossSectorContextEnabled ? '1' : '0',
        settings && Number.isFinite(settings.boundaryContinuityStrength) ? settings.boundaryContinuityStrength : 0
    ].join(':');
    return `${String(layoutSeed || '')}::${signatures}::${flags}`;
}

function getSystemTagsFromRecord(record) {
    const tagCounts = new Map();
    const sectors = record && record.sectors ? record.sectors : {};
    Object.values(sectors).forEach((system) => {
        if (!system || typeof system !== 'object') return;
        const systemTags = Array.isArray(system.tags) ? system.tags : [];
        systemTags.forEach((tag) => {
            const key = String(tag || '').trim().toLowerCase();
            if (!key) return;
            tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
        });

        const planets = Array.isArray(system.planets) ? system.planets : [];
        planets.forEach((body) => {
            const bodyTags = Array.isArray(body && body.tags) ? body.tags : [];
            bodyTags.forEach((tag) => {
                const key = String(tag || '').trim().toLowerCase();
                if (!key) return;
                tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
            });
        });
    });
    return Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 6)
        .map(([tag]) => tag);
}

function computeEdgeOccupancyVectors(record) {
    const config = record && record.config ? record.config : {};
    const width = Math.max(1, Number(config.width) || 8);
    const height = Math.max(1, Number(config.height) || 10);
    const edgeBand = 1;
    const totals = {
        north: width * (edgeBand + 1),
        south: width * (edgeBand + 1),
        west: height * (edgeBand + 1),
        east: height * (edgeBand + 1)
    };
    const counts = { north: 0, south: 0, west: 0, east: 0 };
    const sectors = record && record.sectors ? record.sectors : {};
    Object.keys(sectors).forEach((hexId) => {
        const parsed = parseHexId(hexId);
        if (!parsed) return;
        if (parsed.row <= edgeBand) counts.north++;
        if (parsed.row >= (height - 1 - edgeBand)) counts.south++;
        if (parsed.col <= edgeBand) counts.west++;
        if (parsed.col >= (width - 1 - edgeBand)) counts.east++;
    });
    return {
        north: clamp01(counts.north / Math.max(1, totals.north)),
        south: clamp01(counts.south / Math.max(1, totals.south)),
        west: clamp01(counts.west / Math.max(1, totals.west)),
        east: clamp01(counts.east / Math.max(1, totals.east))
    };
}

function buildDensityMap(record, width, height) {
    const sectors = record && record.sectors ? record.sectors : {};
    const buckets = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
    ];
    const totals = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0]
    ];
    for (let col = 0; col < width; col++) {
        for (let row = 0; row < height; row++) {
            const xBand = Math.min(2, Math.floor((col / Math.max(1, width)) * 3));
            const yBand = Math.min(2, Math.floor((row / Math.max(1, height)) * 3));
            totals[yBand][xBand] += 1;
            if (sectors[`${col}-${row}`]) {
                buckets[yBand][xBand] += 1;
            }
        }
    }
    return buckets.map((row, rowIndex) => row.map((count, colIndex) => (
        clamp01(count / Math.max(1, totals[rowIndex][colIndex]))
    )));
}

function extractSectorSummary(record, sectorKey) {
    const config = record && record.config ? record.config : {};
    const width = Math.max(1, Number(config.width) || 8);
    const height = Math.max(1, Number(config.height) || 10);
    const sectors = record && record.sectors ? record.sectors : {};
    const systemCount = Object.keys(sectors).length;
    const totalHexes = Math.max(1, (record && Number(record.totalHexes)) || (width * height));
    const coords = parseSectorKeyToCoords(sectorKey);
    return {
        sectorKey,
        coords,
        width,
        height,
        systemCount,
        totalHexes,
        densityRatio: clamp01(systemCount / totalHexes),
        densityMap: buildDensityMap(record, width, height),
        edgeOccupancy: computeEdgeOccupancyVectors(record),
        core: {
            hexId: record && typeof record.coreSystemHexId === 'string' ? record.coreSystemHexId : null,
            manual: !!(record && record.coreSystemManual)
        },
        dominantTagSignals: getSystemTagsFromRecord(record)
    };
}

function computeNeighborPressure(summariesByKey, sectorKey, direction, boundaryStrength) {
    const directionDef = DIRECTION_OFFSETS[direction];
    if (!directionDef) return 0;
    const neighborKey = offsetSectorKey(sectorKey, directionDef.dx, directionDef.dy);
    const neighbor = summariesByKey[neighborKey];
    if (!neighbor) return 0;
    const raw = neighbor.edgeOccupancy[directionDef.opposite] || 0;
    return clamp01(raw * Math.max(0, Number(boundaryStrength) || 0));
}

export function createGenerationContext(layoutSeed, knownSectorRecords = {}, settings = {}) {
    const cacheKey = makeCacheKey(layoutSeed, knownSectorRecords, settings);
    if (contextCache.has(cacheKey)) return contextCache.get(cacheKey);

    const summariesByKey = {};
    Object.entries(knownSectorRecords || {}).forEach(([sectorKey, record]) => {
        if (!record || typeof record !== 'object') return;
        summariesByKey[sectorKey] = extractSectorSummary(record, sectorKey);
    });

    const context = {
        layoutSeed: String(layoutSeed || ''),
        getNeighborSummaries(sectorKey) {
            return Object.entries(DIRECTION_OFFSETS)
                .map(([direction, vector]) => {
                    const key = offsetSectorKey(sectorKey, vector.dx, vector.dy);
                    return { direction, sectorKey: key, summary: summariesByKey[key] || null };
                })
                .filter((entry) => !!entry.summary);
        },
        getEdgePressure(sectorKey, direction) {
            if (!(settings && settings.crossSectorContextEnabled)) return 0;
            return computeNeighborPressure(
                summariesByKey,
                sectorKey,
                direction,
                settings.boundaryContinuityStrength
            );
        },
        getCoreBias(sectorKey) {
            if (!(settings && settings.crossSectorContextEnabled)) return 0;
            const neighbors = this.getNeighborSummaries(sectorKey);
            if (!neighbors.length) return 0;
            const total = neighbors.reduce((sum, neighbor) => sum + clamp01(neighbor.summary.densityRatio), 0);
            return clamp01(total / neighbors.length);
        },
        getSectorIntent(sectorKey) {
            const summary = summariesByKey[sectorKey];
            const neighbors = this.getNeighborSummaries(sectorKey);
            const neighborDensity = neighbors.length
                ? neighbors.reduce((sum, item) => sum + clamp01(item.summary.densityRatio), 0) / neighbors.length
                : 0;
            return {
                sectorKey,
                localDensity: summary ? summary.densityRatio : 0,
                neighborDensity: clamp01(neighborDensity),
                coreBias: this.getCoreBias(sectorKey)
            };
        },
        getSummary(sectorKey) {
            return summariesByKey[sectorKey] || null;
        }
    };

    contextCache.set(cacheKey, context);
    if (contextCache.size > MAX_CONTEXT_CACHE) {
        const oldestKey = contextCache.keys().next().value;
        contextCache.delete(oldestKey);
    }
    return context;
}

export function getGenerationContextCacheSizeForDebug() {
    return contextCache.size;
}

export function clearGenerationContextCacheForDebug() {
    contextCache.clear();
}
