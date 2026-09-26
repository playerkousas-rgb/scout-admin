# Scout Admin — 統一回報 · 旅團接入管理中心 說明書

> 版本：2.4 | 作者：系統管理員
> 本次大改：
> ① **統一回報格式 v1**：所有系統（圖書館、APP STORE、支部系統、進度追蹤、旅系統、區系統、專章系統…）用**同一個 payload、同一個接收端、同一組工作表欄位**回報，唯一分別只有 `sourceApp`（來源系統）
> ② 後台「問題回報 / 意見回饋」加**來源系統膠囊**：一眼看到每個系統各有幾條未閱，點一下只看該系統
> ③ Apps Script v2.4：**來源名稱自動正規化**、**type 別名／中文／漏寫也收得到**、**工作表與欄位完全不變**
> ④ 移除已無用的「🔧 產生器」與「⚙️ 設定」分頁
> ⑤ 保留：SUPER KEY 密碼門、API KEY 只留 Vercel 環境變數、已閱／審核寫回 Sheet
> 部署網址：https://scout-admin-blue.vercel.app/

---

## 〇、統一回報格式 v1（本次核心）

### 設計目標

> 之後每加一個系統（支部系統、進度追蹤、旅系統、區系統、專章系統…），
> **不用改 Apps Script、不用加工作表、不用加欄位、不用改後台資料庫（Supabase 等）、不用改後台代碼。**

### 怎樣做到

| 層 | 做法 | 加新系統要做什麼 |
|----|------|-----------------|
| 用戶端 | 全部系統貼**同一行 widget**，只有 `data-app` 不同 | 貼一行 |
| 傳輸 | 全部送**同一個 Apps Script Web App**，同一個 JSON 格式 | 不用做 |
| 儲存 | 仍然是原本那 4 張工作表、原本那些欄位；系統分辨靠既有的**「來源APP」欄** | **不用做** |
| 後端 | GS 自動把來源名稱對齊（`library` / `scoutlibrary.vercel.app` → `圖書館`） | 不用做（要正式中文名才加一行別名） |
| 後台 | TICK 看板自動長出該系統的**來源膠囊**與未閱數 | 不用做（要圖示／排序才加一行 `SOURCE_APPS`） |

**一句話**：新系統 = 一行 `data-app`，其他全部照舊。

### 統一 payload（兩邊格式對齊，永遠只有這些欄位）

問題回報：

```json
{
  "type": "issue",
  "sourceApp": "圖書館",
  "title": "借書紀錄無法儲存",
  "desc": "按儲存後沒有反應",
  "severity": "高",
  "troopId": "0082",
  "name": "",
  "contact": ""
}
```

意見回饋：

```json
{
  "type": "feedback",
  "sourceApp": "圖書館",
  "fbType": "建議",
  "content": "想要夜間模式",
  "troopId": "",
  "name": "",
  "contact": ""
}
```

- `sourceApp` 以外的欄位，**所有系統一模一樣**
- `name`、`contact`、`troopId` 一律**選填**（可匿名）
- 提交**不需要 API KEY、不需要登入**

### 容錯（不漏單保證）

| 情況 | 系統行為 |
|------|---------|
| `type` 寫成 `bug`／`問題回報`／`suggestion`／`意見` | 自動對應到 issue／feedback |
| `type` 沒寫或認不出 | 有 `title`/`desc` → 問題回報；有 `content` → 意見回饋；否則 → 旅團登記 |
| `sourceApp` 寫網域或英文（`scoutappstore.vercel.app`） | 自動對齊成 `APP STORE` |
| `sourceApp` 是未登記的新系統 | **原樣保留**，後台顯示 `🔹 名稱`，照樣分流、照樣統計 |
| 送來沒見過的欄位 | Sheet 自動加欄；Email 一定附全部欄位＋原始 JSON 備份 |

### 已登記的來源系統

| 系統 | 正式名稱（存進 Sheet） | 可用別名 |
|------|----------------------|---------|
| 📚 | 圖書館 | library, scoutlibrary, scoutlibrary.vercel.app |
| 🛍️ | APP STORE | appstore, scoutappstore, scoutappstore.vercel.app, 商店 |
| 🏢 | 支部系統 | branch, branchsystem, 支部 |
| 📈 | 進度追蹤 | progress, progresstracker, 進度 |
| ⚜️ | 旅系統 | troop, troopsystem, scoutsystem |
| 🗺️ | 區系統 | district, districtsystem, 區 |
| 🎖️ | 專章系統 | badge, badgesystem, vsbadge, 專章 |

