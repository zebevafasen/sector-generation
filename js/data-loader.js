import { hydrateConfigData } from './config.js';
import { hydrateGenerationData } from './generation-data.js';
import { hydratePlanetEnvironmentData } from './planet-environment.js';
import { hydratePlanetPopulationData } from './planet-population.js';
import { hydrateTooltipData } from './tooltip-data.js';

function buildDataUrl(fileName) {
    return new URL(`../data/${fileName}`, import.meta.url);
}

async function loadJson(fileName) {
    const response = await fetch(buildDataUrl(fileName));
    if (!response.ok) {
        throw new Error(`Failed to load data file: ${fileName} (${response.status})`);
    }
    return response.json();
}

function validateConfigData(data) {
    if (!data || typeof data !== 'object') throw new Error('config-data.json must be an object');
    if (!Array.isArray(data.planetTypes) || data.planetTypes.length < 1) {
        throw new Error('config-data.json planetTypes must be a non-empty array');
    }
    if (!data.gridPresets || typeof data.gridPresets !== 'object') {
        throw new Error('config-data.json gridPresets must be an object');
    }
}

function validateGenerationData(data) {
    if (!data || typeof data !== 'object') throw new Error('generation-data.json must be an object');
    if (!data.generationProfiles || typeof data.generationProfiles !== 'object') {
        throw new Error('generation-data.json generationProfiles must be an object');
    }
}

function validateTooltipData(data) {
    if (!data || typeof data !== 'object') throw new Error('tooltip-data.json must be an object');
    if (!data.planetTypeTooltips || typeof data.planetTypeTooltips !== 'object') {
        throw new Error('tooltip-data.json planetTypeTooltips must be an object');
    }
}

function validatePlanetEnvironmentData(data) {
    if (!data || typeof data !== 'object') throw new Error('planet-environment-data.json must be an object');
    if (!data.profileByType || typeof data.profileByType !== 'object') {
        throw new Error('planet-environment-data.json profileByType must be an object');
    }
}

function validatePlanetPopulationData(data) {
    if (!data || typeof data !== 'object') throw new Error('planet-population-data.json must be an object');
    if (!data.typeFactors || typeof data.typeFactors !== 'object') {
        throw new Error('planet-population-data.json typeFactors must be an object');
    }
}

export async function loadAppData() {
    const [configData, generationData, tooltipData, planetEnvironmentData, planetPopulationData] = await Promise.all([
        loadJson('config-data.json'),
        loadJson('generation-data.json'),
        loadJson('tooltip-data.json'),
        loadJson('planet-environment-data.json'),
        loadJson('planet-population-data.json')
    ]);

    validateConfigData(configData);
    validateGenerationData(generationData);
    validateTooltipData(tooltipData);
    validatePlanetEnvironmentData(planetEnvironmentData);
    validatePlanetPopulationData(planetPopulationData);

    hydrateConfigData(configData);
    hydrateGenerationData(generationData);
    hydrateTooltipData(tooltipData);
    hydratePlanetEnvironmentData(planetEnvironmentData);
    hydratePlanetPopulationData(planetPopulationData);
}
