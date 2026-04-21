(async () => {
  const { loadCity, el, topbar, qs, BAND_LABELS } = window.TW;
  const db = await loadCity();
  topbar("stations");

  const list = document.getElementById("station-list");
  const sorted = db.station_nodes.slice().sort((a, b) => a.name_en.localeCompare(b.name_en));
  function render(filter = "") {
    list.innerHTML = "";
    for (const n of sorted) {
      if (filter && !(`${n.name_en} ${n.name_ja || ""}`.toLowerCase().includes(filter.toLowerCase()))) continue;
      const op = db.byId.operators[n.operator_id];
      list.append(el("li", { onclick: () => location.href = `station.html?id=${n.id}` },
        el("span", { class: "swatch", style: `background:${op?.colour || "#888"}` }),
        n.name_en,
        el("span", { class: "small", style: "margin-left:6px" }, op?.name_en || "")));
    }
  }
  document.getElementById("search").addEventListener("input", e => render(e.target.value));
  render();

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
      el("div", { class: "v" }, `${node.lat.toFixed(4)}, ${node.lon.toFixed(4)}`),
      node.line_hint ? el("div", { class: "k" }, "Line note") : null,
      node.line_hint ? el("div", { class: "v" }, node.line_hint) : null
    )
  );

  // transfers
  const tdiv = document.getElementById("transfers");
  const edges = db.transfersByNode[node.id] || [];
  if (!edges.length) tdiv.append(el("div", { class: "small" }, "None recorded."));
  for (const t of edges) {
    const other = t.a === node.id ? t.b : t.a;
    const otherNode = db.byId.station_nodes[other];
    const colour = {
      "same-name-not-connected": "var(--red)",
      "same-name-connected": "var(--green)",
      "different-name-connected": "var(--accent)",
      "through-run-boundary": "var(--yellow)"
    }[t.category] || "var(--ink-dim)";
    tdiv.append(el("div", { class: "card" },
      el("div", { class: "title", style: `color:${colour}` },
        `→ ${otherNode?.name_en || other} `,
        el("span", { class: "pill" }, t.category)),
      el("div", { class: "kv" },
        el("div", { class: "k" }, "Walk"),
        el("div", { class: "v" }, `${t.walking_time_min} min`),
        el("div", { class: "k" }, "Paid area?"),
        el("div", { class: "v" }, t.paid_area ? "yes" : "no")),
      el("div", { class: "small" }, t.note || "")
    ));
  }

  // services
  const sdiv = document.getElementById("services");
  const stopsHere = db.stops.filter(s => s.station_node_id === node.id);
  if (!stopsHere.length) sdiv.append(el("div", { class: "small" }, "No stops on modelled lines."));
  for (const stp of stopsHere) {
    const line = db.byId.lines[stp.line_id];
    // Match by station_node_id so interline services still show at the boundary (e.g. Esaka).
    const svcs = (db.servicesByLine[line.id] || []).filter(s =>
      s.stop_pattern.some(sid => db.byId.stops[sid]?.station_node_id === stp.station_node_id));
    sdiv.append(el("div", { class: "card" },
      el("div", { class: "title" },
        el("span", { class: "swatch", style: `background:${line.colour}` }),
        `${line.name_en} · platform ${stp.code || stp.order}`),
      el("ul", { style: "margin:6px 0 0;padding-left:18px" },
        ...svcs.map(svc => el("li", {},
          el("a", { href: `service.html?id=${svc.id}` }, svc.display_name_en),
          svc.supplement !== "none" ? el("span", { class: "pill warn", style: "margin-left:8px" }, svc.supplement) : null,
          el("span", { class: "small", style: "margin-left:8px" },
            Object.entries(svc.frequency_bands).filter(([, v]) => v > 0).map(([k, v]) => `${BAND_LABELS[k] || k} ${v}`).join(" · "))
        )))
    ));
  }
})();
