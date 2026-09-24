// Scout Admin — Vercel serverless proxy
// 作用：把 API KEY 留在 Vercel 環境變數（SCOUT_ADMIN_KEY），不落進瀏覽器。
//
// 瀏覽器 → /api/admin ──(server 注入 apikey)──→ Google Apps Script Web App
//
//   GET  /api/admin?action=list   → Apps Script GET  ?action=list&apikey=KEY
//   POST /api/admin  {type:markRead | markReq, id, status} → Apps Script POST（注入 apikey）
//
// 設定（Vercel → 專案 Settings → Environment Variables）：
//   SCOUT_ADMIN_KEY   = GS「setupApiKey」產生並 Email 給你的 Key
//   SCOUT_WEBAPP_URL  = （選填）Apps Script Web App URL；留空用預設值

const WEBAPP_URL = process.env.SCOUT_WEBAPP_URL ||
  'https://script.google.com/macros/s/AKfycbxj5BDDGgjs559smkK4Z5aYImWYeXbN5af8U1ObON0z9WnsN6QJW4I1XWolhs5kQ_H-UQ/exec';
const KEY = (process.env.SCOUT_ADMIN_KEY || '').trim();

module.exports = async function handle(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (code, obj) => {
    try { res.status(code).send(JSON.stringify(obj)); } catch (e) { /* headers already sent */ }
  };

  try {
    if (req.method === 'GET') {
      const url = new URL(WEBAPP_URL);
      url.searchParams.set('action', 'list');
      if (KEY) url.searchParams.set('apikey', KEY);
      const upstream = await fetch(url.toString(), { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      const text = await upstream.text();
      try { res.status(upstream.status).send(text); } catch (e) {}
      return;
    }

    if (req.method === 'POST') {
      let body;
      try {
        if (req.body) body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        else {
          let raw = '';
          for await (const chunk of req) raw += chunk;
          body = raw ? JSON.parse(raw) : {};
        }
      } catch (e) { body = {}; }

      if (body.type !== 'markRead' && body.type !== 'markReq') {
        return send(400, { status: 'error', message: '此代理只接受 markRead / markReq' });
      }
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
