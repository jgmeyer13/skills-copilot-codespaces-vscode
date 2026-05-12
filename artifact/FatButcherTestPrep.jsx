import { useState } from 'react';

const CSS = `
:root {
  --bg:#0e0b07; --gold:#c48c28; --gold-soft:#d9a44a; --gold-dim:#8a6420;
  --text:#f0e6d3; --text-dim:#a89878; --card:#161009; --card-deep:#1d160d;
  --border:#2a1e0a; --right-bg:#142112; --right-border:#2f6a32; --right-text:#c7e9b4;
  --wrong-bg:#21100f; --wrong-border:#8a2828; --wrong-text:#f0c8c8;
}
.fb-wrap { background:var(--bg); color:var(--text); min-height:100vh;
  font-family:Georgia, 'Times New Roman', serif; -webkit-font-smoothing:antialiased; }
.fb-wrap *, .fb-wrap *::before, .fb-wrap *::after { box-sizing:border-box; }
.fb-wrap button { font-family:inherit; color:inherit; background:transparent;
  border:1px solid var(--border); cursor:pointer; -webkit-tap-highlight-color:transparent; }
.fb-wrap button:disabled { cursor:default; }
.fb-wrap h1, .fb-wrap h2, .fb-wrap h3 { font-family:Georgia, serif; font-weight:normal; margin:0; }
.fb-app { max-width:480px; margin:0 auto; min-height:100vh; padding:24px 16px 48px;
  display:flex; flex-direction:column; gap:20px; }
.fb-header { text-align:center; }
.fb-title { font-size:30px; color:var(--gold); letter-spacing:0.14em;
  text-transform:uppercase; line-height:1; }
.fb-rule { width:60px; height:1px; background:var(--gold-dim); margin:12px auto; }
.fb-subtitle { color:var(--text-dim); font-size:11px; letter-spacing:0.4em; text-transform:uppercase; }
.fb-mode-toggle { margin-top:18px; display:inline-flex; border:1px solid var(--border);
  border-radius:999px; overflow:hidden; background:var(--card); }
.fb-tab { padding:10px 28px; border:none; font-size:12px; letter-spacing:0.25em;
  text-transform:uppercase; color:var(--text-dim); background:transparent; }
.fb-tab.active { background:var(--gold); color:#1a1207; }
.fb-cat-tabs { display:flex; gap:6px; overflow-x:auto; padding:2px 2px 8px;
  scrollbar-width:none; -ms-overflow-style:none; }
.fb-cat-tabs::-webkit-scrollbar { display:none; }
.fb-cat-tab { flex:0 0 auto; padding:8px 14px; font-size:11px; letter-spacing:0.12em;
  text-transform:uppercase; color:var(--text-dim); background:var(--card);
  border:1px solid var(--border); border-radius:999px; white-space:nowrap; }
.fb-cat-tab.active { color:var(--gold); border-color:var(--gold); background:var(--card-deep); }
.fb-progress { text-align:center; font-size:11px; letter-spacing:0.25em;
  color:var(--text-dim); text-transform:uppercase; }
.fb-card { perspective:1400px; min-height:280px; cursor:pointer; position:relative; }
.fb-card-inner { position:relative; width:100%; min-height:280px;
  transition:transform 0.6s ease; transform-style:preserve-3d; }
.fb-card.flipped .fb-card-inner { transform:rotateY(180deg); }
.fb-card-face { position:absolute; inset:0; backface-visibility:hidden;
  -webkit-backface-visibility:hidden; background:var(--card); border:1px solid var(--border);
  border-radius:4px; padding:28px 22px; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:16px;
  box-shadow:0 1px 0 rgba(0,0,0,0.6) inset, 0 0 0 1px rgba(196,140,40,0.04); }
.fb-card-back { transform:rotateY(180deg); }
.fb-card-corner { position:absolute; top:12px; left:14px; font-size:10px;
  letter-spacing:0.25em; text-transform:uppercase; color:var(--gold-dim); }
.fb-card-hint { position:absolute; bottom:14px; right:14px; font-size:10px;
  letter-spacing:0.25em; text-transform:uppercase; color:var(--gold-dim); }
.fb-card-q { font-size:22px; line-height:1.4; color:var(--gold); text-align:center; }
.fb-card-a { font-size:17px; line-height:1.6; color:var(--text); text-align:left; }
.fb-nav { display:flex; gap:10px; }
.fb-nav button { flex:1; padding:14px; background:var(--card); border:1px solid var(--border);
  color:var(--text); font-size:12px; letter-spacing:0.2em; text-transform:uppercase; border-radius:4px; }
.fb-nav button:active { background:var(--card-deep); }
.fb-flip-btn { padding:12px; background:transparent; border:1px dashed var(--border);
  color:var(--gold-soft); font-size:11px; letter-spacing:0.25em; text-transform:uppercase; border-radius:4px; }
.fb-quiz, .fb-quiz-end { display:flex; flex-direction:column; gap:16px; }
.fb-quiz-meta { display:flex; justify-content:space-between; font-size:11px;
  letter-spacing:0.25em; color:var(--text-dim); text-transform:uppercase; }
.fb-quiz-meta .score { color:var(--gold); }
.fb-quiz-cat { font-size:10px; letter-spacing:0.35em; text-transform:uppercase;
  color:var(--gold); text-align:center; padding-top:4px; }
.fb-quiz-q { font-size:19px; line-height:1.5; background:var(--card);
  border:1px solid var(--border); border-radius:4px; padding:22px 18px;
  text-align:center; color:var(--text); }
.fb-quiz-options { display:flex; flex-direction:column; gap:10px; }
.fb-quiz-opt { padding:16px 18px; text-align:left; background:var(--card);
  border:1px solid var(--border); color:var(--text); font-size:15px; line-height:1.4;
  border-radius:4px; transition:background 0.15s, border-color 0.15s, opacity 0.15s, transform 0.1s;
  font-family:Georgia, serif; }
.fb-quiz-opt:active { transform:scale(0.99); }
.fb-quiz-opt.correct { border-color:var(--right-border); background:var(--right-bg); color:var(--right-text); }
.fb-quiz-opt.wrong { border-color:var(--wrong-border); background:var(--wrong-bg); color:var(--wrong-text); }
.fb-quiz-opt.faded { opacity:0.4; }
.fb-feedback { text-align:center; font-size:12px; letter-spacing:0.25em;
  text-transform:uppercase; padding:6px 0; }
.fb-feedback.right { color:var(--right-text); }
.fb-feedback.wrong { color:var(--wrong-text); }
.fb-btn-primary { padding:16px; background:var(--gold); border:none; color:#1a1207;
  font-size:12px; letter-spacing:0.3em; text-transform:uppercase; border-radius:4px;
  font-weight:700; font-family:Georgia, serif; }
.fb-btn-primary:active { background:var(--gold-soft); }
.fb-btn-secondary { padding:14px; background:transparent; border:1px solid var(--border);
  color:var(--text-dim); font-size:11px; letter-spacing:0.25em; text-transform:uppercase; border-radius:4px; }
.fb-quiz-end { text-align:center; gap:14px; }
.fb-end-title { font-size:26px; color:var(--gold); letter-spacing:0.15em;
  text-transform:uppercase; margin:8px 0 0; }
.fb-end-rule { width:70px; height:1px; background:var(--gold-dim); margin:6px auto 4px; }
.fb-score-big { font-size:56px; color:var(--gold); line-height:1; margin:4px 0 0; }
.fb-score-label { font-size:11px; letter-spacing:0.3em; text-transform:uppercase; color:var(--text-dim); }
.fb-missed-title { font-size:14px; letter-spacing:0.25em; text-transform:uppercase;
  color:var(--text); margin-top:16px; }
.fb-missed { list-style:none; padding:0; margin:0; display:flex; flex-direction:column;
  gap:10px; text-align:left; }
.fb-missed li { background:var(--card); border:1px solid var(--border);
  border-left:3px solid var(--wrong-border); border-radius:4px; padding:14px 16px; }
.fb-missed-q { font-size:15px; color:var(--text); line-height:1.4; }
.fb-missed-a { font-size:14px; color:var(--gold); margin-top:8px; line-height:1.4; }
.fb-missed-cat { font-size:10px; letter-spacing:0.25em; color:var(--text-dim);
  text-transform:uppercase; margin-top:8px; }
.fb-perfect { color:var(--gold); font-size:18px; font-style:italic; margin:8px 0; }
.fb-footer { text-align:center; font-size:9px; letter-spacing:0.3em; text-transform:uppercase;
  color:var(--text-dim); padding-top:24px; margin-top:auto; border-top:1px solid var(--border); }
`;

