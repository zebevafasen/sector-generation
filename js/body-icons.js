import { isBeltOrFieldBodyType, normalizeBodyType } from './body-classification.js';

export function getBodyIconMarkup(type) {
    const normalizedType = normalizeBodyType(type);
    const base = 'inline-block w-4 h-4 md:w-[18px] md:h-[18px] shrink-0';

    if (isBeltOrFieldBodyType(normalizedType)) {
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

    return '<span class="inline-block w-3 h-3 rounded-full bg-slate-300 ring-1 ring-white/25 shrink-0"></span>';
}
