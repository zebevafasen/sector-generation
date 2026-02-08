export function reconcilePlanetaryBodiesAction(system, deps) {
    const {
        ensureSystemStarFields,
        applyPlanetaryOrderAndNames,
        refreshSystemPlanetPopulation,
        refreshSystemPlanetTags,
        reportSystemInvariantIssues,
        rand
    } = deps;
    if (!system || !Array.isArray(system.planets)) return;
    ensureSystemStarFields(system);
    system.planets = applyPlanetaryOrderAndNames(system.name, system.planets, rand);
    refreshSystemPlanetPopulation(system, { randomFn: rand });
    refreshSystemPlanetTags(system, { randomFn: rand });
    reportSystemInvariantIssues(system, 'reconcile');
}

export function generateSystemDataAction(config = null, context = null, deps) {
    const {
        state,
        normalizeGenerationConfig,
        getGenerationConfigSnapshot,
        getActiveGenerationProfile,
        generateSystemName,
        generateSystemStars,
        rand,
        pickPlanetTypeForStarClass,
        pickRandomPlanetType,
        generatePlanetEnvironment,
        romanize,
        generatePlanetSize,
        assignSystemHabitability,
        applyPlanetaryOrderAndNames,
        starVisuals,
        ensureSystemStarFields,
        refreshSystemPlanetPopulation,
        refreshSystemPlanetTags,
        reportSystemInvariantIssues
    } = deps;
    const normalized = normalizeGenerationConfig(config || getGenerationConfigSnapshot());
    const generationProfile = getActiveGenerationProfile(normalized.generationProfile);
    const coordId = context && context.coordId ? context.coordId : null;
    const usedNames = context && context.usedNames ? context.usedNames : new Set();
    const sectorsByCoord = context && context.sectorsByCoord ? context.sectorsByCoord : state.sectors;
    const name = generateSystemName(coordId, usedNames, sectorsByCoord, rand);
    const stars = generateSystemStars(normalized.generationProfile, name, rand);
    const primaryStar = stars[0];
    const sClass = primaryStar.class;

    const planetCount = Math.floor(rand() * 6) + 1;
    const planets = [];
    let hasTerrestrial = false;
    const starAge = primaryStar.starAge;

    const useWeightedTypes = normalized.realisticPlanetWeights;
    for (let i = 0; i < planetCount; i++) {
        const excludedTypes = hasTerrestrial ? new Set(['Terrestrial']) : new Set();
        const type = useWeightedTypes
            ? pickPlanetTypeForStarClass(sClass, rand, excludedTypes)
            : pickRandomPlanetType(rand, excludedTypes);
        if (type === 'Terrestrial') hasTerrestrial = true;
        const environment = generatePlanetEnvironment(type, rand);
        planets.push({
            name: `${name} ${romanize(i + 1)}`,
            type,
            size: generatePlanetSize(type, rand),
            atmosphere: environment.atmosphere,
            temperature: environment.temperature,
            features: [],
            pop: 0,
            basePop: 0,
            tags: [],
            habitable: false
        });
    }

    assignSystemHabitability(planets, generationProfile, rand);
    const normalizedPlanetaryBodies = applyPlanetaryOrderAndNames(name, planets, rand);
    planets.length = 0;
    planets.push(...normalizedPlanetaryBodies);

    if (rand() < generationProfile.beltChance) {
        planets.push({
            name: `${name} Belt`,
            type: rand() > 0.6 ? 'Debris Field' : 'Asteroid Belt',
            features: rand() > 0.55 ? ['Resource-Rich'] : [],
            pop: 0
        });
    }

    if (rand() < generationProfile.stationChance) {
        planets.push({
            name: `Station Alpha-${Math.floor(rand() * 99)}`,
            type: 'Artificial',
            features: [],
            pop: 0
        });
    }

    const visuals = starVisuals[sClass] || starVisuals.default;
    const generatedSystem = {
        name,
        stars,
        starClass: sClass,
        color: visuals.core,
        glow: visuals.halo,
        palette: visuals,
        starAge,
        planets,
        totalPop: 'None'
    };
    ensureSystemStarFields(generatedSystem);
    refreshSystemPlanetPopulation(generatedSystem, { forceRecalculate: true, randomFn: rand });
    refreshSystemPlanetTags(generatedSystem, { forceRecalculate: true, randomFn: rand });
    const derivedTagSet = new Set();
    generatedSystem.planets.forEach((body) => {
        if (!Array.isArray(body && body.tags)) return;
        body.tags.forEach((tag) => {
            const normalized = String(tag || '').trim();
            if (!normalized) return;
            derivedTagSet.add(normalized);
        });
    });
    generatedSystem.tags = Array.from(derivedTagSet).slice(0, 8);
    generatedSystem.starTags = Array.isArray(generatedSystem.starTags) ? generatedSystem.starTags : [];
    reportSystemInvariantIssues(generatedSystem, 'generate');
    return generatedSystem;
}
