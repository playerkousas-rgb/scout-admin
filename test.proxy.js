// 離線代理單元測試（不需要上網）：
//  [密碼門關（未設 SUPER_KEY）— 舊版行為]
//   1) ping 回 auth:'off'
//   2) GET ?action=list → server 端注入 apikey 轉發（不 expose 給瀏覽器）
//   3) POST markRead/markReq → 注入 apikey 轉發
//   4) 拒絕 markRead/markReq 以外的 POST
//   5) POST login → 400（未設 SUPER_KEY）
//  [密碼門開（已設 SUPER_KEY）]
//   6) 無 session：GET list / POST markRead / POST markReq → 401 requireLogin（不打 Apps Script）
//   7) login 密碼錯 → 401；密碼對 → 200 回 token
//   8) 帶 token：GET list / POST markRead / POST markReq → 200 且注入 apikey
//   9) ping 帶 token → session:true
//  10) 竄改／過期／錯 Key 簽名的 token → 401
//  11) 同一 IP 連續 5 次錯密碼 → 第 6 次 429
//
// 執行：node test.proxy.js
const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

const MOD = path.join(__dirname, 'api', 'admin.js');
const PEPPER = 'scout-admin/super-key-gate/v1'; // 與 api/admin.js 相同（白箱測試用）

function freshHandle() {
  delete require.cache[require.resolve(MOD)];
  return require(MOD);
}

// 模擬 Apps Script（記住每次呼叫注入了什麼 apikey）
function mockUpstream() {
  let injectedKey = null;
  let hits = 0;
  global.fetch = async (url, opts) => {
    hits++;
    const u = new URL(String(url));
    if (u.searchParams.get('action') === 'list') {
      injectedKey = u.searchParams.get('apikey');
      return { status: 200, text: async () => JSON.stringify({ status: 'ok', applications: [], issues: [], feedbacks: [] }) };
    }
    if (opts && opts.method === 'POST') {
      const body = JSON.parse(opts.body);
      injectedKey = body.apikey;
      return { status: 200, text: async () => JSON.stringify({ status: 'ok', message: '已更新' }) };
    }
    return { status: 200, text: async () => '{}' };
  };
  return { getKey: () => injectedKey, hits: () => hits };
}

function makeRes() {
  let status = null, payload = null;
  const res = {
    status: (c) => { status = c; return res; },
    send: (s) => { payload = s; return res; },
    setHeader: () => res,
    out: () => ({ status, payload: payload ? JSON.parse(payload) : null }),
  };
  return res;
}

function req(method, url, { headers = {}, body, ip = '10.0.0.1' } = {}) {
  return { method, url, headers, body, ip };
}

