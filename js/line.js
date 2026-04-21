(async () => {
  const { loadCity, el, topbar, qs, frequencyBucket, BAND_LABELS, CITY } = window.TW;
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

  // ── Main content ─────────────────────────────────────────────────────────
  const lineId = qs("id") || db.lines.find(l => l.primary_operator_id === "osaka-metro")?.id || db.lines[0]?.id;
  const line   = db.byId.lines[lineId];
  if (!line) { document.getElementById("header").append(el("p", {}, `No line ${lineId}`)); return; }

  const op = db.byId.operators[line.primary_operator_id];
  const tracks = db.tracksByLine[lineId] || [];

  // Collect all stops across all tracks (in order)
  const allStops = tracks.flatMap(t => db.stopsByTrack[t.id] || []);

  document.getElementById("header").append(
    el("h1", {},
      el("span", { class: "swatch", style: `background:${line.colour};width:14px;height:14px;display:inline-block;border-radius:3px;vertical-align:middle;margin-right:6px` }),
      line.display_name_en || "", " ",
      el("span", { class: "small" }, line.display_name_ja || "")),
    el("div", { class: "kv" },
      el("div", { class: "k" }, "Operator"),
      el("div", { class: "v" }, op?.name_en || "—"),
      el("div", { class: "k" }, "Tracks"),
      el("div", { class: "v" }, tracks.map(t => t.name_en || t.id).join(", ") || "—"),
      el("div", { class: "k" }, "Stations"),
      el("div", { class: "v" }, allStops.length)
    )
  );

  // ── Track map ────────────────────────────────────────────────────────────
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

  lineMap.on("load", () => {
    const trackFeatures = tracks.map(t => {
      const coords = lineGeom[t.id] || [];
      return coords.length >= 2 ? {
        type: "Feature",
        properties: { colour: t.colour || line.colour || "#888" },
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
    }

    // All stops as dots
    const stopFeatures = allStops.map(stp => {
      const node = db.byId.station_nodes[stp.station_node_id];
      const track = db.byId.tracks[stp.track_id];
      if (!node) return null;
      return {
        type: "Feature",
        properties: { colour: track?.colour || line.colour || "#888", name: node.name_en },
        geometry: { type: "Point", coordinates: [node.lon, node.lat] }
      };
    }).filter(Boolean);

    lineMap.addSource("line-stops", { type: "geojson", data: { type: "FeatureCollection", features: stopFeatures } });
    lineMap.addLayer({ id: "line-stops-circle", type: "circle", source: "line-stops",
      paint: {
        "circle-radius": 4,
        "circle-color": "#fff",
        "circle-stroke-color": ["get", "colour"],
        "circle-stroke-width": 2
      }
    });

    // Fit map to stops
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

  // ── Stopping pattern matrix ───────────────────────────────────────────────
  const services = db.servicesByLine[lineId] || [];
  const table = document.getElementById("matrix");

  if (!services.length) {
    table.closest(".matrix-wrap").before(el("p", { class: "small" }, "No services defined for this line yet."));
  } else {
    const thead = el("thead");
    const headRow = el("tr");
    headRow.append(el("th", { class: "svc" }, "Service ↓ / Stop →"));
    for (const stp of allStops) {
      const node = db.byId.station_nodes[stp.station_node_id];
      headRow.append(el("th", { class: "stopcol" }, node?.name_en || stp.code || ""));
    }
    thead.append(headRow);
    table.append(thead);

    const tbody = el("tbody");
    for (const svc of services) {
      // Build set of station_node_ids served by this service
      const servedNodes = new Set(
        svc.stop_pattern.map(sid => db.byId.stops[sid]?.station_node_id).filter(Boolean)
      );
      const tr = el("tr");
      const peakTph = Math.max(...Object.values(svc.frequency_bands));
      const freqClass = `f${frequencyBucket(peakTph)}`;
      const freqParts = Object.entries(svc.frequency_bands)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${BAND_LABELS[k] || k} ${v}`).join(" · ");

      const typeClass = svc.service_type === "limited_express" ? " svctype-limited-express" : "";
      tr.append(el("th", { class: "svc" },
        el("a", { href: `service.html?id=${svc.id}`, style: `font-weight:600${typeClass ? ";color:var(--yellow)" : ""}` },
          svc.display_name_en),
        svc.supplement !== "none"
          ? el("span", { class: "pill warn", style: "margin-left:6px" }, svc.supplement)
          : null,
        el("div", { class: "small", style: "margin-top:2px" }, freqParts)
      ));

      for (const stp of allStops) {
        const served = servedNodes.has(stp.station_node_id);
        tr.append(el("td", { class: "stop" },
          el("span", { class: served ? `dot ${freqClass}` : "dot f0" })
        ));
      }
      tbody.append(tr);
    }
    table.append(tbody);
  }
})();
