import { STAR_AGE_DISPLAY, state, STAR_CLASS_INFO } from './config.js';
import { getPrimaryStar, getSystemStars } from './star-system.js';
import { resolveFieldTooltip } from './tooltip-data.js';
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
        return STAR_AGE_DISPLAY.unknownLabel || 'Unknown';
    }
    if (valueInMillions >= 1000) {
        const billions = valueInMillions / 1000;
        const decimals = billions >= 100 ? 0 : billions >= 10 ? 1 : 2;
        const label = STAR_AGE_DISPLAY.billionLabel || 'B Years';
        return `${billions.toFixed(decimals)} ${label}`;
    }
    const decimals = valueInMillions >= 100 ? 0 : valueInMillions >= 10 ? 1 : 2;
    const label = STAR_AGE_DISPLAY.millionLabel || 'M Years';
    return `${valueInMillions.toFixed(decimals)} ${label}`;
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
    const stars = getSystemStars(state.selectedSystemData);
    const targetEl = event && event.target && event.target.closest ? event.target.closest('[data-star-index]') : null;
    const requestedIndex = targetEl ? parseInt(targetEl.getAttribute('data-star-index') || '0', 10) : 0;
    const starIndex = Number.isInteger(requestedIndex) && requestedIndex >= 0 ? requestedIndex : 0;
    const selectedStar = stars[starIndex] || getPrimaryStar(state.selectedSystemData);
    const cls = selectedStar.class;
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

export function showFieldInfoTooltip(event, field, value) {
    const panel = document.getElementById('fieldInfoTooltip');
    if (!panel) return;

    const tooltip = resolveFieldTooltip(field, value);
    panel.innerHTML = `
        <div class="font-semibold text-sky-300 mb-1">${escapeHtml(tooltip.label)}</div>
        <div class="text-slate-400 mb-1"><span class="text-slate-200">${escapeHtml(value || 'Unknown')}</span></div>
        <div class="text-slate-300 leading-snug">${escapeHtml(tooltip.description)}</div>
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
