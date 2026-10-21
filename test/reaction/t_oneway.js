// 單行道（oneway，企劃 224）的純函式檢查：出題一定有解、最直的路走不通、要繞夠遠、死巷夠多、拖曳規則、難度線性
// V1.36.0：加了「誘餌」——一條一路順著箭頭朝醫院靠近、卻在醫院附近變成死巷的大路；憑直覺走的人要走很多冤枉路
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_oneway.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261103), rnd = rng(SEED);

// ── 難度 ──
ok(T.sizeFor(1) === T.N[0] && T.sizeFor(T.RAMP_LEVELS) === T.N[1] && T.sizeFor(99) === T.N[1], '路口數 ' + T.N);
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S);
ok(T.detourFor(1) === 0 && T.detourFor(T.RAMP_LEVELS) === T.DETOUR[1] && T.trapsFor(1) === T.TRAPS[0] && T.trapsFor(T.RAMP_LEVELS) === T.TRAPS[1], '繞路格數／死巷數 ' + T.DETOUR + '／' + T.TRAPS);
for (let l = 2; l <= 60; l++) ok(T.sizeFor(l) >= T.sizeFor(l - 1) && T.detourFor(l) >= T.detourFor(l - 1) && T.trapsFor(l) >= T.trapsFor(l - 1) && T.timeMs(l) <= T.timeMs(l - 1), '單調 ' + l);
for (let l = 1; l <= 60; l++) ok(T.detourFor(l) % 2 === 0, '繞路格數是偶數（格子路徑的奇偶性）');
ok(T.startOf(5) === 20 && T.goalOf(5) === 4 && T.manhattan(5, 20, 4) === 8, '起點左下角、醫院右上角、直線距離 8');
// ── 手工小地圖：3×3，箭頭全部由左向右、由下向上 ──
function mk(n, edges) { const allow = new Set(edges.map(e => e[0] + ',' + e[1])); return { n, start: T.startOf(n), goal: T.goalOf(n), allow }; }
{ const edges = []; const n = 3; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { const i = r * n + c; if (c + 1 < n) edges.push([i, i + 1]); if (r - 1 >= 0) edges.push([i, i - n]); }
  const q = mk(3, edges);
  ok(T.canMove(q, 6, 7) && !T.canMove(q, 7, 6) && T.canMove(q, 6, 3) && !T.canMove(q, 3, 6) && !T.canMove(q, 6, 8), 'canMove：順著箭頭、相鄰才可以');
  ok(T.monotoneExists(q) && T.solutionPath(q).length === 5 && T.trapNodes(q).length === 0, '全部往右往上：有最直路線、最短 5 個路口、沒有死巷');
  ok(T.distFrom(q, 6)[2] === 4 && T.distFrom(q, 6)[6] === 0 && T.distFrom(q, 0)[6] === -1, 'distFrom'); }
{ // 只有一條繞路的路線：6→7→4→3→0→1→2（中間用到一段往左的 4→3），沒有只往右、往上的最直路線；7→8 是死巷（8 走進去出不來）
  const q = mk(3, [[6, 7], [7, 4], [4, 3], [3, 0], [0, 1], [1, 2], [7, 8], [5, 4]]);
  ok(!T.monotoneExists(q), '要往左繞一段：最直（只往右、往上）的路走不通');
  const sol = T.solutionPath(q); ok(sol && sol.join() === '6,7,4,3,0,1,2', '還是有路可以繞：' + (sol || []).join('→'));
  ok(T.trapNodes(q).join() === '8' && T.canReachGoal(q)[8] === false && T.canReachGoal(q)[7] === true && T.canReachGoal(q)[6] === true, '路口 8 是死巷（走得到、卻到不了醫院）；5 走不到所以不算；6、7 都到得了醫院'); }
// ── 拖曳規則 ──
{ const n = 3, edges = [[6, 7], [7, 8], [8, 5], [5, 2], [4, 7], [3, 4], [6, 3], [5, 4]], q = mk(n, edges), path = [6];
  ok(T.drag(q, path, 7) === 'add' && path.join() === '6,7', '順著箭頭 6→7');
  ok(T.drag(q, path, 4) === 'blocked' && T.drag(q, path, 0) === null && path.join() === '6,7', '7→4 逆向（箭頭是 4→7）被擋、7 和 0 不相鄰');
  ok(T.drag(q, path, 8) === 'add' && T.drag(q, path, 5) === 'add' && T.drag(q, path, 2) === 'add' && path.join() === '6,7,8,5,2', '一路開到醫院');
  ok(T.drag(q, path, 5) === 'back' && path.join() === '6,7,8,5', '拖回上一個路口＝退一格');
  ok(T.canMove(q, 5, 4) && T.drag(q, path, 4) === 'add' && path.join() === '6,7,8,5,4', '5→4（箭頭是 5→4）可以走'); }
{ const n = 3, edges = [[6, 7], [7, 4], [4, 3], [3, 6]], q = mk(n, edges), path = [6]; T.drag(q, path, 7); T.drag(q, path, 4); T.drag(q, path, 3);
  ok(T.drag(q, path, 6) === 'blocked' && path.join() === '6,7,4,3', '不能走回已經走過的路口（就算箭頭允許）'); }
