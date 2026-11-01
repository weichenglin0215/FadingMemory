// 挑豆子（beans，企劃 387；V1.38.0 改成關卡制、往盤子外面拖）的純函式檢查：難度線性、一盤豆子的組成（顆數、雜物數、像紅豆的比例）、
// 豆子之間不重疊且都在盤子裡、「拖出盤緣」的判定、扣時間的接線、結算彈窗不會被揭曉畫面蓋住（CSS）
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_beans.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261214), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（線性，依關卡；第 1 關 → 第 RAMP_LEVELS 關）──
ok(T.RAMP_LEVELS === 30 && T.MAX_LEVEL === 90, '關卡斜率 30 關、上限 90 關（V1.36.0 統一規格）');
ok(T.totalFor(1) === T.TOTAL[0] && T.totalFor(T.RAMP_LEVELS) === T.TOTAL[1] && T.totalFor(99) === T.TOTAL[1], '豆子數 ' + T.TOTAL);
ok(T.junkFor(1) === T.JUNK[0] && T.junkFor(T.RAMP_LEVELS) === T.JUNK[1] && T.junkFor(99) === T.JUNK[1], '雜物顆數 ' + T.JUNK);
ok(near(T.lookFor(1), T.LOOK[0]) && near(T.lookFor(T.RAMP_LEVELS), T.LOOK[1]) && near(T.sizeFor(1), T.SIZE[0]) && near(T.sizeFor(T.RAMP_LEVELS), T.SIZE[1]), '像紅豆的比例／豆子大小');
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000 && T.timeMs(99) === T.TIME_S[1] * 1000, '每關限時 ' + T.TIME_S + ' 秒');
for (let n = 2; n <= T.RAMP_LEVELS + 2; n++) ok(T.totalFor(n) >= T.totalFor(n - 1) && T.junkFor(n) >= T.junkFor(n - 1) && T.lookFor(n) >= T.lookFor(n - 1) && T.sizeFor(n) <= T.sizeFor(n - 1) && T.timeMs(n) >= T.timeMs(n - 1), '單調 ' + n);
{ const d = []; for (let n = 2; n <= T.RAMP_LEVELS; n++) d.push(T.totalFor(n) - T.totalFor(n - 1)); ok(Math.max(...d) - Math.min(...d) <= 1, '豆子數線性增加：每關 +' + Math.min(...d) + '～+' + Math.max(...d)); }
for (let n = 1; n <= 60; n++) ok(T.junkFor(n) >= 1 && T.junkFor(n) < T.totalFor(n), '每盤至少 1 顆雜物、也有紅豆 ' + n);
// 玩家意見：盤子 480px、拖到紅豆只扣時間
ok(T.PLATE_D === 480 && T.PLATE_R === 240, '盤子直徑 480px');
ok(T.PENALTY_S > 0 && T.PENALTY_S < T.TIME_S[0] / 2, '拖到紅豆扣 ' + T.PENALTY_S + ' 秒（只扣時間、不會一次扣光）');
// 時間預算：每顆雜物平均 1 秒拖出去（找得到的話），第 1 關要綽綽有餘；到頂的關卡也要有每顆 2 秒以上
ok(T.junkFor(1) * 1.0 < T.timeMs(1) / 1000 * 0.5 && T.timeMs(T.RAMP_LEVELS) / 1000 / T.junkFor(T.RAMP_LEVELS) >= 2, '時間夠用：第 1 關 ' + T.junkFor(1) + ' 顆／' + T.timeMs(1) / 1000 + ' 秒，到頂 ' + T.junkFor(T.RAMP_LEVELS) + ' 顆／' + T.timeMs(T.RAMP_LEVELS) / 1000 + ' 秒');

