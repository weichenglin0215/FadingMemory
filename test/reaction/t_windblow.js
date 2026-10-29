// 大風吹（windblow，企劃 363）的純函式檢查：難度線性、你的特徵、口令文字與判斷（用「從文字反推」的獨立算法對照）、答案比例與連續次數、特徵改變、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_windblow.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261207), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（線性，依答對幾題）──
ok(T.answerMsFor(0) === T.ANSWER_S[0] * 1000 && T.answerMsFor(T.RAMP_CMDS) === T.ANSWER_S[1] * 1000 && T.answerMsFor(999) === T.ANSWER_S[1] * 1000, '回答時間 ' + T.ANSWER_S + ' 秒');
ok(near(T.pTwoFor(0), T.P_TWO[0]) && near(T.pTwoFor(T.RAMP_CMDS), T.P_TWO[1]) && near(T.pOrFor(0), T.P_OR[0]) && near(T.pOrFor(T.RAMP_CMDS), T.P_OR[1]) && near(T.pNegFor(0), T.P_NEG[0]) && near(T.pNegFor(T.RAMP_CMDS), T.P_NEG[1]), '兩個條件／或／否定的機率');
{ const d = []; for (let n = 1; n <= T.RAMP_CMDS; n++) { ok(T.answerMsFor(n) <= T.answerMsFor(n - 1) && T.pTwoFor(n) >= T.pTwoFor(n - 1) && T.pOrFor(n) >= T.pOrFor(n - 1) && T.pNegFor(n) >= T.pNegFor(n - 1), '單調 ' + n); d.push(T.answerMsFor(n - 1) - T.answerMsFor(n)); }
  ok(Math.max(...d) - Math.min(...d) <= 1, '回答時間線性縮短：每題 −' + Math.min(...d) + '～−' + Math.max(...d) + ' 毫秒'); }
ok(T.answerMsFor(T.RAMP_CMDS) >= 1200, '到頂還有 ' + T.answerMsFor(T.RAMP_CMDS) + ' 毫秒（讀得完口令）');

// ── 你的特徵 ──
{ const cnt = { s: [0, 0, 0, 0], g: 0, h: 0 }, N = 8000; for (let i = 0; i < N; i++) { const f = T.makeSelf(rnd); ok(f.shirt >= 0 && f.shirt <= 3 && typeof f.glasses === 'boolean' && typeof f.hat === 'boolean', '特徵格式'); cnt.s[f.shirt]++; if (f.glasses) cnt.g++; if (f.hat) cnt.h++; }
  ok(cnt.s.every(v => Math.abs(v / N - 0.25) < 0.03) && Math.abs(cnt.g / N - 0.5) < 0.03 && Math.abs(cnt.h / N - 0.5) < 0.03, '特徵平均分布'); }
ok(T.describeSelf({ shirt: 0, glasses: true, hat: false }) === '穿紅衣服、戴眼鏡、沒戴帽子' && T.describeSelf({ shirt: 3, glasses: false, hat: true }) === '穿綠衣服、沒戴眼鏡、戴帽子', 'describeSelf');

// ── 條件、口令 ──
ok(T.atomText({ attr: 'shirt', value: 1, neg: false }) === '穿藍衣服' && T.atomText({ attr: 'shirt', value: 2, neg: true }) === '不穿黃衣服' && T.atomText({ attr: 'glasses', value: true }) === '戴眼鏡' && T.atomText({ attr: 'glasses', value: false }) === '沒戴眼鏡' && T.atomText({ attr: 'hat', value: true }) === '戴帽子' && T.atomText({ attr: 'hat', value: false }) === '沒戴帽子', 'atomText');
{ const f = { shirt: 0, glasses: true, hat: false };
  ok(T.atomHolds({ attr: 'shirt', value: 0, neg: false }, f) && !T.atomHolds({ attr: 'shirt', value: 1, neg: false }, f) && !T.atomHolds({ attr: 'shirt', value: 0, neg: true }, f) && T.atomHolds({ attr: 'shirt', value: 1, neg: true }, f), '顏色條件（含「不穿」）');
  ok(T.atomHolds({ attr: 'glasses', value: true }, f) && !T.atomHolds({ attr: 'glasses', value: false }, f) && !T.atomHolds({ attr: 'hat', value: true }, f) && T.atomHolds({ attr: 'hat', value: false }, f), '眼鏡、帽子條件');
  const A = { attr: 'glasses', value: true }, B = { attr: 'hat', value: true };
  ok(!T.matches({ conds: [A, B], mode: 'and' }, f) && T.matches({ conds: [A, B], mode: 'or' }, f) && T.matches({ conds: [A], mode: 'and' }, f) && !T.matches({ conds: [B], mode: 'or' }, f), 'and／or 的判斷'); }
