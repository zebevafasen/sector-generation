import { state } from './config.js';
import { createSectorRecord } from './generation.js';
import { isAutoSeedEnabled, showStatusMessage } from './core.js';
import { EVENTS, emitEvent } from './events.js';
import { readGenerationConfigFromUi } from './sector-config.js';
import { applySectorPayload } from './storage.js';
import { selectHex, updateViewTransform } from './render.js';
import { deepClone, parseHexId, sortHexIds, xmur3, mulberry32 } from './utils.js';

const DIRECTIONS = {
    north: { dx: 0, dy: -1 },
    south: { dx: 0, dy: 1 },
    west: { dx: -1, dy: 0 },
    east: { dx: 1, dy: 0 }
};

function getRefs() {
    return {
        currentLabel: document.getElementById('currentSectorLabel'),
        knownLabel: document.getElementById('knownSectorsLabel'),
        northBtn: document.getElementById('sectorNorthBtn'),
        southBtn: document.getElementById('sectorSouthBtn'),
        westBtn: document.getElementById('sectorWestBtn'),
        eastBtn: document.getElementById('sectorEastBtn'),
        homeBtn: document.getElementById('sectorHomeBtn')
    };
}

function parseKey(key) {
    const [xRaw, yRaw] = String(key || '').split(',');
    const x = parseInt(xRaw, 10);
    const y = parseInt(yRaw, 10);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return { x: 0, y: 0 };
    return { x, y };
}

function makeKey(x, y) {
    return `${x},${y}`;
}

function makeJumpEndpointKey(sectorKey, hexId) {
    return `${sectorKey}|${hexId}`;
}

function isActiveJumpGatePoi(poi) {
    if (!poi) return false;
    if (poi.jumpGateState === 'active') return true;
    return /^active jump-gate\b/i.test(String(poi.name || ''));
}

function isInactiveJumpGatePoi(poi) {
    if (!poi) return false;
    if (poi.jumpGateState === 'inactive') return true;
    return /^inactive jump-gate\b/i.test(String(poi.name || ''));
}

function ensureJumpGateRegistry() {
    ensureState();
    if (!state.multiSector.jumpGateRegistry || typeof state.multiSector.jumpGateRegistry !== 'object') {
        state.multiSector.jumpGateRegistry = {};
    }
}

function getDeterministicRandom(seedText) {
    const seeded = xmur3(String(seedText || 'jump-gate'))();
    return mulberry32(seeded);
}

function getReservedJumpEndpoints(skipPairId = null) {
    ensureJumpGateRegistry();
    const reserved = new Set();
    Object.entries(state.multiSector.jumpGateRegistry).forEach(([pairId, pair]) => {
        if (!pair || pairId === skipPairId) return;
        if (pair.a && pair.a.sectorKey && pair.a.hexId) reserved.add(makeJumpEndpointKey(pair.a.sectorKey, pair.a.hexId));
        if (pair.b && pair.b.sectorKey && pair.b.hexId) reserved.add(makeJumpEndpointKey(pair.b.sectorKey, pair.b.hexId));
    });
    return reserved;
}

function buildSectorOffsetCandidates() {
    const offsets = [];
    for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
            if (dx === 0 && dy === 0) continue;
            offsets.push({ dx, dy });
        }
    }
    return offsets;
}

