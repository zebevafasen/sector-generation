import { state } from './config.js';
import { showStatusMessage } from './core.js';
import { EVENTS } from './events.js';
import { selectHex } from './render.js';
import { getGlobalHexDisplayId } from './render-shared.js';
import { countSystemBodies, isPlanetaryBody } from './body-classification.js';
import { escapeHtml } from './info-panel-ui.js';

function getSearchRefs() {
    return {
        nameInput: document.getElementById('searchNameInput'),
        starClassSelect: document.getElementById('searchStarClassSelect'),
        tagSelect: document.getElementById('searchTagSelect'),
        minPopInput: document.getElementById('searchMinPopInput'),
        maxPopInput: document.getElementById('searchMaxPopInput'),
        inhabitedOnlyToggle: document.getElementById('searchInhabitedOnlyToggle'),
        applyBtn: document.getElementById('searchApplyBtn'),
        clearBtn: document.getElementById('searchClearBtn'),
        resultsCount: document.getElementById('searchResultsCount'),
        resultsList: document.getElementById('searchResultsList')
    };
}

function normalize(value) {
    return String(value || '').trim().toLowerCase();
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

function getBodyCounts(system) {
    return countSystemBodies(system);
}

function readFilters(refs) {
    const minPop = parseFloat(refs.minPopInput?.value || '');
    const maxPop = parseFloat(refs.maxPopInput?.value || '');
    return {
        nameNeedle: normalize(refs.nameInput?.value),
        starClass: refs.starClassSelect?.value || '',
        tag: refs.tagSelect?.value || '',
        inhabitedOnly: !!(refs.inhabitedOnlyToggle && refs.inhabitedOnlyToggle.checked),
        minPop: Number.isFinite(minPop) ? minPop : null,
        maxPop: Number.isFinite(maxPop) ? maxPop : null
    };
}

function findMatches(filters) {
    const entries = Object.entries(state.sectors || {});
    return entries
        .filter(([, system]) => {
            if (!system) return false;
            if (filters.nameNeedle && !normalize(system.name).includes(filters.nameNeedle)) return false;
            if (filters.starClass && system.starClass !== filters.starClass) return false;
            if (filters.inhabitedOnly && !isSystemInhabited(system)) return false;
            if (!systemHasTag(system, filters.tag)) return false;

            const totalPop = getSystemPopulation(system);
            if (filters.minPop != null && totalPop < filters.minPop) return false;
            if (filters.maxPop != null && totalPop > filters.maxPop) return false;
            return true;
        })
        .map(([hexId, system]) => ({
            hexId,
            system,
            totalPop: getSystemPopulation(system),
            bodyCounts: getBodyCounts(system)
        }))
        .sort((a, b) => a.system.name.localeCompare(b.system.name));
}

function renderResults(refs, matches) {
    if (!refs.resultsCount || !refs.resultsList) return;
    refs.resultsCount.innerText = `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`;
    refs.resultsList.innerHTML = '';

    if (!matches.length) {
        refs.resultsList.innerHTML = '<li class="text-[11px] text-slate-500 italic">No systems match current filters.</li>';
        return;
    }

    const markup = matches.map((item) => {
        const active = item.hexId === state.selectedHexId;
        const popLabel = item.totalPop > 0 ? `${item.totalPop.toFixed(1)}B` : 'None';
        const classes = active
            ? 'w-full text-left rounded border border-sky-600 bg-sky-900/30 px-2 py-1.5'
            : 'w-full text-left rounded border border-slate-700 bg-slate-800/60 hover:border-sky-500 px-2 py-1.5';
        const safeName = escapeHtml(item.system.name || 'Unnamed System');
        const safeHexId = escapeHtml(getGlobalHexDisplayId(item.hexId));
        const safeStarClass = escapeHtml(item.system.starClass || '--');
        const safePopLabel = escapeHtml(popLabel);
        return `
            <li>
                <button type="button" class="${classes}" data-search-hex-id="${item.hexId}">
                    <div class="text-xs text-sky-200 font-semibold">${safeName}</div>
                    <div class="text-[10px] text-slate-400">${safeHexId} - Class ${safeStarClass} - Pop ${safePopLabel}</div>
                    <div class="text-[10px] text-slate-500">${item.bodyCounts.planets}P / ${item.bodyCounts.belts}B / ${item.bodyCounts.stations}S</div>
                </button>
            </li>
        `;
    }).join('');
    refs.resultsList.innerHTML = markup;
}

function runSearch(refs) {
    const filters = readFilters(refs);
    if (filters.minPop != null && filters.maxPop != null && filters.minPop > filters.maxPop) {
        showStatusMessage('Min population cannot exceed max population.', 'warn');
        return;
    }
    const matches = findMatches(filters);
    renderResults(refs, matches);
}

function clearFilters(refs) {
    if (refs.nameInput) refs.nameInput.value = '';
    if (refs.starClassSelect) refs.starClassSelect.value = '';
    if (refs.tagSelect) refs.tagSelect.value = '';
    if (refs.minPopInput) refs.minPopInput.value = '';
    if (refs.maxPopInput) refs.maxPopInput.value = '';
    if (refs.inhabitedOnlyToggle) refs.inhabitedOnlyToggle.checked = false;
    runSearch(refs);
}

export function setupSearchPanel() {
    const refs = getSearchRefs();
    if (!refs.resultsList) return;

    refs.applyBtn?.addEventListener('click', () => runSearch(refs));
    refs.clearBtn?.addEventListener('click', () => clearFilters(refs));

    const liveFilterElements = [
        refs.nameInput,
        refs.starClassSelect,
        refs.tagSelect,
        refs.minPopInput,
        refs.maxPopInput,
        refs.inhabitedOnlyToggle
    ];
    liveFilterElements.forEach((el) => {
        if (!el) return;
        el.addEventListener('input', () => runSearch(refs));
        el.addEventListener('change', () => runSearch(refs));
    });

    refs.resultsList.addEventListener('click', (event) => {
        const button = event.target instanceof Element ? event.target.closest('[data-search-hex-id]') : null;
        if (!button) return;
        const hexId = button.getAttribute('data-search-hex-id');
        if (!hexId) return;
        const group = document.querySelector(`.hex-group[data-id="${hexId}"]`);
        if (!group) {
            showStatusMessage(`Unable to focus ${getGlobalHexDisplayId(hexId)}.`, 'warn');
            return;
        }
        selectHex(hexId, group);
        runSearch(refs);
    });

    window.addEventListener(EVENTS.SECTOR_DATA_CHANGED, () => runSearch(refs));
    runSearch(refs);
}
