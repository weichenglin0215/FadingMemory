const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_timeafter.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261015); const rnd = rng(SEED);

ok(T.fmtTime(0) === '00:00' && T.fmtTime(645) === '10:45' && T.fmtTime(1439) === '23:59' && T.fmtTime(65) === '01:05', 'fmtTime');
ok(T.ansMs(1) === 10000 && T.ansMs(T.RAMP_LEVELS) === 6000 && T.ansMs(60) === 6000, '限時 10 → 6 秒');
for (let l = 2; l <= 60; l++) ok(T.ansMs(l) <= T.ansMs(l - 1), '限時單調');
ok(T.beforeP(1) === 0 && T.beforeP(T.BEFORE_FROM - 1) === 0 && T.beforeP(T.BEFORE_FROM) > 0.2 && T.beforeP(T.RAMP_LEVELS) > 0.49 && T.beforeP(60) <= 0.5 + 1e-9, '倒推機率');
// 範例：10:45 ＋ 135 → 13:00，揭曉文字
ok(T.explain('after', 645, 135, 780) === '10:45 先加 2 小時 ＝ 12:45，再加 15 分鐘 ＝ 13:00', '揭曉文字 A：' + T.explain('after', 645, 135, 780));
ok(T.explain('before', 570, 47, 523) === '09:30 減 47 分鐘 ＝ 08:43', '揭曉文字 B：' + T.explain('before', 570, 47, 523));
{ const c = T.decoyCandidates('after', 645, 135, 780, 1); ok(c.some(x => x.m === 645 + 95 && x.kind === 'misread'), '把 135 讀成 1:35 的錯法'); }
// 整題驗證
const kinds = { after: 0, before: 0 }, dk = {};
for (let i = 0; i < 9000; i++) {
  const lv = 1 + (i % 60), q = T.makeQuestion(lv, rnd);
  ok(q.ans === (q.kind === 'after' ? q.start + q.delta : q.start - q.delta), '正解算術 ' + q.text);
  ok(q.ans >= 0 && q.ans < 1440 && q.decoy >= 0 && q.decoy < 1440 && q.decoy !== q.ans, '時間範圍與不同 ' + q.text);
  ok(T.fmtTime(q.decoy) !== T.fmtTime(q.ans), '兩個選項顯示不同');
  ok(q.text.includes(T.fmtTime(q.start)) && q.text.includes(String(q.delta)), '題目文字帶時間與分鐘數：' + q.text);
  ok(q.explain.endsWith(T.fmtTime(q.ans)), '揭曉文字結尾是答案');
  ok(lv >= T.BEFORE_FROM || q.kind === 'after', '倒推從第 ' + T.BEFORE_FROM + ' 題才出現');
  ok(lv >= T.STEP1_FROM || (q.delta % 5 === 0 && q.start % 5 === 0), '前期是 5 的倍數');
  ok(q.delta >= Math.round(1 * 25) - 1, '分鐘數下限');
  kinds[q.kind]++; dk[q.decoyKind] = (dk[q.decoyKind] || 0) + 1;
  if (q.kind === 'before') ok(q.start >= q.delta, '倒推不會跨到前一天');
}
ok(kinds.before > 1500 && kinds.after > 4000, '兩種題型都出現 ' + JSON.stringify(kinds));
ok(dk.misread > 300 && dk.hour > 500 && dk.noRemainder > 300 && dk.ten > 300, '各種錯法都出現 ' + JSON.stringify(dk));
// 分鐘數範圍隨題號變大（平均）
function meanDelta(lv) { let s = 0; for (let i = 0; i < 2000; i++) s += T.makeQuestion(lv, rnd).delta; return s / 2000; }
ok(meanDelta(30) > meanDelta(1) * 2.5, '分鐘數隨題號變大：' + meanDelta(1).toFixed(0) + ' → ' + meanDelta(30).toFixed(0));
{ const hist = []; let run = 1, maxRun = 1;
  for (let i = 0; i < 20000; i++) { const w = T.nextLeft(hist, rnd); if (hist.length && hist[hist.length - 1] === w) run++; else run = 1; maxRun = Math.max(maxRun, run); hist.push(w); }
  ok(maxRun <= T.SAME_MAX, '連續最多 ' + maxRun); }
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(15) && T.rating(15) !== T.rating(30) && T.rating(30) !== T.rating(45), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
