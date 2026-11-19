// 「填滿」系列（一筆填滿 blockfill、多色填滿 multifill；V1.57.3.0，V1.57.3.1 加上結構數字與難度參數）的檢查：
//   · 題目字串的讀寫、8 種翻轉旋轉（解數不變）；
//   · 解題器：跟「暴力列舉」的結果完全一致（小棋盤）、模擬人類的搜尋（level 0／1／2）一定找得到解；
//   · 結構數字 FP.analyze（最短／最長路、轉彎比例、岔路口…）：手算的小例子；
//   · 從「畫了一部分」接著搜尋；站在人類立場走一遍 FP.human（V1.57.3.2）：玩家提供的參考題 Level 104（路口 15、要猜 5）、
//     Level 2（起點往左之後的 T 字：3 個方向一眼都看不出錯）、多色 Level 3（藏 1 個終點）都要跟玩家的描述一致；
//   · 玩家畫線的規則（跟接電線很像）：按在起點整條重來、拖回上一格收回、不能穿過別條路／空洞、亂拖 3 萬步狀態永遠一致；
//   · 題庫（js/fillpath_bank.js，用 test/reaction/gen_fillpath_bank.cjs 離線搜尋）：每一題都重新驗證（有解、解數、格子數、起點數、連成一塊、結構數字對得上），
//     而且沒有「有一條路只有 1～2 格」這種亂湊的題目（V1.57.3.1 之前的毛病）；難度一級比一級難，比玩家提供的參考遊戲最難的題目難很多；
//   · 依難度參數挑題 FP.select：跟暴力挑選一致、參數一改挑的題目就跟著變；
//   · 兩款遊戲的出題（[第一關, 封頂] 參數、顏色不重複）、限時、評語、接線。
const fs = require('fs');
const path = require('path');
const { game, rng, seedOf } = require('./load.js');
const FP = Reaction.fillPath;
const GB = game('reaction_blockfill.js'), GM = game('reaction_multifill.js'), TB = GB.test, TM = GM.test;
let bad = 0, total = 0; const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261118), rnd = rng(SEED);
const ROOT = path.resolve(__dirname, '../../') + '/';

// ═══ 1. 題目字串、翻轉旋轉 ═══
{ const p = FP.parse('#A#/#.#/#B#');
  ok(p.w === 3 && p.h === 3 && p.tiles === 8 && p.k === 2 && p.starts.join() === '1,7' && p.mask[4] === 0, 'parse：3×3、中間一個洞、兩個起點（A 在 1、B 在 7）');
  ok(FP.serialize(p) === '#A#/#.#/#B#', 'serialize 跟 parse 是反過來的');
  ok(FP.parse('A').k === 1 && FP.parse('A').tiles === 1 && FP.parse('A/#').h === 2, '最小的題目');
  ok(FP.parse('#..#/.D..').starts[3] === 5 && FP.parse('#..#/.D..').k === 4, '起點 D＝第 3 種顏色（陣列長度補到 4）'); }
// 轉四次 90 度回到原樣；翻兩次回到原樣；全部 8 種的格子數、起點數不變
for (let rep = 0; rep < 60; rep++) {
  const w = 3 + (rep % 4), h = 3 + (rep % 5), m = new Uint8Array(w * h).fill(1); for (let i = 0; i < w * h; i++) if (rnd() < 0.2) m[i] = 0;
  const cs = []; for (let i = 0; i < w * h; i++) if (m[i]) cs.push(i); if (cs.length < 4) continue;
  const starts = [cs[0], cs[cs.length - 1]], p = { w, h, mask: m, starts, k: 2, tiles: cs.length }, str = FP.serialize(p);
  let q = p; for (let t = 0; t < 4; t++) q = FP.transform(q, 1);
  ok(FP.serialize(q) === str, '轉 4 次 90 度回到原樣');
  ok(FP.serialize(FP.transform(FP.transform(p, 4), 4)) === str, '左右翻轉兩次回到原樣');
  ok(FP.serialize(FP.transform(p, 0)) === str, 't＝0 不變');
  const seen = new Set();
  for (let t = 0; t < 8; t++) { const r = FP.transform(p, t); ok(r.tiles === p.tiles && r.k === 2 && r.w * r.h === w * h && r.starts.every(s => r.mask[s]) && (t % 2 ? (r.w === h && r.h === w) : (r.w === w && r.h === h)), '翻轉旋轉 ' + t + '：格子數、起點、寬高'); seen.add(FP.serialize(r)); }
  ok(seen.size <= 8, '最多 8 種不同的樣子');
}

// ═══ 2. 解題器：跟暴力列舉一致 ═══
// 暴力列舉：一種顏色一種顏色地列出「從起點出發的所有不重疊的路」（可以在任何一格結束），最後看有沒有蓋滿；數有幾種分法
function brute(p) {
  const N = p.w * p.h, cover = new Int8Array(N).fill(-1), nb = i => { const r = Math.floor(i / p.w), c = i % p.w, o = []; if (r > 0) o.push(i - p.w); if (c < p.w - 1) o.push(i + 1); if (r < p.h - 1) o.push(i + p.w); if (c > 0) o.push(i - 1); return o.filter(x => p.mask[x]); };
  p.starts.forEach((s, c) => { cover[s] = c; });
  let cnt = 0;
  function color(c, left) {
    if (c === p.starts.length) { if (left === 0) cnt++; return; }
    (function walk(cur, left2) {
      color(c + 1, left2);                                  // 這條路在這裡結束
      for (const x of nb(cur)) { if (cover[x] >= 0) continue; cover[x] = c; walk(x, left2 - 1); cover[x] = -1; }
    })(p.starts[c], left);
  }
  color(0, p.tiles - p.starts.length);
  return cnt;
}
{ let agree = 0, multi = 0, none = 0, uniq = 0;
  for (let rep = 0; rep < 220; rep++) {
    const w = 3 + (rep % 3), h = 3 + (rep % 3), k = 1 + (rep % 3), m = new Uint8Array(w * h).fill(1); for (let i = 0; i < w * h; i++) if (rnd() < 0.2) m[i] = 0;
    const cs = []; for (let i = 0; i < w * h; i++) if (m[i]) cs.push(i); if (cs.length < k + 3 || cs.length > 13) continue;
    const st = []; while (st.length < k) { const x = cs[Math.floor(rnd() * cs.length)]; if (st.indexOf(x) < 0) st.push(x); }
    const p = { w, h, mask: m, starts: st, k, tiles: cs.length }, bc = brute(p), g = FP.graph(p);
    const sv = FP.solve(g, st, { limit: 100000, budget: 1e7 });
    ok(!sv.aborted && sv.count === bc, '解題器 ' + FP.serialize(p) + '：解數 ' + sv.count + ' ＝ 暴力列舉 ' + bc); if (sv.count === bc) agree++;
    if (bc === 0) none++; else if (bc === 1) uniq++; else multi++;
    // 模擬人類的三種剪枝強度：解數相同（只是搜尋量不同），level 越小節點越多
    const n = [0, 1, 2].map(lv => FP.solve(g, st, { limit: 100000, budget: 1e7, level: lv }));
    ok(n.every(r => !r.aborted && r.count === bc), 'level 0／1／2 的解數都一樣（' + n.map(r => r.count).join('／') + '）');
    ok(n[0].nodes >= n[1].nodes && n[1].nodes >= n[2].nodes, '剪枝越強、節點越少：' + n.map(r => r.nodes).join(' ≥ '));
    if (bc > 0) {
      const f = FP.solve(g, st, { limit: 1 }).first; ok(f && f.length === k && f.every((pa, c) => pa[0] === st[c]), '第一個解：每條路從自己的起點開始');
      const seen = new Set(); f.forEach(pa => pa.forEach((x, t) => { ok(!seen.has(x) && p.mask[x] && (t === 0 || g.nb[pa[t - 1]].indexOf(x) >= 0), '解：不重疊、都是格子、每一步相鄰'); seen.add(x); }));
      ok(seen.size === p.tiles, '解蓋滿每一格');
      for (const o of ['rand', 'warn', 'anti', 'fixed']) { const r = FP.solve(g, st, { limit: 1, level: 1, order: o, rand: rnd }); ok(r.count === 1, '走法 ' + o + ' 也找得到解'); }
    }
  }
  ok(agree >= 100 && none > 0 && uniq > 0 && multi > 0, '解題器對照暴力列舉：一致 ' + agree + ' 題（無解 ' + none + '、唯一解 ' + uniq + '、多解 ' + multi + '）'); }
{ // 手工：2×3 起點在角落，一筆畫蛇形 → 唯一一種走法
  const p = FP.parse('A##/###'); ok(FP.solve(FP.graph(p), p.starts, { limit: 9 }).count === brute(p), '2×3：解數與暴力列舉相同');
  // 沒有解：兩個死路格子（兩個終點），只有一個起點
  const q = FP.parse('#A#/.#.'); ok(FP.solve(FP.graph(q), q.starts, { limit: 9 }).count === 0 && brute(q) === 0, '三個出口、只有一條路：無解');
  { const big = FP.parse('A#####/######/######/######'); ok(FP.solve(FP.graph(big), big.starts, { limit: 5, budget: 3 }).aborted === true, '搜尋量超過 budget → aborted'); } }

