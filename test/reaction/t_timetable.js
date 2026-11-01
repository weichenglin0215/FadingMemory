// 時刻表補字（timetable）：時間格式與輸入、生成樹（剛好推得完）、出題（發車間隔不固定、糊掉比例、區間車）、提示的長方形、檢查
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_timetable.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261102); const rnd = rng(SEED);

ok(G.id === 'timetable' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
// 時間的顯示與輸入：打 758＝7:58、1005＝10:05；分超過 59、不滿 3 位都不算
ok(T.fmt(478) === '7:58' && T.fmt(605) === '10:05' && T.fmt(360) === '6:00', 'fmt');
ok(T.parseTyped('758') === 478 && T.parseTyped('1005') === 605 && T.parseTyped('760') === null && T.parseTyped('75') === null && T.parseTyped('') === null && T.parseTyped('2500') === null, 'parseTyped');
ok(T.typedText('7') === '7' && T.typedText('75') === '75' && T.typedText('758') === '7:58' && T.typedText('1005') === '10:05', 'typedText');
// 難度曲線：站數 3→7、班次 3→6，線性、到頂後不變
ok(T.sizeFor(1).S === 3 && T.sizeFor(1).T === 3 && T.sizeFor(30).S === 7 && T.sizeFor(30).T === 6 && T.sizeFor(80).S === 7, '大小曲線');
for (let lv = 2; lv <= 40; lv++) ok(T.sizeFor(lv).S >= T.sizeFor(lv - 1).S && T.sizeFor(lv).T >= T.sizeFor(lv - 1).T, '第 ' + lv + ' 關不會變小');
// 出題
for (let lv = 1; lv <= 45; lv += 1) for (let k = 0; k < 12; k++) {
  const p = T.makePuzzle(lv, rnd), S = p.S, TT = p.T;
  const sz = T.sizeFor(lv);
  ok(S === sz.S && TT === sz.T, '第 ' + lv + ' 關大小');
  // 時刻表本身：每格＝發車＋離起點幾分；每班車相鄰兩站花的時間一樣
  let consistent = true;
  for (let s = 0; s < S; s++) for (let t = 0; t < TT; t++) if (p.times[s * TT + t] !== p.dep[t] + p.offset[s]) consistent = false;
  ok(consistent, '第 ' + lv + ' 關：每格＝發車時間＋離起點幾分鐘');
  for (let s = 1; s < S; s++) ok(p.offset[s] > p.offset[s - 1], '站與站之間至少開 1 分鐘');
  const gaps = []; for (let t = 1; t < TT; t++) gaps.push(p.dep[t] - p.dep[t - 1]);
  ok(gaps.some(g => g !== gaps[0]) || gaps.length < 2, '第 ' + lv + ' 關：發車間隔不固定 ' + gaps);
  ok(p.times.every(v => v >= 5 * 60 && v < 24 * 60), '時間都在 5:00～23:59');
  // 看得到的格子剛好推得完（連通），而且糊掉的比例照曲線（不會比生成樹更少）
  ok(T.solvable(p, p.shown), '第 ' + lv + ' 關：看得到的格子推得出整張表');
  const usable = p.times.filter((_, i) => !p.skip[i]).length, shown = p.shown.filter((v, i) => v && !p.skip[i]).length;
  ok(shown >= S + TT - 1 && shown < usable, '第 ' + lv + ' 關：至少一棵生成樹、至少糊掉一格');
  ok(!p.shown.some((v, i) => v && p.skip[i]), '不停的格子不會是看得到的格子');
  if (lv >= 30) ok(shown === S + TT - 1, '到頂：只剩一棵生成樹（每一格都非推不可） ' + shown);
  // 區間車
  const skips = p.skip.filter(Boolean).length;
  ok(lv < T.EXPRESS_FROM ? skips === 0 : (S >= 4 ? skips === 1 : skips === 0), '第 ' + lv + ' 關：區間車 ' + skips);
  // 一路照提示推：每一步都找得到長方形，最後填完（＝不用猜）
  const known = p.shown.slice(); let steps = 0;
  for (;;) {
    const r = T.hintRect(p, known);
    if (!r) break;
    ok(!known[r.cell] && r.rect.every(c => known[c]), '提示的長方形三個角都已知');
    const [a, b, c] = r.rect; ok(p.times[r.cell] === p.times[a] - p.times[b] + p.times[c], '長方形法則成立');
    known[r.cell] = true; steps++;
  }
  ok(known.every((v, i) => v || p.skip[i]), '第 ' + lv + ' 關：只用長方形法則就能填完（' + steps + ' 步）');
}
// 檢查：空格、填錯、全對
{
  const p = T.makePuzzle(10, rnd), ans = p.times.map(() => null);
  let c = T.checkAll(p, ans); ok(!c.done && c.wrong.length === 0 && c.empty === p.shown.filter((v, i) => !v && !p.skip[i]).length, '全部空著');
  const k = p.shown.findIndex((v, i) => !v && !p.skip[i]); ans[k] = p.times[k] + 1;
  c = T.checkAll(p, ans); ok(c.wrong.length === 1 && c.wrong[0] === k, '填錯一格會標出來');
  const full = p.times.slice(); c = T.checkAll(p, full); ok(c.done, '全部填對就過關');
}
ok(T.spanningCells(4, 5, [...Array(20).keys()], rnd).length === 8, '4 站 5 班的生成樹是 8 格');
ok(typeof T.rating(0) === 'string' && T.rating(30) !== T.rating(0), '評語');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
