const WEB_APP_URL = "https://workout-tracker.tskeldon19.workers.dev";

// ── State ──
let currentUser = 'tye', currentType = null, currentFeel = 0;
let exerciseCount = 0, setsMap = {}, goalsUser = 'tye', newGoalType = 'checkbox';
let exerciseList = [], cachedLifts = null, cachedWorkouts = null, jsonpCounter = 0;
let prevAchievedIds = {};
const today = new Date().toISOString().split('T')[0];

// ── Init ──
document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
updateMetricOptions();
Promise.all([loadExercises(), fetchGoalsAndSprint()]).then(() => {
  updateSprintDisplays();
  renderLogGoalsPreview();
});

// ══════════════════════════════════════
// CONFETTI
// ══════════════════════════════════════
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ['#c8f562','#f5a623','#ff5f5f','#7F77DD','#5DCAA5','#ffffff','#f0ede8'];
  const pieces = Array.from({length:120}, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height - canvas.height,
    w: Math.random() * 10 + 5,
    h: Math.random() * 6 + 3,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * 360,
    rotSpeed: (Math.random() - 0.5) * 6,
    vx: (Math.random() - 0.5) * 4,
    vy: Math.random() * 4 + 2,
    opacity: 1,
  }));
  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.restore();
      p.x += p.vx; p.y += p.vy; p.rot += p.rotSpeed; p.vy += 0.05;
      if (frame > 80) p.opacity -= 0.015;
    });
    frame++;
    if (frame < 140) requestAnimationFrame(draw);
    else { canvas.style.display = 'none'; ctx.clearRect(0,0,canvas.width,canvas.height); }
  }
  draw();
}

// ══════════════════════════════════════
// JSONP — bypasses CORS for GET requests
// ══════════════════════════════════════
function jsonpFetch(url) {
  return new Promise((resolve, reject) => {
    const cb = '__jcb_' + (jsonpCounter++);
    const timer = setTimeout(() => {
      delete window[cb];
      if (s.parentNode) document.head.removeChild(s);
      reject(new Error('timeout'));
    }, 10000);
    window[cb] = data => {
      clearTimeout(timer);
      delete window[cb];
      if (s.parentNode) document.head.removeChild(s);
      resolve(data);
    };
    const s = document.createElement('script');
    s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    s.onerror = () => { clearTimeout(timer); delete window[cb]; reject(new Error('load error')); };
    document.head.appendChild(s);
  });
}

// ══════════════════════════════════════
// EXERCISE LIST (shared via Sheets)
// ══════════════════════════════════════
async function loadExercises() {
  try {
    const d = await jsonpFetch(WEB_APP_URL + '?action=getExercises');
    if (d.success) exerciseList = d.exercises || [];
  } catch { exerciseList = []; }
}

function addExerciseToSheet(name) {
  if (!name || exerciseList.map(e => e.toLowerCase()).includes(name.toLowerCase())) return;
  exerciseList.push(name);
  const form = document.createElement('form');
  form.method = 'POST'; form.action = WEB_APP_URL;
  form.target = 'submit-frame'; form.style.display = 'none';
  const inp = document.createElement('input');
  inp.type = 'hidden'; inp.name = 'data';
  inp.value = JSON.stringify({ action: 'addExercise', name });
  form.appendChild(inp); document.body.appendChild(form); form.submit();
  setTimeout(() => { if (form.parentNode) document.body.removeChild(form); }, 3000);
}

// ══════════════════════════════════════
// DATA FETCHING
// ══════════════════════════════════════
async function fetchLifts() {
  if (cachedLifts) return cachedLifts;
  try { const d = await jsonpFetch(WEB_APP_URL + '?action=getLifts'); cachedLifts = d.success ? d.rows : []; }
  catch { cachedLifts = []; }
  return cachedLifts;
}

async function fetchWorkouts() {
  if (cachedWorkouts) return cachedWorkouts;
  try { const d = await jsonpFetch(WEB_APP_URL + '?action=getWorkouts'); cachedWorkouts = d.success ? d.rows : []; }
  catch { cachedWorkouts = []; }
  return cachedWorkouts;
}

// ══════════════════════════════════════
// AUTOCOMPLETE
// ══════════════════════════════════════
function acFilter(inputId, listId) {
  const input = document.getElementById(inputId), list = document.getElementById(listId);
  const val = input.value.trim().toLowerCase();
  if (!val) { list.classList.remove('show'); return; }
  const matches = exerciseList.filter(e => e.toLowerCase().includes(val));
  let html = matches.map(e =>
    `<div class="autocomplete-item" onmousedown="acSelect('${inputId}','${listId}','${e.replace(/'/g,"\\'")}')">${e}</div>`
  ).join('');
  if (!exerciseList.some(e => e.toLowerCase() === val))
    html += `<div class="autocomplete-new" onmousedown="acAdd('${inputId}','${listId}')">＋ Add "${input.value.trim()}"</div>`;
  list.innerHTML = html; list.classList.add('show');
}
function acSelect(inputId, listId, val) {
  document.getElementById(inputId).value = val;
  document.getElementById(listId).classList.remove('show');
  // If this is a lift exercise name field, show last session data
  if (inputId.startsWith('exname-')) {
    const exId = inputId.replace('exname-','');
    showLastSession(exId, val);
  }
}
function acHide(listId) { setTimeout(() => { const el = document.getElementById(listId); if (el) el.classList.remove('show'); }, 200); }
function acAdd(inputId, listId) {
  const val = document.getElementById(inputId).value.trim(); if (!val) return;
  addExerciseToSheet(val); document.getElementById(listId).classList.remove('show');
  showToast(`"${val}" added to exercise list`, 'success');
}

