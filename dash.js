const WEB_APP_URL = "https://workout-tracker.tskeldon19.workers.dev";
const CORRECT_PIN = "0515";
const FEEL = ['','😴','😕','😐','💪','🔥'];
const TYPE_LABELS = { lift:'Lift','outdoor-run':'Outdoor run','indoor-cardio':'Indoor cardio',hiit:'HIIT',hike:'Hike',class:'Class',sports:'Sports',calisthenics:'Calisthenics',swim:'Swim',other:'Other' };
const TYPE_COLORS = {
  lift:{bg:'#1a2e45',tc:'#63B3ED'},'outdoor-run':{bg:'#0d2b22',tc:'#48BB78'},
  'indoor-cardio':{bg:'#0d2b22',tc:'#68D391'},hiit:{bg:'#2d1a10',tc:'#F6AD55'},
  hike:{bg:'#0d2b22',tc:'#5DCAA5'},class:{bg:'#2d1a2d',tc:'#D4537E'},
  sports:{bg:'#2d2410',tc:'#ECC94B'},calisthenics:{bg:'#1a1a3a',tc:'#9F7AEA'},
  swim:{bg:'#0d2b3a',tc:'#63B3ED'},
  other:{bg:'#222',tc:'#888'},
};
const PR_TABS = [
  { key:'lift', label:'🏋️ Lifts' },
  { key:'outdoor-run', label:'🏃 Outdoor run' },
  { key:'indoor-cardio', label:'⏱️ Indoor run' },
  { key:'hike', label:'⛰️ Hikes' },
  { key:'hiit', label:'🔥 HIIT' },
  { key:'class', label:'🧘 Class' },
  { key:'sports', label:'⚽ Sports' },
  { key:'calisthenics', label:'💪 Calisthenics' },
  { key:'swim', label:'🏊 Swim' },
];

// ── State ──
let pinEntry = '';
let dashUser = 'both', prView = 'alltime', goalView = 'sprint', prTab = 'lift', prPerson = 'both';
let logTypeFilter = 'all';
let allLifts = [], allWorkouts = [];
let calYear = new Date().getFullYear(), calMonth = new Date().getMonth();
let jsonpCounter = 0;

// Normalize date strings — sheet stores full ISO timestamps, we need YYYY-MM-DD
// Prefer timestamp field over date field since Sheets converts date cells to UTC midnight
function nd(dateStr) {
  if (!dateStr) return '';
  return String(dateStr).substring(0, 10);
}

// Get the true local date from a workout row
// Uses timestamp if available (accurate), falls back to date field
function rowDate(r) {
  const ts = r.timestamp || r.date || '';
  if (!ts) return '';
  // timestamp is accurate ISO string from JS Date.now() — convert to local date
  const d = new Date(ts);
  // Format as YYYY-MM-DD in local time
  const yr = d.getFullYear();
  const mo = String(d.getMonth()+1).padStart(2,'0');
  const dy = String(d.getDate()).padStart(2,'0');
  return `${yr}-${mo}-${dy}`;
}

// ══════════════════════════════════════
// PIN
// ══════════════════════════════════════
function pinPress(digit) {
  if (pinEntry.length >= 4) return;
  pinEntry += digit;
  updatePinDots();
  if (pinEntry.length === 4) setTimeout(checkPin, 120);
}
function pinClear() { pinEntry = pinEntry.slice(0,-1); updatePinDots(); document.getElementById('pin-error').classList.remove('show'); }
function updatePinDots() {
  for (let i=0;i<4;i++) { const d=document.getElementById('pd'+i); d.classList.toggle('filled',i<pinEntry.length); d.classList.remove('error'); }
}
function checkPin() {
  if (pinEntry === CORRECT_PIN) {
    document.getElementById('pin-screen').style.display='none';
    document.getElementById('dashboard').style.display='block';
    initDashboard();
  } else {
    for (let i=0;i<4;i++) document.getElementById('pd'+i).classList.add('error');
    document.getElementById('pin-error').classList.add('show');
    setTimeout(()=>{ pinEntry=''; updatePinDots(); document.getElementById('pin-error').classList.remove('show'); },1200);
  }
}

// ══════════════════════════════════════
// JSONP
// ══════════════════════════════════════
function jsonpFetch(url) {
  return new Promise((resolve,reject) => {
    const cb='__dcb_'+(jsonpCounter++);
    const timer=setTimeout(()=>{ delete window[cb]; if(s.parentNode) document.head.removeChild(s); reject(new Error('timeout')); },12000);
    window[cb]=data=>{ clearTimeout(timer); delete window[cb]; if(s.parentNode) document.head.removeChild(s); resolve(data); };
    const s=document.createElement('script');
    s.src=url+(url.includes('?')?'&':'?')+'callback='+cb;
    s.onerror=()=>{ clearTimeout(timer); delete window[cb]; reject(new Error('error')); };
    document.head.appendChild(s);
  });
}

