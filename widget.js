/*!
 * Scout Admin — 問題回報 / 意見回饋 浮動表單 widget（v1.1）
 *
 * 嵌入方式（一行搞定，APP 不需要有任何後端）：
 *   <script src="https://scout-admin-blue.vercel.app/widget.js"><\/script>
 *
 * 「來源」預設自動帶入所在網頁的網址（location.hostname —
 * 通常就是你 Vercel 項目的域名，一眼認得是邊個 APP）。
 * 想手動指定（例如用 Vercel 項目名覆蓋自訂網域）才加：
 *   <script src="https://scout-admin-blue.vercel.app/widget.js" data-app="vs_portal"><\/script>
 *
 * 或用獨立回報頁（完全不用改 APP，分享連結即可）：
 *   https://scout-admin-blue.vercel.app/report.html?app=你的APP名
 *
 * 資料直接送到 Scout Admin 的 Apps Script（與其他表單同一接收端）。
 */
(function () {
  'use strict';
  if (window.__scoutReportWidget) return;
  window.__scoutReportWidget = true;

  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbxj5BDDGgjs559smkK4Z5aYImWYeXbN5af8U1ObON0z9WnsN6QJW4I1XWolhs5kQ_H-UQ/exec';

  var cur = document.currentScript;
  var ADMIN_HOSTS = { 'scout-admin-blue.vercel.app': 1, 'localhost': 1, '127.0.0.1': 1 };
  // 來源優先序：data-app 手動指定 > ?app= 查詢參數 > 自動帶入所在網頁 hostname
  //（hostname 通常就是 Vercel 項目域名 — 對管理員而言比自訂名字更有用）
  // Admin 自己的域名不自動採用（避免 report.html 錄成 scout-admin 自己）
  var SOURCE_APP = (cur && cur.getAttribute('data-app')) ||
    (typeof location !== 'undefined' && new URLSearchParams(location.search).get('app')) ||
    (typeof location !== 'undefined' && /^https?:$/.test(location.protocol) &&
      location.hostname && !ADMIN_HOSTS[location.hostname] ? location.hostname : '');
  var AUTO_OPEN = !!(cur && cur.getAttribute('data-auto'));

  // ---------- 樣式 ----------
  function injectStyle() {
    if (document.getElementById('scoutw-style')) return;
    var css = [
      '#scoutw-fab{position:fixed;right:18px;bottom:18px;z-index:2147483000;background:#8B0000;color:#fff;border:none;',
      'border-radius:28px;padding:12px 18px;font:700 14px/1 "Segoe UI","PingFang HK",sans-serif;cursor:pointer;',
      'box-shadow:0 4px 16px rgba(139,0,0,.4);letter-spacing:.5px;transition:filter .15s}',
      '#scoutw-fab:hover{filter:brightness(1.15)}',
      '#scoutw-overlay{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.5);display:none;overflow:auto;',
      'font-family:"Segoe UI","PingFang HK","Noto Sans HK",sans-serif}',
      '#scoutw-overlay.open{display:block}',
      '#scoutw-modal{background:#fff;max-width:440px;margin:6vh auto;border-radius:14px;padding:22px 22px 20px;position:relative;',
      'box-shadow:0 12px 40px rgba(0,0,0,.25)}',
      '#scoutw-close{position:absolute;top:10px;right:14px;background:none;border:none;font-size:1.4rem;cursor:pointer;color:#888;line-height:1}',
      '#scoutw-tabs{display:flex;gap:6px;margin-bottom:16px}',
      '#scoutw-tabs button{flex:1;padding:9px 6px;border:1px solid #e2ddd5;background:#f4f1ec;border-radius:8px;',
      'font:700 13px inherit;cursor:pointer;color:#6b6b6b;transition:all .15s}',
      '#scoutw-tabs button.active{background:#8B0000;border-color:#8B0000;color:#fff}',
      '.scoutw-pane{display:none;flex-direction:column;gap:11px}',
      '.scoutw-pane.open{display:flex}',
      '.scoutw-pane label{font-size:12.5px;font-weight:600;color:#555;display:block;margin-bottom:4px}',
      '.scoutw-pane input,.scoutw-pane select,.scoutw-pane textarea{width:100%;padding:9px 11px;border:1px solid #ddd;',
      'border-radius:8px;font-size:14px;font-family:inherit;box-sizing:border-box;background:#fff}',
      '.scoutw-pane input:focus,.scoutw-pane select:focus,.scoutw-pane textarea:focus{outline:none;border-color:#8B0000;',
      'box-shadow:0 0 0 3px rgba(139,0,0,.12)}',
      '.scoutw-pane textarea{resize:vertical;min-height:74px}',
      '.scoutw-pane .scoutw-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
      '.scoutw-pane .scoutw-radios{display:flex;gap:12px;flex-wrap:wrap;padding-top:2px}',
      '.scoutw-pane .scoutw-radios label{font-weight:400;font-size:13.5px;display:flex;align-items:center;gap:5px;cursor:pointer;margin:0}',
      '.scoutw-pane .scoutw-radios input{width:auto}',
      '#scoutw-submit{background:#8B0000;color:#fff;border:none;padding:11px;border-radius:8px;font-weight:700;',
      'font-size:14.5px;cursor:pointer;margin-top:2px}',
      '#scoutw-submit:hover{background:#a80000}',
      '#scoutw-msg{font-size:13px;text-align:center;min-height:18px;color:#888}',
      '#scoutw-src{font-size:11.5px;color:#aaa;text-align:right;min-height:14px}'
    ].join('');
    var s = document.createElement('style');
    s.id = 'scoutw-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ---------- 頁面結構 ----------
  function markup() {
    return '' +
      '<button id="scoutw-fab" type="button" title="回報問題 · 意見回饋">🐛💬 回報 · 意見</button>' +
      '<div id="scoutw-overlay">' +
      '  <div id="scoutw-modal" role="dialog" aria-modal="true">' +
      '    <button id="scoutw-close" type="button" aria-label="關閉">✕</button>' +
      '    <div style="font-size:1.05rem;font-weight:700;margin-bottom:12px;color:#8B0000">⚜️ 問題回報 / 意見回饋</div>' +
      '    <div id="scoutw-tabs">' +
      '      <button type="button" data-pane="issue" class="active">🐛 問題回報</button>' +
      '      <button type="button" data-pane="feedback">💬 意見回饋</button>' +
      '    </div>' +
      // 問題回報
      '    <div class="scoutw-pane open" data-pane="issue">' +
      '      <div><label>標題 *</label><input id="scoutw_i_title" placeholder="例：打卡紀錄無法儲存"></div>' +
      '      <div><label>問題詳情 *</label><textarea id="scoutw_i_desc" placeholder="發生了什麼？如何重現？"></textarea></div>' +
      '      <div class="scoutw-row">' +
      '        <div><label>嚴重度</label><select id="scoutw_i_sev"><option value="低">低</option><option value="中" selected>中</option><option value="高">高</option><option value="緊急">緊急</option></select></div>' +
      '        <div><label>旅團號（選填）</label><input id="scoutw_i_troop" placeholder="0082"></div>' +
      '      </div>' +
      '      <div class="scoutw-row">' +
      '        <div><label>姓名（選填，可匿名）</label><input id="scoutw_i_name" placeholder="留空＝匿名"></div>' +
      '        <div><label>聯絡方式（選填）</label><input id="scoutw_i_contact" placeholder="電郵 / 電話，方便回覆你"></div>' +
      '      </div>' +
      '      <button id="scoutw_i_submit" type="button">提交問題回報</button>' +
      '    </div>' +
      // 意見回饋
      '    <div class="scoutw-pane" data-pane="feedback">' +
      '      <div><label>類型</label><div class="scoutw-radios">' +
      '        <label><input type="radio" name="scoutw_fb_type" value="建議" checked>💡 建議</label>' +
      '        <label><input type="radio" name="scoutw_fb_type" value="讚">👍 讚</label>' +
      '        <label><input type="radio" name="scoutw_fb_type" value="批評">👎 批評</label>' +
      '        <label><input type="radio" name="scoutw_fb_type" value="其他">📝 其他</label>' +
      '      </div></div>' +
      '      <div><label>內容 *</label><textarea id="scoutw_f_content" placeholder="想說什麼就寫什麼…"></textarea></div>' +
      '      <div class="scoutw-row">' +
      '        <div><label>旅團號（選填）</label><input id="scoutw_f_troop" placeholder="0082"></div>' +
      '        <div><label>姓名（選填，可匿名）</label><input id="scoutw_f_name" placeholder="留空＝匿名"></div>' +
      '      </div>' +
      '      <div><label>聯絡方式（選填）</label><input id="scoutw_f_contact" placeholder="電郵 / 電話"></div>' +
      '      <button id="scoutw_f_submit" type="button">提交意見回饋</button>' +
      '    </div>' +
      '    <div id="scoutw-msg"></div>' +
      '    <div id="scoutw-src"></div>' +
      '  </div>' +
      '</div>';
  }

  // ---------- 送出 ----------
  function send(payload, clearFns) {
    var msg = document.getElementById('scoutw-msg');
    msg.style.color = '#888';
    msg.textContent = '提交中…';
    fetch(ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function () {
      // no-cors 讀不到回應；不拋錯即視為成功
      msg.style.color = '#1a7a3c';
      msg.textContent = payload.type === 'issue'
        ? '✅ 問題回報已提交，多謝！管理員會盡快跟進。'
        : '✅ 意見已收到，多謝你！';
      clearFns.forEach(function (fn) { fn(); });
    }).catch(function (err) {
      msg.style.color = '#c62828';
      msg.textContent = '❌ 提交失敗：' + err.message;
    });
  }

  function submitIssue() {
    var title = document.getElementById('scoutw_i_title').value.trim();
    var desc = document.getElementById('scoutw_i_desc').value.trim();
    var msg = document.getElementById('scoutw-msg');
    if (!title || !desc) {
      msg.style.color = '#c62828';
      msg.textContent = '⚠️ 請填寫標題和問題詳情（*）';
      return;
    }
    send({
      type: 'issue',
      sourceApp: SOURCE_APP,
      title: title,
      desc: desc,
      severity: document.getElementById('scoutw_i_sev').value,
      troopId: document.getElementById('scoutw_i_troop').value.trim(),
      name: document.getElementById('scoutw_i_name').value.trim(),
      contact: document.getElementById('scoutw_i_contact').value.trim()
    }, [function () {
      document.getElementById('scoutw_i_title').value = '';
      document.getElementById('scoutw_i_desc').value = '';
      document.getElementById('scoutw_i_troop').value = '';
      document.getElementById('scoutw_i_name').value = '';
      document.getElementById('scoutw_i_contact').value = '';
    }]);
  }

  function submitFeedback() {
    var content = document.getElementById('scoutw_f_content').value.trim();
    var msg = document.getElementById('scoutw-msg');
    if (!content) {
      msg.style.color = '#c62828';
      msg.textContent = '⚠️ 請填寫回饋內容（*）';
      return;
    }
    var typeEl = document.querySelector('input[name="scoutw_fb_type"]:checked');
    send({
      type: 'feedback',
      sourceApp: SOURCE_APP,
      fbType: typeEl ? typeEl.value : '建議',
      content: content,
      troopId: document.getElementById('scoutw_f_troop').value.trim(),
      name: document.getElementById('scoutw_f_name').value.trim(),
      contact: document.getElementById('scoutw_f_contact').value.trim()
    }, [function () {
      document.getElementById('scoutw_f_content').value = '';
      document.getElementById('scoutw_f_troop').value = '';
      document.getElementById('scoutw_f_name').value = '';
      document.getElementById('scoutw_f_contact').value = '';
    }]);
  }

  // ---------- 掛載 ----------
  function mount() {
    if (document.getElementById('scoutw-fab')) return;
    injectStyle();
    var wrap = document.createElement('div');
    wrap.id = 'scoutw-root';
    wrap.innerHTML = markup();
    document.body.appendChild(wrap);

    var overlay = document.getElementById('scoutw-overlay');
    function open() { overlay.classList.add('open'); }
    function close() { overlay.classList.remove('open'); }

    document.getElementById('scoutw-fab').addEventListener('click', open);
    document.getElementById('scoutw-close').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    var tabBtns = document.querySelectorAll('#scoutw-tabs button');
    tabBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        tabBtns.forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        document.querySelectorAll('.scoutw-pane').forEach(function (p) {
          p.classList.toggle('open', p.getAttribute('data-pane') === b.getAttribute('data-pane'));
        });
        document.getElementById('scoutw-msg').textContent = '';
      });
    });

    document.getElementById('scoutw_i_submit').addEventListener('click', submitIssue);
    document.getElementById('scoutw_f_submit').addEventListener('click', submitFeedback);

    document.getElementById('scoutw-src').textContent = SOURCE_APP ? '來自：' + SOURCE_APP : '';

    if (AUTO_OPEN) open();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
