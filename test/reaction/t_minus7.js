// 一路減七（minus7，企劃 392 依使用者流程）的純函式檢查：數列（1000 起、−7／−13／＋17、−9 輪流）、三個連續數字的選項、大字（−7／再 −7）、規則換的預告、限時線性、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_minus7.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261215), rnd = rng(SEED);

// ── 使用者規定 ──
ok(T.START === 1000, '從 1000 開始（使用者企劃）');
ok(T.stepDelta(0) === -7 && T.valueAfter(0) === 1000 && T.valueAfter(1) === 993 && T.valueAfter(2) === 986 && T.valueAfter(3) === 979, '1000 → 993 → 986 → 979');
// ── 獨立算法：逐題累加對照 valueAfter ──
{ let v = 1000; for (let i = 0; i < 200; i++) { let d; if (i < 15) d = -7; else if (i < 25) d = -13; else d = (i - 25) % 2 === 0 ? 17 : -9; ok(T.stepDelta(i) === d, '第 ' + i + ' 題的變化量 ' + d); ok(T.valueAfter(i) === v, '答對 ' + i + ' 題之後是 ' + v + '（算出 ' + T.valueAfter(i) + '）'); v += d; } }
ok(T.stepDelta(14) === -7 && T.stepDelta(15) === -13 && T.stepDelta(24) === -13 && T.stepDelta(25) === 17 && T.stepDelta(26) === -9 && T.stepDelta(27) === 17, '第 15 題起 −13、第 25 題起 ＋17／−9 輪流（使用者企劃的規則轉換點）');
{ let mn = 1e9; for (let i = 0; i <= 400; i++) mn = Math.min(mn, T.valueAfter(i)); ok(mn > 500, '數字不會掉到很小或負數：最小 ' + mn); }
// 輪流階段每兩題淨增 ＋8
ok(T.valueAfter(27) - T.valueAfter(25) === 8 && T.valueAfter(31) - T.valueAfter(29) === 8, '加 17 減 9 輪流：每兩題淨增 8');

// ── 限時（線性）──
ok(T.timeMs(0) === 6000 && T.timeMs(T.RAMP_Q) === 2500 && T.timeMs(999) === 2500, '每題限時 6 → 2.5 秒');
{ const d = []; for (let n = 1; n <= T.RAMP_Q; n++) { ok(T.timeMs(n) <= T.timeMs(n - 1), '單調 ' + n); d.push(T.timeMs(n - 1) - T.timeMs(n)); } ok(Math.max(...d) - Math.min(...d) <= 1, '限時線性縮短：每題 −' + Math.min(...d) + '～−' + Math.max(...d) + ' 毫秒'); }

// ── 大字與預告 ──
ok(T.deltaText(-7) === '−7' && T.deltaText(17) === '＋17' && T.deltaText(-13) === '−13' && T.deltaText(-9) === '−9', 'deltaText');
ok(T.bigText(0) === '−7' && T.bigText(1) === '再 −7' && T.bigText(2) === '再 −7' && T.bigText(14) === '再 −7', '第一題「−7」、之後「再 −7」（使用者企劃）');
ok(T.bigText(15) === '−13' && T.bigText(16) === '再 −13' && T.bigText(25) === '＋17' && T.bigText(26) === '−9' && T.bigText(27) === '＋17', '規則剛換、加減輪流時只寫算式');
ok(T.noticeBefore(14) === null && /−13/.test(T.noticeBefore(15)) && T.noticeBefore(16) === null && /＋17/.test(T.noticeBefore(25)) && /−9/.test(T.noticeBefore(25)) && T.noticeBefore(0) === null, '規則換之前預告（第 15、25 題）');

