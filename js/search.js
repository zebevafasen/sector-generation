import { PLANET_TYPES, state } from './config.js';
import { showStatusMessage } from './core.js';
import { EVENTS } from './events.js';
import { findHexGroup, selectHex } from './render.js';
import { getGlobalHexDisplayId } from './render-shared.js';
import { countSystemBodies, isPlanetaryBody } from './body-classification.js';
import { getFactionById, getFactionControlForHex } from './factions.js';
import { escapeHtml } from './info-panel-ui.js';
import { getSystemStars } from './star-system.js';
import { getKnownPlanetTags } from './tooltip-data.js';

function getSearchRefs() {
    return {
        panelHeader: document.getElementById('searchPanelHeader'),
        panelContent: document.getElementById('searchPanelContent'),
        toggleBtn: document.getElementById('searchToggleBtn'),
        nameInput: document.getElementById('searchNameInput'),
        scopeSelect: document.getElementById('searchScopeSelect'),
        sortSelect: document.getElementById('searchSortSelect'),
        starClassSelect: document.getElementById('searchStarClassSelect'),
        tagSelect: document.getElementById('searchTagSelect'),
        planetTypeSelect: document.getElementById('searchPlanetTypeSelect'),
        factionSelect: document.getElementById('searchFactionSelect'),
        resultLimitSelect: document.getElementById('searchResultLimitSelect'),
        minPopInput: document.getElementById('searchMinPopInput'),
        maxPopInput: document.getElementById('searchMaxPopInput'),
        minPlanetsInput: document.getElementById('searchMinPlanetsInput'),
        maxPlanetsInput: document.getElementById('searchMaxPlanetsInput'),
        inhabitedOnlyToggle: document.getElementById('searchInhabitedOnlyToggle'),
        coreOnlyToggle: document.getElementById('searchCoreOnlyToggle'),
        pinnedOnlyToggle: document.getElementById('searchPinnedOnlyToggle'),
        multiStarOnlyToggle: document.getElementById('searchMultiStarOnlyToggle'),
        contestedOnlyToggle: document.getElementById('searchContestedOnlyToggle'),
        applyBtn: document.getElementById('searchApplyBtn'),
        clearBtn: document.getElementById('searchClearBtn'),
        resultsCount: document.getElementById('searchResultsCount'),
        resultsList: document.getElementById('searchResultsList')
    };
}

function normalize(value) {
    return String(value || '').trim().toLowerCase();
}

function toNumberOrNull(value) {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw.length) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

function tokenizeQuery(query) {
    return normalize(query).split(/\s+/g).filter(Boolean);
}

function getSystemPopulation(system) {
    if (!system || !Array.isArray(system.planets)) return 0;
    return system.planets.reduce((sum, body) => {
        const pop = Number(body && body.pop);
        return Number.isFinite(pop) && pop > 0 ? sum + pop : sum;
    }, 0);
}

function isSystemInhabited(system) {
    if (!system || !Array.isArray(system.planets)) return false;
    return system.planets.some((body) => isPlanetaryBody(body) && !!body.habitable && Number(body.pop) > 0);
}

function systemHasTag(system, tagValue) {
    if (!tagValue || !system || !Array.isArray(system.planets)) return true;
    return system.planets.some((body) => {
        if (!isPlanetaryBody(body) || !Array.isArray(body.tags)) return false;
        return body.tags.includes(tagValue);
    });
}

function systemHasPlanetType(system, planetType) {
    if (!planetType || !system || !Array.isArray(system.planets)) return true;
    return system.planets.some((body) => isPlanetaryBody(body) && String(body.type || '') === planetType);
}

function getBodyCounts(system) {
    return countSystemBodies(system);
}

