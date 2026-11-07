/* ============================ Helpers ============================ */
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const show = (el, on = true) => el.classList.toggle('hidden', !on);

const S = { token: null, user: null, cards: [], seq: 0, rows: [], chart: null, scanTarget: null, reader: null };
const DEFAULT_MIN_PH = 2;      // photos needed when Photos is required and the admin set no minimum
const MAX_PHOTOS = 10;
const MAX_VIDEOS = 2, MAX_VIDEO_MB = 15;
const MAX_MERCHANTS = 10;
/* Categories and activities come from the server (admin can edit them); this is the starting set / offline fallback. */
const DEFAULT_CATALOG = [
  { name: 'QR', code: 'QR', tid: false, subs: [{ n: 'Installation', code: 'I' }, { n: 'Refreshment', code: 'G' }, { n: 'Market Coverage', code: 'MC' }, { n: 'Night Business', code: 'NB' }, { n: 'Public Holiday', code: 'PH' }], acts: [{ n: 'Refreshment' }, { n: 'Installation', inst: true }] },
  { name: 'POS', code: 'POS', tid: true, acts: [
    { n: 'Maintenance', contact: true }, { n: 'Fixed Issue', contact: true }, { n: 'New Install', inst: true, contact: true, bizinfo: true },
    { n: 'Paper Roll' }, { n: 'Battery Replacement', contact: true }, { n: 'Replace', contact: true, replace: true },
    { n: 'Item Removal' }, { n: 'Deployment' }, { n: 'Refreshment Training' }] },
  { name: 'SB', code: 'SB', tid: true, acts: [
    { n: 'Maintenance', contact: true }, { n: 'Fixed Issue', contact: true }, { n: 'Battery Replacement', contact: true },
    { n: 'New Install', inst: true, contact: true }, { n: 'Replace', contact: true, replace: true }] },
  { name: 'Payway Inspection', code: 'PAYWAY', tid: false, acts: [{ n: 'Inspection' }, { n: 'Merchant Inquiries' }] }
];
/* Box levels per activity: 0 = hidden, 1 = optional, 2 = must fill (red *). Same rules as the server. */
const YN_KEYS = ['integ', 'sim', 'standee'];      // Yes/No toggles under TID (default No): hidden or shown, never "must"
const FIELD_KEYS = ['merchant', 'mid', 'tid', 'integ', 'sim', 'standee', 'business', 'remarks', 'photo', 'phone', 'tag', 'btype', 'hours', 'group', 'serial', 'oldSn', 'newSn', 'location', 'ptype', 'commune', 'zone'];
const FIELD_NAMES = { merchant: 'Merchant name', mid: 'MID', tid: 'TID', integ: 'Integration', sim: 'SIM', standee: 'POS Standee', business: 'Business name', remarks: 'Remarks', photo: 'Photos', phone: 'Phone number', tag: 'Tag', btype: 'Business type', hours: 'Business hours', group: 'Group name', serial: 'Serial number', oldSn: 'Old S/N', newSn: 'New S/N', location: 'Location', ptype: 'Product type', commune: 'District', zone: 'Zone / Area' };
function legacyLevel(cat, a, k) {
  const rq = a.req && typeof a.req === 'object' ? a.req : {};
  const lv = (on, d) => !on ? 0 : (typeof rq[k] === 'boolean' ? (rq[k] ? 2 : 1) : d);
  if (k === 'merchant' || k === 'mid' || k === 'photo') return 2;
  if (k === 'tid') return cat && cat.tid ? 2 : 0;
  if (k === 'business') return /^pos$/i.test(String(cat && cat.name)) ? 0 : 1;
  if (k === 'remarks' || k === 'location') return 1;
  if (k === 'phone' || k === 'tag') return lv(a.contact, 1);
  if (k === 'btype' || k === 'hours' || k === 'group') return lv(a.bizinfo, 1);
  if (k === 'oldSn' || k === 'newSn') return lv(a.replace, 2);
  return 0;
}
function normAct(cat, a) {
  const o = { n: a.n }; if (a.inst) o.inst = true; if (a.pdf || a.zip) o.pdf = true; if (a.autoStock) o.autoStock = true; if (a.review) o.review = true; if (a.qrchk === true || a.qrchk === false) o.qrchk = a.qrchk; if (a.stock && (a.stock.mode === 'out' || a.stock.mode === 'return' || a.stock.mode === 'both')) o.stock = { mode: a.stock.mode, kind: a.stock.kind === 'serial' || a.stock.kind === 'qty' ? a.stock.kind : '', items: a.stock.items || [] }; if (a.pq === 'high' || a.pq === 'max') o.pq = a.pq; if (a.code) o.code = String(a.code).toUpperCase(); if (a.tg) o.tg = a.tg;
  { const sl = Array.isArray(a.subs) ? a.subs.map(String) : (a.sub ? [String(a.sub)] : []), su = sl.filter((x, i) => sl.indexOf(x) === i); if (su.length && !(su.length === 1 && su[0] === '')) o.subs = su; }      // sub categories it appears under ('' = also stand-alone)
  if (+a.minPh > 0) o.minPh = Math.min(MAX_PHOTOS, Math.floor(+a.minPh));
  o.f = {}; FIELD_KEYS.forEach(k => { const v = a.f ? Number(a.f[k]) : NaN; o.f[k] = (v === 0 || v === 1 || v === 2) ? v : legacyLevel(cat, a, k); if (YN_KEYS.includes(k)) o.f[k] = o.f[k] ? 1 : 0; });
  if (o.minPh && !o.f.photo) o.f.photo = 1;
  if (Array.isArray(a.custom) && a.custom.length) o.custom = a.custom;
  if (Array.isArray(a.ord) && a.ord.length) o.ord = a.ord.map(x => String(x).slice(0, 40)).filter((x, i, l) => x && l.indexOf(x) === i).slice(0, 60);
  return o;
}
const normCat = list => list.map(t => ({ name: t.name, code: t.code, icon: /^[a-z0-9-]{1,30}$/.test(String(t.icon || '')) ? t.icon : '', subs: (Array.isArray(t.subs) ? t.subs : (t.subs === undefined && (DEFAULT_CATALOG.find(d => d.name === t.name) || {}).subs) || []).map(s => { const r = { n: s.n, code: s.code }; if (s.f && typeof s.f === 'object') { const f = {}; FIELD_KEYS.forEach(k => { if ([0, 1, 2].includes(s.f[k])) f[k] = s.f[k]; }); if (Object.keys(f).length) r.f = f; } if (+s.minPh > 0) r.minPh = Math.min(MAX_PHOTOS, Math.floor(+s.minPh)); return r; }), acts: (t.acts || []).map(a => normAct(t, a)) }));
/** QR only: a 9-digit number is an account number, a 15-digit one is a MID. POS MIDs start with 2, SB MIDs with 6. */
function midLabelFor(type, v) { return /^qr$/i.test(type || '') && /^\d{9}$/.test(String(v || '').replace(/\s/g, '')) ? 'Account number' : 'MID'; }
function midPrefix(type) { const t = typeDef(type), k = String((t && t.code) || type || '').toUpperCase(), n = String(type || '').toUpperCase(); return k === 'POS' || n === 'POS' ? '2' : (k === 'SB' || n === 'SB' ? '6' : ''); }
function refreshMidLabel(inp, type) { const w = inp.closest('[data-fk="mid"]'), t = w && $('.mid-t', w); if (t) t.textContent = midLabelFor(type, inp.value); }
document.addEventListener('input', e => { if (e.target.matches && e.target.matches('.f-mid')) refreshMidLabel(e.target, curType); else if (e.target.id === 'eMid') refreshMidLabel(e.target, window._eType); });
/** Every toggle starts at No (off): used for a new merchant card and whenever the activity changes. */
function resetToggles(el) { $$('.yn-row input', el).forEach(i => { if (i.checked) { i.checked = false; syncYn(i); } }); }
function syncYn(inp) { const row = inp.closest('.yn-row'); if (!row) return; row.classList.toggle('on', inp.checked); const t = $('.yn-t', row); if (t) t.textContent = inp.checked ? 'Yes' : 'No'; }
document.addEventListener('change', e => { if (e.target.matches && e.target.matches('.yn-row input')) syncYn(e.target); });
const lvl = (d, k) => (d && d.f && d.f[k]) || 0;
const isReq = (d, k) => lvl(d, k) === 2;
let CATALOG = DEFAULT_CATALOG, TYPES = [], ACTIVITIES = {};
const typeDef = n => CATALOG.find(t => t.name === n) || null;
/** Activities named like Deployment / Removal need no stock setup: staff pick the item type themselves (an admin stock rule, if set, wins). */
const freeStock = n => /liabil/i.test(n) ? { mode: 'out', kind: '', items: [], free: true, liab: true } : /remov/i.test(n) ? { mode: 'return', kind: '', items: [], free: true, auto: true } : /return|terminat/i.test(n) ? { mode: 'return', kind: '', items: [], auto: true } : /deploy/i.test(n) ? { mode: 'out', kind: '', items: [], free: true } : /replac/i.test(n) ? { mode: 'both', kind: '', items: [], auto: true } : /install/i.test(n) ? { mode: 'out', kind: '', items: [], auto: true } : null;
const actDef = (t, a) => { const d = typeDef(t); const x = d ? (d.acts.find(y => y.n === a) || null) : null; if (!x || x.stock || !x.autoStock) return x; const fs = freeStock(x.n); return fs ? Object.assign({}, x, { stock: fs }) : x; };
const actSubs = a => (a && a.subs && a.subs.length) ? a.subs : [''];      // the sub categories an activity appears under; [''] = not linked to any (category without links)
/** Once any activity is linked to a sub category, every activity belongs to at least one: unlinked ones appear under all sub categories (there is no stand-alone group). */
function allocSubs(t) {
  const names = (t.subs || []).map(x => x.n).filter(Boolean);
  t.acts.forEach(a => { if (a.subs) { a.subs = a.subs.filter(x => x && names.includes(x)); if (!a.subs.length) delete a.subs; } });
  if (names.length && t.acts.some(a => a.subs && a.subs.length)) t.acts.forEach(a => { if (!a.subs || !a.subs.length) a.subs = names.slice(); });
  return t;
}
/** The activity as it behaves under a sub category: that sub category's box rules (admin) win over the activity's own. */
function effDef(t, a, sub) {
  const d = actDef(t, a), td = typeDef(t), sd = sub && td && td.subs ? td.subs.find(s => s.n === sub) : null;
  if (!d || !sd || (!sd.f && !sd.minPh)) return d;
  const o = Object.assign({}, d, { f: Object.assign({}, d.f, sd.f || {}) });
  if (sd.minPh > 0) o.minPh = sd.minPh;
  if (o.minPh && !o.f.photo) o.f.photo = 1;
  return o;
}
const isInstall = (t, a) => { const d = actDef(t, a); return d ? !!d.inst : (a === 'Installation' || a === 'New Install'); };
const dateLabel = (a, t) => !a ? 'Installed / action date' : (isInstall(t || curType, a) ? 'Installed date' : 'Action date');
const BIZ_TYPES = ['Restaurant', 'Cafe', 'Mini mart', 'Grocery store', 'Health and Fitness', 'Education', 'Massage / Spa', 'Construction Material', 'Financial / Consultant', 'Supermarket', 'Pharmacy', 'Clothing shop', 'Beauty / Salon', 'Hotel / Guesthouse', 'Gas station', 'Electronics', 'Bakery', 'Others'];
const TAB_ICONS = { 'QR': 'bi-qr-code', 'POS': 'bi-credit-card-2-front', 'SB': 'bi-speaker', 'Payway Inspection': 'bi-clipboard2-check' };
const CAT_ICONS = ['qr-code', 'credit-card-2-front', 'speaker', 'clipboard2-check', 'grid', 'shop', 'bag', 'box-seam', 'cart', 'wallet2', 'phone', 'tools', 'wrench', 'house-door', 'building', 'geo-alt', 'truck', 'star', 'heart', 'lightning', 'cup-hot', 'lamp', 'tag', 'person-badge', 'gift', 'printer', 'wifi', 'cash-coin', 'patch-check', 'calendar-check'];
const iconOf = n => { const d = CATALOG.find(t => t.name === n); return d && d.icon ? 'bi-' + d.icon : (TAB_ICONS[n] || 'bi-grid'); };
const shortName = n => n === 'Payway Inspection' ? 'Payway' : n;
let curType = (function () { try { return localStorage.getItem('it_type') || 'QR'; } catch (e) { return 'QR'; } })();
const SUB_NONE = '__none__';      // report filter value: records without a sub category
function actInSub(t, a, fs) { return !fs || !isLinked(t) || (fs === SUB_NONE ? actSubs(a).includes('') : actSubs(a).includes(fs)); }
function setCatalog(c) {
  if (!Array.isArray(c) || !c.length) c = DEFAULT_CATALOG;
  c = normCat(c).map(allocSubs);
  CATALOG = c; TYPES = c.map(t => t.name); ACTIVITIES = {};
  c.forEach(t => { ACTIVITIES[t.name] = t.acts.map(a => a.n); });
  if (!TYPES.includes(curType)) curType = TYPES[0];
  const tabs = $('#typeTabs');
  tabs.classList.remove('scroll'); tabs.classList.add('fit'); tabs.classList.toggle('stack', TYPES.length > 4);
  tabs.style.setProperty('--tf', TYPES.length <= 4 ? '.92rem' : TYPES.length <= 5 ? '.76rem' : TYPES.length <= 7 ? '.68rem' : '.6rem');
  tabs.innerHTML = TYPES.map(t => '<button type="button" data-type="' + esc(t) + '"><i class="bi ' + iconOf(t) + '"></i><span class="tl">' + esc(shortName(t)) + '</span></button>').join('');
  $$('#typeTabs button').forEach(b => b.classList.toggle('active', b.dataset.type === curType));
  if (typeof fillTypeSlicer === 'function') { fillTypeSlicer(); fillSubFilter(); fillActivityFilter(); }
  try { localStorage.setItem('it_catalog', JSON.stringify(c)); } catch (e) {}
}
(function () { let c = null; try { c = JSON.parse(localStorage.getItem('it_catalog')); } catch (e) {} setCatalog(c); })();

/** Rebuilds a card's activity buttons for the current tab (keeps the choice if still valid). */
/** Linked mode: once an activity is linked to a sub category, each sub category (and "General") shows only its own activities. */
function isLinked(t) { return !!(t && t.subs && t.subs.length && t.acts.some(a => a.subs && a.subs.some(Boolean))); }
const actsFor = type => { const t = typeDef(type); return !t ? [] : isLinked(t) ? t.acts.filter(a => actSubs(a).includes(S.sub || '')).map(a => a.n) : t.acts.map(a => a.n); };
const actKey = () => curType + (isLinked(typeDef(curType)) ? '|' + (S.sub || '') : '');
function fillActivities(card) {
  const list = actsFor(curType), keep = $('.f-act', card.el).value, single = list.length === 1;
  $('.act-chips', card.el).innerHTML = list.map(a => '<button type="button" class="chip" data-a="' + esc(a) + '">' + esc(a) + '</button>').join('');
  show($('.act-wrap', card.el), !single);
  setAct(card, list.includes(keep) ? keep : (single ? list[0] : startAct(card, list)));
}
/* Merchants 2-10 start on merchant 1's activity and follow it until you pick their own; the first card starts on the activity used last time. */
const lastActs = (() => { try { return JSON.parse(localStorage.getItem('it_last_act') || '{}') || {}; } catch (e) { return {}; } })();
function startAct(card, list) {
  const first = S.cards[0];
  if (first && first !== card) { if (card.own) return ''; const v = $('.f-act', first.el).value; return list.includes(v) ? v : ''; }
  return list.includes(lastActs[actKey()]) ? lastActs[actKey()] : '';
}
function followFirst() {
  const first = S.cards[0]; if (!first) return;
  const v = $('.f-act', first.el).value, list = actsFor(curType);
  S.cards.slice(1).forEach(c => { if (!c.own && list.includes(v) && $('.f-act', c.el).value !== v) setAct(c, v); });
}
/* Sub category (QR: Installation, Refreshment ...): one choice for the whole submit, remembered for next time. */
const lastSubs = (() => { try { return JSON.parse(localStorage.getItem('it_last_sub') || '{}') || {}; } catch (e) { return {}; } })();
function subOptions() {
  const t = typeDef(curType) || {}, subs = t.subs || [], o = subs.map(s => ({ n: s.n, name: s.n, code: s.code }));
  return o;
}
const sessSubs = {};      // linked categories: the sub category used earlier in this visit (a fresh visit starts on the stand-alone activities)
function fillSubs() {
  const t = typeDef(curType) || {}, opts = subOptions();
  show($('#subWrap'), (t.subs || []).length > 0);
  if (!opts.some(o => o.n === S.sub)) { const lk = isLinked(t), r = lk ? sessSubs[curType] : lastSubs[curType]; S.sub = opts.some(o => o.n === r) ? r : (lk && opts.length ? opts[0].n : null); }
  $('#subChips').style.setProperty('--sc', opts.length <= 4 ? Math.max(1, opts.length) : opts.length <= 6 ? 3 : 4);      // equal-width tabs; more than 4 wrap onto a second row
  $('#subChips').innerHTML = opts.map(o => '<button type="button" class="' + (o.n === S.sub ? 'active' : '') + '" role="tab" aria-selected="' + (o.n === S.sub) + '" data-s="' + esc(o.n) + '">' + esc(o.name) + (o.code ? ' <span class="sc">' + esc(o.code) + '</span>' : '') + '</button>').join('');
}
$('#subChips').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; S.sub = b.dataset.s;
  $$('#subChips button').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', x === b); });
  if (isLinked(typeDef(curType))) { S.cards.forEach(fillActivities); followFirst(); }
  else S.cards.forEach(c => { const a = $('.f-act', c.el).value; if (a) setAct(c, a); });      // this sub category's box rules apply right away
  updateLocCard(); S.cards.forEach(qcSync);
});
/* Tag and Zone/Area stay filled after a submit (they rarely change within a day). */
const keep = (() => { try { return JSON.parse(localStorage.getItem('it_keep') || '{}') || {}; } catch (e) { return {}; } })();
function rememberAct(a) {
  lastActs[actKey()] = a; if (S.sub != null) { lastSubs[curType] = S.sub; sessSubs[curType] = S.sub; }
  try { localStorage.setItem('it_last_act', JSON.stringify(lastActs)); localStorage.setItem('it_last_sub', JSON.stringify(lastSubs)); localStorage.setItem('it_keep', JSON.stringify(keep)); } catch (e) {}
}
/** Product type buttons come from the category names (QR, POS, SB ...). */
function fillPtypeChips(card) {
  $('.ptype-chips', card.el).innerHTML = TYPES.map(t => '<button type="button" class="chip" data-t="' + esc(t) + '">' + esc(t) + '</button>').join('');
  syncPtype(card.el);
}
function syncPtype(el) {
  const picked = $('.f-ptype', el).value.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);       // several product types can be chosen: "QR, POS"
  $$('.ptype-chips .chip', el).forEach(b => b.classList.toggle('active', picked.includes(b.dataset.t.toLowerCase())));
}
/** District from the current location (the address lookup), unless the staff typed their own. One box under the location, used for every merchant. */
function fillCommuneAll(force, clear) {
  const c = (geo.place && geo.place.district) || ''; if (!c && !clear) return;
  const i = $('#fDistrict'); if (force || !i.dataset.touched) i.value = c;      // clear = the place changed: drop the old, now wrong, value
}
$('#fDistrict').addEventListener('input', e => { e.target.dataset.touched = '1'; });
$('#distFill').addEventListener('click', async () => {
  if (!geo.pos) await refreshGeo(8000);
  try { await geo.lookup; } catch (e) {}
  const c = geo.place && geo.place.district, i = $('#fDistrict');
  if (c) { i.value = c; delete i.dataset.touched; } else toast('No district found for this location. Type it.', 'warning');
});
function syncBtype(el) {
  const v = $('.f-btype', el).value.trim().toLowerCase();
  $$('.btype-chips .chip', el).forEach(b => b.classList.toggle('active', b.dataset.t.toLowerCase() === v));
}
const PHONE_RE = /^[0-9+\-\s()]{6,20}$/;
/** HTML of one admin-added box: text / number / phone / date / serial (with scan) / drop-down / tick boxes. */
/** A spin number starts at zero (or at its lowest value when zero is outside its range). */
const spinDef = f => { const mn = f.min == null ? 0 : +f.min, mx = f.max == null ? 100 : +f.max; return 0 >= mn && 0 <= mx ? 0 : mn; };
function customFieldHtml(f) {
  const lab = '<label class="form-label">' + esc(f.label) + (f.req ? ' <span class="rq">*</span>' : '') + '</label>';
  if (f.kind === 'select') return '<div class="mb-3">' + lab + '<select class="form-select" data-fid="' + esc(f.id) + '" data-kind="select"><option value="">Select…</option>' +
    (f.opts || []).map(o => '<option value="' + esc(o) + '">' + esc(o) + '</option>').join('') + '</select></div>';
  if (f.kind === 'info') return '<div class="mb-3 info-lbl">' + (f.label ? '<div class="fw-semibold">' + esc(f.label) + '</div>' : '') + '<div class="small" style="white-space:pre-wrap">' + esc(f.text || '') + '</div></div>';
  if (f.kind === 'toggle') return '<div class="yn-row" data-fid="' + esc(f.id) + '" data-kind="toggle"><label class="form-check-label">' + esc(f.label) + '</label><div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" role="switch" aria-label="' + esc(f.label) + '"><span class="yn-t small fw-semibold">No</span></div></div>';
  const vert = cfDir(f) === 'v';
  if (f.kind === 'radio') return '<div class="mb-3">' + lab + '<div class="chips' + (vert ? ' opt-v' : '') + '" data-fid="' + esc(f.id) + '" data-kind="radio">' +
    (f.opts || []).map(o => '<button type="button" class="chip rc-chip" data-v="' + esc(o) + '">' + esc(o) + '</button>').join('') + '</div></div>';
  if (f.kind === 'check') return '<div class="mb-3">' + lab + '<div data-fid="' + esc(f.id) + '" data-kind="check">' +
    (f.opts || []).map(o => '<div class="form-check' + (vert ? '' : ' form-check-inline') + '"><label class="form-check-label"><input class="form-check-input" type="checkbox" value="' + esc(o) + '"> ' + esc(o) + '</label></div>').join('') + '</div></div>';
  if (f.kind === 'spin' && vert) return '<div class="mb-3">' + lab + '<div class="spin spin-v" data-fid="' + esc(f.id) + '" data-kind="spin" data-min="' + (f.min == null ? 0 : f.min) + '" data-max="' + (f.max == null ? 100 : f.max) + '" data-step="' + (f.step || 1) + '">' +
    '<button type="button" class="btn btn-soft spin-up" aria-label="More"><i class="bi bi-plus-lg"></i></button><input class="form-control text-center spin-in" inputmode="decimal" autocomplete="off" value="' + spinDef(f) + '" placeholder="' + (f.min == null ? 0 : f.min) + ' – ' + (f.max == null ? 100 : f.max) + '">' +
    '<button type="button" class="btn btn-soft spin-dn" aria-label="Less"><i class="bi bi-dash-lg"></i></button></div></div>';
  if (f.kind === 'spin') return '<div class="mb-3">' + lab + '<div class="input-group spin" style="max-width:220px" data-fid="' + esc(f.id) + '" data-kind="spin" data-min="' + (f.min == null ? 0 : f.min) + '" data-max="' + (f.max == null ? 100 : f.max) + '" data-step="' + (f.step || 1) + '">' +
    '<button type="button" class="btn btn-soft spin-dn" aria-label="Less"><i class="bi bi-dash-lg"></i></button><input class="form-control text-center spin-in" inputmode="decimal" autocomplete="off" value="' + spinDef(f) + '" placeholder="' + (f.min == null ? 0 : f.min) + ' – ' + (f.max == null ? 100 : f.max) + '">' +
    '<button type="button" class="btn btn-soft spin-up" aria-label="More"><i class="bi bi-plus-lg"></i></button></div></div>';
  const t = f.kind === 'date' ? 'date' : (f.kind === 'phone' ? 'tel' : 'text'), im = f.kind === 'number' ? 'decimal' : (f.kind === 'phone' ? 'tel' : 'text');
  const inp = '<input class="form-control" data-fid="' + esc(f.id) + '" data-kind="' + f.kind + '" type="' + t + '" inputmode="' + im + '" autocomplete="off"' + (f.kind === 'serial' ? ' autocapitalize="characters"' : '') + '>';
  return '<div class="mb-3">' + lab + (f.kind === 'serial' ? '<div class="input-group">' + inp + '<button type="button" class="btn btn-soft btn-sn" aria-label="Scan barcode"><i class="bi bi-upc-scan"></i></button></div>' : inp) + '</div>';
}
document.addEventListener('click', e => {      // spin number bar: - / +
  const b = e.target.closest('.spin-dn, .spin-up'); if (!b) return;
  const w = b.closest('.spin'), i = $('.spin-in', w), mn = +w.dataset.min, mx = +w.dataset.max, st = +w.dataset.step || 1, cur = parseFloat(i.value);
  let v = isNaN(cur) ? mn : cur + (b.classList.contains('spin-up') ? st : -st);
  v = Math.min(mx, Math.max(mn, Math.round(v * 1e6) / 1e6)); i.value = v;
});
document.addEventListener('click', e => {      // option buttons: pick one, tap again to clear
  const b = e.target.closest('.rc-chip'); if (!b) return;
  const on = !b.classList.contains('active'); $$('.rc-chip', b.parentNode).forEach(x => x.classList.remove('active')); b.classList.toggle('active', on);
});
/** Value of an extra box: text, or an array of ticked values for tick boxes. */
function customVal(el) {
  if (el.dataset.kind === 'radio') { const a = $('.rc-chip.active', el); return a ? a.dataset.v : ''; }
  if (el.dataset.kind === 'spin') return String($('.spin-in', el).value || '').trim();
  if (el.dataset.kind === 'toggle') return $('input', el).checked ? 'Yes' : 'No';
  return el.dataset.kind === 'check' ? $$('input:checked', el).map(i => i.value) : String(el.value || '').trim();
}
function setCustomVal(el, v) {
  if (el.dataset.kind === 'radio') { $$('.rc-chip', el).forEach(b => b.classList.toggle('active', b.dataset.v === (Array.isArray(v) ? v[0] : v))); return; }
  if (el.dataset.kind === 'spin') { const sv = Array.isArray(v) ? v[0] : v; $('.spin-in', el).value = sv == null || sv === '' ? (+el.dataset.min <= 0 && +el.dataset.max >= 0 ? 0 : el.dataset.min) : sv; return; }
  if (el.dataset.kind === 'toggle') { const i = $('input', el); i.checked = /^yes$/i.test(String(Array.isArray(v) ? v[0] : (v == null ? '' : v))); syncYn(i); return; }
  if (el.dataset.kind === 'check') { const set = Array.isArray(v) ? v : String(v || '').split(', '); $$('input', el).forEach(i => { i.checked = set.includes(i.value); }); }
  else el.value = Array.isArray(v) ? v[0] || '' : (v == null ? '' : v);
}
/** (Re)draws the admin-added boxes inside box, keeping what was typed. */
function renderCustom(box, d) {
  const old = {}; $$('[data-fid]', box).forEach(i => { old[i.dataset.fid] = customVal(i); });
  const list = (d && d.custom) || [];
  box.innerHTML = list.map(customFieldHtml).join('');
  $$('[data-fid]', box).forEach(i => { if (old[i.dataset.fid] != null) setCustomVal(i, old[i.dataset.fid]); });
  show(box, list.length > 0);
}
/* ---- Order of the boxes on the form: the admin can move boxes up / down per activity (a.ord = list of keys). Not set = the built-in order. ---- */
const CARD_ORDER = ['merchant', 'mid', 'tid', 'integ', 'sim', 'standee', 'business', 'serial', 'oldSn', 'newSn', 'btype', 'ptype', 'hours', 'group', 'zone', 'phone', 'tag', 'qc', 'custom', 'stock', 'remarks', 'photo'];
/** The boxes of an activity in the order the form shows them: [{ k: key, n: name }]. */
function ordList(a, t) {
  const cf = (a.custom || []).filter(f => f.id), base = [];
  CARD_ORDER.forEach(k => {
    if (k === 'custom') cf.forEach(f => base.push({ k: 'x:' + f.id, n: (f.label || (f.kind === 'info' ? 'Info text' : 'New field')) + ' (field)' }));
    else if (k === 'qc') { if (t && qcEff(t.name, a)) base.push({ k, n: 'QR materials & scan' }); }
    else if (k === 'stock') { if (a.stock) base.push({ k, n: 'Stock items' }); }
    else if (lvl(a, k) > 0) base.push({ k, n: FIELD_NAMES[k] });
  });
  const pos = {}; (a.ord || []).forEach((k, i) => { pos[k] = i; });
  return base.map((x, i) => ({ x, r: x.k in pos ? pos[x.k] : 1000 + i })).sort((p, q) => p.r - q.r).map(p => p.x);
}
/** Puts the boxes of one merchant card in the admin's order (nothing changes when no order is set). */
function applyOrder(root, d) {
  const ord = d && Array.isArray(d.ord) && d.ord.length ? d.ord : null;
  root.classList.toggle('ordered', !!ord);
  const kids = Array.from(root.children).concat(Array.from($('.custom-wrap', root).children));
  kids.forEach(el => { el.style.order = ''; });
  if (!ord) return;
  const pos = {}; ord.forEach((k, i) => { pos[k] = i; });
  const at = (k, dflt) => (k in pos ? pos[k] : dflt);
  Array.from(root.children).forEach((el, i) => {
    const fk = el.dataset && el.dataset.fk;
    if (fk) el.style.order = at(fk, 1000 + i);
    else if (el.classList.contains('qc-wrap')) el.style.order = at('qc', 1000 + i);
    else if (el.classList.contains('stock-wrap')) el.style.order = at('stock', 1000 + i);
    else if (!el.classList.contains('custom-wrap')) el.style.order = -1;        // head, activity, date stay on top
  });
  (d.custom || []).forEach((f, i) => { const el = $('.custom-wrap', root).children[i]; if (el) el.style.order = at('x:' + f.id, 1000 + i); });
}
/** The same admin order in the Edit window. */
function applyOrderEdit(d) {
  const root = $('#editModal .modal-body'); if (!root) return;
  const ord = d && Array.isArray(d.ord) && d.ord.length ? d.ord : null;
  root.classList.toggle('ordered', !!ord);
  const kids = Array.from(root.children), cust = $('#eCustom') ? Array.from($('#eCustom').children) : [];
  kids.concat(cust).forEach(el => { el.style.order = ''; });
  if (!ord) return;
  const pos = {}; ord.forEach((k, i) => { pos[k] = i; });
  const at = (k, dflt) => (k in pos ? pos[k] : dflt);
  const isF = el => (el.dataset && el.dataset.fk) || el.id === 'eCustom';
  const first = kids.findIndex(isF), last = kids.length - 1 - kids.slice().reverse().findIndex(isF);
  kids.forEach((el, i) => {
    if (el.id === 'eCustom') return;
    if (el.dataset && el.dataset.fk) el.style.order = at(el.dataset.fk, 1000 + i);
    else el.style.order = i < first ? -1 : (i > last ? 5000 + i : 1000 + i);
  });
  (d.custom || []).forEach((f, i) => { if (cust[i]) cust[i].style.order = at('x:' + f.id, 1000 + i); });
}
/** Shows only the boxes the activity needs (data-fk="key") and puts the red * on the must-fill ones. */
function applyLevels(root, d) {
  $$('.f-mid', root).forEach(i => refreshMidLabel(i, curType));
  FIELD_KEYS.forEach(k => $$('[data-fk="' + k + '"]', root).forEach(w => { show(w, lvl(d, k) > 0); $$('.rq', w).forEach(x => show(x, lvl(d, k) === 2)); }));
  const mp = lvl(d, 'photo') ? ((d.minPh || 0) > 0 ? d.minPh : (lvl(d, 'photo') === 2 ? DEFAULT_MIN_PH : 0)) : 0;       // the admin's minimum number of photos / videos (2 when Photos is required and none is set)
  $$('[data-fk="photo"]', root).forEach(w => { if (mp) $$('.rq', w).forEach(x => show(x, true)); const pm = $('.ph-min', w); if (pm) { pm.textContent = mp > 1 ? '(at least ' + mp + ')' : ''; show(pm, mp > 1); } });
}
/* ---- Stock lines on the activity form (activities that take items out of stock, or take them back) ---- */
S.stockItems = []; S.stockAlert = null;
async function loadStockItems() { try { const r = await api('getStockItems', S.token); S.stockItems = r.items || []; S.stockAlert = r.alert; } catch (e) { S.stockItems = []; } }
const stkAllowed = d => S.stockItems.filter(it => (!d.stock.kind || d.stock.kind === it.kind) && (!d.stock.items.length || d.stock.items.some(n => n.toLowerCase() === it.name.toLowerCase())));
const stkDirOf = (rule, l) => rule.mode === 'return' ? 'return' : 'out';      // S/Ns going out or coming back are read from the S/N boxes by the system; the box here is only for quantities (and the free Deployment box)
const stkKind = n => (S.stockItems.find(x => x.name === n) || {}).kind;
/* Serial numbers need no stock box: the S/N is scanned or typed in its box and the system finds it in stock. The box is only for quantity items and for things taken back. */
const stkQtyItems = d => stkAllowed(d).filter(it => it.kind === 'qty');
const stkNeedsBox = d => !!(d && d.stock && (d.stock.free || (d.stock.mode !== 'return' && stkQtyItems(d).length)));
function stkNewLine(rule, items, mode) {
  if (rule.free) { const it = items.filter(x => x.kind === 'serial')[0] || items[0]; return { item: it ? it.name : '', dir: rule.mode, kind: it ? it.kind : 'serial', sn: '', qty: 1, cond: '', reason: '' }; }
  const dir = 'out', it = items.filter(x => x.kind === 'qty'); return { item: it[0] ? it[0].name : '', dir, sn: '', qty: 1, cond: '', reason: '' }; }