const CATEGORIES = [
  'Cuts', 'Sourcing', 'Signature Steaks', 'Starters & Mains',
  'Wine Language', 'Wine Cultivars', 'Wine Regions', 'Service & Ops',
];

const STUDY_DECK = {
  'Cuts': [
    { q: 'Fillet', a: 'Most tender, least fat & flavour — a blank canvas. Portions 200g & 300g.' },
    { q: 'T-Bone', a: 'Fillet + sirloin separated by the T-bone. Bone adds flavour. Eat bone → fat cap → bone. 500g is thin — warn guests. Managers carve sharing cuts tableside.' },
    { q: 'New York Cut', a: 'Sirloin on the bone. Dry aged 1 week. 600g.' },
    { q: 'Côte de Bœuf', a: 'Ribeye on the bone (wing rib). Dry aged. 700g – 1kg. Solo or shared.' },
    { q: 'Tomahawk', a: 'Always a sharing cut. Dry aged on site.' },
    { q: 'Ribeye / Anniversary Cut (off-menu)', a: 'Ribs 1–4 — closest to the heart, most flavourful. 500g for R550.' },
    { q: 'Wagyu Starter (off-menu)', a: 'A5 grade. 150g cooked medium rare. Asian soya, parmesan, rocket. Shares between 2–3 people. R370.' },
    { q: 'Rump prices', a: '300g — R250. 500g — R355.' },
    { q: 'Sirloin prices', a: '300g — R275. 500g — R395.' },
    { q: 'Fillet prices', a: '200g — R295. 300g — R385.' },
    { q: 'What does dry aging do?', a: 'Breaks down muscle fibres for extra tenderness and concentrated flavour.' },
    { q: 'Cooking preferences (in order)', a: 'Blue → Rare → Medium Rare → Medium → Medium Well → Knockout. Fat Butcher recommends Rare to Medium Rare.' },
  ],
  'Sourcing': [
    { q: 'Where does our beef come from?', a: 'Charma Beef — Bapsfontein, just outside Johannesburg.' },
    { q: 'Why does Charma beef taste so good? (Reason 1 — flavour)', a: 'Pasture reared and grass fed for natural flavour, then grain finished the last 2–3 weeks for extra marbling and tenderness.' },
    { q: 'Why is Charma beef so tender? (Reason 2 — tenderness)', a: 'The abattoir is on the farm. Cows are walked in — no transport, no stress, no adrenaline. The result is extremely tender meat.' },
  ],
  'Signature Steaks': [
    { q: 'Common cut for all signatures', a: 'Every signature steak is cut from the fillet.' },
    { q: 'Grosvenor — Steak aux champignons', a: 'Foraged mushrooms, pickled mustard seeds, fynbos vinegar, truffle oil, kataifi (Greek pastry for crunch), fresh black truffle. R525 / 300g · R750 / 500g.' },
    { q: 'Huguenot — Steak Bordelaise', a: 'Port wine, roasted garlic, blistered grapes, bone marrow jus. R430 / 300g · R690 / 500g.' },
    { q: 'Collins — Steak au poivre', a: 'Cointreau, crushed Madagascan peppercorns, cream. R460 / 300g · R735 / 500g.' },
    { q: 'Drostdy — Steak Afrique du Sud', a: 'Basted fillet, creamy peri-peri chicken livers, caramelised onion garlic sauce, soft cured egg yolk. R370 / 200g.' },
  ],
  'Starters & Mains': [
    { q: 'Peri-Peri Livers', a: 'Pan-fried and flambéed in brandy. R100.' },
    { q: 'Calamari', a: 'Crispy calamari, Limoncello mayo and Asian soya. R110.' },
    { q: "Rita's Mussels", a: 'West Coast black mussels, white wine, garlic, leek, a dash of Pernod. R115.' },
    { q: 'Gravlax', a: 'Salmon gravlax, honey-dill Dijonnaise, pickled onion, cucumber brioche sandwich. R185.' },
    { q: 'Carpaccio', a: 'Hand-sliced seared fillet, 15-year Giuseppe Giusti balsamic, Dijon, pickled onion petals, puffed rice paper. R155.' },
    { q: 'Steak Tartare', a: 'Hand-chopped fillet, mustard, capers, Maldon salt, parsley, yolk, boquerones, Die Mas Kalahari brandy. R165.' },
    { q: 'Beef Cheeks', a: 'Slow-braised, pomegranate jus, onion marmalade parcel. R140.' },
    { q: 'Snails', a: 'Roasted garlic, parsley, Danish Danablu cheese sauce. 10 snails for R115.' },
    { q: 'Skaapstertjies', a: 'Char-grilled lamb tails, BBQ sauce. R170.' },
    { q: 'Beef Short Rib', a: 'Asian broth, crispy cheese wonton, panko dauphinoise. R170.' },
    { q: 'Pork Ribs', a: '1kg Belgian-style pork ribs. R400.' },
    { q: 'Lamb Ribs', a: 'Char-grilled, pickled red onion, BBQ sauce. R430.' },
    { q: 'Lamb Shank', a: 'Oven-braised, port jus, parmesan mash, pumpkin fritter. R290.' },
    { q: 'Lamb Rump', a: '400g lamb rump, soya & chilli jus, rocket, rosa tomatoes, parmesan. R385.' },
    { q: 'Lamb T-Bone', a: 'Flame-grilled, double-thick tzatziki, salsa verde. R450.' },
    { q: 'The Chicken', a: 'Free-range supreme, artichokes, blistered tomatoes, fennel, mangetout, chorizo. R245.' },
    { q: 'Beef Bourguignon', a: 'Beef cheeks and rump, Burgundy red wine, mushrooms, bacon, carrot & turnip purée. R245.' },
    { q: 'Beef Cheek Gnocchi', a: 'Slow-braised beef cheek, cauliflower purée, basil, cabbage. R180.' },
    { q: '1802 Schnitzel', a: 'Veal schnitzel, creamed baby spinach, brandy pearl onions, pickled red onion. R185.' },
  ],
  'Wine Language': [
    { q: 'Body — examples by weight', a: 'Light: Pinot Noir (think skim milk). Medium: Merlot (full cream). Full: Cabernet Sauvignon (cream).' },
    { q: 'What are tannins?', a: 'The drying sensation in your mouth, coming from grape skins, seeds and oak barrels. Strongest in red wines. Fat softens tannins — which is why Cab Sav + steak is the perfect pair.' },
    { q: 'What is acidity?', a: 'What makes a wine feel fresh and vibrant. High acid makes your mouth water. Sauvignon Blanc is a high-acid example; oaked Chardonnay sits lower.' },
  ],
  'Wine Cultivars': [
    { q: 'Cabernet Sauvignon', a: 'Full bodied, high tannin. Blackcurrant, blackberry, cedar, tobacco. THE steak wine. Home: Stellenbosch, Bordeaux, Napa.' },
    { q: 'Pinotage', a: "South Africa's own grape. Created in 1925 at Stellenbosch University by Abraham Izak Perold. A cross of Pinot Noir and Cinsaut. Dark fruit, smoke, spice, chocolate. Perfect with grilled meat." },
    { q: 'Merlot', a: 'Medium to full body, softer tannins than Cab Sav. Plum, chocolate, black cherry.' },
    { q: 'Shiraz / Syrah', a: 'Same grape. Shiraz in South Africa and Australia, Syrah in France. Full body. Black pepper, dark fruit, smoke, liquorice.' },
    { q: 'Pinot Noir', a: 'Light body, low tannin. Elegant. Cherry, strawberry, earth. Home: Burgundy.' },
    { q: 'Malbec', a: 'Dark, rich, approachable. Plum, blackberry, cocoa, violet.' },
    { q: 'Cabernet Franc', a: 'Red cherry, dark berry, mineral, olive, fynbos. Powdery tannins.' },
    { q: 'Chenin Blanc', a: "South Africa's most planted white. The most versatile. Green apple, pear, guava, honey, citrus. At home in Stellenbosch and the Loire Valley." },
    { q: 'Chardonnay', a: 'The most famous white. Unoaked: crisp, citrus. Oaked: rich, buttery, vanilla.' },
    { q: 'Sauvignon Blanc', a: 'High acidity. Gooseberry, lime, green apple. Popular in South Africa and Marlborough, New Zealand.' },
  ],
  'Wine Regions': [
    { q: 'Old World vs New World', a: 'Old World = Europe — focus on place (terroir). New World = outside Europe (SA, USA, Australia, Chile, Argentina) — focus on grape variety.' },
    { q: 'Bordeaux', a: 'Cabernet Sauvignon blends. Structured and age-worthy.' },
    { q: 'Burgundy', a: 'Pinot Noir and Chardonnay only. Elegant.' },
    { q: 'Rhône', a: 'Syrah and Grenache country.' },
    { q: 'Stellenbosch sub-regions', a: 'Simonsberg — Cab Sav and Cape blends, rich. Helderberg — cooler, elegant Cab and Merlot. Bottelary Hills — warmer, Shiraz and Pinotage.' },
    { q: 'Cape Blend', a: 'Unique to South Africa — it must contain Pinotage.' },
    { q: 'GSM', a: 'Grenache, Syrah, Mourvèdre. Spicy and full-bodied.' },
  ],
  'Service & Ops': [
    { q: 'What comes with every steak?', a: 'Bone marrow and a choice of Tasty Addition.' },
    { q: 'Sharing cuts include…', a: 'Two Tasty Additions and two bone marrows. Extra bone marrow is R25.' },
    { q: 'Who carves sharing cuts?', a: 'Managers — tableside.' },
    { q: 'Sauces', a: 'Béarnaise, Bordelaise, Truffle mushroom, Monkey gland, Oven-roasted garlic, Blue cheese & vodka, Black peppercorn. Around R40 – R52.' },
    { q: 'Tasty Additions — prices', a: 'Onion rings R40 · Braaibroodjie R50 · Sweet potato mash R45 · Sweet potato chips R45 · Wilted baby spinach R60 · Side salad R62 · Baked potato R42 · Seasonal vegetables R64 · Char-grilled corn R60 · Chips R45 · Parmesan mash R45.' },
    { q: 'Trading hours', a: 'Open from 12pm daily. Kitchen closes at 10:30pm.' },
  ],
};

