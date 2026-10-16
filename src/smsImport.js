// smsImport.js - "Import from SMS" feature for My Expenses.
// Injects its own header button + bottom sheet, so index.html needs no changes.
import { Capacitor } from '@capacitor/core';
import * as SmsPkg from 'capacitor-sms-inbox';
import { SmsParser } from './smsParser.js';

const SEEN_KEY = 'smsSeenKeys'; // SMS already imported or dismissed
const MAP_KEY = 'smsMerchantCats'; // merchant -> category you chose before
const START_KEY = 'smsStartTime'; // only SMS received after this moment are ever shown

const INPUT_CLS =
  'w-full bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg outline-none focus:border-blue-500 text-gray-700 dark:text-gray-100';

const MODAL_HTML = `
<div id="smsModal" class="fixed inset-0 bg-black/50 z-50 hidden flex flex-col justify-end transition-opacity opacity-0">
  <div class="bg-white dark:bg-slate-800 w-full max-w-md mx-auto rounded-t-2xl p-5 transform translate-y-full transition-transform duration-300 max-h-[95vh] overflow-y-auto" id="smsModalContent">
    <div class="flex justify-between items-center mb-2">
      <h2 class="text-xl font-bold text-gray-800 dark:text-gray-100">Import from SMS</h2>
      <button id="closeSms" type="button" class="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
    </div>
    <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">Bank and UPI messages are read on this phone only. Nothing is uploaded. Untick anything you don't want.</p>
    <div class="flex items-center gap-3 mb-3">
      <p id="smsSince" class="text-xs text-gray-500 dark:text-gray-400" style="flex:1"></p>
      <button id="smsToggleAll" type="button" class="text-blue-600 dark:text-blue-400 font-bold text-sm" style="flex:none">Select none</button>
    </div>
    <div id="smsList" class="space-y-3 mb-5" style="max-height:50vh;overflow-y:auto"></div>
    <button id="smsImportBtn" type="button" class="w-full bg-blue-600 text-white font-bold py-4 rounded-xl active:scale-[0.98] transition shadow-lg shadow-blue-200 dark:shadow-none">Import selected</button>
  </div>
</div>`;

const BTN_HTML = `<button id="smsBtn" aria-label="Import from SMS" class="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center active:scale-95 transition"><i class="fas fa-envelope"></i></button>`;

const loadJson = (k, d) => {
  try {
    const v = JSON.parse(localStorage.getItem(k));
    return v == null ? d : v;
  } catch (e) {
    return d;
  }
};

// the package's export name differs between versions - accept the common ones
function getPlugin() {
  return SmsPkg.SMSInbox || SmsPkg.SmsInbox || SmsPkg.SmsInboxPlugin || SmsPkg.default || null;
}

