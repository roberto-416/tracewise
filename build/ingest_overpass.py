#!/usr/bin/env python3
"""
Tracewise – Overpass ingest for Osaka Metro (and Kita-Osaka Kyuko).

Produces (overwrites):
  data/osaka/operators.json
  data/osaka/lines.json
  stops.json
  station_nodes.json

Does NOT touch: services.json, transfers.json, fare_zones.json (hand-authored).

Run from repo root:  python build/ingest_overpass.py
"""

import json
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

import requests

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OUT_DIR = Path(__file__).parent.parent / "data" / "osaka"

# Official Osaka Metro line metadata (ref tag → display info + colour)
# Colours from https://www.osakametro.co.jp/  (official brand palette)
OSAKA_METRO_LINES = {
    "M": {"name_en": "Midosuji Line",                   "name_ja": "御堂筋線",      "colour": "#E5171F"},
    "T": {"name_en": "Tanimachi Line",                   "name_ja": "谷町線",        "colour": "#9B6C2F"},
    "Y": {"name_en": "Yotsubashi Line",                  "name_ja": "四つ橋線",      "colour": "#0068B7"},
    "C": {"name_en": "Chuo Line",                        "name_ja": "中央線",        "colour": "#27A842"},
    "S": {"name_en": "Sennichimae Line",                 "name_ja": "千日前線",      "colour": "#E85298"},
    "K": {"name_en": "Sakaisuji Line",                   "name_ja": "堺筋線",        "colour": "#B5602C"},
    "N": {"name_en": "Nagahori Tsurumi-ryokuchi Line",   "name_ja": "長堀鶴見緑地線", "colour": "#91A200"},
    "I": {"name_en": "Imazatosuji Line",                 "name_ja": "今里筋線",      "colour": "#9444A3"},
}

KOK_LINES = {
    "M": {"name_en": "Namboku Line", "name_ja": "南北線", "colour": "#E5171F"},
}

OPERATORS = [
    {
        "id": "osaka-metro",
        "name_en": "Osaka Metro",
        "name_ja": "大阪市高速電気軌道",
        "colour": "#0072BC",
        "fare_group": "osaka-metro",
        "url": "https://subway.osakametro.co.jp/",
    },
    {
        "id": "kita-osaka-kyuko",
        "name_en": "Kita-Osaka Kyuko Railway",
        "name_ja": "北大阪急行電鉄",
        "colour": "#E5171F",
        "fare_group": "kita-osaka-kyuko",
        "url": "https://www.kita-kyu.co.jp/",
    },
]


