// 記行事曆（calendar，企劃 318）的純函式檢查：真正的月曆排法（第一天星期幾、天數、列數）、貼紙位置不重複、長得像的一對、問題、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_calendar.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261121), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度 ──
ok(T.iconsFor(1) === T.ICONS_N[0] && T.iconsFor(T.RAMP_LEVELS) === T.ICONS_N[1] && T.iconsFor(99) === T.ICONS_N[1], '圖示數 ' + T.ICONS_N);
ok(T.viewMs(1) === T.VIEW_S[0] * 1000 && T.viewMs(T.RAMP_LEVELS) === T.VIEW_S[1] * 1000, '看的時間 ' + T.VIEW_S);
ok(T.respMs(1) === T.RESP_S[0] * 1000 && T.respMs(T.RAMP_LEVELS) === T.RESP_S[1] * 1000, '作答時間 ' + T.RESP_S);
ok(T.asksFor(T.TWO_FROM - 1) === 1 && T.asksFor(T.TWO_FROM) === 2 && T.asksFor(60) === 2, '第 ' + T.TWO_FROM + ' 關起問兩題');
ok(near(T.pairPFor(1), T.PAIR_P[0]) && near(T.pairPFor(T.RAMP_LEVELS), T.PAIR_P[1]), '長得像的一對的機率 ' + T.PAIR_P);
for (let l = 2; l <= 60; l++) ok(T.iconsFor(l) >= T.iconsFor(l - 1) && T.viewMs(l) <= T.viewMs(l - 1) && T.respMs(l) <= T.respMs(l - 1) && T.pairPFor(l) >= T.pairPFor(l - 1) && T.asksFor(l) >= T.asksFor(l - 1), '單調 ' + l);
{ const d = []; for (let l = 2; l <= T.RAMP_LEVELS; l++) d.push(T.iconsFor(l) - T.iconsFor(l - 1)); ok(Math.max(...d) - Math.min(...d) <= 1, '圖示數線性成長'); }

// ── 月曆（真正的曆法）──
{ const l = T.monthLayout(2026, 3); ok(l.first === 0 && l.days === 31 && l.rows === 5, '2026/3：1 號是星期日、31 天、5 列：' + JSON.stringify(l)); }
{ const l = T.monthLayout(2026, 2); ok(l.first === 0 && l.days === 28 && l.rows === 4, '2026/2：1 號星期日、28 天、剛好 4 列：' + JSON.stringify(l)); }
{ const l = T.monthLayout(2028, 2); ok(l.days === 29 && l.first === 2, '2028/2（閏年）：29 天、1 號是星期二：' + JSON.stringify(l)); }
{ const l = T.monthLayout(2026, 8); ok(l.first === 6 && l.days === 31 && l.rows === 6, '2026/8：1 號是星期六、31 天 → 6 列：' + JSON.stringify(l)); }
for (let y = 2025; y <= 2031; y++) for (let m = 1; m <= 12; m++) { const l = T.monthLayout(y, m); ok(l.first >= 0 && l.first <= 6 && l.days >= 28 && l.days <= 31 && l.rows >= 4 && l.rows <= 6 && l.rows === Math.ceil((l.first + l.days) / 7), y + '/' + m + ' 月曆排法'); }
// 圖示
ok(T.ICONS.length === 10 && new Set(T.ICONS.map(i => i.id)).size === 10, '10 種圖示');
T.ICONS.forEach(i => { ok(T.SHAPES[i.id] && T.SHAPES[i.id].length >= 1 && i.name.length >= 2, i.id + ' 有畫法與名字'); if (i.pair) ok(T.iconOf(i.pair).pair === i.id, i.id + ' 與 ' + i.pair + ' 互為長得像'); });
ok(T.iconOf('tooth').name === '牙醫' && T.iconOf('hospital').name === '回診' && T.iconOf('cake').name === '生日蛋糕' && T.iconOf('box').name === '喜餅' && T.iconOf('bill').name === '繳費單', '企劃提到的圖示名字');

