import { parseSectorKeyToCoords } from './sector-address.js';

const SECTOR_SUFFIXES = [
    'Reach',
    'March',
    'Expanse',
    'Basin',
    'Drift',
    'Frontier',
    'Span',
    'Corridor',
    'Nebula',
    'Belt',
    'Pass',
    'Depths'
];

function normalizeWord(word) {
    return String(word || '')
        .replace(/[^A-Za-z0-9'-]/g, '')
        .trim();
}

function titleCaseWord(word) {
    const clean = normalizeWord(word);
    if (!clean) return '';
    return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

function extractCoreSystemPrefix(record) {
    if (!record || typeof record !== 'object') return '';
    const coreHexId = typeof record.coreSystemHexId === 'string' ? record.coreSystemHexId : null;
    const sectors = record.sectors && typeof record.sectors === 'object' ? record.sectors : {};
    const coreSystem = coreHexId && sectors[coreHexId] ? sectors[coreHexId] : null;
    const fallbackSystem = Object.values(sectors).find((system) => system && typeof system.name === 'string' && system.name.trim());
    const name = coreSystem && coreSystem.name ? coreSystem.name : (fallbackSystem && fallbackSystem.name ? fallbackSystem.name : '');
    const words = String(name || '')
        .split(/\s+/g)
        .map(titleCaseWord)
        .filter(Boolean);
    if (!words.length) return '';
    return words[0];
}

function computeSuffixIndex(sectorKey) {
    const key = String(sectorKey || '').trim().toUpperCase();
    if (!key) return 0;
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = ((hash * 31) + key.charCodeAt(i)) >>> 0;
    }
    return hash % SECTOR_SUFFIXES.length;
}

function normalizePrefix(prefix) {
    const clean = titleCaseWord(prefix);
    return clean || 'Uncharted';
}

export function buildSectorName(sectorKey, record = null) {
    const prefix = normalizePrefix(extractCoreSystemPrefix(record));
    const suffix = SECTOR_SUFFIXES[computeSuffixIndex(sectorKey)] || 'Reach';
    return `${prefix} ${suffix}`;
}

export function ensureSectorName(sectorKey, record = null) {
    if (!record || typeof record !== 'object') return buildSectorName(sectorKey, record);
    const nextName = buildSectorName(sectorKey, record);
    record.sectorName = nextName;
    return nextName;
}

export function getSectorDisplayName(sectorKey, sectorsByKey = {}) {
    const key = String(sectorKey || '').trim().toUpperCase();
    if (!key) return 'Unknown Sector';
    const record = sectorsByKey && typeof sectorsByKey === 'object' ? sectorsByKey[key] : null;
    if (record && typeof record.sectorName === 'string' && record.sectorName.trim()) {
        return record.sectorName.trim();
    }
    return buildSectorName(key, record);
}

export function getSectorCoordsLabel(sectorKey) {
    const coord = parseSectorKeyToCoords(sectorKey);
    if (!coord) return '';
    const x = coord.x >= 0 ? `+${coord.x}` : String(coord.x);
    const y = coord.y >= 0 ? `+${coord.y}` : String(coord.y);
    return `${x},${y}`;
}