async function apiFetch(url) {
  const response = await fetch(url);
  return response.json();
}

// ══════════════════════════════════════
// SPRINT + GOALS (from localStorage)
// ══════════════════════════════════════
const DEFAULT_SPRINT = { name:'Summer Shred', start:'2026-05-01', end:'2026-06-30' };
const DEFAULT_GOALS = { tye: [], nora: [] };

let _goalsCache = null;
let _sprintCache = null;
function loadSprint() { return _sprintCache || DEFAULT_SPRINT; }
function loadGoals() { return _goalsCache || DEFAULT_GOALS; }

async function fetchGoalsAndSprint() {
  // Load from localStorage backup first for instant render
  try { const lb = localStorage.getItem('goals_backup'); if (lb) _goalsCache = JSON.parse(lb); } catch(e){}
  try { const sb = localStorage.getItem('sprint_backup'); if (sb) _sprintCache = JSON.parse(sb); } catch(e){}

  // Also try direct JSONP (works on desktop/Android)
  try {
    const [gd, sd] = await Promise.all([
      apiFetch(WEB_APP_URL+'?action=getGoals'),
      apiFetch(WEB_APP_URL+'?action=getSprint'),
    ]);
    if (gd.success) {
      _goalsCache = { tye: gd.tye||[], nora: gd.nora||[] };
      localStorage.setItem('goals_backup', JSON.stringify(_goalsCache));
    }
    if (sd.success && sd.sprint && sd.sprint.name) {
      _sprintCache = sd.sprint;
      localStorage.setItem('sprint_backup', JSON.stringify(sd.sprint));
    }
  } catch(e) {
    // If JSONP fails (Safari ITP), try loading via proxy iframe
    if (!document.getElementById('dash-goals-proxy')) {
      const iframe = document.createElement('iframe');
      iframe.id = 'dash-goals-proxy';
      iframe.src = 'setup.html?mode=silent';
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      window.addEventListener('message', ev => {
        if (ev.data && ev.data.type === 'goalsLoaded') {
          try { const lb = localStorage.getItem('goals_backup'); if (lb) _goalsCache = JSON.parse(lb); } catch(err){}
          try { const sb = localStorage.getItem('sprint_backup'); if (sb) _sprintCache = JSON.parse(sb); } catch(err){}
          updateSprintBanner();
          renderGoals();
        }
      });
    }
  }
}
function daysLeft(end) { return Math.max(0,Math.ceil((new Date(end)-new Date())/86400000)); }

function sprintStart() {
  const s = loadSprint();
  // Use stored start if available, otherwise fall back to end-60days
  if (s.start) return new Date(s.start);
  const end = new Date(s.end); end.setDate(end.getDate()-60); return end;
}
function sprintEnd() { return new Date(loadSprint().end); }

function isInSprint(dateStr) {
  if (!dateStr) return false;
  const d = new Date(nd(String(dateStr))); d.setHours(0,0,0,0);
  return d >= sprintStart() && d <= sprintEnd();
}

// isInSprintRow uses the accurate timestamp from the row
function isInSprintRow(r) {
  const dateStr = rowDate(r);
  if (!dateStr) return false;
  const d = new Date(dateStr+'T12:00:00'); d.setHours(12,0,0,0);
  return d >= sprintStart() && d <= sprintEnd();
}

// ══════════════════════════════════════
// INIT
// ══════════════════════════════════════
async function initDashboard() {
  document.getElementById('dash-date').textContent = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  buildPRTabs();
  buildLogFilters();

  try {
    const [ld,wd,gd,sd] = await Promise.all([
      apiFetch(WEB_APP_URL+'?action=getLifts'),
      apiFetch(WEB_APP_URL+'?action=getWorkouts'),
      apiFetch(WEB_APP_URL+'?action=getGoals'),
      apiFetch(WEB_APP_URL+'?action=getSprint'),
    ]);
    allLifts = ld.success ? ld.rows : [];
    allWorkouts = wd.success ? wd.rows : [];
    if (gd.success) _goalsCache = { tye: gd.tye||[], nora: gd.nora||[] };
    if (sd.success && sd.sprint && sd.sprint.name) _sprintCache = sd.sprint;
  } catch(e) { allLifts=[]; allWorkouts=[]; }

  updateSprintBanner();
  renderAll();
}

function renderAll() {
  renderMetrics();
  renderGoals();
  renderPRs();
  renderCalendar();
  renderLog();
}

