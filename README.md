# Tracewise (Osaka pilot) — v0 SUPERSEDED

> **This is v0.** It is tagged `v0-deprecated` in git and superseded by a spec-first rebuild. See [DEPRECATED.md](DEPRECATED.md) for context.

---

A static site that makes complex transit systems legible — stopping patterns, interlining, transfer ambiguity, fare supplements. Pilot city: Osaka. Schema city-agnostic.

## Run locally

Browsers block `fetch` for `file://`, so run any local HTTP server from the `site/` directory:

```bash
cd projects/transit-tool/site
python -m http.server 8000
```

Open <http://localhost:8000/>.

## Status — Milestone 1

Hand-authored JSON for:

- **Osaka Metro Midosuji Line** (M11 Esaka → M29 Nakamozu, 19 stops)
- **Kita-Osaka Kyuko Namboku Line** (M06 Minoh-Kayano → M11 Esaka, 6 stops including 2024 extension)
- Through-running services that cross both operators
- Transfer stubs at Umeda demonstrating "different name, connected" transfers

All 5 views render. Data pipeline (GTFS / Overpass / scrape) is not yet built — that is Milestone 2+.

## Layout

```
schema/        JSON Schema for each file type
data/<city>/   the canonical dataset
overrides/     hand overrides applied on top of automated ingest (later)
site/          static HTML + JS served as-is
build/         Python ingest + reconcile (later milestones)
```

## Schema at a glance

- `operators` — owners (Osaka Metro, Kita-Osaka Kyuko, JR West, Hankyu, …)
- `lines` — rails that trains run on; ordered list of `stops`
- `stops` — a line-stop pair with order and km-post
- `station_nodes` — one physical platform cluster per operator (Hankyu Umeda and JR Osaka are separate nodes)
- `transfers` — edges between nodes with walking time, paid-area flag, category (same-name-not-connected, etc.)
- `services` — the primary object: a named stopping pattern with a `line_path` that may cross operators, a `stop_pattern`, and `frequency_bands` (tph per peak/midday/evening/weekend)
- `fare_zones` — operator fare context and supplement rules

## Views

| File | What it answers |
|---|---|
| `index.html` | Where is everything? |
| `line.html?id=…` | What stopping patterns run on this line, how often? |
| `station.html?id=…` | What transfers this station, what stops here? |
| `service.html?id=…` | What does this train do end-to-end, supplements, frequency? |
| `transfers.html` | Where are the gotcha transfers (same-name-disconnected etc.)? |

## Next milestones

2. Osaka Metro fully ingested from GTFS + Overpass
3. Private operators (Hankyu, Hanshin, Keihan, Kintetsu, Nankai, JR West) via scraping + overrides
4. Fare zones + transfer-graph fully populated
5. Deploy to GitHub Pages
6. Generalise to Tokyo or Seoul
