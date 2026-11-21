/* Savings Planner — everything runs in the browser; data is kept in localStorage on this device. */
(function () {
  'use strict';

  var KEY = 'savings-planner.v1';
  var TYPES = { expense: 'Expense', income: 'Income', saving: 'Saving', invest: 'Investment' };
  var EXPENSE_CATS = [
    ['Housing', 1], ['Groceries', 1], ['Utilities', 1], ['Transport', 1], ['Health', 1], ['Insurance', 1],
    ['Debt payments', 1], ['Education', 1], ['Dining out', 0], ['Entertainment', 0], ['Shopping', 0],
    ['Subscriptions', 0], ['Travel', 0], ['Other', 0]
  ];
  var INCOME_CATS = ['Salary', 'Freelance', 'Business', 'Interest & dividends', 'Gifts', 'Other income'];
  var INVEST_CATS = ['Index funds', 'Stocks', 'Retirement account', 'Bonds', 'Crypto', 'Other investment'];
  var CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS', 'CAD', 'AUD', 'CHF', 'JPY', 'INR', 'BRL', 'MXN', 'SEK', 'NOK', 'DKK', 'PLN', 'ZAR', 'SGD', 'NZD', 'AED', 'TRY'];
  var COLORS = { income: 'var(--s-income)', expense: 'var(--s-spent)', saving: 'var(--s-saved)', invest: 'var(--s-invest)' };

  var state, view = 'overview', month = ym(new Date()), storageOk = true;
  var filters = { q: '', type: '', cat: '' };
  var undoState = null, toastTimer = null;

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ym(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function ymd(d) { return ym(d) + '-' + pad(d.getDate()); }
  function today() { return ymd(new Date()); }
  function addMonths(m, n) { var p = m.split('-'); var d = new Date(+p[0], +p[1] - 1 + n, 1); return ym(d); }
  function monthsBetween(a, b) { var x = a.split('-'), y = b.split('-'); return (+y[0] - +x[0]) * 12 + (+y[1] - +x[1]); }
  function daysIn(m) { var p = m.split('-'); return new Date(+p[0], +p[1], 0).getDate(); }
  function monthName(m, short) { var p = m.split('-'); return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString(undefined, short ? { month: 'short' } : { month: 'long', year: 'numeric' }); }
  function dayLabel(d) { var p = d.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  function money(n, dec) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: state.settings.currency, minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 }).format(n);
    } catch (e) { return (Math.round(n * 100) / 100).toLocaleString(); }
  }
  function compact(n) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: state.settings.currency, notation: 'compact', maximumFractionDigits: 1 }).format(n); }
    catch (e) { return String(Math.round(n)); }
  }
  function pct(n) { return Math.round(n * 100) + '%'; }
  function num(v) { var n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; }
  function icon(name) {
    var p = {
      home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
      list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
      gauge: '<path d="M4 18a9 9 0 1 1 16 0M12 14l4-5"/>',
      target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
      trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
      gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.2-1.3L14 3h-4l-.4 2.4a7 7 0 0 0-2.2 1.3l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.6l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2.2 1.3L10 21h4l.4-2.4a7 7 0 0 0 2.2-1.3l2.3.9 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z"/>',
      plus: '<path d="M12 5v14M5 12h14"/>', left: '<path d="M15 6l-6 6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>',
      edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
      leaf: '<path d="M5 19c0-9 5-14 15-14 0 10-5 15-14 14M5 19c3-5 6-8 10-10"/>'
    }[name];
    return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>';
  }

  /* ---------- storage ---------- */
  function blank() {
    return { v: 1, settings: { currency: guessCurrency(), sample: false, cats: [] }, tx: [], budgets: {}, goals: [], plan: {} };
  }
  function guessCurrency() {
    var l = (navigator.language || 'en-US').toUpperCase();
    var map = { US: 'USD', GB: 'GBP', IL: 'ILS', CA: 'CAD', AU: 'AUD', CH: 'CHF', JP: 'JPY', IN: 'INR', BR: 'BRL', MX: 'MXN', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', ZA: 'ZAR', SG: 'SGD', NZ: 'NZD', AE: 'AED', TR: 'TRY', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', IE: 'EUR', PT: 'EUR', AT: 'EUR', BE: 'EUR', FI: 'EUR', GR: 'EUR' };
    var r = l.split('-')[1];
    if (l.indexOf('HE') === 0) return 'ILS';
    return map[r] || 'USD';
  }
  function normalize(s) {
    var b = blank();
    if (!s || typeof s !== 'object' || !Array.isArray(s.tx)) return null;
    s.settings = Object.assign(b.settings, s.settings || {});
    if (!Array.isArray(s.settings.cats)) s.settings.cats = [];
    s.budgets = s.budgets && typeof s.budgets === 'object' ? s.budgets : {};
    s.goals = Array.isArray(s.goals) ? s.goals : [];
    s.plan = s.plan && typeof s.plan === 'object' ? s.plan : {};
    s.tx = s.tx.filter(function (t) { return t && TYPES[t.type] && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && isFinite(+t.amount); })
      .map(function (t) { t.amount = Math.abs(+t.amount); t.id = t.id || uid(); return t; });
    return s;
  }
  function load() {
    var s = null;
    try { s = normalize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { s = null; }
    try { localStorage.setItem(KEY + '.t', '1'); localStorage.removeItem(KEY + '.t'); } catch (e) { storageOk = false; }
    state = s || sampleData();
    materializeRecurring();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { storageOk = false; }
  }

  /* ---------- categories ---------- */
  function expenseCats() { return EXPENSE_CATS.map(function (c) { return c[0]; }).concat(state.settings.cats.map(function (c) { return c.name; })); }
  function isNeed(cat) {
    for (var i = 0; i < EXPENSE_CATS.length; i++) if (EXPENSE_CATS[i][0] === cat) return !!EXPENSE_CATS[i][1];
    var c = state.settings.cats.filter(function (x) { return x.name === cat; })[0];
    return !!(c && c.need);
  }
  function catsFor(type) {
    if (type === 'income') return INCOME_CATS;
    if (type === 'invest') return INVEST_CATS;
    if (type === 'saving') return ['General savings'];
    return expenseCats();
  }
  function goalById(id) { return state.goals.filter(function (g) { return g.id === id; })[0]; }
  function txLabel(t) {
    if (t.type === 'saving') { var g = goalById(t.goalId); return g ? g.name : 'General savings'; }
    return t.category || TYPES[t.type];
  }

  /* ---------- recurring ---------- */
  function materializeRecurring() {
    var now = ym(new Date()), added = false;
    state.tx.filter(function (t) { return t.recurring && !t.recurOf; }).forEach(function (o) {
      var have = {};
      state.tx.forEach(function (t) { if (t.recurOf === o.id) have[t.date.slice(0, 7)] = 1; });
      (o.skip || []).forEach(function (m) { have[m] = 1; });
      var n = Math.min(monthsBetween(o.date.slice(0, 7), now), 120);
      for (var i = 1; i <= n; i++) {
        var m = addMonths(o.date.slice(0, 7), i);
        if (have[m]) continue;
        var day = Math.min(+o.date.slice(8), daysIn(m));
        state.tx.push({ id: uid(), type: o.type, amount: o.amount, category: o.category, goalId: o.goalId, note: o.note, date: m + '-' + pad(day), recurOf: o.id });
        added = true;
      }
    });
    if (added) save();
  }
  function originOf(t) { return t.recurOf ? state.tx.filter(function (x) { return x.id === t.recurOf; })[0] : (t.recurring ? t : null); }
  function repeats(t) { var o = originOf(t); return !!(o && o.recurring); }

  /* ---------- numbers ---------- */
  function totals(m) {
    var r = { income: 0, expense: 0, saving: 0, invest: 0, needs: 0, wants: 0, cats: {}, count: 0 };
    state.tx.forEach(function (t) {
      if (t.date.slice(0, 7) !== m) return;
      r[t.type] += t.amount; r.count++;
      if (t.type === 'expense') {
        r.cats[t.category] = (r.cats[t.category] || 0) + t.amount;
        if (isNeed(t.category)) r.needs += t.amount; else r.wants += t.amount;
      }
    });
    r.left = r.income - r.expense - r.saving - r.invest;
    r.put = r.saving + r.invest;
    return r;
  }
  /* average of the last n full months that have any activity */
  function averages(n) {
    var now = ym(new Date()), list = [];
    for (var i = 1; i <= 12 && list.length < n; i++) { var t = totals(addMonths(now, -i)); if (t.count) list.push(t); }
    var a = { months: list.length, income: 0, expense: 0, needs: 0, invest: 0, left: 0, cats: {} };
    list.forEach(function (t) {
      a.income += t.income; a.expense += t.expense; a.needs += t.needs; a.invest += t.invest; a.left += t.left;
      Object.keys(t.cats).forEach(function (c) { a.cats[c] = (a.cats[c] || 0) + t.cats[c]; });
    });
    var k = list.length || 1;
    ['income', 'expense', 'needs', 'invest', 'left'].forEach(function (f) { a[f] /= k; });
    Object.keys(a.cats).forEach(function (c) { a.cats[c] /= k; });
    return a;
  }
  function goalSaved(g) {
    return (+g.start || 0) + state.tx.reduce(function (s, t) { return s + (t.type === 'saving' && t.goalId === g.id ? t.amount : 0); }, 0);
  }
  function goalThisMonth(g, m) {
    return state.tx.reduce(function (s, t) { return s + (t.type === 'saving' && t.goalId === g.id && t.date.slice(0, 7) === m ? t.amount : 0); }, 0);
  }
  function goalNeed(g) {
    var rem = Math.max(0, g.target - goalSaved(g));
    if (!g.date || !rem) return 0;
    var n = Math.max(1, monthsBetween(ym(new Date()), g.date.slice(0, 7)) + 1);
    return rem / n;
  }
  function emergencyTarget() { var a = averages(3); return Math.round((a.needs || a.expense) * 3 / 100) * 100; }
  function totalInvested() { return state.tx.reduce(function (s, t) { return s + (t.type === 'invest' ? t.amount : 0); }, 0); }

  /* what to do with the money that is still unassigned this month */
  function suggestions(left) {
    var out = [], rem = Math.floor(left), now = ym(new Date());
    if (rem < 1) return out;
    var em = state.goals.filter(function (g) { return g.kind === 'emergency'; })[0];
    var emGap = em ? Math.max(0, em.target - goalSaved(em)) : 0;
    if (!em) {
      out.push({ kind: 'newEmergency', title: 'Start an emergency fund', why: 'A cushion of about 3 months of essentials comes before investing.', amount: Math.round(rem * 0.5) });
      rem -= Math.round(rem * 0.5);
    } else if (emGap > 0) {
      var a = Math.min(Math.round(rem * 0.5), Math.ceil(emGap));
      out.push({ kind: 'goal', goalId: em.id, title: em.name, why: money(emGap) + ' to go until your cushion is full.', amount: a });
      rem -= a;
    }
    state.goals.filter(function (g) { return g.kind !== 'emergency' && g.date && goalSaved(g) < g.target; })
      .sort(function (x, y) { return x.date < y.date ? -1 : 1; })
      .forEach(function (g) {
        var need = Math.ceil(goalNeed(g) - goalThisMonth(g, now));
        var amt = Math.min(need, rem);
        if (amt >= 1) { out.push({ kind: 'goal', goalId: g.id, title: g.name, why: 'Keeps you on pace for ' + monthName(g.date.slice(0, 7)) + '.', amount: amt }); rem -= amt; }
      });
    if (rem >= 1) {
      out.push({ kind: 'invest', title: 'Invest the rest', why: em && emGap <= 0 ? 'Your cushion is full, so this money can work long term.' : 'Long-term money, once the cushion is growing.', amount: rem });
    }
    return out;
  }

  /* ---------- sample data ---------- */
  function sampleData() {
    var s = blank(), seed = 7, now = new Date(), cur = ym(now), start = addMonths(cur, -5);
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    function between(a, b) { return Math.round(a + rnd() * (b - a)); }
    function add(type, amount, category, date, note, extra) { var t = { id: uid(), type: type, amount: amount, category: category, date: date, note: note || '' }; if (extra) Object.assign(t, extra); s.tx.push(t); return t; }
    s.settings.sample = true;
    s.goals = [
      { id: 'g-em', name: 'Emergency fund', kind: 'emergency', target: 9000, start: 2500, date: '' },
      { id: 'g-trip', name: 'Summer trip', target: 3000, start: 400, date: addMonths(cur, 8) + '-01' }
    ];
    s.budgets = { Groceries: 450, 'Dining out': 200, Transport: 180, Shopping: 200, Entertainment: 100 };
    add('income', 4800, 'Salary', start + '-01', 'Monthly pay', { recurring: true });
    add('expense', 1450, 'Housing', start + '-02', 'Rent', { recurring: true });
    add('expense', 85, 'Utilities', start + '-05', 'Internet and phone', { recurring: true });
    add('expense', 32, 'Subscriptions', start + '-08', 'Streaming and music', { recurring: true });
    add('expense', 120, 'Insurance', start + '-10', 'Health insurance', { recurring: true });
    add('saving', 300, '', start + '-03', 'Automatic transfer', { recurring: true, goalId: 'g-em' });
    add('invest', 400, 'Index funds', start + '-04', 'Monthly buy', { recurring: true });
    for (var i = 0; i <= 5; i++) {
      var m = addMonths(start, i), last = m === cur ? now.getDate() : daysIn(m);
      var day = function () { return m + '-' + pad(between(1, last)); };
      var k;
      for (k = 0; k < 5; k++) add('expense', between(55, 135), 'Groceries', day(), 'Supermarket');
      for (k = 0; k < 3; k++) add('expense', between(18, 68), 'Dining out', day(), ['Dinner out', 'Lunch', 'Coffee and pastry'][k]);
      for (k = 0; k < 2; k++) add('expense', between(28, 75), 'Transport', day(), ['Fuel', 'Transit pass'][k]);
      add('expense', between(60, 110), 'Utilities', day(), 'Electricity and water');
      if (rnd() > 0.3) add('expense', between(40, 190), 'Shopping', day(), 'Clothes and home');
      add('expense', between(20, 75), 'Entertainment', day(), 'Cinema and games');
      if (rnd() > 0.6) add('expense', between(30, 120), 'Health', day(), 'Pharmacy');
      if (rnd() > 0.55) add('income', between(350, 900), 'Freelance', day(), 'Side project');
      if (m !== cur) add('saving', 150, '', m + '-15', 'Trip savings', { goalId: 'g-trip' });
    }
    return s;
  }

  /* ---------- shell ---------- */
  var VIEWS = [['overview', 'Overview', 'home'], ['transactions', 'Transactions', 'list'], ['budgets', 'Budgets', 'gauge'], ['goals', 'Goals', 'target'], ['invest', 'Invest', 'trend'], ['prefs', 'Settings', 'gear']];
  function shell() {
    $('#app').innerHTML =
      '<div class="shell"><aside class="side"><div class="brand"><span class="brand-mark">' + icon('leaf') + '</span>Savings</div>' +
      '<nav class="nav" aria-label="Sections">' + VIEWS.map(function (v) { return '<a href="#' + v[0] + '" data-nav="' + v[0] + '">' + icon(v[2]) + v[1] + '</a>'; }).join('') + '</nav>' +
      '<p class="side-foot">Your data stays in this browser. Back it up from Settings.</p></aside>' +
      '<main class="main"><div class="wrap"><header class="top" id="top"></header><div id="banner"></div><div id="view" class="stack"></div></div></main>' +
      '<nav class="tabs" aria-label="Sections">' + VIEWS.slice(0, 5).map(function (v) { return '<a href="#' + v[0] + '" data-nav="' + v[0] + '">' + icon(v[2]) + v[1] + '</a>'; }).join('') + '</nav></div>' +
      '<div id="modal"></div><div id="toast" hidden role="status"></div><div id="tip" hidden></div>';
  }
  function render() {
    var meta = VIEWS.filter(function (v) { return v[0] === view; })[0];
    document.querySelectorAll('[data-nav]').forEach(function (a) { if (a.dataset.nav === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    var monthly = view === 'overview' || view === 'transactions' || view === 'budgets';
    $('#top').innerHTML = '<h1>' + meta[1] + '</h1>' +
      (monthly ? '<div class="month"><button class="icon-btn" data-act="month" data-d="-1" aria-label="Previous month">' + icon('left') + '</button><span>' + monthName(month) + '</span>' +
        '<button class="icon-btn" data-act="month" data-d="1" aria-label="Next month"' + (month >= ym(new Date()) ? ' disabled' : '') + '>' + icon('right') + '</button></div>' : '') +
      '<button class="btn primary" data-act="add">' + icon('plus') + 'Add</button>' +
      '<a class="icon-btn only-mobile" href="#prefs" aria-label="Settings">' + icon('gear') + '</a>';
    $('#banner').innerHTML =
      (state.settings.sample ? '<div class="banner"><p><b>These are example numbers</b>, so you can see how everything works. Nothing here is yours yet.</p><button class="btn small primary" data-act="startFresh">Start with my own data</button></div>' : '') +
      (!storageOk ? '<div class="banner"><p><b>This browser is not saving data.</b> Private windows and blocked site storage lose everything on close. Export a backup from Settings.</p></div>' : '');
    var v = $('#view');
    v.innerHTML = ({ overview: vOverview, transactions: vTransactions, budgets: vBudgets, goals: vGoals, invest: vInvest, prefs: vPrefs }[view])();
    if (view === 'overview') drawFlow();
    if (view === 'invest') drawProjection();
  }

  /* ---------- overview ---------- */
  function vOverview() {
    var t = totals(month), prev = totals(addMonths(month, -1)), isNow = month === ym(new Date());
    if (!t.count) {
      return '<div class="card empty"><h2>Nothing recorded for ' + monthName(month) + '</h2><p>Add your income and what you spent. The rest of this page builds itself from that.</p><button class="btn primary" data-act="add">' + icon('plus') + 'Add a transaction</button></div>' + flowCard();
    }
    var base = Math.max(t.income, t.expense + t.put, 1);
    var seg = function (v, c) { return v > 0 ? '<i style="flex:' + (v / base) + ';background:' + c + '"></i>' : ''; };
    var heroText;
    if (t.left >= 0) {
      heroText = (isNow ? 'Still free to save or invest this month. ' : 'Left unassigned that month. ') +
        'You earned ' + money(t.income) + ', spent ' + money(t.expense) + (t.put ? ' and already put away ' + money(t.put) : '') + '.';
    } else {
      heroText = 'Spending, saving and investing add up to more than your income this month. ' +
        'Money out is ' + money(t.expense + t.put) + ' against ' + money(t.income) + ' in.';
    }
    var hero = '<section class="hero"><div><div class="hero-label">' + (t.left >= 0 ? 'Left to save or invest' : 'Over your income by') + '</div>' +
      '<div class="hero-num num' + (t.left < 0 ? ' neg' : '') + '">' + money(Math.abs(t.left)) + '</div></div>' +
      '<p class="hero-text">' + heroText + '</p>' +
      '<div class="alloc" role="img" aria-label="How this month\'s income is used">' + seg(t.expense, COLORS.expense) + seg(t.saving, COLORS.saving) + seg(t.invest, COLORS.invest) + (t.left > 0 ? '<i style="flex:' + (t.left / base) + ';background:var(--s-rest)"></i>' : '') + '</div>' +
      '<div class="legend">' + lg(COLORS.expense, 'Spent', t.expense) + lg(COLORS.saving, 'Saved', t.saving) + lg(COLORS.invest, 'Invested', t.invest) + lg('var(--s-rest)', 'Unassigned', Math.max(0, t.left)) + '</div></section>';

    var rate = t.income ? t.put / t.income : 0, prate = prev.income ? prev.put / prev.income : 0;
    var kpis = '<div class="kpis">' +
      kpi('Income', money(t.income), delta(t.income, prev.income, prev.count)) +
      kpi('Spent', money(t.expense), delta(t.expense, prev.expense, prev.count)) +
      kpi('Saved and invested', money(t.put), delta(t.put, prev.put, prev.count)) +
      kpi('Savings rate', t.income ? pct(rate) : 'n/a', prev.count && prev.income ? pct(prate) + ' last month' : 'of income put away') + '</div>';

    return hero + kpis +
      '<div class="grid-2"><div class="stack">' + planCard(t, isNow) + flowCard() + '</div><div class="stack">' + catCard(t) + guideCard(t) + '</div></div>' + recentCard();
  }
  function lg(c, label, v) { return '<span><i class="dot" style="background:' + c + '"></i>' + label + ' <b>' + money(v) + '</b></span>'; }
  function kpi(k, v, d) { return '<div class="kpi"><div class="k">' + k + '</div><div class="v num">' + v + '</div><div class="d">' + d + '</div></div>'; }
  function delta(a, b, has) {
    if (!has || !b) return 'no earlier month to compare';
    var d = (a - b) / b;
    if (Math.abs(d) < 0.005) return 'same as last month';
    return (d > 0 ? '▲ ' : '▼ ') + pct(Math.abs(d)) + ' vs last month';
  }
  function planCard(t, isNow) {
    var body;
    if (!isNow) {
      body = '<p class="muted">Suggestions appear for the current month. Go to ' + monthName(ym(new Date())) + ' to plan what is left.</p>';
    } else if (t.left < 1) {
      var over = Object.keys(t.cats).filter(function (c) { return state.budgets[c] && t.cats[c] > state.budgets[c]; });
      body = '<p class="muted">' + (t.left < 0 ? 'Nothing is left to assign. ' : 'Every unit of income has a job this month. ') +
        (over.length ? 'Over budget in ' + esc(over.join(', ')) + '.' : (t.left < 0 ? 'Look at the largest categories on the right for room to cut.' : '')) + '</p>';
    } else {
      body = '<div>' + suggestions(t.left).map(function (s, i) {
        return '<div class="plan-row"><div><div class="t" style="font-weight:600">' + esc(s.title) + '</div><div class="small muted">' + esc(s.why) + '</div></div>' +
          '<div class="num" style="font-weight:700">' + money(s.amount) + '</div><button class="btn small" data-act="applyPlan" data-i="' + i + '">Record it</button></div>';
      }).join('') + '</div><p class="small muted" style="margin-top:14px">A starting point based on your goals, not financial advice.</p>';
    }
    return '<section class="card"><div class="card-head"><h2>A plan for what is left</h2></div>' + body + '</section>';
  }
  function flowCard() {
    return '<section class="card"><div class="card-head"><h2>Income and spending, last 6 months</h2>' +
      '<div class="legend"><span><i class="dot" style="background:var(--s-income)"></i>Income</span><span><i class="dot" style="background:var(--s-spent)"></i>Spent</span></div></div>' +
      '<div class="chart" id="flow"></div></section>';
  }
  function catCard(t) {
    var cats = Object.keys(t.cats).sort(function (a, b) { return t.cats[b] - t.cats[a]; });
    if (!cats.length) return '<section class="card"><div class="card-head"><h2>Where the money went</h2></div><p class="muted">No expenses this month.</p></section>';
    var max = t.cats[cats[0]];
    return '<section class="card"><div class="card-head"><h2>Where the money went</h2><span class="sub">' + pct(t.income ? t.expense / t.income : 0) + ' of income</span></div><div class="rows">' +
      cats.slice(0, 8).map(function (c) {
        var b = +state.budgets[c] || 0, over = b && t.cats[c] > b;
        return '<div class="row"><div class="t">' + esc(c) + (over ? ' <span class="pill bad">Over budget</span>' : '') + '</div><div class="amt">' + money(t.cats[c]) + '</div>' +
          '<div class="bar"><i class="' + (over ? 'over' : '') + '" style="width:' + (t.cats[c] / max * 100) + '%"></i></div></div>';
      }).join('') + '</div>' + (cats.length > 8 ? '<p class="small muted" style="margin-top:12px">And ' + (cats.length - 8) + ' smaller categories.</p>' : '') + '</section>';
  }
  function guideCard(t) {
    if (!t.income) return '';
    var rows = [['Needs', t.needs, 0.5, 'Housing, food, bills', false], ['Wants', t.wants, 0.3, 'Dining, fun, shopping', false], ['Saving and investing', t.put, 0.2, 'Money put away', true]];
    return '<section class="card"><div class="card-head"><h2>The 50 / 30 / 20 check</h2><span class="sub">share of income</span></div><div class="guide">' +
      rows.map(function (r) {
        var share = r[1] / t.income, ok = r[4] ? share >= r[2] : share <= r[2];
        return '<div class="row" style="border:0;padding:0"><div><span class="t">' + r[0] + '</span> <span class="pill ' + (ok ? 'good' : 'warn') + '">' + (ok ? '✓ On track' : (r[4] ? '! Below guide' : '! Above guide')) + '</span><div class="s">' + r[3] + ' · guide ' + pct(r[2]) + '</div></div>' +
          '<div class="amt">' + pct(share) + '</div><div class="bar"><i class="accent" style="width:' + Math.min(100, share * 100) + '%"></i><u style="left:' + r[2] * 100 + '%" title="Guide"></u></div></div>';
      }).join('') + '</div></section>';
  }
  function recentCard() {
    var list = state.tx.filter(function (t) { return t.date.slice(0, 7) === month; }).sort(byDate).slice(0, 6);
    if (!list.length) return '';
    return '<section class="card"><div class="card-head"><h2>Latest activity</h2><a href="#transactions" class="small">See all</a></div><div>' + list.map(function (t) { return txRow(t, false); }).join('') + '</div></section>';
  }
  function byDate(a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }

  /* ---------- transactions ---------- */
  function txRow(t, actions) {
    var sign = t.type === 'income' ? '+' : '−';
    return '<div class="tx"><div class="date">' + dayLabel(t.date) + '</div>' +
      '<div><div class="t" style="font-weight:500"><i class="tx-dot" style="background:' + COLORS[t.type] + '"></i>' + esc(txLabel(t)) + (repeats(t) ? ' <span class="pill">Monthly</span>' : '') + '</div>' +
      '<div class="small muted">' + TYPES[t.type] + (t.note ? ' · ' + esc(t.note) : '') + '</div></div>' +
      '<div class="amt num' + (t.type === 'income' ? ' pos' : '') + '" style="font-weight:700">' + sign + money(t.amount, true) + '</div>' +
      (actions ? '<div class="acts"><button class="icon-btn" data-act="edit" data-id="' + t.id + '" aria-label="Edit">' + icon('edit') + '</button><button class="icon-btn" data-act="del" data-id="' + t.id + '" aria-label="Delete">' + icon('trash') + '</button></div>' : '') + '</div>';
  }
  function vTransactions() {
    var all = state.tx.filter(function (t) { return t.date.slice(0, 7) === month; });
    var cats = {}; all.forEach(function (t) { cats[txLabel(t)] = 1; });
    var head = '<section class="card"><div class="filters">' +
      '<input type="search" id="f-q" placeholder="Search notes and categories" value="' + esc(filters.q) + '" aria-label="Search">' +
      '<select id="f-type" aria-label="Type"><option value="">All types</option>' + Object.keys(TYPES).map(function (k) { return '<option value="' + k + '"' + (filters.type === k ? ' selected' : '') + '>' + TYPES[k] + '</option>'; }).join('') + '</select>' +
      '<select id="f-cat" aria-label="Category"><option value="">All categories</option>' + Object.keys(cats).sort().map(function (c) { return '<option' + (filters.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div id="tx-list" style="margin-top:14px">' + txList(all) + '</div></section>';
    return head + '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn small" data-act="importCsv">Import from CSV</button><button class="btn small" data-act="exportCsv">Export all as CSV</button></div>';
  }
  function txList(all) {
    all = all || state.tx.filter(function (t) { return t.date.slice(0, 7) === month; });
    var q = filters.q.trim().toLowerCase();
    var list = all.filter(function (t) {
      if (filters.type && t.type !== filters.type) return false;
      if (filters.cat && txLabel(t) !== filters.cat) return false;
      if (q && (txLabel(t) + ' ' + (t.note || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(byDate);
    if (!all.length) return '<div class="empty"><p>No transactions in ' + monthName(month) + ' yet.</p><button class="btn primary" data-act="add">' + icon('plus') + 'Add the first one</button></div>';
    if (!list.length) return '<div class="empty"><p>Nothing matches these filters.</p></div>';
    var sum = list.reduce(function (s, t) { return s + (t.type === 'income' ? t.amount : -t.amount); }, 0);
    return list.map(function (t) { return txRow(t, true); }).join('') + '<p class="small muted" style="margin-top:12px">' + list.length + ' shown · net ' + money(sum, true) + '</p>';
  }

  /* ---------- budgets ---------- */
  function vBudgets() {
    var t = totals(month), cats = expenseCats(), budgeted = 0, spentIn = 0;
    cats.forEach(function (c) { var b = +state.budgets[c] || 0; if (b) { budgeted += b; spentIn += t.cats[c] || 0; } });
    var sum = '<div class="kpis">' + kpi('Budgeted', money(budgeted), 'across your limits') + kpi('Spent in budgets', money(spentIn), budgeted ? pct(spentIn / budgeted) + ' used' : 'set a limit below') +
      kpi('Left in budgets', money(budgeted - spentIn), budgeted - spentIn < 0 ? 'over in total' : 'still available') + kpi('Income this month', money(t.income), t.income ? pct(budgeted / t.income) + ' is budgeted' : 'none recorded') + '</div>';
    var rows = cats.map(function (c) {
      var b = +state.budgets[c] || 0, s = t.cats[c] || 0, share = b ? s / b : 0;
      var status = !b ? '' : share > 1 ? '<span class="pill bad">! Over by ' + money(s - b) + '</span>' : share > 0.85 ? '<span class="pill warn">! Almost used</span>' : '<span class="pill good">✓ ' + money(b - s) + ' left</span>';
      return '<div class="bud"><div><span class="t" style="font-weight:500">' + esc(c) + '</span> ' + status + '<div class="small muted">' + money(s) + ' spent' + (b ? ' of ' + money(b) : '') + '</div></div>' +
        '<input type="number" inputmode="decimal" min="0" step="any" placeholder="No limit" value="' + (b || '') + '" data-budget="' + esc(c) + '" id="bud-' + esc(c.replace(/\W+/g, '-')) + '" aria-label="Monthly limit for ' + esc(c) + '">' +
        (b ? '<div class="bar"><i class="' + (share > 1 ? 'over' : 'accent') + '" style="width:' + Math.min(100, share * 100) + '%"></i></div>' : '') + '</div>';
    }).join('');
    return sum + '<section class="card"><div class="card-head"><h2>Monthly limits</h2><button class="btn small" data-act="suggestBudgets">Fill from my averages</button></div>' +
      '<p class="small muted" style="margin-bottom:8px">Type a limit next to any category. Limits repeat every month.</p>' + rows + '</section>';
  }

  /* ---------- goals ---------- */
  function vGoals() {
    var hasEm = state.goals.some(function (g) { return g.kind === 'emergency'; });
    var cards = state.goals.map(function (g) {
      var saved = goalSaved(g), share = g.target ? Math.min(1, saved / g.target) : 0, need = goalNeed(g), done = saved >= g.target;
      var line = done ? '<span class="pill good">✓ Reached</span>' :
        g.date ? 'Put in ' + money(Math.ceil(need)) + ' a month to get there by ' + monthName(g.date.slice(0, 7)) + '.' : money(g.target - saved) + ' to go. Add a date to see a monthly amount.';
      return '<section class="card goal"><div class="card-head" style="margin:0"><h2>' + esc(g.name) + '</h2>' + (g.kind === 'emergency' ? '<span class="pill">Safety cushion</span>' : '') + '</div>' +
        '<div><span class="big num">' + money(saved) + '</span> <span class="muted">of ' + money(g.target) + '</span></div>' +
        '<div class="bar"><i class="accent" style="width:' + share * 100 + '%"></i></div><p class="small muted">' + pct(share) + ' there. ' + line + '</p>' +
        '<div class="goal-acts"><button class="btn small primary" data-act="fund" data-id="' + g.id + '">Add money</button><button class="btn small" data-act="editGoal" data-id="' + g.id + '">Edit</button><button class="btn small danger" data-act="delGoal" data-id="' + g.id + '">Delete</button></div></section>';
    }).join('');
    var em = hasEm ? '' : '<div class="banner" style="background:var(--accent-soft)"><p><b>No emergency fund yet.</b> Three months of your essential costs is about ' + money(emergencyTarget() || 0) + '. It is the first thing to build before investing.</p><button class="btn small primary" data-act="newEmergency">Create it</button></div>';
    return em + (cards ? '<div class="grid-even">' + cards + '</div>' : '<div class="card empty"><h2>No goals yet</h2><p>A goal gives your savings a name, a target and a date.</p></div>') +
      '<div><button class="btn" data-act="newGoal">' + icon('plus') + 'New goal</button></div>';
  }

  /* ---------- invest ---------- */
  function planValues() {
    var a = averages(3), p = state.plan;
    return {
      start: p.start != null ? p.start : Math.round(totalInvested()),
      monthly: p.monthly != null ? p.monthly : Math.max(0, Math.round(a.invest + Math.max(0, a.left))),
      rate: p.rate != null ? p.rate : 6,
      years: p.years != null ? p.years : 20
    };
  }
  function project(p) {
    var pts = [{ y: 0, paid: p.start, value: p.start }], bal = p.start, paid = p.start, r = p.rate / 100 / 12;
    for (var m = 1; m <= p.years * 12; m++) {
      bal = bal * (1 + r) + p.monthly; paid += p.monthly;
      if (m % 12 === 0) pts.push({ y: m / 12, paid: paid, value: bal });
    }
    return pts;
  }
  function vInvest() {
    var a = averages(3), p = planValues();
    var f = function (id, label, val, hint, attrs) { return '<label class="field">' + label + '<input type="number" inputmode="decimal" id="p-' + id + '" data-plan="' + id + '" value="' + val + '" ' + (attrs || 'min="0" step="any"') + '><span class="hint">' + hint + '</span></label>'; };
    return '<div class="kpis">' + kpi('Invested so far', money(totalInvested()), 'everything you recorded') + kpi('Invested per month', money(a.invest), a.months ? 'average of last ' + a.months + ' months' : 'no full month yet') +
      kpi('Usually left over', money(Math.max(0, a.left)), 'unassigned per month') + kpi('Could invest monthly', money(a.invest + Math.max(0, a.left)), 'if the leftover joined in') + '</div>' +
      '<section class="card"><div class="card-head"><h2>What regular investing could become</h2></div><div class="form-grid">' +
      f('start', 'Starting amount', p.start, 'already invested') + f('monthly', 'Added each month', p.monthly, 'your contribution') +
      f('rate', 'Yearly return, %', p.rate, 'an assumption, not a promise', 'min="0" max="30" step="0.5"') + f('years', 'Years', p.years, 'how long it stays invested', 'min="1" max="60" step="1"') + '</div>' +
      '<div class="outcomes" id="outcomes" style="margin:18px 0"></div>' +
      '<div class="legend" style="margin-bottom:8px"><span><i class="dot" style="background:var(--s-income)"></i>What you put in</span><span><i class="dot" style="background:var(--s-saved)"></i>Growth</span></div>' +
      '<div class="chart" id="proj"></div>' +
      '<p class="small muted" style="margin-top:14px">An illustration with a constant return, compounded monthly, before inflation, taxes and fees. Real markets go up and down and you can lose money. This is not financial advice.</p></section>';
  }

  /* ---------- settings ---------- */
  function vPrefs() {
    var custom = state.settings.cats.map(function (c, i) {
      return '<div class="row"><div class="t">' + esc(c.name) + ' <span class="pill">' + (c.need ? 'Need' : 'Want') + '</span></div><button class="btn small danger" data-act="delCat" data-i="' + i + '">Remove</button></div>';
    }).join('');
    return '<div class="grid-even"><section class="card"><div class="card-head"><h2>Currency</h2></div><label class="field">Show amounts in<select id="s-cur">' +
      CURRENCIES.map(function (c) { return '<option' + (c === state.settings.currency ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select><span class="hint">Changes the symbol only. Amounts are not converted.</span></label></section>' +
      '<section class="card"><div class="card-head"><h2>Your own expense categories</h2></div>' + (custom ? '<div class="rows" style="margin-bottom:14px">' + custom + '</div>' : '') +
      '<form data-form="cat" style="display:flex;flex-direction:column;gap:10px"><input type="text" id="c-name" name="name" placeholder="For example: Pets" maxlength="30" aria-label="Category name">' +
      '<label class="check"><input type="checkbox" id="c-need" name="need">This is an essential cost (a need)</label><div><button class="btn small">Add category</button></div></form></section></div>' +
      '<section class="card"><div class="card-head"><h2>Your data</h2></div><p class="muted" style="max-width:65ch;margin-bottom:14px">Everything is stored in this browser on this device. Nothing is sent anywhere. Keep a backup so that clearing the browser or switching devices does not lose it.</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" data-act="backup">Back up</button><button class="btn" data-act="restore">Restore a backup</button><button class="btn" data-act="loadSample">Load example data</button><button class="btn danger" data-act="wipe">Erase everything</button></div></section>';
  }

  /* ---------- charts ---------- */
  function niceMax(v) {
    if (v <= 0) return 100;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 8 ? 8 : 10) * p;
  }
  function axis(W, H, m, max) {
    var s = '';
    for (var i = 0; i <= 4; i++) {
      var y = m.t + (H - m.t - m.b) * (1 - i / 4);
      s += '<line class="grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y + '" y2="' + y + '"' + (i ? ' stroke-dasharray="2 4"' : '') + '/><text x="' + (m.l - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + compact(max * i / 4) + '</text>';
    }
    return s;
  }
  function topRound(x, y, w, h) {
    var r = Math.min(4, w / 2, h);
    return 'M' + x + ' ' + (y + h) + 'V' + (y + r) + 'q0 -' + r + ' ' + r + ' -' + r + 'h' + (w - 2 * r) + 'q' + r + ' 0 ' + r + ' ' + r + 'V' + (y + h) + 'z';
  }
  function drawFlow() {
    var el = $('#flow'); if (!el) return;
    var W = Math.max(280, el.clientWidth), H = 220, m = { l: 52, r: 6, t: 10, b: 26 };
    var data = []; for (var i = 5; i >= 0; i--) { var mm = addMonths(month, -i), t = totals(mm); t.m = mm; data.push(t); }
    var max = niceMax(Math.max.apply(null, data.map(function (d) { return Math.max(d.income, d.expense); })));
    var pw = W - m.l - m.r, ph = H - m.t - m.b, gw = pw / data.length, bw = Math.min(24, gw * 0.3);
    var s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Income and spending for the last six months">' + axis(W, H, m, max);
    data.forEach(function (d, i) {
      var cx = m.l + gw * i + gw / 2, hi = d.income / max * ph, he = d.expense / max * ph;
      s += '<rect class="band" data-i="' + i + '" x="' + (m.l + gw * i) + '" y="' + m.t + '" width="' + gw + '" height="' + ph + '" fill="transparent"/>';
      if (hi > 0) s += '<path d="' + topRound(cx - bw - 1, m.t + ph - hi, bw, hi) + '" fill="var(--s-income)" pointer-events="none"/>';
      if (he > 0) s += '<path d="' + topRound(cx + 1, m.t + ph - he, bw, he) + '" fill="var(--s-spent)" pointer-events="none"/>';
      s += '<text x="' + cx + '" y="' + (H - 7) + '" text-anchor="middle">' + monthName(d.m, true) + '</text>';
    });
    el.innerHTML = s + '</svg>';
    hover(el, function (e) {
      var b = e.target.closest ? e.target.closest('.band') : null; if (!b) return null;
      var d = data[+b.dataset.i];
      el.querySelectorAll('.band').forEach(function (x) { x.setAttribute('fill', x === b ? 'var(--surface-2)' : 'transparent'); });
      return '<b>' + monthName(d.m) + '</b>' + tr('var(--s-income)', 'Income', d.income) + tr('var(--s-spent)', 'Spent', d.expense) + tr('var(--s-saved)', 'Saved', d.saving) + tr('var(--s-invest)', 'Invested', d.invest) + tr('var(--s-rest)', 'Unassigned', d.left);
    }, function () { el.querySelectorAll('.band').forEach(function (x) { x.setAttribute('fill', 'transparent'); }); });
  }
  function tr(c, label, v) { return '<div class="tr"><span><i class="dot" style="background:' + c + '"></i>' + label + '</span><b>' + money(v) + '</b></div>'; }
  function drawProjection() {
    var el = $('#proj'); if (!el) return;
    var p = planValues(), pts = project(p), end = pts[pts.length - 1];
    $('#outcomes').innerHTML = kpi('Value after ' + p.years + ' years', money(end.value), 'at ' + p.rate + '% a year') + kpi('You put in', money(end.paid), money(p.monthly) + ' a month') + kpi('Growth', money(end.value - end.paid), end.paid ? pct((end.value - end.paid) / end.paid) + ' on top of your money' : '');
    var W = Math.max(280, el.clientWidth), H = 260, m = { l: 58, r: 12, t: 12, b: 26 };
    var max = niceMax(end.value), pw = W - m.l - m.r, ph = H - m.t - m.b;
    var X = function (y) { return m.l + pw * y / p.years; }, Y = function (v) { return m.t + ph * (1 - v / max); };
    var top = pts.map(function (d) { return X(d.y) + ' ' + Y(d.value); }), mid = pts.map(function (d) { return X(d.y) + ' ' + Y(d.paid); });
    var s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Projected value over ' + p.years + ' years">' + axis(W, H, m, max) +
      '<path d="M' + mid.join('L') + 'L' + X(p.years) + ' ' + Y(0) + 'L' + X(0) + ' ' + Y(0) + 'z" fill="var(--s-income)" fill-opacity=".85"/>' +
      '<path d="M' + top.join('L') + 'L' + mid.slice().reverse().join('L') + 'z" fill="var(--s-saved)" fill-opacity=".85"/>' +
      '<path d="M' + mid.join('L') + '" fill="none" stroke="var(--surface)" stroke-width="2"/>' +
      '<path d="M' + top.join('L') + '" fill="none" stroke="var(--s-saved)" stroke-width="2"/>' +
      '<circle cx="' + X(p.years) + '" cy="' + Y(end.value) + '" r="4.5" fill="var(--s-saved)" stroke="var(--surface)" stroke-width="2"/>';
    var step = p.years <= 10 ? 1 : p.years <= 25 ? 5 : 10;
    for (var y = 0; y <= p.years; y += step) s += '<text x="' + X(y) + '" y="' + (H - 7) + '" text-anchor="' + (y === 0 ? 'start' : 'middle') + '">' + (y === 0 ? 'Now' : y + 'y') + '</text>';
    s += '<line id="cross" x1="0" x2="0" y1="' + m.t + '" y2="' + (m.t + ph) + '" stroke="var(--ink-3)" stroke-width="1" visibility="hidden"/></svg>';
    el.innerHTML = s;
    hover(el, function (e) {
      var r = el.getBoundingClientRect(), i = Math.round((e.clientX - r.left - m.l) / pw * p.years);
      i = Math.max(0, Math.min(p.years, i)); var d = pts[i], c = $('#cross', el);
      c.setAttribute('x1', X(i)); c.setAttribute('x2', X(i)); c.setAttribute('visibility', 'visible');
      return '<b>' + (i ? 'After ' + i + (i === 1 ? ' year' : ' years') : 'Today') + '</b>' + tr('var(--s-income)', 'Put in', d.paid) + tr('var(--s-saved)', 'Growth', d.value - d.paid) + '<div class="tr"><span>Total</span><b>' + money(d.value) + '</b></div>';
    }, function () { var c = $('#cross', el); if (c) c.setAttribute('visibility', 'hidden'); });
  }
  function hover(el, html, leave) {
    var tip = $('#tip');
    el.onpointermove = el.onpointerdown = function (e) {
      var h = html(e); if (!h) { tip.hidden = true; return; }
      tip.innerHTML = h; tip.hidden = false;
      var w = tip.offsetWidth, x = e.clientX + 14, y = e.clientY + 14;
      if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
      tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.min(y, window.innerHeight - tip.offsetHeight - 8) + 'px';
    };
    el.onpointerleave = function () { tip.hidden = true; leave(); };
  }

  /* ---------- modals ---------- */
  function modal(title, body, foot) {
    $('#modal').innerHTML = '<div class="scrim" data-scrim><div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="modal-head"><h2>' + esc(title) + '</h2><button class="icon-btn" data-act="close" aria-label="Close">' + icon('x') + '</button></div>' + body + (foot || '') + '</div></div>';
    var f = $('#modal [autofocus]') || $('#modal input, #modal textarea'); if (f) f.focus();
  }
  function closeModal() { $('#modal').innerHTML = ''; }
  function catOptions(type, sel) {
    if (type === 'saving') {
      return '<option value="">General savings</option>' + state.goals.map(function (g) { return '<option value="' + g.id + '"' + (sel === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('');
    }
    return catsFor(type).map(function (c) { return '<option' + (c === sel ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
  }
  function txModal(t) {
    var isNew = !t.id, d = t.date || (month === ym(new Date()) ? today() : month + '-01');
    modal(isNew ? 'Add a transaction' : 'Edit transaction',
      '<form data-form="tx" style="display:flex;flex-direction:column;gap:14px"><input type="hidden" name="id" value="' + (t.id || '') + '">' +
      '<div class="seg" role="radiogroup" aria-label="Type">' + Object.keys(TYPES).map(function (k) { return '<label><input type="radio" name="type" value="' + k + '"' + (t.type === k ? ' checked' : '') + '>' + TYPES[k] + '</label>'; }).join('') + '</div>' +
      '<div class="two"><label class="field">Amount<input type="number" inputmode="decimal" name="amount" id="t-amount" min="0" step="any" required autofocus value="' + (t.amount || '') + '" placeholder="0.00"></label>' +
      '<label class="field">Date<input type="date" name="date" id="t-date" required value="' + d + '"></label></div>' +
      '<label class="field"><span id="t-catlabel">' + (t.type === 'saving' ? 'Goal' : 'Category') + '</span><select name="category" id="t-cat">' + catOptions(t.type, t.type === 'saving' ? t.goalId : t.category) + '</select></label>' +
      '<label class="field">Note <input type="text" name="note" id="t-note" maxlength="80" value="' + esc(t.note || '') + '" placeholder="Optional"></label>' +
      '<label class="check"><input type="checkbox" name="recurring" id="t-rec"' + (repeats(t) ? ' checked' : '') + '>Repeats every month</label>' +
      '<p class="err" id="t-err" hidden></p><div class="modal-foot"><button type="button" class="btn" data-act="close">Cancel</button><button class="btn primary">' + (isNew ? 'Add' : 'Save') + '</button></div></form>');
  }
  function goalModal(g) {
    modal(g.id ? 'Edit goal' : 'New goal',
      '<form data-form="goal" style="display:flex;flex-direction:column;gap:14px"><input type="hidden" name="id" value="' + (g.id || '') + '"><input type="hidden" name="kind" value="' + (g.kind || '') + '">' +
      '<label class="field">Name<input type="text" name="name" id="g-name" required maxlength="40" autofocus value="' + esc(g.name || '') + '" placeholder="For example: New car"></label>' +
      '<div class="two"><label class="field">Target amount<input type="number" inputmode="decimal" name="target" id="g-target" min="1" step="any" required value="' + (g.target || '') + '"></label>' +
      '<label class="field">Already saved<input type="number" inputmode="decimal" name="start" id="g-start" min="0" step="any" value="' + (g.start || '') + '" placeholder="0"></label></div>' +
      '<label class="field">Target date <input type="date" name="date" id="g-date" value="' + (g.date || '') + '"><span class="hint">Optional. With a date you get a monthly amount.</span></label>' +
      '<div class="modal-foot"><button type="button" class="btn" data-act="close">Cancel</button><button class="btn primary">Save goal</button></div></form>');
  }
  function confirmModal(title, text, label, act) {
    modal(title, '<p class="muted">' + text + '</p>', '<div class="modal-foot"><button class="btn" data-act="close">Cancel</button><button class="btn danger" data-act="' + act + '">' + label + '</button></div>');
  }
  function textModal(title, intro, text, filename) {
    modal(title, '<p class="muted small">' + intro + '</p><textarea id="x-text" readonly aria-label="' + esc(title) + '">' + esc(text) + '</textarea>',
      '<div class="modal-foot"><button class="btn" data-act="copyText">Copy</button><button class="btn primary" data-act="download" data-name="' + filename + '">Download file</button></div>');
  }
  function pasteModal(title, intro, form) {
    modal(title, '<form data-form="' + form + '" style="display:flex;flex-direction:column;gap:12px"><p class="muted small">' + intro + '</p>' +
      '<input type="file" id="x-file" accept=".csv,.json,.txt,text/csv,application/json" aria-label="Choose a file"><textarea name="text" id="x-in" placeholder="Or paste the contents here" aria-label="Contents"></textarea>' +
      '<p class="err" id="x-err" hidden></p><div class="modal-foot"><button type="button" class="btn" data-act="close">Cancel</button><button class="btn primary">Import</button></div></form>');
  }
  function toast(msg, undo) {
    var t = $('#toast'); clearTimeout(toastTimer);
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button data-act="undo">Undo</button>' : '');
    t.hidden = false; toastTimer = setTimeout(function () { t.hidden = true; undoState = null; }, undo ? 6000 : 2600);
  }
  function snapshot() { undoState = JSON.stringify(state); }
  function commit(msg, undo) { save(); render(); if (msg) toast(msg, undo); }

  /* ---------- CSV ---------- */
  function toCsv() {
    var q = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return 'date,type,category,amount,note\n' + state.tx.slice().sort(byDate).reverse().map(function (t) { return [t.date, t.type, txLabel(t), t.amount, t.note || ''].map(q).join(','); }).join('\n');
  }
  function parseCsv(text) {
    var rows = [], row = [], cur = '', inq = false, sep = (text.split('\n')[0].split(';').length > text.split('\n')[0].split(',').length) ? ';' : ',';
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inq) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inq = false; } else cur += c; }
      else if (c === '"') inq = true;
      else if (c === sep) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(function (x) { return x.trim(); })) rows.push(row); row = []; }
      else cur += c;
    }
    row.push(cur); if (row.some(function (x) { return x.trim(); })) rows.push(row);
    return rows;
  }
  function parseDate(s) {
    s = s.trim(); var m;
    if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/.exec(s))) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    if ((m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/.exec(s))) { var a = +m[1], b = +m[2]; if (b > 12) { var x = a; a = b; b = x; } return m[3] + '-' + pad(b) + '-' + pad(a); }
    return null;
  }
  function importCsv(text) {
    var rows = parseCsv(text); if (rows.length < 2) throw new Error('The file needs a header row and at least one transaction.');
    var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var col = function (names) { for (var i = 0; i < head.length; i++) for (var j = 0; j < names.length; j++) if (head[i].indexOf(names[j]) >= 0) return i; return -1; };
    var cd = col(['date']), ca = col(['amount', 'sum', 'value']), ct = col(['type']), cc = col(['category']), cn = col(['note', 'description', 'memo', 'details', 'payee']);
    if (cd < 0 || ca < 0) throw new Error('Could not find a "date" and an "amount" column in the first row.');
    var known = expenseCats().concat(INCOME_CATS, INVEST_CATS), n = 0;
    rows.slice(1).forEach(function (r) {
      var date = parseDate(r[cd] || ''), raw = parseFloat(String(r[ca] || '').replace(/[^\d.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
      if (!date || !isFinite(raw) || !raw) return;
      var type = ct >= 0 ? (r[ct] || '').trim().toLowerCase() : '';
      type = /^inc/.test(type) ? 'income' : /^sav/.test(type) ? 'saving' : /^inv/.test(type) ? 'invest' : /^exp/.test(type) ? 'expense' : (raw > 0 && ct < 0 && head.indexOf('type') < 0 && rows.some(function (x) { return parseFloat(x[ca]) < 0; }) ? 'income' : 'expense');
      var cat = cc >= 0 ? (r[cc] || '').trim() : '';
      var match = known.filter(function (k) { return k.toLowerCase() === cat.toLowerCase(); })[0];
      if (type === 'expense' && cat && !match) { state.settings.cats.push({ name: cat.slice(0, 30), need: false }); known.push(cat.slice(0, 30)); match = cat.slice(0, 30); }
      var t = { id: uid(), type: type, amount: Math.abs(raw), date: date, note: cn >= 0 ? (r[cn] || '').trim().slice(0, 80) : '', category: match || catsFor(type)[catsFor(type).length - 1] };
      if (type === 'saving') { t.category = ''; t.goalId = (state.goals.filter(function (g) { return g.name.toLowerCase() === cat.toLowerCase(); })[0] || {}).id || ''; }
      state.tx.push(t); n++;
    });
    if (!n) throw new Error('No rows with a readable date and amount were found.');
    return n;
  }

  /* ---------- actions ---------- */
  var pending = null;
  var actions = {
    add: function () { txModal({ type: view === 'invest' ? 'invest' : 'expense' }); },
    close: closeModal,
    month: function (b) { month = addMonths(month, +b.dataset.d); filters.cat = ''; render(); },
    edit: function (b) { var t = state.tx.filter(function (x) { return x.id === b.dataset.id; })[0]; if (t) txModal(t); },
    del: function (b) {
      var t = state.tx.filter(function (x) { return x.id === b.dataset.id; })[0]; if (!t) return;
      snapshot();
      if (t.recurOf) { var o = originOf(t); if (o) (o.skip = o.skip || []).push(t.date.slice(0, 7)); }
      state.tx = state.tx.filter(function (x) { return x.id !== t.id; });
      commit('Transaction deleted', true);
    },
    undo: function () { if (!undoState) return; state = JSON.parse(undoState); undoState = null; $('#toast').hidden = true; save(); render(); },
    applyPlan: function (b) {
      var s = suggestions(totals(month).left)[+b.dataset.i]; if (!s) return;
      snapshot();
      if (s.kind === 'newEmergency') {
        var g = { id: uid(), name: 'Emergency fund', kind: 'emergency', target: emergencyTarget() || s.amount * 6, start: 0, date: '' };
        state.goals.push(g); s.goalId = g.id;
      }
      if (s.kind === 'invest') state.tx.push({ id: uid(), type: 'invest', amount: s.amount, category: 'Index funds', date: today(), note: 'From this month\'s plan' });
      else state.tx.push({ id: uid(), type: 'saving', amount: s.amount, category: '', goalId: s.goalId, date: today(), note: 'From this month\'s plan' });
      commit('Recorded ' + money(s.amount), true);
    },
    startFresh: function () { confirmModal('Start with your own data?', 'The example numbers are removed and you begin with an empty planner.', 'Remove examples', 'doFresh'); },
    doFresh: function () { state = blank(); month = ym(new Date()); closeModal(); commit('Ready for your own numbers'); },
    loadSample: function () { confirmModal('Load example data?', 'This replaces everything currently in the planner with example numbers. Back up first if you want to keep your data.', 'Replace with examples', 'doSample'); },
    doSample: function () { state = sampleData(); materializeRecurring(); closeModal(); commit('Example data loaded'); },
    wipe: function () { confirmModal('Erase everything?', 'All transactions, budgets and goals on this device are deleted. This cannot be undone.', 'Erase everything', 'doFresh'); },
    suggestBudgets: function () {
      var a = averages(3); if (!a.months) return toast('Needs at least one full month of spending first');
      snapshot(); Object.keys(a.cats).forEach(function (c) { if (!state.budgets[c]) state.budgets[c] = Math.ceil(a.cats[c] / 10) * 10; });
      commit('Limits filled from your averages', true);
    },
    newGoal: function () { goalModal({}); },
    newEmergency: function () { goalModal({ name: 'Emergency fund', kind: 'emergency', target: emergencyTarget() || '' }); },
    editGoal: function (b) { var g = goalById(b.dataset.id); if (g) goalModal(g); },
    delGoal: function (b) { pending = b.dataset.id; confirmModal('Delete this goal?', 'The goal is removed. Money you already recorded for it stays in your transactions as general savings.', 'Delete goal', 'doDelGoal'); },
    doDelGoal: function () { state.goals = state.goals.filter(function (g) { return g.id !== pending; }); closeModal(); commit('Goal deleted'); },
    fund: function (b) { txModal({ type: 'saving', goalId: b.dataset.id }); },
    delCat: function (b) { state.settings.cats.splice(+b.dataset.i, 1); commit('Category removed'); },
    backup: function () { textModal('Back up your data', 'Save this file somewhere safe. Restore it from Settings on any device.', JSON.stringify(state), 'savings-backup-' + today() + '.json'); },
    exportCsv: function () { textModal('Export as CSV', 'Opens in Excel, Numbers or Google Sheets.', toCsv(), 'transactions-' + today() + '.csv'); },
    restore: function () { pasteModal('Restore a backup', 'Choose a backup file made by this planner. It replaces what is here now.', 'restore'); },
    importCsv: function () { pasteModal('Import from CSV', 'The first row must name the columns. Needed: <b>date</b> and <b>amount</b>. Optional: type, category, note. Without a type column, negative amounts count as expenses.', 'csv'); },
    copyText: function () {
      var ta = $('#x-text');
      var fallback = function () { ta.focus(); ta.select(); toast('Selected. Press Ctrl or Cmd + C to copy'); };
      try { navigator.clipboard.writeText(ta.value).then(function () { toast('Copied'); }, fallback); } catch (e) { fallback(); }
    },
    download: function (b) {
      try {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([$('#x-text').value], { type: 'text/plain' })); a.download = b.dataset.name;
        document.body.appendChild(a); a.click(); a.remove(); toast('If no download started, use Copy instead');
      } catch (e) { toast('Download is blocked here. Use Copy instead'); }
    }
  };

  var forms = {
    tx: function (f) {
      var amount = num(f.amount.value), err = $('#t-err');
      if (!(amount > 0)) { err.textContent = 'Enter an amount greater than zero.'; err.hidden = false; return; }
      if (!f.date.value) { err.textContent = 'Pick a date.'; err.hidden = false; return; }
      var type = f.type.value, t = f.id.value ? state.tx.filter(function (x) { return x.id === f.id.value; })[0] : null, isNew = !t;
      if (isNew) { t = { id: uid() }; state.tx.push(t); }
      t.type = type; t.amount = Math.round(amount * 100) / 100; t.date = f.date.value; t.note = f.note.value.trim();
      if (type === 'saving') { t.goalId = f.category.value; t.category = ''; } else { t.category = f.category.value; delete t.goalId; }
      var o = originOf(t) || (t.recurOf ? null : t);
      if (t.recurOf) { if (o) o.recurring = f.recurring.checked; } else t.recurring = f.recurring.checked;
      if (state.settings.sample === true && isNew) { /* keep the banner until the user clears examples */ }
      materializeRecurring();
      if (t.date.slice(0, 7) <= ym(new Date())) month = t.date.slice(0, 7);
      closeModal(); commit(isNew ? 'Added' : 'Saved');
    },
    goal: function (f) {
      var target = num(f.target.value); if (!(target > 0) || !f.name.value.trim()) return;
      var g = f.id.value ? goalById(f.id.value) : null;
      if (!g) { g = { id: uid() }; state.goals.push(g); }
      g.name = f.name.value.trim(); g.target = target; g.start = num(f.start.value); g.date = f.date.value || ''; g.kind = f.kind.value || undefined;
      closeModal(); commit('Goal saved');
    },
    cat: function (f) {
      var name = f.name.value.trim(); if (!name) return;
      if (expenseCats().some(function (c) { return c.toLowerCase() === name.toLowerCase(); })) return toast('That category already exists');
      state.settings.cats.push({ name: name, need: f.need.checked }); commit('Category added');
    },
    restore: function (f) {
      var err = $('#x-err'), s = null;
      try { s = normalize(JSON.parse(f.text.value)); } catch (e) { s = null; }
      if (!s) { err.textContent = 'This is not a backup from this planner. Choose the .json file you saved earlier.'; err.hidden = false; return; }
      s.settings.sample = false; state = s; materializeRecurring(); closeModal(); commit('Backup restored');
    },
    csv: function (f) {
      var err = $('#x-err');
      try { snapshot(); var n = importCsv(f.text.value); closeModal(); commit(n + ' transactions imported', true); }
      catch (e) { undoState = null; err.textContent = e.message; err.hidden = false; }
    }
  };

  /* ---------- events ---------- */
  function route() {
    var h = location.hash.replace('#', '');
    view = VIEWS.some(function (v) { return v[0] === h; }) ? h : 'overview';
    render(); window.scrollTo(0, 0);
  }
  function bind() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (b && actions[b.dataset.act]) { e.preventDefault(); actions[b.dataset.act](b); return; }
      if (e.target.hasAttribute && e.target.hasAttribute('data-scrim')) closeModal();
    });
    document.addEventListener('submit', function (e) {
      var f = e.target.closest('[data-form]'); if (!f) return;
      e.preventDefault(); forms[f.dataset.form](f);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t.name === 'type' && t.form && t.form.dataset.form === 'tx') { $('#t-cat').innerHTML = catOptions(t.value); $('#t-catlabel').textContent = t.value === 'saving' ? 'Goal' : 'Category'; }
      else if (t.dataset.budget) { var v = num(t.value); if (v > 0) state.budgets[t.dataset.budget] = v; else delete state.budgets[t.dataset.budget]; commit(); }
      else if (t.id === 's-cur') { state.settings.currency = t.value; commit('Currency changed'); }
      else if (t.id === 'f-type' || t.id === 'f-cat') { filters[t.id === 'f-type' ? 'type' : 'cat'] = t.value; $('#tx-list').innerHTML = txList(); }
      else if (t.id === 'x-file' && t.files[0]) { var r = new FileReader(); r.onload = function () { $('#x-in').value = r.result; }; r.readAsText(t.files[0]); }
    });
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (t.id === 'f-q') { filters.q = t.value; $('#tx-list').innerHTML = txList(); }
      else if (t.dataset.plan) {
        var v = num(t.value), k = t.dataset.plan;
        if (k === 'years') v = Math.max(1, Math.min(60, Math.round(v))); if (k === 'rate') v = Math.max(0, Math.min(30, v));
        state.plan[k] = Math.max(0, v); save(); drawProjection();
      }
    });
    window.addEventListener('hashchange', route);
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (view === 'overview') drawFlow(); if (view === 'invest') drawProjection(); }, 120); });
  }

  load(); shell(); bind(); route();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (view === 'overview') drawFlow(); });
})();
