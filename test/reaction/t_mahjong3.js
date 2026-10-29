// 缺哪一張（mahjong3，企劃 231）的純函式檢查：分組判定（含一對）、答案不只一張、死牌（一種牌最多 4 張）、誘餌牌、牌數／答案數／限時／誘餌數線性
// V1.36.0：改成「聽牌」玩法——補哪些牌都行，要全部找出來；高關卡有「一對」（真正的麻將聽牌）
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_mahjong3.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261104), rnd = rng(SEED);

// ── 難度 ──
ok(T.tilesFor(1, false) === 5 && T.tilesFor(T.RAMP_LEVELS, false) === 14 && T.tilesFor(999, false) === 14, '沒有一對：手牌數 5 → 14（第 ' + T.RAMP_LEVELS + ' 關到頂）');
ok(T.tilesFor(1, true) === 4 && T.tilesFor(T.RAMP_LEVELS, true) === 13 && T.tilesFor(999, true) === 13, '有一對：手牌數 4 → 13');
for (let l = 1; l <= 90; l++) {
  const a = T.tilesFor(l, false), b = T.tilesFor(l, true);
  ok([5, 8, 11, 14].includes(a), '沒有一對的手牌數只會是 5、8、11、14：第 ' + l + ' 關 ' + a);
  ok([4, 7, 10, 13].includes(b), '有一對的手牌數只會是 4、7、10、13：第 ' + l + ' 關 ' + b);
  if (l > 1) ok(a >= T.tilesFor(l - 1, false) && b >= T.tilesFor(l - 1, true), '手牌數單調');
}
console.log('手牌數（無對／有對）：' + [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 30].map(l => '第' + l + '關 ' + T.tilesFor(l, false) + '/' + T.tilesFor(l, true)).join('　'));
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S);
ok(T.decoysFor(1) === T.DECOYS[0] && T.decoysFor(T.RAMP_LEVELS) === T.DECOYS[1], '誘餌牌數 ' + T.DECOYS);
ok(T.answersFor(1, true) === T.ANSWERS[0] && T.answersFor(T.RAMP_LEVELS, true) === T.ANSWERS[1] && T.answersFor(T.RAMP_LEVELS, false) === 3, '答案張數 ' + T.ANSWERS + '（沒有一對的題目最多 3 張）');
for (let l = 2; l <= 90; l++) ok(T.timeMs(l) >= T.timeMs(l - 1) && T.decoysFor(l) >= T.decoysFor(l - 1) && T.answersFor(l, true) >= T.answersFor(l - 1, true), '單調 ' + l);
ok(T.pairProb(T.PAIR_FROM - 1) === 0 && T.pairProb(T.PAIR_FROM) >= T.PAIR_P[0] && Math.abs(T.pairProb(T.RAMP_LEVELS) - T.PAIR_P[1]) < 1e-9 && Math.abs(T.pairProb(999) - T.PAIR_P[1]) < 1e-9, '有一對的題目：第 ' + T.PAIR_FROM + ' 關以前沒有，之後機率升到 ' + T.PAIR_P[1] + '（第 ' + T.RAMP_LEVELS + ' 關到頂）');
for (let l = T.PAIR_FROM + 1; l <= 60; l++) ok(T.pairProb(l) >= T.pairProb(l - 1), '有一對的機率單調：第 ' + l + ' 關');
// ── 分組判定 ──
const can = (tiles, pair) => T.canGroup(T.countsOf(tiles), pair);
ok(can([1, 1, 1]) && can([1, 2, 3]) && can([2, 3, 4, 5, 5, 5]) && can([]) && can([1, 1, 1, 2, 3, 4]), '能分組：三張一樣、連號、混合');
ok(!can([1, 1, 2]) && !can([1, 2, 4]) && !can([2, 2, 3, 3, 4]) && !can([1, 2, 3, 5, 6]) && !can([8, 9, 9]), '不能分組');
ok(can([2, 2, 3, 3, 4, 4]) && !can([2, 2, 3, 3, 4, 5]) && can([1, 2, 3, 3, 4, 5]) && can([3, 3, 3, 4, 4, 4]) && can([7, 8, 9, 7, 8, 9]), '重複的連號：2 2 3 3 4 4 ＝ 234 ＋ 234');
// 有一對：整排要分成若干組三張，再「剛好」留一對
ok(can([5, 5], true) && can([1, 2, 3, 5, 5], true) && can([2, 2, 2, 3, 4], true), '有一對：5 5 ／ 1 2 3 ＋ 對 5 5 ／ 對 2 2 ＋ 2 3 4');
ok(!can([1, 2, 3], true) && !can([5, 5, 5], true) && !can([1, 1, 3, 3, 5, 5, 7, 7], true) && can([5, 5, 5, 5, 5], true), '有一對時：只有組、沒有對 → 不行（1 2 3、5 5 5）；四個對子湊不成組 → 不行（1 1 3 3 5 5 7 7）；5 5 5 5 5 ＝ 555 ＋ 對 55');
ok(can([1, 1, 1, 2, 3, 4, 5, 5], true) && can([2, 3, 4, 4, 4], true) && can([2, 3, 4, 5, 6, 7, 8, 8], true) && !can([2, 3, 4, 4, 4, 5, 6, 7, 8, 8], true), '有一對：111 ＋ 234 ＋ 對 55；234 ＋ 對 44 ＋ 4 湊不成（4 4 4 是三張一樣不是一對）；234 567 ＋ 對 88');
// 窮舉比對：隨機 6 張牌，canGroup 與「暴力列舉兩組」一致；隨機 5 張牌（有一對）與暴力一致
function isSet3(x) { return (x[0] === x[1] && x[1] === x[2]) || (x[1] === x[0] + 1 && x[2] === x[0] + 2); }
function brute6(t) { const s = t.slice().sort((a, b) => a - b); for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++) { const tri = [s[a], s[b], s[c]], rest = s.filter((_, i) => i !== a && i !== b && i !== c); if (isSet3(tri) && isSet3(rest)) return true; } return false; }
function brute5p(t) { const s = t.slice().sort((a, b) => a - b); for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) { if (s[a] !== s[b]) continue; const rest = s.filter((_, i) => i !== a && i !== b); if (isSet3(rest)) return true; } return false; }
for (let i = 0; i < 4000; i++) { const t = []; for (let k = 0; k < 6; k++) t.push(1 + Math.floor(rnd() * 5)); ok(can(t) === brute6(t), 'canGroup 與暴力窮舉一致：' + t.join('')); }
for (let i = 0; i < 4000; i++) { const t = []; for (let k = 0; k < 5; k++) t.push(1 + Math.floor(rnd() * 5)); ok(can(t, true) === brute5p(t), 'canGroup（一對）與暴力窮舉一致：' + t.join('')); }
// groupsOf／countWays
{ const g = T.groupsOf(T.countsOf([1, 1, 1, 2, 3, 4]), false); ok(g && g.pair === 0 && g.groups.length === 2 && g.groups.every(isSet3), 'groupsOf 回傳合法的組'); ok(T.groupsOf(T.countsOf([1, 1, 2]), false) === null, '分不完 → null');
  const gp = T.groupsOf(T.countsOf([1, 2, 3, 5, 5]), true); ok(gp && gp.pair === 5 && gp.groups.length === 1 && gp.groups[0].join() === '1,2,3', 'groupsOf（一對）：123 ＋ 對 55');
  ok(T.countWays(T.countsOf([2, 3, 4, 4, 5, 6]), false) === 1 && T.countWays(T.countsOf([1, 1, 1, 2, 2, 2, 3, 3, 3]), false) === 2, 'countWays：234 ＋ 456 只有 1 種；111 222 333 與 123 123 123 共 2 種');
  ok(T.countWays(T.countsOf([1, 1, 1, 2, 3]), true) === 1 && T.countWays(T.countsOf([1, 1, 1, 2, 2, 2, 3, 3]), true) === 1 && T.countWays(T.countsOf([1, 1, 3, 3, 5, 5, 7, 7]), true) === 0 && T.countWays(T.countsOf([1, 1, 2, 2, 3, 3, 4, 4]), true) >= 2, 'countWays（一對）：11＋123、111 222＋對 33 各 1 種；1 1 3 3 5 5 7 7 沒有分法；1 1 2 2 3 3 4 4 有好幾種（對 11＋234 234、對 44＋123 123…）'); }
