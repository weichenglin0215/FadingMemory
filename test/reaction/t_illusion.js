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
    if (!T.GRAY[q.kind]) ok(Math.abs(p / 100 - q.delta) < 1e-9, 'pct=delta ' + p + ' ' + q.delta);
    ok(q.time > 0, 'time');
    if (T.GRAY[q.kind]) ok(q.v[0] >= 90 && q.v[1] <= 255 && q.v[q.big] - q.v[1 - q.big] === Math.round(q.delta * 255), 'gray gap (' + q.kind + ')');
  }
}
// 十一種錯覺（原本 5 種＋新增 6 種）：每一種都有題目文字、選項名稱、「問的是長／大／亮」的字，而且都會出現
ok(T.KINDS.length === 11 && new Set(T.KINDS).size === 11, '11 kinds');
['delboeuf', 'oppel', 'irradiation', 'hat', 'rectarea', 'cornsweet'].forEach(k => ok(T.KINDS.indexOf(k) >= 0, 'new kind ' + k));
T.KINDS.forEach(k => {
  ok(typeof T.QTEXT[k] === 'string' && T.QTEXT[k].length > 4, 'question text for ' + k);
  ok(T.NAMES[k] && T.NAMES[k].length === 2 && T.NAMES[k][0] !== T.NAMES[k][1], 'option names for ' + k);
  ok(['長', '大', '亮'].indexOf(T.WHAT[k]) >= 0, 'long/big/bright word for ' + k);
  ok(typeof T.DRAW[k] === 'function', 'a draw function for ' + k);
});
{
  const seen = {}, rnd0 = () => Math.random();
  for (let k = 0; k < 3000; k++) { const q = T.makeQuestion(1 + (k % 20), rnd0, null, null); seen[q.kind] = (seen[q.kind] || 0) + 1; }
  ok(Object.keys(seen).length === 11 && Object.values(seen).every(c => c > 150), 'every illusion kind appears about equally often: ' + JSON.stringify(seen));
}
// 位置綁定的錯覺（錯覺方向固定在某個位置）：help 時較大的一定是選項 0；trap 時一定是選項 1。其他的位置隨機（兩邊都會出現）
for (const k of T.KINDS) {
  let pos0 = 0, N2 = 400;
  for (let i = 0; i < N2; i++) { const q = T.makeQuestion(10, null, null, k); if (T.POS_BOUND[k]) ok(q.big === (q.help ? 0 : 1), 'position-bound ' + k); if (q.big === 0) pos0++; ok(q.kind === k, 'forceKind'); }
  if (!T.POS_BOUND[k]) ok(pos0 > N2 * 0.35 && pos0 < N2 * 0.65, 'random position for ' + k + ' (' + pos0 + '/' + N2 + ')');
}
// 新題型的數值：delboeuf 半徑 40、oppel 線長 200、irradiation 半徑 60、hat 高／寬 200、rectarea 面積 20000、cornsweet 灰階
{
  const base = { delboeuf: 40, oppel: 200, irradiation: 60, hat: 200, rectarea: 20000 };
  for (const k in base) for (let i = 0; i < 100; i++) { const q = T.makeQuestion(5, null, null, k); ok(Math.abs(q.v[1 - q.big] - base[k]) < 1e-9 && Math.abs(q.v[q.big] - base[k] * (1 + q.delta)) < 1e-6, 'values of ' + k); }
  for (let i = 0; i < 100; i++) { const q = T.makeQuestion(5, null, null, 'cornsweet'); ok(q.v[q.big] - q.v[1 - q.big] === Math.round(q.delta * 255) && q.v[0] >= 90 && q.v[0] <= 255 && q.v[1] <= 255, 'cornsweet gray values ' + JSON.stringify(q.v)); }
}
// delta 線性
const d1 = T.makeQuestion(1).delta, d20 = T.makeQuestion(20).delta, d10 = T.makeQuestion(10).delta;
console.log('delta lv1', d1.toFixed(4), 'lv10', d10.toFixed(4), 'lv20', d20.toFixed(4));
ok(Math.abs(d1 - 0.15) < 1e-9 && Math.abs(d20 - 0.02) < 1e-9, 'delta endpoints');
// 陷阱比例
for (const lv of [1, 20]) { let t = 0; for (let k = 0; k < N; k++) if (!T.makeQuestion(lv).help) t++; console.log('trap rate lv' + lv, (t / N).toFixed(3)); }
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
