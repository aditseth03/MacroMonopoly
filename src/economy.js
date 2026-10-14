// economy.js - the macro engine: a 3-equation New Keynesian model with hybrid
// (credibility-weighted) expectations, a zero lower bound and typed, persistent shocks.
//
// Units: every rate (inflation, interest, real rate, spread) is ANNUALISED PERCENT.
// The output gap is percent of potential. One game round = one quarter.
//
//   Expectations   pe_t = c_t * pi* + (1 - c_t) * pi_{t-1}
//   IS curve       y_t  = rho_y * y_{t-1} - sigma * (i_{t-1} - pe_t - r*) - sigma_f * s_t + d_t + g_t + e_y
//   Phillips       pi_t = pe_t + kappa * y_t + u_t + e_pi
//   Taylor rule    i_t  = max(0, rho_i * i_{t-1} + (1 - rho_i) * [r* + pi_t + phi_pi (pi_t - pi*) + phi_y y_t])
//
//   d_t demand shocks, u_t supply (cost-push) shocks, s_t credit spread (financial shocks),
//   g_t the players' own credit/investment impulse (the "general equilibrium" feedback),
//   c_t central-bank credibility, which rises while inflation is near target and falls when it
//   is not (or when a human Fed Chair ignores the rule).
(function (root) {
    'use strict';

    const DEFAULT_PARAMS = {
        piStar: 2.0,      // inflation target
        rStar: 2.0,       // neutral real rate
        rhoY: 0.75,       // output-gap persistence
        sigma: 0.25,      // gap response to the real-rate gap (per quarter)
        sigmaF: 0.35,     // gap response to the credit spread
        kappa: 0.20,      // Phillips-curve slope
        phiPi: 1.5,       // Taylor rule: inflation response
        phiY: 0.5,        // Taylor rule: output-gap response
        rhoI: 0.5,        // interest-rate smoothing
        rhoL: 0.8,        // long rate = slow-moving average of the policy rate
        rhoS: 0.6,        // credit-spread decay
        sdY: 0.5,         // demand noise
        sdPi: 0.3,        // inflation noise
        credInit: 0.7,
        credMin: 0.1,
        credMax: 0.95,
    };

    // Shock cards push entries onto a queue; each one decays geometrically.
    //   kind: 'demand' | 'supply' | 'financial'
    function makeShock(kind, size, rho = 0.6, quarters = 6) {
        return { kind, size, rho, quarters, age: 0 };
    }

    class Economy {
        constructor(params = {}, rng = null) {
            this.p = Object.assign({}, DEFAULT_PARAMS, params);
            this.rng = rng;
            const p = this.p;
            this.round = 0;
            this.y = 0;
            this.pi = p.piStar;
            this.pe = p.piStar;
            this.i = p.rStar + p.piStar;
            this.iL = this.i;
            this.spread = 0;
            this.cred = p.credInit;
            this.priceLevel = 1;
            this.shocks = [];
            this.lastImpulse = 0;
            this.lastCalc = null;
            this.pending = null; // set between advance() and setPolicy()
            this.history = [this.snapshot()];
        }

        snapshot() {
            return {
                round: this.round, y: this.y, pi: this.pi, pe: this.pe, i: this.i, iL: this.iL,
                spread: this.spread, cred: this.cred, priceLevel: this.priceLevel, impulse: this.lastImpulse,
            };
        }

        addShock(kind, size, rho, quarters) {
            if (kind === 'credibility') return this.adjustCredibility(size);
            if (kind === 'none' || !size) return;
            this.shocks.push(makeShock(kind, size, rho, quarters));
        }

        adjustCredibility(delta) {
            this.cred = Math.min(this.p.credMax, Math.max(this.p.credMin, this.cred + delta));
        }

        // Ex-ante long real rate, used for asset pricing and loan pricing.
        realLongRate() { return this.iL - this.pe; }

        floatingLoanRate() { return this.i + 2.0 + this.spread; }
        fixedLoanRate() { return this.iL + 2.5 + this.spread; }

        taylorRate(pi, y) {
            const p = this.p;
            const target = p.rStar + pi + p.phiPi * (pi - p.piStar) + p.phiY * y;
            return Math.max(0, p.rhoI * this.i + (1 - p.rhoI) * target);
        }

        // Stage 1 of a round: realise this quarter's output and inflation given LAST quarter's
        // policy rate. Returns the Taylor-rule recommendation for stage 2.
        advance(impulse = 0) {
            if (this.pending) throw new Error('advance() called twice without setPolicy()');
            const p = this.p;
            const noise = (sd) => (this.rng ? this.rng.normal(0, sd) : 0);

            let d = 0, u = 0, f = 0;
            for (const s of this.shocks) {
                const v = s.size * Math.pow(s.rho, s.age);
                if (s.kind === 'demand') d += v;
                else if (s.kind === 'supply') u += v;
                else if (s.kind === 'financial') f += v;
                s.age++;
            }
            this.shocks = this.shocks.filter(s => s.age < s.quarters);

            const prev = { y: this.y, pi: this.pi, i: this.i };
            const spread = p.rhoS * this.spread + f;
            const pe = this.cred * p.piStar + (1 - this.cred) * prev.pi;
            const realGap = prev.i - pe - p.rStar;
            const eY = noise(p.sdY), ePi = noise(p.sdPi);
            const y = p.rhoY * prev.y - p.sigma * realGap - p.sigmaF * spread + d + impulse + eY;
            const pi = pe + p.kappa * y + u + ePi;
            const taylor = this.taylorRate(pi, y);

            this.pending = { prev, y, pi, pe, spread, d, u, f, eY, ePi, realGap, impulse, taylor };
            return taylor;
        }

        // Stage 2: set the policy rate (defaults to the Taylor rule) and roll the state forward.
        setPolicy(rate = null) {
            const q = this.pending;
            if (!q) throw new Error('setPolicy() called before advance()');
            const p = this.p;
            const i = rate === null ? q.taylor : Math.max(0, rate);

            // Credibility: earned by keeping inflation near target, lost by missing it
            // or by overriding the rule.
            const miss = Math.abs(q.pi - p.piStar);
            let dc = miss < 1 ? 0.03 : -0.04 * Math.min(miss - 1, 3);
            dc -= 0.05 * Math.min(Math.abs(i - q.taylor), 4);
            this.cred = Math.min(p.credMax, Math.max(p.credMin, this.cred + dc));

            this.y = q.y;
            this.pi = q.pi;
            this.pe = q.pe;
            this.spread = q.spread;
            this.i = i;
            this.iL = p.rhoL * this.iL + (1 - p.rhoL) * i;
            this.priceLevel *= 1 + q.pi / 400;
            this.lastImpulse = q.impulse;
            this.round++;
            this.lastCalc = Object.assign({}, q, { i, taylor: q.taylor, overridden: rate !== null });
            this.pending = null;
            this.history.push(this.snapshot());
            return this.snapshot();
        }

        step(impulse = 0, rate = null) {
            this.advance(impulse);
            return this.setPolicy(rate);
        }

        // Deep copy that shares parameters but gets its own RNG (for forecasts / what-ifs).
        clone(rng = null) {
            const e = new Economy(this.p, rng);
            Object.assign(e, {
                round: this.round, y: this.y, pi: this.pi, pe: this.pe, i: this.i, iL: this.iL,
                spread: this.spread, cred: this.cred, priceLevel: this.priceLevel,
                shocks: this.shocks.map(s => Object.assign({}, s)), lastImpulse: this.lastImpulse,
            });
            e.history = [e.snapshot()];
            return e;
        }

        // Monte Carlo fan chart: median and 10th/90th percentiles of inflation, policy rate and
        // output gap over the next `horizon` quarters, assuming the Taylor rule and no player impulse.
        forecast(horizon = 8, paths = 200, seed = 12345) {
            const createRng = (typeof module === 'object' && module.exports)
                ? require('./rng').createRng : root.MM.createRng;
            const rng = createRng(seed + this.round * 7919);
            const keys = ['pi', 'i', 'y'];
            const draws = keys.reduce((o, k) => (o[k] = Array.from({ length: horizon }, () => []), o), {});
            for (let n = 0; n < paths; n++) {
                const e = this.clone(rng);
                for (let h = 0; h < horizon; h++) {
                    e.step(0);
                    keys.forEach(k => draws[k][h].push(e[k]));
                }
            }
            const pct = (arr, q) => {
                const s = arr.slice().sort((a, b) => a - b);
                return s[Math.min(s.length - 1, Math.floor(q * s.length))];
            };
            const out = {};
            keys.forEach(k => {
                out[k] = draws[k].map(a => ({ p10: pct(a, 0.1), p50: pct(a, 0.5), p90: pct(a, 0.9) }));
            });
            return out;
        }
    }

    const api = { Economy, DEFAULT_ECON_PARAMS: DEFAULT_PARAMS };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MM = Object.assign(root.MM || {}, api);
})(typeof self !== 'undefined' ? self : this);
