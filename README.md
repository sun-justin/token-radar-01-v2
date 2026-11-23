[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/sun-justin/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/sun-justin/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Launch Radar v2: 758 rows, all protocols, token odds from peers' record, costed farm plans, held-out tested twice

A token launch radar for make.fun's `token-radar-01` bounty ($1,325, closes 14 Dec 2026 17:00 WIB).
Every protocol in the sealed snapshot — all 758 — ranked by the token value its
own figures imply, each with a verdict, its token odds, its held-out error band,
and a farm plan costed in dollars per active hour.

## The board at a glance

| Figure | Value |
| --- | --- |
| Board rows | **758** — every protocol in the snapshot |
| Pre-token / live / token-recorded-but-unpriced | **342 / 128 / 288** |
| The pre-token radar (farmable launches) | **198** rankable rows — the full 40-protocol $50M watchlist + 158 early finds below the floor |
| Snapshot | 758 protocols at TVL ≥ $5M, as of 2026-11-14 |
| Total implied value | $25,386,916,040 — $9,840,730,371 model-implied + $15,546,185,669 live market caps |
| Median implied / TVL (pre-token rows) | 0.23× (global peer median 0.25×) |
| Radar #1 | Steakhouse Financial — $78.7M implied on $2.75B TVL (global rank #44) |
| Largest pre-token value overall | Bybit — $174.9M implied, verdict EXCHANGE: an exchange, not a launch to farm |
| Farm plans | 6 concrete steps per protocol, $17–$32 of gas over 85–145 active minutes, $11.43–$14.82/h |

## How the value was fitted — every term fitted, tested held-out twice

The model is fitted at runtime from the snapshot's own token-bearing protocols
("peers": 119 with a market cap, a TVL, and no exchange token). No protocol name
is ever special-cased.

```
implied = exp(a + b · ln TVL + category residual) × growth × chains × maturity
```

- `a = 7.7881`, `b = 0.4721` — OLS fit of log market cap on log TVL over the
  119 peers. `b < 1` means the mcap/TVL multiple shrinks as protocols grow.
- **Category residual** — each category's median log-residual among its peers,
  shrunk toward zero by `n / (n + 10)`, so a category with one or two peers
  barely moves the value and a category with many peers earns its own multiple.
- **Growth** — `1 + 0.5 × clamp(change_7d, −60%, +120%) / 100`.
- **Chains** — `1 + 0.06 × ln(number of chains)`.
- **Maturity** — `0.70` for a newborn protocol to `1.00` at 3 years
  (unknown `listed_at` scores as 365 days).
- **Live rows** carry the market's own value, their market cap — never a model
  estimate. Token-recorded-but-unpriced rows (a token is recorded but the
  snapshot carries no market cap for it) take the model's estimate and say so.

The fit is tested, not trusted — held out twice, fitted on the train peers only:

| Test | Train | Held out | Median \|log error\| | Within 2× | Baseline median \|log error\| | Baseline within 2× |
| --- | --- | --- | --- | --- | --- | --- |
| Split A — every 3rd peer held out | 80 | 39 | **1.0264** | 26% | 1.2740 | 26% |
| Split B — every odd peer held out | 60 | 59 | **1.2923** | 31% | 1.7308 | 27% |

The baseline is a single global median mcap/TVL fitted on the same train peers.
The fitted model beats it on both splits. The honest reading is the size of the
errors: a typical held-out market cap lands about e^1.03 ≈ 2.8× away from the
prediction. Implied value is an order-of-magnitude claim — and the board ranks
by it anyway, because ranking by TVL alone would crown the biggest protocol
and ignore what the market pays per TVL dollar.

## Integrity strip — what the numbers honestly mean

The dashboard opens with this, before the board:

- Every pre-token row shows its implied value as a **band, implied ÷ 2.79 to
  implied × 2.79** (from split A's median |log error|), not a point. Live rows
  need no band: their value is the market's price.
- **Token odds are base rates**, never predictions: the share of protocols in
  the same category that record a token, shrunk toward the 54.9% global rate
  by `n / (n + 10)`. They say how often lookalikes have tokens — never whether
  this one launches, or when.
- **Farm $/h counts gas and fees per active hour**; deployed capital is tracked
  apart, because capital stays yours and gas does not. Holding time is not
  active time.

## Token odds — read from the peers' record

For each category, the odds are its token-record rate in the snapshot itself:
`odds = (n × category rate + 10 × global rate) / (n + 10)`, the same
shrinkage the value model uses for category residuals, so a thin category
barely moves the odds. Examples from this snapshot: Dexs 73 of 99 record a
token (odds 72%), Risk Curators 5 of 39 (odds 21%). Rows whose token already
exists score 100% — the launch has happened.

## Costed farm plans — $/h per row

Every farm step carries its gas and fees in dollars, its active minutes, and
the capital it deploys. The plan totals them: capital deployed, gas spent,
active minutes, and **$ per active hour**. The weekly step repeats for the
whole hold (30–60 days, so 5–9 weeks), and its cost and time are the weekly
figures times the weeks. Example: Steakhouse Financial — $24 gas, $375
capital, 105 active minutes, $13.71/h.

## Verdicts

Every row carries one verdict:

| Verdict | Rows | Meaning |
| --- | --- | --- |
| TOP FARM | 14 | Top-10 pre-token radar rank, or implied/TVL ≥ 0.50×, with 7-day growth ≥ 0 |
| WATCH | 87 | Implied/TVL ≥ 0.30×, or a top-40 radar rank |
| COOLING | 44 | 7-day growth below −10% |
| EARLY | 53 | Everything else rankable |
| LIVE | 128 | Its token already trades — value is its market cap |
| UNPRICED | 288 | A token is recorded but the snapshot carries no market cap |
| EXCHANGE | 52 | An exchange, not a launch to farm |
| WRAPPED | 45 | A wrapped or staked product of a token that trades |
| BRIDGE | 36 | A bridge, not a launch to farm |
| VERSIONED | 11 | A versioned pool of another protocol |

## What the board is — and is not

- The board ranks **all 758 protocols**: pre-token rows by the model's implied
  value, live rows by their market cap, unpriced rows by the model's estimate
  with a flag. The "Show" filter switches between the pre-token radar (the
  198 farmable launches), all pre-token protocols, the live tokens, and the
  full 758.
- The watchlist is the floor, never the ceiling: the board carries all 40 of
  its protocols plus every other protocol in the snapshot.
- Implied value does **not** predict whether or when a token launches. It says
  what a token would be worth if the protocol's record stayed as it is. A
  protocol that "records no token" may still have one its DefiLlama record
  does not carry.
- Token odds are base rates among lookalike protocols, not a prediction for
  any one protocol.

## The dashboard

A static, no-network page (`dashboard/index.html` + `app.css` + `app.js`,
data from `data.js` written by `main.ts`):

- a dense dark board — big sortable table, integrity strip, stat strip, verdict
  + token odds + farm $/h per row;
- a detail view for every protocol: the model breakdown term by term, the
  error band, the token odds with its category group, the nearest live
  comparables, and the 6-step farm plan with cost, time and $/h;
- filters for token status, category, chain, minimum TVL, watchlist-only, and
  search; sorts for implied value, TVL, growth, implied/TVL, token odds,
  farm $/h, age and name;
- the full "How the value was fitted" section, with the token-odds method, the
  farm-costing method and the verdict rules.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

Node 22, standard library only, no network at runtime: it reads the snapshot,
fits the model, writes `board.json`, `data.js`, copies `dashboard/` and
`screenshots/` into the output directory, and writes `dossier.json` with
`buildDossier` from `vendor/makefun-board.ts`. Both runs write the same bytes
(verified: two runs byte-identical).

## Files

| File | What it is |
| --- | --- |
| `main.ts` | Entry point: reads the snapshot, builds the board, writes the outputs |
| `lib/model.ts` | The value model, the held-out tests, the token odds, the costed farm plans, the board builder |
| `dashboard/` | The static dashboard (`index.html`, `app.css`, `app.js`) |
| `screenshots/` | `1-board.png` (the board), `2-detail.png` (a detail view), `3-filtered.png` (filtered view) |
| `vendor/makefun-board.ts` | make.fun's dossier library, copied byte-identical from the kit |

## License

MIT — see [LICENSE](LICENSE).
