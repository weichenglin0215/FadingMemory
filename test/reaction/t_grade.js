// 「學歷階段」（js/grade.js：小學、中學、高中、大學、碩士、博士）與「👑我的強項」雷達圖（js/strengths.js）的純函式檢查：
//   · 六個階段的名稱與順序；闖關／答題遊戲（約八成）依 LEVEL_AT 的關數門檻分；其他遊戲依合理範圍 min～max 粗估；遊戲自己訂的門檻 st 優先
//   · 全部 194 款遊戲：成績越好、階段不會變低（單調）；沒有成績回傳 −1
//   · 分類的階段（byCategory）：每個分類取階段最高的那一款；**刪遊戲、改分類、增減分類之後結果跟著變**（分類與遊戲清單是傳進來的，不寫死在 grade.js）
//   · 雷達圖的幾何（axisPoints／polygon）；結算彈窗／選單格子／強項彈窗用同一套階段
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../') + '/';
const { game } = require('./load.js');
const { loadAllGames } = require('../leaderboard/all_games.cjs');
let bad = 0, total = 0; const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };
const Grade = global.Grade;
require(ROOT + 'js/strengths.js');       // 雷達圖（只用裡面的純函式；畫 SVG 的部分要有 DOM，由瀏覽器實測 browser_menu_grade.mjs 檢查）

// ── 名稱與順序 ──
ok(Grade.NAMES.join('、') === '小學、中學、高中、大學、碩士、博士', '六個階段（玩家指定）：' + Grade.NAMES.join('、'));
ok(Grade.nameOf(0) === '小學' && Grade.nameOf(5) === '博士' && Grade.nameOf(-1) === '' && Grade.nameOf(6) === '', 'nameOf：0～5 有名稱，其他是空字串');
ok(Grade.LEVEL_AT.length === 6 && Grade.FRAC_AT.length === 6 && Grade.LEVEL_AT.every((v, i, a) => i === 0 || v > a[i - 1]) && Grade.FRAC_AT.every((v, i, a) => i === 0 || v > a[i - 1]), '兩組門檻都是 6 個、由小到大');

// ── 闖關／答題遊戲：依關數 ──
{ const lv = { better: 'max', decimals: 0, format: '{v} 關', min: 1, max: 90 };
  const at = (v) => Grade.stage(lv, v);
  const want = [[1, 0], [4, 0], [5, 1], [9, 1], [10, 2], [14, 2], [15, 3], [19, 3], [20, 4], [29, 4], [30, 5], [90, 5]];
  want.forEach(([v, s]) => ok(at(v) === s, '闖關遊戲第 ' + v + ' 關 → ' + Grade.nameOf(s) + '（實際 ' + Grade.nameOf(at(v)) + '）'));
  ok(Grade.stage({ better: 'max', decimals: 0, format: '第 {v} 關', min: 1, max: 200 }, 12) === 2 && Grade.stage({ better: 'max', decimals: 0, format: '{v} 題', min: 1, max: 500 }, 22) === 4, '「第 N 關」「N 題」也算闖關／答題遊戲');
  ok(Grade.stage(lv, 0) === 0, '成績沒到第一個門檻也是最低階（玩過了）'); }
