// ── STORAGE ──
const Store = {
  get:(k)=>{try{return JSON.parse(localStorage.getItem(k))||null;}catch{return null;}},
  set:(k,v)=>localStorage.setItem(k,JSON.stringify(v)),
  push:(k,item)=>{const a=Store.get(k)||[];a.push(item);Store.set(k,a);return a;},
  remove:(k,fn)=>{const a=(Store.get(k)||[]).filter(fn);Store.set(k,a);return a;},
  update:(k,id,patch)=>{const a=(Store.get(k)||[]).map(i=>i.id===id?{...i,...patch}:i);Store.set(k,a);return a;}
};

// ── AUTH ──
function getUser(){return Store.get('sm_user');}
function requireAuth(){
  const u=getUser();
  if(!u){location.href='login.html';return null;}
  return u;
}
function logout(){
  if(confirm('Log out of StudyMind?')){Store.set('sm_user',null);location.href='login.html';}
}
function switchAccount(){
  if(confirm('Switch account? You will be logged out.')){Store.set('sm_user',null);location.href='login.html';}
}
function isAdmin(){const u=getUser();return u&&u.isAdmin===true;}

// ── RENDER NAV USER CHIP ──
function renderUserChip(){
  const u=getUser();
  if(!u) return;
  const chips=document.querySelectorAll('.user-chip');
  chips.forEach(chip=>{
    const av=chip.querySelector('.user-avatar');
    const nm=chip.querySelector('.user-name');
    if(av) av.textContent=(u.name||'?').charAt(0).toUpperCase();
    if(nm) nm.textContent=u.name||'Student';
  });
}

// ── TOAST ──
function showToast(msg,type='info',dur=3000){
  let c=document.getElementById('toast-container');
  if(!c){c=document.createElement('div');c.id='toast-container';document.body.appendChild(c);}
  const t=document.createElement('div');t.className=`toast ${type}`;t.textContent=msg;
  c.appendChild(t);
  setTimeout(()=>{t.style.animation='fadeOut .28s ease forwards';setTimeout(()=>t.remove(),280);},dur);
}

// ── CLOCK ──
function startClock(el){if(!el)return;const tick=()=>{const n=new Date();el.textContent=n.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});};tick();setInterval(tick,1000);}

// ── MODAL ──
function openModal(id){const m=document.getElementById(id);if(m)m.style.display='flex';}
function closeModal(id){const m=document.getElementById(id);if(m)m.style.display='none';}
document.addEventListener('click',e=>{if(e.target.classList.contains('modal-overlay'))e.target.style.display='none';});

// ── UTILS ──
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function today(){return new Date().toISOString().split('T')[0];}
function formatDate(d){return new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});}
function formatDateTime(d){return new Date(d).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function dayName(d){return new Date(d+'T00:00:00').toLocaleDateString('en-IN',{weekday:'long'});}

// ── NAV ACTIVE STATE ──
(function(){
  const links=document.querySelectorAll('.nav-link');
  const path=location.pathname.split('/').pop()||'index.html';
  links.forEach(l=>{const h=l.getAttribute('href');if(h===path)l.classList.add('active');});
})();

// ── AUTO-CROSS OVERDUE TASKS ──
function autoCheckOverdueTasks(){
  const tasks=Store.get('sm_tasks')||[];
  const todayStr=today();
  let changed=false;
  tasks.forEach(t=>{
    if(!t.done && t.date && t.date < todayStr && !t.distracted){
      t.distracted=true; t.done=true; t.autoCrossed=true;
      changed=true;
    }
  });
  if(changed) Store.set('sm_tasks',tasks);
}
autoCheckOverdueTasks();

// ── STATS ──
function getStats(){
  const tasks=Store.get('sm_tasks')||[];
  const sessions=Store.get('sm_sessions')||[];
  const done=tasks.filter(t=>t.done&&!t.distracted).length;
  const distracted=tasks.filter(t=>t.distracted).length;
  const total=tasks.length;
  const todayTasks=tasks.filter(t=>t.date===today());
  const todayDone=todayTasks.filter(t=>t.done&&!t.distracted).length;
  const studyMins=sessions.reduce((s,x)=>s+(x.minutes||0),0);
  const pomodoroSessions=sessions.filter(s=>s.type==='pomodoro').length;
  return{done,distracted,total,todayTasks:todayTasks.length,todayDone,studyMins,pomodoroSessions};
}

// ── WEEKLY PROGRESS DATA ──
function getWeeklyProgress(){
  const sessions=Store.get('sm_sessions')||[];
  const days=[];
  for(let i=6;i>=0;i--){
    const d=new Date();d.setDate(d.getDate()-i);
    const ds=d.toISOString().split('T')[0];
    const mins=sessions.filter(s=>s.date===ds).reduce((a,s)=>a+(s.minutes||0),0);
    days.push({date:ds,label:d.toLocaleDateString('en-IN',{weekday:'short'}),mins});
  }
  return days;
}

// ── CUSTOM CURSOR ──
(function initCursor(){
  const dot=document.createElement('div');dot.id='cursor-dot';
  const ring=document.createElement('div');ring.id='cursor-ring';
  document.body.appendChild(dot);document.body.appendChild(ring);
  let mx=0,my=0,rx=0,ry=0;
  document.addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY;dot.style.left=mx+'px';dot.style.top=my+'px';});
  function lerp(a,b,t){return a+(b-a)*t;}
  function animRing(){rx=lerp(rx,mx,.13);ry=lerp(ry,my,.13);ring.style.left=rx+'px';ring.style.top=ry+'px';requestAnimationFrame(animRing);}
  animRing();
  document.addEventListener('mousedown',()=>{dot.classList.add('clicking');ring.classList.add('clicking');});
  document.addEventListener('mouseup',()=>{dot.classList.remove('clicking');ring.classList.remove('clicking');});
  document.addEventListener('mouseover',e=>{
    if(e.target.matches('a,button,.btn,.nav-link,.user-chip,.prompt-chip,.check-btn,.filter-btn,.tab-btn,.ptab,.session-tab,.ctrl-btn,.emoji-opt,.edu-opt')){
      dot.classList.add('hovering');ring.classList.add('hovering');
    }else{dot.classList.remove('hovering');ring.classList.remove('hovering');}
  });
})();

document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && e.key === 'A') {
    location.href = 'admin.html';
  }
});