import { HEX_HEIGHT, HEX_SIZE, HEX_WIDTH, STAR_VISUALS, state } from './config.js';
import { formatStarAgeValue, getStarClassInfo, hideStarClassInfo, rand } from './core.js';

const STAR_GRADIENT_CACHE = {};

function normalizeBodyType(type) {
    return type === 'Lava' ? 'Volcanic' : type;
}

function getBodyIconMarkup(type) {
    const normalizedType = normalizeBodyType(type);
    const base = 'inline-block w-4 h-4 md:w-[18px] md:h-[18px] shrink-0';

    if (/belt|field/i.test(normalizedType)) {
        return `<svg class="${base}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#8b5cf6" opacity="0.25"/><circle cx="8" cy="12" r="1.7" fill="#ddd6fe"/><circle cx="12" cy="9" r="1.4" fill="#c4b5fd"/><circle cx="15.5" cy="13.5" r="1.6" fill="#e9d5ff"/><circle cx="10.5" cy="15.2" r="1.1" fill="#a78bfa"/></svg>`;
    }

    if (normalizedType === 'Artificial') {
        return `<svg class="${base}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#d946ef" opacity="0.2"/><rect x="8" y="8" width="8" height="8" rx="1.5" fill="#f5d0fe"/><rect x="10.6" y="2.7" width="2.8" height="3.2" rx="0.8" fill="#f0abfc"/><rect x="10.6" y="18.1" width="2.8" height="3.2" rx="0.8" fill="#f0abfc"/><rect x="2.7" y="10.6" width="3.2" height="2.8" rx="0.8" fill="#f0abfc"/><rect x="18.1" y="10.6" width="3.2" height="2.8" rx="0.8" fill="#f0abfc"/></svg>`;
    }

    if (normalizedType === 'Gas Giant') {
        return `<svg class="${base}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#f59e0b"/><path d="M4.2 9.2C7.2 7.8 11.9 7.7 19.1 9.2" stroke="#fde68a" stroke-width="1.5" stroke-linecap="round"/><path d="M4.3 12C8.2 10.8 12.8 10.8 19.2 12" stroke="#fcd34d" stroke-width="1.7" stroke-linecap="round"/><path d="M4.6 14.8C8.8 14.2 13.3 14.2 18.8 15.2" stroke="#fef3c7" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1"/></svg>`;
    }

    if (normalizedType === 'Terrestrial') {
        return `<svg class="${base}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#2563eb"/><path d="M7.2 8.7c1.7-1.5 3.5-1.7 4.7-.7 1.1.9.8 2.4-.5 3.4-1.6 1.2-3.5 1.3-4.8.1-.9-.8-.8-1.8.6-2.8Z" fill="#34d399"/><path d="M13.2 13.5c1.4-.9 3-.7 3.7.4.8 1.2.4 2.9-1.2 3.7-1.7.9-3.6.5-4.1-.9-.4-1.1.1-2.3 1.6-3.2Z" fill="#6ee7b7"/><circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1"/></svg>`;
    }

    if (normalizedType === 'Oceanic') {
        return `<svg class="${base}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#0284c7"/><path d="M5 11c2.2-1.5 4.4-1.6 6.7 0 2.1 1.4 4.3 1.5 6.3.1" stroke="#7dd3fc" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M5.2 14.4c2.4-1.2 4.7-1.2 7 .1 2.1 1.1 4 .9 5.8-.2" stroke="#bae6fd" stroke-width="1.3" stroke-linecap="round" fill="none"/><circle cx="9" cy="8.2" r="1.1" fill="#d9f99d" opacity="0.85"/><circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1"/></svg>`;
    }

    if (normalizedType === 'Volcanic') {
        return `<svg class="${base}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#3f1d1d"/><path d="M8.2 16.2 10 13l1.7 1.5 2.3-4.4 1.9 2.6" stroke="#fb923c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M7.4 9.3 9.6 8M12 7.2l.7-1.7M14.8 9.4l1.8-1.2" stroke="#f97316" stroke-width="1.2" stroke-linecap="round"/><circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/></svg>`;
    }

    if (normalizedType === 'Desert') {
        return `<svg class="${base}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#d4a857"/><path d="M5.2 12.2c2.1-2.2 4.4-2.6 6.8-1.4 2.3 1.2 4.5.8 6.1-.8" stroke="#fcd34d" stroke-width="1.4" stroke-linecap="round" fill="none"/><path d="M6 15.4c1.8-1.4 3.8-1.5 5.9-.4 2 1 3.9.8 5.7-.5" stroke="#fef3c7" stroke-width="1.2" stroke-linecap="round" fill="none"/><circle cx="8.6" cy="8.3" r="0.9" fill="#fff7ed" opacity="0.7"/><circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1"/></svg>`;
    }

    if (normalizedType === 'Arctic') {
        return `<svg class="${base}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#93c5fd"/><path d="M6.8 8.6c1.3-1.2 2.9-1.7 4.8-1.4 1.8.3 3.4-.1 5-1.1" stroke="#e0f2fe" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M7 13.8 9.2 12l1.5 1.8 2-2.2 2.3 2.1 1.8-1.3" stroke="#f8fafc" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1"/></svg>`;
    }

    if (normalizedType === 'Barren') {
        return `<svg class="${base}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#9ca3af"/><circle cx="9" cy="9.1" r="2.1" fill="#6b7280" opacity="0.8"/><circle cx="14.8" cy="14.5" r="1.8" fill="#6b7280" opacity="0.75"/><circle cx="10.3" cy="15.4" r="1.2" fill="#6b7280" opacity="0.7"/><circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1"/></svg>`;
    }

    return `<span class="inline-block w-3 h-3 rounded-full bg-slate-300 ring-1 ring-white/25 shrink-0"></span>`;
}

