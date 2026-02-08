export function buildGenerationSharedDeps(inputs) {
    const {
        state,
        rand,
        showStatusMessage,
        reportSystemInvariantIssues,
        getGenerationConfigSnapshot,
        isHexIdInBounds,
        getGlobalHexDisplayId,
        refreshSectorSnapshot,
        updateSectorStatus,
        sanitizePinnedHexes,
        generateSystemData,
        createDeepSpacePoi,
        isPlanetaryBody,
        pickRandomPlanetType,
        generatePlanetEnvironment,
        generatePlanetSize,
        reconcilePlanetaryBodies
    } = inputs;
    return {
        state,
        rand,
        showStatusMessage,
        reportSystemInvariantIssues,
        getGenerationConfigSnapshot,
        isHexIdInBounds,
        getGlobalHexDisplayId,
        refreshSectorSnapshot,
        updateSectorStatus,
        sanitizePinnedHexes,
        generateSystemData,
        createDeepSpacePoi,
        isPlanetaryBody,
        pickRandomPlanetType,
        generatePlanetEnvironment,
        generatePlanetSize,
        reconcilePlanetaryBodies
    };
}

export function buildGenerationActionDeps(inputs) {
    const {
        redrawHexAndReselect,
        redrawHexAndSelectHex,
        refreshHexInfo,
        clearSelectionInfo,
        romanize
    } = inputs;
    return {
        ...buildGenerationSharedDeps(inputs),
        redrawHexAndReselect,
        redrawHexAndSelectHex,
        refreshHexInfo,
        clearSelectionInfo,
        romanize
    };
}

export function buildGenerationRerollDeps(inputs) {
    const {
        redrawHexAndReselect,
        redrawHexAndSelectHex,
        redrawGridAndReselect,
        refreshHexInfo,
        generateDeepSpacePois,
        pickPlanetTypeForStarClass,
        isHabitableCandidateType,
        deepClone,
        sortHexIds,
        setRandomStream,
        setAndUseNewSeed,
        composeContentSeed
    } = inputs;
    return {
        ...buildGenerationSharedDeps(inputs),
        redrawHexAndReselect,
        redrawHexAndSelectHex,
        redrawGridAndReselect,
        refreshHexInfo,
        generateDeepSpacePois,
        pickPlanetTypeForStarClass,
        isHabitableCandidateType,
        deepClone,
        sortHexIds,
        setRandomStream,
        setAndUseNewSeed,
        composeContentSeed
    };
}
