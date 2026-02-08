import {
    GRID_PRESETS,
    NAME_PREFIX,
    NAME_SUFFIX,
    POI_TYPES,
    STAR_VISUALS,
    state
} from './config.js';
import {
    ADJACENT_DUPLICATE_NAME_CHANCE,
    GENERATION_PROFILES,
    getDensityRatioForPreset,
    normalizeDensityPresetKey
} from './generation-data.js';
import { EVENTS, emitEvent } from './events.js';
import { reportSystemInvariantIssues } from './invariants.js';
import { generateStarAge, generateSeedString, isAutoSeedEnabled, rand, setRandomStream, setSeed, showStatusMessage } from './core.js';
import { isArtificialBodyType, isBeltOrFieldBodyType, isPlanetaryBody } from './body-classification.js';
import { generatePlanetEnvironment } from './planet-environment.js';
import { refreshSystemPlanetPopulation } from './planet-population.js';
import { refreshSystemPlanetTags } from './planet-tags.js';
import {
    applyPlanetaryOrderAndNames,
    assignSystemHabitability,
    generatePlanetSize,
    isHabitableCandidateType,
    pickPlanetTypeForStarClass,
    pickRandomPlanetType
} from './planetary-rules.js';
import { autoSaveSectorState, buildSectorPayload } from './storage.js';
import { readGenerationConfigFromUi } from './sector-config.js';
import { getGlobalHexDisplayId } from './render-shared.js';
import { HOME_SECTOR_KEY, parseSectorKeyToCoords } from './sector-address.js';
import { ensureSystemStarFields } from './star-system.js';
import { redrawGridAndReselect, redrawHexAndReselect, redrawHexAndSelectHex, refreshHexInfo, clearSelectionInfo } from './ui-sync.js';
import { deepClone, isHexIdInBounds, parseHexId, romanize, shuffleArray, sortHexIds } from './utils.js';

const DEEP_SPACE_POI_TEMPLATES = [
    {
        kind: 'Navigation',
        name: 'Relay Beacon',
        summary: 'A functioning long-range navigation relay anchored to old trade routes.',
        risk: 'Low',
        rewardHint: 'Improves navigation confidence for nearby travel plans.'
    },
    {
        kind: 'Hazard',
        name: 'Ion Storm Front',
        summary: 'A volatile electromagnetic storm pocket that scrambles sensors.',
        risk: 'High',
        rewardHint: 'Forcing a crossing can save time at elevated danger.'
    },
    {
        kind: 'Opportunity',
        name: 'Drift Wreck Cluster',
        summary: 'Scattered hulks from an old convoy battle with salvage potential.',
        risk: 'Medium',
        rewardHint: 'Potential salvage, encrypted logs, and recoverable cargo.'
    },
    {
        kind: 'Mystery',
        name: 'Anomalous Signal Echo',
        summary: 'A periodic deep-space signal with no stable origin point.',
        risk: 'Unknown',
        rewardHint: 'Could indicate hidden structures, traps, or first-contact traces.'
    },
    {
        kind: 'Opportunity',
        name: 'Smuggler Dead-Drop',
        summary: 'A masked cache buoy linked to covert transport networks.',
        risk: 'Medium',
        rewardHint: 'Useful supplies and faction leads if intercepted quietly.'
    },
    {
        kind: 'Navigation',
        name: 'Ancient Lane Marker',
        summary: 'A pre-collapse gravimetric marker still broadcasting weak lane data.',
        risk: 'Low',
        rewardHint: 'Can reveal safer micro-routes and old map fragments.',
        weight: 1
    },
    {
        kind: 'Navigation',
        name: 'Active Jump-Gate',
        summary: 'A functioning gate nexus that can sling ships across major corridor distances.',
        risk: 'Low',
        rewardHint: 'Can open rapid transit options between distant regions.',
        weight: 0.14,
        jumpGateState: 'active'
    },
    {
        kind: 'Navigation',
        name: 'Inactive Jump-Gate',
        summary: 'A dormant gate structure with partial telemetry and unstable startup traces.',
        risk: 'Medium',
        rewardHint: 'Potential to restore long-range transit if reactivated.',
        weight: 0.32,
        jumpGateState: 'inactive'
    },
    {
        kind: 'Navigation',
        name: 'Refueling Station',
        summary: 'An autonomous tanker dock with reserve fuel cells and transfer hardpoints.',
        risk: 'Low',
        rewardHint: 'Extends long-haul range by enabling mid-route fuel top-offs.',
        weight: 0.22,
        isRefuelingStation: true
    }
];

function normalizeGenerationConfig(config) {
    const source = config || {};
    const sizeMode = source.sizeMode === 'custom' ? 'custom' : 'preset';
    const presetKey = source.sizePreset && GRID_PRESETS[source.sizePreset] ? source.sizePreset : 'standard';

    let width = parseInt(source.width, 10);
    let height = parseInt(source.height, 10);
    if (sizeMode === 'preset') {
        width = GRID_PRESETS[presetKey].width;
        height = GRID_PRESETS[presetKey].height;
    }
    if (!Number.isFinite(width) || width < 1) width = GRID_PRESETS.standard.width;
    if (!Number.isFinite(height) || height < 1) height = GRID_PRESETS.standard.height;

    const densityMode = source.densityMode === 'manual' ? 'manual' : 'preset';
    const densityPreset = normalizeDensityPresetKey(source.densityPreset);

    let manualMin = parseInt(source.manualMin, 10);
    let manualMax = parseInt(source.manualMax, 10);
    if (!Number.isFinite(manualMin) || manualMin < 0) manualMin = 0;
    if (!Number.isFinite(manualMax) || manualMax < 0) manualMax = 0;
    const totalHexes = width * height;
    manualMin = Math.min(manualMin, totalHexes);
    manualMax = Math.min(manualMax, totalHexes);
    if (manualMin > manualMax) {
        const temp = manualMin;
        manualMin = manualMax;
        manualMax = temp;
    }

    const generationProfile = GENERATION_PROFILES[source.generationProfile] ? source.generationProfile : 'high_adventure';
    const starDistribution = source.starDistribution === 'clusters' ? 'clusters' : 'standard';

    return {
        sizeMode,
        sizePreset: presetKey,
        width,
        height,
        densityMode,
        densityPreset,
        manualMin,
        manualMax,
        generationProfile,
        starDistribution,
        realisticPlanetWeights: !!source.realisticPlanetWeights
    };
}

