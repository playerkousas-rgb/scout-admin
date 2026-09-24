# Scout Admin — 旅團接入管理中心 說明書

> 版本：1.1 | 作者：系統管理員
> 新增：🐛 問題回報、💬 意見回饋、🔄 Google Sheet 同步
> 部署網址：https://scout-admin-blue.vercel.app/

---

## 一、這是什麼

Scout Admin 是一個**靜態管理後台**，用於：

1. 接收旅團的接入申請（透過 Apps Script Web App）
2. 查看和審核申請
3. 自動產生各 APP 所需的 JSON / TypeScript 設定格式
4. 讓你一鍵複製貼入各 APP 的設定檔完成接入
5. 收集各 APP 用戶的**問題回報**（v1.1 新增）
6. 收集各 APP 用戶的**意見回饋**（v1.1 新增）
7. 一鍵從 Google Sheet **同步**最新申請 / 回報 / 回饋（v1.1 新增）

**不需要伺服器、不需要資料庫。** 原始資料存在你的 Google Sheet，審核 / 處理狀態存在瀏覽器 localStorage。

> ⚠️ **給其他開發者 / Agent 看的重要說明**
>
> Scout Admin APP 是**純靜態 HTML**，部署在 Vercel 上。
> **它沒有任何後端 API 端點**，不存在 `/api/submit`、`/api/register` 或任何伺服器路由。
>
> 唯一接收端是固定的 **Google Apps Script Web App**（URL 已寫死在表單代碼內），並非 `scout-admin-blue.vercel.app` 的任何路徑。不需要、也不應修改任何 `ADMIN_API_URL` 類的變數。

### 📌 先回答常見疑問：新 APP 要先在這裡登記 URL 嗎？

**不用。** 系統沒有「逐個 APP 登記 URL」這一步：

- 接收端 URL **固定唯一**，寫死在所有表單代碼裡 → 其他 APP 只要把表單代碼貼進去，提交就自動送到你的 Google Sheet
- Admin 按「🔄 同步 Sheet」即載入，無事前註冊
- 唯一要改的是表單代碼裡的 `SOURCE_APP` 名稱（例如改成 `"vsbadge"`），方便分辨回報來自哪個 APP

---

## 二、系統組成

```
┌──────────────────────────────────────────────────────────┐
│              Scout Admin APP（你的後台）                   │
│          https://scout-admin-blue.vercel.app/             │
│                                                           │
│  📥 新申請  🐛 問題回報  💬 意見回饋  📋 總覽  🔧 產生器     │
│                          ▲                                │
│                     🔄 同步 Sheet                          │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│            Apps Script Web App（唯一接收端）               │
│  POST 依 type 分流 → 寫入對應工作表 → 寄 Email 通知         │
│  GET ?action=list → 回傳三張工作表資料（給 Admin 同步）      │
│                                                           │
│  Sheet 工作表：① 申請記錄  ② 問題回報  ③ 意見回饋           │
└────────────────────┬─────────────────────────────────────┘
                     │ 資料來源
                     ▼
┌──────────────────────────────────────────────────────────┐
│        各旅團 APP 內嵌的三份表單（發送端）                   │
│  📋 申請表單 / 🐛 問題回報表單 / 💬 意見回饋表單             │
│  每份只需改 SOURCE_APP 名稱，URL 已預設                     │
└──────────────────────────────────────────────────────────┘
```

---

## 三、分頁功能說明

### 📥 新申請

查看所有旅團的接入申請。

| 操作 | 說明 |
|------|------|
| ✅ 標記完成 | 申請審核通過，移至「已完成」 |
| ❌ 拒絕 | 拒絕申請 |
| ↩ 重設 | 將已完成/已拒絕的申請重設回待處理 |
| ✏️ 編輯 | 修改申請資料（如旅團補填了漏掉的欄位） |
| 🗑 刪除 | 永久刪除申請記錄 |
| 🔧 查看 JSON/TS 輸出 | 展開查看該旅團的設定片段 |
| ＋ 手動新增 | 不透過表單，直接在 Admin APP 新增申請 |
| 🔄 同步 Sheet | 從 Google Sheet 載入各 APP 提交的申請（去重） |

**篩選**：可按「全部 / 待處理 / 已完成 / 已拒絕」篩選，或用搜尋框搜尋旅團名稱、編號。

**申請卡展開後顯示的輸出**（根據該旅團勾選的 APP 而定）：

- 勾了 **vsbadge** → `troops.json` 片段
- 勾了 **scoutsystem** → `troops.ts` 片段 + Vercel 環境變數
- 兩個都勾 → 兩者都顯示

