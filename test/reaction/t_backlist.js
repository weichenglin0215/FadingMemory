// 遊戲頁左上角的「返回」要回到「選一個想玩的遊戲」列表（不是只回主選單）：
//   · js/reaction.js：返回 → index.html?games=1（而且先停掉結算背景音樂）
//   · js/menu.js：進選單時看到 ?games=1 就直接打開遊戲列表；列表關掉時把這個參數拿掉（重新整理才不會又跳出來）
//   · 判斷網址的規則（wantsGameList）：?games=1、&games=1 才算；games=10、xgames=1 不算
// 實際點擊的流程在瀏覽器驗證（遊戲頁按返回 → 列表打開 → 按返回關掉 → 網址乾淨）。
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../') + '/';

let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };

const rx = fs.readFileSync(ROOT + 'js/reaction.js', 'utf8');
const menu = fs.readFileSync(ROOT + 'js/menu.js', 'utf8');

ok(/barBack\.addEventListener\('click', function \(\) \{ Sfx\.stopBgm\(\); location\.href = 'index\.html\?games=1'; \}\);/.test(rx), 'reaction.js：返回 → index.html?games=1（先 Sfx.stopBgm）');
ok(!/location\.href = 'index\.html';/.test(rx), 'reaction.js：不再有直接回 index.html 的返回');

// 把 menu.js 裡的 wantsGameList 抽出來，用假的 location 驗證判斷規則
const m = /function wantsGameList\(\) \{ return (\/[^;]+\/)\.test\(location\.search\); \}/.exec(menu);
ok(!!m, 'menu.js：有 wantsGameList()');
if (m) {
  const re = eval(m[1]);
  const want = s => re.test(s);
  ok(want('?games=1'), '?games=1');
  ok(want('?x=2&games=1'), '?x=2&games=1');
  ok(want('?games=1&x=2'), '?games=1&x=2');
  ok(!want(''), '沒有參數不算');
  ok(!want('?games=10'), '?games=10 不算');
  ok(!want('?xgames=1'), '?xgames=1 不算');
  ok(!want('?games=0'), '?games=0 不算');
}
ok(/if \(wantsGameList\(\)\) \{\s*gameMenu = buildGameDlg\(\);\s*gameMenu\.show\(\);\s*\}/.test(menu), 'menu.js：進選單時 wantsGameList() 為真就建好並打開遊戲列表');
ok(/function hide\(\) \{ gameDlg\.hidden = true; closeGrandma\(\); dropGamesParam\(\); \}/.test(menu), 'menu.js：列表關掉時 dropGamesParam()');
ok(/searchParams\.delete\('games'\)/.test(menu) && /replaceState/.test(menu), 'menu.js：dropGamesParam 用 replaceState 拿掉 games 參數');

console.log((bad ? bad + ' FAIL / ' : '') + total + ' checks');
console.log(bad ? 'SOME FAILED' : 'ALL PASS');
process.exit(bad ? 1 : 0);
