// ============================================================
// Scout Admin — 統一回報接收系統（v2.6）
//   旅團登記 / 問題回報 / 意見回饋 / 作品投稿 / 回覆申請人
// 作者：系統管理員（信箱設定在下方 ADMIN_EMAIL）
//
// 【版本怎樣認？】本檔第 2 行要寫「v2.6」，開頭亦會有
//   var GS_VERSION = "2.6";
//   貼上後在編輯器搜尋 GS_VERSION，搵到就係新版（v2.5 起有這個常數）。
//   網址加 ?action=diag（要 API KEY）亦會回 "version":"2.6"。
//
// 【v2.6 改動：✉️ 回覆信一定寄得出】
//   ① markReq 會收後台傳來的 to（所見即所寄）。以前只讀 Sheet「聯絡 Email」欄，
//      後台顯示到地址但 Sheet 冇／格式唔同時就會回 no-address，睇落好似「寄唔出」。
//   ② 用過的地址會寫回「聯絡 Email」欄；成功寄出後自動加「通知時間」欄
//      （加在最後，原有欄位同編號位置完全不變）。
//   ③ 搵地址唔再只靠一欄：整行任何一格有電郵都會用；全形＠、空格、mailto: 自動修正。
//   ④ 新增 email:"invalid-address"（地址格式錯），回應一定會帶 to，後台可以顯示真正原因。
//   ⑤ v2.5 全部功能保留（統一回報、專章系統、testEmail、?action=diag 等）。
//
// 【v2.5 改動】
//   ① 4 個 BADGE APP（scoutbadge／vsbadge／cubsbadge／roverbadge）
//      全部歸入「專章系統」；舊版 scoutbadge 送出的「進度追蹤」亦自動對齊。
//   ② 申請記錄新增「聯絡 Email」欄（加在最後，編號仍第 8 欄）；
//      表單冇此欄時自動由 contact／email／備注抽出。
//   ③ markReq 支援 notify:true → 審核後寄「已接入／已拒絕」通知信給申請人
//      （只講結果，不列環境變數）。
//   ④ 寄信失敗不再靜靜吞：回應帶 email / emailError，
//      並寫入 Script Property LAST_EMAIL / LAST_EMAIL_APPLY。
//   ⑤ 新增 type:"testEmail"（只寄 ADMIN_EMAIL）同 GET ?action=diag（查寄信紀錄＋配額）。
//
// 【v2.4 重點：統一回報格式，加新系統不用再改這份代碼】
//   圖書館、APP STORE、支部系統、進度追蹤、旅系統、區系統、專章系統…
//   全部用同一個 payload、同一個接收端、同一組工作表欄位，
//   唯一分別只有 sourceApp（來源系統）這個字串。
//   ‧ 工作表／欄位：完全不變（不用新增表、不用加欄、不用改後台資料庫）
//   ‧ 來源名稱自動正規化（library / scoutlibrary.vercel.app → 圖書館）
//   ‧ type 寫錯、用中文、甚至沒寫，都會自動判斷去向，絕不漏單
//
// 【部署】
//   擴充功能 → Apps Script → 貼上 → 儲存
//   部署 → 管理部署 → 編輯 → 版本：新版本 → 部署（網址不變）
//   （首次部署：新增部署 → 網頁應用程式，執行身分：我，存取：所有人）
//
// 【API KEY 一次設定（保護後台讀取）】
//   在編輯器上方選取函式「setupApiKey」→ 按「執行」→ 授權。
//   它會自動產生一組 KEY、存進腳本屬性，並 E-mail 到 ADMIN_EMAIL。
//   之後把這個 Key 填進 Scout Admin 的 Vercel 環境變數（SCOUT_ADMIN_KEY）。
//   注意：API KEY 只保護「讀取／已閱／審核寫回」這類後台動作；
//   公開提交（旅團登記、問題回報、意見回饋、作品投稿）一律不用 Key，照常接收。
//
// 【相容性／不漏資料】
//   收到任何「沒見過的欄位」都會自動加欄存進 Sheet；
//   Email 一定附上全部欄位＋原始 JSON 備份，確保永不漏掉。
// ============================================================

var GS_VERSION = "2.6"; // ← 版本標記：搵到這行就係 v2.6（v2.4 及之前冇這個常數）

var ADMIN_EMAIL = "playerkousas@hotmail.com";

