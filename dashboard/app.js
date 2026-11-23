/* Launch Radar v2 — static dashboard. No network, no fetch: all data arrives
   in data.js as window.RADAR, written by main.ts from the sealed snapshot. */
(function () {
  'use strict';
  var R = window.RADAR;
  var app = document.getElementById('app');
  if (!R || !R.rows) { app.innerHTML = '<p class="loading">No radar data found.</p>'; return; }

  var params = new URLSearchParams(location.search);
  var state = {
    q: params.get('q') || '',
    cat: params.get('cat') || '',
    chain: params.get('chain') || '',
    minTvl: parseFloat(params.get('minTvl') || '0') || 0,
    watch: params.get('watch') === '1',
    status: params.get('status') || 'radar',
    sort: params.get('sort') || 'implied',
    dir: params.get('dir') || 'desc',
    detail: params.get('detail') || ''
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null || !isFinite(n)) return '—';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n == null || !isFinite(n)) return '—';
    var s = (n > 0 ? '+' : '') + n.toFixed(1) + '%';
    return '<span class="' + (n > 0 ? 'up' : n < 0 ? 'down' : 'flat') + '">' + s + '</span>';
  }
  function ageFmt(d) {
    if (d == null) return 'unknown';
    if (d < 30) return d + 'd';
    if (d < 365) return Math.round(d / 30) + 'mo';
    return (d / 365).toFixed(1) + 'y';
  }
  var VERDICT_CLASS = {
    'TOP FARM': 'v-top', 'WATCH': 'v-watch', 'COOLING': 'v-cool', 'EARLY': 'v-early',
    'LIVE': 'v-live', 'UNPRICED': 'v-unpriced', 'WRAPPED': 'v-wrap', 'VERSIONED': 'v-wrap',
    'BRIDGE': 'v-wrap', 'EXCHANGE': 'v-wrap'
  };
  function verdict(r) {
    return [VERDICT_CLASS[r.verdict] || 'v-early', r.verdict];
  }
  function oddsFmt(r) {
    if (r.token_status === 'live') return 'trades';
    return Math.round(r.token_odds * 100) + '%';
  }
  function medRatios(rows) {
    var a = rows.map(function (r) { return r.implied_per_tvl; }).sort(function (x, y) { return x - y; });
    return a.length ? a[Math.floor(a.length / 2)] : 0;
  }
  function syncUrl() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.cat) p.set('cat', state.cat);
    if (state.chain) p.set('chain', state.chain);
    if (state.minTvl) p.set('minTvl', String(state.minTvl));
    if (state.watch) p.set('watch', '1');
    if (state.status !== 'radar') p.set('status', state.status);
    if (state.sort !== 'implied' || state.dir !== 'desc') { p.set('sort', state.sort); p.set('dir', state.dir); }
    if (state.detail) p.set('detail', state.detail);
    var q = p.toString();
    history.replaceState(null, '', q ? '?' + q : location.pathname);
  }
  function filtered() {
    var q = state.q.trim().toLowerCase();
    var rows = R.rows.filter(function (r) {
      if (state.status === 'radar' && r.radar_rank == null) return false;
      if (state.status === 'pre-token' && r.token_status !== 'pre-token') return false;
      if (state.status === 'live' && r.token_status !== 'live') return false;
      if (state.status === 'token-unpriced' && r.token_status !== 'token-unpriced') return false;
      if (state.watch && !r.watchlist) return false;
      if (state.cat && (r.category || '(none)') !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort, d = state.dir === 'desc' ? -1 : 1;
    var val = {
      implied: function (r) { return r.implied_value_usd; },
      tvl: function (r) { return r.tvl_usd; },
      growth: function (r) { return r.change_7d == null ? -999 : r.change_7d; },
      ratio: function (r) { return r.implied_per_tvl; },
      odds: function (r) { return r.token_odds; },
      perhour: function (r) { return r.farm.cost_per_hour; },
      age: function (r) { return r.age_days == null ? -1 : r.age_days; },
      name: function (r) { return r.name.toLowerCase(); }
    }[key] || function (r) { return r.implied_value_usd; };
    rows.sort(function (a, b) {
      var va = val(a), vb = val(b);
      if (va < vb) return -1 * d;
      if (va > vb) return 1 * d;
      return a.slug < b.slug ? -1 : 1;
    });
    return rows;
  }
  function findRow(slug) {
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === slug) return R.rows[i];
    return null;
  }
  function comparables(r) {
    var sane = R.live.filter(function (l) { return l.mcap_per_tvl != null && l.mcap_per_tvl <= 10; });
    var same = sane.filter(function (l) { return l.category === r.category; }).slice(0, 3);
    var list = same.length ? same : sane.slice(0, 3);
    return {
      sameCategory: same.length > 0,
      html: list.map(function (l) {
        return '<b>' + esc(l.name) + '</b> — mcap ' + money(l.mcap_usd) + ' on TVL ' + money(l.tvl_usd) +
          ' (mcap/TVL ' + (l.mcap_per_tvl == null ? '—' : l.mcap_per_tvl.toFixed(2)) + ', ' + esc(l.category || 'uncategorised') + ')';
      }).join('<br>')
    };
  }
  function detailHtml(r) {
    var m = r.model;
    var base = Math.exp(m.intercept + m.tvl_exponent * Math.log(r.tvl_usd) + m.category_residual);
    var v = verdict(r);
    var f = r.farm;
    var steps = r.farm_steps.map(function (s, i) {
      var mm = s.match(/^(.*) Cost: (.*)\. Time: (.*)\.$/);
      var body = mm ? mm[1] : s, cost = mm ? mm[2] : '', time = mm ? mm[3] : '';
      return '<li><b>Step ' + (i + 1) + '.</b> ' + esc(body) + ' <span class="ct">Cost: ' + esc(cost) + ' · Time: ' + esc(time) + '</span></li>';
    }).join('');
    var statusLine = r.token_status === 'live'
      ? 'Its token already trades — market cap <b>' + money(r.mcap_usd) + '</b>, the market\u2019s own value, not a model estimate.'
      : r.token_status === 'token-unpriced'
        ? 'A token is recorded for it, but the snapshot carries no market cap — the value below is the model\u2019s estimate, not a market price.'
        : 'Records no token — no market cap, no CoinGecko id, no symbol.';
    var valueRows = r.token_status === 'live'
      ? '<tr><td>Market cap (the market\u2019s own value)</td><td><b>' + money(r.implied_value_usd) + '</b></td></tr>' +
        '<tr><td>Error band</td><td>none — this is the market\u2019s price, not a model estimate</td></tr>' +
        '<tr><td>What the model would imply</td><td>' + money(base * m.growth_multiplier * m.chain_multiplier * m.maturity_multiplier) + ' (for comparison only)</td></tr>'
      : '<tr><td>Implied token value</td><td><b>' + money(r.implied_value_usd) + '</b></td></tr>' +
        '<tr><td>Error band (held-out ×' + R.error_band_factor + ')</td><td>' + money(r.implied_low_usd) + ' – ' + money(r.implied_high_usd) + '</td></tr>' +
        '<tr><td>Token odds — ' + r.odds_group_tokens + ' of ' + r.odds_group_n + ' in ' + esc(r.category || 'uncategorised') + ' record a token</td><td>' + Math.round(r.token_odds * 100) + '% (shrunk toward ' + Math.round(R.global_token_rate * 100) + '% global)</td></tr>' +
        '<tr><td>Base from peers: exp(' + m.intercept + ' + ' + m.tvl_exponent + ' × ln TVL + residual)</td><td>' + money(base) + '</td></tr>';
    return '<section class="detail" id="detail"><button class="close-detail" id="closeDetail">Close ×</button>' +
      '<h2>' + esc(r.name) + ' <span class="verdict ' + v[0] + '">' + v[1] + '</span></h2>' +
      '<p class="meta">Global rank <b>#' + r.rank + '</b> of ' + R.board_size +
      (r.radar_rank != null ? ' · pre-token radar <b>#' + r.radar_rank + '</b> of ' + R.rankable_size : '') +
      ' · ' + esc(r.category || 'uncategorised') + ' · ' + esc(r.chains.join(', ') || 'no chain listed') +
      ' · TVL <b>' + money(r.tvl_usd) + '</b> · 7d ' + pct(r.change_7d) +
      ' · listed ' + esc(r.listed_at || 'unknown') + ' (' + ageFmt(r.age_days) + ') · ' +
      (r.watchlist ? '<b>On the $50M watchlist</b> · ' : 'Below the watchlist floor · ') + statusLine +
      (r.flags.length ? ' Flags: <b>' + esc(r.flags.join(', ')) + '</b>.' : '') + '</p>' +
      '<div class="grid"><div><h3>Value — how the model gets there</h3>' +
      '<table class="mini">' + valueRows +
      '<tr><td>Implied per $1 of TVL</td><td>' + r.implied_per_tvl.toFixed(3) + '×</td></tr>' +
      '<tr><td>Category residual (' + esc(r.category || 'none') + ', ' + m.category_peers + (m.category_peers === 1 ? ' peer' : ' peers') + ')</td><td>' + (m.category_residual >= 0 ? '+' : '') + m.category_residual.toFixed(3) + ' in log</td></tr>' +
      '<tr><td>Growth multiplier (7d ' + (r.change_7d == null ? 'n/a' : r.change_7d.toFixed(1) + '%') + ')</td><td>×' + m.growth_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td>Chains multiplier (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')</td><td>×' + m.chain_multiplier.toFixed(3) + '</td></tr>' +
      '<tr><td>Maturity multiplier (' + ageFmt(r.age_days) + ' old)</td><td>×' + m.maturity_multiplier.toFixed(3) + '</td></tr></table>' +
      '<h3>' + (comparables(r).sameCategory ? 'Token peers already trading — same category' : 'Nearest live comparables — no market-priced peer in this category') + '</h3><p class="peers">' + comparables(r).html + '</p></div>' +
      '<div><h3>Farm plan — 6 steps · $' + f.cost_usd + ' gas · $' + f.capital_usd + ' capital · ' + f.active_minutes + ' min active · $' + f.cost_per_hour.toFixed(2) + '/h</h3><ol class="farm">' + steps + '</ol>' +
      '<p class="note">Implied value is this radar\u2019s own claim from the snapshot\u2019s figures, not a prediction that a token launches, or when. A protocol that records no token may still have one its DefiLlama record does not carry. Farm plans are a reader\u2019s starting point: check the protocol\u2019s own pages, never pay to claim, and never put in more than you can lose.</p></div></div></section>';
  }
  function render() {
    var rows = filtered();
    var preRows = R.rows.filter(function (r) { return r.token_status === 'pre-token'; });
    var cats = [], chains = [];
    R.rows.forEach(function (r) {
      var c = r.category || '(none)';
      if (cats.indexOf(c) < 0) cats.push(c);
      r.chains.forEach(function (ch) { if (chains.indexOf(ch) < 0) chains.push(ch); });
    });
    cats.sort(); chains.sort();
    var h = R.held_out;
    var sel = state.detail ? findRow(state.detail) : null;
    var bandA = Math.exp(h[0].median_abs_log_error).toFixed(1);
    var bandB = Math.exp(h[1].median_abs_log_error).toFixed(1);
    var statusLabel = state.status === 'all' ? 'All 758 protocols' : state.status === 'live' ? 'Live tokens' : state.status === 'token-unpriced' ? 'Token recorded, no market cap' : state.status === 'pre-token' ? 'All pre-token protocols' : 'The pre-token radar';
    var html = '<header class="mast' + (sel ? ' compact' : '') + '"><div class="kicker">Token Launch Radar · Snapshot ' + esc(R.as_of) + ' · DefiLlama protocols</div>' +
      '<h1>LAUNCH RADAR <em>v2</em></h1>' +
      '<p class="dek">All <b>' + R.board_size + ' protocols</b> in the snapshot, ranked by the token value their figures imply — <b>' + R.pre_token_size +
      ' still pre-token</b>, ' + R.live_token_size + ' already trading, ' + R.unpriced_size + ' with a token recorded but no market cap. The pre-token radar below is the board\u2019s hero: every row carries its <b>token odds</b> from its category\u2019s record, its <b>held-out error band</b>, and a <b>farm plan costed in $/h</b>. Value fitted on <b>' + R.fit.peers + ' token peers</b> and <b>held-out tested twice</b> ' +
      '(median |log error| ' + h[0].median_abs_log_error + ' and ' + h[1].median_abs_log_error + '). No names are special-cased: the same formula scores every row.</p></header>' +
      (sel ? detailHtml(sel) : '') +
      '<section class="integrity" aria-label="Integrity strip"><h2>Read this first — what the numbers honestly mean</h2>' +
      '<p>Implied value is an <b>order-of-magnitude claim</b>. Held out twice, the model\u2019s typical miss is <b>' + bandA + '×</b> (split A) and <b>' + bandB + '×</b> (split B) — so every pre-token row shows its value as a <b>band, implied ÷ ' + R.error_band_factor + ' to implied × ' + R.error_band_factor + '</b>, not a point. ' +
      'Token odds are <b>base rates</b>: the share of protocols in the same category that record a token, shrunk toward the ' + Math.round(R.global_token_rate * 100) + '% global rate. They say how often lookalikes have tokens — never whether this one launches, or when. ' +
      'Live rows carry the market\u2019s own value, their market cap, and need no band. Farm $/h counts gas and fees per active hour; deployed capital is tracked apart, because capital stays yours and gas does not.</p></section>' +
      '<section class="stats" aria-label="Radar statistics">' +
      '<div class="stat"><div class="n">' + R.board_size + '</div><div class="l">Board rows</div><div class="s">' + R.pre_token_size + ' pre-token · ' + R.live_token_size + ' live · ' + R.unpriced_size + ' unpriced</div></div>' +
      '<div class="stat"><div class="n">' + money(R.total_implied_board) + '</div><div class="l">Total implied value</div><div class="s">' + money(R.total_implied_pretoken) + ' model-implied + ' + money(R.total_mcap_live) + ' live mcap</div></div>' +
      '<div class="stat"><div class="n">' + medRatios(preRows).toFixed(2) + '×</div><div class="l">Median implied / TVL</div><div class="s">pre-token rows · peer median ' + R.fit.global_median_ratio.toFixed(2) + '×</div></div>' +
      '<div class="stat"><div class="n">' + R.fit.peers + '</div><div class="l">Token peers fitted</div><div class="s">log mcap = ' + R.fit.intercept + ' + ' + R.fit.tvl_exponent + ' log TVL</div></div>' +
      '<div class="stat"><div class="n">' + h[0].median_abs_log_error + '</div><div class="l">Held-out A</div><div class="s">median |log error| · ' + Math.round(h[0].within_2x * 100) + '% within 2× · baseline ' + h[0].baseline_median_abs_log_error + '</div></div>' +
      '<div class="stat"><div class="n">' + h[1].median_abs_log_error + '</div><div class="l">Held-out B</div><div class="s">median |log error| · ' + Math.round(h[1].within_2x * 100) + '% within 2× · baseline ' + h[1].baseline_median_abs_log_error + '</div></div>' +
      '</section>' +
      '<div class="controls"><label for="q">Search</label><input type="search" id="q" placeholder="name, slug or category…" value="' + esc(state.q) + '">' +
      '<label for="status">Show</label><select id="status">' +
      [['radar', 'Pre-token radar'], ['pre-token', 'All pre-token'], ['all', 'All 758 protocols'], ['live', 'Live tokens'], ['token-unpriced', 'Token, no market cap']].map(function (o) {
        return '<option value="' + o[0] + '"' + (state.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select>' +
      '<label for="cat">Category</label><select id="cat"><option value="">All categories</option>' +
      cats.map(function (c) { return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<label for="chain">Chain</label><select id="chain"><option value="">All chains</option>' +
      chains.map(function (c) { return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<label for="minTvl">Min TVL</label><select id="minTvl">' +
      [[0, 'Any'], [50000000, '$50M'], [100000000, '$100M'], [500000000, '$500M'], [1000000000, '$1B']].map(function (o) {
        return '<option value="' + o[0] + '"' + (state.minTvl === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select>' +
      '<label class="chk"><input type="checkbox" id="watch" ' + (state.watch ? 'checked' : '') + '> Watchlist only</label>' +
      '<label for="sort">Sort</label><select id="sort">' +
      [['implied', 'Implied value'], ['tvl', 'TVL'], ['growth', '7d growth'], ['ratio', 'Implied / TVL'], ['odds', 'Token odds'], ['perhour', 'Farm $/h'], ['age', 'Age'], ['name', 'Name']].map(function (o) {
        return '<option value="' + o[0] + '"' + (state.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select>' +
      '<span class="count">' + rows.length + ' of ' + R.board_size + ' rows</span></div>' +
      '<h2 id="board-table">' + statusLabel + ' <span class="sub">ranked by implied value · click any row for its detail, odds, error band and costed farm plan</span></h2>' +
      '<div class="tablewrap"><table class="board"><thead><tr>' +
      '<th data-sort="implied">#</th><th data-sort="name">Protocol</th><th>Category</th><th>Chains</th>' +
      '<th class="num" data-sort="tvl">TVL</th><th class="num" data-sort="growth">7d</th>' +
      '<th class="num" data-sort="implied">Implied value</th><th class="num" data-sort="ratio">× TVL</th>' +
      '<th class="num" data-sort="odds">Token odds</th><th class="num" data-sort="perhour">Farm $/h</th><th>Verdict</th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (r) {
        var v = verdict(r);
        return '<tr data-slug="' + esc(r.slug) + '"' + (sel && sel.slug === r.slug ? ' class="sel"' : '') + '>' +
          '<td class="num">' + r.rank + '</td>' +
          '<td><span class="nm">' + esc(r.name) + '</span>' + (r.watchlist ? '<span class="tag wl">WATCHLIST</span>' : '') + (r.token_status === 'live' ? '<span class="tag lv">LIVE</span>' : r.token_status === 'token-unpriced' ? '<span class="tag up">UNPRICED</span>' : '') + '<br><span class="sl">' + esc(r.slug) + '</span></td>' +
          '<td>' + esc(r.category || '—') + '</td><td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
          '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + pct(r.change_7d) + '</td>' +
          '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td><td class="num">' + r.implied_per_tvl.toFixed(2) + '×</td>' +
          '<td class="num">' + oddsFmt(r) + '</td><td class="num">$' + r.farm.cost_per_hour.toFixed(2) + '/h</td>' +
          '<td><span class="verdict ' + v[0] + '">' + v[1] + '</span></td></tr>';
      }).join('') : '<tr><td colspan="11" class="empty">No protocols match these filters.</td></tr>') +
      '</tbody></table></div>' +
      '<h2>How the value was fitted <span class="sub">every term fitted on token peers, tested held-out twice</span></h2>' +
      '<section class="method"><p>The model is <code>implied = exp(a + b · ln TVL + category residual) × growth × chains × maturity</code>. ' +
      '<b>a</b> and <b>b</b> are the OLS fit of log market cap on log TVL over the ' + R.fit.peers + ' token-bearing peers (b = ' + R.fit.tvl_exponent +
      ': the mcap/TVL multiple shrinks as protocols grow). Each category\u2019s residual is its peers\u2019 median log-residual, shrunk toward zero by n/(n+' + R.fit.shrink_k +
      '), so thin categories barely move the value. Growth is clamped to −60%…+120% and weighted 0.5; chains multiply by 1 + 0.06·ln(chains); maturity runs 0.70 for a newborn protocol to 1.00 at 3 years.</p>' +
      '<table><thead><tr><th>Test</th><th>Train</th><th>Held out</th><th class="num">Median |log error|</th><th class="num">Within 2×</th><th class="num">Baseline median |log error|</th><th class="num">Baseline within 2×</th></tr></thead><tbody>' +
      h.map(function (s) {
        return '<tr><td>' + esc(s.name) + '</td><td class="num">' + s.train_peers + '</td><td class="num">' + s.test_peers + '</td><td class="num"><b>' + s.median_abs_log_error + '</b></td><td class="num">' + Math.round(s.within_2x * 100) + '%</td><td class="num">' + s.baseline_median_abs_log_error + '</td><td class="num">' + Math.round(s.baseline_within_2x * 100) + '%</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p>The baseline is a single global median mcap/TVL fitted on the same train peers. The fitted model beats it on both splits — but the honest reading is the size of the errors: a typical held-out market cap lands about e<sup>' + h[0].median_abs_log_error + '</sup> ≈ ' + bandA + '× away from the prediction. Implied value is an order-of-magnitude claim, and the board ranks protocols by it anyway, because ranking by TVL alone would crown the biggest protocol and ignore what the market pays per TVL dollar. That is why every pre-token row carries its band: implied ÷ ' + R.error_band_factor + ' to implied × ' + R.error_band_factor + '.</p>' +
      '<p><b>Token odds.</b> For each category, the share of its protocols that record a token, shrunk toward the ' + Math.round(R.global_token_rate * 100) + '% global rate by n/(n+10) — the same shrinkage as the value model\u2019s category residuals. A pre-token Dexs protocol, for example, inherits the record of the Dexs already trading. The odds are a base rate among lookalikes, never a prediction that this protocol launches, or when. Rows whose token already exists score 100%.</p>' +
      '<p><b>Costed farm plans.</b> Every step carries its gas and fees in dollars and its active minutes; the plan totals them into capital deployed, gas spent, active minutes and $ per active hour. The weekly step repeats for the whole hold (30–60 days, so 5–9 weeks), and its cost and time are the weekly figures times the weeks. Capital is tracked apart from cost: it stays the farmer\u2019s, gas does not. Holding time is not active time.</p>' +
      '<p>Each row\u2019s verdict follows from its token status and, for rankable pre-token rows, the same two signals: <b>TOP FARM</b> is a top-10 pre-token radar rank, or an implied/TVL of 0.50× or more, with 7-day growth at or above zero; <b>COOLING</b> is 7-day growth below −10%; <b>WATCH</b> is an implied/TVL of 0.30× or more, or a top-40 radar rank; everything else is <b>EARLY</b>. <b>LIVE</b> rows already trade; <b>UNPRICED</b> rows record a token with no market cap in the snapshot; <b>WRAPPED</b>, <b>VERSIONED</b>, <b>BRIDGE</b> and <b>EXCHANGE</b> rows are not launches to farm.</p>' +
      '<p class="note">What the board is not: it does not predict whether or when a token launches. It says what a token would be worth if the protocol\u2019s record stayed as it is. A protocol that “records no token” may still have one its DefiLlama record does not carry. Live rows show the market\u2019s own value, their market cap, beside the pre-token radar — never mixed into it: the “Show” filter switches between the pre-token radar, the live tokens and the full 758. Farm plans are a reader\u2019s starting point: check the protocol\u2019s own pages, never pay to claim, and never put in more than you can lose.</p></section>' +
      '<footer>Launch Radar v2 · snapshot ' + esc(R.as_of) + ' · ' + esc(R.source) + ' · floor $' + R.floor_usd.toLocaleString('en-US') + ' · built from the sealed snapshot only, no network at runtime.</footer>';
    app.innerHTML = html;
    app.setAttribute('aria-busy', 'false');
    bind();
  }
  function bind() {
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; syncUrl(); render(); var nq = document.getElementById('q'); nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); });
    var st = document.getElementById('status');
    if (st) st.addEventListener('change', function () { state.status = st.value; state.detail = ''; syncUrl(); render(); });
    var cat = document.getElementById('cat');
    if (cat) cat.addEventListener('change', function () { state.cat = cat.value; syncUrl(); render(); });
    var chain = document.getElementById('chain');
    if (chain) chain.addEventListener('change', function () { state.chain = chain.value; syncUrl(); render(); });
    var minTvl = document.getElementById('minTvl');
    if (minTvl) minTvl.addEventListener('change', function () { state.minTvl = parseFloat(minTvl.value) || 0; syncUrl(); render(); });
    var watch = document.getElementById('watch');
    if (watch) watch.addEventListener('change', function () { state.watch = watch.checked; syncUrl(); render(); });
    var sort = document.getElementById('sort');
    if (sort) sort.addEventListener('change', function () { state.sort = sort.value; syncUrl(); render(); });
    var close = document.getElementById('closeDetail');
    if (close) close.addEventListener('click', function () { state.detail = ''; syncUrl(); render(); });
    var rows = app.querySelectorAll('table.board tbody tr[data-slug]');
    rows.forEach(function (tr) {
      tr.addEventListener('click', function () {
        state.detail = tr.getAttribute('data-slug');
        syncUrl(); render();
        var d = document.getElementById('detail');
        if (d) d.scrollIntoView();
      });
    });
    var ths = app.querySelectorAll('table.board th[data-sort]');
    ths.forEach(function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-sort');
        if (state.sort === k) state.dir = state.dir === 'desc' ? 'asc' : 'desc';
        else { state.sort = k; state.dir = 'desc'; }
        var s = document.getElementById('sort');
        if (s) s.value = state.sort;
        syncUrl(); render();
      });
    });
  }
  render();
})();
