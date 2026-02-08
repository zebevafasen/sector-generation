export const EVENTS = {
    SECTOR_DATA_CHANGED: 'sectorDataChanged',
    VIEW_STATE_CHANGED: 'viewStateChanged',
    HEX_SELECTED: 'hexSelected',
    ROUTE_SHORTCUT_HEX: 'routeShortcutHex',
    ROUTE_SHORTCUT_CLEAR: 'routeShortcutClear',
    REQUEST_ADD_SYSTEM_AT_HEX: 'requestAddSystemAtHex',
    REQUEST_ADD_POI_AT_HEX: 'requestAddPoiAtHex',
    REQUEST_DELETE_POI_AT_HEX: 'requestDeletePoiAtHex',
    REQUEST_RENAME_POI_AT_HEX: 'requestRenamePoiAtHex',
    REQUEST_TRAVEL_JUMP_GATE: 'requestTravelJumpGate',
    REQUEST_SWITCH_SECTOR_HEX: 'requestSwitchSectorHex',
    REQUEST_MOVE_SECTOR_EDGE: 'requestMoveSectorEdge',
    REQUEST_DELETE_SELECTED_BODY: 'requestDeleteSelectedBody',
    REQUEST_REROLL_SELECTED_PLANET: 'requestRerollSelectedPlanet',
    EDIT_MODE_CHANGED: 'editModeChanged'
};

export function emitEvent(name, detail) {
    if (typeof window === 'undefined') return;
    if (typeof detail === 'undefined') {
        window.dispatchEvent(new Event(name));
    } else {
        window.dispatchEvent(new CustomEvent(name, { detail }));
    }
}
