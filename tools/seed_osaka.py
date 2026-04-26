"""
seed_osaka.py — generates Osaka data files for Tracewise v1.

Curated from public sources (Osaka Metro official, Wikipedia, OpenStreetMap).
Coordinates are approximate (good for visualisation; refine via build_geometry.py).
Frequencies are mid-2025 typical-day estimates from Osaka Metro timetables.

Run from repo root:  python tools/seed_osaka.py
"""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT  = ROOT / "data" / "osaka"
OUT.mkdir(parents=True, exist_ok=True)
(ROOT / "data").mkdir(exist_ok=True)


def write(name, payload):
    path = OUT / name if name != "cities.json" else ROOT / "data" / name
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)}  ({len(payload) if isinstance(payload, list) else 'obj'} items)")


# ---------- 1. cities ----------

cities = [
    {"id": "osaka", "name_en": "Osaka", "name_ja": "大阪", "default": True}
]

# ---------- 2. config ----------

config = {
    "cluster_threshold_m": 250,
    "default_centre": [135.502, 34.686],
    "default_zoom": 11.5
}

# ---------- 3. operators ----------

operators = [
    {"id": "osaka-metro", "name_en": "Osaka Metro",       "name_ja": "大阪メトロ",   "colour": "#1A4F9C", "url": "https://www.osakametro.co.jp/en/"},
    {"id": "jr-west",     "name_en": "JR West",           "name_ja": "JR西日本",     "colour": "#0072BC", "url": "https://www.westjr.co.jp/global/en/"},
    {"id": "hankyu",      "name_en": "Hankyu Railway",    "name_ja": "阪急電鉄",     "colour": "#7B2D26", "url": "https://www.hankyu.co.jp/global/en/"},
    {"id": "hanshin",     "name_en": "Hanshin Railway",   "name_ja": "阪神電鉄",     "colour": "#FFC107", "url": "https://rail.hanshin.co.jp/global/en/"},
    {"id": "keihan",      "name_en": "Keihan Railway",    "name_ja": "京阪電鉄",     "colour": "#0F6E3F", "url": "https://www.keihan.co.jp/travel/en/"},
    {"id": "kintetsu",    "name_en": "Kintetsu Railway",  "name_ja": "近鉄",         "colour": "#C8102E", "url": "https://www.kintetsu.co.jp/foreign/english/"},
    {"id": "nankai",      "name_en": "Nankai Electric Railway", "name_ja": "南海電鉄", "colour": "#003D7C", "url": "https://www.nankai.co.jp/library/en/"},
    {"id": "kobe-rapid",  "name_en": "Kobe Rapid Transit","name_ja": "神戸高速",     "colour": "#7E7E7E", "url": ""},
]

# ---------- 4. Osaka Metro lines ----------
# Each entry: (line_id_short, code, en, ja, colour, [(node_id, name_en, name_ja, lat, lon, code), ...])
# Coordinates from OSM/Google approx; codes are official.

