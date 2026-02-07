import { HEX_HEIGHT, HEX_SIZE, HEX_WIDTH, STAR_VISUALS, state } from './config.js';
import { hideStarClassInfo, rand } from './core.js';
import { EVENTS, emitEvent } from './events.js';
import { refreshSystemPlanetPopulation } from './planet-population.js';
import { refreshSystemPlanetTags } from './planet-tags.js';
import { countSystemBodies } from './body-classification.js';
import { getCurrentGridDimensions, getGlobalHexDisplayId, renderRouteOverlay, formatGlobalCoord } from './render-shared.js';
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

function notifySectorDataChanged(label = 'Edit Sector') {
    emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label });
}

function redrawAndReselect(hexId, preselectedBodyIndex = null) {
    const { width, height } = getCurrentGridDimensions();
    drawGrid(width, height, { resetView: false });
    const selectedGroup = document.querySelector(`.hex-group[data-id="${hexId}"]`);
    if (!selectedGroup) return;
    selectHex(hexId, selectedGroup);
    if (Number.isInteger(preselectedBodyIndex) && preselectedBodyIndex >= 0) {
        updateInfoPanel(hexId, preselectedBodyIndex);
    }
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

    const realWidth = cols * HEX_WIDTH + (HEX_WIDTH * 0.5);
    const realHeight = rows * (HEX_HEIGHT * 0.75) + (HEX_HEIGHT * 0.25);

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

    const parseSectorOffset = () => {
        const key = state.multiSector && state.multiSector.currentKey ? state.multiSector.currentKey : '0,0';
        const [xRaw, yRaw] = String(key).split(',');
        const sectorX = parseInt(xRaw, 10);
        const sectorY = parseInt(yRaw, 10);
        return {
            sectorX: Number.isInteger(sectorX) ? sectorX : 0,
            sectorY: Number.isInteger(sectorY) ? sectorY : 0
        };
    };
    const { sectorX, sectorY } = parseSectorOffset();

    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
            const hexId = `${c}-${r}`;
            const system = state.sectors[hexId];
            const xOffset = (r % 2 === 1) ? (HEX_WIDTH / 2) : 0;
            const x = (c * HEX_WIDTH) + xOffset + (HEX_WIDTH / 2);
            const y = (r * (HEX_HEIGHT * 0.75)) + (HEX_HEIGHT / 2);

            const isPinned = !!(system && state.pinnedHexIds && state.pinnedHexIds.includes(hexId));
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('class', 'hex-group');
            if (system) g.classList.add('route-eligible');
            g.setAttribute('data-id', hexId);
            g.onclick = (e) => handleHexClick(e, hexId, g);

            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', calculateHexPoints(x, y, HEX_SIZE - 2));
            poly.setAttribute('class', 'hex');
            poly.setAttribute('fill', system ? '#0f172a' : '#1e293b');
            poly.setAttribute('stroke', '#334155');
            poly.setAttribute('stroke-width', '1');
            if (isPinned) poly.classList.add('pinned');
            g.appendChild(poly);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x);
            text.setAttribute('y', y + HEX_SIZE / 1.5);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('class', 'hex-text');
            const globalC = c + (sectorX * cols);
            const globalR = r + (sectorY * rows);
            text.textContent = `${formatGlobalCoord(globalC)}${formatGlobalCoord(globalR)}`;
            g.appendChild(text);

            if (system) {
                const gradientId = ensureStarGradient(svg, system.starClass);
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', x);
                circle.setAttribute('cy', y);

                let rSize = 6;
                if (system.starClass === 'M' || system.starClass === 'Neutron') rSize = 4;
                if (system.starClass === 'O' || system.starClass === 'B') rSize = 9;
                if (system.starClass === 'Black Hole') {
                    rSize = 5;
                    circle.setAttribute('stroke', 'white');
                    circle.setAttribute('stroke-width', '1');
                }

                circle.setAttribute('r', rSize);
                circle.setAttribute('fill', `url(#${gradientId})`);
                circle.setAttribute('class', 'star-circle');
                circle.style.filter = `drop-shadow(0 0 8px ${system.glow || system.color})`;
                g.appendChild(circle);

                if (isPinned) {
                    const pinRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    pinRing.setAttribute('cx', x);
                    pinRing.setAttribute('cy', y);
                    pinRing.setAttribute('r', String(rSize + 4));
                    pinRing.setAttribute('fill', 'none');
                    pinRing.setAttribute('stroke', '#2dd4bf');
                    pinRing.setAttribute('stroke-width', '1.4');
                    pinRing.setAttribute('stroke-dasharray', '2 2');
                    pinRing.setAttribute('class', 'star-circle');
                    g.appendChild(pinRing);
                }
            }

            viewport.appendChild(g);
        }
    }

    renderRouteOverlay(viewport);
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
}

export function handleHexClick(e, id, groupElement) {
    if (state.viewState.dragDistance > 5) return;
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
        renderEmptyHexInfo({ refs, id });
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
        refs.starClassLabel.classList.remove('cursor-help', 'text-sky-300', 'star-class-hint');
    }

    if (refs.starAgeLabel) refs.starAgeLabel.innerText = 'Age: --';
    setButtonAction(refs.renameSystemBtn, false);
    setButtonAction(refs.renameBodyBtn, false);
    setButtonAction(refs.quickDeleteBodyBtn, false);
    if (refs.addSystemHereBtn) {
        refs.addSystemHereBtn.classList.add('hidden');
        refs.addSystemHereBtn.onclick = null;
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
