// node --test test/
const test = require('node:test');
const assert = require('node:assert');
const { Economy } = require('../src/economy');
const { Game } = require('../src/game');
const { playGame, tournament } = require('../src/sim');
const { createRng } = require('../src/rng');

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const two = (extra = {}) => new Game(Object.assign({
    seed: 42, players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
}, extra));

// ---------- economy ----------
test('without shocks the economy sits at its targets', () => {
    const e = new Economy();
    for (let t = 0; t < 50; t++) e.step(0);
    near(e.pi, 2); near(e.y, 0); near(e.i, 4);
});

test('a rate hike lowers output with a lag and inflation after it', () => {
    const e = new Economy();
    e.i += 1;
    const s1 = e.step(0), s2 = e.step(0);
    assert.ok(s1.y < 0 && s2.y < s1.y, 'output falls and keeps falling for a quarter');
    assert.ok(s2.pi < 2, 'inflation falls below target');
});

test('shock types hit the right equation', () => {
    const supply = new Economy(); supply.addShock('supply', 2, 0.6); supply.step(0);
    near(supply.pi, 4); near(supply.y, 0);
    const demand = new Economy(); demand.addShock('demand', 1.5, 0.6); demand.step(0);
    assert.ok(demand.y > 1.4 && demand.pi > 2);
    const fin = new Economy(); fin.addShock('financial', 2, 0.6); fin.step(0);
    assert.ok(fin.spread > 0 && fin.y < 0);
});

test('zero lower bound holds and overriding the rule costs credibility', () => {
    const e = new Economy();
    e.addShock('demand', -6, 0.9, 10);
    for (let t = 0; t < 6; t++) { e.step(0); assert.ok(e.i >= 0); }
    const f = new Economy(), c0 = f.cred;
    f.advance(0); f.setPolicy(0);
    assert.ok(f.cred < c0);
});

test('forecast is deterministic and does not mutate the economy', () => {
    const e = new Economy({}, createRng(3));
    e.step(0);
    const before = JSON.stringify(e.snapshot());
    const a = e.forecast(4, 50), b = e.forecast(4, 50);
    assert.deepStrictEqual(a, b);
    assert.strictEqual(JSON.stringify(e.snapshot()), before);
});

// ---------- game rules (regressions from v1) ----------
test('dark-blue houses cost $200 (v1 charged $0)', () => {
    const g = two();
    const fisher = g.squares.find(s => s.name === 'Fisher Place');
    assert.strictEqual(g.houseCost(fisher), 200);
});

test('rents, GO and taxes are indexed to the price level', () => {
    const g = two();
    const sq = g.squares[1];
    sq.owner = 1;
    const r0 = g.rentFor(sq, 7);
    g.economy.priceLevel = 1.5;
    assert.strictEqual(g.rentFor(sq, 7), Math.round(r0 * 1.5));
    assert.strictEqual(g.nominal(200), 300);
});

test('property value falls when real rates rise, more for long-duration groups', () => {
    const g = two();
    const m0 = { brown: g.valueMultiplier('brown'), blue: g.valueMultiplier('dark-blue') };
    near(m0.brown, 1); near(m0.blue, 1);
    g.economy.iL += 2;
    assert.ok(g.valueMultiplier('dark-blue') < g.valueMultiplier('brown'));
    assert.ok(g.valueMultiplier('brown') < 1);
});

test('utility rent uses the dice (v1 always charged $0)', () => {
    const g = two();
    const util = g.squares[12];
    util.owner = 1;
    assert.strictEqual(g.rentFor(util, 8), 32);
});

test('going to jail does not skip the next player (v1 advanced twice)', () => {
    const g = two();
    g.phase = 'post';
    g.sendToJail(g.players[0]);
    g.endTurn();
    assert.strictEqual(g.current, 1);
});

test('three doubles in a row sends you to jail; doubles grant another roll', () => {
    const g = two({ auctions: false });
    g.rollDice = function () { this.dice = [3, 3]; return this.dice; };
    g.roll(); if (g.phase === 'buy') g.pass();
    g.endTurn(); assert.strictEqual(g.phase, 'roll'); assert.strictEqual(g.current, 0);
    g.roll(); if (g.phase === 'buy') g.pass();
    g.endTurn();
    g.roll();
    assert.ok(g.players[0].inJail);
    g.endTurn(); assert.strictEqual(g.current, 1);
});

test('mortgaged lots still earn rent; interest accrues each quarter; fixed rates are locked', () => {
    const g = two();
    const sq = g.squares[39];
    sq.owner = 0;
    g.phase = 'post';
    assert.ok(g.borrow(0, 39, 'fixed'));
    const locked = sq.loan.rate;
    assert.ok(g.rentFor(sq, 7) > 0);
    const cashBefore = g.players[0].cash;
    for (let k = 0; k < 3; k++) { g.phase = 'post'; g.endTurn(); }
    assert.strictEqual(g.round, 1);
    assert.strictEqual(sq.loan.rate, locked);
    const interest = Math.round(sq.loan.principal * locked / 400);
    const deposit = Math.round(cashBefore * 4 / 400);
    assert.ok(Math.abs(g.players[0].cash - (cashBefore + deposit - interest)) <= 1);
});

