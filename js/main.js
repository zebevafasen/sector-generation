import { setDensityMode, setSizeMode, setupStarClassTooltip } from './controls.js';
import { randomizeSeed } from './core.js';
import { generateSector } from './generation.js';
import { exportSector, handleImportFile, loadSectorLocal, saveSectorLocal, triggerImport } from './storage.js';
import { setupPanZoom } from './render.js';

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
}

window.onload = function() {
    setupPanZoom();
    bindUiEvents();
    const importInput = document.getElementById('importFileInput');
    if (importInput) importInput.addEventListener('change', handleImportFile);
    setSizeMode('preset');
    setupStarClassTooltip();
    generateSector();
};
