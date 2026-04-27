# Aurora — Dream Galaxy

A living 3D galaxy of your dreams. Journal them, see them as stars, and watch
patterns light up your personal universe.

> **Phase 4 status:** Auth (NextAuth v5 + email/password), Prisma + SQLite
> persistence, protected routes, and per-user starter universes are live.
> Phase 5 ships constellation view + galaxy-export.

## Quick start

```bash
cd aurora
cp .env.example .env.local             # then fill in AUTH_SECRET + ANTHROPIC_API_KEY
npm install                            # generates the Prisma client (postinstall)
npm run db:push                        # creates dev.db with the User + Dream tables
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → you'll be redirected to
`/signup`. Create an account and you'll land in your galaxy with 12 seed
dreams already lit.

### What goes in `.env.local`

```bash
# Generate with: openssl rand -base64 32
AUTH_SECRET=<a long random string>

# Get one at https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-...
```

The `DATABASE_URL` lives in the committed `.env` (just a SQLite file path).
Override it in `.env.local` to point at Postgres for production.

Without an `ANTHROPIC_API_KEY`, sign-up + login + saving dreams still work —
new dreams just get a placeholder interpretation instead of a streamed Claude
reading.

## Stack

| Layer | Tech |
|---|---|
| Framework | **Next.js 14** (App Router) |
| Styling | **Tailwind CSS** + glass / neon design tokens |
| Animations | **Framer Motion** |
| 3D | **react-three-fiber** + **drei** + **postprocessing** (bloom) |
| Icons | **lucide-react** |
| Auth | **NextAuth v5** (Credentials provider, JWT sessions) |
| Database | **Prisma** + **SQLite** locally (swap to Postgres for prod) |
| AI | **@anthropic-ai/sdk** → streaming **Claude Opus 4.7** |

## Folder map

```
aurora/
├── app/
│   ├── layout.tsx                   Global shell (fonts, theme, SessionProvider)
│   ├── page.tsx                     The protected galaxy view
│   ├── login/page.tsx               Glass-themed sign-in
│   ├── signup/page.tsx              Glass-themed sign-up (auto-seeds starter dreams)
│   ├── globals.css                  Glass + glow + aurora utilities
│   └── api/
│       ├── auth/[...nextauth]/      NextAuth v5 handler
│       ├── auth/signup/             Email + password signup → bcrypt hash → seed dreams
│       ├── interpret/               POST → streams Claude Opus 4.7 dream interpretations
│       ├── dreams/                  GET (list mine) / POST (create mine)
│       └── dreams/[id]/             PATCH (update interpretation) / DELETE
├── components/
│   ├── auth/auth-shell.tsx          Shared glass layout for /login + /signup
│   ├── layout/                      Sidebar, Topbar, UserMenu
│   ├── galaxy/                      3D Canvas, dream stars
│   ├── dreams/                      New-dream modal, detail drawer, stats strip
│   └── ui/                          GlassCard, NeonButton primitives
├── lib/
│   ├── db.ts                        Prisma client singleton
│   ├── ai.ts                        Anthropic SDK wrapper + system prompt
│   ├── stream.ts                    Client async-iterator over fetch ReadableStream
│   ├── seed-dreams.ts               Seeds new users with 12 starter dreams
│   ├── dreams.ts                    Dream type + emotion palette + mock seed
│   └── utils.ts                     cn() + date formatting
├── prisma/
│   └── schema.prisma                User + Dream tables
├── auth.config.ts                   Edge-safe NextAuth config (used by middleware)
├── auth.ts                          Full NextAuth config (Credentials + Prisma)
└── middleware.ts                    Protects everything except /login, /signup, /api/auth
```

## What you can do today

- Sign up at `/signup` — get a galaxy seeded with 12 starter dreams instantly.
- Sign in at `/login`. Sessions are JWT cookies signed with `AUTH_SECRET`.
- Orbit the galaxy with the mouse (drag = rotate, scroll = zoom).
- Hover a star → see the dream title; click → open the glass detail panel.
- Click **Re-interpret** → watch Claude Opus 4.7 stream a fresh reading in real
  time. The new text persists to your DB.
- Click **+ New Dream** → describe a dream, watch the AI interpretation type
  itself live in the modal, then save it as a new star in your galaxy.
- Click your initial in the top-right → sign out.

## Useful scripts

```bash
npm run dev          # Next.js dev server with HMR
npm run build        # Production build (also compiles types)
npm run db:push      # Sync schema.prisma → SQLite (no migration files)
npm run db:studio    # Prisma's web GUI for inspecting your DB
```

## Going to production

1. Create a Postgres DB (e.g. on Neon or Supabase).
2. Set `DATABASE_URL=postgres://…` in your hosting env.
3. Change `provider = "sqlite"` → `provider = "postgresql"` in `prisma/schema.prisma`.
4. Run `npx prisma migrate deploy` (or `db push` for the first deploy).
5. Set a strong `AUTH_SECRET` and `ANTHROPIC_API_KEY` in your host's env vars.
6. Deploy (Vercel works out of the box for Next.js + the Anthropic SDK).

## Coming next (Phase 5+)

- Constellation view — glowing arcs between stars sharing symbols
- Onboarding intro: cinematic camera fly-through with typewriter narration
- Galaxy export → 4K wallpaper
- Searchable timeline drawer
- Magic-link auth (Resend) as a passwordless alternative
