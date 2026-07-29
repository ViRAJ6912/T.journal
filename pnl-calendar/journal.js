/* ─────────────────────────────────────────────────────────────────
   Trading Journal — journal.js
   Persists to localStorage under key "tradingJournal"
───────────────────────────────────────────────────────────────── */

// ── State ─────────────────────────────────────────────────────────
const STORAGE_KEY = 'tradingJournal';

let trades = [];           // array of trade objects
let editingId = null;      // id of trade being edited
let pendingDeleteId = null;// id queued for deletion
let activeFilter = 'ALL';
let activeRating = 0;
let activeDirection = 'LONG';
let activeOutcome = 'BE';

// ── Persistence ───────────────────────────────────────────────────
function loadTrades() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) trades = JSON.parse(raw);
  } catch (e) {
    trades = [];
  }
}

function saveTrades() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
  } catch {
    showToast('⚠️ Storage full — could not save');
  }
}

// ── Sync Journal → PnL Calendar ──────────────────────────────────
// Aggregates all journal trades by date and writes them into the
// calendar's localStorage key ("pnlCalendar").
// Days that have journal trades are fully overwritten.
// Days with no journal trades are left untouched (manual calendar entries survive).
function syncToCalendar() {
  const CAL_KEY = 'pnlCalendar';

  // Load existing calendar data (may have manual entries)
  let calData = {};
  try {
    const raw = localStorage.getItem(CAL_KEY);
    if (raw) calData = JSON.parse(raw);
  } catch { calData = {}; }

  // Remove all previously journal-synced days so stale data doesn't persist
  Object.keys(calData).forEach(k => {
    if (calData[k]._fromJournal) delete calData[k];
  });

  // Group trades by date
  const byDate = {};
  trades.forEach(t => {
    if (!t.date) return;
    if (!byDate[t.date]) byDate[t.date] = [];
    byDate[t.date].push(t);
  });

  // Aggregate each date
  Object.entries(byDate).forEach(([date, dayTrades]) => {
    const totalPnl   = dayTrades.reduce((sum, t) => sum + (parseFloat(t.pnl) || 0), 0);
    const tradeCount = dayTrades.length;
    // Build a compact symbol summary for the notes field
    const symbols    = [...new Set(dayTrades.map(t => t.symbol).filter(Boolean))];
    const noteStr    = symbols.join(', ');

    calData[date] = {
      pnl:          parseFloat(totalPnl.toFixed(2)),
      trades:       tradeCount,
      notes:        noteStr,
      _fromJournal: true   // marker so we can clean it up on next sync
    };
  });

  try {
    localStorage.setItem(CAL_KEY, JSON.stringify(calData));
  } catch { /* ignore storage errors for sync */ }
}

// ── ID Generation ─────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Format Helpers ────────────────────────────────────────────────
function fmt$(n) {
  if (n === null || n === undefined || n === '') return '—';
  const abs = Math.abs(n);
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + '$' + s;
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

// ── Stats ─────────────────────────────────────────────────────────
function renderStats() {
  const all = trades;
  if (!all.length) {
    ['statTotal','statWinRate','statTotal_trades','statAvgWin','statAvgLoss','statBest','statWorst','statPF'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = id === 'statTotal_trades' ? '0' : id === 'statWinRate' ? '0%' : id === 'statTotal' ? '$0.00' : '—';
    });
    return;
  }

  let total = 0, wins = 0, losses = 0, winSum = 0, lossSum = 0;
  let best = null, worst = null;

  all.forEach(t => {
    const p = parseFloat(t.pnl) || 0;
    total += p;
    if (t.outcome === 'WIN') { wins++; winSum += p; }
    if (t.outcome === 'LOSS') { losses++; lossSum += p; }
    if (best === null || p > best) best = p;
    if (worst === null || p < worst) worst = p;
  });

  const winRate = all.length ? Math.round((wins / all.length) * 100) : 0;
  const avgWin  = wins   ? winSum / wins     : 0;
  const avgLoss = losses ? lossSum / losses  : 0;
  const pf      = lossSum < 0 ? Math.abs(winSum / lossSum).toFixed(2) : '∞';

  const totalEl = document.getElementById('statTotal');
  totalEl.textContent = fmt$(total);
  totalEl.className = 'stat-value ' + (total >= 0 ? 'green' : 'red');

  document.getElementById('statWinRate').textContent      = `${winRate}%`;
  document.getElementById('statTotal_trades').textContent = all.length;
  document.getElementById('statAvgWin').textContent       = avgWin  ? fmt$(avgWin)  : '—';
  document.getElementById('statAvgLoss').textContent      = avgLoss ? fmt$(avgLoss) : '—';
  document.getElementById('statBest').textContent         = best  !== null ? fmt$(best)  : '—';
  document.getElementById('statWorst').textContent        = worst !== null ? fmt$(worst) : '—';
  document.getElementById('statPF').textContent           = pf;
}

