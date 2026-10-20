// 敲幾下（knockcount，企劃 313 依使用者修改）的純函式檢查：分組、節奏時間表（木魚與銅缽）、銅缽離木魚夠遠、連續銅缽、難度線性
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_knockcount.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261118), rnd = rng(SEED);

// ── 難度 ──
ok(T.countFor(1) === T.COUNT[0] && T.countFor(T.RAMP_LEVELS) === T.COUNT[1] && T.countFor(99) === T.COUNT[1], '次數 ' + T.COUNT);
ok(T.tempoFor(1) === T.TEMPO_MS[0] && T.tempoFor(T.RAMP_LEVELS) === T.TEMPO_MS[1], '間隔 ' + T.TEMPO_MS);
ok(T.bowlsFor(1) === 0 && T.bowlsFor(T.BOWL_FROM - 1) === 0 && T.bowlsFor(T.BOWL_FROM) >= 1 && T.bowlsFor(T.RAMP_LEVELS) === T.BOWLS[1], '銅缽：第 ' + T.BOWL_FROM + ' 關起才有，到頂 ' + T.BOWLS[1] + ' 聲');
for (let l = 2; l <= 60; l++) ok(T.countFor(l) >= T.countFor(l - 1) && T.tempoFor(l) <= T.tempoFor(l - 1) && T.bowlsFor(l) >= T.bowlsFor(l - 1), '單調 ' + l);
{ const d = []; for (let l = 2; l <= T.RAMP_LEVELS; l++) d.push(T.countFor(l) - T.countFor(l - 1)); ok(Math.max(...d) - Math.min(...d) <= 1, '次數線性成長：每關 +' + Math.min(...d) + '～' + Math.max(...d)); }
ok(T.respMs(10) === Math.round((T.RESP_BASE + 10 * T.RESP_PER) * 1000) && T.respMs(30) > T.respMs(10), '作答時間隨次數增加');

// ── 分組 ──
for (let i = 0; i < 500; i++) { const n = 1 + Math.floor(rnd() * 34), g = T.splitGroups(n, rnd);
  ok(g.reduce((a, b) => a + b, 0) === n, '分組的總和 ' + n + '：' + g);
  ok(g.every(x => x >= 1 && x <= Math.max(T.GROUP_MAX, n)), '每組 1～' + T.GROUP_MAX + '：' + g);
  if (n >= 2) ok(g.length >= 2, '至少兩組：' + g); if (n >= 4) ok(new Set(g).size > 1 || g.length === 2, '組的大小不全一樣：' + g); }
ok(JSON.stringify(T.splitGroups(1, rnd)) === '[1]', '1 下就是一組');

