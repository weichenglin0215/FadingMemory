// 分類點擊（emojisort）的純函式檢查：五種分類的 emoji（不重複、不跨類）、方格大小 2×2 → 2×3 → 3×3 … → 10×10 → 10×11 … → 10×15、
// 種類數（第 1 關 1＋1，最多 3＋2）、每一關的出題（每種至少一個、數量對、題目只寫要點的種類）、限時
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_emojisort.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261109), rnd = rng(SEED);

// ── 分類 ──
ok(T.CATS.map(c => c.name + c.rep).join('、') === '圓臉😀、動物🐒、水果🥝、交通🚗、人類👩', '五種分類與題目寫法');
{ const all = [], first = {}, last = {};
  T.CATS.forEach(c => { ok(c.list.length >= 15, c.name + ' 至少 15 個：' + c.list.length); ok(new Set(c.list).size === c.list.length, c.name + ' 裡沒有重複'); ok(c.rep && T.catOf(c.list[0]) === c.key, c.name + ' 題目寫 ' + c.rep); all.push(...c.list); first[c.key] = c.list[0]; last[c.key] = c.list[c.list.length - 1]; });
  ok(new Set(all).size === all.length, '不同分類之間沒有重複的 emoji');
  all.forEach(ch => ok(T.catOf(ch) !== null, '查得到分類：' + ch)); }
// ── 方格大小 ──
{ const seq = []; for (let L = 1; L <= T.MAX_LEVEL; L++) { const s = T.gridSize(L); seq.push(s.w + '×' + s.h); }
  ok(seq.slice(0, 6).join(' ') === '2×2 2×3 3×3 3×4 4×4 4×5', '前幾關：' + seq.slice(0, 6).join(' '));
  ok(seq.slice(15).join(' ') === '9×10 10×10 10×11 10×12 10×13 10×14 10×15', '最後幾關：' + seq.slice(15).join(' '));
  ok(T.MAX_LEVEL === 22 && seq.length === 22, '一共 22 關');
  for (let L = 1; L <= T.MAX_LEVEL; L++) { const s = T.gridSize(L); ok(s.w <= 10 && s.h <= 15 && s.h >= s.w, '寬最多 10、高最多 15（第 ' + L + ' 關）'); } }
// ── 種類數 ──
ok(JSON.stringify(T.kindsFor(1)) === '{"correct":1,"wrong":1}', '第 1 關：一種要點的、一種干擾的');
ok(JSON.stringify(T.kindsFor(T.MAX_LEVEL)) === '{"correct":3,"wrong":2}', '最後：三種要點的、兩種干擾的');
for (let L = 2; L <= T.MAX_LEVEL; L++) { const a = T.kindsFor(L - 1), b = T.kindsFor(L); ok(b.correct >= a.correct && b.wrong >= a.wrong && b.correct + b.wrong <= 5, '種類數只增不減、最多五種（第 ' + L + ' 關）'); }
// ── 出題 ──
for (let L = 1; L <= T.MAX_LEVEL; L++) for (let s = 0; s < 40; s++) {
  const q = T.makeLevel(L, rnd), k = T.kindsFor(L), tag = '第 ' + L + ' 關';
  ok(q.cells.length === q.w * q.h, tag + ' 格數＝寬×高');
  ok(q.correct.length === k.correct && q.wrong.length === k.wrong, tag + ' 種類數');
  const keys = q.correct.concat(q.wrong).map(c => c.key); ok(new Set(keys).size === keys.length, tag + ' 要點的和干擾的種類不重複');
  ok(q.cells.filter(c => c.ok).length === q.targets && q.targets >= k.correct && q.cells.length - q.targets >= k.wrong, tag + ' 要點的格數');
  q.correct.forEach(c => ok(q.cells.some(x => x.ok && x.cat === c.key), tag + ' 每一種要點的都出現'));
  q.wrong.forEach(c => ok(q.cells.some(x => !x.ok && x.cat === c.key), tag + ' 每一種干擾的都出現'));
  q.cells.forEach(x => ok(T.catOf(x.ch) === x.cat && x.ok === q.correct.some(c => c.key === x.cat), tag + ' 每格的分類正確'));
  ok(q.ms === T.timeMs(L, q.targets) && q.ms > q.targets * 450, tag + ' 限時夠點完（每格至少 0.45 秒）');
}
{ const q = T.makeLevel(1, rnd); ok(T.promptOf(q.correct) === q.correct[0].name + q.correct[0].rep && T.promptOf(q.correct).indexOf(q.wrong[0].name) < 0, '題目只寫要點的種類，不寫干擾的'); }
// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_emojisort.js'), boot = rd('../../js/boot.js'), menu = rd('../../js/menu.js');
  ok(boot.indexOf("'js/reaction_emojisort.js'") > 0 && boot.indexOf("'css/games/reaction_emojisort.css'") > 0, 'boot.js 有載入 js 與 css');
  ok(/id: 'emojisort', name: '分類點擊'/.test(menu) && G.name === '分類點擊', '選單有這一款');
  ok(/if \(!c\.ok\) \{[^}]*finish\(i\)/.test(src) && /api\.timer\(q\.ms/.test(src), '點錯就失敗、時間到也失敗'); }
ok(new Set([1, 5, 10, 16, 22].map(T.rating)).size === 5, '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
