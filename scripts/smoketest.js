// 離線冒煙測試（jsdom）：載入整份 index.html 跑內嵌 JS，驗證：
//  1) 作品投稿分頁存在、可切換、可渲染卡片 + 統計
//  2) syncFromSheet 能解析 list 回傳的 appstore 資料（含去重、狀態）
// 執行：node scripts/smoketest.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let fails = 0;
function check(c, m) { if (!c) { fails++; console.error('FAIL:', m); } else console.log('ok  :', m); }

// fetch mock：/api/admin?action=list → 回傳四張表的 JSON
const LIST_PAYLOAD = {
  status: 'ok',
  applications: [],
  issues: [],
  feedbacks: [],
  appstore: [
    { '提交時間': '2026-09-20T10:00:00Z', '作品名稱': '露營裝備清單', '作品連結': 'https://a.example', '作者名稱': '小明', '作品類型': 'apps', '分類': '小工具', '作品簡介': '清單', '標籤': '童軍', '狀態': '待審核', '編號': 'uuu-1' },
    { '提交時間': '2026-09-19T10:00:00Z', '作品名稱': '行程規劃器', '作品連結': 'https://b.example', '作者名稱': '阿強', '作品類型': 'tools', '分類': '規劃', '作品簡介': '行程', '標籤': '', '狀態': '已上架', '編號': 'uuu-2' }
  ]
};

// 連通測試（/api/admin?action=diag）用嘅假回應
const DIAG_PAYLOAD = {
  ok: false,
  checkedAt: '2026-10-21T13:00:00.000Z',
  summary: { pass: 1, warn: 0, fail: 1 },
  checks: [
    { group: 'Scout Admin', id: 'gs-health', label: 'Apps Script 收件端', status: 'pass', detail: '正常：Scout Admin Web App 正常運行', hint: '' },
    { group: 'BADGE APP', id: 'scoutbadge-register', label: '接入申請端點', status: 'fail', detail: '未啟用（503）', hint: '補 SCOUTBADGE_ADMIN_API 後重新部署。' }
  ]
};

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://scout-admin-blue.vercel.app/',
  beforeParse(window) {
    window.fetch = async (url, opts) => {
      const s = String(url);
      let payload = LIST_PAYLOAD;
      if (s.includes('action=diag')) payload = DIAG_PAYLOAD;
      // POST markReq + notify → 模擬 GS 回覆結果
      if (s === '/api/admin' && opts && opts.body) {
        try {
          const body = JSON.parse(opts.body || '{}');
          if (body.type === 'markReq' && body.notify) {
            payload = { status: 'ok', message: '已更新並已通知申請人', notified: true, email: 'sent', to: 'leader82@example.com' };
          } else if (body.type === 'markReq') {
            payload = { status: 'ok', message: '已更新' };
          }
        } catch (e) {}
      }
      // POST 寫回也受控：回傳 ok
      return {
        ok: true,
        headers: { get: (h) => h.toLowerCase() === 'content-type' ? 'application/json' : '' },
        json: async () => payload,
        status: 200,
        text: async () => JSON.stringify(payload)
      };
    };
    window.confirm = () => true;
  }
});

const w = dom.window;
const d = w.document;

