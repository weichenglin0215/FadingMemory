// 零秒出手：倒數從 7.0000 開始，4.0000 起數字慢慢變透明，3.0000 完全透明（V1.22.0）
const { game } = require('./load.js');
const G = game('reaction_speed.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
ok(T.TOTAL === 7000 && T.FADE_AT === 4000 && T.HIDE_AT === 3000, '常數：7 秒開始、4 秒起變透明、3 秒看不見');
ok(T.opacityAt(7000) === 1 && T.opacityAt(5000) === 1 && T.opacityAt(4000) === 1, '4 秒以前完全看得見');
ok(T.opacityAt(3000) === 0 && T.opacityAt(1000) === 0 && T.opacityAt(0) === 0, '3 秒以後完全透明');
ok(near(T.opacityAt(3500), 0.5) && near(T.opacityAt(3750), 0.75) && near(T.opacityAt(3250), 0.25), '4～3 秒之間線性變透明');
for (let ms = 4000; ms > 3000; ms -= 10) ok(T.opacityAt(ms - 10) <= T.opacityAt(ms), '單調不增 ' + ms);
ok(/7\.0000/.test(G.rule) && /4\.0000/.test(G.rule) && /3\.0000/.test(G.rule), '規則說明有寫新的秒數');
// V1.23.0：低於 4.0000 秒，數字下方浮出「請在心中默數至 0」
ok(T.COUNT_AT === 4000 && T.COUNT_TEXT === '請在心中默數至 0', '提示文字與門檻：4.0000 秒、「請在心中默數至 0」');
ok(T.countVisible(7000) === false && T.countVisible(5000) === false && T.countVisible(4000) === false, '4.0000 秒以前（含剛好 4.0000）不顯示');
ok(T.countVisible(3999.9) === true && T.countVisible(3500) === true && T.countVisible(3000) === true && T.countVisible(0) === true, '低於 4.0000 秒就顯示，一路到 0');
ok(T.countVisible(T.FADE_AT) === false && T.countVisible(T.FADE_AT - 0.0001) === true, '門檻跟數字開始變透明的時刻是同一個瞬間');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
