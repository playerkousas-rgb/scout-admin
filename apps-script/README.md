# Apps Script 後端（v2.5）— 唔需要等 Vercel 都可以取到最新版

`Code.gs` 是 **自動由 `index.html` 內的 `GS_CODE` 匯出**，兩邊逐字相同
（`npm test` 會檢查，不同就 Fail）。所以「後台複製備份」同「這裡的 Raw」拿到的是同一份。

## 三種取得方式（任選一）

| 方式 | 做法 | 幾時用 |
|------|------|--------|
| **① GitHub Raw（最穩，唔靠 Vercel）** | 開 `apps-script/Code.gs` → 右上 **Raw** → 全選複製 | 後台未部署／見到舊版時 |
| ② 後台按鈕 | 後台 → 📜 Apps Script → **複製備份** | 後台已經係 v2.5（右上角見 `v2.5.0 ✔`） |
| ③ 本機指令 | `node scripts/export_gs.js`（會重新產生這個檔） | 改完 `GS_CODE` 之後 |

## 貼上之後（一定要做這一步）

1. Google Sheet → 擴充功能 → **Apps Script** → `Ctrl/Cmd + A` 清空 → 貼上
2. **儲存**（Ctrl/Cmd + S）
3. **部署 → 管理部署 → ✏️ 編輯 → 版本：新版本 → 部署**
   （網址不變，4 個 BADGE APP 不需要改任何設定）
4. 驗證：編輯器搜尋 **`GS_VERSION`** → 搵到 `var GS_VERSION = "2.5";` 就係新版
   （舊版 v2.4 完全冇這個字）

> ⚠️ 只按「儲存」唔會生效：公開的 `/exec` 網址仍然行舊版本，必須「新版本 → 部署」。

## 版本對照

| | 行數（約） | 特徵 |
|---|---|---|
| 舊版 v2.4 | 369 行 | 冇 `GS_VERSION`、`專章系統` 只有 4 個別名、`markReq` 唔支援 `notify` |
| **v2.5** | **589 行** | 有 `GS_VERSION`、4 個 BADGE APP 統一、`聯絡 Email` 欄、回覆信、`?action=diag` |

## 一次性檢查（貼完想確認線上有冇生效）

```
https://script.google.com/macros/s/<你的部署ID>/exec
```
應回 `{"status":"ok","message":"Scout Admin Web App 正常運行","version":"2.5"}`。
（如果只回 `status` / `message` 而冇 `version` → 仍然是舊版。）
