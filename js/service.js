(async () => {
  const { loadCity, el, topbar, qs, BAND_LABELS, CITY } = window.TW;
  const db = await loadCity();
  topbar("services");

  // ── Sidebar: services grouped by line ────────────────────────────────────
  const list = document.getElementById("svc-list");
  const opOrder = db.operators.map(o => o.id);
  for (const opId of opOrder) {
    const opLines = db.linesByOperator[opId] || [];
    for (const ln of opLines) {
      const svcs = db.servicesByLine[ln.id] || [];
      if (!svcs.length) continue;
      list.append(el("li", {
        style: "padding:8px 4px 2px;font-size:11px;color:var(--ink-dim);text-transform:uppercase;letter-spacing:.05em;cursor:default;font-weight:600"
      }, ln.display_name_en || ln.display_name_ja || ln.id));
      for (const svc of svcs) {
        list.append(el("li", { onclick: () => location.href = `service.html?id=${svc.id}` },
          el("div", { class: "svc-sidebar-item" },
            el("div", { class: "svc-sidebar-swatch" },
              el("span", { class: "swatch", style: `background:${ln.colour}` })
            ),
            el("div", { class: "svc-sidebar-text" },
              el("div", {}, svc.display_name_en),
              el("div", { class: "small" }, svc.service_type)
            )
          )
        ));
      }
    }
  }

  // ── Service detail ────────────────────────────────────────────────────────
  const id  = qs("id") || db.services[0]?.id;
  const svc = db.byId.services[id];
  if (!svc) { document.getElementById("header").append(el("p", {}, `No service ${id}`)); return; }

  const line   = db.byId.lines[svc.line_id];
  const tracks = db.tracksByLine[svc.line_id] || [];

  document.getElementById("header").append(
    el("div", { class: "small", style: "margin-bottom:4px;color:var(--ink-dim)" },
      line ? el("a", { href: `line.html?id=${line.id}` }, line.display_name_en) : ""),
    el("h1", {},
      line ? el("span", {
        class: "swatch",
        style: `background:${line.colour};width:12px;height:12px;display:inline-block;border-radius:2px;vertical-align:middle;margin-right:6px`
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

  // ── Service map ───────────────────────────────────────────────────────────
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
    center: [135.5, 34.7], zoom: 11, interactive: true
  });

  svcMap.on("load", () => {
    // Draw tracks
    const trackFeatures = tracks.map(t => {
      const coords = lineGeom[t.id] || [];
      return coords.length >= 2 ? {
        type: "Feature",
        properties: { colour: t.colour || line?.colour || "#888" },
        geometry: { type: "LineString", coordinates: coords }
      } : null;
    }).filter(Boolean);

    if (trackFeatures.length) {
      svcMap.addSource("svc-tracks", { type: "geojson", data: { type: "FeatureCollection", features: trackFeatures } });
      svcMap.addLayer({ id: "svc-track-bg", type: "line", source: "svc-tracks",
        paint: { "line-color": "#fff", "line-width": 5, "line-opacity": 0.7 } });
      svcMap.addLayer({ id: "svc-track-fg", type: "line", source: "svc-tracks",
        layout: { "line-cap": "round" },
        paint: { "line-color": ["get", "colour"], "line-width": 3 } });
    }

    // All stops on these tracks: dim if not in pattern, bright if served
    const patternNodeIds = new Set(
      svc.stop_pattern.map(sid => db.byId.stops[sid]?.station_node_id).filter(Boolean)
    );
    const _mapRaw = tracks.flatMap(t => db.stopsByTrack[t.id] || []);
    const _mapSeen = new Set();
    const allTrackStops = _mapRaw.filter(s => {
      if (_mapSeen.has(s.station_node_id)) return false;
      _mapSeen.add(s.station_node_id);
      return true;
    });

    const stopFeatures = allTrackStops.map(stp => {
      const node = db.byId.station_nodes[stp.station_node_id];
      const track = db.byId.tracks[stp.track_id];
      if (!node) return null;
      return {
        type: "Feature",
        properties: {
          inPattern: patternNodeIds.has(stp.station_node_id),
          colour: track?.colour || line?.colour || "#888"
        },
        geometry: { type: "Point", coordinates: [node.lon, node.lat] }
      };
    }).filter(Boolean);

    svcMap.addSource("svc-stops", { type: "geojson", data: { type: "FeatureCollection", features: stopFeatures } });
    svcMap.addLayer({ id: "svc-stops-ctx", type: "circle", source: "svc-stops",
      filter: ["==", ["get", "inPattern"], false],
      paint: { "circle-radius": 2.5, "circle-color": "#aaa", "circle-opacity": 0.5 }
    });
    svcMap.addLayer({ id: "svc-stops-on", type: "circle", source: "svc-stops",
      filter: ["==", ["get", "inPattern"], true],
      paint: {
        "circle-radius": 5, "circle-color": "#fff",
        "circle-stroke-color": ["get", "colour"], "circle-stroke-width": 2
      }
    });

    // Labels for served stops (alternating left/right)
    const servedNodes = svc.stop_pattern
      .map(sid => db.byId.station_nodes[db.byId.stops[sid]?.station_node_id])
      .filter(Boolean);

    servedNodes.forEach((node, i) => {
      const div = document.createElement("div");
      div.className = "svc-stop-label";
      div.textContent = node.name_en;
      const anchor = i % 2 === 0 ? "right" : "left";
      const offset  = i % 2 === 0 ? [-8, 0] : [8, 0];
      new maplibregl.Marker({ element: div, anchor, offset })
        .setLngLat([node.lon, node.lat]).addTo(svcMap);
    });

    if (servedNodes.length) {
      const lons = servedNodes.map(n => n.lon), lats = servedNodes.map(n => n.lat);
      svcMap.fitBounds(
        [[Math.min(...lons) - 0.005, Math.min(...lats) - 0.005],
         [Math.max(...lons) + 0.005, Math.max(...lats) + 0.005]],
        { padding: 40, duration: 0 }
      );
    }
  });

  // ── Path across lines ─────────────────────────────────────────────────────
  const pathDiv = document.getElementById("path");
  if (svc.line_path?.length) {
    const wrap = el("div", { class: "stop-list", style: "margin-bottom:8px" });
    for (const seg of svc.line_path) {
      const track = db.byId.tracks[seg.track_id];
      const fromNode = db.byId.station_nodes[db.byId.stops[seg.from_stop]?.station_node_id];
      const toNode   = db.byId.station_nodes[db.byId.stops[seg.to_stop]?.station_node_id];
      wrap.append(el("div", { class: "card", style: "display:flex;align-items:center;gap:10px;padding:10px 14px" },
        el("span", { class: "swatch", style: `background:${track?.colour || line?.colour || '#888'};width:12px;height:12px;border-radius:2px;flex-shrink:0` }),
        el("div", {},
          el("div", { style: "font-weight:600;font-size:13px" }, track?.name_en || seg.track_id),
          el("div", { class: "small" },
            (fromNode?.name_en || "?"), " → ", (toNode?.name_en || "?"))
        )
      ));
    }
    pathDiv.append(wrap);
  } else {
    pathDiv.append(el("div", { class: "small" }, "No line path recorded."));
  }

  // ── Stop list (vertical, expandable) ─────────────────────────────────────
  const patternNodeIds = new Set(
    svc.stop_pattern.map(sid => db.byId.stops[sid]?.station_node_id).filter(Boolean)
  );
  // Deduplicate stops by station_node_id (OSM routes include both directions)
  const _rawTrackStops = tracks.flatMap(t => db.stopsByTrack[t.id] || []);
  const _seenSvcNodes = new Set();
  const allTrackStops = _rawTrackStops.filter(s => {
    if (_seenSvcNodes.has(s.station_node_id)) return false;
    _seenSvcNodes.add(s.station_node_id);
    return true;
  });

  let showAll = false;
  const toggleBtn = el("button", {
    style: "font-size:12px;padding:3px 10px;border:1px solid var(--rule);border-radius:4px;background:var(--panel-2);color:var(--ink-dim);cursor:pointer;margin-bottom:10px",
    onclick() {
      showAll = !showAll;
      toggleBtn.textContent = showAll ? "Show served only" : "Show all stations";
      renderStops();
    }
  }, "Show all stations");

  const stopListEl = el("div", { class: "stop-list" });
  document.getElementById("pattern").append(toggleBtn, stopListEl);

  function renderStops() {
    stopListEl.innerHTML = "";
    const stopsToShow = showAll ? allTrackStops
      : allTrackStops.filter(s => patternNodeIds.has(s.station_node_id));

    for (const stp of stopsToShow) {
      const node    = db.byId.station_nodes[stp.station_node_id];
      const track   = db.byId.tracks[stp.track_id];
      const served  = patternNodeIds.has(stp.station_node_id);
      const colour  = track?.colour || line?.colour || "#888";

      const nodeId = stp.station_node_id;
      stopListEl.append(el("div", {
        class: `stop-row${served ? " served" : " skipped"}`,
        style: "cursor:pointer",
        onclick: () => { location.href = `station.html?id=${nodeId}`; }
      },
        el("span", { class: "stop-dot", style: served
          ? `background:${colour};border-color:${colour}`
          : "background:transparent;border-color:#444" }),
        el("div", { class: "stop-row-text" },
          el("span", { class: served ? "stop-name" : "stop-name dim" },
            node?.name_en || stp.code || stp.station_node_id),
          node?.name_ja ? el("span", { class: "small", style: "margin-left:6px" }, node.name_ja) : null
        ),
        el("span", { class: "stop-code" }, stp.code || "")
      ));
    }
  }
  renderStops();

  // ── Frequency ─────────────────────────────────────────────────────────────
  const kv = el("div", { class: "kv" });
  for (const [k, v] of Object.entries(svc.frequency_bands)) {
    kv.append(
      el("div", { class: "k" }, BAND_LABELS[k] || k),
      el("div", { class: "v" }, v ? `${v} trains / hr` : "—")
    );
  }
  document.getElementById("freq").append(kv);
})();
