/* Warbase Math Engine — charts.js
 * Chart.js visuals, rendered only where they earn their place.
 * Each renderer receives the container element plus solved internal values.
 */
(function () {
  "use strict";
  var WB = window.WB = window.WB || {};
  var live = [];

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function palette() {
    return {
      ink: cssVar("--ink") || "#e6ddc9",
      dim: cssVar("--ink-dim") || "#9c937f",
      faint: cssVar("--ink-faint") || "#675f50",
      rule: cssVar("--rule") || "#2b2620",
      accent: cssVar("--accent-ink") || "#d8564a",
      bone: cssVar("--ink") || "#e6ddc9"
    };
  }

  WB.destroyCharts = function () {
    live.forEach(function (c) { try { c.destroy(); } catch (e) { } });
    live = [];
  };

  function shell(container, title) {
    var wrap = document.createElement("div");
    wrap.className = "chartwrap";
    var h = document.createElement("h4");
    h.textContent = title;
    var cv = document.createElement("canvas");
    cv.height = 260;
    wrap.appendChild(h);
    wrap.appendChild(cv);
    container.appendChild(wrap);
    return cv;
  }

  function baseOpts(p, xTitle, yTitle, yCurrency) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { labels: { color: p.dim, boxWidth: 14, font: { size: 11 } } },
        tooltip: {
          callbacks: yCurrency ? {
            label: function (ctx) {
              return ctx.dataset.label + ": " + WB.fmtCurrency(ctx.parsed.y);
            }
          } : {}
        }
      },
      scales: {
        x: {
          title: { display: !!xTitle, text: xTitle, color: p.faint, font: { size: 11 } },
          ticks: { color: p.faint, maxTicksLimit: 13, font: { size: 10.5 } },
          grid: { color: p.rule }
        },
        y: {
          title: { display: !!yTitle, text: yTitle, color: p.faint, font: { size: 11 } },
          ticks: {
            color: p.faint, font: { size: 10.5 },
            callback: function (v) { return yCurrency ? WB.fmtCurrency(v, 0) : WB.fmtNum(v, 2); }
          },
          grid: { color: p.rule }
        }
      }
    };
  }
  function mount(cv, cfg) {
    cv.parentElement.style.height = "300px";
    var ch = new Chart(cv.getContext("2d"), cfg);
    live.push(ch);
    return ch;
  }

  /* ---------- single-sum growth: value vs flat principal ---------- */
  function renderGrowth(container, eq, v) {
    var p = palette();
    var years = Math.max(v.n || 1, 0.5);
    var pts = 60;
    var labels = [], value = [], principal = [];
    for (var k = 0; k <= pts; k++) {
      var t = years * k / pts;
      labels.push(WB.fmtNum(t, 1));
      principal.push(v.P);
      if (eq.id === "simple_interest") value.push(v.P * (1 + v.i * t));
      else if (eq.id === "continuous_compound") value.push(v.P * Math.exp(v.i * t));
      else value.push(v.P * Math.pow(1 + v.i / v.m, v.m * t));
    }
    var cv = shell(container, "Growth of " + WB.fmtCurrency(v.P) + " over " + WB.fmtNum(years, 1) + " years");
    mount(cv, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          { label: "Value", data: value, borderColor: p.accent, backgroundColor: "transparent", pointRadius: 0, borderWidth: 2 },
          { label: "Principal", data: principal, borderColor: p.faint, borderDash: [5, 4], backgroundColor: "transparent", pointRadius: 0, borderWidth: 1.5 }
        ]
      },
      options: baseOpts(p, "Years", "", true)
    });
  }

  /* ---------- annuity: accumulated value vs total contributions ---------- */
  function renderAnnuityGrowth(container, eq, v) {
    var p = palette();
    var n = Math.min(Math.round(v.n), 600);
    var due = eq.id === "fv_annuity_due";
    var labels = [], value = [], contrib = [];
    var acc = 0;
    for (var k = 1; k <= n; k++) {
      acc = acc * (1 + v.i) + v.R * (due ? (1 + v.i) : 1);
      labels.push(k);
      value.push(acc);
      contrib.push(v.R * k);
    }
    var cv = shell(container, "Fund value vs total contributions");
    mount(cv, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          { label: "Fund value", data: value, borderColor: p.accent, backgroundColor: "transparent", pointRadius: 0, borderWidth: 2 },
          { label: "Contributions", data: contrib, borderColor: p.faint, borderDash: [5, 4], backgroundColor: "transparent", pointRadius: 0, borderWidth: 1.5 }
        ]
      },
      options: baseOpts(p, "Payment number", "", true)
    });
  }

  /* ---------- amortization: schedule table + principal/interest split ---------- */
  function renderAmortization(container, eq, v) {
    var p = palette();
    var P = v.P, i = v.i, R = v.R;
    if (R === undefined) R = P * i / (1 - Math.pow(1 + i, -v.n));
    var maxN = v.n !== undefined ? Math.round(v.n) : 1200;
    var bal = P, rows = [], guard = 0;
    while (bal > 0.005 && guard < Math.min(maxN, 1200)) {
      guard++;
      var interest = bal * i;
      var princ = Math.min(R - interest, bal);
      if (princ <= 0) break; // payment does not cover interest
      bal -= princ;
      rows.push({ k: guard, pmt: princ + interest, interest: interest, principal: princ, balance: Math.max(bal, 0) });
    }
    if (!rows.length) {
      var warn = document.createElement("p");
      warn.className = "msg-bad";
      warn.textContent = "The payment does not cover the interest — the balance never falls.";
      container.appendChild(warn);
      return;
    }
    // chart: aggregate to at most 120 bars
    var stride = Math.ceil(rows.length / 120);
    var labels = [], ints = [], prins = [], bals = [];
    for (var s = 0; s < rows.length; s += stride) {
      var chunk = rows.slice(s, s + stride);
      labels.push(chunk[chunk.length - 1].k);
      ints.push(chunk.reduce(function (a, r) { return a + r.interest; }, 0));
      prins.push(chunk.reduce(function (a, r) { return a + r.principal; }, 0));
      bals.push(chunk[chunk.length - 1].balance);
    }
    var cv = shell(container, "Amortisation — principal vs interest per payment" + (stride > 1 ? " (grouped ×" + stride + ")" : ""));
    mount(cv, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          { label: "Interest", data: ints, backgroundColor: p.accent, stack: "s" },
          { label: "Principal", data: prins, backgroundColor: p.faint, stack: "s" },
          { label: "Balance", data: bals, type: "line", borderColor: p.ink, backgroundColor: "transparent", pointRadius: 0, borderWidth: 1.5, yAxisID: "y2" }
        ]
      },
      options: (function () {
        var o = baseOpts(p, "Payment number", "Per payment", true);
        o.scales.x.stacked = true;
        o.scales.y.stacked = true;
        o.scales.y2 = {
          position: "right",
          ticks: { color: p.faint, font: { size: 10.5 }, callback: function (val) { return WB.fmtCurrency(val, 0); } },
          grid: { drawOnChartArea: false }
        };
        return o;
      })()
    });

    // full schedule table
    var totI = rows.reduce(function (a, r) { return a + r.interest; }, 0);
    var scroll = document.createElement("div");
    scroll.className = "amort-scroll";
    var html = "<table class='amort'><thead><tr><th>#</th><th>Payment</th><th>Interest</th><th>Principal</th><th>Balance</th></tr></thead><tbody>";
    rows.forEach(function (r) {
      html += "<tr><td>" + r.k + "</td><td>" + WB.esc(WB.fmtCurrency(r.pmt)) + "</td><td>" +
        WB.esc(WB.fmtCurrency(r.interest)) + "</td><td>" + WB.esc(WB.fmtCurrency(r.principal)) +
        "</td><td>" + WB.esc(WB.fmtCurrency(r.balance)) + "</td></tr>";
    });
    html += "</tbody></table>";
    scroll.innerHTML = html;
    var cap = document.createElement("p");
    cap.className = "viewsub";
    cap.style.marginTop = "10px";
    cap.textContent = "Full schedule — " + rows.length + " payments, total interest " + WB.fmtCurrency(totI) + ".";
    container.appendChild(cap);
    container.appendChild(scroll);
  }

  /* ---------- NPV profile vs discount rate ---------- */
  function renderNpvProfile(container, eq, inputs) {
    var p = palette();
    var cfs = inputs.cashflows;
    var irrRes = WB.irrOf(cfs);
    var irr = irrRes ? irrRes.root : null;
    var maxR = Math.max(0.3, irr !== null ? irr * 2 : 0.3);
    maxR = Math.min(maxR, 2);
    var labels = [], data = [];
    var steps = 60;
    for (var k = 0; k <= steps; k++) {
      var r = maxR * k / steps;
      labels.push(WB.fmtNum(r * 100, 1) + "%");
      data.push(WB.npvOf(r, cfs));
    }
    var title = "NPV profile" + (irr !== null ? " — crosses zero at IRR ≈ " + WB.fmtNum(irr * 100, 2) + "%" : " (no IRR found)");
    var cv = shell(container, title);
    mount(cv, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{ label: "NPV", data: data, borderColor: p.accent, backgroundColor: "transparent", pointRadius: 0, borderWidth: 2 }]
      },
      options: (function () {
        var o = baseOpts(p, "Discount rate", "NPV", true);
        o.plugins.legend.display = false;
        return o;
      })()
    });
  }

  /* ---------- Poisson distribution bars ---------- */
  function renderPoisson(container, eq, v) {
    var p = palette();
    var lam = v.L, kSel = Math.round(v.k);
    var kMax = Math.min(Math.max(Math.ceil(lam + 4 * Math.sqrt(lam)), kSel + 2), 60);
    var labels = [], data = [], colors = [];
    var cdfMode = eq.id === "poisson_cdf";
    for (var x = 0; x <= kMax; x++) {
      labels.push(x);
      data.push(WB.poissonPmf(lam, x));
      var hi = cdfMode ? (x <= kSel) : (x === kSel);
      colors.push(hi ? p.accent : p.faint);
    }
    var cv = shell(container, "Poisson distribution, λ = " + WB.fmtNum(lam, 2) +
      (cdfMode ? " — shaded bars sum to P(X ≤ " + kSel + ")" : " — highlighted bar is P(X = " + kSel + ")"));
    mount(cv, {
      type: "bar",
      data: { labels: labels, datasets: [{ label: "P(X = k)", data: data, backgroundColor: colors }] },
      options: (function () {
        var o = baseOpts(p, "k", "Probability", false);
        o.plugins.legend.display = false;
        o.scales.y.ticks.callback = function (val) { return WB.fmtNum(val, 3); };
        return o;
      })()
    });
  }

  /* ---------- dispatcher ---------- */
  /* For relation equations: payload = solved internal values.
   * For list equations: payload = the raw inputs object. */
  WB.renderChart = function (container, eq, payload) {
    if (typeof Chart === "undefined" || !eq.chart) return;
    try {
      switch (eq.chart) {
        case "growth": renderGrowth(container, eq, payload); break;
        case "annuity_growth": renderAnnuityGrowth(container, eq, payload); break;
        case "amortization": renderAmortization(container, eq, payload); break;
        case "npv_profile": renderNpvProfile(container, eq, payload); break;
        case "poisson": renderPoisson(container, eq, payload); break;
      }
    } catch (e) { /* charts must never break solving */ }
  };
})();
