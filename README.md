# Token Launch Radar

[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/a03042901-hub/tokenradar01/rank.svg)](https://make.fun/c/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/a03042901-hub/tokenradar01/reward.svg)](https://make.fun/c/token-radar-01)

Offline radar for **pre-token** DeFi protocols: ranks each name by an **implied launch value** derived only from the sealed DefiLlama snapshot, and attaches a concrete farm plan (action, estimated USD cost, estimated time).

Owner: **a03042901-hub** · Repo: **tokenradar01** · Competition: [token-radar-01](https://make.fun/c/token-radar-01)

## Value model

Pre-token means both `gecko_id` and `symbol` are null in the snapshot.

**Formula**

`raw = max(floor_usd, k_category × TVL) × momentum × maturity`, then ranks are assigned so `implied_value_usd` is a strictly decreasing positive integer (never rises as rank worsens). The dashboard detail pane shows each factor’s **dollar contribution** toward the raw score.

| Factor | What it does |
| --- | --- |
| **Base** | `max(floor_usd, k×TVL)`. `floor_usd` is $50,000,000 in this snapshot. `k` is category-sensitive (e.g. Chain / Dexs / Lending / Restaking higher; Farm / stables lower). |
| **Momentum** | `1 + clamp(change_7d/100, −30%, +50%) × 0.85`. Rising 7-day TVL lifts value; sharp drawdowns cut it. Missing `change_7d` → factor `1`. |
| **Maturity** | Days from `listed_at` to `as_of`. Discount when younger than ~60 days, peak premium roughly 120–420 days, mild discount after ~720 days of silence. Unknown `listed_at` → factor `1`. |

**Universe**

- Every watchlist slug is always on the board (never dropped).
- Non-watchlist rows are pre-token only. A documented heuristic drops wrapped / staked / restaked / bridge / CEX wrappers of assets that already trade (category set + name/slug word and ticker patterns + exchange-name prefixes). Watchlist rows skip this filter.
- Protocols that already record a token stay off the ranked board and appear on the dashboard **Already launched** reference tab.

Target board size is ~220 rows (40 watchlist + ~180 early pre-token names).

## Farm plans

Each row carries 3–12 steps. Steps name the protocol and primary chain, estimate gas/deposit cost in USD, and estimate time. Templates branch by category (DEX, lending, derivatives, restaking, vaults/curators, chain/bridge, default).

## How to run

Requires Node.js 22.18+ (stdlib only; no `npm install` for the entry).

```bash
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

With the kit unpacked beside the repo:

```bash
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

In the grade container the program reads `/input/snapshot.json` and writes `/output` (override with `MAKEFUN_OUTPUT_DIR`).

Outputs: `board.json`, `data.js` (embedded payload the page reads — never fetched), `dashboard/`, `screenshots/`, `dossier.json`.

Open the dashboard by serving the output directory (so `dashboard/index.html` can load `../data.js`):

```bash
python3 -m http.server 8765 --directory out
# then open http://127.0.0.1:8765/dashboard/
```

Check locally:

```bash
node /tmp/token-radar-01-kit/cli/makefun.mjs check --kit /tmp/token-radar-01-kit --repo .
```

## Layout

- `main.ts` — entrypoint
- `lib/radar.ts` — value model, derivative heuristic, farm plans
- `dashboard/` — offline UI (`index.html`, `styles.css`, `app.js`)
- `screenshots/` — `1-board.png`, `2-detail.png`, `3-filtered.png`
- `vendor/makefun-board.ts` — make.fun dossier helper (unchanged)
- `.makefun/owner.json` — wallet claim