// ── 整關 ──
let total = 0, pairShown = 0, askPair = 0, firstDays = {};
for (let i = 0; i < 2000; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  const lay = T.monthLayout(q.year, q.month);
  ok(q.first === lay.first && q.days === lay.days && q.rows === lay.rows, '月曆資料一致');
  ok(q.year >= T.YEARS[0] && q.year <= T.YEARS[1] && q.month >= 1 && q.month <= 12, '年月範圍');
  ok(q.placements.length === T.iconsFor(lv), '第 ' + lv + ' 關：圖示 ' + q.placements.length + ' 個（要 ' + T.iconsFor(lv) + '）');
  ok(new Set(q.placements.map(p => p.icon)).size === q.placements.length && new Set(q.placements.map(p => p.day)).size === q.placements.length, '圖示不重複、每個貼在不同的日子');
  ok(q.placements.every(p => p.day >= 1 && p.day <= q.days && T.iconOf(p.icon)), '日子在這個月之內');
  ok(q.asks.length === Math.min(T.asksFor(lv), q.placements.length) && new Set(q.asks).size === q.asks.length && q.asks.every(a => q.placements.some(p => p.icon === a)), '問的圖示都在月曆上、不重複');
  ok(q.asks.every(a => T.dayOf(q, a) >= 1), 'dayOf 找得到');
  ok(q.viewMs === T.viewMs(lv) && q.respMs === T.respMs(lv), '時間');
  const ids = q.placements.map(p => p.icon), hasPair = (ids.includes('tooth') && ids.includes('hospital')) || (ids.includes('cake') && ids.includes('box')); if (hasPair) pairShown++;
  if (q.asks.some(a => { const p = T.iconOf(a).pair; return p && ids.includes(p); })) askPair++;
  firstDays[q.first] = 1;
}
console.log('同時貼了長得像的一對：' + pairShown + '／' + total + '；被問的是「有夥伴一起出現」的：' + askPair + '／' + total + '；月曆第一天是星期幾：' + Object.keys(firstDays).length + ' 種');
ok(Object.keys(firstDays).length === 7, '七種排法都有出現');
ok(pairShown / total > 0.5 && askPair / total > 0.3, '常常出現長得像的一對、而且常常問到它');
// 越後面長得像的一對越常出現
{ let early = 0, late = 0, n = 600; for (let i = 0; i < n; i++) { const a = T.makeLevel(1, rnd).placements.map(p => p.icon), b = T.makeLevel(24, rnd).placements.map(p => p.icon); if ((a.includes('tooth') && a.includes('hospital')) || (a.includes('cake') && a.includes('box'))) early++; if ((b.includes('tooth') && b.includes('hospital')) || (b.includes('cake') && b.includes('box'))) late++; } ok(late > early + n * 0.2, '長得像的一對越後面越常：第 1 關 ' + (100 * early / n).toFixed(0) + '% → 第 24 關 ' + (100 * late / n).toFixed(0) + '%'); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_calendar.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3400/.test(src) && /cld-cell--bad/.test(src) && /revealAll/.test(src), '失敗：貼紙全部回來、紅圈綠圈、停格 2 秒以上');
  ok(/\.cld-cell--ok \{[^}]*var\(--c-ok\)/.test(css) && /\.cld-cell--bad \{[^}]*var\(--c-bad-light\)/.test(css), '綠圈、紅圈用 CSS 變數');
  ok(boot.indexOf("'js/reaction_calendar.js'") > 0 && /月曆/.test(G.rule), 'boot.js 有載入、玩法說明提到月曆'); }
ok(T.rating(2) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(12) && T.rating(12) !== T.rating(20), '評語分級');
// V1.36.0 玩家意見：圖示消失之後，先在問題列上讓圖示亂跳、閃爍 2 秒（故意干擾），才出現問題
ok(T.DISTRACT_S === 2 && T.NOISE_COPIES >= 2 && T.MOVE_MS > 0 && T.BLINK_MS[0] < T.BLINK_MS[1], '干擾參數：閃爍 ' + T.DISTRACT_S + ' 秒、每個圖示 ' + T.NOISE_COPIES + ' 個');
{ const W = 472, H = T.NOISE_H, S = T.NOISE_SIZE;
  for (let n = 1; n <= 40; n++) { const spots = T.noiseSpots(n, W, H, S, rnd); ok(spots.length === n && spots.every(p => Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x <= W - S && p.y >= 0 && p.y <= H - S), '干擾圖示的位置都在問題列裡：' + n + ' 個'); }
  const xs = new Set(), ys = new Set(); for (let k = 0; k < 50; k++) T.noiseSpots(12, W, H, S, rnd).forEach(p => { xs.add(Math.floor(p.x / 40)); ys.add(Math.floor(p.y / 20)); });
  ok(xs.size >= 8 && ys.size >= 3, '位置是隨機散開的（橫向 ' + xs.size + ' 格、縱向 ' + ys.size + ' 格都出現過）');
  ok(JSON.stringify(T.noiseSpots(3, 10, 10, 20, rnd)) === '[{"x":0,"y":0},{"x":0,"y":0},{"x":0,"y":0}]', '問題列比圖示還小時不會出現負數位置'); }
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_calendar.js'), 'utf8'), css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/reaction6.css'), 'utf8').split(/\s+/).join(' ');
  ok(src.indexOf("phase = 'distract'") > 0 && src.indexOf('api.after(DISTRACT_S * 1000') > 0 && src.indexOf("stopNoise(); phase = 'ask'") > 0, '貼紙收起來之後進入「干擾」階段，DISTRACT_S 秒後才進入「問題」階段');
  { const a = src.indexOf('function hide()'), b = src.indexOf('function startNoise()'); ok(a > 0 && b > a && src.slice(a, b).indexOf('nextAsk()') > src.slice(a, b).indexOf('api.after(DISTRACT_S'), '問題（nextAsk）在干擾結束之後才出現'); }
  ok(css.indexOf('.cld-noise__i { position: absolute; animation: cld-blink') >= 0 && css.indexOf('@keyframes cld-blink') >= 0, '干擾圖示會閃爍（有樣式）');
  ok(/閃爍/.test(G.rule), '玩法說明提到閃爍的干擾圖案'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
