import { state } from './config.js';
import { getFactionById, getFactionControlForHex } from './factions.js';

function ensureCardHidden(refs) {
    if (!refs || !refs.factionCard) return;
    refs.factionCard.classList.add('hidden');
}

export function applyFactionSystemCard(refs, hexId) {
    if (!refs || !refs.factionCard || !hexId || !state.sectors[hexId]) {
        ensureCardHidden(refs);
        return;
    }
    const control = getFactionControlForHex(state.factionState, hexId);
    if (!control || !control.ownerFactionId) {
        refs.factionCard.classList.remove('hidden');
        if (refs.factionOwnerLabel) refs.factionOwnerLabel.innerText = 'Unclaimed';
        if (refs.factionControlStrengthLabel) refs.factionControlStrengthLabel.innerText = 'Control --';
        if (refs.factionContestedLabel) refs.factionContestedLabel.innerText = 'Contested: No';
        return;
    }

    const owner = getFactionById(state.factionState, control.ownerFactionId);
    refs.factionCard.classList.remove('hidden');
    if (refs.factionOwnerLabel) {
        refs.factionOwnerLabel.innerText = owner ? owner.name : control.ownerFactionId;
        refs.factionOwnerLabel.style.color = owner && owner.color ? owner.color : '#e2e8f0';
    }
    if (refs.factionControlStrengthLabel) {
        refs.factionControlStrengthLabel.innerText = `Control ${Math.round(Number(control.controlStrength) || 0)}%`;
    }
    if (refs.factionContestedLabel) {
        const contested = Array.isArray(control.contestedFactionIds) ? control.contestedFactionIds : [];
        if (!contested.length) {
            refs.factionContestedLabel.innerText = 'Contested: No';
        } else {
            const contestedNames = contested
                .map((factionId) => getFactionById(state.factionState, factionId))
                .filter(Boolean)
                .map((faction) => faction.name);
            refs.factionContestedLabel.innerText = contestedNames.length
                ? `Contested: Yes (${contestedNames.join(', ')})`
                : 'Contested: Yes';
        }
    }
}

export function clearFactionSystemCard(refs) {
    ensureCardHidden(refs);
}
