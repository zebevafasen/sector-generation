import { getDefaultPlanetEnvironment } from './planet-environment.js';
import { isPlanetaryBodyType, normalizeBodyType } from './body-classification.js';
import { formatPopulationBillions } from './planet-population.js';
import { escapeHtml, setButtonAction, setInhabitButtonStyle } from './info-panel-ui.js';

export function resetBodyDetailsPanel() {
    const panel = document.getElementById('infoBodyDetailsPanel');
    const empty = document.getElementById('infoBodyDetailsEmpty');
    const content = document.getElementById('infoBodyDetailsContent');
    const name = document.getElementById('infoBodyDetailsName');
    const type = document.getElementById('infoBodyDetailsType');
    const size = document.getElementById('infoBodyDetailsSize');
    const renameBodyBtn = document.getElementById('renameBodyBtn');
    const rerollBodyBtn = document.getElementById('rerollBodyBtn');
    const quickDeleteBodyBtn = document.getElementById('quickDeleteBodyBtn');
    const editPlanetTypeRow = document.getElementById('editPlanetTypeRow');
    const editPlanetTypeSelect = document.getElementById('editPlanetTypeSelect');
    const editInhabitPlanetRow = document.getElementById('editInhabitPlanetRow');
    const editInhabitPlanetBtn = document.getElementById('editInhabitPlanetBtn');
    const envRow = document.getElementById('infoBodyEnvironmentRow');
    const atmosphereValue = document.getElementById('infoBodyAtmosphere');
    const temperatureValue = document.getElementById('infoBodyTemperature');
    const populationRow = document.getElementById('infoBodyPopulationRow');
    const populationValue = document.getElementById('infoBodyPopulation');
    const tagsRow = document.getElementById('infoBodyTagsRow');
    const tagsValue = document.getElementById('infoBodyTags');
    const placeholder = document.getElementById('infoBodyDetailsPlaceholder');

    if (panel) panel.classList.add('hidden');
    if (empty) {
        empty.classList.remove('hidden');
        empty.innerText = 'Select a planet, belt, or station to inspect.';
    }
    if (content) content.classList.add('hidden');
    if (name) name.innerText = 'Body';
    if (type) {
        type.innerText = 'Type';
        type.removeAttribute('data-field-tooltip');
        type.removeAttribute('data-field-value');
        type.classList.remove('cursor-help', 'underline', 'decoration-dotted', 'decoration-slate-500/70', 'underline-offset-2');
    }
    if (size) {
        size.innerText = '--';
        size.classList.add('hidden');
        size.removeAttribute('data-field-value');
    }
    setButtonAction(renameBodyBtn, false);
    setButtonAction(rerollBodyBtn, false);
    if (rerollBodyBtn) rerollBodyBtn.classList.add('hidden');
    setButtonAction(quickDeleteBodyBtn, false);
    if (editPlanetTypeRow) editPlanetTypeRow.classList.add('hidden');
    if (editPlanetTypeSelect) editPlanetTypeSelect.onchange = null;
    if (editInhabitPlanetRow) editInhabitPlanetRow.classList.add('hidden');
    if (editInhabitPlanetBtn) {
        editInhabitPlanetBtn.disabled = true;
        editInhabitPlanetBtn.onclick = null;
        editInhabitPlanetBtn.innerText = 'Inhabit Planet';
        setInhabitButtonStyle(editInhabitPlanetBtn, false);
    }
    if (envRow) envRow.classList.add('hidden');
    if (atmosphereValue) atmosphereValue.innerText = '--';
    if (temperatureValue) temperatureValue.innerText = '--';
    if (populationRow) populationRow.classList.add('hidden');
    if (populationValue) populationValue.innerText = '--';
    if (tagsRow) tagsRow.classList.add('hidden');
    if (tagsValue) tagsValue.innerHTML = '';
    if (placeholder) placeholder.innerText = '';
}

export function positionBodyDetailsPanel(panel, anchorEl) {
    const anchorRect = anchorEl.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const margin = 10;
    let left = anchorRect.left - panelRect.width - margin;
    let top = anchorRect.top + (anchorRect.height / 2) - (panelRect.height / 2);

    if (left < 8) {
        left = anchorRect.right + margin;
    }
    if (left + panelRect.width > window.innerWidth - 8) {
        left = window.innerWidth - panelRect.width - 8;
    }
    if (top < 8) top = 8;
    if (top + panelRect.height > window.innerHeight - 8) {
        top = window.innerHeight - panelRect.height - 8;
    }

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
}

