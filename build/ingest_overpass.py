#!/usr/bin/env python3
"""
Tracewise – Overpass ingest: Osaka Metro + major private operators.

Produces (overwrites):
  data/osaka/operators.json
  data/osaka/lines.json
  data/osaka/stops.json
  data/osaka/station_nodes.json
  data/osaka/line_geometry.json

Does NOT touch: services.json, transfers.json, fare_zones.json (hand-authored).

Run from transit-tool root:
    python build/ingest_overpass.py
"""

import json, re, sys, time
from collections import defaultdict
from pathlib import Path

import requests

# Ensure UTF-8 output on Windows (prevents charmap errors with Japanese/arrow chars)
sys.stdout.reconfigure(encoding="utf-8")

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OUT_DIR = Path(__file__).parent.parent / "data" / "osaka"

# Bounding box for greater Osaka–Kobe–Kyoto–Nara region
BBOX = "34.25,135.00,35.05,135.85"

HEADERS = {
    "User-Agent": "Tracewise/0.1 (transit comprehension tool; roberto.ionescu@gmail.com)",
    "Accept": "application/json",
}

# ---------------------------------------------------------------------------
# Operator registry — written to operators.json
# ---------------------------------------------------------------------------
OPERATORS = [
    {"id": "osaka-metro",    "name_en": "Osaka Metro",               "name_ja": "大阪市高速電気軌道", "colour": "#0072BC", "fare_group": "osaka-metro",    "url": "https://subway.osakametro.co.jp/"},
    {"id": "kita-osaka-kyuko","name_en": "Kita-Osaka Kyuko Railway", "name_ja": "北大阪急行電鉄",    "colour": "#E5171F", "fare_group": "kita-osaka-kyuko","url": "https://www.kita-kyu.co.jp/"},
    {"id": "hankyu",         "name_en": "Hankyu Railway",            "name_ja": "阪急電鉄",           "colour": "#5E2D79", "fare_group": "hankyu",          "url": "https://www.hankyu.co.jp/"},
    {"id": "hanshin",        "name_en": "Hanshin Electric Railway",  "name_ja": "阪神電気鉄道",       "colour": "#1E3D8F", "fare_group": "hanshin",         "url": "https://rail.hanshin.co.jp/"},
    {"id": "keihan",         "name_en": "Keihan Electric Railway",   "name_ja": "京阪電気鉄道",       "colour": "#006432", "fare_group": "keihan",          "url": "https://www.keihan.co.jp/"},
    {"id": "kintetsu",       "name_en": "Kintetsu Railway",          "name_ja": "近畿日本鉄道",       "colour": "#E45E00", "fare_group": "kintetsu",        "url": "https://www.kintetsu.co.jp/"},
    {"id": "nankai",         "name_en": "Nankai Electric Railway",   "name_ja": "南海電気鉄道",       "colour": "#0071BC", "fare_group": "nankai",          "url": "https://www.nankai.co.jp/"},
    {"id": "jr-west",        "name_en": "JR West",                  "name_ja": "西日本旅客鉄道",     "colour": "#003087", "fare_group": "jr-west",         "url": "https://www.westjr.co.jp/"},
]

# ---------------------------------------------------------------------------
# Osaka Metro line metadata (ref → info)
# ---------------------------------------------------------------------------
OSAKA_METRO_LINES = {
    "M": {"name_en": "Midosuji Line",                 "name_ja": "御堂筋線",      "colour": "#E5171F"},
    "T": {"name_en": "Tanimachi Line",                "name_ja": "谷町線",        "colour": "#9B6C2F"},
    "Y": {"name_en": "Yotsubashi Line",               "name_ja": "四つ橋線",      "colour": "#0068B7"},
    "C": {"name_en": "Chuo Line",                     "name_ja": "中央線",        "colour": "#27A842"},
    "S": {"name_en": "Sennichimae Line",              "name_ja": "千日前線",      "colour": "#E85298"},
    "K": {"name_en": "Sakaisuji Line",                "name_ja": "堺筋線",        "colour": "#B5602C"},
    "N": {"name_en": "Nagahori Tsurumi-ryokuchi Line","name_ja": "長堀鶴見緑地線","colour": "#91A200"},
    "I": {"name_en": "Imazatosuji Line",              "name_ja": "今里筋線",      "colour": "#9444A3"},
}

