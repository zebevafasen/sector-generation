import { setDensityMode, setSizeMode, setupStarClassTooltip } from './controls.js';
import { randomizeSeed } from './core.js';
import { generateSector, rerollSelectedSystem, rerollUnpinnedSystems, togglePinSelectedSystem } from './generation.js';
import { autoSaveSectorState, exportSector, handleImportFile, loadSectorLocal, restoreCachedSectorState, saveSectorLocal, triggerImport } from './storage.js';
import { setupPanZoom } from './render.js';

function setupPanelToggles() {
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
            collapsed = !collapsed;
            applyState(collapsed);
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
}

window.onload = function() {
    setupPanZoom();
    setupPanelToggles();
    bindUiEvents();
    const importInput = document.getElementById('importFileInput');
    if (importInput) importInput.addEventListener('change', handleImportFile);
    setSizeMode('preset');
    setupStarClassTooltip();
    if (!restoreCachedSectorState()) {
        generateSector();
    }
};

