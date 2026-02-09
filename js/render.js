import { HEX_HEIGHT, HEX_SIZE, HEX_WIDTH, STAR_VISUALS, state } from './config.js';
import { hideStarClassInfo, rand } from './core.js';
import { EVENTS, emitEvent } from './events.js';
import { refreshSystemPlanetPopulation } from './planet-population.js';
import { refreshSystemPlanetTags } from './planet-tags.js';
import { ensureSystemStarFields, getSystemStars } from './star-system.js';
import { formatLocalHexDisplayId, getCurrentGridDimensions, getGlobalHexDisplayId, renderRouteOverlay } from './render-shared.js';
import {
    buildCurrentSectorEntry,
    getCurrentSectorKey,
    getHexGroupSelector,
    getLoadedSectorEntries,
    getSectorExtent,
    getSectorWorldCenter,
    getSelectedSectorKey,
    getSingleSectorDimensions,
    isExpandedSectorViewEnabled
} from './render-layout.js';
import {
    ensureStarGradient as ensureStarGradientInternal,
    getDeepSpacePoiPalette,
    getStarMarkerRadius,
    getStarOffsets
} from './render-markers.js';
import { isJumpGatePoi } from './jump-gate-model.js';
import { getFactionById, getFactionControlForHex } from './factions.js';
import { updateSectorNavigationAnchors as updateSectorNavigationAnchorsInternal } from './render-navigation.js';
import {
    applyExpandedSectorSelectionUi,
    handleHexClickAction,
    refreshRouteOverlayAction,
    selectHexAction,
    setupPanZoomAction,
    updateViewTransformAction
} from './render-interaction.js';
import { resetBodyDetailsPanel } from './render-body-details.js';
import { renderSystemBodyLists } from './render-system-bodies.js';
import { configureSystemHeaderAndStar, renderEmptyHexInfo } from './render-system-panels.js';
import {
    disableInhabitControls,
    disablePlanetTypeControls,
    disableStarEditControls,
    setStarSummaryLabel,
    getInfoPanelRefs,
    setBodySummaryLabels,
    setButtonAction,
    setPinButtonContent,
    setPinButtonStyle
} from './info-panel-ui.js';

export function findHexGroup(hexId, sectorKey = getCurrentSectorKey(state)) {
    const selector = getHexGroupSelector(hexId, sectorKey);
    if (!selector) return null;
    return document.querySelector(selector);
}

