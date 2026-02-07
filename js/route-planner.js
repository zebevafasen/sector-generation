import { state } from './config.js';
import { showStatusMessage } from './core.js';
import { EVENTS } from './events.js';
import { redrawGridAndReselect } from './ui-sync.js';

function getRouteRefs() {
    return {
        pickStartBtn: document.getElementById('routePickStartBtn'),
        pickEndBtn: document.getElementById('routePickEndBtn'),
        swapBtn: document.getElementById('routeSwapBtn'),
        clearBtn: document.getElementById('routeClearBtn'),
        startLabel: document.getElementById('routeStartLabel'),
        endLabel: document.getElementById('routeEndLabel'),
        hopsLabel: document.getElementById('routeHopsLabel'),
        distanceLabel: document.getElementById('routeDistanceLabel'),
        pathLabel: document.getElementById('routePathLabel')
    };
}

function parseHexId(hexId) {
    const [cRaw, rRaw] = String(hexId || '').split('-');
    const col = parseInt(cRaw, 10);
    const row = parseInt(rRaw, 10);
    if (!Number.isInteger(col) || !Number.isInteger(row)) return null;
    return { col, row };
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

function inBounds(col, row, width, height) {
    return col >= 0 && row >= 0 && col < width && row < height;
}

function oddrToCube(col, row) {
    const x = col - ((row - (row & 1)) / 2);
    const z = row;
    const y = -x - z;
    return { x, y, z };
}

function cubeToOddr(cube) {
    const col = cube.x + ((cube.z - (cube.z & 1)) / 2);
    const row = cube.z;
    return { col, row };
}

function cubeDistance(a, b) {
    return Math.max(
        Math.abs(a.x - b.x),
        Math.abs(a.y - b.y),
        Math.abs(a.z - b.z)
    );
}

function hexDistance(a, b) {
    return cubeDistance(oddrToCube(a.col, a.row), oddrToCube(b.col, b.row));
}

function getNeighbors(col, row, width, height) {
    const base = oddrToCube(col, row);
    const directions = [
        { x: 1, y: -1, z: 0 },
        { x: 1, y: 0, z: -1 },
        { x: 0, y: 1, z: -1 },
        { x: -1, y: 1, z: 0 },
        { x: -1, y: 0, z: 1 },
        { x: 0, y: -1, z: 1 }
    ];

    return directions
        .map((dir) => cubeToOddr({
            x: base.x + dir.x,
            y: base.y + dir.y,
            z: base.z + dir.z
        }))
        .filter((next) => inBounds(next.col, next.row, width, height));
}

function reconstructPath(cameFrom, currentKey) {
    const path = [currentKey];
    let cursor = currentKey;
    while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor);
        path.push(cursor);
    }
    path.reverse();
    return path;
}

function makeNodeKey(hexId, emptyStreak) {
    return `${hexId}|${emptyStreak}`;
}

function parseNodeKey(nodeKey) {
    const [hexId, streakRaw] = String(nodeKey).split('|');
    const emptyStreak = parseInt(streakRaw, 10);
    return {
        hexId,
        emptyStreak: Number.isInteger(emptyStreak) ? emptyStreak : 0
    };
}

function isSystemHex(hexId) {
    return !!(state.sectors && state.sectors[hexId]);
}

