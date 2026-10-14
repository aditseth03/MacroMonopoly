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

    const api = { STRATEGIES, act, makeMacro, BOT_NAMES: Object.keys(STRATEGIES) };
    if (isNode) module.exports = api;
    else root.MM = Object.assign(root.MM || {}, api);
})(typeof self !== 'undefined' ? self : this);
