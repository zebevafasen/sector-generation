import { state, STAR_CLASS_INFO } from './config.js';
import { xmur3, mulberry32 } from './utils.js';

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function setSeed(seedValue) {
    const normalized = String(seedValue);
    state.currentSeed = normalized;
    setRandomStream(normalized);
}

export function setRandomStream(seedValue) {
    const normalized = String(seedValue);
    const seedGenerator = xmur3(normalized);
    state.seededRandomFn = mulberry32(seedGenerator());
}

export function rand() {
    return state.seededRandomFn();
}

export function randomizeSeed() {
    const input = document.getElementById('seedInput');
    if (input) input.value = generateSeedString();
}

export function generateSeedString() {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
        const buffer = new Uint32Array(2);
        window.crypto.getRandomValues(buffer);
        return Array.from(buffer, n => n.toString(36)).join('').slice(0, 16);
    }
    return Math.random().toString(36).slice(2, 10);
}

export function isAutoSeedEnabled() {
    const toggle = document.getElementById('autoSeedToggle');
    return !!(toggle && toggle.checked);
}

export function isRealisticPlanetWeightingEnabled() {
    const toggle = document.getElementById('realisticPlanetWeightsToggle');
    return !!(toggle && toggle.checked);
}

export function showStatusMessage(message, tone = 'info', options = {}) {
    const statusEl = document.getElementById('statusMessage');
    if (!statusEl) {
        console.log(message);
        return;
    }
    const persist = !!options.persist;
    const durationMs = Number.isFinite(options.durationMs) ? Math.max(0, options.durationMs) : 5000;
    const toneMap = {
        info: 'text-slate-400',
        success: 'text-emerald-300',
        warn: 'text-amber-300',
        error: 'text-rose-300'
    };
    const toneClass = toneMap[tone] || toneMap.info;
    if (state.statusMessageTimer) clearTimeout(state.statusMessageTimer);
    state.statusMessageTimer = null;
    statusEl.className = `text-[10px] mt-0.5 ${toneClass}`;
    statusEl.textContent = message;
    if (persist) return;
    if (!message || durationMs === 0) {
        statusEl.textContent = '';
        return;
    }
    state.statusMessageTimer = setTimeout(() => {
        statusEl.textContent = '';
    }, durationMs);
}

export function getStarClassInfo(classCode) {
    return STAR_CLASS_INFO[classCode] || {
        name: `${classCode} Stellar Object`,
        temp: 'Temperature varies',
        mass: 'Mass varies',
        typicalAge: 'Age varies',
        notes: 'No additional data available for this stellar classification.'
    };
}

export function formatStarAgeValue(value, unit) {
    let valueInMillions = unit === 'Gyr' ? value * 1000 : value;
    if (!Number.isFinite(valueInMillions) || valueInMillions < 0) {
        return 'Unknown';
    }
    if (valueInMillions >= 1000) {
        const billions = valueInMillions / 1000;
        const decimals = billions >= 100 ? 0 : billions >= 10 ? 1 : 2;
        return `${billions.toFixed(decimals)} B Years`;
    }
    const decimals = valueInMillions >= 100 ? 0 : valueInMillions >= 10 ? 1 : 2;
    return `${valueInMillions.toFixed(decimals)} M Years`;
}

export function formatStarAgeRange(ageRange) {
    if (!ageRange || !Number.isFinite(ageRange.min) || !Number.isFinite(ageRange.max) || !ageRange.unit) {
        return null;
    }
    const minLabel = formatStarAgeValue(ageRange.min, ageRange.unit);
    const maxLabel = formatStarAgeValue(ageRange.max, ageRange.unit);
    return minLabel === maxLabel ? minLabel : `${minLabel} - ${maxLabel}`;
}

export function generateStarAge(classCode) {
    const info = STAR_CLASS_INFO[classCode];
    if (!info || !info.ageRange) return null;
    const { min, max, unit } = info.ageRange;
    const value = min === max ? min : min + rand() * (max - min);
    return { value, unit, display: formatStarAgeValue(value, unit) };
}

