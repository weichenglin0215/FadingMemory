// 動態視力（kinetic，企劃 333）的純函式檢查：難度線性、號碼與錯誤選項（長得像）、火車速度與位置、版面、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_kinetic.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261202), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e);

// ── 難度（線性，第 30 關到頂；使用者企劃：第 30 關每節車廂只在畫面上 0.5 秒）──
ok(T.RAMP_LEVELS === 30 && near(T.viewSFor(1), T.VIEW_S[0]) && near(T.viewSFor(30), T.VIEW_S[1]) && near(T.viewSFor(99), T.VIEW_S[1]), '每節車廂在畫面上 ' + T.VIEW_S[0] + ' → ' + T.VIEW_S[1] + ' 秒（第 30 關；參數 VIEW_S，使用者可調，測試跟著參數走）');
ok(T.digitsFor(1) === T.DIGITS[0] && T.digitsFor(30) === T.DIGITS[1] && T.digitsFor(99) === T.DIGITS[1], '號碼位數 ' + T.DIGITS[0] + ' → ' + T.DIGITS[1]);
ok(T.carsFor(1) === T.CARS[0] && T.carsFor(30) === T.CARS[1], '車廂數 ' + T.CARS[0] + ' → ' + T.CARS[1]);
ok(T.decoysFor(1) === T.DECOY_STICKERS[0] && T.decoysFor(30) === T.DECOY_STICKERS[1], '干擾貼紙 ' + T.DECOY_STICKERS[0] + ' → ' + T.DECOY_STICKERS[1]);
ok(near(T.simPFor(1), 0) && near(T.simPFor(30), 1), '選項相似度 0 → 1');
{ const d = []; for (let n = 2; n <= 30; n++) { ok(T.viewSFor(n) <= T.viewSFor(n - 1) && T.digitsFor(n) >= T.digitsFor(n - 1) && T.carsFor(n) >= T.carsFor(n - 1) && T.decoysFor(n) >= T.decoysFor(n - 1) && T.simPFor(n) >= T.simPFor(n - 1), '單調 ' + n); d.push(T.viewSFor(n - 1) - T.viewSFor(n)); }
  ok(Math.max(...d) - Math.min(...d) <= 0.002, '出現時間線性縮短：每關 −' + Math.min(...d).toFixed(4) + '～−' + Math.max(...d).toFixed(4) + ' 秒'); }

// ── 火車的速度與位置 ──
for (const W of [472, 440, 500]) for (const cars of [4, 6, 8]) {
  const S = T.trainSize(W, cars);
  ok(S.cw === Math.round(W * 0.49) && S.ch === Math.round(S.cw * 170 / 230), '車廂尺寸 ' + S.cw + '×' + S.ch);
  ok(S.total === cars * S.cw + (cars - 1) * T.CAR_GAP, '整列火車的寬 ' + S.total);
  for (const vs of [2.5, 1.5, 0.5]) {
    const v = T.speedFor(W, S.cw, vs);
    // 一節車廂的左端從 W 走到 −cw 要 viewS 秒（整節車廂在畫面內的時間）
    const tIn = (W - (-S.cw)) / v; ok(near(tIn, vs, 1e-9), '一節車廂從右緣出現到左緣消失 = ' + vs + ' 秒');
    ok(near(T.passSeconds(W, S.total, v), (W + S.total) / v) && near(T.trainX(T.passSeconds(W, S.total, v), W, v), -S.total, 1e-6), '整列火車開完的時間／位置（W=' + W + '）');
    ok(T.trainX(0, W, v) === W, '一開始火車在畫面右邊外面');
  }
  for (let i = 0; i < cars; i++) { const rx = T.revealX(W, S.cw, i); ok(Math.abs(rx + T.carOffset(i, S.cw) + S.cw / 2 - W / 2) <= 1, '倒車停的位置：第 ' + (i + 1) + ' 節在正中央'); }
  ok(T.carOffset(3, S.cw) === 3 * (S.cw + T.CAR_GAP), 'carOffset');
}
// 第 30 關火車的速度：（472＋231）÷ 0.5 ≈ 1400 px/秒；第 1 關 ≈ 281
{ const S = T.trainSize(472, T.CARS[1]), v30 = T.speedFor(472, S.cw, T.viewSFor(30)), v1 = T.speedFor(472, S.cw, T.viewSFor(1)); console.log('第 1 關速度 ' + v1.toFixed(0) + ' px/秒，第 30 關 ' + v30.toFixed(0) + ' px/秒（整列開完 ' + T.passSeconds(472, S.total, v30).toFixed(2) + ' 秒）'); const want = T.VIEW_S[0] / T.VIEW_S[1]; ok(v30 / v1 > want * 0.98 && v30 / v1 < want * 1.02, '到頂速度是第 1 關的 ' + want.toFixed(2) + ' 倍（VIEW_S 的比值）'); }