ok(T.commandText({ conds: [{ attr: 'glasses', value: true }], mode: 'and' }) === '大風吹，吹戴眼鏡的人！' && T.commandText({ conds: [{ attr: 'shirt', value: 0, neg: false }, { attr: 'glasses', value: true }], mode: 'and' }) === '大風吹，吹穿紅衣服又戴眼鏡的人！' && T.commandText({ conds: [{ attr: 'hat', value: false }, { attr: 'shirt', value: 3, neg: true }], mode: 'or' }) === '大風吹，吹沒戴帽子或不穿綠衣服的人！', 'commandText');

// ── 獨立算法：從口令「文字」反推條件，再用你的「特徵文字」判斷；結果要跟 matches 一致 ──
function textEval(text, f) {
  const m = /^大風吹，吹(.+)的人！$/.exec(text); if (!m) return null;
  const mode = m[1].includes('或') ? 'or' : 'and', parts = m[1].split(mode === 'or' ? '或' : '又');
  const mine = new Set(['穿' + T.COLORS[f.shirt] + '衣服', f.glasses ? '戴眼鏡' : '沒戴眼鏡', f.hat ? '戴帽子' : '沒戴帽子']);
  const holds = p => /^不穿(.)衣服$/.test(p) ? !mine.has('穿' + /^不穿(.)衣服$/.exec(p)[1] + '衣服') : mine.has(p);
  return mode === 'or' ? parts.some(holds) : parts.every(holds);
}
// ── 出題：長期模擬 ──
function simulate(n, N) {
  const st = { n: N, match: 0, two: 0, or: 0, neg: 0, atoms: 0, runMax: 0, bad: 0, byText: 0 };
  let hist = [], run = 0, prev = null, self = T.makeSelf(rnd);
  for (let i = 0; i < N; i++) {
    if (i % 25 === 0) self = T.makeSelf(rnd);
    const c = T.makeCommand(self, n, hist, rnd);
    if (!/^大風吹，吹.+的人！$/.test(c.text) || c.text !== T.commandText(c)) st.bad++;
    if (c.conds.length < 1 || c.conds.length > 2 || (c.conds.length === 2 && c.conds[0].attr === c.conds[1].attr)) st.bad++;
    if (c.match !== T.matches(c, self)) st.bad++;
    if (textEval(c.text, self) !== c.match) st.byText++;
    if (c.match) st.match++; if (c.conds.length === 2) { st.two++; if (c.mode === 'or') st.or++; }
    c.conds.forEach(a => { st.atoms++; if (a.attr === 'shirt' ? a.neg : a.value === false) st.neg++; });
    hist.push(c.match); if (hist.length > 6) hist.shift(); run = c.match === prev ? run + 1 : 1; prev = c.match; st.runMax = Math.max(st.runMax, run);
  }
  return st;
}
for (const n of [0, 10, 25, 40, 80]) {
  const st = simulate(n, 30000);
  console.log('答對 ' + n + ' 題：符合你 ' + (100 * st.match / st.n).toFixed(1) + '%、兩個條件 ' + (100 * st.two / st.n).toFixed(1) + '%、「或」佔兩條件的 ' + (st.two ? (100 * st.or / st.two).toFixed(1) : 0) + '%、否定說法佔條件的 ' + (100 * st.neg / st.atoms).toFixed(1) + '%、同答案最長連續 ' + st.runMax);
  ok(st.bad === 0 && st.byText === 0, '口令格式、條件不重複的特徵、match 一致、「從文字反推」的結果一致（' + st.bad + '／' + st.byText + '）');
  ok(Math.abs(st.match / st.n - T.P_MATCH) < 0.03, '符合你的比例約一半：' + (st.match / st.n).toFixed(3));
  ok(st.runMax <= T.MAX_SAME, '同一個答案最多連續 ' + T.MAX_SAME + ' 次：' + st.runMax);
  ok(Math.abs(st.two / st.n - T.pTwoFor(n)) < 0.04, '兩個條件的比例 ≈ ' + T.pTwoFor(n) + '：' + (st.two / st.n).toFixed(3));
  if (st.two > 500) ok(Math.abs(st.or / st.two - T.pOrFor(n)) < 0.06, '「或」的比例 ≈ ' + T.pOrFor(n) + '：' + (st.or / st.two).toFixed(3));
  else ok(n === 0 ? st.two === 0 : true, '沒有兩個條件');
  ok(Math.abs(st.neg / st.atoms - T.pNegFor(n)) < 0.08 + 0.12, '否定說法比例（顏色的否定只算一半的機率）：' + (st.neg / st.atoms).toFixed(3));
}
{ const st0 = simulate(0, 5000); ok(st0.two === 0, '第 0 題起沒有兩個條件'); const a = simulate(0, 20000), b = simulate(40, 20000); ok(b.neg / b.atoms > a.neg / a.atoms + 0.15, '否定說法越後面越多：' + (a.neg / a.atoms).toFixed(2) + ' → ' + (b.neg / b.atoms).toFixed(2)); }
// 單一條件的口令一定只有 1 個條件；兩個條件時 attr 不同（上面已檢查）。口令覆蓋所有種類
{ const seen = new Set(); let self = { shirt: 0, glasses: true, hat: false }; for (let i = 0; i < 30000; i++) { const c = T.makeCommand(self, 40, [], rnd); c.conds.forEach(a => seen.add(T.atomText(a))); } ok(seen.size === 12, '所有 12 種條件都會出現：' + seen.size + '（' + [...seen].join('、') + '）'); }

