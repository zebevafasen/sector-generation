import { STAR_VISUALS, state } from './config.js';
import { formatStarAgeValue, generateStarAge, getStarClassInfo } from './core.js';
import { EVENTS, emitEvent } from './events.js';
import { reportSystemInvariantIssues } from './invariants.js';
import { resetBodyDetailsPanel } from './render-body-details.js';
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

export function configureSystemHeaderAndStar({ refs, system, id, preselectedBodyIndex, notifySectorDataChanged, updateInfoPanel, redrawAndReselect }) {
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
        const canEditStar = state.editMode;
        refs.editStarClassRow.classList.toggle('hidden', !canEditStar);
        if (refs.editStarClassSelect) {
            if (canEditStar) {
                refs.editStarClassSelect.value = system.starClass || 'G';
                refs.editStarClassSelect.onchange = () => {
                    const current = state.sectors[id];
                    if (!current) return;
                    const nextClass = refs.editStarClassSelect.value;
                    const nextPalette = STAR_VISUALS[nextClass] || STAR_VISUALS.default;
                    current.starClass = nextClass;
                    current.palette = nextPalette;
                    current.color = nextPalette.core;
                    current.glow = nextPalette.halo;
                    current.starAge = generateStarAge(nextClass);
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
    const isPinned = !!(state.pinnedHexIds && state.pinnedHexIds.includes(id));
    if (refs.pinSelectedSystemBtn) {
        refs.pinSelectedSystemBtn.disabled = false;
        setPinButtonContent(refs.pinSelectedSystemBtn, isPinned);
        setPinButtonStyle(refs.pinSelectedSystemBtn, isPinned);
    }
    if (refs.rerollSelectedSystemBtn) refs.rerollSelectedSystemBtn.disabled = false;
    if (refs.selectedSystemPinState) refs.selectedSystemPinState.innerText = `Pinned: ${isPinned ? 'Yes' : 'No'}`;
    if (refs.starClassLabel) {
        refs.starClassLabel.innerText = `Class ${system.starClass} Star`;
        refs.starClassLabel.classList.add('cursor-help', 'text-sky-300', 'star-class-hint');
    }
    if (refs.starAgeLabel) {
        if (system.starAge && Number.isFinite(system.starAge.value) && system.starAge.unit) {
            refs.starAgeLabel.innerText = `Age: ${formatStarAgeValue(system.starAge.value, system.starAge.unit)}`;
        } else if (system.starAge && system.starAge.display) {
            refs.starAgeLabel.innerText = `Age: ${system.starAge.display}`;
        } else {
            const info = getStarClassInfo(system.starClass);
            refs.starAgeLabel.innerText = `Age: ${info.typicalAge || 'Unknown'}`;
        }
    }

    if (refs.starVisual) {
        const palette = system.palette || STAR_VISUALS[system.starClass] || STAR_VISUALS.default;
        refs.starVisual.style.backgroundImage = `radial-gradient(circle at 40% 35%, ${system.color} 0%, ${palette.mid} 55%, ${system.glow || palette.halo} 100%)`;
        refs.starVisual.style.backgroundColor = palette.core;
        refs.starVisual.style.boxShadow = `0 0 12px ${system.glow || palette.halo}`;
    }
}

export function renderEmptyHexInfo({ refs, id }) {
    refs.systemDetails.classList.add('hidden');
    refs.emptyDetails.classList.remove('hidden');
    refs.emptyDetails.innerText = 'Deep space scans indicate no major stellar masses in this sector.';
    refs.typeLabel.innerText = 'Empty Void';
    refs.typeLabel.className = 'text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-600';

    if (refs.starClassLabel) {
        refs.starClassLabel.innerText = 'Class Unknown';
        refs.starClassLabel.classList.remove('cursor-help', 'text-sky-300', 'star-class-hint');
    }
    if (refs.starAgeLabel) refs.starAgeLabel.innerText = 'Age: --';
    if (refs.starVisual) {
        refs.starVisual.style.backgroundImage = 'none';
        refs.starVisual.style.backgroundColor = '#1e293b';
        refs.starVisual.style.boxShadow = 'none';
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
    setButtonAction(refs.renameSystemBtn, false);
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
    if (refs.pinSelectedSystemBtn) {
        refs.pinSelectedSystemBtn.disabled = true;
        setPinButtonContent(refs.pinSelectedSystemBtn, false);
        setPinButtonStyle(refs.pinSelectedSystemBtn, false);
    }
    if (refs.rerollSelectedSystemBtn) refs.rerollSelectedSystemBtn.disabled = true;
    if (refs.selectedSystemPinState) refs.selectedSystemPinState.innerText = 'Pinned: --';
    resetBodyDetailsPanel();
}
