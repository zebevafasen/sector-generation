import {
    setDensityMode,
    setSizeMode,
    setupFieldInfoTooltips,
    setupStarClassTooltip,
    syncDensityPresetForProfile,
    syncManualDensityLimits
} from './controls.js';
import { randomizeSeed } from './core.js';
import { EVENTS } from './events.js';
import { state } from './config.js';
import { addBodyToSelectedSystem, addPoiAtHex, addSystemAtHex, deletePoiAtHex, deleteSelectedBody, deleteSelectedSystem, generateSector, rerollSelectedPlanet, rerollSelectedSystem, rerollUnpinnedSystems, setEditMode, toggleEditMode, togglePinSelectedSystem } from './generation.js';
import { captureHistorySnapshot, setupHistory } from './history.js';
import { setupMultiSectorLinks } from './multi-sector.js';
import { setupSearchPanel } from './search.js';
import { setupRoutePlanner } from './route-planner.js';
import {
    autoSaveSectorState,
    exportSector,
    exportSectorGmBrief,
    exportSectorPng,
    exportSectorSvg,
    handleImportFile,
    loadSectorLocal,
    restoreCachedSectorState,
    saveSectorLocal,
    triggerImport
} from './storage.js';
import { setupPanZoom, updateInfoPanel, updateViewTransform } from './render.js';

const mainRefsCache = {};

function getMainRefs() {
    if (!mainRefsCache.modeSizePresetBtn) {
        mainRefsCache.modeSizePresetBtn = document.getElementById('modeSizePresetBtn');
        mainRefsCache.modeSizeCustomBtn = document.getElementById('modeSizeCustomBtn');
        mainRefsCache.modePresetBtn = document.getElementById('modePresetBtn');
        mainRefsCache.modeManualBtn = document.getElementById('modeManualBtn');
        mainRefsCache.randomizeSeedBtn = document.getElementById('randomizeSeedBtn');
        mainRefsCache.saveSectorLocalBtn = document.getElementById('saveSectorLocalBtn');
        mainRefsCache.loadSectorLocalBtn = document.getElementById('loadSectorLocalBtn');
        mainRefsCache.exportSectorBtn = document.getElementById('exportSectorBtn');
        mainRefsCache.exportSuitePanel = document.getElementById('exportSuitePanel');
        mainRefsCache.exportJsonBtn = document.getElementById('exportJsonBtn');
        mainRefsCache.exportSvgBtn = document.getElementById('exportSvgBtn');
        mainRefsCache.exportPngBtn = document.getElementById('exportPngBtn');
        mainRefsCache.exportBriefBtn = document.getElementById('exportBriefBtn');
        mainRefsCache.triggerImportBtn = document.getElementById('triggerImportBtn');
        mainRefsCache.generateSectorBtn = document.getElementById('generateSectorBtn');
        mainRefsCache.rerollUnpinnedBtn = document.getElementById('rerollUnpinnedBtn');
        mainRefsCache.rerollSelectedSystemBtn = document.getElementById('rerollSelectedSystemBtn');
        mainRefsCache.pinSelectedSystemBtn = document.getElementById('pinSelectedSystemBtn');
        mainRefsCache.editModeToggleBtn = document.getElementById('editModeToggleBtn');
        mainRefsCache.editAddPlanetInSectionBtn = document.getElementById('editAddPlanetInSectionBtn');
        mainRefsCache.editAddBeltInSectionBtn = document.getElementById('editAddBeltInSectionBtn');
        mainRefsCache.editAddStationInSectionBtn = document.getElementById('editAddStationInSectionBtn');
        mainRefsCache.editDeleteBodyBtn = document.getElementById('editDeleteBodyBtn');
        mainRefsCache.editDeleteSystemBtn = document.getElementById('editDeleteSystemBtn');
        mainRefsCache.editModeControls = document.getElementById('editModeControls');
        mainRefsCache.editHistoryPanel = document.getElementById('editHistoryPanel');
        mainRefsCache.searchToggleBtn = document.getElementById('searchToggleBtn');
        mainRefsCache.searchPanelContent = document.getElementById('searchPanelContent');
        mainRefsCache.quickDeleteBodyBtn = document.getElementById('quickDeleteBodyBtn');
        mainRefsCache.seedInput = document.getElementById('seedInput');
        mainRefsCache.sizePreset = document.getElementById('sizePreset');
        mainRefsCache.gridWidth = document.getElementById('gridWidth');
        mainRefsCache.gridHeight = document.getElementById('gridHeight');
        mainRefsCache.densityPreset = document.getElementById('densityPreset');
        mainRefsCache.manualMin = document.getElementById('manualMin');
        mainRefsCache.manualMax = document.getElementById('manualMax');
        mainRefsCache.autoSeedToggle = document.getElementById('autoSeedToggle');
        mainRefsCache.realisticPlanetWeightsToggle = document.getElementById('realisticPlanetWeightsToggle');
        mainRefsCache.generationProfile = document.getElementById('generationProfile');
        mainRefsCache.starDistribution = document.getElementById('starDistribution');
    }
    return mainRefsCache;
}

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

