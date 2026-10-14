// rng.js - small seeded PRNG so games and simulations are reproducible.
(function (root) {
    'use strict';

    // mulberry32: fast 32-bit generator, plenty for a board game.
    function createRng(seed) {
        let a = (seed >>> 0) || 0x9e3779b9;
        const rng = {
            next() {
                a = (a + 0x6d2b79f5) >>> 0;
                let t = a;
                t = Math.imul(t ^ (t >>> 15), t | 1);
                t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            },
            int(min, max) { // inclusive
                return min + Math.floor(rng.next() * (max - min + 1));
            },
            normal(mean = 0, sd = 1) { // Box-Muller
                const u = Math.max(rng.next(), 1e-12);
                const v = rng.next();
                return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
            },
            shuffle(arr) { // Fisher-Yates, in place
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(rng.next() * (i + 1));
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                }
                return arr;
            },
            state() { return a; },
            setState(s) { a = s >>> 0; },
        };
        return rng;
    }

    const api = { createRng };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MM = Object.assign(root.MM || {}, api);
})(typeof self !== 'undefined' ? self : this);
