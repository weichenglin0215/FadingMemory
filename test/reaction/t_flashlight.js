const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_flashlight.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261029); const rnd = rng(SEED);

// 難度曲線（玩家會自己調 RADIUS／TIME_S，測試跟著參數走）
ok(near(T.radiusFor(1), T.RADIUS[0]) && near(T.radiusFor(T.RAMP_LEVELS), T.RADIUS[1]) && near(T.radiusFor(60), T.RADIUS[1]), '光圈 ' + T.RADIUS[0] + ' → ' + T.RADIUS[1]);
for (let l = 2; l <= 60; l++) ok((T.RADIUS[1] <= T.RADIUS[0] ? T.radiusFor(l) <= T.radiusFor(l - 1) + 1e-12 : T.radiusFor(l) >= T.radiusFor(l - 1) - 1e-12) && (T.TIME_S[1] <= T.TIME_S[0] ? T.timeMs(l) <= T.timeMs(l - 1) : T.timeMs(l) >= T.timeMs(l - 1)), '單調 ' + l);
ok(near(T.radiusFor(13), (T.RADIUS[0] + T.RADIUS[1]) / 2), '中點（線性）');
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S[0] + ' → ' + T.TIME_S[1] + ' 秒');

// V1.32：圖案改成「一組一組長得很像的」：數字、形近的繁體字、零件數不同的圖形
const allIds = [];
T.FAMILIES.forEach(f => { if (f.kind === 'digit') return; allIds.push(...f.ids); });
ok(T.FAMILIES.every(f => f.tier >= 0 && f.tier <= 3) && [0, 1, 2, 3].every(t => T.FAMILIES.some(f => f.tier === t)), '每一級複雜度都有圖案');
ok(T.FAMILIES.filter(f => f.kind !== 'digit').every(f => f.ids.length >= 4 && new Set(f.ids).size === f.ids.length), '每一組至少 4 個、不重複');
ok(new Set(allIds).size === allIds.length, '不同組之間的圖案不重複（四個選項才不會來自兩組）：' + allIds.length + ' 個');
ok(allIds.filter(T.isChar).length >= 40 && allIds.filter(id => !!T.shapeOf(id)).length >= 20, '繁體字至少 40 個、圖形至少 20 個：' + allIds.filter(T.isChar).length + ' 字／' + allIds.filter(id => !!T.shapeOf(id)).length + ' 圖形');
ok(allIds.every(id => T.isChar(id) || T.shapeOf(id)), '每個 id 不是單一漢字就是圖形（p／s／g／f ＋ 零件數）');
for (const id of [...T.DIGITS, ...allIds]) { const s = T.picSvg(id); ok(s.startsWith('<svg') && s.endsWith('</svg>') && !/NaN|undefined|\?<\/text>/.test(s) && s.length > 60, '圖案 ' + id); ok(T.nameOf(id).length >= 1 && T.nameOf(id) !== id || T.isChar(id), '名稱 ' + id); }
ok(T.nameOf('p6') === '正六邊形' && T.nameOf('s12') === '十二角星' && T.nameOf('g10') === '十個齒的齒輪' && T.nameOf('f9') === '九片花瓣的花' && T.nameOf('情') === '情' && T.nameOf('5') === '數字 5', '名稱');
// 圖形的畫法：零件數真的跟 id 一樣多
ok((T.picSvg('p7').match(/,/g) || []).length === 7 && (T.picSvg('s9').match(/,/g) || []).length === 18, '正 7 邊形有 7 個頂點、9 角星有 18 個點');
ok((T.picSvg('g12').match(/<rect/g) || []).length === 12 && (T.picSvg('f13').match(/<ellipse/g) || []).length === 13, '12 齒齒輪有 12 個齒、13 瓣的花有 13 片花瓣');
// 相似數字表：對稱性不要求，但每個數字的相似表要有 ≥3 個、不含自己、都是數字
T.DIGITS.forEach(d => ok(T.SIMILAR[d].length >= 3 && !T.SIMILAR[d].includes(d) && T.SIMILAR[d].every(x => T.DIGITS.includes(x)), '相似表 ' + d));
ok(T.DIGITS.every(d => T.tierOf(d) === 0) && T.tierOf('土') === 0 && T.tierOf('末') === 1 && T.tierOf('情') === 2 && T.tierOf('鑑') === 3 && T.tierOf('p6') === 1 && T.tierOf('g9') === 2 && T.tierOf('f13') === 3, 'tierOf');