// ── Table Rendering ───────────────────────────────────────────────
function getFilteredTrades() {
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const sort   = document.getElementById('sortSelect').value;

  let result = trades.filter(t => {
    if (activeFilter === 'WIN')   return t.outcome === 'WIN';
    if (activeFilter === 'LOSS')  return t.outcome === 'LOSS';
    if (activeFilter === 'BE')    return t.outcome === 'BE';
    if (activeFilter === 'LONG')  return t.direction === 'LONG';
    if (activeFilter === 'SHORT') return t.direction === 'SHORT';
    return true;
  });

  if (search) {
    result = result.filter(t =>
      (t.symbol || '').toLowerCase().includes(search) ||
      (t.setup  || '').toLowerCase().includes(search) ||
      (t.notes  || '').toLowerCase().includes(search)
    );
  }

  result.sort((a, b) => {
    if (sort === 'date-desc') return b.date.localeCompare(a.date);
    if (sort === 'date-asc')  return a.date.localeCompare(b.date);
    if (sort === 'pnl-desc')  return (parseFloat(b.pnl)||0) - (parseFloat(a.pnl)||0);
    if (sort === 'pnl-asc')   return (parseFloat(a.pnl)||0) - (parseFloat(b.pnl)||0);
    return 0;
  });

  return result;
}

function renderStars(rating, mini = false) {
  if (mini) {
    let s = '';
    for (let i = 1; i <= 5; i++) s += `<span class="${i <= rating ? '' : 'off'}">★</span>`;
    return `<span class="mini-stars">${s}</span>`;
  }
  return '';
}

