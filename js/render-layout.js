import { HEX_HEIGHT, HEX_WIDTH } from './config.js';
import { parseSectorKeyToCoords } from './sector-address.js';

const SECTOR_GAP_PX = 20;

export function getCurrentSectorKey(state) {
    return state.multiSector && state.multiSector.currentKey ? state.multiSector.currentKey : '';
}

export function getSelectedSectorKey(state) {
    if (!(state.multiSector && typeof state.multiSector === 'object')) return null;
    const key = state.multiSector.selectedSectorKey;
    return typeof key === 'string' && key.trim() ? key : null;
}

export function isExpandedSectorViewEnabled(state) {
    return !!(state.multiSector && state.multiSector.expandedView);
}

export function getHexGroupSelector(hexId, sectorKey) {
    if (!hexId) return '';
    const normalizedSectorKey = String(sectorKey || '').trim().toUpperCase();
    return `.hex-group[data-id="${hexId}"][data-sector-key="${normalizedSectorKey}"]`;
}

export function getSingleSectorDimensions(cols, rows) {
    return {
        width: cols * (HEX_WIDTH * 0.75) + (HEX_WIDTH * 0.25),
        height: (rows * HEX_HEIGHT) + (cols > 1 ? (HEX_HEIGHT * 0.5) : 0)
    };
}

export function getLoadedSectorEntries(state) {
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

export function getSectorExtent(sectorEntries, cols, rows) {
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

export function getSectorWorldCenter(entry, extent, singleDimensions) {
    return {
        x: ((entry.coord.x - extent.minX) * extent.stepX) + (singleDimensions.width / 2),
        y: ((entry.coord.y - extent.minY) * extent.stepY) + (singleDimensions.height / 2)
    };
}

export function buildCurrentSectorEntry(state) {
    const currentSectorKey = getCurrentSectorKey(state);
    return {
        sectorKey: currentSectorKey,
        record: {
            sectors: state.sectors,
            deepSpacePois: state.deepSpacePois,
            pinnedHexIds: state.pinnedHexIds
        },
        coord: parseSectorKeyToCoords(currentSectorKey)
    };
}
