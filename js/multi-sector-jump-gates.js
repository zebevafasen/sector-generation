import { HOME_SECTOR_KEY, makeSectorKeyFromCoords, parseSectorKeyToCoords } from './sector-address.js';
import { parseHexId, sortHexIds, xmur3, mulberry32 } from './utils.js';
import { DEEP_SPACE_POI_TEMPLATES } from './generation-data.js';
import {
    isActiveJumpGatePoi,
    isInactiveJumpGatePoi,
    isJumpGatePoi,
    JUMP_GATE_POI_CATEGORY
} from './jump-gate-model.js';

function parseKey(key) {
    return parseSectorKeyToCoords(key || HOME_SECTOR_KEY);
}

function makeJumpEndpointKey(sectorKey, hexId) {
    return `${sectorKey}|${hexId}`;
}

function matchesEndpoint(endpoint, sectorKey, hexId) {
    return !!(
        endpoint
        && endpoint.sectorKey === sectorKey
        && endpoint.hexId === hexId
    );
}

function getPairCounterpart(pair, sectorKey, hexId) {
    if (!pair) return null;
    if (matchesEndpoint(pair.a, sectorKey, hexId)) return pair.b || null;
    if (matchesEndpoint(pair.b, sectorKey, hexId)) return pair.a || null;
    return null;
}

function getDeterministicRandom(seedText) {
    const seeded = xmur3(String(seedText || 'jump-gate'))();
    return mulberry32(seeded);
}

function getCanonicalJumpGateProfile(sourcePoi = null, targetPoi = null) {
    const defaultProfile = {
        kind: 'Navigation',
        poiCategory: JUMP_GATE_POI_CATEGORY,
        summary: 'A synchronized jump-gate endpoint tied to a linked remote sector.',
        risk: 'Low',
        rewardHint: 'Enables near-instant transit to its paired gate.'
    };
    const pickString = (value, fallback) => {
        const text = typeof value === 'string' ? value.trim() : '';
        return text || fallback;
    };
    const preferred = sourcePoi || targetPoi || {};
    const secondary = targetPoi || sourcePoi || {};
    return {
        kind: pickString(preferred.kind, pickString(secondary.kind, defaultProfile.kind)),
        poiCategory: JUMP_GATE_POI_CATEGORY,
        summary: pickString(preferred.summary, pickString(secondary.summary, defaultProfile.summary)),
        risk: pickString(preferred.risk, pickString(secondary.risk, defaultProfile.risk)),
        rewardHint: pickString(preferred.rewardHint, pickString(secondary.rewardHint, defaultProfile.rewardHint))
    };
}

function getActiveJumpGateDefaults() {
    const template = (DEEP_SPACE_POI_TEMPLATES || []).find((item) =>
        item
        && item.poiCategory === JUMP_GATE_POI_CATEGORY
        && item.jumpGateState === 'active'
    );
    if (!template) {
        return {
            kind: 'Navigation',
            summary: 'A synchronized jump-gate endpoint tied to a linked remote sector.',
            risk: 'Low',
            rewardHint: 'Enables near-instant transit to its paired gate.'
        };
    }
    return {
        kind: typeof template.kind === 'string' && template.kind.trim() ? template.kind.trim() : 'Navigation',
        summary: typeof template.summary === 'string' && template.summary.trim()
            ? template.summary.trim()
            : 'A synchronized jump-gate endpoint tied to a linked remote sector.',
        risk: typeof template.risk === 'string' && template.risk.trim() ? template.risk.trim() : 'Low',
        rewardHint: typeof template.rewardHint === 'string' && template.rewardHint.trim()
            ? template.rewardHint.trim()
            : 'Enables near-instant transit to its paired gate.'
    };
}

