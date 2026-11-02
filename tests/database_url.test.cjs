const {test}=require('node:test');
const assert=require('node:assert/strict');
const modulePromise=import('../tools/database_url.mjs');
const base='postgresql://postgres.project:old@aws-0-eu-north-1.pooler.supabase.com:5432/postgres';
test('database password is encoded exactly once without changing host or username',async()=>{
  const {migrationDatabaseUrl}=await modulePromise;
  const password='sample&@#%+/? with spaces';
  const url=new URL(migrationDatabaseUrl(base,password));
  assert.equal(decodeURIComponent(url.password),password);
  assert.equal(url.username,'postgres.project');
  assert.equal(url.hostname,'aws-0-eu-north-1.pooler.supabase.com');
  assert.equal(url.searchParams.get('sslmode'),'require');
});
test('an encoded password remains unchanged when no separate password is supplied',async()=>{
  const {migrationDatabaseUrl}=await modulePromise;
  const url=new URL(migrationDatabaseUrl(base.replace(':old@',':example%26word@')));
  assert.equal(decodeURIComponent(url.password),'example&word');
});
test('API addresses and placeholder passwords are rejected without exposing values',async()=>{
  const {migrationDatabaseUrl}=await modulePromise;
  assert.throws(()=>migrationDatabaseUrl('https://example.supabase.co','sensitive'),/PostgreSQL/);
  assert.throws(()=>migrationDatabaseUrl(base.replace(':old@',':%5BYOUR-PASSWORD%5D@')),/SUPABASE_DB_PASSWORD/);
});
