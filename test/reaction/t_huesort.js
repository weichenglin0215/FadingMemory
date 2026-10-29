// 色票排隊（huesort，企劃 332 依使用者修改）的純函式檢查：色彩轉換、漸層與「被改過的一塊」、答案唯一（oddBlock）、排版（40% 寬、奇左偶右、30px）、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_huesort.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261201), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e);

// ── 難度（線性）──
ok(near(T.modDeFor(1), T.MOD_DE[0]) && near(T.modDeFor(T.RAMP_LEVELS), T.MOD_DE[1]) && near(T.modDeFor(99), T.MOD_DE[1]), '被改的幅度 ΔE ' + T.MOD_DE);
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S);
{ const d = []; for (let n = 2; n <= T.RAMP_LEVELS; n++) { ok(T.modDeFor(n) <= T.modDeFor(n - 1) && T.timeMs(n) <= T.timeMs(n - 1), '單調 ' + n); d.push(T.modDeFor(n - 1) - T.modDeFor(n)); }
  ok(Math.max(...d) - Math.min(...d) <= 0.02, '被改幅度線性縮小：每關 −' + Math.min(...d).toFixed(3) + '～−' + Math.max(...d).toFixed(3)); }

// ── 色彩轉換 ──
{ const w = T.rgbToLab([255, 255, 255]), k = T.rgbToLab([0, 0, 0]); ok(near(w[0], 100, 0.05) && Math.abs(w[1]) < 0.05 && Math.abs(w[2]) < 0.05, '白色的 Lab ≈ (100,0,0)：' + w.map(v => v.toFixed(2))); ok(near(k[0], 0, 0.01), '黑色 L ≈ 0'); ok(near(T.deltaE([0, 0, 0], [255, 255, 255]), 100, 0.05), '黑白 ΔE ≈ 100');
  let worst = 0; for (let i = 0; i < 5000; i++) { const c = [rnd() * 255, rnd() * 255, rnd() * 255], b = T.labToRgb(T.rgbToLab(c)); worst = Math.max(worst, ...c.map((v, j) => Math.abs(v - b[j]))); }
  ok(worst < 0.01, 'Lab ↔ sRGB 來回轉換誤差（0～255 的刻度，矩陣係數精度）' + worst.toExponential(2)); }
// 已知值：sRGB (255,0,0) 的 Lab ≈ (53.24, 80.09, 67.20)
{ const r = T.rgbToLab([255, 0, 0]); ok(near(r[0], 53.24, 0.05) && near(r[1], 80.09, 0.1) && near(r[2], 67.2, 0.1), '紅色 Lab ' + r.map(v => v.toFixed(2))); }
// 色相轉 hueDegFor 度，弦長剛好 ΔE
for (const [de, C] of [[3, 30], [6, 45], [14, 50], [3, 10]]) { const a = T.lchToLab(50, C, 100), b = T.lchToLab(50, C, 100 + T.hueDegFor(de, C)); ok(near(T.labDist(a, b), de, 1e-9), '色相轉出的 ΔE ＝ ' + de + '（C=' + C + '）'); }