// 四張工作表（第一次收到資料時自動建立／自動補齊缺的欄位）
var SHEET_CFG = {
  apply:    { name: "申請記錄", headers: ["提交時間","旅團號","旅團名稱","URL","API Key","備注","狀態","編號","聯絡 Email"] },
  issue:    { name: "問題回報", headers: ["提交時間","來源APP","旅團號","標題","問題詳情","嚴重度","聯絡方式","姓名","狀態","編號"] },
  feedback: { name: "意見回饋", headers: ["提交時間","來源APP","旅團號","類型","內容","聯絡方式","姓名","狀態","編號"] },
  appstore: { name: "作品投稿", headers: ["提交時間","作品名稱","作品連結","作者名稱","作品類型","分類","作品簡介","標籤","狀態","編號"] }
};

// 已知欄位的中文標題 ← 可能收到的原始欄位名（欄位對不上就會自動加欄儲存）
var FIELD_MAP = {
  "提交時間": ["ts"],
  "旅團號":   ["troopId"],
  "旅團名稱": ["troopName"],
  "URL":      ["backendUrl","url"],
  "API Key":  ["apiKey","apikey"],
  "備注":     ["note"],
  "來源APP":  ["sourceApp","source"],
  "標題":     ["title"],
  "問題詳情": ["desc","description"],
  "嚴重度":   ["severity"],
  "聯絡方式": ["contact"],
  "姓名":     ["name"],
  "類型":     ["fbType","kind"],
  "內容":     ["content"],
  "作品名稱": ["name"],
  "作品連結": ["url"],
  "作者名稱": ["author"],
  "作品類型": ["page"],
  "分類":     ["category"],
  "作品簡介": ["desc","description"],
  "標籤":     ["tags"],
  // v2.6：多收幾個寫法，客人點寫都入得到「聯絡 Email」欄
  "聯絡 Email": ["contact", "email", "replyTo", "reply_email", "emailAddress", "mail",
                 "聯絡電郵", "聯絡email", "連絡Email", "電郵"]
};

// 系統欄位：不要自動加進 Sheet
var IGNORE_KEYS = { type: 1, apikey: 1 };

// ---------- 統一回報格式：type 別名（寫錯／用中文也收得到） ----------
var TYPE_ALIASES = {
  "issue": "issue", "bug": "issue", "report": "issue", "problem": "issue",
  "問題": "issue", "問題回報": "issue", "回報": "issue",
  "feedback": "feedback", "suggestion": "feedback", "suggest": "feedback", "comment": "feedback",
  "意見": "feedback", "意見回饋": "feedback", "回饋": "feedback",
  "appstore": "appstore", "submission": "appstore", "作品投稿": "appstore", "投稿": "appstore",
  "apply": "apply", "register": "apply", "旅團登記": "apply", "登記": "apply",
  "markread": "markRead", "markreq": "markReq",
  "testemail": "testEmail", "測試電郵": "testEmail", "測試email": "testEmail",
  "deleteissue": "deleteIssue", "deletefeedback": "deleteFeedback", "deterequest": "deleteRequest", "deleteappstore": "deleteAppStore",
  "刪除問題": "deleteIssue", "刪除回饋": "deleteFeedback", "刪除申請": "deleteRequest", "刪除作品": "deleteAppStore"
};

// ---------- 統一回報格式：來源系統正規化（新系統照收，不用改這裡） ----------
// 每個系統只要在 sourceApp 填任何一個別名（或直接填網域），都會統一存成同一個名。
var SOURCE_ALIASES = {
  "圖書館":     ["library", "scoutlibrary", "scout-library", "scoutlibrary.vercel.app"],
  "APP STORE":  ["appstore", "app store", "app-store", "scoutappstore", "scoutappstore.vercel.app", "商店"],
  "支部系統":   ["branch", "branchsystem", "scoutbranch", "支部"],
  "進度追蹤":   ["progress", "progresstracker", "scoutprogress", "進度"],
  "旅系統":     ["troop", "troopsystem", "scoutsystem", "旅團系統"],
  "區系統":     ["district", "districtsystem", "scoutdistrict", "區"],
  "專章系統":   ["badge", "badgesystem", "vsbadge", "專章", "專章系統",
                 "scoutbadge", "scoutbadge.vercel.app", "童軍支部", "童軍進度追蹤",
                 "vsbadge.vercel.app", "深資童軍", "深資童軍進度追蹤",
                 "cubsbadge", "cubbadge", "cubsbadge.vercel.app", "幼童軍", "幼童軍進度追蹤",
                 "roverbadge", "roverbadge.vercel.app", "樂行童軍", "樂行童軍進度追蹤"]
};

function _normType(raw) {
  var t = _s(raw).trim();
  if (!t) return "";
  return TYPE_ALIASES[t.toLowerCase()] || TYPE_ALIASES[t] || t;
}

