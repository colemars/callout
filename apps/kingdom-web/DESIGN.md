# Financial Kingdom — Game Design

> The hook is not "gamify budgeting." The hook is: **turn your real financial
> life into a living kingdom that rewards resilience, not spending less.**
> Most finance apps optimize for tracking. This one optimizes for building.

## The core loop

**Observe → Decide → Improve → Watch your kingdom evolve.**

Every time the user opens the app: (1) something in the kingdom has changed,
(2) they understand why, (3) they make one financial decision, (4) the kingdom
visibly improves. Opening the app isn't checking numbers — it's *"what
happened in my kingdom while I was away?"*

## The prime rule

**There is no XP. There is no fake currency. The kingdom is literally the
balance sheet.** Every displayed number traces to a real statement line or a
real served metric (the model carries a `basis` string for each). Where data
is missing, the kingdom says nothing — never a false all-clear, never an
invented estimate.

**And the corollary:** the app never punishes users for living their lives.
Happiness spending is a *resource*, not a sin. The satisfying progression is
not "spend nothing" — it's "every dollar you intentionally direct strengthens
a different part of your kingdom." Strategy game, not guilt game.

## The Four Ages (financial maturity, not levels)

1. **🏕️ Survive the Winter** — emergency fund, stop high-interest debt, light
   recurring obligations, positive cash flow. Tiny village, wooden palisade,
   near-empty granary.
2. **🏰 Fortify** — retirement investing begun, bad debt eliminated, 6-month
   runway, ≥10% savings rate. Stone walls, watchtowers. Difficult to kill.
3. **🌾 Expand** — every dollar has a job; productive assets produce daily.
4. **👑 Prosperity** — holdings sustain essential spending indefinitely
   (4%-rule proxy until true passive-income measurement exists), ≥30% savings
   rate. The kingdom runs itself; storms barely register.

Gate policy for missing data: "prove the good thing" gates fail provisionally;
"no evidence of harm" gates pass provisionally.

## The five resources

| Resource | Meaning | Source of truth |
|---|---|---|
| 🪙 Gold | Liquidity | liquid depository balances |
| 🌾 Grain | Winter survival | emergency runway (engine metric, verbatim) |
| 🪨 Stone | Long-term assets | retirement + brokerage balances |
| 🔨 Builders | Free cash flow | completed month's net cash flow (1 builder / $500) |
| 🎉 Happiness | Quality of life | lifestyle share of spending (healthy band 15–35%; low is a *warning*, high stays warm) |

## The enemies

| Enemy | Failure mode | Trigger |
|---|---|---|
| 🏴 Bandits | High-interest debt | credit balances > 0; the toll shown only from real interest/fee lines |
| ❄️ Winter | Inflation | essential spend +8% MoM (own-spend proxy) |
| 🍗 Royal feasts | Lifestyle creep | lifestyle-minus-travel jumps 25%+ AND share > 35% — a *jump*, never a level |
| 🌵 Drought | Income loss | income −20% MoM |
| 🔥 Castle fire | Unexpected expense | single txn ≥ max(40% of monthly spend, $500); the granary "absorbs" it when runway ≥ 3mo |

## The moat = margin of safety (NOT wealth)

A $5M portfolio with no cash keeps a narrow moat. Score 0–100: runway (30) +
low leverage (30) + liquidity (20) + light obligations (20). **Bandit cap:**
while high-interest debt exists the moat is held at 74 — bandits can bridge
any moat. Insurance and income diversification belong here; no data source
yet.

## Structures

Keep (=age) · Granary · Walls & Moat · Royal Treasury (retirement, 🔒) ·
Merchant Caravans (brokerage) · Market Square (cash flow) · Festival Grounds
(happiness) · Manor (🏦 lien — equity never guessed) · Guild of Scholars' Debt
(student loans) · Watchtowers (budgets) · hostile Bandit Camp.

## The chronicle

Platform events + notable ledger lines, kingdom-voiced: tax collectors return
(paychecks), tithes paid (subscriptions/recurring), bandit tolls (real
interest/fee lines), caravans depart (investment transfers), the crown pays
the moneylenders (debt payments), the court journeys afar (travel — cheerful),
market days (notable spends). Every entry carries a refId to the raw line.

## Punt list (deliberately not in v2)

- Insurance + income diversification in the moat
- Rentals ("villages") and businesses ("workshops") — no data source
- Home value / Manor equity (Zillow's API is partner-only; RentCast or manual
  entry as a future platform slice)
- Builder **allocation** interactivity (v2 is read-only observation; the
  long-term vision is assigning workers = allocating savings)
- True passive-income measurement for Age 4 (4%-rule proxy today)
- CPI-based Winter (own-spend proxy today)
- Stone trend arrows (needs asset balance history from engine snapshots)
- The map itself — graphics come after the text simulation proves the model
- The calendar view ("taxes arrive, rent comes in, the kingdom lives")
