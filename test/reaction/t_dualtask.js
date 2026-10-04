const { game } = require('./load.js');
const G = game('reaction_dualtask.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 難度曲線（線性）
ok(near(T.greenGapFor(1), 2.0) && near(T.greenGapFor(3), 1.1) && near(T.greenGapFor(2), 1.55), 'green gap 2.0 → 1.1');
ok(near(T.litFor(1), 1.2) && near(T.litFor(3), 0.65), 'lit 1.2 → 0.65');
ok(T.redNFor(1) === 8 && T.redNFor(2) === 14 && T.redNFor(3) === 20, 'red count 8/14/20');
ok(T.optGapFor(1) === 3 && T.optGapFor(2) === 2 && T.optGapFor(3) === 1, 'option gap 3/2/1');
// 事件表
let minAny = 1e9, minRed = 1e9, minGreenSlack = 1e9, cnt = { 1: [], 2: [], 3: [] }, outOfRange = 0, shortRed = 0;
for (let r = 1; r <= T.ROUNDS; r++) {
  for (let k = 0; k < 3000; k++) {
    const ev = T.makeEvents(r);
    if (ev.red.length !== T.redNFor(r)) shortRed++;
    cnt[r].push(ev.green.length);
    for (let i = 1; i < ev.green.length; i++) minGreenSlack = Math.min(minGreenSlack, ev.green[i] - ev.green[i - 1] - ev.lit);
    const all = ev.green.map(t => ['g', t]).concat(ev.red.map(t => ['r', t])).sort((a, b) => a[1] - b[1]);
    for (let i = 1; i < all.length; i++) minAny = Math.min(minAny, all[i][1] - all[i - 1][1]);
    for (let i = 1; i < ev.red.length; i++) minRed = Math.min(minRed, ev.red[i] - ev.red[i - 1]);
    all.forEach(e => { if (e[1] < 0.8 - 1e-9 && e[0] === 'r' || e[1] + (e[0] === 'g' ? ev.lit : T.RED_LIT) > T.DURATION_SEC + 1e-9) outOfRange++; });
    ok(ev.green.length > 0 && ev.green[0] >= 1.5 - 1e-9, 'first green not before 1.5 s');
  }
}
ok(shortRed === 0, 'red count equals the plan for every round (' + shortRed + ' short)');
ok(minAny >= T.MIN_EVENT_GAP - 1e-9, 'any two events start at least 0.3 s apart (' + minAny.toFixed(3) + ')');
ok(minRed >= 0.6 - 1e-9, 'any two reds at least 0.6 s apart (' + minRed.toFixed(3) + ')');
ok(minGreenSlack >= 0.1 - 1e-9, 'greens never overlap: slack ≥ 0.1 s (' + minGreenSlack.toFixed(3) + ')');
ok(outOfRange === 0, 'all events finish inside the round');
const avg = r => cnt[r].reduce((a, b) => a + b, 0) / cnt[r].length;
ok(avg(1) < avg(2) && avg(2) < avg(3), 'more greens in later rounds: ' + [avg(1), avg(2), avg(3)].map(x => x.toFixed(1)).join(' < '));
// 選項
let optBad = 0;
for (let r = 1; r <= T.ROUNDS; r++) for (let k = 0; k < 2000; k++) {
  const truth = T.redNFor(r), o = T.makeOptions(truth, T.optGapFor(r));
  if (o.length !== 4 || new Set(o).size !== 4 || o.indexOf(truth) < 0 || o.some(x => x < 1 || (x - truth) % T.optGapFor(r) !== 0) || o.some((x, i) => i && x <= o[i - 1])) optBad++;
}
ok(optBad === 0, 'options: 4 distinct, ≥ 1, contain the truth, spaced by the gap (' + optBad + ' bad)');
// 分數
ok(T.roundScore(10, 0, 8, 8) === 10 && T.roundScore(10, 0, 9, 8) === 5 && T.roundScore(11, 0, 9, 8) === 6 && T.roundScore(10, 3, 8, 8) === 7 && T.roundScore(2, 9, 8, 8) === 0, 'roundScore');
// 亮燈判定
ok(T.litIndex([1, 3, 5], 1.2, 1.0) === 0 && T.litIndex([1, 3, 5], 1.2, 2.199) === 0 && T.litIndex([1, 3, 5], 1.2, 2.2) === -1 && T.litIndex([1, 3, 5], 1.2, 0.99) === -1 && T.litIndex([1, 3, 5], 1.2, 3.5) === 1, 'litIndex');
ok(T.rating(10) !== T.rating(30) && T.rating(30) !== T.rating(50), 'rating tiers');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
