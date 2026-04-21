(async () => {
  const { loadCity, el, topbar } = window.TW;
  const db = await loadCity();
  topbar("transfers");

  const buckets = {
    "same-name-not-connected": { label: "Same name, NOT connected", colour: "var(--red)" },
    "same-name-connected": { label: "Same name, connected", colour: "var(--green)" },
    "different-name-connected": { label: "Different names, connected", colour: "var(--accent)" },
    "through-run-boundary": { label: "Through-run boundary", colour: "var(--yellow)" }
  };

  const root = document.getElementById("lists");
  for (const [key, meta] of Object.entries(buckets)) {
    const items = db.transfers.filter(t => t.category === key);
    root.append(el("h2", { style: `color:${meta.colour}` }, `${meta.label} (${items.length})`));
    if (!items.length) { root.append(el("div", { class: "small" }, "None recorded yet.")); continue; }
    for (const t of items) {
      const a = db.byId.station_nodes[t.a];
      const b = db.byId.station_nodes[t.b];
      root.append(el("div", { class: "card" },
        el("div", { class: "title" },
          el("a", { href: `station.html?id=${t.a}` }, a?.name_en || t.a),
          " ↔ ",
          el("a", { href: `station.html?id=${t.b}` }, b?.name_en || t.b)),
        el("div", { class: "kv" },
          el("div", { class: "k" }, "Walk"),
          el("div", { class: "v" }, `${t.walking_time_min} min`),
          el("div", { class: "k" }, "Paid area?"),
          el("div", { class: "v" }, t.paid_area ? "yes" : "no")),
        el("div", { class: "small" }, t.note || "")
      ));
    }
  }
})();