// ── 沒有成績、不認識的遊戲 ──
ok(Grade.stage({ better: 'max', decimals: 0, format: '{v} 關', min: 1, max: 90 }, null) === -1 && Grade.stage({ better: 'max', format: '{v} 關' }, NaN) === -1 && Grade.stage({ better: 'max', format: '{v} 關' }, undefined) === -1 && Grade.stage({ better: 'max', format: '{v} 關' }, Infinity) === -1, '沒有成績（null／NaN／無限大）→ −1');
ok(Grade.stage(null, 10) === -1 && Grade.stage(undefined, 10) === -1 && Grade.stageById('這款不存在', 10) === -1, '沒有規格（不認識的遊戲）→ −1');
// ── 遊戲自己訂的門檻 st ──
{ const mx = { better: 'max', decimals: 0, format: '{v} 個', min: 1, max: 1000, st: [1, 10, 20, 40, 80, 160] };
  ok(Grade.stage(mx, 1) === 0 && Grade.stage(mx, 10) === 1 && Grade.stage(mx, 39) === 2 && Grade.stage(mx, 40) === 3 && Grade.stage(mx, 160) === 5 && Grade.stage(mx, 1000) === 5, '越大越好的 st：達到第幾個門檻就是第幾階段');
  const mn = { better: 'min', decimals: 4, format: '{v} 秒', min: 0, max: 60, st: [10, 5, 3, 2, 1, 0.5] };
  ok(Grade.stage(mn, 20) === 0 && Grade.stage(mn, 10) === 0 && Grade.stage(mn, 4) === 1 && Grade.stage(mn, 2.5) === 2 && Grade.stage(mn, 0.5) === 5 && Grade.stage(mn, 0.1) === 5, '越小越好的 st（由大到小）：成績越小階段越高');
  ok(Grade.stage({ better: 'max', decimals: 0, format: '{v} 關', st: [1, 2, 3] }, 50) === 5, 'st 不是 6 個就忽略（照闖關遊戲算：第 50 關 → 博士）'); }
// ── 其他遊戲（依合理範圍）：越好、階段不會變低 ──
{ const specs = [
    { better: 'min', decimals: 4, format: '{v} 秒', min: 0, max: 60 }, { better: 'min', decimals: 4, format: '{v}%', min: 0, max: 300 }, { better: 'min', decimals: 4, format: '{v} 秒', min: 1.5, max: 600 },
    { better: 'max', decimals: 0, format: '{v} 個', min: 1, max: 1000 }, { better: 'max', decimals: 4, format: '{v}%', min: 0, max: 100 }, { better: 'max', decimals: 4, format: '{v} 分', min: 0.0001, max: 1000 }, { better: 'max', decimals: 0, format: '{v}', min: 1, max: 130000 }];
  specs.forEach(spec => {
    let prev = -1, mono = true, first = null, last = null;
    for (let i = 0; i <= 200; i++) {
      const t = i / 200, v = spec.better === 'min' ? spec.max - (spec.max - spec.min) * t : spec.min + (spec.max - spec.min) * t * t;     // 成績由差到好
      const s = Grade.stage(spec, v); if (i === 0) first = s; last = s; if (s < prev) mono = false; prev = s; if (!(s >= 0 && s <= 5)) mono = false;
    }
    ok(mono && last === 5 && first <= 1, spec.better + ' ' + spec.format + '（' + spec.min + '～' + spec.max + '）：成績越好階段越高（' + first + '→' + last + '）');
  });
  ok(Grade.fraction({ better: 'max', min: 1, max: 100 }, 1) === 0 && Grade.fraction({ better: 'max', min: 1, max: 100 }, 100) === 1 && Grade.fraction({ better: 'min', min: 0, max: 60 }, 0) === 1 && Grade.fraction({ better: 'min', min: 0, max: 60 }, 60) === 0, 'fraction：兩端是 0 與 1');
  ok(Grade.fraction({ better: 'max' }, 5) === null && Grade.stage({ better: 'max', decimals: 0, format: '{v} 個' }, 5) === 0, '沒有合理範圍：fraction 是 null，階段是最低階'); }
