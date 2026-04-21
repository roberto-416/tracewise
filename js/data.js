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

  // station_node → set of track_ids (for station page)
  db.tracksByNode = {};
  for (const s of db.stops) {
    const stn = db.byId.station_nodes[s.station_node_id];
    if (stn) (db.tracksByNode[stn.id] ||= new Set()).add(s.track_id);
  }

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
        ["Transfers", "transfers.html"]
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

window.TW = { CITY, loadCity, frequencyBucket, BAND_LABELS, qs, el, topbar };