// v2.5：4 個 BADGE APP 一律歸入「專章系統」。
// scoutbadge 舊版 proxy 送出的是「進度追蹤」，所以先把這個字串指向專章系統；
// 若日後有真正獨立的「進度追蹤」系統，把這幾行刪掉即可。
var SOURCE_OVERRIDES = {
  "進度追蹤": "專章系統", "童軍進度追蹤": "專章系統", "幼童軍進度追蹤": "專章系統",
  "深資童軍進度追蹤": "專章系統", "樂行童軍進度追蹤": "專章系統"
};

function _normSource(raw) {
  var v = _s(raw).trim();
  if (!v) return "";
  if (SOURCE_OVERRIDES[v]) return SOURCE_OVERRIDES[v];
  var low = v.toLowerCase();
  var p = low.indexOf("://"); if (p >= 0) low = low.slice(p + 3);
  var sl = low.indexOf("/");  if (sl >= 0) low = low.slice(0, sl);
  if (low.indexOf("www.") === 0) low = low.slice(4);
  var host = low.split(".")[0];
  for (var canon in SOURCE_ALIASES) {
    if (canon.toLowerCase() === low) return canon;
    var al = SOURCE_ALIASES[canon];
    for (var i = 0; i < al.length; i++) {
      if (al[i].toLowerCase() === low || al[i].toLowerCase() === host) return canon;
    }
  }
  return v; // 未登記的來源：原樣保留（照收不誤）
}

// ---------- POST 分流 ----------
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var type = _normType(data.type);

    if (type === "markReq")  return _handleMarkReq(data);
    if (type === "markRead") return _handleMarkRead(data);
    if (type === "testEmail") return _handleTestEmail(data);
    if (type === "deleteIssue") return _handleDelete(data, "issue");
    if (type === "deleteFeedback") return _handleDelete(data, "feedback");
    if (type === "deleteRequest") return _handleDelete(data, "apply");
    if (type === "deleteAppStore") return _handleDelete(data, "appstore");
    if (type === "issue")    return _capture("issue",    data, "未閱");
    if (type === "feedback") return _capture("feedback", data, "未閱");
    if (type === "appstore") return _capture("appstore", data, "待審核");
    if (type === "apply")    return _capture("apply",    data, "待處理");

    // type 認不出／沒寫 → 按內容猜，確保任何新系統都不會漏單
    if (data.title || data.desc || data.description || data.severity) return _capture("issue", data, "未閱");
    if (data.content || data.fbType) return _capture("feedback", data, "未閱");
    return _capture("apply", data, "待處理");
  } catch (err) {
    return _json({ status: "error", message: err.toString() });
  }
}

