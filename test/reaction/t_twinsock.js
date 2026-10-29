// 雙胞胎襪子：格數 2×3 → 4×6、恰好一隻跟目標相同、其他只差一個參數、轉速線性變快
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_twinsock.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 30) console.log('FAIL', m); } };
const SEED = seedOf(20261010), rnd = rng(SEED);
const want = [[2, 3], [2, 4], [3, 4], [3, 5], [4, 5], [4, 6]];
want.forEach((s, i) => ok(JSON.stringify(T.sizeAt(i + 1)) === JSON.stringify(s), '第 ' + (i + 1) + ' 關格數 ' + s.join('×')));
ok(JSON.stringify(T.sizeAt(7)) === '[4,6]' && JSON.stringify(T.sizeAt(40)) === '[4,6]', '第 6 關起固定 4×6');
ok(Math.abs(T.spinAt(1) - T.SPIN[0]) < 1e-9 && Math.abs(T.spinAt(T.RAMP_LEVELS) - T.SPIN[1]) < 1e-9 && T.spinAt(T.RAMP_LEVELS + 15) === T.spinAt(T.RAMP_LEVELS), '轉速 ' + T.SPIN[0] + ' → ' + T.SPIN[1] + ' 度／秒（第 ' + T.RAMP_LEVELS + ' 關到頂）');
for (let l = 1; l < T.RAMP_LEVELS; l++) ok(T.spinAt(l + 1) > T.spinAt(l) && T.hueDelta(l + 1) < T.hueDelta(l) && T.timeMs(l + 1) < T.timeMs(l), '線性變難 ' + l);
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S[0] + ' → ' + T.TIME_S[1] + ' 秒');
ok(T.countDelta(1) === T.COUNT_DELTA[0] && T.countDelta(T.RAMP_LEVELS) === T.COUNT_DELTA[1], '數量差 ' + T.COUNT_DELTA[0] + ' → ' + T.COUNT_DELTA[1]);
for (let lv = 1; lv <= 30; lv++) for (let k = 0; k < 200; k++) {
  const q = T.makeLevel(lv, rnd), sz = T.sizeAt(lv), n = sz[0] * sz[1];
  ok(q.cols === sz[0] && q.rows === sz[1] && q.socks.length === n, '格數 lv' + lv);
  ok(q.twin >= 1 && q.twin < n, '雙胞胎不在左上角');
  const t = q.socks[0], twins = q.socks.filter((s, i) => i > 0 && T.same(s, t)).length;
  ok(twins === 1 && T.same(q.socks[q.twin], t), '恰好有一隻雙胞胎 lv' + lv + ' twins=' + twins);
  // 每隻假襪子跟目標只差一個參數
  q.socks.forEach((s, i) => {
    if (i === 0 || i === q.twin) return;
    const diffs = (Math.round(s.hue) !== Math.round(t.hue) ? 1 : 0) + (s.stripes !== t.stripes ? 1 : 0) + (s.dots !== t.dots ? 1 : 0);
    ok(diffs === 1, '假襪子只差一個參數 lv' + lv + ' ' + T.key(s) + ' vs ' + T.key(t));
    ok(s.stripes >= 0 && s.stripes <= T.MAX_COUNT && s.dots >= 0 && s.dots <= T.MAX_COUNT, '條紋、圓點數在範圍內');
    if (Math.round(s.hue) !== Math.round(t.hue)) { const dh = Math.abs(((s.hue - t.hue + 540) % 360) - 180); ok(dh >= T.hueDelta(lv) - 1e-6 || Math.abs(dh - 180) >= 0, '色相差夠大'); }
  });
  ok(q.socks[0].spin === 0 && q.socks.slice(1).every(s => Math.abs(s.spin) >= T.spinAt(lv) * 0.75 - 1e-9 && Math.abs(s.spin) <= T.spinAt(lv) * 1.25 + 1e-9 && s.dur > 0 && s.delay <= 0), '只有目標不轉，其餘轉速在 ±25% 內、都有負的延遲（起始角度）');
}
// 轉的方向兩種都有
let cw = 0, ccw = 0; for (let k = 0; k < 200; k++) T.makeLevel(10, rnd).socks.slice(1).forEach(s => s.spin > 0 ? cw++ : ccw++);
ok(cw > 400 && ccw > 400, '順逆時針都有：' + cw + '/' + ccw);
// SVG：不同 uid 的 clipPath id 不重複、含條紋與圓點
const svg = T.sockSvg({ hue: 120, stripes: 3, dots: 2 }, 'x1');
ok(/id="twx1"/.test(svg) && (svg.match(/height="3.6"/g) || []).length === 3 && (svg.match(/r="3.6"/g) || []).length === 2, 'SVG 條紋 3、圓點 2');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