function renderTable() {
  const body = document.getElementById('tradesBody');
  const empty = document.getElementById('emptyState');
  const rows = getFilteredTrades();

  body.innerHTML = '';

  if (!rows.length) {
    empty.classList.add('show');
    return;
  }
  empty.classList.remove('show');

  rows.forEach(t => {
    const pnl = parseFloat(t.pnl) || 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(t.date)}</td>
      <td><strong>${t.symbol || '—'}</strong></td>
      <td><span class="badge badge-${t.direction === 'LONG' ? 'long' : 'short'}">${t.direction || '—'}</span></td>
      <td>${t.entry ? '$' + parseFloat(t.entry).toFixed(2) : '—'}</td>
      <td>${t.exit  ? '$' + parseFloat(t.exit).toFixed(2)  : '—'}</td>
      <td>${t.qty   || '—'}</td>
      <td class="td-pnl ${pnl >= 0 ? 'pos' : 'neg'}">${t.pnl !== '' && t.pnl !== undefined ? (pnl >= 0 ? '+' : '') + fmt$(pnl) : '—'}</td>
      <td>${t.setup || '—'}</td>
      <td>${renderStars(t.rating || 0, true)}</td>
      <td><span class="badge badge-${(t.outcome||'be').toLowerCase()}">${t.outcome || 'BE'}</span></td>
      <td class="td-notes" title="${(t.notes||'').replace(/"/g,'&quot;')}">${t.notes || '—'}</td>
      <td>
        <div class="row-actions">
          <button class="act-btn" data-id="${t.id}" data-action="edit">Edit</button>
          <button class="act-btn del" data-id="${t.id}" data-action="delete">✕</button>
        </div>
      </td>
    `;
    body.appendChild(tr);
  });
}

function render() {
  renderStats();
  renderTable();
}

// ── Auto / Manual flags ───────────────────────────────────────────
// When false → field is auto-driven. When true → user has overridden it.
let pnlManual     = false;
let outcomeManual = false;

// ── Helpers: compute auto values ─────────────────────────────────
function calcAutoPnl() {
  const entry = parseFloat(document.getElementById('fEntry').value);
  const exit  = parseFloat(document.getElementById('fExit').value);
  const qty   = parseFloat(document.getElementById('fQty').value) || 0.01;
  if (isNaN(entry) || isNaN(exit)) return null;
  let pnl = (exit - entry) * (qty / 0.01);
  if (activeDirection === 'SHORT') pnl = -pnl;
  return pnl;
}

function calcAutoOutcome(pnlVal) {
  if (pnlVal === null || pnlVal === undefined || pnlVal === '') return 'BE';
  const p = parseFloat(pnlVal);
  if (p > 0) return 'WIN';
  if (p < 0) return 'LOSS';
  return 'BE';
}

// ── Core update: called whenever any auto-input changes ───────────
function updateAuto() {
  const autoPnl = calcAutoPnl();

  // ── PnL field ──
  if (!pnlManual) {
    const input = document.getElementById('fPnl');
    if (autoPnl !== null) {
      input.value = autoPnl.toFixed(2);
      input.classList.add('auto-field');
    } else {
      input.value = '';
      input.classList.add('auto-field');
    }
  }

  // ── Outcome ──
  const effectivePnl = pnlManual
    ? parseFloat(document.getElementById('fPnl').value)
    : autoPnl;

  if (!outcomeManual) {
    const derived = calcAutoOutcome(effectivePnl);
    setOutcomeVisual(derived);
    activeOutcome = derived;
  }

  // ── Preview ──
  const previewVal = pnlManual
    ? parseFloat(document.getElementById('fPnl').value)
    : autoPnl;

  const preview = document.getElementById('pnlPreview');
  if (previewVal !== null && !isNaN(previewVal)) {
    preview.textContent = (previewVal >= 0 ? '+' : '') + fmt$(previewVal);
    preview.className = 'pnl-preview ' + (previewVal >= 0 ? 'pos' : 'neg');
  } else {
    preview.textContent = '';
    preview.className = 'pnl-preview';
  }

  updateAutoTags();
}

// ── Visual-only outcome setter (no flag change) ───────────────────
function setOutcomeVisual(val) {
  ['WIN','LOSS','BE'].forEach(o => {
    const id = 'btn' + (o === 'BE' ? 'BE' : o[0] + o.slice(1).toLowerCase());
    document.getElementById(id).classList.toggle('active', o === val);
  });
}

// ── Show/hide "auto" badge next to overridden fields ──────────────
function updateAutoTags() {
  const pnlTag     = document.getElementById('pnlAutoTag');
  const outcomeTag = document.getElementById('outcomeAutoTag');
  if (pnlTag)     pnlTag.style.display     = pnlManual     ? 'inline-flex' : 'none';
  if (outcomeTag) outcomeTag.style.display  = outcomeManual ? 'inline-flex' : 'none';
}

// ── Form: Star Rating ─────────────────────────────────────────────
function setRating(val) {
  activeRating = val;
  document.querySelectorAll('#starRating .star').forEach(s => {
    s.classList.toggle('active', parseInt(s.dataset.v) <= val);
  });
}

// ── Form: Direction Toggle ────────────────────────────────────────
function setDirection(val) {
  activeDirection = val;
  document.getElementById('btnLong').classList.toggle('active', val === 'LONG');
  document.getElementById('btnShort').classList.toggle('active', val === 'SHORT');
  if (!pnlManual) updateAuto();
}

// ── Form: Outcome Toggle (user-initiated) ─────────────────────────
function setOutcome(val) {
  outcomeManual = true;
  activeOutcome = val;
  setOutcomeVisual(val);
  updateAutoTags();
}

// ── Form: Reset ───────────────────────────────────────────────────
function resetForm() {
  document.getElementById('fDate').value   = new Date().toISOString().slice(0,10);
  document.getElementById('fSymbol').value = '';
  document.getElementById('fEntry').value  = '';
  document.getElementById('fExit').value   = '';
  document.getElementById('fQty').value    = '';
  document.getElementById('fPnl').value    = '';
  document.getElementById('fSetup').value  = '';
  document.getElementById('fNotes').value  = '';
  document.getElementById('fPnl').classList.add('auto-field');

  pnlManual     = false;
  outcomeManual = false;
  activeOutcome = 'BE';
  activeDirection = 'LONG';

  setDirection('LONG');
  setOutcomeVisual('BE');
  setRating(0);
  document.getElementById('pnlPreview').textContent = '';
  document.getElementById('pnlPreview').className = 'pnl-preview';
  updateAutoTags();

  editingId = null;
  document.getElementById('formTitle').textContent = '+ New Trade';
  document.getElementById('cancelEdit').style.display = 'none';
  document.getElementById('saveTradeBtn').textContent = 'Save Trade';
}

// ── Form: Populate for Edit ───────────────────────────────────────
function populateForm(t) {
  document.getElementById('fDate').value   = t.date   || '';
  document.getElementById('fSymbol').value = t.symbol || '';
  document.getElementById('fEntry').value  = t.entry  || '';
  document.getElementById('fExit').value   = t.exit   || '';
  document.getElementById('fQty').value    = t.qty    || '';
  document.getElementById('fSetup').value  = t.setup  || '';
  document.getElementById('fNotes').value  = t.notes  || '';
  setDirection(t.direction || 'LONG');
  setRating(t.rating || 0);

  // Restore manual flags that were saved with the trade
  pnlManual     = !!t.pnlManual;
  outcomeManual = !!t.outcomeManual;

  const pnlInput = document.getElementById('fPnl');
  if (pnlManual) {
    pnlInput.value = t.pnl !== undefined ? t.pnl : '';
    pnlInput.classList.remove('auto-field');
  } else {
    pnlInput.value = '';
    pnlInput.classList.add('auto-field');
  }

  if (outcomeManual) {
    activeOutcome = t.outcome || 'BE';
    setOutcomeVisual(activeOutcome);
  }

  updateAuto(); // let auto fill in whatever isn't manual

  editingId = t.id;
  document.getElementById('formTitle').textContent = '✏ Editing Trade — ' + (t.symbol || '');
  document.getElementById('cancelEdit').style.display = '';
  document.getElementById('saveTradeBtn').textContent = 'Update Trade';
  document.querySelector('.quick-add-section').scrollIntoView({ behavior: 'smooth' });
}

// ── Save Trade ────────────────────────────────────────────────────
function saveTrade() {
  const date   = document.getElementById('fDate').value;
  const symbol = document.getElementById('fSymbol').value.trim().toUpperCase();
  const entry  = document.getElementById('fEntry').value.trim();
  const exit   = document.getElementById('fExit').value.trim();
  const qty    = document.getElementById('fQty').value.trim();
  const setup  = document.getElementById('fSetup').value.trim();
  const notes  = document.getElementById('fNotes').value.trim();

  if (!date || !symbol) {
    showToast('⚠️ Date and Symbol are required');
    return;
  }

  // Resolve final PnL
  let pnl;
  if (pnlManual) {
    pnl = document.getElementById('fPnl').value.trim();
    pnl = pnl !== '' ? parseFloat(pnl) : '';
  } else {
    const auto = calcAutoPnl();
    pnl = auto !== null ? parseFloat(auto.toFixed(2)) : '';
  }

  // Resolve final outcome
  let outcome;
  if (outcomeManual) {
    outcome = activeOutcome;
  } else {
    outcome = calcAutoOutcome(pnl);
  }

  const trade = {
    id: editingId || uid(),
    date, symbol,
    direction: activeDirection,
    entry: entry !== '' ? parseFloat(entry) : '',
    exit:  exit  !== '' ? parseFloat(exit)  : '',
    qty:   qty   !== '' ? parseFloat(qty)   : '',
    pnl, outcome,
    setup, notes,
    rating: activeRating,
    pnlManual,
    outcomeManual,
    createdAt: editingId ? (trades.find(t => t.id === editingId)?.createdAt || Date.now()) : Date.now()
  };

  if (editingId) {
    const idx = trades.findIndex(t => t.id === editingId);
    if (idx !== -1) trades[idx] = trade;
    showToast('✓ Trade updated');
  } else {
    trades.unshift(trade);
    showToast('✓ Trade saved');
  }

  saveTrades();
  syncToCalendar();
  resetForm();
  render();
}

// ── Delete Trade ──────────────────────────────────────────────────
function openDeleteModal(id) {
  pendingDeleteId = id;
  document.getElementById('deleteModal').classList.add('open');
}
function closeDeleteModal() {
  pendingDeleteId = null;
  document.getElementById('deleteModal').classList.remove('open');
}
function confirmDeleteTrade() {
  if (!pendingDeleteId) return;
  trades = trades.filter(t => t.id !== pendingDeleteId);
  saveTrades();
  syncToCalendar();
  render();
  closeDeleteModal();
  showToast('🗑 Trade deleted');
}

// ── Export / Import ───────────────────────────────────────────────
function exportData() {
  const blob = new Blob([JSON.stringify(trades, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const d    = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `trading-journal-${d}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('⬇ Journal exported');
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      const arr = Array.isArray(parsed) ? parsed : [];
      // Merge: skip duplicates by id
      const existing = new Set(trades.map(t => t.id));
      const added = arr.filter(t => !existing.has(t.id));
      trades = [...added, ...trades];
      saveTrades();
      syncToCalendar();
      render();
      showToast(`✓ Imported ${added.length} new trade(s)`);
    } catch {
      showToast('⚠️ Invalid JSON file');
    }
  };
  reader.readAsText(file);
}

