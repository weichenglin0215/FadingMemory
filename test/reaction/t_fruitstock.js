// 水果進出貨（fruitstock）：水果的顏色不重複、每筆換算成顆數、收攤的答案、賣出不會超過攤上有的、難度階段（公斤、顏色、半公斤）、算式文字
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_fruitstock.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261105); const rnd = rng(SEED);

ok(G.id === 'fruitstock' && [...G.name].length <= 5 && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.min === 1 && G.score.max === 90, '登記資料');
ok(new Set(T.FRUITS.map(f => f.color)).size === T.FRUITS.length && new Set(T.FRUITS.map(f => f.name)).size === T.FRUITS.length, '每種水果的名稱、顏色都不一樣（「紅色的」才指得出是哪一種）');
// 換算
{
  const fr = [{ name: '蘋果', color: '紅色', perKg: 4 }, { name: '檸檬', color: '黃色', perKg: 8 }];
  ok(T.piecesOf({ f: 0, unit: 'pc', amt: 5 }, fr) === 5 && T.piecesOf({ f: 0, unit: 'kg', amt: 3 }, fr) === 12 && T.piecesOf({ f: 1, unit: 'half', amt: 0.5 }, fr) === 4, '顆、公斤、半公斤');
  ok(T.eventText({ dir: 1, f: 0, how: 'name', unit: 'kg', amt: 2 }, fr) === '進貨 蘋果 2 公斤' && T.eventText({ dir: -1, f: 1, how: 'color', unit: 'pc', amt: 6 }, fr) === '賣出 黃色的 6 顆' && T.eventText({ dir: -1, f: 1, how: 'name', unit: 'half', amt: 0.5 }, fr) === '賣出 檸檬 半公斤', '文字');
}
let kg = 0, color = 0, half = 0;
for (let lv = 1; lv <= 40; lv++) for (let k = 0; k < 25; k++) {
  const p = T.makePuzzle(lv, rnd), sz = T.sizeFor(lv);
  ok(p.fruits.length === sz.kinds && p.events.length === sz.events, '第 ' + lv + ' 關：' + sz.kinds + ' 種、' + sz.events + ' 筆');
  ok(p.fruits.every((f, i) => p.events.some(e => e.f === i)), '每種水果至少有一筆');
  // 照順序重算：賣出的不超過當時有的、答案一致
  const now = p.start.slice(); let neg = false;
  p.events.forEach(e => { now[e.f] += e.dir * T.piecesOf(e, p.fruits); if (now[e.f] < 0) neg = true; });
  ok(!neg, '第 ' + lv + ' 關：賣出的不會超過攤上有的');
  ok(now.join() === p.answer.join() && T.finalCounts(p).join() === p.answer.join(), '答案＝早上＋進貨−賣出');
  p.events.forEach(e => {
    if (e.unit === 'kg') { kg++; ok(lv >= T.KG_FROM, '公斤從第 ' + T.KG_FROM + ' 關起'); }
    if (e.how === 'color') { color++; ok(lv >= T.COLOR_FROM, '顏色從第 ' + T.COLOR_FROM + ' 關起'); }
    if (e.unit === 'half') { half++; ok(lv >= T.HALF_FROM && p.fruits[e.f].perKg % 2 === 0, '半公斤：第 ' + T.HALF_FROM + ' 關起、只有每公斤偶數顆的水果'); }
  });
  ok(p.answer.every(a => Number.isInteger(a) && a >= 0 && a < 1000), '答案是 0～999 的整數（三位數鍵盤打得完）');
  const w = T.workOf(p, 0);
  ok(w.startsWith(p.fruits[0].name + '：' + p.start[0]) && w.endsWith('＝ ' + p.answer[0] + ' 顆'), '算式文字 ' + w);
}
ok(kg > 300 && color > 300 && half > 30, '公斤 ' + kg + '、顏色 ' + color + '、半公斤 ' + half + ' 都有出現');
ok(T.sizeFor(1).kinds === 2 && T.sizeFor(1).events === 3 && T.sizeFor(30).kinds === 5 && T.sizeFor(30).events === 10, '難度曲線');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