function resetBodyDetailsPanel() {
    const panel = document.getElementById('infoBodyDetailsPanel');
    const empty = document.getElementById('infoBodyDetailsEmpty');
    const content = document.getElementById('infoBodyDetailsContent');
    const name = document.getElementById('infoBodyDetailsName');
    const type = document.getElementById('infoBodyDetailsType');
    const placeholder = document.getElementById('infoBodyDetailsPlaceholder');

    if (panel) panel.classList.add('hidden');
    if (empty) {
        empty.classList.remove('hidden');
        empty.innerText = 'Select a planet, belt, or station to inspect.';
    }
    if (content) content.classList.add('hidden');
    if (name) name.innerText = 'Body';
    if (type) type.innerText = 'Type';
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

export function drawGrid(cols, rows) {
    const svg = document.getElementById('hexGrid');

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

    state.viewState = {
        ...state.viewState,
        scale: 1,
        x: startX > 0 ? startX : 20,
        y: startY > 0 ? startY : 20,
        isDragging: false,
        dragDistance: 0
    };
    updateViewTransform();

    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
            const hexId = `${c}-${r}`;
            const system = state.sectors[hexId];
            const xOffset = (r % 2 === 1) ? (HEX_WIDTH / 2) : 0;
            const x = (c * HEX_WIDTH) + xOffset + (HEX_WIDTH / 2);
            const y = (r * (HEX_HEIGHT * 0.75)) + (HEX_HEIGHT / 2);

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
    updateInfoPanel(id);
}

export function updateInfoPanel(id) {
    const system = state.sectors[id];
    state.selectedSystemData = system;
    const [c, r] = id.split('-');
    const displayId = `${String(c).padStart(2, '0')}:${String(r).padStart(2, '0')}`;

    hideStarClassInfo(true);
    state.starTooltipPinned = false;

    const panel = document.getElementById('infoPanel');
    panel.classList.remove('opacity-50', 'pointer-events-none');
    panel.classList.add('opacity-100');
    document.getElementById('infoHexId').innerText = `HEX ${displayId}`;

    const sysDetails = document.getElementById('systemDetails');
    const emptyDetails = document.getElementById('emptyDetails');
    const typeLabel = document.getElementById('infoType');
    const starClassLabel = document.getElementById('infoStarClass');
    const starVisual = document.getElementById('infoStarVisual');
    const starAgeLabel = document.getElementById('infoStarAge');
    const planetList = document.getElementById('infoPlanetList');
    const beltList = document.getElementById('infoBeltList');
    const stationList = document.getElementById('infoStationList');
    let selectedBodyEl = null;

    if (system) {
        sysDetails.classList.remove('hidden');
        emptyDetails.classList.add('hidden');
        typeLabel.innerText = 'Star System';
        typeLabel.className = 'text-xs px-2 py-0.5 rounded-full bg-sky-900 text-sky-200 border border-sky-600';

        document.getElementById('infoSystemName').innerText = system.name;
        if (starClassLabel) {
            starClassLabel.innerText = `Class ${system.starClass} Star`;
            starClassLabel.classList.add('cursor-help', 'text-sky-300', 'star-class-hint');
        }
        if (starAgeLabel) {
            if (system.starAge && Number.isFinite(system.starAge.value) && system.starAge.unit) {
                starAgeLabel.innerText = `Age: ${formatStarAgeValue(system.starAge.value, system.starAge.unit)}`;
            } else if (system.starAge && system.starAge.display) {
                starAgeLabel.innerText = `Age: ${system.starAge.display}`;
            } else {
                const info = getStarClassInfo(system.starClass);
                starAgeLabel.innerText = `Age: ${info.typicalAge || 'Unknown'}`;
            }
        }

        if (starVisual) {
            const palette = system.palette || STAR_VISUALS[system.starClass] || STAR_VISUALS.default;
            starVisual.style.backgroundImage = `radial-gradient(circle at 40% 35%, ${system.color} 0%, ${palette.mid} 55%, ${system.glow || palette.halo} 100%)`;
            starVisual.style.backgroundColor = palette.core;
            starVisual.style.boxShadow = `0 0 12px ${system.glow || palette.halo}`;
        }

        document.getElementById('infoPlanetCount').innerText =
            system.planets.filter(p => p.type !== 'Artificial' && !/belt|field/i.test(p.type)).length;
        document.getElementById('infoPop').innerText = system.totalPop;

        if (planetList && beltList && stationList) {
            planetList.innerHTML = '';
            beltList.innerHTML = '';
            stationList.innerHTML = '';
            resetBodyDetailsPanel();

            const renderBody = (body) => {
                const li = document.createElement('li');
                li.className = 'bg-slate-800/50 p-2 rounded border border-slate-700/50 flex flex-col cursor-pointer transition-colors hover:border-sky-600/60';
                li.setAttribute('role', 'button');
                li.setAttribute('tabindex', '0');

                const normalizedType = normalizeBodyType(body.type);
                const bodyIcon = getBodyIconMarkup(normalizedType);

                let html = `<div class="flex justify-between font-semibold text-sky-100"><span class="inline-flex items-center gap-2">${bodyIcon}${body.name}</span> <span class="text-xs text-slate-500 font-normal">${normalizedType}</span></div>`;
                if (normalizedType !== 'Artificial' && !/belt|field/i.test(normalizedType) && body.habitable) {
                    html += '<div class="text-[11px] mt-1 pl-5"><span class="inline-block px-1.5 py-0.5 rounded border text-emerald-300 border-emerald-600/60 bg-emerald-900/25">Habitable</span></div>';
                }
                li.innerHTML = html;

                const selectBody = () => {
                    if (selectedBodyEl) {
                        selectedBodyEl.classList.remove('ring-1', 'ring-sky-500/70', 'border-sky-500/70');
                    }
                    li.classList.add('ring-1', 'ring-sky-500/70', 'border-sky-500/70');
                    selectedBodyEl = li;
                    showBodyDetailsPanel(body, li);
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

            system.planets.forEach(body => {
                if (body.type === 'Artificial') {
                    stationList.appendChild(renderBody(body));
                } else if (/belt|field/i.test(body.type)) {
                    beltList.appendChild(renderBody(body));
                } else {
                    planetList.appendChild(renderBody(body));
                }
            });

            if (!planetList.children.length) planetList.innerHTML = '<li class="italic text-slate-600">No planets detected.</li>';
            if (!beltList.children.length) beltList.innerHTML = '<li class="italic text-slate-600">No belts or fields detected.</li>';
            if (!stationList.children.length) stationList.innerHTML = '<li class="italic text-slate-600">No stations detected.</li>';
        }
    } else {
        sysDetails.classList.add('hidden');
        emptyDetails.classList.remove('hidden');
        emptyDetails.innerText = 'Deep space scans indicate no major stellar masses in this sector.';
        typeLabel.innerText = 'Empty Void';
        typeLabel.className = 'text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-600';

        if (starClassLabel) {
            starClassLabel.innerText = 'Class Unknown';
            starClassLabel.classList.remove('cursor-help', 'text-sky-300', 'star-class-hint');
        }
        if (starAgeLabel) starAgeLabel.innerText = 'Age: --';
        if (starVisual) {
            starVisual.style.backgroundImage = 'none';
            starVisual.style.backgroundColor = '#1e293b';
            starVisual.style.boxShadow = 'none';
        }
        if (planetList) planetList.innerHTML = '';
        if (beltList) beltList.innerHTML = '';
        if (stationList) stationList.innerHTML = '';
        resetBodyDetailsPanel();
    }
}

export function clearInfoPanel() {
    document.getElementById('infoPanel').classList.add('opacity-50', 'pointer-events-none');
    document.getElementById('infoHexId').innerText = '--';
    document.getElementById('infoType').innerText = 'Scanning...';
    document.getElementById('systemDetails').classList.add('hidden');
    document.getElementById('emptyDetails').classList.remove('hidden');
    document.getElementById('emptyDetails').innerText = 'Select a hex to view data.';
    state.selectedSystemData = null;

    const starClassLabel = document.getElementById('infoStarClass');
    if (starClassLabel) {
        starClassLabel.innerText = 'Class --';
        starClassLabel.classList.remove('cursor-help', 'text-sky-300', 'star-class-hint');
    }

    const starAgeLabel = document.getElementById('infoStarAge');
    if (starAgeLabel) starAgeLabel.innerText = 'Age: --';

    resetBodyDetailsPanel();
}
