(async () => {
  const { loadCity, el, topbar, qs, BAND_LABELS } = window.TW;
  const db = await loadCity();
  topbar("stations");

  // ---- Sidebar: group by name, no duplicates ----
  // Build node-id → set of track_ids (then map to line colour)
  const nodeLines = {};
  for (const s of db.stops) (nodeLines[s.station_node_id] ||= new Set()).add(s.track_id);

  // Group station_nodes by display name (same name = same physical station group)
  const byName = {};
  for (const n of db.station_nodes) (byName[n.name_en] ||= []).push(n);
  const groups = Object.entries(byName).sort(([a], [b]) => a.localeCompare(b));

  const list = document.getElementById("station-list");
  function render(filter = "") {
    list.innerHTML = "";
    for (const [name, nodes] of groups) {
      const ja = nodes.map(n => n.name_ja).filter(Boolean)[0] || "";
      if (filter && !(`${name} ${ja}`.toLowerCase().includes(filter.toLowerCase()))) continue;

      // Collect all unique tracks across all nodes in this name group
      const allTrackIds = [...new Set(nodes.flatMap(n => [...(nodeLines[n.id] || [])]))];
      const swatches = allTrackIds.map(tid => {
        const t = db.byId.tracks[tid];
        return t ? el("span", { class: "swatch", style: `background:${t.colour}` }) : null;
      }).filter(Boolean);

      const primary = nodes[0]; // navigate to first node; its station page shows all transfers
      list.append(el("li", { onclick: () => location.href = `station.html?id=${primary.id}` },
        el("div", { class: "stn-swatches" }, ...swatches),
        el("div", { class: "stn-name" },
          el("span", {}, name),
          ja ? el("span", { class: "ja", style: "margin-left:5px" }, ja) : null
        )
      ));
    }
  }
  document.getElementById("search").addEventListener("input", e => render(e.target.value));
  render();

  // ---- Main content ----
  const id = qs("id") || db.station_nodes[0].id;
  const node = db.byId.station_nodes[id];
  if (!node) {
    document.getElementById("header").append(el("p", {}, `No station ${id}`));
    return;
  }
  const op = db.byId.operators[node.operator_id];

  document.getElementById("header").append(
    el("h1", {}, node.name_en, " ", el("span", { class: "small" }, node.name_ja || "")),
    el("div", { class: "kv" },
      el("div", { class: "k" }, "Operator"),
      el("div", { class: "v" }, op?.name_en || "—"),
      el("div", { class: "k" }, "Lat / Lon"),
      el("div", { class: "v" }, `${node.lat.toFixed(4)}, ${node.lon.toFixed(4)}`)
    )
  );

  // Transfers
  const tdiv = document.getElementById("transfers");
  const edges = db.transfersByNode[node.id] || [];
  if (!edges.length) tdiv.append(el("div", { class: "small" }, "None recorded."));
  for (const t of edges) {
    const otherId = t.a === node.id ? t.b : t.a;
    const other = db.byId.station_nodes[otherId];
    const colour = {
      "same-name-not-connected":  "var(--red)",
      "same-name-connected":      "var(--green)",
      "different-name-connected": "var(--accent)",
      "through-run-boundary":     "var(--yellow)"
    }[t.category] || "var(--ink-dim)";
    tdiv.append(el("div", { class: "card" },
      el("div", { class: "title", style: `color:${colour}` },
        `→ ${other?.name_en || otherId} `,
        el("span", { class: "pill" }, t.category)),
      el("div", { class: "kv" },
        el("div", { class: "k" }, "Walk"),
        el("div", { class: "v" }, `${t.walking_time_min} min`),
        el("div", { class: "k" }, "Paid area?"),
        el("div", { class: "v" }, t.paid_area ? "yes" : "no")),
      el("div", { class: "small" }, t.note || "")
    ));
  }

  // Services — group by line (named brand), show which patterns stop here
  const sdiv = document.getElementById("services");
  const stopsHere = db.stops.filter(s => s.station_node_id === node.id);
  if (!stopsHere.length) sdiv.append(el("div", { class: "small" }, "No stops on modelled tracks."));

  // Deduplicate: group by the Line (not track) so each named line appears once
  const linesSeen = new Set();
  for (const stp of stopsHere) {
    const track = db.byId.tracks[stp.track_id];
    if (!track) continue;
    const line = db.lineByTrack[stp.track_id];
    const lineKey = line?.id || stp.track_id;
    if (linesSeen.has(lineKey)) continue;
    linesSeen.add(lineKey);

    const colour = track.colour || line?.colour || "#888";
    const svcs = (db.servicesByLine[lineKey] || []).filter(s =>
      s.stop_pattern.some(sid => db.byId.stops[sid]?.station_node_id === node.id));

    sdiv.append(el("div", { class: "card" },
      el("div", { class: "title" },
        el("span", { class: "swatch", style: `background:${colour}` }),
        line
          ? el("a", { href: `line.html?id=${line.id}` }, line.display_name_en || line.id)
          : (track.name_en || track.id),
        el("span", { class: "small", style: "margin-left:6px" }, `· ${stp.code || ""}`)),
      svcs.length
        ? el("ul", { style: "margin:6px 0 0;padding-left:18px" },
            ...svcs.map(svc => el("li", {},
              el("a", { href: `service.html?id=${svc.id}` }, svc.display_name_en),
              svc.supplement !== "none"
                ? el("span", { class: "pill warn", style: "margin-left:8px" }, svc.supplement) : null,
              el("span", { class: "small", style: "margin-left:8px" },
                Object.entries(svc.frequency_bands).filter(([, v]) => v > 0)
                  .map(([k, v]) => `${BAND_LABELS[k] || k} ${v}`).join(" · "))
            )))
        : el("div", { class: "small", style: "margin-top:4px" }, "No services defined yet.")
    ));
  }
})();
