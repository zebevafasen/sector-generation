import { HOME_SECTOR_KEY } from './sector-address.js';

export function createNavigationService(state, deps) {
    const {
        directions,
        ensureState,
        saveCurrentSectorRecord,
        applySectorRecord,
        getOrCreateSectorRecord,
        getOrCreateSectorRecordByKey,
        getOrCreateSectorRecordFromSource,
        centerViewOnSector,
        emitSectorDataChanged,
        showStatusMessage,
        offsetSectorKey
    } = deps;

    function moveDirection(direction) {
        ensureState();
        saveCurrentSectorRecord();
        const delta = directions[direction];
        if (!delta) return;
        const targetKey = offsetSectorKey(state.multiSector.currentKey, delta.dx, delta.dy);
        const targetRecord = getOrCreateSectorRecord(targetKey);
        if (!targetRecord) return;
        applySectorRecord(targetKey, targetRecord, {
            preferredSelectedHexId: state.selectedHexId,
            preserveView: true
        });
        emitSectorDataChanged(`Switch Sector ${direction}`);
    }

    function toggleExpandedSectorView() {
        ensureState();
        saveCurrentSectorRecord();
        const wasExpanded = !!state.multiSector.expandedView;
        const currentKey = state.multiSector.currentKey;

        if (!wasExpanded) {
            state.multiSector.expandedView = true;
            const currentRecord = state.multiSector.sectorsByKey[currentKey];
            if (!currentRecord) return;
            applySectorRecord(currentKey, currentRecord, {
                preferredSelectedHexId: state.selectedHexId,
                preserveView: false,
                showLoadedToast: false
            });
            state.viewState.scale = Math.max(0.2, Math.min(5, state.viewState.scale * 0.85));
            centerViewOnSector(currentKey);
        } else {
            const targetKey = currentKey;
            const targetRecord = getOrCreateSectorRecordByKey(targetKey);
            if (!targetRecord) return;
            state.multiSector.expandedView = false;
            applySectorRecord(targetKey, targetRecord, {
                preferredSelectedHexId: state.selectedHexId,
                preserveView: false,
                showLoadedToast: false
            });
        }
        emitSectorDataChanged('Toggle Expanded View');
        showStatusMessage(
            state.multiSector.expandedView ? 'Expanded sector view enabled.' : 'Expanded sector view disabled.',
            'info'
        );
    }

    function switchToSectorHex(sectorKey, hexId) {
        ensureState();
        saveCurrentSectorRecord();
        const targetRecord = getOrCreateSectorRecordByKey(sectorKey);
        if (!targetRecord) return;
        applySectorRecord(sectorKey, targetRecord, {
            preferredSelectedHexId: hexId || null,
            preserveView: true
        });
        emitSectorDataChanged('Switch Sector Hex');
    }

    function moveFromSectorEdge(sourceSectorKey, direction) {
        ensureState();
        saveCurrentSectorRecord();
        const delta = directions[direction];
        if (!delta) return;
        const targetKey = offsetSectorKey(sourceSectorKey, delta.dx, delta.dy);
        const targetRecord = getOrCreateSectorRecordFromSource(sourceSectorKey, targetKey);
        if (!targetRecord) return;
        applySectorRecord(targetKey, targetRecord, {
            preferredSelectedHexId: state.selectedHexId,
            preserveView: true
        });
        emitSectorDataChanged(`Switch Sector ${direction}`);
    }

    function goHome() {
        ensureState();
        saveCurrentSectorRecord();
        const homeKey = HOME_SECTOR_KEY;
        const home = state.multiSector.sectorsByKey[homeKey];
        if (!home) return;
        applySectorRecord(homeKey, home, { preferredSelectedHexId: state.selectedHexId, preserveView: true });
        emitSectorDataChanged('Switch Sector Home');
    }

    return {
        moveDirection,
        toggleExpandedSectorView,
        switchToSectorHex,
        moveFromSectorEdge,
        goHome
    };
}
