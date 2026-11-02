# Security and privacy

- Never commit passwords, e-Dziekanat credentials, Supabase `service_role` keys,
  private tokens, signing keys, or production user records.
- `config.js` intentionally contains no credentials. The Pages workflow can
  inject Supabase **publishable** settings from GitHub Actions repository
  variables. Publishable/anon keys are visible to every browser visitor and
  cannot be used as server secrets. Never use a secret key in this application.
- Private notes, events and tasks belong in Supabase, with the ownership RLS
  policies in `supabase/schema.sql` applied and tested before launch.
- GitHub Pages hosts public source code, static assets and (eventually) public
  university timetable data only. Do not commit user task exports or profiles.
- The service worker caches only static application assets, not authenticated
  API responses or private records.
- Use HTTPS. Never send WAT credentials to our timetable importer.
- If a secret is ever committed, revoke/rotate it immediately. Deleting it
  from a newer commit does not remove it from Git history.

The default deployment has no Supabase settings, so it is a DEMO and has no
working account system until the owner configures their Supabase project.