---

### 🐛 問題回報（v1.1 新增）

收集各 APP 用戶提交的問題。

**流程**：各 APP 貼上「問題回報表單」→ 用戶提交 → 寫入 Sheet「問題回報」+ Email 通知 → 本分頁按「🔄 同步」載入 → 處理。

| 操作 | 說明 |
|------|------|
| 🔄 同步 Sheet | 載入 Google Sheet 最新回報 |
| ＋ 手動新增 | 電話 / 聊天收到的問題直接登記 |
| ▶ 處理中 / ✔ 已解決 / ✕ 關閉 | 更新處理進度 |
| ↩ 重開 | 已解決 / 已關閉的問題重新打開 |
| ✏️ 編輯 / 🗑 刪除 | 修改或移除記錄（可加管理員備註） |

**狀態**：待處理 → 處理中 → 已解決 / 已關閉
**欄位**：來源 APP、旅團號（選填）、標題、問題詳情、嚴重度（低 / 中 / 高 / 緊急）、聯絡方式
**篩選**：全部 / 待處理 / 處理中 / 已解決 / 已關閉；可按標題、來源 APP、旅團號搜尋

---

### 💬 意見回饋（v1.1 新增）

收集建議、稱讚與批評。流程與問題回報相同（表單 → Sheet「意見回饋」→ 同步）。

| 操作 | 說明 |
|------|------|
| 🔄 同步 Sheet | 載入 Google Sheet 最新回饋 |
| ＋ 手動新增 | 直接登記 |
| ▶ 檢視中 / ✔ 已採納 / ✕ 不採納 | 更新處理進度 |
| ↩ 重設 | 回到「新回饋」 |
| ✏️ 編輯 / 🗑 刪除 | 修改或移除記錄（可加管理員備註） |

**狀態**：新回饋 → 檢視中 → 已採納 / 不採納
**類型**：💡 建議 / 👍 讚 / 👎 批評 / 📝 其他

---

### 📋 旅團總覽

顯示所有**已完成接入**的旅團，並提供完整設定檔供複製。

| 輸出 | 說明 |
|------|------|
| vsbadge `troops.json` | 完整 JSON，可直接替換 vsbadge repo 的 `troops.json` |
| scoutsystem `lib/troops.ts` | 完整 TypeScript，可直接替換 `lib/troops.ts` |
| Vercel 環境變數清單 | 所有旅團的 `TROOP_{ID}_APIKEY=...`，逐行列出 |

---

### 🔧 JSON / TS 產生器

手動輸入旅團資料，即時預覽三種格式：

1. **vsbadge** `troops.json` 片段
2. **scoutsystem** `troops.ts` 片段
3. **Vercel 環境變數**

適合：需要臨時補一個旅團、或確認格式是否正確。

---

### 📜 Apps Script

**區塊 ①**：Apps Script 代碼備份（v1.1 已升級，見第八節）。
**區塊 ②**：前端**申請表單**代碼 — 貼入旅團 APP 設定頁。
**區塊 ③**：前端**問題回報表單**代碼 — 貼入各 APP，改 `SOURCE_APP`。
**區塊 ④**：前端**意見回饋表單**代碼 — 貼入各 APP，改 `SOURCE_APP`。
**區塊 ⑤**：三張 Google Sheet 工作表的欄位說明。

---

### ⚙️ 設定 / 匯出匯入

- **匯出**：把所有申請 / 回報 / 回饋匯出成 JSON 備份檔
- **匯入**：從備份 JSON 還原資料
- **清除**：清空所有本地資料（不可撤銷）

> 💡 建議定期匯出備份，因為資料存在瀏覽器 localStorage，換瀏覽器或清除快取會遺失。

---

## 四、完整流程

```
【接入申請】
旅團在 APP 設定頁填申請表單
      │ POST（no-cors）
      ▼
Apps Script → 寫 Sheet「申請記錄」→ 寄 Email
      ▼
Admin → 📥 新申請（🔄 同步）→ ✅ 標記完成 → 複製 JSON/TS → git push → 完成

【問題回報 / 意見回饋（v1.1）】
用戶在任何 APP 按表單提交
      │ POST（no-cors, type: issue / feedback）
      ▼
Apps Script → 寫 Sheet「問題回報」/「意見回饋」→ 寄 Email
      ▼
Admin → 🐛 / 💬 分頁（🔄 同步）→ 更新狀態、加備註 → 解決
```

---

## 五、各 APP 設定格式

