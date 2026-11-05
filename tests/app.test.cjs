const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function app(configured=false){
  const root={innerHTML:''};
  const context=vm.createContext({SUPABASE_URL:configured?'https://example.supabase.co':'',SUPABASE_ANON_KEY:configured?'public':'',VAPID_PUBLIC_KEY:'',WEB_PUSH_ENABLED:false,document:{querySelector:()=>root,querySelectorAll:()=>[],addEventListener:()=>{}},console,Intl,Date,URL,setTimeout,clearTimeout,location:{href:'https://example.org/moj-plan/'},FormData:class{constructor(form){this.form=form;}get(key){return this.form.values[key];}}});
  const source=fs.readFileSync('app.js','utf8').replace(/^import [^\r\n]*\r?\n/,'').replace(/start\(\);\s*$/,'');
  vm.runInContext(source,context);
  return {run:code=>vm.runInContext(code,context),context,root};
}
test('week includes Monday through Sunday across year and daylight saving boundaries',()=>{
  const a=app();
  assert.equal(a.run("weekDays(toDate('2027-01-01')).join(',')"),'2026-12-28,2026-12-29,2026-12-30,2026-12-31,2027-01-01,2027-01-02,2027-01-03');
  assert.equal(a.run("onDate({date:'2026-10-19',recurrence:'weekly'},'2026-10-26')"),true);
});
test('mobile week displays all seven days with every event and opens day details',()=>{
  const a=app();
  a.run("state.date=toDate('2026-11-02');state.events=[{title:'Fizyka',date:'2026-11-02',start_time:'08:00',end_time:'09:35',kind:'university'},{title:'Wizyta',date:'2026-11-08',start_time:'17:00',end_time:'18:00',kind:'personal'}]");
  const html=a.run('weekCalendar()');
  assert.equal((html.match(/class="mobile-week-day /g)||[]).length,7);
  assert.ok(html.includes('data-date="2026-11-08" data-calendar-mode="day"'));
  assert.ok(html.includes('08:00–09:35')&&html.includes('Fizyka')&&html.includes('17:00–18:00')&&html.includes('Wizyta'));
  assert.equal((html.match(/class="mobile-week-slot /g)||[]).length,2);
  const styles=fs.readFileSync('styles.css','utf8');
  assert.match(styles,/\.week-scroll,\.desktop-calendar-note\{display:none\}/);
});
test('settings do not occupy the mobile bar and the shortcut remains accessible',()=>{
  const a=app();
  const nav=a.run('sidebar()');
  assert.equal((nav.match(/class="mobile-nav"/g)||[]).length,1);
  const mobile=nav.slice(nav.indexOf('class="mobile-nav"'));
  assert.equal((mobile.match(/data-nav=/g)||[]).length,4);
  assert.ok(!mobile.includes('data-nav="labs"')&&mobile.includes('Do zrobienia'));
  assert.ok(!mobile.includes('data-nav="settings"'));
  assert.ok(a.run('render();root.innerHTML').includes('aria-label="Ustawienia"'));
  assert.match(fs.readFileSync('styles.css','utf8'),/\.shell \.mobile-nav\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});
test('week renders official and personal events, overlaps and Sunday; deadlines stay outside time grid',()=>{
  const a=app();
  a.run("state.date=toDate('2026-11-02');state.events=[{id:'one',title:'Prywatne',date:'2026-11-02',start_time:'08:00',end_time:'10:00',kind:'personal'},{id:'two',title:'Niedziela',date:'2026-11-08',start_time:'22:00',end_time:'23:00'}];state.official=[{id:'wcy:one',title:'<WAT>',date:'2026-11-02',start_time:'09:00',end_time:'11:00',source:'wcy'}];state.tasks=[{title:'Deadline'}]");
  const html=a.run('weekCalendar()');
  assert.equal((html.match(/class="week-heading/g)||[]).length,7);
  assert.ok(html.includes('Niedziela')&&html.includes('&lt;WAT&gt;')&&html.includes('Oficjalny WCY'));
  assert.ok(html.includes('width:calc(50% - 4px)'));
  assert.ok(!html.includes('data-edit="events:wcy:one"')&&!html.includes('Deadline'));
});
test('logout clears private records and invalidates pending timetable fetch',()=>{
  const a=app();
  a.run("state.events=[{}];state.tasks=[{}];state.labs=[{}];state.profile={wat_group:'WCY25KY2S1'};session={user:{id:'a'}};clearAccount()");
  assert.equal(a.run('state.events.length+state.tasks.length+state.labs.length+state.official.length'),0);
  assert.equal(a.run('session===null&&state.profile===null&&officialRequest===1'),true);
});
test('signup confirmation, redirect and auth errors are displayed; buttons unlock',async()=>{
  const a=app(true),message={textContent:''},buttons=[{disabled:false}];
  const form={values:{email:' student@example.org ',password:'password'},querySelector:()=>message,querySelectorAll:()=>buttons};
  a.context.form=form;
  a.run("client={auth:{signUp:async input=>{globalThis.credentials=input;return {data:{session:null},error:null};},signInWithPassword:async()=>({error:{message:'Invalid login credentials'}})}}");
  await a.run("authenticate(form,'signup')");
  assert.ok(message.textContent.includes('potwierdź'));
  assert.equal(a.context.credentials.email,'student@example.org');
  assert.equal(a.context.credentials.options.emailRedirectTo,'https://example.org/moj-plan/');
  await a.run("authenticate(form,'login')");
  assert.ok(message.textContent.includes('Invalid login credentials'));
  assert.equal(buttons[0].disabled,false);
});
test('preparation prompts include only labs and exercises within next seven Warsaw days',()=>{
  const a=app();
  a.run("state.profile={wat_group:'WCY25KY2S1'};state.official=[{id:'lab',title:'Bazy',type:'Laboratorium',date:'2026-11-02',start_time:'08:00',end_time:'09:35'},{id:'exercise',title:'Matematyka',type:'Ćwiczenia',date:'2026-11-08',start_time:'08:00',end_time:'09:35'},{id:'lecture',title:'Wykład',type:'Wykład',date:'2026-11-04',start_time:'08:00',end_time:'09:35'},{id:'later',title:'Za tydzień',type:'Laboratorium',date:'2026-11-09',start_time:'08:00',end_time:'09:35'}]");
  assert.equal(a.run("upcomingPreparations(new Date('2026-11-02T06:00:00Z')).map(e=>e.id).join(',')"),'lab,exercise');
  assert.equal(a.run("upcomingPreparations(new Date('2026-11-02T09:00:00Z')).map(e=>e.id).join(',')"),'exercise');
});
test('five adjacent timetable periods create two preparation blocks, preserving whole times and old answers',()=>{
  const a=app();
  a.run(`state.profile={wat_group:'WCY25KY2S1'};
    state.official=[['08:00','09:35','Architektura i organizacja komputerów (Laboratorium 5/16)','120 65'],['09:50','11:25','Architektura i organizacja komputerów (Laboratorium 6/16)','120 65'],['11:40','13:15','Architektura i organizacja komputerów (Laboratorium 7/16)','120 65'],['16:00','17:35','Systemy Operacyjne (Laboratorium 3/13)','239 S'],['17:50','19:25','Systemy Operacyjne (Laboratorium 4/13)','239 S']].map(([start_time,end_time,subject,location],i)=>({id:String(i),title:subject,subject,type:'Laboratorium',date:'2026-11-06',start_time,end_time,location}));`);
  const blocks=JSON.parse(a.run("JSON.stringify(upcomingPreparations(new Date('2026-11-05T08:00:00Z')).map(e=>({title:e.title,start:e.start_time,end:e.end_time,parts:e.parts.length})))"));
  assert.deepEqual(blocks,[{title:'Architektura i organizacja komputerów',start:'08:00',end:'13:15',parts:3},{title:'Systemy Operacyjne',start:'16:00',end:'19:25',parts:2}]);
  a.run("state.preparations=[{occurrence_key:occurrenceKey(state.official[1]),required:true,completed:false,notes:'Uczyć się rejestrów'}]");
  assert.equal(a.run("upcomingPreparations(new Date('2026-11-05T08:00:00Z'))[0].answer.notes"),'Uczyć się rejestrów');
  assert.equal(a.run("upcomingPreparations(new Date('2026-11-05T08:00:00Z'))[0].preparationKey===occurrenceKey(state.official[0])"),true);
});
test('homepage prioritizes actionable tasks and merged checklist has colored sections',()=>{
  const a=app();
  a.run("state.tasks=[{id:'one',title:'Nauczyć się C',category:'university',completed:false},{id:'two',title:'Zakupy',category:'personal',completed:false}]");
  const home=a.run('todayView()');
  assert.ok(home.indexOf('Do zrobienia teraz')<home.indexOf('Plan dnia'));
  assert.ok(home.includes('Nauczyć się C')&&home.includes('Zakupy'));
  const tasks=a.run('tasksView()');
  for(const token of ['todo-university','todo-preparation','todo-personal','Nauczyć się C','Zakupy'])assert.ok(tasks.includes(token));
});
test('push settings explain activation when background sending is disabled',()=>{
  const a=app(true);
  a.run("session={user:{id:'one',email:'test@example.org'}}");
  const html=a.run('notificationSettings()');
  assert.ok(html.includes('Wysyłka automatyczna nie jest jeszcze skonfigurowana'));
  assert.ok(html.includes('WEB_PUSH_ENABLED=true'));
  assert.ok(!html.includes('data-action="enable-push"'));
});
test('room and upstream ID changes keep answers; moved classes and different groups ask again',()=>{
  const a=app();
  a.run("state.profile={wat_group:'WCY25KY2S1'};globalThis.event={id:'wcy:old',subject:'Bazy',type:'Laboratorium',date:'2026-11-03',start_time:'08:00',end_time:'09:35',location:'213'};globalThis.key=occurrenceKey(event);state.preparations=[{occurrence_key:key,required:false,notes:'Sprawdzone'}];state.official=[{...event,id:'planwat:new',location:'214'}]");
  assert.equal(a.run("upcomingPreparations(new Date('2026-11-02T06:00:00Z'))[0].answer.required"),false);
  assert.equal(a.run("occurrenceKey({...event,date:'2026-11-04'})!==key"),true);
  assert.equal(a.run("occurrenceKey({...event,start_time:'09:50'})!==key"),true);
  assert.equal(a.run("state.profile.wat_group='WCY26KY3S1';occurrenceKey(event)!==key"),true);
});
test('university and personal lists stay separate, including old tasks without a category',()=>{
  const a=app();
  a.run("state.tasks=[{id:'school',title:'Sprawozdanie',category:'university',completed:false},{id:'personal',title:'Zakupy',category:'personal',completed:false},{id:'legacy',title:'Stare zadanie',completed:false}]");
  const school=a.run("taskList(Infinity,'university')"),personal=a.run("taskList(Infinity,'personal')");
  assert.ok(school.includes('Sprawozdanie')&&!school.includes('Zakupy')&&!school.includes('Stare zadanie'));
  assert.ok(personal.includes('Zakupy')&&personal.includes('Stare zadanie')&&!personal.includes('Sprawozdanie'));
  a.run("state.tasks[0].category='personal'");
  assert.ok(!a.run("taskList(Infinity,'university')").includes('Sprawozdanie'));
});
test('daily tasks complete only today and return tomorrow in Warsaw',()=>{
  const a=app();
  assert.equal(a.run("warsawToday(new Date('2026-11-02T22:59:00Z'))"),'2026-11-02');
  assert.equal(a.run("warsawToday(new Date('2026-11-02T23:01:00Z'))"),'2026-11-03');
  a.run("globalThis.daily={id:'daily',title:'Ćwicz',category:'personal',recurrence:'daily',completed:false,due_date:null,last_completed_on:null};daily=taskToggle(daily,true,'2026-11-02');state.tasks=[daily]");
  assert.equal(a.run("taskCompleted(daily,'2026-11-02')"),true);
  assert.equal(a.run("taskCompleted(daily,'2026-11-03')"),false);
  assert.equal(a.run("daily.completed"),false);
  assert.equal(a.run("taskToggle(daily,false,'2026-11-02').last_completed_on"),null);
  assert.equal(a.run("taskAvailable({...daily,due_date:'2026-11-04'},'2026-11-03')"),false);
  assert.equal(a.run("taskAvailable({...daily,due_date:'2026-11-04'},'2026-11-04')"),true);
});
test('daily tasks display recurrence and filter by completion for the current day',()=>{
  const a=app();
  a.run("state.tasks=[{id:'d',title:'Codzienna nauka',category:'personal',recurrence:'daily',last_completed_on:warsawToday(),completed:false},{id:'o',title:'Jednorazowe',category:'personal',completed:true}];state.filter='done'");
  const done=a.run("taskList(Infinity,'personal')");
  assert.ok(done.includes('Codzienna nauka')&&done.includes('Jednorazowe')&&done.includes('Dziś zrobione'));
  a.run("state.filter='active'");
  assert.ok(!a.run("taskList(Infinity,'personal')").includes('Codzienna nauka'));
  a.run("state.tasks[0].last_completed_on='2020-01-01'");
  const active=a.run("taskList(Infinity,'personal')");
  assert.ok(active.includes('Codzienna nauka')&&active.includes('Codziennie')&&!active.includes('Jednorazowe'));
});
test('preparation statuses and dashboard counts distinguish unchecked, pending and completed',()=>{
  const a=app();
  a.run("state.profile={wat_group:'WCY25KY2S1'};state.official=Array.from({length:4},(_,i)=>({id:String(i),title:'Zajęcia '+i,type:'Laboratorium',date:localDate(addDays(new Date(),1)),start_time:'08:00',end_time:'09:35'}));state.preparations=state.official.slice(1).map((e,i)=>({occurrence_key:occurrenceKey(e),required:i!==2,completed:i===1}));state.tasks=[{category:'university',completed:false},{category:'personal',completed:false},{category:'personal',completed:true}]");
  const count=JSON.parse(a.run('JSON.stringify(dashboardCounts())'));
  assert.deepEqual(count,{check:1,prepare:1,university:1,personal:1,events:0});
  const html=a.run('preparationCards()');
  for(const status of ['check','prepare','done','none'])assert.ok(html.includes('status-'+status));
  a.run("state.preparationFilter='prepare'");
  const filtered=a.run('preparationCards()');
  assert.ok(filtered.includes('Zajęcia 1')&&!filtered.includes('Zajęcia 0')&&!filtered.includes('Zajęcia 2'));
  assert.ok(filtered.includes('data-preparation="1"'));
});
test('hidden classes affect only the current profile, calendar and preparation prompts',()=>{
  const a=app();
  a.run("globalThis.tomorrow=localDate(addDays(new Date(),1));state.profile={wat_group:'WCY25KY2S1',hidden_classes:[{subject:'Bazy danych',type:'Ćwiczenia'},{subject:'Język angielski',type:''}]};state.official=[['Bazy danych','Ćwiczenia'],['Bazy danych','Laboratorium'],['Bazy danych','Wykład'],['Język angielski','Ćwiczenia'],['Język obcy (II) międzywydziałowy','Ćwiczenia']].map(([title,type],i)=>({id:String(i),title,type,date:tomorrow,start_time:'08:00',end_time:'09:35'}))");
  assert.equal(a.run('allEvents().map(e=>e.id).join()'),'1,2,4');
  assert.equal(a.run('upcomingPreparations().map(e=>e.id).join()'),'1,4');
  assert.equal(a.run('state.official.length'),5);
  a.run("state.profile={wat_group:'WCY25KY2S1',hidden_classes:[]}");
  assert.equal(a.run('allEvents().length'),5);
});
test('completed preparation is removed from pending count and can be reopened in demo',async()=>{
  const a=app();
  a.run("state.official=[{title:'Bazy',type:'Laboratorium',date:localDate(addDays(new Date(),1)),start_time:'08:00',end_time:'09:35'}];state.preparations=[{occurrence_key:occurrenceKey(state.official[0]),required:true,completed:false}]");
  await a.run('togglePrepared(0)');
  assert.equal(a.run('dashboardCounts().prepare'),0);
  await a.run('togglePrepared(0)');
  assert.equal(a.run('dashboardCounts().prepare'),1);
});
test('manual events tab excludes official timetable and handles weekly events across DST',()=>{
  const a=app();
  a.run("state.events=[{id:'past',title:'Minione spotkanie',date:'2026-10-01',start_time:'08:00',end_time:'09:00',recurrence:'none'},{id:'weekly',title:'Trening',date:'2026-10-19',start_time:'17:00',end_time:'18:00',recurrence:'weekly'}];state.official=[{id:'wcy:a',title:'Oficjalny wykład',date:'2026-11-03',start_time:'08:00',end_time:'09:35',source:'wcy'}]");
  assert.equal(a.run("nextEventDate(state.events[1],'2026-10-26')"),'2026-10-26');
  assert.equal(a.run("manualEventOccurrences(toDate('2026-11-02')).find(e=>e.id==='weekly').nextOccurrence"),'2026-11-02');
  const html=a.run("state.eventFilter='all';eventsView()");
  assert.ok(html.includes('Trening')&&html.includes('Minione spotkanie'));
  assert.ok(!html.includes('Oficjalny wykład'));
  assert.ok(html.includes('data-edit="events:weekly"')&&html.includes('data-open-event="weekly"'));
  assert.ok(!a.run("state.eventFilter='upcoming';eventsView()").includes('Minione spotkanie'));
});
test('finished one-off events are past and weekly events advance after their end time',()=>{
  const a=app();
  a.run("state.events=[{id:'one',title:'Spotkanie',date:'2026-11-02',start_time:'08:00',end_time:'09:00',recurrence:'none'},{id:'weekly',title:'Trening',date:'2026-10-26',start_time:'08:00',end_time:'09:00',recurrence:'weekly'}]");
  assert.equal(a.run("manualEventOccurrences(toDate('2026-11-02')).find(e=>e.id==='one').nextOccurrence"),null);
  assert.equal(a.run("manualEventOccurrences(toDate('2026-11-02')).find(e=>e.id==='weekly').nextOccurrence"),'2026-11-09');
});
