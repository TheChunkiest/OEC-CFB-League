// Shared data layer + league math for the OEC CFB League Hub.
import { firebaseConfig } from './firebase-config.js';
import { lookupColor } from './teamcolors.js';

export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const START_CREDITS = 1000;
export const PHASES = { PRE: 'Offseason', REG: 'Regular Season', CCG: 'Conference Championship', POST: 'Postseason' };

export const DEMO = !firebaseConfig || !firebaseConfig.apiKey || /PASTE|YOUR/i.test(firebaseConfig.apiKey);
const FBV = '10.12.2';
let fb = null;

export const D = { league: {}, recruiting: { class: '', rows: [] }, teams: [], games: [], users: [], wagers: [], gotw: [], history: [], ballots: [], invites: [] };
const COLS = ['teams', 'games', 'users', 'wagers', 'gotw', 'history', 'invites'];

export function defaultLeague() {
  return {
    name: 'OEC CFB League Hub', conference: 'MAC', season: 2026, week: 0, phase: PHASES.PRE, finalWeek: 14,
    bettingOpen: false, desk: { show: false, text: '' }, awards: { open: false, season: 2026, categories: [] },
    rules: [], links: [], firstSeason: 2026
  };
}

/* ---------------- Store ---------------- */
async function fbInit() {
  if (fb) return fb;
  const base = `https://www.gstatic.com/firebasejs/${FBV}/`;
  const [app, au, fs] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
  const a = app.initializeApp(firebaseConfig);
  fb = { au, fs, auth: au.getAuth(a), db: fs.getFirestore(a) };
  return fb;
}

let demoLoaded = false;
export async function loadAll() {
  clearCache();
  if (DEMO) {
    if (!demoLoaded) {
      const saved = sessionStorage.getItem('oecDemo');
      Object.assign(D, saved ? JSON.parse(saved) : await (await fetch('demo.json?v=' + Date.now())).json());
      if (!D.invites) D.invites = [];
      demoLoaded = true;
    }
    return D;
  }
  const { fs, db } = await fbInit();
  const [lg, rc, ...rest] = await Promise.all([
    fs.getDoc(fs.doc(db, 'meta', 'league')), fs.getDoc(fs.doc(db, 'meta', 'recruiting')),
    ...COLS.map(c => fs.getDocs(fs.collection(db, c)))
  ]);
  D.league = Object.assign(defaultLeague(), lg.exists() ? lg.data() : {});
  D.recruiting = rc.exists() ? rc.data() : { class: '', rows: [] };
  COLS.forEach((c, i) => D[c] = rest[i].docs.map(d => ({ ...d.data(), id: d.id })));
  return D;
}

function demoSave() { try { sessionStorage.setItem('oecDemo', JSON.stringify(D)); } catch (e) { /* ignore */ } }
function demoApply(op) {
  if (op.col === 'meta') {
    if (op.op === 'del') { D[op.id] = {}; return; }
    if (op.merge === false) { D[op.id] = op.data; return; }
    // Mirror Firestore's merge: nested maps (e.g. polls) are merged, not replaced.
    const cur = { ...(D[op.id] || {}) };
    for (const [k, v] of Object.entries(op.data)) {
      const isMap = x => x && typeof x === 'object' && !Array.isArray(x);
      cur[k] = isMap(v) && isMap(cur[k]) ? { ...cur[k], ...v } : v;
    }
    D[op.id] = cur; return;
  }
  const arr = D[op.col] || (D[op.col] = []);
  const i = arr.findIndex(x => x.id === op.id);
  if (op.op === 'del') { if (i >= 0) arr.splice(i, 1); return; }
  const v = op.merge === false || i < 0 ? { ...op.data, id: op.id } : { ...arr[i], ...op.data, id: op.id };
  if (i >= 0) arr[i] = v; else arr.push(v);
}
const strip = o => { const c = { ...o }; delete c.id; return c; };

export async function put(col, id, data, merge = true) { return batch([{ op: 'set', col, id, data, merge }]); }
export async function del(col, id) { return batch([{ op: 'del', col, id }]); }
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export async function batch(ops) {
  if (!ops.length) return;
  if (DEMO) { ops.forEach(demoApply); demoSave(); clearCache(); return; }
  const { fs, db } = await fbInit();
  for (let i = 0; i < ops.length; i += 400) {
    const b = fs.writeBatch(db);
    ops.slice(i, i + 400).forEach(o => {
      const ref = fs.doc(db, o.col, o.id);
      if (o.op === 'del') b.delete(ref); else b.set(ref, strip(o.data), { merge: o.merge !== false });
    });
    await b.commit();
  }
  ops.forEach(demoApply); clearCache();
}

export async function refreshLive() {
  if (DEMO) return D.league.live;
  try { const { fs, db } = await fbInit(); const s = await fs.getDoc(fs.doc(db, 'meta', 'league')); if (s.exists()) D.league.live = s.data().live || null; } catch (e) { /* ignore */ }
  return D.league.live;
}
export async function refreshWagers() {
  if (DEMO) return D.wagers;
  try { const { fs, db } = await fbInit(); const s = await fs.getDocs(fs.collection(db, 'wagers')); D.wagers = s.docs.map(d => ({ ...d.data(), id: d.id })); clearCache(); } catch (e) { /* ignore */ }
  return D.wagers;
}
// Identity of a selection, ignoring line movement (same side of the same market).
export const selKey = l => l.market === 'future' ? 'future|' + l.pick : l.market === 'wins' ? `wins|${l.team}|${l.pick}` : `${l.market}|${l.gameId}|${l.pick}`;
export async function loadBallots(all) {
  if (DEMO) return D.ballots;
  const { fs, db } = await fbInit();
  if (all) { const s = await fs.getDocs(fs.collection(db, 'ballots')); D.ballots = s.docs.map(d => ({ ...d.data(), id: d.id })); return D.ballots; }
  if (!auth.user) return [];
  try {
    const s = await fs.getDoc(fs.doc(db, 'ballots', D.league.season + '_' + auth.user.uid));
    D.ballots = s.exists() ? [{ ...s.data(), id: s.id }] : [];
  } catch (e) { D.ballots = []; }
  return D.ballots;
}

/* ---------------- Auth ---------------- */
export const auth = { user: null, profile: null, ready: false };
export const isCommish = () => auth.profile?.role === 'commish';
export const myTeam = () => auth.profile?.teamId ? team(auth.profile.teamId) : null;

function setProfile() { auth.profile = auth.user ? (D.users.find(u => u.id === auth.user.uid) || null) : null; }
export async function watchAuth(cb) {
  if (DEMO) {
    const uid = localStorage.getItem('oecDemoUid');
    auth.user = uid ? { uid, email: 'demo@example.com' } : null; setProfile(); auth.ready = true; cb(auth); return;
  }
  const { au, auth: A } = await fbInit();
  au.onAuthStateChanged(A, async u => { auth.user = u; if (u && !D.users.find(x => x.id === u.uid)) await loadAll(); setProfile(); auth.ready = true; cb(auth); });
}
export async function login(email, pw) {
  if (DEMO) { localStorage.setItem('oecDemoUid', pw === 'coach' ? 'u_coach2' : 'u_commish'); location.reload(); return; }
  const { au, auth: A } = await fbInit(); await au.signInWithEmailAndPassword(A, email, pw);
}
export async function signup(name, email, pw) {
  if (DEMO) return login(email, pw);
  const { au, auth: A } = await fbInit();
  const cred = await au.createUserWithEmailAndPassword(A, email, pw);
  await put('users', cred.user.uid, { name: name.trim(), teamId: '', role: 'coach' }, false);
  await loadAll(); auth.user = cred.user; setProfile();
}
export async function logout() {
  if (DEMO) { localStorage.removeItem('oecDemoUid'); location.reload(); return; }
  const { au, auth: A } = await fbInit(); await au.signOut(A);
}
export async function resetPassword(email) {
  if (DEMO) return;
  const { au, auth: A } = await fbInit(); await au.sendPasswordResetEmail(A, email);
}
export function refreshProfile() { setProfile(); }

/* ---------------- Helpers ---------------- */
export const team = id => D.teams.find(t => t.id === id) || { id, name: id || '?', abbr: id, conf: '', div: '', coach: '', color: '' };
export const teamColor = t => (t && (t.color || lookupColor(t.name))) || '#6b6b6b';
export const isUserTeam = t => !!(t && t.coach && t.coach.trim() && t.coach.trim().toUpperCase() !== 'CPU');
export const leagueTeams = () => D.teams.filter(t => t.conf === D.league.conference);
export const userTeams = () => leagueTeams().filter(isUserTeam);
export const played = g => g.homeScore != null && g.awayScore != null && g.homeScore !== '' && g.awayScore !== '';
export const seasonGames = (s = D.league.season) => D.games.filter(g => g.season === s);
export const isConfGame = g => team(g.home).conf === D.league.conference && team(g.away).conf === D.league.conference;
export const coachOf = (g, side) => g[side + 'Coach'] || team(g[side]).coach || 'CPU';
export const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const fmtOdds = o => o == null ? '–' : (o > 0 ? '+' + o : String(o));
export const fmtLine = l => l == null ? '–' : (l === 0 ? 'PK' : (l > 0 ? '+' + l : String(l)));
export const pctStr = p => p >= 0.995 ? '>99%' : p > 0 && p < 0.005 ? '<1%' : Math.round(p * 100) + '%';
export const seasonNum = (y = D.league.season) => y - (D.league.firstSeason || 2026) + 1;
export const weekLabel = (L = D.league) => L.phase === PHASES.CCG ? 'Conf Champ' : L.phase === PHASES.POST ? 'Postseason' : L.phase === PHASES.PRE ? 'Preseason' : 'Week ' + L.week;
/* ---- Top 25: league.polls = { "2028_10": [{ id, r }, ...] } — the poll in effect entering that week ---- */
export function pollFor(season = D.league.season, week = D.league.week) {
  const P = D.league.polls || {}; let best = null, bw = -Infinity;
  for (const k in P) { const [s, w] = k.split('_').map(Number); if (s === season && w <= week && w > bw) { bw = w; best = P[k]; } }
  const out = {}; (best || []).forEach(x => { if (x && x.id && x.r) out[x.id] = x.r; }); return out;
}
export const rankOf = (id, season, week) => pollFor(season ?? D.league.season, week ?? D.league.week)[id] || null;
export const rankName = (id, season, week) => { const r = rankOf(id, season, week); return (r ? '#' + r + ' ' : '') + team(id).name; };
export function chip(id, opts = {}) {
  const t = team(id), r = opts.rank === false ? null : rankOf(id, opts.season, opts.week);
  return `<a class="chip" href="${esc(opts.href || '#team/' + t.id)}"><i class="sw" style="background:${esc(teamColor(t))}"></i>${r ? `<span class="rk">#${r}</span>` : ''}${esc(opts.abbr ? (t.abbr || t.name) : t.name)}</a>`;
}

