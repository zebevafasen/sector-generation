function setDensityMode(mode) {
    densityMode = mode;
    const btnPreset = document.getElementById('modePresetBtn');
    const btnManual = document.getElementById('modeManualBtn');
    const divPreset = document.getElementById('densityPresetContainer');
    const divManual = document.getElementById('densityManualContainer');

    if (mode === 'preset') {
        btnPreset.className = "flex-1 py-1 text-xs rounded bg-sky-600 text-white shadow transition-all";
        btnManual.className = "flex-1 py-1 text-xs rounded text-slate-400 hover:text-white transition-all";
        divPreset.classList.remove('hidden');
        divManual.classList.add('hidden');
    } else {
        btnManual.className = "flex-1 py-1 text-xs rounded bg-sky-600 text-white shadow transition-all";
        btnPreset.className = "flex-1 py-1 text-xs rounded text-slate-400 hover:text-white transition-all";
        divPreset.classList.add('hidden');
        divManual.classList.remove('hidden');
    }
}

function setSizeMode(mode) {
    sizeMode = mode;
    const btnPreset = document.getElementById('modeSizePresetBtn');
    const btnCustom = document.getElementById('modeSizeCustomBtn');
    const presetContainer = document.getElementById('sizePresetContainer');
    const customContainer = document.getElementById('sizeCustomContainer');

    if (mode === 'preset') {
        btnPreset.className = "flex-1 py-1 text-xs rounded bg-sky-600 text-white shadow transition-all";
        btnCustom.className = "flex-1 py-1 text-xs rounded text-slate-400 hover:text-white transition-all";
        presetContainer.classList.remove('hidden');
        customContainer.classList.add('hidden');
    } else {
        btnCustom.className = "flex-1 py-1 text-xs rounded bg-sky-600 text-white shadow transition-all";
        btnPreset.className = "flex-1 py-1 text-xs rounded text-slate-400 hover:text-white transition-all";
        presetContainer.classList.add('hidden');
        customContainer.classList.remove('hidden');
    }
}

function getSelectedGridSize() {
    if (sizeMode === 'preset') {
        const select = document.getElementById('sizePreset');
        const key = select ? select.value : 'standard';
        const preset = GRID_PRESETS[key] || GRID_PRESETS.standard;
        return { width: preset.width, height: preset.height, key };
    }
    let w = parseInt(document.getElementById('gridWidth').value);
    let h = parseInt(document.getElementById('gridHeight').value);
    if (w < 1) w = 1;
    if (h < 1) h = 1;
    document.getElementById('gridWidth').value = w;
    document.getElementById('gridHeight').value = h;
    return { width: w, height: h, key: 'custom' };
}

function setupStarClassTooltip() {
    const starClassEl = document.getElementById('infoStarClass');
    if (!starClassEl) return;

    const handleEnter = (e) => showStarClassInfo(e);
    const handleMove = (e) => showStarClassInfo(e);
    const handleLeave = () => {
        starTooltipPinned = false;
        hideStarClassInfo();
    };
    const handleClick = (e) => {
        e.stopPropagation();
        if (starTooltipPinned) {
            starTooltipPinned = false;
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
        if (starTooltipPinned) {
            starTooltipPinned = false;
            hideStarClassInfo(true);
        }
    });
}