> 要新增／改名：`index.html` 的 `SOURCE_APPS`（後台顯示）＋ Apps Script 的 `SOURCE_ALIASES`（儲存名稱）各加一行即可。**不加也能用。**

### 三種接入方式（任選一，全部同一格式）

1. **一行 widget**（推薦）
   ```html
   <script src="https://scout-admin-blue.vercel.app/widget.js" data-app="支部系統"></script>
   ```
   右下角浮動「🐛💬 回報 · 意見」按鈕，APP 不需要任何後端。不寫 `data-app` 會自動用網址判斷。
2. **貼表單代碼**：後台「📜 Apps Script」分頁的問題回報／意見回饋表單，只改 `SOURCE_APP`。
3. **零改動獨立回報頁**：`https://scout-admin-blue.vercel.app/report.html?app=支部系統`（分享連結或 QR 即可）。

後台「📜 Apps Script → 🧩 各系統一行接入代碼」已經幫每個系統生好可複製的那一行。

---

## 一、這是什麼

Scout Admin 是**純靜態後台**，部署在 Vercel，**本身沒有資料庫**。唯一的接收端是固定的 **Google Apps Script Web App**（URL 已寫死在 widget／表單／代理內）。

功能：

1. 接收旅團登記（旅團名、URL、API KEY；旅團號選填）
2. **統一回報看板**：所有系統的問題回報／意見回饋，按來源系統分流
3. TICK 看板：最新在最頂，點「✔ 已閱」整張卡灰字沉底；可匿名或留底姓名／聯絡
4. 接收 **SCOUT APP STORE** 的「作品投稿」
5. 已閱／審核狀態寫回 Google Sheet，換裝置「🔄 同步」也一致
6. **SUPER KEY 密碼門**：進後台先輸密碼，拿到 24 小時 session 才看得到資料

> ⚠️ **SUPER KEY 保護「誰能進後台」**；**API KEY 保護後台「讀取清單」（含個人資料）**。
> 所有提交（旅團登記、問題、回饋、作品投稿、寫回狀態）都**不需 Key、不需登入**，確保用戶一定交得到。

### 後台分頁（v2.4）

| 分頁 | 用途 |
|------|------|
| 🏛️ 旅團登記 | 旅團接入申請、審核、複製設定 |
| 🐛 問題回報 | 全系統問題 TICK（來源膠囊分流） |
| 💬 意見回饋 | 全系統意見 TICK（來源膠囊分流） |
| 📮 作品投稿 | SCOUT APP STORE 投稿（狀態在 Sheet 改） |
| 📜 Apps Script | 最新 GS 代碼、各系統一行接入代碼、表單代碼、欄位說明 |
| 📖 說明書 | 本文件（可下載 MD） |

> 🗑️ 已移除：**🔧 產生器**（旅團卡片展開即可複製設定，重複功能）、**⚙️ 設定**（API KEY 已改由 Vercel 環境變數 `SCOUT_ADMIN_KEY` 注入，本機再填一次只會製造混亂；備份也不需要，正本永遠在 Google Sheet）。

---

## 二、SUPER KEY 密碼門

| 項目 | 說明 |
|------|------|
| 密碼存在哪 | **只**存 Vercel 環境變數 `SUPER_KEY`；由 `/api/admin` 在 server 端比對（timing-safe） |
| 登入後 | 24 小時簽名 session token（存本機 localStorage） |
| 繞不開 | 無 token 直接打 `/api/admin` 的 list／寫回 → **401** |
| 防暴力猜解 | 同一 IP 15 分鐘內錯 5 次 → 鎖 15 分鐘 |
| **改密碼** | Vercel → Settings → Environment Variables 改 `SUPER_KEY` → 重新部署（舊 session 全失效） |
| 登出 | 右上角「🚪 登出」 |
| 本地開發 | 沒有 `/api/admin` 代理時不擋；`SUPER_KEY` 未設時會提示「⚠️ 未設 SUPER_KEY」 |
| 用戶端 | widget、回報表單、作品投稿**完全不受影響**（不用登入、不用 Key） |

---

## 三、升級到 v2.4 要做的事

