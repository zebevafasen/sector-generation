export function setupPanZoomAction(deps) {
    const {
        state,
        container,
        updateViewTransform,
        clearInfoPanel,
        isExpandedSectorViewEnabled,
        getCurrentGridDimensions,
        drawGrid
    } = deps;
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
        const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
        const isHexClick = path.some((node) => node instanceof Element && node.classList && node.classList.contains('hex-group'))
            || (e.target instanceof Element && !!e.target.closest('.hex-group'));
        if (isHexClick) return;
        document.querySelectorAll('.hex.selected').forEach(el => el.classList.remove('selected'));
        state.selectedHexId = null;
        state.selectedBodyIndex = null;
        clearInfoPanel();
        if (isExpandedSectorViewEnabled() && state.multiSector) {
            state.multiSector.selectedSectorKey = null;
            const { width, height } = getCurrentGridDimensions();
            drawGrid(width, height, { resetView: false });
        }
    });
}

export function updateViewTransformAction(deps) {
    const { state, updateSectorNavigationAnchors } = deps;
    const viewport = document.getElementById('mapViewport');
    if (viewport) {
        viewport.setAttribute('transform', `translate(${state.viewState.x}, ${state.viewState.y}) scale(${state.viewState.scale})`);
    }
    const snapshot = state.sectorConfigSnapshot || (state.lastSectorSnapshot && state.lastSectorSnapshot.sectorConfigSnapshot) || {};
    const width = parseInt(snapshot.width, 10) || 8;
    const height = parseInt(snapshot.height, 10) || 10;
    updateSectorNavigationAnchors(width, height);
}

export function refreshRouteOverlayAction(deps) {
    const { getCurrentSectorKey, renderRouteOverlay } = deps;
    const viewport = document.getElementById('mapViewport');
    if (!viewport) return;
    viewport.querySelectorAll('.route-overlay').forEach((node) => node.remove());
    const currentLayer = viewport.querySelector(`.sector-layer[data-sector-key="${getCurrentSectorKey()}"]`);
    renderRouteOverlay(currentLayer || viewport);
}

export function handleHexClickAction(e, id, groupElement, deps) {
    const { state, isExpandedSectorViewEnabled, getCurrentSectorKey, emitEvent, events, selectHex } = deps;
    if (state.viewState.dragDistance > 5) return;
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    const normalizedSectorKey = String((groupElement && groupElement.getAttribute ? groupElement.getAttribute('data-sector-key') : '') || '').trim().toUpperCase();
    const currentSectorKey = getCurrentSectorKey();
    if (isExpandedSectorViewEnabled() && normalizedSectorKey && normalizedSectorKey !== currentSectorKey) {
        emitEvent(events.REQUEST_SWITCH_SECTOR_HEX, { sectorKey: normalizedSectorKey, hexId: id });
        return;
    }
    if (e.shiftKey) {
        e.preventDefault();
        emitEvent(events.ROUTE_SHORTCUT_HEX, { hexId: id });
        return;
    }
    if (state.routePlanner && (state.routePlanner.startHexId || state.routePlanner.endHexId)) {
        emitEvent(events.ROUTE_SHORTCUT_CLEAR, { silent: true });
    }
    selectHex(id, groupElement);
}

export function selectHexAction(id, groupElement, deps) {
    const { state, updateInfoPanel, emitEvent, events } = deps;
    document.querySelectorAll('.hex.selected').forEach(el => el.classList.remove('selected'));
    const poly = groupElement.querySelector('polygon');
    if (poly) poly.classList.add('selected');
    state.selectedHexId = id;
    state.selectedBodyIndex = null;
    const rawSectorKey = groupElement && groupElement.getAttribute ? groupElement.getAttribute('data-sector-key') : null;
    const sectorKey = String(rawSectorKey || '').trim().toUpperCase();
    if (sectorKey && state.multiSector) {
        state.multiSector.selectedSectorKey = sectorKey;
        if (state.multiSector.expandedView) {
            document.querySelectorAll('.sector-layer').forEach((layer) => {
                const layerKey = String(layer.getAttribute('data-sector-key') || '').trim().toUpperCase();
                const isActive = layerKey === sectorKey;
                layer.classList.toggle('current-sector-layer', isActive);
                const frame = layer.querySelector('.sector-frame');
                if (frame) frame.classList.toggle('sector-frame-selected', isActive);
            });
        }
    }
    updateInfoPanel(id);
    emitEvent(events.HEX_SELECTED, { hexId: id });
}
