// 產生 js/gomoku_bank.js：堵住五子的「題庫」（V1.36.0）。
//
// 為什麼要有題庫：堵住五子原本只有兩種題型（四顆一排、兩個三顆交叉），玩家一眼就知道要擋「四顆的端點」或「交叉點」，到第 20 關也一樣。
// 對人類來說，五子棋防守真正難的是**看不出來的威脅**——白棋沒有現成的四，卻能靠「連續衝四」（衝四逼黑棋擋、再衝四…）最後連成雙四或活四；
// 唯一的化解點往往不在任何一條線的端點，而是某個「破壞整個連環」的關鍵格。這種盤面用「放模板」做不出來，要用電腦搜尋：
//   ① 隨機擺一小團白棋（沿著線放 2～3 顆、可以跳一格）和幾顆黑棋；
//   ② 一顆一顆往附近加白棋（把「很多種擋法」逼成「只剩一種擋法」）；每加一顆就用遊戲本身的出題判斷（whiteWins／solutionCells）驗證：
//      白棋在 DEPTH 步預備（連續衝四）之內贏得了、黑棋沒有反擊、而且黑棋所有「有意義的下法」裡剛好只有一格擋得住；
//   ③ 依「白棋最少要幾步預備才贏」分成 D1（一手就能雙四／活四）、D2（先衝四、黑棋被逼著擋，再雙四）、D3（連衝兩次四之後才雙四）三級；
//   ④ 去掉重複（8 種翻轉旋轉、平移之後一樣的算同一題），存成 js/gomoku_bank.js，遊戲出題時挑一題、隨機翻轉旋轉平移、再放上雜訊棋子與假威脅。
//
// 用法（在專案根目錄）：node test/reaction/gen_gomoku_bank.cjs [分鐘數，預設 6] [最多每級幾題，預設 150]
//   搜尋是隨機的，每次跑出來的題庫不一樣；題庫是靜態檔案，產生好之後用 git 提交就好，不需要每次執行。
//   測試（test/reaction/t_gomoku.js）會把題庫裡的每一題用目前的遊戲判斷重新驗證一遍。
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../');
const { game, rng } = require('./load.js');
const G = game('reaction_gomoku.js'); const T = G.test;
const minutes = Number(process.argv[2] || 6), cap = Number(process.argv[3] || 150);
const rand = rng(Date.now() & 0x7fffffff);
const n = T.BOARD, W = T.WHITE, B = T.BLACK, DEPTH = 4;
const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

// ① 一小團隨機的棋：沿著線放 2～3 顆白棋（有時中間跳一格），再放幾顆黑棋
function cluster(kw, kb, span) {
  const b = T.newBoard(n), r0 = 4, c0 = 4;
  const put = (r, c, v) => { if (r < 0 || r >= n || c < 0 || c >= n || b[r * n + c]) return false; b[r * n + c] = v; return true; };
  let w = 0, guard = 0;
  while (w < kw && guard++ < 100) {
    const d = DIRS[ri(0, 3)], len = ri(2, 3), r = r0 + ri(0, span), c = c0 + ri(0, span), gap = rand() < 0.3;
    for (let k = 0; k < len + (gap ? 1 : 0) && w < kw; k++) { if (gap && k === 1) continue; if (put(r + d[0] * k, c + d[1] * k, W)) w++; }
  }
  for (let k = 0; k < kb; k++) for (let t = 0; t < 20; t++) if (put(r0 + ri(-1, span + 1), c0 + ri(-1, span + 1), B)) break;
  return b;
}
const quiet = b => !(T.winCells(b, n, W).length || T.winCells(b, n, B).length || T.blackCounter(b, n));
function dminOf(b) { for (let d = 1; d <= DEPTH; d++) if (T.whiteWins(b, n, d).win) return d; return -1; }

// ④ 標準形：8 種翻轉旋轉之後，平移到左上角，取字串最小的當代表（找重複用）
function canon(cells) {      // cells：[[r,c,v]…]（v：白 -1、黑 1、答案 2）
  let best = null;
  for (let s = 0; s < 8; s++) {
    const t = cells.map(([r, c, v]) => { let rr = r, cc = c; if (s & 1) cc = -cc; if (s & 2) rr = -rr; if (s & 4) { const x = rr; rr = cc; cc = x; } return [rr, cc, v]; });
    const mr = Math.min(...t.map(x => x[0])), mc = Math.min(...t.map(x => x[1]));
    const str = t.map(([r, c, v]) => (r - mr) + ',' + (c - mc) + ',' + v).sort().join(';');
    if (best === null || str < best) best = str;
  }
  return best;
}

