/* ─────────────────────────────────────────────────────────────────
   Analytics Dashboard — analytics.js
   Reads from localStorage("tradingJournal"), renders 9 charts
───────────────────────────────────────────────────────────────── */

// ── Load & Filter Data ────────────────────────────────────────────
function loadTrades() {
  try {
    const raw = localStorage.getItem('tradingJournal');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function filterByPeriod(trades, days) {
  if (!days || days === 'all') return trades;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - parseInt(days));
  const cutStr = cutoff.toISOString().slice(0, 10);
  return trades.filter(t => t.date >= cutStr);
}

// ── Format helpers ────────────────────────────────────────────────
function fmt$(n) {
  if (n === null || n === undefined || n === '') return '—';
  const abs = Math.abs(n);
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + '$' + s;
}

// ── Chart.js global defaults ──────────────────────────────────────
Chart.defaults.color = '#64748b';
Chart.defaults.borderColor = '#252a3a';
Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.padding = 16;

const COLORS = {
  green:     '#22c55e',
  red:       '#ef4444',
  accent:    '#6366f1',
  amber:     '#f59e0b',
  cyan:      '#06b6d4',
  pink:      '#ec4899',
  orange:    '#f97316',
  teal:      '#14b8a6',
  greenBg:   'rgba(34,197,94,0.15)',
  redBg:     'rgba(239,68,68,0.15)',
  accentBg:  'rgba(99,102,241,0.15)',
};

const PALETTE = [
  '#6366f1','#22c55e','#f59e0b','#ef4444',
  '#06b6d4','#ec4899','#f97316','#14b8a6',
  '#a78bfa','#84cc16'
];

// ── KPI Bar ───────────────────────────────────────────────────────
function renderKPIs(trades) {
  let total = 0, wins = 0, losses = 0, winSum = 0, lossSum = 0;
  let best = null;
  let peak = 0, drawdown = 0, running = 0;

  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  sorted.forEach(t => {
    const p = parseFloat(t.pnl) || 0;
    total += p;
    running += p;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > drawdown) drawdown = dd;
    if (t.outcome === 'WIN') { wins++; winSum += p; }
    if (t.outcome === 'LOSS') { losses++; lossSum += Math.abs(p); }
    if (best === null || p > best) best = p;
  });

  const winRate = trades.length ? Math.round((wins / trades.length) * 100) : 0;
  const pf      = lossSum > 0 ? (winSum / lossSum).toFixed(2) : wins > 0 ? '∞' : '—';
  const avgWin  = wins   ? winSum / wins   : null;
  const avgLoss = losses ? -(lossSum / losses) : null;

  const totalEl = document.getElementById('kTotal');
  totalEl.textContent = fmt$(total);
  totalEl.className = 'stat-value ' + (total >= 0 ? 'green' : 'red');

  document.getElementById('kWinRate').textContent  = `${winRate}%`;
  document.getElementById('kPF').textContent       = pf;
  document.getElementById('kAvgWin').textContent   = avgWin  !== null ? fmt$(avgWin)  : '—';
  document.getElementById('kAvgLoss').textContent  = avgLoss !== null ? fmt$(avgLoss) : '—';
  document.getElementById('kBest').textContent     = best    !== null ? fmt$(best)    : '—';
  document.getElementById('kDrawdown').textContent = drawdown > 0 ? '-' + fmt$(drawdown) : '$0.00';
  document.getElementById('kCount').textContent    = trades.length;

  // subtitle for cumulative chart
  document.getElementById('cumulSubtitle').textContent =
    total >= 0 ? `+${fmt$(total)} overall` : `${fmt$(total)} overall`;
  document.getElementById('cumulSubtitle').style.color =
    total >= 0 ? COLORS.green : COLORS.red;
}

