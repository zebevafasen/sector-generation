import { STAR_VISUALS } from './config.js';
const STAR_ROLE_LABELS = ['Primary', 'Secondary', 'Tertiary'];

function normalizeStarClass(value) {
    if (typeof value !== 'string' || !value.trim()) return 'G';
    return value.trim();
}

function buildStarFromClass(starClass, overrides = {}) {
    const normalizedClass = normalizeStarClass(starClass);
    const palette = STAR_VISUALS[normalizedClass] || STAR_VISUALS.default;
    return {
        class: normalizedClass,
        palette,
        color: palette.core,
        glow: palette.halo,
        starAge: null,
        role: overrides.role || 'Primary',
        ...overrides
    };
}

function getStarLetter(index) {
    return String.fromCharCode(65 + Math.max(0, index));
}

function getDefaultStarName(systemName, index) {
    const base = String(systemName || 'Unnamed');
    return `${base} ${getStarLetter(index)}`;
}

export function getSystemStars(system) {
    if (!system) return [];
    if (Array.isArray(system.stars) && system.stars.length) {
        return system.stars.map((star, index) => {
            const starClass = normalizeStarClass(star && star.class);
            const palette = (star && star.palette) || STAR_VISUALS[starClass] || STAR_VISUALS.default;
            return {
                class: starClass,
                palette,
                color: (star && star.color) || palette.core,
                glow: (star && star.glow) || palette.halo,
                starAge: star && star.starAge ? star.starAge : null,
                role: (star && star.role) || (index === 0 ? 'Primary' : `Companion ${index}`),
                name: (star && star.name) || getDefaultStarName(system && system.name, index)
            };
        });
    }

    const legacyClass = normalizeStarClass(system.starClass);
    const palette = system.palette || STAR_VISUALS[legacyClass] || STAR_VISUALS.default;
    return [{
        class: legacyClass,
        palette,
        color: system.color || palette.core,
        glow: system.glow || palette.halo,
        starAge: system.starAge || null,
        role: 'Primary',
        name: getDefaultStarName(system && system.name, 0)
    }];
}

export function getPrimaryStar(system) {
    const stars = getSystemStars(system);
    return stars[0] || buildStarFromClass('G');
}

export function ensureSystemStarFields(system) {
    if (!system) return;
    const stars = getSystemStars(system);
    if (!stars.length) {
        const fallback = buildStarFromClass('G');
        system.stars = [fallback];
        system.starClass = fallback.class;
        system.palette = fallback.palette;
        system.color = fallback.color;
        system.glow = fallback.glow;
        system.starAge = fallback.starAge;
        return;
    }

    system.stars = stars;
    system.stars.forEach((star, index) => {
        if (!star.name) star.name = getDefaultStarName(system.name, index);
        star.role = STAR_ROLE_LABELS[index] || `Companion ${index}`;
    });
    const primary = stars[0];
    system.starClass = primary.class;
    system.palette = primary.palette;
    system.color = primary.color;
    system.glow = primary.glow;
    system.starAge = primary.starAge;
}

export function removeStarAtIndex(system, index) {
    if (!system) return false;
    ensureSystemStarFields(system);
    if (!Array.isArray(system.stars) || system.stars.length <= 1) return false;
    if (!Number.isInteger(index) || index < 0 || index >= system.stars.length) return false;
    system.stars.splice(index, 1);
    ensureSystemStarFields(system);
    return true;
}

export function setPrimaryStarClass(system, nextClass, nextAge = null) {
    if (!system) return;
    const stars = getSystemStars(system);
    const primary = stars[0] || buildStarFromClass(nextClass, { role: 'Primary' });
    const normalizedClass = normalizeStarClass(nextClass);
    const palette = STAR_VISUALS[normalizedClass] || STAR_VISUALS.default;
    primary.class = normalizedClass;
    primary.palette = palette;
    primary.color = palette.core;
    primary.glow = palette.halo;
    primary.starAge = nextAge;
    primary.role = primary.role || 'Primary';
    stars[0] = primary;
    system.stars = stars;
    ensureSystemStarFields(system);
}

export function summarizeSystemStarClasses(system) {
    const stars = getSystemStars(system);
    if (!stars.length) return 'Class Unknown';
    const primary = stars[0];
    const companions = stars.slice(1);
    if (!companions.length) return `Class ${primary.class} Star`;
    const companionClasses = companions.map(star => star.class).join(' + ');
    return `Class ${primary.class} + ${companionClasses}`;
}
