const { game } = require('./load.js');
const G = game('reaction_pipes.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const { N_, E_, S_, W_ } = T;

// 旋轉
ok(T.rot(N_) === E_ && T.rot(E_) === S_ && T.rot(S_) === W_ && T.rot(W_) === N_ && T.rot(N_ | S_) === (E_ | W_) && T.rotN(N_ | E_, 4) === (N_ | E_) && T.bits(N_ | E_ | W_) === 3, 'rot / bits');
// 難度曲線（線性）
ok(T.gridFor(1) === 4 && T.gridFor(10) === 6 && T.bucketsFor(1) === 1 && T.bucketsFor(10) === 5 && near(T.timeFor(1), 45) && near(T.timeFor(10), 90) && near(T.timeFor(5.5), 67.5), 'ramps');
let prevG = 0, prevB = 0, mono = true; for (let l = 1; l <= 10; l++) { if (T.gridFor(l) < prevG || T.bucketsFor(l) < prevB) mono = false; prevG = T.gridFor(l); prevB = T.bucketsFor(l); }
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
for (let level = 1; level <= 10; level++) {
  tapsSum[level] = [];
  for (let k = 0; k < 600; k++) {
    let L; try { L = T.makeLevel(level); } catch (e) { treeFail++; continue; }
    const N = L.N, sol = L.sol;
    ok(sol.filter(m => m).length === L.S, 'tree has S cells (L' + level + ')');
    const leaves = []; let tees = 0, bad3 = 0;
    sol.forEach((m, i) => { if (!m) return; const b = T.bits(m); if (b === 1 && i !== 0) leaves.push(i); if (b === 3) tees++; if (b > 3) bad3++; });
    ok(leaves.length === L.B && tees === L.B - 1 && bad3 === 0, 'leaves=B and tees=B-1 (L' + level + ': ' + leaves.length + '/' + tees + ')');
    ok(JSON.stringify(leaves) === JSON.stringify(L.buckets), 'buckets are the leaves');
    ok(T.solved(sol, N, L.buckets), 'the generating solution is solved');
    const f = T.flow(sol, N); ok(f.wet.every((w, i) => w === (sol[i] !== 0)) && f.leaks.length === 0, 'solution wets exactly the tree, no leak');
    ok(!T.solved(L.board, N, L.buckets), 'scrambled board is not solved');
    let rotOk = true; L.board.forEach((m, i) => { if (!sol[i]) { if (m !== 0) rotOk = false; } else if (T.tapsFor(m, sol[i]) < 0) rotOk = false; });
    ok(rotOk, 'board cells are rotations of the solution cells');
    const need = T.tapsToSolve(L.board, sol); tapMin = Math.min(tapMin, need); tapsSum[level].push(need);
    // 照答案轉完一定過關
    const b = L.board.slice(); for (let i = 0; i < b.length; i++) if (b[i]) b[i] = T.rotN(b[i], T.tapsFor(b[i], sol[i]));
    ok(T.solved(b, N, L.buckets), 'applying the planned taps solves the level');
    ok(Math.abs(L.time - T.timeFor(level)) < 1e-9, 'level time');
    // 邊界：沒有往棋盤外的開口（水龍頭入口除外）
    sol.forEach((m, i) => { const x = i % N, y = Math.floor(i / N); if (x === 0 && (m & W_)) ok(false, 'opening off the left'); if (x === N - 1 && (m & E_)) ok(false, 'opening off the right'); if (y === N - 1 && (m & S_)) ok(false, 'opening off the bottom'); if (y === 0 && (m & N_) && i !== 0) ok(false, 'opening off the top'); });
  }
}
ok(treeFail === 0, 'tree generation never fails (' + treeFail + ')');
ok(tapMin >= T.MIN_TAPS, 'at least MIN_TAPS taps needed (' + tapMin + ')');
const avgTaps = l => tapsSum[l].reduce((a, b) => a + b, 0) / tapsSum[l].length;
ok(avgTaps(1) < avgTaps(5) && avgTaps(5) < avgTaps(10), 'later levels need more taps: ' + [1, 5, 10].map(l => avgTaps(l).toFixed(1)).join(' < '));
ok(T.rating(2) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(12), 'rating tiers');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