// ── 出題：漸層與被改過的一塊 ──
const ST = { n: 0, modes: {}, kinds: {}, ks: [0, 0, 0, 0, 0, 0, 0, 0, 0], dirs: { up: 0, down: 0 }, worstStep: 0, devMin: 1e9, devMax: 0, oddFail: 0, clip: 0 };
for (let lv = 1; lv <= 60; lv++) for (let rep = 0; rep < 40; rep++) {
  const q = T.makeLevel(lv, rnd); ST.n++;
  ok(q.colors.length === T.BLOCKS && q.expected.length === T.BLOCKS, '9 塊');
  ok(q.k >= T.ODD_RANGE[0] && q.k <= T.ODD_RANGE[1], '被改的塊在中間 7 塊：' + q.k);
  ok(q.kind !== q.mode && T.MODES.includes(q.kind) && T.MODES.includes(q.mode), '改的方向和漸層方向不同：' + q.mode + ' / ' + q.kind);
  ok(near(q.de, T.modDeFor(lv)), '設計 ΔE 跟關卡一致');
  ST.modes[q.mode] = (ST.modes[q.mode] || 0) + 1; ST.kinds[q.kind] = (ST.kinds[q.kind] || 0) + 1; ST.ks[q.k]++;
  let same = true; for (let i = 0; i < T.BLOCKS; i++) { if (i === q.k) continue; if (q.colors[i].join() !== q.expected[i].join()) same = false; }
  ok(same, '除了被改的那塊，其他 8 塊都是原本漸層的顏色');
  ok(q.colors[q.k].join() !== q.expected[q.k].join(), '被改的那塊顏色確實不一樣');
  ok(q.colors.every(c => c.length === 3 && c.every(v => Number.isInteger(v) && v >= 0 && v <= 255)), '顏色是 0～255 的整數');
  // 原本漸層：相鄰兩塊 ΔE ≈ STEP_DE（四捨五入的誤差 < 0.6）
  for (let i = 0; i + 1 < T.BLOCKS; i++) { const st = T.deltaE(q.expected[i], q.expected[i + 1]); ST.worstStep = Math.max(ST.worstStep, Math.abs(st - T.STEP_DE)); }
  // 被改的幅度：實際顏色和該有的顏色差 ≈ de（四捨五入的誤差 < 1）
  const dev = T.deltaE(q.colors[q.k], q.expected[q.k]); ST.devMin = Math.min(ST.devMin, dev - q.de); ST.devMax = Math.max(ST.devMax, dev - q.de);
  // 漸層一直往同一個方向走（明度／彩度／色相各自單調；色相用「相鄰兩塊的角度差，換算到 −180～180」判斷，避免 ±180 的跳躍）
  { const labs = q.expected.map(T.rgbToLab), prop = labs.map(l => q.mode === 'light' ? l[0] : q.mode === 'chroma' ? Math.hypot(l[1], l[2]) : Math.atan2(l[2], l[1]) * 180 / Math.PI), ds = [];
    for (let i = 1; i < 9; i++) { let d = prop[i] - prop[i - 1]; if (q.mode === 'hue') d = ((d + 540) % 360) - 180; ds.push(d); }
    const up = ds[0] > 0; ST.dirs[up ? 'up' : 'down']++;
    ds.forEach((d, i) => ok(up ? d > 0.5 : d < -0.5, q.mode + ' 漸層單調（第 ' + (i + 1) + ' 到 ' + (i + 2) + ' 塊，差 ' + d.toFixed(2) + '）'));
    ok(Math.max(...ds.map(Math.abs)) - Math.min(...ds.map(Math.abs)) < (q.mode === 'light' ? 1.2 : 3), q.mode + ' 漸層步距均勻'); }
  // 答案唯一：只看顏色就能找回被改的那一塊
  if (T.oddBlock(q.colors) !== q.k) ST.oddFail++;
}
console.log('共 ' + ST.n + ' 關；漸層方向 ' + JSON.stringify(ST.modes) + '；被改的方向 ' + JSON.stringify(ST.kinds) + '；被改的塊分布 ' + ST.ks.join(',') + '；漸層走向 ' + JSON.stringify(ST.dirs) + '；步距最大誤差 ' + ST.worstStep.toFixed(3) + '；被改幅度誤差 ' + ST.devMin.toFixed(2) + '～' + ST.devMax.toFixed(2) + '；找不回被改的塊 ' + ST.oddFail + ' 關');
ok(ST.worstStep < 1.6, '相鄰兩塊的顏色差跟 STEP_DE 差不到 1.6（兩個顏色各自 8 位元四捨五入）：' + ST.worstStep.toFixed(3));
ok(ST.devMin > -1.2 && ST.devMax < 1.2, '被改的幅度跟設計值差不到 1.2（8 位元四捨五入）：' + ST.devMin.toFixed(2) + '～' + ST.devMax.toFixed(2));
ok(ST.oddFail === 0, '每一關只看顏色都能找回被改的那一塊（答案唯一）：失敗 ' + ST.oddFail);
ok(T.MODES.every(m => ST.modes[m] > ST.n * 0.25) && T.MODES.every(m => ST.kinds[m] > ST.n * 0.25), '三種漸層方向、三種被改的方向都常出現');
ok(ST.ks.slice(T.ODD_RANGE[0], T.ODD_RANGE[1] + 1).every(v => v > ST.n / 7 * 0.7) && ST.ks[0] === 0 && ST.ks[8] === 0, '被改的塊平均分布在第 2～8 塊，第 1、9 塊不會被改：' + ST.ks.join(','));
ok(ST.dirs.up > ST.n * 0.4 && ST.dirs.down > ST.n * 0.4, '漸層上行、下行各半');
// 出題速度與（極端）最難關卡
{ const t0 = Date.now(); for (let i = 0; i < 2000; i++) T.makeLevel(T.RAMP_LEVELS, rnd); const per = (Date.now() - t0) / 2000; ok(per < 3, '出題夠快：' + per.toFixed(3) + ' 毫秒'); console.log('到頂關卡出題平均 ' + per.toFixed(3) + ' 毫秒'); }
// 同一個種子出同一關
{ const a = T.makeLevel(7, rng(123)), b = T.makeLevel(7, rng(123)); ok(JSON.stringify(a) === JSON.stringify(b), '同種子同題目'); }
// oddBlock 的反例：什麼都沒改的漸層，回傳值仍在 1～7（不會當掉）
{ const q = T.makeLevel(5, rnd); const r = T.oddBlock(q.expected); ok(r >= 1 && r <= 7, 'oddBlock 對沒改過的漸層不會出錯'); }

