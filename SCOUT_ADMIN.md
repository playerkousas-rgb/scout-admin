# Scout Admin — 旅團接入管理中心 說明書

> 版本：2.0 | 作者：系統管理員
> 本次大改：
> ① 旅團登記簡化為「旅團名 + URL + API KEY」（旅團號選填）
> ② 問題回報 / 意見回饋改成 **TICK 看板**（前端直接看，已閱灰字沉底、最新在最頂；可匿名／留底姓名聯絡）
> ③ 後台讀取（list）與「已閱」寫回加 **API KEY** 保護
> 部署網址：https://scout-admin-blue.vercel.app/

---

## 一、這是什麼

Scout Admin 是**純靜態後台**，部署在 Vercel，**本身沒有後端**。它唯一的接收端是固定的 **Google Apps Script Web App**（URL 已寫死在各表單 / widget 代碼內，不是 `scout-admin-blue.vercel.app` 的任何路徑；不需要、也不應修改任何 `ADMIN_API_URL` 類變數）。

主要功能：

1. 接收旅團登記（旅團名、URL、API KEY；旅團號選填）
2. 一鍵產生各 APP 需要的設定格式；API KEY 一律由你在 **Vercel 環境變數**加入
3. 前端直接看「問題回報」「意見回饋」TICK：**最新在最頂**，點「✔ 已閱」整張卡**灰字沉到底**
4. TICK 可**匿名**，也可留底**姓名／聯絡方式**
5. 「已閱」狀態寫回 Google Sheet（需要 API KEY），換裝置也同步

---

## 二、升級要做一次（重要）

1. 開啟 Google Sheet → 擴充功能 → Apps Script
2. 到後台 **📜 Apps Script** 分頁複製 **v2.0 代碼**，整段貼上取代舊碼 → 儲存
3. 部署 → **管理部署** → **編輯** → 版本選「**新版本**」→ 部署（網址不變）
4. 設 API KEY：
   - Apps Script 編輯頁左欄「**專案設定**」→ 底部「**腳本屬性**」→ 新增屬性
   - 屬性名 = `API_KEY`，值 = 你自訂密鑰（例如 `scout-xxxx-....`，可用後台設定分頁「✨ 產生一個隨機 KEY」）
5. 後台 **⚙️ 設定** 分頁填入**同一條** API KEY → 儲存

> 工作表、標題欄會自動建立；舊表缺的「姓名」欄會自動在右側補上。未升級前，新表單送出的 `姓名` 欄與「已閱」寫回端點舊 Script 不認識，會忽略（收單本身不受影響）。

---

## 三、旅團登記（簡化版）

旅團只需提供三項：**旅團名、URL、API KEY**（旅團號選填，有就填）。

- 把「前端旅團登記表單」貼在旅團 APP 設定頁 → 旅團提交 → 寫入 Sheet「申請記錄」＋ Email 通知你
- 你在後台「🏛️ 旅團登記」按「🔄 同步 Sheet」載入 → 審核（✅ 接入 / ❌ 拒絕）→ 展開卡片複製對應設定
- **API KEY 一律放 Vercel 環境變數**，不寫進任何 JSON／TS 檔

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
- 已閱／未閱寫回 Google Sheet（需 API KEY）→ 開 Sheet 也看得到、換裝置同步
- 有管理員備註欄（✏️ 編輯內可加）

用戶端可任選一種接入：

1. **一行 widget**：`<script src="https://scout-admin-blue.vercel.app/widget.js"></script>`（右下角浮動「回報 · 意見」按鈕，APP 不需要後端；來源自動帶入網址，可 `data-app="項目名"` 覆蓋）
2. **貼表單代碼**：📜 Apps Script 分頁的「問題回報表單 / 意見回饋表單」，貼上後改 `SOURCE_APP`
3. **獨立回報頁**（零改動）：`https://scout-admin-blue.vercel.app/report.html?app=圖書館`

---

## 五、各 APP 設定格式

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

## 六、Google Sheet 工作表

三張表會自動建立／自動補欄（以新 cfg 順序為準）：

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

---

## 七、資料儲存說明

| 資料 | 儲存位置 |
|------|---------|
| 審核狀態 / 已閱狀態（前端） | 瀏覽器 localStorage（快取） |
| 已閱狀態（正式） | Google Sheet「狀態」欄（透過 `markRead` 端點寫回，需 API KEY） |
| 原始登記 / 回報 / 回饋 | Google Sheet 三張工作表 |
| Email 通知 | Gmail |
| 你的後台 API KEY | 瀏覽器 localStorage（不寫進任何代碼）＋ Apps Script 腳本屬性 |

---

## 八、Apps Script Web App 資訊

| 項目 | 說明 |
|------|------|
| URL | `https://script.google.com/macros/s/AKfycbxj5BDDGgjs559smkK4Z5aYImWYeXbN5af8U1ObON0z9WnsN6QJW4I1XWolhs5kQ_H-UQ/exec` |
| 執行身分 | 你（管理員帳號） |
| 存取權限 | 所有人（**寫入**照舊開放，用戶才能交 TICK） |
| POST 分流 | `apply`（預設）／`issue`／`feedback`／`markReq`（審核寫回）／`markRead`（已閱寫回） |
| GET | `?action=list`（**需 `apikey`**）回傳三張工作表 |
| 健康檢查 | 直接開網址應回 `{"status":"ok"}`（不需要 key） |

---

## 九、常見問題

**Q：同步失敗、提示 API KEY？**
A：照第二節設好 API KEY（Apps Script 腳本屬性＋後台「⚙️ 設定」各放同一條）。

**Q：旅團號留空會怎樣？**
A：照常登記。Vercel 環境變數名自行命名；vsbadge JSON 以旅團名當鍵。

**Q：收不到 TICK？**
A：① 已重新部署 v2.0 代碼（編輯部署 → 新版本）；② 各 APP 已貼新表單／widget（`SOURCE_APP` 已改）；③ 後台按「🔄 同步」。

**Q：點「✔ 已閱」後另一個裝置看不到？**
A：沒設 API KEY 時「已閱」只存在本機。設好 API KEY 後，已閱會寫回 Sheet，再「🔄 同步」即同步。

**Q：換了瀏覽器記錄不見？**
A：原始資料都在 Sheet，按「🔄 同步」重新載入即可；或用「匯出／匯入」搬遷（API KEY 需重填一次）。

**Q：想修改通知 Email？**
A：Apps Script 裡改 `ADMIN_EMAIL` → 重新部署（編輯部署 → 新版本）。
