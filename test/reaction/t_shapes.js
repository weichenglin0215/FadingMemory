// 形形色色：V1.21.0 新增「筆畫多、長得像的中文字」（hard:true），第 4 關起出現、機率隨關卡增加
const { game } = require('./load.js');
global.UI.esc = (s) => s;
const G = game('reaction_shapes.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const hard = T.PAIRS.filter(p => p.hard), easy = T.PAIRS.filter(p => !p.hard);
ok(hard.length >= 12, '筆畫多的中文字組合至少 12 組：' + hard.length);
ok(hard.every(p => p.type === 'text' && p.colorable && p.a !== p.b && /^[\u4e00-\u9fff]$/.test(p.a) && /^[\u4e00-\u9fff]$/.test(p.b)), '每一組都是兩個不同的單一中文字、可套顏色');
ok(new Set(hard.map(p => p.a + p.b)).size === hard.length, '沒有重複的組合');
ok(easy.length >= 20 && easy.some(p => p.type === 'svg') && easy.some(p => p.type === 'emoji'), '原本的題材都還在');
// 機率曲線：1～3 關 0；第 4 關 0.15；線性到第 20 關 0.55
ok(T.hardChance(1) === 0 && T.hardChance(3) === 0, '前三關不抽筆畫多的字');
ok(Math.abs(T.hardChance(4) - 0.15) < 1e-9 && Math.abs(T.hardChance(20) - 0.55) < 1e-9 && T.hardChance(40) === 0.55, '機率 0.15 → 0.55：' + T.hardChance(4) + ', ' + T.hardChance(20));
for (let l = 4; l < 20; l++) ok(T.hardChance(l + 1) > T.hardChance(l), '機率線性增加 ' + l);
// 實際抽樣
function share(level, n) { let k = 0; for (let i = 0; i < n; i++) if (T.pickPair(T.PAIRS, level).hard) k++; return k / n; }
ok(share(1, 3000) === 0 && share(3, 3000) === 0, '第 1～3 關抽樣沒有筆畫多的字');
const s20 = share(20, 6000); ok(s20 > 0.5 && s20 < 0.6, '第 20 關約 55% 抽到筆畫多的字：' + s20.toFixed(3));
const s8 = share(8, 6000); ok(s8 > 0.2 && s8 < 0.32, '第 8 關約 25%：' + s8.toFixed(3));
// COLORABLE（混合考驗用）也抽得到
let sawHard = false; for (let i = 0; i < 400; i++) if (T.pickPair(T.COLORABLE, 20).hard) sawHard = true; ok(sawHard, '混合考驗的題庫也會抽到');
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