/* ---------------- Ratings & lines ---------------- */
const AVG = 27, HFA = 2.5, SIG = 13.5, BASE = 75, SCALE = 0.45, K = 0.13;
const memo = new Map();
export function clearCache() { memo.clear(); }
const cached = (key, fn) => { if (!memo.has(key)) memo.set(key, fn()); return memo.get(key); };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const half = x => { const v = Math.round(x * 2) / 2; return v === 0 ? 0 : v; };
const round5 = x => Math.round(x / 5) * 5;
function Phi(z) { // normal CDF
  const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
function american(p) {
  const q = clamp(p + 0.0225, 0.015, 0.985);
  return q >= 0.5 ? -Math.max(100, round5(100 * q / (1 - q))) : Math.max(100, round5(100 * (1 - q) / q));
}
function baseRating(t) {
  const ovr = +t.ovr || 72;
  return { o: ((+t.off || ovr) - BASE) * SCALE, d: ((+t.def || ovr) - BASE) * SCALE, perf: [], perfT: [] };
}
function expect(H, A, neutral) {
  const hf = neutral ? 0 : HFA;
  return { h: Math.max(3, AVG + H.o - A.d + hf / 2), a: Math.max(3, AVG + A.o - H.d - hf / 2) };
}

// Team strength after replaying every result in `season` with week < upto.
export function ratings(season, upto) {
  return cached(`r|${season}|${upto}`, () => {
    const R = {};
    D.teams.forEach(t => R[t.id] = baseRating(t));
    D.games.filter(g => g.season === season && played(g) && !g.forfeit && g.week < upto).sort((a, b) => a.week - b.week).forEach(g => {
      const H = R[g.home], A = R[g.away]; if (!H || !A) return;
      const e = expect(H, A, g.neutral);
      const eh = clamp(g.homeScore - e.h, -17, 17), ea = clamp(g.awayScore - e.a, -17, 17);
      const mv = (g.homeScore - g.awayScore) - (e.h - e.a);
      H.perf.push({ week: g.week, v: mv }); A.perf.push({ week: g.week, v: -mv });
      const tv = (+g.homeScore + +g.awayScore) - (e.h + e.a); H.perfT.push({ week: g.week, v: tv }); A.perfT.push({ week: g.week, v: tv });
      H.o += K * eh; A.d -= K * eh; A.o += K * ea; H.d -= K * ea;
    });
    return R;
  });
}
// Spread/total payouts ("juice") move off -110 based on the model:
//  1) how far the posted line sits from the model's projected margin/total,
//  2) key numbers (3, 7, 10, 14) where games land more often, so pushes are likelier,
//  3) recent form — teams beating expectations draw "public" money, so their side costs more.
const KEYS = { 3: 0.09, 7: 0.06, 10: 0.04, 14: 0.035 }, SIG_T = 15.5;
const avgLast = (arr, n = 3) => { const a = arr.slice(-n); return a.length ? a.reduce((s, x) => s + x.v, 0) / a.length : 0; };
function juicePair(q) {
  const one = x => { const v = clamp(x + 0.0238, 0.43, 0.6); return v >= 0.5 ? -Math.max(100, round5(100 * v / (1 - v))) : Math.max(100, round5(100 * (1 - v) / v)); };
  return [one(q), one(1 - q)];
}
function spreadCover(m, L) {
  const t = -L; // home must win by more than t
  if (Number.isInteger(t)) {
    let home = 1 - Phi((t + 0.5 - m) / SIG), away = Phi((t - 0.5 - m) / SIG);
    const push0 = 1 - home - away, push = Math.max(push0, KEYS[Math.abs(t)] || 0), k = (1 - push) / (home + away);
    home *= k; away *= k;
    return home / (home + away);
  }
  return 1 - Phi((t - m) / SIG);
}
export function lineFrom(R, g) {
  const H = R[g.home], A = R[g.away]; if (!H || !A) return null;
  const e = expect(H, A, g.neutral), m = e.h - e.a, p = Phi(m / SIG), T = e.h + e.a;
  let spread = half(-m);
  for (const k of [3, 7, 10, 14]) if (Math.abs(Math.abs(m) - k) <= 0.6) { spread = m > 0 ? -k : k; break; }
  if (spread === 0) spread = 0;
  const qh = clamp(spreadCover(m, spread) + clamp(0.004 * (avgLast(H.perf) - avgLast(A.perf)), -0.03, 0.03), 0.3, 0.7);
  const total = half(T);
  const qo = clamp(1 - Phi((total - T) / SIG_T) + clamp(0.004 * (avgLast(H.perfT) + avgLast(A.perfT)) / 2, -0.03, 0.03), 0.3, 0.7);
  const [spreadOddsHome, spreadOddsAway] = juicePair(qh), [overOdds, underOdds] = juicePair(qo);
  return { spread, total, mlHome: american(p), mlAway: american(1 - p), pHome: p, spreadOddsHome, spreadOddsAway, overOdds, underOdds };
}
// Payout for a spread/total pick (older posted lines without juice fields pay -110).
export function juiceOf(l, market, pick) {
  const k = market === 'spread' ? (pick === 'home' ? 'spreadOddsHome' : 'spreadOddsAway') : (pick === 'over' ? 'overOdds' : 'underOdds');
  return l && l[k] != null ? l[k] : -110;
}
// Line shown for a game: frozen line if posted, else projection from the latest results.
// "Now" for the model: every result entered so far this season, including games already finished this week.
export const nowUpto = () => D.league.phase === PHASES.REG ? D.league.week + 1 : 999;
// Ratings used to price a game: for unplayed games in the current season, every result entered so far.
const priceUpto = g => g.season === D.league.season && !played(g) ? Math.max(g.week, nowUpto() === 999 ? g.week : nowUpto()) : g.week;
export function lineOf(g) {
  if (g.lines && g.lines.spread != null) return { ...g.lines, pHome: g.lines.pHome ?? Phi(-g.lines.spread / SIG) };
  return lineFrom(ratings(g.season, priceUpto(g)), g);
}
export function freshLine(g) { const l = lineFrom(ratings(g.season, priceUpto(g)), g); if (l) l.pHome = Math.round(l.pHome * 1000) / 1000; return l; }

/* ---------------- Records & standings ---------------- */
export function records(season, upto = Infinity) {
  return cached(`rec|${season}|${upto}`, () => {
    const rows = {};
    D.teams.forEach(t => rows[t.id] = { id: t.id, w: 0, l: 0, cw: 0, cl: 0, pf: 0, pa: 0, last: [] });
    D.games.filter(g => g.season === season && played(g) && g.week < upto).sort((a, b) => a.week - b.week).forEach(g => {
      const h = rows[g.home], a = rows[g.away]; if (!h || !a) return;
      if (!g.forfeit) { h.pf += +g.homeScore; h.pa += +g.awayScore; a.pf += +g.awayScore; a.pa += +g.homeScore; }
      const hw = +g.homeScore > +g.awayScore, win = hw ? h : a, lose = hw ? a : h;
      win.w++; lose.l++; win.last.push('W'); lose.last.push('L');
      if ((g.type || 'reg') === 'reg' && isConfGame(g)) { win.cw++; lose.cl++; }
    });
    return rows;
  });
}
export const streak = r => { if (!r || !r.last.length) return '–'; const c = r.last[r.last.length - 1]; let n = 0; for (let i = r.last.length - 1; i >= 0 && r.last[i] === c; i--) n++; return c + n; };
export const rec = r => r ? `${r.w}-${r.l}` : '0-0';
const pctOf = (w, l) => (w + l ? w / (w + l) : 0);

// Order a group of team ids by conference record, head-to-head, overall, point diff.
export function orderGroup(ids, season) {
  const R = records(season), h2h = {};
  D.games.filter(g => g.season === season && played(g) && (g.type || 'reg') === 'reg').forEach(g => {
    const w = +g.homeScore > +g.awayScore ? g.home : g.away, l = w === g.home ? g.away : g.home;
    h2h[w + '|' + l] = (h2h[w + '|' + l] || 0) + 1;
  });
  return ids.slice().sort((a, b) => {
    const A = R[a], B = R[b];
    return pctOf(B.cw, B.cl) - pctOf(A.cw, A.cl) || (B.cw - A.cw) || ((h2h[b + '|' + a] || 0) - (h2h[a + '|' + b] || 0)) ||
      pctOf(B.w, B.l) - pctOf(A.w, A.l) || ((B.pf - B.pa) - (A.pf - A.pa));
  });
}
export function divisions() {
  const divs = [...new Set(leagueTeams().map(t => t.div || ''))];
  return divs.length > 1 && divs.every(Boolean) ? divs.sort() : [''];
}

/* ---------------- Clinching scenarios ---------------- */
// Exact enumeration of every remaining regular-season outcome for each division (when there are
// 16 or fewer games left that involve its teams). Tiebreakers follow orderGroup: conference %,
// conference wins, head-to-head, overall %. Point differential can't be predicted, so a tie that
// reaches it counts as "could go either way": not clinched, not eliminated.
// Result per division: { div, k (berths), now: [games this week], teams: [{ id, status, destiny, clinch, elim }] }
// clinch/elim are lists of scenarios; each scenario is a list of { g, homeWon } results this week.
export function clinchScenarios(season = D.league.season) {
  const L = D.league;
  return cached(`clinch|${season}|${L.week}|${L.phase}`, () => {
    if (L.phase !== PHASES.REG || season !== L.season) return [];
    const lt = leagueTeams(), divs = divisions(), K = divs.length > 1 ? 1 : 2;
    const reg = g => g.season === season && (g.type || 'reg') === 'reg';
    return divs.map(d => {
      const ids = lt.filter(t => !d || t.div === d).map(t => t.id), m = ids.length, ix = {};
      ids.forEach((id, i) => ix[id] = i);
      const games = D.games.filter(g => reg(g) && !played(g) && (g.home in ix || g.away in ix)).sort((a, b) => a.week - b.week);
      const now = games.filter(g => g.week <= L.week), later = games.filter(g => g.week > L.week);
      const G = [...now, ...later], n = G.length, k = now.length;
      if (!n || n > 16 || k > 8) return { div: d, k: K, skip: n ? 'early' : 'done', ids };
      // Base records from played regular-season games.
      const cw = new Array(m).fill(0), cl = new Array(m).fill(0), w = new Array(m).fill(0), l = new Array(m).fill(0);
      const h2h = Array.from({ length: m }, () => new Array(m).fill(0));
      const add = (g, homeWon, C, CL, W, Lo, Hh) => {
        const win = homeWon ? g.home : g.away, lose = homeWon ? g.away : g.home, a = ix[win], b = ix[lose];
        if (a != null) W[a]++; if (b != null) Lo[b]++;
        if (isConfGame(g)) { if (a != null) C[a]++; if (b != null) CL[b]++; }
        if (a != null && b != null) Hh[a][b]++;
      };
      D.games.filter(g => reg(g) && played(g)).forEach(g => add(g, +g.homeScore > +g.awayScore, cw, cl, w, l, h2h));
      const N = 1 << n, certain = new Uint32Array(N), possible = new Uint32Array(N);
      for (let o = 0; o < N; o++) {
        const C = cw.slice(), CL = cl.slice(), W = w.slice(), Lo = l.slice(), Hh = h2h.map(r => r.slice());
        for (let i = 0; i < n; i++) add(G[i], !!(o >> i & 1), C, CL, W, Lo, Hh);
        const cmp = (a, b) => pctOf(C[b], CL[b]) - pctOf(C[a], CL[a]) || (C[b] - C[a]) || (Hh[b][a] - Hh[a][b]) || pctOf(W[b], Lo[b]) - pctOf(W[a], Lo[a]);
        let cert = 0, poss = 0;
        for (let t = 0; t < m; t++) {
          let def = 0, may = 0;
          for (let u = 0; u < m; u++) if (u !== t) { const c = cmp(u, t); if (c < 0) def++; if (c <= 0) may++; }
          if (may < K) cert |= 1 << t;
          if (def < K) poss |= 1 << t;
        }
        certain[o] = cert; possible[o] = poss;
      }
      // Fold the later weeks into each full assignment of this week's games.
      const A = 1 << k, certAnd = new Uint32Array(A).fill(0xFFFFFFFF), possOr = new Uint32Array(A);
      for (let o = 0; o < N; o++) { const a = o & (A - 1); certAnd[a] &= certain[o]; possOr[a] |= possible[o]; }
      // All partial assignments of this week's games: digit 0 = open, 1 = home wins, 2 = away wins.
      const P = 3 ** k, pc = new Uint32Array(P), pp = new Uint32Array(P), digits = p => { const r = []; for (let i = 0; i < k; i++) { r.push(p % 3); p = Math.floor(p / 3); } return r; };
      for (let p = 0; p < P; p++) {
        const dg = digits(p); let c = 0xFFFFFFFF, q = 0;
        for (let a = 0; a < A; a++) { if (dg.every((v, i) => !v || (v === 1) === !!(a >> i & 1))) { c &= certAnd[a]; q |= possOr[a]; } }
        pc[p] = c; pp[p] = q;
      }
      const pow3 = i => 3 ** i;
      const minimal = test => {
        const out = [];
        for (let p = 1; p < P; p++) {
          if (!test(p)) continue;
          const dg = digits(p);
          if (dg.some((v, i) => v && test(p - v * pow3(i)))) continue; // a smaller set already does it
          out.push(dg.map((v, i) => v ? { g: now[i], homeWon: v === 1 } : null).filter(Boolean));
        }
        return out.sort((x, y) => x.length - y.length);
      };
      const teams = ids.map((id, t) => {
        const bit = 1 << t, clinched = !!(pc[0] & bit), elim = !(pp[0] & bit);
        // Controls its own destiny: winning every remaining game guarantees the berth.
        let destiny = !clinched && !elim;
        if (destiny) for (let o = 0; o < N && destiny; o++) {
          const winsOut = G.every((g, i) => (g.home !== id && g.away !== id) || (!!(o >> i & 1)) === (g.home === id));
          if (winsOut && !(certain[o] & bit)) destiny = false;
        }
        return {
          id, status: clinched ? 'clinched' : elim ? 'eliminated' : 'alive', destiny,
          clinch: clinched || elim ? [] : minimal(p => !!(pc[p] & bit)),
          elim: clinched || elim ? [] : minimal(p => !(pp[p] & bit)),
        };
      });
      return { div: d, k: K, now, teams };
    });
  });
}

/* ---------------- Season simulation ---------------- */
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// force: { gameId: true (home wins) | false (away wins) } to ask "what if" for one game.
export function simulate(season, upto, n = 1500, force = null) {
  return cached(`sim|${season}|${upto}|${n}|${force ? JSON.stringify(force) : ''}`, () => {
    const R = ratings(season, upto), lt = leagueTeams(), ids = lt.map(t => t.id), conf = new Set(ids);
    const divs = divisions(), byDiv = divs.map(d => lt.filter(t => !d || t.div === d).map(t => t.id));
    const games = D.games.filter(g => g.season === season && (g.type || 'reg') === 'reg' && R[g.home] && R[g.away]);
    const fixed = [], sims = [];
    games.forEach(g => { if (played(g) && g.week < upto) fixed.push(g); else sims.push({ g, p: lineFrom(R, g).pHome }); });
    const gp = {}; ids.forEach(id => gp[id] = 0);
    games.forEach(g => { if (g.home in gp) gp[g.home]++; if (g.away in gp) gp[g.away]++; });
    const out = {}; ids.forEach(id => out[id] = { w: 0, div: 0, ccg: 0, title: 0, dist: new Array(30).fill(0) });
    const rand = rng(season * 1009 + upto * 7 + 13);
    const ccgP = {};
    for (let s = 0; s < n; s++) {
      const W = {}, CW = {}, CL = {}, H = {};
      ids.forEach(id => { W[id] = 0; CW[id] = 0; CL[id] = 0; });
      const apply = (g, homeWon) => {
        const w = homeWon ? g.home : g.away, l = homeWon ? g.away : g.home;
        if (w in W) W[w]++;
        if (conf.has(w) && conf.has(l)) { CW[w]++; CL[l]++; H[w + '|' + l] = (H[w + '|' + l] || 0) + 1; }
      };
      fixed.forEach(g => apply(g, +g.homeScore > +g.awayScore));
      sims.forEach(x => { const r = rand(); apply(x.g, force && x.g.id in force ? force[x.g.id] : r < x.p); });
      const tie = ids.reduce((o, id) => (o[id] = rand(), o), {});
      const order = grp => grp.slice().sort((a, b) => pctOf(CW[b], CL[b]) - pctOf(CW[a], CL[a]) || CW[b] - CW[a] ||
        ((H[b + '|' + a] || 0) - (H[a + '|' + b] || 0)) || W[b] - W[a] || tie[b] - tie[a]);
      let finalists;
      if (byDiv.length > 1) { finalists = byDiv.map(g => order(g)[0]).slice(0, 2); finalists.forEach(id => out[id].div++); }
      else { const o = order(byDiv[0]); out[o[0]].div++; finalists = o.slice(0, 2); }
      if (finalists.length === 2 && finalists[0] && finalists[1]) {
        const k = finalists.join('|');
        if (!(k in ccgP)) ccgP[k] = lineFrom(R, { home: finalists[0], away: finalists[1], neutral: true }).pHome;
        finalists.forEach(id => out[id].ccg++);
        out[rand() < ccgP[k] ? finalists[0] : finalists[1]].title++;
      }
      ids.forEach(id => { out[id].w += W[id]; out[id].dist[W[id]]++; });
    }
    // Override with real CCG result once it's been played.
    const ccg = D.games.find(g => g.season === season && g.type === 'ccg' && played(g) && g.week < upto);
    ids.forEach(id => {
      const o = out[id], mode = o.dist.indexOf(Math.max(...o.dist));
      o.expW = o.w / n; o.gp = gp[id]; o.likely = `${mode}-${gp[id] - mode}`;
      o.divPct = o.div / n; o.ccgPct = o.ccg / n; o.titlePct = o.title / n;
      if (ccg) { const champ = +ccg.homeScore > +ccg.awayScore ? ccg.home : ccg.away; o.titlePct = id === champ ? 1 : 0; }
    });
    return out;
  });
}

// One odds snapshot per week of the current season, for the trend chart.
export function oddsHistory(season = D.league.season) {
  const L = D.league, wk = seasonGames(season).filter(g => (g.type || 'reg') === 'reg').map(g => g.week);
  if (!wk.length) return [];
  const first = Math.min(...wk), last = Math.max(...wk);
  const cur = season === L.season && L.phase === PHASES.REG ? Math.min(L.week, last + 1) : last + 1;
  const pts = [];
  for (let u = first; u <= cur; u++) pts.push({ upto: u, label: u === first ? 'Pre' : u > last ? 'Final' : 'Wk ' + u, sim: simulate(season, u, 800) });
  return pts;
}

/* ---------------- Power rankings ---------------- */
export function lastPlayedWeek(season, before = Infinity) {
  const w = D.games.filter(g => g.season === season && played(g) && g.week < before).map(g => g.week);
  return w.length ? Math.max(...w) : null;
}
export function powerRankings(season, upto) {
  return cached(`pr|${season}|${upto}`, () => {
    const R = ratings(season, upto), recs = records(season, upto);
    return leagueTeams().map(t => {
      const r = R[t.id], last = r.perf.slice(-3), hot = last.length ? last.reduce((s, x) => s + x.v, 0) / last.length : 0;
      const c = recs[t.id], wp = c.w + c.l ? c.w / (c.w + c.l) : 0.5;
      return { id: t.id, net: r.o + r.d, hot, rec: c, score: (r.o + r.d) + 0.3 * hot + 10 * (wp - 0.5) };
    }).sort((a, b) => b.score - a.score).map((x, i) => ({ ...x, rank: i + 1 }));
  });
}
export function currentPower(season = D.league.season) {
  const lw = lastPlayedWeek(season);
  const now = powerRankings(season, lw == null ? -1 : lw + 1);
  const prev = lw == null ? null : powerRankings(season, lw);
  return now.map(x => { const p = prev && prev.find(y => y.id === x.id); return { ...x, move: p ? p.rank - x.rank : 0 }; });
}

/* ---------------- Betting ---------------- */
/* ---- Game of the Week profit boost: +10% profit on single bets on the GOTW and parlays made only of its lines ---- */
export const GOTW_BOOST = 1.1;
const boosted = (p, w) => Math.round(p * (w && w.boost ? w.boost : 1));
// The decided GOTW for the current week (frozen into the league doc at advance; demo falls back to the vote tally).
export function gotwGameId() {
  const L = D.league, G = L.gotw;
  if (G && G.season === L.season && G.week === L.week) return G.gameId || null;
  return DEMO ? (gotwTally(L.season, L.week).game?.id || null) : null;
}
export function boostFor(legs) {
  const id = gotwGameId(); if (!id || !legs.length) return null;
  return legs.every(l => l.gameId === id && ['ml', 'spread', 'total'].includes(l.market)) ? GOTW_BOOST : null;
}
// Profit a bet pays if it wins, including any boost.
export function winProfit(w) { return boosted(w.market === 'parlay' ? parlayProfit(w.stake, w.legs || []) : profit(w.stake, w.odds), w); }
export const profit = (stake, odds) => Math.round(odds > 0 ? stake * odds / 100 : stake * 100 / Math.abs(odds));
export function grade(w, g) {
  const hs = +g.homeScore, as = +g.awayScore;
  let edge;
  if (w.market === 'ml') edge = w.pick === 'home' ? hs - as : as - hs;
  else if (w.market === 'spread') { const m = hs - as + w.line; edge = w.pick === 'home' ? m : -m; }
  else { const t = hs + as - w.line; edge = w.pick === 'over' ? t : -t; }
  return edge > 0 ? 'won' : edge < 0 ? 'lost' : 'push';
}
export function settleOps(gameIds) {
  const ids = new Set(gameIds), ops = [];
  D.wagers.filter(w => w.status === 'open' && ids.has(w.gameId)).forEach(w => {
    const g = D.games.find(x => x.id === w.gameId); if (!g || !played(g)) return;
    const st = g.forfeit ? 'void' : grade(w, g), payout = st === 'won' ? boosted(profit(w.stake, w.odds), w) : st === 'lost' ? -w.stake : 0;
    ops.push({ op: 'set', col: 'wagers', id: w.id, data: { status: st, payout, settledAt: Date.now() } });
  });
  D.wagers.filter(w => w.status === 'open' && w.market === 'wins').forEach(w => {
    const st = winsResult(w, w.season); if (st === 'open') return;
    ops.push({ op: 'set', col: 'wagers', id: w.id, data: { status: st, payout: st === 'won' ? profit(w.stake, w.odds) : -w.stake, settledAt: Date.now() } });
  });
  return ops.concat(parlayOps());
}
/* ---- Parlays: 2-6 legs, one per game. Any loss loses; pushes/voids drop out; pays when all legs are final. ---- */
export const MAX_LEGS = 6;
export const decOf = o => o > 0 ? 1 + o / 100 : 1 + 100 / -o;
export const amerOf = d => d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1));
export const parlayOdds = legs => amerOf(legs.reduce((p, l) => p * decOf(l.odds), 1));
export const parlayProfit = (stake, legs) => Math.round(stake * (legs.reduce((p, l) => p * decOf(l.odds), 1) - 1));
function evalParlay(w) {
  const legs = (w.legs || []).map(l => {
    if (l.market === 'wins') return { ...l, result: winsResult(l, w.season) };
    if (l.market === 'future') {
      const ccg = D.games.find(g => g.season === w.season && g.type === 'ccg' && played(g));
      if (ccg) return { ...l, result: (+ccg.homeScore > +ccg.awayScore ? ccg.home : ccg.away) === l.pick ? 'won' : 'lost' };
      return { ...l, result: D.history.some(h => h.season === w.season) ? 'void' : 'open' };
    }
    const g = D.games.find(x => x.id === l.gameId);
    return { ...l, result: !g ? 'void' : !played(g) ? 'open' : g.forfeit ? 'void' : grade(l, g) };
  });
  let status = 'open', payout = 0;
  if (legs.some(l => l.result === 'lost')) { status = 'lost'; payout = -w.stake; }
  else if (legs.every(l => l.result !== 'open')) {
    const won = legs.filter(l => l.result === 'won');
    if (won.length) { status = 'won'; payout = boosted(parlayProfit(w.stake, won), w); } else status = 'push';
  }
  return { legs, status, payout };
}
/* ---- Cash out: once more than half of a parlay's legs have won (and none lost), the bettor can take the stake back
   plus 75% of what the winning legs alone would have paid, at the odds locked in when the bet was placed.
   Current lines never enter into it, so there is no way to profit from line movement. ---- */
