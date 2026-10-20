// 迴轉壽司（sushi，企劃 393）的純函式檢查：難度線性、一圈的盤子（預算＝一組盤子的總和、保證有解、獨立窮舉驗證）、輸送帶的位置與時間、判定、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_sushi.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261216), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（線性）──
ok(T.platesFor(1) === T.PLATES[0] && T.platesFor(T.RAMP_LEVELS) === T.PLATES[1] && T.platesFor(99) === T.PLATES[1], '每圈盤子數 ' + T.PLATES);
ok(T.pickFor(1) === T.PICK[0] && T.pickFor(T.RAMP_LEVELS) === T.PICK[1], '要湊的盤子數 ' + T.PICK);
ok(near(T.gapFor(1), T.GAP_S[0]) && near(T.gapFor(T.RAMP_LEVELS), T.GAP_S[1]) && T.speedFor(1) === T.SPEED[0] && T.speedFor(T.RAMP_LEVELS) === T.SPEED[1], '間隔／速度');
for (let n = 2; n <= T.RAMP_LEVELS + 2; n++) ok(T.platesFor(n) >= T.platesFor(n - 1) && T.pickFor(n) >= T.pickFor(n - 1) && T.gapFor(n) <= T.gapFor(n - 1) && T.speedFor(n) >= T.speedFor(n - 1), '單調 ' + n);
{ const d = []; for (let n = 2; n <= T.RAMP_LEVELS; n++) d.push(T.speedFor(n) - T.speedFor(n - 1)); ok(Math.max(...d) - Math.min(...d) <= 1, '速度線性增加：每關 +' + Math.min(...d) + '～+' + Math.max(...d)); }
ok(T.pricesFor(1).join() === '30,40,60,100' && T.pricesFor(9).join() === '30,40,60,100' && T.pricesFor(10).join() === '30,40,50,60,100' && T.LATER_FROM === 10, '價目表：第 10 關起多 50 元的綠盤');
ok(T.COLOR_OF[30] === 'white' && T.COLOR_OF[40] === 'red' && T.COLOR_OF[60] === 'blue' && T.COLOR_OF[100] === 'gold' && T.COLOR_OF[50] === 'green', '白 30、紅 40、藍 60、金 100、綠 50（使用者企劃）');
for (let lv = 1; lv <= 30; lv++) { ok(T.pickFor(lv) <= T.platesFor(lv) - 2, '解的大小不超過盤子數 − 2'); ok(T.speedFor(lv) * T.gapFor(lv) >= T.PLATE_D * 1.2, '盤子之間的間距 ' + (T.speedFor(lv) * T.gapFor(lv)).toFixed(0) + ' px ≥ 1.2 倍盤子直徑（不會擠在一起）'); ok((472 + T.PLATE_D) / T.speedFor(lv) >= 1.5, '每個盤子在畫面上至少 1.5 秒（來得及點）：' + ((472 + T.PLATE_D) / T.speedFor(lv)).toFixed(2)); }

