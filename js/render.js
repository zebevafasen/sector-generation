import { HEX_HEIGHT, HEX_SIZE, HEX_WIDTH, STAR_VISUALS, state } from './config.js';
import { formatStarAgeValue, generateStarAge, getStarClassInfo, hideStarClassInfo } from './core.js';
import { getBodyIconMarkup, normalizeBodyType } from './body-icons.js';

const STAR_GRADIENT_CACHE = {};

function notifySectorDataChanged() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('sectorDataChanged'));
}

function getCurrentGridDimensions() {
    const snapshot = state.sectorConfigSnapshot
        || (state.lastSectorSnapshot && state.lastSectorSnapshot.sectorConfigSnapshot)
        || null;
    let width = parseInt(snapshot && snapshot.width, 10);
    let height = parseInt(snapshot && snapshot.height, 10);

    if (!Number.isFinite(width) || width < 1) {
        width = parseInt(document.getElementById('gridWidth')?.value || '8', 10);
    }
    if (!Number.isFinite(height) || height < 1) {
        height = parseInt(document.getElementById('gridHeight')?.value || '10', 10);
    }
    if (!Number.isFinite(width) || width < 1) width = 8;
    if (!Number.isFinite(height) || height < 1) height = 10;

    return { width, height };
}

function redrawAndReselect(hexId, preselectedBodyIndex = null) {
    const { width, height } = getCurrentGridDimensions();
    drawGrid(width, height, { resetView: false });
    const selectedGroup = document.querySelector(`.hex-group[data-id="${hexId}"]`);
    if (!selectedGroup) return;
    selectHex(hexId, selectedGroup);
    if (Number.isInteger(preselectedBodyIndex) && preselectedBodyIndex >= 0) {
        updateInfoPanel(hexId, preselectedBodyIndex);
    }
}

function resetBodyDetailsPanel() {
    const panel = document.getElementById('infoBodyDetailsPanel');
    const empty = document.getElementById('infoBodyDetailsEmpty');
    const content = document.getElementById('infoBodyDetailsContent');
    const name = document.getElementById('infoBodyDetailsName');
    const type = document.getElementById('infoBodyDetailsType');
    const renameBodyBtn = document.getElementById('renameBodyBtn');
    const quickDeleteBodyBtn = document.getElementById('quickDeleteBodyBtn');
    const editPlanetTypeRow = document.getElementById('editPlanetTypeRow');
    const editPlanetTypeSelect = document.getElementById('editPlanetTypeSelect');
    const placeholder = document.getElementById('infoBodyDetailsPlaceholder');

    if (panel) panel.classList.add('hidden');
    if (empty) {
        empty.classList.remove('hidden');
        empty.innerText = 'Select a planet, belt, or station to inspect.';
    }
    if (content) content.classList.add('hidden');
    if (name) name.innerText = 'Body';
    if (type) type.innerText = 'Type';
    setButtonAction(renameBodyBtn, false);
    setButtonAction(quickDeleteBodyBtn, false);
    if (editPlanetTypeRow) editPlanetTypeRow.classList.add('hidden');
    if (editPlanetTypeSelect) editPlanetTypeSelect.onchange = null;
    if (placeholder) placeholder.innerText = 'Detailed stats coming soon.';
}

function positionBodyDetailsPanel(panel, anchorEl) {
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

function showBodyDetailsPanel(body, anchorEl) {
    const panel = document.getElementById('infoBodyDetailsPanel');
    const empty = document.getElementById('infoBodyDetailsEmpty');
    const content = document.getElementById('infoBodyDetailsContent');
    const name = document.getElementById('infoBodyDetailsName');
    const type = document.getElementById('infoBodyDetailsType');
    const placeholder = document.getElementById('infoBodyDetailsPlaceholder');
    const normalizedType = normalizeBodyType(body.type);

    if (panel) panel.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');
    if (content) content.classList.remove('hidden');
    if (name) name.innerText = body.name;
    if (type) type.innerText = normalizedType;
    if (placeholder) placeholder.innerText = 'Detailed stats coming soon.';
    if (panel && anchorEl) positionBodyDetailsPanel(panel, anchorEl);
}

function setPinButtonStyle(button, isPinned) {
    if (!button) return;
    const base = 'py-1.5 text-xs rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    if (isPinned) {
        button.className = `${base} bg-rose-900/30 border-rose-700 text-rose-200 hover:bg-rose-800/40 hover:border-rose-500`;
    } else {
        button.className = `${base} bg-emerald-900/30 border-emerald-700 text-emerald-200 hover:bg-emerald-800/40 hover:border-emerald-500`;
    }
}