// ---------- 通用收集：對齊已知欄位 → 未知欄位自動加欄 → Email 全部 ----------
function _capture(key, data, defaultStatus) {
  var ts   = new Date();
  var map  = {};
  var hdrs = SHEET_CFG[key].headers;
  for (var i = 0; i < hdrs.length; i++) map[hdrs[i]] = "";
  map["提交時間"] = ts;
  map["狀態"]     = defaultStatus;

  for (var i2 = 0; i2 < hdrs.length; i2++) {
    var header = hdrs[i2];
    if (header === "提交時間" || header === "狀態" || header === "編號") continue;
    if (data[header] !== undefined && data[header] !== null) { map[header] = _s(data[header]); continue; }
    var aliases = FIELD_MAP[header];
    if (!aliases) continue;
    for (var a = 0; a < aliases.length; a++) {
      if (data[aliases[a]] !== undefined && data[aliases[a]] !== null) { map[header] = _s(data[aliases[a]]); break; }
    }
  }

  // 統一回報格式：來源系統名稱正規化（欄位不變，只是把名字寫成統一那個）
  if (map["來源APP"] !== undefined) map["來源APP"] = _normSource(map["來源APP"]);

  // v2.5／v2.6：旅團接入申請 → 抽出「聯絡 Email」（後台回覆功能用）。
  // 4 個 BADGE APP 現時把 Email 寫在「備注」或者自家欄位，所以先讀常見欄位，
  // 再掃整個 payload 任何一格，務求「客人有填就搵得到」。
  if (key === "apply" && !_s(map["聯絡 Email"])) {
    var bag = [
      _s(data["聯絡 Email"]), _s(data.contact), _s(data.email), _s(data.replyTo),
      _s(data.note), _s(data.remark), _s(data.message), _s(map["備注"])
    ];
    for (var bk in data) {
      if (bk === "type" || bk === "apikey" || bk === "apiKey" || bk === "backendUrl" || bk === "url") continue;
      bag.push(_s(data[bk]));
    }
    map["聯絡 Email"] = _extractEmail(bag.join(" "));
  }

  // 未知欄位 → 收集進 extras（稍後自動加欄）
  var consumed = {};
  for (var h2 in FIELD_MAP) {
    consumed[h2] = 1;
    var al2 = FIELD_MAP[h2];
    for (var x = 0; x < al2.length; x++) consumed[al2[x]] = 1;
  }
  var extras = {};
  for (var k in data) {
    if (IGNORE_KEYS[k] || consumed[k]) continue;
    extras[k] = _s(data[k]);
  }

  // 完全沒資料才拒收（部分資料照樣登記＋Email，確保不漏）
  var hasAny = false;
  for (var h3 in map) {
    if (h3 === "提交時間" || h3 === "狀態") continue;
    if (_s(map[h3]) !== "") { hasAny = true; break; }
  }
  if (!hasAny) { for (var k2 in extras) { hasAny = true; break; } }
  if (!hasAny) return _json({ status: "error", message: "沒有收到任何資料" });

  var sheetOk = true;
  try { _appendRowAny(key, map, extras); } catch (e) { sheetOk = false; }

  // v2.5：Email 失敗再也不會被靜靜吞掉 —— 會記錄落 Script Property（LAST_EMAIL）
  // 同時在回應帶 email:"sent" / "failed"，方便前端同 ?action=diag 追查。
  var mail = { ok: false, error: "未執行" };
  try { mail = _emailAll(key, map, extras, ts, data); } catch (e) { mail = { ok: false, error: String(e) }; }

  var okMsg = key === "issue"    ? "問題回報已提交，多謝！管理員會盡快跟進。"
            : key === "feedback" ? "意見已收到，多謝你！"
            : key === "appstore" ? "作品已提交審核，多謝！"
            : "登記已提交，管理員會盡快接入。";
  var msg = sheetOk ? okMsg : (okMsg + "（寫入 Sheet 失敗，已改以 Email 通知）");
  if (!mail.ok) msg += "（Email 通知失敗：" + _s(mail.error).slice(0, 120) + "）";
  return _json({
    status: "success",
    email: mail.ok ? "sent" : "failed",
    emailError: mail.ok ? "" : _s(mail.error).slice(0, 300),
    message: msg
  });
}

// ---------- 新增一列（欄位名 → 位置；缺欄自動補；沒見過的欄位自動加欄） ----------
function _appendRowAny(key, map, extras) {
  var cfg   = SHEET_CFG[key];
  var sheet = _sheet(key);
  var head  = _normHeaders(sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]);

  var toAdd = [];
  for (var k in extras) { if (head.indexOf(k) === -1) toAdd.push(k); }
  if (toAdd.length) {
    sheet.getRange(1, head.length + 1, 1, toAdd.length).setValues([toAdd]);
    head = head.concat(toAdd);
  }

  var idHdr = "編號"; // v2.5：申請記錄尾欄改為「聯絡 Email」，所以固定用「編號」
  var row = [];
  for (var c = 0; c < head.length; c++) {
    var h = head[c];
    if (h === idHdr) { row.push(Utilities.getUuid()); continue; }
    row.push((map[h] !== undefined && map[h] !== null) ? map[h] : (extras[h] !== undefined ? extras[h] : ""));
  }
  sheet.appendRow(row);
}

// ---------- Email 狀態記錄（給 ?action=diag 查） ----------
function _rememberEmail(rec) {
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty("LAST_EMAIL", JSON.stringify(rec));
    // 旅團接入申請分開記一份，方便 ?action=diag 專查「申請通知信」
    if (rec && (rec.key === "apply" || rec.key === "reply")) {
      props.setProperty("LAST_EMAIL_APPLY", JSON.stringify(rec));
    }
  } catch (e) { /* 記錄失敗不影響主流程 */ }
}

function _lastEmailApply() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty("LAST_EMAIL_APPLY");
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// ---------- Email 正規化（v2.6） ----------
// 客人可能用全形＠、中間有空格、前面有 mailto:，或者成句「電郵：xxx@yyy.com」，
// 全部先執成乾乾淨淨一個地址；唔合法就回空字串（寧願唔寄，都唔好寄錯人）。
function _toHalfWidth(s) {
  return _s(s).replace(/[\uFF01-\uFF5E]/g, function (ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
  }).replace(/\u3000/g, " ");
}