function forgeToken(superKey, exp) {
  const body = Buffer.from(JSON.stringify({ v: 1, scope: 'admin', iat: Date.now() - 86400000, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', superKey + ':' + PEPPER).update(body).digest('base64url');
  return body + '.' + sig;
}

async function scenarioGateOff() {
  process.env.SCOUT_WEBAPP_URL = 'https://script.google.com/macros/s/TEST/exec';
  process.env.SCOUT_ADMIN_KEY = 'scout-secret-0001';
  delete process.env.SUPER_KEY;
  const handle = freshHandle();
  const up = mockUpstream();

  // ping → auth off
  let res = makeRes();
  await handle(req('GET', '/api/admin?action=ping'), res);
  let out = res.out();
  assert.strictEqual(out.status, 200, 'ping 應 200');
  assert.strictEqual(out.payload.auth, 'off', '未設 SUPER_KEY → auth off');

  // GET list（不需 token）
  res = makeRes();
  await handle(req('GET', '/api/admin?action=list'), res);
  out = res.out();
  assert.strictEqual(out.status, 200);
  assert.strictEqual(up.getKey(), 'scout-secret-0001', '門關：GET 要注入 apikey');

  // POST markRead（不需 token）
  res = makeRes();
  await handle(req('POST', '/api/admin', { body: JSON.stringify({ type: 'markRead', id: 'uuid', status: 'read' }) }), res);
  out = res.out();
  assert.strictEqual(out.status, 200);
  assert.strictEqual(up.getKey(), 'scout-secret-0001', '門關：POST markRead 要注入 apikey');

  // POST 其他 type 被拒
  res = makeRes();
  await handle(req('POST', '/api/admin', { body: JSON.stringify({ type: 'apply', troopName: 'X' }) }), res);
  out = res.out();
  assert.strictEqual(out.status, 400, '只有 markRead/markReq 可以經代理');

  // login → 400（SUPER_KEY 未設）
  res = makeRes();
  await handle(req('POST', '/api/admin', { body: JSON.stringify({ type: 'login', password: 'x' }) }), res);
  out = res.out();
  assert.strictEqual(out.status, 400, '門關時 login 應 400');

  console.log('✅ 密碼門關（舊版行為）');
}

async function scenarioGateOn() {
  const SUPER = 'hunter2-secret';
  process.env.SCOUT_WEBAPP_URL = 'https://script.google.com/macros/s/TEST/exec';
  process.env.SCOUT_ADMIN_KEY = 'scout-secret-0001';
  process.env.SUPER_KEY = SUPER;
  const handle = freshHandle();
  const up = mockUpstream();

  const tokenHeaders = (t) => t ? { 'x-scout-session': t } : {};

  // ping（無 token）→ auth on / session false
  let res = makeRes();
  await handle(req('GET', '/api/admin?action=ping'), res);
  let out = res.out();
  assert.strictEqual(out.status, 200);
  assert.strictEqual(out.payload.auth, 'on', '已設 SUPER_KEY → auth on');
  assert.strictEqual(out.payload.session, false);

  // 無 session：list / markRead / markReq 都 401，且不碰 Apps Script
  const hitsBefore = up.hits();
  for (const r of [
    req('GET', '/api/admin?action=list'),
    req('POST', '/api/admin', { body: JSON.stringify({ type: 'markRead', id: 'x', status: 'read' }) }),
    req('POST', '/api/admin', { body: JSON.stringify({ type: 'markReq', id: 'x', status: '已接入' }) }),
  ]) {
    res = makeRes();
    await handle(r, res);
    out = res.out();
    assert.strictEqual(out.status, 401, '無 session 應 401：' + r.method + ' ' + r.url);
    assert.strictEqual(out.payload.requireLogin, true, '401 要帶 requireLogin');
  }
  assert.strictEqual(up.hits(), hitsBefore, '無 session 不應打到 Apps Script');

  // login：錯密碼
  res = makeRes();
  await handle(req('POST', '/api/admin', { body: JSON.stringify({ type: 'login', password: 'wrong' }) }), res);
  out = res.out();
  assert.strictEqual(out.status, 401, '錯密碼應 401');
  assert.strictEqual(out.payload.ok, false);

  // login：對密碼
  res = makeRes();
  await handle(req('POST', '/api/admin', { body: JSON.stringify({ type: 'login', password: SUPER }) }), res);
  out = res.out();
  assert.strictEqual(out.status, 200, '對密碼應 200');
  assert.strictEqual(out.payload.ok, true);
  const token = out.payload.token;
  assert.ok(token && token.includes('.'), '回傳 token');
  assert.ok(out.payload.exp > Date.now(), '回傳 exp');

  // ping（帶 token）→ session true
  res = makeRes();
  await handle(req('GET', '/api/admin?action=ping', { headers: tokenHeaders(token) }), res);
  out = res.out();
  assert.strictEqual(out.payload.session, true, '有效 token → ping session true');

  // 帶 token：GET list
  res = makeRes();
  await handle(req('GET', '/api/admin?action=list', { headers: tokenHeaders(token) }), res);
  out = res.out();
  assert.strictEqual(out.status, 200);
  assert.strictEqual(out.payload.status, 'ok');
  assert.strictEqual(up.getKey(), 'scout-secret-0001', '門開：GET 要注入 apikey');

  // 帶 token：POST markRead / markReq
  res = makeRes();
  await handle(req('POST', '/api/admin', { body: JSON.stringify({ type: 'markRead', id: 'x', status: 'read' }), headers: tokenHeaders(token) }), res);
  out = res.out();
  assert.strictEqual(out.status, 200);
  assert.strictEqual(up.getKey(), 'scout-secret-0001', '門開：POST markRead 要注入 apikey');

  res = makeRes();
  await handle(req('POST', '/api/admin', { body: JSON.stringify({ type: 'markReq', id: 'x', status: '已接入' }), headers: tokenHeaders(token) }), res);
  out = res.out();
  assert.strictEqual(out.status, 200);
  assert.strictEqual(up.getKey(), 'scout-secret-0001', '門開：POST markReq 要注入 apikey');

  // 帶 token 但 type 不合法 → 400
  res = makeRes();
  await handle(req('POST', '/api/admin', { body: JSON.stringify({ type: 'apply', troopName: 'X' }), headers: tokenHeaders(token) }), res);
  out = res.out();
  assert.strictEqual(out.status, 400, 'type 不合法仍要 400');

  // 竄改 token → 401
  const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
  res = makeRes();
  await handle(req('GET', '/api/admin?action=list', { headers: tokenHeaders(tampered) }), res);
  out = res.out();
  assert.strictEqual(out.status, 401, '竄改 token 應 401');

  // 過期 token（用正確 SUPER_KEY 簽，但 exp 在過去）→ 401
  res = makeRes();
  await handle(req('GET', '/api/admin?action=list', { headers: tokenHeaders(forgeToken(SUPER, Date.now() - 1000)) }), res);
  out = res.out();
  assert.strictEqual(out.status, 401, '過期 token 應 401');

  // 用錯 Key 簽的 token → 401
  res = makeRes();
  await handle(req('GET', '/api/admin?action=list', { headers: tokenHeaders(forgeToken('other-secret', Date.now() + 86400000)) }), res);
  out = res.out();
  assert.strictEqual(out.status, 401, '錯 Key 簽名應 401');

  // 同 IP 連錯 5 次 → 第 6 次 429
  for (let i = 0; i < 5; i++) {
    res = makeRes();
    await handle(req('POST', '/api/admin', { body: JSON.stringify({ type: 'login', password: 'nope' }), ip: '66.66.66.66' }), res);
    assert.strictEqual(res.out().status, 401, '前 5 次錯密碼應 401');
  }
  res = makeRes();
  await handle(req('POST', '/api/admin', { body: JSON.stringify({ type: 'login', password: SUPER }), ip: '66.66.66.66' }), res);
  out = res.out();
  assert.strictEqual(out.status, 429, '第 6 次（即使密碼對）應 429 限流');

  // 429 不限流其他 IP
  res = makeRes();
  await handle(req('POST', '/api/admin', { body: JSON.stringify({ type: 'login', password: SUPER }), ip: '77.77.77.77' }), res);
  out = res.out();
  assert.strictEqual(out.status, 200, '其他 IP 不受影響');

  console.log('✅ 密碼門開（login / token / 限流）');
}

(async () => {
  await scenarioGateOff();
  await scenarioGateOn();
  console.log('✅ 代理測試全部通過');
})().catch((e) => { console.error('❌', e.message); process.exit(1); });