1. **重新部署本專案**（後台新版）
2. **更新 Apps Script**（拿到 v2.4 的來源正規化與容錯）：
   - 後台 **📜 Apps Script** 分頁 → 複製最新代碼 → 貼上取代舊碼 → 儲存
   - 部署 → **管理部署** → **編輯** → 版本選「**新版本**」→ 部署（網址不變）
3. 確認 Vercel 環境變數：`SUPER_KEY`（後台密碼）、`SCOUT_ADMIN_KEY`（GS 產生的 API KEY）
4. 其他系統照「統一回報格式」貼一行 widget

> ⚠️ **不需要**新增工作表、不需要改欄位、不需要改任何資料庫。舊資料完全相容。

### API KEY（由 GS 自己產生）

1. Apps Script 編輯器上方選函式 `setupApiKey` → 執行 → 首次會要授權
2. 它會產生 `scout-…` 的 Key、存進腳本屬性 `API_KEY`、E-mail 給 `ADMIN_EMAIL`
3. 把這條 Key 加進 Vercel 環境變數 **`SCOUT_ADMIN_KEY`** → 重新部署
4. `resetApiKey()` 可重新產生（舊 Key 作廢）

> 健康檢查網址不需 Key；`?action=list` 需 Key。

---

## 四、旅團登記（簡化版）

旅團只需提供三項：**旅團名、URL、API KEY**（旅團號選填）。

| 欄位 | 必填 | 說明 |
|------|------|------|
| 旅團名稱 | ✓ | 如 第82旅 |
| URL | ✓ | 旅團的 Apps Script 後端 URL |
| API Key | ✓ | 旅團 API Key → 你在 Vercel 加入 |
| 旅團號 | 選填 | 有就填（0082），用來生成 `TROOP_0082_APIKEY` 環境變數名 |

流程：旅團提交 → 寫入 Sheet「申請記錄」＋ Email → 後台「🔄 同步 Sheet」→ 審核（✅ 接入 / ❌ 拒絕）→ **展開卡片直接複製** vsbadge JSON／troops.ts／Vercel 環境變數片段。

---

## 五、問題回報 / 意見回饋（統一 TICK 看板）

- 頂部「**來源系統膠囊**」：🌐 全部系統 + 每個系統的總數與**未閱紅點**；點一下只看該系統
- **未閱最新在最頂**；點「✔ 已閱」→ 卡變灰字、沉到底；可「↩ 未閱」反悔
- 可匿名，也可留底姓名 + 聯絡方式
- 已閱／未閱寫回 Google Sheet（不需 Key），換裝置「🔄 同步」一致
- 搜尋同時比對來源正式名稱與原始字串

---

## 六、作品投稿（SCOUT APP STORE）

- 商店的投稿會**多送一份**過來，寫進 Sheet「作品投稿」＋ Email 通知
- 後台「📮 作品投稿」：最新在最頂、可搜尋／篩選（待審核／已上架／已拒絕）
- 狀態**唯讀**：去 Sheet 改，改完按「🔄 同步」
- APP STORE 的**問題回報／意見回饋**則與其他系統一樣走統一格式，進 TICK 看板

---

## 七、Google Sheet 工作表（v2.4 完全不變）

### ① 申請記錄（旅團登記）

| 欄 | 欄位名稱 |
|----|---------|
| A | 提交時間 |
| B | 旅團號（選填） |
| C | 旅團名稱 |
| D | URL |
| E | API Key |
| F | 備注 |
| G | 狀態（待處理／已接入／已拒絕） |
| H | 編號 |

### ② 問題回報（全系統共用）

| 欄 | 欄位名稱 |
|----|---------|
| A | 提交時間 |
| B | 來源APP（＝來源系統，自動對齊統一名稱） |
| C | 旅團號 |
| D | 標題 |
| E | 問題詳情 |
| F | 嚴重度 |
| G | 聯絡方式（選填） |
| H | 姓名（選填，可匿名） |
| I | 狀態（未閱／已閱） |
| J | 編號 |

### ③ 意見回饋（全系統共用）

| 欄 | 欄位名稱 |
|----|---------|
| A | 提交時間 |
| B | 來源APP（＝來源系統） |
| C | 旅團號 |
| D | 類型 |
| E | 內容 |
| F | 聯絡方式（選填） |
| G | 姓名（選填，可匿名） |
| H | 狀態（未閱／已閱） |
| I | 編號 |

### ④ 作品投稿（SCOUT APP STORE）