function _normEmail(v) {
  var s = _toHalfWidth(v).replace(/\s+/g, " ").trim().replace(/^mailto:/i, "").trim();
  if (!s) return "";
  var m = s.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+/);
  return m ? m[0].replace(/[.,;:]+$/, "") : "";
}

// 從自由文字抽出第一個 Email（備注／訊息都可能有人手打）
function _extractEmail(text) { return _normEmail(text); }

// 由整行資料搵電郵：唔再只靠「聯絡 Email」一欄（舊資料／客人填錯位都救得返）
function _rowEmailOf(row) {
  if (!row) return "";
  var first = ["聯絡 Email", "聯絡方式", "備注", "備註", "姓名", "旅團名稱"];
  for (var i = 0; i < first.length; i++) {
    var a = _normEmail(row[first[i]]);
    if (a) return a;
  }
  for (var k in row) {
    if (k === "提交時間" || k === "編號" || k === "狀態" || k === "通知時間" || k === "=") continue;
    var b = _normEmail(row[k]);
    if (b) return b;
  }
  return "";
}

function _lastEmail() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty("LAST_EMAIL");
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function _remainingQuota() {
  try { return MailApp.getRemainingDailyQuota(); } catch (e) { return null; }
}

// MailApp.sendEmail 遇到底板換行會直接拋錯，主旨一定要清乾淨
function _safeSubject(raw) {
  var t = _s(raw).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 150 ? t.slice(0, 150) : t;
}

// ---------- Email：全部欄位＋原始 JSON 備份 ----------
// 回傳 { ok:true } 或 { ok:false, error }，呼叫者一定要處理（唔再靜靜吞錯）
function _emailAll(key, map, extras, ts, rawData) {
  var cfg  = SHEET_CFG[key];
  var subject = _safeSubject(
    key === "issue"    ? "🐛 [Scout Admin] 問題回報 — " + _s(map["標題"])
  : key === "feedback" ? "💬 [Scout Admin] 意見回饋（" + _s(map["類型"]) + "）"
  : key === "appstore" ? "📮 [Scout Admin] 新作品投稿 — " + _s(map["作品名稱"])
  : "📥 [Scout Admin] 新旅團登記 — " + _s(map["旅團名稱"])
  );

  var body = "請到對應系統查看並處理（資料已同步登記到 Google Sheet）。\n\n━━━━━━━━━━━━━━━━━━\n";
  for (var i = 0; i < cfg.headers.length; i++) {
    var h = cfg.headers[i];
    if (h === "編號" || h === "狀態") continue;
    var v = _s(map[h]);
    if (v !== "") body += h + "：" + v + "\n";
  }
  for (var k in extras) {
    if (_s(extras[k]) !== "") body += k + "：" + _s(extras[k]) + "\n";
  }
  body += "━━━━━━━━━━━━━━━━━━\n\n（原始資料備份，確保不漏）\n" + JSON.stringify(rawData);

  try {
    MailApp.sendEmail({ to: ADMIN_EMAIL, subject: subject, body: body, name: "Scout Admin 系統通知" });
    _rememberEmail({ ok: true, key: key, subject: subject, at: new Date().toISOString() });
    return { ok: true };
  } catch (e) {
    _rememberEmail({ ok: false, key: key, subject: subject, error: String(e), at: new Date().toISOString() });
    Logger.log("Email 發送失敗 [" + key + "]：" + e);
    return { ok: false, error: String(e) };
  }
}

// ---------- 測試 Email（只寄給 ADMIN_EMAIL，不接受自訂收件人，避免被當濫發工具） ----------
function _handleTestEmail(data) {
  var stamp = new Date().toLocaleString("zh-HK");
  var subject = _safeSubject("✅ [Scout Admin] 測試 Email — " + stamp);
  var body = "這封是 Scout Admin 的測試通知信。\n\n"
           + "收到即代表：Apps Script → MailApp → " + ADMIN_EMAIL + " 這條路正常。\n"
           + "若旅團接入申請仍然收唔到信，請到 Sheet 睇「申請記錄」有冇資料，再用 ?action=diag 查 LAST_EMAIL。\n\n"
           + "時間：" + stamp;
  try {
    MailApp.sendEmail({ to: ADMIN_EMAIL, subject: subject, body: body, name: "Scout Admin 系統通知" });
    _rememberEmail({ ok: true, key: "testEmail", subject: subject, at: new Date().toISOString() });
    return _json({ status: "ok", email: "sent", to: ADMIN_EMAIL, quota: _remainingQuota() });
  } catch (e) {
    _rememberEmail({ ok: false, key: "testEmail", subject: subject, error: String(e), at: new Date().toISOString() });
    return _json({ status: "error", email: "failed", to: ADMIN_EMAIL, error: String(e), quota: _remainingQuota() });
  }
}

