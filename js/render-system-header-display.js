import { STAR_CLASS_INFO, STAR_VISUALS, state } from './config.js';
import { formatStarAgeValue, getStarClassInfo } from './core.js';

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderStarClassSelectOptions(selectedClass) {
    const options = [];
    Object.keys(STAR_CLASS_INFO || {}).forEach((starClass) => {
        const isSelected = starClass === selectedClass ? ' selected' : '';
        options.push(`<option value="${escapeHtml(starClass)}"${isSelected}>${escapeHtml(starClass)}</option>`);
    });
    return options.join('');
}

export function applySystemHeaderDisplay({ refs, system, stars, primaryStar, canEditStar }) {
    refs.typeLabel.innerText = 'Star System';
    refs.typeLabel.className = 'text-xs px-2 py-0.5 rounded-full bg-sky-900 text-sky-200 border border-sky-600';
    refs.systemName.innerText = system.name;

    if (refs.starClassLabel) {
        refs.starClassLabel.innerText = `Class ${primaryStar.class} Star`;
        refs.starClassLabel.classList.add('cursor-help', 'text-slate-400', 'star-class-hint');
        refs.starClassLabel.setAttribute('data-star-index', '0');
    }
    if (refs.starAgeLabel) {
        if (primaryStar.starAge && Number.isFinite(primaryStar.starAge.value) && primaryStar.starAge.unit) {
            refs.starAgeLabel.innerText = `Age: ${formatStarAgeValue(primaryStar.starAge.value, primaryStar.starAge.unit)}`;
        } else if (primaryStar.starAge && primaryStar.starAge.display) {
            refs.starAgeLabel.innerText = `Age: ${primaryStar.starAge.display}`;
        } else {
            const info = getStarClassInfo(primaryStar.class);
            refs.starAgeLabel.innerText = `Age: ${info.typicalAge || 'Unknown'}`;
        }
        if (stars.length > 1) {
            refs.starAgeLabel.innerText += ` • ${stars.length} stars`;
        }
    }

    if (refs.starVisual) {
        const palette = primaryStar.palette || STAR_VISUALS[primaryStar.class] || STAR_VISUALS.default;
        refs.starVisual.style.backgroundImage = `radial-gradient(circle at 40% 35%, ${primaryStar.color} 0%, ${palette.mid} 55%, ${primaryStar.glow || palette.halo} 100%)`;
        refs.starVisual.style.backgroundColor = palette.core;
        refs.starVisual.style.boxShadow = `0 0 12px ${primaryStar.glow || palette.halo}`;
    }

    if (!refs.starList) return;
    const companionStars = stars.slice(1);
    refs.starList.innerHTML = companionStars.map((star, index) => {
        const starIndex = index + 1;
        const palette = star.palette || STAR_VISUALS[star.class] || STAR_VISUALS.default;
        const ageLabel = star.starAge && star.starAge.display
            ? star.starAge.display
            : (star.starAge && Number.isFinite(star.starAge.value) && star.starAge.unit
                ? formatStarAgeValue(star.starAge.value, star.starAge.unit)
                : (getStarClassInfo(star.class).typicalAge || 'Unknown'));
        const displayName = star.name || `${system.name} ${String.fromCharCode(65 + starIndex)}`;
        return `
            <div class="bg-slate-800/50 p-3 rounded border border-slate-700">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full shadow-lg border border-slate-600/70" style="background-image: radial-gradient(circle at 40% 35%, ${star.color} 0%, ${palette.mid} 55%, ${star.glow || palette.halo} 100%); box-shadow: 0 0 12px ${star.glow || palette.halo};"></div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-2">
                            <h3 class="font-bold text-sky-300 truncate">${displayName}</h3>
                            <div class="inline-flex items-center gap-1">
                                <button type="button" class="${canEditStar ? '' : 'hidden '}companion-star-delete-btn w-6 h-6 inline-flex items-center justify-center text-xs rounded bg-rose-900/35 border border-rose-700 text-rose-200 hover:bg-rose-800/40 hover:border-rose-500 transition-colors" data-star-index="${starIndex}" title="Delete star" aria-label="Delete star">🗑</button>
                                <button type="button" class="companion-star-rename-btn w-6 h-6 inline-flex items-center justify-center text-xs rounded bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:border-sky-500 transition-colors" data-star-index="${starIndex}" title="Rename star" aria-label="Rename star">✎</button>
                            </div>
                        </div>
                        <div class="flex flex-wrap gap-3 text-xs mt-0.5">
                            <p class="text-slate-400 cursor-help star-class-hint" data-star-index="${starIndex}">Class ${star.class} Star</p>
                            <p class="text-slate-500">Age: ${ageLabel}</p>
                        </div>
                        <div class="${state.editMode ? 'mt-2' : 'hidden mt-2'}">
                            <label class="block text-[10px] text-slate-500 mb-1">Star Type</label>
                            <select class="companion-star-class-select w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-sky-500 focus:outline-none" data-star-index="${starIndex}">
                                ${renderStarClassSelectOptions(star.class)}
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    refs.starList.classList.toggle('hidden', companionStars.length === 0);
}
