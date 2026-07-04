/* Warbase Math Engine — app.js
 * Views, routing, practice & exam engines, add-equation UI, settings.
 */
(function () {
  "use strict";
  var WB = window.WB;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var content, currentView = "library";
  var practiceState = null;
  var examState = null;
  var examTimerId = null;

  /* ══════════════════ routing ══════════════════ */
  var NAV = [
    ["library", "Library"],
    ["solver", "Solver"],
    ["practice", "Practice"],
    ["exam", "Exam"],
    ["sheet", "Formula sheet"],
    ["add", "Add equation"],
    ["settings", "Settings"]
  ];

  function route() {
    var hash = (location.hash || "#library").slice(1);
    var parts = hash.split("/");
    var view = parts[0] || "library";
    var arg = parts.slice(1).join("/") || null;
    if (!VIEWS[view]) { view = "library"; arg = null; }
    if (view !== "exam" && examTimerId) { clearInterval(examTimerId); examTimerId = null; }
    currentView = view;
    $$("nav.mainnav a").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-view") === view);
    });
    WB.destroyCharts();
    content.innerHTML = "";
    VIEWS[view](arg);
    content.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  /* ══════════════════ tiny DOM helpers ══════════════════ */
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function katexIn(root) {
    $$(".ktx", root).forEach(function (n) {
      WB.katex(n, n.getAttribute("data-ltx"), n.hasAttribute("data-display"));
    });
  }
  function header(title, sub) {
    return "<h2 class='viewtitle'>" + WB.esc(title) + "</h2><p class='viewsub'>" + sub + "</p>";
  }
  function ltxSpan(latex, display) {
    return "<span class='ktx' " + (display ? "data-display " : "") + "data-ltx=\"" + WB.esc(latex) + "\"></span>";
  }
  function stepsHTML(steps) {
    return "<div class='steps'>" + steps.map(function (s) {
      return "<div class='step'>" + ltxSpan(s.latex, true) +
        (s.note ? "<div class='note'>" + WB.esc(s.note) + "</div>" : "") + "</div>";
    }).join("") + "</div>";
  }
  function fmtAnswer(value, unit) {
    if (unit === "currency") return WB.fmtCurrencyHTML(value);
    return WB.esc(WB.fmtUnit(value, unit));
  }

  /* ══════════════════ LIBRARY ══════════════════ */
  function viewLibrary() {
    var html = header("Equation library", WB.EQUATIONS.length +
      " equations under command. Search by name, symbol or description — click one to open it in the solver.");
    html += "<input type='text' id='libsearch' placeholder='Search the armoury…' autocomplete='off'>";
    html += "<div class='chips' id='libchips'><button class='chip on' data-cat='*'>All</button>" +
      WB.CATEGORIES.map(function (c) {
        return "<button class='chip' data-cat=\"" + WB.esc(c) + "\">" + WB.esc(c) + "</button>";
      }).join("") + "</div>";
    html += "<div class='eqgrid' id='eqgrid'></div>";
    content.innerHTML = html;

    var activeCat = "*";
    function paint() {
      var q = $("#libsearch").value.trim().toLowerCase();
      var grid = $("#eqgrid");
      grid.innerHTML = WB.EQUATIONS.filter(function (eq) {
        if (activeCat !== "*" && eq.category !== activeCat) return false;
        if (!q) return true;
        var hay = (eq.name + " " + eq.description + " " + eq.category + " " + eq.id + " " +
          (eq.variables || []).map(function (m) { return m.symbol + " " + m.name; }).join(" ")).toLowerCase();
        return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
      }).map(function (eq) {
        return "<div class='eqcard' data-id='" + eq.id + "'>" +
          "<div class='cat'>" + WB.esc(eq.category) + (eq.custom ? " · custom" : "") + "</div>" +
          "<div class='nm'>" + WB.esc(eq.name) + "</div>" +
          "<div class='ltx'>" + ltxSpan(eq.latex) + "</div>" +
          "<div class='desc'>" + WB.esc(eq.description) + "</div></div>";
      }).join("") || "<p class='viewsub'>Nothing matches. Loosen the search.</p>";
      katexIn(grid);
      $$(".eqcard", grid).forEach(function (card) {
        card.addEventListener("click", function () {
          location.hash = "#solver/" + card.getAttribute("data-id");
        });
      });
    }
    $("#libsearch").addEventListener("input", paint);
    $$("#libchips .chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        activeCat = chip.getAttribute("data-cat");
        $$("#libchips .chip").forEach(function (c) { c.classList.toggle("on", c === chip); });
        paint();
      });
    });
    paint();
  }

  /* ══════════════════ SOLVER ══════════════════ */
  function viewSolver(eqId) {
    var eq = eqId ? WB.getEquation(eqId) : null;
    if (!eq) eq = WB.getEquation(WB.load("wb_last_eq", "compound_fv")) || WB.EQUATIONS[0];
    WB.save("wb_last_eq", eq.id);

    var html = header("Solver", "Pick the unknown, supply the rest, and press Enter. Percent fields take 9.5 to mean 9.5%.");
    html += "<label class='f'><span class='lbl'>Equation</span><select id='eqsel'>" +
      WB.CATEGORIES.map(function (cat) {
        var opts = WB.EQUATIONS.filter(function (e) { return e.category === cat; })
          .map(function (e) {
            return "<option value='" + e.id + "'" + (e.id === eq.id ? " selected" : "") + ">" + WB.esc(e.name) + "</option>";
          }).join("");
        return opts ? "<optgroup label=\"" + WB.esc(cat) + "\">" + opts + "</optgroup>" : "";
      }).join("") + "</select></label>";
    html += "<div class='formula-banner'>" + ltxSpan(eq.latex, true) +
      "<div class='viewsub' style='margin:8px 0 0'>" + WB.esc(eq.description) + "</div></div>";
    html += "<div id='solverbody'></div><div id='chartzone'></div>";
    content.innerHTML = html;
    katexIn(content);
    $("#eqsel").addEventListener("change", function () {
      location.hash = "#solver/" + this.value;
    });

    if (eq.type === "list") renderListSolver(eq);
    else renderRelationSolver(eq);
  }

  function unitLabel(unit) {
    var s = WB.getSettings();
    return { currency: s.currency, percent: "%", years: "years", count: "count", number: "" }[unit] || "";
  }

  function renderRelationSolver(eq) {
    var body = $("#solverbody");
    var target = eq.variables[0].symbol;
    var saved = WB.load("wb_solver_vals_" + eq.id, {});

    function paint() {
      var html = "<div class='solvegrid'><div>";
      html += "<div class='lbl' style='font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-dim);margin-bottom:6px'>Solve for</div>";
      html += "<div class='varpick'>" + eq.variables.map(function (m) {
        return "<button class='vp" + (m.symbol === target ? " on" : "") + "' data-sym='" + WB.esc(m.symbol) + "'>" +
          WB.esc(m.symbol) + " — " + WB.esc(m.name) + "</button>";
      }).join("") + "</div>";
      html += "<form id='solveform'>";
      eq.variables.forEach(function (m) {
        if (m.symbol === target) return;
        var val = saved[m.symbol] !== undefined ? saved[m.symbol] : (m.default !== undefined ? m.default : "");
        html += "<label class='f'><span class='lbl'>" + WB.esc(m.symbol) + " — " + WB.esc(m.name) +
          (unitLabel(m.unit) ? " (" + unitLabel(m.unit) + ")" : "") + "</span>" +
          "<input type='text' inputmode='decimal' data-sym='" + WB.esc(m.symbol) + "' value='" + WB.esc(val) + "'></label>";
      });
      html += "<button class='primary' type='submit'>Solve</button></form></div>";
      html += "<div id='resultzone'></div></div>";
      body.innerHTML = html;

      $$(".vp", body).forEach(function (b) {
        b.addEventListener("click", function (e) {
          e.preventDefault();
          target = b.getAttribute("data-sym");
          paint();
        });
      });
      $("#solveform").addEventListener("submit", function (e) {
        e.preventDefault();
        solveNow();
      });
    }

    function solveNow() {
      var vals = {};
      $$("#solveform input").forEach(function (inp) {
        var sym = inp.getAttribute("data-sym");
        vals[sym] = WB.parseNum(inp.value);
        saved[sym] = inp.value;
      });
      WB.save("wb_solver_vals_" + eq.id, saved);
      var zone = $("#resultzone");
      WB.destroyCharts();
      $("#chartzone").innerHTML = "";
      try {
        var res = WB.solve(eq, target, vals);
        var meta = WB.varMeta(eq, target);
        var dp = WB.getSettings().decimals;
        var zhtml = "<div class='answerbox'><div class='alabel'>" + WB.esc(meta.name) + " (" + WB.esc(target) + ")</div>" +
          "<div class='aval'>" + fmtAnswer(res.value, meta.unit) + "</div>" +
          "<div class='anote'>" + (meta.unit === "percent" ? "Entered rates are % — this result is a % too. " : "") +
          "Unrounded: " + WB.fmtNum(res.value, Math.max(dp + 4, 6)) + "</div></div>";
        var steps = WB.getSteps(eq, target, res);
        zhtml += "<h3 class='section'>Worked steps</h3>" + stepsHTML(steps);
        zone.innerHTML = zhtml;
        katexIn(zone);
        WB.renderChart($("#chartzone"), eq, res.v);
      } catch (err) {
        zone.innerHTML = "<div class='answerbox err'><div class='alabel'>No result</div><div class='aval'>" +
          WB.esc(err.message) + "</div></div>";
      }
    }
    paint();
  }

  /* --- list-type solver (cash flows / data lists / pair tables) --- */
  function renderListSolver(eq) {
    var body = $("#solverbody");
    var saved = WB.load("wb_solver_vals_" + eq.id, {});
    var html = "<div class='solvegrid'><div><form id='solveform'>";
    eq.inputs.forEach(function (inp) {
      var val = saved[inp.key] !== undefined ? saved[inp.key] : inp.default;
      if (inp.kind === "cashflow") {
        html += "<div class='lbl' style='font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-dim);margin-bottom:6px'>" + WB.esc(inp.label) + "</div>";
        html += "<table class='cf' data-key='" + inp.key + "'><thead><tr><th>t</th><th>Cash flow</th><th></th></tr></thead><tbody>" +
          val.map(function (cf, t) {
            return "<tr><td class='tno'>" + t + "</td><td><input type='text' inputmode='decimal' value='" + cf + "'></td>" +
              "<td><button type='button' class='del' title='Remove row'>×</button></td></tr>";
          }).join("") + "</tbody></table>" +
          "<button type='button' class='small addrow' data-key='" + inp.key + "'>+ Add row</button><br><br>";
      } else if (inp.kind === "datalist") {
        html += "<label class='f'><span class='lbl'>" + WB.esc(inp.label) + "</span>" +
          "<textarea rows='3' data-key='" + inp.key + "'>" + val.join(", ") + "</textarea>" +
          "<span class='hint'>Separate values with commas or spaces.</span></label>";
      } else if (inp.kind === "pairs") {
        html += "<div class='lbl' style='font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-dim);margin-bottom:6px'>" + WB.esc(inp.label) + "</div>";
        html += "<table class='cf pairs' data-key='" + inp.key + "'><thead><tr><th>" + WB.esc(inp.cols[0]) + "</th><th>" + WB.esc(inp.cols[1]) + "</th><th></th></tr></thead><tbody>" +
          val.map(function (pair) {
            return "<tr><td><input type='text' inputmode='decimal' value='" + pair[0] + "'></td>" +
              "<td><input type='text' inputmode='decimal' value='" + pair[1] + "'></td>" +
              "<td><button type='button' class='del' title='Remove row'>×</button></td></tr>";
          }).join("") + "</tbody></table>" +
          "<button type='button' class='small addrow' data-key='" + inp.key + "'>+ Add row</button><br><br>";
      } else {
        html += "<label class='f'><span class='lbl'>" + WB.esc(inp.label) +
          (inp.unit === "percent" ? " (%)" : "") + "</span>" +
          "<input type='text' inputmode='decimal' data-key='" + inp.key + "' value='" + val + "'></label>";
      }
    });
    html += "<button class='primary' type='submit'>Compute</button></form></div><div id='resultzone'></div></div>";
    body.innerHTML = html;

    function renumber(table) {
      $$(".tno", table).forEach(function (td, i) { td.textContent = i; });
    }
    body.addEventListener("click", function (e) {
      if (e.target.classList.contains("del")) {
        var tr = e.target.closest("tr"), table = e.target.closest("table");
        if ($$("tbody tr", table).length > 1) { tr.remove(); renumber(table); }
      } else if (e.target.classList.contains("addrow")) {
        var key = e.target.getAttribute("data-key");
        var tb = $("table[data-key='" + key + "'] tbody", body);
        var isPairs = $("table[data-key='" + key + "']", body).classList.contains("pairs");
        var tr = document.createElement("tr");
        tr.innerHTML = isPairs
          ? "<td><input type='text' inputmode='decimal' value='0'></td><td><input type='text' inputmode='decimal' value='0'></td><td><button type='button' class='del'>×</button></td>"
          : "<td class='tno'></td><td><input type='text' inputmode='decimal' value='0'></td><td><button type='button' class='del'>×</button></td>";
        tb.appendChild(tr);
        renumber(tb.closest("table"));
        $("input", tr).focus();
      }
    });

    $("#solveform").addEventListener("submit", function (e) {
      e.preventDefault();
      var inputs = {};
      eq.inputs.forEach(function (inp) {
        if (inp.kind === "cashflow") {
          inputs[inp.key] = $$("table[data-key='" + inp.key + "'] tbody input", body)
            .map(function (i) { return WB.parseNum(i.value) || 0; });
        } else if (inp.kind === "datalist") {
          inputs[inp.key] = $("textarea[data-key='" + inp.key + "']", body).value
            .split(/[,;\s]+/).filter(Boolean).map(WB.parseNum).filter(isFinite);
        } else if (inp.kind === "pairs") {
          inputs[inp.key] = $$("table[data-key='" + inp.key + "'] tbody tr", body).map(function (tr) {
            var ins = $$("input", tr);
            return [WB.parseNum(ins[0].value) || 0, WB.parseNum(ins[1].value) || 0];
          });
        } else {
          inputs[inp.key] = WB.parseNum($("input[data-key='" + inp.key + "']", body).value);
        }
        saved[inp.key] = inputs[inp.key];
      });
      WB.save("wb_solver_vals_" + eq.id, saved);
      WB.destroyCharts();
      $("#chartzone").innerHTML = "";
      var zone = $("#resultzone");
      var res = eq.compute(inputs);
      var zhtml = "";
      if (res.error) {
        zhtml += "<div class='answerbox err'><div class='alabel'>Check inputs</div><div class='aval'>" + WB.esc(res.error) + "</div></div>";
      }
      res.outputs.forEach(function (o) {
        if (!isFinite(o.value)) return;
        zhtml += "<div class='outrow'><span class='ol'>" + WB.esc(o.label) + "</span><span class='ov'>" +
          fmtAnswer(o.value, o.unit) + "</span></div>";
      });
      if (res.steps && res.steps.length) zhtml += "<h3 class='section'>Worked steps</h3>" + stepsHTML(res.steps);
      zone.innerHTML = zhtml;
      katexIn(zone);
      if (!res.error) WB.renderChart($("#chartzone"), eq, inputs);
    });
  }

  /* ══════════════════ shared problem machinery ══════════════════ */
  function generatorPool(cats) {
    return WB.EQUATIONS.filter(function (e) {
      return e.problemGenerator && cats.indexOf(e.category) >= 0;
    });
  }
  function pickWeightedQuestion(cats, difficulty) {
    var pool = generatorPool(cats);
    if (!pool.length) return null;
    var catList = [];
    pool.forEach(function (e) { if (catList.indexOf(e.category) < 0) catList.push(e.category); });
    var weights = catList.map(WB.categoryWeight);
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var r = Math.random() * total, cat = catList[0];
    for (var i = 0; i < catList.length; i++) {
      r -= weights[i];
      if (r <= 0) { cat = catList[i]; break; }
    }
    var eqs = pool.filter(function (e) { return e.category === cat; });
    var eq = eqs[Math.floor(Math.random() * eqs.length)];
    var q = eq.problemGenerator(WB.makeRng(), difficulty);
    q.eqId = eq.id;
    q.category = eq.category;
    return q;
  }
  function solutionSteps(q) {
    var eq = WB.getEquation(q.eqId);
    try {
      if (eq.type === "list") {
        var res = eq.compute(q.given);
        return res.steps || [];
      }
      var sf = q.solveFor;
      if (!WB.varMeta(eq, sf)) sf = eq.variables[0].symbol; // e.g. derived outputs like Q*
      var r = WB.solve(eq, sf, q.given);
      return WB.getSteps(eq, sf, r);
    } catch (e) {
      return [{ latex: "\\text{—}", note: "Could not reconstruct steps: " + e.message }];
    }
  }
  function checkAnswer(q, raw) {
    var x = WB.parseNum(raw);
    if (!isFinite(x)) return null;
    return Math.abs(x - q.answer) <= q.tolerance;
  }
  function accClass(a) { return a >= 0.75 ? "acc-good" : (a >= 0.5 ? "acc-mid" : "acc-bad"); }

  function catCheckboxes(idPrefix, chosen) {
    return WB.CATEGORIES.filter(function (c) {
      return generatorPool([c]).length;
    }).map(function (c) {
      var on = !chosen || chosen.indexOf(c) >= 0;
      return "<button type='button' class='chip" + (on ? " on" : "") + "' data-cat=\"" + WB.esc(c) + "\">" + WB.esc(c) + "</button>";
    }).join("");
  }
  function chosenCats(rootSel) {
    return $$(rootSel + " .chip.on").map(function (c) { return c.getAttribute("data-cat"); });
  }
  function bindChips(rootSel) {
    $$(rootSel + " .chip").forEach(function (chip) {
      chip.addEventListener("click", function () { chip.classList.toggle("on"); });
    });
  }

  /* ══════════════════ PRACTICE ══════════════════ */
  function viewPractice() {
    var cfg = WB.load("wb_practice_cfg", { cats: null, difficulty: 2 });
    var html = header("Practice", "Randomised word problems, weighted toward your weakest categories. Keys: <b>N</b> next · <b>H</b> hint · <b>S</b> solution.");
    html += "<div class='chips' id='pcats'>" + catCheckboxes("p", cfg.cats) + "</div>";
    html += "<div class='row' style='max-width:460px'>" +
      "<label class='f'><span class='lbl'>Difficulty</span><select id='pdiff'>" +
      [1, 2, 3].map(function (d) {
        return "<option value='" + d + "'" + (cfg.difficulty === d ? " selected" : "") + ">" +
          ["Recruit (1)", "Legionary (2)", "Centurion (3)"][d - 1] + "</option>";
      }).join("") + "</select></label>" +
      "<div class='fixed'><button class='primary' id='pstart'>Draw a question</button></div></div>";
    html += "<div id='pzone'></div>";
    html += "<h3 class='section'>Standing per category</h3><div id='pstats'></div>";
    content.innerHTML = html;
    bindChips("#pcats");
    paintStats();
    $("#pstart").addEventListener("click", nextQuestion);
    if (practiceState && practiceState.q) paintQuestion();

    function paintStats() {
      var st = WB.getStats();
      var rows = WB.CATEGORIES.map(function (c) {
        var s = st[c];
        if (!s || !s.attempts) return "<tr><td>" + WB.esc(c) + "</td><td>—</td><td>—</td><td>—</td></tr>";
        var a = s.correct / s.attempts;
        return "<tr><td>" + WB.esc(c) + "</td><td>" + s.attempts + "</td><td>" + s.correct +
          "</td><td class='" + accClass(a) + "'>" + WB.fmtNum(a * 100, 0) + "%</td></tr>";
      }).join("");
      $("#pstats").innerHTML = "<table class='plain'><thead><tr><th>Category</th><th>Attempts</th><th>Correct</th><th>Accuracy</th></tr></thead><tbody>" + rows + "</tbody></table>" +
        "<p class='viewsub' style='margin-top:10px'>Weak categories are drawn more often — accuracy drives the draw weights.</p>";
    }

    function nextQuestion() {
      var cats = chosenCats("#pcats");
      var diff = parseInt($("#pdiff").value, 10);
      WB.save("wb_practice_cfg", { cats: cats, difficulty: diff });
      if (!cats.length) { $("#pzone").innerHTML = "<p class='msg-bad'>Choose at least one category.</p>"; return; }
      var q = pickWeightedQuestion(cats, diff);
      if (!q) { $("#pzone").innerHTML = "<p class='msg-bad'>No generators available in those categories.</p>"; return; }
      practiceState = { q: q, hinted: false, revealed: false, marked: false };
      paintQuestion();
    }
    WB._practiceNext = nextQuestion;

    function paintQuestion() {
      var st = practiceState, q = st.q;
      var eq = WB.getEquation(q.eqId);
      var html = "<div class='qcard'><div class='qmeta'><span>" + WB.esc(q.category) + " — " + WB.esc(eq.name) +
        "</span><span>Answer in " + WB.esc(q.unit) + (q.unit === "percent" ? " (enter 9.5 for 9.5%)" : "") + "</span></div>" +
        "<div class='qtext'>" + WB.esc(q.prompt) + "</div>" +
        "<div class='aline'><input type='text' inputmode='decimal' id='pans' placeholder='Your answer' autocomplete='off'>" +
        "<button class='primary' id='pcheck'>Check</button>" +
        "<button id='phint'>Hint (H)</button>" +
        "<button id='psol'>Solution (S)</button>" +
        "<button id='pnext'>Next (N)</button></div>" +
        "<div id='pfeed'></div><div id='phintbox'></div><div id='psolbox'></div>" +
        "<div class='kbd-hints'>Enter checks · <b>N</b> next · <b>H</b> hint · <b>S</b> full solution</div></div>";
      $("#pzone").innerHTML = html;
      if (st.hinted) showHint();
      if (st.revealed) showSolution();

      $("#pcheck").addEventListener("click", check);
      $("#pans").addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); check(); }
      });
      $("#phint").addEventListener("click", showHint);
      $("#psol").addEventListener("click", showSolution);
      $("#pnext").addEventListener("click", nextQuestion);
      $("#pans").focus();

      function check() {
        var ok = checkAnswer(q, $("#pans").value);
        var feed = $("#pfeed");
        if (ok === null) {
          feed.className = "feedback"; feed.textContent = "Enter a number first (or reveal the solution and self-mark).";
          return;
        }
        if (!st.marked) { WB.recordAttempt(q.category, ok); st.marked = true; paintStats(); }
        feed.className = "feedback " + (ok ? "good" : "bad");
        feed.innerHTML = ok
          ? "Correct. Expected " + fmtAnswer(q.answer, q.unit) + " (±" + WB.fmtNum(q.tolerance, 2) + ")."
          : "Not within tolerance. Expected " + fmtAnswer(q.answer, q.unit) + " (±" + WB.fmtNum(q.tolerance, 2) + "). See the solution and find the slip.";
      }
    }
    WB._practiceHint = showHint;
    WB._practiceSol = showSolution;

    function showHint() {
      if (!practiceState || !practiceState.q) return;
      practiceState.hinted = true;
      var eq = WB.getEquation(practiceState.q.eqId);
      var box = $("#phintbox");
      if (!box) return;
      box.innerHTML = "<div class='hintbox'>The right weapon: " + ltxSpan(eq.latex) + "</div>";
      katexIn(box);
    }
    function showSolution() {
      var st = practiceState;
      if (!st || !st.q) return;
      st.revealed = true;
      var box = $("#psolbox");
      if (!box) return;
      var steps = solutionSteps(st.q);
      var html = "<div class='solbox'><div class='outrow'><span class='ol'>Answer</span><span class='ov'>" +
        fmtAnswer(st.q.answer, st.q.unit) + "</span></div>" + stepsHTML(steps);
      if (!st.marked) {
        html += "<div class='aline'><span class='viewsub' style='margin:0'>Self-mark:</span>" +
          "<button class='small' id='pselfr'>I had it right</button>" +
          "<button class='small' id='pselfw'>I had it wrong</button></div>";
      }
      html += "</div>";
      box.innerHTML = html;
      katexIn(box);
      var r = $("#pselfr"), w = $("#pselfw");
      function mark(ok) {
        if (st.marked) return;
        st.marked = true;
        WB.recordAttempt(st.q.category, ok);
        paintStats();
        var feed = $("#pfeed");
        feed.className = "feedback " + (ok ? "good" : "bad");
        feed.textContent = ok ? "Marked correct." : "Marked wrong — this category will now appear more often.";
        if (r) r.disabled = true;
        if (w) w.disabled = true;
      }
      if (r) r.addEventListener("click", function () { mark(true); });
      if (w) w.addEventListener("click", function () { mark(false); });
    }
  }

  /* ══════════════════ EXAM ══════════════════ */
  function viewExam() {
    if (examState && examState.running) { paintExamQuestion(); return; }
    var cfg = WB.load("wb_exam_cfg", { n: 10, minutes: 20, cats: null });
    var html = header("Exam mode", "Timed mixed quiz. Answers are checked at the end; history is kept so you can watch the trend.");
    html += "<div class='chips' id='ecats'>" + catCheckboxes("e", cfg.cats) + "</div>";
    html += "<div class='row' style='max-width:560px'>" +
      "<label class='f'><span class='lbl'>Questions</span><input type='number' id='en' min='3' max='50' value='" + cfg.n + "'></label>" +
      "<label class='f'><span class='lbl'>Minutes</span><input type='number' id='emin' min='1' max='180' value='" + cfg.minutes + "'></label>" +
      "<div class='fixed'><button class='primary' id='estart'>Begin exam</button></div></div>";
    html += "<div id='ezone'></div><h3 class='section'>Campaign history</h3><div id='ehist'></div>";
    content.innerHTML = html;
    bindChips("#ecats");
    paintHistory();
    $("#estart").addEventListener("click", startExam);

    function paintHistory() {
      var hist = WB.load("wb_exam_history", []);
      if (!hist.length) { $("#ehist").innerHTML = "<p class='viewsub'>No exams fought yet.</p>"; return; }
      var rows = hist.slice().reverse().map(function (h) {
        var a = h.score / h.total;
        return "<tr><td>" + WB.esc(new Date(h.date).toLocaleString("en-ZA")) + "</td><td>" + h.score + " / " + h.total +
          "</td><td class='" + accClass(a) + "'>" + WB.fmtNum(a * 100, 0) + "%</td><td>" +
          WB.fmtNum(h.secondsUsed / 60, 1) + " min</td><td>" + WB.esc(h.weakest || "—") + "</td></tr>";
      }).join("");
      $("#ehist").innerHTML = "<table class='plain'><thead><tr><th>When</th><th>Score</th><th>%</th><th>Time</th><th>Weakest topic</th></tr></thead><tbody>" + rows + "</tbody></table>";
    }

    function startExam() {
      var cats = chosenCats("#ecats");
      var n = Math.max(3, Math.min(50, parseInt($("#en").value, 10) || 10));
      var minutes = Math.max(1, Math.min(180, parseInt($("#emin").value, 10) || 20));
      if (!cats.length) { $("#ezone").innerHTML = "<p class='msg-bad'>Choose at least one category.</p>"; return; }
      WB.save("wb_exam_cfg", { n: n, minutes: minutes, cats: cats });
      var qs = [];
      for (var k = 0; k < n; k++) {
        var q = pickWeightedQuestion(cats, 2);
        if (q) qs.push(q);
      }
      if (!qs.length) { $("#ezone").innerHTML = "<p class='msg-bad'>No generators in those categories.</p>"; return; }
      examState = {
        running: true, qs: qs, answers: new Array(qs.length).fill(""),
        idx: 0, deadline: Date.now() + minutes * 60000, started: Date.now(), minutes: minutes
      };
      paintExamQuestion();
    }
  }

  function paintExamQuestion() {
    var st = examState;
    var q = st.qs[st.idx];
    var html = header("Exam — question " + (st.idx + 1) + " of " + st.qs.length,
      "Answer and march on. The clock does not negotiate.");
    html += "<div class='scoreline'><div class='scorebit'><div class='k'>Time remaining</div><div class='v timer' id='etimer'>—</div></div>" +
      "<div class='scorebit'><div class='k'>Answered</div><div class='v'>" +
      st.answers.filter(function (a) { return a !== ""; }).length + " / " + st.qs.length + "</div></div></div>";
    html += "<div class='qcard'><div class='qmeta'><span>" + WB.esc(q.category) +
      "</span><span>Answer in " + WB.esc(q.unit) + "</span></div>" +
      "<div class='qtext'>" + WB.esc(q.prompt) + "</div>" +
      "<div class='aline'><input type='text' inputmode='decimal' id='eans' value='" + WB.esc(st.answers[st.idx]) + "' placeholder='Your answer' autocomplete='off'>" +
      (st.idx > 0 ? "<button id='eprev'>← Back</button>" : "") +
      (st.idx < st.qs.length - 1 ? "<button class='primary' id='enext'>Save & next →</button>" : "") +
      "<button class='" + (st.idx === st.qs.length - 1 ? "primary" : "") + "' id='efinish'>Finish exam</button></div></div>";
    content.innerHTML = html;
    var ans = $("#eans");
    ans.focus();
    function saveAns() { st.answers[st.idx] = ans.value; }
    ans.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        saveAns();
        if (st.idx < st.qs.length - 1) { st.idx++; paintExamQuestion(); } else finishExam();
      }
    });
    if ($("#enext")) $("#enext").addEventListener("click", function () { saveAns(); st.idx++; paintExamQuestion(); });
    if ($("#eprev")) $("#eprev").addEventListener("click", function () { saveAns(); st.idx--; paintExamQuestion(); });
    $("#efinish").addEventListener("click", function () { saveAns(); finishExam(); });

    if (examTimerId) clearInterval(examTimerId);
    function tick() {
      var left = Math.max(0, st.deadline - Date.now());
      var t = $("#etimer");
      if (t) {
        var mm = Math.floor(left / 60000), ss = Math.floor(left % 60000 / 1000);
        t.textContent = mm + ":" + (ss < 10 ? "0" : "") + ss;
        t.classList.toggle("low", left < 60000);
      }
      if (left <= 0) { saveAns(); finishExam(); }
    }
    examTimerId = setInterval(tick, 500);
    tick();
  }

  function finishExam() {
    if (examTimerId) { clearInterval(examTimerId); examTimerId = null; }
    var st = examState;
    if (!st || !st.running) return;
    st.running = false;
    var perCat = {}, score = 0;
    var detail = st.qs.map(function (q, k) {
      var ok = checkAnswer(q, st.answers[k]) === true;
      if (ok) score++;
      if (!perCat[q.category]) perCat[q.category] = { attempts: 0, correct: 0 };
      perCat[q.category].attempts++;
      if (ok) perCat[q.category].correct++;
      WB.recordAttempt(q.category, ok);
      return { q: q, given: st.answers[k], ok: ok };
    });
    var secondsUsed = Math.min(Math.round((Date.now() - st.started) / 1000), st.minutes * 60);
    var weak = Object.keys(perCat).map(function (c) {
      return { c: c, a: perCat[c].correct / perCat[c].attempts };
    }).sort(function (x, y) { return x.a - y.a; });
    var hist = WB.load("wb_exam_history", []);
    hist.push({
      date: new Date().toISOString(), score: score, total: st.qs.length,
      secondsUsed: secondsUsed, perCat: perCat,
      weakest: weak.length ? weak[0].c : null
    });
    WB.save("wb_exam_history", hist);

    var html = header("Exam result", "The ledger does not lie.");
    var pct = score / st.qs.length;
    html += "<div class='scoreline'>" +
      "<div class='scorebit'><div class='k'>Score</div><div class='v'>" + score + " / " + st.qs.length + "</div></div>" +
      "<div class='scorebit'><div class='k'>Accuracy</div><div class='v " + accClass(pct) + "'>" + WB.fmtNum(pct * 100, 0) + "%</div></div>" +
      "<div class='scorebit'><div class='k'>Time used</div><div class='v'>" + WB.fmtNum(secondsUsed / 60, 1) + " min</div></div></div>";
    html += "<h3 class='section'>Per category</h3><table class='plain'><thead><tr><th>Category</th><th>Correct</th><th>Accuracy</th></tr></thead><tbody>" +
      Object.keys(perCat).map(function (c) {
        var s = perCat[c], a = s.correct / s.attempts;
        return "<tr><td>" + WB.esc(c) + "</td><td>" + s.correct + " / " + s.attempts +
          "</td><td class='" + accClass(a) + "'>" + WB.fmtNum(a * 100, 0) + "%</td></tr>";
      }).join("") + "</tbody></table>";
    var weakest = weak.filter(function (w) { return w.a < 1; }).slice(0, 3);
    if (weakest.length) {
      html += "<h3 class='section'>Weakest topics — drill these next</h3><ul>" + weakest.map(function (w) {
        return "<li>" + WB.esc(w.c) + " — " + WB.fmtNum(w.a * 100, 0) + "%</li>";
      }).join("") + "</ul>";
    }
    html += "<h3 class='section'>Question review</h3>";
    html += detail.map(function (d, k) {
      return "<div class='qcard'><div class='qmeta'><span>Q" + (k + 1) + " · " + WB.esc(d.q.category) +
        "</span><span class='" + (d.ok ? "acc-good" : "acc-bad") + "'>" + (d.ok ? "CORRECT" : "WRONG") + "</span></div>" +
        "<div class='qtext' style='font-size:14px'>" + WB.esc(d.q.prompt) + "</div>" +
        "<div class='feedback'>Your answer: " + (d.given === "" ? "—" : WB.esc(d.given)) +
        " · Expected: " + fmtAnswer(d.q.answer, d.q.unit) + " (±" + WB.fmtNum(d.q.tolerance, 2) + ")</div>" +
        "<details><summary style='cursor:pointer;color:var(--ink-dim);font-size:12.5px'>Show solution</summary>" +
        stepsHTML(solutionSteps(d.q)) + "</details></div>";
    }).join("");
    html += "<br><button class='primary' id='eagain'>New exam</button>";
    content.innerHTML = html;
    katexIn(content);
    $("#eagain").addEventListener("click", function () { examState = null; route(); });
    examState = null;
  }

  /* ══════════════════ FORMULA SHEET ══════════════════ */
  function viewSheet() {
    var html = header("Formula sheet", "Print it, laminate it, march with it.") +
      "<button class='primary noprint' onclick='window.print()'>Print</button><div class='sheet'>";
    WB.CATEGORIES.forEach(function (cat) {
      var eqs = WB.EQUATIONS.filter(function (e) { return e.category === cat; });
      if (!eqs.length) return;
      html += "<div class='sheetcat'><h3>" + WB.esc(cat) + "</h3>";
      eqs.forEach(function (eq) {
        html += "<div class='frow'><div class='fn'><strong>" + WB.esc(eq.name) + "</strong><br><span style='color:var(--ink-dim);font-size:11.5px'>" +
          WB.esc(eq.description) + "</span></div><div class='fl'>" + ltxSpan(eq.latex, true) + "</div></div>";
      });
      html += "</div>";
    });
    html += "</div>";
    content.innerHTML = html;
    katexIn(content);
  }

  /* ══════════════════ ADD EQUATION ══════════════════ */
  function viewAdd() {
    var html = header("Add equation", "Define the relation once — solving for every variable comes free via the numeric engine.");
    html += "<div class='solvegrid'><div><form id='addform'>";
    html += "<label class='f'><span class='lbl'>Name</span><input type='text' id='aname' placeholder='e.g. Markup on cost'></label>";
    html += "<label class='f'><span class='lbl'>Category</span><input type='text' id='acat' list='catlist' value='Custom'>" +
      "<datalist id='catlist'>" + WB.CATEGORIES.map(function (c) { return "<option value=\"" + WB.esc(c) + "\">"; }).join("") + "</datalist></label>";
    html += "<label class='f'><span class='lbl'>Description</span><input type='text' id='adesc'></label>";
    html += "<label class='f'><span class='lbl'>LaTeX (live preview below)</span><textarea id='altx' rows='2'>S = C(1 + m)</textarea></label>";
    html += "<div class='preview-pane' id='apreview'></div>";
    html += "<div class='lbl' style='font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-dim);margin-bottom:6px'>Variables</div>";
    html += "<div id='avars'></div><button type='button' class='small' id='aaddvar'>+ Add variable</button><br><br>";
    html += "<label class='f'><span class='lbl'>Relation (a JS math expression equal to zero)</span>" +
      "<input type='text' id='arel' value='S - C*(1 + m)'>" +
      "<span class='hint'>Use the variable symbols plus Math functions, e.g. A - P*Math.pow(1+i, n). Percent-unit variables arrive as decimals.</span></label>";
    html += "<div class='aline'><button type='button' id='avalidate'>Validate</button>" +
      "<button class='primary' type='submit'>Save equation</button></div>";
    html += "<p id='amsg'></p></form></div><div>";
    html += "<h3 class='section' style='margin-top:0'>Your custom equations</h3><div id='alist'></div>";
    html += "<h3 class='section'>Backup</h3><div class='aline'>" +
      "<button id='aexport'>Export JSON</button>" +
      "<button id='aimportbtn'>Import JSON</button>" +
      "<input type='file' id='aimport' accept='.json,application/json' style='display:none'></div>";
    html += "</div></div>";
    content.innerHTML = html;

    var UNITS = ["number", "currency", "percent", "years", "count"];
    function varRow(v) {
      v = v || { symbol: "", name: "", unit: "number", default: "", min: "" };
      var row = el("div", { class: "varrow" });
      row.innerHTML =
        "<input type='text' class='vsym' placeholder='sym' value='" + WB.esc(v.symbol) + "'>" +
        "<input type='text' class='vname' placeholder='Name' value='" + WB.esc(v.name) + "'>" +
        "<select class='vunit'>" + UNITS.map(function (u) {
          return "<option" + (u === v.unit ? " selected" : "") + ">" + u + "</option>";
        }).join("") + "</select>" +
        "<input type='text' class='vdef' placeholder='default' value='" + WB.esc(v.default) + "'>" +
        "<input type='text' class='vmin' placeholder='min' value='" + WB.esc(v.min) + "'>" +
        "<button type='button' class='del'>×</button>";
      $(".del", row).addEventListener("click", function () { row.remove(); });
      return row;
    }
    var avars = $("#avars");
    [{ symbol: "S", name: "Selling price", unit: "currency", default: "", min: "0" },
     { symbol: "C", name: "Cost", unit: "currency", default: "100", min: "0" },
     { symbol: "m", name: "Markup", unit: "percent", default: "25", min: "" }].forEach(function (v) {
      avars.appendChild(varRow(v));
    });
    $("#aaddvar").addEventListener("click", function () { avars.appendChild(varRow()); });

    function paintPreview() {
      var p = $("#apreview");
      WB.katex(p, $("#altx").value || "\\text{(empty)}", true);
    }
    $("#altx").addEventListener("input", paintPreview);
    paintPreview();

    function collect() {
      var vars = $$("#avars .varrow").map(function (row) {
        var m = {
          symbol: $(".vsym", row).value.trim(),
          name: $(".vname", row).value.trim(),
          unit: $(".vunit", row).value
        };
        var d = $(".vdef", row).value.trim(), mn = $(".vmin", row).value.trim();
        if (d !== "") m.default = WB.parseNum(d);
        if (mn !== "") m.min = WB.parseNum(mn);
        return m;
      }).filter(function (m) { return m.symbol; });
      return {
        name: $("#aname").value.trim(),
        category: $("#acat").value.trim() || "Custom",
        description: $("#adesc").value.trim(),
        latex: $("#altx").value.trim(),
        relationSrc: $("#arel").value.trim(),
        variables: vars
      };
    }
    function validate(c) {
      if (!c.name) throw new Error("Give the equation a name.");
      if (!c.latex) throw new Error("Provide the LaTeX display form.");
      if (c.variables.length < 2) throw new Error("At least two variables are needed.");
      var syms = c.variables.map(function (m) { return m.symbol; });
      syms.forEach(function (s) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) throw new Error("Bad symbol: " + s);
      });
      if (new Set(syms).size !== syms.length) throw new Error("Duplicate variable symbols.");
      var rel = WB.compileRelation(c.relationSrc, syms);
      var test = {};
      c.variables.forEach(function (m) {
        var d = m.default !== undefined ? m.default : 1;
        test[m.symbol] = WB.toInternal(m.unit, d);
      });
      var y = rel(test);
      if (typeof y !== "number" || isNaN(y) && !isFinite(y)) throw new Error("Relation did not evaluate to a number at the default values.");
      return rel;
    }

    $("#avalidate").addEventListener("click", function () {
      var msg = $("#amsg");
      try {
        var c = collect();
        validate(c);
        msg.className = "msg-ok";
        msg.textContent = "Valid. Relation evaluates cleanly at the defaults.";
      } catch (e) {
        msg.className = "msg-bad";
        msg.textContent = e.message;
      }
    });

    $("#addform").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var msg = $("#amsg");
      try {
        var c = collect();
        var rel = validate(c);
        var id = "custom_" + c.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
        var base = id, k = 2;
        while (WB.getEquation(id)) { id = base + "_" + k++; }
        c.id = id;
        var customs = WB.load("wb_custom_eqs", []);
        customs.push(c);
        WB.save("wb_custom_eqs", customs);
        WB.EQUATIONS.push({
          id: id, name: c.name, category: c.category, latex: c.latex,
          description: c.description, variables: c.variables,
          custom: true, relationSrc: c.relationSrc, relation: rel
        });
        if (WB.CATEGORIES.indexOf(c.category) < 0) WB.CATEGORIES.push(c.category);
        msg.className = "msg-ok";
        msg.innerHTML = "Saved. <a href='#solver/" + id + "'>Open in the solver →</a>";
        paintList();
      } catch (e) {
        msg.className = "msg-bad";
        msg.textContent = e.message;
      }
    });

    function paintList() {
      var customs = WB.load("wb_custom_eqs", []);
      var box = $("#alist");
      if (!customs.length) { box.innerHTML = "<p class='viewsub'>None yet. Forge one.</p>"; return; }
      box.innerHTML = customs.map(function (c) {
        return "<div class='outrow'><span class='ol'><a href='#solver/" + c.id + "' style='color:var(--ink)'>" +
          WB.esc(c.name) + "</a> <span style='color:var(--ink-faint)'>(" + WB.esc(c.category) + ")</span></span>" +
          "<button class='small' data-del='" + c.id + "'>Delete</button></div>";
      }).join("");
      $$("#alist [data-del]").forEach(function (b) {
        b.addEventListener("click", function () {
          var id = b.getAttribute("data-del");
          WB.save("wb_custom_eqs", WB.load("wb_custom_eqs", []).filter(function (c) { return c.id !== id; }));
          var idx = WB.EQUATIONS.findIndex(function (e) { return e.id === id; });
          if (idx >= 0) WB.EQUATIONS.splice(idx, 1);
          paintList();
        });
      });
    }
    paintList();

    $("#aexport").addEventListener("click", function () {
      var data = JSON.stringify(WB.load("wb_custom_eqs", []), null, 2);
      var a = document.createElement("a");
      a.href = "data:application/json;charset=utf-8," + encodeURIComponent(data);
      a.download = "warbase-custom-equations.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    $("#aimportbtn").addEventListener("click", function () { $("#aimport").click(); });
    $("#aimport").addEventListener("change", function () {
      var file = this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var msg = $("#amsg");
        try {
          var arr = JSON.parse(reader.result);
          if (!Array.isArray(arr)) throw new Error("Expected a JSON array of equations.");
          var customs = WB.load("wb_custom_eqs", []);
          var added = 0;
          arr.forEach(function (c) {
            if (!c.id || !c.relationSrc || !c.variables) return;
            if (customs.some(function (x) { return x.id === c.id; })) return;
            WB.compileRelation(c.relationSrc, c.variables.map(function (m) { return m.symbol; })); // throws if bad
            customs.push(c);
            added++;
          });
          WB.save("wb_custom_eqs", customs);
          WB.loadCustomEquations();
          msg.className = "msg-ok";
          msg.textContent = "Imported " + added + " equation(s).";
          paintList();
        } catch (e) {
          msg.className = "msg-bad";
          msg.textContent = "Import failed: " + e.message;
        }
      };
      reader.readAsText(file);
    });
  }

  /* ══════════════════ SETTINGS ══════════════════ */
  function viewSettings() {
    var s = WB.getSettings();
    function toggleRow(id, title, desc, checked) {
      return "<div class='setrow'><div class='sl'><div class='t'>" + title + "</div><div class='d'>" + desc + "</div></div>" +
        "<label class='toggle'><input type='checkbox' id='" + id + "'" + (checked ? " checked" : "") + "><span class='tr'></span></label></div>";
    }
    var html = header("Settings", "Discipline in presentation.");
    html += toggleRow("set-theme", "Dark theme", "Default. Switch off for daylight marches.", s.theme === "dark");
    html += "<div class='setrow'><div class='sl'><div class='t'>Currency symbol</div><div class='d'>Default is South African Rand.</div></div>" +
      "<input type='text' id='set-cur' maxlength='4' value='" + WB.esc(s.currency) + "'></div>";
    html += "<div class='setrow'><div class='sl'><div class='t'>Decimal places</div><div class='d'>Rounding applied to every displayed result.</div></div>" +
      "<select id='set-dp'>" + [0, 1, 2, 3, 4, 5, 6].map(function (d) {
        return "<option value='" + d + "'" + (d === s.decimals ? " selected" : "") + ">" + d + "</option>";
      }).join("") + "</select></div>";
    html += toggleRow("set-roman", "Roman numerals (easter egg)", "Final currency answers also rendered in Roman numerals with vinculum notation — an overline multiplies by 1 000.", s.roman);
    html += "<h3 class='section'>Danger zone</h3>" +
      "<div class='setrow'><div class='sl'><div class='t'>Reset practice statistics</div><div class='d'>Clears per-category accuracy used by the weak-spot engine.</div></div><button id='set-rststats'>Reset stats</button></div>" +
      "<div class='setrow'><div class='sl'><div class='t'>Clear exam history</div><div class='d'>Deletes all stored exam results.</div></div><button id='set-rsthist'>Clear history</button></div>";
    content.innerHTML = html;

    function persist() {
      WB.saveSettings({
        theme: $("#set-theme").checked ? "dark" : "light",
        currency: $("#set-cur").value || "R",
        decimals: parseInt($("#set-dp").value, 10),
        roman: $("#set-roman").checked
      });
      applyTheme();
    }
    ["set-theme", "set-cur", "set-dp", "set-roman"].forEach(function (id) {
      $("#" + id).addEventListener("change", persist);
    });
    $("#set-rststats").addEventListener("click", function () {
      if (confirm("Reset all practice statistics?")) { WB.save("wb_stats", {}); }
    });
    $("#set-rsthist").addEventListener("click", function () {
      if (confirm("Delete all exam history?")) { WB.save("wb_exam_history", []); }
    });
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", WB.getSettings().theme);
  }
  WB.applyTheme = applyTheme;

  /* ══════════════════ keyboard flow ══════════════════ */
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (document.activeElement && document.activeElement.tagName) || "";
    var typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    if (currentView === "practice" && !typing) {
      var k = e.key.toLowerCase();
      if (k === "n" && WB._practiceNext) { e.preventDefault(); WB._practiceNext(); }
      else if (k === "h" && WB._practiceHint) { e.preventDefault(); WB._practiceHint(); }
      else if (k === "s" && WB._practiceSol) { e.preventDefault(); WB._practiceSol(); }
    }
  });

  /* ══════════════════ boot ══════════════════ */
  var VIEWS = {
    library: viewLibrary, solver: viewSolver, practice: viewPractice,
    exam: viewExam, sheet: viewSheet, add: viewAdd, settings: viewSettings
  };

  document.addEventListener("DOMContentLoaded", function () {
    applyTheme();
    WB.loadCustomEquations();
    content = $("#content");
    var nav = $("nav.mainnav");
    nav.innerHTML = NAV.map(function (n) {
      return "<a href='#" + n[0] + "' data-view='" + n[0] + "'>" + n[1] + "</a>";
    }).join("");
    window.addEventListener("hashchange", route);
    route();
  });
})();
