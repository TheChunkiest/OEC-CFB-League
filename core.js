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

export const D = { league: {}, recruiting: { class: '', rows: [] }, teams: [], games: [], users: [], wagers: [], gotw: [], history: [], ballots: [] };
const COLS = ['teams', 'games', 'users', 'wagers', 'gotw', 'history'];

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
  if (op.col === 'meta') { D[op.id] = op.op === 'del' ? {} : (op.merge === false ? op.data : { ...D[op.id], ...op.data }); return; }
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
export function chip(id, opts = {}) {
  const t = team(id);
  return `<a class="chip" href="#team/${esc(t.id)}"><i class="sw" style="background:${esc(teamColor(t))}"></i>${esc(opts.abbr ? (t.abbr || t.name) : t.name)}</a>`;
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
export function lineOf(g) {
  if (g.lines && g.lines.spread != null) return { ...g.lines, pHome: g.lines.pHome ?? Phi(-g.lines.spread / SIG) };
  const cur = g.season === D.league.season ? D.league.week : g.week;
  return lineFrom(ratings(g.season, Math.min(g.week, cur)), g);
}
export function freshLine(g) { const l = lineFrom(ratings(g.season, g.week), g); if (l) l.pHome = Math.round(l.pHome * 1000) / 1000; return l; }

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

/* ---------------- Season simulation ---------------- */
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function simulate(season, upto, n = 1500) {
  return cached(`sim|${season}|${upto}|${n}`, () => {
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
      sims.forEach(x => apply(x.g, rand() < x.p));
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
    const st = g.forfeit ? 'void' : grade(w, g), payout = st === 'won' ? profit(w.stake, w.odds) : st === 'lost' ? -w.stake : 0;
    ops.push({ op: 'set', col: 'wagers', id: w.id, data: { status: st, payout } });
  });
  return ops;
}
export function bankroll(uid, season = D.league.season) {
  const b = { balance: START_CREDITS, w: 0, l: 0, p: 0, net: 0, open: 0, risked: 0, n: 0 };
  D.wagers.filter(x => x.uid === uid && x.season === season).forEach(x => {
    b.n++;
    if (x.status === 'open') { b.open += x.stake; b.balance -= x.stake; return; }
    if (x.status === 'void') return;
    b.risked += x.stake; b.net += x.payout || 0; b.balance += x.payout || 0;
    if (x.status === 'won') b.w++; else if (x.status === 'lost') b.l++; else b.p++;
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
  const ops = D.games.filter(g => g.season === season && g.week >= week && !played(g)).map(g => ({ op: 'set', col: 'games', id: g.id, data: { lines: freshLine(g) } }));
  if (season === L.season && week === L.week && L.phase === PHASES.REG) ops.push({ op: 'set', col: 'meta', id: 'league', data: { futures: futuresSnapshot() } });
  return ops;
}
// Commissioner's browser fills in anything missing from the board (lines for upcoming games, futures odds).
export async function ensureFutures() {
  const L = D.league;
  if (DEMO || !isCommish() || (L.phase !== PHASES.REG && L.phase !== PHASES.CCG)) return false;
  const missingLines = D.games.some(g => g.season === L.season && g.week >= L.week && !played(g) && !(g.lines && g.lines.spread != null && g.lines.spreadOddsHome != null));
  if (!missingLines && (L.phase !== PHASES.REG || futuresPosted())) return false;
  await batch(boardOps(L.week)); return true;
}
export function friendlyError(e) {
  if (e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''))) return 'The league database turned this bet down. Ask the commissioner to check the Firebase rules are up to date and to re-post lines on the Commissioner page (Betting tab).';
  return (e && e.message) || 'Something went wrong.';
}
export function futuresOpen() { const L = D.league; return L.phase === PHASES.REG && L.bettingOpen; }
export function futuresBoard() {
  const L = D.league; if (L.phase !== PHASES.REG) return [];
  const sim = simulate(L.season, L.week), F = L.futures, posted = F && F.season === L.season && F.odds ? F.odds : null;
  return leagueTeams().map(t => ({ id: t.id, p: sim[t.id]?.titlePct || 0, odds: posted ? (posted[t.id] ?? null) : futuresOdds(sim[t.id]?.titlePct || 0), posted: !!posted }))
    .sort((a, b) => b.p - a.p || a.id.localeCompare(b.id));
}
export function futuresSnapshot() {
  const L = D.league, sim = simulate(L.season, L.week), odds = {};
  leagueTeams().forEach(t => odds[t.id] = futuresOdds(sim[t.id]?.titlePct || 0));
  return { season: L.season, week: L.week, open: true, odds };
}
export function settleFuturesOps(season, champId) {
  return D.wagers.filter(w => w.market === 'future' && w.season === season && w.status === 'open').map(w => {
    const st = !champId ? 'void' : w.pick === champId ? 'won' : 'lost';
    return { op: 'set', col: 'wagers', id: w.id, data: { status: st, payout: st === 'won' ? profit(w.stake, w.odds) : st === 'lost' ? -w.stake : 0 } };
  });
}
export function wagerLabel(w) {
  if (w.market === 'future') return `${team(w.pick).name} to win Season ${seasonNum(w.season)} title (${fmtOdds(w.odds)})`;
  const g = D.games.find(x => x.id === w.gameId) || {}, side = w.pick === 'home' ? g.home : g.away;
  if (w.market === 'ml') return `${team(side).name} ML ${fmtOdds(w.odds)}`;
  if (w.market === 'spread') return `${team(side).name} ${fmtLine(w.pick === 'home' ? w.line : -w.line)} (${fmtOdds(w.odds)})`;
  return `${w.pick === 'over' ? 'Over' : 'Under'} ${w.line} (${fmtOdds(w.odds)}) — ${team(g.away).abbr || team(g.away).name} @ ${team(g.home).abbr || team(g.home).name}`;
}

/* ---------------- Game of the Week ---------------- */
export function gotwTally(season, week) {
  const counts = {};
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

/* ---------------- Storylines ---------------- */
export function storylines() {
  const L = D.league, s = L.season, out = [];
  const lw = lastPlayedWeek(s);
  const nextGames = D.games.filter(g => g.season === s && g.week === L.week && !played(g));
  const userGame = g => isUserTeam(team(g.home)) || isUserTeam(team(g.away));
  const name = id => { const t = team(id); return isUserTeam(t) ? `${t.coach}'s ${t.name}` : t.name; };
  if (lw == null) {
    const sim = simulate(s, L.week);
    const fav = Object.entries(sim).sort((a, b) => b[1].titlePct - a[1].titlePct).slice(0, 2);
    if (fav.length) out.push({ tag: 'Preseason', title: `${team(fav[0][0]).name} enters as the title favorite`, body: `The model gives ${name(fav[0][0])} a ${pctStr(fav[0][1].titlePct)} shot at the league title (most likely record ${fav[0][1].likely})${fav[1] ? `, with ${name(fav[1][0])} next at ${pctStr(fav[1][1].titlePct)}` : ''}.` });
  } else {
    D.games.filter(g => g.season === s && g.week === lw && played(g) && g.forfeit).forEach(g => { const w = +g.homeScore > +g.awayScore ? g.home : g.away, l = w === g.home ? g.away : g.home; if (isUserTeam(team(w))) out.push({ tag: 'Forfeit', title: `${team(w).name} wins by forfeit`, body: `${name(w)} picks up a forfeit win over ${name(l)} in Week ${lw}.` }); });
    const wk = D.games.filter(g => g.season === s && g.week === lw && played(g) && !g.forfeit);
    const R = ratings(s, lw);
    const info = wk.map(g => { const l = (g.lines && g.lines.spread != null) ? lineOf(g) : lineFrom(R, g); const hw = +g.homeScore > +g.awayScore; return { g, l, hw, w: hw ? g.home : g.away, lo: hw ? g.away : g.home, ws: Math.max(+g.homeScore, +g.awayScore), ls: Math.min(+g.homeScore, +g.awayScore), pw: l ? (hw ? l.pHome : 1 - l.pHome) : 0.5, surprise: l ? Math.abs((+g.homeScore - +g.awayScore) + l.spread) : 0 }; });
    info.filter(x => isUserTeam(team(x.g.home)) && isUserTeam(team(x.g.away))).forEach(x => {
      const cover = x.l ? (x.pw < 0.5 ? ' as the underdog' : '') : '';
      out.push({ tag: 'User Game', title: `${team(x.w).coach} over ${team(x.lo).coach}`, body: `${name(x.w)} beat ${name(x.lo)} ${x.ws}-${x.ls}${cover} in Week ${lw}.` });
    });
    const upset = info.filter(x => userGame(x.g) && x.pw < 0.42).sort((a, b) => a.pw - b.pw)[0];
    if (upset) out.push({ tag: 'Upset', title: `Upset: ${team(upset.w).name} stuns ${team(upset.lo).name}`, body: `${name(upset.w)} entered with only a ${pctStr(upset.pw)} win probability (${fmtOdds(upset.w === upset.g.home ? upset.l.mlHome : upset.l.mlAway)}) and won ${upset.ws}-${upset.ls}.` });
    const big = info.filter(x => userGame(x.g) && x !== upset).sort((a, b) => b.surprise - a.surprise)[0];
    if (big && big.surprise >= 10) {
      const over = (big.hw ? 1 : -1) * ((+big.g.homeScore - +big.g.awayScore) + big.l.spread) > 0;
      out.push({ tag: 'Statement', title: over ? `${team(big.w).name} blows past the number` : `${team(big.w).name} survives a scare`, body: `${name(big.w)} won ${big.ws}-${big.ls} against ${team(big.lo).name}, ${Math.round(big.surprise)} points ${over ? 'better' : 'worse'} than the spread expected.` });
    }
    const recs = records(s);
    const st = userTeams().map(t => ({ t, s: streak(recs[t.id]) })).filter(x => /^[WL]\d+$/.test(x.s) && +x.s.slice(1) >= 3);
    const hotT = st.filter(x => x.s[0] === 'W').sort((a, b) => b.s.slice(1) - a.s.slice(1))[0];
    const coldT = st.filter(x => x.s[0] === 'L').sort((a, b) => b.s.slice(1) - a.s.slice(1))[0];
    if (hotT) out.push({ tag: 'Hot Streak', title: `${hotT.t.name} has won ${hotT.s.slice(1)} straight`, body: `${hotT.t.coach} is ${rec(recs[hotT.t.id])} and rolling into Week ${L.week}.` });
    if (coldT) out.push({ tag: 'Cold Streak', title: `${coldT.t.name} has dropped ${coldT.s.slice(1)} in a row`, body: `${coldT.t.coach} needs a response — currently ${rec(recs[coldT.t.id])}.` });
    const before = simulate(s, lw), after = simulate(s, lw + 1);
    const mv = Object.keys(after).map(id => ({ id, d: after[id].titlePct - before[id].titlePct })).filter(x => isUserTeam(team(x.id))).sort((a, b) => b.d - a.d);
    if (mv.length && mv[0].d >= 0.04) out.push({ tag: 'Odds Movers', title: `${team(mv[0].id).name}'s title odds jump to ${pctStr(after[mv[0].id].titlePct)}`, body: `Up ${Math.round(mv[0].d * 100)} points this week.${mv[mv.length - 1].d <= -0.04 ? ` Biggest drop: ${name(mv[mv.length - 1].id)}, down ${Math.round(-mv[mv.length - 1].d * 100)} to ${pctStr(after[mv[mv.length - 1].id].titlePct)}.` : ''}` });
    const unbeaten = leagueTeams().filter(t => recs[t.id].l === 0 && recs[t.id].w >= 3);
    if (unbeaten.length && unbeaten.length <= 3) out.push({ tag: 'Unbeaten Watch', title: unbeaten.length === 1 ? `${unbeaten[0].name} is the last unbeaten team` : `${unbeaten.length} teams still unbeaten`, body: unbeaten.map(t => `${name(t.id)} (${rec(recs[t.id])})`).join(', ') + '.' });
  }
  const g = gotwTally(s, L.week).game || nextGames.filter(x => isUserTeam(team(x.home)) && isUserTeam(team(x.away))).sort((a, b) => Math.abs(lineOf(a).spread) - Math.abs(lineOf(b).spread))[0];
  if (g) { const l = lineOf(g); const fav = l.spread <= 0 ? g.home : g.away; out.push({ tag: 'Up Next', title: `Week ${L.week}: ${team(g.away).name} at ${team(g.home).name}`, body: `${name(g.away)} visits ${name(g.home)}. ${l.spread === 0 ? 'Pick\'em' : `${team(fav).name} ${fmtLine(-Math.abs(l.spread))}`}, total ${l.total}.` }); }
  return out.slice(0, 5);
}
