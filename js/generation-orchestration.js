import { rebuildGenerationContextSummaries } from './generation-context-summary.js';
import { resolveGenerationRolloutFlags } from './generation-rollout.js';
import { createFactionStateForSector } from './factions.js';

export function refreshSectorSnapshotAction(config, width, height, changeLabel = 'Update Sector', deps) {
    const {
        state,
        normalizeGenerationConfig,
        buildSectorPayload,
        autoSaveSectorState,
        emitEvent,
        events
    } = deps;
    const totalHexes = width * height;
    const systemCount = Object.keys(state.sectors).length;
    state.sectorConfigSnapshot = normalizeGenerationConfig(config);
    state.lastSectorSnapshot = buildSectorPayload({ width, height, totalHexes, systemCount });
    autoSaveSectorState();
    emitEvent(events.SECTOR_DATA_CHANGED, { label: changeLabel });
}

export function updateSectorStatusAction(totalHexes, systemCount) {
    document.getElementById('statusTotalHexes').innerText = `${totalHexes} Hexes`;
    document.getElementById('statusTotalSystems').innerText = `${systemCount} Systems`;
}

export function setAndUseNewSeedAction(updateInput = true, deps) {
    const { generateSeedString, setSeed } = deps;
    const seed = generateSeedString();
    if (updateInput) {
        const input = document.getElementById('seedInput');
        if (input) input.value = seed;
    }
    setSeed(seed);
    return seed;
}

export function composeContentSeed(layoutSeed, iteration) {
    return `${layoutSeed}::content:${iteration}`;
}

function parseHexCoordinate(hexId) {
    const [colRaw, rowRaw] = String(hexId || '').split('-');
    const col = Number(colRaw);
    const row = Number(rowRaw);
    if (!Number.isInteger(col) || !Number.isInteger(row)) return null;
    return { col, row };
}

function hexDistanceSimple(hexA, hexB) {
    const a = parseHexCoordinate(hexA);
    const b = parseHexCoordinate(hexB);
    if (!a || !b) return Number.POSITIVE_INFINITY;
    return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

function compareHexIds(hexA, hexB) {
    const a = parseHexCoordinate(hexA);
    const b = parseHexCoordinate(hexB);
    if (!a || !b) return String(hexA).localeCompare(String(hexB));
    if (a.col !== b.col) return a.col - b.col;
    if (a.row !== b.row) return a.row - b.row;
    return String(hexA).localeCompare(String(hexB));
}

function chooseClosestToCenterHexId(coordHexIds, width, height) {
    const centerX = (Math.max(1, width) - 1) / 2;
    const centerY = (Math.max(1, height) - 1) / 2;
    const scored = coordHexIds
        .map((hexId) => {
            const parsed = parseHexCoordinate(hexId);
            if (!parsed) return { hexId, distance: Number.POSITIVE_INFINITY };
            const distance = Math.hypot(parsed.col - centerX, parsed.row - centerY);
            return { hexId, distance };
        })
        .sort((a, b) => a.distance - b.distance || compareHexIds(a.hexId, b.hexId));
    return scored.length ? scored[0].hexId : null;
}

function chooseCenterBiasedHexId(coordHexIds, width, height, randomFn, biasStrength = 1) {
    if (!coordHexIds.length) return null;
    const centerX = (Math.max(1, width) - 1) / 2;
    const centerY = (Math.max(1, height) - 1) / 2;
    const maxDistance = Math.max(1, Math.hypot(centerX, centerY));
    const exponent = Math.max(0.25, Number(biasStrength) || 1);
    const weighted = coordHexIds
        .map((hexId) => {
            const parsed = parseHexCoordinate(hexId);
            if (!parsed) return { hexId, weight: 0.0001 };
            const distance = Math.hypot(parsed.col - centerX, parsed.row - centerY);
            const centrality = Math.max(0, 1 - (distance / maxDistance));
            const weight = Math.pow(centrality + 0.05, exponent);
            return { hexId, weight: Math.max(0.0001, weight) };
        })
        .sort((a, b) => compareHexIds(a.hexId, b.hexId));
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) return chooseClosestToCenterHexId(coordHexIds, width, height);
    const roll = (typeof randomFn === 'function' ? randomFn() : Math.random()) * totalWeight;
    let cursor = 0;
    for (let i = 0; i < weighted.length; i++) {
        cursor += weighted[i].weight;
        if (roll <= cursor) return weighted[i].hexId;
    }
    return weighted[weighted.length - 1].hexId;
}