const QUIZ_BANK = [
  { category: 'Cuts', q: 'Which cut is "most tender, least fat & flavour — a blank canvas"?', correct: 'Fillet', distractors: ['Sirloin', 'Ribeye', 'T-Bone'] },
  { category: 'Cuts', q: 'A T-Bone joins which two cuts?', correct: 'Fillet and sirloin', distractors: ['Sirloin and ribeye', 'Fillet and rump', 'Rump and sirloin'] },
  { category: 'Cuts', q: 'Which size of T-Bone do we warn guests is thin?', correct: '500g', distractors: ['300g', '600g', '1kg'] },
  { category: 'Cuts', q: "What's the correct way to eat a T-Bone?", correct: 'Bone → fat cap → bone', distractors: ['Fat cap → bone → fat cap', 'Bone → bone → fat cap', 'Eat the bone last'] },
  { category: 'Cuts', q: 'The New York Cut is dry aged for how long?', correct: '1 week', distractors: ['2 weeks', '3 weeks', '1 month'] },
  { category: 'Cuts', q: 'What is the New York Cut?', correct: 'Sirloin on the bone, 600g', distractors: ['Fillet on the bone, 600g', 'Ribeye on the bone, 600g', 'Rump on the bone, 600g'] },
  { category: 'Cuts', q: 'The Côte de Bœuf is which cut on the bone?', correct: 'Ribeye (wing rib)', distractors: ['Sirloin', 'Fillet', 'Rump'] },
  { category: 'Cuts', q: 'Which cut is always for sharing?', correct: 'Tomahawk', distractors: ['Sirloin', 'Côte de Bœuf', 'New York Cut'] },
  { category: 'Cuts', q: 'The off-menu Anniversary Cut uses which ribs?', correct: 'Ribs 1–4, closest to the heart', distractors: ['Ribs 5–8', 'Ribs 9–12', 'All 13 ribs'] },
  { category: 'Cuts', q: 'Anniversary Cut — price for 500g?', correct: 'R550', distractors: ['R450', 'R650', 'R750'] },
  { category: 'Cuts', q: 'Wagyu Starter — what grade?', correct: 'A5', distractors: ['A3', 'A4', 'B5'] },
  { category: 'Cuts', q: 'How is the Wagyu Starter served?', correct: '150g medium rare — Asian soya, parmesan, rocket', distractors: ['200g rare — soya, parmesan, rocket', '150g rare — lemon, parmesan, rocket', '100g medium — soya, lemon, rocket'] },
  { category: 'Cuts', q: 'Wagyu Starter price?', correct: 'R370', distractors: ['R450', 'R290', 'R525'] },
  { category: 'Cuts', q: 'Wagyu Starter shares between how many?', correct: '2–3 people', distractors: ['1–2 people', '3–4 people', '4–5 people'] },
  { category: 'Cuts', q: 'Rump prices (300g / 500g)?', correct: 'R250 / R355', distractors: ['R275 / R395', 'R295 / R385', 'R225 / R330'] },
  { category: 'Cuts', q: 'Sirloin prices (300g / 500g)?', correct: 'R275 / R395', distractors: ['R250 / R355', 'R295 / R385', 'R250 / R395'] },
  { category: 'Cuts', q: 'Fillet prices (200g / 300g)?', correct: 'R295 / R385', distractors: ['R275 / R395', 'R250 / R355', 'R295 / R395'] },
  { category: 'Cuts', q: 'What does dry aging do to beef?', correct: 'Breaks down muscle fibres for tenderness and flavour', distractors: ['Adds moisture and weight', 'Removes all the fat', 'Sterilises the meat'] },
  { category: 'Cuts', q: 'Which cooking preference does Fat Butcher recommend?', correct: 'Rare to Medium Rare', distractors: ['Medium to Medium Well', 'Blue', 'Medium Well to Knockout'] },
  { category: 'Cuts', q: 'Correct order of cooking preferences?', correct: 'Blue, Rare, Medium Rare, Medium, Medium Well, Knockout', distractors: ['Rare, Blue, Medium, Medium Rare, Medium Well, Knockout', 'Blue, Medium Rare, Rare, Medium, Knockout, Medium Well', 'Rare, Medium Rare, Blue, Medium, Knockout, Medium Well'] },

  { category: 'Sourcing', q: 'Where is our beef sourced?', correct: 'Charma Beef, Bapsfontein (outside Johannesburg)', distractors: ['Karoo Beef, Beaufort West', 'Free State Beef, Bloemfontein', 'Cape Beef, Stellenbosch'] },
  { category: 'Sourcing', q: 'How are the cattle raised for flavour?', correct: 'Pasture reared & grass fed, grain finished last 2–3 weeks', distractors: ['Grain fed entirely', 'Grass fed entirely with no finishing', 'Pasture reared then grass finished'] },
  { category: 'Sourcing', q: 'Why grain finish for the last 2–3 weeks?', correct: 'Extra marbling and tenderness', distractors: ['Higher protein content', 'Cheaper feed cost', 'Builds muscle bulk'] },
  { category: 'Sourcing', q: 'Why is Charma beef so tender?', correct: 'Abattoir is on the farm — no transport, no stress, no adrenaline', distractors: ['They inject tenderising enzymes', 'They dry age for six weeks', 'They only use fillet'] },

  { category: 'Signature Steaks', q: 'All signature steaks are cut from which part?', correct: 'Fillet', distractors: ['Sirloin', 'Rump', 'Ribeye'] },
  { category: 'Signature Steaks', q: 'Grosvenor is also known as?', correct: 'Steak aux champignons', distractors: ['Steak Bordelaise', 'Steak au poivre', 'Steak Afrique du Sud'] },
  { category: 'Signature Steaks', q: 'What is kataifi?', correct: 'A Greek pastry that adds crunch', distractors: ['A foraged mushroom', 'A type of vinegar', 'A truffle variety'] },
  { category: 'Signature Steaks', q: 'Grosvenor ingredients?', correct: 'Foraged mushrooms, pickled mustard seeds, fynbos vinegar, truffle oil, kataifi, fresh black truffle', distractors: ['Port wine, roasted garlic, blistered grapes, bone marrow jus', 'Cointreau, Madagascan peppercorns, cream', 'Peri-peri livers, onion garlic sauce, soft cured yolk'] },
  { category: 'Signature Steaks', q: 'Huguenot is also known as?', correct: 'Steak Bordelaise', distractors: ['Steak au poivre', 'Steak aux champignons', 'Steak Afrique du Sud'] },
  { category: 'Signature Steaks', q: 'Huguenot ingredients?', correct: 'Port wine, roasted garlic, blistered grapes, bone marrow jus', distractors: ['Foraged mushrooms, kataifi, fresh truffle', 'Cointreau, peppercorns, cream', 'Peri-peri livers, onion garlic sauce, soft cured yolk'] },
  { category: 'Signature Steaks', q: 'Collins is also known as?', correct: 'Steak au poivre', distractors: ['Steak Bordelaise', 'Steak aux champignons', 'Steak Afrique du Sud'] },
  { category: 'Signature Steaks', q: 'Collins ingredients?', correct: 'Cointreau, Madagascan peppercorns, cream', distractors: ['Port wine, garlic, blistered grapes, bone marrow jus', 'Foraged mushrooms, kataifi, fresh truffle', 'Peri-peri livers, onion garlic sauce, soft cured yolk'] },
  { category: 'Signature Steaks', q: 'Drostdy is also known as?', correct: 'Steak Afrique du Sud', distractors: ['Steak Bordelaise', 'Steak au poivre', 'Steak aux champignons'] },
  { category: 'Signature Steaks', q: 'Drostdy ingredients?', correct: 'Basted fillet, creamy peri-peri chicken livers, caramelised onion garlic sauce, soft cured egg yolk', distractors: ['Foraged mushrooms, kataifi, truffle oil', 'Port wine, blistered grapes, bone marrow jus', 'Cointreau, Madagascan peppercorns, cream'] },
  { category: 'Signature Steaks', q: 'Grosvenor price — 300g / 500g?', correct: 'R525 / R750', distractors: ['R430 / R690', 'R460 / R735', 'R385 / R650'] },
  { category: 'Signature Steaks', q: 'Huguenot price — 300g / 500g?', correct: 'R430 / R690', distractors: ['R525 / R750', 'R460 / R735', 'R385 / R650'] },
  { category: 'Signature Steaks', q: 'Collins price — 300g / 500g?', correct: 'R460 / R735', distractors: ['R430 / R690', 'R525 / R750', 'R385 / R650'] },
  { category: 'Signature Steaks', q: 'Drostdy price — 200g?', correct: 'R370', distractors: ['R385', 'R425', 'R295'] },

  { category: 'Starters & Mains', q: 'Peri-Peri Livers — flambéed in?', correct: 'Brandy', distractors: ['Cognac', 'Rum', 'Port'] },
  { category: 'Starters & Mains', q: 'Peri-Peri Livers price?', correct: 'R100', distractors: ['R110', 'R115', 'R155'] },
  { category: 'Starters & Mains', q: 'Calamari is served with?', correct: 'Limoncello mayo and Asian soya', distractors: ['Tartare and lemon', 'Aïoli and chilli', 'Béarnaise and lemon'] },
  { category: 'Starters & Mains', q: 'Calamari price?', correct: 'R110', distractors: ['R100', 'R115', 'R155'] },
  { category: 'Starters & Mains', q: "Rita's Mussels — where are they from?", correct: 'West Coast (black mussels)', distractors: ['Knysna lagoon', 'East Coast', 'Mozambique'] },
  { category: 'Starters & Mains', q: "Rita's Mussels — splash of?", correct: 'Pernod', distractors: ['Ricard', 'Sambuca', 'Ouzo'] },
  { category: 'Starters & Mains', q: "Rita's Mussels price?", correct: 'R115', distractors: ['R155', 'R140', 'R185'] },
  { category: 'Starters & Mains', q: 'Gravlax served with?', correct: 'Honey-dill Dijonnaise, pickled onion, cucumber brioche sandwich', distractors: ['Crème fraîche, capers, blini', 'Lemon, rocket, ciabatta', 'Béarnaise and chips'] },
  { category: 'Starters & Mains', q: 'Gravlax price?', correct: 'R185', distractors: ['R165', 'R155', 'R140'] },
  { category: 'Starters & Mains', q: 'Carpaccio — which balsamic?', correct: '15-year Giuseppe Giusti', distractors: ['10-year Modena', '20-year Borgo', '25-year Acetaia'] },
  { category: 'Starters & Mains', q: 'Carpaccio garnishes?', correct: 'Dijon, pickled onion petals, puffed rice paper', distractors: ['Capers, parmesan shavings, rocket', 'Lemon, chilli, parmesan', 'Mustard, gherkin, watercress'] },
  { category: 'Starters & Mains', q: 'Carpaccio price?', correct: 'R155', distractors: ['R165', 'R185', 'R140'] },
  { category: 'Starters & Mains', q: 'Steak Tartare — which brandy?', correct: 'Die Mas Kalahari', distractors: ['KWV 10-year', 'Hennessy VS', 'Van Ryn 12'] },
  { category: 'Starters & Mains', q: 'Steak Tartare garnishes?', correct: 'Mustard, capers, Maldon salt, parsley, yolk, boquerones', distractors: ['Capers, gherkin, dill, yolk', 'Mustard, capers, lemon, parsley', 'Onion, mustard, parsley, anchovy'] },
  { category: 'Starters & Mains', q: 'Steak Tartare price?', correct: 'R165', distractors: ['R155', 'R185', 'R145'] },
  { category: 'Starters & Mains', q: 'Beef Cheeks served with?', correct: 'Pomegranate jus, onion marmalade parcel', distractors: ['Red wine jus, mash', 'Mushroom jus, polenta', 'Jus and parsnip purée'] },
  { category: 'Starters & Mains', q: 'Beef Cheeks price?', correct: 'R140', distractors: ['R155', 'R165', 'R185'] },
  { category: 'Starters & Mains', q: 'Snails — sauce + cheese?', correct: 'Roasted garlic, parsley, Danablu cheese sauce', distractors: ['Garlic, parsley, butter', 'Garlic, blue cheese, brandy', 'Garlic, gorgonzola, cream'] },
  { category: 'Starters & Mains', q: 'Snails — portion and price?', correct: '10 snails for R115', distractors: ['12 snails for R140', '6 snails for R100', '10 snails for R165'] },
  { category: 'Starters & Mains', q: 'Skaapstertjies?', correct: 'Char-grilled lamb tails, BBQ sauce', distractors: ['Grilled lamb tongue, BBQ sauce', 'Grilled lamb shank, BBQ', 'Lamb chops, peri-peri'] },
  { category: 'Starters & Mains', q: 'Skaapstertjies price?', correct: 'R170', distractors: ['R155', 'R185', 'R140'] },
  { category: 'Starters & Mains', q: 'Beef Short Rib served with?', correct: 'Asian broth, crispy cheese wonton, panko dauphinoise', distractors: ['Mushroom broth, polenta', 'Red wine jus, mash', 'Korean broth, kimchi'] },
  { category: 'Starters & Mains', q: 'Beef Short Rib price?', correct: 'R170', distractors: ['R185', 'R245', 'R290'] },
  { category: 'Starters & Mains', q: 'Pork Ribs — origin, portion and price?', correct: '1kg Belgian-style — R400', distractors: ['500g Belgian — R350', '1kg German — R400', '1kg Belgian — R450'] },
  { category: 'Starters & Mains', q: 'Lamb Ribs price?', correct: 'R430', distractors: ['R400', 'R450', 'R290'] },
  { category: 'Starters & Mains', q: 'Lamb Shank served with?', correct: 'Port jus, parmesan mash, pumpkin fritter', distractors: ['Red wine jus, polenta, fritter', 'Jus, mash, greens', 'Port jus, polenta, pumpkin'] },
  { category: 'Starters & Mains', q: 'Lamb Shank price?', correct: 'R290', distractors: ['R245', 'R385', 'R450'] },
  { category: 'Starters & Mains', q: 'Lamb Rump — portion and price?', correct: '400g for R385', distractors: ['300g for R385', '500g for R450', '400g for R450'] },
  { category: 'Starters & Mains', q: 'Lamb Rump garnishes?', correct: 'Soya & chilli jus, rocket, rosa tomatoes, parmesan', distractors: ['Soya, mushroom, rocket', 'Chilli jus, mash, broccoli', 'BBQ, mash, salad'] },
  { category: 'Starters & Mains', q: 'Lamb T-Bone garnishes?', correct: 'Double-thick tzatziki, salsa verde', distractors: ['Tzatziki and mint sauce', 'Salsa verde and chimichurri', 'Tzatziki and jus'] },
  { category: 'Starters & Mains', q: 'Lamb T-Bone price?', correct: 'R450', distractors: ['R430', 'R385', 'R290'] },
  { category: 'Starters & Mains', q: 'The Chicken accompaniments?', correct: 'Artichokes, blistered tomatoes, fennel, mangetout, chorizo', distractors: ['Mushrooms, mash, fennel, chorizo', 'Artichokes, tomato, broccoli, lemon', 'Mangetout, chorizo, peppers, garlic'] },
  { category: 'Starters & Mains', q: 'The Chicken price?', correct: 'R245', distractors: ['R290', 'R185', 'R385'] },
  { category: 'Starters & Mains', q: 'Beef Bourguignon — which cuts?', correct: 'Beef cheeks and rump', distractors: ['Cheeks and fillet', 'Brisket and rump', 'Shin and rump'] },
  { category: 'Starters & Mains', q: 'Beef Bourguignon price?', correct: 'R245', distractors: ['R290', 'R185', 'R385'] },
  { category: 'Starters & Mains', q: 'Beef Cheek Gnocchi — which purée?', correct: 'Cauliflower', distractors: ['Parsnip', 'Potato', 'Celeriac'] },
  { category: 'Starters & Mains', q: 'Beef Cheek Gnocchi price?', correct: 'R180', distractors: ['R165', 'R185', 'R245'] },
  { category: 'Starters & Mains', q: '1802 Schnitzel — which meat?', correct: 'Veal', distractors: ['Pork', 'Chicken', 'Beef'] },
  { category: 'Starters & Mains', q: '1802 Schnitzel garnishes?', correct: 'Creamed baby spinach, brandy pearl onions, pickled red onion', distractors: ['Mushroom sauce, spinach, onion', 'Creamed spinach, mushrooms, gravy', 'Lemon, capers, parsley'] },
  { category: 'Starters & Mains', q: '1802 Schnitzel price?', correct: 'R185', distractors: ['R165', 'R245', 'R155'] },

  { category: 'Wine Language', q: 'Light-bodied example?', correct: 'Pinot Noir (skim milk)', distractors: ['Merlot (full cream)', 'Cab Sav (cream)', 'Shiraz'] },
  { category: 'Wine Language', q: 'Medium-bodied example?', correct: 'Merlot (full cream)', distractors: ['Pinot Noir (skim milk)', 'Cab Sav (cream)', 'Pinotage'] },
  { category: 'Wine Language', q: 'Full-bodied example?', correct: 'Cabernet Sauvignon (cream)', distractors: ['Pinot Noir', 'Merlot', 'Sauvignon Blanc'] },
  { category: 'Wine Language', q: 'What are tannins?', correct: 'The drying sensation from grape skins, seeds and oak', distractors: ['Sweetness from residual sugar', 'The acidity in red wine', 'The fizz in wine'] },
  { category: 'Wine Language', q: 'Why is Cab Sav + steak the perfect pair?', correct: 'Fat softens tannins', distractors: ['Tannins soften fat', 'Tannins add sweetness', 'They are both red'] },
  { category: 'Wine Language', q: 'What does acidity do in a wine?', correct: 'Makes it fresh and vibrant — high acid makes the mouth water', distractors: ['Adds sweetness', 'Adds body', 'Adds tannin'] },
  { category: 'Wine Language', q: 'A high-acid wine example?', correct: 'Sauvignon Blanc', distractors: ['Oaked Chardonnay', 'Cabernet Sauvignon', 'Merlot'] },

  { category: 'Wine Cultivars', q: 'Cabernet Sauvignon characteristics?', correct: 'Full body, high tannin — blackcurrant, blackberry, cedar, tobacco', distractors: ['Light body, low tannin — cherry, earth', 'Medium body, soft tannin — plum, chocolate', 'Full body — pepper, smoke, liquorice'] },
  { category: 'Wine Cultivars', q: 'Cabernet Sauvignon home regions?', correct: 'Stellenbosch, Bordeaux, Napa', distractors: ['Burgundy, Loire, Marlborough', 'Rhône, Stellenbosch, Mendoza', 'Loire, Stellenbosch, Napa'] },
  { category: 'Wine Cultivars', q: 'Who created Pinotage and where?', correct: 'Abraham Izak Perold at Stellenbosch University, 1925', distractors: ['Jan Smuts in Paarl, 1900', 'A Constantia farmer, 1950', 'Abraham Perold in Cape Town, 1925'] },
  { category: 'Wine Cultivars', q: 'Pinotage is a cross of?', correct: 'Pinot Noir and Cinsaut', distractors: ['Pinot Noir and Shiraz', 'Cab Sav and Cinsaut', 'Pinot Noir and Cabernet Franc'] },
  { category: 'Wine Cultivars', q: 'Pinotage flavour profile?', correct: 'Dark fruit, smoke, spice, chocolate', distractors: ['Cherry, strawberry, earth', 'Plum, cocoa, violet', 'Blackcurrant, cedar, tobacco'] },
  { category: 'Wine Cultivars', q: 'Merlot profile?', correct: 'Medium-full body, softer tannins — plum, chocolate, black cherry', distractors: ['Full body, high tannin — blackcurrant', 'Light body, low tannin — cherry', 'High acid — gooseberry, lime'] },
  { category: 'Wine Cultivars', q: 'Shiraz and Syrah — same or different?', correct: 'Same grape — Shiraz in SA & Australia, Syrah in France', distractors: ['Different grapes entirely', 'Syrah is a Rhône blend', 'Shiraz is a blend of Syrah and Grenache'] },
  { category: 'Wine Cultivars', q: 'Shiraz / Syrah flavours?', correct: 'Black pepper, dark fruit, smoke, liquorice', distractors: ['Cherry, earth, strawberry', 'Plum, chocolate, cherry', 'Gooseberry, lime, green apple'] },
  { category: 'Wine Cultivars', q: 'Pinot Noir profile?', correct: 'Light body, low tannin — cherry, strawberry, earth — Burgundy', distractors: ['Full body — blackcurrant — Bordeaux', 'Medium body — plum, chocolate', 'High acid — gooseberry, citrus'] },
  { category: 'Wine Cultivars', q: 'Malbec flavours?', correct: 'Plum, blackberry, cocoa, violet', distractors: ['Cherry, earth, strawberry', 'Blackcurrant, cedar, tobacco', 'Pepper, smoke, liquorice'] },
  { category: 'Wine Cultivars', q: 'Cabernet Franc notes?', correct: 'Red cherry, dark berry, mineral, olive, fynbos — powdery tannins', distractors: ['Plum, cocoa, violet — soft tannins', 'Blackcurrant, cedar, tobacco — high tannin', 'Cherry, strawberry, earth — low tannin'] },
  { category: 'Wine Cultivars', q: "South Africa's most planted white?", correct: 'Chenin Blanc', distractors: ['Chardonnay', 'Sauvignon Blanc', 'Sémillon'] },
  { category: 'Wine Cultivars', q: 'Chenin Blanc flavour profile?', correct: 'Green apple, pear, guava, honey, citrus', distractors: ['Gooseberry, lime, green apple', 'Buttery, vanilla, tropical', 'Apricot, peach, blossom'] },
  { category: 'Wine Cultivars', q: 'Chenin Blanc home regions?', correct: 'Stellenbosch and Loire Valley', distractors: ['Stellenbosch and Burgundy', 'Marlborough and Loire', 'Napa and Loire'] },
  { category: 'Wine Cultivars', q: 'Unoaked Chardonnay?', correct: 'Crisp and citrusy', distractors: ['Rich, buttery, vanilla', 'Sweet, tropical', 'Fizzy and fresh'] },
  { category: 'Wine Cultivars', q: 'Oaked Chardonnay?', correct: 'Rich, buttery, vanilla', distractors: ['Crisp, citrus', 'Sweet, light', 'High acid, gooseberry'] },
  { category: 'Wine Cultivars', q: 'Sauvignon Blanc profile?', correct: 'High acidity — gooseberry, lime, green apple', distractors: ['Low acid — peach', 'Medium acid — buttery', 'Light — plum, cherry'] },
  { category: 'Wine Cultivars', q: 'Sauvignon Blanc — popular regions?', correct: 'South Africa and Marlborough, New Zealand', distractors: ['Bordeaux and Napa', 'Mendoza and Stellenbosch', 'Loire and Mendoza'] },

  { category: 'Wine Regions', q: 'Old World wine =', correct: 'Europe — focus on place (terroir)', distractors: ['Outside Europe — focus on grape', 'South America only', 'Australia only'] },
  { category: 'Wine Regions', q: 'New World wine =', correct: 'Outside Europe — focus on grape variety', distractors: ['Europe — focus on place', 'South America only', 'Only USA and Australia'] },
  { category: 'Wine Regions', q: 'Bordeaux is known for?', correct: 'Cabernet Sauvignon blends — structured, age-worthy', distractors: ['Pinot Noir and Chardonnay only', 'Syrah and Grenache', 'Riesling'] },
  { category: 'Wine Regions', q: 'Burgundy is known for?', correct: 'Pinot Noir and Chardonnay only', distractors: ['Cab Sav blends', 'Syrah and Grenache', 'Riesling'] },
  { category: 'Wine Regions', q: 'Rhône is known for?', correct: 'Syrah and Grenache', distractors: ['Pinot Noir and Chardonnay', 'Cab Sav blends', 'Riesling'] },
  { category: 'Wine Regions', q: 'Simonsberg style?', correct: 'Cab Sav and Cape blends — rich', distractors: ['Cooler, elegant Cab and Merlot', 'Warmer, Shiraz and Pinotage', 'Pinot Noir and Chardonnay'] },
  { category: 'Wine Regions', q: 'Helderberg style?', correct: 'Cooler — elegant Cab and Merlot', distractors: ['Warmer — Shiraz and Pinotage', 'Rich Cab and Cape blends', 'Light Pinot Noir'] },
  { category: 'Wine Regions', q: 'Bottelary Hills style?', correct: 'Warmer — Shiraz and Pinotage', distractors: ['Cooler, elegant Cab and Merlot', 'Rich Cab and Cape blends', 'Light Pinot'] },
  { category: 'Wine Regions', q: 'A Cape Blend must contain?', correct: 'Pinotage', distractors: ['Cabernet Sauvignon', 'Shiraz', 'Cinsaut'] },
  { category: 'Wine Regions', q: 'GSM stands for?', correct: 'Grenache, Syrah, Mourvèdre', distractors: ['Grenache, Semillon, Merlot', 'Gewürztraminer, Syrah, Malbec', 'Grenache, Sangiovese, Merlot'] },
  { category: 'Wine Regions', q: 'GSM style?', correct: 'Spicy and full-bodied', distractors: ['Light and crisp', 'Sweet, dessert style', 'Fizzy and dry'] },

  { category: 'Service & Ops', q: 'What comes with every steak?', correct: 'Bone marrow and a choice of Tasty Addition', distractors: ['Two sauces', 'Side salad and chips', 'Mash and jus'] },
  { category: 'Service & Ops', q: 'Sharing cuts come with…', correct: '2 Tasty Additions and 2 bone marrows', distractors: ['1 Tasty Addition and 1 bone marrow', '3 Tasty Additions, no marrow', '2 sauces only'] },
  { category: 'Service & Ops', q: 'Extra bone marrow charge?', correct: 'R25', distractors: ['R20', 'R30', 'R40'] },
  { category: 'Service & Ops', q: 'Who carves sharing cuts tableside?', correct: 'Managers', distractors: ['Sommeliers', 'Waiters', 'Chefs'] },
  { category: 'Service & Ops', q: 'Onion rings price?', correct: 'R40', distractors: ['R45', 'R50', 'R60'] },
  { category: 'Service & Ops', q: 'Braaibroodjie price?', correct: 'R50', distractors: ['R45', 'R40', 'R60'] },
  { category: 'Service & Ops', q: 'Sweet potato mash price?', correct: 'R45', distractors: ['R50', 'R60', 'R62'] },
  { category: 'Service & Ops', q: 'Wilted baby spinach price?', correct: 'R60', distractors: ['R50', 'R62', 'R45'] },
  { category: 'Service & Ops', q: 'Side salad price?', correct: 'R62', distractors: ['R60', 'R64', 'R45'] },
  { category: 'Service & Ops', q: 'Baked potato price?', correct: 'R42', distractors: ['R45', 'R40', 'R50'] },
  { category: 'Service & Ops', q: 'Seasonal vegetables price?', correct: 'R64', distractors: ['R62', 'R60', 'R45'] },
  { category: 'Service & Ops', q: 'Char-grilled corn price?', correct: 'R60', distractors: ['R45', 'R50', 'R62'] },
  { category: 'Service & Ops', q: 'Chips price?', correct: 'R45', distractors: ['R40', 'R50', 'R42'] },
  { category: 'Service & Ops', q: 'Parmesan mash price?', correct: 'R45', distractors: ['R42', 'R50', 'R60'] },
  { category: 'Service & Ops', q: 'Sauce price range?', correct: 'R40 – R52', distractors: ['R30 – R40', 'R50 – R65', 'R45 – R55'] },
  { category: 'Service & Ops', q: 'Which sauce contains vodka?', correct: 'Blue cheese & vodka', distractors: ['Béarnaise', 'Monkey gland', 'Black peppercorn'] },
  { category: 'Service & Ops', q: 'Trading hours?', correct: 'Open from 12pm daily; kitchen closes 10:30pm', distractors: ['Open from 11am; closes 10pm', 'Open from 12pm; closes 11pm', 'Open from 11am; closes 10:30pm'] },
];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildSession(bank) {
  return shuffle(bank).map((q) => ({
    ...q,
    options: shuffle([q.correct, ...q.distractors]),
  }));
}