// ── 整關：時間表 ──
let total = 0, durMax = 0, clusters = 0, bowlTotal = 0, nearFish = 0;
for (let i = 0; i < 1500; i++) {
  const lv = 1 + (i % 40), q = T.makeLevel(lv, rnd); total++;
  const fish = q.events.filter(e => e.type === 'fish').map(e => e.t), bowl = q.events.filter(e => e.type === 'bowl').map(e => e.t);
  ok(q.count === T.countFor(lv) && fish.length === q.count, '第 ' + lv + ' 關：木魚 ' + fish.length + ' 下（要 ' + q.count + '）');
  ok(q.groups.reduce((a, b) => a + b, 0) === q.count, '分組總和');
  ok(bowl.length === q.bowls && q.bowls === T.bowlsFor(lv), '第 ' + lv + ' 關：銅缽 ' + bowl.length + ' 聲（要 ' + T.bowlsFor(lv) + '）');
  ok(q.events.every((e, k) => k === 0 || q.events[k - 1].t <= e.t), '時間表依時間排好');
  ok(fish.every((t, k) => k === 0 || t > fish[k - 1]) && fish[0] >= T.LEAD_MS - 1, '木魚時間遞增、第一下在 ' + T.LEAD_MS + ' 毫秒之後');
  // 組內間隔 ≈ tempo（±10%＋四捨五入）；組間停頓在範圍內（加上最後一下的間隔）
  let idx = 0, okGap = true;
  q.groups.forEach((g, gi) => { for (let k = 0; k < g; k++, idx++) { if (idx === 0) continue; const gap = fish[idx] - fish[idx - 1]; if (k > 0) { if (gap < q.tempo * 0.9 - 1.5 || gap > q.tempo * 1.1 + 1.5) okGap = false; } else if (gap < T.PAUSE_MS[0] + q.tempo * 0.9 - 2 || gap > T.PAUSE_MS[1] + q.tempo * 1.1 + 2) okGap = false; } });
  ok(okGap, '第 ' + lv + ' 關：組內間隔約 ' + q.tempo + '、組間停頓 ' + T.PAUSE_MS);
  ok(q.fishMs === fish[fish.length - 1] && q.endMs === q.events[q.events.length - 1].t && q.endMs >= q.fishMs - 1e-9 || bowl.some(b => b > q.fishMs), '最後一下的時間');
  // 銅缽離木魚、離彼此都至少 BOWL_CLEAR
  let tooClose = false; bowl.forEach((b, k) => { fish.forEach(f => { if (Math.abs(f - b) < T.BOWL_CLEAR) tooClose = true; }); bowl.forEach((b2, k2) => { if (k2 !== k && Math.abs(b - b2) < T.BOWL_CLEAR) tooClose = true; }); }); ok(!tooClose, '銅缽聲離每一下木魚、離彼此都至少 ' + T.BOWL_CLEAR + ' 毫秒');
  ok(bowl.every(b => b >= T.LEAD_MS * 0.5 - 1 && b <= q.fishMs + 400 + 3 * T.BOWL_GAP), '銅缽在師父敲的這段時間裡');
  // 連續多下：間隔 BOWL_GAP 的連續銅缽
  const sb = bowl.slice().sort((a, b) => a - b); for (let k = 1; k < sb.length; k++) if (Math.abs(sb[k] - sb[k - 1] - T.BOWL_GAP) <= 1) clusters++;
  bowlTotal += bowl.length; bowl.forEach(b => { if (fish.some(f => Math.abs(f - b) < 300)) nearFish++; });
  durMax = Math.max(durMax, q.endMs);
  if (lv === 1) ok(q.count === 4 && q.bowls === 0, '第 1 關：4 下、沒有銅缽');
}
console.log('銅缽共 ' + bowlTotal + ' 聲，其中連續的（間隔 ' + T.BOWL_GAP + '）' + clusters + ' 對；離木魚 300 毫秒內的 ' + nearFish + ' 聲；最長的一關師父表演 ' + (durMax / 1000).toFixed(1) + ' 秒');
ok(clusters > 100, '有連續多下的銅缽：' + clusters);
ok(nearFish / bowlTotal > 0.3, '銅缽常夾在木魚的節奏中間（干擾）：' + (100 * nearFish / bowlTotal).toFixed(0) + '%');
ok(durMax < 22000, '師父表演不會太久：' + durMax);
// 銅缽不是每次都在同一個地方：時間分散
{ const ts = []; for (let i = 0; i < 100; i++) { const q = T.makeLevel(24, rnd); q.events.filter(e => e.type === 'bowl').forEach(e => ts.push(e.t / q.fishMs)); } const early = ts.filter(x => x < 0.33).length, late = ts.filter(x => x > 0.66).length; ok(early > ts.length * 0.15 && late > ts.length * 0.15, '銅缽的位置分散在前、中、後：前 ' + early + '、後 ' + late + '／' + ts.length); }
// 程式裡的接線
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_knockcount.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3000/.test(src) && /銅缽/.test(src) && !/飛過|鳥/.test(src.replace(/取消飛鳥|飛鳥/g, '').replace(/鳥啄/g, '')), '失敗：顯示師父與你的次數、分組節奏；沒有飛鳥');
  ok(/\.knk-fish__body \{[^}]*var\(--knk-wood\)/.test(css) && /\.knk-bowl__body \{[^}]*var\(--knk-copper\)/.test(css), '木魚、銅缽用 CSS 變數');
  ok(boot.indexOf("'js/reaction_knockcount.js'") > 0 && /銅缽/.test(G.rule), 'boot.js 有載入、玩法說明提到銅缽'); }
ok(T.rating(2) !== T.rating(4) && T.rating(4) !== T.rating(7) && T.rating(7) !== T.rating(12) && T.rating(12) !== T.rating(20), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