async function showLastSession(exId, exerciseName) {
  const el = document.getElementById(`last-session-${exId}`);
  if (!el) return;
  el.textContent = 'Loading last session…';
  el.style.display = 'block';

  try {
    // Fetch lifts if not cached
    if (!cachedLifts) {
      const d = await jsonpFetch(WEB_APP_URL + '?action=getLifts');
      cachedLifts = d.success ? d.rows : [];
    }

    const name = exerciseName.toLowerCase().trim();
    const userLifts = cachedLifts.filter(r =>
      String(r.user || '').toLowerCase() === currentUser &&
      String(r.exercise || '').toLowerCase().trim() === name &&
      parseFloat(r.reps) > 0
    );

    if (!userLifts.length) {
      el.textContent = 'No previous data for this exercise';
      return;
    }

    // Find the most recent session_id
    const sorted = [...userLifts].sort((a, b) => String(b.session_id).localeCompare(String(a.session_id)));
    const lastSessionId = sorted[0].session_id;
    const lastSets = userLifts.filter(r => r.session_id === lastSessionId).sort((a, b) => parseFloat(a.set_num) - parseFloat(b.set_num));

    // Format nicely
    const dateStr = lastSets[0].date ? new Date(lastSets[0].date).toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '';
    const setsText = lastSets.map(s => {
      const rpe = s.rpe ? ` @${s.rpe}` : '';
      return `${s.weight_kg}×${s.reps}${rpe}`;
    }).join('  ·  ');

    el.innerHTML = `<span style="color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Last (${dateStr})</span><br>${setsText}`;
  } catch(e) {
    el.textContent = 'Could not load previous data';
  }
}

// ══════════════════════════════════════
// GOALS DATA
// ══════════════════════════════════════
const DEFAULT_GOALS = { tye: [], nora: [] };
const DEFAULT_SPRINT = { name:'Summer Shred', end:'2026-06-30' };

// Goals and sprint now live in Google Sheets via GoalConfig tab
// We cache them locally for the session after first fetch
let _goalsCache = null;
let _sprintCache = null;

function loadGoals() { return _goalsCache || DEFAULT_GOALS; }
// ── Goals proxy via setup.html iframe ──
// Safari blocks JSONP from script.google.com but allows same-origin iframes
// setup.html handles all sheet communication and reports back via postMessage

let _goalsProxyReady = false;
let _goalsPendingMessages = [];

function ensureGoalsProxy() {
  if (!document.getElementById('goals-proxy')) {
    const iframe = document.createElement('iframe');
    iframe.id = 'goals-proxy';
    iframe.src = 'setup.html?mode=silent';
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    window.addEventListener('message', e => {
      if (e.data && e.data.type === 'goalsLoaded') {
        _goalsProxyReady = true;
        // Load fresh data from localStorage that setup.html just wrote
        try { const lb = localStorage.getItem('goals_backup'); if (lb) _goalsCache = JSON.parse(lb); } catch(err){}
        try { const sb = localStorage.getItem('sprint_backup'); if (sb) _sprintCache = JSON.parse(sb); } catch(err){}
        updateSprintDisplays();
        renderLogGoalsPreview();
        // Flush any pending saves
        _goalsPendingMessages.forEach(msg => iframe.contentWindow.postMessage(msg, '*'));
        _goalsPendingMessages = [];
      }
      if (e.data && e.data.type === 'goalsSaved') {
        // Save confirmed
      }
    });
  }
  return document.getElementById('goals-proxy');
}

function postToProxy(msg) {
  const proxy = ensureGoalsProxy();
  if (_goalsProxyReady) {
    proxy.contentWindow.postMessage(msg, '*');
  } else {
    _goalsPendingMessages.push(msg);
  }
}

function saveGoalsData(g) {
  _goalsCache = g;
  localStorage.setItem('goals_backup', JSON.stringify(g));
  postToProxy({ type:'saveGoals', payload:{ action:'saveGoals', user:'tye', goals: g.tye||[] } });
  setTimeout(() => postToProxy({ type:'saveGoals', payload:{ action:'saveGoals', user:'nora', goals: g.nora||[] } }), 1500);
}
function loadSprint() { return _sprintCache || DEFAULT_SPRINT; }
function saveSprintData(sprint) {
  _sprintCache = sprint;
  localStorage.setItem('sprint_backup', JSON.stringify(sprint));
  postToProxy({ type:'saveSprint', payload:{ action:'saveSprint', sprint } });
}

