// api/_diag.js — 「🧪 一鍵連通測試」後端探測（由 api/admin.js 的 ?action=diag 呼叫）
//
// 目的：一次過回答「四個 BADGE APP 同 Scout Admin 收件端到底通唔通」，
// 而且默認【零副作用】：
//   ‧ 所有探測都係公開 GET／HEAD（旅團清單、首頁）；
//   ‧ 接入申請端點只送【空 payload】— 正常會回 400「資料不完整」，
//     代表端點已配置；唔會寫入 Sheet、唔會寄 Email。
//   ‧ Google Apps Script 只送空 `{}` — 現行 GS 會回
//     「沒有收到任何資料」，同樣唔會寫入、唔會寄信。
//
// 真正會寫入 ＋ 寄信的「測試申請」由 api/admin.js 的 POST {type:'diagTest'} 負責，
// 前端要再按一次確認才會送出。
//
// 回傳格式：
//   { ok, checkedAt, summary:{pass,warn,fail}, checks:[{group,id,label,status,detail,hint}] }
//   status = 'pass' | 'warn' | 'fail'

const DEFAULT_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbxj5BDDGgjs559smkK4Z5aYImWYeXbN5af8U1ObON0z9WnsN6QJW4I1XWolhs5kQ_H-UQ/exec';

const TIMEOUT_MS = 8000;

// 四個 BADGE APP 的公開端點。
// register：該 APP 的「新旅團接入申請」入口（送空 payload 探測，不會真正提交）。
const APPS = [
  {
    id: 'scoutbadge',
    group: 'BADGE APP',
    label: '童軍支部 scoutbadge.vercel.app',
    origin: 'https://scoutbadge.vercel.app',
    register: { path: '/api/proxy', body: { action: 'submitContact' } },
    registerNeedsEnv: 'SCOUTBADGE_ADMIN_API'
  },
  {
    id: 'vsbadge',
    group: 'BADGE APP',
    label: '深資童軍 vsbadge.vercel.app',
    origin: 'https://vsbadge.vercel.app',
    register: { path: '/api/proxy', body: { action: 'submitRegistration' } },
    registerNeedsEnv: null
  },
  {
    id: 'cubsbadge',
    group: 'BADGE APP',
    label: '幼童軍 cubsbadge.vercel.app',
    origin: 'https://cubsbadge.vercel.app',
    register: { path: '/api/register', body: {} },
    registerNeedsEnv: null
  },
  {
    id: 'roverbadge',
    group: 'BADGE APP',
    label: '樂行童軍 roverbadge.vercel.app',
    origin: 'https://roverbadge.vercel.app',
    register: { path: '/api/proxy', body: { action: 'submitRegistration' } },
    registerNeedsEnv: null
  }
];

function check(group, id, label, status, detail, hint) {
  return { group, id, label, status, detail: String(detail || ''), hint: String(hint || '') };
}

async function fetchText(url, init) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...init
    });
    const text = await res.text();
    return { status: res.status, text, ms: Date.now() - started, error: null };
  } catch (err) {
    const msg = err && err.name === 'TimeoutError'
      ? `逾時（${TIMEOUT_MS / 1000} 秒未回應）`
      : (err && err.message ? err.message : String(err));
    return { status: 0, text: '', ms: Date.now() - started, error: msg };
  }
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (e) { return null; }
}

// 空 payload 打到「接入申請」端點的結果判讀。
// 400 = 端點正常，只係話你欠欄位（正確行為，零副作用）
// 503 = 該 APP 未配置中央收件匣，表單根本寄不出 → 就係「填完冇 Email」嘅源頭
function classifyRegistration(res, app) {
  if (res.error) {
    return check(app.group, app.id + '-register', '接入申請端點', 'fail',
      `無法連接：${res.error}`,
      '該 APP 可能未部署、已刪除，或 Vercel 專案被暫停。');
  }
  const body = parseJson(res.text);
  const msg = (body && (body.error || body.message)) || (res.text || '').slice(0, 160);

  if (res.status === 400) {
    return check(app.group, app.id + '-register', '接入申請端點', 'pass',
      `已配置（回 400：欠欄位屬正常，今次冇送出任何申請）`,
      '');
  }
  if (res.status === 503) {
    return check(app.group, app.id + '-register', '接入申請端點', 'fail',
      `未啟用（503）：${msg}`,
      app.registerNeedsEnv
        ? `在 Vercel 專案 ${app.id} 加環境變數 ${app.registerNeedsEnv} = Scout Admin 收件端 /exec URL，然後重新部署。未設定時表單會直接拒絕，所以「填完收唔到 Email」。`
        : '該 APP 未配置中央收件匣，需在 Vercel 設 SCOUT_ADMIN_API（或同系列名稱）後重新部署。');
  }
  if (res.status === 500) {
    return check(app.group, app.id + '-register', '接入申請端點', 'fail',
      `伺服器設定錯誤（500）：${msg}`,
      '多數係收件匣 URL 格式不正確（要 https://script.google.com/macros/s/…/exec）。檢查環境變數後重新部署。');
  }
  if (res.status === 404) {
    return check(app.group, app.id + '-register', '接入申請端點', 'fail',
      `找不到端點（404）：${app.register.path}`,
      '該 APP 版本太舊或部署不完整，重新部署最新版本。');
  }
  if (res.status === 502 || res.status === 504) {
    return check(app.group, app.id + '-register', '接入申請端點', 'warn',
      `端點已配置，但上游暫時不可達（${res.status}）：${msg}`,
      '多數係 Google Apps Script 一時間慢／未部署新版本；等一陣再測。');
  }
  return check(app.group, app.id + '-register', '接入申請端點', 'warn',
    `非預期回應（HTTP ${res.status}）：${msg}`,
    '對照該 APP 的 Vercel Functions log 再判斷。');
}