function readFilters(refs) {
    const minPop = toNumberOrNull(refs.minPopInput?.value);
    const maxPop = toNumberOrNull(refs.maxPopInput?.value);
    const minPlanets = toNumberOrNull(refs.minPlanetsInput?.value);
    const maxPlanets = toNumberOrNull(refs.maxPlanetsInput?.value);
    const resultLimitRaw = toNumberOrNull(refs.resultLimitSelect?.value);
    return {
        queryTokens: tokenizeQuery(refs.nameInput?.value),
        scope: refs.scopeSelect?.value || 'all',
        sortBy: refs.sortSelect?.value || 'relevance',
        starClass: refs.starClassSelect?.value || '',
        tag: refs.tagSelect?.value || '',
        planetType: refs.planetTypeSelect?.value || '',
        factionOwnerId: refs.factionSelect?.value || '',
        inhabitedOnly: !!(refs.inhabitedOnlyToggle && refs.inhabitedOnlyToggle.checked),
        coreOnly: !!(refs.coreOnlyToggle && refs.coreOnlyToggle.checked),
        pinnedOnly: !!(refs.pinnedOnlyToggle && refs.pinnedOnlyToggle.checked),
        multiStarOnly: !!(refs.multiStarOnlyToggle && refs.multiStarOnlyToggle.checked),
        contestedOnly: !!(refs.contestedOnlyToggle && refs.contestedOnlyToggle.checked),
        minPop: Number.isFinite(minPop) ? minPop : null,
        maxPop: Number.isFinite(maxPop) ? maxPop : null,
        minPlanets: Number.isFinite(minPlanets) ? minPlanets : null,
        maxPlanets: Number.isFinite(maxPlanets) ? maxPlanets : null,
        resultLimit: Number.isFinite(resultLimitRaw) ? Math.max(0, Math.floor(resultLimitRaw)) : 50
    };
}

function buildSearchEntries() {
    const entries = [];

    Object.entries(state.sectors || {}).forEach(([hexId, system]) => {
        if (!system) return;
        const stars = getSystemStars(system);
        const starClasses = stars.map((star) => String(star.class || '').trim()).filter(Boolean);
        const bodyCounts = getBodyCounts(system);
        const totalPop = getSystemPopulation(system);
        const isInhabited = isSystemInhabited(system);
        const tags = new Set();
        const bodyNames = [];
        const bodyTypes = new Set();
        const factionControl = getFactionControlForHex(state.factionState, hexId);
        const ownerFactionId = factionControl && factionControl.ownerFactionId ? factionControl.ownerFactionId : null;
        const ownerFaction = ownerFactionId ? getFactionById(state.factionState, ownerFactionId) : null;
        const contestedFactionIds = factionControl && Array.isArray(factionControl.contestedFactionIds)
            ? factionControl.contestedFactionIds
            : [];
        (system.planets || []).forEach((body) => {
            if (!body) return;
            bodyNames.push(String(body.name || ''));
            if (isPlanetaryBody(body)) {
                bodyTypes.add(String(body.type || ''));
                if (Array.isArray(body.tags)) {
                    body.tags.forEach((tag) => tags.add(String(tag || '')));
                }
            }
        });

        entries.push({
            type: 'system',
            hexId,
            displayHexId: getGlobalHexDisplayId(hexId),
            system,
            name: String(system.name || 'Unnamed System'),
            totalPop,
            bodyCounts,
            isInhabited,
            isPinned: !!(state.pinnedHexIds && state.pinnedHexIds.includes(hexId)),
            isCore: state.coreSystemHexId === hexId,
            isMultiStar: starClasses.length > 1,
            ownerFactionId,
            ownerFactionName: ownerFaction ? ownerFaction.name : null,
            contestedFactionIds,
            isContested: contestedFactionIds.length > 0,
            starClasses,
            tags: Array.from(tags),
            bodyTypes: Array.from(bodyTypes),
            bodyNames,
            queryText: normalize([
                system.name,
                getGlobalHexDisplayId(hexId),
                hexId,
                starClasses.join(' '),
                Array.from(tags).join(' '),
                Array.from(bodyTypes).join(' '),
                bodyNames.join(' '),
                ownerFaction ? ownerFaction.name : '',
                contestedFactionIds
                    .map((factionId) => getFactionById(state.factionState, factionId))
                    .filter(Boolean)
                    .map((faction) => faction.name)
                    .join(' ')
            ].join(' '))
        });
    });

    Object.entries(state.deepSpacePois || {}).forEach(([hexId, poi]) => {
        if (!poi) return;
        const factionControl = getFactionControlForHex(state.factionState, hexId);
        const ownerFactionId = factionControl && factionControl.ownerFactionId ? factionControl.ownerFactionId : null;
        const ownerFaction = ownerFactionId ? getFactionById(state.factionState, ownerFactionId) : null;
        const contestedFactionIds = factionControl && Array.isArray(factionControl.contestedFactionIds)
            ? factionControl.contestedFactionIds
            : [];
        entries.push({
            type: 'poi',
            hexId,
            displayHexId: getGlobalHexDisplayId(hexId),
            poi,
            name: String(poi.name || 'Deep-Space POI'),
            isPinned: !!(state.pinnedHexIds && state.pinnedHexIds.includes(hexId)),
            ownerFactionId,
            ownerFactionName: ownerFaction ? ownerFaction.name : null,
            contestedFactionIds,
            isContested: contestedFactionIds.length > 0,
            queryText: normalize([
                poi.name,
                poi.kind,
                poi.poiCategory,
                poi.summary,
                poi.rewardHint,
                poi.risk,
                ownerFaction ? ownerFaction.name : '',
                getGlobalHexDisplayId(hexId),
                hexId
            ].join(' '))
        });
    });

    return entries;
}

