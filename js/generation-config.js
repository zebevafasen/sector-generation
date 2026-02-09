import { GRID_PRESETS, MAX_GRID_DIMENSION, MIN_GRID_DIMENSION, state } from './config.js';
import {
    GENERATION_PROFILES,
    GENERATION_SETTINGS,
    getDensityRatioForPreset,
    normalizeDensityPresetKey
} from './generation-data.js';
import { normalizeGenerationRolloutStage } from './generation-rollout.js';
import { rand } from './core.js';
import { readGenerationConfigFromUi } from './sector-config.js';

export function normalizeGenerationConfig(config) {
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
    if (sizeMode === 'custom') {
        width = Math.max(MIN_GRID_DIMENSION, Math.min(MAX_GRID_DIMENSION, width));
        height = Math.max(MIN_GRID_DIMENSION, Math.min(MAX_GRID_DIMENSION, height));
    }

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
    const starDistribution = source.starDistribution === 'standard' ? 'standard' : 'clusters';
    const requestedFactionCountRaw = parseInt(source.factionGenerationCount, 10);
    const factionGenerationCount = Number.isFinite(requestedFactionCountRaw) && requestedFactionCountRaw >= 0
        ? requestedFactionCountRaw
        : null;
    const sourceCoreTagWeights = source && source.coreTagWeights && typeof source.coreTagWeights === 'object'
        ? source.coreTagWeights
        : {};
    const sourceCoreScoreWeights = source && source.coreScoreWeights && typeof source.coreScoreWeights === 'object'
        ? source.coreScoreWeights
        : {};
    const toFiniteNumber = (value, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };

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
        factionGenerationCount,
        realisticPlanetWeights: !!source.realisticPlanetWeights,
        generationRolloutStage: normalizeGenerationRolloutStage(
            source.generationRolloutStage,
            normalizeGenerationRolloutStage(GENERATION_SETTINGS.generationRolloutStage)
        ),
        clusterV2Enabled: source.clusterV2Enabled ?? GENERATION_SETTINGS.clusterV2Enabled,
        crossSectorContextEnabled: source.crossSectorContextEnabled ?? GENERATION_SETTINGS.crossSectorContextEnabled,
        centerBiasStrength: Math.max(0, toFiniteNumber(source.centerBiasStrength, GENERATION_SETTINGS.centerBiasStrength)),
        boundaryContinuityStrength: Math.max(0, toFiniteNumber(source.boundaryContinuityStrength, GENERATION_SETTINGS.boundaryContinuityStrength)),
        clusterAnchorJitter: Math.max(0, toFiniteNumber(source.clusterAnchorJitter, GENERATION_SETTINGS.clusterAnchorJitter)),
        clusterGrowthDecay: Math.max(0.05, toFiniteNumber(source.clusterGrowthDecay, GENERATION_SETTINGS.clusterGrowthDecay)),
        clusterLocalNeighborCap: Math.max(1, Math.floor(toFiniteNumber(source.clusterLocalNeighborCap, GENERATION_SETTINGS.clusterLocalNeighborCap))),
        clusterSecondaryAnchorThreshold: Math.max(1, Math.floor(toFiniteNumber(source.clusterSecondaryAnchorThreshold, GENERATION_SETTINGS.clusterSecondaryAnchorThreshold))),
        clusterEdgeBalance: Math.max(0, toFiniteNumber(source.clusterEdgeBalance, GENERATION_SETTINGS.clusterEdgeBalance)),
        clusterCenterVoidProtection: Math.max(0, toFiniteNumber(source.clusterCenterVoidProtection, GENERATION_SETTINGS.clusterCenterVoidProtection)),
        coreScoringDebugEnabled: source.coreScoringDebugEnabled ?? GENERATION_SETTINGS.coreScoringDebugEnabled,
        generationPerformanceDebugEnabled: source.generationPerformanceDebugEnabled ?? GENERATION_SETTINGS.generationPerformanceDebugEnabled,
        coreTagWeights: {
            ...GENERATION_SETTINGS.coreTagWeights,
            ...Object.fromEntries(
                Object.entries(sourceCoreTagWeights).map(([tag, weight]) => [
                    String(tag).trim().toLowerCase(),
                    toFiniteNumber(weight, 0)
                ])
            )
        },
        coreTagContributionCap: Math.max(0, toFiniteNumber(source.coreTagContributionCap, GENERATION_SETTINGS.coreTagContributionCap)),
        coreTagPerTagCap: Math.max(0, toFiniteNumber(source.coreTagPerTagCap, GENERATION_SETTINGS.coreTagPerTagCap)),
        coreScoreWeights: {
            ...GENERATION_SETTINGS.coreScoreWeights,
            ...Object.fromEntries(
                Object.entries(sourceCoreScoreWeights).map(([key, weight]) => [
                    String(key),
                    toFiniteNumber(weight, 0)
                ])
            )
        }
    };
}

export function getGenerationConfigSnapshot() {
    if (state.sectorConfigSnapshot) return normalizeGenerationConfig(state.sectorConfigSnapshot);
    if (state.lastSectorSnapshot && state.lastSectorSnapshot.sectorConfigSnapshot) {
        return normalizeGenerationConfig(state.lastSectorSnapshot.sectorConfigSnapshot);
    }
    return normalizeGenerationConfig(readGenerationConfigFromUi({
        sizeMode: state.sizeMode,
        densityMode: state.densityMode
    }));
}

export function getActiveGenerationProfile(profileKey) {
    return GENERATION_PROFILES[profileKey] || GENERATION_PROFILES.cinematic;
}

export function computeSystemCount(totalHexes, config) {
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