// ── 一盤豆子：全部難度掃一遍 ──
const ST = { n: 0, minClear: Infinity, types: {}, lookTot: 0, junkTot: 0, fallback: 0 };
for (let n = 1; n <= 36; n++) for (let rep = 0; rep < 40; rep++) {
  const p = T.makePlate(n, rnd); ST.n++;
  ok(p.items.length === T.totalFor(n) && p.total === p.items.length && p.junk === T.junkFor(n) && near(p.size, T.sizeFor(n)), '一盤 ' + p.items.length + ' 顆、雜物 ' + p.junk);
  const junk = p.items.filter(it => !it.good), red = p.items.filter(it => it.good);
  ok(junk.length === p.junk && red.length === p.total - p.junk && red.every(it => it.type === 'red') && junk.every(it => it.type !== 'red'), '紅豆與雜物的數量');
  ok(new Set(p.items.map(it => it.id)).size === p.items.length, 'id 不重複');
  const looks = junk.filter(it => T.LOOKS.includes(it.type)).length; ST.lookTot += looks; ST.junkTot += junk.length;
  ok(looks === Math.round(p.junk * T.lookFor(n)), '像紅豆的雜物 ' + looks + ' = round(' + p.junk + ' × ' + T.lookFor(n) + ')');
  ok(junk.every(it => T.EASY.includes(it.type) || T.LOOKS.includes(it.type)), '雜物種類');
  junk.forEach(it => { ST.types[it.type] = (ST.types[it.type] || 0) + 1; });
  // 都在盤子裡（整顆豆子在盤緣裡面）
  const r = T.beanRadius(p.size);
  p.items.forEach(it => ok(Math.hypot(it.x, it.y) + r <= T.PLATE_R - T.RIM + 0.2, '豆子在盤緣裡面：' + Math.hypot(it.x, it.y).toFixed(1)));
  // 豆子之間不重疊（V1.38.0 玩家意見）
  const mc = T.minClearance(p); ST.minClear = Math.min(ST.minClear, mc);
  ok(mc >= -0.05, '第 ' + n + ' 關豆子互不重疊：最近的縫 ' + mc.toFixed(2));
}
console.log('共 ' + ST.n + ' 盤；雜物種類分布 ' + JSON.stringify(ST.types) + '；像紅豆的占雜物 ' + (100 * ST.lookTot / ST.junkTot).toFixed(1) + '%；最小的縫 ' + ST.minClear.toFixed(2) + ' px');
ok(T.EASY.concat(T.LOOKS).every(t => ST.types[t] > 50), '六種雜物都會出現');
// 第 1 關沒有像紅豆的雜物；到頂的盤子 80% 是
{ let a = 0, b = 0, ta = 0, tb = 0; for (let i = 0; i < 300; i++) { const p0 = T.makePlate(1, rnd), p1 = T.makePlate(T.RAMP_LEVELS, rnd); p0.items.filter(x => !x.good).forEach(x => { ta++; if (T.LOOKS.includes(x.type)) a++; }); p1.items.filter(x => !x.good).forEach(x => { tb++; if (T.LOOKS.includes(x.type)) b++; }); }
  ok(a === 0 && Math.abs(b / tb - T.LOOK[1]) < 0.05, '第 1 關沒有像紅豆的雜物（' + a + '），到頂約 ' + (100 * b / tb).toFixed(0) + '%'); }
// 擺放：到頂的 150 顆放得下；格子保底（要求的顆數超過隨機擺得下的）一樣不重疊、都在盤裡
{
  const size = T.SIZE[1], r = T.beanRadius(size), R = T.centerRadius(size);
  ok(T.hexSlots(R, 2 * r + T.GAP).length > T.TOTAL[1], '六角形格子夠放 ' + T.TOTAL[1] + ' 顆：' + T.hexSlots(R, 2 * r + T.GAP).length);
  const pts = T.placeBeans(250, size, rnd);                        // 隨機擺放擺不下（250 顆太擠）→ 改用格子
  ok(pts.length === 250, '保底：格子放得下 250 顆（格子共 ' + T.hexSlots(R, 2 * r + T.GAP).length + '）');
  let m = Infinity; for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) m = Math.min(m, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
  ok(m >= 2 * r - 1e-6 && pts.every(q => Math.hypot(q[0], q[1]) <= R + 1e-6), '保底：不重疊、都在盤裡（最近 ' + m.toFixed(2) + '）');
}
// 拖出盤緣的判定：中心超出盤子外緣才算
ok(!T.isOut(0, 0) && !T.isOut(T.PLATE_R, 0) && T.isOut(T.PLATE_R + 1, 0) && T.isOut(0, -T.PLATE_R - 1) && !T.isOut(100, 100) && T.isOut(200, 200), 'isOut');
// 剩下的雜物
{ const p = T.makePlate(3, rnd), junk = p.items.filter(i => !i.good); const removed = {}; removed[junk[0].id] = true; ok(T.junkLeft(p, removed).length === junk.length - 1 && T.junkLeft(p, {}).length === junk.length, 'junkLeft'); }
// 顏色和形狀的差異字典
ok(T.LOOKS.every(t => T.DIFF[t] && T.NAME[t]) && T.EASY.every(t => T.DIFF[t] && T.NAME[t]) && T.NAME.red === '紅豆', '每種雜物都有名稱與差異說明');

