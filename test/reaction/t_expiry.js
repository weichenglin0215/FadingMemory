// 保存期限（expiry）：日期換算（大小月、2 月、閏年、跨年）、過期判斷（到期日當天還能吃）、出題的難度階段、時間文字
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_expiry.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261104); const rnd = rng(SEED);

ok(G.id === 'expiry' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
// 日期換算
const D = (y, m, d) => T.dayNum(y, m, d);
ok(T.md(D(2026, 1, 28) + 5) === '2/2', '1/28＋5 天＝2/2');
ok(T.md(D(2026, 2, 26) + 3) === '3/1' && T.md(D(2028, 2, 26) + 3) === '2/29', '2 月：平年 28 天、閏年 29 天');
ok(T.md(D(2026, 4, 28) + 3) === '5/1' && T.md(D(2026, 5, 28) + 3) === '5/31', '小月 30 天、大月 31 天');
ok(T.ymd(D(2026, 12, 30) + 5).y === 2027 && T.md(D(2026, 12, 30) + 5) === '1/4', '跨年');
ok(T.isLeap(2028) && !T.isLeap(2026) && !T.isLeap(2100) && T.isLeap(2000), '閏年');
ok([1, 3, 5, 7, 8, 10, 12].every(m => T.monthLen(2026, m) === 31) && [4, 6, 9, 11].every(m => T.monthLen(2026, m) === 30) && T.monthLen(2026, 2) === 28 && T.monthLen(2028, 2) === 29, '每個月幾天');
// 過期判斷：到期日當天還能吃、隔天才過期；小時制：超過到期時間才過期
{
  const now = { day: D(2026, 3, 2), hour: 10 };
  ok(!T.isExpired({ kind: 'day', mfg: D(2026, 2, 25), n: 5 }, now), '2/25＋5＝3/2（當天）沒過期');
  ok(T.isExpired({ kind: 'day', mfg: D(2026, 2, 24), n: 5 }, now), '2/24＋5＝3/1 已經過期');
  ok(!T.isExpired({ kind: 'hour', mfg: D(2026, 2, 28), mfgHour: 20, n: 48 }, now), '2/28 晚上 8 點＋48 小時＝3/2 晚上 8 點，現在 3/2 上午 10 點沒過期');
  ok(T.isExpired({ kind: 'hour', mfg: D(2026, 2, 28), mfgHour: 8, n: 48 }, now), '2/28 上午 8 點＋48 小時＝3/2 上午 8 點，已經過期');
  ok(T.dueText({ kind: 'hour', mfg: D(2026, 2, 28), mfgHour: 20, n: 48 }) === '到期 3/2 晚上 8 點' && T.dueText({ kind: 'day', mfg: D(2026, 2, 25), n: 5 }) === '到期 3/2', '到期文字');
}
ok(T.hourText(0) === '凌晨 12 點' && T.hourText(9) === '上午 9 點' && T.hourText(12) === '中午 12 點' && T.hourText(15) === '下午 3 點' && T.hourText(20) === '晚上 8 點', '幾點的文字');
// 出題
let cross = 0, feb = 0, leap = 0, hours = 0, newyear = 0, eq0 = 0;
for (let lv = 1; lv <= 40; lv++) for (let k = 0; k < 25; k++) {
  const p = T.makePuzzle(lv, rnd), n = Math.round(Reaction.kit.ramp(lv, T.ITEMS[0], T.ITEMS[1], T.RAMP_LEVELS));
  ok(p.items.length === n, '第 ' + lv + ' 關：' + n + ' 樣');
  const ne = p.items.filter(x => x.expired).length;
  ok(ne > 0 && ne < p.items.length, '第 ' + lv + ' 關：有過期的、也有沒過期的');
  ok(p.items.every(x => x.expired === T.isExpired(x, p.now)), '答案跟判斷一致');
  ok(new Set(p.items.map(x => x.name)).size === p.items.length, '同一關食物不重複');
  p.items.forEach(x => {
    if (x.kind === 'day') { const d = x.mfg + x.n - p.now.day; ok(Math.abs(d) <= T.NEAR_DAYS, '到期日離今天最多 ' + T.NEAR_DAYS + ' 天：' + d); if (d === 0) eq0++; }
    else { hours++; ok(lv >= T.HOURS_FROM, '小時制從第 ' + T.HOURS_FROM + ' 關起'); }
    if (T.crossesMonth(x)) { cross++; const a = T.ymd(x.mfg); if (a.m === 2) feb++; if (a.m === 2 && a.y === 2028) leap++; if (a.m === 12) newyear++; }
  });
  if (lv <= T.SAME_MONTH_TO) ok(p.items.every(x => !T.crossesMonth(x)), '第 ' + lv + ' 關：不跨月');
  else ok(p.items.some(x => T.crossesMonth(x)), '第 ' + lv + ' 關：至少一樣跨月');
  if (lv < T.LEAP_FROM) ok(T.ymd(p.now.day).y !== 2028, '第 ' + lv + ' 關前沒有閏年');
}
ok(cross > 500 && feb > 60 && leap > 5 && hours > 80 && newyear > 10 && eq0 > 30, '跨月 ' + cross + '、跨 2 月 ' + feb + '、閏年 ' + leap + '、小時制 ' + hours + '、跨年 ' + newyear + '、剛好到期當天 ' + eq0);
// 判定
{
  const p = T.makePuzzle(10, rnd), right = p.items.map(x => x.expired);
  ok(T.wrongOnes(p, right).length === 0, '全對');
  const w = right.slice(); w[1] = !w[1]; ok(T.wrongOnes(p, w).join() === '1', '標錯一樣會被抓出來');
}
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
