// 檢查 README.md 的「每款小遊戲介紹」跟遊戲檔案是否一致（預設只讀、不改檔）：
//   · README 有、遊戲沒有／遊戲有、README 沒有的 id
//   · 名稱不同
//   · 玩法文字不是該遊戲目前「玩法說明」（rule，去掉 ** 標記）的開頭
//   · 各分類款數、總款數、版本號
// 用法（在專案根目錄）：
//   node test/reaction/check_readme.cjs                 檢查
//   node test/reaction/check_readme.cjs --detail        檢查，並列出不一致的每款「README 寫的」與「目前的玩法說明」
//   node test/reaction/check_readme.cjs --show-new      列出不一致的每款「照目前玩法說明重新摘錄的前 3 句」（沒有改檔）
//   node test/reaction/check_readme.cjs --fix           把不一致的每款玩法欄位改成「目前玩法說明的前 3 句」（會改寫 README.md）
const fs = require('fs');
const { loadAllGames } = require('../leaderboard/all_games.cjs');
const games = loadAllGames();
const byId = {}; games.forEach(g => { byId[g.id] = g; });
const text = fs.readFileSync('README.md', 'utf8');
const crlf = text.includes('\r\n');
const lines = text.split(/\r?\n/);
const rows = {};
lines.forEach((l, i) => {
  const m = l.match(/^\| <img src="img\/reaction\/([a-z0-9_]+)\.png" alt="([^"]*)"[^>]*> \| \*\*([^*]+)\*\* \| (.*) \|$/);
  if (m) rows[m[1]] = { name: m[3], desc: m[4], line: i + 1 };
});
const ids = Object.keys(rows);
console.log('README 遊戲列 ' + ids.length + '，遊戲檔案 ' + games.length);
console.log('README 有、遊戲沒有：', ids.filter(i => !byId[i]));
console.log('遊戲有、README 沒有：', games.map(g => g.id).filter(i => !rows[i]));
const strip = s => s.replace(/\*\*/g, '');
/* 玩法說明的前 3 句（累積超過 110 字就先停；句號、驚嘆號、問號結尾；「」裡面的不算）；換行當成空白 */
function firstSentences(rule, n) {
  const s = strip(rule).replace(/\s*\n\s*/g, ''), out = []; let cur = '', depth = 0;
  for (const ch of s) {
    cur += ch;
    if (ch === '「') depth++; else if (ch === '」') depth = Math.max(0, depth - 1);
    else if (depth === 0 && /[。！？]/.test(ch)) { out.push(cur); cur = ''; if (out.length >= n || out.join('').length >= 110) break; }
  }
  if (cur && out.length < n) out.push(cur);
  return out.join('');
}
const bad = [];
ids.forEach(id => {
  const g = byId[id]; if (!g) return;
  if (g.name !== rows[id].name) bad.push(['名稱', id, g.name, rows[id].name]);
  const rule = strip(g.rule || '').replace(/\s*\n\s*/g, ''), d = rows[id].desc.replace(/…$/, '');
  if (!rule.startsWith(d)) bad.push(['玩法', id, 'README 第 ' + rows[id].line + ' 行']);
});
console.log('玩法或名稱跟遊戲目前不一致：' + bad.length + ' 款');
bad.forEach(b => console.log('  ' + b.join(' ｜ ')));
const menu = fs.readFileSync('js/menu.js', 'utf8');
const cat = {};
[...menu.matchAll(/\{ id: '([a-z0-9_]+)', name: '[^']+', cat: '([a-z]+)'/g)].forEach(m => { cat[m[2]] = (cat[m[2]] || 0) + 1; });
console.log('選單分類款數：', JSON.stringify(cat), '共', Object.values(cat).reduce((a, b) => a + b, 0));
console.log('README 出現的「N 款」：', [...new Set([...text.matchAll(/(\d+)\s*款/g)].map(m => m[0]))].join('、'));
console.log('README 版本：', (text.match(/目前版本 \*\*(V[\d.]+)\*\*/) || [])[1], '／version.json：', JSON.parse(fs.readFileSync('version.json', 'utf8')).version);
const mode = process.argv[2];
if (mode === '--detail') bad.filter(b => b[0] === '玩法').forEach(b => { console.log('\n[' + b[1] + ']\n README：' + rows[b[1]].desc + '\n 目前 ：' + strip(byId[b[1]].rule).replace(/\s*\n\s*/g, '').slice(0, rows[b[1]].desc.length + 80)); });
if (mode === '--show-new') bad.filter(b => b[0] === '玩法').forEach(b => console.log('\n[' + b[1] + ']\n 新：' + firstSentences(byId[b[1]].rule, 3)));
if (mode === '--fix') {
  const out = lines.slice();
  bad.filter(b => b[0] === '玩法').forEach(b => {
    const r = rows[b[1]], i = r.line - 1;
    out[i] = out[i].replace('| ' + r.desc + ' |', () => '| ' + firstSentences(byId[b[1]].rule, 3) + ' |');
  });
  fs.writeFileSync('README.md', out.join(crlf ? '\r\n' : '\n'));
  console.log('已改寫 ' + bad.filter(b => b[0] === '玩法').length + ' 款的玩法欄位');
}