function sortCoordsByAnchorDistance(coords, anchorHexId) {
    if (!anchorHexId) return coords;
    return [...coords].sort((a, b) => {
        const distanceA = hexDistanceSimple(a, anchorHexId);
        const distanceB = hexDistanceSimple(b, anchorHexId);
        if (distanceA !== distanceB) return distanceA - distanceB;
        return compareHexIds(a, b);
    });
}

function chooseCoreGenerationOriginHexId(candidateCoords, fixedHexIds, options = {}, width, height, randomFn, settings = {}) {
    const preferredHexId = options.preferredCoreSystemHexId || null;
    if (options.preferredCoreSystemManual && preferredHexId && (candidateCoords.includes(preferredHexId) || fixedHexIds.has(preferredHexId))) {
        return preferredHexId;
    }
    if (preferredHexId && (candidateCoords.includes(preferredHexId) || fixedHexIds.has(preferredHexId))) {
        return preferredHexId;
    }
    if (candidateCoords.length) {
        return chooseCenterBiasedHexId(
            candidateCoords,
            width,
            height,
            randomFn,
            Number(settings.centerBiasStrength) || 1
        );
    }
    if (fixedHexIds.size) return chooseClosestToCenterHexId([...fixedHexIds], width, height);
    return null;
}

function ensureGenerationOriginIncluded(generatedCoords, systemsToGenerate, candidateCoords, originHexId) {
    if (!originHexId || systemsToGenerate <= 0 || !candidateCoords.includes(originHexId)) return generatedCoords;
    if (generatedCoords.includes(originHexId)) return generatedCoords;
    if (!generatedCoords.length) return [originHexId];

    const next = [...generatedCoords];
    const dropIndex = next.reduce((worstIndex, hexId, index, list) => {
        if (worstIndex < 0) return index;
        const worstDistance = hexDistanceSimple(list[worstIndex], originHexId);
        const currentDistance = hexDistanceSimple(hexId, originHexId);
        if (currentDistance > worstDistance) return index;
        if (currentDistance < worstDistance) return worstIndex;
        return compareHexIds(hexId, list[worstIndex]) > 0 ? index : worstIndex;
    }, -1);
    if (dropIndex >= 0) next[dropIndex] = originHexId;
    return next;
}

