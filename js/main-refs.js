const mainRefsCache = {};

export function getMainRefs() {
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
        mainRefsCache.setCoreSystemBtn = document.getElementById('setCoreSystemBtn');
        mainRefsCache.editModeToggleBtn = document.getElementById('editModeToggleBtn');
        mainRefsCache.editAddStarInSectionBtn = document.getElementById('editAddStarInSectionBtn');
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