function chooseJumpGateDestination({ sourceSectorKey, sourceHexId, config, pairId }) {
    const sourceSector = parseKey(sourceSectorKey);
    const width = parseInt(config && config.width, 10) || 8;
    const height = parseInt(config && config.height, 10) || 10;
    const rng = getDeterministicRandom(`${state.layoutSeed || state.currentSeed || 'sector'}|${sourceSectorKey}|${sourceHexId}|${pairId}`);
    const offsets = buildSectorOffsetCandidates();
    for (let i = offsets.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [offsets[i], offsets[j]] = [offsets[j], offsets[i]];
    }

    const reserved = getReservedJumpEndpoints(pairId);
    for (let i = 0; i < offsets.length; i++) {
        const targetSectorKey = makeKey(sourceSector.x + offsets[i].dx, sourceSector.y + offsets[i].dy);
        for (let attempt = 0; attempt < 5; attempt++) {
            const col = Math.floor(rng() * width);
            const row = Math.floor(rng() * height);
            const targetHexId = `${col}-${row}`;
            const endpointKey = makeJumpEndpointKey(targetSectorKey, targetHexId);
            if (reserved.has(endpointKey)) continue;
            return { sectorKey: targetSectorKey, hexId: targetHexId };
        }
    }
    return null;
}

function makeJumpGatePairId(sourceSectorKey, sourceHexId) {
    const baseSeed = `${state.layoutSeed || state.currentSeed || 'sector'}|${sourceSectorKey}|${sourceHexId}`;
    const hash = xmur3(baseSeed)();
    return `jg-${hash.toString(36)}`;
}

function ensureJumpGateLinksForRecord(sectorKey, record) {
    if (!record || !record.deepSpacePois || !record.config) return;
    ensureJumpGateRegistry();

    const activeHexIds = sortHexIds(Object.keys(record.deepSpacePois).filter((hexId) =>
        isActiveJumpGatePoi(record.deepSpacePois[hexId])
    ));
    activeHexIds.forEach((hexId) => {
        const poi = record.deepSpacePois[hexId];
        if (!poi) return;
        poi.jumpGateState = 'active';

        let pairId = poi.jumpGatePairId || makeJumpGatePairId(sectorKey, hexId);
        while (state.multiSector.jumpGateRegistry[pairId]
            && !(state.multiSector.jumpGateRegistry[pairId].a
                && state.multiSector.jumpGateRegistry[pairId].a.sectorKey === sectorKey
                && state.multiSector.jumpGateRegistry[pairId].a.hexId === hexId)) {
            pairId = `${pairId}x`;
        }

        if (!state.multiSector.jumpGateRegistry[pairId]) {
            const destination = chooseJumpGateDestination({
                sourceSectorKey: sectorKey,
                sourceHexId: hexId,
                config: record.config,
                pairId
            });
            if (!destination) return;
            state.multiSector.jumpGateRegistry[pairId] = {
                a: { sectorKey, hexId },
                b: { sectorKey: destination.sectorKey, hexId: destination.hexId }
            };
        }

        const pair = state.multiSector.jumpGateRegistry[pairId];
        poi.jumpGatePairId = pairId;
        poi.jumpGateLink = {
            sectorKey: pair.b.sectorKey,
            hexId: pair.b.hexId
        };
    });

    Object.values(record.deepSpacePois).forEach((poi) => {
        if (!poi) return;
        if (isInactiveJumpGatePoi(poi)) {
            poi.jumpGateState = 'inactive';
            delete poi.jumpGatePairId;
            delete poi.jumpGateLink;
        }
    });
}

function pickFallbackJumpHex(record, preferredHexId, blocked = new Set()) {
    const preferred = parseHexId(preferredHexId);
    const width = parseInt(record && record.config && record.config.width, 10) || 8;
    const height = parseInt(record && record.config && record.config.height, 10) || 10;
    const candidateHexIds = [];
    for (let c = 0; c < width; c++) {
        for (let r = 0; r < height; r++) {
            const hexId = `${c}-${r}`;
            if (record.sectors && record.sectors[hexId]) continue;
            if (blocked.has(hexId)) continue;
            candidateHexIds.push(hexId);
        }
    }
    if (!candidateHexIds.length) return null;
    if (!preferred) return candidateHexIds[0];
    candidateHexIds.sort((a, b) => {
        const left = parseHexId(a);
        const right = parseHexId(b);
        const dl = Math.abs(left.col - preferred.col) + Math.abs(left.row - preferred.row);
        const dr = Math.abs(right.col - preferred.col) + Math.abs(right.row - preferred.row);
        return dl - dr;
    });
    return candidateHexIds[0];
}