export function buildSectorFromConfigAction(config, fixedSystems = {}, options = {}, deps) {
    const {
        state,
        normalizeGenerationConfig,
        isHexIdInBounds,
        computeSystemCount,
        shuffleArray,
        rand,
        deepClone,
        selectClusteredSystemCoords,
        selectClusteredSystemCoordsV2,
        createGenerationContext,
        generateSystemData,
        computeCoreSystemScore,
        getActiveJumpGateSectorWeightMultiplier,
        generateDeepSpacePois,
        resolveCoreSystemHexId,
        homeSectorKey
    } = deps;
    const normalized = normalizeGenerationConfig(config);
    const perfEnabled = !!normalized.generationPerformanceDebugEnabled;
    const perfStart = perfEnabled ? performance.now() : 0;
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
    const sectorKey = options.sectorKey || homeSectorKey;
    const isHomeSector = sectorKey === homeSectorKey;
    const rollout = resolveGenerationRolloutFlags(normalized, { isHomeSector });
    const layoutSeed = options.layoutSeed || state.layoutSeed || state.currentSeed || '';
    let generationContext = null;
    if (rollout.crossSectorContextEnabled) {
        try {
            generationContext = createGenerationContext(layoutSeed, options.knownSectorRecords || {}, normalized);
        } catch (error) {
            console.warn('Generation context creation failed; falling back to local-only cluster behavior.', error);
            generationContext = null;
        }
    }

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
    const coreGenerationOriginHexId = systemsToGenerate > 0
        ? chooseCoreGenerationOriginHexId(
            candidateCoords,
            fixedHexIds,
            options,
            width,
            height,
            rand,
            normalized
        )
        : null;
    let generatedCoords = [];
    if (normalized.starDistribution === 'clusters') {
        if (rollout.clusterV2Enabled) {
            try {
                generatedCoords = selectClusteredSystemCoordsV2(candidateCoords, systemsToGenerate, rand, {
                    width,
                    height,
                    sectorKey,
                    isHomeSector,
                    settings: normalized,
                    generationContext,
                    preferredPrimaryAnchorHexId: coreGenerationOriginHexId
                });
            } catch (error) {
                console.warn('Cluster V2 failed; falling back to legacy cluster selector.', error);
                generatedCoords = selectClusteredSystemCoords(candidateCoords, systemsToGenerate, rand);
            }
        } else {
            generatedCoords = selectClusteredSystemCoords(candidateCoords, systemsToGenerate, rand);
        }
    } else {
        generatedCoords = candidateCoords.slice(0, systemsToGenerate);
    }
    generatedCoords = ensureGenerationOriginIncluded(generatedCoords, systemsToGenerate, candidateCoords, coreGenerationOriginHexId);

    const orderedGeneratedCoords = sortCoordsByAnchorDistance(generatedCoords, coreGenerationOriginHexId);

    let provisionalCoreHexId = null;
    let provisionalCoreScore = Number.NEGATIVE_INFINITY;
    orderedGeneratedCoords.forEach(hexId => {
        const generatedSystem = generateSystemData(normalized, {
            coordId: hexId,
            usedNames,
            sectorsByCoord: nextSectors
        });
        nextSectors[hexId] = generatedSystem;
        if (!options.preferredCoreSystemManual) {
            const score = computeCoreSystemScore(generatedSystem, hexId, width, height, {
                settings: normalized,
                generationContext,
                sectorKey
            });
            const shouldSelect = score > provisionalCoreScore
                || (score === provisionalCoreScore && compareHexIds(hexId, provisionalCoreHexId || '') < 0);
            if (shouldSelect) {
                provisionalCoreHexId = hexId;
                provisionalCoreScore = score;
            }
        }
    });
    const core = resolveCoreSystemHexId({
        sectors: nextSectors,
        width,
        height,
        preferredHexId: options.preferredCoreSystemManual
            ? (options.preferredCoreSystemHexId || null)
            : (coreGenerationOriginHexId || provisionalCoreHexId),
        preferredIsManual: !!options.preferredCoreSystemManual,
        preferredIsAuto: !options.preferredCoreSystemManual && !!(coreGenerationOriginHexId || provisionalCoreHexId),
        settings: normalized,
        generationContext,
        sectorKey,
        debugScoring: !!normalized.coreScoringDebugEnabled
    });
    if (normalized.coreScoringDebugEnabled && core.coreSystemHexId && core.debugScores) {
        const chosenBreakdown = core.debugScores[core.coreSystemHexId] || null;
        console.debug('[core-scoring]', {
            sectorKey,
            chosenHexId: core.coreSystemHexId,
            chosenBreakdown,
            scoreCount: Object.keys(core.debugScores).length
        });
    }
    const activeJumpGateWeightMultiplier = getActiveJumpGateSectorWeightMultiplier(
        options.sectorKey || homeSectorKey,
        options.knownSectorRecords || {}
    );
    const deepSpacePois = generateDeepSpacePois(width, height, nextSectors, {
        activeJumpGateWeightMultiplier,
        randomFn: rand,
        sectorKey: options.sectorKey || homeSectorKey,
        knownSectorRecords: options.knownSectorRecords || {},
        config: normalized
    });
    if (perfEnabled) {
        const elapsed = performance.now() - perfStart;
        console.debug('[generation-performance]', {
            sectorKey,
            width,
            height,
            systemsGenerated: Object.keys(nextSectors).length,
            poiGenerated: Object.keys(deepSpacePois || {}).length,
            clusterMode: normalized.starDistribution,
            rolloutStage: rollout.stage,
            clusterV2Enabled: !!rollout.clusterV2Enabled,
            contextEnabled: !!rollout.crossSectorContextEnabled,
            coreGenerationOriginHexId,
            elapsedMs: Number(elapsed.toFixed(2))
        });
    }

    return {
        config: normalized,
        width,
        height,
        totalHexes,
        systemCount: Object.keys(nextSectors).length,
        sectors: nextSectors,
        deepSpacePois,
        factionState: createFactionStateForSector(nextSectors, {
            deepSpacePois,
            width,
            height,
            coreSystemHexId: core.coreSystemHexId || null,
            sectorKey,
            requestedFactionCount: normalized.factionGenerationCount
        }),
        coreSystemHexId: core.coreSystemHexId,
        coreSystemManual: core.coreSystemManual
    };
}

export const refreshSectorSnapshot = refreshSectorSnapshotAction;
export const updateSectorStatus = updateSectorStatusAction;
export const setAndUseNewSeed = setAndUseNewSeedAction;
export const buildSectorFromConfig = buildSectorFromConfigAction;