export function centerViewOnSector(sectorKey) {
    const entries = getLoadedSectorEntries(state);
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

function oddqToCube(col, row) {
    const x = col;
    const z = row - ((col - (col & 1)) / 2);
    const y = -x - z;
    return { x, y, z };
}

function cubeToOddq(cube) {
    const col = cube.x;
    const row = cube.z + ((cube.x - (cube.x & 1)) / 2);
    return { col, row };
}

function getHexNeighbors(col, row, cols, rows) {
    const base = oddqToCube(col, row);
    const directions = [
        { x: 1, y: -1, z: 0 },
        { x: 1, y: 0, z: -1 },
        { x: 0, y: 1, z: -1 },
        { x: -1, y: 1, z: 0 },
        { x: -1, y: 0, z: 1 },
        { x: 0, y: -1, z: 1 }
    ];
    return directions
        .map((dir) => cubeToOddq({
            x: base.x + dir.x,
            y: base.y + dir.y,
            z: base.z + dir.z
        }))
        .filter((next) => next.col >= 0 && next.row >= 0 && next.col < cols && next.row < rows);
}

function getHexCenter(col, row) {
    const yOffset = (col % 2 === 1) ? (HEX_HEIGHT / 2) : 0;
    const x = (col * (HEX_WIDTH * 0.75)) + (HEX_WIDTH / 2);
    const y = (row * HEX_HEIGHT) + yOffset + (HEX_HEIGHT / 2);
    return { x, y };
}

function getHexVertices(col, row) {
    const center = getHexCenter(col, row);
    const points = [];
    for (let i = 0; i < 6; i++) {
        const angleDeg = 60 * i;
        const angleRad = (Math.PI / 180) * angleDeg;
        points.push({
            x: center.x + (HEX_SIZE - 2) * Math.cos(angleRad),
            y: center.y + (HEX_SIZE - 2) * Math.sin(angleRad)
        });
    }
    return points;
}

function findSharedEdgePoints(verticesA, verticesB) {
    const same = [];
    verticesA.forEach((left) => {
        const match = verticesB.find((right) => Math.abs(left.x - right.x) < 0.01 && Math.abs(left.y - right.y) < 0.01);
        if (match) same.push(left);
    });
    return same.length === 2 ? same : null;
}

function shouldRenderConflictBoundary(left, right) {
    if (!left || !right) return false;
    if (!left.ownerFactionId || !right.ownerFactionId) return false;
    return left.ownerFactionId !== right.ownerFactionId;
}

function renderFactionConflictBoundaries(layer, sectorRecord, cols, rows) {
    if (!layer || state.factionOverlayMode !== 'contested') return;
    const factionState = sectorRecord && sectorRecord.factionState ? sectorRecord.factionState : state.factionState;
    if (!factionState || !factionState.controlByHexId) return;

    const controlByHexId = factionState.controlByHexId;
    const drawn = new Set();
    for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
            const hexId = `${col}-${row}`;
            const left = controlByHexId[hexId];
            if (!left) continue;
            const neighbors = getHexNeighbors(col, row, cols, rows);
            neighbors.forEach((neighbor) => {
                const neighborHexId = `${neighbor.col}-${neighbor.row}`;
                const key = [hexId, neighborHexId].sort().join('|');
                if (drawn.has(key)) return;
                drawn.add(key);

                const right = controlByHexId[neighborHexId];
                if (!shouldRenderConflictBoundary(left, right)) return;

                const leftVertices = getHexVertices(col, row);
                const rightVertices = getHexVertices(neighbor.col, neighbor.row);
                const edge = findSharedEdgePoints(leftVertices, rightVertices);
                if (!edge) return;

                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', String(edge[0].x));
                line.setAttribute('y1', String(edge[0].y));
                line.setAttribute('x2', String(edge[1].x));
                line.setAttribute('y2', String(edge[1].y));
                line.setAttribute('stroke', '#fb7185');
                line.setAttribute('stroke-width', '1.45');
                line.setAttribute('stroke-dasharray', '2.5 2');
                line.setAttribute('stroke-linecap', 'round');
                line.setAttribute('class', 'faction-conflict-boundary');
                line.setAttribute('pointer-events', 'none');
                layer.appendChild(line);
            });
        }
    }
}

