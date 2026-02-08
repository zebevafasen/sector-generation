import { HOME_SECTOR_KEY } from './sector-address.js';
export const HEX_SIZE = 40;
export const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
export const HEX_HEIGHT = 2 * HEX_SIZE;

// Colors & glow data for Star Classes (approximate blackbody colors)
const DEFAULT_STAR_VISUALS = {
    O: { core: '#6fa8ff', mid: '#a8c4ff', halo: '#e1ecff' },
    B: { core: '#84b9ff', mid: '#bfd4ff', halo: '#f0f6ff' },
    A: { core: '#cfdfff', mid: '#e8f0ff', halo: '#ffffff' },
    F: { core: '#f6f1d5', mid: '#fff4cf', halo: '#fff9e0' },
    G: { core: '#ffd87f', mid: '#ffe39f', halo: '#fff5d5' },
    K: { core: '#ffbb66', mid: '#ffd0a2', halo: '#ffe9d1' },
    M: { core: '#ff7a45', mid: '#ff9b6f', halo: '#ffd7be' },
    Neutron: { core: '#7ef3ff', mid: '#c6fbff', halo: '#ffffff' },
    'Black Hole': { core: '#05070f', mid: '#401f5b', halo: '#b389ff' },
    default: { core: '#ffffff', mid: '#ffe5b4', halo: '#fff5d5' }
};

const DEFAULT_STAR_CLASS_INFO = {
    O: {
        name: 'O-type (Blue Hypergiant)',
        temp: '30,000 - 50,000 K',
        mass: '> 16 Msun',
        typicalAge: '< 10 Myr',
        ageRange: { min: 1, max: 8, unit: 'Myr' },
        notes: 'Extremely luminous, short-lived stars that flood sectors with ultraviolet radiation and ionizing winds.'
    },
    B: {
        name: 'B-type (Blue-White Giant)',
        temp: '10,000 - 30,000 K',
        mass: '2 - 16 Msun',
        typicalAge: '10 - 100 Myr',
        ageRange: { min: 10, max: 120, unit: 'Myr' },
        notes: 'Bright, young stars that often reside in stellar nurseries and carve large ionized bubbles in nearby gas.'
    },
    A: {
        name: 'A-type (White Star)',
        temp: '7,500 - 10,000 K',
        mass: '1.4 - 2.1 Msun',
        typicalAge: '100 - 500 Myr',
        ageRange: { min: 100, max: 900, unit: 'Myr' },
        notes: 'Prominent hydrogen Balmer lines, strong ultraviolet flux, and typically surrounded by dusty debris disks.'
    },
    F: {
        name: 'F-type (Yellow-White Star)',
        temp: '6,000 - 7,500 K',
        mass: '1.0 - 1.4 Msun',
        typicalAge: '1 - 4 Gyr',
        ageRange: { min: 1, max: 4.5, unit: 'Gyr' },
        notes: 'Stable main-sequence stars with shallow convective zones; good candidates for habitable-zone worlds.'
    },
    G: {
        name: 'G-type (Yellow Star)',
        temp: '5,200 - 6,000 K',
        mass: '0.8 - 1.0 Msun',
        typicalAge: '4 - 10 Gyr',
        ageRange: { min: 4, max: 10, unit: 'Gyr' },
        notes: 'Solar analogs with balanced radiation and magnetic activity; habitable zones sit ~1 AU from the star.'
    },
    K: {
        name: 'K-type (Orange Dwarf)',
        temp: '3,900 - 5,200 K',
        mass: '0.6 - 0.8 Msun',
        typicalAge: '10 - 30 Gyr (main-sequence)',
        ageRange: { min: 8, max: 30, unit: 'Gyr' },
        notes: 'Cooler, long-lived stars with wide, stable habitable zones and lower stellar flare rates than M dwarfs.'
    },
    M: {
        name: 'M-type (Red Dwarf)',
        temp: '2,400 - 3,900 K',
        mass: '0.08 - 0.6 Msun',
        typicalAge: '> 30 Gyr (projected)',
        ageRange: { min: 20, max: 200, unit: 'Gyr' },
        notes: 'Most common stellar class; dim output but lifespans in the trillions of years. Habitable worlds must orbit closely.'
    },
    Neutron: {
        name: 'Neutron Star',
        temp: '600,000 - 1,000,000 K (surface)',
        mass: '1.1 - 2.3 Msun in a 10 km radius',
        typicalAge: 'Remnant (0 - 100 Myr)',
        ageRange: { min: 0.01, max: 100, unit: 'Myr' },
        notes: 'Collapsed stellar cores with ultra-strong magnetic fields; emit intense X-rays or pulsar beams.'
    },
    'Black Hole': {
        name: 'Stellar-mass Black Hole',
        temp: 'Hawking radiation negligible',
        mass: '> 3 Msun',
        typicalAge: 'Remnant (0.1 - 10 Gyr)',
        ageRange: { min: 0.1, max: 10, unit: 'Gyr' },
        notes: 'Event horizon traps light; detectable via accretion disks, relativistic jets, and gravitational lensing signatures.'
    }
};

const DEFAULT_PLANET_TYPES = [
    'Gas Giant', 'Terrestrial', 'Oceanic', 'Volcanic', 'Desert', 'Barren', 'Arctic'
];

const DEFAULT_POI_TYPES = [
    'Research Station', 'Mining Outpost', 'Refueling Depot', 'Pirate Haven', 'Ancient Ruins', 'Jump Gate', 'Active Jump-Gate', 'Inactive Jump-Gate'
];

