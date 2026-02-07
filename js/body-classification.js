function normalizeType(type) {
    return String(type || '').trim();
}

export function isArtificialBodyType(type) {
    return normalizeType(type) === 'Artificial';
}

export function isBeltOrFieldBodyType(type) {
    return /belt|field/i.test(normalizeType(type));
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
