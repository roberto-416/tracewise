#!/usr/bin/env python3
"""
Fix track/line names (remove embedded service-type/direction info)
and remove orphaned bidirectional stops from stops.json.
Also adds the Chuo–Keihanna through-running service.
"""
import json, sys, os
sys.stdout.reconfigure(encoding="utf-8")

BASE = r"C:\Users\Roberto\OneDrive\Claude\projects\transit-tool\data\osaka"

def load(fn):
    with open(os.path.join(BASE, fn), encoding="utf-8") as f:
        return json.load(f)

def save(fn, data):
    with open(os.path.join(BASE, fn), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  Saved {fn} ({len(data)} items)")

tracks   = load("tracks.json")
lines    = load("lines.json")
stops    = load("stops.json")
services = load("services.json")

# -- 1. Name fixes (tracks.json name_en) ----------------------------------
TRACK_NAMES = {
    "Hankyu Kyoto Line: Osaka Umeda=>Kyoto Kawabaramachi":            "Hankyu Kyoto Line",
    "Hankyū Senri Line (northbound)":                                   "Hankyū Senri Line",
    "Kobe Kosoku Tozai Line (north section)":                           "Kobe Kosoku Tozai Line",
    "Hanshin Kobe Kosoku Line Local (Motomachi => Nishidai)":           "Hanshin Kobe Kosoku Line",
    "Hanshin Main Line Local (Motomachi => Osaka-Umeda)":               "Hanshin Main Line",
    "Hanshin Mukogawa Line Local (Mukogawa => Mukogawadanchimae)":      "Hanshin Mukogawa Line",
    "Hanshin Namba Line Local (Osaka-Namba => Amagasaki)":              "Hanshin Namba Line",
    "JR Kansai Airport Line Shuttle (Kansai Airport => Hineno)":        "JR Kansai Airport Line",
    "Kansai Airport Rapid (Kansai Airport => Kyobashi)":                "Kansai Airport Rapid Line",
    "Keihan Keishin Line (Eastbound)":                                  "Keihan Keishin Line",
    "Keihan Uji Line (Chushojima => Uji)":                              "Keihan Uji Line",
    "Kintetsu D\u014dmy\u014dji Line Local (Kashiwara => D\u014dmy\u014dji)":    "Kintetsu D\u014dmyoji Line",
    "Kintetsu Gose Line Local (Shakudo => Kintetsu-Gose)":              "Kintetsu Gose Line",
    "Kintetsu Ikoma Line Local (Oji => Ikoma)":                         "Kintetsu Ikoma Line",
    "Kintetsu Kashihara Line Local (Yamato-Saidaiji => Kashiharajingu-mae)": "Kintetsu Kashihara Line",
    "Kintetsu Keihanna Line Local (Nagata => Gakken-Nara-Tomigaoka)":   "Kintetsu Keihanna Line",
    "Kintetsu Kyoto Line Local (Yamato-Saidaiji => Kintetsu-Kyoto)":    "Kintetsu Kyoto Line",
    "Kintetsu Minami-Osaka Line Local (Osaka-Abenobashi => Kashiharajingumae)": "Kintetsu Minami-Osaka Line",
    "Kintetsu Nagano Line Local (Furuichi => Kawachi-Nagano)":          "Kintetsu Nagano Line",
    "Kintetsu Nara Line Local (Fuse => Kintetsu-Nara)":                 "Kintetsu Nara Line",
    "Kintetsu Osaka Line Local (Ise-Nakagawa => Osaka-Uehonmachi)":     "Kintetsu Osaka Line",
    "Kintetsu Tawaramoto Line Local (Shin-Oji => Nishi-Tawaramoto)":    "Kintetsu Tawaramoto Line",
    "Kintetsu Tenri Line Local (Tenri => Hirahata)":                    "Kintetsu Tenri Line",
    "Kintetsu Yoshino Line Local (Yoshino => Kashiharajingumae)":       "Kintetsu Yoshino Line",
    "Nankai Airport Line Local (Namba => Kansai Airport)":              "Nankai Airport Line",
    "Nankai Kada Line Local (Kada => Wakayamashi)":                     "Nankai Kada Line",
    "Nankai Main Line Local (Namba => Wakayamashi)":                    "Nankai Main Line",
    "Nankai Shiomibashi Line Local (Kishinosato-Tamade => Shiomibashi)":"Nankai Shiomibashi Line",
    "Nankai Takashinohama Line Local (Hagoromo => Takashinohama)":      "Nankai Takashinohama Line",
    "Nankai Tanagawa Line Local (Misakikoen => Tanagawa)":              "Nankai Tanagawa Line",
}

print("\n-- 1. Track name fixes ----------------------------------------------")
track_changes = 0
for t in tracks:
    old = t.get("name_en", "")
    if old in TRACK_NAMES:
        t["name_en"] = TRACK_NAMES[old]
        print(f"  {t['id']}")
        print(f"    {old!r}")
        print(f"    -> {t['name_en']!r}")
        track_changes += 1
print(f"  Total: {track_changes} tracks renamed")

# -- 2. Name fixes (lines.json display_name_en) ---------------------------
LINE_NAMES = {
    "Hankyu Kyoto Line: Osaka Umeda=>Kyoto Kawabaramachi":             "Hankyu Kyoto Line",
    "Hankyū Senri Line (northbound)":                                   "Hankyū Senri Line",
    "Kobe Kosoku Tozai Line (north section)":                           "Kobe Kosoku Tozai Line",
    "Hanshin Kobe Kosoku Line Local (Motomachi => Nishidai)":           "Hanshin Kobe Kosoku Line",
    "Hanshin Main Line Local (Motomachi => Osaka-Umeda)":               "Hanshin Main Line",
    "Hanshin Mukogawa Line Local (Mukogawa => Mukogawadanchimae)":      "Hanshin Mukogawa Line",
    "Hanshin Namba Line Local (Osaka-Namba => Amagasaki)":              "Hanshin Namba Line",
    "JR Kansai Airport Line Shuttle (Kansai Airport => Hineno)":        "JR Kansai Airport Line",
    "Kansai Airport Rapid (Kansai Airport => Kyobashi)":                "Kansai Airport Rapid Line",
    "Keihan Keishin Line (Eastbound)":                                  "Keihan Keishin Line",
    "Keihan Uji Line (Chushojima => Uji)":                              "Keihan Uji Line",
    "Kintetsu D\u014dmyoji Line Local (Kashiwara => D\u014dmyoji)":     "Kintetsu D\u014dmyoji Line",
    "Kintetsu D\u014dmyōji Line Local (Kashiwara => D\u014dmyōji)":    "Kintetsu D\u014dmyoji Line",
    "Kintetsu Gose Line Local (Shakudo => Kintetsu-Gose)":              "Kintetsu Gose Line",
    "Kintetsu Ikoma Line Local (Oji => Ikoma)":                         "Kintetsu Ikoma Line",
    "Kintetsu Kashihara Line Local (Yamato-Saidaiji => Kashiharajingu-mae)": "Kintetsu Kashihara Line",
    "Kintetsu Keihanna Line Local (Nagata => Gakken-Nara-Tomigaoka)":   "Kintetsu Keihanna Line",
    "Kintetsu Kyoto Line Local (Yamato-Saidaiji => Kintetsu-Kyoto)":    "Kintetsu Kyoto Line",
    "Kintetsu Minami-Osaka Line Local (Osaka-Abenobashi => Kashiharajingumae)": "Kintetsu Minami-Osaka Line",
    "Kintetsu Nagano Line Local (Furuichi => Kawachi-Nagano)":          "Kintetsu Nagano Line",
    "Kintetsu Nara Line Local (Fuse => Kintetsu-Nara)":                 "Kintetsu Nara Line",
    "Kintetsu Osaka Line Local (Ise-Nakagawa => Osaka-Uehonmachi)":     "Kintetsu Osaka Line",
    "Kintetsu Tawaramoto Line Local (Shin-Oji => Nishi-Tawaramoto)":    "Kintetsu Tawaramoto Line",
    "Kintetsu Tenri Line Local (Tenri => Hirahata)":                    "Kintetsu Tenri Line",
    "Kintetsu Yoshino Line Local (Yoshino => Kashiharajingumae)":       "Kintetsu Yoshino Line",
    "Nankai Airport Line Local (Namba => Kansai Airport)":              "Nankai Airport Line",
    "Nankai Kada Line Local (Kada => Wakayamashi)":                     "Nankai Kada Line",
    "Nankai Main Line Local (Namba => Wakayamashi)":                    "Nankai Main Line",
    "Nankai Shiomibashi Line Local (Kishinosato-Tamade => Shiomibashi)":"Nankai Shiomibashi Line",
    "Nankai Takashinohama Line Local (Hagoromo => Takashinohama)":      "Nankai Takashinohama Line",
    "Nankai Tanagawa Line Local (Misakikoen => Tanagawa)":              "Nankai Tanagawa Line",
}

print("\n-- 2. Line display_name fixes ---------------------------------------")
line_changes = 0
for l in lines:
    old = l.get("display_name_en", "")
    if old in LINE_NAMES:
        l["display_name_en"] = LINE_NAMES[old]
        print(f"  {l['id']}: {old!r}")
        print(f"    -> {l['display_name_en']!r}")
        line_changes += 1
print(f"  Total: {line_changes} lines renamed")

# -- 3. Remove orphaned stops ---------------------------------------------
# Authorized = listed in a track's stops[] array
authorized_stop_ids = set()
for t in tracks:
    for sid in t.get("stops", []):
        authorized_stop_ids.add(sid)

# Safety net: also keep anything referenced by a service
service_stop_ids = set()
for svc in services:
    for sid in svc.get("stop_pattern", []):
        service_stop_ids.add(sid)
    for seg in svc.get("line_path", []):
        for k in ("from_stop", "to_stop"):
            if k in seg:
                service_stop_ids.add(seg[k])

keep_ids = authorized_stop_ids | service_stop_ids

orphans = [s for s in stops if s["id"] not in keep_ids]
stops_clean = [s for s in stops if s["id"] in keep_ids]

print(f"\n-- 3. Orphaned stops removal -----------------------------------------")
print(f"  Before: {len(stops)} stops")
print(f"  Orphans: {len(orphans)}")

# Group by track for readability
by_track = {}
for s in orphans:
    by_track.setdefault(s["track_id"], []).append(s["id"])
for tid, ids in sorted(by_track.items()):
    print(f"  {tid}: removing {len(ids)} stops ({ids[0]} … {ids[-1]})")

print(f"  After: {len(stops_clean)} stops")

# -- 4. Add Chuo–Keihanna through-running service -------------------------
print("\n-- 4. Chuo–Keihanna through service ---------------------------------")
if any(s["id"] == "svc-chuo-keihanna-through" for s in services):
    print("  Already exists — skipping")
else:
    new_svc = {
        "id": "svc-chuo-keihanna-through",
        "display_name_en": "Local (through — Yumeshima to Gakken-Nara-Tomigaoka)",
        "display_name_ja": "普通（夢洲⇔学研奈良登美ヶ丘）",
        "service_type": "local",
        "supplement": "none",
        "line_path": [
            {
                "from_stop": "stop-C01-osaka-metro",
                "to_stop": "stop-C15-osaka-metro",
                "track_id": "osaka-metro-chuo-line"
            },
            {
                "from_stop": "stop-kintetsu-0007",
                "to_stop": "stop-kintetsu-0014",
                "track_id": "kintetsu-kintetsu-keihanna-line"
            }
        ],
        "stop_pattern": [
            "stop-C01-osaka-metro",
            "stop-C02-osaka-metro",
            "stop-C03-osaka-metro",
            "stop-C04-osaka-metro",
            "stop-C05-osaka-metro",
            "stop-C06-osaka-metro",
            "stop-C07-osaka-metro",
            "stop-C08-osaka-metro",
            "stop-C09-osaka-metro",
            "stop-C10-osaka-metro",
            "stop-C11-osaka-metro",
            "stop-C12-osaka-metro",
            "stop-C13-osaka-metro",
            "stop-C14-osaka-metro",
            "stop-C15-osaka-metro",
            "stop-kintetsu-0007",
            "stop-kintetsu-0008",
            "stop-kintetsu-0009",
            "stop-kintetsu-0010",
            "stop-kintetsu-0011",
            "stop-kintetsu-0012",
            "stop-kintetsu-0013",
            "stop-kintetsu-0014"
        ],
        "frequency_bands": {
            "peak_am": 6,
            "midday": 4,
            "peak_pm": 6,
            "evening": 3,
            "late_night": 1,
            "weekend_midday": 4
        },
        "notes": "Through-running service. Fare boundary at Nagata (C15 / kintetsu-0007). Osaka Metro fare applies C01–C15; Kintetsu fare applies beyond.",
        "line_id": "line-osaka-metro-chuo-line"
    }
    # Insert after svc-chuo-short-cosmo
    idx = next((i + 1 for i, s in enumerate(services) if s["id"] == "svc-chuo-short-cosmo"), len(services))
    services.insert(idx, new_svc)
    print(f"  Added at index {idx}")

# -- 5. Validate cross-references -----------------------------------------
print("\n-- 5. Validation ----------------------------------------------------")
stop_ids_final = {s["id"] for s in stops_clean}
errors = []
for svc in services:
    for sid in svc.get("stop_pattern", []):
        if sid not in stop_ids_final:
            errors.append(f"  SERVICE {svc['id']}: stop_pattern ref {sid!r} not in stops.json")
    for seg in svc.get("line_path", []):
        for k in ("from_stop", "to_stop"):
            sid = seg.get(k)
            if sid and sid not in stop_ids_final:
                errors.append(f"  SERVICE {svc['id']}: line_path {k} {sid!r} not in stops.json")

track_ids_final = {t["id"] for t in tracks}
for l in lines:
    for tid in l.get("tracks", []):
        if tid not in track_ids_final:
            errors.append(f"  LINE {l['id']}: tracks[] ref {tid!r} not in tracks.json")

if errors:
    print(f"  ERRORS ({len(errors)}):")
    for e in errors:
        print(e)
    sys.exit(1)
else:
    print(f"  All cross-references OK")

# -- 6. Save --------------------------------------------------------------
print("\n-- 6. Saving --------------------------------------------------------")
save("tracks.json",   tracks)
save("lines.json",    lines)
save("stops.json",    stops_clean)
save("services.json", services)

print("\nDone!")