LINES = [
    ("midosuji", "M", "Midosuji Line", "御堂筋線", "#D7252A", [
        ("esaka",                "Esaka",                 "江坂",            34.76060, 135.49778, "M11"),
        ("higashi-mikuni",       "Higashi-Mikuni",        "東三国",          34.74815, 135.49814, "M12"),
        ("shin-osaka",           "Shin-Osaka",            "新大阪",          34.73362, 135.50016, "M13"),
        ("nishinakajima",        "Nishinakajima-Minamigata","西中島南方",    34.72594, 135.49955, "M14"),
        ("nakatsu",              "Nakatsu",               "中津",            34.71140, 135.49765, "M15"),
        ("umeda",                "Umeda",                 "梅田",            34.70244, 135.49830, "M16"),
        ("yodoyabashi",          "Yodoyabashi",           "淀屋橋",          34.69247, 135.50106, "M17"),
        ("honmachi",             "Honmachi",              "本町",            34.68340, 135.49962, "M18"),
        ("shinsaibashi",         "Shinsaibashi",          "心斎橋",          34.67475, 135.50108, "M19"),
        ("namba",                "Namba",                 "難波",            34.66639, 135.50054, "M20"),
        ("daikokucho",           "Daikokucho",            "大国町",          34.65890, 135.49807, "M21"),
        ("dobutsuen-mae",        "Dobutsuen-mae",         "動物園前",        34.65166, 135.50284, "M22"),
        ("tennoji",              "Tennoji",               "天王寺",          34.64729, 135.51343, "M23"),
        ("showacho",             "Showacho",              "昭和町",          34.63425, 135.51797, "M24"),
        ("nishitanabe",          "Nishitanabe",           "西田辺",          34.62410, 135.51957, "M25"),
        ("nagai",                "Nagai",                 "長居",            34.60937, 135.51980, "M26"),
        ("abiko",                "Abiko",                 "あびこ",          34.60088, 135.52083, "M27"),
        ("kita-hanada",          "Kita-Hanada",           "北花田",          34.59247, 135.50920, "M28"),
        ("shin-kanaoka",         "Shin-Kanaoka",          "新金岡",          34.57884, 135.50250, "M29"),
        ("nakamozu",             "Nakamozu",              "なかもず",        34.56972, 135.49444, "M30"),
    ]),
    ("tanimachi", "T", "Tanimachi Line", "谷町線", "#522F92", [
        ("dainichi",             "Dainichi",              "大日",            34.76842, 135.59731, "T11"),
        ("moriguchi",            "Moriguchi",             "守口",            34.75857, 135.57710, "T12"),
        ("taishibashi-imaichi",  "Taishibashi-Imaichi",   "太子橋今市",      34.75113, 135.55890, "T13"),
        ("sembayashi-omiya",     "Sembayashi-Omiya",      "千林大宮",        34.74420, 135.54530, "T14"),
        ("sekime-takadono",      "Sekime-Takadono",       "関目高殿",        34.73613, 135.53590, "T15"),
        ("noe-uchindai",         "Noe-Uchindai",          "野江内代",        34.72720, 135.52730, "T16"),
        ("miyakojima",           "Miyakojima",            "都島",            34.71800, 135.52260, "T17"),
        ("tenjimbashisuji-6",    "Tenjimbashisuji 6-chome","天神橋筋六丁目", 34.71135, 135.51160, "T18"),
        ("nakazakicho",          "Nakazakicho",           "中崎町",          34.70686, 135.50480, "T19"),
        ("higashi-umeda",        "Higashi-Umeda",         "東梅田",          34.70183, 135.50142, "T20"),
        ("minami-morimachi",     "Minami-Morimachi",      "南森町",          34.69587, 135.51016, "T21"),
        ("tenmabashi",           "Tenmabashi",            "天満橋",          34.68705, 135.51537, "T22"),
        ("tanimachi-4",          "Tanimachi 4-chome",     "谷町四丁目",      34.68290, 135.51760, "T23"),
        ("tanimachi-6",          "Tanimachi 6-chome",     "谷町六丁目",      34.67550, 135.51877, "T24"),
        ("tanimachi-9",          "Tanimachi 9-chome",     "谷町九丁目",      34.66662, 135.51910, "T25"),
        ("shitennoji-mae",       "Shitennoji-mae Yuhigaoka","四天王寺前夕陽ヶ丘",34.66012,135.51910,"T26"),
        ("tennoji-t",            "Tennoji",               "天王寺",          34.64729, 135.51343, "T27"),
        ("abeno",                "Abeno",                 "阿倍野",          34.64173, 135.51416, "T28"),
        ("showacho-t",           "Showacho",              "昭和町",          34.63425, 135.51797, "T29"),
        ("tanabe",               "Tanabe",                "田辺",            34.62570, 135.52306, "T30"),
        ("komagawa-nakano",      "Komagawa-Nakano",       "駒川中野",        34.61790, 135.53000, "T31"),
        ("hirano",               "Hirano",                "平野",            34.61055, 135.54470, "T32"),
        ("kire-uriwari",         "Kire-Uriwari",          "喜連瓜破",        34.60330, 135.55880, "T33"),
        ("deto",                 "Deto",                  "出戸",            34.59940, 135.57220, "T34"),
        ("nagahara",             "Nagahara",              "長原",            34.60020, 135.58920, "T35"),
        ("yao-minami",           "Yao-Minami",            "八尾南",          34.60330, 135.59800, "T36"),
    ]),
    ("yotsubashi", "Y", "Yotsubashi Line", "四つ橋線", "#1976D2", [
        ("nishi-umeda",          "Nishi-Umeda",           "西梅田",          34.70060, 135.49570, "Y11"),
        ("higobashi",            "Higobashi",             "肥後橋",          34.69220, 135.49580, "Y12"),
        ("hommachi-y",           "Hommachi",              "本町",            34.68340, 135.49678, "Y13"),
        ("yotsubashi",           "Yotsubashi",            "四ツ橋",          34.67485, 135.49810, "Y14"),
        ("namba-y",              "Namba",                 "なんば",          34.66645, 135.49744, "Y15"),
        ("daikokucho-y",         "Daikokucho",            "大国町",          34.65890, 135.49807, "Y16"),
        ("hanazonocho",          "Hanazonocho",           "花園町",          34.64976, 135.49170, "Y17"),
        ("kishinosato",          "Kishinosato",           "岸里",            34.64141, 135.49570, "Y18"),
        ("tamade",               "Tamade",                "玉出",            34.62720, 135.49384, "Y19"),
        ("kitabatake",           "Kitabatake",            "北加賀屋",        34.61530, 135.48800, "Y20"),
        ("suminoekoen",          "Suminoekoen",           "住之江公園",      34.60800, 135.48420, "Y21"),
    ]),
    ("chuo", "C", "Chuo Line", "中央線", "#009E60", [
        ("cosmosquare",          "Cosmosquare",           "コスモスクエア",  34.64333, 135.41110, "C10"),
        ("osakako",              "Osakako",               "大阪港",          34.65487, 135.43510, "C11"),
        ("asashiobashi",         "Asashiobashi",          "朝潮橋",          34.66247, 135.44490, "C12"),
        ("bentencho",            "Bentencho",             "弁天町",          34.66923, 135.46193, "C13"),
        ("kujo",                 "Kujo",                  "九条",            34.67445, 135.47410, "C14"),
        ("awaza",                "Awaza",                 "阿波座",          34.68190, 135.48533, "C15"),
        ("hommachi-c",           "Hommachi",              "本町",            34.68340, 135.49962, "C16"),
        ("sakaisuji-hommachi",   "Sakaisuji-Hommachi",    "堺筋本町",        34.68362, 135.50705, "C17"),
        ("tanimachi-4-c",        "Tanimachi 4-chome",     "谷町四丁目",      34.68290, 135.51760, "C18"),
        ("morinomiya",           "Morinomiya",            "森ノ宮",          34.68310, 135.53156, "C19"),
        ("midoribashi",          "Midoribashi",           "緑橋",            34.67930, 135.54290, "C20"),
        ("fukaebashi",           "Fukaebashi",            "深江橋",          34.67845, 135.55460, "C21"),
        ("takaida",              "Takaida",               "高井田",          34.67667, 135.57080, "C22"),
        ("nagata",               "Nagata",                "長田",            34.67460, 135.58320, "C23"),
    ]),
    ("sennichimae", "S", "Sennichimae Line", "千日前線", "#E85298", [
        ("nodahanshin",          "Nodahanshin",           "野田阪神",        34.69505, 135.47190, "S11"),
        ("tamagawa",             "Tamagawa",              "玉川",            34.69100, 135.48022, "S12"),
        ("awaza-s",              "Awaza",                 "阿波座",          34.68190, 135.48533, "S13"),
        ("nishi-nagahori",       "Nishi-Nagahori",        "西長堀",          34.67802, 135.48670, "S14"),
        ("sakuragawa",           "Sakuragawa",            "桜川",            34.67133, 135.49120, "S15"),
        ("namba-s",              "Namba",                 "なんば",          34.66600, 135.50213, "S16"),
        ("nippombashi",          "Nippombashi",           "日本橋",          34.66610, 135.50678, "S17"),
        ("tanimachi-9-s",        "Tanimachi 9-chome",     "谷町九丁目",      34.66662, 135.51910, "S18"),
        ("tsuruhashi",           "Tsuruhashi",            "鶴橋",            34.66520, 135.53104, "S19"),
        ("imazato",              "Imazato",               "今里",            34.66533, 135.55155, "S20"),
        ("shin-fukae",           "Shin-Fukae",            "新深江",          34.67000, 135.55960, "S21"),
        ("shoji",                "Shoji",                 "小路",            34.66785, 135.57140, "S22"),
        ("kitatatsumi",          "Kitatatsumi",           "北巽",            34.66110, 135.57890, "S23"),
        ("minami-tatsumi",       "Minami-Tatsumi",        "南巽",            34.65512, 135.58550, "S24"),
    ]),
    ("sakaisuji", "K", "Sakaisuji Line", "堺筋線", "#8B5A2B", [
        ("tenjimbashisuji-6-k",  "Tenjimbashisuji 6-chome","天神橋筋六丁目", 34.71135, 135.51160, "K11"),
        ("ogimachi",             "Ogimachi",              "扇町",            34.70395, 135.51010, "K12"),
        ("minami-morimachi-k",   "Minami-Morimachi",      "南森町",          34.69587, 135.51016, "K13"),
        ("kitahama",             "Kitahama",              "北浜",            34.69020, 135.50858, "K14"),
        ("sakaisuji-hommachi-k", "Sakaisuji-Hommachi",    "堺筋本町",        34.68362, 135.50705, "K15"),
        ("nagahoribashi",        "Nagahoribashi",         "長堀橋",          34.67500, 135.50686, "K16"),
        ("nippombashi-k",        "Nippombashi",           "日本橋",          34.66610, 135.50678, "K17"),
        ("ebisucho",             "Ebisucho",              "恵美須町",        34.65540, 135.50580, "K18"),
        ("dobutsuen-mae-k",      "Dobutsuen-mae",         "動物園前",        34.65166, 135.50284, "K19"),
        ("tengachaya",           "Tengachaya",            "天下茶屋",        34.63873, 135.50173, "K20"),
    ]),
    ("nagahori", "N", "Nagahori Tsurumi-ryokuchi Line", "長堀鶴見緑地線", "#80C342", [
        ("taisho",               "Taisho",                "大正",            34.66724, 135.48450, "N11"),
        ("dome-mae-chiyozaki",   "Dome-mae Chiyozaki",    "ドーム前千代崎",  34.67133, 135.48180, "N12"),
        ("nishi-nagahori-n",     "Nishi-Nagahori",        "西長堀",          34.67802, 135.48670, "N13"),
        ("nishi-ohashi",         "Nishi-Ohashi",          "西大橋",          34.67500, 135.49622, "N14"),
        ("shinsaibashi-n",       "Shinsaibashi",          "心斎橋",          34.67475, 135.50108, "N15"),
        ("nagahoribashi-n",      "Nagahoribashi",         "長堀橋",          34.67500, 135.50686, "N16"),
        ("matsuyamachi",         "Matsuyamachi",          "松屋町",          34.67558, 135.51370, "N17"),
        ("tanimachi-6-n",        "Tanimachi 6-chome",     "谷町六丁目",      34.67550, 135.51877, "N18"),
        ("tamatsukuri",          "Tamatsukuri",           "玉造",            34.68170, 135.53288, "N19"),
        ("morinomiya-n",         "Morinomiya",            "森ノ宮",          34.68310, 135.53156, "N20"),
        ("osaka-business-park",  "Osaka Business Park",   "大阪ビジネスパーク",34.68953,135.53400, "N21"),
        ("kyobashi",             "Kyobashi",              "京橋",            34.69655, 135.53420, "N22"),
        ("gamo-4",               "Gamo 4-chome",          "蒲生四丁目",      34.70320, 135.55050, "N23"),
        ("imafuku-tsurumi",      "Imafuku-Tsurumi",       "今福鶴見",        34.71040, 135.56415, "N24"),
        ("yokozutsumi",          "Yokozutsumi",           "横堤",            34.71375, 135.57787, "N25"),
        ("tsurumi-ryokuchi",     "Tsurumi-ryokuchi",      "鶴見緑地",        34.71953, 135.58410, "N26"),
        ("kadoma-minami",        "Kadoma-Minami",         "門真南",          34.72513, 135.59230, "N27"),
    ]),
    ("imazatosuji", "I", "Imazatosuji Line", "今里筋線", "#F39800", [
        ("itakano",              "Itakano",               "井高野",          34.75770, 135.54710, "I11"),
        ("zuiko-4",              "Zuiko 4-chome",         "瑞光四丁目",      34.75103, 135.54400, "I12"),
        ("daido-toyosato",       "Daido-Toyosato",        "だいどう豊里",    34.74287, 135.54400, "I13"),
        ("furukawabashi",        "Furukawabashi",         "古市",            34.73443, 135.54573, "I14"),
        ("seimei-ga-oka",        "Seimei-ga-oka",         "清水",            34.72683, 135.54720, "I15"),
        ("shin-moriguchi",       "Shin-Moriguchi",        "新森古市",        34.72390, 135.54980, "I16"),
        ("sembayashi",           "Sembayashi",            "千林",            34.73560, 135.55385, "I17"),
        ("sekime-seiiku",        "Sekime-Seiiku",         "関目成育",        34.73026, 135.55665, "I18"),
        ("gamo-4-i",             "Gamo 4-chome",          "蒲生四丁目",      34.70320, 135.55050, "I19"),
        ("imazato-i",            "Imazato",               "今里",            34.66533, 135.55155, "I20"),
    ]),
    ("nanko", "P", "Nanko Port Town Line", "南港ポートタウン線", "#00ABDB", [
        ("cosmosquare-p",        "Cosmosquare",           "コスモスクエア",  34.64333, 135.41110, "P09"),
        ("trade-center-mae",     "Trade Center-mae",      "トレードセンター前",34.64950,135.41785, "P10"),
        ("nakafuto",             "Nakafuto",              "中ふ頭",          34.64223, 135.42605, "P11"),
        ("port-town-nishi",      "Port Town-nishi",       "ポートタウン西",  34.63460, 135.42915, "P12"),
        ("port-town-higashi",    "Port Town-higashi",     "ポートタウン東",  34.63095, 135.43480, "P13"),
        ("ferry-terminal",       "Ferry Terminal",        "フェリーターミナル",34.62498,135.43810, "P14"),
        ("nanko-east",           "Nanko-East",            "南港東",          34.61863, 135.44085, "P15"),
        ("nanko-guchi",          "Nanko-guchi",           "南港口",          34.61190, 135.44320, "P16"),
        ("hirabayashi",          "Hirabayashi",           "平林",            34.60710, 135.45810, "P17"),
        ("suminoekoen-p",        "Suminoekoen",           "住之江公園",      34.60800, 135.48420, "P18"),
    ]),
]

