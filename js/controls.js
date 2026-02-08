import { state } from './config.js';
import { hideFieldInfoTooltip, hideStarClassInfo, showFieldInfoTooltip, showStarClassInfo } from './core.js';
import { DENSITY_PRESET_LABELS, getDensityRatioForPreset, normalizeDensityPresetKey } from './generation-data.js';

const controlsRefsCache = {};
const MODE_BUTTON_BASE_CLASSES = ['flex-1', 'py-1', 'text-xs', 'rounded', 'transition-all'];
const MODE_BUTTON_ACTIVE_CLASSES = ['bg-sky-600', 'text-white', 'shadow'];
const MODE_BUTTON_INACTIVE_CLASSES = ['text-slate-400', 'hover:text-white'];

function setModeButtonState(button, isActive) {
    if (!button) return;
    button.classList.add(...MODE_BUTTON_BASE_CLASSES);
    button.classList.remove(...MODE_BUTTON_ACTIVE_CLASSES, ...MODE_BUTTON_INACTIVE_CLASSES);
    if (isActive) {
        button.classList.add(...MODE_BUTTON_ACTIVE_CLASSES);
    } else {
        button.classList.add(...MODE_BUTTON_INACTIVE_CLASSES);
    }
}

function getControlsRefs() {
    if (!controlsRefsCache.modePresetBtn) {
        controlsRefsCache.modePresetBtn = document.getElementById('modePresetBtn');
        controlsRefsCache.modeManualBtn = document.getElementById('modeManualBtn');
        controlsRefsCache.densityPresetSelect = document.getElementById('densityPreset');
        controlsRefsCache.densityPresetContainer = document.getElementById('densityPresetContainer');
        controlsRefsCache.densityManualContainer = document.getElementById('densityManualContainer');
        controlsRefsCache.modeSizePresetBtn = document.getElementById('modeSizePresetBtn');
        controlsRefsCache.modeSizeCustomBtn = document.getElementById('modeSizeCustomBtn');
        controlsRefsCache.sizePresetContainer = document.getElementById('sizePresetContainer');
        controlsRefsCache.sizeCustomContainer = document.getElementById('sizeCustomContainer');
        controlsRefsCache.sizePreset = document.getElementById('sizePreset');
        controlsRefsCache.gridWidth = document.getElementById('gridWidth');
        controlsRefsCache.gridHeight = document.getElementById('gridHeight');
        controlsRefsCache.manualMin = document.getElementById('manualMin');
        controlsRefsCache.manualMax = document.getElementById('manualMax');
        controlsRefsCache.infoStarClass = document.getElementById('infoStarClass');
    }
    return controlsRefsCache;
}

export function syncDensityPresetForProfile(profileKey = null) {
    const refs = getControlsRefs();
    const densitySelect = refs.densityPresetSelect;
    if (!densitySelect) return;

    const activeProfile = profileKey || document.getElementById('generationProfile')?.value || 'high_adventure';
    const normalizedSelection = normalizeDensityPresetKey(densitySelect.value || 'standard');
    if (densitySelect.value !== normalizedSelection) {
        densitySelect.value = normalizedSelection;
    }

    Array.from(densitySelect.options).forEach((option) => {
        const preset = normalizeDensityPresetKey(option.value);
        const label = DENSITY_PRESET_LABELS[preset];
        if (!label) return;
        const percent = Math.round(getDensityRatioForPreset(preset, activeProfile) * 100);
        option.textContent = `${label} (${percent}%)`;
    });
}

export function syncManualDensityLimits() {
    const refs = getControlsRefs();
    const width = Math.max(1, parseInt(refs.gridWidth?.value || '1', 10) || 1);
    const height = Math.max(1, parseInt(refs.gridHeight?.value || '1', 10) || 1);
    const totalHexes = width * height;
    const minInput = refs.manualMin;
    const maxInput = refs.manualMax;
    if (!minInput || !maxInput) return;

    minInput.max = String(totalHexes);
    maxInput.max = String(totalHexes);

    let min = parseInt(minInput.value, 10);
    let max = parseInt(maxInput.value, 10);
    if (!Number.isFinite(min) || min < 0) min = 0;
    if (!Number.isFinite(max) || max < 0) max = 0;
    min = Math.min(min, totalHexes);
    max = Math.min(max, totalHexes);
    if (min > max) max = min;

    minInput.value = String(min);
    maxInput.value = String(max);
}