function setButtonAction(button, enabled, onClick = null) {
    if (!button) return;
    button.disabled = !enabled;
    button.onclick = enabled ? onClick : null;
}

function getInfoPanelRefs() {
    return {
        panel: document.getElementById('infoPanel'),
        hexId: document.getElementById('infoHexId'),
        systemDetails: document.getElementById('systemDetails'),
        emptyDetails: document.getElementById('emptyDetails'),
        typeLabel: document.getElementById('infoType'),
        systemName: document.getElementById('infoSystemName'),
        starClassLabel: document.getElementById('infoStarClass'),
        starVisual: document.getElementById('infoStarVisual'),
        starAgeLabel: document.getElementById('infoStarAge'),
        planetCountLabel: document.getElementById('infoPlanetCount'),
        populationLabel: document.getElementById('infoPop'),
        planetList: document.getElementById('infoPlanetList'),
        beltList: document.getElementById('infoBeltList'),
        stationList: document.getElementById('infoStationList'),
        planetSummaryLabel: document.getElementById('infoPlanetSummaryLabel'),
        beltSummaryLabel: document.getElementById('infoBeltSummaryLabel'),
        stationSummaryLabel: document.getElementById('infoStationSummaryLabel'),
        renameSystemBtn: document.getElementById('renameSystemBtn'),
        renameBodyBtn: document.getElementById('renameBodyBtn'),
        quickDeleteBodyBtn: document.getElementById('quickDeleteBodyBtn'),
        editStarClassRow: document.getElementById('editStarClassRow'),
        editStarClassSelect: document.getElementById('editStarClassSelect'),
        editPlanetTypeRow: document.getElementById('editPlanetTypeRow'),
        editPlanetTypeSelect: document.getElementById('editPlanetTypeSelect'),
        addSystemHereBtn: document.getElementById('addSystemHereBtn'),
        pinSelectedSystemBtn: document.getElementById('pinSelectedSystemBtn'),
        rerollSelectedSystemBtn: document.getElementById('rerollSelectedSystemBtn'),
        selectedSystemPinState: document.getElementById('selectedSystemPinState')
    };
}

function setBodySummaryLabels(refs, planetCount, beltCount, stationCount) {
    if (refs.planetSummaryLabel) refs.planetSummaryLabel.innerText = `Planets (${planetCount})`;
    if (refs.beltSummaryLabel) refs.beltSummaryLabel.innerText = `Belts & Fields (${beltCount})`;
    if (refs.stationSummaryLabel) refs.stationSummaryLabel.innerText = `Stations (${stationCount})`;
}

function disableStarEditControls(refs) {
    if (refs.editStarClassRow) refs.editStarClassRow.classList.add('hidden');
    if (refs.editStarClassSelect) refs.editStarClassSelect.onchange = null;
}

function disablePlanetTypeControls(refs) {
    if (refs.editPlanetTypeRow) refs.editPlanetTypeRow.classList.add('hidden');
    if (refs.editPlanetTypeSelect) refs.editPlanetTypeSelect.onchange = null;
}

