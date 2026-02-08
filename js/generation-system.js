import { NAME_PREFIX, NAME_SUFFIX, STAR_VISUALS } from './config.js';
import {
    ADJACENT_DUPLICATE_NAME_CHANCE,
    STAR_CLASS_ROLL_TABLE,
    STAR_COUNT_THRESHOLDS_BY_PROFILE
} from './generation-data.js';
import { generateStarAge } from './core.js';
import { parseHexId } from './utils.js';

function rollStarClass(randomFn) {
    const roll = randomFn();
    for (let i = 0; i < STAR_CLASS_ROLL_TABLE.length; i++) {
        const entry = STAR_CLASS_ROLL_TABLE[i];
        if (!entry || !entry.starClass) continue;
        if (roll > Number(entry.minRollExclusive)) return entry.starClass;
    }
    return 'M';
}

function pickStarCount(profileKey, randomFn) {
    const profile = profileKey || 'high_adventure';
    const roll = randomFn();
    const thresholds = STAR_COUNT_THRESHOLDS_BY_PROFILE[profile] || STAR_COUNT_THRESHOLDS_BY_PROFILE.high_adventure;
    if (roll < Number(thresholds.triMaxExclusive)) return 3;
    if (roll < Number(thresholds.binaryMaxExclusive)) return 2;
    return 1;
}

export function generateSystemStars(profileKey, systemName = '', randomFn = Math.random) {
    const starCount = pickStarCount(profileKey, randomFn);
    const roleLabels = ['Primary', 'Secondary', 'Tertiary'];
    const letterLabels = ['A', 'B', 'C'];
    const stars = [];

    for (let i = 0; i < starCount; i++) {
        const starClass = rollStarClass(randomFn);
        const palette = STAR_VISUALS[starClass] || STAR_VISUALS.default;
        stars.push({
            class: starClass,
            color: palette.core,
            glow: palette.halo,
            palette,
            starAge: generateStarAge(starClass),
            role: roleLabels[i] || `Companion ${i}`,
            name: `${systemName || 'Unnamed'} ${letterLabels[i] || String.fromCharCode(65 + i)}`
        });
    }
    return stars;
}

function generateNameCandidate(randomFn) {
    const p1 = NAME_PREFIX[Math.floor(randomFn() * NAME_PREFIX.length)];
    const p2 = NAME_SUFFIX[Math.floor(randomFn() * NAME_SUFFIX.length)];
    const num = Math.floor(randomFn() * 999) + 1;
    return randomFn() > 0.5 ? `${p1}-${num}` : `${p1} ${p2}`;
}

function parseCoordId(coordId) {
    const parsed = parseHexId(coordId);
    if (!parsed) return { c: NaN, r: NaN };
    return { c: parsed.col, r: parsed.row };
}

function areCoordsAdjacent(coordA, coordB) {
    const a = parseCoordId(coordA);
    const b = parseCoordId(coordB);
    if (!Number.isInteger(a.c) || !Number.isInteger(a.r) || !Number.isInteger(b.c) || !Number.isInteger(b.r)) {
        return false;
    }
    const dc = Math.abs(a.c - b.c);
    const dr = Math.abs(a.r - b.r);
    return (dc <= 1 && dr <= 1) && !(dc === 0 && dr === 0);
}

function hasAdjacentDuplicateName(coordId, name, sectorsByCoord) {
    return Object.entries(sectorsByCoord || {}).some(([otherCoord, system]) =>
        !!system && system.name === name && areCoordsAdjacent(coordId, otherCoord)
    );
}

export function generateSystemName(coordId, usedNames, sectorsByCoord, randomFn = Math.random) {
    const MAX_ATTEMPTS = 400;
    const registry = usedNames || new Set();

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const candidate = generateNameCandidate(randomFn);
        if (!registry.has(candidate)) {
            registry.add(candidate);
            return candidate;
        }
        if (
            hasAdjacentDuplicateName(coordId, candidate, sectorsByCoord) &&
            randomFn() < ADJACENT_DUPLICATE_NAME_CHANCE
        ) {
            return candidate;
        }
    }

    let fallback = `${generateNameCandidate(randomFn)}-${Math.floor(randomFn() * 900) + 100}`;
    while (registry.has(fallback)) {
        fallback = `${generateNameCandidate(randomFn)}-${Math.floor(randomFn() * 900) + 100}`;
    }
    registry.add(fallback);
    return fallback;
}
