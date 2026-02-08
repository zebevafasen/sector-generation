import { state } from './config.js';
import { setSeed, showStatusMessage } from './core.js';
import { setDensityMode, setSizeMode, syncDensityPresetForProfile } from './controls.js';
import { EVENTS, emitEvent } from './events.js';
import { normalizeDensityPresetKey } from './generation-data.js';
import { HOME_SECTOR_KEY } from './sector-address.js';
import { clearInfoPanel, drawGrid, findHexGroup, selectHex } from './render.js';
import { validateSectorPayload } from './sector-payload-validation.js';
import { ensureSystemStarFields } from './star-system.js';

function getStorageUiRefs() {
    return {
        gridWidthInput: document.getElementById('gridWidth'),
        gridHeightInput: document.getElementById('gridHeight'),
        sizePresetSelect: document.getElementById('sizePreset'),
        densityPresetSelect: document.getElementById('densityPreset'),
        manualMinInput: document.getElementById('manualMin'),
        manualMaxInput: document.getElementById('manualMax'),
        generationProfileSelect: document.getElementById('generationProfile'),
        starDistributionSelect: document.getElementById('starDistribution'),
        autoSeedToggle: document.getElementById('autoSeedToggle'),
        realisticWeightsToggle: document.getElementById('realisticPlanetWeightsToggle'),
        seedInput: document.getElementById('seedInput'),
        statusTotalHexes: document.getElementById('statusTotalHexes'),
        statusTotalSystems: document.getElementById('statusTotalSystems')
    };
}

function updateStatusLabels(refs, totalHexes, totalSystems) {
    if (refs.statusTotalHexes) refs.statusTotalHexes.innerText = `${totalHexes} Hexes`;
    if (refs.statusTotalSystems) refs.statusTotalSystems.innerText = `${totalSystems} Systems`;
}

