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

export function buildSectorFromConfigAction(config, fixedSystems = {}, options = {}, deps) {
    const {
        normalizeGenerationConfig,
        isHexIdInBounds,
        computeSystemCount,
        shuffleArray,
        rand,
        deepClone,
        selectClusteredSystemCoords,
        generateSystemData,
        getActiveJumpGateSectorWeightMultiplier,
        generateDeepSpacePois,
        homeSectorKey
    } = deps;
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
        ? selectClusteredSystemCoords(candidateCoords, systemsToGenerate, rand)
        : candidateCoords.slice(0, systemsToGenerate);

    generatedCoords.forEach(hexId => {
        nextSectors[hexId] = generateSystemData(normalized, {
            coordId: hexId,
            usedNames,
            sectorsByCoord: nextSectors
        });
    });
    const activeJumpGateWeightMultiplier = getActiveJumpGateSectorWeightMultiplier(
        options.sectorKey || homeSectorKey,
        options.knownSectorRecords || {}
    );
    const deepSpacePois = generateDeepSpacePois(width, height, nextSectors, {
        activeJumpGateWeightMultiplier,
        randomFn: rand,
        sectorKey: options.sectorKey || homeSectorKey,
        knownSectorRecords: options.knownSectorRecords || {}
    });

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
        knownSectorRecords: {}
    });

    state.sectors = built.sectors;
    state.deepSpacePois = built.deepSpacePois;
    state.pinnedHexIds = [];
    state.selectedHexId = null;
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