// ── 號碼與選項 ──
{ const seen = {}; for (let i = 0; i < 4000; i++) { const d = 2 + (i % 3), s = T.randomNumber(d, rnd); ok(s.length === d && /^[1-9]\d*$/.test(s) && !/^(\d)\1+$/.test(s), '號碼 ' + s + ' 第一位不是 0、不是每位都一樣'); seen[s] = 1; } ok(Object.keys(seen).length > 500, '號碼有變化'); }
// SIM 表要對稱嗎？不必對稱，但每個數字都至少有 2 個長得像的、而且不包含自己
for (let d = 0; d <= 9; d++) ok(T.SIM[d].length >= 2 && !T.SIM[d].includes(d) && T.SIM[d].every(x => x >= 0 && x <= 9), 'SIM[' + d + '] ' + T.SIM[d]);
// swapDigit：只換指定的位數；第一位不會換成 0；simp＝true 時換成長得像的、false 時換成「不像」的
for (let i = 0; i < 6000; i++) {
  const d = 2 + (i % 3), t = T.randomNumber(d, rnd), pos = i % d, sim = i % 2 === 0, r = T.swapDigit(t, pos, sim, rnd), cur = +t[pos], nw = +r[pos];
  ok(r.length === d && T.diffPositions(t, r).join() === String(pos), 'swapDigit 只換第 ' + pos + ' 位：' + t + '→' + r);
  ok(pos > 0 || nw !== 0, '第一位不會變 0：' + t + '→' + r);
  if (sim) ok(T.SIM[cur].includes(nw) || (pos === 0 && T.SIM[cur].filter(x => x !== 0).length === 0), '換成長得像的：' + cur + '→' + nw);
  else ok(!T.SIM[cur].includes(nw) && nw !== cur, '換成不像的：' + cur + '→' + nw);
}
// makeDecoy：第 1 關（simP=0）換 2 位、都不像；到頂（simP=1）只換 1 位、都像
{ let c2 = 0, c1 = 0, tot = 0, simAll = 0;
  for (let i = 0; i < 4000; i++) { const t = T.randomNumber(2 + (i % 3), rnd), d0 = T.makeDecoy(t, 0, rnd), d1 = T.makeDecoy(t, 1, rnd); tot++;
    if (T.diffPositions(t, d0).length === 2) c2++; if (T.diffPositions(t, d1).length === 1) c1++; if (T.allSimilar(t, d1)) simAll++;
    ok(d0 !== t && d1 !== t && d0.length === t.length && d1.length === t.length, '錯誤選項跟答案不同、位數一樣'); }
  ok(c2 === tot && c1 === tot && simAll === tot, 'simP=0：全部換 2 位；simP=1：全部換 1 位且都換成長得像的（' + c2 + '／' + c1 + '／' + simAll + '／' + tot + '）'); }
