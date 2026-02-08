import { state } from './config.js';
import { createSectorRecord } from './generation.js';
import { isAutoSeedEnabled, showStatusMessage } from './core.js';
import { EVENTS, emitEvent } from './events.js';
import { readGenerationConfigFromUi } from './sector-config.js';
import { HOME_SECTOR_KEY, makeSectorKeyFromCoords, offsetSectorKey, parseSectorKeyToCoords } from './sector-address.js';
import { getGlobalHexDisplayIdForSector } from './render-shared.js';
import { applySectorPayload } from './storage.js';
import { centerViewOnSector, findHexGroup, selectHex, updateViewTransform } from './render.js';
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
        chartGateCorridorsBtn: document.getElementById('chartGateCorridorsBtn'),
        expandedViewBtn: document.getElementById('toggleExpandedSectorViewBtn'),
        northBtn: document.getElementById('sectorNorthBtn'),
        southBtn: document.getElementById('sectorSouthBtn'),
        westBtn: document.getElementById('sectorWestBtn'),
        eastBtn: document.getElementById('sectorEastBtn'),
        homeBtn: document.getElementById('sectorHomeBtn')
    };
}

function parseKey(key) {
    return parseSectorKeyToCoords(key || HOME_SECTOR_KEY);
}

function getStepToward(value, target) {
    if (value === target) return 0;
    return value < target ? 1 : -1;
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
        const targetSectorKey = makeSectorKeyFromCoords(sourceSector.x + offsets[i].dx, sourceSector.y + offsets[i].dy);
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
        state.multiSector = { currentKey: HOME_SECTOR_KEY, sectorsByKey: {}, jumpGateRegistry: {}, chartGateCorridorsPending: false, expandedView: false };
    }
    if (!state.multiSector.currentKey) state.multiSector.currentKey = HOME_SECTOR_KEY;
    if (!state.multiSector.sectorsByKey || typeof state.multiSector.sectorsByKey !== 'object') {
        state.multiSector.sectorsByKey = {};
    }
    if (!state.multiSector.jumpGateRegistry || typeof state.multiSector.jumpGateRegistry !== 'object') {
        state.multiSector.jumpGateRegistry = {};
    }
    if (typeof state.multiSector.chartGateCorridorsPending !== 'boolean') {
        state.multiSector.chartGateCorridorsPending = false;
    }
    if (typeof state.multiSector.expandedView !== 'boolean') {
        state.multiSector.expandedView = false;
    }
}

function saveCurrentSectorRecord() {
    ensureState();
    const key = state.multiSector.currentKey || HOME_SECTOR_KEY;
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
    const showLoadedToast = options.showLoadedToast !== false;
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
        const group = findHexGroup(preferredSelectedHexId, key);
        if (group) {
            selectHex(preferredSelectedHexId, group);
        }
    }
    if (preserveView && previousView) {
        state.viewState = { ...state.viewState, ...previousView };
        updateViewTransform();
    }
    renderSectorLinksUi();
    if (showLoadedToast) showStatusMessage(`Loaded sector ${key}.`, 'info');
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
    const homeSeed = state.multiSector.sectorsByKey[HOME_SECTOR_KEY]?.seed || '';
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
    const homeSeed = state.multiSector.sectorsByKey[HOME_SECTOR_KEY]?.seed || '';
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

function getIntermediarySectorKeysBetween(startKey, endKey) {
    const path = getShortestPathSectorKeys(startKey, endKey);
    if (path.length <= 2) return [];
    return path.slice(1, path.length - 1);
}

function getShortestPathSectorKeys(startKey, endKey) {
    const start = parseKey(startKey);
    const end = parseKey(endKey);
    const keys = [makeSectorKeyFromCoords(start.x, start.y)];
    let x = start.x;
    let y = start.y;
    while (!(x === end.x && y === end.y)) {
        if (x !== end.x) {
            x += getStepToward(x, end.x);
        } else if (y !== end.y) {
            y += getStepToward(y, end.y);
        }
        keys.push(makeSectorKeyFromCoords(x, y));
    }
    return keys;
}

