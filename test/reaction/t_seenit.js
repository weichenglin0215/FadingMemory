const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_seenit.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261014); const rnd = rng(SEED);

// V1.27 改版：59 種食物 emoji＋中文名稱、一次答錯就失敗、每關限時多 1 秒、第 1 關不能按「看過」
ok(T.itemCount() === 59, '圖案數：' + T.itemCount());
{ const em = new Set(), nm = new Set();
  for (let id = 0; id < T.itemCount(); id++) { em.add(T.emojiOf(id)); nm.add(T.nameOf(id)); ok(/^[\u4e00-\u9fff]{2,5}$/.test(T.nameOf(id)), '中文名稱 2～5 字：' + T.nameOf(id)); ok(String.fromCodePoint(T.ITEMS[id][0]) === T.emojiOf(id) && T.emojiOf(id).length >= 1, 'emoji'); }
  ok(em.size === T.itemCount() && nm.size === T.itemCount(), '每個 emoji、中文名稱都不重複'); }
ok(T.emojiOf(0) === String.fromCodePoint(0x1F95D) && T.nameOf(0) === '奇異果' && T.nameOf(T.itemCount() - 1) === '啤酒' && T.nameOf(10) === '蘋果' && T.nameOf(30) === '披薩', '清單內容與順序（奇異果…啤酒）');
// 限時：第 N 關 ＝ TIME0 ＋ (N−1) × 1 秒
for (let l = 1; l <= T.MAX_LEVEL; l++) ok(T.timeMs(l) === Math.round((T.TIME0_S + (l - 1) * T.TIME_STEP_S) * 1000), '第 ' + l + ' 關限時');
ok(T.TIME_STEP_S === 1 && T.timeMs(2) - T.timeMs(1) === 1000 && T.timeMs(10) - T.timeMs(9) === 1000, '每關多 1 秒');
// 模擬 80 局、每局 MAX_LEVEL 關：規則
let olds = 0, news = 0, games = 80, repBad = 0, runBad = 0;
for (let g = 0; g < games; g++) {
  const hist = [], kinds = [];
  for (let i = 0; i < T.MAX_LEVEL; i++) {
    const t = T.nextTrial(hist, rnd, kinds);
    ok(t.item >= 0 && t.item < T.itemCount() && t.level === i + 1, '圖案編號與關卡合法');
    if (i === 0) ok(t.kind === 'new' && t.seenAt === 0, '第 1 關一定是新的');
    if (t.kind === 'old') {
      olds++; const last = hist.lastIndexOf(t.item); ok(last >= 0 && last + 1 === t.seenAt && t.seenAt < t.level, '看過的圖案真的在前面關卡出現過（上次在第 ' + t.seenAt + ' 關）');
      if (hist.filter(x => x === t.item).length >= T.MAX_REPEAT) repBad++;
    } else { news++; ok(hist.indexOf(t.item) < 0 && t.seenAt === 0, '新的圖案之前沒出現過'); }
    hist.push(t.item); kinds.push(t.kind);
    const after = kinds.slice(T.DISTINCT_LEVELS);                         // 強制都是新的那幾關不算
    if (after.length > T.SAME_MAX) { const tail = after.slice(-T.SAME_MAX - 1); if (tail.every(k => k === tail[0])) runBad++; }
    if (i < T.DISTINCT_LEVELS) { ok(t.kind === 'new' && new Set(hist).size === i + 1, '前 ' + T.DISTINCT_LEVELS + ' 關強制都是不同的新圖案（第 ' + (i + 1) + ' 關）'); }
  }
}
ok(repBad === 0, '同一圖案最多 ' + T.MAX_REPEAT + ' 次（違規 ' + repBad + '）');
ok(runBad === 0, '同一種答案最多連續 ' + T.SAME_MAX + ' 關（違規 ' + runBad + '）');
ok(olds / (olds + news) > 0.35 && olds / (olds + news) < 0.65, '看過／新的約一半：' + (olds / (olds + news)).toFixed(3));
// 新圖案用完之後一定是「看過」
{ const hist = []; for (let i = 0; i < T.itemCount(); i++) hist.push(i); const t = T.nextTrial(hist, rnd, []); ok(t.kind === 'old', '新圖案用完了就只能是看過'); }
// 接線：沒有命、第 1 關看過按鈕停用、答錯失敗
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_seenit.js'), 'utf8');
  ok(src.indexOf('lives:') < 0 && src.indexOf('api.lose') < 0 && src.indexOf('api.fail(') > 0, '沒有「命」，答錯直接失敗');
  ok(src.indexOf('if (level === 1) bOld.disabled = true;') > 0 && src.indexOf('api.skip') < 0, '第 1 關「看過」按鈕停用，不再有暖身');
  ok(G.rule.indexOf('三條命') < 0 && G.rule.indexOf('多 1 秒') > 0, '玩法說明更新'); }
