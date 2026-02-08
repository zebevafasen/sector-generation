import { HEX_HEIGHT, HEX_SIZE, HEX_WIDTH, STAR_VISUALS, state } from './config.js';
import { hideStarClassInfo, rand } from './core.js';
import { EVENTS, emitEvent } from './events.js';
import { refreshSystemPlanetPopulation } from './planet-population.js';
import { refreshSystemPlanetTags } from './planet-tags.js';
import { ensureSystemStarFields, getSystemStars } from './star-system.js';
import { countSystemBodies } from './body-classification.js';
import { formatLocalHexDisplayId, getCurrentGridDimensions, getGlobalHexDisplayId, renderRouteOverlay } from './render-shared.js';
import { parseSectorKeyToCoords } from './sector-address.js';
import { resetBodyDetailsPanel } from './render-body-details.js';
import { renderSystemBodyLists } from './render-system-bodies.js';
import { configureSystemHeaderAndStar, renderEmptyHexInfo } from './render-system-panels.js';
import {
    disableInhabitControls,
    disablePlanetTypeControls,
    disableStarEditControls,
    getInfoPanelRefs,
    setBodySummaryLabels,
    setButtonAction,
    setPinButtonContent,
    setPinButtonStyle
} from './info-panel-ui.js';

const STAR_GRADIENT_CACHE = {};
const SECTOR_GAP_PX = 56;

function getCurrentSectorKey() {
    return state.multiSector && state.multiSector.currentKey ? state.multiSector.currentKey : '';
}

function isExpandedSectorViewEnabled() {
    return !!(state.multiSector && state.multiSector.expandedView);
}

function getHexGroupSelector(hexId, sectorKey = getCurrentSectorKey()) {
    if (!hexId) return '';
    const normalizedSectorKey = String(sectorKey || '').trim().toUpperCase();
    return `.hex-group[data-id="${hexId}"][data-sector-key="${normalizedSectorKey}"]`;
}

export function findHexGroup(hexId, sectorKey = getCurrentSectorKey()) {
    const selector = getHexGroupSelector(hexId, sectorKey);
    if (!selector) return null;
    return document.querySelector(selector);
}

function getSingleSectorDimensions(cols, rows) {
    return {
        width: cols * HEX_WIDTH + (HEX_WIDTH * 0.5),
        height: rows * (HEX_HEIGHT * 0.75) + (HEX_HEIGHT * 0.25)
    };
}

function getLoadedSectorEntries() {
    const loaded = state.multiSector && state.multiSector.sectorsByKey && typeof state.multiSector.sectorsByKey === 'object'
        ? state.multiSector.sectorsByKey
        : {};
    return Object.entries(loaded)
        .map(([sectorKey, record]) => ({
            sectorKey: String(sectorKey || '').trim().toUpperCase(),
            record,
            coord: parseSectorKeyToCoords(sectorKey)
        }))
        .filter((entry) => entry.record && entry.coord && Number.isInteger(entry.coord.x) && Number.isInteger(entry.coord.y));
}

function getSectorExtent(sectorEntries, cols, rows) {
    const single = getSingleSectorDimensions(cols, rows);
    if (!sectorEntries.length) {
        return {
            minX: 0,
            maxX: 0,
            minY: 0,
            maxY: 0,
            stepX: single.width + SECTOR_GAP_PX,
            stepY: single.height + SECTOR_GAP_PX,
            worldWidth: single.width,
            worldHeight: single.height
        };
    }

    const minX = Math.min(...sectorEntries.map((entry) => entry.coord.x));
    const maxX = Math.max(...sectorEntries.map((entry) => entry.coord.x));
    const minY = Math.min(...sectorEntries.map((entry) => entry.coord.y));
    const maxY = Math.max(...sectorEntries.map((entry) => entry.coord.y));
    const stepX = single.width + SECTOR_GAP_PX;
    const stepY = single.height + SECTOR_GAP_PX;
    return {
        minX,
        maxX,
        minY,
        maxY,
        stepX,
        stepY,
        worldWidth: ((maxX - minX) * stepX) + single.width,
        worldHeight: ((maxY - minY) * stepY) + single.height
    };
}

function getSectorWorldCenter(entry, extent, singleDimensions) {
    return {
        x: ((entry.coord.x - extent.minX) * extent.stepX) + (singleDimensions.width / 2),
        y: ((entry.coord.y - extent.minY) * extent.stepY) + (singleDimensions.height / 2)
    };
}