async function fetchGoalsAndSprint() {
  // Load from localStorage backup immediately so UI renders fast
  try { const lb = localStorage.getItem('goals_backup'); if (lb) _goalsCache = JSON.parse(lb); } catch(e){}
  try { const sb = localStorage.getItem('sprint_backup'); if (sb) _sprintCache = JSON.parse(sb); } catch(e){}
  // Then trigger silent fetch via proxy iframe
  ensureGoalsProxy();
}
function daysLeft(end) { return Math.max(0, Math.ceil((new Date(end) - new Date()) / 86400000)); }

// ══════════════════════════════════════
// SPRINT
// ══════════════════════════════════════
function updateSprintDisplays() {
  const s = loadSprint(), days = daysLeft(s.end);
  const startFmt = s.start ? new Date(s.start).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
  const endFmt = new Date(s.end).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
  document.getElementById('log-sprint-name').textContent = s.name;
  document.getElementById('log-sprint-days').textContent = days + ' days left';
  document.getElementById('sprint-name-display').textContent = s.name;
  document.getElementById('sprint-dates-display').textContent = (startFmt ? startFmt + ' to ' : 'Ends ') + endFmt;
  document.getElementById('sprint-days-display').textContent = days + ' days left';
  document.getElementById('sprint-name-input').value = s.name;
  const si = document.getElementById('sprint-start-input'); if(si) si.value = s.start || '';
  document.getElementById('sprint-end-input').value = s.end;
}

function saveSprint() {
  const name = document.getElementById('sprint-name-input').value || 'Current Sprint';
  const si = document.getElementById('sprint-start-input');
  const start = si ? si.value : '';
  const end = document.getElementById('sprint-end-input').value || DEFAULT_SPRINT.end;
  const sprint = { name, start, end };
  saveSprintData(sprint);
  _sprintCache = sprint;
  updateSprintDisplays(); showToast('Sprint saved!', 'success');
}

function resetGoalsAndSprint() {
  if (!confirm('This will clear all goals and sprint data. Are you sure?')) return;
  _goalsCache = { tye:[], nora:[] };
  _sprintCache = DEFAULT_SPRINT;
  saveGoalsData(_goalsCache);
  saveSprintData(DEFAULT_SPRINT);
  updateSprintDisplays();
  renderGoals();
  renderLogGoalsPreview();
  showToast('Goals and sprint cleared!', 'success');
}

// ══════════════════════════════════════
// GOAL STAT CALCULATION
// ══════════════════════════════════════
async function getBestStat(goal, user) {
  const metric = goal.metric, exercise = (goal.exercise || '').toLowerCase();

  if (['max_reps_at_weight','max_weight','max_reps'].includes(metric)) {
    const lifts = await fetchLifts();
    const ul = lifts.filter(r =>
      String(r.user).toLowerCase() === user &&
      String(r.exercise).toLowerCase() === exercise &&
      parseFloat(r.reps) > 0
    );
    if (!ul.length) return null;
    if (metric === 'max_reps_at_weight') {
      const tw = goal.targetWeight || 0;
      const pool = ul.filter(r => parseFloat(r.weight_kg) >= tw);
      const src = pool.length ? pool : ul;
      const best = src.reduce((a,b) => parseFloat(b.reps) > parseFloat(a.reps) ? b : a);
      return { label:`Best: ${best.weight_kg} lbs × ${best.reps} reps`, raw:parseFloat(best.reps) };
    }
    if (metric === 'max_weight') {
      const best = ul.reduce((a,b) => parseFloat(b.weight_kg) > parseFloat(a.weight_kg) ? b : a);
      return { label:`Best: ${best.weight_kg} lbs`, raw:parseFloat(best.weight_kg) };
    }
    if (metric === 'max_reps') {
      const best = ul.reduce((a,b) => parseFloat(b.reps) > parseFloat(a.reps) ? b : a);
      return { label:`Best: ${best.reps} reps`, raw:parseFloat(best.reps) };
    }
  }

  if (metric === 'best_pace') {
    const workouts = await fetchWorkouts();
    const runs = workouts.filter(r =>
      String(r.user).toLowerCase() === user &&
      (r.type === 'outdoor-run' || r.type === 'indoor-run') &&
      parseFloat(r.pace_min_per_km) > 0
    );
    if (!runs.length) return null;
    const best = runs.reduce((a,b) => parseFloat(b.pace_min_per_km) < parseFloat(a.pace_min_per_km) ? b : a);
    const dec = parseFloat(best.pace_min_per_km), mins = Math.floor(dec), secs = Math.round((dec - mins) * 60);
    return { label:`Best pace: ${mins}:${secs < 10 ? '0' : ''}${secs}/mi`, raw:dec };
  }

  if (metric === 'max_elevation') {
    const workouts = await fetchWorkouts();
    const hikes = workouts.filter(r =>
      String(r.user).toLowerCase() === user && r.type === 'hike' && parseFloat(r.elevation_m) > 0
    );
    if (!hikes.length) return null;
    const best = hikes.reduce((a,b) => parseFloat(b.elevation_m) > parseFloat(a.elevation_m) ? b : a);
    return { label:`Best: ${best.elevation_m} ft elevation`, raw:parseFloat(best.elevation_m) };
  }
  return null;
}

