const { game } = require('./load.js');
const G = game('reaction_price.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 20) console.log('FAIL', m); } };
const DIG = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 壹: 1, 貳: 2, 參: 3, 肆: 4, 伍: 5, 陸: 6, 柒: 7, 捌: 8, 玖: 9 };
const UNIT = { 十: 10, 百: 100, 千: 1000, 拾: 10, 佰: 100, 仟: 1000 };
function parseChunk(s) { let total = 0, cur = 0; for (const ch of s) { if (ch in DIG) { if (ch !== '零') cur = DIG[ch]; } else if (ch in UNIT) { total += (cur || 1) * UNIT[ch]; cur = 0; } } return total + cur; }
function parse(s) { s = s.replace(/元$/, ''); const i = s.indexOf('萬'); if (i < 0) return parseChunk(s); const hi = parseChunk(s.slice(0, i)), lo = s.slice(i + 1); return hi * 10000 + (lo ? parseChunk(lo) : 0); }
const seen = { true: new Map(), false: new Map() };
for (const formal of [false, true]) for (let n = 1; n <= 99999; n++) {
  const s = T.toChinese(n, formal);
  ok(parse(s) === n, 'roundtrip ' + n + ' ' + s + ' -> ' + parse(s));
  if (seen[formal].has(s)) ok(false, 'dup ' + s); seen[formal].set(s, n);
}
// 抽樣看看
console.log([10, 15, 20, 100, 105, 110, 1000, 1010, 2005, 3800, 9999, 10000, 10005, 10500, 12345, 20300].map(n => n + ':' + T.priceText(n, false) + '/' + T.priceText(n, true)).join('  '));
console.log(T.foldText(8), T.foldText(8.5), T.foldText(6.5), T.foldText(9.5), T.foldText(5));
// 出題
let worst = 0, cnt = 0;
for (let lv = 1; lv <= 25; lv++) {
  const P = T.paramsFor(lv); let typesSeen = {}, formalCnt = 0, rels = [];
  for (let k = 0; k < 300; k++) {
    const q = T.makeQuestion(lv); cnt++;
    const [A, B] = q.tags;
    ok(A.final === T.finalOf(A) && B.final === T.finalOf(B), 'final recompute');
    ok(Number.isInteger(A.final) && Number.isInteger(B.final) && A.final >= 50 && B.final >= 50, 'integer positive');
    ok(A.final !== B.final, 'differ');
    ok(q.lowIdx === (A.final < B.final ? 0 : 1), 'lowIdx');
    ok(q.rel >= P.diff * 0.75 - 1e-9 && q.rel <= P.diff * 1.3 + 1e-9, 'rel range lv' + lv + ' ' + q.rel + ' target ' + P.diff);
    q.tags.forEach(tg => { typesSeen[tg.disc.type] = 1; if (tg.formal) formalCnt++; ok(T.typesFor(lv).indexOf(tg.disc.type) >= 0, 'type allowed'); ok(tg.orig <= 99999, 'orig range'); });
    rels.push(q.rel);
  }
  if (lv === 1 || lv === 5 || lv === 10 || lv === 20) console.log('lv' + lv, 'target diff', (P.diff * 100).toFixed(1) + '%', 'avg actual', (rels.reduce((a, b) => a + b, 0) / rels.length * 100).toFixed(1) + '%', 'types', Object.keys(typesSeen).join(','), 'formal share', (formalCnt / 600 * 100).toFixed(0) + '%', 'time', P.time.toFixed(1), 'step', P.step);
}
const q = T.makeQuestion(12); console.log(q.tags.map(t => T.priceText(t.orig, t.formal) + ' ' + T.discText(t.disc, t.formal) + ' => ' + T.formulaText(t)).join(' | '));
console.log(bad ? 'FAILED ' + bad : 'ALL PASS', cnt);