// ── 排版：每塊 40% 寬、奇數靠左偶數靠右、離邊界 30px、上下留空隙；集中後上下緊貼 ──
for (const [W, H] of [[472, 640], [440, 600], [472, 520], [500, 700]]) {
  const L = T.layout(W, H, 52, 78), bw = Math.round(W * T.BLOCK_W);
  ok(L.bw === bw && L.blocks.every(b => b.w === bw), '每塊寬 = 畫面寬的 40%（' + W + ' → ' + bw + '）');
  L.blocks.forEach((b, i) => {
    if (i % 2 === 0) ok(b.x === T.SIDE_GAP, '第 ' + (i + 1) + ' 塊（奇數）靠左，離左邊界 ' + T.SIDE_GAP + 'px：' + b.x); else ok(b.x + b.w === W - T.SIDE_GAP, '第 ' + (i + 1) + ' 塊（偶數）靠右，離右邊界 ' + T.SIDE_GAP + 'px：' + (W - b.x - b.w));
    ok(b.y >= 52 - 1 && b.y + b.h <= H - 78 + 1, '在 stage 之內（' + W + '×' + H + '）第 ' + (i + 1) + ' 塊 y=' + b.y);
    if (i) { ok(b.y - (L.blocks[i - 1].y + L.blocks[i - 1].h) === T.V_GAP, '上下塊空隙 = V_GAP'); ok(b.joinY - L.blocks[i - 1].joinY === L.bh && b.joinX === L.blocks[i - 1].joinX, '集中後上下緊貼、同一欄'); }
    ok(b.h === L.bh && L.bh >= 30, '塊高 ' + L.bh + ' ≥ 30（手指點得到）');
  });
  const c = L.blocks[0].joinX; ok(Math.abs((c + bw / 2) - W / 2) <= 1, '集中後在畫面正中間');
  ok(L.blocks[0].x + bw < L.blocks[1].x, '左右兩欄不重疊（中間隔 ' + (L.blocks[1].x - L.blocks[0].x - bw) + 'px）');
  ok(near(L.blocks[BLOCKS_LAST()].joinY + L.bh - L.blocks[0].joinY, L.stackH, 1e-9), '集中後的高度 = 9 × 塊高');
}
function BLOCKS_LAST() { return T.BLOCKS - 1; }

// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_huesort.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: GATHER_MS \+ 3700/.test(src) && /api\.pass\(\{ delay: GATHER_MS \+ 1900/.test(src) && T.GATHER_MS + 3700 >= 2000, '失敗停格 2 秒以上、答對也留時間看緊貼的色塊');
  ok(/mark\(q\.k, true\)/.test(src) && /mark\(j, false\)/.test(src) && /hus-block--join/.test(src), '評審動畫：集中、正確塊畫綠圈、點錯的塊畫紅 X');
  ok(/\.hus-mark__ok \{[^}]*var\(--hus-edge\)/.test(css) && /\.hus-mark__xedge \{[^}]*var\(--hus-edge\)/.test(css) && /\.hus-mark__x \{[^}]*var\(--hus-x\)/.test(css), '白邊、綠圈、紅 X 用 CSS 變數');
  ok(/\.hus-block--join \{[^}]*border-radius: 0/.test(css) && /\.hus-block \{[^}]*transition:[^;]*left/.test(css), '集中時圓角變直角、位置有過渡動畫');
  ok(boot.indexOf("'js/reaction_huesort.js'") > 0 && /9 塊/.test(G.rule), 'boot.js 有載入、玩法說明提到 9 塊'); }
ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(8) && T.rating(8) !== T.rating(15) && T.rating(15) !== T.rating(25), '評語分級');
// V1.36.0 玩家意見：色塊靠攏之後上下要緊密相連、不留白縫——除了最後一塊，每一塊都壓進下一塊 JOIN_OVERLAP px（下面的塊畫在上面）
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_huesort.js'), 'utf8');
  ok(T.JOIN_OVERLAP >= 2 && src.indexOf('el.style.height = (b.h + (i < els.length - 1 ? JOIN_OVERLAP : 0))') > 0 && src.indexOf('el.style.zIndex = String(i)') > 0, '靠攏後每一塊（最後一塊除外）多壓進下一塊 ' + T.JOIN_OVERLAP + ' px，下面的塊蓋在上面'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
