import { EVENTS } from './events.js';
import { makeSectorKeyFromCoords, parseSectorKeyToCoords } from './sector-address.js';
import { formatSectorLabel } from './sector-naming.js';

function updateSingleSectorNavigation(context) {
    const {
        state,
        cols,
        rows,
        buttons,
        expandedEdgeContainer,
        mapContainer,
        getCurrentSectorKey,
        getSingleSectorDimensions
    } = context;
    expandedEdgeContainer.innerHTML = '';
    const rect = mapContainer.getBoundingClientRect();
    const scale = Number.isFinite(state.viewState.scale) && state.viewState.scale > 0 ? state.viewState.scale : 1;
    const single = getSingleSectorDimensions(cols, rows);
    const leftPx = state.viewState.x;
    const topPx = state.viewState.y;
    const rightPx = leftPx + (single.width * scale);
    const bottomPx = topPx + (single.height * scale);
    const centerX = leftPx + ((rightPx - leftPx) / 2);
    const centerY = topPx + ((bottomPx - topPx) / 2);
    const current = parseSectorKeyToCoords(getCurrentSectorKey());
    const loaded = state.multiSector && state.multiSector.sectorsByKey && typeof state.multiSector.sectorsByKey === 'object'
        ? state.multiSector.sectorsByKey
        : {};
    const directionMeta = [
        { button: buttons.northBtn, key: 'north', dx: 0, dy: -1, rotateDeg: -90, x: centerX, y: topPx - 16 },
        { button: buttons.southBtn, key: 'south', dx: 0, dy: 1, rotateDeg: 90, x: centerX, y: bottomPx + 16 },
        { button: buttons.westBtn, key: 'west', dx: -1, dy: 0, rotateDeg: 180, x: leftPx - 16, y: centerY },
        { button: buttons.eastBtn, key: 'east', dx: 1, dy: 0, rotateDeg: 0, x: rightPx + 16, y: centerY }
    ];

    directionMeta.forEach((item) => {
        const targetKey = makeSectorKeyFromCoords(current.x + item.dx, current.y + item.dy);
        const exists = !!loaded[targetKey];
        const inView = item.x >= 0 && item.x <= rect.width && item.y >= 0 && item.y <= rect.height;
        if (!inView) {
            item.button.classList.add('hidden');
            return;
        }

        item.button.classList.remove('hidden');
        item.button.style.left = `${item.x}px`;
        item.button.style.top = `${item.y}px`;
        item.button.style.right = '';
        item.button.style.bottom = '';
        const symbol = exists ? '>' : '+';
        item.button.style.transform = exists
            ? `translate(-50%, -50%) rotate(${item.rotateDeg}deg)`
            : 'translate(-50%, -50%)';
        item.button.innerText = symbol;
        item.button.title = exists ? `Move ${item.key}` : `Expand ${item.key}`;
        item.button.setAttribute('aria-label', exists ? `Move ${item.key}` : `Expand ${item.key}`);
    });
}