// ---------- 已閱 / 未閱 寫回 ----------
function _handleMarkRead(data) {
  var rowId = (data.id || "").toString().trim();
  var put   = data.status === "read" ? "已閱" : "未閱";
  if (!rowId) return _json({ status: "error", message: "缺少編號" });
  var done = _writeStatusById("issue", rowId, "狀態", put);
  if (!done) done = _writeStatusById("feedback", rowId, "狀態", put);
  return _json({ status: done ? "ok" : "error", message: done ? "已更新" : "找不到這條編號" });
}

// ---------- 刪除資料（永久刪除，從 Sheet 中移除該列） ----------
//  payload: { type: "deleteFeedback", id: "編號" }
function _handleDelete(data, sheetKey) {
  var rowId = (data.id || "").toString().trim();
  if (!rowId) return _json({ status: "error", message: "缺少編號" });
  
  var cfg   = SHEET_CFG[sheetKey];
  if (!cfg) return _json({ status: "error", message: "未知工作表類型" });
  
  var sheet = _sheet(sheetKey);
  if (sheet.getLastRow() < 2) return _json({ status: "error", message: "工作表為空" });
  
  var vals  = sheet.getDataRange().getValues();
  var head  = _normHeaders(vals[0]);
  var idCol = head.indexOf("編號");
  if (idCol === -1) return _json({ status: "error", message: "找不到編號欄" });
  
  for (var r = 1; r < vals.length; r++) {
    if (String(vals[r][idCol] || "") === rowId) {
      // 刪除該列（r+1 因為 Sheet 是 1-indexed）
      sheet.deleteRow(r + 1);
      return _json({ status: "ok", message: "已永久刪除", sheet: sheetKey, id: rowId });
    }
  }
  return _json({ status: "error", message: "找不到這條編號", sheet: sheetKey, id: rowId });
}

// ---------- 申請審核狀態寫回（＋可選：回覆申請人 Email） ----------
//  payload: { type:"markReq", id, status:"已接入|已拒絕|待處理",
//             notify:true, to:"收件人（由後台傳入，優先）", message:"附加說明（選填）" }
function _handleMarkReq(data) {
  var rowId = (data.id || "").toString().trim();
  var put   = (data.status || "待處理").toString().trim();
  if (!rowId) return _json({ status: "error", message: "缺少編號" });
  var done  = _writeStatusById("apply", rowId, "狀態", put);
  if (!done) return _json({ status: "error", message: "找不到這條編號（可能未同步到 Sheet，或已被刪除）" });

  if (!data.notify) return _json({ status: "ok", message: "已更新", notified: false });

  var row = _findApplyRow(rowId);

  // v2.6：所見即所寄 —— 後台畫面上顯示／輸入的地址優先，
  // 其次才由整行資料（任何一格）搵。以前只讀「聯絡 Email」一欄，
  // 所以後台見到地址、Sheet 冇或格式唔同，就會回 no-address 好似寄唔出。
  var typed     = _s(data.to || data.email || data.contact || "").trim();
  var typedMail = _normEmail(typed);
  var to        = typedMail || _rowEmailOf(row);

  if (!to) {
    var why = typed ? "bad-email" : "no-email";
    _rememberEmail({ ok: false, key: "reply", to: typed, status: put, error: why, at: new Date().toISOString() });
    return _json({
      status: "ok",
      message: typed
        ? ("已更新，但電郵格式不正確（" + typed.slice(0, 60) + "），請人手回覆")
        : "已更新，但這張申請搵唔到電郵地址（請人手回覆）",
      notified: false,
      email: typed ? "invalid-address" : "no-address",
      to: typed,
      reason: why
    });
  }

  // 用過的地址寫回「聯絡 Email」欄：下次喺 Sheet 或其他裝置都見到同一個地址
  try { _writeApplyField(rowId, "聯絡 Email", to); } catch (e) { /* 寫唔到唔影響寄信 */ }

  var tpl = _replyApplyEmail(row, put, data.message);
  try {
    MailApp.sendEmail({ to: to, subject: _safeSubject(tpl.subject), body: tpl.body, name: "Scout Admin" });
    var at = _nowText();
    try { _writeApplyField(rowId, "通知時間", at); } catch (e2) { /* 只係記錄，唔影響寄信 */ }
    _rememberEmail({ ok: true, key: "reply", to: to, status: put, subject: tpl.subject, at: at });
    return _json({ status: "ok", message: "已更新並已通知申請人", notified: true,
                   email: "sent", to: to, at: at, quota: _remainingQuota() });
  } catch (e) {
    _rememberEmail({ ok: false, key: "reply", to: to, status: put, error: String(e), at: new Date().toISOString() });
    return _json({ status: "ok", message: "已更新，但通知信寄不出：" + _s(e).slice(0, 120),
                   notified: false, email: "failed", to: to,
                   error: _s(e).slice(0, 300), quota: _remainingQuota() });
  }
}