function createHexGroup(svg, col, row, sectorKey, sectorRecord = null) {
    const hexId = `${col}-${row}`;
    const normalizedSectorKey = String(sectorKey || getCurrentSectorKey(state)).trim().toUpperCase();
    const scopedSectors = sectorRecord && sectorRecord.sectors ? sectorRecord.sectors : state.sectors;
    const scopedPois = sectorRecord && sectorRecord.deepSpacePois ? sectorRecord.deepSpacePois : state.deepSpacePois;
    const scopedPinned = sectorRecord && Array.isArray(sectorRecord.pinnedHexIds) ? sectorRecord.pinnedHexIds : state.pinnedHexIds;
    const scopedFactionState = sectorRecord && sectorRecord.factionState ? sectorRecord.factionState : state.factionState;
    const scopedCoreSystemHexId = sectorRecord && typeof sectorRecord.coreSystemHexId === 'string'
        ? sectorRecord.coreSystemHexId
        : state.coreSystemHexId;
    const system = scopedSectors && scopedSectors[hexId] ? scopedSectors[hexId] : null;
    const deepSpacePoi = !system && scopedPois ? scopedPois[hexId] : null;
    const yOffset = (col % 2 === 1) ? (HEX_HEIGHT / 2) : 0;
    const x = (col * (HEX_WIDTH * 0.75)) + (HEX_WIDTH / 2);
    const y = (row * HEX_HEIGHT) + yOffset + (HEX_HEIGHT / 2);

    const hasPinTarget = !!system || !!deepSpacePoi;
    const isPinned = !!(hasPinTarget && scopedPinned && scopedPinned.includes(hexId));
    const isCoreSystem = !!(system && scopedCoreSystemHexId === hexId);
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
    if (scopedFactionState && state.factionOverlayMode !== 'off') {
        const control = getFactionControlForHex(scopedFactionState, hexId);
        const owner = control && control.ownerFactionId ? getFactionById(scopedFactionState, control.ownerFactionId) : null;
        const isContested = !!(control && Array.isArray(control.contestedFactionIds) && control.contestedFactionIds.length);
        if (state.factionOverlayMode === 'ownership' && owner && owner.color) {
            poly.setAttribute('fill', owner.color);
            const maxOpacity = system ? 0.45 : (deepSpacePoi ? 0.36 : 0.26);
            const minOpacity = system ? 0.18 : (deepSpacePoi ? 0.14 : 0.1);
            const baseOpacity = control && Number.isFinite(Number(control.controlStrength))
                ? Math.max(minOpacity, Math.min(maxOpacity, Number(control.controlStrength) / 240))
                : minOpacity;
            poly.setAttribute('fill-opacity', String(baseOpacity));
        } else if (state.factionOverlayMode === 'contested') {
            if (isContested) {
                poly.setAttribute('fill', owner && owner.color ? owner.color : '#be123c');
                poly.setAttribute('fill-opacity', '0.22');
                poly.setAttribute('stroke', '#fb7185');
                poly.setAttribute('stroke-width', '1.5');
                poly.setAttribute('stroke-dasharray', '2.5 2');
            } else {
                poly.setAttribute('fill-opacity', '0.14');
            }
        }
    }
    g.appendChild(poly);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x);
    text.setAttribute('y', y + HEX_SIZE * 0.72);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('class', `hex-text${isCoreSystem ? ' hex-text-core' : ''}`);
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
        if (isCoreSystem) {
            const coreMarker = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            const markerY = y + Math.max(8, baseRadius + 6);
            coreMarker.setAttribute('points', `${x},${markerY - 4} ${x + 4},${markerY} ${x},${markerY + 4} ${x - 4},${markerY}`);
            coreMarker.setAttribute('fill', '#fde047');
            coreMarker.setAttribute('stroke', '#f59e0b');
            coreMarker.setAttribute('stroke-width', '0.9');
            coreMarker.setAttribute('class', 'core-system-marker');
            coreMarker.style.filter = 'drop-shadow(0 0 5px rgba(245, 158, 11, 0.8))';
            g.appendChild(coreMarker);
        }
    }
    if (deepSpacePoi) {
        const palette = getDeepSpacePoiPalette(deepSpacePoi.kind, deepSpacePoi);
        if (isJumpGatePoi(deepSpacePoi)) {
            const isActiveGate = deepSpacePoi.jumpGateState === 'active';
            const stateClass = isActiveGate ? 'jump-gate-poi-active' : 'jump-gate-poi-inactive';
            const outer = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            outer.setAttribute('cx', x);
            outer.setAttribute('cy', y);
            outer.setAttribute('r', '6');
            outer.setAttribute('fill', 'none');
            outer.setAttribute('stroke', palette.stroke);
            outer.setAttribute('stroke-width', '1.2');
            outer.setAttribute('class', `deep-space-poi-marker jump-gate-poi-marker ${stateClass}`);
            if (!isActiveGate) {
                outer.setAttribute('stroke-dasharray', '1.8 1.8');
            }
            outer.style.filter = `drop-shadow(0 0 5px ${palette.glow})`;
            g.appendChild(outer);

            const core = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            core.setAttribute('cx', x);
            core.setAttribute('cy', y);
            core.setAttribute('r', '2.2');
            core.setAttribute('fill', palette.fill);
            core.setAttribute('stroke', palette.stroke);
            core.setAttribute('stroke-width', '0.8');
            core.setAttribute('class', `deep-space-poi-marker jump-gate-poi-marker-core ${stateClass}`);
            core.style.filter = `drop-shadow(0 0 5px ${palette.glow})`;
            g.appendChild(core);

            if (!isActiveGate) {
                const strike = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                strike.setAttribute('x1', String(x - 4.5));
                strike.setAttribute('y1', String(y + 4.5));
                strike.setAttribute('x2', String(x + 4.5));
                strike.setAttribute('y2', String(y - 4.5));
                strike.setAttribute('stroke', palette.stroke);
                strike.setAttribute('stroke-width', '1');
                strike.setAttribute('class', 'deep-space-poi-marker jump-gate-poi-marker-strike jump-gate-poi-inactive');
                strike.style.filter = `drop-shadow(0 0 4px ${palette.glow})`;
                g.appendChild(strike);
            }
        } else {
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            marker.setAttribute('points', `${x},${y - 6} ${x + 5},${y} ${x},${y + 6} ${x - 5},${y}`);
            marker.setAttribute('fill', palette.fill);
            marker.setAttribute('stroke', palette.stroke);
            marker.setAttribute('stroke-width', '1');
            marker.setAttribute('class', 'deep-space-poi-marker');
            marker.style.filter = `drop-shadow(0 0 4px ${palette.glow})`;
            g.appendChild(marker);
        }
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

    const currentSectorKey = getCurrentSectorKey(state);
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
    return ensureStarGradientInternal(svg, starClass, STAR_VISUALS);
}

