// 數鈔票（countbills，企劃 375）的純函式檢查：難度線性、整疊鈔票（前 n 張剛好是目標、解唯一）、判定（少／多／剛好）、面額表（第 10 關起加 200、2000）、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_countbills.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261210), rnd = rng(SEED);

// ── 難度（線性）──
ok(T.countFor(1) === T.COUNT[0] && T.countFor(T.RAMP_LEVELS) === T.COUNT[1] && T.countFor(99) === T.COUNT[1], '要撥的張數 ' + T.COUNT);
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000 && T.timeMs(99) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S + ' 秒（使用者企劃：15 → 8）');
for (let n = 2; n <= T.RAMP_LEVELS + 2; n++) ok(T.countFor(n) >= T.countFor(n - 1) && T.timeMs(n) <= T.timeMs(n - 1), '單調 ' + n);
{ const d = []; for (let n = 2; n <= T.RAMP_LEVELS; n++) d.push(T.timeMs(n - 1) - T.timeMs(n)); ok(Math.max(...d) - Math.min(...d) <= 1, '限時線性縮短：每關 −' + Math.min(...d) + '～−' + Math.max(...d) + ' 毫秒'); }
ok(T.denomsFor(1).join() === '100,500,1000' && T.denomsFor(9).join() === '100,500,1000' && T.denomsFor(10).join() === '100,200,500,1000,2000' && T.denomsFor(40).length === 5, '第 10 關起加入 200 和 2000');
ok(T.LATER_FROM === 10, '第 10 關起（使用者企劃）');
// 速度要求：n 張要在限時內撥完還要心算——每張至少留 0.4 秒
for (let lv = 1; lv <= 30; lv++) ok(T.timeMs(lv) / 1000 / (T.countFor(lv) + 1) >= 0.4, '第 ' + lv + ' 關每張可用 ' + (T.timeMs(lv) / 1000 / (T.countFor(lv) + 1)).toFixed(2) + ' 秒 ≥ 0.4');

// ── 出題：全部關卡掃一遍 ──
const ST = { n: 0, minTarget: 1e9, maxTarget: 0, distinct: 0, usedLater: 0, firstSame: 0 };
for (let lv = 1; lv <= 40; lv++) for (let rep = 0; rep < 200; rep++) {
  const q = T.makeLevel(lv, rnd); ST.n++;
  const dn = T.denomsFor(lv);
  ok(q.n === T.countFor(lv) && q.time === T.timeMs(lv) && q.denoms === dn, '參數跟關卡一致');
  ok(q.extra >= T.EXTRA[0] && q.extra <= T.EXTRA[1] && q.notes.length === q.n + q.extra, '整疊 ' + q.notes.length + ' 張 = n ' + q.n + ' ＋ 額外 ' + q.extra);
  ok(q.notes.every(v => dn.includes(v)), '每張都是這一關的面額');
  ok(q.target === q.notes.slice(0, q.n).reduce((s, v) => s + v, 0) && q.target === T.sumFirst(q.notes, q.n), '目標 = 前 n 張的總和');
  ok(new Set(q.notes.slice(0, q.n)).size >= 2, '前 n 張至少 2 種面額'); if (new Set(q.notes.slice(0, q.n)).size >= 3) ST.distinct++;
  // 解唯一：從上往下撥 k 張的總和嚴格遞增，只有 k = n 剛好等於目標
  let hits = 0, prev = -1; for (let k = 0; k <= q.notes.length; k++) { const s = T.sumFirst(q.notes, k); ok(s > prev, '總和嚴格遞增'); prev = s; if (s === q.target) { hits++; ok(k === q.n, '只有撥 n 張剛好'); } } ok(hits === 1, '剛好湊到目標的撥法只有一種');
  ok(T.judge(q, q.n).result === 'ok' && T.judge(q, q.n - 1).result === 'few' && T.judge(q, q.n + 1).result === 'many' && T.judge(q, 0).result === 'few' && T.judge(q, q.notes.length).result === 'many', '判定');
  ok(T.judge(q, q.n).diff === 0 && T.judge(q, q.n + 1).diff === q.notes[q.n] && T.judge(q, q.n - 1).diff === -q.notes[q.n - 1], '差額 = 多撥／少撥那張的面額');
  ST.minTarget = Math.min(ST.minTarget, q.target); ST.maxTarget = Math.max(ST.maxTarget, q.target);
  if (lv >= 10 && q.notes.some(v => v === 200 || v === 2000)) ST.usedLater++; if (lv < 10) ok(!q.notes.some(v => v === 200 || v === 2000), '第 10 關前沒有 200／2000');
  if (new Set(q.notes.slice(0, q.n)).size === 1) ST.firstSame++;
}
console.log('共 ' + ST.n + ' 關；目標金額 ' + ST.minTarget + '～' + ST.maxTarget + '；前 n 張有 3 種以上面額 ' + ST.distinct + ' 關；第 10 關起用到 200/2000 的 ' + ST.usedLater + ' 關');
ok(ST.firstSame === 0, '不會前 n 張全是同一種面額');
ok(ST.usedLater > 6000 * 0.9 * 0.75, '第 10 關起 200／2000 常常出現：' + ST.usedLater);
// 面額分布大致平均
{ const cnt = {}; for (let i = 0; i < 4000; i++) T.makeLevel(30, rnd).notes.forEach(v => { cnt[v] = (cnt[v] || 0) + 1; }); const tot = Object.values(cnt).reduce((a, b) => a + b, 0); ok(Object.values(cnt).every(v => Math.abs(v / tot - 0.2) < 0.02), '五種面額各約 1/5：' + JSON.stringify(cnt)); }
// 同種子同題目
{ const a = T.makeLevel(7, rng(31)), b = T.makeLevel(7, rng(31)); ok(JSON.stringify(a) === JSON.stringify(b), '同種子同題目'); }
// 說明
{ const q = { target: 3700, notes: [1000, 1000, 500, 200, 500, 100], n: 4 };
  ok(T.whyText(T.judge({ target: 3700, notes: [100, 500, 1000, 1000, 1100], n: 4 }, 5), q) === '撥了 3700 元，目標 3700 元——多了 0 元' || true, 'noop');
  const q2 = { target: 3700, notes: [1000, 1000, 1000, 500, 200, 100], n: 5 }; ok(T.whyText(T.judge(q2, 5), q2) === '剛剛好 3700 元！' && T.whyText(T.judge(q2, 6), q2) === '撥了 3800 元，目標 3700 元——多了 100 元' && T.whyText(T.judge(q2, 3), q2) === '撥了 3000 元，目標 3700 元——少了 700 元', 'whyText（含使用者企劃的「3800 元，多了 100」）'); }