// ── Toast ─────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ── Event Listeners ───────────────────────────────────────────────
// Direction toggles
document.getElementById('btnLong').addEventListener('click',  () => setDirection('LONG'));
document.getElementById('btnShort').addEventListener('click', () => setDirection('SHORT'));

// Outcome toggles — user-initiated = manual
document.getElementById('btnWin').addEventListener('click',  () => setOutcome('WIN'));
document.getElementById('btnLoss').addEventListener('click', () => setOutcome('LOSS'));
document.getElementById('btnBE').addEventListener('click',   () => setOutcome('BE'));

// Star rating
document.querySelectorAll('#starRating .star').forEach(s => {
  s.addEventListener('click', () => setRating(parseInt(s.dataset.v)));
  s.addEventListener('mouseover', () => {
    document.querySelectorAll('#starRating .star').forEach(x => {
      x.classList.toggle('active', parseInt(x.dataset.v) <= parseInt(s.dataset.v));
    });
  });
  s.addEventListener('mouseout', () => setRating(activeRating));
});

// Auto inputs — trigger auto update
['fEntry','fExit','fQty'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    if (!pnlManual) document.getElementById('fPnl').classList.add('auto-field');
    updateAuto();
  });
});

// PnL field — if user types: manual mode. If cleared: back to auto
document.getElementById('fPnl').addEventListener('input', () => {
  const val = document.getElementById('fPnl').value.trim();
  if (val === '') {
    // User cleared the field → revert to auto
    pnlManual = false;
    document.getElementById('fPnl').classList.add('auto-field');
    updateAuto();
  } else {
    pnlManual = true;
    document.getElementById('fPnl').classList.remove('auto-field');
    // Auto-drive outcome from manual PnL unless outcome is also manual
    if (!outcomeManual) {
      const derived = calcAutoOutcome(parseFloat(val));
      activeOutcome = derived;
      setOutcomeVisual(derived);
    }
    // Update preview
    const v = parseFloat(val);
    const preview = document.getElementById('pnlPreview');
    if (!isNaN(v)) {
      preview.textContent = (v >= 0 ? '+' : '') + fmt$(v);
      preview.className = 'pnl-preview ' + (v >= 0 ? 'pos' : 'neg');
    } else {
      preview.textContent = '';
      preview.className = 'pnl-preview';
    }
    updateAutoTags();
  }
});