async function getCountProgress(goal, user) {
  const workouts = await fetchWorkouts();
  let rel = workouts.filter(r => String(r.user).toLowerCase() === user && r.type === goal.type);
  if (goal.countFilter && goal.type === 'hike') {
    const me = parseFloat(goal.countFilter) || 0;
    rel = rel.filter(r => parseFloat(r.elevation_m) >= me);
  }
  return rel.length;
}

function isGoalAchievedSync(goal) { return goal.goalType === 'checkbox' && (goal.checked || false); }

async function isGoalAchieved(goal, user) {
  if (goal.goalType === 'checkbox') return goal.checked || false;
  if (goal.goalType === 'count') return (await getCountProgress(goal, user)) >= goal.countTotal;
  if (goal.goalType === 'performance') {
    const stat = await getBestStat(goal, user);
    if (!stat) return false;
    return goal.metric === 'best_pace' ? stat.raw <= goal.targetVal : stat.raw >= goal.targetVal;
  }
  return false;
}

// ══════════════════════════════════════
// SPRINT PROGRESS BAR
// ══════════════════════════════════════
async function updateSprintProgress(user) {
  const goals = loadGoals()[user] || [];
  if (!goals.length) {
    document.getElementById('sprint-prog-fill').style.width = '0%';
    document.getElementById('sprint-prog-label').textContent = '0 / 0 goals';
    return;
  }
  let done = 0;
  for (const g of goals) { if (await isGoalAchieved(g, user)) done++; }
  const pct = Math.round((done / goals.length) * 100);
  document.getElementById('sprint-prog-fill').style.width = pct + '%';
  document.getElementById('sprint-prog-label').textContent = `${done} / ${goals.length} goals complete`;
}

// ══════════════════════════════════════
// NAV
// ══════════════════════════════════════
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.nav-tab')[page === 'log' ? 0 : 1].classList.add('active');
  if (page === 'goals') renderGoals();
  if (page === 'log') renderLogGoalsPreview();
  window.scrollTo({ top:0, behavior:'smooth' });
}

// ══════════════════════════════════════
// LOG PAGE — GOALS PREVIEW
// ══════════════════════════════════════
async function renderLogGoalsPreview() {
  const goals = loadGoals()[currentUser] || [];
  const el = document.getElementById('log-goals-preview');
  if (!goals.length) {
    el.innerHTML = '<div style="font-size:13px;color:var(--hint);padding:4px 0;">No goals set — tap Edit goals.</div>';
    return;
  }

  el.innerHTML = goals.map(g => {
    if (g.goalType === 'checkbox') {
      const done = g.checked || false;
      return `<div class="goal-preview-row ${done ? 'completed' : ''}">
        <span style="font-size:14px;">${done ? '✅' : '⬜'}</span>
        <span class="goal-preview-label ${done ? 'completed' : ''}">${g.label}</span>
        <span class="goal-preview-right ${done ? 'completed' : ''}">${done ? 'Done ✓' : ''}</span>
      </div>`;
    }
    return `<div class="goal-preview-row" id="lpr-${g.id}">
      <span style="font-size:14px;">${g.goalType === 'count' ? '🔢' : '📈'}</span>
      <span class="goal-preview-label" id="lpl-${g.id}">${g.label}</span>
      <span class="goal-preview-right" id="lpv-${g.id}">No data logged</span>
    </div>`;
  }).join('');

  const newlyAchieved = [];
  for (const g of goals) {
    if (g.goalType === 'checkbox') continue;
    const valEl = document.getElementById(`lpv-${g.id}`);
    const rowEl = document.getElementById(`lpr-${g.id}`);
    const lblEl = document.getElementById(`lpl-${g.id}`);
    try {
      let statText = 'No data logged', achieved = false;
      if (g.goalType === 'count') {
        const count = await getCountProgress(g, currentUser);
        statText = `${count}/${g.countTotal} ${g.countUnit}`;
        achieved = count >= g.countTotal;
      } else if (g.goalType === 'performance') {
        const stat = await getBestStat(g, currentUser);
        statText = stat ? stat.label : 'No data logged';
        if (stat) achieved = g.metric === 'best_pace' ? stat.raw <= g.targetVal : stat.raw >= g.targetVal;
      }
      if (valEl) { valEl.textContent = achieved ? statText + ' ✓' : statText; if (achieved) valEl.classList.add('completed'); }
      if (achieved && rowEl) rowEl.classList.add('completed');
      if (achieved && lblEl) lblEl.classList.add('completed');

      if (!prevAchievedIds[currentUser]) prevAchievedIds[currentUser] = {};
      if (achieved && !prevAchievedIds[currentUser][g.id]) newlyAchieved.push(g.id);
      prevAchievedIds[currentUser][g.id] = achieved;
    } catch { if (valEl) valEl.textContent = 'No data logged'; }
  }

  if (newlyAchieved.length) setTimeout(() => launchConfetti(), 300);
  await updateSprintProgress(currentUser);
}