def slugify(text: str) -> str:
    """ASCII slug for IDs."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


HEADERS = {
    "User-Agent": "Tracewise/0.1 (transit comprehension tool; contact roberto.ionescu@gmail.com)",
    "Accept": "application/json",
}

def overpass(query: str) -> dict:
    print(f"  -> Overpass request ({len(query)} chars)...", end=" ", flush=True)
    r = requests.get(OVERPASS_URL, params={"data": query}, headers=HEADERS, timeout=90)
    if not r.ok:
        print(f"HTTP {r.status_code}: {r.text[:200]}")
    r.raise_for_status()
    d = r.json()
    print(f"{len(d.get('elements', []))} elements")
    return d


def ingest_operator(network_tag: str, operator_meta: dict, op_id: str) -> tuple:
    """
    Returns (lines_out, stops_out, nodes_out) lists.
    Two Overpass queries: (1) route relations list, (2) stop node details by ID.
    """
    # Query 1: route relations (body only — gives member IDs with roles)
    q1 = f'[out:json][timeout:60];\nrelation["type"="route"]["route"="subway"]["network"="{network_tag}"];\nout body;'
    data = overpass(q1)

    relations = [el for el in data["elements"] if el["type"] == "relation"]
    print(f"    {len(relations)} relations")

    # Collect all unique stop node IDs across all relations
    all_stop_ids = set()
    for rel in relations:
        for m in rel.get("members", []):
            if m["type"] == "node" and m.get("role") in ("stop", "stop_exit_only"):
                all_stop_ids.add(m["ref"])

    # Query 2: fetch stop node details (lat/lon + name tags) by ID
    time.sleep(1)
    id_list = ",".join(str(i) for i in sorted(all_stop_ids))
    q2 = f"[out:json][timeout:60];\nnode(id:{id_list});\nout body;"
    nodes_data = overpass(q2)
    nodes_by_id = {el["id"]: el for el in nodes_data["elements"] if el["type"] == "node"}
    print(f"    {len(nodes_by_id)} stop nodes fetched")

    # Group relations by ref (line code); keep the two directions
    by_ref = defaultdict(list)
    for rel in relations:
        ref = rel.get("tags", {}).get("ref", "")
        by_ref[ref].append(rel)

    lines_out, stops_out, station_nodes_out = [], [], []
    seen_osm_node_ids = {}  # osm_node_id → node_id (to dedup across lines)

    for ref, rels in sorted(by_ref.items()):
        meta = operator_meta.get(ref)
        if not meta:
            print(f"    Skipping ref={ref!r} (not in metadata)")
            continue

        # Use relation whose 'from' tag looks like the terminal we want first
        # Heuristic: sort by id, take first (consistent across runs)
        rels_sorted = sorted(rels, key=lambda r: r["id"])
        primary_rel = rels_sorted[0]
        all_rel_ids = [r["id"] for r in rels_sorted]

        line_id = f"{op_id}-{slugify(meta['name_en'])}"
        print(f"    Line {ref}: {meta['name_en']}  rel={primary_rel['id']}  ({len(rels)} dirs)")

        # Extract stop member nodes in order
        stop_members = [
            m for m in primary_rel.get("members", [])
            if m["type"] == "node" and m.get("role") in ("stop", "stop_exit_only", "")
            and m["ref"] in nodes_by_id
        ]

        # Some relations mix stop/platform nodes; prefer role=="stop"
        # If no "stop" roles, fall back to all node members that are in nodes_by_id
        role_stops = [m for m in stop_members if m.get("role") == "stop"]
        if role_stops:
            stop_members = role_stops

        stop_ids_for_line = []
        for seq, m in enumerate(stop_members):
            osm_nid = m["ref"]
            node_el = nodes_by_id[osm_nid]
            tags = node_el.get("tags", {})
            lat = node_el.get("lat")
            lon = node_el.get("lon")

            # Build names; prefer name:en, fall back to transliteration placeholder
            name_en = tags.get("name:en") or tags.get("name:ja-Latn") or tags.get("alt_name:en") or ""
            name_ja = tags.get("name") or tags.get("name:ja") or ""

            # Generate a stable node id
            if osm_nid not in seen_osm_node_ids:
                node_id = f"node-{ref}{seq+1:02d}-{slugify(op_id)}"
                seen_osm_node_ids[osm_nid] = node_id
                station_nodes_out.append({
                    "id": node_id,
                    "name_en": name_en,
                    "name_ja": name_ja,
                    "operator_id": op_id,
                    "lat": lat,
                    "lon": lon,
                    "_osm_id": osm_nid,
                })
            else:
                node_id = seen_osm_node_ids[osm_nid]

            stop_id = f"stop-{ref}{seq+1:02d}-{slugify(op_id)}"
            stop_ids_for_line.append(stop_id)
            stops_out.append({
                "id": stop_id,
                "line_id": line_id,
                "station_node_id": node_id,
                "code": f"{ref}{seq+1:02d}",
                "order": seq,
            })

        lines_out.append({
            "id": line_id,
            "operator_id": op_id,
            "code": ref,
            "name_en": meta["name_en"],
            "name_ja": meta["name_ja"],
            "colour": meta["colour"],
            "osm_relation_ids": all_rel_ids[:1],  # one direction for map geometry
            "stops": stop_ids_for_line,
        })

    return lines_out, stops_out, station_nodes_out


def ingest_kita_osaka_kyuko() -> tuple:
    """
    Kita-Osaka Kyuko: two-query approach matching ingest_operator.
    """
    q1 = '[out:json][timeout:60];\nrelation["type"="route"]["operator"~"\\u5317\\u5927\\u962a\\u6025\\u884c"];\nout body;'
    try:
        data = overpass(q1)
    except Exception as e:
        print(f"    KoK Overpass failed ({e}); skipping")
        return [], [], []

    relations = [el for el in data["elements"] if el["type"] == "relation"]

    if not relations:
        print("    No KoK relations found; skipping")
        return [], [], []

    primary = sorted(relations, key=lambda r: r["id"])[0]
    all_rel_ids = [r["id"] for r in relations]
    print(f"    KoK: {len(relations)} relations, using {primary['id']}")

    # Fetch stop node details
    all_stop_ids = set()
    for rel in relations:
        for m in rel.get("members", []):
            if m["type"] == "node" and m.get("role") in ("stop", "stop_exit_only"):
                all_stop_ids.add(m["ref"])
    if all_stop_ids:
        time.sleep(1)
        id_list = ",".join(str(i) for i in sorted(all_stop_ids))
        nodes_data = overpass(f"[out:json][timeout:30];\nnode(id:{id_list});\nout body;")
        nodes_by_id = {el["id"]: el for el in nodes_data["elements"] if el["type"] == "node"}
    else:
        nodes_by_id = {}

    stop_members = [
        m for m in primary.get("members", [])
        if m["type"] == "node" and m.get("role") in ("stop", "stop_exit_only")
        and m["ref"] in nodes_by_id
    ]

    line_id = "kita-osaka-kyuko-namboku"
    stops_out, nodes_out = [], []
    stop_ids = []

    for seq, m in enumerate(stop_members):
        osm_nid = m["ref"]
        node_el = nodes_by_id[osm_nid]
        tags = node_el.get("tags", {})
        name_en = tags.get("name:en") or tags.get("name:ja-Latn") or ""
        name_ja = tags.get("name") or ""
        node_id = f"node-M{seq+1:02d}-kok"
        stop_id = f"stop-M{seq+1:02d}-kok"
        stop_ids.append(stop_id)
        nodes_out.append({
            "id": node_id,
            "name_en": name_en,
            "name_ja": name_ja,
            "operator_id": "kita-osaka-kyuko",
            "lat": node_el.get("lat"),
            "lon": node_el.get("lon"),
            "_osm_id": osm_nid,
        })
        stops_out.append({
            "id": stop_id,
            "line_id": line_id,
            "station_node_id": node_id,
            "code": f"M{seq+1:02d}",
            "order": seq,
        })

    line_out = [{
        "id": line_id,
        "operator_id": "kita-osaka-kyuko",
        "code": "M",
        "name_en": "Namboku Line",
        "name_ja": "南北線",
        "colour": "#E5171F",
        "osm_relation_ids": all_rel_ids[:1],
        "stops": stop_ids,
    }]

    return line_out, stops_out, nodes_out


def stitch_segments(segments: list) -> list:
    """Order way segments into one continuous coordinate list."""
    if not segments:
        return []
    used = [False] * len(segments)
    chain = list(segments[0])
    used[0] = True
    for _ in range(len(segments) - 1):
        last = chain[-1]
        best_i, best_rev, best_d = -1, False, float("inf")
        for i, seg in enumerate(segments):
            if used[i]:
                continue
            d_fwd = (seg[0][0] - last[0]) ** 2 + (seg[0][1] - last[1]) ** 2
            d_rev = (seg[-1][0] - last[0]) ** 2 + (seg[-1][1] - last[1]) ** 2
            if d_fwd < best_d:
                best_d, best_i, best_rev = d_fwd, i, False
            if d_rev < best_d:
                best_d, best_i, best_rev = d_rev, i, True
        if best_i < 0:
            break
        seg = segments[best_i][::-1] if best_rev else segments[best_i]
        start = 1 if (seg[0][0] == last[0] and seg[0][1] == last[1]) else 0
        chain.extend(seg[start:])
        used[best_i] = True
    return chain


def fetch_line_geometry(lines: list) -> dict:
    """Fetch + stitch OSM way geometry for each line. Returns {line_id: [[lon,lat],...]}."""
    result = {}
    for line in lines:
        rel_ids = line.get("osm_relation_ids", [])
        if not rel_ids:
            continue
        rel_id = rel_ids[0]
        print(f"  Geometry {line['name_en']} (rel {rel_id})...", end=" ", flush=True)
        q = f"[out:json][timeout:90];\nrelation(id:{rel_id});\nout geom;"
        try:
            time.sleep(1)
            data = overpass(q)
            segments = []
            for elem in data.get("elements", []):
                if elem["type"] != "relation":
                    continue
                for mem in elem.get("members", []):
                    if mem["type"] == "way" and len(mem.get("geometry", [])) >= 2:
                        segments.append([[p["lon"], p["lat"]] for p in mem["geometry"]])
            if segments:
                coords = stitch_segments(segments)
                result[line["id"]] = coords
                print(f"{len(coords)} pts from {len(segments)} segments")
            else:
                print("no geometry")
        except Exception as e:
            print(f"failed: {e}")
    return result


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  Wrote {path}  ({len(data)} records)")


def main():
    print("=== Tracewise Overpass Ingest ===")
    print(f"Output: {OUT_DIR}\n")

    all_lines, all_stops, all_nodes = [], [], []

    # 1. Osaka Metro
    print("Osaka Metro:")
    l, s, n = ingest_operator("大阪市高速電気軌道", OSAKA_METRO_LINES, "osaka-metro")
    all_lines += l
    all_stops += s
    all_nodes += n
    time.sleep(2)  # be polite to Overpass

    # 2. Kita-Osaka Kyuko
    print("\nKita-Osaka Kyuko:")
    l, s, n = ingest_kita_osaka_kyuko()
    all_lines += l
    all_stops += s
    all_nodes += n

    # Remove internal _osm_id helper field before writing
    for node in all_nodes:
        node.pop("_osm_id", None)

    print(f"\nTotals: {len(all_lines)} lines, {len(all_stops)} stops, {len(all_nodes)} station nodes")

    write_json(OUT_DIR / "operators.json", OPERATORS)
    write_json(OUT_DIR / "lines.json", all_lines)
    write_json(OUT_DIR / "stops.json", all_stops)
    write_json(OUT_DIR / "station_nodes.json", all_nodes)

    # Geometry — fetch separately so main ingest can succeed even if this is slow
    print("\nFetching line geometry for map rendering...")
    geom = fetch_line_geometry(all_lines)
    geom_path = OUT_DIR / "line_geometry.json"
    geom_path.write_text(json.dumps(geom, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  Wrote {geom_path}  ({len(geom)} lines)")

    print("\nDone. services.json / transfers.json / fare_zones.json unchanged.")
    print("Serve: python -m http.server 8765 --directory transit-tool  (from projects/)")
    print("  then open http://localhost:8765/index.html")


if __name__ == "__main__":
    main()