export function getClosestSectorKeyToViewportCenter() {
    const entries = getLoadedSectorEntries();
    if (!entries.length) return getCurrentSectorKey();

    const mapContainer = document.getElementById('mapContainer');
    if (!mapContainer) return getCurrentSectorKey();

    const { width, height } = getCurrentGridDimensions();
    const single = getSingleSectorDimensions(width, height);
    const extent = getSectorExtent(entries, width, height);
    const scale = Number.isFinite(state.viewState.scale) && state.viewState.scale > 0 ? state.viewState.scale : 1;
    const centerWorldX = ((mapContainer.clientWidth / 2) - state.viewState.x) / scale;
    const centerWorldY = ((mapContainer.clientHeight / 2) - state.viewState.y) / scale;

    let bestSectorKey = entries[0].sectorKey;
    let bestDistance = Number.POSITIVE_INFINITY;
    entries.forEach((entry) => {
        const center = getSectorWorldCenter(entry, extent, single);
        const dx = center.x - centerWorldX;
        const dy = center.y - centerWorldY;
        const distance = (dx * dx) + (dy * dy);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestSectorKey = entry.sectorKey;
        }
    });
    return bestSectorKey;
}

export function centerViewOnSector(sectorKey) {
    const entries = getLoadedSectorEntries();
    if (!entries.length) return;

    const mapContainer = document.getElementById('mapContainer');
    if (!mapContainer) return;

    const normalizedSectorKey = String(sectorKey || '').trim().toUpperCase();
    const target = entries.find((entry) => entry.sectorKey === normalizedSectorKey) || entries[0];
    const { width, height } = getCurrentGridDimensions();
    const single = getSingleSectorDimensions(width, height);
    const extent = getSectorExtent(entries, width, height);
    const center = getSectorWorldCenter(target, extent, single);
    const scale = Number.isFinite(state.viewState.scale) && state.viewState.scale > 0 ? state.viewState.scale : 1;

    state.viewState.x = (mapContainer.clientWidth / 2) - (center.x * scale);
    state.viewState.y = (mapContainer.clientHeight / 2) - (center.y * scale);
    updateViewTransform();
}

function getDeepSpacePoiPalette(kind) {
    switch (String(kind || '').toLowerCase()) {
    case 'hazard':
        return { fill: '#fb7185', stroke: '#fecdd3', glow: 'rgba(251,113,133,0.75)' };
    case 'navigation':
        return { fill: '#22d3ee', stroke: '#a5f3fc', glow: 'rgba(34,211,238,0.75)' };
    case 'opportunity':
        return { fill: '#34d399', stroke: '#a7f3d0', glow: 'rgba(52,211,153,0.75)' };
    case 'mystery':
        return { fill: '#a78bfa', stroke: '#ddd6fe', glow: 'rgba(167,139,250,0.75)' };
    default:
        return { fill: '#94a3b8', stroke: '#e2e8f0', glow: 'rgba(148,163,184,0.7)' };
    }
}

function getStarMarkerRadius(starClass) {
    if (starClass === 'M' || starClass === 'Neutron') return 4;
    if (starClass === 'O' || starClass === 'B') return 9;
    if (starClass === 'Black Hole') return 5;
    return 6;
}

function getStarOffsets(starCount, radius) {
    const spread = radius + 4;
    if (starCount === 2) return [{ dx: -spread * 0.6, dy: 0 }, { dx: spread * 0.6, dy: 0 }];
    if (starCount >= 3) {
        return [
            { dx: 0, dy: -spread * 0.75 },
            { dx: -spread * 0.75, dy: spread * 0.55 },
            { dx: spread * 0.75, dy: spread * 0.55 }
        ];
    }
    return [{ dx: 0, dy: 0 }];
}

function notifySectorDataChanged(label = 'Edit Sector') {
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label });
}

function redrawAndReselect(hexId, preselectedBodyIndex = null) {
    redrawHex(hexId);
    const selectedGroup = findHexGroup(hexId);
    if (!selectedGroup) return;
    selectHex(hexId, selectedGroup);
    if (Number.isInteger(preselectedBodyIndex) && preselectedBodyIndex >= 0) {
        updateInfoPanel(hexId, preselectedBodyIndex);
    }
}