function Header({ mode, setMode }) {
  return (
    <header className="fb-header">
      <h1 className="fb-title">Fat Butcher</h1>
      <div className="fb-rule" />
      <div className="fb-subtitle">Test Prep</div>
      <div className="fb-mode-toggle">
        <button
          className={`fb-tab ${mode === 'study' ? 'active' : ''}`}
          onClick={() => setMode('study')}
        >Study</button>
        <button
          className={`fb-tab ${mode === 'quiz' ? 'active' : ''}`}
          onClick={() => setMode('quiz')}
        >Quiz</button>
      </div>
    </header>
  );
}

function StudyMode() {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const cards = STUDY_DECK[category];
  const card = cards[index];

  const go = (delta) => {
    setIndex((i) => {
      const next = i + delta;
      if (next < 0) return cards.length - 1;
      if (next >= cards.length) return 0;
      return next;
    });
    setFlipped(false);
  };

  const selectCategory = (c) => {
    setCategory(c);
    setIndex(0);
    setFlipped(false);
  };

  return (
    <div className="fb-study">
      <div className="fb-cat-tabs">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            className={`fb-cat-tab ${c === category ? 'active' : ''}`}
            onClick={() => selectCategory(c)}
          >{c}</button>
        ))}
      </div>
      <div className="fb-progress">Card {index + 1} of {cards.length}</div>
      <div
        className={`fb-card ${flipped ? 'flipped' : ''}`}
        onClick={() => setFlipped((f) => !f)}
      >
        <div className="fb-card-inner">
          <div className="fb-card-face">
            <div className="fb-card-corner">{category}</div>
            <div className="fb-card-q">{card.q}</div>
            <div className="fb-card-hint">Tap to reveal</div>
          </div>
          <div className="fb-card-face fb-card-back">
            <div className="fb-card-corner">Answer</div>
            <div className="fb-card-a">{card.a}</div>
            <div className="fb-card-hint">Tap to flip back</div>
          </div>
        </div>
      </div>
      <div className="fb-nav">
        <button onClick={() => go(-1)}>← Prev</button>
        <button onClick={() => go(1)}>Next →</button>
      </div>
      <button className="fb-flip-btn" onClick={() => setFlipped((f) => !f)}>
        {flipped ? 'Hide answer' : 'Reveal answer'}
      </button>
    </div>
  );
}

