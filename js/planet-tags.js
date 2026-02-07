import { formatPopulationBillions } from './planet-population.js';

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

function weightedPickCompatible(items, randomFn, selectedTags) {
    const pool = items.filter(item =>
        item.weight > 0
        && !selectedTags.includes(item.tag)
        && isTagCompatible(item.tag, selectedTags)
    );
    return weightedPick(pool, randomFn, new Set(selectedTags));
}

const TAG_INCOMPATIBILITIES = {
    'Ecumenopolis': new Set(['Abandoned Colony', 'Frontier Outpost', 'Colony World', 'Prison Planet']),
    'Abandoned Colony': new Set(['Ecumenopolis', 'Core Trade Hub', 'Agri World', 'Cultural Center', 'Research Enclave']),
    'Prison Planet': new Set(['Ecumenopolis', 'Cultural Center', 'Agri World']),
    'Civil War': new Set(['Quarantined World']),
    'Quarantined World': new Set(['Civil War'])
};

function isTagCompatible(candidate, selectedTags) {
    for (const selected of selectedTags) {
        const selectedBlocked = TAG_INCOMPATIBILITIES[selected];
        const candidateBlocked = TAG_INCOMPATIBILITIES[candidate];
        if ((selectedBlocked && selectedBlocked.has(candidate)) || (candidateBlocked && candidateBlocked.has(selected))) {
            return false;
        }
    }
    return true;
}

function baseInhabitedTagWeights(planet) {
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

function conditionTagWeights(planet) {
    const type = normalizeLabel(planet.type);
    const atmosphere = normalizeLabel(planet.atmosphere);
    const temperature = normalizeLabel(planet.temperature);
    const pop = Math.max(0, Number(planet.pop) || 0);
    const habitable = !!planet.habitable;

    const harsh = atmosphere === 'toxic'
        || atmosphere === 'corrosive'
        || atmosphere === 'none'
        || atmosphere === 'trace'
        || temperature === 'scorching'
        || temperature === 'burning'
        || temperature === 'freezing'
        || temperature === 'frozen';

    const prisonFriendly = type === 'barren'
        || type === 'desert'
        || type === 'arctic'
        || type === 'volcanic'
        || atmosphere === 'toxic'
        || atmosphere === 'corrosive'
        || harsh;

    const ecumenopolisWeight = habitable ? (pop > 25 ? 0.08 : (pop > 12 ? 0.05 : (pop > 5 ? 0.03 : 0.015))) : 0;
    const seismicWeight = (type === 'volcanic' ? 2.2 : 1.0) * (harsh ? 1.3 : 1.0);
    const activeBattlefieldWeight = pop > 0 ? 1.6 : 0.8;
    const quarantinedWeight = (harsh ? 1.4 : 1.0) * (pop > 0 ? 1.2 : 0.9);
    const civilWarWeight = pop > 0 ? (pop < 1 ? 0.6 : 1.8) : 0.2;
    const prisonPlanetWeight = prisonFriendly ? (pop > 0 ? 1.6 : 1.2) : 0.2;
    const abandonedColonyWeight = pop > 0 ? (pop < 3 ? 1.9 : 0.9) : 0.5;

    return [
        { tag: 'Ecumenopolis', weight: ecumenopolisWeight },
        { tag: 'Seismic Instability', weight: seismicWeight },
        { tag: 'Active Battlefield', weight: activeBattlefieldWeight },
        { tag: 'Quarantined World', weight: quarantinedWeight },
        { tag: 'Civil War', weight: civilWarWeight },
        { tag: 'Prison Planet', weight: prisonPlanetWeight },
        { tag: 'Abandoned Colony', weight: abandonedColonyWeight }
    ];
}

function buildTagCandidateWeights(planet) {
    const candidates = [];
    if (planet.habitable) {
        candidates.push(...baseInhabitedTagWeights(planet));
    }
    candidates.push(...conditionTagWeights(planet));
    return candidates;
}

function sanitizeTags(rawTags) {
    if (!Array.isArray(rawTags) || !rawTags.length) return [];
    const output = [];
    rawTags.forEach((tag) => {
        if (typeof tag !== 'string' || !tag.trim()) return;
        if (output.includes(tag)) return;
        if (!isTagCompatible(tag, output)) return;
        if (output.length < 2) output.push(tag);
    });
    return output;
}

function generatePlanetTags(planet, randomFn = Math.random) {
    if (!planet || !isPlanetaryBody(planet)) return [];

    const candidates = buildTagCandidateWeights(planet);
    if (!candidates.length) return [];

    const tags = [];
    const first = weightedPick(candidates, randomFn);
    if (first) tags.push(first);

    const wantsSecondTag = randomFn() < 0.90;
    if (wantsSecondTag && tags.length < 2) {
        const second = weightedPickCompatible(candidates, randomFn, tags);
        if (second) tags.push(second);
    }

    return sanitizeTags(tags);
}

function round1(value) {
    return Math.round(value * 10) / 10;
}

function applyTagPopulationEffects(body) {
    if (!isPlanetaryBody(body) || !body.habitable) return;

    const tags = Array.isArray(body.tags) ? body.tags : [];
    const base = Number.isFinite(Number(body.basePop)) && Number(body.basePop) > 0
        ? Number(body.basePop)
        : Math.max(0, Number(body.pop) || 0);

    if (base <= 0) {
        body.pop = 0;
        return;
    }

    let modifier = 1.0;
    if (tags.includes('Ecumenopolis')) modifier *= 5.5;
    if (tags.includes('Abandoned Colony')) modifier *= 0.12;

    body.pop = round1(Math.min(999, Math.max(0.1, base * modifier)));
}

export function refreshSystemPlanetTags(system, options = {}) {
    if (!system || !Array.isArray(system.planets)) return;
    const randomFn = typeof options.randomFn === 'function' ? options.randomFn : Math.random;
    const forceRecalculate = !!options.forceRecalculate;

    system.planets.forEach((body) => {
        if (!isPlanetaryBody(body)) {
            body.tags = [];
            return;
        }

        const hasExisting = Array.isArray(body.tags) && body.tags.length > 0;
        if (!forceRecalculate && hasExisting) {
            body.tags = sanitizeTags(body.tags);
            applyTagPopulationEffects(body);
            return;
        }

        body.tags = generatePlanetTags(body, randomFn);
        applyTagPopulationEffects(body);
    });

    const totalPopulation = system.planets.reduce((sum, body) => {
        const numeric = Number(body && body.pop);
        return Number.isFinite(numeric) && numeric > 0 ? sum + numeric : sum;
    }, 0);
    system.totalPop = totalPopulation > 0 ? formatPopulationBillions(totalPopulation) : 'None';
}
