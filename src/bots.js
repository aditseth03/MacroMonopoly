// bots.js - computer players. Each strategy is a function (game, player) -> performs exactly
// one action through the public Game API. The UI and the simulator call act() repeatedly.
//
//   naive    : classic Monopoly instincts; ignores the macroeconomy, never borrows voluntarily.
//   macro    : reads the central bank's forecast. Borrows to build, picks fixed vs floating by
//              where rates are headed, refinances, and avoids buying rate-sensitive lots at the top.
//   leverage : borrows floating against everything to buy and build as fast as possible.
(function (root) {
    'use strict';

    const isNode = typeof module === 'object' && module.exports;
    const MM = isNode ? Object.assign({}, require('./board')) : root.MM;

    // ---------- shared helpers ----------
    function forecastFor(game) {
        // one forecast per quarter, shared by all bots
        if (!game._botForecast || game._botForecast.round !== game.round) {
            const fc = game.economy.forecast(8, 60);
            const meanI = fc.i.reduce((s, x) => s + x.p50, 0) / fc.i.length;
            game._botForecast = { round: game.round, fc, meanI };
        }
        return game._botForecast;
    }
    const expectedFloating = (game) => forecastFor(game).meanI + 2.0 + game.economy.spread;

    function buildAll(game, p, reserve, mayBorrow, chooseKind) {
        // build evenly across monopolies, cheapest houses first
        const targets = game.monopolies(p.id).flatMap(g => game.groupMembers(g))
            .filter(sq => sq.houses < 5)
            .sort((a, b) => a.houses - b.houses || game.houseCost(a) - game.houseCost(b));
        for (const sq of targets) {
            if (!game.canManage(p.id)) return false;
            const cost = game.houseCost(sq);
            if (p.cash - cost >= reserve && game.canBuild(p.id, sq)) return game.build(p.id, sq.id);
            if (mayBorrow && p.cash < cost + reserve) {
                // borrow against an unencumbered lot, preferring ones without houses
                const collateral = game.ownedBy(p.id).filter(s => !s.loan)
                    .sort((a, b) => (a.houses - b.houses) || (b.value - a.value))[0];
                if (collateral) return game.borrow(p.id, collateral.id, chooseKind(game));
            }
        }
        return false;
    }

    function jailDecision(game, p, stayLate) {
        if (!p.inJail) return false;
        const late = game.round > game.s.rounds * 0.5;
        if (stayLate && late && p.jailCards === 0) return false; // sit in jail, dodge rents
        if (p.jailCards > 0 || p.cash > game.bailCost() * 4) return game.payBail();
        return false;
    }


    // ---------- valuation, auctions and trading ----------
    // How much a bot thinks a portfolio is worth, for an arbitrary ownership map `owners`
    // (sqId -> player id or null). Equity in each lot, plus a premium for complete colour groups
    // (they unlock building), minus a penalty for every group an opponent completes. Both shrink
    // as the game nears its end. A macro-aware bot also values a fixed-rate loan that is cheaper
    // than today's fixed rate (assuming it is like being paid the rate gap for two years).
    const COLOR_GROUPS = ['brown', 'light-blue', 'pink', 'orange', 'red', 'yellow', 'green', 'dark-blue'];
    const PROFILES = {
        naive: { aware: false, reserve: 150, bidScale: 0.9 },
        macro: { aware: true, reserve: 100, bidScale: 1.0 },
        macroBlind: { aware: false, reserve: 100, bidScale: 1.0 },
        leverage: { aware: false, reserve: 50, bidScale: 1.0 },
    };
    const profileOf = (p) => PROFILES[p.strategy] || PROFILES.naive;

    function portfolioValue(game, pid, owners, aware) {
        const tl = Math.max(0.2, Math.min(1, (game.s.rounds - game.round) / 20));
        const fixedNow = game.economy.fixedLoanRate();
        let v = 0, railroads = 0;
        game.squares.forEach(sq => {
            if (!sq.price || owners[sq.id] !== pid) return;
            v += sq.value + sq.houses * game.houseCost(sq);
            if (sq.loan) {
                v -= sq.loan.principal;
                if (aware && sq.loan.kind === 'fixed') v += sq.loan.principal * (fixedNow - sq.loan.rate) / 100 * 2;
            }
            if (sq.type === 'railroad') railroads++;
        });
        if (railroads >= 2) v += 0.1 * railroads * game.nominal(200) * tl;
        COLOR_GROUPS.forEach(g => {
            const members = game.groupMembers(g);
            const worth = members.reduce((s, sq) => s + game.nominal(sq.price), 0);
            const holder = owners[members[0].id];
            if (holder === null || holder === undefined || !members.every(sq => owners[sq.id] === holder)) return;
            if (holder === pid) v += 1.2 * worth * tl;
            else if (!game.players[holder].bankrupt) v -= 0.7 * worth * tl;
        });
        return v;
    }
    const currentOwners = (game) => game.squares.map(sq => sq.owner);
    function ownersAfter(game, o) {
        const owners = currentOwners(game);
        o.give.forEach(id => { owners[id] = o.to; });
        o.get.forEach(id => { owners[id] = o.from; });
        return owners;
    }
    // Value change of a trade for one side, excluding cash.
    function tradeGain(game, pid, o, aware) {
        const before = portfolioValue(game, pid, currentOwners(game), aware);
        return portfolioValue(game, pid, ownersAfter(game, o), aware) - before;
    }
    const tradeMargin = (game, pid, o) => {
        const given = (pid === o.from ? o.give : o.get).reduce((s, id) => s + game.squares[id].value, 0);
        return game.nominal(15) + 0.05 * given;
    };
    // Cash the recipient must receive (negative: may pay) before it accepts, under its valuation.
    function requiredCash(game, o, aware) {
        return tradeMargin(game, o.to, o) - tradeGain(game, o.to, o, aware);
    }
    function wouldAccept(game, o, aware) {
        return o.cash >= requiredCash(game, o, aware);
    }
    // For the UI: what a bot recipient would need to accept an offer (cash from proposer).
    function tradeQuote(game, o) {
        const q = game.players[o.to];
        const need = Math.ceil(requiredCash(game, Object.assign({ cash: 0 }, o), profileOf(q).aware));
        return { needCash: need, accepts: (o.cash || 0) >= need };
    }

    function auctionBid(game, p) {
        const prof = profileOf(p), id = game.auction.sqId;
        const without = currentOwners(game), withIt = currentOwners(game);
        withIt[id] = p.id;
        const marginal = portfolioValue(game, p.id, withIt, prof.aware) - portfolioValue(game, p.id, without, prof.aware);
        const cap = p.cash - game.nominal(prof.reserve);
        return Math.max(0, Math.floor(Math.min(marginal * prof.bidScale, cap)));
    }

    // Look for one deal that completes a colour group for `p`; propose it if it pays.
    function tryTrade(game, p) {
        if (!game.s.trading || !game.canManage(p.id)) return false;
        game._tradeTried = game._tradeTried || {};
        const key = `${p.id}:${game.round}`;
        if (game._tradeTried[key]) return false;
        game._tradeTried[key] = true;
        game._askedHuman = game._askedHuman || {};

        const prof = profileOf(p), reserve = game.nominal(prof.reserve);
        const tradeable = (pid) => game.squares.filter(sq => game.canTradeLot(pid, sq));
        let best = null;
        for (const g of COLOR_GROUPS) {
            const members = game.groupMembers(g);
            if (!members.some(sq => sq.owner === p.id)) continue;
            const missing = members.filter(sq => sq.owner !== p.id);
            const holders = [...new Set(missing.map(sq => sq.owner))];
            if (holders.length !== 1 || holders[0] === null) continue;
            const q = game.players[holders[0]];
            if (q.bankrupt || !missing.every(sq => game.canTradeLot(q.id, sq))) continue;
            if (q.type === 'human' && game._askedHuman[`${p.id}>${q.id}:${g}`] > game.round - 4) continue;

            // what p could give: nothing, a set that completes one of q's groups, or one stray lot
            const mine = tradeable(p.id).filter(sq => sq.group !== g);
            const sweeteners = [[]];
            COLOR_GROUPS.filter(h => h !== g).forEach(h => {
                const hm = game.groupMembers(h), lack = hm.filter(sq => sq.owner !== q.id);
                if (hm.some(sq => sq.owner === q.id) && lack.length && lack.every(sq => mine.includes(sq))) sweeteners.push(lack.map(sq => sq.id));
            });
            mine.filter(sq => game.groupMembers(sq.group).filter(s => s.owner === p.id).length === 1)
                .forEach(sq => sweeteners.push([sq.id]));

            for (const give of sweeteners) {
                const o = { from: p.id, to: q.id, give, get: missing.map(sq => sq.id), cash: 0 };
                // humans get a bot's proxy valuation plus a sweetener so offers aren't insulting
                const qAware = q.type === 'human' ? false : profileOf(q).aware;
                let cash = requiredCash(game, o, qAware);
                if (q.type === 'human') cash += Math.abs(cash) * 0.1 + game.nominal(20);
                cash = Math.ceil(cash);
                if (cash < 0 && q.cash < -cash) continue;
                if (cash > p.cash - reserve) continue;
                o.cash = cash;
                const net = tradeGain(game, p.id, o, prof.aware) - cash;
                if (net < tradeMargin(game, p.id, o)) continue;
                if (!best || net > best.net) best = { o, net, g, q };
            }
        }
        if (!best) return false;
        if (best.q.type === 'human') game._askedHuman[`${p.id}>${best.q.id}:${best.g}`] = game.round;
        return game.proposeTrade(best.o);
    }

    // The macro bot. With rateAware=false it keeps the same build/borrow/jail/reserve habits but
    // ignores the forecast (always floating, no refinancing, no rate-aware buying): an ablation
    // that isolates how much reading the macroeconomy is worth.
    function makeMacro(rateAware) {
        return function macro(game, p) {
            const e = game.economy;
            const reserve = game.nominal(100);
            const fc = forecastFor(game);
            const ratesRising = fc.meanI > e.i + 0.5;
            const chooseKind = (g) => (rateAware && g.economy.fixedLoanRate() < expectedFloating(g) + 0.25 ? 'fixed' : 'floating');
            switch (game.phase) {
                case 'roll':
                    if (jailDecision(game, p, true)) return true;
                    return game.roll();
                case 'buy': {
                    const sq = game.squares[game.pendingBuy];
                    const members = game.groupMembers(sq.group);
                    const mineOrFree = members.every(s => s.owner === null || s.owner === p.id);
                    const rich = game.valueMultiplier(sq.group) > 1.15 && ratesRising;
                    // skip lots priced off unusually low real rates when rates are about to rise,
                    // unless the lot keeps a monopoly in reach
                    if (rateAware && rich && !mineOrFree) return game.pass();
                    return p.cash - sq.value >= reserve ? game.buy() : game.pass();
                }
                case 'post': {
                    if (buildAll(game, p, reserve, true, chooseKind)) return true;
                    const loans = game.ownedBy(p.id).filter(sq => sq.loan);
                    // refinance floating into fixed when rates are headed up
                    const fixedNow = e.fixedLoanRate(), floatAhead = expectedFloating(game);
                    for (const sq of rateAware ? loans : []) {
                        if (sq.loan.kind === 'floating' && fixedNow + 0.5 < floatAhead && p.cash >= sq.loan.principal + reserve) {
                            game.repay(p.id, sq.id);
                            return game.borrow(p.id, sq.id, 'fixed');
                        }
                        if (sq.loan.kind === 'fixed' && sq.loan.rate > floatAhead + 1.0 && p.cash >= sq.loan.principal + reserve) {
                            game.repay(p.id, sq.id);
                            return game.borrow(p.id, sq.id, 'floating');
                        }
                    }
                    // pay down the most expensive debt with idle cash, unless monopolies still need building
                    const stillBuilding = game.monopolies(p.id).some(g => game.groupMembers(g).some(s => s.houses < 5));
                    if (!stillBuilding) {
                        const dear = loans.filter(sq => p.cash >= sq.loan.principal + reserve * 2)
                            .sort((a, b) => game.loanRate(b.loan) - game.loanRate(a.loan))[0];
                        // keep cheap fixed debt that inflation is eroding
                        if (dear && (!rateAware || game.loanRate(dear.loan) > e.pi + 1.5)) return game.repay(p.id, dear.id);
                    }
                    if (tryTrade(game, p)) return true;
                    return game.endTurn();
                }
            }
            return false;
        };
    }

    // ---------- strategies ----------
    const STRATEGIES = {
        naive(game, p) {
            const reserve = game.nominal(150);
            switch (game.phase) {
                case 'roll':
                    if (jailDecision(game, p, false)) return true;
                    return game.roll();
                case 'buy': {
                    const sq = game.squares[game.pendingBuy];
                    return p.cash - sq.value >= reserve ? game.buy() : game.pass();
                }
                case 'post': {
                    if (buildAll(game, p, game.nominal(200), false)) return true;
                    const loan = game.ownedBy(p.id).find(sq => sq.loan && p.cash > sq.loan.principal * 3 + reserve);
                    if (loan) return game.repay(p.id, loan.id);
                    if (tryTrade(game, p)) return true;
                    return game.endTurn();
                }
            }
            return false;
        },

        macro: makeMacro(true),
        leverage(game, p) {

            const reserve = game.nominal(50);
            switch (game.phase) {
                case 'roll':
                    if (jailDecision(game, p, false)) return true;
                    return game.roll();
                case 'buy': {
                    const sq = game.squares[game.pendingBuy];
                    return p.cash - sq.value >= reserve ? game.buy() : game.pass();
                }
                case 'post': {
                    if (buildAll(game, p, reserve, true, () => 'floating')) return true;
                    // lever up: keep every lot mortgaged so cash is ready for the next purchase
                    const free = game.ownedBy(p.id).find(s => !s.loan && p.cash < game.nominal(400));
                    if (free) return game.borrow(p.id, free.id, 'floating');
                    if (tryTrade(game, p)) return true;
                    return game.endTurn();
                }
            }
            return false;
        },
    };

    // Fed Chair decisions for bot chairs: follow the rule.
    function chairDecision(game) {
        return game.setPolicy(game.taylorRecommendation);
    }

    // Perform one action for whoever must act now. Returns false if a human must act.
    function act(game) {
        if (game.phase === 'over') return false;
        if (game.phase === 'auction') {
            const bots = game.auctionWaiting().filter(pid => game.players[pid].type !== 'human');
            if (!bots.length) return false;
            const p = game.players[bots[0]];
            return game.bid(p.id, auctionBid(game, p));
        }
        if (game.phase === 'trade') {
            const q = game.players[game.trade.to];
            if (q.type === 'human') return false;
            return game.respondTrade(wouldAccept(game, game.trade, profileOf(q).aware));
        }
        if (game.phase === 'policy') {
            const chair = game.players[game.chair];
            if (chair.type === 'human') return false;
            return chairDecision(game);
        }
        const p = game.player;
        if (p.type === 'human') return false;
        const strat = STRATEGIES[p.strategy || 'naive'];
        const ok = strat(game, p);
        if (!ok && game.phase === 'post') return game.endTurn(); // never stall
        if (!ok && game.phase === 'roll') return game.roll();
        if (!ok && game.phase === 'buy') return game.pass();
        return ok;
    }

    const api = { STRATEGIES, act, makeMacro, tradeQuote, portfolioValue, BOT_NAMES: Object.keys(STRATEGIES) };
    if (isNode) module.exports = api;
    else root.MM = Object.assign(root.MM || {}, api);
})(typeof self !== 'undefined' ? self : this);