export function positionStarTooltip(event, panel) {
    const padding = 16;
    const panelRect = panel.getBoundingClientRect();
    let x = event.clientX + padding;
    let y = event.clientY + padding;
    if (x + panelRect.width > window.innerWidth - 8) x = window.innerWidth - panelRect.width - 8;
    if (y + panelRect.height > window.innerHeight - 8) y = window.innerHeight - panelRect.height - 8;
    panel.style.left = `${Math.max(8, x)}px`;
    panel.style.top = `${Math.max(8, y)}px`;
}

export function showStarClassInfo(event, pin = false) {
    if (!state.selectedSystemData) return;
    const panel = document.getElementById('starClassTooltip');
    if (!panel) return;
    const cls = state.selectedSystemData.starClass;
    if (!cls) return;
    const info = getStarClassInfo(cls);
    const typicalAgeLabel = formatStarAgeRange(info.ageRange) || info.typicalAge || 'Age varies';
    panel.innerHTML = `
        <div class="font-semibold text-sky-300 mb-1">${escapeHtml(info.name)}</div>
        <div class="text-slate-400 mb-0.5">Temp: <span class="text-slate-200">${escapeHtml(info.temp)}</span></div>
        <div class="text-slate-400 mb-0.5">Mass: <span class="text-slate-200">${escapeHtml(info.mass)}</span></div>
        <div class="text-slate-400 mb-1">Typical Age: <span class="text-slate-200">${escapeHtml(typicalAgeLabel)}</span></div>
        <div class="text-slate-300 leading-snug">${escapeHtml(info.notes)}</div>
    `;
    panel.classList.remove('hidden');
    panel.style.opacity = '1';
    positionStarTooltip(event, panel);
    state.starTooltipPinned = pin;
}

export function hideStarClassInfo(force = false) {
    if (state.starTooltipPinned && !force) return;
    const panel = document.getElementById('starClassTooltip');
    if (panel) {
        panel.classList.add('hidden');
        panel.style.opacity = '0';
    }
}

function normalizeLookupKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-');
}

function getPlanetTypeTooltip(type) {
    const key = normalizeLookupKey(type);
    const entries = {
        terrestrial: 'Rocky world with a solid surface. Most likely class to support Earth-like conditions.',
        oceanic: 'Water-dominated world with deep global oceans, often humid and cloud-heavy.',
        volcanic: 'Geologically active world with widespread volcanism, high heat, and unstable surface conditions.',
        desert: 'Dry rocky world with scarce surface water and large day-night temperature swings.',
        barren: 'Air-poor or inactive rocky world with limited surface activity and little to no biosphere.',
        arctic: 'Ice-dominated world with persistent low temperatures and widespread frozen terrain.',
        'gas-giant': 'Massive gaseous planet with no solid surface and extreme pressure at depth.',
        'asteroid-belt': 'Band of small rocky bodies and debris orbiting the star.',
        'debris-field': 'Diffuse field of fragmented material from collisions, breakups, or ancient impacts.',
        artificial: 'Constructed object such as a station or habitat.'
    };
    return entries[key] || 'Category of celestial body detected in this system.';
}

function getPlanetSizeTooltip(size) {
    const key = normalizeLookupKey(size);
    const entries = {
        tiny: 'Very small world, usually with weak gravity and limited atmosphere retention.',
        small: 'Below-average planetary mass and gravity.',
        medium: 'Mid-sized world near baseline terrestrial scale.',
        large: 'High-mass world with stronger gravity and deeper potential atmosphere.',
        huge: 'Very massive world, often with extreme gravity and thick envelopes.'
    };
    return entries[key] || 'Relative planetary size class.';
}

function getAtmosphereTooltip(atmosphere) {
    const key = normalizeLookupKey(atmosphere);
    const entries = {
        breathable: 'Atmosphere supports unassisted human breathing under normal pressure conditions.',
        humid: 'Moisture-rich atmosphere with high water vapor content.',
        dense: 'High-pressure atmosphere that can intensify weather and drag.',
        thin: 'Low-pressure atmosphere with reduced shielding and breathable volume.',
        toxic: 'Contains gases harmful to humans without sealed life support.',
        corrosive: 'Chemically aggressive atmosphere that damages exposed materials.',
        dry: 'Very low humidity atmosphere with limited water cycling.',
        trace: 'Extremely sparse atmosphere with little practical weather or protection.',
        none: 'No meaningful atmosphere present.',
        crushing: 'Extreme atmospheric pressure that rapidly destroys unprotected craft and life.'
    };
    return entries[key] || 'Dominant atmospheric condition observed for this body.';
}