async function refreshData() {
  const btn = document.getElementById('refresh-btn');
  if (btn) { btn.textContent = '↻'; btn.style.opacity = '0.5'; btn.disabled = true; }
  _goalsCache = null; _sprintCache = null;
  try {
    const [ld,wd,gd,sd] = await Promise.all([
      apiFetch(WEB_APP_URL+'?action=getLifts'),
      apiFetch(WEB_APP_URL+'?action=getWorkouts'),
      apiFetch(WEB_APP_URL+'?action=getGoals'),
      apiFetch(WEB_APP_URL+'?action=getSprint'),
    ]);
    allLifts = ld.success ? ld.rows : [];
    allWorkouts = wd.success ? wd.rows : [];
    if (gd.success) _goalsCache = { tye: gd.tye||[], nora: gd.nora||[] };
    if (sd.success && sd.sprint && sd.sprint.name) _sprintCache = sd.sprint;
  } catch(e) {}
  updateSprintBanner();
  renderAll();
  if (btn) { btn.textContent = '↻'; btn.style.opacity = '1'; btn.disabled = false; }
  showToast('Data refreshed', 'success');
}

// ══════════════════════════════════════
// SPRINT BANNER
// ══════════════════════════════════════
function updateSprintBanner() {
  const sprint = loadSprint();
  const days = daysLeft(sprint.end);
  const startFmt = new Date(sprintStart()).toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const endFmt = new Date(sprint.end).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  document.getElementById('db-sprint-name').textContent = sprint.name;
  document.getElementById('db-sprint-sub').textContent = `${startFmt} – ${endFmt} · ${days} days left`;

  const goals = loadGoals();
  const allG = [...(goals.tye||[]),...(goals.nora||[])];
  let done = 0;
  allG.forEach(g => { if (g.goalType==='checkbox'&&g.checked) done++; });
  // For non-checkbox goals we calculate from data
  const nonCb = allG.filter(g=>g.goalType!=='checkbox');
  nonCb.forEach(g => {
    const stat = getGoalStatSync(g, g.owner||'tye', false);
    if (stat.achieved) done++;
  });
  const total = allG.length;
  const pct = total ? Math.round((done/total)*100) : 0;
  document.getElementById('db-sprint-pct').textContent = pct+'%';
  document.getElementById('db-sprint-fill').style.width = pct+'%';
  document.getElementById('db-sprint-label').textContent = `${done} / ${total} goals`;
}

