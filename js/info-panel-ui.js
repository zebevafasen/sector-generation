export function setPinButtonStyle(button, isPinned) {
    if (!button) return;
    const base = 'w-8 h-8 inline-flex items-center justify-center text-sm rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    if (isPinned) {
        button.className = `${base} bg-rose-900/30 border-rose-700 text-rose-200 hover:bg-rose-800/40 hover:border-rose-500`;
    } else {
        button.className = `${base} bg-emerald-900/30 border-emerald-700 text-emerald-200 hover:bg-emerald-800/40 hover:border-emerald-500`;
    }
}

export function setPinButtonContent(button, isPinned) {
    if (!button) return;
    button.innerText = isPinned ? '📍' : '📌';
    button.title = isPinned ? 'Unpin system' : 'Pin system';
    button.setAttribute('aria-label', isPinned ? 'Unpin system' : 'Pin system');
}

export function setButtonAction(button, enabled, onClick = null) {
    if (!button) return;
    button.disabled = !enabled;
    button.onclick = enabled ? onClick : null;
}

export function setInhabitButtonStyle(button, isUninhabit) {
    if (!button) return;
    const base = 'w-full py-1.5 text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    if (isUninhabit) {
        button.className = `${base} bg-rose-900/35 border border-rose-700 text-rose-200 hover:bg-rose-800/40 hover:border-rose-500`;
    } else {
        button.className = `${base} bg-emerald-900/35 border border-emerald-700 text-emerald-200 hover:bg-emerald-800/40 hover:border-emerald-500`;
    }
}

export function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function getInfoPanelRefs() {
    return {
        panel: document.getElementById('infoPanel'),
        hexId: document.getElementById('infoHexId'),
        hexCoreBadge: document.getElementById('infoHexCoreBadge'),
        systemDetails: document.getElementById('systemDetails'),
        emptyDetails: document.getElementById('emptyDetails'),
        typeLabel: document.getElementById('infoType'),
        systemName: document.getElementById('infoSystemName'),
        starClassLabel: document.getElementById('infoStarClass'),
        starVisual: document.getElementById('infoStarVisual'),
        starAgeLabel: document.getElementById('infoStarAge'),
        starSummary: document.getElementById('infoStarSummary'),
        starList: document.getElementById('infoStarList'),
        starSummaryLabel: document.getElementById('infoStarSummaryLabel'),
        populationLabel: document.getElementById('infoPop'),
        planetList: document.getElementById('infoPlanetList'),
        beltList: document.getElementById('infoBeltList'),
        stationList: document.getElementById('infoStationList'),
        planetSummaryLabel: document.getElementById('infoPlanetSummaryLabel'),
        beltSummaryLabel: document.getElementById('infoBeltSummaryLabel'),
        stationSummaryLabel: document.getElementById('infoStationSummaryLabel'),
        renameSystemBtn: document.getElementById('renameSystemBtn'),
        deletePrimaryStarBtn: document.getElementById('deletePrimaryStarBtn'),
        renameBodyBtn: document.getElementById('renameBodyBtn'),
        rerollBodyBtn: document.getElementById('rerollBodyBtn'),
        quickDeleteBodyBtn: document.getElementById('quickDeleteBodyBtn'),
        editStarClassRow: document.getElementById('editStarClassRow'),
        editStarClassSelect: document.getElementById('editStarClassSelect'),
        editPlanetTypeRow: document.getElementById('editPlanetTypeRow'),
        editPlanetTypeSelect: document.getElementById('editPlanetTypeSelect'),
        editInhabitPlanetRow: document.getElementById('editInhabitPlanetRow'),
        editInhabitPlanetBtn: document.getElementById('editInhabitPlanetBtn'),
        addStarInSectionBtn: document.getElementById('editAddStarInSectionBtn'),
        addSystemHereBtn: document.getElementById('addSystemHereBtn'),
        addPoiHereBtn: document.getElementById('addPoiHereBtn'),
        deletePoiHereBtn: document.getElementById('deletePoiHereBtn'),
        pinSelectedSystemBtn: document.getElementById('pinSelectedSystemBtn'),
        rerollSelectedSystemBtn: document.getElementById('rerollSelectedSystemBtn'),
        setCoreSystemBtn: document.getElementById('setCoreSystemBtn'),
        selectedSystemPinState: document.getElementById('selectedSystemPinState'),
        selectedSystemCoreState: document.getElementById('selectedSystemCoreState')
    };
}

export function setBodySummaryLabels(refs, planetCount, beltCount, stationCount) {
    if (refs.planetSummaryLabel) refs.planetSummaryLabel.innerText = `Planets (${planetCount})`;
    if (refs.beltSummaryLabel) refs.beltSummaryLabel.innerText = `Belts & Fields (${beltCount})`;
    if (refs.stationSummaryLabel) refs.stationSummaryLabel.innerText = `Stations (${stationCount})`;
}

export function setStarSummaryLabel(refs, starCount) {
    if (refs.starSummaryLabel) refs.starSummaryLabel.innerText = `Stars (${Math.max(0, Number(starCount) || 0)})`;
}

export function disableStarEditControls(refs) {
    if (refs.editStarClassRow) refs.editStarClassRow.classList.add('hidden');
    if (refs.editStarClassSelect) refs.editStarClassSelect.onchange = null;
}

export function disablePlanetTypeControls(refs) {
    if (refs.editPlanetTypeRow) refs.editPlanetTypeRow.classList.add('hidden');
    if (refs.editPlanetTypeSelect) refs.editPlanetTypeSelect.onchange = null;
}

export function disableInhabitControls(refs) {
    if (refs.editInhabitPlanetRow) refs.editInhabitPlanetRow.classList.add('hidden');
    if (refs.editInhabitPlanetBtn) {
        refs.editInhabitPlanetBtn.disabled = true;
        refs.editInhabitPlanetBtn.onclick = null;
        refs.editInhabitPlanetBtn.innerText = 'Inhabit Planet';
        setInhabitButtonStyle(refs.editInhabitPlanetBtn, false);
    }
}
