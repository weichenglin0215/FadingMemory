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
ok(T.dirFor(T.REVERSE_AT - 1) === 1 && T.dirFor(T.REVERSE_AT) === -1 && T.dirFor(100) === -1, '拍對 ' + T.REVERSE_AT + ' 次後倒著數');

// ── 數數 ──
ok(T.RANKS.join(',') === 'A,2,3,4,5,6,7,8,9,10,J,Q,K' && T.rankName(1) === 'A' && T.rankName(11) === 'J' && T.rankName(13) === 'K', '點數名稱');
{ const f = []; for (let k = 1; k <= 30; k++) f.push(T.countFor(k, 1)); ok(f.slice(0, 13).join() === '1,2,3,4,5,6,7,8,9,10,11,12,13' && f[13] === 1 && f[26] === 1 && f[29] === 4, '順著數：A、2、…、K、A、…：' + f.join()); }
{ const b = []; for (let k = 1; k <= 30; k++) b.push(T.countFor(k, -1)); ok(b.slice(0, 13).join() === '13,12,11,10,9,8,7,6,5,4,3,2,1' && b[13] === 13 && b[26] === 13, '倒著數：K、Q、J、10、…、A、K、…：' + b.join()); }
for (let k = 1; k <= 200; k++) { const c = T.countFor(k, 1), d = T.countFor(k, -1); ok(c >= 1 && c <= 13 && d >= 1 && d <= 13, '範圍 1～13'); }

// ── 發牌 ──
{ const N = 200000; let st = { k: 1, dir: 1, gap: 0, prev: 0 }, matches = 0, maxGap = 0, gap = 0, confuse = 0, nonMatch = 0, follow = 0; const suits = new Set(), ranks = new Set();
  for (let i = 0; i < N; i++) {
    const hits = i % 60, c = T.nextCard(st, hits, rnd);
    ok(c.rank >= 1 && c.rank <= 13 && T.SUITS.includes(c.suit) && c.count === T.countFor(st.k, st.dir) && c.isMatch === (c.rank === c.count), '這張牌的點數、花色、該數到的數、是否要拍');
    suits.add(c.suit); ranks.add(c.rank);
    if (c.isMatch) { matches++; gap = 0; } else { gap++; maxGap = Math.max(maxGap, gap); nonMatch++; if (T.LOOK[st.prev] && T.LOOK[st.prev].includes(c.rank)) follow++; }
    st = { k: st.k + 1, dir: st.dir, gap: c.isMatch ? 0 : st.gap + 1, prev: c.rank };
  }
  console.log('要拍的牌佔 ' + (100 * matches / N).toFixed(1) + '%；連續不拍最長 ' + maxGap + '；不用拍的牌中，跟上一張長得像的 ' + (100 * follow / nonMatch).toFixed(1) + '%');
  ok(maxGap <= T.MAX_GAP, '連續不用拍最多 ' + T.MAX_GAP + ' 張：' + maxGap);
  ok(matches / N >= T.MATCH_P && matches / N < T.MATCH_P + 0.1, '要拍的牌比例略高於 ' + T.MATCH_P + '（含保證間隔）：' + (100 * matches / N).toFixed(1) + '%');
  ok(suits.size === 4 && ranks.size === 13, '四種花色、十三種點數都會出現');
  ok(follow / nonMatch > 0.12, '不用拍的牌常常跟上一張長得像：' + (100 * follow / nonMatch).toFixed(1) + '%'); }
// 越後面越常長得像
{ function followRate(h0) { let st = { k: 1, dir: 1, gap: 0, prev: 0 }, f = 0, n = 0; for (let i = 0; i < 60000; i++) { const c = T.nextCard(st, h0, rnd); if (!c.isMatch) { n++; if (T.LOOK[st.prev] && T.LOOK[st.prev].includes(c.rank)) f++; } st = { k: st.k + 1, dir: 1, gap: c.isMatch ? 0 : st.gap + 1, prev: c.rank }; } return f / n; }
  const a = followRate(0), b = followRate(40); ok(b > a + 0.1, '長得像的牌越後面越常連著出現：' + (100 * a).toFixed(0) + '% → ' + (100 * b).toFixed(0) + '%'); }
// 「6 後面接 9」：上一張是 6，不用拍的下一張有機會是 9
{ let nine = 0, n = 0; for (let i = 0; i < 20000; i++) { const st = { k: 2, dir: 1, gap: 0, prev: 6 }; const c = T.nextCard(st, 40, rnd); if (!c.isMatch) { n++; if (c.rank === 9) nine++; } } ok(nine / n > 0.4, '6 後面接 9：' + (100 * nine / n).toFixed(0) + '%'); }
// 該拍的牌：點數等於該數到的數；不要拍的牌點數不等於
{ const st = { k: 5, dir: 1, gap: 99, prev: 3 }; const c = T.nextCard(st, 0, rnd); ok(c.isMatch && c.rank === 5, '連續不拍太久之後，這張一定要拍：' + JSON.stringify(c)); }
{ const st = { k: 5, dir: -1, gap: 99, prev: 3 }; const c = T.nextCard(st, 0, rnd); ok(c.isMatch && c.rank === T.countFor(5, -1) && c.rank === 9, '倒著數第 5 張要數到 9：' + JSON.stringify(c)); }
// 模擬遊戲裡的流程：拍對 REVERSE_AT 次之後換成倒著數，重新從 K 開始
{ let hits = 0, st = { k: 1, dir: 1, gap: 0, prev: 0 }; const seq = [];
  for (let i = 0; i < 400; i++) { if (hits === T.REVERSE_AT && st.dir > 0) st = { k: 1, dir: -1, gap: st.gap, prev: st.prev }; const c = T.nextCard(st, hits, rnd); seq.push({ count: c.count, dir: st.dir }); st = { k: st.k + 1, dir: st.dir, gap: c.isMatch ? 0 : st.gap + 1, prev: c.rank }; if (c.isMatch) hits++; }
  const sw = seq.findIndex(x => x.dir < 0); ok(sw > 0 && seq[sw].count === 13 && seq[sw + 1].count === 12 && seq.slice(0, sw).every((x, i) => x.count === (i % 13) + 1), '換成倒著數：從 K 開始（第 ' + sw + ' 張換）'); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_cardslap.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3200/.test(src) && /csl-card--bad/.test(src) && /csl-card--miss/.test(src) && /scoreOf/.test(src), '失敗：牌與你該數到的並排、停格 2 秒以上；成績用 scoreOf');
  ok(/\.csl-card--ok \{[^}]*var\(--c-ok/.test(css) && /\.csl-card--bad \{[^}]*var\(--c-bad/.test(css) && /\.csl-table \{[^}]*var\(--csl-felt\)/.test(css), '綠色、紅色、牌桌用 CSS 變數');
  ok(boot.indexOf("'js/reaction_cardslap.js'") > 0 && /心裡/.test(G.rule), 'boot.js 有載入、玩法說明提到心裡數');
  ok(/max: 300/.test(src), '成績上限 300'); }
ok(T.rating(3) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(40) && T.rating(40) !== T.rating(60), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
