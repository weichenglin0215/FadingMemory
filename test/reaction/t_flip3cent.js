// 翻三湊百（flip3cent，V1.57.0）與共用引擎 js/flipsum_core.js 的三張一組部分：
//   一副牌「除了預定的幾組，找不到別組三張加起來是 100」（不然會卡死）、尾數猜不準、完美記憶策略、上限、時間延長三倍、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_flip3cent.js'); const T = G.test; const FS = T.FS;
const P2 = game('reaction_flipcent.js').test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261114), rnd = rng(SEED);

ok(G.id === 'flip3cent' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
ok(/100/.test(G.rule) && /三張/.test(G.rule) && /非常困難/.test(G.rule) && /4\.5 秒/.test(G.rule), '玩法說明提到 100、三張、非常困難、4.5 秒');
// ── 時間延長三倍（玩家意見）──
ok(T.SHOW_K === 3 && T.PAIR_SHOW_MS === P2.SHOW_MS && T.SHOW_MS === P2.SHOW_MS * 3, '翻錯時露出的時間 ＝ 翻牌湊百（' + P2.SHOW_MS + ' 毫秒）的 3 倍＝' + T.SHOW_MS + ' 毫秒');
// ── 張數：三的倍數、最多 18 張 ──
T.STAGES.forEach((st, i) => { const from = i === 0 ? 1 : T.STAGES[i - 1].to + 1; ok(T.cardsFor(from) === st.cards && T.cardsFor(Math.min(st.to, from + 2)) === st.cards, '階段 ' + st.cards + ' 張'); ok(st.cards % 3 === 0 && st.cards <= 24, st.cards + ' 張是 3 的倍數、不超過 24 張（使用者調到 21 張；太多張沒辦法保證不會卡死，makeTripleDeck 會退而求其次）'); });
ok(T.slackFor(1) === T.SLACK[0] && T.slackFor(T.RAMP_LEVELS) === T.SLACK[1] && T.slackFor(200) === T.SLACK[1], '寬限 ' + T.SLACK);
for (let l = 2; l <= 60; l++) ok(T.cardsFor(l) >= T.cardsFor(l - 1), '張數單調 ' + l);

// ── 發牌：T 組，每組三個數字加起來 100，全部不重複，而且找不到別組三張加起來是 100 ──
for (let n = 3; n <= 18; n += 3) for (let i = 0; i < 150; i++) {
  const Tn = n / 3, d = FS.makeTripleDeck(Tn, rnd), vals = d.deck, tag = n + ' 張第 ' + i + ' 副';
  ok(d.triples.length === Tn && vals.length === n, tag + '：' + Tn + ' 組');
  ok(d.triples.every(t => t.length === 3 && t[0] + t[1] + t[2] === 100 && t.every(v => v >= 1 && v <= 99)), tag + '：每一組三個數字加起來是 100、都在 1～99');
  ok(new Set(vals).size === n, tag + '：數字不重複');
  const vg = FS.validGroups(vals, 3);
  ok(d.clean && vg.length === Tn, tag + '：整副牌裡三張加起來是 100 的只有預定的 ' + Tn + ' 組（找到 ' + vg.length + ' 組）');
  // 預定的三張就是找到的三張（位置 3k, 3k+1, 3k+2）
  ok(vg.every((g, k) => g[0] === 3 * k && g[1] === 3 * k + 1 && g[2] === 3 * k + 2), tag + '：找到的就是預定的那幾組');
}
// 洗牌後也一樣；任何順序都能消完（因為別組都湊不成 100，每一步只有預定的組可以消）
for (const lv of [1, 3, 6, 10, 15, 30, 80]) for (let i = 0; i < 40; i++) {
  const p = T.makePuzzle(lv, rnd), vg = FS.validGroups(p.deck, 3);
  ok(p.n === T.cardsFor(lv) && p.deck.length === p.n && vg.length === p.n / 3, '第 ' + lv + ' 關：' + p.n + ' 張，三張湊成 100 的剛好 ' + p.n / 3 + ' 組（' + vg.length + '）');
  // 兩兩不重疊（每張牌只在一組裡）
  const seen = new Set(); let overlap = false; vg.forEach(g => g.forEach(x => { if (seen.has(x)) overlap = true; seen.add(x); }));
  ok(!overlap && seen.size === p.n, '第 ' + lv + ' 關：每張牌剛好屬於一組');
}
// 「碰巧湊成 100 的別組」確實是隨機牌的常態：隨機抽三個數字加起來是 100 的比例約 0.5%，24 張的牌平均有好幾組——這就是為什麼要刻意避開
{ let extra = 0; for (let t = 0; t < 40; t++) { const vs = new Set(); while (vs.size < 24) vs.add(1 + Math.floor(rnd() * 99)); extra += FS.validGroups([...vs], 3).length; } ok(extra / 40 > 3, '24 張隨機牌平均有 ' + (extra / 40).toFixed(1) + ' 組碰巧湊成 100（所以出題一定要避開）'); }
// 尾數：只看尾數（三個尾數加起來是 10 的倍數）會湊到一大堆錯的
{
  let tailValid = 0, real = 0;
  for (let t = 0; t < 60; t++) { const p = T.makePuzzle(15, rnd), d = p.deck; real += p.n / 3; for (let a = 0; a < d.length; a++) for (let b = a + 1; b < d.length; b++) for (let c = b + 1; c < d.length; c++) if ((d[a] % 10 + d[b] % 10 + d[c] % 10) % 10 === 0) tailValid++; }
  console.log('18 張的牌：尾數合格的三張平均 ' + (tailValid / 60).toFixed(1) + ' 組，真正湊成 100 的只有 ' + (real / 60).toFixed(0) + ' 組');
  ok(tailValid / real > 5, '只看尾數：尾數合格的三張是真正答案的 ' + (tailValid / real).toFixed(1) + ' 倍（沒辦法只靠尾數投機）');
}
// 出題速度（最大的 18 張）
{ const t0 = Date.now(); for (let i = 0; i < 300; i++) FS.makeTripleDeck(6, rnd); const ms = (Date.now() - t0) / 300; ok(ms < 20, '18 張出題平均 ' + ms.toFixed(2) + ' 毫秒'); }
// 做不到就降級（不會當機）：24 張很難保證，重來 0 次就放棄時 clean 可能是 false，但數字加起來還是對的
{ const d = FS.makeTripleDeck(8, rnd, 0); ok(d.triples.length === 8 && d.triples.every(t => t[0] + t[1] + t[2] === 100) && new Set(d.deck).size === 24, '24 張、不重來：降級也產生合法的牌（clean=' + d.clean + '）'); }

// ── 完美記憶策略：人工算幾個小例子（一次＝翻三張）──
ok(FS.perfectTries([20, 30, 50], 3) === 1, '3 張 20、30、50：翻 1 次');
ok(FS.perfectTries([20, 30, 50, 10, 25, 65], 3) === 2, '20,30,50,10,25,65：左邊三張一組、右邊三張一組，翻 2 次');
ok(FS.perfectTries([20, 10, 25, 30, 50, 65], 3) >= 2 && FS.perfectTries([20, 10, 25, 30, 50, 65], 3) <= 5, '打散的 6 張：2～5 次');
for (const n of [6, 9, 12, 15, 18]) for (let i = 0; i < 80; i++) {
  const d = T.makePuzzle(1 + i % 30, rnd), pf = FS.perfectTries(kitShuffle(FS.makeTripleDeck(n / 3, rnd).deck), 3);
  ok(pf >= n / 3 && pf <= n * 2, n + ' 張的完美翻牌次數 ' + pf + ' 在合理範圍');
  ok(d.limit === d.perfect + T.slackFor(d.level), '上限＝完美＋寬限');
}
function kitShuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// 完美策略真的能把牌翻完（用 perfectTries 同樣的規則模擬一遍：最後一定全部消掉）
for (let i = 0; i < 60; i++) { const d = kitShuffle(FS.makeTripleDeck(6, rnd).deck); const pf = FS.perfectTries(d, 3); ok(pf > 0 && pf < 40, '完美策略有結束（' + pf + ' 次）'); }
ok(T.rating(30) !== T.rating(1) && T.MAX_LEVEL >= 30, '常數與評語');

// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), boot = rd('../../js/boot.js'), menu = rd('../../js/menu.js'), css = rd('../../css/games/reaction_flip3cent.css');
  ok(boot.indexOf("'js/reaction_flip3cent.js'") > 0 && boot.indexOf("'css/games/reaction_flip3cent.css'") > 0, 'boot.js 有載入遊戲與 css');
  ok(/id: 'flip3cent', name: '翻三湊百', cat: 'memory'/.test(menu), '選單有翻三湊百（記憶類）');
  ok(/\.flip3cent-card \{/.test(css) && !/flipcent-/.test(css.replace(/flip3cent-/g, '')), 'css 的 class 都是 flip3cent- 開頭');
  ok(/k: 3/.test(rd('../../js/reaction_flip3cent.js')) && /makeTripleDeck/.test(rd('../../js/reaction_flip3cent.js')), '遊戲用共用引擎（翻三張、三張一組出題）'); }

// ── 牌（答案格子）的高度參數 CARD_H（預設 0.95＝牌寬的 0.95 倍；翻三湊百）──
{ const size = T.FS.cardSize, def = T.CARD_H, W = 472, H = 700, base = size(W, H, T.COLS, T.COLS, def);      /* 一列 COLS 張；牌高用使用者調過的 CARD_H */
  ok(T.CARD_H > 0.3 && T.CARD_H < 3, '牌高參數 CARD_H 是牌寬的幾倍（預設 0.95；使用者可以調，目前 ' + T.CARD_H + '）');
  ok(base.cw === Math.floor(W * 0.96 / T.COLS) - 8 && base.ch === Math.floor(base.cw * def) && base.rows === 1, '目前的 CARD_H：一列 ' + T.COLS + ' 張，牌寬 ' + base.cw + '、牌高 ' + base.ch + '＝牌寬 × ' + def);
  ok(size(W, H, 6, T.COLS, 1.3).ch === Math.floor(base.cw * 1.3) && size(W, H, 6, T.COLS, 0.5).ch === Math.floor(base.cw * 0.5) && size(W, H, 6, T.COLS, 1.3).cw === base.cw, '調大／調小 CARD_H：牌高跟著變、牌寬不變');
  for (const n of [6, 12, 24, 36, 48]) for (const hr of [0.4, 0.95, 1.3, 2, 5]) { const s = size(W, H, n, T.COLS, hr); ok(s.rows * (s.ch + 8) <= H - 200 && s.ch >= 20 && s.ch <= Math.floor(s.cw * hr), n + ' 張、CARD_H ' + hr + '：所有 ' + s.rows + ' 列放得進畫面（牌高 ' + s.ch + '，共 ' + s.rows * (s.ch + 8) + '／' + (H - 200) + '）'); }
  { let prev = 0; for (const hr of [0.3, 0.6, 0.95, 1.2, 1.6, 3]) { const s = size(W, H, 30, T.COLS, hr); ok(s.ch >= prev, '牌高隨 CARD_H 增加（不會變矮）'); prev = s.ch; } }
  ok(size(W, H, 48, T.COLS, 5).ch === Math.floor((H - 200) / Math.ceil(48 / T.COLS)) - 8 && size(W, H, 48, T.COLS, 5).ch < size(W, H, 6, T.COLS, 5).ch, '牌太多、調太高放不下時，縮到所有列放得進畫面：48 張最高 ' + size(W, H, 48, T.COLS, 5).ch + ' px');
  { const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_flip3cent.js');
    ok(/cardH: CARD_H/.test(src) && /FS\.cardSize\(W, H, n, COLS, cfg\.cardH\)/.test(rd('../../js/flipsum_core.js')), '遊戲真的用 CARD_H 算牌高'); } }
// ── V1.57.0 玩家意見：加上時間限制，給得很寬鬆，第 1 關 1 分鐘 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8');
  ok(Array.isArray(T.TIME_S) && T.TIME_S.length === 2 && T.TIME_S.every(x => x > 0), '時間限制參數 TIME_S 是 [第 1 關, 到頂] 秒：' + T.TIME_S);
  ok(T.timeFor(1) === 60000, '第 1 關給 1 分鐘（' + T.timeFor(1) + ' 毫秒）');
  ok(T.TIME_S[1] >= T.TIME_S[0], '到頂的時間不比第 1 關短（給得很寬鬆）');
  for (let lv = 2; lv <= 60; lv++) ok(T.timeFor(lv) >= T.timeFor(lv - 1), '時間限制隨關卡不減少：第 ' + lv + ' 關 ' + T.timeFor(lv) / 1000 + ' 秒');
  ok(T.timeFor(T.RAMP_LEVELS) === T.TIME_S[1] * 1000 && T.timeFor(99) === T.timeFor(T.RAMP_LEVELS), '到第 ' + T.RAMP_LEVELS + ' 關到頂（' + T.TIME_S[1] + ' 秒），之後維持不變');
  ok(Number.isInteger(T.timeFor(7)) && T.timeFor(7) % 1000 === 0, '時間限制是整數秒');
  const src = rd('../../js/reaction_flip3cent.js'), core = rd('../../js/flipsum_core.js');
  ok(/timeMs: timeFor/.test(src) && /api\.timer\(timeMs, function \(\) \{ if \(!over\) failNow\(true\); \}\)/.test(core) && /timeUp \? '時間到了！/.test(core), '畫面真的啟動時間限制（api.timer）、時間到就失敗');
  ok(/rule: '[^']*每一關有時間限制/.test(src) && !/沒有計時/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), '玩法說明改成有時間限制（不再寫「沒有計時」）'); }

console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
