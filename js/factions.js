import { FACTION_RULES } from './generation-data.js';

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function asRandomFn(randomFn) {
    return typeof randomFn === 'function' ? randomFn : Math.random;
}

function parseHex(hexId) {
    const [colRaw, rowRaw] = String(hexId || '').split('-');
    const col = Number(colRaw);
    const row = Number(rowRaw);
    if (!Number.isInteger(col) || !Number.isInteger(row)) return null;
    return { col, row };
}

function stableUnitNoise(seed) {
    const text = String(seed || '');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    const normalized = ((hash >>> 0) % 10000) / 9999;
    return (normalized * 2) - 1;
}

function hexDistance(hexA, hexB) {
    const a = parseHex(hexA);
    const b = parseHex(hexB);
    if (!a || !b) return Number.POSITIVE_INFINITY;
    return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

function getSystemPopulation(system) {
    if (!system || !Array.isArray(system.planets)) return 0;
    return system.planets.reduce((sum, body) => {
        const pop = Number(body && body.pop);
        return Number.isFinite(pop) && pop > 0 ? sum + pop : sum;
    }, 0);
}

const DEFAULT_FACTION_TYPES = ['empire', 'corporate', 'coalition', 'cult', 'pirates', 'machine'];
const DEFAULT_FACTION_DOCTRINES = ['expansionist', 'mercantile', 'isolationist', 'technocratic', 'militarist', 'zealous'];
const DEFAULT_FACTION_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
    '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
    '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#fb7185', '#f43f5e'
];
const DEFAULT_FACTION_TYPE_TAG_HINTS = {
    empire: ['capital', 'fortress', 'military', 'command', 'imperial', 'garrison', 'stronghold'],
    corporate: ['trade', 'market', 'commerce', 'logistics', 'shipping', 'mining', 'industry', 'refinery'],
    coalition: ['alliance', 'union', 'federation', 'diplom', 'treaty', 'cooperative', 'concord'],
    cult: ['temple', 'relic', 'sacred', 'faith', 'occult', 'shrine', 'pilgrim'],
    pirates: ['pirate', 'smuggl', 'raider', 'outlaw', 'corsair', 'black-market', 'blackmarket'],
    machine: ['machine', 'synthetic', 'ai', 'cyber', 'drone', 'automation', 'datavault', 'archive']
};
const DEFAULT_FACTION_SCORING_RULES = {
    homeSelection: {
        typeAffinityWeight: 5,
        populationWeight: 2,
        coreBonus: 6
    },
    influence: {
        system: {
            powerWeight: 0.68,
            militaryWeight: 0.4,
            populationWeight: 1.4,
            populationCap: 28,
            doctrineModifiers: {
                expansionist: 8,
                mercantile: 4,
                isolationist: -5
            },
            distanceBase: 6,
            distanceScale: 9.5,
            noiseScale: 0.45
        },
        poi: {
            powerWeight: 0.48,
            militaryWeight: 0.38,
            distanceBase: 5,
            distanceScale: 8.4,
            noiseScale: 0.25
        }
    },
    poiBonuses: {
        kind: {
            navigation: 11,
            opportunity: 7
        },
        category: {
            jump_gate: 14
        },
        refuelingStation: 6,
        doctrine: {
            mercantileNavigationOrOpportunity: 5,
            militaristJumpGate: 4,
            expansionistFlat: 2
        }
    },
    contested: {
        minGap: 0.35,
        relativeGapRatio: 0.06
    }
};

function getFactionTypes() {
    return Array.isArray(FACTION_RULES?.types) && FACTION_RULES.types.length
        ? FACTION_RULES.types
        : DEFAULT_FACTION_TYPES;
}

function getFactionDoctrines() {
    return Array.isArray(FACTION_RULES?.doctrines) && FACTION_RULES.doctrines.length
        ? FACTION_RULES.doctrines
        : DEFAULT_FACTION_DOCTRINES;
}

