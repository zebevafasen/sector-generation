import { PLANET_TYPES } from './config.js';
import {
    BASE_HABITABILITY_TYPE_WEIGHT,
    HABITABLE_PLANET_TYPES,
    HABITABLE_WORLD_SUFFIXES,
    STAR_CLASS_PLANET_WEIGHTS
} from './generation-data.js';
import { isPlanetaryBody } from './body-classification.js';
import { pickWeighted, romanize, shuffleArray } from './utils.js';

function pickWeightedType(weights, rand, excludedTypes = new Set()) {
    const candidates = PLANET_TYPES
        .filter(type => !excludedTypes.has(type))
        .map(type => ({ type, weight: weights[type] || 0 }))
        .filter(item => item.weight > 0);

    if (!candidates.length) {
        return PLANET_TYPES[Math.floor(rand() * PLANET_TYPES.length)];
    }

    const total = candidates.reduce((sum, item) => sum + item.weight, 0);
    let roll = rand() * total;
    for (const item of candidates) {
        roll -= item.weight;
        if (roll <= 0) return item.type;
    }

    return candidates[candidates.length - 1].type;
}

function pickWeightedLabel(candidates, rand) {
    return (pickWeighted(candidates, rand)?.label) || candidates[candidates.length - 1].label;
}

function getHabitabilityTypeWeight(type, profile) {
    const baseWeight = BASE_HABITABILITY_TYPE_WEIGHT[type] || 1;
    const typeMultiplier = profile.habitabilityTypeMultipliers && profile.habitabilityTypeMultipliers[type]
        ? profile.habitabilityTypeMultipliers[type]
        : 1;
    return baseWeight * typeMultiplier;
}

function pickWeightedCandidateIndex(candidateIndexes, planets, profile, rand) {
    const weightedCandidates = candidateIndexes.map(index => ({
        index,
        weight: getHabitabilityTypeWeight(planets[index].type, profile)
    }));
    return (pickWeighted(weightedCandidates, rand)?.index)
        ?? weightedCandidates[weightedCandidates.length - 1].index;
}

function getUniqueHabitableSuffixes(count, rand) {
    const pool = [...HABITABLE_WORLD_SUFFIXES];
    shuffleArray(pool, rand);
    const picked = [];
    for (let i = 0; i < count; i++) {
        if (i < pool.length) {
            picked.push(pool[i]);
        } else {
            picked.push(`Colony ${i - pool.length + 1}`);
        }
    }
    return picked;
}

export function pickPlanetTypeForStarClass(starClass, rand, excludedTypes = new Set()) {
    const weights = STAR_CLASS_PLANET_WEIGHTS[starClass] || STAR_CLASS_PLANET_WEIGHTS.default;
    return pickWeightedType(weights, rand, excludedTypes);
}

export function pickRandomPlanetType(rand, excludedTypes = new Set()) {
    const candidates = PLANET_TYPES.filter(type => !excludedTypes.has(type));
    if (!candidates.length) {
        return PLANET_TYPES[Math.floor(rand() * PLANET_TYPES.length)];
    }
    return candidates[Math.floor(rand() * candidates.length)];
}

export function generatePlanetSize(type, rand) {
    if (type === 'Gas Giant') {
        return pickWeightedLabel([
            { label: 'Large', weight: 0.35 },
            { label: 'Huge', weight: 0.55 },
            { label: 'Massive', weight: 0.10 }
        ], rand);
    }
    return pickWeightedLabel([
        { label: 'Tiny', weight: 0.12 },
        { label: 'Small', weight: 0.30 },
        { label: 'Medium', weight: 0.36 },
        { label: 'Large', weight: 0.18 },
        { label: 'Huge', weight: 0.04 }
    ], rand);
}

export function isHabitableCandidateType(type) {
    return HABITABLE_PLANET_TYPES.has(type);
}

export function assignSystemHabitability(planets, profile, rand) {
    if (!planets.length) return;

    const candidateIndexes = [];
    planets.forEach((planet, index) => {
        if (isHabitableCandidateType(planet.type)) candidateIndexes.push(index);
    });

    if (!candidateIndexes.length) {
        const fallbackIndex = Math.floor(rand() * planets.length);
        planets[fallbackIndex].type = 'Terrestrial';
        candidateIndexes.push(fallbackIndex);
    }

    const primaryIndex = pickWeightedCandidateIndex(candidateIndexes, planets, profile, rand);
    const remainingIndexes = candidateIndexes.filter(index => index !== primaryIndex);
    planets[primaryIndex].habitable = true;

    let extraHabitableCount = 0;
    shuffleArray(remainingIndexes, rand);
    remainingIndexes.forEach(index => {
        const typeWeight = getHabitabilityTypeWeight(planets[index].type, profile);
        const extraChance = profile.extraHabitableBaseChance * typeWeight * Math.pow(profile.extraHabitableDecay, extraHabitableCount);
        if (rand() < extraChance) {
            planets[index].habitable = true;
            extraHabitableCount++;
        }
    });
}

export function applyPlanetaryOrderAndNames(systemName, bodies, rand) {
    const planetary = bodies.filter(isPlanetaryBody);
    const nonPlanetary = bodies.filter(body => !isPlanetaryBody(body));
    if (!planetary.length) return nonPlanetary;

    let primary = planetary.find(body => body.habitable);
    if (!primary) {
        primary = planetary[0];
        primary.habitable = true;
    }

    const orderedPlanetary = [primary, ...planetary.filter(body => body !== primary)];
    const secondaryHabitable = orderedPlanetary.filter((body, index) => index > 0 && body.habitable);
    const inhabitedSuffixes = getUniqueHabitableSuffixes(secondaryHabitable.length, rand);
    let nonHabitableNumeral = 1;
    let inhabitedSuffixIndex = 0;

    orderedPlanetary.forEach((planet, index) => {
        if (index === 0) {
            planet.habitable = true;
            planet.name = `${systemName} Prime`;
            return;
        }
        if (planet.habitable) {
            planet.name = `${systemName} ${inhabitedSuffixes[inhabitedSuffixIndex]}`;
            inhabitedSuffixIndex++;
            return;
        }
        planet.name = `${systemName} ${romanize(nonHabitableNumeral)}`;
        nonHabitableNumeral++;
    });

    return [...orderedPlanetary, ...nonPlanetary];
}
