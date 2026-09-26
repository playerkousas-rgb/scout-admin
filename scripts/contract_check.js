// ============================================================
// 統一回報格式 v1 — 對接契約檢查
// 交給其他系統對接前，確保這四份東西完全對齊：
//   ① widget.js（一行接入）
//   ② 後台「📜 Apps Script」分頁的問題回報／意見回饋表單代碼
//   ③ 後台「📜 Apps Script」分頁的 GS 代碼（＝對方會貼進 Google Sheet 那份）
//   ④ SCOUT_ADMIN.md 說明書 + index.html 的 SOURCE_APPS
// 執行：node scripts/contract_check.js
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const widget = fs.readFileSync(path.join(ROOT, 'widget.js'), 'utf8');
const md = fs.readFileSync(path.join(ROOT, 'SCOUT_ADMIN.md'), 'utf8');

let fails = 0;
const check = (c, m) => { if (!c) { fails++; console.error('FAIL:', m); } else console.log('ok  :', m); };

// ---------- 取出後台內嵌的三段代碼（求值後＝使用者複製到的文字） ----------
function grabTemplate(name) {
  const key = 'const ' + name + ' = `';
  const i = html.indexOf(key) + key.length;
  const j = html.indexOf('\n`;\n', i);
  const raw = html.slice(i, j);
  if (/\$\{/.test(raw)) { fails++; console.error('FAIL:', name, '含 ${ 插值，複製出去會壞'); }
  return new Function('return `' + raw + '`')();
}
const GS_CODE = grabTemplate('GS_CODE');
const ISSUE_FORM = grabTemplate('FRONTEND_ISSUE_CODE');
const FEEDBACK_FORM = grabTemplate('FRONTEND_FEEDBACK_CODE');

// ---------- ① 三種客戶端送的欄位必須一模一樣 ----------
const ISSUE_KEYS = ['type', 'sourceApp', 'title', 'desc', 'severity', 'troopId', 'name', 'contact'];
const FEEDBACK_KEYS = ['type', 'sourceApp', 'fbType', 'content', 'troopId', 'name', 'contact'];

function payloadKeysOf(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) return null;
  const seg = src.slice(i, src.indexOf('}', i) + 1);
  return seg.replace(/^JSON\.stringify\(\{|\}$/g, '')
    .split(',')
    .map(s => s.split(':')[0].trim())
    .filter(Boolean);
}
const sameSet = (a, b) => a && b && a.length === b.length && [...a].sort().join() === [...b].sort().join();

check(sameSet(payloadKeysOf(widget, "type: 'issue',"), ISSUE_KEYS), 'widget.js 問題回報欄位＝統一格式');
check(sameSet(payloadKeysOf(widget, "type: 'feedback',"), FEEDBACK_KEYS), 'widget.js 意見回饋欄位＝統一格式');
check(sameSet(payloadKeysOf(ISSUE_FORM, "JSON.stringify({ type: 'issue',"), ISSUE_KEYS), '問題回報表單代碼欄位＝統一格式');
check(sameSet(payloadKeysOf(FEEDBACK_FORM, "JSON.stringify({ type: 'feedback',"), FEEDBACK_KEYS), '意見回饋表單代碼欄位＝統一格式');

// 說明書裡示範的 JSON 也要一樣（對方是照說明書寫 code 的）
function mdJsonKeys(type) {
  const m = md.match(new RegExp('\\{[^{}]*"type":\\s*"' + type + '"[^{}]*\\}'));
  return m ? Object.keys(JSON.parse(m[0])) : null;
}
check(sameSet(mdJsonKeys('issue'), ISSUE_KEYS), '說明書 issue 範例 JSON 欄位一致');
check(sameSet(mdJsonKeys('feedback'), FEEDBACK_KEYS), '說明書 feedback 範例 JSON 欄位一致');

// ---------- ② 來源系統登記表：後台 / widget / GS / 說明書 四邊一致 ----------
function jsArrayLabels(src, marker) {
  const i = src.indexOf(marker);
  const seg = src.slice(i, src.indexOf('\n];', i));
  return [...seg.matchAll(/label:\s*'([^']+)'/g)].map(m => m[1]);
}
function aliasTableKeys(src) {
  const i = src.indexOf('SOURCE_ALIASES = {');
  const seg = src.slice(i, src.indexOf('\n};', i));
  return [...seg.matchAll(/^\s*['"]([^'"]+)['"]\s*:/gm)].map(m => m[1]);
}
const adminLabels = jsArrayLabels(html, 'const SOURCE_APPS = [');
const widgetSources = aliasTableKeys(widget);
const gsSources = aliasTableKeys(GS_CODE);

check(adminLabels.length === 7, '後台 SOURCE_APPS 有 7 個系統：' + adminLabels.join('、'));
check(sameSet(adminLabels, widgetSources), '後台 ↔ widget.js 來源系統一致');
check(sameSet(adminLabels, gsSources), '後台 ↔ Apps Script 來源系統一致');
adminLabels.forEach(l => check(md.includes('| ' + l + ' |'), '說明書來源表有：' + l));

// widget 與 GS 的別名清單也要逐個系統一致（對方可能只填英文代號）
function aliasMap(src) {
  const i = src.indexOf('SOURCE_ALIASES = {');
  const seg = src.slice(i, src.indexOf('\n};', i));
  const out = {};
  seg.split('\n').forEach(line => {
    const m = line.match(/^\s*['"]([^'"]+)['"]\s*:\s*\[(.*)\]/);
    if (m) out[m[1]] = m[2].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).sort();
  });
  return out;
}
const wa = aliasMap(widget), ga = aliasMap(GS_CODE);
Object.keys(ga).forEach(k => check(JSON.stringify(wa[k]) === JSON.stringify(ga[k]), '別名一致：' + k));