# ---------------------------------------------------------------------------
# Private operator line metadata
# name_key: key to match against OSM `name` or `ref` tag (substring match)
# If name_key is None, accept all routes for that operator.
# ---------------------------------------------------------------------------
PRIVATE_OP_CONFIGS = {
    "hankyu": {
        "network_tags": ["阪急電鉄"],
        "route_types":  ["train", "subway"],
        "line_colours": {
            # Hankyu uses one brand colour; individual line colours below
            "京都本線":  "#5E2D79", "神戸本線":  "#5E2D79", "宝塚本線":  "#5E2D79",
            "千里線":    "#5E2D79", "箕面線":    "#5E2D79", "今津線":    "#5E2D79",
            "伊丹線":    "#5E2D79", "甲陽線":    "#5E2D79",
        },
        "default_colour": "#5E2D79",
    },
    "hanshin": {
        "network_tags": ["阪神電気鉄道"],
        "route_types":  ["train"],
        "default_colour": "#1E3D8F",
    },
    "keihan": {
        "network_tags": ["京阪電気鉄道"],
        "route_types":  ["train", "subway"],
        "line_colours": {
            "中之島線": "#E55B00",
        },
        "default_colour": "#006432",
    },
    "kintetsu": {
        "network_tags": ["近畿日本鉄道"],
        "route_types":  ["train", "subway"],
        "line_colours": {
            "けいはんな線": "#6CBB3C",  # Keihanna Line (through with Chuo)
            "難波線":       "#E45E00",
            "大阪線":       "#E45E00",
            "奈良線":       "#E45E00",
            "南大阪線":     "#E45E00",
        },
        "default_colour": "#E45E00",
    },
    "nankai": {
        "network_tags": ["南海電気鉄道"],
        "route_types":  ["train"],
        "line_colours": {
            "空港線": "#0071BC",
            "高野線": "#00873C",
        },
        "default_colour": "#0071BC",
    },
    "jr-west": {
        "network_tags": ["JR西日本"],
        "route_types":  ["train"],
        "line_colours": {
            "大阪環状線":        "#E60027",
            "JRゆめ咲線":        "#F7931D",
            "大和路線":          "#007D3B",
            "阪和線":            "#007D3B",
            "JR神戸線":          "#0071BC",
            "JR京都線":          "#0071BC",
            "JR宝塚線":          "#0071BC",
            "おおさか東線":      "#AA4496",
        },
        "default_colour": "#003087",
    },
}


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def overpass(query: str, retries: int = 3) -> dict:
    print(f"  Overpass ({len(query)} chars)...", end=" ", flush=True)
    for attempt in range(retries):
        r = requests.get(OVERPASS_URL, params={"data": query}, headers=HEADERS, timeout=120)
        if r.status_code == 429:
            wait = 60 * (attempt + 1)
            print(f"429 rate-limited — sleeping {wait}s...", end=" ", flush=True)
            time.sleep(wait)
            continue
        if not r.ok:
            print(f"HTTP {r.status_code}")
        r.raise_for_status()
        d = r.json()
        print(f"{len(d.get('elements', []))} elements")
        return d
    raise RuntimeError(f"Overpass still failing after {retries} retries")


def fetch_stop_nodes(stop_ids: set) -> dict:
    """Batch-fetch stop node lat/lon+tags by OSM node ID."""
    if not stop_ids:
        return {}
    id_list = ",".join(str(i) for i in sorted(stop_ids))
    data = overpass(f"[out:json][timeout:60];\nnode(id:{id_list});\nout body;")
    return {el["id"]: el for el in data["elements"] if el["type"] == "node"}