// ── 一圈：全部關卡掃一遍 ──
function brute(prices, target) { const n = prices.length; let c = 0; for (let mask = 0; mask < (1 << n); mask++) { let s = 0; for (let i = 0; i < n; i++) if (mask & (1 << i)) s += prices[i]; if (s === target) c++; } return c; }
const ST = { n: 0, minSol: 1e9, maxSol: 0, minT: 1e9, maxT: 0, brute: 0, targets: new Set() };
for (let lv = 1; lv <= 40; lv++) for (let rep = 0; rep < 80; rep++) {
  const q = T.makeLevel(lv, rnd); ST.n++;
  const L = T.platesFor(lv), m = T.pickFor(lv);
  ok(q.plates.length === L && q.solution.length === m && q.level === lv, '盤子 ' + L + '、解 ' + m);
  ok(q.plates.every(p => T.pricesFor(lv).includes(p.price) && ['salmon', 'egg', 'shrimp'].includes(p.sushi)), '價錢在價目表裡');
  ok(q.solution.every((k, i) => k >= 0 && k <= L - 2 && (i === 0 || k > q.solution[i - 1])), '解的盤子編號遞增、不含最後一個：' + q.solution.join());
  ok(q.target === q.solution.reduce((s, k) => s + q.plates[k].price, 0), '預算 = 解那組盤子的總和');
  ST.minT = Math.min(ST.minT, q.target); ST.maxT = Math.max(ST.maxT, q.target); ST.targets.add(q.target);
  // 解分散在整圈：前半、後半都有（m ≥ 3 時）
  if (m >= 3) ok(q.solution[0] <= (L - 1) / m + 1 && q.solution[m - 1] >= (L - 1) - (L - 1) / m - 1, '解的盤子分散在整圈');
  const cs = T.countSolutions(q); ST.minSol = Math.min(ST.minSol, cs); ST.maxSol = Math.max(ST.maxSol, cs); ok(cs >= 1, '至少有一種湊法');
  if (L <= 14 && rep < 20) { ST.brute++; ok(brute(q.plates.map(p => p.price), q.target) === cs, 'DP 算的湊法數 ' + cs + ' = 窮舉（' + L + ' 盤）'); }
  // 解那組盤子拿了剛好 ok；少拿一個 few、多拿一個非解 many
  const set = new Set(q.solution); ok(T.judge(q, set).result === 'ok' && T.judge(q, set).sum === q.target, '拿解那組：剛好');
  const fewSet = new Set(q.solution.slice(1)); ok(T.judge(q, fewSet).result === 'few' && T.judge(q, fewSet).diff === -q.plates[q.solution[0]].price, '少拿一個：少了那個盤子的價錢');
  const extra = q.plates.findIndex((p, i) => !set.has(i)); const manySet = new Set(q.solution.concat([extra])); ok(T.judge(q, manySet).result === 'many' && T.judge(q, manySet).diff === q.plates[extra].price, '多拿一個：多了那個盤子的價錢');
  ok(T.judge(q, new Set()).result === 'few' && T.judge(q, new Set()).sum === 0, '一個都沒拿');
  // 輸送帶：一圈的時間夠最後一個盤子走出畫面
  const W = 472; ok(q.lap === T.lapMs(L, q.gap, q.speed, W) && T.plateX(L - 1, q.lap / 1000, q.gap, q.speed, W) < -T.PLATE_D / 2 && q.lap / 1000 < 80, '一圈 ' + q.lap + ' 毫秒，最後一個盤子已經離開畫面');
}
console.log('共 ' + ST.n + ' 圈；預算 ' + ST.minT + '～' + ST.maxT + '（不同的預算 ' + ST.targets.size + ' 種）；湊法數 ' + ST.minSol + '～' + ST.maxSol + '；窮舉對照 ' + ST.brute + ' 圈');
ok(ST.maxT >= 600 && ST.minT >= 90, '預算隨難度變大（最大 ' + ST.maxT + '）');
// 盤子位置
{ const W = 472, gap = 1.5, v = 130;
  ok(near(T.plateX(0, T.LEAD_S, gap, v, W), W + T.PLATE_D / 2) && near(T.plateX(3, T.LEAD_S + 3 * gap, gap, v, W), W + T.PLATE_D / 2) && near(T.plateX(0, T.LEAD_S + 1, gap, v, W), W + T.PLATE_D / 2 - v), '盤子從右邊外面進來、以速度 v 往左');
  ok(!T.visibleAt(0, T.LEAD_S - 0.2, gap, v, W) && T.visibleAt(0, T.LEAD_S + 0.5, gap, v, W) && T.visibleAt(0, T.LEAD_S + 3, gap, v, W) && !T.visibleAt(0, T.LEAD_S + 10, gap, v, W), 'visibleAt：進來之前、離開之後不在畫面上'); }
// 平均每圈有幾種湊法：夠多的話「貪心／亂拿」會偏離，但至少 1 種保證
// 「拿一半隨機的盤子」剛好湊到預算的機率很低
{ let hit = 0, M = 4000; for (let i = 0; i < M; i++) { const q = T.makeLevel(10, rnd), set = new Set(); q.plates.forEach((p, k) => { if (rnd() < 0.5) set.add(k); }); if (T.judge(q, set).result === 'ok') hit++; } ok(hit / M < 0.06, '隨機拿一半盤子剛好湊到預算的機率 ' + (100 * hit / M).toFixed(1) + '%（很低）'); }
// 說明
{ const q = { target: 280 }; ok(T.whyText({ result: 'ok' }, q) === '剛剛好 280 元！' && T.whyText({ result: 'many', sum: 290, diff: 10 }, q) === '拿了 290 元，預算 280 元——多了 10 元' && T.whyText({ result: 'few', sum: 250, diff: -30 }, q) === '拿了 250 元，預算 280 元——少了 30 元', 'whyText（含使用者企劃的「剛好 280 元」）'); }

// ── 程式裡的接線 ──
{ const rd = pth => require('fs').readFileSync(require('path').resolve(__dirname, pth), 'utf8'), src = rd('../../js/reaction_sushi.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 4400/.test(src) && /showSpread\(\)/.test(src) && /一種剛好的拿法/.test(src) && /ssh-cell__s/.test(src), '失敗：攤開累加、寫出一種剛好的拿法、停格夠久');
  ok(/api\.timer\(q\.lap/.test(src) && /finish\('lap'\)/.test(src) && /judge\(q, taken\)/.test(src) && /ssh-legend/.test(src), '時間條＝一圈；轉完判定；價目表一直在');
  ok(/pointerdown/.test(src) && /plateX\(i, t, q\.gap, q\.speed, W\)/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src) && /armed/.test(src), '點盤子用 plateX 找最近的；solve／wrong 只排一次');
  ok(/\.ssh-pred \{[^}]*var\(--ssh-c-red\)/.test(css) && /\.ssh-pgold \{[^}]*var\(--ssh-c-gold\)/.test(css) && /\.ssh-pgreen \{[^}]*var\(--ssh-c-green\)/.test(css) && /\.ssh-top--salmon \{[^}]*var\(--ssh-salmon\)/.test(css), '盤子顏色、壽司用 CSS 變數');
  ok(boot.indexOf("'js/reaction_sushi.js'") > 0 && /預算/.test(G.rule) && /綠盤/.test(G.rule), 'boot.js 有載入、玩法說明提到預算與綠盤'); }
ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(6) && T.rating(6) !== T.rating(10) && T.rating(10) !== T.rating(16), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
