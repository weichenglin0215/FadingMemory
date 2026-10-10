const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_whosaid.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261023); const rnd = rng(SEED);

ok(T.peopleFor(1) === 2 && T.peopleFor(T.RAMP_LEVELS) === 5 && T.peopleFor(60) === 5, '小人 2 → 5');
ok(T.saysFor(1) === 1 && T.saysFor(T.RAMP_LEVELS) === 3 && T.saysFor(60) === 3, '每人句數 1 → 3');
ok(T.sayMs(1) === 900 && T.sayMs(T.RAMP_LEVELS) === 600 && T.sayMs(60) === 600, '每句 900 → 600 ms');
for (let l = 2; l <= 60; l++) ok(T.peopleFor(l) >= T.peopleFor(l - 1) && T.saysFor(l) >= T.saysFor(l - 1) && T.sayMs(l) <= T.sayMs(l - 1), '單調 ' + l);
for (let l = 1; l <= 60; l++) ok(T.ansMs(l) >= 5000 && T.sayMs(l) >= 500, '限時與每句時間下限 ' + l + '：' + T.ansMs(l));
const total = (lv) => T.peopleFor(lv) * T.saysFor(lv);
ok(total(1) === 2 && total(T.RAMP_LEVELS) === 15, '總句數 2 → 15');
// 整關驗證
const askCnt = {}, consec = { n: 0 };
for (let i = 0; i < 6000; i++) {
  const lv = 1 + (i % 60), q = T.makeLevel(lv, rnd);
  ok(q.people.length === T.peopleFor(lv) && new Set(q.people.map(p => p.n)).size === q.people.length, '小人與顏色不重複');
  ok(q.events.length === total(lv), '總句數');
  q.people.forEach((p, k) => ok(q.events.filter(e => e.who === k).length === T.saysFor(lv), '每人句數相同'));
  ok(q.events.every(e => Number.isInteger(e.digit) && e.digit >= 0 && e.digit <= 9 && e.who >= 0 && e.who < q.people.length), '數字與說話者合法');
  ok(q.expect.length === q.says && q.ask >= 0 && q.ask < q.people.length, '答案長度');
  const sp = T.spoken(q);
  ok(sp[q.ask].join() === q.expect.join(), '答案＝該小人依序說的數字');
  ok(sp.every(a => a.length === q.says), '揭曉每人句數');
  askCnt[q.ask] = (askCnt[q.ask] || 0) + 1;
  for (let k = 1; k < q.events.length; k++) if (q.events[k].who === q.events[k - 1].who) consec.n++;
}
ok(Object.keys(askCnt).length === 5, '問的對象隨機：' + JSON.stringify(askCnt));
ok(consec.n > 100, '同一個小人有時會連續說兩次：' + consec.n);
// 說話順序是真的洗過（不是依序輪流）
let ordered = 0; for (let i = 0; i < 400; i++) { const q = T.makeLevel(20, rnd); if (q.events.every((e, k) => e.who === k % q.people.length)) ordered++; } ok(ordered < 5, '順序有打亂：' + ordered);
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