function scoreEntry(entry, filters) {
    const tokens = filters.queryTokens;
    if (!tokens.length) return 0;

    let score = 0;
    const name = normalize(entry.name);
    const displayHexId = normalize(entry.displayHexId);
    const rawHexId = normalize(entry.hexId);
    for (const token of tokens) {
        if (!entry.queryText.includes(token)) return Number.NEGATIVE_INFINITY;

        if (name === token) {
            score += 120;
        } else if (name.startsWith(token)) {
            score += 85;
        } else if (name.includes(token)) {
            score += 60;
        } else {
            score += 15;
        }

        if (displayHexId === token || rawHexId === token) {
            score += 100;
        } else if (displayHexId.includes(token) || rawHexId.includes(token)) {
            score += 45;
        }

        if (entry.type === 'system') {
            if (entry.starClasses.some((starClass) => normalize(starClass) === token)) score += 35;
            if (entry.tags.some((tag) => normalize(tag).includes(token))) score += 25;
            if (entry.bodyTypes.some((bodyType) => normalize(bodyType).includes(token))) score += 20;
        } else if (entry.type === 'poi') {
            if (normalize(entry.poi.kind).includes(token)) score += 22;
            if (normalize(entry.poi.poiCategory).includes(token)) score += 22;
        }
    }
    return score;
}

function isSystemOnlyFilterActive(filters) {
    return Boolean(
        filters.starClass
        || filters.tag
        || filters.planetType
        || filters.inhabitedOnly
        || filters.coreOnly
        || filters.multiStarOnly
        || filters.contestedOnly
        || filters.minPop != null
        || filters.maxPop != null
        || filters.minPlanets != null
        || filters.maxPlanets != null
    );
}

function sortMatches(entries, filters) {
    const byName = (a, b) => a.name.localeCompare(b.name);
    const byHex = (a, b) => a.displayHexId.localeCompare(b.displayHexId);

    const relevanceSort = (a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const typeOrder = a.type === b.type ? 0 : (a.type === 'system' ? -1 : 1);
        if (typeOrder !== 0) return typeOrder;
        return byName(a, b);
    };

    if (filters.sortBy === 'name') return entries.sort(byName);
    if (filters.sortBy === 'hex') return entries.sort(byHex);
    if (filters.sortBy === 'population') {
        return entries.sort((a, b) => {
            const popA = a.type === 'system' ? a.totalPop : -1;
            const popB = b.type === 'system' ? b.totalPop : -1;
            if (popB !== popA) return popB - popA;
            return byName(a, b);
        });
    }
    if (filters.sortBy === 'planets') {
        return entries.sort((a, b) => {
            const countA = a.type === 'system' ? a.bodyCounts.planets : -1;
            const countB = b.type === 'system' ? b.bodyCounts.planets : -1;
            if (countB !== countA) return countB - countA;
            return byName(a, b);
        });
    }
    return entries.sort(relevanceSort);
}

function hasActiveSearchCriteria(filters) {
    return Boolean(
        (filters.queryTokens && filters.queryTokens.length)
        || filters.scope === 'systems'
        || filters.scope === 'pois'
        || filters.starClass
        || filters.tag
        || filters.planetType
        || filters.factionOwnerId
        || filters.inhabitedOnly
        || filters.coreOnly
        || filters.pinnedOnly
        || filters.multiStarOnly
        || filters.contestedOnly
        || filters.minPop != null
        || filters.maxPop != null
        || filters.minPlanets != null
        || filters.maxPlanets != null
    );
}

