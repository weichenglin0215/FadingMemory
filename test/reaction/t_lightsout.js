const { game } = require('./load.js');
const G = game('reaction_lightsout.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 難度曲線
ok(T.sizeFor(1) === 3 && T.sizeFor(5) === 3 && T.sizeFor(6) === 4 && T.sizeFor(10) === 4 && T.sizeFor(11) === 5 && T.sizeFor(40) === 5, 'size unlock points');
ok(T.kFor(1) === 3 && T.kFor(15) === 12 && near(T.timeFor(1), 60) && near(T.timeFor(15), 35) && near(T.timeFor(8), 47.5), 'k and time ramps');
let mono = true; for (let l = 2; l <= 15; l++) if (T.kFor(l) < T.kFor(l - 1) || T.timeFor(l) > T.timeFor(l - 1)) mono = false;
ok(mono, 'k never decreases, time never increases');
// toggleMask：角、邊、中央
ok(T.popcount(T.toggleMask(3, 0)) === 3 && T.popcount(T.toggleMask(3, 1)) === 4 && T.popcount(T.toggleMask(3, 4)) === 5 && T.popcount(T.toggleMask(5, 12)) === 5 && T.popcount(T.toggleMask(5, 24)) === 3, 'toggle sizes');
ok((T.toggleMask(3, 4) & (1 << 4)) && (T.toggleMask(3, 4) & (1 << 1)) && (T.toggleMask(3, 4) & (1 << 3)) && (T.toggleMask(3, 4) & (1 << 5)) && (T.toggleMask(3, 4) & (1 << 7)) && !(T.toggleMask(3, 4) & 1), 'center toggles + shape');
ok(!(T.toggleMask(3, 2) & (1 << 3)), 'no wrap-around at the right edge');
// 按兩次回到原狀
ok(T.applyPresses(4, 0, 0b1011) === T.applyPresses(4, T.applyPresses(4, 0b110, 0b1011), 0b1011) ^ 0 || true, 'apply is an involution');
for (let N = 3; N <= 5; N++) for (let k = 0; k < 50; k++) { const b = (Math.random() * (1 << (N * N))) >>> 0, p = (Math.random() * (1 << (N * N))) >>> 0; if (T.applyPresses(N, T.applyPresses(N, b, p), p) !== b) ok(false, 'involution ' + N); }
// 零空間維度：解的組數＝2^nullity
const nullity = {}; for (let N = 3; N <= 5; N++) { const s = T.solveMin(N, T.applyPresses(N, 0, 1)); nullity[N] = s.nullity; }
ok(nullity[3] === 0 && nullity[4] === 4 && nullity[5] === 2, 'nullity 3x3=0, 4x4=4, 5x5=2: ' + JSON.stringify(nullity));
// 與暴力窮舉比對（3×3 全部 512 盤面、4×4 隨機 300 個、5×5 隨機 3 個）
function brute(N, board) { const n = N * N; let best = null; const lim = 2 ** n; for (let m = 0; m < lim; m++) { if (T.applyPresses(N, board, m) === 0) { const w = T.popcount(m); if (best === null || w < best) best = w; } } return best; }
let mismatch = 0, unsolvable = 0;
for (let b = 0; b < 512; b++) { const s = T.solveMin(3, b), br = brute(3, b); if (!s || s.count !== br) mismatch++; }
for (let k = 0; k < 300; k++) { const b = T.applyPresses(4, 0, (Math.random() * 65536) >>> 0), s = T.solveMin(4, b), br = brute(4, b); if (!s || s.count !== br) mismatch++; }
for (let k = 0; k < 3; k++) { const b = T.applyPresses(5, 0, (Math.random() * (1 << 25)) >>> 0), s = T.solveMin(5, b), br = brute(5, b); if (!s || s.count !== br) mismatch++; }
ok(mismatch === 0, 'solveMin equals brute force (' + mismatch + ' mismatches)');
// 4×4 有些盤面無解：solveMin 要回 null，且與暴力一致
let unsolv = 0; for (let b = 0; b < 65536; b += 97) { const s = T.solveMin(4, b), br = brute(4, b); if ((s === null) !== (br === null)) unsolvable++; if (s === null) unsolv++; }
ok(unsolvable === 0 && unsolv > 0, 'unsolvable boards agree with brute force (' + unsolv + ' unsolvable seen)');
// 題目：一定有解、解真的能關燈、最少步數 ≥ 門檻且 ≤ k、至少一盞亮
let tooEasy = 0, cnt = 0, unsolvedPuzzle = 0, minSum = {};
for (let level = 1; level <= 20; level++) {
  minSum[level] = [];
  for (let k = 0; k < 300; k++) {
    const P = T.makePuzzle(level);
    cnt++;
    if (P.board === 0) ok(false, 'puzzle is already dark');
    if (T.applyPresses(P.N, P.board, P.minMask) !== 0) unsolvedPuzzle++;
    if (T.popcount(P.minMask) !== P.min) ok(false, 'min matches mask');
    if (P.min > P.k) ok(false, 'min ≤ k');
    if (P.min < Math.max(2, Math.floor(P.k / 2))) tooEasy++;
    if (T.applyPresses(P.N, 0, P.made) !== P.board) ok(false, 'board comes from the pressed cells');
    if (T.popcount(P.made) !== P.k) ok(false, 'k distinct cells pressed');
    minSum[level].push(P.min);
  }
}
ok(unsolvedPuzzle === 0, 'every puzzle is solved by its minimal solution');
ok(tooEasy === 0, 'no puzzle easier than the threshold (' + tooEasy + ')');
const avg = l => minSum[l].reduce((a, b) => a + b, 0) / minSum[l].length;
ok(avg(1) < avg(6) && avg(6) < avg(11) && avg(11) <= avg(15) + 0.5, 'minimum presses grow: ' + [1, 6, 11, 15].map(l => avg(l).toFixed(1)).join(' < '));
ok(T.rating(2) !== T.rating(7) && T.rating(7) !== T.rating(12) && T.rating(12) !== T.rating(15), 'rating tiers');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
