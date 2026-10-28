# Scout Admin — 統一回報 · 旅團接入管理中心 說明書

> 版本：2.6 | 作者：系統管理員
> 本次大改：
> ① **統一回報格式 v1**：所有系統（圖書館、APP STORE、支部系統、進度追蹤、旅系統、區系統、專章系統…）用**同一個 payload、同一個接收端、同一組工作表欄位**回報，唯一分別只有 `sourceApp`（來源系統）
> ② 後台「問題回報 / 意見回饋」加**來源系統膠囊**：一眼看到每個系統各有幾條未閱，點一下只看該系統
> ③ Apps Script v2.4：**來源名稱自動正規化**、**type 別名／中文／漏寫也收得到**、**工作表與欄位完全不變**
> ④ 移除已無用的「🔧 產生器」與「⚙️ 設定」分頁
> ⑤ 保留：SUPER KEY 密碼門、API KEY 只留 Vercel 環境變數、已閱／審核寫回 Sheet
> ⑥ **新增「🧪 一鍵連通測試」**：一頁測完 4 個 BADGE APP ＋ Apps Script 收件端，並可寄一封測試申請確認 Email（見第十二節）
> ⑦ **Email 可靠性**：寄信失敗唔再靜靜吞、可查 `LAST_EMAIL`／剩餘配額（見第十三節）
> ⑧ **4 個 BADGE APP 統一歸入「🎖️ 專章系統」**（見第十四節）
> ⑨ **✉️ 回覆申請人 Email**：審核後一鍵通知旅團（見第十五節）
> ⑩ **v2.6：回覆信「所見即所寄」**——後台見到／輸入的地址直接傳去 GS，唔再因為 Sheet 某一欄冇值而寄唔出；失敗會講原因，仲有「📧 用電郵軟件寄」後備（見第十五節）
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

### 後台這邊要不要更新 Google Apps Script？

| 情況 | 會發生什麼 |
|------|-----------|
| **不更新**（維持舊版 GS） | 新系統**照樣收得到**：舊版已支援 `issue`／`feedback` 與 `sourceApp`，而後台顯示端也會自己把 `library`、`scoutappstore.vercel.app` 歸類到對應系統。**Sheet 不會壞、資料不會漏。** |
| 不更新的代價 | ① Sheet 的「來源APP」欄會存**原樣字串**（`library`、`scoutappstore.vercel.app`、`vsbadge` 混在一起），用 Sheet 篩選時不好看；② 對方 `type` 寫成 `bug`／中文／漏寫時，會掉進「申請記錄」表，要人手搬。 |
| **更新一次（建議）** | 來源名稱自動統一成中文正式名、`type` 寫錯漏寫也自動分流。**工作表、欄位、舊資料完全不變**，5 分鐘搞掂。 |

> 結論：**不是必須，但建議更新一次**。更新＝貼代碼 → 儲存 → 部署 → 管理部署 → 編輯 → 版本「新版本」→ 部署（網址不變，不用重發給任何人）。

---

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

### 後台分頁（v2.5）

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
| H | 編號（位置不變） |
| I | 聯絡 Email（**v2.5 新增**；v2.6 起後台寄信會自動寫回，表單無此欄時由備注／任何欄位抽出 Email） |
| J | 通知時間（**v2.6 新增，只在第一次成功寄出回覆信時自動加**；原有欄位同「編號」位置完全不變） |

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

---

## 十二、🧪 一鍵連通測試（v2.5）

後台 **🏛️ 旅團登記 → 🧪 連通測試** 會由 Vercel server 代你逐項探測（瀏覽器不需處理 CORS）：

| 檢查 | 正常結果 | 不合格代表 |
|------|---------|-----------|
| `SCOUT_ADMIN_KEY` / `SUPER_KEY` | 已設定 | 未設 → 讀 Sheet／密碼門失效 |
| Apps Script GET | `{"status":"ok"}` | 見到登入頁＝部署權限不是「所有人」 |
| Apps Script POST（送空 `{}`） | `沒有收到任何資料` | 舊版 GS／POST 不通 |
| 4 個 APP 首頁 | HTTP 200 | 專案被刪／網域失效 |
| 4 個 APP `/api/troops` | 列出旅團 | 空＝未設 `TROOP_{編號}_*` 環境變數 |
| 4 個 APP 接入申請端點（送空 payload） | **400**＝已配置 | **503**＝該 APP 未設收件匣 URL；**500**＝URL 格式錯 |

