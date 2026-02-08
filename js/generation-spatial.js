import { parseHexId, shuffleArray } from './utils.js';

export function countNeighborSystems(hexId, sectors) {
    const parsed = parseHexId(hexId);
    if (!parsed) return 0;
    let count = 0;
    for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
            if (dc === 0 && dr === 0) continue;
            const neighborHexId = `${parsed.col + dc}-${parsed.row + dr}`;
            if (sectors[neighborHexId]) count++;
        }
    }
    return count;
}

function oddrToCube(col, row) {
    const x = col - ((row - (row & 1)) / 2);
    const z = row;
    const y = -x - z;
    return { x, y, z };
}

function cubeDistance(a, b) {
    return Math.max(
        Math.abs(a.x - b.x),
        Math.abs(a.y - b.y),
        Math.abs(a.z - b.z)
    );
}

export function hexDistanceById(hexA, hexB) {
    const parsedA = parseHexId(hexA);
    const parsedB = parseHexId(hexB);
    if (!parsedA || !parsedB) return Number.POSITIVE_INFINITY;
    return cubeDistance(
        oddrToCube(parsedA.col, parsedA.row),
        oddrToCube(parsedB.col, parsedB.row)
    );
}

export function selectClusteredSystemCoords(candidateCoords, systemsToGenerate, randomFn = Math.random) {
    if (systemsToGenerate <= 2 || candidateCoords.length <= 2) {
        return candidateCoords.slice(0, systemsToGenerate);
    }

    const shuffled = [...candidateCoords];
    shuffleArray(shuffled, randomFn);
    const targetSystemsPerCluster = 4.5;
    const clusterCount = Math.max(
        2,
        Math.min(
            shuffled.length,
            Math.round(systemsToGenerate / targetSystemsPerCluster)
        )
    );
    const parsedCoords = shuffled
        .map((hexId) => ({ hexId, coord: parseHexId(hexId) }))
        .filter((item) => !!item.coord);
    if (!parsedCoords.length) return candidateCoords.slice(0, systemsToGenerate);

    const centers = [];
    centers.push(parsedCoords[Math.floor(randomFn() * parsedCoords.length)].coord);
    while (centers.length < clusterCount) {
        let best = null;
        let bestScore = Number.NEGATIVE_INFINITY;
        parsedCoords.forEach((item) => {
            const nearest = centers.reduce((min, center) => {
                const dc = item.coord.col - center.col;
                const dr = item.coord.row - center.row;
                const distance = Math.sqrt((dc * dc) + (dr * dr));
                return Math.min(min, distance);
            }, Number.POSITIVE_INFINITY);
            const spreadBias = nearest + (randomFn() * 0.75);
            if (spreadBias > bestScore) {
                bestScore = spreadBias;
                best = item.coord;
            }
        });
        if (!best) break;
        centers.push(best);
    }
    if (!centers.length) return candidateCoords.slice(0, systemsToGenerate);

    const buckets = centers.map(() => []);
    candidateCoords.forEach((hexId) => {
        const parsed = parseHexId(hexId);
        if (!parsed) return;
        let nearest = Number.POSITIVE_INFINITY;
        let nearestIndex = 0;
        centers.forEach((center, index) => {
            const dc = parsed.col - center.col;
            const dr = parsed.row - center.row;
            const distance = Math.sqrt((dc * dc) + (dr * dr));
            if (distance < nearest) {
                nearest = distance;
                nearestIndex = index;
            }
        });
        buckets[nearestIndex].push({
            hexId,
            score: -nearest + (randomFn() * 1.8)
        });
    });
    buckets.forEach((bucket) => bucket.sort((a, b) => b.score - a.score));

    const spreadCount = systemsToGenerate >= 10 ? Math.max(1, Math.floor(systemsToGenerate * 0.12)) : 0;
    const clusteredCount = Math.max(0, systemsToGenerate - spreadCount);
    const selected = [];
    let cursor = 0;
    while (selected.length < clusteredCount) {
        let pickedInPass = false;
        for (let i = 0; i < buckets.length && selected.length < clusteredCount; i++) {
            const bucket = buckets[i];
            const item = bucket[cursor];
            if (!item) continue;
            selected.push(item.hexId);
            pickedInPass = true;
        }
        if (!pickedInPass) break;
        cursor++;
    }
    const selectedSet = new Set(selected);
    const spreadCandidates = shuffled.filter((hexId) => !selectedSet.has(hexId));
    const spreadPicked = spreadCandidates.slice(0, systemsToGenerate - selected.length);

    return [...selected, ...spreadPicked];
}
