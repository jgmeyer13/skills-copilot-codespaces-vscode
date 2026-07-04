/* Warbase Math Engine — equations.js
 * THE EQUATION REGISTRY. The whole app is driven by this array.
 *
 * ══════════════════════════════════════════════════════════════════════
 * TEMPLATE — copy, fill in, append to WB.EQUATIONS. That is all it takes.
 * ══════════════════════════════════════════════════════════════════════
 * {
 *   id: "my_equation",                       // unique snake_case id
 *   name: "My equation",
 *   category: "Time value of money",         // any string; new strings make new categories
 *   latex: "A = P(1+i)^n",                   // KaTeX source for the library card
 *   description: "One-line explanation.",
 *   variables: [
 *     // unit: "currency" | "percent" | "years" | "count" | "number"
 *     // percent variables are ENTERED as 9.5 and passed to relation() as 0.095
 *     { symbol: "A", name: "Future value", unit: "currency", min: 0 },
 *     { symbol: "P", name: "Principal",    unit: "currency", min: 0, default: 10000 },
 *     { symbol: "i", name: "Rate per year", unit: "percent", default: 10 },
 *     { symbol: "n", name: "Years",         unit: "years",  min: 0, default: 5 }
 *   ],
 *   relation: function (v) {                 // expression equal to zero
 *     return v.A - v.P * Math.pow(1 + v.i, v.n);
 *   },
 *   // OPTIONAL: closed-form inverses (exact + fast). Any symbol without one
 *   // is solved numerically from relation() — solving still works for free.
 *   inverse: { A: function (v) { return v.P * Math.pow(1 + v.i, v.n); } },
 *   // OPTIONAL but required for exam-core equations:
 *   steps: function (v, solvedFor) { return [{ latex: "...", note: "..." }]; },
 *   problemGenerator: function (rng, difficulty) {
 *     return { prompt: "…word problem…", given: {P: 1000, i: 10, n: 5},
 *              solveFor: "A", answer: 1610.51, tolerance: 0.51, unit: "currency" };
 *   },
 *   chart: "growth"   // OPTIONAL: growth | annuity_growth | amortization | npv_profile | poisson
 * }
 * ══════════════════════════════════════════════════════════════════════
 * LIST-TYPE equations (cash-flow / data-list inputs) use type:"list" with an
 * inputs spec and a compute() function instead of relation(). See "npv" below.
 */
