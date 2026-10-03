// 一次跑完 test/reaction/ 底下所有 t_*.js，任何一支沒有印出 ALL PASS 就回傳錯誤碼 1。
// 用法（在專案根目錄）：node test/reaction/run_all.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const files = fs.readdirSync(__dirname).filter(f => /^t_.*\.js$/.test(f)).sort();
let bad = 0;
files.forEach(f => {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  const lines = (r.stdout || '').trim().split('\n');
  const last = lines[lines.length - 1] || '';
  const ok = /ALL PASS/.test(last) && r.status === 0;
  if (!ok) bad++;
  console.log((ok ? 'OK   ' : 'FAIL ') + f.padEnd(16) + last);
});
console.log(bad ? '\n' + bad + ' 支測試失敗' : '\n全部通過（' + files.length + ' 支）');
process.exit(bad ? 1 : 0);