# ---------------------------------------------------------------------------
# Osaka Metro ingest (route=subway, network tag)
# ---------------------------------------------------------------------------
def ingest_operator(network_tag, operator_meta, op_id):
    q = f'[out:json][timeout:60];\nrelation["type"="route"]["route"="subway"]["network"="{network_tag}"];\nout body;'
    data = overpass(q)
    relations = [el for el in data["elements"] if el["type"] == "relation"]
    print(f"    {len(relations)} relations")

    all_stop_ids = set()
    for rel in relations:
        for m in rel.get("members", []):
            if m["type"] == "node" and m.get("role") in ("stop", "stop_exit_only"):
                all_stop_ids.add(m["ref"])

    time.sleep(1)
    nodes_by_id = fetch_stop_nodes(all_stop_ids)
    print(f"    {len(nodes_by_id)} stop nodes")

    by_ref = defaultdict(list)
    for rel in relations:
        ref = rel.get("tags", {}).get("ref", "")
        by_ref[ref].append(rel)

    lines_out, stops_out, station_nodes_out = [], [], []
    seen_osm_node_ids = {}

    for ref, rels in sorted(by_ref.items()):
        meta = operator_meta.get(ref)
        if not meta:
            print(f"    Skip ref={ref!r}")
            continue

        primary = sorted(rels, key=lambda r: r["id"])[0]
        all_rel_ids = [r["id"] for r in sorted(rels, key=lambda r: r["id"])]
        line_id = f"{op_id}-{slugify(meta['name_en'])}"
        print(f"    {ref}: {meta['name_en']}  rel={primary['id']}")

        stop_members = [m for m in primary.get("members", [])
                        if m["type"] == "node" and m.get("role") in ("stop", "stop_exit_only", "")
                        and m["ref"] in nodes_by_id]
        role_stops = [m for m in stop_members if m.get("role") == "stop"]
        if role_stops:
            stop_members = role_stops

        stop_ids_for_line = []
        for seq, m in enumerate(stop_members):
            osm_nid = m["ref"]
            node_el = nodes_by_id[osm_nid]
            tags = node_el.get("tags", {})
            name_en = tags.get("name:en") or tags.get("name:ja-Latn") or ""
            name_ja = tags.get("name") or tags.get("name:ja") or ""
            if osm_nid not in seen_osm_node_ids:
                node_id = f"node-{ref}{seq+1:02d}-{slugify(op_id)}"
                seen_osm_node_ids[osm_nid] = node_id
                station_nodes_out.append({"id": node_id, "name_en": name_en, "name_ja": name_ja,
                    "operator_id": op_id, "lat": node_el.get("lat"), "lon": node_el.get("lon"),
                    "_osm_id": osm_nid})
            else:
                node_id = seen_osm_node_ids[osm_nid]

            stop_id = f"stop-{ref}{seq+1:02d}-{slugify(op_id)}"
            stop_ids_for_line.append(stop_id)
            stops_out.append({"id": stop_id, "line_id": line_id,
                "station_node_id": node_id, "code": f"{ref}{seq+1:02d}", "order": seq})

        lines_out.append({"id": line_id, "operator_id": op_id, "code": ref,
            "name_en": meta["name_en"], "name_ja": meta["name_ja"], "colour": meta["colour"],
            "osm_relation_ids": all_rel_ids[:1], "stops": stop_ids_for_line})

    return lines_out, stops_out, station_nodes_out


