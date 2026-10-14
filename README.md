# Macro Monopoly

Monopoly with a live macroeconomy. Inflation, interest rates and the business cycle change what the right
move is: when to buy, when to borrow, whether to lock a fixed rate or float, and when to sit on cash.

Open `index.html` in a browser (double-click works; no build step or server needed). Seat any mix of humans
and bots, then play.

## How a game works

- **One round of turns = one quarter.** The game runs for a fixed number of quarters (default 40, i.e. ten
  years). **The winner has the highest _real_ net worth**: cash + property + buildings − loans, deflated by
  the price level. Going bankrupt knocks you out early.
- Classic Monopoly rules otherwise: rent tables, houses and hotels on full colour groups (built evenly),
  double rent on unimproved monopolies, doubles roll again, three doubles send you to Jail, and bail or three
  tries to roll out of Jail.

### What the economy does to you

| Lever | Effect in the game |
|---|---|
| **Price level** | GO, rents, house costs, taxes, bail and Community Treasury amounts all scale with it. Cash loses real value when inflation runs. |
| **Real long rate** | Property values are priced like assets: `value = printed price × price level × (r* + premium) / (real long rate + premium + ½·credit spread)`. Rate rises cut values, and long-duration (low-premium) groups like Dark Blue swing hardest. Brown barely moves. |
| **Policy rate** | Cash earns it every quarter. **Floating loans** pay policy rate + 2% + credit spread, reset each quarter. |
| **Long rate** | **Fixed loans** lock long rate + 2.5% + spread for the life of the loan, so inflation erodes the real debt. |
| **Credit spread** | Financial shocks widen it: loans cost more and property values fall. |

**Loans (mortgages)** borrow 50% of a lot's current value. Unlike classic Monopoly, a mortgaged lot keeps
earning rent: it's a real loan, not a sale. Interest is charged every quarter. If you can't pay, buildings are
sold, then more lots are mortgaged, and then you're bankrupt. A bankrupt player's lots (and their loans) pass
to the creditor.

### Exogenous Shock cards (replace Chance)

Each card hits the right equation and decays over several quarters:
- **Supply shocks** (oil spike, tariffs, an AI productivity boom) move inflation directly.
- **Demand shocks** (fiscal stimulus, austerity, confidence swings) move the output gap.
- **Financial shocks** (bank failure, credit crunch, risk-on rally) move the credit spread.
- **Credibility cards** (political pressure on the central bank, a hawkish appointee) move how anchored
  expectations are.

### Monetary policy modes

- **Taylor rule** (default): the central bank follows the rule below.
- **Rotating Fed Chair**: each quarter a different player sets the policy rate, seeing the rule's
  recommendation and their own floating-rate debt. Deviating from the rule costs credibility, which de-anchors
  expectations and makes later inflation harder to control.

## The model

All rates are annualised percent; the output gap is percent of potential.

- **Expectations:** $\pi^e_t = c_t\,\pi^* + (1-c_t)\,\pi_{t-1}$
- **IS curve:** $y_t = \rho_y y_{t-1} - \sigma\,(i_{t-1} - \pi^e_t - r^*) - \sigma_f s_t + d_t + g_t + \varepsilon^y_t$
- **Phillips curve:** $\pi_t = \pi^e_t + \kappa\,y_t + u_t + \varepsilon^\pi_t$
- **Taylor rule:** $i_t = \max\!\big(0,\ \rho_i i_{t-1} + (1-\rho_i)\,[\,r^* + \pi_t + \phi_\pi(\pi_t-\pi^*) + \phi_y y_t\,]\big)$
- **Long rate:** $i^L_t = \rho_L\, i^L_{t-1} + (1-\rho_L)\, i_t$

Here $d$ is demand shocks, $u$ supply shocks and $s$ the credit spread. $g$ is the **players' own impulse**:
net new borrowing plus construction in the quarter, as a share of total real wealth. Players collectively
cause the booms the central bank then leans against.

Credibility $c_t$ rises while inflation stays within 1pp of target and falls when it doesn't, or when a Fed
Chair overrides the rule.

