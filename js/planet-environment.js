function pickWeighted(candidates, randomFn) {
    const total = candidates.reduce((sum, item) => sum + item.weight, 0);
    let roll = randomFn() * total;
    for (const item of candidates) {
        roll -= item.weight;
        if (roll <= 0) return item.label;
    }
    return candidates[candidates.length - 1].label;
}

export function isPlanetaryBodyType(type) {
    return type !== 'Artificial' && !/belt|field/i.test(type || '');
}

export function generatePlanetEnvironment(type, randomFn = Math.random) {
    const byType = {
        Terrestrial: {
            atmosphere: [
                { label: 'Breathable', weight: 0.35 },
                { label: 'Thin', weight: 0.20 },
                { label: 'Dense', weight: 0.20 },
                { label: 'Toxic', weight: 0.18 },
                { label: 'Corrosive', weight: 0.07 }
            ],
            temperature: [
                { label: 'Temperate', weight: 0.40 },
                { label: 'Warm', weight: 0.22 },
                { label: 'Cold', weight: 0.22 },
                { label: 'Hot', weight: 0.10 },
                { label: 'Freezing', weight: 0.06 }
            ]
        },
        Oceanic: {
            atmosphere: [
                { label: 'Breathable', weight: 0.45 },
                { label: 'Humid', weight: 0.25 },
                { label: 'Dense', weight: 0.18 },
                { label: 'Toxic', weight: 0.10 },
                { label: 'Corrosive', weight: 0.02 }
            ],
            temperature: [
                { label: 'Temperate', weight: 0.38 },
                { label: 'Warm', weight: 0.28 },
                { label: 'Cold', weight: 0.24 },
                { label: 'Hot', weight: 0.06 },
                { label: 'Freezing', weight: 0.04 }
            ]
        },
        Volcanic: {
            atmosphere: [
                { label: 'Toxic', weight: 0.45 },
                { label: 'Corrosive', weight: 0.30 },
                { label: 'Dense', weight: 0.20 },
                { label: 'Thin', weight: 0.05 }
            ],
            temperature: [
                { label: 'Hot', weight: 0.45 },
                { label: 'Scorching', weight: 0.30 },
                { label: 'Burning', weight: 0.10 },
                { label: 'Warm', weight: 0.10 },
                { label: 'Temperate', weight: 0.05 }
            ]
        },
        Desert: {
            atmosphere: [
                { label: 'Thin', weight: 0.35 },
                { label: 'Dry', weight: 0.30 },
                { label: 'Breathable', weight: 0.18 },
                { label: 'Toxic', weight: 0.12 },
                { label: 'Corrosive', weight: 0.05 }
            ],
            temperature: [
                { label: 'Warm', weight: 0.32 },
                { label: 'Hot', weight: 0.28 },
                { label: 'Temperate', weight: 0.18 },
                { label: 'Cold', weight: 0.14 },
                { label: 'Scorching', weight: 0.05 },
                { label: 'Burning', weight: 0.03 }
            ]
        },
        Barren: {
            atmosphere: [
                { label: 'None', weight: 0.38 },
                { label: 'Trace', weight: 0.32 },
                { label: 'Thin', weight: 0.18 },
                { label: 'Toxic', weight: 0.08 },
                { label: 'Corrosive', weight: 0.04 }
            ],
            temperature: [
                { label: 'Freezing', weight: 0.24 },
                { label: 'Frozen', weight: 0.04 },
                { label: 'Cold', weight: 0.26 },
                { label: 'Hot', weight: 0.20 },
                { label: 'Temperate', weight: 0.14 },
                { label: 'Scorching', weight: 0.12 }
            ]
        },
        Arctic: {
            atmosphere: [
                { label: 'Thin', weight: 0.36 },
                { label: 'Breathable', weight: 0.24 },
                { label: 'Dense', weight: 0.18 },
                { label: 'Toxic', weight: 0.14 },
                { label: 'Trace', weight: 0.08 }
            ],
            temperature: [
                { label: 'Freezing', weight: 0.45 },
                { label: 'Frozen', weight: 0.10 },
                { label: 'Cold', weight: 0.34 },
                { label: 'Temperate', weight: 0.08 },
                { label: 'Warm', weight: 0.03 }
            ]
        },
        'Gas Giant': {
            atmosphere: [
                { label: 'Crushing', weight: 0.40 },
                { label: 'Toxic', weight: 0.34 },
                { label: 'Corrosive', weight: 0.20 },
                { label: 'Dense', weight: 0.06 }
            ],
            temperature: [
                { label: 'Cold', weight: 0.34 },
                { label: 'Freezing', weight: 0.19 },
                { label: 'Frozen', weight: 0.05 },
                { label: 'Warm', weight: 0.20 },
                { label: 'Hot', weight: 0.14 },
                { label: 'Scorching', weight: 0.06 },
                { label: 'Burning', weight: 0.02 }
            ]
        }
    };

    const profile = byType[type] || {
        atmosphere: [{ label: 'Unknown', weight: 1 }],
        temperature: [{ label: 'Unknown', weight: 1 }]
    };

    return {
        atmosphere: pickWeighted(profile.atmosphere, randomFn),
        temperature: pickWeighted(profile.temperature, randomFn)
    };
}

export function getDefaultPlanetEnvironment(type) {
    return generatePlanetEnvironment(type, () => 0);
}