# ---------------------------------------------------------------------------
# Kita-Osaka Kyuko (separate query — absorbed into Midosuji in OSM)
# ---------------------------------------------------------------------------
def ingest_kita_osaka_kyuko():
    q = '[out:json][timeout:60];\nrelation["type"="route"]["operator"~"\\u5317\\u5927\\u962a\\u6025\\u884c"];\nout body;'
    try:
        data = overpass(q)
    except Exception as e:
        print(f"    KoK failed: {e}; skipping")
        return [], [], []
    relations = [el for el in data["elements"] if el["type"] == "relation"]
    if not relations:
        print("    No KoK relations; skipping")
        return [], [], []

    primary = sorted(relations, key=lambda r: r["id"])[0]
    all_stop_ids = set()
    for rel in relations:
        for m in rel.get("members", []):
            if m["type"] == "node" and m.get("role") in ("stop", "stop_exit_only"):
                all_stop_ids.add(m["ref"])
    time.sleep(1)
    nodes_by_id = fetch_stop_nodes(all_stop_ids)

    stop_members = [m for m in primary.get("members", [])
                    if m["type"] == "node" and m.get("role") in ("stop", "stop_exit_only")
                    and m["ref"] in nodes_by_id]

    line_id = "kita-osaka-kyuko-namboku"
    stops_out, nodes_out, stop_ids = [], [], []
    for seq, m in enumerate(stop_members):
        osm_nid = m["ref"]
        node_el = nodes_by_id[osm_nid]
        tags = node_el.get("tags", {})
        node_id = f"node-M{seq+1:02d}-kok"
        stop_id = f"stop-M{seq+1:02d}-kok"
        stop_ids.append(stop_id)
        nodes_out.append({"id": node_id, "name_en": tags.get("name:en", ""),
            "name_ja": tags.get("name", ""), "operator_id": "kita-osaka-kyuko",
            "lat": node_el.get("lat"), "lon": node_el.get("lon"), "_osm_id": osm_nid})
        stops_out.append({"id": stop_id, "line_id": line_id, "station_node_id": node_id,
            "code": f"M{seq+1:02d}", "order": seq})

    line_out = [{"id": line_id, "operator_id": "kita-osaka-kyuko", "code": "M",
        "name_en": "Namboku Line", "name_ja": "南北線", "colour": "#E5171F",
        "osm_relation_ids": [primary["id"]], "stops": stop_ids}]
    return line_out, stops_out, nodes_out