function bindSectionToggles(refs) {
    if (refs.exportSectorBtn && refs.exportSuitePanel) {
        refs.exportSectorBtn.addEventListener('click', () => {
            const isHidden = refs.exportSuitePanel.classList.toggle('hidden');
            refs.exportSectorBtn.setAttribute('aria-expanded', String(!isHidden));
        });
    }
    if (refs.searchToggleBtn && refs.searchPanelContent) {
        refs.searchToggleBtn.addEventListener('click', () => {
            const isCollapsed = refs.searchPanelContent.classList.toggle('hidden');
            refs.searchToggleBtn.innerText = isCollapsed ? '+' : '-';
            refs.searchToggleBtn.title = isCollapsed ? 'Expand search panel' : 'Collapse search panel';
            refs.searchToggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand search panel' : 'Collapse search panel');
        });
    }
}

function bindPrimaryActions(refs) {
    refs.modeSizePresetBtn?.addEventListener('click', () => setSizeMode('preset'));
    refs.modeSizeCustomBtn?.addEventListener('click', () => setSizeMode('custom'));
    refs.modePresetBtn?.addEventListener('click', () => setDensityMode('preset'));
    refs.modeManualBtn?.addEventListener('click', () => setDensityMode('manual'));
    refs.randomizeSeedBtn?.addEventListener('click', randomizeSeed);
    refs.saveSectorLocalBtn?.addEventListener('click', saveSectorLocal);
    refs.loadSectorLocalBtn?.addEventListener('click', loadSectorLocal);
    refs.exportJsonBtn?.addEventListener('click', exportSector);
    refs.exportSvgBtn?.addEventListener('click', exportSectorSvg);
    refs.exportPngBtn?.addEventListener('click', exportSectorPng);
    refs.exportBriefBtn?.addEventListener('click', exportSectorGmBrief);
    refs.triggerImportBtn?.addEventListener('click', triggerImport);
    refs.generateSectorBtn?.addEventListener('click', generateSector);
    refs.rerollUnpinnedBtn?.addEventListener('click', rerollUnpinnedSystems);
    refs.rerollSelectedSystemBtn?.addEventListener('click', rerollSelectedSystem);
    refs.pinSelectedSystemBtn?.addEventListener('click', togglePinSelectedSystem);
    refs.editModeToggleBtn?.addEventListener('click', toggleEditMode);
    refs.editAddPlanetInSectionBtn?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        addBodyToSelectedSystem('planet');
    });
    refs.editAddBeltInSectionBtn?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        addBodyToSelectedSystem('belt');
    });
    refs.editAddStationInSectionBtn?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        addBodyToSelectedSystem('station');
    });
    refs.editDeleteBodyBtn?.addEventListener('click', deleteSelectedBody);
    refs.editDeleteSystemBtn?.addEventListener('click', deleteSelectedSystem);
}

function bindPersistenceSync(refs) {
    const persistOnChangeIds = [
        'sizePreset', 'gridWidth', 'gridHeight', 'densityPreset', 'manualMin', 'manualMax',
        'seedInput', 'autoSeedToggle', 'realisticPlanetWeightsToggle', 'generationProfile', 'starDistribution'
    ];
    persistOnChangeIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', autoSaveSectorState);
    });
    refs.seedInput?.addEventListener('input', autoSaveSectorState);
    refs.gridWidth?.addEventListener('input', syncManualDensityLimits);
    refs.gridHeight?.addEventListener('input', syncManualDensityLimits);
    refs.manualMin?.addEventListener('input', syncManualDensityLimits);
    refs.manualMax?.addEventListener('input', syncManualDensityLimits);
    refs.gridWidth?.addEventListener('change', syncManualDensityLimits);
    refs.gridHeight?.addEventListener('change', syncManualDensityLimits);
    refs.manualMin?.addEventListener('change', syncManualDensityLimits);
    refs.manualMax?.addEventListener('change', syncManualDensityLimits);

    refs.modeSizePresetBtn?.addEventListener('click', autoSaveSectorState);
    refs.modeSizeCustomBtn?.addEventListener('click', autoSaveSectorState);
    refs.modePresetBtn?.addEventListener('click', autoSaveSectorState);
    refs.modeManualBtn?.addEventListener('click', autoSaveSectorState);
    refs.randomizeSeedBtn?.addEventListener('click', autoSaveSectorState);
    refs.generationProfile?.addEventListener('change', () => {
        syncDensityPresetForProfile(refs.generationProfile.value);
    });
    window.addEventListener(EVENTS.SECTOR_DATA_CHANGED, autoSaveSectorState);
}