function QuizMode() {
  const [questions, setQuestions] = useState(() => buildSession(QUIZ_BANK));
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState([]);
  const [selected, setSelected] = useState(null);
  const [done, setDone] = useState(false);

  const q = questions[idx];

  const pick = (opt) => {
    if (selected !== null) return;
    setSelected(opt);
    if (opt === q.correct) setScore((s) => s + 1);
    else setMissed((m) => [...m, { category: q.category, q: q.q, correct: q.correct, distractors: q.distractors }]);
  };

  const next = () => {
    if (idx + 1 >= questions.length) setDone(true);
    else {
      setIdx((i) => i + 1);
      setSelected(null);
    }
  };

  const retryMissed = () => {
    if (missed.length === 0) return;
    setQuestions(buildSession(missed));
    setIdx(0); setScore(0); setMissed([]); setSelected(null); setDone(false);
  };

  const restart = () => {
    setQuestions(buildSession(QUIZ_BANK));
    setIdx(0); setScore(0); setMissed([]); setSelected(null); setDone(false);
  };

  if (done) {
    return (
      <div className="fb-quiz-end">
        <h2 className="fb-end-title">Service Done</h2>
        <div className="fb-end-rule" />
        <div className="fb-score-big">{score}<span style={{ color: 'var(--text-dim)' }}>/</span>{questions.length}</div>
        <div className="fb-score-label">Correct</div>
        {missed.length > 0 ? (
          <>
            <div className="fb-missed-title">Missed — Review</div>
            <ul className="fb-missed">
              {missed.map((m, i) => (
                <li key={i}>
                  <div className="fb-missed-q">{m.q}</div>
                  <div className="fb-missed-a">→ {m.correct}</div>
                  <div className="fb-missed-cat">{m.category}</div>
                </li>
              ))}
            </ul>
            <button className="fb-btn-primary" onClick={retryMissed}>
              Retry Missed ({missed.length})
            </button>
            <button className="fb-btn-secondary" onClick={restart}>Restart Full Quiz</button>
          </>
        ) : (
          <>
            <p className="fb-perfect">Clean sweep. Cab Sav on the house.</p>
            <button className="fb-btn-primary" onClick={restart}>Play Again</button>
          </>
        )}
      </div>
    );
  }

  const isAnswered = selected !== null;
  const wasRight = isAnswered && selected === q.correct;

  return (
    <div className="fb-quiz">
      <div className="fb-quiz-meta">
        <span>Q {idx + 1} / {questions.length}</span>
        <span className="score">Score {score}</span>
      </div>
      <div className="fb-quiz-cat">{q.category}</div>
      <div className="fb-quiz-q">{q.q}</div>
      <div className="fb-quiz-options">
        {q.options.map((o, i) => {
          let cls = 'fb-quiz-opt';
          if (isAnswered) {
            if (o === q.correct) cls += ' correct';
            else if (o === selected) cls += ' wrong';
            else cls += ' faded';
          }
          return (
            <button
              key={i}
              className={cls}
              onClick={() => pick(o)}
              disabled={isAnswered}
            >{o}</button>
          );
        })}
      </div>
      {isAnswered && (
        <>
          <div className={`fb-feedback ${wasRight ? 'right' : 'wrong'}`}>
            {wasRight ? '✓ Sharp.' : '✗ Not quite.'}
          </div>
          <button className="fb-btn-primary" onClick={next}>
            {idx + 1 >= questions.length ? 'Finish' : 'Next →'}
          </button>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState('study');
  return (
    <div className="fb-wrap">
      <style>{CSS}</style>
      <div className="fb-app">
        <Header mode={mode} setMode={setMode} />
        {mode === 'study' ? <StudyMode /> : <QuizMode />}
        <footer className="fb-footer">Cab Sav + Steak · The Perfect Pair</footer>
      </div>
    </div>
  );
}
