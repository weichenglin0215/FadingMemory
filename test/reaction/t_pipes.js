const { game } = require('./load.js');
const G = game('reaction_pipes.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const { N_, E_, S_, W_ } = T;

// 旋轉
ok(T.rot(N_) === E_ && T.rot(E_) === S_ && T.rot(S_) === W_ && T.rot(W_) === N_ && T.rot(N_ | S_) === (E_ | W_) && T.rotN(N_ | E_, 4) === (N_ | E_) && T.bits(N_ | E_ | W_) === 3, 'rot / bits');
// 難度曲線（線性）
ok(T.gridFor(1) === T.GRID_START && T.gridFor(T.LEVEL_RAMP) === T.GRID_END && T.bucketsFor(1) === T.BUCKETS_START && T.bucketsFor(T.LEVEL_RAMP) === T.BUCKETS_END && near(T.timeFor(1), T.TIME_START) && near(T.timeFor(T.LEVEL_RAMP), T.TIME_END) && T.gridFor(99) === T.GRID_END && T.bucketsFor(99) === T.BUCKETS_END, 'ramps（' + T.LEVEL_RAMP + ' 關走完，棋盤 ' + T.GRID_START + '→' + T.GRID_END + '、水桶 ' + T.BUCKETS_START + '→' + T.BUCKETS_END + '、限時 ' + T.TIME_START + '→' + T.TIME_END + '；使用者調的參數，測試跟著走）');
ok(T.LEVEL_RAMP === 30 && near(T.fillFor(1), T.FILL[0]) && near(T.fillFor(30), T.FILL[1]) && T.minTapsFor(1) === T.MIN_TAPS[0] && T.minTapsFor(30) === T.MIN_TAPS[1], '水管占比 ' + T.FILL + '、至少轉的次數 ' + T.MIN_TAPS);
for (let l = 11; l <= 30; l++) ok(T.gridFor(l) > T.gridFor(10) || T.bucketsFor(l) > T.bucketsFor(10) || T.fillFor(l) > T.fillFor(10), '第 10 關之後難度仍在上升：第 ' + l + ' 關');
let prevG = 0, prevB = 0, mono = true; for (let l = 1; l <= 30; l++) { if (T.gridFor(l) < prevG || T.bucketsFor(l) < prevB) mono = false; prevG = T.gridFor(l); prevB = T.bucketsFor(l); }
ok(mono, 'grid & buckets never decrease');
// 手算範例：2×2
{
  const N = 2;
  const board = [N_ | E_, W_ | S_, 0, N_];            // (0,0)有N、E；(1,0)有W、S；(1,1)有N 是水桶
  const f = T.flow(board, N);
  ok(f.wet[0] && f.wet[1] && f.wet[3] && !f.wet[2] && f.leaks.length === 0, 'hand example: all wet, no leak');
  ok(T.solved(board, N, [3]), 'hand example solved');
  const b2 = board.slice(); b2[1] = T.rot(b2[1]);      // (1,0) 變成 N、W：W 對得上、N 朝外 → 漏水；S 沒了 → 水桶斷水
  const f2 = T.flow(b2, N);
  ok(f2.wet[1] && !f2.wet[3] && f2.leaks.length === 1 && f2.leaks[0].i === 1 && f2.leaks[0].d === N_, 'hand example: leak + bucket dry');
  ok(!T.solved(b2, N, [3]), 'leaking board is not solved');
  const b3 = [E_ | S_, W_, N_, 0];                      // 左上沒有 N 開口 → 完全沒水
  ok(T.flow(b3, N).wet.every(w => !w) && !T.solved(b3, N, [1]), 'no inlet, no water');
  const b4 = [N_ | E_ | S_, W_, 0, 0];                  // 往下沒接 → 漏水；水龍頭入口不算漏水
  const f4 = T.flow(b4, N);
  ok(f4.leaks.length === 1 && f4.leaks[0].d === S_, 'faucet inlet is not a leak; open end below is');
}
// 大量產生關卡
let treeFail = 0, tapMin = 1e9, tapsSum = {}, solvedAtStart = 0;
const faucetSeen = {}, quad = { total: 0, full: 0 }, sizeByLevel = {};
for (let level = 1; level <= 30; level++) {
  tapsSum[level] = [];
  for (let k = 0; k < 100; k++) {
    let L; try { L = T.makeLevel(level); } catch (e) { treeFail++; continue; }
    const N = L.N, sol = L.sol;
    ok(sol.filter(m => m).length === L.S, 'tree has S cells (L' + level + ')');
    const leaves = []; let tees = 0, bad3 = 0;
    ok(L.faucet >= 0 && L.faucet < N && sol[L.faucet] & N_, '水龍頭在上排、那格有上方開口 (L' + level + ')');
    faucetSeen[level] = faucetSeen[level] || new Set(); faucetSeen[level].add(L.faucet);
    sol.forEach((m, i) => { if (!m) return; const b = T.bits(m); if (b === 1 && i !== L.faucet) leaves.push(i); if (b === 3) tees++; if (b > 3) bad3++; });
    ok(leaves.length === L.B && tees === L.B - 1 && bad3 === 0, 'leaves=B and tees=B-1 (L' + level + ': ' + leaves.length + '/' + tees + ')');
    ok(JSON.stringify(leaves) === JSON.stringify(L.buckets), 'buckets are the leaves');
    ok(T.solved(sol, N, L.buckets, L.faucet), 'the generating solution is solved');
    const f = T.flow(sol, N, L.faucet); ok(f.wet.every((w, i) => w === (sol[i] !== 0)) && f.leaks.length === 0, 'solution wets exactly the tree, no leak');
    ok(!T.solved(L.board, N, L.buckets, L.faucet), 'scrambled board is not solved');
    let rotOk = true; L.board.forEach((m, i) => { if (!sol[i]) { if (m !== 0) rotOk = false; } else if (T.tapsFor(m, sol[i]) < 0) rotOk = false; });
    ok(rotOk, 'board cells are rotations of the solution cells');
    const need = T.tapsToSolve(L.board, sol); tapMin = Math.min(tapMin, need); tapsSum[level].push(need);
    // 照答案轉完一定過關
    const b = L.board.slice(); for (let i = 0; i < b.length; i++) if (b[i]) b[i] = T.rotN(b[i], T.tapsFor(b[i], sol[i]));
    ok(T.solved(b, N, L.buckets, L.faucet), 'applying the planned taps solves the level');
    ok(need >= T.minTapsFor(level), '至少要轉 ' + T.minTapsFor(level) + ' 下：' + need);
    sizeByLevel[level] = L.S;
    // 水管要往整個棋盤延伸：棋盤夠大時，樹在左右兩半、上下兩半都有格子（不會只擠在水龍頭附近）
    if (N >= 6) { quad.total++; const half = N / 2; let l = 0, r = 0, t = 0, bt = 0; sol.forEach((m, i) => { if (!m) return; const x = i % N, y = Math.floor(i / N); if (x < half) l++; else r++; if (y < half) t++; else bt++; }); if (l > 0 && r > 0 && t > 0 && bt > 0 && Math.min(l, r, t, bt) >= 3) quad.full++; }
    ok(Math.abs(L.time - T.timeFor(level)) < 1e-9, 'level time');
    // 邊界：沒有往棋盤外的開口（水龍頭入口除外）
    sol.forEach((m, i) => { const x = i % N, y = Math.floor(i / N); if (x === 0 && (m & W_)) ok(false, 'opening off the left'); if (x === N - 1 && (m & E_)) ok(false, 'opening off the right'); if (y === N - 1 && (m & S_)) ok(false, 'opening off the bottom'); if (y === 0 && (m & N_) && i !== L.faucet) ok(false, 'opening off the top'); });
  }
}
ok(treeFail === 0, 'tree generation never fails (' + treeFail + ')');
ok(tapMin >= T.MIN_TAPS[0], 'at least MIN_TAPS taps needed (' + tapMin + ')');
// 水龍頭位置每一關隨機：每個棋盤大小 100 次裡，位置不只一種；第 10 關起有很多不同位置
for (const lv of [1, 10, 20, 30]) ok(faucetSeen[lv].size >= Math.min(T.gridFor(lv), 3), '第 ' + lv + ' 關水龍頭位置有變化：' + [...faucetSeen[lv]].sort().join(','));
ok(faucetSeen[30].size >= 7, '8×8 的水龍頭 8 個欄位幾乎都會出現：' + faucetSeen[30].size);
ok(quad.full / quad.total > 0.97, '大棋盤的水管延伸到整個棋盤（四個象限都有、各至少 3 格）：' + (quad.full / quad.total * 100).toFixed(1) + '%');
for (let l = 2; l <= 30; l++) ok(sizeByLevel[l] >= sizeByLevel[l - 1] - 8, '水管格數大致隨關卡增加');
ok(sizeByLevel[30] > sizeByLevel[1] * 4, '水管格數第 30 關 ' + sizeByLevel[30] + ' ≫ 第 1 關 ' + sizeByLevel[1]);
const avgTaps = l => tapsSum[l].reduce((a, b) => a + b, 0) / tapsSum[l].length;
ok(avgTaps(1) < avgTaps(10) && avgTaps(10) < avgTaps(20) && avgTaps(20) < avgTaps(30), 'later levels need more taps: ' + [1, 10, 20, 30].map(l => avgTaps(l).toFixed(1)).join(' < '));
ok(T.rating(2) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(12), 'rating tiers');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
