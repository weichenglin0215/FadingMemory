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
// ───────── V1.34 玩家意見：「只要左右兩塊能合成字就算對，不要當場判錯；配到最後剩下的配不起來才失敗並說明原因」 ─────────
// ① 補充字庫（也是真的字、不拿來當答案）：格式正確、不重複、不跟出題字庫撞
const exSeen = new Set(), libPairs = new Set(T.COMBOS.map(c => c.l + c.r));
ok(T.EXTRA_COMBOS.length >= 300, '補充字庫組數 ' + T.EXTRA_COMBOS.length);
T.EXTRA_COMBOS.forEach(c => {
  ok([...c.l].length === 1 && [...c.r].length === 1 && [...c.ch].length === 1, '補充字庫每格一個字 ' + c.l + c.r + c.ch);
  ok(!exSeen.has(c.l + c.r) && !libPairs.has(c.l + c.r), '補充字庫的 (左,右) 不重複、也不跟出題字庫重複 ' + c.l + c.r); exSeen.add(c.l + c.r);
  ok(T.LEFTS.includes(c.l), '補充字庫的左偏旁都是出題會用到的左偏旁（不然永遠用不到）：' + c.l + c.r + c.ch);
  ok(T.merge(c.l, c.r) === c.ch && c.ch !== c.l && c.ch !== c.r, 'merge 查得到補充字庫 ' + c.l + c.r + c.ch);
});
ok(T.merge('氵', '尼') === '泥' && T.merge('扌', '支') === '技' && T.merge('木', '才') === '材' && T.merge('言', '成') === '誠' && T.merge('氵', '日') === null, '補充字庫的範例（泥、技、材、誠）；不是字的組合仍然是 null');
// ② 整關驗證：加了補充字庫之後，畫面上能合成字的還是只有那 5 組（出題時兩份字庫一起檢查）、而且不會退回備用題
let fb = 0;
for (let i = 0; i < 1500; i++) { const lv = 1 + (i % 60), q = T.makeLevel(lv, rnd); if (q.L.length !== T.colsFor(lv)) fb++; }
ok(fb === 0, '出題不會退回備用題（備用題只有 5 欄）：' + fb);
{ let t0 = Date.now(); for (let i = 0; i < 300; i++) T.makeLevel(40, rnd); const ms = (Date.now() - t0) / 300; console.log('第 40 關每題出題 ' + ms.toFixed(2) + ' 毫秒'); ok(ms < 20, '出題夠快 ' + ms.toFixed(2) + ' 毫秒'); }
// ③ 卡住的判斷與說明：氵＋尼＝泥 也是字（出題時設計的是 氵＋工＝江、口＋尼＝呢），玩家先連了泥，最後剩下的「口」和「工」就配不起來
{ const q = { L: ['氵', '口', '扌', '亻', '日'], R: ['工', '尼', '丁', '言', '月'], pairs: [{ l: '氵', r: '工', ch: '江' }, { l: '口', r: '尼', ch: '呢' }, { l: '扌', r: '丁', ch: '打' }, { l: '亻', r: '言', ch: '信' }, { l: '日', r: '月', ch: '明' }] };
  const conns = [{ l: '氵', r: '尼', ch: T.merge('氵', '尼') }];
  const set = cs => { const l = {}, r = {}; cs.forEach(c => { l[c.l] = true; r[c.r] = true; }); return [l, r]; };
  ok(T.isStuck(q.L, q.R, ...set([])) === false, '一開始不會是卡住');
  ok(T.isStuck(q.L, q.R, ...set(conns)) === false, '連了「氵＋尼＝泥」之後，扌＋丁、亻＋言、日＋月 還能連：不判錯');
  conns.push({ l: '扌', r: '丁', ch: '打' }, { l: '亻', r: '言', ch: '信' });
  ok(T.isStuck(q.L, q.R, ...set(conns)) === false, '連了 3 組之後，剩下的日＋月 還能連：還沒卡住');
  conns.push({ l: '日', r: '月', ch: '明' });
  ok(T.isStuck(q.L, q.R, ...set(conns)) === true, '連了 4 組之後，剩下的「口」和「工」合不成字：卡住了');
  const lines = T.stuckLines(q, conns);
  ok(lines.length === 3 && lines[0].includes('「口」') && lines[0].includes('「工」'), '說明①：剩下哪幾塊配不起來：' + lines[0]);
  ok(lines[1].includes('氵＋尼＝泥') && lines[1].includes('確實是字'), '說明②：點名玩家連的那一組是字、但用掉了別人需要的偏旁：' + lines[1]);
  ok(lines[2].includes('氵＋工＝江') && lines[2].includes('口＋尼＝呢') && lines[2].includes('日＋月＝明'), '說明③：出題時設計的連法：' + lines[2]);
  // 玩家照設計連：沒有「你連的…確實是字」那一行
  const own = q.pairs.slice(0, 4).map(p => ({ l: p.l, r: p.r, ch: p.ch })), l2 = T.stuckLines(q, own);
  ok(l2.length === 2 && !l2.some(s => s.includes('確實是字')), '玩家都照設計連、剩下的卻配不起來（不會發生，但說明不能亂）：' + l2.join(' / '));
}
// ④ 程式裡的接線：連出「另一組也是字的」不會當場判錯；卡住才失敗；灰線只畫兩邊都沒連掉的組
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_mergechar.js'), 'utf8');
  const a = src.indexOf('function connect(li, ri)'), b = src.indexOf('/* 揭曉：還沒連的組用灰線連出來');
  const body = src.slice(a, b);
  ok(body.indexOf("var ch = merge(q.L[li], q.R[ri]);") > 0 && body.indexOf('if (ch) {') > 0 && body.indexOf('isStuck(q.L, q.R, usedL, usedR)') > body.indexOf('if (ch) {') && body.indexOf('stuckLines(q, conns)') > 0, '合成得出字就算對；連完之後用 isStuck 判斷卡住、用 stuckLines 說明');
  ok(body.indexOf('q.pairs') < 0 || body.indexOf('q.pairs.map') > 0, '連線判定不再拿出題設計的 q.pairs 來比對（只用來顯示說明）');
  ok(src.indexOf("if (locked['L' + li] || locked['R' + ri]) return;") > 0, '揭曉的灰線：兩邊都還沒連掉才畫');
  ok(/只要能合成一個字就連出綠線/.test(G.rule) && /剩下的偏旁都配不起來/.test(G.rule), '玩法說明有寫「只要能合成字就算對」「連到最後配不起來才失敗」'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
