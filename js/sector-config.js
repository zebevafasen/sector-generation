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
    return {
        sizeMode: defaults.sizeMode || 'preset',
        sizePreset: refs.sizePresetSelect ? refs.sizePresetSelect.value : (defaults.sizePreset || 'standard'),
        width: parseInt(refs.gridWidthInput?.value || String(defaults.width ?? 8), 10),
        height: parseInt(refs.gridHeightInput?.value || String(defaults.height ?? 10), 10),
        densityMode: defaults.densityMode || 'preset',
        densityPreset: normalizeDensityPresetKey(
            refs.densityPresetSelect ? refs.densityPresetSelect.value : (defaults.densityPreset || 'standard')
        ),
        manualMin: refs.manualMinInput ? parseInt(refs.manualMinInput.value, 10) : parseInt(String(defaults.manualMin ?? 0), 10),
        manualMax: refs.manualMaxInput ? parseInt(refs.manualMaxInput.value, 10) : parseInt(String(defaults.manualMax ?? 0), 10),
        generationProfile: refs.generationProfileSelect ? refs.generationProfileSelect.value : (defaults.generationProfile || 'high_adventure'),
        starDistribution: refs.starDistributionSelect ? refs.starDistributionSelect.value : (defaults.starDistribution || 'standard'),
        realisticPlanetWeights: refs.realisticWeightsToggle ? !!refs.realisticWeightsToggle.checked : !!defaults.realisticPlanetWeights
    };
}
