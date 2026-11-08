// 六角著色（hexcolor）：關卡規格（線性）、各色格數、解題器（跟暴力窮舉對照）、30 關出題（答案合法、預填跟答案一致、
// 唯一解的關卡用「研究工具的另一個解題器」完整數完＝1 種）、陷阱挑法（同色預填避開「隔一格」花樣、各色平均）、
// 相鄰同色／「！」警示／過關判斷、記號彈窗的顏色組合、限時、檔案規矩（沒有 resume:false、提示只在前 4 關、CSS 用變數）
const { game, rng, seedOf } = require('./load.js');
const fs = require('fs'), path = require('path');
const G = game('reaction_hexcolor.js'); const T = G.test;
const L = require('../hexcolor/lab.cjs');              // 研究工具的解題器：拿來當「第三方」數解，不跟遊戲共用程式
let bad = 0, checks = 0; const ok = (c, m) => { checks++; if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261108);

// ── 登記資料 ──
ok(G.id === 'hexcolor' && G.name === '六角著色' && [...G.name].length <= 5, '登記資料：id、名稱（最多 5 個字）');
ok((G.rule.match(/\*\*/g) || []).length % 2 === 0 && /\*\*/.test(G.rule), '玩法說明有成對的 **重點**');
ok(G.score.better === 'max' && G.score.min === 1 && G.score.max === T.MAX_LEVEL && T.MAX_LEVEL === 30, '成績：越多關越好、1～30 關');

// ── 關卡規格（每一項都是線性）──
const sp = lv => T.specFor(lv);
ok([1, 2, 3].every(l => sp(l).k === 3 && sp(l).compact === 3 && sp(l).unique), '第 1～3 關：三色入門、實心、唯一解');
ok(sp(1).n === T.N3[0] && sp(3).n === T.N3[1] && sp(1).extra === T.EXTRA3[0] && sp(3).extra === T.EXTRA3[1], '三色入門：格數 19 → 31、暖身預填 3 → 1');
ok(sp(4).k === 4 && sp(4).n === T.N4[0] && sp(30).n === T.N4[1], '4 色：第 4 關 30 格 → 第 30 關 75 格');
for (let l = 5; l <= 30; l++) ok(sp(l).n >= sp(l - 1).n || l === 4, '格數不會變少（第 ' + l + ' 關）');
ok(Math.abs(sp(4).rare - 0.25) < 1e-9 && Math.abs(sp(20).rare - 0.15) < 1e-9 && Math.abs(sp(30).rare - 0.15) < 1e-9, '最少那色的比例：25% → 第 20 關 15%，之後維持');
ok(Math.abs(sp(12).rare - (0.25 + (0.15 - 0.25) * 8 / 16)) < 1e-9, '比例是線性的（第 12 關剛好走一半）');
ok(sp(4).compact === 2 && sp(30).compact === 3, '緊密度 2 → 3');
ok([4, 5, 8, 11].every(l => !sp(l).unique) && [12, 20, 30].every(l => sp(l).unique), '第 4～11 關自由擺、第 12 關起唯一解');
ok(sp(4).fill === Math.round(30 * 0.30) && sp(11).fill === Math.round(sp(11).n * 0.20), '自由擺的預填 30% → 20%');
ok(sp(12).extra === T.EXTRA4[0] && sp(30).extra === T.EXTRA4[1] && sp(4).extra === 0, '唯一解的暖身預填 3 → 0');
ok(T.specFor(0).n === sp(1).n && T.specFor(99).n === sp(30).n, '關卡超出範圍時夾在 1～30');

// ── 各色格數 ──
for (const [n, k, r] of [[30, 4, 0.25], [75, 4, 0.15], [58, 4, 0.15], [47, 4, 0.2]]) {
  const c = T.countsFor(n, k, r), main = c.slice(0, k - 1);
  ok(c.reduce((a, b) => a + b, 0) === n && c[k - 1] === Math.round(n * r) && Math.max(...main) - Math.min(...main) <= 1, '各色格數 ' + n + ' 格、' + r + '：' + c.join(':'));
}