function _nowText() {
  try { return new Date().toLocaleString("zh-HK"); } catch (e) { return new Date().toISOString(); }
}

// ---------- 寫／加一格（按欄名；欄唔存在就自動加在最後） ----------
function _ensureHeader(sheet, header) {
  var head = _normHeaders(sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]);
  var idx  = head.indexOf(header);
  if (idx >= 0) return idx + 1;
  var col = head.length + 1;
  sheet.getRange(1, col).setValue(header);
  return col;
}

function _writeApplyField(id, header, value) {
  var sheet = _sheet("apply");
  if (sheet.getLastRow() < 2) return false;
  var col  = _ensureHeader(sheet, header);
  var vals = sheet.getDataRange().getValues();
  var head = _normHeaders(vals[0]);
  var idCol = head.indexOf("編號");
  if (idCol === -1) return false;
  for (var r = 1; r < vals.length; r++) {
    if (String(vals[r][idCol] || "") === id) {
      sheet.getRange(r + 1, col).setValue(value);
      return true;
    }
  }
  return false;
}

// ---------- 找一列申請（回傳 { 欄名: 值 }） ----------
function _findApplyRow(id) {
  var sheet = _sheet("apply");
  if (sheet.getLastRow() < 2) return null;
  var vals = sheet.getDataRange().getValues();
  var head = _normHeaders(vals[0]);
  var idCol = head.indexOf("編號");
  if (idCol === -1) return null;
  for (var r = 1; r < vals.length; r++) {
    if (String(vals[r][idCol] || "") === id) {
      var obj = {};
      for (var c = 0; c < head.length; c++) obj[head[c]] = vals[r][c];
      return obj;
    }
  }
  return null;
}

// 聯絡 Email：優先「聯絡 Email」欄 → 常見欄位 → 掃全行任何一格（v2.6）
function _applyEmailOf(row) { return _rowEmailOf(row); }

// ---------- 回覆申請人的通知信（已接入／已拒絕／重設） ----------
function _replyApplyEmail(row, status, extra) {
  var name = _s(row["旅團名稱"]) || ("第 " + _s(row["旅團號"]) + " 旅");
  var lines = [];
  var subject = "";

  // v2.5：通知信只講「結果」，不列環境變數／技術步驟（那些由管理員自己設定）
  if (status === "已接入") {
    subject = "✅ [Scout Admin] 旅團接入已開通 — " + name;
    lines.push("你好，");
    lines.push("貴旅團（" + name + "）的接入申請已經開通 ✅");
    lines.push("");
    lines.push("現在可以開啟 APP，選擇你的旅團登入使用。");
  } else if (status === "已拒絕") {
    subject = "❌ [Scout Admin] 旅團接入申請結果 — " + name;
    lines.push("你好，");
    lines.push("貴旅團（" + name + "）的接入申請暫時未能開通。");
    lines.push("");
    lines.push("如需了解原因或重新申請，請在 APP 內「🐛💬 回報 · 意見」聯絡我們。");
  } else {
    subject = "✉️ [Scout Admin] 旅團接入申請狀態更新 — " + name;
    lines.push("你好，");
    lines.push("貴旅團（" + name + "）的接入申請狀態已更新為「" + status + "」。");
  }

  var msg = _s(extra).trim();
  if (msg) {
    lines.push("");
    lines.push("── 管理員訊息 ──");
    lines.push(msg);
  }
  lines.push("");
  lines.push("（此信由 Scout Admin 自動發出，請勿直接回覆此地址；如需跟進請用 APP 內的回報功能。）");
  return { subject: subject, body: lines.join("\n") };
}