export const CASHOUT_SHARE = 0.75;
export function cashOutValue(w) {
  if (!w || w.market !== 'parlay' || w.status !== 'open') return null;
  const legs = w.legs || [], won = legs.filter(l => l.result === 'won');
  if (legs.some(l => l.result === 'lost') || won.length * 2 <= legs.length || !legs.some(l => !l.result || l.result === 'open')) return null;
  const profit = Math.floor(w.stake * (won.reduce((p, l) => p * decOf(l.odds), 1) - 1) * CASHOUT_SHARE);
  return { profit, total: w.stake + profit, won: won.length, legs: legs.length };
}
export function parlayOps(regrade = false) {
  return D.wagers.filter(w => w.market === 'parlay' && (regrade ? w.status !== 'void' && w.status !== 'cashed' : w.status === 'open')).map(w => {
    const r = evalParlay(w);
    const same = r.status === w.status && r.payout === (w.payout || 0) && r.legs.every((l, i) => l.result === (w.legs[i] || {}).result);
    return same ? null : { op: 'set', col: 'wagers', id: w.id, data: { status: r.status, payout: r.payout, legs: r.legs, ...(r.status !== w.status && r.status !== 'open' ? { settledAt: Date.now() } : {}) } };
  }).filter(Boolean);
}
export function bankroll(uid, season = D.league.season) {
  const b = { balance: START_CREDITS, w: 0, l: 0, p: 0, net: 0, open: 0, risked: 0, n: 0 };
  D.wagers.filter(x => x.uid === uid && x.season === season).forEach(x => {
    b.n++;
    if (x.status === 'open') { b.open += x.stake; b.balance -= x.stake; return; }
    if (x.status === 'void') return;
    b.risked += x.stake; b.net += x.payout || 0; b.balance += x.payout || 0;
    if (x.status === 'won' || x.status === 'cashed') b.w++; else if (x.status === 'lost') b.l++; else b.p++;
  });
  return b;
}
// League-champion futures: odds from the title simulation, with a bookmaker's margin.
export function futuresOdds(p) {
  if (!(p >= 0.004)) return null;
  const q = clamp(p * 1.15 + 0.01, 0.01, 0.97);
  if (q >= 0.5) return -Math.max(100, round5(100 * q / (1 - q)));
  const v = 100 * (1 - q) / q;
  return Math.max(100, v >= 1000 ? Math.round(v / 50) * 50 : v >= 300 ? Math.round(v / 10) * 10 : round5(v));
}
export function futuresPosted() { const L = D.league, F = L.futures; return DEMO || !!(F && F.season === L.season && F.open && F.odds); }
// Post lines for every unplayed game from `week` on (current + future weeks), plus League Champion futures.
export function boardOps(week, season = D.league.season) {
  const L = D.league;
  const ops = D.games.filter(g => g.season === season && g.week >= week && !played(g)).map(g => {
    const l = freshLine(g), data = { lines: l }, h = histPoint(g, l);
    if (h) data.hist = h;
    return { op: 'set', col: 'games', id: g.id, data };
  });
  if (season === L.season && week === L.week && L.phase === PHASES.REG) ops.push({ op: 'set', col: 'meta', id: 'league', data: { futures: futuresSnapshot(), winTotals: winTotalsSnapshot() } });
  return ops;
}
/* ---------- Kickoff times ---------- */
// Coaches in a user game propose up to 3 time slots; the other coach accepts one (or declines).
// Only this week's and next week's unplayed games can be scheduled. An accepted invite is the kickoff.
export const KICK_SLOTS = 3;
export function kickoffOf(g) {
  const a = (D.invites || []).filter(i => i.gameId === g.id && i.status === 'accepted').sort((x, y) => (y.respondedAt || 0) - (x.respondedAt || 0))[0];
  return a ? a.time : null;
}
export function kickoffInvite(g) { return (D.invites || []).filter(i => i.gameId === g.id && i.status === 'accepted').sort((x, y) => (y.respondedAt || 0) - (x.respondedAt || 0))[0] || null; }
export function canSchedule(g, L = D.league) {
  return !!g && L.phase === PHASES.REG && g.season === L.season && !played(g) && (g.type || 'reg') === 'reg'
    && (g.week === L.week || g.week === L.week + 1) && isUserTeam(team(g.home)) && isUserTeam(team(g.away));
}
export const pendingInvites = g => (D.invites || []).filter(i => i.gameId === g.id && i.status === 'pending').sort((a, b) => b.ts - a.ts);
export function invitesFor(uid) {
  return (D.invites || []).filter(i => i.to === uid && i.status === 'pending' && (() => { const g = D.games.find(x => x.id === i.gameId); return g && canSchedule(g) && !kickoffOf(g); })());
}
export function fmtKick(ts, short = false) {
  const d = new Date(ts), t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (short) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${t}`;
  const tz = (d.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop()) || '';
  return `${fmtAdvance(ts)} · ${t} ${tz}`;
}

/* ---------- Advance clock ---------- */
// Projected next advance: 3 days after the last one, plus any extension (hours) the commissioner added.
export const ADVANCE_DAYS = 3;
export function projectedAdvance(L = D.league) {
  if (!L || !L.advancedAt || (L.phase !== PHASES.REG && L.phase !== PHASES.CCG)) return null;
  return L.advancedAt + ADVANCE_DAYS * 864e5 + (L.advExt || 0) * 36e5;
}
// e.g. "Mon, Nov. 14th" (date only; advances don't happen at a set time).
export function fmtAdvance(ts) {
  const d = new Date(ts), n = d.getDate(), mon = d.toLocaleDateString('en-US', { month: 'short' });
  const ord = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })}, ${mon}${mon === 'May' ? '' : '.'} ${n}${ord}`;
}

