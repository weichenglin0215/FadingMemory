// 時間連連看（timepair，企劃 406）的純函式檢查：指針角度、24 小時制配對規則（獨立算法）、指針互換的搭檔、出題（配對唯一、誘餌 A／B、時間集中）、難度線性、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_timepair.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261219), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（線性）──
ok(T.pairsFor(1) === T.PAIRS[0] && T.pairsFor(T.RAMP_LEVELS) === T.PAIRS[1] && T.pairsFor(99) === T.PAIRS[1], '配對數 ' + T.PAIRS);
ok(T.trapAFor(1) === 0 && T.trapAFor(T.RAMP_LEVELS) === T.TRAP_A[1] && T.trapBFor(1) === 0 && T.trapBFor(T.RAMP_LEVELS) === T.TRAP_B[1], '誘餌組數 A 0→' + T.TRAP_A[1] + '、B 0→' + T.TRAP_B[1]);
ok(near(T.spreadFor(1), T.SPREAD_H[0]) && near(T.spreadFor(T.RAMP_LEVELS), T.SPREAD_H[1]) && T.limitFor(1) === 30 && T.limitFor(T.RAMP_LEVELS) === 60, '散布範圍／限時 30 → 60 秒（使用者企劃）');
for (let n = 2; n <= T.RAMP_LEVELS + 2; n++) ok(T.pairsFor(n) >= T.pairsFor(n - 1) && T.trapAFor(n) >= T.trapAFor(n - 1) && T.trapBFor(n) >= T.trapBFor(n - 1) && T.spreadFor(n) <= T.spreadFor(n - 1) && T.limitFor(n) >= T.limitFor(n - 1), '單調 ' + n);

// ── 小工具 ──
ok(T.h12of(0) === 12 && T.h12of(12) === 12 && T.h12of(15) === 3 && T.h12of(5) === 5 && T.h12of(23) === 11 && T.h12of(24) === 12, 'h12of');
ok(T.digitalText(15, 15) === '15:15' && T.digitalText(5, 5) === '05:05' && T.digitalText(0, 30) === '00:30' && T.analogText(3, 15) === '3:15' && T.analogText(12, 0) === '12:00', '文字');
ok(near(T.analogAngles(3, 15).minute, 90) && near(T.analogAngles(3, 15).hour, 97.5) && near(T.analogAngles(12, 0).hour, 0) && near(T.analogAngles(12, 0).minute, 0) && near(T.analogAngles(9, 45).hour, 292.5) && near(T.analogAngles(6, 30).hour, 195) && near(T.analogAngles(12, 30).hour, 15), '指針角度（3:15 時針 97.5°、分針 90°）');
// 時針每分鐘走 0.5°、分針 6°；一整圈
for (let h = 1; h <= 12; h++) for (let m = 0; m < 60; m += 5) { const a = T.analogAngles(h, m); ok(near(a.hour, ((h % 12) * 60 + m) * 0.5, 1e-9) && near(a.minute, m * 6, 1e-9), '角度 ' + h + ':' + m); }

// ── 配對規則：獨立算法（都換算成「從午夜起幾分鐘」，指針鐘的分鐘數對 720 取餘數）──
{ let cnt = 0; for (let h12 = 1; h12 <= 12; h12++) for (let m = 0; m < 60; m += 5) for (let h24 = 0; h24 < 24; h24++) for (let m2 = 0; m2 < 60; m2 += 5) { const a = { h12, m }, d = { h24, m: m2 }, exp = ((h12 % 12) * 60 + m) === ((h24 * 60 + m2) % 720); ok(T.isMatch(a, d) === exp, 'isMatch ' + T.analogText(h12, m) + ' vs ' + T.digitalText(h24, m2)); if (exp) cnt++; } ok(cnt === 144 * 2, '每個指針鐘剛好和 2 個電子鐘（上午、下午）相符：總共 ' + cnt); }
ok(T.isMatch({ h12: 3, m: 15 }, { h24: 15, m: 15 }) && !T.isMatch({ h12: 5, m: 15 }, { h24: 15, m: 15 }) && T.isMatch({ h12: 5, m: 15 }, { h24: 5, m: 15 }) && T.isMatch({ h12: 12, m: 0 }, { h24: 0, m: 0 }) && T.isMatch({ h12: 12, m: 0 }, { h24: 12, m: 0 }), '使用者企劃的例子：15:15 配 3:15、不配 5:15；12 點整');

