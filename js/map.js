(async () => {
  const { loadCity, el, topbar, CITY } = window.TW;
  const db = await loadCity();
  topbar("map");

  // ---- Sidebar: named lines grouped by operator (collapsible) ----
  const sidebar = document.getElementById("lines");
  const opOrder = db.operators.map(o => o.id);
  // Default: expand only Osaka Metro (first operator)
  const defaultOpen = new Set([opOrder[0]]);
  for (const opId of opOrder) {
    const opLines = db.linesByOperator[opId] || [];
    if (!opLines.length) continue;
    const op = db.byId.operators[opId];
    let open = defaultOpen.has(opId);

    const lineItems = opLines.map(ln =>
      el("li", { onclick: () => location.href = `line.html?id=${ln.id}` },
        el("span", { class: "swatch", style: `background:${ln.colour}` }),
        el("span", {}, ln.display_name_en || ln.display_name_ja || "")
      )
    );
    const group = el("ul", {
      style: `list-style:none;padding:0;margin:0;display:${open ? "block" : "none"}`
    }, ...lineItems);

    const header = el("li", {
      style: "padding:6px 4px 2px;font-size:11px;color:var(--ink-dim);text-transform:uppercase;letter-spacing:.05em;cursor:pointer;font-weight:600;display:flex;justify-content:space-between;align-items:center",
      onclick() {
        open = !open;
        group.style.display = open ? "block" : "none";
        arrow.textContent = open ? "▾" : "▸";
      }
    }, op.name_en);
    const arrow = el("span", {}, open ? "▾" : "▸");
    header.append(arrow);
    sidebar.append(header, group);
  }

  // ---- Node → track colour ----
  const nodeLineColour = {};
  for (const s of db.stops) {
    if (!nodeLineColour[s.station_node_id])
      nodeLineColour[s.station_node_id] = db.byId.tracks[s.track_id]?.colour || "#888";
  }

  // ---- Union-Find: cluster co-located stations ----
  // Merge nodes connected by same-name-connected or through-run-boundary transfers
  // into single map dots. Different-name-connected (e.g. Umeda / Nishi-Umeda) stay separate.
  const parent = {};
  for (const n of db.station_nodes) parent[n.id] = n.id;
  function find(id) {
    if (parent[id] !== id) parent[id] = find(parent[id]);
    return parent[id];
  }
  for (const t of db.transfers) {
    if ((t.category === "same-name-connected" || t.category === "through-run-boundary") && t.a !== t.b) {
      const ra = find(t.a), rb = find(t.b);
      if (ra !== rb) parent[ra] = rb;
    }
  }
  const clusters = {};
  for (const n of db.station_nodes) {
    const root = find(n.id);
    (clusters[root] ||= []).push(n);
  }

  // Build GeoJSON: one feature per cluster
  const clusterFeatures = Object.values(clusters).map(members => {
    const lat = members.reduce((s, n) => s + n.lat, 0) / members.length;
    const lon = members.reduce((s, n) => s + n.lon, 0) / members.length;
    const colours = [...new Set(members.map(n => nodeLineColour[n.id]).filter(Boolean))];
    const isInterchange = members.length > 1;
    // Interchange: neutral dark stroke. Single-line: that line's colour.
    const strokeColour = isInterchange ? "#2a2a2a" : (colours[0] || "#888");
    const name = [...new Set(members.map(n => n.name_en))].join(" / ");
    const ja   = [...new Set(members.map(n => n.name_ja).filter(Boolean))].join("・");
    return {
      type: "Feature",
      properties: { id: members[0].id, name, ja, strokeColour, isInterchange },
      geometry: { type: "Point", coordinates: [lon, lat] }
    };
  });

  // ---- Map ----
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
          tileSize: 256,
          attribution: "© CARTO © OpenStreetMap contributors",
          maxzoom: 20
        }
      },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": "#f5f5f0" } },
        { id: "carto", type: "raster", source: "carto", paint: { "raster-opacity": 0.85 } }
      ]
    },
    center: [135.500, 34.700],
    zoom: 11
  });

  // Load pre-baked geometry
  const lineGeom = await fetch(`data/${CITY}/line_geometry.json`)
    .then(r => r.ok ? r.json() : {}).catch(() => ({}));

  function stationTrackCoords(track) {
    return (db.stopsByTrack[track.id] || []).map(s => {
      const n = db.byId.station_nodes[s.station_node_id];
      return n ? [n.lon, n.lat] : null;
    }).filter(Boolean);
  }

  map.on("load", () => {
    // Tracks — physical corridors shown on map
    // Navigate to the named Line page when clicked
    const lineFeatures = db.tracks.map(t => {
      const line = db.lineByTrack[t.id];
      const coords = lineGeom[t.id]?.length >= 2 ? lineGeom[t.id] : stationTrackCoords(t);
      return {
        type: "Feature",
        properties: {
          id: line?.id || t.id,   // navigate to Line page on click
          name: t.name_en || "",
          colour: t.colour || "#888"
        },
        geometry: { type: "LineString", coordinates: coords }
      };
    }).filter(f => f.geometry.coordinates.length >= 2);

    map.addSource("lines", { type: "geojson", data: { type: "FeatureCollection", features: lineFeatures } });
    map.addLayer({
      id: "lines-bg", type: "line", source: "lines",
      paint: { "line-color": "#fff", "line-width": 5, "line-opacity": 0.8 }
    });
    map.addLayer({
      id: "lines-fg", type: "line", source: "lines",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "colour"], "line-width": 2.5 }
    });

    // Station clusters — single circle per interchange group
    map.addSource("nodes", {
      type: "geojson",
      generateId: true,
      data: { type: "FeatureCollection", features: clusterFeatures }
    });

    // Base radius: interchange = 5.5px, single = 4px; hover adds 2.5px
    const baseR   = ["case", ["boolean", ["get", "isInterchange"], false], 5.5, 4.0];
    const hoverR  = ["case", ["boolean", ["get", "isInterchange"], false], 8.0, 6.5];
    const baseW   = ["case", ["boolean", ["get", "isInterchange"], false], 2.0, 1.5];
    const hoverW  = 2.5;

    map.addLayer({
      id: "nodes", type: "circle", source: "nodes",
      paint: {
        "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], hoverR, baseR],
        "circle-color": "#fff",
        "circle-stroke-color": ["get", "strokeColour"],
        "circle-stroke-width": ["case", ["boolean", ["feature-state", "hover"], false], hoverW, baseW]
      }
    });

    // Hover via feature-state
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
                  <div style="font:12px/1.3 sans-serif;color:#555">${f.ja}</div>`)
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
      if (lh.length) location.href = `line.html?id=${lh[0].properties.id}`;
    });
  });
})();
