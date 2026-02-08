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

const FACTION_TYPES = ['empire', 'corporate', 'coalition', 'cult', 'pirates', 'machine'];
const FACTION_DOCTRINES = ['expansionist', 'mercantile', 'isolationist', 'technocratic', 'militarist', 'zealous'];
const FACTION_COLORS = ['#60a5fa', '#22d3ee', '#34d399', '#f59e0b', '#f472b6', '#a78bfa', '#f87171', '#facc15'];

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
    return FACTION_COLORS[fallbackIndex % FACTION_COLORS.length];
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

function chooseFactionCount(systemCount) {
    if (systemCount <= 0) return 0;
    return clamp(Math.round(systemCount / 9) + 1, 2, 6);
}

function rankSystemsForHomes(sectors, coreSystemHexId) {
    return Object.entries(sectors || {})
        .map(([hexId, system]) => ({
            hexId,
            system,
            pop: getSystemPopulation(system),
            isCore: coreSystemHexId === hexId
        }))
        .sort((a, b) => {
            if (a.isCore !== b.isCore) return a.isCore ? -1 : 1;
            if (b.pop !== a.pop) return b.pop - a.pop;
            return String(a.system && a.system.name ? a.system.name : '').localeCompare(String(b.system && b.system.name ? b.system.name : ''));
        });
}

function buildFactions(homeCandidates, count, randomFn) {
    const factions = [];
    for (let i = 0; i < count; i++) {
        const home = homeCandidates[i] || null;
        const type = FACTION_TYPES[i % FACTION_TYPES.length];
        const doctrine = FACTION_DOCTRINES[Math.floor(randomFn() * FACTION_DOCTRINES.length)];
        const seedWord = home && home.system && home.system.name ? String(home.system.name).split(/\s+/)[0] : '';
        const stats = buildFactionStats(randomFn);
        factions.push({
            id: `f-${i + 1}`,
            name: buildFactionName(seedWord, type, i),
            type,
            color: normalizeColor(FACTION_COLORS[i], i),
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

function scoreInfluenceForFaction(faction, targetHexId, homeHexId, system, randomFn) {
    const distance = Number.isFinite(hexDistance(homeHexId, targetHexId)) ? hexDistance(homeHexId, targetHexId) : 99;
    const popBoost = Math.min(28, getSystemPopulation(system) * 1.4);
    const powerBoost = (Number(faction.power) || 0) * 0.68;
    const militaryBoost = (Number(faction.military) || 0) * 0.4;
    const doctrineMod = faction.doctrine === 'expansionist'
        ? 8
        : (faction.doctrine === 'mercantile' ? 4 : (faction.doctrine === 'isolationist' ? -5 : 0));
    const distanceFalloff = 6 + (distance * 9.5);
    const randomNoise = (randomFn() * 5) - 2.5;
    return Math.max(0.05, ((powerBoost + militaryBoost + popBoost + doctrineMod) / distanceFalloff) + randomNoise);
}

function resolveFactionTerritory(factions, sectors, randomFn) {
    const controlByHexId = {};
    const systems = Object.entries(sectors || {});
    systems.forEach(([hexId, system]) => {
        const influence = {};
        factions.forEach((faction) => {
            const homeHexId = faction.homeHexId || hexId;
            influence[faction.id] = Number(scoreInfluenceForFaction(faction, hexId, homeHexId, system, randomFn).toFixed(3));
        });
        const ranking = Object.entries(influence).sort((a, b) => b[1] - a[1]);
        const ownerFactionId = ranking.length ? ranking[0][0] : null;
        const top = ranking.length ? ranking[0][1] : 0;
        const second = ranking.length > 1 ? ranking[1][1] : 0;
        const contested = ranking
            .filter(([, value], index) => index > 0 && (top - value) <= 0.95)
            .map(([factionId]) => factionId);
        const controlStrength = clamp(Math.round((top / Math.max(0.2, top + second)) * 100), 1, 100);
        controlByHexId[hexId] = {
            ownerFactionId,
            controlStrength,
            contestedFactionIds: contested,
            influence
        };
    });
    return controlByHexId;
}

function summarizeFactionSystems(factionState) {
    const counts = {};
    const contestedCounts = {};
    (factionState.factions || []).forEach((faction) => {
        counts[faction.id] = 0;
        contestedCounts[faction.id] = 0;
    });
    Object.values(factionState.controlByHexId || {}).forEach((control) => {
        if (!control) return;
        if (control.ownerFactionId && Object.prototype.hasOwnProperty.call(counts, control.ownerFactionId)) {
            counts[control.ownerFactionId] += 1;
        }
        (control.contestedFactionIds || []).forEach((factionId) => {
            if (Object.prototype.hasOwnProperty.call(contestedCounts, factionId)) {
                contestedCounts[factionId] += 1;
            }
        });
    });
    return { counts, contestedCounts };
}

function withFactionSummaries(factionState) {
    const { counts, contestedCounts } = summarizeFactionSystems(factionState);
    const factions = (factionState.factions || []).map((faction) => ({
        ...faction,
        controlledSystems: counts[faction.id] || 0,
        contestedSystems: contestedCounts[faction.id] || 0
    }));
    return {
        ...factionState,
        factions
    };
}

export function createFactionStateForSector(sectors, options = {}) {
    const randomFn = asRandomFn(options.randomFn);
    const ranked = rankSystemsForHomes(sectors, options.coreSystemHexId || null);
    const factionCount = chooseFactionCount(ranked.length);
    if (!factionCount) {
        return {
            turn: 0,
            generatedAt: new Date().toISOString(),
            factions: [],
            controlByHexId: {}
        };
    }

    const factions = buildFactions(ranked, factionCount, randomFn);
    factions.forEach((faction) => {
        faction.homeSectorKey = options.sectorKey || null;
    });
    const controlByHexId = resolveFactionTerritory(factions, sectors, randomFn);
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
    const controlByHexId = resolveFactionTerritory(withRelations, sectors || {}, randomFn);
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
    const controlByHexId = resolveFactionTerritory(factionState.factions, sectors || {}, randomFn);
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
                contestedSystems: Math.max(0, Number(faction.contestedSystems) || 0)
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
                        : {}
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