### vsbadge — `troops.json`

```json
{
  "troops": {
    "0082": {
      "name": "第 82 旅",
      "backend": "https://script.google.com/macros/s/XXXXXX/exec",
      "apikey": "vs_xxxxxxxxxxxxxxxxxxxxxxxx"
    }
  }
}
```

貼入位置：`vsbadge` repo 根目錄的 `troops.json`

---

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

貼入位置：`scoutsystem-2.0` repo 的 `lib/troops.ts`，加入 `APPROVED_TROOPS` 陣列內

---

### scoutsystem — Vercel 環境變數

```
Name:  TROOP_0082_APIKEY
Value: ak_xxxxxxxxxxxxxxxxxxxxxxxx
```

設定位置：Vercel Dashboard → scoutsystem 專案 → Settings → Environment Variables

> ⚠️ API Key **永遠不進 Git**，只存在 Vercel 環境變數。

---

## 六、將表單加入新 APP（含問題回報 / 意見回饋）

**不需要事先在 Admin 登記任何 APP 的 URL。** 接收端固定，任何 APP 貼上表單即自動接入。

### 推薦做法：一行 widget（改動最少）

每個 APP 只要在 `</body>` 前加一行，就同時擁有 🐛 問題回報 + 💬 意見回饋浮動按鈕（不需要後端）：

```html
<script src="https://scout-admin-blue.vercel.app/widget.js" data-app="APP名"></script>
```

或用**零改動**的獨立回報頁（分享連結 / QR 即可，適合圖書館這類沒有後端的系統）：

```
https://scout-admin-blue.vercel.app/report.html?app=APP名
```

### 備選做法：貼完整表單

1. 前往 **Scout Admin APP → 📜 Apps Script 分頁**
2. 找到三份表單代碼，逐一「複製」並貼入新 APP：
   - **📋 前端申請表單** — 旅團接入申請（欄位已齊全，URL 已預設；有後端的才需要）
   - **🐛 問題回報表單 / 💬 意見回饋表單** — 貼上後把 `SOURCE_APP` 改成新 APP 名稱
3. 完成。提交會自動寫入 Google Sheet 並 Email 通知你

---

## 七、資料儲存說明

| 資料 | 儲存位置 | 說明 |
|------|---------|------|
| 申請記錄審核狀態 | 瀏覽器 localStorage | 換瀏覽器需重新匯入 |
| 問題回報進度（v1.1） | 瀏覽器 localStorage | 同上 |
| 意見回饋進度（v1.1） | 瀏覽器 localStorage | 同上 |
| 原始申請 / 回報 / 回饋 | Google Sheet | 永久保存，不受瀏覽器影響 |
| Email 通知記錄 | Gmail | 永久保存 |

**建議流程**：各分頁按「🔄 同步 Sheet」載入 → 在 Admin 處理與標記狀態 → 匯出備份保存。
處理進度以 Admin 為準；Sheet 保存的是原始提交。

---

## 八、Apps Script Web App 資訊（v1.1 升級）

> **這是申請 / 回報 / 回饋的唯一接收端點。** Scout Admin APP 本身是純靜態網頁，沒有後端。

| 項目 | 說明 |
|------|------|
| URL | `https://script.google.com/macros/s/AKfycbxj5BDDGgjs559smkK4Z5aYImWYeXbN5af8U1ObON0z9WnsN6QJW4I1XWolhs5kQ_H-UQ/exec` |
| 執行身分 | 你（管理員帳號） |
| 存取權限 | 所有人 |
| 通知 Email | 見 Apps Script `ADMIN_EMAIL` 變數 |
| Google Sheet 工作表 | ① 申請記錄 ② 問題回報 ③ 意見回饋 |
| POST 分流 | `type` 缺省 `apply`；`issue` → 問題回報；`feedback` → 意見回饋（缺省相容舊表單） |
| GET 讀取 | `?action=list` 回傳三張工作表 JSON（給 Admin 🔄 同步用） |

### ⚠️ v1.1 升級步驟（必須做一次，否則收不到問題回報 / 意見回饋）

1. 開啟你的 Google Sheet → 擴充功能 → **Apps Script**
2. 用 Admin 📜 Apps Script 分頁的 **v1.1 代碼**整段取代舊代碼 → 儲存
3. 部署 → **編輯部署** → 版本選「**新版本**」→ 部署（網址不變）
4. 完成後到各分頁按「🔄 同步 Sheet」測試

> 舊的接入申請功能在未升級前不受影響；但升級前送出的 `issue` / `feedback` 舊 Script 不認識，**不會入表**。

