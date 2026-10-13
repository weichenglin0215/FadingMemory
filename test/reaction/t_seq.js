const { game } = require('./load.js');
const G = game('reaction_seq.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 難度曲線
ok(T.nAttrFor(1) === 1 && T.nAttrFor(20) === 3 && T.kFor(1) === 2 && T.kFor(20) === 3 && near(T.timeFor(1), 15) && near(T.timeFor(20), 8), 'ramps');
let mono = true; for (let l = 2; l <= 20; l++) if (T.nAttrFor(l) < T.nAttrFor(l - 1) || T.kFor(l) < T.kFor(l - 1) || T.timeFor(l) > T.timeFor(l - 1)) mono = false;
ok(mono, 'monotone difficulty');
// 手算：循環、旋轉、大小
ok(JSON.stringify(T.nextCycle(['a', 'b', 'a', 'b', 'a'])) === '["b"]' && JSON.stringify(T.nextCycle(['a', 'b', 'c', 'a', 'b'])) === '["c"]' && JSON.stringify(T.nextCycle([3, 3, 3, 3, 3])) === '[3]', 'cycle prediction');
ok(JSON.stringify(T.nextRotation([0, 45, 90, 135, 180])) === '[225]' && JSON.stringify(T.nextRotation([90, 0, 270, 180, 90])) === '[0]' && JSON.stringify(T.nextRotation([45, 45, 45, 45, 45])) === '[45]', 'rotation prediction');
ok(JSON.stringify(T.nextSize([1, 2, 3, 2, 1])) === '[2]' && JSON.stringify(T.nextSize([1, 2, 3, 4, 5])) === '[6]' && JSON.stringify(T.nextSize([6, 5, 4, 3, 2])) === '[1]' && JSON.stringify(T.nextSize([4, 4, 4, 4, 4])) === '[4]', 'size prediction');
// 獨立的暴力窮舉：把整個規則空間展開，找出所有吻合的規則，比較它們的「下一個」
function bruteCycle(values, symbols) {
  const nexts = new Set();
  const n = values.length;
  for (let p = 1; p <= 3; p++) {
    const total = Math.pow(symbols.length, p);
    for (let code = 0; code < total; code++) {
      const pat = []; let c = code; for (let i = 0; i < p; i++) { pat.push(symbols[c % symbols.length]); c = Math.floor(c / symbols.length); }
      let fit = true; for (let i = 0; i < n; i++) if (values[i] !== pat[i % p]) { fit = false; break; }
      if (fit) nexts.add(pat[n % p]);
    }
  }
  return [...nexts];
}
function bruteRotation(values) { const nexts = new Set(); for (let start = 0; start < 360; start += 45) for (let d = 0; d < 360; d += 45) { let fit = true; for (let i = 0; i < values.length; i++) if (((start + d * i) % 360) !== values[i]) { fit = false; break; } if (fit) nexts.add((start + d * values.length) % 360); } return [...nexts]; }
function bruteSize(values) {
  const nexts = new Set(), n = values.length, M = T.SIZE_MAX;
  const fams = [];
  for (let s = 1; s <= M; s++) fams.push(i => s);
  fams.push(i => 1 + i, i => M - i, i => 1 + i - 0);  // up from 1, down from M
  fams.push(i => i); // placeholder never matches 1-based values meaningfully
  for (let a = 1; a + 2 <= M; a++) for (let ph = 0; ph < 4; ph++) fams.push(i => a + [0, 1, 2, 1][(i + ph) % 4]);
  fams.forEach(f => { let fit = true; for (let i = 0; i < n; i++) if (f(i) !== values[i]) { fit = false; break; } const nx = f(n); if (fit && nx >= 1 && nx <= M) nexts.add(nx); });
  // 單調（+1 從任意起點、−1）：和 nextSize 的定義一致——只要相鄰差固定為 ±1 就吻合
  [1, -1].forEach(d => { let fit = true; for (let i = 1; i < n; i++) if (values[i] - values[i - 1] !== d) fit = false; const nx = values[n - 1] + d; if (fit && nx >= 1 && nx <= M) nexts.add(nx); });
  return [...nexts];
}
const eqSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

let notUnique = 0, wrongAns = 0, rotInvisible = 0, optBad = 0, distBad = 0, brute = 0, varyBad = 0;
const attrCount = { 1: [], 20: [] }, allShapes = T.SHAPES_ASYM.concat(T.SHAPES_SYM);
for (let level = 1; level <= 20; level++) {
  for (let k = 0; k < 250; k++) {
    const S = T.makeSequence(level);
    if (S.shown.length !== T.shownFor(level) || S.kind !== 'shape' || !T.isUnique(S.shown)) notUnique++;
    if (level === 1 || level === 20) attrCount[level].push(S.rules.vary.length);
    if (S.rules.vary.length !== T.nAttrFor(level)) varyBad++;
    // 暴力窮舉的「下一個」要和程式一致
    const col = key => S.shown.map(it => it[key]);
    if (!eqSet(bruteCycle(col('shape'), allShapes), T.consistentNext(S.shown).shape) || !eqSet(bruteCycle(col('color'), [0, 1, 2, 3, 4]), T.consistentNext(S.shown).color) || !eqSet(bruteRotation(col('rotation')), T.consistentNext(S.shown).rotation) || !eqSet(bruteSize(col('size')), T.consistentNext(S.shown).size)) brute++;
    // 答案 = 唯一吻合規則推得的下一個
    const cn = T.consistentNext(S.shown);
    if (cn.shape[0] !== S.answer.shape || cn.color[0] !== S.answer.color || cn.rotation[0] !== S.answer.rotation || cn.size[0] !== S.answer.size) wrongAns++;
    // 會旋轉時，所有形狀都要看得出轉了多少
    if (S.rules.vary.includes('rotation') && !S.shown.concat([S.answer]).every(it => T.SHAPES_ASYM.includes(it.shape))) rotInvisible++;
    // 選項
    const keys = S.options.map(T.visualKey);
    if (S.options.length !== 4 || new Set(keys).size !== 4 || keys.filter(x => x === T.visualKey(S.answer)).length !== 1 || T.visualKey(S.options[S.correct]) !== T.visualKey(S.answer)) optBad++;
    S.options.forEach((o, i) => { if (i === S.correct) return; const diff = ['shape', 'color', 'rotation', 'size'].filter(a => o[a] !== S.answer[a]).length; if (diff !== 1) distBad++; });
    // 序列本身：循環長度正確
    if (S.rules.vary.includes('shape') && new Set(S.shown.map(i => i.shape)).size < Math.min(S.rules.K, 2)) ok(false, 'shape cycle visible');
  }
}
ok(notUnique === 0, 'every sequence has a unique next item (' + notUnique + ')');
ok(brute === 0, 'consistentNext equals the independent brute force (' + brute + ' differ)');
ok(wrongAns === 0, 'answer equals the unique prediction (' + wrongAns + ')');
ok(rotInvisible === 0, 'rotating sequences only use shapes whose rotation is visible');
ok(optBad === 0, 'options: 4 visually distinct, exactly one correct (' + optBad + ')');
ok(distBad === 0, 'each distractor differs from the answer in exactly one attribute (' + distBad + ')');
ok(varyBad === 0, 'number of varying attributes follows the ramp');
ok(attrCount[1].every(x => x === 1) && attrCount[20].every(x => x === 3), 'level 1 → 1 attribute, level 20 → 3');
// 說明
const S0 = T.makeSequence(20); ok(T.explain(S0).length === 3, 'explain lists every varying attribute');
ok(T.visualKey({ shape: 'circle', color: 1, rotation: 90, size: 3 }) === T.visualKey({ shape: 'circle', color: 1, rotation: 45, size: 3 }) && T.visualKey({ shape: 'square', color: 1, rotation: 90, size: 3 }) === T.visualKey({ shape: 'square', color: 1, rotation: 0, size: 3 }) && T.visualKey({ shape: 'tri', color: 1, rotation: 90, size: 3 }) !== T.visualKey({ shape: 'tri', color: 1, rotation: 0, size: 3 }), 'visualKey respects symmetry');
ok(T.rating(2) !== T.rating(8) && T.rating(8) !== T.rating(15) && T.rating(15) !== T.rating(22), 'rating tiers');
// ═══ V1.25：取消機會、最多 8 格、不壓灰、大小差異加大、數字題 ═══
{ const { rng } = require('./load.js'); const rnd = rng(20261013);
  // 上方最多 8 格（顯示的圖案最多 7 個＋「？」）：4 → 7 線性
  ok(T.shownFor(1) === 4 && T.shownFor(20) === 7 && T.shownFor(99) === 7, '顯示圖案數 4 → 7：' + T.shownFor(1) + '、' + T.shownFor(20));
  for (let l = 1; l <= 20; l++) { ok(T.shownFor(l) + 1 <= 8 && T.numShownFor(l) + 1 <= 8, '第 ' + l + ' 題上方最多 8 格'); if (l > 1) ok(T.shownFor(l) >= T.shownFor(l - 1), '顯示圖案數不減'); }
  // 大小差異：縮放範圍加大、干擾選項的大小跟正解差 2 級以上
  ok(T.SCALE_MIN + 5 * T.SCALE_STEP >= 0.99 && T.SCALE_MIN < 0.45 && T.SCALE_STEP > 0.11, '縮放 ' + T.SCALE_MIN + '～' + (T.SCALE_MIN + 5 * T.SCALE_STEP).toFixed(2) + '（原本 0.45～1.0，每級 0.11）');
  let sizeBad = 0, sizeDist = 0;
  for (let l = 1; l <= 20; l++) for (let i = 0; i < 200; i++) { const S = T.makeSequence(l, rnd); S.options.forEach((o, j) => { if (j === S.correct) return; if (o.size !== S.answer.size) { sizeDist++; if (Math.abs(o.size - S.answer.size) < T.SIZE_GAP) sizeBad++; } }); }
  ok(sizeDist > 100 && sizeBad === 0, '「大小」干擾選項跟正解至少差 ' + T.SIZE_GAP + ' 級（出現 ' + sizeDist + ' 次、違規 ' + sizeBad + '）');
  // nextNumbers 手算
  const nn = v => JSON.stringify(T.nextNumbers(v));
  ok(nn([2, 4, 6, 8, 10]) === '[12]' && nn([1, 2, 4, 8, 16]) === '[32]' && nn([5, 3, 1, -1, -3]) === '[-5]', '等差、等比、遞減');
  ok(nn([10, 17, 15, 22, 20]) === '[27]' && nn([3, 4, 6, 9, 13]) === '[18]' && nn([1, 2, 3, 5, 8]) === '[13]' && nn([3, 5, 9, 17, 33]) === '[65]', '輪流加減、差越來越大、前兩個相加、乘 2 減 1');
  ok(nn([2, 4, 7, 11, 16]) === '[22]', '差 2、3、4、5 → 下一個差 6');
  // 暴力核對：獨立地列舉所有參數，比較「下一個」
  function brute(v) {
    const out = new Set(), n = v.length, cap = T.NUM_CAP;
    for (let d = -60; d <= 60; d++) { let fit = true; for (let i = 1; i < n; i++) if (v[i] - v[i - 1] !== d) fit = false; if (fit) out.add(v[n - 1] + d); }                       // 等差
    for (let a = -60; a <= 60; a++) for (let b = -60; b <= 60; b++) { if (n < 5) continue; let fit = true; for (let i = 1; i < n; i++) if (v[i] - v[i - 1] !== (i % 2 === 1 ? a : b)) fit = false; if (fit) out.add(v[n - 1] + (n % 2 === 1 ? a : b)); }   // 輪流
    for (let d0 = -60; d0 <= 60; d0++) for (let e = -30; e <= 30; e++) { if (n < 4) continue; let fit = true; for (let i = 1; i < n; i++) if (v[i] - v[i - 1] !== d0 + e * (i - 1)) fit = false; if (fit) out.add(v[n - 1] + d0 + e * (n - 1)); }   // 二階等差
    { let fit = n >= 4; for (let i = 2; i < n; i++) if (v[i] !== v[i - 1] + v[i - 2]) fit = false; if (fit) out.add(v[n - 1] + v[n - 2]); }                                        // 前兩個相加
    for (let m = -9; m <= 9; m++) for (let c = -60; c <= 60; c++) { if (n < 4) continue; let fit = true; for (let i = 1; i < n; i++) if (v[i] !== m * v[i - 1] + c) fit = false; if (fit) out.add(m * v[n - 1] + c); }   // 乘 m 加 c
    return [...out].filter(x => Math.abs(x) <= cap).sort((x, y) => x - y);
  }
  let numBad = 0, numTotal = 0, kinds = {};
  for (let l = T.NUM_FROM; l <= 20; l++) for (let i = 0; i < 80; i++) {
    const S = T.makeNumSequence(l, rnd); numTotal++; kinds[S.rule.type] = (kinds[S.rule.type] || 0) + 1;
    const b = brute(S.shown), p = T.nextNumbers(S.shown).slice().sort((x, y) => x - y);
    if (JSON.stringify(b) !== JSON.stringify(p) || p.length !== 1 || p[0] !== S.answer) numBad++;
    ok(S.kind === 'num' && S.shown.length === T.numShownFor(l) && S.options.length === 4 && new Set(S.options).size === 4 && S.options[S.correct] === S.answer, '數字題：4 個不同選項、一個正解、顯示 ' + T.numShownFor(l) + ' 個');
    ok(S.shown.every(x => Number.isInteger(x) && Math.abs(x) <= T.NUM_CAP) && Math.abs(S.answer) <= T.NUM_CAP, '數字都是整數、在範圍內');
    ok(S.options.every(x => Number.isInteger(x) && Math.abs(x) <= T.NUM_CAP) && (S.shown.some(x => x < 0) || S.answer < 0 || S.options.every(x => x >= 0)), '選項都是整數；數列與答案都沒有負數時選項也沒有');
    ok(typeof S.rule.text === 'string' && S.rule.text.length > 3, '有規則說明：' + S.rule.text);
    ok(T.explainAny(S)[0] === S.rule.text, 'explainAny 數字題＝規則說明');
  }
  ok(numBad === 0, '數字題：窮舉規則空間推得的下一個唯一，而且等於答案（不一致 ' + numBad + ' / ' + numTotal + '）');
  ok(Object.keys(kinds).length >= 5, '數字規則都出現過：' + JSON.stringify(kinds));
  // 規則依題號解鎖
  ok(T.numTypesFor(3).join() === 'arith,affine0' && T.numTypesFor(6).includes('alt') && T.numTypesFor(6).includes('grow') && !T.numTypesFor(6).includes('fib') && T.numTypesFor(11).includes('fib') && T.numTypesFor(11).includes('affine'), '數字規則依題號解鎖');
  // 題型比例：第 3 題起數字題約 35%，前 2 題一定是圖案題
  let nums = 0, total = 0; for (let i = 0; i < 1500; i++) { if (T.makeQuestion(10, rnd).kind === 'num') nums++; total++; }
  ok(Math.abs(nums / total - T.NUM_P) < 0.05, '第 10 題數字題比例 ' + (nums / total).toFixed(3) + '（目標 ' + T.NUM_P + '）');
  for (let i = 0; i < 300; i++) ok(T.makeQuestion(2, rnd).kind === 'shape' && T.makeQuestion(1, rnd).kind === 'shape', '第 1、2 題一定是圖案題');
  // 原始碼／樣式：沒有機會、揭曉不壓灰（不用 disabled）、粗邊框
  const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_seq.js'), 'utf8'), css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/reaction2.css'), 'utf8');
  ok(!/LIVES|lives|機會 '/.test(src.replace(/取消「機會」/g, '')), '程式裡沒有機會（LIVES／lives）的參數與顯示');
  ok(src.indexOf('b.disabled = true') < 0 && src.indexOf('sq-opt--locked') > 0, '揭曉時不再用 disabled（會變灰），改用 sq-opt--locked');
  ok(/\.sq-opt--ok \{[^}]*border: 10px solid var\(--c-ok\)/.test(css) && /\.sq-opt--bad \{[^}]*border: 10px solid var\(--c-bad-light\)/.test(css), '正確答案綠色粗邊框、選錯紅色粗邊框');
  ok(!/\.sq-opt--(ok|bad) \{[^}]*background/.test(css), '正確／錯誤的卡片沒有上色底（不壓一層色）');
  ok(/\.sq-opt--locked \{[^}]*pointer-events: none/.test(css), '揭曉後不能再點');
}
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
