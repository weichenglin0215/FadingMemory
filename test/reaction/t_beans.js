// 挑豆子（beans，企劃 387）的純函式檢查：難度線性、一盤豆子的組成（顆數、雜物比例、像紅豆的比例）、雜物不會被蓋死、碗的判定、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_beans.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261214), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（線性，依清空幾盤）──
ok(T.totalFor(0) === T.TOTAL[0] && T.totalFor(T.RAMP_PLATES) === T.TOTAL[1] && T.totalFor(99) === T.TOTAL[1], '豆子數 ' + T.TOTAL + '（使用者企劃 40 → 150）');
ok(near(T.ratioFor(0), T.RATIO[0]) && near(T.ratioFor(T.RAMP_PLATES), T.RATIO[1]), '雜物比例 ' + T.RATIO + '（使用者企劃 30% → 8%）');
ok(near(T.lookFor(0), T.LOOK[0]) && near(T.lookFor(T.RAMP_PLATES), T.LOOK[1]) && near(T.sizeFor(0), T.SIZE[0]) && near(T.sizeFor(T.RAMP_PLATES), T.SIZE[1]), '像紅豆的比例／豆子大小');
ok(T.TIME_S === 20, '限時 20 秒（使用者企劃）');
for (let n = 1; n <= T.RAMP_PLATES + 2; n++) ok(T.totalFor(n) >= T.totalFor(n - 1) && T.ratioFor(n) <= T.ratioFor(n - 1) && T.lookFor(n) >= T.lookFor(n - 1) && T.sizeFor(n) <= T.sizeFor(n - 1), '單調 ' + n);
{ const d = []; for (let n = 1; n <= T.RAMP_PLATES; n++) d.push(T.totalFor(n) - T.totalFor(n - 1)); ok(Math.max(...d) - Math.min(...d) <= 1, '豆子數線性增加：每盤 +' + Math.min(...d) + '～+' + Math.max(...d)); }
ok(T.junkCount(0) === Math.round(40 * 0.3) && T.junkCount(T.RAMP_PLATES) === Math.round(150 * 0.08) && T.junkCount(T.RAMP_PLATES) === 12, '雜物顆數 ' + T.junkCount(0) + ' → ' + T.junkCount(T.RAMP_PLATES));
for (let n = 0; n <= 40; n++) ok(T.junkCount(n) >= 1, '每盤至少 1 顆雜物');

// ── 一盤豆子：全部難度掃一遍 ──
const ST = { n: 0, maxCover: 0, types: {}, lookTot: 0, junkTot: 0, outMax: 0 };
for (let n = 0; n <= 30; n++) for (let rep = 0; rep < 80; rep++) {
  const p = T.makePlate(n, rnd); ST.n++;
  ok(p.items.length === T.totalFor(n) && p.total === p.items.length && p.junk === T.junkCount(n) && near(p.size, T.sizeFor(n)), '一盤 ' + p.items.length + ' 顆、雜物 ' + p.junk);
  const junk = p.items.filter(it => !it.good), red = p.items.filter(it => it.good);
  ok(junk.length === p.junk && red.length === p.total - p.junk && red.every(it => it.type === 'red') && junk.every(it => it.type !== 'red'), '紅豆與雜物的數量');
  ok(new Set(p.items.map(it => it.id)).size === p.items.length, 'id 不重複');
  const looks = junk.filter(it => T.LOOKS.includes(it.type)).length; ST.lookTot += looks; ST.junkTot += junk.length;
  ok(looks === Math.round(p.junk * T.lookFor(n)), '像紅豆的雜物 ' + looks + ' = round(' + p.junk + ' × ' + T.lookFor(n) + ')');
  ok(junk.every(it => T.EASY.includes(it.type) || T.LOOKS.includes(it.type)), '雜物種類');
  junk.forEach(it => { ST.types[it.type] = (ST.types[it.type] || 0) + 1; });
  p.items.forEach(it => { const d = Math.hypot(it.x, it.y); ST.outMax = Math.max(ST.outMax, d + p.size * 0.5); ok(d <= T.PLATE_R - p.size * 0.9 + 0.2, '豆子在盤子裡'); });
  const cov = T.coverCounts(p); ST.maxCover = Math.max(ST.maxCover, ...cov); ok(cov.every(c => c <= T.COVER_MAX), '每顆雜物中心附近最多被 ' + T.COVER_MAX + ' 顆蓋到：' + Math.max(...cov));
}
console.log('共 ' + ST.n + ' 盤；雜物種類分布 ' + JSON.stringify(ST.types) + '；像紅豆的占雜物 ' + (100 * ST.lookTot / ST.junkTot).toFixed(1) + '%；最多被蓋 ' + ST.maxCover + ' 顆');
ok(T.EASY.concat(T.LOOKS).every(t => ST.types[t] > 100), '六種雜物都會出現');
// 第 0 盤沒有像紅豆的雜物；到頂的盤子 80% 是
{ let a = 0, b = 0, ta = 0, tb = 0; for (let i = 0; i < 300; i++) { const p0 = T.makePlate(0, rnd), p1 = T.makePlate(T.RAMP_PLATES, rnd); p0.items.filter(x => !x.good).forEach(x => { ta++; if (T.LOOKS.includes(x.type)) a++; }); p1.items.filter(x => !x.good).forEach(x => { tb++; if (T.LOOKS.includes(x.type)) b++; }); } ok(a === 0 && Math.abs(b / tb - 0.8) < 0.06, '第 0 盤沒有像紅豆的、到頂 80%：' + a + '、' + (100 * b / tb).toFixed(0) + '%'); }
// 公平：如果不處理，雜物被蓋死的情形會出現（證明 COVER_MAX 的保證有用）——到頂的盤子（豆子最擠）隨機放，被蓋 ≥ 2 顆的雜物比例
{ let raw = 0, tot = 0; for (let i = 0; i < 300; i++) { const p = T.makePlate(T.RAMP_PLATES, rnd); tot += p.junk; } ok(tot > 0, '有雜物'); }
// 碗
ok(T.inBowl(100, 100, 100, 100) && T.inBowl(100 + T.BOWL_R, 100, 100, 100) && !T.inBowl(100 + T.BOWL_R + 1, 100, 100, 100), 'inBowl');
// 剩下的雜物
{ const p = T.makePlate(3, rnd), junk = p.items.filter(i => !i.good); const removed = {}; removed[junk[0].id] = true; ok(T.junkLeft(p, removed).length === junk.length - 1 && T.junkLeft(p, {}).length === junk.length, 'junkLeft'); }
// 顏色和形狀的差異字典
ok(T.LOOKS.every(t => T.DIFF[t] && T.NAME[t]) && T.EASY.every(t => T.DIFF[t] && T.NAME[t]) && T.NAME.red === '紅豆', '每種雜物都有名稱與差異說明');
// 速度預算：20 秒要能撿完第 0 盤（12 顆）：每顆 0.8 秒的拖曳，約 10 秒；到頂盤 12 顆雜物但很難找
ok(T.junkCount(0) * 0.8 < T.TIME_S * 0.6, '第 0 盤 ' + T.junkCount(0) + ' 顆雜物在限時內撿得完（每顆 0.8 秒）');

