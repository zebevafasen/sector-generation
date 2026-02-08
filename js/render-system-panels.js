import { state } from './config.js';
import { EVENTS, emitEvent } from './events.js';
import { isActiveJumpGatePoi, isJumpGatePoi } from './jump-gate-model.js';
import { resetBodyDetailsPanel } from './render-body-details.js';
import { getGlobalHexDisplayIdForSector } from './render-shared.js';
import { ensureSystemStarFields, getPrimaryStar, getSystemStars } from './star-system.js';
import { applySystemHeaderDisplay } from './render-system-header-display.js';
import { bindSystemHeaderEditControls } from './render-system-header-edit.js';
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

function formatPoiTypeLabel(deepSpacePoi) {
    if (!deepSpacePoi || typeof deepSpacePoi !== 'object') return 'Unknown';
    const category = String(deepSpacePoi.poiCategory || '').trim();
    if (category) {
        return category
            .split(/[_-\s]+/g)
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join('-');
    }
    return String(deepSpacePoi.kind || 'Unknown');
}

function getPoiTypeStyle(kind, poi = null) {
    if (isJumpGatePoi(poi)) {
        const isActive = poi.jumpGateState === 'active';
        return {
            badge: isActive
                ? 'text-xs px-2 py-0.5 rounded-full bg-cyan-900/40 text-cyan-200 border border-cyan-700'
                : 'text-xs px-2 py-0.5 rounded-full bg-amber-900/35 text-amber-200 border border-amber-700',
            typeValue: isActive ? 'text-cyan-200' : 'text-amber-200'
        };
    }
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
    applySystemHeaderDisplay({ refs, system, stars, primaryStar, canEditStar });
    bindSystemHeaderEditControls({
        refs,
        system,
        id,
        stars,
        primaryStar,
        canEditStar,
        preselectedBodyIndex,
        notifySectorDataChanged,
        updateInfoPanel,
        redrawAndReselect
    });

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
}

export function renderEmptyHexInfo({ refs, id, deepSpacePoi = null }) {
    refs.systemDetails.classList.add('hidden');
    refs.emptyDetails.classList.remove('hidden');
    if (deepSpacePoi) {
        const poiStyle = getPoiTypeStyle(deepSpacePoi.kind, deepSpacePoi);
        const poiTypeLabel = formatPoiTypeLabel(deepSpacePoi);
        const jumpLinkLabel = (deepSpacePoi.jumpGateLink && deepSpacePoi.jumpGateLink.sectorKey)
            ? getGlobalHexDisplayIdForSector(deepSpacePoi.jumpGateLink.sectorKey, deepSpacePoi.jumpGateLink.hexId || '')
            : 'Unresolved';
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
                        <div class="${poiStyle.typeValue}">${escapeHtml(poiTypeLabel)}</div>
                    </div>
                    <div class="rounded border border-slate-700 bg-slate-900/35 px-2 py-1">
                        <span class="text-slate-500 uppercase">Risk</span>
                        <div class="text-slate-200">${escapeHtml(deepSpacePoi.risk || 'Unknown')}</div>
                    </div>
                </div>
                <p class="text-[11px] text-slate-400">Travel Intel: ${escapeHtml(deepSpacePoi.rewardHint || 'No additional intel.')}</p>
                ${isActiveJumpGatePoi(deepSpacePoi) ? `
                <div class="rounded border border-cyan-700/60 bg-cyan-950/20 px-2 py-2">
                    <p class="text-[11px] text-cyan-200">Jump Link: ${escapeHtml(jumpLinkLabel)}</p>
                    <button type="button" id="travelJumpGateBtn" class="mt-2 w-full py-1.5 text-xs rounded bg-cyan-900/35 border border-cyan-700 text-cyan-200 hover:bg-cyan-800/40 hover:border-cyan-500 transition-colors">Go to Location</button>
                </div>
                ` : ''}
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
    if (id && !!deepSpacePoi && isActiveJumpGatePoi(deepSpacePoi)) {
        const travelBtn = refs.emptyDetails.querySelector('#travelJumpGateBtn');
        if (travelBtn) {
            const hasLink = !!(deepSpacePoi.jumpGateLink && deepSpacePoi.jumpGateLink.sectorKey && deepSpacePoi.jumpGateLink.hexId);
            travelBtn.disabled = !hasLink;
            if (!hasLink) {
                travelBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
            travelBtn.onclick = hasLink ? () => emitEvent(EVENTS.REQUEST_TRAVEL_JUMP_GATE, { hexId: id }) : null;
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
