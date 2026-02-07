import { GRID_PRESETS, state } from './config.js';
import { hideStarClassInfo, showStarClassInfo } from './core.js';

const controlsRefsCache = {};

function getControlsRefs() {
    if (!controlsRefsCache.modePresetBtn) {
        controlsRefsCache.modePresetBtn = document.getElementById('modePresetBtn');
        controlsRefsCache.modeManualBtn = document.getElementById('modeManualBtn');
        controlsRefsCache.densityPresetContainer = document.getElementById('densityPresetContainer');
        controlsRefsCache.densityManualContainer = document.getElementById('densityManualContainer');
        controlsRefsCache.modeSizePresetBtn = document.getElementById('modeSizePresetBtn');
        controlsRefsCache.modeSizeCustomBtn = document.getElementById('modeSizeCustomBtn');
        controlsRefsCache.sizePresetContainer = document.getElementById('sizePresetContainer');
        controlsRefsCache.sizeCustomContainer = document.getElementById('sizeCustomContainer');
        controlsRefsCache.sizePreset = document.getElementById('sizePreset');
        controlsRefsCache.gridWidth = document.getElementById('gridWidth');
        controlsRefsCache.gridHeight = document.getElementById('gridHeight');
        controlsRefsCache.infoStarClass = document.getElementById('infoStarClass');
    }
    return controlsRefsCache;
}

export function setDensityMode(mode) {
    state.densityMode = mode;
    const refs = getControlsRefs();
    const btnPreset = refs.modePresetBtn;
    const btnManual = refs.modeManualBtn;
    const divPreset = refs.densityPresetContainer;
    const divManual = refs.densityManualContainer;

    if (mode === 'preset') {
        btnPreset.className = 'flex-1 py-1 text-xs rounded bg-sky-600 text-white shadow transition-all';
        btnManual.className = 'flex-1 py-1 text-xs rounded text-slate-400 hover:text-white transition-all';
        divPreset.classList.remove('hidden');
        divManual.classList.add('hidden');
    } else {
        btnManual.className = 'flex-1 py-1 text-xs rounded bg-sky-600 text-white shadow transition-all';
        btnPreset.className = 'flex-1 py-1 text-xs rounded text-slate-400 hover:text-white transition-all';
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
        btnPreset.className = 'flex-1 py-1 text-xs rounded bg-sky-600 text-white shadow transition-all';
        btnCustom.className = 'flex-1 py-1 text-xs rounded text-slate-400 hover:text-white transition-all';
        presetContainer.classList.remove('hidden');
        customContainer.classList.add('hidden');
    } else {
        btnCustom.className = 'flex-1 py-1 text-xs rounded bg-sky-600 text-white shadow transition-all';
        btnPreset.className = 'flex-1 py-1 text-xs rounded text-slate-400 hover:text-white transition-all';
        presetContainer.classList.add('hidden');
        customContainer.classList.remove('hidden');
    }
}

export function getSelectedGridSize() {
    const refs = getControlsRefs();
    if (state.sizeMode === 'preset') {
        const key = refs.sizePreset ? refs.sizePreset.value : 'standard';
        const preset = GRID_PRESETS[key] || GRID_PRESETS.standard;
        return { width: preset.width, height: preset.height, key };
    }
    let w = parseInt(refs.gridWidth.value, 10);
    let h = parseInt(refs.gridHeight.value, 10);
    if (w < 1) w = 1;
    if (h < 1) h = 1;
    refs.gridWidth.value = w;
    refs.gridHeight.value = h;
    return { width: w, height: h, key: 'custom' };
}

export function setupStarClassTooltip() {
    const refs = getControlsRefs();
    const starClassEl = refs.infoStarClass;
    if (!starClassEl) return;

    const handleEnter = (e) => showStarClassInfo(e);
    const handleMove = (e) => showStarClassInfo(e);
    const handleLeave = () => {
        state.starTooltipPinned = false;
        hideStarClassInfo();
    };
    const handleClick = (e) => {
        e.stopPropagation();
        if (state.starTooltipPinned) {
            state.starTooltipPinned = false;
            hideStarClassInfo(true);
        } else {
            showStarClassInfo(e, true);
        }
    };

    starClassEl.addEventListener('mouseenter', handleEnter);
    starClassEl.addEventListener('mousemove', handleMove);
    starClassEl.addEventListener('mouseleave', handleLeave);
    starClassEl.addEventListener('click', handleClick);

    document.addEventListener('click', () => {
        if (state.starTooltipPinned) {
            state.starTooltipPinned = false;
            hideStarClassInfo(true);
        }
    });
}
