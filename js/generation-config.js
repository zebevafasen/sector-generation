import { GRID_PRESETS, MAX_GRID_DIMENSION, MIN_GRID_DIMENSION, state } from './config.js';
import { GENERATION_PROFILES, getDensityRatioForPreset, normalizeDensityPresetKey } from './generation-data.js';
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