// ── 程式裡的接線 ──
{ const rd = pth => require('fs').readFileSync(require('path').resolve(__dirname, pth), 'utf8'), src = rd('../../js/reaction_beans.js'), css = rd('../../css/games/reaction_beans.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js'), theme = rd('../../css/theme.css');
  ok(/function throwOut\(/.test(src) && /isOut\(px - pcx, py - pcy\)/.test(src) && /timer\.cut\(PENALTY_S \* 1000\)/.test(src) && /timer = api\.timer\(timeMs\(level\), timeUp\)/.test(src), '拖出盤緣就判定；拖到紅豆用 timer.cut 扣時間；每關各自的限時');
  ok(/api\.pass\(\{ delay: NEXT_MS \}\)/.test(src) && /left === 0/.test(src) && !/scoreOf/.test(src) && !/resume: false/.test(src), '雜物挑光就過關；成績＝通過關數（用 kit.run 的預設，也有從前 5 關繼續）');
  ok(/api\.fail\(\{ delay: END_MS/.test(src) && /beans-ring/.test(src) && /showCompare\(showTypes\)/.test(src) && /beans-cmp/.test(src), '時間到：剩下的雜物畫紅圈、紅豆和很像的雜物並排放大、停格夠久');
  ok(/pointerdown/.test(src) && /pointermove/.test(src) && /pointerup/.test(src) && /pointercancel/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src) && !/bowl|inBowl/.test(src), '拖曳事件、驗證用的 solve／wrong，不再有碗');
  ok(/UI\.store\.set\(Reaction\.bestKey\(ID\), null\)/.test(src) && /\.v138/.test(src), '舊的最佳紀錄（挑出幾顆）第一次進來清掉');
  ok(/\.beans-field \{[^}]*isolation: isolate/.test(css) && /\.beans-stage \{[^}]*overflow: visible/.test(css), '揭曉畫面的 z-index 關在遊戲區裡（結算彈窗在上面）；盤子比遊戲區寬一點，不被切掉');
  ok(/\.beans-plate--hit \{[^}]*var\(--c-bad-light\)/.test(css) && !/beans-bowl/.test(css) && !/beans-bowl/.test(theme), '拖到紅豆盤緣閃紅；碗的樣式已拿掉');
  ok(/fill: var\(--bns-red\)/.test(css) && /\.beans-redstone \{[^}]*var\(--bns-redstone\)/.test(css) && /\.beans-plate \{[^}]*var\(--bns-wood\)/.test(css) && /\.beans-ring \{[^}]*var\(--c-bad-light\)/.test(css), '豆子、木盤、紅圈用 CSS 變數');
  // 紅豆和「很像」的雜物，顏色不能完全一樣：紅色小石頭、赤小豆、花豆跟紅豆至少有一項明顯不同（色相相近但明度或形狀不同）
  const hsl = n => { const m = new RegExp('--bns-' + n + ': hsl\\((\\d+), (\\d+)%, (\\d+)%').exec(theme); return [+m[1], +m[2], +m[3]]; };
  const red = hsl('red'), rs = hsl('redstone'), pt = hsl('pinto'), az = hsl('adz'), mg = hsl('mung'), hd = (x, y) => Math.min(Math.abs(x - y), 360 - Math.abs(x - y));
  ok(hd(rs[0], red[0]) <= 12 && hd(pt[0], red[0]) <= 12 && hd(az[0], red[0]) <= 12 && hd(mg[0], red[0]) > 60, '像紅豆的雜物色相接近（' + [red[0], rs[0], pt[0], az[0]].join('/') + '）、綠豆差很多（' + mg[0] + '）');
  ok(Math.abs(pt[2] - red[2]) >= 6 && Math.abs(rs[2] - red[2]) >= 4, '花豆明度更暗、紅色小石頭明度不同（' + red[2] + '/' + pt[2] + '/' + rs[2] + '）');
  ok(boot.indexOf("'js/reaction_beans.js'") > 0 && /紅豆/.test(G.rule) && /赤小豆/.test(G.rule) && /往盤子外面拖/.test(G.rule) && /扣時間/.test(G.rule), 'boot.js 有載入、玩法說明提到紅豆、赤小豆、往外拖、扣時間');
  ok(G.score.format === '{v} 關' && G.score.max === 90 && G.score.better === 'max', '成績規格：通過關數（越大越好、1～90）'); }
ok(T.rating(2) !== T.rating(8) && T.rating(8) !== T.rating(15) && T.rating(15) !== T.rating(30) && T.rating(30) !== T.rating(50), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