// ── 指針互換的搭檔 ──
{ const p = T.swapPartner(9, 15); ok(p.h12 === 3 && p.m === 45, '9:15 ↔ 3:45'); const q = T.swapPartner(3, 45); ok(q.h12 === 9 && q.m === 15, '3:45 ↔ 9:15（使用者企劃的例子）');
  ok(T.swapPartner(12, 0) === null && T.swapPartner(6, 30) === null && T.swapPartner(3, 17) === null && T.swapPartner(1, 5) === null && T.swapPartner(2, 5).h12 === 1 && T.swapPartner(2, 5).m === 10, '互換後還是同一個時間（12:00、6:30、1:05）／分鐘不是 5 的倍數：沒有搭檔；2:05 ↔ 1:10'); }
{ let cnt = 0; for (let h = 1; h <= 12; h++) for (let m = 0; m < 60; m += 5) { const p = T.swapPartner(h, m); if (!p) continue; cnt++; const back = T.swapPartner(p.h12, p.m); ok(back && back.h12 === h && back.m === m, '互換兩次回到原來（' + h + ':' + m + '）'); ok(near(T.analogAngles(p.h12, p.m).hour - (p.h12 % 12) * 30, p.m / 60 * 30, 1e-9), '搭檔的時針偏移角'); ok(near(T.analogAngles(h, m).minute, (p.h12 % 12) * 30, 1e-9) && near(T.analogAngles(p.h12, p.m).minute, (h % 12) * 30 * 1, 1e-9) === (p.m === (h % 12) * 5), '分針角度＝搭檔時針的整點角度'); } ok(cnt > 100, '大部分時間都有互換搭檔：' + cnt); }