function getGenerationConfigSnapshot() {
    if (state.sectorConfigSnapshot) return normalizeGenerationConfig(state.sectorConfigSnapshot);
    if (state.lastSectorSnapshot && state.lastSectorSnapshot.sectorConfigSnapshot) {
        return normalizeGenerationConfig(state.lastSectorSnapshot.sectorConfigSnapshot);
    }
    return normalizeGenerationConfig(readGenerationConfigFromUi({
        sizeMode: state.sizeMode,
        densityMode: state.densityMode
    }));
}

function getActiveGenerationProfile(profileKey) {
    return GENERATION_PROFILES[profileKey] || GENERATION_PROFILES.cinematic;
}

function rollStarClass() {
    const roll = rand();
    if (roll > 0.99) return 'Black Hole';
    if (roll > 0.97) return 'Neutron';
    if (roll > 0.94) return 'O';
    if (roll > 0.90) return 'B';
    if (roll > 0.80) return 'A';
    if (roll > 0.65) return 'F';
    if (roll > 0.45) return 'G';
    if (roll > 0.20) return 'K';
    return 'M';
}

function pickStarCount(profileKey) {
    const profile = profileKey || 'high_adventure';
    const roll = rand();
    if (profile === 'hard_scifi') {
        if (roll < 0.03) return 3;
        if (roll < 0.21) return 2;
        return 1;
    }
    if (profile === 'cinematic') {
        if (roll < 0.02) return 3;
        if (roll < 0.16) return 2;
        return 1;
    }
    if (roll < 0.015) return 3;
    if (roll < 0.115) return 2;
    return 1;
}

function generateSystemStars(profileKey, systemName = '') {
    const starCount = pickStarCount(profileKey);
    const roleLabels = ['Primary', 'Secondary', 'Tertiary'];
    const letterLabels = ['A', 'B', 'C'];
    const stars = [];

    for (let i = 0; i < starCount; i++) {
        const starClass = rollStarClass();
        const palette = STAR_VISUALS[starClass] || STAR_VISUALS.default;
        stars.push({
            class: starClass,
            color: palette.core,
            glow: palette.halo,
            palette,
            starAge: generateStarAge(starClass),
            role: roleLabels[i] || `Companion ${i}`,
            name: `${systemName || 'Unnamed'} ${letterLabels[i] || String.fromCharCode(65 + i)}`
        });
    }
    return stars;
}

function generateNameCandidate() {
    const p1 = NAME_PREFIX[Math.floor(rand() * NAME_PREFIX.length)];
    const p2 = NAME_SUFFIX[Math.floor(rand() * NAME_SUFFIX.length)];
    const num = Math.floor(rand() * 999) + 1;
    return rand() > 0.5 ? `${p1}-${num}` : `${p1} ${p2}`;
}

function parseCoordId(coordId) {
    const parsed = parseHexId(coordId);
    if (!parsed) return { c: NaN, r: NaN };
    return { c: parsed.col, r: parsed.row };
}

function areCoordsAdjacent(coordA, coordB) {
    const a = parseCoordId(coordA);
    const b = parseCoordId(coordB);
    if (!Number.isInteger(a.c) || !Number.isInteger(a.r) || !Number.isInteger(b.c) || !Number.isInteger(b.r)) {
        return false;
    }
    const dc = Math.abs(a.c - b.c);
    const dr = Math.abs(a.r - b.r);
    return (dc <= 1 && dr <= 1) && !(dc === 0 && dr === 0);
}

function hasAdjacentDuplicateName(coordId, name, sectorsByCoord) {
    return Object.entries(sectorsByCoord || {}).some(([otherCoord, system]) =>
        !!system && system.name === name && areCoordsAdjacent(coordId, otherCoord)
    );
}

function generateSystemName(coordId, usedNames, sectorsByCoord) {
    const MAX_ATTEMPTS = 400;
    const registry = usedNames || new Set();

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const candidate = generateNameCandidate();
        if (!registry.has(candidate)) {
            registry.add(candidate);
            return candidate;
        }
        if (
            hasAdjacentDuplicateName(coordId, candidate, sectorsByCoord) &&
            rand() < ADJACENT_DUPLICATE_NAME_CHANCE
        ) {
            return candidate;
        }
    }

    let fallback = `${generateNameCandidate()}-${Math.floor(rand() * 900) + 100}`;
    while (registry.has(fallback)) {
        fallback = `${generateNameCandidate()}-${Math.floor(rand() * 900) + 100}`;
    }
    registry.add(fallback);
    return fallback;
}

function computeSystemCount(totalHexes, config) {
    if (config.densityMode === 'preset') {
        const densityRatio = getDensityRatioForPreset(config.densityPreset, config.generationProfile);
        return Math.floor(totalHexes * densityRatio);
    }

    let min = config.manualMin;
    let max = config.manualMax;
    if (min < 0) min = 0;
    if (min > totalHexes) min = totalHexes;
    if (max > totalHexes) max = totalHexes;
    if (min > max) {
        const temp = min;
        min = max;
        max = temp;
    }
    return Math.floor(rand() * (max - min + 1)) + min;
}

