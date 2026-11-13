/* RepCount Companion — UI */
(function () {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtShort = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const fmtNum = (v, d = 0) => v == null ? '–' : (+v).toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const ago = t => { const w = Math.round((Date.now() - t) / (7 * RC.DAY)); return w < 1 ? 'this week' : w === 1 ? '1 week ago' : w < 9 ? `${w} weeks ago` : `${Math.round(w / 4.35)} months ago`; };

// ---------- Storage (IndexedDB, falls back to memory) ----------
const mem = {};
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const r = indexedDB.open('repcount-companion', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch (e) { res(null); }
  });
  return dbp;
}
async function kvGet(k) {
  const d = await db(); if (!d) return mem[k];
  return new Promise(res => { try { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(mem[k]); } catch (e) { res(mem[k]); } });
}
async function kvSet(k, v) {
  mem[k] = v; const d = await db(); if (!d) return;
  return new Promise(res => { try { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; } catch (e) { res(); } });
}

// ---------- State ----------
const S = {
  text: null, sets: [], wos: [], ex: [], userMap: {}, importedAt: null, fileName: null,
  settings: { unit: 'kg', doneMonths: 8, notSince: 2, period: 12, metric: 'sets', hideSimilar: false, exSort: 'last', exQuery: '', show6: false, bestBy: 'e1rm', mapQuery: '' },
  selEx: null, selMuscle: null, editing: null, anomalies: null,
};
function recompute() {
  S.wos = RC.workouts(S.sets);
  S.ex = RC.exerciseStats(S.sets, S.userMap);
}
const unmapped = () => S.ex.filter(e => e.res.source === 'unmapped');
const saveSettings = () => kvSet('settings', S.settings);
const saveMap = () => kvSet('userMap', S.userMap);

function setData(text, fileName) {
  const { sets, skipped } = RC.loadExport(text);
  if (!sets.length) throw new Error('No sets found in this file.');
  S.text = text; S.sets = sets; S.fileName = fileName || 'export.csv'; S.importedAt = Date.now(); S.anomalies = null;
  recompute();
  kvSet('data', { text, fileName: S.fileName, importedAt: S.importedAt });
  return { sets: sets.length, skipped, workouts: S.wos.length };
}

// ---------- Tooltip ----------
const tip = document.createElement('div'); tip.id = 'tip'; document.body.appendChild(tip);
function showTip(html, x, y) {
  tip.innerHTML = html; tip.style.display = 'block';
  const r = tip.getBoundingClientRect();
  let left = x + 14, top = y + 14;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > innerHeight - 8) top = y - r.height - 14;
  left = Math.max(8, Math.min(left, innerWidth - r.width - 8)); top = Math.max(8, top);
  tip.style.left = left + 'px'; tip.style.top = top + 'px';
}
const hideTip = () => (tip.style.display = 'none');
document.addEventListener('mousemove', e => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (t) showTip(t.getAttribute('data-tip'), e.clientX, e.clientY);
  else if (!e.target.closest || !e.target.closest('.xhair')) hideTip();
});
document.addEventListener('scroll', hideTip, true);
// Touch: press and hold an element with a tooltip to show it (no hover on phones).
let lpTimer = null, lpStart = null, lpFired = false, lpEatClick = false, lpHide = null;
document.addEventListener('touchstart', e => {
  clearTimeout(lpTimer); lpFired = false; lpEatClick = false; hideTip();
  const t = e.target.closest && e.target.closest('[data-tip]'); if (!t || e.touches.length !== 1) return;
  const p = e.touches[0]; lpStart = { x: p.clientX, y: p.clientY };
  lpTimer = setTimeout(() => {
    lpFired = true; showTip(t.getAttribute('data-tip'), lpStart.x, lpStart.y - 60);
    clearTimeout(lpHide); lpHide = setTimeout(hideTip, 4000);
  }, 450);
}, { passive: true });
document.addEventListener('touchmove', e => {
  if (!lpStart) return; const p = e.touches[0];
  if (Math.abs(p.clientX - lpStart.x) > 10 || Math.abs(p.clientY - lpStart.y) > 10) clearTimeout(lpTimer);
}, { passive: true });
document.addEventListener('touchend', e => { clearTimeout(lpTimer); if (lpFired) { e.preventDefault(); lpEatClick = true; } }, { passive: false });
// A long press must not also count as a tap on the element.
document.addEventListener('click', e => { if (lpEatClick) { lpEatClick = false; e.preventDefault(); e.stopPropagation(); } }, true);

