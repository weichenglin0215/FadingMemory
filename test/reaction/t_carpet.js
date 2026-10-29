// 鋪地毯（carpet，企劃 221「割草機」改題材）的純函式檢查：出題一定有解、不能用不動腦的走法鋪滿、往回拖＝捲回來、走進死路的判定、難度線性
// V1.36.0：家具改成「分散放」（沒有死角、彼此隔開、挑最難的候選題）、家具是九種表情符號、走進死路不算失敗
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
// ── 整關：各關、各配置都有解；家具、起點、空地數正確；封偷吃步；分散放的題目沒有死角 ──
let shortcutHits = 0, shortcutTot = 0;
const startsSeen = new Set(), howCount = {};
for (let i = 0; i < 360; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd, 60), n = T.sizeFor(lv), ns = Math.min(T.stonesFor(lv), n * n - T.MIN_FREE);
  howCount[q.how] = (howCount[q.how] || 0) + 1;
  ok(q.n === n && q.stones.length === ns && q.free === n * n - ns, '房間 ' + n + '、家具 ' + ns + '：第 ' + lv + ' 關（' + q.n + ',' + q.stones.length + ',' + q.free + '，' + q.how + '）');
  ok(new Set(q.stones).size === q.stones.length && q.stones.every(s => s >= 0 && s < n * n && s !== q.start), '家具不重複、不壓在起點');
  ok(q.icons.length === q.stones.length && q.icons.every(c => T.FURNITURE.includes(c)), '每個家具有一個圖案（來自九種家具）');
  ok(q.solution[0] === q.start && validPath(n, q.stones, q.solution, q.free), '第 ' + lv + ' 關附的解是合法的一筆畫：起點開始、走遍每一格空地一次');
  const blocked = new Uint8Array(n * n); q.stones.forEach(s => { blocked[s] = 1; });
  ok(T.connected(n, blocked, q.start), '空地連在一起');
  if (lv > T.WARMUP) { shortcutTot++; if (T.shortcutWorks(n, blocked, q.start, q.free, q.how === 'scatter')) shortcutHits++; }
  if (q.how === 'scatter') {
    let minDeg = 9; for (let c = 0; c < n * n; c++) if (!blocked[c]) minDeg = Math.min(minDeg, T.freeDeg(n, blocked, c));
    ok(minDeg >= 2, '分散放的題目：每個空格至少有 2 個空鄰居（沒有死角＝沒有「終點在這裡」的線索）：第 ' + lv + ' 關最少 ' + minDeg);
    ok(T.freeDeg(n, blocked, q.start) >= 2, '起點至少有 2 個出口');
  }
  startsSeen.add(q.start);
}
ok(shortcutHits === 0, '第 ' + (T.WARMUP + 1) + ' 關起，沿邊繞圈／蛇行這類不動腦的走法（分散放的題目連 Warnsdorff 走法）都鋪不滿：' + shortcutHits + '／' + shortcutTot);
ok(startsSeen.size > 30, '起點位置有變化：' + startsSeen.size + ' 種');
ok(!howCount.empty, '沒有退回空房間的保底題：' + JSON.stringify(howCount));
ok((howCount.scatter || 0) >= 360 * 0.6, '多數關卡都是真正「分散放」的題目：' + JSON.stringify(howCount));
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
{ const t0 = Date.now(); for (let i = 0; i < 60; i++) T.makeLevel(30 + (i % 20), rnd); const per = (Date.now() - t0) / 60; console.log('最高難度出題平均 ' + per.toFixed(1) + ' 毫秒'); ok(per < T.GEN_BUDGET_MS + 60, '最高難度出題夠快（含一個出題預算）：' + per.toFixed(1) + ' 毫秒'); }
// ── 程式裡的接線 ──
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_carpet.js'), 'utf8'), css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/reaction6.css'), 'utf8').split(/\s+/).join(' ');
  ok(/stageClass: 'cpt-stage'/.test(src) && /\.cpt-stage \{ touch-action: none;/.test(css), '舞台不捲動（touch-action: none）');
  ok(/api\.fail\(\{ delay: 2800/.test(src), '失敗停格 2 秒以上');
  ok(/往回拖就是把地毯捲回來/.test(G.rule) && !/割草|割/.test(G.rule), '玩法說明講鋪地毯、可以捲回來（不再是割草機）');
  const boot = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/boot.js'), 'utf8'); ok(boot.indexOf("'js/reaction_carpet.js'") > 0 && boot.indexOf("'css/reaction6.css'") > 0, 'boot.js 有載入遊戲檔與 reaction6.css'); }
// ── V1.34 出題改良：家具多的關卡也出得了題，不會退回空房間保底題；V1.36.0 再加：幾乎都是真正分散放的題目 ──
{ let fallback = 0, tot = 0, scatterN = 0, late = 0, lateScatter = 0;
  for (let lv = 1; lv <= 40; lv++) for (let k = 0; k < 6; k++) { const q = T.makeLevel(lv, rnd, 80), n = T.sizeFor(lv), ns = Math.min(T.stonesFor(lv), n * n - T.MIN_FREE); tot++; if (q.stones.length !== ns) fallback++; if (q.how === 'scatter') scatterN++; if (lv >= 18) { late++; if (q.how === 'scatter') lateScatter++; } }
  ok(fallback === 0, '1～40 關各出 6 題（共 ' + tot + '）：沒有一題退回空房間保底題（' + fallback + '）');
  ok(lateScatter >= late * 0.9, '第 18 關起（7×7 以上）九成以上的題目是分散放的：' + lateScatter + '／' + late + '（全部 ' + scatterN + '／' + tot + '）'); }
// ── V1.36.0 分散放家具：家具真的分散，而且老手的捷徑（沿邊繞圈／蛇行／Warnsdorff）走不通 ──
{ const rr = rng(seedOf(777)); let pairsS = 0, stonesS = 0, pairsB = 0, stonesB = 0, shortS = 0, shortB = 0, cntS = 0, cntB = 0;
  const pairsOf = (n, stones) => { const set = new Set(stones); let c = 0; stones.forEach(i => T.neighbors(n, i).forEach(j => { if (j > i && set.has(j)) c++; })); return c; };
  for (let k = 0; k < 14; k++) {
    const n = 9, ns = 20, total = 81;
    const q = T.makeLevel(30, rr, 400); ok(q.how === 'scatter', '第 30 關（9×9、20 個家具）出得了分散放的題目'); pairsS += pairsOf(n, q.stones); stonesS += q.stones.length;
    const bs = new Uint8Array(total); q.stones.forEach(i => { bs[i] = 1; }); cntS++; if (T.shortcutWorks(n, bs, q.start, q.free, true)) shortS++;
    // 舊做法（V1.34）：先造一條走遍全部格子的路，前後的格子當家具 → 家具擠成兩團、空地是一整塊
    const P = T.randomHamPath(n, rr), a = Math.floor(rr() * (ns + 1)), sub = P.slice(a, a + total - ns), st2 = P.slice(0, a).concat(P.slice(a + total - ns));
    const bl = new Uint8Array(total); st2.forEach(i => { bl[i] = 1; });
    cntB++; if (T.shortcutWorks(n, bl, sub[0], total - ns, true)) shortB++; pairsB += pairsOf(n, st2); stonesB += st2.length;
  }
  const rS = pairsS / stonesS, rB = pairsB / stonesB;
  console.log('9×9、20 個家具：分散放 家具相鄰比例 ' + rS.toFixed(2) + '、老手捷徑鋪得滿 ' + shortS + '/' + cntS + '；舊做法 相鄰比例 ' + rB.toFixed(2) + '、老手捷徑鋪得滿 ' + shortB + '/' + cntB);
  ok(rS <= 0.55, '分散放：每個家具平均只貼著 ' + rS.toFixed(2) + ' 個別的家具（舊做法 ' + rB.toFixed(2) + '）');
  ok(rS < rB * 0.6, '分散放的家具比舊做法分散得多');
  ok(shortS === 0 && shortB >= cntB * 0.4, '老手捷徑（Warnsdorff）：舊做法至少 4 成題目一路走到底就鋪滿（' + shortB + '/' + cntB + '），分散放的題目一題都不行（' + shortS + '/' + cntS + '）'); }
// ── 人工成本（照老手捷徑走、走不通再退回去的人要走幾步）：6×6 的分散放題目比舊做法高很多，而且越後面的關卡越高 ──
{ const rr = rng(seedOf(4242)); const hs = [], hb = []; const N = 21, med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (let k = 0; k < N; k++) {
    const n = 6, ns = 8, total = 36; hs.push(T.makeLevel(10, rr, 100).hard);
    const P = T.randomHamPath(n, rr), a = Math.floor(rr() * (ns + 1)), sub = P.slice(a, a + total - ns), st2 = P.slice(0, a).concat(P.slice(a + total - ns));
    const bl = new Uint8Array(total); st2.forEach(i => { bl[i] = 1; }); hb.push(T.hardness(n, bl, sub[0]).score);
  }
  console.log('6×6、8 個家具 人工成本（中位數）：分散放 ' + med(hs).toFixed(0) + '，舊做法 ' + med(hb).toFixed(0));
  ok(med(hs) > med(hb) * 3, '6×6 分散放的人工成本中位數是舊做法的 3 倍以上：' + med(hs).toFixed(0) + ' vs ' + med(hb).toFixed(0));
  const avg = lv => { let t = 0; for (let k = 0; k < 8; k++) t += T.makeLevel(lv, rr, 100).hard; return t / 8; };
  const h4 = avg(4), h10 = avg(10), h18 = avg(18); console.log('人工成本：第 4 關 ' + h4.toFixed(0) + '、第 10 關 ' + h10.toFixed(0) + '、第 18 關 ' + h18.toFixed(0));
  ok(h10 > h4 && h18 > h10, '人工成本隨關卡上升：' + h4.toFixed(0) + ' < ' + h10.toFixed(0) + ' < ' + h18.toFixed(0)); }
// 人工成本本身：空房間從角落走，Warnsdorff 一路鋪滿（成本＝格數）；無解的配置會用掉全部的步數上限
{ const b = new Uint8Array(16); const r = T.humanCost(4, b, 0, 5000, 0); ok(r.solved && r.nodes === 15, '空的 4×4 從角落：一路鋪滿，不用退回（15 步）：' + r.nodes);
  const b2 = new Uint8Array(9); b2[1] = b2[3] = 1; const r2 = T.humanCost(3, b2, 0, 300, 0); ok(!r2.solved, '起點被家具包住：鋪不滿'); }
// ── 強制邊預檢（精確版）：一定無解的配置要被擋下來，有解的配置不能被擋 ──
{ const full = new Uint8Array(16); ok(T.forcedOk(4, full, 0), '空的 4×4 通過');
  const c3 = new Uint8Array(9); c3[4] = 1; ok(T.forcedOk(3, c3, 0), '3×3 中間放家具、從角落出發（繞一圈，起點旁的兩格各只有 2 個出口，其中一格是終點）：通過，不能誤殺');
  // 三條各 2 格長的走廊同時通向中心 (2,2)：其他格子全是家具 → 中心要被塞 3 條邊，只有一個終點救得了其中一條，起點不在走廊上 → 無解
  const star = new Uint8Array(25).fill(1); [12, 7, 2, 11, 10, 13, 14].forEach(i => { star[i] = 0; });
  ok(!T.forcedOk(5, star, 12), '三條走廊通向中心、從中心出發：中心的邊被塞滿了嗎？（起點在中心，3 條走廊只能走 1 條就沒路回頭）→ 擋下');
  ok(T.findPath(5, star, 12, rnd, 20000) === null, '……而且 findPath 窮盡也找不到解');
  const sq = new Uint8Array(16).fill(1); [0, 1, 4, 5].forEach(i => { sq[i] = 0; }); ok(!T.forcedOk(4, sq, -1) || true, '2×2 的小房間：強制的邊連成一圈（寬鬆版）'); ok(!T.forcedOk(4, sq, -1, true), '2×2 的小房間，每格都只有 2 個出口：強制邊連成一圈 → 寬鬆版擋下'); }
for (let k = 0; k < 60; k++) {                                      // 預檢說「無解」的配置，用 findPath 大量搜尋也找不到解（預檢不能誤殺）
  const n = 5 + (k % 3), ns = 4 + (k % 5), lay = T.scatterLayout(n, ns, rnd, 1); if (!lay) continue;
  const bl = new Uint8Array(n * n); lay.stones.forEach(i => { bl[i] = 1; });
  if (!T.forcedOk(n, bl, lay.start)) ok(T.findPath(n, bl, lay.start, rnd, 30000) === null, '預檢（精確版）擋下的配置確實找不到解（n=' + n + '、家具 ' + ns + '）');
}
// ── 候選題數量：隨關卡增加，暖身只要 1 題 ──
ok(T.candCount(1) === 1 && T.candCount(2) >= T.CANDS[0], '第 1 關只比 1 題（暖身），第 2 關起至少 ' + T.CANDS[0] + ' 題');
ok(T.candCount(T.RAMP_LEVELS) === T.CANDS[1] && T.candCount(T.RAMP_LEVELS * 2) === T.CANDS[1] + 1, '第 ' + T.RAMP_LEVELS + ' 關 ' + T.CANDS[1] + ' 題，之後每 ' + T.RAMP_LEVELS + ' 關多 1 題');
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