function createHexGroup(svg, col, row, sectorKey, sectorRecord = null) {
    const hexId = `${col}-${row}`;
    const normalizedSectorKey = String(sectorKey || getCurrentSectorKey()).trim().toUpperCase();
    const scopedSectors = sectorRecord && sectorRecord.sectors ? sectorRecord.sectors : state.sectors;
    const scopedPois = sectorRecord && sectorRecord.deepSpacePois ? sectorRecord.deepSpacePois : state.deepSpacePois;
    const scopedPinned = sectorRecord && Array.isArray(sectorRecord.pinnedHexIds) ? sectorRecord.pinnedHexIds : state.pinnedHexIds;
    const system = scopedSectors && scopedSectors[hexId] ? scopedSectors[hexId] : null;
    const deepSpacePoi = !system && scopedPois ? scopedPois[hexId] : null;
    const xOffset = (row % 2 === 1) ? (HEX_WIDTH / 2) : 0;
    const x = (col * HEX_WIDTH) + xOffset + (HEX_WIDTH / 2);
    const y = (row * (HEX_HEIGHT * 0.75)) + (HEX_HEIGHT / 2);

    const hasPinTarget = !!system || !!deepSpacePoi;
    const isPinned = !!(hasPinTarget && scopedPinned && scopedPinned.includes(hexId));
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'hex-group');
    if (system) g.classList.add('route-eligible');
    g.setAttribute('data-id', hexId);
    g.setAttribute('data-sector-key', normalizedSectorKey);
    g.onclick = (e) => handleHexClick(e, hexId, g, normalizedSectorKey);

    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', calculateHexPoints(x, y, HEX_SIZE - 2));
    poly.setAttribute('class', 'hex');
    poly.setAttribute('fill', (system || deepSpacePoi) ? '#0f172a' : '#1e293b');
    poly.setAttribute('stroke', '#334155');
    poly.setAttribute('stroke-width', '1');
    if (isPinned) poly.classList.add('pinned');
    g.appendChild(poly);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x);
    text.setAttribute('y', y + HEX_SIZE / 1.5);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'hex-text');
    text.textContent = formatLocalHexDisplayId(hexId);
    g.appendChild(text);

    if (system) {
        ensureSystemStarFields(system);
        const stars = getSystemStars(system);
        const primary = stars[0];
        const baseRadius = getStarMarkerRadius(primary.class);
        const offsets = getStarOffsets(stars.length, baseRadius);

        stars.forEach((star, index) => {
            const gradientId = ensureStarGradient(svg, star.class);
            const offset = offsets[index] || offsets[0];
            const cx = x + offset.dx;
            const cy = y + offset.dy;
            const rSize = Math.max(3, Math.round(getStarMarkerRadius(star.class) * (index === 0 ? 1 : 0.78)));
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', String(cx));
            circle.setAttribute('cy', String(cy));
            circle.setAttribute('r', String(rSize));
            circle.setAttribute('fill', `url(#${gradientId})`);
            circle.setAttribute('class', 'star-circle');
            if (star.class === 'Black Hole') {
                circle.setAttribute('stroke', 'white');
                circle.setAttribute('stroke-width', '1');
            }
            circle.style.filter = `drop-shadow(0 0 8px ${star.glow || star.color})`;
            g.appendChild(circle);
        });

        if (isPinned) {
            const pinRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            pinRing.setAttribute('cx', x);
            pinRing.setAttribute('cy', y);
            pinRing.setAttribute('r', String(baseRadius + (stars.length > 1 ? 8 : 4)));
            pinRing.setAttribute('fill', 'none');
            pinRing.setAttribute('stroke', '#2dd4bf');
            pinRing.setAttribute('stroke-width', '1.4');
            pinRing.setAttribute('stroke-dasharray', '2 2');
            pinRing.setAttribute('class', 'star-circle');
            g.appendChild(pinRing);
        }
    }
    if (deepSpacePoi) {
        const palette = getDeepSpacePoiPalette(deepSpacePoi.kind);
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        marker.setAttribute('points', `${x},${y - 6} ${x + 5},${y} ${x},${y + 6} ${x - 5},${y}`);
        marker.setAttribute('fill', palette.fill);
        marker.setAttribute('stroke', palette.stroke);
        marker.setAttribute('stroke-width', '1');
        marker.setAttribute('class', 'deep-space-poi-marker');
        marker.style.filter = `drop-shadow(0 0 4px ${palette.glow})`;
        g.appendChild(marker);
    }

    return g;
}

