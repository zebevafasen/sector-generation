import { HEX_HEIGHT, HEX_SIZE, HEX_WIDTH, STAR_VISUALS, state } from './config.js';
import { formatStarAgeValue, getStarClassInfo, hideStarClassInfo, rand } from './core.js';

const STAR_GRADIENT_CACHE = {};

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
            system.planets.filter(p => p.type !== 'Artificial' && p.type !== 'Asteroid Belt').length;
        document.getElementById('infoPop').innerText = system.totalPop;

        if (planetList && beltList && stationList) {
            planetList.innerHTML = '';
            beltList.innerHTML = '';
            stationList.innerHTML = '';

            const renderBody = (body) => {
                const li = document.createElement('li');
                li.className = 'bg-slate-800/50 p-2 rounded border border-slate-700/50 flex flex-col';

                const normalizedType = body.type === 'Lava' ? 'Volcanic' : body.type;
                let markerClass = 'bg-slate-300';
                if (normalizedType.includes('Giant')) markerClass = 'bg-amber-200';
                if (normalizedType === 'Terrestrial') markerClass = 'bg-emerald-300';
                if (normalizedType === 'Desert') markerClass = 'bg-yellow-400';
                if (normalizedType === 'Oceanic') markerClass = 'bg-cyan-400';
                if (normalizedType === 'Volcanic') markerClass = 'bg-orange-500';
                if (normalizedType === 'Barren') markerClass = 'bg-slate-400';
                if (/belt|field/i.test(normalizedType)) markerClass = 'bg-violet-300';
                if (normalizedType === 'Artificial') markerClass = 'bg-fuchsia-300';

                let html = `<div class="flex justify-between font-semibold text-sky-100"><span class="inline-flex items-center gap-2"><span class="inline-block w-2.5 h-2.5 rounded-full ${markerClass} ring-1 ring-white/25 shrink-0"></span>${body.name}</span> <span class="text-xs text-slate-500 font-normal">${normalizedType}</span></div>`;
                if (body.features.length > 0) {
                    html += `<div class="text-xs text-slate-400 mt-1 pl-5">Detected: ${body.features.join(', ')}</div>`;
                }
                li.innerHTML = html;
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
}
