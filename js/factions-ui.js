import { state } from './config.js';
import { showStatusMessage } from './core.js';
import { EVENTS, emitEvent } from './events.js';
import { advanceFactionTurn, createFactionStateForSector } from './factions.js';
import { getMainRefs } from './main-refs.js';
import { findHexGroup, selectHex, drawGrid } from './render.js';

function getCurrentDimensions() {
    const snapshot = state.sectorConfigSnapshot || state.lastSectorSnapshot?.sectorConfigSnapshot || {};
    const width = Math.max(1, Number(snapshot.width) || 8);
    const height = Math.max(1, Number(snapshot.height) || 10);
    return { width, height };
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
    state.factionState = createFactionStateForSector(state.sectors || {}, {
        coreSystemHexId: state.coreSystemHexId || null,
        sectorKey: state.multiSector?.currentKey || null
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
    if (refs.factionOverlayModeSelect) {
        refs.factionOverlayModeSelect.value = state.factionOverlayMode || 'ownership';
    }
}

export function setupFactionsUi() {
    const refs = getMainRefs();
    ensureCurrentFactionState();
    updateFactionUi();

    refs.factionOverlayModeSelect?.addEventListener('change', () => {
        state.factionOverlayMode = refs.factionOverlayModeSelect.value || 'ownership';
        refreshMapSelection();
        emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Faction Overlay Mode' });
        emitEvent(EVENTS.FACTION_STATE_CHANGED, { label: 'Faction Overlay Mode' });
    });

    refs.advanceFactionTurnBtn?.addEventListener('click', () => {
        ensureCurrentFactionState();
        state.factionState = advanceFactionTurn(state.factionState, state.sectors || {});
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
