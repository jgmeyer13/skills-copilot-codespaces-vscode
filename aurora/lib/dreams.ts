// Mock dream universe — replaces DB until Phase 4.
// Each dream becomes a star in the 3D galaxy.

export type Emotion =
  | "wonder"
  | "fear"
  | "joy"
  | "sorrow"
  | "lucid"
  | "anxious"
  | "peaceful";

export type Dream = {
  id: string;
  title: string;
  body: string;
  date: string; // ISO
  emotion: Emotion;
  vividness: number; // 1..10
  symbols: string[];
  interpretation: string;
  // Position is computed from id+emotion if absent.
  position?: [number, number, number];
};

export const EMOTION_COLOR: Record<Emotion, string> = {
  wonder: "#67E8F9",
  fear: "#FB7185",
  joy: "#FCD34D",
  sorrow: "#818CF8",
  lucid: "#A855F7",
  anxious: "#F97316",
  peaceful: "#86EFAC",
};

export const EMOTION_LABEL: Record<Emotion, string> = {
  wonder: "Wonder",
  fear: "Fear",
  joy: "Joy",
  sorrow: "Sorrow",
  lucid: "Lucid",
  anxious: "Anxious",
  peaceful: "Peaceful",
};

export const MOCK_DREAMS: Dream[] = [
  {
    id: "d-001",
    title: "The Glass Ocean",
    body: "I walked across an ocean made of glass. Beneath my feet, schools of luminous fish moved like constellations.",
    date: "2026-04-22T03:14:00Z",
    emotion: "wonder",
    vividness: 9,
    symbols: ["water", "glass", "light", "fish"],
    interpretation:
      "Glass oceans often signal a fragile clarity — you're seeing through something previously opaque.",
  },
  {
    id: "d-002",
    title: "Empty Train at 3AM",
    body: "An endless train. No passengers. The conductor kept whispering my old address.",
    date: "2026-04-19T02:40:00Z",
    emotion: "anxious",
    vividness: 7,
    symbols: ["train", "address", "whisper", "darkness"],
    interpretation:
      "Recurring transit dreams point to transitional anxiety — a part of you still hasn't disembarked.",
  },
  {
    id: "d-003",
    title: "Library of Forgotten Names",
    body: "Every book on the shelves was titled with a name I half-remembered.",
    date: "2026-04-15T05:02:00Z",
    emotion: "sorrow",
    vividness: 8,
    symbols: ["library", "names", "memory"],
    interpretation:
      "The library is your archive of severed connections. The dream invites a quiet reckoning.",
  },
  {
    id: "d-004",
    title: "I Could Fly Again",
    body: "Lucid, mid-flight. I noticed a tether on my ankle and chose to keep it.",
    date: "2026-04-12T04:11:00Z",
    emotion: "lucid",
    vividness: 10,
    symbols: ["flight", "tether", "choice", "sky"],
    interpretation:
      "Choosing the tether shows growing comfort with constraint — freedom on your terms, not at any cost.",
  },
  {
    id: "d-005",
    title: "Birthday in a Field",
    body: "Everyone I have ever loved sat in a wheat field and clapped. I cried.",
    date: "2026-04-08T06:25:00Z",
    emotion: "joy",
    vividness: 9,
    symbols: ["field", "celebration", "loved-ones"],
    interpretation:
      "A reunion archetype — your subconscious is reconciling fragmented relationships into a single warmth.",
  },
  {
    id: "d-006",
    title: "The House Breathed",
    body: "My childhood house inhaled and exhaled. Doors opened on the inhale.",
    date: "2026-04-04T03:50:00Z",
    emotion: "fear",
    vividness: 8,
    symbols: ["house", "breath", "doors"],
    interpretation:
      "A breathing house is a living memory — old emotional territory still has movement in you.",
  },
  {
    id: "d-007",
    title: "Snow Falling Upward",
    body: "Snow fell upward into a violet sky. Time felt thick.",
    date: "2026-04-01T05:30:00Z",
    emotion: "wonder",
    vividness: 7,
    symbols: ["snow", "reverse", "violet", "time"],
    interpretation:
      "Inversion dreams suggest you're questioning a default you've never examined.",
  },
  {
    id: "d-008",
    title: "Soft, Slow Morning",
    body: "Nothing happened. Sunlight on a cup. I felt held.",
    date: "2026-03-28T07:10:00Z",
    emotion: "peaceful",
    vividness: 5,
    symbols: ["light", "stillness"],
    interpretation:
      "Quiet dreams are a form of integration. Your nervous system is filing the week away.",
  },
  {
    id: "d-009",
    title: "The Mirror Wouldn't Reflect",
    body: "I stood in front of a mirror that showed only the room behind me.",
    date: "2026-03-24T04:08:00Z",
    emotion: "fear",
    vividness: 8,
    symbols: ["mirror", "absence", "self"],
    interpretation:
      "A non-reflecting mirror is a cue from the unconscious: which version of you have you stopped recognizing?",
  },
  {
    id: "d-010",
    title: "Singing in a Language I Don't Know",
    body: "I sang fluently in a language I've never heard. Strangers wept.",
    date: "2026-03-19T02:55:00Z",
    emotion: "lucid",
    vividness: 9,
    symbols: ["song", "language", "unknown"],
    interpretation:
      "Untaught fluency points to latent capability — something in you is more practiced than you know.",
  },
  {
    id: "d-011",
    title: "Garden Under Glass",
    body: "I tended a garden inside a glass dome on the moon.",
    date: "2026-03-14T03:35:00Z",
    emotion: "peaceful",
    vividness: 7,
    symbols: ["garden", "moon", "dome"],
    interpretation:
      "Cultivation in isolation: you're nurturing something private that isn't ready for outside air.",
  },
  {
    id: "d-012",
    title: "Falling, Then Catching Myself",
    body: "Falling forever, then I remembered I could decide to land.",
    date: "2026-03-10T05:00:00Z",
    emotion: "lucid",
    vividness: 8,
    symbols: ["falling", "agency", "landing"],
    interpretation:
      "Classic agency-recovery — old helplessness scripts are softening into choice.",
  },
];

// Deterministic 3D position so each dream sits in a stable spot.
export function positionFor(d: Dream, i: number): [number, number, number] {
  if (d.position) return d.position;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const t = i + 0.5;
  // Spread on a "soft sphere" with light eccentricity per emotion.
  const radius = 6 + (d.vividness / 10) * 4;
  const theta = golden * t;
  const y = 1 - (t / 12) * 2;
  const r = Math.sqrt(1 - y * y);
  return [
    Math.cos(theta) * r * radius,
    y * radius * 0.6,
    Math.sin(theta) * r * radius,
  ];
}
