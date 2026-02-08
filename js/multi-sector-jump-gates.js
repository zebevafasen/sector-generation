import { HOME_SECTOR_KEY, makeSectorKeyFromCoords, parseSectorKeyToCoords } from './sector-address.js';
import { parseHexId, sortHexIds, xmur3, mulberry32 } from './utils.js';

function parseKey(key) {
    return parseSectorKeyToCoords(key || HOME_SECTOR_KEY);
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

function getDeterministicRandom(seedText) {
    const seeded = xmur3(String(seedText || 'jump-gate'))();
    return mulberry32(seeded);
}

function getCanonicalJumpGateProfile(pairId, sourcePoi = null, targetPoi = null) {
    const defaultProfile = {
        kind: 'Navigation',
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
        summary: pickString(preferred.summary, pickString(secondary.summary, defaultProfile.summary)),
        risk: pickString(preferred.risk, pickString(secondary.risk, defaultProfile.risk)),
        rewardHint: pickString(preferred.rewardHint, pickString(secondary.rewardHint, defaultProfile.rewardHint))
    };
}

function getPairedJumpGateNames(pairId, sourcePoi = null, targetPoi = null) {
    const serial = (xmur3(pairId)() % 900) + 100;
    const fallbackA = `Active Jump-Gate ${serial}A`;
    const fallbackB = `Active Jump-Gate ${serial}B`;
    const normalize = (value) => {
        const text = typeof value === 'string' ? value.trim() : '';
        return /^active jump-gate\b/i.test(text) ? text : '';
    };

    let aName = normalize(sourcePoi && sourcePoi.name) || fallbackA;
    let bName = normalize(targetPoi && targetPoi.name) || fallbackB;
    if (aName.toLowerCase() === bName.toLowerCase()) {
        aName = fallbackA;
        bName = fallbackB;
    }
    return { aName, bName };
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
            const profile = getCanonicalJumpGateProfile(pairId, sourcePoi, targetPoi);
            const names = getPairedJumpGateNames(pairId, sourcePoi, targetPoi);

            if (sourcePoi) {
                sourceRecord.deepSpacePois[pair.a.hexId] = {
                    ...sourcePoi,
                    ...profile,
                    name: names.aName,
                    jumpGateState: 'active',
                    jumpGatePairId: pairId,
                    jumpGateLink: {
                        sectorKey: pair.b.sectorKey,
                        hexId: pair.b.hexId
                    }
                };
            }

            record.deepSpacePois[targetHexId] = {
                ...(targetPoi || {}),
                ...profile,
                name: names.bName,
                jumpGateState: 'active',
                jumpGatePairId: pairId,
                jumpGateLink: {
                    sectorKey: pair.a.sectorKey,
                    hexId: pair.a.hexId
                }
            };
        });
    }

    return {
        ensureJumpGateRegistry,
        ensureJumpGateLinksForRecord,
        ensureInboundJumpGatesForRecord,
        isActiveJumpGatePoi
    };
}
