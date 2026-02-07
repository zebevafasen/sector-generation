import { state } from './config.js';
import { getBodyIconMarkup, normalizeBodyType } from './body-icons.js';
import { EVENTS, emitEvent } from './events.js';
import { reportSystemInvariantIssues } from './invariants.js';
import { generatePlanetEnvironment } from './planet-environment.js';
import { refreshSystemPlanetPopulation } from './planet-population.js';
import { refreshSystemPlanetTags } from './planet-tags.js';
import { countSystemBodies, isArtificialBodyType, isBeltOrFieldBodyType, isPlanetaryBodyType } from './body-classification.js';
import { positionBodyDetailsPanel, resetBodyDetailsPanel, showBodyDetailsPanel } from './render-body-details.js';
import { escapeHtml, setBodySummaryLabels, setButtonAction, setInhabitButtonStyle } from './info-panel-ui.js';
import { rand } from './core.js';

function bindBodyListHandlers(list) {
    if (!list || list.dataset.bodyHandlersBound === '1') return;
    list.dataset.bodyHandlersBound = '1';

    list.addEventListener('click', (event) => {
        const context = list._bodyListContext;
        if (!context) return;
        const row = event.target instanceof Element ? event.target.closest('[data-body-index]') : null;
        if (!row) return;

        const bodyIndex = parseInt(row.getAttribute('data-body-index') || '-1', 10);
        if (!Number.isInteger(bodyIndex) || bodyIndex < 0) return;

        const renameBtn = event.target instanceof Element ? event.target.closest('.body-rename-btn') : null;
        if (renameBtn) {
            event.preventDefault();
            event.stopPropagation();
            const fallbackName = row.getAttribute('data-body-name') || '';
            context.renameBodyAtIndex(bodyIndex, fallbackName);
            return;
        }

        context.selectBodyByIndex(bodyIndex, row);
    });

    list.addEventListener('keydown', (event) => {
        const context = list._bodyListContext;
        if (!context) return;
        const row = event.target instanceof Element ? event.target.closest('[data-body-index]') : null;
        if (!row) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;

        const bodyIndex = parseInt(row.getAttribute('data-body-index') || '-1', 10);
        if (!Number.isInteger(bodyIndex) || bodyIndex < 0) return;

        event.preventDefault();
        context.selectBodyByIndex(bodyIndex, row);
    });
}