// ── 全部 194 款遊戲 ──
{ const games = loadAllGames(); let level = 0, other = 0;
  const specsJs = fs.readFileSync(ROOT + 'js/score_specs.js', 'utf8'); global.window.FM_SCORE_SPECS = undefined; new Function('window', specsJs)(global.window);
  const specs = global.window.FM_SCORE_SPECS;
  ok(Object.keys(specs).length === games.length, 'score_specs.js 有 ' + Object.keys(specs).length + ' 款（遊戲 ' + games.length + ' 款）');
  games.forEach(g => {
    const s = g.score, sp = specs[g.id];
    ok(sp && sp.better === s.better && sp.min === s.min && sp.max === s.max && (sp.format === s.format) && JSON.stringify(sp.st) === JSON.stringify(s.st), g.id + '：score_specs.js 的 better／min／max／format／st 跟遊戲檔案一致');
    if (Grade.isLevelLike(s)) level++; else other++;
    let prev = -1, mono = true;
    for (let i = 0; i <= 120; i++) {
      const t = i / 120, v = s.better === 'min' ? s.max - (s.max - s.min) * t : s.min + (s.max - s.min) * t;
      const st = Grade.stage(s, v); if (st < prev || st < 0 || st > 5) mono = false; prev = st;
    }
    ok(mono, g.id + '：成績由差到好，階段不會變低、都在 0～5（' + s.format + ' ' + s.min + '～' + s.max + '）');
    ok(Grade.stage(s, null) === -1 && Grade.stageById(g.id, s.better === 'min' ? s.min : s.max) >= 0, g.id + '：沒成績 −1；最好的成績有階段');
  });
  ok(level >= 140, '闖關／答題遊戲有 ' + level + ' 款（其他 ' + other + ' 款走合理範圍的粗估）'); }