function ensureInboundJumpGatesForRecord(sectorKey, record) {
    if (!record || !record.config) return;
    ensureJumpGateRegistry();
    if (!record.deepSpacePois || typeof record.deepSpacePois !== 'object') record.deepSpacePois = {};
    const blockedHexes = new Set(
        Object.values(state.multiSector.jumpGateRegistry)
            .filter((pair) => pair && pair.b && pair.b.sectorKey === sectorKey)
            .map((pair) => pair.b.hexId)
            .filter(Boolean)
    );

    Object.entries(state.multiSector.jumpGateRegistry).forEach(([pairId, pair]) => {
        if (!pair || !pair.a || !pair.b) return;
        if (pair.b.sectorKey !== sectorKey) return;

        let targetHexId = pair.b.hexId;
        if (record.sectors && record.sectors[targetHexId]) {
            const fallbackHex = pickFallbackJumpHex(record, targetHexId, blockedHexes);
            if (!fallbackHex) return;
            targetHexId = fallbackHex;
            pair.b.hexId = fallbackHex;
        }
        blockedHexes.add(targetHexId);

        const sourceRecord = state.multiSector.sectorsByKey[pair.a.sectorKey];
        if (sourceRecord && sourceRecord.deepSpacePois && sourceRecord.deepSpacePois[pair.a.hexId]) {
            sourceRecord.deepSpacePois[pair.a.hexId].jumpGateLink = {
                sectorKey: pair.b.sectorKey,
                hexId: pair.b.hexId
            };
            sourceRecord.deepSpacePois[pair.a.hexId].jumpGatePairId = pairId;
            sourceRecord.deepSpacePois[pair.a.hexId].jumpGateState = 'active';
        }

        const existing = record.deepSpacePois[targetHexId] || {};
        const serial = (xmur3(pairId)() % 900) + 100;
        record.deepSpacePois[targetHexId] = {
            kind: 'Navigation',
            name: existing.name && /^active jump-gate\b/i.test(existing.name) ? existing.name : `Active Jump-Gate ${serial}`,
            summary: 'A synchronized jump-gate endpoint tied to a linked remote sector.',
            risk: 'Low',
            rewardHint: 'Enables near-instant transit to its paired gate.',
            jumpGateState: 'active',
            jumpGatePairId: pairId,
            jumpGateLink: {
                sectorKey: pair.a.sectorKey,
                hexId: pair.a.hexId
            }
        };
    });
}

function mapSelectedHexForDirection(selectedHexId) {
    if (!selectedHexId) return null;
    const [cRaw, rRaw] = String(selectedHexId).split('-');
    const c = parseInt(cRaw, 10);
    const r = parseInt(rRaw, 10);
    if (!Number.isInteger(c) || !Number.isInteger(r)) return null;
    return `${c}-${r}`;
}

function getCurrentConfig() {
    const snapshot = state.sectorConfigSnapshot || (state.lastSectorSnapshot && state.lastSectorSnapshot.sectorConfigSnapshot);
    if (snapshot) return deepClone(snapshot);
    return readGenerationConfigFromUi({
        sizeMode: state.sizeMode || 'preset',
        sizePreset: 'standard',
        width: 8,
        height: 10,
        densityMode: state.densityMode || 'preset',
        densityPreset: 'standard',
        manualMin: 0,
        manualMax: 0,
        generationProfile: 'high_adventure',
        starDistribution: 'standard',
        realisticPlanetWeights: false
    });
}

function ensureState() {
    if (!state.multiSector || typeof state.multiSector !== 'object') {
        state.multiSector = { currentKey: '0,0', sectorsByKey: {}, jumpGateRegistry: {} };
    }
    if (!state.multiSector.currentKey) state.multiSector.currentKey = '0,0';
    if (!state.multiSector.sectorsByKey || typeof state.multiSector.sectorsByKey !== 'object') {
        state.multiSector.sectorsByKey = {};
    }
    if (!state.multiSector.jumpGateRegistry || typeof state.multiSector.jumpGateRegistry !== 'object') {
        state.multiSector.jumpGateRegistry = {};
    }
}

