import { HOME_SECTOR_KEY, makeSectorKeyFromCoords } from './sector-address.js';
import { formatSectorLabel } from './sector-naming.js';

export function createCorridorService(state, deps) {
    const {
        ensureState,
        parseKey,
        getOrCreateSectorRecordByKey,
        renderSectorLinksUi,
        saveCurrentSectorRecord,
        emitSectorDataChanged,
        showStatusMessage
    } = deps;

    function getStepToward(value, target) {
        if (value === target) return 0;
        return value < target ? 1 : -1;
    }

    function getShortestPathSectorKeys(startKey, endKey) {
        const start = parseKey(startKey);
        const end = parseKey(endKey);
        const keys = [makeSectorKeyFromCoords(start.x, start.y)];
        let x = start.x;
        let y = start.y;
        while (!(x === end.x && y === end.y)) {
            if (x !== end.x) {
                x += getStepToward(x, end.x);
            } else if (y !== end.y) {
                y += getStepToward(y, end.y);
            }
            keys.push(makeSectorKeyFromCoords(x, y));
        }
        return keys;
    }

    function getIntermediarySectorKeysBetween(startKey, endKey) {
        const path = getShortestPathSectorKeys(startKey, endKey);
        if (path.length <= 2) return [];
        return path.slice(1, path.length - 1);
    }

    function getMissingGateCorridorSectorKeys() {
        ensureState();
        const missing = new Set();
        const loaded = state.multiSector.sectorsByKey || {};
        const homeKey = HOME_SECTOR_KEY;

        const loadedGateSectorKeys = new Set();
        Object.values(state.multiSector.jumpGateRegistry || {}).forEach((pair) => {
            if (!pair || !pair.a || !pair.b) return;
            if (pair.a.sectorKey && loaded[pair.a.sectorKey]) loadedGateSectorKeys.add(pair.a.sectorKey);
            if (pair.b.sectorKey && loaded[pair.b.sectorKey]) loadedGateSectorKeys.add(pair.b.sectorKey);
        });

        loadedGateSectorKeys.forEach((sectorKey) => {
            if (sectorKey === homeKey) return;
            const pathKeys = getShortestPathSectorKeys(homeKey, sectorKey);
            pathKeys.forEach((key, index) => {
                if (index === 0 || index === pathKeys.length - 1) return;
                if (!loaded[key]) missing.add(key);
            });
        });

        Object.values(state.multiSector.jumpGateRegistry || {}).forEach((pair) => {
            if (!pair || !pair.a || !pair.b || !pair.a.sectorKey || !pair.b.sectorKey) return;
            if (!loaded[pair.a.sectorKey] || !loaded[pair.b.sectorKey]) return;
            const a = parseKey(pair.a.sectorKey);
            const b = parseKey(pair.b.sectorKey);
            const chebyshevDistance = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
            if (chebyshevDistance <= 1) return;
            getIntermediarySectorKeysBetween(pair.a.sectorKey, pair.b.sectorKey).forEach((key) => {
                if (!loaded[key]) missing.add(key);
            });
        });
        return Array.from(missing);
    }

    function chartMissingGateCorridors() {
        ensureState();
        saveCurrentSectorRecord();
        const missingKeys = getMissingGateCorridorSectorKeys();
        if (!missingKeys.length) {
            state.multiSector.chartGateCorridorsPending = false;
            showStatusMessage('No gate corridors need charting right now.', 'info');
            renderSectorLinksUi();
            return;
        }
        missingKeys.forEach((sectorKey) => {
            getOrCreateSectorRecordByKey(sectorKey);
        });
        state.multiSector.chartGateCorridorsPending = false;
        renderSectorLinksUi();
        emitSectorDataChanged('Chart Gate Corridors');
        const sectorsByKey = state.multiSector && state.multiSector.sectorsByKey ? state.multiSector.sectorsByKey : {};
        const listedKeys = missingKeys
            .slice(0, 6)
            .map((sectorKey) => formatSectorLabel(sectorKey, sectorsByKey))
            .join(', ');
        const extra = missingKeys.length > 6 ? ` +${missingKeys.length - 6} more` : '';
        showStatusMessage(
            `Charted ${missingKeys.length} corridor sector${missingKeys.length === 1 ? '' : 's'}: ${listedKeys}${extra}.`,
            'success'
        );
    }

    return {
        getMissingGateCorridorSectorKeys,
        chartMissingGateCorridors
    };
}