function refreshSectorSnapshot(config, width, height, changeLabel = 'Update Sector') {
    const totalHexes = width * height;
    const systemCount = Object.keys(state.sectors).length;
    state.sectorConfigSnapshot = normalizeGenerationConfig(config);
    state.lastSectorSnapshot = buildSectorPayload({ width, height, totalHexes, systemCount });
    autoSaveSectorState();
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: changeLabel });
}

function updateSectorStatus(totalHexes, systemCount) {
    document.getElementById('statusTotalHexes').innerText = `${totalHexes} Hexes`;
    document.getElementById('statusTotalSystems').innerText = `${systemCount} Systems`;
}

function setAndUseNewSeed(updateInput = true) {
    const seed = generateSeedString();
    if (updateInput) {
        const input = document.getElementById('seedInput');
        if (input) input.value = seed;
    }
    setSeed(seed);
    return seed;
}

function composeContentSeed(layoutSeed, iteration) {
    return `${layoutSeed}::content:${iteration}`;
}

function countNeighborSystems(hexId, sectors) {
    const parsed = parseHexId(hexId);
    if (!parsed) return 0;
    let count = 0;
    for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
            if (dc === 0 && dr === 0) continue;
            const neighborHexId = `${parsed.col + dc}-${parsed.row + dr}`;
            if (sectors[neighborHexId]) count++;
        }
    }
    return count;
}

function oddrToCube(col, row) {
    const x = col - ((row - (row & 1)) / 2);
    const z = row;
    const y = -x - z;
    return { x, y, z };
}

function cubeDistance(a, b) {
    return Math.max(
        Math.abs(a.x - b.x),
        Math.abs(a.y - b.y),
        Math.abs(a.z - b.z)
    );
}

function hexDistanceById(hexA, hexB) {
    const parsedA = parseHexId(hexA);
    const parsedB = parseHexId(hexB);
    if (!parsedA || !parsedB) return Number.POSITIVE_INFINITY;
    return cubeDistance(
        oddrToCube(parsedA.col, parsedA.row),
        oddrToCube(parsedB.col, parsedB.row)
    );
}

function parseSectorKey(sectorKey) {
    return parseSectorKeyToCoords(sectorKey || HOME_SECTOR_KEY);
}

function isActiveJumpGatePoi(poi) {
    if (!poi) return false;
    if (poi.jumpGateState === 'active') return true;
    return /^active jump-gate\b/i.test(String(poi.name || ''));
}