function toast(msg) {
  document.querySelectorAll('.toast').forEach(x => x.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}

// ---------- Charts (plain SVG) ----------
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

// Vertical bars, single series. items: [{label, value, tip}]
function barChart(items, { height = 200, every = 1 } = {}) {
  const W = 1000, H = height, L = 34, B = 22, T = 8;
  const max = niceMax(Math.max(1, ...items.map(i => i.value)));
  const bw = (W - L) / items.length, gap = Math.min(2, bw * 0.2);
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const y = T + (H - T - B) * (1 - k / 4);
    g += `<line class="grid" x1="${L}" x2="${W}" y1="${y}" y2="${y}"/><text x="${L - 6}" y="${y + 4}" text-anchor="end">${fmtNum(max * k / 4)}</text>`;
  }
  items.forEach((it, i) => {
    const h = (H - T - B) * it.value / max, x = L + i * bw + gap / 2, y = H - B - h, w = Math.max(1, bw - gap);
    const r = Math.min(4, w / 2, h);
    if (h > 0) g += `<path d="M${x},${H - B}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${H - B}Z" fill="var(--accent)"/>`;
    g += `<rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent" data-tip="${esc(it.tip)}"/>`;
    if (i % every === 0) g += `<text x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${esc(it.label)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="none" style="height:${H}px;overflow:visible">${g}</svg>`;
}

// Line chart, up to 2 series sharing a unit. xs: timestamps; series: [{name, color, values}]
let lineSeq = 0;
function lineChart(xs, series, { height = 220, unit = '' } = {}) {
  const id = 'lc' + (++lineSeq);
  const W = 1000, H = height, L = 40, R = 10, B = 22, T = 10;
  const all = series.flatMap(s => s.values).filter(v => v != null);
  if (!all.length) return '<p class="muted small">No weighted sets to chart.</p>';
  let lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.1 || hi * 0.1 || 1; lo = Math.max(0, lo - pad); hi = hi + pad;
  const x0 = xs[0], x1 = xs[xs.length - 1] === x0 ? x0 + RC.DAY : xs[xs.length - 1];
  const X = t => L + (W - L - R) * (t - x0) / (x1 - x0), Y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  let g = '';
  for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4, y = Y(v); g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text x="${L - 6}" y="${y + 4}" text-anchor="end">${fmtNum(v)}</text>`; }
  const span = x1 - x0, nT = 5;
  for (let k = 0; k <= nT; k++) { const t = x0 + span * k / nT; g += `<text x="${X(t)}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === nT ? 'end' : 'middle'}">${new Date(t).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}</text>`; }
  for (const s of series) {
    let d = '', pen = false;
    s.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(xs[i]).toFixed(1) + ',' + Y(v).toFixed(1); pen = true; });
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
    if (xs.length <= 40) s.values.forEach((v, i) => { if (v != null) g += `<circle cx="${X(xs[i])}" cy="${Y(v)}" r="3" fill="${s.color}" stroke="var(--surface)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`; });
  }
  g += `<line id="${id}-x" class="axis" y1="${T}" y2="${H - B}" style="display:none"/>`;
  g += `<rect class="xhair" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" data-lc="${id}"/>`;
  lineData[id] = { xs, series, X, W, unit };
  const leg = series.length > 1 ? `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `${leg}<svg id="${id}" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="none" style="height:${H}px;overflow:visible">${g}</svg>`;
}
const lineData = {};
document.addEventListener('mousemove', e => {
  const r = e.target.closest && e.target.closest('[data-lc]'); if (!r) { document.querySelectorAll('line[id$="-x"]').forEach(l => (l.style.display = 'none')); return; }
  const id = r.getAttribute('data-lc'), D = lineData[id]; if (!D) return;
  const svg = document.getElementById(id), box = svg.getBoundingClientRect();
  const vx = (e.clientX - box.left) / box.width * D.W;
  let best = 0, bd = Infinity; D.xs.forEach((t, i) => { const dd = Math.abs(D.X(t) - vx); if (dd < bd) { bd = dd; best = i; } });
  const ln = document.getElementById(id + '-x'); ln.setAttribute('x1', D.X(D.xs[best])); ln.setAttribute('x2', D.X(D.xs[best])); ln.style.display = '';
  showTip(`<b>${fmtDate(D.xs[best])}</b><br>` + D.series.map(s => `${esc(s.name)}: ${s.values[best] == null ? '–' : fmtNum(s.values[best], 1) + ' ' + D.unit}`).join('<br>') + (D.extra ? D.extra(best) : ''), e.clientX, e.clientY);
});

// Heatmap rows=muscles, cols=weeks
function heatmap(rows, cols, val, { cell = 22 } = {}) {
  const LW = 104, TH = 18, W = LW + cols.length * cell, H = TH + rows.length * cell;
  const max = Math.max(1, ...rows.flatMap(r => cols.map(c => val(r.id, c))));
  const step = v => v <= 0 ? 0 : Math.min(7, 1 + Math.floor(6 * v / max));
  let g = '';
  cols.forEach((c, j) => { if (j % 2 === 0) g += `<text x="${LW + j * cell + cell / 2}" y="12" text-anchor="middle">${new Date(c).toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric' })}</text>`; });
  rows.forEach((r, i) => {
    g += `<text x="${LW - 8}" y="${TH + i * cell + cell / 2 + 4}" text-anchor="end">${esc(r.label)}</text>`;
    cols.forEach((c, j) => {
      const v = val(r.id, c);
      g += `<rect x="${LW + j * cell + 1}" y="${TH + i * cell + 1}" width="${cell - 2}" height="${cell - 2}" rx="3" fill="var(--h${step(v)})" data-tip="<b>${esc(r.label)}</b><br>Week of ${fmtShort(c)}: ${fmtNum(v, 1)} sets"/>`;
    });
  });
  return `<div class="tablewrap"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}</svg></div>
  <div class="legend" style="margin-top:6px">Fewer <span>${[0, 1, 2, 3, 4, 5, 6, 7].map(k => `<i class="sq" style="background:var(--h${k});margin:0 1px"></i>`).join('')}</span> More (max ${fmtNum(max, 1)} sets/week)</div>`;
}

// ---------- Helpers ----------
const muscleChips = res => {
  if (res.cardio) return '<span class="chip">Cardio</span>';
  if (!res.p.length) return '<span class="badge unmapped">not mapped</span>';
  return res.p.map(m => `<span class="chip p">${RC.MUSCLE_LABEL[m]}</span>`).join('') + res.s.map(m => `<span class="chip">${RC.MUSCLE_LABEL[m]}</span>`).join('');
};
const setStr = s => (s.w != null && s.w > 0 ? `${fmtNum(s.w, 1)}×${fmtNum(s.r)}` : s.r != null ? `${fmtNum(s.r)} reps` : (s.dur ? `${Math.round(s.dur / 60)} min` : '–'));
const sessionStr = ss => ss.sets.map(s => setStr(s) + (s.effort ? ` <span class="muted">(${RC.EFFORT_LABEL[s.effort]})</span>` : '') + (s.levelUp ? ' ⬆' : '')).join(' · ');
const movementName = id => id === 'custom' ? 'Custom' : (RC.MOVEMENTS[id] ? RC.MOVEMENTS[id].name : '–');

// ---------- Views ----------
const VIEWS = { overview, muscles, exercises, reminders, mapping, data };
const TABS = [['overview', 'Overview'], ['muscles', 'Muscles'], ['exercises', 'Exercises'], ['reminders', 'Reminders'], ['mapping', 'Mapping'], ['data', 'Data']];

function render() {
  let v = (location.hash || '').slice(1);
  if (!VIEWS[v]) v = S.sets.length ? 'overview' : 'data';
  if (!S.sets.length && v !== 'data' && v !== 'mapping') v = 'data';
  const n = unmapped().length;
  $('nav').innerHTML = TABS.map(([k, l]) => `<a href="#${k}" class="${k === v ? 'on' : ''}">${l}${k === 'mapping' && n ? `<span class="count">${n}</span>` : ''}</a>`).join('');
  $('.brand span').textContent = S.sets.length ? `${fmtNum(S.wos.length)} workouts · ${fmtDate(S.sets[0].start)} – ${fmtDate(S.sets[S.sets.length - 1].start)}` : 'No data loaded yet';
  hideTip();
  $('main').innerHTML = VIEWS[v]();
  (BIND[v] || (() => {}))();
}
window.addEventListener('hashchange', () => { render(); scrollTo(0, 0); });

function unmappedBanner() {
  const u = unmapped(); if (!u.length) return '';
  const sets = u.reduce((a, e) => a + e.sets, 0);
  return `<div class="banner">${u.length} exercise${u.length > 1 ? 's are' : ' is'} not mapped to muscles yet (${sets} sets left out of muscle stats). <a href="#mapping">Review them</a></div>`;
}

function overview() {
  const now = Date.now(), wos = S.wos;
  const last12 = wos.filter(w => w.start >= now - 84 * RC.DAY).length;
  const durs = wos.map(w => (w.end - w.start) / 60000).filter(d => d > 10 && d < 300).sort((a, b) => a - b);
  const med = durs.length ? durs[Math.floor(durs.length / 2)] : null;
  const months = new Map();
  const first = new Date(S.sets[0].start); const cur = new Date(first.getFullYear(), first.getMonth(), 1); const end = new Date();
  while (cur <= end) { months.set(cur.getTime(), 0); cur.setMonth(cur.getMonth() + 1); }
  for (const w of wos) { const d = new Date(w.start); const k = new Date(d.getFullYear(), d.getMonth(), 1).getTime(); months.set(k, (months.get(k) || 0) + 1); }
  const items = [...months].map(([k, v]) => { const d = new Date(k); return { label: d.getMonth() === 0 ? String(d.getFullYear()) : '', value: v, tip: `<b>${d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</b><br>${v} workouts` }; });
  const recent = wos.slice(-6).reverse();
  return `${unmappedBanner()}
  <div class="tiles">
    <div class="tile"><div class="v">${fmtNum(wos.length)}</div><div class="l">Workouts</div></div>
    <div class="tile"><div class="v">${fmtNum(S.sets.length)}</div><div class="l">Sets logged</div></div>
    <div class="tile"><div class="v">${fmtNum(last12 / 12, 1)}</div><div class="l">Workouts / week (last 12 wk)</div></div>
    <div class="tile"><div class="v">${med ? Math.round(med) + ' min' : '–'}</div><div class="l">Typical workout length</div></div>
    <div class="tile"><div class="v">${fmtNum(S.ex.length)}</div><div class="l">Distinct exercises</div></div>
  </div>
  <div class="card"><h3>Workouts per month</h3>${barChart(items, { height: 190 })}</div>
  <div class="card"><h3>Recent workouts</h3><div class="list">${recent.map(w => `<div><div class="row"><b>${fmtDate(w.start)}</b><span class="muted small">${Math.round((w.end - w.start) / 60000)} min · ${w.sets.length} sets</span></div><div class="t2 small">${[...w.exercises].map(esc).join(' · ')}</div></div>`).join('')}</div></div>`;
}

function periodRange() {
  const now = Date.now(), end = RC.weekStart(now) + 7 * RC.DAY;
  const p = S.settings.period;
  const from = p === 'all' ? RC.weekStart(S.sets[0].start) : end - p * 7 * RC.DAY;
  return { from, end, weeks: Math.round((end - from) / (7 * RC.DAY)) };
}
function muscles() {
  const { from, end, weeks: nW } = periodRange(), metric = S.settings.metric;
  const { weeks } = RC.muscleWeekly(S.sets, S.userMap, from, end, metric);
  const tot = {}; for (const r of weeks.values()) for (const m in r) tot[m] = (tot[m] || 0) + r[m];
  const avg = m => (tot[m] || 0) / nW;
  const groupIds = RC.MUSCLE_GROUPS.map(([g]) => 'g:' + g);
  const max = niceMax(Math.max(0.1, ...RC.MUSCLES.map(avg), ...groupIds.map(avg)));
  const P = [[4, '4 wk'], [12, '12 wk'], [26, '6 mo'], [52, '1 yr'], ['all', 'All']];
  const collapsed = new Set(S.settings.collapsed || []);
  // "Lagging": more than 1 set/week below the reference (categories: mean of categories; muscles: mean of the muscles in their category)
  const gMean = groupIds.reduce((a, k) => a + avg(k), 0) / groupIds.length;
  const lagNote = (v, ref, what) => `<br><span style='color:var(--warn-tip)'>▼ ${fmtNum(ref - v, 1)} below the average of ${what} (${fmtNum(ref, 1)})</span>`;
  const unitLbl = metric === 'hard' ? 'hard sets' : 'sets';
  const bar = (v, cls = '') => `<span class="track">${v > 0 ? `<span class="fill ${cls}" style="width:${(100 * v / max).toFixed(1)}%"></span>` : ''}</span><span class="val">${fmtNum(v, 1)}</span>`;
  let bars = '';
  for (const [g, list] of RC.MUSCLE_GROUPS) {
    const gv = avg('g:' + g), open = !collapsed.has(g), gLag = gv < gMean - 1;
    const mMean = list.reduce((a, [id]) => a + avg(id), 0) / list.length;
    const childLag = list.length > 1 && list.some(([id]) => avg(id) < mMean - 1);
    bars += `<div class="hbar grp ${gLag ? 'lag' : ''}" data-group="${g}" data-tip="<b>${g}</b><br>${fmtNum(gv, 1)} ${unitLbl} / week<br>Each set counted once for ${g.toLowerCase()}${gLag ? lagNote(gv, gMean, 'categories') : ''}${!open && childLag ? '<br>Some muscles inside are lagging' : ''}"><span class="lab"><span class="chev">${open ? '▾' : '▸'}</span>${g}${gLag ? '<span class="lagmark">▼</span>' : ''}${!open && childLag ? '<span class="lagdot" title="A muscle inside is lagging"></span>' : ''}</span>${bar(gv, 'g')}</div>`;
    if (!open) continue;
    bars += '<div class="tree">';
    for (const [id, label] of list) {
      const v = avg(id), lag = list.length > 1 && v < mMean - 1;
      bars += `<div class="hbar click leaf ${lag ? 'lag' : ''} ${S.selMuscle === id ? 'sel' : ''}" data-muscle="${id}" data-tip="<b>${label}</b><br>${fmtNum(v, 1)} ${unitLbl} / week<br>${fmtNum(tot[id] || 0, 1)} over ${nW} weeks${lag ? lagNote(v, mMean, g.toLowerCase() + ' muscles') : ''}"><span class="lab">${label}${lag ? '<span class="lagmark">▼</span>' : ''}</span>${bar(v)}</div>`;
    }
    bars += '</div>';
  }
  const hmW = 16, hEnd = RC.weekStart(Date.now());
  const cols = Array.from({ length: hmW }, (_, i) => RC.weekStart(hEnd + 2 * RC.DAY - (hmW - 1 - i) * 7 * RC.DAY));
  const hm = RC.muscleWeekly(S.sets, S.userMap, cols[0], hEnd + 7 * RC.DAY, metric).weeks;
  const rows = RC.MUSCLES.map(id => ({ id, label: RC.MUSCLE_LABEL[id] }));
  return `${unmappedBanner()}
  <h2>Muscle volume</h2>
  <p class="sub">Sets per muscle, counting 1 for a primary muscle and ½ for a secondary one. “Hard sets” are sets whose note says Échec, Limite or Très lourd. Click a muscle to see which exercises train it.</p>
  <div class="controls">
    <span class="seg" id="period">${P.map(([k, l]) => `<button data-v="${k}" class="${String(S.settings.period) === String(k) ? 'on' : ''}">${l}</button>`).join('')}</span>
    <span class="seg" id="metric"><button data-v="sets" class="${metric === 'sets' ? 'on' : ''}">All sets</button><button data-v="hard" class="${metric === 'hard' ? 'on' : ''}">Hard sets</button></span>
  </div>
  <div class="grid2">
    <div class="card"><div class="row" style="margin-bottom:6px"><h3 style="margin:0">Average ${metric === 'hard' ? 'hard ' : ''}sets per week</h3><span class="small"><a href="#muscles" id="expAll">Expand all</a> · <a href="#muscles" id="colAll">Collapse all</a></span></div>${bars}<p class="muted small" style="margin:10px 0 0"><span class="lagmark" style="margin:0 4px 0 0">▼</span>More than 1 set/week below average: a category vs all categories, a muscle vs the other muscles of its category.</p></div>
    <div class="card"><h3>Last ${hmW} weeks</h3>${heatmap(rows, cols, (m, c) => (hm.get(c) || {})[m] || 0)}</div>
  </div>
  ${S.selMuscle ? muscleDetail(S.selMuscle, from, end, nW) : ''}`;
}

function muscleDetail(m, from, end, nW) {
  const label = RC.MUSCLE_LABEL[m];
  const mine = S.ex.filter(e => !e.res.cardio && (e.res.p.includes(m) || e.res.s.includes(m)))
    .map(e => ({ e, primary: e.res.p.includes(m), inPeriod: e.sessionList.filter(s => s.t >= from && s.t < end).length }))
    .sort((a, b) => (b.primary - a.primary) || (b.e.last - a.e.last));
  const movDone = {}; for (const e of S.ex) if (e.res.movement) { const x = movDone[e.res.movement]; if (!x || e.last > x.last) movDone[e.res.movement] = e; }
  const tips = RC.MUSCLE_TIPS[m] || [];
  const shown = mine.slice(0, 10);
  return `<div class="card" id="mdetail"><div class="row"><h3 style="margin:0">${label}</h3><button id="closeM">Close</button></div>
  <div class="grid2" style="margin-top:12px">
  <div><h3 class="small t2">From your history</h3>
  ${shown.length ? `<div class="list small">${shown.map(x => `<div><div class="row"><span><a href="#exercises" data-goto="${esc(x.e.key)}"><b>${esc(x.e.name)}</b></a> <span class="chip ${x.primary ? 'p' : ''}">${x.primary ? 'primary' : 'secondary'}</span></span><span class="t2">last ${fmtDate(x.e.last)}</span></div>
    <div class="muted">${x.inPeriod ? `${x.inPeriod} session${x.inPeriod === 1 ? '' : 's'} in this period` : 'not done in this period'} · ${x.e.sessionList.length} in total</div></div>`).join('')}</div>
    ${mine.length > shown.length ? `<p class="muted small">+ ${mine.length - shown.length} more</p>` : ''}` : `<p class="muted small">You have never logged an exercise mapped to ${label.toLowerCase()}.</p>`}
  </div>
  <div><h3 class="small t2">Ideas</h3><div class="list small">${tips.map(([n, how, mv]) => { const d = movDone[mv];
    return `<div><b>${esc(n)}</b><div class="t2">${esc(how)}</div>${d ? `<div class="muted">Similar in your log: ${esc(d.name)} (last ${fmtDate(d.last)})</div>` : ''}</div>`; }).join('')}</div></div>
  </div></div>`;
}

// Best set among an exercise's sets since t. Mode 'e1rm': highest estimated 1RM among sets of <= 15 reps,
// falling back to heaviest weight when there are none; mode 'weight': heaviest weight, then most reps.
function bestSince(e, t = -Infinity) {
  const heavier = (x, b) => !b || x.w > b.w || (x.w === b.w && x.r > b.r);
  let bw = null, be = null, beV = -1;
  for (const ss of e.sessionList) if (ss.t >= t) for (const x of ss.sets) {
    if (x.w == null || x.w <= 0) continue;
    if (heavier(x, bw)) bw = x;
    const v = RC.e1rm(x.w, x.r);
    if (v != null && (v > beV || (v === beV && x.w > be.w))) { be = x; beV = v; }
  }
  return S.settings.bestBy === 'weight' ? bw : (be || bw);
}
const bestCell = b => b ? `${setStr(b)}<div class="muted small" style="white-space:nowrap">${fmtDate(b.start)}</div>` : '–';

function exercises() {
  const q = RC.normName(S.settings.exQuery);
  let list = S.ex.filter(e => !q || RC.normName(e.name).includes(q) || (e.res.movement && RC.normName(movementName(e.res.movement)).includes(q)));
  const sorters = { last: (a, b) => b.last - a.last, name: (a, b) => a.name.localeCompare(b.name), sessions: (a, b) => b.sessionList.length - a.sessionList.length, e1rm: (a, b) => (b.bestE1rm || 0) - (a.bestE1rm || 0) };
  list.sort(sorters[S.settings.exSort] || sorters.last);
  const sel = S.selEx && S.ex.find(e => e.key === S.selEx);
  const since6 = RC.addMonths(Date.now(), -6);
  const th = (k, l, cls = '') => `<th class="sort ${cls} ${S.settings.exSort === k ? 'on' : ''}" data-sort="${k}">${l}${S.settings.exSort === k ? ' ↓' : ''}</th>`;
  return `<h2>Exercises</h2><p class="sub">Each name as you logged it in RepCount. Click one to see its progress.</p>
  ${sel ? exerciseDetail(sel) : ''}
  <div class="controls"><input type="search" id="exq" placeholder="Search exercise or movement…" value="${esc(S.settings.exQuery)}"><label><input type="checkbox" id="show6" ${S.settings.show6 ? 'checked' : ''}> Show best over the past 6 months</label><span class="muted small">${list.length} exercises</span></div>
  <div class="card tablewrap"><table><thead><tr>${th('name', 'Exercise')}<th>Muscles</th>${th('sessions', 'Sessions', 'n')}${th('last', 'Last done')}<th class="n">Best set</th>${S.settings.show6 ? '<th class="n">Best (6 months)</th>' : ''}${th('e1rm', 'Est. 1RM', 'n')}</tr></thead><tbody>
  ${list.map(e => `<tr class="click ${sel === e ? 'sel' : ''}" data-ex="${esc(e.key)}"><td><b>${esc(e.name)}</b><div class="muted small">${esc(e.cat)}</div></td><td>${muscleChips(e.res)}</td><td class="n">${e.sessionList.length}</td><td class="small">${fmtDate(e.last)}<div class="muted">${ago(e.last)}</div></td><td class="n">${bestCell(bestSince(e))}</td>${S.settings.show6 ? `<td class="n">${bestCell(bestSince(e, since6))}</td>` : ''}<td class="n">${e.bestE1rm ? fmtNum(e.bestE1rm, 1) : '–'}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function exerciseDetail(e) {
  const ss = e.sessionList, xs = ss.map(s => s.t), u = S.settings.unit;
  const chart = lineChart(xs, [
    { name: 'Heaviest set', color: 'var(--accent)', values: ss.map(s => s.top && s.top.w > 0 ? s.top.w : null) },
    { name: 'Estimated 1RM', color: 'var(--series-2)', values: ss.map(s => s.e1rm) },
  ], { unit: u });
  const id = Object.keys(lineData).pop(); if (lineData[id]) lineData[id].extra = i => `<br><span style="opacity:.8">${ss[i].sets.map(setStr).join(' · ')}</span>`;
  const recent = ss.slice(-8).reverse();
  return `<div class="card"><div class="row"><h3 style="margin:0">${esc(e.name)}</h3><button id="closeEx">Close</button></div>
  <p class="small t2" style="margin:4px 0 12px">${movementName(e.res.movement)} · ${muscleChips(e.res)}<br>${ss.length} sessions · ${e.sets} sets · ${e.hard} hard sets · ${e.levelUps} level-ups · first done ${fmtDate(e.first)}</p>
  ${chart}
  <p class="muted small">Estimated 1RM uses the Epley formula on sets of 15 reps or fewer (less precise above ~10 reps, fine for trends). Machine weights only compare within the same machine.</p>
  <h3 style="margin-top:14px">Recent sessions</h3><div class="list small">${recent.map(s => `<div><b>${fmtDate(s.t)}</b> — ${sessionStr(s)}</div>`).join('')}</div></div>`;
}

function reminders() {
  const { doneMonths, notSince, hideSimilar } = S.settings, now = Date.now();
  let list = RC.forgotten(S.ex, now, doneMonths, notSince);
  const cut = RC.addMonths(now, -notSince);
  const recentMov = new Set(S.ex.filter(e => e.last >= cut && e.res.movement).map(e => e.res.movement));
  let hidden = 0;
  if (hideSimilar) { const before = list.length; list = list.filter(x => !(x.e.res.movement && recentMov.has(x.e.res.movement))); hidden = before - list.length; }
  // Muscles trained less: weekly sets in the recent window vs the earlier part of the window
  const from = RC.addMonths(now, -doneMonths);
  const a = RC.muscleWeekly(S.sets, S.userMap, from, cut, 'sets').weeks, b = RC.muscleWeekly(S.sets, S.userMap, cut, now, 'sets').weeks;
  const sum = (w, m) => { let t = 0; for (const r of w.values()) t += r[m] || 0; return t; };
  const wA = Math.max(1, (cut - from) / (7 * RC.DAY)), wB = Math.max(1, (now - cut) / (7 * RC.DAY));
  const drops = RC.MUSCLES.map(m => ({ m, before: sum(a, m) / wA, after: sum(b, m) / wB })).filter(d => d.before >= 1 && d.after < d.before * 0.6).sort((x, y) => (x.after / x.before) - (y.after / y.before));
  return `<h2>Reminders</h2><p class="sub">Exercises you did in the last ${doneMonths} months but not in the last ${notSince} — candidates to bring back.</p>
  <div class="controls">
    <label>Done in the last <input type="number" min="1" max="60" id="doneM" value="${doneMonths}"> months</label>
    <label>but not in the last <input type="number" min="0" max="59" id="notM" value="${notSince}"> months</label>
    <label><input type="checkbox" id="hideSim" ${hideSimilar ? 'checked' : ''}> Hide if a similar movement was done recently</label>
  </div>
  <div class="grid2">
  <div class="card"><h3>${list.length} exercise${list.length === 1 ? '' : 's'} to bring back${hidden ? ` <span class="muted small">(${hidden} hidden)</span>` : ''}</h3>
  ${list.length ? `<div class="list">${list.map(x => `<div><div class="row"><b><a href="#exercises" data-goto="${esc(x.e.key)}">${esc(x.e.name)}</a></b><span class="small t2">last ${fmtDate(x.last)} · ${ago(x.last)}</span></div>
    <div class="small" style="margin:3px 0">${muscleChips(x.e.res)}</div>
    <div class="small t2">${x.sessionsInWindow} session${x.sessionsInWindow === 1 ? '' : 's'} in that period · last time: ${sessionStr(x.lastSession)}</div></div>`).join('')}</div>` : '<p class="muted">Nothing — you have kept up with everything from that period.</p>'}
  </div>
  <div class="card"><h3>Muscles trained less lately</h3><p class="small t2" style="margin-top:-4px">Weekly sets in the last ${notSince} months vs the ${doneMonths - notSince} months before (drops of 40% or more).</p>
  ${drops.length ? `<table><thead><tr><th>Muscle</th><th class="n">Before</th><th class="n">Recently</th><th class="n">Change</th></tr></thead><tbody>${drops.map(d => `<tr><td>${RC.MUSCLE_LABEL[d.m]}</td><td class="n">${fmtNum(d.before, 1)}</td><td class="n">${fmtNum(d.after, 1)}</td><td class="n">${Math.round(100 * (d.after / d.before - 1))}%</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No muscle dropped noticeably.</p>'}
  </div></div>`;
}

function movementOptions(selected, withEmpty) {
  const ids = Object.keys(RC.MOVEMENTS).sort((a, b) => (RC.MOVEMENTS[a].cardio ? 1 : 0) - (RC.MOVEMENTS[b].cardio ? 1 : 0) || RC.MOVEMENTS[a].name.localeCompare(RC.MOVEMENTS[b].name));
  return (withEmpty ? `<option value="">— choose —</option>` : '') + ids.map(id => `<option value="${id}" ${id === selected ? 'selected' : ''}>${esc(RC.MOVEMENTS[id].name)}</option>`).join('') + `<option value="custom" ${selected === 'custom' ? 'selected' : ''}>Custom muscles…</option>`;
}
function customEditor(e) {
  const r = e.res;
  const box = (kind, list) => RC.MUSCLE_GROUPS.map(([g, ms]) => `<div class="small muted" style="margin-top:4px">${g}</div>` + ms.map(([id, l]) => `<label><input type="checkbox" data-kind="${kind}" value="${id}" ${list.includes(id) ? 'checked' : ''}> ${l}</label>`).join('')).join('');
  return `<div class="editor" data-editor="${esc(e.key)}"><div class="cols"><div><b class="small">Primary (1 set)</b>${box('p', r.p)}</div><div><b class="small">Secondary (½ set)</b>${box('s', r.s)}</div></div>
  <div style="margin-top:8px"><button class="primary" data-savecustom="${esc(e.key)}">Save</button> <button data-cancel>Cancel</button></div></div>`;
}
function mapping() {
  if (!S.sets.length) return `<h2>Mapping</h2><p class="sub">Load your export first (Data tab).</p>`;
  const u = unmapped();
  const q = RC.normName(S.settings.mapQuery);
  const list = S.ex.filter(e => !q || RC.normName(e.name).includes(q)).sort((a, b) => b.sets - a.sets);
  return `<h2>Exercise → muscles</h2><p class="sub">Each exercise is linked to a movement, which defines its primary and secondary muscles. Built-in links cover common names; anything you change is saved in this browser and wins over the built-in link.</p>
  ${u.length ? `<div class="card"><h3>Needs review (${u.length})</h3><div class="list">${u.map(e => `<div><div class="row"><span><b>${esc(e.name)}</b> <span class="muted small">${esc(e.cat)} · ${e.sets} sets</span></span>
    <span><select data-review="${esc(e.key)}">${movementOptions(e.res.suggestion, true)}</select> <button class="primary" data-confirm="${esc(e.key)}">Confirm</button></span></div>
    <div class="small muted">${e.res.suggestion ? `Suggested from the name: ${esc(movementName(e.res.suggestion))}` : 'No suggestion from the name — pick a movement or set custom muscles.'}</div>
    ${S.editing === e.key ? customEditor(e) : ''}</div>`).join('')}</div></div>` : ''}
  <div class="controls"><input type="search" id="mapq" placeholder="Search exercise…" value="${esc(S.settings.mapQuery)}"><span class="muted small">${list.length} exercises</span></div>
  <div class="card tablewrap"><table><thead><tr><th>Exercise</th><th class="n">Sets</th><th>Movement</th><th>Muscles</th></tr></thead><tbody>
  ${list.map(e => `<tr><td><b>${esc(e.name)}</b><div class="muted small">${esc(e.cat)} <span class="badge ${e.res.source === 'yours' ? 'yours' : e.res.source === 'unmapped' ? 'unmapped' : ''}">${e.res.source}</span></div></td><td class="n">${e.sets}</td>
  <td><select data-move="${esc(e.key)}">${movementOptions(e.res.movement, !e.res.movement)}</select>${e.res.source === 'yours' ? ` <button class="small" data-reset="${esc(e.key)}" title="Back to built-in">Reset</button>` : ''}</td>
  <td>${muscleChips(e.res)}${S.editing === e.key && e.res.source !== 'unmapped' ? customEditor(e) : ''}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function data() {
  const has = S.sets.length;
  return `<h2>Your data</h2><p class="sub">Everything stays in this browser: nothing is uploaded anywhere.</p>
  <div class="grid2">
  <div class="card"><h3>${has ? 'Update your export' : 'Load your RepCount export'}</h3>
    <div class="drop" id="drop"><p style="margin:0 0 10px">Drop <b>repcount_csv_export.csv</b> here, or</p><label class="btn primary">Choose file<input type="file" id="file" accept=".csv,text/csv,text/plain" hidden></label></div>
    ${has ? `<p class="small t2">Loaded: <b>${esc(S.fileName)}</b> — ${fmtNum(S.sets.length)} sets, ${fmtNum(S.wos.length)} workouts, imported ${fmtDate(S.importedAt)}. A new file replaces it (the export always holds your full history).</p>` : ''}
    <p class="small t2"><b>How to export:</b> in RepCount, open the <b>Statistics</b> tab, tap the menu (⋮) at the top right and choose the CSV export (Premium). On Android, if this app is installed, you can share the file straight to it.</p>
  </div>
  <div class="card"><h3>Settings</h3>
    <div class="small t2" style="margin-bottom:6px">Best set definition</div>
    <div class="toggle2 ${S.settings.bestBy === 'weight' ? 'right' : 'left'}" id="bestBy">
      <button data-v="e1rm" class="opt"><span class="long">Highest estimated 1RM</span><span class="short">Highest est. 1RM</span></button>
      <button class="track" aria-label="Switch best set definition"><span></span></button>
      <button data-v="weight" class="opt" data-tip="Sets above 15 reps have no 1RM estimate; when an exercise only has those, the heaviest one is used.">Heaviest weight<span class="long">, then most reps</span></button>
    </div>
    <div class="controls"><label>Weight unit <select id="unit"><option ${S.settings.unit === 'kg' ? 'selected' : ''}>kg</option><option ${S.settings.unit === 'lb' ? 'selected' : ''}>lb</option></select></label></div>
    <h3 style="margin-top:14px">Your mappings</h3>
    <p class="small t2">${Object.keys(S.userMap).length} custom link(s). Export them to keep a copy or move them to another device.</p>
    <p><button id="expMap">Export mappings</button> <label class="btn">Import mappings<input type="file" id="impMap" accept=".json,application/json" hidden></label></p>
    <div id="mapOut"></div>
    ${has ? `<h3 style="margin-top:14px">Reset</h3><button class="danger" id="clear">Delete all data from this browser</button>` : ''}
  </div></div>
  ${has ? anomalyCard() : ''}`;
}

function anomalyCard() {
  const A = S.anomalies;
  let body = '';
  if (A) {
    const u = S.settings.unit;
    body = A.length ? `<p class="small t2">${A.length} set${A.length > 1 ? 's look' : ' looks'} unusual. Fix them in RepCount if they are typos, then load a new export.</p>
    <div class="tablewrap"><table><thead><tr><th>Exercise</th><th>Date</th><th class="n">Value</th><th>Why</th><th class="n">Usual</th><th>That session</th></tr></thead><tbody>
    ${A.map(a => `<tr><td><a href="#exercises" data-goto="${esc(a.set.key)}"><b>${esc(a.set.ex)}</b></a></td><td class="small" style="white-space:nowrap">${fmtDate(a.set.start)}</td>
      <td class="n"><b>${setStr(a.set)}</b></td><td class="small">${a.why.join(', ')}</td>
      <td class="n small t2" style="white-space:nowrap">${a.usualW != null ? fmtNum(a.usualW, 1) + ' ' + u : '–'} × ${a.usualR != null ? fmtNum(a.usualR) : '–'}</td>
      <td class="small t2">${a.session.map(x => x === a.set ? `<b style="color:var(--text)">${setStr(x)}</b>` : setStr(x)).join(' · ')}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted small">“Usual” is the median of the same exercise over the 5 sessions before and after. A set is flagged when its weight is 2.5× higher or 3× lower than usual and than the other sets that day, or when it has over 30 reps and 3× the usual. Some flags can be real (a burnout set, for example).</p>`
    : '<p class="small t2">No abnormal values found.</p>';
  }
  return `<div class="card"><div class="row"><h3 style="margin:0">Data check</h3><button id="checkAnom" class="${A ? '' : 'primary'}">${A ? 'Check again' : 'Check for abnormal values'}</button></div>
  <p class="small t2" style="margin:6px 0 0">Looks for likely typos, like a weight with an extra digit.</p>${body}</div>`;
}

// ---------- Event binding ----------
const BIND = {
  muscles() {
    $('#period').onclick = e => { const v = e.target.dataset.v; if (!v) return; S.settings.period = v === 'all' ? 'all' : +v; saveSettings(); render(); };
    $('#metric').onclick = e => { const v = e.target.dataset.v; if (!v) return; S.settings.metric = v; saveSettings(); render(); };
    document.querySelectorAll('[data-group]').forEach(b => b.onclick = () => { const c = new Set(S.settings.collapsed || []), g = b.dataset.group; c.has(g) ? c.delete(g) : c.add(g); S.settings.collapsed = [...c]; saveSettings(); render(); });
    $('#expAll').onclick = e => { e.preventDefault(); S.settings.collapsed = []; saveSettings(); render(); };
    $('#colAll').onclick = e => { e.preventDefault(); S.settings.collapsed = RC.MUSCLE_GROUPS.map(([g]) => g); saveSettings(); render(); };
    document.querySelectorAll('[data-muscle]').forEach(b => b.onclick = () => { S.selMuscle = S.selMuscle === b.dataset.muscle ? null : b.dataset.muscle; render(); const d = $('#mdetail'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
    const c = $('#closeM'); if (c) c.onclick = () => { S.selMuscle = null; render(); };
    document.querySelectorAll('[data-goto]').forEach(a => a.onclick = () => { S.selEx = a.dataset.goto; });
  },
  exercises() {
    const q = $('#exq'); q.oninput = () => { S.settings.exQuery = q.value; const pos = q.selectionStart; render(); const n = $('#exq'); n.focus(); n.setSelectionRange(pos, pos); };
    $('#show6').onchange = e => { S.settings.show6 = e.target.checked; saveSettings(); render(); };
    document.querySelectorAll('[data-sort]').forEach(th => th.onclick = () => { S.settings.exSort = th.dataset.sort; saveSettings(); render(); });
    document.querySelectorAll('[data-ex]').forEach(tr => tr.onclick = () => { S.selEx = tr.dataset.ex; render(); scrollTo({ top: 0, behavior: 'smooth' }); });
    const c = $('#closeEx'); if (c) c.onclick = () => { S.selEx = null; render(); };
  },
  reminders() {
    const upd = () => { const d = Math.max(1, +$('#doneM').value || 8), n = Math.max(0, +$('#notM').value || 0); S.settings.doneMonths = d; S.settings.notSince = Math.min(n, d - 1); saveSettings(); render(); };
    $('#doneM').onchange = upd; $('#notM').onchange = upd;
    $('#hideSim').onchange = e => { S.settings.hideSimilar = e.target.checked; saveSettings(); render(); };
    document.querySelectorAll('[data-goto]').forEach(a => a.onclick = () => { S.selEx = a.dataset.goto; });
  },
  mapping() {
    const q = $('#mapq'); if (q) q.oninput = () => { S.settings.mapQuery = q.value; const pos = q.selectionStart; render(); const n = $('#mapq'); n.focus(); n.setSelectionRange(pos, pos); };
    const keyName = k => S.ex.find(e => e.key === k);
    const setMove = (k, v) => {
      const e = keyName(k); if (!e) return;
      if (v === 'custom') { S.editing = k; render(); return; }
      const n = RC.normName(e.name);
      if (!v) delete S.userMap[n];
      else if (RC.ALIASES[n] === v) delete S.userMap[n]; else S.userMap[n] = { movement: v };
      S.editing = null; saveMap(); recompute(); render();
    };
    document.querySelectorAll('[data-confirm]').forEach(b => b.onclick = () => { const v = $(`[data-review="${CSS.escape(b.dataset.confirm)}"]`).value; if (!v) return toast('Pick a movement first'); setMove(b.dataset.confirm, v); if (v !== 'custom') toast('Saved'); });
    document.querySelectorAll('[data-review]').forEach(s => s.onchange = () => { if (s.value === 'custom') setMove(s.dataset.review, 'custom'); });
    document.querySelectorAll('[data-move]').forEach(s => s.onchange = () => setMove(s.dataset.move, s.value));
    document.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => { const e = keyName(b.dataset.reset); delete S.userMap[RC.normName(e.name)]; saveMap(); recompute(); render(); });
    document.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => { S.editing = null; render(); });
    document.querySelectorAll('[data-savecustom]').forEach(b => b.onclick = () => {
      const ed = b.closest('.editor'), get = k => [...ed.querySelectorAll(`input[data-kind="${k}"]:checked`)].map(i => i.value);
      const p = get('p'), s = get('s').filter(m => !p.includes(m));
      if (!p.length) return toast('Pick at least one primary muscle');
      const e = keyName(b.dataset.savecustom); S.userMap[RC.normName(e.name)] = { p, s };
      S.editing = null; saveMap(); recompute(); render(); toast('Saved');
    });
  },
  data() {
    const handle = async f => {
      if (!f) return;
      try { const r = setData(await f.text(), f.name); toast(`Loaded ${fmtNum(r.sets)} sets from ${fmtNum(r.workouts)} workouts`); location.hash = unmapped().length ? '#mapping' : '#overview'; render(); }
      catch (err) { toast(err.message || 'Could not read that file'); }
    };
    $('#file').onchange = e => handle(e.target.files[0]);
    const d = $('#drop');
    d.ondragover = e => { e.preventDefault(); d.classList.add('over'); };
    d.ondragleave = () => d.classList.remove('over');
    d.ondrop = e => { e.preventDefault(); d.classList.remove('over'); handle(e.dataTransfer.files[0]); };
    $('#unit').onchange = e => { S.settings.unit = e.target.value; saveSettings(); };
    const ca = $('#checkAnom'); if (ca) ca.onclick = () => { S.anomalies = RC.anomalies(S.sets); render(); const b = $('#checkAnom'); if (b) b.closest('.card').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
    document.querySelectorAll('[data-goto]').forEach(a => a.onclick = () => { S.selEx = a.dataset.goto; });
    $('#bestBy').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      const v = b.dataset.v || (S.settings.bestBy === 'weight' ? 'e1rm' : 'weight');
      S.settings.bestBy = v; saveSettings();
      const t = $('#bestBy'); t.classList.toggle('right', v === 'weight'); t.classList.toggle('left', v !== 'weight');
    };
    $('#expMap').onclick = () => {
      const json = JSON.stringify({ app: 'repcount-companion', version: 1, mappings: S.userMap }, null, 2);
      let url = ''; try { url = URL.createObjectURL(new Blob([json], { type: 'application/json' })); } catch (e) {}
      $('#mapOut').innerHTML = `${url ? `<p><a class="btn" href="${url}" download="repcount-mappings.json">Download repcount-mappings.json</a> <button id="cpMap">Copy</button></p>` : '<p><button id="cpMap">Copy</button></p>'}<textarea readonly>${esc(json)}</textarea>`;
      $('#cpMap').onclick = async () => { try { await navigator.clipboard.writeText(json); toast('Copied'); } catch (e) { $('#mapOut textarea').select(); toast('Select the text and copy it'); } };
    };
    $('#impMap').onchange = async e => {
      try { const j = JSON.parse(await e.target.files[0].text()); const m = j.mappings || j; let n = 0;
        for (const k in m) { const v = m[k]; if (v && ((v.movement && RC.MOVEMENTS[v.movement]) || Array.isArray(v.p))) { S.userMap[k] = v; n++; } }
        saveMap(); recompute(); render(); toast(`Imported ${n} mapping(s)`);
      } catch (err) { toast('That file is not a mappings export'); }
    };
    const c = $('#clear');
    if (c) c.onclick = async () => {
      if (!c.dataset.armed) { c.dataset.armed = 1; c.textContent = 'Click again to delete everything'; return; }
      S.text = null; S.sets = []; S.userMap = {}; recompute(); await kvSet('data', null); await kvSet('userMap', {}); toast('Deleted'); render();
    };
  },
};

// ---------- Boot ----------
async function boot() {
  try {
    const st = await kvGet('settings'); if (st) Object.assign(S.settings, st);
    const um = await kvGet('userMap'); if (um) S.userMap = um;
    const d = await kvGet('data');
    if (d && d.text) { const { sets } = RC.loadExport(d.text); S.text = d.text; S.sets = sets; S.fileName = d.fileName; S.importedAt = d.importedAt; }
  } catch (e) { console.warn(e); }
  // A file shared from RepCount via the Android share menu (see sw.js)
  if (/[?&]shared=1/.test(location.search) && 'caches' in window) {
    try {
      const c = await caches.open('rc-share'); const r = await c.match('shared-file');
      if (r) { const text = await r.text(); await c.delete('shared-file'); setData(text, r.headers.get('x-name') || 'shared.csv'); setTimeout(() => toast('Imported the shared export'), 300); }
    } catch (e) { setTimeout(() => toast('Could not read the shared file'), 300); }
    history.replaceState(null, '', location.pathname + (location.hash || ''));
  }
  recompute(); render();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && document.querySelector('link[rel=manifest]')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();
})();
