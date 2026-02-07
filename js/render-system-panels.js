import { STAR_VISUALS, state } from './config.js';
import { formatStarAgeValue, generateStarAge, getStarClassInfo } from './core.js';
import { EVENTS, emitEvent } from './events.js';
import { reportSystemInvariantIssues } from './invariants.js';
import { resetBodyDetailsPanel } from './render-body-details.js';
import { ensureSystemStarFields, getPrimaryStar, getSystemStars, removeStarAtIndex, setPrimaryStarClass } from './star-system.js';
import { hasLinkedBodiesToRename, renameBodiesForSystemNameChange } from './system-naming.js';
import {
    disableInhabitControls,
    disablePlanetTypeControls,
    disableStarEditControls,
    setBodySummaryLabels,
    setButtonAction,
    setPinButtonContent,
    setPinButtonStyle
} from './info-panel-ui.js';

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function bindCompanionStarListHandlers(refs) {
    if (!refs.starList || refs.starList.dataset.companionHandlersBound === '1') return;
    refs.starList.dataset.companionHandlersBound = '1';

    refs.starList.addEventListener('click', (event) => {
        const context = refs.starList._companionContext;
        if (!context) return;
        const { id, preselectedBodyIndex, notifySectorDataChanged, updateInfoPanel, redrawAndReselect } = context;
        const renameButton = event.target instanceof Element ? event.target.closest('.companion-star-rename-btn') : null;
        const deleteButton = event.target instanceof Element ? event.target.closest('.companion-star-delete-btn') : null;
        if (!renameButton && !deleteButton) return;

        event.preventDefault();
        event.stopPropagation();

        const idx = parseInt((renameButton || deleteButton).getAttribute('data-star-index') || '-1', 10);
        const current = state.sectors[id];
        if (!current || !Array.isArray(current.stars) || idx < 1 || idx >= current.stars.length) return;

        if (renameButton) {
            const previousName = current.stars[idx].name || `${current.name} ${String.fromCharCode(65 + idx)}`;
            const nextNameRaw = prompt('Rename star', previousName);
            if (nextNameRaw === null) return;
            const nextName = nextNameRaw.trim();
            if (!nextName) return;
            current.stars[idx].name = nextName;
            notifySectorDataChanged('Rename Star');
            updateInfoPanel(id, preselectedBodyIndex);
            return;
        }

        const removed = removeStarAtIndex(current, idx);
        if (!removed) return;
        reportSystemInvariantIssues(current, 'delete-companion-star');
        notifySectorDataChanged('Delete Companion Star');
        redrawAndReselect(id, state.selectedBodyIndex);
    });

    refs.starList.addEventListener('change', (event) => {
        const context = refs.starList._companionContext;
        if (!context) return;
        const { id, notifySectorDataChanged, redrawAndReselect } = context;
        const select = event.target instanceof Element ? event.target.closest('.companion-star-class-select') : null;
        if (!select) return;

        const idx = parseInt(select.getAttribute('data-star-index') || '-1', 10);
        const current = state.sectors[id];
        if (!current || !Array.isArray(current.stars) || idx < 1 || idx >= current.stars.length) return;

        const nextClass = select.value;
        const nextPalette = STAR_VISUALS[nextClass] || STAR_VISUALS.default;
        current.stars[idx].class = nextClass;
        current.stars[idx].palette = nextPalette;
        current.stars[idx].color = nextPalette.core;
        current.stars[idx].glow = nextPalette.halo;
        current.stars[idx].starAge = generateStarAge(nextClass);
        reportSystemInvariantIssues(current, 'edit-companion-star-class');
        notifySectorDataChanged('Edit Companion Star Class');
        redrawAndReselect(id, state.selectedBodyIndex);
    });
}

function getPoiTypeStyle(kind) {
    switch (String(kind || '').toLowerCase()) {
    case 'hazard':
        return {
            badge: 'text-xs px-2 py-0.5 rounded-full bg-rose-900/40 text-rose-200 border border-rose-700',
            typeValue: 'text-rose-200'
        };
    case 'navigation':
        return {
            badge: 'text-xs px-2 py-0.5 rounded-full bg-cyan-900/40 text-cyan-200 border border-cyan-700',
            typeValue: 'text-cyan-200'
        };
    case 'opportunity':
        return {
            badge: 'text-xs px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-200 border border-emerald-700',
            typeValue: 'text-emerald-200'
        };
    case 'mystery':
        return {
            badge: 'text-xs px-2 py-0.5 rounded-full bg-violet-900/40 text-violet-200 border border-violet-700',
            typeValue: 'text-violet-200'
        };
    default:
        return {
            badge: 'text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-200 border border-slate-500',
            typeValue: 'text-slate-200'
        };
    }
}