// ── Chart instance registry (so we can destroy & redraw) ──────────
const chartInstances = {};
function makeChart(id, config) {
  if (chartInstances[id]) { chartInstances[id].destroy(); }
  const ctx = document.getElementById(id).getContext('2d');
  chartInstances[id] = new Chart(ctx, config);
}

// ── Tooltip shared style ──────────────────────────────────────────
const tooltipDefaults = {
  backgroundColor: '#1a1f2e',
  borderColor: '#252a3a',
  borderWidth: 1,
  titleColor: '#e2e8f0',
  bodyColor: '#94a3b8',
  padding: 10,
  cornerRadius: 8,
};

// ── 1. Cumulative PnL Line ────────────────────────────────────────
function chartCumulative(trades) {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  const labels = [], data = [], pointColors = [];
  sorted.forEach(t => {
    running += parseFloat(t.pnl) || 0;
    labels.push(t.date.slice(5));   // MM-DD
    data.push(parseFloat(running.toFixed(2)));
    pointColors.push(running >= 0 ? COLORS.green : COLORS.red);
  });

  makeChart('chartCumulative', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Cumulative PnL',
        data,
        borderColor: COLORS.accent,
        backgroundColor: (ctx) => {
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 220);
          g.addColorStop(0, 'rgba(99,102,241,0.3)');
          g.addColorStop(1, 'rgba(99,102,241,0)');
          return g;
        },
        fill: true,
        tension: 0.35,
        pointRadius: data.length > 60 ? 0 : 4,
        pointHoverRadius: 6,
        pointBackgroundColor: pointColors,
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { ...tooltipDefaults,
        callbacks: { label: ctx => ' ' + fmt$(ctx.parsed.y) }
      }},
      scales: {
        x: { grid: { color: '#252a3a' }, ticks: { maxTicksLimit: 12 } },
        y: { grid: { color: '#252a3a' },
          ticks: { callback: v => fmt$(v) }
        }
      }
    }
  });
}

// ── 2. Daily PnL Bar ─────────────────────────────────────────────
function chartDaily(trades) {
  // Aggregate by date
  const byDate = {};
  trades.forEach(t => {
    byDate[t.date] = (byDate[t.date] || 0) + (parseFloat(t.pnl) || 0);
  });
  const dates = Object.keys(byDate).sort();
  const values = dates.map(d => parseFloat(byDate[d].toFixed(2)));
  const colors = values.map(v => v >= 0 ? COLORS.greenBg : COLORS.redBg);
  const borders = values.map(v => v >= 0 ? COLORS.green : COLORS.red);

  makeChart('chartDaily', {
    type: 'bar',
    data: {
      labels: dates.map(d => d.slice(5)),
      datasets: [{
        label: 'Daily PnL',
        data: values,
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 1.5,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { ...tooltipDefaults,
        callbacks: { label: ctx => ' ' + fmt$(ctx.parsed.y) }
      }},
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 14 } },
        y: { grid: { color: '#252a3a' },
          ticks: { callback: v => fmt$(v) }
        }
      }
    }
  });
}