export function drawGrid(cols, rows, options = {}) {
    const svg = document.getElementById('hexGrid');
    const resetView = options.resetView !== false;
    const isExpanded = isExpandedSectorViewEnabled(state);
    const single = getSingleSectorDimensions(cols, rows);
    const currentEntry = buildCurrentSectorEntry(state);
    const sectorEntries = isExpanded
        ? getLoadedSectorEntries(state)
        : [currentEntry];
    if (isExpanded && !sectorEntries.length) {
        sectorEntries.push(currentEntry);
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

    const currentKey = getCurrentSectorKey(state);
    const selectedKey = getSelectedSectorKey(state);
    let currentSectorLayer = null;
    sectorEntries.forEach((entry) => {
        const isSelectedSector = !!selectedKey && entry.sectorKey === selectedKey;
        const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        layer.setAttribute('class', `sector-layer${isSelectedSector ? ' current-sector-layer' : ''}`);
        layer.setAttribute('data-sector-key', entry.sectorKey);
        if (isExpanded) {
            const frame = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            frame.setAttribute('x', '-3');
            frame.setAttribute('y', '-3');
            frame.setAttribute('width', String(single.width + 6));
            frame.setAttribute('height', String(single.height + 6));
            frame.setAttribute('rx', '8');
            frame.setAttribute('ry', '8');
            frame.setAttribute('fill', 'none');
            frame.setAttribute('pointer-events', 'none');
            frame.setAttribute('class', `sector-frame${isSelectedSector ? ' sector-frame-selected' : ''}`);
            layer.appendChild(frame);

            const hitbox = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            hitbox.setAttribute('x', '0');
            hitbox.setAttribute('y', '0');
            hitbox.setAttribute('width', String(single.width));
            hitbox.setAttribute('height', String(single.height));
            hitbox.setAttribute('fill', 'transparent');
            hitbox.setAttribute('pointer-events', 'all');
            layer.appendChild(hitbox);

            layer.addEventListener('click', (event) => {
                const target = event.target instanceof Element ? event.target : null;
                const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
                const isHexClick = path.some((node) => node instanceof Element && node.classList && node.classList.contains('hex-group'))
                    || (target && target.closest('.hex-group'));
                if (isHexClick) return;
                event.stopPropagation();
                if (!state.multiSector) return;
                if (state.multiSector.selectedSectorKey === entry.sectorKey) return;
                state.multiSector.selectedSectorKey = entry.sectorKey;
                applyExpandedSectorSelectionUi(entry.sectorKey);
            });
            layer.addEventListener('mouseenter', () => {
                if (layer.classList.contains('current-sector-layer')) return;
                frame.classList.add('sector-frame-hover');
            });
            layer.addEventListener('mouseleave', () => {
                frame.classList.remove('sector-frame-hover');
            });
        }

        const offsetX = (entry.coord.x - extent.minX) * extent.stepX;
        const offsetY = (entry.coord.y - extent.minY) * extent.stepY;
        layer.setAttribute('transform', `translate(${offsetX}, ${offsetY})`);

        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                const g = createHexGroup(svg, c, r, entry.sectorKey, entry.record);
                layer.appendChild(g);
            }
        }
        renderFactionConflictBoundaries(layer, entry.record, cols, rows);

        viewport.appendChild(layer);
        if (entry.sectorKey === currentKey) currentSectorLayer = layer;
    });

    renderRouteOverlay(currentSectorLayer || viewport);
    updateSectorNavigationAnchors(cols, rows);
}

