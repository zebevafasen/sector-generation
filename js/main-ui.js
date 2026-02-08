import { state } from './config.js';
import { updateViewTransform } from './render.js';
import { getMainRefs } from './main-refs.js';

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
    if (refs.exportSectorBtn && refs.exportSuitePanel) {
        refs.exportSectorBtn.addEventListener('click', () => {
            const isHidden = refs.exportSuitePanel.classList.toggle('hidden');
            refs.exportSectorBtn.setAttribute('aria-expanded', String(!isHidden));
        });
    }
    if (refs.searchToggleBtn && refs.searchPanelContent) {
        refs.searchToggleBtn.addEventListener('click', () => {
            const isCollapsed = refs.searchPanelContent.classList.toggle('hidden');
            refs.searchToggleBtn.innerText = isCollapsed ? '+' : '-';
            refs.searchToggleBtn.title = isCollapsed ? 'Expand search panel' : 'Collapse search panel';
            refs.searchToggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand search panel' : 'Collapse search panel');
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
}
