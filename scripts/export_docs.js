// 把 index.html 內嵌的 DOCS.scout.content 與 SCOUT_ADMIN.md 保持逐字一致
//
// 背景：說明書有兩份 —— GitHub 上的 SCOUT_ADMIN.md，同後台「📖 說明書」分頁
//       內嵌的那份。兩份一唔同步，就會出現「線上說明書講嘅同 GitHub 唔同」。
//
// 用法：
//   node scripts/export_docs.js           # index.html → SCOUT_ADMIN.md（預設）
//   node scripts/export_docs.js --check   # 只檢查兩邊是否一致（npm test 用）
//   node scripts/export_docs.js --import  # SCOUT_ADMIN.md → index.html（改文件用呢個）
//
// 規則：兩邊必須逐字相同，否則 npm test 會 fail。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'index.html');
const MD_PATH = path.join(ROOT, 'SCOUT_ADMIN.md');

const MARKER = '    content: `';

function bounds(html) {
  const i = html.indexOf(MARKER);
  if (i < 0) throw new Error('index.html 找不到 DOCS.scout.content');
  const start = i + MARKER.length;
  const end = html.indexOf('\n`\n', start);
  if (end < 0) throw new Error('DOCS.scout.content 模板字串沒有正確結尾');
  return { start, end };
}

function readEmbedded() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const { start, end } = bounds(html);
  const raw = html.slice(start, end);
  return new Function('return `' + raw + '`')();
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const importMode = process.argv.includes('--import');
  const embedded = readEmbedded();

  if (checkOnly) {
    if (!fs.existsSync(MD_PATH)) {
      console.error('FAIL: 缺少 SCOUT_ADMIN.md');
      process.exit(1);
    }
    const md = fs.readFileSync(MD_PATH, 'utf8').replace(/\n$/, '');
    if (md !== embedded) {
      console.error(`FAIL: SCOUT_ADMIN.md 與後台內嵌說明書不一致（檔案 ${md.length} 字／內嵌 ${embedded.length} 字）`);
      console.error('      執行 node scripts/export_docs.js --import（以 md 為準）或 node scripts/export_docs.js（以檔案為準）');
      process.exit(1);
    }
    console.log('ok  : SCOUT_ADMIN.md 與後台內嵌說明書一致（' + embedded.length + ' 字）');
    return;
  }

  if (importMode) {
    const md = fs.readFileSync(MD_PATH, 'utf8').replace(/\n$/, '');
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    const { start, end } = bounds(html);
    const esc = md.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
      // 說明書有 <script> 片段：一定要寫成 <\/script>，否則會提早結束 index.html 的 <script> 區塊
      .replace(/<\/script/gi, '<\\/script');
    fs.writeFileSync(HTML_PATH, html.slice(0, start) + esc + html.slice(end), 'utf8');
    console.log('已把 SCOUT_ADMIN.md 寫回 index.html 的說明書（' + md.length + ' 字）');
    return;
  }

  fs.writeFileSync(MD_PATH, embedded + '\n', 'utf8');
  console.log('已寫入 SCOUT_ADMIN.md（' + embedded.length + ' 字）');
}

main();