> **零副作用**：以上全部只送空 payload，**不會寫入 Sheet、不會寄 Email**。
> 要確認「真係收得到信」，按 **📨 寄測試申請**：會寫一列【連通測試】到「申請記錄」並寄一封信，測試完可在 Sheet 刪除。

### Q：為什麼回報／意見一填好就收到 Email，但旅團接入申請冇？

兩者其實走**同一支 Apps Script、同一個 `MailApp.sendEmail`**，分別在**入境前**：

| 路徑 | 收件匣 URL 由誰決定 | 未設定會怎樣 |
|------|-------------------|-------------|
| 問題回報／意見回饋 | 每個 APP 的 proxy 有**內建預設** `/exec` | 照樣寄得出 |
| 旅團接入申請（scoutbadge） | 一定要 `SCOUTBADGE_ADMIN_API`，**冇內建預設** | 表單直接回 **503「接入申請功能尚未啟用」**，根本冇送出 → 冇 Email |
| 旅團接入申請（vsbadge／cubsbadge／roverbadge） | 有內建預設，亦接受 `SCOUT_ADMIN_API` 等別名 | 通常寄得出 |

所以最常見的三個原因（用 🧪 連通測試可逐一排除）：

1. **scoutbadge 未設 `SCOUTBADGE_ADMIN_API`**（503）→ 補環境變數後**重新部署**；
2. 該 APP 的收件匣環境變數指去**舊的／錯的** `/exec`（例如舊部署 URL）→ 改回本文件第九節的 URL；
3. 申請其實已送達並寫入 Sheet，但 Email 落入**垃圾郵件**，或 Apps Script `MailApp` **每日配額**用完。

> 注意：在後台按「✅ 接入／❌ 拒絕」只會**寫回 Sheet 狀態**，本身不會寄 Email；要通知請直接回覆申請人。

---

## 十三、v2.5 其他修正（Email 通知可靠性）

| 問題 | 舊行為 | 現在 |
|------|-------|------|
| `MailApp.sendEmail` 失敗（配額用完／帳戶受限／主旨含換行） | `try { ... } catch (e) {}` **靜靜吞掉**，Sheet 有資料但完全冇通知 | 回傳 `email:"sent"`／`"failed"` ＋ `emailError`；寫入 Script Property `LAST_EMAIL` |
| 主旨含換行（旅團名稱多行） | `MailApp` 直接拋錯 → 冇信 | `_safeSubject()` 清乾淨再寄 |
| 查「上一封有冇寄出」 | 冇方法查 | `GET ?action=diag&apikey=…` → `lastEmail`、`remainingQuota` |
| 只想確認 Email 通不通 | 要開一張真申請 | `POST {type:"testEmail"}`（後台「✉️ 只寄測試 Email」）：只寄信、唔寫 Sheet；**收件人固定 ADMIN_EMAIL，不接受自訂 to** |

> 後台 🧪 連通測試會多兩項：**📧 Email 通知狀態**（上一封成功／失敗原因）同 **今日剩餘寄信配額**。
> 免費 Gmail 經 Apps Script 寄信上限約 **100 封／日**，爆配額就會全部寄不出。

---

## 十四、來源統一：4 個 BADGE APP ＝ 🎖️ 專章系統（v2.5）

| APP | 它送出的 `sourceApp` | 以前後台顯示 | 現在 |
|-----|--------------------|-------------|------|
| scoutbadge（童軍支部） | `進度追蹤` | 📈 進度追蹤 | 🎖️ 專章系統 |
| vsbadge（深資童軍） | `vsbadge` | 🎖️ 專章系統 | 🎖️ 專章系統 |
| cubsbadge（幼童軍） | `cubbadge` | 🔹 未登記（原樣顯示） | 🎖️ 專章系統 |
| roverbadge（樂行童軍） | `roverbadge` | 🔹 未登記（原樣顯示） | 🎖️ 專章系統 |

做法（**4 個 APP 不需要改任何一行**，全部在收件端做）：

1. `SOURCE_ALIASES['專章系統']` 加入 4 個 APP 的名稱、網域、中文全名；
2. `SOURCE_OVERRIDES` 把 scoutbadge 舊版送出的 `進度追蹤` 指向 `專章系統`
   （已同時寫入 `widget.js`、後台 `index.html`、Apps Script 三處）；
