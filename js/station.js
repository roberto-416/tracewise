(async () => {
  const { loadCity, el, topbar, qs, freqBucket, BAND_LABELS, BAND_ORDER } = window.TW;
  const db = await loadCity();
  topbar("stations");

  // ── Sidebar: group by cluster so co-located nodes appear once ───────────
  // Pick a primary node per cluster (first encountered).
  const clusterPrimary = {};
  for (const n of db.station_nodes) {
    const cid = db.nodeCluster[n.id];
    if (!clusterPrimary[cid]) clusterPrimary[cid] = n;
  }
  const groups = Object.entries(clusterPrimary).map(([cid, primary]) => {
    const members = db.clusterNodes[cid];
    const names = [...new Set(members.map(n => n.name_en))];
    const ja    = [...new Set(members.map(n => n.name_ja).filter(Boolean))];
    return { cid, primary, members, name: names.join(" / "), ja: ja.join("・") };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const list = document.getElementById("station-list");
  function render(filter = "") {
    list.innerHTML = "";
    const q = filter.toLowerCase();
    for (const g of groups) {
      if (q && !`${g.name} ${g.ja}`.toLowerCase().includes(q)) continue;
      const trackIds = [...(db.tracksByCluster[g.cid] || [])];
      const swatches = trackIds.map(tid => {
        const t = db.byId.tracks[tid];
        return t ? el("span", { class: "swatch", style: `background:${t.colour}` }) : null;
      }).filter(Boolean);
      list.append(el("li", { onclick: () => location.href = `station.html?id=${g.primary.id}` },
        el("div", { class: "stn-swatches" }, ...swatches),
        el("div", { class: "stn-name" },
          el("span", {}, g.name),
          g.ja ? el("span", { class: "ja", style: "margin-left:5px" }, g.ja) : null
        )
      ));
    }
  }
  document.getElementById("search").addEventListener("input", e => render(e.target.value));
  render();

  // ── Main ────────────────────────────────────────────────────────────────
  const id = qs("id") || db.station_nodes[0].id;
  const node = db.byId.station_nodes[id];
  if (!node) {
    document.getElementById("header").append(el("p", {}, `No station ${id}`));
    return;
  }
  const cid = db.nodeCluster[id];
  const members = db.clusterNodes[cid] || [node];
  const allNames = [...new Set(members.map(n => n.name_en))];
  const allJa    = [...new Set(members.map(n => n.name_ja).filter(Boolean))];
  const allOps   = [...new Set(members.map(n => db.byId.operators[n.operator_id]?.name_en).filter(Boolean))];

  document.getElementById("header").append(
    el("h1", {}, allNames.join(" / "), " ", el("span", { class: "small" }, allJa.join("・"))),
    el("div", { class: "kv" },
      el("div", { class: "k" }, allOps.length > 1 ? "Operators" : "Operator"),
      el("div", { class: "v" }, allOps.join(", ") || "—"),
      el("div", { class: "k" }, "Lat / Lon"),
      el("div", { class: "v" }, `${node.lat.toFixed(4)}, ${node.lon.toFixed(4)}`),
      members.length > 1 ? el("div", { class: "k" }, "Nodes in cluster") : null,
      members.length > 1 ? el("div", { class: "v" }, String(members.length)) : null
    )
  );

  // ── Transfers (across cluster) ──────────────────────────────────────────
  const tdiv = document.getElementById("transfers");
  const memberIds = new Set(members.map(n => n.id));
  const edges = [];
  const seenPair = new Set();
  for (const n of members) {
    for (const t of (db.transfersByNode[n.id] || [])) {
      const key = [t.a, t.b].sort().join("::");
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      edges.push(t);
    }
  }
  if (!edges.length) tdiv.append(el("div", { class: "small" }, "None recorded."));
  for (const t of edges) {
    const otherId = memberIds.has(t.a) ? t.b : t.a;
    const other = db.byId.station_nodes[otherId];
    const colour = {
      "same-name-not-connected":  "var(--red)",
      "same-name-connected":      "var(--green)",
      "different-name-connected": "var(--accent)",
      "through-run-boundary":     "var(--yellow)"
    }[t.category] || "var(--ink-dim)";
    tdiv.append(el("div", { class: "card" },
      el("div", { class: "title", style: `color:${colour}` },
        "→ ",
        el("a", { href: `station.html?id=${otherId}`, style: "color:inherit" }, other?.name_en || otherId),
        " ",
        el("span", { class: "pill" }, t.category)),
      el("div", { class: "kv" },
        el("div", { class: "k" }, "Walk"),
        el("div", { class: "v" }, `${t.walking_time_min} min`),
        el("div", { class: "k" }, "Paid area?"),
        el("div", { class: "v" }, t.paid_area ? "yes" : "no")),
      el("div", { class: "small" }, t.note || "")
    ));
  }

  // ── Lines serving this cluster (all tracks touching any member node) ────
  const linesHere = db.linesByCluster[cid] || [];
  const linesDiv = document.getElementById("lines");
  if (linesDiv) {
    if (!linesHere.length) {
      linesDiv.append(el("div", { class: "small" }, "No lines serve this station."));
    } else {
      const ul = el("ul", { style: "list-style:none;padding:0;margin:0" });
      for (const ln of linesHere) {
        ul.append(el("li", { style: "padding:3px 0" },
          el("span", { class: "swatch", style: `background:${ln.colour}` }),
          el("a", { href: `line.html?id=${ln.id}` }, ln.display_name_en || ln.id),
          ln.display_name_ja ? el("span", { class: "small", style: "margin-left:6px" }, ln.display_name_ja) : null
        ));
      }
      linesDiv.append(ul);
    }
  }

  // ── Services: group by Line → list services stopping in cluster ─────────
  const sdiv = document.getElementById("services");
  const servicesHere = (db.servicesByCluster[cid] || []);
  if (!servicesHere.length) {
    sdiv.append(el("div", { class: "small" }, "No services stop here yet."));
  } else {
    // group by line_id
    const byLine = {};
    for (const svc of servicesHere) {
      const key = svc.line_id || "_unknown";
      (byLine[key] ||= []).push(svc);
    }
    for (const [lineId, svcs] of Object.entries(byLine)) {
      const line = db.byId.lines[lineId];
      const colour = line?.colour || "#888";
      sdiv.append(el("div", { class: "card" },
        el("div", { class: "title" },
          el("span", { class: "swatch", style: `background:${colour}` }),
          line
            ? el("a", { href: `line.html?id=${line.id}` }, line.display_name_en || line.id)
            : lineId),
        el("ul", { style: "margin:6px 0 0;padding-left:18px" },
          ...svcs.map(svc => el("li", {},
            el("a", { href: `service.html?id=${svc.id}` }, svc.display_name_en || svc.id),
            svc.supplement && svc.supplement !== "none"
              ? el("span", { class: "pill warn", style: "margin-left:8px" }, svc.supplement) : null,
            el("span", { class: "small", style: "margin-left:8px" },
              Object.entries(svc.frequency_bands || {}).filter(([, v]) => v > 0)
                .map(([k, v]) => `${BAND_LABELS[k] || k} ${v}`).join(" · "))
          )))
      ));
    }
  }

  // ── Aggregate frequency by time band (all services at this cluster) ─────
  const freqDiv = document.getElementById("freq");
  if (freqDiv && servicesHere.length) {
    const wrap = el("div", { class: "matrix-wrap" });
    const tbl = el("table", { class: "matrix" });
    const thead = el("thead");
    const hr = el("tr");
    hr.append(el("th", { class: "svc" }, "Time band"));
    hr.append(el("th", { class: "stopcol" }, "Trains / hour"));
    hr.append(el("th", { class: "stopcol" }, ""));
    thead.append(hr);
    tbl.append(thead);
    const tbody = el("tbody");
    for (const band of BAND_ORDER) {
      const tph = db.clusterFrequency(cid, band);
      const tr = el("tr");
      tr.append(el("th", { class: "svc" }, BAND_LABELS[band]));
      tr.append(el("td", { class: `stop freq-cell f${freqBucket(tph)}` }, tph > 0 ? String(tph) : "—"));
      tbody.append(tr);
    }
    tbl.append(tbody);
    wrap.append(tbl);
    freqDiv.append(wrap);
  }
})();
