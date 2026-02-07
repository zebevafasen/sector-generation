import { FACTION_DEFINITIONS, state } from './config.js';
import { rand, showStatusMessage } from './core.js';
import { EVENTS, emitEvent } from './events.js';
import { redrawGridAndReselect } from './ui-sync.js';

function getRefs() {
    return {
        overlayToggle: document.getElementById('factionOverlayToggle'),
        assignBtn: document.getElementById('assignFactionsBtn'),
        clearBtn: document.getElementById('clearFactionsBtn'),
        cycleBtn: document.getElementById('cycleSelectedFactionBtn'),
        legend: document.getElementById('factionLegend')
    };
}

function getGridDimensions() {
    const snapshot = state.sectorConfigSnapshot
        || (state.lastSectorSnapshot && state.lastSectorSnapshot.sectorConfigSnapshot)
        || null;
    let width = parseInt(snapshot && snapshot.width, 10);
    let height = parseInt(snapshot && snapshot.height, 10);
    if (!Number.isFinite(width) || width < 1) width = parseInt(document.getElementById('gridWidth')?.value || '8', 10);
    if (!Number.isFinite(height) || height < 1) height = parseInt(document.getElementById('gridHeight')?.value || '10', 10);
    if (!Number.isFinite(width) || width < 1) width = 8;
    if (!Number.isFinite(height) || height < 1) height = 10;
    return { width, height };
}

function redrawForFactionChange() {
    const { width, height } = getGridDimensions();
    redrawGridAndReselect(width, height, { selectedHexId: state.selectedHexId });
}

function parseHexId(hexId) {
    const [cRaw, rRaw] = String(hexId || '').split('-');
    const col = parseInt(cRaw, 10);
    const row = parseInt(rRaw, 10);
    if (!Number.isInteger(col) || !Number.isInteger(row)) return null;
    return { col, row };
}

function oddrToCube(col, row) {
    const x = col - ((row - (row & 1)) / 2);
    const z = row;
    const y = -x - z;
    return { x, y, z };
}

function cubeDistance(a, b) {
    return Math.max(
        Math.abs(a.x - b.x),
        Math.abs(a.y - b.y),
        Math.abs(a.z - b.z)
    );
}

function hexDistance(hexA, hexB) {
    const a = parseHexId(hexA);
    const b = parseHexId(hexB);
    if (!a || !b) return Number.POSITIVE_INFINITY;
    return cubeDistance(oddrToCube(a.col, a.row), oddrToCube(b.col, b.row));
}

function getNeighborHexIds(hexId) {
    const parsed = parseHexId(hexId);
    if (!parsed) return [];
    const base = oddrToCube(parsed.col, parsed.row);
    const directions = [
        { x: 1, y: -1, z: 0 },
        { x: 1, y: 0, z: -1 },
        { x: 0, y: 1, z: -1 },
        { x: -1, y: 1, z: 0 },
        { x: -1, y: 0, z: 1 },
        { x: 0, y: -1, z: 1 }
    ];
    return directions.map((dir) => {
        const cube = { x: base.x + dir.x, y: base.y + dir.y, z: base.z + dir.z };
        const col = cube.x + ((cube.z - (cube.z & 1)) / 2);
        const row = cube.z;
        return `${col}-${row}`;
    });
}

function shuffleInPlace(items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const temp = items[i];
        items[i] = items[j];
        items[j] = temp;
    }
}

export function getFactionById(factionId) {
    return FACTION_DEFINITIONS.find((faction) => faction.id === factionId) || null;
}

export function isFactionOverlayEnabled() {
    return !!state.factionOverlayEnabled;
}

export function isSystemBorderHex(hexId) {
    const system = state.sectors && state.sectors[hexId];
    if (!system || !system.factionId) return false;
    return getNeighborHexIds(hexId).some((neighborHexId) => {
        const neighbor = state.sectors && state.sectors[neighborHexId];
        return !!(neighbor && neighbor.factionId && neighbor.factionId !== system.factionId);
    });
}

export function isSystemContestedHex(hexId) {
    const system = state.sectors && state.sectors[hexId];
    if (!system || !system.factionId) return false;
    const foreignNeighbors = new Set();
    getNeighborHexIds(hexId).forEach((neighborHexId) => {
        const neighbor = state.sectors && state.sectors[neighborHexId];
        if (neighbor && neighbor.factionId && neighbor.factionId !== system.factionId) {
            foreignNeighbors.add(neighbor.factionId);
        }
    });
    return foreignNeighbors.size >= 2;
}

export function getFactionClaimForHex(hexId) {
    const system = state.sectors && state.sectors[hexId];
    if (system && system.factionId) {
        return { factionId: system.factionId, source: 'system', contested: false };
    }

    const claimedSystems = Object.entries(state.sectors || {})
        .filter(([, entry]) => !!(entry && entry.factionId))
        .map(([systemHexId, entry]) => ({ hexId: systemHexId, factionId: entry.factionId }));
    if (!claimedSystems.length) return null;

    const MAX_INFLUENCE_DISTANCE = 2;
    let nearestDistance = Number.POSITIVE_INFINITY;
    const nearestByFaction = new Map();
    claimedSystems.forEach((claim) => {
        const distance = hexDistance(hexId, claim.hexId);
        if (!Number.isFinite(distance) || distance > MAX_INFLUENCE_DISTANCE) return;
        if (distance < nearestDistance) nearestDistance = distance;
        const current = nearestByFaction.get(claim.factionId);
        if (typeof current === 'undefined' || distance < current) {
            nearestByFaction.set(claim.factionId, distance);
        }
    });

    if (!Number.isFinite(nearestDistance)) return null;
    const nearestFactions = [...nearestByFaction.entries()]
        .filter(([, distance]) => distance === nearestDistance)
        .map(([factionId]) => factionId);

    if (nearestFactions.length !== 1) {
        return { factionId: null, source: 'space', contested: true };
    }
    return { factionId: nearestFactions[0], source: 'space', contested: false };
}

