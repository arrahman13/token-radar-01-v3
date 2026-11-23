# Token Radar

[![Bounty](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/arrahman13/token-radar-01-v3/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![Reward](https://make.fun/badge/token-radar-01/arrahman13/token-radar-01-v3/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A pre-token launch radar over a sealed DefiLlama snapshot (758 protocols,
2026-11-14). It ranks the 197 protocols that record no token and could
plausibly launch one — all 40 watchlist protocols plus 157 early finds —
by an implied value that is fitted from the snapshot's own figures, and it
proves the fit out-of-sample on the page itself.

## What the board claims

**Implied value = TVL × fitted multiple × fitted launch odds.**

- The multiple is a regression of log(market cap ÷ TVL) on the 87 traded
  peers with a recorded market cap of $5M or more: a log-TVL size curve
  plus shrunk category-group effects. A disciplined term search tested
  squared and cubed size terms, chain count, clipped 7-day growth, age,
  age buckets and the two strongest interactions; a term was admitted
  only if it lowered **both** the leave-one-out miss and the walk-forward
  miss. Flat multiple: ×5.41 / ×4.61. Fitted: **×3.08 leave-one-out,
  ×3.00 walk-forward**.
- The odds are a logistic fit on the 645 protocols with a listing date
  (age curve, shrunk group effects, growth), validated by 10-fold CV and
  a walk-forward: base-rate Brier 0.251 → **0.201 CV / 0.219
  walk-forward**, with an out-of-fold calibration table by age band.
- Printed P25–P75 ranges held 52% of peers (stated 50%); P10–P90 held
  82% (stated 80%). Every tested term, kept or rejected, is printed in
  the evidence rail beside the board.

## The page

The board screenshot carries the receipts: the evidence rail sits next to
the table in the first viewport. The page is sortable and filterable
(search, category, chain, watchlist/early/FARM tabs), every row opens a
detail view with the value decomposition, a costed step-by-step farm
plan, the same protocol priced at four plan sizes, and its nearest
priced peers. Verdicts default to a plan of **0.02% of each protocol's
TVL** (flat $1k/$5k/$25k selectable): at the default, 128 protocols
verdict FARM, 58 MARGINAL, 11 SKIP. A basket builder turns a budget and
a weekly time allowance into a greedy best-$/hour basket.

**Integrity by recompute.** The dashboard embeds the snapshot and the
same model code the program ran; on load it rebuilds the board in the
browser and prints the checksum next to board.json's. The full ledger is
accounted on the page: 197 ranked · 416 already record a token · 44
bridges · 43 liquid staking/restaking · 42 exchange products · 11
versioned · 5 wrapped/staked = 758.

## Run it

```
node main.ts            # reads /input/snapshot.json, writes /output
node main.ts --input snapshot.json
MAKEFUN_OUTPUT_DIR=out node main.ts
```

Node 22, standard library only. Two runs produce byte-identical output.
`main.ts` writes `board.json`, the dashboard (with its generated data
file) and `dossier.json` (built with the vendored `makefun-board`
library) into the output directory.

## Layout

- `main.ts` — the program.
- `lib/model.js` — the whole model, written once: classification,
  value and odds fits with their validations, farm economics, board.
- `dashboard/` — the page; `dashboard/model.js` is the identical model
  copy the browser recomputes with, `dashboard/zz-snapshot-data.js` is
  generated at build time and sorts last in the dossier.
- `vendor/makefun-board.ts` — the dossier library, vendored unchanged.
- `screenshots/` — board, detail and filtered renders of the real page.
