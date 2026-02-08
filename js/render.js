import { HEX_HEIGHT, HEX_SIZE, HEX_WIDTH, STAR_VISUALS, state } from './config.js';
import { hideStarClassInfo, rand } from './core.js';
import { EVENTS, emitEvent } from './events.js';
import { refreshSystemPlanetPopulation } from './planet-population.js';
import { refreshSystemPlanetTags } from './planet-tags.js';
import { ensureSystemStarFields, getSystemStars } from './star-system.js';
import { countSystemBodies } from './body-classification.js';
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
import { updateSectorNavigationAnchors as updateSectorNavigationAnchorsInternal } from './render-navigation.js';
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

function createHexGroup(svg, col, row, sectorKey, sectorRecord = null) {
    const hexId = `${col}-${row}`;
    const normalizedSectorKey = String(sectorKey || getCurrentSectorKey(state)).trim().toUpperCase();
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
                if (target && target.closest('.hex-group')) return;
                event.stopPropagation();
                if (!state.multiSector) return;
                if (state.multiSector.selectedSectorKey === entry.sectorKey) return;
                state.multiSector.selectedSectorKey = entry.sectorKey;
                drawGrid(cols, rows, { resetView: false });
            });
            if (!isSelectedSector) {
                layer.addEventListener('mouseenter', () => {
                    frame.classList.add('sector-frame-hover');
                });
                layer.addEventListener('mouseleave', () => {
                    frame.classList.remove('sector-frame-hover');
                });
            }
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
    container.addEventListener('click', (e) => {
        if (state.viewState.dragDistance > 5) return;
        const isHexClick = e.target instanceof Element && !!e.target.closest('.hex-group');
        if (isHexClick) return;
        document.querySelectorAll('.hex.selected').forEach(el => el.classList.remove('selected'));
        state.selectedHexId = null;
        state.selectedBodyIndex = null;
        clearInfoPanel();
        if (isExpandedSectorViewEnabled(state) && state.multiSector) {
            state.multiSector.selectedSectorKey = null;
            const { width, height } = getCurrentGridDimensions();
            drawGrid(width, height, { resetView: false });
        }
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
    const currentLayer = viewport.querySelector(`.sector-layer[data-sector-key="${getCurrentSectorKey(state)}"]`);
    renderRouteOverlay(currentLayer || viewport);
}

export function handleHexClick(e, id, groupElement, sectorKey = getCurrentSectorKey(state)) {
    if (state.viewState.dragDistance > 5) return;
    const normalizedSectorKey = String(sectorKey || '').trim().toUpperCase();
    const currentSectorKey = getCurrentSectorKey(state);
    if (isExpandedSectorViewEnabled(state) && normalizedSectorKey && normalizedSectorKey !== currentSectorKey) {
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
    const sectorKey = groupElement && groupElement.getAttribute ? groupElement.getAttribute('data-sector-key') : null;
    if (sectorKey && state.multiSector) state.multiSector.selectedSectorKey = sectorKey;
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