/* ---------- Win-chance history (for the game preview chart) ---------- */
// Every re-price appends a point when the home win chance moves; capped so the doc stays small.
function histPoint(g, l) {
  if (!l || l.pHome == null) return null;
  const old = Array.isArray(g.hist) ? g.hist : [], last = old[old.length - 1], p = Math.round(l.pHome * 1000) / 1000;
  if (last && Math.abs(last.p - p) < 0.0005 && last.s === l.spread) return null;
  return [...old, { t: Date.now(), p, s: l.spread, u: priceUpto(g) }].slice(-80);
}
// Points from matchup open to now (or kickoff). Weeks before the first saved point are rebuilt from the
// model as of each week, so every game has a chart even from before tracking started.
export function winHistory(g) {
  const s = g.season, saved = Array.isArray(g.hist) ? g.hist : [];
  const weeks = [...new Set(D.games.filter(x => x.season === s).map(x => x.week))].sort((a, b) => a - b);
  const endU = Math.min(priceUpto(g), saved.length ? saved[0].u : Infinity);
  const pts = [];
  const at = u => { const l = lineFrom(ratings(s, u), g); return l ? { p: l.pHome, s: l.spread } : null; };
  const open = at(weeks[0]);
  if (open) pts.push({ label: 'Open', sub: 'Matchup open (preseason)', ...open });
  weeks.filter(w => w < g.week && w + 1 < endU).forEach(w => { const v = at(w + 1); if (v) pts.push({ label: `Wk ${w}`, sub: `After Week ${w} results`, ...v }); });
  saved.forEach(h => pts.push({ label: fmtShort(h.t), sub: 'Re-priced ' + new Date(h.t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), p: h.p, s: h.s, t: h.t }));
  const cur = lineOf(g);
  if (cur && cur.pHome != null) {
    const last = pts[pts.length - 1], p = Math.round(cur.pHome * 1000) / 1000;
    if (!last || Math.abs(last.p - p) >= 0.0005) pts.push({ label: played(g) ? 'Kickoff' : 'Now', sub: played(g) ? 'Closing line' : 'Current line', p, s: cur.spread });
    else if (last) { last.label = played(g) ? 'Kickoff' : 'Now'; last.sub = (played(g) ? 'Closing line' : 'Current line') + (last.t ? ' · ' + last.sub : ''); }
  }
  return pts;
}
const fmtShort = ts => new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric' });

