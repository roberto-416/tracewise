(async () => {
  const { loadCity, el, topbar, qs, BAND_LABELS, CITY } = window.TW;
  const db = await loadCity();
  topbar("services");

  // ---- Sidebar ----
  const list = document.getElementById("svc-list");
  for (const s of db.services) {
    const primaryLine = db.byId.lines[s.line_path[0]?.line_id];
    list.append(el("li", { onclick: () => location.href = `service.html?id=${s.id}` },
      el("div", { class: "svc-sidebar-item" },
        el("div", { class: "svc-sidebar-swatch" },
          primaryLine ? el("span", { class: "swatch", style: `background:${primaryLine.colour}` }) : null
        ),
        el("div", { class: "svc-sidebar-text" },
          el("div", {}, s.display_name_en),
          el("div", { class: "small" }, primaryLine?.name_en || "—")
        )
      )
    ));
  }

  const id = qs("id") || db.services[0].id;
  const svc = db.byId.services[id];
  if (!svc) { document.getElementById("header").append(el("p", {}, `No service ${id}`)); return; }

  const lineNames = [...new Set(svc.line_path.map(p => db.byId.lines[p.line_id]?.name_en).filter(Boolean))].join(" → ");
  const primaryLine = db.byId.lines[svc.line_path[0]?.line_id];

  document.getElementById("header").append(
    el("div", { class: "small", style: "margin-bottom:4px;color:var(--ink-dim)" }, lineNames),
    el("h1", {},
      primaryLine ? el("span", {
        class: "swatch",
        style: `background:${primaryLine.colour};width:12px;height:12px;display:inline-block;border-radius:2px;vertical-align:middle;margin-right:6px`
      }) : null,
      svc.display_name_en, " ",
      el("span", { class: "small" }, svc.display_name_ja || "")
    ),
    el("div", { style: "margin-top:6px" },
      el("span", { class: "pill" }, svc.service_type),
      svc.supplement !== "none"
        ? el("span", { class: "pill warn" }, `supplement: ${svc.supplement}`)
        : el("span", { class: "pill" }, "no supplement")),
    svc.notes ? el("div", { class: "small", style: "margin-top:6px" }, svc.notes) : null
  );

  // ---- Service map ----
  const lineGeom = await fetch(`data/${CITY}/line_geometry.json`)
    .then(r => r.ok ? r.json() : {}).catch(() => ({}));

  const svcMap = new maplibregl.Map({
    container: "svc-map",
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
    center: [135.5, 34.7], zoom: 11,
    interactive: true
  });

  svcMap.on("load", () => {
    // Line geometry for lines in this service
    const lineFeatures = svc.line_path.map(seg => {
      const line = db.byId.lines[seg.line_id];
      const coords = lineGeom[seg.line_id] || [];
      return coords.length >= 2 ? {
        type: "Feature",
        properties: { colour: line.colour },
        geometry: { type: "LineString", coordinates: coords }
      } : null;
    }).filter(Boolean);

    if (lineFeatures.length) {
      svcMap.addSource("svc-lines", { type: "geojson", data: { type: "FeatureCollection", features: lineFeatures } });
      svcMap.addLayer({ id: "svc-line-bg", type: "line", source: "svc-lines",
        paint: { "line-color": "#fff", "line-width": 5, "line-opacity": 0.7 } });
      svcMap.addLayer({ id: "svc-line-fg", type: "line", source: "svc-lines",
        layout: { "line-cap": "round" },
        paint: { "line-color": ["get", "colour"], "line-width": 3 } });
    }

    // Build stop data: all stops on the service's lines (context) + pattern stops (highlighted)
    const patternSet = new Set(svc.stop_pattern);
    const allLineStops = [...new Set(svc.line_path.flatMap(seg => db.stopsByLine[seg.line_id] || []))];

    const stopFeatures = allLineStops.map(stp => {
      const node = db.byId.station_nodes[stp.station_node_id];
      const line  = db.byId.lines[stp.line_id];
      return {
        type: "Feature",
        properties: { inPattern: patternSet.has(stp.id), colour: line?.colour || "#888" },
        geometry: { type: "Point", coordinates: [node.lon, node.lat] }
      };
    });

    svcMap.addSource("svc-stops", { type: "geojson", data: { type: "FeatureCollection", features: stopFeatures } });
    // Context stops (not in pattern): dim
    svcMap.addLayer({ id: "svc-stops-ctx", type: "circle", source: "svc-stops",
      filter: ["==", ["get", "inPattern"], false],
      paint: { "circle-radius": 2.5, "circle-color": "#aaa", "circle-opacity": 0.5 }
    });
    // Pattern stops: bright, line-coloured
    svcMap.addLayer({ id: "svc-stops-on", type: "circle", source: "svc-stops",
      filter: ["==", ["get", "inPattern"], true],
      paint: {
        "circle-radius": 5,
        "circle-color": "#fff",
        "circle-stroke-color": ["get", "colour"],
        "circle-stroke-width": 2
      }
    });

    // HTML markers for station names at pattern stops
    // Alternate left/right to reduce label overlap
    const patternNodes = svc.stop_pattern.map(sid => {
      const stp = db.byId.stops[sid];
      return stp ? db.byId.station_nodes[stp.station_node_id] : null;
    }).filter(Boolean);

    patternNodes.forEach((node, i) => {
      const div = document.createElement("div");
      div.className = "svc-stop-label";
      div.textContent = node.name_en;
      // Alternate anchor: left / right
      const anchor = i % 2 === 0 ? "right" : "left";
      const offset = i % 2 === 0 ? [-8, 0] : [8, 0];
      new maplibregl.Marker({ element: div, anchor, offset })
        .setLngLat([node.lon, node.lat])
        .addTo(svcMap);
    });

    // Fit to pattern stops
    if (patternNodes.length) {
      const lons = patternNodes.map(n => n.lon);
      const lats = patternNodes.map(n => n.lat);
      svcMap.fitBounds(
        [[Math.min(...lons) - 0.005, Math.min(...lats) - 0.005],
         [Math.max(...lons) + 0.005, Math.max(...lats) + 0.005]],
        { padding: 40, duration: 0 }
      );
    }
  });

  // ---- Path ----
  const pathDiv = document.getElementById("path");
  for (const seg of svc.line_path) {
    const line = db.byId.lines[seg.line_id];
    const op   = db.byId.operators[line.operator_id];
    const from = db.byId.stops[seg.from_stop];
    const to   = db.byId.stops[seg.to_stop];
    const fromNode = db.byId.station_nodes[from?.station_node_id];
    const toNode   = db.byId.station_nodes[to?.station_node_id];
    pathDiv.append(el("div", { class: "card" },
      el("div", { class: "title" },
        el("span", { class: "swatch", style: `background:${line.colour}` }),
        `${line.name_en}  (${op.name_en})`),
      el("div", {}, `${fromNode?.name_en || "?"} → ${toNode?.name_en || "?"}`),
      el("div", { class: "small" }, `${from?.code || ""} – ${to?.code || ""}`)
    ));
  }

  // ---- Stop pattern strip ----
  const strip = el("div", { class: "strip" });
  for (const stopId of svc.stop_pattern) {
    const stp  = db.byId.stops[stopId];
    const line = db.byId.lines[stp.line_id];
    const node = db.byId.station_nodes[stp.station_node_id];
    strip.append(el("div", { class: "stop" },
      el("div", { class: "code" }, stp.code || ""),
      el("span", { class: "dot", style: `background:${line.colour}` }),
      el("div", {}, node.name_en)
    ));
  }
  document.getElementById("pattern").append(strip);

  // ---- Frequency ----
  const kv = el("div", { class: "kv" });
  for (const [k, v] of Object.entries(svc.frequency_bands)) {
    kv.append(
      el("div", { class: "k" }, BAND_LABELS[k] || k),
      el("div", { class: "v" }, v ? `${v} trains / hr` : "—")
    );
  }
  document.getElementById("freq").append(kv);
})();