export function ensureStarGradient(svg, starClass) {
    const key = (starClass || 'default').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (STAR_GRADIENT_CACHE[key]) return STAR_GRADIENT_CACHE[key];

    let defs = svg.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.insertBefore(defs, svg.firstChild);
    }

    const gradientId = `starGradient-${key}`;
    let gradient = document.getElementById(gradientId);
    if (!gradient) {
        gradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
        gradient.setAttribute('id', gradientId);
        gradient.setAttribute('cx', '50%');
        gradient.setAttribute('cy', '50%');
        gradient.setAttribute('r', '50%');

        const palette = STAR_VISUALS[starClass] || STAR_VISUALS.default;
        const stops = [
            { offset: '0%', color: palette.core },
            { offset: '55%', color: palette.mid },
            { offset: '100%', color: palette.halo }
        ];

        stops.forEach(stopData => {
            const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stop.setAttribute('offset', stopData.offset);
            stop.setAttribute('stop-color', stopData.color);
            gradient.appendChild(stop);
        });

        defs.appendChild(gradient);
    }

    STAR_GRADIENT_CACHE[key] = gradientId;
    return gradientId;
}

export function drawGrid(cols, rows, options = {}) {
    const svg = document.getElementById('hexGrid');
    const resetView = options.resetView !== false;

    const realWidth = cols * HEX_WIDTH + (HEX_WIDTH * 0.5);
    const realHeight = rows * (HEX_HEIGHT * 0.75) + (HEX_HEIGHT * 0.25);

    let viewport = document.getElementById('mapViewport');
    if (!viewport) {
        viewport = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        viewport.setAttribute('id', 'mapViewport');
        svg.appendChild(viewport);
    }
    viewport.innerHTML = '';

    const container = document.getElementById('mapContainer');
    const startX = (container.clientWidth - realWidth) / 2;
    const startY = (container.clientHeight - realHeight) / 2;

    if (resetView) {
        state.viewState = {
            ...state.viewState,
            scale: 1,
            x: startX > 0 ? startX : 20,
            y: startY > 0 ? startY : 20,
            isDragging: false,
            dragDistance: 0
        };
    }
    updateViewTransform();

    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
            const hexId = `${c}-${r}`;
            const system = state.sectors[hexId];
            const xOffset = (r % 2 === 1) ? (HEX_WIDTH / 2) : 0;
            const x = (c * HEX_WIDTH) + xOffset + (HEX_WIDTH / 2);
            const y = (r * (HEX_HEIGHT * 0.75)) + (HEX_HEIGHT / 2);

            const isPinned = !!(system && state.pinnedHexIds && state.pinnedHexIds.includes(hexId));
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('class', 'hex-group');
            g.setAttribute('data-id', hexId);
            g.onclick = (e) => handleHexClick(e, hexId, g);

            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', calculateHexPoints(x, y, HEX_SIZE - 2));
            poly.setAttribute('class', 'hex');
            poly.setAttribute('fill', system ? '#0f172a' : '#1e293b');
            poly.setAttribute('stroke', '#334155');
            poly.setAttribute('stroke-width', '1');
            if (isPinned) poly.classList.add('pinned');
            g.appendChild(poly);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x);
            text.setAttribute('y', y + HEX_SIZE / 1.5);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('class', 'hex-text');
            text.textContent = `${String(c).padStart(2, '0')}${String(r).padStart(2, '0')}`;
            g.appendChild(text);

            if (system) {
                const gradientId = ensureStarGradient(svg, system.starClass);
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', x);
                circle.setAttribute('cy', y);

                let rSize = 6;
                if (system.starClass === 'M' || system.starClass === 'Neutron') rSize = 4;
                if (system.starClass === 'O' || system.starClass === 'B') rSize = 9;
                if (system.starClass === 'Black Hole') {
                    rSize = 5;
                    circle.setAttribute('stroke', 'white');
                    circle.setAttribute('stroke-width', '1');
                }

                circle.setAttribute('r', rSize);
                circle.setAttribute('fill', `url(#${gradientId})`);
                circle.setAttribute('class', 'star-circle');
                circle.style.filter = `drop-shadow(0 0 8px ${system.glow || system.color})`;
                g.appendChild(circle);

                if (isPinned) {
                    const pinRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    pinRing.setAttribute('cx', x);
                    pinRing.setAttribute('cy', y);
                    pinRing.setAttribute('r', String(rSize + 4));
                    pinRing.setAttribute('fill', 'none');
                    pinRing.setAttribute('stroke', '#2dd4bf');
                    pinRing.setAttribute('stroke-width', '1.4');
                    pinRing.setAttribute('stroke-dasharray', '2 2');
                    pinRing.setAttribute('class', 'star-circle');
                    g.appendChild(pinRing);
                }
            }

            viewport.appendChild(g);
        }
    }
}