3. 後台 TICK 看板的來源膠囊自動只剩一個「🎖️ 專章系統」。

> ⚠️ 若日後真的上線一個獨立的「進度追蹤」系統，請把三處 `SOURCE_OVERRIDES` 裡的
> `'進度追蹤'` 刪掉（其餘別名可保留）。

---

## 十五、✉️ 回覆申請人 Email（v2.6）

以前旅團申請要人手回覆。現在後台「🏛️ 旅團登記」卡片多一個 **✉️ 通知** 按鈕：

| 觸發 | 行為 |
|------|------|
| 按「✅ 接入」 | 寫回 Sheet → 問你要不要寄「已開通」通知信 |
| 按「❌ 拒絕」 | 寫回 Sheet → 問你要不要寄「結果」通知信（可填原因） |
| 卡片「✉️ 通知」 | 隨時按當時狀態補寄（重發也用這個） |

**收件人怎麼決定（v2.6 重點：所見即所寄）**：

1. 後台卡片上顯示的那個地址（或你即場輸入的地址）**會直接傳去 GS** —— 唔再只靠 Sheet；
2. GS 收到之後會**寫回「聯絡 Email」欄**，下次喺 Sheet 或另一部電腦都見到同一個地址；
3. 冇傳地址時，GS 會喺整行**任何一格**搵電郵（`聯絡 Email` → `聯絡方式` → `備注` → 其他欄），
   全形＠、前後空格、`mailto:` 都會自動執正；
4. 成功寄出後，申請記錄會自動多一欄 **「通知時間」**（加在最後，原有欄位同編號位置完全不變），
   按「🔄 同步」後卡片會顯示 **✉️ 已通知**。

**完全沒有 Email 時不會假成功**：GS 回 `email:"no-address"`（或地址格式錯時 `email:"invalid-address"`），
後台會開一個視窗講清楚原因，並提供 **📧 用電郵軟件寄**／**📋 複製信件** 兩個後備，即刻都寄得出。

### 寄唔出？對照表（v2.6）

| 後台見到 | 真正原因 | 怎樣做 |
|---|---|---|
| 「Google 寄唔出通知信」＋錯誤字 | Gmail 每日配額用完／授權過期／地址被拒 | 等配額重置；或去 Apps Script 執行一次 `setupApiKey` 重新授權；趕時間就直接按「📧 用電郵軟件寄」 |
| 「Google 收件端搵唔到電郵地址」 | Apps Script 仍然係 **v2.5 或之前**（舊版唔會用後台傳去的地址），或者真係冇地址 | 貼上 v2.6 代碼並「新版本」重新部署；冇地址就用「✏️ 改地址」輸入 |
| 「Apps Script 仲係舊版（未支援回覆信）」 | 回應完全冇 `email` 欄位＝GS 係 v2.4 | 同上，更新 GS |
| 「電郵格式唔正確」 | 全形字／多咗空格／打漏 `.com` | 按「✏️ 改地址」 |
| 「連唔到 /api/admin 代理」 | Vercel 未部署／網絡問題 | 重新整理；必要時 Vercel Redeploy |

> 所有結果（成功／失敗原因／收件人）都會記錄在 Script Property `LAST_EMAIL_APPLY`，可用 `?action=diag` 查。

### 通知信內容（刻意簡短）

- **已接入**：
  > 你好，  
  > 貴旅團（第 82 旅）的接入申請已經開通 ✅  
  >   
  > 現在可以開啟 APP，選擇你的旅團登入使用。
- **已拒絕**：只講「暫時未能開通」＋請用 APP 內回報功能聯絡；
- 可加一段「管理員訊息」（拒絕時最常用）；
- 寄出成功會在卡片顯示 **✉️ 已通知** 標記。

> 通知信**不會**列出環境變數名或技術設定步驟 —— 那些全部由管理員在 Vercel 自己設定，旅團毋須知道。

### API（給其他系統／腳本用）

```json
{ "type": "markReq", "id": "<編號>", "status": "已接入|已拒絕|待處理",
  "notify": true, "to": "leader@example.com（選填；有就以它為準）",
  "message": "附加說明（選填）" }
```

回應：`{ status:"ok", notified:true, email:"sent"|"failed"|"no-address"|"invalid-address", to:"…", at:"…", quota:… }`。
寄信結果同樣寫入 Script Property `LAST_EMAIL_APPLY`，可在 `?action=diag` 查到。

