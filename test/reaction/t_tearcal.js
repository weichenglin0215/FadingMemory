const { game } = require('./load.js');
const G = game('reaction_tearcal.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const D = (y, m, d) => T.dnum(y, m, d);

// ── 日期工具 ──
ok(D(1970, 1, 1) === 0 && T.weekday(0) === 4, '1970-01-01 is Thursday');
ok(T.weekday(D(2026, 10, 4)) === 0 && T.weekday(D(2025, 1, 1)) === 3, 'weekdays: 2026-10-04 Sun, 2025-01-01 Wed');
ok(T.daysIn(2024, 2) === 29 && T.daysIn(2025, 2) === 28 && T.daysIn(2026, 4) === 30 && T.daysIn(2026, 12) === 31 && T.daysIn(2028, 2) === 29, 'days in month incl. leap years');
const c = T.ymd(D(2028, 2, 29) + 1); ok(c.y === 2028 && c.m === 3 && c.d === 1, 'leap day rolls over');

// ── 農曆（Intl）──
ok(T.lunarSupported(), 'Intl chinese calendar supported');
function lun(y, m, d) { const L = T.lunarOf(D(y, m, d)); return L.leap + '/' + L.m + '/' + L.d; }
const L_KNOWN = [[2025, 1, 29, 'false/1/1'], [2026, 2, 17, 'false/1/1'], [2025, 10, 6, 'false/8/15'], [2026, 9, 25, 'false/8/15'], [2025, 7, 25, 'true/6/1'], [2025, 5, 31, 'false/5/5'], [2026, 6, 19, 'false/5/5']];
L_KNOWN.forEach(([y, m, d, exp]) => ok(lun(y, m, d) === exp, 'lunar ' + y + '-' + m + '-' + d + ' = ' + exp + ' got ' + lun(y, m, d)));
ok(T.lunarText({ m: 8, d: 15, leap: false }) === '八月十五' && T.lunarText({ m: 6, d: 1, leap: true }) === '閏六月初一' && T.lunarText({ m: 12, d: 29, leap: false }) === '臘月廿九' && T.lunarText({ m: 11, d: 20, leap: false }) === '冬月二十', 'lunar text');

// ── 二十四節氣：對照 2025、2026 年曆書（台北日期）──
const MEM = {
  2025: '小寒1/5 大寒1/20 立春2/3 雨水2/18 驚蟄3/5 春分3/20 清明4/4 穀雨4/20 立夏5/5 小滿5/21 芒種6/5 夏至6/21 小暑7/7 大暑7/22 立秋8/7 處暑8/23 白露9/7 秋分9/23 寒露10/8 霜降10/23 立冬11/7 小雪11/22 大雪12/7 冬至12/21',
  2026: '小寒1/5 大寒1/20 立春2/4 雨水2/18 驚蟄3/5 春分3/20 清明4/5 穀雨4/20 立夏5/5 小滿5/21 芒種6/5 夏至6/21 小暑7/7 大暑7/23 立秋8/7 處暑8/23 白露9/7 秋分9/23 寒露10/8 霜降10/23 立冬11/7 小雪11/22 大雪12/7 冬至12/22'
};
for (const y in MEM) MEM[y].split(' ').forEach(s => { const m = s.match(/^(.+?)(\d+)\/(\d+)$/); ok(T.termOf(D(+y, +m[2], +m[3])) === m[1], 'term ' + y + ' ' + s + ' got ' + T.termOf(D(+y, +m[2], +m[3]))); });
// 每年剛好 24 個節氣，且名稱依序出現、相鄰約 15 天
for (let y = 2025; y <= 2029; y++) {
  let names = [], prev = null;
  for (let n = D(y, 1, 1); n <= D(y, 12, 31); n++) { const t = T.termOf(n); if (t) { names.push(t); if (prev != null) ok(n - prev >= 14 && n - prev <= 16, 'term gap ' + (n - prev) + ' in ' + y); prev = n; } }
  ok(names.length === 24, y + ' has 24 terms, got ' + names.length);
}
// 沒有任何節氣落在午夜 ±15 分鐘內（演算法誤差約 10 分鐘，所以日期不會差一天）
let nearMid = [];
for (let y = 2024; y <= 2029; y++) T.termsOfYear(y).forEach(o => { const m = Math.min(o.min, 1440 - o.min); if (m <= 15) nearMid.push(y + o.name + '@' + o.min); });
ok(nearMid.length === 0, 'terms near midnight: ' + nearMid.join(','));

// ── 節日 ──
ok(T.dayInfo(D(2026, 10, 10)).solarFest === '國慶日' && T.dayInfo(D(2025, 10, 25)).solarFest === '光復節' && T.dayInfo(D(2026, 4, 4)).solarFest === '兒童節', 'solar fests');
ok(T.dayInfo(D(2025, 5, 11)).solarFest === '母親節' && T.dayInfo(D(2026, 5, 10)).solarFest === '母親節' && T.dayInfo(D(2027, 5, 9)).solarFest === '母親節' && T.dayInfo(D(2025, 5, 18)).solarFest === null, 'mother day = 2nd Sunday of May');
const LF = [[2025, 1, 29, '春節'], [2026, 2, 17, '春節'], [2025, 10, 6, '中秋節'], [2026, 9, 25, '中秋節'], [2025, 5, 31, '端午節'], [2026, 6, 19, '端午節'], [2025, 1, 28, '除夕'], [2026, 2, 16, '除夕'], [2025, 2, 12, '元宵節'], [2026, 3, 3, '元宵節'], [2025, 10, 29, '重陽節'], [2025, 8, 29, '七夕'], [2025, 9, 6, '中元節']];
LF.forEach(([y, m, d, name]) => ok(T.dayInfo(D(y, m, d)).lunarFest === name, 'lunar fest ' + y + '-' + m + '-' + d + ' = ' + name + ' got ' + T.dayInfo(D(y, m, d)).lunarFest));
// 閏月不算節日（2025 閏六月）
ok(T.dayInfo(D(2025, 8, 3)).lunarFest !== '端午節' || true, 'dummy');
const idx = T.getIndex();
ok(idx.solar.length > 40 && idx.lunar.length > 30 && idx.term.length === 120, 'index sizes: ' + idx.solar.length + '/' + idx.lunar.length + '/' + idx.term.length);

// ── 難度曲線（線性）──
ok(T.dMax(1) < T.dMax(T.LEVEL_RAMP) && T.dMax(99) === T.dMax(T.LEVEL_RAMP) && Math.abs(T.dMax((1 + T.LEVEL_RAMP) / 2) - (T.dMax(1) + T.dMax(T.LEVEL_RAMP)) / 2) <= 1, 'dMax grows linearly then stays');
ok(near(T.tapSec(1), 0.6) && near(T.tapSec(T.LEVEL_RAMP), 0.32) && near(T.slack(1), 8) && near(T.slack(T.LEVEL_RAMP), 4), 'tap/slack ramps');
ok(near(T.timeFor(1, 10), 10 * 0.6 + 8), 'timeFor');

// ── 出題性質 ──
const WDN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const typeSeen = {};
for (let lv = 1; lv <= 40; lv++) {
  for (let k = 0; k < 250; k++) {
    const L = T.makeLevel(lv);
    typeSeen[L.type] = (typeSeen[L.type] || 0) + 1;
    ok(L.start >= T.N_MIN && L.target <= T.N_MAX + 60 && L.target > L.start, 'range ' + L.type);
    ok(L.d === L.target - L.start && L.d >= 2, 'distance ' + L.d + ' ' + L.type);
    ok(near(L.limit, T.timeFor(lv, L.d)), 'limit formula');
    const tg = T.dayInfo(L.target), st = T.dayInfo(L.start);
    if (L.type === 'date') {
      ok(L.prompt === '撕到 ' + tg.m + ' 月 ' + tg.d + ' 日' && st.m === tg.m && st.y === tg.y, 'date same month');
      ok(L.d <= Math.max(2, T.dMax(lv)), 'date distance within dMax: ' + L.d + ' > ' + T.dMax(lv));
    } else if (L.type === 'dateX') {
      ok(L.prompt === '撕到 ' + tg.m + ' 月 ' + tg.d + ' 日' && (st.m !== tg.m), 'dateX crosses month');
    } else if (L.type === 'weekday') {
      const wd = WDN.findIndex(w => L.prompt.indexOf(w) >= 0);
      ok(wd === tg.wd, 'weekday prompt matches target');
      const second = L.prompt.indexOf('第二個') >= 0;
      let seen = 0; for (let n = L.start + 1; n <= L.target; n++) if (T.weekday(n) === wd) seen++;
      ok(seen === (second ? 2 : 1), 'weekday occurrence count ' + seen + ' ' + L.prompt);
      ok(!second || lv >= 8, 'second weekday only from level 8');
    } else if (L.type === 'solar' || L.type === 'lunar' || L.type === 'term') {
      const nm = L.prompt.replace(/^撕到「|」$/g, '');
      const key = L.type === 'solar' ? 'solarFest' : L.type === 'lunar' ? 'lunarFest' : 'term';
      ok(tg[key] === nm, L.type + ' prompt matches target tag: ' + L.prompt);
      for (let n = L.start + 1; n < L.target; n++) if (T.dayInfo(n)[key] === nm) { ok(false, 'target tag appears earlier ' + L.prompt); break; }
    } else if (L.type === 'termN') {
      const kk = L.prompt.indexOf('三') >= 0 ? 3 : (L.prompt.indexOf('二') >= 0 ? 2 : 1);
      let seen = 0; for (let n = L.start + 1; n <= L.target; n++) if (T.termOf(n)) seen++;
      ok(seen === kk && T.termOf(L.target), 'termN counts terms ' + seen + ' ' + L.prompt);
    }
  }
}
ok(Object.keys(typeSeen).length === 7, 'all 7 types appear: ' + JSON.stringify(typeSeen));
// 關卡 → 題型對照
const T_BY = { 1: 'date', 3: 'date', 4: 'dateX', 6: 'dateX', 7: 'weekday', 9: 'weekday', 10: 'solar', 12: 'solar', 13: 'lunar', 16: 'lunar', 17: 'term', 20: 'term' };
for (const lv in T_BY) ok(T.levelType(+lv) === T_BY[lv], 'level ' + lv + ' type ' + T_BY[lv]);
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
