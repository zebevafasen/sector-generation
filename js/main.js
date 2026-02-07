import { setDensityMode, setSizeMode, setupStarClassTooltip } from './controls.js';
import { randomizeSeed } from './core.js';
import { generateSector } from './generation.js';
import { exportSector, handleImportFile, loadSectorLocal, saveSectorLocal, triggerImport } from './storage.js';
import { setupPanZoom } from './render.js';

window.setSizeMode = setSizeMode;
window.setDensityMode = setDensityMode;
window.randomizeSeed = randomizeSeed;
window.generateSector = generateSector;
window.saveSectorLocal = saveSectorLocal;
window.loadSectorLocal = loadSectorLocal;
window.exportSector = exportSector;
window.triggerImport = triggerImport;

window.onload = function() {
    setupPanZoom();
    const importInput = document.getElementById('importFileInput');
    if (importInput) importInput.addEventListener('change', handleImportFile);
    setSizeMode('preset');
    setupStarClassTooltip();
    generateSector();
};
