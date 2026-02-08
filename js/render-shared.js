import { HEX_HEIGHT, HEX_WIDTH, MAX_GRID_DIMENSION, MIN_GRID_DIMENSION, state } from './config.js';
import { HOME_SECTOR_KEY } from './sector-address.js';

export function getCurrentGridDimensions() {
    const snapshot = state.sectorConfigSnapshot
        || (state.lastSectorSnapshot && state.lastSectorSnapshot.sectorConfigSnapshot)
        || null;
    let width = parseInt(snapshot && snapshot.width, 10);
    let height = parseInt(snapshot && snapshot.height, 10);

    if (!Number.isFinite(width) || width < 1) {
        width = parseInt(document.getElementById('gridWidth')?.value || '8', 10);
    }
    if (!Number.isFinite(height) || height < 1) {
        height = parseInt(document.getElementById('gridHeight')?.value || '10', 10);
    }
    if (!Number.isFinite(width) || width < 1) width = 8;
    if (!Number.isFinite(height) || height < 1) height = 10;
    width = Math.max(MIN_GRID_DIMENSION, Math.min(MAX_GRID_DIMENSION, width));
    height = Math.max(MIN_GRID_DIMENSION, Math.min(MAX_GRID_DIMENSION, height));

    return { width, height };
}

export function getHexCenter(col, row) {
    const yOffset = (col % 2 === 1) ? (HEX_HEIGHT / 2) : 0;
    return {
        x: (col * (HEX_WIDTH * 0.75)) + (HEX_WIDTH / 2),
        y: (row * HEX_HEIGHT) + yOffset + (HEX_HEIGHT / 2)
    };
}

function formatLocalHexCoord(value) {
    const parsed = parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 0) return '--';
    return String(parsed).padStart(2, '0');
}

export function formatLocalHexDisplayId(localHexId) {
    const [cRaw, rRaw] = String(localHexId || '').split('-');
    const c = parseInt(cRaw, 10);
    const r = parseInt(rRaw, 10);
    if (!Number.isInteger(c) || !Number.isInteger(r) || c < 0 || r < 0) return '--';
    return `${formatLocalHexCoord(c)}${formatLocalHexCoord(r)}`;
}

export function getGlobalHexDisplayId(localHexId) {
    const key = state.multiSector && state.multiSector.currentKey ? state.multiSector.currentKey : HOME_SECTOR_KEY;
    return formatFullHexDisplayId(key, localHexId);
}

export function getGlobalHexDisplayIdForSector(sectorKey, localHexId) {
    return formatFullHexDisplayId(sectorKey, localHexId);
}

export function formatFullHexDisplayId(sectorKey, localHexId) {
    const key = String(sectorKey || HOME_SECTOR_KEY).trim().toUpperCase();
    const local = formatLocalHexDisplayId(localHexId);
    if (!/^[A-Z]{4}$/.test(key) || local === '--') return '--';
    return `${key}-${local}`;
}

export function renderRouteOverlay(viewport) {
    const route = state.routePlanner || {};
    const path = Array.isArray(route.pathHexIds) ? route.pathHexIds : [];
    if (path.length < 2) return;

    const centers = path
        .map((hexId) => {
            const [cRaw, rRaw] = String(hexId).split('-');
            const c = parseInt(cRaw, 10);
            const r = parseInt(rRaw, 10);
            if (!Number.isInteger(c) || !Number.isInteger(r)) return null;
            return getHexCenter(c, r);
        })
        .filter(Boolean);

    if (centers.length < 2) return;

    const offsetToward = (from, toward, distancePx) => {
        const dx = toward.x - from.x;
        const dy = toward.y - from.y;
        const length = Math.hypot(dx, dy);
        if (!Number.isFinite(length) || length === 0) return from;
        const scale = Math.min(1, distancePx / length);
        return {
            x: from.x + dx * scale,
            y: from.y + dy * scale
        };
    };

    const offsetPx = 13;
    const startCenter = centers[0];
    const nextCenter = centers[1] || startCenter;
    const endCenter = centers[centers.length - 1];
    const prevCenter = centers[centers.length - 2] || endCenter;
    const startMarkerPos = offsetToward(startCenter, nextCenter, offsetPx);
    const endMarkerPos = offsetToward(endCenter, prevCenter, offsetPx);

    const adjustedLinePoints = centers.map((center, index) => {
        if (index === 0) return `${startMarkerPos.x},${startMarkerPos.y}`;
        if (index === centers.length - 1) return `${endMarkerPos.x},${endMarkerPos.y}`;
        return `${center.x},${center.y}`;
    });

    const pathLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    pathLine.setAttribute('class', 'route-overlay');
    pathLine.setAttribute('points', adjustedLinePoints.join(' '));
    pathLine.setAttribute('fill', 'none');
    pathLine.setAttribute('stroke', '#38bdf8');
    pathLine.setAttribute('stroke-width', '3');
    pathLine.setAttribute('stroke-linecap', 'round');
    pathLine.setAttribute('stroke-linejoin', 'round');
    pathLine.setAttribute('stroke-opacity', '0.9');
    pathLine.style.filter = 'drop-shadow(0 0 4px rgba(56, 189, 248, 0.8))';
    viewport.appendChild(pathLine);

    [
        { pos: startMarkerPos, fill: '#22c55e' },
        { pos: endMarkerPos, fill: '#f43f5e' }
    ].forEach((markerData) => {
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        marker.setAttribute('class', 'route-overlay');
        marker.setAttribute('cx', String(markerData.pos.x));
        marker.setAttribute('cy', String(markerData.pos.y));
        marker.setAttribute('r', '5');
        marker.setAttribute('fill', markerData.fill);
        marker.setAttribute('stroke', '#e2e8f0');
        marker.setAttribute('stroke-width', '1');
        viewport.appendChild(marker);
    });
}
