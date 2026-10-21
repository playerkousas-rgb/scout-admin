// 離線單元測試：連通測試（/api/admin?action=diag）同「寄測試申請」（POST diagTest）
// 全部用 mock fetch，不需要上網。
//
// 覆蓋：
//   1) runDiag：GS 健康檢查＋空 payload POST、4 個 APP 的首頁／旅團清單／接入申請端點
//   2) 判讀：400＝已配置(pass)、503＝未啟用(fail，提示補 SCOUTBADGE_ADMIN_API)、
//            旅團清單空＝warn
//   3) 代理：密碼門開但無 session → 401；有 session → 200
//   4) diagTest：真正送出 type:'apply' 測試申請，回報上游結果
//
// 執行：node scripts/diag_test.js
const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

const ADMIN = path.join(__dirname, '..', 'api', 'admin.js');
const PEPPER = 'scout-admin/super-key-gate/v1';
const WEBAPP = 'https://script.google.com/macros/s/TEST/exec';

let fails = 0;
function check(cond, msg) {
  if (!cond) { fails++; console.error('FAIL:', msg); } else console.log('ok  :', msg);
}

function resp(status, body) {
  return { status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
}

// ---- mock 上游：按網址分派 ----
const calls = [];
function mockFetch() {
  global.fetch = async (url, opts) => {
    const u = String(url);
    const method = (opts && opts.method) || 'GET';
    calls.push({ url: u, method, body: opts && opts.body });

    if (u === WEBAPP) {
      if (method === 'GET') return resp(200, { status: 'ok', message: 'Scout Admin Web App 正常運行' });
      const body = JSON.parse((opts && opts.body) || '{}');
      if (!Object.keys(body).length) return resp(200, { status: 'error', message: '沒有收到任何資料' });
      if (body.type === 'apply') return resp(200, { status: 'success', message: '登記已提交，管理員會盡快接入。' });
      return resp(200, { status: 'success' });
    }

    if (/^https:\/\/[a-z]+badge\.vercel\.app\/?$/.test(u)) return resp(200, '<html>ok</html>');

    if (/\/api\/troops$/.test(u)) {
      if (u.includes('roverbadge')) return resp(200, { troops: {} });
      return resp(200, { troops: { '0082': { name: '82旅' } } });
    }

    if (/\/api\/register$/.test(u)) return resp(400, { success: false, error: 'Missing required fields: troopId, backendUrl, apiKey' });

    if (/\/api\/proxy$/.test(u)) {
      if (u.includes('scoutbadge')) return resp(503, { success: false, error: '接入申請功能尚未啟用，請直接聯絡管理員' });
      return resp(400, { success: false, error: '申請資料不完整' });
    }

    return resp(404, {});
  };
}

function makeRes() {
  let status = null, payload = null;
  const res = {
    status: (c) => { status = c; return res; },
    send: (s) => { payload = s; return res; },
    setHeader: () => res,
    out: () => ({ status, payload: payload ? JSON.parse(payload) : null })
  };
  return res;
}

function req(method, url, { headers = {}, body } = {}) {
  return { method, url, headers, body, ip: '10.0.0.9' };
}

function token(method, superKey) {
  const payload = { v: 1, scope: 'admin', iat: Date.now(), exp: Date.now() + 3600000 };
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', superKey + ':' + PEPPER).update(b).digest('base64url');
  return b + '.' + sig;
}

function freshHandle() {
  delete require.cache[require.resolve(ADMIN)];
  delete require.cache[require.resolve(path.join(__dirname, '..', 'api', '_diag.js'))];
  return require(ADMIN);
}

(async () => {
  // ---------- 1+2) runDiag 判讀 ----------
  const { runDiag } = require(path.join(__dirname, '..', 'api', '_diag.js'));
  mockFetch();
  const diag = await runDiag({ webappUrl: WEBAPP, hasAdminKey: true, hasSuperKey: true });

  const byId = {};
  diag.checks.forEach(c => { byId[c.id] = c; });

  check(byId['gs-health'] && byId['gs-health'].status === 'pass', 'GS 健康檢查 pass');
  check(byId['gs-post'] && byId['gs-post'].status === 'pass', 'GS 空 payload POST：正確拒收 → pass');
  check(byId['admin-key'].status === 'pass' && byId['super-key'].status === 'pass', '環境變數檢查 pass');
  check(byId['scoutbadge-register'].status === 'fail', 'scoutbadge 503 → fail');
  check(/SCOUTBADGE_ADMIN_API/.test(byId['scoutbadge-register'].hint), '503 提示要補 SCOUTBADGE_ADMIN_API');
  check(byId['vsbadge-register'].status === 'pass', 'vsbadge 400 → pass（已配置）');
  check(byId['cubsbadge-register'].status === 'pass', 'cubsbadge 400 → pass（已配置）');
  check(byId['roverbadge-register'].status === 'pass', 'roverbadge 400 → pass（已配置）');
  check(byId['roverbadge-troops'].status === 'warn', 'roverbadge 旅團清單空 → warn');
  check(byId['scoutbadge-troops'].status === 'pass', 'scoutbadge 旅團清單 pass');
  check(byId['scoutbadge-home'].status === 'pass', '首頁 HEAD pass');
  check(diag.summary.fail === 1 && diag.summary.pass >= 10, `summary 正確（fail=${diag.summary.fail}）`);
  check(diag.ok === false, '有 fail 時 ok=false');

  const emptyProbe = calls.find(c => c.url === WEBAPP && c.method === 'POST');
  check(emptyProbe && JSON.parse(emptyProbe.body).constructor === Object &&
    Object.keys(JSON.parse(emptyProbe.body)).length === 0, 'GS POST 只送空 payload（零副作用）');
  const registerCalls = calls.filter(c => /\/api\/(proxy|register)$/.test(c.url));
  check(registerCalls.length === 4, '4 個 APP 都探測過接入申請端點');
  check(registerCalls.every(c => {
    const b = JSON.parse(c.body);
    return b.troopId === undefined && b.apiKey === undefined;
  }), '接入申請探測唔會帶任何真實資料');

  // ---------- 3) 代理：密碼門開，無 session → 401 ----------
  process.env.SUPER_KEY = 'super-secret-1';
  process.env.SCOUT_ADMIN_KEY = 'scout-key-1';
  process.env.SCOUT_WEBAPP_URL = WEBAPP;
  let handle = freshHandle();
  mockFetch();

  let res = makeRes();
  await handle(req('GET', '/api/admin?action=diag'), res);
  check(res.out().status === 401, '無 session 打 diag → 401');

  // 有 session → 200
  res = makeRes();
  await handle(req('GET', '/api/admin?action=diag', { headers: { 'x-scout-session': token('x', 'super-secret-1') } }), res);
  check(res.out().status === 200 && Array.isArray(res.out().payload.checks), '有 session 打 diag → 200 + checks');

  // ---------- 4) diagTest ----------
  mockFetch();
  res = makeRes();
  await handle(req('POST', '/api/admin', {
    headers: { 'x-scout-session': token('x', 'super-secret-1') },
    body: { type: 'diagTest' }
  }), res);
  const out = res.out();
  check(out.status === 200 && out.payload.ok === true, 'diagTest 上游成功 → ok:true');
  const sent = out.payload.sent;
  check(sent.type === 'apply', 'diagTest 送 type:apply');
  check(/連通測試/.test(sent.troopName) && /連通測試/.test(sent.note), 'diagTest 有清楚標示【連通測試】');
  check(sent.apiKey === 'DIAG-TEST-KEY', 'diagTest 用假 API Key，唔會洩露真 Key');

  // diagTest 無 session → 401
  res = makeRes();
  await handle(req('POST', '/api/admin', { body: { type: 'diagTest' } }), res);
  check(res.out().status === 401, '無 session 打 diagTest → 401');

  delete process.env.SUPER_KEY;
  if (fails) { console.error(`\nDIAG TEST FAILED（${fails} 項）`); process.exit(1); }
  console.log('\nDIAG TEST OK');
})().catch(e => { console.error(e); process.exit(1); });
