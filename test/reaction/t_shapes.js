// 形形色色：V1.24 難度慢慢增加（玩家說第 11 關突然出現很複雜的字、難度一下變很難）
//   ① 彩度第 1 關最高、逐關線性降到第 15 關完全無彩度（黑白）；「混合」考驗的色相差同時變小
//   ② 每一組圖案有「複雜度」，每一關有「目標複雜度」（前 10 關最低、之後線性升高），用鐘形權重隨機抽：符號、數字慢慢變少，中文字筆畫慢慢變多
const { game, rng, seedOf } = require('./load.js');
global.UI.esc = (s) => s;
const G = game('reaction_shapes.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261011), rnd = rng(SEED);

// ── 題庫 ──
const han = T.PAIRS.filter(p => p.type === 'text' && /^[一-鿿]$/.test(p.a));
ok(han.length >= 40, '中文字組合至少 40 組：' + han.length);
ok(han.every(p => p.colorable && p.a !== p.b && /^[一-鿿]$/.test(p.b) && typeof p.st === 'number' && p.st >= 2 && p.st <= 26), '每一組中文字都是兩個不同的單一中文字、可套顏色、有平均筆畫數 st（2～26）');
ok(new Set(han.map(p => p.a + p.b)).size === han.length, '沒有重複的中文字組合');
ok(T.PAIRS.every(p => p.hard === undefined), '舊的 hard 旗標已經拿掉');
ok(T.PAIRS.some(p => p.type === 'svg') && T.PAIRS.some(p => p.type === 'emoji') && T.PAIRS.some(p => /^[0-9]$/.test(p.a)) && T.PAIRS.some(p => /^[A-Z]$/.test(p.a)), '符號、emoji、數字、英文字母的題材都還在');
ok(T.PAIRS.filter(p => p.type === 'emoji').every(p => p.colorable === false) && T.COLORABLE.every(p => p.colorable), 'emoji 不能套色，只出現在「形狀」考驗');
// 筆畫要能「一點一點增加」：低（≤5）、中（7～16）、高（≥19）三個區段都要有足夠的組合
const lowHan = han.filter(p => p.st <= 6), midHan = han.filter(p => p.st >= 7 && p.st <= 16), highHan = han.filter(p => p.st >= 19);
ok(lowHan.length >= 10 && midHan.length >= 12 && highHan.length >= 12, '筆畫少／中／多的組合數：' + lowHan.length + '／' + midHan.length + '／' + highHan.length);
// 複雜度：符號 < emoji < 數字 < 英文字母 ≤ 筆畫少的字 < 筆畫中等的字 < 筆畫多的字，全部在 0～1
const svg0 = T.PAIRS.find(p => p.type === 'svg'), emo0 = T.PAIRS.find(p => p.type === 'emoji'), dig0 = T.PAIRS.find(p => /^[0-9]$/.test(p.a)), let0 = T.PAIRS.find(p => /^[A-Z]$/.test(p.a));
ok(T.complexityOf(svg0) < T.complexityOf(emo0) && T.complexityOf(emo0) < T.complexityOf(dig0) && T.complexityOf(dig0) < T.complexityOf(let0), 'cx：符號 < emoji < 數字 < 英文字母');
T.PAIRS.forEach(p => ok(T.complexityOf(p) >= 0 && T.complexityOf(p) <= 1, 'cx in 0..1'));
ok(near(T.complexityOf({ type: 'text', a: '二', b: '三', st: 3 }), 0.15) && near(T.complexityOf({ type: 'text', a: '籬', b: '籮', st: 25 }), 1.0), 'cx 3 畫＝0.15、25 畫＝1.0');
const cxs = han.map(p => [p.st, T.complexityOf(p)]).sort((a, b) => a[0] - b[0]);
for (let i = 1; i < cxs.length; i++) ok(cxs[i][1] >= cxs[i - 1][1] - 1e-12, 'cx never decreases with strokes');

// ── 目標複雜度：前 10 關固定最低，之後線性升高，第 30 關到頂 ──
ok(T.CX_FLAT === 10 && T.CX_RAMP === 30, 'CX_FLAT 10、CX_RAMP 30');
for (let l = 1; l <= T.CX_FLAT; l++) ok(near(T.targetCx(l), T.CX_LOW), 'targetCx(' + l + ') is the lowest');
ok(near(T.targetCx(T.CX_RAMP), T.CX_HIGH) && near(T.targetCx(99), T.CX_HIGH), 'targetCx reaches the top at level 30 and stays');
{ const d1 = T.targetCx(12) - T.targetCx(11); for (let l = 11; l < 30; l++) ok(near(T.targetCx(l + 1) - T.targetCx(l), d1, 1e-12) && d1 > 0, 'targetCx grows linearly after level 10 (' + l + ')'); }

// ── 抽題：符號、數字慢慢減少，中文字筆畫慢慢變多；第 11 關不會突然很難；而且是隨機的 ──
function sample(level, n, pool) { const out = []; for (let i = 0; i < n; i++) out.push(T.pickPair(pool || T.PAIRS, level, rnd)); return out; }
const isSimple = p => p.type === 'svg' || p.type === 'emoji' || /^[0-9]$/.test(p.a) || /^[A-Z]$/.test(p.a);
const share = (arr, f) => arr.filter(f).length / arr.length;
const meanSt = arr => { const h = arr.filter(p => p.st != null); return h.reduce((s, p) => s + p.st, 0) / h.length; };
const N = 6000, S = {};
[1, 5, 10, 11, 12, 15, 20, 25, 30, 40].forEach(l => { S[l] = sample(l, N); });
/* V1.33 共用字庫多了 6.5 畫的「肝汗」：上限改成跟著 CX_LOW＋CX_AHEAD 算（約 6.9 畫） */
{ const maxSt = 3 + 22 * (T.CX_LOW + T.CX_AHEAD - 0.15) / 0.85; ok(maxSt < 7.5 && share(S[1], p => p.st != null && p.st > maxSt) === 0 && share(S[10], p => p.st != null && p.st > maxSt) === 0, '第 1～10 關只抽符號、數字、筆畫少（' + maxSt.toFixed(1) + ' 畫以內）的字'); }
// 嚴格：任何一關都不會抽到「比目標複雜度難超過 CX_AHEAD」的題材（不會突然跳出太難的字）
for (const l of [1, 5, 10, 11, 12, 15, 20, 25, 30]) ok(S[l].every(p => T.complexityOf(p) <= T.targetCx(l) + T.CX_AHEAD + 1e-12), 'level ' + l + ' never picks a pair harder than target + ' + T.CX_AHEAD);
// 難度是逐步放開的：每過一關，「最難」的字平均筆畫只會一點一點增加
{ let prevMax = 0; for (let l = 10; l <= 30; l++) { const mx = Math.max.apply(null, sample(l, 3000).map(p => p.st || 0)); ok(mx >= prevMax - 1e-9 || l === 10, 'the hardest pair seen does not drop at level ' + l); if (l > 10) ok(mx - prevMax <= 7.1, 'the hardest pair grows by a small step at level ' + l + ' (' + prevMax + ' → ' + mx + ')'); prevMax = Math.max(prevMax, mx); } }
ok(share(S[1], isSimple) > 0.35, '第 1 關有一大部分是符號、數字、字母：' + share(S[1], isSimple).toFixed(2));
// 第 11 關：不會突然出現很複雜的字（原本第 11 關起筆畫多的字就有 30% 以上的機率）
ok(share(S[11], p => p.st != null && p.st >= 15) < 0.01, '第 11 關幾乎不會抽到 15 畫以上的字：' + share(S[11], p => p.st != null && p.st >= 15).toFixed(4));
ok(share(S[15], p => p.st != null && p.st >= 19) < 0.03, '第 15 關 19 畫以上的字還很少：' + share(S[15], p => p.st != null && p.st >= 19).toFixed(4));
// 符號／數字的比例單調下降，筆畫的平均單調上升（取樣誤差內）
let prevSimple = 2, prevSt = 0;
[1, 10, 15, 20, 25, 30].forEach(l => {
  const sh = share(S[l], isSimple), ms = meanSt(S[l]);
  ok(sh <= prevSimple + 0.02, 'symbols/digits share does not increase at level ' + l + ': ' + sh.toFixed(3));
  ok(ms >= prevSt - 0.2, 'mean strokes does not decrease at level ' + l + ': ' + ms.toFixed(2));
  prevSimple = sh; prevSt = ms;
});
ok(share(S[30], isSimple) < 0.02 && meanSt(S[30]) > 17, '第 30 關幾乎都是筆畫多的字（平均 ' + meanSt(S[30]).toFixed(1) + ' 畫）');
ok(share(S[20], isSimple) < 0.15 && meanSt(S[20]) > 9 && meanSt(S[20]) < 17, '第 20 關是中等筆畫為主（平均 ' + meanSt(S[20]).toFixed(1) + ' 畫）');
console.log('mean strokes by level: ' + [1, 10, 11, 15, 20, 25, 30, 40].map(l => l + ':' + meanSt(S[l]).toFixed(1)).join('  ') + '；simple share: ' + [1, 10, 15, 20, 30].map(l => l + ':' + share(S[l], isSimple).toFixed(2)).join('  '));
// 隨機：同一個關卡抽很多次，不會永遠同一組（第 11 關不會固定出某個字）
for (const l of [1, 11, 20, 30]) { const keys = new Set(S[l].slice(0, 400).map(p => p.a + p.b)); ok(keys.size >= 8, 'level ' + l + ' picks a variety of pairs (' + keys.size + ')'); }
// 混合考驗用的題庫（COLORABLE）也是同一套抽法
ok(T.COLORABLE.indexOf(T.pickPair(T.COLORABLE, 20, rnd)) >= 0 && sample(1, 500, T.COLORABLE).every(p => p.colorable), 'COLORABLE pool works');
ok(sample(1, 500, T.COLORABLE).every(p => p.type !== 'emoji'), '混合考驗不會抽到 emoji');

// ── 顏色：彩度逐關降到 0（黑白）、色相差變小 ──
ok(T.SAT_END_LEVEL === 15 && near(T.satFor(1), T.SAT_START) && near(T.satFor(15), 0) && near(T.satFor(40), 0), '彩度第 1 關最高、第 15 關起 0');
for (let l = 1; l < 15; l++) ok(T.satFor(l) > T.satFor(l + 1) + 1e-9, 'saturation strictly decreases until level 15 (' + l + ')');
{ const d = T.satFor(1) - T.satFor(2); for (let l = 1; l < 15; l++) ok(near(T.satFor(l) - T.satFor(l + 1), d, 1e-9), 'saturation decreases linearly (' + l + ')'); }
ok(near(T.hueDiffFor(1), T.HUE_START) && near(T.hueDiffFor(14), T.HUE_END), '色相差 180 → 24 度（第 1 → 14 關）');
for (let l = 1; l < 14; l++) ok(T.hueDiffFor(l) > T.hueDiffFor(l + 1), 'hue difference shrinks (' + l + ')');
ok(T.typeFor(1) === 'mixed' && T.typeFor(14) === 'mixed' && T.typeFor(15) === 'shape' && T.typeFor(40) === 'shape', '第 1～14 關混合、第 15 關起形狀');
ok(T.hintTextFor('mixed').indexOf('顏色') >= 0 && T.hintTextFor('shape').indexOf('顏色') < 0, '提示文字');
// 彩度 0 → 黑白（r=g=b）；彩度高 → 三個通道差很多
{ const g = T.hsvToRgb(123, 0, 90); ok(g.r === g.g && g.g === g.b, 'saturation 0 is a gray'); const c = T.hsvToRgb(123, 85, 90); ok(Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) > 100, 'saturation 85 is vivid'); }
// 格數曲線沒有改（高度每關 +1、寬度＝高度 ÷ 1.5，上限 20×30）
ok(T.heightFor(1) === 3 && T.widthFor(T.heightFor(1)) === 2 && T.heightFor(28) === 30 && T.widthFor(30) === 20 && T.heightFor(99) === 30, '格數曲線不變');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