// ═══ 2b. 結構數字 FP.analyze ═══
{ // 手算：2×3 全滿，蛇形 0,1,2,5,4,3
  const p = FP.parse('A##/###'), m = FP.analyze(p, [[0, 1, 2, 5, 4, 3]]);
  ok(m.lo === 6 && m.hi === 6 && m.bal === 1, 'analyze：一條路 6 格 → 最短＝最長＝6、長短比 1');
  ok(m.tr === 0.5 && m.st === 3, 'analyze：6 格路有 2 次轉彎／中間 4 格＝0.5、最長直線 3 格（' + m.tr + '／' + m.st + '）');
  ok(m.jn === 2 && m.x4 === 0 && m.vd === 0 && m.co === 0.67, 'analyze：2×3 全滿：岔路口 2（上下中間那兩格）、沒有十字路口、沒有空洞、走廊 4／6（' + m.jn + '／' + m.x4 + '／' + m.vd + '／' + m.co + '）');
  ok(m.cr === 0 && m.sd === 0, 'analyze：一條路沒有交叉、沒有起點距離');
  // 一直線：沒有轉彎、直線長度＝路長
  const q = FP.parse('A####'), n = FP.analyze(q, [[0, 1, 2, 3, 4]]);
  ok(n.tr === 0 && n.st === 5 && n.jn === 0 && n.co === 1 && n.ch === 0, 'analyze：一條直線：轉彎 0、直線 5 格、沒有岔路口、全是走廊、沒有選擇（' + JSON.stringify(n) + '）');
  // 兩條路：路線交叉（3×3 全滿，兩條對角線）
  const r = FP.parse('A#B/###/###'), a = FP.analyze(r, [[0, 4, 8], [2, 4, 6]].map((x, i) => x)), nx = FP.analyze(FP.parse('A##/###/B##'), [[0, 1, 2], [6, 7, 8]]);
  ok(a.cr === 1, 'analyze：兩條路的「起點→終點」直線互相穿過 → 交叉 1');
  ok(nx.cr === 0 && nx.sd === 2 && nx.lo === 3 && nx.hi === 3, 'analyze：兩條平行的路不交叉、起點距離 2（' + JSON.stringify(nx) + '）');
  // 空洞數、十字路口
  const s = FP.parse('#A#/###/#.#'), z = FP.analyze(s, [[1, 4, 3, 6]]);
  ok(z.vd === 1 && z.x4 === 0 && z.jn === 4, 'analyze：3×3 挖掉一格：空洞 1、沒有十字路口、岔路口 4（上中、左中、中心、右中；' + JSON.stringify(z) + '）');
  ok(FP.analyze(FP.parse('#A#/###/###'), [[1, 4, 7]]).x4 === 1, 'analyze：3×3 全滿中間是十字路口 1'); }

// ═══ 2c. 從「畫了一部分」的狀態接著搜尋（FP.solve 的 paths／done／check）、人類視角 FP.human ═══
{ const p = FP.parse('A##/###'), g = FP.graph(p), full = FP.solve(g, p.starts, { limit: 9 });
  const part = FP.solve(g, p.starts, { paths: [[0, 1]], limit: 9 });
  ok(part.count === 1 && part.first[0].join() === '0,1,2,5,4,3', '從「已經走了 0→1」接著搜：只剩一種走法（' + (part.first && part.first[0]) + '）；全部 ' + full.count + ' 種');
  ok(FP.solve(g, p.starts, { paths: [[0, 1, 4]], limit: 9 }).count === 0, '走成 0→1→4 之後 2、3 都變成死巷：沒有解');
  ok(FP.solve(g, p.starts, { paths: [[0, 1, 4]], check: true, level: 1 }).ok === false && FP.solve(g, p.starts, { paths: [[0, 1]], check: true }).ok === true, 'check：只看現在的狀態看不看得出錯（兩個死巷、只有一條路 → 看得出錯）');
  const m2 = FP.parse('AB#/###'), r2 = FP.solve(FP.graph(m2), m2.starts, { paths: [[0], [1]], done: [1, 0], limit: 9 });
  ok(r2.count === 1 && r2.first[1].length === 5, 'done：第 0 條路已經結束（只有起點），第 1 條路要把剩下的格子走完（共 5 格）');
  ok(FP.solve(g, p.starts, { limit: 1 }).depth === 5, 'depth：走到解的時候往前走了 5 步'); }
{ // 一條直直的走廊：沒有路口、沒有抉擇；試錯量＝步數
  const p = FP.parse('A####'), h = FP.human(p, [[0, 1, 2, 3, 4]]);
  ok(h.raw === 0 && h.dec === 0 && h.guess === 0 && h.deep === 0 && h.hx === 4 && h.vis === 1 && h.hid === 0, 'human：一條走廊——沒有路口、試錯量 4（每一步算 1）、看得出終點 1 個（' + JSON.stringify(h) + '）'); }