function renderStockBox(card, d) {
  const box = $('.stock-wrap', card.el), rule = d && d.stock;
  if (!rule || !stkNeedsBox(d)) { card.stock = []; card.stockMode = rule ? rule.mode : ''; box.innerHTML = ''; show(box, false); return; }
  if (card.stockMode !== rule.mode) card.stock = [];
  card.stockMode = rule.mode;
  const items = stkAllowed(d), req = false;
  if (rule.free && !card.stock.length && items.length) card.stock.push(stkNewLine(rule, items, rule.mode));
  const title = rule.liab ? 'Items given to the merchant (lost / damaged) *' : rule.free ? (rule.mode === 'return' ? 'Items removed (battery, charger, SIM ...)' : 'Items deployed') : 'Items used (quantity)';
  box.innerHTML = '<label class="form-label"><i class="bi bi-box-seam me-1"></i>' + title + (req ? ' <span class="rq">*</span>' : '') + '</label>' +
    card.stock.map((l, i) => {
      const dir = stkDirOf(rule, l), out = dir === 'out', its = rule.free ? items.filter(x => x.kind === (l.kind || 'serial')) : out ? items.filter(x => x.kind === 'qty') : items, serial = stkKind(l.item) !== 'qty';
      return '<div class="stk-line" data-li="' + i + '">' +
        (rule.free ? '<div class="chips mb-1">' + [['serial', 'With S/N'], ['qty', 'No S/N']].map(c => '<button type="button" class="chip stk-kind' + ((l.kind || 'serial') === c[0] ? ' active' : '') + '" data-k="' + c[0] + '">' + c[1] + '</button>').join('') + '</div>' : '') +
        '<div class="d-flex gap-2 mb-1"><select class="form-select form-select-sm stk-item">' + its.map(it => '<option' + (it.name === l.item ? ' selected' : '') + '>' + esc(it.name) + '</option>').join('') + '</select>' +
        '<button type="button" class="btn btn-sm btn-outline-danger border-0 stk-del" aria-label="Remove"><i class="bi bi-x-lg"></i></button></div>' +
        (serial ? '<div class="input-group input-group-sm"><input class="form-control stk-sn" placeholder="Serial number (scan or type)" value="' + esc(l.sn) + '" autocomplete="off" style="text-transform:uppercase"><button type="button" class="btn btn-soft btn-sn" aria-label="Scan barcode"><i class="bi bi-upc-scan"></i></button></div>'
                : '<div class="d-flex align-items-center gap-2"><span class="small">Quantity</span><input type="number" min="1" max="9999" class="form-control form-control-sm stk-qty" style="max-width:100px" value="' + (l.qty || 1) + '"></div>') +
        (out ? '' : '<input class="form-control form-control-sm mt-2 stk-reason" maxlength="100" placeholder="Note (optional): condition, why it comes back" value="' + esc(l.reason) + '">') + '</div>';
    }).join('') + '<button type="button" class="btn btn-soft btn-sm stk-add"><i class="bi bi-plus-lg me-1"></i>Add item</button>';
  show(box, true);
}
$('#merchantList').addEventListener('click', e => {
  const w = e.target.closest('.stock-wrap'); if (!w) return;
  const card = S.cards.find(c => c.el.contains(w)); if (!card) return;
  const ln = e.target.closest('[data-li]'), li = ln ? +ln.dataset.li : -1, d = effDef(curType, $('.f-act', card.el).value, S.sub || '');
  if (e.target.closest('.stk-del')) { card.stock.splice(li, 1); renderStockBox(card, d); }
  else if (e.target.closest('.stk-add')) { card.stock.push(stkNewLine(d.stock, stkAllowed(d), 'out')); renderStockBox(card, d); }
  else if (e.target.closest('.stk-kind')) { const l = card.stock[li]; l.kind = e.target.closest('.stk-kind').dataset.k; l.item = (stkAllowed(d).filter(x => x.kind === l.kind)[0] || {}).name || ''; l.sn = ''; l.qty = 1; renderStockBox(card, d); }
  else if (e.target.closest('.stk-dir')) { const l = card.stock[li]; l.dir = e.target.closest('.stk-dir').dataset.d; const its = stkAllowed(d).filter(x => l.dir === 'out' ? x.kind === 'qty' : true); l.item = (its[0] || {}).name || ''; l.sn = ''; l.cond = ''; renderStockBox(card, d); }
});
$('#merchantList').addEventListener('input', e => {
  const w = e.target.closest('.stock-wrap'); if (!w) return;
  const card = S.cards.find(c => c.el.contains(w)), ln = e.target.closest('[data-li]'); if (!card || !ln) return;
  const l = card.stock[+ln.dataset.li];
  if (e.target.classList.contains('stk-sn')) l.sn = e.target.value.toUpperCase().replace(/\s+/g, '');
  else if (e.target.classList.contains('stk-qty')) l.qty = Math.floor(+e.target.value) || 0;
  else if (e.target.classList.contains('stk-reason')) l.reason = e.target.value;
});
$('#merchantList').addEventListener('change', e => {
  if (!e.target.classList.contains('stk-item')) return;
  const card = S.cards.find(c => c.el.contains(e.target)), ln = e.target.closest('[data-li]'); if (!card || !ln) return;
  const l = card.stock[+ln.dataset.li]; l.item = e.target.value; l.sn = ''; renderStockBox(card, effDef(curType, $('.f-act', card.el).value, S.sub || ''));
});
/** Selects an activity: highlights it and shows the extra boxes it needs (phone/tag, old/new S/N). */
function setAct(card, a) {
  const changed = $('.f-act', card.el).value !== a;
  $('.f-act', card.el).value = a;
  $$('.act-chips .chip', card.el).forEach(b => b.classList.toggle('active', b.dataset.a === a));
  const d = effDef(curType, a, S.sub || '');
  applyLevels(card.el, d);
  { // the small Scan / Upload QR buttons sit beside the first QR-related box this activity shows (merchant name, else MID, else TID)
    const first = ['merchant', 'mid', 'tid'].find(k => lvl(d, k) > 0), tools = $('.qr-tools', card.el);
    if (first) { $('[data-fk="' + first + '"] .qr-slot', card.el).appendChild(tools); }
    show(tools, !!first);
  }
  show($('.act-hint', card.el), !d);
  renderCustom($('.custom-wrap', card.el), d);
  renderStockBox(card, d);
  applyOrder(card.el, d);
  if (changed) resetToggles(card.el);      // every toggle starts at No
  updateDateLabel(card); updateLocCard(); fillCommuneAll(); qcSync(card);
}
/** The location card is shown while some merchant card still needs a location (admin: Location box = optional or must). */
function updateLocCard() {
  const ds = S.cards.map(c => { const a = $('.f-act', c.el).value; return a ? effDef(curType, a, S.sub || '') : null; });
  const needLoc = ds.some(d => !d || lvl(d, 'location') > 0), needDist = ds.some(d => d && lvl(d, 'commune') > 0);
  show($('#locCard'), needLoc || needDist); show($('#locRow'), needLoc); show($('#distWrap'), needDist);
  show($('#locStar'), ds.some(d => d && lvl(d, 'location') === 2));
  show($('#distStar'), ds.some(d => d && lvl(d, 'commune') === 2));
}
function updateDateLabel(card) {
  $('.date-lbl', card.el).textContent = dateLabel($('.f-act', card.el).value);
}
/** Applies the current tab to one card: its activity list (the boxes follow the chosen activity). */
function applyType(card) {
  fillActivities(card); fillPtypeChips(card);
}
function setType(t) {
  if (!TYPES.includes(t)) t = TYPES[0];
  curType = t;
  try { localStorage.setItem('it_type', t); } catch (e) {}
  $$('#typeTabs button').forEach(b => b.classList.toggle('active', b.dataset.type === t));
  $$('.ty').forEach(el => { el.textContent = t; });
  fillSubs(); S.cards.forEach(applyType);
  const sb = $('#submitBtn');
  if (sb && !sb.disabled) sb.innerHTML = '<i class="bi bi-send me-1"></i>Submit ' + t + ' records';
}

// Paste your Apps Script Web app URL (ends with /exec) here:
const API_URL = 'https://script.google.com/macros/s/AKfycbytu3ct8u_JOTkHqhjMnnAd2M8i8yvu-5U1D2TQlz1nvOgmOiM2ZVgEiw6NBHhUwhPP/exec';

async function api(fn, ...args) {
  let json;
  try {
    // No Content-Type header on purpose: keeps it a "simple" request, so no CORS preflight.
    const res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ fn, args }), redirect: 'follow' });
    json = await res.json();
  } catch (e) {
    const ne = new Error('Cannot reach the server. Check your connection and API_URL.'); ne.net = true; throw ne;
  }
  if (!json.ok) {
    const msg = String(json.error || 'Unknown error');
    if (msg.includes('SESSION_EXPIRED')) { logout(true); throw new Error('Session expired. Please sign in again.'); }
    throw new Error(msg.replace(/^Error:\s*/, ''));
  }
  return json.data;
}

function toast(msg, type = 'dark') {
  const el = document.createElement('div');
  el.className = 'toast align-items-center text-bg-' + type + ' border-0';
  el.innerHTML = '<div class="d-flex"><div class="toast-body">' + esc(msg) + '</div><button class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>';
  $('#toasts').appendChild(el);
  const t = new bootstrap.Toast(el, { delay: 3200 });
  el.addEventListener('hidden.bs.toast', () => el.remove());
  t.show();
}

function busy(btn, on, label) {
  if (on) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>' + (label || 'Please wait…'); }
  else { btn.disabled = false; btn.innerHTML = btn.dataset.html || btn.innerHTML; }
}

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

/* ============================ Theme (light / dark) ============================ */
const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function isDark() {
  const t = document.documentElement.getAttribute('data-theme');
  return t ? t === 'dark' : !!(darkQuery && darkQuery.matches);
}
function applyTheme() {
  const dark = isDark();
  $$('.theme-toggle i').forEach(i => { i.className = 'bi ' + (dark ? 'bi-sun-fill' : 'bi-moon-stars-fill'); });
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0f1020' : '#4f46e5');
  if (window.Chart && S.chart) drawChart();
}
$$('.theme-toggle').forEach(b => b.addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  store.set('it_theme', next);
  applyTheme();
}));
if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', applyTheme);

/* ============================ Auth ============================ */
function showLogin() { show($('#appView'), false); show($('#loginView'), true); $('#loginUser').focus(); }

/** Admin or Supervisor: may look at other people's records (a supervisor: the staff of their branch, read-only). */
const isWide = () => !!(S.user && (S.user.role === 'Admin' || S.user.role === 'Supervisor'));
async function showApp() {
  show($('#loginView'), false); show($('#appView'), true);
  try { setCatalog(await api('getCatalog', S.token)); } catch (e) {}
  await loadStockItems();
  const admin = S.user.role === 'Admin';
  $('#whoName').textContent = S.user.username;
  $('#whoRole').textContent = ' · ' + S.user.role;
  show($('#navUsers'), admin); show($('#navStock'), admin || S.user.role === 'Supervisor');
  show($('#userFilterWrap'), isWide()); show($('#branchWrap'), admin); show($('#reviewBtn'), admin);
  deskSync();
  show($('#chartCard'), false);
  show($('#catCard'), admin); show($('#rulesCard'), admin);
  if (!S.cards.length) addMerchant();
  setType(curType);
  switchTab('new');
  loadSummary(); loadLast();
  refreshLocation();
}

function logout(silent) {
  if (S.token) api('logout', S.token).catch(() => {});
  S.token = null; S.user = null;
  deskBuilt = false; $('#deskNav').innerHTML = ''; document.body.classList.remove('desk'); show($('#deskNav'), false);      // the sidebar is rebuilt for whoever signs in next
  store.del('it_token');
  $('#loginPin').value = '';
  showLogin();
  if (!silent) toast('Signed out');
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#loginBtn'), err = $('#loginError');
  show(err, false); busy(btn, true, 'Signing in…');
  try {
    const r = await api('login', $('#loginUser').value, $('#loginPin').value);
    S.token = r.token; S.user = r.user; store.set('it_token', r.token);
    showApp();
  } catch (ex) { err.textContent = ex.message; show(err, true); }
  busy(btn, false);
});
$('#logoutBtn').addEventListener('click', () => logout(false));
const pinModal = new bootstrap.Modal($('#pinModal'));
$('#whoBtn').addEventListener('click', () => {
  ['#pinCur', '#pinNew', '#pinCfm'].forEach(s => { $(s).value = ''; }); show($('#pinError'), false);
  $('#pinWho').textContent = S.user ? S.user.username + (S.user.staffId ? ' · Staff ID ' + S.user.staffId : '') + (S.user.branch ? ' · Branch ' + S.user.branch : '') : '';
  pinModal.show();
});
$('#pinForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#pinSave'), err = $('#pinError'); show(err, false);
  if ($('#pinNew').value !== $('#pinCfm').value) { err.textContent = 'The new PIN and the confirmation do not match.'; show(err, true); return; }
  busy(btn, true, 'Saving…');
  try { await api('changePin', S.token, $('#pinCur').value, $('#pinNew').value, $('#pinCfm').value); pinModal.hide(); toast('PIN changed. Use it the next time you sign in.', 'success'); }
  catch (ex) { err.textContent = ex.message; show(err, true); }
  busy(btn, false);
});

/* ============================ Tabs ============================ */
function switchTab(name) {
  ['new', 'records', 'stock', 'users'].forEach(t => show($('#pane-' + t), t === name));
  $$('.bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'records') { loadRecords(); loadTeam(); }
  if (name === 'stock') loadStock();
  if (name === 'users') { loadUsers(); renderCatSummary(); loadTemplate(); api('getEditRules', S.token).then(r => { S.gRules = r; paintRules(); }).catch(() => {}); }
  deskPaint(name);
}
$$('.bottom-nav button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

/* ============================ Summary ============================ */
async function loadSummary() {
  try {
    const s = await api('getSummary', S.token);
    $('#sumLabel').textContent = s.isAdmin ? 'Total activities today' : 'Your activities today';
    $('#sumNum').textContent = s.today;
    $('#sumTotal').textContent = s.total;
    const bt = s.byType || [];
    $('#sumBreak').innerHTML = bt.map(t => '<span class="sum-cat' + (t.count ? ' on' : '') + '">' + esc(shortName(t.type)) + ' <b>' + t.count + '</b></span>').join('');
    show($('#sumBreak'), bt.length > 0);
    if (s.isSup) $('#sumLabel').textContent = 'Activities today · branch ' + (s.branch || '');
    S.pending = s.pending || 0; paintPending();
  } catch (e) { /* non-fatal */ }
}

/* ============================ KHQR parsing ============================ */
function parseTLV(str) {
  const out = {}; let i = 0;
  while (i + 4 <= str.length) {
    const tag = str.substr(i, 2), len = parseInt(str.substr(i + 2, 2), 10);
    if (isNaN(len) || i + 4 + len > str.length) break;
    out[tag] = str.substr(i + 4, len);
    i += 4 + len;
  }
  return out;
}
function parseKHQR(text) {
  const top = parseTLV(text.trim());
  if (!top['00'] && !top['59']) return null;
  const name = (top['59'] || '').trim();
  let mid = '';
  if (top['30']) { const s = parseTLV(top['30']); mid = s['01'] || s['00'] || ''; }
  if (!mid && top['29']) { const s = parseTLV(top['29']); mid = s['01'] || s['00'] || ''; }
  let tid = '';
  if (top['62']) { const s = parseTLV(top['62']); tid = (s['07'] || '').trim(); }   // Additional data > Terminal label
  return { name, mid, tid };
}
const NOQR = 'No QR found';
function setQRFields(card, name, mid, tid) {
  const n = $('.f-name', card.el), m = $('.f-mid', card.el);
  if (tid) $('.f-tid', card.el).value = tid.toUpperCase();
  // Overwrite with new values; clear an old "No QR found" marker; leave manual text alone otherwise.
  if (name) n.value = name; else if (n.value === NOQR) n.value = '';
  if (mid) m.value = mid; else if (m.value === NOQR) m.value = '';
  refreshMidLabel(m, curType);
}
function markNoQR(card) {
  $('.f-name', card.el).value = NOQR;
  $('.f-mid', card.el).value = NOQR;
}
function applyQR(card, text) {
  const r = parseKHQR(text);
  if (!r || (!r.name && !r.mid && !r.tid)) { markNoQR(card); toast('QR read, but it is not a KHQR code.', 'warning'); return false; }
  setQRFields(card, r.name, r.mid, r.tid);
  toast('QR filled: ' + (r.name || r.mid || '') + (r.tid ? ' · TID ' + r.tid : ''), 'success');
  return true;
}

/* ---- camera ---- */
const scanModal = new bootstrap.Modal($('#scanModal'));
function scanMode(sn) {
  $('#scanTitle').textContent = sn ? 'Scan barcode / serial number' : 'Scan KHQR';
  $('#scanHelp').innerHTML = sn ? 'Hold the phone 15–20 cm away and keep the barcode inside the frame. Tap <b>Light</b> in the dark, or slide to zoom. If the camera is blocked, use <b>Read from a photo</b> or type it.' : 'Point the camera at the merchant QR. If the camera is blocked, close this and use <b>Upload</b>.';
  show($('#snFileWrap'), !!sn);
}
/** Opens the scanner to fill one serial-number box. ret = a modal to come back to afterwards. */
function openSnScan(inp, ret) {
  S.qcCard = null; S.scanTarget = null; S.snInput = inp; S.scanReturn = ret || null; scanMode(true);
  if (ret) { ret.hide(); setTimeout(() => scanModal.show(), 350); } else scanModal.show();
}
function applySn(text) {
  const inp = S.snInput; if (!inp) return;
  const v = String(text || '').trim().toUpperCase().slice(0, 60);
  if (inp.tagName === 'TEXTAREA') { const have = inp.value.split(/[\n,;]+/).map(x => x.trim().toUpperCase()); if (have.includes(v)) toast(v + ' is already in the list.', 'warning'); else { inp.value = (inp.value.trim() ? inp.value.replace(/\s+$/, '') + '\n' : '') + v; toast('Added ' + v + '. Tap Scan S/N for the next one.', 'success'); } }
  else inp.value = v;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  scanModal.hide();
}
const SN_FORMATS = ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar', 'data_matrix', 'qr_code', 'pdf417'];
/** ZBar (WebAssembly): much better than ZXing on thin, dense Code 128 stickers. Loaded only when the phone has no built-in barcode detector (iPhone); if it cannot load, ZXing is used. */
let zbarP = null;
function loadZbar() {
  if (window.zbarWasm) return Promise.resolve(window.zbarWasm);
  if (zbarP) return zbarP;
  zbarP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@undecaf/zbar-wasm@0.11.0/dist/index.js';
    s.onload = () => window.zbarWasm && window.zbarWasm.scanImageData ? res(window.zbarWasm) : rej(new Error('no zbar'));
    s.onerror = () => rej(new Error('load')); document.head.appendChild(s); setTimeout(() => rej(new Error('timeout')), 10000);
  }).catch(() => { zbarP = null; return null; });
  return zbarP;
}
/** Camera scanner. Uses the phone's own barcode detector when it has one (fast, reads small / curved stickers), else ZXing with "try harder". HD video, continuous focus, light and zoom where the phone allows. */
async function startScan() {
  show($('#scanError'), false); show($('#scanTools'), false); $('#scanEngine').textContent = '';
  const sn = !!S.snInput, video = $('#scanVideo');
  $('#scanFrame').classList.toggle('qr', !sn);
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no camera');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    const track = stream.getVideoTracks()[0], caps = (track && track.getCapabilities && track.getCapabilities()) || {};
    const sc = S.scan = { stream, track, done: false, timer: null };
    video.srcObject = stream; await video.play().catch(() => {});
    try { if (caps.focusMode && caps.focusMode.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) {}
    show($('#scanTorch'), !!caps.torch); $('#scanTorch').classList.remove('active'); $('#scanTorch').setAttribute('aria-pressed', 'false');
    const z = $('#scanZoom'); show($('#scanZoomWrap'), !!caps.zoom);
    if (caps.zoom) { z.min = caps.zoom.min; z.max = caps.zoom.max; z.step = caps.zoom.step || 0.1; z.value = caps.zoom.min; }
    show($('#scanTools'), !!(caps.torch || caps.zoom));
    const found = text => {
      text = String(text || '').trim(); if (!text || sc.done) return; sc.done = true;
      try { navigator.vibrate && navigator.vibrate(60); } catch (e) {}
      if (sn) applySn(text);
      else if (S.mhScan) { S.mhScan = false; scanModal.hide(); const kr = parseKHQR(text), v = (kr && (kr.mid || kr.tid)) || text; $('#mhQ').value = v; setTimeout(() => { lkModal.show(); mhRun(v); }, 350); }
      else if (S.qcCard) { const qc = S.qcCard; scanModal.hide(); qcScanned(qc, text); }
      else if (S.scanTarget) { const t = S.scanTarget; scanModal.hide(); applyQR(t, text); }
    };
    let det = null;
    if (window.BarcodeDetector) {
      try {
        const sup = BarcodeDetector.getSupportedFormats ? await BarcodeDetector.getSupportedFormats() : SN_FORMATS;
        const formats = (sn ? SN_FORMATS : ['qr_code']).filter(f => sup.includes(f));
        if (formats.length) det = new BarcodeDetector({ formats });
      } catch (e) { det = null; }
    }
    if (det) {
      $('#scanEngine').textContent = 'Reader: built-in';
      let busy = false;
      sc.timer = setInterval(async () => {
        if (busy || sc.done || video.readyState < 2) return; busy = true;
        try { const r = await det.detect(video); if (r && r[0]) found(r[0].rawValue); } catch (e) {}
        busy = false;
      }, 120);
    } else {
      const hints = new Map();
      hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
      const F = ZXing.BarcodeFormat;
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, sn ? [F.CODE_128, F.CODE_39, F.CODE_93, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.ITF, F.CODABAR, F.DATA_MATRIX, F.QR_CODE, F.PDF_417] : [F.QR_CODE]);
      if (sn && ZXing.MultiFormatReader && ZXing.HTMLCanvasElementLuminanceSource && ZXing.HybridBinarizer && ZXing.GlobalHistogramBinarizer && ZXing.BinaryBitmap) {
        // iPhone / browsers without a built-in detector: read the middle strip of each frame, enlarged, several times a second.
        // Thin Code 128 bars need many pixels per bar; the strip is much faster and clearer than the whole frame.
        const mfr = new ZXing.MultiFormatReader(); mfr.setHints(hints);
        const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
        let zb = null; loadZbar().then(z => { zb = z; $('#scanEngine').textContent = 'Reader: ' + (z ? 'ZBar' : 'ZXing'); });
        $('#scanEngine').textContent = 'Reader: ZXing (loading ZBar…)';
        const passes = [{ y: .25, h: .5, b: 'h' }, { y: .25, h: .5, b: 'g' }, { y: .35, h: .3, b: 'h' }, { y: 0, h: 1, b: 'h' }, { y: .35, h: .3, b: 'g' }];
        let n = 0, busy = false;
        const tryPass = async ps => {
          const vw = video.videoWidth, vh = video.videoHeight; if (!vw || !vh) return null;
          const sy = Math.round(vh * ps.y), sh = Math.round(vh * ps.h), k = Math.min(1.5, 1800 / vw);
          cv.width = Math.round(vw * k); cv.height = Math.round(sh * k);
          cx.drawImage(video, 0, sy, vw, sh, 0, 0, cv.width, cv.height);
          if (zb) {
            try { const r = await zb.scanImageData(cx.getImageData(0, 0, cv.width, cv.height)); if (r && r.length) { const t = r[0].decode ? r[0].decode() : new TextDecoder().decode(r[0].data); if (t) return t; } } catch (e) {}
          }
          const src = new ZXing.HTMLCanvasElementLuminanceSource(cv);
          const bin = ps.b === 'g' ? new ZXing.GlobalHistogramBinarizer(src) : new ZXing.HybridBinarizer(src);
          try { return mfr.decode(new ZXing.BinaryBitmap(bin)).getText(); } catch (e) { return null; }
        };
        sc.timer = setInterval(async () => {
          if (busy || sc.done || video.readyState < 2) return; busy = true;
          try { const t = await tryPass(passes[n++ % passes.length]); if (t) found(t); } catch (e) {}
          busy = false;
        }, 90);
      } else {
        S.reader = sn ? new ZXing.BrowserMultiFormatReader(hints, 80) : new ZXing.BrowserQRCodeReader(hints, 80);
        await S.reader.decodeFromStream(stream, video, result => { if (result) found(result.getText()); });
      }
    }
  } catch (e) {
    stopCamera();
    $('#scanError').textContent = S.snInput ? 'Camera is not available here. Close this and type the number, or use Read from a photo.' : 'Camera is not available here. Close this and tap Upload instead.';
    show($('#scanError'), true);
  }
}
function stopCamera() {
  const sc = S.scan; S.scan = null;
  if (sc) { clearInterval(sc.timer); sc.done = true; try { sc.stream.getTracks().forEach(t => t.stop()); } catch (e) {} }
  try { S.reader && S.reader.reset(); } catch (e) {} S.reader = null;
  const v = $('#scanVideo'); try { v.pause(); v.srcObject = null; } catch (e) {}
}
$('#scanTorch').addEventListener('click', async () => {
  const sc = S.scan; if (!sc) return; const on = !$('#scanTorch').classList.contains('active');
  try { await sc.track.applyConstraints({ advanced: [{ torch: on }] }); $('#scanTorch').classList.toggle('active', on); $('#scanTorch').setAttribute('aria-pressed', String(on)); } catch (e) { toast('This phone cannot switch the light from here.', 'warning'); }
});
$('#scanZoom').addEventListener('input', async e => { const sc = S.scan; if (sc) { try { await sc.track.applyConstraints({ advanced: [{ zoom: +e.target.value }] }); } catch (er) {} } });
function stopScan() {
  stopCamera(); S.qcCard = null;
  S.snInput = null;
  if (S.scanReturn) { const r = S.scanReturn; S.scanReturn = null; setTimeout(() => r.show(), 200); }
}
$('#scanModal').addEventListener('shown.bs.modal', startScan);
$('#scanModal').addEventListener('hidden.bs.modal', stopScan);
$('#snFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let text = null, loaded = null;
  try {
    loaded = await loadImage(f);
    if (window.BarcodeDetector) {      // the phone's own detector first: best on small or curved stickers
      try { const r = await new BarcodeDetector().detect(loaded.img); if (r && r[0] && r[0].rawValue) text = r[0].rawValue; } catch (er) {}
    }
    if (!text) {
    let hints = null; try { hints = new Map(); hints.set(ZXing.DecodeHintType.TRY_HARDER, true); } catch (er) { hints = null; }
    const rd = hints ? new ZXing.BrowserMultiFormatReader(hints) : new ZXing.BrowserMultiFormatReader();
    for (const src of [loaded.url, () => scaledDataUrl(loaded.img, 1000), () => scaledDataUrl(loaded.img, 1600), () => scaledDataUrl(loaded.img, 600)]) {
      try { text = (await rd.decodeFromImageUrl(typeof src === 'function' ? src() : src)).getText(); break; } catch (er) { /* next */ }
    }
    }
  } catch (er) {}
  if (loaded) URL.revokeObjectURL(loaded.url);
  if (text) applySn(text); else toast('No barcode found in that photo.', 'warning');
});
// every scan button next to a serial-number box (form cards and the edit window)
document.addEventListener('click', e => {
  const b = e.target.closest('.btn-sn'); if (!b) return;
  const inp = $('input', b.parentElement); if (!inp) return;
  openSnScan(inp, b.closest('#editModal') ? editModal : null);
});

/* ---- upload screenshot ---- */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unreadable image')); };
    img.src = url;
  });
}
function scaledDataUrl(img, maxSide) {
  const r = maxSide / Math.max(img.naturalWidth, img.naturalHeight);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * r));
  c.height = Math.max(1, Math.round(img.naturalHeight * r));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
async function decodeFile(card, file) {
  if (!file) return;
  const btn = $('.btn-upload', card.el);
  busy(btn, true, 'Reading…');
  let text = null, loaded = null;
  try {
    loaded = await loadImage(file);
    const reader = new ZXing.BrowserQRCodeReader();
    // 1) original image, 2+) resized copies (helps with huge or tiny screenshots)
    const sources = [loaded.url, () => scaledDataUrl(loaded.img, 1000), () => scaledDataUrl(loaded.img, 600), () => scaledDataUrl(loaded.img, 1600)];
    for (const src of sources) {
      try { text = (await reader.decodeFromImageUrl(typeof src === 'function' ? src() : src)).getText(); break; }
      catch (e) { /* try next */ }
    }
  } catch (e) { /* unreadable image */ }
  if (loaded) URL.revokeObjectURL(loaded.url);
  busy(btn, false);

  if (text) applyQR(card, text);
  else { markNoQR(card); toast('No QR code found in that image.', 'warning'); }
}