// 窮舉比對：countWays ≥ 1 ⇔ canGroup
for (let i = 0; i < 3000; i++) { const n = 5 + Math.floor(rnd() * 5), t = []; for (let k = 0; k < n; k++) t.push(1 + Math.floor(rnd() * 4)); const pr = rnd() < 0.5; ok((T.countWays(T.countsOf(t), pr) > 0) === can(t, pr), 'countWays 與 canGroup 一致：' + t.join('') + (pr ? '＋對' : '')); }
// bestGroups
{ const r = T.bestGroups([1, 2, 3, 5, 9]); ok(r.n === 1 && r.left.join() === '5,9', 'bestGroups：123 一組，剩 5、9'); const r2 = T.bestGroups([2, 3, 3, 4, 5, 5, 6, 7, 7]); ok(r2.n === 2 || r2.n === 3, 'bestGroups 至少 2 組'); const r3 = T.bestGroups([4, 4, 4, 6, 7], 4); ok(r3.n === 1 && r3.groups[0].includes(4), 'bestGroups(must)：補的那張要有參加'); const r4 = T.bestGroups([1, 5, 9], 5); ok(r4.n === -1, '補的那張湊不進任何組 → n＝−1'); }
// ── winners：不只一張答案；已經有 4 張的牌不能補（死牌） ──
ok(T.winners([2, 3, 4, 5, 6], false).join() === '1,4,7', '2 3 4 5 6 → 補 1、4、7（使用者舉的例子）');
ok(T.winners([1, 1, 1, 2, 3], false).join() === '1,4', '1 1 1 2 3 → 補 1、4');
{ const lotus = [1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9]; ok(T.winners(lotus, true).join() === '1,2,3,4,5,6,7,8,9', '九蓮寶燈 1112345678999：補 1～9 任何一張都行（聽 9 張，這是清一色最多的聽牌）；實際：' + T.winners(lotus, true).join(',')); }
// 死牌（一種牌最多 4 張）：手上 5 5 5 5 6 7 ＋ 對 8 8 ……：補第 5 張 5（5 5 5 ＋ 5 5 對）本來湊得起來，但手上已經有 4 張，規則上不能補
{ const hand = [5, 5, 5, 5, 6, 7]; const c5 = T.countsOf(hand); c5[5]++; ok(T.canGroup(c5, true) === false, '（先確認例子：5 5 5 5 5 6 7 這 7 張本身湊不起來，換下面這個）');
  const h2 = [3, 3, 3, 3, 4, 5]; /* 補 3：3 3 3 3 3 4 5 → 333 ＋ 對 33？ 4 5 湊不成 */
  const h3 = [5, 5, 5, 5, 6, 7, 8, 8]; const c3 = T.countsOf(h3); c3[5]++;
  ok(T.winners(h3, true).indexOf(5) < 0, '手上有 4 張 5：5 不能當答案（就算 5 5 5 5 5 在別的牌型裡湊得起來）');
  const h4 = [2, 2, 2, 2, 3, 4, 5, 6]; const c4 = T.countsOf(h4); c4[2]++;
  const dead = T.deadTraps(h4, false), win = T.winners(h4, false);
  ok(T.canGroup(c4, false) === (dead.indexOf(2) >= 0) && win.indexOf(2) < 0, '死牌陷阱：2 2 2 2 3 4 5 6 補第 5 張 2 湊不湊得起來，就看它在不在 deadTraps 裡；winners 絕不含死牌'); }
{ const hand = [1, 1, 1, 1, 2, 3, 4, 4, 4, 4, 5]; const cc = T.countsOf(hand); ok(T.deadTraps(hand, true).every(x => cc[x] >= T.MAX_SAME) && T.winners(hand, true).every(x => cc[x] < T.MAX_SAME), '死牌陷阱都是手上已有 4 張的牌；winners 絕不含死牌'); }
// 一個手工的死牌陷阱：1 1 1 1 2 3 → 補第 5 張 1 就是「111 ＋ 對 11 ＋ 2 3」？不行；改用 1 1 1 1 2 3 ＋ 對：手牌 1 1 1 1 2 3 4 5（8 張，無對 3k+2）：補 1 → 1 1 1 1 1 2 3 4 5 沒有分法。用程式找：
{ const hand = [1, 1, 1, 1, 2, 3], c5 = T.countsOf(hand); c5[1]++; ok(T.deadTraps(hand, true).indexOf(1) === (T.canGroup(c5, true) ? 0 : -1), 'deadTraps 與「補第 5 張能不能湊成」一致');
  const h2 = [1, 1, 1, 1, 2, 3, 4, 5]; const c6 = T.countsOf(h2); c6[1]++; ok(T.canGroup(c6, true) === false, '例子：1 1 1 1 2 3 4 5 補第 5 張 1 湊不成'); }
{ // 手工：2 2 2 2 3 4 → 補第 5 張 2：222 ＋ 對 22 ＋ 3 4？ 3 4 湊不成；3 3 4 4 5 5 …… 用程式找一個真的死牌手牌
  let hit = null; for (let a = 1; a <= 9 && !hit; a++) for (let b = 1; b <= 7 && !hit; b++) { const hand = [a, a, a, a, b, b + 1, b + 2]; const d = T.deadTraps(hand, true); if (d.indexOf(a) >= 0) hit = hand; }
  ok(hit, '找得到手工的死牌陷阱手牌：' + (hit || []).join('')); if (hit) { const a = hit[0], c = T.countsOf(hit); c[a]++; ok(T.canGroup(c, true) && T.winners(hit, true).indexOf(a) < 0, '它補第 5 張就湊得起來（死牌），但 winners 不含它'); } }