function computePath(startHexId, endHexId, width, height) {
    if (!startHexId || !endHexId) return [];
    if (startHexId === endHexId) return [startHexId];

    const start = parseHexId(startHexId);
    const end = parseHexId(endHexId);
    if (!start || !end) return [];
    if (!inBounds(start.col, start.row, width, height) || !inBounds(end.col, end.row, width, height)) return [];

    const startHex = `${start.col}-${start.row}`;
    const endHex = `${end.col}-${end.row}`;
    const startKey = makeNodeKey(startHex, 0);
    const openSet = new Set([startKey]);
    const cameFrom = new Map();
    const gScore = new Map([[startKey, 0]]);
    const fScore = new Map([[startKey, hexDistance(start, end)]]);
    let bestEndNode = null;
    let bestEndScore = Number.POSITIVE_INFINITY;

    while (openSet.size) {
        let current = null;
        let best = Number.POSITIVE_INFINITY;
        openSet.forEach((node) => {
            const score = fScore.has(node) ? fScore.get(node) : Number.POSITIVE_INFINITY;
            if (score < best) {
                best = score;
                current = node;
            }
        });

        if (!current) break;
        const currentNode = parseNodeKey(current);
        if (currentNode.hexId === endHex) {
            const currentScore = gScore.get(current) ?? Number.POSITIVE_INFINITY;
            if (currentScore < bestEndScore) {
                bestEndNode = current;
                bestEndScore = currentScore;
            }
        }

        openSet.delete(current);
        const currentParsed = parseHexId(currentNode.hexId);
        if (!currentParsed) continue;

        getNeighbors(currentParsed.col, currentParsed.row, width, height).forEach((neighbor) => {
            const neighborHexId = `${neighbor.col}-${neighbor.row}`;
            const nextStreak = isSystemHex(neighborHexId) ? 0 : currentNode.emptyStreak + 1;
            if (nextStreak > 2) return;

            const neighborKey = makeNodeKey(neighborHexId, nextStreak);
            const tentative = (gScore.get(current) ?? Number.POSITIVE_INFINITY) + 1;
            if (tentative < (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) {
                cameFrom.set(neighborKey, current);
                gScore.set(neighborKey, tentative);
                fScore.set(neighborKey, tentative + hexDistance(neighbor, end));
                openSet.add(neighborKey);
            }
        });
    }

    if (!bestEndNode) return [];
    return reconstructPath(cameFrom, bestEndNode).map((nodeKey) => parseNodeKey(nodeKey).hexId);
}

function updateRouteLabels(refs) {
    const route = state.routePlanner || {};
    if (refs.startLabel) refs.startLabel.innerText = route.startHexId || '--';
    if (refs.endLabel) refs.endLabel.innerText = route.endHexId || '--';
    if (refs.hopsLabel) refs.hopsLabel.innerText = String(route.hops || 0);
    const start = parseHexId(route.startHexId);
    const end = parseHexId(route.endHexId);
    const distance = start && end ? hexDistance(start, end) : 0;
    if (refs.distanceLabel) refs.distanceLabel.innerText = String(distance);
    if (refs.pathLabel) {
        refs.pathLabel.innerText = Array.isArray(route.pathHexIds) && route.pathHexIds.length
            ? route.pathHexIds.join(' -> ')
            : '--';
    }
}

function redrawRoute() {
    const { width, height } = getGridDimensions();
    redrawGridAndReselect(width, height, { selectedHexId: state.selectedHexId });
}

function recalculateRoute(refs, options = {}) {
    const shouldRedraw = options.redraw !== false;
    const { width, height } = getGridDimensions();
    const route = state.routePlanner;
    if (!route.startHexId || !route.endHexId) {
        route.pathHexIds = [];
        route.hops = 0;
        updateRouteLabels(refs);
        if (route.startHexId && !route.endHexId) {
            showStatusMessage(`Route start ${route.startHexId}. Select destination.`, 'info', { persist: true });
        }
        if (shouldRedraw) redrawRoute();
        return;
    }

    route.pathHexIds = computePath(route.startHexId, route.endHexId, width, height);
    route.hops = route.pathHexIds.length > 1 ? route.pathHexIds.length - 1 : 0;
    updateRouteLabels(refs);
    if (!route.pathHexIds.length) {
        showStatusMessage(`No valid route ${route.startHexId} -> ${route.endHexId} (max 2 empty hexes before a system).`, 'warn', { persist: true });
    } else {
        showStatusMessage(`Route ${route.startHexId} -> ${route.endHexId}: ${route.hops} hops`, 'success', { persist: true });
    }
    if (shouldRedraw) redrawRoute();
}

function setEndpoint(kind, hexId, refs) {
    if (!hexId || !state.sectors[hexId]) {
        showStatusMessage('Route endpoints must be populated systems.', 'warn');
        return;
    }
    if (kind === 'start') {
        state.routePlanner.startHexId = hexId;
    } else {
        state.routePlanner.endHexId = hexId;
    }
    state.routePlanner.pickMode = null;
    recalculateRoute(refs);
}

function handleShortcutSelect(hexId, refs) {
    if (!hexId || !state.sectors[hexId]) {
        showStatusMessage('Shortcut route targets must be populated systems.', 'warn');
        return;
    }

    const route = state.routePlanner;
    route.pickMode = null;

    if (!route.startHexId) {
        route.startHexId = hexId;
        recalculateRoute(refs);
        showStatusMessage(`Route start ${hexId}. Select destination.`, 'info', { persist: true });
        return;
    }

    if (route.startHexId && route.endHexId) {
        route.startHexId = hexId;
        route.endHexId = null;
        recalculateRoute(refs);
        showStatusMessage(`Route start ${hexId}. Select destination.`, 'info', { persist: true });
        return;
    }

    route.endHexId = hexId;
    recalculateRoute(refs);
    showStatusMessage(`Route ${route.startHexId} -> ${route.endHexId}: ${route.hops} hops`, 'success', { persist: true });
}

function clearRoute(refs) {
    state.routePlanner.startHexId = null;
    state.routePlanner.endHexId = null;
    state.routePlanner.pathHexIds = [];
    state.routePlanner.hops = 0;
    state.routePlanner.pickMode = null;
    updateRouteLabels(refs);
    showStatusMessage('', 'info', { durationMs: 0 });
    redrawRoute();
}

function sanitizeRouteEndpoints(refs) {
    const route = state.routePlanner;
    const beforeStart = route.startHexId;
    const beforeEnd = route.endHexId;
    if (route.startHexId && !state.sectors[route.startHexId]) route.startHexId = null;
    if (route.endHexId && !state.sectors[route.endHexId]) route.endHexId = null;
    const endpointsChanged = beforeStart !== route.startHexId || beforeEnd !== route.endHexId;
    recalculateRoute(refs, { redraw: endpointsChanged });
}

export function setupRoutePlanner() {
    const refs = getRouteRefs();

    refs.pickStartBtn?.addEventListener('click', () => {
        state.routePlanner.pickMode = 'start';
        showStatusMessage('Click a populated system to set route start.', 'info');
    });
    refs.pickEndBtn?.addEventListener('click', () => {
        state.routePlanner.pickMode = 'end';
        showStatusMessage('Click a populated system to set route destination.', 'info');
    });
    refs.swapBtn?.addEventListener('click', () => {
        const oldStart = state.routePlanner.startHexId;
        state.routePlanner.startHexId = state.routePlanner.endHexId;
        state.routePlanner.endHexId = oldStart;
        recalculateRoute(refs);
    });
    refs.clearBtn?.addEventListener('click', () => {
        clearRoute(refs);
    });

    window.addEventListener(EVENTS.HEX_SELECTED, (event) => {
        const hexId = event && event.detail ? event.detail.hexId : null;
        if (!hexId || !state.routePlanner.pickMode) return;
        setEndpoint(state.routePlanner.pickMode, hexId, refs);
    });
    window.addEventListener(EVENTS.ROUTE_SHORTCUT_HEX, (event) => {
        const hexId = event && event.detail ? event.detail.hexId : null;
        handleShortcutSelect(hexId, refs);
    });
    window.addEventListener(EVENTS.ROUTE_SHORTCUT_CLEAR, () => {
        clearRoute(refs);
    });

    window.addEventListener(EVENTS.SECTOR_DATA_CHANGED, () => {
        sanitizeRouteEndpoints(refs);
    });

    updateRouteLabels(refs);
}