// ── 整關 ──
let monoHit = 0, monoTot = 0, trapMin = 1e9, fallback = 0, decoyTot = 0, decoyBad = 0, doorstep = 0, doorTot = 0;
for (let i = 0; i < 600; i++) {
  const lv = 1 + (i % 30), q = T.makeLevel(lv, rnd), n = T.sizeFor(lv), man = T.manhattan(n, q.start, q.goal);
  ok(q.n === n && q.start === T.startOf(n) && q.goal === T.goalOf(n), '起點左下、醫院右上');
  // 每一對相鄰路口恰好有一個方向
  let edgeCount = 0;
  for (let a = 0; a < n * n; a++) T.outgoing(q, a).forEach(b => { ok(!T.canMove(q, b, a), '每一段路只有一個方向'); edgeCount++; });
  ok(edgeCount === 2 * n * (n - 1), '每一對相鄰路口都有一段路：' + edgeCount + ' 段（要 ' + 2 * n * (n - 1) + '）');
  ok(Array.isArray(q.solution) && q.solution[0] === q.start && q.solution[q.solution.length - 1] === q.goal, '附的解從起點到醫院');
  q.solution.forEach((k, t) => { if (t) ok(T.canMove(q, q.solution[t - 1], k), '解的每一步都順著箭頭'); });
  ok(new Set(q.solution).size === q.solution.length, '解不走重複的路口');
  const dist = T.distFrom(q, q.start)[q.goal];
  ok(dist === q.solution.length - 1 && dist >= man + T.detourFor(lv), '第 ' + lv + ' 關：最短路線 ' + dist + ' 段 ≥ 直線 ' + man + ' ＋ 繞路 ' + T.detourFor(lv));
  if (lv > T.WARMUP) { monoTot++; if (T.monotoneExists(q)) monoHit++; }
  const traps = T.trapNodes(q); trapMin = Math.min(trapMin, traps.length - T.trapsFor(lv));
  ok(traps.length >= T.trapsFor(lv) && q.traps.length === traps.length, '第 ' + lv + ' 關：死巷 ' + traps.length + ' ≥ ' + T.trapsFor(lv));
  ok(!traps.includes(q.start) && !traps.includes(q.goal), '起點與醫院不是死巷');
  if (lv > T.WARMUP) {
    ok(q.decoy >= 0 && traps.includes(q.decoy), '第 ' + lv + ' 關有誘餌：終點是一個死巷路口（走進去出不來）');
    decoyTot++; const dc = T.decoyClose(q); if (dc > T.closeFor(lv) + 6) decoyBad++;
    if (T.closeFor(lv) === 1) { doorTot++; if (dc === 1) doorstep++; }
    ok(dc >= 1 && dc < Infinity, '誘餌停在離醫院 ' + dc + ' 格的地方（至少 1 格，不會直接走進醫院）');
  }
}
ok(decoyBad === 0, '誘餌的終點離醫院不會太遠：' + decoyBad + '／' + decoyTot);
ok(doorTot === 0 || doorstep >= doorTot * 0.85, '到頂的關卡（CLOSE ' + T.CLOSE[1] + '）九成左右的誘餌停在醫院門口：' + doorstep + '／' + doorTot);
ok(monoHit === 0, '第 ' + (T.WARMUP + 1) + ' 關起，只往右、往上走的最直路線都走不通：' + monoHit + '／' + monoTot);
// ── 誘餌的用途：憑直覺走（每個路口挑箭頭同意、離醫院最近的）的人，不能一路走到底；越後面冤枉路越多 ──
{ const rr = rng(seedOf(515)); const avgWaste = (lv, N) => { let w = 0, zero = 0, tot = 0; for (let k = 0; k < N; k++) { const q = T.makeLevel(lv, rr); for (let tie = 0; tie < 3; tie++) { const r = T.greedyCost(q, tie, 30000); w += Math.min(T.WASTE_CAP, r.waste); tot++; if (r.waste === 0) zero++; ok(r.ok, '憑直覺走、走不通就退回去：最後一定走得到醫院（解一定存在）'); } } return { avg: w / tot, zero: zero / tot }; };
  const a2 = avgWaste(2, 25), a8 = avgWaste(8, 25), a16 = avgWaste(16, 25), a30 = avgWaste(30, 25);
  console.log('憑直覺走的人平均冤枉路（步）：第 2 關 ' + a2.avg.toFixed(1) + '、第 8 關 ' + a8.avg.toFixed(1) + '、第 16 關 ' + a16.avg.toFixed(1) + '、第 30 關 ' + a30.avg.toFixed(1) + '；完全不用退回的比例 ' + (a8.zero * 100).toFixed(0) + '％／' + (a16.zero * 100).toFixed(0) + '％／' + (a30.zero * 100).toFixed(0) + '％');
  ok(a8.avg >= 3 && a8.zero <= 0.4, '第 8 關：憑直覺走的人平均要走 ≥ 3 步冤枉路（' + a8.avg.toFixed(1) + '），完全不用退回的不到 4 成（' + (a8.zero * 100).toFixed(0) + '％）');
  ok(a16.avg >= 15 && a16.zero <= 0.15, '第 16 關：冤枉路 ≥ 15 步（' + a16.avg.toFixed(1) + '），不用退回的不到 15％（' + (a16.zero * 100).toFixed(0) + '％）');
  ok(a30.avg >= 15 && a30.zero <= 0.1, '第 30 關：冤枉路 ≥ 15 步（' + a30.avg.toFixed(1) + '），不用退回的不到 1 成（' + (a30.zero * 100).toFixed(0) + '％）');
  ok(a16.avg > a2.avg && a30.avg > a8.avg, '越後面越容易走錯'); }