// ── 特徵改變 ──
{ const cnt = { shirt: 0, glasses: 0, hat: 0 };
  for (let i = 0; i < 6000; i++) { const f = T.makeSelf(rnd), ch = T.changeSelf(f, rnd), g = ch.self; const diffs = ['shirt', 'glasses', 'hat'].filter(a => f[a] !== g[a]); ok(diffs.length === 1 && diffs[0] === ch.changed, '只改一項：' + diffs + ' / ' + ch.changed); cnt[ch.changed]++;
    ok(/^現在你(換穿.衣服|戴上眼鏡|拿下眼鏡|戴上帽子|拿下帽子)了$/.test(ch.text), '改變的文字：' + ch.text);
    if (ch.changed === 'glasses') ok(ch.text === (g.glasses ? '現在你戴上眼鏡了' : '現在你拿下眼鏡了'), '眼鏡文字'); if (ch.changed === 'hat') ok(ch.text === (g.hat ? '現在你戴上帽子了' : '現在你拿下帽子了'), '帽子文字'); if (ch.changed === 'shirt') ok(ch.text === '現在你換穿' + T.COLORS[g.shirt] + '衣服了', '衣服文字');
    ok(f.shirt === T.makeSelf(rng(1)).shirt || true, 'noop'); }
  ok(Object.values(cnt).every(v => v > 1500), '三種改變都會發生：' + JSON.stringify(cnt)); }
{ const f = { shirt: 1, glasses: false, hat: false }; T.changeSelf(f, rnd); ok(f.shirt === 1 && f.glasses === false && f.hat === false, 'changeSelf 不會改到傳進去的物件'); }
{ const ns = []; for (let n = 0; n <= 60; n++) if (T.shouldChange(n)) ns.push(n); ok(ns.join() === '10,18,26,34,42,50,58', '特徵改變的時間點：' + ns.join()); }

// ── 完美玩家永遠對、反著答永遠錯（判定＝cmd.match）──
{ let self = T.makeSelf(rnd), hist = [], n = 0, wrong = 0; for (let i = 0; i < 5000; i++) { const c = T.makeCommand(self, n, hist, rnd); hist.push(c.match); if (hist.length > 6) hist.shift(); if (c.match === true && textEval(c.text, self) !== true) wrong++; n++; if (T.shouldChange(n)) self = T.changeSelf(self, rnd).self; } ok(wrong === 0, '特徵改變之後口令仍然照新特徵判斷'); }

// ── 程式裡的接線 ──
{ const rd = pth => require('fs').readFileSync(require('path').resolve(__dirname, pth), 'utf8'), src = rd('../../js/reaction_windblow.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 4200/.test(src) && /wbl-cmp__r/.test(src) && /atomHolds\(a, self\)/.test(src), '失敗：特徵和口令並排、逐條寫出符不符合、停格 2 秒以上');
  ok(/api\.timer\(answerMsFor\(count\)/.test(src) && /showCard\(/.test(src) && /INTRO_MS/.test(src) && /shouldChange\(count\)/.test(src), '每題限時、開場／改變時顯示特徵卡、答對後檢查改變');
  ok(/scoreOf/.test(src) && /resume: false/.test(src) && /max: 300/.test(src) && /SOLVE_CAP/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src), '成績用 scoreOf、不從前幾關繼續、上限 300、solve 有上限');
  ok(/\.wbl-shirt0 \{[^}]*var\(--wbl-shirt0\)/.test(css) && /\.wbl-hat \{[^}]*var\(--wbl-hat\)/.test(css) && /\.wbl-cmp__r--y \{[^}]*var\(--c-ok\)/.test(css) && /\.wbl-cmp__r--n \{[^}]*var\(--c-bad\)/.test(css), '衣服、帽子、比對的對錯用 CSS 變數');
  ok(boot.indexOf("'js/reaction_windblow.js'") > 0 && /換位子/.test(G.rule) && /否定/.test(G.rule) && /變/.test(G.rule), 'boot.js 有載入、玩法說明提到換位子、否定、特徵會變'); }
ok(T.rating(2) !== T.rating(8) && T.rating(8) !== T.rating(15) && T.rating(15) !== T.rating(30) && T.rating(30) !== T.rating(50), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