# ---------------------------------------------------------------------------
# Private operator ingest (route=train within bbox)
# ---------------------------------------------------------------------------
def ingest_private_operator(op_id: str, config: dict, seen_osm_node_ids: dict):
    """
    Query all route relations for a private operator within the Osaka region bbox.
    Deduplicates directions: keeps one relation per unique `name` tag (smallest ID).
    Returns (lines_out, stops_out, nodes_out).
    """
    network_tags = config["network_tags"]
    route_types  = config["route_types"]
    default_colour = config.get("default_colour", "#888")
    line_colours   = config.get("line_colours", {})

    print(f"\n{op_id}:")
    all_relations = []
    for rtype in route_types:
        for ntag in network_tags:
            q = (f'[out:json][timeout:90][bbox:{BBOX}];\n'
                 f'relation["type"="route"]["route"="{rtype}"]["network"="{ntag}"];\n'
                 f'out body;')
            try:
                time.sleep(8)
                data = overpass(q)
                all_relations += [el for el in data["elements"] if el["type"] == "relation"]
            except Exception as e:
                print(f"    Query failed: {e}")

        # Also try operator tag
        for ntag in network_tags:
            q = (f'[out:json][timeout:90][bbox:{BBOX}];\n'
                 f'relation["type"="route"]["route"="{rtype}"]["operator"="{ntag}"];\n'
                 f'out body;')
            try:
                time.sleep(8)
                data = overpass(q)
                all_relations += [el for el in data["elements"] if el["type"] == "relation"]
            except Exception as e:
                print(f"    Operator query failed: {e}")

    if not all_relations:
        print(f"    No relations found")
        return [], [], []

    # Deduplicate by relation ID
    seen_ids = set()
    unique_rels = []
    for r in all_relations:
        if r["id"] not in seen_ids:
            seen_ids.add(r["id"])
            unique_rels.append(r)

    # Group by line name; keep smallest ID per group (one direction)
    by_name = defaultdict(list)
    for rel in unique_rels:
        tags = rel.get("tags", {})
        name = tags.get("name", tags.get("ref", str(rel["id"])))
        by_name[name].append(rel)

    # Deduplicate directions: keep the one with the smallest relation ID
    deduped = {}
    for name, rels in by_name.items():
        primary = sorted(rels, key=lambda r: r["id"])[0]
        deduped[name] = (primary, [r["id"] for r in sorted(rels, key=lambda r: r["id"])])

    print(f"    {len(unique_rels)} relations → {len(deduped)} lines after dedup")

    # Collect all stop node IDs
    all_stop_ids = set()
    for name, (primary, _) in deduped.items():
        for m in primary.get("members", []):
            if m["type"] == "node" and m.get("role") in ("stop", "stop_exit_only", ""):
                all_stop_ids.add(m["ref"])

    if not all_stop_ids:
        print("    No stop nodes found")
        return [], [], []

    time.sleep(10)
    nodes_by_id = fetch_stop_nodes(all_stop_ids)
    print(f"    {len(nodes_by_id)} stop nodes fetched")

    lines_out, stops_out, station_nodes_out = [], [], []

    for line_name_ja, (primary, all_rel_ids) in sorted(deduped.items()):
        tags = primary.get("tags", {})
        name_en = tags.get("name:en") or tags.get("name:ja-Latn") or line_name_ja
        name_ja = line_name_ja
        colour = line_colours.get(name_ja, line_colours.get(name_en, default_colour))
        line_id = f"{op_id}-{slugify(name_en or name_ja)}"
        code = tags.get("ref", "")

        # Extract stop members
        stop_members = [m for m in primary.get("members", [])
                        if m["type"] == "node" and m.get("role") in ("stop", "stop_exit_only", "")
                        and m["ref"] in nodes_by_id]
        role_stops = [m for m in stop_members if m.get("role") == "stop"]
        if role_stops:
            stop_members = role_stops

        if not stop_members:
            print(f"    Skip {name_ja} — no valid stops")
            continue

        print(f"    {name_ja}: {len(stop_members)} stops  rel={primary['id']}")

        stop_ids_for_line = []
        for seq, m in enumerate(stop_members):
            osm_nid = m["ref"]
            node_el = nodes_by_id.get(osm_nid, {})
            ntags = node_el.get("tags", {})
            s_name_en = ntags.get("name:en") or ntags.get("name:ja-Latn") or ""
            s_name_ja = ntags.get("name") or ntags.get("name:ja") or ""

            if osm_nid not in seen_osm_node_ids:
                node_id = f"node-{op_id}-{len(seen_osm_node_ids):04d}"
                seen_osm_node_ids[osm_nid] = node_id
                station_nodes_out.append({
                    "id": node_id, "name_en": s_name_en, "name_ja": s_name_ja,
                    "operator_id": op_id,
                    "lat": node_el.get("lat"), "lon": node_el.get("lon"),
                    "_osm_id": osm_nid,
                })
            else:
                node_id = seen_osm_node_ids[osm_nid]

            stop_id = f"stop-{op_id}-{len(stops_out):04d}"
            stop_ids_for_line.append(stop_id)
            stops_out.append({"id": stop_id, "line_id": line_id,
                "station_node_id": node_id, "code": f"{code}{seq+1:02d}" if code else "",
                "order": seq})

        lines_out.append({"id": line_id, "operator_id": op_id, "code": code,
            "name_en": name_en, "name_ja": name_ja, "colour": colour,
            "osm_relation_ids": all_rel_ids[:1], "stops": stop_ids_for_line})

    return lines_out, stops_out, station_nodes_out


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------
def stitch_segments(segments: list) -> list:
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
            df = (seg[0][0] - last[0]) ** 2 + (seg[0][1] - last[1]) ** 2
            dr = (seg[-1][0] - last[0]) ** 2 + (seg[-1][1] - last[1]) ** 2
            if df < best_d: best_d, best_i, best_rev = df, i, False
            if dr < best_d: best_d, best_i, best_rev = dr, i, True
        if best_i < 0:
            break
        seg = segments[best_i][::-1] if best_rev else segments[best_i]
        chain.extend(seg[1 if seg[0] == last else 0:])
        used[best_i] = True
    return chain