// ---------- ③ 真的丟進 GS 跑一次：七個系統 × 兩種回報 ----------
const NAME2KEY = { '申請記錄': 'apply', '問題回報': 'issue', '意見回饋': 'feedback', '作品投稿': 'appstore' };
const state = { apply: { rows: [], headers: [] }, issue: { rows: [], headers: [] }, feedback: { rows: [], headers: [] }, appstore: { rows: [], headers: [] } };
const emails = [];
function RangeStub(sheet, r, c) { this.sheet = sheet; this.r = r; this.c = c; }
RangeStub.prototype.setValues = function (v) { this.sheet._setValues(this.r, this.c, v); return this; };
RangeStub.prototype.setValue = function (v) { this.sheet._setValues(this.r, this.c, [[v]]); return this; };
RangeStub.prototype.getValues = function () { return this.sheet._all(); };
RangeStub.prototype.setFontWeight = function () { return this; };
RangeStub.prototype.setBackground = function () { return this; };
RangeStub.prototype.setFontColor = function () { return this; };
function SheetStub(name) { this.name = name; this.st = state[NAME2KEY[name] || name]; }
SheetStub.prototype.getLastRow = function () { return this.st.rows.length + 1; };
SheetStub.prototype.getLastColumn = function () { return this.st.headers.length; };
SheetStub.prototype.getRange = function (r, c) { return new RangeStub(this, r, c); };
SheetStub.prototype._setValues = function (r, c, v) {
  const ri = r - 1, ci = c - 1;
  for (let i = 0; i < v.length; i++) for (let k = 0; k < v[i].length; k++) {
    if (ri + i === 0) this.st.headers[ci + k] = v[i][k];
    else { const idx = ri + i - 1; while (this.st.rows.length <= idx) this.st.rows.push([]); this.st.rows[idx][ci + k] = v[i][k]; }
  }
};
SheetStub.prototype._all = function () {
  const g = [this.st.headers.map(h => h === undefined ? '' : h)];
  for (const row of this.st.rows) g.push(this.st.headers.map((_, i) => row[i] === undefined ? '' : row[i]));
  return g;
};
SheetStub.prototype.getDataRange = function () { return { getValues: () => this._all() }; };
SheetStub.prototype.setFrozenRows = function () {};
SheetStub.prototype.appendRow = function (row) { this.st.rows.push(this.st.headers.map((_, i) => row[i] === undefined ? '' : row[i])); };

const sandbox = {
  Utilities: { getUuid: (() => { let n = 0; return () => 'uid-' + (++n); })() },
  MailApp: { sendEmail: o => emails.push(o) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty: () => {}, deleteProperty: () => {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => Object.keys(state).includes(NAME2KEY[n]) ? new SheetStub(n) : null, insertSheet: n => new SheetStub(n) }) },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: { JSON: 'j' } },
  Logger: { log: () => {} }, console
};
vm.runInContext(GS_CODE, vm.createContext(sandbox));
const post = o => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify(o) } }));

