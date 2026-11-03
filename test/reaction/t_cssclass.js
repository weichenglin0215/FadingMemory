// CSS 的檔案與 class 名稱規矩（V1.41 重寫；原本是 V1.24 的「class 名稱不能被兩款遊戲共用」）
//
// 規矩（目的：看到 reaction_X.js 就知道樣式在 css/games/reaction_X.css，改樣式不用到處找，也不會因為撞名牽連別款）：
//   ① 每款遊戲 js/reaction_<id>.js 都有自己的 css/games/reaction_<id>.css（數獨系列共用 css/sudoku_lib.css，見下面的 FAMILY）。
//   ② 這份 css 裡定義的 class／id／@keyframes 名稱，一律以「<id>-」開頭（遊戲名稱全名，不再用 2～3 個字母的縮寫，縮寫太容易撞名）。
//      例外：沿用「共用元件」（css/reaction_common.css 的 rx-／qz- 等）、theme.css、dialog.css 等其他 css 已經定義的名稱——
//      在別的 css 裡寫「.rx-grid .alignchar-btn」是用共用元件，不算違規。
//   ③ 遊戲 js 裡寫的 class 字串，也是 <id>- 開頭，或是共用 css 已經定義的名稱——不能去用別款遊戲的 class。
//   ④ 共用 css（reaction_common.css）裡不能出現任何「<遊戲id>-」開頭的 class（遊戲專屬的樣式要放回該遊戲自己的檔案）。
//   ⑤ boot.js 的 reaction 頁有載入每一份遊戲 css 與 reaction_common.css。
//
// 掃描方式：JS 只看「字串字面值」寫的 class 名稱（'class': '…'、className = '…'、classList.add('…')、querySelector('.…')、stageClass: '…'、cls: '…'），
// 不看註解；CSS 去掉註解後，抓選擇器裡的 .class／#id 與 @keyframes 名稱。
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };

// 同一個引擎做出的好幾款遊戲，共用一份 css 與一組前綴（遊戲 id → { css: 檔名（在 css/ 底下）, prefix: 共用的前綴 }）
const FAMILY = {};
['sudoku4', 'sudoku6e', 'sudoku6m', 'sudoku9e', 'sudoku9m', 'sudoku9h', 'sandwich'].forEach(id => { FAMILY[id] = { css: 'sudoku_lib.css', prefix: 'sudokulib' }; });
// 共用元件：不是遊戲，但檔名也叫 reaction_*.js
const NOT_GAME = /^reaction_(core|kit\d*)\.js$/;

const jsDir = path.join(ROOT, 'js'), cssDir = path.join(ROOT, 'css');
const games = fs.readdirSync(jsDir).filter(f => /^reaction_.+\.js$/.test(f) && !NOT_GAME.test(f)).map(f => f.replace(/^reaction_|\.js$/g, '')).sort();
ok(games.length >= 100, '找到的遊戲檔案數量（應該有 100 多個）：' + games.length);

const strip = s => s.replace(/[ \t]*\/\*[\s\S]*?\*\//g, '');
// 取出一份 CSS 裡的選擇器 class／id 名稱與動畫名稱
function cssTokens(text) {
  const out = new Set(), kf = new Set();
  const blocks = (t) => {
    let i = 0; const n = t.length;
    while (i < n) {
      while (i < n && /\s/.test(t[i])) i++;
      if (i >= n) break;
      const s = i; let depth = 0;
      while (i < n && t[i] !== '{' && t[i] !== ';') i++;
      const prelude = t.slice(s, i);
      if (t[i] === ';') { i++; continue; }
      const bs = i; depth = 0;
      while (i < n) { if (t[i] === '{') depth++; else if (t[i] === '}') { depth--; if (depth === 0) { i++; break; } } i++; }
      const body = t.slice(bs + 1, i - 1);
      const km = /^\s*@(?:-webkit-)?keyframes\s+([\w-]+)/.exec(prelude);
      if (km) { kf.add(km[1]); continue; }
      if (/^\s*@(media|supports)/.test(prelude)) { blocks(body); continue; }
      if (/^\s*@/.test(prelude)) continue;
      prelude.replace(/"[^"]*"|'[^']*'/g, '').replace(/\[[^\]]*\]/g, '').replace(/[.#]([a-zA-Z_][\w-]*)/g, (m, a) => { out.add(a); return m; });
    }
  };
  blocks(strip(text));
  return { tokens: out, keyframes: kf };
}
// 取出一份 JS 原始碼裡寫的 class 名稱字串（只留有連字號的，像 rx-grid）
function classesOf(src) {
  src = strip(src);
  const strs = [];
  const grab = (re) => { src.replace(re, (m, a) => { strs.push(a); return m; }); };
  grab(/'class':\s*'([^']*)'/g);
  grab(/'class':\s*"([^"]*)"/g);
  grab(/className\s*(?:\+)?=\s*'([^']*)'/g);
  grab(/classList\.(?:add|remove|toggle|contains)\(\s*'([^']*)'/g);
  grab(/stageClass:\s*'([^']*)'/g);
  grab(/\bcls:\s*'([^']*)'/g);
  src.replace(/querySelector(?:All)?\(\s*'([^']*)'/g, (m, a) => { strs.push(a.replace(/[.#]/g, ' ')); return m; });
  const out = new Set();
  strs.forEach(t => t.split(/\s+/).forEach(c => { if (/^[a-z][a-z0-9]*-[a-z0-9_-]+$/.test(c)) out.add(c); }));
  return out;
}

