// 共用資料庫「長得很像的中文字」（js/similar_chars.js）的檢查：資料格式、筆劃一致、查詢函式，
// 以及哪些遊戲真的改用它（不再各自寫一份字表）
const { game } = require('./load.js');
const fs = require('fs'), path = require('path');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SC = global.SimilarChars;
ok(SC && typeof SC.groups === 'function', 'SimilarChars 有載入');

// ── 原始資料：每一行都是「字＋筆劃數」一個接一個；同一個字每次寫的筆劃數都一樣 ──
const seen = {}, lines = new Set();
SC.RAW.forEach((line, i) => {
  ok(/^([一-鿿]\d{1,2})+$/.test(line), '第 ' + i + ' 行格式（字＋筆劃數）：' + line);
  const pairs = [...line.matchAll(/([一-鿿])(\d+)/g)].map(m => [m[1], Number(m[2])]);
  ok(pairs.length >= 2, '每組至少 2 個字：' + line);
  ok(new Set(pairs.map(p => p[0])).size === pairs.length, '同一組裡沒有重複的字：' + line);
  pairs.forEach(([c, n]) => {
    ok(n >= 1 && n <= 35, c + ' 的筆劃數合理：' + n);
    if (seen[c] !== undefined) ok(seen[c] === n, c + ' 在不同組寫的筆劃數不一樣：' + seen[c] + ' vs ' + n);
    seen[c] = n;
  });
  const key = pairs.map(p => p[0]).sort().join('');
  ok(!lines.has(key), '沒有一模一樣的兩組：' + line); lines.add(key);
});
ok(SC.RAW.length >= 100, '至少 100 組：' + SC.RAW.length);

// ── 查詢函式 ──
const all = SC.groups();
ok(all.length === SC.RAW.length && all.length === SC.count(), 'groups() 回傳全部的組');
for (let i = 1; i < all.length; i++) ok(all[i].s >= all[i - 1].s, '依平均筆劃由少到多排好 ' + i);
all.forEach(g => ok(Math.abs(g.s - g.chars.reduce((a, c) => a + SC.strokes(c), 0) / g.chars.length) < 1e-9, '平均筆劃算對 ' + g.chars.join('')));
ok(SC.groups({ minSize: 5 }).every(g => g.chars.length >= 5) && SC.groups({ minSize: 5 }).length >= 25, 'minSize 篩選（5 個字以上的組 ' + SC.groups({ minSize: 5 }).length + ' 組）');
ok(SC.groups({ maxStrokes: 6 }).every(g => g.s <= 6) && SC.groups({ minStrokes: 19 }).every(g => g.s >= 19), '筆劃範圍篩選');
ok(SC.groups({ maxStrokes: 6 }).length >= 12 && SC.groups({ minStrokes: 19 }).length >= 15, '筆劃少、筆劃多的組都夠多：' + SC.groups({ maxStrokes: 6 }).length + '／' + SC.groups({ minStrokes: 19 }).length);
{ const g = SC.groups(); g[0].chars.push('X'); ok(SC.groups()[0].chars.indexOf('X') < 0, '回傳的是複本，改了不會弄壞資料庫'); }
const flat = SC.chars();
ok(new Set(flat).size === flat.length && flat.length === Object.keys(seen).length, 'chars()：每個字一次、全部都在（' + flat.length + ' 個字）');
ok(SC.near('己').includes('已') && SC.near('己').includes('巳') && !SC.near('己').includes('己'), 'near(己) 有 已、巳，不含自己');
ok(SC.near('王').includes('士') && SC.near('王').includes('玉'), 'near(王) 會合併好幾組（土士工王、王玉主）');
ok(SC.near('龘').length === 0 && SC.strokes('龘') === undefined, '查不到的字');
ok(SC.pairs().every(p => p.a !== p.b && p.st === (SC.strokes(p.a) + SC.strokes(p.b)) / 2), 'pairs()：每組最像的前兩個字');

// ── 這些遊戲改用共用資料庫（不再各自寫字表） ──
const ROOT = path.resolve(__dirname, '../../') + '/';
['alignchar', 'flashlight', 'glyphspin', 'clearer', 'scratch', 'shapes'].forEach(id => {
  const src = fs.readFileSync(ROOT + 'js/reaction_' + id + '.js', 'utf8');
  ok(src.indexOf('SimilarChars.') > 0, id + ' 用到 SimilarChars');
  ok(!/\[\s*'己',\s*'已'|'辨', '辦'|'辨', '辯'|a: '驚', b: '警'/.test(src), id + ' 裡沒有留下舊的字表');
});
const T = {
  alignchar: game('reaction_alignchar.js').test, flashlight: game('reaction_flashlight.js').test, glyphspin: game('reaction_glyphspin.js').test,
  clearer: game('reaction_clearer.js').test, scratch: game('reaction_scratch.js').test, shapes: game('reaction_shapes.js').test
};
const inDb = c => SC.strokes(c) !== undefined;
ok(T.alignchar.GROUPS.flat().every(inDb) && T.alignchar.GROUPS.length >= 30, '對準才看到的字群來自資料庫（' + T.alignchar.GROUPS.length + ' 組）');
ok(T.flashlight.FAMILIES.filter(f => f.ids && /[一-鿿]/.test(f.ids[0])).length >= 40, '手電筒猜圖的字組來自資料庫');
ok(T.glyphspin.FAMILIES.every(f => f.c.every(inDb)) && T.glyphspin.FAMILIES.length === SC.count(), '鏡中旋轉字用了資料庫的每一組');
ok(T.clearer.FAMILIES.flat().every(inDb), '越看越清楚的 10 組來自資料庫：' + T.clearer.FAMILIES.map(f => f.join('')).join(' '));
ok(T.scratch.CHARS.length === flat.length, '刮刮樂推理的字池＝資料庫全部的字');
ok(T.shapes.PAIRS.filter(p => p.type === 'text' && /[一-鿿]/.test(p.a) && SC.near(p.a).includes(p.b)).length >= 90, '形形色色的形近字組合來自資料庫');
// 載入順序：boot.js 裡 similar_chars.js 要在這幾款遊戲之前
{ const boot = fs.readFileSync(ROOT + 'js/boot.js', 'utf8'), i = boot.indexOf("'js/similar_chars.js'");
  ok(i > 0 && ['shapes', 'scratch', 'glyphspin', 'clearer', 'flashlight', 'alignchar'].every(id => boot.indexOf("'js/reaction_" + id + ".js'") > i), 'boot.js：similar_chars.js 先載入'); }

console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
