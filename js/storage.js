import {
    LOCAL_STORAGE_KEY,
    state
} from './config.js';
import { showStatusMessage } from './core.js';
import {
    AUTO_SAVE_STORAGE_KEY,
    MANUAL_SAVE_STORAGE_KEY,
    buildSectorPayload,
    readFirstValidPayloadFromStorage
} from './storage-payload.js';
import { createStorageApplyService } from './storage-apply.js';
export { buildSectorPayload } from './storage-payload.js';
export { exportSector, exportSectorGmBrief, exportSectorPng, exportSectorSvg } from './storage-exporters.js';

const storageApplyService = createStorageApplyService({
    buildSectorPayload,
    autoSaveSectorState
});

export function autoSaveSectorState() {
    if (!(typeof window !== 'undefined' && window.localStorage)) return;
    try {
        const payload = buildSectorPayload();
        window.localStorage.setItem(AUTO_SAVE_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
        console.error(err);
    }
}

export function restoreCachedSectorState() {
    if (!(typeof window !== 'undefined' && window.localStorage)) return false;
    try {
        const result = readFirstValidPayloadFromStorage([
            AUTO_SAVE_STORAGE_KEY,
            MANUAL_SAVE_STORAGE_KEY,
            LOCAL_STORAGE_KEY
        ]);
        if (!result.payload) return false;
        applySectorPayload(result.payload);
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}

export function saveSectorLocal() {
    if (!state.lastSectorSnapshot) {
        showStatusMessage('Generate a sector before saving.', 'warn');
        return;
    }
    if (!(typeof window !== 'undefined' && window.localStorage)) {
        showStatusMessage('Local storage unavailable.', 'error');
        return;
    }
    try {
        const payload = buildSectorPayload();
        window.localStorage.setItem(MANUAL_SAVE_STORAGE_KEY, JSON.stringify(payload));
        showStatusMessage('Sector saved to this browser.', 'success');
    } catch (err) {
        console.error(err);
        showStatusMessage('Unable to save sector locally.', 'error');
    }
}

export function loadSectorLocal() {
    if (!(typeof window !== 'undefined' && window.localStorage)) {
        showStatusMessage('Local storage unavailable.', 'error');
        return;
    }
    try {
        const result = readFirstValidPayloadFromStorage([
            MANUAL_SAVE_STORAGE_KEY,
            LOCAL_STORAGE_KEY
        ]);
        if (!result.payload) {
            showStatusMessage('No saved sector found.', 'warn');
            return;
        }
        applySectorPayload(result.payload);
        if (result.errors.length) {
            const firstError = result.errors[0];
            showStatusMessage(`Loaded saved sector (ignored invalid older save: ${firstError}).`, 'warn');
            return;
        }
        showStatusMessage('Loaded saved sector.', 'success');
    } catch (err) {
        console.error(err);
        showStatusMessage('Failed to load saved sector.', 'error');
    }
}

export function triggerImport() {
    storageApplyService.triggerImport();
}

export function handleImportFile(event) {
    storageApplyService.handleImportFile(event);
}

export function applySectorPayload(payload) {
    storageApplyService.applySectorPayload(payload);
}