function getFactionColors() {
    return Array.isArray(FACTION_RULES?.colors) && FACTION_RULES.colors.length
        ? FACTION_RULES.colors
        : DEFAULT_FACTION_COLORS;
}

function getFactionTypeTagHints() {
    return FACTION_RULES?.typeTagHints && typeof FACTION_RULES.typeTagHints === 'object'
        ? FACTION_RULES.typeTagHints
        : DEFAULT_FACTION_TYPE_TAG_HINTS;
}

function getFactionScoringRules() {
    const loaded = FACTION_RULES?.scoring && typeof FACTION_RULES.scoring === 'object'
        ? FACTION_RULES.scoring
        : {};
    return {
        homeSelection: {
            ...DEFAULT_FACTION_SCORING_RULES.homeSelection,
            ...(loaded.homeSelection && typeof loaded.homeSelection === 'object' ? loaded.homeSelection : {})
        },
        influence: {
            system: {
                ...DEFAULT_FACTION_SCORING_RULES.influence.system,
                ...(loaded.influence?.system && typeof loaded.influence.system === 'object' ? loaded.influence.system : {}),
                doctrineModifiers: {
                    ...DEFAULT_FACTION_SCORING_RULES.influence.system.doctrineModifiers,
                    ...(loaded.influence?.system?.doctrineModifiers && typeof loaded.influence.system.doctrineModifiers === 'object'
                        ? loaded.influence.system.doctrineModifiers
                        : {})
                }
            },
            poi: {
                ...DEFAULT_FACTION_SCORING_RULES.influence.poi,
                ...(loaded.influence?.poi && typeof loaded.influence.poi === 'object' ? loaded.influence.poi : {})
            }
        },
        poiBonuses: {
            kind: {
                ...DEFAULT_FACTION_SCORING_RULES.poiBonuses.kind,
                ...(loaded.poiBonuses?.kind && typeof loaded.poiBonuses.kind === 'object' ? loaded.poiBonuses.kind : {})
            },
            category: {
                ...DEFAULT_FACTION_SCORING_RULES.poiBonuses.category,
                ...(loaded.poiBonuses?.category && typeof loaded.poiBonuses.category === 'object' ? loaded.poiBonuses.category : {})
            },
            refuelingStation: Number(loaded.poiBonuses?.refuelingStation ?? DEFAULT_FACTION_SCORING_RULES.poiBonuses.refuelingStation),
            doctrine: {
                ...DEFAULT_FACTION_SCORING_RULES.poiBonuses.doctrine,
                ...(loaded.poiBonuses?.doctrine && typeof loaded.poiBonuses.doctrine === 'object' ? loaded.poiBonuses.doctrine : {})
            }
        },
        contested: {
            ...DEFAULT_FACTION_SCORING_RULES.contested,
            ...(loaded.contested && typeof loaded.contested === 'object' ? loaded.contested : {})
        }
    };
}

