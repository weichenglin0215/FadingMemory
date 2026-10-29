const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_whofirst.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 影格數：第 1 關 18、到頂 2，線性（每關少約 0.55 影格）、之後維持
ok(T.framesAt(1) === T.FRAMES[0] && T.framesAt(T.RAMP_LEVELS) === T.FRAMES[1] && T.framesAt(T.MAX_LEVEL) === T.FRAMES[1], '影格數端點 ' + T.FRAMES[0] + ' → ' + T.FRAMES[1] + '（使用者調的參數，測試跟著走）');
for (let l = 2; l <= T.MAX_LEVEL; l++) ok(T.framesAt(l) <= T.framesAt(l - 1) && T.framesAt(l - 1) - T.framesAt(l) <= 1, '單調、每關最多少 1 影格 ' + l);
ok(T.framesAt(1) - T.framesAt(2) >= 0, '起步');
// 影格量測：中位數、離譜值退回 60Hz
ok(T.median([16, 17, 16, 33, 16]) === 16 && T.median([]) === 0, 'median');
ok(Math.abs(T.frameFrom([16.7, 16.6, 16.8, 40, 16.7]) - 16.7) < 1e-9, '60Hz');
ok(Math.abs(T.frameFrom([8.3, 8.4, 8.3, 8.3]) - 8.3) < 1e-9, '120Hz');
ok(Math.abs(T.frameFrom([1, 1, 1]) - 1000 / 60) < 1e-9 && Math.abs(T.frameFrom([100, 120, 110]) - 1000 / 60) < 1e-9 && Math.abs(T.frameFrom([]) - 1000 / 60) < 1e-9, '離譜的量測值退回 60Hz');
// 先亮的一側
{ const hist = []; let run = 1, maxRun = 1; const cnt = { L: 0, R: 0 };
  for (let i = 0; i < 20000; i++) { const s = T.nextSide(hist, rnd); cnt[s]++; if (hist.length && hist[hist.length - 1] === s) run++; else run = 1; maxRun = Math.max(maxRun, run); hist.push(s); }
  ok(maxRun <= T.SAME_MAX, '同側最多連續 ' + maxRun); ok(Math.abs(cnt.L - cnt.R) < 800, '左右平均 ' + cnt.L + '/' + cnt.R); }
// 出題
for (let l = 1; l <= T.MAX_LEVEL; l++) for (let i = 0; i < 60; i++) {
  const q = T.makeLevel(l, rnd, []);
  ok(q.first === 'L' || q.first === 'R', 'first');
  ok(q.wait >= T.WAIT_MS[0] && q.wait <= T.WAIT_MS[1], '等待時間範圍');
  const base = T.lampAt(l), cap = (472 - 2 * T.EDGE - T.GAP_MIN) / 2;
  ok(q.sizeL >= T.LAMP[1] - 1e-9 && q.sizeR >= T.LAMP[1] - 1e-9 && q.sizeL <= T.LAMP[0] * (1 + T.SIZE_JIT) + 1e-9 && q.sizeR <= T.LAMP[0] * (1 + T.SIZE_JIT) + 1e-9, '燈的大小範圍 ' + q.sizeL.toFixed(1) + '／' + q.sizeR.toFixed(1));
  ok(Math.abs(q.sizeL - q.sizeR) >= 1 - 1e-9, '兩盞燈大小一定有差：' + q.sizeL.toFixed(1) + '／' + q.sizeR.toFixed(1));
  ok(q.sizeL + q.sizeR + 2 * T.EDGE + T.GAP_MIN <= 472 + 1e-6 && Math.max(q.sizeL, q.sizeR) <= cap + 1e-9, '兩盞燈 + 邊距放得進畫面寬 472：' + (q.sizeL + q.sizeR + 2 * T.EDGE));
  ok(l >= T.RAMP_LEVELS ? Math.min(q.sizeL, q.sizeR) <= T.LAMP[1] + 1.01 : Math.max(q.sizeL, q.sizeR) >= Math.min(base, cap) * 0.99 - 1.5, '大的那盞接近基準大小');
  ok(q.frames === T.framesAt(l), '影格數');
}
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
// V1.27：燈的大小慢慢縮小：第 1 關 220px → 到頂 10px，離左右邊緣 20px
ok(Math.abs(T.lampAt(1) - 220) < 1e-9 && Math.abs(T.lampAt(T.RAMP_LEVELS) - 10) < 1e-9 && Math.abs(T.lampAt(T.MAX_LEVEL) - 10) < 1e-9 && T.EDGE === 20, '燈直徑 220 → 10px、離邊緣 20px');
for (let l = 2; l <= T.MAX_LEVEL; l++) ok(T.lampAt(l) <= T.lampAt(l - 1) + 1e-9, '燈越來越小 ' + l);
{ const css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/reaction3.css'), 'utf8'), i = css.indexOf('.wf-row {');
  ok(/left: 20px;\s*right: 20px;/.test(css.slice(i, i + 160)) && /justify-content: space-between/.test(css.slice(i, i + 260)), '版面：兩盞燈靠左右邊緣（20px）'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