// Commissioner's browser fills in anything missing from the board (lines for upcoming games, futures odds).
export async function ensureFutures() {
  const L = D.league;
  if (DEMO || !isCommish() || (L.phase !== PHASES.REG && L.phase !== PHASES.CCG)) return false;
  if (L.phase === PHASES.REG && !(L.gotw && L.gotw.season === L.season && L.gotw.week === L.week)) await put('meta', 'league', { gotw: { season: L.season, week: L.week, gameId: gotwTally(L.season, L.week).game?.id || '' } });
  const missingLines = D.games.some(g => g.season === L.season && g.week >= L.week && !played(g) && !(g.lines && g.lines.spread != null && g.lines.spreadOddsHome != null));
  if (!missingLines && (L.phase !== PHASES.REG || (futuresPosted() && winsPosted()))) return false;
  await batch(boardOps(L.week)); return true;
}
export function friendlyError(e) {
  if (e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''))) return 'The league database turned this bet down. Ask the commissioner to check the Firebase rules are up to date and to re-post lines on the Commissioner page (Betting tab).';
  return (e && e.message) || 'Something went wrong.';
}
export function futuresOpen() { const L = D.league; return L.phase === PHASES.REG && L.bettingOpen; }
export function futuresBoard() {
  const L = D.league; if (L.phase !== PHASES.REG) return [];
  const sim = simulate(L.season, nowUpto()), F = L.futures, posted = F && F.season === L.season && F.odds ? F.odds : null;
  return leagueTeams().map(t => ({ id: t.id, p: sim[t.id]?.titlePct || 0, odds: posted ? (posted[t.id] ?? null) : futuresOdds(sim[t.id]?.titlePct || 0), posted: !!posted }))
    .sort((a, b) => b.p - a.p || a.id.localeCompare(b.id));
}
export function futuresSnapshot() {
  const L = D.league, sim = simulate(L.season, nowUpto()), odds = {};
  leagueTeams().forEach(t => odds[t.id] = futuresOdds(sim[t.id]?.titlePct || 0));
  return { season: L.season, week: L.week, open: true, odds };
}
/* ---- Season win totals (regular season wins). Line = the .5 mark closest to a 50/50 split in the simulation. ---- */
const winOdds = p => { const q = clamp(p + 0.0238, 0.03, 0.97); return q >= 0.5 ? -Math.max(100, round5(100 * q / (1 - q))) : Math.max(100, round5(100 * (1 - q) / q)); };
export function regWinsInfo(season, tid) {
  let w = 0, rem = 0;
  D.games.filter(g => g.season === season && (g.type || 'reg') === 'reg' && (g.home === tid || g.away === tid)).forEach(g => {
    if (!played(g)) { rem++; return; }
    if ((+g.homeScore > +g.awayScore ? g.home : g.away) === tid) w++;
  });
  return { w, rem };
}
export function winTotalsSnapshot() {
  const L = D.league, sim = simulate(L.season, nowUpto()), odds = {};
  leagueTeams().forEach(t => {
    const o = sim[t.id], info = regWinsInfo(L.season, t.id);
    if (!o || info.rem < 1) { odds[t.id] = null; return; }
    const n = o.dist.reduce((a, b) => a + b, 0) || 1;
    let best = null;
    for (let k = info.w; k < info.w + info.rem; k++) {
      const p = o.dist.slice(k + 1).reduce((a, b) => a + b, 0) / n;
      if (!best || Math.abs(p - 0.5) < Math.abs(best.p - 0.5)) best = { line: k + 0.5, p };
    }
    odds[t.id] = best.p < 0.07 || best.p > 0.93 ? null : { line: best.line, over: winOdds(best.p), under: winOdds(1 - best.p) };
  });
  return { season: L.season, week: L.week, odds };
}
export function winsPosted() { const L = D.league, W = L.winTotals; return DEMO || !!(W && W.season === L.season && W.odds); }
export function winsBoard() {
  const L = D.league; if (L.phase !== PHASES.REG) return [];
  const sim = simulate(L.season, nowUpto()), W = L.winTotals, posted = W && W.season === L.season && W.odds ? W.odds : null;
  const snap = posted ? null : winTotalsSnapshot().odds;
  return leagueTeams().map(t => ({ id: t.id, proj: sim[t.id]?.expW || 0, ...regWinsInfo(L.season, t.id), o: posted ? (posted[t.id] || null) : snap[t.id] }))
    .sort((a, b) => b.proj - a.proj);
}
// Decided as soon as it's mathematically settled; otherwise at the end of the regular season.
export function winsResult(l, season) {
  const { w, rem } = regWinsInfo(season, l.team);
  const final = season < D.league.season || D.league.phase !== PHASES.REG;
  const over = w > l.line ? true : (w + rem < l.line ? false : (final ? w > l.line : null));
  if (over === null) return 'open';
  return (over === (l.pick === 'over')) ? 'won' : 'lost';
}
export function settleFuturesOps(season, champId) {
  return D.wagers.filter(w => w.market === 'future' && w.season === season && w.status === 'open').map(w => {
    const st = !champId ? 'void' : w.pick === champId ? 'won' : 'lost';
    return { op: 'set', col: 'wagers', id: w.id, data: { status: st, payout: st === 'won' ? profit(w.stake, w.odds) : st === 'lost' ? -w.stake : 0, settledAt: Date.now() } };
  });
}
// When a bet was placed, in the viewer's own time zone (e.g. "Nov 12, 9:41 PM").
export const fmtTime = ts => ts ? new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
// Short label for one parlay leg, using team abbreviations.
const ab = id => team(id).abbr || team(id).name;
export function legLabel(l) {
  if (l.market === 'wins') return `${ab(l.team)} ${l.pick === 'over' ? 'Over' : 'Under'} ${l.line} wins`;
  if (l.market === 'future') return `${ab(l.pick)} to win title`;
  const g = D.games.find(x => x.id === l.gameId) || {}, side = l.pick === 'home' ? g.home : g.away;
  if (l.market === 'ml') return `${ab(side)} ML`;
  if (l.market === 'spread') return `${ab(side)} ${fmtLine(l.pick === 'home' ? l.line : -l.line)}`;
  return `${l.pick === 'over' ? 'Over' : 'Under'} ${l.line} · ${ab(g.away)} @ ${ab(g.home)}`;
}
// Parlay legs as a tap-to-open dropdown. The closed row shows one status icon per leg.
export function legsHtml(w) {
  if (w.market !== 'parlay') return '';
  const legs = w.legs || [];
  const wk = l => l.market === 'future' ? 'Title' : l.market === 'wins' ? 'Season' : 'Wk ' + (D.games.find(x => x.id === l.gameId)?.week ?? '?');
  const ic = r => r === 'won' ? '✅' : r === 'lost' ? '❌' : r === 'push' || r === 'void' ? '➖' : '⏳';
  return `<details class="legs"><summary><span class="lgic">${legs.map(l => ic(l.result)).join('')}</span><span class="lgtx">${legs.length} legs</span></summary>
    <ul>${legs.map(l => `<li><span class="li">${ic(l.result)}</span><span class="lt">${esc(legLabel(l))} <span class="lw">${wk(l)}</span></span><span class="lo">${fmtOdds(l.odds)}</span></li>`).join('')}</ul></details>`;
}
export function wagerLabel(w) {
  if (w.market === 'wins') return `${team(w.team).name} ${w.pick === 'over' ? 'Over' : 'Under'} ${w.line} wins (${fmtOdds(w.odds)})`;
  if (w.market === 'parlay') return `${(w.legs || []).length}-leg parlay (${fmtOdds(w.odds)})`;
  if (w.market === 'future') return `${team(w.pick).name} to win Season ${seasonNum(w.season ?? D.league.season)} title (${fmtOdds(w.odds)})`;
  const g = D.games.find(x => x.id === w.gameId) || {}, side = w.pick === 'home' ? g.home : g.away;
  if (w.market === 'ml') return `${team(side).name} ML ${fmtOdds(w.odds)}`;
  if (w.market === 'spread') return `${team(side).name} ${fmtLine(w.pick === 'home' ? w.line : -w.line)} (${fmtOdds(w.odds)})`;
  return `${w.pick === 'over' ? 'Over' : 'Under'} ${w.line} (${fmtOdds(w.odds)}) — ${team(g.away).abbr || team(g.away).name} @ ${team(g.home).abbr || team(g.home).name}`;
}

