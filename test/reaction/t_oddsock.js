const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_oddsock.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// 難度曲線端點與線性
ok(near(T.hueDelta(1), 100) && near(T.hueDelta(T.RAMP_LEVELS), 15) && near(T.hueDelta(T.MAX_LEVEL), 15), '色相差端點');
ok(T.countDelta(1) === 3 && T.countDelta(T.RAMP_LEVELS) === 1, '數量差端點');
ok(T.timeMs(1) === 30000 && T.timeMs(T.RAMP_LEVELS) === 10000, '限時端點');
{ const d = T.hueDelta(1) - T.hueDelta(2); for (let l = 1; l < T.RAMP_LEVELS; l++) ok(near(T.hueDelta(l) - T.hueDelta(l + 1), d, 1e-9), '色相差線性 ' + l); }
// 出題：9 隻、四對相同＋1 隻落單，落單的和某一對只差一個參數、差的量符合關卡
const whatSeen = {};
for (let l = 1; l <= T.MAX_LEVEL; l++) for (let i = 0; i < 80; i++) {
  const q = T.makeLevel(l, rnd), s = q.socks;
  ok(s.length === 9 && q.odd >= 0 && q.odd < 9 && s[q.odd].isOdd, '9 隻、odd 索引正確');
  const groups = {}; s.forEach((x, k) => { const key = T.key(x); (groups[key] = groups[key] || []).push(k); });
  const sizes = Object.keys(groups).map(k => groups[k].length).sort();
  ok(sizes.join() === '1,2,2,2,2', '四對相同＋一隻落單：' + sizes.join());
  ok(groups[T.key(s[q.odd])].length === 1, '落單的那隻確實沒有伴');
  const m = q.mate, o = s[q.odd];
  const diffs = ['hue', 'stripes', 'dots'].filter(k => k === 'hue' ? hueDist(m.hue, o.hue) > 0.5 : m[k] !== o[k]);
  ok(diffs.length === 1 && diffs[0] === q.what, '只差一個參數：' + diffs.join() + ' vs ' + q.what);
  whatSeen[q.what] = (whatSeen[q.what] || 0) + 1;
  if (q.what === 'hue') ok(near(hueDist(m.hue, o.hue), T.hueDelta(l), 1e-6), '色相差 ' + hueDist(m.hue, o.hue) + ' ≈ ' + T.hueDelta(l));
  else { ok(Math.abs(m[q.what] - o[q.what]) === T.countDelta(l), '數量差 ' + Math.abs(m[q.what] - o[q.what]) + ' = ' + T.countDelta(l)); ok(o[q.what] >= 0 && o[q.what] <= T.MAX_COUNT, '數量在範圍內'); }
  // 其他幾組的底色色相互相至少相差 60°（看得出不同組）
  const hues = Object.keys(groups).filter(k => groups[k].length === 2).map(k => s[groups[k][0]].hue);
  for (let a = 0; a < hues.length; a++) for (let b = a + 1; b < hues.length; b++) ok(hueDist(hues[a], hues[b]) >= 60 - 1e-6, '四組底色相差至少 60°：' + hueDist(hues[a], hues[b]));
  s.forEach(x => ok(Math.abs(x.rot) <= 6 && Math.abs(x.dx) <= 6 && Math.abs(x.dy) <= 6, '旋轉與抖動範圍'));
}
ok(['hue', 'stripes', 'dots'].every(k => whatSeen[k] > 700), '三種差異都常出現 ' + JSON.stringify(whatSeen));
// 落單位置平均分布
{ const pos = new Array(9).fill(0); for (let i = 0; i < 4500; i++) pos[T.makeLevel(10, rnd).odd]++; ok(pos.every(c => c > 380 && c < 620), '落單位置平均：' + pos.join(',')); }
// SVG 字串
{ const v = T.sockSvg({ hue: 120, stripes: 3, dots: 4 }, 'x1'); ok(/^<svg/.test(v) && /clipPath id="skx1"/.test(v) && (v.match(/<circle/g) || []).length === 4 + 2 && (v.match(/height="3\.6"/g) || []).length === 3, 'SVG：3 條紋、4 圓點＋2 補丁'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(9) && T.rating(9) !== T.rating(16) && T.rating(16) !== T.rating(26), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