// 中間：simP=0.5 時兩種都會出現
{ let one = 0, two = 0; for (let i = 0; i < 4000; i++) { const t = T.randomNumber(3, rnd), x = T.makeDecoy(t, 0.5, rnd), n = T.diffPositions(t, x).length; if (n === 1) one++; else if (n === 2) two++; } ok(one > 1200 && two > 1200 && one + two === 4000, 'simP=0.5：一位 ' + one + '、兩位 ' + two); }
// 一位數字的號碼（理論上不會出現，位數最少 2）：makeDecoy 仍然能做
{ const x = T.makeDecoy('7', 0.3, rnd); ok(x.length === 1 && x !== '7', '一位數的保險'); }

// ── 出一關：全部關卡掃一遍 ──
const ST = { n: 0, digits: {}, targetPos: {}, byCars: {}, win: {}, stickers: 0, sameFirst: 0, optDiff: { 1: 0, 2: 0 }, sim: 0, tot: 0 };
for (let lv = 1; lv <= 60; lv++) for (let rep = 0; rep < 60; rep++) {
  const q = T.makeLevel(lv, rnd); ST.n++;
  ok(q.options.length === 4 && new Set(q.options).size === 4, '4 個不同的選項：' + q.options);
  ok(q.options[q.answerIdx] === q.number && q.options.filter(o => o === q.number).length === 1, '答案只有一個、在 answerIdx');
  ok(q.options.every(o => o.length === q.digits && /^[1-9]\d*$/.test(o)), '每個選項位數相同、第一位不是 0');
  ok(q.digits === T.digitsFor(lv) && q.cars === T.carsFor(lv) && near(q.viewS, T.viewSFor(lv)) && near(q.simP, T.simPFor(lv)), '參數跟關卡一致');
  ok(q.target >= 0 && q.target < q.cars && q.windows.length === q.cars && q.windows.every(w => T.WINDOWS.includes(w)), '貼號碼的車廂 / 窗戶種類');
  const sk = Object.keys(q.stickers).map(Number);
  ok(sk.length === T.decoysFor(lv) && sk.every(i => i !== q.target && i >= 0 && i < q.cars) && Object.values(q.stickers).every(c => T.LETTERS.includes(c) && !/\d/.test(c)), '干擾貼紙在別節車廂、是字母不是數字：' + JSON.stringify(q.stickers));
  ST.digits[q.digits] = (ST.digits[q.digits] || 0) + 1; ST.targetPos[q.target] = (ST.targetPos[q.target] || 0) + 1; (ST.byCars[q.cars] = ST.byCars[q.cars] || {})[q.target] = ((ST.byCars[q.cars] || {})[q.target] || 0) + 1; ST.stickers += sk.length;
  q.options.forEach((o, i) => { if (i !== q.answerIdx) { const n = T.diffPositions(q.number, o).length; ST.optDiff[n] = (ST.optDiff[n] || 0) + 1; ST.tot++; if (T.allSimilar(q.number, o)) ST.sim++; } });
  q.windows.forEach(w => { ST.win[w] = (ST.win[w] || 0) + 1; });
}
console.log('共 ' + ST.n + ' 關；位數 ' + JSON.stringify(ST.digits) + '；貼號碼的車廂位置 ' + JSON.stringify(ST.targetPos) + '；窗戶種類 ' + JSON.stringify(ST.win));
ok(T.WINDOWS.every(w => ST.win[w] > 100), '每種窗戶都常出現');
// 車廂數隨關卡變（CARS），所以「平均分布」要分開看：同樣 c 節車廂的所有關卡裡，每個位置（含最後一節）都要出現，而且不能比平均少太多
for (const c of Object.keys(ST.byCars).map(Number)) { const m = ST.byCars[c], tot = Object.values(m).reduce((a, b) => a + b, 0), exp = tot / c; ok(Object.keys(m).length === c && Object.values(m).every(v => v > exp * 0.6 && v < exp * 1.4), c + ' 節車廂：貼號碼的位置平均分布（含最後一節）：' + JSON.stringify(m)); }
ok(Object.keys(ST.byCars).length >= 3 && Object.keys(ST.targetPos).length === T.CARS[1], '車廂數有好幾種、最多 ' + T.CARS[1] + ' 個位置都出現過');
// 第 1 關：每個錯誤選項換了 2 位、都不像；到頂的關卡：換 1 位、都像
{ let a = 0, an = 0, b = 0, bn = 0; for (let i = 0; i < 300; i++) { const q1 = T.makeLevel(1, rnd), q2 = T.makeLevel(30, rnd); q1.options.forEach((o, k) => { if (k !== q1.answerIdx) { an++; if (T.diffPositions(q1.number, o).length === 2 && !T.allSimilar(q1.number, o)) a++; } }); q2.options.forEach((o, k) => { if (k !== q2.answerIdx) { bn++; if (T.diffPositions(q2.number, o).length === 1 && T.allSimilar(q2.number, o)) b++; } }); }
  ok(a === an && b === bn, '第 1 關的錯誤選項都差 2 位、不像；第 30 關都差 1 位、很像（' + a + '/' + an + '，' + b + '/' + bn + '）'); }
