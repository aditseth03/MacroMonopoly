// balance.js - bot tournament. node scripts/balance.js [games] [rounds] [strategies...]
const { tournament } = require('../src/sim');
const games = +process.argv[2] || 200, rounds = +process.argv[3] || 40;
const strategies = process.argv.slice(4).length ? process.argv.slice(4) : ['naive', 'macro', 'leverage', 'naive'];
const t0 = Date.now();
const r = tournament({ strategies, games, rounds, seed: 1 });
console.log(`${games} games x ${rounds} quarters, seats: ${strategies.join(', ')}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
r.byStrategy.forEach(s => console.log(
    `${s.strategy.padEnd(9)} win ${(100 * s.winRate).toFixed(1).padStart(5)}% (fair ${(100 * s.fairShare).toFixed(0)}%)  ` +
    `mean real NW $${Math.round(s.meanRealNetWorth)}  bankrupt ${(100 * s.bankruptRate).toFixed(1)}%`));
const m = r.macro;
console.log(`macro: pi ${m.meanPi.toFixed(2)}±${m.sdPi.toFixed(2)}  i ${m.meanI.toFixed(2)}  sd gap ${m.sdY.toFixed(2)}  ZLB ${(100 * m.zlbShare).toFixed(1)}%  houses at end ${m.housesAtEnd.toFixed(1)}`);
