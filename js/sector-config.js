import { GRID_PRESETS, MAX_GRID_DIMENSION, MIN_GRID_DIMENSION } from './config.js';
import { normalizeDensityPresetKey } from './generation-data.js';

const refsCache = {};

function getConfigRefs() {
    if (!refsCache.sizePresetSelect) {
        refsCache.sizePresetSelect = document.getElementById('sizePreset');
        refsCache.gridWidthInput = document.getElementById('gridWidth');
        refsCache.gridHeightInput = document.getElementById('gridHeight');
        refsCache.densityPresetSelect = document.getElementById('densityPreset');
        refsCache.manualMinInput = document.getElementById('manualMin');
        refsCache.manualMaxInput = document.getElementById('manualMax');
        refsCache.generationProfileSelect = document.getElementById('generationProfile');
        refsCache.starDistributionSelect = document.getElementById('starDistribution');
        refsCache.realisticWeightsToggle = document.getElementById('realisticPlanetWeightsToggle');
    }
    return refsCache;
}

export function readGenerationConfigFromUi(defaults = {}) {
    const refs = getConfigRefs();
    const sizeMode = defaults.sizeMode === 'custom' ? 'custom' : 'preset';
    const sizePreset = refs.sizePresetSelect ? refs.sizePresetSelect.value : (defaults.sizePreset || 'standard');
    const safePreset = GRID_PRESETS[sizePreset] ? sizePreset : 'standard';
    const widthFromInput = parseInt(refs.gridWidthInput?.value || String(defaults.width ?? GRID_PRESETS.standard.width), 10);
    const heightFromInput = parseInt(refs.gridHeightInput?.value || String(defaults.height ?? GRID_PRESETS.standard.height), 10);
    const width = sizeMode === 'preset'
        ? GRID_PRESETS[safePreset].width
        : widthFromInput;
    const height = sizeMode === 'preset'
        ? GRID_PRESETS[safePreset].height
        : heightFromInput;
    const clampedWidth = sizeMode === 'preset'
        ? width
        : Math.max(MIN_GRID_DIMENSION, Math.min(MAX_GRID_DIMENSION, width));
    const clampedHeight = sizeMode === 'preset'
        ? height
        : Math.max(MIN_GRID_DIMENSION, Math.min(MAX_GRID_DIMENSION, height));

    return {
        sizeMode,
        sizePreset: safePreset,
        width: clampedWidth,
        height: clampedHeight,
        densityMode: defaults.densityMode || 'preset',
        densityPreset: normalizeDensityPresetKey(
            refs.densityPresetSelect ? refs.densityPresetSelect.value : (defaults.densityPreset || 'standard')
        ),
        manualMin: refs.manualMinInput ? parseInt(refs.manualMinInput.value, 10) : parseInt(String(defaults.manualMin ?? 0), 10),
        manualMax: refs.manualMaxInput ? parseInt(refs.manualMaxInput.value, 10) : parseInt(String(defaults.manualMax ?? 0), 10),
        generationProfile: refs.generationProfileSelect ? refs.generationProfileSelect.value : (defaults.generationProfile || 'high_adventure'),
        starDistribution: refs.starDistributionSelect ? refs.starDistributionSelect.value : (defaults.starDistribution || 'clusters'),
        realisticPlanetWeights: refs.realisticWeightsToggle ? !!refs.realisticWeightsToggle.checked : !!defaults.realisticPlanetWeights
    };
}
