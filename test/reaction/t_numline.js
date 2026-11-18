// 數線落點：容許誤差線性縮小、題目數字與寫法一致、離 0／1／起點夠遠
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_numline.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 30) console.log('FAIL', m); } };
const SEED = seedOf(20261010), rnd = rng(SEED);
ok(Math.abs(T.tolAt(1) - 0.10) < 1e-12 && Math.abs(T.tolAt(15) - 0.01) < 1e-12 && T.tolAt(40) === T.tolAt(15), '容許誤差 0.10 → 0.01');
for (let l = 1; l < 15; l++) ok(T.tolAt(l + 1) < T.tolAt(l), '線性縮小 ' + l);
ok(Math.abs((T.tolAt(1) - T.tolAt(8)) - (T.tolAt(8) - T.tolAt(15))) < 1e-12, '是線性不是等比');
ok(T.gcd(12, 8) === 4 && T.gcd(7, 13) === 1, 'gcd');
// 判定邊界
ok(T.judge(0.5, 0.45, 0.05).ok && !T.judge(0.5, 0.449, 0.05).ok && T.judge(0.4, 0.45, 0.05).ok && !T.judge(0.3999, 0.45, 0.05).ok, '剛好在容許邊界算過，超過一點就不過');
ok(Math.abs(T.judge(0.3, 0.45, 0.05).err - 0.15) < 1e-12, '誤差值');
// 出題
const forms = { decimal: 0, fraction: 0, percent: 0 }; const tails = { early: new Set(), late: new Set() };
for (let lv = 1; lv <= 30; lv++) for (let k = 0; k < 300; k++) {
  const q = T.makeQuestion(lv, rnd); forms[q.form]++;
  ok(q.v >= T.V_MIN - 1e-12 && q.v <= T.V_MAX + 1e-12, '數字離 0 與 1 夠遠 ' + q.text + ' lv' + lv);
  ok(Math.abs(q.v - T.START) >= T.START_GAP - 1e-12, '離起點夠遠 ' + q.text);
  ok(Math.abs(q.tol - T.tolAt(lv)) < 1e-12, 'tol 與關卡一致');
  if (q.form === 'decimal') ok(/^0\.\d\d$/.test(q.text) && Math.abs(parseFloat(q.text) - q.v) < 1e-9, '小數寫法 ' + q.text + ' v=' + q.v);
  if (q.form === 'percent') ok(/^\d+%$/.test(q.text) && Math.abs(parseInt(q.text, 10) / 100 - q.v) < 1e-9, '百分比寫法 ' + q.text);
  if (q.form === 'fraction') { const m = /^(\d+)\/(\d+)$/.exec(q.text); ok(m && T.gcd(+m[1], +m[2]) === 1 && +m[1] < +m[2] && Math.abs(+m[1] / +m[2] - q.v) < 1e-12, '分數寫法已約分 ' + q.text); }
  if (lv <= 3) { if (q.form !== 'fraction') ok(Math.round(q.v * 100) % 5 === 0, '前幾關的小數／百分比是 5 的倍數 ' + q.text); else tails.early.add(q.text.split('/')[1]); }
  if (lv >= 12 && q.form === 'fraction') tails.late.add(q.text.split('/')[1]);
}
ok(forms.decimal > 2000 && forms.fraction > 2000 && forms.percent > 2000, '三種寫法都常出現：' + JSON.stringify(forms));
ok(Array.from(tails.early).every(d => [2, 3, 4, 5, 6, 8, 10].includes(+d)) && tails.late.size >= 10, '前幾關的分母比較整齊，後面分母變多：early ' + Array.from(tails.early).join(',') + ' late ' + Array.from(tails.late).length + ' 種');
// 玩家意見（V1.57.2.0）：圓點下方的短直線改成倒三角形，尖端碰到數線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_numline.js').replace(/\/\*[\s\S]*?\*\//g, ''), css = rd('../../css/games/reaction_numline.css').replace(/\/\*[\s\S]*?\*\//g, '').split(/\s+/).join(' ');
  ok(/kit\.svg\('polygon', \{ points: [^}]*'class': 'numline-tri' \}, svg\)/.test(src) && !/numline-stem/.test(src) && !/numline-stem/.test(css), '圓點下方改成倒三角形（polygon），舊的短直線（numline-stem）拿掉了');
  ok(/stem\.setAttribute\('points', \(x - TRI_HALF\) \+ ',' \+ TRI_BASE \+ ' ' \+ \(x \+ TRI_HALF\) \+ ',' \+ TRI_BASE \+ ' ' \+ x \+ ',' \+ LY\)/.test(src), '三角形三個點：左上、右上、尖端（x, LY）——尖端正好在數線的高度，水平位置跟圓點一樣');
  ok(/var TRI_HALF = 14, TRI_BASE = LY - 56;/.test(src) && 14 <= Math.sqrt(20 * 20 - 14 * 14) + 1, '底邊的兩個角（半寬 14、在圓點底部上方 6px）還在圓點（半徑 20）裡面，被圓點蓋住');
  ok(src.indexOf("kit.svg('polygon'") < src.indexOf("kit.svg('circle', { cx: 0, cy: LY - 70"), '先畫三角形、後畫圓點（圓點蓋在三角形上面）');
  ok(/\.numline-tri \{[^}]*fill: var\(--c-orange\)[^}]*stroke: var\(--c-ink\)[^}]*stroke-linejoin: round/.test(css), '三角形：橘色填滿、細外框、圓角接頭（顏色用 CSS 變數）');
  // 用幾何算一次：尖端（x, LY）、底邊在 LY − 56：高度 56，圓點底部 LY − 50，所以三角形露出圓點的部分是 50px
  const LY = 300, x = 123.4, pts = [[x - 14, LY - 56], [x + 14, LY - 56], [x, LY]]; ok(pts[2][1] === LY && pts[2][0] === x && Math.abs(pts[0][1] - pts[1][1]) < 1e-9, '三角形尖端在數線上、底邊水平'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
