// game.js - the rules of Macro Monopoly as a DOM-free state machine. The browser UI,
// the bots and the headless simulator all drive the same Game object.
//
// Turn phases:  'roll'   -> current player may manage assets and trade, then roll (or pay bail if jailed)
//               'buy'    -> landed on an unowned lot: buy() or pass()
//               'auction'-> a passed/unaffordable lot is auctioned: every solvent player bid()s once
//                           (sealed bids, winner pays the second-highest bid + $1)
//               'trade'  -> a trade offer awaits respondTrade() from its recipient
//               'post'   -> after landing: manage assets, then endTurn() (or roll again on doubles)
//               'policy' -> Fed Chair mode only: the chair sets the policy rate for the quarter
//               'over'   -> game finished
// One full round of player turns = one quarter in the macro model.
(function (root) {
    'use strict';

    const isNode = typeof module === 'object' && module.exports;
    const MM = isNode
        ? Object.assign({}, require('./rng'), require('./economy'), require('./board'))
        : root.MM;

    const DEFAULT_SETTINGS = {
        players: [{ name: 'Player 1', type: 'human' }, { name: 'Player 2', type: 'human' }],
        rounds: 40,               // fixed horizon in quarters; highest real net worth wins
        startingCash: 1500,
        policyMode: 'taylor',     // 'taylor' | 'chair'
        seed: null,
        econ: {},                 // overrides for the Economy parameters
        impulseScale: 0.1,        // pp of output gap per 1% of real wealth borrowed/invested
        loanToValue: 0.5,
        bail: 50,
        auctions: true,
        trading: true,
    };

    const TOKEN_COLORS = ['#e4572e', '#2e86ab', '#3bb273', '#f3a712', '#8e44ad', '#d81b60'];

    class Game {
        constructor(settings = {}) {
            this.s = Object.assign({}, DEFAULT_SETTINGS, settings);
            const seed = this.s.seed === null || this.s.seed === undefined
                ? Math.floor(Math.random() * 2 ** 31) : this.s.seed;
            this.seed = seed;
            this.rng = MM.createRng(seed);
            this.economy = new MM.Economy(this.s.econ, MM.createRng(seed ^ 0x5bd1e995));

            this.squares = MM.SQUARES.map((sq, id) => Object.assign({ id }, sq, {
                owner: null, houses: 0, loan: null, value: sq.price || 0,
            }));
            this.players = this.s.players.map((p, id) => ({
                id, name: p.name || `Player ${id + 1}`, type: p.type || 'human', strategy: p.strategy || null,
                color: TOKEN_COLORS[id % TOKEN_COLORS.length],
                cash: this.s.startingCash, position: 0, inJail: false, jailTries: 0, jailCards: 0,
                bankrupt: false, doublesRun: 0,
            }));
            this.shockDeck = this.rng.shuffle(MM.SHOCK_CARDS.slice());
            this.communityDeck = this.rng.shuffle(MM.COMMUNITY_CARDS.slice());

            this.round = 0;
            this.current = 0;
            this.phase = 'roll';
            this.dice = [1, 1];
            this.rolledDoubles = false;
            this.pendingBuy = null;
            this.pendingAuction = null;
            this.auction = null;
            this.trade = null;
            this.flow = this.newFlow();
            this.log = [];
            this.winner = null;
            this.chair = null;
            this.listeners = [];
            this.revalue();
            this.say(`Game started (seed ${seed}). ${this.s.rounds} quarters; highest real net worth wins.`);
        }

        // ---------- helpers ----------
        on(fn) { this.listeners.push(fn); }
        say(msg, cls = '') {
            const entry = { msg, cls, round: this.round };
            this.log.push(entry);
            this.listeners.forEach(fn => fn(entry));
        }
        get player() { return this.players[this.current]; }
        get pl() { return this.economy.priceLevel; }
        nominal(x) { return Math.round(x * this.pl); }
        activePlayers() { return this.players.filter(p => !p.bankrupt); }
        ownedBy(pid) { return this.squares.filter(sq => sq.owner === pid); }
        houseCost(sq) { return this.nominal(MM.GROUPS[sq.group].houseCost); }
        bailCost() { return this.nominal(this.s.bail); }
        newFlow() { return { borrowed: 0, repaid: 0, built: 0 }; }

        // Property value: indexed to the price level and priced off the long REAL rate,
        // normalised so the steady state reproduces the printed price.
        valueMultiplier(group) {
            const e = this.economy, prem = MM.GROUPS[group].premium;
            const cap = e.realLongRate() + prem + 0.5 * e.spread;
            const m = (e.p.rStar + prem) / Math.max(cap, 0.5 * prem);
            return Math.min(2.5, Math.max(0.4, m));
        }
        revalue() {
            this.squares.forEach(sq => {
                if (sq.price) sq.value = Math.round(sq.price * this.pl * this.valueMultiplier(sq.group));
            });
        }

        groupMembers(group) { return this.squares.filter(sq => sq.group === group); }
        ownsGroup(pid, group) {
            return MM.GROUPS[group] && group !== 'railroad' && group !== 'utility'
                && this.groupMembers(group).every(sq => sq.owner === pid);
        }
        monopolies(pid) {
            return Object.keys(MM.GROUPS).filter(g => this.ownsGroup(pid, g));
        }

        rentFor(sq, diceTotal) {
            if (sq.owner === null) return 0;
            if (sq.type === 'utility') {
                const n = this.ownedBy(sq.owner).filter(s => s.type === 'utility').length;
                return this.nominal((diceTotal || 7) * (n === 2 ? 10 : 4));
            }
            if (sq.type === 'railroad') {
                const n = this.ownedBy(sq.owner).filter(s => s.type === 'railroad').length;
                return this.nominal(sq.rents[n - 1]);
            }
            if (sq.houses > 0) return this.nominal(sq.rents[sq.houses]);
            const base = sq.rents[0] * (this.ownsGroup(sq.owner, sq.group) ? 2 : 1);
            return this.nominal(base);
        }

        loanRate(loan) {
            return loan.kind === 'fixed' ? loan.rate : this.economy.floatingLoanRate();
        }
        debtOf(pid) {
            return this.ownedBy(pid).reduce((s, sq) => s + (sq.loan ? sq.loan.principal : 0), 0);
        }
        netWorth(pid) {
            const p = this.players[pid];
            if (p.bankrupt) return 0;
            const assets = this.ownedBy(pid).reduce((s, sq) =>
                s + sq.value + (sq.houses ? sq.houses * this.houseCost(sq) : 0), 0);
            return p.cash + assets - this.debtOf(pid);
        }
        realNetWorth(pid) { return this.netWorth(pid) / this.pl; }

        // ---------- capability checks (used by UI to enable buttons and by bots) ----------
        canManage(pid) {
            return pid === this.current && (this.phase === 'roll' || this.phase === 'post')
                && !this.players[pid].bankrupt;
        }
        canBuild(pid, sq) {
            if (!this.canManage(pid) || sq.owner !== pid || sq.type !== 'property') return false;
            if (!this.ownsGroup(pid, sq.group) || sq.houses >= 5) return false;
            if (this.players[pid].cash < this.houseCost(sq)) return false;
            const min = Math.min(...this.groupMembers(sq.group).map(s => s.houses));
            return sq.houses === min; // build evenly
        }
        canSellHouse(pid, sq) {
            if (!this.canManage(pid) || sq.owner !== pid || sq.houses === 0) return false;
            const max = Math.max(...this.groupMembers(sq.group).map(s => s.houses));
            return sq.houses === max; // sell evenly
        }
        loanAmount(sq) { return Math.round(sq.value * this.s.loanToValue); }
        canBorrow(pid, sq) { return this.canManage(pid) && sq.owner === pid && !sq.loan; }
        canRepay(pid, sq) {
            return this.canManage(pid) && sq.owner === pid && !!sq.loan && this.players[pid].cash >= sq.loan.principal;
        }

        // ---------- asset management ----------
        build(pid, sqId) {
            const sq = this.squares[sqId];
            if (!this.canBuild(pid, sq)) return false;
            const cost = this.houseCost(sq);
            this.players[pid].cash -= cost;
            sq.houses++;
            this.flow.built += cost / this.pl;
            this.say(`${this.players[pid].name} built a ${sq.houses === 5 ? 'hotel' : 'house'} on ${sq.name} for $${cost}.`);
            return true;
        }
        sellHouse(pid, sqId) {
            const sq = this.squares[sqId];
            if (!this.canSellHouse(pid, sq)) return false;
            this.liquidateHouse(pid, sq);
            return true;
        }
        liquidateHouse(pid, sq) {
            const proceeds = Math.round(this.houseCost(sq) / 2);
            sq.houses--;
            this.players[pid].cash += proceeds;
            this.flow.built -= proceeds / this.pl;
            this.say(`${this.players[pid].name} sold a building on ${sq.name} for $${proceeds}.`);
        }
        borrow(pid, sqId, kind = 'floating') {
            const sq = this.squares[sqId];
            if (!this.canBorrow(pid, sq)) return false;
            this.takeLoan(pid, sq, kind);
            return true;
        }
        takeLoan(pid, sq, kind) {
            const principal = this.loanAmount(sq);
            const rate = kind === 'fixed' ? this.economy.fixedLoanRate() : null;
            sq.loan = { kind, principal, rate };
            this.players[pid].cash += principal;
            this.flow.borrowed += principal / this.pl;
            const rateTxt = kind === 'fixed' ? `fixed at ${rate.toFixed(2)}%` : `floating (now ${this.economy.floatingLoanRate().toFixed(2)}%)`;
            this.say(`${this.players[pid].name} mortgaged ${sq.name} for $${principal}, ${rateTxt}.`);
        }
        repay(pid, sqId) {
            const sq = this.squares[sqId];
            if (!this.canRepay(pid, sq)) return false;
            this.players[pid].cash -= sq.loan.principal;
            this.flow.repaid += sq.loan.principal / this.pl;
            this.say(`${this.players[pid].name} repaid the $${sq.loan.principal} loan on ${sq.name}.`);
            sq.loan = null;
            return true;
        }

        // ---------- turn flow ----------
        rollDice() {
            this.dice = [this.rng.int(1, 6), this.rng.int(1, 6)];
            return this.dice;
        }

        roll() {
            if (this.phase !== 'roll') return false;
            const p = this.player;
            const [a, b] = this.rollDice();
            const total = a + b, doubles = a === b;
            this.say(`${p.name} rolled ${a} + ${b}.`);

            if (p.inJail) {
                p.jailTries++;
                if (doubles) {
                    this.say(`${p.name} rolled doubles and leaves Jail.`);
                    p.inJail = false;
                    this.rolledDoubles = false; // no extra roll after leaving on doubles
                } else if (p.jailTries >= 3) {
                    this.pay(p, this.bailCost(), null, 'bail after three attempts');
                    p.inJail = false;
                    this.rolledDoubles = false;
                    if (p.bankrupt) return this.afterAction();
                } else {
                    this.say(`${p.name} stays in Jail.`);
                    this.rolledDoubles = false;
                    this.phase = 'post';
                    return true;
                }
            } else {
                this.rolledDoubles = doubles;
                if (doubles) {
                    p.doublesRun++;
                    if (p.doublesRun >= 3) {
                        this.say(`${p.name} rolled doubles three times: speeding to Jail!`);
                        this.sendToJail(p);
                        return this.afterAction();
                    }
                }
            }
            this.moveBy(p, total);
            this.land(p, total);
            return this.afterAction();
        }

        payBail() {
            const p = this.player;
            if (this.phase !== 'roll' || !p.inJail) return false;
            if (p.jailCards > 0) {
                p.jailCards--;
                this.say(`${p.name} used a Get Out of Jail Free card.`);
            } else {
                if (p.cash < this.bailCost()) return false;
                this.pay(p, this.bailCost(), null, 'bail');
            }
            p.inJail = false;
            p.jailTries = 0;
            return true; // still in 'roll' phase: now rolls normally
        }

        afterAction() {
            if (this.phase === 'over') return true;
            if (this.player.bankrupt) { this.endTurn(true); return true; }
            if (this.pendingBuy !== null) { this.phase = 'buy'; return true; }
            if (this.pendingAuction !== null) {
                const id = this.pendingAuction;
                this.pendingAuction = null;
                return this.startAuction(id);
            }
            this.phase = 'post';
            return true;
        }

        moveBy(p, steps) {
            const from = p.position;
            p.position = (p.position + steps) % 40;
            if (p.position < from) this.collectGo(p);
        }
        moveTo(p, pos, collect = true) {
            if (collect && pos < p.position) this.collectGo(p);
            p.position = pos;
        }
        collectGo(p) {
            const amt = this.nominal(200);
            p.cash += amt;
            this.say(`${p.name} passed GO and collected $${amt}.`);
        }

        land(p, diceTotal) {
            const sq = this.squares[p.position];
            this.say(`${p.name} landed on ${sq.name}.`);
            switch (sq.type) {
                case 'property': case 'railroad': case 'utility':
                    if (sq.owner === null) {
                        if (p.cash >= sq.value) this.pendingBuy = sq.id;
                        else {
                            this.say(`${p.name} cannot afford ${sq.name} ($${sq.value}).`);
                            this.pendingAuction = sq.id;
                        }
                    } else if (sq.owner !== p.id) {
                        const rent = this.rentFor(sq, diceTotal);
                        this.pay(p, rent, this.players[sq.owner], `rent on ${sq.name}`);
                    }
                    break;
                case 'tax':
                    this.pay(p, this.nominal(sq.amount), null, sq.name);
                    break;
                case 'shock': this.drawShock(p); break;
                case 'community': this.drawCommunity(p, diceTotal); break;
                case 'gotojail': this.sendToJail(p); break;
                default: break;
            }
        }

        buy() {
            if (this.phase !== 'buy') return false;
            const p = this.player, sq = this.squares[this.pendingBuy];
            this.pendingBuy = null;
            if (p.cash < sq.value) { this.phase = 'post'; return false; }
            p.cash -= sq.value;
            sq.owner = p.id;
            this.say(`${p.name} bought ${sq.name} for $${sq.value}.`);
            this.phase = 'post';
            return true;
        }
        pass() {
            if (this.phase !== 'buy') return false;
            const id = this.pendingBuy;
            this.say(`${this.player.name} passed on ${this.squares[id].name}.`);
            this.pendingBuy = null;
            return this.startAuction(id);
        }

        // ---------- auctions ----------
        startAuction(sqId) {
            if (!this.s.auctions) { this.phase = 'post'; return true; }
            const sq = this.squares[sqId];
            this.auction = { sqId, minBid: this.nominal(10), bids: {} };
            this.phase = 'auction';
            this.say(`${sq.name} goes to auction (worth $${sq.value}; minimum bid $${this.auction.minBid}).`, 'economic-event');
            return true;
        }
        // Solvent players who still have to bid, in seat order starting from the current player.
        auctionWaiting() {
            if (this.phase !== 'auction') return [];
            const n = this.players.length, out = [];
            for (let k = 0; k < n; k++) {
                const p = this.players[(this.current + k) % n];
                if (!p.bankrupt && !(p.id in this.auction.bids)) out.push(p.id);
            }
            return out;
        }
        bid(pid, amount) {
            if (this.phase !== 'auction') return false;
            const p = this.players[pid];
            if (!p || p.bankrupt || pid in this.auction.bids) return false;
            let a = Math.floor(Math.min(Number(amount) || 0, p.cash));
            if (a < this.auction.minBid) a = 0;
            this.auction.bids[pid] = a;
            if (this.auctionWaiting().length === 0) this.resolveAuction();
            return true;
        }
        resolveAuction() {
            const a = this.auction, sq = this.squares[a.sqId], n = this.players.length;
            const seatOrder = (pid) => (pid - this.current + n) % n; // ties go to the earlier seat
            const ranked = Object.entries(a.bids).map(([pid, b]) => ({ pid: +pid, b }))
                .filter(x => x.b > 0).sort((x, y) => y.b - x.b || seatOrder(x.pid) - seatOrder(y.pid));
            if (!ranked.length) {
                this.say(`No bids: ${sq.name} stays with the bank.`);
            } else {
                const price = Math.min(ranked[0].b, Math.max(a.minBid, ranked.length > 1 ? ranked[1].b + 1 : a.minBid));
                const w = this.players[ranked[0].pid];
                w.cash -= price;
                sq.owner = w.id;
                this.say(`${w.name} wins the auction for ${sq.name} at $${price}` +
                    (ranked.length > 1 ? ` (next bid $${ranked[1].b}).` : '.'), 'success');
            }
            this.auction = null;
            this.phase = 'post';
        }

        // ---------- trading ----------
        // offer = { from, to, give: [sqIds from -> to], get: [sqIds to -> from], cash }
        // cash > 0: `from` pays `to`; cash < 0: `to` pays `from`. Loans travel with their lots.
        canTradeLot(pid, sq) {
            return !!sq && sq.owner === pid && !!sq.price && this.groupMembers(sq.group).every(s => s.houses === 0);
        }
        tradeError(o) {
            if (!this.s.trading) return 'Trading is off.';
            if (!o || o.from !== this.current || !(this.phase === 'roll' || this.phase === 'post' || this.phase === 'trade')) return 'You can only trade on your own turn.';
            const A = this.players[o.from], B = this.players[o.to];
            if (!B || o.from === o.to || A.bankrupt || B.bankrupt) return 'Pick another solvent player.';
            const give = o.give || [], get = o.get || [], cash = Math.round(o.cash || 0);
            if (!give.length && !get.length) return 'A trade must include at least one property.';
            if (give.some(id => !this.canTradeLot(o.from, this.squares[id]))) return 'You can only offer your own lots, with no buildings in their colour group.';
            if (get.some(id => !this.canTradeLot(o.to, this.squares[id]))) return `You can only ask for ${B.name}'s lots with no buildings in their colour group.`;
            if (cash > 0 && A.cash < cash) return `${A.name} doesn't have $${cash}.`;
            if (cash < 0 && B.cash < -cash) return `${B.name} doesn't have $${-cash}.`;
            return null;
        }
        describeTrade(o) {
            const names = (ids) => ids.map(id => this.squares[id].name + (this.squares[id].loan
                ? ` (with its $${this.squares[id].loan.principal} ${this.squares[id].loan.kind} loan)` : '')).join(', ');
            const A = this.players[o.from].name, B = this.players[o.to].name, parts = [];
            if (o.give && o.give.length) parts.push(`${A} gives ${names(o.give)}`);
            if (o.get && o.get.length) parts.push(`${B} gives ${names(o.get)}`);
            if (o.cash > 0) parts.push(`${A} pays $${o.cash}`);
            if (o.cash < 0) parts.push(`${B} pays $${-o.cash}`);
            return parts.join('; ');
        }
        proposeTrade(offer) {
            const o = { from: offer.from, to: offer.to, give: (offer.give || []).slice(), get: (offer.get || []).slice(), cash: Math.round(offer.cash || 0) };
            const err = this.phase === 'trade' ? 'A trade is already pending.' : this.tradeError(o);
            this.lastTradeError = err;
            if (err) return false;
            this.trade = Object.assign(o, { returnPhase: this.phase });
            this.phase = 'trade';
            this.say(`Trade offer to ${this.players[o.to].name}: ${this.describeTrade(o)}.`, 'card-draw');
            return true;
        }
        respondTrade(accept) {
            if (this.phase !== 'trade') return false;
            const o = this.trade;
            const err = accept ? this.tradeError(o) : null;
            this.phase = o.returnPhase;
            this.trade = null;
            this.lastTrade = { offer: o, accepted: !!accept && !err, round: this.round };
            if (!accept || err) {
                this.say(`${this.players[o.to].name} rejected the trade${err ? ` (${err})` : ''}.`);
                return true;
            }
            const A = this.players[o.from], B = this.players[o.to];
            o.give.forEach(id => { this.squares[id].owner = B.id; });
            o.get.forEach(id => { this.squares[id].owner = A.id; });
            A.cash -= o.cash;
            B.cash += o.cash;
            this.say(`Trade done: ${this.describeTrade(o)}.`, 'success');
            return true;
        }

        sendToJail(p) {
            this.say(`${p.name} goes to Jail!`, 'warning');
            p.position = 10;
            p.inJail = true;
            p.jailTries = 0;
            p.doublesRun = 0;
            if (p.id === this.current) this.rolledDoubles = false;
        }

        drawShock(p) {
            const card = this.shockDeck.shift();
            this.shockDeck.push(card);
            this.say(`${p.name} drew an Exogenous Shock: "${card.text}"`, 'economic-event');
            this.economy.addShock(card.kind, card.size, card.rho);
        }

        drawCommunity(p, diceTotal) {
            const card = this.communityDeck.shift();
            this.communityDeck.push(card);
            this.say(`${p.name} drew Community Treasury: "${card.text}"`, 'card-draw');
            const others = this.activePlayers().filter(o => o.id !== p.id);
            switch (card.action) {
                case 'move_to':
                    this.moveTo(p, card.position);
                    this.land(p, diceTotal);
                    break;
                case 'get_cash': p.cash += this.nominal(card.amount); break;
                case 'pay_cash': this.pay(p, this.nominal(card.amount), null, 'card'); break;
                case 'jail_card': p.jailCards++; break;
                case 'go_to_jail': this.sendToJail(p); break;
                case 'get_from_players':
                    others.forEach(o => this.pay(o, this.nominal(card.amount), p, 'card'));
                    break;
                case 'repairs': {
                    let cost = 0;
                    this.ownedBy(p.id).forEach(sq => {
                        cost += sq.houses === 5 ? card.hotel : sq.houses * card.house;
                    });
                    if (cost > 0) this.pay(p, this.nominal(cost), null, 'repairs');
                    break;
                }
            }
        }

        // Pay `amount` to `creditor` (a player, or the bank when null). Raises cash if needed;
        // goes bankrupt if it cannot.
        pay(p, amount, creditor, why) {
            if (amount <= 0 || p.bankrupt) return;
            if (p.cash < amount) this.raiseCash(p, amount);
            const paid = Math.min(amount, Math.max(p.cash, 0));
            p.cash -= amount;
            if (creditor) creditor.cash += paid;
            this.say(`${p.name} paid $${amount}${creditor ? ` to ${creditor.name}` : ''} (${why}).`);
            if (p.cash < 0) this.declareBankrupt(p, creditor);
        }

        // Forced liquidation: sell buildings evenly, then mortgage unencumbered lots (floating).
        raiseCash(p, need) {
            const owned = () => this.ownedBy(p.id);
            while (p.cash < need) {
                const withHouses = owned().filter(sq => sq.houses > 0)
                    .filter(sq => sq.houses === Math.max(...this.groupMembers(sq.group).map(s => s.houses)))
                    .sort((a, b) => b.houses - a.houses);
                if (withHouses.length) { this.liquidateHouse(p.id, withHouses[0]); continue; }
                const free = owned().filter(sq => !sq.loan).sort((a, b) => a.value - b.value);
                if (free.length) {
                    this.say(`${p.name} is forced to borrow.`, 'warning');
                    this.takeLoan(p.id, free[0], 'floating');
                    continue;
                }
                break;
            }
        }

        declareBankrupt(p, creditor) {
            p.bankrupt = true;
            this.say(`${p.name} is bankrupt and out of the game!`, 'error');
            this.ownedBy(p.id).forEach(sq => {
                sq.houses = 0;
                if (creditor) {
                    sq.owner = creditor.id; // creditor takes the lots along with their loans
                } else {
                    sq.owner = null;
                    sq.loan = null;
                }
            });
            p.cash = 0;
            if (creditor) this.say(`${creditor.name} takes over ${p.name}'s properties (and their loans).`);
            if (this.activePlayers().length <= 1) this.finish();
        }

        endTurn(force = false) {
            if (this.phase === 'over') return false;
            if (!force && this.phase !== 'post') return false;
            const p = this.player;
            if (!force && this.rolledDoubles && !p.inJail && !p.bankrupt) {
                this.say(`${p.name} rolled doubles and goes again.`);
                this.phase = 'roll';
                return true;
            }
            p.doublesRun = 0;
            this.rolledDoubles = false;
            this.pendingBuy = null;

            // advance to the next solvent player; wrapping past the last seat closes the quarter
            let next = this.current, wrapped = false;
            do {
                next = (next + 1) % this.players.length;
                if (next === 0) wrapped = true;
            } while (this.players[next].bankrupt && next !== this.current);
            this.current = next;
            if (wrapped || this.activePlayers().length === 1) this.closeRound();
            else this.phase = 'roll';
            return true;
        }

        // ---------- end of quarter ----------
        closeRound() {
            const e = this.economy;
            const active = this.activePlayers();

            // 1. interest on cash and on loans, at this quarter's rates
            active.forEach(p => {
                if (p.cash > 0) {
                    const earned = Math.round(p.cash * e.i / 400);
                    if (earned > 0) p.cash += earned;
                }
                const interest = Math.round(this.ownedBy(p.id).reduce((s, sq) =>
                    s + (sq.loan ? sq.loan.principal * this.loanRate(sq.loan) / 400 : 0), 0));
                if (interest > 0) this.pay(p, interest, null, 'loan interest');
            });
            if (this.phase === 'over') return;

            // 2. players' credit/investment impulse feeds the output gap (the GE feedback)
            const wealth = Math.max(1, this.activePlayers().reduce((s, p) => s + Math.max(0, this.realNetWorth(p.id)), 0));
            const f = this.flow;
            const raw = 100 * (f.borrowed - f.repaid + f.built) / wealth;
            this.impulse = Math.max(-1.5, Math.min(1.5, this.s.impulseScale * raw));
            this.flow = this.newFlow();

            const taylor = e.advance(this.impulse);
            if (this.s.policyMode === 'chair') {
                this.chair = this.activePlayers()[this.round % this.activePlayers().length].id;
                this.taylorRecommendation = taylor;
                this.phase = 'policy';
                this.say(`Quarter ${this.round + 1} closed. ${this.players[this.chair].name} chairs the central bank this quarter.`, 'economic-event');
                return;
            }
            this.finishRound(null);
        }

        setPolicy(rate) {
            if (this.phase !== 'policy') return false;
            this.finishRound(rate);
            return true;
        }

        finishRound(rate) {
            const e = this.economy;
            e.setPolicy(rate);
            this.revalue();
            this.round++;
            const c = e.lastCalc;
            this.say(`Q${this.round}: inflation ${e.pi.toFixed(2)}%, output gap ${e.y.toFixed(2)}%, policy rate ${e.i.toFixed(2)}%` +
                (c.overridden ? ` (rule said ${c.taylor.toFixed(2)}%)` : '') + '.', 'economic-event');
            if (this.round >= this.s.rounds) return this.finish();
            // a player can go bankrupt on interest at quarter end; skip their seat
            while (this.player.bankrupt) this.current = (this.current + 1) % this.players.length;
            this.phase = 'roll';
        }

        finish() {
            this.phase = 'over';
            const ranking = this.players.map(p => ({ id: p.id, name: p.name, real: this.realNetWorth(p.id) }))
                .sort((a, b) => b.real - a.real);
            this.ranking = ranking;
            this.winner = ranking[0].id;
            this.say(`Game over! ${ranking[0].name} wins with real net worth $${Math.round(ranking[0].real)}.`, 'success');
        }
    }

    const api = { Game, DEFAULT_GAME_SETTINGS: DEFAULT_SETTINGS };
    if (isNode) module.exports = api;
    else root.MM = Object.assign(root.MM || {}, api);
})(typeof self !== 'undefined' ? self : this);
