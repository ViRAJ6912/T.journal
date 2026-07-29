/* ─────────────────────────────────────────────────────────────────
   PnL Calendar — app.js
   Persists all data in localStorage under key "pnlCalendar"
───────────────────────────────────────────────────────────────── */

// ── State ────────────────────────────────────────────────────────
const STORAGE_KEY = 'pnlCalendar';

let state = {
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth(), // 0-indexed
  data: {}  // key: "YYYY-MM-DD" → { pnl, notes, trades }
};

// ── Persistence ──────────────────────────────────────────────────
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state.data = JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to load saved data:', e);
    state.data = {};
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  } catch (e) {
    showToast('⚠️ Could not save data — storage may be full');
  }
}

// ── Date Utilities ───────────────────────────────────────────────
function dateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDate(year, month, day) {
  return new Date(year, month, day).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  });
}

function isToday(year, month, day) {
  const t = new Date();
  return t.getFullYear() === year && t.getMonth() === month && t.getDate() === day;
}

// ── Calendar Rendering ───────────────────────────────────────────
function renderCalendar() {
  const { currentYear: y, currentMonth: m } = state;
  const grid = document.getElementById('calendarGrid');
  const monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

  document.getElementById('monthTitle').textContent = `${monthNames[m]} ${y}`;
  grid.innerHTML = '';

  const firstDay = new Date(y, m, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  // Leading empty cells
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'day-cell empty';
    grid.appendChild(empty);
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(y, m, d);
    const entry = state.data[key];
    const cell = document.createElement('div');
    cell.className = 'day-cell';

    if (isToday(y, m, d)) cell.classList.add('today');

    // Day number
    const numEl = document.createElement('span');
    numEl.className = 'day-num';
    numEl.textContent = d;
    cell.appendChild(numEl);

    if (entry && entry.pnl !== undefined && entry.pnl !== '') {
      const pnl = parseFloat(entry.pnl);
      cell.classList.add(pnl >= 0 ? 'win' : 'loss');
      if (entry._fromJournal) cell.classList.add('from-journal');

      const pnlEl = document.createElement('span');
      pnlEl.className = 'day-pnl ' + (pnl >= 0 ? 'positive' : 'negative');
      pnlEl.textContent = (pnl >= 0 ? '+' : '') + formatMoney(pnl);
      cell.appendChild(pnlEl);

      if (entry.notes) {
        const noteEl = document.createElement('span');
        noteEl.className = 'day-note';
        noteEl.textContent = entry.notes;
        cell.appendChild(noteEl);
      }

      if (entry.trades) {
        const trEl = document.createElement('span');
        trEl.className = 'day-trades';
        trEl.textContent = `${entry.trades} trade${entry.trades != 1 ? 's' : ''}`;
        cell.appendChild(trEl);
      }

      if (entry._fromJournal) {
        const jBadge = document.createElement('span');
        jBadge.className = 'journal-badge';
        jBadge.textContent = '📓';
        jBadge.title = 'Synced from Journal';
        cell.appendChild(jBadge);
      }
    }

    cell.addEventListener('click', () => openModal(y, m, d));
    grid.appendChild(cell);
  }

  renderStats();
}

