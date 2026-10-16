import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const $ = (id) => document.getElementById(id);

/* ---------- Categories ---------- */
const CATS = [
  { name: 'Petrol', emoji: '⛽', color: '#f59e0b' },
  { name: 'Investment', emoji: '📈', color: '#10b981' },
  { name: 'Home', emoji: '🏠', color: '#3b82f6' },
  { name: 'Hak', emoji: '👤', color: '#ec4899' },
  { name: 'Siddu', emoji: '👤', color: '#8b5cf6' },
  { name: 'Madhu', emoji: '👤', color: '#06b6d4' },
  { name: 'Others', emoji: '📦', color: '#6b7280' },
];
const catLabel = (c) => `${c.emoji} ${c.name}`;

// Stored category looks like "⛽ Petrol" (emoji + space + name) - keep that format
function parseCat(str) {
  const s = String(str || '');
  const i = s.indexOf(' ');
  const name = i === -1 ? s : s.slice(i + 1).trim();
  const found = CATS.find((c) => c.name === name);
  return found || { name: name || 'Others', emoji: i === -1 ? '📦' : s.slice(0, i), color: '#6b7280' };
}

/* ---------- State ---------- */
function loadTransactions() {
  try {
    const arr = JSON.parse(localStorage.getItem('transactions'));
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}
let transactions = loadTransactions();
let currentType = 'expense';
let editingId = null;
let currentFilter = localStorage.getItem('filter') || 'month';

function saveData() {
  localStorage.setItem('transactions', JSON.stringify(transactions));
}

/* ---------- Helpers ---------- */
const fmt = (n) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toDateStr(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('opacity-0');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('opacity-0'), 2600);
}

/* ---------- Modals ---------- */
function openModal(id, hiddenClass) {
  const modal = $(id);
  const content = $(id + 'Content');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    content.classList.remove(hiddenClass);
  }, 10);
}

function closeModal(id, hiddenClass, after) {
  const modal = $(id);
  const content = $(id + 'Content');
  modal.classList.add('opacity-0');
  content.classList.add(hiddenClass);
  setTimeout(() => {
    modal.classList.add('hidden');
    if (after) after();
  }, 300);
}

// tap on the dark backdrop closes the sheet
function backdropClose(id, closer) {
  $(id).addEventListener('click', (e) => {
    if (e.target === $(id)) closer();
  });
}

/* ---------- Add / Edit ---------- */
function setType(type) {
  currentType = type;
  const on = 'flex-1 py-2 rounded-md font-bold text-sm transition bg-white dark:bg-slate-900 shadow-sm ';
  const off = 'flex-1 py-2 rounded-md font-bold text-sm transition bg-transparent shadow-none text-gray-500 dark:text-gray-400';
  $('btnExpense').className = type === 'expense' ? on + 'text-red-500' : off;
  $('btnIncome').className = type === 'income' ? on + 'text-green-500' : off;
}

function openAdd(id = null) {
  editingId = id;
  const t = id ? transactions.find((x) => x.id === id) : null;
  $('modalTitle').textContent = t ? 'Edit Transaction' : 'New Transaction';
  $('deleteBtn').classList.toggle('hidden', !t);
  setType(t ? t.type : 'expense');
  $('amount').value = t ? t.amount : '';
  const sel = $('category');
  sel.value = t ? parseCat(t.category).name : CATS[0].name;
  if (sel.value === '') sel.value = 'Others';
  $('note').value = t ? t.note || '' : '';
  $('date').max = toDateStr(new Date());
  $('date').value = toDateStr(t ? new Date(t.date) : new Date());
  openModal('addModal', 'translate-y-full');
  if (!t) $('amount').focus();
}

function closeAdd() {
  closeModal('addModal', 'translate-y-full', () => {
    editingId = null;
  });
}

function saveTransaction(e) {
  e.preventDefault();
  const amount = parseFloat($('amount').value);
  if (!(amount > 0)) return;
  const cat = CATS.find((c) => c.name === $('category').value) || CATS[CATS.length - 1];
  const [y, m, d] = $('date').value.split('-').map(Number);
  const note = $('note').value.trim();

  if (editingId) {
    const t = transactions.find((x) => x.id === editingId);
    if (t) {
      const old = new Date(t.date);
      t.amount = amount;
      t.type = currentType;
      t.category = catLabel(cat);
      t.note = note;
      t.date = new Date(y, m - 1, d, old.getHours(), old.getMinutes(), old.getSeconds()).toISOString();
    }
    toast('Transaction updated');
  } else {
    const now = new Date();
    transactions.unshift({
      id: Date.now(),
      amount,
      type: currentType,
      category: catLabel(cat),
      note,
      date: new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString(),
    });
    toast('Transaction saved');
  }
  saveData();
  closeAdd();
  updateDashboard();
}

