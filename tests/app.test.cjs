const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function app(configured=false){
  const root={innerHTML:''};
  const context=vm.createContext({SUPABASE_URL:configured?'https://example.supabase.co':'',SUPABASE_ANON_KEY:configured?'public':'',document:{querySelector:()=>root,querySelectorAll:()=>[],addEventListener:()=>{}},console,Intl,Date,URL,setTimeout,clearTimeout,location:{href:'https://example.org/moj-plan/'},FormData:class{constructor(form){this.form=form;}get(key){return this.form.values[key];}}});
  const source=fs.readFileSync('app.js','utf8').replace(/^import [^\r\n]*\r?\n/,'').replace(/start\(\);\s*$/,'');
  vm.runInContext(source,context);
  return {run:code=>vm.runInContext(code,context),context,root};
}
test('week includes Monday through Sunday across year and daylight saving boundaries',()=>{
  const a=app();
  assert.equal(a.run("weekDays(toDate('2027-01-01')).join(',')"),'2026-12-28,2026-12-29,2026-12-30,2026-12-31,2027-01-01,2027-01-02,2027-01-03');
  assert.equal(a.run("onDate({date:'2026-10-19',recurrence:'weekly'},'2026-10-26')"),true);
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