// 複雜度隨關卡上升：平均複雜度單調（容許浮動）、第 1 關最簡單、到頂最複雜
{ const avg = l => { let t = 0; for (let i = 0; i < 1500; i++) t += T.makeLevel(l, rnd).tier; return t / 1500; };
  const a1 = avg(1), aMid = avg(Math.round(T.RAMP_LEVELS / 2)), aTop = avg(T.RAMP_LEVELS), a60 = avg(60);
  ok(a1 < aMid && aMid < aTop, '平均複雜度隨關卡上升：第 1 關 ' + a1.toFixed(2) + '、中間 ' + aMid.toFixed(2) + '、到頂 ' + aTop.toFixed(2));
  ok(a1 < 0.5 && aTop > 2.5 && Math.abs(a60 - aTop) < 0.15, '一開始幾乎都是最簡單的、到頂幾乎都是最複雜的：' + a1.toFixed(2) + ' / ' + aTop.toFixed(2) + ' / ' + a60.toFixed(2));
  let prev = -1; for (let l = 1; l <= T.RAMP_LEVELS; l += 4) { const v = avg(l); ok(v >= prev - 0.12, '複雜度不會倒退 lv' + l + '：' + v.toFixed(2)); prev = v; } }
// 複雜度：tier 越高，字的字形越複雜——用「字的部件數」不可靠，這裡檢查程式把各級圖案分開、而且第 1 關只出現 tier 0～1（浮動 ±TIER_JITTER）
for (let i = 0; i < 800; i++) ok(T.makeLevel(1, rnd).tier <= Math.ceil(T.TIERS[0] + T.TIER_JITTER), '第 1 關只出現最簡單的幾級');
// 整關：四個選項不重複、含答案、都來自同一組很像的圖案、答案位置正確
const ansPos = {}, kinds = { digit: 0, char: 0, shape: 0 };
for (let i = 0; i < 6000; i++) {
  const lv = 1 + (i % 60), q = T.makeLevel(lv, rnd);
  ok(q.options.length === 4 && new Set(q.options).size === 4, '四個不同選項');
  ok(q.options[q.answer] === q.target, '答案位置');
  ok(q.options.every(o => T.tierOf(o) === q.tier), '選項同一級：' + q.options + ' tier ' + q.tier);
  if (T.isDigit(q.target)) { kinds.digit++; ok(q.options.every(T.isDigit), '數字選項都是數字'); }
  else { const fam = T.FAMILIES.find(f => f.ids && f.ids.indexOf(q.target) >= 0); ok(fam && q.options.every(o => fam.ids.indexOf(o) >= 0), '四個選項來自同一組很像的圖案：' + q.options); kinds[T.isChar(q.target) ? 'char' : 'shape']++; }
  ansPos[q.answer] = (ansPos[q.answer] || 0) + 1;
}
ok(Object.keys(ansPos).length === 4 && Math.min(...Object.values(ansPos)) > 1100, '答案位置均勻 ' + JSON.stringify(ansPos));
ok(kinds.digit > 20 && kinds.char > 2500 && kinds.shape > 700, '三種圖案都常出現 ' + JSON.stringify(kinds));
// 數字選項要多半是長得像的
let sim = 0, tot = 0; for (let i = 0; i < 4000; i++) { const q = T.makeLevel(1, rnd); if (!T.isDigit(q.target)) continue; q.options.forEach(o => { if (o !== q.target) { tot++; if (T.SIMILAR[q.target].includes(o)) sim++; } }); } ok(tot > 100 && sim / tot > 0.9, '數字選項長得像的比例 ' + (sim / tot).toFixed(3));
// 掃過範圍計算
const box = { x: 0, y: 0, w: 100, h: 100 };
ok(T.coverage([], 10, box) === 0 && T.coverage([{ x: 50, y: 50 }], 1000, box) === 1, '空與全部');
{ const c = T.coverage([{ x: 50, y: 50 }], 30, box); ok(Math.abs(c - Math.PI * 900 / 10000) < 0.03, '圓的面積比例 ' + c.toFixed(4)); }
ok(Math.abs(T.coverage([{ x: 0, y: 0 }], 50, box) - Math.PI / 16) < 0.01, '角落四分之一圓');
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(10) && T.rating(10) !== T.rating(20) && T.rating(20) !== T.rating(30), '評語分級');
// V1.29：被光照到的圖案要有填色（<g> 取出內容後外層 svg 的 fill 帶不過來，不設就是黑底黑字，拖曳只看到一片黑）
{ const css = require('fs').readFileSync(require('path').resolve(__dirname, '../../css/reaction5.css'), 'utf8').split(/\s+/).join(' '), i = css.indexOf('.flt-pic {');
  ok(i > 0 && css.slice(i, i + 120).indexOf('fill: currentColor') > 0 && css.slice(i, i + 120).indexOf('color: var(--flt-pic)') > 0, '.flt-pic 有 fill: currentColor 與亮色'); }
// 規則文字、原始碼：愛心、星星…這些舊的剪影全拿掉
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_flashlight.js'), 'utf8');
  ok(G.rule.indexOf('長得非常像') > 0 && G.rule.indexOf('筆劃') > 0, '規則文字說明圖案很像、越後面筆劃越多');
  ok(src.indexOf("'heart'") < 0 && src.indexOf('umbrella') < 0 && src.indexOf('SYMBOLS') < 0 && src.indexOf('poolFor') < 0, '舊的剪影符號全部拿掉'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