export function configureSystemHeaderAndStar({ refs, system, id, preselectedBodyIndex, notifySectorDataChanged, updateInfoPanel, redrawAndReselect }) {
    ensureSystemStarFields(system);
    const stars = getSystemStars(system);
    const primaryStar = getPrimaryStar(system);
    const canEditStar = state.editMode;

    refs.systemDetails.classList.remove('hidden');
    refs.emptyDetails.classList.add('hidden');
    refs.typeLabel.innerText = 'Star System';
    refs.typeLabel.className = 'text-xs px-2 py-0.5 rounded-full bg-sky-900 text-sky-200 border border-sky-600';

    refs.systemName.innerText = system.name;
    if (refs.renameSystemBtn) {
        setButtonAction(refs.renameSystemBtn, true, () => {
            const previousName = system.name;
            const nextNameRaw = prompt('Rename system', system.name);
            if (nextNameRaw === null) return;
            const nextName = nextNameRaw.trim();
            if (!nextName) return;
            if (nextName === previousName) return;
            if (hasLinkedBodiesToRename(system, previousName)) {
                const shouldRenameBodies = confirm('Also rename linked planets/objects to match the new system name?');
                if (shouldRenameBodies) {
                    renameBodiesForSystemNameChange(system, previousName, nextName);
                }
            }
            system.name = nextName;
            notifySectorDataChanged('Rename System');
            updateInfoPanel(id, preselectedBodyIndex);
        });
    }
    if (refs.editStarClassRow) {
        refs.editStarClassRow.classList.toggle('hidden', !canEditStar);
        if (refs.editStarClassSelect) {
            if (canEditStar) {
                refs.editStarClassSelect.value = primaryStar.class || 'G';
                refs.editStarClassSelect.onchange = () => {
                    const current = state.sectors[id];
                    if (!current) return;
                    const nextClass = refs.editStarClassSelect.value;
                    setPrimaryStarClass(current, nextClass, generateStarAge(nextClass));
                    reportSystemInvariantIssues(current, 'edit-star-class');
                    notifySectorDataChanged('Edit Star Class');
                    redrawAndReselect(id, state.selectedBodyIndex);
                };
            } else {
                refs.editStarClassSelect.onchange = null;
            }
        }
    }
    if (refs.addSystemHereBtn) {
        refs.addSystemHereBtn.classList.add('hidden');
        refs.addSystemHereBtn.onclick = null;
    }
    if (refs.addPoiHereBtn) {
        refs.addPoiHereBtn.classList.add('hidden');
        refs.addPoiHereBtn.onclick = null;
    }
    if (refs.deletePoiHereBtn) {
        refs.deletePoiHereBtn.classList.add('hidden');
        refs.deletePoiHereBtn.onclick = null;
    }
    if (refs.deletePrimaryStarBtn) {
        refs.deletePrimaryStarBtn.classList.toggle('hidden', !canEditStar);
        setButtonAction(refs.deletePrimaryStarBtn, canEditStar && stars.length > 1, () => {
            const current = state.sectors[id];
            if (!current) return;
            const removed = removeStarAtIndex(current, 0);
            if (!removed) return;
            reportSystemInvariantIssues(current, 'delete-primary-star');
            notifySectorDataChanged('Delete Primary Star');
            redrawAndReselect(id, state.selectedBodyIndex);
        });
    }
    const isPinned = !!(state.pinnedHexIds && state.pinnedHexIds.includes(id));
    if (refs.pinSelectedSystemBtn) {
        refs.pinSelectedSystemBtn.disabled = false;
        setPinButtonContent(refs.pinSelectedSystemBtn, isPinned);
        setPinButtonStyle(refs.pinSelectedSystemBtn, isPinned);
        refs.pinSelectedSystemBtn.title = isPinned ? 'Unpin system' : 'Pin system';
        refs.pinSelectedSystemBtn.setAttribute('aria-label', isPinned ? 'Unpin system' : 'Pin system');
    }
    if (refs.rerollSelectedSystemBtn) {
        refs.rerollSelectedSystemBtn.disabled = false;
        refs.rerollSelectedSystemBtn.title = 'Reroll system';
        refs.rerollSelectedSystemBtn.setAttribute('aria-label', 'Reroll system');
    }
    if (refs.selectedSystemPinState) refs.selectedSystemPinState.innerText = `Pinned: ${isPinned ? 'Yes' : 'No'}`;
    if (refs.starClassLabel) {
        refs.starClassLabel.innerText = `Class ${primaryStar.class} Star`;
        refs.starClassLabel.classList.add('cursor-help', 'text-slate-400', 'star-class-hint');
        refs.starClassLabel.setAttribute('data-star-index', '0');
    }
    if (refs.starAgeLabel) {
        if (primaryStar.starAge && Number.isFinite(primaryStar.starAge.value) && primaryStar.starAge.unit) {
            refs.starAgeLabel.innerText = `Age: ${formatStarAgeValue(primaryStar.starAge.value, primaryStar.starAge.unit)}`;
        } else if (primaryStar.starAge && primaryStar.starAge.display) {
            refs.starAgeLabel.innerText = `Age: ${primaryStar.starAge.display}`;
        } else {
            const info = getStarClassInfo(primaryStar.class);
            refs.starAgeLabel.innerText = `Age: ${info.typicalAge || 'Unknown'}`;
        }
        if (stars.length > 1) {
            refs.starAgeLabel.innerText += ` • ${stars.length} stars`;
        }
    }

    if (refs.starVisual) {
        const palette = primaryStar.palette || STAR_VISUALS[primaryStar.class] || STAR_VISUALS.default;
        refs.starVisual.style.backgroundImage = `radial-gradient(circle at 40% 35%, ${primaryStar.color} 0%, ${palette.mid} 55%, ${primaryStar.glow || palette.halo} 100%)`;
        refs.starVisual.style.backgroundColor = palette.core;
        refs.starVisual.style.boxShadow = `0 0 12px ${primaryStar.glow || palette.halo}`;
    }
    if (refs.starList) {
        bindCompanionStarListHandlers(refs);
        refs.starList._companionContext = { id, preselectedBodyIndex, notifySectorDataChanged, updateInfoPanel, redrawAndReselect };
        const companionStars = stars.slice(1);
        refs.starList.innerHTML = companionStars.map((star, index) => {
            const starIndex = index + 1;
            const palette = star.palette || STAR_VISUALS[star.class] || STAR_VISUALS.default;
            const ageLabel = star.starAge && star.starAge.display
                ? star.starAge.display
                : (star.starAge && Number.isFinite(star.starAge.value) && star.starAge.unit
                    ? formatStarAgeValue(star.starAge.value, star.starAge.unit)
                    : (getStarClassInfo(star.class).typicalAge || 'Unknown'));
            const displayName = star.name || `${system.name} ${String.fromCharCode(65 + starIndex)}`;
            return `
                <div class="bg-slate-800/50 p-3 rounded border border-slate-700">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full shadow-lg border border-slate-600/70" style="background-image: radial-gradient(circle at 40% 35%, ${star.color} 0%, ${palette.mid} 55%, ${star.glow || palette.halo} 100%); box-shadow: 0 0 12px ${star.glow || palette.halo};"></div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center justify-between gap-2">
                                <h3 class="font-bold text-sky-300 truncate">${displayName}</h3>
                                <div class="inline-flex items-center gap-1">
                                    <button type="button" class="${canEditStar ? '' : 'hidden '}companion-star-delete-btn w-6 h-6 inline-flex items-center justify-center text-xs rounded bg-rose-900/35 border border-rose-700 text-rose-200 hover:bg-rose-800/40 hover:border-rose-500 transition-colors" data-star-index="${starIndex}" title="Delete star" aria-label="Delete star">🗑</button>
                                    <button type="button" class="companion-star-rename-btn w-6 h-6 inline-flex items-center justify-center text-xs rounded bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-sky-500 transition-colors" data-star-index="${starIndex}" title="Rename star" aria-label="Rename star">✎</button>
                                </div>
                            </div>
                            <div class="flex flex-wrap gap-3 text-xs mt-0.5">
                                <p class="text-slate-400 cursor-help star-class-hint" data-star-index="${starIndex}">Class ${star.class} Star</p>
                                <p class="text-slate-500">Age: ${ageLabel}</p>
                            </div>
                            <div class="${state.editMode ? 'mt-2' : 'hidden mt-2'}">
                                <label class="block text-[10px] text-slate-500 mb-1">Star Type</label>
                                <select class="companion-star-class-select w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-sky-500 focus:outline-none" data-star-index="${starIndex}">
                                    <option value="O" ${star.class === 'O' ? 'selected' : ''}>O</option>
                                    <option value="B" ${star.class === 'B' ? 'selected' : ''}>B</option>
                                    <option value="A" ${star.class === 'A' ? 'selected' : ''}>A</option>
                                    <option value="F" ${star.class === 'F' ? 'selected' : ''}>F</option>
                                    <option value="G" ${star.class === 'G' ? 'selected' : ''}>G</option>
                                    <option value="K" ${star.class === 'K' ? 'selected' : ''}>K</option>
                                    <option value="M" ${star.class === 'M' ? 'selected' : ''}>M</option>
                                    <option value="Neutron" ${star.class === 'Neutron' ? 'selected' : ''}>Neutron</option>
                                    <option value="Black Hole" ${star.class === 'Black Hole' ? 'selected' : ''}>Black Hole</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        refs.starList.classList.toggle('hidden', companionStars.length === 0);
    }
}

export function renderEmptyHexInfo({ refs, id, deepSpacePoi = null }) {
    refs.systemDetails.classList.add('hidden');
    refs.emptyDetails.classList.remove('hidden');
    if (deepSpacePoi) {
        const poiStyle = getPoiTypeStyle(deepSpacePoi.kind);
        refs.emptyDetails.innerHTML = `
            <div class="space-y-2 text-left">
                <div class="flex items-center justify-between gap-2">
                    <p class="text-sm text-slate-200 font-semibold">${escapeHtml(deepSpacePoi.name || 'Deep-Space Site')}</p>
                    <button type="button" id="renamePoiBtn" class="${state.editMode ? '' : 'hidden '}w-6 h-6 inline-flex items-center justify-center text-xs rounded bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-violet-500 transition-colors" title="Rename POI" aria-label="Rename POI">✎</button>
                </div>
                <p class="text-xs text-slate-400">${escapeHtml(deepSpacePoi.summary || 'Uncatalogued deep-space contact.')}</p>
                <div class="grid grid-cols-2 gap-2 text-[11px]">
                    <div class="rounded border border-slate-700 bg-slate-900/35 px-2 py-1">
                        <span class="text-slate-500 uppercase">Type</span>
                        <div class="${poiStyle.typeValue}">${escapeHtml(deepSpacePoi.kind || 'Unknown')}</div>
                    </div>
                    <div class="rounded border border-slate-700 bg-slate-900/35 px-2 py-1">
                        <span class="text-slate-500 uppercase">Risk</span>
                        <div class="text-slate-200">${escapeHtml(deepSpacePoi.risk || 'Unknown')}</div>
                    </div>
                </div>
                <p class="text-[11px] text-slate-400">Travel Intel: ${escapeHtml(deepSpacePoi.rewardHint || 'No additional intel.')}</p>
            </div>
        `;
        refs.typeLabel.innerText = 'Deep-Space POI';
        refs.typeLabel.className = poiStyle.badge;
    } else {
        refs.emptyDetails.innerText = 'Deep space scans indicate no major stellar masses in this sector.';
        refs.typeLabel.innerText = 'Empty Void';
        refs.typeLabel.className = 'text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-600';
    }

    if (refs.starClassLabel) {
        refs.starClassLabel.innerText = 'Class Unknown';
        refs.starClassLabel.classList.remove('cursor-help', 'text-slate-400', 'star-class-hint');
    }
    if (refs.starAgeLabel) refs.starAgeLabel.innerText = 'Age: --';
    if (refs.starVisual) {
        refs.starVisual.style.backgroundImage = 'none';
        refs.starVisual.style.backgroundColor = '#1e293b';
        refs.starVisual.style.boxShadow = 'none';
    }
    if (refs.starList) {
        refs.starList._companionContext = null;
        refs.starList.innerHTML = '';
        refs.starList.classList.add('hidden');
    }
    if (refs.planetList) refs.planetList.innerHTML = '';
    if (refs.beltList) refs.beltList.innerHTML = '';
    if (refs.stationList) refs.stationList.innerHTML = '';
    if (refs.addSystemHereBtn) {
        if (state.editMode && id) {
            refs.addSystemHereBtn.classList.remove('hidden');
            refs.addSystemHereBtn.onclick = () => {
                emitEvent(EVENTS.REQUEST_ADD_SYSTEM_AT_HEX, { hexId: id });
            };
        } else {
            refs.addSystemHereBtn.classList.add('hidden');
            refs.addSystemHereBtn.onclick = null;
        }
    }
    if (refs.addPoiHereBtn) {
        if (state.editMode && id && !deepSpacePoi) {
            refs.addPoiHereBtn.classList.remove('hidden');
            refs.addPoiHereBtn.onclick = () => {
                emitEvent(EVENTS.REQUEST_ADD_POI_AT_HEX, { hexId: id });
            };
        } else {
            refs.addPoiHereBtn.classList.add('hidden');
            refs.addPoiHereBtn.onclick = null;
        }
    }
    if (refs.deletePoiHereBtn) {
        if (state.editMode && id && !!deepSpacePoi) {
            refs.deletePoiHereBtn.classList.remove('hidden');
            refs.deletePoiHereBtn.onclick = () => {
                emitEvent(EVENTS.REQUEST_DELETE_POI_AT_HEX, { hexId: id });
            };
        } else {
            refs.deletePoiHereBtn.classList.add('hidden');
            refs.deletePoiHereBtn.onclick = null;
        }
    }
    if (state.editMode && id && !!deepSpacePoi) {
        const renamePoiBtn = refs.emptyDetails.querySelector('#renamePoiBtn');
        if (renamePoiBtn) {
            renamePoiBtn.onclick = () => {
                emitEvent(EVENTS.REQUEST_RENAME_POI_AT_HEX, { hexId: id });
            };
        }
    }
    setButtonAction(refs.renameSystemBtn, false);
    setButtonAction(refs.deletePrimaryStarBtn, false);
    if (refs.deletePrimaryStarBtn) refs.deletePrimaryStarBtn.classList.add('hidden');
    disableStarEditControls(refs);
    setButtonAction(refs.renameBodyBtn, false);
    if (refs.rerollBodyBtn) {
        refs.rerollBodyBtn.classList.add('hidden');
        setButtonAction(refs.rerollBodyBtn, false);
    }
    setButtonAction(refs.quickDeleteBodyBtn, false);
    disablePlanetTypeControls(refs);
    disableInhabitControls(refs);
    setBodySummaryLabels(refs, 0, 0, 0);
    const canPinOrRerollPoi = !!deepSpacePoi;
    const isPinned = !!(id && state.pinnedHexIds && state.pinnedHexIds.includes(id));
    if (refs.pinSelectedSystemBtn) {
        refs.pinSelectedSystemBtn.disabled = !canPinOrRerollPoi;
        setPinButtonContent(refs.pinSelectedSystemBtn, isPinned);
        setPinButtonStyle(refs.pinSelectedSystemBtn, isPinned);
        const pinPoiLabel = isPinned ? 'Unpin POI' : 'Pin POI';
        refs.pinSelectedSystemBtn.title = canPinOrRerollPoi ? pinPoiLabel : 'Pin system';
        refs.pinSelectedSystemBtn.setAttribute('aria-label', canPinOrRerollPoi ? pinPoiLabel : 'Pin system');
    }
    if (refs.rerollSelectedSystemBtn) {
        refs.rerollSelectedSystemBtn.disabled = !canPinOrRerollPoi;
        refs.rerollSelectedSystemBtn.title = canPinOrRerollPoi ? 'Reroll POI' : 'Reroll system';
        refs.rerollSelectedSystemBtn.setAttribute('aria-label', canPinOrRerollPoi ? 'Reroll POI' : 'Reroll system');
    }
    if (refs.selectedSystemPinState) refs.selectedSystemPinState.innerText = canPinOrRerollPoi ? `Pinned: ${isPinned ? 'Yes' : 'No'}` : 'Pinned: --';
    resetBodyDetailsPanel();
}
