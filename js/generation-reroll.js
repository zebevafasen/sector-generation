import { HOME_SECTOR_KEY } from './sector-address.js';

export function rerollSelectedPlanetAction(deps) {
    const {
        state,
        showStatusMessage,
        isPlanetaryBody,
        getGenerationConfigSnapshot,
        pickPlanetTypeForStarClass,
        pickRandomPlanetType,
        rand,
        generatePlanetEnvironment,
        generatePlanetSize,
        isHabitableCandidateType,
        reconcilePlanetaryBodies,
        refreshHexInfo,
        reportSystemInvariantIssues,
        refreshSectorSnapshot
    } = deps;
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

export function rerollSelectedSystemAction(deps) {
    const {
        state,
        showStatusMessage,
        getGenerationConfigSnapshot,
        createDeepSpacePoi,
        rand,
        redrawHexAndSelectHex,
        refreshSectorSnapshot,
        getGlobalHexDisplayId,
        setAndUseNewSeed,
        generateSystemData,
        resolveCoreSystemHexId,
        reportSystemInvariantIssues,
        redrawHexAndReselect,
        sanitizePinnedHexes
    } = deps;
    const selectedHexId = state.selectedHexId;
    if (!selectedHexId) {
        showStatusMessage('Select a system or POI before rerolling.', 'warn');
        return;
    }

    const config = getGenerationConfigSnapshot();
    const selectedPoi = state.deepSpacePois && state.deepSpacePois[selectedHexId] ? state.deepSpacePois[selectedHexId] : null;
    if (selectedPoi && !state.sectors[selectedHexId]) {
        state.deepSpacePois[selectedHexId] = createDeepSpacePoi({ randomFn: rand });
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
    const core = resolveCoreSystemHexId({
        sectors: state.sectors,
        width: config.width,
        height: config.height,
        preferredHexId: state.coreSystemHexId,
        preferredIsManual: state.coreSystemManual,
        preferredIsAuto: !state.coreSystemManual && !!state.coreSystemHexId,
        settings: config
    });
    state.coreSystemHexId = core.coreSystemHexId;
    state.coreSystemManual = core.coreSystemManual;

    redrawHexAndReselect(selectedHexId);
    sanitizePinnedHexes(config.width, config.height);
    refreshSectorSnapshot(config, config.width, config.height, 'Reroll System');
    showStatusMessage(`Rerolled system ${getGlobalHexDisplayId(selectedHexId)} with seed ${seedUsed}.`, 'success');
}

export function togglePinSelectedSystemAction(deps) {
    const {
        state,
        showStatusMessage,
        getGlobalHexDisplayId,
        refreshHexInfo,
        getGenerationConfigSnapshot,
        refreshSectorSnapshot
    } = deps;
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

export function rerollUnpinnedSystemsAction(deps) {
    const {
        state,
        showStatusMessage,
        getGenerationConfigSnapshot,
        isHexIdInBounds,
        setAndUseNewSeed,
        composeContentSeed,
        resolveCoreSystemHexId,
        setRandomStream,
        deepClone,
        sortHexIds,
        generateSystemData,
        reportSystemInvariantIssues,
        generateDeepSpacePois,
        rand,
        sanitizePinnedHexes,
        redrawGridAndReselect,
        updateSectorStatus,
        refreshSectorSnapshot
    } = deps;
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
    const core = resolveCoreSystemHexId({
        sectors: nextSectors,
        width,
        height,
        preferredHexId: state.coreSystemHexId,
        preferredIsManual: state.coreSystemManual,
        preferredIsAuto: !state.coreSystemManual && !!state.coreSystemHexId,
        settings: config
    });
    state.coreSystemHexId = core.coreSystemHexId;
    state.coreSystemManual = core.coreSystemManual;
    const currentSectorKey = state.multiSector && state.multiSector.currentKey
        ? state.multiSector.currentKey
        : HOME_SECTOR_KEY;
    const knownSectorRecords = state.multiSector && state.multiSector.sectorsByKey && typeof state.multiSector.sectorsByKey === 'object'
        ? state.multiSector.sectorsByKey
        : {};
    state.deepSpacePois = generateDeepSpacePois(width, height, nextSectors, {
        randomFn: rand,
        sectorKey: currentSectorKey,
        knownSectorRecords
    });
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
