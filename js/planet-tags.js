function normalizeLabel(value) {
    return String(value || '').trim().toLowerCase();
}

function isPlanetaryBody(body) {
    return !!body && body.type !== 'Artificial' && !/belt|field/i.test(body.type || '');
}

function weightedPick(items, randomFn, excluded = new Set()) {
    const candidates = items
        .filter(item => item.weight > 0 && !excluded.has(item.tag));
    if (!candidates.length) return null;

    const total = candidates.reduce((sum, item) => sum + item.weight, 0);
    let roll = randomFn() * total;
    for (const item of candidates) {
        roll -= item.weight;
        if (roll <= 0) return item.tag;
    }
    return candidates[candidates.length - 1].tag;
}

function baseTagWeights(planet) {
    const pop = Math.max(0, Number(planet.pop) || 0);
    const size = normalizeLabel(planet.size);
    const type = normalizeLabel(planet.type);
    const atmosphere = normalizeLabel(planet.atmosphere);
    const temperature = normalizeLabel(planet.temperature);

    const breathableLike = atmosphere === 'breathable' || atmosphere === 'humid' || atmosphere === 'dense';
    const temperateLike = temperature === 'temperate' || temperature === 'warm' || temperature === 'cold';
    const harshAtmosphere = atmosphere === 'toxic' || atmosphere === 'corrosive' || atmosphere === 'crushing' || atmosphere === 'none' || atmosphere === 'trace';
    const harshTemperature = temperature === 'scorching' || temperature === 'burning' || temperature === 'freezing' || temperature === 'frozen';
    const harshWorld = harshAtmosphere || harshTemperature;
    const largeWorld = size === 'large' || size === 'huge' || size === 'massive';
    const fertileType = type === 'terrestrial' || type === 'oceanic';

    const colonyWeight = pop < 2 ? 3.2 : (pop < 8 ? 1.8 : 0.45);
    const tradeWeight = pop < 3 ? 0.15 : (pop < 12 ? 1.5 : (pop < 30 ? 3.1 : 4.4));
    const industrialWeight = (largeWorld ? 2.2 : 1.0) * (harshAtmosphere ? 1.4 : 1.0) * (pop < 2 ? 0.6 : 1.2);
    const agriWeight = (fertileType ? 2.4 : 0.45) * (breathableLike ? 1.5 : 0.6) * (temperateLike ? 1.4 : 0.5);
    const researchWeight = (pop < 1 ? 0.4 : (pop < 20 ? 1.9 : 2.3)) * (temperateLike ? 1.35 : 0.9);
    const militaryWeight = (harshWorld ? 1.55 : 1.0) * (pop < 1 ? 0.8 : 1.45);
    const frontierWeight = pop < 1.5 ? 3.0 : (pop < 5 ? 1.9 : 0.35);
    const tourismWeight = (breathableLike ? 2.2 : 0.35) * (temperature === 'temperate' || temperature === 'warm' ? 1.6 : 0.55) * (pop < 1 ? 0.5 : (pop < 30 ? 1.6 : 1.2));

    return [
        { tag: 'Colony World', weight: colonyWeight },
        { tag: 'Core Trade Hub', weight: tradeWeight },
        { tag: 'Industrial Powerhouse', weight: industrialWeight },
        { tag: 'Agri World', weight: agriWeight },
        { tag: 'Research Enclave', weight: researchWeight },
        { tag: 'Military Bastion', weight: militaryWeight },
        { tag: 'Frontier Outpost', weight: frontierWeight },
        { tag: 'Cultural Center', weight: tourismWeight }
    ];
}

export function generateInhabitedPlanetTags(planet, randomFn = Math.random) {
    if (!planet || !planet.habitable || !isPlanetaryBody(planet)) return [];

    const weights = baseTagWeights(planet);
    const primary = weightedPick(weights, randomFn);
    if (!primary) return [];

    const tags = [primary];
    const pop = Math.max(0, Number(planet.pop) || 0);
    const secondaryChance = Math.min(0.55, 0.20 + (Math.sqrt(pop) * 0.045));
    if (randomFn() < secondaryChance) {
        const secondary = weightedPick(weights, randomFn, new Set(tags));
        if (secondary) tags.push(secondary);
    }
    return tags;
}

export function refreshSystemPlanetTags(system, options = {}) {
    if (!system || !Array.isArray(system.planets)) return;
    const randomFn = typeof options.randomFn === 'function' ? options.randomFn : Math.random;
    const forceRecalculate = !!options.forceRecalculate;

    system.planets.forEach((body) => {
        if (!isPlanetaryBody(body) || !body.habitable) {
            body.tags = [];
            return;
        }

        if (!forceRecalculate && Array.isArray(body.tags) && body.tags.length) return;
        body.tags = generateInhabitedPlanetTags(body, randomFn);
    });
}
