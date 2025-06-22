import numpy as np

# === PARAMETERS ===
T = 50  # number of turns
y_bar = 100  # potential output
pi_star = 0.02  # inflation target
r_bar = 0.02  # natural real interest rate
S0 = 200  # base GO payout

# Model coefficients
sigma = 1.0  # IS curve sensitivity (Reduced from 50.0 for stability)
beta = 0.60  # inflation persistence (Reduced from 0.85 to make deflation less sticky)
kappa = 0.10  # Phillips curve slope (Reduced from 0.25 to prevent deflationary spirals)
phi_pi = 1.5  # Taylor rule inflation response
phi_y = 0.25  # Taylor rule output gap response

# Shock standard deviations
eps_pi_std = 0.005
eps_y_std = 1.0

# === INITIALIZATION ===
pi = np.zeros(T)
y = np.zeros(T)
i = np.zeros(T)
go_payout = np.zeros(T)

pi[0] = pi_star
y[0] = y_bar
i[0] = r_bar + pi_star
go_payout[0] = S0

# === PROPERTY & RENT PARAMETERS ===
P0 = 300  # base property price
lambda_prop = 0.5  # sensitivity of price to inflation (Reduced from 1.0)
R0 = 50  # base rent level (for a certain level, e.g., 3 houses)

P = np.zeros(T)  # property prices
R = np.zeros(T)  # rents
P[0] = P0
R[0] = R0

# === SIMULATION LOOP ===
for t in range(1, T):
    # Shocks
    eps_y = np.random.normal(0, eps_y_std)
    eps_pi = np.random.normal(0, eps_pi_std)

    # IS Curve (output gap)
    y[t] = y_bar - sigma * (i[t-1] - pi[t-1] - r_bar) + eps_y

    # Phillips Curve
    pi[t] = beta * pi[t-1] + kappa * (y[t] - y_bar) + eps_pi

    # Taylor Rule
    i_unbounded = r_bar + pi[t] + phi_pi * (pi[t] - pi_star) + phi_y * (y[t] - y_bar)
    i[t] = max(0.0, i_unbounded) # Enforce Zero Lower Bound

    # Bound the effects of extreme deflation for game playability
    pi_effective = max(-0.25, pi[t])

    # GO Payout (compounded each turn by current inflation)
    go_payout[t] = go_payout[t-1] * (1 + pi_effective)

    # Property Price Update (dampened and stabilized)
    P[t] = P[t-1] * max(0.95, (1 + lambda_prop * pi_effective))

    # Rent Update
    R[t] = R0 * (P[t] / P0)

# === MORTGAGE CALCULATIONS (example for last period) ===
# Amount received when mortgaging: 50% of property value
mortgage_amount = 0.5 * P[-1]

# Cost to unmortgage = principal + interest + premium
unmortgage_cost = mortgage_amount * (1 + i[-1] + 0.02)

# === OUTPUT EXAMPLES ===
print(f"Final Inflation Rate: {pi[-1]:.2%}")
print(f"Final Output: {y[-1]:.2f}")
print(f"Final Interest Rate: {i[-1]:.2%}")
print(f"GO Payout (Turn {T}): ${go_payout[-1]:.2f}")
print(f"Final Property Price: ${P[-1]:.2f}")
print(f"Final Rent Level: ${R[-1]:.2f}")
print(f"Mortgage Amount: ${mortgage_amount:.2f}")
print(f"Unmortgage Cost: ${unmortgage_cost:.2f}")
