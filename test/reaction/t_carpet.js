// 鋪地毯（carpet，企劃 221「割草機」改題材）的純函式檢查：出題一定有解、不能用不動腦的走法鋪滿、往回拖＝捲回來、走進死路的判定、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_carpet.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261101), rnd = rng(SEED);

// ── 難度：房間大小、家具數線性、限時跟著格數放寬 ──
ok(T.sizeFor(1) === T.N_RANGE[0] && T.sizeFor(T.RAMP_LEVELS) === T.N_RANGE[1] && T.sizeFor(99) === T.N_RANGE[1], '房間大小 ' + T.N_RANGE + '，到頂維持');
ok(T.stonesFor(1) === T.STONES[0] && T.stonesFor(T.RAMP_LEVELS) === T.STONES[1], '家具數 ' + T.STONES);
for (let l = 2; l <= 60; l++) ok(T.sizeFor(l) >= T.sizeFor(l - 1) && T.stonesFor(l) >= T.stonesFor(l - 1), '單調 ' + l);
ok(T.timeMs(16) === Math.round((T.TIME_BASE + T.TIME_PER_CELL * 16) * 1000) && T.timeMs(56) > T.timeMs(16), '限時跟著要鋪的格數放寬：16 格 ' + T.timeMs(16) + ' ms、56 格 ' + T.timeMs(56) + ' ms');
// ── 基本幾何 ──
ok(T.neighbors(4, 0).join() === '1,4' && T.neighbors(4, 5).join() === '1,6,9,4' && T.neighbors(4, 15).join() === '11,14', 'neighbors：角落 2 個、中間 4 個（上右下左的順序）');
ok(T.adjacent(4, 0, 1) && T.adjacent(4, 0, 4) && !T.adjacent(4, 3, 4) && !T.adjacent(4, 0, 5) && !T.adjacent(4, 2, 2), 'adjacent（換列的 3 與 4 不相鄰、斜的不算）');
// ── 奇偶檢查（棋盤格塗色）：一定無解的配置要被擋下來 ──
{ const b = new Uint8Array(16); ok(T.parityOk(4, b, 0) && T.parityOk(4, b, 5), '4×4 空房間（16 格，兩色各 8）：任何起點都過'); b[0] = 1; ok(!T.parityOk(4, b, 2), '4×4 拿掉一個角（15 格，這個角那色 7 格、另一色 8 格）：起點在少的那色（格 2）→ 不行'); ok(T.parityOk(4, b, 1), '起點在多的那色（格 1）→ 可以（奇偶上可能有解）'); const b2 = new Uint8Array(16); b2[0] = b2[1] = 1; ok(T.parityOk(4, b2, 2), '拿掉相鄰兩格（14 格，兩色各 7）→ 過'); const b3 = new Uint8Array(16); b3[0] = b3[5] = 1; ok(!T.parityOk(4, b3, 2), '拿掉同色兩格（14 格，兩色 8 對 6）→ 不行'); }
// ── findPath：走遍每一格空地剛好一次，而且每一步都在相鄰格 ──
function validPath(n, stones, path, free) {
  const seen = new Set(stones);
  if (path.length !== free) return false;
  for (let i = 0; i < path.length; i++) {
    if (seen.has(path[i])) return false; seen.add(path[i]);
    if (i && !T.adjacent(n, path[i - 1], path[i])) return false;
  }
  return true;
}
{ const blocked = new Uint8Array(16), p = T.findPath(4, blocked, 0, rnd); ok(p && validPath(4, [], p, 16), '4×4 空房間從角落找得到'); }
{ const blocked = new Uint8Array(9); blocked[4] = 1; const p = T.findPath(3, blocked, 0, rnd); ok(p && validPath(3, [4], p, 8), '3×3 中間放家具，繞一圈'); }
{ const blocked = new Uint8Array(9); blocked[1] = blocked[3] = 1; ok(T.findPath(3, blocked, 0, rnd) === null, '起點被家具包住（鋪不出去）→ 回傳 null'); }
{ const blocked = new Uint8Array(9); ok(T.findPath(3, blocked, 1, rnd) === null, '3×3 從邊中間（奇偶不對）出發，走不完 9 格 → 回傳 null'); }
// ── 整關：各關、各配置都有解；家具、起點、空地數正確；封偷吃步 ──
let shortcutHits = 0, shortcutTot = 0, startOnStone = 0;
const startsSeen = new Set();
for (let i = 0; i < 900; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd), n = T.sizeFor(lv), ns = Math.min(T.stonesFor(lv), n * n - T.MIN_FREE);
  ok(q.n === n && q.stones.length === ns && q.free === n * n - ns, '房間 ' + n + '、家具 ' + ns + '：第 ' + lv + ' 關（' + q.n + ',' + q.stones.length + ',' + q.free + '）');
  ok(new Set(q.stones).size === q.stones.length && q.stones.every(s => s >= 0 && s < n * n && s !== q.start), '家具不重複、不壓在起點');
  ok(q.solution[0] === q.start && validPath(n, q.stones, q.solution, q.free), '第 ' + lv + ' 關附的解是合法的一筆畫：起點開始、走遍每一格空地一次');
  const blocked = new Uint8Array(n * n); q.stones.forEach(s => { blocked[s] = 1; });
  ok(T.connected(n, blocked, q.start), '空地連在一起');
  if (lv > T.WARMUP) { shortcutTot++; if (T.shortcutWorks(n, blocked, q.start, q.free)) shortcutHits++; }
  startsSeen.add(q.start);
}
ok(shortcutHits === 0, '第 ' + (T.WARMUP + 1) + ' 關起，沿邊繞圈／蛇行這類不動腦的走法都鋪不滿：' + shortcutHits + '／' + shortcutTot);
ok(startsSeen.size > 30, '起點位置有變化：' + startsSeen.size + ' 種');
// ── 不動腦的走法確實存在、greedyWalk 有效：空的 4×4 從角落蛇行／繞圈鋪得滿 ──
{ const b = new Uint8Array(16); ok(T.GREEDY_ORDERS.some(o => [0, 1, 2, 3].some(d => T.greedyWalk(4, b, 0, o, d) === 16)), '空的 4×4 從角落，不動腦的走法鋪得滿（所以前幾關是暖身）'); }
{ const b = new Uint8Array(25); b[6] = b[8] = b[16] = 1; const free = 22; let works = false; for (const o of T.GREEDY_ORDERS) for (let d = 0; d < 4; d++) if (T.greedyWalk(5, b, 12, o, d) === free) works = true; ok(!works, '5×5 放幾個家具、從中間出發，不動腦的走法鋪不滿'); }
// ── 狀態：往相鄰格鋪、往回拖＝捲回、不能走家具／走過的／不相鄰的格子 ──
{ const q = { n: 3, stones: [4], start: 0, free: 8, solution: [0, 1, 2, 5, 8, 7, 6, 3], level: 1 }, s = T.newState(q);
  ok(s.path.join() === '0' && s.vis[4] === 2 && s.vis[0] === 1, '初始：只有起點，家具標 2');
  ok(T.applyMove(s, 1) === 'add' && T.applyMove(s, 2) === 'add' && s.path.join() === '0,1,2', '往相鄰格鋪');
  ok(T.applyMove(s, 4) === null && T.applyMove(s, 6) === null && T.applyMove(s, 0) === null && T.applyMove(s, 2) === null, '家具、不相鄰的格子、走過的格子（不是上一格）都不能鋪');
  ok(T.applyMove(s, 1) === 'back' && s.path.join() === '0,1' && s.vis[2] === 0, '拖回上一格＝把地毯捲回一格（那格又變成沒鋪）');
  ok(T.applyMove(s, 0) === 'back' && s.path.join() === '0' && T.applyMove(s, 0) === null, '可以一路捲回到起點；起點不能再往回捲');
  q.solution.slice(1).forEach(k => T.applyMove(s, k)); ok(T.isDone(s) && !T.isStuck(s) && s.path.length === 8, '照解鋪完：isDone'); }
