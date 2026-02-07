import { setDensityMode, setSizeMode, setupStarClassTooltip } from './controls.js';
import { randomizeSeed } from './core.js';
import { state } from './config.js';
import { addBodyToSelectedSystem, addSystemAtHex, deleteSelectedBody, deleteSelectedSystem, generateSector, rerollSelectedSystem, rerollUnpinnedSystems, setEditMode, toggleEditMode, togglePinSelectedSystem } from './generation.js';
import { autoSaveSectorState, exportSector, handleImportFile, loadSectorLocal, restoreCachedSectorState, saveSectorLocal, triggerImport } from './storage.js';
import { setupPanZoom, updateViewTransform } from './render.js';

function setupPanelToggles() {
    const mapContainer = document.getElementById('mapContainer');

    const bindToggle = (config) => {
        const sidebar = document.getElementById(config.sidebarId);
        const header = document.getElementById(config.headerId);
        const content = document.getElementById(config.contentId);
        const button = document.getElementById(config.buttonId);
        if (!sidebar || !header || !content || !button) return;

        const applyState = (collapsed) => {
            header.classList.toggle('hidden', collapsed);
            content.classList.toggle('hidden', collapsed);
            sidebar.classList.toggle('w-full', !collapsed);
            sidebar.classList.toggle('w-2', collapsed);
            sidebar.classList.toggle('md:w-96', !collapsed);
            sidebar.classList.toggle('md:w-3', collapsed);
            if (config.side === 'left') {
                button.innerHTML = collapsed ? '&raquo;' : '&laquo;';
            } else {
                button.innerHTML = collapsed ? '&laquo;' : '&raquo;';
            }
            button.setAttribute('aria-expanded', String(!collapsed));
        };

        let collapsed = false;
        applyState(collapsed);

        button.addEventListener('click', () => {
            const beforeRect = mapContainer ? mapContainer.getBoundingClientRect() : null;
            collapsed = !collapsed;
            applyState(collapsed);
            if (mapContainer && beforeRect) {
                requestAnimationFrame(() => {
                    const afterRect = mapContainer.getBoundingClientRect();
                    const deltaX = afterRect.left - beforeRect.left;
                    const deltaY = afterRect.top - beforeRect.top;
                    if (deltaX !== 0 || deltaY !== 0) {
                        state.viewState.x -= deltaX;
                        state.viewState.y -= deltaY;
                        updateViewTransform();
                    }
                });
            }
        });
    };

    bindToggle({
        sidebarId: 'leftSidebar',
        headerId: 'leftSidebarHeader',
        contentId: 'leftSidebarContent',
        buttonId: 'toggleLeftPanelBtn',
        side: 'left'
    });

    bindToggle({
        sidebarId: 'rightSidebar',
        headerId: 'rightSidebarHeader',
        contentId: 'rightSidebarContent',
        buttonId: 'toggleRightPanelBtn',
        side: 'right'
    });
}

function bindUiEvents() {
    const byId = (id) => document.getElementById(id);

    byId('modeSizePresetBtn')?.addEventListener('click', () => setSizeMode('preset'));
    byId('modeSizeCustomBtn')?.addEventListener('click', () => setSizeMode('custom'));
    byId('modePresetBtn')?.addEventListener('click', () => setDensityMode('preset'));
    byId('modeManualBtn')?.addEventListener('click', () => setDensityMode('manual'));
    byId('randomizeSeedBtn')?.addEventListener('click', randomizeSeed);
    byId('saveSectorLocalBtn')?.addEventListener('click', saveSectorLocal);
    byId('loadSectorLocalBtn')?.addEventListener('click', loadSectorLocal);
    byId('exportSectorBtn')?.addEventListener('click', exportSector);
    byId('triggerImportBtn')?.addEventListener('click', triggerImport);
    byId('generateSectorBtn')?.addEventListener('click', generateSector);
    byId('rerollUnpinnedBtn')?.addEventListener('click', rerollUnpinnedSystems);
    byId('rerollSelectedSystemBtn')?.addEventListener('click', rerollSelectedSystem);
    byId('pinSelectedSystemBtn')?.addEventListener('click', togglePinSelectedSystem);
    byId('editModeToggleBtn')?.addEventListener('click', toggleEditMode);
    byId('editAddPlanetBtn')?.addEventListener('click', () => addBodyToSelectedSystem('planet'));
    byId('editAddBeltBtn')?.addEventListener('click', () => addBodyToSelectedSystem('belt'));
    byId('editAddStationBtn')?.addEventListener('click', () => addBodyToSelectedSystem('station'));
    byId('editDeleteBodyBtn')?.addEventListener('click', deleteSelectedBody);
    byId('editDeleteSystemBtn')?.addEventListener('click', deleteSelectedSystem);

    const persistOnChangeIds = [
        'sizePreset', 'gridWidth', 'gridHeight', 'densityPreset', 'manualMin', 'manualMax',
        'seedInput', 'autoSeedToggle', 'realisticPlanetWeightsToggle', 'generationProfile'
    ];
    persistOnChangeIds.forEach((id) => {
        const el = byId(id);
        if (!el) return;
        el.addEventListener('change', autoSaveSectorState);
    });
    byId('seedInput')?.addEventListener('input', autoSaveSectorState);

    byId('modeSizePresetBtn')?.addEventListener('click', autoSaveSectorState);
    byId('modeSizeCustomBtn')?.addEventListener('click', autoSaveSectorState);
    byId('modePresetBtn')?.addEventListener('click', autoSaveSectorState);
    byId('modeManualBtn')?.addEventListener('click', autoSaveSectorState);
    byId('randomizeSeedBtn')?.addEventListener('click', autoSaveSectorState);
    window.addEventListener('sectorDataChanged', autoSaveSectorState);
    window.addEventListener('requestAddSystemAtHex', (event) => {
        if (!state.editMode) return;
        const hexId = event && event.detail ? event.detail.hexId : null;
        if (!hexId) return;
        addSystemAtHex(hexId);
    });
    window.addEventListener('editModeChanged', updateEditModeUi);
}

function updateEditModeUi() {
    const toggleBtn = document.getElementById('editModeToggleBtn');
    const editControls = document.getElementById('editModeControls');
    if (toggleBtn) {
        toggleBtn.innerText = state.editMode ? 'EDIT MODE: ON' : 'EDIT MODE: OFF';
        toggleBtn.className = state.editMode
            ? 'w-full py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded border border-emerald-500 font-semibold transition-all active:scale-95'
            : 'w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-600 font-semibold transition-all active:scale-95';
    }
    if (editControls) {
        editControls.classList.toggle('hidden', !state.editMode);
    }
}

window.onload = function() {
    setupPanZoom();
    setupPanelToggles();
    bindUiEvents();
    const importInput = document.getElementById('importFileInput');
    if (importInput) importInput.addEventListener('change', handleImportFile);
    setSizeMode('preset');
    setEditMode(false);
    updateEditModeUi();
    setupStarClassTooltip();
    if (!restoreCachedSectorState()) {
        generateSector();
    }
};

