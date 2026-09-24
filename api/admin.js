// Scout Admin — Vercel serverless proxy
// 作用：把 API KEY 留在 Vercel 環境變數（SCOUT_ADMIN_KEY），不落進瀏覽器。
//       v2.3 起另加「SUPER KEY 密碼門」：SUPER_KEY 也只留在 server，
//       瀏覽器登入後拿到 24 小時的簽名 session token，之後的讀取／寫回都要帶。
//
// 瀏覽器 → /api/admin ──(server 注入 apikey + 驗證 session)──→ Google Apps Script Web App
//
//   GET  /api/admin?action=ping  → {ok, auth:'on'|'off', session:bool}（不需 token）
//   POST /api/admin {type:'login', password}
//         → 密碼 == Vercel 環境變數 SUPER_KEY 時回 {ok:true, token, exp}（24 小時）
//   GET  /api/admin?action=list  → Apps Script GET ?action=list&apikey=KEY（需 session）
//   POST /api/admin {type:markRead|markReq, id, status}（需 session，注入 apikey）
//
// 設定（Vercel → 專案 Settings → Environment Variables）：
//   SCOUT_ADMIN_KEY   = GS「setupApiKey」產生並 Email 給你的 Key
//   SUPER_KEY         = 後台登入密碼（任意字串；改掉它＝換密碼，重新部署即生效）
//   SCOUT_WEBAPP_URL  = （選填）Apps Script Web App URL；留空用預設值
//
// 註：SUPER_KEY 未設定時，密碼門自動關閉（維持舊版行為，方便本地開發）；
//     ping 會回 auth:'off'，前端會在畫面上提示「目前沒有密碼保護」。

const crypto = require('crypto');

const WEBAPP_URL = process.env.SCOUT_WEBAPP_URL ||
  'https://script.google.com/macros/s/AKfycbxj5BDDGgjs559smkK4Z5aYImWYeXbN5af8U1ObON0z9WnsN6QJW4I1XWolhs5kQ_H-UQ/exec';
const KEY = (process.env.SCOUT_ADMIN_KEY || '').trim();
const SUPER_KEY = (process.env.SUPER_KEY || '').trim();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 小時
const TOKEN_PEPPER = 'scout-admin/super-key-gate/v1';
const LOGIN_MAX_FAILS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

// ---------- session token（HMAC 簽名，stateless） ----------

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function makeToken(now = Date.now()) {
  const payload = { v: 1, scope: 'admin', iat: now, exp: now + SESSION_TTL_MS };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SUPER_KEY + ':' + TOKEN_PEPPER).update(body).digest('base64url');
  return body + '.' + sig;
}

function verifyToken(token) {
  if (!SUPER_KEY || typeof token !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0 || dot === token.length - 1) return false;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expect = crypto.createHmac('sha256', SUPER_KEY + ':' + TOKEN_PEPPER).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return !!payload && payload.v === 1 && payload.scope === 'admin' &&
      typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch (e) {
    return false;
  }
}

function sessionFromReq(req) {
  const h = (req.headers && (req.headers['x-scout-session'] || req.headers['X-Scout-Session'])) || '';
  if (Array.isArray(h)) return String(h[0] || '').trim();
  return String(h).trim();
}

// ---------- 登入失敗限制（同一個 warm instance 的記憶體；冷啟動會重數） ----------

const loginFails = new Map(); // ip -> { count, firstFail }

function clientIp(req) {
  const xf = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
  return xf || (req.ip || 'unknown');
}

function loginLimited(ip) {
  const rec = loginFails.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.firstFail > LOGIN_WINDOW_MS) { loginFails.delete(ip); return false; }
  return rec.count >= LOGIN_MAX_FAILS;
}

function loginFail(ip) {
  const rec = loginFails.get(ip);
  if (!rec || Date.now() - rec.firstFail > LOGIN_WINDOW_MS) {
    loginFails.set(ip, { count: 1, firstFail: Date.now() });
  } else {
    rec.count += 1;
  }
}

function loginClear(ip) { loginFails.delete(ip); }

// ---------- helpers ----------

function sameSecret(input) {
  const a = Buffer.from(String(input == null ? '' : input));
  const b = Buffer.from(SUPER_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function readBody(req) {
  try {
    if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    let raw = '';
    for await (const chunk of req) raw += chunk;
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function queryAction(req) {
  if (req.query && req.query.action != null) return String(req.query.action).toLowerCase();
  try { return new URL(req.url || '/api/admin', 'http://localhost').searchParams.get('action') || ''; }
  catch (e) { return ''; }
}

// ---------- handler ----------

module.exports = async function handle(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (code, obj) => {
    try { res.status(code).send(JSON.stringify(obj)); } catch (e) { /* headers already sent */ }
  };

  try {
    const action = queryAction(req);

    // 0) ping — 前端查密碼門狀態；不需 token、不碰 Apps Script
    if (req.method === 'GET' && action === 'ping') {
      return send(200, {
        ok: true,
        auth: SUPER_KEY ? 'on' : 'off',
        session: verifyToken(sessionFromReq(req))
      });
    }

    // 1) login — SUPER_KEY 在 server 端比對（timing-safe），成功發 24 小時 token
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (body.type === 'login') {
        if (!SUPER_KEY) return send(400, { ok: false, error: '後端未設定 SUPER_KEY 環境變數' });
        const ip = clientIp(req);
        if (loginLimited(ip)) return send(429, { ok: false, error: '嘗試次數過多，請 15 分鐘後再試' });
        if (!sameSecret(body.password)) {
          loginFail(ip);
          return send(401, { ok: false, error: '密碼錯誤' });
        }
        loginClear(ip);
        const now = Date.now();
        return send(200, { ok: true, token: makeToken(now), exp: now + SESSION_TTL_MS });
      }

      if (body.type !== 'markRead' && body.type !== 'markReq') {
        return send(400, { status: 'error', message: '此代理只接受 login / markRead / markReq' });
      }
    }

    // 2) 密碼門開著時：list 讀取與狀態寫回都要有效 session
    if (SUPER_KEY && !verifyToken(sessionFromReq(req))) {
      return send(401, { ok: false, requireLogin: true, message: '請先輸入 SUPER KEY 登入' });
    }

    // 3) GET list — 轉發 Apps Script（server 注入 apikey）
    if (req.method === 'GET') {
      const url = new URL(WEBAPP_URL);
      url.searchParams.set('action', 'list');
      if (KEY) url.searchParams.set('apikey', KEY);
      const upstream = await fetch(url.toString(), { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      const text = await upstream.text();
      try { res.status(upstream.status).send(text); } catch (e) {}
      return;
    }

    // 4) POST markRead / markReq — 轉發 Apps Script（server 注入 apikey）
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (KEY) body.apikey = KEY;
      const upstream = await fetch(WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000)
      });
      const text = await upstream.text();
      try { res.status(upstream.status).send(text); } catch (e) {}
      return;
    }

    return send(405, { status: 'error', message: '只接受 GET / POST' });
  } catch (err) {
    return send(502, { status: 'error', message: '代理錯誤：' + (err && err.message ? err.message : err) });
  }
};
