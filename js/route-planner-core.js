class MinPriorityQueue {
    constructor() {
        this.items = [];
    }

    push(node, priority) {
        this.items.push({ node, priority });
        this.#bubbleUp(this.items.length - 1);
    }

    pop() {
        if (!this.items.length) return null;
        const first = this.items[0];
        const last = this.items.pop();
        if (this.items.length && last) {
            this.items[0] = last;
            this.#bubbleDown(0);
        }
        return first;
    }

    get size() {
        return this.items.length;
    }

    #bubbleUp(index) {
        let i = index;
        while (i > 0) {
            const parent = Math.floor((i - 1) / 2);
            if (this.items[parent].priority <= this.items[i].priority) break;
            [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
            i = parent;
        }
    }

    #bubbleDown(index) {
        let i = index;
        const len = this.items.length;
        while (true) {
            const left = (i * 2) + 1;
            const right = left + 1;
            let smallest = i;
            if (left < len && this.items[left].priority < this.items[smallest].priority) {
                smallest = left;
            }
            if (right < len && this.items[right].priority < this.items[smallest].priority) {
                smallest = right;
            }
            if (smallest === i) break;
            [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
            i = smallest;
        }
    }
}

function oddrToCube(col, row) {
    const x = col - ((row - (row & 1)) / 2);
    const z = row;
    const y = -x - z;
    return { x, y, z };
}

function cubeToOddr(cube) {
    const col = cube.x + ((cube.z - (cube.z & 1)) / 2);
    const row = cube.z;
    return { col, row };
}

function cubeDistance(a, b) {
    return Math.max(
        Math.abs(a.x - b.x),
        Math.abs(a.y - b.y),
        Math.abs(a.z - b.z)
    );
}

export function hexDistance(a, b) {
    return cubeDistance(oddrToCube(a.col, a.row), oddrToCube(b.col, b.row));
}

function getNeighbors(col, row, width, height, isHexCoordInBounds) {
    const base = oddrToCube(col, row);
    const directions = [
        { x: 1, y: -1, z: 0 },
        { x: 1, y: 0, z: -1 },
        { x: 0, y: 1, z: -1 },
        { x: -1, y: 1, z: 0 },
        { x: -1, y: 0, z: 1 },
        { x: 0, y: -1, z: 1 }
    ];

    return directions
        .map((dir) => cubeToOddr({
            x: base.x + dir.x,
            y: base.y + dir.y,
            z: base.z + dir.z
        }))
        .filter((next) => isHexCoordInBounds(next.col, next.row, width, height));
}

function reconstructPath(cameFrom, currentKey) {
    const path = [currentKey];
    let cursor = currentKey;
    while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor);
        path.push(cursor);
    }
    path.reverse();
    return path;
}

function makeNodeKey(hexId, emptyStreak) {
    return `${hexId}|${emptyStreak}`;
}

function parseNodeKey(nodeKey) {
    const [hexId, streakRaw] = String(nodeKey).split('|');
    const emptyStreak = parseInt(streakRaw, 10);
    return {
        hexId,
        emptyStreak: Number.isInteger(emptyStreak) ? emptyStreak : 0
    };
}

export function computePath(startHexId, endHexId, width, height, options) {
    const {
        parseHexId,
        isHexCoordInBounds,
        isSystemHex,
        isRefuelingPoiHex
    } = options;
    if (!startHexId || !endHexId) return [];
    if (startHexId === endHexId) return [startHexId];

    const start = parseHexId(startHexId);
    const end = parseHexId(endHexId);
    if (!start || !end) return [];
    if (!isHexCoordInBounds(start.col, start.row, width, height) || !isHexCoordInBounds(end.col, end.row, width, height)) return [];

    const startHex = `${start.col}-${start.row}`;
    const endHex = `${end.col}-${end.row}`;
    const startKey = makeNodeKey(startHex, 0);
    const openQueue = new MinPriorityQueue();
    const openNodes = new Set([startKey]);
    openQueue.push(startKey, hexDistance(start, end));
    const cameFrom = new Map();
    const gScore = new Map([[startKey, 0]]);
    let bestEndNode = null;
    let bestEndScore = Number.POSITIVE_INFINITY;

    while (openQueue.size) {
        let current = null;
        while (openQueue.size) {
            const item = openQueue.pop();
            if (!item) break;
            if (!openNodes.has(item.node)) continue;
            current = item.node;
            openNodes.delete(item.node);
            break;
        }
        if (!current) break;
        const currentNode = parseNodeKey(current);
        if (currentNode.hexId === endHex) {
            const currentScore = gScore.get(current) ?? Number.POSITIVE_INFINITY;
            if (currentScore < bestEndScore) {
                bestEndNode = current;
                bestEndScore = currentScore;
            }
        }

        const currentParsed = parseHexId(currentNode.hexId);
        if (!currentParsed) continue;

        getNeighbors(currentParsed.col, currentParsed.row, width, height, isHexCoordInBounds).forEach((neighbor) => {
            const neighborHexId = `${neighbor.col}-${neighbor.row}`;
            const nextStreak = (isSystemHex(neighborHexId) || isRefuelingPoiHex(neighborHexId))
                ? 0
                : currentNode.emptyStreak + 1;
            if (nextStreak > 2) return;

            const neighborKey = makeNodeKey(neighborHexId, nextStreak);
            const tentative = (gScore.get(current) ?? Number.POSITIVE_INFINITY) + 1;
            if (tentative < (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) {
                cameFrom.set(neighborKey, current);
                gScore.set(neighborKey, tentative);
                const priority = tentative + hexDistance(neighbor, end);
                openNodes.add(neighborKey);
                openQueue.push(neighborKey, priority);
            }
        });
    }

    if (!bestEndNode) return [];
    return reconstructPath(cameFrom, bestEndNode).map((nodeKey) => parseNodeKey(nodeKey).hexId);
}
