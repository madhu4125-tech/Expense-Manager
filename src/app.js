import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const $ = (id) => document.getElementById(id);

/* ---------- Categories ---------- */
const OTHERS = 'Others'; // fallback category: always exists, cannot be deleted or renamed
const GRAY = '#6b7280';

const DEFAULT_CATS = [
  { name: 'Petrol', emoji: '⛽', color: '#f59e0b' },
  { name: 'Investment', emoji: '📈', color: '#10b981' },
  { name: 'Home', emoji: '🏠', color: '#3b82f6' },
  { name: 'Hak', emoji: '👤', color: '#ec4899' },
  { name: 'Siddu', emoji: '👤', color: '#8b5cf6' },
  { name: 'Madhu', emoji: '👤', color: '#06b6d4' },
  { name: OTHERS, emoji: '📦', color: GRAY },
];

const COLOR_CHOICES = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', GRAY,
];
const EMOJI_CHOICES = ['🍔', '☕', '🛒', '🚗', '💡', '📱', '🎬', '🎁', '💊', '👕', '📚', '🎓', '💼', '💰', '🐶', '🍎'];

const catLabel = (c) => `${c.emoji} ${c.name}`;

// first visible character (handles multi-part emoji when the browser supports Intl.Segmenter)
function firstGrapheme(s) {
  s = String(s || '').replace(/\s/g, '');
  if (!s) return '';
  if (window.Intl && Intl.Segmenter) {
    const first = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)[Symbol.iterator]().next();
    if (first && first.value) return first.value.segment;
  }
  return Array.from(s)[0];
}

function sanitizeCat(c) {
  if (!c || typeof c !== 'object') return null;
  const name = String(c.name == null ? '' : c.name).trim().slice(0, 20);
  if (!name) return null;
  return {
    name,
    emoji: firstGrapheme(c.emoji) || '📦',
    color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : GRAY,
  };
}

// remove duplicate names (case-insensitive) and keep "Others" as the last item
function normalizeCats(arr) {
  const seen = new Set();
  const out = [];
  arr.forEach((c) => {
    const k = c.name.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  });
  const oi = out.findIndex((c) => c.name.toLowerCase() === OTHERS.toLowerCase());
  const others = oi === -1 ? { name: OTHERS, emoji: '📦', color: GRAY } : out.splice(oi, 1)[0];
  others.name = OTHERS;
  out.push(others);
  return out;
}

function loadCategories() {
  try {
    const arr = JSON.parse(localStorage.getItem('categories'));
    if (Array.isArray(arr)) {
      const clean = arr.map(sanitizeCat).filter(Boolean);
      if (clean.length) return normalizeCats(clean);
    }
  } catch (e) {
    /* fall through to defaults */
  }
  return normalizeCats(DEFAULT_CATS.map((c) => ({ ...c })));
}

let categories = loadCategories();

function saveCategories() {
  localStorage.setItem('categories', JSON.stringify(categories));
}

// Stored transaction category looks like "⛽ Petrol" (emoji + space + name) - keep that format
function catNameOf(str) {
  const s = String(str || '');
  const i = s.indexOf(' ');
  return (i === -1 ? s : s.slice(i + 1)).trim() || OTHERS;
}

function parseCat(str) {
  const s = String(str || '');
  const i = s.indexOf(' ');
  const name = catNameOf(s);
  const found = categories.find((c) => c.name === name);
  return found || { name, emoji: i === -1 ? '📦' : s.slice(0, i), color: GRAY };
}

