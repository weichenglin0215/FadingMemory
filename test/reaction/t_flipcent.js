// 翻牌湊百（flipcent，V1.57.0）與共用引擎 js/flipsum_core.js 的兩張一組部分：
//   尾數組（每一組 a＋(100−a)）、牌多時故意讓尾數相同（只看尾數會湊錯）、發牌、相鄰拆開、完美記憶策略、上限、難度曲線、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_flipcent.js'); const T = G.test; const FS = T.FS;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261113), rnd = rng(SEED);

ok(G.id === 'flipcent' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
ok(/100/.test(G.rule) && /尾數/.test(G.rule) && /兩張/.test(G.rule), '玩法說明提到 100、兩張、尾數');
// 張數與難度曲線
T.STAGES.forEach((st, i) => { const from = i === 0 ? 1 : T.STAGES[i - 1].to + 1; ok(T.cardsFor(from) === st.cards && T.cardsFor(Math.min(st.to, from + 2)) === st.cards, '階段 ' + st.cards + ' 張'); ok(st.cards % 2 === 0 && st.cards >= 4, st.cards + ' 張成對（使用者調過階段，最後一列可以不滿 ' + T.COLS + ' 張）'); });
ok(T.slackFor(1) === T.SLACK[0] && T.slackFor(T.RAMP_LEVELS) === T.SLACK[1] && T.slackFor(200) === T.SLACK[1], '寬限 ' + T.SLACK);
ok(T.groupFor(1) === T.GROUP[0] && T.groupFor(T.RAMP_LEVELS) === T.GROUP[1] && T.groupFor(200) === T.GROUP[1], '每個尾數組放幾組牌 ' + T.GROUP + '（第 1 關 → 到頂）');
for (let l = 2; l <= 60; l++) ok(T.groupFor(l) >= T.groupFor(l - 1) && T.cardsFor(l) >= T.cardsFor(l - 1), '單調 ' + l);
ok(T.GROUP[0] === 1, '第 1 關每一組牌的尾數都不一樣（只看尾數就猜得到，入門用）');

// ── 尾數組：每一組都是 a＋(100−a)，尾數 1＋9、2＋8、3＋7、4＋6、5＋5、0＋0 ──
{
  const allV = new Set(); let pairCnt = 0;
  for (let u = 0; u <= 5; u++) {
    const ps = FS.classPairs(u);
    ok(ps.length === FS.CAP[u], '尾數組 ' + u + '：' + ps.length + ' 對（容量 ' + FS.CAP[u] + '）');
    ps.forEach(p => {
      pairCnt++;
      ok(p[0] + p[1] === 100 && p[0] >= 1 && p[1] >= 1 && p[0] <= 99 && p[1] <= 99, '尾數組 ' + u + ' 的 ' + p + ' 加起來是 100、都在 1～99');
      ok(FS.classOf(p[0]) === u && FS.classOf(p[1]) === u, p + ' 兩張都屬於尾數組 ' + u);
      ok((p[0] % 10 + p[1] % 10) % 10 === 0, p + ' 的尾數加起來是 10 的倍數');
      ok(u === 0 || u === 5 ? p[0] % 10 === p[1] % 10 : p[0] % 10 === u && p[1] % 10 === 10 - u, p + ' 的尾數');
      [p[0], p[1]].forEach(v => allV.add(v));
    });
  }
  ok(pairCnt === 10 * 4 + 5 + 5, '六個尾數組共 ' + pairCnt + ' 對');
  ok([...allV].every(v => v >= 1 && v <= 99) && allV.size === 99, '所有 1～99 的數字恰好各屬於一個尾數組（共 ' + allV.size + ' 個數字）');
}
// ── 發牌：P 組、尾數組的分配 ──
for (let P = 1; P <= 24; P++) for (const g of [1, 2, 3, 4, 8, 12]) for (let t = 0; t < 8; t++) {
  const d = FS.makePairDeck(P, g, rnd), c = {}; d.deck.forEach(v => c[v] = (c[v] || 0) + 1);
  ok(d.pairs.length === P && d.deck.length === 2 * P, 'P=' + P + ' g=' + g + '：' + P + ' 組');
  ok(d.pairs.every(p => p[0] + p[1] === 100), 'P=' + P + ' g=' + g + '：每一組加起來是 100');
  ok(Object.keys(c).every(v => c[v] === 1 || (Number(v) === 50 && c[v] === 2)), 'P=' + P + ' g=' + g + '：每個數字只出現一次（50＋50 才會有兩張 50）');
  const byClass = {}; d.pairs.forEach(p => { const u = FS.classOf(p[0]); byClass[u] = (byClass[u] || 0) + 1; });
  ok(Object.keys(byClass).every(u => byClass[u] <= FS.CAP[u]), 'P=' + P + ' g=' + g + '：沒有超過尾數組的容量');
  const counts = Object.values(byClass); ok(Math.max(...counts) - Math.min(...counts) <= 1, 'P=' + P + ' g=' + g + '：各尾數組的組數平均分配（' + counts + '）');
  ok(Object.keys(byClass).length === d.classes.length && d.classes.length <= 6, 'P=' + P + ' g=' + g + '：用到 ' + d.classes.length + ' 個尾數組');
  if (g === 1 && P <= 6) ok(d.classes.length === P, 'P=' + P + ' g=1：每一組牌的尾數都不一樣（' + d.classes.length + ' 個尾數組）');
  if (P >= 8 && g >= 4) ok(d.classes.length <= Math.max(1, Math.ceil(P / g)) + 1, 'P=' + P + ' g=' + g + '：集中在 ' + d.classes.length + ' 個尾數組');
}
// ── 牌多的時候，只看尾數會湊錯（尾數合格的別張牌越來越多；真正的搭檔永遠只有 1 張）──
{
  const mates = (lv) => { let s = 0; for (let i = 0; i < 100; i++) s += FS.tailMates(T.makePuzzle(lv, rnd).deck); return s / 100; };
  const m1 = mates(1), m8 = mates(8), m15 = mates(15), m30 = mates(30);
  console.log('尾數合格的別張牌（只看尾數會被騙的程度；搭檔只有 1 張）：第 1 關 ' + m1.toFixed(2) + '、第 8 關 ' + m8.toFixed(2) + '、第 15 關 ' + m15.toFixed(2) + '、第 30 關 ' + m30.toFixed(2));
  ok(Math.abs(m1 - 1) < 1e-9, '第 1 關：只有真正的搭檔尾數合格（1 張），只看尾數就猜得到');
  ok(m8 > m1 + 1.5 && m15 >= m8 && m30 > m15 + 1.5, '牌越多、越後面，尾數合格的別張牌越多（只看尾數會湊錯）');
  ok(m30 >= 4, '第 30 關：平均每張牌有 ' + m30.toFixed(1) + ' 張尾數合格（只有 1 張是真的搭檔）');
  // 例：43、63、57、37 同時出現的情形（同一個尾數組裡十位數不同）
  const tk = FS.makePairDeck(8, 8, rnd), t3 = tk.deck.filter(v => v % 10 === 3 || v % 10 === 7);
  ok(tk.classes.length === 1 || tk.deck.every(v => tk.classes.indexOf(FS.classOf(v)) >= 0), '同一個尾數組的牌：所有牌的尾數都是同一對');
  ok(t3.length === 0 || t3.length === tk.deck.length || tk.classes.indexOf(3) < 0, '8 組牌、每個尾數組放 8 組：全部尾數一樣');
  ok(FS.tailMates([43, 57, 63, 37]) === 2 && FS.tailMates([43, 57]) === 1, 'tailMates：43、57、63、37 每張有 2 張尾數合格（只有 1 張是搭檔）');
}
// ── 發牌（含洗牌與拆開相鄰）：一樣每張牌有搭檔 ──
for (const n of [6, 12, 24, 48]) for (let i = 0; i < 40; i++) {
  const lv = 1 + (i * 3) % 40, d = T.deal(n, lv, rnd), c = {}; d.forEach(v => c[v] = (c[v] || 0) + 1);
  ok(d.length === n && d.every(v => v >= 1 && v <= 99), n + ' 張都是 1～99');
  ok(d.every(v => c[100 - v] === c[v] || (v === 50 && c[50] % 2 === 0)), n + ' 張第 ' + lv + ' 關：每個數字都有搭檔（100 減它），可以全部消完');
  ok(FS.validGroups(d, 2).length === n / 2, n + ' 張：湊成 100 的兩張剛好 ' + n / 2 + ' 組（沒有碰巧多出來的）：' + FS.validGroups(d, 2).length);
}
// ── 完美記憶策略：人工算幾個小例子 ──
ok(FS.perfectTries([43, 57], 2) === 1, '2 張 43、57：翻 1 次');
ok(FS.perfectTries([43, 57, 20, 80], 2) === 2, '43,57,20,80：左邊兩兩成對，翻 2 次');
ok(FS.perfectTries([43, 20, 57, 80], 2) === 3, '43,20,57,80：翻 43,20（不是）→ 翻 57（記得 43 在哪）消掉 → 再翻 20,80：3 次');
for (const n of [6, 12, 24, 48]) for (let i = 0; i < 80; i++) {
  const d = T.deal(n, 1 + i % 30, rnd), pf = T.perfectFlips(d);
  ok(pf >= n / 2 && pf <= n * 1.5, n + ' 張的完美翻牌次數 ' + pf + ' 在合理範圍');
  ok(T.limitFor(1, d) === pf + T.slackFor(1) && T.limitFor(30, d) === pf + T.slackFor(30), '上限＝完美＋寬限');
}
// 出題
for (const lv of [1, 3, 5, 6, 15, 16, 30, 60]) { const p = T.makePuzzle(lv, rnd); ok(p.n === T.cardsFor(lv) && p.deck.length === p.n && p.limit === p.perfect + T.slackFor(lv) && p.group === T.groupFor(lv), '第 ' + lv + ' 關'); }
ok(T.SHOW_MS >= 1000 && T.rating(30) !== T.rating(1) && T.MAX_LEVEL >= 30, '常數與評語');

// ── 相鄰拆開（V1.47 翻牌湊十的做法，這款也一樣）──
ok(T.KEEP_ADJ_P >= 0 && T.KEEP_ADJ_P <= 1, '保留相鄰的機率參數 KEEP_ADJ_P：' + T.KEEP_ADJ_P);
ok(FS.neighborsOf(0, 24, 6).sort((a, b) => a - b).join() === '1,6' && FS.neighborsOf(7, 24, 6).sort((a, b) => a - b).join() === '1,6,8,13', '鄰居＝左右上下');
ok(FS.adjacentPairs([43, 57, 5, 5, 2, 3], 6).length === 1 && FS.adjacentPairs([43, 20, 57, 80, 2, 3], 6).length === 0, 'adjacentPairs：左右相鄰、加起來是 100 的才算（43,57）');
ok(FS.adjacentPairs([43, 1, 2, 3, 4, 5, 57, 7, 8, 9, 10, 11], 6).map(p => p.join('-')).join() === '0-6', 'adjacentPairs：上下相鄰也算');
for (const n of [12, 24, 48]) for (let i = 0; i < 40; i++) {
  const base = kitShuffle(FS.makePairDeck(n / 2, 1 + i % 8, rnd).deck), s0 = base.slice(), s1 = FS.spread(base, T.COLS, rng(i + 1), 0.3), s2 = FS.spread(base, T.COLS, rng(i + 1), 0.3);
  ok(base.join() === s0.join() && s1.slice().sort((a, b) => a - b).join() === base.slice().sort((a, b) => a - b).join() && s1.join() === s2.join(), n + ' 張：spread 不改原陣列、牌的內容不變、同一個亂數結果一樣');
  ok(FS.adjacentPairs(s1, T.COLS).length <= FS.adjacentPairs(base, T.COLS).length, 'spread 不會讓相鄰變多');
}
function kitShuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
{ let raw = 0, dl = 0; for (let t = 0; t < 200; t++) { raw += FS.adjacentPairs(kitShuffle(FS.makePairDeck(12, 2, rnd).deck), T.COLS).length; dl += FS.adjacentPairs(T.deal(24, 8, rnd), T.COLS).length; } ok(dl < raw * 0.7, 'deal(24)：相鄰湊 100 平均 ' + (dl / 200).toFixed(2) + ' 組，完全隨機是 ' + (raw / 200).toFixed(2) + ' 組'); }

// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), boot = rd('../../js/boot.js'), menu = rd('../../js/menu.js'), core = rd('../../js/flipsum_core.js');
  ok(boot.indexOf("'js/flipsum_core.js'") > 0 && boot.indexOf("'js/flipsum_core.js'") < boot.indexOf("'js/reaction_flipcent.js'") && boot.indexOf("'js/reaction_flipcent.js'") > 0 && boot.indexOf("'css/games/reaction_flipcent.css'") > 0, 'boot.js 有載入共用引擎（在遊戲之前）、遊戲與 css');
  ok(/id: 'flipcent', name: '翻牌湊百', cat: 'memory'/.test(menu), '選單有翻牌湊百（記憶類）');
  ok(/FS\.makePairDeck/.test(rd('../../js/reaction_flipcent.js')) && /FS\.mount/.test(rd('../../js/reaction_flipcent.js')) && /Reaction\.flipSum\s*=\s*\{\}/.test(core), '遊戲用共用引擎出題與畫面'); }