// 玩家提供的參考題（站在人類立場的分析，要跟玩家的描述一致）
const mkRef = (w, h, rowsTiles, starts) => { const m = new Uint8Array(w * h); rowsTiles.forEach((cols, r) => cols.forEach(c => m[r * w + c] = 1)); return { w, h, mask: m, starts: starts.map(([r, c]) => r * w + c), k: starts.length, tiles: m.reduce((a, b) => a + b, 0) }; };
const REF104 = mkRef(7, 9, [[0, 1, 2, 3, 4, 5, 6], [0, 2, 3, 6], [0, 1, 2, 3, 4, 5, 6], [1, 4, 5, 6], [0, 1, 3, 4], [0, 1, 2, 3, 4, 5], [1, 2, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6], [2, 3, 4, 5]], [[8, 4]]);
const REF_L2 = mkRef(7, 8, [[0, 1, 3, 4, 5], [0, 1, 3, 5, 6], [0, 1, 2, 3, 4, 6], [0, 1, 2, 3, 6], [0, 1, 3, 6], [0, 2, 3, 6], [0, 1, 3, 4, 5, 6], [1, 2, 3, 4, 5]], [[2, 4]]);
const REF_L3 = mkRef(5, 7, [[0, 1, 2, 3, 4], [0, 1, 2, 4], [0, 1, 2, 3, 4], [2, 3, 4], [1, 2, 4], [2], [2]], [[0, 1], [2, 4], [6, 2]]);
{ const solOf = p => FP.solve(FP.graph(p), p.starts, { limit: 1 }).first;
  // Level 104：終點在左下角（唯一一個只有一邊相接的格子）；路上 15 個路口，細心的人還是要猜 5 次
  const s104 = solOf(REF104), h104 = FP.human(REF104, s104, { detail: true });
  ok(s104[0][s104[0].length - 1] === 7 * 7 + 0 && h104.vis === 1 && h104.hid === 0, 'Level 104：終點在左下角、一開始就看得出來（只有一邊相接）');
  ok(h104.raw === 15 && h104.guess === 5 && h104.deep >= 3 && h104.trap >= 10, 'Level 104：路口 ' + h104.raw + '、要猜 ' + h104.guess + '、深陷阱 ' + h104.deep + '、最深 ' + h104.trap + ' 步');
  ok(h104.steps[0].r === 8 && h104.steps[0].c === 4 && h104.steps[0].raw === 3 && h104.steps[0].care === 1, 'Level 104：起點本身就是 T 字（上、左、右），細心想只剩往右');
  // Level 2：起點只能往左；左邊那格是 T 字：上、下、左一眼都看不出錯（往下、往左會讓上面那格變成死巷，在「身後」，人常常沒注意到），細心想只剩往上
  const sL2 = solOf(REF_L2), hL2 = FP.human(REF_L2, sL2, { detail: true }), f0 = hL2.steps[0];
  ok(sL2[0][1] === 2 * 7 + 3 && f0.r === 2 && f0.c === 3 && f0.raw === 3 && f0.n === 3 && f0.care === 1, 'Level 2：起點往左之後，3 個方向一眼都看不出錯、細心想只剩 1 個（' + JSON.stringify({ r: f0.r, c: f0.c, raw: f0.raw, n: f0.n, care: f0.care }) + '）');
  ok(f0.opts.some(o => o.ok && sL2[0][2] === o.v) && sL2[0][2] === 1 * 7 + 3, 'Level 2：正確的是往上');
  // 多色 Level 3：3 個起點、只有 2 個只有一邊相接的格子 → 藏了 1 個終點（紫色的終點藏在橘色起點上面）
  const sL3 = solOf(REF_L3), hL3 = FP.human(REF_L3, sL3);
  ok(hL3.vis === 2 && hL3.hid === 1 && sL3[0][sL3[0].length - 1] === 1 * 5 + 4 && REF_L3.starts[1] === 2 * 5 + 4, '多色 Level 3：看得出的終點 2 個、藏 1 個；紫色（第 0 條）的終點在橘色起點的正上方');
  ok(hL3.guess >= 5 && hL3.raw >= 10, '多色 Level 3：路口 ' + hL3.raw + '、要猜 ' + hL3.guess); }

// ═══ 3. 玩家畫線的規則 ═══
{ const p = FP.parse('A##/#.#/###'), st = FP.newState(p);
  ok(FP.filled(st) === 1 && !FP.isSolved(st) && st.paths[0].join() === '0', '一開始：只蓋著起點');
  ok(FP.startDraw(st, 1) === -1 && FP.startDraw(st, 4) === -1, '按在沒蓋到的格子、空洞：不能開始');
  const c = FP.startDraw(st, 0);
  ok(c === 0 && FP.applyDrag(st, 0, 1) === 'add' && FP.applyDrag(st, 0, 2) === 'add' && st.paths[0].join() === '0,1,2', '從起點往相鄰格子拖，鋪出路');
  ok(FP.applyDrag(st, 0, 4) === null && FP.applyDrag(st, 0, 6) === null && FP.applyDrag(st, 0, 0) === null, '空洞、不相鄰、自己的路不能鋪');
  ok(FP.applyDrag(st, 0, 1) === 'back' && st.paths[0].join() === '0,1' && st.cover[2] === -1, '拖回上一格＝收回最後一格');
  FP.applyDrag(st, 0, 2); FP.applyDrag(st, 0, 5); FP.applyDrag(st, 0, 8); FP.applyDrag(st, 0, 7); FP.applyDrag(st, 0, 6); FP.applyDrag(st, 0, 3);
  ok(FP.filled(st) === 8 && FP.isSolved(st), '走遍 8 個格子 → 過關（終點在第 3 格，是自己找的）');
  ok(FP.startDraw(st, 5) === 0 && st.paths[0].join() === '0,1,2,5' && st.cover[8] === -1 && st.cover[3] === -1, '按在路中間（格 5）：那一格之後收回、從這裡接著畫');
  ok(FP.startDraw(st, 0) === 0 && st.paths[0].join() === '0' && FP.filled(st) === 1, '按在起點：整條收回，起點還在');
  FP.applyDrag(st, 0, 1); FP.applyDrag(st, 0, 2); FP.reset(st);
  ok(FP.filled(st) === 1 && st.paths[0].join() === '0', 'reset：全部收回，只剩起點'); }
{ // 兩條路：不能穿過對方
  const p = FP.parse('A#B/###'), st = FP.newState(p);
  FP.startDraw(st, 0); FP.applyDrag(st, 0, 1);
  ok(FP.applyDrag(st, 0, 2) === null && st.cover[2] === 1, '別種顏色的起點擋住，不能穿過');
  FP.startDraw(st, 2); ok(FP.applyDrag(st, 1, 1) === null, '別條路蓋住的格子不能鋪');
  FP.applyDrag(st, 1, 5); FP.applyDrag(st, 1, 4);
  ok(st.paths[1].join() === '2,5,4' && st.paths[0].join() === '0,1' && FP.startDraw(st, 2) === 1 && st.paths[1].join() === '2' && st.paths[0].join() === '0,1' && FP.startDraw(st, 0) === 0 && st.paths[0].join() === '0', '兩條路各自畫、各自收回（互不影響）'); }
