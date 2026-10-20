// 打了幾折（discount，企劃 403）的純函式檢查：台灣的折數換算（7 折＝70%）、折數池與按鈕、題目（特價一定是整數、原價 20 的倍數）、互補折數的誘餌、難度線性、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_discount.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261218), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 台灣的折數：7 折＝付 70% ──
ok(T.pctOf(7) === 70 && T.pctOf(3) === 30 && T.pctOf(1) === 10 && T.pctOf(9) === 90 && T.pctOf(75) === 75 && T.pctOf(85) === 85 && T.pctOf(95) === 95 && T.pctOf(65) === 65, '折數換算：7 折＝70%、75 折＝75%（使用者企劃）');
ok(T.labelOf(7) === '7 折' && T.labelOf(75) === '75 折', '標籤');
ok(T.complementOf(7) === 3 && T.complementOf(3) === 7 && T.complementOf(5) === 5 && T.complementOf(1) === 9 && T.complementOf(75) === null, '互補折數：7↔3、5↔5、兩位數沒有');
// ── 使用者的例子：原價 800、特價 560 → 7 折 ──
{ const q = { orig: 800, sale: 560, r: 7, label: '7 折', pct: 70 }; ok(T.formula(q) === '560 ÷ 800 ＝ 0.7 ＝ 7 折', 'formula：' + T.formula(q)); ok(T.whyText(q, 3) === '選錯了！560 ÷ 800 ＝ 0.7 ＝ 7 折，你選了 3 折。3 折是付 30%，7 折才是付 70%', '選互補折數的說明：' + T.whyText(q, 3)); ok(T.whyText(q, 6) === '選錯了！560 ÷ 800 ＝ 0.7 ＝ 7 折，你選了 6 折' && T.whyText(q, null) === '時間到！560 ÷ 800 ＝ 0.7 ＝ 7 折', '其他說明'); }

// ── 難度（線性）──
ok(T.timeMs(0) === 8000 && T.timeMs(T.RAMP_Q) === 4000 && T.timeMs(999) === 4000, '每題限時 8 → 4 秒（使用者企劃）');
ok(T.maxOrigFor(0) === T.MAX_ORIG[0] && T.maxOrigFor(T.RAMP_Q) === T.MAX_ORIG[1] && near(T.pOddFor(0), 0) && near(T.pOddFor(T.RAMP_Q), 0.8), '原價上限、不整百機率');
for (let n = 1; n <= T.RAMP_Q + 2; n++) ok(T.timeMs(n) <= T.timeMs(n - 1) && T.maxOrigFor(n) >= T.maxOrigFor(n - 1) && T.pOddFor(n) >= T.pOddFor(n - 1), '單調 ' + n);
{ const d = []; for (let n = 1; n <= T.RAMP_Q; n++) d.push(T.timeMs(n - 1) - T.timeMs(n)); ok(Math.max(...d) - Math.min(...d) <= 1, '限時線性縮短：每題 −' + Math.min(...d) + '～−' + Math.max(...d) + ' 毫秒'); }

// ── 折數池與按鈕 ──
ok(T.poolFor(0).join() === '5,6,7,8,9' && T.poolFor(4).join() === '5,6,7,8,9', '一開始 5～9 折');
ok(T.poolFor(5).join() === '5,6,7,8,9,2,3,4' && T.poolFor(10).includes(75) && T.poolFor(10).includes(85) && T.poolFor(10).includes(95) && !T.poolFor(9).includes(75) && T.poolFor(20).includes(65) && T.poolFor(20).includes(1) && !T.poolFor(19).includes(65), '第 5 題起加 2、3、4 折；第 10 題起加 75、85、95 折；第 20 題起加 65、1 折');
ok(T.buttonsFor(0).join() === '1,2,3,4,5,6,7,8,9' && T.buttonsFor(10).join() === '1,2,3,4,5,6,7,8,9,75,85,95' && T.buttonsFor(20).join() === '1,2,3,4,5,6,7,8,9,65,75,85,95', '按鈕：一直有 1～9 折，兩位數的折解鎖後才出現（由小到大）');
ok(T.buttonsFor(0).includes(3), '按鈕裡一直有「3 折」——答案是 7 折時它就是最誘人的誘餌（使用者企劃）');

