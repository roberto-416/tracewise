#!/usr/bin/env python3
"""
transform_schema.py — Tracewise schema migration to 3-level hierarchy.

Reads:  data/osaka/lines.json  (old: directional OSM route variants)
        data/osaka/stops.json  (old: line_id field)
        data/osaka/services.json (old: line_path references)

Writes: data/osaka/tracks.json  (NEW: physical corridors, deduplicated)
        data/osaka/lines.json   (NEW: named branded services)
        data/osaka/stops.json   (UPDATED: line_id → track_id)
        data/osaka/services.json (UPDATED: references line_id)

Run from transit-tool root:
    python build/transform_schema.py
"""

import json, re, sys
from collections import defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

OUT = Path("data/osaka")

# ---------------------------------------------------------------------------
# 1. Load existing data
# ---------------------------------------------------------------------------
old_lines   = json.loads((OUT / "lines.json").read_text(encoding="utf-8"))
old_stops   = json.loads((OUT / "stops.json").read_text(encoding="utf-8"))
old_services = json.loads((OUT / "services.json").read_text(encoding="utf-8"))

stops_by_line = defaultdict(list)
for s in old_stops:
    stops_by_line[s["line_id"]].append(s)
for lid in stops_by_line:
    stops_by_line[lid].sort(key=lambda s: s["order"])

# ---------------------------------------------------------------------------
# 2. Classify which old "lines" are physical tracks vs named service brands
# ---------------------------------------------------------------------------
# These OSM route relations are named service brands running ON physical tracks,
# not tracks themselves. They should become services, not tracks.
SERVICE_BRAND_PATTERNS = re.compile(
    r"\b(HINOTORI|SHIMAKAZE|AONIYOSHI|BLUE SYMPHONY|URBAN LINER|"
    r"Rapi:t|Southern|Haruka|Thunderbird)\b", re.I)

def is_service_brand(name_en: str) -> bool:
    if SERVICE_BRAND_PATTERNS.search(name_en or ""):
        return True
    if re.match(r"Kintetsu Limited Express", name_en or "", re.I):
        return True
    if re.match(r"Airport Express", name_en or "", re.I):
        return True
    if re.match(r"Express Southern", name_en or "", re.I):
        return True
    # "Kansai Airport Rapid" is the only JR West track data we have — keep as track
    return False

SERVICE_TYPES = re.compile(
    r"\b(Local|Express|Sub-Express|Sub Express|Limited Express|"
    r"Rapid|Semi-Express|Airport Express|Shuttle)\b", re.I)

def normalize_ascii(text: str) -> str:
    """Normalize macron/accented chars to ASCII for grouping."""
    table = {
        ord("ū"): "u", ord("ō"): "o", ord("ā"): "a", ord("ī"): "i",
        ord("Ū"): "U", ord("Ō"): "O", ord("Ā"): "A", ord("Ī"): "I",
        ord("é"): "e", ord("è"): "e", ord("ê"): "e",
        ord("ô"): "o", ord("ó"): "o",
    }
    return text.translate(table)

def base_name(name_en: str) -> str:
    """Strip direction info, service types, and 'Main' qualifier for grouping."""
    n = name_en or ""
    # Remove parenthetical direction: " (X => Y)"
    n = re.sub(r"\s*\([^)]+\)", "", n)
    # Remove direction after colon: ": X => Y"
    n = re.sub(r":\s.*", "", n)
    # Remove service type words
    n = SERVICE_TYPES.sub("", n)
    # Strip "Main" qualifier — Hankyū Kyoto Main Line == Hankyu Kyoto Line
    n = re.sub(r"\bMain\b", "", n, flags=re.I)
    # Normalize to ASCII for grouping stability
    n = normalize_ascii(n)
    # Strip stray punctuation left by regex (e.g. trailing " -" from "-Express-")
    n = re.sub(r"[-–—/\\]+$", "", n).strip()
    return " ".join(n.split()).strip()

def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")

# ---------------------------------------------------------------------------
# 3. Separate track candidates from service brands
# ---------------------------------------------------------------------------
track_candidates = []
service_brand_lines = []  # old line entries that are really services

for ln in old_lines:
    name_en = ln.get("name_en", "")
    if is_service_brand(name_en):
        service_brand_lines.append(ln)
    else:
        track_candidates.append(ln)

print(f"Track candidates: {len(track_candidates)}  |  Service brands: {len(service_brand_lines)}")

# ---------------------------------------------------------------------------
# 4. Deduplicate track candidates by operator + base name
# ---------------------------------------------------------------------------
groups = defaultdict(list)
for ln in track_candidates:
    bn = base_name(ln.get("name_en") or ln.get("name_ja", ""))
    key = (ln["operator_id"], bn)
    groups[key].append(ln)

tracks_out = []
old_line_to_track = {}   # old line_id -> new track_id

# Manual overrides: some OSM entries for the same physical line have
# slightly different names (e.g. Hankyu Kyoto line has two entries).
# We handle this by picking the one with the most stops.