# ---------- Build station_nodes ----------
# One node per physical station. Stations shared across lines (e.g., Umeda M16 ≠ Umeda Hankyu)
# share a node only when same name and very close coords.
# For simplicity: collapse Metro stations with identical name_en and lat/lon within 50m to one node.

def haversine(a, b):
    from math import radians, sin, cos, asin, sqrt
    lat1, lon1 = a; lat2, lon2 = b
    dLat = radians(lat2 - lat1); dLon = radians(lon2 - lon1)
    h = sin(dLat/2)**2 + cos(radians(lat1))*cos(radians(lat2))*sin(dLon/2)**2
    return 2 * 6371008.8 * asin(sqrt(h))

# Pass 1: collect every (line stop) entry with a tentative node id from line list.
raw_entries = []
for line_short, code, en, ja, colour, stations in LINES:
    for (nid, sname_en, sname_ja, lat, lon, scode) in stations:
        raw_entries.append({
            "line_short": line_short, "code": code,
            "node_id_hint": nid, "name_en": sname_en, "name_ja": sname_ja,
            "lat": lat, "lon": lon, "scode": scode
        })

# Pass 2: collapse duplicates by (name_en, within 100m) → canonical node id = first encountered hint without line suffix
canonical = {}  # (name_en) → canonical node record
for e in raw_entries:
    key = e["name_en"]
    found = None
    for cand in canonical.get(key, []):
        if haversine((e["lat"], e["lon"]), (cand["lat"], cand["lon"])) < 100:
            found = cand; break
    if found:
        e["canonical_node_id"] = found["id"]
    else:
        # promote: canonical id = name_en lowercased + slug, no line suffix
        slug = e["node_id_hint"].split("-")[0] if e["node_id_hint"].endswith(("-y","-c","-k","-n","-s","-i","-p","-t")) else e["node_id_hint"]
        # better: re-derive from name_en
        slug = (e["name_en"].lower()
                .replace(" ", "-").replace("'", "")
                .replace("ō","o").replace("ū","u").replace("ē","e")
                .replace("ā","a").replace("ī","i")
                .replace("/", "-").replace(",", ""))
        # ensure unique within station_node space
        candidate_id = f"osaka-metro--{slug}"
        used = {n["id"] for arr in canonical.values() for n in arr}
        i = 2
        while candidate_id in used:
            candidate_id = f"osaka-metro--{slug}-{i}"; i += 1
        rec = {
            "id": candidate_id, "name_en": e["name_en"], "name_ja": e["name_ja"],
            "lat": e["lat"], "lon": e["lon"], "operator_id": "osaka-metro"
        }
        canonical.setdefault(key, []).append(rec)
        e["canonical_node_id"] = candidate_id