// 高關卡的題目裡真的會出現死牌陷阱（手上有 4 張、補第 5 張就湊得起來的牌），而且比例隨關卡增加
{ const frac = lv => { let d = 0, N = 300; for (let k = 0; k < N; k++) if (T.makeLevel(lv, rnd).dead.length) d++; return d / N; }; const f3 = frac(3), f10 = frac(10), f30 = frac(30); console.log('有死牌陷阱的題目比例：第 3 關 ' + (f3 * 100).toFixed(0) + '％、第 10 關 ' + (f10 * 100).toFixed(0) + '％、第 30 關 ' + (f30 * 100).toFixed(0) + '％');
  ok(f30 >= 0.3 && f30 > f3, '第 30 關至少 3 成的題目有死牌陷阱，比第 3 關多'); ok(T.deadProb(T.DEAD_FROM - 1) === 0 && T.deadProb(T.RAMP_LEVELS) > T.deadProb(T.DEAD_FROM), '死牌陷阱的機率：第 ' + T.DEAD_FROM + ' 關起，越後面越高'); }
// ── 整關 ──
const stat = {}, kinds = { pairs: 0, nopair: 0 }, byAnswers = {};
for (let i = 0; i < 700; i++) {
  const lv = 1 + (i % 45), q = T.makeLevel(lv, rnd), g = q.pair ? (q.tiles - 1) / 3 : (q.tiles + 1) / 3;
  kinds[q.pair ? 'pairs' : 'nopair']++;
  ok(q.pair ? lv >= T.PAIR_FROM : true, '第 ' + T.PAIR_FROM + ' 關以前沒有一對的題目');
  ok(q.tiles === T.tilesFor(lv, q.pair) && q.hand.length === q.tiles && q.hand.every(t => t >= 1 && t <= 9), '第 ' + lv + ' 關：' + q.tiles + ' 張牌、都是 1～9');
  ok(q.hand.every((t, k) => !k || q.hand[k - 1] <= t), '手牌已排序');
  const win = T.winners(q.hand, q.pair);
  ok(win.join() === q.winners.join() && win.length >= 1, '第 ' + lv + ' 關：winners 與題目附的一致且至少一張（' + win.join(',') + '）');
  ok(win.length <= T.answersFor(lv, q.pair) && win.length >= Math.max(1, T.answersFor(lv, q.pair) - 3), '第 ' + lv + ' 關：答案 ' + win.length + ' 張（目標 ' + T.answersFor(lv, q.pair) + '，最多放寬 3 張）');
  byAnswers[lv] = byAnswers[lv] || []; byAnswers[lv].push(win.length);
  const bc = T.countsOf(q.hand);
  ok(bc.every(n => n <= T.MAX_SAME), '手牌每個數字最多 ' + T.MAX_SAME + ' 張');
  win.forEach(w => { ok(bc[w] < T.MAX_SAME, '答案不是死牌'); const c2 = bc.slice(); c2[w]++; ok(c2.every(n => n <= T.MAX_SAME), '補了之後每個數字最多 ' + T.MAX_SAME + ' 張'); const r = T.groupsOf(c2, q.pair); ok(r && r.groups.length === g && r.groups.every(isSet3) && (q.pair ? r.pair > 0 : r.pair === 0), '答案 ' + w + ' 可以分成 ' + g + ' 組' + (q.pair ? '＋一對' : '')); });
  for (let x = 1; x <= 9; x++) if (!win.includes(x) && bc[x] < T.MAX_SAME) { const c2 = bc.slice(); c2[x]++; ok(!T.canGroup(c2, q.pair), '非答案的牌 ' + x + ' 湊不起來'); }
  ok(q.near.length >= T.decoysFor(lv) && q.near.every(y => !win.includes(y) && bc[y] < T.MAX_SAME && T.bestGroups(q.hand.concat([y]), y).n >= g - 1), '第 ' + lv + ' 關：誘餌牌 ' + q.near.length + ' ≥ ' + T.decoysFor(lv));
  ok(q.dead.every(x => bc[x] >= T.MAX_SAME && !win.includes(x)), '死牌陷阱都是手上已有 ' + T.MAX_SAME + ' 張的牌');
  ok(q.ways >= win.length, '分法數 ≥ 答案數');
}
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
console.log('出題：有一對 ' + kinds.pairs + ' 題、沒有一對 ' + kinds.nopair + ' 題；各關平均答案張數：' + [1, 3, 6, 10, 15, 20, 30, 40].map(l => '第' + l + '關 ' + avg(byAnswers[l]).toFixed(1)).join('　'));
ok(avg(byAnswers[1]) === 1 && avg(byAnswers[30]) > avg(byAnswers[6]) && avg(byAnswers[30]) >= 3, '答案張數隨關卡增加：第 1 關全是 1 張、第 30 關平均 ≥ 3 張');
// 前面的關卡只有沒有一對的題目；高關卡有一對的題目是多數
{ let early = 0; for (let k = 0; k < 200; k++) if (T.makeLevel(1 + (k % 3), rnd).pair) early++; ok(early === 0, '第 1～3 關沒有一對的題目'); let late = 0; for (let k = 0; k < 300; k++) if (T.makeLevel(30, rnd).pair) late++; ok(late >= 300 * 0.7, '第 30 關有一對的題目是多數：' + late + '／300'); }
// 例子：使用者說的 2 3 4 5 6 → 1、4、7：第 1～3 關附近的題目也可以出現連號的多張答案
{ let multi = 0, N = 300; for (let k = 0; k < N; k++) { const q = T.makeLevel(12, rnd, false); if (q.winners.length >= 2) multi++; } ok(multi >= N * 0.5, '第 12 關（沒有一對）過半的題目有 2 張以上的答案：' + multi + '／' + N); }
// 強制模式
{ ok(T.makeLevel(10, rnd, true).pair === true && T.makeLevel(10, rnd, false).pair === false, 'forcePair 可以強制有沒有一對'); }
// layout：補的牌放進排序後的位置
{ const L = T.layout([2, 3, 3, 4, 5, 5, 6, 7], 4, [[2, 3, 4], [3, 4, 5], [5, 6, 7]]); ok(L.tiles.join('') === '233445567' && L.addedIdx === 4 && L.groupIdx.length === 3 && L.groupIdx.every(g => g.length === 3) && new Set([].concat(...L.groupIdx)).size === 9, 'layout：排序、補的位置、分組位置不重複'); }
// decompText
{ ok(T.decompText([2, 3, 4, 5, 6], 1, false) === '一二三　四五六' && T.decompText([1, 2, 3, 5], 5, true) === '一二三　對 五五', 'decompText：沒有一對／有一對'); }
// 效能
{ for (const [lv, name] of [[8, '第 8 關'], [30, '第 30 關'], [60, '第 60 關']]) { const t0 = Date.now(); for (let i = 0; i < 40; i++) T.makeLevel(lv, rnd); const per = (Date.now() - t0) / 40; console.log(name + ' 出題平均 ' + per.toFixed(1) + ' 毫秒'); ok(per < 200, name + ' 出題夠快：' + per.toFixed(1)); } }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_mahjong3.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3200/.test(src) && /mj3-tile--left/.test(src), '失敗停格 2 秒以上、湊不起來的牌標紅');
  ok(/\.mj3-tile--left \{ border-color: var\(--c-bad-light\);/.test(css) && /\.mj3-tile--g0 \{ border-color: var\(--mj3-g0\);/.test(css), '紅色與分組色用 CSS 變數');
  ok(/\.mj3-key--sel \{ border-color: var\(--c-orange\);/.test(css) && /\.mj3-key--miss \{ border: 3px dashed var\(--c-orange\);/.test(css) && /\.mj3-go \{/.test(css), '已選、漏掉的牌鍵與「我選好了」都有樣式（顏色用變數）');
  ok(/我選好了/.test(src) && /go\.disabled = n === 0/.test(src), '「我選好了」一張都沒選時按不下去');
  ok(boot.indexOf("'js/reaction_mahjong3.js'") > 0, 'boot.js 有載入');
  ok(/補哪些牌/.test(G.rule) && /三張連號/.test(G.rule) && /全部點起來/.test(G.rule) && /一對/.test(G.rule) && /最多 4 張/.test(G.rule), '玩法說明寫了規則（全部找出來、一對、4 張上限）'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