test('bankruptcy hands assets to the creditor without corrupting seat indices (v1 spliced players)', () => {
    const g = two();
    const lot = g.squares[39];
    lot.owner = 2; lot.houses = 0;
    g.squares[1].owner = 1;
    const p1 = g.players[1];
    p1.cash = 0;
    g.pay(p1, 100000, g.players[2], 'test');
    assert.ok(p1.bankrupt);
    assert.strictEqual(g.squares[1].owner, 2);
    assert.strictEqual(g.players[2].id, 2);
    g.phase = 'post'; g.endTurn();
    assert.strictEqual(g.current, 2, 'bankrupt seat is skipped');
});

test('same seed, same game', () => {
    const settings = { seed: 7, rounds: 20, players: [
        { type: 'bot', strategy: 'naive' }, { type: 'bot', strategy: 'macro' }] };
    const a = playGame(settings), b = playGame(settings);
    assert.deepStrictEqual(a.ranking, b.ranking);
});

test('bots finish games in every configuration without stalling', () => {
    const strategies = ['naive', 'macro', 'leverage'];
    for (let s = 0; s < 30; s++) {
        const n = 2 + (s % 5);
        const players = Array.from({ length: n }, (_, k) => ({ type: 'bot', strategy: strategies[(s + k) % 3] }));
        const g = playGame({ seed: s, rounds: 40, players, policyMode: s % 2 ? 'chair' : 'taylor' });
        assert.strictEqual(g.phase, 'over');
        assert.ok(g.economy.history.every(h => Number.isFinite(h.pi) && h.i >= 0));
    }
});

test('balance: the macro-aware bot beats the naive bot often, but not always', () => {
    const r = tournament({ strategies: ['naive', 'macro'], games: 120, rounds: 40, seed: 100 });
    const macro = r.byStrategy.find(s => s.strategy === 'macro');
    assert.ok(macro.winRate > 0.52 && macro.winRate < 0.8, `macro win rate ${macro.winRate}`);
    assert.ok(Math.abs(r.macro.meanPi - 2) < 0.5, `mean inflation ${r.macro.meanPi}`);
});

// ---------- auctions and trading ----------
test('passing on a lot starts a sealed second-price auction', () => {
    const g = two();
    g.pendingBuy = 39; g.phase = 'buy';
    g.pass();
    assert.strictEqual(g.phase, 'auction');
    assert.deepStrictEqual(g.auctionWaiting(), [0, 1, 2]);
    g.bid(0, 0); g.bid(1, 300); g.bid(2, 250);
    assert.strictEqual(g.squares[39].owner, 1);
    assert.strictEqual(g.players[1].cash, 1500 - 251, 'winner pays second bid + 1');
    assert.strictEqual(g.phase, 'post');
});

test('auction with no bids leaves the lot with the bank; bids are capped at cash', () => {
    const g = two();
    g.pendingBuy = 1; g.phase = 'buy'; g.pass();
    g.bid(0, 0); g.bid(1, 5); g.bid(2, 0); // 5 is under the minimum bid
    assert.strictEqual(g.squares[1].owner, null);
    g.pendingBuy = 3; g.phase = 'buy'; g.pass();
    g.bid(0, 99999); g.bid(1, 0); g.bid(2, 0);
    assert.strictEqual(g.squares[3].owner, 0);
    assert.ok(g.players[0].cash >= 0);
});

test('trades move lots, loans and cash; lots in built-up groups are blocked', () => {
    const g = two();
    g.phase = 'post';
    g.squares[1].owner = 0; g.squares[3].owner = 1; g.squares[39].owner = 1;
    g.squares[39].loan = { kind: 'fixed', principal: 200, rate: 3 };
    assert.ok(g.proposeTrade({ from: 0, to: 1, give: [], get: [3, 39], cash: 100 }));
    assert.strictEqual(g.phase, 'trade');
    g.respondTrade(true);
    assert.strictEqual(g.phase, 'post');
    assert.strictEqual(g.squares[39].owner, 0);
    assert.strictEqual(g.squares[39].loan.rate, 3, 'loan travels with the lot');
    assert.strictEqual(g.players[0].cash, 1400);
    assert.strictEqual(g.players[1].cash, 1600);
    g.squares[1].houses = 1;
    assert.ok(!g.proposeTrade({ from: 0, to: 1, give: [3], get: [], cash: 0 }));
    assert.match(g.lastTradeError, /buildings/);
});

test('a rejected trade changes nothing', () => {
    const g = two();
    g.phase = 'roll';
    g.squares[1].owner = 1;
    g.proposeTrade({ from: 0, to: 1, give: [], get: [1], cash: 50 });
    g.respondTrade(false);
    assert.strictEqual(g.squares[1].owner, 1);
    assert.strictEqual(g.players[0].cash, 1500);
    assert.strictEqual(g.phase, 'roll');
});

test('bots trade to complete colour groups, so buildings actually get built', () => {
    const r = tournament({ strategies: ['naive', 'macro', 'leverage', 'naive'], games: 40, rounds: 40, seed: 300 });
    assert.ok(r.macro.housesAtEnd > 15, `buildings at end ${r.macro.housesAtEnd}`);
});
