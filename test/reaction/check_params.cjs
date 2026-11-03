// 檢查每個 js 檔案「═══ 可以自己調的參數 ═══」那一區：每個 var／const 設定有沒有註解（只讀、不改檔）。
//   一個設定算「有註解」＝同一行（含續行）有 /* … */ 或 // …，或緊接在前面的一行是註解。
//   這一區從「可以自己調的參數」那一行開始，到下一個「═══」標題（例如「純函式」）、或第一個 function 定義為止。
// 用法（在專案根目錄）：
//   node test/reaction/check_params.cjs              只列出統計與沒有註解的檔案數
//   node test/reaction/check_params.cjs --list       列出每一個沒有註解的設定（檔案:行號 名稱）
//   node test/reaction/check_params.cjs js/reaction_coins.js   只看指定的檔案
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const list = args.includes('--list');
const files = args.filter(a => !a.startsWith('--'));
const all = files.length ? files : fs.readdirSync('js').filter(f => f.endsWith('.js')).map(f => 'js/' + f);
let nFiles = 0, nParams = 0, nBare = 0, filesWithBare = 0;
all.forEach(f => {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  const start = lines.findIndex(l => /可以自己調的參數/.test(l));
  if (start < 0) return;
  nFiles++;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/═══/.test(lines[i]) || /^\s*function\s/.test(lines[i])) { end = i; break; }
  }
  let bare = 0;
  for (let i = start + 1; i < end; i++) {
    const m = lines[i].match(/^\s{4}(?:var|const|let)\s+(.+)/);
    if (!m) continue;
    nParams++;
    const hasInline = /\/\*|\/\//.test(lines[i]);
    /* 多行的設定（陣列、物件）：往下看到結束那一行，任何一行有註解就算 */
    let j = i, open = (lines[i].match(/[\[{(]/g) || []).length - (lines[i].match(/[\]})]/g) || []).length, multi = false;
    while (open > 0 && j + 1 < end) { j++; multi = true; open += (lines[j].match(/[\[{(]/g) || []).length - (lines[j].match(/[\]})]/g) || []).length; if (/\/\*|\/\//.test(lines[j])) multi = 'c'; }
    const prev = i > start + 1 ? lines[i - 1] : '';
    const pt = prev.trim();
    const hasPrev = /^(\/\*|\/\/|\*)/.test(pt) || (/\*\/$/.test(pt) && !/^(var|const|let)\b/.test(pt) && !/;\s*\/\*/.test(pt));     // 別的設定行尾的註解不算
    if (!(hasInline || multi === 'c' || hasPrev)) { bare++; if (list) console.log(f + ':' + (i + 1) + '  ' + m[1].slice(0, 70)); }
  }
  nBare += bare; if (bare) filesWithBare++;
});
console.log('有「可以自己調的參數」區的檔案 ' + nFiles + ' 個；設定 ' + nParams + ' 個；沒有註解的 ' + nBare + ' 個（分布在 ' + filesWithBare + ' 個檔案）');
