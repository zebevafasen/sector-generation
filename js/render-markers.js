const STAR_GRADIENT_CACHE = {};

export function getDeepSpacePoiPalette(kind, poi = null) {
    const isJumpGate = !!(poi && poi.poiCategory === 'jump_gate');
    if (isJumpGate) {
        if (poi.jumpGateState === 'inactive') {
            return { fill: '#f59e0b', stroke: '#fde68a', glow: 'rgba(245,158,11,0.8)' };
        }
        return { fill: '#22d3ee', stroke: '#a5f3fc', glow: 'rgba(34,211,238,0.85)' };
    }
    switch (String(kind || '').toLowerCase()) {
    case 'hazard':
        return { fill: '#fb7185', stroke: '#fecdd3', glow: 'rgba(251,113,133,0.75)' };
    case 'navigation':
        return { fill: '#22d3ee', stroke: '#a5f3fc', glow: 'rgba(34,211,238,0.75)' };
    case 'opportunity':
        return { fill: '#34d399', stroke: '#a7f3d0', glow: 'rgba(52,211,153,0.75)' };
    case 'mystery':
        return { fill: '#a78bfa', stroke: '#ddd6fe', glow: 'rgba(167,139,250,0.75)' };
    default:
        return { fill: '#94a3b8', stroke: '#e2e8f0', glow: 'rgba(148,163,184,0.7)' };
    }
}

export function getStarMarkerRadius(starClass) {
    if (starClass === 'M' || starClass === 'Neutron') return 4;
    if (starClass === 'O' || starClass === 'B') return 9;
    if (starClass === 'Black Hole') return 5;
    return 6;
}

export function getStarOffsets(starCount, radius) {
    const spread = radius + 4;
    if (starCount === 2) return [{ dx: -spread * 0.6, dy: 0 }, { dx: spread * 0.6, dy: 0 }];
    if (starCount >= 3) {
        return [
            { dx: 0, dy: -spread * 0.75 },
            { dx: -spread * 0.75, dy: spread * 0.55 },
            { dx: spread * 0.75, dy: spread * 0.55 }
        ];
    }
    return [{ dx: 0, dy: 0 }];
}

export function ensureStarGradient(svg, starClass, starVisuals) {
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

        const palette = starVisuals[starClass] || starVisuals.default;
        const stops = [
            { offset: '0%', color: palette.core },
            { offset: '55%', color: palette.mid },
            { offset: '100%', color: palette.halo }
        ];

        stops.forEach((stopData) => {
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