def fetch_line_geometry(lines: list, existing: dict = None) -> dict:
    result = dict(existing or {})
    for line in lines:
        if line["id"] in result:
            continue  # already have it
        rel_ids = line.get("osm_relation_ids", [])
        if not rel_ids:
            continue
        rel_id = rel_ids[0]
        print(f"  Geometry {line['name_en'][:30]} (rel {rel_id})...", end=" ", flush=True)
        q = f"[out:json][timeout:90];\nrelation(id:{rel_id});\nout geom;"
        try:
            time.sleep(8)
            data = overpass(q)
            segs = []
            for elem in data.get("elements", []):
                if elem["type"] != "relation":
                    continue
                for mem in elem.get("members", []):
                    if mem["type"] == "way" and len(mem.get("geometry", [])) >= 2:
                        segs.append([[p["lon"], p["lat"]] for p in mem["geometry"]])
            if segs:
                result[line["id"]] = stitch_segments(segs)
                print(f"{len(result[line['id']])} pts")
            else:
                print("no geometry")
        except Exception as e:
            print(f"failed: {e}")
    return result


# ---------------------------------------------------------------------------
def write_json(path: Path, data, label=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    n = len(data) if isinstance(data, (list, dict)) else "?"
    print(f"  Wrote {path.name}  ({label or n} records)")


# ---------------------------------------------------------------------------
def main():
    print("=== Tracewise Overpass Ingest ===\n")

    all_lines, all_stops, all_nodes = [], [], []
    seen_osm_node_ids = {}  # shared across all operators for dedup

    # 1. Osaka Metro
    print("Osaka Metro:")
    l, s, n = ingest_operator("大阪市高速電気軌道", OSAKA_METRO_LINES, "osaka-metro")
    for node in n:
        seen_osm_node_ids[node.pop("_osm_id", None)] = node["id"]
    all_lines += l; all_stops += s; all_nodes += n
    time.sleep(3)

    # 2. Kita-Osaka Kyuko
    print("\nKita-Osaka Kyuko:")
    l, s, n = ingest_kita_osaka_kyuko()
    for node in n:
        seen_osm_node_ids[node.pop("_osm_id", None)] = node["id"]
    all_lines += l; all_stops += s; all_nodes += n
    time.sleep(3)

    # 3. Private operators
    for op_id, config in PRIVATE_OP_CONFIGS.items():
        l, s, n = ingest_private_operator(op_id, config, seen_osm_node_ids)
        for node in n:
            node.pop("_osm_id", None)
        all_lines += l; all_stops += s; all_nodes += n
        time.sleep(15)

    # Clean up any remaining _osm_id fields
    for node in all_nodes:
        node.pop("_osm_id", None)

    print(f"\nTotals: {len(all_lines)} lines, {len(all_stops)} stops, {len(all_nodes)} nodes\n")

    write_json(OUT_DIR / "operators.json", OPERATORS)
    write_json(OUT_DIR / "lines.json", all_lines)
    write_json(OUT_DIR / "stops.json", all_stops)
    write_json(OUT_DIR / "station_nodes.json", all_nodes)

    # Load existing geometry so we don't re-fetch already-known lines
    geom_path = OUT_DIR / "line_geometry.json"
    existing_geom = {}
    if geom_path.exists():
        try:
            existing_geom = json.loads(geom_path.read_text(encoding="utf-8"))
            print(f"  Loaded {len(existing_geom)} existing geometry entries")
        except Exception:
            pass

    print("\nFetching line geometry...")
    geom = fetch_line_geometry(all_lines, existing=existing_geom)
    geom_path.write_text(json.dumps(geom, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  Wrote line_geometry.json  ({len(geom)} lines)")

    print("\nDone.")
    print("Run: python -m http.server 8765 (from transit-tool/)")


if __name__ == "__main__":
    main()