// ── 分類的分數（byCategory）：總分 ÷ 款數 ──
{ const cp = Grade.categoryPoints;
  ok(cp(60, 10) === 6, '玩家的例子：60 總分 / 10 款 → 6 分（博士）');
  ok(cp(0, 10) === 0, '一款都沒玩過（0 分）→ 0（都沒玩過）');
  ok(cp(1, 10) === 1 && cp(4, 10) === 1 && cp(5, 10) === 1 && cp(10, 10) === 1 && cp(14, 10) === 1, '1 分或不到 1 分（0.1、0.4、0.5、1.0、1.4）都算小學');
  ok(cp(15, 10) === 2 && cp(20, 10) === 2 && cp(24, 10) === 2 && cp(25, 10) === 3, '四捨五入：1.5→2、2.4→2、2.5→3（高中）');
  ok(cp(34, 10) === 3 && cp(35, 10) === 4 && cp(55, 10) === 6 && cp(54, 10) === 5 && cp(999, 10) === 6, '3.4→3、3.5→4、5.5→6、5.4→5；最多 6');
  ok(cp(5, 0) === 0, '分類沒有遊戲（分母 0）不會出錯'); }
{ const tabs = [{ id: 'all', name: '全部' }, { id: 'recent', name: '最近' }, { id: 'a', name: '甲' }, { id: 'b', name: '乙' }, { id: 'c', name: '丙' }, { id: 'd', name: '丁' }];
  const cells = [{ id: 'g1', cat: 'a' }, { id: 'g2', cat: 'a' }, { id: 'g3', cat: 'b' }, { id: 'g4', cat: 'c' }, { id: 'g5', cat: 'c' }];     // 丁（d）沒有任何遊戲
  const spec = { better: 'max', decimals: 0, format: '{v} 關', min: 1, max: 90 }, specFn = () => spec;
  const bests = { g1: 4, g2: 21, g3: 10, g5: 1, gOld: 99 };                                  // gOld：已經刪掉的遊戲（還留在玩家手機裡）；g4 沒玩過
  const bestFn = (id) => (id in bests ? bests[id] : null);
  const rows = Grade.byCategory(tabs, cells, bestFn, specFn);
  ok(rows.map(r => r.id).join() === 'a,b,c', '分類：略過「全部」「最近」；沒有遊戲的分類（丁）不列出：' + rows.map(r => r.id).join());
  const r = (id) => rows.filter(x => x.id === id)[0];
  ok(r('a').sum === 1 + 5 && r('a').count === 2 && r('a').value === 3 && r('a').stage === 2 && r('a').played === 2 && r('a').avg === 3, '甲：小學 1 分＋碩士 5 分 ＝ 6 總分 / 2 款 → 3 分（高中）');
  ok(r('b').sum === 3 && r('b').count === 1 && r('b').value === 3, '乙：第 10 關（高中 3 分）/ 1 款 → 高中');
  ok(r('c').sum === 1 && r('c').count === 2 && r('c').played === 1 && r('c').value === 1 && r('c').stage === 0, '丙：只玩過一款（1 分）/ 2 款 ＝ 0.5 → 小學');
  ok(!rows.some(x => x.sum > 100), '已經刪掉的遊戲（不在清單裡）的紀錄不計分');
  const none = Grade.byCategory(tabs, cells, () => null, specFn);
  ok(none.length === 3 && none.every(x => x.stage === -1 && x.value === 0 && x.sum === 0 && x.played === 0 && x.count > 0), '都沒玩過：0 分（都沒玩過），分母照樣是該類款數');
  const cells2 = cells.filter(c => c.id !== 'g2'), rows2 = Grade.byCategory(tabs, cells2, bestFn, specFn);
  ok(rows2[0].count === 1 && rows2[0].sum === 1 && rows2[0].value === 1, '刪掉 g2 之後：甲剩 1 款、1 總分 → 小學');
  const cells3 = cells.map(c => c.id === 'g2' ? { id: 'g2', cat: 'b' } : c), rows3 = Grade.byCategory(tabs, cells3, bestFn, specFn);
  ok(rows3.filter(x => x.id === 'b')[0].sum === 8 && rows3.filter(x => x.id === 'b')[0].count === 2 && rows3.filter(x => x.id === 'b')[0].value === 4 && rows3.filter(x => x.id === 'a')[0].sum === 1, '把 g2 改成乙：乙 8 總分 / 2 款 → 大學；甲只剩 1 分');
  const tabs2 = tabs.filter(t => t.id !== 'b'), rows4 = Grade.byCategory(tabs2, cells, bestFn, specFn);
  ok(rows4.map(x => x.id).join() === 'a,c', '拿掉乙這個分類：只剩甲、丙');
  const tabs3 = tabs.concat([{ id: 'e', name: '戊' }]), cells4 = cells.concat([{ id: 'g6', cat: 'e' }]), rows5 = Grade.byCategory(tabs3, cells4, (id) => id === 'g6' ? 30 : bestFn(id), specFn);
  ok(rows5.length === 4 && rows5[3].id === 'e' && rows5[3].sum === 6 && rows5[3].count === 1 && rows5[3].value === 6, '新增戊分類、加一款遊戲（博士 6 分 / 1 款）→ 博士');
  const ten = [...Array(10)].map((_, i) => ({ id: 't' + i, cat: 'a' })), rows6 = Grade.byCategory([{ id: 'a', name: '記憶' }], ten, () => 30, specFn);
  ok(rows6[0].sum === 60 && rows6[0].count === 10 && rows6[0].value === 6, '10 款全部博士 → 60 總分 / 10 款 → 博士');
  const eight = Grade.byCategory([{ id: 'a', name: '甲' }], ten, (id) => Number(id.slice(1)) < 8 ? 10 : null, specFn);
  ok(eight[0].played === 8 && eight[0].sum === 24 && eight[0].count === 10 && eight[0].value === 2, '10 款玩過 8 款（每款高中 3 分）＝ 24 / 10 ＝ 2.4 → 中學（沒玩過的算 0 分）');
  ok(Grade.byCategory(null, null, bestFn, specFn).length === 0, '沒有分類／遊戲清單：空陣列（不會當掉）'); }