function bindAppEventHandlers() {
    window.addEventListener(EVENTS.REQUEST_ADD_SYSTEM_AT_HEX, (event) => {
        if (!state.editMode) return;
        const hexId = event && event.detail ? event.detail.hexId : null;
        if (!hexId) return;
        addSystemAtHex(hexId);
    });
    window.addEventListener(EVENTS.REQUEST_ADD_POI_AT_HEX, (event) => {
        if (!state.editMode) return;
        const hexId = event && event.detail ? event.detail.hexId : null;
        if (!hexId) return;
        addPoiAtHex(hexId);
    });
    window.addEventListener(EVENTS.REQUEST_DELETE_POI_AT_HEX, (event) => {
        if (!state.editMode) return;
        const hexId = event && event.detail ? event.detail.hexId : null;
        if (!hexId) return;
        deletePoiAtHex(hexId);
    });
    window.addEventListener(EVENTS.REQUEST_DELETE_SELECTED_BODY, () => {
        if (!state.editMode) return;
        deleteSelectedBody();
    });
    window.addEventListener(EVENTS.REQUEST_REROLL_SELECTED_PLANET, () => {
        rerollSelectedPlanet();
    });
    window.addEventListener(EVENTS.EDIT_MODE_CHANGED, () => {
        updateEditModeUi();
        if (state.selectedHexId) {
            updateInfoPanel(state.selectedHexId, state.selectedBodyIndex);
        }
    });
}

function bindUiEvents() {
    const refs = getMainRefs();
    bindSectionToggles(refs);
    bindPrimaryActions(refs);
    bindPersistenceSync(refs);
    bindAppEventHandlers();
}

function updateEditModeUi() {
    const refs = getMainRefs();
    if (refs.editModeToggleBtn) {
        refs.editModeToggleBtn.innerText = state.editMode ? 'EDIT MODE: ON' : 'EDIT MODE: OFF';
        refs.editModeToggleBtn.className = state.editMode
            ? 'px-2 py-1 text-[10px] rounded border border-emerald-500 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold tracking-wide transition-colors'
            : 'px-2 py-1 text-[10px] rounded border border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold tracking-wide transition-colors';
    }
    if (refs.editModeControls) {
        refs.editModeControls.classList.toggle('hidden', !state.editMode);
    }
    if (refs.editHistoryPanel) {
        refs.editHistoryPanel.classList.toggle('hidden', !state.editMode);
    }
    if (refs.quickDeleteBodyBtn) {
        refs.quickDeleteBodyBtn.classList.toggle('hidden', !state.editMode);
        if (!state.editMode) {
            refs.quickDeleteBodyBtn.disabled = true;
            refs.quickDeleteBodyBtn.onclick = null;
        }
    }
    if (refs.editAddPlanetInSectionBtn) refs.editAddPlanetInSectionBtn.classList.toggle('hidden', !state.editMode);
    if (refs.editAddBeltInSectionBtn) refs.editAddBeltInSectionBtn.classList.toggle('hidden', !state.editMode);
    if (refs.editAddStationInSectionBtn) refs.editAddStationInSectionBtn.classList.toggle('hidden', !state.editMode);
}

function initializeModules() {
    setupPanZoom();
    setupPanelToggles();
    bindUiEvents();
    setupHistory();
    setupMultiSectorLinks();
    setupSearchPanel();
    setupRoutePlanner();
}

function initializeUiState() {
    const importInput = document.getElementById('importFileInput');
    if (importInput) importInput.addEventListener('change', handleImportFile);
    setSizeMode('preset');
    syncDensityPresetForProfile();
    syncManualDensityLimits();
    setEditMode(false);
    updateEditModeUi();
    setupStarClassTooltip();
    setupFieldInfoTooltips();
}

function initializeSectorData() {
    if (!restoreCachedSectorState()) {
        generateSector();
    }
    captureHistorySnapshot('Initial State');
}

function initApp() {
    initializeModules();
    initializeUiState();
    initializeSectorData();
}

window.addEventListener('DOMContentLoaded', () => {
    initApp();
});