// ── 3. Outcome Donut ─────────────────────────────────────────────
function chartOutcome(trades) {
  const wins   = trades.filter(t => t.outcome === 'WIN').length;
  const losses = trades.filter(t => t.outcome === 'LOSS').length;
  const be     = trades.filter(t => t.outcome === 'BE').length;

  makeChart('chartOutcome', {
    type: 'doughnut',
    data: {
      labels: ['Wins', 'Losses', 'Breakeven'],
      datasets: [{
        data: [wins, losses, be],
        backgroundColor: [COLORS.greenBg, COLORS.redBg, 'rgba(245,158,11,0.15)'],
        borderColor:     [COLORS.green,   COLORS.red,   COLORS.amber],
        borderWidth: 2,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { ...tooltipDefaults,
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total ? Math.round(ctx.parsed / total * 100) : 0;
              return ` ${ctx.parsed} trades (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// ── 4. PnL by Symbol ─────────────────────────────────────────────
function chartSymbol(trades) {
  const map = {};
  trades.forEach(t => {
    if (!t.symbol) return;
    map[t.symbol] = (map[t.symbol] || 0) + (parseFloat(t.pnl) || 0);
  });
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(e => e[0]);
  const values = sorted.map(e => parseFloat(e[1].toFixed(2)));
  const colors = values.map(v => v >= 0 ? COLORS.greenBg : COLORS.redBg);
  const borders = values.map(v => v >= 0 ? COLORS.green : COLORS.red);

  makeChart('chartSymbol', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'PnL',
        data: values,
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 1.5,
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { ...tooltipDefaults,
        callbacks: { label: ctx => ' ' + fmt$(ctx.parsed.x) }
      }},
      scales: {
        x: { grid: { color: '#252a3a' }, ticks: { callback: v => fmt$(v) } },
        y: { grid: { display: false } }
      }
    }
  });
}

// ── 5. PnL by Setup ──────────────────────────────────────────────
function chartSetup(trades) {
  const map = {};
  trades.forEach(t => {
    const key = t.setup || 'Untagged';
    map[key] = (map[key] || 0) + (parseFloat(t.pnl) || 0);
  });
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(e => e[0]);
  const values = sorted.map(e => parseFloat(e[1].toFixed(2)));

  makeChart('chartSetup', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'PnL by Setup',
        data: values,
        backgroundColor: PALETTE.map(c => c + '26'),
        borderColor: PALETTE,
        borderWidth: 1.5,
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { ...tooltipDefaults,
        callbacks: { label: ctx => ' ' + fmt$(ctx.parsed.x) }
      }},
      scales: {
        x: { grid: { color: '#252a3a' }, ticks: { callback: v => fmt$(v) } },
        y: { grid: { display: false } }
      }
    }
  });
}

// ── 6. Quality vs PnL Scatter ────────────────────────────────────
function chartQuality(trades) {
  // Group by star rating, show avg PnL per rating
  const map = { 1:[], 2:[], 3:[], 4:[], 5:[] };
  trades.forEach(t => {
    const r = t.rating;
    if (r >= 1 && r <= 5) map[r].push(parseFloat(t.pnl) || 0);
  });
  const labels = ['★', '★★', '★★★', '★★★★', '★★★★★'];
  const values = [1,2,3,4,5].map(r => {
    const arr = map[r];
    if (!arr.length) return null;
    return parseFloat((arr.reduce((a,b) => a+b, 0) / arr.length).toFixed(2));
  });
  const colors = values.map(v => v === null ? 'transparent' : v >= 0 ? COLORS.greenBg : COLORS.redBg);
  const borders = values.map(v => v === null ? 'transparent' : v >= 0 ? COLORS.green : COLORS.red);

  makeChart('chartQuality', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Avg PnL',
        data: values,
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 1.5,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { ...tooltipDefaults,
        callbacks: {
          title: ctx => `${ctx[0].label} Rating`,
          label: ctx => ctx.parsed.y !== null ? ' Avg ' + fmt$(ctx.parsed.y) : ' No trades'
        }
      }},
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#252a3a' }, ticks: { callback: v => fmt$(v) } }
      }
    }
  });
}

// ── 7. Long vs Short ─────────────────────────────────────────────
function chartDirection(trades) {
  const longs  = trades.filter(t => t.direction === 'LONG');
  const shorts = trades.filter(t => t.direction === 'SHORT');
  const longPnl  = longs.reduce((s,t)  => s + (parseFloat(t.pnl)||0), 0);
  const shortPnl = shorts.reduce((s,t) => s + (parseFloat(t.pnl)||0), 0);

  makeChart('chartDirection', {
    type: 'doughnut',
    data: {
      labels: [`Long (${longs.length})`, `Short (${shorts.length})`],
      datasets: [{
        data: [Math.abs(longPnl), Math.abs(shortPnl)],
        backgroundColor: [COLORS.greenBg, COLORS.redBg],
        borderColor:     [COLORS.green,   COLORS.red],
        borderWidth: 2,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { ...tooltipDefaults,
          callbacks: {
            label: ctx => {
              const val = ctx.dataIndex === 0 ? longPnl : shortPnl;
              return ` ${fmt$(val)}`;
            }
          }
        }
      }
    }
  });
}

// ── 8. PnL by Weekday ────────────────────────────────────────────
function chartWeekday(trades) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const map  = { 0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] };
  trades.forEach(t => {
    if (!t.date) return;
    const dow = new Date(t.date + 'T00:00:00').getDay();
    map[dow].push(parseFloat(t.pnl) || 0);
  });
  const values = [0,1,2,3,4,5,6].map(d => {
    const arr = map[d];
    if (!arr.length) return 0;
    return parseFloat((arr.reduce((a,b) => a+b,0) / arr.length).toFixed(2));
  });
  const colors  = values.map(v => v >= 0 ? COLORS.greenBg   : COLORS.redBg);
  const borders = values.map(v => v >= 0 ? COLORS.green : COLORS.red);

  makeChart('chartWeekday', {
    type: 'bar',
    data: {
      labels: days,
      datasets: [{
        label: 'Avg PnL',
        data: values,
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 1.5,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { ...tooltipDefaults,
        callbacks: { label: ctx => ' Avg ' + fmt$(ctx.parsed.y) }
      }},
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#252a3a' }, ticks: { callback: v => fmt$(v) } }
      }
    }
  });
}

// ── 9. Monthly PnL ───────────────────────────────────────────────
function chartMonthly(trades) {
  const map = {};
  trades.forEach(t => {
    if (!t.date) return;
    const key = t.date.slice(0, 7); // YYYY-MM
    map[key] = (map[key] || 0) + (parseFloat(t.pnl) || 0);
  });
  const months = Object.keys(map).sort();
  const values = months.map(m => parseFloat(map[m].toFixed(2)));
  const colors  = values.map(v => v >= 0 ? COLORS.greenBg : COLORS.redBg);
  const borders = values.map(v => v >= 0 ? COLORS.green : COLORS.red);

  makeChart('chartMonthly', {
    type: 'bar',
    data: {
      labels: months.map(m => {
        const [y, mo] = m.split('-');
        return new Date(+y, +mo-1, 1).toLocaleString('default', { month: 'short', year: '2-digit' });
      }),
      datasets: [{
        label: 'Monthly PnL',
        data: values,
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 1.5,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { ...tooltipDefaults,
        callbacks: { label: ctx => ' ' + fmt$(ctx.parsed.y) }
      }},
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#252a3a' }, ticks: { callback: v => fmt$(v) } }
      }
    }
  });
}

// ── Master Render ─────────────────────────────────────────────────
function renderAll() {
  const allTrades = loadTrades();
  const period    = document.getElementById('periodSelect').value;
  const trades    = filterByPeriod(allTrades, period);

  const empty = document.getElementById('analyticsEmpty');
  const grid  = document.querySelector('.charts-grid');
  const kpi   = document.getElementById('kpiBar');

  if (!trades.length) {
    empty.style.display = 'flex';
    grid.style.display  = 'none';
    kpi.style.display   = 'none';
    return;
  }

  empty.style.display = 'none';
  grid.style.display  = 'grid';
  kpi.style.display   = '';

  renderKPIs(trades);
  chartCumulative(trades);
  chartDaily(trades);
  chartOutcome(trades);
  chartSymbol(trades);
  chartSetup(trades);
  chartQuality(trades);
  chartDirection(trades);
  chartWeekday(trades);
  chartMonthly(trades);
}

// ── Period filter change ──────────────────────────────────────────
document.getElementById('periodSelect').addEventListener('change', renderAll);

// ── Init ──────────────────────────────────────────────────────────
renderAll();
