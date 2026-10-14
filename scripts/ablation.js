// ablation.js - how much is reading the macroeconomy worth? Plays the macro bot against an
// identical bot that ignores the forecast. node scripts/ablation.js [games] [rounds]
const bots = require('../src/bots');
const { tournament } = require('../src/sim');
bots.STRATEGIES.macroBlind = bots.makeMacro(false);
const games = +process.argv[2] || 400, rounds = +process.argv[3] || 40;
for (const seats of [['macroBlind', 'macro'], ['naive', 'macroBlind']]) {
    const r = tournament({ strategies: seats, games, rounds, seed: 1 });
    console.log(seats.join(' vs '), r.byStrategy.map(s => `${s.strategy} ${(100 * s.winRate).toFixed(1)}%`).join('  '));
}
