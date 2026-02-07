export const EVENTS = {
    SECTOR_DATA_CHANGED: 'sectorDataChanged',
    REQUEST_ADD_SYSTEM_AT_HEX: 'requestAddSystemAtHex',
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