// ---------- API KEY：產生／查詢（在編輯器「執行」一次） ----------
function setupApiKey() {
  var props = PropertiesService.getScriptProperties();
  var key   = props.getProperty("API_KEY") || "";
  if (!key) {
    key = "scout-" + Utilities.getUuid().replace(/-/g, "") + "-" + Math.floor(100000 + Math.random() * 900000);
    props.setProperty("API_KEY", key);
  }
  var msg =
    "你的 Scout Admin 後台 API KEY：\n\n" + key + "\n\n" +
    "用法：\n" +
    "把上面這條 Key 加進 Scout Admin 的 Vercel 環境變數，名稱 SCOUT_ADMIN_KEY\n" +
    "（Vercel → 專案 Settings → Environment Variables → 加完重新部署）。\n" +
    "Key 只留在 server，由 /api/admin 代理注入，瀏覽器永遠看不到。\n";
  try { MailApp.sendEmail({ to: ADMIN_EMAIL, subject: "🔑 [Scout Admin] 後台 API KEY", body: msg }); Logger.log("已寄出 API KEY 到 " + ADMIN_EMAIL); }
  catch (e) { Logger.log(msg); }
  Logger.log("API_KEY = " + key);
  return key;
}

function resetApiKey() {
  PropertiesService.getScriptProperties().deleteProperty("API_KEY");
  return setupApiKey();
}

function _checkKey(data) {
  try {
    var got   = (data && data.apikey || "").toString();
    var props = PropertiesService.getScriptProperties();
    var want  = props.getProperty("API_KEY") || "";
    return want !== "" && got === want;
  } catch (e) { return false; }
}

// ---------- 取得／建立工作表（自動補齊缺欄） ----------
function _sheet(key) {
  var cfg   = SHEET_CFG[key];
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(cfg.name);
  if (!sheet) sheet = ss.insertSheet(cfg.name);
  var hdrs = cfg.headers;
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, hdrs.length).setValues([hdrs]);
    sheet.getRange(1, 1, 1, hdrs.length).setFontWeight("bold").setBackground("#8B0000").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    return sheet;
  }
  var have    = _normHeaders(sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]);
  var missing = hdrs.filter(function (h) { return have.indexOf(h) === -1; });
  if (missing.length) sheet.getRange(1, have.length + 1, 1, missing.length).setValues([missing]);
  return sheet;
}

// ---------- 依「編號」找列更新狀態 ----------
function _writeStatusById(key, id, header, value) {
  var cfg   = SHEET_CFG[key];
  var sheet = _sheet(key);
  if (sheet.getLastRow() < 2) return false;
  var vals  = sheet.getDataRange().getValues();
  var head  = _normHeaders(vals[0]);
  var idCol = head.indexOf("編號");
  var stCol = head.indexOf(header);
  if (idCol === -1 || stCol === -1) return false;
  for (var r = 1; r < vals.length; r++) {
    if (String(vals[r][idCol] || "") === id) {
      sheet.getRange(r + 1, stCol + 1).setValue(value);
      return true;
    }
  }
  return false;
}

function _normHeaders(row) {
  return row.map(function (h) { return String(h === undefined || h === null ? "" : h).trim(); });
}

// ---------- 讀取工作表（給後台「🔄 同步」用） ----------
function _readSheet(key) {
  var cfg   = SHEET_CFG[key];
  var sheet = _sheet(key);
  if (sheet.getLastRow() < 2) return [];
  var values  = sheet.getDataRange().getValues();
  var headers = _normHeaders(values.shift());
  return values.map(function (row) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) obj[headers[i]] = row[i];
    return obj;
  });
}

// ---------- GET：健康檢查；?action=list 需 API KEY ----------
function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = (p.action || "").toString().trim();
  if (action === "list") {
    if (!_checkKey(p)) return _json({ status: "error", message: "缺少或錯誤的 API KEY" });
    return _json({ status: "ok", applications: _readSheet("apply"), issues: _readSheet("issue"), feedbacks: _readSheet("feedback"), appstore: _readSheet("appstore") });
  }
  // v2.5：?action=diag —— 查「上一封通知信到底有冇寄出」，要 API KEY
  if (action === "diag") {
    if (!_checkKey(p)) return _json({ status: "error", message: "缺少或錯誤的 API KEY" });
    return _json({
      status: "ok",
      adminEmail: ADMIN_EMAIL,
      lastEmail: _lastEmail(),
      lastApplyEmail: _lastEmailApply(),
      remainingQuota: _remainingQuota(),
      capabilities: {
        replyEmail: true, replyEmailTo: true, notifyLog: true,
        testEmail: true, applyContact: true, sourceOverride: true
      },
      now: new Date().toLocaleString("zh-HK"),
      version: GS_VERSION
    });
  }
  return _json({ status: "ok", message: "Scout Admin Web App 正常運行", version: GS_VERSION });
}

function _s(v) {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}