function saveCurrentSectorRecord() {
    ensureState();
    const key = state.multiSector.currentKey || '0,0';
    const config = getCurrentConfig();
    const totalHexes = config.width * config.height;
    const nextRecord = {
        seed: state.currentSeed || '',
        config,
        sectors: deepClone(state.sectors || {}),
        deepSpacePois: deepClone(state.deepSpacePois || {}),
        pinnedHexIds: deepClone(state.pinnedHexIds || []),
        totalHexes,
        systemCount: Object.keys(state.sectors || {}).length
    };
    state.multiSector.sectorsByKey[key] = nextRecord;
    ensureJumpGateLinksForRecord(key, nextRecord);
    ensureInboundJumpGatesForRecord(key, nextRecord);

    if (key === state.multiSector.currentKey) {
        state.deepSpacePois = deepClone(nextRecord.deepSpacePois || {});
    }
}

function applySectorRecord(key, record, options = {}) {
    if (!record || !record.config || !record.sectors) return;
    ensureState();

    state.multiSector.currentKey = key;
    const preferredSelectedHexId = options.preferredSelectedHexId || null;
    const preserveView = !!options.preserveView;
    const previousView = preserveView ? deepClone(state.viewState) : null;
    const payload = {
        version: 1,
        generatedAt: new Date().toISOString(),
        seed: record.seed || '',
        sizeMode: record.config.sizeMode,
        sizePreset: record.config.sizePreset,
        densityMode: record.config.densityMode,
        densityPreset: record.config.densityPreset,
        manualRange: {
            min: record.config.manualMin || 0,
            max: record.config.manualMax || 0
        },
        autoSeed: isAutoSeedEnabled(),
        realisticPlanetWeights: !!record.config.realisticPlanetWeights,
        generationProfile: record.config.generationProfile || 'high_adventure',
        starDistribution: record.config.starDistribution || 'standard',
        sectorConfigSnapshot: deepClone(record.config),
        deepSpacePois: deepClone(record.deepSpacePois || {}),
        pinnedHexIds: deepClone(record.pinnedHexIds || []),
        selectedHexId: null,
        multiSector: deepClone(state.multiSector),
        dimensions: {
            width: record.config.width,
            height: record.config.height
        },
        stats: {
            totalHexes: record.totalHexes || (record.config.width * record.config.height),
            totalSystems: record.systemCount || Object.keys(record.sectors).length
        },
        sectors: deepClone(record.sectors)
    };
    applySectorPayload(payload);
    if (preferredSelectedHexId) {
        const group = document.querySelector(`.hex-group[data-id="${preferredSelectedHexId}"]`);
        if (group) {
            selectHex(preferredSelectedHexId, group);
        }
    }
    if (preserveView && previousView) {
        state.viewState = { ...state.viewState, ...previousView };
        updateViewTransform();
    }
    renderSectorLinksUi();
    showStatusMessage(`Loaded sector ${key}.`, 'info');
}

function buildEdgeContinuityFixedSystems(fromRecord, direction) {
    const width = fromRecord.config.width;
    const height = fromRecord.config.height;
    const fixed = {};
    const sectors = fromRecord.sectors || {};

    if (direction === 'east') {
        for (let r = 0; r < height; r++) {
            const fromHex = `${width - 1}-${r}`;
            if (!sectors[fromHex]) continue;
            fixed[`0-${r}`] = deepClone(sectors[fromHex]);
        }
        return fixed;
    }
    if (direction === 'west') {
        for (let r = 0; r < height; r++) {
            const fromHex = `0-${r}`;
            if (!sectors[fromHex]) continue;
            fixed[`${width - 1}-${r}`] = deepClone(sectors[fromHex]);
        }
        return fixed;
    }
    if (direction === 'north') {
        for (let c = 0; c < width; c++) {
            const fromHex = `${c}-0`;
            if (!sectors[fromHex]) continue;
            fixed[`${c}-${height - 1}`] = deepClone(sectors[fromHex]);
        }
        return fixed;
    }
    if (direction === 'south') {
        for (let c = 0; c < width; c++) {
            const fromHex = `${c}-${height - 1}`;
            if (!sectors[fromHex]) continue;
            fixed[`${c}-0`] = deepClone(sectors[fromHex]);
        }
    }
    return fixed;
}

