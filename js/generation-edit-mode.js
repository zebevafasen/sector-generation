export function setEditModeAction(enabled, deps) {
    const { state, emitEvent, events } = deps;
    state.editMode = !!enabled;
    state.selectedBodyIndex = null;
    emitEvent(events.EDIT_MODE_CHANGED);
}

export function toggleEditModeAction(deps) {
    const { state, setEditMode, showStatusMessage } = deps;
    setEditMode(!state.editMode);
    showStatusMessage(state.editMode ? 'Edit mode enabled.' : 'Edit mode disabled.', 'info');
}
