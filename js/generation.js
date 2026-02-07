function generateSector() {
    if (isAutoSeedEnabled()) {
        const input = document.getElementById('seedInput');
        if (input) {
            input.value = generateSeedString();
        }
    }

    const seedUsed = prepareSeed();
    const size = getSelectedGridSize();
    let w = size.width;
    let h = size.height;

    // Keep hidden inputs synced.
    document.getElementById('gridWidth').value = w;
    document.getElementById('gridHeight').value = h;

    const totalHexes = w * h;
    let systemCount = 0;

    if (densityMode === 'preset') {
        const percent = parseFloat(document.getElementById('densityPreset').value);
        systemCount = Math.floor(totalHexes * percent);
    } else {
        let min = parseInt(document.getElementById('manualMin').value);
        let max = parseInt(document.getElementById('manualMax').value);

        if (min < 0) min = 0;
        if (max > totalHexes) max = totalHexes;
        if (min > max) {
            const temp = min;
            min = max;
            max = temp;
        }

        systemCount = Math.floor(rand() * (max - min + 1)) + min;
    }

    sectors = {};
    selectedHexId = null;
    clearInfoPanel();

    let allCoords = [];
    for (let c = 0; c < w; c++) {
        for (let r = 0; r < h; r++) {
            allCoords.push(`${c}-${r}`);
        }
    }

    shuffleArray(allCoords);
    const occupiedCoords = allCoords.slice(0, systemCount);
    occupiedCoords.forEach(coordId => {
        sectors[coordId] = generateSystemData();
    });

    drawGrid(w, h);

    document.getElementById('statusTotalHexes').innerText = `${totalHexes} Hexes`;
    document.getElementById('statusTotalSystems').innerText = `${systemCount} Systems`;
    lastSectorSnapshot = buildSectorPayload({ width: w, height: h, totalHexes, systemCount });
    showStatusMessage(seedUsed ? `Generated seed ${seedUsed}` : 'Sector regenerated.', 'info');
}

function generateSystemData() {
    const randChance = rand();
    let sClass = 'M';
    if (randChance > 0.99) sClass = 'Black Hole';
    else if (randChance > 0.97) sClass = 'Neutron';
    else if (randChance > 0.94) sClass = 'O';
    else if (randChance > 0.90) sClass = 'B';
    else if (randChance > 0.80) sClass = 'A';
    else if (randChance > 0.65) sClass = 'F';
    else if (randChance > 0.45) sClass = 'G';
    else if (randChance > 0.20) sClass = 'K';

    const p1 = NAME_PREFIX[Math.floor(rand() * NAME_PREFIX.length)];
    const p2 = NAME_SUFFIX[Math.floor(rand() * NAME_SUFFIX.length)];
    const num = Math.floor(rand() * 999) + 1;
    const name = rand() > 0.5 ? `${p1}-${num}` : `${p1} ${p2}`;

    const planetCount = Math.floor(rand() * 10) + 1;
    const planets = [];
    let population = 0;
    const starAge = generateStarAge(sClass);

    for (let i = 0; i < planetCount; i++) {
        const type = PLANET_TYPES[Math.floor(rand() * PLANET_TYPES.length)];
        let pop = 0;
        let features = [];

        if (['Terrestrial', 'Oceanic'].includes(type) && rand() > 0.6) {
            pop = Math.floor(rand() * 10) + 1;
            population += pop;
            features.push('Inhabited');
        }

        if (rand() > 0.8) {
            const poi = POI_TYPES[Math.floor(rand() * POI_TYPES.length)];
            features.push(poi);
        }

        planets.push({
            name: `${name} ${romanize(i + 1)}`,
            type,
            features,
            pop
        });
    }

    if (rand() > 0.7) {
        const poi = POI_TYPES[Math.floor(rand() * POI_TYPES.length)];
        planets.push({
            name: `Station Alpha-${Math.floor(rand() * 99)}`,
            type: 'Artificial',
            features: [poi],
            pop: 0
        });
    }

    const visuals = STAR_VISUALS[sClass] || STAR_VISUALS.default;

    return {
        name,
        starClass: sClass,
        color: visuals.core,
        glow: visuals.halo,
        palette: visuals,
        starAge,
        planets,
        totalPop: population > 0 ? `${population} Billion` : 'None'
    };
}