function applySearchMapDimming(filters, matches) {
    const groups = document.querySelectorAll('.hex-group');
    if (!groups.length) return;

    const active = hasActiveSearchCriteria(filters);
    if (!active) {
        groups.forEach((group) => group.classList.remove('search-dimmed'));
        return;
    }

    const currentSectorKey = String(state.multiSector?.currentKey || 'NNNN').trim().toUpperCase();
    const matchedHexIds = new Set(matches.map((match) => String(match.hexId || '')));
    groups.forEach((group) => {
        const groupHexId = String(group.getAttribute('data-id') || '');
        const groupSectorKey = String(group.getAttribute('data-sector-key') || '').trim().toUpperCase();
        const isCurrentSector = !state.multiSector?.expandedView || groupSectorKey === currentSectorKey;
        const isMatch = isCurrentSector && matchedHexIds.has(groupHexId);
        group.classList.toggle('search-dimmed', !isMatch);
    });
}

function findMatches(filters) {
    const entries = buildSearchEntries();
    const systemOnlyFilterActive = isSystemOnlyFilterActive(filters);
    const scoped = entries.filter((entry) => {
        if (filters.scope === 'systems' && entry.type !== 'system') return false;
        if (filters.scope === 'pois' && entry.type !== 'poi') return false;
        if (filters.pinnedOnly && !entry.isPinned) return false;
        if (filters.factionOwnerId && entry.ownerFactionId !== filters.factionOwnerId) return false;
        if (filters.contestedOnly && !entry.isContested) return false;

        if (entry.type === 'poi' && systemOnlyFilterActive) return false;

        if (entry.type === 'system') {
            if (filters.starClass && !entry.starClasses.includes(filters.starClass)) return false;
            if (filters.inhabitedOnly && !entry.isInhabited) return false;
            if (filters.coreOnly && !entry.isCore) return false;
            if (filters.multiStarOnly && !entry.isMultiStar) return false;
            if (!systemHasTag(entry.system, filters.tag)) return false;
            if (!systemHasPlanetType(entry.system, filters.planetType)) return false;
            if (filters.minPop != null && entry.totalPop < filters.minPop) return false;
            if (filters.maxPop != null && entry.totalPop > filters.maxPop) return false;
            if (filters.minPlanets != null && entry.bodyCounts.planets < filters.minPlanets) return false;
            if (filters.maxPlanets != null && entry.bodyCounts.planets > filters.maxPlanets) return false;
        }

        return true;
    });

    const withScore = scoped
        .map((entry) => ({ ...entry, score: scoreEntry(entry, filters) }))
        .filter((entry) => entry.score > Number.NEGATIVE_INFINITY);

    return sortMatches(withScore, filters);
}