ok(T.rating(2) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30) && T.rating(30) !== T.rating(50), '評語分級');
// V1.31：前 DISTINCT_LEVELS 關強制出現不同的圖案（預設 3）
ok(T.DISTINCT_LEVELS === 3, '預設 3');
{ const firstOld = {}; for (let g = 0; g < 600; g++) { const hist = [], kinds = []; for (let i = 0; i < 12; i++) { const t = T.nextTrial(hist, rnd, kinds); if (i < T.DISTINCT_LEVELS) { ok(t.kind === 'new' && hist.indexOf(t.item) < 0 && new Set(hist.concat([t.item])).size === i + 1, '前 ' + T.DISTINCT_LEVELS + ' 關完全不重複'); } if (t.kind === 'old' && firstOld.v == null) firstOld.v = 0; if (i === T.DISTINCT_LEVELS) { firstOld.n = (firstOld.n || 0) + 1; if (t.kind === 'old') firstOld.c = (firstOld.c || 0) + 1; } hist.push(t.item); kinds.push(t.kind); } }
  ok(firstOld.c / firstOld.n > 0.4 && firstOld.c / firstOld.n < 0.9, '第 ' + (T.DISTINCT_LEVELS + 1) + ' 關不是一定「看過」（' + (firstOld.c / firstOld.n).toFixed(2) + '，約等於 P_OLD）'); }
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_seenit.js'), 'utf8');
  ok(src.indexOf('(idx < DISTINCT_LEVELS && fresh.length)') > 0, '實作：前 DISTINCT_LEVELS 關強制新的'); }
// V1.31：連續兩關絕不會是同一個圖案
{ let same = 0, total = 0;
  for (let g = 0; g < 400; g++) { const hist = [], kinds = []; for (let i = 0; i < T.MAX_LEVEL; i++) { const t = T.nextTrial(hist, rnd, kinds); if (i > 0) { total++; if (t.item === hist[i - 1]) same++; } hist.push(t.item); kinds.push(t.kind); } }
  ok(same === 0, '連續兩關同一個圖案 ' + same + ' 次／' + total + ' 關'); }
// 只看過一個圖案、那一個又剛好是上一關（例如 DISTINCT_LEVELS 設成 1）：不能再出同一個，改成新的
{ const hist = [5], kinds = ['new']; for (let i = 0; i < 300; i++) { const t = T.nextTrial(hist, rnd, kinds); ok(t.item !== 5 && t.kind === 'new', '只有上一關那個圖案可以當「看過」時，改出新的'); } }
// 「看過」一定指向「之前的關卡」而不是上一關：seenAt（上次出現的關）要 ≤ 目前關卡 − 2
{ for (let g = 0; g < 300; g++) { const hist = [], kinds = []; for (let i = 0; i < 40; i++) { const t = T.nextTrial(hist, rnd, kinds); if (t.kind === 'old') ok(t.seenAt <= t.level - 2, '「看過」的圖案上次出現在第 ' + t.seenAt + ' 關、這是第 ' + t.level + ' 關（不是上一關）'); hist.push(t.item); kinds.push(t.kind); } } }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