// 等 DOMContentLoaded 完成
setTimeout(async () => {
  try {
    check(d.getElementById('tab-appstore') !== null, 'tab-appstore section 存在');
    check(d.querySelectorAll('.tab-btn').length === 6, 'tab 數量 = 6（已移除 產生器 / 設定）');
    check(d.getElementById('tab-json') === null, '產生器分頁已刪除');
    check(d.getElementById('tab-settings') === null, '設定分頁已刪除');
    check([...d.querySelectorAll('.tab-btn')].every(b => !/產生器|設定/.test(b.textContent)), 'tab 列已無 產生器 / 設定');

    // ---- 統一回報格式 v1：來源系統正規化 + 分流 ----
    check(w.normSourceKey('scoutlibrary.vercel.app') === 'library', 'normSourceKey 網域 → library');
    check(w.normSourceKey('VSBADGE') === 'badge', 'normSourceKey vsbadge → badge（專章系統）');
    check(w.normSourceKey('https://scoutappstore.vercel.app/x') === 'appstore', 'normSourceKey URL → appstore');
    check(w.sourceLabel('圖書館').includes('圖書館'), 'sourceLabel 圖書館');
    check(w.sourceLabel('未來新系統X').startsWith('🔹'), '未登記來源原樣顯示（不漏）');

    w.eval(`state.issues = [
      { id:'i1', sourceApp:'圖書館', title:'借書失敗', desc:'d', severity:'高', status:'unread', createdAt:'2026/9/20 10:00' },
      { id:'i2', sourceApp:'scoutappstore.vercel.app', title:'商店載入慢', desc:'d', severity:'中', status:'unread', createdAt:'2026/9/21 10:00' },
      { id:'i3', sourceApp:'支部系統', title:'支部登入問題', desc:'d', severity:'低', status:'read', createdAt:'2026/9/19 10:00' },
      { id:'i4', sourceApp:'未來新系統X', title:'新系統回報', desc:'d', severity:'中', status:'unread', createdAt:'2026/9/22 10:00' }
    ];`);
    w.setIssueSource('all');
    check(d.querySelectorAll('#issueSrcChips .src-chip').length >= 8, '來源膠囊已產生（全部系統 + 各系統）');
    check(d.getElementById('issueList').innerHTML.includes('借書失敗'), '全部系統：看到圖書館回報');
    w.setIssueSource('library');
    check(d.getElementById('issueList').innerHTML.includes('借書失敗') &&
          !d.getElementById('issueList').innerHTML.includes('商店載入慢'), '來源分流：只看圖書館');
    w.setIssueSource('appstore');
    check(d.getElementById('issueList').innerHTML.includes('商店載入慢'), '來源分流：APP STORE（網域自動歸類）');
    w.setIssueSource('@未來新系統x');
    check(d.getElementById('issueList').innerHTML.includes('新系統回報'), '來源分流：未登記新系統也能單獨看');
    w.setIssueSource('all');

    w.eval(`state.feedbacks = [
      { id:'f1', sourceApp:'scoutprogress.vercel.app', type:'建議', content:'想要匯出', status:'unread', createdAt:'2026/9/20 10:00' },
      { id:'f2', sourceApp:'區系統', type:'讚', content:'好用', status:'read', createdAt:'2026/9/18 10:00' }
    ];`);
    w.setFeedbackSource('progress');
    check(d.getElementById('feedbackList').innerHTML.includes('想要匯出') &&
          !d.getElementById('feedbackList').innerHTML.includes('好用'), '意見回饋也能按來源分流');
    w.setFeedbackSource('all');

    // ---- 4 個 BADGE APP 統一歸入「專章系統」 ----
    ['scoutbadge','vsbadge','cubbadge','cubsbadge','roverbadge','進度追蹤',
     '幼童軍進度追蹤','樂行童軍進度追蹤','https://scoutbadge.vercel.app/x','專章']
      .forEach(raw => check(w.normSourceKey(raw) === 'badge', '來源統一 → 專章系統：' + raw));
    check(w.sourceLabel('roverbadge') === '🎖️ 專章系統', '專章系統 顯示名稱正常');
    w.eval(`state.issues = [{ id:'b1', sourceApp:'roverbadge', title:'專章回報', desc:'d', severity:'中', status:'unread', createdAt:'2026/9/21 10:00' }];`);
    w.setIssueSource('badge');
    check(d.getElementById('issueList').innerHTML.includes('專章回報'), '專章系統 膠囊可以只看該來源');

    // 各系統一行接入代碼
    w.renderGsTab();
    const snip = d.getElementById('sourceSnippets').textContent;
    check(['圖書館','APP STORE','支部系統','進度追蹤','旅系統','區系統','專章系統'].every(n => snip.includes('data-app="' + n + '"')),
      '各系統一行接入代碼齊全');

    // 說明書已更新
    w.renderDoc('scout');
    const doc = d.getElementById('docBody').textContent;
    check(doc.includes('統一回報格式') && doc.includes('支部系統') && doc.includes('2.4'), '說明書已更新到 v2.4 統一回報格式');
    check(/不用改 Apps Script/.test(doc), '說明書講明加新系統不用改後端');


    // 直接 render
    w.eval(`state.appstore = [
      { id: 'x1', name: '露營裝備清單', url: 'https://a.example', author: '小明', page: 'apps', category: '小工具', description: '清單', tags: '童軍', status: '待審核', createdAt: '2026/9/20 10:00' },
      { id: 'x2', name: '行程規劃器', url: 'https://b.example', author: '阿強', page: 'tools', category: '規劃', description: '行程', tags: '', status: '已上架', createdAt: '2026/9/19 10:00' }
    ];`);
    w.renderAppStore();
    check(d.getElementById('appstoreList').innerHTML.includes('露營裝備清單'), '渲染作品卡片');
    check(d.getElementById('astatPending').textContent === '1', '統計 待審核=1');
    check(d.getElementById('astatDone').textContent === '1', '統計 已上架=1');
    check(d.getElementById('astatTotal').textContent === '2', '統計 總投稿=2');

    // 切換分頁
    const btn = [...d.querySelectorAll('.tab-btn')].find(b => b.textContent.includes('作品投稿'));
    w.switchTab('appstore', btn);
    check(d.getElementById('tab-appstore').classList.contains('active'), '切換到作品投稿分頁 active');

    // syncFromSheet（走 viaProxy → fetch mock 回 list）
    w.eval('state.appstore = [];');
    await w.syncFromSheet();
    check(w.eval('state.appstore.length') === 2, 'sync 寫入 2 筆作品');
    check(w.eval('state.appstore.map(a=>a.name).sort().join()') === '行程規劃器,露營裝備清單', 'sync 兩筆名稱正確');
    check(w.eval('state.appstore.find(a=>a.id==="uuu-2").status') === '已上架', 'sync 保留狀態 已上架');
    // 顯示順序：最新在最頂（renderAppStore 依 submit 時間排序）
    const cards = [...d.querySelectorAll('#appstoreList .app-card .app-troop')].map(n => n.textContent);
    check(cards[0] && cards[0].includes('露營裝備清單'), '顯示最新在最頂（' + cards.join(' , ') + '）');

    // ---- ✉️ 回覆申請人（v2.5）----
    w.eval(`state.requests = [
      { id:'aaaaaaaa-1111-4111-8111-111111111111', troopId:'0082', troopName:'第82旅', backendUrl:'u', apiKey:'k',
        contact:'leader82@example.com', note:'', status:'pending', createdAt:'2026/10/20 10:00' },
      { id:'bbbbbbbb-2222-4222-8222-222222222222', troopId:'0091', troopName:'第91旅', backendUrl:'u', apiKey:'k',
        contact:'', note:'[roverbadge] 聯絡：leader91@example.com', status:'pending', createdAt:'2026/10/19 10:00' }
    ];`);
    w.renderRequests();
    const cardHtml = d.getElementById('requestList').innerHTML;
    check(cardHtml.includes('leader82@example.com'), '卡片顯示聯絡 Email');
    check(cardHtml.includes('✉️ 通知'), '卡片有「✉️ 通知」按鈕');
    check(w.eval("contactEmailOf(state.requests[1])") === 'leader91@example.com', '未填聯絡 Email 時由備注自動抽出');
    check(w.contactEmailOf({ note:'無電郵' }) === '', '完全冇 Email 時回空字串（唔會亂寄）');

    w.eval('state.requests[0].status = "done";');
    const notified = await w.notifyApplicant('aaaaaaaa-1111-4111-8111-111111111111', { skipConfirm: true, message: '已開通' });
    check(notified === true, 'notifyApplicant 成功（mock 代理回 email:sent）');
    check(!!w.eval('state.requests[0].notifiedAt'), '成功後記錄已通知時間');
    check(await w.notifyApplicant('local-only-id', { skipConfirm: true }) === false, '本機未同步的申請唔會硬寄（提示先同步）');
    w.renderRequests();
    check(d.getElementById('requestList').innerHTML.includes('✉️ 已通知'), '卡片顯示「已通知」標記');

    // ---- 🧪 連通測試 UI ----
    check(d.getElementById('diagModal') !== null, '連通測試 modal 存在');
    check([...d.querySelectorAll('button')].some(b => /連通測試/.test(b.textContent)), '旅團登記有「🧪 連通測試」按鈕');
    await w.runDiag();
    const diagHtml = d.getElementById('diagBody').innerHTML;
    check(diagHtml.includes('Apps Script 收件端'), '連通測試渲染 Apps Script 檢查項');
    check(diagHtml.includes('SCOUTBADGE_ADMIN_API'), '連通測試顯示修正提示（hint）');
    check(diagHtml.includes('❌ 失敗 1') && diagHtml.includes('✅ 通過 1'), '連通測試顯示 summary 統計');

    // 再 sync 一次 → 去重（不重複加）
    await w.syncFromSheet();
    check(w.eval('state.appstore.length') === 2, 'sync 去重不重複');

    console.log(fails === 0 ? 'SMOKE OK' : fails + ' FAILURES');
    process.exit(fails ? 1 : 0);
  } catch (e) {
    console.error('EXCEPTION:', e);
    process.exit(1);
  }
}, 50);
