// 心臟病（cardslap，企劃 353）的純函式檢查：數數（順著／倒著）、發牌（要拍的比例、連續不拍的上限、長得像的牌連續出現）、翻牌間隔隨拍對次數線性變快
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_cardslap.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261129), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（輸入是已經拍對幾次）──
ok(T.intervalFor(0) === T.INTERVAL[0] && T.intervalFor(T.RAMP_HITS) === T.INTERVAL[1] && T.intervalFor(999) === T.INTERVAL[1], '翻牌間隔 ' + T.INTERVAL);
ok(near(T.confuseP(0), T.CONFUSE_P[0]) && near(T.confuseP(T.RAMP_HITS), T.CONFUSE_P[1]), '長得像的機率 ' + T.CONFUSE_P);
for (let k = 1; k <= 80; k++) ok(T.intervalFor(k) <= T.intervalFor(k - 1) && T.confuseP(k) >= T.confuseP(k - 1), '單調 ' + k);
{ const d = []; for (let k = 1; k <= T.RAMP_HITS; k++) d.push(T.intervalFor(k - 1) - T.intervalFor(k)); ok(Math.max(...d) - Math.min(...d) <= 1, '間隔線性縮短：每次 −' + Math.min(...d) + '～−' + Math.max(...d) + ' 毫秒'); }
// V1.55.0 玩家意見：取消中途改成倒著數（K、Q、J…）的變形玩法，永遠維持數到 13
ok(T.dirFor === undefined && T.REVERSE_AT === undefined, '已取消倒著數：沒有 dirFor、REVERSE_AT');

// ── 數數 ──
ok(T.RANKS.join(',') === 'A,2,3,4,5,6,7,8,9,10,J,Q,K' && T.rankName(1) === 'A' && T.rankName(11) === 'J' && T.rankName(13) === 'K', '點數名稱');
{ const f = []; for (let k = 1; k <= 30; k++) f.push(T.countFor(k)); ok(f.slice(0, 13).join() === '1,2,3,4,5,6,7,8,9,10,11,12,13' && f[13] === 1 && f[26] === 1 && f[29] === 4, '順著數：A、2、…、K、A、…：' + f.join()); }
for (let k = 1; k <= 400; k++) { const c = T.countFor(k); ok(c >= 1 && c <= 13 && c === ((k - 1) % 13) + 1, '永遠數到 13 再回到 A，範圍 1～13：' + k); }
ok(T.countFor(13) === 13 && T.countFor(14) === 1 && T.countFor(1000) === ((999) % 13) + 1, '數到 K（13）之後回到 A（1）');

// ── 發牌 ──
{ const N = 200000; let st = { k: 1, gap: 0, prev: 0 }, matches = 0, maxGap = 0, gap = 0, confuse = 0, nonMatch = 0, follow = 0; const suits = new Set(), ranks = new Set();
  for (let i = 0; i < N; i++) {
    const hits = i % 60, c = T.nextCard(st, hits, rnd);
    ok(c.rank >= 1 && c.rank <= 13 && T.SUITS.includes(c.suit) && c.count === T.countFor(st.k) && c.isMatch === (c.rank === c.count), '這張牌的點數、花色、該數到的數、是否要拍');
    suits.add(c.suit); ranks.add(c.rank);
    if (c.isMatch) { matches++; gap = 0; } else { gap++; maxGap = Math.max(maxGap, gap); nonMatch++; if (T.LOOK[st.prev] && T.LOOK[st.prev].includes(c.rank)) follow++; }
    st = { k: st.k + 1, gap: c.isMatch ? 0 : st.gap + 1, prev: c.rank };
  }
  console.log('要拍的牌佔 ' + (100 * matches / N).toFixed(1) + '%；連續不拍最長 ' + maxGap + '；不用拍的牌中，跟上一張長得像的 ' + (100 * follow / nonMatch).toFixed(1) + '%');
  ok(maxGap <= T.MAX_GAP, '連續不用拍最多 ' + T.MAX_GAP + ' 張：' + maxGap);
  ok(matches / N >= T.MATCH_P && matches / N < T.MATCH_P + 0.1, '要拍的牌比例略高於 ' + T.MATCH_P + '（含保證間隔）：' + (100 * matches / N).toFixed(1) + '%');
  ok(suits.size === 4 && ranks.size === 13, '四種花色、十三種點數都會出現');
  ok(follow / nonMatch > 0.12, '不用拍的牌常常跟上一張長得像：' + (100 * follow / nonMatch).toFixed(1) + '%'); }
