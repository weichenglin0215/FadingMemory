const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_mergechar.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261028); const rnd = rng(SEED);

// 字庫完整性：每組三個單一字元、(左,右) 不重複、合成的字不重複、左右偏旁不是同一個字
ok(T.COMBOS.length >= 190, '字庫組數 ' + T.COMBOS.length);
const seenPair = new Set(), seenCh = new Set();
T.COMBOS.forEach(c => {
  ok([...c.l].length === 1 && [...c.r].length === 1 && [...c.ch].length === 1, '每格一個字 ' + c.l + c.r + c.ch);
  ok(!seenPair.has(c.l + c.r), '(左,右) 不重複 ' + c.l + c.r); seenPair.add(c.l + c.r);
  ok(!seenCh.has(c.ch), '合成的字不重複 ' + c.ch + '（' + c.l + c.r + '）'); seenCh.add(c.ch);
  ok(T.merge(c.l, c.r) === c.ch, 'merge 查得到');
  ok(c.ch !== c.l && c.ch !== c.r, '合成的字不等於偏旁本身');
});
ok(T.LEFTS.length >= 30 && T.RIGHTS.length >= 100, '左偏旁 ' + T.LEFTS.length + ' 種、右偏旁 ' + T.RIGHTS.length + ' 種');
ok(T.merge('氵', '工') === '江' && T.merge('木', '木') === '林' && T.merge('木', '目') === '相' && T.merge('工', '氵') === null && T.merge('氵', '木') === '沐', '範例');
// 難度：每欄偏旁數、限時
ok(T.colsFor(1) === 5 && T.colsFor(3) === 5 && T.colsFor(4) === 6 && T.colsFor(9) === 6 && T.colsFor(10) === 7 && T.colsFor(19) === 7 && T.colsFor(20) === 8 && T.colsFor(60) === 8, '每欄偏旁數');
ok(T.timeMs(1) === 45000 && T.timeMs(T.RAMP_LEVELS) === 26000 && T.timeMs(60) === 26000, '限時 45 → 26 秒');
for (let l = 2; l <= 60; l++) ok(T.timeMs(l) <= T.timeMs(l - 1), '限時單調');
ok(T.NEED === 5 && T.LIVES === 3, '五條綠線、三條命');
// 整關驗證：畫面上所有「左×右」組合，只有 5 組能合成字（答案唯一、沒有卡死的可能）
for (let i = 0; i < 3000; i++) {
  const lv = 1 + (i % 60), q = T.makeLevel(lv, rnd), n = T.colsFor(lv);
  ok(q.L.length === n && q.R.length === n, '每欄 ' + n + ' 塊');
  ok(new Set(q.L).size === n && new Set(q.R).size === n, '同一欄偏旁不重複');
  ok(q.L.every(l => !q.R.includes(l)), '左右兩欄沒有同一個偏旁');
  const edges = T.edgesOf(q.L, q.R);
  ok(edges.length === 5, '剛好 5 組能合成字：' + edges.length + ' ' + q.L.join('') + '/' + q.R.join(''));
  ok(q.pairs.length === 5 && q.pairs.every(p => edges.some(e => e.l === p.l && e.r === p.r && e.ch === p.ch)), '要連的 5 組就是那 5 組');
  ok(new Set(q.pairs.map(p => p.l)).size === 5 && new Set(q.pairs.map(p => p.r)).size === 5, '5 組的左、右偏旁各不相同（一對一）');
  ok(q.decoyL.length === n - 5 && q.decoyR.length === n - 5, '干擾偏旁數');
  ok(q.decoyL.every(l => !edges.some(e => e.l === l)) && q.decoyR.every(r => !edges.some(e => e.r === r)), '干擾偏旁沒有任何能合成的對象');
}
// 位置隨機：要連的左偏旁不是永遠排在固定的格子
const pos0 = new Set(); for (let i = 0; i < 300; i++) { const q = T.makeLevel(10, rnd); pos0.add(q.L.indexOf(q.pairs[0].l)); } ok(pos0.size >= 5, '位置隨機 ' + pos0.size);
// 字庫涵蓋度：很多不同的偏旁都會出現（不是永遠同一批）
const seenL = new Set(); for (let i = 0; i < 400; i++) T.makeLevel(30, rnd).L.forEach(l => seenL.add(l)); ok(seenL.size >= 25, '出現過的左偏旁 ' + seenL.size);
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
