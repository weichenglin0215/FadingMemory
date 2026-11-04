// 換一張就平（swapeven，企劃 252）的純函式檢查：交換後總和的算式、答案唯一、誘餌、難度線性、有界分割
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_swapeven.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261107), rnd = rng(SEED);

// ── 難度 ──
ok(T.cardsFor(1) === T.CARDS[0] && T.cardsFor(T.RAMP_LEVELS) === T.CARDS[1] && T.cardsFor(99) === T.CARDS[1], '每排牌數 ' + T.CARDS);
ok(T.vmaxFor(1) === T.VMAX[0] && T.vmaxFor(T.RAMP_LEVELS) === T.VMAX[1], '數字上限 ' + T.VMAX);
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S);
ok(T.halfRange(1).join() === '3,3' && T.halfRange(T.RAMP_LEVELS).join() === T.HALF_MIN[1] + ',' + T.HALF_MAX[1], '差的一半範圍：第 1 關固定 3（兩排差 6）');
ok(T.fullDecoysFor(1) === T.FULL_DECOYS[0] && T.revDecoysFor(T.RAMP_LEVELS) === T.REV_DECOYS[1], '誘餌對數');
for (let l = 2; l <= 60; l++) ok(T.cardsFor(l) >= T.cardsFor(l - 1) && T.vmaxFor(l) >= T.vmaxFor(l - 1) && T.timeMs(l) <= T.timeMs(l - 1) && T.halfRange(l)[1] >= T.halfRange(l - 1)[1] && T.halfRange(l)[0] <= T.halfRange(l - 1)[0], '單調 ' + l);
{ const d = []; for (let l = 2; l <= T.RAMP_LEVELS; l++) d.push(T.vmaxFor(l) - T.vmaxFor(l - 1)); ok(Math.max(...d) - Math.min(...d) <= 1, '數字上限線性成長：每關 +' + Math.min(...d) + '～' + Math.max(...d)); }

// ── 算式 ──
{ // 題目範例：上 43、下 37（差 6）→ 要找「上比下大 3」的一對
  const A = [20, 13, 10], B = [18, 12, 7];
  ok(T.sum(A) === 43 && T.sum(B) === 37, '範例總和 43／37');
  ok(T.gapAfter(A, B, 1, 2) === 43 - 37 - 2 * (13 - 7) && T.gapAfter(A, B, 1, 2) === -6, '換 13 和 7（差 6）：兩排差變成 −6（越換越遠，經典錯誤）');
  ok(T.gapAfter(A, B, 0, 1) === 6 - 2 * 8, '換 20 和 12：算式 gap = 6 − 2×8');
  // 差 3 的對：(20,?) 沒有 17；(13,10)沒有；(10,7) → 10 − 7 = 3 ✓
  const ans = T.answers(A, B); ok(ans.length === 1 && ans[0].i === 2 && ans[0].j === 2, '答案是換 10 和 7（差 3＝差的一半）：' + JSON.stringify(ans));
  // 實際交換驗證
  const A2 = A.slice(), B2 = B.slice(); const t = A2[2]; A2[2] = B2[2]; B2[2] = t; ok(T.sum(A2) === 40 && T.sum(B2) === 40, '實際交換後兩排都是 40（43 → 40、37 → 40）'); }
{ // 反方向的差 3（下比上大 3）：越換越遠
  const A = [10, 8, 6], B = [9, 7, 4]; ok(T.sum(A) - T.sum(B) === 4, '範例 2 差 4'); ok(T.countDiff(A, B, 2) >= 1, 'countDiff 找得到差 2 的對'); ok(T.countDiff([5, 5], [3, 2], 2) === 2 && T.countDiff([5, 5], [3, 2], 3) === 2 && T.countDiff([5, 5], [3, 2], 1) === 0, 'countDiff 數得出重複的牌值（兩張 5 各配一次）'); }
