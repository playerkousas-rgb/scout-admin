# Scout Admin — 旅團接入管理中心 說明書

> 版本：1.0 | 作者：playerkousas@hotmail.com
> 部署網址：https://scout-admin-blue.vercel.app/

---

## 一、這是什麼

Scout Admin 是一個**靜態管理後台**，用於：

1. 接收旅團的接入申請（透過 Apps Script Web App）
2. 查看和審核申請
3. 自動產生各 APP 所需的 JSON / TypeScript 設定格式
4. 讓你一鍵複製貼入各 APP 的設定檔完成接入

**不需要伺服器、不需要資料庫。** 申請資料存在你的 Google Sheet，審核狀態存在瀏覽器 localStorage。

---

## 二、系統組成

```
┌─────────────────────────────────────────────────┐
│           Scout Admin APP（你的後台）            │
│     https://scout-admin-blue.vercel.app/         │
│                                                  │
│  📥 新申請  📋 旅團總覽  🔧 產生器  📜 Script  │
└────────────────────┬────────────────────────────┘
                     │ 資料來自
                     ▼
┌─────────────────────────────────────────────────┐
│         Apps Script Web App（接收端）            │
│  接收 POST → 寫 Google Sheet → 寄 Email 通知    │
└────────────────────┬────────────────────────────┘
                     │ 資料來源
                     ▼
┌─────────────────────────────────────────────────┐
│      旅團 APP 內嵌的申請表單（發送端）           │
│  填寫：旅團號、名稱、URL、API Key、接入APP      │
└─────────────────────────────────────────────────┘
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
| ＋ 手動新增 | 不透過表單，直接在 Admin APP 新增申請（適合電話/Email 收到申請的情況） |

**篩選**：可按「全部 / 待處理 / 已完成 / 已拒絕」篩選，或用搜尋框搜尋旅團名稱、編號。

**申請卡展開後顯示的輸出**（根據該旅團勾選的 APP 而定）：

- 勾了 **vsbadge** → `troops.json` 片段
- 勾了 **scoutsystem** → `troops.ts` 片段 + Vercel 環境變數
- 兩個都勾 → 兩者都顯示

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

**上半部**：Apps Script 代碼備份（已部署，留底用）。

**下半部**：前端申請表單代碼，複製後直接貼入任何旅團 APP 的設定頁面。
- Web App URL 已預先填入
- 無需修改任何設定

---

### ⚙️ 設定 / 匯出匯入

- **匯出**：把所有申請記錄匯出成 JSON 備份檔
- **匯入**：從備份 JSON 還原資料
- **清除**：清空所有本地資料（不可撤銷）

> 💡 建議定期匯出備份，因為資料存在瀏覽器 localStorage，換瀏覽器或清除快取會遺失。

---

## 四、完整申請流程

```
旅團在 APP 設定頁面填申請表單
      │
      │ POST（no-cors）
      ▼
Apps Script Web App
https://script.google.com/macros/s/AKfycbxj5BD.../exec
      │
      ├─→ 寫入 Google Sheet「申請記錄」工作表
      └─→ 寄 Email 至 playerkousas@hotmail.com
                  │
                  ▼
      你收到 Email 通知
                  │
                  ▼
      前往 Scout Admin APP → 📥 新申請
                  │
                  ├─ 確認資料
                  ├─ 點「✅ 標記完成」
                  └─ 展開卡片 → 複製輸出
                              │
                              ├─ vsbadge：貼入 troops.json → git push
                              └─ scoutsystem：貼入 troops.ts + 設 Vercel env → git push
                              │
                              ▼
                        Vercel 自動部署 → 旅團立即可用
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

## 六、將申請表單加入新 APP

每開發一個新的第 3 級元件，都要在 APP 的設定頁面加入申請表單：

1. 前往 **Scout Admin APP → 📜 Apps Script 分頁**
2. 找到「前端申請表單代碼」
3. 點「複製」
4. 貼入新 APP 設定頁面的 HTML

表單已包含：
- 所有必要欄位（旅團號、名稱、URL、API Key、接入 APP 選擇）
- 連接到 Apps Script Web App 的 URL（已預設）
- 提交成功/失敗的回饋訊息
- 表單驗證（必填欄位）

---

## 七、資料儲存說明

| 資料 | 儲存位置 | 說明 |
|------|---------|------|
| 申請記錄 | 瀏覽器 localStorage | 換瀏覽器需重新匯入 |
| 審核狀態 | 瀏覽器 localStorage | 定期匯出備份 |
| 原始申請資料 | Google Sheet | 永久保存，不受瀏覽器影響 |
| Email 通知記錄 | Gmail | 永久保存 |

**建議流程**：
- Google Sheet 看原始申請 → Scout Admin APP 做審核和產生 JSON → 匯出備份保存

---

## 八、Apps Script Web App 資訊

| 項目 | 說明 |
|------|------|
| URL | `https://script.google.com/macros/s/AKfycbxj5BDDGgjs559smkK4Z5aYImWYeXbN5af8U1ObON0z9WnsN6QJW4I1XWolhs5kQ_H-UQ/exec` |
| 執行身分 | 你（管理員帳號） |
| 存取權限 | 所有人 |
| 通知 Email | playerkousas@hotmail.com |
| Google Sheet 工作表 | 申請記錄 |

**健康檢查**（瀏覽器開啟以下 URL，應回傳 `{"status":"ok"}`）：
```
https://script.google.com/macros/s/AKfycbxj5BDDGgjs559smkK4Z5aYImWYeXbN5af8U1ObON0z9WnsN6QJW4I1XWolhs5kQ_H-UQ/exec
```

---

## 九、Google Sheet 欄位說明

工作表名稱：`申請記錄`（第一次收到申請時自動建立）

| 欄 | 欄位名稱 | 說明 |
|----|---------|------|
| A | 提交時間 | 自動填入 |
| B | 旅團號 | 如 `0082` |
| C | 旅團名稱 | 如 `第82旅` |
| D | Apps Script URL | 旅團的後端 URL |
| E | API Key | 旅團的 API Key |
| F | 接入 APP | `vsbadge` / `scoutsystem` / 兩者 |
| G | 備注 | 選填，旅團自填 |
| H | 狀態 | 自動填「待處理」 |

---

## 十、常見問題

**Q：旅團提交後我沒收到 Email？**
A：檢查 Gmail 垃圾郵件夾。或直接打開 Google Sheet 查看「申請記錄」工作表。

**Q：旅團說提交失敗？**
A：讓旅團到 APP 重新提交。Apps Script 用 `no-cors` 模式，若沒有顯示錯誤訊息通常是成功的。可到 Google Sheet 確認是否有新記錄。

**Q：換了瀏覽器，申請記錄不見了？**
A：用舊瀏覽器匯出備份 JSON，在新瀏覽器匯入。Google Sheet 的原始申請資料不受影響，可手動重新新增。

**Q：想修改通知 Email？**
A：到 Google Sheet → 擴充功能 → Apps Script，修改 `ADMIN_EMAIL` 變數，儲存後重新部署（更新現有部署）。

**Q：想把這個 APP 分享給其他管理員使用？**
A：直接分享 `https://scout-admin-blue.vercel.app/` 即可，資料各自存在各自的瀏覽器 localStorage，互不影響。若要同步資料，用匯出/匯入功能交換備份 JSON。