---

## 十六、點樣確認「已經係新版」（v2.6）

三個地方任何一個都可以確認，**唔需要數行數**：

| 位置 | 新版應該見到 | 見到舊值代表 |
|------|------------|-------------|
| 後台右上角 | 版本標記 **`v2.6.0 ✔`**（綠色） | 冇版本標記＝Vercel 仍係舊 build；紅色 `v2.6.0 ⚠️ 伺服器 vX` ＝前後端唔一致 |
| `GET /api/admin?action=ping` | `{"ok":true,"version":"2.6.0","auth":"on"}` | `version` 係舊值或冇這個欄位＝代理未重新部署 |
| Apps Script | 第 2 行寫 **v2.6**，並搵到 `var GS_VERSION = "2.6";` | 只搵到 `v2.5`／`v2.4`＝仍然係舊 GS（回覆信功能會失效） |
| `GET <GS>?action=diag&apikey=…` | `"version":"2.6"`、`capabilities.replyEmail:true`、`replyEmailTo:true` | 冇呢啲欄位＝GS 未更新 |

> 舊版 GS 是 **369 行**、v2.5 是 **589 行**、v2.6 是 **723 行**（僅供參考，行數會隨更新變動；請以 `GS_VERSION` 標記為準）。
> 若瀏覽器仍載入舊頁，按 **Ctrl/Cmd + Shift + R** 強制刷新；必要時在 Vercel 按 **Redeploy**。

### 常見「見到舊版」的三個原因

1. **Vercel 未部署**：合併 PR 後仍要等部署完成（Deployments 最上面一個要係 `Ready` 且對應最新 commit）；
2. **GS 未「新版本」部署**：貼了代碼但只按「儲存」＝公開網址仍然行舊版本，必須「管理部署 → 編輯 → 新版本 → 部署」；
3. **瀏覽器快取**：舊 `index.html` 仍在記憶體，強制刷新即可。

### 🚨 為什麼一直見到舊版？— Vercel 部署的分支不是 `main`

2026-10-21 實測：`https://scout-admin-blue.vercel.app` 線上跑的內容，與 GitHub 的
**`arena/01a0dca5-scout-admin`（2026-09-26）** 完全一致，而不是 `main`：

| 線上實際 | `arena/01a0dca5`（2026-09-26） | `main`（最新） |
|---|---|---|
| `ping` 冇 `version` 欄 | 冇 | 有 `"version":"2.6.0"` |
| GS 分頁寫 v2.4、約 369 行 | 369 行 | 723 行，有 `GS_VERSION` |
| 專章系統只有 4 個別名 | `badge, badgesystem, vsbadge, 專章` | 另有 4 個 APP 名稱／網域 |
| 冇版本徽章／冇 🧪 | 無 | 有 |
| `package.json` | `2.4.0` | `2.6.0` |

**即係 Vercel 項目「Settings → Git → Production Branch」指去了那個 arena 分支**，
所以合併到 `main` 之後，線上永遠不會更新。

**修正（2 分鐘）**：

1. Vercel → 該項目 → **Settings → Git → Production Branch** 改成 **`main`** → Save；
2. **Deployments → 右上 `⋯` → Redeploy**（或推一個 commit 觸發）；
3. 開後台 → 右上角見到 **`v2.6.0 ✔`** 就代表成功。

> 若 Vercel 搜不到 `main`：先在 GitHub 把該 arena 分支刪除（Branches 頁 → 垃圾桶），
> Vercel 便只會剩 `main` 可選。

### 不想再等 Vercel？GS 可以直接由 GitHub 取

`apps-script/Code.gs` 與 `index.html` 的 `GS_CODE` 逐字相同（`npm test` 會驗證；兩邊任何一邊改完，
用 `node scripts/export_gs.js` 或 `node scripts/export_gs.js --import` 同步），
所以即使後台仍是舊版，也可以：

1. GitHub 開 **`apps-script/Code.gs`** → 右上 **Raw** → 全選複製；
2. 貼進 Apps Script → 儲存 → **管理部署 → 新版本 → 部署**；
3. 編輯器搜尋 **`GS_VERSION`** 確認是 v2.6。

（改完 `GS_CODE` 後執行 `node scripts/export_gs.js` 或 `npm run gs:export` 重新匯出。）