export function createStorageApplyService(deps) {
    const { buildSectorPayload, autoSaveSectorState } = deps;

    function applySectorPayload(payload) {
        const validation = validateSectorPayload(payload);
        if (!validation.ok) {
            showStatusMessage(`Sector file invalid: ${validation.error}`, 'error');
            return;
        }
        const nextPayload = validation.payload;

        const refs = getStorageUiRefs();
        if (nextPayload.sizePreset && nextPayload.sizePreset !== 'custom' && refs.sizePresetSelect) {
            refs.sizePresetSelect.value = nextPayload.sizePreset;
        }
        if (nextPayload.sizeMode) {
            setSizeMode(nextPayload.sizeMode);
        }

        const width = parseInt(nextPayload.dimensions.width, 10) || 1;
        const height = parseInt(nextPayload.dimensions.height, 10) || 1;
        refs.gridWidthInput.value = width;
        refs.gridHeightInput.value = height;

        if (nextPayload.generationProfile && refs.generationProfileSelect) {
            refs.generationProfileSelect.value = nextPayload.generationProfile;
        }
        if (refs.starDistributionSelect) {
            refs.starDistributionSelect.value = nextPayload.starDistribution === 'clusters' ? 'clusters' : 'standard';
        }
        syncDensityPresetForProfile(refs.generationProfileSelect ? refs.generationProfileSelect.value : 'high_adventure');
        if (nextPayload.densityMode) {
            setDensityMode(nextPayload.densityMode);
        }
        if (refs.densityPresetSelect) {
            refs.densityPresetSelect.value = normalizeDensityPresetKey(nextPayload.densityPreset);
        }
        if (nextPayload.manualRange) {
            if (typeof nextPayload.manualRange.min === 'number') {
                refs.manualMinInput.value = nextPayload.manualRange.min;
            }
            if (typeof nextPayload.manualRange.max === 'number') {
                refs.manualMaxInput.value = nextPayload.manualRange.max;
            }
        }
        if (typeof nextPayload.autoSeed === 'boolean') {
            if (refs.autoSeedToggle) refs.autoSeedToggle.checked = nextPayload.autoSeed;
        }
        if (typeof nextPayload.realisticPlanetWeights === 'boolean') {
            if (refs.realisticWeightsToggle) refs.realisticWeightsToggle.checked = nextPayload.realisticPlanetWeights;
        }
        if (refs.seedInput) refs.seedInput.value = nextPayload.seed || '';

        if (nextPayload.seed) {
            setSeed(nextPayload.seed);
        } else {
            state.currentSeed = '';
            state.seededRandomFn = () => Math.random();
        }
        state.layoutSeed = String(nextPayload.layoutSeed || nextPayload.seed || state.currentSeed || '');
        state.rerollIteration = Number.isFinite(Number(nextPayload.rerollIteration)) ? Number(nextPayload.rerollIteration) : 0;

        state.sectors = nextPayload.sectors || {};
        state.deepSpacePois = nextPayload.deepSpacePois || {};
        Object.values(state.sectors).forEach((system) => ensureSystemStarFields(system));
        state.pinnedHexIds = Array.isArray(nextPayload.pinnedHexIds)
            ? nextPayload.pinnedHexIds.filter((hexId) => !!state.sectors[hexId] || !!state.deepSpacePois[hexId])
            : [];
        state.sectorConfigSnapshot = nextPayload.sectorConfigSnapshot || {
            sizeMode: nextPayload.sizeMode || state.sizeMode,
            sizePreset: nextPayload.sizePreset || 'standard',
            width,
            height,
            densityMode: nextPayload.densityMode || state.densityMode,
            densityPreset: normalizeDensityPresetKey(nextPayload.densityPreset),
            manualMin: nextPayload.manualRange && typeof nextPayload.manualRange.min === 'number' ? nextPayload.manualRange.min : 0,
            manualMax: nextPayload.manualRange && typeof nextPayload.manualRange.max === 'number' ? nextPayload.manualRange.max : 0,
            generationProfile: nextPayload.generationProfile || 'high_adventure',
            starDistribution: nextPayload.starDistribution === 'clusters' ? 'clusters' : 'standard',
            realisticPlanetWeights: !!nextPayload.realisticPlanetWeights
        };
        if (nextPayload.multiSector && typeof nextPayload.multiSector === 'object') {
            state.multiSector = nextPayload.multiSector;
            if (!state.multiSector.jumpGateRegistry || typeof state.multiSector.jumpGateRegistry !== 'object') {
                state.multiSector.jumpGateRegistry = {};
            }
            if (typeof state.multiSector.selectedSectorKey === 'undefined') {
                state.multiSector.selectedSectorKey = state.multiSector.currentKey || HOME_SECTOR_KEY;
            }
            if (typeof state.multiSector.expandedView !== 'boolean') {
                state.multiSector.expandedView = false;
            }
        } else {
            state.multiSector = {
                currentKey: HOME_SECTOR_KEY,
                selectedSectorKey: HOME_SECTOR_KEY,
                sectorsByKey: {},
                jumpGateRegistry: {},
                expandedView: false
            };
        }
        state.selectedHexId = null;
        clearInfoPanel();
        drawGrid(width, height);
        if (nextPayload.selectedHexId && (state.sectors[nextPayload.selectedHexId] || state.deepSpacePois[nextPayload.selectedHexId])) {
            const group = findHexGroup(nextPayload.selectedHexId);
            if (group) selectHex(nextPayload.selectedHexId, group);
        }

        const totalHexes = nextPayload.stats && Number.isFinite(nextPayload.stats.totalHexes) ? nextPayload.stats.totalHexes : width * height;
        const systemCount = nextPayload.stats && Number.isFinite(nextPayload.stats.totalSystems) ? nextPayload.stats.totalSystems : Object.keys(state.sectors).length;
        updateStatusLabels(refs, totalHexes, systemCount);
        state.lastSectorSnapshot = buildSectorPayload({ width, height, totalHexes, systemCount });
        if (nextPayload.generatedAt) {
            state.lastSectorSnapshot.generatedAt = nextPayload.generatedAt;
        }
        autoSaveSectorState();
        emitEvent(EVENTS.SECTOR_DATA_CHANGED, { label: 'Load Sector' });
    }

    function triggerImport() {
        const input = document.getElementById('importFileInput');
        if (!input) return;
        input.value = '';
        input.click();
    }

    function handleImportFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const payload = JSON.parse(e.target.result);
                const validation = validateSectorPayload(payload);
                if (!validation.ok) {
                    showStatusMessage(`Invalid sector file: ${validation.error}`, 'error');
                    return;
                }
                applySectorPayload(validation.payload);
                if (validation.warning) {
                    showStatusMessage(`Imported sector with warnings: ${validation.warning}`, 'warn');
                    return;
                }
                showStatusMessage('Imported sector data.', 'success');
            } catch (err) {
                console.error(err);
                showStatusMessage('Invalid sector file.', 'error');
            }
        };
        reader.readAsText(file);
    }

    return {
        applySectorPayload,
        triggerImport,
        handleImportFile
    };
}