function getOrCreateSectorRecord(targetKey, direction) {
    ensureState();
    const existing = state.multiSector.sectorsByKey[targetKey];
    if (existing) return existing;

    const fromRecord = state.multiSector.sectorsByKey[state.multiSector.currentKey];
    if (!fromRecord) return null;

    const continuityFixed = buildEdgeContinuityFixedSystems(fromRecord, direction);
    const homeSeed = state.multiSector.sectorsByKey['0,0']?.seed || '';
    const baseSeed = homeSeed || fromRecord.seed || 'sector';
    const seed = `${baseSeed} / ${targetKey}`;
    const record = createSectorRecord({
        config: fromRecord.config,
        seed,
        fixedSystems: continuityFixed,
        sectorKey: targetKey,
        knownSectorRecords: state.multiSector.sectorsByKey
    });
    state.multiSector.sectorsByKey[targetKey] = record;
    ensureJumpGateLinksForRecord(targetKey, record);
    ensureInboundJumpGatesForRecord(targetKey, record);
    return record;
}

function getOrCreateSectorRecordByKey(targetKey) {
    ensureState();
    const existing = state.multiSector.sectorsByKey[targetKey];
    if (existing) {
        ensureJumpGateLinksForRecord(targetKey, existing);
        ensureInboundJumpGatesForRecord(targetKey, existing);
        return existing;
    }

    const fromRecord = state.multiSector.sectorsByKey[state.multiSector.currentKey];
    if (!fromRecord) return null;
    const homeSeed = state.multiSector.sectorsByKey['0,0']?.seed || '';
    const baseSeed = homeSeed || fromRecord.seed || 'sector';
    const seed = `${baseSeed} / ${targetKey}`;
    const record = createSectorRecord({
        config: fromRecord.config,
        seed,
        fixedSystems: {},
        sectorKey: targetKey,
        knownSectorRecords: state.multiSector.sectorsByKey
    });
    state.multiSector.sectorsByKey[targetKey] = record;
    ensureJumpGateLinksForRecord(targetKey, record);
    ensureInboundJumpGatesForRecord(targetKey, record);
    return record;
}

function moveDirection(direction) {
    ensureState();
    saveCurrentSectorRecord();
    const delta = DIRECTIONS[direction];
    if (!delta) return;
    const { x, y } = parseKey(state.multiSector.currentKey);
    const targetKey = makeKey(x + delta.dx, y + delta.dy);
    const targetRecord = getOrCreateSectorRecord(targetKey, direction);
    if (!targetRecord) return;
    const mappedSelectedHexId = mapSelectedHexForDirection(state.selectedHexId);
    applySectorRecord(targetKey, targetRecord, {
        preferredSelectedHexId: mappedSelectedHexId,
        preserveView: true
    });
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: `Switch Sector ${direction}` });
}

function goHome() {
    ensureState();
    saveCurrentSectorRecord();
    const homeKey = '0,0';
    const home = state.multiSector.sectorsByKey[homeKey];
    if (!home) return;
    applySectorRecord(homeKey, home, { preferredSelectedHexId: state.selectedHexId, preserveView: true });
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Switch Sector Home' });
}

