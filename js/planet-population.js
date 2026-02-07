function normalizeLabel(value) {
    return String(value || '').trim().toLowerCase();
}

function isPlanetaryBody(body) {
    return body && body.type !== 'Artificial' && !/belt|field/i.test(body.type || '');
}

function ensureFeaturesArray(body) {
    if (!Array.isArray(body.features)) body.features = [];
    return body.features;
}

const TYPE_FACTORS = {
    terrestrial: 1.0,
    oceanic: 0.95,
    desert: 0.62,
    arctic: 0.48,
    barren: 0.10,
    volcanic: 0.04,
    'gas giant': 0.02
};

const SIZE_FACTORS = {
    tiny: 0.45,
    small: 0.70,
    medium: 1.0,
    large: 1.40,
    huge: 1.85,
    massive: 2.20
};

const ATMOSPHERE_FACTORS = {
    breathable: 1.55,
    humid: 1.22,
    dense: 1.0,
    thin: 0.66,
    dry: 0.74,
    trace: 0.22,
    none: 0.06,
    toxic: 0.20,
    corrosive: 0.09,
    crushing: 0.03
};

const TEMPERATURE_FACTORS = {
    temperate: 1.48,
    warm: 1.16,
    cold: 0.92,
    hot: 0.58,
    freezing: 0.34,
    frozen: 0.24,
    scorching: 0.18,
    burning: 0.10
};

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function formatBillions(value) {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatPopulationBillions(value) {
    return `${formatBillions(value)} Billion`;
}

export function generatePlanetPopulationBillions(planet, randomFn = Math.random) {
    if (!planet || !planet.habitable || !isPlanetaryBody(planet)) return 0;

    const typeFactor = TYPE_FACTORS[normalizeLabel(planet.type)] || 0.25;
    const sizeFactor = SIZE_FACTORS[normalizeLabel(planet.size)] || 1.0;
    const atmosphereFactor = ATMOSPHERE_FACTORS[normalizeLabel(planet.atmosphere)] || 0.50;
    const temperatureFactor = TEMPERATURE_FACTORS[normalizeLabel(planet.temperature)] || 0.55;

    const score = typeFactor * sizeFactor * atmosphereFactor * temperatureFactor;
    const variance = 0.65 + (randomFn() * 1.10);
    const baseline = 3.5 + (randomFn() * 8.5);
    const rawBillions = score * baseline * variance * 3.0;

    return Math.round(clamp(rawBillions, 0.1, 999) * 10) / 10;
}

export function refreshSystemPlanetPopulation(system, options = {}) {
    if (!system || !Array.isArray(system.planets)) return;
    const randomFn = typeof options.randomFn === 'function' ? options.randomFn : Math.random;
    const forceRecalculate = !!options.forceRecalculate;

    system.planets.forEach((body) => {
        if (!isPlanetaryBody(body)) {
            body.pop = 0;
            if (Array.isArray(body.features)) {
                body.features = body.features.filter(feature => feature !== 'Inhabited');
            }
            return;
        }

        if (body.habitable) {
            const numericPop = Number(body.pop);
            if (forceRecalculate || !Number.isFinite(numericPop) || numericPop <= 0) {
                body.pop = generatePlanetPopulationBillions(body, randomFn);
            } else {
                body.pop = Math.round(numericPop * 10) / 10;
            }

            const features = ensureFeaturesArray(body);
            if (!features.includes('Inhabited')) features.push('Inhabited');
            return;
        }

        body.pop = 0;
        if (Array.isArray(body.features)) {
            body.features = body.features.filter(feature => feature !== 'Inhabited');
        }
    });

    const totalPopulation = system.planets.reduce((sum, body) => {
        const numeric = Number(body && body.pop);
        return Number.isFinite(numeric) && numeric > 0 ? sum + numeric : sum;
    }, 0);

    system.totalPop = totalPopulation > 0 ? formatPopulationBillions(totalPopulation) : 'None';
}
