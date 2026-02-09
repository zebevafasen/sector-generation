import { state } from './config.js';
import { showStatusMessage } from './core.js';
import { EVENTS, emitEvent } from './events.js';
import { advanceFactionTurn, createFactionStateForSector } from './factions.js';
import { getMainRefs } from './main-refs.js';
import { findHexGroup, selectHex, drawGrid } from './render.js';

const FACTION_UI_STORAGE_KEY = 'hex-star-sector-gen:faction-ui';

function readFactionUiPrefs() {
    if (!(typeof window !== 'undefined' && window.localStorage)) return {};
    try {
        const raw = window.localStorage.getItem(FACTION_UI_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeFactionUiPrefs(patch) {
    if (!(typeof window !== 'undefined' && window.localStorage)) return;
    const next = {
        ...readFactionUiPrefs(),
        ...patch
    };
    try {
        window.localStorage.setItem(FACTION_UI_STORAGE_KEY, JSON.stringify(next));
    } catch {
        // no-op
    }
}

function normalizeOverlayMode(value) {
    return value === 'off' || value === 'contested' ? value : 'ownership';
}

function normalizeFactionGenerationCount(value) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
}

function getCurrentDimensions() {
    const snapshot = state.sectorConfigSnapshot || state.lastSectorSnapshot?.sectorConfigSnapshot || {};
    const width = Math.max(1, Number(snapshot.width) || 8);
    const height = Math.max(1, Number(snapshot.height) || 10);
    return { width, height };
}

function getCurrentRequestedFactionCount() {
    const stateValue = normalizeFactionGenerationCount(state.factionGenerationCount);
    if (Number.isFinite(stateValue)) return stateValue;
    const snapshot = state.sectorConfigSnapshot || state.lastSectorSnapshot?.sectorConfigSnapshot || {};
    return normalizeFactionGenerationCount(snapshot.factionGenerationCount);
}

function syncFactionCountToSnapshots(requestedCount) {
    if (state.sectorConfigSnapshot && typeof state.sectorConfigSnapshot === 'object') {
        state.sectorConfigSnapshot.factionGenerationCount = requestedCount;
    }
    if (state.lastSectorSnapshot && state.lastSectorSnapshot.sectorConfigSnapshot
        && typeof state.lastSectorSnapshot.sectorConfigSnapshot === 'object') {
        state.lastSectorSnapshot.sectorConfigSnapshot.factionGenerationCount = requestedCount;
    }
    const currentKey = state.multiSector?.currentKey;
    const currentRecord = currentKey ? state.multiSector?.sectorsByKey?.[currentKey] : null;
    if (currentRecord?.config && typeof currentRecord.config === 'object') {
        currentRecord.config.factionGenerationCount = requestedCount;
    }
}

function syncFactionStateToCurrentRecord() {
    if (!state.multiSector || !state.multiSector.sectorsByKey) return;
    const currentKey = state.multiSector.currentKey;
    if (!currentKey) return;
    const record = state.multiSector.sectorsByKey[currentKey];
    if (!record) return;
    record.factionState = state.factionState ? JSON.parse(JSON.stringify(state.factionState)) : null;
}

function ensureCurrentFactionState() {
    if (state.factionState && Array.isArray(state.factionState.factions)) return state.factionState;
    const { width, height } = getCurrentDimensions();
    state.factionState = createFactionStateForSector(state.sectors || {}, {
        deepSpacePois: state.deepSpacePois || {},
        width,
        height,
        coreSystemHexId: state.coreSystemHexId || null,
        sectorKey: state.multiSector?.currentKey || null,
        requestedFactionCount: getCurrentRequestedFactionCount()
    });
    syncFactionStateToCurrentRecord();
    return state.factionState;
}

function refreshMapSelection() {
    const { width, height } = getCurrentDimensions();
    const selectedHexId = state.selectedHexId || null;
    drawGrid(width, height, { resetView: false });
    if (!selectedHexId) return;
    const group = findHexGroup(selectedHexId);
    if (!group) return;
    selectHex(selectedHexId, group);
}

function renderFactionList(refs, factionState) {
    if (!refs.factionList || !refs.factionTurnLabel) return;
    const turn = Math.max(0, Number(factionState && factionState.turn) || 0);
    refs.factionTurnLabel.innerText = `Turn: ${turn}`;
    const factions = Array.isArray(factionState && factionState.factions) ? factionState.factions : [];
    if (!factions.length) {
        refs.factionList.innerHTML = '<li class="text-[11px] text-slate-500 italic">No factions charted for this sector.</li>';
        return;
    }
    refs.factionList.innerHTML = factions
        .slice()
        .sort((a, b) => (b.controlledSystems || 0) - (a.controlledSystems || 0))
        .map((faction) => {
            const control = Number(faction.controlledSystems) || 0;
            const contested = Number(faction.contestedSystems) || 0;
            const stats = `P${Math.round(Number(faction.power) || 0)} / S${Math.round(Number(faction.stability) || 0)}`;
            return `
                <li class="rounded border border-slate-700 bg-slate-900/55 px-2 py-1.5">
                    <div class="flex items-center justify-between gap-2">
                        <div class="inline-flex items-center gap-2 min-w-0">
                            <span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style="background:${faction.color}"></span>
                            <span class="text-xs text-slate-200 truncate">${faction.name}</span>
                        </div>
                        <span class="text-[10px] text-slate-400">${stats}</span>
                    </div>
                    <div class="text-[10px] text-slate-500 mt-0.5">${control} systems${contested ? ` • ${contested} contested` : ''}</div>
                </li>
            `;
        })
        .join('');
}

function updateFactionUi() {
    const refs = getMainRefs();
    const factionState = ensureCurrentFactionState();
    renderFactionList(refs, factionState);
    if (refs.factionGenerationCountInput) {
        const requestedCount = getCurrentRequestedFactionCount();
        refs.factionGenerationCountInput.value = Number.isFinite(requestedCount) ? String(requestedCount) : '';
    }
    const systemCount = Object.keys(state.sectors || {}).length;
    if (refs.factionGenerationCountInput) {
        refs.factionGenerationCountInput.max = String(Math.max(0, systemCount));
        refs.factionGenerationCountInput.placeholder = systemCount > 0 ? `Auto (0-${systemCount})` : 'Auto';
    }
    if (refs.factionOverlayModeSelect) {
        refs.factionOverlayModeSelect.value = state.factionOverlayMode || 'ownership';
    }
}

export function setupFactionsUi() {
    const refs = getMainRefs();
    const uiPrefs = readFactionUiPrefs();
    state.factionOverlayMode = normalizeOverlayMode(uiPrefs.overlayMode || state.factionOverlayMode);
    state.factionGenerationCount = normalizeFactionGenerationCount(uiPrefs.generationCount);
    ensureCurrentFactionState();
    updateFactionUi();

    refs.factionGenerationCountInput?.addEventListener('change', () => {
        const rawValue = refs.factionGenerationCountInput.value;
        const nextCount = normalizeFactionGenerationCount(rawValue);
        const systemCount = Object.keys(state.sectors || {}).length;
        const clampedCount = Number.isFinite(nextCount)
            ? Math.max(0, Math.min(nextCount, systemCount))
            : null;
        state.factionGenerationCount = clampedCount;
        syncFactionCountToSnapshots(clampedCount);
        writeFactionUiPrefs({ generationCount: clampedCount });
        updateFactionUi();
        showStatusMessage('Faction count updated. It will apply on next generation.', 'info');
    });

    refs.factionOverlayModeSelect?.addEventListener('change', () => {
        state.factionOverlayMode = normalizeOverlayMode(refs.factionOverlayModeSelect.value);
        writeFactionUiPrefs({ overlayMode: state.factionOverlayMode });
        refreshMapSelection();
        emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Faction Overlay Mode' });
        emitEvent(EVENTS.FACTION_STATE_CHANGED, { label: 'Faction Overlay Mode' });
    });

    refs.advanceFactionTurnBtn?.addEventListener('click', () => {
        ensureCurrentFactionState();
        const { width, height } = getCurrentDimensions();
        state.factionState = advanceFactionTurn(state.factionState, state.sectors || {}, {
            deepSpacePois: state.deepSpacePois || {},
            width,
            height
        });
        syncFactionStateToCurrentRecord();
        updateFactionUi();
        refreshMapSelection();
        emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Advance Faction Turn' });
        emitEvent(EVENTS.FACTION_STATE_CHANGED, { label: 'Advance Faction Turn' });
        showStatusMessage(`Faction turn advanced to ${state.factionState.turn}.`, 'success');
    });

    window.addEventListener(EVENTS.SECTOR_DATA_CHANGED, () => {
        const currentRecord = state.multiSector?.sectorsByKey?.[state.multiSector?.currentKey || ''];
        if (currentRecord && currentRecord.factionState) {
            state.factionState = currentRecord.factionState;
        } else {
            ensureCurrentFactionState();
            syncFactionStateToCurrentRecord();
        }
        updateFactionUi();
    });
}