function toNameWord(value) {
    const cleaned = String(value || '').replace(/[^A-Za-z0-9'-]/g, '').trim();
    if (!cleaned) return '';
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

function buildFactionName(seedWord, type, index) {
    const base = toNameWord(seedWord) || `Faction ${index + 1}`;
    if (type === 'corporate') return `${base} Combine`;
    if (type === 'coalition') return `${base} Compact`;
    if (type === 'cult') return `Order of ${base}`;
    if (type === 'pirates') return `${base} Corsairs`;
    if (type === 'machine') return `${base} Directive`;
    return `${base} Dominion`;
}

function normalizeColor(color, fallbackIndex = 0) {
    const clean = String(color || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(clean)) return clean;
    const palette = getFactionColors();
    return palette[fallbackIndex % palette.length];
}

function normalizeTagToken(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, ' ')
        .trim();
}

function collectPlanetTagTokens(system) {
    if (!system || !Array.isArray(system.planets)) return [];
    const tokens = [];
    system.planets.forEach((planet) => {
        const tags = Array.isArray(planet && planet.tags) ? planet.tags : [];
        tags.forEach((tag) => {
            const token = normalizeTagToken(tag);
            if (token) tokens.push(token);
        });
    });
    return tokens;
}

function tokenMatchesHint(token, hint) {
    if (!token || !hint) return false;
    return token.includes(hint) || hint.includes(token);
}

function computeTypeTagAffinity(type, tokens) {
    const typeTagHints = getFactionTypeTagHints();
    const hints = Array.isArray(typeTagHints[type]) ? typeTagHints[type] : [];
    if (!hints.length || !tokens.length) return 0;
    let score = 0;
    tokens.forEach((token) => {
        hints.forEach((hint) => {
            if (tokenMatchesHint(token, hint)) score += 1;
        });
    });
    return score;
}

function rankFactionTypesBySectorTags(sectors, randomFn) {
    const sectorTokens = Object.values(sectors || {})
        .flatMap((system) => collectPlanetTagTokens(system));
    return getFactionTypes()
        .map((type) => {
            const tagScore = computeTypeTagAffinity(type, sectorTokens);
            const tieBreaker = (randomFn() * 0.01);
            return {
                type,
                score: 1 + tagScore + tieBreaker
            };
        })
        .sort((a, b) => b.score - a.score || a.type.localeCompare(b.type));
}

function chooseFactionTypesForSector(sectors, count, randomFn) {
    if (count <= 0) return [];
    const ranked = rankFactionTypesBySectorTags(sectors, randomFn);
    if (!ranked.length) return [];
    const selection = [];
    for (let i = 0; i < count; i++) {
        selection.push(ranked[i % ranked.length].type);
    }
    return selection;
}

function buildFactionStats(randomFn) {
    return {
        power: clamp(Math.round(36 + (randomFn() * 46)), 10, 100),
        stability: clamp(Math.round(42 + (randomFn() * 42)), 5, 100),
        wealth: clamp(Math.round(28 + (randomFn() * 52)), 5, 100),
        military: clamp(Math.round(22 + (randomFn() * 58)), 5, 100),
        tech: clamp(Math.round(18 + (randomFn() * 62)), 5, 100)
    };
}

function buildFactionRelations(factions, randomFn) {
    const relationPairs = {};
    factions.forEach((faction) => {
        relationPairs[faction.id] = {};
    });

    for (let i = 0; i < factions.length; i++) {
        for (let j = i + 1; j < factions.length; j++) {
            const value = Math.round((randomFn() * 90) - 45);
            relationPairs[factions[i].id][factions[j].id] = value;
            relationPairs[factions[j].id][factions[i].id] = value;
        }
    }
    return relationPairs;
}

function isControllablePoi(poi) {
    if (!poi || typeof poi !== 'object') return false;
    const controllablePois = FACTION_RULES?.controllablePois && typeof FACTION_RULES.controllablePois === 'object'
        ? FACTION_RULES.controllablePois
        : {};
    const allowedCategories = Array.isArray(controllablePois.categories) ? controllablePois.categories : ['jump_gate'];
    const allowedKinds = Array.isArray(controllablePois.kinds)
        ? controllablePois.kinds.map((kind) => String(kind).trim().toLowerCase())
        : ['navigation', 'opportunity'];
    const allowRefuelingStation = controllablePois.allowRefuelingStation !== false;
    const category = String(poi.poiCategory || '').trim().toLowerCase();
    if (allowedCategories.map((value) => String(value).trim().toLowerCase()).includes(category)) return true;
    if (allowRefuelingStation && poi.isRefuelingStation) return true;
    const kind = String(poi.kind || '').trim().toLowerCase();
    return allowedKinds.includes(kind);
}

function getPoiInfluenceBonus(faction, poi) {
    if (!poi || typeof poi !== 'object') return 0;
    const scoring = getFactionScoringRules();
    const poiBonuses = scoring.poiBonuses;
    let bonus = 0;
    const kind = String(poi.kind || '').trim().toLowerCase();
    const category = String(poi.poiCategory || '').trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(poiBonuses.kind, kind)) bonus += Number(poiBonuses.kind[kind]) || 0;
    if (Object.prototype.hasOwnProperty.call(poiBonuses.category, category)) bonus += Number(poiBonuses.category[category]) || 0;
    if (poi.isRefuelingStation) bonus += Number(poiBonuses.refuelingStation) || 0;
    if (faction.doctrine === 'mercantile' && (kind === 'navigation' || kind === 'opportunity')) {
        bonus += Number(poiBonuses.doctrine.mercantileNavigationOrOpportunity) || 0;
    }
    if (faction.doctrine === 'militarist' && category === 'jump_gate') {
        bonus += Number(poiBonuses.doctrine.militaristJumpGate) || 0;
    }
    if (faction.doctrine === 'expansionist') bonus += Number(poiBonuses.doctrine.expansionistFlat) || 0;
    return bonus;
}

function chooseFactionCount(systemCount, requestedCount = null) {
    if (systemCount <= 0) return 0;
    if (Number.isFinite(requestedCount)) {
        const normalizedRequested = Math.max(0, Math.floor(requestedCount));
        if (normalizedRequested === 0) return 0;
        return clamp(normalizedRequested, 1, systemCount);
    }
    const countRules = FACTION_RULES?.count && typeof FACTION_RULES.count === 'object' ? FACTION_RULES.count : {};
    const systemsPerFaction = Math.max(1, Number(countRules.systemsPerFaction) || 9);
    const base = Number(countRules.base) || 1;
    const min = Math.max(0, Number(countRules.min) || 2);
    const max = Math.min(systemCount, Math.max(min, Number(countRules.max) || 6));
    return clamp(Math.round(systemCount / systemsPerFaction) + base, Math.min(min, max), max);
}

function buildTerritoryTargets(sectors, options = {}) {
    const targets = [];
    const systems = sectors && typeof sectors === 'object' ? sectors : {};
    const deepSpacePois = options.deepSpacePois && typeof options.deepSpacePois === 'object'
        ? options.deepSpacePois
        : {};
    const systemHexIds = Object.keys(systems);

    const minDistanceToAnySystem = (hexId) => {
        if (!systemHexIds.length) return Number.POSITIVE_INFINITY;
        let best = Number.POSITIVE_INFINITY;
        for (let i = 0; i < systemHexIds.length; i++) {
            const distance = hexDistance(hexId, systemHexIds[i]);
            if (distance < best) best = distance;
            if (best <= 0) break;
        }
        return best;
    };

    Object.entries(systems).forEach(([hexId, system]) => {
        targets.push({
            hexId,
            controlKind: 'system',
            system,
            poi: null
        });
    });

    Object.entries(deepSpacePois).forEach(([hexId, poi]) => {
        if (systems[hexId]) return;
        if (!isControllablePoi(poi)) return;
        const controllablePois = FACTION_RULES?.controllablePois && typeof FACTION_RULES.controllablePois === 'object'
            ? FACTION_RULES.controllablePois
            : {};
        const maxSystemDistance = Math.max(0, Number(controllablePois.maxSystemDistance) || 1);
        if (minDistanceToAnySystem(hexId) > maxSystemDistance) return;
        targets.push({
            hexId,
            controlKind: 'poi',
            system: null,
            poi
        });
    });
    return targets;
}

function rankSystemsForHomes(sectors, coreSystemHexId) {
    return Object.entries(sectors || {})
        .map(([hexId, system]) => ({
            hexId,
            system,
            pop: getSystemPopulation(system),
            isCore: coreSystemHexId === hexId,
            tagTokens: collectPlanetTagTokens(system)
        }))
        .sort((a, b) => {
            if (a.isCore !== b.isCore) return a.isCore ? -1 : 1;
            if (b.pop !== a.pop) return b.pop - a.pop;
            return String(a.system && a.system.name ? a.system.name : '').localeCompare(String(b.system && b.system.name ? b.system.name : ''));
        });
}

function scoreHomeCandidateForType(candidate, type) {
    if (!candidate) return Number.NEGATIVE_INFINITY;
    const homeSelection = getFactionScoringRules().homeSelection;
    const typeAffinity = computeTypeTagAffinity(type, candidate.tagTokens || []);
    const popScore = (Number(candidate.pop) || 0) * (Number(homeSelection.populationWeight) || 0);
    const coreScore = candidate.isCore ? (Number(homeSelection.coreBonus) || 0) : 0;
    return (typeAffinity * (Number(homeSelection.typeAffinityWeight) || 0)) + popScore + coreScore;
}

function chooseHomeCandidateForType(candidates, type) {
    if (!Array.isArray(candidates) || !candidates.length) return null;
    const scored = candidates
        .map((candidate) => ({
            candidate,
            score: scoreHomeCandidateForType(candidate, type)
        }))
        .sort((a, b) => b.score - a.score || (b.candidate.pop - a.candidate.pop));
    return scored[0] ? scored[0].candidate : candidates[0];
}

function assignHomesForFactionTypes(homeCandidates, factionTypes) {
    const available = Array.isArray(homeCandidates) ? [...homeCandidates] : [];
    const chosenHomes = [];
    factionTypes.forEach((type) => {
        const picked = chooseHomeCandidateForType(available, type);
        chosenHomes.push(picked || null);
        if (picked) {
            const index = available.findIndex((entry) => entry.hexId === picked.hexId);
            if (index >= 0) available.splice(index, 1);
        }
    });
    return chosenHomes;
}

function buildFactions(homeCandidates, factionTypes, randomFn) {
    const factions = [];
    const homes = assignHomesForFactionTypes(homeCandidates, factionTypes);
    for (let i = 0; i < factionTypes.length; i++) {
        const home = homes[i] || null;
        const availableTypes = getFactionTypes();
        const availableDoctrines = getFactionDoctrines();
        const availableColors = getFactionColors();
        const type = factionTypes[i] || availableTypes[i % availableTypes.length];
        const doctrine = availableDoctrines[Math.floor(randomFn() * availableDoctrines.length)];
        const seedWord = home && home.system && home.system.name ? String(home.system.name).split(/\s+/)[0] : '';
        const stats = buildFactionStats(randomFn);
        factions.push({
            id: `f-${i + 1}`,
            name: buildFactionName(seedWord, type, i),
            type,
            color: normalizeColor(availableColors[i], i),
            doctrine,
            tags: [],
            homeHexId: home ? home.hexId : null,
            homeSectorKey: null,
            ...stats,
            relations: {}
        });
    }
    const relations = buildFactionRelations(factions, randomFn);
    factions.forEach((faction) => {
        faction.relations = relations[faction.id] || {};
    });
    return factions;
}

function scoreInfluenceForFaction(faction, target, homeHexId) {
    const targetHexId = target && target.hexId ? target.hexId : null;
    const controlKind = target && target.controlKind ? target.controlKind : 'system';
    const system = target && target.system ? target.system : null;
    const poi = target && target.poi ? target.poi : null;
    const distance = Number.isFinite(hexDistance(homeHexId, targetHexId)) ? hexDistance(homeHexId, targetHexId) : 99;
    const powerBoost = (Number(faction.power) || 0);
    const militaryBoost = (Number(faction.military) || 0);
    const stableNoise = stableUnitNoise(`${faction.id}:${targetHexId || ''}`);
    const scoring = getFactionScoringRules();
    const systemScoring = scoring.influence.system;
    const poiScoring = scoring.influence.poi;
    if (controlKind === 'system') {
        const popBoost = Math.min(
            Number(systemScoring.populationCap) || 0,
            getSystemPopulation(system) * (Number(systemScoring.populationWeight) || 0)
        );
        const doctrineMod = Number(systemScoring.doctrineModifiers?.[faction.doctrine]) || 0;
        const distanceFalloff = (Number(systemScoring.distanceBase) || 0) + (distance * (Number(systemScoring.distanceScale) || 0));
        const randomNoise = stableNoise * (Number(systemScoring.noiseScale) || 0);
        return Math.max(
            0.05,
            (((powerBoost * (Number(systemScoring.powerWeight) || 0))
                + (militaryBoost * (Number(systemScoring.militaryWeight) || 0))
                + popBoost
                + doctrineMod) / Math.max(0.001, distanceFalloff)) + randomNoise
        );
    }
    if (controlKind === 'poi') {
        const strategicBoost = getPoiInfluenceBonus(faction, poi);
        const distanceFalloff = (Number(poiScoring.distanceBase) || 0) + (distance * (Number(poiScoring.distanceScale) || 0));
        const randomNoise = stableNoise * (Number(poiScoring.noiseScale) || 0);
        return Math.max(
            0.05,
            (((powerBoost * (Number(poiScoring.powerWeight) || 0))
                + (militaryBoost * (Number(poiScoring.militaryWeight) || 0))
                + strategicBoost) / Math.max(0.001, distanceFalloff)) + randomNoise
        );
    }
    const doctrineMod = faction.doctrine === 'expansionist'
        ? 2
        : (faction.doctrine === 'isolationist' ? -3 : 0);
    const distanceFalloff = 8 + (distance * 11);
    const randomNoise = stableNoise * 0.15;
    return Math.max(0.05, (((powerBoost * 0.25) + (militaryBoost * 0.15) + doctrineMod) / distanceFalloff) + randomNoise);
}

function resolveFactionTerritory(factions, sectors, randomFn, options = {}) {
    const controlByHexId = {};
    const targets = buildTerritoryTargets(sectors, options);
    targets.forEach((target) => {
        const hexId = target.hexId;
        const influence = {};
        factions.forEach((faction) => {
            const homeHexId = faction.homeHexId || hexId;
            influence[faction.id] = Number(scoreInfluenceForFaction(faction, target, homeHexId).toFixed(3));
        });
        const ranking = Object.entries(influence).sort((a, b) => b[1] - a[1]);
        const ownerFactionId = ranking.length ? ranking[0][0] : null;
        const top = ranking.length ? ranking[0][1] : 0;
        const second = ranking.length > 1 ? ranking[1][1] : 0;
        const contestedRules = getFactionScoringRules().contested;
        const contestedThreshold = Math.max(
            Number(contestedRules.minGap) || 0,
            top * (Number(contestedRules.relativeGapRatio) || 0)
        );
        const contested = ranking
            .filter(([, value], index) => index > 0 && (top - value) <= contestedThreshold)
            .map(([factionId]) => factionId);
        const controlStrength = clamp(Math.round((top / Math.max(0.2, top + second)) * 100), 1, 100);
        controlByHexId[hexId] = {
            ownerFactionId,
            controlStrength,
            contestedFactionIds: contested,
            influence,
            controlKind: target.controlKind || 'system'
        };
    });
    return controlByHexId;
}

function summarizeFactionSystems(factionState) {
    const counts = {};
    const contestedCounts = {};
    const tileCounts = {};
    const contestedTileCounts = {};
    (factionState.factions || []).forEach((faction) => {
        counts[faction.id] = 0;
        contestedCounts[faction.id] = 0;
        tileCounts[faction.id] = 0;
        contestedTileCounts[faction.id] = 0;
    });
    Object.values(factionState.controlByHexId || {}).forEach((control) => {
        if (!control) return;
        const kind = String(control.controlKind || 'system');
        if (control.ownerFactionId && Object.prototype.hasOwnProperty.call(counts, control.ownerFactionId)) {
            tileCounts[control.ownerFactionId] += 1;
            if (kind === 'system') counts[control.ownerFactionId] += 1;
        }
        (control.contestedFactionIds || []).forEach((factionId) => {
            if (Object.prototype.hasOwnProperty.call(contestedCounts, factionId)) {
                contestedTileCounts[factionId] += 1;
                if (kind === 'system') contestedCounts[factionId] += 1;
            }
        });
    });
    return { counts, contestedCounts, tileCounts, contestedTileCounts };
}

function withFactionSummaries(factionState) {
    const { counts, contestedCounts, tileCounts, contestedTileCounts } = summarizeFactionSystems(factionState);
    const factions = (factionState.factions || []).map((faction) => ({
        ...faction,
        controlledSystems: counts[faction.id] || 0,
        contestedSystems: contestedCounts[faction.id] || 0,
        controlledTiles: tileCounts[faction.id] || 0,
        contestedTiles: contestedTileCounts[faction.id] || 0
    }));
    return {
        ...factionState,
        factions
    };
}

export function createFactionStateForSector(sectors, options = {}) {
    const randomFn = asRandomFn(options.randomFn);
    const ranked = rankSystemsForHomes(sectors, options.coreSystemHexId || null);
    const hasRequestedFactionCount = options.requestedFactionCount !== null
        && typeof options.requestedFactionCount !== 'undefined'
        && String(options.requestedFactionCount).trim() !== '';
    const requestedFactionCount = hasRequestedFactionCount && Number.isFinite(Number(options.requestedFactionCount))
        ? Number(options.requestedFactionCount)
        : null;
    const factionCount = chooseFactionCount(ranked.length, requestedFactionCount);
    if (!factionCount) {
        return {
            turn: 0,
            generatedAt: new Date().toISOString(),
            factions: [],
            controlByHexId: {}
        };
    }

    const factionTypes = chooseFactionTypesForSector(sectors, factionCount, randomFn);
    const factions = buildFactions(ranked, factionTypes, randomFn);
    factions.forEach((faction) => {
        faction.homeSectorKey = options.sectorKey || null;
    });
    const controlByHexId = resolveFactionTerritory(factions, sectors, randomFn, options);
    return withFactionSummaries({
        turn: 0,
        generatedAt: new Date().toISOString(),
        factions,
        controlByHexId
    });
}

function evolveFactionStats(faction, randomFn) {
    const next = { ...faction };
    const drift = () => Math.round((randomFn() * 9) - 4);
    next.power = clamp((Number(next.power) || 0) + drift(), 0, 100);
    next.stability = clamp((Number(next.stability) || 0) + drift(), 0, 100);
    next.wealth = clamp((Number(next.wealth) || 0) + drift(), 0, 100);
    next.military = clamp((Number(next.military) || 0) + drift(), 0, 100);
    next.tech = clamp((Number(next.tech) || 0) + drift(), 0, 100);
    return next;
}

function evolveRelations(factions, randomFn) {
    const byId = {};
    factions.forEach((faction) => {
        byId[faction.id] = { ...(faction.relations || {}) };
    });
    for (let i = 0; i < factions.length; i++) {
        for (let j = i + 1; j < factions.length; j++) {
            const a = factions[i];
            const b = factions[j];
            const current = Number(byId[a.id][b.id] || byId[b.id][a.id] || 0);
            const next = clamp(current + Math.round((randomFn() * 7) - 3), -100, 100);
            byId[a.id][b.id] = next;
            byId[b.id][a.id] = next;
        }
    }
    return factions.map((faction) => ({
        ...faction,
        relations: byId[faction.id] || {}
    }));
}

export function advanceFactionTurn(factionState, sectors, options = {}) {
    if (!factionState || !Array.isArray(factionState.factions)) return factionState;
    const randomFn = asRandomFn(options.randomFn);
    const evolved = factionState.factions.map((faction) => evolveFactionStats(faction, randomFn));
    const withRelations = evolveRelations(evolved, randomFn);
    const controlByHexId = resolveFactionTerritory(withRelations, sectors || {}, randomFn, options);
    return withFactionSummaries({
        ...factionState,
        turn: Math.max(0, Number(factionState.turn) || 0) + 1,
        factions: withRelations,
        controlByHexId,
        updatedAt: new Date().toISOString()
    });
}

export function recalculateFactionTerritory(factionState, sectors, options = {}) {
    if (!factionState || !Array.isArray(factionState.factions)) return factionState;
    const randomFn = asRandomFn(options.randomFn);
    const controlByHexId = resolveFactionTerritory(factionState.factions, sectors || {}, randomFn, options);
    return withFactionSummaries({
        ...factionState,
        controlByHexId
    });
}

export function getFactionControlForHex(factionState, hexId) {
    if (!factionState || !factionState.controlByHexId || !hexId) return null;
    return factionState.controlByHexId[hexId] || null;
}

export function getFactionById(factionState, factionId) {
    if (!factionState || !Array.isArray(factionState.factions) || !factionId) return null;
    return factionState.factions.find((faction) => faction.id === factionId) || null;
}

export function normalizeFactionState(rawValue) {
    if (!rawValue || typeof rawValue !== 'object') return null;
    const factions = Array.isArray(rawValue.factions)
        ? rawValue.factions
            .filter((faction) => faction && typeof faction === 'object' && typeof faction.id === 'string')
            .map((faction, index) => ({
                id: String(faction.id),
                name: String(faction.name || `Faction ${index + 1}`),
                type: String(faction.type || 'empire'),
                color: normalizeColor(faction.color, index),
                doctrine: String(faction.doctrine || 'expansionist'),
                tags: Array.isArray(faction.tags) ? faction.tags.map((tag) => String(tag || '').trim()).filter(Boolean) : [],
                homeHexId: typeof faction.homeHexId === 'string' ? faction.homeHexId : null,
                homeSectorKey: typeof faction.homeSectorKey === 'string' ? faction.homeSectorKey : null,
                power: clamp(Number(faction.power) || 0, 0, 100),
                stability: clamp(Number(faction.stability) || 0, 0, 100),
                wealth: clamp(Number(faction.wealth) || 0, 0, 100),
                military: clamp(Number(faction.military) || 0, 0, 100),
                tech: clamp(Number(faction.tech) || 0, 0, 100),
                relations: faction.relations && typeof faction.relations === 'object'
                    ? Object.fromEntries(Object.entries(faction.relations).map(([id, value]) => [String(id), clamp(Number(value) || 0, -100, 100)]))
                    : {},
                controlledSystems: Math.max(0, Number(faction.controlledSystems) || 0),
                contestedSystems: Math.max(0, Number(faction.contestedSystems) || 0),
                controlledTiles: Math.max(0, Number(faction.controlledTiles) || 0),
                contestedTiles: Math.max(0, Number(faction.contestedTiles) || 0)
            }))
        : [];
    const controlByHexId = rawValue.controlByHexId && typeof rawValue.controlByHexId === 'object'
        ? Object.fromEntries(
            Object.entries(rawValue.controlByHexId)
                .filter(([hexId, control]) => !!parseHex(hexId) && control && typeof control === 'object')
                .map(([hexId, control]) => [hexId, {
                    ownerFactionId: typeof control.ownerFactionId === 'string' ? control.ownerFactionId : null,
                    controlStrength: clamp(Number(control.controlStrength) || 0, 0, 100),
                    contestedFactionIds: Array.isArray(control.contestedFactionIds)
                        ? control.contestedFactionIds.map((id) => String(id || '')).filter(Boolean)
                        : [],
                    influence: control.influence && typeof control.influence === 'object'
                        ? Object.fromEntries(Object.entries(control.influence).map(([id, value]) => [String(id), Number(value) || 0]))
                        : {},
                    controlKind: String(control.controlKind || 'system')
                }])
        )
        : {};

    return withFactionSummaries({
        turn: Math.max(0, Number(rawValue.turn) || 0),
        generatedAt: typeof rawValue.generatedAt === 'string' ? rawValue.generatedAt : null,
        updatedAt: typeof rawValue.updatedAt === 'string' ? rawValue.updatedAt : null,
        factions,
        controlByHexId
    });
}
