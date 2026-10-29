// 找錢（change，企劃 400）的純函式檢查：難度線性、題目（價錢、整數鈔票、多給零錢讓找的錢是 5 的倍數、借位次數）、直式減法借位（獨立算法驗證）、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_change.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261217), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（線性）──
ok(T.maxPriceFor(0) === T.MAX_PRICE[0] && T.maxPriceFor(T.RAMP_Q) === T.MAX_PRICE[1] && T.maxPriceFor(999) === T.MAX_PRICE[1], '價錢上限 ' + T.MAX_PRICE);
ok(T.timeMs(0) === 8000 && T.timeMs(T.RAMP_Q) === 4000 && T.timeMs(999) === 4000, '每題限時 8 → 4 秒（使用者企劃）');
ok(T.borrowMinFor(0) === T.BORROW_MIN[0] && T.borrowMinFor(T.RAMP_Q) === T.BORROW_MIN[1] && near(T.pExtraFor(T.RAMP_Q), T.P_EXTRA[1]) && T.pExtraFor(0) === 0 && T.pExtraFor(T.EXTRA_FROM - 1) === 0 && T.pExtraFor(T.EXTRA_FROM) > 0, '借位至少 0→2、多給零錢 ' + T.EXTRA_FROM + ' 題之後才有、到頂 0.4');
for (let n = 1; n <= T.RAMP_Q + 2; n++) ok(T.maxPriceFor(n) >= T.maxPriceFor(n - 1) && T.timeMs(n) <= T.timeMs(n - 1) && T.borrowMinFor(n) >= T.borrowMinFor(n - 1) && T.minPriceFor(n) >= T.minPriceFor(n - 1), '單調 ' + n);
{ const d = []; for (let n = 1; n <= T.RAMP_Q; n++) d.push(T.timeMs(n - 1) - T.timeMs(n)); ok(Math.max(...d) - Math.min(...d) <= 1, '限時線性縮短：每題 −' + Math.min(...d) + '～−' + Math.max(...d) + ' 毫秒'); }

// ── 借位：獨立算法（用「a − b」的結果驗證每一欄）──
function ref(a, b) { // 另一種寫法：逐欄用十進位取餘數，記錄「這一欄被減數（扣掉前一欄借走的）小於減數」
  const out = []; let borrow = 0; const A = String(a), B = String(b); for (let i = 0; i < A.length; i++) { const x = +A[A.length - 1 - i] - borrow, y = i < B.length ? +B[B.length - 1 - i] : 0; if (x < y) { out.push(1); borrow = 1; } else { out.push(0); borrow = 0; } } return out;
}
for (let i = 0; i < 20000; i++) { const b = 1 + Math.floor(rnd() * 9999), a = b + 1 + Math.floor(rnd() * 20000), r = ref(a, b), t = T.borrowCols(a, b); ok(t.map(x => x ? 1 : 0).join() === r.join() && T.countBorrows(a, b) === r.reduce((s, x) => s + x, 0), '借位欄位 ' + a + '−' + b); }
ok(T.borrowCols(1000, 386).join() === 'true,true,true,false' && T.countBorrows(1000, 386) === 3, '1000 − 386：個位、十位、百位都要借（使用者企劃的例子）');
ok(T.countBorrows(1000, 999) === 3 && T.countBorrows(500, 100) === 0 && T.countBorrows(93, 7) === 1 && T.countBorrows(86, 7) === 1 && T.countBorrows(100, 1) === 2, '幾個例子的借位次數');
// 直式減法的各列
{ const v = T.vertical(1000, 386); ok(v.top.join('') === '1000' && v.bot.join('') === ' 386' && v.res.join('') === ' 614' && v.width === 4 && v.borrow.join() === 'false,true,true,true', '1000 − 386 ＝ 614 的直式（最高位在左、借位標記：百位、十位、個位）'); const v2 = T.vertical(1011, 386); ok(v2.res.join('') === ' 625' && v2.top.join('') === '1011', '1011 − 386 ＝ 625（使用者企劃的「多給零錢」例子）'); }
// 還原算式：直式的答案 = 上 − 下
for (let i = 0; i < 2000; i++) { const b = 1 + Math.floor(rnd() * 9999), a = b + 1 + Math.floor(rnd() * 20000), v = T.vertical(a, b); ok(+v.res.join('').trim() === a - b && +v.top.join('').trim() === a && +v.bot.join('').trim() === b, '直式 ' + a + '−' + b); }