export function calculateHexPoints(cx, cy, size) {
    const points = [];
    for (let i = 0; i < 6; i++) {
        const angleDeg = 60 * i - 30;
        const angleRad = (Math.PI / 180) * angleDeg;
        points.push(`${cx + size * Math.cos(angleRad)},${cy + size * Math.sin(angleRad)}`);
    }
    return points.join(' ');
}

export function setupPanZoom() {
    const container = document.getElementById('mapContainer');

    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSpeed = 0.001;
        const zoomFactor = Math.exp(-e.deltaY * zoomSpeed);
        const newScale = Math.min(Math.max(state.viewState.scale * zoomFactor, 0.2), 5);

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = (mouseX - state.viewState.x) / state.viewState.scale;
        const worldY = (mouseY - state.viewState.y) / state.viewState.scale;

        state.viewState.x = mouseX - worldX * newScale;
        state.viewState.y = mouseY - worldY * newScale;
        state.viewState.scale = newScale;
        updateViewTransform();
    });

    container.addEventListener('mousedown', (e) => {
        state.viewState.isDragging = true;
        state.viewState.startX = e.clientX;
        state.viewState.startY = e.clientY;
        state.viewState.lastX = state.viewState.x;
        state.viewState.lastY = state.viewState.y;
        state.viewState.dragDistance = 0;
    });

    window.addEventListener('mousemove', (e) => {
        if (!state.viewState.isDragging) return;
        e.preventDefault();

        const dx = e.clientX - state.viewState.startX;
        const dy = e.clientY - state.viewState.startY;

        state.viewState.dragDistance += Math.abs(e.movementX) + Math.abs(e.movementY);
        state.viewState.x = state.viewState.lastX + dx;
        state.viewState.y = state.viewState.lastY + dy;
        updateViewTransform();
    });

    window.addEventListener('mouseup', () => {
        state.viewState.isDragging = false;
    });
}

export function updateViewTransform() {
    const viewport = document.getElementById('mapViewport');
    if (viewport) {
        viewport.setAttribute('transform', `translate(${state.viewState.x}, ${state.viewState.y}) scale(${state.viewState.scale})`);
    }
}

export function handleHexClick(e, id, groupElement) {
    if (state.viewState.dragDistance > 5) return;
    selectHex(id, groupElement);
}

export function selectHex(id, groupElement) {
    document.querySelectorAll('.hex.selected').forEach(el => el.classList.remove('selected'));
    const poly = groupElement.querySelector('polygon');
    poly.classList.add('selected');
    state.selectedHexId = id;
    state.selectedBodyIndex = null;
    updateInfoPanel(id);
}