// 亂拖 3 萬步：cover 與 paths 永遠對得起來
for (let rep = 0; rep < 12; rep++) {
  const q = FP.pick(rep % 2 ? 'block' : 'multi', rep % 10, rnd); if (!q) continue;
  const st = FP.newState(q.p), n = q.p.w * q.p.h; let cur = -1;
  for (let step = 0; step < 2500; step++) {
    if (cur < 0 || rnd() < 0.06) cur = FP.startDraw(st, Math.floor(rnd() * n));
    else { const path = st.paths[cur], head = path[path.length - 1], nb = st.g.nb[head]; FP.applyDrag(st, cur, nb.length ? nb[Math.floor(rnd() * nb.length)] : head); }
    if (step % 100 === 0) {
      const owner = new Int8Array(n).fill(-1);
      st.paths.forEach((pa, c) => { ok(pa[0] === q.p.starts[c], '路一定從自己的起點開始'); pa.forEach((x, t) => { ok(owner[x] === -1 && q.p.mask[x], '同一格只屬於一條路、而且是格子'); owner[x] = c; ok(st.cover[x] === c, 'cover 與 paths 一致'); if (t) ok(st.g.nb[pa[t - 1]].indexOf(x) >= 0, '路每一步都相鄰'); }); });
      let cnt = 0; for (let i = 0; i < n; i++) if (st.cover[i] >= 0) { cnt++; ok(owner[i] === st.cover[i], '蓋到的格子都在某條路上'); }
      ok(cnt === FP.filled(st), 'filled 對得上');
    }
  }
}

