export const JUMP_GATE_POI_CATEGORY = 'jump_gate';

export function normalizeJumpGateState(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'active' || normalized === 'inactive') return normalized;
    return null;
}

export function normalizePoiCategory(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === 'jump-gate' || normalized === 'jumpgate') return JUMP_GATE_POI_CATEGORY;
    return normalized;
}

export function isJumpGatePoi(value) {
    if (!value || typeof value !== 'object') return false;
    const category = normalizePoiCategory(value.poiCategory);
    if (category === JUMP_GATE_POI_CATEGORY) return true;
    return normalizeJumpGateState(value.jumpGateState) !== null;
}

export function isActiveJumpGatePoi(value) {
    return isJumpGatePoi(value) && normalizeJumpGateState(value.jumpGateState) === 'active';
}

export function isInactiveJumpGatePoi(value) {
    return isJumpGatePoi(value) && normalizeJumpGateState(value.jumpGateState) === 'inactive';
}