function updateExpandedSectorNavigation(context) {
    const {
        state,
        cols,
        rows,
        buttons,
        expandedEdgeContainer,
        mapContainer,
        getLoadedSectorEntries,
        getSectorExtent,
        getSingleSectorDimensions,
        emitEvent
    } = context;
    [buttons.northBtn, buttons.southBtn, buttons.westBtn, buttons.eastBtn].forEach((button) => {
        button.classList.add('hidden');
    });

    const entries = getLoadedSectorEntries();
    expandedEdgeContainer.innerHTML = '';
    if (!entries.length) return;
    const loadedSet = new Set(entries.map((entry) => entry.sectorKey));
    const extent = getSectorExtent(entries, cols, rows);
    const single = getSingleSectorDimensions(cols, rows);
    const rect = mapContainer.getBoundingClientRect();
    const scale = Number.isFinite(state.viewState.scale) && state.viewState.scale > 0 ? state.viewState.scale : 1;
    const directionMeta = [
        { key: 'north', dx: 0, dy: -1, rotateDeg: -90 },
        { key: 'south', dx: 0, dy: 1, rotateDeg: 90 },
        { key: 'west', dx: -1, dy: 0, rotateDeg: 180 },
        { key: 'east', dx: 1, dy: 0, rotateDeg: 0 }
    ];

    entries.forEach((entry) => {
        const sectorLeftWorld = (entry.coord.x - extent.minX) * extent.stepX;
        const sectorTopWorld = (entry.coord.y - extent.minY) * extent.stepY;
        const leftPx = state.viewState.x + (sectorLeftWorld * scale);
        const topPx = state.viewState.y + (sectorTopWorld * scale);
        const rightPx = leftPx + (single.width * scale);
        const bottomPx = topPx + (single.height * scale);
        const centerX = leftPx + ((rightPx - leftPx) / 2);
        const centerY = topPx + ((bottomPx - topPx) / 2);

        directionMeta.forEach((direction) => {
            const adjacentKey = makeSectorKeyFromCoords(entry.coord.x + direction.dx, entry.coord.y + direction.dy);
            if (loadedSet.has(adjacentKey)) return;

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'expanded-sector-edge-btn';
            button.title = `Generate/load ${direction.key} of ${formatSectorLabel(entry.sectorKey, state.multiSector?.sectorsByKey || {})}`;
            button.setAttribute('aria-label', button.title);
            button.textContent = '+';
            button.style.position = 'absolute';

            if (direction.key === 'north') {
                button.style.left = `${centerX}px`;
                button.style.top = `${topPx - 16}px`;
                button.style.transform = `translate(-50%, -50%) rotate(${direction.rotateDeg}deg)`;
            } else if (direction.key === 'south') {
                button.style.left = `${centerX}px`;
                button.style.top = `${bottomPx + 16}px`;
                button.style.transform = `translate(-50%, -50%) rotate(${direction.rotateDeg}deg)`;
            } else if (direction.key === 'west') {
                button.style.left = `${leftPx - 16}px`;
                button.style.top = `${centerY}px`;
                button.style.transform = `translate(-50%, -50%) rotate(${direction.rotateDeg}deg)`;
            } else {
                button.style.left = `${rightPx + 16}px`;
                button.style.top = `${centerY}px`;
                button.style.transform = `translate(-50%, -50%) rotate(${direction.rotateDeg}deg)`;
            }

            const anchorX = parseFloat(button.style.left);
            const anchorY = parseFloat(button.style.top);
            if (
                !Number.isFinite(anchorX) || !Number.isFinite(anchorY)
                || anchorX < 0 || anchorX > rect.width
                || anchorY < 0 || anchorY > rect.height
            ) {
                return;
            }

            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                emitEvent(EVENTS.REQUEST_MOVE_SECTOR_EDGE, {
                    sourceSectorKey: entry.sectorKey,
                    direction: direction.key
                });
            });
            expandedEdgeContainer.appendChild(button);
        });
    });
}

export function updateSectorNavigationAnchors(context) {
    const northBtn = document.getElementById('sectorNorthBtn');
    const southBtn = document.getElementById('sectorSouthBtn');
    const westBtn = document.getElementById('sectorWestBtn');
    const eastBtn = document.getElementById('sectorEastBtn');
    const expandedEdgeContainer = document.getElementById('expandedSectorEdgeNavContainer');
    const mapContainer = document.getElementById('mapContainer');
    if (!northBtn || !southBtn || !westBtn || !eastBtn || !expandedEdgeContainer || !mapContainer) return;

    const nextContext = {
        ...context,
        buttons: { northBtn, southBtn, westBtn, eastBtn },
        expandedEdgeContainer,
        mapContainer
    };
    if (context.isExpandedSectorViewEnabled()) {
        updateExpandedSectorNavigation(nextContext);
        return;
    }
    updateSingleSectorNavigation(nextContext);
}
