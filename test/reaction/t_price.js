const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_price.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 20) console.log('FAIL', m); } };
// 出題用固定種子的亂數（test/reaction/load.js 的 rng）：每次跑的題目都一樣，下面那些統計才不會偶爾因為運氣不好而失敗。
// 想確認「換任何種子都過」：用環境變數 SEED 換種子連跑很多次（PowerShell：$env:SEED = 7; node test/reaction/t_price.js）。
const SEED = seedOf(20261007); const rnd = rng(SEED);
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
// 難度：實付差距（分段線性）、優惠種類逐題解鎖
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
ok(near(T.gapFor(1), 400) && near(T.gapFor(10), 90) && near(T.gapFor(20), 10) && near(T.gapFor(35), 10) && near(T.gapFor(5), 400 + (90 - 400) * 4 / 9) && near(T.gapFor(15), 50), 'gap anchors 400 / 90 / 10');
let monoGap = true; for (let l = 2; l <= 30; l++) if (T.gapFor(l) > T.gapFor(l - 1) + 1e-9) monoGap = false; ok(monoGap, 'gap never grows');
ok(T.kindsFor(1).join() === 'fold' && T.kindsFor(3).indexOf('off') >= 0 && T.kindsFor(5).indexOf('step') >= 0 && T.kindsFor(6).indexOf('thresh') >= 0 && T.kindsFor(7).indexOf('coupon') >= 0 && T.kindsFor(2).length === 1, 'kinds unlock');
// 手算幾個折扣
const C = (orig, steps) => ({ orig, steps, formal: false });
ok(T.payOf(C(3800, [{ k: 'fold', fold: 8 }])).final === 3040, 'fold');
ok(T.payOf(C(3800, [{ k: 'step', every: 1000, minus: 100 }])).final === 3500, 'every 1000 minus 100 (cumulative)');
ok(T.payOf(C(1999, [{ k: 'thresh', min: 2000, amt: 300 }])).final === 1999 && T.payOf(C(2000, [{ k: 'thresh', min: 2000, amt: 300 }])).final === 1700, 'threshold applies once at >= min');
ok(T.payOf(C(5000, [{ k: 'fold', fold: 8 }, { k: 'coupon', amt: 150 }, { k: 'member', fold: 9 }])).final === 3465 && T.payOf(C(5000, [{ k: 'fold', fold: 8 }, { k: 'coupon', amt: 150 }, { k: 'member', fold: 9 }])).trail.join() === '5000,4000,3850,3465', 'multi step trail');
ok(T.payOf(C(1010, [{ k: 'fold', fold: 8.5 }])) === null, 'non-integer step is rejected');
ok(T.discLines(C(3800, [{ k: 'fold', fold: 8 }, { k: 'coupon', amt: 150 }, { k: 'member', fold: 9 }])).join('|') === '打八折|再折價券折一百五十元|會員再享九折優惠', 'discount lines');
ok(T.calcText(C(3800, [{ k: 'fold', fold: 8 }])) === '3800 → 3040 元', 'calc text');
// 出題
let cnt = 0, fallback = 0, memberSeen = 0;
const res = {};
for (let lv = 1; lv <= 30; lv++) {
  const P = T.paramsFor(lv); let kinds = {}, gaps = [], steps = [], lowOrigCheaper = 0, N = 300, formalCnt = 0;
  for (let k = 0; k < N; k++) {
    const q = T.makeQuestion(lv, rnd); cnt++;
    if (q.tries < 0) fallback++;
    const [A, B] = q.tags;
    const pa = T.payOf(A), pb = T.payOf(B);
    ok(pa && pb && pa.final === A.final && pb.final === B.final && A.trail.join() === pa.trail.join(), 'payOf matches stored values');
    ok(q.lowIdx === (A.final < B.final ? 0 : 1) && A.final !== B.final, 'lowIdx');
    const gap = Math.abs(A.final - B.final);
    ok(gap === q.gap && gap >= P.gapLow - 1e-9 && gap <= P.gap + 1e-9, 'gap in range lv' + lv + ' gap ' + gap + ' want ' + P.gapLow + '..' + P.gap);
    ok(A.orig !== B.orig, 'original prices differ');
    const keysA = A.steps.filter(s => s.k !== 'member').map(T.stepKey), keysB = B.steps.filter(s => s.k !== 'member').map(T.stepKey);
    ok(!keysA.some(x => keysB.indexOf(x) >= 0), 'no identical discount on both cards');
    const mA = A.steps.filter(s => s.k === 'member'), mB = B.steps.filter(s => s.k === 'member');
    ok(mA.length === mB.length && (mA.length === 0 || T.stepKey(mA[0]) === T.stepKey(mB[0])), 'member decoy is on both cards or neither, and identical');
    if (mA.length) { memberSeen++; ok(lv >= 8, 'member decoy only from level 8'); ok(A.steps[A.steps.length - 1].k === 'member', 'member is last'); }
    // 直覺衝突：原價低的那張折扣比例比較小
    const lowO = A.orig < B.orig ? A : B, highO = lowO === A ? B : A;
    ok(T.rateOf(lowO) < T.rateOf(highO), 'lower original has the smaller discount rate');
    // 便宜的那張是誰是隨機的：統計「原價低的那張比較便宜」的比例
    if (lowO.final < highO.final) lowOrigCheaper++;
    [A, B].forEach(tg => {
      ok(tg.steps.length <= T.maxSteps(lv) + 1, 'step count');
      ok(tg.orig <= 99999 && tg.orig >= 300, 'orig range');
      tg.steps.forEach(s => { kinds[s.k] = 1; ok(s.k === 'member' || T.kindsFor(lv).indexOf(s.k) >= 0, 'kind allowed at level'); });
      const ks = tg.steps.map(s => s.k); ok(new Set(ks).size === ks.length, 'no repeated kind in one card');
      steps.push(tg.steps.filter(s => s.k !== 'member').length); if (tg.formal) formalCnt++;
    });
    gaps.push(gap);
  }
  res[lv] = { kinds: Object.keys(kinds).join(','), avgGap: gaps.reduce((a, b) => a + b, 0) / gaps.length, avgSteps: steps.reduce((a, b) => a + b, 0) / steps.length, lowCheaper: lowOrigCheaper / N, formal: formalCnt / (2 * N) };
}
[1, 3, 5, 8, 10, 15, 20, 25].forEach(l => console.log('lv' + l, 'kinds', res[l].kinds, 'avg gap', res[l].avgGap.toFixed(0), 'avg steps', res[l].avgSteps.toFixed(2), 'lower-original-cheaper', (res[l].lowCheaper * 100).toFixed(0) + '%', 'formal', (res[l].formal * 100).toFixed(0) + '%'));
ok(fallback === 0, 'fallback question never used (' + fallback + ')');
ok(memberSeen > 0, 'member decoy appears');
ok(res[1].avgGap > 200 && res[10].avgGap < 100 && res[20].avgGap <= 10 && res[25].avgGap <= 10, 'average gaps follow the schedule');
// 「便宜的是原價低的那張」的比例：不是剛好 50%——題目是先隨機決定哪張比較便宜、再挑出「原價低的那張折扣比例比較小」的組合，
// 用 6000 題量過：第 1 關約 64%、第 2、3 關約 60%、第 5 關約 56%、第 8 關約 52%、第 10 關起約 50%。
// 只要不是接近 0% 或 100%（那就變成「永遠選原價低的」或「永遠選原價高的」的必勝捷徑）就好，所以界線仍然訂在 0.3～0.7。
// 每關只抽 300 題的話標準差約 0.028，第 1 關的 0.64 離上界 0.7 只有 2 個標準差（大約每 25 次執行會失敗 1 次），
// 所以這個檢查另外每關抽 2000 題（標準差約 0.011，第 1 關離上界 5 個標準差以上）。
const SHORTCUT_N = 2000, lowShare = {};
for (const l of [1, 5, 10, 20]) {
  let lowCheap = 0;
  for (let k = 0; k < SHORTCUT_N; k++) { const [A, B] = T.makeQuestion(l, rnd).tags; const lowO = A.orig < B.orig ? A : B, highO = lowO === A ? B : A; if (lowO.final < highO.final) lowCheap++; }
  lowShare[l] = lowCheap / SHORTCUT_N;
}
ok([1, 5, 10, 20].every(l => lowShare[l] > 0.3 && lowShare[l] < 0.7), 'which card is cheaper is random (neither shortcut works): ' + [1, 5, 10, 20].map(l => 'lv' + l + ' ' + (lowShare[l] * 100).toFixed(1) + '%').join(', ') + ' (seed ' + SEED + ')');
ok(res[1].avgSteps === 1 && res[10].avgSteps > res[3].avgSteps, 'later levels combine more discounts');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS', cnt);
