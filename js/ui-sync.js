import { state } from './config.js';
import { clearInfoPanel, drawGrid, redrawHex, selectHex, updateInfoPanel } from './render.js';

export function clearSelectionInfo() {
    state.selectedHexId = null;
    clearInfoPanel();
}

export function redrawGridAndReselect(width, height, options = {}) {
    const resetView = !!options.resetView;
    const selectedHexId = options.selectedHexId || null;

    if (resetView) {
        drawGrid(width, height);
    } else {
        drawGrid(width, height, { resetView: false });
    }

    if (!selectedHexId || !state.sectors[selectedHexId]) {
        state.selectedHexId = null;
        clearInfoPanel();
        return;
    }

    const group = document.querySelector(`.hex-group[data-id="${selectedHexId}"]`);
    if (group) {
        selectHex(selectedHexId, group);
    } else {
        state.selectedHexId = null;
        clearInfoPanel();
    }
}

export function refreshHexInfo(hexId, preselectedBodyIndex = null) {
    if (!hexId || !state.sectors[hexId]) {
        clearInfoPanel();
        return;
    }
    updateInfoPanel(hexId, preselectedBodyIndex);
}

export function redrawHexAndReselect(hexId, preselectedBodyIndex = null) {
    if (!hexId) return;
    const nextGroup = redrawHex(hexId);
    if (!nextGroup) return;

    if (!state.sectors[hexId]) {
        if (state.selectedHexId === hexId) {
            state.selectedHexId = null;
            clearInfoPanel();
        }
        return;
    }

    selectHex(hexId, nextGroup);
    if (Number.isInteger(preselectedBodyIndex) && preselectedBodyIndex >= 0) {
        updateInfoPanel(hexId, preselectedBodyIndex);
    }
}
