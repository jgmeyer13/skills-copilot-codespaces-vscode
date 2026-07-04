# Warbase Math Engine

An offline financial-mathematics study engine for BCom Supply Chain Management —
time value of money, investment appraisal, depreciation, economics, statistics,
and a clearly-fenced trader's annex of risk-management math.

Dark, disciplined, Roman-military aesthetic. No server. No build step. No network.

## How to open it

Double-click **`index.html`**. That's it.

Everything runs from `file://` in any modern browser (Chrome, Edge, Firefox, Safari).
KaTeX and Chart.js are vendored locally in `lib/`, so it works with the Wi-Fi off.
All state — scores, custom equations, settings, exam history — lives in your
browser's `localStorage` and never leaves your machine.

To verify the build, open **`tests.html`**: every equation is asserted against
known textbook answers and shows a green/red result. All rows must be green.

## The views

| View | What it does |
|---|---|
| **Library** | Searchable, category-filtered grid of every equation (search matches name, symbols, description). Click a card to open it in the solver. |
| **Solver** | Pick the unknown, fill in the rest, press Enter. Full KaTeX worked steps; charts where they earn their place (growth curves, amortisation schedule + principal/interest split, NPV profile, Poisson bars). Cash-flow equations get an add-row table instead of single fields. |
| **Practice** | Randomised word problems by category and difficulty. Flow: attempt → **H** for hint (the right formula) → **S** for the full solution → auto-check or self-mark. Per-category accuracy is tracked. |
| **Exam** | Timed mixed quiz (questions, categories, minutes all configurable). Ends with score, time, per-category breakdown, weakest topics, and a stored history so you can watch the trend. |
| **Formula sheet** | Print-friendly sheet of all formulas grouped by category (`@media print` CSS) — one click to print. |
| **Add equation** | Define new equations in the browser with live KaTeX preview and relation validation; export/import JSON backups. |
| **Settings** | Dark/light theme, currency symbol (default R), decimal places, and the Roman-numeral easter egg (vinculum notation: an overline multiplies by 1 000). |

**Keyboard flow:** `Enter` solves / checks · `N` next practice question · `H` hint · `S` show solution.

**Weak-spot engine:** practice and exam draws are weighted by
`weight = 1 / (accuracy + 0.15)` per category — the worse you score somewhere,
the more often it comes for you.

**Percent inputs:** type `9.5` to mean 9.5%. Internally the engine works with
decimals; every displayed number is properly rounded (no `0.30000000000000004`).
Numbers format in `en-ZA` style (`R1 234,56`).

## Architecture — the equation registry

The entire app is driven by one array in `js/equations.js` (`WB.EQUATIONS`).
One equation = one object. The solver, library, formula sheet, practice and
exam modes all read from it — **adding an equation is appending one object.**

```js
{
  id: "my_equation",
  name: "My equation",
  category: "Time value of money",     // any string; new strings create new categories
  latex: "A = P(1+i)^n",
  description: "One-line explanation.",
  variables: [
    // unit: "currency" | "percent" | "years" | "count" | "number"
    // percent variables are ENTERED as 9.5 and reach relation() as 0.095
    { symbol: "A", name: "Future value", unit: "currency", min: 0 },
    { symbol: "P", name: "Principal",    unit: "currency", min: 0, default: 10000 },
    { symbol: "i", name: "Rate",         unit: "percent",  default: 10 },
    { symbol: "n", name: "Years",        unit: "years",    min: 0, default: 5 }
  ],
  relation: (v) => v.A - v.P * Math.pow(1 + v.i, v.n),  // expression equal to zero
  inverse: { A: (v) => v.P * Math.pow(1 + v.i, v.n) },  // OPTIONAL closed forms
  steps: (v, solvedFor) => [{ latex: "...", note: "..." }],  // OPTIONAL walkthrough
  problemGenerator: (rng, difficulty) => ({                  // OPTIONAL practice/exam
    prompt, given, solveFor, answer, tolerance, unit
  }),
  chart: "growth"  // OPTIONAL: growth | annuity_growth | amortization | npv_profile | poisson
}
```

**You only owe the `relation`.** Any variable without a closed-form `inverse`
is solved numerically (bracket scan + Brent's method), so solving for every
variable comes free. If no root exists in a realistic range, the solver says so
instead of returning `NaN`. Equations without `steps` get an auto-generated
walkthrough; numerically-solved variables show an iteration summary.

Cash-flow/data-list equations (NPV, IRR, payback, statistics, expected-value
tables) use `type: "list"` with an `inputs` spec and a `compute(inputs)`
function instead — see `npv` in `js/equations.js` for the pattern.

A full commented template sits at the top of `js/equations.js`.

### Adding an equation via the UI

Open **Add equation**, fill in name/category/LaTeX (live preview), add the
variables, and write the relation as a plain JS math expression equal to zero,
e.g. `A - P*Math.pow(1+i, n)`. **Validate** compiles it and evaluates it at the
defaults; **Save** stores it in `localStorage` and merges it into the registry
on every load. Export/Import gives you JSON backups. Custom equations are solved
numerically and get auto-generated steps.

## Files

```
index.html        the app (open this)
tests.html        assertion suite — all green = healthy build
css/style.css     theme (dark/light), layout, print stylesheet
js/util.js        formatting, rounding, en-ZA numbers, Roman numerals, RNG, storage
js/solver.js      Brent's method root-finder, bracket scan, unit conversion, steps
js/equations.js   THE REGISTRY — every equation lives here
js/charts.js      Chart.js visuals (growth, amortisation, NPV profile, Poisson)
js/app.js         views, routing, practice/exam engines, add-equation UI, settings
lib/              vendored KaTeX 0.16.11 (+fonts) and Chart.js 4.4.3
```

## Full equation list (47)

**Time value of money** — simple interest · compound FV · PV of a single sum ·
continuous compounding · nominal ↔ effective annual rate · FV ordinary annuity ·
PV ordinary annuity · FV annuity due · PV annuity due · deferred annuity PV ·
perpetuity PV · growing perpetuity (Gordon) · sinking fund payment ·
loan payment (amortisation) · outstanding balance after k payments ·
equivalent payments (moving a debt)

**Investment appraisal** — NPV · IRR · payback period · discounted payback ·
profitability index

**Depreciation** — straight line · reducing balance · units of production

**Economics** — price elasticity of demand (midpoint) · point elasticity ·
cross-price elasticity · break-even quantity · break-even revenue ·
CVP target-profit quantity · linear market equilibrium · Fisher equation ·
inflation-adjusted value · GDP deflator

**Statistics & probability** — mean/variance/SD from a data list · z-score ·
binomial P(X=k) · Poisson P(X=k) · Poisson P(X≤k) · expected value from a
probability table

**Trader's annex** (risk-management math) — Kelly criterion (with half-Kelly) ·
risk of ruin · expected value per trade (R-multiples) · fixed-fractional
position size · CAGR · drawdown recovery · rule of 72