const found = { 1: [], 2: [], 3: [] }, seen = new Set();
const t0 = Date.now(); let starts = 0;
while (Date.now() - t0 < minutes * 60000) {
  if ([1, 2, 3].every(d => found[d].length >= cap)) break;
  const b = cluster(ri(5, 8), ri(2, 4), ri(4, 6)); if (!quiet(b)) continue; starts++;
  for (let step = 0; step < 7; step++) {
    const dm = dminOf(b);
    if (dm >= 1) {
      const sols = T.solutionCells(b, n, DEPTH);
      if (sols.length === 1) {
        const cells = []; for (let i = 0; i < n * n; i++) if (b[i]) cells.push([Math.floor(i / n), i % n, b[i]]);
        cells.push([Math.floor(sols[0] / n), sols[0] % n, 2]);
        const key = canon(cells);
        const lvl = Math.min(3, dm);
        if (!seen.has(key) && found[lvl].length < cap && T.isGood(b, n, sols[0], DEPTH)) {
          seen.add(key);
          const mr = Math.min(...cells.map(x => x[0])), mc = Math.min(...cells.map(x => x[1]));
          found[lvl].push({ d: lvl, w: cells.filter(x => x[2] === W).map(x => [x[0] - mr, x[1] - mc]), b: cells.filter(x => x[2] === B).map(x => [x[0] - mr, x[1] - mc]), x: cells.filter(x => x[2] === 2).map(x => [x[0] - mr, x[1] - mc])[0] });
        }
        break;
      }
      if (sols.length === 0 || dm >= 2 && step > 0 && false) break;
    }
    // 加一顆白棋（靠近現有的白棋）
    let placed = false;
    for (let t = 0; t < 30 && !placed; t++) {
      const i = ri(0, n * n - 1); if (b[i]) continue; const r = Math.floor(i / n), c = i % n; let near = false;
      for (let dr = -2; dr <= 2 && !near; dr++) for (let dc = -2; dc <= 2 && !near; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < n && cc >= 0 && cc < n && b[rr * n + cc] === W) near = true; }
      if (near) { b[i] = W; if (!quiet(b)) { b[i] = 0; continue; } placed = true; }
    }
    if (!placed) break;
  }
  if (starts % 20000 === 0) process.stdout.write('  起點 ' + starts + '：D1 ' + found[1].length + '、D2 ' + found[2].length + '、D3 ' + found[3].length + '（' + Math.round((Date.now() - t0) / 1000) + ' 秒）\n');
}
console.log('搜尋結束：起點 ' + starts + '，D1 ' + found[1].length + ' 題、D2 ' + found[2].length + ' 題、D3 ' + found[3].length + ' 題（' + Math.round((Date.now() - t0) / 1000) + ' 秒）');

// 寫檔：每題一行 [級別, 答案r, 答案c, [白棋 r,c…], [黑棋 r,c…]]，座標是平移到左上角之後的相對位置
const rows = [];
[1, 2, 3].forEach(d => found[d].forEach(p => rows.push('[' + d + ',' + p.x[0] + ',' + p.x[1] + ',[' + p.w.map(c => c.join(',')).join(',') + '],[' + p.b.map(c => c.join(',')).join(',') + ']]')));
const head = '/* ═══════════════════════════════════════════════════════════════════\n'
  + '   gomoku_bank.js — 堵住五子的題庫（自動產生，請勿手改；產生器：test/reaction/gen_gomoku_bank.cjs）\n'
  + '   每一題： [級別 d, 答案的列, 答案的欄, [白棋的 列,欄 …], [黑棋的 列,欄 …]]（座標已平移到左上角）。\n'
  + '   級別 d＝白棋最少要幾步預備（衝四）才贏：1＝一手就能雙四／活四、2＝先衝四再雙四、3＝連衝兩次四之後才雙四。\n'
  + '   每一題都驗證過：白棋贏得了、黑棋沒有反擊、黑棋所有有意義的下法裡剛好只有「答案」那一格擋得住（搜尋 4 步預備）。\n'
  + '   遊戲出題時（reaction_gomoku.js 的 bankPuzzle）會把它隨機翻轉旋轉、平移到棋盤上，再重新驗證一次、加上雜訊棋子與假威脅。\n'
  + '   ═══════════════════════════════════════════════════════════════════ */\n';
fs.writeFileSync(path.join(ROOT, 'js/gomoku_bank.js'), head + 'window.GOMOKU_BANK = [\n' + rows.join(',\n') + '\n];\n');
console.log('已寫入 js/gomoku_bank.js：' + rows.length + ' 題');