const DEFAULT_GRID_PRESETS = {
    scout: { label: 'Scout Run', width: 4, height: 6 },
    frontier: { label: 'Frontier Drift', width: 6, height: 8 },
    standard: { label: 'Standard Chart', width: 8, height: 10 },
    expedition: { label: 'Expedition Grid', width: 10, height: 12 },
    dominion: { label: 'Dominion Net', width: 12, height: 16 }
};

const DEFAULT_STAR_AGE_DISPLAY = {
    millionLabel: 'M Years',
    billionLabel: 'B Years',
    unknownLabel: 'Unknown'
};

const DEFAULT_NAME_PREFIX = [
    'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa',
    'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon',
    'Phi', 'Chi', 'Psi', 'Omega', 'Vega', 'Altair', 'Sirius', 'Rigel', 'Deneb', 'Arcturus',
    'Bellatrix', 'Canopus', 'Betelgeuse', 'Aldebaran', 'Spica', 'Polaris', 'Antares', 'Capella', 'Regulus', 'Fomalhaut',
    'Mimosa', 'Alnilam', 'Alnitak', 'Saiph', 'Procyon', 'Achernar', 'Hadar', 'Dubhe', 'Kepler', 'Trappist',
    'Proxima', 'Sol', 'Helios', 'Luyten', 'Barnard', 'Wolf', 'Ross', 'Lacaille', 'Gliese', 'Kapteyn',
    'Tycho', 'Hubble', 'Sagan', 'Drake', 'Lyra', 'Orion', 'Draco', 'Cygnus', 'Carina', 'Perseus',
    'Cassio', 'Andromeda', 'Pegasus', 'Aquila', 'Vulpecula', 'Hydra', 'Centaur', 'Pavo', 'Corvus', 'Ara',
    'Astra', 'Nova', 'Aether', 'Umbra', 'Lumen', 'Nereid', 'Acheron', 'Erebus', 'Talos', 'Nyx',
    'Atlas', 'Janus', 'Selene', 'Icarus', 'Vesper', 'Aurora', 'Xylar', 'Zorya', 'Kharon', 'Valkyr',
    'Myrmidon', 'Halcyon', 'Riven', 'Eidolon'
];

const DEFAULT_NAME_SUFFIX = [
    'Major', 'Minor', 'Prime', 'Secundus', 'Tertius', 'Quartus', 'Quintus', 'Ultima',
    'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
    'Ceti', 'Centauri', 'Eridani', 'Draconis', 'Lyrae', 'Pegasi', 'Orionis', 'Aquilae', 'Cygni', 'Carinae',
    'Hydrae', 'Andromedae', 'Cassiopeiae', 'Persei', 'Leonis', 'Pavonis', 'Reach', 'Frontier', 'Sector', 'Expanse',
    'Belt', 'Marches', 'Drift', 'Span', 'Gate', 'Pass', 'Corridor', 'Run', 'Approach', 'Basin',
    'Crown', 'Veil', 'Arm', 'Spur', 'Rim', 'Core', 'Depths', 'Horizon', 'Nexus', 'Anchor',
    'Outpost', 'Domain', 'Territory', 'Quarter', 'Cluster', 'Vault', 'Relay', 'Terminus'
];

export let STAR_VISUALS = DEFAULT_STAR_VISUALS;
export let STAR_CLASS_INFO = DEFAULT_STAR_CLASS_INFO;
export let PLANET_TYPES = DEFAULT_PLANET_TYPES;
export let POI_TYPES = DEFAULT_POI_TYPES;
export let GRID_PRESETS = DEFAULT_GRID_PRESETS;
export let STAR_AGE_DISPLAY = DEFAULT_STAR_AGE_DISPLAY;
export let NAME_PREFIX = DEFAULT_NAME_PREFIX;
export let NAME_SUFFIX = DEFAULT_NAME_SUFFIX;

export function hydrateConfigData(loadedData = {}) {
    STAR_VISUALS = loadedData.starVisuals || DEFAULT_STAR_VISUALS;
    STAR_CLASS_INFO = loadedData.starClassInfo || DEFAULT_STAR_CLASS_INFO;
    PLANET_TYPES = loadedData.planetTypes || DEFAULT_PLANET_TYPES;
    POI_TYPES = loadedData.poiTypes || DEFAULT_POI_TYPES;
    GRID_PRESETS = loadedData.gridPresets || DEFAULT_GRID_PRESETS;
    STAR_AGE_DISPLAY = loadedData.starAgeDisplay || DEFAULT_STAR_AGE_DISPLAY;
    NAME_PREFIX = loadedData.namePrefix || DEFAULT_NAME_PREFIX;
    NAME_SUFFIX = loadedData.nameSuffix || DEFAULT_NAME_SUFFIX;
}

export const LOCAL_STORAGE_KEY = 'hex-star-sector-gen';

export const state = {
    editMode: false,
    sizeMode: 'preset',
    densityMode: 'preset',
    sectors: {},
    deepSpacePois: {},
    selectedHexId: null,
    selectedBodyIndex: null,
    selectedSystemData: null,
    currentSeed: '',
    layoutSeed: '',
    rerollIteration: 0,
    seededRandomFn: () => Math.random(),
    lastSectorSnapshot: null,
    sectorConfigSnapshot: null,
    pinnedHexIds: [],
    multiSector: {
        currentKey: HOME_SECTOR_KEY,
        selectedSectorKey: HOME_SECTOR_KEY,
        sectorsByKey: {},
        jumpGateRegistry: {},
        expandedView: false
    },
    statusMessageTimer: null,
    starTooltipPinned: false,
    routePlanner: {
        startHexId: null,
        endHexId: null,
        pathHexIds: [],
        hops: 0,
        pickMode: null
    },
    viewState: {
        scale: 1,
        x: 0,
        y: 0,
        isDragging: false,
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0,
        dragDistance: 0
    }
};

