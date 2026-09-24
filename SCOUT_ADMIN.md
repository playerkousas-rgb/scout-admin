# Scout Admin — 旅團接入管理中心 說明書

> 版本：2.3 | 作者：系統管理員
> 本次大改：
> ① **後台加 SUPER KEY 密碼門**：任何人開後台要先輸入密碼（存 Vercel 環境變數 `SUPER_KEY`，server 端比對，登入後 24 小時 session；無 token 直接打 `/api/admin` 讀取會被 401 擋）
> ② 旅團登記簡化為「旅團名 + URL + API KEY」（旅團號選填）
> ③ 問題回報 / 意見回饋改成 **TICK 看板**（前端直接看，已閱灰字沉底、最新在最頂；可匿名／留底姓名聯絡）
> ④ 後台**讀取清單（list）**加 **API KEY** 保護；**每題提交／寫回狀態一律不需要 Key**，確保用戶交得到
> ⑤ 新增 **SCOUT APP STORE「作品投稿」**：入 Sheet「作品投稿」＋ Email 通知，不漏單
> ⑥ 相容性／不漏資料：欄位對不上自動加欄，Email 附全部欄位＋原始 JSON 備份
> 部署網址：https://scout-admin-blue.vercel.app/

---

## 一、這是什麼

Scout Admin 是**純靜態後台**，部署在 Vercel，**本身沒有後端**。它唯一的接收端是固定的 **Google Apps Script Web App**（URL 已寫死在各表單 / widget 代碼內，不是 `scout-admin-blue.vercel.app` 的任何路徑；不需要、也不應修改任何 `ADMIN_API_URL` 類變數）。

主要功能：

1. 接收旅團登記（旅團名、URL、API KEY；旅團號選填）
2. 一鍵產生各 APP 需要的設定格式；API KEY 一律由你在 **Vercel 環境變數**加入
3. 前端直接看「問題回報」「意見回饋」TICK：**最新在最頂**，點「✔ 已閱」整張卡**灰字沉到底**
4. TICK 可**匿名**，也可留底**姓名／聯絡方式**
5. 接收 **SCOUT APP STORE**（scoutappstore.vercel.app）送來的「作品投稿」，照抄到 Sheet「作品投稿」＋ Email 通知，不漏單
6. 已閱／審核狀態寫回 Google Sheet，換裝置「🔄 同步」也一致
7. **SUPER KEY 密碼門**：進後台先輸密碼，拿到 24 小時 session 才看得到資料

> ⚠️ **SUPER KEY 密碼門保護「誰能進後台」**（密碼只在 Vercel 環境變數，server 端比對，不落瀏覽器）；**API KEY 保護的是後台「讀取清單」（含個人資料）**。所有提交（旅團登記、問題、回饋、作品投稿、寫回狀態）都**不需 Key、不需登入**，照常接收。

---

## 一之補充、SUPER KEY 密碼門（v2.3）

**任何人開後台網址（scout-admin-blue.vercel.app）都會先看到登入畫面**，輸入正確密碼（＝ Vercel 環境變數 `SUPER_KEY` 的值）才進得去。

| 項目 | 說明 |
|------|------|
| 密碼存在哪 | **只**存 Vercel 環境變數 `SUPER_KEY`；由 `/api/admin` 代理在 server 端比對（timing-safe），瀏覽器永遠看不到 |
| 登入後 | 拿到 24 小時簽名 session token（存本機 localStorage）；「🔄 同步」「✔ 已閱」「審核寫回」都靠它 |
| 繞不開 | 無 token 直接打 `/api/admin` 的 list／寫回 → **401**；token 過期前端會自動跳回登入畫面 |
| 防暴力猜解 | 同一 IP 15 分鐘內錯 5 次 → 鎖 15 分鐘（前端同時有 5 次錯 30 秒冷卻） |
| **改密碼** | Vercel → Settings → Environment Variables 改 `SUPER_KEY` 的值 → 重新部署；舊 session 全部失效，所有人要重新登入 |
| 忘記密碼 | 密碼＝你在 Vercel 設的值，查不到就回 Vercel 改一個新的 |
| 登出 | 右上角「🚪 登出」清除本機 session |
| 本地開發 | 沒有 `/api/admin` 代理時不會被擋（維持直連模式）；代理在但 `SUPER_KEY` 未設時不擋，且畫面上會提示「⚠️ 未設 SUPER_KEY：沒有密碼保護」 |
| 用戶端不受影響 | widget、回報表單、作品投稿都直接送 Apps Script，**不用登入、不用 Key** |

