// 撲滿有多少（piggybank）：重量都是質數 11 以上、枚數規矩、唯一解（對照暴力）、階段（給不給總枚數）、答案不偏向 1 或 9、判定
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_piggybank.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261103); const rnd = rng(SEED);
const isPrime = n => { if (n < 2) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };

ok(G.id === 'piggybank' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
T.STAGES.forEach(st => ok(st.primes.every(p => isPrime(p) && p >= 11), '質數表都是 11 以上的質數 ' + st.primes));
// 暴力數解（不剪枝）對照 countSolutions
function brute(ws, W, N, mode) {
  const r = T.rangeOf(mode), vals = []; for (let v = r.lo; v <= r.hi; v += r.step) vals.push(v);
  let n = 0; const rec = (i, w, c) => { if (i === ws.length) { if (w === W && (N == null || c === N)) n++; return; } vals.forEach(v => rec(i + 1, w + ws[i] * v, c + v)); };
  rec(0, 0, 0); return n;
}
for (let k = 0; k < 60; k++) {
  const ws = [11, 13, 17, 19, 23, 29].sort(() => rnd() - 0.5).slice(0, 2 + (k % 2)), mode = k % 3 ? 'digit' : 'even';
  const W = 40 + Math.floor(rnd() * 300), N = k % 4 ? null : 10 + Math.floor(rnd() * 10);
  ok(T.countSolutions(ws, W, N, mode, 1e9) === brute(ws, W, N, mode), '解的個數跟暴力一致 ' + ws + ' W=' + W);
}
// 出題：每一關都唯一、規矩對、階段對
let digitExt = 0, digitN = 0, evenSeen = 0, late = 0;
for (let lv = 1; lv <= 40; lv++) for (let k = 0; k < 25; k++) {
  const p = T.makePuzzle(lv, rnd), st = T.stageOf(lv), r = T.rangeOf(p.mode);
  ok(p.ws.length === st.k && p.ws.every(w => st.primes.includes(w)) && new Set(p.ws).size === p.ws.length, '第 ' + lv + ' 關：' + st.k + ' 種不同的質數 ' + p.ws);
  ok(p.cs.every(c => c >= r.lo && c <= r.hi && (c - r.lo) % r.step === 0), '第 ' + lv + ' 關：枚數符合規矩 ' + p.cs + ' ' + p.mode);
  ok(st.giveN ? p.N === T.countOf(p.cs) : p.N === null, '第 ' + lv + ' 關：' + (st.giveN ? '給' : '不給') + '總枚數');
  ok(T.weightOf(p.ws, p.cs) === p.W, '總重');
  ok(T.countSolutions(p.ws, p.W, p.N, p.mode, 2) === 1, '第 ' + lv + ' 關：答案唯一');
  ok(T.isRight(p, p.cs), '答案判定為對');
  if (lv < T.EVEN_FROM) ok(p.mode === 'digit', '第 ' + lv + ' 關前沒有偶數枚');
  if (p.mode === 'even') evenSeen++;
  if (lv >= 21 && p.mode === 'digit') { digitN++; if (p.cs.some(c => c === 1 || c === 9)) digitExt++; }
  if (lv >= 21) late++;
}
// 3 種只給總重：唯一題的答案不偏向 1 或 9（亂出的話 1-(7/9)^3＝53%；實測約 54%，門檻 70%）
ok(digitN > 100 && digitExt / digitN < 0.7, '後段答案含 1 或 9 枚的比例 ' + (digitExt / digitN * 100).toFixed(0) + '%（' + digitN + ' 題）');
ok(evenSeen > 50, '偶數枚的關卡有出現（' + evenSeen + '）');
// 判定：錯一枚、規矩外的數字、重量對但枚數不對
{
  const p = { ws: [11, 13], cs: [3, 4], W: 85, N: 7, mode: 'digit' };
  ok(T.isRight(p, [3, 4]) && !T.isRight(p, [4, 3]) && !T.isRight(p, [0, 4]), '判定（雞兔同籠）');
  ok(T.equation([11, 13], [3, 4]) === '11×3 ＋ 13×4 ＝ 85 克', '算式文字');
  const q = { ws: [13, 17], cs: [4, 6], W: 154, N: null, mode: 'even' };
  ok(T.isRight(q, [4, 6]) && !T.isRight(q, [5, 6]), '偶數枚：奇數不算');
}
ok(T.stageOf(1).k === 2 && T.stageOf(1).giveN && !T.stageOf(7).giveN && T.stageOf(13).k === 3 && T.stageOf(13).giveN && !T.stageOf(21).giveN && T.stageOf(90).k === 3, '階段');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
