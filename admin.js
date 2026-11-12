const FILES = ['league', 'teams', 'games', 'rankings', 'news', 'recruiting', 'awards', 'history'];
const TABS = [['scores', 'Scores'], ['league', 'Week & Banner'], ['news', 'Post News'], ['rankings', 'Rankings'], ['recruiting', 'Recruiting'], ['raw', 'Raw JSON']];
const db = {}, dirty = new Set();
const state = { tab: 'scores', week: 1, raw: 'teams' };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tname = id => (db.teams.find(t => t.id === id) || { name: id }).name;
const teamOpts = (sel, blank) => (blank ? '<option value="">—</option>' : '') + db.teams.map(t => `<option value="${esc(t.id)}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
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
    ? `<b>Changed files</b> <span class="muted">(download, then upload to your GitHub repo, replacing the old file)</span><div class="row" style="margin-top:8px">
       ${list.map(f => `<button data-dl="${f}">⬇ ${f}.json</button>`).join('')}</div>`
    : '<span class="muted">No unsaved changes. Edits you make appear here as downloads.</span>';
}

function renderTabs() {
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<a href="#" data-tab="${k}" class="${k === state.tab ? 'on' : ''}">${l}</a>`).join('');
}

const views = {
  scores() {
    const season = db.league.season;
    const idx = db.games.map((g, i) => [g, i]).filter(([g]) => g.season === season && g.week === state.week);
    const weeks = Array.from({ length: 21 }, (_, w) => w);
    return `<div class="card"><div class="row"><b>Week</b><select id="wkSel">${weeks.map(w => `<option ${w === state.week ? 'selected' : ''}>${w}</option>`).join('')}</select>
      <span class="muted">Season ${season} · current league week ${db.league.week}</span></div></div>
      ${idx.length ? idx.map(([g, i]) => `<div class="card game"><div class="teams"><div>${esc(tname(g.away))} <span class="muted">(away)</span></div><div>${esc(tname(g.home))} <span class="muted">(home)</span></div></div>
        <div class="row"><div><input class="score" type="number" inputmode="numeric" data-i="${i}" data-k="awayScore" value="${g.awayScore ?? ''}"><br><br>
        <input class="score" type="number" inputmode="numeric" data-i="${i}" data-k="homeScore" value="${g.homeScore ?? ''}"></div>
        <button class="danger" data-del="${i}">✕</button></div></div>`).join('') : '<div class="card empty">No games this week yet. Add some below.</div>'}
      <div class="card"><h3 style="margin-top:0">Add a game to week ${state.week}</h3><div class="row">
        <select id="gAway">${teamOpts('')}</select> @ <select id="gHome">${teamOpts('')}</select>
        <button id="addGame">Add</button></div></div>`;
  },

  league() {
    const L = db.league;
    return `<div class="card">
      <label>League name</label><input id="f_name" value="${esc(L.name)}" style="width:100%">
      <label>Tagline</label><input id="f_tagline" value="${esc(L.tagline)}" style="width:100%">
      <div class="row"><div><label>Season</label><input id="f_season" type="number" value="${L.season}"></div>
      <div><label>Week</label><input id="f_week" type="number" value="${L.week}"></div>
      <div><label>Phase</label><input id="f_phase" value="${esc(L.phase)}"></div></div>
      <label>Commissioner's Desk banner (shown on home page)</label><textarea id="f_announcement" rows="4">${esc(L.announcement)}</textarea>
      <label>Rules (one per line)</label><textarea id="f_rules" rows="6">${esc((L.rules || []).join('\n'))}</textarea>
      <div class="row" style="margin-top:12px"><button id="saveLeague">Save</button><button class="ghost" id="advance">Advance to week ${L.week + 1}</button></div></div>`;
  },

  news() {
    return `<div class="card"><label>Title</label><input id="n_title" style="width:100%">
      <div class="row"><div><label>Tag</label><input id="n_tag" value="Advance"></div><div><label>Date</label><input id="n_date" type="date" value="${new Date().toISOString().slice(0, 10)}"></div></div>
      <label>Body</label><textarea id="n_body" rows="5"></textarea><div style="margin-top:12px"><button id="postNews">Post</button></div></div>
      <h3>Recent posts</h3>${db.news.slice(0, 8).map((n, i) => `<div class="card game"><div><b>${esc(n.title)}</b><div class="muted">${esc(n.date)}</div></div><button class="danger" data-delnews="${i}">✕</button></div>`).join('')}`;
  },

  rankings() {
    const r = db.rankings;
    return `<div class="card"><div class="row"><div><label>Season</label><input id="r_season" type="number" value="${r.season}"></div><div><label>Week</label><input id="r_week" type="number" value="${r.week}"></div></div>
      <p class="muted">Saving moves the current poll into "previous" so risers/fallers show on the hub.</p>
      ${Array.from({ length: 25 }, (_, i) => `<div class="row" style="margin-bottom:6px"><b style="width:28px">${i + 1}</b><select data-rk="${i}">${teamOpts(r.ranks[i] || '', true)}</select></div>`).join('')}
      <div style="margin-top:12px"><button id="saveRanks">Save poll</button></div></div>`;
  },

  recruiting() {
    const R = db.recruiting;
    return `<div class="card"><label>Class year</label><input id="rc_class" type="number" value="${esc(R.class)}">
      <div class="tablewrap"><table><tr><th>Team</th><th>Commits</th><th>5★</th><th>4★</th><th>3★</th><th>Pts</th></tr>
      ${db.teams.map(t => { const r = R.rows.find(x => x.team === t.id) || { commits: 0, five: 0, four: 0, three: 0, points: 0 };
        return `<tr data-rt="${esc(t.id)}"><td>${esc(t.name)}</td>${['commits', 'five', 'four', 'three', 'points'].map(k => `<td><input class="score" type="number" data-k="${k}" value="${r[k]}"></td>`).join('')}</tr>`; }).join('')}
      </table></div><div style="margin-top:12px"><button id="saveRecruit">Save recruiting</button></div></div>`;
  },

  raw() {
    return `<div class="card"><div class="row"><select id="rawSel">${FILES.map(f => `<option ${f === state.raw ? 'selected' : ''}>${f}</option>`).join('')}</select>
      <span class="muted">Use for teams (names, coaches, colors), history, awards.</span></div><br>
      <textarea id="rawText" rows="18">${esc(JSON.stringify(db[state.raw], null, 2))}</textarea>
      <div style="margin-top:12px"><button id="applyRaw">Apply changes</button> <span id="rawMsg" class="muted"></span></div></div>`;
  }
};