// ── Stats ─────────────────────────────────────────────────────────
function renderStats() {
  const { currentYear: y, currentMonth: m } = state;
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  let total = 0, wins = 0, losses = 0, count = 0;
  let bestVal = null, worstVal = null;

  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(y, m, d);
    const entry = state.data[key];
    if (!entry || entry.pnl === undefined || entry.pnl === '') continue;
    const pnl = parseFloat(entry.pnl);
    total += pnl;
    count++;
    if (pnl >= 0) wins++; else losses++;
    if (bestVal === null || pnl > bestVal) bestVal = pnl;
    if (worstVal === null || pnl < worstVal) worstVal = pnl;
  }

  const winRate = count > 0 ? Math.round((wins / count) * 100) : 0;
  const avg = count > 0 ? total / count : 0;

  const totalEl = document.getElementById('statTotal');
  totalEl.textContent = formatMoney(total);
  totalEl.className = 'stat-value ' + (total >= 0 ? 'green' : 'red');

  document.getElementById('statWinRate').textContent = `${winRate}%`;
  document.getElementById('statWinDays').textContent = wins;
  document.getElementById('statLoseDays').textContent = losses;
  document.getElementById('statBest').textContent = bestVal !== null ? '+' + formatMoney(bestVal) : '—';
  document.getElementById('statWorst').textContent = worstVal !== null ? formatMoney(worstVal) : '—';
  document.getElementById('statAvg').textContent = count > 0 ? formatMoney(avg) : '$0.00';
  document.getElementById('statTradeDays').textContent = count;
}

function formatMoney(n) {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + '$' + formatted;
}

// ── Modal ─────────────────────────────────────────────────────────
let activeKey = null;

function openModal(y, m, d) {
  activeKey = dateKey(y, m, d);
  const entry = state.data[activeKey] || {};

  document.getElementById('modalDate').textContent = formatDate(y, m, d);
  document.getElementById('pnlInput').value = entry.pnl !== undefined ? entry.pnl : '';
  document.getElementById('notesInput').value = entry.notes || '';
  document.getElementById('tradesInput').value = entry.trades || '';

  // Show/hide journal sync notice
  const notice = document.getElementById('journalSyncNotice');
  if (entry._fromJournal) {
    notice.style.display = 'flex';
  } else {
    notice.style.display = 'none';
  }

  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('pnlInput').focus();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  activeKey = null;
}

function saveEntry() {
  if (!activeKey) return;
  const pnl = document.getElementById('pnlInput').value.trim();
  const notes = document.getElementById('notesInput').value.trim();
  const trades = document.getElementById('tradesInput').value.trim();

  if (pnl === '' && notes === '' && trades === '') {
    // Treat as delete if all empty
    delete state.data[activeKey];
  } else {
    state.data[activeKey] = {
      pnl: pnl !== '' ? parseFloat(pnl) : '',
      notes,
      trades: trades !== '' ? parseInt(trades, 10) : ''
    };
  }

  saveData();
  renderCalendar();
  closeModal();
  showToast('✓ Entry saved');
}

function deleteEntry() {
  if (!activeKey) return;
  delete state.data[activeKey];
  saveData();
  renderCalendar();
  closeModal();
  showToast('🗑 Entry deleted');
}

// ── Export / Import ──────────────────────────────────────────────
function exportData() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  a.href = url;
  a.download = `pnl-calendar-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('⬇ Data exported');
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      // Merge — existing keys are overwritten, new keys are added
      state.data = { ...state.data, ...parsed };
      saveData();
      renderCalendar();
      showToast(`✓ Imported ${Object.keys(parsed).length} entries`);
    } catch {
      showToast('⚠️ Invalid JSON file');
    }
  };
  reader.readAsText(file);
}

// ── Toast ────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ── Event Listeners ──────────────────────────────────────────────
document.getElementById('prevMonth').addEventListener('click', () => {
  state.currentMonth--;
  if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }
  renderCalendar();
});

document.getElementById('nextMonth').addEventListener('click', () => {
  state.currentMonth++;
  if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
  renderCalendar();
});

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('saveEntry').addEventListener('click', saveEntry);
document.getElementById('deleteEntry').addEventListener('click', deleteEntry);

document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
});

// Save on Enter key in PnL input
document.getElementById('pnlInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveEntry();
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

document.getElementById('exportBtn').addEventListener('click', exportData);

document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', (e) => {
  importData(e.target.files[0]);
  e.target.value = ''; // reset so same file can be re-imported
});

// ── Init ─────────────────────────────────────────────────────────
loadData();
renderCalendar();