function renderSectorLinksUi() {
    const refs = getRefs();
    ensureState();
    if (refs.currentLabel) refs.currentLabel.innerText = `Current: ${state.multiSector.currentKey}`;
    if (refs.knownLabel) refs.knownLabel.innerText = `Loaded: ${Object.keys(state.multiSector.sectorsByKey).length}`;
}

export function travelSelectedJumpGate() {
    ensureState();
    saveCurrentSectorRecord();

    const sourceSectorKey = state.multiSector.currentKey || '0,0';
    const sourceHexId = state.selectedHexId;
    const sourceRecord = state.multiSector.sectorsByKey[sourceSectorKey];
    if (!sourceHexId || !sourceRecord || !sourceRecord.deepSpacePois || !sourceRecord.deepSpacePois[sourceHexId]) {
        showStatusMessage('Select an active jump-gate first.', 'warn');
        return;
    }

    const sourcePoi = sourceRecord.deepSpacePois[sourceHexId];
    if (!isActiveJumpGatePoi(sourcePoi) || !sourcePoi.jumpGateLink || !sourcePoi.jumpGateLink.sectorKey) {
        showStatusMessage('Selected POI has no active jump link.', 'warn');
        return;
    }

    const targetSectorKey = sourcePoi.jumpGateLink.sectorKey;
    let targetRecord = getOrCreateSectorRecordByKey(targetSectorKey);
    if (!targetRecord) {
        showStatusMessage('Unable to resolve jump destination sector.', 'error');
        return;
    }

    ensureJumpGateLinksForRecord(sourceSectorKey, sourceRecord);
    ensureInboundJumpGatesForRecord(sourceSectorKey, sourceRecord);
    ensureJumpGateLinksForRecord(targetSectorKey, targetRecord);
    ensureInboundJumpGatesForRecord(targetSectorKey, targetRecord);

    const refreshedSource = state.multiSector.sectorsByKey[sourceSectorKey];
    const refreshedPoi = refreshedSource && refreshedSource.deepSpacePois ? refreshedSource.deepSpacePois[sourceHexId] : null;
    const targetHexId = refreshedPoi && refreshedPoi.jumpGateLink ? refreshedPoi.jumpGateLink.hexId : (sourcePoi.jumpGateLink.hexId || null);
    if (!targetHexId) {
        showStatusMessage('Jump destination link is unresolved.', 'warn');
        return;
    }

    targetRecord = state.multiSector.sectorsByKey[targetSectorKey];
    applySectorRecord(targetSectorKey, targetRecord, {
        preferredSelectedHexId: targetHexId,
        preserveView: true
    });
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Travel Jump Gate' });
    showStatusMessage(`Jumped to sector ${targetSectorKey} at ${targetHexId}.`, 'success');
}

export function setupMultiSectorLinks() {
    const refs = getRefs();
    if (!refs.northBtn || !refs.southBtn || !refs.westBtn || !refs.eastBtn || !refs.homeBtn) return;
    ensureState();
    if (!state.multiSector.sectorsByKey[state.multiSector.currentKey]) {
        saveCurrentSectorRecord();
    } else {
        const currentRecord = state.multiSector.sectorsByKey[state.multiSector.currentKey];
        ensureJumpGateLinksForRecord(state.multiSector.currentKey, currentRecord);
        ensureInboundJumpGatesForRecord(state.multiSector.currentKey, currentRecord);
        state.deepSpacePois = deepClone(currentRecord.deepSpacePois || {});
    }

    refs.northBtn?.addEventListener('click', () => moveDirection('north'));
    refs.southBtn?.addEventListener('click', () => moveDirection('south'));
    refs.westBtn?.addEventListener('click', () => moveDirection('west'));
    refs.eastBtn?.addEventListener('click', () => moveDirection('east'));
    refs.homeBtn?.addEventListener('click', goHome);

    window.addEventListener(EVENTS.SECTOR_DATA_CHANGED, () => {
        saveCurrentSectorRecord();
        renderSectorLinksUi();
    });

    renderSectorLinksUi();
}