function renderResults(refs, matches, filters) {
    if (!refs.resultsCount || !refs.resultsList) return;

    const limit = filters.resultLimit <= 0 ? matches.length : Math.min(filters.resultLimit, matches.length);
    const shownMatches = matches.slice(0, limit);
    refs.resultsCount.innerText = shownMatches.length === matches.length
        ? `${shownMatches.length} ${shownMatches.length === 1 ? 'match' : 'matches'}`
        : `${shownMatches.length} of ${matches.length} matches`;
    refs.resultsList.innerHTML = '';

    if (!shownMatches.length) {
        refs.resultsList.innerHTML = '<li class="text-[11px] text-slate-500 italic">No results match the current search.</li>';
        return;
    }

    const markup = shownMatches.map((item) => {
        const active = item.hexId === state.selectedHexId;
        const popLabel = item.type === 'system' && item.totalPop > 0 ? `${item.totalPop.toFixed(1)}B` : 'None';
        const classes = active
            ? 'w-full text-left rounded border border-sky-600 bg-sky-900/30 px-2 py-1.5'
            : 'w-full text-left rounded border border-slate-700 bg-slate-800/60 hover:border-sky-500 px-2 py-1.5';
        const safeName = escapeHtml(item.name || (item.type === 'poi' ? 'Deep-Space POI' : 'Unnamed System'));
        const safeHexId = escapeHtml(item.displayHexId || getGlobalHexDisplayId(item.hexId));
        const safePopLabel = escapeHtml(popLabel);

        if (item.type === 'poi') {
            const poiKind = escapeHtml(String(item.poi && item.poi.kind ? item.poi.kind : 'Unknown'));
            const poiRisk = escapeHtml(String(item.poi && item.poi.risk ? item.poi.risk : 'Unknown'));
            const markerParts = [];
            if (item.isPinned) markerParts.push('Pinned');
            if (item.ownerFactionName) markerParts.push(item.ownerFactionName);
            if (item.isContested) markerParts.push('Contested');
            const pinnedLabel = markerParts.length ? ` - ${escapeHtml(markerParts.join(' / '))}` : '';
            return `
                <li>
                    <button type="button" class="${classes}" data-search-hex-id="${item.hexId}">
                        <div class="text-xs text-violet-200 font-semibold">${safeName}</div>
                        <div class="text-[10px] text-slate-400">${safeHexId} - POI ${poiKind}${pinnedLabel}</div>
                        <div class="text-[10px] text-slate-500">Risk ${poiRisk}</div>
                    </button>
                </li>
            `;
        }

        const starLabel = escapeHtml(item.starClasses.length ? item.starClasses.join(' + ') : '--');
        const flagParts = [];
        if (item.isCore) flagParts.push('Core');
        if (item.isPinned) flagParts.push('Pinned');
        if (item.isInhabited) flagParts.push('Inhabited');
        if (item.isMultiStar) flagParts.push('Multi-star');
        if (item.ownerFactionName) flagParts.push(item.ownerFactionName);
        if (item.isContested) flagParts.push('Contested');
        const flagLabel = flagParts.length ? ` - ${escapeHtml(flagParts.join(' / '))}` : '';
        return `
            <li>
                <button type="button" class="${classes}" data-search-hex-id="${item.hexId}">
                    <div class="text-xs text-sky-200 font-semibold">${safeName}</div>
                    <div class="text-[10px] text-slate-400">${safeHexId} - Class ${starLabel} - Pop ${safePopLabel}${flagLabel}</div>
                    <div class="text-[10px] text-slate-500">${item.bodyCounts.planets}P / ${item.bodyCounts.belts}B / ${item.bodyCounts.stations}S</div>
                </button>
            </li>
        `;
    }).join('');
    refs.resultsList.innerHTML = markup;
}

function validateFilters(filters) {
    if (filters.minPop != null && filters.maxPop != null && filters.minPop > filters.maxPop) {
        showStatusMessage('Min population cannot exceed max population.', 'warn');
        return false;
    }
    if (filters.minPlanets != null && filters.maxPlanets != null && filters.minPlanets > filters.maxPlanets) {
        showStatusMessage('Min planets cannot exceed max planets.', 'warn');
        return false;
    }
    return true;
}

function runSearch(refs) {
    const filters = readFilters(refs);
    if (!validateFilters(filters)) return [];
    const matches = findMatches(filters);
    renderResults(refs, matches, filters);
    applySearchMapDimming(filters, matches);
    return matches;
}

function clearFilters(refs) {
    if (refs.nameInput) refs.nameInput.value = '';
    if (refs.scopeSelect) refs.scopeSelect.value = 'all';
    if (refs.sortSelect) refs.sortSelect.value = 'relevance';
    if (refs.starClassSelect) refs.starClassSelect.value = '';
    if (refs.tagSelect) refs.tagSelect.value = '';
    if (refs.planetTypeSelect) refs.planetTypeSelect.value = '';
    if (refs.factionSelect) refs.factionSelect.value = '';
    if (refs.resultLimitSelect) refs.resultLimitSelect.value = '50';
    if (refs.minPopInput) refs.minPopInput.value = '';
    if (refs.maxPopInput) refs.maxPopInput.value = '';
    if (refs.minPlanetsInput) refs.minPlanetsInput.value = '';
    if (refs.maxPlanetsInput) refs.maxPlanetsInput.value = '';
    if (refs.inhabitedOnlyToggle) refs.inhabitedOnlyToggle.checked = false;
    if (refs.coreOnlyToggle) refs.coreOnlyToggle.checked = false;
    if (refs.pinnedOnlyToggle) refs.pinnedOnlyToggle.checked = false;
    if (refs.multiStarOnlyToggle) refs.multiStarOnlyToggle.checked = false;
    if (refs.contestedOnlyToggle) refs.contestedOnlyToggle.checked = false;
    runSearch(refs);
}