export function showBodyDetailsPanel(body, anchorEl) {
    const panel = document.getElementById('infoBodyDetailsPanel');
    const empty = document.getElementById('infoBodyDetailsEmpty');
    const content = document.getElementById('infoBodyDetailsContent');
    const name = document.getElementById('infoBodyDetailsName');
    const type = document.getElementById('infoBodyDetailsType');
    const size = document.getElementById('infoBodyDetailsSize');
    const envRow = document.getElementById('infoBodyEnvironmentRow');
    const atmosphereValue = document.getElementById('infoBodyAtmosphere');
    const temperatureValue = document.getElementById('infoBodyTemperature');
    const populationRow = document.getElementById('infoBodyPopulationRow');
    const populationValue = document.getElementById('infoBodyPopulation');
    const tagsRow = document.getElementById('infoBodyTagsRow');
    const tagsValue = document.getElementById('infoBodyTags');
    const placeholder = document.getElementById('infoBodyDetailsPlaceholder');
    const normalizedType = normalizeBodyType(body.type);

    if (panel) panel.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');
    if (content) content.classList.remove('hidden');
    if (name) name.innerText = body.name;
    if (type) {
        type.innerText = normalizedType;
        if (isPlanetaryBodyType(normalizedType)) {
            type.setAttribute('data-field-tooltip', 'planet-type');
            type.setAttribute('data-field-value', normalizedType);
            type.classList.add('cursor-help', 'underline', 'decoration-dotted', 'decoration-slate-500/70', 'underline-offset-2');
        } else {
            type.removeAttribute('data-field-tooltip');
            type.removeAttribute('data-field-value');
            type.classList.remove('cursor-help', 'underline', 'decoration-dotted', 'decoration-slate-500/70', 'underline-offset-2');
        }
    }
    if (size) {
        if (isPlanetaryBodyType(normalizedType)) {
            const sizeLabel = body.size || 'Medium';
            size.innerText = sizeLabel;
            size.setAttribute('data-field-value', sizeLabel);
            size.classList.remove('hidden');
        } else {
            size.innerText = '--';
            size.removeAttribute('data-field-value');
            size.classList.add('hidden');
        }
    }
    if (envRow && atmosphereValue && temperatureValue) {
        if (isPlanetaryBodyType(normalizedType)) {
            const fallback = getDefaultPlanetEnvironment(normalizedType);
            atmosphereValue.innerText = body.atmosphere || fallback.atmosphere;
            temperatureValue.innerText = body.temperature || fallback.temperature;
            atmosphereValue.setAttribute('data-field-value', atmosphereValue.innerText);
            temperatureValue.setAttribute('data-field-value', temperatureValue.innerText);
            envRow.classList.remove('hidden');
        } else {
            envRow.classList.add('hidden');
            atmosphereValue.innerText = '--';
            temperatureValue.innerText = '--';
            atmosphereValue.removeAttribute('data-field-value');
            temperatureValue.removeAttribute('data-field-value');
        }
    }
    if (populationRow && populationValue) {
        if (isPlanetaryBodyType(normalizedType) && body.habitable && Number(body.pop) > 0) {
            populationValue.innerText = formatPopulationBillions(Number(body.pop));
            populationRow.classList.remove('hidden');
        } else {
            populationValue.innerText = '--';
            populationRow.classList.add('hidden');
        }
    }
    if (tagsRow && tagsValue) {
        if (isPlanetaryBodyType(normalizedType) && Array.isArray(body.tags) && body.tags.length) {
            tagsValue.innerHTML = body.tags
                .map(tag => `<span class="inline-flex items-center rounded border border-sky-700/55 bg-sky-900/25 px-1.5 py-0.5 text-[10px] text-sky-200 cursor-help underline decoration-dotted decoration-slate-500/70 underline-offset-2" data-field-tooltip="tag" data-field-value="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`)
                .join('');
            tagsRow.classList.remove('hidden');
        } else {
            tagsValue.innerHTML = '';
            tagsRow.classList.add('hidden');
        }
    }
    if (placeholder) placeholder.innerText = '';
    if (panel && anchorEl) positionBodyDetailsPanel(panel, anchorEl);
}
