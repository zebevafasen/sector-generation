import {
    GENERATION_PROFILE_OPTIONS,
    GRID_PRESETS,
    PLANET_TYPES,
    STAR_CLASS_INFO,
    STAR_DISTRIBUTION_OPTIONS
} from './config.js';
import { DENSITY_PRESET_LABELS, DENSITY_PRESET_ORDER } from './generation-data.js';

function setSelectOptions(selectEl, optionsMarkup, fallbackValue, isValidValue) {
    if (!selectEl) return;
    const previousValue = selectEl.value;
    selectEl.innerHTML = optionsMarkup;
    selectEl.value = previousValue;
    if (!selectEl.value || !isValidValue(selectEl.value)) {
        selectEl.value = fallbackValue;
    }
}

function buildStarClassOptionLabel(starClass) {
    return /^[OBAFGKM]$/.test(starClass) ? `Class ${starClass}` : starClass;
}

export function populateDataDrivenOptions() {
    const starClasses = Object.keys(STAR_CLASS_INFO || {});

    const editStarClassSelect = document.getElementById('editStarClassSelect');
    if (editStarClassSelect) {
        editStarClassSelect.innerHTML = starClasses
            .map((starClass) => `<option value="${starClass}">${starClass}</option>`)
            .join('');
    }

    const searchStarClassSelect = document.getElementById('searchStarClassSelect');
    if (searchStarClassSelect) {
        searchStarClassSelect.innerHTML = [
            '<option value="">Any Class</option>',
            ...starClasses.map((starClass) => `<option value="${starClass}">${buildStarClassOptionLabel(starClass)}</option>`)
        ].join('');
    }

    const editPlanetTypeSelect = document.getElementById('editPlanetTypeSelect');
    if (editPlanetTypeSelect) {
        editPlanetTypeSelect.innerHTML = PLANET_TYPES
            .map((planetType) => `<option value="${planetType}">${planetType}</option>`)
            .join('');
    }

    const sizePresetSelect = document.getElementById('sizePreset');
    setSelectOptions(
        sizePresetSelect,
        Object.entries(GRID_PRESETS || {})
            .map(([presetKey, preset]) => `<option value="${presetKey}">${preset.label} (${preset.width} x ${preset.height})</option>`)
            .join(''),
        'standard',
        (value) => !!GRID_PRESETS[value]
    );

    const densityPresetSelect = document.getElementById('densityPreset');
    setSelectOptions(
        densityPresetSelect,
        DENSITY_PRESET_ORDER
            .map((presetKey) => {
                const label = DENSITY_PRESET_LABELS[presetKey] || presetKey;
                return `<option value="${presetKey}">${label}</option>`;
            })
            .join(''),
        'standard',
        (value) => DENSITY_PRESET_ORDER.includes(value)
    );

    const generationProfileSelect = document.getElementById('generationProfile');
    setSelectOptions(
        generationProfileSelect,
        GENERATION_PROFILE_OPTIONS
            .map((option) => `<option value="${option.value}">${option.label}</option>`)
            .join(''),
        'high_adventure',
        (value) => GENERATION_PROFILE_OPTIONS.some((option) => option.value === value)
    );

    const starDistributionSelect = document.getElementById('starDistribution');
    setSelectOptions(
        starDistributionSelect,
        STAR_DISTRIBUTION_OPTIONS
            .map((option) => `<option value="${option.value}">${option.label}</option>`)
            .join(''),
        'standard',
        (value) => STAR_DISTRIBUTION_OPTIONS.some((option) => option.value === value)
    );
}
