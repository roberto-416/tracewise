(async () => {
  const { loadCity, el, topbar, qs, frequencyBucket, BAND_LABELS } = window.TW;
  const db = await loadCity();
  topbar("lines");

  const list = document.getElementById("line-list");

  // Group by operator
  const opOrder = db.operators.map(o => o.id);
  const byOp = {};
  for (const ln of db.lines) (byOp[ln.operator_id] ||= []).push(ln);

  function renderLineList(filter = "") {
    list.innerHTML = "";
    const q = filter.toLowerCase();
    for (const opId of opOrder) {
      const opLines = (byOp[opId] || []).filter(ln =>
        !q || (ln.name_en || "").toLowerCase().includes(q) || (ln.name_ja || "").includes(filter));
      if (!opLines.length) continue;
      const op = db.byId.operators[opId];
      list.append(el("li", { style: "padding:8px 4px 2px;font-size:11px;color:var(--ink-dim);text-transform:uppercase;letter-spacing:.05em;cursor:default;font-weight:600" },
        op.name_en));
      for (const ln of opLines) {
        list.append(el("li", { onclick: () => location.href = `line.html?id=${ln.id}` },
          el("span", { class: "swatch", style: `background:${ln.colour}` }),
          ln.name_en || ln.name_ja));
      }
    }
  }

  document.getElementById("search").addEventListener("input", e => renderLineList(e.target.value));
  renderLineList();

  let lineId = qs("id") || db.lines.find(l => l.operator_id === "osaka-metro")?.id || db.lines[0].id;
  const line = db.byId.lines[lineId];
  const op = db.byId.operators[line.operator_id];
  const stops = db.stopsByLine[lineId] || [];

  // header
  document.getElementById("header").append(
    el("h1", {},
      el("span", { class: "swatch", style: `background:${line.colour};width:14px;height:14px;display:inline-block;border-radius:3px;vertical-align:middle;margin-right:6px` }),
      line.name_en, " ", el("span", { class: "small" }, `(${line.name_ja || ""})`)),
    el("div", { class: "kv" },
      el("div", { class: "k" }, "Operator"),
      el("div", { class: "v" }, op.name_en, el("span", { class: "ja" }, op.name_ja || "")),
      el("div", { class: "k" }, "Code"),
      el("div", { class: "v" }, line.code || "—"),
      el("div", { class: "k" }, "Stops"),
      el("div", { class: "v" }, stops.length)
    )
  );

  // ----- matrix -----
  const services = db.servicesByLine[lineId] || [];
  const cols = stops.slice();
  const table = document.getElementById("matrix");
  const thead = el("thead");
  const headRow = el("tr");
  headRow.append(el("th", { class: "svc" }, "Service \u2193 / Stop \u2192"));
  for (const s of cols) {
    const node = db.byId.station_nodes[s.station_node_id];
    headRow.append(el("th", { class: "stopcol" }, node.name_en));
  }
  thead.append(headRow);
  table.append(thead);

  const tbody = el("tbody");
  for (const svc of services) {
    const patternNodes = new Set(
      svc.stop_pattern.map(sid => db.byId.stops[sid]?.station_node_id).filter(Boolean)
    );
    const tr = el("tr");

    // freq summary: "AM peak 15 · Midday 9 · …"
    const freqParts = Object.entries(svc.frequency_bands)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${BAND_LABELS[k] || k} ${v}`).join(" · ");

    const label = el("th", { class: "svc" },
      el("a", { href: `service.html?id=${svc.id}`, style: "font-weight:600" }, svc.display_name_en),
      el("div", { class: "small", style: "margin-top:2px" }, freqParts)
    );
    tr.append(label);

    const peakTph = Math.max(...Object.values(svc.frequency_bands));
    const freqClass = `f${frequencyBucket(peakTph)}`;
    for (const s of cols) {
      const td = el("td", { class: "stop" });
      td.append(el("span", { class: patternNodes.has(s.station_node_id) ? `dot ${freqClass}` : "dot f0" }));
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);

  // ----- service cards -----
  const svcDiv = document.getElementById("services");
  for (const svc of services) {
    const otherLines = svc.line_path.filter(p => p.line_id !== lineId);
    const badges = [];
    if (svc.supplement !== "none") badges.push(el("span", { class: "pill warn" }, `supplement: ${svc.supplement}`));
    if (otherLines.length) badges.push(el("span", { class: "pill" }, "interlines"));
    badges.push(el("span", { class: "pill" }, svc.service_type));

    const crossNames = otherLines.map(p => db.byId.lines[p.line_id]?.name_en).filter(Boolean).join(", ");
    svcDiv.append(el("div", { class: "card" },
      el("div", { class: "title" },
        el("a", { href: `service.html?id=${svc.id}` }, svc.display_name_en),
        el("div", {}, ...badges)),
      el("div", { class: "small" }, svc.notes || ""),
      crossNames ? el("div", { class: "small" }, "Interlines onto: " + crossNames) : null
    ));
  }
})();