// ── 出題：全部關卡掃一遍 ──
const ST = { n: 0, A: 0, B: 0, maxSpan: 0, bTraps: 0, aTraps: 0, minTrapOK: 0 };
const circ = (a, b) => { const d = Math.abs(a - b) % 720; return Math.min(d, 720 - d); };
for (let lv = 1; lv <= 40; lv++) for (let rep = 0; rep < 60; rep++) {
  const q = T.makeLevel(lv, rnd); ST.n++;
  const n = T.pairsFor(lv);
  ok(q.n === n && q.pairs.length === n && q.items.length === 2 * n && q.limit === T.limitFor(lv), '配對數 ' + n);
  ok(new Set(q.pairs.map(p => p.h12 + ':' + p.m)).size === n && new Set(q.pairs.map(p => T.digitalText(p.h24, p.m))).size === n, '所有指針鐘時間不重複、電子鐘文字不重複');
  ok(q.pairs.every(p => p.m % 5 === 0 && p.h12 >= 1 && p.h12 <= 12 && p.h24 >= 0 && p.h24 <= 23 && p.h24 % 12 === p.h12 % 12), '分鐘是 5 的倍數、電子鐘的時對得上指針鐘');
  ok(q.items.every((it, i) => it.id === i) && q.items.filter(it => it.kind === 'a').length === n && q.items.filter(it => it.kind === 'd').length === n, '時鐘一半指針鐘一半電子鐘、id 依序');
  // 每個指針鐘剛好有一個電子鐘配得上（其他的電子鐘都配不上）
  q.items.filter(it => it.kind === 'a').forEach(a => { const ms = q.items.filter(it => it.kind === 'd' && T.isMatch(a, it)); ok(ms.length === 1 && ms[0].pair === a.pair, '指針鐘 ' + T.analogText(a.h12, a.m) + ' 只有一個電子鐘配得上'); });
  // 誘餌：A（指針互換）的兩對互為搭檔；B（24 小時制）的兩對同分鐘、相差 2 小時，前一個是下午（h24 ≥ 12）、後一個是上午
  const A = q.pairs.filter(p => p.trap === 'A'), B = q.pairs.filter(p => p.trap === 'B');
  ok(A.length % 2 === 0 && B.length % 2 === 0, '誘餌兩對一組'); ST.aTraps += A.length; ST.bTraps += B.length;
  ok(A.length <= 2 * T.trapAFor(lv) && B.length <= 2 * T.trapBFor(lv) && A.length + B.length <= n, '誘餌的對數不超過規定');
  A.forEach(p => { const mate = A.find(o => { const sp = T.swapPartner(p.h12, p.m); return o !== p && sp && o.h12 === sp.h12 && o.m === sp.m; }); ok(!!mate, 'A 誘餌 ' + T.analogText(p.h12, p.m) + ' 有互換的搭檔也在這一關裡'); });
  B.forEach(p => { const mate = B.find(o => o !== p && o.m === p.m && ((o.h12 - p.h12 + 12) % 12 === 2 || (p.h12 - o.h12 + 12) % 12 === 2)); ok(!!mate, 'B 誘餌 ' + T.analogText(p.h12, p.m) + ' 有相差 2 小時的搭檔'); });
  for (let k = 0; k + 1 < B.length; k += 2) { const x = B[k], y = B[k + 1]; ok((x.h24 >= 12) !== (y.h24 >= 12), 'B 組的兩個一個下午一個上午：' + digitalText(x) + '/' + digitalText(y)); }
  function digitalText(p) { return T.digitalText(p.h24, p.m); }
  // 其餘時間集中在中心附近：算「沒有誘餌」的那些時間的最大間距（循環）
  const plain = q.pairs.filter(p => !p.trap).map(p => T.minutesOf(p.h12, p.m)); let span = 0; for (let i = 0; i < plain.length; i++) for (let j = i + 1; j < plain.length; j++) span = Math.max(span, circ(plain[i], plain[j])); ST.maxSpan = Math.max(ST.maxSpan, span / 60);
  ok(span <= 2 * q.spread * 60 + 5, '其餘時間的最大間距 ' + (span / 60).toFixed(1) + ' 小時 ≤ 2×散布 ' + (2 * q.spread).toFixed(1));
}
console.log('共 ' + ST.n + ' 關；A 誘餌共 ' + ST.aTraps + ' 對、B 誘餌共 ' + ST.bTraps + ' 對；其餘時間的最大間距 ' + ST.maxSpan.toFixed(1) + ' 小時');
ok(ST.aTraps > 500 && ST.bTraps > 300, '誘餌確實會出現');
// 第 1 關沒有誘餌；到頂的關卡幾乎都有誘餌
{ for (let i = 0; i < 200; i++) { const q = T.makeLevel(1, rnd); ok(q.pairs.every(p => !p.trap), '第 1 關沒有誘餌'); } let hasA = 0, hasB = 0; for (let i = 0; i < 300; i++) { const q = T.makeLevel(T.RAMP_LEVELS, rnd); if (q.pairs.some(p => p.trap === 'A')) hasA++; if (q.pairs.some(p => p.trap === 'B')) hasB++; } ok(hasA > 270 && hasB > 270, '到頂的關卡 A、B 誘餌都有：' + hasA + '/' + hasB); }
// 說明
{ const a = { h12: 9, m: 15 }, d = { h24: 15, m: 45 }; ok(T.whyText(a, d) === '配錯了！指針鐘是 9:15，電子鐘 15:45 對應的指針鐘是 3:45', 'whyText：' + T.whyText(a, d)); }

// ── 程式裡的接線 ──
{ const rd = pth => require('fs').readFileSync(require('path').resolve(__dirname, pth), 'utf8'), src = rd('../../js/reaction_timepair.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 4200/.test(src) && /tpr-cmp/.test(src) && /tpr-card--right/.test(src) && /whyText\(a, d\)/.test(src), '配錯：兩個時鐘並排放大、寫出各是幾點、正確搭檔標綠、停格夠久');
  ok(/isMatch\(a, d\)/.test(src) && /api\.timer\(q\.limit \* 1000/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src), '配對判定用 isMatch、有限時、solve／wrong');
  ok(/\.tpr-digital \{[^}]*var\(--tpr-led\)/.test(css) && /\.tpr-face \{[^}]*var\(--tpr-face\)/.test(css) && /\.tpr-card--ok \{[^}]*var\(--c-ok\)/.test(css), '時鐘、LED、配對成功用 CSS 變數');
  ok(boot.indexOf("'js/reaction_timepair.js'") > 0 && /15:15/.test(G.rule) && /時針和分針互換/.test(G.rule), 'boot.js 有載入、玩法說明提到 15:15 與時針分針互換'); }
ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(6) && T.rating(6) !== T.rating(10) && T.rating(10) !== T.rating(16), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