// ══════════════════════════════════════
// GOALS PAGE
// ══════════════════════════════════════
function switchGoalsUser(btn, user) {
  goalsUser = user;
  document.querySelectorAll('.goals-user-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderGoals();
}

const TYPE_LABELS = { lift:'Lift','outdoor-run':'Outdoor run','indoor-run':'Indoor run',hiit:'HIIT',hike:'Hike',class:'Class',sports:'Sports',calisthenics:'Calisthenics',other:'Other' };

async function renderGoals() {
  const goals = loadGoals()[goalsUser] || [];
  const container = document.getElementById('goals-container');
  if (!goals.length) {
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--hint);font-size:14px;">No goals yet. Add one below.</div>';
    return;
  }

  container.innerHTML = goals.map(g => {
    const pill = `<span class="goal-card-type-pill">${TYPE_LABELS[g.type] || g.type}</span>`;
    if (g.goalType === 'checkbox') {
      return `<div class="goal-card ${g.checked ? 'achieved' : ''} fade-in">
        <div class="goal-card-top"><span class="goal-card-label ${g.checked ? 'achieved' : ''}">${g.label}</span>${pill}</div>
        ${g.checked ? '<div class="goal-achieved-banner">🎉 Goal achieved!</div>' : ''}
        <div class="goal-checkbox-row">
          <div class="goal-checkbox ${g.checked ? 'checked' : ''}" onclick="toggleCheckbox('${g.id}')">${g.checked ? '✓' : ''}</div>
          <span class="goal-checkbox-label ${g.checked ? 'checked' : ''}">${g.checked ? 'Achieved! Tap to undo' : 'Mark as achieved'}</span>
        </div>
        <div class="goal-card-actions"><button class="danger-btn" onclick="deleteGoal('${g.id}')">Remove</button></div>
      </div>`;
    }
    if (g.goalType === 'count') {
      return `<div class="goal-card fade-in" id="gc-${g.id}">
        <div class="goal-card-top"><span class="goal-card-label" id="gcl-${g.id}">${g.label}</span>${pill}</div>
        <div class="goal-count-row">
          <div class="goal-count-track"><div class="goal-count-fill" id="cf-${g.id}" style="width:0%;"></div></div>
          <span class="goal-count-label" id="cl-${g.id}">Loading…</span>
        </div>
        <div id="gab-${g.id}"></div>
        <div class="goal-card-actions"><button class="danger-btn" onclick="deleteGoal('${g.id}')">Remove</button></div>
      </div>`;
    }
    if (g.goalType === 'performance') {
      return `<div class="goal-card fade-in" id="gc-${g.id}">
        <div class="goal-card-top"><span class="goal-card-label" id="gcl-${g.id}">${g.label}</span>${pill}</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Target: ${g.targetVal} ${g.targetUnit}${g.exercise ? ' · ' + g.exercise : ''}</div>
        <div class="goal-card-stat empty" id="ps-${g.id}">No data logged yet</div>
        <div id="gab-${g.id}"></div>
        <div class="goal-card-actions"><button class="danger-btn" onclick="deleteGoal('${g.id}')">Remove</button></div>
      </div>`;
    }
    return '';
  }).join('');

  const newlyAchieved = [];
  for (const g of goals) {
    if (g.goalType === 'checkbox') continue;
    try {
      let achieved = false;
      if (g.goalType === 'count') {
        const count = await getCountProgress(g, goalsUser);
        const pct = Math.min(100, Math.round((count / g.countTotal) * 100));
        achieved = count >= g.countTotal;
        const cf = document.getElementById(`cf-${g.id}`), cl = document.getElementById(`cl-${g.id}`);
        if (cf) cf.style.width = pct + '%';
        if (cl) cl.textContent = `${count} / ${g.countTotal} ${g.countUnit}`;
      }
      if (g.goalType === 'performance') {
        const stat = await getBestStat(g, goalsUser);
        const ps = document.getElementById(`ps-${g.id}`);
        if (ps) {
          if (stat) {
            ps.textContent = stat.label;
            ps.classList.remove('empty');
            achieved = g.metric === 'best_pace' ? stat.raw <= g.targetVal : stat.raw >= g.targetVal;
          } else {
            ps.textContent = 'No data logged yet';
          }
        }
      }
      const gc = document.getElementById(`gc-${g.id}`);
      const gcl = document.getElementById(`gcl-${g.id}`);
      const gab = document.getElementById(`gab-${g.id}`);
      if (achieved) {
        if (gc) gc.classList.add('achieved');
        if (gcl) gcl.classList.add('achieved');
        if (gab) gab.innerHTML = '<div class="goal-achieved-banner">🎉 Goal achieved!</div>';
      }
      if (!prevAchievedIds[goalsUser]) prevAchievedIds[goalsUser] = {};
      if (achieved && !prevAchievedIds[goalsUser][g.id]) newlyAchieved.push(g.id);
      prevAchievedIds[goalsUser][g.id] = achieved;
    } catch(e) {}
  }
  if (newlyAchieved.length) setTimeout(() => launchConfetti(), 300);
}

function toggleCheckbox(goalId) {
  const goals = loadGoals();
  const goal = goals[goalsUser].find(g => g.id === goalId);
  if (!goal) return;
  const wasChecked = goal.checked;
  goal.checked = !goal.checked;
  saveGoalsData(goals);
  if (!wasChecked) launchConfetti();
  renderGoals();
  renderLogGoalsPreview();
}

function deleteGoal(goalId) {
  const goals = loadGoals();
  goals[goalsUser] = goals[goalsUser].filter(g => g.id !== goalId);
  saveGoalsData(goals);
  renderGoals();
  showToast('Goal removed', '');
}