// 共用樣式（不是某款遊戲專屬的）：reaction_common.css、sudoku_lib.css（引擎）、theme／dialog／leaderboard… 其他 css
const sharedFiles = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'));
const sharedTokens = new Set();
sharedFiles.forEach(f => cssTokens(fs.readFileSync(path.join(cssDir, f), 'utf8')).tokens.forEach(t => sharedTokens.add(t)));
ok(sharedTokens.size > 50, '共用 css 的 class 名稱數量（掃描有沒有壞掉）：' + sharedTokens.size);

let scannedCss = 0, scannedJs = 0;
games.forEach(id => {
  const fam = FAMILY[id];
  const cssFile = fam ? path.join(cssDir, fam.css) : path.join(cssDir, 'games', 'reaction_' + id + '.css');
  ok(fs.existsSync(cssFile), id + '：找不到樣式檔 ' + path.relative(ROOT, cssFile) + '（每款遊戲都要有同名的 css/games/reaction_' + id + '.css）');
  const prefix = fam ? fam.prefix : id;
  const jsSrc = fs.readFileSync(path.join(jsDir, 'reaction_' + id + '.js'), 'utf8');
  // ② 遊戲專屬 css 裡的名稱
  if (!fam && fs.existsSync(cssFile)) {
    scannedCss++;
    const r = cssTokens(fs.readFileSync(cssFile, 'utf8'));
    r.tokens.forEach(t => {
      if (t.includes('-') && !t.startsWith(prefix + '-')) {
        // 只在共用 css（css/ 底下，不含 css/games/）有定義時才准用（共用元件）
        ok(sharedTokens.has(t), id + '.css：class「' + t + '」不是以「' + prefix + '-」開頭，也不是共用元件');
      }
    });
    r.keyframes.forEach(k => ok(k.startsWith(prefix + '-'), id + '.css：動畫「' + k + '」要以「' + prefix + '-」開頭'));
  }
  // ③ 遊戲 js 裡寫的 class
  scannedJs++;
  classesOf(jsSrc).forEach(c => {
    if (c.startsWith(prefix + '-')) return;
    ok(sharedTokens.has(c) || /^(rx|qz|btn|hint|dlg|bar|ui|screen|flip|rt|ld)-/.test(c), id + '.js：class「' + c + '」不是以「' + prefix + '-」開頭，也不是共用元件（不能用別款遊戲的 class）');
  });
});

// ④ 共用 css 裡不能有遊戲專屬的 class
const gameIds = games.filter(id => !FAMILY[id]);
const common = cssTokens(fs.readFileSync(path.join(cssDir, 'reaction_common.css'), 'utf8'));
common.tokens.forEach(t => { const id = gameIds.find(g => t.startsWith(g + '-')); ok(!id, 'reaction_common.css 裡出現遊戲專屬的 class「' + t + '」，請搬回 css/games/reaction_' + id + '.css'); });
ok(!fs.readdirSync(cssDir).some(f => /^reaction[0-9]\.css$/.test(f)) && !fs.existsSync(path.join(cssDir, 'reaction.css')), '舊的 css/reaction*.css 已經拆光，不能再有');

// ⑤ boot.js 有載入
const boot = fs.readFileSync(path.join(jsDir, 'boot.js'), 'utf8');
ok(boot.includes("'css/reaction_common.css'"), 'boot.js 的 reaction 頁有載入 css/reaction_common.css');
games.forEach(id => { const f = FAMILY[id] ? 'css/' + FAMILY[id].css : 'css/games/reaction_' + id + '.css'; ok(boot.includes("'" + f + "'"), 'boot.js 的 reaction 頁有載入 ' + f); });
// css/games/ 底下不能有找不到遊戲的孤兒檔
fs.readdirSync(path.join(cssDir, 'games')).forEach(f => ok(games.includes(f.replace(/^reaction_|\.css$/g, '')), 'css/games/' + f + ' 找不到對應的 js/reaction_*.js'));

console.log('掃描 ' + scannedCss + ' 份遊戲 css、' + scannedJs + ' 個遊戲檔；共用 class ' + sharedTokens.size + ' 個');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
