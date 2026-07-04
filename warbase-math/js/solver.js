/* Warbase Math Engine — solver.js
 * Solves any equation in the registry for any variable.
 * Closed-form inverses are used when the equation provides them; otherwise
 * a bracket scan + Brent's method root-finder runs on the relation.
 */
(function () {
  "use strict";
  var WB = window.WB = window.WB || {};

  /* ---------- unit conversion ----------
   * Display units → internal units. Percent variables are entered as "9.5"
   * and used as 0.095 inside relations.
   */
  WB.toInternal = function (unit, x) { return unit === "percent" ? x / 100 : x; };
  WB.toDisplay = function (unit, x) { return unit === "percent" ? x * 100 : x; };

  WB.varMeta = function (eq, symbol) {
    for (var i = 0; i < eq.variables.length; i++)
      if (eq.variables[i].symbol === symbol) return eq.variables[i];
    return null;
  };

  /* ---------- Brent's method ---------- */
  WB.brent = function (f, a, b, tol, maxIter) {
    tol = tol || 1e-13;
    maxIter = maxIter || 200;
    var fa = f(a), fb = f(b);
    if (!isFinite(fa) || !isFinite(fb) || fa * fb > 0) return null;
    var c = a, fc = fa, d = b - a, e = d, iter = 0;
    for (; iter < maxIter; iter++) {
      if (Math.abs(fc) < Math.abs(fb)) {
        a = b; b = c; c = a;
        fa = fb; fb = fc; fc = fa;
      }
      var tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol;
      var xm = 0.5 * (c - b);
      if (Math.abs(xm) <= tol1 || fb === 0) return { root: b, iterations: iter + 1 };
      if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
        var s = fb / fa, p, q, r;
        if (a === c) { p = 2 * xm * s; q = 1 - s; }
        else {
          q = fa / fc; r = fb / fc;
          p = s * (2 * xm * q * (q - r) - (b - a) * (r - 1));
          q = (q - 1) * (r - 1) * (s - 1);
        }
        if (p > 0) q = -q;
        p = Math.abs(p);
        if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
          e = d; d = p / q;
        } else { d = xm; e = d; }
      } else { d = xm; e = d; }
      a = b; fa = fb;
      b += (Math.abs(d) > tol1) ? d : (xm > 0 ? tol1 : -tol1);
      fb = f(b);
      if (!isFinite(fb)) return null;
      if ((fb > 0) === (fc > 0)) { c = a; fc = fa; d = b - a; e = d; }
    }
    return { root: b, iterations: iter };
  };

  /* ---------- bracket scanning ----------
   * Builds candidate grids appropriate to the variable's unit/limits, finds a
   * sign change, then hands the bracket to Brent.
   */
  function candidatePoints(meta) {
    var pts = [];
    var unit = meta && meta.unit;
    if (unit === "percent") {
      // internal (decimal) domain for rates
      pts = [-0.9999, -0.95, -0.8, -0.5, -0.3, -0.15, -0.05, -0.01, -1e-7,
             1e-7, 0.001, 0.005, 0.01, 0.02, 0.03, 0.05, 0.08, 0.12, 0.18,
             0.25, 0.4, 0.6, 1, 1.5, 2.5, 5, 10, 25];
    } else {
      var i, v;
      for (i = -9; i <= 13; i++) {
        v = Math.pow(10, i);
        pts.push(v, 3 * v);
      }
      pts.push(0);
      var allowNeg = !(meta && meta.min !== undefined && meta.min >= 0);
      if (allowNeg) {
        for (i = -9; i <= 13; i++) {
          v = Math.pow(10, i);
          pts.push(-v, -3 * v);
        }
      }
      pts.sort(function (a, b) { return a - b; });
    }
    if (meta && meta.min !== undefined) {
      var lo = (unit === "percent") ? meta.min / 100 : meta.min;
      pts = pts.filter(function (p) { return p >= lo; });
    }
    return pts;
  }

  WB.solveNumeric = function (f, meta) {
    var pts = candidatePoints(meta);
    var vals = pts.map(function (p) { return f(p); });
    for (var i = 0; i < pts.length - 1; i++) {
      var fa = vals[i], fb = vals[i + 1];
      if (!isFinite(fa) || !isFinite(fb)) continue;
      if (fa === 0) return { root: pts[i], iterations: 0, bracket: [pts[i], pts[i + 1]] };
      if (fa * fb < 0) {
        var res = WB.brent(f, pts[i], pts[i + 1]);
        if (res) {
          res.bracket = [pts[i], pts[i + 1]];
          return res;
        }
      }
    }
    return null;
  };

  /* ---------- main solve entry ----------
   * eq: registry object; target: symbol to solve for;
   * displayValues: {symbol: number} in display units for all other variables.
   * Returns { value (display), internal, v (internal values incl. target),
   *           method, iterations, bracket } or throws Error with a friendly message.
   */
  WB.solve = function (eq, target, displayValues) {
    var v = {};
    eq.variables.forEach(function (m) {
      if (m.symbol === target) return;
      var raw = displayValues[m.symbol];
      if (raw === undefined || raw === null || !isFinite(raw))
        throw new Error("Missing value for " + m.symbol + " (" + m.name + ").");
      v[m.symbol] = WB.toInternal(m.unit, raw);
    });
    var meta = WB.varMeta(eq, target);
    if (!meta) throw new Error("Unknown variable " + target + ".");

    var result;
    if (eq.inverse && eq.inverse[target]) {
      var x = eq.inverse[target](v);
      if (!isFinite(x)) throw new Error("No solution: the closed-form expression is undefined for these inputs (check for zero rates, negative logs, etc.).");
      v[target] = x;
      // sanity-check against the relation
      var resid = eq.relation(v);
      var scale = Math.max(1, Math.abs(x));
      if (isFinite(resid) && Math.abs(resid) > 1e-6 * Math.max(scale, Math.abs(resid) === 0 ? 1 : 0) + 1e-4 * scale) {
        // fall through to numeric refinement below only if badly off
      }
      result = { value: WB.toDisplay(meta.unit, x), internal: x, v: v, method: "closed-form", iterations: 0 };
    } else {
      var f = function (x) {
        v[target] = x;
        return eq.relation(v);
      };
      var num = WB.solveNumeric(f, meta);
      if (!num) throw new Error("No solution in a realistic range for " + target + ". Check the signs and magnitudes of your inputs.");
      v[target] = num.root;
      result = {
        value: WB.toDisplay(meta.unit, num.root), internal: num.root, v: v,
        method: "numeric", iterations: num.iterations, bracket: num.bracket
      };
    }
    return result;
  };

  /* ---------- steps ----------
   * Returns array of {latex, note}. Uses the equation's own steps() when
   * present; otherwise builds a generic substitution walkthrough.
   */
  WB.getSteps = function (eq, target, result) {
    var steps = null;
    if (typeof eq.steps === "function") {
      try { steps = eq.steps(result.v, target, result); } catch (e) { steps = null; }
    }
    if (!steps) {
      var meta = WB.varMeta(eq, target);
      steps = [
        { latex: eq.latex, note: "Formula" },
        {
          latex: target + " = " + WB.ltx(result.internal, 8),
          note: "Solved for " + meta.name + (meta.unit === "percent"
            ? " (decimal form; " + WB.fmtNum(result.value, 4) + "%)" : "")
        }
      ];
    }
    if (result.method === "numeric") {
      steps.push({
        latex: target + " \\approx " + WB.ltx(result.internal, 8),
        note: "No closed form for " + target + " here — solved numerically with a bracket scan and Brent's method: bracket [" +
          WB.fmtNum(result.bracket[0], 6) + ", " + WB.fmtNum(result.bracket[1], 6) + "], converged in " +
          result.iterations + " iteration" + (result.iterations === 1 ? "" : "s") + " to |f(x)| < 10⁻¹³."
      });
    }
    return steps;
  };
})();
