const AXIS_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const AXIS_BASE = AXIS_ALPHABET.length;
const AXIS_LABEL_WIDTH = 2;
const AXIS_CAPACITY = AXIS_BASE * AXIS_BASE;
const ORIGIN_AXIS_INDEX = 351; // NN

function indexToAxisLabel(index) {
    if (!Number.isInteger(index) || index < 0 || index >= AXIS_CAPACITY) return 'NN';
    const hi = Math.floor(index / AXIS_BASE);
    const lo = index % AXIS_BASE;
    return `${AXIS_ALPHABET[hi]}${AXIS_ALPHABET[lo]}`;
}

function axisLabelToIndex(label) {
    const normalized = String(label || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(normalized)) return ORIGIN_AXIS_INDEX;
    const hi = AXIS_ALPHABET.indexOf(normalized[0]);
    const lo = AXIS_ALPHABET.indexOf(normalized[1]);
    if (hi < 0 || lo < 0) return ORIGIN_AXIS_INDEX;
    return (hi * AXIS_BASE) + lo;
}

function normalizeSignedCoord(value) {
    const parsed = parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : 0;
}

function signedCoordToIndex(value) {
    const signed = normalizeSignedCoord(value);
    return Math.max(0, Math.min(AXIS_CAPACITY - 1, ORIGIN_AXIS_INDEX + signed));
}

export function getHomeSectorKey() {
    const label = indexToAxisLabel(ORIGIN_AXIS_INDEX);
    return `${label}${label}`;
}

export const HOME_SECTOR_KEY = getHomeSectorKey();

export function isSectorKey(value) {
    return /^[A-Z]{4}$/.test(String(value || '').trim().toUpperCase());
}

export function parseSectorKeyToCoords(sectorKey) {
    const normalized = String(sectorKey || '').trim().toUpperCase();
    if (!isSectorKey(normalized)) return { x: 0, y: 0 };
    const xLabel = normalized.slice(0, AXIS_LABEL_WIDTH);
    const yLabel = normalized.slice(AXIS_LABEL_WIDTH, AXIS_LABEL_WIDTH * 2);
    const x = axisLabelToIndex(xLabel) - ORIGIN_AXIS_INDEX;
    const y = axisLabelToIndex(yLabel) - ORIGIN_AXIS_INDEX;
    return { x, y };
}

export function makeSectorKeyFromCoords(x, y) {
    const xLabel = indexToAxisLabel(signedCoordToIndex(x));
    const yLabel = indexToAxisLabel(signedCoordToIndex(y));
    return `${xLabel}${yLabel}`;
}

export function offsetSectorKey(sectorKey, dx, dy) {
    const current = parseSectorKeyToCoords(sectorKey);
    return makeSectorKeyFromCoords(current.x + normalizeSignedCoord(dx), current.y + normalizeSignedCoord(dy));
}
