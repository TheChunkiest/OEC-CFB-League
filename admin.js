const FILES = ['league', 'coaches', 'seasons', 'games', 'news'];
const TABS = [['scores', 'Scores'], ['league', 'Week & Banner'], ['news', 'Post News'], ['rankings', 'Rankings'], ['season', 'New Season'], ['raw', 'Raw JSON']];
const CHAMP_WEEK = 14;
const db = {}, dirty = new Set();
const state = { tab: 'scores', season: 1, week: 0, raw: 'seasons' };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isCoach = id => db.coaches.some(c => c.id === id);
const nm = id => (db.coaches.find(c => c.id === id) || {}).name || String(id).replace(/^cpu:/i, '') + ' (CPU)';
const WK = w => w === CHAMP_WEEK ? 'Championship' : 'Week ' + w;
const seasonOf = n => db.seasons.find(s => s.season === n);
const coachOpts = sel => db.coaches.map(c => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
const mark = f => { dirty.add(f); renderDirty(); };

function download(f) {
  const blob = new Blob([JSON.stringify(db[f], null, 2) + '\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = f + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function renderDirty() {
  const list = [...dirty];
  $('#dirty').innerHTML = list.length
    ? `<b>Changed files</b> <span class="muted">(download each, then upload to your GitHub repo)</span><div class="row" style="margin-top:8px">${list.map(f => `<button data-dl="${f}">⬇ ${f}.json</button>`).join('')}</div>`
    : '<span class="muted">No changes yet. Anything you edit shows up here as a download.</span>';
}
function renderTabs() {
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<a href="#" data-tab="${k}" class="${k === state.tab ? 'on' : ''}">${l}</a>`).join('');
}

const views = {
  scores() {
    const idx = db.games.map((g, i) => [g, i]).filter(([g]) => g.season === state.season && g.week === state.week);
    return `<div class="card"><div class="row"><select id="snSel">${db.seasons.map(s => `<option value="${s.season}" ${s.season === state.season ? 'selected' : ''}>Season ${s.season}</option>`).join('')}</select>
      <select id="wkSel">${Array.from({ length: 15 }, (_, w) => `<option value="${w}" ${w === state.week ? 'selected' : ''}>${WK(w)}</option>`).join('')}</select></div>
      <p class="muted" style="margin-bottom:0">Current league: Season ${db.league.season}, ${WK(db.league.week)}. Enter away score on top, home score below.</p></div>
      ${idx.length ? idx.map(([g, i]) => `<div class="card game"><div class="teams"><div>${esc(nm(g.away))} <span class="muted">(away)</span></div><div>${esc(nm(g.home))} <span class="muted">(home)</span></div>
        <select data-ff="${i}"><option value="">No forfeit</option><option value="${esc(g.away)}" ${g.forfeit === g.away ? 'selected' : ''}>${esc(nm(g.away))} wins by forfeit</option><option value="${esc(g.home)}" ${g.forfeit === g.home ? 'selected' : ''}>${esc(nm(g.home))} wins by forfeit</option></select></div>
        <div class="row"><div><input class="score" type="number" inputmode="numeric" data-i="${i}" data-k="awayScore" value="${g.awayScore ?? ''}"><br><br>
        <input class="score" type="number" inputmode="numeric" data-i="${i}" data-k="homeScore" value="${g.homeScore ?? ''}"></div><button class="danger" data-del="${i}">✕</button></div></div>`).join('')
        : '<div class="card empty">No games this week yet. Add one below.</div>'}
      <div class="card"><h3 style="margin-top:0">Add a game to ${WK(state.week)}</h3>
        <label>Away</label><select id="gAway">${coachOpts('')}</select>
        <label>Home</label><select id="gHome">${coachOpts('')}</select>
        <div style="margin-top:12px"><button id="addGame">Add game</button></div></div>`;
  },

  league() {
    const L = db.league;
    return `<div class="card"><label>League name</label><input id="f_name" value="${esc(L.name)}" style="width:100%">
      <label>Tagline</label><input id="f_tagline" value="${esc(L.tagline)}" style="width:100%">
      <div class="row"><div><label>Season</label><input id="f_season" type="number" value="${L.season}"></div><div><label>Week (14 = championship)</label><input id="f_week" type="number" value="${L.week}"></div>
      <div><label>Phase</label><input id="f_phase" value="${esc(L.phase)}"></div></div>
      <label>Commissioner's Desk banner (home page)</label><textarea id="f_announcement" rows="4">${esc(L.announcement)}</textarea>
      <label>Discord invite link (shows in the site footer)</label><input id="f_discord" value="${esc(((L.links || [])[0] || {}).url || '')}" style="width:100%" placeholder="https://discord.gg/...">
      <div class="row" style="margin-top:12px"><button id="saveLeague">Save</button><button class="ghost" id="advance">Advance to ${WK(L.week + 1)}</button></div></div>`;
  },

  news() {
    return `<div class="card"><label>Title</label><input id="n_title" style="width:100%">
      <div class="row"><div><label>Tag</label><input id="n_tag" value="Advance"></div><div><label>Date</label><input id="n_date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div></div>
      <label>Body</label><textarea id="n_body" rows="5"></textarea><div style="margin-top:12px"><button id="postNews">Post</button></div></div>
      <h3>Recent posts</h3>${db.news.slice(0, 8).map((n, i) => `<div class="card game"><div><b>${esc(n.title)}</b><div class="muted">${esc(n.date)}</div></div><button class="danger" data-delnews="${i}">✕</button></div>`).join('')}`;
  },

  rankings() {
    const S = seasonOf(db.league.season), pr = S.powerRankings || { ranks: [] }, n = Object.keys(S.teams).length;
    return `<div class="card"><p class="muted" style="margin-top:0">Season ${S.season} power rankings. Saving moves the current list to "previous" so risers and fallers show.</p>
      <label>Label (e.g. Week 9)</label><input id="r_label" value="${esc(pr.label || 'Week ' + db.league.week)}">
      ${Array.from({ length: n }, (_, i) => `<div class="row" style="margin-top:6px"><b style="width:28px">${i + 1}</b><select data-rk="${i}"><option value="">—</option>${Object.keys(S.teams).map(id => `<option value="${esc(id)}" ${pr.ranks[i] === id ? 'selected' : ''}>${esc(nm(id))}</option>`).join('')}</select></div>`).join('')}
      <div style="margin-top:12px"><button id="saveRanks">Save rankings</button></div></div>`;
  },

  season() {
    const last = db.seasons.at(-1);
    return `<div class="card"><h3 style="margin-top:0">Start Season ${last.season + 1}</h3>
      <p class="muted">Creates the new season, copies each coach's team from Season ${last.season}, sets the league to Week 0, and leaves awards empty. Then use <b>Raw JSON → seasons</b> to change teams, divisions, or add new coaches (also add them in <b>coaches</b>).</p>
      <label>In-game year</label><input id="ns_year" type="number" value="${last.year + 1}">
      <div style="margin-top:12px"><button id="newSeason">Start new season</button></div></div>
      <div class="card"><h3 style="margin-top:0">Season ${db.league.season} awards</h3><p class="muted">Edit awards, "Holy Sh*t" moments, and game of the year in <b>Raw JSON → seasons</b>. Award format: <code>{"name":"J. White, UNT RB","coach":"dayce"}</code>.</p></div>`;
  },

  raw() {
    return `<div class="card"><div class="row"><select id="rawSel">${FILES.map(f => `<option ${f === state.raw ? 'selected' : ''}>${f}</option>`).join('')}</select>
      <span class="muted">seasons = teams, divisions, awards, moments.</span></div><br>
      <textarea id="rawText" rows="18">${esc(JSON.stringify(db[state.raw], null, 2))}</textarea>
      <div style="margin-top:12px"><button id="applyRaw">Apply changes</button> <span id="rawMsg" class="muted"></span></div></div>`;
  }
};

function render() { renderTabs(); $('#panel').innerHTML = views[state.tab](); }
const pickTeam = (selId, cpuId) => { const v = $(selId).value; if (v !== '__cpu') return v; const n = $(cpuId).value.trim(); return n ? 'cpu:' + n : ''; };

document.addEventListener('click', e => {
  const t = e.target;
  if (t.dataset.tab) { e.preventDefault(); state.tab = t.dataset.tab; render(); }
  else if (t.dataset.dl) download(t.dataset.dl);
  else if (t.dataset.del != null && t.dataset.del !== '') { if (confirm('Remove this game?')) { db.games.splice(+t.dataset.del, 1); mark('games'); render(); } }
  else if (t.dataset.delnews != null && t.dataset.delnews !== '') { db.news.splice(+t.dataset.delnews, 1); mark('news'); render(); }
  else if (t.id === 'addGame') {
    const away = $('#gAway').value, home = $('#gHome').value;
    if (away === home) return alert('Pick two different teams.');
    db.games.push({ season: state.season, week: state.week, away, home, awayScore: null, homeScore: null, forfeit: null });
    mark('games'); render();
  } else if (t.id === 'saveLeague') {
    const L = db.league;
    L.name = $('#f_name').value; L.tagline = $('#f_tagline').value; L.season = +$('#f_season').value; L.week = +$('#f_week').value;
    L.phase = $('#f_phase').value; L.announcement = $('#f_announcement').value;
    const dUrl = $('#f_discord').value.trim(); L.links = dUrl ? [{ label: 'League Discord', url: dUrl }] : [];
    mark('league'); render();
  } else if (t.id === 'advance') { db.league.week++; mark('league'); render(); }
  else if (t.id === 'postNews') {
    const title = $('#n_title').value.trim(); if (!title) return alert('Add a title.');
    db.news.unshift({ date: $('#n_date').value, tag: $('#n_tag').value, title, body: $('#n_body').value });
    mark('news'); render();
  } else if (t.id === 'saveRanks') {
    const ranks = [...document.querySelectorAll('[data-rk]')].map(s => s.value).filter(Boolean);
    if (new Set(ranks).size !== ranks.length) return alert('A coach appears twice.');
    const S = seasonOf(db.league.season);
    S.powerRankings = { label: $('#r_label').value, ranks, previous: (S.powerRankings || {}).ranks || [] };
    mark('seasons'); alert('Rankings saved.');
  } else if (t.id === 'newSeason') {
    const last = db.seasons.at(-1);
    db.seasons.push({ season: last.season + 1, year: +$('#ns_year').value, teams: { ...last.teams }, divisions: last.divisions ? JSON.parse(JSON.stringify(last.divisions)) : null,
      awards: { mvp: null, opoy: null, dpoy: null, bestOff: null, bestDef: null, gameOfYear: '' }, moments: [], powerRankings: { label: '', ranks: [], previous: [] } });
    db.league.season = last.season + 1; db.league.week = 0;
    state.season = db.league.season; state.week = 0;
    mark('seasons'); mark('league'); state.tab = 'scores'; render();
  } else if (t.id === 'applyRaw') {
    try { db[state.raw] = JSON.parse($('#rawText').value); mark(state.raw); $('#rawMsg').textContent = 'Applied ✓'; }
    catch (err) { $('#rawMsg').textContent = 'Invalid JSON: ' + err.message; }
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'snSel') { state.season = +t.value; render(); }
  else if (t.id === 'wkSel') { state.week = +t.value; render(); }
  else if (t.id === 'rawSel') { state.raw = t.value; render(); }
  else if (t.dataset.ff != null && t.dataset.ff !== '') { db.games[+t.dataset.ff].forfeit = t.value || null; mark('games'); }
  else if (t.dataset.i != null && t.dataset.k) { db.games[+t.dataset.i][t.dataset.k] = t.value === '' ? null : +t.value; mark('games'); }
});

(async function init() {
  try {
    await Promise.all(FILES.map(async f => { const r = await fetch(f + '.json?v=' + Date.now()); db[f] = await r.json(); }));
    state.season = db.league.season; state.week = db.league.week;
    render(); renderDirty();
  } catch (e) {
    $('#panel').innerHTML = `<div class="card"><b>Couldn't load data.</b><p class="muted">${esc(e.message)}. Open this page through your GitHub Pages link.</p></div>`;
  }
})();
