/* Defender Roadmap — progress & accountability tracker. No build step, no backend. */
(function () {
  'use strict';

  /* ---------- state ---------- */
  var KEY = 'defender-roadmap-v2';
  var LEGACY_KEY = 'defender-roadmap-v1';
  var DEFAULTS = { tasks: {}, videos: {}, sessions: [], checkins: [], exams: [], settings: { name: '', startDate: '', examDate: '', weeklyHours: 12 } };
  var S = load();

  function load() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { s = {}; }
    var out = JSON.parse(JSON.stringify(DEFAULTS));
    Object.keys(out).forEach(function (k) { if (s[k] !== undefined) out[k] = s[k]; });
    out.settings = Object.assign({}, DEFAULTS.settings, s.settings || {});
    // migrate ticks from the original single-page roadmap
    try {
      var legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
      if (legacy && !s.tasks) { Object.keys(legacy).forEach(function (id) { out.tasks[id] = { done: true, doneAt: today() }; }); }
    } catch (e) {}
    return out;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save (storage blocked)'); } updateSide(); }

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDate(s) { if (!s) return null; var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtDate(s) { var d = parseDate(s); if (!d) return ''; return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
  function fmtShort(s) { var d = parseDate(s); if (!d) return ''; return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }
  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
  function weekStart(d) { d = new Date(d.getFullYear(), d.getMonth(), d.getDate()); var day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d; }
  function isoKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function weekKeyOf(dateStr) { return isoKey(weekStart(parseDate(dateStr))); }
  function hrs(min) { return (Math.round(min / 6) / 10).toFixed(1); }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2200); }
  function ytSearch(title) { return 'https://www.youtube.com/results?search_query=' + encodeURIComponent('Professor Messer SY0-701 ' + title); }

  /* ---------- data loading ---------- */
  var cache = {};
  function getJSON(path) {
    if (cache[path]) return cache[path];
    cache[path] = fetch(path).then(function (r) { if (!r.ok) throw new Error(r.status + ' ' + path); return r.json(); })
      .catch(function (e) { delete cache[path]; throw e; });
    return cache[path];
  }
  function getRoadmap() { return getJSON('data/roadmap.json'); }
  function getIndex() { return getJSON('data/secplus/index.json'); }
  function getDomain(id) { return getJSON('data/secplus/' + id + '.json'); }
  function getAllDomains() { return getIndex().then(function (ix) { return Promise.all(ix.domains.map(function (d) { return getDomain(d.id); })); }); }

  /* ---------- derived ---------- */
  function flatVideos(domains) {
    var out = [];
    domains.forEach(function (d) { d.objectives.forEach(function (o) { o.videos.forEach(function (v) { out.push({ d: d, o: o, v: v }); }); }); });
    return out;
  }
  function vstate(id) { return S.videos[id] || { status: 'todo', confidence: 0, notes: '', quizBest: null }; }
  function setV(id, patch) { S.videos[id] = Object.assign({}, vstate(id), patch); save(); }
  function needsReview(id) { var s = vstate(id); return s.status === 'review' || (s.confidence > 0 && s.confidence <= 2) || (s.quizBest !== null && s.quizBest !== undefined && s.quizBest < (s.quizTotal || 3)); }
  function domainStats(d) {
    var total = 0, done = 0, review = 0;
    d.objectives.forEach(function (o) { o.videos.forEach(function (v) { total++; var s = vstate(v.id); if (s.status === 'done') done++; if (needsReview(v.id)) review++; }); });
    return { total: total, done: done, review: review };
  }
  function taskStats(rm) {
    var total = 0, done = 0;
    rm.phases.forEach(function (p) { p.tasks.forEach(function (t) { total++; if (S.tasks[t.id] && S.tasks[t.id].done) done++; }); });
    return { total: total, done: done };
  }
  function overallPct(rm, domains) {
    var t = taskStats(rm); var vt = 0, vd = 0;
    domains.forEach(function (d) { var s = domainStats(d); vt += s.total; vd += s.done; });
    // roadmap tasks and Security+ videos weighted equally
    var a = t.total ? t.done / t.total : 0, b = vt ? vd / vt : 0;
    return Math.round((a + b) / 2 * 100);
  }
  function minutesInWeek(wk) { return S.sessions.filter(function (s) { return weekKeyOf(s.date) === wk; }).reduce(function (a, s) { return a + (+s.minutes || 0); }, 0); }
  function streak() {
    var days = {}; S.sessions.forEach(function (s) { days[s.date] = 1; });
    var d = new Date(); var n = 0;
    if (!days[isoKey(d)]) { d.setDate(d.getDate() - 1); if (!days[isoKey(d)]) return 0; }
    while (days[isoKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function currentPhase(rm) {
    var sd = parseDate(S.settings.startDate); if (!sd) return null;
    var months = daysBetween(sd, new Date()) / 30.44 + 1;
    var cur = null; rm.phases.forEach(function (p) { if (months >= p.startMonth && months <= p.endMonth + 0.99) cur = cur || p; });
    return cur || (months > 12 ? rm.phases[rm.phases.length - 1] : rm.phases[0]);
  }
  function lastCheckinDays() { if (!S.checkins.length) return null; var latest = S.checkins.slice().sort(function (a, b) { return b.date < a.date ? -1 : 1; })[0]; return daysBetween(parseDate(latest.date), new Date()); }

  /* ---------- side bar ---------- */
  function updateSide() {
    Promise.all([getRoadmap(), getAllDomains()]).then(function (r) {
      var p = overallPct(r[0], r[1]);
      $('#side-pct').textContent = p + '%'; $('#side-fill').style.width = p + '%';
    }).catch(function () {});
  }

  /* ---------- router ---------- */
  var view = $('#view');
  function route() {
    var h = location.hash.replace(/^#\/?/, ''); var parts = h.split('/').filter(Boolean);
    $$('.nav a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-route') === (parts[0] || '')); });
    view.innerHTML = '<p class="muted">Loading…</p>';
    var p;
    if (!parts.length) p = renderDashboard();
    else if (parts[0] === 'roadmap') p = renderRoadmap();
    else if (parts[0] === 'secplus' && parts.length === 1) p = renderSecplus();
    else if (parts[0] === 'secplus' && parts.length === 2) p = renderDomain(parts[1]);
    else if (parts[0] === 'secplus' && parts.length >= 3) p = renderVideo(parts[1], parts.slice(2).join('/'));
    else if (parts[0] === 'log') p = renderLog();
    else if (parts[0] === 'checkin') p = renderCheckin();
    else if (parts[0] === 'settings') p = renderSettings();
    else p = Promise.resolve('<div class="page"><h1>Not found</h1><p><a href="#/">Back to dashboard</a></p></div>');
    p.then(function (html) { view.innerHTML = html; window.scrollTo(0, 0); bind(); })
     .catch(function (e) { view.innerHTML = '<div class="page"><h1>Could not load</h1><p class="muted">' + esc(e.message) + '</p><p>If you opened this file directly from disk, run it through a local server or the Vercel deployment; the browser blocks data files on file:// URLs.</p></div>'; });
  }
  window.addEventListener('hashchange', route);

  /* ---------- views ---------- */
  function renderDashboard() {
    return Promise.all([getRoadmap(), getAllDomains()]).then(function (r) {
      var rm = r[0], domains = r[1], st = S.settings;
      var ts = taskStats(rm); var vids = flatVideos(domains);
      var vdone = vids.filter(function (x) { return vstate(x.v.id).status === 'done'; }).length;
      var review = vids.filter(function (x) { return needsReview(x.v.id); });
      var wk = isoKey(weekStart(new Date())); var mins = minutesInWeek(wk); var goal = +st.weeklyHours || 12;
      var sk = streak(); var exam = parseDate(st.examDate); var examDays = exam ? daysBetween(new Date(), exam) : null;
      var phase = currentPhase(rm); var lc = lastCheckinDays();
      var nextVid = vids.filter(function (x) { return vstate(x.v.id).status !== 'done'; })[0];
      var nextTasks = []; rm.phases.forEach(function (p) { p.tasks.forEach(function (t) { if (nextTasks.length < 3 && !(S.tasks[t.id] && S.tasks[t.id].done)) nextTasks.push({ p: p, t: t }); }); });
      var greet = st.name ? 'Welcome back, ' + esc(st.name) + '.' : 'Welcome back.';

      var h = '<div class="page"><div class="page-head"><span class="eyebrow">Dashboard · ' + fmtDate(today()) + '</span><h1>' + greet + '</h1>';
      if (!st.startDate) h += '<p class="lede">Set your start date, exam date and weekly hours goal in <a href="#/settings">Settings</a> so the dashboard can hold you to them.</p>';
      else if (phase) h += '<p class="lede">You are in <strong>Phase ' + phase.id.slice(1) + ': ' + esc(phase.title) + '</strong> (' + esc(phase.when) + '). Goal: ' + esc(phase.goal) + '</p>';
      h += '</div>';

      // nudges
      var nudges = '';
      if (mins < goal * 60 && new Date().getDay() >= 4) nudges += '<div class="nudge"><strong>' + hrs(goal * 60 - mins) + ' hours short of this week\'s goal.</strong><span>It is ' + new Date().toLocaleDateString(undefined, { weekday: 'long' }) + '. Log a session today to stay on pace.</span></div>';
      if (mins >= goal * 60) nudges += '<div class="nudge ok"><strong>Weekly goal met.</strong><span>' + hrs(mins) + ' of ' + goal + ' hours logged this week.</span></div>';
      if (lc === null) nudges += '<div class="nudge"><strong>No weekly check-in yet.</strong><span><a href="#/checkin">Write your first one</a>: what went well, what blocked you, what you will do next week.</span></div>';
      else if (lc > 7) nudges += '<div class="nudge"><strong>Last check-in was ' + lc + ' days ago.</strong><span><a href="#/checkin">Do this week\'s check-in</a> before you study anything else.</span></div>';
      if (review.length >= 5) nudges += '<div class="nudge"><strong>' + review.length + ' Security+ videos need review.</strong><span>Clear them before starting a new domain. <a href="#/secplus">See the review list</a>.</span></div>';
      if (nudges) h += '<section class="block">' + nudges + '</section>';

      // stats
      h += '<section class="block"><div class="grid cols-4">';
      h += stat('Roadmap', ts.done + ' / ' + ts.total, 'tasks done', ts.done === ts.total ? 'good' : '');
      h += stat('Security+', vdone + ' / ' + vids.length, 'videos done', '');
      h += stat('This week', hrs(mins) + 'h', 'of ' + goal + 'h goal', mins >= goal * 60 ? 'good' : (mins < goal * 30 ? 'warn' : ''));
      h += stat('Streak', sk + (sk === 1 ? ' day' : ' days'), sk ? 'keep it going' : 'log a session today', sk >= 3 ? 'good' : '');
      if (examDays !== null) h += stat('Exam', examDays >= 0 ? examDays + ' days' : 'passed', examDays >= 0 ? 'until ' + fmtShort(st.examDate) : fmtShort(st.examDate), examDays >= 0 && examDays < 14 ? 'warn' : '');
      h += stat('Review list', String(review.length), 'videos flagged', review.length ? 'warn' : 'good');
      h += '</div></section>';

      // next up
      h += '<section class="block"><div class="grid cols-2">';
      h += '<div class="card"><h3>Next video</h3><div class="next-up" style="margin-top:10px">';
      if (nextVid) h += '<a href="#/secplus/' + nextVid.d.id + '/' + nextVid.v.id + '"><span>' + esc(nextVid.v.title) + '<br><small>' + esc(nextVid.o.id) + ' · Domain ' + nextVid.d.number + '</small></span><span class="tag ' + vstate(nextVid.v.id).status + '">' + statusLabel(vstate(nextVid.v.id).status) + '</span></a>';
      else h += '<div class="empty">Every video is done. Sit the exam.</div>';
      h += '</div></div>';
      h += '<div class="card"><h3>Next roadmap tasks</h3><div class="next-up" style="margin-top:10px">';
      nextTasks.forEach(function (x) { h += '<a href="#/roadmap#' + x.t.id + '"><span>' + esc(x.t.title) + '<br><small>Phase ' + x.p.id.slice(1) + ' · ' + esc(x.p.when) + '</small></span><span class="tag ' + x.p.track + '">' + x.p.track + '</span></a>'; });
      if (!nextTasks.length) h += '<div class="empty">All roadmap tasks done.</div>';
      h += '</div></div></div></section>';

      // domain progress
      h += '<section class="block"><h2>Security+ by domain</h2><div class="domains">';
      domains.forEach(function (d) { h += domainRow(d); });
      h += '</div></section>';

      // weekly chart
      h += '<section class="block"><h2>Study hours, last 8 weeks</h2><div class="card">' + weekChart(goal) + '</div></section>';

      if (review.length) {
        h += '<section class="block"><h2>Review list</h2><div class="videos">';
        review.slice(0, 8).forEach(function (x) { h += videoRow(x.d, x.v, x.o); });
        if (review.length > 8) h += '<p class="muted">And ' + (review.length - 8) + ' more in the <a href="#/secplus">companion</a>.</p>';
        h += '</div></section>';
      }
      h += '</div>';
      return h;
    });
  }
  function stat(label, value, sub, cls) { return '<div class="card stat ' + cls + '"><span class="label">' + label + '</span><span class="value">' + value + '</span><span class="sub">' + sub + '</span></div>'; }
  function statusLabel(s) { return { todo: 'Not started', watching: 'Watching', done: 'Done', review: 'Needs review' }[s] || s; }
  function weekChart(goal) {
    var weeks = []; var d = weekStart(new Date());
    for (var i = 7; i >= 0; i--) { var w = new Date(d); w.setDate(w.getDate() - i * 7); weeks.push(isoKey(w)); }
    var max = Math.max(goal * 60, 1); weeks.forEach(function (w) { max = Math.max(max, minutesInWeek(w)); });
    var h = '<div class="chart">';
    weeks.forEach(function (w) { var m = minutesInWeek(w); h += '<div><b class="' + (m >= goal * 60 ? 'goal' : '') + '" style="height:' + Math.max(2, m / max * 100) + '%" data-h="' + hrs(m) + 'h"></b><small>' + fmtShort(w) + '</small></div>'; });
    h += '</div><p class="muted" style="margin-top:8px;font-size:13px">Green bars met the ' + goal + 'h goal. Week starts Monday.</p>';
    return h;
  }
  function domainRow(d) {
    var s = domainStats(d);
    return '<a class="domain-row" href="#/secplus/' + d.id + '"><span class="num">' + d.number + '</span><span><strong>' + esc(d.title) + '</strong><br><span class="meta">' + d.weight + '% of exam · ' + s.total + ' videos' + (s.review ? ' · <span style="color:var(--review)">' + s.review + ' to review</span>' : '') + '</span></span><span class="right"><span>' + s.done + ' / ' + s.total + '</span><div class="bar" style="width:150px"><i style="width:' + pct(s.done, s.total) + '%"></i></div></span></a>';
  }
  function videoRow(d, v, o) {
    var s = vstate(v.id);
    return '<a class="video-row" href="#/secplus/' + d.id + '/' + v.id + '"><span>' + esc(v.title) + (o ? ' <span class="conf">' + esc(o.id) + '</span>' : '') + '</span><span class="r">' + (s.confidence ? '<span class="conf">' + '★'.repeat(s.confidence) + '</span>' : '') + (s.quizBest !== null && s.quizBest !== undefined ? '<span class="conf">' + s.quizBest + '/' + (s.quizTotal || 3) + '</span>' : '') + '<span class="tag ' + s.status + '">' + statusLabel(s.status) + '</span></span></a>';
  }

  function renderRoadmap() {
    return getRoadmap().then(function (rm) {
      var ts = taskStats(rm);
      var h = '<div class="page"><div class="page-head"><span class="eyebrow">12-month plan · Blue Team + GRC</span><h1>' + esc(rm.title) + '</h1><p class="lede">' + esc(rm.lede) + '</p>';
      h += '<div class="progress"><span>' + ts.done + ' / ' + ts.total + ' tasks done</span><div class="bar"><i style="width:' + pct(ts.done, ts.total) + '%"></i></div></div></div>';
      h += '<section class="block"><div class="grid cols-3"><div class="card"><span class="tag core">Core</span><h3 style="margin-top:8px">One shared foundation</h3><p class="muted">Security+ covers the ground both tracks stand on: threats, controls, risk, governance. You study it once and it serves both.</p></div><div class="card"><span class="tag blue">Blue Team</span><h3 style="margin-top:8px">Skills that get the first job</h3><p class="muted">SOC roles hire juniors in volume. Hands-on log analysis, SIEM and incident response make you employable fastest.</p></div><div class="card"><span class="tag grc">GRC</span><h3 style="margin-top:8px">The layer that sets you apart</h3><p class="muted">A defender who can map an alert to an ISO 27001 control or a CBN requirement is rare, and that is the path into risk, audit and leadership roles.</p></div></div></section>';
      rm.phases.forEach(function (p) {
        var pd = p.tasks.filter(function (t) { return S.tasks[t.id] && S.tasks[t.id].done; }).length;
        h += '<section class="phase" id="' + p.id + '"><div class="phase-head"><h2>Phase ' + p.id.slice(1) + ' · ' + esc(p.title) + '</h2><span class="when">' + esc(p.when) + '</span><span class="tag ' + p.track + '">' + p.track + '</span><span class="count-pill">' + pd + ' / ' + p.tasks.length + '</span></div>';
        h += '<p class="muted"><strong>Goal:</strong> ' + esc(p.goal) + '</p><div class="prose muted">' + p.why + '</div>';
        h += '<ul class="tasks">';
        p.tasks.forEach(function (t) {
          var done = S.tasks[t.id] && S.tasks[t.id].done;
          h += '<li class="task' + (done ? ' done' : '') + '" id="' + t.id + '"><div class="task-head"><input type="checkbox" data-task="' + t.id + '" id="cb-' + t.id + '"' + (done ? ' checked' : '') + ' aria-label="Mark done"><label class="t" for="cb-' + t.id + '">' + esc(t.title) + (done && S.tasks[t.id].doneAt ? ' <span class="conf muted mono" style="font-size:12px">✓ ' + fmtShort(S.tasks[t.id].doneAt) + '</span>' : '') + '</label><button class="task-toggle" data-toggle="' + t.id + '" aria-expanded="false">details ▾</button></div>';
          h += '<div class="task-body" hidden><div><h4>Why</h4><p>' + esc(t.why) + '</p></div>';
          if (t.how && t.how.length) { h += '<div><h4>How</h4><ol>'; t.how.forEach(function (s) { h += '<li>' + esc(s) + '</li>'; }); h += '</ol></div>'; }
          if (t.resources && t.resources.length) { h += '<div><h4>Resources</h4><ul>'; t.resources.forEach(function (r) { h += '<li><a href="' + esc(r.url) + '"' + (r.url.charAt(0) === '#' ? '' : ' target="_blank" rel="noopener"') + '>' + esc(r.label) + '</a></li>'; }); h += '</ul></div>'; }
          h += '<div class="done-when"><h4>Done when</h4><p>' + esc(t.doneWhen) + '</p></div></div></li>';
        });
        h += '</ul>';
        (p.certs || []).forEach(function (c) { h += '<div class="cert ' + c.track + '"><b>' + esc(c.name) + '</b><span>' + esc(c.note) + '</span></div>'; });
        h += '</section>';
      });
      h += '<section class="block"><h2>Certifications at a glance</h2><div class="tablewrap"><table><thead><tr><th>Cert</th><th>Track</th><th>When</th><th>Why</th></tr></thead><tbody>';
      rm.certTable.forEach(function (c) { h += '<tr><td>' + esc(c.cert) + '</td><td><span class="tag ' + c.track + '">' + c.track + '</span></td><td>' + esc(c.when) + '</td><td>' + esc(c.why) + '</td></tr>'; });
      h += '</tbody></table></div></section>';
      h += '<section class="block"><h2>Where it leads</h2><div class="later">'; rm.later.forEach(function (l) { h += '<div><h3>' + esc(l.title) + '</h3><span>' + esc(l.roles) + '</span></div>'; }); h += '</div></section>';
      h += '<section class="block"><h2>Keep in mind</h2><ul class="plain">'; rm.keepInMind.forEach(function (k) { h += '<li><strong>' + esc(k.head) + '</strong> ' + esc(k.body) + '</li>'; }); h += '</ul></section>';
      h += '</div>';
      return h;
    });
  }

  function renderSecplus() {
    return getAllDomains().then(function (domains) {
      var vids = flatVideos(domains); var done = vids.filter(function (x) { return vstate(x.v.id).status === 'done'; }).length;
      var review = vids.filter(function (x) { return needsReview(x.v.id); });
      var h = '<div class="page"><div class="page-head"><span class="eyebrow">CompTIA Security+ SY0-701 · Professor Messer companion</span><h1>Study notes for every video</h1><p class="lede">Open the note for the video you are watching. Each one adds the depth Messer skips, then checks you with three exam-style questions. Mark your status and confidence as you go; anything shaky lands on your review list.</p>';
      h += '<div class="progress"><span>' + done + ' / ' + vids.length + ' videos done</span><div class="bar"><i style="width:' + pct(done, vids.length) + '%"></i></div></div>';
      h += '<div class="btn-row"><a class="btn ghost small" href="https://www.professormesser.com/security-plus/sy0-701/sy0-701-video/sy0-701-comptia-security-plus-course/" target="_blank" rel="noopener">Open Messer\'s course ↗</a><input class="searchbox" type="search" id="vsearch" placeholder="Search videos and key terms…" aria-label="Search videos"></div></div>';
      h += '<div id="search-results" hidden></div>';
      h += '<section class="block"><div class="domains">'; domains.forEach(function (d) { h += domainRow(d); }); h += '</div></section>';
      h += '<section class="block"><h2>How to use this with the videos</h2><div class="card prose"><ol><li>Play the Messer video. Read the <strong>summary</strong> first so you know what to listen for.</li><li>After the video, read the <strong>deep dive</strong> slowly. Pause on anything that contradicts what you assumed.</li><li>Cover the <strong>key terms</strong> and try to define each from memory.</li><li>Take the 3-question <strong>self-check</strong> without notes.</li><li>Set your status and a <strong>confidence</strong> rating. Be honest: a 2 today saves you a failed exam later.</li><li>Write one line in <strong>your notes</strong> that connects the topic to a job task or a Nigerian regulation.</li></ol></div></section>';
      if (review.length) { h += '<section class="block"><h2>Review list (' + review.length + ')</h2><div class="videos">'; review.forEach(function (x) { h += videoRow(x.d, x.v, x.o); }); h += '</div></section>'; }
      h += '</div>';
      view._domains = domains;
      return h;
    });
  }

  function renderDomain(id) {
    return getDomain(id).then(function (d) {
      var s = domainStats(d);
      var h = '<div class="page"><div class="page-head"><div class="crumbs"><a href="#/secplus">Security+</a><span>/</span><span>Domain ' + d.number + '</span></div><span class="eyebrow">Domain ' + d.number + ' · ' + d.weight + '% of the exam</span><h1>' + esc(d.title) + '</h1>';
      h += '<div class="progress"><span>' + s.done + ' / ' + s.total + ' done' + (s.review ? ' · ' + s.review + ' to review' : '') + '</span><div class="bar"><i style="width:' + pct(s.done, s.total) + '%"></i></div></div>';
      if (d.intro) h += '<div class="prose muted">' + d.intro + '</div>';
      h += '</div>';
      d.objectives.forEach(function (o) {
        h += '<section class="objective"><h3><span class="oid">' + esc(o.id) + '</span><span>' + esc(o.title) + '</span></h3><ul class="videos">';
        o.videos.forEach(function (v) { h += '<li>' + videoRow(d, v, null) + '</li>'; });
        h += '</ul></section>';
      });
      h += '</div>';
      return h;
    });
  }

  function renderVideo(did, vid) {
    return getAllDomains().then(function (domains) {
      var all = flatVideos(domains); var idx = -1;
      all.forEach(function (x, i) { if (x.d.id === did && x.v.id === vid) idx = i; });
      if (idx < 0) throw new Error('Video not found');
      var x = all[idx], d = x.d, o = x.o, v = x.v, st = vstate(v.id);
      var prev = all[idx - 1], next = all[idx + 1];
      var h = '<div class="page"><div class="page-head"><div class="crumbs"><a href="#/secplus">Security+</a><span>/</span><a href="#/secplus/' + d.id + '">Domain ' + d.number + '</a><span>/</span><span>' + esc(o.id) + '</span></div>';
      h += '<span class="eyebrow">' + esc(o.id) + ' · ' + esc(o.title) + '</span><h1>' + esc(v.title) + '</h1><p class="lede">' + esc(v.summary) + '</p>';
      h += '<div class="btn-row"><a class="btn small" href="' + ytSearch(v.title) + '" target="_blank" rel="noopener">Find this video on YouTube ↗</a><span class="muted" style="font-size:13px">Messer\'s SY0-701 playlist; search opens in a new tab.</span></div></div>';
      h += '<div class="video-layout"><div class="page" style="gap:28px">';
      h += '<section class="block"><h2>Deep dive</h2><div class="prose">' + v.deepDive + '</div></section>';
      if (v.keyTerms && v.keyTerms.length) { h += '<section class="block"><h2>Key terms</h2><dl class="terms card">'; v.keyTerms.forEach(function (t) { h += '<dt>' + esc(t.term) + '</dt><dd>' + esc(t.def) + '</dd>'; }); h += '</dl></section>'; }
      if (v.examTips && v.examTips.length) { h += '<section class="block"><h2>Exam tips</h2><ul class="tips card">'; v.examTips.forEach(function (t) { h += '<li>' + esc(t) + '</li>'; }); h += '</ul></section>'; }
      if (v.realWorld) h += '<section class="block"><h2>On the job</h2><div class="prose card">' + v.realWorld + '</div></section>';
      if (v.quiz && v.quiz.length) {
        h += '<section class="block"><h2>Self-check</h2><form class="quiz" id="quiz" data-video="' + esc(v.id) + '">';
        v.quiz.forEach(function (q, qi) {
          h += '<div class="q" data-answer="' + q.answer + '"><strong>' + (qi + 1) + '. ' + esc(q.q) + '</strong><div class="opts">';
          q.options.forEach(function (op, oi) { h += '<label><input type="radio" name="q' + qi + '" value="' + oi + '"><span>' + esc(op) + '</span></label>'; });
          h += '</div><div class="explain" hidden>' + esc(q.explain) + '</div></div>';
        });
        h += '<div class="btn-row"><button class="btn" type="submit">Check answers</button><span class="muted" id="quiz-result">' + (st.quizBest !== null && st.quizBest !== undefined ? 'Best so far: ' + st.quizBest + '/' + v.quiz.length : '') + '</span></div></form></section>';
      }
      h += '<section class="block"><h2>Your notes</h2><textarea id="vnotes" placeholder="One line that connects this to a job task, a lab, or a Nigerian regulation…">' + esc(st.notes) + '</textarea><span class="muted" style="font-size:13px">Saved automatically.</span></section>';
      h += '<div class="pager">' + (prev ? '<a href="#/secplus/' + prev.d.id + '/' + prev.v.id + '">← ' + esc(prev.v.title) + '</a>' : '<span></span>') + (next ? '<a href="#/secplus/' + next.d.id + '/' + next.v.id + '">' + esc(next.v.title) + ' →</a>' : '<span></span>') + '</div>';
      h += '</div>';
      // status side box
      h += '<aside class="card status-box"><div><span class="eyebrow">Status</span><div class="seg" role="group" aria-label="Status" style="margin-top:8px" id="vstatus">';
      ['todo', 'watching', 'done', 'review'].forEach(function (s) { h += '<button type="button" data-v="' + s + '" aria-pressed="' + (st.status === s) + '">' + statusLabel(s) + '</button>'; });
      h += '</div></div><div><span class="eyebrow">Confidence</span><div class="stars" id="vconf" role="group" aria-label="Confidence 1 to 5">';
      for (var i = 1; i <= 5; i++) h += '<button type="button" data-c="' + i + '" class="' + (st.confidence >= i ? 'on' : '') + '" aria-label="' + i + ' of 5">★</button>';
      h += '</div><span class="muted" style="font-size:13px">1 = lost, 3 = could explain it, 5 = could teach it</span></div>';
      h += '<div><span class="eyebrow">Log study time</span><form id="quicklog" class="grid" style="grid-template-columns:1fr auto;gap:8px;margin-top:8px"><input type="number" min="5" step="5" value="20" aria-label="Minutes" id="ql-min"><button class="btn small" type="submit">+ min</button></form></div>';
      if (st.doneAt) h += '<span class="muted" style="font-size:13px">Done on ' + fmtDate(st.doneAt) + '</span>';
      h += '</aside></div></div>';
      view._video = { d: d, v: v };
      return h;
    });
  }

  function renderLog() {
    var wk = isoKey(weekStart(new Date())); var goal = +S.settings.weeklyHours || 12;
    var h = '<div class="page"><div class="page-head"><span class="eyebrow">Accountability</span><h1>Study log</h1><p class="lede">Log every session, even 15 minutes. The dashboard uses this for your weekly goal and streak. Be honest: the log is for you.</p>';
    h += '<div class="progress"><span>This week: ' + hrs(minutesInWeek(wk)) + 'h of ' + goal + 'h</span><div class="bar"><i style="width:' + Math.min(100, pct(minutesInWeek(wk), goal * 60)) + '%"></i></div></div></div>';
    h += '<section class="block card"><form id="logform" class="grid cols-4"><label class="field">Date<input type="date" name="date" value="' + today() + '" required max="' + today() + '"></label><label class="field">Minutes<input type="number" name="minutes" min="5" step="5" value="60" required></label><label class="field">Area<select name="area"><option value="secplus">Security+</option><option value="lab">Home lab</option><option value="thm">TryHackMe / LetsDefend</option><option value="grc">GRC reading</option><option value="portfolio">Portfolio / writing</option><option value="jobs">Job hunt</option><option value="other">Other</option></select></label><label class="field">What did you do?<input name="note" placeholder="e.g. Domain 2 videos 2.3, built Wazuh rule" maxlength="160"></label><div><button class="btn" type="submit">Add session</button></div></form></section>';
    h += '<section class="block"><h2>Practice exam scores</h2><div class="card"><form id="examform" class="grid cols-4"><label class="field">Date<input type="date" name="date" value="' + today() + '" max="' + today() + '" required></label><label class="field">Score %<input type="number" name="score" min="0" max="100" required></label><label class="field">Which<input name="label" placeholder="Dion #1" maxlength="40"></label><div><button class="btn ghost" type="submit">Record score</button></div></form>';
    if (S.exams.length) { h += '<div class="list" style="margin-top:12px">'; S.exams.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (e) { h += '<div class="row"><span class="d">' + fmtShort(e.date) + '</span><span><strong>' + e.score + '%</strong> ' + esc(e.label || '') + (e.score >= 85 ? ' <span class="tag done">Ready</span>' : '') + '</span><button class="x" data-del-exam="' + e.id + '" aria-label="Delete">×</button></div>'; }); h += '</div>'; }
    else h += '<p class="muted" style="margin-top:10px;font-size:14px">Book the exam when two consecutive scores are 85% or higher.</p>';
    h += '</div></section>';
    h += '<section class="block"><h2>Sessions</h2>';
    if (!S.sessions.length) h += '<div class="empty">No sessions yet. Log the first one above.</div>';
    else {
      var byWeek = {}; S.sessions.forEach(function (s) { var k = weekKeyOf(s.date); (byWeek[k] = byWeek[k] || []).push(s); });
      Object.keys(byWeek).sort().reverse().forEach(function (k) {
        var list = byWeek[k].sort(function (a, b) { return a.date < b.date ? 1 : -1; }); var tot = list.reduce(function (a, s) { return a + (+s.minutes || 0); }, 0);
        h += '<div class="week-head"><span>Week of ' + fmtDate(k) + '</span><span>' + hrs(tot) + 'h' + (tot >= goal * 60 ? ' ✓' : '') + '</span></div><div class="list">';
        list.forEach(function (s) { h += '<div class="row"><span class="d">' + fmtShort(s.date) + ' · ' + s.minutes + 'm</span><span><span class="tag todo">' + esc(areaLabel(s.area)) + '</span> ' + esc(s.note || '') + '</span><button class="x" data-del-session="' + s.id + '" aria-label="Delete">×</button></div>'; });
        h += '</div>';
      });
    }
    h += '</section></div>';
    return Promise.resolve(h);
  }
  function areaLabel(a) { return { secplus: 'Security+', lab: 'Lab', thm: 'Practice', grc: 'GRC', portfolio: 'Portfolio', jobs: 'Jobs', other: 'Other' }[a] || a; }

  function renderCheckin() {
    var lc = lastCheckinDays();
    var h = '<div class="page"><div class="page-head"><span class="eyebrow">Accountability</span><h1>Weekly check-in</h1><p class="lede">Every Sunday, five minutes. Three questions. This is the habit that keeps a 12-month plan alive past month two.</p>';
    if (lc !== null) h += '<p class="muted mono" style="font-size:13px">Last check-in: ' + lc + ' days ago.</p>';
    h += '</div>';
    h += '<section class="block card"><form id="checkinform" class="grid"><label class="field">Date<input type="date" name="date" value="' + today() + '" max="' + today() + '" required style="max-width:200px"></label><label class="field">What went well this week?<textarea name="wentWell" required placeholder="Finished Domain 1, built the DC…"></textarea></label><label class="field">What blocked you, or what did you avoid?<textarea name="blocked" placeholder="NYSC CDS ate Thursday; kept skipping the Wireshark task…"></textarea></label><label class="field">What exactly will you do next week? (tasks, hours, days)<textarea name="nextWeek" required placeholder="Mon/Wed/Fri 7–9pm: Domain 2 videos 2.1–2.3. Sat: 3h TryHackMe."></textarea></label><div><button class="btn" type="submit">Save check-in</button></div></form></section>';
    h += '<section class="block"><h2>Past check-ins</h2>';
    if (!S.checkins.length) h += '<div class="empty">None yet.</div>';
    else { h += '<div class="grid">'; S.checkins.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (c) { h += '<div class="card checkin"><h4><span>' + fmtDate(c.date) + '</span><button class="x" data-del-checkin="' + c.id + '" aria-label="Delete" style="background:none;border:0;color:var(--muted);cursor:pointer">×</button></h4><dl><dt>Went well</dt><dd>' + esc(c.wentWell) + '</dd>' + (c.blocked ? '<dt>Blocked</dt><dd>' + esc(c.blocked) + '</dd>' : '') + '<dt>Next week</dt><dd>' + esc(c.nextWeek) + '</dd></dl></div>'; }); h += '</div>'; }
    h += '</section></div>';
    return Promise.resolve(h);
  }

  function renderSettings() {
    var st = S.settings;
    var h = '<div class="page"><div class="page-head"><span class="eyebrow">Settings</span><h1>Your plan</h1><p class="lede">These dates drive the dashboard: which phase you are in, how many days to the exam, and whether you are on pace.</p></div>';
    h += '<section class="block card"><form id="settingsform" class="grid cols-2"><label class="field">Your name<input name="name" value="' + esc(st.name) + '" placeholder="Optional"></label><label class="field">Weekly hours goal<input type="number" name="weeklyHours" min="1" max="60" value="' + esc(st.weeklyHours) + '"></label><label class="field">Plan start date<input type="date" name="startDate" value="' + esc(st.startDate) + '"></label><label class="field">Security+ exam date<input type="date" name="examDate" value="' + esc(st.examDate) + '"></label><div><button class="btn" type="submit">Save</button></div></form></section>';
    h += '<section class="block"><h2>Backup</h2><div class="card grid" style="gap:12px"><p class="muted">Everything is stored in this browser only. Export a backup before clearing browser data or switching devices, then import it on the other side.</p><div class="btn-row"><button class="btn ghost" id="export">Download backup (JSON)</button><label class="btn ghost" for="import" style="cursor:pointer">Import backup</label><input type="file" id="import" accept="application/json" hidden></div></div></section>';
    h += '<section class="block"><h2>Danger zone</h2><div class="card grid" style="gap:12px"><p class="muted">Clears every tick, rating, note, session and check-in on this device.</p><div class="btn-row"><button class="btn danger" id="reset">Reset all progress</button><span id="reset-confirm" hidden><button class="btn danger" id="reset-yes">Yes, wipe it</button> <button class="btn ghost" id="reset-no">Cancel</button></span></div></div></section>';
    h += '<section class="block"><h2>About</h2><div class="card prose muted" style="font-size:14px"><p>Built for a Blue Team + GRC path into Nigerian banks, fintechs and advisory. Video titles follow Professor Messer\'s free SY0-701 course; the notes, quizzes and roadmap are original study material and are not affiliated with Professor Messer or CompTIA.</p><p>Sources: CompTIA SY0-701 exam objectives · Professor Messer SY0-701 course · CBN Risk-Based Cybersecurity Framework for DMBs and PSBs · Nigeria Data Protection Act 2023 · NIST CSF 2.0 · ISO/IEC 27001:2022.</p></div></section></div>';
    return Promise.resolve(h);
  }

  /* ---------- event binding ---------- */
  function bind() {
    // roadmap
    $$('input[data-task]').forEach(function (cb) { cb.addEventListener('change', function () { S.tasks[cb.dataset.task] = { done: cb.checked, doneAt: cb.checked ? today() : null }; save(); cb.closest('.task').classList.toggle('done', cb.checked); toast(cb.checked ? 'Task done' : 'Task reopened'); }); });
    $$('button[data-toggle]').forEach(function (b) { b.addEventListener('click', function () { var body = b.closest('.task').querySelector('.task-body'); body.hidden = !body.hidden; b.setAttribute('aria-expanded', String(!body.hidden)); b.textContent = body.hidden ? 'details ▾' : 'hide ▴'; }); });
    if (location.hash.indexOf('#/roadmap#') === 0) { var tid = location.hash.split('#')[2]; var el = document.getElementById(tid); if (el) { el.scrollIntoView({ block: 'center' }); var tb = el.querySelector('button[data-toggle]'); if (tb) tb.click(); } }

    // video page
    var vs = $('#vstatus');
    if (vs && view._video) {
      var vid = view._video.v.id;
      $$('button', vs).forEach(function (b) { b.addEventListener('click', function () { var s = b.dataset.v; setV(vid, { status: s, doneAt: s === 'done' ? (vstate(vid).doneAt || today()) : vstate(vid).doneAt }); $$('button', vs).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); toast(statusLabel(s)); }); });
      var vc = $('#vconf');
      $$('button', vc).forEach(function (b) { b.addEventListener('click', function () { var c = +b.dataset.c; if (vstate(vid).confidence === c) c = 0; setV(vid, { confidence: c }); $$('button', vc).forEach(function (x) { x.classList.toggle('on', +x.dataset.c <= c); }); toast(c ? 'Confidence ' + c + '/5' : 'Confidence cleared'); }); });
      var notes = $('#vnotes'); var nt;
      notes.addEventListener('input', function () { clearTimeout(nt); nt = setTimeout(function () { setV(vid, { notes: notes.value }); }, 400); });
      var ql = $('#quicklog');
      ql.addEventListener('submit', function (e) { e.preventDefault(); var m = +$('#ql-min').value || 0; if (m <= 0) return; S.sessions.push({ id: uid(), date: today(), minutes: m, area: 'secplus', note: view._video.v.title }); save(); toast(m + ' min logged'); });
      var qz = $('#quiz');
      if (qz) qz.addEventListener('submit', function (e) {
        e.preventDefault(); var qs = $$('.q', qz); var score = 0, answered = 0;
        qs.forEach(function (q) { var sel = q.querySelector('input:checked'); q.classList.remove('correct', 'wrong'); if (!sel) return; answered++; var ok = +sel.value === +q.dataset.answer; if (ok) score++; q.classList.add(ok ? 'correct' : 'wrong'); q.querySelector('.explain').hidden = false; });
        if (answered < qs.length) { $('#quiz-result').textContent = 'Answer all ' + qs.length + ' questions first.'; return; }
        var best = vstate(vid).quizBest; var nb = (best === null || best === undefined) ? score : Math.max(best, score);
        setV(vid, { quizBest: nb, quizTotal: qs.length, quizAt: today() });
        $('#quiz-result').textContent = 'You scored ' + score + '/' + qs.length + (score === qs.length ? '. Solid.' : '. Re-read the explanations, then retry.') + ' Best: ' + nb + '/' + qs.length;
        toast(score + '/' + qs.length);
      });
    }

    // search
    var sb = $('#vsearch');
    if (sb && view._domains) {
      var all = flatVideos(view._domains); var res = $('#search-results');
      sb.addEventListener('input', function () {
        var q = sb.value.trim().toLowerCase(); if (q.length < 2) { res.hidden = true; return; }
        var hits = all.filter(function (x) { return x.v.title.toLowerCase().indexOf(q) >= 0 || (x.v.keyTerms || []).some(function (t) { return t.term.toLowerCase().indexOf(q) >= 0; }) || x.o.title.toLowerCase().indexOf(q) >= 0; }).slice(0, 20);
        res.hidden = false; res.innerHTML = '<section class="block"><h2>' + hits.length + ' result' + (hits.length === 1 ? '' : 's') + '</h2><div class="videos">' + (hits.map(function (x) { return videoRow(x.d, x.v, x.o); }).join('') || '<div class="empty">Nothing matched.</div>') + '</div></section>';
      });
    }

    // log
    var lf = $('#logform');
    if (lf) lf.addEventListener('submit', function (e) { e.preventDefault(); var f = new FormData(lf); S.sessions.push({ id: uid(), date: f.get('date'), minutes: +f.get('minutes'), area: f.get('area'), note: (f.get('note') || '').trim() }); save(); toast('Session logged'); route(); });
    var ef = $('#examform');
    if (ef) ef.addEventListener('submit', function (e) { e.preventDefault(); var f = new FormData(ef); S.exams.push({ id: uid(), date: f.get('date'), score: +f.get('score'), label: (f.get('label') || '').trim() }); save(); toast('Score recorded'); route(); });
    $$('button[data-del-session]').forEach(function (b) { b.addEventListener('click', function () { S.sessions = S.sessions.filter(function (s) { return s.id !== b.dataset.delSession; }); save(); route(); }); });
    $$('button[data-del-exam]').forEach(function (b) { b.addEventListener('click', function () { S.exams = S.exams.filter(function (s) { return s.id !== b.dataset.delExam; }); save(); route(); }); });

    // check-in
    var cf = $('#checkinform');
    if (cf) cf.addEventListener('submit', function (e) { e.preventDefault(); var f = new FormData(cf); S.checkins.push({ id: uid(), date: f.get('date'), wentWell: f.get('wentWell').trim(), blocked: (f.get('blocked') || '').trim(), nextWeek: f.get('nextWeek').trim() }); save(); toast('Check-in saved'); route(); });
    $$('button[data-del-checkin]').forEach(function (b) { b.addEventListener('click', function () { S.checkins = S.checkins.filter(function (c) { return c.id !== b.dataset.delCheckin; }); save(); route(); }); });

    // settings
    var sf = $('#settingsform');
    if (sf) sf.addEventListener('submit', function (e) { e.preventDefault(); var f = new FormData(sf); S.settings = { name: (f.get('name') || '').trim(), weeklyHours: +f.get('weeklyHours') || 12, startDate: f.get('startDate') || '', examDate: f.get('examDate') || '' }; save(); toast('Saved'); });
    var ex = $('#export');
    if (ex) ex.addEventListener('click', function () { var blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }); var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'defender-roadmap-backup-' + today() + '.json'; document.body.appendChild(a); a.click(); a.remove(); });
    var im = $('#import');
    if (im) im.addEventListener('change', function () { var f = im.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { try { var d = JSON.parse(r.result); if (!d || typeof d !== 'object' || !d.settings) throw new Error('bad'); S = Object.assign(JSON.parse(JSON.stringify(DEFAULTS)), d); S.settings = Object.assign({}, DEFAULTS.settings, d.settings); save(); toast('Backup imported'); route(); } catch (e) { toast('That file is not a valid backup'); } }; r.readAsText(f); });
    var rs = $('#reset');
    if (rs) { rs.addEventListener('click', function () { $('#reset-confirm').hidden = false; rs.hidden = true; }); $('#reset-no').addEventListener('click', function () { $('#reset-confirm').hidden = true; rs.hidden = false; }); $('#reset-yes').addEventListener('click', function () { S = JSON.parse(JSON.stringify(DEFAULTS)); save(); try { localStorage.removeItem(LEGACY_KEY); } catch (e) {} toast('Progress cleared'); route(); }); }
  }

  /* ---------- boot ---------- */
  route(); updateSide();
})();