function getMissingGateCorridorSectorKeys() {
    ensureState();
    const missing = new Set();
    const loaded = state.multiSector.sectorsByKey || {};
    const homeKey = HOME_SECTOR_KEY;

    const loadedGateSectorKeys = new Set();
    Object.values(state.multiSector.jumpGateRegistry || {}).forEach((pair) => {
        if (!pair || !pair.a || !pair.b) return;
        if (pair.a.sectorKey && loaded[pair.a.sectorKey]) loadedGateSectorKeys.add(pair.a.sectorKey);
        if (pair.b.sectorKey && loaded[pair.b.sectorKey]) loadedGateSectorKeys.add(pair.b.sectorKey);
    });

    loadedGateSectorKeys.forEach((sectorKey) => {
        if (sectorKey === homeKey) return;
        const pathKeys = getShortestPathSectorKeys(homeKey, sectorKey);
        pathKeys.forEach((key, index) => {
            if (index === 0 || index === pathKeys.length - 1) return;
            if (!loaded[key]) missing.add(key);
        });
    });

    Object.values(state.multiSector.jumpGateRegistry || {}).forEach((pair) => {
        if (!pair || !pair.a || !pair.b || !pair.a.sectorKey || !pair.b.sectorKey) return;
        if (!loaded[pair.a.sectorKey] || !loaded[pair.b.sectorKey]) return;
        const a = parseKey(pair.a.sectorKey);
        const b = parseKey(pair.b.sectorKey);
        const chebyshevDistance = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
        if (chebyshevDistance <= 1) return;
        getIntermediarySectorKeysBetween(pair.a.sectorKey, pair.b.sectorKey).forEach((key) => {
            if (!loaded[key]) missing.add(key);
        });
    });
    return Array.from(missing);
}

function chartMissingGateCorridors() {
    ensureState();
    saveCurrentSectorRecord();
    const missingKeys = getMissingGateCorridorSectorKeys();
    if (!missingKeys.length) {
        state.multiSector.chartGateCorridorsPending = false;
        showStatusMessage('No gate corridors need charting right now.', 'info');
        renderSectorLinksUi();
        return;
    }
    missingKeys.forEach((sectorKey) => {
        getOrCreateSectorRecordByKey(sectorKey);
    });
    state.multiSector.chartGateCorridorsPending = false;
    renderSectorLinksUi();
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Chart Gate Corridors' });
    const listedKeys = missingKeys.slice(0, 6).join(', ');
    const extra = missingKeys.length > 6 ? ` +${missingKeys.length - 6} more` : '';
    showStatusMessage(
        `Charted ${missingKeys.length} corridor sector${missingKeys.length === 1 ? '' : 's'}: ${listedKeys}${extra}.`,
        'success'
    );
}

function moveDirection(direction) {
    ensureState();
    saveCurrentSectorRecord();
    const delta = DIRECTIONS[direction];
    if (!delta) return;
    const targetKey = offsetSectorKey(state.multiSector.currentKey, delta.dx, delta.dy);
    const targetRecord = getOrCreateSectorRecord(targetKey, direction);
    if (!targetRecord) return;
    applySectorRecord(targetKey, targetRecord, {
        preferredSelectedHexId: state.selectedHexId,
        preserveView: true
    });
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: `Switch Sector ${direction}` });
}