station_nodes = sorted(
    [n for arr in canonical.values() for n in arr],
    key=lambda n: n["id"]
)

# ---------- Build tracks, lines, stops ----------

tracks = []
lines = []
stops = []
services = []

for line_short, code, en, ja, colour, stations in LINES:
    track_id = f"osaka-metro-{line_short}"
    line_id  = f"osaka-metro-{line_short}"
    tracks.append({
        "id": track_id, "operator_id": "osaka-metro",
        "name_en": en, "name_ja": ja, "colour": colour, "code": code
    })
    lines.append({
        "id": line_id, "primary_operator_id": "osaka-metro",
        "display_name_en": en, "display_name_ja": ja, "colour": colour,
        "tracks": [track_id]
    })
    seq = 0
    stop_pattern = []
    for e in raw_entries:
        if e["line_short"] != line_short: continue
        sid = f"{track_id}--{e['scode'].lower()}"
        stops.append({
            "id": sid, "track_id": track_id,
            "station_node_id": e["canonical_node_id"],
            "sequence": seq, "code": e["scode"], "km_post": None
        })
        stop_pattern.append(sid)
        seq += 1
    # one Local service per line
    services.append({
        "id": f"{line_id}--local",
        "line_id": line_id,
        "display_name_en": "Local", "display_name_ja": "普通",
        "service_type": "local", "supplement": "none",
        "notes": "All-stops service.",
        "line_path": [{
            "track_id": track_id,
            "from_stop": stop_pattern[0],
            "to_stop": stop_pattern[-1]
        }],
        "stop_pattern": stop_pattern,
        "frequency_bands": {
            "peak_am": 12, "midday": 8, "peak_pm": 12, "evening": 6, "weekend": 8
        }
    })