function normalizeActivatedJumpGateName(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    const withoutInactive = text
        .replace(/\binactive\b/ig, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    return withoutInactive;
}

function getPairedJumpGateNames(pairId, sourcePoi = null, targetPoi = null) {
    const serial = (xmur3(pairId)() % 900) + 100;
    const fallbackA = `Jump-Gate ${serial}A`;
    const fallbackB = `Jump-Gate ${serial}B`;
    const normalize = (value) => normalizeActivatedJumpGateName(value);

    let aName = normalize(sourcePoi && sourcePoi.name) || fallbackA;
    let bName = normalize(targetPoi && targetPoi.name) || fallbackB;
    if (aName.toLowerCase() === bName.toLowerCase()) {
        aName = fallbackA;
        bName = fallbackB;
    }
    return { aName, bName };
}

function chooseDirectionalVector(sourceHexId, width, height, rng) {
    const parsed = parseHexId(sourceHexId);
    if (!parsed) return { dx: 0, dy: 0 };
    const distances = [
        { edge: 'west', distance: parsed.col, dx: -1, dy: 0 },
        { edge: 'east', distance: (width - 1) - parsed.col, dx: 1, dy: 0 },
        { edge: 'north', distance: parsed.row, dx: 0, dy: -1 },
        { edge: 'south', distance: (height - 1) - parsed.row, dx: 0, dy: 1 }
    ].sort((a, b) => a.distance - b.distance);
    const nearestDistance = distances[0].distance;
    const nearest = distances.filter((item) => item.distance === nearestDistance);
    return nearest[Math.floor(rng() * nearest.length)] || { dx: 0, dy: 0 };
}

function buildSectorOffsetCandidates(direction) {
    const offsets = [];
    for (let dx = -4; dx <= 4; dx++) {
        for (let dy = -4; dy <= 4; dy++) {
            if (dx === 0 && dy === 0) continue;
            const distance = Math.max(Math.abs(dx), Math.abs(dy));
            if (distance < 2) continue;
            offsets.push({ dx, dy });
        }
    }
    offsets.sort((left, right) => {
        const leftAlignment = (direction.dx === 0 || Math.sign(left.dx) === Math.sign(direction.dx) ? 1 : 0)
            + (direction.dy === 0 || Math.sign(left.dy) === Math.sign(direction.dy) ? 1 : 0);
        const rightAlignment = (direction.dx === 0 || Math.sign(right.dx) === Math.sign(direction.dx) ? 1 : 0)
            + (direction.dy === 0 || Math.sign(right.dy) === Math.sign(direction.dy) ? 1 : 0);
        if (leftAlignment !== rightAlignment) return rightAlignment - leftAlignment;
        const leftDistance = Math.max(Math.abs(left.dx), Math.abs(left.dy));
        const rightDistance = Math.max(Math.abs(right.dx), Math.abs(right.dy));
        return leftDistance - rightDistance;
    });
    return offsets;
}

function chooseDestinationHex(config, direction, rng, reserved, targetSectorKey) {
    const width = parseInt(config && config.width, 10) || 8;
    const height = parseInt(config && config.height, 10) || 10;
    const cols = [];
    const rows = [];

    if (direction.dx > 0) {
        cols.push(0, 1, 2);
    } else if (direction.dx < 0) {
        cols.push(width - 1, width - 2, width - 3);
    } else {
        cols.push(Math.floor(width / 2), Math.floor(width / 2) - 1, Math.floor(width / 2) + 1);
    }

    if (direction.dy > 0) {
        rows.push(0, 1, 2);
    } else if (direction.dy < 0) {
        rows.push(height - 1, height - 2, height - 3);
    } else {
        rows.push(Math.floor(height / 2), Math.floor(height / 2) - 1, Math.floor(height / 2) + 1);
    }

    const validCols = cols.filter((value, index, array) => Number.isInteger(value) && value >= 0 && value < width && array.indexOf(value) === index);
    const validRows = rows.filter((value, index, array) => Number.isInteger(value) && value >= 0 && value < height && array.indexOf(value) === index);
    const candidates = [];
    validCols.forEach((col) => {
        validRows.forEach((row) => {
            candidates.push(`${col}-${row}`);
        });
    });
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (let i = 0; i < candidates.length; i++) {
        const hexId = candidates[i];
        const endpointKey = makeJumpEndpointKey(targetSectorKey, hexId);
        if (reserved.has(endpointKey)) continue;
        return hexId;
    }

    for (let attempt = 0; attempt < 8; attempt++) {
        const col = Math.floor(rng() * width);
        const row = Math.floor(rng() * height);
        const hexId = `${col}-${row}`;
        const endpointKey = makeJumpEndpointKey(targetSectorKey, hexId);
        if (reserved.has(endpointKey)) continue;
        return hexId;
    }
    return null;
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

export function createJumpGateService(state, ensureState) {
    function ensureJumpGateRegistry() {
        ensureState();
        if (!state.multiSector.jumpGateRegistry || typeof state.multiSector.jumpGateRegistry !== 'object') {
            state.multiSector.jumpGateRegistry = {};
        }
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

    function chooseJumpGateDestination({ sourceSectorKey, sourceHexId, config, pairId }) {
        const sourceSector = parseKey(sourceSectorKey);
        const width = parseInt(config && config.width, 10) || 8;
        const height = parseInt(config && config.height, 10) || 10;
        const rng = getDeterministicRandom(`${state.layoutSeed || state.currentSeed || 'sector'}|${sourceSectorKey}|${sourceHexId}|${pairId}`);
        const direction = chooseDirectionalVector(sourceHexId, width, height, rng);
        const offsets = buildSectorOffsetCandidates(direction);

        const reserved = getReservedJumpEndpoints(pairId);
        for (let i = 0; i < offsets.length; i++) {
            const targetSectorKey = makeSectorKeyFromCoords(sourceSector.x + offsets[i].dx, sourceSector.y + offsets[i].dy);
            const targetHexId = chooseDestinationHex(config, direction, rng, reserved, targetSectorKey);
            if (targetHexId) return { sectorKey: targetSectorKey, hexId: targetHexId };
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

        const jumpGateHexIds = sortHexIds(Object.keys(record.deepSpacePois).filter((hexId) =>
            isJumpGatePoi(record.deepSpacePois[hexId])
        ));
        jumpGateHexIds.forEach((hexId) => {
            const poi = record.deepSpacePois[hexId];
            if (!poi) return;
            poi.poiCategory = JUMP_GATE_POI_CATEGORY;
            const desiredState = isInactiveJumpGatePoi(poi) ? 'inactive' : 'active';
            poi.jumpGateState = desiredState;
            if (!poi.jumpGateMeta || typeof poi.jumpGateMeta !== 'object') poi.jumpGateMeta = null;

            let pairId = poi.jumpGatePairId || makeJumpGatePairId(sectorKey, hexId);
            while (
                state.multiSector.jumpGateRegistry[pairId]
                && !matchesEndpoint(state.multiSector.jumpGateRegistry[pairId].a, sectorKey, hexId)
                && !matchesEndpoint(state.multiSector.jumpGateRegistry[pairId].b, sectorKey, hexId)
            ) {
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
                    b: { sectorKey: destination.sectorKey, hexId: destination.hexId },
                    state: desiredState
                };
            }

            const pair = state.multiSector.jumpGateRegistry[pairId];
            pair.state = desiredState === 'active' ? 'active' : (pair.state || 'inactive');
            if (!matchesEndpoint(pair.a, sectorKey, hexId) && !matchesEndpoint(pair.b, sectorKey, hexId)) {
                pair.a = { sectorKey, hexId };
            }
            const counterpart = getPairCounterpart(pair, sectorKey, hexId);
            if (!counterpart || !counterpart.sectorKey || !counterpart.hexId) return;
            poi.jumpGatePairId = pairId;
            poi.jumpGateLink = {
                sectorKey: counterpart.sectorKey,
                hexId: counterpart.hexId
            };
        });

        Object.values(record.deepSpacePois).forEach((poi) => {
            if (!poi) return;
            if (!isJumpGatePoi(poi)) {
                poi.jumpGatePairId = null;
                poi.jumpGateLink = null;
                poi.jumpGateMeta = null;
            }
        });
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
            const sourcePoi = sourceRecord && sourceRecord.deepSpacePois
                ? sourceRecord.deepSpacePois[pair.a.hexId] || null
                : null;
            const targetPoi = record.deepSpacePois[targetHexId] || null;
            const profile = getCanonicalJumpGateProfile(sourcePoi, targetPoi);
            const names = getPairedJumpGateNames(pairId, sourcePoi, targetPoi);
            const linkedState = pair.state === 'active' ? 'active' : 'inactive';

            if (sourcePoi) {
                sourceRecord.deepSpacePois[pair.a.hexId] = {
                    ...sourcePoi,
                    ...profile,
                    name: names.aName,
                    jumpGateState: linkedState,
                    jumpGatePairId: pairId,
                    jumpGateLink: {
                        sectorKey: pair.b.sectorKey,
                        hexId: pair.b.hexId
                    },
                    jumpGateMeta: sourcePoi.jumpGateMeta && typeof sourcePoi.jumpGateMeta === 'object'
                        ? sourcePoi.jumpGateMeta
                        : null
                };
            }

            record.deepSpacePois[targetHexId] = {
                ...(targetPoi || {}),
                ...profile,
                name: names.bName,
                jumpGateState: linkedState,
                jumpGatePairId: pairId,
                jumpGateLink: {
                    sectorKey: pair.a.sectorKey,
                    hexId: pair.a.hexId
                },
                jumpGateMeta: targetPoi && targetPoi.jumpGateMeta && typeof targetPoi.jumpGateMeta === 'object'
                    ? targetPoi.jumpGateMeta
                    : null
            };
        });
    }

    function activateJumpGateAt(sectorKey, hexId) {
        ensureJumpGateRegistry();
        const record = state.multiSector.sectorsByKey && state.multiSector.sectorsByKey[sectorKey]
            ? state.multiSector.sectorsByKey[sectorKey]
            : null;
        if (!record || !record.deepSpacePois || !record.deepSpacePois[hexId]) return false;
        const poi = record.deepSpacePois[hexId];
        if (!isJumpGatePoi(poi)) return false;
        poi.poiCategory = JUMP_GATE_POI_CATEGORY;
        poi.jumpGateState = 'active';
        ensureJumpGateLinksForRecord(sectorKey, record);
        const pairId = poi.jumpGatePairId;
        const pair = pairId ? state.multiSector.jumpGateRegistry[pairId] : null;
        if (pair) pair.state = 'active';
        ensureInboundJumpGatesForRecord(sectorKey, record);
        if (pair && pair.b && pair.b.sectorKey && state.multiSector.sectorsByKey[pair.b.sectorKey]) {
            ensureInboundJumpGatesForRecord(pair.b.sectorKey, state.multiSector.sectorsByKey[pair.b.sectorKey]);
        }

        // Promotion from inactive -> active should also refresh gate intel/name on both endpoints.
        if (pair && pair.a && pair.b) {
            const defaults = getActiveJumpGateDefaults();
            const aRecord = state.multiSector.sectorsByKey[pair.a.sectorKey];
            const bRecord = state.multiSector.sectorsByKey[pair.b.sectorKey];
            const aPoi = aRecord && aRecord.deepSpacePois ? aRecord.deepSpacePois[pair.a.hexId] : null;
            const bPoi = bRecord && bRecord.deepSpacePois ? bRecord.deepSpacePois[pair.b.hexId] : null;
            if (aPoi) {
                aPoi.poiCategory = JUMP_GATE_POI_CATEGORY;
                aPoi.jumpGateState = 'active';
                aPoi.kind = defaults.kind;
                aPoi.summary = defaults.summary;
                aPoi.risk = defaults.risk;
                aPoi.rewardHint = defaults.rewardHint;
                aPoi.name = normalizeActivatedJumpGateName(aPoi.name) || aPoi.name;
            }
            if (bPoi) {
                bPoi.poiCategory = JUMP_GATE_POI_CATEGORY;
                bPoi.jumpGateState = 'active';
                bPoi.kind = defaults.kind;
                bPoi.summary = defaults.summary;
                bPoi.risk = defaults.risk;
                bPoi.rewardHint = defaults.rewardHint;
                bPoi.name = normalizeActivatedJumpGateName(bPoi.name) || bPoi.name;
            }
            const names = getPairedJumpGateNames(pairId, aPoi, bPoi);
            if (aPoi) aPoi.name = names.aName;
            if (bPoi) bPoi.name = names.bName;
        }
        return true;
    }

    return {
        ensureJumpGateRegistry,
        ensureJumpGateLinksForRecord,
        ensureInboundJumpGatesForRecord,
        isActiveJumpGatePoi,
        activateJumpGateAt
    };
}