(function () {
  "use strict";
  var WB = window.WB = window.WB || {};

  /* ---------- shared helpers for steps & generators ---------- */
  var NAMES = ["Thabo", "Lerato", "Sipho", "Naledi", "Ayesha", "Kagiso", "Anele",
    "Pieter", "Zanele", "Nomsa", "Dumisani", "Karabo", "Johan", "Precious"];
  var FIRMS = ["Ubuntu Logistics", "Karoo Freight", "Msanzi Traders", "Highveld Mills",
    "Cape Route Couriers", "Baobab Holdings", "Savanna Steel", "Jozi Warehousing"];

  function cur(x, dp) { return WB.fmtCurrency(x, dp === undefined ? 2 : dp); }
  function pctL(dec, dp) { return WB.ltx(dec * 100, dp === undefined ? 4 : dp) + "\\%"; }
  var L = WB.ltx, LC = WB.ltxCur;

  function F(latex, note) { return { latex: latex, note: note }; }

  /* tolerance helpers */
  function tolCur(ans) { return Math.max(0.51, Math.abs(ans) * 0.002); }
  function tolPct(ans) { return Math.max(0.02, Math.abs(ans) * 0.005); }
  function tolNum(ans) { return Math.max(0.02, Math.abs(ans) * 0.005); }

  /* discount factor helpers */
  function pow(b, e) { return Math.pow(b, e); }
  function annuityFV(i, n) { return (pow(1 + i, n) - 1) / i; }
  function annuityPV(i, n) { return (1 - pow(1 + i, -n)) / i; }

  function npvOf(rate, cfs) {
    var s = 0;
    for (var t = 0; t < cfs.length; t++) s += cfs[t] / pow(1 + rate, t);
    return s;
  }
  function irrOf(cfs) {
    var f = function (r) { return npvOf(r, cfs); };
    var res = WB.solveNumeric(f, { unit: "percent", min: -99.99 });
    return res ? res : null;
  }
  WB.npvOf = npvOf;
  WB.irrOf = irrOf;

  function factorial(n) { var f = 1; for (var i = 2; i <= n; i++) f *= i; return f; }
  function nCk(n, k) {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    var r = 1;
    for (var i = 0; i < k; i++) r = r * (n - i) / (i + 1);
    return r;
  }
  function poissonPmf(lam, k) { return Math.exp(-lam) * pow(lam, k) / factorial(k); }
  function poissonCdf(lam, k) {
    var s = 0;
    for (var x = 0; x <= k; x++) s += poissonPmf(lam, x);
    return s;
  }
  WB.poissonPmf = poissonPmf;
  WB.poissonCdf = poissonCdf;
  WB.nCk = nCk;

  var EQ = [];

  /* ════════════════════════════════════════════════════════════════════
   * TIME VALUE OF MONEY  (exam core: full steps + problem generators)
   * ════════════════════════════════════════════════════════════════════ */

  EQ.push({
    id: "simple_interest",
    name: "Simple interest",
    category: "Time value of money",
    examCore: true,
    latex: "A = P(1 + in)",
    description: "Accumulated value under simple (non-compounding) interest at annual rate i for n years.",
    variables: [
      { symbol: "A", name: "Accumulated value", unit: "currency", min: 0 },
      { symbol: "P", name: "Principal", unit: "currency", min: 0, default: 5000 },
      { symbol: "i", name: "Annual simple rate", unit: "percent", default: 6 },
      { symbol: "n", name: "Time (years)", unit: "years", min: 0, default: 3 }
    ],
    relation: function (v) { return v.A - v.P * (1 + v.i * v.n); },
    inverse: {
      A: function (v) { return v.P * (1 + v.i * v.n); },
      P: function (v) { return v.A / (1 + v.i * v.n); },
      i: function (v) { return (v.A / v.P - 1) / v.n; },
      n: function (v) { return (v.A / v.P - 1) / v.i; }
    },
    chart: "growth",
    steps: function (v, sf) {
      var s = [F("A = P(1+in)", "Simple interest formula")];
      if (sf === "A") {
        s.push(F("A = " + LC(v.P) + "\\,(1 + " + L(v.i, 6) + " \\times " + L(v.n) + ")", "Substitute (rate as a decimal)"));
        s.push(F("A = " + LC(v.P) + " \\times " + L(1 + v.i * v.n, 8) + " = " + LC(v.A), "Evaluate"));
      } else if (sf === "P") {
        s.push(F("P = \\frac{A}{1+in} = \\frac{" + LC(v.A) + "}{1 + " + L(v.i, 6) + "\\times" + L(v.n) + "}", "Rearrange and substitute"));
        s.push(F("P = " + LC(v.P), "Evaluate"));
      } else if (sf === "i") {
        s.push(F("i = \\frac{A/P - 1}{n} = \\frac{" + L(v.A / v.P, 8) + " - 1}{" + L(v.n) + "}", "Rearrange and substitute"));
        s.push(F("i = " + L(v.i, 8) + " = " + pctL(v.i), "Evaluate"));
      } else {
        s.push(F("n = \\frac{A/P - 1}{i} = \\frac{" + L(v.A / v.P, 8) + " - 1}{" + L(v.i, 6) + "}", "Rearrange and substitute"));
        s.push(F("n = " + L(v.n, 6) + "\\ \\text{years}", "Evaluate"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var P = rng.range(2000, diff > 1 ? 80000 : 20000, 500);
      var i = rng.range(4, 14, 0.25);
      var n = diff > 2 ? rng.range(0.5, 8, 0.25) : rng.int(1, 8);
      var A = P * (1 + i / 100 * n);
      if (diff >= 2 && rng() < 0.5) {
        return {
          prompt: rng.pick(NAMES) + " invested " + cur(P) + " at simple interest and received " + cur(A, 2) +
            " after " + n + " year" + (n === 1 ? "" : "s") + ". What annual simple interest rate (%) applied?",
          given: { P: P, A: WB.round(A, 2), n: n }, solveFor: "i",
          answer: WB.round(i, 4), tolerance: tolPct(i), unit: "percent"
        };
      }
      return {
        prompt: rng.pick(NAMES) + " deposits " + cur(P) + " in an account paying " + i +
          "% simple interest per year. What is the accumulated value after " + n + " year" + (n === 1 ? "" : "s") + "?",
        given: { P: P, i: i, n: n }, solveFor: "A",
        answer: WB.round(A, 2), tolerance: tolCur(A), unit: "currency"
      };
    }
  });

  EQ.push({
    id: "compound_fv",
    name: "Compound interest (FV of a single sum)",
    category: "Time value of money",
    examCore: true,
    latex: "A = P\\left(1 + \\frac{i}{m}\\right)^{mn}",
    description: "Future value of a lump sum at nominal annual rate i compounded m times per year for n years.",
    variables: [
      { symbol: "A", name: "Future value", unit: "currency", min: 0 },
      { symbol: "P", name: "Principal", unit: "currency", min: 0, default: 10000 },
      { symbol: "i", name: "Nominal annual rate", unit: "percent", default: 10 },
      { symbol: "m", name: "Compounds per year", unit: "count", min: 1, default: 12 },
      { symbol: "n", name: "Years", unit: "years", min: 0, default: 5 }
    ],
    relation: function (v) { return v.A - v.P * pow(1 + v.i / v.m, v.m * v.n); },
    inverse: {
      A: function (v) { return v.P * pow(1 + v.i / v.m, v.m * v.n); },
      P: function (v) { return v.A * pow(1 + v.i / v.m, -v.m * v.n); },
      n: function (v) { return Math.log(v.A / v.P) / (v.m * Math.log(1 + v.i / v.m)); },
      i: function (v) { return v.m * (pow(v.A / v.P, 1 / (v.m * v.n)) - 1); }
    },
    chart: "growth",
    steps: function (v, sf) {
      var g = 1 + v.i / v.m, N = v.m * v.n;
      var s = [F("A = P\\left(1+\\tfrac{i}{m}\\right)^{mn}", "Compound interest formula — i is the nominal annual rate as a decimal")];
      if (sf === "A") {
        s.push(F("A = " + LC(v.P) + "\\left(1+\\tfrac{" + L(v.i, 6) + "}{" + L(v.m) + "}\\right)^{" + L(v.m) + "\\times" + L(v.n) + "}", "Substitute"));
        s.push(F("A = " + LC(v.P) + " \\times (" + L(g, 9) + ")^{" + L(N) + "} = " + LC(v.A), "Evaluate"));
      } else if (sf === "P") {
        s.push(F("P = A\\left(1+\\tfrac{i}{m}\\right)^{-mn} = " + LC(v.A) + "(" + L(g, 9) + ")^{-" + L(N) + "}", "Rearrange for present value and substitute"));
        s.push(F("P = " + LC(v.P), "Evaluate"));
      } else if (sf === "n") {
        s.push(F("n = \\frac{\\ln(A/P)}{m\\,\\ln(1+i/m)} = \\frac{\\ln(" + L(v.A / v.P, 8) + ")}{" + L(v.m) + "\\ln(" + L(g, 9) + ")}", "Take logs of both sides"));
        s.push(F("n = " + L(v.n, 6) + "\\ \\text{years}", "Evaluate"));
      } else if (sf === "i") {
        s.push(F("i = m\\left[\\left(\\tfrac{A}{P}\\right)^{1/(mn)} - 1\\right] = " + L(v.m) + "\\left[(" + L(v.A / v.P, 8) + ")^{1/" + L(N) + "} - 1\\right]", "Take the (mn)-th root of both sides"));
        s.push(F("i = " + L(v.i, 8) + " = " + pctL(v.i), "Evaluate — nominal annual rate"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var P = rng.range(3000, diff > 1 ? 120000 : 30000, 500);
      var i = rng.range(5, 14, 0.1);
      var m = rng.pick(diff > 1 ? [1, 2, 4, 12] : [1, 12]);
      var n = rng.int(2, diff > 1 ? 20 : 8);
      var mName = { 1: "annually", 2: "semi-annually", 4: "quarterly", 12: "monthly" }[m];
      var A = P * pow(1 + i / 100 / m, m * n);
      var who = rng.pick(NAMES);
      var mode = diff >= 2 ? rng.int(0, 2) : 0;
      if (mode === 1) {
        return {
          prompt: who + " needs " + cur(A, 2) + " in " + n + " years. The bank pays " + i +
            "% per year compounded " + mName + ". How much must be deposited today?",
          given: { A: WB.round(A, 2), i: i, m: m, n: n }, solveFor: "P",
          answer: WB.round(P, 2), tolerance: tolCur(P), unit: "currency"
        };
      }
      if (mode === 2) {
        return {
          prompt: who + " deposits " + cur(P) + " which grows to " + cur(A, 2) + " after " + n +
            " years, compounded " + mName + ". What nominal annual interest rate (%) applied?",
          given: { P: P, A: WB.round(A, 2), m: m, n: n }, solveFor: "i",
          answer: WB.round(i, 4), tolerance: tolPct(i), unit: "percent"
        };
      }
      return {
        prompt: who + " deposits " + cur(P) + " at " + i + "% per year compounded " + mName +
          ". What is the balance after " + n + " years?",
        given: { P: P, i: i, m: m, n: n }, solveFor: "A",
        answer: WB.round(A, 2), tolerance: tolCur(A), unit: "currency"
      };
    }
  });

  EQ.push({
    id: "compound_pv",
    name: "Present value of a single sum",
    category: "Time value of money",
    examCore: true,
    latex: "P = A\\left(1 + \\frac{i}{m}\\right)^{-mn}",
    description: "Discount a future lump sum back to today at nominal annual rate i compounded m times per year.",
    variables: [
      { symbol: "P", name: "Present value", unit: "currency", min: 0 },
      { symbol: "A", name: "Future amount", unit: "currency", min: 0, default: 20000 },
      { symbol: "i", name: "Nominal annual rate", unit: "percent", default: 9 },
      { symbol: "m", name: "Compounds per year", unit: "count", min: 1, default: 12 },
      { symbol: "n", name: "Years", unit: "years", min: 0, default: 4 }
    ],
    relation: function (v) { return v.P - v.A * pow(1 + v.i / v.m, -v.m * v.n); },
    inverse: {
      P: function (v) { return v.A * pow(1 + v.i / v.m, -v.m * v.n); },
      A: function (v) { return v.P * pow(1 + v.i / v.m, v.m * v.n); },
      n: function (v) { return Math.log(v.A / v.P) / (v.m * Math.log(1 + v.i / v.m)); },
      i: function (v) { return v.m * (pow(v.A / v.P, 1 / (v.m * v.n)) - 1); }
    },
    steps: function (v, sf) {
      var g = 1 + v.i / v.m, N = v.m * v.n;
      var s = [F("P = A\\left(1+\\tfrac{i}{m}\\right)^{-mn}", "Present value: compound interest solved for P")];
      if (sf === "P") {
        s.push(F("P = " + LC(v.A) + "\\left(1+\\tfrac{" + L(v.i, 6) + "}{" + L(v.m) + "}\\right)^{-" + L(v.m) + "\\times" + L(v.n) + "}", "Substitute"));
        s.push(F("P = " + LC(v.A) + " \\times (" + L(g, 9) + ")^{-" + L(N) + "} = " + LC(v.P), "Evaluate — the discount factor is " + WB.fmtNum(pow(g, -N), 6)));
      } else if (sf === "A") {
        s.push(F("A = P\\left(1+\\tfrac{i}{m}\\right)^{mn} = " + LC(v.P) + "(" + L(g, 9) + ")^{" + L(N) + "} = " + LC(v.A), "Rearrange and evaluate"));
      } else if (sf === "n") {
        s.push(F("n = \\frac{\\ln(A/P)}{m\\,\\ln(1+i/m)} = " + L(v.n, 6) + "\\ \\text{years}", "Take logs of both sides"));
      } else if (sf === "i") {
        s.push(F("i = m\\left[(A/P)^{1/(mn)} - 1\\right] = " + L(v.i, 8) + " = " + pctL(v.i), "Take the (mn)-th root"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var A = rng.range(10000, diff > 1 ? 500000 : 80000, 1000);
      var i = rng.range(6, 13, 0.25);
      var m = rng.pick([2, 4, 12]);
      var n = rng.int(2, 10);
      var mName = { 2: "semi-annually", 4: "quarterly", 12: "monthly" }[m];
      var P = A * pow(1 + i / 100 / m, -m * n);
      return {
        prompt: rng.pick(FIRMS) + " must settle a debt of " + cur(A) + " due in " + n +
          " years. Money is worth " + i + "% per year compounded " + mName +
          ". What single payment today settles the debt?",
        given: { A: A, i: i, m: m, n: n }, solveFor: "P",
        answer: WB.round(P, 2), tolerance: tolCur(P), unit: "currency"
      };
    }
  });

  EQ.push({
    id: "continuous_compound",
    name: "Continuous compounding",
    category: "Time value of money",
    examCore: true,
    latex: "A = P e^{in}",
    description: "Future value when interest compounds continuously at annual rate i.",
    variables: [
      { symbol: "A", name: "Future value", unit: "currency", min: 0 },
      { symbol: "P", name: "Principal", unit: "currency", min: 0, default: 1000 },
      { symbol: "i", name: "Annual rate", unit: "percent", default: 8 },
      { symbol: "n", name: "Years", unit: "years", min: 0, default: 5 }
    ],
    relation: function (v) { return v.A - v.P * Math.exp(v.i * v.n); },
    inverse: {
      A: function (v) { return v.P * Math.exp(v.i * v.n); },
      P: function (v) { return v.A * Math.exp(-v.i * v.n); },
      i: function (v) { return Math.log(v.A / v.P) / v.n; },
      n: function (v) { return Math.log(v.A / v.P) / v.i; }
    },
    chart: "growth",
    steps: function (v, sf) {
      var s = [F("A = Pe^{in}", "Continuous compounding formula")];
      if (sf === "A") {
        s.push(F("A = " + LC(v.P) + "\\,e^{" + L(v.i, 6) + "\\times" + L(v.n) + "} = " + LC(v.P) + "\\,e^{" + L(v.i * v.n, 8) + "}", "Substitute"));
        s.push(F("A = " + LC(v.P) + " \\times " + L(Math.exp(v.i * v.n), 8) + " = " + LC(v.A), "Evaluate"));
      } else if (sf === "P") {
        s.push(F("P = Ae^{-in} = " + LC(v.A) + "\\,e^{-" + L(v.i * v.n, 8) + "} = " + LC(v.P), "Rearrange and evaluate"));
      } else if (sf === "i") {
        s.push(F("i = \\frac{\\ln(A/P)}{n} = \\frac{\\ln(" + L(v.A / v.P, 8) + ")}{" + L(v.n) + "} = " + L(v.i, 8) + " = " + pctL(v.i), "Take natural logs"));
      } else {
        s.push(F("n = \\frac{\\ln(A/P)}{i} = \\frac{\\ln(" + L(v.A / v.P, 8) + ")}{" + L(v.i, 6) + "} = " + L(v.n, 6) + "\\ \\text{years}", "Take natural logs"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var P = rng.range(1000, 50000, 500);
      var i = rng.range(5, 12, 0.25);
      var n = rng.int(1, 10);
      var A = P * Math.exp(i / 100 * n);
      return {
        prompt: rng.pick(NAMES) + " invests " + cur(P) + " at " + i +
          "% per year compounded continuously. Find the value after " + n + " year" + (n === 1 ? "" : "s") + ".",
        given: { P: P, i: i, n: n }, solveFor: "A",
        answer: WB.round(A, 2), tolerance: tolCur(A), unit: "currency"
      };
    }
  });

  EQ.push({
    id: "effective_rate",
    name: "Nominal ↔ effective annual rate",
    category: "Time value of money",
    examCore: true,
    latex: "j_{\\text{eff}} = \\left(1 + \\frac{i}{m}\\right)^{m} - 1",
    description: "Convert a nominal annual rate compounded m times per year to the effective annual rate (and back).",
    variables: [
      { symbol: "j", name: "Effective annual rate", unit: "percent" },
      { symbol: "i", name: "Nominal annual rate", unit: "percent", default: 12 },
      { symbol: "m", name: "Compounds per year", unit: "count", min: 1, default: 12 }
    ],
    relation: function (v) { return v.j - (pow(1 + v.i / v.m, v.m) - 1); },
    inverse: {
      j: function (v) { return pow(1 + v.i / v.m, v.m) - 1; },
      i: function (v) { return v.m * (pow(1 + v.j, 1 / v.m) - 1); }
    },
    steps: function (v, sf) {
      var s = [F("j = \\left(1+\\tfrac{i}{m}\\right)^m - 1", "Effective annual rate formula")];
      if (sf === "j") {
        s.push(F("j = \\left(1+\\tfrac{" + L(v.i, 6) + "}{" + L(v.m) + "}\\right)^{" + L(v.m) + "} - 1 = " + L(1 + v.i / v.m, 9) + "^{" + L(v.m) + "} - 1", "Substitute"));
        s.push(F("j = " + L(v.j, 8) + " = " + pctL(v.j), "Evaluate"));
      } else if (sf === "i") {
        s.push(F("i = m\\left[(1+j)^{1/m} - 1\\right] = " + L(v.m) + "\\left[(" + L(1 + v.j, 8) + ")^{1/" + L(v.m) + "} - 1\\right]", "Rearrange and substitute"));
        s.push(F("i = " + L(v.i, 8) + " = " + pctL(v.i), "Evaluate — nominal annual rate compounded " + v.m + "× per year"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var i = rng.range(6, 18, 0.25);
      var m = rng.pick([2, 4, 12, 365]);
      var mName = { 2: "semi-annually", 4: "quarterly", 12: "monthly", 365: "daily" }[m];
      var j = (pow(1 + i / 100 / m, m) - 1) * 100;
      if (diff >= 2 && rng() < 0.5) {
        return {
          prompt: "A loan quotes an effective annual rate of " + WB.fmtNum(j, 3) +
            "%. What nominal annual rate compounded " + mName + " is equivalent?",
          given: { j: WB.round(j, 4), m: m }, solveFor: "i",
          answer: WB.round(i, 4), tolerance: tolPct(i), unit: "percent"
        };
      }
      return {
        prompt: "A bank quotes " + i + "% per year compounded " + mName +
          ". What is the effective annual rate (%)?",
        given: { i: i, m: m }, solveFor: "j",
        answer: WB.round(j, 4), tolerance: tolPct(j), unit: "percent"
      };
    }
  });

  EQ.push({
    id: "fv_ordinary_annuity",
    name: "FV of an ordinary annuity",
    category: "Time value of money",
    examCore: true,
    latex: "F = R\\,\\frac{(1+i)^{n} - 1}{i}",
    description: "Future value of n equal end-of-period payments R at rate i per period.",
    variables: [
      { symbol: "F", name: "Future value", unit: "currency", min: 0 },
      { symbol: "R", name: "Payment per period", unit: "currency", min: 0, default: 1000 },
      { symbol: "i", name: "Rate per period", unit: "percent", default: 8 },
      { symbol: "n", name: "Number of payments", unit: "count", min: 1, default: 10 }
    ],
    relation: function (v) { return v.F - v.R * annuityFV(v.i, v.n); },
    inverse: {
      F: function (v) { return v.R * annuityFV(v.i, v.n); },
      R: function (v) { return v.F / annuityFV(v.i, v.n); },
      n: function (v) { return Math.log(1 + v.F * v.i / v.R) / Math.log(1 + v.i); }
    },
    chart: "annuity_growth",
    steps: function (v, sf) {
      var fac = annuityFV(v.i, v.n);
      var s = [F("F = R\\,\\frac{(1+i)^n - 1}{i}", "Future value of an ordinary annuity (payments at period end)")];
      if (sf === "F") {
        s.push(F("F = " + LC(v.R) + "\\times\\frac{(1+" + L(v.i, 6) + ")^{" + L(v.n) + "} - 1}{" + L(v.i, 6) + "}", "Substitute"));
        s.push(F("F = " + LC(v.R) + " \\times " + L(fac, 8) + " = " + LC(v.F), "The bracket term is the FV annuity factor s_{\\overline{n}|i}"));
      } else if (sf === "R") {
        s.push(F("R = \\frac{F\\,i}{(1+i)^n - 1} = \\frac{" + LC(v.F) + "\\times" + L(v.i, 6) + "}{" + L(pow(1 + v.i, v.n) - 1, 8) + "}", "Rearrange and substitute"));
        s.push(F("R = " + LC(v.R), "Evaluate"));
      } else if (sf === "n") {
        s.push(F("n = \\frac{\\ln(1 + Fi/R)}{\\ln(1+i)} = \\frac{\\ln(" + L(1 + v.F * v.i / v.R, 8) + ")}{\\ln(" + L(1 + v.i, 8) + ")}", "Solve the exponential with logs"));
        s.push(F("n = " + L(v.n, 6) + "\\ \\text{payments}", "Evaluate"));
      } else {
        s.push(F("R\\,\\frac{(1+i)^n-1}{i} - F = 0", "No closed form for i — solve the relation numerically"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var R = rng.range(200, diff > 1 ? 5000 : 2000, 50);
      var iAnn = rng.range(6, 12, 0.25);
      var yrs = rng.int(3, diff > 1 ? 25 : 10);
      var monthly = diff > 1 && rng() < 0.5;
      var i = monthly ? iAnn / 12 : iAnn;
      var n = monthly ? yrs * 12 : yrs;
      var Fv = R * annuityFV(i / 100, n);
      return {
        prompt: rng.pick(NAMES) + " deposits " + cur(R) + " at the end of every " +
          (monthly ? "month" : "year") + " for " + yrs + " years into a fund earning " + iAnn +
          "% per year" + (monthly ? " compounded monthly" : "") + ". What is the fund worth at the end?",
        given: { R: R, i: WB.round(i, 6), n: n }, solveFor: "F",
        answer: WB.round(Fv, 2), tolerance: tolCur(Fv), unit: "currency"
      };
    }
  });

  EQ.push({
    id: "pv_ordinary_annuity",
    name: "PV of an ordinary annuity",
    category: "Time value of money",
    examCore: true,
    latex: "P = R\\,\\frac{1-(1+i)^{-n}}{i}",
    description: "Present value of n equal end-of-period payments R discounted at rate i per period.",
    variables: [
      { symbol: "P", name: "Present value", unit: "currency", min: 0 },
      { symbol: "R", name: "Payment per period", unit: "currency", min: 0, default: 1000 },
      { symbol: "i", name: "Rate per period", unit: "percent", default: 8 },
      { symbol: "n", name: "Number of payments", unit: "count", min: 1, default: 10 }
    ],
    relation: function (v) { return v.P - v.R * annuityPV(v.i, v.n); },
    inverse: {
      P: function (v) { return v.R * annuityPV(v.i, v.n); },
      R: function (v) { return v.P / annuityPV(v.i, v.n); },
      n: function (v) { return -Math.log(1 - v.P * v.i / v.R) / Math.log(1 + v.i); }
    },
    steps: function (v, sf) {
      var fac = annuityPV(v.i, v.n);
      var s = [F("P = R\\,\\frac{1-(1+i)^{-n}}{i}", "Present value of an ordinary annuity")];
      if (sf === "P") {
        s.push(F("P = " + LC(v.R) + "\\times\\frac{1-(1+" + L(v.i, 6) + ")^{-" + L(v.n) + "}}{" + L(v.i, 6) + "}", "Substitute"));
        s.push(F("P = " + LC(v.R) + " \\times " + L(fac, 8) + " = " + LC(v.P), "The bracket term is the PV annuity factor a_{\\overline{n}|i}"));
      } else if (sf === "R") {
        s.push(F("R = \\frac{P\\,i}{1-(1+i)^{-n}} = \\frac{" + LC(v.P) + "\\times" + L(v.i, 6) + "}{" + L(1 - pow(1 + v.i, -v.n), 8) + "} = " + LC(v.R), "Rearrange, substitute, evaluate"));
      } else if (sf === "n") {
        s.push(F("n = \\frac{-\\ln(1 - Pi/R)}{\\ln(1+i)} = \\frac{-\\ln(" + L(1 - v.P * v.i / v.R, 8) + ")}{\\ln(" + L(1 + v.i, 8) + ")} = " + L(v.n, 6), "Solve with logs — requires Pi/R < 1"));
      } else {
        s.push(F("R\\,\\frac{1-(1+i)^{-n}}{i} - P = 0", "No closed form for i — solve numerically"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var R = rng.range(500, 5000, 100);
      var i = rng.range(6, 14, 0.25);
      var n = rng.int(4, diff > 1 ? 20 : 10);
      var P = R * annuityPV(i / 100, n);
      if (diff >= 2 && rng() < 0.4) {
        return {
          prompt: "A prize pays " + cur(R) + " at the end of each year for " + n +
            " years. Its present value at " + i + "% per year is " + cur(P, 2) +
            " — verify by computing the present value yourself.",
          given: { R: R, i: i, n: n }, solveFor: "P",
          answer: WB.round(P, 2), tolerance: tolCur(P), unit: "currency"
        };
      }
      return {
        prompt: rng.pick(NAMES) + " wins a settlement paying " + cur(R) +
          " at the end of each year for " + n + " years. Money is worth " + i +
          "% per year. What is the settlement worth today?",
        given: { R: R, i: i, n: n }, solveFor: "P",
        answer: WB.round(P, 2), tolerance: tolCur(P), unit: "currency"
      };
    }
  });

  EQ.push({
    id: "fv_annuity_due",
    name: "FV of an annuity due",
    category: "Time value of money",
    examCore: true,
    latex: "F = R\\,\\frac{(1+i)^{n} - 1}{i}\\,(1+i)",
    description: "Future value when the n payments fall at the BEGINNING of each period (each payment earns one extra period).",
    variables: [
      { symbol: "F", name: "Future value", unit: "currency", min: 0 },
      { symbol: "R", name: "Payment per period", unit: "currency", min: 0, default: 1000 },
      { symbol: "i", name: "Rate per period", unit: "percent", default: 8 },
      { symbol: "n", name: "Number of payments", unit: "count", min: 1, default: 10 }
    ],
    relation: function (v) { return v.F - v.R * annuityFV(v.i, v.n) * (1 + v.i); },
    inverse: {
      F: function (v) { return v.R * annuityFV(v.i, v.n) * (1 + v.i); },
      R: function (v) { return v.F / (annuityFV(v.i, v.n) * (1 + v.i)); },
      n: function (v) { return Math.log(1 + v.F * v.i / (v.R * (1 + v.i))) / Math.log(1 + v.i); }
    },
    chart: "annuity_growth",
    steps: function (v, sf) {
      var facOrd = annuityFV(v.i, v.n);
      var s = [F("F_{\\text{due}} = R\\,\\frac{(1+i)^n-1}{i}\\,(1+i)", "Annuity due = ordinary annuity × (1+i): every payment compounds one extra period")];
      if (sf === "F") {
        s.push(F("F = " + LC(v.R) + " \\times " + L(facOrd, 8) + " \\times " + L(1 + v.i, 8), "Ordinary-annuity factor first, then the (1+i) adjustment"));
        s.push(F("F = " + LC(v.F), "Evaluate"));
      } else if (sf === "R") {
        s.push(F("R = \\frac{F}{s_{\\overline{n}|i}(1+i)} = \\frac{" + LC(v.F) + "}{" + L(facOrd * (1 + v.i), 8) + "} = " + LC(v.R), "Rearrange, substitute, evaluate"));
      } else if (sf === "n") {
        s.push(F("n = \\frac{\\ln\\!\\left(1 + \\frac{Fi}{R(1+i)}\\right)}{\\ln(1+i)} = " + L(v.n, 6), "Solve with logs"));
      } else {
        s.push(F("R\\,\\frac{(1+i)^n-1}{i}(1+i) - F = 0", "No closed form for i — solve numerically"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var R = rng.range(300, 3000, 50);
      var i = rng.range(6, 12, 0.25);
      var n = rng.int(4, 15);
      var Fv = R * annuityFV(i / 100, n) * (1 + i / 100);
      return {
        prompt: rng.pick(NAMES) + " pays " + cur(R) + " at the BEGINNING of each year for " + n +
          " years into a fund earning " + i + "% per year. Find the value immediately after the last year ends.",
        given: { R: R, i: i, n: n }, solveFor: "F",
        answer: WB.round(Fv, 2), tolerance: tolCur(Fv), unit: "currency"
      };
    }
  });

  EQ.push({
    id: "pv_annuity_due",
    name: "PV of an annuity due",
    category: "Time value of money",
    examCore: true,
    latex: "P = R\\,\\frac{1-(1+i)^{-n}}{i}\\,(1+i)",
    description: "Present value when the n payments fall at the BEGINNING of each period.",
    variables: [
      { symbol: "P", name: "Present value", unit: "currency", min: 0 },
      { symbol: "R", name: "Payment per period", unit: "currency", min: 0, default: 1000 },
      { symbol: "i", name: "Rate per period", unit: "percent", default: 8 },
      { symbol: "n", name: "Number of payments", unit: "count", min: 1, default: 10 }
    ],
    relation: function (v) { return v.P - v.R * annuityPV(v.i, v.n) * (1 + v.i); },
    inverse: {
      P: function (v) { return v.R * annuityPV(v.i, v.n) * (1 + v.i); },
      R: function (v) { return v.P / (annuityPV(v.i, v.n) * (1 + v.i)); },
      n: function (v) { return -Math.log(1 - v.P * v.i / (v.R * (1 + v.i))) / Math.log(1 + v.i); }
    },
    steps: function (v, sf) {
      var facOrd = annuityPV(v.i, v.n);
      var s = [F("P_{\\text{due}} = R\\,\\frac{1-(1+i)^{-n}}{i}\\,(1+i)", "Annuity due = ordinary annuity × (1+i): the first payment is not discounted")];
      if (sf === "P") {
        s.push(F("P = " + LC(v.R) + " \\times " + L(facOrd, 8) + " \\times " + L(1 + v.i, 8) + " = " + LC(v.P), "Ordinary factor, then the (1+i) adjustment"));
      } else if (sf === "R") {
        s.push(F("R = \\frac{P}{a_{\\overline{n}|i}(1+i)} = \\frac{" + LC(v.P) + "}{" + L(facOrd * (1 + v.i), 8) + "} = " + LC(v.R), "Rearrange, substitute, evaluate"));
      } else if (sf === "n") {
        s.push(F("n = \\frac{-\\ln\\!\\left(1 - \\frac{Pi}{R(1+i)}\\right)}{\\ln(1+i)} = " + L(v.n, 6), "Solve with logs"));
      } else {
        s.push(F("R\\,\\frac{1-(1+i)^{-n}}{i}(1+i) - P = 0", "No closed form for i — solve numerically"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var R = rng.range(1000, 8000, 250);
      var i = rng.range(7, 13, 0.25);
      var n = rng.int(3, 12);
      var P = R * annuityPV(i / 100, n) * (1 + i / 100);
      return {
        prompt: "A rental contract requires " + cur(R) + " at the START of each year for " + n +
          " years. At " + i + "% per year, what single amount today is equivalent?",
        given: { R: R, i: i, n: n }, solveFor: "P",
        answer: WB.round(P, 2), tolerance: tolCur(P), unit: "currency"
      };
    }
  });

  EQ.push({
    id: "deferred_annuity_pv",
    name: "PV of a deferred annuity",
    category: "Time value of money",
    examCore: true,
    latex: "P = R\\,\\frac{1-(1+i)^{-n}}{i}\\,(1+i)^{-d}",
    description: "Present value of an ordinary annuity of n payments that only starts after a deferral of d periods.",
    variables: [
      { symbol: "P", name: "Present value", unit: "currency", min: 0 },
      { symbol: "R", name: "Payment per period", unit: "currency", min: 0, default: 1000 },
      { symbol: "i", name: "Rate per period", unit: "percent", default: 8 },
      { symbol: "n", name: "Number of payments", unit: "count", min: 1, default: 10 },
      { symbol: "d", name: "Deferral (periods before annuity starts)", unit: "count", min: 0, default: 3 }
    ],
    relation: function (v) { return v.P - v.R * annuityPV(v.i, v.n) * pow(1 + v.i, -v.d); },
    inverse: {
      P: function (v) { return v.R * annuityPV(v.i, v.n) * pow(1 + v.i, -v.d); },
      R: function (v) { return v.P / (annuityPV(v.i, v.n) * pow(1 + v.i, -v.d)); },
      d: function (v) { return Math.log(v.R * annuityPV(v.i, v.n) / v.P) / Math.log(1 + v.i); }
    },
    steps: function (v, sf) {
      var fac = annuityPV(v.i, v.n), disc = pow(1 + v.i, -v.d);
      var s = [F("P = R\\,a_{\\overline{n}|i}\\,(1+i)^{-d}", "Value the annuity one period before its first payment, then discount d periods back to today")];
      if (sf === "P") {
        s.push(F("a_{\\overline{n}|i} = \\frac{1-(1+" + L(v.i, 6) + ")^{-" + L(v.n) + "}}{" + L(v.i, 6) + "} = " + L(fac, 8), "Ordinary annuity factor"));
        s.push(F("P = " + LC(v.R) + " \\times " + L(fac, 8) + " \\times (1+" + L(v.i, 6) + ")^{-" + L(v.d) + "} = " + LC(v.R * fac) + " \\times " + L(disc, 8), "Discount for the deferral"));
        s.push(F("P = " + LC(v.P), "Evaluate"));
      } else if (sf === "R") {
        s.push(F("R = \\frac{P}{a_{\\overline{n}|i}(1+i)^{-d}} = \\frac{" + LC(v.P) + "}{" + L(fac * disc, 8) + "} = " + LC(v.R), "Rearrange, substitute, evaluate"));
      } else {
        s.push(F("R\\,a_{\\overline{n}|i}(1+i)^{-d} - P = 0", "Solve the relation for " + sf));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var R = rng.range(1000, 6000, 250);
      var i = rng.range(7, 12, 0.25);
      var n = rng.int(4, 12);
      var d = rng.int(1, 5);
      var P = R * annuityPV(i / 100, n) * pow(1 + i / 100, -d);
      return {
        prompt: rng.pick(NAMES) + " will receive " + cur(R) + " per year for " + n +
          " years, but the first payment is only at the end of year " + (d + 1) +
          " (deferred " + d + " year" + (d === 1 ? "" : "s") + "). At " + i +
          "% per year, what is this worth today?",
        given: { R: R, i: i, n: n, d: d }, solveFor: "P",
        answer: WB.round(P, 2), tolerance: tolCur(P), unit: "currency"
      };
    }
  });

  EQ.push({
    id: "perpetuity_pv",
    name: "PV of a perpetuity",
    category: "Time value of money",
    examCore: true,
    latex: "P = \\frac{R}{i}",
    description: "Present value of a level payment R per period, forever, at rate i per period.",
    variables: [
      { symbol: "P", name: "Present value", unit: "currency", min: 0 },
      { symbol: "R", name: "Payment per period", unit: "currency", min: 0, default: 500 },
      { symbol: "i", name: "Rate per period", unit: "percent", default: 5 }
    ],
    relation: function (v) { return v.P - v.R / v.i; },
    inverse: {
      P: function (v) { return v.R / v.i; },
      R: function (v) { return v.P * v.i; },
      i: function (v) { return v.R / v.P; }
    },
    steps: function (v, sf) {
      var s = [F("P = \\frac{R}{i}", "Limit of the PV annuity formula as n → ∞")];
      if (sf === "P") s.push(F("P = \\frac{" + LC(v.R) + "}{" + L(v.i, 6) + "} = " + LC(v.P), "Substitute and evaluate"));
      else if (sf === "R") s.push(F("R = P \\times i = " + LC(v.P) + " \\times " + L(v.i, 6) + " = " + LC(v.R), "Rearrange"));
      else s.push(F("i = \\frac{R}{P} = \\frac{" + LC(v.R) + "}{" + LC(v.P) + "} = " + L(v.i, 8) + " = " + pctL(v.i), "Rearrange"));
      return s;
    },
    problemGenerator: function (rng, diff) {
      var R = rng.range(200, 5000, 100);
      var i = rng.range(4, 12, 0.25);
      var P = R / (i / 100);
      return {
        prompt: "A scholarship fund must pay out " + cur(R) + " every year indefinitely. If the fund earns " +
          i + "% per year, how much capital is needed today?",
        given: { R: R, i: i }, solveFor: "P",
        answer: WB.round(P, 2), tolerance: tolCur(P), unit: "currency"
      };
    }
  });

  EQ.push({
    id: "growing_perpetuity",
    name: "Growing perpetuity (Gordon growth)",
    category: "Time value of money",
    examCore: true,
    latex: "P = \\frac{D}{i - g}",
    description: "Present value of a payment D (next period) growing at g per period forever, discounted at i (requires i > g).",
    variables: [
      { symbol: "P", name: "Present value / share price", unit: "currency", min: 0 },
      { symbol: "D", name: "Next payment / dividend", unit: "currency", min: 0, default: 2 },
      { symbol: "i", name: "Discount rate per period", unit: "percent", default: 10 },
      { symbol: "g", name: "Growth rate per period", unit: "percent", default: 4 }
    ],
    relation: function (v) { return v.P - v.D / (v.i - v.g); },
    inverse: {
      P: function (v) { return v.D / (v.i - v.g); },
      D: function (v) { return v.P * (v.i - v.g); },
      i: function (v) { return v.D / v.P + v.g; },
      g: function (v) { return v.i - v.D / v.P; }
    },
    steps: function (v, sf) {
      var s = [F("P = \\frac{D}{i-g}\\quad (i > g)", "Gordon growth model — D is NEXT period's payment")];
      if (sf === "P") s.push(F("P = \\frac{" + LC(v.D) + "}{" + L(v.i, 6) + " - " + L(v.g, 6) + "} = \\frac{" + LC(v.D) + "}{" + L(v.i - v.g, 8) + "} = " + LC(v.P), "Substitute and evaluate"));
      else if (sf === "D") s.push(F("D = P(i-g) = " + LC(v.P) + " \\times " + L(v.i - v.g, 8) + " = " + LC(v.D), "Rearrange"));
      else if (sf === "i") s.push(F("i = \\frac{D}{P} + g = " + L(v.D / v.P, 8) + " + " + L(v.g, 6) + " = " + L(v.i, 8) + " = " + pctL(v.i), "Rearrange — dividend yield plus growth"));
      else s.push(F("g = i - \\frac{D}{P} = " + L(v.i, 6) + " - " + L(v.D / v.P, 8) + " = " + L(v.g, 8) + " = " + pctL(v.g), "Rearrange"));
      return s;
    },
    problemGenerator: function (rng, diff) {
      var D = rng.range(1, 12, 0.25);
      var g = rng.range(2, 6, 0.25);
      var i = g + rng.range(3, 8, 0.25);
      var P = D / ((i - g) / 100);
      return {
        prompt: "A share is expected to pay a dividend of " + cur(D, 2) + " next year, growing at " + g +
          "% per year forever. Investors require " + i + "% per year. What is the share worth today?",
        given: { D: D, i: i, g: g }, solveFor: "P",
        answer: WB.round(P, 2), tolerance: tolCur(P), unit: "currency"
      };
    }
  });

  EQ.push({
    id: "sinking_fund",
    name: "Sinking fund payment",
    category: "Time value of money",
    examCore: true,
    latex: "R = \\frac{F\\,i}{(1+i)^{n} - 1}",
    description: "The level end-of-period deposit R needed to accumulate a target F after n periods at rate i.",
    variables: [
      { symbol: "R", name: "Deposit per period", unit: "currency", min: 0 },
      { symbol: "F", name: "Target amount", unit: "currency", min: 0, default: 100000 },
      { symbol: "i", name: "Rate per period", unit: "percent", default: 6 },
      { symbol: "n", name: "Number of deposits", unit: "count", min: 1, default: 10 }
    ],
    relation: function (v) { return v.R - v.F * v.i / (pow(1 + v.i, v.n) - 1); },
    inverse: {
      R: function (v) { return v.F * v.i / (pow(1 + v.i, v.n) - 1); },
      F: function (v) { return v.R * annuityFV(v.i, v.n); },
      n: function (v) { return Math.log(1 + v.F * v.i / v.R) / Math.log(1 + v.i); }
    },
    steps: function (v, sf) {
      var s = [F("R = \\frac{F\\,i}{(1+i)^n - 1}", "Sinking fund: FV-annuity formula solved for the payment")];
      if (sf === "R") {
        s.push(F("R = \\frac{" + LC(v.F) + " \\times " + L(v.i, 6) + "}{(1+" + L(v.i, 6) + ")^{" + L(v.n) + "} - 1} = \\frac{" + LC(v.F * v.i) + "}{" + L(pow(1 + v.i, v.n) - 1, 8) + "}", "Substitute"));
        s.push(F("R = " + LC(v.R), "Evaluate"));
      } else if (sf === "F") {
        s.push(F("F = R\\,\\frac{(1+i)^n-1}{i} = " + LC(v.R) + " \\times " + L(annuityFV(v.i, v.n), 8) + " = " + LC(v.F), "Rearrange back to the FV form"));
      } else {
        s.push(F("\\frac{F\\,i}{(1+i)^n-1} - R = 0", "Solve the relation for " + sf));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var Fv = rng.range(50000, 800000, 10000);
      var i = rng.range(5, 11, 0.25);
      var n = rng.int(5, 20);
      var R = Fv * (i / 100) / (pow(1 + i / 100, n) - 1);
      return {
        prompt: rng.pick(FIRMS) + " must replace a machine costing " + cur(Fv) + " in " + n +
          " years. Equal deposits are made at the end of each year into a fund earning " + i +
          "% per year. Find the required annual deposit.",
        given: { F: Fv, i: i, n: n }, solveFor: "R",
        answer: WB.round(R, 2), tolerance: tolCur(R), unit: "currency"
      };
    }
  });

  EQ.push({
    id: "loan_payment",
    name: "Loan payment (amortisation)",
    category: "Time value of money",
    examCore: true,
    latex: "R = \\frac{P\\,i}{1-(1+i)^{-n}}",
    description: "The level end-of-period payment R that amortises a loan of P over n periods at rate i per period.",
    variables: [
      { symbol: "R", name: "Payment per period", unit: "currency", min: 0 },
      { symbol: "P", name: "Loan principal", unit: "currency", min: 0, default: 100000 },
      { symbol: "i", name: "Rate per period", unit: "percent", default: 1 },
      { symbol: "n", name: "Number of payments", unit: "count", min: 1, default: 240 }
    ],
    relation: function (v) { return v.R - v.P * v.i / (1 - pow(1 + v.i, -v.n)); },
    inverse: {
      R: function (v) { return v.P * v.i / (1 - pow(1 + v.i, -v.n)); },
      P: function (v) { return v.R * annuityPV(v.i, v.n); },
      n: function (v) { return -Math.log(1 - v.P * v.i / v.R) / Math.log(1 + v.i); }
    },
    chart: "amortization",
    steps: function (v, sf) {
      var s = [F("R = \\frac{P\\,i}{1-(1+i)^{-n}}", "PV-annuity formula solved for the payment: the loan equals the PV of all payments")];
      if (sf === "R") {
        s.push(F("R = \\frac{" + LC(v.P) + " \\times " + L(v.i, 6) + "}{1-(1+" + L(v.i, 6) + ")^{-" + L(v.n) + "}} = \\frac{" + LC(v.P * v.i) + "}{" + L(1 - pow(1 + v.i, -v.n), 8) + "}", "Substitute"));
        s.push(F("R = " + LC(v.R), "Evaluate — total paid over the loan: " + cur(v.R * v.n, 2)));
      } else if (sf === "P") {
        s.push(F("P = R\\,\\frac{1-(1+i)^{-n}}{i} = " + LC(v.R) + " \\times " + L(annuityPV(v.i, v.n), 8) + " = " + LC(v.P), "The affordable loan is the PV of the payments"));
      } else if (sf === "n") {
        s.push(F("n = \\frac{-\\ln(1 - Pi/R)}{\\ln(1+i)} = \\frac{-\\ln(" + L(1 - v.P * v.i / v.R, 8) + ")}{\\ln(" + L(1 + v.i, 8) + ")} = " + L(v.n, 6), "Solve with logs — requires R > Pi (payment must beat the interest)"));
      } else {
        s.push(F("\\frac{P\\,i}{1-(1+i)^{-n}} - R = 0", "No closed form for i — solve numerically"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var P = rng.range(80000, diff > 1 ? 1500000 : 400000, 10000);
      var iAnn = rng.range(8, 14, 0.25);
      var yrs = rng.pick(diff > 1 ? [5, 10, 15, 20, 25] : [5, 10, 20]);
      var i = iAnn / 12, n = yrs * 12;
      var R = P * (i / 100) / (1 - pow(1 + i / 100, -n));
      return {
        prompt: rng.pick(NAMES) + " takes a home loan of " + cur(P) + " at " + iAnn +
          "% per year compounded monthly, repaid with equal month-end payments over " + yrs +
          " years. Find the monthly payment.",
        given: { P: P, i: WB.round(i, 6), n: n }, solveFor: "R",
        answer: WB.round(R, 2), tolerance: tolCur(R), unit: "currency"
      };
    }
  });

  EQ.push({
    id: "outstanding_balance",
    name: "Outstanding loan balance after k payments",
    category: "Time value of money",
    examCore: true,
    latex: "B_k = P(1+i)^{k} - R\\,\\frac{(1+i)^{k}-1}{i}",
    description: "Balance still owed on a loan of P after k payments of R at rate i per period (retrospective method).",
    variables: [
      { symbol: "B", name: "Outstanding balance", unit: "currency", min: 0 },
      { symbol: "P", name: "Original loan", unit: "currency", min: 0, default: 100000 },
      { symbol: "R", name: "Payment per period", unit: "currency", min: 0, default: 1101.09 },
      { symbol: "i", name: "Rate per period", unit: "percent", default: 1 },
      { symbol: "k", name: "Payments already made", unit: "count", min: 0, default: 12 }
    ],
    relation: function (v) { return v.B - (v.P * pow(1 + v.i, v.k) - v.R * annuityFV(v.i, v.k)); },
    inverse: {
      B: function (v) { return v.P * pow(1 + v.i, v.k) - v.R * annuityFV(v.i, v.k); },
      P: function (v) { return (v.B + v.R * annuityFV(v.i, v.k)) / pow(1 + v.i, v.k); },
      R: function (v) { return (v.P * pow(1 + v.i, v.k) - v.B) / annuityFV(v.i, v.k); }
    },
    chart: "amortization",
    steps: function (v, sf) {
      var grown = v.P * pow(1 + v.i, v.k), paid = v.R * annuityFV(v.i, v.k);
      var s = [F("B_k = P(1+i)^k - R\\,s_{\\overline{k}|i}", "Retrospective method: the debt grown forward, minus the accumulated value of the payments made")];
      if (sf === "B") {
        s.push(F("P(1+i)^k = " + LC(v.P) + "(1+" + L(v.i, 6) + ")^{" + L(v.k) + "} = " + LC(grown), "Grow the original debt"));
        s.push(F("R\\,s_{\\overline{k}|i} = " + LC(v.R) + " \\times " + L(annuityFV(v.i, v.k), 8) + " = " + LC(paid), "Accumulate the payments made"));
        s.push(F("B_k = " + LC(grown) + " - " + LC(paid) + " = " + LC(v.B), "Subtract"));
      } else {
        s.push(F("P(1+i)^k - R\\,s_{\\overline{k}|i} - B = 0", "Solve the relation for " + sf));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var P = rng.range(100000, 900000, 25000);
      var iAnn = rng.range(9, 13, 0.5);
      var yrs = rng.pick([10, 15, 20]);
      var i = iAnn / 12 / 100, n = yrs * 12;
      var R = P * i / (1 - pow(1 + i, -n));
      var k = rng.int(6, Math.min(n - 12, 60));
      var B = P * pow(1 + i, k) - R * annuityFV(i, k);
      return {
        prompt: "A loan of " + cur(P) + " at " + iAnn + "% per year compounded monthly is repaid over " + yrs +
          " years with monthly payments of " + cur(R, 2) + ". What is the outstanding balance immediately after payment number " + k + "?",
        given: { P: P, R: WB.round(R, 2), i: WB.round(iAnn / 12, 6), k: k }, solveFor: "B",
        answer: WB.round(B, 2), tolerance: Math.max(2, Math.abs(B) * 0.003), unit: "currency"
      };
    }
  });

  EQ.push({
    id: "equivalent_payment",
    name: "Equivalent payments (moving a debt)",
    category: "Time value of money",
    examCore: true,
    latex: "X = S\\,(1+i)^{t}",
    description: "Value of an obligation S moved t periods along the timeline at rate i per period (t negative = earlier date).",
    variables: [
      { symbol: "X", name: "Equivalent value at new date", unit: "currency", min: 0 },
      { symbol: "S", name: "Original obligation", unit: "currency", min: 0, default: 10000 },
      { symbol: "i", name: "Rate per period", unit: "percent", default: 8 },
      { symbol: "t", name: "Periods moved (+later / −earlier)", unit: "count", default: 2 }
    ],
    relation: function (v) { return v.X - v.S * pow(1 + v.i, v.t); },
    inverse: {
      X: function (v) { return v.S * pow(1 + v.i, v.t); },
      S: function (v) { return v.X * pow(1 + v.i, -v.t); },
      t: function (v) { return Math.log(v.X / v.S) / Math.log(1 + v.i); },
      i: function (v) { return pow(v.X / v.S, 1 / v.t) - 1; }
    },
    steps: function (v, sf) {
      var s = [F("X = S(1+i)^{t}", "Money moves along the timeline with the compounding factor; t < 0 discounts to an earlier date")];
      if (sf === "X") {
        s.push(F("X = " + LC(v.S) + "(1+" + L(v.i, 6) + ")^{" + L(v.t) + "} = " + LC(v.S) + " \\times " + L(pow(1 + v.i, v.t), 8), "Substitute"));
        s.push(F("X = " + LC(v.X), v.t >= 0 ? "The debt grows moving later" : "The debt shrinks moving earlier"));
      } else if (sf === "S") {
        s.push(F("S = X(1+i)^{-t} = " + LC(v.X) + " \\times " + L(pow(1 + v.i, -v.t), 8) + " = " + LC(v.S), "Rearrange"));
      } else if (sf === "t") {
        s.push(F("t = \\frac{\\ln(X/S)}{\\ln(1+i)} = " + L(v.t, 6) + "\\ \\text{periods}", "Solve with logs"));
      } else {
        s.push(F("i = (X/S)^{1/t} - 1 = " + L(v.i, 8) + " = " + pctL(v.i), "Take the t-th root"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var S = rng.range(5000, 100000, 1000);
      var i = rng.range(6, 12, 0.25);
      var t = rng.int(1, 6) * (rng() < 0.4 ? -1 : 1);
      var X = S * pow(1 + i / 100, t);
      var dir = t > 0 ? (t + " year" + (Math.abs(t) === 1 ? "" : "s") + " LATER")
                      : (Math.abs(t) + " year" + (Math.abs(t) === 1 ? "" : "s") + " EARLIER");
      return {
        prompt: "A debt of " + cur(S) + " is due on a certain date. The creditor agrees to move the payment " +
          dir + " with money worth " + i + "% per year compounded annually. What amount is payable on the new date?",
        given: { S: S, i: i, t: t }, solveFor: "X",
        answer: WB.round(X, 2), tolerance: tolCur(X), unit: "currency"
      };
    }
  });

  /* ════════════════════════════════════════════════════════════════════
   * INVESTMENT APPRAISAL  (exam core — list-type where needed)
   * ════════════════════════════════════════════════════════════════════ */

  EQ.push({
    id: "npv",
    name: "Net present value (NPV)",
    category: "Investment appraisal",
    examCore: true,
    type: "list",
    latex: "NPV = \\sum_{t=0}^{n} \\frac{CF_t}{(1+r)^{t}}",
    description: "Discount a cash-flow list (t = 0 first, outflows negative) at rate r per period and sum.",
    chart: "npv_profile",
    inputs: [
      { key: "cashflows", label: "Cash flows (t = 0 first, outflows negative)", kind: "cashflow", default: [-1000, 400, 400, 400] },
      { key: "rate", label: "Discount rate per period", kind: "number", unit: "percent", default: 10 }
    ],
    compute: function (inp) {
      var r = inp.rate / 100, cfs = inp.cashflows;
      var steps = [F("NPV = \\sum_t \\frac{CF_t}{(1+r)^t}\\quad r = " + pctL(r), "Discount every cash flow to t = 0")];
      var total = 0;
      var rows = cfs.map(function (cf, t) {
        var pv = cf / pow(1 + r, t);
        total += pv;
        steps.push(F("\\frac{" + LC(cf) + "}{(1+" + L(r, 6) + ")^{" + t + "}} = " + LC(pv), "Cash flow at t = " + t));
        return pv;
      });
      steps.push(F("NPV = " + LC(total), total >= 0 ? "Positive NPV — the project adds value at this rate" : "Negative NPV — reject at this rate"));
      return {
        outputs: [{ label: "NPV", symbol: "NPV", value: WB.round(total, 6), unit: "currency" }],
        steps: steps, pvRows: rows
      };
    },
    problemGenerator: function (rng, diff) {
      var c0 = -rng.range(5000, 50000, 1000);
      var nn = rng.int(3, diff > 1 ? 5 : 3);
      var cfs = [c0];
      for (var t = 1; t <= nn; t++) cfs.push(rng.range(1000, Math.abs(c0) * 0.6, 500));
      var r = rng.range(8, 15, 0.5);
      var ans = npvOf(r / 100, cfs);
      return {
        prompt: rng.pick(FIRMS) + " considers a project: initial outlay " + cur(-c0) +
          ", then year-end inflows of " + cfs.slice(1).map(function (c) { return cur(c); }).join(", ") +
          ". At a required return of " + r + "% per year, compute the NPV.",
        given: { cashflows: cfs, rate: r }, solveFor: "NPV",
        answer: WB.round(ans, 2), tolerance: Math.max(1, Math.abs(ans) * 0.005), unit: "currency"
      };
    }
  });

  EQ.push({
    id: "irr",
    name: "Internal rate of return (IRR)",
    category: "Investment appraisal",
    examCore: true,
    type: "list",
    latex: "0 = \\sum_{t=0}^{n} \\frac{CF_t}{(1+IRR)^{t}}",
    description: "The discount rate that makes NPV exactly zero. Found numerically.",
    chart: "npv_profile",
    inputs: [
      { key: "cashflows", label: "Cash flows (t = 0 first, outflows negative)", kind: "cashflow", default: [-1000, 400, 400, 400] }
    ],
    compute: function (inp) {
      var cfs = inp.cashflows;
      var res = irrOf(cfs);
      if (!res) {
        return {
          outputs: [{ label: "IRR", symbol: "IRR", value: NaN, unit: "percent" }],
          steps: [F("\\text{no sign change found}", "No IRR in a realistic range — the NPV never crosses zero. Check that the cash flows change sign.")],
          error: "No IRR in a realistic range (the cash-flow list must change sign)."
        };
      }
      var irr = res.root;
      var steps = [
        F("0 = \\sum_t \\frac{CF_t}{(1+IRR)^t}", "IRR is the root of the NPV function — no algebraic solution exists for 3+ periods"),
        F("NPV(" + pctL(Math.max(0, irr - 0.05), 2) + ") = " + LC(npvOf(Math.max(0, irr - 0.05), cfs), 2) + ",\\quad NPV(" + pctL(irr + 0.05, 2) + ") = " + LC(npvOf(irr + 0.05, cfs), 2), "Bracket: NPV changes sign, so the root lies between"),
        F("IRR \\approx " + pctL(irr, 4), "Brent's method converged in " + res.iterations + " iterations; NPV at this rate = " + cur(npvOf(irr, cfs), 6))
      ];
      return { outputs: [{ label: "IRR (per period)", symbol: "IRR", value: WB.round(irr * 100, 6), unit: "percent" }], steps: steps };
    },
    problemGenerator: function (rng, diff) {
      var c0 = -rng.range(10000, 60000, 1000);
      var nn = rng.int(3, 4);
      var cfs = [c0];
      for (var t = 1; t <= nn; t++) cfs.push(rng.range(Math.abs(c0) * 0.25, Math.abs(c0) * 0.55, 500));
      var res = irrOf(cfs);
      if (!res) return this.problemGenerator(rng, diff);
      var irr = res.root * 100;
      return {
        prompt: "A project costs " + cur(-c0) + " today and returns " +
          cfs.slice(1).map(function (c) { return cur(c); }).join(", ") +
          " at the end of each year. Find the IRR (% per year, 2 decimals).",
        given: { cashflows: cfs }, solveFor: "IRR",
        answer: WB.round(irr, 4), tolerance: Math.max(0.06, irr * 0.01), unit: "percent"
      };
    }
  });

  EQ.push({
    id: "payback_period",
    name: "Payback period",
    category: "Investment appraisal",
    examCore: true,
    type: "list",
    latex: "PB = t^{*} + \\frac{\\text{unrecovered cost}}{CF_{t^{*}+1}}",
    description: "Years until cumulative (undiscounted) cash flows recover the initial outlay, with fractional-year interpolation.",
    inputs: [
      { key: "cashflows", label: "Cash flows (t = 0 first, outflow negative)", kind: "cashflow", default: [-10000, 3000, 4000, 4000, 3000] }
    ],
    compute: function (inp) {
      var cfs = inp.cashflows;
      var cum = cfs[0];
      var steps = [F("\\text{cumulative}_0 = " + LC(cum), "Start with the outlay")];
      var pb = null;
      for (var t = 1; t < cfs.length; t++) {
        var prev = cum;
        cum += cfs[t];
        steps.push(F("\\text{cumulative}_{" + t + "} = " + LC(prev) + " + " + LC(cfs[t]) + " = " + LC(cum), ""));
        if (pb === null && prev < 0 && cum >= 0) {
          pb = (t - 1) + (-prev) / cfs[t];
          steps.push(F("PB = " + (t - 1) + " + \\frac{" + LC(-prev) + "}{" + LC(cfs[t]) + "} = " + L(pb, 4) + "\\ \\text{years}", "Interpolate within year " + t));
        }
      }
      if (pb === null) steps.push(F("\\text{never recovered}", "Cumulative cash flow never reaches zero — no payback."));
      return {
        outputs: [{ label: "Payback period (years)", symbol: "PB", value: pb === null ? NaN : WB.round(pb, 6), unit: "years" }],
        steps: steps,
        error: pb === null ? "The outlay is never recovered." : undefined
      };
    },
    problemGenerator: function (rng, diff) {
      var c0 = -rng.range(8000, 40000, 1000);
      var cfs = [c0];
      for (var t = 1; t <= 5; t++) cfs.push(rng.range(Math.abs(c0) * 0.15, Math.abs(c0) * 0.45, 250));
      var cum = c0, pb = null;
      for (var k = 1; k < cfs.length; k++) {
        var prev = cum; cum += cfs[k];
        if (pb === null && prev < 0 && cum >= 0) pb = (k - 1) + (-prev) / cfs[k];
      }
      if (pb === null) return this.problemGenerator(rng, diff);
      return {
        prompt: "A machine costs " + cur(-c0) + " and generates year-end cash flows of " +
          cfs.slice(1).map(function (c) { return cur(c); }).join(", ") +
          ". Compute the payback period in years (2 decimals, interpolate within the year).",
        given: { cashflows: cfs }, solveFor: "PB",
        answer: WB.round(pb, 4), tolerance: 0.03, unit: "years"
      };
    }
  });

  EQ.push({
    id: "discounted_payback",
    name: "Discounted payback period",
    category: "Investment appraisal",
    examCore: true,
    type: "list",
    latex: "DPB:\\ \\sum_{t=0}^{DPB} \\frac{CF_t}{(1+r)^{t}} = 0",
    description: "Payback period computed on discounted cash flows — always longer than simple payback.",
    inputs: [
      { key: "cashflows", label: "Cash flows (t = 0 first, outflow negative)", kind: "cashflow", default: [-10000, 4000, 4000, 4000, 4000] },
      { key: "rate", label: "Discount rate per period", kind: "number", unit: "percent", default: 10 }
    ],
    compute: function (inp) {
      var r = inp.rate / 100, cfs = inp.cashflows;
      var cum = cfs[0], pb = null;
      var steps = [F("\\text{Discount each flow, then accumulate. } r = " + pctL(r), "")];
      steps.push(F("\\text{cumulative}_0 = " + LC(cum), "Outlay at t = 0 is not discounted"));
      for (var t = 1; t < cfs.length; t++) {
        var pv = cfs[t] / pow(1 + r, t);
        var prev = cum; cum += pv;
        steps.push(F("PV_{" + t + "} = \\frac{" + LC(cfs[t]) + "}{(1+" + L(r, 4) + ")^{" + t + "}} = " + LC(pv) + "\\ \\Rightarrow\\ \\text{cum} = " + LC(cum), ""));
        if (pb === null && prev < 0 && cum >= 0) {
          pb = (t - 1) + (-prev) / pv;
          steps.push(F("DPB = " + (t - 1) + " + \\frac{" + LC(-prev) + "}{" + LC(pv) + "} = " + L(pb, 4) + "\\ \\text{years}", "Interpolate"));
        }
      }
      if (pb === null) steps.push(F("\\text{never recovered}", "Discounted flows never recover the outlay."));
      return {
        outputs: [{ label: "Discounted payback (years)", symbol: "DPB", value: pb === null ? NaN : WB.round(pb, 6), unit: "years" }],
        steps: steps,
        error: pb === null ? "The outlay is never recovered at this rate." : undefined
      };
    },
    problemGenerator: function (rng, diff) {
      var c0 = -rng.range(10000, 30000, 1000);
      var cfs = [c0];
      for (var t = 1; t <= 6; t++) cfs.push(rng.range(Math.abs(c0) * 0.2, Math.abs(c0) * 0.4, 250));
      var r = rng.range(8, 14, 0.5) / 100;
      var cum = c0, pb = null;
      for (var k = 1; k < cfs.length; k++) {
        var pv = cfs[k] / pow(1 + r, k);
        var prev = cum; cum += pv;
        if (pb === null && prev < 0 && cum >= 0) pb = (k - 1) + (-prev) / pv;
      }
      if (pb === null) return this.problemGenerator(rng, diff);
      return {
        prompt: "A project costs " + cur(-c0) + " with year-end inflows of " +
          cfs.slice(1).map(function (c) { return cur(c); }).join(", ") +
          ". Using a discount rate of " + WB.fmtNum(r * 100, 1) + "% per year, find the DISCOUNTED payback period (years, 2 decimals).",
        given: { cashflows: cfs, rate: r * 100 }, solveFor: "DPB",
        answer: WB.round(pb, 4), tolerance: 0.03, unit: "years"
      };
    }
  });

  EQ.push({
    id: "profitability_index",
    name: "Profitability index",
    category: "Investment appraisal",
    examCore: true,
    type: "list",
    latex: "PI = \\frac{\\sum_{t\\ge 1} CF_t/(1+r)^{t}}{|CF_0|}",
    description: "PV of future inflows per unit of initial outlay. PI > 1 ⇔ NPV > 0.",
    inputs: [
      { key: "cashflows", label: "Cash flows (t = 0 first, outflow negative)", kind: "cashflow", default: [-1000, 400, 400, 400] },
      { key: "rate", label: "Discount rate per period", kind: "number", unit: "percent", default: 8 }
    ],
    compute: function (inp) {
      var r = inp.rate / 100, cfs = inp.cashflows;
      var pvIn = 0;
      for (var t = 1; t < cfs.length; t++) pvIn += cfs[t] / pow(1 + r, t);
      var out = Math.abs(cfs[0]);
      var pi = pvIn / out;
      var steps = [
        F("PI = \\frac{PV(\\text{inflows})}{|CF_0|}", "Benefit-cost ratio form"),
        F("PV(\\text{inflows}) = " + LC(pvIn), "Sum of discounted t ≥ 1 flows at " + pctL(r)),
        F("PI = \\frac{" + LC(pvIn) + "}{" + LC(out) + "} = " + L(pi, 6), pi > 1 ? "PI > 1: accept (NPV is positive)" : "PI < 1: reject (NPV is negative)")
      ];
      return { outputs: [{ label: "Profitability index", symbol: "PI", value: WB.round(pi, 6), unit: "number" }], steps: steps };
    },
    problemGenerator: function (rng, diff) {
      var c0 = -rng.range(10000, 50000, 1000);
      var cfs = [c0];
      for (var t = 1; t <= rng.int(3, 5); t++) cfs.push(rng.range(Math.abs(c0) * 0.2, Math.abs(c0) * 0.5, 500));
      var r = rng.range(8, 14, 0.5);
      var pvIn = 0;
      for (var k = 1; k < cfs.length; k++) pvIn += cfs[k] / pow(1 + r / 100, k);
      var pi = pvIn / Math.abs(c0);
      return {
        prompt: "Initial outlay " + cur(-c0) + "; year-end inflows " +
          cfs.slice(1).map(function (c) { return cur(c); }).join(", ") +
          "; required return " + r + "% per year. Compute the profitability index (3 decimals).",
        given: { cashflows: cfs, rate: r }, solveFor: "PI",
        answer: WB.round(pi, 4), tolerance: 0.012, unit: "number"
      };
    }
  });

  /* ════════════════════════════════════════════════════════════════════
   * DEPRECIATION
   * ════════════════════════════════════════════════════════════════════ */

  EQ.push({
    id: "straight_line_dep",
    name: "Straight-line depreciation",
    category: "Depreciation",
    latex: "D = \\frac{C - S}{n}",
    description: "Equal annual depreciation: cost C, salvage S, useful life n years.",
    variables: [
      { symbol: "D", name: "Annual depreciation", unit: "currency", min: 0 },
      { symbol: "C", name: "Cost", unit: "currency", min: 0, default: 50000 },
      { symbol: "S", name: "Salvage value", unit: "currency", min: 0, default: 5000 },
      { symbol: "n", name: "Useful life (years)", unit: "years", min: 0.01, default: 9 }
    ],
    relation: function (v) { return v.D - (v.C - v.S) / v.n; },
    inverse: {
      D: function (v) { return (v.C - v.S) / v.n; },
      C: function (v) { return v.D * v.n + v.S; },
      S: function (v) { return v.C - v.D * v.n; },
      n: function (v) { return (v.C - v.S) / v.D; }
    },
    steps: function (v, sf) {
      var s = [F("D = \\frac{C-S}{n}", "Depreciable base spread evenly over the life")];
      if (sf === "D") s.push(F("D = \\frac{" + LC(v.C) + " - " + LC(v.S) + "}{" + L(v.n) + "} = \\frac{" + LC(v.C - v.S) + "}{" + L(v.n) + "} = " + LC(v.D), "Substitute and evaluate"));
      return s;
    },
    problemGenerator: function (rng, diff) {
      var C = rng.range(20000, 500000, 5000);
      var S = rng.range(0, C * 0.2, 1000);
      var n = rng.int(3, 15);
      var D = (C - S) / n;
      return {
        prompt: rng.pick(FIRMS) + " buys equipment for " + cur(C) + " with an expected salvage value of " +
          cur(S) + " after " + n + " years. Find the annual straight-line depreciation.",
        given: { C: C, S: S, n: n }, solveFor: "D",
        answer: WB.round(D, 2), tolerance: tolCur(D), unit: "currency"
      };
    }
  });

  EQ.push({
    id: "reducing_balance_dep",
    name: "Reducing-balance depreciation",
    category: "Depreciation",
    latex: "V_n = C\\,(1 - r)^{n}",
    description: "Book value after n years at a fixed depreciation rate r per year on the remaining balance.",
    variables: [
      { symbol: "V", name: "Book value after n years", unit: "currency", min: 0 },
      { symbol: "C", name: "Cost", unit: "currency", min: 0, default: 10000 },
      { symbol: "r", name: "Depreciation rate per year", unit: "percent", default: 20 },
      { symbol: "n", name: "Years", unit: "years", min: 0, default: 3 }
    ],
    relation: function (v) { return v.V - v.C * pow(1 - v.r, v.n); },
    inverse: {
      V: function (v) { return v.C * pow(1 - v.r, v.n); },
      C: function (v) { return v.V / pow(1 - v.r, v.n); },
      r: function (v) { return 1 - pow(v.V / v.C, 1 / v.n); },
      n: function (v) { return Math.log(v.V / v.C) / Math.log(1 - v.r); }
    },
    steps: function (v, sf) {
      var s = [F("V_n = C(1-r)^n", "Compound decay — mirror image of compound interest")];
      if (sf === "V") s.push(F("V = " + LC(v.C) + "(1-" + L(v.r, 6) + ")^{" + L(v.n) + "} = " + LC(v.C) + " \\times " + L(pow(1 - v.r, v.n), 8) + " = " + LC(v.V), "Substitute and evaluate"));
      else if (sf === "r") s.push(F("r = 1 - \\left(\\tfrac{V}{C}\\right)^{1/n} = 1 - (" + L(v.V / v.C, 8) + ")^{1/" + L(v.n) + "} = " + L(v.r, 8) + " = " + pctL(v.r), "Take the n-th root"));
      else if (sf === "n") s.push(F("n = \\frac{\\ln(V/C)}{\\ln(1-r)} = " + L(v.n, 6) + "\\ \\text{years}", "Take logs"));
      return s;
    },
    problemGenerator: function (rng, diff) {
      var C = rng.range(30000, 400000, 5000);
      var r = rng.range(10, 30, 2.5);
      var n = rng.int(2, 8);
      var V = C * pow(1 - r / 100, n);
      return {
        prompt: "A vehicle costing " + cur(C) + " depreciates at " + r +
          "% per year on the reducing-balance method. Find its book value after " + n + " years.",
        given: { C: C, r: r, n: n }, solveFor: "V",
        answer: WB.round(V, 2), tolerance: tolCur(V), unit: "currency"
      };
    }
  });

  EQ.push({
    id: "units_production_dep",
    name: "Units-of-production depreciation",
    category: "Depreciation",
    latex: "D = (C - S)\\,\\frac{u}{U}",
    description: "Depreciation for a period in which u units were produced, out of a lifetime capacity of U units.",
    variables: [
      { symbol: "D", name: "Depreciation this period", unit: "currency", min: 0 },
      { symbol: "C", name: "Cost", unit: "currency", min: 0, default: 120000 },
      { symbol: "S", name: "Salvage value", unit: "currency", min: 0, default: 20000 },
      { symbol: "u", name: "Units produced this period", unit: "count", min: 0, default: 15000 },
      { symbol: "U", name: "Total lifetime units", unit: "count", min: 1, default: 100000 }
    ],
    relation: function (v) { return v.D - (v.C - v.S) * v.u / v.U; },
    inverse: {
      D: function (v) { return (v.C - v.S) * v.u / v.U; },
      u: function (v) { return v.D * v.U / (v.C - v.S); },
      U: function (v) { return (v.C - v.S) * v.u / v.D; }
    },
    steps: function (v, sf) {
      var rate = (v.C - v.S) / v.U;
      var s = [F("D = (C-S)\\,\\frac{u}{U}", "Cost per unit of capacity × units used")];
      if (sf === "D") {
        s.push(F("\\text{rate} = \\frac{" + LC(v.C) + " - " + LC(v.S) + "}{" + L(v.U) + "} = " + LC(rate, 4) + "\\ \\text{per unit}", "Depreciable base per unit"));
        s.push(F("D = " + LC(rate, 4) + " \\times " + L(v.u) + " = " + LC(v.D), "Multiply by production"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var C = rng.range(80000, 600000, 10000);
      var S = rng.range(0, C * 0.15, 5000);
      var U = rng.range(50000, 500000, 10000);
      var u = rng.range(U * 0.05, U * 0.3, 1000);
      var D = (C - S) * u / U;
      return {
        prompt: "A press costs " + cur(C) + " (salvage " + cur(S) + ") and can stamp " +
          WB.fmtNum(U, 0) + " units over its life. It produced " + WB.fmtNum(u, 0) +
          " units this year. Find this year's units-of-production depreciation.",
        given: { C: C, S: S, u: u, U: U }, solveFor: "D",
        answer: WB.round(D, 2), tolerance: tolCur(D), unit: "currency"
      };
    }
  });

  /* ════════════════════════════════════════════════════════════════════
   * ECONOMICS
   * ════════════════════════════════════════════════════════════════════ */

  EQ.push({
    id: "elasticity_midpoint",
    name: "Price elasticity of demand (midpoint)",
    category: "Economics",
    latex: "E_d = \\dfrac{\\frac{Q_2-Q_1}{(Q_1+Q_2)/2}}{\\frac{P_2-P_1}{(P_1+P_2)/2}}",
    description: "Arc elasticity using midpoint (average) bases, so the answer is the same in both directions.",
    variables: [
      { symbol: "E", name: "Elasticity", unit: "number" },
      { symbol: "Q1", name: "Initial quantity", unit: "count", min: 0.0001, default: 100 },
      { symbol: "Q2", name: "New quantity", unit: "count", min: 0.0001, default: 80 },
      { symbol: "P1", name: "Initial price", unit: "currency", min: 0.0001, default: 10 },
      { symbol: "P2", name: "New price", unit: "currency", min: 0.0001, default: 12 }
    ],
    relation: function (v) {
      return v.E - ((v.Q2 - v.Q1) / ((v.Q1 + v.Q2) / 2)) / ((v.P2 - v.P1) / ((v.P1 + v.P2) / 2));
    },
    steps: function (v, sf) {
      var dq = (v.Q2 - v.Q1) / ((v.Q1 + v.Q2) / 2);
      var dp = (v.P2 - v.P1) / ((v.P1 + v.P2) / 2);
      var s = [F("E_d = \\frac{\\%\\Delta Q}{\\%\\Delta P}\\ \\text{(midpoint bases)}", "Midpoint method")];
      if (sf === "E") {
        s.push(F("\\%\\Delta Q = \\frac{" + L(v.Q2) + " - " + L(v.Q1) + "}{(" + L(v.Q1) + "+" + L(v.Q2) + ")/2} = " + L(dq, 6), "Quantity change over the average quantity"));
        s.push(F("\\%\\Delta P = \\frac{" + L(v.P2) + " - " + L(v.P1) + "}{(" + L(v.P1) + "+" + L(v.P2) + ")/2} = " + L(dp, 6), "Price change over the average price"));
        s.push(F("E_d = \\frac{" + L(dq, 6) + "}{" + L(dp, 6) + "} = " + L(v.E, 6), Math.abs(v.E) > 1 ? "|E| > 1: demand is elastic" : "|E| < 1: demand is inelastic"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var P1 = rng.range(5, 60, 1), P2 = P1 + rng.range(1, 10, 0.5);
      var Q1 = rng.range(50, 500, 10);
      var Q2 = Q1 * (1 - rng.range(0.05, 0.4, 0.01));
      Q2 = WB.round(Q2, 0);
      var E = ((Q2 - Q1) / ((Q1 + Q2) / 2)) / ((P2 - P1) / ((P1 + P2) / 2));
      return {
        prompt: "When the price of a good rises from " + cur(P1, 2) + " to " + cur(P2, 2) +
          ", quantity demanded falls from " + Q1 + " to " + Q2 +
          " units. Compute the price elasticity of demand using the midpoint method (2 decimals, keep the sign).",
        given: { P1: P1, P2: P2, Q1: Q1, Q2: Q2 }, solveFor: "E",
        answer: WB.round(E, 4), tolerance: 0.03, unit: "number"
      };
    }
  });

  EQ.push({
    id: "elasticity_point",
    name: "Point (simple) elasticity",
    category: "Economics",
    latex: "E = \\frac{\\Delta Q / Q}{\\Delta P / P}",
    description: "Simple percentage-change elasticity using the initial values as bases.",
    variables: [
      { symbol: "E", name: "Elasticity", unit: "number" },
      { symbol: "dQ", name: "Change in quantity", unit: "number", default: -20 },
      { symbol: "Q", name: "Initial quantity", unit: "count", min: 0.0001, default: 100 },
      { symbol: "dP", name: "Change in price", unit: "number", default: 2 },
      { symbol: "P", name: "Initial price", unit: "currency", min: 0.0001, default: 10 }
    ],
    relation: function (v) { return v.E - (v.dQ / v.Q) / (v.dP / v.P); },
    steps: function (v, sf) {
      var s = [F("E = \\frac{\\Delta Q/Q}{\\Delta P/P}", "Percentage change in quantity over percentage change in price")];
      if (sf === "E") {
        s.push(F("E = \\frac{" + L(v.dQ) + "/" + L(v.Q) + "}{" + L(v.dP) + "/" + L(v.P) + "} = \\frac{" + L(v.dQ / v.Q, 6) + "}{" + L(v.dP / v.P, 6) + "} = " + L(v.E, 6), "Substitute and evaluate"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var Q = rng.range(100, 1000, 50), P = rng.range(10, 100, 5);
      var dP = rng.range(1, P * 0.2, 1);
      var dQ = -rng.range(Q * 0.05, Q * 0.35, 5);
      var E = (dQ / Q) / (dP / P);
      return {
        prompt: "At a price of " + cur(P, 2) + ", " + Q + " units sell. A price increase of " + cur(dP, 2) +
          " cuts sales by " + Math.abs(dQ) + " units. Compute the simple (point) price elasticity of demand (keep the sign).",
        given: { dQ: dQ, Q: Q, dP: dP, P: P }, solveFor: "E",
        answer: WB.round(E, 4), tolerance: 0.03, unit: "number"
      };
    }
  });

  EQ.push({
    id: "cross_elasticity",
    name: "Cross-price elasticity",
    category: "Economics",
    latex: "E_{xy} = \\dfrac{\\frac{Q_{x2}-Q_{x1}}{(Q_{x1}+Q_{x2})/2}}{\\frac{P_{y2}-P_{y1}}{(P_{y1}+P_{y2})/2}}",
    description: "Response of demand for good X to the price of good Y (midpoint bases). Positive = substitutes, negative = complements.",
    variables: [
      { symbol: "E", name: "Cross elasticity", unit: "number" },
      { symbol: "Qx1", name: "Initial quantity of X", unit: "count", min: 0.0001, default: 200 },
      { symbol: "Qx2", name: "New quantity of X", unit: "count", min: 0.0001, default: 250 },
      { symbol: "Py1", name: "Initial price of Y", unit: "currency", min: 0.0001, default: 20 },
      { symbol: "Py2", name: "New price of Y", unit: "currency", min: 0.0001, default: 25 }
    ],
    relation: function (v) {
      return v.E - ((v.Qx2 - v.Qx1) / ((v.Qx1 + v.Qx2) / 2)) / ((v.Py2 - v.Py1) / ((v.Py1 + v.Py2) / 2));
    },
    steps: function (v, sf) {
      var dq = (v.Qx2 - v.Qx1) / ((v.Qx1 + v.Qx2) / 2);
      var dp = (v.Py2 - v.Py1) / ((v.Py1 + v.Py2) / 2);
      var s = [F("E_{xy} = \\frac{\\%\\Delta Q_x}{\\%\\Delta P_y}", "Midpoint method")];
      if (sf === "E") {
        s.push(F("\\%\\Delta Q_x = " + L(dq, 6) + ",\\quad \\%\\Delta P_y = " + L(dp, 6), "Midpoint percentage changes"));
        s.push(F("E_{xy} = " + L(v.E, 6), v.E > 0 ? "Positive: the goods are substitutes" : "Negative: the goods are complements"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var sub = rng() < 0.6;
      var Qx1 = rng.range(100, 600, 20);
      var Qx2 = WB.round(Qx1 * (sub ? 1 + rng.range(0.05, 0.3, 0.01) : 1 - rng.range(0.05, 0.3, 0.01)), 0);
      var Py1 = rng.range(10, 80, 5), Py2 = Py1 + rng.range(2, 15, 1);
      var E = ((Qx2 - Qx1) / ((Qx1 + Qx2) / 2)) / ((Py2 - Py1) / ((Py1 + Py2) / 2));
      return {
        prompt: "When the price of good Y rises from " + cur(Py1, 2) + " to " + cur(Py2, 2) +
          ", demand for good X changes from " + Qx1 + " to " + Qx2 +
          " units. Compute the cross-price elasticity (midpoint method, keep the sign).",
        given: { Qx1: Qx1, Qx2: Qx2, Py1: Py1, Py2: Py2 }, solveFor: "E",
        answer: WB.round(E, 4), tolerance: 0.03, unit: "number"
      };
    }
  });

  EQ.push({
    id: "breakeven_qty",
    name: "Break-even quantity",
    category: "Economics",
    latex: "Q_{BE} = \\frac{F}{p - v}",
    description: "Units needed to cover fixed costs F when each unit sells at p with variable cost v (p − v = contribution margin).",
    variables: [
      { symbol: "Q", name: "Break-even quantity", unit: "count", min: 0 },
      { symbol: "F", name: "Fixed costs", unit: "currency", min: 0, default: 100000 },
      { symbol: "p", name: "Price per unit", unit: "currency", min: 0, default: 50 },
      { symbol: "v", name: "Variable cost per unit", unit: "currency", min: 0, default: 30 }
    ],
    relation: function (v) { return v.Q - v.F / (v.p - v.v); },
    inverse: {
      Q: function (v) { return v.F / (v.p - v.v); },
      F: function (v) { return v.Q * (v.p - v.v); },
      p: function (v) { return v.F / v.Q + v.v; },
      v: function (v) { return v.p - v.F / v.Q; }
    },
    steps: function (v, sf) {
      var cm = v.p - v.v;
      var s = [F("Q_{BE} = \\frac{F}{p-v}", "Fixed costs divided by contribution margin per unit")];
      if (sf === "Q") {
        s.push(F("p - v = " + LC(v.p, 2) + " - " + LC(v.v, 2) + " = " + LC(cm, 2), "Contribution margin per unit"));
        s.push(F("Q_{BE} = \\frac{" + LC(v.F) + "}{" + LC(cm, 2) + "} = " + L(v.Q, 4) + "\\ \\text{units}", "Evaluate — round UP to trade in whole units"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var p = rng.range(20, 200, 5);
      var vv = WB.round(p * rng.range(0.4, 0.75, 0.05), 2);
      var Fx = rng.range(50000, 500000, 10000);
      var Q = Fx / (p - vv);
      return {
        prompt: rng.pick(FIRMS) + " sells a product at " + cur(p, 2) + " with variable cost " + cur(vv, 2) +
          " per unit and fixed costs of " + cur(Fx) + " per year. Find the break-even quantity (units).",
        given: { F: Fx, p: p, v: vv }, solveFor: "Q",
        answer: WB.round(Q, 2), tolerance: Math.max(0.6, Q * 0.005), unit: "count"
      };
    }
  });

  EQ.push({
    id: "breakeven_revenue",
    name: "Break-even revenue",
    category: "Economics",
    latex: "TR_{BE} = \\frac{F}{1 - v/p}",
    description: "Sales revenue at break-even: fixed costs divided by the contribution margin RATIO.",
    variables: [
      { symbol: "T", name: "Break-even revenue", unit: "currency", min: 0 },
      { symbol: "F", name: "Fixed costs", unit: "currency", min: 0, default: 100000 },
      { symbol: "p", name: "Price per unit", unit: "currency", min: 0.0001, default: 50 },
      { symbol: "v", name: "Variable cost per unit", unit: "currency", min: 0, default: 30 }
    ],
    relation: function (v) { return v.T - v.F / (1 - v.v / v.p); },
    inverse: {
      T: function (v) { return v.F / (1 - v.v / v.p); },
      F: function (v) { return v.T * (1 - v.v / v.p); }
    },
    steps: function (v, sf) {
      var ratio = 1 - v.v / v.p;
      var s = [F("TR_{BE} = \\frac{F}{1 - v/p}", "The denominator is the contribution margin ratio")];
      if (sf === "T") {
        s.push(F("1 - \\frac{v}{p} = 1 - \\frac{" + LC(v.v, 2) + "}{" + LC(v.p, 2) + "} = " + L(ratio, 6), "CM ratio"));
        s.push(F("TR_{BE} = \\frac{" + LC(v.F) + "}{" + L(ratio, 6) + "} = " + LC(v.T), "Evaluate"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var p = rng.range(30, 250, 5);
      var vv = WB.round(p * rng.range(0.4, 0.7, 0.05), 2);
      var Fx = rng.range(60000, 800000, 20000);
      var T = Fx / (1 - vv / p);
      return {
        prompt: "Fixed costs are " + cur(Fx) + "; the product sells at " + cur(p, 2) +
          " with a variable cost of " + cur(vv, 2) + " per unit. What sales REVENUE is needed to break even?",
        given: { F: Fx, p: p, v: vv }, solveFor: "T",
        answer: WB.round(T, 2), tolerance: tolCur(T), unit: "currency"
      };
    }
  });

  EQ.push({
    id: "cvp_target_profit",
    name: "CVP target-profit quantity",
    category: "Economics",
    latex: "Q = \\frac{F + \\pi}{p - v}",
    description: "Units needed to earn a target profit π on top of covering fixed costs.",
    variables: [
      { symbol: "Q", name: "Required quantity", unit: "count", min: 0 },
      { symbol: "F", name: "Fixed costs", unit: "currency", min: 0, default: 100000 },
      { symbol: "T", name: "Target profit", unit: "currency", min: 0, default: 50000 },
      { symbol: "p", name: "Price per unit", unit: "currency", min: 0, default: 50 },
      { symbol: "v", name: "Variable cost per unit", unit: "currency", min: 0, default: 30 }
    ],
    relation: function (v) { return v.Q - (v.F + v.T) / (v.p - v.v); },
    inverse: {
      Q: function (v) { return (v.F + v.T) / (v.p - v.v); },
      T: function (v) { return v.Q * (v.p - v.v) - v.F; },
      F: function (v) { return v.Q * (v.p - v.v) - v.T; }
    },
    steps: function (v, sf) {
      var cm = v.p - v.v;
      var s = [F("Q = \\frac{F+\\pi}{p-v}", "Each unit's contribution margin must cover fixed costs plus the target profit")];
      if (sf === "Q") {
        s.push(F("Q = \\frac{" + LC(v.F) + " + " + LC(v.T) + "}{" + LC(cm, 2) + "} = \\frac{" + LC(v.F + v.T) + "}{" + LC(cm, 2) + "} = " + L(v.Q, 4) + "\\ \\text{units}", "Substitute and evaluate"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var p = rng.range(25, 180, 5);
      var vv = WB.round(p * rng.range(0.45, 0.7, 0.05), 2);
      var Fx = rng.range(80000, 400000, 10000);
      var T = rng.range(20000, 200000, 10000);
      var Q = (Fx + T) / (p - vv);
      return {
        prompt: "Fixed costs " + cur(Fx) + ", price " + cur(p, 2) + ", variable cost " + cur(vv, 2) +
          " per unit. How many units must be sold to earn a profit of " + cur(T) + "?",
        given: { F: Fx, T: T, p: p, v: vv }, solveFor: "Q",
        answer: WB.round(Q, 2), tolerance: Math.max(0.6, Q * 0.005), unit: "count"
      };
    }
  });

  EQ.push({
    id: "market_equilibrium",
    name: "Linear market equilibrium",
    category: "Economics",
    latex: "Q_d = a - bP,\\quad Q_s = c + dP\\ \\Rightarrow\\ P^{*} = \\frac{a-c}{b+d}",
    description: "Intersection of linear demand Qd = a − bP and supply Qs = c + dP. Solve for the equilibrium price P*.",
    variables: [
      { symbol: "P", name: "Equilibrium price", unit: "currency", min: 0 },
      { symbol: "a", name: "Demand intercept a", unit: "number", default: 100 },
      { symbol: "b", name: "Demand slope b", unit: "number", min: 0.000001, default: 2 },
      { symbol: "c", name: "Supply intercept c", unit: "number", default: 20 },
      { symbol: "d", name: "Supply slope d", unit: "number", min: 0.000001, default: 2 }
    ],
    relation: function (v) { return (v.a - v.b * v.P) - (v.c + v.d * v.P); },
    inverse: {
      P: function (v) { return (v.a - v.c) / (v.b + v.d); },
      a: function (v) { return v.c + v.d * v.P + v.b * v.P; },
      c: function (v) { return v.a - v.b * v.P - v.d * v.P; }
    },
    steps: function (v, sf) {
      var Q = v.a - v.b * v.P;
      var s = [F("a - bP = c + dP", "Set demand equal to supply")];
      if (sf === "P") {
        s.push(F(L(v.a) + " - " + L(v.b) + "P = " + L(v.c) + " + " + L(v.d) + "P", "Substitute"));
        s.push(F(L(v.a - v.c) + " = " + L(v.b + v.d) + "P \\ \\Rightarrow\\ P^{*} = \\frac{" + L(v.a - v.c) + "}{" + L(v.b + v.d) + "} = " + L(v.P, 6), "Collect terms and divide"));
        s.push(F("Q^{*} = a - bP^{*} = " + L(v.a) + " - " + L(v.b) + "\\times" + L(v.P, 6) + " = " + L(Q, 6), "Equilibrium quantity from either curve"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var b = rng.int(1, 6), d = rng.int(1, 6);
      var Pstar = rng.int(5, 40);
      var Qstar = rng.int(20, 200);
      var a = Qstar + b * Pstar, c = Qstar - d * Pstar;
      var askQ = rng() < 0.4;
      return {
        prompt: "Demand: Qd = " + a + " − " + b + "P.  Supply: Qs = " + c + " + " + d +
          "P.  Find the equilibrium " + (askQ ? "QUANTITY" : "PRICE") + ".",
        given: { a: a, b: b, c: c, d: d }, solveFor: askQ ? "Q*" : "P",
        answer: askQ ? Qstar : Pstar, tolerance: 0.02, unit: askQ ? "count" : "currency"
      };
    }
  });

  EQ.push({
    id: "fisher_equation",
    name: "Fisher equation (real vs nominal rate)",
    category: "Economics",
    latex: "(1 + i_{nom}) = (1 + r_{real})(1 + f)",
    description: "Exact relationship between the nominal rate, the real rate and inflation f.",
    variables: [
      { symbol: "N", name: "Nominal rate", unit: "percent", default: 12 },
      { symbol: "R", name: "Real rate", unit: "percent" },
      { symbol: "f", name: "Inflation rate", unit: "percent", default: 5 }
    ],
    relation: function (v) { return (1 + v.N) - (1 + v.R) * (1 + v.f); },
    inverse: {
      N: function (v) { return (1 + v.R) * (1 + v.f) - 1; },
      R: function (v) { return (1 + v.N) / (1 + v.f) - 1; },
      f: function (v) { return (1 + v.N) / (1 + v.R) - 1; }
    },
    steps: function (v, sf) {
      var s = [F("(1+i_{nom}) = (1+r)(1+f)", "Exact Fisher equation — the approximation r ≈ i − f ignores the cross term")];
      if (sf === "R") {
        s.push(F("r = \\frac{1+i_{nom}}{1+f} - 1 = \\frac{" + L(1 + v.N, 6) + "}{" + L(1 + v.f, 6) + "} - 1 = " + L(v.R, 8) + " = " + pctL(v.R), "Rearrange and evaluate"));
        s.push(F("r \\approx i - f = " + pctL(v.N - v.f, 2) + "\\ \\text{(approximation, for comparison)}", ""));
      } else if (sf === "N") {
        s.push(F("i_{nom} = (1+r)(1+f) - 1 = " + L((1 + v.R) * (1 + v.f), 8) + " - 1 = " + pctL(v.N), "Multiply out"));
      } else {
        s.push(F("f = \\frac{1+i_{nom}}{1+r} - 1 = " + L(v.f, 8) + " = " + pctL(v.f), "Rearrange"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var f = rng.range(3, 9, 0.25);
      var R = rng.range(1, 7, 0.25);
      var N = ((1 + R / 100) * (1 + f / 100) - 1) * 100;
      return {
        prompt: "An investment returns " + WB.fmtNum(N, 2) + "% per year while inflation runs at " + f +
          "%. Using the EXACT Fisher equation, what is the real rate of return (%)?",
        given: { N: WB.round(N, 4), f: f }, solveFor: "R",
        answer: WB.round(R, 4), tolerance: 0.03, unit: "percent"
      };
    }
  });

  EQ.push({
    id: "inflation_adjusted",
    name: "Inflation-adjusted (real) value",
    category: "Economics",
    latex: "V_{real} = \\frac{V_{nom}}{(1+f)^{n}}",
    description: "Today's purchasing power of a nominal amount received n years from now under inflation f.",
    variables: [
      { symbol: "V", name: "Real value", unit: "currency", min: 0 },
      { symbol: "M", name: "Nominal amount", unit: "currency", min: 0, default: 100000 },
      { symbol: "f", name: "Inflation per year", unit: "percent", default: 6 },
      { symbol: "n", name: "Years", unit: "years", min: 0, default: 10 }
    ],
    relation: function (v) { return v.V - v.M / pow(1 + v.f, v.n); },
    inverse: {
      V: function (v) { return v.M / pow(1 + v.f, v.n); },
      M: function (v) { return v.V * pow(1 + v.f, v.n); },
      n: function (v) { return Math.log(v.M / v.V) / Math.log(1 + v.f); },
      f: function (v) { return pow(v.M / v.V, 1 / v.n) - 1; }
    },
    steps: function (v, sf) {
      var s = [F("V_{real} = \\frac{V_{nom}}{(1+f)^n}", "Deflate by the compounded inflation factor")];
      if (sf === "V") s.push(F("V_{real} = \\frac{" + LC(v.M) + "}{(1+" + L(v.f, 6) + ")^{" + L(v.n) + "}} = \\frac{" + LC(v.M) + "}{" + L(pow(1 + v.f, v.n), 8) + "} = " + LC(v.V), "Substitute and evaluate"));
      return s;
    },
    problemGenerator: function (rng, diff) {
      var M = rng.range(50000, 2000000, 25000);
      var f = rng.range(4, 8, 0.25);
      var n = rng.int(5, 25);
      var V = M / pow(1 + f / 100, n);
      return {
        prompt: "A retirement policy will pay out " + cur(M) + " in " + n +
          " years. If inflation averages " + f + "% per year, what is that payout worth in today's money?",
        given: { M: M, f: f, n: n }, solveFor: "V",
        answer: WB.round(V, 2), tolerance: tolCur(V), unit: "currency"
      };
    }
  });

  EQ.push({
    id: "gdp_deflator",
    name: "GDP deflator",
    category: "Economics",
    latex: "\\text{Deflator} = \\frac{\\text{Nominal GDP}}{\\text{Real GDP}} \\times 100",
    description: "Price index linking nominal and real GDP (base year = 100).",
    variables: [
      { symbol: "D", name: "GDP deflator (index)", unit: "number", min: 0 },
      { symbol: "N", name: "Nominal GDP", unit: "currency", min: 0, default: 2400 },
      { symbol: "R", name: "Real GDP", unit: "currency", min: 0.0001, default: 2000 }
    ],
    relation: function (v) { return v.D - v.N / v.R * 100; },
    inverse: {
      D: function (v) { return v.N / v.R * 100; },
      N: function (v) { return v.D * v.R / 100; },
      R: function (v) { return v.N / v.D * 100; }
    },
    steps: function (v, sf) {
      var s = [F("\\text{Deflator} = \\frac{\\text{Nominal}}{\\text{Real}}\\times 100", "Base-year prices give a deflator of 100")];
      if (sf === "D") s.push(F("= \\frac{" + LC(v.N) + "}{" + LC(v.R) + "}\\times 100 = " + L(v.D, 4), "Substitute — prices are " + WB.fmtNum(v.D - 100, 2) + "% above the base year"));
      else if (sf === "R") s.push(F("\\text{Real} = \\frac{\\text{Nominal}}{\\text{Deflator}}\\times 100 = " + LC(v.R), "Rearrange"));
      else s.push(F("\\text{Nominal} = \\frac{\\text{Deflator}\\times\\text{Real}}{100} = " + LC(v.N), "Rearrange"));
      return s;
    },
    problemGenerator: function (rng, diff) {
      var R = rng.range(800, 5000, 100);
      var D = rng.range(105, 160, 2.5);
      var N = D * R / 100;
      return {
        prompt: "Nominal GDP is " + cur(N, 0) + " billion and real GDP is " + cur(R, 0) +
          " billion. Compute the GDP deflator (base = 100, 1 decimal).",
        given: { N: WB.round(N, 2), R: R }, solveFor: "D",
        answer: WB.round(D, 4), tolerance: 0.3, unit: "number"
      };
    }
  });

  /* ════════════════════════════════════════════════════════════════════
   * STATISTICS & PROBABILITY
   * ════════════════════════════════════════════════════════════════════ */

  EQ.push({
    id: "data_stats",
    name: "Mean, variance & standard deviation",
    category: "Statistics & probability",
    type: "list",
    latex: "\\bar{x} = \\frac{\\sum x_i}{n},\\quad s^2 = \\frac{\\sum (x_i-\\bar{x})^2}{n-1}",
    description: "Descriptive statistics from a raw data list (population and sample versions).",
    inputs: [
      { key: "data", label: "Data values", kind: "datalist", default: [12, 15, 11, 18, 14, 16, 13] }
    ],
    compute: function (inp) {
      var xs = inp.data, n = xs.length;
      if (n < 2) return { outputs: [], steps: [], error: "Enter at least two data values." };
      var mean = xs.reduce(function (a, b) { return a + b; }, 0) / n;
      var ss = xs.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0);
      var varP = ss / n, varS = ss / (n - 1);
      var steps = [
        F("\\bar{x} = \\frac{\\sum x_i}{n} = \\frac{" + L(xs.reduce(function (a, b) { return a + b; }, 0), 6) + "}{" + n + "} = " + L(mean, 6), "Mean"),
        F("\\sum (x_i - \\bar{x})^2 = " + L(ss, 6), "Sum of squared deviations"),
        F("\\sigma^2 = \\frac{" + L(ss, 6) + "}{" + n + "} = " + L(varP, 6) + ",\\quad \\sigma = " + L(Math.sqrt(varP), 6), "Population variance & SD (divide by n)"),
        F("s^2 = \\frac{" + L(ss, 6) + "}{" + (n - 1) + "} = " + L(varS, 6) + ",\\quad s = " + L(Math.sqrt(varS), 6), "Sample variance & SD (divide by n − 1)")
      ];
      return {
        outputs: [
          { label: "n", symbol: "n", value: n, unit: "count" },
          { label: "Mean", symbol: "x̄", value: WB.round(mean, 8), unit: "number" },
          { label: "Population variance σ²", symbol: "σ²", value: WB.round(varP, 8), unit: "number" },
          { label: "Population SD σ", symbol: "σ", value: WB.round(Math.sqrt(varP), 8), unit: "number" },
          { label: "Sample variance s²", symbol: "s²", value: WB.round(varS, 8), unit: "number" },
          { label: "Sample SD s", symbol: "s", value: WB.round(Math.sqrt(varS), 8), unit: "number" }
        ],
        steps: steps
      };
    },
    problemGenerator: function (rng, diff) {
      var n = rng.int(5, 8), xs = [];
      for (var i = 0; i < n; i++) xs.push(rng.int(5, 40));
      var mean = xs.reduce(function (a, b) { return a + b; }, 0) / n;
      var ss = xs.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0);
      var askSD = rng() < 0.5;
      var ans = askSD ? Math.sqrt(ss / (n - 1)) : mean;
      return {
        prompt: "Weekly demand for a part was: " + xs.join(", ") + " units. Compute the " +
          (askSD ? "SAMPLE standard deviation (divide by n − 1; 2 decimals)" : "mean") + ".",
        given: { data: xs }, solveFor: askSD ? "s" : "x̄",
        answer: WB.round(ans, 4), tolerance: 0.03, unit: "number"
      };
    }
  });

  EQ.push({
    id: "z_score",
    name: "z-score",
    category: "Statistics & probability",
    latex: "z = \\frac{x - \\mu}{\\sigma}",
    description: "How many standard deviations an observation x lies from the mean μ.",
    variables: [
      { symbol: "z", name: "z-score", unit: "number" },
      { symbol: "x", name: "Observation", unit: "number", default: 85 },
      { symbol: "u", name: "Mean μ", unit: "number", default: 70 },
      { symbol: "s", name: "Standard deviation σ", unit: "number", min: 0.000001, default: 10 }
    ],
    relation: function (v) { return v.z - (v.x - v.u) / v.s; },
    inverse: {
      z: function (v) { return (v.x - v.u) / v.s; },
      x: function (v) { return v.u + v.z * v.s; },
      u: function (v) { return v.x - v.z * v.s; },
      s: function (v) { return (v.x - v.u) / v.z; }
    },
    steps: function (v, sf) {
      var s = [F("z = \\frac{x-\\mu}{\\sigma}", "Standardise the observation")];
      if (sf === "z") s.push(F("z = \\frac{" + L(v.x) + " - " + L(v.u) + "}{" + L(v.s) + "} = \\frac{" + L(v.x - v.u, 6) + "}{" + L(v.s) + "} = " + L(v.z, 6), "Substitute and evaluate"));
      else if (sf === "x") s.push(F("x = \\mu + z\\sigma = " + L(v.u) + " + " + L(v.z, 6) + "\\times" + L(v.s) + " = " + L(v.x, 6), "Rearrange"));
      return s;
    },
    problemGenerator: function (rng, diff) {
      var u = rng.range(40, 100, 5), s = rng.range(5, 20, 2.5);
      var z = rng.range(-2.5, 2.5, 0.25);
      var x = u + z * s;
      return {
        prompt: "Test marks are normally distributed with mean " + u + " and standard deviation " + s +
          ". " + rng.pick(NAMES) + " scored " + WB.fmtNum(x, 1) + ". Compute the z-score (2 decimals).",
        given: { x: WB.round(x, 2), u: u, s: s }, solveFor: "z",
        answer: WB.round(z, 4), tolerance: 0.02, unit: "number"
      };
    }
  });

  EQ.push({
    id: "binomial_pmf",
    name: "Binomial probability P(X = k)",
    category: "Statistics & probability",
    latex: "P(X = k) = \\binom{n}{k} p^{k}(1-p)^{n-k}",
    description: "Probability of exactly k successes in n independent trials with success probability p.",
    variables: [
      { symbol: "P", name: "Probability", unit: "number", min: 0 },
      { symbol: "n", name: "Trials n", unit: "count", min: 1, default: 10 },
      { symbol: "k", name: "Successes k", unit: "count", min: 0, default: 3 },
      { symbol: "p", name: "Success probability", unit: "percent", default: 50 }
    ],
    relation: function (v) { return v.P - nCk(Math.round(v.n), Math.round(v.k)) * pow(v.p, v.k) * pow(1 - v.p, v.n - v.k); },
    inverse: {
      P: function (v) { return nCk(Math.round(v.n), Math.round(v.k)) * pow(v.p, v.k) * pow(1 - v.p, v.n - v.k); }
    },
    steps: function (v, sf) {
      var c = nCk(Math.round(v.n), Math.round(v.k));
      var s = [F("P(X=k) = \\binom{n}{k}p^k(1-p)^{n-k}", "Binomial probability mass function")];
      if (sf === "P") {
        s.push(F("\\binom{" + L(v.n) + "}{" + L(v.k) + "} = " + L(c, 6), "Number of ways to place the successes"));
        s.push(F("P = " + L(c, 6) + " \\times " + L(v.p, 6) + "^{" + L(v.k) + "} \\times " + L(1 - v.p, 6) + "^{" + L(v.n - v.k) + "} = " + L(v.P, 8), "Substitute and evaluate"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var n = rng.int(5, 15), k = rng.int(0, Math.min(n, 6));
      var p = rng.pick([10, 20, 25, 30, 40, 50, 60]);
      var ans = nCk(n, k) * pow(p / 100, k) * pow(1 - p / 100, n - k);
      return {
        prompt: "A supplier's defect rate is " + p + "%. In a batch of " + n +
          " items, what is the probability that EXACTLY " + k + " are defective? (4 decimals)",
        given: { n: n, k: k, p: p }, solveFor: "P",
        answer: WB.round(ans, 6), tolerance: 0.0015, unit: "number"
      };
    }
  });

  EQ.push({
    id: "poisson_pmf",
    name: "Poisson probability P(X = k)",
    category: "Statistics & probability",
    latex: "P(X = k) = \\frac{e^{-\\lambda}\\lambda^{k}}{k!}",
    description: "Probability of exactly k events when events arrive at average rate λ per interval.",
    variables: [
      { symbol: "P", name: "Probability", unit: "number", min: 0 },
      { symbol: "L", name: "Mean rate λ", unit: "number", min: 0.000001, default: 3 },
      { symbol: "k", name: "Events k", unit: "count", min: 0, default: 2 }
    ],
    relation: function (v) { return v.P - poissonPmf(v.L, Math.round(v.k)); },
    inverse: { P: function (v) { return poissonPmf(v.L, Math.round(v.k)); } },
    chart: "poisson",
    steps: function (v, sf) {
      var k = Math.round(v.k);
      var s = [F("P(X=k) = \\frac{e^{-\\lambda}\\lambda^k}{k!}", "Poisson probability mass function")];
      if (sf === "P") {
        s.push(F("P(X=" + k + ") = \\frac{e^{-" + L(v.L, 4) + "} \\times " + L(v.L, 4) + "^{" + k + "}}{" + k + "!} = \\frac{" + L(Math.exp(-v.L), 8) + " \\times " + L(pow(v.L, k), 6) + "}{" + L(factorial(k)) + "}", "Substitute"));
        s.push(F("P = " + L(v.P, 8), "Evaluate"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var L = rng.pick([1, 1.5, 2, 2.5, 3, 4, 5]);
      var k = rng.int(0, 6);
      var ans = poissonPmf(L, k);
      return {
        prompt: "Trucks arrive at a depot at an average of " + L +
          " per hour (Poisson). What is the probability that EXACTLY " + k + " arrive in a given hour? (4 decimals)",
        given: { L: L, k: k }, solveFor: "P",
        answer: WB.round(ans, 6), tolerance: 0.0015, unit: "number"
      };
    }
  });

  EQ.push({
    id: "poisson_cdf",
    name: "Poisson cumulative P(X ≤ k)",
    category: "Statistics & probability",
    latex: "P(X \\le k) = \\sum_{x=0}^{k} \\frac{e^{-\\lambda}\\lambda^{x}}{x!}",
    description: "Probability of at most k events at average rate λ.",
    variables: [
      { symbol: "P", name: "Cumulative probability", unit: "number", min: 0 },
      { symbol: "L", name: "Mean rate λ", unit: "number", min: 0.000001, default: 3 },
      { symbol: "k", name: "Max events k", unit: "count", min: 0, default: 2 }
    ],
    relation: function (v) { return v.P - poissonCdf(v.L, Math.round(v.k)); },
    inverse: { P: function (v) { return poissonCdf(v.L, Math.round(v.k)); } },
    chart: "poisson",
    steps: function (v, sf) {
      var k = Math.round(v.k);
      var s = [F("P(X\\le k) = \\sum_{x=0}^{k} \\frac{e^{-\\lambda}\\lambda^x}{x!}", "Sum the PMF from 0 to k")];
      if (sf === "P") {
        for (var x = 0; x <= Math.min(k, 8); x++) {
          s.push(F("P(X=" + x + ") = " + L(poissonPmf(v.L, x), 8), ""));
        }
        s.push(F("P(X\\le " + k + ") = " + L(v.P, 8), "Sum" + (k > 8 ? " (terms above x = 8 omitted from display)" : "")));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var L = rng.pick([1, 2, 2.5, 3, 4]);
      var k = rng.int(1, 5);
      var ans = poissonCdf(L, k);
      return {
        prompt: "Customer complaints arrive at " + L +
          " per day on average (Poisson). Find the probability of AT MOST " + k + " complaints tomorrow. (4 decimals)",
        given: { L: L, k: k }, solveFor: "P",
        answer: WB.round(ans, 6), tolerance: 0.0015, unit: "number"
      };
    }
  });

  EQ.push({
    id: "expected_value_table",
    name: "Expected value from a probability table",
    category: "Statistics & probability",
    type: "list",
    latex: "E(X) = \\sum x_i p_i,\\quad Var(X) = \\sum p_i(x_i - E)^2",
    description: "Mean, variance and SD of a discrete outcome/probability table. Probabilities must sum to 1.",
    inputs: [
      { key: "pairs", label: "Outcome / probability rows", kind: "pairs",
        cols: ["Outcome x", "Probability p"], default: [[100, 0.2], [50, 0.5], [-30, 0.3]] }
    ],
    compute: function (inp) {
      var rows = inp.pairs;
      var sumP = rows.reduce(function (a, r) { return a + r[1]; }, 0);
      var E = rows.reduce(function (a, r) { return a + r[0] * r[1]; }, 0);
      var V = rows.reduce(function (a, r) { return a + r[1] * (r[0] - E) * (r[0] - E); }, 0);
      var steps = [F("E(X) = \\sum x_i p_i", "Probability-weighted average")];
      rows.forEach(function (r) {
        steps.push(F(L(r[0]) + " \\times " + L(r[1], 6) + " = " + L(r[0] * r[1], 6), ""));
      });
      steps.push(F("E(X) = " + L(E, 6), Math.abs(sumP - 1) > 1e-9 ? "⚠ probabilities sum to " + WB.fmtNum(sumP, 4) + ", not 1 — results are unreliable" : "Probabilities sum to 1 ✓"));
      steps.push(F("Var(X) = \\sum p_i (x_i - E)^2 = " + L(V, 6) + ",\\quad SD = " + L(Math.sqrt(V), 6), "Spread around the expectation"));
      return {
        outputs: [
          { label: "Expected value E(X)", symbol: "E", value: WB.round(E, 8), unit: "number" },
          { label: "Variance", symbol: "Var", value: WB.round(V, 8), unit: "number" },
          { label: "Standard deviation", symbol: "SD", value: WB.round(Math.sqrt(V), 8), unit: "number" },
          { label: "Σp (check)", symbol: "Σp", value: WB.round(sumP, 8), unit: "number" }
        ],
        steps: steps,
        error: Math.abs(sumP - 1) > 0.001 ? "Probabilities sum to " + WB.fmtNum(sumP, 4) + " — they should sum to 1." : undefined
      };
    },
    problemGenerator: function (rng, diff) {
      var p1 = rng.pick([0.1, 0.2, 0.25, 0.3]);
      var p2 = rng.pick([0.3, 0.4, 0.5]);
      var p3 = WB.round(1 - p1 - p2, 4);
      var x1 = rng.range(500, 3000, 100), x2 = rng.range(0, 800, 50), x3 = -rng.range(200, 2000, 100);
      var E = x1 * p1 + x2 * p2 + x3 * p3;
      return {
        prompt: "A venture pays " + cur(x1) + " with probability " + p1 + ", " + cur(x2) +
          " with probability " + p2 + ", and loses " + cur(-x3) + " with probability " + p3 +
          ". Compute the expected value.",
        given: { pairs: [[x1, p1], [x2, p2], [x3, p3]] }, solveFor: "E",
        answer: WB.round(E, 2), tolerance: Math.max(0.51, Math.abs(E) * 0.005), unit: "currency"
      };
    }
  });

  /* ════════════════════════════════════════════════════════════════════
   * TRADER'S ANNEX — risk-management mathematics.
   * These are position-sizing and risk formulas, not trade signals.
   * ════════════════════════════════════════════════════════════════════ */

  EQ.push({
    id: "kelly_criterion",
    name: "Kelly criterion",
    category: "Trader's annex",
    latex: "f^{*} = \\frac{bp - q}{b},\\quad q = 1-p",
    description: "Bankroll fraction that maximises long-run log growth for win probability p and win/loss ratio b. Practitioners usually bet HALF Kelly.",
    variables: [
      { symbol: "f", name: "Kelly fraction", unit: "percent" },
      { symbol: "b", name: "Win/loss ratio b (payoff per unit risked)", unit: "number", min: 0.000001, default: 2 },
      { symbol: "p", name: "Win probability", unit: "percent", default: 55 }
    ],
    relation: function (v) { return v.f - (v.b * v.p - (1 - v.p)) / v.b; },
    inverse: {
      f: function (v) { return (v.b * v.p - (1 - v.p)) / v.b; },
      p: function (v) { return (v.f * v.b + 1) / (v.b + 1); },
      b: function (v) { return (1 - v.p) / (v.p - v.f); }
    },
    steps: function (v, sf) {
      var q = 1 - v.p;
      var s = [F("f^{*} = \\frac{bp-q}{b}", "Kelly fraction — q = 1 − p is the loss probability")];
      if (sf === "f") {
        s.push(F("q = 1 - " + L(v.p, 6) + " = " + L(q, 6), "Loss probability"));
        s.push(F("f^{*} = \\frac{" + L(v.b, 4) + "\\times" + L(v.p, 6) + " - " + L(q, 6) + "}{" + L(v.b, 4) + "} = \\frac{" + L(v.b * v.p - q, 6) + "}{" + L(v.b, 4) + "} = " + L(v.f, 6) + " = " + pctL(v.f), "Substitute and evaluate"));
        s.push(F("f_{1/2} = \\tfrac{1}{2}f^{*} = " + pctL(v.f / 2), "HALF-KELLY — the practical stake: ~75% of the growth at half the variance"));
        if (v.f <= 0) s.push(F("f^{*} \\le 0", "Negative edge — the correct position size is ZERO."));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var b = rng.pick([1, 1.5, 2, 2.5, 3]);
      var p = rng.range(35, 65, 1);
      var f = (b * p / 100 - (1 - p / 100)) / b * 100;
      return {
        prompt: "A trading setup wins " + p + "% of the time with an average win of " + b +
          "R for every 1R risked. Compute the full Kelly fraction (% of bankroll, 2 decimals; negative means no bet).",
        given: { b: b, p: p }, solveFor: "f",
        answer: WB.round(f, 4), tolerance: 0.06, unit: "percent"
      };
    }
  });

  EQ.push({
    id: "risk_of_ruin",
    name: "Risk of ruin",
    category: "Trader's annex",
    latex: "RoR = \\left(\\frac{1-A}{1+A}\\right)^{U}",
    description: "Classic gambler's-ruin estimate: A = edge (win prob − loss prob), U = bankroll measured in units risked per trade.",
    variables: [
      { symbol: "R", name: "Risk of ruin", unit: "percent" },
      { symbol: "A", name: "Edge per trade (p − q)", unit: "percent", min: 0.0001, default: 10 },
      { symbol: "U", name: "Bankroll units", unit: "count", min: 1, default: 20 }
    ],
    relation: function (v) { return v.R - pow((1 - v.A) / (1 + v.A), v.U); },
    inverse: {
      R: function (v) { return pow((1 - v.A) / (1 + v.A), v.U); },
      U: function (v) { return Math.log(v.R) / Math.log((1 - v.A) / (1 + v.A)); }
    },
    steps: function (v, sf) {
      var ratio = (1 - v.A) / (1 + v.A);
      var s = [F("RoR = \\left(\\tfrac{1-A}{1+A}\\right)^U", "Even-money gambler's ruin with edge A and U units of bankroll")];
      if (sf === "R") {
        s.push(F("\\frac{1-A}{1+A} = \\frac{" + L(1 - v.A, 6) + "}{" + L(1 + v.A, 6) + "} = " + L(ratio, 8), "Per-unit ruin ratio"));
        s.push(F("RoR = " + L(ratio, 8) + "^{" + L(v.U) + "} = " + L(v.R, 8) + " = " + pctL(v.R), "More units ⇒ exponentially smaller ruin probability"));
      } else if (sf === "U") {
        s.push(F("U = \\frac{\\ln(RoR)}{\\ln\\left(\\tfrac{1-A}{1+A}\\right)} = " + L(v.U, 4), "Solve with logs"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var A = rng.pick([5, 8, 10, 12, 15, 20]);
      var U = rng.pick([10, 15, 20, 25, 30]);
      var R = pow((1 - A / 100) / (1 + A / 100), U) * 100;
      return {
        prompt: "A trader has a " + A + "% edge per trade and risks 1/" + U +
          " of the account per trade (" + U + " units). Estimate the risk of ruin (%) with RoR = ((1−A)/(1+A))^U. (2 decimals)",
        given: { A: A, U: U }, solveFor: "R",
        answer: WB.round(R, 4), tolerance: Math.max(0.03, R * 0.02), unit: "percent"
      };
    }
  });

  EQ.push({
    id: "ev_per_trade",
    name: "Expected value per trade (R-multiples)",
    category: "Trader's annex",
    latex: "EV = pW - (1-p)L",
    description: "Average result per trade in R-multiples: win rate p, average win W (in R), average loss L (in R, positive number).",
    variables: [
      { symbol: "E", name: "Expected value (R per trade)", unit: "number" },
      { symbol: "p", name: "Win rate", unit: "percent", default: 40 },
      { symbol: "W", name: "Average win (R)", unit: "number", min: 0, default: 2.5 },
      { symbol: "L", name: "Average loss (R)", unit: "number", min: 0, default: 1 }
    ],
    relation: function (v) { return v.E - (v.p * v.W - (1 - v.p) * v.L); },
    inverse: {
      E: function (v) { return v.p * v.W - (1 - v.p) * v.L; },
      p: function (v) { return (v.E + v.L) / (v.W + v.L); },
      W: function (v) { return (v.E + (1 - v.p) * v.L) / v.p; }
    },
    steps: function (v, sf) {
      var s = [F("EV = pW - (1-p)L", "Probability-weighted average outcome per 1R risked")];
      if (sf === "E") {
        s.push(F("EV = " + L(v.p, 6) + "\\times" + L(v.W, 4) + " - " + L(1 - v.p, 6) + "\\times" + L(v.L, 4) + " = " + L(v.p * v.W, 6) + " - " + L((1 - v.p) * v.L, 6), "Substitute"));
        s.push(F("EV = " + L(v.E, 6) + "\\ \\text{R per trade}", v.E > 0 ? "Positive expectancy — the system makes money on average" : "Negative expectancy — no position size fixes this"));
      } else if (sf === "p") {
        s.push(F("p = \\frac{EV + L}{W + L} = " + L(v.p, 6) + " = " + pctL(v.p), "Break-even win rate when EV = 0"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var p = rng.range(30, 60, 5);
      var W = rng.pick([1.5, 2, 2.5, 3]);
      var Lx = 1;
      var E = p / 100 * W - (1 - p / 100) * Lx;
      return {
        prompt: "A system wins " + p + "% of trades. Winners average +" + W +
          "R, losers −1R. Compute the expected value per trade in R (2 decimals).",
        given: { p: p, W: W, L: Lx }, solveFor: "E",
        answer: WB.round(E, 4), tolerance: 0.02, unit: "number"
      };
    }
  });

  EQ.push({
    id: "position_size",
    name: "Fixed-fractional position size",
    category: "Trader's annex",
    latex: "N = \\frac{C \\times r}{s}",
    description: "Units to trade: account C, risk fraction r per trade, stop distance s in currency per unit.",
    variables: [
      { symbol: "N", name: "Position size (units)", unit: "count", min: 0 },
      { symbol: "C", name: "Account size", unit: "currency", min: 0, default: 100000 },
      { symbol: "r", name: "Risk per trade", unit: "percent", default: 1 },
      { symbol: "s", name: "Stop distance per unit", unit: "currency", min: 0.000001, default: 2.5 }
    ],
    relation: function (v) { return v.N - v.C * v.r / v.s; },
    inverse: {
      N: function (v) { return v.C * v.r / v.s; },
      C: function (v) { return v.N * v.s / v.r; },
      r: function (v) { return v.N * v.s / v.C; },
      s: function (v) { return v.C * v.r / v.N; }
    },
    steps: function (v, sf) {
      var risk = v.C * v.r;
      var s = [F("N = \\frac{C\\,r}{s}", "Money at risk divided by risk per unit")];
      if (sf === "N") {
        s.push(F("C\\,r = " + LC(v.C) + " \\times " + L(v.r, 6) + " = " + LC(risk), "Money at risk this trade"));
        s.push(F("N = \\frac{" + LC(risk) + "}{" + LC(v.s, 2) + "} = " + L(v.N, 4) + "\\ \\text{units}", "Round DOWN to stay within the risk budget"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var C = rng.range(20000, 500000, 5000);
      var r = rng.pick([0.5, 1, 1.5, 2]);
      var entry = rng.range(50, 400, 5);
      var stop = WB.round(entry * rng.range(0.02, 0.08, 0.005), 2);
      var N = C * r / 100 / stop;
      return {
        prompt: "Account " + cur(C) + ", risking " + r + "% per trade. Entry at " + cur(entry, 2) +
          " with a stop " + cur(stop, 2) + " below entry. How many units may be bought? (nearest whole unit)",
        given: { C: C, r: r, s: stop }, solveFor: "N",
        answer: WB.round(N, 2), tolerance: Math.max(1, N * 0.01), unit: "count"
      };
    }
  });

  EQ.push({
    id: "cagr",
    name: "CAGR",
    category: "Trader's annex",
    latex: "CAGR = \\left(\\frac{V_{end}}{V_{begin}}\\right)^{1/n} - 1",
    description: "Compound annual growth rate between a beginning and ending value over n years.",
    variables: [
      { symbol: "g", name: "CAGR", unit: "percent" },
      { symbol: "B", name: "Beginning value", unit: "currency", min: 0.000001, default: 1000 },
      { symbol: "E", name: "Ending value", unit: "currency", min: 0, default: 2000 },
      { symbol: "n", name: "Years", unit: "years", min: 0.000001, default: 5 }
    ],
    relation: function (v) { return v.E - v.B * pow(1 + v.g, v.n); },
    inverse: {
      g: function (v) { return pow(v.E / v.B, 1 / v.n) - 1; },
      E: function (v) { return v.B * pow(1 + v.g, v.n); },
      B: function (v) { return v.E / pow(1 + v.g, v.n); },
      n: function (v) { return Math.log(v.E / v.B) / Math.log(1 + v.g); }
    },
    steps: function (v, sf) {
      var s = [F("CAGR = \\left(\\tfrac{V_{end}}{V_{begin}}\\right)^{1/n} - 1", "The constant rate that turns the beginning value into the ending value")];
      if (sf === "g") {
        s.push(F("\\frac{V_{end}}{V_{begin}} = \\frac{" + LC(v.E) + "}{" + LC(v.B) + "} = " + L(v.E / v.B, 8), "Total growth factor"));
        s.push(F("CAGR = " + L(v.E / v.B, 8) + "^{1/" + L(v.n) + "} - 1 = " + L(v.g, 8) + " = " + pctL(v.g), "Take the n-th root"));
      } else if (sf === "n") {
        s.push(F("n = \\frac{\\ln(E/B)}{\\ln(1+g)} = " + L(v.n, 6) + "\\ \\text{years}", "Solve with logs"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var B = rng.range(10000, 200000, 5000);
      var g = rng.range(4, 25, 0.5);
      var n = rng.int(2, 12);
      var E = B * pow(1 + g / 100, n);
      return {
        prompt: "An account grew from " + cur(B) + " to " + cur(E, 2) + " over " + n +
          " years. Compute the CAGR (%, 2 decimals).",
        given: { B: B, E: WB.round(E, 2), n: n }, solveFor: "g",
        answer: WB.round(g, 4), tolerance: 0.04, unit: "percent"
      };
    }
  });

  EQ.push({
    id: "drawdown_recovery",
    name: "Drawdown recovery",
    category: "Trader's annex",
    latex: "g_{req} = \\frac{d}{1 - d}",
    description: "The gain required to recover from a drawdown of d. A 50% loss needs a 100% gain.",
    variables: [
      { symbol: "g", name: "Required gain", unit: "percent", min: 0 },
      { symbol: "d", name: "Drawdown", unit: "percent", min: 0, default: 20 }
    ],
    relation: function (v) { return v.g - v.d / (1 - v.d); },
    inverse: {
      g: function (v) { return v.d / (1 - v.d); },
      d: function (v) { return v.g / (1 + v.g); }
    },
    steps: function (v, sf) {
      var s = [F("(1-d)(1+g) = 1 \\ \\Rightarrow\\ g = \\frac{d}{1-d}", "After losing d, the remaining capital must grow back to 1")];
      if (sf === "g") s.push(F("g = \\frac{" + L(v.d, 6) + "}{1-" + L(v.d, 6) + "} = \\frac{" + L(v.d, 6) + "}{" + L(1 - v.d, 6) + "} = " + L(v.g, 6) + " = " + pctL(v.g), "Recovery is nonlinear — big drawdowns are brutally expensive"));
      else s.push(F("d = \\frac{g}{1+g} = " + L(v.d, 6) + " = " + pctL(v.d), "Rearrange"));
      return s;
    },
    problemGenerator: function (rng, diff) {
      var d = rng.pick([10, 15, 20, 25, 30, 40, 50, 60]);
      var g = d / (100 - d) * 100;
      return {
        prompt: "An account is down " + d + "% from its peak. What percentage gain is required just to get back to break-even? (2 decimals)",
        given: { d: d }, solveFor: "g",
        answer: WB.round(g, 4), tolerance: 0.06, unit: "percent"
      };
    }
  });

  EQ.push({
    id: "rule_of_72",
    name: "Rule of 72",
    category: "Trader's annex",
    latex: "n_{double} \\approx \\frac{72}{i_{\\%}}",
    description: "Quick estimate of the years needed to double money at i% per year.",
    variables: [
      { symbol: "n", name: "Years to double", unit: "years", min: 0.000001 },
      { symbol: "i", name: "Annual rate", unit: "percent", min: 0.0001, default: 9 }
    ],
    relation: function (v) { return v.n - 0.72 / v.i; },
    inverse: {
      n: function (v) { return 0.72 / v.i; },
      i: function (v) { return 0.72 / v.n; }
    },
    steps: function (v, sf) {
      var exact = Math.log(2) / Math.log(1 + v.i);
      var s = [F("n \\approx \\frac{72}{i_{\\%}}", "Approximation of n = ln 2 / ln(1+i)")];
      if (sf === "n") {
        s.push(F("n \\approx \\frac{72}{" + L(v.i * 100, 4) + "} = " + L(v.n, 4) + "\\ \\text{years}", "Substitute the rate as a percentage"));
        s.push(F("n_{exact} = \\frac{\\ln 2}{\\ln(1+" + L(v.i, 6) + ")} = " + L(exact, 4), "Exact doubling time, for comparison"));
      } else {
        s.push(F("i \\approx \\frac{72}{" + L(v.n, 4) + "} = " + L(v.i * 100, 4) + "\\%", "Rearrange"));
      }
      return s;
    },
    problemGenerator: function (rng, diff) {
      var i = rng.pick([4, 6, 8, 9, 12, 18, 24]);
      return {
        prompt: "Using the Rule of 72, roughly how many years does money take to double at " + i + "% per year?",
        given: { i: i }, solveFor: "n",
        answer: WB.round(72 / i, 4), tolerance: 0.06, unit: "years"
      };
    }
  });

  /* ---------- registry assembly + custom equations ---------- */
  WB.EQUATIONS = EQ;

  WB.CATEGORIES = (function () {
    var seen = {}, order = [];
    EQ.forEach(function (e) {
      if (!seen[e.category]) { seen[e.category] = true; order.push(e.category); }
    });
    return order;
  })();

  WB.getEquation = function (id) {
    for (var i = 0; i < WB.EQUATIONS.length; i++)
      if (WB.EQUATIONS[i].id === id) return WB.EQUATIONS[i];
    return null;
  };

  /* Compile a user-supplied relation expression like "A - P*(1+i)**n"
   * into a relation(v) function. Symbols resolve against v. */
  WB.compileRelation = function (expr, symbols) {
    if (/[;{}]|function|=>|while|for|new |this|window|document|localStorage|eval|Function/i.test(expr))
      throw new Error("Relation may only be a plain math expression.");
    var args = symbols.join(",");
    /* eslint-disable no-new-func */
    var fn = new Function("v", "Math", "var " + symbols.map(function (s) {
      return s + " = v." + s;
    }).join(", ") + "; return (" + expr + ");");
    return function (v) { return fn(v, Math); };
  };

  WB.loadCustomEquations = function () {
    var customs = WB.load("wb_custom_eqs", []);
    customs.forEach(function (c) {
      if (WB.getEquation(c.id)) return;
      try {
        var syms = c.variables.map(function (m) { return m.symbol; });
        var eq = {
          id: c.id, name: c.name, category: c.category || "Custom",
          latex: c.latex, description: c.description || "",
          variables: c.variables, custom: true, relationSrc: c.relationSrc,
          relation: WB.compileRelation(c.relationSrc, syms)
        };
        WB.EQUATIONS.push(eq);
        if (WB.CATEGORIES.indexOf(eq.category) < 0) WB.CATEGORIES.push(eq.category);
      } catch (e) { /* skip corrupt custom equation */ }
    });
  };
})();