// 越後面錯誤選項越像（平均差的位數下降）
{ function avgDiff(lv) { let t = 0, c = 0; for (let i = 0; i < 400; i++) { const q = T.makeLevel(lv, rnd); q.options.forEach((o, k) => { if (k !== q.answerIdx) { t += T.diffPositions(q.number, o).length; c++; } }); } return t / c; }
  const a = avgDiff(1), b = avgDiff(15), c = avgDiff(30); ok(a > b && b > c && a > 1.9 && c < 1.01, '錯誤選項平均差的位數：' + a.toFixed(2) + ' → ' + b.toFixed(2) + ' → ' + c.toFixed(2)); }
// 出題速度與同種子同題目
{ const t0 = Date.now(); for (let i = 0; i < 3000; i++) T.makeLevel(30, rnd); ok((Date.now() - t0) / 3000 < 1, '出題夠快'); const a = T.makeLevel(12, rng(99)), b = T.makeLevel(12, rng(99)); ok(JSON.stringify(a) === JSON.stringify(b), '同種子同題目'); }

// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_kinetic.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: REVERSE_MS \+ ZOOM_MS \+ 2600/.test(src) && T.REVERSE_MS + T.ZOOM_MS + 2600 >= 2000 && /knt-sticker--zoom/.test(src) && /kit\.easeOutCubic/.test(src), '揭曉：火車倒車、貼紙放大、失敗停格 2 秒以上');
  ok(src.includes('endX = -(T.total + TAIL_PAD)') && src.includes('passSeconds(W, T.total + TAIL_PAD, v)') && src.includes('i < q.cars - 1'), '火車多走 TAIL_PAD 才算開出畫面、最後一節不畫連結器');
  ok(/phase === 'ask'/.test(src) && /api\.timer\(ANSWER_S/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src), '火車開走才出現選項、有作答時限、solve／wrong 只在作答階段有效');
  ok(/\.knt-sticker \{[^}]*var\(--knt-sticker\)/.test(css) && /\.knt-ok \{[^}]*var\(--c-ok/.test(css) && /\.knt-bad \{[^}]*var\(--c-bad-light\)/.test(css) && /\.knt-band \{[^}]*var\(--knt-band\)/.test(css), '貼紙、選項顏色、車身用 CSS 變數');
  ok(/\.knt-field \{[^}]*overflow: hidden/.test(css) && /\.knt-train \{[^}]*will-change: transform/.test(css), '火車超出畫面的部分藏起來');
  ok(boot.indexOf("'js/reaction_kinetic.js'") > 0 && /0\.5 秒/.test(G.rule), 'boot.js 有載入、玩法說明提到 0.5 秒'); }
ok(T.rating(1) !== T.rating(4) && T.rating(4) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