// ── 三個連續數字的選項 ──
{ const pos = [0, 0, 0]; for (let i = 0; i < 9000; i++) { const ans = 100 + Math.floor(rnd() * 900), o = T.makeOptions(ans, rnd); ok(o.options.length === 3 && o.options[1] === o.options[0] + 1 && o.options[2] === o.options[1] + 1, '三個連續整數'); ok(o.options[o.idx] === ans && o.options.filter(v => v === ans).length === 1, '正確答案剛好一個、在 idx'); pos[o.idx]++; }
  ok(pos.every(v => Math.abs(v / 9000 - 1 / 3) < 0.03), '正確答案在第 1、2、3 個的機會平均：' + pos.join('/')); }

// ── 一題 ──
for (let i = 0; i < 300; i++) {
  const q = T.makeQuestion(i, rnd);
  ok(q.i === i && q.from === T.valueAfter(i) && q.delta === T.stepDelta(i) && q.ans === q.from + q.delta && q.options[q.idx] === q.ans && q.big === T.bigText(i) && q.time === T.timeMs(i) && q.notice === T.noticeBefore(i), '第 ' + i + ' 題的各欄位');
  // 常見錯誤（借位算錯、忘了借位）不會剛好是選項裡的另一個數字之外的陷阱——選項只差 1：把「從 from 算錯」的結果列出來，確認錯的答案如果出現在選項裡也只是鄰近的數字
  ok(Math.max(...q.options) - Math.min(...q.options) === 2, '選項只差 2 以內');
}
// 公式與說明
{ const q = T.makeQuestion(2, rnd); ok(T.formula(q) === '986 − 7 ＝ 979'.replace('−', '−') || T.formula(q) === '986 − 7 ＝ 979', '算式：' + T.formula(q)); ok(T.whyText(q, 989) === '算錯了！986 − 7 ＝ 979，你選了 989' && T.whyText(q, null) === '時間到！986 − 7 ＝ 979', 'whyText（含使用者企劃的算式說明）');
  const q2 = T.makeQuestion(25, rnd); ok(T.formula(q2) === q2.from + ' ＋ 17 ＝ ' + q2.ans, '加法的算式：' + T.formula(q2)); }
// 整串數字
{ const c = T.chain(4, 10); ok(c.join() === '1000,993,986,979,972', '整串數字（不夠 10 步就從頭）'); const c2 = T.chain(30, 10); ok(c2.length === 10 && c2[9] === T.valueAfter(30) && c2[0] === T.valueAfter(21), '最後 10 步'); }

// ── 程式裡的接線 ──
{ const rd = pth => require('fs').readFileSync(require('path').resolve(__dirname, pth), 'utf8'), src = rd('../../js/reaction_minus7.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/請從 ' \+ START \+ ' 開始計數/.test(src) && /mn7-pop--out/.test(src) && /SHRINK_MS/.test(src) && /GROW_MS/.test(src) && /pop\(false\)/.test(src) && /pop\(true\)/.test(src), '開場提示「請從 1000 開始計數」；答對時大字和按鈕一起縮小再放大');
  ok(/api\.fail\(\{ delay: 4200/.test(src) && /mn7-chain/.test(src) && /whyText\(q, pk\)/.test(src) && /api\.timer\(q\.time/.test(src), '失敗：整串數字＋算式、停格夠久；每題限時');
  ok(/scoreOf/.test(src) && /resume: false/.test(src) && /SOLVE_CAP/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src), '成績用 scoreOf、solve 有上限');
  ok(/\.mn7-big \{[^}]*var\(--mn7-lcd\)/.test(css) && /\.mn7-btn \{[^}]*var\(--mn7-key-top\)/.test(css) && /\.mn7-pop--out \{[^}]*scale\(0\.08\)/.test(css) && /\.mn7-btn--ok \{[^}]*var\(--c-ok\)/.test(css), '液晶、銀色按鍵、縮放動畫、對錯顏色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_minus7.js'") > 0 && /再 −7/.test(G.rule) && /1000/.test(G.rule), 'boot.js 有載入、玩法說明提到 1000 與「再 −7」'); }
ok(T.rating(1) !== T.rating(6) && T.rating(6) !== T.rating(15) && T.rating(15) !== T.rating(25) && T.rating(25) !== T.rating(35), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