function classifyTroops(res, app) {
  if (res.error) {
    return check(app.group, app.id + '-troops', '旅團清單', 'fail',
      `無法連接：${res.error}`, '該 APP 未部署或網域失效。');
  }
  const body = parseJson(res.text);
  if (!body || typeof body !== 'object') {
    return check(app.group, app.id + '-troops', '旅團清單', 'warn',
      `HTTP ${res.status}，回應不是 JSON`, '可能被登入／防護頁擋住。');
  }
  const troops = body.troops && typeof body.troops === 'object' ? body.troops : {};
  const ids = Object.keys(troops);
  if (!ids.length) {
    return check(app.group, app.id + '-troops', '旅團清單', 'warn',
      '旅團清單係空（0 個）',
      '即係未有任何 TROOP_{編號}_BACKEND／_APIKEY／_NAME 環境變數。旅團登入會見到「未有已登記旅團」。');
  }
  const names = ids.map(id => {
    const n = troops[id] && troops[id].name ? ` ${troops[id].name}` : '';
    return id + n;
  });
  return check(app.group, app.id + '-troops', '旅團清單', 'pass',
    `${ids.length} 個旅團：${names.join('、')}`, '');
}

async function probeApp(app) {
  const head = fetchText(app.origin + '/', { method: 'HEAD' });
  const troops = fetchText(app.origin + '/api/troops', { method: 'GET' });
  const register = fetchText(app.origin + app.register.path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(app.register.body)
  });
  const [headRes, troopsRes, registerRes] = await Promise.all([head, troops, register]);

  const home = headRes.error
    ? check(app.group, app.id + '-home', '首頁', 'fail', `無法連接：${headRes.error}`, '檢查 Vercel 專案是否仍存在／網域是否有效。')
    : (headRes.status >= 200 && headRes.status < 400
        ? check(app.group, app.id + '-home', '首頁', 'pass', `HTTP ${headRes.status}`, '')
        : check(app.group, app.id + '-home', '首頁', 'fail', `HTTP ${headRes.status}`, '開啟該網址查看 Vercel 錯誤頁。'));

  return [home, classifyTroops(troopsRes, app), classifyRegistration(registerRes, app)];
}

async function probeScoutAdmin(ctx) {
  const out = [];
  out.push(check('Scout Admin', 'admin-key', '後台 API KEY', ctx.hasAdminKey ? 'pass' : 'fail',
    ctx.hasAdminKey ? 'SCOUT_ADMIN_KEY 已設定' : '未設定 SCOUT_ADMIN_KEY',
    ctx.hasAdminKey ? '' : '後台讀取 Sheet 會失敗；在 Vercel 加 SCOUT_ADMIN_KEY（由 GS setupApiKey 產生）後重新部署。'));

  out.push(check('Scout Admin', 'super-key', 'SUPER_KEY 密碼門', ctx.hasSuperKey ? 'pass' : 'warn',
    ctx.hasSuperKey ? '已開啟（本頁已通過驗證）' : '未設定（任何人可開後台）',
    ctx.hasSuperKey ? '' : '建議在 Vercel 設 SUPER_KEY。'));

  // ① 收件端 GET 健康檢查
  const health = await fetchText(ctx.webappUrl, { method: 'GET' });
  if (health.error) {
    out.push(check('Scout Admin', 'gs-health', 'Apps Script 收件端', 'fail',
      `無法連接：${health.error}`, '確認 GS 已部署為「任何人可存取」，網址是否 /exec 結尾。'));
  } else {
    const body = parseJson(health.text);
    const ok = body && body.status === 'ok';
    out.push(check('Scout Admin', 'gs-health', 'Apps Script 收件端', ok ? 'pass' : 'warn',
      ok ? `正常：${body.message || 'ok'}` : `HTTP ${health.status}：${(health.text || '').slice(0, 160)}`,
      ok ? '' : '開網址應該見到 {"status":"ok"}；見到登入頁代表權限設定錯（要「所有人」）。'));
  }

  // ② 收件端 POST 通路（空 payload，零副作用：唔寫入、唔寄信）
  const post = await fetchText(ctx.webappUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: '{}'
  });
  if (post.error) {
    out.push(check('Scout Admin', 'gs-post', 'POST 收件通路', 'fail',
      `無法連接：${post.error}`, '同上；另外確認 Vercel 可以出外網到 script.google.com。'));
  } else {
    const body = parseJson(post.text);
    if (body && body.status === 'error' && /沒有收到任何資料/.test(body.message || '')) {
      out.push(check('Scout Admin', 'gs-post', 'POST 收件通路', 'pass',
        '正常（空 payload 被正確拒收，冇寫入、冇寄信）', ''));
    } else if (body && body.status === 'success') {
      out.push(check('Scout Admin', 'gs-post', 'POST 收件通路', 'warn',
        `有回應但空 payload 竟然成功：${(post.text || '').slice(0, 120)}`,
        '可能係舊版 GS；建議貼上最新版 GS 並以「新版本」重新部署。'));
    } else {
      out.push(check('Scout Admin', 'gs-post', 'POST 收件通路', 'warn',
        `HTTP ${post.status}：${(post.text || '').slice(0, 160)}`,
        '確認 GS 部署版本係最新，且部署存取權為「所有人」。'));
    }
  }

  return out;
}

