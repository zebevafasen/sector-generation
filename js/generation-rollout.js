const ROLLOUT_STAGES = Object.freeze({
    MANUAL: 'manual',
    FLAGS_OFF: 'flags_off',
    HOME_V2: 'home_v2',
    NEIGHBOR_CONTEXT: 'neighbor_context',
    FULL_RELEASE: 'full_release'
});

const VALID_ROLLOUT_STAGES = new Set(Object.values(ROLLOUT_STAGES));

export function normalizeGenerationRolloutStage(value, fallback = ROLLOUT_STAGES.FULL_RELEASE) {
    const normalizedFallback = VALID_ROLLOUT_STAGES.has(fallback) ? fallback : ROLLOUT_STAGES.FULL_RELEASE;
    const normalized = String(value || '').trim().toLowerCase();
    return VALID_ROLLOUT_STAGES.has(normalized) ? normalized : normalizedFallback;
}

export function resolveGenerationRolloutFlags(settings = {}, context = {}) {
    const stage = normalizeGenerationRolloutStage(settings.generationRolloutStage);
    const isHomeSector = !!context.isHomeSector;
    const manualCluster = !!settings.clusterV2Enabled;
    const manualContext = !!settings.crossSectorContextEnabled;

    if (stage === ROLLOUT_STAGES.FLAGS_OFF) {
        return {
            stage,
            clusterV2Enabled: false,
            crossSectorContextEnabled: false
        };
    }

    if (stage === ROLLOUT_STAGES.HOME_V2) {
        return {
            stage,
            clusterV2Enabled: isHomeSector,
            crossSectorContextEnabled: false
        };
    }

    if (stage === ROLLOUT_STAGES.NEIGHBOR_CONTEXT) {
        return {
            stage,
            clusterV2Enabled: true,
            crossSectorContextEnabled: !isHomeSector
        };
    }

    if (stage === ROLLOUT_STAGES.MANUAL) {
        return {
            stage,
            clusterV2Enabled: manualCluster,
            crossSectorContextEnabled: manualContext
        };
    }

    return {
        stage: ROLLOUT_STAGES.FULL_RELEASE,
        clusterV2Enabled: true,
        crossSectorContextEnabled: true
    };
}

export { ROLLOUT_STAGES };