# Midosuji has higher frequency in real life
for s in services:
    if s["id"].endswith("midosuji--local"):
        s["frequency_bands"] = {"peak_am": 16, "midday": 10, "peak_pm": 16, "evening": 8, "weekend": 10}
    if s["id"].endswith("nanko--local"):
        s["frequency_bands"] = {"peak_am": 8, "midday": 6, "peak_pm": 8, "evening": 5, "weekend": 6}

# ---------- Transfers ----------
# Within Metro, line-to-line at one node is implicit (same station_node) — no record needed.
# We add transfers for famous walking interchanges between disconnected nodes.
# In v1 most will be intra-Metro since other operators are placeholders.

transfers = [
    # Umeda complex: Umeda (Midosuji) ↔ Higashi-Umeda (Tanimachi) ↔ Nishi-Umeda (Yotsubashi) — all separate Metro stations
    {
        "id": "tx-umeda--higashi-umeda",
        "a": "osaka-metro--umeda", "b": "osaka-metro--higashi-umeda",
        "category": "different_name_connected",
        "walking_time_min": 5, "paid_area": False,
        "note": "Underground concourse. Tap out and re-tap if outside paid area window."
    },
    {
        "id": "tx-umeda--nishi-umeda",
        "a": "osaka-metro--umeda", "b": "osaka-metro--nishi-umeda",
        "category": "different_name_connected",
        "walking_time_min": 7, "paid_area": False,
        "note": "Long underground walk via Whity Umeda."
    },
    {
        "id": "tx-higashi-umeda--nishi-umeda",
        "a": "osaka-metro--higashi-umeda", "b": "osaka-metro--nishi-umeda",
        "category": "different_name_connected",
        "walking_time_min": 8, "paid_area": False,
        "note": "Diagonal walk across the Umeda complex."
    },
    # Namba: Midosuji M20, Yotsubashi Y15, Sennichimae S16 — all branded Namba but at different concourses
    {
        "id": "tx-namba-m--namba-y",
        "a": "osaka-metro--namba", "b": "osaka-metro--namba",
        "category": "same_name_connected",
        "walking_time_min": 4, "paid_area": True,
        "note": "Within paid area between Midosuji and Yotsubashi platforms."
    },
]