function toggleExpandedSectorView() {
    ensureState();
    saveCurrentSectorRecord();
    const wasExpanded = !!state.multiSector.expandedView;
    const currentKey = state.multiSector.currentKey;

    if (!wasExpanded) {
        state.multiSector.expandedView = true;
        const currentRecord = state.multiSector.sectorsByKey[currentKey];
        if (!currentRecord) return;
        applySectorRecord(currentKey, currentRecord, {
            preferredSelectedHexId: state.selectedHexId,
            preserveView: false,
            showLoadedToast: false
        });
        centerViewOnSector(currentKey);
    } else {
        const targetKey = currentKey;
        const targetRecord = getOrCreateSectorRecordByKey(targetKey);
        if (!targetRecord) return;
        state.multiSector.expandedView = false;
        applySectorRecord(targetKey, targetRecord, {
            preferredSelectedHexId: state.selectedHexId,
            preserveView: false,
            showLoadedToast: false
        });
    }
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Toggle Expanded View' });
    showStatusMessage(
        state.multiSector.expandedView ? 'Expanded sector view enabled.' : 'Expanded sector view disabled.',
        'info'
    );
}

function switchToSectorHex(sectorKey, hexId) {
    ensureState();
    saveCurrentSectorRecord();
    const targetRecord = getOrCreateSectorRecordByKey(sectorKey);
    if (!targetRecord) return;
    applySectorRecord(sectorKey, targetRecord, {
        preferredSelectedHexId: hexId || null,
        preserveView: true
    });
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Switch Sector Hex' });
}

function goHome() {
    ensureState();
    saveCurrentSectorRecord();
    const homeKey = HOME_SECTOR_KEY;
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
    if (refs.expandedViewBtn) {
        refs.expandedViewBtn.innerText = state.multiSector.expandedView ? 'Expanded View: On' : 'Expanded View: Off';
        refs.expandedViewBtn.className = state.multiSector.expandedView
            ? 'w-auto h-8 px-2 inline-flex items-center justify-center rounded-md bg-sky-800/90 border border-sky-500 text-sky-100 hover:text-white hover:border-sky-300 transition-colors text-[10px]'
            : 'w-auto h-8 px-2 inline-flex items-center justify-center rounded-md bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white hover:border-sky-500 transition-colors text-[10px]';
        refs.expandedViewBtn.title = state.multiSector.expandedView ? 'Disable expanded sector view' : 'Enable expanded sector view';
        refs.expandedViewBtn.setAttribute('aria-label', refs.expandedViewBtn.title);
    }
    if (refs.chartGateCorridorsBtn) {
        const missingCount = getMissingGateCorridorSectorKeys().length;
        if (missingCount > 0) state.multiSector.chartGateCorridorsPending = true;
        refs.chartGateCorridorsBtn.classList.toggle('hidden', !state.multiSector.chartGateCorridorsPending);
        refs.chartGateCorridorsBtn.innerText = missingCount > 0
            ? `Chart Gate Corridors (${missingCount})`
            : 'Chart Gate Corridors';
    }
}

export function travelSelectedJumpGate() {
    ensureState();
    saveCurrentSectorRecord();

    const sourceSectorKey = state.multiSector.currentKey || HOME_SECTOR_KEY;
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
    showStatusMessage(`Jumped to sector ${targetSectorKey} at ${getGlobalHexDisplayIdForSector(targetSectorKey, targetHexId)}.`, 'success');
}

export function setupMultiSectorLinks() {
    const refs = getRefs();
    if (!refs.northBtn || !refs.southBtn || !refs.westBtn || !refs.eastBtn || !refs.homeBtn || !refs.expandedViewBtn) return;
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
    refs.chartGateCorridorsBtn?.addEventListener('click', chartMissingGateCorridors);
    refs.expandedViewBtn?.addEventListener('click', toggleExpandedSectorView);

    window.addEventListener(EVENTS.SECTOR_DATA_CHANGED, () => {
        saveCurrentSectorRecord();
        renderSectorLinksUi();
    });
    window.addEventListener(EVENTS.REQUEST_SWITCH_SECTOR_HEX, (event) => {
        const sectorKey = event && event.detail ? event.detail.sectorKey : null;
        const hexId = event && event.detail ? event.detail.hexId : null;
        if (!sectorKey || !hexId) return;
        switchToSectorHex(sectorKey, hexId);
    });

    renderSectorLinksUi();
}
