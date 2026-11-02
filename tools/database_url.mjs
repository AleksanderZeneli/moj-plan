import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function migrationDatabaseUrl(input, password) {
  let url;
  try {url=new URL(input);} catch {throw new Error('SUPABASE_DB_URL musi być adresem PostgreSQL z okna Connect.');}
  if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('Wymagany jest adres PostgreSQL, nie publiczny adres API.');
  if(!url.hostname.endsWith('.pooler.supabase.com')&&url.hostname!=='db.swibobkcydlxzzoueqli.supabase.co')throw new Error('Nieoczekiwany host bazy Supabase.');
  if(password!==undefined&&password!=='')url.password=encodeURIComponent(password);
  if(!url.password||decodeURIComponent(url.password)==='[YOUR-PASSWORD]')throw new Error('Dodaj sekret SUPABASE_DB_PASSWORD z aktualnym hasłem bazy.');
  url.searchParams.set('sslmode','require');
  return url.href;
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  try{
    const url=migrationDatabaseUrl(process.env.SUPABASE_DB_URL,process.env.SUPABASE_DB_PASSWORD);
    if(!process.env.GITHUB_ENV)throw new Error('Ten skrypt przygotowuje połączenie wyłącznie w GitHub Actions.');
    // Mask the derived URL too: its encoding can differ from the original secret.
    console.log('::add-mask::'+url);
    appendFileSync(process.env.GITHUB_ENV,'MIGRATION_DB_URL='+url+'\n');
    console.log('Przygotowano zaszyfrowane połączenie do migracji.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