for (op_id, bn), group in sorted(groups.items()):
    if not bn:
        # Empty base name (all-Japanese name that slugified to empty)
        # Try to use name_ja to build a sensible ID
        best = max(group, key=lambda l: len(stops_by_line.get(l["id"], [])))
        bn = best.get("name_en") or best.get("name_ja", "unknown")

    # Pick the entry with the most stops as canonical
    best = max(group, key=lambda l: len(stops_by_line.get(l["id"], [])))

    # Generate clean track ID
    track_id = f"{op_id}-{slugify(bn)}" if bn else f"{op_id}-unknown-{len(tracks_out)}"
    # Deduplicate ID
    existing_ids = {t["id"] for t in tracks_out}
    base_track_id = track_id
    suffix = 2
    while track_id in existing_ids:
        track_id = f"{base_track_id}-{suffix}"
        suffix += 1

    # Collect all old line_ids that map to this track
    old_ids_in_group = [l["id"] for l in group]
    for old_id in old_ids_in_group:
        old_line_to_track[old_id] = track_id

    stops_for_track = [s["id"] for s in stops_by_line.get(best["id"], [])]

    track = {
        "id": track_id,
        "name_en": best.get("name_en") or bn,
        "name_ja": best.get("name_ja", ""),
        "operator_id": op_id,
        "colour": best.get("colour", "#888"),
        "code": best.get("code", ""),
        "osm_relation_ids": best.get("osm_relation_ids", []),
        "stops": stops_for_track,
        # Metadata: which old line IDs this consolidates
        "_from_lines": old_ids_in_group,
    }
    tracks_out.append(track)
    print(f"  {track_id:60s}  {len(stops_for_track):3d} stops  (merged {len(group)} old lines)")

print(f"\nTracks: {len(tracks_out)}")

# ---------------------------------------------------------------------------
# 5. Build new lines.json — named branded services
#    For most cases, 1 track = 1 line.
#    Cross-operator through-running cases are defined below.
# ---------------------------------------------------------------------------

# First, generate a base set from tracks (1:1)
lines_out = []
track_id_to_line_id = {}  # track_id -> line_id

# Manual definitions for cross-operator / complex lines
# Format: (line_id, name_en, name_ja, primary_operator, [track_ids])
CROSS_OPERATOR_LINES = [
    # Midosuji Line: Osaka Metro Midosuji + KoK Namboku (through-run at Esaka)
    # KoK isn't in our tracks yet (ingest failed), so just Metro for now.
    # We'll note it in the data.
]

# Create a line for each track (1:1 default)
for track in tracks_out:
    # Generate line_id: strip operator prefix for cleanliness
    track_clean = track["id"]
    # Remove operator prefix to get the line portion
    op_prefix = track["operator_id"] + "-"
    line_slug = track_clean[len(op_prefix):] if track_clean.startswith(op_prefix) else track_clean
    line_id = f"line-{track['operator_id']}-{line_slug}"

    # Deduplicate
    existing = {l["id"] for l in lines_out}
    base = line_id
    suffix = 2
    while line_id in existing:
        line_id = f"{base}-{suffix}"
        suffix += 1

    track_id_to_line_id[track["id"]] = line_id

    line = {
        "id": line_id,
        "display_name_en": track["name_en"],
        "display_name_ja": track["name_ja"],
        "primary_operator_id": track["operator_id"],
        "colour": track["colour"],
        "tracks": [track["id"]],
    }
    lines_out.append(line)

print(f"Lines: {len(lines_out)}")

# ---------------------------------------------------------------------------
# 6. Update stops.json: line_id -> track_id
# ---------------------------------------------------------------------------
stops_out = []
for s in old_stops:
    old_lid = s.get("line_id")
    new_track_id = old_line_to_track.get(old_lid)
    if not new_track_id:
        # Stop's line wasn't in track candidates (was a service brand line)
        # Try to find which track its stops might belong to
        print(f"  WARNING: stop {s['id']} has line_id {old_lid!r} not in track map — skipping")
        continue
    ns = dict(s)
    ns.pop("line_id", None)
    ns["track_id"] = new_track_id
    stops_out.append(ns)

print(f"Stops: {len(stops_out)} (from {len(old_stops)})")

# ---------------------------------------------------------------------------
# 7. Update services.json: add line_id, update line_path
# ---------------------------------------------------------------------------
services_out = []
for svc in old_services:
    ns = dict(svc)

    # Convert line_path from old line_ids to track_ids
    new_path = []
    for seg in svc.get("line_path", []):
        old_lid = seg.get("line_id")
        new_tid = old_line_to_track.get(old_lid, old_lid)  # fallback to old id
        new_seg = dict(seg)
        new_seg["track_id"] = new_tid
        new_seg.pop("line_id", None)
        new_path.append(new_seg)
    ns["line_path"] = new_path

    # Derive line_id from first track in path
    if new_path:
        first_track = new_path[0].get("track_id")
        ns["line_id"] = track_id_to_line_id.get(first_track, "unknown")
    else:
        ns["line_id"] = "unknown"

    services_out.append(ns)

# ---------------------------------------------------------------------------
# 8. Write output
# ---------------------------------------------------------------------------
def write_json(path, data, label=""):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    n = len(data) if isinstance(data, (list, dict)) else "?"
    print(f"  Wrote {path.name}  ({label or n})")

# Strip internal metadata before writing tracks
for t in tracks_out:
    t.pop("_from_lines", None)

write_json(OUT / "tracks.json", tracks_out)
write_json(OUT / "lines.json", lines_out)
write_json(OUT / "stops.json", stops_out)
write_json(OUT / "services.json", services_out)

print("\nDone. Review tracks.json and lines.json for correctness.")
print("The line_geometry.json keys (old line_ids) will need updating separately.")

# Print mapping summary for geometry update
print("\n--- Geometry key mapping (old line_id -> new track_id) ---")
old_geom_ids = set()
try:
    geom = json.loads((OUT / "line_geometry.json").read_text(encoding="utf-8"))
    old_geom_ids = set(geom.keys())
except Exception:
    pass

print(f"Geometry entries: {len(old_geom_ids)}")
matched = {old: new for old, new in old_line_to_track.items() if old in old_geom_ids}
print(f"Matched: {len(matched)}")
unmatched = old_geom_ids - set(old_line_to_track.keys())
if unmatched:
    print(f"Unmatched geometry keys: {sorted(unmatched)[:10]}")