// ── 牌（答案格子）的高度參數 CARD_H（預設 0.95＝牌寬的 0.95 倍；翻牌湊百）──
{ const size = T.FS.cardSize, def = 0.95, W = 472, H = 700, base = size(W, H, 6, T.COLS, def);
  ok(T.CARD_H > 0.3 && T.CARD_H < 3, '牌高參數 CARD_H 是牌寬的幾倍（預設 0.95；使用者可以調，目前 ' + T.CARD_H + '）');
  ok(base.cw === Math.floor(W * 0.96 / T.COLS) - 8 && base.ch === Math.floor(base.cw * def) && base.rows === 1, '預設：6 張一列，牌寬 ' + base.cw + '、牌高 ' + base.ch + '＝牌寬 × 0.95');
  ok(size(W, H, 6, T.COLS, 1.3).ch === Math.floor(base.cw * 1.3) && size(W, H, 6, T.COLS, 0.5).ch === Math.floor(base.cw * 0.5) && size(W, H, 6, T.COLS, 1.3).cw === base.cw, '調大／調小 CARD_H：牌高跟著變、牌寬不變');
  for (const n of [6, 12, 24, 36, 48]) for (const hr of [0.4, 0.95, 1.3, 2, 5]) { const s = size(W, H, n, T.COLS, hr); ok(s.rows * (s.ch + 8) <= H - 200 && s.ch >= 20 && s.ch <= Math.floor(s.cw * hr), n + ' 張、CARD_H ' + hr + '：所有 ' + s.rows + ' 列放得進畫面（牌高 ' + s.ch + '，共 ' + s.rows * (s.ch + 8) + '／' + (H - 200) + '）'); }
  { let prev = 0; for (const hr of [0.3, 0.6, 0.95, 1.2, 1.6, 3]) { const s = size(W, H, 30, T.COLS, hr); ok(s.ch >= prev, '牌高隨 CARD_H 增加（不會變矮）'); prev = s.ch; } }
  ok(size(W, H, 48, T.COLS, 5).ch === Math.floor((H - 200) / 8) - 8 && size(W, H, 48, T.COLS, 5).ch < size(W, H, 6, T.COLS, 5).ch, '牌太多、調太高放不下時，縮到所有列放得進畫面：48 張最高 ' + size(W, H, 48, T.COLS, 5).ch + ' px');
  { const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_flipcent.js');
    ok(/cardH: CARD_H/.test(src) && /FS\.cardSize\(W, H, n, COLS, cfg\.cardH\)/.test(rd('../../js/flipsum_core.js')), '遊戲真的用 CARD_H 算牌高'); } }