export function redrawHex(hexId) {
    const svg = document.getElementById('hexGrid');
    const viewport = document.getElementById('mapViewport');
    if (!svg || !viewport || !hexId) return null;

    const [colRaw, rowRaw] = String(hexId).split('-');
    const col = parseInt(colRaw, 10);
    const row = parseInt(rowRaw, 10);
    if (!Number.isInteger(col) || !Number.isInteger(row)) return null;

    const currentSectorKey = getCurrentSectorKey();
    const nextGroup = createHexGroup(svg, col, row, currentSectorKey);
    const existing = viewport.querySelector(getHexGroupSelector(hexId, currentSectorKey));
    if (!existing) return null;
    const parent = existing.parentNode;
    if (!parent) return null;
    parent.replaceChild(nextGroup, existing);

    if (state.selectedHexId === hexId) {
        const poly = nextGroup.querySelector('polygon.hex');
        if (poly) poly.classList.add('selected');
    }
    return nextGroup;
}
export function ensureStarGradient(svg, starClass) {
    const key = (starClass || 'default').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (STAR_GRADIENT_CACHE[key]) return STAR_GRADIENT_CACHE[key];

    let defs = svg.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.insertBefore(defs, svg.firstChild);
    }

    const gradientId = `starGradient-${key}`;
    let gradient = document.getElementById(gradientId);
    if (!gradient) {
        gradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
        gradient.setAttribute('id', gradientId);
        gradient.setAttribute('cx', '50%');
        gradient.setAttribute('cy', '50%');
        gradient.setAttribute('r', '50%');

        const palette = STAR_VISUALS[starClass] || STAR_VISUALS.default;
        const stops = [
            { offset: '0%', color: palette.core },
            { offset: '55%', color: palette.mid },
            { offset: '100%', color: palette.halo }
        ];

        stops.forEach(stopData => {
            const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stop.setAttribute('offset', stopData.offset);
            stop.setAttribute('stop-color', stopData.color);
            gradient.appendChild(stop);
        });

        defs.appendChild(gradient);
    }

    STAR_GRADIENT_CACHE[key] = gradientId;
    return gradientId;
}

export function drawGrid(cols, rows, options = {}) {
    const svg = document.getElementById('hexGrid');
    const resetView = options.resetView !== false;
    const isExpanded = isExpandedSectorViewEnabled();
    const single = getSingleSectorDimensions(cols, rows);
    const sectorEntries = isExpanded
        ? getLoadedSectorEntries()
        : [{
            sectorKey: getCurrentSectorKey(),
            record: {
                sectors: state.sectors,
                deepSpacePois: state.deepSpacePois,
                pinnedHexIds: state.pinnedHexIds
            },
            coord: parseSectorKeyToCoords(getCurrentSectorKey())
        }];
    if (isExpanded && !sectorEntries.length) {
        sectorEntries.push({
            sectorKey: getCurrentSectorKey(),
            record: {
                sectors: state.sectors,
                deepSpacePois: state.deepSpacePois,
                pinnedHexIds: state.pinnedHexIds
            },
            coord: parseSectorKeyToCoords(getCurrentSectorKey())
        });
    }
    const extent = getSectorExtent(sectorEntries, cols, rows);
    const realWidth = extent.worldWidth;
    const realHeight = extent.worldHeight;

    let viewport = document.getElementById('mapViewport');
    if (!viewport) {
        viewport = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        viewport.setAttribute('id', 'mapViewport');
        svg.appendChild(viewport);
    }
    viewport.innerHTML = '';

    const container = document.getElementById('mapContainer');
    const startX = (container.clientWidth - realWidth) / 2;
    const startY = (container.clientHeight - realHeight) / 2;

    if (resetView) {
        state.viewState = {
            ...state.viewState,
            scale: 1,
            x: startX > 0 ? startX : 20,
            y: startY > 0 ? startY : 20,
            isDragging: false,
            dragDistance: 0
        };
    }
    updateViewTransform();

    const currentKey = getCurrentSectorKey();
    let currentSectorLayer = null;
    sectorEntries.forEach((entry) => {
        const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        layer.setAttribute('class', `sector-layer${entry.sectorKey === currentKey ? ' current-sector-layer' : ''}`);
        layer.setAttribute('data-sector-key', entry.sectorKey);

        const offsetX = (entry.coord.x - extent.minX) * extent.stepX;
        const offsetY = (entry.coord.y - extent.minY) * extent.stepY;
        layer.setAttribute('transform', `translate(${offsetX}, ${offsetY})`);

        if (isExpanded) {
            const frame = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            frame.setAttribute('x', '-3');
            frame.setAttribute('y', '-3');
            frame.setAttribute('width', String(single.width + 6));
            frame.setAttribute('height', String(single.height + 6));
            frame.setAttribute('rx', '8');
            frame.setAttribute('ry', '8');
            frame.setAttribute('fill', entry.sectorKey === currentKey ? 'rgba(15,23,42,0.34)' : 'rgba(15,23,42,0.2)');
            frame.setAttribute('stroke', entry.sectorKey === currentKey ? '#cbd5e1' : '#64748b');
            frame.setAttribute('stroke-width', entry.sectorKey === currentKey ? '2.1' : '1.15');
            frame.setAttribute('stroke-dasharray', entry.sectorKey === currentKey ? 'none' : '6 4');
            layer.appendChild(frame);

            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', String(single.width / 2));
            label.setAttribute('y', '14');
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('class', 'sector-label');
            if (entry.sectorKey === currentKey) label.classList.add('sector-label-current');
            label.textContent = entry.sectorKey;
            layer.appendChild(label);
        }

        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                const g = createHexGroup(svg, c, r, entry.sectorKey, entry.record);
                layer.appendChild(g);
            }
        }

        viewport.appendChild(layer);
        if (entry.sectorKey === currentKey) currentSectorLayer = layer;
    });

    renderRouteOverlay(currentSectorLayer || viewport);
    updateSectorNavigationAnchors(cols, rows);
}

