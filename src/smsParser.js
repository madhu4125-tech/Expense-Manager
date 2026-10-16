// smsParser.js - on-device SMS classifier + transaction parser (India bank/UPI SMS)
// ES module, no dependencies.

const AMT = '(?:Rs\\.?|INR|₹)\\s?([\\d,]+(?:\\.\\d{1,2})?)';
const toNum = (s) => (s ? parseFloat(s.replace(/,/g, '')) : null);

// Indian DLT sender format: "AX-HDFCBK-S" (S=service, T=transactional, P=promo, G=govt)
function senderInfo(sender = '') {
  const s = String(sender).trim();
  const isPhone = /^\+?\d{7,15}$/.test(s.replace(/[\s-]/g, ''));
  const m = s.match(/^[A-Z]{2}-([A-Z0-9]{3,9})(?:-([STPG]))?$/i);
  return { isPhone, name: m ? m[1].toUpperCase() : s.toUpperCase(), suffix: m && m[2] ? m[2].toUpperCase() : null };
}

function extractOtp(body) {
  if (!/\b(otp|one[- ]time|verification code|passcode|security code)\b/i.test(body)) return null;
  const m = body.match(/\b(\d{4,8})\b/);
  return m ? m[1] : null;
}

function extractTxn(body) {
  const debit = /\b(debited|spent|withdrawn|paid|purchase|sent|deducted|txn of)\b/i.test(body);
  const credit = /\b(credited|received|deposited|refund(?:ed)?)\b/i.test(body);
  if (!debit && !credit) return null;
  const amt = body.match(new RegExp(AMT, 'i'));
  if (!amt) return null;
  const type = debit && !(credit && !/debited/i.test(body)) ? 'debit' : 'credit';

  const bal = body.match(
    new RegExp('(?:avl\\.?\\s*bal(?:ance)?|available\\s*bal(?:ance)?|bal(?:ance)?)\\s*(?:is|:)?\\s*' + AMT, 'i')
  );
  const acct = body.match(/(?:a\/c|acct?|account|card)\s*(?:no\.?)?\s*(?:ending|xx+|x+|\*+)?\s*(\d{3,4})\b/i);
  const upi = body.match(/(?:VPA|UPI)[:\s-]*([\w.\-]+@[\w]+)/i);
  const merchant = body.match(/\b(?:at|to|towards|info:?)\s+([A-Za-z0-9&@._\- ]{3,30}?)(?=\s+(?:on|via|ref|upi|txn|avl|bal|\.|,)|[.,]|$)/i);
  const ref = body.match(/(?:ref(?:erence)?(?:\s*no)?\.?|utr|txn\s*id)[:\s]*([A-Za-z0-9]{6,20})/i);

  return {
    type,
    amount: toNum(amt[1]),
    balance: bal ? toNum(bal[1]) : null,
    account: acct ? acct[1] : null,
    counterparty: upi ? upi[1] : merchant ? merchant[1].trim() : null,
    ref: ref ? ref[1] : null,
  };
}

function extractBill(body) {
  if (!/\b(bill|due|payable|outstanding|minimum amount due|MAD)\b/i.test(body)) return null;
  const amt = body.match(new RegExp(AMT, 'i'));
  const date = body.match(/\b(\d{1,2}[-\/ ](?:\d{1,2}|[A-Za-z]{3,9})[-\/ ]\d{2,4})\b/);
  if (!amt) return null;
  return { amount: toNum(amt[1]), dueDate: date ? date[1] : null };
}

const PROMO_RE = /\b(offer|sale|discount|cashback|% ?off|win|exclusive|limited time|recharge now|apply now|pre-?approved|loan|t&c|unsubscribe|click)\b/i;

export function parse(sms) {
  const { sender = '', body = '', date = null } = sms;
  const si = senderInfo(sender);
  const out = { sender, date, category: 'other', otp: null, txn: null, bill: null };

  const otp = extractOtp(body);
  if (otp) return { ...out, category: 'otp', otp };

  const txn = extractTxn(body);
  if (txn && si.suffix !== 'P') return { ...out, category: 'transaction', txn };

  const bill = extractBill(body);
  if (bill && si.suffix !== 'P') return { ...out, category: 'bill', bill };

  if (si.suffix === 'P' || PROMO_RE.test(body)) return { ...out, category: 'promo' };
  if (si.isPhone) return { ...out, category: 'personal' };
  return out;
}

// Keyword -> category name. Only names that exist in the app are returned; otherwise "Others".
const CATEGORY_RULES = [
  [/petrol|fuel|hp pay|hpcl|bpcl|iocl|indian ?oil|bharat ?petroleum|shell/i, 'Petrol'],
  [/zerodha|groww|upstox|mutual ?fund|\bsip\b|kuvera|coin\b|nse|bse|angel/i, 'Investment'],
  [/electricity|tneb|tangedco|water|gas|broadband|airtel|jio|rent|maintenance|society/i, 'Home'],
];

export function guessCategory(txn, available = [], fallback = 'Others') {
  const hay = (txn && txn.counterparty) || '';
  for (const [re, name] of CATEGORY_RULES) {
    if (re.test(hay) && available.includes(name)) return name;
  }
  return fallback;
}

export const SmsParser = { parse, guessCategory, senderInfo };