// ── V1.57.0 玩家意見：加上時間限制，給得很寬鬆，第 1 關 1 分鐘 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8');
  ok(Array.isArray(T.TIME_S) && T.TIME_S.length === 2 && T.TIME_S.every(x => x > 0), '時間限制參數 TIME_S 是 [第 1 關, 到頂] 秒：' + T.TIME_S);
  ok(T.timeFor(1) === 60000, '第 1 關給 1 分鐘（' + T.timeFor(1) + ' 毫秒）');
  ok(T.TIME_S[1] >= T.TIME_S[0], '到頂的時間不比第 1 關短（給得很寬鬆）');
  for (let lv = 2; lv <= 60; lv++) ok(T.timeFor(lv) >= T.timeFor(lv - 1), '時間限制隨關卡不減少：第 ' + lv + ' 關 ' + T.timeFor(lv) / 1000 + ' 秒');
  ok(T.timeFor(T.RAMP_LEVELS) === T.TIME_S[1] * 1000 && T.timeFor(99) === T.timeFor(T.RAMP_LEVELS), '到第 ' + T.RAMP_LEVELS + ' 關到頂（' + T.TIME_S[1] + ' 秒），之後維持不變');
  ok(Number.isInteger(T.timeFor(7)) && T.timeFor(7) % 1000 === 0, '時間限制是整數秒');
  const src = rd('../../js/reaction_flipcent.js'), core = rd('../../js/flipsum_core.js');
  ok(/timeMs: timeFor/.test(src) && /api\.timer\(timeMs, function \(\) \{ if \(!over\) failNow\(true\); \}\)/.test(core) && /timeUp \? '時間到了！/.test(core), '畫面真的啟動時間限制（api.timer）、時間到就失敗');
  ok(/rule: '[^']*每一關有時間限制/.test(src) && !/沒有計時/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), '玩法說明改成有時間限制（不再寫「沒有計時」）'); }

console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