// 手工小地圖：誘餌。0 1 2／3 4 5／6 7 8，起點 6、醫院 2。大路 6→7→8→5（5 的三條路全指向它＝死巷，離醫院 1 格）；真正的路 6→7→4→3→0→1→2（4→3 往左，要先離醫院遠一點）
{ const edges = [[6, 7], [7, 8], [8, 5], [4, 5], [2, 5], [7, 4], [4, 3], [3, 0], [0, 1], [1, 2], [1, 4], [3, 6]];
  const dq = { n: 3, start: 6, goal: 2, allow: new Set(edges.map(e => e[0] + ',' + e[1])) };
  const reach = T.monotoneReach(dq);
  ok(reach[6] === 1 && reach[7] === 1 && reach[8] === 1 && reach[5] === 1 && reach[4] === 1 && reach[2] === 0 && !T.monotoneExists(dq), '只往右、往上走：走得到 5，到不了醫院');
  ok(T.canReachGoal(dq)[5] === false && T.canReachGoal(dq)[4] === true && T.trapNodes(dq).join() === '5,8', '5、8 是死巷（走進去到不了醫院），4 到得了');
  ok(T.decoyClose(dq) === 1, '誘餌停在離醫院 1 格的 5：decoyClose ＝ 1');
  ok(T.solutionPath(dq).join() === '6,7,4,3,0,1,2', '真正的路要先往左繞（6→7→4→3→0→1→2）');
  // 憑直覺走的人：7 的選擇 8（離醫院 2 格）與 4（離醫院 2 格）一樣近，依 tie 先走 8→5 被騙，退回來才改走 4
  const r = T.greedyCost(dq, 0); ok(r.ok && r.len === 6 && r.waste >= 4, 'greedyCost：走大路被騙（冤枉路 ' + r.waste + ' 步），最後路線 6 段'); }
// 效能
{ for (const lv of [6, 12, 20, 30]) { let mx = 0, sum = 0; const N = 40; for (let i = 0; i < N; i++) { const t0 = process.hrtime.bigint(); T.makeLevel(lv, rnd); const ms = Number(process.hrtime.bigint() - t0) / 1e6; mx = Math.max(mx, ms); sum += ms; } console.log('第' + lv + '關 出題平均 ' + (sum / N).toFixed(1) + 'ms 最慢 ' + mx.toFixed(0) + 'ms'); ok(sum / N < 120 && mx < 800, '第 ' + lv + ' 關出題夠快'); } }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_oneway.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/stageClass: 'owy-stage'/.test(src) && /\.owy-stage \{ touch-action: none;/.test(css), '舞台不捲動');
  ok(/api\.fail\(\{ delay: 2800/.test(src), '失敗停格 2 秒以上');
  ok(/\.owy-bad \{ fill: none; stroke: var\(--c-bad-light\)/.test(css) && /\.owy-sol \{ fill: none; stroke: var\(--c-ok\)/.test(css), '紅圈、綠線用 CSS 變數');
  ok(boot.indexOf("'js/reaction_oneway.js'") > 0, 'boot.js 有載入'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(15) && T.rating(15) !== T.rating(25), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