/* ============================ Merchant cards ============================ */
function addMerchant() {
  const id = ++S.seq;
  const el = document.createElement('div');
  el.className = 'card-x fade-in';
  el.innerHTML =
    '<div class="merchant-head"><span class="badge-num">Merchant <span class="n"></span></span><span class="flex-grow-1 ms-2"><span class="pill ty"></span></span>' +
    '<button class="btn btn-sm btn-outline-danger border-0 btn-remove" type="button"><i class="bi bi-trash3"></i></button></div>' +
    '<div class="mb-3 act-wrap"><label class="form-label">Activity <span class="rq">*</span></label><div class="chips act-chips"></div></div><input type="hidden" class="f-act">' +
    '<div class="small text-muted mb-3 act-hint hidden">Choose an activity to see the boxes it needs.</div>' +
    '<div class="mb-3"><label class="form-label"><span class="date-lbl">Installed / action date</span> <span class="rq">*</span></label><input type="date" class="form-control f-date"></div>' +
    '<input type="file" accept="image/*" class="qr-file hidden">' +
    '<div class="mb-3 hidden" data-fk="merchant"><div class="d-flex justify-content-between align-items-end gap-2 mb-1 lbl-row"><label class="form-label mb-0">Merchant name <span class="rq hidden">*</span></label><span class="qr-slot"><span class="qr-tools d-inline-flex gap-1 flex-none"><button type="button" class="btn btn-soft btn-scan btn-xs"><i class="bi bi-qr-code-scan me-1"></i>Scan QR</button><button type="button" class="btn btn-soft btn-upload btn-xs"><i class="bi bi-image me-1"></i>Upload QR</button></span></span></div><input class="form-control f-name" placeholder="Auto-filled from KHQR"></div>' +
    '<div class="mb-3 hidden" data-fk="mid"><div class="d-flex justify-content-between align-items-end gap-2 mb-1 lbl-row"><label class="form-label mb-0"><span class="mid-t">MID</span> <span class="rq hidden">*</span></label><span class="qr-slot"></span></div><input class="form-control f-mid" inputmode="text" placeholder="Auto-filled from KHQR"></div>' +
    '<div class="mb-3 hidden" data-fk="tid"><div class="d-flex justify-content-between align-items-end gap-2 mb-1 lbl-row"><label class="form-label mb-0">TID <span class="text-lowercase fw-normal">(terminal ID)</span> <span class="rq hidden">*</span></label><span class="qr-slot"></span></div><input class="form-control f-tid" autocapitalize="characters" autocomplete="off" placeholder="Auto-filled from KHQR, or type it"></div>' +
    '<div class="hidden yn-row" data-fk="integ"><label class="form-check-label">Integration</label><div class="form-check form-switch m-0"><input class="form-check-input f-integ" type="checkbox" role="switch" aria-label="Integration"><span class="yn-t small fw-semibold">No</span></div></div>' +
    '<div class="hidden yn-row" data-fk="sim"><label class="form-check-label">SIM</label><div class="form-check form-switch m-0"><input class="form-check-input f-sim" type="checkbox" role="switch" aria-label="SIM"><span class="yn-t small fw-semibold">No</span></div></div>' +
    '<div class="hidden yn-row" data-fk="standee"><label class="form-check-label">POS Standee</label><div class="form-check form-switch m-0"><input class="form-check-input f-standee" type="checkbox" role="switch" aria-label="POS Standee"><span class="yn-t small fw-semibold">No</span></div></div>' +
    '<div class="mb-3 hidden" data-fk="business"><label class="form-label">Business name <span class="rq hidden">*</span></label><input class="form-control f-biz" placeholder="N/A"></div>' +
    '<div class="mb-3 hidden" data-fk="serial"><label class="form-label">Serial number <span class="rq hidden">*</span></label><div class="input-group"><input class="form-control f-serial" autocapitalize="characters" autocomplete="off"><button type="button" class="btn btn-soft btn-sn" aria-label="Scan barcode"><i class="bi bi-upc-scan"></i></button></div></div>' +
    '<div class="mb-3 hidden" data-fk="oldSn"><label class="form-label">Old S/N <span class="rq hidden">*</span></label><div class="input-group"><input class="form-control f-old" autocapitalize="characters" autocomplete="off"><button type="button" class="btn btn-soft btn-sn" aria-label="Scan barcode"><i class="bi bi-upc-scan"></i></button></div></div>' +
    '<div class="mb-3 hidden" data-fk="newSn"><label class="form-label">New S/N <span class="rq hidden">*</span></label><div class="input-group"><input class="form-control f-new" autocapitalize="characters" autocomplete="off"><button type="button" class="btn btn-soft btn-sn" aria-label="Scan barcode"><i class="bi bi-upc-scan"></i></button></div></div>' +
    '<div class="mb-3 hidden" data-fk="btype"><label class="form-label">Business type <span class="rq hidden">*</span></label><input class="form-control f-btype mb-2" maxlength="60" autocomplete="off" placeholder="Type, or tap one below">' +
      '<div class="chips btype-chips">' + BIZ_TYPES.map(t => '<button type="button" class="chip" data-t="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div></div>' +
    '<div class="mb-3 hidden" data-fk="ptype"><label class="form-label">Product type <span class="rq hidden">*</span></label><input class="form-control f-ptype mb-2" maxlength="120" autocomplete="off" placeholder="Tap one or more below, or leave blank"><div class="chips ptype-chips"></div></div>' +
    '<div class="mb-3 hidden" data-fk="hours"><label class="form-label">Business hours <span class="rq hidden">*</span></label><div class="d-flex align-items-center gap-2 hours-line"><label class="small text-muted mb-0">Open</label><input type="time" class="form-control f-open" aria-label="Open"><label class="small text-muted mb-0 ms-1">Close</label><input type="time" class="form-control f-close" aria-label="Close"></div></div>' +
    '<div class="mb-3 hidden" data-fk="group"><label class="form-label">Group name <span class="rq hidden">*</span></label><input class="form-control f-group" maxlength="100" autocomplete="off" placeholder="e.g. owner / chain / group name"></div>' +
    '<div class="mb-3 hidden" data-fk="zone"><label class="form-label">Zone / Area <span class="rq hidden">*</span></label><input class="form-control f-zone" maxlength="80" autocomplete="off" placeholder="e.g. Zone A / Area name"></div>' +
    '<div class="mb-3 hidden" data-fk="phone"><label class="form-label">Phone number <span class="rq hidden">*</span></label><input class="form-control f-phone" type="tel" inputmode="tel" autocomplete="off" placeholder="e.g. 012 345 678"></div>' +
    '<div class="mb-3 hidden" data-fk="tag"><label class="form-label">Tag <span class="rq hidden">*</span></label><input class="form-control f-tag" maxlength="200" autocomplete="off" placeholder="Extra remark / tag"></div>' +
    '<div class="qc-wrap hidden mb-3"><div class="d-flex justify-content-between align-items-center mb-1"><label class="form-label mb-0">QR materials given to the merchant <span class="rq">*</span></label><button type="button" class="btn btn-link btn-sm p-0 qc-reset hidden">Start over</button></div>' +
      '<div class="qc-step"><button type="button" class="btn btn-soft qc-minus">−</button><b class="qc-n">0</b><button type="button" class="btn btn-soft qc-plus">+</button><span class="small text-muted ms-2">QR stands / stickers</span></div>' +
      '<div class="progress qc-bar mt-2"><div class="progress-bar" style="width:0%"></div></div><div class="small text-muted qc-sum mt-1">Set the quantity, then scan every QR.</div>' +
      '<button type="button" class="btn btn-primary w-100 mt-2 qc-scan"><i class="bi bi-qr-code-scan me-1"></i>Scan QR</button><div class="qc-list mt-2"></div></div>' +
    '<div class="custom-wrap hidden"></div>' +
    '<div class="stock-wrap hidden mb-3"></div>' +
    '<div class="mb-3 hidden" data-fk="remarks"><label class="form-label">Remarks <span class="rq hidden">*</span></label><textarea class="form-control f-rem" rows="2"></textarea></div>' +
    '<div class="hidden" data-fk="photo"><label class="form-label">Photos / videos <span class="rq hidden">*</span> <span class="ph-min fw-semibold hidden"></span> <span class="text-lowercase fw-normal">(max ' + MAX_PHOTOS + ', videos ≤ ' + MAX_VIDEOS + ' × ' + MAX_VIDEO_MB + ' MB)</span></label>' +
    '<div class="row g-2">' +
      '<div class="col-6"><button type="button" class="btn btn-soft w-100 btn-cam"><i class="bi bi-camera me-1"></i>Take photo</button></div>' +
      '<div class="col-6"><button type="button" class="btn btn-soft w-100 btn-photo"><i class="bi bi-images me-1"></i>Photos or Videos</button></div>' +
    '</div>' +
    '<input type="file" accept="image/*" capture="environment" class="cam-file hidden">' +
    '<input type="file" accept="image/*,video/*" multiple class="photo-file hidden">' +
    '<div class="form-check form-switch mt-2"><input class="form-check-input stamp-sw" type="checkbox" role="switch"><label class="form-check-label small">Stamp date, GPS &amp; name on photos from <b>Take photo</b></label></div>' +
    '<div class="small text-muted mt-1"><button type="button" class="btn btn-link btn-sm p-0 align-baseline stamp-link">Stamp settings</button> · Prefer another camera app? Take the photos there, then tap <b>Choose photos</b>.</div>' +
    '<div class="progress prog mt-2"><div class="progress-bar progress-bar-striped progress-bar-animated" style="width:0%"></div></div>' +
    '<div class="photo-grid"></div></div>';
  $('#merchantList').appendChild(el);

  if (keep.tag) $('.f-tag', el).value = keep.tag; if (keep.zone) $('.f-zone', el).value = keep.zone;
  const dt = $('.f-date', el); dt.value = ymd(new Date()); dt.max = ymd(new Date());
  const card = { id, el, photos: [], qc: qcFresh() };
  S.cards.push(card);
  applyType(card);
  $('.btype-chips', el).addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    const inp = $('.f-btype', el); inp.value = b.dataset.t; syncBtype(el);
  });
  $('.f-btype', el).addEventListener('input', () => syncBtype(el));
  $('.ptype-chips', el).addEventListener('click', e => {       // tap to add, tap again to remove; none chosen = blank
    const b = e.target.closest('.chip'); if (!b) return;
    const cur = $('.f-ptype', el).value.split(',').map(x => x.trim()).filter(Boolean), at = cur.findIndex(x => x.toLowerCase() === b.dataset.t.toLowerCase());
    if (at >= 0) cur.splice(at, 1); else cur.push(b.dataset.t);
    const order = x => { const i = TYPES.findIndex(t => t.toLowerCase() === x.toLowerCase()); return i < 0 ? 999 : i; };      // keep the category order, typed extras last
    $('.f-ptype', el).value = cur.sort((a, c) => order(a) - order(c)).join(', '); syncPtype(el);
  });
  $('.f-ptype', el).addEventListener('input', () => syncPtype(el));
  $('.act-chips', el).addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    setAct(card, b.dataset.a);
    if (card === S.cards[0]) followFirst(); else card.own = true;     // changing a later merchant by hand stops it following merchant 1
  });

  qcWire(card);
  $('.btn-scan', el).onclick = () => { S.qcCard = null; S.scanTarget = card; S.snInput = null; scanMode(false); scanModal.show(); };
  $('.btn-upload', el).onclick = () => $('.qr-file', el).click();
  $('.qr-file', el).onchange = async e => { await decodeFile(card, e.target.files[0]); e.target.value = ''; };
  $('.btn-photo', el).onclick = () => $('.photo-file', el).click();
  $('.photo-file', el).onchange = async e => { await addPhotos(card, Array.from(e.target.files), false); e.target.value = ''; };
  $('.btn-cam', el).onclick = () => { if (stampOn && stampCfg.compass) startCompass(); $('.cam-file', el).click(); };
  $('.cam-file', el).onchange = async e => { await addPhotos(card, Array.from(e.target.files), true); e.target.value = ''; };
  $('.stamp-link', el).onclick = openStampSettings;
  const sw = $('.stamp-sw', el); sw.checked = stampOn;
  $('.btn-cam', el).addEventListener('click', () => { if (stampOn && needGeo()) refreshGeo(10000); });   // warm up GPS while the camera opens
  sw.addEventListener('change', () => { stampOn = sw.checked; store.set('it_stamp', stampOn ? '1' : '0'); $$('.stamp-sw').forEach(x => { x.checked = stampOn; }); });
  $('.btn-remove', el).onclick = () => {
    if (S.cards.length === 1) { toast('At least one merchant is required.', 'warning'); return; }
    S.cards = S.cards.filter(c => c !== card); el.remove(); renumber();
  };
  renumber();
  return card;
}
function renumber() {
  S.cards.forEach((c, i) => { $('.n', c.el).textContent = i + 1; show($('.btn-remove', c.el), S.cards.length > 1);
    $('.act-wrap', c.el).style.display = i ? 'none' : ''; $('.act-hint', c.el).style.display = i ? 'none' : ''; });  // merchants 2+ always use merchant 1's activity
  if (typeof updateAddBtn === 'function') updateAddBtn();
  $$('.ty').forEach(el => { el.textContent = curType; });
  if (typeof updateLocCard === 'function') updateLocCard();
}
function updateAddBtn() {
  const btn = $('#addMerchantBtn'), full = S.cards.length >= MAX_MERCHANTS;
  btn.disabled = full;
  btn.innerHTML = full
    ? '<i class="bi bi-check2-circle me-1"></i>Maximum ' + MAX_MERCHANTS + ' merchants reached'
    : '<i class="bi bi-plus-lg me-1"></i>Add another merchant (' + S.cards.length + '/' + MAX_MERCHANTS + ')';
}
$('#typeTabs').addEventListener('click', e => { const b = e.target.closest('button[data-type]'); if (b) setType(b.dataset.type); });
$('#addMerchantBtn').addEventListener('click', () => {
  if (S.cards.length >= MAX_MERCHANTS) { toast('You can add up to ' + MAX_MERCHANTS + ' merchants per submission.', 'warning'); return; }
  const c = addMerchant();
  c.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* ---- photos ---- */
/* ---- photo stamp: settings (all remembered on this phone) ---- */
const STAMP_DEF = { logo: true, map: true, title: true, time: true, coords: true, addr: true, titleText: 'Merchant Support', user: true, logoData: '', fontScale: 100, mapScale: 20, mapZoom: 17, logoScale: 100, compass: false, cv: 2, compassScale: 100, opCompass: 100, opText: 100, opMap: 100, opLogo: 100, fontColor: '#ffffff' };
let stampOn = store.get('it_stamp') !== '0';          // on by default; remembered
let stampCfg = (() => {
  let c = {}; try { c = JSON.parse(store.get('it_stamp_cfg') || '{}') || {}; } catch (e) {}
  const old = store.get('it_stamp_title'); if (c.titleText === undefined && old !== null) c.titleText = old;
  if (c.coords === undefined && store.get('it_stamp_geo') === '0') { c.coords = false; c.addr = false; c.map = false; }
  if (c.cv !== 2) { c.compass = false; c.cv = 2; }      // the compass is off for everyone by default; anyone can switch it on in the stamp settings
  return Object.assign({}, STAMP_DEF, c);
})();
const saveStampCfg = () => store.set('it_stamp_cfg', JSON.stringify(stampCfg));
const needGeo = () => stampCfg.coords || stampCfg.addr || stampCfg.map;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = n => String(n).padStart(2, '0');
/** "Oct 21, 2026 8:14:34 PM" */
function stampDateTime(ms) {
  const d = new Date(ms || Date.now()), h12 = d.getHours() % 12 || 12;
  return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + ' ' + h12 + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) + ' ' + (d.getHours() < 12 ? 'AM' : 'PM');
}
/** "13.36813 103.83870666666665" – plain decimals, like the sample */
const coordText = p => +p.lat.toFixed(6) + ' ' + +p.lon.toFixed(6);
/** Open Location (Plus) Code, 11 digits, first 4 dropped ("9R9Q+6M2") */
function plusCode(lat, lon) {
  const A = '23456789CFGHJMPQRVWX';
  let la = Math.floor((Math.min(90, Math.max(-90, lat)) + 90) * 40000 + 1e-7), lo = Math.floor((((lon + 180) % 360 + 360) % 360) * 32000 + 1e-7);
  let out = A[(la % 5) * 4 + (lo % 4)]; la = Math.floor(la / 5); lo = Math.floor(lo / 4);
  const pairs = [];
  for (let i = 0; i < 5; i++) { pairs.unshift(A[lo % 20]); pairs.unshift(A[la % 20]); la = Math.floor(la / 20); lo = Math.floor(lo / 20); }
  const full = pairs.join('');                       // 10 digits
  return full.slice(4, 8) + '+' + full.slice(8) + out;
}

/* ---- GPS + address + map tile, cached while you stay in the same spot ---- */
const geo = { manual: false, pos: null, place: null, key: '', lookup: null, map: null, mapKey: '', mapLookup: null };
function readPosition(timeout) {
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy || 0, t: Date.now() }),
      () => res(null), { enableHighAccuracy: true, timeout: timeout || 10000, maximumAge: 30000 });
  });
}
/** The district (Khan / Srok / Krong): prefer a name that says so, else the address' city district, district or county. */
function districtOf(a) {
  const skip = /^(country|country_code|postcode|road|house_number|village|hamlet|isolated_dwelling|neighbourhood|suburb|quarter|amenity|ISO3166.*)$/i;
  const named = Object.keys(a).filter(k => !skip.test(k)).map(k => String(a[k])).find(v => /\b(khan|srok|krong|district)\b/i.test(v));
  return named || a.city_district || a.district || a.county || a.state_district || '';
}
function lookupPlace(p) {
  const key = p.lat.toFixed(3) + ',' + p.lon.toFixed(3);                 // ~100 m
  if (key === geo.key) return geo.lookup;
  geo.key = key; geo.place = null; fillCommuneAll(false, true);
  const ctl = window.AbortController ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), 6000) : null;
  const rev = layer => fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=en' + (layer ? '&layer=address' : '') + '&lat=' + p.lat + '&lon=' + p.lon, ctl ? { signal: ctl.signal } : {}).then(r => r.json());
  geo.lookup = rev(true).then(j => j && j.address ? j : rev(false))      // street and area names only; if that finds nothing, the plain lookup
    .then(j => {
      const a = j.address || {};
      // a business / shop / office name is not part of an address
      const POI = ['amenity', 'office', 'shop', 'tourism', 'leisure', 'craft', 'building', 'healthcare', 'historic', 'man_made', 'name', 'brand', 'club'];
      const poi = POI.map(k => String(a[k] || '').toLowerCase()).filter(Boolean), BIZ = /\b(services?|consult\w*|company|co\.?,? ?ltd|ltd|bank|hotel|villa|guesthouse|restaurant|cafe|shop|mart|market|pharmacy|clinic|hospital|school|office|center|centre|spa|salon)\b/i;
      const ok = v => v && !poi.includes(String(v).toLowerCase()) && !BIZ.test(v);
      const first = (...v) => v.find(ok) || '';
      const street = first(a.road, a.pedestrian, a.path, a.footway, a.suburb, a.neighbourhood, a.village);
      const city = first(a.city, a.town, a.municipality, a.county, String(a.state || '').replace(/ Province$/i, ''));
      geo.place = { street, city, country: a.country || '', district: districtOf(a), commune: a.suburb || a.quarter || a.neighbourhood || a.village || a.hamlet || '' };
      fillCommuneAll(false, true);
    }).catch(() => { geo.place = null; geo.key = ''; }).then(() => { if (timer) clearTimeout(timer); });
  return geo.lookup;
}
/** Small square street-map picture around the point with a red pin (OpenStreetMap tiles). null if offline. */
function loadMap(p) {
  const Z = Math.min(19, Math.max(13, Math.round(Number(stampCfg.mapZoom) || 17)));
  const key = p.lat.toFixed(4) + ',' + p.lon.toFixed(4) + ',' + Z;
  if (key === geo.mapKey) return geo.mapLookup;
  geo.mapKey = key; geo.map = null;
  const n = Math.pow(2, Z);
  const fx = (p.lon + 180) / 360 * n, lr = p.lat * Math.PI / 180;
  const fy = (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n;
  const tx = Math.floor(fx), ty = Math.floor(fy), T = 256;
  const tile = (dx, dy) => new Promise(res => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    const t = setTimeout(() => res(null), 6000);
    im.onload = () => { clearTimeout(t); res(im); }; im.onerror = () => { clearTimeout(t); res(null); };
    im.src = 'https://tile.openstreetmap.org/' + Z + '/' + (tx + dx) + '/' + (ty + dy) + '.png';
  });
  const jobs = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) jobs.push(tile(dx, dy).then(im => ({ dx, dy, im })));
  geo.mapLookup = Promise.all(jobs).then(list => {
    if (!list.some(o => o.im)) { geo.mapKey = ''; return null; }
    const S3 = T * 3, cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const x = cv.getContext('2d'); x.fillStyle = '#e8e4dc'; x.fillRect(0, 0, 256, 256);
    const cx = (fx - tx + 1) * T, cy = (fy - ty + 1) * T;       // point inside the 3x3 mosaic
    list.forEach(o => { if (o.im) x.drawImage(o.im, (o.dx + 1) * T - cx + 128, (o.dy + 1) * T - cy + 128); });
    // red pin
    x.fillStyle = '#ea4335'; x.strokeStyle = '#a52714'; x.lineWidth = 3;
    x.beginPath(); x.arc(128, 112, 20, Math.PI * 0.8, Math.PI * 0.2, false); x.lineTo(128, 150); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#7b1a10'; x.beginPath(); x.arc(128, 112, 7, 0, 7); x.fill();
    geo.map = cv; return cv;
  }).catch(() => { geo.mapKey = ''; return null; });
  return geo.mapLookup;
}
async function refreshGeo(timeout, force) {
  if (geo.manual && !force && geo.pos) return geo.pos;       // a place picked on the map stays until you tap "use my GPS"
  const p = await readPosition(timeout);
  if (p) { geo.pos = p; lookupPlace(p); loadMap(p); }
  return geo.pos;
}
const addrText = p => [plusCode(p.lat, p.lon), geo.place && geo.place.street, geo.place && geo.place.city, geo.place && geo.place.country].filter(Boolean).join(', ');
/** { lat, lon, addr } for the Telegram message, or null when the phone gives no position. */
async function currentLocation() {
  let p = geo.pos && Date.now() - geo.pos.t < 120000 ? geo.pos : await refreshGeo(8000);
  p = p || geo.pos;
  if (!p) return null;
  try { await geo.lookup; } catch (e) {}
  return { lat: p.lat, lon: p.lon, addr: addrText(p) };
}
/* ---- "Current location" card on the form ---- */
function paintLoc() {
  const p = geo.pos;
  if (!p) return;
  $('#locAddr').textContent = addrText(p);
  $('#locCoords').textContent = coordText(p);
  show($('#locTag'), !!geo.manual);
  const o = $('#locOpen'); o.href = 'https://maps.google.com/?q=' + p.lat + ',' + p.lon; show(o, true);
  if (geo.map) { try { $('#locMap').src = geo.map.toDataURL('image/png'); show($('#locMap'), true); } catch (e) {} }
}
async function refreshLocation() {
  geo.manual = false; show($('#locTag'), false);
  $('#locAddr').textContent = 'Finding your location…'; $('#locCoords').textContent = '';
  const p = await refreshGeo(10000, true);
  if (!p) { $('#locAddr').textContent = 'Location unavailable. Allow location access in your browser, then tap refresh.'; return; }
  paintLoc();
  try { await geo.lookup; } catch (e) {} paintLoc();
  try { await geo.mapLookup; } catch (e) {} paintLoc();
}
$('#locRefresh').addEventListener('click', refreshLocation);
/* time boxes (business hours): one tap opens the phone's time picker */
document.addEventListener('click', e => { const i = e.target.closest && e.target.closest('input[type=time]'); if (i && i.showPicker) { try { i.showPicker(); } catch (x) {} } });

/* ---- choose the location on a map ---- */
const mapModal = new bootstrap.Modal($('#mapModal'));
const pick = { map: null, marker: null, pt: null };
function setPick(lat, lon, pan) {
  pick.pt = { lat, lon };
  pick.marker.setLatLng([lat, lon]);
  if (pan) pick.map.setView([lat, lon], Math.max(pick.map.getZoom(), 17));
  $('#pickCoords').textContent = +lat.toFixed(6) + ', ' + +lon.toFixed(6);
  $('#pickUse').disabled = false;
}
function openPick() {
  if (!window.L) { toast('The map could not load. Check your internet connection.', 'warning'); return; }
  mapModal.show();
  setTimeout(() => {
    const start = geo.pos ? [geo.pos.lat, geo.pos.lon] : [11.5564, 104.9282];
    if (!pick.map) {
      pick.map = L.map('pickMap').setView(start, geo.pos ? 17 : 12);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(pick.map);
      pick.marker = L.marker(start, { draggable: true, icon: L.divIcon({ className: '', html: '<div style="font-size:30px;line-height:30px;margin:-28px 0 0 -9px">📍</div>', iconSize: [0, 0] }) }).addTo(pick.map);
      pick.map.on('click', e => setPick(e.latlng.lat, e.latlng.lng, false));
      pick.marker.on('dragend', () => { const l = pick.marker.getLatLng(); setPick(l.lat, l.lng, false); });
    } else pick.map.setView(start, geo.pos ? 17 : pick.map.getZoom());
    pick.marker.setLatLng(start);
    pick.pt = geo.pos ? { lat: geo.pos.lat, lon: geo.pos.lon } : null;
    $('#pickCoords').textContent = geo.pos ? +geo.pos.lat.toFixed(6) + ', ' + +geo.pos.lon.toFixed(6) : '';
    $('#pickUse').disabled = !geo.pos;
    pick.map.invalidateSize();
  }, 300);
}
$('#locPick').addEventListener('click', openPick);
async function pickSearch() {
  const q = $('#pickQ').value.trim(); if (!q || !pick.map) return;
  try {
    const r = await (await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&q=' + encodeURIComponent(q))).json();
    if (!r.length) { toast('Place not found. Try a different name.', 'warning'); return; }
    setPick(+r[0].lat, +r[0].lon, true);
  } catch (e) { toast('Search failed. Check your internet connection.', 'warning'); }
}
$('#pickGo').addEventListener('click', pickSearch);
$('#pickQ').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); pickSearch(); } });
$('#pickGps').addEventListener('click', async () => {
  const p = await readPosition(8000);
  if (p) setPick(p.lat, p.lon, true); else toast('Could not read your GPS. Allow location access.', 'warning');
});
$('#pickUse').addEventListener('click', async () => {
  if (!pick.pt) return;
  geo.manual = true; geo.key = ''; geo.mapKey = '';
  geo.pos = { lat: pick.pt.lat, lon: pick.pt.lon, acc: 0, t: Date.now() };
  mapModal.hide();
  lookupPlace(geo.pos); loadMap(geo.pos);
  $('#locAddr').textContent = 'Finding the address…'; paintLoc();
  try { await geo.lookup; } catch (e) {} paintLoc();
  try { await geo.mapLookup; } catch (e) {} paintLoc();
  toast('Location set from the map. Telegram and photo stamps will use it.', 'success');
});
const logoImg = { src: '', img: null };
function getLogo() {
  if (!stampCfg.logoData) return Promise.resolve(null);
  if (logoImg.src === stampCfg.logoData && logoImg.img) return Promise.resolve(logoImg.img);
  return new Promise(res => { const im = new Image(); im.onload = () => { logoImg.src = stampCfg.logoData; logoImg.img = im; res(im); }; im.onerror = () => res(null); im.src = stampCfg.logoData; });
}

/* ---- compass heading (phone sensor) ---- */
const hdg = { v: null, on: false };
const normDeg = d => ((d % 360) + 360) % 360;
function onOrient(e) {
  let v = null;
  if (typeof e.webkitCompassHeading === 'number') v = e.webkitCompassHeading;          // iPhone: already degrees from north
  else if (e.alpha != null && (e.absolute || e.type === 'deviceorientationabsolute')) v = 360 - e.alpha;   // Android
  if (v == null || isNaN(v)) return;
  const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;   // phone turned sideways
  hdg.v = normDeg(v + ang); hdg.t = Date.now();
}
/** Start listening. Must be called from a tap on iPhone (permission prompt). Safe to call many times. */
async function startCompass() {
  if (hdg.on) return;
  try {
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') return;
    }
  } catch (e) { return; }
  hdg.on = true;
  window.addEventListener('deviceorientationabsolute', onOrient, true);
  window.addEventListener('deviceorientation', onOrient, true);
}
const CARD8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const headText = v => Math.round(v) % 360 + '° ' + CARD8[Math.round(v / 45) % 8];
/** The stamp's address, as at the start: plus code, street, city, country. */
const stampAddr = (pl, p) => [p && plusCode(p.lat, p.lon), pl && pl.street, pl && pl.city, pl && pl.country].filter(Boolean).join(', ');      // the original address: plus code, street, city, country
/** Everything one stamp needs (the time is filled in per photo). */
async function stampData() {
  const d = { title: '', user: '', time: stampCfg.time, coords: '', addr: '', map: null, logo: null, fontScale: stampCfg.fontScale, mapScale: stampCfg.mapScale, logoScale: stampCfg.logoScale,
    compass: null, compassScale: stampCfg.compassScale, opCompass: stampCfg.opCompass, opText: stampCfg.opText, opMap: stampCfg.opMap, opLogo: stampCfg.opLogo, fontColor: stampCfg.fontColor };
  if (stampCfg.compass) { d.compass = { deg: hdg.v != null && Date.now() - (hdg.t || 0) < 600000 ? hdg.v : null }; if (d.compass.deg == null) toast('No compass reading from this phone yet. Move the phone a little, then take the photo again.', 'warning'); }
  if (stampCfg.title && stampCfg.titleText) d.title = stampCfg.titleText;
  if (stampCfg.user && S.user) d.user = S.user.username;
  if (stampCfg.logo) d.logo = await getLogo();
  if (needGeo()) {
    let p = geo.pos && Date.now() - geo.pos.t < 120000 ? geo.pos : await refreshGeo(8000);
    p = p || geo.pos;
    if (p) {
      if (stampCfg.coords) d.coords = coordText(p);
      if (stampCfg.addr) {
        try { await geo.lookup; } catch (e) {}
        const pl = geo.place;
        d.addr = stampAddr(pl, p);
      }
      if (stampCfg.map) { try { loadMap(p); d.map = await geo.mapLookup; } catch (e) {} }   // loadMap is cached per spot + zoom
    }
  }
  return d;
}


const STAMP_FONT = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';      // the stamp's font, as before
const opOf = v => { v = Number(v); return isNaN(v) ? 1 : Math.min(1, Math.max(0.1, v / 100)); };
const shadowFor = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return 'rgba(0,0,0,0.7)'; const n = parseInt(m[1], 16), l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l < 0.45 ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)'; };
/** Compass dial: red arrow points to north, so it turns against the phone's heading. */
function drawCompass(ctx, x0, y0, size, deg, color, alpha, fs) {
  const none = deg == null; if (none) deg = 0;
  const r = size / 2, cx = x0 + r, cy = y0 + r;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, size * 0.03);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); ctx.stroke();
  ctx.translate(cx, cy); ctx.rotate(-deg * Math.PI / 180);
  const L = r * 0.72, W = r * 0.17;
  ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.moveTo(0, -L); ctx.lineTo(W, 0); ctx.lineTo(-W, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, L); ctx.lineTo(W, 0); ctx.lineTo(-W, 0); ctx.closePath(); ctx.fill();
  ctx.font = '700 ' + Math.max(8, Math.round(size * 0.17)) + 'px ' + STAMP_FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
  ctx.save(); ctx.translate(0, -r * 0.86); ctx.rotate(deg * Math.PI / 180); ctx.fillText('N', 0, 0); ctx.restore();   // letter stays upright
  ctx.restore();
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.shadowColor = shadowFor(color); ctx.shadowBlur = Math.max(2, fs * 0.16);
  ctx.font = '600 ' + Math.max(9, Math.round(fs * 0.8)) + 'px ' + STAMP_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(none ? '--' : headText(deg), cx, cy + r + Math.max(2, size * 0.04)); ctx.restore();
}
/** Sample layout: logo top-right, map bottom-left, white right-aligned text bottom-right. Wraps long lines. */
function drawStamp(ctx, w, h, d, ms) {
  const base = Math.min(w, h);
  let fs = Math.max(10, Math.round(base * 0.034 * (d.fontScale || 100) / 100));
  const font = s => '600 ' + s + 'px ' + STAMP_FONT;
  const mx = Math.round(w * 0.035), my = Math.round(base * 0.03);
  const mapS = d.map ? Math.round(base * (d.mapScale || 20) / 100) : 0, gap = d.map ? Math.round(base * 0.02) : 0;
  const maxW = w - mx * 2 - mapS - gap;
  const raw = [];
  if (d.title) raw.push(d.title);
  if (d.user) raw.push(d.user);
  if (d.time) raw.push(stampDateTime(ms));
  if (d.coords) raw.push(d.coords);
  if (d.addr) raw.push(d.addr);
  ctx.save();
  ctx.font = font(fs);
  const wrap = t => {                       // break on spaces so nothing runs off the photo
    const words = t.split(' '), out = []; let cur = '';
    words.forEach(wd => { const t2 = cur ? cur + ' ' + wd : wd; if (cur && ctx.measureText(t2).width > maxW) { out.push(cur); cur = wd; } else cur = t2; });
    if (cur) out.push(cur); return out;
  };
  const lines = []; raw.forEach(t => wrap(t).forEach(x => lines.push(x)));
  const lh = Math.round(fs * 1.25);
  // logo, top-right, in a white rounded box
  if (d.logo) {
    // the white box hugs the logo, so the logo itself grows with the Logo size slider
    const sc = (d.logoScale || 100) / 100, asp = d.logo.width / d.logo.height, pad = Math.max(3, Math.round(base * 0.012 * sc));
    let ih = base * 0.07 * sc, iw = ih * asp;
    const maxW = w * 0.7 - 2 * pad, maxH = h * 0.4 - 2 * pad;
    if (iw > maxW) { iw = maxW; ih = iw / asp; }
    if (ih > maxH) { ih = maxH; iw = ih * asp; }
    iw = Math.round(iw); ih = Math.round(ih);
    const bw = iw + pad * 2, bh = ih + pad * 2, x0 = w - mx - bw, y0 = my;
    ctx.save(); ctx.globalAlpha = opOf(d.opLogo);
    ctx.fillStyle = '#fff'; ctx.beginPath(); (ctx.roundRect ? ctx.roundRect(x0, y0, bw, bh, pad) : ctx.rect(x0, y0, bw, bh)); ctx.fill();
    ctx.drawImage(d.logo, x0 + pad, y0 + pad, iw, ih); ctx.restore();
  }
  // compass, top-left
  if (d.compass) drawCompass(ctx, mx, my, Math.round(base * 0.15 * (d.compassScale || 100) / 100), d.compass.deg, d.fontColor || '#ffffff', opOf(d.opCompass), fs);
  // map thumbnail, bottom-left
  if (d.map) {
    const x0 = mx, y0 = h - my - mapS;
    ctx.save(); ctx.globalAlpha = opOf(d.opMap); ctx.beginPath(); (ctx.roundRect ? ctx.roundRect(x0, y0, mapS, mapS, mapS * 0.06) : ctx.rect(x0, y0, mapS, mapS)); ctx.clip();
    ctx.drawImage(d.map, x0, y0, mapS, mapS); ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = Math.max(1.5, base * 0.003);
    ctx.beginPath(); (ctx.roundRect ? ctx.roundRect(x0, y0, mapS, mapS, mapS * 0.06) : ctx.rect(x0, y0, mapS, mapS)); ctx.stroke();
  }
  ctx.font = font(fs); ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';      // set again: the text size must follow the Text size slider
  ctx.globalAlpha = opOf(d.opText);
  ctx.shadowColor = shadowFor(d.fontColor); ctx.shadowBlur = Math.max(2, fs * 0.16); ctx.shadowOffsetY = Math.max(1, fs * 0.04);
  ctx.fillStyle = d.fontColor || '#ffffff';
  lines.forEach((t, i) => ctx.fillText(t, w - mx, h - my - fs * 0.2 - (lines.length - 1 - i) * lh));
  ctx.restore();
}
const PQ = { '': { max: 1280, q: 0.72 }, high: { max: 2048, q: 0.85 }, max: { max: 2560, q: 0.9 } };      // photo quality set per activity
function compress(file, opts) {
  opts = opts || {};
  const max = opts.max || 1280, q = opts.q || 0.72;
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * r), h = Math.round(img.height * r);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      if (opts.stamp && opts.data) drawStamp(ctx, w, h, opts.data, file.lastModified || Date.now());
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unreadable image')); };
    img.src = url;
  });
}
const isVideoSrc = src => /^data:video\//i.test(src);
const isVideoFile = f => /^video\//i.test(f.type) || /\.(mp4|mov|m4v|webm|3gp)$/i.test(f.name || '');
function readVideo(f) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).replace(/^data:[^;,]*/, m => /^data:video\//i.test(m) ? m : 'data:video/mp4'));
    r.onerror = () => rej(new Error('Unreadable video')); r.readAsDataURL(f);
  });
}
async function addPhotos(card, files, fromCamera) {
  const room = MAX_PHOTOS - card.photos.length;
  if (room <= 0) { toast('Photo limit reached (' + MAX_PHOTOS + ').', 'warning'); return; }
  if (files.length > room) toast('Only ' + room + ' more photo(s) allowed.', 'warning');
  files = files.slice(0, room);

  const doStamp = !!(fromCamera && stampOn);
  const prog = $('.prog', card.el), bar = $('.progress-bar', card.el);
  show(prog, true); prog.style.display = 'flex'; bar.style.width = '5%';
  const pq = PQ[((effDef(curType, $('.f-act', card.el).value, S.sub || '') || {}).pq) || ''] || PQ[''];      // the activity chosen now decides the photo quality
  const sd = doStamp ? await stampData() : null;       // GPS can take a few seconds the first time
  for (let i = 0; i < files.length; i++) {
    try {
      const f = files[i];
      if (isVideoFile(f)) {
        if (card.photos.filter(isVideoSrc).length >= MAX_VIDEOS) { toast('At most ' + MAX_VIDEOS + ' videos per merchant.', 'warning'); continue; }
        if (f.size > MAX_VIDEO_MB * 1048576) { toast('Video is ' + Math.round(f.size / 1048576) + ' MB; the limit is ' + MAX_VIDEO_MB + ' MB. Record a shorter clip or lower the video quality.', 'warning'); continue; }
        card.photos.push(await readVideo(f));
      } else card.photos.push(await compress(f, Object.assign({ stamp: doStamp, data: sd }, pq)));   // each photo keeps its own time
    } catch (e) { toast('Skipped an unreadable file.', 'warning'); }
    bar.style.width = Math.round(((i + 1) / files.length) * 100) + '%';
  }
  setTimeout(() => { prog.style.display = 'none'; }, 350);
  renderPhotos(card);
}
function renderPhotos(card) {
  const grid = $('.photo-grid', card.el);
  grid.innerHTML = '';
  card.photos.forEach((src, i) => {
    const d = document.createElement('div'); d.className = 'ph';
    d.innerHTML = (isVideoSrc(src) ? '<video src="' + src + '" muted playsinline preload="metadata"></video><span class="vbadge"><i class="bi bi-play-fill"></i></span>' : '<img src="' + src + '" alt="">') + '<button type="button" aria-label="Remove">✕</button>';
    $('button', d).onclick = () => { card.photos.splice(i, 1); renderPhotos(card); };
    grid.appendChild(d);
  });
}