// 越後面越常長得像
{ function followRate(h0) { let st = { k: 1, gap: 0, prev: 0 }, f = 0, n = 0; for (let i = 0; i < 60000; i++) { const c = T.nextCard(st, h0, rnd); if (!c.isMatch) { n++; if (T.LOOK[st.prev] && T.LOOK[st.prev].includes(c.rank)) f++; } st = { k: st.k + 1, gap: c.isMatch ? 0 : st.gap + 1, prev: c.rank }; } return f / n; }
  const a = followRate(0), b = followRate(40); ok(b > a + 0.1, '長得像的牌越後面越常連著出現：' + (100 * a).toFixed(0) + '% → ' + (100 * b).toFixed(0) + '%'); }
// 「6 後面接 9」：上一張是 6，不用拍的下一張有機會是 9
{ let nine = 0, n = 0; for (let i = 0; i < 20000; i++) { const st = { k: 2, gap: 0, prev: 6 }; const c = T.nextCard(st, 40, rnd); if (!c.isMatch) { n++; if (c.rank === 9) nine++; } } ok(nine / n > 0.4, '6 後面接 9：' + (100 * nine / n).toFixed(0) + '%'); }
// 該拍的牌：點數等於該數到的數；不要拍的牌點數不等於
{ const st = { k: 5, gap: 99, prev: 3 }; const c = T.nextCard(st, 0, rnd); ok(c.isMatch && c.rank === 5, '連續不拍太久之後，這張一定要拍：' + JSON.stringify(c)); }
// 模擬遊戲裡的流程：不管拍對幾次，都是 A、2、…、K 一直循環數下去（不會改成倒著數）
{ let hits = 0, st = { k: 1, gap: 0, prev: 0 }; const seq = [];
  for (let i = 0; i < 600; i++) { const c = T.nextCard(st, hits, rnd); seq.push(c.count); st = { k: st.k + 1, gap: c.isMatch ? 0 : st.gap + 1, prev: c.rank }; if (c.isMatch) hits++; }
  ok(hits > 40 && seq.every((x, i) => x === (i % 13) + 1), '拍對 ' + hits + ' 次之後數數仍然永遠是 1～13 循環'); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_cardslap.js'), css = rd('../../css/games/reaction_cardslap.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3200/.test(src) && /cardslap-card--bad/.test(src) && /cardslap-card--miss/.test(src) && /scoreOf/.test(src), '失敗：牌與你該數到的並排、停格 2 秒以上；成績用 scoreOf');
  ok(/\.cardslap-card--ok \{[^}]*var\(--c-ok/.test(css) && /\.cardslap-card--bad \{[^}]*var\(--c-bad/.test(css) && /\.cardslap-table \{[^}]*var\(--csl-felt\)/.test(css), '綠色、紅色、牌桌用 CSS 變數');
  ok(boot.indexOf("'js/reaction_cardslap.js'") > 0 && /心裡/.test(G.rule), 'boot.js 有載入、玩法說明提到心裡數');
  ok(!/倒著數/.test(G.rule.replace('永遠', '')) && /永遠是 A/.test(G.rule) && !/REVERSE_AT|dir: -1/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), '玩法說明不再有倒著數、程式裡沒有倒著數的分支');
  ok(/max: 300/.test(src), '成績上限 300'); }
ok(T.rating(3) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(40) && T.rating(40) !== T.rating(60), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
