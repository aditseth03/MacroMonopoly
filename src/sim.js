// sim.js - headless bot-vs-bot games on fresh Game instances (never touches the live game or DOM).
(function (root) {
    'use strict';

    const isNode = typeof module === 'object' && module.exports;
    const MM = isNode ? Object.assign({}, require('./game'), require('./bots')) : root.MM;

    function playGame(settings, maxActions = 20000) {
        const game = new MM.Game(settings);
        let n = 0;
        while (game.phase !== 'over' && n++ < maxActions) {
            if (!MM.act(game)) throw new Error(`bot stalled in phase ${game.phase}`);
        }
        if (game.phase !== 'over') throw new Error('game did not finish');
        return game;
    }

    // Round-robin tournament: every game seats `strategies` in a rotated order so seat
    // advantage washes out. Returns win rates and macro statistics.
    function tournament({ strategies, games = 100, rounds = 40, seed = 1, policyMode = 'taylor', econ = {} }) {
        const wins = {}, realNW = {}, bankrupt = {};
        strategies.forEach(s => { wins[s] = 0; realNW[s] = []; bankrupt[s] = 0; });
        const macro = { pi: [], i: [], y: [], zlb: 0, obs: 0, houses: 0, debtShare: [] };
        for (let g = 0; g < games; g++) {
            const order = strategies.map((_, k) => strategies[(k + g) % strategies.length]);
            const players = order.map((s, k) => ({ name: `${s}#${k + 1}`, type: 'bot', strategy: s }));
            const game = playGame({ players, rounds, seed: seed + g, policyMode, econ });
            const winner = game.players[game.winner];
            wins[winner.strategy] += 1;
            game.players.forEach(p => {
                realNW[p.strategy].push(game.realNetWorth(p.id));
                if (p.bankrupt) bankrupt[p.strategy] += 1;
            });
            game.economy.history.slice(1).forEach(h => {
                macro.pi.push(h.pi); macro.i.push(h.i); macro.y.push(h.y);
                macro.obs++; if (h.i === 0) macro.zlb++;
            });
            macro.houses += game.squares.reduce((s, sq) => s + sq.houses, 0);
        }
        const mean = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
        const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
        const seats = games * strategies.length;
        const byStrategy = [...new Set(strategies)].map(s => {
            const count = strategies.filter(x => x === s).length;
            return {
                strategy: s, seats: count,
                winRate: wins[s] / games, fairShare: count / strategies.length,
                meanRealNetWorth: mean(realNW[s]), bankruptRate: bankrupt[s] / (games * count),
            };
        });
        return {
            games, rounds, byStrategy,
            macro: {
                meanPi: mean(macro.pi), sdPi: sd(macro.pi), meanI: mean(macro.i), sdY: sd(macro.y),
                zlbShare: macro.zlb / Math.max(1, macro.obs), housesAtEnd: macro.houses / games,
            },
            seats,
        };
    }

    const api = { playGame, tournament };
    if (isNode) module.exports = api;
    else root.MM = Object.assign(root.MM || {}, api);
})(typeof self !== 'undefined' ? self : this);