export function setDensityMode(mode) {
    state.densityMode = mode;
    const refs = getControlsRefs();
    const btnPreset = refs.modePresetBtn;
    const btnManual = refs.modeManualBtn;
    const divPreset = refs.densityPresetContainer;
    const divManual = refs.densityManualContainer;

    if (mode === 'preset') {
        setModeButtonState(btnPreset, true);
        setModeButtonState(btnManual, false);
        divPreset.classList.remove('hidden');
        divManual.classList.add('hidden');
    } else {
        setModeButtonState(btnManual, true);
        setModeButtonState(btnPreset, false);
        divPreset.classList.add('hidden');
        divManual.classList.remove('hidden');
    }
}

export function setSizeMode(mode) {
    state.sizeMode = mode;
    const refs = getControlsRefs();
    const btnPreset = refs.modeSizePresetBtn;
    const btnCustom = refs.modeSizeCustomBtn;
    const presetContainer = refs.sizePresetContainer;
    const customContainer = refs.sizeCustomContainer;

    if (mode === 'preset') {
        setModeButtonState(btnPreset, true);
        setModeButtonState(btnCustom, false);
        presetContainer.classList.remove('hidden');
        customContainer.classList.add('hidden');
    } else {
        setModeButtonState(btnCustom, true);
        setModeButtonState(btnPreset, false);
        presetContainer.classList.add('hidden');
        customContainer.classList.remove('hidden');
    }
    syncManualDensityLimits();
}

export function setupStarClassTooltip() {
    const selector = '.star-class-hint';

    document.addEventListener('mouseover', (e) => {
        const target = e.target instanceof Element ? e.target.closest(selector) : null;
        if (!target) return;
        showStarClassInfo(e);
    });

    document.addEventListener('mousemove', (e) => {
        const target = e.target instanceof Element ? e.target.closest(selector) : null;
        if (!target) return;
        showStarClassInfo(e);
    });

    document.addEventListener('mouseout', (e) => {
        const leavingFrom = e.target instanceof Element ? e.target.closest(selector) : null;
        if (!leavingFrom) return;
        const related = e.relatedTarget;
        if (related instanceof Node && leavingFrom.contains(related)) return;
        state.starTooltipPinned = false;
        hideStarClassInfo();
    });

    document.addEventListener('click', (e) => {
        const target = e.target instanceof Element ? e.target.closest(selector) : null;
        if (!target) return;
        e.stopPropagation();
        if (state.starTooltipPinned) {
            state.starTooltipPinned = false;
            hideStarClassInfo(true);
        } else {
            showStarClassInfo(e, true);
        }
    });

    document.addEventListener('click', () => {
        if (state.starTooltipPinned) {
            state.starTooltipPinned = false;
            hideStarClassInfo(true);
        }
    });
}

export function setupFieldInfoTooltips() {
    const selector = '[data-field-tooltip]';
    let activeTarget = null;

    const showFromEvent = (event, target) => {
        const field = target.getAttribute('data-field-tooltip');
        const value = target.getAttribute('data-field-value') || target.textContent || '';
        if (!field || !value) return;
        showFieldInfoTooltip(event, field, value.trim());
    };

    document.addEventListener('mouseover', (event) => {
        const target = event.target instanceof Element ? event.target.closest(selector) : null;
        if (!target) return;
        activeTarget = target;
        showFromEvent(event, target);
    });

    document.addEventListener('mousemove', (event) => {
        if (!activeTarget) return;
        showFromEvent(event, activeTarget);
    });

    document.addEventListener('mouseout', (event) => {
        if (!activeTarget) return;
        const leavingFrom = event.target instanceof Element ? event.target.closest(selector) : null;
        if (!leavingFrom || leavingFrom !== activeTarget) return;
        const related = event.relatedTarget;
        if (related instanceof Node && activeTarget.contains(related)) return;
        activeTarget = null;
        hideFieldInfoTooltip();
    });

    document.addEventListener('click', () => {
        activeTarget = null;
        hideFieldInfoTooltip();
    });

    window.addEventListener('blur', () => {
        activeTarget = null;
        hideFieldInfoTooltip();
    });
}
