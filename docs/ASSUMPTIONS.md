# Model assumptions and interpretation

Source facts and model inputs are different. The 2026 directory supports broad geography and tenant identities; the operator's leasing page supports an annual traffic figure and garage capacity. Neither supplies a calibrated arrival distribution, individual customer preferences, venue capacities, transaction amounts or causal response to a tenant change.

## Demand and parking

The default 5,000 attempted visitors and the 30,000-person stress preset are fully modeled scenarios. There are no sampling weights or dollar multipliers. The latter is of the same order as 11 million annual visits divided by 365; the arithmetic does not establish daily or peak attendance, repeat visitation, seasonality or the modeled opening-window count.

Each synthetic group has one shared purpose, wallet, arrival mode and decision stream. A purchasing group is counted as buying for each group member; this aggregate assumption can differ from receipt-level retail behavior. Car mode is drawn independently of layout. The parking module reserves one space per admitted car group until pier departure plus the configured buffer. With no space, the group leaves the modeled system. It does not search another garage or change mode. All car groups seek the same garage. Initial parked cars are exogenous and do not contribute pier spending. Initial occupancy cannot exceed either layout's supply.

Changing parking supply tests admission pressure under this deliberately bounded access rule. It does not forecast vehicle queues, emissions, road capacity, parking fees, garage profitability, physical expansion feasibility or demand induced by a larger garage.

## Meals, substitution and capacity

A restaurant purchase records a meal occasion: breakfast before 11:00, lunch 11:00–16:00, dinner from 16:00. Further full meals in that occasion are unavailable. A second meal also requires at least 240 minutes and sufficient hunger. Restaurant choices require time for minimum service duration before the group's time limit, venue closing and simulation end. Paid café visits reduce hunger less than a full meal; free browsing does not satiate a visitor.

Restaurants compete for finite meals, time and budgets. A new restaurant can serve people previously unserved, transfer purchases from another venue, displace retail spending or remain underused. No intervention has a guaranteed revenue benefit. A controlled test confirms that adding an available dinner venue redistributes diners without letting them buy a second dinner. Real runs report the outcome, including negative or inconsistent differences.

Meal-intent visitors leaving without a meal include voluntary decisions and time/budget constraints, not just full restaurants. Queue abandonment counts events weighted by group size; the same person can abandon more than one venue. Completed visit duration excludes parking turnaways. Conversion and spending per visitor use admitted visitors; attempted arrivals and turnaways are shown separately.

## Comparison and uncertainty

Each pair receives identical profiles, arrivals, budgets and keyed random streams. Routes, queues and choices respond to its own layout. Local-model predictions can differ because state differs. The one-pair result is illustrative; three pairs expose some seed variation, not model uncertainty or confidence bounds for actual revenue. Failed pairs do not contribute to means.

The comparison shows each run's total sales, mean paired dollar/percentage differences, admissions, meals, waiting and venue-level gains/declines. Venue deltas sum to the net pier delta. This accounting reveals offsetting results but does not identify every visitor's substitute or a causal effect. Dollar rounding is for display; ledgers retain integer cents.

## Geography and graphics

Both floors and major destinations follow the official map, with west-side K Dock sea lions and the bay-end attractions. Building footprints and floor connections are fixed, but dimensions, link positions, accessible paths, the parallel promenade and the grouped tenant areas are approximate. The isometric projection is presentation only; it does not change the navigation graph. Boardwalk planks, roofs, marina boats, planters and patio furniture are illustrative scenery, not additional simulated business capacity.

## Operating use

Calibrate first with an operator-provided floor/path survey, hourly entrance counts, travel mode/garage occupancy and turnover, venue seating and dwell data, queue observations, and aggregate purchases by venue/time. Validate against unseen days and test sensitivity to several plausible input sets. Only then consider operational recommendations. Tenant sales must be combined with separate lease/rent, staffing, cost and investment inputs to analyze management income or returns.