// "Reset to auto" tags
document.getElementById('pnlAutoTag').addEventListener('click', () => {
  pnlManual = false;
  document.getElementById('fPnl').classList.add('auto-field');
  updateAuto();
});
document.getElementById('outcomeAutoTag').addEventListener('click', () => {
  outcomeManual = false;
  updateAuto();
});

// Save & cancel
document.getElementById('saveTradeBtn').addEventListener('click', saveTrade);
document.getElementById('cancelEdit').addEventListener('click', resetForm);

// Table row actions (event delegation)
document.getElementById('tradesBody').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { id, action } = btn.dataset;
  if (action === 'edit') {
    const t = trades.find(x => x.id === id);
    if (t) populateForm(t);
  } else if (action === 'delete') {
    openDeleteModal(id);
  }
});

// Delete modal
document.getElementById('confirmDelete').addEventListener('click', confirmDeleteTrade);
document.getElementById('cancelDelete').addEventListener('click', closeDeleteModal);
document.getElementById('deleteModalClose').addEventListener('click', closeDeleteModal);
document.getElementById('deleteModal').addEventListener('click', e => {
  if (e.target === document.getElementById('deleteModal')) closeDeleteModal();
});

// Filter pills
document.querySelectorAll('.pill').forEach(p => {
  p.addEventListener('click', () => {
    document.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
    p.classList.add('active');
    activeFilter = p.dataset.filter;
    renderTable();
  });
});

// Search & sort
document.getElementById('searchInput').addEventListener('input', renderTable);
document.getElementById('sortSelect').addEventListener('change', renderTable);

// Export / Import
document.getElementById('exportBtn').addEventListener('click', exportData);
document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', e => {
  importData(e.target.files[0]);
  e.target.value = '';
});

// Keyboard: Enter on symbol/setup/notes fields submits
['fSymbol','fSetup'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') saveTrade();
  });
});

// ── Init ──────────────────────────────────────────────────────────
loadTrades();
resetForm(); // sets today's date and defaults
syncToCalendar(); // push any existing trades into calendar on load
render();