export function calculateHexPoints(cx, cy, size) {
    const points = [];
    for (let i = 0; i < 6; i++) {
        const angleDeg = 60 * i - 30;
        const angleRad = (Math.PI / 180) * angleDeg;
        points.push(`${cx + size * Math.cos(angleRad)},${cy + size * Math.sin(angleRad)}`);
    }
    return points.join(' ');
}

function updateSectorNavigationAnchors(cols, rows) {
    const northBtn = document.getElementById('sectorNorthBtn');
    const southBtn = document.getElementById('sectorSouthBtn');
    const westBtn = document.getElementById('sectorWestBtn');
    const eastBtn = document.getElementById('sectorEastBtn');
    const mapContainer = document.getElementById('mapContainer');
    if (!northBtn || !southBtn || !westBtn || !eastBtn || !mapContainer) return;

    if (!isExpandedSectorViewEnabled()) {
        [northBtn, southBtn, westBtn, eastBtn].forEach((button) => {
            button.style.left = '';
            button.style.right = '';
            button.style.top = '';
            button.style.bottom = '';
        });
        return;
    }

    const entries = getLoadedSectorEntries();
    const extent = getSectorExtent(entries, cols, rows);
    const rect = mapContainer.getBoundingClientRect();
    const scaledLeft = state.viewState.x;
    const scaledTop = state.viewState.y;
    const scaledWidth = extent.worldWidth * state.viewState.scale;
    const scaledHeight = extent.worldHeight * state.viewState.scale;
    const leftPx = Math.max(12, Math.min(rect.width - 12, scaledLeft));
    const rightPx = Math.max(12, Math.min(rect.width - 12, scaledLeft + scaledWidth));
    const topPx = Math.max(12, Math.min(rect.height - 12, scaledTop));
    const bottomPx = Math.max(12, Math.min(rect.height - 12, scaledTop + scaledHeight));
    const centerX = Math.max(12, Math.min(rect.width - 12, leftPx + ((rightPx - leftPx) / 2)));
    const centerY = Math.max(12, Math.min(rect.height - 12, topPx + ((bottomPx - topPx) / 2)));

    northBtn.style.left = `${centerX}px`;
    northBtn.style.top = `${Math.max(12, topPx - 22)}px`;
    northBtn.style.bottom = '';
    northBtn.style.right = '';

    southBtn.style.left = `${centerX}px`;
    southBtn.style.top = `${Math.min(rect.height - 12, bottomPx + 22)}px`;
    southBtn.style.bottom = '';
    southBtn.style.right = '';

    westBtn.style.left = `${Math.max(12, leftPx - 22)}px`;
    westBtn.style.top = `${centerY}px`;
    westBtn.style.right = '';
    westBtn.style.bottom = '';

    eastBtn.style.left = `${Math.min(rect.width - 12, rightPx + 22)}px`;
    eastBtn.style.top = `${centerY}px`;
    eastBtn.style.right = '';
    eastBtn.style.bottom = '';
}