function fillCategorySelect() {
  $('category').innerHTML = categories
    .map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(catLabel(c))}</option>`)
    .join('');
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
let summaryView = localStorage.getItem('summaryView') === 'bars' ? 'bars' : 'pie';
let selectedCat = null; // category highlighted in the pie chart
let summaryData = { rows: [], total: 0 };

function saveData() {
  localStorage.setItem('transactions', JSON.stringify(transactions));
}

/* ---------- Helpers ---------- */
const fmt = (n) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtShort = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

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

  fillCategorySelect();
  const sel = $('category');
  const name = t ? catNameOf(t.category) : categories[0].name;
  // a transaction may use a category that no longer exists (e.g. from an old backup): keep it selectable
  if (t && !categories.some((c) => c.name === name)) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = catLabel(parseCat(t.category));
    sel.appendChild(opt);
  }
  sel.value = name;
  if (sel.value === '') sel.value = OTHERS;

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
  const sel = $('category');
  const found = categories.find((c) => c.name === sel.value);
  const label = found ? catLabel(found) : (sel.selectedOptions[0] && sel.selectedOptions[0].textContent) || '📦 ' + OTHERS;
  const [y, m, d] = $('date').value.split('-').map(Number);
  const note = $('note').value.trim();

  if (editingId) {
    const t = transactions.find((x) => x.id === editingId);
    if (t) {
      const old = new Date(t.date);
      t.amount = amount;
      t.type = currentType;
      t.category = label;
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
      category: label,
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

/* ---------- Manage categories ---------- */
let catEditIndex = null; // null = list view, -1 = adding, 0+ = editing that index
let catDraft = { name: '', emoji: '', color: COLOR_CHOICES[0] };

function showCatList() {
  catEditIndex = null;
  $('catTitle').textContent = 'Categories';
  $('catListView').classList.remove('hidden');
  $('catFormView').classList.add('hidden');
  renderCatList();
}

function showCatForm(index) {
  const c = index >= 0 ? categories[index] : null;
  if (index >= 0 && !c) return;
  catEditIndex = index;
  catDraft = c
    ? { ...c }
    : { name: '', emoji: '', color: COLOR_CHOICES.find((col) => !categories.some((x) => x.color === col)) || COLOR_CHOICES[0] };
  const locked = !!c && c.name === OTHERS;
  $('catTitle').textContent = c ? 'Edit category' : 'New category';
  $('catName').value = catDraft.name;
  $('catName').disabled = locked;
  $('catName').style.opacity = locked ? '0.5' : '';
  $('catEmoji').value = catDraft.emoji;
  renderSwatches();
  $('catListView').classList.add('hidden');
  $('catFormView').classList.remove('hidden');
  if (!c) $('catName').focus();
}

function renderCatList() {
  const counts = new Map();
  transactions.forEach((t) => {
    const n = catNameOf(t.category);
    counts.set(n, (counts.get(n) || 0) + 1);
  });

  $('catList').innerHTML = categories
    .map((c, i) => {
      const n = counts.get(c.name) || 0;
      const isOthers = c.name === OTHERS;
      const sub = `${n} transaction${n === 1 ? '' : 's'}${isOthers ? ' • Cannot be deleted' : ''}`;
      return `
        <div data-edit="${i}" class="cursor-pointer flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-700 active:scale-[0.98] transition">
          <div class="w-12 h-12 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-xl shrink-0" style="box-shadow:inset 0 0 0 3px ${c.color}">${escapeHtml(c.emoji)}</div>
          <div class="flex-1 min-w-0">
            <p class="font-bold text-gray-800 dark:text-gray-100 truncate">${escapeHtml(c.name)}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400 truncate">${sub}</p>
          </div>
          <span class="text-blue-600 dark:text-blue-400 p-2" aria-hidden="true"><i class="fas fa-pen"></i></span>
          ${
            isOthers
              ? ''
              : `<button type="button" data-delcat="${i}" aria-label="Delete ${escapeHtml(c.name)}" class="text-red-300 dark:text-red-400/70 p-2"><i class="fas fa-trash"></i></button>`
          }
        </div>`;
    })
    .join('');
}

function renderSwatches() {
  $('catColors').innerHTML = COLOR_CHOICES.map(
    (col) =>
      `<button type="button" data-color="${col}" aria-label="Color ${col}" style="background:${col};height:36px;border-radius:9999px;display:flex;align-items:center;justify-content:center;color:#fff">${
        col === catDraft.color ? '<i class="fas fa-check"></i>' : ''
      }</button>`
  ).join('');
}

function saveCat() {
  const editing = catEditIndex >= 0 ? categories[catEditIndex] : null;
  const name = editing && editing.name === OTHERS ? OTHERS : $('catName').value.trim();
  if (!name) return toast('Enter a category name');
  if (categories.some((c, i) => i !== catEditIndex && c.name.toLowerCase() === name.toLowerCase())) {
    return toast('That category already exists');
  }
  const next = { name, emoji: firstGrapheme($('catEmoji').value) || '📦', color: catDraft.color };

  if (editing) {
    const oldName = editing.name;
    categories[catEditIndex] = next;
    // rename / emoji change flows through to existing transactions
    transactions.forEach((t) => {
      if (catNameOf(t.category) === oldName) t.category = catLabel(next);
    });
    saveData();
    toast('Category updated');
  } else {
    categories.push(next);
    toast('Category added');
  }
  categories = normalizeCats(categories);
  saveCategories();
  showCatList();
  updateDashboard();
}

function deleteCat(i) {
  const c = categories[i];
  if (!c || c.name === OTHERS) return;
  const n = transactions.filter((t) => catNameOf(t.category) === c.name).length;
  const msg = n
    ? `Delete "${c.name}"? Its ${n} transaction(s) will move to ${OTHERS}.`
    : `Delete "${c.name}"?`;
  if (!confirm(msg)) return;
  const others = categories.find((x) => x.name === OTHERS);
  transactions.forEach((t) => {
    if (catNameOf(t.category) === c.name) t.category = catLabel(others);
  });
  categories.splice(i, 1);
  saveData();
  saveCategories();
  renderCatList();
  updateDashboard();
  toast('Category deleted');
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

function paintViewButtons() {
  const on = 'flex-1 py-2 rounded-md font-bold text-sm transition bg-white dark:bg-slate-900 shadow-sm text-blue-600 dark:text-blue-400';
  const off = 'flex-1 py-2 rounded-md font-bold text-sm transition bg-transparent shadow-none text-gray-500 dark:text-gray-400';
  $('viewPie').className = summaryView === 'pie' ? on : off;
  $('viewBars').className = summaryView === 'bars' ? on : off;
}

function setSummaryView(v) {
  summaryView = v;
  localStorage.setItem('summaryView', v);
  paintViewButtons();
  drawSummary();
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

  summaryData = { rows: [...byCat.values()].sort((a, b) => b.sum - a.sum), total: totalExp };
  drawSummary();
}

function drawSummary() {
  const box = $('summaryList');
  const { rows, total } = summaryData;
  if (!rows.length || !(total > 0)) {
    box.innerHTML = '';
    return;
  }

  if (summaryView === 'bars') {
    box.innerHTML =
      '<div class="space-y-3">' +
      rows
        .map(({ cat, sum }) => {
          const pct = (sum / total) * 100;
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
        .join('') +
      '</div>';
    return;
  }

  // ----- donut chart: circles with r = 100/(2π), so the circumference is exactly 100 -----
  if (selectedCat && !rows.some((r) => r.cat.name === selectedCat)) selectedCat = null;
  const R = 15.9155;
  let cum = 0;
  const segs = rows
    .map((r, i) => {
      const pct = (r.sum / total) * 100;
      const len = rows.length > 1 ? Math.max(pct - 0.6, 0.15) : pct; // small gap between slices
      const isSel = selectedCat === r.cat.name;
      const dim = selectedCat && !isSel;
      const s = `<circle data-seg="${i}" cx="21" cy="21" r="${R}" fill="none" stroke="${r.cat.color}" stroke-width="${isSel ? 7 : 6}" stroke-dasharray="${len.toFixed(3)} ${(100 - len).toFixed(3)}" stroke-dashoffset="${(25 - cum).toFixed(3)}" style="cursor:pointer;opacity:${dim ? 0.3 : 1};transition:opacity .2s"></circle>`;
      cum += pct;
      return s;
    })
    .join('');

  const sel = selectedCat ? rows.find((r) => r.cat.name === selectedCat) : null;
  let center;
  if (sel) {
    const nm = sel.cat.name.length > 11 ? sel.cat.name.slice(0, 10) + '…' : sel.cat.name;
    const amt = fmtShort(sel.sum);
    center = `
      <text x="21" y="18" text-anchor="middle" font-size="2.8" fill="currentColor" opacity=".7">${escapeHtml(nm)}</text>
      <text x="21" y="23.4" text-anchor="middle" font-size="${amt.length > 9 ? 3 : 3.8}" font-weight="700" fill="currentColor">${amt}</text>
      <text x="21" y="27.4" text-anchor="middle" font-size="2.6" fill="currentColor" opacity=".7">${Math.round((sel.sum / total) * 100)}%</text>`;
  } else {
    const amt = fmtShort(total);
    center = `
      <text x="21" y="19.6" text-anchor="middle" font-size="2.8" fill="currentColor" opacity=".7">Total spent</text>
      <text x="21" y="25.2" text-anchor="middle" font-size="${amt.length > 9 ? 3 : 3.8}" font-weight="700" fill="currentColor">${amt}</text>`;
  }

  const legend = rows
    .map((r, i) => {
      const pct = Math.round((r.sum / total) * 100);
      const dim = selectedCat && selectedCat !== r.cat.name;
      return `
        <button type="button" data-seg="${i}" class="w-full flex items-center gap-3 text-sm text-left" style="opacity:${dim ? 0.4 : 1};transition:opacity .2s">
          <span style="width:12px;height:12px;border-radius:9999px;background:${r.cat.color};flex:none"></span>
          <span class="flex-1 min-w-0 truncate font-medium">${escapeHtml(r.cat.emoji)} ${escapeHtml(r.cat.name)}</span>
          <span class="text-gray-500 dark:text-gray-400">${fmt(r.sum)} · ${pct}%</span>
        </button>`;
    })
    .join('');

  box.innerHTML = `
    <svg viewBox="0 0 42 42" role="img" aria-label="Spending by category" style="width:100%;max-width:220px;display:block;margin:0 auto">
      <circle cx="21" cy="21" r="${R}" fill="none" stroke="currentColor" stroke-width="6" opacity=".08"></circle>
      ${segs}
      <g style="pointer-events:none">${center}</g>
    </svg>
    <div class="space-y-3 mt-5">${legend}</div>`;
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
    version: 2,
    exportedAt: new Date().toISOString(),
    categories,
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

  // categories from the backup that we don't have yet (matched by name, existing ones are kept as they are)
  const fileCats = data && !Array.isArray(data) && Array.isArray(data.categories) ? data.categories.map(sanitizeCat).filter(Boolean) : [];
  const have = new Set(categories.map((c) => c.name.toLowerCase()));
  const newCats = [];
  fileCats.forEach((c) => {
    const k = c.name.toLowerCase();
    if (!have.has(k)) {
      have.add(k);
      newCats.push(c);
    }
  });

  const existing = new Set(transactions.map((t) => t.id));
  const fresh = clean.filter((t) => !existing.has(t.id));

  if (clean.length === 0 && newCats.length === 0) return toast('No valid transactions found');
  if (fresh.length === 0 && newCats.length === 0) return toast('Already up to date, nothing new to add');

  const parts = [];
  if (fresh.length) parts.push(`${fresh.length} new transaction(s)`);
  if (newCats.length) parts.push(`${newCats.length} new categor${newCats.length === 1 ? 'y' : 'ies'}`);
  if (!confirm(`Add ${parts.join(' and ')} from this backup? Your current data stays as it is.`)) return;

  if (newCats.length) {
    categories = normalizeCats(categories.concat(newCats));
    saveCategories();
  }
  transactions = transactions.concat(fresh);
  saveData();
  updateDashboard();
  closeModal('backupModal', 'translate-y-full');
  toast(`Imported ${parts.join(' and ')}`);
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
  fillCategorySelect();
  $('catEmojiChips').innerHTML = EMOJI_CHOICES.map(
    (e) => `<button type="button" data-emoji="${e}" style="font-size:22px;height:40px">${e}</button>`
  ).join('');

  initTheme();
  paintFilterButtons();
  paintViewButtons();

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

  // summary: pie / bars toggle, tap a slice or legend row to highlight it
  $('viewPie').addEventListener('click', () => setSummaryView('pie'));
  $('viewBars').addEventListener('click', () => setSummaryView('bars'));
  $('summaryList').addEventListener('click', (e) => {
    const seg = e.target.closest('[data-seg]');
    if (seg) {
      const row = summaryData.rows[Number(seg.dataset.seg)];
      if (row) selectedCat = selectedCat === row.cat.name ? null : row.cat.name;
    } else if (e.target.closest('svg')) {
      selectedCat = null;
    } else {
      return;
    }
    drawSummary();
  });

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

  // categories
  const closeCat = () => closeModal('catModal', 'translate-y-full', showCatList);
  $('catBtn').addEventListener('click', () => {
    showCatList();
    openModal('catModal', 'translate-y-full');
  });
  $('closeCat').addEventListener('click', closeCat);
  backdropClose('catModal', closeCat);
  $('addCatBtn').addEventListener('click', () => showCatForm(-1));
  $('cancelCat').addEventListener('click', showCatList);
  $('saveCat').addEventListener('click', saveCat);
  $('catName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveCat();
    }
  });
  $('catList').addEventListener('click', (e) => {
    const del = e.target.closest('[data-delcat]');
    if (del) return deleteCat(Number(del.dataset.delcat));
    const row = e.target.closest('[data-edit]');
    if (row) showCatForm(Number(row.dataset.edit));
  });
  $('catColors').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    catDraft.color = b.dataset.color;
    renderSwatches();
  });
  $('catEmojiChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-emoji]');
    if (b) $('catEmoji').value = b.dataset.emoji;
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