// ══════════════════════════════════════
// USER
// ══════════════════════════════════════
function setUser(btn, user) {
  dashUser = user;
  document.querySelectorAll('.user-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  renderAll();
}

function filterByUser(rows) {
  if (dashUser==='both') return rows;
  return rows.filter(r=>String(r.user||'').toLowerCase()===dashUser);
}

// ══════════════════════════════════════
// METRICS
// ══════════════════════════════════════
function renderMetrics() {
  const workouts = filterByUser(allWorkouts);
  const now = new Date();
  const thisMonth = workouts.filter(r=>{ const d=new Date(rowDate(r)+'T12:00:00'); return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear(); });
  const lastMonth = workouts.filter(r=>{ const d=new Date(rowDate(r)+'T12:00:00'); const lm=new Date(now.getFullYear(),now.getMonth()-1,1); return d.getMonth()===lm.getMonth()&&d.getFullYear()===lm.getFullYear(); });
  const sprintWo = workouts.filter(r=>isInSprintRow(r));
  const totalDur = thisMonth.reduce((s,r)=>s+(parseFloat(r.duration_min)||0),0);
  const streak = calcStreak(dashUser);

  const metrics = [
    { label:'Workouts this month', val:thisMonth.length, sub:deltaStr(thisMonth.length,lastMonth.length,'vs last month') },
    { label:'Sprint sessions', val:sprintWo.length, sub:'workouts during current sprint' },
    { label:'Active hours (month)', val:(totalDur/60).toFixed(1)+'h', sub:'based on logged duration' },
    { label: dashUser==='both' ? 'Joint streak' : (dashUser==='tye'?'Tye':'Nora')+"'s streak", val:streak+' days', sub: dashUser==='both'?'days you both logged':'consecutive days active' },
  ];

  document.getElementById('metrics-row').innerHTML = metrics.map(m=>`
    <div class="metric-card">
      <div class="metric-label">${m.label}</div>
      <div class="metric-val">${m.val}</div>
      <div class="metric-sub">${m.sub}</div>
    </div>`).join('');
}

function deltaStr(curr, prev, label) {
  const diff = curr-prev;
  if (diff>0) return `<span class="up">↑ ${diff} ${label}</span>`;
  if (diff<0) return `<span class="dn">↓ ${Math.abs(diff)} ${label}</span>`;
  return `Same as ${label}`;
}

// Streak: requires BOTH Tye and Nora to have logged that day
function calcStreak(user) {
  // user = 'tye', 'nora', or 'both' (joint — both must log same day)
  const tyeDates = new Set(allWorkouts.filter(r=>String(r.user||'').toLowerCase()==='tye'&&r.date).map(r=>rowDate(r)));
  const noraDates = new Set(allWorkouts.filter(r=>String(r.user||'').toLowerCase()==='nora'&&r.date).map(r=>rowDate(r)));
  let dates;
  if (user==='tye') dates = [...tyeDates].sort().reverse();
  else if (user==='nora') dates = [...noraDates].sort().reverse();
  else dates = [...tyeDates].filter(d=>noraDates.has(d)).sort().reverse();
  if (!dates.length) return 0;
  let streak=0;
  const check = new Date(); check.setHours(0,0,0,0);
  for (const d of dates) {
    const wd=new Date(d+'T12:00:00'); wd.setHours(12,0,0,0);
    const diff=Math.round((check-wd)/86400000);
    if (diff===0||diff===1){ streak++; check.setDate(check.getDate()-1); }
    else break;
  }
  return streak;
}

// ══════════════════════════════════════
// GOALS
// ══════════════════════════════════════
function setGoalView(btn, view) {
  goalView=view;
  document.querySelectorAll('#goals-panel').length;
  btn.closest('.toggle-group').querySelectorAll('.stoggle-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  renderGoals();
}

function getGoalStatSync(goal, user, sprintOnly) {
  const lifts = sprintOnly ? allLifts.filter(r=>isInSprintRow(r)) : allLifts;
  const workouts = sprintOnly ? allWorkouts.filter(r=>isInSprintRow(r)) : allWorkouts;
  const u = (user||'').toLowerCase();

  if (goal.goalType==='checkbox') return { text: goal.checked?'Done ✓':'—', achieved: goal.checked||false };

  if (goal.goalType==='count') {
    let rel = workouts.filter(r=>String(r.user||'').toLowerCase()===u && r.type===goal.type);
    if (goal.countFilter&&goal.type==='hike') { const me=parseFloat(goal.countFilter)||0; rel=rel.filter(r=>parseFloat(r.elevation_m)>=me); }
    const count=rel.length;
    return { text:`${count} / ${goal.countTotal} ${goal.countUnit}`, achieved: count>=goal.countTotal };
  }

  if (goal.goalType==='performance') {
    const metric=goal.metric, exercise=(goal.exercise||'').toLowerCase().trim();
    if (['max_reps_at_weight','max_weight','max_reps'].includes(metric)) {
      const ul=lifts.filter(r=>String(r.user||'').toLowerCase()===u && String(r.exercise||'').toLowerCase().trim()===exercise && parseFloat(r.reps)>0);
      if (!ul.length) return { text:'No data yet', achieved:false };
      if (metric==='max_reps_at_weight') {
        const tw=goal.targetWeight||0;
        const pool=ul.filter(r=>parseFloat(r.weight_kg)>=tw);
        const src=pool.length?pool:ul;
        const best=src.reduce((a,b)=>parseFloat(b.reps)>parseFloat(a.reps)?b:a);
        return { text:`${best.weight_kg} lbs × ${best.reps} reps`, achieved:parseFloat(best.reps)>=goal.targetVal };
      }
      if (metric==='max_weight') {
        const best=ul.reduce((a,b)=>parseFloat(b.weight_kg)>parseFloat(a.weight_kg)?b:a);
        return { text:`${best.weight_kg} lbs`, achieved:parseFloat(best.weight_kg)>=goal.targetVal };
      }
      if (metric==='max_reps') {
        const best=ul.reduce((a,b)=>parseFloat(b.reps)>parseFloat(a.reps)?b:a);
        return { text:`${best.reps} reps`, achieved:parseFloat(best.reps)>=goal.targetVal };
      }
    }
    if (metric==='best_pace') {
      const runs=workouts.filter(r=>String(r.user||'').toLowerCase()===u&&(r.type==='outdoor-run'||r.type==='indoor-cardio')&&parseFloat(r.pace_min_per_km)>0);
      if (!runs.length) return { text:'No data yet', achieved:false };
      const best=runs.reduce((a,b)=>parseFloat(b.pace_min_per_km)<parseFloat(a.pace_min_per_km)?b:a);
      const dec=parseFloat(best.pace_min_per_km),mins=Math.floor(dec),secs=Math.round((dec-mins)*60);
      return { text:`${mins}:${secs<10?'0':''}${secs}/mi`, achieved:dec<=goal.targetVal };
    }
    if (metric==='max_elevation') {
      const hikes=workouts.filter(r=>String(r.user||'').toLowerCase()===u&&r.type==='hike'&&parseFloat(r.elevation_m)>0);
      if (!hikes.length) return { text:'No data yet', achieved:false };
      const best=hikes.reduce((a,b)=>parseFloat(b.elevation_m)>parseFloat(a.elevation_m)?b:a);
      return { text:`${best.elevation_m} ft`, achieved:parseFloat(best.elevation_m)>=goal.targetVal };
    }
  }
  return { text:'—', achieved:false };
}

function renderGoals() {
  const panel = document.getElementById('goals-panel');
  const allGoalsData = loadGoals();
  const sprintOnly = goalView==='sprint';
  const users = dashUser==='both' ? ['tye','nora'] : [dashUser];
  let rows = [];
  users.forEach(u=>{ (allGoalsData[u]||[]).forEach(g=>rows.push({...g,owner:u})); });
  if (!rows.length) { panel.innerHTML='<div class="loading-msg">No goals set yet.</div>'; return; }

  panel.innerHTML = rows.map(g=>{
    const stat = getGoalStatSync(g, g.owner, sprintOnly);
    const achieved = stat.achieved;
    const whoHtml = dashUser==='both' ? `<span class="goal-dash-who ${g.owner}">${g.owner==='tye'?'Tye':'Nora'}</span>` : '';
    return `<div class="goal-dash-row ${achieved?'achieved':''}">
      <span class="goal-dash-icon">${achieved?'✅':g.goalType==='count'?'🔢':g.goalType==='checkbox'?'⬜':'📈'}</span>
      ${whoHtml}
      <span class="goal-dash-label ${achieved?'achieved':''}">${g.label}</span>
      <span class="goal-dash-stat ${achieved?'achieved':''}">${stat.text}</span>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════
// PRs
// ══════════════════════════════════════
function buildPRTabs() {
  document.getElementById('pr-tabs').innerHTML = PR_TABS.map((t,i)=>
    `<button class="pr-tab ${i===0?'active':''}" onclick="setPRTab(this,'${t.key}')">${t.label}</button>`
  ).join('');
  // Set data-u on person buttons
  document.querySelectorAll('.pr-person-btn').forEach(b=>{
    const u=b.textContent.toLowerCase();
    b.setAttribute('data-u',u==='tye'?'tye':u==='nora'?'nora':'both');
  });
}

function setPRView(btn, view) {
  prView=view;
  btn.closest('.toggle-group').querySelectorAll('.stoggle-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  renderPRs();
}
function setPRTab(btn, tab) {
  prTab=tab;
  document.querySelectorAll('.pr-tab').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  renderPRs();
}
function setPRPerson(btn, person) {
  prPerson=person;
  document.querySelectorAll('.pr-person-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  renderPRs();
}

function renderPRs() {
  const panel = document.getElementById('pr-panel');
  const sprintOnly = prView==='sprint';
  const lifts = sprintOnly ? allLifts.filter(r=>isInSprintRow(r)) : allLifts;
  const workouts = sprintOnly ? allWorkouts.filter(r=>isInSprintRow(r)) : allWorkouts;
  const users = prPerson==='both' ? ['tye','nora'] : [prPerson];

  const showWho = prPerson==='both';

  // Helper: who pill
  const whoPill = u => showWho ? `<span class="pr-who-pill ${u}">${u==='tye'?'Tye':'Nora'}</span>` : '';
  const fmtDate = (d, row) => row ? (rowDate(row) ? new Date(rowDate(row)+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '') : (d ? new Date(nd(String(d))+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '');

  if (prTab==='lift') {
    const filtered = lifts.filter(r=>users.includes(String(r.user||'').toLowerCase())&&parseFloat(r.weight_kg)>0);
    const byEx = {};
    filtered.forEach(r=>{ const k=String(r.exercise||'').trim(); if(!k) return; if(!byEx[k]) byEx[k]={}; const u=String(r.user||'').toLowerCase(); if(!byEx[k][u]||parseFloat(r.weight_kg)>parseFloat(byEx[k][u].weight_kg)) byEx[k][u]=r; });
    const exKeys = Object.keys(byEx).sort();
    if (!exKeys.length) { panel.innerHTML='<div class="pr-empty">No lift data yet.</div>'; return; }
    panel.innerHTML = exKeys.map(ex=>{
      return users.map(u=>{
        const r=byEx[ex]?.[u]; if(!r) return '';
        return `<div class="pr-row">
          <span class="pr-name">${ex}</span>
          ${whoPill(u)}
          <span class="pr-val">${r.weight_kg} lbs × ${r.reps} reps</span>
          <span class="pr-badge">PR</span>
          <span class="pr-date">${fmtDate(r.date)}</span>
        </div>`;
      }).join('');
    }).join('');
    return;
  }

  if (prTab==='outdoor-run'||prTab==='indoor-cardio') {
    const runs = workouts.filter(r=>users.includes(String(r.user||'').toLowerCase())&&r.type===prTab&&parseFloat(r.pace_min_per_km)>0);
    if (!runs.length) { panel.innerHTML='<div class="pr-empty">No data yet.</div>'; return; }
    const byUser={};
    runs.forEach(r=>{ const u=String(r.user||'').toLowerCase(); if(!byUser[u]||parseFloat(r.pace_min_per_km)<parseFloat(byUser[u].pace_min_per_km)) byUser[u]=r; });
    panel.innerHTML = users.filter(u=>byUser[u]).map(u=>{
      const r=byUser[u];
      const dec=parseFloat(r.pace_min_per_km),mins=Math.floor(dec),secs=Math.round((dec-mins)*60);
      const dist=r.distance_km?` · ${r.distance_km} mi`:'';
      return `<div class="pr-row">
        <span class="pr-name">Best pace${dist}</span>
        ${whoPill(u)}
        <span class="pr-val">${mins}:${secs<10?'0':''}${secs}/mi</span>
        <span class="pr-badge">PR</span>
        <span class="pr-date">${fmtDate(r.date)}</span>
      </div>`;
    }).join('');
    return;
  }

  if (prTab==='hike') {
    const hikes=workouts.filter(r=>users.includes(String(r.user||'').toLowerCase())&&r.type==='hike'&&parseFloat(r.elevation_m)>0);
    if (!hikes.length) { panel.innerHTML='<div class="pr-empty">No hike data yet.</div>'; return; }
    const byUser={};
    hikes.forEach(r=>{ const u=String(r.user||'').toLowerCase(); if(!byUser[u]||parseFloat(r.elevation_m)>parseFloat(byUser[u].elevation_m)) byUser[u]=r; });
    panel.innerHTML = users.filter(u=>byUser[u]).map(u=>{
      const r=byUser[u];
      const trail=r.trail_name?` · ${r.trail_name}`:'';
      return `<div class="pr-row">
        <span class="pr-name">Best elevation${trail}</span>
        ${whoPill(u)}
        <span class="pr-val">${r.elevation_m} ft</span>
        <span class="pr-badge">PR</span>
        <span class="pr-date">${fmtDate(r.date)}</span>
      </div>`;
    }).join('');
    return;
  }

  if (prTab==='hiit') {
    const hiit=workouts.filter(r=>users.includes(String(r.user||'').toLowerCase())&&r.type==='hiit'&&parseFloat(r.rounds_completed)>0);
    if (!hiit.length) { panel.innerHTML='<div class="pr-empty">No HIIT data yet.</div>'; return; }
    const byUser={};
    hiit.forEach(r=>{ const u=String(r.user||'').toLowerCase(); if(!byUser[u]||parseFloat(r.rounds_completed)>parseFloat(byUser[u].rounds_completed)) byUser[u]=r; });
    panel.innerHTML = users.filter(u=>byUser[u]).map(u=>{
      const r=byUser[u];
      return `<div class="pr-row">
        <span class="pr-name">Best: ${r.hiit_format||'HIIT'}</span>
        ${whoPill(u)}
        <span class="pr-val">${r.rounds_completed} rounds</span>
        <span class="pr-badge">PR</span>
        <span class="pr-date">${fmtDate(r.date)}</span>
      </div>`;
    }).join('');
    return;
  }

  if (prTab==='class') {
    const cls=workouts.filter(r=>users.includes(String(r.user||'').toLowerCase())&&r.type==='class'&&parseFloat(r.duration_min)>0);
    if (!cls.length) { panel.innerHTML='<div class="pr-empty">No class data yet.</div>'; return; }
    const byUser={};
    cls.forEach(r=>{ const u=String(r.user||'').toLowerCase(); if(!byUser[u]||parseFloat(r.duration_min)>parseFloat(byUser[u].duration_min)) byUser[u]=r; });
    panel.innerHTML = users.filter(u=>byUser[u]).map(u=>{
      const r=byUser[u];
      return `<div class="pr-row">
        <span class="pr-name">Longest: ${r.class_type||'Class'}${r.studio_instructor?' · '+r.studio_instructor:''}</span>
        ${whoPill(u)}
        <span class="pr-val">${r.duration_min} min</span>
        <span class="pr-badge">PR</span>
        <span class="pr-date">${fmtDate(r.date)}</span>
      </div>`;
    }).join('');
    return;
  }

  if (prTab==='sports') {
    const sp=workouts.filter(r=>users.includes(String(r.user||'').toLowerCase())&&r.type==='sports'&&parseFloat(r.duration_min)>0);
    if (!sp.length) { panel.innerHTML='<div class="pr-empty">No sports data yet.</div>'; return; }
    const byUserSport={};
    sp.forEach(r=>{ const u=String(r.user||'').toLowerCase(); const k=u+'|'+(r.sport_name||'Sports'); if(!byUserSport[k]||parseFloat(r.duration_min)>parseFloat(byUserSport[k].duration_min)) byUserSport[k]=r; });
    panel.innerHTML = Object.entries(byUserSport).filter(([k])=>users.includes(k.split('|')[0])).map(([k,r])=>{
      const u=k.split('|')[0];
      return `<div class="pr-row">
        <span class="pr-name">Longest: ${r.sport_name||'Sports'}</span>
        ${whoPill(u)}
        <span class="pr-val">${r.duration_min} min</span>
        <span class="pr-badge">PR</span>
        <span class="pr-date">${fmtDate(r.date)}</span>
      </div>`;
    }).join('');
    return;
  }

  if (prTab==='swim') {
    const swims=workouts.filter(r=>users.includes(String(r.user||'').toLowerCase())&&r.type==='swim'&&r.duration_min>0);
    if (!swims.length) { panel.innerHTML='<div class="pr-empty">No swim data yet.</div>'; return; }
    const byUser={};
    swims.forEach(r=>{ const u=String(r.user||'').toLowerCase(); if(!byUser[u]||parseFloat(r.duration_min)>parseFloat(byUser[u].duration_min)) byUser[u]=r; });
    panel.innerHTML = users.filter(u=>byUser[u]).map(u=>{
      const r=byUser[u];
      const dist=r.movements||'';
      return `<div class="pr-row">
        <span class="pr-name">Best: ${dist||'Swim'}</span>
        ${whoPill(u)}
        <span class="pr-val">${r.duration_min} min</span>
        <span class="pr-badge">PR</span>
        <span class="pr-date">${fmtDate(null,r)}</span>
      </div>`;
    }).join('');
    return;
  }

  if (prTab==='calisthenics') {
    const cal=allLifts.filter(r=>users.includes(String(r.user||'').toLowerCase())&&parseFloat(r.reps)>0);
    const filtered2=prView==='sprint'?cal.filter(r=>isInSprint(r.date)):cal;
    if (!filtered2.length) { panel.innerHTML='<div class="pr-empty">No calisthenics data yet.</div>'; return; }
    const byEx2={};
    filtered2.forEach(r=>{ const k=String(r.exercise||'').trim(); if(!k) return; const u=String(r.user||'').toLowerCase(); const key=k+'|'+u; if(!byEx2[key]||parseFloat(r.reps)>parseFloat(byEx2[key].reps)) byEx2[key]=r; });
    const entries=Object.entries(byEx2).filter(([k])=>users.includes(k.split('|')[1]));
    if (!entries.length) { panel.innerHTML='<div class="pr-empty">No calisthenics data yet.</div>'; return; }
    panel.innerHTML = entries.sort((a,b)=>a[0].localeCompare(b[0])).map(([k,r])=>{
      const u=k.split('|')[1];
      return `<div class="pr-row">
        <span class="pr-name">${String(r.exercise)}</span>
        ${whoPill(u)}
        <span class="pr-val">${r.reps} reps</span>
        <span class="pr-badge">PR</span>
        <span class="pr-date">${fmtDate(r.date)}</span>
      </div>`;
    }).join('');
    return;
  }

  panel.innerHTML='<div class="pr-empty">No data yet.</div>';
}

// ══════════════════════════════════════
// CALENDAR
// ══════════════════════════════════════
function calPrev() { calMonth--; if(calMonth<0){calMonth=11;calYear--;} renderCalendar(); }
function calNext() {
  const now=new Date();
  if(calYear>now.getFullYear()||(calYear===now.getFullYear()&&calMonth>=now.getMonth())) return;
  calMonth++; if(calMonth>11){calMonth=0;calYear++;} renderCalendar();
}

function renderCalendar() {
  const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cal-month-label').textContent = `${monthNames[calMonth]} ${calYear}`;

  // Build set of dates per user
  const tyeDates = new Set(allWorkouts.filter(r=>String(r.user||'').toLowerCase()==='tye'&&r.date).map(r=>rowDate(r)));
  const noraDates = new Set(allWorkouts.filter(r=>String(r.user||'').toLowerCase()==='nora'&&r.date).map(r=>rowDate(r)));

  const today = new Date(); today.setHours(0,0,0,0);
  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth+1, 0);
  const startPad = firstDay.getDay(); // 0=Sun

  const grid = document.getElementById('cal-grid');
  let html = '';

  // Empty cells before first day
  for (let i=0;i<startPad;i++) html += '<div class="cal-cell empty"></div>';

  for (let d=1;d<=lastDay.getDate();d++) {
    const dateObj = new Date(calYear, calMonth, d); dateObj.setHours(0,0,0,0);
    const dateStr = dateObj.toISOString().split('T')[0];
    const isToday = dateObj.getTime()===today.getTime();
    const isFuture = dateObj > today;
    const tyeLogged = tyeDates.has(dateStr);
    const noraLogged = noraDates.has(dateStr);

    let fillClass = '';
    if (!isFuture) {
      if (tyeLogged && noraLogged) fillClass = 'fill-both';
      else if (tyeLogged) fillClass = 'fill-tye';
      else if (noraLogged) fillClass = 'fill-nora';
    }

    html += `<div class="cal-cell ${isToday?'today':''} ${isFuture?'future':''} ${fillClass}">
      <span class="cal-day-num">${d}</span>
    </div>`;
  }

  grid.innerHTML = html;
}

// ══════════════════════════════════════
// LOG
// ══════════════════════════════════════
const LOG_TYPES = ['all','lift','hiit','outdoor-run','indoor-cardio','hike','class','sports','calisthenics','other'];
const LOG_TYPE_LABELS = { all:'All',lift:'Lift',hiit:'HIIT','outdoor-run':'Outdoor run','indoor-cardio':'Indoor run',hike:'Hike',class:'Class',sports:'Sports',calisthenics:'Calisthenics',other:'Other' };

function buildLogFilters() {
  document.getElementById('log-type-filters').innerHTML = LOG_TYPES.map(t=>
    `<button class="log-filter-btn ${t==='all'?'active':''}" onclick="setLogType(this,'${t}')">${LOG_TYPE_LABELS[t]||t}</button>`
  ).join('');
}

function setLogType(btn, type) {
  logTypeFilter=type;
  document.querySelectorAll('.log-filter-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  renderLog();
}

function renderLog() {
  const panel = document.getElementById('log-panel');
  let rows = filterByUser(allWorkouts);
  if (logTypeFilter!=='all') rows=rows.filter(r=>r.type===logTypeFilter);
  rows = [...rows].sort((a,b)=>rowDate(b).localeCompare(rowDate(a))).slice(0,60);
  if (!rows.length) { panel.innerHTML='<div class="log-empty">No workouts match this filter.</div>'; return; }

  panel.innerHTML = rows.map(r=>{
    const tc=TYPE_COLORS[r.type]||TYPE_COLORS.other;
    const d=rowDate(r)?new Date(rowDate(r)+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—';
    const who=String(r.user||'').toLowerCase()==='tye'?'Tye':'Nora';
    return `<div class="log-row">
      <span class="log-date">${d}</span>
      <span class="log-type-pill" style="background:${tc.bg};color:${tc.tc};">${TYPE_LABELS[r.type]||r.type}</span>
      <span class="log-who">${who}</span>
      <span class="log-detail">${buildDetail(r)}</span>
      <span class="log-feel">${FEEL[parseInt(r.feel)]||''}</span>
    </div>`;
  }).join('');
}

function buildDetail(r) {
  const parts=[];
  if (r.type==='lift') {
    // Pull exercise names from allLifts using session_id
    const sessionSets = allLifts.filter(s => String(s.session_id) === String(r.session_id));
    const exNames = [...new Set(sessionSets.map(s => s.exercise).filter(Boolean))];
    if (exNames.length) parts.push(exNames.join(', '));
    if (r.duration_min) parts.push(r.duration_min+' min');
  }
  if (r.type==='outdoor-run'||r.type==='indoor-cardio') {
    if(r.distance_km) parts.push(r.distance_km+' mi');
    if(r.pace_min_per_km) { const dec=parseFloat(r.pace_min_per_km),m=Math.floor(dec),s=Math.round((dec-m)*60); parts.push(`${m}:${s<10?'0':''}${s}/mi`); }
    if(r.route) parts.push(r.route);
    if(r.type==='indoor-cardio'&&r.machine_app) parts.push(r.machine_app);
  }
  if (r.type==='hike') { if(r.distance_km) parts.push(r.distance_km+' mi'); if(r.elevation_m) parts.push(r.elevation_m+' ft gain'); if(r.trail_name) parts.push(r.trail_name); }
  if (r.type==='hiit') { if(r.hiit_format) parts.push(r.hiit_format); if(r.rounds_completed) parts.push(r.rounds_completed+' rounds'); if(r.duration_min) parts.push(r.duration_min+' min'); }
  if (r.type==='class') { if(r.class_type) parts.push(r.class_type); if(r.studio_instructor) parts.push(r.studio_instructor); }
  if (r.type==='sports') { if(r.sport_name) parts.push(r.sport_name); if(r.duration_min) parts.push(r.duration_min+' min'); }
  if (r.type==='calisthenics') { if(r.movements) parts.push(String(r.movements).substring(0,50)); }
  if (r.type==='swim') {
    if(r.movements) parts.push(r.movements);
    if(r.duration_min) parts.push(r.duration_min+' min');
  }
  if (r.type==='indoor-cardio') {
    if(r.machine_app) parts.push(r.machine_app);
    if(r.distance_km) parts.push(r.distance_km+' mi');
    if(r.pace_min_per_km){ const dec=parseFloat(r.pace_min_per_km),m=Math.floor(dec),s=Math.round((dec-m)*60); parts.push(`${m}:${s<10?'0':''}${s}/mi`); }
    if(r.duration_min) parts.push(r.duration_min+' min');
  }
  if (r.type==='other') { if(r.other_description) parts.push(String(r.other_description).substring(0,50)); }
  if (!parts.length&&r.duration_min) parts.push(r.duration_min+' min');
  if (!parts.length&&r.notes) parts.push(String(r.notes).substring(0,50));
  return parts.join(' · ')||'—';
}
