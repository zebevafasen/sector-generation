import {
    LOCAL_STORAGE_KEY,
    state
} from './config.js';
import { showStatusMessage } from './core.js';
import {
    AUTO_SAVE_STORAGE_KEY,
    MANUAL_SAVE_STORAGE_KEY,
    VIEW_STATE_STORAGE_KEY,
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

let viewStateSaveTimer = null;

function readStoredViewState() {
    if (!(typeof window !== 'undefined' && window.localStorage)) return null;
    try {
        const raw = window.localStorage.getItem(VIEW_STATE_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        const x = Number(parsed.x);
        const y = Number(parsed.y);
        const scale = Number(parsed.scale);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(scale)) return null;
        return { x, y, scale };
    } catch {
        return null;
    }
}

export function autoSaveSectorState() {
    if (!(typeof window !== 'undefined' && window.localStorage)) return;
    try {
        const payload = buildSectorPayload();
        window.localStorage.setItem(AUTO_SAVE_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
        console.error(err);
    }
}

export function autoSaveViewStateDebounced(delayMs = 700) {
    if (!(typeof window !== 'undefined' && window.localStorage)) return;
    if (viewStateSaveTimer) {
        window.clearTimeout(viewStateSaveTimer);
    }
    viewStateSaveTimer = window.setTimeout(() => {
        viewStateSaveTimer = null;
        try {
            const snapshot = {
                x: Number.isFinite(state.viewState?.x) ? state.viewState.x : 0,
                y: Number.isFinite(state.viewState?.y) ? state.viewState.y : 0,
                scale: Number.isFinite(state.viewState?.scale) ? state.viewState.scale : 1
            };
            window.localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(snapshot));
        } catch (err) {
            console.error(err);
        }
    }, Math.max(100, delayMs));
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
        const storedViewState = readStoredViewState();
        const payload = storedViewState
            ? {
                ...result.payload,
                viewState: storedViewState
            }
            : result.payload;
        applySectorPayload(payload);
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