function selectGoalType(btn, type) {
  newGoalType = type;
  document.querySelectorAll('.goal-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.goal-type-fields').forEach(f => f.classList.remove('show'));
  document.getElementById('gtf-' + type).classList.add('show');
}

function updateMetricOptions() {
  const type = document.getElementById('new-goal-type-perf') ? document.getElementById('new-goal-type-perf').value : 'lift';
  const ms = document.getElementById('new-goal-metric'), ew = document.getElementById('perf-exercise-wrap');
  const tw = document.getElementById('target-weight-wrap');
  if (!ms) return;
  const opts = {
    lift:[['max_reps_at_weight','Max reps at weight'],['max_weight','Max weight lifted'],['max_reps','Max reps (bodyweight)']],
    calisthenics:[['max_reps','Max reps']],
    'outdoor-run':[['best_pace','Best pace (min/mi)']],
    'indoor-run':[['best_pace','Best pace (min/mi)']],
    hike:[['max_elevation','Max elevation (ft)']],
    other:[['max_reps','Max reps'],['max_weight','Max weight']],
  };
  const list = opts[type] || opts.lift;
  ms.innerHTML = list.map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
  if (ew) ew.style.display = (type === 'lift' || type === 'calisthenics') ? '' : 'none';
  if (tw) tw.style.display = ms.value === 'max_reps_at_weight' ? '' : 'none';
  ms.onchange = () => { if (tw) tw.style.display = ms.value === 'max_reps_at_weight' ? '' : 'none'; };
}

function addGoal() {
  const label = document.getElementById('new-goal-label').value.trim();
  if (!label) return showToast('Please enter a goal description', 'error');
  const goals = loadGoals();
  let g = { id: goalsUser[0] + Date.now(), label, goalType: newGoalType };
  if (newGoalType === 'checkbox') {
    g.type = document.getElementById('new-goal-type-cb').value; g.checked = false;
  } else if (newGoalType === 'performance') {
    g.type = document.getElementById('new-goal-type-perf').value;
    g.metric = document.getElementById('new-goal-metric').value;
    g.exercise = document.getElementById('new-goal-exercise').value.trim();
    g.targetVal = parseFloat(document.getElementById('new-goal-target-val').value) || 0;
    g.targetUnit = document.getElementById('new-goal-target-unit').value.trim();
    g.targetWeight = g.metric === 'max_reps_at_weight' ? (parseFloat(document.getElementById('new-goal-target-weight').value) || 0) : 0;
    if (g.exercise) addExerciseToSheet(g.exercise);
  } else if (newGoalType === 'count') {
    g.type = document.getElementById('new-goal-type-count').value;
    g.countTotal = parseFloat(document.getElementById('new-goal-count-total').value) || 1;
    g.countUnit = document.getElementById('new-goal-count-unit').value.trim() || 'times';
    g.countFilter = document.getElementById('new-goal-count-filter').value.trim();
  }
  goals[goalsUser].push(g); saveGoalsData(goals);
  ['new-goal-label','new-goal-target-val','new-goal-target-unit','new-goal-target-weight','new-goal-exercise','new-goal-count-total','new-goal-count-unit','new-goal-count-filter']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderGoals(); showToast('Goal added!', 'success');
}

