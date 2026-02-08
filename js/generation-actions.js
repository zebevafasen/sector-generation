export function addSystemAtHexAction(hexId, deps) {
    const {
        state,
        getGenerationConfigSnapshot,
        isHexIdInBounds,
        showStatusMessage,
        generateSystemData,
        reportSystemInvariantIssues,
        redrawHexAndReselect,
        sanitizePinnedHexes,
        refreshSectorSnapshot,
        updateSectorStatus,
        getGlobalHexDisplayId
    } = deps;
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

export function deleteSelectedSystemAction(deps) {
    const {
        state,
        showStatusMessage,
        getGenerationConfigSnapshot,
        clearSelectionInfo,
        redrawHexAndReselect,
        sanitizePinnedHexes,
        refreshSectorSnapshot,
        updateSectorStatus,
        getGlobalHexDisplayId
    } = deps;
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

export function addPoiAtHexAction(hexId, deps) {
    const {
        state,
        getGenerationConfigSnapshot,
        isHexIdInBounds,
        showStatusMessage,
        createDeepSpacePoi,
        rand,
        redrawHexAndSelectHex,
        refreshSectorSnapshot,
        getGlobalHexDisplayId
    } = deps;
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

    state.deepSpacePois[hexId] = createDeepSpacePoi({ randomFn: rand });

    redrawHexAndSelectHex(hexId);
    refreshSectorSnapshot(config, config.width, config.height, 'Add POI');
    showStatusMessage(`Added POI at ${getGlobalHexDisplayId(hexId)}.`, 'success');
}

export function deletePoiAtHexAction(hexId, deps) {
    const {
        state,
        getGenerationConfigSnapshot,
        isHexIdInBounds,
        showStatusMessage,
        redrawHexAndSelectHex,
        refreshSectorSnapshot,
        getGlobalHexDisplayId
    } = deps;
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

export function renamePoiAtHexAction(hexId, deps) {
    const {
        state,
        getGenerationConfigSnapshot,
        isHexIdInBounds,
        showStatusMessage,
        redrawHexAndSelectHex,
        refreshSectorSnapshot,
        getGlobalHexDisplayId
    } = deps;
    const config = getGenerationConfigSnapshot();
    if (!isHexIdInBounds(hexId, config.width, config.height)) return;
    const poi = state.deepSpacePois && state.deepSpacePois[hexId] ? state.deepSpacePois[hexId] : null;
    if (!poi) {
        showStatusMessage('No POI found to rename.', 'warn');
        return;
    }
    const nextNameRaw = window.prompt('Rename POI', poi.name || 'Deep-Space Site');
    if (nextNameRaw === null) return;
    const nextName = nextNameRaw.trim();
    if (!nextName || nextName === poi.name) return;
    poi.name = nextName;

    redrawHexAndSelectHex(hexId);
    refreshSectorSnapshot(config, config.width, config.height, 'Rename POI');
    showStatusMessage(`Renamed POI at ${getGlobalHexDisplayId(hexId)}.`, 'success');
}

export function addBodyToSelectedSystemAction(kind, deps) {
    const {
        state,
        showStatusMessage,
        isPlanetaryBody,
        isBeltOrFieldBodyType,
        isArtificialBodyType,
        pickRandomPlanetType,
        generatePlanetEnvironment,
        generatePlanetSize,
        romanize,
        rand,
        reconcilePlanetaryBodies,
        refreshHexInfo,
        reportSystemInvariantIssues,
        getGenerationConfigSnapshot,
        refreshSectorSnapshot
    } = deps;
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

export function deleteSelectedBodyAction(deps) {
    const {
        state,
        showStatusMessage,
        isPlanetaryBody,
        reconcilePlanetaryBodies,
        refreshHexInfo,
        reportSystemInvariantIssues,
        getGenerationConfigSnapshot,
        refreshSectorSnapshot
    } = deps;
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