function render() { renderTabs(); $('#panel').innerHTML = views[state.tab](); }

document.addEventListener('click', e => {
  const t = e.target;
  if (t.dataset.tab) { e.preventDefault(); state.tab = t.dataset.tab; render(); }
  else if (t.dataset.dl) download(t.dataset.dl);
  else if (t.dataset.del != null && t.dataset.del !== '') { if (confirm('Remove this game?')) { db.games.splice(+t.dataset.del, 1); mark('games'); render(); } }
  else if (t.dataset.delnews != null && t.dataset.delnews !== '') { db.news.splice(+t.dataset.delnews, 1); mark('news'); render(); }
  else if (t.id === 'addGame') {
    const home = $('#gHome').value, away = $('#gAway').value;
    if (home === away) return alert('Pick two different teams.');
    db.games.push({ season: db.league.season, week: state.week, home, away, homeScore: null, awayScore: null, note: '' });
    mark('games'); render();
  } else if (t.id === 'saveLeague') {
    const L = db.league;
    L.name = $('#f_name').value; L.tagline = $('#f_tagline').value; L.season = +$('#f_season').value; L.week = +$('#f_week').value;
    L.phase = $('#f_phase').value; L.announcement = $('#f_announcement').value;
    L.rules = $('#f_rules').value.split('\n').map(s => s.trim()).filter(Boolean);
    mark('league'); render();
  } else if (t.id === 'advance') {
    db.league.week++; state.week = db.league.week; mark('league'); render();
  } else if (t.id === 'postNews') {
    const title = $('#n_title').value.trim(); if (!title) return alert('Add a title.');
    db.news.unshift({ date: $('#n_date').value, tag: $('#n_tag').value, title, body: $('#n_body').value });
    mark('news'); render();
  } else if (t.id === 'saveRanks') {
    const ranks = [...document.querySelectorAll('[data-rk]')].map(s => s.value).filter(Boolean);
    if (new Set(ranks).size !== ranks.length) return alert('A team appears twice in the poll.');
    db.rankings = { season: +$('#r_season').value, week: +$('#r_week').value, previous: db.rankings.ranks, ranks };
    mark('rankings'); alert('Poll saved.');
  } else if (t.id === 'saveRecruit') {
    db.recruiting.class = +$('#rc_class').value;
    db.recruiting.rows = [...document.querySelectorAll('[data-rt]')].map(tr => {
      const o = { team: tr.dataset.rt };
      tr.querySelectorAll('input').forEach(i => o[i.dataset.k] = +i.value || 0);
      return o;
    });
    mark('recruiting'); alert('Recruiting saved.');
  } else if (t.id === 'applyRaw') {
    try { db[state.raw] = JSON.parse($('#rawText').value); mark(state.raw); $('#rawMsg').textContent = 'Applied ✓'; }
    catch (err) { $('#rawMsg').textContent = 'Invalid JSON: ' + err.message; }
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'wkSel') { state.week = +t.value; render(); }
  else if (t.id === 'rawSel') { state.raw = t.value; render(); }
  else if (t.dataset.i != null && t.dataset.k) {
    db.games[+t.dataset.i][t.dataset.k] = t.value === '' ? null : +t.value; mark('games');
  }
});

(async function init() {
  try {
    await Promise.all(FILES.map(async f => { const r = await fetch('' + f + '.json?v=' + Date.now()); db[f] = await r.json(); }));
    state.week = db.league.week;
    render(); renderDirty();
  } catch (e) {
    $('#panel').innerHTML = `<div class="card"><b>Couldn't load data.</b><p class="muted">${esc(e.message)}. Open this page through GitHub Pages or a local server.</p></div>`;
  }
})();
