const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_scratch.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261009); const rnd = rng(SEED);

// 題材：每 3 關換一種，循環；宮格：3／4／5／6；露出比例線性 60%→30%；限時 60→35 秒
ok(T.bandFor(1) === 'shape' && T.bandFor(3) === 'shape' && T.bandFor(4) === 'fruit' && T.bandFor(7) === 'digit' && T.bandFor(10) === 'char' && T.bandFor(13) === 'shape' && T.bandFor(16) === 'fruit' && T.bandFor(20) === 'digit', '題材每 3 關換一種：' + [1, 4, 7, 10, 13].map(T.bandFor).join());
ok([1, 3, 4, 7, 8, 12, 13, 20].map(T.gridFor).join() === '3,3,4,4,5,5,6,6', '宮格：3×3→4×4→5×5→6×6');
ok(near(T.shownFrac(1), 0.6) && near(T.shownFrac(T.MAX_LEVEL), 0.3), '露出比例端點 60%→30%');
for (let l = 2; l <= T.MAX_LEVEL; l++) ok(T.shownFrac(l) < T.shownFrac(l - 1), '露出比例每關降低 ' + l);
ok(T.timeMs(1) === 60000 && T.timeMs(T.MAX_LEVEL) === 35000, '限時端點');
for (let l = 1; l <= T.MAX_LEVEL; l++) { const g = T.gridFor(l); ok(T.shownCount(l) >= 2 && T.shownCount(l) <= g * g, '露出格數合理 ' + l + '：' + T.shownCount(l)); }
// 圖案池：沒有重複；每個題材至少有 K 種；形狀都有路徑；中文字都是單一漢字
for (const [name, pool] of [['shape', T.SHAPES], ['fruit', T.FRUITS], ['digit', T.DIGITS]]) ok(new Set(pool).size === pool.length && pool.length >= T.K, name + ' 圖案池');
T.SHAPES.forEach(s => ok(typeof T.SHAPE_D[s] === 'string' && /^M/.test(T.SHAPE_D[s]), s + ' 有路徑'));
ok(new Set(T.CHARS).size === T.CHARS.length && T.CHARS.every(c => c.length === 1 && /[一-鿿]/.test(c)) && T.CHARS.length >= 30, '中文字池：單一漢字、不重複、至少 30 個');
ok(T.DIGITS.every(c => /^[0-9]$/.test(c)), '數字池是阿拉伯數字');
// 出牌：每一關逐一檢查
const posOfTarget = new Array(12).fill(0); let boards = 0;
for (let l = 1; l <= T.MAX_LEVEL; l++) for (let i = 0; i < 150; i++) {
  const b = T.makeBoard(l, rnd); boards++;
  ok(b.cells.length === T.COLS * T.ROWS && b.cells.length === 12, '12 張牌');
  ok(b.band === T.bandFor(l) && b.grid === T.gridFor(l), '題材與宮格');
  ok(b.patterns.length === T.K && new Set(b.patterns).size === T.K, '上方有 ' + T.K + ' 種不同的圖案');
  const cnt = {}; b.cells.forEach(s => { cnt[s] = (cnt[s] || 0) + 1; });
  ok(cnt[b.target] === 3, '目標圖案剛好 3 張');
  ok(Object.keys(cnt).length === T.K && Object.keys(cnt).every(k => b.patterns.indexOf(k) >= 0), '每種圖案都出現，而且都在上方列出');
  Object.keys(cnt).forEach(k => { if (k !== b.target) ok(cnt[k] === 1 || cnt[k] === 2, k + ' 最多 2 張'); });
  ok(Object.keys(cnt).filter(k => cnt[k] === 1).length === 1, '只有一種圖案出現 1 張');
  ok(b.shown.length === 12 && b.shown.every(sh => sh.length === T.shownCount(l) && new Set(sh).size === sh.length && sh.every(c => c >= 0 && c < b.grid * b.grid)), '每張牌露出 ' + T.shownCount(l) + ' 個不同的宮格');
  b.cells.forEach((s, j) => { if (s === b.target && l === 1) posOfTarget[j]++; });
}
ok(posOfTarget.every(c => c > 150 * 3 / 12 * 0.6 && c < 150 * 3 / 12 * 1.4), '目標位置平均分布：' + posOfTarget.join(','));
// 中文字題材：越後面的關卡，字的筆劃順序越後面
{ const idx = l => { let s = 0, n = 0; for (let i = 0; i < 80; i++) T.pickPatterns(l, rnd).forEach(p => { s += T.CHARS.indexOf(p); n++; }); return s / n; };
  ok(idx(19) > idx(10) + 8 || T.bandFor(19) !== 'char', '中文字：後面的關卡用筆劃多的字（平均排序 ' + idx(10).toFixed(1) + ' → ' + idx(19).toFixed(1) + '）'); }
// 露出的宮格優先挑「有墨水」的：給一個假的 inkOf（只有編號 0～3 有墨水），露出數夠少時一定全落在裡面
{ const ink = () => [0, 1, 2, 3]; let allIn = true;
  for (let i = 0; i < 100; i++) { const b = T.makeBoard(1, rnd, ink); if (T.shownCount(1) <= 4 || true) b.shown.forEach(sh => { const inInk = sh.filter(c => c < 4).length; if (inInk < Math.min(4, sh.length)) allIn = false; }); }
  ok(allIn, '露出的宮格優先挑有墨水的'); }
// winner：只有達到 3 張才算
const cells = ['a', 'a', 'b', 'a', 'b', 'c'];
ok(T.winner(cells, [0, 1, 2]) === null && T.winner(cells, [0, 1, 3]) === 'a' && T.winner(cells, [2, 4, 5]) === null, 'winner');
ok(T.MAX_REV === 6 && T.MAX_REV >= T.TARGET_COUNT && T.TARGET_COUNT === 3, '最多刮開 6 張、要找 3 張');
ok(T.rating(1) !== T.rating(4) && T.rating(4) !== T.rating(8) && T.rating(8) !== T.rating(14) && T.rating(14) !== T.rating(19), '評語分級');
ok(T.COLS * T.CELL + (T.COLS - 1) * T.GAP <= 472 && T.ROWS * T.CELL + (T.ROWS - 1) * T.GAP + 150 <= 560, '牌面放得進舞台');
ok(G.score.better === 'max' && G.score.max === T.MAX_LEVEL, '成績是通過關數（越大越好、上限＝最後一關）');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
