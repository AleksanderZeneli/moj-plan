import { mkdirSync, writeFileSync } from 'node:fs';

const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_ANON_KEY ?? '';
const vapidPublic = process.env.VAPID_PUBLIC_KEY ?? '';
const pushEnabled = process.env.WEB_PUSH_ENABLED === 'true';
if (Boolean(url) !== Boolean(key)) {
  throw new Error('Both SUPABASE_URL and SUPABASE_ANON_KEY must be set together.');
}
if (url && !/^https:\/\/[a-z0-9.-]+\.supabase\.co\/?$/i.test(url)) {
  throw new Error('Unexpected Supabase URL format');
}
if (vapidPublic && !/^[a-zA-Z0-9_-]{80,100}$/.test(vapidPublic)) {
  throw new Error('Unexpected public VAPID key format');
}
// Anon/publishable keys are designed for untrusted clients. Never use service_role here.
mkdirSync('dist', { recursive: true });
writeFileSync('dist/config.js',
  `export const SUPABASE_URL = ${JSON.stringify(url)};\n` +
  `export const SUPABASE_ANON_KEY = ${JSON.stringify(key)};\n` +
  `export const VAPID_PUBLIC_KEY = ${JSON.stringify(vapidPublic)};\n` +
  `export const WEB_PUSH_ENABLED = ${JSON.stringify(pushEnabled)};\n`,
  { encoding: 'utf8', mode: 0o644 });
console.log(url ? 'Public Supabase settings included in browser build.' : 'No Supabase project configured: DEMO build.');
