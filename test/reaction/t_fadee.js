const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_fadee.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 白色百分比（使用者改成指數遞減）：第 1 個 PCT_MAX％白，之後每個 E 乘上 FASE_RATE，最低 PCT_MIN％；灰階值 ＝ round(255 × 百分比)
{ const want = l => Math.max(T.PCT_MIN, T.PCT_MAX * Math.pow(T.FASE_RATE, l - 1)), flat = Math.ceil(Math.log(T.PCT_MIN / T.PCT_MAX) / Math.log(T.FASE_RATE)) + 1;
  ok(near(T.pctAt(1), T.PCT_MAX) && near(T.pctAt(flat), T.PCT_MIN) && near(T.pctAt(flat + 15), T.PCT_MIN) && near(T.pctAt(100), T.PCT_MIN), '百分比端點：' + T.PCT_MAX + '% → 第 ' + flat + ' 個之後 ' + T.PCT_MIN + '%（指數遞減，每個乘 ' + T.FASE_RATE + '）');
  for (let l = 1; l <= 120; l++) ok(near(T.pctAt(l), want(l), 1e-9), '第 ' + l + ' 個 E 的百分比 ＝ max(最低, 最高 × 遞減率^(l−1))');
  for (let l = 1; l < flat - 1; l++) ok(T.pctAt(l) > T.pctAt(l + 1), '第 ' + l + ' 到 ' + (l + 1) + ' 個越來越暗');
  for (let l = 2; l < flat - 1; l++) ok(near(T.pctAt(l) / T.pctAt(l - 1), T.FASE_RATE, 1e-9), '指數遞減：每個 E 都是前一個的 ' + T.FASE_RATE + ' 倍');
  for (let l = flat; l <= flat + 20; l++) ok(near(T.pctAt(l), T.PCT_MIN), '第 ' + l + ' 個維持 ' + T.PCT_MIN + '%'); }
ok(T.valueOf(100) === 255 && T.valueOf(1) === 3 && T.valueOf(0) === 0 && T.valueOf(50) === 128, '百分比 → 灰階值：100%＝255、1%＝3');
ok(T.MAX_LEVEL === 90, '共 90 個 E（MAX_LEVEL 統一 90）');
// 方向：不重複上一個、四個方向都會出現
{ const seen = {}; let prev = 'up'; for (let i = 0; i < 4000; i++) { const d = T.nextDir(prev, rnd); ok(d !== prev && T.DIRS.indexOf(d) >= 0, '方向不同於前一個'); seen[d] = (seen[d] || 0) + 1; prev = d; } ok(T.DIRS.every(d => seen[d] > 800), '四個方向平均 ' + JSON.stringify(seen)); }
// E 的形狀：5×5，開口朝右時脊柱在左、三隻腳（第 0、2、4 列）朝右；每個方向都有 17 格（脊柱 5 格＋三隻腳各 4 格）
for (const d of T.DIRS) { let n = 0; for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (T.inE(d, r, c)) n++; ok(n === 17, d + ' 的 E 有 17 格（脊柱 5＋三隻腳各 4）：' + n); }
{ const g = d => { const rows = []; for (let r = 0; r < 5; r++) { let s = ''; for (let c = 0; c < 5; c++) s += T.inE(d, r, c) ? '#' : '.'; rows.push(s); } return rows; };
  ok(g('right').join('/') === '#####/#..../#####/#..../#####', '朝右：' + g('right').join('/'));
  ok(g('left').join('/') === '#####/....#/#####/....#/#####', '朝左：' + g('left').join('/'));
  ok(g('down').join('/') === '#####/#.#.#/#.#.#/#.#.#/#.#.#', '朝下（開口在下，脊柱在上）：' + g('down').join('/'));
  ok(g('up').join('/') === '#.#.#/#.#.#/#.#.#/#.#.#/#####', '朝上（開口在上，脊柱在下）：' + g('up').join('/')); }
// dirOf：只有上下左右
for (let a = 0; a < 360; a += 3) { const dx = Math.cos(a * Math.PI / 180) * 30, dy = Math.sin(a * Math.PI / 180) * 30; ok(T.DIRS.indexOf(T.dirOf(dx, dy)) >= 0, 'dirOf'); }
ok(T.dirOf(30, 5) === 'right' && T.dirOf(-30, 5) === 'left' && T.dirOf(5, 30) === 'down' && T.dirOf(5, -30) === 'up', 'dirOf 比較大的軸');
// paintE：用假 canvas 驗證像素：背景是純黑 0（沒有雜訊、沒有灰色方框），E 是指定的灰階值
const mkCanvas = () => { const buf = new Uint8ClampedArray(T.PANEL * T.PANEL * 4); return { getContext: () => ({ createImageData: () => ({ data: buf }), putImageData() { } }), buf }; };
for (const value of [255, 128, 12, 3]) {
  const cv = mkCanvas(); T.paintE(cv, 'right', value); const buf = cv.buf, off = (T.PANEL - 5 * T.CELL) / 2;
  let bgMin = 999, bgMax = -1, eMin = 999, eMax = -1, alphaOk = true;
  for (let y = 0; y < T.PANEL; y++) for (let x = 0; x < T.PANEL; x++) {
    const i = (y * T.PANEL + x) * 4, v = buf[i], cx = Math.floor((x - off) / T.CELL), cy = Math.floor((y - off) / T.CELL);
    if (buf[i + 1] !== v || buf[i + 2] !== v || buf[i + 3] !== 255) alphaOk = false;
    const inside = x >= off && y >= off && cx >= 0 && cx < 5 && cy >= 0 && cy < 5 && T.inE('right', cy, cx);
    if (inside) { eMin = Math.min(eMin, v); eMax = Math.max(eMax, v); } else { bgMin = Math.min(bgMin, v); bgMax = Math.max(bgMax, v); }
  }
  ok(bgMin === 0 && bgMax === 0, '值=' + value + ' 背景純黑 ' + bgMin + '～' + bgMax);
  ok(eMin === value && eMax === value, '值=' + value + ' E 的灰階 ' + eMin + '～' + eMax);
  ok(alphaOk, '灰階（RGB 相同）、不透明');
}
ok(T.rating(2) !== T.rating(7) && T.rating(7) === T.rating(12) && T.rating(12) === T.rating(19) && T.rating(19) !== T.rating(25) && T.rating(25) !== T.rating(45) && T.rating(45) !== T.rating(65), '評語分級（5、20、40、60 個為界）');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
