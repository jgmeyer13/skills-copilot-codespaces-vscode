/* Warbase Math Engine — util.js
 * Formatting, rounding, RNG, storage, Roman numerals. No dependencies.
 */
(function () {
  "use strict";
  var WB = window.WB = window.WB || {};

  /* ---------- settings ---------- */
  var DEFAULT_SETTINGS = {
    theme: "dark",
    currency: "R",
    decimals: 2,
    roman: false
  };

  WB.getSettings = function () {
    try {
      var s = JSON.parse(localStorage.getItem("wb_settings") || "{}");
      var out = {};
      for (var k in DEFAULT_SETTINGS) out[k] = (k in s) ? s[k] : DEFAULT_SETTINGS[k];
      return out;
    } catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
  };
  WB.saveSettings = function (s) {
    localStorage.setItem("wb_settings", JSON.stringify(s));
  };

  /* ---------- rounding (kill floating point artifacts) ---------- */
  WB.round = function (x, dp) {
    if (!isFinite(x)) return x;
    if (dp === undefined) dp = 10;
    var f = Math.pow(10, dp);
    // toPrecision pass removes 0.30000000000000004-style noise before rounding
    var clean = parseFloat(Number(x).toPrecision(13));
    return Math.round((clean + (clean >= 0 ? 1 : -1) * Number.EPSILON * Math.abs(clean)) * f) / f;
  };

  /* ---------- number formatting (en-ZA) ---------- */
  var nfCache = {};
  function nf(dp) {
    var key = "d" + dp;
    if (!nfCache[key]) {
      nfCache[key] = new Intl.NumberFormat("en-ZA", {
        minimumFractionDigits: dp, maximumFractionDigits: dp
      });
    }
    return nfCache[key];
  }

  /* Format a plain number to dp decimals (default: settings.decimals). */
  WB.fmtNum = function (x, dp) {
    if (x === null || x === undefined || !isFinite(x)) return "—";
    if (dp === undefined) dp = WB.getSettings().decimals;
    return nf(dp).format(WB.round(x, dp));
  };

  /* Format according to a variable unit. */
  WB.fmtUnit = function (x, unit, dp) {
    var s = WB.getSettings();
    if (dp === undefined) dp = s.decimals;
    if (x === null || x === undefined || !isFinite(x)) return "—";
    switch (unit) {
      case "currency": return WB.fmtCurrency(x, dp);
      case "percent": return WB.fmtNum(x, Math.max(dp, 2)) + "%";
      case "years": return WB.fmtNum(x, Math.min(dp, 4)) + " yr";
      case "count": {
        var r = WB.round(x, 4);
        return Number.isInteger(r) ? nf(0).format(r) : WB.fmtNum(x, 4);
      }
      default: return WB.fmtNum(x, dp);
    }
  };

  WB.fmtCurrency = function (x, dp) {
    var s = WB.getSettings();
    if (dp === undefined) dp = s.decimals;
    var body = s.currency + nf(dp).format(Math.abs(WB.round(x, dp)));
    return (x < 0 ? "−" : "") + body;
  };

  /* Currency as HTML — honours the Roman numeral easter egg. */
  WB.fmtCurrencyHTML = function (x, dp) {
    var s = WB.getSettings();
    var plain = WB.fmtCurrency(x, dp);
    if (!s.roman) return WB.esc(plain);
    var n = Math.round(Math.abs(x));
    var rom = WB.toRoman(n);
    if (!rom) return WB.esc(plain);
    return WB.esc(plain) + ' <span class="roman-eq" title="' + n + '">' +
      (x < 0 ? "−" : "") + s.currency + " " + rom + "</span>";
  };

  /* Roman numerals with vinculum notation: an overline multiplies by 1 000. */
  var ROM = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
             [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  function romanBase(n) {
    var out = "";
    for (var i = 0; i < ROM.length; i++) {
      while (n >= ROM[i][0]) { out += ROM[i][1]; n -= ROM[i][0]; }
    }
    return out;
  }
  /* Returns an HTML string, or null if out of representable range. */
  WB.toRoman = function (n) {
    n = Math.round(Math.abs(n));
    if (n === 0) return "N"; // medieval "nulla"
    if (n >= 4000000) return null;
    if (n < 4000) return WB.esc(romanBase(n));
    var thousands = Math.floor(n / 1000), rest = n % 1000;
    return '<span class="vinculum">' + WB.esc(romanBase(thousands)) + "</span>" +
      (rest ? WB.esc(romanBase(rest)) : "");
  };

  /* ---------- input parsing ---------- */
  /* Accepts "1 234,56", "1234.56", "12,5", "R 500". Returns NaN when invalid. */
  WB.parseNum = function (str) {
    if (typeof str === "number") return str;
    if (str === null || str === undefined) return NaN;
    var t = String(str).trim().replace(/[R$€£ \s]/g, "");
    if (!t) return NaN;
    if (t.indexOf(",") >= 0 && t.indexOf(".") < 0) t = t.replace(",", ".");
    else t = t.replace(/,/g, "");
    var x = Number(t);
    return isFinite(x) ? x : NaN;
  };

  /* ---------- escaping ---------- */
  WB.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  /* ---------- seeded RNG (mulberry32) ---------- */
  WB.makeRng = function (seed) {
    if (seed === undefined) seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    var a = seed >>> 0;
    var rng = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.int = function (lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); };
    rng.pick = function (arr) { return arr[Math.floor(rng() * arr.length)]; };
    rng.range = function (lo, hi, step) {
      if (!step) return lo + rng() * (hi - lo);
      var steps = Math.floor((hi - lo) / step);
      return WB.round(lo + rng.int(0, steps) * step, 10);
    };
    return rng;
  };

  /* ---------- generic storage helpers ---------- */
  WB.load = function (key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  };
  WB.save = function (key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  };

  /* ---------- stats store (weak-spot engine) ---------- */
  WB.getStats = function () { return WB.load("wb_stats", {}); };
  WB.recordAttempt = function (category, correct) {
    var st = WB.getStats();
    if (!st[category]) st[category] = { attempts: 0, correct: 0 };
    st[category].attempts += 1;
    if (correct) st[category].correct += 1;
    WB.save("wb_stats", st);
  };
  WB.categoryAccuracy = function (category) {
    var st = WB.getStats();
    var s = st[category];
    if (!s || !s.attempts) return null;
    return s.correct / s.attempts;
  };
  /* Draw weight: lower accuracy → higher probability. Unseen categories sit mid-pack. */
  WB.categoryWeight = function (category) {
    var acc = WB.categoryAccuracy(category);
    if (acc === null) acc = 0.5;
    return 1 / (acc + 0.15);
  };

  /* ---------- KaTeX helper ---------- */
  WB.katex = function (el, latex, displayMode) {
    try {
      katex.render(latex, el, { displayMode: !!displayMode, throwOnError: false });
    } catch (e) {
      el.textContent = latex;
    }
  };
  WB.katexHTML = function (latex, displayMode) {
    try {
      return katex.renderToString(latex, { displayMode: !!displayMode, throwOnError: false });
    } catch (e) {
      return WB.esc(latex);
    }
  };

  /* Format a number for use inside LaTeX (no HTML, thin-space groups). */
  WB.ltx = function (x, dp) {
    if (dp === undefined) dp = 6;
    var r = WB.round(x, dp);
    var s = String(r);
    if (Math.abs(r) >= 10000 && Number.isInteger(r)) {
      s = r.toLocaleString("en-US").replace(/,/g, "\\,");
    }
    return s;
  };
  /* Currency amount inside LaTeX. */
  WB.ltxCur = function (x, dp) {
    var s = WB.getSettings();
    if (dp === undefined) dp = s.decimals;
    var r = WB.round(Math.abs(x), dp);
    var body = r.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })
      .replace(/,/g, "\\,");
    return (x < 0 ? "-" : "") + "\\text{" + s.currency + "}" + body;
  };
})();
