import { state } from './config.js';
import { showStatusMessage } from './core.js';
import { EVENTS } from './events.js';
import { refreshRouteOverlay } from './render.js';
import { getGlobalHexDisplayId } from './render-shared.js';
import { isHexCoordInBounds, parseHexId } from './utils.js';
import { computePath, hexDistance } from './route-planner-core.js';

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

function isSystemHex(hexId) {
    return !!(state.sectors && state.sectors[hexId]);
}

function isRefuelingPoiHex(hexId) {
    if (!(state.deepSpacePois && state.deepSpacePois[hexId])) return false;
    const poi = state.deepSpacePois[hexId];
    if (poi.isRefuelingStation) return true;
    const name = String(poi.name || '');
    const kind = String(poi.kind || '');
    return kind.toLowerCase() === 'navigation' && /refueling station/i.test(name);
}

function formatHexForDisplay(hexId) {
    if (!hexId) return '--';
    return getGlobalHexDisplayId(hexId);
}

function updateRouteLabels(refs) {
    const route = state.routePlanner || {};
    if (refs.startLabel) refs.startLabel.innerText = formatHexForDisplay(route.startHexId);
    if (refs.endLabel) refs.endLabel.innerText = formatHexForDisplay(route.endHexId);
    if (refs.hopsLabel) refs.hopsLabel.innerText = String(route.hops || 0);
    const start = parseHexId(route.startHexId);
    const end = parseHexId(route.endHexId);
    const distance = start && end ? hexDistance(start, end) : 0;
    if (refs.distanceLabel) refs.distanceLabel.innerText = String(distance);
    if (refs.pathLabel) {
        refs.pathLabel.innerText = Array.isArray(route.pathHexIds) && route.pathHexIds.length
            ? route.pathHexIds.map(formatHexForDisplay).join(' -> ')
            : '--';
    }
}

function redrawRoute() {
    refreshRouteOverlay();
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
            showStatusMessage(`Route start ${formatHexForDisplay(route.startHexId)}. Select destination.`, 'info', { persist: true });
        }
        if (shouldRedraw) redrawRoute();
        return;
    }

    route.pathHexIds = computePath(route.startHexId, route.endHexId, width, height, {
        parseHexId,
        isHexCoordInBounds,
        isSystemHex,
        isRefuelingPoiHex
    });
    route.hops = route.pathHexIds.length > 1 ? route.pathHexIds.length - 1 : 0;
    updateRouteLabels(refs);
    if (!route.pathHexIds.length) {
        showStatusMessage(`No valid route ${formatHexForDisplay(route.startHexId)} -> ${formatHexForDisplay(route.endHexId)} (max 2 empty hexes before a system or refueling station).`, 'warn', { persist: true });
    } else {
        showStatusMessage(`Route ${formatHexForDisplay(route.startHexId)} -> ${formatHexForDisplay(route.endHexId)}: ${route.hops} hops`, 'success', { persist: true });
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
        showStatusMessage(`Route start ${formatHexForDisplay(hexId)}. Select destination.`, 'info', { persist: true });
        return;
    }

    if (route.startHexId && route.endHexId) {
        route.startHexId = hexId;
        route.endHexId = null;
        recalculateRoute(refs);
        showStatusMessage(`Route start ${formatHexForDisplay(hexId)}. Select destination.`, 'info', { persist: true });
        return;
    }

    route.endHexId = hexId;
    recalculateRoute(refs);
    showStatusMessage(`Route ${formatHexForDisplay(route.startHexId)} -> ${formatHexForDisplay(route.endHexId)}: ${route.hops} hops`, 'success', { persist: true });
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
    recalculateRoute(refs, { redraw: true });
    if (endpointsChanged && !route.startHexId && !route.endHexId) {
        showStatusMessage('Route endpoints were cleared because their systems no longer exist.', 'info');
    }
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