// ── 解題器 vs 暴力窮舉（小盤面：中間一格＋六個鄰居、一排 5 格、兩排 3＋3）──
function brute(nbrs, k, counts, given) {
  const n = nbrs.length, col = new Array(n).fill(-1); let cnt = 0;
  (function rec(i) {
    if (i === n) { const t = new Array(k).fill(0); col.forEach(c => t[c]++); if (t.every((v, c) => v === counts[c])) cnt++; return; }
    for (let c = 0; c < k; c++) {
      if (given[i] >= 0 && given[i] !== c) continue;
      if (nbrs[i].some(j => j < i && col[j] === c)) continue;
      col[i] = c; rec(i + 1); col[i] = -1;
    }
  })(0);
  return cnt;
}
const Core = global.HexColorCore;
const shapes = [
  [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]],
  [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
  [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  [[0, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [2, 1], [-1, 2], [0, 2]]
];
let engineCases = 0;
for (const cells of shapes) {
  const Gr = Core.buildGraph(cells), n = cells.length;
  for (const k of [3, 4]) {
    // 列出所有「總和＝格數」的各色格數，各給空盤與一格預填
    const all = [];
    (function rec(i, left, cur) { if (i === k - 1) { all.push(cur.concat(left)); return; } for (let v = 0; v <= left; v++) rec(i + 1, left - v, cur.concat(v)); })(0, n, []);
    for (const counts of all) {
      for (const g of [new Int8Array(n).fill(-1), Int8Array.from({ length: n }, (_, i) => i === 0 ? 0 : -1)]) {
        const want = brute(Gr.nbrs, k, counts, g);
        const E = T.makeEngine(Gr.nbrs, k), got = E.count(g, counts, 1e9, 1e9);
        ok(got.found === want && !got.aborted, '解題器＝暴力窮舉：' + n + ' 格 ' + k + ' 色 ' + counts.join(':') + '（' + got.found + ' vs ' + want + '）');
        got.sols.forEach(s => ok(T.isSolved(s, Gr.nbrs, counts), '解題器找到的每一個解都合法'));
        engineCases++;
      }
    }
  }
}
ok(engineCases > 200, '解題器對照了 ' + engineCases + ' 種情況');

// ── 30 關出題 ──
function connected(cells) {
  const Gr = Core.buildGraph(cells), seen = new Set([0]), st = [0];
  while (st.length) { const x = st.pop(); Gr.nbrs[x].forEach(y => { if (!seen.has(y)) { seen.add(y); st.push(y); } }); }
  return seen.size === cells.length;
}
let uniqueChecked = 0, totalMs = 0, maxMs = 0, sameNear = 0, brkNear = 0, shares = [];
for (let lv = 1; lv <= 30; lv++) {
  for (let s = 0; s < 3; s++) {
    const r = rng(SEED + lv * 101 + s), t0 = Date.now();
    const z = T.makeLevel(lv, r);
    const ms = Date.now() - t0; totalMs += ms; maxMs = Math.max(maxMs, ms);
    const S = sp(lv), tag = '第 ' + lv + ' 關（種子 ' + (SEED + lv * 101 + s) + '）';
    ok(z && z.n === S.n && z.cells.length === S.n && z.k === S.k, tag + '：格數、色數照規格');
    ok(new Set(z.cells.map(c => c.join())).size === z.n && connected(z.cells), tag + '：格子不重複、形狀連在一起');
    ok(T.isSolved(z.sol, z.nbrs, z.counts), tag + '：答案合法（相鄰不同色、各色格數剛好）');
    let clues = 0, mism = 0;
    for (let i = 0; i < z.n; i++) if (z.given[i] >= 0) { clues++; if (z.given[i] !== z.sol[i]) mism++; }
    ok(mism === 0 && clues === z.clues, tag + '：預填跟答案一致、預填數正確');
    ok(clues < z.n - 1, tag + '：至少留 2 格給玩家');
    if (S.k === 4) {
      const c = z.counts;
      ok(c[3] === Math.round(S.n * S.rare), tag + '：最少那色 ' + c[3] + ' 格');
    }
    if (S.unique) {
      const E = L.makeEngine({ n: z.n, nbrs: z.nbrs }, z.k), cnt = E.count(z.given, z.counts, 2, 5e6);
      ok(!cnt.aborted && cnt.found === 1, tag + '：研究工具完整數完＝唯一解（' + cnt.found + (cnt.aborted ? '，沒數完' : '') + '）');
      ok(z.clues >= z.minimal && z.clues - z.minimal <= S.extra, tag + '：預填＝剛好唯一的 ' + z.minimal + ' 格＋暖身最多 ' + S.extra + ' 格');
      uniqueChecked++;
    } else {
      ok(clues === S.fill, tag + '：自由擺預填 ' + S.fill + ' 格');
    }
    if (S.k === 4 && !S.unique) {
      const gi = [], by = [0, 0, 0, 0];
      for (let i = 0; i < z.n; i++) if (z.given[i] >= 0) { gi.push(i); by[z.given[i]]++; }
      shares.push(Math.max(...by) / gi.length);
      for (let a = 0; a < gi.length; a++) for (let b = a + 1; b < gi.length; b++) {
        const i = gi[a], j = gi[b];
        if (z.given[i] === z.given[j] && T.hexDist(z.cells[i], z.cells[j]) <= 6) { if (T.parityOf(z.cells[i]) === T.parityOf(z.cells[j])) sameNear++; else brkNear++; }
      }
    }
  }
}
ok(uniqueChecked === (30 - 8) * 3, '唯一解的關卡都用第三方解題器數過（' + uniqueChecked + ' 題）');
// 陷阱挑法（自由擺的 24 題）：實測同色預填 99～100% 都避開「隔一格」花樣（隨機挑約 71～77%），門檻訂 90%；最多那色佔預填中位 33～38%（隨機 44%），門檻 45%
ok(brkNear / Math.max(1, sameNear + brkNear) >= 0.9, '自由擺：附近的同色預填 ≥ 90% 避開「隔一格」花樣（' + brkNear + '／' + (sameNear + brkNear) + '）');
shares.sort((a, b) => a - b);
ok(shares[shares.length >> 1] <= 0.45, '自由擺：最多那色佔預填的中位數 ≤ 45%（' + (100 * shares[shares.length >> 1]).toFixed(0) + '%）');
console.log('出題 90 題：平均 ' + (totalMs / 90).toFixed(0) + 'ms、最久 ' + maxMs + 'ms');

// ── 陷阱分數 ──
{
  const cells = [[0, 0], [2, 0], [3, 0], [5, 0], [1, 0]];   // 一排：第 1 格、第 3 格（隔一格）、第 4 格、第 6 格、中間一格
  const g = new Int8Array(5).fill(-1); g[0] = 0;
  ok(T.trapScore(1, 0, cells, g) < T.trapScore(2, 0, cells, g) && T.trapScore(2, 0, cells, g) < T.trapScore(3, 0, cells, g), '同色：第 1、3 格（隔一格）＜ 第 1、4 格 ＜ 第 1、6 格');
  ok(T.trapScore(1, 1, cells, g) > T.trapScore(2, 1, cells, g), '不同色、隔一格（夾住中間）會加分');
  ok(T.parityOf([0, 0]) === T.parityOf([2, 0]) && T.parityOf([0, 0]) === T.parityOf([0, 2]) && T.parityOf([0, 0]) === T.parityOf([-2, 2]) && T.parityOf([0, 0]) !== T.parityOf([1, 0]), '「隔一格」花樣：三個方向隔一格都同一類');
  ok(T.subOf([0, 0]) === T.subOf([3, 0]) && T.subOf([0, 0]) !== T.subOf([1, 0]) && T.subOf([0, 0]) !== T.subOf([2, 0]), '三色花樣：一排每隔兩格同一類');
  ok(T.hexDist([0, 0], [2, 0]) === 2 && T.hexDist([0, 0], [1, 1]) === 2 && T.hexDist([0, 0], [1, -1]) === 1, '六角距離');
}

// ── 相鄰同色、「！」警示、過關 ──
{
  const Gr = Core.buildGraph(shapes[0]), nb = Gr.nbrs;     // shapes[0]：中間一格 [0,0] 加六個鄰居
  const center = shapes[0].findIndex(c => c[0] === 0 && c[1] === 0);
  const p = new Int8Array(7).fill(-1);
  const ring = nb[center];
  p[ring[0]] = 0; p[ring[2]] = 1;
  ok(!T.deadCellsOf(p, nb, 3)[center], '鄰居只有兩色：不警示');
  p[ring[4]] = 2;
  ok(T.deadCellsOf(p, nb, 3)[center] === 1, '鄰居用到全部 3 色：中間的空格要警示');
  ok(T.deadCellsOf(p, nb, 4)[center] === 0, '4 色時鄰居只有 3 色：不警示');
  p[center] = 0;
  ok(T.deadCellsOf(p, nb, 3)[center] === 0, '塗了顏色的格子不警示');
  const cf = T.conflictsOf(p, nb);
  ok(cf[center] === 1 && cf[ring[0]] === 1 && cf[ring[2]] === 0, '相鄰同色：兩格都標出來');
  const Gl = Core.buildGraph(shapes[1]);                   // 一排 5 格
  ok(T.isSolved([0, 1, 0, 1, 0], Gl.nbrs, [3, 2]) && !T.isSolved([0, 1, 0, 1, 0], Gl.nbrs, [2, 3]) && !T.isSolved([0, 0, 1, 0, 1], Gl.nbrs, [3, 2]) && !T.isSolved([0, 1, -1, 1, 0], Gl.nbrs, [3, 2]), '過關：塗滿、不相鄰同色、各色格數剛好');
}

// ── 記號彈窗的顏色組合 ──
{
  const c3 = T.combosFor(3), c4 = T.combosFor(4);
  ok(JSON.stringify(c3) === '[[0,1],[1,2],[2,0]]', '3 色：紅綠、綠藍、藍紅（使用者的例子）：' + JSON.stringify(c3));
  ok(c4.length === 10 && c4.filter(x => x.length === 2).length === 6 && c4.filter(x => x.length === 3).length === 4, '4 色：6 種兩色＋4 種三色');
  ok(JSON.stringify(c4.slice(0, 4)) === '[[0,1],[1,2],[2,3],[3,0]]' && JSON.stringify(c4[6]) === '[0,1,2]', '4 色：先列繞一圈相鄰的兩色，三色第一組是紅綠藍');
  ok(new Set(c4.map(x => x.slice().sort().join())).size === 10, '組合不重複');
}

// ── 記號彈窗的位置：不蓋住被按的格子 ──
// 實際的格子大小：3 色入門半徑最大 58 px → 格子外框半寬約 47、彈窗約 280 高；4 色半徑最大約 38 → 半寬約 31、彈窗約 443 高（12 個選項）
{
  const W = 484, H = 543, pw = Math.round(W * 0.4), gap = 8;
  const hit = (c, p, ph) => Math.min(c.r, p.left + p.width) > Math.max(c.l, p.left) && Math.min(c.b, p.top + ph) > Math.max(c.t, p.top);
  let tried = 0, clean = 0, narrowed = 0;
  for (const [half, ph] of [[20, 443], [31, 443], [20, 280], [31, 280], [40, 280], [47, 280]]) for (let x = half; x <= W - half; x += 7) for (let y = half * 1.15; y <= H - half * 1.15; y += 11) {
    const c = { l: x - half, r: x + half, t: y - half * 1.15, b: y + half * 1.15 }, p = T.popPlace(c, pw, ph, W, H, gap);
    tried++; if (!hit(c, p, ph)) clean++; if (p.width < pw) narrowed++;
    ok(p.left >= gap - 0.01 && p.left + p.width <= W - gap + 0.01 && p.top >= gap - 0.01 && p.top + ph <= H - gap + 0.01 && p.width >= Math.round(W * 0.34), '彈窗在畫面裡面、最窄 34%');
  }
  ok(clean === tried, '彈窗不蓋住被按的格子（' + clean + '／' + tried + ' 種位置；其中 ' + narrowed + ' 種要稍微變窄）');
  const p1 = T.popPlace({ l: 40, r: 90, t: 200, b: 258 }, pw, 280, W, H, gap), p2 = T.popPlace({ l: 400, r: 450, t: 200, b: 258 }, pw, 280, W, H, gap);
  ok(p1.left > W / 2 && p2.left < W / 2 && p1.width === pw && p2.width === pw, '格子在左邊 → 彈窗放右邊；在右邊 → 放左邊（寬度 2/5）');
}

// ── 限時、圖形 ──
ok(T.timeFor(1, 15) === (30 + 15 * 5) * 1000 && T.timeFor(30, 60) === (30 + 60 * 9) * 1000, '限時＝30 秒＋空格 × 5 → 9 秒');
ok(T.timeFor(15, 40) > T.timeFor(14, 40), '每格秒數隨關卡變多');
const hp = T.roundHexPath(1, 0.2);
ok((hp.match(/Q/g) || []).length === 6 && /Z$/.test(hp), '圓角六角形：6 個圓角、封閉');

// ── 檔案規矩 ──
const src = fs.readFileSync(path.join(__dirname, '../../js/reaction_hexcolor.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../../css/games/reaction_hexcolor.css'), 'utf8');
ok(!/resume:\s*false/.test(src), '沒有 resume:false（高關卡優待：從最佳關卡 − 4 進場）');
ok(/kit\.hintsAllowed\(level\)/.test(src), '提示按鈕只在前 4 關（kit.hintsAllowed）');
ok(/LONG_MS = 450/.test(src) && /POP_FRAC = 0\.4/.test(src), '長按 0.45 秒、彈窗寬度＝畫面 2/5');
ok(/--hexcolor-e0:/.test(css) && /stroke: var\(--hexcolor-edge/.test(css), 'CSS：邊線用同色系的深色變數');
ok(!/#[0-9a-fA-F]{3,6}\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'CSS：沒有寫死的色碼（都用變數）');
const boot = fs.readFileSync(path.join(__dirname, '../../js/boot.js'), 'utf8');
ok(boot.indexOf("'js/hexcolor_core.js'") > 0 && boot.indexOf("'js/hexcolor_core.js'") < boot.indexOf("'js/reaction_hexcolor.js'"), 'boot.js 先載入 hexcolor_core.js 再載入遊戲');

console.log(checks + ' checks');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exit(bad ? 1 : 0);