| 欄 | 欄位名稱 |
|----|---------|
| A | 提交時間 |
| B | 作品名稱 |
| C | 作品連結 |
| D | 作者名稱 |
| E | 作品類型（page） |
| F | 分類 |
| G | 作品簡介 |
| H | 標籤 |
| I | 狀態（待審核／已上架／已拒絕，在 Sheet 改） |
| J | 編號 |

---

## 八、資料儲存說明

| 資料 | 儲存位置 |
|------|---------|
| 原始登記 / 回報 / 回饋 / 作品投稿 | Google Sheet 四張工作表（正本） |
| 已閱／審核狀態（正式） | Google Sheet「狀態」欄（`markRead`／`markReq` 寫回，不需 Key） |
| 後台快取 | 瀏覽器 localStorage（可隨時「🔄 同步」重建） |
| Email 通知 | Gmail |
| 後台入口保護 | Vercel 環境變數 `SUPER_KEY` ＋ 本機 24 小時 session token |
| 後台讀取保護 | Vercel 環境變數 `SCOUT_ADMIN_KEY`（經 `/api/admin` 注入）＋ GS 腳本屬性 |

---

## 九、Apps Script Web App 資訊

| 項目 | 說明 |
|------|------|
| URL | `https://script.google.com/macros/s/AKfycbxj5BDDGgjs559smkK4Z5aYImWYeXbN5af8U1ObON0z9WnsN6QJW4I1XWolhs5kQ_H-UQ/exec` |
| 執行身分 | 你（管理員帳號） |
| 存取權限 | 所有人（**寫入開放**，用戶才交得到；**讀取清單需 Key**） |
| POST 分流 | `issue`／`feedback`／`appstore`／`apply`（預設）／`markReq`／`markRead` — **皆不需 Key**，且支援別名與自動判斷 |
| GET | `?action=list`（**需 `apikey`**）回傳四張工作表 |
| 健康檢查 | 直接開網址應回 `{"status":"ok"}` |
| 生成 API KEY | 執行 `setupApiKey()`；`resetApiKey()` 重設 |
| 不漏保證 | 未知欄位自動加欄；Email 附全部欄位＋原始 JSON 備份；完全無資料才略過 |
| 前端代理 | `/api/admin`：GET `?action=ping`／POST `login`／GET `?action=list`／POST `markRead`、`markReq`（需 `x-scout-session`） |

---

## 十、加一個新系統的完整流程（例：支部系統）

1. 在支部系統的頁面 `</body>` 前貼：
   ```html
   <script src="https://scout-admin-blue.vercel.app/widget.js" data-app="支部系統"></script>
   ```
2. 完。

真的完了 —— 不用開工作表、不用加欄位、不用改 Apps Script、不用改後台、不用改任何資料庫。
（想要它在後台有專屬圖示／固定排序，才在 `index.html` 的 `SOURCE_APPS` 加一行。）

---

## 十一、常見問題

**Q：之後加新系統，要改 Google Sheet 或資料庫嗎？**
A：**不用。** 來源系統靠既有的「來源APP」欄分辨，工作表、欄位、代碼全部不變。

**Q：新系統的名稱寫錯／寫了英文或網域？**
A：GS 會自動對齊到正式名稱；對不上就原樣保留，後台照樣收、照樣分流（顯示 🔹 名稱）。

**Q：同步失敗、提示 API KEY？**
A：執行 `setupApiKey()`，把 Email 裡的 Key 加進 Vercel `SCOUT_ADMIN_KEY`，重新部署。

**Q：「⚙️ 設定」分頁去了哪裡？**
A：已刪除。API KEY 現在只放 Vercel 環境變數（不落瀏覽器）；匯出備份也不需要，正本在 Google Sheet，按「🔄 同步」即可重建。

**Q：「🔧 產生器」去了哪裡？**
A：已刪除。旅團登記卡片展開就能直接複製 vsbadge JSON／troops.ts／Vercel 環境變數，功能重複。

**Q：點「✔ 已閱」後另一個裝置看不到？**
A：已閱會寫回 Sheet，另一裝置按「🔄 同步」即一致。

**Q：後台密碼忘記了／想換？**
A：密碼＝Vercel 環境變數 `SUPER_KEY` 的值；改值 → 重新部署，舊 session 全部作廢。

**Q：想修改通知 Email？**
A：Apps Script 裡改 `ADMIN_EMAIL` → 重新部署（編輯部署 → 新版本）。