// ═══ 4. 題庫 ═══
// 難度級的設定（要跟 test/reaction/gen_fillpath_bank.cjs 的 TIERS 一致）：格子數範圍、起點數範圍
const TIER_TILES = { block: [[10, 13], [14, 17], [18, 21], [22, 25], [26, 30], [31, 35], [36, 40], [41, 45], [46, 50], [51, 55], [56, 60], [61, 66], [67, 74]], multi: [[11, 14], [15, 18], [19, 22], [22, 26], [27, 31], [32, 36], [37, 41], [38, 42], [43, 47], [48, 54], [55, 60], [61, 66], [67, 74]] };
const TIER_K = { block: [[1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1]], multi: [[2, 3], [2, 3], [2, 3], [3, 4], [3, 4], [3, 4], [3, 4], [3, 4], [3, 4], [3, 4], [3, 4], [3, 4], [3, 4]] };
// 結構的最低要求（跟 gen_fillpath_bank.cjs 的 PROF 強度 0「寬鬆」一致）：路口、要猜的路口、深陷阱佔格子數的比例；多色再加路長
const LOOSE = { multi: { lo: 0.40, hi: 2.0, raw: 0.30, guess: 0.06, deep: 0.04 }, block: { raw: 0.25, guess: 0.06, deep: 0.04 } };
function looseOk(kind, m, tiles, k) {
  const L = LOOSE[kind]; let r = m.raw >= Math.round(tiles * L.raw) && m.guess >= Math.floor(tiles * L.guess) && m.deep >= Math.floor(tiles * L.deep);
  if (kind === 'multi') { const avg = tiles / k; r = r && m.lo >= Math.max(3, Math.round(avg * L.lo)) && m.hi <= Math.round(avg * L.hi); }
  return r;
}
// 題庫記的結構數字＝FP.analyze 的一部分＋FP.human（跟 gen_fillpath_bank.cjs 的 KEEP 一致）
const KEEP = ['lo', 'hi', 't3', 'x4', 'x4d', 'raw', 'dec', 'd3', 'bits', 'guess', 'deep', 'trap', 'hid'];
function measureAll(p, first) { const a = FP.analyze(p, first), hm = FP.human(p, first), m = {}; KEEP.forEach(key => { m[key] = key in hm ? hm[key] : a[key]; }); return { m, hx: hm.hx }; }
const bank = FP.bank();
ok(Array.isArray(bank.block) && bank.block.length === FP.TIERS && Array.isArray(bank.multi) && bank.multi.length === FP.TIERS, '題庫：block、multi 各 ' + FP.TIERS + ' 級');
const connectedOk = (p) => { const g = FP.graph(p), seen = new Set([g.cells[0]]), st = [g.cells[0]]; while (st.length) { const u = st.pop(); g.nb[u].forEach(v => { if (!seen.has(v)) { seen.add(v); st.push(v); } }); } return seen.size === g.cells.length; };
const stat = { block: [], multi: [] }; let shortPaths = 0, allCount = 0;
for (const kind of ['block', 'multi']) for (let t = 0; t < FP.TIERS; t++) {
  const list = bank[kind][t] || [], tiles = [], es = [];
  ok(list.length >= 10, kind + ' 第 ' + t + ' 級至少 10 題（' + list.length + '）');
  list.forEach((e, i) => {
    const p = FP.parse(e.s), g = FP.graph(p), tag = kind + ' 第 ' + t + ' 級第 ' + i + ' 題 ';
    ok(p.k >= TIER_K[kind][t][0] && p.k <= TIER_K[kind][t][1] && new Set(p.starts).size === p.k && p.starts.every(s => p.mask[s]), tag + '起點數 ' + p.k + '、都在格子上');
    ok(p.tiles >= TIER_TILES[kind][t][0] && p.tiles <= TIER_TILES[kind][t][1], tag + '格子數 ' + p.tiles + ' 在 ' + TIER_TILES[kind][t] + ' 之內');
    ok(p.w <= 11 && p.h <= 11 && p.w >= 4 && p.h >= 4 && p.tiles >= 2 * Math.min(p.w, p.h), tag + '棋盤 ' + p.w + '×' + p.h);
    ok(connectedOk(p), tag + '格子連成一塊');
    const sv = FP.solve(g, p.starts, { limit: 3, budget: 5e6 });
    ok(!sv.aborted && sv.count >= 1 && sv.count === e.c && e.c <= 3, tag + '有解、解數 ' + sv.count + ' ＝ 題庫記的 ' + e.c);
    ok(e.e > 0 && e.t === p.tiles && e.k === p.k, tag + '難度、格子數、起點數的記錄對得上');
    // 結構數字：重新量一遍要跟題庫記的一模一樣
    const q = sv.first ? measureAll(p, sv.first) : null, m = q && q.m;
    ok(m && JSON.stringify(m) === JSON.stringify(e.m) && q.hx === e.e, tag + '結構數字、試錯量對得上：' + JSON.stringify(e.m) + (m ? ' ／ ' + JSON.stringify(m) + ' ' + q.hx + '／' + e.e : ''));
    if (m) {
      ok(m.lo >= 3, tag + '最短的一條路 ' + m.lo + ' 格（要 ≥ 3：不能有 1～2 格的路）'); allCount++; if (m.lo <= 2) shortPaths++;
      ok(looseOk(kind, m, p.tiles, p.k), tag + '結構過了「寬鬆」要求：' + JSON.stringify(m));
    }
    tiles.push(p.tiles); es.push(e.e);
    // 8 種翻轉旋轉都一樣有解、結構數字不變
    if (i < 2) for (let tt = 1; tt < 8; tt++) { const q2 = FP.transform(p, tt), r = FP.solve(FP.graph(q2), q2.starts, { limit: 3, budget: 5e6 }); ok(r.count === sv.count, tag + '翻轉旋轉 ' + tt + ' 解數不變'); if (sv.count === 1) { const mm = measureAll(q2, r.first).m; ['lo', 'hi', 't3', 'x4', 'x4d', 'raw', 'guess', 'hid'].forEach(key => ok(mm[key] === e.m[key], tag + '翻轉旋轉 ' + tt + ' ' + key + ' 不變（' + mm[key] + '／' + e.m[key] + '）')); } }
  });
  // 一般的題目只有 1 種解（跟參考遊戲一樣），最多 3 種
  ok(list.filter(e => e.c === 1).length >= list.length * 0.5, kind + ' 第 ' + t + ' 級至少一半的題目剛好只有 1 種解（' + list.filter(e => e.c === 1).length + '／' + list.length + '）');
  const set = new Set(list.map(e => { const p = FP.parse(e.s); let best = null; for (let tt = 0; tt < 8; tt++) { const s = FP.serialize(FP.transform(p, tt)); if (best === null || s < best) best = s; } return best; }));
  ok(set.size === list.length, kind + ' 第 ' + t + ' 級沒有重複的題目（翻轉旋轉之後一樣也算重複）');
  stat[kind].push({ tiles: tiles.reduce((a, b) => a + b, 0) / tiles.length, e: es.reduce((a, b) => a + Math.log(1 + b), 0) / es.length });
}
ok(shortPaths === 0 && allCount > 200, '整個題庫（' + allCount + ' 題）沒有任何一題有「1～2 格」的路（' + shortPaths + '）');
// 一級比一級難：格子數、試走難度（取 ln 平均）整體遞增（允許相鄰兩級有一點雜訊）
for (const kind of ['block', 'multi']) {
  for (let t = 1; t < FP.TIERS; t++) { ok(stat[kind][t].tiles >= stat[kind][t - 1].tiles - 1e-9, kind + ' 格子數隨級數增加：第 ' + (t - 1) + ' 級 ' + stat[kind][t - 1].tiles.toFixed(1) + ' → 第 ' + t + ' 級 ' + stat[kind][t].tiles.toFixed(1)); ok(t > 9 || stat[kind][t].e >= stat[kind][t - 1].e - 0.35,   /* 第 10～12 級（V1.57.3.2 為了格子數封頂 72 加的大棋盤）只是格子變多、目標試錯量沒有再往上翻倍，不比難度 */
       kind + ' 難度隨級數增加（ln 平均）：' + stat[kind][t - 1].e.toFixed(2) + ' → ' + stat[kind][t].e.toFixed(2)); }
  ok(stat[kind][9].e > stat[kind][0].e + 3, kind + '：第 9 級比第 0 級難很多（ln 差 ' + (stat[kind][9].e - stat[kind][0].e).toFixed(2) + '）');
}
// 玩家提供的參考遊戲（EXTRA HARD）的題目：全部剛好 1 種解、模擬人類的試走大約只要「格子數」的幾倍到十幾倍節點——我們最難的幾級要比它們難很多
{
  const mk = (w, h, rowsTiles, starts) => { const m = new Uint8Array(w * h); rowsTiles.forEach((cols, r) => cols.forEach(c => m[r * w + c] = 1)); return { w, h, mask: m, starts: starts.map(([r, c]) => r * w + c), k: starts.length, tiles: m.reduce((a, b) => a + b, 0) }; };
  const refs = [
    mk(7, 9, [[0, 1, 2, 3, 4, 5, 6], [0, 2, 3, 6], [0, 1, 2, 3, 4, 5, 6], [1, 4, 5, 6], [0, 1, 3, 4], [0, 1, 2, 3, 4, 5], [1, 2, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6], [2, 3, 4, 5]], [[8, 4]]),
    mk(5, 7, [[0, 1, 2, 3], [0, 1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4], [0, 2, 3, 4]], [[4, 2]]),
    mk(6, 7, [[0, 1, 2, 3], [0, 1, 2, 4, 5], [0, 2, 3, 4], [0, 1, 3, 4], [0, 1], [0, 2, 3, 4, 5], [0, 1, 2, 5]], [[1, 1], [3, 1], [4, 1]]),
    mk(5, 6, [[1, 2, 3, 4], [0, 1, 2, 3], [0, 3, 4], [0, 2, 3], [2, 3, 4], [2, 3]], [[0, 1], [0, 2], [3, 2], [5, 3]]),
    mk(7, 8, [[0, 1, 3, 4, 5], [0, 1, 3, 5, 6], [0, 1, 2, 3, 4, 6], [0, 1, 2, 3, 6], [0, 1, 3, 6], [0, 2, 3, 6], [0, 1, 3, 4, 5, 6], [1, 2, 3, 4, 5]], [[2, 4]]),
    mk(5, 7, [[0, 1, 2, 3, 4], [0, 1, 2, 4], [0, 1, 2, 3, 4], [2, 3, 4], [1, 2, 4], [2], [2]], [[0, 1], [2, 4], [6, 2]]),
    mk(7, 9, [[0, 2, 3, 4], [0, 1, 2, 3, 4, 5, 6], [1, 5, 6], [0, 1, 3, 4, 5], [0, 2, 3, 5, 6], [0, 1, 2, 4, 5, 6], [0, 1, 2, 4, 6], [0, 3, 4, 6], [0, 1, 2, 3, 5, 6]], [[1, 3], [4, 0]]),
    mk(6, 8, [[0, 1, 2, 3], [0, 5], [0, 1, 2, 3, 5], [0, 1, 2, 3, 4, 5], [0, 1, 3, 4], [1, 2, 3], [0, 2, 3, 4, 5], [0, 1, 2]], [[3, 0], [3, 1], [3, 2], [5, 3]])
  ];
  let refMax = 0;
  refs.forEach((p, i) => {
    const g = FP.graph(p), sv = FP.solve(g, p.starts, { limit: 3, budget: 1e7 });
    ok(!sv.aborted && sv.count === 1, '參考遊戲第 ' + (i + 1) + ' 題（' + p.tiles + ' 格、' + p.k + ' 條路）：剛好 1 種解');
    const m = FP.analyze(p, sv.first), hm = FP.human(p, sv.first);
    ok(m.lo >= 4, '參考遊戲第 ' + (i + 1) + ' 題：最短的路 ' + m.lo + ' 格（≥ 4）');
    refMax = Math.max(refMax, hm.hx);
  });
  const top = bank.block[9].concat(bank.multi[9]).map(e => e.e);
  const topMean = top.reduce((a, b) => a + b, 0) / top.length;
  ok(refMax < 1000, '參考遊戲最難的一題，人類試錯量 ' + refMax);
  ok(topMean > refMax * 4, '第 9 級題庫的人類試錯量平均 ' + topMean.toFixed(0) + '，比參考遊戲最難的題目（' + refMax + '）難 4 倍以上'); }