export function setupPanZoom() {
    const container = document.getElementById('mapContainer');
    const setShiftShortcutCursor = (enabled) => {
        document.body.classList.toggle('route-shortcut-active', enabled);
    };

    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSpeed = 0.001;
        const zoomFactor = Math.exp(-e.deltaY * zoomSpeed);
        const newScale = Math.min(Math.max(state.viewState.scale * zoomFactor, 0.2), 5);

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = (mouseX - state.viewState.x) / state.viewState.scale;
        const worldY = (mouseY - state.viewState.y) / state.viewState.scale;

        state.viewState.x = mouseX - worldX * newScale;
        state.viewState.y = mouseY - worldY * newScale;
        state.viewState.scale = newScale;
        updateViewTransform();
    });

    container.addEventListener('mousedown', (e) => {
        state.viewState.isDragging = true;
        state.viewState.startX = e.clientX;
        state.viewState.startY = e.clientY;
        state.viewState.lastX = state.viewState.x;
        state.viewState.lastY = state.viewState.y;
        state.viewState.dragDistance = 0;
    });

    window.addEventListener('mousemove', (e) => {
        if (!state.viewState.isDragging) return;
        e.preventDefault();

        const dx = e.clientX - state.viewState.startX;
        const dy = e.clientY - state.viewState.startY;

        state.viewState.dragDistance += Math.abs(e.movementX) + Math.abs(e.movementY);
        state.viewState.x = state.viewState.lastX + dx;
        state.viewState.y = state.viewState.lastY + dy;
        updateViewTransform();
    });

    window.addEventListener('mouseup', () => {
        state.viewState.isDragging = false;
    });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Shift') setShiftShortcutCursor(true);
    });
    window.addEventListener('keyup', (e) => {
        if (e.key === 'Shift') setShiftShortcutCursor(false);
    });
    window.addEventListener('blur', () => {
        setShiftShortcutCursor(false);
    });
}

export function updateViewTransform() {
    const viewport = document.getElementById('mapViewport');
    if (viewport) {
        viewport.setAttribute('transform', `translate(${state.viewState.x}, ${state.viewState.y}) scale(${state.viewState.scale})`);
    }
    const snapshot = state.sectorConfigSnapshot || (state.lastSectorSnapshot && state.lastSectorSnapshot.sectorConfigSnapshot) || {};
    const width = parseInt(snapshot.width, 10) || 8;
    const height = parseInt(snapshot.height, 10) || 10;
    updateSectorNavigationAnchors(width, height);
}

export function refreshRouteOverlay() {
    const viewport = document.getElementById('mapViewport');
    if (!viewport) return;
    viewport.querySelectorAll('.route-overlay').forEach((node) => node.remove());
    const currentLayer = viewport.querySelector(`.sector-layer[data-sector-key="${getCurrentSectorKey()}"]`);
    renderRouteOverlay(currentLayer || viewport);
}

export function handleHexClick(e, id, groupElement, sectorKey = getCurrentSectorKey()) {
    if (state.viewState.dragDistance > 5) return;
    const normalizedSectorKey = String(sectorKey || '').trim().toUpperCase();
    const currentSectorKey = getCurrentSectorKey();
    if (isExpandedSectorViewEnabled() && normalizedSectorKey && normalizedSectorKey !== currentSectorKey) {
        emitEvent(EVENTS.REQUEST_SWITCH_SECTOR_HEX, { sectorKey: normalizedSectorKey, hexId: id });
        return;
    }
    if (e.shiftKey) {
        e.preventDefault();
        emitEvent(EVENTS.ROUTE_SHORTCUT_HEX, { hexId: id });
        return;
    }
    if (state.routePlanner && (state.routePlanner.startHexId || state.routePlanner.endHexId)) {
        emitEvent(EVENTS.ROUTE_SHORTCUT_CLEAR, { silent: true });
    }
    selectHex(id, groupElement);
}