// ── 出題：全部難度掃一遍 ──
const ST = { n: 0, extra: 0, tot: 0, borrowMin: {}, digits: new Set(), maxChange: 0, maxPaid: 0, unmet: 0 };
for (let n = 0; n <= 60; n++) for (let rep = 0; rep < 150; rep++) {
  const q = T.makeQuestion(n, rnd); ST.n++;
  ok(q.n === n && q.price >= T.minPriceFor(n) && q.price <= T.maxPriceFor(n), '價錢 ' + q.price + ' 在 [' + T.minPriceFor(n) + ', ' + T.maxPriceFor(n) + ']');
  ok(T.NOTES.includes(q.base) && q.base >= q.price + 10, '整數鈔票金額 ' + q.base + ' ≥ 價錢 ＋ 10');
  ok(q.paid === q.base + q.extra && q.change === q.paid - q.price && q.change >= 10 && q.digits === String(q.change).length, '給的錢、要找的錢、位數');
  if (q.extra > 0) { ST.extra++; ok(n >= T.EXTRA_FROM, '多給零錢要在答對 ' + T.EXTRA_FROM + ' 題之後'); ok(q.extra >= 1 && q.extra <= 53 && q.change % 5 === 0, '多給的零錢 ' + q.extra + '，要找的錢 ' + q.change + ' 是 5 的倍數'); }
  ST.tot++; ok(q.borrows === ref(q.paid, q.price).reduce((s, x) => s + x, 0), '借位次數記錄正確');
  if (q.borrows < T.borrowMinFor(n)) ST.unmet++;
  ST.digits.add(q.digits); ST.maxChange = Math.max(ST.maxChange, q.change); ST.maxPaid = Math.max(ST.maxPaid, q.paid);
}
console.log('共 ' + ST.n + ' 題；多給零錢 ' + ST.extra + ' 題（' + (100 * ST.extra / ST.tot).toFixed(1) + '%）；答案位數 ' + [...ST.digits].sort().join('、') + '；最大要找 ' + ST.maxChange + '；達不到借位要求的題 ' + ST.unmet);
ok(ST.unmet / ST.n < 0.01, '借位要求幾乎都達到：' + ST.unmet);
ok(ST.digits.has(2) && ST.digits.has(3) && ST.digits.has(4) && ST.maxChange > 5000, '金額越來越大');
// 多給零錢的比例隨 n 增加
{ function extraRate(n) { let k = 0, N = 6000; for (let i = 0; i < N; i++) if (T.makeQuestion(n, rnd).extra > 0) k++; return k / N; } const a = extraRate(2), b = extraRate(20), c = extraRate(40); ok(a === 0 && b > 0.12 && b < 0.28 && c > 0.34 && c < 0.46, '多給零錢的比例 ' + a + ' → ' + b.toFixed(2) + ' → ' + c.toFixed(2)); }
// 第 0 題：價錢小、鈔票小
{ let mx = 0; for (let i = 0; i < 2000; i++) { const q = T.makeQuestion(0, rnd); mx = Math.max(mx, q.price); ok(q.base <= 1000 && q.extra === 0, '第 0 題的鈔票不大、沒有多給零錢'); } ok(mx <= 300, '第 0 題價錢 ≤ 300'); }
// 到頂：借位至少 2 次（大部分）
{ let ok2 = 0; for (let i = 0; i < 2000; i++) if (T.makeQuestion(T.RAMP_Q, rnd).borrows >= 2) ok2++; ok(ok2 / 2000 > 0.99, '到頂的題目借位至少 2 次：' + ok2); }
// 說明
{ const q = { paid: 1000, price: 386, change: 614 }; ok(T.whyText(q, '714') === '找錯了！1000 − 386 ＝ 614，你輸入 714' && T.whyText(q, '') === '時間到！1000 − 386 ＝ 614' && T.whyText(q, null) === '時間到！1000 − 386 ＝ 614', 'whyText（含使用者企劃的 1000−386 例子）'); }

// ── 程式裡的接線 ──
{ const rd = pth => require('fs').readFileSync(require('path').resolve(__dirname, pth), 'utf8'), src = rd('../../js/reaction_change.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 4200/.test(src) && /vertical\(q\.paid, q\.price\)/.test(src) && /chg-vert__c--borrow/.test(src) && /pad\.el\.style\.display = 'none'/.test(src), '失敗：直式減法、借位欄位標紅、停格夠久');
  ok(/typed\.length >= q\.digits/.test(src) && /press\('✓'\)|k === '✓'/.test(src) && /k === '⌫'/.test(src) && /api\.timer\(timeMs\(count\)/.test(src), '位數夠了自動判定、有 ⌫ 和 ✓、每題限時');
  ok(/scoreOf/.test(src) && /resume: false/.test(src) && /SOLVE_CAP/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src), '成績用 scoreOf、solve 有上限');
  ok(/\.chg-lcd \{[^}]*var\(--chg-lcd-bg\)/.test(css) && /\.chg-vert__c--borrow \{[^}]*var\(--c-bad\)/.test(css) && /\.chg-drawer \{[^}]*var\(--chg-drawer\)/.test(css), '液晶、借位標紅、抽屜用 CSS 變數');
  ok(boot.indexOf("'js/reaction_change.js'") > 0 && /借位/.test(G.rule) && /多給零錢/.test(G.rule), 'boot.js 有載入、玩法說明提到借位與多給零錢'); }
ok(T.rating(1) !== T.rating(5) && T.rating(5) !== T.rating(12) && T.rating(12) !== T.rating(25) && T.rating(25) !== T.rating(35), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
