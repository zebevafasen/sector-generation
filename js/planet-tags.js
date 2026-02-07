import { formatPopulationBillions } from './planet-population.js';
import { isPlanetaryBody } from './body-classification.js';
import { pickWeighted } from './utils.js';

function normalizeLabel(value) {
    return String(value || '').trim().toLowerCase();
}

function weightedPick(items, randomFn, excluded = new Set()) {
    const candidates = items
        .filter(item => item.weight > 0 && !excluded.has(item.tag));
    return pickWeighted(candidates, randomFn)?.tag || null;
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
    'Forge World': new Set(['Agri World', 'Garden World', 'Xeno Preserve']),
    'Garden World': new Set(['Seismic Instability', 'Forge World', 'Frequent Storms']),
    'Corporate Enclave': new Set(['Abandoned Colony', 'Prison Planet']),
    'Xeno Preserve': new Set(['Industrial Powerhouse', 'Forge World', 'Ecumenopolis', 'Active Battlefield']),
    'Regional Hegemon': new Set(['Rising Hegemon']),
    'Rising Hegemon': new Set(['Regional Hegemon']),
    'Terraformed': new Set(['Terraform Failure']),
    'Terraform Failure': new Set(['Terraformed', 'Garden World']),
    'Pilgrimage Site': new Set(['Active Battlefield', 'Civil War']),
    'Pleasure World': new Set(['Rampant Slavery', 'Prison Planet']),
    'Rampant Slavery': new Set(['Pleasure World', 'Xeno Preserve', 'Pilgrimage Site']),
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
    const volatileType = type === 'volcanic' || type === 'arctic' || type === 'desert';
    const waterRich = type === 'oceanic' || atmosphere === 'humid' || atmosphere === 'dense';

    const colonyWeight = pop < 2 ? 3.2 : (pop < 8 ? 1.8 : 0.45);
    const tradeWeight = pop < 3 ? 0.15 : (pop < 12 ? 1.5 : (pop < 30 ? 3.1 : 4.4));
    const industrialWeight = (largeWorld ? 2.2 : 1.0) * (harshAtmosphere ? 1.4 : 1.0) * (pop < 2 ? 0.6 : 1.2);
    const agriWeight = (fertileType ? 2.4 : 0.45) * (breathableLike ? 1.5 : 0.6) * (temperateLike ? 1.4 : 0.5);
    const researchWeight = (pop < 1 ? 0.4 : (pop < 20 ? 1.9 : 2.3)) * (temperateLike ? 1.35 : 0.9);
    const militaryWeight = (harshWorld ? 1.55 : 1.0) * (pop < 1 ? 0.8 : 1.45);
    const frontierWeight = pop < 1.5 ? 3.0 : (pop < 5 ? 1.9 : 0.35);
    const tourismWeight = (breathableLike ? 2.2 : 0.35) * (temperature === 'temperate' || temperature === 'warm' ? 1.6 : 0.55) * (pop < 1 ? 0.5 : (pop < 30 ? 1.6 : 1.2));
    const forgeWeight = (largeWorld ? 2.0 : 1.1) * (harshWorld ? 1.5 : 1.0) * (pop < 1 ? 0.25 : (pop < 10 ? 1.2 : 2.1));
    const gardenWeight = (fertileType ? 2.2 : 0.2) * (breathableLike ? 2.0 : 0.2) * (temperateLike ? 1.9 : 0.3) * (harshWorld ? 0.1 : 1.0);
    const smugglerWeight = (frontierWeight > 1.2 ? 1.4 : 0.9) * (pop < 1 ? 0.8 : (pop < 8 ? 1.9 : 1.1));
    const pilgrimageWeight = (breathableLike ? 1.3 : 0.9) * (temperateLike ? 1.3 : 0.8) * (pop < 1 ? 0.6 : (pop < 20 ? 1.4 : 1.8));
    const corporateWeight = (tradeWeight > 1 ? 1.6 : 0.8) * (pop < 2 ? 0.4 : (pop < 12 ? 1.5 : 2.3));
    const preserveWeight = (fertileType ? 1.5 : 0.5) * (volatileType ? 0.45 : 1.0) * (pop < 0.5 ? 1.6 : (pop < 6 ? 1.1 : 0.65));
    const majorSpaceyardWeight = (industrialWeight > 1.6 ? 1.5 : 0.75) * (pop < 3 ? 0.4 : (pop < 12 ? 1.3 : 2.1));
    const pilgrimageSiteWeight = pilgrimageWeight * (pop < 1 ? 0.4 : 1.1);
    const pleasureWorldWeight = (breathableLike ? 1.7 : 0.3) * (temperateLike ? 1.7 : 0.4) * (pop < 1 ? 0.5 : (pop < 15 ? 1.5 : 1.2));
    const rampantSlaveryWeight = (harshWorld ? 1.5 : 1.0) * (pop < 1 ? 0.2 : (pop < 8 ? 1.2 : 1.8));
    const regionalHegemonWeight = (tradeWeight > 1.2 ? 1.4 : 0.8) * (militaryWeight > 1.1 ? 1.4 : 0.9) * (pop < 12 ? 0.25 : 1.3);
    const risingHegemonWeight = (tradeWeight > 1 ? 1.2 : 0.8) * (militaryWeight > 1 ? 1.3 : 0.9) * (pop < 4 ? 0.4 : (pop < 16 ? 1.5 : 0.9));
    const soleSupplierWeight = (industrialWeight > 1.4 ? 0.11 : 0.03) * (pop < 3 ? 0.55 : 1.0);
    const floatingCitiesWeight = (waterRich ? 1.6 : 0.25) * (harshAtmosphere ? 1.1 : 1.0) * (pop < 1 ? 0.45 : 1.3);

    return [
        { tag: 'Colony World', weight: colonyWeight },
        { tag: 'Core Trade Hub', weight: tradeWeight },
        { tag: 'Industrial Powerhouse', weight: industrialWeight },
        { tag: 'Major Spaceyard', weight: majorSpaceyardWeight },
        { tag: 'Forge World', weight: forgeWeight },
        { tag: 'Agri World', weight: agriWeight },
        { tag: 'Garden World', weight: gardenWeight },
        { tag: 'Research Enclave', weight: researchWeight },
        { tag: 'Military Bastion', weight: militaryWeight },
        { tag: 'Frontier Outpost', weight: frontierWeight },
        { tag: 'Cultural Center', weight: tourismWeight },
        { tag: 'Smuggler Haven', weight: smugglerWeight },
        { tag: 'Pilgrimage World', weight: pilgrimageWeight },
        { tag: 'Pilgrimage Site', weight: pilgrimageSiteWeight },
        { tag: 'Pleasure World', weight: pleasureWorldWeight },
        { tag: 'Rampant Slavery', weight: rampantSlaveryWeight },
        { tag: 'Regional Hegemon', weight: regionalHegemonWeight },
        { tag: 'Rising Hegemon', weight: risingHegemonWeight },
        { tag: 'Corporate Enclave', weight: corporateWeight },
        { tag: 'Xeno Preserve', weight: preserveWeight },
        { tag: 'Floating Cities', weight: floatingCitiesWeight },
        { tag: 'Sole Supplier', weight: soleSupplierWeight }
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
    const stormHostileAtmosphere = atmosphere === 'humid' || atmosphere === 'dense' || atmosphere === 'corrosive';
    const stormHostileTemperature = temperature === 'warm' || temperature === 'scorching' || temperature === 'freezing';
    const terraformableType = type === 'desert' || type === 'arctic' || type === 'barren' || type === 'volcanic';

    const ecumenopolisWeight = habitable ? (pop > 25 ? 0.08 : (pop > 12 ? 0.05 : (pop > 5 ? 0.03 : 0.015))) : 0;
    const seismicWeight = (type === 'volcanic' ? 2.2 : 1.0) * (harsh ? 1.3 : 1.0);
    const activeBattlefieldWeight = pop > 0 ? 1.6 : 0.8;
    const quarantinedWeight = (harsh ? 1.4 : 1.0) * (pop > 0 ? 1.2 : 0.9);
    const civilWarWeight = pop > 0 ? (pop < 1 ? 0.6 : 1.8) : 0.2;
    const prisonPlanetWeight = prisonFriendly ? (pop > 0 ? 1.6 : 1.2) : 0.2;
    const abandonedColonyWeight = pop > 0 ? 0 : 2.2;
    const tidallyLockedWeight = habitable
        ? (harsh ? 0.8 : 1.35) * (pop > 0 ? 1.2 : 0.9)
        : (type === 'barren' || type === 'desert' ? 1.4 : 0.75);
    const frequentStormsWeight = (stormHostileAtmosphere ? 1.4 : 0.7) * (stormHostileTemperature ? 1.3 : 0.9);
    const domeCitiesWeight = (harsh ? 1.8 : 0.5) * (pop > 0 ? 1.3 : 0.2) * (atmosphere === 'none' || atmosphere === 'trace' ? 1.5 : 1.0);
    const terraformedWeight = (terraformableType ? 1.4 : 0.25) * (habitable ? 1.2 : 0.45) * (pop > 0 ? 1.2 : 0.2);
    const terraformFailureWeight = (terraformableType ? 0.18 : 0.03) * (harsh ? 1.3 : 0.8) * (pop > 0 ? 1.0 : 0.15);

    return [
        { tag: 'Ecumenopolis', weight: ecumenopolisWeight },
        { tag: 'Seismic Instability', weight: seismicWeight },
        { tag: 'Frequent Storms', weight: frequentStormsWeight },
        { tag: 'Tidally Locked', weight: tidallyLockedWeight },
        { tag: 'Dome Cities', weight: domeCitiesWeight },
        { tag: 'Terraformed', weight: terraformedWeight },
        { tag: 'Terraform Failure', weight: terraformFailureWeight },
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

function isTagValidForPlanet(tag, planet) {
    if (!planet) return true;
    const pop = Math.max(0, Number(planet.pop) || 0);
    const inhabited = pop > 0;
    const habitable = !!planet.habitable;
    const atmosphere = normalizeLabel(planet.atmosphere);
    const temperature = normalizeLabel(planet.temperature);
    const type = normalizeLabel(planet.type);

    if (!inhabited) {
        return false;
    }

    if (tag === 'Abandoned Colony' && inhabited) {
        return false;
    }
    if ((tag === 'Garden World' || tag === 'Pilgrimage World' || tag === 'Corporate Enclave' || tag === 'Smuggler Haven' || tag === 'Forge World') && !inhabited) {
        return false;
    }
    if ((tag === 'Major Spaceyard' || tag === 'Pilgrimage Site' || tag === 'Pleasure World' || tag === 'Rampant Slavery' || tag === 'Regional Hegemon' || tag === 'Rising Hegemon' || tag === 'Sole Supplier' || tag === 'Dome Cities' || tag === 'Floating Cities' || tag === 'Terraformed' || tag === 'Terraform Failure') && !inhabited) {
        return false;
    }
    if (tag === 'Xeno Preserve' && !(habitable || inhabited)) {
        return false;
    }
    if (tag === 'Frequent Storms') {
        const stormPossible = atmosphere === 'humid'
            || atmosphere === 'dense'
            || atmosphere === 'corrosive'
            || temperature === 'warm'
            || temperature === 'scorching'
            || temperature === 'freezing'
            || type === 'oceanic'
            || type === 'volcanic';
        if (!stormPossible) return false;
    }
    if (tag === 'Dome Cities') {
        const needsDomes = atmosphere === 'none'
            || atmosphere === 'trace'
            || atmosphere === 'toxic'
            || atmosphere === 'corrosive'
            || atmosphere === 'crushing'
            || temperature === 'burning'
            || temperature === 'frozen'
            || type === 'barren';
        if (!needsDomes) return false;
    }
    if (tag === 'Floating Cities') {
        const canFloat = type === 'oceanic'
            || atmosphere === 'dense'
            || atmosphere === 'humid'
            || atmosphere === 'corrosive';
        if (!canFloat) return false;
    }
    if (tag === 'Terraformed' || tag === 'Terraform Failure') {
        const terraformable = type === 'desert'
            || type === 'arctic'
            || type === 'barren'
            || type === 'volcanic';
        if (!terraformable) return false;
    }
    return true;
}

function sanitizeTags(rawTags, planet = null) {
    if (!Array.isArray(rawTags) || !rawTags.length) return [];
    const output = [];
    rawTags.forEach((tag) => {
        if (typeof tag !== 'string' || !tag.trim()) return;
        if (!isTagValidForPlanet(tag, planet)) return;
        if (output.includes(tag)) return;
        if (!isTagCompatible(tag, output)) return;
        if (output.length < 2) output.push(tag);
    });
    return output;
}

function generatePlanetTags(planet, randomFn = Math.random) {
    if (!planet || !isPlanetaryBody(planet)) return [];
    if (!(Number(planet.pop) > 0)) return [];

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

    return sanitizeTags(tags, planet);
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
            body.tags = sanitizeTags(body.tags, body);
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