function deleteTransaction(id) {
  if (!confirm('Delete this transaction?')) return;
  transactions = transactions.filter((t) => t.id !== id);
  saveData();
  updateDashboard();
  toast('Deleted');
}

/* ---------- Filtering & rendering ---------- */
function getFiltered() {
  const now = new Date();
  return transactions.filter((t) => {
    const d = new Date(t.date);
    if (currentFilter === 'all') return true;
    if (currentFilter === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (currentFilter === 'week') return Math.ceil(Math.abs(now - d) / 86400000) <= 7;
    return true;
  });
}

function paintFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach((b) => {
    const active = b.dataset.filter === currentFilter;
    b.className =
      'filter-btn flex-1 py-1.5 rounded-md transition ' +
      (active ? 'bg-white text-blue-700 shadow' : 'text-blue-100 bg-transparent');
  });
}

function updateDashboard() {
  const list = getFiltered().sort((a, b) => new Date(b.date) - new Date(a.date));
  let inc = 0;
  let exp = 0;
  list.forEach((t) => {
    if (t.type === 'income') inc += t.amount;
    if (t.type === 'expense') exp += t.amount;
  });
  $('totalIncome').textContent = fmt(inc);
  $('totalExpense').textContent = fmt(exp);
  $('totalBalance').textContent = (inc - exp < 0 ? '-' : '') + fmt(Math.abs(inc - exp));
  renderSummary(list, exp);
  renderList(list);
}

function renderSummary(list, totalExp) {
  const card = $('summaryCard');
  const box = $('summaryList');
  if (!(totalExp > 0)) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');

  const byCat = new Map();
  list.filter((t) => t.type === 'expense').forEach((t) => {
    const c = parseCat(t.category);
    const cur = byCat.get(c.name) || { cat: c, sum: 0 };
    cur.sum += t.amount;
    byCat.set(c.name, cur);
  });

  box.innerHTML = [...byCat.values()]
    .sort((a, b) => b.sum - a.sum)
    .map(({ cat, sum }) => {
      const pct = (sum / totalExp) * 100;
      return `
        <div>
          <div class="flex justify-between text-sm mb-1">
            <span class="font-medium">${escapeHtml(cat.emoji)} ${escapeHtml(cat.name)}</span>
            <span class="text-gray-500 dark:text-gray-400">${fmt(sum)} · ${Math.round(pct)}%</span>
          </div>
          <div class="h-2 rounded-full bg-gray-200 dark:bg-slate-600 overflow-hidden">
            <div class="h-full rounded-full" style="width:${pct.toFixed(1)}%;background:${cat.color}"></div>
          </div>
        </div>`;
    })
    .join('');
}

