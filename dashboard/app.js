(function () {
  'use strict';

  var data = window.TOKEN_RADAR;
  if (!data || !Array.isArray(data.rows)) {
    document.getElementById('lede').textContent =
      'No radar data loaded. Run main.ts so data.js is written beside dashboard/.';
    return;
  }

  var state = {
    tab: 'board',
    sortKey: 'rank',
    sortDir: 1,
    selected: null,
    q: '',
    category: '',
    chain: '',
    minTvl: 0,
    watchOnly: false,
  };

  var boardBody = document.getElementById('boardBody');
  var detail = document.getElementById('detail');
  var boardMeta = document.getElementById('boardMeta');
  var catSel = document.getElementById('category');
  var chainSel = document.getElementById('chain');

  function money(n) {
    if (n == null || !isFinite(n)) return '—';
    if (Math.abs(n) >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + String(Math.round(n));
  }

  function pct(n) {
    if (n == null || !isFinite(n)) return '—';
    var s = (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
    return s;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function uniqueSorted(values) {
    var map = Object.create(null);
    for (var i = 0; i < values.length; i++) {
      if (values[i]) map[values[i]] = true;
    }
    return Object.keys(map).sort();
  }

  function fillFilters() {
    var cats = uniqueSorted(data.rows.map(function (r) { return r.category; }));
    var chains = uniqueSorted(
      data.rows.reduce(function (acc, r) {
        return acc.concat(r.chains || []);
      }, [])
    );
    cats.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c;
      o.textContent = c;
      catSel.appendChild(o);
    });
    chains.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c;
      o.textContent = c;
      chainSel.appendChild(o);
    });
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return data.rows.filter(function (r) {
      if (state.watchOnly && !r.watchlist) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) === -1) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (q) {
        var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function sortRows(rows) {
    var key = state.sortKey;
    var dir = state.sortDir;
    return rows.slice().sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      if (key === 'chains') {
        av = (a.chains || []).join(',');
        bv = (b.chains || []).join(',');
      }
      if (key === 'name' || key === 'category' || key === 'chains') {
        av = av == null ? '' : String(av).toLowerCase();
        bv = bv == null ? '' : String(bv).toLowerCase();
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return a.rank - b.rank;
      }
      av = av == null ? -Infinity : Number(av);
      bv = bv == null ? -Infinity : Number(bv);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return a.rank - b.rank;
    });
  }

  function renderBoard() {
    var rows = sortRows(filtered());
    if (!rows.length) {
      boardBody.innerHTML =
        '<tr class="empty-row"><td colspan="8">No protocols match these filters. Try Reset or widen Min TVL / category.</td></tr>';
    } else {
      boardBody.innerHTML = rows
        .map(function (r) {
          var chgClass = r.change_7d == null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
          var wl = r.watchlist ? '<span class="pill">watch</span>' : '';
          var selected = state.selected === r.slug ? ' is-selected' : '';
          return (
            '<tr data-slug="' +
            esc(r.slug) +
            '" class="' +
            selected.trim() +
            '" tabindex="0">' +
            '<td class="num">' +
            r.rank +
            '</td>' +
            '<td class="name">' +
            esc(r.name) +
            wl +
            '</td>' +
            '<td>' +
            esc(r.category || '—') +
            '</td>' +
            '<td>' +
            esc((r.chains || []).slice(0, 3).join(', ') || '—') +
            '</td>' +
            '<td class="num">' +
            money(r.tvl_usd) +
            '</td>' +
            '<td class="num ' +
            chgClass +
            '">' +
            pct(r.change_7d) +
            '</td>' +
            '<td class="num accent-num">' +
            money(r.implied_value_usd) +
            '</td>' +
            '<td class="num">' +
            money(Math.round(r.score)) +
            '</td>' +
            '</tr>'
          );
        })
        .join('');
    }
    boardMeta.textContent =
      rows.length +
      ' shown · ' +
      data.rows.length +
      ' on board · ' +
      data.watchlist.length +
      ' watchlist · as of ' +
      data.as_of;
  }

  function factorBar(label, text, width) {
    var w = Math.max(4, Math.min(100, Math.round(width * 100)));
    return (
      '<div class="factor"><span>' +
      esc(label) +
      '</span><div class="bar"><i style="width:' +
      w +
      '%"></i></div><span class="num">' +
      esc(text) +
      '</span></div>'
    );
  }

  function signedMoney(n) {
    if (n == null || !isFinite(n)) return '—';
    var abs = money(Math.abs(n));
    if (n > 0) return '+' + abs;
    if (n < 0) return '-' + abs.slice(1);
    return abs;
  }

  function renderDetail(slug) {
    var r = null;
    for (var i = 0; i < data.rows.length; i++) {
      if (data.rows[i].slug === slug) {
        r = data.rows[i];
        break;
      }
    }
    if (!r) {
      detail.innerHTML =
        '<p class="detail-empty">Select a row to inspect metrics, value breakdown, and farm plan.</p>';
      return;
    }
    var b = r.breakdown || {};
    var denom = Math.max(1, Math.abs(b.raw_score || r.implied_value_usd || 1));
    var baseW = Math.abs(b.base_usd || 0) / denom;
    var momW = Math.abs(b.momentum_usd || 0) / denom + 0.08;
    var matW = Math.abs(b.maturity_usd || 0) / denom + 0.08;
    var steps = (r.farm_steps || [])
      .map(function (s) {
        return '<li>' + esc(s) + '</li>';
      })
      .join('');
    detail.innerHTML =
      '<h2>' +
      esc(r.name) +
      '</h2>' +
      '<p class="sub">#' +
      r.rank +
      ' · ' +
      esc(r.slug) +
      (r.watchlist ? ' · watchlist' : '') +
      '</p>' +
      '<div class="metrics">' +
      '<div class="metric"><b>Implied value</b><span>' +
      money(r.implied_value_usd) +
      '</span></div>' +
      '<div class="metric"><b>TVL</b><span>' +
      money(r.tvl_usd) +
      '</span></div>' +
      '<div class="metric"><b>Category</b><span>' +
      esc(r.category || '—') +
      '</span></div>' +
      '<div class="metric"><b>7d change</b><span>' +
      pct(r.change_7d) +
      '</span></div>' +
      '<div class="metric"><b>Chains</b><span>' +
      esc((r.chains || []).join(', ') || '—') +
      '</span></div>' +
      '<div class="metric"><b>Listed</b><span>' +
      esc(r.listed_at || 'unknown') +
      '</span></div>' +
      '</div>' +
      '<div class="breakdown"><h3>Value breakdown</h3>' +
      '<p class="break-note">Each bar is that factor\'s dollar contribution toward the raw score.</p>' +
      factorBar(
        'Base',
        money(b.base_usd) + ' · k=' + (b.category_multiple || '—') + ' × TVL',
        baseW
      ) +
      factorBar(
        'Momentum',
        signedMoney(b.momentum_usd) +
          ' · ×' +
          (b.momentum_factor != null ? Number(b.momentum_factor).toFixed(3) : '1') +
          (b.momentum_pct == null ? '' : ' (' + pct(b.momentum_pct) + ')'),
        momW
      ) +
      factorBar(
        'Maturity',
        signedMoney(b.maturity_usd) +
          ' · ×' +
          (b.maturity_factor != null ? Number(b.maturity_factor).toFixed(3) : '1') +
          (b.days_without_token == null ? '' : ' · ' + b.days_without_token + 'd'),
        matW
      ) +
      factorBar('Raw score', money(Math.round(b.raw_score || r.score)), 1) +
      '</div>' +
      '<div class="plan"><h3>Farm plan</h3><ol>' +
      steps +
      '</ol></div>';
  }

  function renderLaunched() {
    var body = document.getElementById('launchedBody');
    var rows = data.launched || [];
    body.innerHTML = rows
      .map(function (r) {
        return (
          '<tr><td class="name">' +
          esc(r.name) +
          '</td><td class="num">' +
          esc(r.symbol || '—') +
          '</td><td>' +
          esc(r.category || '—') +
          '</td><td class="num">' +
          money(r.tvl_usd) +
          '</td><td class="num">' +
          money(r.mcap_usd) +
          '</td></tr>'
        );
      })
      .join('');
  }

  function renderMethod() {
    var m = data.methodology || {};
    var factors = (m.factors || [])
      .map(function (f) {
        return '<li><strong>' + esc(f.name) + ':</strong> ' + esc(f.detail) + '</li>';
      })
      .join('');
    document.getElementById('methodBody').innerHTML =
      '<h2>' +
      esc(m.title || 'Methodology') +
      '</h2>' +
      '<p>' +
      esc(m.summary || '') +
      '</p>' +
      '<p class="formula">' +
      esc(m.formula || '') +
      '</p>' +
      '<ul>' +
      factors +
      '</ul>';
  }

  function setTab(name) {
    state.tab = name;
    document.querySelectorAll('.tab').forEach(function (btn) {
      var on = btn.getAttribute('data-tab') === name;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    ['board', 'launched', 'method'].forEach(function (id) {
      var el = document.getElementById('panel-' + id);
      if (id === name) el.removeAttribute('hidden');
      else el.setAttribute('hidden', '');
    });
  }

  document.querySelectorAll('.tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setTab(btn.getAttribute('data-tab'));
    });
  });

  document.querySelectorAll('.board thead th').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      if (!key) return;
      if (state.sortKey === key) state.sortDir *= -1;
      else {
        state.sortKey = key;
        state.sortDir = key === 'name' || key === 'category' || key === 'chains' ? 1 : 1;
        if (key === 'rank') state.sortDir = 1;
        else if (key === 'name' || key === 'category' || key === 'chains') state.sortDir = 1;
        else state.sortDir = -1;
      }
      renderBoard();
    });
  });

  function selectSlug(slug) {
    if (!slug) return;
    state.selected = slug;
    renderBoard();
    renderDetail(state.selected);
  }

  boardBody.addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr[data-slug]');
    if (!tr) return;
    selectSlug(tr.getAttribute('data-slug'));
  });

  boardBody.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var tr = ev.target.closest('tr[data-slug]');
    if (!tr) return;
    ev.preventDefault();
    selectSlug(tr.getAttribute('data-slug'));
  });

  document.addEventListener('keydown', function (ev) {
    if (state.tab !== 'board') return;
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    var rows = sortRows(filtered());
    if (!rows.length) return;
    var idx = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].slug === state.selected) {
        idx = i;
        break;
      }
    }
    if (ev.key === 'ArrowDown') idx = Math.min(rows.length - 1, idx + 1);
    else idx = Math.max(0, idx - 1);
    ev.preventDefault();
    selectSlug(rows[idx].slug);
    var el = boardBody.querySelector('tr[data-slug="' + rows[idx].slug + '"]');
    if (el) el.focus();
  });

  document.getElementById('q').addEventListener('input', function (e) {
    state.q = e.target.value;
    renderBoard();
  });
  catSel.addEventListener('change', function (e) {
    state.category = e.target.value;
    renderBoard();
  });
  chainSel.addEventListener('change', function (e) {
    state.chain = e.target.value;
    renderBoard();
  });
  document.getElementById('minTvl').addEventListener('input', function (e) {
    state.minTvl = Number(e.target.value || 0);
    renderBoard();
  });
  document.getElementById('watchOnly').addEventListener('change', function (e) {
    state.watchOnly = !!e.target.checked;
    renderBoard();
  });
  document.getElementById('resetFilters').addEventListener('click', function () {
    state.q = '';
    state.category = '';
    state.chain = '';
    state.minTvl = 0;
    state.watchOnly = false;
    document.getElementById('q').value = '';
    catSel.value = '';
    chainSel.value = '';
    document.getElementById('minTvl').value = '';
    document.getElementById('watchOnly').checked = false;
    renderBoard();
  });

  document.getElementById('lede').textContent =
    data.rows.length +
    ' pre-token protocols ranked by implied launch value · floor ' +
    money(data.floor_usd);
  document.getElementById('footAsOf').textContent = 'Snapshot as of ' + data.as_of;

  fillFilters();
  renderBoard();
  renderLaunched();
  renderMethod();
  if (data.rows[0]) {
    state.selected = data.rows[0].slug;
    renderBoard();
    renderDetail(state.selected);
  }
})();