// ── 一題：全部難度掃一遍 ──
const ST = { n: 0, odd: 0, r: {}, trap7: 0, maxOrig: 0, minSale: 1e9 };
for (let n = 0; n <= 60; n++) for (let rep = 0; rep < 200; rep++) {
  const q = T.makeQuestion(n, rnd); ST.n++;
  ok(T.poolFor(n).includes(q.r) && q.pct === T.pctOf(q.r) && q.label === q.r + ' 折', '折數在池裡');
  ok(q.orig % 20 === 0 && q.orig >= T.MIN_ORIG && q.orig <= T.maxOrigFor(n) + 20, '原價 ' + q.orig + ' 是 20 的倍數、在範圍內');
  ok(Number.isInteger(q.sale) && q.sale === q.orig * q.pct / 100 && q.sale < q.orig && q.sale >= 10, '特價 ' + q.sale + ' 是整數 = 原價 × ' + q.pct + '%');
  ok(near(q.sale / q.orig, q.pct / 100, 1e-12), '特價 ÷ 原價 = 付幾成');
  ok(q.buttons.includes(q.r) && q.time === T.timeMs(n), '正確答案在按鈕裡');
  if (q.orig % 100 !== 0) ST.odd++; ST.r[q.r] = (ST.r[q.r] || 0) + 1; ST.maxOrig = Math.max(ST.maxOrig, q.orig); ST.minSale = Math.min(ST.minSale, q.sale);
  if (q.r === 7 && q.buttons.includes(3)) ST.trap7++;
  // 獨立算法：用特價、原價反推「幾折」（先約成最簡分數再換算）
  const g = (a, b) => b ? g(b, a % b) : a, gg = g(q.sale, q.orig), num = q.sale / gg, den = q.orig / gg; ok(near(num / den * 100, q.pct, 1e-9), '反推：' + q.sale + '/' + q.orig + ' = ' + q.pct + '%');
}
console.log('共 ' + ST.n + ' 題；不整百的 ' + (100 * ST.odd / ST.n).toFixed(1) + '%；最大原價 ' + ST.maxOrig + '；各折數出現次數 ' + JSON.stringify(ST.r));
ok(Object.keys(ST.r).length === 13 && Object.values(ST.r).every(v => v > 100), '13 種折數（5～9、2～4、75、85、95、65、1）都會出現');
ok(ST.trap7 === ST.r[7], '每一次答案是 7 折，按鈕裡都有 3 折');
ok(ST.maxOrig >= 5000 && ST.minSale >= 10, '原價越來越大');
// 第 0 題：原價整百、沒有兩位數的折
{ for (let i = 0; i < 2000; i++) { const q = T.makeQuestion(0, rnd); ok(q.orig % 100 === 0 && q.r >= 5 && q.r <= 9 && q.orig <= 1000, '第 0 題：整百、5～9 折、≤1000'); } }
// 不整百的比例隨 n 增加
{ function oddRate(n) { let k = 0, N = 4000; for (let i = 0; i < N; i++) if (T.makeQuestion(n, rnd).orig % 100 !== 0) k++; return k / N; } const a = oddRate(0), b = oddRate(20), c = oddRate(40); ok(a === 0 && b > 0.4 && b < 0.6 && c > 0.72, '不整百的比例 ' + a + ' → ' + b.toFixed(2) + ' → ' + c.toFixed(2)); }

// ── 程式裡的接線 ──
{ const rd = pth => require('fs').readFileSync(require('path').resolve(__dirname, pth), 'utf8'), src = rd('../../js/reaction_discount.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 4200/.test(src) && /formula\(q\)/.test(src) && /whyText\(q, r\)/.test(src) && /complementOf\(q\.r\)/.test(src), '失敗：寫出算式、互補折數特別說明、停格夠久');
  ok(/api\.timer\(q\.time/.test(src) && /scoreOf/.test(src) && /resume: false/.test(src) && /SOLVE_CAP/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src), '每題限時、成績 scoreOf、solve 有上限');
  ok(/\.dsc-tag \{[^}]*var\(--dsc-tag\)/.test(css) && /\.dsc-tag__price \{[^}]*var\(--dsc-red\)/.test(css) && /\.dsc-btn--ok \{[^}]*var\(--c-ok\)/.test(css), '吊牌、特價紅字、對錯顏色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_discount.js'") > 0 && /70%/.test(G.rule) && /3 折/.test(G.rule) && /75 折/.test(G.rule), 'boot.js 有載入、玩法說明提到 7 折＝70%、3 折的混淆、75 折'); }
ok(T.rating(1) !== T.rating(5) && T.rating(5) !== T.rating(12) && T.rating(12) !== T.rating(25) && T.rating(25) !== T.rating(35), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
