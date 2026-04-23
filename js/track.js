(async () => {
  const { loadCity, el, topbar, qs, freqBucket, BAND_LABELS, BAND_ORDER, CITY } = window.TW;
  const db = await loadCity();
  topbar("tracks");

  // ── Sidebar ──────────────────────────────────────────────────────────────
  const listEl = document.getElementById("track-list");
  const opOrder = db.operators.map(o => o.id);
  const byOp = {};
  for (const t of db.tracks) (byOp[t.operator_id] ||= []).push(t);
  for (const opId of opOrder) {
    const opTracks = byOp[opId] || [];
    if (!opTracks.length) continue;
    const op = db.byId.operators[opId];
    listEl.append(el("li", {
      style: "padding:8px 4px 2px;font-size:11px;color:var(--ink-dim);text-transform:uppercase;letter-spacing:.05em;cursor:default;font-weight:600"
    }, op.name_en));
    for (const t of opTracks) {
      listEl.append(el("li", { onclick: () => location.href = `track.html?id=${t.id}` },
        el("span", { class: "swatch", style: `background:${t.colour || '#888'}` }),
        el("span", {}, t.name_en || t.id)
      ));
    }
  }

  const id    = qs("id") || db.tracks[0]?.id;
  const track = db.byId.tracks[id];
  if (!track) {
    document.getElementById("header").append(el("p", {}, `No track "${id}"`));
    return;
  }

  const op        = db.byId.operators[track.operator_id];
  const lines     = db.linesByTrack[id] || [];
  const services  = db.servicesByTrack[id] || [];
  const rawStops  = db.stopsByTrack[id] || [];
  const seenNodes = new Set();
  const uniqStops = rawStops.filter(s => {
    if (seenNodes.has(s.station_node_id)) return false;
    seenNodes.add(s.station_node_id);
    return true;
  });

  // ── Header ───────────────────────────────────────────────────────────────
  document.getElementById("header").append(
    el("div", { class: "small", style: "margin-bottom:4px" }, "Track — physical corridor"),
    el("h1", {},
      el("span", { style: `display:inline-block;width:14px;height:14px;background:${track.colour || '#888'};border-radius:3px;vertical-align:middle;margin-right:8px` }),
      track.name_en || track.id),
    el("div", { class: "kv", style: "margin-top:8px" },
      el("div", { class: "k" }, "Operator"),
      el("div", { class: "v" }, op?.name_en || track.operator_id || "—"),
      el("div", { class: "k" }, lines.length === 1 ? "Line" : "Lines"),
      el("div", { class: "v" },
        lines.length
          ? lines.map((l, i) => [
              el("a", { href: `line.html?id=${l.id}` },
                el("span", { class: "swatch", style: `background:${l.colour}` }),
                l.display_name_en || l.id),
              i < lines.length - 1 ? document.createTextNode(", ") : null
            ]).flat().filter(Boolean)
          : "—"
      ),
      el("div", { class: "k" }, "Stations"),
      el("div", { class: "v" }, String(uniqStops.length)),
      el("div", { class: "k" }, services.length === 1 ? "Service" : "Services"),
      el("div", { class: "v" }, String(services.length)),
      track.code ? el("div", { class: "k" }, "Code") : null,
      track.code ? el("div", { class: "v" }, el("code", {}, track.code)) : null
    )
  );

  // ── Map (with geometry fallback to station coords) ───────────────────────
  const lineGeom = await fetch(`data/${CITY}/line_geometry.json`)
    .then(r => r.ok ? r.json() : {}).catch(() => ({}));

  const trackMap = new maplibregl.Map({
    container: "track-map",
    style: {
      version: 8,
      sources: {
        carto: {
          type: "raster",
          tiles: [
            "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png",
            "https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png"
          ],
          tileSize: 256, maxzoom: 20,
          attribution: "© CARTO © OpenStreetMap contributors"
        }
      },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": "#f5f5f0" } },
        { id: "carto", type: "raster", source: "carto", paint: { "raster-opacity": 0.85 } }
      ]
    },
    center: [135.5, 34.7], zoom: 11, interactive: true
  });

  trackMap.on("load", () => {
    // Geometry fallback: use station coords in stop order if no OSM geometry
    const nodeCoords = uniqStops.map(s => {
      const n = db.byId.station_nodes[s.station_node_id];
      return n ? [n.lon, n.lat] : null;
    }).filter(Boolean);
    const coords = (lineGeom[id]?.length >= 2) ? lineGeom[id] : nodeCoords;

    if (coords.length >= 2) {
      trackMap.addSource("t", { type: "geojson", data: { type: "Feature",
        properties: {}, geometry: { type: "LineString", coordinates: coords } } });
      trackMap.addLayer({ id: "t-bg", type: "line", source: "t",
        paint: { "line-color": "#fff", "line-width": 6, "line-opacity": 0.7 } });
      trackMap.addLayer({ id: "t-fg", type: "line", source: "t",
        layout: { "line-cap": "round" },
        paint: { "line-color": track.colour || "#888", "line-width": 3 } });
    }

    const stopFeatures = uniqStops.map(stp => {
      const node = db.byId.station_nodes[stp.station_node_id];
      if (!node) return null;
      return { type: "Feature",
        properties: { name: node.name_en, id: node.id },
        geometry: { type: "Point", coordinates: [node.lon, node.lat] } };
    }).filter(Boolean);

    if (stopFeatures.length) {
      trackMap.addSource("stops", { type: "geojson",
        data: { type: "FeatureCollection", features: stopFeatures } });
      trackMap.addLayer({ id: "stops-c", type: "circle", source: "stops",
        paint: { "circle-radius": 4, "circle-color": "#fff",
          "circle-stroke-color": track.colour || "#888", "circle-stroke-width": 2 } });
      trackMap.addLayer({
        id: "stops-labels", type: "symbol", source: "stops",
        minzoom: 12,
        layout: {
          "text-field": ["get", "name"], "text-font": ["Open Sans Regular"],
          "text-size": 11, "text-offset": [0, 1.2], "text-anchor": "top",
          "text-max-width": 8, "text-allow-overlap": false
        },
        paint: { "text-color": "#111", "text-halo-color": "rgba(255,255,255,0.9)", "text-halo-width": 1.5 }
      });
      trackMap.on("click", "stops-c", e => {
        if (e.features.length) location.href = `station.html?id=${e.features[0].properties.id}`;
      });
      trackMap.on("mouseenter", "stops-c", () => trackMap.getCanvas().style.cursor = "pointer");
      trackMap.on("mouseleave", "stops-c", () => trackMap.getCanvas().style.cursor = "");

      const nodes = uniqStops.map(s => db.byId.station_nodes[s.station_node_id]).filter(Boolean);
      const lons = nodes.map(n => n.lon), lats = nodes.map(n => n.lat);
      trackMap.fitBounds(
        [[Math.min(...lons) - 0.01, Math.min(...lats) - 0.01],
         [Math.max(...lons) + 0.01, Math.max(...lats) + 0.01]],
        { padding: 30, duration: 0 }
      );
    }
  });

  // ── Services on this track (stopping pattern + frequency) ────────────────
  const svcDiv = document.getElementById("services");
  if (!services.length) {
    svcDiv.append(el("div", { class: "small" }, "No services recorded for this track."));
  } else {
    const wrap = el("div", { class: "matrix-wrap" });
    const tbl = el("table", { class: "matrix" });
    const thead = el("thead");
    const headRow = el("tr");
    headRow.append(el("th", { class: "svc" }, "Service ↓ / Stop →"));
    for (const stp of uniqStops) {
      const node = db.byId.station_nodes[stp.station_node_id];
      headRow.append(el("th", { class: "stopcol" }, node?.name_en || stp.code || ""));
    }
    thead.append(headRow);
    tbl.append(thead);

    const tbody = el("tbody");
    for (const svc of services) {
      const servedNodes = new Set(
        (svc.stop_pattern || []).map(sid => db.byId.stops[sid]?.station_node_id).filter(Boolean)
      );
      const tr = el("tr");
      const peakTph = Math.max(0, ...Object.values(svc.frequency_bands || {}));
      const freqClass = `f${freqBucket(peakTph)}`;
      const freqParts = Object.entries(svc.frequency_bands || {})
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${BAND_LABELS[k] || k} ${v}`).join(" · ");

      tr.append(el("th", { class: "svc" },
        el("a", { href: `service.html?id=${svc.id}`, style: "font-weight:600" },
          svc.display_name_en || svc.id),
        el("div", { class: "small", style: "margin-top:2px" }, freqParts)
      ));
      for (const stp of uniqStops) {
        const served = servedNodes.has(stp.station_node_id);
        tr.append(el("td", { class: "stop" },
          el("span", { class: served ? "dot f3" : "dot f0" })
        ));
      }
      tbody.append(tr);
    }
    tbl.append(tbody);
    wrap.append(tbl);
    svcDiv.append(wrap);
  }

  // ── Per-band frequency heatmap at each station (aggregate across services) ──
  const heatDiv = document.getElementById("heat");
  if (heatDiv && services.length) {
    const wrap = el("div", { class: "matrix-wrap" });
    const tbl = el("table", { class: "matrix" });
    const thead = el("thead");
    const headRow = el("tr");
    headRow.append(el("th", { class: "svc" }, "Band ↓ / Stop →"));
    for (const stp of uniqStops) {
      const node = db.byId.station_nodes[stp.station_node_id];
      headRow.append(el("th", { class: "stopcol" }, node?.name_en || ""));
    }
    thead.append(headRow);
    tbl.append(thead);

    const tbody = el("tbody");
    for (const band of BAND_ORDER) {
      const tr = el("tr");
      tr.append(el("th", { class: "svc" }, BAND_LABELS[band]));
      for (const stp of uniqStops) {
        let tph = 0;
        for (const svc of services) {
          const stops = svc.stop_pattern || [];
          const hits = stops.some(sid => db.byId.stops[sid]?.station_node_id === stp.station_node_id);
          if (hits) tph += (svc.frequency_bands?.[band] || 0);
        }
        tr.append(el("td", { class: `stop freq-cell f${freqBucket(tph)}` },
          tph > 0 ? String(tph) : ""
        ));
      }
      tbody.append(tr);
    }
    tbl.append(tbody);
    wrap.append(tbl);
    heatDiv.append(wrap);
  }

  // ── Station list (vertical) ──────────────────────────────────────────────
  const stnDiv = document.getElementById("stations");
  if (!uniqStops.length) {
    stnDiv.append(el("div", { class: "small" }, "No stops recorded for this track."));
  } else {
    const list = el("div", { class: "stop-list" });
    for (const stp of uniqStops) {
      const node = db.byId.station_nodes[stp.station_node_id];
      list.append(el("div", {
        class: "stop-row", style: "cursor:pointer",
        onclick: () => { location.href = `station.html?id=${stp.station_node_id}`; }
      },
        el("span", { class: "stop-dot", style: `background:${track.colour || '#888'};border-color:${track.colour || '#888'}` }),
        el("div", { class: "stop-row-text" },
          el("span", { class: "stop-name" }, node?.name_en || stp.station_node_id),
          node?.name_ja ? el("span", { class: "small", style: "margin-left:6px" }, node.name_ja) : null
        ),
        el("span", { class: "stop-code" }, stp.code || "")
      ));
    }
    stnDiv.append(list);
  }
})();
