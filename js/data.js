// Shared data loader + lookup helpers. Used by every view.
// Expects the static site to be served over HTTP (fetch does not work with file://).

const CITY = new URLSearchParams(location.search).get("city") || "osaka";

async function loadCity(city = CITY) {
  // Three-level schema: Track (physical) → Line (brand) → Service (pattern)
  const files = ["operators", "tracks", "lines", "stops", "station_nodes", "transfers", "services", "fare_zones"];
  const entries = await Promise.all(
    files.map(f => fetch(`data/${city}/${f}.json`).then(r => {
      if (!r.ok) throw new Error(`${f}.json: ${r.status}`);
      return r.json();
    }).then(d => [f, d]))
  );
  const db = Object.fromEntries(entries);

  // index by id
  db.byId = {};
  for (const coll of files) {
    db.byId[coll] = Object.fromEntries(db[coll].map(x => [x.id, x]));
  }

  // stops by track
  db.stopsByTrack = {};
  for (const s of db.stops) (db.stopsByTrack[s.track_id] ||= []).push(s);
  for (const tid in db.stopsByTrack) db.stopsByTrack[tid].sort((a, b) => a.order - b.order);

  // transfers by node
  db.transfersByNode = {};
  for (const t of db.transfers) {
    (db.transfersByNode[t.a] ||= []).push(t);
    if (t.a !== t.b) (db.transfersByNode[t.b] ||= []).push(t);
  }

  // lines by operator
  db.linesByOperator = {};
  for (const l of db.lines) (db.linesByOperator[l.primary_operator_id] ||= []).push(l);

  // tracks by line (from lines.tracks array)
  db.tracksByLine = {};
  for (const l of db.lines) {
    db.tracksByLine[l.id] = (l.tracks || []).map(tid => db.byId.tracks[tid]).filter(Boolean);
  }

  // services by line_id
  db.servicesByLine = {};
  for (const svc of db.services) {
    if (svc.line_id) (db.servicesByLine[svc.line_id] ||= []).push(svc);
  }

  // track → primary line (first line whose tracks[] includes this track)
  db.lineByTrack = {};
  for (const l of db.lines) {
    for (const tid of (l.tracks || [])) {
      if (!db.lineByTrack[tid]) db.lineByTrack[tid] = l;
    }
  }

  // track → ALL lines that include it (a track can be shared by multiple lines)
  db.linesByTrack = {};
  for (const l of db.lines) {
    for (const tid of (l.tracks || [])) {
      (db.linesByTrack[tid] ||= []).push(l);
    }
  }

  // station_node → set of track_ids (for station page)
  db.tracksByNode = {};
  for (const s of db.stops) {
    const stn = db.byId.station_nodes[s.station_node_id];
    if (stn) (db.tracksByNode[stn.id] ||= new Set()).add(s.track_id);
  }

  // services by track_id (via line_path[].track_id)
  db.servicesByTrack = {};
  for (const svc of db.services) {
    const tids = new Set((svc.line_path || []).map(seg => seg.track_id).filter(Boolean));
    for (const tid of tids) (db.servicesByTrack[tid] ||= []).push(svc);
  }

  // Proximity + transfer clustering of station nodes.
  // Merge nodes that are (a) linked by same-name-connected / through-run-boundary
  // transfers, or (b) within ~150m of each other. Fixes duplicate dots at Noda,
  // Osaka-Namba, Hankyu Umeda, etc., regardless of whether a transfer record exists.
  const parent = {};
  for (const n of db.station_nodes) parent[n.id] = n.id;
  const find = id => parent[id] === id ? id : (parent[id] = find(parent[id]));
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  // Merge by transfer category
  for (const t of db.transfers) {
    if (t.a === t.b) continue;
    if (t.category === "same-name-connected" || t.category === "through-run-boundary") union(t.a, t.b);
  }
  // Merge by proximity (~150m, rough). Brute force OK: ~few hundred nodes.
  const R_DEG = 0.0014; // ~155m at 34.7°N
  const nodes = db.station_nodes;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      if (Math.abs(a.lat - b.lat) > R_DEG) continue;
      if (Math.abs(a.lon - b.lon) > R_DEG) continue;
      const dLat = a.lat - b.lat, dLon = a.lon - b.lon;
      if (dLat * dLat + dLon * dLon <= R_DEG * R_DEG) union(a.id, b.id);
    }
  }

  db.nodeCluster = {};
  db.clusterNodes = {};
  for (const n of db.station_nodes) {
    const cid = find(n.id);
    db.nodeCluster[n.id] = cid;
    (db.clusterNodes[cid] ||= []).push(n);
  }

  // tracks touching a cluster (union of tracksByNode across cluster members)
  db.tracksByCluster = {};
  for (const [cid, members] of Object.entries(db.clusterNodes)) {
    const set = new Set();
    for (const n of members) for (const tid of (db.tracksByNode[n.id] || [])) set.add(tid);
    db.tracksByCluster[cid] = set;
  }

  // lines touching a cluster (via tracksByCluster → linesByTrack)
  db.linesByCluster = {};
  for (const [cid, tids] of Object.entries(db.tracksByCluster)) {
    const seen = new Set();
    const arr = [];
    for (const tid of tids) {
      for (const ln of (db.linesByTrack[tid] || [])) {
        if (!seen.has(ln.id)) { seen.add(ln.id); arr.push(ln); }
      }
    }
    db.linesByCluster[cid] = arr;
  }

  // services touching a cluster: any service whose stop_pattern hits a node in the cluster
  db.servicesByCluster = {};
  for (const svc of db.services) {
    const hits = new Set();
    for (const sid of (svc.stop_pattern || [])) {
      const stop = db.byId.stops[sid];
      if (!stop) continue;
      const cid = db.nodeCluster[stop.station_node_id];
      if (cid) hits.add(cid);
    }
    for (const cid of hits) (db.servicesByCluster[cid] ||= []).push(svc);
  }

  // Aggregate frequency (tph) at a cluster for a time band, summed across all services
  // that stop in the cluster during that band.
  db.clusterFrequency = (cid, band) => {
    const svcs = db.servicesByCluster[cid] || [];
    let tph = 0;
    for (const svc of svcs) {
      // Only count if service actually stops at a node in this cluster
      const stops = svc.stop_pattern || [];
      const hit = stops.some(sid => {
        const s = db.byId.stops[sid];
        return s && db.nodeCluster[s.station_node_id] === cid;
      });
      if (!hit) continue;
      tph += (svc.frequency_bands?.[band] || 0);
    }
    return tph;
  };

  return db;
}