function assignFactionToSystem(hexId, factionId) {
    const system = state.sectors && state.sectors[hexId];
    if (!system) return;
    if (factionId) {
        system.factionId = factionId;
    } else {
        delete system.factionId;
    }
}

function getAssignedFactionIds() {
    return Object.values(state.sectors || {})
        .map((system) => (system && system.factionId ? system.factionId : null))
        .filter(Boolean);
}

function renderFactionLegend() {
    const refs = getRefs();
    if (!refs.legend) return;
    const totalSystems = Object.keys(state.sectors || {}).length;
    if (!totalSystems) {
        refs.legend.innerHTML = '<div class="italic text-slate-600">Generate a sector to assign faction claims.</div>';
        return;
    }

    const counts = FACTION_DEFINITIONS.map((faction) => ({
        faction,
        systems: Object.values(state.sectors).filter((system) => system && system.factionId === faction.id).length
    }));

    refs.legend.innerHTML = counts.map(({ faction, systems }) =>
        `<div class="flex items-center justify-between rounded border border-slate-700 bg-slate-900/35 px-2 py-1">
            <span class="inline-flex items-center gap-1.5">
                <span class="inline-block w-2.5 h-2.5 rounded-full" style="background:${faction.color}"></span>
                <span class="text-slate-300">${faction.name}</span>
            </span>
            <span class="text-slate-500">${systems}</span>
        </div>`
    ).join('');
}

function assignFactions() {
    const systemHexIds = Object.keys(state.sectors || {});
    if (!systemHexIds.length) {
        showStatusMessage('Generate a sector first.', 'warn');
        return;
    }

    const refs = getRefs();
    const factionCount = Math.min(FACTION_DEFINITIONS.length, systemHexIds.length);
    const seeds = [...systemHexIds];
    shuffleInPlace(seeds);
    const seededFactions = FACTION_DEFINITIONS.slice(0, factionCount).map((faction, idx) => ({
        factionId: faction.id,
        seedHex: seeds[idx]
    }));

    systemHexIds.forEach((hexId) => {
        let bestFaction = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        seededFactions.forEach((seed) => {
            const distance = hexDistance(hexId, seed.seedHex);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestFaction = seed.factionId;
            }
        });
        assignFactionToSystem(hexId, bestFaction);
    });

    state.factionOverlayEnabled = true;
    if (refs.overlayToggle) refs.overlayToggle.checked = true;
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Assign Factions' });
    redrawForFactionChange();
    showStatusMessage('Faction claims assigned.', 'success');
    renderFactionLegend();
}

function clearFactions() {
    Object.keys(state.sectors || {}).forEach((hexId) => assignFactionToSystem(hexId, null));
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Clear Factions' });
    redrawForFactionChange();
    showStatusMessage('Faction claims cleared.', 'info');
    renderFactionLegend();
}

function cycleSelectedSystemFaction() {
    const selectedHexId = state.selectedHexId;
    if (!selectedHexId || !state.sectors[selectedHexId]) {
        showStatusMessage('Select a system to change faction.', 'warn');
        return;
    }
    const current = state.sectors[selectedHexId].factionId || null;
    const pool = [...FACTION_DEFINITIONS.map((f) => f.id), null];
    const currentIndex = pool.indexOf(current);
    const next = pool[(currentIndex + 1) % pool.length];
    assignFactionToSystem(selectedHexId, next);
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Cycle Faction' });
    redrawForFactionChange();
    const faction = next ? getFactionById(next) : null;
    showStatusMessage(
        faction ? `Assigned ${selectedHexId} to ${faction.name}.` : `Removed faction claim from ${selectedHexId}.`,
        'info'
    );
    renderFactionLegend();
}

export function setupFactionOverlay() {
    const refs = getRefs();
    if (!refs.legend) return;

    if (refs.overlayToggle) {
        refs.overlayToggle.checked = !!state.factionOverlayEnabled;
        refs.overlayToggle.addEventListener('change', () => {
            state.factionOverlayEnabled = !!refs.overlayToggle.checked;
            emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Toggle Faction Overlay' });
            redrawForFactionChange();
        });
    }

    refs.assignBtn?.addEventListener('click', assignFactions);
    refs.clearBtn?.addEventListener('click', clearFactions);
    refs.cycleBtn?.addEventListener('click', cycleSelectedSystemFaction);

    window.addEventListener(EVENTS.SECTOR_DATA_CHANGED, renderFactionLegend);
    renderFactionLegend();
}

export function applyFactionOverlayFromPayload(enabled) {
    state.factionOverlayEnabled = !!enabled;
    const refs = getRefs();
    if (refs.overlayToggle) refs.overlayToggle.checked = state.factionOverlayEnabled;
    renderFactionLegend();
}

export function readFactionOverlayEnabledFromUi() {
    const refs = getRefs();
    return !!(refs.overlayToggle && refs.overlayToggle.checked);
}

export function getFactionCoverageSummary() {
    const assigned = getAssignedFactionIds();
    return {
        assignedSystems: assigned.length,
        totalSystems: Object.keys(state.sectors || {}).length
    };
}
