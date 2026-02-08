import { state } from './config.js';
import { updateViewTransform } from './render.js';
import { getMainRefs } from './main-refs.js';

const PANEL_STATE_STORAGE_KEY = 'hex-star-sector-gen:panel-state';
const PERSISTED_DETAILS_SECTION_IDS = [
    'gridConfigSection',
    'stellarDensitySection',
    'seedDataSection',
    'ioControlsSection',
    'factionsSection',
    'infoStarDetails'
];

function readPersistedPanelState() {
    if (!(typeof window !== 'undefined' && window.localStorage)) return {};
    try {
        const raw = window.localStorage.getItem(PANEL_STATE_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return {};
        return parsed;
    } catch {
        return {};
    }
}

function writePersistedPanelState(patch) {
    if (!(typeof window !== 'undefined' && window.localStorage)) return;
    const nextState = {
        ...readPersistedPanelState(),
        ...patch
    };
    try {
        window.localStorage.setItem(PANEL_STATE_STORAGE_KEY, JSON.stringify(nextState));
    } catch (err) {
        console.error(err);
    }
}

function setSearchPanelToggleUi(refs, isOpen) {
    if (!refs.searchPanelContent || !refs.searchToggleBtn) return;
    refs.searchPanelContent.classList.toggle('hidden', !isOpen);
    refs.searchToggleBtn.innerText = isOpen ? '-' : '+';
    refs.searchToggleBtn.title = isOpen ? 'Collapse search panel' : 'Expand search panel';
    refs.searchToggleBtn.setAttribute('aria-label', isOpen ? 'Collapse search panel' : 'Expand search panel');
}

function bindPersistedDetailsSections() {
    const persistedState = readPersistedPanelState();
    PERSISTED_DETAILS_SECTION_IDS.forEach((id) => {
        const section = document.getElementById(id);
        if (!section || section.tagName.toLowerCase() !== 'details') return;
        const persistedOpen = persistedState[id];
        if (typeof persistedOpen === 'boolean') {
            section.open = persistedOpen;
        }
        section.addEventListener('toggle', () => {
            writePersistedPanelState({ [id]: section.open });
        });
    });
}

function bindSidebarToggle(config, mapContainer) {
    const sidebar = document.getElementById(config.sidebarId);
    const header = document.getElementById(config.headerId);
    const content = document.getElementById(config.contentId);
    const button = document.getElementById(config.buttonId);
    if (!sidebar || !header || !content || !button) return;

    const applyState = (collapsed) => {
        header.classList.toggle('hidden', collapsed);
        content.classList.toggle('hidden', collapsed);
        sidebar.classList.toggle('w-full', !collapsed);
        sidebar.classList.toggle('w-2', collapsed);
        sidebar.classList.toggle('md:w-96', !collapsed);
        sidebar.classList.toggle('md:w-3', collapsed);
        if (config.side === 'left') {
            button.innerHTML = collapsed ? '&raquo;' : '&laquo;';
        } else {
            button.innerHTML = collapsed ? '&laquo;' : '&raquo;';
        }
        button.setAttribute('aria-expanded', String(!collapsed));
    };

    let collapsed = false;
    applyState(collapsed);

    button.addEventListener('click', () => {
        const beforeRect = mapContainer ? mapContainer.getBoundingClientRect() : null;
        collapsed = !collapsed;
        applyState(collapsed);
        if (mapContainer && beforeRect) {
            requestAnimationFrame(() => {
                const afterRect = mapContainer.getBoundingClientRect();
                const deltaX = afterRect.left - beforeRect.left;
                const deltaY = afterRect.top - beforeRect.top;
                if (deltaX !== 0 || deltaY !== 0) {
                    state.viewState.x -= deltaX;
                    state.viewState.y -= deltaY;
                    updateViewTransform();
                }
            });
        }
    });
}

export function setupPanelToggles() {
    const mapContainer = document.getElementById('mapContainer');
    bindSidebarToggle({
        sidebarId: 'leftSidebar',
        headerId: 'leftSidebarHeader',
        contentId: 'leftSidebarContent',
        buttonId: 'toggleLeftPanelBtn',
        side: 'left'
    }, mapContainer);
    bindSidebarToggle({
        sidebarId: 'rightSidebar',
        headerId: 'rightSidebarHeader',
        contentId: 'rightSidebarContent',
        buttonId: 'toggleRightPanelBtn',
        side: 'right'
    }, mapContainer);
}

export function bindSectionToggles(refs) {
    bindPersistedDetailsSections();
    const persistedState = readPersistedPanelState();

    if (refs.exportSectorBtn && refs.exportSuitePanel) {
        if (typeof persistedState.exportSuiteOpen === 'boolean') {
            refs.exportSuitePanel.classList.toggle('hidden', !persistedState.exportSuiteOpen);
            refs.exportSectorBtn.setAttribute('aria-expanded', String(persistedState.exportSuiteOpen));
        }
        refs.exportSectorBtn.addEventListener('click', () => {
            const isHidden = refs.exportSuitePanel.classList.toggle('hidden');
            refs.exportSectorBtn.setAttribute('aria-expanded', String(!isHidden));
            writePersistedPanelState({ exportSuiteOpen: !isHidden });
        });
    }
    if (refs.searchToggleBtn && refs.searchPanelContent) {
        if (typeof persistedState.searchPanelOpen === 'boolean') {
            setSearchPanelToggleUi(refs, persistedState.searchPanelOpen);
        }
        refs.searchToggleBtn.addEventListener('click', () => {
            const isOpen = refs.searchPanelContent.classList.contains('hidden');
            setSearchPanelToggleUi(refs, isOpen);
            writePersistedPanelState({ searchPanelOpen: isOpen });
        });
    }
}

export function updateEditModeUi() {
    const refs = getMainRefs();
    if (refs.editModeToggleBtn) {
        refs.editModeToggleBtn.innerText = state.editMode ? 'EDIT MODE: ON' : 'EDIT MODE: OFF';
        refs.editModeToggleBtn.className = state.editMode
            ? 'px-2 py-1 text-[10px] rounded border border-emerald-500 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold tracking-wide transition-colors'
            : 'px-2 py-1 text-[10px] rounded border border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold tracking-wide transition-colors';
    }
    if (refs.editModeControls) refs.editModeControls.classList.toggle('hidden', !state.editMode);
    if (refs.editHistoryPanel) refs.editHistoryPanel.classList.toggle('hidden', !state.editMode);
    if (refs.quickDeleteBodyBtn) {
        refs.quickDeleteBodyBtn.classList.toggle('hidden', !state.editMode);
        if (!state.editMode) {
            refs.quickDeleteBodyBtn.disabled = true;
            refs.quickDeleteBodyBtn.onclick = null;
        }
    }
    if (refs.editAddPlanetInSectionBtn) refs.editAddPlanetInSectionBtn.classList.toggle('hidden', !state.editMode);
    if (refs.editAddBeltInSectionBtn) refs.editAddBeltInSectionBtn.classList.toggle('hidden', !state.editMode);
    if (refs.editAddStationInSectionBtn) refs.editAddStationInSectionBtn.classList.toggle('hidden', !state.editMode);
    if (refs.editAddStarInSectionBtn) refs.editAddStarInSectionBtn.classList.toggle('hidden', !state.editMode);
}
