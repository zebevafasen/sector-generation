function isPlanetaryBody(body) {
    return !!body && body.type !== 'Artificial' && !/belt|field/i.test(body.type);
}

export function validateSystemInvariants(system) {
    const issues = [];
    if (!system || !Array.isArray(system.planets)) {
        issues.push('System has no planets array.');
        return issues;
    }

    if (system.planets.length < 1) {
        issues.push('System has zero celestial bodies.');
    }

    const planetary = system.planets.filter(isPlanetaryBody);
    if (!planetary.length) {
        issues.push('System has no planetary bodies.');
    }

    const terrestrialCount = planetary.filter(body => body.type === 'Terrestrial').length;
    if (terrestrialCount > 1) {
        issues.push(`System has ${terrestrialCount} terrestrial planets (expected <= 1).`);
    }

    const habitableCount = planetary.filter(body => !!body.habitable).length;
    if (planetary.length && habitableCount < 1) {
        issues.push('System has no habitable planetary bodies.');
    }

    return issues;
}

export function reportSystemInvariantIssues(system, contextLabel = 'system') {
    const issues = validateSystemInvariants(system);
    if (!issues.length) return;
    if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[invariants:${contextLabel}]`, issues.join(' | '), system);
    }
}
