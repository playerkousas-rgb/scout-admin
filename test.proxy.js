// 離線代理單元測試（不需要上網）：
// 驗證 /api/admin 會：
//  1) 在 server 端注入 apikey（不 expose 給瀏覽器）
//  2) GET ?action=list → 轉發到 Apps Script + 附上 apikey
//  3) POST markRead/markReq → 注入 apikey 轉發
//  4) 拒絕 markRead/markReq 以外的 POST
//
// 執行：node test.proxy.js
const assert = require('assert');

let injectedKey = null;
global.fetch = async (url, opts) => {
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

// 模擬 Apps Script URL 與 KEY（application.json 的 process.env 替身）
process.env.SCOUT_WEBAPP_URL = 'https://script.google.com/macros/s/TEST/exec';
process.env.SCOUT_ADMIN_KEY = 'scout-secret-0001';

// 載入代理（改寫 require cache 用 fresh eval 不算，直接 require 一次）
const handle = require('./api/admin.js');

async function run() {
  // GET list
  let status, payload;
  let out = {};
  const res = {
    status: (c) => { status = c; return res; },
    send: (s) => { payload = s; return res; },
    setHeader: () => res,
  };
  await handle({ method: 'GET', url: '/api/admin?action=list' }, res);
  out.getStatus = status;
  out.getKey = injectedKey;
  assert.strictEqual(out.getKey, 'scout-secret-0001', 'GET 要注入 apikey');

  // POST markRead
  injectedKey = null;
  await handle({ method: 'POST', body: JSON.stringify({ type: 'markRead', id: 'uuid', status: 'read' }) }, {
    ...res, status: (c) => { status = c; return res; }, send: (s) => { payload = s; return res; }, setHeader: () => res
  });
  assert.strictEqual(injectedKey, 'scout-secret-0001', 'POST markRead 要注入 apikey');
  assert.strictEqual(status, 200);

  // POST 其他 type 被拒
  injectedKey = null;
  await handle({ method: 'POST', body: JSON.stringify({ type: 'apply', troopName: 'X' }) }, {
    ...res, status: (c) => { status = c; return res; }, send: (s) => { payload = s; return res; }, setHeader: () => res
  });
  assert.strictEqual(status, 400, '只有 markRead/markReq 可以經代理');
}

run().then(() => console.log('✅ 代理測試通過')).catch((e) => { console.error('❌', e.message); process.exit(1); });