// GS 的 ?action=diag：查「上一封通知信有冇寄出」＋剩餘寄信配額（要 API KEY）
async function probeGsEmail(ctx) {
  const out = [];
  if (!ctx.hasAdminKey) {
    out.push(check('Scout Admin', 'gs-email', 'Email 通知狀態', 'warn',
      '未有 SCOUT_ADMIN_KEY，查不到 GS 的寄信紀錄',
      '設定 SCOUT_ADMIN_KEY 後，這裡會顯示上一封信成功／失敗同剩餘配額。'));
    return out;
  }
  const url = new URL(ctx.webappUrl);
  url.searchParams.set('action', 'diag');
  url.searchParams.set('apikey', ctx.adminKey);
  const res = await fetchText(url.toString(), { method: 'GET' });
  const body = parseJson(res.text);

  if (res.error || !body || body.status !== 'ok') {
    out.push(check('Scout Admin', 'gs-email', 'Email 通知狀態', 'warn',
      res.error ? `無法連接：${res.error}` : `GS 未支援 ?action=diag：${(res.text || '').slice(0, 120)}`,
      '舊版 GS 未有這個診斷端點；貼上最新版 GS 並重新部署（新版本）即可。'));
    return out;
  }

  const last = body.lastEmail;
  if (!last) {
    out.push(check('Scout Admin', 'gs-email', 'Email 通知狀態', 'warn',
      `GS 沒有寄信紀錄（ADMIN_EMAIL = ${body.adminEmail || '?'}）`,
      '即係部署新版 GS 之後未寄過任何通知。可按「📨 寄測試申請」或「✉️ 只寄測試 Email」確認。'));
  } else if (last.ok === true) {
    out.push(check('Scout Admin', 'gs-email', 'Email 通知狀態', 'pass',
      `上一封已成功寄出（${last.at || ''} ${last.subject || ''}）`,
      ''));
  } else {
    out.push(check('Scout Admin', 'gs-email', 'Email 通知狀態', 'fail',
      `上一封寄信失敗（${last.at || ''}）：${last.error || ''}`,
      '常見：MailApp 每日配額用完（免費 Gmail 約 100 封／日）、或 Google 帳戶被限制寄信。用「✉️ 只寄測試 Email」再確認。'));
  }

  if (typeof body.remainingQuota === 'number') {
    out.push(check('Scout Admin', 'gs-quota', '今日剩餘寄信配額', body.remainingQuota > 0 ? 'pass' : 'fail',
      `${body.remainingQuota} 封`,
      body.remainingQuota > 0 ? '' : '配額用完要等明日重置；可改用其他通知方式。'));
  }
  return out;
}

async function runDiag(opts) {
  const options = opts || {};
  const ctx = {
    webappUrl: String(options.webappUrl || DEFAULT_WEBAPP_URL).trim() || DEFAULT_WEBAPP_URL,
    adminKey: String(options.adminKey || ''),
    hasAdminKey: !!options.hasAdminKey,
    hasSuperKey: !!options.hasSuperKey
  };

  const adminChecks = (await probeScoutAdmin(ctx)).concat(await probeGsEmail(ctx));
  const appChecks = (await Promise.all(APPS.map(probeApp))).flat();
  const checks = adminChecks.concat(appChecks);

  const summary = { pass: 0, warn: 0, fail: 0 };
  checks.forEach(c => { if (summary[c.status] !== undefined) summary[c.status] += 1; });

  return {
    ok: summary.fail === 0,
    checkedAt: new Date().toISOString(),
    summary,
    checks
  };
}

module.exports = { runDiag, APPS, DEFAULT_WEBAPP_URL };
