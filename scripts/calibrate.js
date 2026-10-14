// calibrate.js - check the macro engine against its design targets.
//   node scripts/calibrate.js [paths] [rounds]
const { Economy } = require('../src/economy');
const { createRng } = require('../src/rng');
const { SHOCK_CARDS } = require('../src/board');
const shockRate = process.argv[4] !== undefined ? +process.argv[4] : 0.3; // shock cards drawn per round (about 0.3 with 4 players)

const paths = +process.argv[2] || 400, rounds = +process.argv[3] || 80;
const rows = [];
for (let n = 0; n < paths; n++) {
    const e = new Economy({}, createRng(1000 + n));
    const rng = createRng(5000 + n);
    for (let t = 0; t < rounds; t++) {
        if (rng.next() < shockRate) {
            const c = SHOCK_CARDS[rng.int(0, SHOCK_CARDS.length - 1)];
            e.addShock(c.kind, c.size, c.rho);
        }
        rows.push(e.step(0));
    }
}
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const col = k => rows.map(r => r[k]);
console.log('mean pi %s  sd pi %s', mean(col('pi')).toFixed(2), sd(col('pi')).toFixed(2));
console.log('mean y  %s  sd y  %s', mean(col('y')).toFixed(2), sd(col('y')).toFixed(2));
console.log('mean i  %s  sd i  %s  ZLB share %s%%', mean(col('i')).toFixed(2), sd(col('i')).toFixed(2),
    (100 * mean(col('i').map(x => x === 0 ? 1 : 0))).toFixed(1));
console.log('mean cred %s', mean(col('cred')).toFixed(2));

// Impulse responses (no noise): a +1pp policy surprise, and each shock type.
function irf(setup, label) {
    const e = new Economy({}, null);
    setup(e);
    const out = [];
    for (let t = 0; t < 8; t++) out.push(e.step(0));
    console.log(label.padEnd(26), out.map(s => `y${s.y.toFixed(2)}/pi${s.pi.toFixed(2)}/i${s.i.toFixed(2)}`).join('  '));
}
irf(e => { e.i += 1; }, 'rate +1pp surprise');
irf(e => e.addShock('supply', 2.0, 0.6, 6), 'oil shock (supply +2)');
irf(e => e.addShock('demand', 1.5, 0.7, 6), 'demand boom (+1.5)');
irf(e => e.addShock('financial', 2.0, 0.5, 4), 'financial crisis (+2 spread)');