// ── 真正的選單：分類都有遊戲、全部玩到最好時每類都是博士 ──
{ const src = fs.readFileSync(ROOT + 'js/menu.js', 'utf8');
  const tabs = [...src.matchAll(/\{ id: '([a-z]+)', name: '([^']+)' \}/g)].map(m => ({ id: m[1], name: m[2] }));
  const cells = [...src.matchAll(/\{ id: '([a-z0-9]+)', name: '[^']+', cat: '([a-z]+)', img:/g)].map(m => ({ id: m[1], cat: m[2] }));
  const specs = global.window.FM_SCORE_SPECS;
  const rows = Grade.byCategory(tabs, cells, (id) => specs[id] ? (specs[id].better === 'min' ? specs[id].min : specs[id].max) : null, (id) => specs[id]);
  ok(rows.length === 7 && rows.every(x => x.count >= 5 && x.value === 6 && x.sum === 6 * x.count), '目前的選單：' + rows.length + ' 個分類（' + rows.map(x => x.name + x.count).join('、') + '），每款都最好時每類都是博士（總分＝6 × 款數）'); }

// ── 雷達圖幾何 ──
{ const FS = global.FMStrengths;
  ok(FS && typeof FS.axisPoints === 'function' && typeof FS.polygon === 'function', 'FMStrengths 有幾何函式');
  const ax = FS.axisPoints(7, 200, 170, 100, -90);
  ok(ax.length === 7 && Math.abs(ax[0].x - 200) < 1e-9 && Math.abs(ax[0].y - 70) < 1e-9, '第一條軸在正上方');
  ok(ax.every(p => Math.abs(Math.hypot(p.x - 200, p.y - 170) - 100) < 1e-9), '每條軸離圓心都是半徑 100');
  ok(Math.abs(Math.atan2(ax[1].y - 170, ax[1].x - 200) * 180 / Math.PI - (-90 + 360 / 7)) < 1e-9, '順時針排：第二條軸比第一條多轉 360/7 度');
  const poly = FS.polygon([6, 3, 0, 6, 1, 0, 2], 6, 200, 170, 100, -90);
  ok(poly.length === 7 && Math.abs(Math.hypot(poly[0].x - 200, poly[0].y - 170) - 100) < 1e-9 && Math.abs(Math.hypot(poly[1].x - 200, poly[1].y - 170) - 50) < 1e-9 && Math.hypot(poly[2].x - 200, poly[2].y - 170) < 1e-9, '值 6＝最外圈、值 3＝半徑一半、值 0＝圓心');
  ok(FS.polygon([9, -3], 6, 0, 0, 10, -90).every(p => Math.hypot(p.x, p.y) <= 10 + 1e-9), '超出範圍的值被限制在 0～最大');
  for (const n of [3, 4, 5, 7, 9, 12]) { const a = FS.axisPoints(n, 0, 0, 1, -90); ok(a.length === n && a.every(p => Math.abs(Math.hypot(p.x, p.y) - 1) < 1e-9), n + ' 個分類也畫得出 ' + n + ' 條軸'); }
  const m = FS.model({ tabs: [{ id: 'all', name: '全部' }, { id: 'x', name: '甲' }], cells: [{ id: 'q', cat: 'x' }], bestOf: () => 12, specOf: () => ({ better: 'max', decimals: 0, format: '{v} 關', min: 1, max: 90 }) });
  ok(m.length === 1 && m[0].name === '甲' && m[0].sum === 3 && m[0].count === 1 && m[0].stage === 2 && m[0].value === 3, 'model(env)：用傳進來的分類、遊戲、成績算（第 12 關 → 3 分 / 1 款 → 高中）');
  ok(FS.gradeName(0) === '都沒玩過' && FS.gradeName(1) === '小學' && FS.gradeName(6) === '博士', '分數 0＝「都沒玩過」、1～6＝小學～博士'); }

// ── 顏色（紅橙黃綠藍紫）與全畫面彈窗 ──
{ const theme = fs.readFileSync(ROOT + 'css/theme.css', 'utf8'), nav = fs.readFileSync(ROOT + 'css/menu_nav.css', 'utf8').replace(/[ \t]*\/\*[\s\S]*?\*\//g, ''), st = fs.readFileSync(ROOT + 'js/strengths.js', 'utf8');
  const hue = (n) => { const m = new RegExp('--c-grade-' + n + ': hsl\\((\\d+),').exec(theme); return m ? +m[1] : -1; };
  const h = [1, 2, 3, 4, 5, 6].map(hue);
  ok((h[0] < 12 || h[0] > 345) && h[1] >= 18 && h[1] <= 36 && h[2] >= 40 && h[2] <= 62 && h[3] >= 90 && h[3] <= 165 && h[4] >= 190 && h[4] <= 235 && h[5] >= 255 && h[5] <= 300, '六個階段的色相依序是紅、橙、黃、綠、藍、紫：' + h.join('、'));
  [1, 2, 3, 4, 5, 6].forEach(n => ok(new RegExp('\\.str-row__stage--g' + n + '\\s*\\{[^}]*var\\(--c-grade-' + n + '\\)').test(nav) && new RegExp('\\.str-grade--g' + n + '\\s*\\{[^}]*var\\(--c-grade-' + n).test(nav), '清單藥丸與雷達圖文字：第 ' + n + ' 階用 --c-grade-' + n));
  ok(/\.dlg\.dlg--strengths\s*\{[^}]*top:\s*0/.test(nav) && /\.dlg--strengths \.dlg__card\s*\{[^}]*max-width:\s*none[^}]*height:\s*100%/.test(nav) && !/\.dlg--strengths \.dlg__card\s*\{[^}]*border-radius:\s*0/.test(nav), '「我的強項」彈窗是全畫面（保留圓角）');
  ok(!/每類取玩得最好/.test(st) && !/str-note/.test(st) && /總分 \/ /.test(st), '「每類取玩得最好的一款…」說明拿掉了；清單寫「N 總分 / M 款」'); }
// ── 檔案接線 ──
{ const boot = fs.readFileSync(ROOT + 'js/boot.js', 'utf8'), kit = fs.readFileSync(ROOT + 'js/reaction_kit.js', 'utf8'), menu = fs.readFileSync(ROOT + 'js/menu.js', 'utf8'), nav = fs.readFileSync(ROOT + 'js/menu_nav.js', 'utf8');
  const page = (name) => { const i = boot.indexOf(name + ': {'); return boot.slice(i, i + 12000); };
  const menuP = boot.slice(boot.indexOf('menu: {'), boot.indexOf('menu: {') + 1500), reactP = boot.slice(boot.indexOf('reaction: {'), boot.indexOf('reaction: {') + 12000);
  ok(menuP.indexOf("'js/score_specs.js', 'js/grade.js', 'js/menu.js', 'js/strengths.js', 'js/menu_nav.js'") > 0, '主選單頁載入 score_specs.js → grade.js → menu.js → strengths.js → menu_nav.js');
  ok(reactP.indexOf("'js/grade.js', 'js/reaction_core.js'") > 0, '遊戲頁載入 grade.js（結算彈窗要用）');
  ok(/global\.Grade\.stage\(Reaction\.current\.score, o\.score\)/.test(kit) && /rx-result__stage/.test(kit), '結算彈窗（kit.result）：評價後面加上這一局成績的學歷階段');
  ok(/FMStrengths\.open/.test(menu) && /FMNav\.openScores/.test(menu) && /game-bar__tools/.test(menu), '選單列表標題列右邊有 🏆、👑 兩顆按鈕');
  ok(/dlg--scores dlg--top/.test(nav) && /dlg--strengths dlg--top/.test(fs.readFileSync(ROOT + 'js/strengths.js', 'utf8')), '兩個彈窗帶 dlg--top（疊在全螢幕選單上面）');
  const dcss = fs.readFileSync(ROOT + 'css/dialog.css', 'utf8').replace(/[ \t]*\/\*[\s\S]*?\*\//g, ''), mcss = fs.readFileSync(ROOT + 'css/menu.css', 'utf8').replace(/[ \t]*\/\*[\s\S]*?\*\//g, '');
  const z = (css, sel) => { const m = new RegExp(sel.replace(/\./g, '\\.') + '\\s*\\{[^}]*z-index:\\s*(\\d+)').exec(css); return m ? +m[1] : null; };
  const zTop = z(dcss, '.dlg--top'), zGame = z(mcss, '.game-dlg'), zSearch = 35;
  ok(zTop > zSearch && zTop > (zGame || 30), 'z-index：.dlg--top（' + zTop + '）高於選單列表（' + (zGame || 30) + '）與搜尋彈窗（' + zSearch + '）'); }
console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS ' + total);
process.exit(bad ? 1 : 0);
