/* Tracewise — data loader and computed indexes
   See spec §3. Exposes window.Tracewise.
   Usage:
     await Tracewise.load('osaka');
     await Tracewise.geometryReady;
*/
(function () {
  'use strict';

  const FREQ_BANDS = ['peak_am', 'midday', 'peak_pm', 'evening', 'weekend'];

  // ---------- helpers ----------

  function haversineMetres(lat1, lon1, lat2, lon2) {
    const R = 6371008.8;
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad)
            * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function makeUF(keys) {
    const parent = new Map();
    const rank = new Map();
    for (const k of keys) { parent.set(k, k); rank.set(k, 0); }
    function find(x) {
      let r = x;
      while (parent.get(r) !== r) r = parent.get(r);
      let c = x;
      while (parent.get(c) !== r) {
        const next = parent.get(c);
        parent.set(c, r);
        c = next;
      }
      return r;
    }
    function union(a, b) {
      const ra = find(a), rb = find(b);
      if (ra === rb) return;
      const sa = rank.get(ra), sb = rank.get(rb);
      if (sa < sb) parent.set(ra, rb);
      else if (sa > sb) parent.set(rb, ra);
      else { parent.set(rb, ra); rank.set(ra, sa + 1); }
    }
    return { find, union };
  }

  function indexBy(arr, key) {
    const m = new Map();
    if (!arr) return m;
    for (const item of arr) m.set(item[key], item);
    return m;
  }

  function groupBy(arr, keyFn) {
    const m = new Map();
    if (!arr) return m;
    for (const item of arr) {
      const k = keyFn(item);
      if (k == null) continue;
      let bucket = m.get(k);
      if (!bucket) { bucket = []; m.set(k, bucket); }
      bucket.push(item);
    }
    return m;
  }

  function emptyFreq() {
    const o = {};
    for (const b of FREQ_BANDS) o[b] = 0;
    return o;
  }

  async function fetchJson(url, fallback) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status + ' ' + url);
      return await r.json();
    } catch (e) {
      if (fallback === undefined) {
        console.error('[Tracewise] failed to load', url, e);
        throw e;
      }
      console.warn('[Tracewise] missing optional', url, '— using fallback');
      return fallback;
    }
  }

  // ---------- index builder ----------

  function buildIndexes(data) {
    const ix = {};

    ix.operatorsById = indexBy(data.operators, 'id');
    ix.tracksById    = indexBy(data.tracks, 'id');
    ix.linesById     = indexBy(data.lines, 'id');
    ix.nodesById     = indexBy(data.nodes, 'id');
    ix.stopsById     = indexBy(data.stops, 'id');
    ix.servicesById  = indexBy(data.services, 'id');
    ix.transfersById = indexBy(data.transfers, 'id');

    // stopsByTrack — sorted by sequence
    ix.stopsByTrack = groupBy(data.stops, s => s.track_id);
    for (const arr of ix.stopsByTrack.values()) {
      arr.sort((a, b) => a.sequence - b.sequence);
    }

    // stopsByNode
    ix.stopsByNode = groupBy(data.stops, s => s.station_node_id);

    // tracksByLine — preserve declared order
    ix.tracksByLine = new Map();
    for (const line of (data.lines || [])) {
      const arr = (line.tracks || []).map(tid => ix.tracksById.get(tid)).filter(Boolean);
      ix.tracksByLine.set(line.id, arr);
    }

    // linesByTrack — derived from tracksByLine
    ix.linesByTrack = new Map();
    for (const line of (data.lines || [])) {
      for (const tid of (line.tracks || [])) {
        let arr = ix.linesByTrack.get(tid);
        if (!arr) { arr = []; ix.linesByTrack.set(tid, arr); }
        arr.push(line);
      }
    }

    // servicesByLine — primary line + secondary lines
    ix.servicesByLine = new Map();
    for (const svc of (data.services || [])) {
      const lineIds = [svc.line_id, ...(svc.secondary_line_ids || [])];
      for (const lid of lineIds) {
        let arr = ix.servicesByLine.get(lid);
        if (!arr) { arr = []; ix.servicesByLine.set(lid, arr); }
        if (!arr.includes(svc)) arr.push(svc);
      }
    }

    // servicesByTrack — every track touched by line_path
    ix.servicesByTrack = new Map();
    for (const svc of (data.services || [])) {
      const seen = new Set();
      for (const seg of (svc.line_path || [])) {
        if (seg && seg.track_id && !seen.has(seg.track_id)) {
          seen.add(seg.track_id);
          let arr = ix.servicesByTrack.get(seg.track_id);
          if (!arr) { arr = []; ix.servicesByTrack.set(seg.track_id, arr); }
          arr.push(svc);
        }
      }
    }

    // servicesByStop — stops where the service actually halts (default + overrides)
    ix.servicesByStop = new Map();
    for (const svc of (data.services || [])) {
      const seen = new Set(svc.stop_pattern || []);
      const overrides = svc.stop_pattern_overrides || {};
      for (const band of Object.keys(overrides)) {
        for (const sid of (overrides[band] || [])) seen.add(sid);
      }
      for (const sid of seen) {
        let arr = ix.servicesByStop.get(sid);
        if (!arr) { arr = []; ix.servicesByStop.set(sid, arr); }
        arr.push(svc);
      }
    }

    // transfersByNode — both endpoints
    ix.transfersByNode = new Map();
    for (const t of (data.transfers || [])) {
      for (const nid of [t.a, t.b]) {
        let arr = ix.transfersByNode.get(nid);
        if (!arr) { arr = []; ix.transfersByNode.set(nid, arr); }
        arr.push(t);
      }
    }

    // ---- clusters (§3.1) ----
    const nodes = data.nodes || [];
    const uf = makeUF(nodes.map(n => n.id));

    // step 2 (pre-pass): clusters.json claims its members
    const definedClusters = data.clusters || [];
    for (const c of definedClusters) {
      const members = c.member_node_ids || [];
      for (let i = 1; i < members.length; i++) uf.union(members[0], members[i]);
    }

    // step 3: transfers that imply same physical interchange
    const UNIONING_CATEGORIES = new Set([
      'same_name_connected',
      'different_name_connected',
      'through_run_boundary'
    ]);
    for (const t of (data.transfers || [])) {
      if (UNIONING_CATEGORIES.has(t.category)) uf.union(t.a, t.b);
    }

    // step 4: distance-based pairs (O(n²); fine for ~600 nodes)
    const threshold = (data.config && data.config.cluster_threshold_m) || 200;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const d = haversineMetres(a.lat, a.lon, b.lat, b.lon);
        if (d <= threshold) uf.union(a.id, b.id);
      }
    }

    // collect sets
    const setMembers = new Map(); // root → node[]
    for (const n of nodes) {
      const r = uf.find(n.id);
      let arr = setMembers.get(r);
      if (!arr) { arr = []; setMembers.set(r, arr); }
      arr.push(n);
    }

    // step 5: match each set to clusters.json by exact or strict subset
    const definedById = indexBy(definedClusters, 'id');
    function matchDefined(setIds) {
      const setSet = new Set(setIds);
      for (const c of definedClusters) {
        const members = c.member_node_ids || [];
        if (members.length === 0) continue;
        const allIn = members.every(id => setSet.has(id));
        if (!allIn) continue;
        if (members.length === setIds.length) return c; // exact
        // strict subset: defined cluster's members are all inside the set
        return c;
      }
      return null;
    }

    ix.clusters = new Map();
    ix.clusterByNode = new Map();

    for (const [root, members] of setMembers.entries()) {
      const memberIds = members.map(n => n.id);
      const matched = matchDefined(memberIds);
      let id, display_en, display_ja, lat, lon;

      if (matched) {
        id = matched.id;
        display_en = matched.display_name_en;
        display_ja = matched.display_name_ja;
        let primary = null;
        if (matched.primary_node_id) primary = ix.nodesById.get(matched.primary_node_id);
        if (primary) { lat = primary.lat; lon = primary.lon; }
        else {
          lat = members.reduce((s, n) => s + n.lat, 0) / members.length;
          lon = members.reduce((s, n) => s + n.lon, 0) / members.length;
        }
      } else {
        // default name = unique name_en joined alphabetical " / "
        const uniqEn = Array.from(new Set(members.map(n => n.name_en))).sort((a, b) => a.localeCompare(b));
        const uniqJa = Array.from(new Set(members.map(n => n.name_ja))).sort((a, b) => a.localeCompare(b));
        display_en = uniqEn.join(' / ');
        display_ja = uniqJa.join(' / ');
        // synthetic id = sorted member ids joined; stable across runs
        id = 'auto-' + memberIds.slice().sort().join('+');
        lat = members.reduce((s, n) => s + n.lat, 0) / members.length;
        lon = members.reduce((s, n) => s + n.lon, 0) / members.length;
      }

      const cluster = {
        id,
        member_node_ids: memberIds,
        display_name_en: display_en,
        display_name_ja: display_ja,
        lat,
        lon
      };
      ix.clusters.set(id, cluster);
      for (const nid of memberIds) ix.clusterByNode.set(nid, id);
    }

    // linesByCluster — lines whose tracks have any stop at a member node
    ix.linesByCluster = new Map();
    for (const [cid, cluster] of ix.clusters.entries()) {
      const lineSet = new Set();
      for (const nid of cluster.member_node_ids) {
        const stopsHere = ix.stopsByNode.get(nid) || [];
        for (const stop of stopsHere) {
          const lines = ix.linesByTrack.get(stop.track_id) || [];
          for (const ln of lines) lineSet.add(ln);
        }
      }
      ix.linesByCluster.set(cid, Array.from(lineSet));
    }

    // servicesByCluster — services whose stop_pattern (or any band override) touches a member-node stop
    ix.servicesByCluster = new Map();
    for (const [cid, cluster] of ix.clusters.entries()) {
      const svcSet = new Set();
      const memberSet = new Set(cluster.member_node_ids);
      for (const nid of cluster.member_node_ids) {
        const stopsHere = ix.stopsByNode.get(nid) || [];
        for (const stop of stopsHere) {
          const svcs = ix.servicesByStop.get(stop.id) || [];
          for (const s of svcs) svcSet.add(s);
        }
        // also services whose line_path crosses this node even without stopping
        // (kept aligned with §3 wording: "touching any node in cluster")
        void memberSet;
      }
      ix.servicesByCluster.set(cid, Array.from(svcSet));
    }

    // ---- frequency aggregation (§3.2) ----
    ix.frequencyByStop = new Map();
    for (const stop of (data.stops || [])) ix.frequencyByStop.set(stop.id, emptyFreq());

    for (const svc of (data.services || [])) {
      const fb = svc.frequency_bands || {};
      const overrides = svc.stop_pattern_overrides || {};
      const defaultPattern = svc.stop_pattern || [];
      for (const band of FREQ_BANDS) {
        const tph = Number(fb[band]) || 0;
        if (tph === 0) continue;
        const pattern = overrides[band] || defaultPattern;
        for (const sid of pattern) {
          const f = ix.frequencyByStop.get(sid);
          if (f) f[band] += tph;
          else ix.frequencyByStop.set(sid, { ...emptyFreq(), [band]: tph });
        }
      }
    }

    ix.frequencyByCluster = new Map();
    for (const [cid, cluster] of ix.clusters.entries()) {
      const total = emptyFreq();
      for (const nid of cluster.member_node_ids) {
        const stopsHere = ix.stopsByNode.get(nid) || [];
        for (const stop of stopsHere) {
          const f = ix.frequencyByStop.get(stop.id);
          if (!f) continue;
          for (const band of FREQ_BANDS) total[band] += f[band];
        }
      }
      ix.frequencyByCluster.set(cid, total);
    }

    return ix;
  }

  // ---------- public API ----------

  const Tracewise = {
    FREQ_BANDS,
    cityId: null,
    data: null,
    indexes: null,
    geometryReady: null,

    async load(cityId) {
      // Resolve default city if none specified
      if (!cityId) {
        const cities = await fetchJson('data/cities.json', []);
        const def = cities.find(c => c.default) || cities[0];
        if (!def) throw new Error('No cities defined');
        cityId = def.id;
        this._cities = cities;
      }
      this.cityId = cityId;

      const base = `data/${cityId}`;
      const [
        cities, config, operators, tracks, lines, nodes, stops, transfers, services, clusters, fareZones
      ] = await Promise.all([
        this._cities ? Promise.resolve(this._cities) : fetchJson('data/cities.json', []),
        fetchJson(`${base}/config.json`, { cluster_threshold_m: 200, default_centre: [135.5, 34.7], default_zoom: 11 }),
        fetchJson(`${base}/operators.json`, []),
        fetchJson(`${base}/tracks.json`, []),
        fetchJson(`${base}/lines.json`, []),
        fetchJson(`${base}/station_nodes.json`, []),
        fetchJson(`${base}/stops.json`, []),
        fetchJson(`${base}/transfers.json`, []),
        fetchJson(`${base}/services.json`, []),
        fetchJson(`${base}/clusters.json`, []),
        fetchJson(`${base}/fare_zones.json`, [])
      ]);

      this.data = {
        cities, config, operators, tracks, lines, nodes, stops,
        transfers, services, clusters, fareZones,
        geometry: {} // populated when geometryReady resolves
      };
      this.indexes = buildIndexes(this.data);

      // §11.1: lazy geometry — pages render straight-line fallback until this resolves
      this.geometryReady = fetchJson(`${base}/line_geometry.json`, {})
        .then(g => { this.data.geometry = g || {}; return this.data.geometry; });

      return this;
    },

    // Convenience: line-page header counts, etc.
    cityById(id) {
      return (this.data && this.data.cities || []).find(c => c.id === id) || null;
    },
    operatorsForCluster(clusterId) {
      const cluster = this.indexes.clusters.get(clusterId);
      if (!cluster) return [];
      const opIds = new Set();
      for (const nid of cluster.member_node_ids) {
        const node = this.indexes.nodesById.get(nid);
        if (node) opIds.add(node.operator_id);
      }
      return Array.from(opIds).map(id => this.indexes.operatorsById.get(id)).filter(Boolean);
    }
  };

  window.Tracewise = Tracewise;
})();
