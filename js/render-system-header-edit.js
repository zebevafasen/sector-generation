import { STAR_VISUALS, state } from './config.js';
import { generateStarAge, showStatusMessage } from './core.js';
import { reportSystemInvariantIssues } from './invariants.js';
import { addCompanionStar, removeStarAtIndex, setPrimaryStarClass } from './star-system.js';
import { hasLinkedBodiesToRename, renameBodiesForSystemNameChange } from './system-naming.js';
import { setButtonAction } from './info-panel-ui.js';

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

export function bindSystemHeaderEditControls({
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
}) {
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
    if (refs.addStarInSectionBtn) {
        refs.addStarInSectionBtn.classList.toggle('hidden', !canEditStar);
        setButtonAction(refs.addStarInSectionBtn, canEditStar, (event) => {
            if (event && typeof event.preventDefault === 'function') event.preventDefault();
            if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
            const current = state.sectors[id];
            if (!current) {
                showStatusMessage('Select a system first.', 'warn');
                return;
            }
            const result = addCompanionStar(current, {
                maxStars: 3,
                starClass: 'G',
                generateStarAgeFn: generateStarAge
            });
            if (!result.added) {
                showStatusMessage('Max stars reached (3).', 'warn');
                return;
            }
            reportSystemInvariantIssues(current, 'add-star');
            notifySectorDataChanged('Add Star');
            redrawAndReselect(id, state.selectedBodyIndex);
            showStatusMessage('Added new star.', 'success');
        });
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

    if (refs.starList) {
        bindCompanionStarListHandlers(refs);
        refs.starList._companionContext = { id, preselectedBodyIndex, notifySectorDataChanged, updateInfoPanel, redrawAndReselect };
    }
}
