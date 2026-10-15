const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_oddsock.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261014); const rnd = rng(SEED);
const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_oddsock.js'), 'utf8');

// V1.27：刪除色相差；底色是彩虹七色；第 1～5 關 3 種底色、6～10 關 2 種、11 關起 1 種；每隻襪子角度不同；L 形
ok(src.indexOf('HUE_DELTA') < 0 && src.indexOf('hueDelta') < 0 && T.hueDelta === undefined, '已經刪除 HUE_DELTA／色相差');
ok(T.RAINBOW.length === 7 && T.RAINBOW.map(c => c[0]).join('') === '紅橙黃綠藍靛紫' && new Set(T.RAINBOW.map(c => c[1])).size === 7, '彩虹七色');
for (let l = 1; l <= T.MAX_LEVEL; l++) ok(T.colorCountAt(l) === (l <= 5 ? 3 : (l <= 10 ? 2 : 1)), '第 ' + l + ' 關底色種類數 ' + T.colorCountAt(l));
// 難度曲線：條紋／圓點數差、限時（玩家自己調過 TIME_S）
ok(T.countDelta(1) === T.COUNT_DELTA[0] && T.countDelta(T.RAMP_LEVELS) === T.COUNT_DELTA[1], '數量差端點');
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時端點 ' + T.TIME_S);
// 旋轉角度：九隻都不一樣，彼此至少差 ROT_GAP 度
for (let i = 0; i < 2000; i++) { const r = T.makeRotations(rnd, 9); ok(r.length === 9 && r.every(a => a >= 0 && a < 360), '角度範圍'); for (let a = 0; a < 9; a++) for (let b = a + 1; b < 9; b++) ok(T.angDiff(r[a], r[b]) >= T.ROT_GAP - 1e-6, '任兩隻至少差 ' + T.ROT_GAP + ' 度：' + T.angDiff(r[a], r[b]).toFixed(1)); }
// 出題
const whatSeen = {};
for (let l = 1; l <= T.MAX_LEVEL; l++) for (let i = 0; i < 80; i++) {
  const q = T.makeLevel(l, rnd); ok(!!q, '一定出得了題'); const s = q.socks;
  ok(s.length === 9 && q.odd >= 0 && q.odd < 9 && s[q.odd].isOdd, '9 隻、odd 索引正確');
  const groups = {}; s.forEach((x, k) => { const key = T.key(x); (groups[key] = groups[key] || []).push(k); });
  const sizes = Object.keys(groups).map(k => groups[k].length).sort();
  ok(sizes.join() === '1,2,2,2,2', '四對相同＋一隻落單：' + sizes.join());
  ok(groups[T.key(s[q.odd])].length === 1, '落單的那隻確實沒有伴');
  // 底色：全部襪子的底色都在這一關選的幾種之內；種類數正確；落單的襪子底色跟它最像的那一對一樣
  const cs = new Set(s.map(x => x.ci)); ok(cs.size === T.colorCountAt(l) && [...cs].every(c => q.colors.indexOf(c) >= 0 && c >= 0 && c < 7), '第 ' + l + ' 關底色 ' + cs.size + ' 種');
  const m = q.mate, o = s[q.odd];
  ok(o.ci === m.ci, '落單襪子的底色與它最像的那一對相同');
  // 只差一個花紋參數（條紋數或圓點數），差的量符合關卡
  const diffs = ['stripes', 'dots'].filter(k => m[k] !== o[k]);
  ok(diffs.length === 1 && diffs[0] === q.what, '只差一個參數：' + diffs.join() + ' vs ' + q.what);
  ok(Math.abs(m[q.what] - o[q.what]) === T.countDelta(l), '數量差 ' + Math.abs(m[q.what] - o[q.what]) + ' = ' + T.countDelta(l));
  ok(o[q.what] >= 0 && o[q.what] <= T.MAX_COUNT, '數量在範圍內');
  whatSeen[q.what] = (whatSeen[q.what] || 0) + 1;
  // 四組花紋（條紋×圓點）互不相同
  const pk = Object.keys(groups).filter(k => groups[k].length === 2).map(k => s[groups[k][0]].stripes + '/' + s[groups[k][0]].dots); ok(new Set(pk).size === 4, '四組花紋互不相同');
  // 每一隻的角度都不同（至少差 ROT_GAP）、位置抖動範圍
  for (let a = 0; a < 9; a++) { ok(s[a].rot >= 0 && s[a].rot < 360 && Math.abs(s[a].dx) <= 6 && Math.abs(s[a].dy) <= 6, '旋轉與抖動範圍'); for (let b = a + 1; b < 9; b++) ok(T.angDiff(s[a].rot, s[b].rot) >= T.ROT_GAP - 1e-6, '每隻角度不同'); }
}
ok(['stripes', 'dots'].every(k => whatSeen[k] > 1200), '兩種差異都常出現 ' + JSON.stringify(whatSeen));
// 落單位置平均分布
{ const pos = new Array(9).fill(0); for (let i = 0; i < 4500; i++) pos[T.makeLevel(10, rnd).odd]++; ok(pos.every(c => c > 380 && c < 620), '落單位置平均：' + pos.join(',')); }
// 七種底色都會出現
{ const seen = new Set(); for (let i = 0; i < 400; i++) T.makeLevel(1, rnd).socks.forEach(x => seen.add(x.ci)); ok(seen.size === 7, '七種彩虹色都用得到'); }
// SVG 字串：L 形（腿在左、腳往右伸），條紋與圓點數、clipPath id
{ const v = T.sockSvg({ ci: 3, stripes: 3, dots: 4 }, 'x1'); ok(/^<svg/.test(v) && /clipPath id="skx1"/.test(v) && (v.match(/<circle/g) || []).length === 4 + 2 && (v.match(/height="3\.6"/g) || []).length === 3, 'SVG 結構：' + (v.match(/<circle/g) || []).length);
  const rects = v.match(/<rect x="\d+" y="\d+" width="\d+" height="\d+" rx="\d+"/g) || [], leg = rects[0].match(/\d+/g).map(Number), foot = rects[1].match(/\d+/g).map(Number);
  ok(leg[0] === foot[0] && foot[2] > leg[2] * 1.5 && foot[1] > leg[1] + 40, 'L 形：腿與腳的左邊切齊、腳比腿寬很多、腳在腿的下端（不是倒 T）：' + rects.slice(0, 2).join(' | '));
  ok(T.sockSvg({ ci: 0, stripes: 0, dots: 0 }, 'a') !== T.sockSvg({ ci: 4, stripes: 0, dots: 0 }, 'a'), '不同底色圖案不同'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(9) && T.rating(9) !== T.rating(16) && T.rating(16) !== T.rating(26), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
