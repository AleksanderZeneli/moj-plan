import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const root = document.querySelector('#app');
const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
let client = null;
let session = null;
let state = { view: 'today', calendarMode: 'week', date: new Date(), filter: 'all', eventFilter: 'upcoming', preparationFilter: 'all', events: [], official: [], officialStatus: '', tasks: [], labs: [], preparations: [], preparationError: '', profile: null, demo: !configured };
let authBusy = false;
let officialRequest = 0;
let lastOfficialCheck = 0;
const dayMs = 86400000;
const pad = n => String(n).padStart(2, '0');
const localDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const toDate = s => new Date(`${s}T12:00:00`);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate()+n, 12);
const fmt = (s, options={day:'numeric', month:'short'}) => new Intl.DateTimeFormat('pl-PL',options).format(typeof s==='string'?toDate(s):s);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid = () => crypto.randomUUID();
let toastTimer;

function notify(message){ document.querySelector('.toast')?.remove();const el=document.createElement('div');el.className='toast';el.textContent=message;document.body.append(el);clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.remove(),3600); }
function starterData(){
  const today=new Date(), tomorrow=localDate(addDays(today,1)), next=localDate(addDays(today,5));
  state.events=[{id:uuid(),title:'Programowanie — laboratorium',kind:'university',subject:'Programowanie',date:tomorrow,start_time:'08:00',end_time:'09:35',location:'Sala 213',recurrence:'weekly'},{id:uuid(),title:'Trening',kind:'personal',subject:'',date:localDate(today),start_time:'17:00',end_time:'18:00',location:'',recurrence:'none'}];
  state.tasks=[{id:uuid(),title:'Oddać sprawozdanie z fizyki',due_date:next,completed:false,priority:'high',notes:''}];
  state.labs=[{id:uuid(),subject:'Programowanie',next_date:tomorrow,repeat_weekly:true,preparation:'Powtórzyć wskaźniki i listy jednokierunkowe.',reviewed_for_date:null,remind_days:7}];
}
function activeLabs(){
  const today=toDate(localDate(new Date()));
  return state.labs.map(l=>{
    let next=toDate(l.next_date);
    if(l.repeat_weekly){while(next<today)next=addDays(next,7);}
    return {...l,nextOccurrence:localDate(next),daysAway:Math.round((next-today)/dayMs),checked_for_next:l.reviewed_for_date===localDate(next)};
  }).sort((a,b)=>a.nextOccurrence.localeCompare(b.nextOccurrence));
}
function onDate(e,date){ if(e.date===date)return true; if(e.recurrence==='weekly'&&e.date<date){const diff=Math.round((toDate(date)-toDate(e.date))/dayMs);return diff>=0&&diff%7===0;}return false; }
function isHiddenClass(event){return (state.profile?.hidden_classes||[]).some(rule=>rule.subject===(event.subject||event.title)&&(!rule.type||rule.type===event.type));}
function visibleOfficial(){return state.official.filter(event=>!isHiddenClass(event));}
function allEvents(){return [...state.events,...visibleOfficial()];}
function taskCategory(task){return task.category==='university'?'university':'personal';}
function preparationStatus(event){return !event.answer?'check':!event.answer.required?'none':event.answer.completed?'done':'prepare';}
function hiddenClassSettings(){
  const choices=[...new Map(state.official.map(event=>{const rule={subject:event.subject||event.title,type:event.type||''};return [JSON.stringify(rule),rule];})).values()].sort((a,b)=>a.subject.localeCompare(b.subject,'pl')||a.type.localeCompare(b.type,'pl'));
  return `<section class="card hidden-classes"><h2>Moje zajęcia</h2><p class="muted">Zaznacz pozycje, które chcesz ukryć w swoim kalendarzu i przygotowaniach. Publiczny plan grupy pozostanie pełny.</p><button class="btn ghost" data-action="hide-requested-classes">Ukryj ćwiczenia z baz danych i angielski</button><form id="hidden-classes-form" class="form"><div class="class-choices">${choices.map((rule,index)=>`<label class="class-choice"><input type="checkbox" name="hidden" value="${index}" ${isHiddenClass({subject:rule.subject,type:rule.type})?'checked':''}><span>${esc(rule.subject)} · ${esc(rule.type||'Zajęcia')}</span></label>`).join('')}</div><button class="btn primary" type="submit" ${choices.length?'':'disabled'}>Zapisz ukryte zajęcia</button></form></section>`;
}
async function saveHiddenClasses(rules){
  if(state.demo){state.profile={...state.profile,hidden_classes:rules};render();return true;}
  const {error}=await client.from('profiles').upsert({user_id:session.user.id,wat_group:state.profile?.wat_group||'',hidden_classes:rules});
  if(error){notify('Nie zapisano ustawień zajęć: '+error.message);return false;}
  await load();notify('Ukryte zajęcia zapisane na Twoim koncie.');return true;
}
async function hideRequestedClasses(){
  const rules=[...(state.profile?.hidden_classes||[])];
  for(const rule of [{subject:'Bazy danych',type:'Ćwiczenia'},{subject:'Język angielski',type:''}]){
    if(!rules.some(existing=>existing.subject===rule.subject&&existing.type===rule.type))rules.push(rule);
  }
  return saveHiddenClasses(rules);
}
function preparationType(event){
  const type=String(event.type||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  if(/^(laboratorium|laboratoria|lab|l)\.?$/.test(type))return 'Laboratorium';
  if(/^(cwiczenia|cwiczenia audytoryjne|cw|c)\.?$/.test(type))return 'Ćwiczenia';
  return null;
}
function occurrenceKey(event){return JSON.stringify([state.profile?.wat_group||'',event.subject||event.title,preparationType(event),event.date,event.start_time.slice(0,5)]);}
function upcomingPreparations(now=new Date()){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Warsaw',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
  const until=localDate(addDays(toDate(today),7));
  return visibleOfficial().filter(e=>preparationType(e)&&e.date>=today&&e.date<until&&(e.date!==today||e.end_time.slice(0,5)>clock)).map(event=>({...event,preparationKey:occurrenceKey(event),answer:state.preparations.find(p=>p.occurrence_key===occurrenceKey(event))})).sort((a,b)=>a.date.localeCompare(b.date)||a.start_time.localeCompare(b.start_time));
}
function preparationCards(){
  const entries=upcomingPreparations();
  const cards=entries.map((e,index)=>({event:e,index,status:preparationStatus(e)})).filter(item=>state.preparationFilter==='all'||item.status===state.preparationFilter).map(({event:e,index,status})=>`<article class="lab preparation-card status-${status}"><div class="row"><h3>${esc(e.title)}</h3><span class="pill status-${status}">${{check:'Do sprawdzenia',prepare:'Do przygotowania',done:'Przygotowane',none:'Bez przygotowania'}[status]}</span></div><p>${esc(preparationType(e))} · ${fmt(e.date)} · ${esc(e.start_time.slice(0,5))}–${esc(e.end_time.slice(0,5))}${e.location?' · '+esc(e.location):''}</p><p>${esc(e.answer?.notes||(status==='check'?'Czy trzeba przygotować się na te zajęcia?':status==='none'?'Na ten termin nie trzeba nic przygotować.':'Brak dodatkowych notatek.'))}</p><div class="lab-actions"><button class="text-btn" data-preparation="${index}">${e.answer?'Zmień odpowiedź / notatkę':'Odpowiedz'}</button>${e.answer?.required?`<button class="text-btn" data-prepared="${index}">${e.answer.completed?'Oznacz jako niegotowe':'✓ Przygotowane'}</button>`:''}</div></article>`).join('');
  const keys=new Set(state.official.map(occurrenceKey));
  const changed=state.preparations.filter(p=>p.group_code===state.profile?.wat_group&&!keys.has(p.occurrence_key)&&!isHiddenClass({subject:p.subject,type:p.lesson_type}));
  return `${state.preparationError?'<p class="banner warn">Nie można odczytać odpowiedzi w chmurze. Spróbuj odświeżyć stronę; jeśli problem pozostaje, baza wymaga konfiguracji przygotowań.</p>':''}${cards||'<p class="empty">Brak nadchodzących laboratoriów i ćwiczeń w najbliższych 7 dniach. Sprawdź grupę i aktualność planu w ustawieniach.</p>'}${changed.length?`<details><summary>Notatki do zmienionych lub odwołanych terminów (${changed.length})</summary>${changed.map(p=>`<article class="lab"><h3>${esc(p.subject)}</h3><p>Poprzedni termin: ${fmt(p.date)} · ${esc(p.start_time.slice(0,5))}. Tego terminu nie ma w aktualnym planie. Sprawdź nowy termin przed przeniesieniem przygotowań.</p><p>${esc(p.notes|| (p.required?'Przygotowanie wymagane':'Bez przygotowania'))}</p></article>`).join('')}</details>`:''}`;
}
function preparationModal(index){
  const event=upcomingPreparations()[index];if(!event)return;
  const answer=event.answer,owner=session?.user.id;
  const overlay=document.createElement('div');overlay.className='dialog-backdrop';
  overlay.innerHTML=`<div class="dialog" role="dialog" aria-modal="true" aria-label="Przygotowanie do zajęć"><h2>${esc(event.title)}</h2><p>${esc(preparationType(event))} · ${fmt(event.date)} · ${esc(event.start_time.slice(0,5))}</p><form class="form"><label>Czy trzeba się przygotować?<select name="required" required><option value="">Wybierz odpowiedź</option><option value="yes" ${answer?.required===true?'selected':''}>Tak</option><option value="no" ${answer?.required===false?'selected':''}>Nie</option></select></label><label>Co przygotować? / Notatka<textarea name="notes">${esc(answer?.notes||'')}</textarea></label><div class="top-actions"><button type="button" class="btn ghost" data-cancel>Anuluj</button><button type="submit" class="btn primary">Zapisz odpowiedź</button></div><p class="small" role="status"></p></form></div>`;
  document.body.append(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('[data-cancel]'))overlay.remove();});
  overlay.querySelector('form').addEventListener('submit',async e=>{
    e.preventDefault();const form=e.currentTarget,button=form.querySelector('[type="submit"]');button.disabled=true;
    const values=new FormData(form),required=values.get('required')==='yes',record={group_code:state.profile?.wat_group||'',occurrence_key:event.preparationKey,subject:event.subject||event.title,lesson_type:preparationType(event),date:event.date,start_time:event.start_time,end_time:event.end_time,location:event.location||'',required,completed:required&&Boolean(answer?.completed),notes:String(values.get('notes')||'').trim()};
    try{
      if(state.demo){state.preparations=state.preparations.filter(p=>p.occurrence_key!==record.occurrence_key);state.preparations.push(record);render();}
      else{if(session?.user.id!==owner)throw new Error('Zaloguj się ponownie.');const {error}=await client.from('class_preparations').upsert({...record,user_id:owner},{onConflict:'user_id,occurrence_key'});if(error)throw error;await load();}
      overlay.remove();notify('Zapisano odpowiedź dla tego terminu.');
    }catch(error){form.querySelector('[role="status"]').textContent='Nie zapisano odpowiedzi: '+error.message;}finally{button.disabled=false;}
  });
}
async function togglePrepared(index){
  const event=upcomingPreparations()[index],answer=event?.answer;if(!answer?.required)return;
  const record={...answer,completed:!answer.completed};
  if(state.demo){state.preparations=state.preparations.map(p=>p.occurrence_key===record.occurrence_key?record:p);render();return;}
  const {error}=await client.from('class_preparations').update({completed:record.completed}).eq('user_id',session.user.id).eq('occurrence_key',record.occurrence_key);
  if(error){notify('Nie zapisano statusu: '+error.message);return;}await load();
}
async function loadOfficial(){
  const request = ++officialRequest;
  lastOfficialCheck=Date.now();
  const group=(state.profile?.wat_group||'').toUpperCase();
  if(state.officialGroup!==group){state.official=[];state.officialGroup=group;}
  if(!/^WCY[0-9A-Z_*]+$/.test(group)){state.officialStatus='Wybierz kod grupy WCY w ustawieniach.';render();return;}
  try{
    const response=await fetch(`./data/${encodeURIComponent(group)}.json`,{cache:'no-store'});
    if(!response.ok)throw new Error('Brak opublikowanego planu tej grupy');
    const data=await response.json();
    if(request!==officialRequest)return;
    if(data.group!==group||!Array.isArray(data.events))throw new Error('Nieprawidłowy plik');
    state.official=data.events.filter(e=>['wcy','planwat'].includes(e.source)&&/^\d{4}-\d{2}-\d{2}$/.test(e.date));
    const source=data.provider||'Oficjalna strona WCY';
    const age=(Date.now()-new Date(data.source_generated_at||data.fetched_at).getTime())/dayMs;
    state.officialStatus=`${source}: ${state.official.length} zajęć · migawka ${new Date(data.source_generated_at||data.fetched_at).toLocaleDateString('pl-PL')}${age>3?' · Dane mają ponad 3 dni; sprawdź aktualność w źródle.':''} · Sprawdzono plik ${new Date().toLocaleTimeString('pl-PL')}.`;
  }catch(error){if(request!==officialRequest)return;state.officialStatus=`Nie zsynchronizowano: ${error.message}. Własne wydarzenia pozostają dostępne.`;}
  render();
}
async function load(){
  if(state.demo){render();return;}
  const uid=session.user.id;
  const [events,tasks,labs,profiles,preparations]=await Promise.all(['events','tasks','labs','profiles','class_preparations'].map(table=>client.from(table).select('*').eq('user_id',uid)));
  if(session?.user.id!==uid)return;
  const failure=[events,tasks,labs,profiles].find(x=>x.error);
  if(failure){notify('Błąd pobierania danych: '+failure.error.message);return;}
  state.events=events.data;state.tasks=tasks.data;state.labs=labs.data;state.profile=profiles.data[0] || null;
  state.preparations=preparations.data||[];state.preparationError=preparations.error?.message||'';
  if(!state.profile?.wat_group)state.view='settings';
  render();await loadOfficial();
}
async function save(table,item){
  if(state.demo){const index=state[table].findIndex(x=>x.id===item.id);if(index<0)state[table].push(item);else state[table][index]=item;render();return true;}
  const payload={...item,user_id:session.user.id};
  const {error}=await client.from(table).upsert(payload);
  if(error){notify('Nie zapisano: '+error.message);return false;}
  await load();return true;
}
async function remove(table,id){
  if(!confirm('Usunąć ten wpis?'))return;
  if(state.demo){state[table]=state[table].filter(x=>x.id!==id);render();return;}
  const {error}=await client.from(table).delete().eq('id',id);
  if(error)notify(error.message);else await load();
}
function button(label,action=''){return `<button class="btn ${action==='primary'?'primary':'ghost'}" data-action="${action||'add'}">${label}</button>`;}
function sidebar(){const links=[['today','◫','Dzisiaj'],['calendar','▦','Kalendarz'],['events','◷','Wydarzenia'],['labs','✎','Na zajęcia'],['tasks','☑','Poza uczelnią'],['settings','⚙','Ustawienia']];return `<aside class="sidebar"><div class="brand"><span class="brand-icon">✓</span>Mój Plan</div><nav class="nav">${links.map(([id,icon,name])=>`<button class="${state.view===id?'active':''}" data-nav="${id}">${icon}&nbsp; ${name}</button>`).join('')}</nav><div class="sidebar-foot">${state.demo?'Tryb podglądu · dane tylko w pamięci':'Prywatny plan · Supabase'}<br>WAT + życie poza uczelnią</div></aside><nav class="mobile-nav">${links.map(([id,icon,name])=>`<button class="${state.view===id?'active':''}" data-nav="${id}"><strong>${icon}</strong>${name}</button>`).join('')}</nav>`;}
function nextEventDate(event,today=localDate(new Date())){if(event.date>=today)return event.date;if(event.recurrence!=='weekly')return null;const days=Math.round((toDate(today)-toDate(event.date))/dayMs);return localDate(addDays(toDate(event.date),Math.ceil(days/7)*7));}
function manualEventOccurrences(now=new Date()){const today=localDate(now),clock=`${pad(now.getHours())}:${pad(now.getMinutes())}`;return state.events.map(event=>{let nextOccurrence=nextEventDate(event,today);if(nextOccurrence===today&&event.end_time.slice(0,5)<=clock)nextOccurrence=event.recurrence==='weekly'?localDate(addDays(toDate(today),7)):null;return {...event,nextOccurrence};}).sort((a,b)=>(a.nextOccurrence||a.date).localeCompare(b.nextOccurrence||b.date)||a.start_time.localeCompare(b.start_time));}
function dashboardCounts(){const upcoming=upcomingPreparations(),today=localDate(new Date()),until=localDate(addDays(toDate(today),7));return {check:upcoming.filter(e=>preparationStatus(e)==='check').length,prepare:upcoming.filter(e=>preparationStatus(e)==='prepare').length,university:state.tasks.filter(t=>taskCategory(t)==='university'&&!t.completed).length,personal:state.tasks.filter(t=>taskCategory(t)==='personal'&&!t.completed).length,events:manualEventOccurrences().filter(e=>e.nextOccurrence&&e.nextOccurrence<until).length};}
function stats(){const count=dashboardCounts();return `<div class="dashboard-tiles">${[['check','Do sprawdzenia','Czy trzeba coś przygotować?','labs'],['prepare','Do przygotowania','Potwierdzone przygotowania','labs'],['university','Zadania na zajęcia','Sprawozdania, nauka i oddania','labs'],['personal','Poza uczelnią','Twoje prywatne sprawy','tasks'],['events','Wydarzenia','Własne wpisy w kalendarzu · 7 dni','events']].map(([key,label,description,view])=>`<button class="card dashboard-tile status-${key}" data-nav="${view}" ${key==='check'||key==='prepare'?`data-preparation-filter="${key}"`:'data-preparation-filter="all"'}><span class="stat-label">${label}</span><strong class="stat-value">${count[key]}</strong><span class="small">${description}</span></button>`).join('')}</div>`;}
function eventsView(){
  const entries=manualEventOccurrences().filter(event=>state.eventFilter==='all'||(state.eventFilter==='upcoming'?event.nextOccurrence:!event.nextOccurrence));
  return `<section class="card"><div class="section-head"><div><h2>Moje wydarzenia</h2><p class="muted small">Własne wpisy z datą i godziną: praca, treningi, spotkania i inne plany.</p></div><button class="btn primary" data-add="events">+ Wydarzenie</button></div><div class="filters event-filters">${[['upcoming','Nadchodzące'],['past','Minione'],['all','Wszystkie']].map(([id,label])=>`<button class="${state.eventFilter===id?'active':''}" data-event-filter="${id}">${label}</button>`).join('')}</div>${entries.length?entries.map(event=>`<article class="event ${event.kind==='personal'?'personal':''}"><div><h3>${esc(event.title)}</h3><p>${fmt(event.nextOccurrence||event.date,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}${event.location?' · '+esc(event.location):''}${event.recurrence==='weekly'?' · co tydzień':''}</p><div class="lab-actions"><button class="text-btn" data-edit="events:${event.id}">Edytuj</button><button class="text-btn" data-open-event="${esc(event.id)}">Pokaż w kalendarzu →</button></div></div><div class="event-time">${esc(event.start_time.slice(0,5))}–${esc(event.end_time.slice(0,5))}</div></article>`).join(''):'<div class="empty">Brak wydarzeń w tej sekcji. Dodaj własny wpis do kalendarza.</div>'}</section>`;
}
function weekStrip(){const d=state.date, monday=addDays(d,-((d.getDay()+6)%7));return `<div class="weekstrip">${Array.from({length:7},(_,i)=>{const x=addDays(monday,i),key=localDate(x);return `<button class="day ${key===localDate(d)?'selected':''}" data-date="${key}"><small>${['pn','wt','śr','cz','pt','sb','nd'][i]}</small><strong>${x.getDate()}</strong></button>`;}).join('')}</div>`;}
function agenda(date){const entries=allEvents().filter(e=>onDate(e,date)).sort((a,b)=>a.start_time.localeCompare(b.start_time));return entries.length?entries.map(e=>`<article class="event ${e.kind==='personal'?'personal':''}"><div><h3>${esc(e.title)}</h3><p>${esc(e.location|| (e.kind==='university'?'Uczelnia':'Wydarzenie'))}${e.recurrence==='weekly'?' · co tydzień':''}${['wcy','planwat'].includes(e.source)?(e.source==='planwat'?' · PlanWAT (nieoficjalne)':' · oficjalny WCY'):''}${e.type?' · '+esc(e.type):''}</p>${['wcy','planwat'].includes(e.source)?'<span class="small muted">Importowane · tylko do odczytu</span>':`<button class="text-btn" data-edit="events:${e.id}">Edytuj</button>`}</div><div class="event-time">${esc(e.start_time.slice(0,5))}–${esc(e.end_time.slice(0,5))}</div></article>`).join(''):'<div class="empty">Brak zaplanowanych wydarzeń w tym dniu.</div>';}
function taskList(limit=Infinity,category='personal'){let items=state.tasks.filter(t=>taskCategory(t)===category&&(state.filter==='all'||(state.filter==='active'?!t.completed:t.completed)));items.sort((a,b)=>Number(a.completed)-Number(b.completed)||(a.due_date||'9999').localeCompare(b.due_date||'9999'));if(!items.length)return '<div class="empty">Nie masz tu jeszcze zadań.</div>';return items.slice(0,limit).map(t=>`<div class="task ${t.completed?'done':''}"><input type="checkbox" data-check="${t.id}" ${t.completed?'checked':''} aria-label="Ukończ: ${esc(t.title)}"><div style="flex:1"><div class="task-title">${esc(t.title)}</div><div class="task-meta">${t.due_date?'Deadline: '+fmt(t.due_date):'Bez deadline’u'}${t.priority==='high'?' · Ważne':''}${t.notes?' · '+esc(t.notes):''}</div><button class="text-btn" data-edit="tasks:${t.id}">Edytuj</button></div>${t.due_date?`<span class="pill ${!t.completed&&t.due_date<localDate(new Date())?'red':'warning'}">${fmt(t.due_date)}</span>`:''}</div>`).join('');}
function labCards(){const labs=activeLabs();if(!labs.length)return '<div class="empty">Dodaj laboratorium i ustaw termin kolejnych zajęć.</div>';return labs.map(l=>`<article class="lab preparation-card status-${l.checked_for_next?'done':'check'}"><div class="row"><h3>${esc(l.subject)}</h3><span class="pill ${l.daysAway<=7&&!l.checked_for_next?'warning':''}">${fmt(l.nextOccurrence)}</span></div><div class="small muted">${l.repeat_weekly?'Co tydzień · ':''}${l.daysAway===0?'Dzisiaj':`Za ${l.daysAway} dni`}</div><p>${esc(l.preparation||'Brak notatek. Czy trzeba coś przygotować na te zajęcia?')}</p><div class="lab-actions"><button class="text-btn" data-review="${l.id}">${l.checked_for_next?'✓ Przygotowania sprawdzone':'Czy trzeba się przygotować? →'}</button><button class="text-btn" data-edit="labs:${l.id}">Edytuj</button></div></article>`).join('');}
function promptCard(){const pending=[...activeLabs().filter(l=>l.daysAway<=l.remind_days&&!l.checked_for_next),...upcomingPreparations().filter(e=>!e.answer)];if(!pending.length)return '';return `<div class="banner status-check"><strong>✎ Przygotowania do zajęć</strong><p>Masz ${pending.length} ${pending.length===1?'termin':'terminów'} do sprawdzenia przygotowań. Czy trzeba wykonać zadanie, przeczytać materiały albo coś zabrać?</p><button class="btn primary" data-nav="labs">Sprawdź przygotowania</button></div>`;}
function todayView(){const date=localDate(state.date);return `${stats()}${promptCard()}<div class="layout"><div class="stack"><section class="card"><div class="section-head"><h2>Plan dnia · ${fmt(state.date,{weekday:'long',day:'numeric',month:'long'})}</h2><button class="btn ghost" data-add="events">+ Wydarzenie</button></div>${weekStrip()}${agenda(date)}</section></div><div class="stack"><section class="card"><div class="section-head"><h2>Na zajęcia</h2><button class="btn ghost" data-add="tasks" data-task-category="university">+ Zadanie</button></div>${taskList(3,'university')}<button class="text-btn" data-nav="labs">Zadania i przygotowania →</button></section><section class="card"><div class="section-head"><h2>Poza uczelnią</h2><button class="btn ghost" data-add="tasks" data-task-category="personal">+ Zadanie</button></div>${taskList(3,'personal')}<button class="text-btn" data-nav="tasks">Wszystkie prywatne sprawy →</button></section></div></div>`;}
function weekDays(date=state.date){const monday=addDays(date,-((date.getDay()+6)%7));return Array.from({length:7},(_,i)=>localDate(addDays(monday,i)));}
const minutes = time => Number(time.slice(0,2))*60+Number(time.slice(3,5));
function weekCalendar(){
  const days=weekDays(), events=allEvents();
  const visible=events.filter(e=>days.some(day=>onDate(e,day)));
  const first=Math.min(7*60,...visible.map(e=>Math.floor(minutes(e.start_time)/60)*60));
  const last=Math.max(21*60,...visible.map(e=>Math.ceil(minutes(e.end_time)/60)*60));
  const height=(last-first)*1.2;
  const hours=Array.from({length:(last-first)/60},(_,i)=>first+i*60);
  return `<p class="muted small">Zajęcia WAT i prywatne wydarzenia na jednej osi czasu. Na telefonie przesuń plan w bok.</p><div class="week-scroll" tabindex="0" role="region" aria-label="Plan całego tygodnia"><div class="week-grid"><div class="week-corner">Godzina</div>${days.map(day=>`<button class="week-heading ${day===localDate(new Date())?'is-today':''}" data-date="${day}" data-calendar-mode="day">${fmt(day,{weekday:'short'})}<strong>${fmt(day)}</strong></button>`).join('')}<div class="week-hours" style="height:${height}px">${hours.map(hour=>`<span style="top:${(hour-first)*1.2}px">${pad(hour/60)}:00</span>`).join('')}</div>${days.map(day=>{
    const entries=events.filter(e=>onDate(e,day)).sort((a,b)=>a.start_time.localeCompare(b.start_time)||a.end_time.localeCompare(b.end_time));
    const groups=[];
    for(const event of entries){let group=groups.at(-1);const start=minutes(event.start_time),end=minutes(event.end_time);if(!group||start>=group.end){group={end,lanes:[],items:[]};groups.push(group);}let lane=group.lanes.findIndex(until=>until<=start);if(lane<0)lane=group.lanes.length;group.lanes[lane]=end;group.end=Math.max(group.end,end);group.items.push({event,lane,start,end});}
    return `<div class="week-column ${day===localDate(new Date())?'is-today':''}" style="height:${height}px">${groups.map(group=>group.items.map(({event:e,lane,start,end})=>`<article class="week-event ${e.kind==='personal'?'personal':''}" style="top:${(start-first)*1.2}px;height:${Math.max((end-start)*1.2,18)}px;left:calc(${lane/group.lanes.length*100}% + 2px);width:calc(${100/group.lanes.length}% - 4px)"><strong>${esc(e.title)}</strong><span>${esc(e.start_time.slice(0,5))}–${esc(e.end_time.slice(0,5))}</span><span>${esc(e.location)}${e.type?' · '+esc(e.type):''}</span>${['wcy','planwat'].includes(e.source)?(e.source==='planwat'?'<small>PlanWAT (nieoficjalne)</small>':'<small>Oficjalny WCY</small>'):`<button class="text-btn" data-edit="events:${e.id}">Edytuj</button>`}</article>`).join('')).join('')}${entries.length?'':'<span class="week-empty">Brak wydarzeń</span>'}</div>`;
  }).join('')}</div></div>`;
}
function calendarView(){const days=weekDays(),week=state.calendarMode==='week';return `<section class="card"><div class="section-head calendar-toolbar"><div><h2>Kalendarz</h2><p class="muted small">${fmt(days[0])} – ${fmt(days[6],{day:'numeric',month:'long',year:'numeric'})}</p></div><div class="top-actions"><button class="btn ghost" data-shift="-${week?7:1}" aria-label="Poprzedni ${week?'tydzień':'dzień'}">←</button><button class="btn ghost" data-action="calendar-today">Dzisiaj</button><button class="btn ghost" data-shift="${week?7:1}" aria-label="Następny ${week?'tydzień':'dzień'}">→</button><button class="btn primary" data-add="events">+ Wydarzenie</button></div></div><div class="filters calendar-modes" aria-label="Widok kalendarza">${[['week','Cały tydzień'],['day','Dzień']].map(([mode,label])=>`<button class="${state.calendarMode===mode?'active':''}" data-calendar-mode="${mode}" aria-pressed="${state.calendarMode===mode}">${label}</button>`).join('')}</div>${week?weekCalendar():`${weekStrip()}<h3>${fmt(state.date,{weekday:'long',day:'numeric',month:'long'})}</h3>${agenda(localDate(state.date))}`}</section>`;}
function taskFilters(){return `<div class="filters">${[['all','Wszystkie'],['active','Do zrobienia'],['done','Wykonane']].map(([id,label])=>`<button class="${state.filter===id?'active':''}" data-filter="${id}">${label}</button>`).join('')}</div>`;}
function tasksView(){return `<section class="card"><div class="section-head"><h2>Poza uczelnią</h2><button class="btn primary" data-add="tasks" data-task-category="personal">+ Nowe zadanie</button></div><p class="muted">Prywatne sprawy, zakupy, praca i inne zadania.</p>${taskFilters()}${taskList(Infinity,'personal')}</section>`;}
function labsView(){return `<div class="stack"><section class="card"><div class="section-head"><h2>Zadania na zajęcia</h2><button class="btn primary" data-add="tasks" data-task-category="university">+ Zadanie na zajęcia</button></div>${taskFilters()}${taskList(Infinity,'university')}</section><section class="card"><div class="section-head"><h2>Przygotowania z planu</h2></div><p class="muted">Laboratoria i ćwiczenia na najbliższe 7 dni. Niebieskie: do sprawdzenia. Pomarańczowe: do przygotowania. Zielone: gotowe lub bez przygotowania.</p><div class="filters preparation-filters">${[['all','Wszystkie'],['check','Do sprawdzenia'],['prepare','Do przygotowania'],['done','Przygotowane'],['none','Bez przygotowania']].map(([id,label])=>`<button class="${state.preparationFilter===id?'active':''}" data-preparation-filter="${id}">${label}</button>`).join('')}</div>${preparationCards()}</section><section class="card"><div class="section-head"><h2>Własne notatki do laboratoriów</h2><button class="btn ghost" data-add="labs">+ Notatka</button></div>${labCards()}</section></div>`;}
function settingsView(){return `<section class="card"><div class="section-head"><h2>Ustawienia</h2></div><h3>Twoja grupa WAT</h3><form id="group-form" class="form"><label>Kod grupy<input name="group" value="${esc(state.profile?.wat_group||'')}" placeholder="Np. WCY25KY2S1" maxlength="40" autocomplete="off" required></label><div class="top-actions"><button class="btn primary" type="submit">Zapisz grupę</button><button class="btn ghost" type="button" data-action="refresh-wcy">Sprawdź aktualizacje</button></div></form><p class="muted small">${esc(state.officialStatus||'Plan jest pobierany z oficjalnej strony WCY, gdy plik Twojej grupy jest dostępny.')}</p><p class="muted small">Możesz wpisać dowolny kod grupy WCY. Zajęcia pokażą się po wygenerowaniu pliku tej grupy przez nasz importer.</p><hr style="border:0;border-top:1px solid #e8eef3;margin:24px 0"><p><strong>Powiadomienia systemowe</strong></p><p class="muted small">Tygodniowe pytania działają w aplikacji. Powiadomienia przy zamkniętej aplikacji wymagają osobnego backendu Web Push i zgody na iPhonie.</p>${state.demo?'<p class="banner warn">Tryb demonstracyjny: zmiany znikną po odświeżeniu. Aby zachowywać dane wyłącznie w chmurze, skonfiguruj Supabase.</p>':`<p class="muted">Zalogowano jako ${esc(session.user.email||'użytkownik')}</p><button class="btn danger" data-action="logout">Wyloguj</button>`}</section>`;}
function render(){const names={today:'Dzień dobry!',calendar:'Twój kalendarz',events:'Moje wydarzenia',tasks:'Poza uczelnią',labs:'Na zajęcia',settings:'Ustawienia'};root.innerHTML=`<div class="shell">${sidebar()}<main class="main"><header class="topbar"><div><p class="eyebrow">Twoja przestrzeń</p><h1>${names[state.view]}</h1><div class="muted small">${fmt(new Date(),{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div></div><div class="top-actions">${state.demo?'<span class="pill warning">DEMO</span><button class="btn ghost" data-action="login">Zaloguj się</button>':''}<button class="btn primary" data-add="${state.view==='events'?'events':'tasks'}">${state.view==='events'?'+ Wydarzenie':'+ Dodaj'}</button></div></header>${{today:todayView,calendar:calendarView,events:eventsView,tasks:tasksView,labs:labsView,settings:()=>settingsView()+hiddenClassSettings()}[state.view]()}</main></div>`;}
function authScreen(){root.innerHTML=`<div class="auth card"><div class="brand" style="color:#19395b;margin:0 0 25px"><span class="brand-icon">✓</span>Mój Plan</div><h1>Zaloguj się</h1><p class="muted">Prywatny kalendarz i zadania zapisane w chmurze.</p>${configured?'':'<p class="banner warn">Logowanie będzie dostępne po podłączeniu usługi kont. Teraz możesz korzystać z podglądu aplikacji.</p>'}<form id="auth-form" class="form"><label>E-mail<input type="email" name="email" autocomplete="email" required ${configured?'':'disabled'}></label><label>Hasło<input type="password" name="password" minlength="6" autocomplete="current-password" required ${configured?'':'disabled'}></label><button class="btn primary" type="submit" ${configured?'':'disabled'}>Zaloguj</button><button type="submit" class="btn ghost" name="mode" value="signup" ${configured?'':'disabled'}>Utwórz konto</button><p id="auth-message" class="small" role="status" aria-live="polite"></p></form>${configured?'':'<button class="btn ghost" data-action="back-demo">Wróć do podglądu</button>'}<p class="small muted">Zadania i notatki są zapisywane w chmurze po zalogowaniu.</p></div>`;}
function clearAccount(){++officialRequest;session=null;state.events=[];state.tasks=[];state.labs=[];state.preparations=[];state.preparationError='';state.official=[];state.profile=null;state.officialStatus='';document.querySelectorAll('.dialog-backdrop').forEach(el=>el.remove());}
async function authenticate(form,mode){
  if(!configured||authBusy)return;
  authBusy=true;
  const values=new FormData(form),message=form.querySelector('#auth-message');
  form.querySelectorAll('button').forEach(button=>button.disabled=true);
  message.textContent=mode==='signup'?'Tworzenie konta…':'Logowanie…';
  try{
    const credentials={email:String(values.get('email')).trim(),password:values.get('password')};
    const result=mode==='signup'?await client.auth.signUp({...credentials,options:{emailRedirectTo:new URL('./',location.href).href}}):await client.auth.signInWithPassword(credentials);
    if(result.error)throw result.error;
    if(result.data.session){session=result.data.session;await load();}
    else message.textContent='Sprawdź skrzynkę pocztową i potwierdź adres e-mail, a następnie zaloguj się.';
  }catch(error){message.textContent='Nie udało się '+(mode==='signup'?'utworzyć konta':'zalogować')+': '+error.message;}
  finally{authBusy=false;form.querySelectorAll('button').forEach(button=>button.disabled=false);}
}
function field(name,label,type='text',value='',extra=''){return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;}
function modal(table,id=null,category=state.view==='labs'?'university':'personal'){const current=state[table].find(x=>x.id===id)||{},editing=Boolean(id),head={events:'wydarzenie',tasks:'zadanie',labs:'laboratorium'}[table];let fields='';
  if(table==='events')fields=`${field('title','Nazwa','text',current.title,'required')}${field('date','Data','date',current.date||localDate(state.date),'required')}<div class="row">${field('start_time','Od','time',current.start_time?.slice(0,5)||'08:00','required')}${field('end_time','Do','time',current.end_time?.slice(0,5)||'09:30','required')}</div>${field('location','Sala / miejsce','text',current.location)}<label>Rodzaj<select name="kind"><option value="university" ${current.kind==='university'?'selected':''}>Zajęcia WAT</option><option value="personal" ${current.kind==='personal'?'selected':''}>Prywatne wydarzenie</option></select></label><label>Powtarzanie<select name="recurrence"><option value="none">Bez powtarzania</option><option value="weekly" ${current.recurrence==='weekly'?'selected':''}>Co tydzień</option></select></label>`;
  if(table==='tasks')fields=`${field('title','Co trzeba zrobić?','text',current.title,'required')}<label>Lista<select name="category"><option value="university" ${(current.category||category)==='university'?'selected':''}>Na zajęcia</option><option value="personal" ${(current.category||category)==='personal'?'selected':''}>Poza uczelnią</option></select></label>${field('due_date','Deadline (opcjonalnie)','date',current.due_date||'')}<label>Priorytet<select name="priority"><option value="normal">Zwykły</option><option value="high" ${current.priority==='high'?'selected':''}>Ważny</option></select></label><label>Notatki<textarea name="notes">${esc(current.notes)}</textarea></label>`;
  if(table==='labs')fields=`${field('subject','Przedmiot','text',current.subject,'required')}${field('next_date','Termin najbliższego laboratorium','date',current.next_date||localDate(addDays(new Date(),7)),'required')}<label>Co przygotować / z czego się nauczyć?<textarea name="preparation" placeholder="Np. przejrzeć instrukcję, rozwiązać zadania, zabrać sprawozdanie...">${esc(current.preparation)}</textarea></label><label>Przypomnij z wyprzedzeniem<select name="remind_days"><option value="7" ${current.remind_days!==3?'selected':''}>7 dni</option><option value="3" ${current.remind_days===3?'selected':''}>3 dni</option></select></label><label><input type="checkbox" name="repeat_weekly" ${current.repeat_weekly!==false?'checked':''} style="width:auto"> Powtarzaj co tydzień</label>`;
  const overlay=document.createElement('div');overlay.className='dialog-backdrop';overlay.innerHTML=`<div class="dialog"><div class="section-head"><h2>${editing?'Edytuj':'Dodaj'} ${head}</h2><button class="btn ghost" data-close>✕</button></div><form id="entry-form" class="form">${fields}<div class="row">${editing?`<button type="button" class="btn danger" id="delete-entry">Usuń</button>`:'<span></span>'}<div class="top-actions"><button type="button" class="btn ghost" data-close>Anuluj</button><button type="submit" class="btn primary">Zapisz</button></div></div></form></div>`;document.body.append(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('[data-close]'))overlay.remove();});
  overlay.querySelector('#delete-entry')?.addEventListener('click',async()=>{await remove(table,id);overlay.remove();});
  overlay.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const data=new FormData(e.currentTarget);const item={...current,id:current.id||uuid()};for(const [key,val] of data.entries())item[key]=val; if(table==='events'&&item.end_time<=item.start_time){notify('Koniec wydarzenia musi być później niż początek.');return;}if(table==='tasks'){item.completed=current.completed||false;item.due_date=item.due_date||null;}if(table==='labs'){item.repeat_weekly=data.has('repeat_weekly');item.remind_days=Number(item.remind_days);item.reviewed_for_date=current.next_date===item.next_date?(current.reviewed_for_date||null):null;}if(await save(table,item)){overlay.remove();notify('Zapisano ✓');}});
}
async function reviewLab(id){const lab=activeLabs().find(l=>l.id===id);if(!lab)return;const answer=confirm(`Czy masz wszystko przygotowane na ${lab.subject}?\n\nOK — tak, sprawdzone.\nAnuluj — jeszcze muszę się przygotować.`);if(answer){const {nextOccurrence,daysAway,checked_for_next,...record}=lab;await save('labs',{...record,reviewed_for_date:nextOccurrence});notify('Oznaczono jako sprawdzone.');}else modal('labs',id);}
async function setGroup(input){const value=input.trim().toUpperCase();if(!/^WCY[0-9A-Z_*]+$/.test(value)){notify('Nieprawidłowy kod grupy WCY');return;}if(state.demo){state.profile={wat_group:value};await loadOfficial();notify('Wybrano grupę w trybie podglądu');return;}const {error}=await client.from('profiles').upsert({user_id:session.user.id,wat_group:value});if(error)notify(error.message);else {await load();notify('Grupa zapisana na Twoim koncie');}}
document.addEventListener('click',async e=>{const el=e.target.closest('[data-nav],[data-date],[data-add],[data-edit],[data-check],[data-review],[data-filter],[data-shift],[data-action],[data-calendar-mode],[data-preparation],[data-prepared],[data-preparation-filter],[data-event-filter],[data-open-event]');if(!el)return;
  if(el.dataset.eventFilter){state.eventFilter=el.dataset.eventFilter;render();}
  if(el.dataset.openEvent){const event=state.events.find(item=>item.id===el.dataset.openEvent);if(event){state.date=toDate(nextEventDate(event)||event.date);state.view='calendar';state.calendarMode='day';render();}}
  if(el.dataset.preparation!==undefined)preparationModal(Number(el.dataset.preparation));
  if(el.dataset.nav){state.view=el.dataset.nav;state.filter='all';state.preparationFilter='all';render();}
  if(el.dataset.preparationFilter){state.preparationFilter=el.dataset.preparationFilter;render();}
  if(el.dataset.prepared!==undefined)await togglePrepared(Number(el.dataset.prepared));
  if(el.dataset.date){state.date=toDate(el.dataset.date);render();}
  if(el.dataset.calendarMode){state.calendarMode=el.dataset.calendarMode;render();}
  if(el.dataset.add)modal(el.dataset.add,null,el.dataset.taskCategory);
  if(el.dataset.edit){const [table,id]=el.dataset.edit.split(':');modal(table,id);}
  if(el.dataset.filter){state.filter=el.dataset.filter;render();}
  if(el.dataset.shift){state.date=addDays(state.date,Number(el.dataset.shift));render();}
  if(el.dataset.review)await reviewLab(el.dataset.review);
  if(el.dataset.check){const t=state.tasks.find(t=>t.id===el.dataset.check);if(t)await save('tasks',{...t,completed:el.checked});}
  if(el.dataset.action==='refresh-wcy')await loadOfficial();
  if(el.dataset.action==='hide-requested-classes')await hideRequestedClasses();
  if(el.dataset.action==='calendar-today'){state.date=new Date();render();}
  if(el.dataset.action==='login')authScreen();
  if(el.dataset.action==='back-demo')render();
  if(el.dataset.action==='logout'){const {error}=await client.auth.signOut();if(error){notify('Nie udało się wylogować: '+error.message);return;}clearAccount();authScreen();}
});
document.addEventListener('submit',async e=>{if(e.target.id==='hidden-classes-form'){e.preventDefault();const form=e.target;const choices=[...new Map(state.official.map(event=>{const rule={subject:event.subject||event.title,type:event.type||''};return [JSON.stringify(rule),rule];})).values()].sort((a,b)=>a.subject.localeCompare(b.subject,'pl')||a.type.localeCompare(b.type,'pl'));const selected=new FormData(form).getAll('hidden').map(index=>choices[Number(index)]).filter(Boolean);await saveHiddenClasses(selected);return;}if(e.target.id==='group-form'){e.preventDefault();await setGroup(new FormData(e.target).get('group'));return;}if(e.target.id!=='auth-form')return;e.preventDefault();await authenticate(e.target,e.submitter?.value==='signup'?'signup':'login');});
async function start(){
  const refresh=()=>{if(document.visibilityState==='visible'&&document.querySelector('.shell')&&!document.querySelector('.dialog-backdrop')&&Date.now()-lastOfficialCheck>=30*60*1000)loadOfficial();};
  document.addEventListener('visibilitychange',refresh);setInterval(refresh,30*60*1000);
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  if(!configured){starterData();render();await loadOfficial();return;}
  try {const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.49.10');client=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}});const {data,error}=await client.auth.getSession();if(error)throw error;session=data.session;if(session)await load();else authScreen();client.auth.onAuthStateChange((event,next)=>{if(event==='SIGNED_OUT'){clearAccount();authScreen();}else if(next){const changed=session?.user.id!==next.user.id;session=next;if(changed)setTimeout(()=>load(),0);}});}catch(err){root.innerHTML='<div class="auth card"><h1>Nie udało się połączyć</h1><p>Sprawdź konfigurację Supabase i połączenie z internetem.</p></div>';console.error(err);}
}
start();
