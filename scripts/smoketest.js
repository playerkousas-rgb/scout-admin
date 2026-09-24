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
    check(d.querySelectorAll('.tab-btn').length >= 8, 'tab 數量 >= 8');

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