export function calculateHexPoints(cx, cy, size) {
    const points = [];
    for (let i = 0; i < 6; i++) {
        const angleDeg = 60 * i;
        const angleRad = (Math.PI / 180) * angleDeg;
        points.push(`${cx + size * Math.cos(angleRad)},${cy + size * Math.sin(angleRad)}`);
    }
    return points.join(' ');
}

function updateSectorNavigationAnchors(cols, rows) {
    updateSectorNavigationAnchorsInternal({
        state,
        cols,
        rows,
        getCurrentSectorKey: () => getCurrentSectorKey(state),
        isExpandedSectorViewEnabled: () => isExpandedSectorViewEnabled(state),
        getLoadedSectorEntries: () => getLoadedSectorEntries(state),
        getSingleSectorDimensions,
        getSectorExtent,
        emitEvent
    });
}

export function setupPanZoom() {
    const container = document.getElementById('mapContainer');
    if (!container) return;
    setupPanZoomAction({
        state,
        container,
        updateViewTransform,
        clearInfoPanel,
        isExpandedSectorViewEnabled: () => isExpandedSectorViewEnabled(state),
        getCurrentGridDimensions,
        drawGrid,
        emitEvent,
        events: EVENTS
    });
}

export function updateViewTransform() {
    updateViewTransformAction({
        state,
        updateSectorNavigationAnchors
    });
}

export function refreshRouteOverlay() {
    refreshRouteOverlayAction({
        getCurrentSectorKey: () => getCurrentSectorKey(state),
        renderRouteOverlay
    });
}

export function handleHexClick(e, id, groupElement, sectorKey = getCurrentSectorKey(state)) {
    if (groupElement && sectorKey) groupElement.setAttribute('data-sector-key', String(sectorKey).trim().toUpperCase());
    handleHexClickAction(e, id, groupElement, {
        state,
        isExpandedSectorViewEnabled: () => isExpandedSectorViewEnabled(state),
        getCurrentSectorKey: () => getCurrentSectorKey(state),
        emitEvent,
        events: EVENTS,
        selectHex
    });
}

export function selectHex(id, groupElement) {
    selectHexAction(id, groupElement, {
        state,
        updateInfoPanel,
        emitEvent,
        events: EVENTS
    });
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
    if (refs.topActionBar) refs.topActionBar.classList.add('hidden');
    if (refs.selectedSystemPinState) refs.selectedSystemPinState.classList.add('hidden');

    if (refs.starClassLabel) {
        refs.starClassLabel.innerText = 'Class --';
        refs.starClassLabel.classList.remove('cursor-help', 'text-slate-400', 'star-class-hint');
    }

    if (refs.starAgeLabel) refs.starAgeLabel.innerText = 'Age: --';
    setStarSummaryLabel(refs, 0);
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
    if (refs.setCoreSystemBtn) {
        refs.setCoreSystemBtn.disabled = true;
        refs.setCoreSystemBtn.title = 'Set core system';
        refs.setCoreSystemBtn.setAttribute('aria-label', 'Set core system');
        refs.setCoreSystemBtn.className = 'w-8 h-8 inline-flex items-center justify-center text-sm rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-slate-900/50 border-slate-700 text-slate-500';
    }
    if (refs.hexCoreBadge) {
        refs.hexCoreBadge.classList.add('hidden');
        refs.hexCoreBadge.title = '';
        refs.hexCoreBadge.setAttribute('aria-label', '');
    }
    if (refs.selectedSystemPinState) refs.selectedSystemPinState.innerText = 'Pinned: --';
    if (refs.factionCard) refs.factionCard.classList.add('hidden');

    resetBodyDetailsPanel();
}
