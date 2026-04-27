# Aurora — Dream Galaxy

A living 3D galaxy of your dreams. Journal them, see them as stars, and watch
patterns light up your personal universe.

> **Phase 3 status:** UI shell, animated 3D galaxy, glass panels, new-dream
> modal **and live-streaming Claude AI interpretation** are wired up. Database
> + auth land in Phase 4.

## Quick start

```bash
cd aurora
npm install                       # only needed the first time
cp .env.example .env.local        # then paste your real key in
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Setting up the AI key

Aurora uses Claude (Opus 4.7) to interpret dreams. To enable it:

1. Get an API key from <https://console.anthropic.com/>.
2. Copy `.env.example` to `.env.local`.
3. Replace the placeholder with your real `sk-ant-...` key.
4. Restart `npm run dev`.

Without a key, the modal still works — it falls back to a placeholder
interpretation and the rest of the galaxy is fully usable.

## Stack

- **Next.js 14** (App Router) — frontend + API routes in one project
- **Tailwind CSS** — styling system
- **Framer Motion** — premium UI animations
- **react-three-fiber + drei + postprocessing** — the 3D galaxy with bloom
- **lucide-react** — icons
- **@anthropic-ai/sdk** — streaming Claude Opus 4.7 dream interpretations

## Folder map

```
aurora/
├── app/                    Next.js App Router pages
│   ├── layout.tsx          Global shell (fonts, dark theme)
│   ├── page.tsx            The galaxy view
│   ├── globals.css         Glass + glow + aurora utilities
│   └── api/
│       └── interpret/      POST endpoint → streams Claude Opus 4.7
├── components/
│   ├── layout/             Sidebar, Topbar
│   ├── galaxy/             3D Canvas, dream stars
│   ├── dreams/             New-dream modal, detail drawer, stats
│   └── ui/                 GlassCard, NeonButton primitives
└── lib/
    ├── ai.ts               Anthropic SDK wrapper + system prompt
    ├── stream.ts           Client-side streaming helper
    ├── dreams.ts           Dream type + 12 mock dreams
    └── utils.ts            cn() helper, date formatting
```

## What you can do today

- Orbit the galaxy with the mouse (drag = rotate, scroll = zoom)
- Hover a star → see the dream title
- Click a star → open the glass detail panel
- Click **Re-interpret** on any star → watch Claude Opus 4.7 stream a fresh
  reading in real-time
- Click **+ New Dream** → describe a dream and watch the AI interpretation
  type itself live in the modal before the new star is added to your galaxy

## Coming next (Phase 4+)

- NextAuth login / signup pages
- Postgres + Prisma persistence
- Constellation view (group dreams by recurring symbols)
- Export your galaxy as a 4K wallpaper
