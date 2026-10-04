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
    if (S.shown.length !== T.SHOWN || !T.isUnique(S.shown)) notUnique++;
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
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
