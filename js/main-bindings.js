import { setDensityMode, setSizeMode, syncDensityPresetForProfile, syncManualDensityLimits } from './controls.js';
import { randomizeSeed } from './core.js';
import { EVENTS } from './events.js';
import {
    addBodyToSelectedSystem,
    addPoiAtHex,
    addSystemAtHex,
    deletePoiAtHex,
    deleteSelectedBody,
    deleteSelectedSystem,
    generateSector,
    renamePoiAtHex,
    rerollSelectedPlanet,
    rerollSelectedSystem,
    rerollUnpinnedSystems,
    toggleEditMode,
    togglePinSelectedSystem
} from './generation.js';
import { activateSelectedJumpGate, travelSelectedJumpGate } from './multi-sector.js';
import {
    autoSaveSectorState,
    exportSector,
    exportSectorGmBrief,
    exportSectorPng,
    exportSectorSvg,
    loadSectorLocal,
    saveSectorLocal,
    triggerImport
} from './storage.js';
import { state } from './config.js';
import { getMainRefs } from './main-refs.js';
import { bindSectionToggles } from './main-ui.js';

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
    window.addEventListener(EVENTS.VIEW_STATE_CHANGED, autoSaveSectorState);
}

function bindAppEventHandlers(deps) {
    const { updateEditModeUi, updateInfoPanel } = deps;
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
    window.addEventListener(EVENTS.REQUEST_RENAME_POI_AT_HEX, (event) => {
        if (!state.editMode) return;
        const hexId = event && event.detail ? event.detail.hexId : null;
        if (!hexId) return;
        renamePoiAtHex(hexId);
    });
    window.addEventListener(EVENTS.REQUEST_TRAVEL_JUMP_GATE, () => {
        travelSelectedJumpGate();
    });
    window.addEventListener(EVENTS.REQUEST_ACTIVATE_JUMP_GATE, () => {
        if (!state.editMode) return;
        activateSelectedJumpGate();
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

export function bindUiEvents(deps) {
    const refs = getMainRefs();
    bindSectionToggles(refs);
    bindPrimaryActions(refs);
    bindPersistenceSync(refs);
    bindAppEventHandlers(deps);
}
