(async () => {
  const { loadCity, el, topbar, CITY } = window.TW;
  const db = await loadCity();
  topbar("map");

  // Sidebar: lines list
  const sidebar = document.getElementById("lines");
  for (const ln of db.lines) {
    const op = db.byId.operators[ln.operator_id];
    sidebar.append(el("li", {
      onclick: () => location.href = `line.html?id=${ln.id}`
    },
      el("span", { class: "swatch", style: `background:${ln.colour}` }),
      el("span", {}, ln.name_en),
      el("div", { class: "small", style: "padding-left:18px;margin-top:1px" }, op?.name_en || "")
    ));
  }

  // Build node → line colour lookup (first line wins for interchanges)
  const nodeLineColour = {};
  for (const s of db.stops) {
    if (!nodeLineColour[s.station_node_id]) {
      nodeLineColour[s.station_node_id] = db.byId.lines[s.line_id]?.colour || "#888";
    }
  }

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

  // Load pre-baked geometry (produced by ingest_overpass.py).
  // Format: { "line-id": [[lon, lat], ...], ... }
  const lineGeom = await fetch(`data/${CITY}/line_geometry.json`)
    .then(r => r.ok ? r.json() : {})
    .catch(() => ({}));

  // Fallback: station-to-station straight lines
  function stationLineCoords(line) {
    return (db.stopsByLine[line.id] || []).map(s => {
      const n = db.byId.station_nodes[s.station_node_id];
      return [n.lon, n.lat];
    });
  }

  map.on("load", () => {
    // Line geometries
    const lineFeatures = db.lines.map(ln => {
      const coords = (lineGeom[ln.id]?.length >= 2) ? lineGeom[ln.id] : stationLineCoords(ln);
      return {
        type: "Feature",
        properties: { id: ln.id, name: ln.name_en, colour: ln.colour },
        geometry: { type: "LineString", coordinates: coords }
      };
    });

    map.addSource("lines", {
      type: "geojson",
      data: { type: "FeatureCollection", features: lineFeatures }
    });
    map.addLayer({
      id: "lines-shadow", type: "line", source: "lines",
      paint: { "line-color": "#000", "line-width": 10, "line-opacity": 0.10, "line-blur": 4 }
    });
    map.addLayer({
      id: "lines-bg", type: "line", source: "lines",
      paint: { "line-color": "#fff", "line-width": 8 }
    });
    map.addLayer({
      id: "lines-fg", type: "line", source: "lines",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "colour"], "line-width": 5 }
    });

    // Station dots — coloured by line, not operator
    const nodeFeatures = db.station_nodes.map(n => ({
      type: "Feature",
      properties: {
        id: n.id,
        name: n.name_en,
        ja: n.name_ja || "",
        colour: nodeLineColour[n.id] || "#888"
      },
      geometry: { type: "Point", coordinates: [n.lon, n.lat] }
    }));
    map.addSource("nodes", { type: "geojson", data: { type: "FeatureCollection", features: nodeFeatures } });
    map.addLayer({
      id: "nodes-bg", type: "circle", source: "nodes",
      paint: {
        "circle-radius": 7, "circle-color": "#fff",
        "circle-stroke-color": ["get", "colour"], "circle-stroke-width": 2.5
      }
    });
    map.addLayer({
      id: "nodes-fg", type: "circle", source: "nodes",
      paint: { "circle-radius": 3, "circle-color": ["get", "colour"] }
    });

    // Hover popup
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    map.on("mouseenter", "nodes-fg", e => {
      const f = e.features[0];
      map.getCanvas().style.cursor = "pointer";
      popup.setLngLat(f.geometry.coordinates)
        .setHTML(`<div style="font:600 13px/1.4 sans-serif;color:#111">${f.properties.name}</div>
                  <div style="font:12px/1.3 sans-serif;color:#555">${f.properties.ja}</div>`)
        .addTo(map);
    });
    map.on("mouseleave", "nodes-fg", () => { map.getCanvas().style.cursor = ""; popup.remove(); });
    map.on("mouseenter", "lines-fg", () => map.getCanvas().style.cursor = "pointer");
    map.on("mouseleave", "lines-fg", () => map.getCanvas().style.cursor = "");

    // Single click handler: nodes always take priority over lines
    map.on("click", e => {
      const nodeHits = map.queryRenderedFeatures(e.point, { layers: ["nodes-fg", "nodes-bg"] });
      if (nodeHits.length) {
        location.href = `station.html?id=${nodeHits[0].properties.id}`;
        return;
      }
      const lineHits = map.queryRenderedFeatures(e.point, { layers: ["lines-fg"] });
      if (lineHits.length) {
        location.href = `line.html?id=${lineHits[0].properties.id}`;
      }
    });
  });
})();
