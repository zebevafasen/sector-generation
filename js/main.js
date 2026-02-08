import {
    setSizeMode,
    setupFieldInfoTooltips,
    setupStarClassTooltip,
    syncDensityPresetForProfile,
    syncManualDensityLimits
} from './controls.js';
import { loadAppData } from './data-loader.js';
import { generateSector, setEditMode } from './generation.js';
import { captureHistorySnapshot, setupHistory } from './history.js';
import { setupMultiSectorLinks } from './multi-sector.js';
import { setupFactionsUi } from './factions-ui.js';
import { setupSearchPanel } from './search.js';
import { setupRoutePlanner } from './route-planner.js';
import { handleImportFile, restoreCachedSectorState } from './storage.js';
import { setupPanZoom, updateInfoPanel } from './render.js';
import { getMainRefs } from './main-refs.js';
import { populateDataDrivenOptions } from './main-options.js';
import { setupPanelToggles, updateEditModeUi } from './main-ui.js';
import { bindUiEvents } from './main-bindings.js';

function initializeModules() {
    setupPanZoom();
    setupPanelToggles();
    bindUiEvents({ updateEditModeUi, updateInfoPanel });
    setupHistory();
    setupMultiSectorLinks();
    setupFactionsUi();
    setupSearchPanel();
    setupRoutePlanner();
}

function initializeUiState() {
    populateDataDrivenOptions();
    const importInput = document.getElementById('importFileInput');
    if (importInput) importInput.addEventListener('change', handleImportFile);
    setSizeMode('preset');
    syncDensityPresetForProfile();
    syncManualDensityLimits();
    setEditMode(false);
    updateEditModeUi();
    setupStarClassTooltip();
    setupFieldInfoTooltips();
    getMainRefs();
}

function initializeSectorData() {
    if (!restoreCachedSectorState()) {
        generateSector();
    }
    captureHistorySnapshot('Initial State');
}

async function initApp() {
    await loadAppData();
    initializeModules();
    initializeUiState();
    initializeSectorData();
}

window.addEventListener('DOMContentLoaded', () => {
    initApp().catch((error) => {
        console.error('Failed to initialize app data', error);
    });
});
