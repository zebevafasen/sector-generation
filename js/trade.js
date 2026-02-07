import { state } from './config.js';
import { EVENTS, emitEvent } from './events.js';
import { showStatusMessage } from './core.js';
import { redrawGridAndReselect } from './ui-sync.js';

const ROLE_TO_EXPORTS = {
    agri: ['Food', 'Biomass'],
    industry: ['Manufactures', 'Alloys'],
    research: ['Data', 'Tech'],
    trade: ['Logistics'],
    military: ['Security Services'],
    frontier: ['Raw Ore'],
    culture: ['Media', 'Luxury Crafts'],
    urban: ['Finance', 'Services']
};

const ROLE_TO_IMPORTS = {
    agri: ['Machinery', 'Tech'],
    industry: ['Ore', 'Fuel', 'Food'],
    research: ['Rare Elements', 'Funding'],
    trade: ['Food', 'Fuel'],
    military: ['Fuel', 'Alloys'],
    frontier: ['Manufactures', 'Food', 'Medicine'],
    culture: ['Luxury Goods', 'Food'],
    urban: ['Food', 'Water', 'Fuel']
};

function getRefs() {
    return {
        overlayToggle: document.getElementById('tradeOverlayToggle'),
        recalcBtn: document.getElementById('recalculateTradeBtn'),
        summary: document.getElementById('tradeSummary')
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

function redrawTradeOverlay() {
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

function deriveSystemRoles(system) {
    const roles = new Set();
    const planets = Array.isArray(system && system.planets) ? system.planets : [];
    planets.forEach((body) => {
        if (!body || !Array.isArray(body.tags)) return;
        body.tags.forEach((tag) => {
            if (tag === 'Agri World') roles.add('agri');
            if (tag === 'Industrial Powerhouse') roles.add('industry');
            if (tag === 'Research Enclave') roles.add('research');
            if (tag === 'Core Trade Hub') roles.add('trade');
            if (tag === 'Military Bastion') roles.add('military');
            if (tag === 'Frontier Outpost') roles.add('frontier');
            if (tag === 'Cultural Center') roles.add('culture');
            if (tag === 'Ecumenopolis') roles.add('urban');
        });
        const type = String(body.type || '');
        if (/Asteroid Belt|Debris Field/i.test(type)) roles.add('frontier');
        if (/Gas Giant/i.test(type)) roles.add('industry');
        if (/Oceanic/i.test(type)) roles.add('agri');
    });
    if (!roles.size) roles.add('trade');
    return [...roles];
}

function deriveEconomyForSystem(hexId, system) {
    const roles = deriveSystemRoles(system);
    const exports = new Set();
    const imports = new Set();
    roles.forEach((role) => {
        (ROLE_TO_EXPORTS[role] || []).forEach((item) => exports.add(item));
        (ROLE_TO_IMPORTS[role] || []).forEach((item) => imports.add(item));
    });

    const popValue = (Array.isArray(system.planets) ? system.planets : []).reduce((sum, body) => {
        const p = Number(body && body.pop);
        return Number.isFinite(p) && p > 0 ? sum + p : sum;
    }, 0);
    if (popValue > 10) {
        imports.add('Food');
        imports.add('Fuel');
    }
    if (popValue > 25) {
        imports.add('Water');
        exports.add('Finance');
    }

    return {
        hexId,
        name: system.name || hexId,
        roles,
        exports: [...exports],
        imports: [...imports],
        pop: popValue
    };
}

function buildEconomyMap() {
    const economyByHex = {};
    Object.entries(state.sectors || {}).forEach(([hexId, system]) => {
        if (!system) return;
        economyByHex[hexId] = deriveEconomyForSystem(hexId, system);
    });
    return economyByHex;
}

function findBestExporter(importerHex, resource, economyByHex) {
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    Object.entries(economyByHex).forEach(([exporterHex, economy]) => {
        if (exporterHex === importerHex) return;
        if (!economy.exports.includes(resource)) return;
        const distance = hexDistance(importerHex, exporterHex);
        if (!Number.isFinite(distance) || distance > 10) return;
        if (distance < bestDistance) {
            best = { exporterHex, exporter: economy, distance };
            bestDistance = distance;
        }
    });
    return best;
}

function buildTradeLanes(economyByHex) {
    const lanesByPair = new Map();

    Object.entries(economyByHex).forEach(([importerHex, importer]) => {
        importer.imports.forEach((resource) => {
            const match = findBestExporter(importerHex, resource, economyByHex);
            if (!match) return;
            const fromHex = match.exporterHex;
            const toHex = importerHex;
            const pairKey = fromHex < toHex ? `${fromHex}|${toHex}` : `${toHex}|${fromHex}`;
            const existing = lanesByPair.get(pairKey) || {
                fromHex,
                toHex,
                resources: new Set(),
                distance: match.distance,
                flow: 0
            };
            existing.resources.add(resource);
            existing.flow += 1 + Math.min(3, Math.floor(importer.pop / 10));
            existing.distance = Math.min(existing.distance, match.distance);
            lanesByPair.set(pairKey, existing);
        });
    });

    return [...lanesByPair.values()]
        .map((lane) => ({
            ...lane,
            resources: [...lane.resources],
            weight: Math.max(1, Math.min(4, Math.round(lane.flow / 3)))
        }))
        .sort((a, b) => b.flow - a.flow || a.distance - b.distance)
        .slice(0, 80);
}

function renderSummary() {
    const refs = getRefs();
    if (!refs.summary) return;
    const lanes = state.tradeLayer && Array.isArray(state.tradeLayer.lanes) ? state.tradeLayer.lanes : [];
    const systems = Object.keys(state.sectors || {}).length;
    if (!systems) {
        refs.summary.innerHTML = '<div class="italic text-slate-600">Generate a sector to simulate trade.</div>';
        return;
    }
    const hubScores = new Map();
    lanes.forEach((lane) => {
        hubScores.set(lane.fromHex, (hubScores.get(lane.fromHex) || 0) + lane.flow);
        hubScores.set(lane.toHex, (hubScores.get(lane.toHex) || 0) + lane.flow);
    });
    const topHubs = [...hubScores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([hexId, score]) => `${hexId} (${score})`);

    refs.summary.innerHTML = `
        <div>Lanes: <span class="text-slate-300">${lanes.length}</span></div>
        <div>Hubs: <span class="text-slate-300">${topHubs.length ? topHubs.join(', ') : 'None'}</span></div>
    `;
}

function recalculateTradeLayer({ announce = false, emit = false, redraw = false } = {}) {
    const economyByHex = buildEconomyMap();
    const lanes = buildTradeLanes(economyByHex);
    state.tradeLayer = { economyByHex, lanes };
    renderSummary();
    if (redraw) redrawTradeOverlay();
    if (emit) emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Recalculate Trade' });
    if (announce) showStatusMessage(`Trade network updated (${lanes.length} lanes).`, 'success');
}

export function isTradeOverlayEnabled() {
    return !!state.tradeOverlayEnabled;
}

export function getTradeLanes() {
    return state.tradeLayer && Array.isArray(state.tradeLayer.lanes) ? state.tradeLayer.lanes : [];
}

export function setupTradeLayer() {
    const refs = getRefs();
    if (!refs.summary) return;
    if (refs.overlayToggle) {
        refs.overlayToggle.checked = !!state.tradeOverlayEnabled;
        refs.overlayToggle.addEventListener('change', () => {
            state.tradeOverlayEnabled = !!refs.overlayToggle.checked;
            if (state.tradeOverlayEnabled) recalculateTradeLayer({ redraw: true });
            else redrawTradeOverlay();
            emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Toggle Trade Overlay' });
        });
    }
    refs.recalcBtn?.addEventListener('click', () => {
        recalculateTradeLayer({ announce: true, emit: true, redraw: true });
    });

    window.addEventListener(EVENTS.SECTOR_DATA_CHANGED, () => {
        if (state.tradeOverlayEnabled) {
            recalculateTradeLayer();
        } else {
            renderSummary();
        }
    });
    renderSummary();
}

export function applyTradeOverlayFromPayload(enabled) {
    state.tradeOverlayEnabled = !!enabled;
    const refs = getRefs();
    if (refs.overlayToggle) refs.overlayToggle.checked = state.tradeOverlayEnabled;
    if (state.tradeOverlayEnabled) recalculateTradeLayer({ redraw: true });
    else redrawTradeOverlay();
    renderSummary();
}

export function readTradeOverlayEnabledFromUi() {
    const refs = getRefs();
    return !!(refs.overlayToggle && refs.overlayToggle.checked);
}