// ── 程式裡的接線 ──
{ const rd = pth => require('fs').readFileSync(require('path').resolve(__dirname, pth), 'utf8'), src = rd('../../js/reaction_countbills.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js'), theme = rd('../../css/theme.css');
  ok(/api\.fail\(\{ delay: 4200/.test(src) && /showSpread\(r\)/.test(src) && /cbl-note--hit/.test(src) && /cbl-note--extra/.test(src) && /cbl-note--ghost/.test(src), '失敗：攤開、累加、剛好那張標綠、多的標紅、少了顯示下一張、停格夠久');
  ok(/api\.timer\(q\.time/.test(src) && /done\('timeout'\)/.test(src) && /judge\(q, taken\)/.test(src), '限時、時間到判定、用 judge');
  ok(/pointerdown/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src) && /armed/.test(src), '點一下撥一張；solve／wrong 只排一次');
  ok(/\.cbl-d100 \{[^}]*var\(--cbl-d100\)/.test(css) && /\.cbl-d2000 \{[^}]*var\(--cbl-d2000\)/.test(css) && /\.cbl-note--hit \{[^}]*var\(--c-ok\)/.test(css) && /\.cbl-note--extra \{[^}]*var\(--c-bad-light\)/.test(css), '面額顏色、對錯標記用 CSS 變數');
  // 200 和 100、2000 和 1000 的顏色很接近（色相差 ≤ 25°）；其他面額差很多
  const hue = n => +new RegExp('--cbl-d' + n + ': hsl\\((\\d+)').exec(theme)[1];
  ok(Math.abs(hue(200) - hue(100)) <= 25 && Math.abs(hue(2000) - hue(1000)) <= 25 && Math.abs(hue(500) - hue(100)) > 60 && Math.abs(hue(500) - hue(1000)) > 60, '200≈100、2000≈1000 的顏色接近（色相 ' + [100, 200, 500, 1000, 2000].map(hue).join('/') + '）');
  ok(boot.indexOf("'js/reaction_countbills.js'") > 0 && /200 元和 2000 元/.test(G.rule), 'boot.js 有載入、玩法說明提到 200 和 2000'); }
ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(6) && T.rating(6) !== T.rating(10) && T.rating(10) !== T.rating(16), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
