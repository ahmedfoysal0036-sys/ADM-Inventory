/* ADM Inventory - Created by: Ahmed Faisal 0036 */
const $ = (s, e = document) => e.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CATS = { stationery: 'Stationery', grocery: 'Grocery' };
const today = () => new Date().toISOString().slice(0, 10);
const byZ = (a, b) => (a.z || 0) - (b.z || 0);
const fmt = n => Math.round(n * 100) / 100;
const cfg = window.FIREBASE_CONFIG, useFB = cfg && cfg.apiKey && !cfg.apiKey.startsWith('PASTE') && cfg.databaseURL && !cfg.databaseURL.includes('PASTE');
let S = { items: [], tx: [] }, f = { cat: 'all', q: '' }, month = today().slice(0, 7), DB;

/* ---------- storage: local (test) or Firebase (cloud) ---------- */
function localDB() {
  let d = JSON.parse(localStorage.getItem('adm_inv') || 'null') || { items: [], tx: [] }, cb;
  const save = () => { localStorage.setItem('adm_inv', JSON.stringify(d)); cb && cb(d); };
  const id = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return {
    sub(g) { cb = g; g(d); },
    add(c, o) { d[c].push({ ...o, id: id() }); save(); },
    upd(c, i, o) { Object.assign(d[c].find(x => x.id == i), o); save(); },
    del(c, i) { d[c] = d[c].filter(x => x.id != i); if (c == 'items') d.tx = d.tx.filter(t => t.i != i); save(); },
    seed() {
      const ids = SEED.items.map((it, z) => { const x = { ...it, z, min: 0, id: id() }; d.items.push(x); return x.id; });
      SEED.tx.forEach(t => d.tx.push({ ...t, i: ids[t.i], id: id(), r: 'Imported from Oct 2026 sheet' })); save();
    }
  };
}
function fbDB() {
  firebase.initializeApp(cfg);
  const rt = firebase.database(), d = { items: [], tx: [] }; let cb;
  const snap = c => rt.ref(c).on('value', s => { d[c] = Object.entries(s.val() || {}).map(([id, x]) => ({ ...x, id })); cb && cb(d); }, e => toast('Database error: ' + e.message));
  return {
    auth: firebase.auth(),
    sub(g) { cb = g; snap('items'); snap('tx'); },
    add: (c, o) => rt.ref(c).push(o),
    upd: (c, i, o) => rt.ref(c + '/' + i).update(o),
    async del(c, i) {
      if (c == 'items') { const u = { ['items/' + i]: null }; d.tx.filter(t => t.i == i).forEach(t => u['tx/' + t.id] = null); await rt.ref().update(u); }
      else await rt.ref(c + '/' + i).remove();
    },
    async seed() {
      const u = {}, ids = SEED.items.map((it, z) => { const k = rt.ref('items').push().key; u['items/' + k] = { ...it, z, min: 0 }; return k; });
      SEED.tx.forEach(t => { u['tx/' + rt.ref('tx').push().key] = { ...t, i: ids[t.i], r: 'Imported from Oct 2026 sheet' }; });
      await rt.ref().update(u);
    }
  };
}

/* ---------- calculations ---------- */
function stockMap() {
  const m = {};
  S.items.forEach(i => m[i.id] = { ...i, s: +i.o || 0, any: +i.o > 0 });
  S.tx.forEach(t => { const x = m[t.i]; if (x) { x.s += t.t == 'in' ? +t.q : -t.q; x.any = 1; } });
  return m;
}
const status = x => x.s <= 0 ? (x.any ? 'out' : 'none') : (+x.min > 0 && x.s <= +x.min ? 'low' : 'ok');
const badge = x => ({ out: '<span class="badge b-out">Out of stock</span>', low: '<span class="badge b-low">Low</span>', ok: '<span class="badge b-ok">In stock</span>', none: '<span class="muted">-</span>' }[status(x)]);
function register(c, mo) {
  const first = mo + '-01';
  return S.items.filter(i => i.c == c).sort(byZ).map(it => {
    let o = +it.o || 0, rc = 0, cs = 0; const u = {}, notes = [];
    S.tx.forEach(t => {
      if (t.i != it.id) return; const q = +t.q;
      if (t.d < first) o += t.t == 'in' ? q : -q;
      else if (t.d.slice(0, 7) == mo) {
        if (t.t == 'in') { if (t.k == 'cash' || t.k == 'local') cs += q; else rc += q; if (t.k == 'local') notes.push(`Local purchase ${t.d.slice(8)}/${t.d.slice(5, 7)}: ${fmt(q)}${[t.v, t.b ? 'Bill ' + t.b : '', t.r].filter(Boolean).length ? ' - ' + [t.v, t.b ? 'Bill ' + t.b : '', t.r].filter(Boolean).join(', ') : ''}`); }
        else { const d = +t.d.slice(8); u[d] = (u[d] || 0) + q; }
      }
    });
    return { it, o, rc, cs, u, note: notes.join('; ') };
  });
}
const monthName = mo => new Date(mo + '-01T00:00').toLocaleString('en', { month: 'long', year: 'numeric' });

