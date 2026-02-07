import { state } from './config.js';
import { showStatusMessage } from './core.js';
import { EVENTS } from './events.js';
import { applySectorPayload, buildSectorPayload } from './storage.js';
import { deepClone } from './utils.js';

const MAX_HISTORY_ENTRIES = 60;

const historyState = {
    entries: [],
    currentIndex: -1,
    restoring: false,
    sequence: 0
};

function buildFingerprint(payload) {
    return JSON.stringify({
        seed: payload.seed || '',
        sizeMode: payload.sizeMode,
        sizePreset: payload.sizePreset,
        densityMode: payload.densityMode,
        densityPreset: payload.densityPreset,
        manualRange: payload.manualRange || null,
        generationProfile: payload.generationProfile || 'high_adventure',
        starDistribution: payload.starDistribution || 'standard',
        realisticPlanetWeights: !!payload.realisticPlanetWeights,
        dimensions: payload.dimensions || null,
        pinnedHexIds: payload.pinnedHexIds || [],
        sectors: payload.sectors || {}
    });
}

function isTextInputTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName.toLowerCase();
    if (target.isContentEditable) return true;
    return tag === 'input' || tag === 'textarea' || tag === 'select';
}

function updateHistoryButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.disabled = historyState.currentIndex <= 0;
    if (redoBtn) redoBtn.disabled = historyState.currentIndex >= historyState.entries.length - 1;
}

function renderHistoryList() {
    const list = document.getElementById('historyList');
    if (!list) return;

    list.innerHTML = '';
    if (!historyState.entries.length) {
        list.innerHTML = '<li class="text-[11px] text-slate-500 italic">No history yet.</li>';
        return;
    }

    for (let i = historyState.entries.length - 1; i >= 0; i--) {
        const entry = historyState.entries[i];
        const isActive = i === historyState.currentIndex;
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = isActive
            ? 'w-full text-left px-2 py-1 rounded border border-sky-600 bg-sky-900/30 text-sky-200 text-[11px]'
            : 'w-full text-left px-2 py-1 rounded border border-slate-700 bg-slate-800/60 text-slate-300 text-[11px] hover:border-sky-500';
        button.innerText = `${entry.label} (${entry.step})`;
        button.title = `Restore ${entry.label}`;
        button.addEventListener('click', () => {
            applyHistoryEntry(i, `Restored: ${entry.label}`);
        });
        item.appendChild(button);
        list.appendChild(item);
    }
}

function applyHistoryEntry(index, statusMessage) {
    if (index < 0 || index >= historyState.entries.length) return false;
    const entry = historyState.entries[index];
    if (!entry) return false;

    historyState.restoring = true;
    applySectorPayload(deepClone(entry.payload));
    historyState.currentIndex = index;
    historyState.restoring = false;
    updateHistoryButtons();
    renderHistoryList();
    showStatusMessage(statusMessage, 'info');
    return true;
}

export function captureHistorySnapshot(label = 'Snapshot') {
    if (historyState.restoring) return;
    if (!state.lastSectorSnapshot) return;

    const payload = buildSectorPayload();
    const fingerprint = buildFingerprint(payload);
    const current = historyState.entries[historyState.currentIndex];
    if (current && current.fingerprint === fingerprint) {
        updateHistoryButtons();
        return;
    }

    const nextEntries = historyState.entries.slice(0, historyState.currentIndex + 1);
    historyState.sequence += 1;
    nextEntries.push({ payload: deepClone(payload), fingerprint, label, step: `#${historyState.sequence}` });

    if (nextEntries.length > MAX_HISTORY_ENTRIES) {
        nextEntries.shift();
    }

    historyState.entries = nextEntries;
    historyState.currentIndex = historyState.entries.length - 1;
    updateHistoryButtons();
    renderHistoryList();
}

export function undoHistory() {
    if (historyState.currentIndex <= 0) {
        showStatusMessage('Nothing to undo.', 'warn');
        return;
    }
    applyHistoryEntry(historyState.currentIndex - 1, 'Undo applied.');
}

export function redoHistory() {
    if (historyState.currentIndex >= historyState.entries.length - 1) {
        showStatusMessage('Nothing to redo.', 'warn');
        return;
    }
    applyHistoryEntry(historyState.currentIndex + 1, 'Redo applied.');
}

export function setupHistory() {
    window.addEventListener(EVENTS.SECTOR_DATA_CHANGED, (event) => {
        const label = event && event.detail && event.detail.label ? event.detail.label : 'Snapshot';
        captureHistorySnapshot(label);
    });

    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.addEventListener('click', undoHistory);
    if (redoBtn) redoBtn.addEventListener('click', redoHistory);

    window.addEventListener('keydown', (event) => {
        if (!(event.ctrlKey || event.metaKey)) return;
        if (isTextInputTarget(event.target)) return;

        const key = String(event.key || '').toLowerCase();
        if (key === 'z' && !event.shiftKey) {
            event.preventDefault();
            undoHistory();
            return;
        }
        if (key === 'y' || (key === 'z' && event.shiftKey)) {
            event.preventDefault();
            redoHistory();
        }
    });

    updateHistoryButtons();
    renderHistoryList();
}