function getTemperatureTooltip(temperature) {
    const key = normalizeLookupKey(temperature);
    const entries = {
        frozen: 'Persistently icy conditions with widespread solid volatiles.',
        freezing: 'Extremely cold climate with long-term subzero surface conditions.',
        cold: 'Low-temperature climate; survival often needs thermal support.',
        temperate: 'Moderate climate range with the best chance for stable surface activity.',
        warm: 'Elevated baseline heat but not consistently extreme.',
        hot: 'High sustained temperatures that stress life support and equipment.',
        scorching: 'Very severe heat with frequent surface thermal hazards.',
        burning: 'Extreme, near-sterilizing heat dominated by intense thermal exposure.'
    };
    return entries[key] || 'Estimated broad thermal regime for this body.';
}

function getPlanetTagTooltip(tag) {
    const key = normalizeLookupKey(tag);
    const entries = {
        'colony-world': 'Young settlement still building core infrastructure, institutions, and long-range resilience.',
        'core-trade-hub': 'High-throughput commercial nexus with strong logistics, finance, and interstellar market reach.',
        'industrial-powerhouse': 'Production-focused world with heavy manufacturing, refining, and strategic material output.',
        'agri-world': 'Food-export economy centered on large-scale agriculture, aquaculture, or bioresource processing.',
        'research-enclave': 'Knowledge economy world with major laboratories, academic centers, and advanced R&D programs.',
        'military-bastion': 'Fortified strategic anchor with major defense installations, fleet support, and hardened infrastructure.',
        'frontier-outpost': 'Remote edge settlement with limited support, high risk, and strong expansion potential.',
        'cultural-center': 'Destination world known for culture, heritage, pilgrimage, recreation, or hospitality industries.',
        'tourism-/-cultural-center': 'Destination world known for culture, heritage, pilgrimage, recreation, or hospitality industries.',
        ecumenopolis: 'Planet-wide urban megastructure with immense infrastructure density and extreme population concentration.',
        'seismic-instability': 'Frequent tectonic upheaval, quakes, and crustal volatility that threaten long-term surface stability.',
        'active-battlefield': 'Current conflict zone contested by external powers with active deployments and ongoing operations.',
        'quarantined-world': 'Travel and contact restricted under biosecurity, contamination, or strategic containment protocols.',
        'civil-war': 'Active internal conflict between major local factions competing for governance, territory, or law.',
        'prison-planet': 'World organized around large-scale detention infrastructure, penal colonies, and security enforcement.',
        'abandoned-colony': 'Former settled world now largely depopulated after collapse, evacuation, or systemic failure.'
    };
    return entries[key] || 'Strategic or socio-economic specialization observed for this inhabited world.';
}

export function showFieldInfoTooltip(event, field, value) {
    const panel = document.getElementById('fieldInfoTooltip');
    if (!panel) return;

    const fieldKey = normalizeLookupKey(field);
    let label = 'Field';
    let description = 'No additional data available.';
    if (fieldKey === 'planet-type') {
        label = 'Planet Type';
        description = getPlanetTypeTooltip(value);
    } else if (fieldKey === 'size') {
        label = 'Size';
        description = getPlanetSizeTooltip(value);
    } else if (fieldKey === 'atmosphere') {
        label = 'Atmosphere';
        description = getAtmosphereTooltip(value);
    } else if (fieldKey === 'temperature') {
        label = 'Temperature';
        description = getTemperatureTooltip(value);
    } else if (fieldKey === 'tag') {
        label = 'Planet Tag';
        description = getPlanetTagTooltip(value);
    }

    panel.innerHTML = `
        <div class="font-semibold text-sky-300 mb-1">${escapeHtml(label)}</div>
        <div class="text-slate-400 mb-1"><span class="text-slate-200">${escapeHtml(value || 'Unknown')}</span></div>
        <div class="text-slate-300 leading-snug">${escapeHtml(description)}</div>
    `;
    panel.classList.remove('hidden');
    panel.style.opacity = '1';
    positionStarTooltip(event, panel);
}

export function hideFieldInfoTooltip() {
    const panel = document.getElementById('fieldInfoTooltip');
    if (!panel) return;
    panel.classList.add('hidden');
    panel.style.opacity = '0';
}
