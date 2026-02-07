export function shuffleArray(array, randFn) {
    const random = randFn || Math.random;
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

export function pickWeighted(items, randomFn = Math.random, getWeight = (item) => item.weight) {
    if (!Array.isArray(items) || !items.length) return null;
    const total = items.reduce((sum, item) => {
        const weight = Number(getWeight(item));
        return weight > 0 ? sum + weight : sum;
    }, 0);
    if (!(total > 0)) return null;

    let roll = randomFn() * total;
    for (const item of items) {
        const weight = Number(getWeight(item));
        if (!(weight > 0)) continue;
        roll -= weight;
        if (roll <= 0) return item;
    }
    return items[items.length - 1];
}

export function romanize(num) {
    if (isNaN(num)) return NaN;
    const digits = String(+num).split('');
    const key = [
        '', 'C', 'CC', 'CCC', 'CD', 'D', 'DC', 'DCC', 'DCCC', 'CM',
        '', 'X', 'XX', 'XXX', 'XL', 'L', 'LX', 'LXX', 'LXXX', 'XC',
        '', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'
    ];
    let roman = '';
    let i = 3;
    while (i--) roman = (key[+digits.pop() + (i * 10)] || '') + roman;
    return Array(+digits.join('') + 1).join('M') + roman;
}

export function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return function() {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return (h ^= h >>> 16) >>> 0;
    };
}

export function mulberry32(a) {
    return function() {
        let t = (a += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
