// 推星期幾（weekday，企劃 253）的純函式檢查：曆法（閏年、跨月、跨年）、星期推算、題型隨關卡出現、說明算式、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_weekday.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261108), rnd = rng(SEED);

// ── 曆法 ──
ok(T.dow(2026, 3, 5) === 4 && T.dayName(4) === '星期四', '2026/3/5 是星期四（企劃的範例）');
ok(T.dow(2026, 3, 27) === 5, '2026/3/27 是星期五（3/5 往後 22 天＝3 週又 1 天）');
ok(T.dow(2000, 1, 1) === 6 && T.dow(2025, 1, 1) === 3 && T.dow(2028, 2, 29) === 2 && T.dow(2024, 2, 29) === 4, '幾個已知日期的星期');
ok(T.daysIn(2026, 2) === 28 && T.daysIn(2028, 2) === 29 && T.daysIn(2026, 4) === 30 && T.daysIn(2026, 12) === 31 && T.daysIn(2026, 1) === 31, '各月天數（含閏年）');
{ const big = [1, 3, 5, 7, 8, 10, 12], small = [4, 6, 9, 11]; ok(big.every(m => T.daysIn(2027, m) === 31) && small.every(m => T.daysIn(2027, m) === 30), '大小月口訣：1 3 5 7 8 10 12 是 31 天、4 6 9 11 是 30 天'); }
ok(T.diffDays({ y: 2028, m: 2, d: 20 }, { y: 2028, m: 3, d: 3 }) === 12 && T.diffDays({ y: 2027, m: 2, d: 20 }, { y: 2027, m: 3, d: 3 }) === 11, '閏年的 2 月多一天：2/20 → 3/3 是 12 天、平年 11 天');
ok(JSON.stringify(T.addDays({ y: 2026, m: 12, d: 31 }, 1)) === '{"y":2027,"m":1,"d":1}' && JSON.stringify(T.addDays({ y: 2026, m: 3, d: 1 }, -1)) === '{"y":2026,"m":2,"d":28}', 'addDays 跨年、往回');
for (let i = 0; i < 500; i++) { const a = { y: 2025 + Math.floor(rnd() * 6), m: 1 + Math.floor(rnd() * 12), d: 1 + Math.floor(rnd() * 28) }, n = Math.floor(rnd() * 800) - 400, b = T.addDays(a, n); ok(T.diffDays(a, b) === n && T.mod7(T.dow(a.y, a.m, a.d) + n) === T.dow(b.y, b.m, b.d), 'addDays／diffDays／星期對得上：' + JSON.stringify(a) + ' + ' + n); }
ok(T.mod7(-1) === 6 && T.mod7(7) === 0 && T.mod7(-14) === 0 && T.mod7(10) === 3, 'mod7 負數也對');
// monthsBetween
ok(T.monthsBetween({ y: 2026, m: 11, d: 20 }, { y: 2027, m: 1, d: 5 }).map(m => m.y + '/' + m.m).join() === '2026/11,2026/12,2027/1', 'monthsBetween 跨年');
ok(T.monthsBetween({ y: 2026, m: 3, d: 5 }, { y: 2026, m: 3, d: 27 }).length === 1, 'monthsBetween 同月只有 1 個');

// ── 難度 ──
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000 && T.timeMs(99) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S);
ok(T.farMax(1) === T.FAR_MAX[0] && T.farMax(T.RAMP_LEVELS) === T.FAR_MAX[1], 'far 最大天數 ' + T.FAR_MAX);
for (let l = 2; l <= 60; l++) ok(T.timeMs(l) <= T.timeMs(l - 1) && T.farMax(l) >= T.farMax(l - 1), '單調 ' + l);
ok(T.typesFor(1).join() === 'same' && T.typesFor(3).join() === 'same', '第 1～3 關只有同月');
ok(T.typesFor(T.FROM.cross).includes('cross') && !T.typesFor(T.FROM.cross - 1).includes('cross'), 'cross 從第 ' + T.FROM.cross + ' 關起');
ok(T.typesFor(T.FROM.back).includes('back') && !T.typesFor(T.FROM.back - 1).includes('back'), 'back 從第 ' + T.FROM.back + ' 關起');
ok(T.typesFor(T.FROM.year).includes('year') && !T.typesFor(T.FROM.year - 1).includes('year'), 'year 從第 ' + T.FROM.year + ' 關起');
ok(T.typesFor(T.FROM.far).includes('far') && !T.typesFor(T.FROM.far - 1).includes('far'), 'far 從第 ' + T.FROM.far + ' 關起');
ok(!T.typesFor(T.SAME_UNTIL + 1).includes('same') && T.typesFor(T.SAME_UNTIL).includes('same'), '同月題型出到第 ' + T.SAME_UNTIL + ' 關就拿掉');
ok(T.typesFor(30).length === 4, '後面的關卡四種題型都有：' + T.typesFor(30));