| Parameter | Value | | Parameter | Value |
|---|---|---|---|---|
| $\pi^*$ inflation target | 2.0 | | $\phi_\pi$ | 1.5 |
| $r^*$ neutral real rate | 2.0 | | $\phi_y$ | 0.5 |
| $\rho_y$ gap persistence | 0.75 | | $\rho_i$ rate smoothing | 0.5 |
| $\sigma$ rate sensitivity | 0.25 | | $\rho_L$ long-rate smoothing | 0.8 |
| $\kappa$ Phillips slope | 0.20 | | noise sd (gap / inflation) | 0.5 / 0.3 |

With these values the steady state is exactly the target (π = 2%, i = 4%, gap = 0), and the system is stable
at every credibility level. `node scripts/calibrate.js` prints the moments and impulse responses. With typical
shock-card traffic: mean inflation ≈ 2.1% (sd ≈ 1pp), output-gap sd ≈ 1.5, and the zero lower bound binds in
≈ 2% of quarters. A 1pp rate surprise lowers output for about four quarters and pulls inflation below target.
Try a low $\phi_\pi$ in setup: after an oil shock with weak credibility, inflation takes about 8 quarters to
return to target under the default rule, about 13 at $\phi_\pi = 0.5$, and more than 20 at $\phi_\pi = 0$.

### Why not a full DSGE?

The model is deliberately a 3-equation New Keynesian model with hybrid expectations, not a microfounded
DSGE with Euler equations, Calvo pricing and rational expectations. In a game, a full DSGE would mean a
nonlinear solver (because of the zero lower bound), and its parameters would be opaque to players. Players
can act on lags, rates and credibility. They can't act on a representative household's first-order
conditions.

The microfoundations that matter here come from the players themselves: their borrowing and building feed
the output gap, and expectations respond to whether the central bank (possibly a player) keeps its word.

## Bots, simulation and tests

Three bot strategies (`src/bots.js`):
- **naive**: classic instincts, never borrows voluntarily.
- **macro**: reads the central bank's forecast, borrows to build, chooses fixed vs. floating by where rates
  are headed, refinances, and avoids buying rate-sensitive lots at the top.
- **leverage**: borrows floating against everything.

The Simulation tab runs bot tournaments on separate games, so your live game is untouched. Or from a
terminal:

```
node scripts/balance.js 400 40 naive macro      # 400 heads-up games, 40 quarters
npm test                                        # engine + rules + balance tests (Node 18+)
```

Over 400 heads-up games of 40 quarters, the macro bot beats the naive bot about 61% of the time, and the
leveraged bot does about 55%. Most of that edge comes from *habits* (borrowing to build, sitting in Jail late)
rather than from reading the economy. `node scripts/ablation.js` plays the macro bot against an identical bot
that ignores the forecast (always floating, no refinancing, no rate-aware buying). The forecast-reading
version wins only about 53%. Making the macro levers bite harder is the main open design problem; see below.

## Known limitations / next steps

- **No trading or auctions yet**, so monopolies are rare. Heads-up games end with about 9 buildings on
  the board, and four-player games with about 7. Trading is the biggest missing piece; it would make
  building, and therefore leverage and rate timing, matter much more.
- **The macro edge is small (about +3–6pp).** Candidates to widen it: higher loan-to-value, a
  rate-sensitive house-building cost, or property sales back to the bank at market value, so that timing
  the asset-price cycle pays.
- **The zero lower bound rarely binds in play** (about 0.1–2% of quarters). Large negative shock cards or a
  lower $r^*$ would bring it into games more often.

## Code layout

| File | Role |
|---|---|
| `src/economy.js` | Macro engine (pure, seeded, with a Monte Carlo forecast for the fan chart) |
| `src/game.js` | Rules as a DOM-free state machine: `roll`, `buy`/`pass`, `build`, `borrow`, `repay`, `endTurn`, `setPolicy` |
| `src/board.js` | Board, rent tables, shock and Community Treasury decks |
| `src/bots.js`, `src/sim.js` | Bot strategies and the headless tournament runner |
| `src/ui.js` | Browser rendering only |
| `test/`, `scripts/` | Node tests, calibration and balance scripts |

The same files load in the browser (classic scripts, so `file://` works) and in Node (`require`).