export function updateInfoPanel(id, preselectedBodyIndex = null) {
    const system = state.sectors[id];
    state.selectedSystemData = system;
    const [c, r] = id.split('-');
    const displayId = `${String(c).padStart(2, '0')}${String(r).padStart(2, '0')}`;

    hideStarClassInfo(true);
    state.starTooltipPinned = false;

    const refs = getInfoPanelRefs();
    const panel = refs.panel;
    panel.classList.remove('opacity-50', 'pointer-events-none');
    panel.classList.add('opacity-100');
    refs.hexId.innerText = displayId;
    let selectedBodyEl = null;

    if (system) {
        refs.systemDetails.classList.remove('hidden');
        refs.emptyDetails.classList.add('hidden');
        refs.typeLabel.innerText = 'Star System';
        refs.typeLabel.className = 'text-xs px-2 py-0.5 rounded-full bg-sky-900 text-sky-200 border border-sky-600';

        refs.systemName.innerText = system.name;
        if (refs.renameSystemBtn) {
            setButtonAction(refs.renameSystemBtn, true, () => {
                const nextNameRaw = prompt('Rename system', system.name);
                if (nextNameRaw === null) return;
                const nextName = nextNameRaw.trim();
                if (!nextName) return;
                system.name = nextName;
                notifySectorDataChanged();
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
                        notifySectorDataChanged();
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
            refs.pinSelectedSystemBtn.innerText = isPinned ? 'Unpin System' : 'Pin System';
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

        refs.planetCountLabel.innerText =
            system.planets.filter(p => p.type !== 'Artificial' && !/belt|field/i.test(p.type)).length;
        refs.populationLabel.innerText = system.totalPop;

        if (refs.planetList && refs.beltList && refs.stationList) {
            refs.planetList.innerHTML = '';
            refs.beltList.innerHTML = '';
            refs.stationList.innerHTML = '';
            resetBodyDetailsPanel();

            const renderBody = (body, bodyIndex) => {
                const li = document.createElement('li');
                li.className = 'bg-slate-800/50 p-2 rounded border border-slate-700/50 flex flex-col cursor-pointer transition-colors hover:border-sky-600/60';
                li.setAttribute('role', 'button');
                li.setAttribute('tabindex', '0');
                li.setAttribute('data-body-index', String(bodyIndex));

                const normalizedType = normalizeBodyType(body.type);
                const bodyIcon = getBodyIconMarkup(normalizedType);

                let html = `<div class="flex justify-between font-semibold text-sky-100"><span class="inline-flex items-center gap-2">${bodyIcon}${body.name}</span> <span class="text-xs text-slate-500 font-normal">${normalizedType}</span></div>`;
                if (normalizedType !== 'Artificial' && !/belt|field/i.test(normalizedType) && body.habitable) {
                    html += '<div class="text-[11px] mt-1 pl-5"><span class="inline-block px-1.5 py-0.5 rounded border text-emerald-300 border-emerald-600/60 bg-emerald-900/25">Inhabitated</span></div>';
                }
                li.innerHTML = html;

                const selectBody = () => {
                    if (selectedBodyEl === li) {
                        li.classList.remove('ring-1', 'ring-sky-500/70', 'border-sky-500/70');
                        selectedBodyEl = null;
                        state.selectedBodyIndex = null;
                        setButtonAction(refs.renameBodyBtn, false);
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
                        setButtonAction(refs.renameBodyBtn, true, () => {
                            const currentName = system.planets[bodyIndex] ? system.planets[bodyIndex].name : body.name;
                            const nextNameRaw = prompt('Rename object', currentName);
                            if (nextNameRaw === null) return;
                            const nextName = nextNameRaw.trim();
                            if (!nextName || !system.planets[bodyIndex]) return;
                            system.planets[bodyIndex].name = nextName;
                            notifySectorDataChanged();
                            updateInfoPanel(id, bodyIndex);
                        });
                    }
                    if (refs.editPlanetTypeRow && refs.editPlanetTypeSelect) {
                        const isPlanetary = normalizedType !== 'Artificial' && !/belt|field/i.test(normalizedType);
                        const canEditPlanetType = state.editMode && isPlanetary;
                        refs.editPlanetTypeRow.classList.toggle('hidden', !canEditPlanetType);
                        if (canEditPlanetType) {
                            refs.editPlanetTypeSelect.value = normalizedType;
                            refs.editPlanetTypeSelect.onchange = () => {
                                const targetSystem = state.sectors[id];
                                if (!targetSystem || !targetSystem.planets[bodyIndex]) return;
                                targetSystem.planets[bodyIndex].type = refs.editPlanetTypeSelect.value;
                                notifySectorDataChanged();
                                updateInfoPanel(id, bodyIndex);
                            };
                        } else {
                            refs.editPlanetTypeSelect.onchange = null;
                        }
                    }
                    if (refs.quickDeleteBodyBtn && state.editMode) {
                        setButtonAction(refs.quickDeleteBodyBtn, true, () => {
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new Event('requestDeleteSelectedBody'));
                            }
                        });
                    }
                };

                li.addEventListener('click', selectBody);
                li.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectBody();
                    }
                });
                return li;
            };

            system.planets.forEach((body, bodyIndex) => {
                if (body.type === 'Artificial') {
                    refs.stationList.appendChild(renderBody(body, bodyIndex));
                } else if (/belt|field/i.test(body.type)) {
                    refs.beltList.appendChild(renderBody(body, bodyIndex));
                } else {
                    refs.planetList.appendChild(renderBody(body, bodyIndex));
                }
            });
            if (Number.isInteger(preselectedBodyIndex) && preselectedBodyIndex >= 0) {
                const node = document.querySelector(`[data-body-index="${preselectedBodyIndex}"]`);
                if (node) node.click();
            }

            const planetCount = system.planets.filter(body => body.type !== 'Artificial' && !/belt|field/i.test(body.type)).length;
            const beltCount = system.planets.filter(body => /belt|field/i.test(body.type)).length;
            const stationCount = system.planets.filter(body => body.type === 'Artificial').length;
            if (!refs.planetList.children.length) refs.planetList.innerHTML = '<li class="italic text-slate-600">No planets detected.</li>';
            if (!refs.beltList.children.length) refs.beltList.innerHTML = '<li class="italic text-slate-600">No belts or fields detected.</li>';
            if (!refs.stationList.children.length) refs.stationList.innerHTML = '<li class="italic text-slate-600">No stations detected.</li>';
            setBodySummaryLabels(refs, planetCount, beltCount, stationCount);
        }
    } else {
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
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('requestAddSystemAtHex', { detail: { hexId: id } }));
                    }
                };
            } else {
                refs.addSystemHereBtn.classList.add('hidden');
                refs.addSystemHereBtn.onclick = null;
            }
        }
        setButtonAction(refs.renameSystemBtn, false);
        disableStarEditControls(refs);
        setButtonAction(refs.renameBodyBtn, false);
        setButtonAction(refs.quickDeleteBodyBtn, false);
        disablePlanetTypeControls(refs);
        setBodySummaryLabels(refs, 0, 0, 0);
        if (refs.pinSelectedSystemBtn) {
            refs.pinSelectedSystemBtn.disabled = true;
            refs.pinSelectedSystemBtn.innerText = 'Pin System';
            setPinButtonStyle(refs.pinSelectedSystemBtn, false);
        }
        if (refs.rerollSelectedSystemBtn) refs.rerollSelectedSystemBtn.disabled = true;
        if (refs.selectedSystemPinState) refs.selectedSystemPinState.innerText = 'Pinned: --';
        resetBodyDetailsPanel();
    }
}