function renderList(list) {
  const container = $('transactionList');
  const empty = $('emptyState');
  container.innerHTML = '';
  if (list.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.forEach((t) => {
    const isExp = t.type === 'expense';
    const cat = parseCat(t.category);
    const dateStr = new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

    const item = document.createElement('div');
    item.dataset.id = t.id;
    item.className =
      'tx-row cursor-pointer bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 flex items-center justify-between active:bg-gray-50 dark:active:bg-slate-700';
    item.innerHTML = `
      <div class="flex items-center gap-4 overflow-hidden">
        <div class="w-12 h-12 rounded-full bg-gray-50 dark:bg-slate-700 flex items-center justify-center text-xl shrink-0">${escapeHtml(cat.emoji)}</div>
        <div class="min-w-0">
          <p class="font-bold text-gray-800 dark:text-gray-100 truncate">${escapeHtml(cat.name)}</p>
          <p class="text-xs text-gray-400 dark:text-gray-500 truncate">${dateStr}${t.note ? ' • ' + escapeHtml(t.note) : ''}</p>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <span class="font-bold ${isExp ? 'text-red-500' : 'text-green-500'}">${isExp ? '-' : '+'}${fmt(t.amount)}</span>
        <button data-del="${t.id}" aria-label="Delete" class="text-red-300 dark:text-red-400/70 p-2"><i class="fas fa-trash"></i></button>
      </div>`;
    container.appendChild(item);
  });
}

/* ---------- Backup / restore ---------- */
function stamp() {
  return toDateStr(new Date());
}

async function shareFile(filename, text, mime) {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await Filesystem.writeFile({
        path: filename,
        data: text,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({ title: filename, url: res.uri, dialogTitle: 'Save or send file' });
    } catch (err) {
      const msg = String((err && err.message) || err);
      if (!/cancel/i.test(msg)) toast('Export failed: ' + msg);
    }
  } else {
    // plain browser fallback
    const blob = new Blob([text], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}

function exportJson() {
  if (transactions.length === 0) return toast('Nothing to export yet');
  const payload = {
    app: 'expense-manager',
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions,
  };
  shareFile(`expense-backup-${stamp()}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportCsv() {
  if (transactions.length === 0) return toast('Nothing to export yet');
  const rows = [['Date', 'Type', 'Category', 'Amount', 'Note']];
  [...transactions]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach((t) => {
      rows.push([toDateStr(new Date(t.date)), t.type, parseCat(t.category).name, t.amount.toFixed(2), t.note || '']);
    });
  const csv = '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  shareFile(`expense-report-${stamp()}.csv`, csv, 'text/csv');
}

function sanitize(t) {
  if (!t || typeof t !== 'object') return null;
  const amount = Number(t.amount);
  const type = t.type === 'income' ? 'income' : t.type === 'expense' ? 'expense' : null;
  const date = new Date(t.date);
  if (!(amount > 0) || !type || isNaN(date.getTime())) return null;
  return {
    id: Number.isFinite(Number(t.id)) ? Number(t.id) : Date.now() + Math.floor(Math.random() * 100000),
    amount,
    type,
    category: typeof t.category === 'string' && t.category ? t.category : '📦 Others',
    note: typeof t.note === 'string' ? t.note : '',
    date: date.toISOString(),
  };
}

function importFromText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return toast('That file is not a valid backup');
  }
  const arr = Array.isArray(data) ? data : data && Array.isArray(data.transactions) ? data.transactions : null;
  if (!arr) return toast('No transactions found in that file');

  const clean = arr.map(sanitize).filter(Boolean);
  if (clean.length === 0) return toast('No valid transactions found');

  const existing = new Set(transactions.map((t) => t.id));
  const fresh = clean.filter((t) => !existing.has(t.id));
  if (fresh.length === 0) return toast('Already up to date, nothing new to add');

  if (!confirm(`Add ${fresh.length} new transaction(s) from this backup? Your current data stays as it is.`)) return;
  transactions = transactions.concat(fresh);
  saveData();
  updateDashboard();
  closeModal('backupModal', 'translate-y-full');
  toast(`Imported ${fresh.length} transaction(s)`);
}

/* ---------- Theme ---------- */
function applyTheme(dark) {
  document.documentElement.classList.toggle('dark', dark);
  $('themeIcon').className = dark ? 'fas fa-sun' : 'fas fa-moon';
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(dark);
}

/* ---------- Wire up ---------- */
function init() {
  // category dropdown
  $('category').innerHTML = CATS.map((c) => `<option value="${c.name}">${c.emoji} ${c.name}</option>`).join('');

  initTheme();
  paintFilterButtons();

  $('themeBtn').addEventListener('click', () => {
    const dark = !document.documentElement.classList.contains('dark');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    applyTheme(dark);
  });

  document.querySelectorAll('.filter-btn').forEach((b) =>
    b.addEventListener('click', () => {
      currentFilter = b.dataset.filter;
      localStorage.setItem('filter', currentFilter);
      paintFilterButtons();
      updateDashboard();
    })
  );

  // add / edit
  $('addBtn').addEventListener('click', () => openAdd());
  $('closeAdd').addEventListener('click', closeAdd);
  backdropClose('addModal', closeAdd);
  $('btnExpense').addEventListener('click', () => setType('expense'));
  $('btnIncome').addEventListener('click', () => setType('income'));
  $('transactionForm').addEventListener('submit', saveTransaction);
  $('deleteBtn').addEventListener('click', () => {
    const id = editingId;
    if (!id) return;
    if (!confirm('Delete this transaction?')) return;
    transactions = transactions.filter((t) => t.id !== id);
    saveData();
    closeAdd();
    updateDashboard();
    toast('Deleted');
  });

  // list: tap row to edit, trash icon to delete
  $('transactionList').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) return deleteTransaction(Number(del.dataset.del));
    const row = e.target.closest('.tx-row');
    if (row) openAdd(Number(row.dataset.id));
  });

  // backup
  $('backupBtn').addEventListener('click', () => openModal('backupModal', 'translate-y-full'));
  $('closeBackup').addEventListener('click', () => closeModal('backupModal', 'translate-y-full'));
  backdropClose('backupModal', () => closeModal('backupModal', 'translate-y-full'));
  $('exportJson').addEventListener('click', exportJson);
  $('exportCsv').addEventListener('click', exportCsv);
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importFromText(String(reader.result));
    reader.onerror = () => toast('Could not read that file');
    reader.readAsText(file);
    e.target.value = '';
  });

  // reset
  $('resetBtn').addEventListener('click', () => openModal('resetModal', 'scale-95'));
  $('cancelReset').addEventListener('click', () => closeModal('resetModal', 'scale-95'));
  backdropClose('resetModal', () => closeModal('resetModal', 'scale-95'));
  $('confirmReset').addEventListener('click', () => {
    transactions = [];
    saveData();
    closeModal('resetModal', 'scale-95');
    updateDashboard();
  });

  updateDashboard();
}

document.addEventListener('DOMContentLoaded', init);