// ── 整關 ──
const seen = {}, wd = [0, 0, 0, 0, 0, 0, 0]; let total = 0;
for (let i = 0; i < 4000; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  const K = q.known, D = q.target;
  seen[q.type] = (seen[q.type] || 0) + 1;
  ok(T.typesFor(lv).includes(q.type), '第 ' + lv + ' 關出了不該出的題型 ' + q.type);
  ok(K.w === T.dow(K.y, K.m, K.d) && D.w === T.dow(D.y, D.m, D.d), '星期是真的');
  ok(K.d >= 1 && K.d <= T.daysIn(K.y, K.m) && D.d >= 1 && D.d <= T.daysIn(D.y, D.m) && D.m >= 1 && D.m <= 12 && K.m >= 1 && K.m <= 12, '日期合法：' + T.dateText(K) + '／' + T.dateText(D));
  ok(q.offset === T.diffDays(K, D) && q.offset !== 0, 'offset 對得上且不是 0');
  ok(T.mod7(K.w + q.offset) === D.w, '星期推算：已知星期 + 天數 ≡ 目標星期（mod 7）');
  ok(K.y >= T.YEARS[0] - 1 && K.y <= T.YEARS[1] + 1 && D.y >= T.YEARS[0] - 1 && D.y <= T.YEARS[1] + 1, '年份在合理範圍');
  const mths = T.monthsBetween(q.offset >= 0 ? K : D, q.offset >= 0 ? D : K); ok(JSON.stringify(mths) === JSON.stringify(q.months), '附的 months 跟重算的一樣');
  if (q.type === 'same') { ok(K.y === D.y && K.m === D.m && q.offset > 0 && [0, 1, 2, 5, 6].includes(q.offset % 7), '同月題型：同一個月、往後、差 7 的倍數附近：' + q.offset); ok(q.months.length === 1, 'same：月份 1 個'); }
  if (q.type === 'cross') { ok(D.y === K.y && D.m === K.m + 1 && q.offset > 0 && q.offset <= 50, 'cross：往後跨一個月：' + q.offset); ok(q.months.length === 2, 'cross：月份 2 個'); }
  if (q.type === 'back') { ok(q.offset < 0 && q.offset >= -50, 'back：往回推：' + q.offset); }
  if (q.type === 'year') { ok(K.y !== D.y && Math.abs(q.offset) <= 45, 'year：跨年：' + q.offset); ok(q.months.length === 2, 'year：月份 2 個'); }
  if (q.type === 'far') { ok(Math.abs(q.offset) >= T.FAR_MIN && Math.abs(q.offset) <= Math.max(T.FAR_MIN, T.farMax(lv)), 'far：天數 ' + q.offset + ' 在 ' + T.FAR_MIN + '～' + T.farMax(lv)); }
  wd[D.w]++;
}
console.log('題型出現次數 ' + JSON.stringify(seen));
ok(seen.same > 100 && seen.cross > 100 && seen.back > 100 && seen.year > 100 && seen.far > 100, '各題型都有出現');
console.log('答案星期分佈 ' + wd.join(','));
ok(wd.every(n => n / total > 0.08 && n / total < 0.22), '答案的星期分佈平均：' + wd.map(n => (100 * n / total).toFixed(0) + '%').join(' '));
// 誘餌：忘了 31 天（當 30 天算）答案會差 1 天——驗證「跨月且經過 31 天的月份」確實有出現
{ let trap = 0; for (let i = 0; i < 400; i++) { const q = T.makeLevel(12, rnd); if (q.type === 'cross') { const dim = T.daysIn(q.known.y, q.known.m); if (dim === 31 || dim === 29) trap++; } } ok(trap > 20, '跨月題型會經過 31 天的大月：' + trap); }
// 說明算式
{ const q = { known: { w: 4 }, target: { w: 5 }, offset: 22 }; ok(T.explainText(q) === '相差 22 天＝3 週又 1 天，星期四往後數 1 天＝星期五', '說明：' + T.explainText(q)); }
{ const q = { known: { w: 1 }, target: { w: 6 }, offset: -10 }; ok(T.explainText(q) === '相差 10 天＝1 週又 3 天，星期一往前數 3 天＝星期六', '往回推的說明：' + T.explainText(q)); }
{ const q = { known: { w: 3 }, target: { w: 3 }, offset: 14 }; ok(/整整 2 週/.test(T.explainText(q)) && /星期三/.test(T.explainText(q)), '整週的說明：' + T.explainText(q)); }
{ const q = { known: { w: 0 }, target: { w: 2 }, offset: 2 }; ok(T.explainText(q) === '相差 2 天＝2 天，星期日往後數 2 天＝星期二', '不到一週：' + T.explainText(q)); }
// 效能
for (const lv of [1, 10, 24, 40]) { const t0 = Date.now(); for (let i = 0; i < 500; i++) T.makeLevel(lv, rnd); const per = (Date.now() - t0) / 500; ok(per < 5, '第 ' + lv + ' 關出題夠快：' + per.toFixed(3)); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_weekday.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 700 \+ steps\.ms \+ 2400/.test(src) && /wkd-day--to/.test(src), '失敗：月曆一格一格數完再停格 2 秒以上');
  ok(/\.wkd-opt--ok \{[^}]*var\(--c-ok/.test(css) && /\.wkd-day--to \{[^}]*var\(--c-ok/.test(css) && /\.wkd-opt--bad \{[^}]*var\(--c-bad/.test(css), '綠色、紅色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_weekday.js'") > 0 && /除以 7/.test(G.rule), 'boot.js 有載入、玩法說明提到除以 7'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