const ISSUE_COLS = 10, FEEDBACK_COLS = 9;
// 每個系統用「最刁鑽」的來源寫法：英文代號 / 網域 / 全大寫 / 帶路徑
const CASES = [
  ['圖書館', 'scoutlibrary.vercel.app'],
  ['APP STORE', 'https://scoutappstore.vercel.app/submit'],
  ['支部系統', 'BRANCH'],
  ['進度追蹤', 'progress'],
  ['旅系統', 'scoutsystem'],
  ['區系統', '區系統'],
  ['專章系統', 'vsbadge']
];
CASES.forEach(([canon, sent]) => {
  emails.length = 0;
  let r = post({ type: 'issue', sourceApp: sent, title: canon + ' 測試', desc: 'x', severity: '中', troopId: '', name: '', contact: '' });
  const irow = state.issue.rows[state.issue.rows.length - 1];
  const isrc = irow[state.issue.headers.indexOf('來源APP')];
  check(r.status === 'success' && isrc === canon && emails.length === 1,
    `${canon}：issue（送「${sent}」）→ 收到、來源對齊、已 Email`);

  r = post({ type: 'feedback', sourceApp: sent, fbType: '建議', content: canon + ' 意見', troopId: '', name: '', contact: '' });
  const frow = state.feedback.rows[state.feedback.rows.length - 1];
  check(r.status === 'success' && frow[state.feedback.headers.indexOf('來源APP')] === canon,
    `${canon}：feedback（送「${sent}」）→ 收到、來源對齊`);
});
check(state.issue.headers.length === ISSUE_COLS, '問題回報欄位數仍是 ' + ISSUE_COLS + '（沒有多出欄 = 不用改 Sheet）');
check(state.feedback.headers.length === FEEDBACK_COLS, '意見回饋欄位數仍是 ' + FEEDBACK_COLS + '（沒有多出欄）');
check(state.apply.rows.length === 0, '沒有任何回報誤入「申請記錄」');
check(state.appstore.rows.length === 0, '沒有任何回報誤入「作品投稿」');

// 對方寫錯 type / 忘記寫，也要進對的表
emails.length = 0;
post({ type: 'bug', sourceApp: '支部系統', title: '英文 type', desc: 'x' });
check(state.issue.rows[state.issue.rows.length - 1][state.issue.headers.indexOf('標題')] === '英文 type', "type:'bug' → 問題回報");
post({ sourceApp: '區系統', content: '忘記寫 type 的意見' });
check(state.feedback.rows[state.feedback.rows.length - 1][state.feedback.headers.indexOf('內容')] === '忘記寫 type 的意見', '無 type + content → 意見回饋');
post({ type: 'issue', sourceApp: '全新系統Z', title: '未登記系統', desc: 'x' });
check(state.issue.rows[state.issue.rows.length - 1][state.issue.headers.indexOf('來源APP')] === '全新系統Z', '未登記系統原樣收下（不漏單）');
check(state.issue.headers.length === ISSUE_COLS, '容錯情境下欄位數依然不變');

// 對方多送自家欄位（例如 appVersion）→ 自動加欄，但不影響既有欄位順序
post({ type: 'issue', sourceApp: '旅系統', title: '額外欄位', desc: 'x', appVersion: '1.2.3' });
check(state.issue.headers.slice(0, ISSUE_COLS).join() ===
  ['提交時間', '來源APP', '旅團號', '標題', '問題詳情', '嚴重度', '聯絡方式', '姓名', '狀態', '編號'].join(),
  '對方多送欄位時，原有 10 欄順序不變（只在右側加欄）');
check(state.issue.headers.includes('appVersion'), '對方自家欄位自動加欄保存（不漏）');

// ---------- ④ 說明書必備內容 ----------
[
  ['2.4', '版本號'],
  ['統一回報格式 v1', '格式名稱'],
  ['不用改 Apps Script', '加新系統免改後端的承諾'],
  ['"type": "issue"', 'issue payload 範例'],
  ['"type": "feedback"', 'feedback payload 範例'],
  ['data-app=', 'widget 接入方式'],
  ['report.html?app=', '獨立回報頁'],
  ['setupApiKey', 'API KEY 產生方式'],
  ['SUPER_KEY', '後台密碼門'],
  ['markRead', '狀態寫回']
].forEach(([needle, what]) => check(md.includes(needle), '說明書包含' + what));
check(md.includes('| 來源APP（＝來源系統，自動對齊統一名稱） |'), '說明書欄位表標明來源系統欄');

console.log(fails === 0 ? 'CONTRACT OK（可以安心交給其他系統對接）' : fails + ' FAILURES');
process.exit(fails ? 1 : 0);