---

## 二、升級要做一次（重要）

> v2.3 只需要**重新部署本專案**（密碼門在前端＋`/api/admin` 代理，Apps Script 不用動）。

1. Vercel → 專案 Settings → Environment Variables 加入／確認 **`SUPER_KEY`**（值＝你要的後台密碼，任意字串）
2. 本專案推上去（部署完成後密碼門即生效）
3. （如果也要更新 GS）開啟 Google Sheet → 擴充功能 → Apps Script
4. 到後台 **📜 Apps Script** 分頁複製 **最新版代碼**，整段貼上取代舊碼 → 儲存
5. 部署 → **管理部署** → **編輯** → 版本選「**新版本**」→ 部署（網址不變）

### API KEY（由 GS 自己產生，不是你自己想）

4. 在 Apps Script 編輯器**上方工具列選函式 `setupApiKey`** → 按「執行」→ 首次會要授權
5. 它會自動：
   - 產生一串 `scout-…` 的 Key
   - 存進**腳本屬性**（`API_KEY`）
   - **E-mail 到 `ADMIN_EMAIL`**
6. 把這條 Key 加進 **本專案 Vercel 環境變數 `SCOUT_ADMIN_KEY`**（後台讀取走 `/api/admin` 代理，Key 不落瀏覽器）
   - 信裡另附「一鍵填好」連結，點開會把 Key 帶入後台「⚙️ 設定」當**本機後備**

> 有 `resetApiKey()` 可重新產生（舊 Key 作廢）。健康檢查網址不需 Key；`?action=list` 需 Key。
> 工作表、標題欄會自動建立；舊表缺的欄會自動在右側補上。

---

## 三、旅團登記（簡化版）

旅團只需提供三項：**旅團名、URL、API KEY**（旅團號選填，有就填）。

- 把「前端旅團登記表單」貼在旅團 APP 設定頁 → 旅團提交 → 寫入 Sheet「申請記錄」＋ Email 通知你
- 你在後台「🏛️ 旅團登記」按「🔄 同步 Sheet」載入 → 審核（✅ 接入 / ❌ 拒絕）→ 展開卡片複製對應設定
- **API KEY 一律放 Vercel 環境變數**，不寫進任何 JSON／TS 檔

> 🛟 **不漏保證**：GS 收到「沒見過的欄位」會**自動加欄**存進 Sheet；Email 一定附上**全部欄位 ＋ 原始 JSON 備份**。就算某欄寫入失敗，Email 也已寄出、內容完整。

| 欄位 | 必填 | 說明 |
|------|------|------|
| 旅團名稱 | ✓ | 如 第82旅 |
| URL | ✓ | 旅團的 Apps Script 後端 URL |
| API Key | ✓ | 旅團 API Key → 你在 Vercel 加入 |
| 旅團號 | 選填 | 有就填（0082），用來生成 `TROOP_0082_APIKEY` 環境變數名 |

---

## 四、問題回報 / 意見回饋（TICK 看板）

- 前端直接看 TICK：**未閱最新在最頂**；點「✔ 已閱」→ 卡變**灰字、沉到底**
- 可反悔：↩ 未閱 可以把卡翻回未閱
- **可匿名**（姓名、聯絡方式都選填），也可留底**姓名 + 聯絡方式**
- 已閱／未閱寫回 Google Sheet → 開 Sheet 也看得到、換裝置同步（寫回不需 Key）
- 有管理員備註欄（✏️ 編輯內可加）

用戶端可任選一種接入：

