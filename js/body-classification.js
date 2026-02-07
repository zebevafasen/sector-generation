export function normalizeBodyType(type) {
    const normalized = String(type || '').trim();
    return normalized === 'Lava' ? 'Volcanic' : normalized;
}

export function isArtificialBodyType(type) {
    return normalizeBodyType(type) === 'Artificial';
}

export function isBeltOrFieldBodyType(type) {
    return /belt|field/i.test(normalizeBodyType(type));
}

export function isPlanetaryBodyType(type) {
    return !isArtificialBodyType(type) && !isBeltOrFieldBodyType(type);
}

export function isPlanetaryBody(body) {
    return !!body && isPlanetaryBodyType(body.type);
}

export function countSystemBodies(system) {
    if (!system || !Array.isArray(system.planets)) {
        return { planets: 0, belts: 0, stations: 0 };
    }

    return system.planets.reduce((acc, body) => {
        if (isArtificialBodyType(body.type)) {
            acc.stations += 1;
            return acc;
        }
        if (isBeltOrFieldBodyType(body.type)) {
            acc.belts += 1;
            return acc;
        }
        acc.planets += 1;
        return acc;
    }, { planets: 0, belts: 0, stations: 0 });
}