// 同值的牌（兩張一樣）會造成兩組答案 → answers 會數出 2 個，makeLevel 不會出這種題
{ const A = [8, 8, 5], B = [5, 4, 4]; ok(T.sum(A) - T.sum(B) === 8 && T.answers(A, B).length >= 2, '同值的牌讓答案變兩組（要避免）：' + T.answers(A, B).length); }
// composition：總和剛好、每個都在 1～V
for (let i = 0; i < 2000; i++) { const V = 2 + Math.floor(rnd() * 40), n = 1 + Math.floor(rnd() * 7), tot = n + Math.floor(rnd() * (n * V - n + 1)); const c = T.composition(tot, n, V, rnd); ok(c && c.length === n && c.reduce((a, b) => a + b, 0) === tot && c.every(x => x >= 1 && x <= V), 'composition(' + tot + ',' + n + ',' + V + ')：' + JSON.stringify(c)); }
ok(T.composition(5, 3, 1, rnd) === null && T.composition(2, 3, 9, rnd) === null && T.composition(28, 3, 9, rnd) === null, '不可能的分割回傳 null');
{ const c = T.composition(27, 3, 9, rnd); ok(c.join() === '9,9,9', '總和＝上限×個數：只有一種分法'); const c2 = T.composition(3, 3, 9, rnd); ok(c2.join() === '1,1,1', '總和＝個數：全是 1'); }

// ── 整關 ──
let total = 0, signs = { pos: 0, neg: 0 }, fullHit = 0, revHit = 0, rowsCount = {};
for (let i = 0; i < 1500; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  const hr = T.halfRange(lv), V = T.vmaxFor(lv), k = T.cardsFor(lv);
  ok(q.A.length === k && q.B.length === k, '第 ' + lv + ' 關：每排 ' + k + ' 張');
  ok(q.A.concat(q.B).every(v => Number.isInteger(v) && v >= 1 && v <= V), '第 ' + lv + ' 關：數字都在 1～' + V);
  ok(q.sA === T.sum(q.A) && q.sB === T.sum(q.B) && q.sA - q.sB === 2 * q.half && q.half !== 0, '總和對得上：差 = 2×差的一半');
  const ans = T.answers(q.A, q.B);
  ok((k === 2 ? ans.length === 2 : ans.length === 1) && ans[0].i === q.ans.i && ans[0].j === q.ans.j && JSON.stringify(ans) === JSON.stringify(q.all), '第 ' + lv + ' 關：答案唯一（每排 2 張時剛好 2 組）（' + JSON.stringify(ans) + '）');
  ok(q.A[q.ans.i] - q.B[q.ans.j] === q.half, '答案那一對的差正好是「差的一半」');
  const A2 = q.A.slice(), B2 = q.B.slice(); const t = A2[q.ans.i]; A2[q.ans.i] = B2[q.ans.j]; B2[q.ans.j] = t; ok(T.sum(A2) === T.sum(B2), '實際交換後兩排總和一樣');
  const hh = Math.abs(q.half); ok(hh >= Math.min(hr[0], V - 1) && hh <= Math.min(hr[1], V - 1) || q.k === 3 && q.V === 9, '差的一半 ' + hh + ' 在範圍 ' + hr + ' 內');
  if (lv === 1) ok(hh === 3 && Math.abs(q.sA - q.sB) === 6, '第 1 關：兩排差 6（差的一半 3）');
  ok(q.full === T.countDiff(q.A, q.B, 2 * q.half) && q.rev === T.countDiff(q.A, q.B, -q.half), '附的誘餌對數跟重算的一樣');
  if (q.half > 0) signs.pos++; else signs.neg++;
  if (2 * hh <= V - 1 && lv >= 2) { fullHit += q.full >= T.fullDecoysFor(lv) ? 1 : 0; }
  rowsCount[q.ans.i + ',' + q.ans.j] = (rowsCount[q.ans.i + ',' + q.ans.j] || 0) + 1;
}
console.log('上排比下排大的題 ' + signs.pos + '、小的題 ' + signs.neg + '；達成「差 2g 誘餌」目標的比例 ' + (100 * fullHit / total).toFixed(0) + '%');
ok(signs.pos > 500 && signs.neg > 500, '兩排誰大誰小各半');
ok(Object.keys(rowsCount).length >= 20, '答案牌的位置分散：' + Object.keys(rowsCount).length + ' 種位置組合');
// 整體誘餌：大部分題目都有達標（太難湊到時才放寬）
{ let hit = 0, n = 400; for (let i = 0; i < n; i++) { const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd), hh = Math.abs(q.half), V = T.vmaxFor(lv); if ((2 * hh > V - 1 || q.full >= T.fullDecoysFor(lv)) && q.rev >= T.revDecoysFor(lv)) hit++; } ok(hit / n > 0.9, '誘餌達標的比例 ' + (100 * hit / n).toFixed(0) + '%'); }
// 每排固定 2 張（使用者把 CARDS 設成 2）：不會變成 3 張的保底題，答案剛好 2 組（數學上一定是這樣）
{ const save = T.CARDS.slice(); T.CARDS[0] = 2; T.CARDS[1] = 2;
  let wrong = 0, notTwo = 0, n = 0; for (let lv = 1; lv <= 40; lv++) for (let i = 0; i < 40; i++) { const q = T.makeLevel(lv, rnd); n++; if (q.k !== 2 || q.A.length !== 2 || q.B.length !== 2) wrong++; if (q.all.length !== 2) notTwo++; }
  T.CARDS[0] = save[0]; T.CARDS[1] = save[1];
  ok(wrong === 0 && notTwo === 0, 'CARDS 設 2：每排一定是 2 張、剛好 2 組答案：不是 2 張 ' + wrong + '／' + n + '、答案不是 2 組 ' + notTwo + '／' + n); }
