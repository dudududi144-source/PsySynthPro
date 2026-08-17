# Security Policy

## Supported scope
This is a client-side web application. There is no server, no database and no
user data collection. All audio processing happens locally in the browser.

## Secrets policy
- **No credentials of any kind** may be committed to this repository.
- `.gitignore` blocks `.env`, key files and credential stores.
- Every deployment is scanned for secret markers (GitHub PAT, Cloudflare,
  Supabase, JWT, AWS key prefixes) before it reaches `main`.

## Reporting a vulnerability
Do not open a public issue. Contact the repository owner privately with:
- reproduction steps
- affected file/commit
- potential impact

## Dependency posture
The project has **zero runtime dependencies** (no npm packages, no CDNs in
the audio path). Fonts are the only external fetch and are non-executable.