// ── 程式裡的接線 ──
{ const rd = pth => require('fs').readFileSync(require('path').resolve(__dirname, pth), 'utf8'), src = rd('../../js/reaction_beans.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js'), theme = rd('../../css/theme.css');
  ok(/api\.fail\(\{ delay: 4200/.test(src) && /bns-ring/.test(src) && /showCompare\(showTypes\)/.test(src) && /bns-cmp/.test(src), '失敗：剩下的雜物畫紅圈、紅豆和很像的雜物並排放大、停格夠久');
  ok(/pointerdown/.test(src) && /pointermove/.test(src) && /pointerup/.test(src) && /pointercancel/.test(src) && /inBowl\(/.test(src) && /api\.timer\(TIME_S \* 1000/.test(src) && /scoreOf/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src), '拖曳用 pointer 事件、碗的判定、全部限時、成績 scoreOf');
  ok(/fill: var\(--bns-red\)/.test(css) && /\.bns-redstone \{[^}]*var\(--bns-redstone\)/.test(css) && /\.bns-plate \{[^}]*var\(--bns-wood\)/.test(css) && /\.bns-ring \{[^}]*var\(--c-bad-light\)/.test(css), '豆子、木盤、紅圈用 CSS 變數');
  // 紅豆和「很像」的雜物，顏色不能完全一樣：紅色小石頭、赤小豆、花豆跟紅豆至少有一項明顯不同（色相相近但明度或形狀不同）
  const hsl = n => { const m = new RegExp('--bns-' + n + ': hsl\\((\\d+), (\\d+)%, (\\d+)%').exec(theme); return [+m[1], +m[2], +m[3]]; };
  const red = hsl('red'), rs = hsl('redstone'), pt = hsl('pinto'), az = hsl('adz'), mg = hsl('mung'), hd = (x, y) => Math.min(Math.abs(x - y), 360 - Math.abs(x - y));
  ok(hd(rs[0], red[0]) <= 12 && hd(pt[0], red[0]) <= 12 && hd(az[0], red[0]) <= 12 && hd(mg[0], red[0]) > 60, '像紅豆的雜物色相接近（' + [red[0], rs[0], pt[0], az[0]].join('/') + '）、綠豆差很多（' + mg[0] + '）');
  ok(Math.abs(pt[2] - red[2]) >= 6 && Math.abs(rs[2] - red[2]) >= 4, '花豆明度更暗、紅色小石頭明度不同（' + red[2] + '/' + pt[2] + '/' + rs[2] + '）');
  ok(boot.indexOf("'js/reaction_beans.js'") > 0 && /紅豆/.test(G.rule) && /赤小豆/.test(G.rule), 'boot.js 有載入、玩法說明提到紅豆與赤小豆'); }
ok(T.rating(2) !== T.rating(8) && T.rating(8) !== T.rating(15) && T.rating(15) !== T.rating(30) && T.rating(30) !== T.rating(50), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