// ══════════════════════════════════════
// LOG PAGE — WORKOUT TYPE / FEEL
// ══════════════════════════════════════
function selectUser(btn, user) {
  currentUser = user;
  document.querySelectorAll('.user-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderLogGoalsPreview();
}

function selectType(card, type) {
  document.querySelectorAll('.type-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  currentType = type;
  renderDynamic(type);
  document.getElementById('feel-section').style.display = '';
  document.getElementById('submit-wrap').style.display = '';
}

function selectFeel(btn, val) {
  currentFeel = val;
  document.querySelectorAll('.feel-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ══════════════════════════════════════
// DYNAMIC FIELDS
// ══════════════════════════════════════
function fld(label, type, placeholder, id) {
  if (type === 'date') return `<div class="field"><label>${label}</label><input type="date" id="${id}" value="${today}"></div>`;
  return `<div class="field"><label>${label}</label><input type="${type}" id="${id}" placeholder="${placeholder}"${type==='number'?' inputmode="decimal"':''}></div>`;
}
function sel(label, id, options, def='') {
  return `<div class="field"><label>${label}</label><select id="${id}">${options.map(o=>`<option${o===def?' selected':''}>${o}</option>`).join('')}</select></div>`;
}
function acFld(label, inputId, listId, placeholder) {
  return `<div class="field"><label>${label}</label><div class="autocomplete-wrap"><input type="text" id="${inputId}" placeholder="${placeholder}" oninput="acFilter('${inputId}','${listId}')" onblur="acHide('${listId}')" autocomplete="off"><div class="autocomplete-list" id="${listId}"></div></div></div>`;
}

function renderDynamic(type) {
  const area = document.getElementById('dynamic-area');
  exerciseCount = 0; setsMap = {};
  let html = '<div class="section fade-in"><div class="section-head">Session details</div><div class="section-body">';
  html += `<div class="field-group cols-2">${fld('Date','date','','f-date')}${fld('Duration (min)','number','60','f-duration')}</div>`;

  if (type === 'lift') {
    html += '</div></div>';
    html += `<div class="section fade-in"><div class="section-head">Exercises</div><div class="section-body" id="ex-container">${renderExBlock()}</div><button class="add-btn" style="margin:0 16px 16px;" onclick="addExercise()">＋ Add exercise</button></div>`;
    area.innerHTML = html; return;
  }
  if (type === 'hiit') {
    html += `<div class="field-group cols-2">${sel('Format','f-hiit-format',['Tabata','AMRAP','EMOM','Circuit','Bootcamp','Custom'])}${fld('Rounds','number','5','f-rounds')}</div>`;
    html += `<div class="field-group">${fld('Exercises / intervals','text','Burpees x10, Squats x15…','f-hiit-ex')}</div>`;
  }
  if (type === 'outdoor-run' || type === 'indoor-run') {
    html += `<div class="field-group cols-3">${fld('Distance','number','3.1','f-distance')}${sel('Unit','f-unit',['miles','km'],'miles')}${fld('Avg pace','text','8:00','f-pace')}</div>`;
    if (type === 'outdoor-run') {
      html += `<div class="field-group cols-2">${fld('Elevation gain (ft)','number','200','f-elevation')}${fld('Route / location','text','Local trail…','f-route')}</div>`;
      html += `<div class="field-group">${sel('Conditions','f-conditions',['Clear','Cloudy','Rain','Hot','Cold','Windy','Snow'])}</div>`;
    } else {
      html += `<div class="field-group cols-3">${fld('Speed (mph)','number','6.5','f-speed')}${fld('Incline (%)','number','1.0','f-incline')}${fld('Machine / app','text','Peloton…','f-machine')}</div>`;
    }
  }
  if (type === 'hike') {
    html += `<div class="field-group cols-3">${fld('Distance','number','5.0','f-distance')}${sel('Unit','f-unit',['miles','km'],'miles')}${fld('Elevation gain (ft)','number','1500','f-elevation')}</div>`;
    html += `<div class="field-group cols-2">${sel('Difficulty','f-difficulty',['Easy','Moderate','Hard','Very hard'])}${fld('Pack weight (lbs)','number','20','f-pack')}</div>`;
    html += `<div class="field-group">${fld('Trail / location','text','Pemi Loop, NH','f-trail')}</div>`;
  }
  if (type === 'class') {
    html += `<div class="field-group cols-2">${sel('Class type','f-class-type',['Yoga','Pilates','Spin','CrossFit','Boxing','Barre','Zumba','Kickboxing','Other'])}${fld('Studio / instructor','text','CorePower – Alex','f-studio')}</div>`;
  }
  if (type === 'sports') { html += `<div class="field-group">${fld('Sport','text','Basketball, Tennis…','f-sport')}</div>`; }
  if (type === 'calisthenics') {
    html += `<div class="field-group">${acFld('Movement / exercise','f-cal-ac','ac-cal','e.g. Pull ups, Dips…')}</div>`;
    html += `<div class="field-group">${fld('Reps / sets detail','text','Pull ups 14, Dips 20…','f-movements')}</div>`;
  }
  if (type === 'other') { html += `<div class="field-group">${fld('Description','text','What did you do?','f-other')}</div>`; }
  html += '</div></div>';
  area.innerHTML = html;
}

// ══════════════════════════════════════
// LIFT EXERCISE BLOCKS
// ══════════════════════════════════════
function renderExBlock() {
  exerciseCount++;
  const id = exerciseCount; setsMap[id] = 1;
  return `<div class="exercise-block" id="exblock-${id}">
    <div class="exercise-block-head">
      <div class="autocomplete-wrap" style="flex:1;">
        <input class="exercise-name" id="exname-${id}" type="text" placeholder="Exercise name"
          oninput="acFilter('exname-${id}','ac-ex-${id}')" onblur="acHide('ac-ex-${id}')" autocomplete="off">
        <div class="autocomplete-list" id="ac-ex-${id}"></div>
      </div>
      <button class="remove-btn" onclick="removeEx(${id})">✕</button>
    </div>
    <div id="last-session-${id}" style="display:none;padding:8px 12px;font-family:'DM Mono',monospace;font-size:12px;color:var(--accent);background:rgba(200,245,98,0.06);border-bottom:1px solid var(--border);line-height:1.6;"></div>
    <div class="sets-header"><span>Set</span><span>Reps</span><span>Weight</span><span>RPE</span><span></span></div>
    <div id="sets-${id}">${renderSetRow(id,1)}</div>
    <button class="add-btn" style="margin:8px 12px;width:calc(100% - 24px);" onclick="addSet(${id})">＋ Add set</button>
  </div>`;
}

function renderSetRow(exId, n) {
  return `<div class="set-row" id="setrow-${exId}-${n}">
    <span class="set-num">${n}</span>
    <input class="set-input" id="reps-${exId}-${n}" type="number" placeholder="—" inputmode="numeric">
    <input class="set-input" id="weight-${exId}-${n}" type="number" placeholder="—" inputmode="decimal">
    <input class="set-input" id="rpe-${exId}-${n}" type="number" placeholder="—" min="1" max="10" inputmode="numeric">
    <button class="set-del" onclick="removeSet(${exId},${n})">✕</button>
  </div>`;
}

function addExercise() { const c=document.getElementById('ex-container'),d=document.createElement('div'); d.innerHTML=renderExBlock(); c.appendChild(d.firstElementChild); }
function removeEx(id) { const el=document.getElementById(`exblock-${id}`); if(el) el.remove(); }
function addSet(exId) { setsMap[exId]=(setsMap[exId]||0)+1; const n=setsMap[exId]; document.getElementById(`sets-${exId}`).insertAdjacentHTML('beforeend',renderSetRow(exId,n)); }
function removeSet(exId,n) { const el=document.getElementById(`setrow-${exId}-${n}`); if(el) el.remove(); document.getElementById(`sets-${exId}`).querySelectorAll('.set-row').forEach((r,i)=>r.querySelector('.set-num').textContent=i+1); }

// ══════════════════════════════════════
// COLLECT + SUBMIT
// ══════════════════════════════════════
function collectFormData() {
  const g = id => { const el=document.getElementById(id); return el?el.value:''; };
  const n = id => parseFloat(g(id)) || '';
  const base = {
    session_id: Date.now().toString(), timestamp: new Date().toISOString(),
    date: g('f-date') || today, user: currentUser, type: currentType, sprint_id: 'SP001',
    duration_min: n('f-duration'), feel: currentFeel,
    notes: document.getElementById('notes-field')?.value || '',
    distance_km: n('f-distance'), pace_min_per_km: parsePace(g('f-pace')),
    elevation_m: n('f-elevation'), route: g('f-route'), conditions: g('f-conditions'),
    treadmill_speed_kmh: n('f-speed'), incline_pct: n('f-incline'), machine_app: g('f-machine'),
    hiit_format: g('f-hiit-format'), rounds_completed: n('f-rounds'), hiit_exercises: g('f-hiit-ex'),
    difficulty: g('f-difficulty'), max_elevation_m: '', pack_weight_kg: n('f-pack'),
    trail_name: g('f-trail'), class_type: g('f-class-type'), studio_instructor: g('f-studio'),
    sport_name: g('f-sport'), movements: g('f-movements') || g('f-cal-ac'),
    other_description: g('f-other'),
  };
  const sets = [];
  if (currentType === 'lift') {
    document.querySelectorAll('.exercise-block').forEach(block => {
      const idMatch = block.id.match(/exblock-(\d+)/); if (!idMatch) return;
      const exId = idMatch[1], exName = document.getElementById(`exname-${exId}`)?.value?.trim() || 'Unknown';
      if (exName && exName !== 'Unknown') addExerciseToSheet(exName);
      block.querySelectorAll('.set-row').forEach((row, idx) => {
        const rowId = row.id.match(/setrow-\d+-(\d+)/)?.[1] || (idx+1);
        sets.push({
          set_id: `${base.session_id}-${exName}-${idx+1}`,
          session_id: base.session_id, date: base.date, user: currentUser,
          exercise: exName, set_num: idx+1,
          reps: parseFloat(document.getElementById(`reps-${exId}-${rowId}`)?.value) || 0,
          weight_kg: parseFloat(document.getElementById(`weight-${exId}-${rowId}`)?.value) || 0,
          rpe: parseFloat(document.getElementById(`rpe-${exId}-${rowId}`)?.value) || '',
          bodyweight: 'FALSE', notes: '',
        });
      });
    });
  }
  return { workout: base, sets };
}

function parsePace(str) {
  if (!str) return '';
  const p = str.split(':');
  if (p.length !== 2) return parseFloat(str) || '';
  return parseFloat(p[0]) + parseFloat(p[1]) / 60;
}

function handleSubmit() {
  if (!currentType) return showToast('Please select a workout type', 'error');
  const btn = document.getElementById('submit-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Saving…';
  try {
    const formData = collectFormData();
    const form = document.createElement('form');
    form.method = 'POST'; form.action = WEB_APP_URL;
    form.target = 'submit-frame'; form.style.display = 'none';
    const inp = document.createElement('input');
    inp.type = 'hidden'; inp.name = 'data'; inp.value = JSON.stringify(formData);
    form.appendChild(inp); document.body.appendChild(form);
    document.getElementById('submit-frame').onload = function() {
      cachedLifts = null; cachedWorkouts = null;
      showToast('Workout saved! 💪', 'success');
      if (form.parentNode) document.body.removeChild(form);
      setTimeout(() => resetForm(), 1800);
    };
    form.submit();
  } catch(err) {
    showToast('Error saving — check connection', 'error');
    btn.disabled = false; btn.innerHTML = 'Save workout';
  }
}

function resetForm() {
  currentType = null; currentFeel = 0; exerciseCount = 0; setsMap = {};
  document.querySelectorAll('.type-card').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.feel-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('dynamic-area').innerHTML = '';
  document.getElementById('feel-section').style.display = 'none';
  document.getElementById('submit-wrap').style.display = 'none';
  const nf = document.getElementById('notes-field'); if (nf) nf.value = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ══════════════════════════════════════
// TOAST
// ══════════════════════════════════════
function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}