function populateSearchOptions(refs) {
    if (!refs.tagSelect) return;
    const tags = getKnownPlanetTags();
    refs.tagSelect.innerHTML = [
        '<option value="">Any Tag</option>',
        ...tags.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`)
    ].join('');

    if (!refs.planetTypeSelect) return;
    refs.planetTypeSelect.innerHTML = [
        '<option value="">Any Planet Type</option>',
        ...PLANET_TYPES.map((planetType) => `<option value="${escapeHtml(planetType)}">${escapeHtml(planetType)}</option>`)
    ].join('');

    if (refs.factionSelect) {
        const factions = Array.isArray(state.factionState && state.factionState.factions) ? state.factionState.factions : [];
        refs.factionSelect.innerHTML = [
            '<option value="">Any Faction Owner</option>',
            ...factions.map((faction) => `<option value="${escapeHtml(faction.id)}">${escapeHtml(faction.name)}</option>`)
        ].join('');
    }
}

function openSearchPanelAndFocusInput(refs) {
    if (!refs || !refs.nameInput) return;
    if (refs.panelContent && refs.toggleBtn && refs.panelContent.classList.contains('hidden')) {
        refs.toggleBtn.click();
    }
    requestAnimationFrame(() => {
        refs.nameInput.focus();
        refs.nameInput.select();
    });
}

export function setupSearchPanel() {
    const refs = getSearchRefs();
    if (!refs.resultsList) return;
    let lastMatches = [];
    let liveSearchTimer = null;
    populateSearchOptions(refs);

    refs.applyBtn?.addEventListener('click', () => {
        lastMatches = runSearch(refs);
    });
    refs.clearBtn?.addEventListener('click', () => clearFilters(refs));
    refs.panelHeader?.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target && target.closest('#searchToggleBtn')) return;
        openSearchPanelAndFocusInput(refs);
    });
    refs.panelHeader?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openSearchPanelAndFocusInput(refs);
    });
    refs.nameInput?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        if (!lastMatches.length) {
            lastMatches = runSearch(refs);
        }
        const first = lastMatches[0];
        if (!first) return;
        const group = findHexGroup(first.hexId);
        if (!group) return;
        selectHex(first.hexId, group);
        lastMatches = runSearch(refs);
    });

    const queueLiveSearch = () => {
        if (liveSearchTimer) window.clearTimeout(liveSearchTimer);
        liveSearchTimer = window.setTimeout(() => {
            liveSearchTimer = null;
            lastMatches = runSearch(refs);
        }, 120);
    };

    const liveFilterElements = [
        refs.nameInput,
        refs.scopeSelect,
        refs.sortSelect,
        refs.starClassSelect,
        refs.tagSelect,
        refs.planetTypeSelect,
        refs.factionSelect,
        refs.resultLimitSelect,
        refs.minPopInput,
        refs.maxPopInput,
        refs.minPlanetsInput,
        refs.maxPlanetsInput,
        refs.inhabitedOnlyToggle,
        refs.coreOnlyToggle,
        refs.pinnedOnlyToggle,
        refs.multiStarOnlyToggle
        ,
        refs.contestedOnlyToggle
    ];
    liveFilterElements.forEach((el) => {
        if (!el) return;
        el.addEventListener('input', queueLiveSearch);
        el.addEventListener('change', queueLiveSearch);
    });

    refs.resultsList.addEventListener('click', (event) => {
        const button = event.target instanceof Element ? event.target.closest('[data-search-hex-id]') : null;
        if (!button) return;
        const hexId = button.getAttribute('data-search-hex-id');
        if (!hexId) return;
        const group = findHexGroup(hexId);
        if (!group) {
            showStatusMessage(`Unable to focus ${getGlobalHexDisplayId(hexId)}.`, 'warn');
            return;
        }
        selectHex(hexId, group);
        lastMatches = runSearch(refs);
    });

    window.addEventListener(EVENTS.SECTOR_DATA_CHANGED, () => {
        populateSearchOptions(refs);
        lastMatches = runSearch(refs);
    });
    window.addEventListener(EVENTS.HEX_SELECTED, () => {
        lastMatches = runSearch(refs);
    });
    window.addEventListener(EVENTS.FACTION_STATE_CHANGED, () => {
        populateSearchOptions(refs);
        lastMatches = runSearch(refs);
    });
    lastMatches = runSearch(refs);
}
