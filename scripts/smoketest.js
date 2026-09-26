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

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'https://scout-admin-blue.vercel.app/',
  beforeParse(window) {
    window.fetch = async (url) => {
      const s = String(url);
      let payload = LIST_PAYLOAD;
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
      { id:'f1', sourceApp:'進度追蹤', type:'建議', content:'想要匯出', status:'unread', createdAt:'2026/9/20 10:00' },
      { id:'f2', sourceApp:'區系統', type:'讚', content:'好用', status:'read', createdAt:'2026/9/18 10:00' }
    ];`);
    w.setFeedbackSource('progress');
    check(d.getElementById('feedbackList').innerHTML.includes('想要匯出') &&
          !d.getElementById('feedbackList').innerHTML.includes('好用'), '意見回饋也能按來源分流');
    w.setFeedbackSource('all');

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
