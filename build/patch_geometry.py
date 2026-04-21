"""Fetch geometry for lines missing from line_geometry.json and patch them in."""
import json, requests, time
from pathlib import Path

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
HEADERS = {
    "User-Agent": "Tracewise/0.1 (transit comprehension tool; contact roberto.ionescu@gmail.com)",
    "Accept": "application/json",
}
GEOM_PATH = Path(__file__).parent.parent / "data" / "osaka" / "line_geometry.json"

PATCH = [
    ("osaka-metro-nagahori-tsurumi-ryokuchi-line", 444878),
    ("osaka-metro-yotsubashi-line",                444899),
]

def overpass(query):
    r = requests.get(OVERPASS_URL, params={"data": query}, headers=HEADERS, timeout=90)
    r.raise_for_status()
    return r.json()

def stitch(segments):
    if not segments: return []
    used = [False] * len(segments)
    chain = list(segments[0])
    used[0] = True
    for _ in range(len(segments) - 1):
        last = chain[-1]
        best_i, best_rev, best_d = -1, False, float("inf")
        for i, seg in enumerate(segments):
            if used[i]: continue
            df = (seg[0][0]-last[0])**2  + (seg[0][1]-last[1])**2
            dr = (seg[-1][0]-last[0])**2 + (seg[-1][1]-last[1])**2
            if df < best_d: best_d, best_i, best_rev = df, i, False
            if dr < best_d: best_d, best_i, best_rev = dr, i, True
        if best_i < 0: break
        seg = segments[best_i][::-1] if best_rev else segments[best_i]
        chain.extend(seg[1 if seg[0] == last else 0:])
        used[best_i] = True
    return chain

geom = json.loads(GEOM_PATH.read_text(encoding="utf-8"))

for line_id, rel_id in PATCH:
    print(f"  {line_id} (rel {rel_id})...", flush=True)
    time.sleep(12)
    try:
        data = overpass(f"[out:json][timeout:90];\nrelation(id:{rel_id});\nout geom;")
        segs = []
        for el in data.get("elements", []):
            if el["type"] != "relation": continue
            for m in el.get("members", []):
                if m["type"] == "way" and len(m.get("geometry", [])) >= 2:
                    segs.append([[p["lon"], p["lat"]] for p in m["geometry"]])
        if segs:
            coords = stitch(segs)
            geom[line_id] = coords
            print(f"    {len(coords)} pts from {len(segs)} segments", flush=True)
        else:
            print("    no geometry", flush=True)
    except Exception as e:
        print(f"    FAILED: {e}", flush=True)

GEOM_PATH.write_text(json.dumps(geom, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"Saved. Lines with geometry: {len(geom)}")
