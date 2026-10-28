// 把 index.html 內嵌的 GS_CODE 匯出成獨立檔案 apps-script/Code.gs
//
// 用途：後台未部署／未更新時，可以直接在 GitHub 打開 apps-script/Code.gs，
//       按「Raw」全選複製，貼進 Google Apps Script —— 唔需要等 Vercel。
//
// 用法：
//   node scripts/export_gs.js           # 重新產生 apps-script/Code.gs（index.html → 檔案）
//   node scripts/export_gs.js --check   # 只檢查兩邊是否一致（npm test 用，CI 不會改檔）
//   node scripts/export_gs.js --import  # 反向：把 apps-script/Code.gs 寫回 index.html 的 GS_CODE
//                                       #（喺純 JS 檔改 GS 代碼比較安全，改完再 --import）
//
// 規則：apps-script/Code.gs 必須與 index.html 的 GS_CODE 逐字相同，
//       否則「後台複製備份」同「GitHub Raw」兩條路會拿到不同版本。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'apps-script', 'Code.gs');

function readGsCode() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const marker = 'const GS_CODE = `';
  const i = html.indexOf(marker) + marker.length;
  if (i < marker.length) throw new Error('index.html 找不到 GS_CODE');
  const j = html.indexOf('\n`;\n', i);
  if (j === -1) throw new Error('GS_CODE 模板字串沒有正確結尾');
  const raw = html.slice(i, j);
  return new Function('return `' + raw + '`')();
}

// 反向同步：把檔案內容寫回 index.html 的 GS_CODE 模板字串
// 模板字串要跳脫 \ ` ${ ，否則貼上／求值都會壞
function importToHtml() {
  const htmlPath = path.join(ROOT, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const marker = 'const GS_CODE = `';
  const i = html.indexOf(marker) + marker.length;
  if (i < marker.length) throw new Error('index.html 找不到 GS_CODE');
  const j = html.indexOf('\n`;\n', i);
  if (j === -1) throw new Error('GS_CODE 模板字串沒有正確結尾');

  const code = fs.readFileSync(OUT, 'utf8').replace(/\n$/, '');
  const esc = code.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  fs.writeFileSync(htmlPath, html.slice(0, i) + esc + html.slice(j), 'utf8');
  console.log('已把 apps-script/Code.gs 寫回 index.html 的 GS_CODE（' + code.split('\n').length + ' 行）');
}

function main() {
  if (process.argv.includes('--import')) return importToHtml();
  const code = readGsCode();
  const checkOnly = process.argv.includes('--check');

  if (checkOnly) {
    if (!fs.existsSync(OUT)) {
      console.error('FAIL: 缺少 apps-script/Code.gs（執行 node scripts/export_gs.js 產生）');
      process.exit(1);
    }
    const cur = fs.readFileSync(OUT, 'utf8');
    if (cur !== code) {
      const curLines = cur.split('\n').length;
      const newLines = code.split('\n').length;
      console.error(`FAIL: apps-script/Code.gs 與 index.html 的 GS_CODE 不一致（檔案 ${curLines} 行／GS_CODE ${newLines} 行）`);
      console.error('      執行 node scripts/export_gs.js 重新產生');
      process.exit(1);
    }
    console.log('ok  : apps-script/Code.gs 與 GS_CODE 一致（' + code.split('\n').length + ' 行）');
    return;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, code, 'utf8');
  console.log('已寫入 apps-script/Code.gs（' + code.split('\n').length + ' 行）');
}

main();
