// 找出「可以自己調的參數」區裡，行尾註解寫的數字跟程式裡真正的值對不上的設定（只讀、不改檔，給人再看一眼）。
//   做法：註解裡出現「A → B」「A～B」「A -> B」這種範圍時，A、B 應該都出現在這一行設定的數字裡（或這一行的設定是陣列／變數，數字不同就要查）。
//   舊值的說明（寫了「原本」「以前」「舊」「V1.xx」）不算。
// 用法（在專案根目錄）：  node test/reaction/check_param_comments.cjs
const fs = require('fs');
const files = fs.readdirSync('js').filter(f => f.endsWith('.js')).map(f => 'js/' + f);
let n = 0, bad = 0;
files.forEach(f => {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  const start = lines.findIndex(l => /可以自己調的參數/.test(l)); if (start < 0) return;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/═══/.test(lines[i]) || /^\s*function\s/.test(lines[i])) { end = i; break; }
  for (let i = start + 1; i < end; i++) {
    const m = lines[i].match(/^\s{4}(?:var|const|let)\s+(.*?;?)\s*(\/\*.*\*\/|\/\/.*)\s*$/);
    if (!m) continue;
    const code = m[1], cm = m[2]; n++;
    const cmClean = cm.replace(/（[^）]*(原本|以前|舊|V1\.\d+)[^）]*）/g, '').replace(/[^;；]*(原本|以前|舊版)[^;；]*/g, '');
    const nums = [...code.matchAll(/-?\d+(?:\.\d+)?/g)].map(x => parseFloat(x[0]));
    if (nums.length < 2) continue;
    const pairs = [...cmClean.matchAll(/(-?\d+(?:\.\d+)?)\s*(?:→|->|～|~)\s*(-?\d+(?:\.\d+)?)/g)];
    for (const p of pairs) {
      const a = parseFloat(p[1]), b = parseFloat(p[2]);
      if (!(nums.includes(a) && nums.includes(b))) { bad++; console.log(f + ':' + (i + 1) + '  註解 ' + p[0] + ' ／ 設定 ' + code.slice(0, 90)); break; }
    }
  }
});
console.log('檢查 ' + n + ' 個有行尾註解的設定，數字對不上的 ' + bad + ' 個');
