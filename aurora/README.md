# Aurora — Dream Galaxy

A living 3D galaxy of your dreams. Journal them, see them as stars, watch
patterns light up your personal universe.

**[ Live preview deploy guide → ](#-deploying-aurora-to-the-internet-10-min)**

---

## What's inside

- 3D animated galaxy (react-three-fiber + bloom postprocessing)
- Glass + neon design system, fully dark-mode
- Auth (NextAuth v5 + email/password) with per-user persistence
- Live-streaming Claude Opus 4.7 dream interpretations
- Constellation view: glowing arcs between stars sharing symbols
- AI-suggested *latent* threads: Claude finds psychological motifs that
  surface keywords would miss
- One-click galaxy wallpaper export (watermarked PNG)

---

## 🚀 Deploying Aurora to the internet (10 min)

You'll create accounts on Neon (Postgres) and Vercel (hosting), wire 3
environment variables, and click Deploy. Total time including the AI
key and account creation: about 10 minutes.

### 1 — Get your three secrets

Open three browser tabs; you'll grab one secret from each:

#### a. `DATABASE_URL` from Neon

1. Go to <https://neon.tech/> → **Sign up** (free, GitHub or email).
2. **Create a project** (any name). Pick the region closest to you.
3. On the dashboard, find the **Connection string** card and copy the
   **Pooled connection** URL. It looks like:

   ```
   postgresql://neondb_owner:abc123@ep-foo-bar.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

#### b. `ANTHROPIC_API_KEY` from Anthropic

1. Go to <https://console.anthropic.com/> → sign up.
2. Add a payment method (Aurora's usage is *very* small — under $0.10/mo
   for daily personal use).
3. Go to **API Keys** → **Create Key**. Copy the `sk-ant-...` value
   immediately (it's only shown once).

#### c. `AUTH_SECRET` from your terminal

In any terminal, run:

```bash
openssl rand -base64 32
```

Copy the random string it prints.

---

### 2 — Test it locally first

This step verifies everything works before deploying:

```bash
cd aurora
cp .env.example .env.local
```

Open `aurora/.env.local` and paste your three secrets in:

```bash
DATABASE_URL=<paste your Neon URL>
AUTH_SECRET=<paste your random string>
ANTHROPIC_API_KEY=<paste your sk-ant-... key>
```

Then:

```bash
npm install         # one-time
npm run db:push     # creates User + Dream tables in your Neon project
npm run dev
```

Open <http://localhost:3000> → sign up → orbit your galaxy → confirm AI
interpretations work. If anything's broken, fix it here before deploying.

---

### 3 — Push to GitHub

If your repo isn't on GitHub yet, push it now:

```bash
git push
```

If you don't have a GitHub remote set up, create a new private repo at
<https://github.com/new> first, then run the commands GitHub shows you.

---

### 4 — Deploy on Vercel

1. Go to <https://vercel.com/> → **Sign up with GitHub**.
2. Click **Add New** → **Project** → pick the repo containing Aurora.
3. **Important:** in the configuration screen, set **Root Directory** to
   `aurora` (since Aurora lives in a subfolder of the repo).
4. Expand **Environment Variables** and add all three from your
   `.env.local`:

   | Name                | Value                       |
   |---------------------|------------------------------|
   | `DATABASE_URL`      | your Neon URL                |
   | `AUTH_SECRET`       | your random string           |
   | `ANTHROPIC_API_KEY` | your `sk-ant-...` key        |

5. Click **Deploy**. Wait ~2 minutes for the build.
6. When it finishes, click **Visit** → your live URL is something like
   `aurora-xyz.vercel.app`.
7. Sign up with a real email + password. The same Neon database you used
   locally is now backing your live site, so your account works in both
   places.

You're done. Bookmark the URL.

---

### Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails with "Environment variable not found: DATABASE_URL" | You forgot to add the env var on Vercel. Go to **Settings → Environment Variables**, add it, then **Deployments → ⋯ → Redeploy**. |
| `db push` fails locally | Confirm your `DATABASE_URL` in `.env.local` is the *Pooled* connection from Neon (not the direct one). Pooled URL has `-pooler` in the host. |
| Login fails with "Configuration error" on the deployed site | `AUTH_SECRET` is missing or differs between local and Vercel. Make sure both have the same value. |
| AI interpretation says "Aurora couldn't reach Claude" | Check that `ANTHROPIC_API_KEY` is set on Vercel and your Anthropic account has billing enabled. |

---

## Local development (after deploy)

Once you've gone through the deploy steps once, future local dev is just:

```bash
cd aurora
npm run dev
```

Your `.env.local` is already configured. The same Neon DB is used.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | **Next.js 14** (App Router) |
| Styling | **Tailwind CSS** + glass / neon design tokens |
| Animations | **Framer Motion** |
| 3D | **react-three-fiber** + **drei** + **postprocessing** (bloom) |
| Icons | **lucide-react** |
| Auth | **NextAuth v5** (Credentials, JWT sessions) |
| Database | **Prisma 6** + **PostgreSQL** (Neon) |
| AI | **@anthropic-ai/sdk** → streaming **Claude Opus 4.7** |

## Folder map

```
aurora/
├── app/
│   ├── layout.tsx                   Global shell (fonts, theme, SessionProvider)
│   ├── page.tsx                     The protected galaxy view
│   ├── login/, signup/              Glass-themed auth pages
│   ├── globals.css                  Glass + glow + aurora utilities
│   └── api/
│       ├── auth/                    NextAuth handler + custom signup
│       ├── dreams/                  GET/POST /dreams + PATCH/DELETE /dreams/[id]
│       ├── interpret/               Streams Claude dream interpretations
│       └── threads/                 Generates AI-suggested latent threads
├── components/
│   ├── auth/, layout/               Auth shell, sidebar, topbar, user menu
│   ├── galaxy/                      3D Canvas, stars, constellation arcs,
│   │                                  thread hubs, export bridge
│   ├── dreams/                      New-dream modal, detail drawer,
│   │                                  stat strip, constellation panel
│   └── ui/                          Glass primitives
├── lib/
│   ├── db.ts                        Prisma client singleton
│   ├── ai.ts                        Anthropic SDK wrapper (interpret + threads)
│   ├── stream.ts                    Client streaming helper
│   ├── seed-dreams.ts               12-dream starter universe per new user
│   ├── dreams.ts, threads.ts        Domain types
│   ├── constellations.ts            Edge computation + symbol palette
│   ├── export-galaxy.ts             Wallpaper capture + watermark
│   └── utils.ts
├── prisma/schema.prisma             User + Dream tables (Postgres)
├── auth.config.ts                   Edge-safe NextAuth config (middleware)
├── auth.ts                          Full NextAuth config (Credentials + Prisma)
└── middleware.ts                    Protects everything except /login,
                                       /signup, /api/auth
```

## Useful scripts

```bash
npm run dev          # Next.js dev server with HMR
npm run build        # prisma generate + next build (production)
npm run db:push      # Sync schema.prisma → your Postgres
npm run db:studio    # Prisma's web GUI for inspecting your DB
```