// ═══ 5. 挑題：FP.pick（依級數）、FP.select（依難度參數）═══
for (const kind of ['block', 'multi']) for (let t = 0; t < FP.TIERS; t++) {
  const seen = new Set(); let prev = -1, repeats = 0;
  for (let i = 0; i < 60; i++) { const q = FP.pick(kind, t, rnd, prev); ok(q && q.tier === t && q.p.tiles >= TIER_TILES[kind][t][0] && q.p.k >= TIER_K[kind][t][0] && q.p.k <= TIER_K[kind][t][1], '挑題：級數、格子數、起點數'); if (q.idx === prev) repeats++; prev = q.idx; seen.add(q.t); }
  ok(seen.size >= 6, kind + ' 第 ' + t + ' 級：隨機翻轉旋轉 60 次，出現 ' + seen.size + ' 種（要 ≥ 6）');
  ok(repeats <= 2, kind + ' 第 ' + t + ' 級：連續兩關出同一題只有 ' + repeats + ' 次');
}
ok(FP.pick('block', 99, rnd) === null && FP.pick('nope', 0, rnd) === null, '沒有這一級／這種題庫：回傳 null');
ok(FP.tierFor(1, 30) === 0 && FP.tierFor(30, 30) === FP.TIERS - 1 && FP.tierFor(99, 30) === FP.TIERS - 1 && FP.tierFor(0, 30) === 0, 'tierFor：第 1 關 0 級、第 30 關最後一級、之後維持');
for (let l = 2; l <= 60; l++) ok(FP.tierFor(l, 30) >= FP.tierFor(l - 1, 30), 'tierFor 單調');
ok(FP.tierFor(15, 30) >= 5 && FP.tierFor(15, 30) <= 7, '第 15 關大約在中間（' + FP.tierFor(15, 30) + ' 級）');
// FP.select：跟「暴力挑選」一致——回傳的題目，評分不會比最佳的差 0.6 以上；條件一改，挑到的題目就跟著變
{ const flat = kind => { const a = []; bank[kind].forEach(l => l.forEach(e => a.push(e))); return a; };
  const scoreOf = (e, want) => FP.violation(e, want) * 8 + Math.abs(e.t - want.tiles) / 4 + Math.abs(Math.log(1 + e.e) - Math.log(1 + want.e)) / 0.5 + (want.k ? Math.abs(e.k - want.k) * 1.2 : 0);
  for (const kind of ['block', 'multi']) {
    const all = flat(kind); let satisfied = 0, tried = 0;
    for (let rep = 0; rep < 150; rep++) {
      const want = { tiles: 10 + Math.floor(rnd() * 44), e: Math.exp(2.4 + rnd() * 6.6), k: kind === 'block' ? 1 : 2 + Math.floor(rnd() * 3), sol: 1 + Math.floor(rnd() * 3), min: { raw: Math.floor(rnd() * 25), guess: Math.floor(rnd() * 8), deep: Math.floor(rnd() * 8), t3: Math.floor(rnd() * 12) }, max: { trap: 5 + Math.floor(rnd() * 40) } };
      if (kind === 'multi') { want.min.lo = 3 + Math.floor(rnd() * 8); want.max.hi = 8 + Math.floor(rnd() * 20); want.min.hid = Math.floor(rnd() * 2); want.max.hid = 1 + Math.floor(rnd() * 2); }
      const best = Math.min.apply(null, all.map(e => scoreOf(e, want))), q = FP.select(kind, want, rnd, -1);
      ok(q && q.score <= best + 0.6 + 1e-9 && Math.abs(q.score - scoreOf(all[0] && { s: q.s, c: q.c, e: q.e, t: q.p.tiles, k: q.p.k, m: q.m }, want)) < 1e-9, kind + ' 挑題：評分 ' + (q && q.score.toFixed(2)) + ' 與最佳 ' + best.toFixed(2) + ' 相差在 0.6 之內，而且評分算得對');
      tried++; if (q && q.viol === 0) satisfied++;
      if (q && q.viol === 0) { Object.keys(want.min).forEach(key => ok(q.m[key] >= want.min[key] - 1e-9, kind + ' 挑到的題目 ' + key + ' ＝ ' + q.m[key] + ' 要 ≥ ' + want.min[key])); Object.keys(want.max).forEach(key => ok(q.m[key] <= want.max[key] + 1e-9, kind + ' 挑到的題目 ' + key + ' ＝ ' + q.m[key] + ' 要 ≤ ' + want.max[key])); ok(q.c <= want.sol, kind + ' 解數 ' + q.c + ' ≤ ' + want.sol); }
    }
    ok(satisfied >= tried * 0.3, kind + ' 亂數的 150 組條件裡，有 ' + satisfied + ' 組找得到完全符合的題目（題庫夠多樣）');
    // 條件一改，結果跟著變：同樣大小、同樣難度，要求「最短路至少 X」越來越高，挑到的題目最短路單調不減（有題目符合時）
    if (kind === 'multi') {
      const base = { tiles: 30, e: 300, k: 3, sol: 1, min: {}, max: {} }; let prevLo = 0;
      for (const need of [3, 5, 7, 9]) {
        const w2 = JSON.parse(JSON.stringify(base)); w2.min.lo = need;
        let worst = 99; for (let rep = 0; rep < 12; rep++) { const q = FP.select('multi', w2, rnd, -1); worst = Math.min(worst, q.m.lo); }
        const exists = all.some(e => e.m.lo >= need && Math.abs(e.t - 30) <= 8);
        if (exists) ok(worst >= need || worst >= prevLo, '要求最短路 ≥ ' + need + '：挑到的最短路 ' + worst + '（題庫裡有這樣的題目）'); prevLo = Math.max(prevLo, Math.min(worst, need));
      }
    }
  }
  ok(FP.select('nope', { tiles: 20, e: 100, min: {}, max: {} }, rnd) === null, 'select：沒有這種題庫 → null');
  // 連續兩次不會出同一題
  { let prev = -1, rep = 0; for (let i = 0; i < 80; i++) { const q = FP.select('multi', { tiles: 30, e: 300, k: 3, min: {}, max: {} }, rnd, prev); if (q.idx === prev) rep++; prev = q.idx; } ok(rep === 0, 'select：條件寬鬆時不會連續兩關出同一題（重複 ' + rep + ' 次）'); } }

