# ⚠ This is Tracewise v0 — Superseded

This version was built iteratively without a prior spec. It proved the core concepts but accumulated too many inconsistencies to keep refining. **Tagged as `v0-deprecated` in git.**

A redesigned version (v1) will be built from a full spec document first.

## What v0 proved
- Track → Line → Service three-level hierarchy works
- Station union-find clustering (proximity + transfer edges) works
- MapLibre GL JS is the right map renderer (free, no API key, symbol layers for labels)
- Frequency as tph per band (peak_am / midday / peak_pm / evening / weekend) is the right encoding
- Osaka is the right pilot city

## What v0 got wrong
- Built before a spec existed → constant rework
- Page inconsistencies (some vertical lists, some horizontal)
- Map geometry: OSM bidirectional geometry caused snaking lines (trimGeometry hack)
- Duplicate track rendering on overview map
- "Tracks" vs "Lines" page distinction confused users
- Frequency heatmap started as grey dots, needed to be coloured cells with numbers
- Station labels via DOM markers overlapped badly → had to switch to MapLibre symbol layers
- Shared track sections (e.g. Kintetsu Osaka+Nara sharing Tsuruhashi→Fuse) not modelled properly
- Missing null guards caused "supplement: null" rendering bugs

## To browse v0
Run any local HTTP server from this directory:
```
python -m http.server 8765
```
