import { DEEP_SPACE_POI_TEMPLATES } from './generation-data.js';
import { HOME_SECTOR_KEY, parseSectorKeyToCoords } from './sector-address.js';
import { countNeighborSystems, hexDistanceById } from './generation-spatial.js';

function parseSectorKey(sectorKey) {
    return parseSectorKeyToCoords(sectorKey || HOME_SECTOR_KEY);
}

function isActiveJumpGatePoi(poi) {
    if (!poi) return false;
    if (poi.jumpGateState === 'active') return true;
    return /^active jump-gate\b/i.test(String(poi.name || ''));
}

export function getActiveJumpGateSectorWeightMultiplier(sectorKey, knownSectorRecords = {}) {
    if (!knownSectorRecords || typeof knownSectorRecords !== 'object') return 1;
    const center = parseSectorKey(sectorKey);
    let nearbyActiveCount = 0;
    Object.entries(knownSectorRecords).forEach(([otherKey, record]) => {
        if (!record || !record.deepSpacePois || otherKey === sectorKey) return;
        const other = parseSectorKey(otherKey);
        const dx = Math.abs(other.x - center.x);
        const dy = Math.abs(other.y - center.y);
        if (Math.max(dx, dy) > 2) return;
        const activeInSector = Object.values(record.deepSpacePois).some(isActiveJumpGatePoi);
        if (activeInSector) nearbyActiveCount++;
    });
    if (nearbyActiveCount <= 0) return 1;
    return Math.max(0.22, 1 - (nearbyActiveCount * 0.24));
}

function getJumpGateEdgeWeightMultiplier(edgeDistance) {
    if (edgeDistance <= 1) return 1.8;
    if (edgeDistance <= 2) return 1.35;
    if (edgeDistance <= 3) return 1.05;
    return 0.28;
}

export function createDeepSpacePoi(options = {}) {
    const randomFn = options.randomFn || Math.random;
    const edgeDistance = Number.isFinite(options.edgeDistance) ? options.edgeDistance : Number.POSITIVE_INFINITY;
    const allowJumpGates = options.allowJumpGates !== false;
    const activeJumpGateWeightMultiplier = Number.isFinite(options.activeJumpGateWeightMultiplier)
        ? Math.max(0.01, options.activeJumpGateWeightMultiplier)
        : 1;
    const weightedTemplates = DEEP_SPACE_POI_TEMPLATES.filter((template) =>
        allowJumpGates || !/jump-gate/i.test(String(template.name || ''))
    ).map((template) => {
        const baseWeight = Number.isFinite(template.weight) && template.weight > 0 ? template.weight : 1;
        const isJumpGate = /jump-gate/i.test(String(template.name || ''));
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
        name: `${template.name} ${serial}`,
        summary: template.summary,
        risk: template.risk,
        rewardHint: template.rewardHint,
        isRefuelingStation: !!template.isRefuelingStation,
        jumpGateState: template.jumpGateState || null
    };
}

export function isJumpGatePoi(poi) {
    if (!poi) return false;
    return /jump-gate/i.test(String(poi.name || ''));
}

export function generateDeepSpacePois(width, height, sectors, options = {}) {
    const randomFn = options.randomFn || Math.random;
    const pois = {};
    const activeJumpGateWeightMultiplier = Number.isFinite(options.activeJumpGateWeightMultiplier)
        ? Math.max(0.01, options.activeJumpGateWeightMultiplier)
        : 1;
    const jumpGateHexes = [];
    const maxJumpGatesPerSector = 2;
    const minJumpGateSeparation = 4;

    for (let c = 0; c < width; c++) {
        for (let r = 0; r < height; r++) {
            const hexId = `${c}-${r}`;
            if (sectors[hexId]) continue;

            const nearbySystems = countNeighborSystems(hexId, sectors);
            const baseChance = 0.035;
            const nearbyBoost = nearbySystems > 0 ? Math.min(0.05, nearbySystems * 0.015) : 0;
            const remoteBoost = nearbySystems === 0 ? 0.015 : 0;
            const spawnChance = baseChance + nearbyBoost + remoteBoost;
            if (randomFn() > spawnChance) continue;
            const edgeDistance = Math.min(c, r, (width - 1) - c, (height - 1) - r);
            let poi = createDeepSpacePoi({ edgeDistance, activeJumpGateWeightMultiplier, randomFn });
            if (isJumpGatePoi(poi)) {
                const isAtGateCap = jumpGateHexes.length >= maxJumpGatesPerSector;
                const isTooCloseToOtherGate = jumpGateHexes.some((otherHexId) =>
                    hexDistanceById(otherHexId, hexId) < minJumpGateSeparation
                );
                if (isAtGateCap || isTooCloseToOtherGate) {
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
