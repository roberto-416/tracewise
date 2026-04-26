/* Tracewise — shared UI helpers (per spec §4.7, §5) */
(function () {
  'use strict';

  const TW = {};

  TW.escapeHtml = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  TW.qs = function (name) {
    return new URLSearchParams(location.search).get(name);
  };

  TW.matches = function (q, ...fields) {
    if (!q) return true;
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return fields.some(f => (f || '').toString().toLowerCase().includes(needle));
  };

  TW.swatch = function (colour) {
    return `<span class="tw-swatch" style="background:${colour}"></span>`;
  };

  TW.pill = function (text, opts) {
    opts = opts || {};
    const cls = opts.cls ? ' ' + opts.cls : '';
    const swatch = opts.colour ? TW.swatch(opts.colour) : '';
    return `<span class="tw-pill${cls}">${swatch}${TW.escapeHtml(text)}</span>`;
  };

  TW.opPill = function (op) {
    if (!op) return '';
    return TW.pill(op.name_en, { colour: op.colour });
  };

  TW.suppPill = function (supplement) {
    if (!supplement || supplement === 'none') return '';
    const labels = {
      limited_express: 'LtdEx fee',
      reserved: 'Reserved',
      special: 'Special'
    };
    return `<span class="tw-pill tw-supp--${supplement}">${TW.escapeHtml(labels[supplement] || supplement)}</span>`;
  };

  TW.serviceTypePill = function (type) {
    if (!type) return '';
    const label = type.replace(/_/g, ' ');
    return `<span class="tw-pill tw-svc-type">${TW.escapeHtml(label)}</span>`;
  };

  TW.freqClass = function (tph) {
    tph = Number(tph) || 0;
    if (tph <= 0) return 'tw-f0';
    if (tph === 1) return 'tw-f1';
    if (tph <= 3)  return 'tw-f2';
    if (tph <= 7)  return 'tw-f3';
    if (tph <= 11) return 'tw-f4';
    return 'tw-f5';
  };

  TW.freqCell = function (tph) {
    const cls = TW.freqClass(tph);
    return `<td class="tw-freq-cell ${cls}">${tph}</td>`;
  };

  TW.skeleton = function (n) {
    n = n || 4;
    let html = '<div class="tw-skeleton" aria-hidden="true">';
    for (let i = 0; i < n; i++) {
      const w = 60 + Math.round(Math.random() * 40);
      html += `<div class="tw-skel-bar" style="width:${w}%"></div>`;
    }
    return html + '</div>';
  };

  TW.toast = function (msg) {
    let host = document.getElementById('tw-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'tw-toast-host';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = 'tw-toast';
    const span = document.createElement('span');
    span.textContent = msg;
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', 'Dismiss');
    btn.textContent = '×';
    btn.onclick = () => el.remove();
    el.appendChild(span); el.appendChild(btn);
    host.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  };

  TW.notFound = function (entity) {
    TW.toast(`That ${entity} wasn't found — showing the system map.`);
    setTimeout(() => { location.href = 'index.html'; }, 1200);
  };

  TW.renderHeader = function (activePage) {
    const wrap = document.createElement('header');
    wrap.className = 'tw-header';
    wrap.innerHTML = `
      <a href="index.html" class="tw-wordmark">Tracewise</a>
      <nav class="tw-nav">
        <a href="index.html" ${activePage === 'index' ? 'class="active"' : ''}>Map</a>
        <a href="transfers.html" ${activePage === 'transfers' ? 'class="active"' : ''}>Transfers</a>
        <a href="about.html" ${activePage === 'about' ? 'class="active"' : ''}>About</a>
      </nav>
      <div class="tw-header-spacer"></div>
    `;
    document.body.insertBefore(wrap, document.body.firstChild);
  };

  // Sidebar: lines grouped by operator, with search.
  TW.renderLineSidebar = function (mountId, opts) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    const operators = Tracewise.data.operators || [];
    const lines = Tracewise.data.lines || [];
    const activeId = opts && opts.activeId;
    const linkBuilder = (opts && opts.href) || (ln => `line.html?id=${encodeURIComponent(ln.id)}`);

    function render(q) {
      const byOp = new Map();
      for (const op of operators) byOp.set(op.id, []);
      for (const ln of lines) {
        if (!byOp.has(ln.primary_operator_id)) byOp.set(ln.primary_operator_id, []);
        byOp.get(ln.primary_operator_id).push(ln);
      }
      let html = '';
      let any = false;
      for (const op of operators) {
        const opLines = (byOp.get(op.id) || []).filter(ln =>
          TW.matches(q, ln.display_name_en, ln.display_name_ja, op.name_en, op.name_ja)
        );
        if (opLines.length === 0) continue;
        any = true;
        html += `<div class="tw-op-group">
          <div class="tw-op-header">
            <span class="tw-op-bar" style="background:${op.colour}"></span>
            <span>${TW.escapeHtml(op.name_en)}</span>
          </div>
          <ul class="tw-line-list">`;
        for (const ln of opLines) {
          const cls = ln.id === activeId ? ' active' : '';
          html += `<a class="tw-line-row${cls}" href="${linkBuilder(ln)}">
            <span class="tw-swatch" style="background:${ln.colour}"></span>
            <span class="tw-line-name-en">${TW.escapeHtml(ln.display_name_en)}</span>
            <span class="tw-line-name-ja">${TW.escapeHtml(ln.display_name_ja || '')}</span>
          </a>`;
        }
        html += `</ul></div>`;
      }
      mount.innerHTML = any ? html : '<div class="tw-empty">No matches.</div>';
    }
    render('');
    return render;
  };

  // Sidebar: tracks grouped by operator
  TW.renderTrackSidebar = function (mountId, opts) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    const operators = Tracewise.data.operators || [];
    const tracks = Tracewise.data.tracks || [];
    const activeId = opts && opts.activeId;

    function render(q) {
      const byOp = new Map();
      for (const op of operators) byOp.set(op.id, []);
      for (const t of tracks) {
        if (!byOp.has(t.operator_id)) byOp.set(t.operator_id, []);
        byOp.get(t.operator_id).push(t);
      }
      let html = '';
      let any = false;
      for (const op of operators) {
        const opTracks = (byOp.get(op.id) || []).filter(t =>
          TW.matches(q, t.name_en, t.name_ja, t.code, op.name_en, op.name_ja)
        );
        if (opTracks.length === 0) continue;
        any = true;
        html += `<div class="tw-op-group">
          <div class="tw-op-header">
            <span class="tw-op-bar" style="background:${op.colour}"></span>
            <span>${TW.escapeHtml(op.name_en)}</span>
          </div>
          <ul class="tw-line-list">`;
        for (const t of opTracks) {
          const cls = t.id === activeId ? ' active' : '';
          html += `<a class="tw-line-row${cls}" href="track.html?id=${encodeURIComponent(t.id)}">
            <span class="tw-swatch" style="background:${t.colour}"></span>
            <span class="tw-line-name-en">${TW.escapeHtml(t.name_en)}</span>
            <span class="tw-line-name-ja">${TW.escapeHtml(t.name_ja || '')}</span>
          </a>`;
        }
        html += `</ul></div>`;
      }
      mount.innerHTML = any ? html : '<div class="tw-empty">No matches.</div>';
    }
    render('');
    return render;
  };

  // Sidebar: services grouped by parent line
  TW.renderServiceSidebar = function (mountId, opts) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    const lines = Tracewise.data.lines || [];
    const ix = Tracewise.indexes;
    const activeId = opts && opts.activeId;

    function render(q) {
      let html = '';
      let any = false;
      for (const ln of lines) {
        const svcs = (ix.servicesByLine.get(ln.id) || []).filter(s =>
          TW.matches(q, s.display_name_en, s.display_name_ja, ln.display_name_en, ln.display_name_ja)
        );
        if (svcs.length === 0) continue;
        any = true;
        html += `<div class="tw-op-group">
          <div class="tw-op-header">
            <span class="tw-op-bar" style="background:${ln.colour}"></span>
            <span>${TW.escapeHtml(ln.display_name_en)}</span>
          </div>
          <ul class="tw-line-list">`;
        for (const s of svcs) {
          const cls = s.id === activeId ? ' active' : '';
          html += `<a class="tw-line-row${cls}" href="service.html?id=${encodeURIComponent(s.id)}">
            <span class="tw-swatch" style="background:${ln.colour}"></span>
            <span class="tw-line-name-en">${TW.escapeHtml(s.display_name_en)}</span>
            ${TW.suppPill(s.supplement)}
          </a>`;
        }
        html += `</ul></div>`;
      }
      mount.innerHTML = any ? html : '<div class="tw-empty">No matches.</div>';
    }
    render('');
    return render;
  };

  // Sidebar: clusters alphabetical
  TW.renderClusterSidebar = function (mountId, opts) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    const ix = Tracewise.indexes;
    const activeId = opts && opts.activeId;
    const clusters = Array.from(ix.clusters.values())
      .sort((a, b) => a.display_name_en.localeCompare(b.display_name_en));

    function render(q) {
      let html = '';
      let any = false;
      for (const c of clusters) {
        if (!TW.matches(q, c.display_name_en, c.display_name_ja)) continue;
        any = true;
        const ops = Tracewise.operatorsForCluster(c.id);
        const swatches = ops.map(o => `<span class="tw-swatch" style="background:${o.colour}"></span>`).join('');
        const cls = c.id === activeId ? ' active' : '';
        html += `<a class="tw-line-row${cls}" href="station.html?id=${encodeURIComponent(c.id)}">
          <span class="tw-swatch-group">${swatches}</span>
          <span class="tw-line-name-en">${TW.escapeHtml(c.display_name_en)}</span>
          <span class="tw-line-name-ja">${TW.escapeHtml(c.display_name_ja || '')}</span>
        </a>`;
      }
      mount.innerHTML = any ? html : '<div class="tw-empty">No matches.</div>';
    }
    render('');
    return render;
  };

  // Map style URL loader (cached)
  let _styleUrl = null;
  TW.mapStyle = async function () {
    if (_styleUrl) return _styleUrl;
    try {
      const cfg = await fetch('assets/map-config.json').then(r => r.json());
      _styleUrl = (cfg && cfg.style) || 'https://tiles.openfreemap.org/styles/dark';
    } catch {
      _styleUrl = 'https://tiles.openfreemap.org/styles/dark';
    }
    return _styleUrl;
  };

  // Build a track GeoJSON FC from a list of track ids.
  TW.trackFC = function (trackIds) {
    const ix = Tracewise.indexes;
    const data = Tracewise.data;
    const features = [];
    for (const tid of trackIds) {
      const track = ix.tracksById.get(tid);
      if (!track) continue;
      let coords = (data.geometry || {})[tid];
      let approximate = false;
      if (!coords || coords.length < 2) {
        const stops = ix.stopsByTrack.get(tid) || [];
        coords = stops
          .map(s => ix.nodesById.get(s.station_node_id))
          .filter(Boolean)
          .map(n => [n.lon, n.lat]);
        approximate = true;
      }
      if (coords.length < 2) continue;
      features.push({
        type: 'Feature',
        properties: { track_id: tid, colour: track.colour, approximate },
        geometry: { type: 'LineString', coordinates: coords }
      });
    }
    return { type: 'FeatureCollection', features };
  };

  // Cluster FC for a given cluster-id list
  TW.clusterFC = function (clusterIds) {
    const ix = Tracewise.indexes;
    const features = [];
    for (const cid of clusterIds) {
      const c = ix.clusters.get(cid);
      if (!c) continue;
      const firstNode = ix.nodesById.get(c.member_node_ids[0]);
      const op = firstNode ? ix.operatorsById.get(firstNode.operator_id) : null;
      features.push({
        type: 'Feature',
        properties: { cluster_id: c.id, display_name_en: c.display_name_en, colour: op ? op.colour : '#888' },
        geometry: { type: 'Point', coordinates: [c.lon, c.lat] }
      });
    }
    return { type: 'FeatureCollection', features };
  };

  // Add common map layers: track casing + line + cluster dots + cluster labels
  TW.addCommonLayers = function (map, opts) {
    opts = opts || {};
    const minZoomLabels = opts.labelMinZoom || 13;
    map.addLayer({
      id: 'tw-tracks-casing', type: 'line', source: 'tw-tracks',
      paint: {
        'line-color': '#ffffff',
        'line-width': opts.casingWidth || 5,
        'line-opacity': 0.5
      }
    });
    map.addLayer({
      id: 'tw-tracks-line', type: 'line', source: 'tw-tracks',
      paint: {
        'line-color': ['get', 'colour'],
        'line-width': opts.lineWidth || 3,
        'line-dasharray': ['case', ['get', 'approximate'], ['literal', [2, 2]], ['literal', [1, 0]]]
      }
    });
    map.addLayer({
      id: 'tw-cluster-dots', type: 'circle', source: 'tw-clusters',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 15, 8],
        'circle-color': ['get', 'colour'],
        'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1
      }
    });
    map.addLayer({
      id: 'tw-cluster-labels', type: 'symbol', source: 'tw-clusters', minzoom: minZoomLabels,
      layout: {
        'text-field': ['get', 'display_name_en'],
        'text-size': 12, 'text-offset': [0.8, 0], 'text-anchor': 'left',
        'text-allow-overlap': false
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': '#0d1117', 'text-halo-width': 1.5 }
    });
    map.on('mouseenter', 'tw-cluster-dots', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'tw-cluster-dots', () => map.getCanvas().style.cursor = '');
  };

  TW.fitBoundsToFC = function (map, fc, padding) {
    const bounds = new maplibregl.LngLatBounds();
    let any = false;
    for (const f of fc.features) {
      if (f.geometry.type === 'Point') {
        bounds.extend(f.geometry.coordinates); any = true;
      } else if (f.geometry.type === 'LineString') {
        for (const c of f.geometry.coordinates) { bounds.extend(c); any = true; }
      }
    }
    if (any) map.fitBounds(bounds, {
      padding: padding || 40,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0
    });
  };

  // Wire a sidebar search input to a render(filter) function
  TW.wireSearch = function (inputId, renderFn) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.addEventListener('input', e => renderFn(e.target.value));
    el.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.target.value = ''; renderFn(''); }
    });
  };

  window.TW = TW;
})();