**健康檢查**（瀏覽器開啟以下 URL，應回傳 `{"status":"ok"}`）：
```
https://script.google.com/macros/s/AKfycbxj5BDDGgjs559smkK4Z5aYImWYeXbN5af8U1ObON0z9WnsN6QJW4I1XWolhs5kQ_H-UQ/exec
```

**同步檢查**（應回傳含 `applications` / `issues` / `feedbacks` 的 JSON）：
```
https://script.google.com/macros/s/AKfycbxj5BDDGgjs559smkK4Z5aYImWYeXbN5af8U1ObON0z9WnsN6QJW4I1XWolhs5kQ_H-UQ/exec?action=list
```

---

## 九、Google Sheet 欄位說明

### 工作表 ①：`申請記錄`（第一次收到申請時自動建立）

| 欄 | 欄位名稱 | 說明 |
|----|---------|------|
| A | 提交時間 | 自動填入 |
| B | 旅團號 | 如 `0082` |
| C | 旅團名稱 | 如 `第82旅` |
| D | Apps Script URL | 旅團的後端 URL |
| E | API Key | 旅團的 API Key |
| F | 接入 APP | vsbadge / scoutsystem / 兩者 |
| G | 備注 | 選填 |
| H | 狀態 | 自動填「待處理」 |
| I | 編號 | 系統自動產生，供同步去重（v1.1；舊表會自動補欄） |

### 工作表 ②：`問題回報`（v1.1）

| 欄 | 欄位名稱 | 說明 |
|----|---------|------|
| A | 提交時間 | 自動填入 |
| B | 來源 APP | 如 vsbadge |
| C | 旅團號 | 選填 |
| D | 標題 | 必填 |
| E | 問題詳情 | 必填 |
| F | 嚴重度 | 低 / 中 / 高 / 緊急 |
| G | 聯絡方式 | 選填 |
| H | 狀態 | 自動填「待處理」 |
| I | 編號 | 系統自動產生 |

### 工作表 ③：`意見回饋`（v1.1）

| 欄 | 欄位名稱 | 說明 |
|----|---------|------|
| A | 提交時間 | 自動填入 |
| B | 來源 APP | 如 vsbadge |
| C | 旅團號 | 選填 |
| D | 類型 | 建議 / 讚 / 批評 / 其他 |
| E | 內容 | 必填 |
| F | 聯絡方式 | 選填 |
| G | 狀態 | 自動填「新回饋」 |
| H | 編號 | 系統自動產生 |

> 工作表和標題欄在**第一次收到該類資料時自動建立**，無需手動建立。

---

## 十、常見問題

**Q：新 APP 要先在 Admin 登記它的 URL 嗎？還是寫好就自動登記？**
A：**都不用登記。** 接收端是同一個固定的 Apps Script URL（寫死在表單代碼內）。其他 APP 只要貼上表單代碼，提交就會自動送到你的 Google Sheet，按「🔄 同步」即出現在 Admin。沒有「逐個 APP 登記 URL」這一步——要改的只有表單代碼裡的 `SOURCE_APP` 名稱。

**Q：問題回報 / 意見回饋收不到？**
A：① 先按第八節完成 **v1.1 Apps Script 升級部署**；② 確認各 APP 已貼上對應表單；③ 到分頁按「🔄 同步 Sheet」。v1.1 部署前送出的 `issue` / `feedback` 不會入表。

**Q：旅團提交後我沒收到 Email？**
A：檢查 Gmail 垃圾郵件夾。或直接打開 Google Sheet 查看對應工作表。

**Q：旅團說提交失敗？**
A：讓旅團到 APP 重新提交。Apps Script 用 `no-cors` 模式，若沒有顯示錯誤訊息通常是成功的。可到 Google Sheet 確認是否有新記錄。

**Q：換了瀏覽器，資料不見了？**
A：用舊瀏覽器匯出備份 JSON，在新瀏覽器匯入。Google Sheet 的原始資料不受影響，也可按「🔄 同步」重新載入。

**Q：想修改通知 Email？**
A：到 Google Sheet → 擴充功能 → Apps Script，修改 `ADMIN_EMAIL` 變數，儲存後重新部署（更新現有部署）。

**Q：想把這個 APP 分享給其他管理員使用？**
A：直接分享 `https://scout-admin-blue.vercel.app/` 即可，資料各自存在各自的瀏覽器 localStorage，互不影響。若要同步資料，用匯出/匯入功能交換備份 JSON。