export function initSmsImport(ctx) {
  const { $, toast, openModal, closeModal, backdropClose, escapeHtml, fmt, catLabel, getCategories, addTransactions } = ctx;

  // first run: start tracking from the beginning of today - older SMS are never imported
  if (!localStorage.getItem(START_KEY)) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    localStorage.setItem(START_KEY, String(d.getTime()));
  }

  document.querySelector('.max-w-md').insertAdjacentHTML('beforeend', MODAL_HTML);
  $('backupBtn').insertAdjacentHTML('beforebegin', BTN_HTML);

  let found = []; // [{ key, sms, txn, cat, on }]
  let busy = false;

  const close = () => closeModal('smsModal', 'translate-y-full');

  function keyOf(sms, txn) {
    return txn.ref ? 'r:' + txn.ref : `s:${sms.address}|${sms.date}`;
  }

  function suggestCat(txn) {
    const names = getCategories().map((c) => c.name);
    const map = loadJson(MAP_KEY, {});
    const mk = (txn.counterparty || '').toLowerCase();
    if (mk && map[mk] && names.includes(map[mk])) return map[mk];
    if (txn.type === 'credit') return 'Others';
    return SmsParser.guessCategory(txn, names, 'Others');
  }

  async function scan() {
    if (busy) return;
    busy = true;
    $('smsList').innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Reading messages…</p>';
    try {
      const plugin = getPlugin();
      if (!plugin) throw new Error('SMS plugin not available in this build');

      let st = (await plugin.checkPermissions()).sms;
      if (st !== 'granted') st = (await plugin.requestPermissions()).sms;
      if (st !== 'granted') {
        $('smsList').innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400 text-center py-4">SMS permission denied. Allow it in Android Settings → Apps → My Expenses → Permissions.</p>';
        found = [];
        return;
      }

      const since = Number(localStorage.getItem(START_KEY)) || Date.now();
      const { smsList } = await plugin.getSMSList({ filter: { minDate: since, maxCount: 1500 } });

      const seen = new Set(loadJson(SEEN_KEY, []));
      const keys = new Set();
      found = [];
      (smsList || []).forEach((sms) => {
        const r = SmsParser.parse({ sender: sms.address, body: sms.body, date: sms.date });
        if (r.category !== 'transaction' || !r.txn) return;
        const key = keyOf(sms, r.txn);
        if (seen.has(key) || keys.has(key)) return;
        keys.add(key);
        found.push({ key, sms, txn: r.txn, cat: suggestCat(r.txn), on: true });
      });
      found.sort((a, b) => b.sms.date - a.sms.date);
      render();
    } catch (err) {
      found = [];
      $('smsList').innerHTML = '';
      toast('Could not read SMS: ' + String((err && err.message) || err));
    } finally {
      busy = false;
    }
  }

  function render() {
    const box = $('smsList');
    if (!found.length) {
      box.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No new bank transactions yet.</p>';
      updateFooter();
      return;
    }
    const cats = getCategories();
    box.innerHTML = found
      .map((f, i) => {
        const isExp = f.txn.type === 'debit';
        const date = new Date(f.sms.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        const who = f.txn.counterparty || SmsParser.senderInfo(f.sms.address).name;
        const opts = cats
          .map((c) => `<option value="${escapeHtml(c.name)}"${c.name === f.cat ? ' selected' : ''}>${escapeHtml(catLabel(c))}</option>`)
          .join('');
        return `
        <div class="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-slate-700">
          <input type="checkbox" data-chk="${i}" ${f.on ? 'checked' : ''} style="width:20px;height:20px;flex:none" aria-label="Import this transaction">
          <div class="flex-1 min-w-0">
            <p class="font-bold truncate ${isExp ? 'text-red-500' : 'text-green-500'}">${isExp ? '-' : '+'}${fmt(f.txn.amount)}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400 truncate">${date} • ${escapeHtml(who)}</p>
            <select data-cat="${i}" class="${INPUT_CLS}" style="padding:6px 8px;margin-top:6px">${opts}</select>
          </div>
        </div>`;
      })
      .join('');
    updateFooter();
  }

  function updateFooter() {
    const n = found.filter((f) => f.on).length;
    $('smsImportBtn').textContent = n ? `Import ${n} selected` : 'Import selected';
    $('smsImportBtn').disabled = !n;
    $('smsImportBtn').style.opacity = n ? '' : '0.5';
    $('smsToggleAll').textContent = n === found.length ? 'Select none' : 'Select all';
    $('smsToggleAll').style.display = found.length ? '' : 'none';
  }

  function doImport() {
    const chosen = found.filter((f) => f.on);
    if (!chosen.length) return;
    const cats = getCategories();
    const map = loadJson(MAP_KEY, {});
    const now = Date.now();

    const list = chosen.map((f, n) => {
      const cat = cats.find((c) => c.name === f.cat) || cats[cats.length - 1];
      const mk = (f.txn.counterparty || '').toLowerCase();
      if (mk && cat.name !== 'Others') map[mk] = cat.name; // remember your choice for next time
      return {
        id: now + n,
        amount: f.txn.amount,
        type: f.txn.type === 'debit' ? 'expense' : 'income',
        category: catLabel(cat),
        note: f.txn.counterparty || 'Bank SMS',
        date: new Date(f.sms.date).toISOString(),
      };
    });

    // everything shown is now handled: imported ones, and ones you unticked
    const seen = loadJson(SEEN_KEY, []).concat(found.map((f) => f.key)).slice(-3000);
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    localStorage.setItem(MAP_KEY, JSON.stringify(map));

    addTransactions(list);
    close();
    toast(`Imported ${list.length} transaction${list.length === 1 ? '' : 's'}`);
  }

  $('smsBtn').addEventListener('click', () => {
    if (!Capacitor.isNativePlatform()) return toast('SMS import works only in the Android app');
    $('smsSince').textContent =
      'Showing SMS since ' +
      new Date(Number(localStorage.getItem(START_KEY))).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    openModal('smsModal', 'translate-y-full');
    scan();
  });
  $('closeSms').addEventListener('click', close);
  backdropClose('smsModal', close);
  $('smsList').addEventListener('change', (e) => {
    const chk = e.target.closest('[data-chk]');
    if (chk) found[Number(chk.dataset.chk)].on = chk.checked;
    const sel = e.target.closest('[data-cat]');
    if (sel) found[Number(sel.dataset.cat)].cat = sel.value;
    updateFooter();
  });
  $('smsToggleAll').addEventListener('click', () => {
    const allOn = found.every((f) => f.on);
    found.forEach((f) => (f.on = !allOn));
    render();
  });
  $('smsImportBtn').addEventListener('click', doImport);
}
