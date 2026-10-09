const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_fadee.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);

// Δ：第 1 個 40，每個減 1，到 1 為止；對比 ＝ Δ÷128
ok(T.deltaAt(1) === 40 && T.deltaAt(40) === 1 && T.deltaAt(41) === 1 && T.deltaAt(100) === 1, 'Δ 端點');
for (let l = 1; l < 40; l++) ok(T.deltaAt(l) - T.deltaAt(l + 1) === 1, 'Δ 每關減 1');
ok(near(T.contrastPct(1), 100 / 128) && T.contrastPct(1).toFixed(4) === '0.7813', '最後一個 E 的對比 0.7813%');
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
// paintE：用假 canvas 驗證像素：背景灰階、E 比背景亮 Δ、雜訊 ±1
const mkCanvas = () => { const buf = new Uint8ClampedArray(T.PANEL * T.PANEL * 4); return { getContext: () => ({ createImageData: () => ({ data: buf }), putImageData() { } }), buf }; };
for (const delta of [40, 10, 3, 2, 1]) {
  const cv = mkCanvas(); T.paintE(cv, 'right', delta, rnd); const buf = cv.buf, off = (T.PANEL - 5 * T.CELL) / 2;
  let bgMin = 999, bgMax = -1, eMin = 999, eMax = -1;
  for (let y = 0; y < T.PANEL; y++) for (let x = 0; x < T.PANEL; x++) {
    const v = buf[(y * T.PANEL + x) * 4], cx = Math.floor((x - off) / T.CELL), cy = Math.floor((y - off) / T.CELL);
    const inside = x >= off && y >= off && cx >= 0 && cx < 5 && cy >= 0 && cy < 5 && T.inE('right', cy, cx);
    if (inside) { eMin = Math.min(eMin, v); eMax = Math.max(eMax, v); } else { bgMin = Math.min(bgMin, v); bgMax = Math.max(bgMax, v); }
  }
  const noise = delta >= T.NOISE_FROM ? 1 : 0;
  ok(bgMin === T.GRAY - noise && bgMax === T.GRAY + noise, 'Δ=' + delta + ' 背景灰階 ' + bgMin + '～' + bgMax);
  ok(eMin === T.GRAY + delta - noise && eMax === T.GRAY + delta + noise, 'Δ=' + delta + ' E 的灰階 ' + eMin + '～' + eMax);
}
ok(T.rating(2) !== T.rating(7) && T.rating(7) !== T.rating(12) && T.rating(12) !== T.rating(25) && T.rating(25) !== T.rating(35), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
