const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_wrongline.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261016); const rnd = rng(SEED);

ok(T.linesFor(1) === 3 && T.linesFor(T.RAMP_LEVELS) === 6 && T.linesFor(60) === 6, '行數 3 → 6');
for (let l = 2; l <= 60; l++) ok(T.linesFor(l) >= T.linesFor(l - 1), '行數單調 ' + l);
ok(T.ansMs(1) >= 5000, '第 1 題至少 5 秒：' + T.ansMs(1));
for (let l = 1; l <= 60; l++) ok(T.ansMs(l) >= 5500, '限時下限 ' + l + '：' + T.ansMs(l));
// wrongOf：正整數、位數不變、不等於正解
for (let i = 0; i < 20000; i++) {
  const t = 10 + Math.floor(rnd() * 990), w = T.wrongOf(t, rnd(), rnd);
  ok(Number.isInteger(w) && w > 0 && w !== t && String(w).length === String(t).length, 'wrongOf ' + t + '→' + w);
}
// 難度：前期的錯法（差 10 的倍數）比後期多
function tenRate(hard) { let n = 0; for (let i = 0; i < 6000; i++) { const t = 100 + Math.floor(rnd() * 800), w = T.wrongOf(t, hard, rnd); if (Math.abs(w - t) % 10 === 0) n++; } return n / 6000; }
ok(tenRate(0) > tenRate(1) + 0.3, '前期錯法較明顯：' + tenRate(0).toFixed(2) + ' → ' + tenRate(1).toFixed(2));
// 整題：每一行都是對的，只有一行（wrong）寫錯；後面的行接著錯的數字算
const typeCount = { run: 0, shop: 0 };
for (let i = 0; i < 6000; i++) {
  const lv = 1 + (i % 60), q = T.makeQuestion(lv, rnd);
  ok(q.lines.length === T.linesFor(lv), '行數 ' + q.type + ' ' + lv + '：' + q.lines.length);
  let wrongCount = 0;
  q.lines.forEach((l, k) => {
    ok(l.truth === T.apply(l.op, l.x, l.y), '行的正解正確');
    if (l.shown !== l.truth) { wrongCount++; ok(k === q.wrong, '寫錯的就是 wrong 那一行'); }
    ok(l.shown > 0 && l.shown <= 9999 && Number.isInteger(l.shown), '數字範圍');
    ok(l.text === l.x + ' ' + l.op + ' ' + l.y + ' ＝ ' + l.shown, '文字');
    ok(l.right === l.x + ' ' + l.op + ' ' + l.y + ' ＝ ' + l.truth, '正確文字');
  });
  ok(wrongCount === 1, '只有一行算錯：' + wrongCount);
  // 後面的行用「寫出來的」前一行結果（錯的也照用）
  if (q.type === 'run') q.lines.forEach((l, k) => { if (k > 0) ok(l.x === q.lines[k - 1].shown, 'run：下一行用上一行寫出來的結果'); });
  if (q.type === 'shop') { ok(q.head.length > 0, 'shop 有說明文字'); ok(q.lines[2].x === q.lines[0].shown && q.lines[2].y === q.lines[1].shown, 'shop 第三行是前兩行相加'); }
  typeCount[q.type]++;
}
ok(typeCount.run > 2000 && typeCount.shop > 2000, '兩種題型都出現 ' + JSON.stringify(typeCount));
// 「買東西」付錢找零：付的錢 ≥ 總價
for (let i = 0; i < 500; i++) { const s = T.shopSteps(4, rnd), ev = T.evalSteps(s.steps, -1, 0); ok(ev[3].truth > 0 && ev[3].truth <= 100, '找零是正數且不超過 100：' + ev[3].truth); }
// 每一行的位置都會被選為「算錯」
const pos = new Set(); for (let i = 0; i < 2000; i++) pos.add(T.makeQuestion(40, rnd).wrong); ok(pos.size === 6, '各行都可能算錯：' + [...pos]);
ok(T.rating(2) !== T.rating(6) && T.rating(6) !== T.rating(15) && T.rating(15) !== T.rating(30) && T.rating(30) !== T.rating(45), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