1. **一行 widget**：`<script src="https://scout-admin-blue.vercel.app/widget.js"></script>`（右下角浮動「回報 · 意見」按鈕，APP 不需要後端；來源自動帶入網址，可 `data-app="項目名"` 覆蓋）
2. **貼表單代碼**：📜 Apps Script 分頁的「問題回報表單 / 意見回饋表單」，貼上後改 `SOURCE_APP`
3. **獨立回報頁**（零改動）：`https://scout-admin-blue.vercel.app/report.html?app=圖書館`

---

## 五、作品投稿（SCOUT APP STORE）

- Scout APP STORE（`scoutappstore.vercel.app`）的投稿會**多送一份**到這裡，寫進 Sheet「作品投稿」＋ Email 通知，不影響商店本身
- 後台「📮 作品投稿」分頁：**最新在最頂**、可搜尋／篩選（待審核／已上架／已拒絕）
- 狀態**唯讀**：改狀態回 Sheet 改（如「待審核」→「已上架」），改完按「🔄 同步」即可更新

---

## 六、各 APP 設定格式

### vsbadge — `troops.json`

```json
{
  "troops": {
    "0082": {
      "name": "第82旅",
      "backend": "https://script.google.com/macros/s/XXXXXX/exec"
    }
  }
}
```

- 鍵用「旅團號」；旅團號留空時，鍵 = 旅團名稱。

### scoutsystem — `lib/troops.ts`

```typescript
{
  key: 'troop_0082',
  id: '0082',
  name: '第82旅',
  webAppUrl: 'https://script.google.com/macros/s/XXXXXX/exec',
  // API Key → Vercel env: TROOP_0082_APIKEY
  status: 'active',
},
```

- 旅團號留空時，`key`／`id` 用旅團名，環境變數名自行命名。

### scoutsystem — Vercel 環境變數

```
Name:  TROOP_0082_APIKEY
Value: ak_xxxxxxxxxxxxxxxxxxxxxxxx
```

設定位置：Vercel Dashboard → 專案 → Settings → Environment Variables。

> ⚠️ API Key **永遠不進 Git**，只存在 Vercel 環境變數。

---

## 七、Google Sheet 工作表

四張表會自動建立／自動補欄（以新 cfg 順序為準）：

### ① 申請記錄（旅團登記）

| 欄 | 欄位名稱 |
|----|---------|
| A | 提交時間 |
| B | 旅團號（選填） |
| C | 旅團名稱 |
| D | URL |
| E | API Key |
| F | 備注 |
| G | 狀態（審核寫回：待處理／已接入／已拒絕） |
| H | 編號 |

### ② 問題回報（TICK）

| 欄 | 欄位名稱 |
|----|---------|
| A | 提交時間 |
| B | 來源 APP |
| C | 旅團號 |
| D | 標題 |
| E | 問題詳情 |
| F | 嚴重度 |
| G | 聯絡方式（選填） |
| H | 姓名（選填，可匿名） |
| I | 狀態（未閱／已閱） |
| J | 編號 |

### ③ 意見回饋

| 欄 | 欄位名稱 |
|----|---------|
| A | 提交時間 |
| B | 來源 APP |
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
| I | 狀態（待審核 → 已上架／已拒絕，在 Sheet 改） |
| J | 編號 |

---

## 八、資料儲存說明

| 資料 | 儲存位置 |
|------|---------|
| 審核狀態 / 已閱狀態（前端） | 瀏覽器 localStorage（快取） |
| 已閱／審核狀態（正式） | Google Sheet「狀態」欄（透過 `markRead`／`markReq` 寫回，不需 Key） |
| 原始登記 / 回報 / 回饋 / 作品投稿 | Google Sheet 四張工作表 |
| Email 通知 | Gmail |
| 後台入口保護（密碼門） | Vercel 環境變數 `SUPER_KEY`（server 端比對）＋ 本機 24 小時 session token |
| 後台讀取保護（API KEY） | Vercel 環境變數 `SCOUT_ADMIN_KEY`（經 `/api/admin` 代理注入）＋ Apps Script 腳本屬性 |
| 本機後備 Key | 瀏覽器 localStorage（不寫進任何代碼） |
| 本機 session token | 瀏覽器 localStorage（24 小時過期，HMAC 簽名，離線無效） |