# Filter out the duplicate self-loop on namba (it's the same node already because of dedup)
transfers = [t for t in transfers if t["a"] != t["b"]]

# ---------- Clusters ----------
# Define the famous Umeda/Osaka cluster explicitly so it gets a custom name.
clusters = [
    {
        "id": "umeda-osaka",
        "member_node_ids": [
            "osaka-metro--umeda",
            "osaka-metro--higashi-umeda",
            "osaka-metro--nishi-umeda"
        ],
        "display_name_en": "Umeda / Osaka",
        "display_name_ja": "梅田・大阪",
        "primary_node_id": "osaka-metro--umeda"
    }
]

# ---------- Fare zones ----------
fare_zones = [
    {
        "id": "osaka-metro-standard",
        "operator_id": "osaka-metro",
        "name_en": "Osaka Metro Standard Fare Zone",
        "name_ja": "大阪メトロ普通運賃",
        "supplement_classes": []
    }
]

# ---------- Geometry: straight-line as a starter ----------
# data.js falls back to straight-line when the file is missing or a track is absent.
# Emit an empty object so the file exists; build_geometry.py can fill it later.
geometry = {}

# ---------- Write everything ----------

print("Generating Osaka data...")
write("cities.json", cities)
write("config.json", config)
write("operators.json", operators)
write("tracks.json", tracks)
write("lines.json", lines)
write("station_nodes.json", station_nodes)
write("stops.json", stops)
write("services.json", services)
write("transfers.json", transfers)
write("clusters.json", clusters)
write("fare_zones.json", fare_zones)
write("line_geometry.json", geometry)

print(f"\nDone. {len(station_nodes)} unique nodes, {len(stops)} stops, {len(services)} services.")