function frequencyBucket(tph) {
  if (tph >= 12) return 5;
  if (tph >= 8)  return 4;
  if (tph >= 4)  return 3;
  if (tph >= 2)  return 2;
  if (tph >= 0.5)return 1;
  return 0;
}

// Trim bidirectional OSM geometry: some route relations include both-direction
// ways, creating a path that goes A→B then snakes back toward A. Detect by
// finding the index of max distance from the start; if a significant return
// fraction follows (>15%), truncate there.
function trimGeometry(coords) {
  if (!coords || coords.length < 6) return coords;
  const [x0, y0] = coords[0];
  let maxDist = 0, peakIdx = 0;
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - x0, dy = coords[i][1] - y0;
    const d = dx * dx + dy * dy;
    if (d > maxDist) { maxDist = d; peakIdx = i; }
  }
  const returnFrac = (coords.length - 1 - peakIdx) / coords.length;
  return returnFrac > 0.15 ? coords.slice(0, peakIdx + 1) : coords;
}

function qs(name) { return new URLSearchParams(location.search).get(name); }

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) if (c != null) n.append(c.nodeType ? c : document.createTextNode(c));
  return n;
}

const BAND_LABELS = {
  peak_am:        "AM peak",
  midday:         "Midday",
  peak_pm:        "PM peak",
  evening:        "Evening",
  late_night:     "Late night",
  weekend_midday: "Wknd midday",
};

const BAND_ORDER = ["peak_am", "midday", "peak_pm", "evening", "late_night", "weekend_midday"];

// Map tph → bucket (0-5) matching .dot.f0..f5 shading
function freqBucket(tph) {
  if (tph >= 12) return 5;
  if (tph >= 8)  return 4;
  if (tph >= 4)  return 3;
  if (tph >= 2)  return 2;
  if (tph >= 0.5)return 1;
  return 0;
}

function topbar(active) {
  const bar = el("div", { class: "topbar" },
    el("div", { class: "brand" },
      el("a", { href: "index.html", class: "brand-name" }, "Tracewise"),
      el("span", { class: "brand-sub" }, "transit comprehension")),
    el("nav", {},
      ...[
        ["Map", "index.html"],
        ["Lines", "line.html"],
        ["Stations", "station.html"],
        ["Services", "service.html"],
        ["Transfers", "transfers.html"],
        ["Tracks", "track.html"]
      ].map(([t, href]) => {
        const a = el("a", { href }, t);
        if (active === t.toLowerCase()) a.className = "active";
        return a;
      })
    ),
    el("div", { class: "city" }, CITY.charAt(0).toUpperCase() + CITY.slice(1))
  );
  document.body.prepend(bar);
}

window.TW = { CITY, loadCity, frequencyBucket, freqBucket, BAND_LABELS, BAND_ORDER, qs, el, topbar, trimGeometry };