export function renderSystemBodyLists({ refs, system, id, preselectedBodyIndex, notifySectorDataChanged, updateInfoPanel }) {
    if (!(refs.planetList && refs.beltList && refs.stationList)) return;

    const bodyLists = [refs.planetList, refs.beltList, refs.stationList];
    let selectedBodyEl = null;

    refs.planetList.innerHTML = '';
    refs.beltList.innerHTML = '';
    refs.stationList.innerHTML = '';
    resetBodyDetailsPanel();

    const renameBodyAtIndex = (bodyIndex, fallbackName) => {
        const currentName = system.planets[bodyIndex] ? system.planets[bodyIndex].name : fallbackName;
        const nextNameRaw = prompt('Rename object', currentName);
        if (nextNameRaw === null) return;
        const nextName = nextNameRaw.trim();
        if (!nextName || !system.planets[bodyIndex]) return;
        system.planets[bodyIndex].name = nextName;
        notifySectorDataChanged('Rename Object');
        updateInfoPanel(id, bodyIndex);
    };

    const getBodyElement = (bodyIndex) => {
        for (const list of bodyLists) {
            const match = list.querySelector(`[data-body-index="${bodyIndex}"]`);
            if (match) return match;
        }
        return null;
    };

    const selectBodyByIndex = (bodyIndex, sourceEl = null) => {
        const body = system.planets[bodyIndex];
        if (!body) return;

        const li = sourceEl || getBodyElement(bodyIndex);
        if (!li) return;

        const normalizedType = normalizeBodyType(body.type);
        const isPlanetary = isPlanetaryBodyType(normalizedType);

        if (selectedBodyEl === li) {
            li.classList.remove('ring-1', 'ring-sky-500/70', 'border-sky-500/70');
            selectedBodyEl = null;
            state.selectedBodyIndex = null;
            setButtonAction(refs.renameBodyBtn, false);
            if (refs.rerollBodyBtn) {
                refs.rerollBodyBtn.classList.add('hidden');
                setButtonAction(refs.rerollBodyBtn, false);
            }
            setButtonAction(refs.quickDeleteBodyBtn, false);
            resetBodyDetailsPanel();
            return;
        }

        if (selectedBodyEl) {
            selectedBodyEl.classList.remove('ring-1', 'ring-sky-500/70', 'border-sky-500/70');
        }
        li.classList.add('ring-1', 'ring-sky-500/70', 'border-sky-500/70');
        selectedBodyEl = li;
        state.selectedBodyIndex = bodyIndex;
        showBodyDetailsPanel(body, li);

        if (refs.renameBodyBtn) {
            setButtonAction(refs.renameBodyBtn, true, () => renameBodyAtIndex(bodyIndex, body.name));
        }
        if (refs.rerollBodyBtn) {
            refs.rerollBodyBtn.classList.toggle('hidden', !isPlanetary);
            if (isPlanetary) {
                setButtonAction(refs.rerollBodyBtn, true, () => {
                    emitEvent(EVENTS.REQUEST_REROLL_SELECTED_PLANET);
                });
            } else {
                setButtonAction(refs.rerollBodyBtn, false);
            }
        }

        if (refs.editPlanetTypeRow && refs.editPlanetTypeSelect) {
            const canEditPlanetType = state.editMode && isPlanetary;
            refs.editPlanetTypeRow.classList.toggle('hidden', !canEditPlanetType);
            if (canEditPlanetType) {
                refs.editPlanetTypeSelect.value = normalizedType;
                refs.editPlanetTypeSelect.onchange = () => {
                    const targetSystem = state.sectors[id];
                    if (!targetSystem || !targetSystem.planets[bodyIndex]) return;
                    const nextType = refs.editPlanetTypeSelect.value;
                    targetSystem.planets[bodyIndex].type = nextType;
                    const nextEnvironment = generatePlanetEnvironment(nextType);
                    targetSystem.planets[bodyIndex].atmosphere = nextEnvironment.atmosphere;
                    targetSystem.planets[bodyIndex].temperature = nextEnvironment.temperature;
                    targetSystem.planets[bodyIndex].pop = 0;
                    targetSystem.planets[bodyIndex].basePop = 0;
                    targetSystem.planets[bodyIndex].tags = [];
                    refreshSystemPlanetPopulation(targetSystem, { randomFn: rand });
                    refreshSystemPlanetTags(targetSystem, { randomFn: rand });
                    reportSystemInvariantIssues(targetSystem, 'edit-planet-type');
                    notifySectorDataChanged('Edit Planet Type');
                    updateInfoPanel(id, bodyIndex);
                };
            } else {
                refs.editPlanetTypeSelect.onchange = null;
            }
        }

        if (refs.editInhabitPlanetRow && refs.editInhabitPlanetBtn) {
            const canEditInhabit = state.editMode && isPlanetary;
            refs.editInhabitPlanetRow.classList.toggle('hidden', !canEditInhabit);
            if (canEditInhabit) {
                const alreadyInhabited = !!(system.planets[bodyIndex] && system.planets[bodyIndex].habitable);
                refs.editInhabitPlanetBtn.innerText = alreadyInhabited ? 'Uninhabit Planet' : 'Inhabit Planet';
                setInhabitButtonStyle(refs.editInhabitPlanetBtn, alreadyInhabited);
                refs.editInhabitPlanetBtn.disabled = false;
                refs.editInhabitPlanetBtn.onclick = () => {
                    const targetSystem = state.sectors[id];
                    if (!targetSystem || !targetSystem.planets[bodyIndex]) return;
                    targetSystem.planets[bodyIndex].habitable = !alreadyInhabited;
                    targetSystem.planets[bodyIndex].pop = 0;
                    targetSystem.planets[bodyIndex].basePop = 0;
                    targetSystem.planets[bodyIndex].tags = [];
                    refreshSystemPlanetPopulation(targetSystem, { randomFn: rand });
                    refreshSystemPlanetTags(targetSystem, { randomFn: rand });
                    reportSystemInvariantIssues(targetSystem, 'edit-inhabit-planet');
                    notifySectorDataChanged('Toggle Inhabited');
                    updateInfoPanel(id, bodyIndex);
                };
            } else {
                refs.editInhabitPlanetBtn.disabled = true;
                refs.editInhabitPlanetBtn.onclick = null;
                refs.editInhabitPlanetBtn.innerText = 'Inhabit Planet';
                setInhabitButtonStyle(refs.editInhabitPlanetBtn, false);
            }
        }

        if (refs.quickDeleteBodyBtn && state.editMode) {
            setButtonAction(refs.quickDeleteBodyBtn, true, () => {
                emitEvent(EVENTS.REQUEST_DELETE_SELECTED_BODY);
            });
        }

        const detailsPanel = document.getElementById('infoBodyDetailsPanel');
        if (detailsPanel) positionBodyDetailsPanel(detailsPanel, li);
    };

    bodyLists.forEach((list) => {
        bindBodyListHandlers(list);
        list._bodyListContext = { renameBodyAtIndex, selectBodyByIndex };
    });

    const renderBody = (body, bodyIndex) => {
        const li = document.createElement('li');
        li.className = 'bg-slate-800/50 p-2 rounded border border-slate-700/50 flex flex-col cursor-pointer transition-colors hover:border-sky-600/60';
        li.setAttribute('role', 'button');
        li.setAttribute('tabindex', '0');
        li.setAttribute('data-body-index', String(bodyIndex));
        li.setAttribute('data-body-name', String(body.name || ''));

        const normalizedType = normalizeBodyType(body.type);
        const bodyIcon = getBodyIconMarkup(normalizedType);
        const isPlanetary = isPlanetaryBodyType(normalizedType);
        const sizeLabel = body.size || 'Medium';
        const safeName = escapeHtml(body.name);
        const safeType = escapeHtml(normalizedType);
        const safeSize = escapeHtml(sizeLabel);

        let html = `<div class="flex justify-between items-center font-semibold text-sky-100"><span class="inline-flex items-center gap-2">${bodyIcon}${safeName}</span><button class="body-rename-btn w-5 h-5 inline-flex items-center justify-center text-[10px] rounded bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-sky-500 transition-colors" title="Rename object" aria-label="Rename object">&#9998;</button></div>`;
        html += '<div class="mt-1 flex items-end justify-between">';
        if (isPlanetary && body.habitable) {
            html += '<span class="inline-block px-1.5 py-0.5 rounded border text-[11px] text-emerald-300 border-emerald-600/60 bg-emerald-900/25">Inhabited</span>';
        } else {
            html += '<span></span>';
        }
        if (isPlanetary) {
            html += `<span class="text-xs text-slate-500 font-normal text-right inline-flex items-center gap-1.5">`
                + `<span class="cursor-help underline decoration-dotted decoration-slate-500/70 underline-offset-2" data-field-tooltip="size" data-field-value="${safeSize}">${safeSize}</span>`
                + `<span>&middot;</span>`
                + `<span class="cursor-help underline decoration-dotted decoration-slate-500/70 underline-offset-2" data-field-tooltip="planet-type" data-field-value="${safeType}">${safeType}</span>`
                + `</span>`;
        } else {
            html += `<span class="text-xs text-slate-500 font-normal text-right">${safeType}</span>`;
        }
        html += '</div>';
        li.innerHTML = html;

        return li;
    };

    system.planets.forEach((body, bodyIndex) => {
        if (isArtificialBodyType(body.type)) {
            refs.stationList.appendChild(renderBody(body, bodyIndex));
        } else if (isBeltOrFieldBodyType(body.type)) {
            refs.beltList.appendChild(renderBody(body, bodyIndex));
        } else {
            refs.planetList.appendChild(renderBody(body, bodyIndex));
        }
    });

    if (Number.isInteger(preselectedBodyIndex) && preselectedBodyIndex >= 0) {
        selectBodyByIndex(preselectedBodyIndex);
    }

    const { planets: planetCount, belts: beltCount, stations: stationCount } = countSystemBodies(system);
    if (!refs.planetList.children.length) refs.planetList.innerHTML = '<li class="italic text-slate-600">No planets detected.</li>';
    if (!refs.beltList.children.length) refs.beltList.innerHTML = '<li class="italic text-slate-600">No belts or fields detected.</li>';
    if (!refs.stationList.children.length) refs.stationList.innerHTML = '<li class="italic text-slate-600">No stations detected.</li>';
    setBodySummaryLabels(refs, planetCount, beltCount, stationCount);
}
