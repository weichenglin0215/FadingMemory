// 缺哪一張（mahjong3，企劃 231）的純函式檢查：分組判定、答案唯一、誘餌牌、牌數／限時／誘餌數線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_mahjong3.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261104), rnd = rng(SEED);

// ── 難度 ──
ok(T.tilesFor(1) === 5 && T.tilesFor(T.RAMP_LEVELS) === 14 && T.tilesFor(99) === 14, '手牌數 5 → 14（第 ' + T.RAMP_LEVELS + ' 關到頂）');
for (let l = 1; l <= 60; l++) { const t = T.tilesFor(l); ok([5, 8, 11, 14].includes(t), '手牌數只會是 5、8、11、14：第 ' + l + ' 關 ' + t); if (l > 1) ok(t >= T.tilesFor(l - 1), '手牌數單調'); }
console.log('手牌數：' + [1, 4, 7, 10, 13, 16, 19, 22, 24].map(l => '第' + l + '關 ' + T.tilesFor(l)).join('　'));
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S);
ok(T.decoysFor(1) === T.DECOYS[0] && T.decoysFor(T.RAMP_LEVELS) === T.DECOYS[1], '誘餌牌數 ' + T.DECOYS);
for (let l = 2; l <= 60; l++) ok(T.timeMs(l) <= T.timeMs(l - 1) && T.decoysFor(l) >= T.decoysFor(l - 1), '單調 ' + l);
// ── 分組判定 ──
const can = tiles => T.canGroup(T.countsOf(tiles));
ok(can([1, 1, 1]) && can([1, 2, 3]) && can([2, 3, 4, 5, 5, 5]) && can([]) && can([1, 1, 1, 2, 3, 4]), '能分組：三張一樣、連號、混合');
ok(!can([1, 1, 2]) && !can([1, 2, 4]) && !can([2, 2, 3, 3, 4]) && !can([1, 2, 3, 5, 6]) && !can([8, 9, 9]), '不能分組');
ok(can([2, 2, 3, 3, 4, 4]) && !can([2, 2, 3, 3, 4, 5]) && can([1, 2, 3, 3, 4, 5]) && can([3, 3, 3, 4, 4, 4]) && can([7, 8, 9, 7, 8, 9]), '重複的連號：2 2 3 3 4 4 ＝ 234 ＋ 234');
{ const g = T.groupsOf(T.countsOf([1, 1, 1, 2, 3, 4])); ok(g && g.length === 2 && g.every(x => (x[0] === x[1] && x[1] === x[2]) || (x[1] === x[0] + 1 && x[2] === x[0] + 2)), 'groupsOf 回傳合法的組'); ok(T.groupsOf(T.countsOf([1, 1, 2])) === null, '分不完 → null'); }
// 窮舉比對：隨機 6 張牌，canGroup 與「暴力列舉兩組」一致
function brute6(t) { const s = t.slice().sort((a, b) => a - b); const sets = []; for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++) { const tri = [s[a], s[b], s[c]], rest = s.filter((_, i) => i !== a && i !== b && i !== c); const isSet = x => (x[0] === x[1] && x[1] === x[2]) || (x[1] === x[0] + 1 && x[2] === x[0] + 2); if (isSet(tri) && isSet(rest)) return true; } return false; }
for (let i = 0; i < 4000; i++) { const t = []; for (let k = 0; k < 6; k++) t.push(1 + Math.floor(rnd() * 5)); ok(can(t) === brute6(t), 'canGroup 與暴力窮舉一致：' + t.join('')); }
// bestGroups
{ const r = T.bestGroups([1, 2, 3, 5, 9]); ok(r.n === 1 && r.left.join() === '5,9', 'bestGroups：123 一組，剩 5、9'); const r2 = T.bestGroups([2, 3, 3, 4, 5, 5, 6, 7, 7]); ok(r2.n === 2 || r2.n === 3, 'bestGroups 至少 2 組'); const r3 = T.bestGroups([4, 4, 4, 6, 7], 4); ok(r3.n === 1 && r3.groups[0].includes(4), 'bestGroups(must)：補的那張要有參加'); const r4 = T.bestGroups([1, 5, 9], 5); ok(r4.n === -1, '補的那張湊不進任何組 → n＝−1'); }
// ── 整關 ──
const decoyStats = {};
for (let i = 0; i < 600; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd), m = T.tilesFor(lv), g = (m + 1) / 3;
  ok(q.hand.length === m && q.tiles === m && q.hand.every(t => t >= 1 && t <= 9), '第 ' + lv + ' 關：' + m + ' 張牌、都是 1～9');
  ok(q.hand.every((t, k) => !k || q.hand[k - 1] <= t), '手牌已排序');
  ok(T.winners(q.hand).join() === String(q.answer), '第 ' + lv + ' 關：答案唯一（' + T.winners(q.hand).join(',') + ' vs ' + q.answer + '）');
  const full = q.hand.concat([q.answer]), c = T.countsOf(full);
  ok(c.every(n => n <= T.MAX_SAME), '同一個數字最多 ' + T.MAX_SAME + ' 張');
  ok(q.groups.length === g && q.groups.every(x => (x[0] === x[1] && x[1] === x[2]) || (x[1] === x[0] + 1 && x[2] === x[0] + 2)), '附的分組合法、組數 ' + g);
  ok(q.groups.reduce((a, x) => a.concat(x), []).sort((a, b) => a - b).join() === full.sort((a, b) => a - b).join(), '分組剛好用掉全部的牌');
  ok(q.near.length >= T.decoysFor(lv) && q.near.every(y => y !== q.answer && T.bestGroups(q.hand.concat([y]), y).n >= g - 1), '第 ' + lv + ' 關：誘餌牌 ' + q.near.length + ' ≥ ' + T.decoysFor(lv));
  decoyStats[lv] = (decoyStats[lv] || 0) + q.near.length;
}
// 答案位置（補哪一張）要平均：統計 600 題的答案分布
{ const cnt = {}; for (let i = 0; i < 1500; i++) { const q = T.makeLevel(1 + (i % 30), rnd); cnt[q.answer] = (cnt[q.answer] || 0) + 1; } const vals = Object.values(cnt); ok(Object.keys(cnt).length === 9 && Math.min(...vals) > 1500 / 9 * 0.45, '答案 1～9 都會出現、不偏：' + JSON.stringify(cnt)); }
// layout：補的牌放進排序後的位置
{ const L = T.layout([2, 3, 3, 4, 5, 5, 6, 7], 4, [[2, 3, 4], [3, 4, 5], [5, 6, 7]]); ok(L.tiles.join('') === '233445567' && L.addedIdx === 4 && L.groupIdx.length === 3 && L.groupIdx.every(g => g.length === 3) && new Set([].concat(...L.groupIdx)).size === 9, 'layout：排序、補的位置、分組位置不重複'); }
// 效能
{ const t0 = Date.now(); for (let i = 0; i < 100; i++) T.makeLevel(20 + (i % 10), rnd); const per = (Date.now() - t0) / 100; console.log('最高難度出題平均 ' + per.toFixed(2) + ' 毫秒'); ok(per < 100, '出題夠快：' + per.toFixed(2)); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_mahjong3.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 2800/.test(src) && /mj3-tile--left/.test(src), '失敗停格 2 秒以上、湊不起來的牌標紅');
  ok(/\.mj3-tile--left \{ border-color: var\(--c-bad-light\);/.test(css) && /\.mj3-tile--g0 \{ border-color: var\(--mj3-g0\);/.test(css), '紅色與分組色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_mahjong3.js'") > 0, 'boot.js 有載入');
  ok(/補哪一張/.test(G.rule) && /三張連號/.test(G.rule), '玩法說明寫了規則'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
