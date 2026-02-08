function normalizeLookupKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-');
}

const DEFAULT_PLANET_TYPE_TOOLTIPS = {
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

const DEFAULT_PLANET_SIZE_TOOLTIPS = {
    tiny: 'Very small world, usually with weak gravity and limited atmosphere retention.',
    small: 'Below-average planetary mass and gravity.',
    medium: 'Mid-sized world near baseline terrestrial scale.',
    large: 'High-mass world with stronger gravity and deeper potential atmosphere.',
    huge: 'Very massive world, often with extreme gravity and thick envelopes.'
};

const DEFAULT_ATMOSPHERE_TOOLTIPS = {
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

const DEFAULT_TEMPERATURE_TOOLTIPS = {
    frozen: 'Persistently icy conditions with widespread solid volatiles.',
    freezing: 'Extremely cold climate with long-term subzero surface conditions.',
    cold: 'Low-temperature climate; survival often needs thermal support.',
    temperate: 'Moderate climate range with the best chance for stable surface activity.',
    warm: 'Elevated baseline heat but not consistently extreme.',
    hot: 'High sustained temperatures that stress life support and equipment.',
    scorching: 'Very severe heat with frequent surface thermal hazards.',
    burning: 'Extreme, near-sterilizing heat dominated by intense thermal exposure.'
};

const DEFAULT_PLANET_TAG_TOOLTIPS = {
    'colony-world': 'Young settlement still building core infrastructure, institutions, and long-range resilience.',
    'core-trade-hub': 'High-throughput commercial nexus with strong logistics, finance, and interstellar market reach.',
    'industrial-powerhouse': 'Production-focused world with heavy manufacturing, refining, and strategic material output.',
    'major-spaceyard': 'Major shipbuilding and orbital fabrication center with heavy dock capacity and fleet support infrastructure.',
    'forge-world': 'Heavy-industry world optimized for metalworks, foundries, munitions, and large-scale machine production.',
    'agri-world': 'Food-export economy centered on large-scale agriculture, aquaculture, or bioresource processing.',
    'garden-world': 'Highly habitable biosphere with stable climate, rich ecology, and exceptional quality-of-life conditions.',
    'research-enclave': 'Knowledge economy world with major laboratories, academic centers, and advanced R&D programs.',
    'military-bastion': 'Fortified strategic anchor with major defense installations, fleet support, and hardened infrastructure.',
    'frontier-outpost': 'Remote edge settlement with limited support, high risk, and strong expansion potential.',
    'cultural-center': 'Destination world known for culture, heritage, pilgrimage, recreation, or hospitality industries.',
    'tourism-/-cultural-center': 'Destination world known for culture, heritage, pilgrimage, recreation, or hospitality industries.',
    'smuggler-haven': 'Shadow-economy port where illicit trade, contraband routing, and off-registry brokers operate openly.',
    'pilgrimage-world': 'World-scale religious destination drawing continuous interstellar pilgrim traffic and sacred institutions.',
    'pilgrimage-site': 'Specific holy site or shrine complex of interstellar significance, often protected by local authorities.',
    'pleasure-world': 'Leisure and entertainment economy focused on resorts, nightlife, recreation, and visitor services.',
    'rampant-slavery': 'Society with normalized coercive labor systems, trafficking networks, and weak protections for the vulnerable.',
    'regional-hegemon': 'Dominant regional power with established influence over nearby systems through military, economic, or political leverage.',
    'rising-hegemon': 'Ascending power rapidly expanding influence and challenging existing regional balances.',
    'corporate-enclave': 'World where megacorporations control governance, law enforcement, and key public infrastructure.',
    'xeno-preserve': 'Protected biosphere or alien heritage reserve with strict development and exploitation controls.',
    'floating-cities': 'Major population centers built as buoyant platforms or aerostat habitats above hostile or oceanic surfaces.',
    'sole-supplier': 'Rare strategic monopoly world that is the primary exporter of a critical resource, component, or fuel type.',
    ecumenopolis: 'Planet-wide urban megastructure with immense infrastructure density and extreme population concentration.',
    'tidally-locked': 'Planet with one hemisphere in perpetual daylight and the other in permanent night, creating extreme climate gradients.',
    'seismic-instability': 'Frequent tectonic upheaval, quakes, and crustal volatility that threaten long-term surface stability.',
    'frequent-storms': 'Persistent severe weather systems that disrupt logistics, habitation, and routine surface operations.',
    'dome-cities': 'Population centers enclosed in protective domes to survive hostile atmosphere, radiation, or surface conditions.',
    terraformed: 'World substantially altered by engineered climate and biosphere projects to improve long-term habitability.',
    'terraform-failure': 'World marked by failed or partially failed terraforming, leaving unstable ecosystems and hazardous conditions.',
    'active-battlefield': 'Current conflict zone contested by external powers with active deployments and ongoing operations.',
    'quarantined-world': 'Travel and contact restricted under biosecurity, contamination, or strategic containment protocols.',
    'civil-war': 'Active internal conflict between major local factions competing for governance, territory, or law.',
    'prison-planet': 'World organized around large-scale detention infrastructure, penal colonies, and security enforcement.',
    'abandoned-colony': 'Former settled world now largely depopulated after collapse, evacuation, or systemic failure.'
};

let PLANET_TYPE_TOOLTIPS = DEFAULT_PLANET_TYPE_TOOLTIPS;
let PLANET_SIZE_TOOLTIPS = DEFAULT_PLANET_SIZE_TOOLTIPS;
let ATMOSPHERE_TOOLTIPS = DEFAULT_ATMOSPHERE_TOOLTIPS;
let TEMPERATURE_TOOLTIPS = DEFAULT_TEMPERATURE_TOOLTIPS;
let PLANET_TAG_TOOLTIPS = DEFAULT_PLANET_TAG_TOOLTIPS;

export function hydrateTooltipData(loadedData = {}) {
    PLANET_TYPE_TOOLTIPS = loadedData.planetTypeTooltips || DEFAULT_PLANET_TYPE_TOOLTIPS;
    PLANET_SIZE_TOOLTIPS = loadedData.planetSizeTooltips || DEFAULT_PLANET_SIZE_TOOLTIPS;
    ATMOSPHERE_TOOLTIPS = loadedData.atmosphereTooltips || DEFAULT_ATMOSPHERE_TOOLTIPS;
    TEMPERATURE_TOOLTIPS = loadedData.temperatureTooltips || DEFAULT_TEMPERATURE_TOOLTIPS;
    PLANET_TAG_TOOLTIPS = loadedData.planetTagTooltips || DEFAULT_PLANET_TAG_TOOLTIPS;
}

export function resolveFieldTooltip(field, value) {
    const fieldKey = normalizeLookupKey(field);
    const valueKey = normalizeLookupKey(value);

    if (fieldKey === 'planet-type') {
        return {
            label: 'Planet Type',
            description: PLANET_TYPE_TOOLTIPS[valueKey] || 'Category of celestial body detected in this system.'
        };
    }
    if (fieldKey === 'size') {
        return {
            label: 'Size',
            description: PLANET_SIZE_TOOLTIPS[valueKey] || 'Relative planetary size class.'
        };
    }
    if (fieldKey === 'atmosphere') {
        return {
            label: 'Atmosphere',
            description: ATMOSPHERE_TOOLTIPS[valueKey] || 'Dominant atmospheric condition observed for this body.'
        };
    }
    if (fieldKey === 'temperature') {
        return {
            label: 'Temperature',
            description: TEMPERATURE_TOOLTIPS[valueKey] || 'Estimated broad thermal regime for this body.'
        };
    }
    if (fieldKey === 'tag') {
        return {
            label: 'Planet Tag',
            description: PLANET_TAG_TOOLTIPS[valueKey] || 'Strategic or socio-economic specialization observed for this inhabited world.'
        };
    }

    return {
        label: 'Field',
        description: 'No additional data available.'
    };
}