/* ---- submit ---- */
$('#submitBtn').addEventListener('click', async () => {
  const items = [], keepNew = {};
  if (((typeDef(curType) || {}).subs || []).length && S.sub == null) { toast('Select the sub category.', 'danger'); $('#subWrap').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  for (let i = 0; i < S.cards.length; i++) {
    const c = S.cards[i], g = s => $(s, c.el).value.trim();
    const bad = (m, sel) => { toast('Merchant ' + (i + 1) + ': ' + m, 'danger'); if (sel) $(sel, c.el).focus(); c.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    if (!g('.f-act')) { bad('select an activity.'); return; }
    const ad = effDef(curType, g('.f-act'), S.sub || ''), L = k => lvl(ad, k);
    if (!g('.f-date')) { bad('pick the date.', '.f-date'); return; }
    const must = [['merchant', '.f-name', 'the merchant name'], ['mid', '.f-mid', 'the MID'], ['tid', '.f-tid', 'the TID'], ['business', '.f-biz', 'the business name'],
      ['serial', '.f-serial', 'the serial number'], ['oldSn', '.f-old', 'the Old S/N'], ['newSn', '.f-new', 'the New S/N'], ['btype', '.f-btype', 'the business type'],
      ['group', '.f-group', 'the group name'], ['ptype', '.f-ptype', 'the product type'], ['zone', '.f-zone', 'the Zone / Area'], ['phone', '.f-phone', 'the phone number'], ['tag', '.f-tag', 'the Tag'], ['remarks', '.f-rem', 'a remark']];
    if (L('mid') && g('.f-mid') && g('.f-mid') !== NOQR && midPrefix(curType) && g('.f-mid')[0] !== midPrefix(curType)) { bad('the MID of ' + curType + ' must start with ' + midPrefix(curType) + '.', '.f-mid'); return; }
    for (const [k, sel, txt] of must) if (L(k) === 2 && !g(sel)) { bad('enter ' + txt + '.', sel); return; }
    if (qcOn(c)) {      // QR Installation: every QR given must be scanned, and all of them belong to this merchant's MID
      const q = c.qc;
      if (!(q.given >= 1)) { bad('enter how many QR materials you gave the merchant.'); $('.qc-wrap', c.el).scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      if (q.scans.length < q.given) { bad('scan every QR you gave (' + q.scans.length + ' of ' + q.given + ' scanned).'); $('.qc-wrap', c.el).scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      if (L('mid') && g('.f-mid') && qcNorm(g('.f-mid')) !== qcNorm(q.expMid)) { bad('the MID does not match the scanned QRs (' + q.expMid + '). Fix it or tap Start over.', '.f-mid'); return; }
    }
    if (L('commune') === 2 && !$('#fDistrict').value.trim()) { bad('enter the District.'); $('#fDistrict').focus(); return; }
    if (L('hours') && ((L('hours') === 2 && !g('.f-open')) || (!!g('.f-open') !== !!g('.f-close')))) { bad('enter both opening and closing time.', g('.f-open') ? '.f-close' : '.f-open'); return; }
    if (L('phone') && g('.f-phone') && !PHONE_RE.test(g('.f-phone'))) { bad('the phone number looks wrong.', '.f-phone'); return; }
    const extra = {};
    for (const f of ((ad && ad.custom) || [])) {
      const inp = $('[data-fid="' + f.id + '"]', c.el), v = inp ? customVal(inp) : '';
      if (f.kind === 'spin' && v.length && parseFloat(v) === 0) continue;      // zero = nothing to record
      if (!v.length) { if (f.req) { bad((f.kind === 'select' || f.kind === 'radio' ? 'choose ' : f.kind === 'check' ? 'tick at least one ' : 'enter ') + f.label + '.'); if (inp && inp.focus) inp.focus(); return; } continue; }
      if ((f.kind === 'number' || f.kind === 'spin') && !/^-?\d+(\.\d+)?$/.test(v)) { bad(f.label + ' must be a number.'); return; }
      if (f.kind === 'spin' && (+v < f.min || +v > f.max)) { bad(f.label + ' must be between ' + f.min + ' and ' + f.max + '.'); return; }
      if (f.kind === 'phone' && !PHONE_RE.test(v)) { bad(f.label + ' looks wrong.'); return; }
      extra[f.id] = v;
    }
    let stockLines;
    if (ad && ad.stock) {
      stockLines = c.stock || [];
      if (ad.stock.liab && !stockLines.some(l => stkKind(l.item) === 'qty' ? l.qty >= 1 : !!l.sn)) { bad('add the item given to the merchant.'); return; }
      if (ad.stock.free) stockLines = stockLines.filter(l => (stkKind(l.item) === 'qty' ? (l.qty >= 1 && l.qty !== undefined) : !!l.sn));      // a blank deployment line is just ignored
      for (const l of stockLines) {
        const k = stkKind(l.item), dir = stkDirOf(ad.stock, l);
        if (!l.item) { bad('choose the stock item.'); return; }
        if (k !== 'qty' && !l.sn) { bad(l.item + ': enter the serial number.'); return; }
        if (k === 'qty' && !(l.qty >= 1)) { bad(l.item + ': enter the quantity.'); return; }
      }
    }
    const needPh = L('photo') ? ((ad && ad.minPh) > 0 ? ad.minPh : (L('photo') === 2 ? DEFAULT_MIN_PH : 0)) : 0;
    if (c.photos.length < needPh) { bad(needPh > 1 ? 'attach at least ' + needPh + ' photos or videos (you have ' + c.photos.length + ').' : 'attach at least one photo.'); return; }
    if (L('tag')) keepNew.tag = g('.f-tag'); if (L('zone')) keepNew.zone = g('.f-zone');
    const v = (k, sel) => L(k) ? g(sel) : '';
    const qrx = qcOn(c) ? { qrSid: c.qc.sid, qrGiven: c.qc.given } : {};
    items.push({ type: curType, activity: g('.f-act'), date: g('.f-date'), extra, locLv: L('location'), ...qrx,
      merchant: v('merchant', '.f-name'), mid: v('mid', '.f-mid'), tid: v('tid', '.f-tid'), integ: L('integ') ? $('.f-integ', c.el).checked : false, sim: L('sim') ? $('.f-sim', c.el).checked : false, standee: L('standee') ? $('.f-standee', c.el).checked : false, business: v('business', '.f-biz'), remarks: v('remarks', '.f-rem'),
      serial: v('serial', '.f-serial'), oldSn: v('oldSn', '.f-old'), newSn: v('newSn', '.f-new'), phone: v('phone', '.f-phone'), tag: v('tag', '.f-tag'),
      btype: v('btype', '.f-btype'), ptype: v('ptype', '.f-ptype'), commune: L('commune') ? $('#fDistrict').value.trim() : '', zone: v('zone', '.f-zone'), sub: S.sub || '', group: v('group', '.f-group'), hours: L('hours') && g('.f-open') ? g('.f-open') + ' - ' + g('.f-close') : '', photos: L('photo') ? c.photos : [], stock: stockLines ? stockLines.map(l => ({ item: l.item, dir: stkDirOf(ad.stock, l), sn: l.sn, qty: l.qty, cond: l.cond, reason: l.reason })) : stockLines });
  }
  const bytes = items.reduce((t, it) => t + it.photos.reduce((u, p) => u + p.length, 0), 0);
  if (bytes > 32e6) { toast('Photos and videos are too big to send together (' + Math.round(bytes / 1e6) + ' MB). Submit fewer merchants at once or remove a video.', 'danger'); return; }
  const btn = $('#submitBtn');
  busy(btn, true, 'Submitting…');
  try {
    const needLoc = items.some(it => it.locLv > 0);
    const loc = needLoc ? await currentLocation() : null;
    if (!loc && items.some(it => it.locLv === 2)) { toast('The location is required. Allow GPS (tap the refresh arrow) or choose the spot with the pin button.', 'danger'); busy(btn, false); return; }
    items.forEach(it => { if (loc && it.locLv > 0) it.location = loc; delete it.locLv; });
    if (!S.batchId) S.batchId = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);     // same id on a retry, so a repeated send is saved only once
    const r = await api('submitInstallations', S.token, items, S.batchId);
    S.batchId = null;
    toast('Saved ' + r.saved + ' ' + curType + ' (' + r.stamps[0] + (r.stamps.length > 1 ? ' … ' + r.stamps[r.stamps.length - 1].slice(-3) : '') + '). Telegram: ' + r.telegram, /FAILED|not configured/.test(r.telegram) ? 'warning' : 'success');
    if (r.stock) toast(r.stock, 'warning');
    Object.assign(keep, keepNew);
    if (items[0] && items[0].activity) rememberAct(items[0].activity);
    $('#merchantList').innerHTML = ''; S.cards = []; addMerchant();
    if (!loc && needLoc) toast('Location was not available, so it was not added to Telegram.', 'warning');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    loadSummary(); loadLast();
  } catch (e) { if (!e.net) S.batchId = null; toast(e.message + (e.net ? ' If you retry, nothing is saved twice.' : ''), 'danger'); }
  busy(btn, false);
});

/* ============================ Records ============================ */
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function range() {
  const p = $('#fPeriod').value, now = new Date();
  if (p === 'today') return { from: ymd(now), to: ymd(now) };
  if (p === 'week') { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return { from: ymd(d), to: ymd(now) }; }
  if (p === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
  if (p === 'custom') return { from: $('#fFrom').value, to: $('#fTo').value };
  return { from: '', to: '' };
}

let recTimer;
const PERIODS = [{ v: 'today', l: 'Today' }, { v: 'week', l: 'This week' }, { v: 'month', l: 'This month' }, { v: 'all', l: 'All time' }, { v: 'custom', l: 'Custom…' }];
/** A slicer: a row of buttons that drives a hidden input (so the rest of the code just reads the input). */
function slicer(boxId, inputId, options) {
  const box = $('#' + boxId), inp = $('#' + inputId);
  if (!options.some(o => o.v === inp.value)) inp.value = options.length ? options[0].v : '';
  box.innerHTML = options.map(o => '<button type="button" class="chip' + (o.v === inp.value ? ' active' : '') + '" data-v="' + esc(o.v) + '">' + esc(o.l) + '</button>').join('');
}
function bindSlicer(boxId, inputId, after) {
  $('#' + boxId).addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    $('#' + inputId).value = b.dataset.v;
    $$('.chip', $('#' + boxId)).forEach(x => x.classList.toggle('active', x === b));
    if (after) after();
  });
}
function fillTypeSlicer() { slicer('slType', 'fType', [{ v: '', l: 'All' }].concat(TYPES.map(t => ({ v: t, l: shortName(t) })))); }
/** Sub category filter: the sub categories of the chosen category (or of all). */
function fillSubFilter() {
  const ft = $('#fType').value, names = new Set();
  CATALOG.filter(t => !ft || t.name === ft).forEach(t => (t.subs || []).forEach(s => names.add(s.n)));
  const opts = [{ v: '', l: 'All' }].concat(Array.from(names).map(n => ({ v: n, l: n })));
  slicer('slSub', 'fSub', names.size ? opts : [{ v: '', l: 'All' }]);
  show($('#subFilterWrap'), names.size > 0);
}
function fillActivityFilter() {
  const cat = $('#fType').value, fs = $('#fSub').value, set = new Set();
  CATALOG.filter(t => !cat || t.name === cat).forEach(t => t.acts.forEach(a => { if (actInSub(t, a, fs)) set.add(a.n); }));
  slicer('slActivity', 'fActivity', [{ v: '', l: 'All' }].concat(Array.from(set).map(a => ({ v: a, l: a }))));
}
S.branches = []; S.branchOff = new Set();
function paintBranches() {
  if (!(S.user && S.user.role === 'Admin')) return;
  $('#slBranch').innerHTML = S.branches.map(b => '<button type="button" class="chip' + (S.branchOff.has(b) ? '' : ' active') + '" data-b="' + esc(b) + '" aria-pressed="' + (!S.branchOff.has(b)) + '">' + esc(b) + '</button>').join('');
}
$('#slBranch').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  const c = b.dataset.b;
  if (S.branchOff.has(c)) S.branchOff.delete(c);
  else if (S.branches.filter(x => !S.branchOff.has(x)).length > 1) S.branchOff.add(c);     // keep at least one branch included
  else { toast('Keep at least one branch included.', 'warning'); return; }
  paintBranches(); loadRecords();
});
async function loadRecords() {
  const r = range(), admin = S.user.role === 'Admin', wide = isWide();
  $('#recBody').innerHTML = '<tr><td colspan="6" class="empty"><span class="spinner-border spinner-border-sm"></span></td></tr>';
  try {
    const f = { user: $('#fUser').value, type: $('#fType').value, sub: $('#fSub').value, activity: $('#fActivity').value, status: $('#fStatus').value, from: r.from, to: r.to };
    if (admin && S.branchOff.size) f.branches = S.branches.filter(b => !S.branchOff.has(b));
    const data = await api('getRecords', S.token, f);
    S.rows = data.rows;
    S.pending = data.pending || 0; paintPending(); paintStatus(data);
    if (wide) slicer('slUser', 'fUser', [{ v: '', l: 'All staff' }].concat(data.users.map(u => ({ v: u, l: u }))));
    if (admin) {
      S.branches = data.branches || []; S.branchOff = new Set(Array.from(S.branchOff).filter(b => S.branches.includes(b))); paintBranches();
    }
    S.byUserCat = data.byUserCat || {}; S.agg = data.agg || []; S.period = data.period || { from: '', to: '' };
    drawChart();
    renderRows();
  } catch (e) { toast(e.message, 'danger'); }
}
const STATUS_OPTS = [{ v: '', l: 'All' }, { v: 'Pending', l: 'Pending' }, { v: 'Returned', l: 'Returned' }, { v: 'Approved', l: 'Approved' }, { v: 'None', l: 'No review' }];
function paintStatus(data) {
  const any = (CATALOG || []).some(t => t.acts.some(a => a.review)) || (data && data.rows.some(r => r.review && r.review.status)) || $('#fStatus').value;
  show($('#statusWrap'), !!any);
  if (any) slicer('slStatus', 'fStatus', STATUS_OPTS);
}
bindSlicer('slStatus', 'fStatus', () => loadRecords());
function paintPending() {
  const n = S.pending || 0, b = $('#rvBadge'); b.textContent = n; show(b, n > 0);
  const db = $('#dnBadge'); if (db) { db.textContent = n; show(db, n > 0); }
}
const stPill = st => st ? '<span class="st-pill ' + (st === 'Pending' ? 'st-p' : st === 'Approved' ? 'st-a' : 'st-r') + '">' + esc(st) + '</span>' : '';
/* ---- Review queue (admin) ---- */
const reviewModal = new bootstrap.Modal($('#reviewModal'));
S.rvStatus = 'Pending'; S.rvRows = [];
async function loadReview() {
  $('#rvList').innerHTML = '<div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span></div>';
  try {
    const d = await api('getReviewQueue', S.token, S.rvStatus);
    S.rvRows = d.rows; S.pending = d.counts.Pending; paintPending();
    $('#rvChips').innerHTML = ['Pending', 'Returned', 'Approved', 'All'].map(x => '<button type="button" class="chip' + (x === S.rvStatus ? ' active' : '') + '" data-v="' + x + '">' + x + (x !== 'All' ? ' <b>' + d.counts[x] + '</b>' : '') + '</button>').join('');
    $('#rvList').innerHTML = d.rows.length ? d.rows.map(r => rvItem(r)).join('') : '<div class="empty"><i class="bi bi-inbox"></i>Nothing here</div>';
  } catch (e) { $('#rvList').innerHTML = ''; toast(e.message, 'danger'); }
}
function rvItem(r) {
  const rv = r.review || {}, bits = [['Merchant', r.merchant], [midLabelFor(r.type, r.mid), r.mid], ['TID', r.tid], ['Integration', r.integ], ['SIM', r.sim], ['POS Standee', r.standee], ['Staff', r.user + (r.branch && r.branch !== '(none)' ? ' · ' + r.branch : '')], ['Photos', r.photos]].concat(Object.keys(r.fields || {}).map(k => [k, r.fields[k]])).filter(x => x[1] !== '' && x[1] != null);
  return '<div class="rv-item" data-stamp="' + esc(r.stamp) + '"><div class="d-flex justify-content-between gap-2"><b>' + esc(r.merchant || r.mid || r.stamp) + '</b>' + stPill(rv.status) + '</div>' +
    '<div class="small text-muted">' + esc(r.type + (r.sub ? ' · ' + r.sub : '') + ' · ' + r.activity + ' · ' + fmtTs(r.ts)) + '</div>' +
    '<div class="rd-grid mt-2">' + bits.map(x => '<div class="rd-i"><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></div>').join('') + '</div>' +
    (r.tgLink ? '<div class="mt-2"><a class="btn btn-soft btn-sm" href="' + esc(r.tgLink) + '" target="_blank" rel="noopener"><i class="bi bi-images me-1"></i>Photos</a></div>' : '') +
    (rv.status !== 'Pending' && (rv.by || rv.note) ? '<div class="small text-muted mt-2">' + esc(rv.status + ' by ' + rv.by + (rv.time ? ' · ' + rv.time : '')) + '</div>' : '') +
    (rv.status === 'Returned' && rv.note ? '<div class="rv-note">' + esc(rv.note) + '</div>' : '') +
    (rv.status === 'Pending' ? '<div class="mt-2 rv-act"><div class="d-flex gap-2"><button type="button" class="btn btn-success btn-sm rv-ok"><i class="bi bi-check-lg me-1"></i>Approve</button><button type="button" class="btn btn-outline-danger btn-sm rv-ret"><i class="bi bi-arrow-return-left me-1"></i>Return…</button></div>' +
      '<div class="hidden rv-note-box mt-2"><textarea class="form-control form-control-sm rv-note-in" rows="2" maxlength="300" placeholder="What should ' + esc(r.user) + ' fix?"></textarea><button type="button" class="btn btn-danger btn-sm mt-2 rv-send">Send back</button></div></div>' : '') + '</div>';
}
$('#reviewBtn').addEventListener('click', () => { S.rvStatus = 'Pending'; reviewModal.show(); loadReview(); });
$('#rvChips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; S.rvStatus = b.dataset.v; loadReview(); });
$('#rvList').addEventListener('click', async e => {
  const item = e.target.closest('.rv-item'); if (!item) return;
  const stamp = item.dataset.stamp;
  if (e.target.closest('.rv-ret')) { show($('.rv-note-box', item), true); $('.rv-note-in', item).focus(); return; }
  const ok = e.target.closest('.rv-ok'), send = e.target.closest('.rv-send');
  if (!ok && !send) return;
  const btn = ok || send, note = send ? $('.rv-note-in', item).value.trim() : '';
  if (send && !note) { toast('Write what the staff member should fix.', 'warning'); return; }
  busy(btn, true, 'Saving…');
  try {
    const r = await api('reviewRecord', S.token, stamp, ok ? 'approve' : 'return', note);
    toast((ok ? 'Approved' : 'Returned') + '. Telegram: ' + r.telegram, r.telegram === 'updated' ? 'success' : 'warning');
    loadReview(); loadSummary();
    if (!$('#pane-records').classList.contains('hidden')) loadRecords();
  } catch (ex) { toast(ex.message, 'danger'); busy(btn, false); }
});
function filtered() {
  const q = $('#fSearch').value.trim().toLowerCase();
  if (!q) return S.rows;
  return S.rows.filter(r => [r.stamp, r.type, r.activity, r.tid, r.user, r.business, r.merchant, r.mid, r.remarks, r.phone, r.tag, r.serial, r.oldSn, r.newSn, r.btype, r.ptype, r.commune, r.zone, r.sub, r.group, r.extra].join(' ').toLowerCase().includes(q));
}
function locLink(t) {
  const m = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(String(t || ''));
  return m ? '<a href="https://maps.google.com/?q=' + m[1] + ',' + m[2] + '" target="_blank" rel="noopener"><i class="bi bi-geo-alt"></i></a>' : '';
}
/** The less important details of a record, shown when its row is opened (empty ones are left out). */
function recDetail(r) {
  const it = [['Time', fmtTs(r.ts)], ['Stamp', r.stamp], ['Business', r.business], ['Business type', r.btype], ['Hours', r.hours], ['Group', r.group], ['Product type', r.ptype], ['District', r.commune], ['Zone', r.zone],
    ['Phone', r.phone], ['Tag', r.tag], ['Serial No', r.serial], ['Old S/N', r.oldSn], ['New S/N', r.newSn], ['Remarks', r.remarks]]
    .concat(r.review && r.review.status ? [['Review', r.review.status + (r.review.by ? ' · ' + r.review.by : '') + (r.review.time ? ' · ' + r.review.time : '')], ['Review note', r.review.note]] : []);
  const fl = r.fields && Object.keys(r.fields).length ? Object.keys(r.fields).map(k => [k, r.fields[k]]) : (r.extra ? [['Fields', r.extra]] : []);
  const cells = it.concat(fl).filter(x => x[1] !== '' && x[1] != null).map(x => '<div class="rd-i"><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></div>');
  const loc = locLink(r.loc); if (loc) cells.push('<div class="rd-i"><span>Location</span><b>' + loc + ' ' + esc(String(r.loc).split(' | ')[0].replace(/,?\s*-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, '')) + '</b></div>');
  return cells.length ? '<div class="rd-grid">' + cells.join('') + '</div>' : '<div class="text-muted small">No more details.</div>';
}
function renderRows() {
  const rows = filtered();
  $('#recCount').textContent = rows.length;
  $('#recBody').innerHTML = rows.length ? rows.map((r, i) =>
    '<tr class="rec-row" data-i="' + i + '"><td class="text-nowrap"><div class="fw-semibold">' + esc(fmtD(r.date || r.ts)) + '</div><div class="rec-sub">' + esc(r.stamp) + '</div></td>' +
    '<td><span class="pill">' + esc(shortName(r.type)) + '</span>' + (r.sub ? ' <span class="rec-sub">' + esc(r.sub) + '</span>' : '') + '<div class="fw-semibold">' + esc(r.activity) + (r.review && r.review.status ? ' ' + stPill(r.review.status) : '') + '</div></td>' +
    '<td><div class="fw-semibold">' + esc(r.merchant) + '</div><div class="rec-sub">' + esc([r.mid ? midLabelFor(r.type, r.mid) + ' ' + r.mid : '', r.tid ? 'TID ' + r.tid : ''].filter(Boolean).join(' · ')) + '</div></td>' +
    '<td><span class="pill">' + esc(r.user) + '</span></td>' +
    '<td class="text-center text-nowrap">' + (r.photos || '') + '</td>' +
    '<td class="text-end text-nowrap rec-go"><i class="bi bi-chevron-down"></i></td></tr>' +
    '<tr class="rec-detail hidden"><td colspan="6">' + recDetail(r) + '</td></tr>'
  ).join('') : '<tr><td colspan="6"><div class="empty"><i class="bi bi-inbox"></i>No records for this filter</div></td></tr>';
}
$('#recBody').addEventListener('click', e => {      // tap a row: its details open under it
  if (e.target.closest('a')) return;
  const tr = e.target.closest('.rec-row'); if (!tr) return;
  const d = tr.nextElementSibling, open = d.classList.contains('hidden');
  $$('#recBody .rec-row.open').forEach(o => { if (o !== tr) { o.classList.remove('open'); o.nextElementSibling.classList.add('hidden'); } });      // only one record open at a time
  d.classList.toggle('hidden', !open); tr.classList.toggle('open', open);
});
/* ---- Team today / 7-day trend / staff drill-down (admin, supervisor: read-only) ---- */
S.teamBranch = ''; S.teamRange = '7';
const RANGES = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['mtd', 'Month to date'], ['lastmonth', 'Last month']];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayLbl = d => { const t = new Date(d + 'T00:00:00'); return DOW[t.getDay()] + ' ' + d.slice(8); };
const pctTxt = (a, b) => b ? (a >= b ? '+' : '') + Math.round((a - b) / b * 100) + '%' : (a ? 'new' : '–');
async function loadTeam() {
  const on = isWide(); show($('#teamCard'), on); show($('#trendCard'), on); if (!on) return;
  try {
    const d = await api('getTeam', S.token, { branch: S.teamBranch, range: S.teamRange });
    const rl = (RANGES.find(r => r[0] === d.range) || RANGES[0])[1];
    $('#trTitle').textContent = rl; $('#trRange').innerHTML = RANGES.map(r => '<button type="button" class="chip' + (d.range === r[0] ? ' active' : '') + '" data-v="' + r[0] + '">' + r[1] + '</button>').join('');
    $('#teamDate').textContent = fmtD(d.today);
    const bs = d.branches || []; show($('#teamBranch'), bs.length > 1);
    $('#teamBranch').innerHTML = [''].concat(bs).map(b => '<button type="button" class="chip' + (S.teamBranch === b ? ' active' : '') + '" data-v="' + esc(b) + '">' + (esc(b) || 'All') + '</button>').join('');
    $('#teamKpi').innerHTML = '<div><b>' + d.total + '</b><span>Records today</span></div><div><b>' + d.active + ' / ' + d.staff.length + '</b><span>Staff with a record</span></div><div><b>' + (d.staff.length - d.active) + '</b><span>No record yet</span></div>';
    const none = d.staff.filter(m => !m.today).map(m => m.username);
    $('#teamNone').innerHTML = none.length ? '<span class="text-muted">No record yet:</span> <b style="color:#b45309">' + none.map(esc).join(', ') + '</b>' : (d.staff.length ? '<span class="up fw-semibold">Everyone has a record today.</span>' : '');
    const showBr = isAdminOrMulti(d);
    $('#teamList').innerHTML = d.staff.length ? d.staff.map(m => '<div class="tm-row' + (m.today ? '' : ' none') + '" data-u="' + esc(m.username) + '"><div class="nm"><b>' + esc(m.username) + '</b>' + (showBr && m.branch ? ' <span class="small text-muted">· ' + esc(m.branch) + '</span>' : '') + '<div class="small when ' + (m.today ? 'text-muted' : '') + '">' + (m.today ? 'last record ' + esc((m.last.match(/(\d{2}:\d{2})/) || [])[1] || '') : 'no record yet') + ' · ' + rl.toLowerCase() + ': ' + m.week + '</div></div><span class="n">' + m.today + '</span><i class="bi bi-chevron-right text-muted"></i></div>').join('') : '<div class="small text-muted">No staff in your team yet.</div>';
    const mx = Math.max(1, ...d.days.map(x => Math.max(x.n, x.prev)));
    $('#trendSum').innerHTML = esc(fmtD(d.from)) + ' – ' + esc(fmtD(d.to)) + ': <b>' + d.week + '</b> · the period before <b>' + d.prevWeek + '</b> · <b class="' + (d.week >= d.prevWeek ? 'up' : 'dn') + '">' + pctTxt(d.week, d.prevWeek) + '</b>';
    const sx = Math.max(1, ...d.staff.map(m => m.week)), byRange = d.staff.slice().sort((a, b) => b.week - a.week || (a.username < b.username ? -1 : 1));
    $('#trStaffTitle').textContent = 'Staff · ' + rl.toLowerCase();
    $('#trStaff').innerHTML = byRange.length ? byRange.map(m => '<div class="tm-row" data-u="' + esc(m.username) + '"><div class="nm"><div class="d-flex justify-content-between small"><b>' + esc(m.username) + '</b><b>' + m.week + '</b></div><div class="tr-bar" style="width:' + Math.max(m.week ? 3 : 0, Math.round(m.week / sx * 100)) + '%"></div></div><i class="bi bi-chevron-right text-muted"></i></div>').join('') : '<div class="small text-muted">No staff in your team yet.</div>';
    $('#trendBars').innerHTML = d.days.map(x => '<div class="tr-row"><span>' + dayLbl(x.date) + '</span><div><div class="tr-bar" style="width:' + Math.max(x.n ? 3 : 0, Math.round(x.n / mx * 100)) + '%"></div><div class="tr-bar p" style="width:' + Math.max(x.prev ? 3 : 0, Math.round(x.prev / mx * 100)) + '%"></div></div><span class="text-end"><b>' + x.n + '</b> <span class="text-muted small">vs ' + x.prev + '</span></span></div>').join('');
  } catch (e) { show($('#teamCard'), false); show($('#trendCard'), false); }
  dashAlerts();
}
const isAdminOrMulti = d => S.user.role === 'Admin' || /,/.test(S.user.branch || '');
$('#teamBranch').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; S.teamBranch = b.dataset.v; loadTeam(); });
const teamModal = new bootstrap.Modal($('#teamModal'));
$('#trRange').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; S.teamRange = b.dataset.v; loadTeam(); });
async function openTeamStaff(e) {
  const row = e.target.closest('.tm-row'); if (!row) return;
  try {
    const d = await api('getTeamStaff', S.token, row.dataset.u);
    $('#tmName').textContent = d.username + (d.branch ? ' · ' + d.branch : '');
    $('#tmKpi').innerHTML = '<div><b>' + d.today + '</b><span>Today</span></div><div><b>' + d.week + '</b><span>Last 7 days</span></div>';
    $('#tmActs').innerHTML = d.byActivity.length ? d.byActivity.map(a => '<div class="d-flex justify-content-between small py-1"><span><span class="pill">' + esc(shortName(a.type)) + '</span> ' + esc(a.activity) + '</span><b>' + a.n + '</b></div>').join('') : '<div class="small text-muted">Nothing in the last 7 days.</div>';
    $('#tmRecs').innerHTML = d.latest.length ? d.latest.map(r => '<div class="py-1 border-top small"><div><b>' + esc(r.merchant || '—') + '</b>' + (r.mid ? ' <span class="text-muted">MID ' + esc(r.mid) + '</span>' : '') + '</div><div class="text-muted"><span class="pill">' + esc(shortName(r.type)) + '</span> ' + esc(r.activity) + ' · ' + esc(fmtTs(r.ts)) + (r.photos ? ' · ' + r.photos + ' photos' : '') + '</div></div>').join('') : '<div class="small text-muted">No records yet.</div>';
    S.tmUser = d.username; teamModal.show();
  } catch (ex) { toast(ex.message, 'danger'); }
}
$('#teamList').addEventListener('click', openTeamStaff); $('#trStaff').addEventListener('click', openTeamStaff);
$('#tmAll').addEventListener('click', () => { teamModal.hide(); $('#fUser').value = S.tmUser; $('#fPeriod').value = 'all'; slicer('slPeriod', 'fPeriod', PERIODS); loadRecords(); setTimeout(() => $('#recBody').scrollIntoView({ behavior: 'smooth' }), 300); });
/* ---- Dashboard: summary tiles + one chart. Admin picks the grouping (activities / sub categories / categories) and the view (totals / by staff). ---- */
// Colour by category for totals; by position for the by-staff series (first four are the validated slots; the rest are extras).
const SLOT_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#8a5cd0', '#d6458a', '#14a3b8', '#7a8190', '#a3b21a', '#c0392b', '#34495e', '#e67ebf'];
const SLOT_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#9b73dd', '#e0579a', '#25b4c9', '#8d94a3', '#b4c32b', '#d4493a', '#5d7a96', '#ee8fcb'];
const catColor = (t, dark) => (dark ? SLOT_DARK : SLOT_LIGHT)[Math.max(0, TYPES.indexOf(t)) % 12];
const slotColor = (i, dark) => (dark ? SLOT_DARK : SLOT_LIGHT)[i % 12];
const fmtD = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? m[3] + '-' + MON[+m[2] - 1] + '-' + m[1] : ''; };
/** 26-Oct-2026 05:58:12 from the stored 2026-10-26 05:58:12 */
const fmtTs = s => { const d = fmtD(s), t = /(\d{2}:\d{2}(?::\d{2})?)\s*$/.exec(String(s || '')); return d + (t ? ' ' + t[1] : ''); };
const GROUPS = [{ v: 'act', l: 'Activities' }, { v: 'sub', l: 'Sub categories' }, { v: 'cat', l: 'Categories' }, { v: 'cs', l: 'Cat + Sub' }];
const VIEWS = [{ v: 'total', l: 'Totals' }, { v: 'staff', l: 'By staff' }];
const ZEROS = [{ v: '0', l: 'With records' }, { v: '1', l: 'All, incl. zero' }];
S.group = 'act'; S.view = 'total'; S.zero = false; S.agg = []; S.period = { from: '', to: '' };
/** Name of the stand-alone group of a category that has sub categories ("General", or "Other" when a sub category already has that name). */
const standName = t => ((t && t.subs) || []).some(s => /^general$/i.test(s.n)) ? 'Other' : 'General';
const itemOf = (a, g) => g === 'cs' ? (a.sub ? { key: a.type + '|' + a.sub, type: a.type, label: shortName(a.type) + ' · ' + a.sub } : { key: a.type + '|', type: a.type, label: shortName(a.type) + (((typeDef(a.type) || {}).subs || []).length ? ' · ' + standName(typeDef(a.type)) : '') })
  : g === 'cat' ? { key: a.type, type: a.type, label: shortName(a.type) }
  : g === 'sub' ? (a.sub ? { key: a.type + '|' + a.sub, type: a.type, label: shortName(a.type) + ' · ' + a.sub } : null)
  : { key: a.type + '|' + a.activity, type: a.type, label: shortName(a.type) + ' · ' + a.activity };