/* ---------------- Game of the Week ---------------- */
// The Game of the Week for a week is only decided once voting closes (when the league advances into that week).
export function gotwTally(season, week, { includeOpen = false } = {}) {
  const counts = {};
  if (!includeOpen && season === D.league.season && week > D.league.week) {
    D.gotw.filter(v => v.season === season && v.week === week).forEach(v => counts[v.gameId] = (counts[v.gameId] || 0) + 1);
    return { game: null, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
  }
  D.gotw.filter(v => v.season === season && v.week === week).forEach(v => counts[v.gameId] = (counts[v.gameId] || 0) + 1);
  const games = D.games.filter(g => g.season === season && g.week === week && counts[g.id]);
  if (!games.length) return { game: null, counts, total: 0 };
  games.sort((a, b) => counts[b.id] - counts[a.id] || Math.abs(lineOf(a)?.spread ?? 99) - Math.abs(lineOf(b)?.spread ?? 99));
  return { game: games[0], counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

/* ---------------- Coaches ---------------- */
export function coachStats() {
  const C = {};
  const get = n => C[n] || (C[n] = { name: n, w: 0, l: 0, pf: 0, pa: 0, titles: 0, seasons: new Set(), vs: {} });
  D.games.filter(played).forEach(g => {
    const hc = coachOf(g, 'home'), ac = coachOf(g, 'away');
    const hw = +g.homeScore > +g.awayScore;
    [[hc, ac, hw, +g.homeScore, +g.awayScore, g.home], [ac, hc, !hw, +g.awayScore, +g.homeScore, g.away]].forEach(([me, op, won, f, a]) => {
      if (!me || me.toUpperCase() === 'CPU') return;
      const c = get(me); c.seasons.add(g.season); if (!g.forfeit) { c.pf += f; c.pa += a; } won ? c.w++ : c.l++;
      if (op && op.toUpperCase() !== 'CPU') { const v = c.vs[op] || (c.vs[op] = { w: 0, l: 0 }); won ? v.w++ : v.l++; }
    });
  });
  D.history.forEach(h => { if (h.champCoach && h.champCoach.toUpperCase() !== 'CPU') { const c = get(h.champCoach); c.titles++; c.seasons.add(h.season); } if (h.runnerCoach && h.runnerCoach.toUpperCase() !== 'CPU') get(h.runnerCoach).seasons.add(h.season); });
  return C;
}

// One coach's career, season by season (from the coach recorded on each game, so team changes are tracked).
export function coachSeasons(name) {
  const key = String(name || '').toLowerCase(), by = {};
  D.games.filter(played).forEach(g => ['home', 'away'].forEach(side => {
    if (String(coachOf(g, side)).toLowerCase() !== key) return;
    const tid = g[side], op = side === 'home' ? 'away' : 'home', won = side === 'home' ? +g.homeScore > +g.awayScore : +g.awayScore > +g.homeScore;
    const s = by[g.season] || (by[g.season] = { season: g.season, teams: {}, w: 0, l: 0, pf: 0, pa: 0, gp: 0, uw: 0, ul: 0, ccg: null });
    s.teams[tid] = (s.teams[tid] || 0) + 1; won ? s.w++ : s.l++;
    if (!g.forfeit) { s.pf += +g[side + 'Score']; s.pa += +g[op + 'Score']; s.gp++; }
    const oc = coachOf(g, op); if (oc && oc.toUpperCase() !== 'CPU') won ? s.uw++ : s.ul++;
    if (g.type === 'ccg') s.ccg = { g, won };
  }));
  D.history.forEach(h => {
    const role = String(h.champCoach || '').toLowerCase() === key ? 'champ' : String(h.runnerCoach || '').toLowerCase() === key ? 'runner' : null;
    if (!role) return;
    const s = by[h.season] || (by[h.season] = { season: h.season, teams: {}, w: 0, l: 0, pf: 0, pa: 0, gp: 0, uw: 0, ul: 0, ccg: null });
    s.finish = role; const tid = role === 'champ' ? h.champTeam : h.runnerTeam; if (tid && !Object.keys(s.teams).length) s.teams[tid] = 1;
  });
  return Object.values(by).map(s => {
    const teams = Object.entries(s.teams).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const finish = s.finish || (s.ccg ? (s.ccg.won ? 'champ' : 'runner') : null);
    return { ...s, teams, team: teams[0] || '', finish };
  }).sort((a, b) => a.season - b.season);
}
// Final placement of every coach in a season: champion 1st, runner-up 2nd, then everyone else by regular-season
// win %, wins, head-to-head between the two coaches, then point differential. Works for the current season too (live order).
export function seasonPlaces(season) {
  return cached(`places|${season}|${D.games.filter(g => g.season === season && played(g)).length}|${D.history.length}`, () => {
    const by = {}, h2h = {}, h = D.history.find(x => x.season === season), ccg = D.games.find(g => g.season === season && g.type === 'ccg' && played(g));
    const key = n => String(n || '').toLowerCase(), cpu = n => !n || String(n).toUpperCase() === 'CPU';
    D.games.filter(g => g.season === season && played(g) && (g.type || 'reg') === 'reg').forEach(g => {
      const hc = coachOf(g, 'home'), ac = coachOf(g, 'away'), hw = +g.homeScore > +g.awayScore;
      [[hc, ac, hw, +g.homeScore - +g.awayScore], [ac, hc, !hw, +g.awayScore - +g.homeScore]].forEach(([me, op, won, diff]) => {
        if (cpu(me)) return;
        const r = by[key(me)] || (by[key(me)] = { name: me, w: 0, l: 0, pd: 0 }); won ? r.w++ : r.l++; if (!g.forfeit) r.pd += diff;
        if (!cpu(op) && won) h2h[key(me) + '|' + key(op)] = (h2h[key(me) + '|' + key(op)] || 0) + 1;
      });
    });
    let champ = h && h.champCoach, runner = h && h.runnerCoach;
    if (!champ && ccg) { const hw = +ccg.homeScore > +ccg.awayScore; champ = coachOf(ccg, hw ? 'home' : 'away'); runner = coachOf(ccg, hw ? 'away' : 'home'); }
    const pct = r => r.w + r.l ? r.w / (r.w + r.l) : 0, top = x => key(x.name) === key(champ) ? 0 : key(x.name) === key(runner) ? 1 : 2;
    const list = Object.values(by).sort((a, b) => top(a) - top(b) || pct(b) - pct(a) || b.w - a.w || ((h2h[key(b.name) + '|' + key(a.name)] || 0) - (h2h[key(a.name) + '|' + key(b.name)] || 0)) || b.pd - a.pd);
    const out = {}; list.forEach((r, i) => out[key(r.name)] = i + 1);
    return { places: out, n: list.length, final: !!(h || ccg) };
  });
}
export const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
// Coaching stops: consecutive seasons at the same team merged, e.g. UAB 2026 → Purdue 2027–2028.
export function coachStops(seasons) {
  const out = [];
  seasons.forEach(s => s.teams.forEach(t => { const last = out[out.length - 1]; if (last && last.team === t && last.to === s.season - 1) last.to = s.season; else if (!(last && last.team === t && last.to === s.season)) out.push({ team: t, from: s.season, to: s.season }); }));
  return out;
}
// Link a Game of the Year award to the stored game: an explicit gameId wins; otherwise read the text
// ("2026 MAC Championship", "ECU @ APP", "Clay @ Chunky") and only link when exactly one game matches.
export function awardGame(h, a) {
  if (!a) return null;
  if (a.gameId) return D.games.find(g => g.id === a.gameId) || null;
  if (!/game of the year/i.test(a.award || '')) return null;
  const txt = String(a.winner || ''), sg = D.games.filter(g => g.season === h.season && played(g));
  if (/championship|title game|\bccg\b/i.test(txt)) return sg.find(g => g.type === 'ccg') || null;
  const m = txt.replace(/^\s*\d{4}\s+/, '').split(/\s+(?:@|at|vs\.?|v\.?)\s+/i); if (m.length !== 2) return null;
  const norm = x => x.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const tm = x => { const n = norm(x); return D.teams.find(t => norm(t.abbr || '') === n || norm(t.name) === n || t.id === slug(x)); };
  const A = tm(m[0]), B = tm(m[1]);
  let hits = A && B ? sg.filter(g => g.away === A.id && g.home === B.id) : [];
  if (!hits.length && A && B) hits = sg.filter(g => (g.away === B.id && g.home === A.id));
  if (!hits.length) { const ca = norm(m[0]), cb = norm(m[1]); hits = sg.filter(g => norm(coachOf(g, 'away')) === ca && norm(coachOf(g, 'home')) === cb); }
  return hits.length === 1 ? hits[0] : null;
}

/* ---------------- Storylines ---------------- */
export function storylines() {
  const L = D.league, s = L.season, out = [], pool = [];
  const lw = lastPlayedWeek(s);
  const poss = n => /s$/i.test(n) ? n + "'" : n + "'s";
  const name = id => { const t = team(id); return isUserTeam(t) ? `${poss(t.coach)} ${t.name}` : t.name; };
  const nextGames = D.games.filter(g => g.season === s && g.week === L.week && !played(g));
  const upNext = () => {
    const g = gotwTally(s, L.week).game || nextGames.filter(x => isUserTeam(team(x.home)) && isUserTeam(team(x.away))).sort((a, b) => Math.abs(lineOf(a)?.spread ?? 99) - Math.abs(lineOf(b)?.spread ?? 99))[0];
    if (!g) return null;
    const l = lineOf(g), fav = l.spread <= 0 ? g.home : g.away, isG = gotwTally(s, L.week).game === g;
    return { href: '#game/' + g.id, tag: isG ? 'Game of the Week' : 'Up Next', title: `Week ${L.week}: ${team(g.away).name} at ${team(g.home).name}`, body: `${name(g.away)} visits ${name(g.home)}. ${l.spread === 0 ? "Pick'em" : `${team(fav).name} ${fmtLine(-Math.abs(l.spread))}`}, total ${l.total}.` };
  };
  if (lw == null) {
    const sim = simulate(s, L.week);
    Object.entries(sim).sort((a, b) => b[1].titlePct - a[1].titlePct).slice(0, 2).forEach(([id, o], i) => out.push({ href: '#odds/' + id, tag: i ? 'Contender' : 'Preseason', title: `${team(id).name} ${i ? 'is right behind' : 'enters as the title favorite'}`, body: `The model gives ${name(id)} a ${pctStr(o.titlePct)} shot at the league title (most likely record ${o.likely}).` }));
    const u = upNext(); if (u) out.push(u);
    return shuffle(out.slice(0, 5), rng(s * 97 + L.week * 13 + 7));
  }
  const wk = D.games.filter(g => g.season === s && g.week === lw && played(g));
  const real = wk.filter(g => !g.forfeit);
  const R = ratings(s, lw);
  const lineAt = g => (g.lines && g.lines.spread != null) ? lineOf(g) : lineFrom(R, g);
  const wkIds = new Set(wk.map(g => g.id));

  // 1) Bad Beat of the Week — the closest losing bet on last week's games.
  const miss = l => {
    const g = D.games.find(x => x.id === l.gameId); if (!g || !played(g) || g.forfeit) return null;
    const hs = +g.homeScore, as = +g.awayScore;
    if (l.market === 'spread') { const v = hs - as + l.line; return Math.abs(v); }
    if (l.market === 'total') return Math.abs(hs + as - l.line);
    if (l.market === 'ml') return Math.abs(hs - as);
    return null;
  };
  const beats = [];
  D.wagers.filter(w => w.season === s && w.status === 'lost').forEach(w => {
    if (w.market === 'parlay') {
      const lost = (w.legs || []).filter(l => l.result === 'lost');
      if (lost.length !== 1 || !wkIds.has(lost[0].gameId) || (w.legs || []).length < 2) return;
      const m = miss(lost[0]); if (m == null) return;
      beats.push({ w, m, leg: lost[0], missed: boosted(parlayProfit(w.stake, (w.legs || []).filter(l => l.result !== 'push' && l.result !== 'void')), w) });
    } else if (wkIds.has(w.gameId)) {
      const m = miss(w); if (m == null) return;
      beats.push({ w, m, leg: w, missed: boosted(profit(w.stake, w.odds), w) });
    }
  });
  beats.sort((a, b) => a.m - b.m || b.missed - a.missed);
  if (beats.length) {
    const b = beats[0], g = D.games.find(x => x.id === b.leg.gameId), sc = `${team(g.away).abbr || team(g.away).name} ${g.awayScore}, ${team(g.home).abbr || team(g.home).name} ${g.homeScore}`;
    const by = b.leg.market === 'ml' ? `lost by ${b.m}` : `missed by ${b.m}`;
    out.push({ href: '#game/' + g.id, tag: 'Bad Beat of the Week', title: b.w.market === 'parlay' ? `${poss(b.w.coach)} ${b.w.legs.length}-leg parlay dies on the last leg` : `${b.w.coach} gets burned by ${b.m} point${b.m === 1 ? '' : 's'}`,
      body: b.w.market === 'parlay'
        ? `Every other leg hit, but ${wagerLabel(b.leg)} ${by} (${sc}). That ${fmtOdds(b.w.odds)} ticket would have paid ${b.missed.toLocaleString()} Crackers.`
        : `${wagerLabel(b.leg)} ${by} (${sc}). It would have paid ${b.missed.toLocaleString()} Crackers.` });
  }

  // 2) Worth Noting — something rare or happening for the first time.
  const notes = [];
  const prior = D.games.filter(g => played(g) && !g.forfeit && (g.season < s || (g.season === s && g.week < lw)));
  if (prior.length >= 10) {
    const maxTot = Math.max(...prior.map(g => +g.homeScore + +g.awayScore)), maxMar = Math.max(...prior.map(g => Math.abs(g.homeScore - g.awayScore)));
    const maxPts = Math.max(...prior.map(g => Math.max(+g.homeScore, +g.awayScore)));
    real.forEach(g => {
      const tot = +g.homeScore + +g.awayScore, mar = Math.abs(g.homeScore - g.awayScore), hw = +g.homeScore > +g.awayScore, w = hw ? g.home : g.away, top = Math.max(+g.homeScore, +g.awayScore);
      if (tot > maxTot) notes.push({ href: '#game/' + g.id, p: 100, title: 'Highest-scoring game in league history', body: `${team(g.away).name} ${g.awayScore}, ${team(g.home).name} ${g.homeScore}. Those ${tot} combined points top the old record of ${maxTot}.` });
      if (top > maxPts) notes.push({ href: '#game/' + g.id, p: 98, title: `${team(w).name} sets the league scoring record`, body: `${name(w)} hung ${top} points, the most by any team in league history (old mark: ${maxPts}).` });
      if (mar > maxMar) notes.push({ href: '#game/' + g.id, p: 96, title: 'Largest margin of victory in league history', body: `${name(w)} won by ${mar}, beating the old record of ${maxMar}.` });
      if (Math.min(+g.homeScore, +g.awayScore) === 0 && !prior.some(x => Math.min(+x.homeScore, +x.awayScore) === 0)) notes.push({ href: '#game/' + g.id, p: 94, title: 'First shutout in league history', body: `${name(w)} held ${team(hw ? g.away : g.home).name} scoreless, ${top}-0.` });
    });
  }
  // First-ever win for one coach over another.
  wk.forEach(g => {
    const hw = +g.homeScore > +g.awayScore, wc = coachOf(g, hw ? 'home' : 'away'), lc = coachOf(g, hw ? 'away' : 'home');
    if (!wc || !lc || wc === 'CPU' || lc === 'CPU') return;
    const meet = D.games.filter(x => played(x) && x !== g && (x.season < s || (x.season === s && x.week < lw)) && [coachOf(x, 'home'), coachOf(x, 'away')].sort().join('|') === [wc, lc].sort().join('|'));
    const wins = meet.filter(x => coachOf(x, +x.homeScore > +x.awayScore ? 'home' : 'away') === wc).length;
    if (meet.length >= 1 && wins === 0) notes.push({ href: '#game/' + g.id, p: 90 + Math.min(meet.length, 5), title: `${wc} finally beats ${lc}`, body: `${wc} had lost all ${meet.length} previous meeting${meet.length === 1 ? '' : 's'} with ${lc}, across every season. Not anymore.` });
  });
  // First win over a top-5 / ranked team this season, using the in-game Top 25 entered by the commissioner.
  real.forEach(g => {
    const hw = +g.homeScore > +g.awayScore, w = hw ? g.home : g.away, l = hw ? g.away : g.home;
    if (!isUserTeam(team(w))) return;
    const poll = pollFor(s, lw), lr = poll[l], wr = poll[w];
    if (!lr) return;
    const before = D.games.filter(x => x.season === s && played(x) && !x.forfeit && x.week < lw && (x.home === w || x.away === w));
    const vs = cut => before.filter(x => { const o = x.home === w ? x.away : x.home, r = pollFor(s, x.week)[o]; return r && r <= cut; });
    const won = list => list.filter(x => (+x.homeScore > +x.awayScore ? x.home : x.away) === w).length;
    if (lr <= 5 && !(wr && wr <= 5)) {
      const tries = vs(5);
      if (!won(tries)) notes.push({ href: '#game/' + g.id, p: tries.length ? 89 : 84, title: `${poss(team(w).name)} first win over a top-5 team`, body: `${wr ? '#' + wr + ' ' : ''}${name(w)} knocked off #${lr} ${team(l).name}${tries.length ? `, after going 0-${tries.length} against top-5 teams earlier this season` : ' for the first time this season'}.` });
    } else if (!wr) {
      const tries = vs(25);
      if (!won(tries)) notes.push({ href: '#game/' + g.id, p: tries.length ? 80 : 76, title: `${poss(team(w).name)} first win over a ranked team`, body: `Unranked ${name(w)} took down #${lr} ${team(l).name}${tries.length ? `, after going 0-${tries.length} against ranked teams this season` : ' for its first ranked win of the season'}.` });
    }
  });
  // Long streak snapped / first win of the season.
  const recBefore = records(s, lw), recNow = records(s, lw + 1);
  userTeams().forEach(t => {
    const b = recBefore[t.id], n = recNow[t.id]; if (!b || !n || n.w + n.l === b.w + b.l) return;
    const st = streak(b), justLost = n.l > b.l, justWon = n.w > b.w;
    if (justLost && /^W\d+$/.test(st) && +st.slice(1) >= 4) notes.push({ href: '#team/' + t.id, p: 70 + +st.slice(1), title: `${poss(t.name)} ${st.slice(1)}-game win streak is over`, body: `${t.coach} had won ${st.slice(1)} straight before last week's loss. Now ${rec(n)}.` });
    if (justWon && b.w === 0 && b.l >= 3) notes.push({ href: '#team/' + t.id, p: 72, title: `${t.name} is in the win column`, body: `${t.coach} snaps an 0-${b.l} start with the first win of the season.` });
  });
  // Season-high score.
  const seasonPrior = prior.filter(g => g.season === s);
  if (seasonPrior.length >= 4) {
    const hi = Math.max(...seasonPrior.map(g => Math.max(+g.homeScore, +g.awayScore)));
    real.forEach(g => { const top = Math.max(+g.homeScore, +g.awayScore), w = +g.homeScore > +g.awayScore ? g.home : g.away; if (top > hi) notes.push({ href: '#game/' + g.id, p: 60, title: `Season high: ${top} points`, body: `${name(w)} posted the most points by any team this season (previous high: ${hi}).` }); });
  }
  notes.sort((a, b) => b.p - a.p);
  if (notes.length) out.push({ href: notes[0].href, tag: 'Worth Noting', title: notes[0].title, body: notes[0].body });

  // 3) Upset of the Week.
  const info = real.map(g => { const l = lineAt(g), hw = +g.homeScore > +g.awayScore; return { g, l, w: hw ? g.home : g.away, lo: hw ? g.away : g.home, ws: Math.max(+g.homeScore, +g.awayScore), ls: Math.min(+g.homeScore, +g.awayScore), pw: l ? (hw ? l.pHome : 1 - l.pHome) : 0.5 }; });
  const upset = info.filter(x => x.pw < 0.45).sort((a, b) => a.pw - b.pw)[0];
  if (upset) out.push({ href: '#game/' + upset.g.id, tag: 'Upset of the Week', title: `${rankName(upset.w, s, lw)} stuns ${rankName(upset.lo, s, lw)}`, body: `${name(upset.w)} entered with a ${pctStr(upset.pw)} chance to win (${fmtOdds(upset.w === upset.g.home ? upset.l.mlHome : upset.l.mlAway)}) and won ${upset.ws}-${upset.ls}.` });

  // 4) Big Cash — the biggest winning bet that settled on last week's games.
  const lastWeekOf = w => w.market === 'parlay' ? Math.max(...(w.legs || []).map(l => D.games.find(x => x.id === l.gameId)?.week ?? -1)) : (D.games.find(x => x.id === w.gameId)?.week ?? -1);
  const cash = D.wagers.filter(w => w.season === s && w.status === 'won' && lastWeekOf(w) === lw).sort((a, b) => (b.payout || 0) - (a.payout || 0))[0];
  if (cash) out.push({ href: cash.market === 'parlay' || !cash.gameId ? '#betting' : '#game/' + cash.gameId, tag: 'Big Cash', title: `${cash.coach} cashes for ${(cash.payout || 0).toLocaleString()} Crackers`, body: `${wagerLabel(cash)}${cash.market === 'parlay' ? ' hit every leg' : ' came through'}. ${cash.stake.toLocaleString()} risked, ${(cash.stake + (cash.payout || 0)).toLocaleString()} returned.` });

  // 5) Up Next (always last).
  const u = upNext();

  // Fallbacks so there are always five.
  const before = simulate(s, lw), after = simulate(s, lw + 1);
  const mv = Object.keys(after).map(id => ({ id, d: after[id].titlePct - before[id].titlePct })).filter(x => isUserTeam(team(x.id))).sort((a, b) => b.d - a.d);
  if (mv.length && mv[0].d >= 0.03) pool.push({ href: '#odds/' + mv[0].id, tag: 'Odds Movers', title: `${poss(team(mv[0].id).name)} title odds jump to ${pctStr(after[mv[0].id].titlePct)}`, body: `Up ${Math.round(mv[0].d * 100)} points this week.${mv[mv.length - 1].d <= -0.03 ? ` Biggest drop: ${name(mv[mv.length - 1].id)}, down ${Math.round(-mv[mv.length - 1].d * 100)} to ${pctStr(after[mv[mv.length - 1].id].titlePct)}.` : ''}` });
  notes.slice(1, 3).forEach(n => pool.push({ href: n.href, tag: 'Worth Noting', title: n.title, body: n.body }));
  const recs = records(s);
  const hot = userTeams().map(t => ({ t, st: streak(recs[t.id]) })).filter(x => /^W\d+$/.test(x.st) && +x.st.slice(1) >= 3).sort((a, b) => b.st.slice(1) - a.st.slice(1))[0];
  if (hot) pool.push({ href: '#team/' + hot.t.id, tag: 'Hot Streak', title: `${hot.t.name} has won ${hot.st.slice(1)} straight`, body: `${hot.t.coach} is ${rec(recs[hot.t.id])} and rolling into Week ${L.week}.` });
  const unbeaten = leagueTeams().filter(t => recs[t.id].l === 0 && recs[t.id].w >= 3);
  if (unbeaten.length && unbeaten.length <= 3) pool.push({ href: unbeaten.length === 1 ? '#team/' + unbeaten[0].id : '#standings', tag: 'Unbeaten Watch', title: unbeaten.length === 1 ? `${unbeaten[0].name} is the last unbeaten team` : `${unbeaten.length} teams still unbeaten`, body: unbeaten.map(t => `${name(t.id)} (${rec(recs[t.id])})`).join(', ') + '.' });
  wk.filter(g => isUserTeam(team(g.home)) && isUserTeam(team(g.away))).forEach(g => { const hw = +g.homeScore > +g.awayScore, w = hw ? g.home : g.away, l = hw ? g.away : g.home; pool.push({ href: '#game/' + g.id, tag: 'User Game', title: `${team(w).coach} over ${team(l).coach}`, body: g.forfeit ? `${name(w)} won by forfeit over ${name(l)}.` : `${name(w)} beat ${name(l)} ${Math.max(+g.homeScore, +g.awayScore)}-${Math.min(+g.homeScore, +g.awayScore)} in Week ${lw}.` }); });
  const r = rng(s * 97 + L.week * 13 + 7);
  shuffle(pool, r);
  while (out.length < (u ? 4 : 5) && pool.length) out.push(pool.shift());
  if (u) out.push(u);
  return shuffle(out.slice(0, 5), r);
}
// In-place Fisher-Yates shuffle with a seeded generator (same order all week, new order next week).
function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
