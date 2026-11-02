// Server-only Web Push sender. Invoke via a trusted scheduler with x-cron-secret.
// No VAPID private key, service-role key or scheduler secret is shipped to GitHub Pages.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };
type Profile = { user_id: string; wat_group: string; hidden_classes: { subject: string; type: string }[] | null };
type Lab = { id: string; user_id: string; subject: string; next_date: string; remind_days: number; repeat_weekly: boolean; reviewed_for_date: string | null };
type Task = { id: string; user_id: string; due_date: string | null; completed: boolean };
type Answer = { user_id: string; occurrence_key: string };
type Reminder = { key: string; title: string; body: string; tag: string };

function dateInWarsaw(now: Date): string {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
function timeInWarsaw(now: Date): string {
  return new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Warsaw',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
}
function addDays(date: string, count: number): string {
  const value=new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate()+count);
  return value.toISOString().slice(0,10);
}
function daysBetween(a: string,b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`)-Date.parse(`${a}T12:00:00Z`))/86400000);
}
function mondayOf(date: string): string {
  const weekday=new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date,-((weekday+6)%7));
}
function equalSecret(a: string,b: string): boolean {
  const left=new TextEncoder().encode(a),right=new TextEncoder().encode(b);
  let diff=left.length^right.length;
  for(let i=0;i<Math.max(left.length,right.length);i++)diff|=(left[i]||0)^(right[i]||0);
  return diff===0;
}
function typeOfLesson(value: string): string | null {
  const type=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  if(/^(laboratorium|laboratoria|lab|l)\.?$/.test(type))return 'Laboratorium';
  if(/^(cwiczenia|cwiczenia audytoryjne|cw|c)\.?$/.test(type))return 'Ćwiczenia';
  return null;
}
function isHidden(subject: string,type: string,profile: Profile): boolean {
  return (profile.hidden_classes||[]).some(rule=>rule.subject===subject&&(!rule.type||rule.type===type));
}

Deno.serve(async request=>{
  const cronSecret=Deno.env.get('CRON_SECRET')||'';
  if(request.method!=='POST'||!cronSecret||!equalSecret(request.headers.get('x-cron-secret')||'',cronSecret)){
    return new Response('Unauthorized',{status:401});
  }
  const url=Deno.env.get('SUPABASE_URL');
  const adminKey=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const publicKey=Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey=Deno.env.get('VAPID_PRIVATE_KEY');
  const subject=Deno.env.get('VAPID_SUBJECT');
  if(!url||!adminKey||!publicKey||!privateKey||!subject)return new Response('Missing server configuration',{status:503});

  const supabase=createClient(url,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const [subscriptions,profiles,labs,tasks,answers]=await Promise.all([
    supabase.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').limit(1000),
    supabase.from('profiles').select('user_id,wat_group,hidden_classes').limit(1000),
    supabase.from('labs').select('id,user_id,subject,next_date,remind_days,repeat_weekly,reviewed_for_date').limit(1000),
    supabase.from('tasks').select('id,user_id,due_date,completed').eq('completed',false).limit(1000),
    supabase.from('class_preparations').select('user_id,occurrence_key').limit(1000),
  ]);
  const failures=[subscriptions,profiles,labs,tasks,answers].filter(result=>result.error);
  if(failures.length){console.error('Reminder query failed');return new Response('Database query failed',{status:500});}
  const devices=(subscriptions.data||[]) as Subscription[];
  const userProfiles=(profiles.data||[]) as Profile[];
  const ownLabs=(labs.data||[]) as Lab[];
  const ownTasks=(tasks.data||[]) as Task[];
  const checked=(answers.data||[]) as Answer[];
  const today=dateInWarsaw(new Date());
  const nextWeek=addDays(today,7);
  const tomorrow=addDays(today,1);
  const currentClock=timeInWarsaw(new Date());
  const reminders=new Map<string,Reminder[]>();
  function append(uid: string,item: Reminder){reminders.set(uid,[...(reminders.get(uid)||[]),item]);}

  for(const lab of ownLabs){
    let date=lab.next_date;
    if(lab.repeat_weekly){while(date<today)date=addDays(date,7);}
    if(date<today||daysBetween(today,date)>lab.remind_days||lab.reviewed_for_date===date)continue;
    append(lab.user_id,{key:`lab:${lab.id}:${date}`,title:'Przygotowanie do laboratorium',body:'Czy trzeba coś zrobić lub czegoś się nauczyć przed najbliższymi zajęciami?',tag:'moj-plan-lab'});
  }
  for(const task of ownTasks){
    if(!task.due_date||task.due_date<today||task.due_date>tomorrow)continue;
    append(task.user_id,{key:`task:${task.id}:${task.due_date}`,title:'Zbliża się termin zadania',body:task.due_date===today?'Masz zadanie na dziś. Sprawdź listę w aplikacji.':'Masz zadanie z terminem na jutro.',tag:'moj-plan-task'});
  }

  // Official timetable reminders: one weekly question per account, no private notes in push payload.
  const base=Deno.env.get('TIMETABLE_BASE_URL')||'https://aleksanderzeneli.github.io/moj-plan/data/';
  const groupEvents=new Map<string,unknown[]>();
  for(const profile of userProfiles){
    const group=String(profile.wat_group||'').toUpperCase();
    if(!/^WCY[0-9A-Z_*]+$/.test(group))continue;
    if(!groupEvents.has(group)){
      try{
        const response=await fetch(new URL(`${encodeURIComponent(group)}.json`,base),{signal:AbortSignal.timeout(8000)});
        const data= response.ok ? await response.json() : null;
        groupEvents.set(group,data?.group===group&&Array.isArray(data?.events)?data.events:[]);
      }catch{groupEvents.set(group,[]);}
    }
    const entries=groupEvents.get(group)||[];
    const pending=entries.filter((entry):entry is Record<string,unknown>=>Boolean(entry&&typeof entry==='object')).filter(event=>{
      const date=String(event.date||''),start=String(event.start_time||'');
      const subject=String(event.subject||event.title||''),type=String(event.type||'');
      if(!typeOfLesson(type)||isHidden(subject,type,profile)||date<today||date>=nextWeek)return false;
      if(date===today&&start.slice(0,5)<=currentClock)return false;
      const key=JSON.stringify([group,subject,typeOfLesson(type),date,start.slice(0,5)]);
      return !checked.some(answer=>answer.user_id===profile.user_id&&answer.occurrence_key===key);
    });
    if(pending.length)append(profile.user_id,{key:`official-week:${mondayOf(today)}`,title:'Czy trzeba się przygotować na zajęcia?',body:`Masz ${pending.length} zajęć do sprawdzenia w tym tygodniu.`,tag:'moj-plan-preparation'});
  }

  webpush.setVapidDetails(subject,publicKey,privateKey);
  let sent=0,failed=0;
  for(const device of devices){
    for(const reminder of reminders.get(device.user_id)||[]){
      const {error:reserveError}=await supabase.from('notification_deliveries').insert({subscription_id:device.id,reminder_key:reminder.key});
      if(reserveError){if(reserveError.code!=='23505')failed++;continue;}
      try{
        await webpush.sendNotification({endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth}},JSON.stringify({title:reminder.title,body:reminder.body,tag:reminder.tag}),{TTL:86400});
        sent++;
      }catch(error){
        failed++;
        const code=Number((error as {statusCode?: number}).statusCode);
        if(code===404||code===410)await supabase.from('push_subscriptions').delete().eq('id',device.id);
        else await supabase.from('notification_deliveries').delete().eq('subscription_id',device.id).eq('reminder_key',reminder.key);
      }
    }
  }
  return Response.json({sent,failed,devices:devices.length});
});
