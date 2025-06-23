# DSGE Monopoly: The Player's Manual

## 1. Introduction: What is DSGE Monopoly?

Welcome to DSGE Monopoly, a unique twist on the classic board game. Unlike the original, this version is powered by a live, dynamic macroeconomic model inspired by modern economics. "DSGE" stands for Dynamic Stochastic General Equilibrium, a framework economists use to understand how an economy works.

In this game, you don't just buy properties and collect rent. You must navigate a living economy where your financial decisions are impacted by system-wide **inflation**, **interest rates**, and **economic growth**. The Central Bank isn't a player, but its policies will directly affect your wealth, the value of your assets, and the cost of your debts.

The goal remains the same: become the wealthiest player and bankrupt your opponents. But the path to victory requires not just luck and negotiation, but also a keen understanding of the economic forces at play.

## 2. The Game Interface

Your screen is split into two main sections: the **Game Board** on the left, and the **Information Panel** on the right.

### The Information Panel

The panel on the right contains several tabs to give you insight into the game's economy:

- **Dashboard:** Your at-a-glance view of the economy's health. It shows the current Inflation Rate, the Central Bank's Interest Rate, the level of Economic Activity (Output), and the current GO Payout.
- **Economic Indicators:** A graph showing the history of inflation and interest rates. This is crucial for seeing trends. Is the economy heating up (rising inflation) or cooling down?
- **Output Graph:** A graph showing the history of Economic Activity vs. the economy's long-run potential.
- **Model Equations:** See the raw calculations the game's Central Bank used on the last turn to make its decisions.
- **Simulation:** Run hundreds of automated games in seconds to see the long-term behavior of the economic model.

## 3. The Economic Engine: How It Works

The game's economy is governed by three key variables that influence each other every turn.

- **`Inflation (π)`:** The rate at which the general price level is rising or falling. High inflation erodes the value of cash but increases the nominal value of properties and the GO payout. Deflation does the opposite.
- **`Economic Activity (y)`:** Represents the "output" of the economy. When activity is above its long-term potential, it puts upward pressure on inflation. When it's below potential (a recession), it pushes inflation down.
- **`Interest Rate (i)`:** The rate set by the game's Central Bank. This is the primary tool to control the economy. Higher interest rates make borrowing more expensive, which cools down the economy and fights inflation. Lower rates stimulate the economy.

### The Core Equations

After each round of player turns, the economic model updates using three core equations.

#### 1. The IS Curve (Determines Economic Activity)

This equation decides the level of economic activity (`$y_t$`) for the current turn. It says that economic activity will be higher if the *real interest rate* (the nominal interest rate `$i_{t-1}$` minus last turn's inflation `$\pi_{t-1}$`) was low, and vice-versa.

```math
y_t = \bar{y} - \sigma(i_{t-1} - \pi_{t-1} - \bar{r}) + \epsilon_y
```

- `$y_t$`: Economic activity this turn.
- `$\bar{y}$`: The economy's long-run potential output (100).
- `$\sigma$`: How sensitive the economy is to interest rate changes (1.0).
- `$i_{t-1}$`: The interest rate from the *previous* turn.
- `$\pi_{t-1}$`: The inflation rate from the *previous* turn.
- `$\bar{r}$`: The "natural" real rate of interest (2%).
- `$\epsilon_y$`: A random shock to the economy (from -0.5 to +0.5).

#### 2. The Phillips Curve (Determines Inflation)

This equation sets the inflation rate (`$\pi_t$`) for the current turn. It says that inflation depends on what it was last turn and whether the economy is "booming" or in a "slump."

```math
\pi_t = \beta \pi_{t-1} + \kappa(y_t - \bar{y}) + \epsilon_\pi
```

- `$\pi_t$`: Inflation this turn.
- `$\beta$`: How "sticky" or persistent inflation is (0.60).
- `$\pi_{t-1}$`: Inflation from the *previous* turn.
- `$\kappa$`: How much a booming/slumping economy affects inflation (0.10).
- `$(y_t - \bar{y})$`: The "Output Gap" - the difference between current activity and potential.
- `$\epsilon_\pi$`: A random shock to inflation (from -0.25% to +0.25%).

#### 3. The Taylor Rule (The Central Bank's Policy)

This is the Central Bank's rule for setting the *next* turn's interest rate (`$i_t$`). It's a formula that reacts to the current state of the economy.

```math
i_t = \max(0, \bar{r} + \pi_t + \phi_\pi(\pi_t - \pi^*) + \phi_y(y_t - \bar{y}))
```

- `$i_t$`: The interest rate for the *next* turn.
- `$\max(0, ...)$`: This enforces the **Zero Lower Bound**. The interest rate cannot go below 0%.
- `$\bar{r}$`: The natural real rate of interest (2%).
- `$\pi_t$`: The current inflation rate.
- `$\phi_\pi$`: How aggressively the bank reacts to inflation being off-target (1.5).
- `$(\pi_t - \pi^*)$`: The "Inflation Gap" - the difference between current inflation and the target (2%).
- `$\phi_y$`: How aggressively the bank reacts to an output gap (0.25).
- `$(y_t - \bar{y})$`: The current Output Gap.

## 4. Economic Consequences in the Game

The macroeconomic model has direct, tangible effects on gameplay.

### GO Payout
The $200 you collect for passing GO is now indexed to inflation. The amount is updated each round based on the latest inflation rate. In periods of high inflation, the payout will rise above $200. In periods of deflation, it will fall.

### Property Prices & Rent
Property values are no longer fixed. Each round, property prices update based on the overall inflation rate.
- **Price Update:** `New Price = Old Price * (1 + 0.5 * Inflation)`
- **Rent:** Rent is calculated as a percentage of a property's current market price. As prices rise and fall, so does the rent you collect.
- **Mortgaged Properties:** Mortgaged properties do not appreciate in value.

### Mortgaging
When you mortgage a property, you receive 50% of its *current market value*. To unmortgage, you must pay back that principal PLUS interest, determined by the Central Bank's current interest rate.
- **Unmortgage Cost:** `Principal * (1 + Interest Rate + 2%)`
- **Strategic Note:** It is cheapest to unmortgage when the economy is in a slump and interest rates are at or near 0%. It is most expensive when the economy is booming.

## 5. Game Cards

### Chance Cards: Economic Shocks
The Chance deck has been replaced with **Economic Shock** cards. These represent unexpected global events that immediately impact the economy. When you draw one, it will instantly add to or subtract from the current inflation rate, forcing the Central Bank to react on the next turn.

*Examples:*
- "Global oil price spike! Inflation temporarily rises." (+3% inflation)
- "Breakthrough in AI boosts productivity! Inflation eases." (-2% inflation)

### Community Chest Cards
These cards retain the classic Monopoly feel, containing a mix of cash bonuses, payments, repairs, and the coveted "Get Out of Jail Free" card.

## 6. Winning the Game

The objective is unchanged: bankrupt your opponents. A player is declared bankrupt when they cannot pay a fee and are forced to sell all their assets (houses, hotels) and mortgage all their properties, and still have negative cash. Good luck! 