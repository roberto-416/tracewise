(async () => {
  const { loadCity, el, topbar, qs, freqBucket, BAND_LABELS, BAND_ORDER, CITY } = window.TW;
  const db = await loadCity();
  topbar("lines");

  // ── Sidebar: Lines grouped by operator ──────────────────────────────────
  const list = document.getElementById("line-list");
  const opOrder = db.operators.map(o => o.id);
  const byOp = {};
  for (const ln of db.lines) (byOp[ln.primary_operator_id] ||= []).push(ln);

  function renderLineList(filter = "") {
    list.innerHTML = "";
    const q = filter.toLowerCase();
    for (const opId of opOrder) {
      const opLines = (byOp[opId] || []).filter(ln =>
        !q || (ln.display_name_en || "").toLowerCase().includes(q) ||
               (ln.display_name_ja || "").includes(filter));
      if (!opLines.length) continue;
      const op = db.byId.operators[opId];
      list.append(el("li", {
        style: "padding:8px 4px 2px;font-size:11px;color:var(--ink-dim);text-transform:uppercase;letter-spacing:.05em;cursor:default;font-weight:600"
      }, op.name_en));
      for (const ln of opLines) {
        const colour = ln.colour || "#888";
        list.append(el("li", { onclick: () => location.href = `line.html?id=${ln.id}` },
          el("span", { class: "swatch", style: `background:${colour}` }),
          ln.display_name_en || ln.display_name_ja));
      }
    }
  }
  document.getElementById("search").addEventListener("input", e => renderLineList(e.target.value));
  renderLineList();

  // ── Main ─────────────────────────────────────────────────────────────────
  const lineId = qs("id") || db.lines.find(l => l.primary_operator_id === "osaka-metro")?.id || db.lines[0]?.id;
  const line   = db.byId.lines[lineId];
  if (!line) { document.getElementById("header").append(el("p", {}, `No line ${lineId}`)); return; }

  const op = db.byId.operators[line.primary_operator_id];
  const tracks = db.tracksByLine[lineId] || [];

  // Per-track stops (deduplicated by node).
  const trackStops = tracks.map(t => {
    const raw = db.stopsByTrack[t.id] || [];
    const seen = new Set();
    return { track: t, stops: raw.filter(s => {
      if (seen.has(s.station_node_id)) return false;
      seen.add(s.station_node_id);
      return true;
    })};
  });
  const allStops = trackStops.flatMap(ts => ts.stops);

  document.getElementById("header").append(
    el("h1", {},
      el("span", { class: "swatch", style: `background:${line.colour};width:14px;height:14px;display:inline-block;border-radius:3px;vertical-align:middle;margin-right:6px` }),
      line.display_name_en || "", " ",
      el("span", { class: "small" }, line.display_name_ja || "")),
    el("div", { class: "kv" },
      el("div", { class: "k" }, "Operator"),
      el("div", { class: "v" }, op?.name_en || "—"),
      el("div", { class: "k" }, tracks.length > 1 ? "Tracks" : "Track"),
      el("div", { class: "v" }, ...tracks.map((t, i) => {
        const tOp = db.byId.operators[t.operator_id];
        const link = el("a", { href: `track.html?id=${t.id}` }, t.name_en || t.id);
        const opNote = (tOp && tOp.id !== line.primary_operator_id)
          ? el("span", { class: "small", style: "margin-left:4px" }, `(${tOp.name_en})`)
          : null;
        return [link, opNote, i < tracks.length - 1 ? document.createTextNode(" · ") : null];
      }).flat().filter(Boolean)),
      el("div", { class: "k" }, "Stations"),
      el("div", { class: "v" }, String(allStops.length))
    )
  );

  // ── Map ──────────────────────────────────────────────────────────────────
  const lineGeom = await fetch(`data/${CITY}/line_geometry.json`)
    .then(r => r.ok ? r.json() : {}).catch(() => ({}));

  const lineMap = new maplibregl.Map({
    container: "line-map",
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

  function stationCoords(track) {
    return (db.stopsByTrack[track.id] || []).map(s => {
      const n = db.byId.station_nodes[s.station_node_id];
      return n ? [n.lon, n.lat] : null;
    }).filter(Boolean);
  }

  lineMap.on("load", () => {
    const trackFeatures = tracks.map(t => {
      const g = lineGeom[t.id];
      const coords = (g?.length >= 2) ? g : stationCoords(t);
      return coords.length >= 2 ? {
        type: "Feature",
        properties: { colour: t.colour || line.colour || "#888", trackId: t.id },
        geometry: { type: "LineString", coordinates: coords }
      } : null;
    }).filter(Boolean);

    if (trackFeatures.length) {
      lineMap.addSource("line-tracks", { type: "geojson", data: { type: "FeatureCollection", features: trackFeatures } });
      lineMap.addLayer({ id: "line-track-bg", type: "line", source: "line-tracks",
        paint: { "line-color": "#fff", "line-width": 6, "line-opacity": 0.7 } });
      lineMap.addLayer({ id: "line-track-fg", type: "line", source: "line-tracks",
        layout: { "line-cap": "round" },
        paint: { "line-color": ["get", "colour"], "line-width": 3 } });
      lineMap.on("click", "line-track-fg", e => {
        if (e.features.length) location.href = `track.html?id=${e.features[0].properties.trackId}`;
      });
      lineMap.on("mouseenter", "line-track-fg", () => lineMap.getCanvas().style.cursor = "pointer");
      lineMap.on("mouseleave", "line-track-fg", () => lineMap.getCanvas().style.cursor = "");
    }

    // Dedupe by cluster so Umeda etc. show as one dot
    const seenClusters = new Set();
    const stopFeatures = [];
    for (const stp of allStops) {
      const node = db.byId.station_nodes[stp.station_node_id];
      if (!node) continue;
      const cid = db.nodeCluster[node.id];
      if (seenClusters.has(cid)) continue;
      seenClusters.add(cid);
      const track = db.byId.tracks[stp.track_id];
      stopFeatures.push({
        type: "Feature",
        properties: { colour: track?.colour || line.colour || "#888", name: node.name_en, id: node.id },
        geometry: { type: "Point", coordinates: [node.lon, node.lat] }
      });
    }

    lineMap.addSource("line-stops", { type: "geojson", data: { type: "FeatureCollection", features: stopFeatures } });
    lineMap.addLayer({ id: "line-stops-circle", type: "circle", source: "line-stops",
      paint: {
        "circle-radius": 4,
        "circle-color": "#fff",
        "circle-stroke-color": ["get", "colour"],
        "circle-stroke-width": 2
      }
    });
    lineMap.on("click", "line-stops-circle", e => {
      if (e.features.length) location.href = `station.html?id=${e.features[0].properties.id}`;
    });
    lineMap.on("mouseenter", "line-stops-circle", () => lineMap.getCanvas().style.cursor = "pointer");
    lineMap.on("mouseleave", "line-stops-circle", () => lineMap.getCanvas().style.cursor = "");

    const nodes = allStops.map(s => db.byId.station_nodes[s.station_node_id]).filter(Boolean);
    if (nodes.length) {
      const lons = nodes.map(n => n.lon), lats = nodes.map(n => n.lat);
      lineMap.fitBounds(
        [[Math.min(...lons) - 0.01, Math.min(...lats) - 0.01],
         [Math.max(...lons) + 0.01, Math.max(...lats) + 0.01]],
        { padding: 30, duration: 0 }
      );
    }
  });

  // ── Stopping pattern (binary, rows=services, columns=stations) ──────────
  // Vertical orientation when >15 stations (rows=stations, columns=services)
  const services = db.servicesByLine[lineId] || [];
  const patternDiv = document.getElementById("pattern");
  const vertical = allStops.length > 15;

  if (!services.length) {
    patternDiv.append(el("p", { class: "small" }, "No services defined for this line yet."));
  } else if (vertical) {
    // Vertical: rows = stations, columns = services
    const wrap = el("div", { class: "matrix-wrap" });
    const tbl = el("table", { class: "matrix" });
    const thead = el("thead");

    // Header: track ownership bands (if multi)
    if (tracks.length > 1) {
      const trackRow = el("tr");
      trackRow.append(el("th", { class: "svc" }, "Track"));
      for (const svc of services) trackRow.append(el("th", {}));
      thead.append(trackRow);
    }

    const headRow = el("tr");
    headRow.append(el("th", { class: "svc" }, "Station ↓ / Service →"));
    for (const svc of services) {
      headRow.append(el("th", { class: "stopcol", style: "writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap" },
        el("a", { href: `service.html?id=${svc.id}`, style: "color:inherit" }, svc.display_name_en || svc.id)
      ));
    }
    thead.append(headRow);
    tbl.append(thead);

    const tbody = el("tbody");
    for (const { track, stops: tStops } of trackStops) {
      const tOp = db.byId.operators[track.operator_id];
      for (const stp of tStops) {
        const node = db.byId.station_nodes[stp.station_node_id];
        const tr = el("tr");
        const th = el("th", { class: "svc" },
          el("span", { class: "swatch", style: `background:${track.colour};vertical-align:middle;margin-right:6px` }),
          el("a", { href: `station.html?id=${stp.station_node_id}`, style: "color:inherit" }, node?.name_en || stp.code || ""),
          node?.name_ja ? el("span", { class: "small", style: "margin-left:6px" }, node.name_ja) : null
        );
        tr.append(th);
        for (const svc of services) {
          const served = (svc.stop_pattern || []).some(sid => db.byId.stops[sid]?.station_node_id === stp.station_node_id);
          tr.append(el("td", { class: "stop" },
            el("span", { class: served ? "dot f3" : "dot f0" })
          ));
        }
        tbody.append(tr);
      }
    }
    tbl.append(tbody);
    wrap.append(tbl);
    patternDiv.append(wrap);
  } else {
    // Horizontal: rows = services, columns = stations
    const wrap = el("div", { class: "matrix-wrap" });
    const tbl = el("table", { class: "matrix" });
    const thead = el("thead");

    if (tracks.length > 1) {
      const trackRow = el("tr");
      trackRow.append(el("th", { class: "svc" }));
      for (const { track, stops: tStops } of trackStops) {
        const tOp = db.byId.operators[track.operator_id];
        trackRow.append(el("th", {
          colspan: tStops.length,
          style: `background:${track.colour}22;border-bottom:2px solid ${track.colour};font-size:10px;color:var(--ink-dim);text-align:center;padding:4px 6px;white-space:nowrap`
        }, el("a", { href: `track.html?id=${track.id}`, style: "color:inherit" },
          `${track.name_en || track.id} (${tOp?.name_en || track.operator_id})`)));
      }
      thead.append(trackRow);
    }

    const headRow = el("tr");
    headRow.append(el("th", { class: "svc" }, "Service ↓ / Stop →"));
    for (const { stops: tStops } of trackStops) {
      for (const stp of tStops) {
        const node = db.byId.station_nodes[stp.station_node_id];
        headRow.append(el("th", { class: "stopcol" },
          el("a", { href: `station.html?id=${stp.station_node_id}`, style: "color:inherit" },
            node?.name_en || stp.code || "")
        ));
      }
    }
    thead.append(headRow);
    tbl.append(thead);

    const tbody = el("tbody");
    for (const svc of services) {
      const servedNodes = new Set(
        (svc.stop_pattern || []).map(sid => db.byId.stops[sid]?.station_node_id).filter(Boolean)
      );
      const tr = el("tr");
      const typeClass = svc.service_type === "limited_express" ? ";color:var(--yellow)" : "";
      tr.append(el("th", { class: "svc" },
        el("a", { href: `service.html?id=${svc.id}`, style: `font-weight:600${typeClass}` },
          svc.display_name_en || svc.id),
        svc.supplement && svc.supplement !== "none"
          ? el("span", { class: "pill warn", style: "margin-left:6px" }, svc.supplement)
          : null
      ));
      for (const { stops: tStops } of trackStops) {
        for (const stp of tStops) {
          const served = servedNodes.has(stp.station_node_id);
          tr.append(el("td", { class: "stop" },
            el("span", { class: served ? "dot f3" : "dot f0" })
          ));
        }
      }
      tbody.append(tr);
    }
    tbl.append(tbody);
    wrap.append(tbl);
    patternDiv.append(wrap);
  }

  // ── Frequency heatmap: rows = bands, columns = stations ──────────────────
  const heatDiv = document.getElementById("heat");
  if (services.length) {
    const wrap = el("div", { class: "matrix-wrap" });
    const tbl = el("table", { class: "matrix" });
    const thead = el("thead");
    const headRow = el("tr");
    headRow.append(el("th", { class: "svc" }, vertical ? "Station ↓ / Band →" : "Band ↓ / Stop →"));

    if (vertical) {
      for (const band of BAND_ORDER) {
        headRow.append(el("th", { class: "stopcol" }, BAND_LABELS[band]));
      }
      thead.append(headRow);
      tbl.append(thead);

      const tbody = el("tbody");
      for (const { track, stops: tStops } of trackStops) {
        for (const stp of tStops) {
          const node = db.byId.station_nodes[stp.station_node_id];
          const tr = el("tr");
          tr.append(el("th", { class: "svc" },
            el("span", { class: "swatch", style: `background:${track.colour};vertical-align:middle;margin-right:6px` }),
            el("a", { href: `station.html?id=${stp.station_node_id}`, style: "color:inherit" }, node?.name_en || "")
          ));
          for (const band of BAND_ORDER) {
            let tph = 0;
            for (const svc of services) {
              const hits = (svc.stop_pattern || []).some(sid => db.byId.stops[sid]?.station_node_id === stp.station_node_id);
              if (hits) tph += (svc.frequency_bands?.[band] || 0);
            }
            tr.append(el("td", { class: "stop", title: `${tph} tph` },
              el("span", { class: `dot f${freqBucket(tph)}` })
            ));
          }
          tbody.append(tr);
        }
      }
      tbl.append(tbody);
    } else {
      for (const { stops: tStops } of trackStops) {
        for (const stp of tStops) {
          const node = db.byId.station_nodes[stp.station_node_id];
          headRow.append(el("th", { class: "stopcol" },
            el("a", { href: `station.html?id=${stp.station_node_id}`, style: "color:inherit" }, node?.name_en || "")
          ));
        }
      }
      thead.append(headRow);
      tbl.append(thead);

      const tbody = el("tbody");
      for (const band of BAND_ORDER) {
        const tr = el("tr");
        tr.append(el("th", { class: "svc" }, BAND_LABELS[band]));
        for (const { stops: tStops } of trackStops) {
          for (const stp of tStops) {
            let tph = 0;
            for (const svc of services) {
              const hits = (svc.stop_pattern || []).some(sid => db.byId.stops[sid]?.station_node_id === stp.station_node_id);
              if (hits) tph += (svc.frequency_bands?.[band] || 0);
            }
            tr.append(el("td", { class: "stop", title: `${tph} tph` },
              el("span", { class: `dot f${freqBucket(tph)}` })
            ));
          }
        }
        tbody.append(tr);
      }
      tbl.append(tbody);
    }
    wrap.append(tbl);
    heatDiv.append(wrap);
  }
})();