export function generateSectorAction(deps) {
    const {
        state,
        isAutoSeedEnabled,
        generateSeedString,
        setSeed,
        setAndUseNewSeed,
        normalizeGenerationConfig,
        readGenerationConfigFromUi,
        homeSectorKey,
        buildSectorFromConfig,
        deepClone,
        clearSelectionInfo,
        redrawGridAndReselect,
        updateSectorStatus,
        refreshSectorSnapshot,
        showStatusMessage
    } = deps;
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
        sectorKey: homeSectorKey,
        knownSectorRecords: {},
        layoutSeed: seedUsed
    });

    state.sectors = built.sectors;
    state.deepSpacePois = built.deepSpacePois;
    state.pinnedHexIds = [];
    state.coreSystemHexId = built.coreSystemHexId || null;
    state.coreSystemManual = !!built.coreSystemManual;
    state.factionState = built.factionState || null;
    state.factionGenerationCount = Number.isFinite(config.factionGenerationCount) ? config.factionGenerationCount : null;
    state.selectedHexId = null;
    state.factionOverlayMode = state.factionOverlayMode === 'off' || state.factionOverlayMode === 'contested'
        ? state.factionOverlayMode
        : 'ownership';
    state.multiSector = {
        currentKey: homeSectorKey,
        selectedSectorKey: homeSectorKey,
        jumpGateRegistry: {},
        expandedView: false,
        sectorsByKey: {
            [homeSectorKey]: {
                seed: seedUsed,
                config: deepClone(config),
                sectors: deepClone(built.sectors),
                deepSpacePois: deepClone(built.deepSpacePois),
                factionState: deepClone(built.factionState),
                pinnedHexIds: [],
                coreSystemHexId: built.coreSystemHexId || null,
                coreSystemManual: !!built.coreSystemManual,
                totalHexes: built.totalHexes,
                systemCount: built.systemCount
            }
        }
    };
    rebuildGenerationContextSummaries({
        layoutSeed: state.layoutSeed || seedUsed || '',
        sectorsByKey: state.multiSector.sectorsByKey,
        settings: config
    });
    clearSelectionInfo();

    redrawGridAndReselect(built.width, built.height, { resetView: true });
    updateSectorStatus(built.totalHexes, built.systemCount);
    refreshSectorSnapshot(config, built.width, built.height, 'Generate Sector');
    showStatusMessage(seedUsed ? `Generated seed ${seedUsed}` : 'Sector regenerated.', 'info');
}

export function createSectorRecordAction(options = {}, deps) {
    const {
        state,
        normalizeGenerationConfig,
        getGenerationConfigSnapshot,
        generateSeedString,
        setSeed,
        buildSectorFromConfig,
        deepClone,
        homeSectorKey
    } = deps;
    const config = normalizeGenerationConfig(options.config || getGenerationConfigSnapshot());
    const fixedSystems = options && options.fixedSystems ? options.fixedSystems : {};
    const requestedSeed = options && options.seed ? String(options.seed).trim() : '';
    const seed = requestedSeed || generateSeedString();

    const previousSeed = state.currentSeed;
    const previousRandom = state.seededRandomFn;
    setSeed(seed);
    const built = buildSectorFromConfig(config, fixedSystems, {
        sectorKey: options && options.sectorKey ? options.sectorKey : homeSectorKey,
        knownSectorRecords: options && options.knownSectorRecords ? options.knownSectorRecords : {},
        layoutSeed: options && options.layoutSeed ? options.layoutSeed : (state.layoutSeed || state.currentSeed || seed),
        preferredCoreSystemHexId: options && options.preferredCoreSystemHexId ? options.preferredCoreSystemHexId : null,
        preferredCoreSystemManual: !!(options && options.preferredCoreSystemManual)
    });
    state.currentSeed = previousSeed;
    state.seededRandomFn = previousRandom;
    const sectorKey = options && options.sectorKey ? options.sectorKey : homeSectorKey;
    const record = {
        seed,
        config,
        sectors: deepClone(built.sectors),
        deepSpacePois: deepClone(built.deepSpacePois),
        factionState: deepClone(built.factionState),
        pinnedHexIds: [],
        coreSystemHexId: built.coreSystemHexId || null,
        coreSystemManual: !!built.coreSystemManual,
        generationContextSummary: null,
        totalHexes: built.totalHexes,
        systemCount: built.systemCount
    };
    const knownSectorRecords = {
        ...(options && options.knownSectorRecords ? options.knownSectorRecords : {}),
        [sectorKey]: record
    };
    rebuildGenerationContextSummaries({
        layoutSeed: options && options.layoutSeed ? options.layoutSeed : (state.layoutSeed || state.currentSeed || seed),
        sectorsByKey: knownSectorRecords,
        settings: config
    });

    return record;
}
