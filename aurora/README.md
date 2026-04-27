# Aurora — Dream Galaxy

A living 3D galaxy of your dreams. Journal them, see them as stars, and watch
patterns light up your personal universe.

> **Phase 2 status:** UI shell + animated 3D galaxy + glass panels + new-dream
> modal are live. Database, auth, and Claude AI interpretation land in Phase 4.

## Quick start

```bash
cd aurora
npm install      # only needed the first time
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stack

- **Next.js 14** (App Router) — frontend + future API in one project
- **Tailwind CSS** — styling system
- **Framer Motion** — premium UI animations
- **react-three-fiber + drei + postprocessing** — the 3D galaxy with bloom
- **lucide-react** — icons

## Folder map

```
aurora/
├── app/                    Next.js App Router pages
│   ├── layout.tsx          Global shell (fonts, dark theme)
│   ├── page.tsx            The galaxy view
│   └── globals.css         Glass + glow + aurora utilities
├── components/
│   ├── layout/             Sidebar, Topbar
│   ├── galaxy/             3D Canvas, dream stars
│   ├── dreams/             New-dream modal, detail drawer, stats
│   └── ui/                 GlassCard, NeonButton primitives
└── lib/
    ├── dreams.ts           Dream type + 12 mock dreams
    └── utils.ts            cn() helper, date formatting
```

## What you can do today

- Orbit the galaxy with the mouse (drag = rotate, scroll = zoom)
- Hover a star → see the dream title
- Click a star → open the glass detail panel with AI interpretation
- Click **+ New Dream** → add a new star with title, description, emotion, vividness

## Coming next (Phase 3+)

- NextAuth login / signup pages
- Postgres + Prisma persistence
- Real Claude API symbol extraction & interpretation
- Constellation view (group dreams by recurring symbols)
- Export your galaxy as a 4K wallpaper