function getActiveJumpGateSectorWeightMultiplier(sectorKey, knownSectorRecords = {}) {
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

function createDeepSpacePoi(options = {}) {
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
    let roll = rand() * totalWeight;
    let template = weightedTemplates[weightedTemplates.length - 1].template;
    for (let i = 0; i < weightedTemplates.length; i++) {
        const candidate = weightedTemplates[i];
        roll -= candidate.weight;
        if (roll <= 0) {
            template = candidate.template;
            break;
        }
    }
    const serial = Math.floor(rand() * 900) + 100;
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

function isJumpGatePoi(poi) {
    if (!poi) return false;
    return /jump-gate/i.test(String(poi.name || ''));
}

function generateDeepSpacePois(width, height, sectors, options = {}) {
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
            if (rand() > spawnChance) continue;
            const edgeDistance = Math.min(c, r, (width - 1) - c, (height - 1) - r);
            let poi = createDeepSpacePoi({ edgeDistance, activeJumpGateWeightMultiplier });
            if (isJumpGatePoi(poi)) {
                const isAtGateCap = jumpGateHexes.length >= maxJumpGatesPerSector;
                const isTooCloseToOtherGate = jumpGateHexes.some(otherHexId =>
                    hexDistanceById(otherHexId, hexId) < minJumpGateSeparation
                );
                if (isAtGateCap || isTooCloseToOtherGate) {
                    poi = createDeepSpacePoi({ edgeDistance, allowJumpGates: false, activeJumpGateWeightMultiplier });
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

function selectClusteredSystemCoords(candidateCoords, systemsToGenerate) {
    if (systemsToGenerate <= 2 || candidateCoords.length <= 2) {
        return candidateCoords.slice(0, systemsToGenerate);
    }

    const shuffled = [...candidateCoords];
    shuffleArray(shuffled, rand);
    const targetSystemsPerCluster = 4.5;
    const clusterCount = Math.max(
        2,
        Math.min(
            shuffled.length,
            Math.round(systemsToGenerate / targetSystemsPerCluster)
        )
    );
    const parsedCoords = shuffled
        .map((hexId) => ({ hexId, coord: parseHexId(hexId) }))
        .filter((item) => !!item.coord);
    if (!parsedCoords.length) return candidateCoords.slice(0, systemsToGenerate);

    const centers = [];
    centers.push(parsedCoords[Math.floor(rand() * parsedCoords.length)].coord);
    while (centers.length < clusterCount) {
        let best = null;
        let bestScore = Number.NEGATIVE_INFINITY;
        parsedCoords.forEach((item) => {
            const nearest = centers.reduce((min, center) => {
                const dc = item.coord.col - center.col;
                const dr = item.coord.row - center.row;
                const distance = Math.sqrt((dc * dc) + (dr * dr));
                return Math.min(min, distance);
            }, Number.POSITIVE_INFINITY);
            const spreadBias = nearest + (rand() * 0.75);
            if (spreadBias > bestScore) {
                bestScore = spreadBias;
                best = item.coord;
            }
        });
        if (!best) break;
        centers.push(best);
    }
    if (!centers.length) return candidateCoords.slice(0, systemsToGenerate);

    const buckets = centers.map(() => []);
    candidateCoords.forEach((hexId) => {
        const parsed = parseHexId(hexId);
        if (!parsed) return;
        let nearest = Number.POSITIVE_INFINITY;
        let nearestIndex = 0;
        centers.forEach((center, index) => {
            const dc = parsed.col - center.col;
            const dr = parsed.row - center.row;
            const distance = Math.sqrt((dc * dc) + (dr * dr));
            if (distance < nearest) {
                nearest = distance;
                nearestIndex = index;
            }
        });
        buckets[nearestIndex].push({
            hexId,
            score: -nearest + (rand() * 1.8)
        });
    });
    buckets.forEach((bucket) => bucket.sort((a, b) => b.score - a.score));

    const spreadCount = systemsToGenerate >= 10 ? Math.max(1, Math.floor(systemsToGenerate * 0.12)) : 0;
    const clusteredCount = Math.max(0, systemsToGenerate - spreadCount);
    const selected = [];
    let cursor = 0;
    while (selected.length < clusteredCount) {
        let pickedInPass = false;
        for (let i = 0; i < buckets.length && selected.length < clusteredCount; i++) {
            const bucket = buckets[i];
            const item = bucket[cursor];
            if (!item) continue;
            selected.push(item.hexId);
            pickedInPass = true;
        }
        if (!pickedInPass) break;
        cursor++;
    }
    const selectedSet = new Set(selected);
    const spreadCandidates = shuffled.filter((hexId) => !selectedSet.has(hexId));
    const spreadPicked = spreadCandidates.slice(0, systemsToGenerate - selected.length);

    return [...selected, ...spreadPicked];
}

function buildSectorFromConfig(config, fixedSystems = {}, options = {}) {
    const normalized = normalizeGenerationConfig(config);
    const width = normalized.width;
    const height = normalized.height;
    const totalHexes = width * height;

    const validFixedEntries = Object.entries(fixedSystems)
        .filter(([hexId, system]) => !!system && isHexIdInBounds(hexId, width, height));

    const allCoords = [];
    for (let c = 0; c < width; c++) {
        for (let r = 0; r < height; r++) {
            allCoords.push(`${c}-${r}`);
        }
    }

    const fixedHexIds = new Set(validFixedEntries.map(([hexId]) => hexId));
    const candidateCoords = allCoords.filter(hexId => !fixedHexIds.has(hexId));

    let systemCount = computeSystemCount(totalHexes, normalized);
    if (validFixedEntries.length > systemCount) {
        systemCount = validFixedEntries.length;
    }

    shuffleArray(candidateCoords, rand);

    const nextSectors = {};
    validFixedEntries.forEach(([hexId, system]) => {
        nextSectors[hexId] = deepClone(system);
    });
    const usedNames = new Set(
        Object.values(nextSectors)
            .map(system => (system && system.name ? system.name : null))
            .filter(Boolean)
    );

    const systemsToGenerate = Math.max(0, systemCount - validFixedEntries.length);
    const generatedCoords = normalized.starDistribution === 'clusters'
        ? selectClusteredSystemCoords(candidateCoords, systemsToGenerate)
        : candidateCoords.slice(0, systemsToGenerate);

    generatedCoords.forEach(hexId => {
        nextSectors[hexId] = generateSystemData(normalized, {
            coordId: hexId,
            usedNames,
            sectorsByCoord: nextSectors
        });
    });
    const activeJumpGateWeightMultiplier = getActiveJumpGateSectorWeightMultiplier(
        options.sectorKey || HOME_SECTOR_KEY,
        options.knownSectorRecords || {}
    );
    const deepSpacePois = generateDeepSpacePois(width, height, nextSectors, { activeJumpGateWeightMultiplier });

    return {
        config: normalized,
        width,
        height,
        totalHexes,
        systemCount: Object.keys(nextSectors).length,
        sectors: nextSectors,
        deepSpacePois
    };
}

function hasPinnedContentAtHex(hexId) {
    return !!(state.sectors && state.sectors[hexId]) || !!(state.deepSpacePois && state.deepSpacePois[hexId]);
}

function sanitizePinnedHexes(width, height) {
    state.pinnedHexIds = (state.pinnedHexIds || []).filter(hexId => isHexIdInBounds(hexId, width, height) && hasPinnedContentAtHex(hexId));
}

function reconcilePlanetaryBodies(system) {
    if (!system || !Array.isArray(system.planets)) return;
    ensureSystemStarFields(system);
    system.planets = applyPlanetaryOrderAndNames(system.name, system.planets, rand);
    refreshSystemPlanetPopulation(system, { randomFn: rand });
    refreshSystemPlanetTags(system, { randomFn: rand });
    reportSystemInvariantIssues(system, 'reconcile');
}

export function generateSector() {
    if (isAutoSeedEnabled()) {
        const input = document.getElementById('seedInput');
        if (input) input.value = generateSeedString();
    }

    const input = document.getElementById('seedInput');
    let seedUsed = '';
    if (input && (input.value || '').trim()) {
        setSeed((input.value || '').trim());
        seedUsed = (input.value || '').trim();
    } else {
        seedUsed = setAndUseNewSeed();
    }

    const config = normalizeGenerationConfig(readGenerationConfigFromUi({
        sizeMode: state.sizeMode,
        densityMode: state.densityMode
    }));
    state.layoutSeed = seedUsed;
    state.rerollIteration = 0;
    const built = buildSectorFromConfig(config, {}, {
        sectorKey: HOME_SECTOR_KEY,
        knownSectorRecords: {}
    });

    state.sectors = built.sectors;
    state.deepSpacePois = built.deepSpacePois;
    state.pinnedHexIds = [];
    state.selectedHexId = null;
    state.multiSector = {
        currentKey: HOME_SECTOR_KEY,
        jumpGateRegistry: {},
        expandedView: false,
        sectorsByKey: {
            [HOME_SECTOR_KEY]: {
                seed: seedUsed,
                config: deepClone(config),
                sectors: deepClone(built.sectors),
                deepSpacePois: deepClone(built.deepSpacePois),
                pinnedHexIds: [],
                totalHexes: built.totalHexes,
                systemCount: built.systemCount
            }
        }
    };
    clearSelectionInfo();

    redrawGridAndReselect(built.width, built.height, { resetView: true });
    updateSectorStatus(built.totalHexes, built.systemCount);
    refreshSectorSnapshot(config, built.width, built.height, 'Generate Sector');
    showStatusMessage(seedUsed ? `Generated seed ${seedUsed}` : 'Sector regenerated.', 'info');
}

export function generateSystemData(config = null, context = null) {
    const normalized = normalizeGenerationConfig(config || getGenerationConfigSnapshot());
    const generationProfile = getActiveGenerationProfile(normalized.generationProfile);
    const coordId = context && context.coordId ? context.coordId : null;
    const usedNames = context && context.usedNames ? context.usedNames : new Set();
    const sectorsByCoord = context && context.sectorsByCoord ? context.sectorsByCoord : state.sectors;
    const name = generateSystemName(coordId, usedNames, sectorsByCoord);
    const stars = generateSystemStars(normalized.generationProfile, name);
    const primaryStar = stars[0];
    const sClass = primaryStar.class;

    const planetCount = Math.floor(rand() * 6) + 1;
    const planets = [];
    let hasTerrestrial = false;
    const starAge = primaryStar.starAge;

    const useWeightedTypes = normalized.realisticPlanetWeights;
    for (let i = 0; i < planetCount; i++) {
        const excludedTypes = hasTerrestrial ? new Set(['Terrestrial']) : new Set();
        const type = useWeightedTypes
            ? pickPlanetTypeForStarClass(sClass, rand, excludedTypes)
            : pickRandomPlanetType(rand, excludedTypes);
        if (type === 'Terrestrial') hasTerrestrial = true;
        const environment = generatePlanetEnvironment(type, rand);
        const features = [];

        if (rand() < generationProfile.planetPoiChance) {
            const poi = POI_TYPES[Math.floor(rand() * POI_TYPES.length)];
            features.push(poi);
        }

        planets.push({
            name: `${name} ${romanize(i + 1)}`,
            type,
            size: generatePlanetSize(type, rand),
            atmosphere: environment.atmosphere,
            temperature: environment.temperature,
            features,
            pop: 0,
            basePop: 0,
            tags: [],
            habitable: false
        });
    }

    assignSystemHabitability(planets, generationProfile, rand);
    const normalizedPlanetaryBodies = applyPlanetaryOrderAndNames(name, planets, rand);
    planets.length = 0;
    planets.push(...normalizedPlanetaryBodies);

    if (rand() < generationProfile.beltChance) {
        planets.push({
            name: `${name} Belt`,
            type: rand() > 0.6 ? 'Debris Field' : 'Asteroid Belt',
            features: rand() > 0.55 ? ['Resource-Rich'] : [],
            pop: 0
        });
    }

    if (rand() < generationProfile.stationChance) {
        const poi = POI_TYPES[Math.floor(rand() * POI_TYPES.length)];
        planets.push({
            name: `Station Alpha-${Math.floor(rand() * 99)}`,
            type: 'Artificial',
            features: [poi],
            pop: 0
        });
    }

    const visuals = STAR_VISUALS[sClass] || STAR_VISUALS.default;
    const generatedSystem = {
        name,
        stars,
        starClass: sClass,
        color: visuals.core,
        glow: visuals.halo,
        palette: visuals,
        starAge,
        planets,
        totalPop: 'None'
    };
    ensureSystemStarFields(generatedSystem);
    refreshSystemPlanetPopulation(generatedSystem, { forceRecalculate: true, randomFn: rand });
    refreshSystemPlanetTags(generatedSystem, { forceRecalculate: true, randomFn: rand });
    reportSystemInvariantIssues(generatedSystem, 'generate');
    return generatedSystem;
}

function notifyEditModeChanged() {
    emitEvent(EVENTS.EDIT_MODE_CHANGED);
}

export function setEditMode(enabled) {
    state.editMode = !!enabled;
    state.selectedBodyIndex = null;
    notifyEditModeChanged();
}

export function toggleEditMode() {
    setEditMode(!state.editMode);
    showStatusMessage(state.editMode ? 'Edit mode enabled.' : 'Edit mode disabled.', 'info');
}

export function addSystemAtHex(hexId) {
    const config = getGenerationConfigSnapshot();
    if (!isHexIdInBounds(hexId, config.width, config.height)) return;
    if (state.sectors[hexId]) return;
    const deepSpacePoi = state.deepSpacePois && state.deepSpacePois[hexId] ? state.deepSpacePois[hexId] : null;
    if (deepSpacePoi) {
        const canPrompt = typeof window !== 'undefined' && typeof window.confirm === 'function';
        const shouldProceed = canPrompt
            ? window.confirm(`This hex contains a deep-space POI (${deepSpacePoi.name || deepSpacePoi.kind || 'Unknown Site'}). Place a star system here anyway?`)
            : true;
        if (!shouldProceed) {
            showStatusMessage('System placement cancelled. Deep-space POI preserved.', 'info');
            return;
        }
    }

    const usedNames = new Set(
        Object.values(state.sectors)
            .map(system => (system && system.name ? system.name : null))
            .filter(Boolean)
    );
    state.sectors[hexId] = generateSystemData(config, {
        coordId: hexId,
        usedNames,
        sectorsByCoord: state.sectors
    });
    if (state.deepSpacePois && state.deepSpacePois[hexId]) {
        delete state.deepSpacePois[hexId];
    }
    reportSystemInvariantIssues(state.sectors[hexId], 'add-system');

    redrawHexAndReselect(hexId);
    sanitizePinnedHexes(config.width, config.height);
    refreshSectorSnapshot(config, config.width, config.height, 'Add System');
    updateSectorStatus(config.width * config.height, Object.keys(state.sectors).length);
    showStatusMessage(`Added system at ${getGlobalHexDisplayId(hexId)}.`, 'success');
}

export function deleteSelectedSystem() {
    const selectedHexId = state.selectedHexId;
    if (!selectedHexId || !state.sectors[selectedHexId]) {
        showStatusMessage('Select a system to delete.', 'warn');
        return;
    }

    const config = getGenerationConfigSnapshot();
    delete state.sectors[selectedHexId];
    if (state.deepSpacePois && state.deepSpacePois[selectedHexId]) {
        delete state.deepSpacePois[selectedHexId];
    }
    state.pinnedHexIds = (state.pinnedHexIds || []).filter(id => id !== selectedHexId);
    clearSelectionInfo();

    redrawHexAndReselect(selectedHexId);
    sanitizePinnedHexes(config.width, config.height);
    refreshSectorSnapshot(config, config.width, config.height, 'Delete System');
    updateSectorStatus(config.width * config.height, Object.keys(state.sectors).length);
    showStatusMessage(`Deleted system ${getGlobalHexDisplayId(selectedHexId)}.`, 'success');
}

export function addPoiAtHex(hexId) {
    const config = getGenerationConfigSnapshot();
    if (!isHexIdInBounds(hexId, config.width, config.height)) return;
    if (state.sectors[hexId]) {
        showStatusMessage('Cannot add POI on a system hex.', 'warn');
        return;
    }
    if (!state.deepSpacePois) state.deepSpacePois = {};
    if (state.deepSpacePois[hexId]) {
        showStatusMessage(`POI already exists at ${getGlobalHexDisplayId(hexId)}.`, 'info');
        return;
    }

    state.deepSpacePois[hexId] = createDeepSpacePoi();

    redrawHexAndSelectHex(hexId);
    refreshSectorSnapshot(config, config.width, config.height, 'Add POI');
    showStatusMessage(`Added POI at ${getGlobalHexDisplayId(hexId)}.`, 'success');
}

export function deletePoiAtHex(hexId) {
    const config = getGenerationConfigSnapshot();
    if (!isHexIdInBounds(hexId, config.width, config.height)) return;
    if (!state.deepSpacePois || !state.deepSpacePois[hexId]) {
        showStatusMessage('No POI found at selected hex.', 'warn');
        return;
    }

    delete state.deepSpacePois[hexId];
    state.pinnedHexIds = (state.pinnedHexIds || []).filter(id => id !== hexId);

    redrawHexAndSelectHex(hexId);
    refreshSectorSnapshot(config, config.width, config.height, 'Delete POI');
    showStatusMessage(`Deleted POI at ${getGlobalHexDisplayId(hexId)}.`, 'success');
}

export function renamePoiAtHex(hexId) {
    const config = getGenerationConfigSnapshot();
    if (!isHexIdInBounds(hexId, config.width, config.height)) return;
    const poi = state.deepSpacePois && state.deepSpacePois[hexId] ? state.deepSpacePois[hexId] : null;
    if (!poi) {
        showStatusMessage('No POI found to rename.', 'warn');
        return;
    }
    const nextNameRaw = prompt('Rename POI', poi.name || 'Deep-Space Site');
    if (nextNameRaw === null) return;
    const nextName = nextNameRaw.trim();
    if (!nextName || nextName === poi.name) return;
    poi.name = nextName;

    redrawHexAndSelectHex(hexId);
    refreshSectorSnapshot(config, config.width, config.height, 'Rename POI');
    showStatusMessage(`Renamed POI at ${getGlobalHexDisplayId(hexId)}.`, 'success');
}

export function addBodyToSelectedSystem(kind) {
    const selectedHexId = state.selectedHexId;
    const system = selectedHexId ? state.sectors[selectedHexId] : null;
    if (!system) {
        showStatusMessage('Select a system first.', 'warn');
        return;
    }

    if (kind === 'planet') {
        const hasTerrestrial = system.planets.some(body => isPlanetaryBody(body) && body.type === 'Terrestrial');
        const excluded = hasTerrestrial ? new Set(['Terrestrial']) : new Set();
        const type = pickRandomPlanetType(rand, excluded);
        const environment = generatePlanetEnvironment(type, rand);
        system.planets.push({
            name: `${system.name} ${romanize(1)}`,
            type,
            size: generatePlanetSize(type, rand),
            atmosphere: environment.atmosphere,
            temperature: environment.temperature,
            features: [],
            pop: 0,
            basePop: 0,
            tags: [],
            habitable: false
        });
        reconcilePlanetaryBodies(system);
    } else if (kind === 'belt') {
        const existing = system.planets.filter(body => isBeltOrFieldBodyType(body.type)).length;
        system.planets.push({
            name: `${system.name} Belt ${romanize(existing + 1)}`,
            type: rand() > 0.6 ? 'Debris Field' : 'Asteroid Belt',
            features: [],
            pop: 0
        });
    } else if (kind === 'station') {
        const existing = system.planets.filter(body => isArtificialBodyType(body.type)).length;
        system.planets.push({
            name: `Station ${system.name} ${romanize(existing + 1)}`,
            type: 'Artificial',
            features: [],
            pop: 0
        });
    } else {
        return;
    }

    state.selectedBodyIndex = null;
    refreshHexInfo(selectedHexId);
    reportSystemInvariantIssues(system, 'add-body');
    const config = getGenerationConfigSnapshot();
    refreshSectorSnapshot(config, config.width, config.height, 'Add Object');
    showStatusMessage('Added new object.', 'success');
}

export function deleteSelectedBody() {
    const selectedHexId = state.selectedHexId;
    const system = selectedHexId ? state.sectors[selectedHexId] : null;
    if (!system) {
        showStatusMessage('Select a system first.', 'warn');
        return;
    }
    if (!Number.isInteger(state.selectedBodyIndex) || state.selectedBodyIndex < 0 || state.selectedBodyIndex >= system.planets.length) {
        showStatusMessage('Select an object to delete.', 'warn');
        return;
    }

    const [removed] = system.planets.splice(state.selectedBodyIndex, 1);
    state.selectedBodyIndex = null;
    if (removed && isPlanetaryBody(removed)) {
        reconcilePlanetaryBodies(system);
    }

    refreshHexInfo(selectedHexId);
    reportSystemInvariantIssues(system, 'delete-body');
    const config = getGenerationConfigSnapshot();
    refreshSectorSnapshot(config, config.width, config.height, 'Delete Object');
    showStatusMessage('Deleted selected object.', 'success');
}

export function rerollSelectedPlanet() {
    const selectedHexId = state.selectedHexId;
    const system = selectedHexId ? state.sectors[selectedHexId] : null;
    if (!system) {
        showStatusMessage('Select a system first.', 'warn');
        return;
    }
    if (!Number.isInteger(state.selectedBodyIndex) || state.selectedBodyIndex < 0 || state.selectedBodyIndex >= system.planets.length) {
        showStatusMessage('Select a planet to reroll.', 'warn');
        return;
    }

    const targetPlanet = system.planets[state.selectedBodyIndex];
    if (!isPlanetaryBody(targetPlanet)) {
        showStatusMessage('Only planets can be rerolled.', 'warn');
        return;
    }

    const config = getGenerationConfigSnapshot();
    const hasOtherTerrestrial = system.planets.some((body, idx) =>
        idx !== state.selectedBodyIndex && isPlanetaryBody(body) && body.type === 'Terrestrial'
    );
    const excludedTypes = hasOtherTerrestrial ? new Set(['Terrestrial']) : new Set();
    const nextType = config.realisticPlanetWeights
        ? pickPlanetTypeForStarClass(system.starClass, rand, excludedTypes)
        : pickRandomPlanetType(rand, excludedTypes);
    const nextEnvironment = generatePlanetEnvironment(nextType, rand);

    const wasHabitable = !!targetPlanet.habitable;
    targetPlanet.type = nextType;
    targetPlanet.size = generatePlanetSize(nextType, rand);
    targetPlanet.atmosphere = nextEnvironment.atmosphere;
    targetPlanet.temperature = nextEnvironment.temperature;
    targetPlanet.features = [];
    targetPlanet.pop = 0;
    targetPlanet.basePop = 0;
    targetPlanet.tags = [];
    targetPlanet.habitable = wasHabitable && isHabitableCandidateType(nextType);

    const planetaryBodies = system.planets.filter(isPlanetaryBody);
    const hasAnyHabitable = planetaryBodies.some(planet => !!planet.habitable);
    if (!hasAnyHabitable) {
        const fallbackCandidate = planetaryBodies.find(planet => isHabitableCandidateType(planet.type));
        if (fallbackCandidate) {
            fallbackCandidate.habitable = true;
        } else {
            targetPlanet.type = 'Terrestrial';
            targetPlanet.size = generatePlanetSize('Terrestrial', rand);
            const fallbackEnvironment = generatePlanetEnvironment('Terrestrial', rand);
            targetPlanet.atmosphere = fallbackEnvironment.atmosphere;
            targetPlanet.temperature = fallbackEnvironment.temperature;
            targetPlanet.habitable = true;
        }
    }
    reconcilePlanetaryBodies(system);

    const updatedIndex = system.planets.indexOf(targetPlanet);
    state.selectedBodyIndex = updatedIndex >= 0 ? updatedIndex : null;
    refreshHexInfo(selectedHexId, state.selectedBodyIndex);
    reportSystemInvariantIssues(system, 'reroll-planet');
    refreshSectorSnapshot(config, config.width, config.height, 'Reroll Planet');
    showStatusMessage('Rerolled selected planet.', 'success');
}

export function rerollSelectedSystem() {
    const selectedHexId = state.selectedHexId;
    if (!selectedHexId) {
        showStatusMessage('Select a system or POI before rerolling.', 'warn');
        return;
    }

    const config = getGenerationConfigSnapshot();
    const selectedPoi = state.deepSpacePois && state.deepSpacePois[selectedHexId] ? state.deepSpacePois[selectedHexId] : null;
    if (selectedPoi && !state.sectors[selectedHexId]) {
        state.deepSpacePois[selectedHexId] = createDeepSpacePoi();
        redrawHexAndSelectHex(selectedHexId);
        refreshSectorSnapshot(config, config.width, config.height, 'Reroll POI');
        showStatusMessage(`Rerolled POI at ${getGlobalHexDisplayId(selectedHexId)}.`, 'success');
        return;
    }
    if (!state.sectors[selectedHexId]) {
        showStatusMessage('Select an existing system before rerolling.', 'warn');
        return;
    }

    const seedUsed = setAndUseNewSeed(false);
    const otherSystems = { ...state.sectors };
    delete otherSystems[selectedHexId];
    const usedNames = new Set(
        Object.values(otherSystems)
            .map(system => (system && system.name ? system.name : null))
            .filter(Boolean)
    );
    state.sectors[selectedHexId] = generateSystemData(config, {
        coordId: selectedHexId,
        usedNames,
        sectorsByCoord: otherSystems
    });
    reportSystemInvariantIssues(state.sectors[selectedHexId], 'reroll-selected');

    redrawHexAndReselect(selectedHexId);
    sanitizePinnedHexes(config.width, config.height);
    refreshSectorSnapshot(config, config.width, config.height, 'Reroll System');
    showStatusMessage(`Rerolled system ${getGlobalHexDisplayId(selectedHexId)} with seed ${seedUsed}.`, 'success');
}

export function togglePinSelectedSystem() {
    const selectedHexId = state.selectedHexId;
    if (!selectedHexId) {
        showStatusMessage('Select a system or POI to pin.', 'warn');
        return;
    }
    const isSystem = !!state.sectors[selectedHexId];
    const isPoi = !!(state.deepSpacePois && state.deepSpacePois[selectedHexId]);
    if (!isSystem && !isPoi) {
        showStatusMessage('Select a system or POI to pin.', 'warn');
        return;
    }

    const pinned = new Set(state.pinnedHexIds || []);
    if (pinned.has(selectedHexId)) {
        pinned.delete(selectedHexId);
        showStatusMessage(`Unpinned ${isSystem ? 'system' : 'POI'} ${getGlobalHexDisplayId(selectedHexId)}.`, 'info');
    } else {
        pinned.add(selectedHexId);
        showStatusMessage(`Pinned ${isSystem ? 'system' : 'POI'} ${getGlobalHexDisplayId(selectedHexId)}.`, 'success');
    }

    state.pinnedHexIds = Array.from(pinned);

    const activeSectorKey = state.multiSector && state.multiSector.currentKey ? state.multiSector.currentKey : '';
    const group = document.querySelector(`.hex-group[data-id="${selectedHexId}"][data-sector-key="${activeSectorKey}"]`);
    const poly = group ? group.querySelector('polygon.hex') : null;
    if (poly) {
        poly.classList.toggle('pinned', state.pinnedHexIds.includes(selectedHexId));
    }

    refreshHexInfo(selectedHexId);
    const config = getGenerationConfigSnapshot();
    refreshSectorSnapshot(config, config.width, config.height, 'Toggle Pin');
}

export function rerollUnpinnedSystems() {
    if (!Object.keys(state.sectors || {}).length) {
        showStatusMessage('Generate a sector before rerolling.', 'warn');
        return;
    }

    const config = getGenerationConfigSnapshot();
    const width = config.width;
    const height = config.height;

    const fixedSystems = {};
    const fixedPois = {};
    (state.pinnedHexIds || []).forEach(hexId => {
        if (isHexIdInBounds(hexId, width, height) && state.sectors[hexId]) {
            fixedSystems[hexId] = state.sectors[hexId];
        }
        if (isHexIdInBounds(hexId, width, height) && state.deepSpacePois && state.deepSpacePois[hexId] && !state.sectors[hexId]) {
            fixedPois[hexId] = state.deepSpacePois[hexId];
        }
    });

    const layoutSeed = state.layoutSeed || state.currentSeed || setAndUseNewSeed(false);
    const nextIteration = (parseInt(state.rerollIteration, 10) || 0) + 1;
    const contentSeed = composeContentSeed(layoutSeed, nextIteration);
    setRandomStream(contentSeed);

    const nextSectors = {};
    Object.entries(fixedSystems).forEach(([hexId, system]) => {
        nextSectors[hexId] = deepClone(system);
    });
    const usedNames = new Set(
        Object.values(nextSectors)
            .map(system => (system && system.name ? system.name : null))
            .filter(Boolean)
    );
    const targetHexIds = sortHexIds(Object.keys(state.sectors || {}));
    targetHexIds.forEach((hexId) => {
        if (nextSectors[hexId]) return;
        nextSectors[hexId] = generateSystemData(config, {
            coordId: hexId,
            usedNames,
            sectorsByCoord: nextSectors
        });
        reportSystemInvariantIssues(nextSectors[hexId], 'reroll-unpinned');
    });
    const selectedHexId = state.selectedHexId;

    state.layoutSeed = layoutSeed;
    state.rerollIteration = nextIteration;
    state.currentSeed = layoutSeed;
    state.sectors = nextSectors;
    state.deepSpacePois = generateDeepSpacePois(width, height, nextSectors);
    Object.entries(fixedPois).forEach(([hexId, poi]) => {
        if (!state.sectors[hexId]) {
            state.deepSpacePois[hexId] = deepClone(poi);
        }
    });
    sanitizePinnedHexes(width, height);

    redrawGridAndReselect(width, height, { selectedHexId });
    updateSectorStatus(width * height, Object.keys(nextSectors).length);
    refreshSectorSnapshot(config, width, height, 'Reroll Unpinned');
    showStatusMessage(`Rerolled unpinned systems (layout seed ${layoutSeed}, pass ${nextIteration}).`, 'success');
}

export function createSectorRecord(options = {}) {
    const config = normalizeGenerationConfig(options.config || getGenerationConfigSnapshot());
    const fixedSystems = options && options.fixedSystems ? options.fixedSystems : {};
    const requestedSeed = options && options.seed ? String(options.seed).trim() : '';
    const seed = requestedSeed || generateSeedString();

    const previousSeed = state.currentSeed;
    const previousRandom = state.seededRandomFn;
    setSeed(seed);
    const built = buildSectorFromConfig(config, fixedSystems, {
        sectorKey: options && options.sectorKey ? options.sectorKey : HOME_SECTOR_KEY,
        knownSectorRecords: options && options.knownSectorRecords ? options.knownSectorRecords : {}
    });
    state.currentSeed = previousSeed;
    state.seededRandomFn = previousRandom;

    return {
        seed,
        config,
        sectors: deepClone(built.sectors),
        deepSpacePois: deepClone(built.deepSpacePois),
        pinnedHexIds: [],
        totalHexes: built.totalHexes,
        systemCount: built.systemCount
    };
}