// ── 走進死路：3×3、1 號格放家具、從 0 出發，鋪 3、4、5、2 之後，捲頭在 2：旁邊 1（家具）、5（鋪過）都不能走，而 6、7、8 還沒鋪 ──
{ const q = { n: 3, stones: [1], start: 0, free: 8, solution: [], level: 1 }, s = T.newState(q);
  [3, 4, 5].forEach(k => T.applyMove(s, k)); ok(!T.isStuck(s), '捲頭在 5：2 和 8 都還空著，沒卡住');
  T.applyMove(s, 2); ok(T.isStuck(s) && !T.isDone(s) && s.path.join() === '0,3,4,5,2', '捲頭在 2：走進死路（還有 6、7、8 沒鋪）');
  T.applyMove(s, 5); ok(!T.isStuck(s) && s.path.join() === '0,3,4,5', '捲回一格就不卡了（isStuck 只看「現在」）');
  T.applyMove(s, 8); T.applyMove(s, 7); T.applyMove(s, 6); ok(T.isStuck(s) && !T.isDone(s) && s.path.length === 7, '改走 8、7、6：捲頭在 6，旁邊都鋪過了，但 2 還沒鋪（這一題 0 出發本來就沒有解）→ 走進死路'); }
// ── 效能：最高難度的出題夠快 ──
{ const t0 = Date.now(); for (let i = 0; i < 60; i++) T.makeLevel(30 + (i % 20), rnd); const per = (Date.now() - t0) / 60; console.log('最高難度出題平均 ' + per.toFixed(1) + ' 毫秒'); ok(per < 250, '最高難度出題夠快：' + per.toFixed(1) + ' 毫秒'); }
// ── 程式裡的接線 ──
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_carpet.js'), 'utf8'), css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/reaction6.css'), 'utf8').split(/\s+/).join(' ');
  ok(/stageClass: 'cpt-stage'/.test(src) && /\.cpt-stage \{ touch-action: none;/.test(css), '舞台不捲動（touch-action: none）');
  ok(/api\.fail\(\{ delay: 2800/.test(src), '失敗停格 2 秒以上');
  ok(/往回拖就是把地毯捲回來/.test(G.rule) && !/割草|割/.test(G.rule), '玩法說明講鋪地毯、可以捲回來（不再是割草機）');
  const boot = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/boot.js'), 'utf8'); ok(boot.indexOf("'js/reaction_carpet.js'") > 0 && boot.indexOf("'css/reaction6.css'") > 0, 'boot.js 有載入遊戲檔與 reaction6.css'); }
// ── V1.34 出題改良：家具多的關卡也出得了題（兩色空地一樣多＋先造一條路再放家具），不會退回空房間保底題 ──
{ let fallback = 0, tot = 0;
  for (let lv = 1; lv <= 40; lv++) for (let k = 0; k < 15; k++) { const q = T.makeLevel(lv, rnd), n = T.sizeFor(lv), ns = Math.min(T.stonesFor(lv), n * n - T.MIN_FREE); tot++; if (q.stones.length !== ns) fallback++; }
  ok(fallback === 0, '1～40 關各出 15 題（共 ' + tot + '）：沒有一題退回空房間保底題（' + fallback + '）'); }
for (const n of [4, 5, 6, 7, 9]) for (let k = 0; k < 20; k++) {
  const total = n * n, P = T.randomHamPath(n, rnd), seen = new Set(P);
  ok(P.length === total && seen.size === total && P.every((c, i) => c >= 0 && c < total && (i === 0 || T.adjacent(n, P[i - 1], c))), 'randomHamPath(' + n + ')：走遍每一格剛好一次、每一步都在相鄰格');
}
{ let distinct = new Set(); for (let k = 0; k < 30; k++) distinct.add(T.randomHamPath(6, rnd).join()); ok(distinct.size >= 25, 'randomHamPath(6) 很隨機（30 條裡不同的 ' + distinct.size + ' 條）'); }
for (const [n, ns] of [[4, 3], [5, 6], [6, 10], [7, 14], [8, 17], [9, 20], [5, 0]]) for (let k = 0; k < 30; k++) {
  const lay = T.pickLayout(n, ns, rnd), total = n * n, colorOf = (i) => (Math.floor(i / n) + i % n) % 2, st = new Set(lay.stones);
  const freeA = [...Array(total).keys()].filter(i => !st.has(i) && colorOf(i) === 0).length, freeB = total - ns - freeA;
  ok(lay.stones.length === ns && st.size === ns && !st.has(lay.start) && Math.abs(freeA - freeB) <= 1, 'pickLayout(' + n + ',' + ns + ')：家具 ' + ns + ' 個不重複、兩色空地相差不超過 1（' + freeA + '／' + freeB + '）');
  const blocked = new Uint8Array(total); lay.stones.forEach(i => { blocked[i] = 1; }); ok(T.parityOk(n, blocked, lay.start), 'pickLayout(' + n + ',' + ns + ')：起點過奇偶檢查');
}
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