// ═══ 6. 兩款遊戲 ═══
const PARAM_NAMES = { block: ['TILES', 'HUMAN_EFFORT', 'SOL_MAX', 'HIDDEN_END_MIN', 'FORK_MIN', 'GUESS_MIN', 'FORK3_MIN', 'DEEP_TRAP_MIN', 'TRAP_MAX', 'T_CELL_MIN', 'CROSSROAD_MIN'], multi: ['TILES', 'COLORS', 'HUMAN_EFFORT', 'SOL_MAX', 'HIDDEN_END_MIN', 'HIDDEN_END_MAX', 'FORK_MIN', 'GUESS_MIN', 'FORK3_MIN', 'DEEP_TRAP_MIN', 'TRAP_MAX', 'T_CELL_MIN', 'CROSSROAD_MIN', 'PATH_MIN', 'PATH_MAX'] };
for (const [G, T, kind] of [[GB, TB, 'block'], [GM, TM, 'multi']]) {
  const tag = G.id + ' ';
  ok(G.id === (kind === 'block' ? 'blockfill' : 'multifill') && G.name.length <= 5 && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90 && G.score.format === '{v} 關', tag + '登記資料：id、名稱（' + G.name + '）、成績規格');
  ok(T.RAMP_LEVELS === 30 && T.MAX_LEVEL === 90 && T.COLOR_POOL.length >= 5 && T.COLOR_POOL.every(c => c >= 0 && c <= 9), tag + '參數');
  ok(T.TIME_S[0] < T.TIME_S[1] && T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000 && T.timeMs(99) === T.TIME_S[1] * 1000, tag + '限時 ' + T.TIME_S + ' 秒：線性、到頂維持');
  for (let l = 2; l <= 60; l++) ok(T.timeMs(l) >= T.timeMs(l - 1) && T.wantFor(l).tiles >= T.wantFor(l - 1).tiles && T.wantFor(l).e >= T.wantFor(l - 1).e, tag + '限時、想要的格子數與難度單調 ' + l);
  // 難度參數：每一個都是 [第一關, 封頂]，第 1 關用第一個數字、到頂關用第二個、之後維持
  PARAM_NAMES[kind].forEach(name => { const a = T.PARAMS[name]; ok(Array.isArray(a) && a.length === 2 && a.every(x => typeof x === 'number' && isFinite(x)), tag + name + ' 是 [第一關, 封頂]（' + a + '）'); });
  { const w1 = T.wantFor(1), wc = T.wantFor(T.RAMP_LEVELS), w9 = T.wantFor(99), P = T.PARAMS;
    ok(w1.tiles === P.TILES[0] && wc.tiles === P.TILES[1] && w9.tiles === P.TILES[1], tag + '格子數：第 1 關 ' + w1.tiles + '、第 ' + T.RAMP_LEVELS + ' 關 ' + wc.tiles + '、之後維持');
    ok(Math.abs(w1.e - P.HUMAN_EFFORT[0]) < 1e-6 && Math.abs(wc.e - P.HUMAN_EFFORT[1]) < 1e-6, tag + '人類試錯量：' + Math.round(w1.e) + ' → ' + Math.round(wc.e) + '（倍數式變化）');
    const mid = T.wantFor(Math.round((1 + T.RAMP_LEVELS) / 2)); ok(mid.e > w1.e * 5 && mid.e < wc.e / 5 && Math.abs(mid.e - Math.sqrt(P.HUMAN_EFFORT[0] * P.HUMAN_EFFORT[1])) / mid.e < 0.15, tag + '人類試錯量中間大約是兩端的幾何平均（' + Math.round(mid.e) + '）');
    ok(w1.min.raw === P.FORK_MIN[0] && wc.min.raw === P.FORK_MIN[1] && w1.min.guess === P.GUESS_MIN[0] && wc.min.guess === P.GUESS_MIN[1] && w1.min.d3 === P.FORK3_MIN[0] && wc.min.d3 === P.FORK3_MIN[1], tag + '路口、要猜的路口、三岔路口：兩端對得上');
    ok(w1.min.deep === P.DEEP_TRAP_MIN[0] && wc.min.deep === P.DEEP_TRAP_MIN[1] && w1.max.trap === P.TRAP_MAX[0] && wc.max.trap === P.TRAP_MAX[1] && w1.min.hid === P.HIDDEN_END_MIN[0] && wc.min.hid === P.HIDDEN_END_MIN[1], tag + '深陷阱、最深陷阱、藏起來的終點：兩端對得上');
    ok(w1.min.t3 === P.T_CELL_MIN[0] && wc.min.t3 === P.T_CELL_MIN[1] && w1.min.x4d === P.CROSSROAD_MIN[0] && wc.min.x4d === P.CROSSROAD_MIN[1], tag + 'T 字格、十字格：兩端對得上');
    if (kind === 'multi') ok(w1.min.lo === P.PATH_MIN[0] && wc.min.lo === P.PATH_MIN[1] && w1.max.hi === P.PATH_MAX[0] && wc.max.hi === P.PATH_MAX[1] && w1.k === P.COLORS[0] && wc.k === P.COLORS[1] && w1.max.hid === P.HIDDEN_END_MAX[0] && wc.max.hid === P.HIDDEN_END_MAX[1], tag + '最短路、最長路、顏色數、藏終點上限：兩端對得上');
    if (kind === 'multi') ok(P.PATH_MIN[0] >= 3 && P.PATH_MIN[1] >= P.PATH_MIN[0], tag + '最短路至少 3 格（不會出 1～2 格的路）'); }
  let lowViol = 0, n = 0;
  for (let l = 1; l <= 45; l++) {
    const q = T.makeLevel(l, rnd), p = q.pk.p;
    ok(Math.abs(p.tiles - q.want.tiles) <= 15 && p.tiles >= 10,   /* 格子數跟試錯量一起比：參數區格子數長得快、試錯量長得慢時，會挑比較小的題目（差 15 格以內） */
       tag + '第 ' + l + ' 關：想要 ' + q.want.tiles + ' 格，挑到 ' + p.tiles + ' 格、' + p.k + ' 條路');
    if (kind === 'block') ok(T.COLOR_POOL.indexOf(q.color) >= 0 && p.k === 1, tag + '顏色在調色盤裡');
    else ok(q.colors.length === p.k && new Set(q.colors).size === p.k && q.colors.every(c => T.COLOR_POOL.indexOf(c) >= 0) && Math.abs(p.k - q.want.k) <= 1, tag + '每條路的顏色不重複；路數 ' + p.k + ' 跟想要的 ' + q.want.k + ' 差不多');
    const g = FP.graph(p), sv = FP.solve(g, p.starts, { limit: 1, budget: 5e6 }); ok(sv.count === 1, tag + '第 ' + l + ' 關的題目有解');
    ok(q.pk.m.lo >= 3, tag + '第 ' + l + ' 關：最短的路 ' + q.pk.m.lo + ' 格（不會出 1～2 格的路）');
    n++; if (q.pk.viol < 0.35) lowViol++;
  }
  ok(lowViol >= n * 0.8, tag + '預設的難度參數：45 關裡有 ' + lowViol + ' 關挑得到幾乎完全符合的題目（違反 < 0.35）');
  // 把參數改掉，挑到的題目跟著變（改完還原）
  { const P = T.PARAMS, keepArr = {}; const names = ['FORK_MIN', 'GUESS_MIN', 'DEEP_TRAP_MIN'].concat(kind === 'multi' ? ['PATH_MIN'] : []);
    names.forEach(nm => keepArr[nm] = P[nm].slice());
    const probe = () => { let sum = 0, cnt = 0; for (let l = 6; l <= 24; l += 3) for (let r = 0; r < 4; r++) { const q = T.makeLevel(l, rnd); sum += (kind === 'multi' ? q.pk.m.lo : 0) + q.pk.m.raw + q.pk.m.guess * 2 + q.pk.m.deep; cnt++; } return sum / cnt; };
    const base = probe();
    P.FORK_MIN[0] = P.FORK_MIN[1] = 40; P.GUESS_MIN[0] = P.GUESS_MIN[1] = 20; P.DEEP_TRAP_MIN[0] = P.DEEP_TRAP_MIN[1] = 20; if (kind === 'multi') P.PATH_MIN[0] = P.PATH_MIN[1] = 10;
    const hard = probe();
    names.forEach(nm => { P[nm][0] = keepArr[nm][0]; P[nm][1] = keepArr[nm][1]; });
    ok(hard > base + 0.5, tag + '把路口／要猜／深陷阱' + (kind === 'multi' ? '／最短路' : '') + '的要求調到很嚴，挑到的題目更貼近要求（綜合分 ' + base.toFixed(2) + ' → ' + hard.toFixed(2) + '）'); }
  // 藏終點：多色把「至少藏 1 個」調上去，挑到的題目藏起來的終點變多；調成「最多 0 個」，挑到的題目每個終點都看得出來（題庫有的話）
  if (kind === 'multi') {
    const P = T.PARAMS, k1 = P.HIDDEN_END_MIN.slice(), k2 = P.HIDDEN_END_MAX.slice();
    const avgHid = () => { let s = 0; for (let l = 8; l <= 26; l += 3) for (let r = 0; r < 4; r++) s += T.makeLevel(l, rnd).pk.m.hid; return s / 28; };
    P.HIDDEN_END_MIN[0] = P.HIDDEN_END_MIN[1] = 0; P.HIDDEN_END_MAX[0] = P.HIDDEN_END_MAX[1] = 0; const none = avgHid();
    P.HIDDEN_END_MIN[0] = P.HIDDEN_END_MIN[1] = 1; P.HIDDEN_END_MAX[0] = P.HIDDEN_END_MAX[1] = 2; const some = avgHid();
    P.HIDDEN_END_MIN[0] = k1[0]; P.HIDDEN_END_MIN[1] = k1[1]; P.HIDDEN_END_MAX[0] = k2[0]; P.HIDDEN_END_MAX[1] = k2[1];
    ok(none < 0.2 && some >= 1, tag + '藏終點：要求 0 個 → 平均藏 ' + none.toFixed(2) + ' 個；要求 1～2 個 → 平均藏 ' + some.toFixed(2) + ' 個');
  }
  ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(6) && T.rating(6) !== T.rating(12) && T.rating(12) !== T.rating(20), tag + '評語分級');
}
// 程式裡的接線
{ const rd = p => fs.readFileSync(ROOT + p, 'utf8'), boot = rd('js/boot.js'), ui = rd('js/fillpath_ui.js'), core = rd('js/fillpath_core.js'), css = rd('css/fillpath.css').replace(/[ \t]*\/\*[\s\S]*?\*\//g, '').split(/\s+/).join(' '), theme = rd('css/theme.css');
  ['js/fillpath_core.js', 'js/fillpath_bank.js', 'js/fillpath_ui.js', 'js/reaction_blockfill.js', 'js/reaction_multifill.js', 'css/fillpath.css'].forEach(f => ok(boot.indexOf("'" + f + "'") > 0, 'boot.js 有載入 ' + f));
  const order = ['js/reaction_core.js', 'js/reaction_kit.js', 'js/fillpath_core.js', 'js/fillpath_bank.js', 'js/fillpath_ui.js', 'js/reaction_blockfill.js', 'js/reaction_multifill.js', 'js/reaction.js'].map(f => boot.indexOf("'" + f + "'"));
  ok(order.every((v, i) => i === 0 || v > order[i - 1]), 'boot.js 載入順序：core、kit → 填滿的引擎、題庫、畫面 → 兩款遊戲 → reaction.js');
  ok(/stageClass: 'fillpath-stage'/.test(rd('js/reaction_blockfill.js')) && /stageClass: 'fillpath-stage'/.test(rd('js/reaction_multifill.js')) && /\.fillpath-stage \{ touch-action: none;/.test(css), '舞台不捲動');
  for (let i = 0; i < 10; i++) ok(new RegExp('\\.fillpath-c' + i + ' \\{ --wc: var\\(--wlk-' + i + '\\); \\}').test(css) && new RegExp('--wlk-' + i + ': hsl').test(theme), '路的顏色 ' + i + ' 有 CSS 變數');
  ok(/FP\.build = function \(api, pk, o\)/.test(ui) && /api\.fail\(\{ delay: 3500/.test(ui) && /api\.pass\(\{ delay: 1600/.test(ui) && /fillpath-board--lit/.test(ui) && /api\.solve = function/.test(ui) && /api\.wrong = function/.test(ui), '畫面：build、過關、時間到、debug 用的 solve／wrong');
  ok(/Reaction\.fillPath = FP/.test(core) && /FP\.solve = function/.test(core) && /FP\.pick = function/.test(core) && /FP\.select = function/.test(core) && /FP\.analyze = function/.test(core), '核心：解題器、結構量測、挑題');
  ok(/FP\.select\('block'/.test(rd('js/reaction_blockfill.js')) && /FP\.select\('multi'/.test(rd('js/reaction_multifill.js')), '兩款遊戲都用 FP.select 依難度參數挑題');
  ok(Object.keys(bank).join() === 'block,multi', '題庫只有 block、multi'); }
console.log(bad ? 'FAILED ' + bad + ' / ' + total + '（seed ' + SEED + '）' : 'ALL PASS（' + total + ' 項檢查）');
process.exit(bad ? 1 : 0);