export function selectHex(id, groupElement) {
    document.querySelectorAll('.hex.selected').forEach(el => el.classList.remove('selected'));
    const poly = groupElement.querySelector('polygon');
    poly.classList.add('selected');
    state.selectedHexId = id;
    state.selectedBodyIndex = null;
    updateInfoPanel(id);
    emitEvent(EVENTS.HEX_SELECTED, { hexId: id });
}

export function updateInfoPanel(id, preselectedBodyIndex = null) {
    const system = state.sectors[id];
    const deepSpacePoi = !system && state.deepSpacePois ? state.deepSpacePois[id] : null;
    if (system) ensureSystemStarFields(system);
    state.selectedSystemData = system;
    const displayId = getGlobalHexDisplayId(id);

    hideStarClassInfo(true);
    state.starTooltipPinned = false;

    const refs = getInfoPanelRefs();
    const panel = refs.panel;
    panel.classList.remove('opacity-50', 'pointer-events-none');
    panel.classList.add('opacity-100');
    refs.hexId.innerText = displayId;
    if (system) {
        refreshSystemPlanetPopulation(system, { randomFn: rand });
        refreshSystemPlanetTags(system, { randomFn: rand });
        configureSystemHeaderAndStar({
            refs,
            system,
            id,
            preselectedBodyIndex,
            notifySectorDataChanged,
            updateInfoPanel,
            redrawAndReselect
        });
        refs.planetCountLabel.innerText = countSystemBodies(system).planets;
        refs.populationLabel.innerText = system.totalPop;
        renderSystemBodyLists({
            refs,
            system,
            id,
            preselectedBodyIndex,
            notifySectorDataChanged,
            updateInfoPanel
        });
    } else {
        renderEmptyHexInfo({ refs, id, deepSpacePoi });
    }
}

export function clearInfoPanel() {
    const refs = getInfoPanelRefs();
    refs.panel.classList.add('opacity-50', 'pointer-events-none');
    refs.hexId.innerText = '--';
    refs.typeLabel.innerText = 'Scanning...';
    refs.systemDetails.classList.add('hidden');
    refs.emptyDetails.classList.remove('hidden');
    refs.emptyDetails.innerText = 'Select a hex to view data.';
    state.selectedSystemData = null;
    state.selectedBodyIndex = null;

    if (refs.starClassLabel) {
        refs.starClassLabel.innerText = 'Class --';
        refs.starClassLabel.classList.remove('cursor-help', 'text-slate-400', 'star-class-hint');
    }

    if (refs.starAgeLabel) refs.starAgeLabel.innerText = 'Age: --';
    setButtonAction(refs.renameSystemBtn, false);
    setButtonAction(refs.deletePrimaryStarBtn, false);
    if (refs.deletePrimaryStarBtn) refs.deletePrimaryStarBtn.classList.add('hidden');
    setButtonAction(refs.renameBodyBtn, false);
    setButtonAction(refs.quickDeleteBodyBtn, false);
    if (refs.addSystemHereBtn) {
        refs.addSystemHereBtn.classList.add('hidden');
        refs.addSystemHereBtn.onclick = null;
    }
    if (refs.addPoiHereBtn) {
        refs.addPoiHereBtn.classList.add('hidden');
        refs.addPoiHereBtn.onclick = null;
    }
    if (refs.deletePoiHereBtn) {
        refs.deletePoiHereBtn.classList.add('hidden');
        refs.deletePoiHereBtn.onclick = null;
    }
    setBodySummaryLabels(refs, 0, 0, 0);
    disableStarEditControls(refs);
    disablePlanetTypeControls(refs);
    disableInhabitControls(refs);

    if (refs.pinSelectedSystemBtn) {
        refs.pinSelectedSystemBtn.disabled = true;
        setPinButtonContent(refs.pinSelectedSystemBtn, false);
        setPinButtonStyle(refs.pinSelectedSystemBtn, false);
    }
    if (refs.rerollSelectedSystemBtn) refs.rerollSelectedSystemBtn.disabled = true;
    if (refs.selectedSystemPinState) refs.selectedSystemPinState.innerText = 'Pinned: --';

    resetBodyDetailsPanel();
}