/** Every item the admin has set up for this grouping (so zero ones show too), limited by the category / activity filters. */
function catalogItems(g) {
  const ft = $('#fType').value, fa = $('#fActivity').value, fs = $('#fSub').value, out = [];
  CATALOG.filter(t => !ft || t.name === ft).forEach(t => {
    if (g === 'cat') out.push(itemOf({ type: t.name }, g));
    else if (g === 'cs') { (t.subs || []).filter(s => !fs || s.n === fs).forEach(s => out.push(itemOf({ type: t.name, sub: s.n }, g))); if (!fs || fs === SUB_NONE) out.push(itemOf({ type: t.name }, g)); }
    else if (g === 'sub') (t.subs || []).filter(s => !fs || s.n === fs).forEach(s => out.push(itemOf({ type: t.name, sub: s.n }, g)));
    else t.acts.filter(a => (!fa || a.n === fa) && actInSub(t, a, fs)).forEach(a => out.push(itemOf({ type: t.name, activity: a.n }, g)));
  });
  return out;
}
function dashModel() {
  const admin = isWide(), g = S.group, view = admin ? S.view : 'total', agg = S.agg || [];
  const items = new Map(), per = new Map();         // item key -> { label, type, total }, staff -> { item key -> count }
  catalogItems(g).forEach(i => items.set(i.key, Object.assign({ total: 0 }, i)));
  let total = 0, skipped = 0;
  agg.forEach(a => {
    const it = itemOf(a, g); if (!it) { skipped += a.count; return; }
    if (!items.has(it.key)) items.set(it.key, Object.assign({ total: 0 }, it));
    items.get(it.key).total += a.count; total += a.count;
    if (!per.has(a.user)) per.set(a.user, {}); const m = per.get(a.user); m[it.key] = (m[it.key] || 0) + a.count;
  });
  const list = Array.from(items.entries()).map(([key, v]) => Object.assign({ key }, v));
  const staff = Array.from(per.keys()).sort((x, y) => sumOf(per.get(y)) - sumOf(per.get(x)) || x.localeCompare(y));
  const top = list.slice().sort((x, y) => y.total - x.total)[0];
  const days = S.period.from && S.period.to ? Math.round((new Date(S.period.to) - new Date(S.period.from)) / 864e5) + 1 : 0;
  const base = { g, view, total, skipped, staffN: new Set(agg.map(a => a.user)).size, top: top && top.total ? top : null, days };
  if (view === 'staff' && staff.length) {
    const used = S.zero ? list : list.filter(i => i.total > 0);
    return Object.assign(base, { labels: staff, legend: true, datasets: used.map((i, n) => ({ label: i.label, color: slotColor(n), data: staff.map(s => per.get(s)[i.key] || 0) })) });
  }
  const shown = S.zero ? list : list.filter(i => i.total > 0);      // only columns with a value, unless "All, incl. zero" is chosen
  return Object.assign(base, { labels: shown.map(i => i.label), legend: false, datasets: [{ label: 'Records', colors: shown.map(i => i.type), data: shown.map(i => i.total) }] });
}
const sumOf = o => Object.keys(o).reduce((n, k) => n + o[k], 0);
function buildChart(canvas, m, o) {
  const dark = !!o.dark, ink = dark ? '#eceefd' : '#1e1b4b', muted = dark ? '#9aa0c0' : '#6b7280';
  const grid = dark ? '#2a2d4d' : '#e5e7eb', surface = o.exporting ? '#ffffff' : (dark ? '#181a31' : '#ffffff');
  const valueLabels = { id: 'valueLabels', afterDatasetsDraw(chart) {       // counts above the columns (also covers the low-contrast colours)
    const c = chart.ctx; c.save(); c.fillStyle = ink; c.textAlign = 'center'; c.textBaseline = 'bottom';
    c.font = '600 ' + (o.exporting ? 14 : 11) + 'px -apple-system, "Segoe UI", Roboto, sans-serif';
    chart.data.datasets.forEach((ds, di) => chart.getDatasetMeta(di).data.forEach((bar, i) => { if (ds.data[i]) c.fillText(String(ds.data[i]), bar.x, bar.y - 3); }));
    c.restore(); } };
  const background = { id: 'bg', beforeDraw(chart) {
    if (!o.exporting) return;
    const c = chart.ctx; c.save(); c.globalCompositeOperation = 'destination-over'; c.fillStyle = '#ffffff'; c.fillRect(0, 0, chart.width, chart.height); c.restore(); } };
  return new Chart(canvas, {
    type: 'bar',
    data: { labels: m.labels, datasets: m.datasets.map(d => ({
      label: d.label, backgroundColor: d.colors ? d.colors.map(t => catColor(t, dark)) : d.color, borderColor: surface, borderWidth: 2,
      borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: 'bottom', maxBarThickness: 34, data: d.data })) },
    options: {
      responsive: !o.exporting, maintainAspectRatio: false, devicePixelRatio: o.exporting ? 2 : undefined,
      animation: o.exporting ? false : { duration: 250 },
      layout: { padding: { top: 20, bottom: o.footer ? 26 : 0 } },
      plugins: {
        legend: { display: m.legend, position: 'top', labels: { color: ink, usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, boxHeight: 10 } },
        title: { display: !!o.title, text: o.title || '', color: ink, align: 'start', font: { size: 16, weight: '600' }, padding: { bottom: 10 } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0, color: muted }, grid: { color: grid } },
        x: { ticks: { color: muted, autoSkip: false, maxRotation: 60, minRotation: m.labels.length > 6 ? 40 : 0 }, grid: { display: false } }
      }
    },
    plugins: [valueLabels, background, { id: 'who', afterDraw(chart) {       // who the picture is about, under the graph
      if (!o.footer) return; const c = chart.ctx; c.save(); c.fillStyle = muted; c.textAlign = 'left'; c.textBaseline = 'bottom';
      c.font = '600 14px -apple-system, "Segoe UI", Roboto, sans-serif'; c.fillText(o.footer, 8, chart.height - 6); c.restore(); } }]
  });
}
function paintDashControls() {
  const admin = isWide();
  show($('#dashCtl'), true); show($('#viewWrap'), !!admin);
  $('#slGroup').innerHTML = GROUPS.map(o => '<button type="button" class="chip' + (o.v === S.group ? ' active' : '') + '" data-v="' + o.v + '">' + o.l + '</button>').join('');
  $('#slView').innerHTML = VIEWS.map(o => '<button type="button" class="chip' + (o.v === S.view ? ' active' : '') + '" data-v="' + o.v + '">' + o.l + '</button>').join('');
  $('#slZero').innerHTML = ZEROS.map(o => '<button type="button" class="chip' + ((o.v === '1') === S.zero ? ' active' : '') + '" data-v="' + o.v + '">' + o.l + '</button>').join('');
}
$('#slZero').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { S.zero = b.dataset.v === '1'; drawChart(); } });
$('#slGroup').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { S.group = b.dataset.v; drawChart(); } });
$('#slView').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { S.view = b.dataset.v; drawChart(); } });
/** Who the graph is about: the staff member (their own screen) or the staff / branches the admin is looking at. */
function whoText() {
  const admin = isWide();
  if (!admin) return 'Staff: ' + S.user.username + (S.user.staffId ? ' (' + S.user.staffId + ')' : '') + (S.user.branch ? ' · Branch ' + S.user.branch : '');
  const br = S.branchOff.size ? S.branches.filter(b => !S.branchOff.has(b)).join(', ') : 'all branches';
  return 'Staff: ' + ($('#fUser').value || 'All staff') + ' · Branch: ' + br;
}
function drawChart() {
  const m = S.chartModel = dashModel(), admin = isWide();
  show($('#chartCard'), (S.agg || []).length > 0);
  $('#chartTitleTxt').textContent = admin ? 'Dashboard' : 'My dashboard';
  paintDashControls();
  $('#chartWho').textContent = whoText();
  $('#periodTxt').textContent = S.period.from ? 'Records from ' + fmtD(S.period.from) + ' to ' + fmtD(S.period.to) + (m.days ? ' · ' + m.days + ' day' + (m.days > 1 ? 's' : '') : '') : '';
  const tiles = [['Records', m.total, 'in this period'], admin ? ['Staff', m.staffN, 'with records'] : ['Days', m.days, 'in this period'],
    ['Top ' + ({ act: 'activity', sub: 'sub category', cat: 'category', cs: 'category + sub' }[m.g]), m.top ? m.top.total : 0, m.top ? m.top.label : '—'], ['Per day', m.days ? (m.total / m.days).toFixed(1) : '0', 'average']];
  $('#kpiRow').innerHTML = tiles.map(t => '<div class="kpi"><div class="k-l">' + esc(t[0]) + '</div><div class="k-v">' + esc(String(t[1])) + '</div><div class="k-s">' + esc(t[2]) + '</div></div>').join('');
  const note = $('#chartNote'); show(note, m.skipped > 0);
  if (m.skipped) note.textContent = m.skipped + ' record' + (m.skipped > 1 ? 's' : '') + ' without a sub category are not in this chart.';
  if (S.chart) { S.chart.destroy(); S.chart = null; }
  if (!(S.agg || []).length) return;
  $('#chartInner').style.minWidth = Math.max(0, m.labels.length * (m.datasets.length > 1 ? m.datasets.length * 30 : 44) + 80) + 'px';   // scrolls sideways with many items
  S.chart = buildChart($('#chart'), m, { dark: isDark() });
}
function chartTitle() {
  const m = S.chartModel, admin = isWide();
  const what = { act: 'activity', sub: 'sub category', cat: 'category', cs: 'category and sub category' }[m.g];
  const parts = [];
  if (S.period.from) parts.push(fmtD(S.period.from) + ' to ' + fmtD(S.period.to));
  if (admin && S.branchOff.size) parts.push('branches: ' + S.branches.filter(b => !S.branchOff.has(b)).join(', '));
  if ($('#fType').value) parts.push($('#fType').value);
  if ($('#fSub').value) parts.push($('#fSub').value === SUB_NONE ? 'no sub category' : $('#fSub').value);
  if ($('#fActivity').value) parts.push($('#fActivity').value);
  return (admin ? 'Records by ' : 'My records by ') + what + (m.view === 'staff' ? ' and staff' : '') + ' — ' + parts.join(' · ');
}
async function saveChartPng() {
  const m = S.chartModel;
  if (!m || !m.total) { toast('Nothing to save.', 'warning'); return; }
  const btn = $('#chartSaveBtn'); busy(btn, true, 'Saving…');
  try {
    const cv = document.createElement('canvas');          // always light, with a white background, so it reads anywhere
    cv.width = Math.max(900, m.labels.length * (m.datasets.length > 1 ? m.datasets.length * 40 : 56) + 140); cv.height = 560;
    const ch = buildChart(cv, m, { dark: false, exporting: true, title: chartTitle(), footer: whoText() });
    await new Promise(res => requestAnimationFrame(res));
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    ch.destroy();
    const name = 'dashboard_' + ymd(new Date()) + '.png';
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {      // phones: share sheet -> "Save Image"
      try { await navigator.share({ files: [file], title: 'Dashboard' }); busy(btn, false); return; }
      catch (e) { if (e && e.name === 'AbortError') { busy(btn, false); return; } }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('Picture saved.', 'success');
  } catch (e) { toast('Could not save the picture.', 'danger'); }
  busy(btn, false);
}
$('#chartSaveBtn').addEventListener('click', saveChartPng);

['#fFrom', '#fTo'].forEach(x => $(x).addEventListener('change', loadRecords));
slicer('slPeriod', 'fPeriod', PERIODS); fillTypeSlicer(); fillSubFilter(); fillActivityFilter();
bindSlicer('slUser', 'fUser', loadRecords);
bindSlicer('slPeriod', 'fPeriod', () => { const c = $('#fPeriod').value === 'custom'; show($('#fCustomWrap'), c); if (!c) loadRecords(); });
bindSlicer('slType', 'fType', () => { fillSubFilter(); fillActivityFilter(); loadRecords(); });
bindSlicer('slSub', 'fSub', () => { fillActivityFilter(); loadRecords(); });
bindSlicer('slActivity', 'fActivity', loadRecords);
$('#fSearch').addEventListener('input', () => { clearTimeout(recTimer); recTimer = setTimeout(renderRows, 150); });

/** Header + rows of the records currently shown (same for CSV and Copy). */
const EXPORT_COLS = [      // the same order as the sheet's columns
  ['Stamp', r => r.stamp], ['Timestamp', r => fmtTs(r.ts)], ['Staff', r => r.user], ['Category', r => r.type], ['Sub Category', r => r.sub], ['Activity', r => r.activity],
  ['Installed/Action Date', r => fmtD(r.date || r.ts)], ['Merchant Name', r => r.merchant], ['Business Name', r => r.business], ['Business Type', r => r.btype], ['Product Type', r => r.ptype],
  ['MID', r => r.mid], ['TID', r => r.tid], ['Phone', r => r.phone], ['Tag', r => r.tag], ['Location', r => r.loc], ['District', r => r.commune], ['Zone/Area', r => r.zone],
  ['Business Hours', r => r.hours], ['Group Name', r => r.group], ['Serial No', r => r.serial], ['Old S/N', r => r.oldSn], ['New S/N', r => r.newSn],
  ['Photos', r => r.photos], ['Remarks', r => r.remarks], ['Integration', r => r.integ], ['SIM', r => r.sim], ['POS Standee', r => r.standee]
];
/** The export columns plus one column per added field (the same names as the sheet's headers). */
const exportCols = () => { const seen = [], names = []; filtered().forEach(r => Object.keys(r.fields || {}).forEach(k => { if (!seen.includes(k.toLowerCase())) { seen.push(k.toLowerCase()); names.push(k); } })); return EXPORT_COLS.concat(names.map(n => [n, r => (r.fields || {})[n] || ''])); };
/** The important columns for a KPI update, in this order. */
const KPI_COLS = ['Category', 'Sub Category', 'Activity', 'MID', 'Merchant Name', 'Installed/Action Date'];
/** Position of a record's category + activity in the admin's list (unknown ones go last). */
function activityRank(r) {
  let n = 0;
  for (const t of CATALOG) {
    if (t.name === r.type) { const i = t.acts.findIndex(a => a.n === r.activity); return n + (i < 0 ? t.acts.length : i); }
    n += t.acts.length + 1;
  }
  return 1e6;
}
/** KPI rows: the important columns only, in the admin's category / activity order, then by date and time within each activity. */
function kpiTable() {
  const use = KPI_COLS.map(n => EXPORT_COLS.find(c => c[0] === n));
  const rows = filtered().slice().sort((a, b) => (activityRank(a) - activityRank(b)) || String(a.date || a.ts).localeCompare(String(b.date || b.ts)) || a.ts.localeCompare(b.ts));
  return [use.map(c => c[0])].concat(rows.map(r => use.map(c => c[1](r))));
}
/** Header + rows of the records currently shown (same for CSV and Copy). cols = column names to keep (default: all). */
function exportTable(cols) {
  const all = exportCols(), use = cols ? cols.map(n => all.find(c => c[0] === n)).filter(Boolean) : all;
  return [use.map(c => c[0])].concat(filtered().map(r => use.map(c => c[1](r))));
}
$('#csvBtn').addEventListener('click', () => {
  const lines = exportTable();
  if (lines.length < 2) { toast('Nothing to export.', 'warning'); return; }
  const cell = v => { v = String(v == null ? '' : v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
  const csv = '﻿' + lines.map(l => l.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'activities_' + ymd(new Date()) + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
});
/** Copy: tab-separated, so it pastes straight into Google Sheets / Excel as columns. */
async function copyText(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) {}
  const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
  ta.remove(); return ok;
}
async function copyReport(cols, what, table) {
  const lines = table || exportTable(cols);
  if (lines.length < 2) { toast('Nothing to copy.', 'warning'); return; }
  const cell = v => { v = String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ').trim(); return /^[=+\-@]/.test(v) ? "'" + v : v; };
  const ok = await copyText(lines.map(l => l.map(cell).join('\t')).join('\n'));
  toast(ok ? 'Copied ' + (lines.length - 1) + ' record(s)' + (what ? ' (' + what + ')' : '') + '. Paste into Google Sheets or Excel.' : 'Could not copy. Use the CSV button instead.', ok ? 'success' : 'warning');
}
$('#copyBtn').addEventListener('click', () => copyReport(null, ''));
/** KPI as a text table for a Telegram message: aligned columns inside a ``` block (monospace), split in parts that fit the 4096-character limit. */
function kpiTelegramParts(table) {
  const heads = ['Category', 'Sub', 'Activity', 'MID', 'Merchant', 'Date'], cap = [30, 30, 30, 30, 30, 11];
  const len = s => Array.from(s).length, clean = (v, n) => { const a = Array.from(String(v == null ? '' : v).replace(/[`\t\r\n]+/g, ' ').trim()); return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); };
  const rows = table.slice(1).map(r => r.map((v, i) => clean(v, cap[i])));
  const w = heads.map((hd, i) => Math.max(len(hd), ...rows.map(r => len(r[i]))));
  const pad = (s, n) => s + ' '.repeat(Math.max(0, n - len(s)));
  const line = r => r.map((v, i) => pad(v, w[i])).join(' | ').replace(/\s+$/, '');
  const head = [line(heads), w.map(n => '-'.repeat(n)).join('-+-')];
  const parts = []; let cur = [];
  const used = () => cur.length ? head.concat(cur).join('\n').length : 0;
  rows.forEach(r => { const l = line(r); if (cur.length && used() + l.length + 1 > 3600) { parts.push(cur); cur = []; } cur.push(l); });
  if (cur.length) parts.push(cur);
  const per = S.period.from ? fmtD(S.period.from) + ' to ' + fmtD(S.period.to) : '';
  return parts.map((p, i) => 'KPI' + (per ? ' ' + per : '') + ' · ' + rows.length + ' record' + (rows.length > 1 ? 's' : '') + (parts.length > 1 ? ' · part ' + (i + 1) + '/' + parts.length : '') + '\n```\n' + head.concat(p).join('\n') + '\n```');
}
$('#copyTgBtn').addEventListener('click', async () => {
  const t = kpiTable(); if (t.length < 2) { toast('Nothing to copy.', 'warning'); return; }
  const parts = kpiTelegramParts(t), key = t.length + '|' + t[1].join('|') + '|' + t[t.length - 1].join('|');
  if (S.tgKey !== key) { S.tgKey = key; S.tgIdx = 0; }
  const i = (S.tgIdx || 0) % parts.length; S.tgIdx = i + 1;
  const ok = await copyText(parts[i]);
  toast(ok ? (parts.length > 1 ? 'Part ' + (i + 1) + ' of ' + parts.length + ' copied. Paste it in Telegram, then tap again for the next part.' : 'Copied ' + (t.length - 1) + ' record(s). Paste into Telegram.') : 'Could not copy.', ok ? 'success' : 'warning');
});
$('#copyKpiBtn').addEventListener('click', () => copyReport(null, 'KPI columns, in activity order', kpiTable()));

/* ============================ Users (admin) ============================ */
const userModal = new bootstrap.Modal($('#userModal'));

async function loadUsers() {
  $('#userList').innerHTML = '<div class="empty"><span class="spinner-border spinner-border-sm"></span></div>';
  loadTelegram();
  try { renderUsers(await api('listUsers', S.token)); } catch (e) { toast(e.message, 'danger'); }
}
function renderUsers(list) {
  S.users = list;
  $('#userList').innerHTML = list.map((u, i) =>
    '<div class="user-row"><div class="avatar">' + esc(u.username.charAt(0).toUpperCase()) + '</div>' +
    '<div class="flex-grow-1"><div class="fw-semibold">' + esc(u.username) + (u.staffId ? ' <span class="pill">' + esc(u.staffId) + '</span>' : ' <span class="pill" style="background:#fde8e8;color:#b42318">no Staff ID</span>') + (u.branch ? ' <span class="pill">' + esc(u.branch) + '</span>' : '') + '</div>' +
    '<small class="text-muted">' + esc(u.role) + (u.groupId ? ' · Group ' + esc(u.groupId) : '') + (u.topicId ? ' · Topic ' + esc(u.topicId) : '') + (u.maxEdits != null || u.editDays != null ? ' · Edits ' + (u.maxEdits != null ? (u.maxEdits === 0 ? 'off' : u.maxEdits + '×') : 'default') + (u.editDays != null ? ', ' + u.editDays + ' day' + (u.editDays === 1 ? '' : 's') : '') : '') + '</small></div>' +
    '<button class="btn btn-soft btn-sm" data-edit="' + i + '"><i class="bi bi-pencil"></i></button>' +
    '<button class="btn btn-outline-danger btn-sm border-0" data-del="' + i + '"><i class="bi bi-trash3"></i></button></div>'
  ).join('') || '<div class="empty">No users</div>';
}
$('#userList').addEventListener('click', async e => {
  const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
  if (ed) openUser(S.users[+ed.dataset.edit]);
  if (del) {
    const u = S.users[+del.dataset.del];
    if (!confirm('Delete staff "' + u.username + '"?')) return;
    try { renderUsers(await api('deleteUser', S.token, u.username)); toast('Staff deleted', 'success'); }
    catch (ex) { toast(ex.message, 'danger'); }
  }
});
function openUser(u) {
  show($('#userError'), false);
  $('#userModalTitle').textContent = u ? 'Edit staff' : 'Add staff';
  $('#uOriginal').value = u ? u.username : '';
  $('#uName').value = u ? u.username : ''; $('#uStaffId').value = u ? (u.staffId || '') : ''; $('#uBranch').value = u ? (u.branch || '') : '';
  $('#uPin').value = '';
  $('#uPinHint').textContent = u ? '(leave blank to keep current)' : '(4–12 digits)';
  $('#uRole').value = u ? u.role : 'User';
  $('#uTopic').value = u ? u.topicId : '';
  $('#uGroup').value = u ? (u.groupId || '') : ''; $('#uTg').value = u ? (u.tgUser || '') : '';
  $('#uMaxEdits').value = u && u.maxEdits != null ? u.maxEdits : ''; $('#uEditDays').value = u && u.editDays != null ? u.editDays : '';
  userModal.show();
}
$('#addUserBtn').addEventListener('click', () => openUser(null));
$('#userForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#userSaveBtn'), err = $('#userError');
  show(err, false); busy(btn, true, 'Saving…');
  try {
    const list = await api('saveUser', S.token, {
      original: $('#uOriginal').value, username: $('#uName').value, staffId: $('#uStaffId').value.trim(), branch: $('#uBranch').value.trim(), pin: $('#uPin').value,
      role: $('#uRole').value, topicId: $('#uTopic').value, groupId: $('#uGroup').value.trim(), tgUser: $('#uTg').value.trim(), maxEdits: $('#uMaxEdits').value.trim(), editDays: $('#uEditDays').value.trim()
    });
    renderUsers(list); userModal.hide(); toast('Staff saved', 'success');
  } catch (ex) { err.textContent = ex.message; show(err, true); }
  busy(btn, false);
});


/* ============================ Telegram settings (admin) ============================ */
function tgMsg(text, ok) {
  const el = $('#tgMsg'); el.textContent = text; el.className = 'small mb-3 ' + (ok ? 'text-success' : 'text-danger');
}
function renderTg(st) {
  $('#tgStatus').textContent = st.configured ? 'Connected' : 'Not configured';
  $('#tgTokenHint').textContent = st.tokenHint ? 'Saved: ' + st.tokenHint + ' (leave blank to keep)' : 'Not saved yet.';
  $('#tgChat').value = st.chatId || '';
  $('#tgToken').value = '';
}
async function loadTelegram() {
  try { renderTg(await api('getTelegramStatus', S.token)); } catch (e) { $('#tgStatus').textContent = 'Error'; }
}
$('#tgForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#tgSave'); busy(btn, true, 'Saving…');
  try {
    renderTg(await api('saveTelegramConfig', S.token, { botToken: $('#tgToken').value, chatId: $('#tgChat').value }));
    tgMsg('Saved. Tap "Send test" to check it.', true);
  } catch (ex) { tgMsg(ex.message, false); }
  busy(btn, false);
});
$('#tgTest').addEventListener('click', async () => {
  const btn = $('#tgTest'); busy(btn, true, 'Sending…');
  try { await api('sendTelegramTest', S.token); tgMsg('Test message sent. Check your Telegram group.', true); }
  catch (ex) { tgMsg(ex.message, false); }
  busy(btn, false);
});

/* ============================ Telegram alert message (admin) ============================ */
let tplDefault = '';
function tplNote(text, ok) { const m = $('#tplMsg'); m.textContent = text; m.className = 'small mt-2 ' + (ok ? 'text-success' : 'text-danger'); }
async function tplPreview() {
  try { $('#tplPreview').innerHTML = await api('previewTelegramTemplate', S.token, $('#tplText').value); show($('#tplMsg'), false); }
  catch (e) { tplNote(e.message, false); }
}
async function loadTemplate() {
  try {
    const t = await api('getTelegramTemplate', S.token);
    S.tgPlaceholders = t.placeholders; S.tgFieldLabels = t.fieldLabels || {}; tplDefault = t.defaultTemplate; $('#tplText').value = t.template;
    $('#tplStatus').textContent = t.isDefault ? 'Default' : 'Custom';
    $('#tplChips').innerHTML = t.placeholders.map(k => '<button type="button" class="chip" data-k="' + esc(k) + '"' + (S.tgFieldLabels[k] ? ' title="Field: ' + esc(S.tgFieldLabels[k]) + '"' : '') + '>{' + esc(k) + '}</button>').join('');
    tplPreview(); loadLabels(); loadIdFormat(); loadCc(); loadQk();
  } catch (e) { tplNote(e.message, false); }
}
$('#tplChips').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  const ta = $('#tplText'), at = ta.selectionStart == null ? ta.value.length : ta.selectionStart, txt = '{' + b.dataset.k + '}';
  ta.value = ta.value.slice(0, at) + txt + ta.value.slice(ta.selectionEnd == null ? at : ta.selectionEnd);
  ta.focus(); ta.selectionStart = ta.selectionEnd = at + txt.length; tplPreview();
});
let tplTimer; $('#tplText').addEventListener('input', () => { clearTimeout(tplTimer); tplTimer = setTimeout(tplPreview, 400); });
$('#tplPreviewBtn').addEventListener('click', tplPreview);
async function tplSaveWith(text, okMsg) {
  const btn = $('#tplSave'); busy(btn, true, 'Saving…');
  try { const t = await api('saveTelegramTemplate', S.token, text); $('#tplText').value = t.template; $('#tplStatus').textContent = t.isDefault ? 'Default' : 'Custom'; tplNote(okMsg, true); tplPreview(); }
  catch (e) { tplNote(e.message, false); }
  busy(btn, false);
}
$('#tplSave').addEventListener('click', () => tplSaveWith($('#tplText').value, 'Saved. New alerts use this layout.'));
$('#tplReset').addEventListener('click', () => tplSaveWith('', 'Back to the default layout.'));
$('#tplSend').addEventListener('click', async () => {
  const btn = $('#tplSend'); busy(btn, true, 'Sending…');
  try { await api('sendTelegramSample', S.token); tplNote('Sample sent to the group (using the saved layout).', true); }
  catch (e) { tplNote(e.message, false); }
  busy(btn, false);
});

/* ============================ Edit rules (admin) ============================ */
function paintRules() { const g = S.gRules || { enabled: true, max: 3, days: 1 }; $('#ruleOn').checked = !!g.enabled; $('#ruleMax').value = g.max; $('#ruleDays').value = g.days; }
$('#ruleSave').addEventListener('click', async () => {
  const btn = $('#ruleSave'), msg = $('#ruleMsg'); busy(btn, true, 'Saving…'); msg.textContent = '';
  try {
    S.gRules = await api('saveEditRules', S.token, { enabled: $('#ruleOn').checked, max: +$('#ruleMax').value, days: +$('#ruleDays').value });
    paintRules(); msg.className = 'small text-success'; msg.textContent = 'Saved.'; loadLast();
  } catch (e) { msg.className = 'small text-danger'; msg.textContent = e.message; }
  busy(btn, false);
});

/* ============================ Categories editor (admin) ============================ */
const catModal = new bootstrap.Modal($('#catModal'));
let catDraft = [], catSeq = 0;
/** Layout of a field on the form: 'h' (in a row) or 'v' (one under the other). Tick boxes were always listed one per line; the rest were in a row. */
const cfDir = f => f.dir === 'v' || f.dir === 'h' ? f.dir : (f.kind === 'check' ? 'v' : 'h');
/** "Icon per value" boxes of a field: Yes / No for a toggle, each listed value for a drop-down / option / tick-box field. */
const vicHtml = f => { const keys = f.kind === 'toggle' ? ['Yes', 'No'] : (f.opts || []); return keys.length ? '<span class="small text-muted">Telegram icon per value</span><div class="vic-row">' + keys.map(k => '<label class="vic-i"><input class="form-control form-control-sm cf-vic ic-in" maxlength="4" data-v="' + esc(k) + '" placeholder="–" value="' + esc((f.vic || {})[k] || '') + '"><span>' + esc(k) + '</span></label>').join('') + '</div>' : ''; };
const CF_KINDS = [['text', 'Text'], ['number', 'Number'], ['phone', 'Phone'], ['serial', 'S/N (scan)'], ['date', 'Date'], ['select', 'Drop-down'], ['radio', 'Option buttons'], ['check', 'Check boxes'], ['spin', 'Spin number'], ['toggle', 'Toggle (Yes / No)'], ['info', 'Info label (not saved)']];
/** One row per box: Off / Optional / Must (red). */
function fieldRows(a) {
  return '<details class="mt-2 a-fields"><summary class="small fw-semibold" style="cursor:pointer">Boxes to fill <span class="text-muted fw-normal">(' + FIELD_KEYS.filter(k => lvl(a, k) > 0).map(k => FIELD_NAMES[k] + (lvl(a, k) === 2 ? '*' : '')).join(', ') + ')</span></summary>' +
    FIELD_KEYS.map(k => '<div class="fl-row" data-k="' + k + '"><span>' + FIELD_NAMES[k] + '</span><span class="fl-seg">' +
      (YN_KEYS.includes(k) ? [[0, 'Off'], [1, 'Show toggle']] : [[0, 'Off'], [1, 'Optional'], [2, 'Must']]).map(p => '<button type="button" class="a-lv' + (lvl(a, k) === p[0] ? ' active' : '') + '" data-v="' + p[0] + '">' + p[1] + '</button>').join('') + '</span></div>').join('') + '</details>';
}
/** Box rules of a sub category: each box can Follow the activity, or be forced Off / Optional / Must while this sub category is used. */
function subRules(s, si) {
  const n = Object.keys(s.f || {}).length + (s.minPh ? 1 : 0);
  return '<details class="mb-2 ms-2 s-rules" data-sr="' + si + '"><summary class="small text-muted" style="cursor:pointer">Box rules for ' + esc(s.n) + ' <span class="s-count">(' + (n ? n + ' rule' + (n > 1 ? 's' : '') : 'follow each activity') + ')</span></summary>' +
    '<div class="small text-muted mb-1">Pick Must, Optional or Off to override the activity while this sub category is used. Follow keeps the activity\'s own setting.</div>' +
    FIELD_KEYS.map(k => '<div class="fl-row" data-k="' + k + '"><span>' + FIELD_NAMES[k] + '</span><span class="fl-seg">' +
      (YN_KEYS.includes(k) ? [['', 'Follow'], [0, 'Off'], [1, 'Show toggle']] : [['', 'Follow'], [0, 'Off'], [1, 'Optional'], [2, 'Must']]).map(p => '<button type="button" class="s-lv' + (((s.f || {})[k] === undefined ? '' : (s.f || {})[k]) === p[0] ? ' active' : '') + '" data-v="' + p[0] + '">' + p[1] + '</button>').join('') + '</span></div>').join('') +
    '<div class="d-flex align-items-center gap-2 mt-2"><span class="small">Minimum photos / videos</span><input type="number" min="0" max="' + MAX_PHOTOS + '" class="form-control form-control-sm s-minph" style="max-width:80px" value="' + (s.minPh || 0) + '"><span class="small text-muted">0 = follow the activity</span></div></details>';
}
function renderCatSummary() {
  $('#catSummary').innerHTML = CATALOG.map(t => '<div class="mb-1"><b>' + esc(t.name) + '</b> <span class="text-muted">(' + esc(t.code) + ')</span>: ' + t.acts.map(a => esc(a.n) + (a.custom && a.custom.length ? ' <span class="text-muted">(+' + a.custom.length + ')</span>' : '')).join(', ') + '</div>').join('');
}
/* ---- Categories & activities editor: three columns (categories | activities | the selected activity), like the desktop design ---- */
let catSel = { ti: 0, ai: 0, view: 'act' };
const ceFieldRows = a => FIELD_KEYS.map(k => '<div class="fl-row" data-k="' + k + '"><span>' + FIELD_NAMES[k] + '</span><span class="fl-seg">' +
  (YN_KEYS.includes(k) ? [[0, 'Off'], [1, 'Show toggle']] : [[0, 'Off'], [1, 'Optional'], [2, 'Must']]).map(p => '<button type="button" class="a-lv' + (lvl(a, k) === p[0] ? ' active' : '') + (lvl(a, k) === p[0] && p[0] === 2 ? ' must' : '') + '" data-v="' + p[0] + '">' + p[1] + '</button>').join('') + '</span></div>').join('');
const ceOrder = (t, a) => {
  const list = ordList(a, t);
  return '<div class="ce-lab">ORDER OF THE BOXES ON THE FORM <span class="fw-normal text-muted">(what staff see, top to bottom' + (a.ord ? '' : ' · built-in order') + ')</span></div>' +
    '<div class="ce-ord">' + list.map((x, i) => '<div class="ce-ord-row"><span class="ce-ord-n">' + (i + 1) + '</span><span class="flex-grow-1">' + esc(x.n) + '</span>' +
      '<button type="button" class="btn btn-soft btn-sm ord-up" data-k="' + esc(x.k) + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move up"><i class="bi bi-arrow-up"></i></button>' +
      '<button type="button" class="btn btn-soft btn-sm ord-dn" data-k="' + esc(x.k) + '"' + (i === list.length - 1 ? ' disabled' : '') + ' aria-label="Move down"><i class="bi bi-arrow-down"></i></button></div>').join('') + '</div>' +
    (a.ord ? '<button type="button" class="btn btn-soft btn-sm ord-reset mt-2">Back to the built-in order</button>' : '');
};
const ceHead = (titleHtml) => '<div class="ce-head">' + titleHtml + '<div class="ce-btns"><button type="button" class="btn btn-soft ce-cancel">Cancel</button><button type="button" class="btn btn-brand ce-save">Save changes</button></div></div>';
function ceCatPanel(t, ti) {
  return '<div class="ce-pane" data-ti="' + ti + '">' + ceHead('<div class="ce-title"><b>Category settings</b></div>') +
    '<div class="d-flex gap-2 mb-3"><input class="form-control c-name" maxlength="30" placeholder="Category name" value="' + esc(t.name) + '">' +
    '<input class="form-control c-code" maxlength="8" placeholder="Code" style="max-width:110px" value="' + esc(t.code) + '">' +
    '<button type="button" class="btn btn-outline-danger c-del" aria-label="Remove category"><i class="bi bi-trash3"></i></button></div>' +
    '<div class="ce-lab">TAB SYMBOL</div><div class="chips mb-3 c-icons">' + CAT_ICONS.map(n => '<button type="button" class="chip c-icon' + (t.icon === n ? ' active' : '') + '" data-i="' + n + '" aria-label="' + n + '" style="padding:6px 10px"><i class="bi bi-' + n + '"></i></button>').join('') + '</div>' +
    '<div class="ce-lab">SUB CATEGORIES <span class="fw-normal text-muted">(the code joins the record ID, e.g. QR + I)</span></div>' +
    (t.subs || []).map((s, si) => '<div class="d-flex gap-1 mb-1" data-si="' + si + '"><input class="form-control form-control-sm s-name" maxlength="40" placeholder="Sub category" value="' + esc(s.n) + '"><input class="form-control form-control-sm s-code" maxlength="4" placeholder="Code" style="max-width:76px" value="' + esc(s.code) + '"><button type="button" class="btn btn-sm btn-outline-danger border-0 s-del" aria-label="Remove sub category"><i class="bi bi-x"></i></button></div>' + (s.n ? subRules(s, si) : '')).join('') +
    '<button type="button" class="btn btn-soft btn-sm s-add mb-3"><i class="bi bi-plus-lg me-1"></i>Sub category</button>' +
    '</div>';
}
function ceActPanel(t, ti, a, ai) {
  const nm = '<div class="ce-title"><input class="a-name ce-name" maxlength="40" placeholder="Activity name" value="' + esc(a.n) + '"><span class="ce-sub">· ' + esc(t.name) + ' · code</span><input class="a-code ce-code" maxlength="4" placeholder="–" title="Optional code added to the record ID" value="' + esc(a.code || '') + '"></div>';
  return '<div class="ce-pane" data-ti="' + ti + '"><div data-ai="' + ai + '" class="ce-act">' + ceHead(nm) +
    '<div class="chips"><button type="button" class="chip a-flag' + (a.inst ? ' active' : '') + '" data-f="inst">Installed wording</button><button type="button" class="chip a-flag' + (a.pdf ? ' active' : '') + '" data-f="pdf" title="Also send this activity\'s photos to Telegram as one PDF file named Picture of [merchant]_[category] (videos are not included)">PDF of photos to Telegram</button><button type="button" class="chip a-flag' + (a.review ? ' active' : '') + '" data-f="review" title="Records of this activity stay Pending until the admin approves them or returns them to the staff member with a note">Needs admin review</button><button type="button" class="chip a-flag' + (qcEff(t.name, a, '') ? ' active' : '') + '" data-f="qrchk" title="Staff enter how many QR materials they gave the merchant and must scan every one. A QR of another MID is refused and the admin is told.">Scan every QR</button></div>' +
    ((t.subs || []).length ? '<div class="mt-2"><div class="small">Appears under <span class="text-muted">(tap to add or remove; the box rules of each sub category apply there)</span></div><div class="chips mt-1 a-subs">' + t.subs.filter(s => s.n).map(s => ({ n: s.n, name: s.n })).map(o => '<button type="button" class="chip a-subchip' + (actSubs(a).includes(o.n) ? ' active' : '') + '" data-s="' + esc(o.n) + '">' + esc(o.name) + '</button>').join('') + '</div></div>' : '') +
    '<div class="ce-lab">BOXES TO FILL</div><div class="a-fields ce-boxes">' + ceFieldRows(a) + '</div>' +
    '<div class="ce-trio"><div><div class="ce-lab">STOCK</div><select class="form-select a-stock"><option value="">Not used</option><option value="out"' + (a.stock && a.stock.mode === 'out' ? ' selected' : '') + '>Take out of stock (deploy / install)</option><option value="both"' + (a.stock && a.stock.mode === 'both' ? ' selected' : '') + '>Replace: new one out + old one back</option><option value="return"' + (a.stock && a.stock.mode === 'return' ? ' selected' : '') + '>Take back (return / terminate / removal)</option></select></div>' +
      '<div><div class="ce-lab">PHOTO QUALITY</div><select class="form-select a-pq"><option value="">Standard</option><option value="high"' + (a.pq === 'high' ? ' selected' : '') + '>High</option><option value="max"' + (a.pq === 'max' ? ' selected' : '') + '>Max</option></select></div>' +
      '<div><div class="ce-lab">MINIMUM PHOTOS / VIDEOS</div><input type="number" min="0" max="' + MAX_PHOTOS + '" class="form-control a-minph" value="' + (a.minPh || 0) + '" title="0 = 2 when Photos is Must"></div></div>' +
    (a.stock ? '' : '<div class="ce-sw a-flag' + (a.autoStock ? ' on' : '') + '" data-f="autoStock" role="switch" tabindex="0" title="Stock is chosen from the activity name: Install, Deploy, Replace, Return, Removal, Liability. Off = no stock check at all (faster)."><span class="sw"></span>Use stock (by activity name)</div>') +
    (a.stock ? '<div class="mt-1"><div class="small text-muted">Item type</div><div class="chips mt-1">' + [['', 'With S/N + no S/N'], ['serial', 'With S/N only'], ['qty', 'No S/N only']].map(k => '<button type="button" class="chip a-stk-kind' + ((a.stock.kind || '') === k[0] ? ' active' : '') + '" data-k="' + k[0] + '">' + k[1] + '</button>').join('') + '</div><div class="small text-muted mt-2">Items this activity uses <span class="fw-normal">(none ticked = every item of that type)</span></div><div class="chips mt-1">' + ((S.stockItems || []).filter(it => !a.stock.kind || a.stock.kind === it.kind).length ? S.stockItems.filter(it => !a.stock.kind || a.stock.kind === it.kind).map(it => '<button type="button" class="chip a-stk-item' + ((a.stock.items || []).some(n => n.toLowerCase() === it.name.toLowerCase()) ? ' active' : '') + '" data-n="' + esc(it.name) + '">' + esc(it.name) + '</button>').join('') : '<span class="small text-muted">Add stock items in the Stock tab first.</span>') + '</div></div>' : '') +
    '<div class="ce-lab">EXTRA FIELDS <span class="fw-normal text-muted">(each field name becomes a column in the sheet)</span></div>' +
    (a.custom || []).map((f, ci) =>
          '<div class="d-flex gap-1 mb-1 align-items-center" data-ci="' + ci + '"><input class="form-control form-control-sm cf-label" maxlength="30" placeholder="' + (f.kind === 'info' ? 'Title (optional)' : 'Field name') + '" value="' + esc(f.label) + '">' +
          '<select class="form-select form-select-sm cf-kind" style="max-width:112px">' + CF_KINDS.map(k => '<option value="' + k[0] + '"' + (f.kind === k[0] ? ' selected' : '') + '>' + k[1] + '</option>').join('') + '</select>' +
          (f.kind === 'info' ? '' : '<input class="form-control form-control-sm cf-ic ic-in" maxlength="4" placeholder="🔹" title="Icon in Telegram" value="' + esc(f.ic || '') + '">') +
          (f.kind === 'info' || f.kind === 'toggle' ? '' : '<button type="button" class="chip cf-req' + (f.req ? ' active' : '') + '">Must</button>') +
          '<button type="button" class="btn btn-sm btn-outline-danger border-0 cf-del" aria-label="Remove field"><i class="bi bi-x"></i></button></div>' +
          (f.kind === 'info' ? '<textarea class="form-control form-control-sm cf-text mb-2" rows="3" maxlength="600" data-ci="' + ci + '" placeholder="Text shown on the form for this activity (nothing is saved)">' + esc(f.text || '') + '</textarea>' : '') +
          (['select', 'check', 'radio', 'toggle'].includes(f.kind) ? '<div class="cf-vics mb-2" data-ci="' + ci + '">' + vicHtml(f) + '</div>' : '') +
          (f.kind === 'select' || f.kind === 'check' || f.kind === 'radio' ? '<input class="form-control form-control-sm cf-opts mb-2" data-ci="' + ci + '" placeholder="Values, separated by commas (e.g. Small, Medium, Large)" value="' + esc((f.opts || []).join(', ')) + '">' : '') +
          (['spin', 'check', 'radio'].includes(f.kind) ? '<div class="d-flex gap-1 mb-1 align-items-center small text-muted" data-ci="' + ci + '">Layout <button type="button" class="chip cf-dir' + (cfDir(f) === 'h' ? ' active' : '') + '" data-d="h">Horizontal</button><button type="button" class="chip cf-dir' + (cfDir(f) === 'v' ? ' active' : '') + '" data-d="v">Vertical</button></div>' : '') +
          (f.kind === 'spin' ? '<div class="d-flex gap-1 mb-2 align-items-center small text-muted" data-ci="' + ci + '">Min <input class="form-control form-control-sm cf-min" type="number" style="max-width:80px" value="' + (f.min == null ? 0 : f.min) + '"> Max <input class="form-control form-control-sm cf-max" type="number" style="max-width:80px" value="' + (f.max == null ? 100 : f.max) + '"> Step <input class="form-control form-control-sm cf-step" type="number" min="0" step="any" style="max-width:70px" value="' + (f.step || 1) + '"></div>' : '')).join('') +
        
    '<button type="button" class="btn btn-soft btn-sm cf-add mt-1"><i class="bi bi-plus-lg me-1"></i>Field</button>' +
    '<div class="ce-two"><div>' + '<details class="mt-2 a-tgbox"' + (a.tg ? ' open' : '') + '><summary class="small fw-semibold" style="cursor:pointer">Telegram message <span class="text-muted fw-normal">(' + (a.tg ? 'own message' : 'standard message') + ')</span></summary>' +
          '<textarea class="form-control form-control-sm a-tg mt-2" rows="6" spellcheck="false" placeholder="Leave empty to use the standard message (Telegram message box below). Example:&#10;🛠 <b>{title}</b>&#10;🧾 {merchant} · MID {mid}">' + esc(a.tg || '') + '</textarea>' +
          '<div class="chips mt-2 a-tgchips">' + (S.tgPlaceholders || []).map(k => '<button type="button" class="chip a-tgk" data-k="' + esc(k) + '"' + ((S.tgFieldLabels || {})[k] ? ' title="Field: ' + esc(S.tgFieldLabels[k]) + '"' : '') + '>{' + esc(k) + '}</button>').join('') + '</div>' +
          '<div class="d-flex gap-2 mt-2"><button type="button" class="btn btn-soft btn-sm a-tgprev">Preview</button><button type="button" class="btn btn-soft btn-sm a-tgclear">Use standard</button></div>' +
          '<div class="small mt-2 a-tgout hidden" style="white-space:pre-wrap"></div></details>' + '</div><div><div class="ce-lab">TELEGRAM MESSAGE · LIVE PREVIEW</div><div class="ce-prev" data-prev="1">…</div><div class="small text-muted mt-1">' + (a.tg ? 'This activity has its own message.' : 'Standard message (set in Telegram).') + '</div></div></div>' +
    ceOrder(t, a) +
    '<div class="mt-3 pt-2 border-top"><button type="button" class="btn btn-outline-danger btn-sm a-del"><i class="bi bi-trash3 me-1"></i>Remove this activity</button></div>' +
    '</div></div>';
}
let cePrevTimer = 0;
function cePreview() {
  clearTimeout(cePrevTimer);
  cePrevTimer = setTimeout(() => {
    const box = $('#catList .ce-prev'); if (!box) return;
    const t = catDraft[catSel.ti], a = t && t.acts[catSel.ai]; if (!a) return;
    const txt = (a.tg || '').trim() || $('#tplText').value || '';
    if (!txt.trim()) { box.textContent = 'Open the Telegram section once to load the standard message.'; return; }
    api('previewTelegramTemplate', S.token, txt).then(r => { box.innerHTML = r; }).catch(ex => { box.textContent = ex.message; });
  }, 350);
}
function renderCatEditor() {
  if (catSel.ti >= catDraft.length) catSel.ti = Math.max(0, catDraft.length - 1);
  const t = catDraft[catSel.ti];
  if (t && catSel.ai >= t.acts.length) catSel.ai = Math.max(0, t.acts.length - 1);
  if (t && !t.acts.length) catSel.view = 'cat';
  const col1 = '<div class="ce-col"><div class="ce-h">Categories</div>' + catDraft.map((c, ci) => '<button type="button" class="ce-it ce-cat' + (ci === catSel.ti ? ' on' : '') + '" data-cti="' + ci + '"><span>' + esc(c.name || 'New category') + '</span><em>' + ((c.subs || []).length ? c.subs.length + ' subs' : c.acts.length + ' acts') + '</em></button>').join('') + '<button type="button" class="btn ce-add ce-addcat">+ Category</button></div>';
  const col2 = t ? '<div class="ce-col"><div class="ce-h">' + esc(t.name || 'New category') + ' · activities</div><button type="button" class="ce-it ce-catset' + (catSel.view === 'cat' ? ' on' : '') + '"><span><i class="bi bi-gear me-1"></i>Category settings</span><em>' + (t.subs || []).length + ' subs</em></button>' +
    t.acts.map((x, xi) => '<button type="button" class="ce-it ce-actb' + (catSel.view === 'act' && xi === catSel.ai ? ' on' : '') + '" data-cai="' + xi + '"><span>' + esc(x.n || 'New activity') + '</span></button>').join('') + '<button type="button" class="btn ce-add ce-addact">+ Activity</button></div>' : '<div class="ce-col"></div>';
  const col3 = !t ? '<div class="ce-col ce-main text-muted">Add a category to begin.</div>' : '<div class="ce-col ce-main">' + (catSel.view === 'cat' ? ceCatPanel(t, catSel.ti) : ceActPanel(t, catSel.ti, t.acts[catSel.ai], catSel.ai)) + '</div>';
  $('#catList').innerHTML = '<div class="ce-grid">' + col1 + col2 + col3 + '</div>';
  if (catSel.view === 'act') cePreview();
}
$('#catEditBtn').addEventListener('click', () => {
  catDraft = JSON.parse(JSON.stringify(CATALOG)); catSel = { ti: 0, ai: 0, view: 'act' }; show($('#catError'), false); renderCatEditor(); catModal.show();
});
$('#catAdd').addEventListener('click', () => { catDraft.push({ name: '', code: '', subs: [], acts: [normAct({}, { n: '' })] }); catSel = { ti: catDraft.length - 1, ai: 0, view: 'cat' }; renderCatEditor(); });
$('#catList').addEventListener('input', e => {
  const box = e.target.closest('[data-ti]'); if (!box) return; const t = catDraft[+box.dataset.ti];
  if (e.target.classList.contains('c-name')) t.name = e.target.value;
  else if (e.target.classList.contains('c-code')) t.code = e.target.value.toUpperCase();
  else if (e.target.classList.contains('a-name')) t.acts[+e.target.closest('[data-ai]').dataset.ai].n = e.target.value;
  else if (e.target.classList.contains('a-tg')) { t.acts[+e.target.closest('[data-ai]').dataset.ai].tg = e.target.value; cePreview(); }
  else if (e.target.classList.contains('a-code')) t.acts[+e.target.closest('[data-ai]').dataset.ai].code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  else if (e.target.classList.contains('s-name')) { const s = t.subs[+e.target.closest('[data-si]').dataset.si], old = s.n; s.n = e.target.value; t.acts.forEach(a => { if (a.subs) a.subs = a.subs.map(x => x === old ? s.n : x); }); }
  else if (e.target.classList.contains('s-code')) t.subs[+e.target.closest('[data-si]').dataset.si].code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  else if (/\bcf-(min|max|step)\b/.test(e.target.className)) { const f = t.acts[+e.target.closest('[data-ai]').dataset.ai].custom[+e.target.closest('[data-ci]').dataset.ci]; f[/cf-(min|max|step)/.exec(e.target.className)[1]] = e.target.value === '' ? '' : +e.target.value; }
  else if (e.target.classList.contains('cf-text')) t.acts[+e.target.closest('[data-ai]').dataset.ai].custom[+e.target.dataset.ci].text = e.target.value;
  else if (e.target.classList.contains('cf-ic')) { const f = t.acts[+e.target.closest('[data-ai]').dataset.ai].custom[+e.target.closest('[data-ci]').dataset.ci]; if (e.target.value.trim()) f.ic = e.target.value.trim(); else delete f.ic; }
  else if (e.target.classList.contains('cf-vic')) { const f = t.acts[+e.target.closest('[data-ai]').dataset.ai].custom[+e.target.closest('.cf-vics').dataset.ci]; f.vic = f.vic || {}; if (e.target.value.trim()) f.vic[e.target.dataset.v] = e.target.value.trim(); else delete f.vic[e.target.dataset.v]; if (!Object.keys(f.vic).length) delete f.vic; }
  else if (e.target.classList.contains('cf-opts')) { const f = t.acts[+e.target.closest('[data-ai]').dataset.ai].custom[+e.target.dataset.ci]; f.opts = e.target.value.split(',').map(x => x.trim()).filter(Boolean); if (f.vic) Object.keys(f.vic).forEach(k => { if (!f.opts.includes(k)) delete f.vic[k]; }); const bx = $('.cf-vics[data-ci="' + e.target.dataset.ci + '"]', e.target.closest('[data-ai]')); if (bx) bx.innerHTML = vicHtml(f); }
  else if (e.target.classList.contains('cf-label')) t.acts[+e.target.closest('[data-ai]').dataset.ai].custom[+e.target.closest('[data-ci]').dataset.ci].label = e.target.value;
});
$('#catList').addEventListener('change', e => {
  if (e.target.classList.contains('a-stock')) { const a = catDraft[+e.target.closest('[data-ti]').dataset.ti].acts[+e.target.closest('[data-ai]').dataset.ai]; if (e.target.value) a.stock = { mode: e.target.value, kind: (a.stock && a.stock.kind) || '', items: (a.stock && a.stock.items) || [] }; else delete a.stock; renderCatEditor(); return; }
  if (e.target.classList.contains('a-pq')) { const a = catDraft[+e.target.closest('[data-ti]').dataset.ti].acts[+e.target.closest('[data-ai]').dataset.ai]; if (e.target.value) a.pq = e.target.value; else delete a.pq; return; }
  if (e.target.classList.contains('a-minph')) { const a = catDraft[+e.target.closest('[data-ti]').dataset.ti].acts[+e.target.closest('[data-ai]').dataset.ai]; const v = Math.max(0, Math.min(MAX_PHOTOS, Math.floor(+e.target.value) || 0)); a.minPh = v; if (v && !a.f.photo) a.f.photo = 1; renderCatEditor(); return; }
  if (e.target.classList.contains('s-minph')) { const sr = e.target.closest('[data-sr]'), s = catDraft[+e.target.closest('[data-ti]').dataset.ti].subs[+sr.dataset.sr]; const v = Math.max(0, Math.min(MAX_PHOTOS, Math.floor(+e.target.value) || 0)); if (v) s.minPh = v; else delete s.minPh; e.target.value = v; const n = Object.keys(s.f || {}).length + (s.minPh ? 1 : 0); $('.s-count', sr).textContent = '(' + (n ? n + ' rule' + (n > 1 ? 's' : '') : 'follow each activity') + ')'; return; }
  if (e.target.classList.contains('cf-kind')) { const f = catDraft[+e.target.closest('[data-ti]').dataset.ti].acts[+e.target.closest('[data-ai]').dataset.ai].custom[+e.target.closest('[data-ci]').dataset.ci]; f.kind = e.target.value; if (f.kind === 'toggle') f.req = false; if (f.kind === 'spin') { if (f.min == null) f.min = 0; if (f.max == null) f.max = 100; if (!f.step) f.step = 1; } renderCatEditor(); }
});
$('#catList').addEventListener('click', e => {
  const box = e.target.closest('[data-ti]'); if (!box) return; const ti = +box.dataset.ti, t = catDraft[ti];
  const ab = e.target.closest('[data-ai]'), ai = ab ? +ab.dataset.ai : -1;
  if (e.target.closest('.c-del')) { catDraft.splice(ti, 1); catSel.view = 'act'; catSel.ai = 0; renderCatEditor(); }
  else if (e.target.closest('.a-tgk')) { const ta = $('.a-tg', ab), k = '{' + e.target.closest('.a-tgk').dataset.k + '}', p = ta.selectionStart == null ? ta.value.length : ta.selectionStart; ta.value = ta.value.slice(0, p) + k + ta.value.slice(ta.selectionEnd == null ? p : ta.selectionEnd); t.acts[ai].tg = ta.value; ta.focus(); ta.selectionStart = ta.selectionEnd = p + k.length; }
  else if (e.target.closest('.a-tgclear')) { t.acts[ai].tg = ''; renderCatEditor(); }
  else if (e.target.closest('.a-tgprev')) {
    const out = $('.a-tgout', ab), txt = $('.a-tg', ab).value.trim();
    if (!txt) { out.textContent = 'This activity uses the standard message.'; show(out, true); return; }
    api('previewTelegramTemplate', S.token, txt).then(r => { out.innerHTML = r; show(out, true); }).catch(ex => { out.textContent = ex.message; show(out, true); });
  }
  else if (e.target.closest('.a-subchip')) {
    const a = t.acts[ai], cur = (a.subs || []).filter(Boolean), v = e.target.closest('.a-subchip').dataset.s, at = cur.indexOf(v);
    if (at >= 0) { if (cur.length === 1) { toast('An activity must appear under at least one sub category.', 'warning'); return; } cur.splice(at, 1); } else cur.push(v);
    a.subs = (t.subs || []).map(x => x.n).filter(x => x && cur.includes(x));
    allocSubs(t);
    $$('[data-ai]', e.target.closest('[data-ti]')).forEach(ab => { const aa = t.acts[+ab.dataset.ai]; $$('.a-subchip', ab).forEach(c => c.classList.toggle('active', actSubs(aa).includes(c.dataset.s))); });
  }
  else if (e.target.closest('.s-lv')) {
    const sr = e.target.closest('[data-sr]'), s = t.subs[+sr.dataset.sr], row = e.target.closest('.fl-row'), v = e.target.closest('.s-lv').dataset.v;
    s.f = s.f || {}; if (v === '') delete s.f[row.dataset.k]; else s.f[row.dataset.k] = +v;
    if (!Object.keys(s.f).length) delete s.f;
    $$('.s-lv', row).forEach(b => b.classList.toggle('active', b.dataset.v === v));
    const n = Object.keys(s.f || {}).length + (s.minPh ? 1 : 0); $('.s-count', sr).textContent = '(' + (n ? n + ' rule' + (n > 1 ? 's' : '') : 'follow each activity') + ')';
  }
  else if (e.target.closest('.c-icon')) { t.icon = e.target.closest('.c-icon').dataset.i; renderCatEditor(); }
  else if (e.target.closest('.s-add')) { t.subs = t.subs || []; if (t.subs.length >= 12) { toast('At most 12 sub categories.', 'warning'); return; } t.subs.push({ n: '', code: '' }); renderCatEditor(); }
  else if (e.target.closest('.s-del')) { const gone = t.subs.splice(+e.target.closest('[data-si]').dataset.si, 1)[0]; t.acts.forEach(a => { if (gone && a.subs) { a.subs = a.subs.filter(x => x !== gone.n); if (!a.subs.length) delete a.subs; } }); renderCatEditor(); }
  else if (e.target.closest('.c-addact')) { { const na = normAct({}, { n: '' }); na.f.photo = 2; t.acts.push(na); } renderCatEditor(); }
  else if (e.target.closest('.a-del')) { t.acts.splice(ai, 1); catSel.view = 'act'; renderCatEditor(); }
  else if (e.target.closest('.a-stk-kind')) { const a = t.acts[ai]; a.stock.kind = e.target.closest('.a-stk-kind').dataset.k; const keep = (S.stockItems || []).filter(it => !a.stock.kind || a.stock.kind === it.kind).map(it => it.name.toLowerCase()); a.stock.items = (a.stock.items || []).filter(n => keep.includes(n.toLowerCase())); renderCatEditor(); }
  else if (e.target.closest('.a-stk-item')) { const b = e.target.closest('.a-stk-item'), a = t.acts[ai], n = b.dataset.n, l = a.stock.items || []; a.stock.items = l.some(x => x.toLowerCase() === n.toLowerCase()) ? l.filter(x => x.toLowerCase() !== n.toLowerCase()) : l.concat(n); b.classList.toggle('active'); }
  else if (e.target.closest('.a-flag')) { const f = e.target.closest('.a-flag').dataset.f; if (f === 'qrchk') t.acts[ai].qrchk = !qcEff(t.name, t.acts[ai], ''); else t.acts[ai][f] = !t.acts[ai][f]; renderCatEditor(); }
  else if (e.target.closest('.a-lv')) {
    const row = e.target.closest('.fl-row'), a = t.acts[ai]; a.f[row.dataset.k] = +e.target.closest('.a-lv').dataset.v; if (row.dataset.k === 'photo' && !a.f.photo) { a.minPh = 0; const mi = $('.a-minph', ab); if (mi) mi.value = 0; }
    $$('.a-lv', row).forEach(b => b.classList.toggle('active', +b.dataset.v === a.f[row.dataset.k]));
    $$('.a-lv', row).forEach(b => b.classList.toggle('must', b.classList.contains('active') && +b.dataset.v === 2));
    { const sm = $('summary span', e.target.closest('.a-fields')); if (sm) sm.textContent = '(' + FIELD_KEYS.filter(k => lvl(a, k) > 0).map(k => FIELD_NAMES[k] + (lvl(a, k) === 2 ? '*' : '')).join(', ') + ')'; }
  }
  else if (e.target.closest('.cf-dir')) { const f = t.acts[ai].custom[+e.target.closest('[data-ci]').dataset.ci]; f.dir = e.target.closest('.cf-dir').dataset.d; renderCatEditor(); }
  else if (e.target.closest('.cf-add')) { const a = t.acts[ai]; a.custom = a.custom || []; if (a.custom.length >= 20) { toast('At most 20 fields per activity.', 'warning'); return; } a.custom.push({ id: 'f' + (++catSeq).toString(36) + Math.random().toString(36).slice(2, 6), label: '', kind: 'text', req: false }); renderCatEditor(); }
  else if (e.target.closest('.cf-del')) { t.acts[ai].custom.splice(+e.target.closest('[data-ci]').dataset.ci, 1); renderCatEditor(); }
  else if (e.target.closest('.cf-req')) { const f = t.acts[ai].custom[+e.target.closest('[data-ci]').dataset.ci]; f.req = !f.req; e.target.closest('.cf-req').classList.toggle('active', f.req); }
});
/* column buttons, header buttons and the order of the boxes */
$('#catList').addEventListener('input', e => {
  if (e.target.classList.contains('c-name')) { const b = $('#catList .ce-cat.on span'), h = $('#catList .ce-h:not(:first-child), #catList .ce-col + .ce-col .ce-h'); if (b) b.textContent = e.target.value || 'New category'; if (h) h.textContent = (e.target.value || 'New category') + ' · activities'; }
  else if (e.target.classList.contains('a-name')) { const b = $('#catList .ce-actb.on span'); if (b) b.textContent = e.target.value || 'New activity'; }
});
$('#catList').addEventListener('click', e => {
  const t = catDraft[catSel.ti];
  const cat = e.target.closest('.ce-cat'), act = e.target.closest('.ce-actb');
  if (cat) { catSel = { ti: +cat.dataset.cti, ai: 0, view: catDraft[+cat.dataset.cti].acts.length ? 'act' : 'cat' }; renderCatEditor(); }
  else if (act) { catSel.ai = +act.dataset.cai; catSel.view = 'act'; renderCatEditor(); }
  else if (e.target.closest('.ce-catset')) { catSel.view = 'cat'; renderCatEditor(); }
  else if (e.target.closest('.ce-addcat')) $('#catAdd').click();
  else if (e.target.closest('.ce-addact')) { if (!t) return; const na = normAct({}, { n: '' }); na.f.photo = 2; t.acts.push(na); catSel = { ti: catSel.ti, ai: t.acts.length - 1, view: 'act' }; renderCatEditor(); const nm = $('#catList .a-name'); if (nm) nm.focus(); }
  else if (e.target.closest('.ce-cancel')) catModal.hide();
  else if (e.target.closest('.ce-save')) $('#catSave').click();
  else if (e.target.closest('.ord-up, .ord-dn')) {
    const b = e.target.closest('.ord-up, .ord-dn'), a = t && t.acts[catSel.ai]; if (!a) return;
    const list = ordList(a, t).map(x => x.k), i = list.indexOf(b.dataset.k), j = b.classList.contains('ord-up') ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]]; a.ord = list; renderCatEditor();
  }
  else if (e.target.closest('.ord-reset')) { const a = t && t.acts[catSel.ai]; if (a) { delete a.ord; renderCatEditor(); } }
});
$('#catList').addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && e.target.classList && e.target.classList.contains('ce-sw')) { e.preventDefault(); e.target.click(); } });
$('#catSave').addEventListener('click', async () => {
  const btn = $('#catSave'), err = $('#catError'); show(err, false); busy(btn, true, 'Saving…');
  try {
    const out = await api('saveCatalog', S.token, catDraft);
    setCatalog(out); setType(curType); S.cards.forEach(applyType); renderCatSummary(); catModal.hide(); toast('Categories saved.', 'success'); if (typeof loadTemplate === 'function') loadTemplate();      // new fields get their Telegram placeholders right away
  } catch (ex) { err.textContent = ex.message; show(err, true); }
  busy(btn, false);
});

/* ============================ Record ID format (admin) ============================ */
const idNote = (m, ok) => { const el = $('#idMsg'); el.textContent = m; el.className = 'small ' + (ok ? 'text-success' : 'text-danger'); };
let idTimer = 0;
async function loadIdFormat() {
  try {
    const r = await api('getIdFormat', S.token);
    $('#idFmt').value = r.format; $('#idStatus').textContent = r.isDefault ? 'Default' : 'Custom'; $('#idSample').textContent = r.sample; S.idDefault = r.defaultFormat;
    $('#idChips').innerHTML = r.tokens.map(k => k === 'SEQ' ? '<button type="button" class="chip" data-k="SEQ3">{SEQ3}</button>' : '<button type="button" class="chip" data-k="' + k + '">{' + k + '}</button>').join('') + '<button type="button" class="chip" data-k="-">-</button><button type="button" class="chip" data-k="/">/</button>';
    idNote('', true);
  } catch (e) { idNote(e.message, false); }
}
$('#idChips').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return; const ta = $('#idFmt'), k = b.dataset.k.length > 1 ? '{' + b.dataset.k + '}' : b.dataset.k, p = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
  ta.value = ta.value.slice(0, p) + k + ta.value.slice(ta.selectionEnd == null ? p : ta.selectionEnd); ta.focus(); ta.dispatchEvent(new Event('input'));
});
$('#idFmt').addEventListener('input', () => {
  clearTimeout(idTimer);
  idTimer = setTimeout(async () => { try { const r = await api('previewIdFormat', S.token, $('#idFmt').value); $('#idSample').textContent = r.sample; idNote('', true); } catch (e) { $('#idSample').textContent = '—'; idNote(e.message, false); } }, 400);
});
$('#idSave').addEventListener('click', async () => {
  const b = $('#idSave'); busy(b, true, 'Saving…');
  try { const r = await api('saveIdFormat', S.token, $('#idFmt').value); $('#idFmt').value = r.format; $('#idStatus').textContent = r.isDefault ? 'Default' : 'Custom'; $('#idSample').textContent = r.sample; idNote('Saved. New records use this ID.', true); }
  catch (e) { idNote(e.message, false); }
  busy(b, false);
});
$('#idReset').addEventListener('click', () => { $('#idFmt').value = S.idDefault || '{CODE}-{YYYYMMDD}-{SEQ3}'; $('#idFmt').dispatchEvent(new Event('input')); });

/* ============================ Merchant history lookup (everyone) ============================ */
const lkModal = new bootstrap.Modal($('#lkModal'));
$('#lkBtn').addEventListener('click', () => { lkModal.show(); setTimeout(() => $('#mhQ').focus(), 400); });
$('#mhScan').addEventListener('click', () => { S.qcCard = null; S.scanTarget = null; S.snInput = null; S.mhScan = true; scanMode(false); lkModal.hide(); setTimeout(() => scanModal.show(), 350); });
$('#scanModal').addEventListener('hidden.bs.modal', () => { if (S.mhScan) { S.mhScan = false; setTimeout(() => lkModal.show(), 250); } });      // the scanner was closed without a QR: back to the lookup
$('#mhGo').addEventListener('click', () => mhRun($('#mhQ').value));
$('#mhQ').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); mhRun($('#mhQ').value); } });
async function mhRun(q) {
  const out = $('#mhOut'); q = String(q || '').trim();
  if (q.length < 3) { out.innerHTML = '<div class="small text-danger">Type or scan at least 3 characters.</div>'; return; }
  out.innerHTML = '<div class="small text-muted">Looking up…</div>';
  try {
    const d = await api('lookupMid', S.token, q);
    if (!d.count) { out.innerHTML = '<div class="small"><b>No record found</b> for “' + esc(d.q) + '”.</div>'; return; }
    const st = { Pending: 'pill-warn', Approved: 'pill-ok', Returned: 'pill-bad' };
    out.innerHTML = '<div class="lk-sum"><b>' + esc(d.merchants.join(' · ') || d.q) + '</b><div class="small text-muted">' + esc(d.mids.join(' · ')) + '</div><div class="small mt-1"><b>' + d.count + '</b> record' + (d.count > 1 ? 's' : '') + ' · ' + esc(fmtD(d.first)) + ' → ' + esc(fmtD(d.last)) + (d.count > 100 ? ' · showing the latest 100' : '') + (d.by === 'name' ? ' · found by name' : '') + '</div></div>' +
      d.rows.map(r => '<div class="lk-row"><div class="d-flex justify-content-between gap-2"><b>' + esc(shortName(r.type)) + (r.sub ? ' · ' + esc(r.sub) : '') + ' · ' + esc(r.activity) + '</b><span class="small text-muted text-nowrap">' + esc(fmtD(r.date)) + '</span></div>' +
        '<div class="small text-muted">' + esc(r.user) + (r.branch ? ' · ' + esc(r.branch) : '') + (d.by === 'name' ? ' · ' + esc(r.merchant) + ' ' + esc(r.midLabel) + ' ' + esc(r.mid) : '') + ' · <span class="font-monospace">' + esc(r.stamp) + '</span></div>' +
        (r.remarks ? '<div class="small">' + esc(r.remarks) + '</div>' : '') +
        '<div class="small mt-1">' + (r.status ? '<span class="pill ' + (st[r.status] || '') + '">' + esc(r.status) + '</span> ' : '') + (r.photos ? '<span class="text-muted">' + r.photos + ' photo' + (r.photos > 1 ? 's' : '') + '</span> ' : '') + (r.link ? '<a href="' + esc(r.link) + '" target="_blank" rel="noopener">Open in Telegram</a>' : '') + '</div></div>').join('');
  } catch (e) { out.innerHTML = '<div class="small text-danger">' + esc(e.message) + '</div>'; }
}

/* ============================ CC on Telegram alerts (admin) ============================ */
const ccNote = (m, ok) => { const el = $('#ccMsg'); el.textContent = m; el.className = 'small ' + (ok ? 'text-success' : 'text-danger'); };
function ccPaint(d) {
  $('#ccOn').checked = d.on; $('#ccLabel').value = d.label; $('#ccStatus').textContent = d.on ? 'On' : 'Off';
  const chip = (u, role) => '<button type="button" class="chip cc-p' + (u.skip ? '' : ' active') + '" data-u="' + esc(u.name) + '" title="' + (u.tg ? 'Mentioned as ' + esc(u.tg) : 'No Telegram username yet: this person cannot be mentioned') + '">' + esc(u.name) + (role === 'sup' && u.branch ? ' · ' + esc(u.branch) : '') + (u.tg ? '' : ' ⚠') + '</button>';
  $('#ccAdmins').innerHTML = d.adminList.length ? d.adminList.map(u => chip(u, 'adm')).join('') : '<span class="small text-muted">No admin accounts.</span>';
  $('#ccSups').innerHTML = d.supList.length ? d.supList.map(u => chip(u, 'sup')).join('') : '<span class="small text-muted">No supervisor accounts.</span>';
  $('#ccPrev').innerHTML = d.preview.length ? d.preview.map(b => '<div><b>' + esc(b.branch) + '</b>: ' + (b.people.length ? b.people.map(p => p.tg ? esc(p.tg) : '<span class="text-muted">' + esc(p.name) + ' (no username)</span>').join(' ') : '<span class="text-muted">nobody</span>') + '</div>').join('') : '<span class="text-muted">No staff with a branch code yet.</span>';
}
async function loadCc() { try { ccPaint(await api('getCcConfig', S.token)); ccNote('', true); } catch (e) { ccNote(e.message, false); } }
$('#ccAdmins').addEventListener('click', e => { const b = e.target.closest('.cc-p'); if (b) b.classList.toggle('active'); });
$('#ccSups').addEventListener('click', e => { const b = e.target.closest('.cc-p'); if (b) b.classList.toggle('active'); });
$('#ccSave').addEventListener('click', async () => {
  const b = $('#ccSave'); busy(b, true, 'Saving…');
  try {
    const skip = $$('#ccAdmins .cc-p, #ccSups .cc-p').filter(x => !x.classList.contains('active')).map(x => x.dataset.u);
    ccPaint(await api('saveCcConfig', S.token, { on: $('#ccOn').checked, label: $('#ccLabel').value.trim(), admins: true, sups: true, skip }));
    ccNote('Saved. New alerts use it.', true);
  } catch (e) { ccNote(e.message, false); }
  busy(b, false);
});

/* ============================ QR Installation type (New / Replacement) ============================ */
function qkPaint(d) { $('#qkOn').checked = d.on; $('#qkDays').value = d.days; $('#qkNew').value = d.newLabel; $('#qkRep').value = d.repLabel; $('#qkStatus').textContent = d.on ? 'On' : 'Off'; }
function qkNote(t, ok) { const m = $('#qkMsg'); m.textContent = t; m.className = 'small ' + (ok ? 'text-success' : 'text-danger'); }
async function loadQk() { try { qkPaint(await api('getQrKindConfig', S.token)); qkNote('', true); } catch (e) { qkNote(e.message, false); } }
$('#qkSave').addEventListener('click', async () => {
  const b = $('#qkSave'); busy(b, true, 'Saving…');
  try {
    qkPaint(await api('saveQrKindConfig', S.token, { on: $('#qkOn').checked, days: Number($('#qkDays').value) || 0, newLabel: $('#qkNew').value.trim(), repLabel: $('#qkRep').value.trim() }));
    qkNote('Saved. New records use it.', true);
  } catch (e) { qkNote(e.message, false); }
  busy(b, false);
});

/* ============================ Photo stamp settings ============================ */
const stampModal = new bootstrap.Modal($('#stampModal'));
let stDraft = null;
function previewMap() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#ece8df'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#fff'; x.fillRect(0, 110, 256, 22); x.fillRect(120, 0, 18, 256);
  x.fillStyle = '#cfe3c6'; x.fillRect(10, 150, 90, 80);
  x.fillStyle = '#ea4335'; x.beginPath(); x.arc(128, 112, 20, Math.PI * 0.8, Math.PI * 0.2, false); x.lineTo(128, 150); x.closePath(); x.fill();
  x.fillStyle = '#7b1a10'; x.beginPath(); x.arc(128, 112, 7, 0, 7); x.fill();
  return c;
}
async function drawStampPreview() {
  const cv = $('#stampPrev'), x = cv.getContext('2d'), w = cv.width, hh = cv.height, c = stDraft;
  const g = x.createLinearGradient(0, 0, w, hh); g.addColorStop(0, '#8a97a8'); g.addColorStop(1, '#3a4658');
  x.fillStyle = g; x.fillRect(0, 0, w, hh);
  let logo = null;
  if (c.logo) {
    if (c.logoData) { logo = await new Promise(r => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = c.logoData; }); }
    else { const lc = document.createElement('canvas'); lc.width = 200; lc.height = 80; const lx = lc.getContext('2d'); lx.fillStyle = '#9aa5b4'; lx.font = '700 40px sans-serif'; lx.textAlign = 'center'; lx.textBaseline = 'middle'; lx.fillText('LOGO', 100, 42); logo = lc; }
  }
  const lat = 13.36813, lon = 103.838707;
  drawStamp(x, w, hh, {
    title: c.title && c.titleText ? c.titleText : '', user: c.user ? (S.user ? S.user.username : 'Sok Dara') : '', time: c.time,
    coords: c.coords ? coordText({ lat, lon }) : '',
    addr: c.addr ? '7PQ8+2X, Ring Road, Siem Reap, Cambodia' : '',
    compass: c.compass ? { deg: hdg.v != null ? hdg.v : 325 } : null, compassScale: c.compassScale, opCompass: c.opCompass, opText: c.opText, opMap: c.opMap, opLogo: c.opLogo, fontColor: c.fontColor,
    map: c.map ? previewMap() : null, logo, fontScale: c.fontScale, mapScale: c.mapScale, logoScale: c.logoScale
  }, Date.now());
}
function readStampForm() {
  $$('.st-opt').forEach(el => { stDraft[el.dataset.k] = el.checked; });
  $$('.st-size').forEach(el => { stDraft[el.dataset.k] = +el.value; });
  $('#stFontVal').textContent = stDraft.fontScale + '%'; $('#stMapVal').textContent = stDraft.mapScale + '%'; $('#stZoomVal').textContent = stDraft.mapZoom; $('#stLogoVal').textContent = stDraft.logoScale + '%';
  stDraft.titleText = $('#stTitle').value.trim().slice(0, 40);
  $$('.st-pct').forEach(el => { const v = $('#' + el.id + 'Val'); if (v) v.textContent = stDraft[el.dataset.k] + '%'; });
  $$('.st-col').forEach(el => el.classList.toggle('on', el.dataset.c.toLowerCase() === String(stDraft.fontColor).toLowerCase()));
  $('#stColor').value = /^#[0-9a-f]{6}$/i.test(stDraft.fontColor) ? stDraft.fontColor : '#ffffff';
}
function openStampSettings() {
  stDraft = Object.assign({}, stampCfg);
  $$('.st-opt').forEach(el => { el.checked = !!stDraft[el.dataset.k]; });
  $('#stTitle').value = stDraft.titleText;
  $$('.st-size').forEach(el => { el.value = stDraft[el.dataset.k]; });
  $('#stFontVal').textContent = stDraft.fontScale + '%'; $('#stMapVal').textContent = stDraft.mapScale + '%'; $('#stZoomVal').textContent = stDraft.mapZoom; $('#stLogoVal').textContent = stDraft.logoScale + '%';
  $('#stLogoNote').textContent = stDraft.logoData ? 'Your logo is set.' : 'No logo chosen yet. Pick an image (PNG with a transparent background works best).';
  drawStampPreview(); stampModal.show();
}
$$('.st-opt').forEach(el => el.addEventListener('change', () => { readStampForm(); drawStampPreview(); }));
$$('.st-size').forEach(el => el.addEventListener('input', () => { readStampForm(); drawStampPreview(); }));
$$('.st-col').forEach(b => b.addEventListener('click', () => { stDraft.fontColor = b.dataset.c; readStampForm(); drawStampPreview(); }));
$('#stColor').addEventListener('input', e => { stDraft.fontColor = e.target.value; readStampForm(); drawStampPreview(); });
$('#stCompass').addEventListener('change', e => { if (e.target.checked) startCompass(); });
$('#stTitle').addEventListener('input', () => { readStampForm(); drawStampPreview(); });
/** Cuts empty margins off a logo (transparent edges, or white edges when the picture has no transparency) so it fills its box. */
function trimLogo(c) {
  try {
    const w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data;
    let hasAlpha = false; for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { hasAlpha = true; break; }
    const empty = i => hasAlpha ? d[i + 3] < 12 : (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!empty((y * w + x) * 4)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1)) return c;
    const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
    o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
    return o;
  } catch (e) { return c; }
}
$('#stLogoFile').addEventListener('change', e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const url = URL.createObjectURL(f), im = new Image();
  im.onload = () => {
    const r = Math.min(1, 400 / Math.max(im.width, im.height)), c = document.createElement('canvas');
    c.width = Math.round(im.width * r); c.height = Math.round(im.height * r);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    stDraft.logoData = trimLogo(c).toDataURL('image/png'); stDraft.logo = true; $('#stLogo').checked = true;
    $('#stLogoNote').textContent = 'Logo ready. Press Save to keep it.'; drawStampPreview();
  };
  im.onerror = () => { URL.revokeObjectURL(url); toast('That image could not be read.', 'warning'); };
  im.src = url;
});
$('#stLogoClear').addEventListener('click', () => { stDraft.logoData = ''; $('#stLogoNote').textContent = 'Logo removed. Press Save to keep this.'; drawStampPreview(); });
$('#stSave').addEventListener('click', () => {
  readStampForm(); stampCfg = Object.assign({}, STAMP_DEF, stDraft); saveStampCfg();
  stampModal.hide(); toast('Photo stamp saved.', 'success'); if (stampCfg.compass) startCompass();
  if (geo.pos) { loadMap(geo.pos); try { geo.mapLookup.then(paintLoc); } catch (e) {} }   // new zoom: redraw the map picture
  if (stampOn && needGeo()) refreshGeo(10000);
});


/* ============================ Stock tab (admin + supervisor) ============================ */
S.st = { period: 'month', branch: '', item: '', user: '', status: 'In stock', data: null };
const stFrom = () => { const n = new Date(); return S.st.period === 'month' ? ymd(new Date(n.getFullYear(), n.getMonth(), 1)) : S.st.period === '30' ? ymd(new Date(n.getTime() - 29 * 864e5)) : ''; };
const stBars = (rows, cls) => { const mx = Math.max(1, ...rows.map(r => r.n)); return rows.length ? rows.map(r => '<div class="small d-flex justify-content-between"><span class="text-truncate">' + esc(r.name) + '</span><b>' + r.n + '</b></div><div class="stk-bar ' + (cls || '') + ' mb-1" style="width:' + Math.max(2, Math.round(r.n / mx * 100)) + '%"></div>').join('') : '<div class="small text-muted">No data</div>'; };
const stPillOf = st => '<span class="st-pill ' + (st === 'In stock' || st === 'Reserved' ? 'st-i' : st === 'Used' ? 'st-u' : st === 'Faulty' ? 'st-f' : 'st-h') + '">' + esc(st) + '</span>';
async function loadStock() {
  const admin = S.user.role === 'Admin';
  show($('#stBranchWrap'), admin); show($('#stItemsCard'), admin);
  try {
    const d = S.st.data = await api('getStockDash', S.token, { from: stFrom(), branch: admin ? S.st.branch : '', item: S.st.item });
    S.stockItems = d.items;
    $('#stPeriod').innerHTML = [['month', 'This month'], ['30', 'Last 30 days'], ['all', 'All time']].map(p => '<button type="button" class="chip' + (S.st.period === p[0] ? ' active' : '') + '" data-v="' + p[0] + '">' + p[1] + '</button>').join('');
    $('#stBranch').innerHTML = [''].concat(d.branches).map(b => '<button type="button" class="chip' + (S.st.branch === b ? ' active' : '') + '" data-v="' + esc(b) + '">' + (b || 'All') + '</button>').join('');
    $('#stItem').innerHTML = [''].concat(d.items.map(i => i.name)).map(b => '<button type="button" class="chip' + (S.st.item === b ? ' active' : '') + '" data-v="' + esc(b) + '">' + (esc(b) || 'All') + '</button>').join('');
    const t = d.totals, p = d.period;
    $('#stKpi').innerHTML = [['In stock now', t.remaining], ['Stock in', p.stockIn], ['Used', p.out], ['Merchant liability', (d.liab || {}).total || 0], ['Reserved', t.reserved], ['To decide', t.pending], ['Returned to stock', p.back], ['Faulty', t.faulty], ['Sent to HO', t.ho], ['Low items', t.low]].map(k => '<div class="kpi-s"' + (k[0] === 'Low items' && k[1] ? ' style="background:#fffbeb;border-color:#fcd34d"' : '') + '><b>' + k[1] + '</b><span>' + k[0] + '</span></div>').join('');
    const mx = Math.max(1, ...d.stock.map(r => r.remaining));
    $('#stRemain').innerHTML = d.stock.length ? d.stock.map(r => '<div class="d-flex justify-content-between small"><span>' + esc(r.item) + ' <span class="text-muted">· ' + esc(r.branch) + (r.kind === 'qty' ? ' · qty' : '') + '</span>' + (r.isLow ? ' <span class="st-pill st-h">Low</span>' : '') + '</span><span><b>' + r.remaining + '</b>' + (r.kind === 'qty' && r.reserved ? ' <span class="text-muted">· reserved ' + r.reserved + '</span>' : '') + (r.faulty ? ' <span class="text-muted">· faulty ' + r.faulty + '</span>' : '') + (r.ho ? ' <span class="text-muted">· HO ' + r.ho + '</span>' : '') + (r.oldest > 30 ? ' <span class="text-muted">· oldest ' + r.oldest + 'd</span>' : '') + '</span></div><div class="stk-bar ' + (r.isLow ? 'o' : '') + ' mb-2" style="width:' + Math.max(2, Math.round(Math.max(0, r.remaining) / mx * 100)) + '%"></div>').join('') : '<div class="small text-muted">No stock yet. Add items below, then stock in.</div>';
    const wm = Math.max(1, ...d.weeks.map(w => Math.max(w.inn, w.out)));
    $('#stWeeks').innerHTML = d.weeks.length ? d.weeks.map(w => '<div class="small d-flex justify-content-between"><span>Week of ' + esc(fmtD(w.week)) + '</span><span>in <b>' + w.inn + '</b> · used <b>' + w.out + '</b></span></div><div class="stk-bar mb-1" style="width:' + Math.max(2, Math.round(w.inn / wm * 100)) + '%"></div><div class="stk-bar g mb-2" style="width:' + Math.max(2, Math.round(w.out / wm * 100)) + '%"></div>').join('') + '<div class="small text-muted"><span style="color:#4f46e5">■</span> stock in &nbsp;<span style="color:#1baf7a">■</span> used</div>' : '<div class="small text-muted">No movements in this period.</div>';
    const lb = d.liab || { total: 0, byMerchant: [], byItem: [] }; show($('#stLiabWrap'), lb.total > 0); $('#stLiabMer').innerHTML = stBars(lb.byMerchant, 'o'); $('#stLiabItem').innerHTML = stBars(lb.byItem);
    $('#stByBranch').innerHTML = stBars(d.byBranch); $('#stByStaff').innerHTML = stBars(d.byStaff, 'g'); $('#stByMer').innerHTML = stBars(d.byMerchant, 'o'); $('#stByItem').innerHTML = stBars(d.byItem);
    $('#stRecent').innerHTML = d.recent.length ? d.recent.map(l => '<div class="py-1 border-top"><b>' + esc(l.action) + '</b> · ' + esc(l.item) + (l.sn ? ' ' + esc(l.sn) : ' ×' + l.qty) + ' <span class="text-muted">· ' + esc(l.branch) + ' · ' + esc(l.by) + (l.merchant ? ' · ' + esc(l.merchant) : '') + (l.reason ? ' · ' + esc(l.reason) : '') + ' · ' + esc(fmtTs(l.ts)) + '</span></div>').join('') : '<div class="text-muted">Nothing yet</div>';
    const rq = $('#rqItem').value; $('#rqItem').innerHTML = d.items.filter(i => i.kind === 'qty').map(i => '<option>' + esc(i.name) + '</option>').join(''); if (rq) $('#rqItem').value = rq;
    show($('#rqBranchWrap'), admin);
    $('#rqList').innerHTML = (d.resQty || []).length ? d.resQty.map(r => '<div class="d-flex justify-content-between align-items-center py-1 border-top" data-item="' + esc(r.item) + '" data-branch="' + esc(r.branch) + '" data-tid="' + esc(r.tid) + '"><div class="min-w-0"><b>' + esc(r.item) + ' × 1</b> <span class="st-pill st-i">Reserved</span><div class="text-muted text-truncate">TID ' + esc(r.tid) + (r.merchant ? ' · ' + esc(r.merchant) : '') + ' · ' + esc(r.branch) + ' · ' + esc(r.by) + ' · ' + esc(fmtD(r.ts)) + (r.note ? ' · ' + esc(r.note) : '') + '</div></div><button type="button" class="btn btn-soft btn-sm flex-none rq-rel">Release</button></div>').join('') : '<div class="text-muted">Nothing reserved.</div>';
    const opts = d.items.map(i => '<option value="' + esc(i.name) + '">' + esc(i.name) + (i.kind === 'qty' ? ' (qty)' : '') + '</option>').join('');
    $('#siItemList').innerHTML = d.items.map(i => '<option value="' + esc(i.name) + '">' + (i.kind === 'qty' ? 'quantity' : 'serial numbers') + '</option>').join('');
    $('#aqItem').innerHTML = d.items.filter(i => i.kind === 'qty').map(i => '<option>' + esc(i.name) + '</option>').join('');
    show($('#siBranchWrap'), admin); siKind(); paintStatusChips(); loadSnRows(); loadPending();
    if (admin) paintItems();
  } catch (e) { toast(e.message, 'danger'); }
}
bindSlicer('stPeriod', 'fPeriodX', () => {});
for (const [box, key] of [['stPeriod', 'period'], ['stBranch', 'branch'], ['stItem', 'item']]) $('#' + box).addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; S.st[key] = b.dataset.v; loadStock(); });
/* ---- returns waiting for a decision (admin / supervisor) ---- */
async function loadPending() {
  try {
    const d = await api('getStockPending', S.token), n = d.sns.length + d.qty.reduce((a, q) => a + q.n, 0);
    $('#stPendN').textContent = n; show($('#stPendCard'), n > 0);
    const opts = '<div class="d-flex flex-wrap gap-2 mt-2 pd-act"><button type="button" class="btn btn-success btn-sm pd-in">In stock</button><button type="button" class="btn btn-outline-danger btn-sm pd-fa">Faulty…</button><button type="button" class="btn btn-outline-secondary btn-sm pd-ho">Send to HO</button></div><div class="hidden pd-why mt-2"><input class="form-control form-control-sm pd-reason" maxlength="100" placeholder="Reason it is faulty"><button type="button" class="btn btn-danger btn-sm mt-2 pd-fa-ok">Mark faulty</button></div>';
    $('#stPend').innerHTML = d.sns.map(x => '<div class="rv-item" data-sn="' + esc(x.sn) + '"><div class="d-flex justify-content-between gap-2"><b>' + esc(x.sn) + '</b><span class="small text-muted">' + esc(x.item) + ' · ' + esc(x.branch) + '</span></div>' +
        '<div class="small text-muted">' + esc([x.merchant ? 'from ' + x.merchant : '', x.mid ? 'MID ' + x.mid : '', x.by ? 'by ' + x.by : '', x.date ? fmtD(x.date) : ''].filter(Boolean).join(' · ')) + '</div>' + (x.note ? '<div class="rv-note">' + esc(x.note) + '</div>' : '') + opts + '</div>').join('') +
      d.qty.map(q => '<div class="rv-item" data-item="' + esc(q.item) + '" data-branch="' + esc(q.branch) + '" data-max="' + q.n + '"><div class="d-flex justify-content-between gap-2"><b>' + esc(q.item) + '</b><span class="small text-muted">' + esc(q.branch) + ' · ' + q.n + ' waiting</span></div>' +
        '<div class="small text-muted">' + esc([q.merchant ? 'last from ' + q.merchant : '', q.by ? 'by ' + q.by : ''].filter(Boolean).join(' · ')) + '</div>' + (q.note ? '<div class="rv-note">' + esc(q.note) + '</div>' : '') +
        '<div class="d-flex align-items-center gap-2 mt-2"><span class="small">Quantity</span><input type="number" min="1" max="' + q.n + '" value="' + q.n + '" class="form-control form-control-sm pd-qty" style="max-width:90px"></div>' + opts + '</div>').join('');
  } catch (e) { show($('#stPendCard'), false); }
}
$('#stPend').addEventListener('click', async e => {
  const it = e.target.closest('.rv-item'); if (!it) return;
  if (e.target.closest('.pd-fa')) { show($('.pd-why', it), true); $('.pd-reason', it).focus(); return; }
  const dec = e.target.closest('.pd-in') ? 'in' : e.target.closest('.pd-ho') ? 'ho' : e.target.closest('.pd-fa-ok') ? 'faulty' : ''; if (!dec) return;
  const f = { decision: dec, reason: dec === 'faulty' ? $('.pd-reason', it).value.trim() : '' };
  if (it.dataset.sn) f.sn = it.dataset.sn; else { f.item = it.dataset.item; f.branch = it.dataset.branch; f.qty = +$('.pd-qty', it).value; }
  if (dec === 'faulty' && !f.reason) { toast('Write the reason it is faulty.', 'warning'); return; }
  busy(e.target.closest('button'), true, 'Saving…');
  try { await api('stockDecide', S.token, f); toast('Saved', 'success'); loadStock(); } catch (ex) { toast(ex.message, 'danger'); busy(e.target.closest('button'), false); }
});
$('#rqSave').addEventListener('click', async () => {
  const btn = $('#rqSave'), msg = $('#rqMsg'); msg.textContent = '';
  if (!$('#rqTid').value.trim()) { msg.className = 'small mt-2 text-danger'; msg.textContent = 'Enter the TID.'; $('#rqTid').focus(); return; }
  busy(btn, true, 'Saving…');
  try {
    await api('stockReserveQty', S.token, { item: $('#rqItem').value, branch: $('#rqBranch').value.trim(), tid: $('#rqTid').value.trim(), merchant: $('#rqMer').value.trim(), note: $('#rqNote').value.trim() });
    msg.className = 'small mt-2 text-success'; msg.textContent = 'Reserved 1 ' + $('#rqItem').value + ' for TID ' + $('#rqTid').value.trim().toUpperCase() + '.'; $('#rqTid').value = ''; $('#rqMer').value = ''; $('#rqNote').value = ''; loadStock();
  } catch (ex) { msg.className = 'small mt-2 text-danger'; msg.textContent = ex.message; }
  busy(btn, false);
});
$('#rqList').addEventListener('click', async e => {
  const b = e.target.closest('.rq-rel'); if (!b) return; const row = b.closest('[data-tid]');
  busy(b, true, '…');
  try { await api('stockReleaseQty', S.token, { item: row.dataset.item, branch: row.dataset.branch, tid: row.dataset.tid }); toast('Released: back in stock.', 'success'); loadStock(); } catch (ex) { toast(ex.message, 'danger'); busy(b, false); }
});
S.siNew = '';
const siFind = () => (S.stockItems || []).find(i => i.name.toLowerCase() === $('#siItem').value.trim().toLowerCase());
function siKind() {
  const it = siFind(), nm = $('#siItem').value.trim(), isNew = !!nm && !it && S.user.role === 'Admin';
  show($('#siKindWrap'), isNew); $$('#siKindWrap .chip').forEach(b => b.classList.toggle('active', b.dataset.k === S.siNew));
  const q = it ? it.kind === 'qty' : (isNew && S.siNew === 'qty'); show($('#siSnWrap'), !q); show($('#siQtyWrap'), !!q); show($('#siSimWrap'), !!(it && it.sim && !q));
}
$('#siItem').addEventListener('input', siKind); $('#siItem').addEventListener('change', siKind);
$('#siKindWrap').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; S.siNew = b.dataset.k; siKind(); });
$('#siScan').addEventListener('click', () => openSnScan($('#siSns')));
$('#siSimScan').addEventListener('click', () => openSnScan($('#siSimSn')));
$('#siSimAdd').addEventListener('click', () => {
  const sn = $('#siSimSn').value.trim().toUpperCase().replace(/\s+/g, ''), no = $('#siSimNo').value.replace(/[^0-9]/g, '');
  if (!sn) { toast('Scan or type the SIM S/N.', 'warning'); $('#siSimSn').focus(); return; }
  if (no.length < 6 || no.length > 15) { toast('The SIM number needs 6 to 15 digits.', 'warning'); $('#siSimNo').focus(); return; }
  const lines = $('#siSns').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (lines.some(l => l.split(/[,;\t]/)[0].trim().toUpperCase() === sn)) { toast(sn + ' is already in the list.', 'warning'); return; }
  if (lines.some(l => l.split(/[,;\t]/).slice(1).join('').replace(/[^0-9]/g, '') === no)) { toast('SIM number ' + no + ' is already in the list.', 'warning'); return; }
  $('#siSns').value = lines.concat(sn + ', ' + no).join('\n'); $('#siSimSn').value = ''; $('#siSimNo').value = ''; $('#siSimSn').focus();
});
$('#siSave').addEventListener('click', async () => {
  const btn = $('#siSave'), msg = $('#siMsg'), it = siFind(), nm = $('#siItem').value.trim();
  if (!nm) { toast('Type or choose the item.', 'warning'); return; }
  if (!it && S.user.role === 'Admin' && !S.siNew) { toast('New item: choose Serial numbers or Quantity.', 'warning'); return; }
  busy(btn, true, 'Saving…');
  try {
    const r = await api('stockIn', S.token, { item: it ? it.name : nm, newKind: it ? '' : S.siNew, branch: $('#siBranch').value.trim(), batch: $('#siBatch').value.trim(), company: $('#siCompany').value.trim(), sns: $('#siSns').value, qty: $('#siQty').value });
    msg.className = 'small mt-2 text-success'; msg.textContent = 'Added ' + r.added + (r.skipped.length ? '. Skipped (already listed): ' + r.skipped.join(', ') : '.');
    $('#siSns').value = ''; $('#siQty').value = ''; S.siNew = ''; loadStock();
  } catch (e) { msg.className = 'small mt-2 text-danger'; msg.textContent = e.message; }
  busy(btn, false);
});
$('#aqSave').addEventListener('click', async () => {
  try { await api('stockAdjustQty', S.token, $('#aqItem').value, $('#siBranch').value.trim(), +$('#aqNum').value, $('#aqWhy').value.trim()); toast('Saved', 'success'); $('#aqNum').value = ''; $('#aqWhy').value = ''; loadStock(); } catch (e) { toast(e.message, 'danger'); }
});
/* S/N lookup: scan or type an S/N (or a SIM number) and see where it is and what happened to it */
async function snLookup() {
  const q = $('#lkQ').value.trim(), out = $('#lkRes'); if (!q) { toast('Scan or type the serial number.', 'warning'); return; }
  const btn = $('#lkGo'); busy(btn, true, '…');
  try {
    const d = await api('stockLookup', S.token, q);
    if (!d.found) { out.innerHTML = '<div class="small text-danger">' + (d.many && d.many.length ? 'More than one match. Type more digits:<br>' + d.many.map(m => '<b>' + esc(m.sn) + '</b> · ' + esc(m.item) + ' · ' + esc(m.status)).join('<br>') : (d.records && d.records.length ? 'Not in the stock list, but used on these records:' : 'Not found in stock or in any record.')) + '</div>' + (d.records || []).map(r => '<div class="small py-1 border-top"><b>' + esc(r.merchant) + '</b> · ' + esc(r.as) + '<div class="text-muted">' + esc([r.type, r.activity, r.mid ? 'MID ' + r.mid : '', r.tid ? 'TID ' + r.tid : '', r.user, fmtD(r.date), r.stamp].filter(Boolean).join(' · ')) + '</div></div>').join(''); }
    else {
      const r = d.row, line = (k, v) => v ? '<div class="d-flex justify-content-between gap-2 py-1 border-top"><span class="text-muted">' + k + '</span><span class="text-end">' + esc(v) + '</span></div>' : '';
      out.innerHTML = '<div class="d-flex justify-content-between align-items-start gap-2 mb-1"><div><div class="fw-bold" style="font-size:1.05rem">' + esc(r.sn) + '</div><div class="small text-muted">' + esc(r.item) + (r.company ? ' · ' + esc(r.company) : '') + '</div></div>' + stPillOf(r.status) + '</div><div class="small">' +
        line('SIM number', r.simNo) + line('Branch', r.branch) + line('Merchant', r.merchant) + line('MID', r.mid) + line('TID', r.tid) + line('Used by', r.usedBy) + line('Used date', r.usedDate ? fmtD(r.usedDate) : '') + line('Record', r.rec) + line('Paired with', r.pair) + line('Note', r.reason) + line('Stock in', (r.inDate ? fmtD(r.inDate) : '') + (r.inBy ? ' · ' + r.inBy : '')) + line('Batch / PO', r.batch) + '</div>' +
        '<div class="form-label mt-3 mb-1">History</div>' + (d.history.length ? d.history.map(h => '<div class="small py-1 border-top"><b>' + esc(h.action) + '</b> · ' + esc(String(h.ts).slice(0, 16)) + '<div class="text-muted">' + esc([h.branch, h.by, h.merchant, h.mid ? 'MID ' + h.mid : '', h.rec, h.note].filter(Boolean).join(' · ')) + '</div></div>').join('') : '<div class="small text-muted">No movements yet.</div>');
    }
  } catch (e) { out.innerHTML = '<div class="small text-danger">' + esc(e.message) + '</div>'; }
  busy(btn, false);
}
$('#lkGo').addEventListener('click', snLookup);
$('#lkQ').addEventListener('keydown', e => { S.lkScan = false; if (e.key === 'Enter') { e.preventDefault(); snLookup(); } });
$('#lkScan').addEventListener('click', () => { S.lkScan = true; openSnScan($('#lkQ')); });
$('#lkQ').addEventListener('input', () => { if (S.lkScan) { S.lkScan = false; snLookup(); } });      // a scan looks up at once
/* S/N list */
const SN_STATUS = ['In stock', 'Reserved', 'Used', 'To decide', 'Faulty', 'Sent to HO', 'All'];
function paintStatusChips() { $('#snStatus').innerHTML = SN_STATUS.map(x => '<button type="button" class="chip' + (S.st.status === x ? ' active' : '') + '" data-v="' + x + '">' + x + '</button>').join(''); }
$('#snStatus').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; S.st.status = b.dataset.v; paintStatusChips(); loadSnRows(); });
let snFindT = null; $('#snFind').addEventListener('input', () => { clearTimeout(snFindT); snFindT = setTimeout(loadSnRows, 300); });
async function loadSnRows() {
  try {
    const d = await api('getStockSNs', S.token, { status: S.st.status, q: $('#snFind').value.trim(), item: S.st.item, branch: S.user.role === 'Admin' ? S.st.branch : '' });
    $('#snRows').innerHTML = d.rows.length ? d.rows.map(r => '<div class="sn-row" data-sn="' + esc(r.sn) + '" data-st="' + esc(r.status) + '" style="cursor:default"><div class="min-w-0"><b>' + esc(r.sn) + '</b> ' + stPillOf(r.status) + '<div class="small text-muted text-truncate">' + esc(r.item) + (r.simNo ? ' · 📶 ' + esc(r.simNo) : '') + (r.company ? ' · ' + esc(r.company) : '') + ' · ' + esc(r.branch) + (r.merchant ? ' · ' + esc(r.merchant) + (r.mid ? ' (MID ' + esc(r.mid) + ')' : '') : '') + (r.tid ? ' · TID ' + esc(r.tid) : '') + (r.usedBy ? ' · ' + esc(r.usedBy) : '') + (r.usedDate ? ' · ' + esc(fmtD(r.usedDate)) : '') + (r.pair ? ' · paired with ' + esc(r.pair) : '') + (r.reason ? ' · ' + esc(r.reason) : '') + (r.rec ? ' · ' + esc(r.rec) : '') + '</div></div><button type="button" class="btn btn-soft btn-sm flex-none sn-adj">' + (r.status === 'Reserved' ? 'Release' : 'Change') + '</button></div>').join('') + (d.total > d.rows.length ? '<div class="small text-muted">Showing ' + d.rows.length + ' of ' + d.total + '. Search to narrow down.</div>' : '') : '<div class="small text-muted">No serial numbers here.</div>';
  } catch (e) { toast(e.message, 'danger'); }
}
const adjModal = new bootstrap.Modal($('#adjModal')); S.adj = { sn: '', status: 'In stock' };
$('#snRows').addEventListener('click', e => {
  const b = e.target.closest('.sn-adj'); if (!b) return; const row = b.closest('[data-sn]');
  S.adj = { sn: row.dataset.sn, status: row.dataset.st === 'Reserved' ? 'In stock' : 'In stock', cur: row.dataset.st };
  $('#adjSn').textContent = S.adj.sn; $('#adjWhy').value = ''; $('#adjMer').value = ''; $('#adjMid').value = ''; $('#adjTid').value = ''; paintAdj(); adjModal.show();
});
function paintAdj() {
  const list = ['In stock', 'Faulty', 'Sent to HO'].concat(S.adj.cur === 'In stock' ? ['Reserved'] : []);
  $('#adjChips').innerHTML = list.map(x => '<button type="button" class="chip' + (S.adj.status === x ? ' active' : '') + '" data-v="' + x + '">' + (x === 'Reserved' ? 'Keep as reserved' : x) + '</button>').join('');
  const r = S.adj.status === 'Reserved'; show($('#adjResWrap'), r); $('#adjWhy').placeholder = r ? 'Note (optional)' : 'Reason (needed for Faulty)';
}
$('#adjChips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; S.adj.status = b.dataset.v; paintAdj(); });
/* scan the merchant's KHQR to fill the name and MID of a reservation */
$('#adjScan').addEventListener('click', () => {
  S.snInput = null; S.scanTarget = { el: $('#adjResWrap') }; S.scanReturn = adjModal; scanMode(false);
  adjModal.hide(); setTimeout(() => scanModal.show(), 350);
});
$('#adjSave').addEventListener('click', async () => {
  try {
    if (S.adj.status === 'Reserved') {
      const mer = $('#adjMer').value.trim(), mid = $('#adjMid').value.trim(), tid = $('#adjTid').value.trim();
      if (!tid) { toast('Enter the TID.', 'warning'); $('#adjTid').focus(); return; }
      await api('stockReserve', S.token, { sns: S.adj.sn, merchant: mer, mid: mid, tid: tid, note: $('#adjWhy').value.trim() });
    } else await api('stockAdjust', S.token, S.adj.sn, S.adj.status, $('#adjWhy').value.trim());
    adjModal.hide(); toast('Saved', 'success'); loadStock();
  } catch (e) { toast(e.message, 'danger'); }
});
/* items + alert (admin) */
S.itDraft = [];
function paintItems() {
  if (!S.itDirty) S.itDraft = (S.stockItems || []).map(i => Object.assign({}, i));
  $('#itList').innerHTML = S.itDraft.length ? S.itDraft.map((i, n) => '<div class="d-flex align-items-center gap-2 mb-1" data-n="' + n + '"><span class="flex-grow-1 text-truncate">' + esc(i.name) + ' <span class="small text-muted">' + (i.kind === 'qty' ? 'quantity' : 'with S/N') + '</span></span><span class="small">Low at</span><input type="number" min="0" class="form-control form-control-sm it-low" style="max-width:80px" value="' + i.low + '">' + (i.kind === 'qty' ? '' : '<label class="small d-flex align-items-center gap-1 mb-0 flex-none" title="Each S/N of this item is stocked in together with a SIM number"><input type="checkbox" class="form-check-input mt-0 it-sim"' + (i.sim ? ' checked' : '') + '>SIM no.</label>') + '<button type="button" class="btn btn-sm btn-outline-danger border-0 it-del"><i class="bi bi-x-lg"></i></button></div>').join('') : '<div class="small text-muted">No items yet.</div>';
  if (S.stockAlert) { $('#alChat').value = S.stockAlert.chat || ''; $('#alTopic').value = S.stockAlert.topic || ''; }
}
$('#itList').addEventListener('input', e => { if (e.target.classList.contains('it-low')) { S.itDraft[+e.target.closest('[data-n]').dataset.n].low = Math.max(0, Math.floor(+e.target.value) || 0); S.itDirty = true; } });
$('#itList').addEventListener('change', e => { if (e.target.classList.contains('it-sim')) { S.itDraft[+e.target.closest('[data-n]').dataset.n].sim = e.target.checked; S.itDirty = true; } });
$('#itList').addEventListener('click', e => { const b = e.target.closest('.it-del'); if (!b) return; S.itDraft.splice(+b.closest('[data-n]').dataset.n, 1); S.itDirty = true; paintItems(); });
$('#itAdd').addEventListener('click', () => { const n = $('#itName').value.trim().replace(/\s+/g, ' '); if (!n) return; if (S.itDraft.some(i => i.name.toLowerCase() === n.toLowerCase())) { toast('That item is already listed.', 'warning'); return; } S.itDraft.push({ name: n, kind: $('#itKind').value, low: 0, sim: false }); S.itDirty = true; $('#itName').value = ''; paintItems(); });
$('#itSave').addEventListener('click', async () => {
  try { const r = await api('saveStockItems', S.token, S.itDraft, { chat: $('#alChat').value.trim(), topic: $('#alTopic').value.trim() }); S.stockItems = r.items; S.stockAlert = r.alert; S.itDirty = false; toast('Stock items saved.', 'success'); loadStock(); } catch (e) { toast(e.message, 'danger'); }
});

/* ============================ Last record + edit ============================ */
S.rules = { enabled: true, max: 3, days: 1 };
const ruleText = () => 'edit up to ' + S.rules.max + (S.rules.max === 1 ? ' time' : ' times') + (S.rules.days === 1 ? ', same day only' : ', within ' + S.rules.days + ' days');
async function loadLast() {
  try { S.rules = await api('getMyEditRules', S.token); } catch (e) {}
  try { S.today = await api('getTodayRecords', S.token); } catch (e) { S.today = []; }
  renderLast();
}
function renderLast() {
  const list = S.today || [];
  show($('#lastCard'), list.length > 0);
  $('#todayTitle').innerHTML = (S.rules.days === 1 ? "Today's records" : 'Recent records') + ' <span class="text-muted">· ' + ruleText() + '</span>';
  $('#todayList').innerHTML = list.map(r => {
    const rvs = r.review && r.review.status, canEdit = rvs === 'Returned' || (rvs !== 'Pending' && S.rules.enabled && r.editsLeft > 0);
    return '<div class="d-flex align-items-center gap-2 py-1 border-top" data-stamp="' + esc(r.stamp) + '"><div class="flex-grow-1 min-w-0">' +
    '<div class="fw-semibold small text-truncate">' + esc(r.type + (r.activity && r.activity !== r.type ? ' · ' + r.activity : '') + ' — ' + (r.merchant || r.mid || r.stamp)) + '</div>' +
    '<div class="small text-muted text-truncate">' + esc(r.stamp) + ' · ' + (rvs ? (rvs === 'Pending' ? 'waiting for the admin' : rvs === 'Returned' ? 'returned: fix and resubmit' : 'approved') : '') + (!rvs || rvs === 'Approved' ? (rvs ? ' · ' : '') + (r.editsLeft > 0 && S.rules.enabled ? r.editsLeft + ' of ' + S.rules.max + ' edits left' : (S.rules.enabled ? 'edit limit reached' : 'editing closed')) : '') + '</div>' +
    (rvs === 'Returned' && r.review.note ? '<div class="rv-note"><b>Admin note:</b> ' + esc(r.review.note) + '</div>' : '') + '</div>' +
    (rvs ? '<span class="flex-none">' + stPill(rvs) + '</span>' : '') +
    '<button class="btn ' + (rvs === 'Returned' ? 'btn-primary' : 'btn-soft') + ' btn-sm flex-none t-edit" type="button"' + (canEdit ? '' : ' disabled') + '><i class="bi bi-pencil me-1"></i>' + (rvs === 'Returned' ? 'Fix' : 'Edit') + '</button></div>';
  }).join('');
}
$('#todayList').addEventListener('click', e => {
  const b = e.target.closest('.t-edit'); if (!b) return;
  const r = (S.today || []).find(x => x.stamp === b.closest('[data-stamp]').dataset.stamp);
  if (r) { S.last = r; openEdit(); }
});
const editModal = new bootstrap.Modal($('#editModal'));
function updateEditDateLabel() {
  const t = $('#eType').value || (S.last ? S.last.type : curType), a = $('#eAct').value, d = effDef(t, a, $('#eSub').value || '');
  $('#eDateLbl').textContent = dateLabel(a, t).replace('Installed / action date', 'Date');
  applyLevels($('#editModal'), d); renderCustom($('#eCustom'), d); applyOrderEdit(d);
}
/** Sub categories of a category in the edit form (hidden when the category has none). */
function eFillSubs(t, cur) {
  const td = typeDef(t), subs = (td && td.subs) || [];
  show($('#eSubWrap'), subs.length > 0);
  $('#eSub').innerHTML = (subs.some(s => s.n === cur) ? '' : '<option value="">Select…</option>') + subs.map(s => '<option value="' + esc(s.n) + '">' + esc(s.n) + '</option>').join('');
  $('#eSub').value = subs.some(s => s.n === cur) ? cur : '';
}
/** Activities of the chosen category / sub category. */
function eFillActs(cur) {
  const t = $('#eType').value, td = typeDef(t), sub = $('#eSub').value || '';
  const list = td ? (isLinked(td) && sub ? td.acts.filter(a => actSubs(a).includes(sub)).map(a => a.n) : td.acts.map(a => a.n)) : [];
  $('#eAct').innerHTML = '<option value="">Select activity…</option>' + list.map(a => '<option>' + esc(a) + '</option>').join('');
  $('#eAct').value = list.includes(cur) ? cur : (list.length === 1 ? list[0] : '');
}
$('#eType').addEventListener('change', () => { window._eType = $('#eType').value; eFillSubs($('#eType').value, ''); eFillActs(''); refreshMidLabel($('#eMid'), window._eType); updateEditDateLabel(); });
$('#eSub').addEventListener('change', () => { eFillActs($('#eAct').value); updateEditDateLabel(); });
async function eAddPhotos(files, fromCamera) {
  const room = MAX_PHOTOS - S.ePh.length;
  if (room <= 0) { toast('Photo limit reached (' + MAX_PHOTOS + ').', 'warning'); return; }
  files = files.slice(0, room);
  const prog = $('#ePrg'), bar = $('.progress-bar', prog), doStamp = !!(fromCamera && stampOn);
  show(prog, true); prog.style.display = 'flex'; bar.style.width = '5%';
  const pq = PQ[((effDef($('#eType').value, $('#eAct').value, $('#eSub').value || '') || {}).pq) || ''] || PQ[''];
  const sd = doStamp ? await stampData() : null;
  for (let i = 0; i < files.length; i++) {
    try {
      const f = files[i];
      if (isVideoFile(f)) {
        if (S.ePh.filter(isVideoSrc).length >= MAX_VIDEOS) { toast('At most ' + MAX_VIDEOS + ' videos.', 'warning'); continue; }
        if (f.size > MAX_VIDEO_MB * 1048576) { toast('Video is ' + Math.round(f.size / 1048576) + ' MB; the limit is ' + MAX_VIDEO_MB + ' MB.', 'warning'); continue; }
        S.ePh.push(await readVideo(f));
      } else S.ePh.push(await compress(f, Object.assign({ stamp: doStamp, data: sd }, pq)));
    } catch (e) { toast('Skipped an unreadable file.', 'warning'); }
    bar.style.width = Math.round(((i + 1) / files.length) * 100) + '%';
  }
  setTimeout(() => { prog.style.display = 'none'; }, 350);
  ePhPaint();
}
function ePhPaint() {
  renderPhotos({ el: $('#ePhWrap'), photos: S.ePh });
  show($('#ePhClear'), S.ePh.length > 0);
  $('#ePhHint').innerHTML = S.ePh.length ? '<b>' + S.ePh.length + ' new</b> photo(s) will replace <b>all</b> the old ones.' : 'Keep the current photos, or choose new ones: they replace <b>all</b> the old ones and are sent to Telegram again.';
}
$('#ePhGrid').addEventListener('click', () => setTimeout(ePhPaint, 0));
$('#eCam').onclick = () => $('#eCamFile').click(); $('#ePick').onclick = () => $('#ePickFile').click();
$('#eCamFile').onchange = async e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) await eAddPhotos(fs, true); };
$('#ePickFile').onchange = async e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) await eAddPhotos(fs, false); };
$('#ePhClear').onclick = () => { S.ePh = []; ePhPaint(); };
function openEdit() {
  const r = S.last; if (!r) return;
  show($('#eError'), false);
  $('#eCat').textContent = r.type;
  $('#eStamp').value = r.stamp; $('#eStampTxt').textContent = r.stamp + (r.review && r.review.status === 'Returned' ? ' · fix and resubmit' : ' · edit ' + ((r.edits || 0) + 1) + ' of ' + S.rules.max);
  S.ePh = []; renderPhotos({ el: $('#ePhWrap'), photos: S.ePh }); show($('#ePhClear'), false);
  $('#ePhNow').textContent = r.photos > 0 ? '· ' + r.photos + ' now' : '';
  $('#eType').innerHTML = TYPES.map(t => '<option value="' + esc(t) + '">' + esc(t) + '</option>').join(''); $('#eType').value = r.type;
  eFillSubs(r.type, r.sub || ''); eFillActs(r.activity);
  { const od = effDef(r.type, r.activity, r.sub || ''), lock = !!(od && od.stock); $('#eType').disabled = lock; $('#eAct').disabled = lock; show($('#eLockTxt'), lock); }
  $('#eDate').value = r.date || r.ts.slice(0, 10); $('#eDate').max = ymd(new Date());
  $('#eName').value = r.merchant; $('#eMid').value = r.mid; window._eType = r.type; refreshMidLabel($('#eMid'), r.type); $('#eTid').value = r.tid;
  YN_KEYS.forEach(k => { const el = $('#e' + k[0].toUpperCase() + k.slice(1)); el.checked = /^yes$/i.test(r[k] || ''); syncYn(el); });
  $('#eBiz').value = r.business; $('#eRem').value = r.remarks;
  $('#bizTypeList').innerHTML = BIZ_TYPES.map(t => '<option value="' + esc(t) + '">').join('');
  const hm = /(\d{2}:\d{2}) ?- ?(\d{2}:\d{2})/.exec(r.hours || ''); $('#eOpen').value = hm ? hm[1] : ''; $('#eClose').value = hm ? hm[2] : '';
  $('#prodTypeList').innerHTML = TYPES.map(t => '<option value="' + esc(t) + '">').join(''); $('#eProd').value = r.ptype || ''; $('#eCommune').value = r.commune || ''; $('#eZone').value = r.zone || '';
  $('#eBType').value = r.btype || ''; $('#eGroup').value = r.group || '';
  { const d0 = effDef(r.type, r.activity, r.sub || ''); renderCustom($('#eCustom'), d0); applyOrderEdit(d0); const mp = {}; String(r.extra || '').split(' | ').forEach(x => { const i = x.indexOf(': '); if (i > 0) mp[x.slice(0, i)] = x.slice(i + 2); }); ((d0 && d0.custom) || []).forEach(f => { const el = $('[data-fid="' + f.id + '"]', $('#eCustom')); if (el && mp[f.label] != null) setCustomVal(el, mp[f.label]); }); }
  $('#ePhone').value = r.phone || ''; $('#eTag').value = r.tag || ''; $('#eSerial').value = r.serial || ''; $('#eOldSn').value = r.oldSn || ''; $('#eNewSn').value = r.newSn || '';
  updateEditDateLabel();
  editModal.show();
}
$('#eAct').addEventListener('change', updateEditDateLabel);
$('#editForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#eSave'), err = $('#eError');
  show(err, false); busy(btn, true, 'Saving…');
  try {
    if (S.ePh.reduce((t, p) => t + p.length, 0) > 32e6) throw new Error('The new photos and videos are too big to send together. Remove a video or some photos.');
    { const mv = $('#eMid').value.trim(), pf = midPrefix(window._eType); if (mv && mv !== NOQR && pf && mv[0] !== pf) throw new Error('The MID of ' + window._eType + ' must start with ' + pf + '.'); }
    const r = await api('updateRecord', S.token, {
      stamp: $('#eStamp').value, type: $('#eType').value, sub: $('#eSub').value, photos: S.ePh.length ? S.ePh : undefined, activity: $('#eAct').value, date: $('#eDate').value, merchant: $('#eName').value.trim(),
      mid: $('#eMid').value.trim(), tid: $('#eTid').value.trim(), integ: $('#eInteg').checked, sim: $('#eSim').checked, standee: $('#eStandee').checked, business: $('#eBiz').value.trim(), remarks: $('#eRem').value.trim(),
      extra: Object.fromEntries($$('#eCustom [data-fid]').map(i => [i.dataset.fid, customVal(i)])), btype: $('#eBType').value.trim(), group: $('#eGroup').value.trim(), hours: $('#eOpen').value && $('#eClose').value ? $('#eOpen').value + ' - ' + $('#eClose').value : '',
      ptype: $('#eProd').value.trim(), commune: $('#eCommune').value.trim(), zone: $('#eZone').value.trim(), serial: $('#eSerial').value.trim(), phone: $('#ePhone').value.trim(), tag: $('#eTag').value.trim(), oldSn: $('#eOldSn').value.trim(), newSn: $('#eNewSn').value.trim()
    });
    const oldStamp = $('#eStamp').value;
    S.today = (S.today || []).map(x => x.stamp === oldStamp ? r.record : x); renderLast(); editModal.hide();
    toast('Saved' + (r.record.stamp !== oldStamp ? ' (new ID ' + r.record.stamp + ')' : '') + '. Telegram: ' + r.telegram, /^(updated|photos replaced)/.test(r.telegram) && !/NOT/.test(r.telegram) ? 'success' : 'warning');
    loadSummary();
    if (!$('#pane-records').classList.contains('hidden')) loadRecords();
  } catch (ex) { err.textContent = ex.message; show(err, true); }
  busy(btn, false);
});

/* ============================ Install as app (PWA) ============================ */
let deferredPrompt = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function refreshInstallUI() {
  const can = !isStandalone();
  show($('#installBtn'), can); show($('#installLink'), can);
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; refreshInstallUI(); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; refreshInstallUI(); toast('App installed on your home screen', 'success'); });
async function doInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch (e) {}
    deferredPrompt = null; refreshInstallUI();
    return;
  }
  show($('#installIOS'), isIOS); show($('#installOther'), !isIOS);
  new bootstrap.Modal($('#installModal')).show();
}
$('#installBtn').addEventListener('click', doInstall);
$('#installLink').addEventListener('click', doInstall);
refreshInstallUI();
if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ============================ Boot ============================ */
applyTheme();
(async function init() {
  const t = store.get('it_token');
  if (!t) { showLogin(); return; }
  try {
    const r = await api('checkSession', t);
    S.token = t; S.user = r.user; showApp();
  } catch (e) { showLogin(); }
})();

/* ============================ QR Installation scan check ============================ */
/** Same rule as the server: a QR category (name contains QR) and an activity whose name contains "install". */
const qcRule = (t, a) => /qr/i.test(t || '') && /install/i.test(a || '');
/** On for an activity: the admin's switch (category editor) when set, else the built-in rule. */
const qcEff = (t, d) => !!d && (d.qrchk === true || (d.qrchk !== false && qcRule(t, d.n)));
const qcOn = card => { const a = $('.f-act', card.el).value; return !!a && qcEff(curType, actDef(curType, a), S.sub || ''); };
const qcNorm = v => String(v || '').trim().toUpperCase();
const qcFresh = () => ({ sid: '', given: 0, scans: [], wrong: 0, expMid: '', expName: '' });
function qcWire(card) {
  const el = card.el;
  $('.qc-minus', el).onclick = () => { const q = card.qc; if (q.given > Math.max(1, q.scans.length)) { q.given--; qcPaint(card); } else if (q.given > 0 && q.scans.length === 0) { q.given = 0; qcPaint(card); } };
  $('.qc-plus', el).onclick = () => { const q = card.qc; if (q.given < 30) { q.given++; qcPaint(card); } };
  $('.qc-scan', el).onclick = () => {
    const q = card.qc;
    if (!(q.given >= 1)) { toast('First set how many QR materials you gave the merchant.', 'warning'); return; }
    if (q.scans.length >= q.given) { toast('All ' + q.given + ' QR are scanned.', 'success'); return; }
    S.scanTarget = null; S.snInput = null; S.qcCard = card; scanMode(false);
    $('#scanTitle').textContent = 'Scan QR ' + (q.scans.length + 1) + ' of ' + q.given;
    scanModal.show();
  };
  $('.qc-reset', el).onclick = () => { if (confirm('Clear the scanned QRs of this merchant and start again?')) { card.qc = qcFresh(); qcPaint(card); } };
}
/** Shows the block when the activity needs it, hides (and clears) it otherwise. */
function qcSync(card) {
  const on = qcOn(card);
  show($('.qc-wrap', card.el), on);
  if (!on && card.qc && (card.qc.given || card.qc.scans.length)) card.qc = qcFresh();
  qcPaint(card);
}
function qcPaint(card) {
  if (!card.qc) card.qc = qcFresh();
  const q = card.qc, el = card.el, n = q.scans.length;
  $('.qc-n', el).textContent = q.given || '–';
  $('.qc-bar .progress-bar', el).style.width = (q.given ? Math.round(100 * n / q.given) : 0) + '%';
  $('.qc-bar .progress-bar', el).classList.toggle('bg-success', q.given > 0 && n >= q.given);
  $('.qc-sum', el).innerHTML = !q.given ? 'Set the quantity, then scan every QR.' : (n >= q.given ? '<b class="text-success">All ' + q.given + ' scanned.</b> You can submit.' : '<b>' + n + ' / ' + q.given + '</b> scanned' + (q.expMid ? ' · MID ' + esc(q.expMid) : '')) + (q.wrong ? ' · <span class="text-danger">' + q.wrong + ' wrong scan' + (q.wrong > 1 ? 's' : '') + '</span>' : '');
  const rows = [];
  for (let i = 0; i < q.given; i++) { const s = q.scans[i]; rows.push(s ? '<div class="qc-row ok"><i class="bi bi-check-circle-fill"></i><span>QR ' + (i + 1) + '</span><b>' + esc(s.mid) + '</b></div>' : '<div class="qc-row"><i class="bi bi-circle"></i><span>QR ' + (i + 1) + '</span><b>' + (i === n ? 'next to scan' : 'waiting') + '</b></div>'); }
  $('.qc-list', el).innerHTML = rows.join('');
  $('.qc-scan', el).innerHTML = n >= q.given && q.given ? '<i class="bi bi-check2-all me-1"></i>All scanned' : '<i class="bi bi-qr-code-scan me-1"></i>Scan QR ' + (n + 1) + (q.given ? ' of ' + q.given : '');
  $('.qc-scan', el).classList.toggle('btn-success', q.given > 0 && n >= q.given); $('.qc-scan', el).classList.toggle('btn-primary', !(q.given > 0 && n >= q.given));
  show($('.qc-reset', el), n > 0 || q.wrong > 0);
}
function qcLog(card, ok, mid, name) {
  const q = card.qc;
  api('qrScanLog', S.token, { sid: q.sid, ok, given: q.given, expMid: q.expMid, expName: q.expName, mid, name }).catch(() => {});     // live for the admin; a lost call does not stop the staff
}
function qcScanned(card, text) {
  const q = card.qc, r = parseKHQR(text);
  const mid = r ? (r.mid || '').trim() : '';
  if (!r || !mid) { toast('That QR has no MID. Scan the merchant’s KHQR sticker.', 'warning'); return; }
  if (!q.sid) q.sid = 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const typed = $('.f-mid', card.el).value.trim(), exp = q.expMid || (typed && typed !== NOQR && !$('[data-fk="mid"]', card.el).classList.contains('hidden') ? typed : '');
  if (exp && qcNorm(exp) !== qcNorm(mid)) {      // a different merchant's QR: not counted, the admin is told
    q.wrong++; if (!q.expMid) { q.expMid = exp; q.expName = $('.f-name', card.el).value.trim(); }
    try { navigator.vibrate && navigator.vibrate([250, 100, 250, 100, 250]); } catch (e) {}
    $('#qaExp').textContent = q.expMid; $('#qaExpN').textContent = q.expName || ''; $('#qaGot').textContent = mid; $('#qaGotN').textContent = r.name || '';
    qcLog(card, false, mid, r.name || '');
    qcPaint(card); setTimeout(() => bootstrap.Modal.getOrCreateInstance($('#qcAlert')).show(), 300);
    return;
  }
  if (!q.expMid) { q.expMid = mid; q.expName = r.name || ''; setQRFields(card, r.name, mid, r.tid); }
  q.scans.push({ mid, name: r.name || '' });
  qcLog(card, true, mid, r.name || '');
  toast('QR ' + q.scans.length + ' of ' + q.given + ' scanned' + (q.scans.length >= q.given ? ' – all done' : ''), 'success');
  qcPaint(card);
}

/* ---- admin: live view ---- */
S.qcRange = 'today'; S.qcBranch = ''; S.qcFilter = 'all'; S.qcData = null; S.qcTimer = null;
const qcModal = new bootstrap.Modal($('#qcLive'));
$('#qcLiveBtn').addEventListener('click', () => { qcModal.show(); });
$('#qcLive').addEventListener('shown.bs.modal', () => { qcLoad(); clearInterval(S.qcTimer); S.qcTimer = setInterval(qcLoad, 10000); });
$('#qcLive').addEventListener('hidden.bs.modal', () => { clearInterval(S.qcTimer); S.qcTimer = null; });
async function qcLoad() {
  try { S.qcData = await api('getQrLive', S.token, { range: S.qcRange, branch: S.qcBranch }); qcRender(); } catch (e) { $('#qlNone').textContent = e.message; }
}
function qcRender() {
  const d = S.qcData; if (!d) return;
  $('#qlTime').textContent = d.now;
  const k = d.kpi, card = (n, l, c) => '<div class="kp ' + (c || '') + '"><b>' + n + '</b><span>' + l + '</span></div>';
  $('#qlKpi').innerHTML = card(k.total, 'QR installations') + card(k.done, 'Complete') + card(k.scanning, 'Scanning now') + card(k.wrong, 'Wrong-MID scans', k.wrong ? 'bad' : '') + card(k.stopped, 'Stopped before submit', k.stopped ? 'warn' : '');
  $('#qlRange').innerHTML = [['today', 'Today'], ['hour', 'Last hour']].map(r => '<button type="button" class="chip' + (S.qcRange === r[0] ? ' active' : '') + '" data-v="' + r[0] + '">' + r[1] + '</button>').join('');
  const bs = d.branches || []; show($('#qlBranch'), bs.length > 1);
  $('#qlBranch').innerHTML = ['', ...bs].map(b => '<button type="button" class="chip' + (S.qcBranch === b ? ' active' : '') + '" data-v="' + esc(b) + '">' + (b || 'All branches') + '</button>').join('');
  const ss = d.sessions;
  const stt = { done: ['Complete', 'success'], scanning: ['Scanning…', 'primary'], stopped: ['Stopped', 'warning'] };
  $('#qlRows').innerHTML = ss.map(s => '<tr class="qc-bad"><td>' + esc(s.name) + '<div class="small text-muted">' + esc(s.branch) + ' · ' + esc(s.last.slice(11, 16)) + '</div></td><td class="font-monospace">' + (s.record ? esc(s.record) : '<span class="text-muted small">not saved yet</span>') + '</td><td><b class="font-monospace">' + esc(s.mid || '—') + '</b><div class="small">' + esc(s.merchant || '') + '</div></td><td class="text-end">' + s.given + '</td><td class="text-end">' + s.ok + '</td><td class="text-end text-danger fw-bold">' + s.wrong + '</td><td class="text-danger">' + s.wrongs.map(w => '<b class="font-monospace">' + esc(w.mid) + '</b><div class="small">' + esc(w.name || '') + '</div>').join('') + '</td><td><span class="badge text-bg-' + stt[s.status][1] + '">' + stt[s.status][0] + '</span></td></tr>').join('');
  $('#qlNone').textContent = ss.length ? '' : 'No wrong scans in this view. All good.';
  $('#qlFeed').innerHTML = d.feed.map(f => '<div class="qc-feed bad"><span class="t">' + esc(f.t.slice(11, 19)) + '</span><span class="w"><b>' + esc(f.name) + '</b> scanned <b>' + esc(f.mid) + '</b> ' + esc(f.scanName) + ' · expected <b>' + esc(f.expMid) + '</b> ' + esc(f.expName) + '</span></div>').join('') || '<div class="small text-muted">No wrong scans. All good.</div>';
}
$('#qlRange').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { S.qcRange = b.dataset.v; qcLoad(); } });
$('#qlBranch').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { S.qcBranch = b.dataset.v; qcLoad(); } });

/* ============================ Repeated (redundant) records ============================ */
S.rp = { days: 7, same: 'act', branch: '', type: '' };
const rpModal = new bootstrap.Modal($('#rpModal'));
$('#rpBtn').addEventListener('click', () => { rpModal.show(); });
$('#rpModal').addEventListener('shown.bs.modal', () => rpLoad());
async function rpLoad() {
  try { S.rpData = await api('getRepeats', S.token, S.rp); rpRender(); } catch (e) { $('#rpNone').textContent = e.message; }
}
function rpRender() {
  const d = S.rpData; if (!d) return;
  const ch = (items, cur) => items.map(([v, l]) => '<button type="button" class="chip' + (String(cur) === String(v) ? ' active' : '') + '" data-v="' + esc(v) + '">' + esc(l) + '</button>').join('');
  $('#rpDays').innerHTML = ch([[1, 'Today'], [3, '3 days'], [7, '7 days'], [14, '14 days'], [30, '30 days']], d.days);
  $('#rpRange').textContent = fmtD(d.from) + ' – ' + fmtD(d.to);
  $('#rpSame').innerHTML = ch([['act', 'Same activity'], ['any', 'Any activity']], d.same);
  const bs = d.branches || []; show($('#rpBranch'), bs.length > 1); $('#rpBranch').innerHTML = ch([['', 'All branches'], ...bs.map(b => [b, b])], S.rp.branch);
  show($('#rpType'), TYPES.length > 1); $('#rpType').innerHTML = ch([['', 'All categories'], ...TYPES.map(t => [t, shortName(t)])], S.rp.type);
  const k = d.kpi, card = (n, l, c) => '<div class="kp ' + (c || '') + '"><b>' + n + '</b><span>' + l + '</span></div>';
  $('#rpKpi').innerHTML = card(k.groups, 'Merchants repeated', k.groups ? 'warn' : '') + card(k.extra, 'Extra records') + card(k.staff, 'By different staff', k.staff ? 'bad' : '');
  $('#rpRows').innerHTML = d.groups.map(g => '<tr><td><b>' + esc(g.merchant || g.id) + '</b><div class="small text-muted font-monospace">' + esc(g.id) + '</div></td><td>' + esc(shortName(g.type)) + (g.activity ? ' · ' + esc(g.activity) : '') + '</td><td class="text-end fw-bold ' + (g.users > 1 ? 'text-danger' : '') + '">' + g.count + '</td><td class="small">' +
    g.recs.map(r => esc(fmtD(r.date)) + ' · ' + esc(r.user) + (g.activity ? '' : ' · ' + esc(r.activity)) + ' · <span class="font-monospace">' + esc(r.stamp) + '</span>').join('<br>') + '</td></tr>').join('');
  $('#rpNone').textContent = d.groups.length ? '' : 'No repeated records in this period.';
}
$('#rpDays').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { S.rp.days = +b.dataset.v; $('#rpCustom').value = ''; rpLoad(); } });
$('#rpCustom').addEventListener('change', e => { const v = Math.floor(+e.target.value); if (v >= 1) { S.rp.days = Math.min(365, v); rpLoad(); } });
$('#rpSame').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { S.rp.same = b.dataset.v; rpLoad(); } });
$('#rpBranch').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { S.rp.branch = b.dataset.v; rpLoad(); } });
$('#rpType').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { S.rp.type = b.dataset.v; rpLoad(); } });

/* ---- the two watch-lists on the dashboard: repeated merchants and wrong QR scans (admin / supervisor) ---- */
async function dashAlerts() {
  const on = isWide(); show($('#rpCard'), on); show($('#qcCard'), on); if (!on) return;
  api('getRepeats', S.token, S.rp).then(d => {
    S.rpData = d;
    $('#rpDash').innerHTML = [[1, 'Today'], [3, '3 days'], [7, '7 days'], [14, '14 days'], [30, '30 days']].map(([v, l]) => '<button type="button" class="chip' + (d.days === v ? ' active' : '') + '" data-v="' + v + '">' + l + '</button>').join('');
    const k = d.kpi;
    $('#rpSum').innerHTML = k.groups ? '<b style="color:#b45309">' + k.groups + '</b> merchant' + (k.groups > 1 ? 's' : '') + ' repeated · <b>' + k.extra + '</b> extra record' + (k.extra > 1 ? 's' : '') + (k.staff ? ' · <b style="color:#dc2626">' + k.staff + '</b> by different staff' : '') : '<span class="up fw-semibold">No repeated records</span> <span class="text-muted">in ' + (d.days === 1 ? 'today' : 'the last ' + d.days + ' days') + '</span>';
    $('#rpTop').innerHTML = d.groups.slice(0, 5).map(g => '<div class="tm-row"><div class="nm"><b>' + esc(g.merchant || g.id) + '</b><div class="small text-muted">' + esc(shortName(g.type)) + (g.activity ? ' · ' + esc(g.activity) : ' · any activity') + ' · ' + esc(g.users > 1 ? 'different staff' : (g.recs[0] || {}).user || '') + '</div></div><span class="n">× ' + g.count + '</span></div>').join('');
  }).catch(e => { $('#rpSum').textContent = e.message; $('#rpTop').innerHTML = ''; });
  api('getQrLive', S.token, { range: 'today' }).then(d => {
    const w = d.kpi.wrong, ss = d.sessions || [];
    $('#qcSum').innerHTML = w ? '<b style="color:#dc2626">' + w + '</b> wrong scan' + (w > 1 ? 's' : '') + ' in <b>' + ss.length + '</b> installation' + (ss.length > 1 ? 's' : '') + ' · ' + d.kpi.total + ' QR installation' + (d.kpi.total > 1 ? 's' : '') + ' scanned today' : '<span class="up fw-semibold">No wrong scans today</span> <span class="text-muted">· ' + d.kpi.total + ' QR installation' + (d.kpi.total === 1 ? '' : 's') + ' scanned</span>';
    $('#qcTop').innerHTML = ss.slice(0, 5).map(s => '<div class="tm-row"><div class="nm"><b>' + esc(s.name) + '</b>' + (s.branch ? ' <span class="text-muted">· ' + esc(s.branch) + '</span>' : '') + '<div class="small text-muted">' + esc(s.merchant || '') + ' ' + esc(s.mid || '') + (s.wrongs[0] ? ' → scanned ' + esc(s.wrongs[0].mid) : '') + '</div></div><span class="n" style="color:#dc2626">' + s.wrong + '</span></div>').join('');
  }).catch(e => { $('#qcSum').textContent = e.message; $('#qcTop').innerHTML = ''; });
}
$('#rpDash').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { S.rp.days = +b.dataset.v; dashAlerts(); } });
$('#rpAll').addEventListener('click', () => $('#rpBtn').click());
$('#qcAll').addEventListener('click', () => $('#qcLiveBtn').click());

/* ============================ Telegram icons and titles (admin) ============================ */
const EMOJIS = '✅ ❌ ⚠️ ❗ ✔️ 🔹 🔸 🟢 🔴 🟡 🔵 ⭐ 💡 🔥 📌 📍 📞 📱 🏪 🏬 🧾 🆔 🪪 🔢 🔗 📶 🪧 🔑 🔁 🆕 🏷 📝 📦 🕘 ⏰ 👥 👤 🧭 🏢 🏠 🏘 📅 🔖 🕒 🛠 🔧 🗂 📋 💰 💳 🖨 🔋 🔌 📷 🚚 🎁 🔝 🅰️ 🅱️'.split(' ');
const emojiPal = document.createElement('div'); emojiPal.id = 'emojiPal'; emojiPal.className = 'hidden';
emojiPal.innerHTML = EMOJIS.map(x => '<button type="button">' + x + '</button>').join('') + '<button type="button" class="clr">Clear</button>';
document.body.appendChild(emojiPal);
let emojiTarget = null;
document.addEventListener('focusin', e => {
  const i = e.target.closest && e.target.closest('.ic-in'); if (!i) return;
  emojiTarget = i; const r = i.getBoundingClientRect(), w = Math.min(320, window.innerWidth - 16);
  emojiPal.style.width = w + 'px'; emojiPal.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  emojiPal.style.top = Math.min(r.bottom + 4, window.innerHeight - 190) + 'px'; show(emojiPal, true);
});
document.addEventListener('mousedown', e => { if (!e.target.closest('#emojiPal') && !e.target.closest('.ic-in')) { show(emojiPal, false); emojiTarget = null; } });
emojiPal.addEventListener('mousedown', e => e.preventDefault());
emojiPal.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !emojiTarget) return;
  emojiTarget.value = b.classList.contains('clr') ? '' : b.textContent;
  emojiTarget.dispatchEvent(new Event('input', { bubbles: true })); emojiTarget.dispatchEvent(new Event('change', { bubbles: true }));
  show(emojiPal, false);
});

async function loadLabels() {
  try {
    const r = await api('getTgLabels', S.token);
    const cp = (k, on) => '<button type="button" class="chip lbl-c' + (on ? ' active' : '') + '" title="Telegram copies the value when it is tapped">Copy</button>';
    $('#lblList').innerHTML = r.lines.map(l => '<div class="lbl-row" data-k="' + esc(l.key) + '"><input class="form-control form-control-sm lbl-i ic-in" maxlength="4" value="' + esc(l.icon) + '" data-def="' + esc(l.defIcon) + '">' +
      (l.iconOnly ? '<span class="small flex-grow-1">' + esc(l.label) + '</span>' : '<input class="form-control form-control-sm lbl-l flex-grow-1" maxlength="30" value="' + esc(l.label) + '" data-def="' + esc(l.defLabel) + '">') + (l.canCopy ? cp(l.key, l.copy) : '') + '</div>').join('') +
      ((r.fields || []).length ? '<div class="small fw-semibold mt-3 mb-1">Added fields <span class="text-muted fw-normal">(show the value as tap to copy)</span></div>' + r.fields.map(f => '<div class="lbl-row lbl-fld" data-k="' + esc(f.key) + '"><span class="small flex-grow-1">' + esc(f.label) + '</span>' + cp(f.key, f.copy) + '</div>').join('') : '');
  } catch (e) { $('#lblMsg').textContent = e.message; show($('#lblMsg'), true); }
}
$('#lblList').addEventListener('click', e => { const b = e.target.closest('.lbl-c'); if (b) b.classList.toggle('active'); });
$('#lblSave').addEventListener('click', async () => {
  const map = {}; $$('#lblList .lbl-row').forEach(r => { const i = $('.lbl-i', r), l = $('.lbl-l', r), c = $('.lbl-c', r); map[r.dataset.k] = { i: i ? i.value.trim() : '', l: l ? l.value.trim() : '', c: !!(c && c.classList.contains('active')) }; });
  busy($('#lblSave'), true, 'Saving…');
  try { await api('saveTgLabels', S.token, map); toast('Telegram icons, titles and copy values saved.', 'success'); await loadLabels(); tplPreview(); } catch (e) { toast(e.message, 'danger'); }
  busy($('#lblSave'), false);
});
$('#lblReset').addEventListener('click', async () => {
  if (!confirm('Go back to the built-in icons and titles?')) return;
  try { await api('saveTgLabels', S.token, {}); toast('Back to the built-in icons and titles.', 'success'); await loadLabels(); tplPreview(); } catch (e) { toast(e.message, 'danger'); }
});

/* ============================ Desktop mode (admin + supervisor, wide screens) ============================ */
const DESK_MIN = 1100;
S.deskKey = 'records';
const DESK_TITLES = { new: 'New record', records: 'Records & dashboard', review: 'Records & dashboard', stock: 'Stock', staff: 'Staff', cats: 'Categories & activities', tg: 'Telegram', rules: 'Edit rules & record ID' };
const deskItems = () => {
  const admin = S.user && S.user.role === 'Admin';
  return [['WORK'], ['new', 'bi-plus-circle', 'New record'], ['records', 'bi-table', 'Records & dashboard'], admin && ['review', 'bi-patch-check', 'Review queue'], ['stock', 'bi-box-seam', 'Stock'], admin && ['staff', 'bi-people', 'Staff'],
    ['TOOLS'], ['lookup', 'bi-search', 'Merchant history'], ['qr', 'bi-qr-code-scan', 'Live QR check'], ['repeats', 'bi-files', 'Repeated records'], ['stamp', 'bi-geo-alt', 'Stamp settings'],
    admin && ['SETUP'], admin && ['cats', 'bi-diagram-3', 'Categories & activities'], admin && ['tg', 'bi-send', 'Telegram'], admin && ['rules', 'bi-pencil-square', 'Edit rules & record ID']].filter(Boolean);
};
let deskBuilt = false;
function deskBuild() {
  if (!S.user || deskBuilt) return; deskBuilt = true;
  const sec = { catCard: 'cats', rulesCard: 'rules', idCard: 'rules', qkCard: 'rules', tplCard: 'tg', lblCard: 'tg', ccCard: 'tg', tgCard: 'tg' };
  Object.keys(sec).forEach(id => { const el = $('#' + id); if (el) el.dataset.sec = sec[id]; });
  $$('#pane-users > .card-x').forEach(el => { if (!el.dataset.sec) el.dataset.sec = 'staff'; });
  $$('#pane-stock > .card-x').forEach(el => { if (/^\s*(Serial numbers|Returns waiting|Recent movements|Stock items)/i.test(el.textContent)) el.classList.add('span-all'); });
  $('#deskNav').innerHTML = '<div class="dn-brand"><b>MS SR HUB WEB APP</b><span>' + (S.user.role === 'Admin' ? 'Admin console' : 'Supervisor console') + ' · desktop</span></div>' +
    deskItems().map(it => it.length === 1 ? '<div class="dn-grp">' + it[0] + '</div>' : '<button type="button" class="dn-it" data-k="' + it[0] + '"><i class="bi ' + it[1] + '"></i><span>' + it[2] + '</span>' + (it[0] === 'review' ? '<em class="dn-badge hidden" id="dnBadge">0</em>' : '') + '</button>').join('') +
    '<div class="dn-foot"><div class="small">Signed in as <b>' + esc(S.user.username) + '</b> · ' + esc(S.user.role) + '</div><div class="d-flex gap-2 mt-2"><button type="button" class="dn-mini" data-k="pin" title="Change my PIN"><i class="bi bi-key"></i></button><button type="button" class="dn-mini" data-k="theme" title="Light / dark mode"><i class="bi bi-moon-stars"></i></button><button type="button" class="dn-mini" data-k="out" title="Sign out"><i class="bi bi-box-arrow-right"></i></button></div></div>';
  $('#deskNav').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) deskGo(b.dataset.k); });
  paintPending();
}
function deskGo(k) {
  if (k === 'pin') return $('#whoBtn').click();
  if (k === 'theme') return $('.theme-toggle').click();
  if (k === 'out') return $('#logoutBtn').click();
  if (k === 'lookup') return $('#lkBtn').click();
  if (k === 'qr') return $('#qcLiveBtn').click();
  if (k === 'repeats') return $('#rpBtn').click();
  if (k === 'stamp') return openStampSettings();
  S.deskKey = k;
  if (k === 'new') switchTab('new');
  else if (k === 'records') switchTab('records');
  else if (k === 'review') { switchTab('records'); S.rvStatus = 'Pending'; reviewModal.show(); loadReview(); }
  else if (k === 'stock') switchTab('stock');
  else { switchTab('users'); if (k === 'cats') setTimeout(() => $('#catEditBtn').click(), 80); }
}
/** Marks the sidebar item, the page title and (in Setup) which card is shown. */
function deskPaint(name) {
  document.body.dataset.pane = name;
  if (name === 'new') S.deskKey = 'new'; else if (name === 'records' && S.deskKey !== 'review') S.deskKey = 'records'; else if (name === 'stock') S.deskKey = 'stock'; else if (name === 'users' && !['staff', 'cats', 'tg', 'rules'].includes(S.deskKey)) S.deskKey = 'staff';
  $('#pane-users').dataset.show = ['staff', 'cats', 'tg', 'rules'].includes(S.deskKey) ? S.deskKey : 'staff';
  $('#deskTitle').textContent = DESK_TITLES[S.deskKey] || '';
  $$('#deskNav .dn-it').forEach(b => b.classList.toggle('active', b.dataset.k === S.deskKey));
}
function deskSync() {
  const on = !!(S.user && isWide() && window.innerWidth >= DESK_MIN);
  if (on) deskBuild();
  document.body.classList.toggle('desk', on);
  show($('#deskNav'), on);
  if (on) { const pane = ['new', 'records', 'stock', 'users'].find(t => !$('#pane-' + t).classList.contains('hidden')) || 'records'; deskPaint(pane); }
}
window.addEventListener('resize', deskSync);