export function clearInfoPanel() {
    const refs = getInfoPanelRefs();
    refs.panel.classList.add('opacity-50', 'pointer-events-none');
    refs.hexId.innerText = '--';
    refs.typeLabel.innerText = 'Scanning...';
    refs.systemDetails.classList.add('hidden');
    refs.emptyDetails.classList.remove('hidden');
    refs.emptyDetails.innerText = 'Select a hex to view data.';
    state.selectedSystemData = null;
    state.selectedBodyIndex = null;

    if (refs.starClassLabel) {
        refs.starClassLabel.innerText = 'Class --';
        refs.starClassLabel.classList.remove('cursor-help', 'text-sky-300', 'star-class-hint');
    }

    if (refs.starAgeLabel) refs.starAgeLabel.innerText = 'Age: --';
    setButtonAction(refs.renameSystemBtn, false);
    setButtonAction(refs.renameBodyBtn, false);
    setButtonAction(refs.quickDeleteBodyBtn, false);
    if (refs.addSystemHereBtn) {
        refs.addSystemHereBtn.classList.add('hidden');
        refs.addSystemHereBtn.onclick = null;
    }
    setBodySummaryLabels(refs, 0, 0, 0);
    disableStarEditControls(refs);
    disablePlanetTypeControls(refs);

    if (refs.pinSelectedSystemBtn) {
        refs.pinSelectedSystemBtn.disabled = true;
        refs.pinSelectedSystemBtn.innerText = 'Pin System';
        setPinButtonStyle(refs.pinSelectedSystemBtn, false);
    }
    if (refs.rerollSelectedSystemBtn) refs.rerollSelectedSystemBtn.disabled = true;
    if (refs.selectedSystemPinState) refs.selectedSystemPinState.innerText = 'Pinned: --';

    resetBodyDetailsPanel();
}