/* ---------- pages ---------- */
const itemOpts = (sel, M) => ['stationery', 'grocery'].map(c =>
  `<optgroup label="${CATS[c]}">${S.items.filter(i => i.c == c).sort(byZ).map(i => `<option value="${i.id}" ${i.id == sel ? 'selected' : ''}>${esc(i.name || i.n)} (${fmt(M[i.id].s)} ${esc(i.u)})</option>`).join('')}</optgroup>`).join('');
const txTable = (list, M, n = 15) => {
  const rows = [...list].sort((a, b) => b.d.localeCompare(a.d)).slice(0, n);
  if (!rows.length) return '<div class="empty">No entries yet.</div>';
  return `<div class="tw"><table><tr><th>Date</th><th>Item</th><th>Type</th><th class="n">Qty</th><th>Remarks</th><th></th></tr>${rows.map(t => {
    const it = M[t.i]; return `<tr><td>${t.d}</td><td>${esc(it ? it.n : 'Deleted item')}</td><td class="${t.t}">${t.t == 'in' ? (t.k == 'cash' ? 'Inbound (cash)' : t.k == 'local' ? 'Inbound (local)' : 'Inbound') : 'Outbound'}</td><td class="n">${t.t == 'in' ? '+' : '-'}${fmt(t.q)} ${esc(it ? it.u : '')}</td><td>${esc(t.r)}</td><td><button class="btn danger" data-act="delTx" data-id="${t.id}">Delete</button></td></tr>`;
  }).join('')}</table></div>`;
};
const P = {
  dashboard(M) {
    const all = Object.values(M), low = all.filter(x => ['low', 'out'].includes(status(x))), mo = today().slice(0, 7);
    const sum = t => S.tx.filter(x => x.t == t && x.d.slice(0, 7) == mo).reduce((a, x) => a + +x.q, 0);
    return `<div class="grid">
      <div class="card stat"><b>${all.length}</b><span>Items tracked</span></div>
      <div class="card stat"><b>${low.length}</b><span>Low or out of stock</span></div>
      <div class="card stat"><b class="in">${fmt(sum('in'))}</b><span>Inbound this month</span></div>
      <div class="card stat"><b class="out">${fmt(sum('out'))}</b><span>Outbound this month</span></div></div>
      <div class="cols"><div class="card"><h3>Needs attention</h3>${low.length ? `<table>${low.map(x => `<tr><td>${esc(x.n)}</td><td class="n">${fmt(x.s)} ${esc(x.u)}</td><td>${badge(x)}</td></tr>`).join('')}</table>` : '<div class="empty">Everything is stocked.</div>'}</div>
      <div class="card"><h3>Recent activity</h3>${txTable(S.tx, M, 6)}</div></div>`;
  },
  stock(M) {
    const rows = Object.values(M).filter(x => (f.cat == 'all' || x.c == f.cat) && x.n.toLowerCase().includes(f.q.toLowerCase())).sort(byZ);
    return `<div class="bar"><input id="q" placeholder="Search items" value="${esc(f.q)}"><select id="cat"><option value="all">All categories</option>${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${f.cat == k ? 'selected' : ''}>${v}</option>`).join('')}</select><button class="btn primary" data-act="addItem">+ New item</button></div>
      ${rows.length ? `<div class="tw"><table><tr><th>Item</th><th>Category</th><th>UoM</th><th class="n">Stock</th><th>Status</th><th></th></tr>${rows.map(x => `<tr><td>${esc(x.n)}</td><td>${CATS[x.c]}</td><td>${esc(x.u)}</td><td class="n"><b>${fmt(x.s)}</b></td><td>${badge(x)}</td><td><button class="btn" data-act="editItem" data-id="${x.id}">Edit</button></td></tr>`).join('')}</table></div>` : `<div class="card empty">No items found. ${S.items.length ? '' : '<br><br><button class="btn primary" data-act="seed">Load items from October sheet</button>'}</div>`}`;
  },
  inbound: M => movePage('in', M),
  local(M) {
    const rows = S.tx.filter(t => t.t == 'in' && t.k == 'local').sort((a, b) => b.d.localeCompare(a.d)).slice(0, 30);
    return `<div class="cols"><form class="card form" id="lp"><h3>Add local purchase</h3>
      <label>Item<select name="i" required>${itemOpts('', M)}</select></label>
      <div class="bar"><button type="button" class="btn" data-act="addItem">+ New item</button></div>
      <label>Quantity<input name="q" type="number" step="any" min="0.01" required></label>
      <label>Date<input name="d" type="date" value="${today()}" required></label>
      <label>Shop / vendor<input name="v" placeholder="e.g. Dhanmondi store"></label>
      <label>Bill / memo no.<input name="b" placeholder="Optional"></label>
      <label>Amount (Tk)<input name="a" type="number" step="any" min="0" placeholder="Optional"></label>
      <label>Local note<input name="r" placeholder="Optional"></label>
      <button class="btn primary">Add local purchase</button>
      <p class="muted">Stock increases and the entry appears in the monthly register and Excel.</p></form>
      <div><h3>Recent local purchases</h3>${rows.length ? `<div class="tw"><table><tr><th>Date</th><th>Item</th><th class="n">Qty</th><th>Vendor</th><th>Bill</th><th class="n">Tk</th><th>Note</th><th></th></tr>${rows.map(t => { const it = M[t.i]; return `<tr><td>${t.d}</td><td>${esc(it ? it.n : 'Deleted item')}</td><td class="n in">+${fmt(t.q)} ${esc(it ? it.u : '')}</td><td>${esc(t.v)}</td><td>${esc(t.b)}</td><td class="n">${t.a ? fmt(t.a) : ''}</td><td>${esc(t.r)}</td><td><button class="btn danger" data-act="delTx" data-id="${t.id}">Delete</button></td></tr>`; }).join('')}</table></div>` : '<div class="empty">No local purchases yet.</div>'}</div></div>`;
  },
  outbound: M => movePage('out', M),
  register(M) {
    return `<div class="bar"><input type="month" id="mo" value="${month}"><select id="cat"><option value="stationery" ${f.cat != 'grocery' ? 'selected' : ''}>Stationery</option><option value="grocery" ${f.cat == 'grocery' ? 'selected' : ''}>Grocery</option></select></div>
    <div class="tw"><table class="reg"><tr><th>Sl</th><th>Item</th><th>UoM</th><th>Opening</th><th>Received</th><th>Cash/Local</th><th>Total</th>${Array.from({ length: 31 }, (_, i) => `<th>${i + 1}</th>`).join('')}<th>Closing</th></tr>
    ${register(f.cat == 'grocery' ? 'grocery' : 'stationery', month).map((r, i) => { const tot = r.o + r.rc + r.cs, used = Object.values(r.u).reduce((a, b) => a + b, 0);
      return `<tr><td>${i + 1}</td><td>${esc(r.it.n)}</td><td>${esc(r.it.u)}</td><td>${fmt(r.o)}</td><td>${fmt(r.rc)}</td><td>${fmt(r.cs)}</td><td>${fmt(tot)}</td>${Array.from({ length: 31 }, (_, d) => `<td class="out">${r.u[d + 1] ? fmt(r.u[d + 1]) : ''}</td>`).join('')}<td><b>${fmt(tot - used)}</b></td></tr>`; }).join('')}</table></div>`;
  }
};
function movePage(type, M) {
  const inn = type == 'in';
  return `<div class="cols"><form class="card form" id="mv" data-type="${type}"><h3>${inn ? 'Receive stock (inbound)' : 'Use stock (outbound)'}</h3>
    <label>Item<select name="i" required>${itemOpts('', M)}</select></label>
    <label>Quantity<input name="q" type="number" step="any" min="0.01" required></label>
    ${inn ? '<div><b>Source</b><div class="seg"><label><input type="radio" name="k" value="recv" checked>Received</label><label><input type="radio" name="k" value="cash">Cash purchase</label><label><input type="radio" name="k" value="local">Local purchase</label></div></div><br>' : ''}
    <label>Date<input name="d" type="date" value="${today()}" required></label>
    <label>Remarks / local note<input name="r" placeholder="${inn ? 'e.g. shop name, bill no. (for local purchase)' : 'Optional'}"></label>
    <button class="btn primary">${inn ? 'Add inbound' : 'Add outbound'}</button></form>
    <div><h3>Recent ${inn ? 'inbound' : 'outbound'}</h3>${txTable(S.tx.filter(t => t.t == type), M)}</div></div>`;
}

/* ---------- Excel export (same layout as the original register) ---------- */
const thin = { style: 'thin', color: { argb: 'FF9AA5AD' } }, bd = { top: thin, bottom: thin, left: thin, right: thin };
const REGS = [['stationery', 'STATIONARY REGISTER'], ['grocery', 'Grocery REGISTER']];
const allMonths = () => [...new Set(S.tx.map(t => t.d.slice(0, 7)))].sort();
function addReg(wb, c, name, mo, sheet) {
  const ws = wb.addWorksheet(sheet || name);
  ws.addRow([`${name} (${monthName(mo)})`]); ws.mergeCells('A1:AN1');
  ws.getCell('A1').font = { bold: true, size: 14 }; ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.addRow(['', '', '', '', '', '', '', `Month ${monthName(mo)}`]); ws.mergeCells('H2:AL2');
  ws.addRow(['Sl.', 'Items Name', 'UoM', 'Previous/ Opening Stock in hand', 'Received Qty', 'Cash / Local Purchase', 'Total Qty', ...Array.from({ length: 31 }, (_, i) => i + 1), 'Month Closing Balance', 'Remarks']);
  register(c, mo).forEach((r, i) => {
    const n = i + 4, used = Object.values(r.u).reduce((a, b) => a + b, 0), tot = r.o + r.rc + r.cs;
    const row = ws.addRow([i + 1, r.it.n, r.it.u, r.o || null, r.rc || null, r.cs || null, { formula: `SUM(D${n}:F${n})`, result: tot }, ...Array.from({ length: 31 }, (_, d) => r.u[d + 1] || null), { formula: `G${n}-SUM(H${n}:AL${n})`, result: tot - used }, r.note]);
    row.eachCell({ includeEmpty: true }, x => { x.border = bd; });
  });
  [1, 2, 3].forEach(n => ws.getRow(n).eachCell({ includeEmpty: true }, x => { x.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; }));
  ws.getRow(3).eachCell({ includeEmpty: true }, x => { x.font = { bold: true, color: { argb: 'FFFFFFFF' } }; x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7C6B' } }; x.border = bd; });
  ws.getRow(2).font = { bold: true }; ws.getRow(3).height = 48;
  ws.getColumn(1).width = 6; ws.getColumn(2).width = 38; ws.getColumn(3).width = 8;
  for (let i = 4; i <= 7; i++) ws.getColumn(i).width = 13;
  for (let i = 8; i <= 38; i++) ws.getColumn(i).width = 4.5;
  ws.getColumn(39).width = 14; ws.getColumn(40).width = 40;
  const e = ws.rowCount + 2; ws.getCell(`A${e}`).value = 'Created by: Ahmed Faisal 0036'; ws.getCell(`A${e}`).font = { italic: true };
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 3 }];
}
function addTable(wb, name, head, rows) {
  const ws = wb.addWorksheet(name); ws.addRow(head);
  rows.forEach(r => ws.addRow(r).eachCell({ includeEmpty: true }, x => { x.border = bd; }));
  ws.getRow(1).eachCell(x => { x.font = { bold: true, color: { argb: 'FFFFFFFF' } }; x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7C6B' } }; x.border = bd; });
  ws.columns.forEach((c, i) => c.width = i == 1 || i == 6 ? 34 : 14); ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.addRow([]); ws.addRow(['Created by: Ahmed Faisal 0036']).font = { italic: true };
}
async function exportXlsx(mode, mo) {
  const wb = new ExcelJS.Workbook(); let file;
  if (mode == 'all') {
    const M = stockMap();
    addTable(wb, 'Current Stock', ['Category', 'Item', 'UoM', 'Opening', 'Current stock', 'Status'],
      Object.values(M).sort(byZ).map(x => [CATS[x.c], x.n, x.u, +x.o || 0, fmt(x.s), { out: 'Out of stock', low: 'Low', ok: 'In stock', none: '' }[status(x)]]));
    addTable(wb, 'All Transactions', ['Date', 'Category', 'Type', 'Source', 'Qty', 'UoM', 'Item', 'Remarks', 'Vendor', 'Bill no.', 'Amount (Tk)', 'By'],
      [...S.tx].sort((a, b) => a.d.localeCompare(b.d)).map(t => { const it = M[t.i] || {}; return [t.d, CATS[it.c] || '', t.t == 'in' ? 'Inbound' : 'Outbound', t.k == 'cash' ? 'Cash purchase' : t.k == 'local' ? 'Local purchase' : t.k == 'recv' ? 'Received' : 'Usage', +t.q, it.u || '', it.n || 'Deleted item', t.r || '', t.v || '', t.b || '', t.a || '', t.by || '']; }));
    allMonths().forEach(m => REGS.forEach(([c, n]) => addReg(wb, c, n, m, `${CATS[c]} ${m}`)));
    file = 'ADM Inventory ALL DATA ' + today() + '.xlsx';
  } else { REGS.forEach(([c, n]) => addReg(wb, c, n, mo)); file = `ADM Inventory ${mo}.xlsx`; }
  const buf = await wb.xlsx.writeBuffer(), a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = file; a.click(); URL.revokeObjectURL(a.href);
}
function exportDialog() {
  const last = (S.tx.map(t => t.d).sort().pop() || today()).slice(0, 7), d = $('#dlg');
  d.innerHTML = `<form id="exf"><h3>Download Excel</h3>
    <label>Month<input type="month" id="exm" value="${location.hash == '#/register' ? month : last}"></label>
    <div class="acts" style="justify-content:stretch;flex-direction:column">
    <button type="button" class="btn primary" data-act="exMonth">Download this month</button>
    <button type="button" class="btn" data-act="exAll">Download all data (every month)</button>
    <button type="button" class="btn" data-act="close">Cancel</button></div></form>`;
  d.showModal();
}

/* ---------- UI plumbing ---------- */
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2200); };
const titles = { dashboard: 'Dashboard', stock: 'Stock', inbound: 'Inbound', outbound: 'Outbound', local: 'Local purchase', register: 'Monthly register' };
function render() {
  const pg = (location.hash.slice(2) in P) ? location.hash.slice(2) : 'dashboard';
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.hash == '#/' + pg));
  $('#title').textContent = titles[pg];
  const keep = document.activeElement && document.activeElement.id;
  $('#view').innerHTML = P[pg](stockMap());
  if (keep == 'q') { const q = $('#q'); q.focus(); q.setSelectionRange(99, 99); }
  closeNav();
}
const closeNav = () => { $('#side').classList.remove('open'); $('#scrim').classList.remove('open'); };
function itemDialog(id) {
  const it = S.items.find(x => x.id == id) || { c: f.cat == 'grocery' ? 'grocery' : 'stationery', u: 'Pcs', o: 0, min: 0 }, d = $('#dlg');
  d.innerHTML = `<form id="itf" data-id="${id || ''}"><h3>${id ? 'Edit item' : 'New item'}</h3>
    <label>Item name<input name="n" value="${esc(it.n)}" required></label>
    <label>Category<select name="c">${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${it.c == k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>Unit (Pcs, Pkt, Kg...)<input name="u" value="${esc(it.u)}" required></label>
    <label>Opening stock<input name="o" type="number" step="any" min="0" value="${it.o || 0}"></label>
    <label>Low-stock alert at<input name="min" type="number" step="any" min="0" value="${it.min || 0}"></label>
    <div class="acts">${id ? '<button type="button" class="btn danger" data-act="delItem">Delete</button>' : ''}<button type="button" class="btn" data-act="close">Cancel</button><button class="btn primary">Save</button></div></form>`;
  d.showModal();
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (a == 'addItem') itemDialog(); else if (a == 'editItem') itemDialog(b.dataset.id);
  else if (a == 'close') $('#dlg').close();
  else if (a == 'export') exportDialog();
  else if (a == 'exMonth') { const m = $('#exm').value; if (!m) return toast('Select a month'); await exportXlsx('month', m); $('#dlg').close(); toast('Downloaded: ' + monthName(m)); }
  else if (a == 'exAll') { await exportXlsx('all'); $('#dlg').close(); toast('All data downloaded'); }
  else if (a == 'seed') { await DB.seed(); toast('Items loaded'); }
  else if (a == 'delTx' && confirm('Delete this entry?')) await DB.del('tx', b.dataset.id);
  else if (a == 'delItem' && confirm('Delete this item and all its entries?')) { await DB.del('items', $('#itf').dataset.id); $('#dlg').close(); }
});
document.addEventListener('submit', async e => {
  e.preventDefault(); const fm = e.target, v = Object.fromEntries(new FormData(fm));
  if (fm.id == 'itf') {
    const o = { n: v.n.trim(), c: v.c, u: v.u.trim(), o: +v.o || 0, min: +v.min || 0 };
    fm.dataset.id ? await DB.upd('items', fm.dataset.id, o) : await DB.add('items', { ...o, z: Date.now() });
    $('#dlg').close(); toast('Item saved');
  } else if (fm.id == 'lp') {
    await DB.add('tx', { i: v.i, t: 'in', k: 'local', q: +v.q, d: v.d, v: v.v.trim(), b: v.b.trim(), a: +v.a || 0, r: v.r.trim(), by: (DB.auth && DB.auth.currentUser && DB.auth.currentUser.email) || '' });
    fm.reset(); fm.d.value = today(); toast('Local purchase added');
  } else if (fm.id == 'mv') {
    const type = fm.dataset.type, M = stockMap();
    if (type == 'out' && +v.q > M[v.i].s) return toast(`Only ${fmt(M[v.i].s)} ${M[v.i].u} in stock`);
    await DB.add('tx', { i: v.i, t: type, k: type == 'in' ? v.k : 'use', q: +v.q, d: v.d, r: v.r.trim(), by: (DB.auth && DB.auth.currentUser && DB.auth.currentUser.email) || '' });
    toast(type == 'in' ? 'Inbound added' : 'Outbound added');
  } else if (fm.id == 'loginForm') {
    DB.auth.signInWithEmailAndPassword($('#lEmail').value, $('#lPass').value).catch(() => $('#lErr').textContent = 'Wrong email or password.');
  }
});
document.addEventListener('input', e => { if (e.target.id == 'q') { f.q = e.target.value; render(); } });
document.addEventListener('change', e => {
  if (e.target.id == 'cat') f.cat = e.target.value; else if (e.target.id == 'mo') month = e.target.value || month; else return; render();
});
$('#burger').onclick = () => { $('#side').classList.add('open'); $('#scrim').classList.add('open'); };
$('#scrim').onclick = closeNav;
const setTheme = t => { document.documentElement.dataset.theme = t; localStorage.setItem('adm_theme', t); $('#theme').textContent = t == 'dark' ? 'Light' : 'Dark'; };
$('#theme').onclick = () => setTheme(document.documentElement.dataset.theme == 'dark' ? 'light' : 'dark');
setTheme(localStorage.getItem('adm_theme') || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'));
window.addEventListener('hashchange', render);

/* ---------- start ---------- */
function start() {
  DB.sub(d => {
    S = d;
    if (!S.items.length && !start.asked && !useFB) { start.asked = 1; DB.seed(); return; }
    const last = S.tx.map(t => t.d).sort().pop(); if (last && !start.m) { month = last.slice(0, 7); start.m = 1; }
    render();
  });
}
$('#mode').textContent = useFB ? 'Cloud sync on' : 'Local test mode';
if (useFB) {
  DB = fbDB(); $('#signout').hidden = false; $('#signout').onclick = () => DB.auth.signOut();
  DB.auth.onAuthStateChanged(u => { $('#login').hidden = !!u; $('#app').hidden = !u; if (u && !start.on) { start.on = 1; start(); } });
} else { DB = localDB(); start(); }
