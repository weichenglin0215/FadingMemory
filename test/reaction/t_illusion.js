const { game } = require('./load.js');
const G = game('reaction_illusion.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
let helpCnt = { 1: 0, 20: 0 }, N = 2000;
for (const lv of [1, 5, 10, 20, 30]) {
  for (let k = 0; k < 300; k++) {
    const q = T.makeQuestion(lv, null, 'muller');
    ok(q.kind !== 'muller', 'avoidKind');
    ok(T.KINDS.indexOf(q.kind) >= 0, 'kind');
    ok(q.big === 0 || q.big === 1, 'big');
    ok(q.v[q.big] > q.v[1 - q.big], 'big is bigger ' + q.kind + ' ' + JSON.stringify(q.v));
    const p = T.realPct(q);
    if (q.kind !== 'contrast') ok(Math.abs(p / 100 - q.delta) < 1e-9, 'pct=delta ' + p + ' ' + q.delta);
    ok(q.time > 0, 'time');
    if (q.kind === 'contrast') ok(q.v[0] >= 90 && q.v[1] <= 255 && q.v[q.big] - q.v[1 - q.big] === Math.round(q.delta * 255), 'contrast gap');
  }
}
// delta 線性
const d1 = T.makeQuestion(1).delta, d20 = T.makeQuestion(20).delta, d10 = T.makeQuestion(10).delta;
console.log('delta lv1', d1.toFixed(4), 'lv10', d10.toFixed(4), 'lv20', d20.toFixed(4));
ok(Math.abs(d1 - 0.15) < 1e-9 && Math.abs(d20 - 0.02) < 1e-9, 'delta endpoints');
// 陷阱比例
for (const lv of [1, 20]) { let t = 0; for (let k = 0; k < N; k++) if (!T.makeQuestion(lv).help) t++; console.log('trap rate lv' + lv, (t / N).toFixed(3)); }
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