---

## 九、Apps Script Web App 資訊

| 項目 | 說明 |
|------|------|
| URL | `https://script.google.com/macros/s/AKfycbxj5BDDGgjs559smkK4Z5aYImWYeXbN5af8U1ObON0z9WnsN6QJW4I1XWolhs5kQ_H-UQ/exec` |
| 執行身分 | 你（管理員帳號） |
| 存取權限 | 所有人（**寫入照舊開放**，用戶才能交 TICK／投稿；**讀取清單需 Key**） |
| POST 分流 | `apply`（預設）／`issue`／`feedback`／`appstore`／`markReq`（審核寫回）／`markRead`（已閱寫回）——**皆不需 Key** |
| GET | `?action=list`（**需 `apikey`**）回傳四張工作表 |
| 健康檢查 | 直接開網址應回 `{"status":"ok"}`（不需要 key） |
| 生成 API KEY | Apps Script 編輯器執行 `setupApiKey()`（自動產生＋存屬性＋Email 給你）；`resetApiKey()` 重設 |
| 不漏保證 | 未知欄位自動加欄；Email 附全部欄位＋原始 JSON 備份；完全無資料才略過 |
| 前端代理 | `/api/admin`（`api/admin.js`）：GET `?action=ping`（查密碼門狀態）／POST `login`（server 端比對 `SUPER_KEY`，發 24 小時 session token）／GET `?action=list`／POST `markRead`、`markReq`（需 `x-scout-session` header），Key 由 Vercel `SCOUT_ADMIN_KEY` 注入 |

---

## 十、常見問題

**Q：同步失敗、提示 API KEY？**
A：先照第二節執行 `setupApiKey()`（Apps Script），把 E-mail 裡的 Key 加進 Vercel `SCOUT_ADMIN_KEY`（走 `/api/admin`），或在後台「⚙️ 設定」填同一條當本機後備。兩邊要用同一條。

**Q：旅團號留空會怎樣？**
A：照常登記。Vercel 環境變數名自行命名；vsbadge JSON 以旅團名當鍵。

**Q：收不到 TICK／投稿？**
A：① 已重新部署最新代碼（編輯部署 → 新版本）；② 各 APP 已貼新表單／widget（`SOURCE_APP` 已改）；③ App Store 端已把投稿鏡射到固定 Apps Script URL（`type:'appstore'`）；④ 後台按「🔄 同步」。

**Q：點「✔ 已閱」後另一個裝置看不到？**
A：「已閱」會寫回 Sheet（不需 Key），另一裝置按「🔄 同步」即一致。

**Q：換了瀏覽器記錄不見？**
A：原始資料都在 Sheet，按「🔄 同步」重新載入即可；或用「匯出／匯入」搬遷（API KEY 需重填一次）。

**Q：欄位格式變了／收到沒見過的欄位會不會丟？**
A：不會。GS 會**自動加欄**存進 Sheet，Email 一定附上**全部欄位＋原始 JSON 備份**，就算寫入失敗也已完整電郵給你。

**Q：想修改通知 Email？**
A：Apps Script 裡改 `ADMIN_EMAIL` → 重新部署（編輯部署 → 新版本）。

**Q：後台密碼（SUPER KEY）忘記了／想換？**
A：密碼＝你在 Vercel 環境變數 `SUPER_KEY` 設的值，去 Vercel Dashboard 查。要換就直接改值 → 重新部署；舊 session 全部作廢，所有人重新登入。

**Q：為什麼本地開發看不到登入畫面？**
A：正常。密碼門靠 `/api/admin` 代理（只有 Vercel 上有）。本地用 `file://` 或靜態 server 開時代理不存在，維持舊版直連模式不擋人；部署上 Vercel 就會看到。

**Q：別人繞過登入畫面、直接打 `/api/admin` 會怎樣？**
A：吃 401。list／markRead／markReq 都要帶有效的 session token（登入時 server 簽發、HMAC 簽名、24 小時過期），token 拿不到資料也讀不到。