// 總和提示：HIDE_SUM_FROM（預設第 4 關起隱藏）
ok(T.HIDE_SUM_FROM === 4 && !T.hideSumAt(1) && !T.hideSumAt(3) && T.hideSumAt(4) && T.hideSumAt(30), '總和提示：第 1～3 關顯示，第 4 關起隱藏');
// 效能
for (const lv of [1, 6, 12, 24, 40]) { const t0 = Date.now(); let worst = 0; for (let i = 0; i < 100; i++) { const t1 = Date.now(); T.makeLevel(lv, rnd); worst = Math.max(worst, Date.now() - t1); } const per = (Date.now() - t0) / 100; console.log('第' + lv + '關 出題平均 ' + per.toFixed(2) + ' 毫秒、最慢 ' + worst); ok(per < 20 && worst < 200, '第 ' + lv + ' 關出題夠快：' + per.toFixed(2) + '／' + worst); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_swapeven.js'), css = rd('../../css/games/reaction_swapeven.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3600/.test(src) && /swapeven-card--ans/.test(src), '失敗停格 3 秒以上、綠框標出正確的牌');
  ok(/\.swapeven-card--ans \{[^}]*var\(--c-ok\)/.test(css) && /\.swapeven-bub--bad \{[^}]*var\(--c-bad/.test(css), '綠框、紅字用 CSS 變數');
  ok(src.includes('swapeven-bub--hide') && css.includes('.swapeven-bub--hide { visibility: hidden;') && src.includes('function showSums') && src.indexOf('showSums();') > 0, '隱藏總和：泡泡加 swapeven-bub--hide、交換後 showSums 再顯示');
  ok(src.includes('function fitFont') && src.includes('measureText') && src.includes('FILL_W') && src.includes('fontPx') && !src.includes('Math.round(cw * (q.V >= 10 ? 0.46 : 0.58)) + '), '數字字級：用真實字型量字寬、填滿答案卡（不再因為進位變兩位數就縮小）');
  ok(boot.indexOf("'js/reaction_swapeven.js'") > 0 && /差的一半/.test(G.rule), 'boot.js 有載入、玩法說明提到差的一半'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
