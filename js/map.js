(async () => {
  const { loadCity, el, topbar, CITY } = window.TW;
  const db = await loadCity();
  topbar("map");

  // ── Sidebar: named lines grouped by operator (collapsible) ────────────────
  const sidebar = document.getElementById("lines");
  const opOrder = db.operators.map(o => o.id);
  const defaultOpen = new Set([opOrder[0]]);
  for (const opId of opOrder) {
    const opLines = db.linesByOperator[opId] || [];
    if (!opLines.length) continue;
    const op = db.byId.operators[opId];
    let open = defaultOpen.has(opId);
    const lineItems = opLines.map(ln =>
      el("li", { onclick: () => location.href = `line.html?id=${ln.id}` },
        el("span", { class: "swatch", style: `background:${ln.colour || "#888"}` }),
        el("span", {}, ln.display_name_en || ln.display_name_ja || "")
      )
    );
    const group = el("ul", {
      style: `list-style:none;padding:0;margin:0;display:${open ? "block" : "none"}`
    }, ...lineItems);
    const arrow = el("span", {}, open ? "▾" : "▸");
    const header = el("li", {
      style: "padding:6px 4px 2px;font-size:11px;color:var(--ink-dim);text-transform:uppercase;letter-spacing:.05em;cursor:pointer;font-weight:600;display:flex;justify-content:space-between;align-items:center",
      onclick() {
        open = !open;
        group.style.display = open ? "block" : "none";
        arrow.textContent = open ? "▾" : "▸";
      }
    }, op.name_en);
    header.append(arrow);
    sidebar.append(header, group);
  }

  // ── Node → track colour ───────────────────────────────────────────────────
  const nodeLineColour = {};
  for (const s of db.stops) {
    if (!nodeLineColour[s.station_node_id])
      nodeLineColour[s.station_node_id] = db.byId.tracks[s.track_id]?.colour || "#888";
  }

  // ── Cluster features (from data.js proximity clustering) ─────────────────
  const clusterFeatures = Object.entries(db.clusterNodes).map(([cid, members]) => {
    const lat = members.reduce((s, n) => s + n.lat, 0) / members.length;
    const lon = members.reduce((s, n) => s + n.lon, 0) / members.length;
    const colours = [...new Set(members.map(n => nodeLineColour[n.id]).filter(Boolean))];
    const trackCount = (db.tracksByCluster[cid] || new Set()).size;
    const isInterchange = trackCount > 1;
    const strokeColour = isInterchange ? "#2a2a2a" : (colours[0] || "#888");
    const name = [...new Set(members.map(n => n.name_en))].join(" / ");
    const ja   = [...new Set(members.map(n => n.name_ja).filter(Boolean))].join("・");
    return {
      type: "Feature",
      properties: { id: members[0].id, name, ja, strokeColour, isInterchange },
      geometry: { type: "Point", coordinates: [lon, lat] }
    };
  });

  // ── Map ───────────────────────────────────────────────────────────────────
  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {
        carto: {
          type: "raster",
          tiles: [
            "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png",
            "https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png"
          ],
          tileSize: 256, attribution: "© CARTO © OpenStreetMap contributors", maxzoom: 20
        }
      },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": "#f5f5f0" } },
        { id: "carto", type: "raster", source: "carto", paint: { "raster-opacity": 0.85 } }
      ]
    },
    center: [135.500, 34.700], zoom: 11
  });

  const lineGeom = await fetch(`data/${CITY}/line_geometry.json`)
    .then(r => r.ok ? r.json() : {}).catch(() => ({}));

  function stationTrackCoords(track) {
    return (db.stopsByTrack[track.id] || []).map(s => {
      const n = db.byId.station_nodes[s.station_node_id];
      return n ? [n.lon, n.lat] : null;
    }).filter(Boolean);
  }

  map.on("load", () => {
    // Render one polyline per TRACK, but each track only once even if shared by multiple lines.
    // Use the primary line's colour for each track.
    const seenTracks = new Set();
    const lineFeatures = [];
    for (const line of db.lines) {
      for (const trackId of (line.tracks || [])) {
        if (seenTracks.has(trackId)) continue;
        seenTracks.add(trackId);
        const track = db.byId.tracks[trackId];
        if (!track) continue;
        const g = lineGeom[trackId];
        const coords = (g?.length >= 2) ? g : stationTrackCoords(track);
        if (coords.length < 2) continue;
        lineFeatures.push({
          type: "Feature",
          properties: {
            lineId: line.id,
            colour: line.colour || track.colour || "#888"
          },
          geometry: { type: "LineString", coordinates: coords }
        });
      }
    }
    // Also render any tracks not claimed by any line (orphaned tracks)
    for (const track of db.tracks) {
      if (seenTracks.has(track.id)) continue;
      const g = lineGeom[track.id];
      const coords = (g?.length >= 2) ? g : stationTrackCoords(track);
      if (coords.length < 2) continue;
      lineFeatures.push({
        type: "Feature",
        properties: { lineId: track.id, colour: track.colour || "#888" },
        geometry: { type: "LineString", coordinates: coords }
      });
    }

    map.addSource("lines", { type: "geojson", data: { type: "FeatureCollection", features: lineFeatures } });
    map.addLayer({
      id: "lines-bg", type: "line", source: "lines",
      paint: { "line-color": "#fff", "line-width": 4, "line-opacity": 0.8 }
    });
    map.addLayer({
      id: "lines-fg", type: "line", source: "lines",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "colour"], "line-width": 2 }
    });

    // Station clusters
    map.addSource("nodes", {
      type: "geojson", generateId: true,
      data: { type: "FeatureCollection", features: clusterFeatures }
    });
    const baseR  = ["case", ["boolean", ["get", "isInterchange"], false], 5.5, 4.0];
    const hoverR = ["case", ["boolean", ["get", "isInterchange"], false], 7.5, 6.0];
    map.addLayer({
      id: "nodes", type: "circle", source: "nodes",
      paint: {
        "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], hoverR, baseR],
        "circle-color": "#fff",
        "circle-stroke-color": ["get", "strokeColour"],
        "circle-stroke-width": ["case", ["boolean", ["feature-state", "hover"], false], 2.5,
          ["case", ["boolean", ["get", "isInterchange"], false], 2.0, 1.5]]
      }
    });

    // Station name labels at zoom ≥ 13
    map.addLayer({
      id: "node-labels", type: "symbol", source: "nodes",
      minzoom: 13,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Open Sans Regular"],
        "text-size": 11,
        "text-offset": [0, 1.2],
        "text-anchor": "top",
        "text-max-width": 8
      },
      paint: {
        "text-color": "#222",
        "text-halo-color": "#fff",
        "text-halo-width": 1.5
      }
    });

    // Hover
    let hoveredId = null;
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    map.on("mousemove", "nodes", e => {
      if (!e.features.length) return;
      if (hoveredId !== null) map.setFeatureState({ source: "nodes", id: hoveredId }, { hover: false });
      hoveredId = e.features[0].id;
      map.setFeatureState({ source: "nodes", id: hoveredId }, { hover: true });
      map.getCanvas().style.cursor = "pointer";
      const f = e.features[0].properties;
      popup.setLngLat(e.features[0].geometry.coordinates)
        .setHTML(`<div style="font:600 13px/1.4 sans-serif;color:#111">${f.name}</div>
                  <div style="font:11px/1.3 sans-serif;color:#555">${f.ja || ""}</div>`)
        .addTo(map);
    });
    map.on("mouseleave", "nodes", () => {
      if (hoveredId !== null) map.setFeatureState({ source: "nodes", id: hoveredId }, { hover: false });
      hoveredId = null;
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    map.on("mouseenter", "lines-fg", () => map.getCanvas().style.cursor = "pointer");
    map.on("mouseleave", "lines-fg", () => map.getCanvas().style.cursor = "");

    // Click: nodes beat lines
    map.on("click", e => {
      const nh = map.queryRenderedFeatures(e.point, { layers: ["nodes"] });
      if (nh.length) { location.href = `station.html?id=${nh[0].properties.id}`; return; }
      const lh = map.queryRenderedFeatures(e.point, { layers: ["lines-fg"] });
      if (lh.length) location.href = `line.html?id=${lh[0].properties.lineId}`;
    });
  });
})();
