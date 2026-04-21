(async () => {
  const { loadCity, el, topbar, qs } = window.TW;
  const db = await loadCity();
  topbar("services");

  const list = document.getElementById("svc-list");
  for (const s of db.services) {
    const primaryLine = db.byId.lines[s.line_path[0]?.line_id];
    list.append(el("li", { onclick: () => location.href = `service.html?id=${s.id}` },
      primaryLine ? el("span", { class: "swatch", style: `background:${primaryLine.colour}` }) : null,
      el("div", { style: "display:inline-block;vertical-align:middle" },
        el("div", {}, s.display_name_en),
        el("div", { class: "small" }, primaryLine?.name_en || "—")
      )
    ));
  }

  const id = qs("id") || db.services[0].id;
  const svc = db.byId.services[id];
  if (!svc) { document.getElementById("header").append(el("p", {}, `No service ${id}`)); return; }

  const primaryLineName = db.byId.lines[svc.line_path[0]?.line_id]?.name_en || "";
  const lineNames = [...new Set(svc.line_path.map(p => db.byId.lines[p.line_id]?.name_en).filter(Boolean))].join(" → ");

  document.getElementById("header").append(
    el("div", { class: "small", style: "margin-bottom:4px;color:var(--ink-dim)" }, lineNames),
    el("h1", {}, svc.display_name_en, " ", el("span", { class: "small" }, svc.display_name_ja || "")),
    el("div", {},
      el("span", { class: "pill" }, svc.service_type),
      svc.supplement !== "none"
        ? el("span", { class: "pill warn" }, `supplement: ${svc.supplement}`)
        : el("span", { class: "pill" }, "no supplement")),
    svc.notes ? el("div", { class: "small", style: "margin-top:6px" }, svc.notes) : null
  );

  // path
  const pathDiv = document.getElementById("path");
  for (const seg of svc.line_path) {
    const line = db.byId.lines[seg.line_id];
    const op = db.byId.operators[line.operator_id];
    const from = db.byId.stops[seg.from_stop];
    const to = db.byId.stops[seg.to_stop];
    const fromNode = db.byId.station_nodes[from.station_node_id];
    const toNode = db.byId.station_nodes[to.station_node_id];
    pathDiv.append(el("div", { class: "card" },
      el("div", { class: "title" },
        el("span", { class: "swatch", style: `background:${line.colour}` }),
        `${line.name_en}  (${op.name_en})`),
      el("div", {}, `${fromNode.name_en} → ${toNode.name_en}`),
      el("div", { class: "small" }, `Stops: ${from.code || from.order}–${to.code || to.order}`)
    ));
  }

  // pattern — list each stop in order, with operator/line colour strip
  const patternDiv = document.getElementById("pattern");
  const strip = el("div", { class: "strip" });
  for (const stopId of svc.stop_pattern) {
    const stp = db.byId.stops[stopId];
    const line = db.byId.lines[stp.line_id];
    const node = db.byId.station_nodes[stp.station_node_id];
    strip.append(el("div", { class: "stop" },
      el("div", { class: "code" }, stp.code || ""),
      el("span", { class: "dot", style: `background:${line.colour}` }),
      el("div", {}, node.name_en)
    ));
  }
  patternDiv.append(strip);

  // freq
  const fdiv = document.getElementById("freq");
  const bands = svc.frequency_bands;
  const kv = el("div", { class: "kv" });
  for (const [k, v] of Object.entries(bands)) {
    kv.append(el("div", { class: "k" }, k.replace(/_/g, " ")),
              el("div", { class: "v" }, v ? `${v} trains / hr` : "—"));
  }
  fdiv.append(kv);
})();
