// 心跳複製（heartbeat，V1.57.0 改版）：8 個圓排成一圈（整圈寬度＝畫面 90%）、依序亮藍色（要點）／橘色（不能點）、
// 頻率（拍子間隔）與藍色比例的難度曲線、判定（點對／點錯／漏掉）、點擊範圍是整個畫面
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_heartbeat.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 30) console.log('FAIL', m); } };
const SEED = seedOf(20261116), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

ok(G.id === 'heartbeat' && G.name === '心跳複製' && /\*\*/.test(G.rule) && G.score.better === 'max' && G.score.label === '正確點擊', '登記資料（成績＝正確點擊幾次）');
ok(/8 個/.test(G.rule) && /藍色/.test(G.rule) && /橘色/.test(G.rule) && /任何位置/.test(G.rule), '玩法說明提到 8 個圓、藍色、橘色、可點擊畫面任何位置');
// ── 頻率：拍子間隔線性縮短（INT_START → INT_END，第 RAMP_BLUES 個「藍色拍」起維持；V1.57.0：只有藍色才算）──
ok(near(T.intervalFor(1), T.INT_START) && near(T.intervalFor(T.RAMP_BLUES), T.INT_END) && near(T.intervalFor(500), T.INT_END), '間隔 ' + T.INT_START + ' → ' + T.INT_END + ' 秒');
ok(near(T.intervalFor(1), 1.0) || T.INT_START !== 1.0, '（目前的起點間隔 ' + T.INT_START + ' 秒）');
{ let prev = 1e9, dir = Math.sign(T.INT_END - T.INT_START); for (let b = 1; b <= 80; b++) { const v = T.intervalFor(b); ok((prev === 1e9 || (v - prev) * dir >= -1e-12), '間隔單調 ' + b); prev = v; } }
{ const d = []; for (let b = 2; b <= T.RAMP_BLUES; b++) d.push(T.intervalFor(b) - T.intervalFor(b - 1)); ok(Math.max(...d) - Math.min(...d) < 1e-9, '間隔線性變化：每拍 ' + d[0].toFixed(5) + ' 秒'); }
// ── 藍色出現的比例 ──
ok(Array.isArray(T.BLUE_P) && T.BLUE_P.length === 2 && T.BLUE_P.every(x => x >= 0 && x <= 1), '藍色比例參數 BLUE_P 是 [第 1 拍, 到頂]：' + T.BLUE_P);
ok(near(T.blueFor(1), T.BLUE_P[0], 1e-4) && near(T.blueFor(T.RAMP_BEATS), T.BLUE_P[1], 1e-4) && near(T.blueFor(999), T.BLUE_P[1], 1e-4), '藍色比例兩端：' + T.blueFor(1) + ' → ' + T.blueFor(T.RAMP_BEATS));
ok(T.pickBlue(1, () => 0.999) === true && T.pickBlue(1, () => 0) === true, '第 1 拍一定是藍色（先讓玩家看到手指圖示）');
for (const b of [2, 20, T.RAMP_BEATS]) { let blue = 0; const N = 6000; for (let i = 0; i < N; i++) if (T.pickBlue(b, rnd)) blue++; ok(Math.abs(blue / N - T.blueFor(b)) < 0.03, '第 ' + b + ' 拍實際藍色佔 ' + (blue / N * 100).toFixed(1) + '%（參數 ' + (T.blueFor(b) * 100).toFixed(1) + '%）'); }
{ const old = T.BLUE_P.slice(); T.BLUE_P[0] = 0; T.BLUE_P[1] = 0; let any = false; for (let i = 0; i < 300; i++) if (T.pickBlue(2 + i % 70, rnd)) any = true; ok(!any, 'BLUE_P 設 [0, 0]：第 2 拍起都是橘色'); T.BLUE_P[0] = 1; T.BLUE_P[1] = 1; let all = true; for (let i = 0; i < 300; i++) if (!T.pickBlue(1 + i % 70, rnd)) all = false; ok(all, 'BLUE_P 設 [1, 1]：都是藍色'); T.BLUE_P[0] = old[0]; T.BLUE_P[1] = old[1]; }
// ── 圓形的版面：8 個、整圈寬度＝畫面的 90%、不重疊、都在畫面裡 ──
ok(T.N_CIRCLES === 8 && T.RING_W === 0.9, '8 個圓、整圈寬度 90%');
for (const [W, H] of [[472, 600], [472, 700], [390, 500]]) {
  const lay = T.ringLayout(W, H);
  ok(near(lay.total, W * 0.9, 1e-6), W + '×' + H + '：整圈（含圓）寬度 ' + lay.total.toFixed(1) + ' ＝ 畫面寬 ' + W + ' 的 90%');
  const pts = []; for (let i = 0; i < 8; i++) pts.push(T.circlePos(i, lay));
  ok(near(pts[0].x, W / 2, 1e-6) && near(pts[0].y, lay.cy - lay.Rc, 1e-6), '第 0 個圓在正上方');
  ok(near(pts[2].x, W / 2 + lay.Rc, 1e-6) && near(pts[2].y, lay.cy, 1e-6) && near(pts[4].y, lay.cy + lay.Rc, 1e-6) && near(pts[6].x, W / 2 - lay.Rc, 1e-6), '順時針：第 2 個在右、第 4 個在下、第 6 個在左');
  let minD = 1e9; for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) minD = Math.min(minD, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
  ok(minD > 2 * lay.r + 2, W + '×' + H + '：相鄰的圓不重疊（圓心最近 ' + minD.toFixed(1) + ' ＞ 直徑 ' + (2 * lay.r).toFixed(1) + '）');
  ok(pts.every(p => p.x - lay.r >= (W - lay.total) / 2 - 1e-6 && p.x + lay.r <= (W + lay.total) / 2 + 1e-6), '圓都在整圈的寬度範圍內');
}
// ── V1.57.0 玩家意見：整個環形偏上方放置（手指才不會遮住環的下方）──
ok(T.RING_Y > 0 && T.RING_Y < 0.5, '環形的中心在遊戲區高度的 ' + T.RING_Y + ' 處（小於 0.5＝比正中央更靠上）');
for (const [W, H] of [[472, 600], [472, 700], [472, 800], [390, 500]]) {
  const lay = T.ringLayout(W, H);
  ok(lay.cy <= H / 2 + 1e-9, W + '×' + H + '：環的中心 ' + lay.cy.toFixed(1) + ' 不比正中央（' + H / 2 + '）低');
  ok(lay.cy - lay.total / 2 >= 6 - 1e-9 && lay.cy + lay.total / 2 <= H + 1e-9, W + '×' + H + '：整個環放得進遊戲區（上緣 ' + (lay.cy - lay.total / 2).toFixed(1) + '、下緣 ' + (lay.cy + lay.total / 2).toFixed(1) + '）');
  ok(near(lay.cy, Math.max(H * T.RING_Y, lay.total / 2 + 6), 1e-9), W + '×' + H + '：中心 ＝ 高度 × RING_Y（上緣貼齊時最多只移到那裡）');
}
// ── V1.57.0 玩家意見：拍子的間隔只有出現藍色（必須點擊）才會縮短，橘色不會 ──
ok(T.RAMP_BLUES > 1, '間隔縮到最快要 RAMP_BLUES 個藍色拍：' + T.RAMP_BLUES);
{ let bl = 0, prev = null; const seq = [true, false, false, false, true, false, true, true, false, false, false, false, false];
  seq.forEach((blue, i) => { const p = T.beatPlan(bl, blue); bl = p.blueN;
    ok(p.blueN === seq.slice(0, i + 1).filter(Boolean).length, '第 ' + (i + 1) + ' 拍（' + (blue ? '藍' : '橘') + '）：藍色拍累計 ' + p.blueN);
    if (prev) { if (blue) ok((p.spacing - prev) * Math.sign(T.INT_END - T.INT_START) > 0 || prev === T.INT_END, '藍色的拍：間隔縮短（' + prev.toFixed(3) + ' → ' + p.spacing.toFixed(3) + '）'); else ok(p.spacing === prev, '橘色的拍：間隔不變（' + p.spacing.toFixed(3) + '）'); }
    prev = p.spacing; });
  ok(T.beatPlan(0, true).blueN === 1 && near(T.beatPlan(0, true).spacing, T.INT_START), '第 1 個藍色拍：間隔是起點 ' + T.INT_START + ' 秒'); }
{ let bl = 0, sp = null; for (let i = 0; i < 200; i++) { const p = T.beatPlan(bl, false); bl = p.blueN; sp = p.spacing; } ok(bl === 0 && near(sp, T.INT_START), '一直出橘色（200 拍）：間隔一直是起點 ' + T.INT_START + ' 秒，沒有變快'); }
{ let bl = 0, sp = null; for (let i = 0; i < T.RAMP_BLUES + 30; i++) { const p = T.beatPlan(bl, true); bl = p.blueN; sp = p.spacing; } ok(near(sp, T.INT_END), '連續出藍色：第 ' + T.RAMP_BLUES + ' 個藍色拍起維持最快 ' + T.INT_END + ' 秒'); }
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_heartbeat.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(/plan = beatPlan\(blueN, blue\)/.test(src) && /blueN = plan\.blueN/.test(src) && !/intervalFor\(beatNo\)/.test(src), '畫面用 beatPlan 排拍：只有藍色的拍才增加 blueN，不再用總拍數算間隔'); }
ok(/只有藍色的圓出現才會變快/.test(G.rule), '玩法說明寫了「只有藍色的圓出現才會變快」');
// ── 每一拍亮第幾個圓：順時針繞圈 ──
ok(T.circleOf(1) === 0 && T.circleOf(2) === 1 && T.circleOf(8) === 7 && T.circleOf(9) === 0 && T.circleOf(17) === 0, '第 1 拍亮第 0 個圓，依序順時針，第 9 拍繞回第 0 個');
// ── 判定 ──
ok(T.tapResult(null) === 'ignore', '沒有這一拍（還沒開始）：點了不算');
ok(T.tapResult({ blue: true, tapped: false, bad: false }) === 'hit', '藍色、還沒點：點對');
ok(T.tapResult({ blue: true, tapped: true, bad: false }) === 'ignore', '藍色、已經點對：再點不算');
ok(T.tapResult({ blue: false, tapped: false, bad: false }) === 'bad', '橘色：點錯');
ok(T.tapResult({ blue: false, tapped: false, bad: true }) === 'ignore', '橘色、已經點錯過：再點不重複扣');
ok(T.missed({ blue: true, tapped: false }) && !T.missed({ blue: true, tapped: true }) && !T.missed({ blue: false, tapped: false }) && !T.missed(null), '漏掉：只有「藍色而且一直沒點」');
ok(T.LIVES >= 1 && T.GRACE_MS >= 0 && T.START_MS >= 500, '命數 ' + T.LIVES + '、雙擊保護 ' + T.GRACE_MS + ' 毫秒');

// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_heartbeat.js'), css = rd('../../css/games/reaction_heartbeat.css').replace(/\/\*[\s\S]*?\*\//g, '').split(/\s+/).join(' ');
  ok(/root\.addEventListener\('pointerdown', onDown\)/.test(src) && !/field\.addEventListener\('pointerdown'/.test(src), '點擊掛在整個遊戲畫面（root），不是只有圓形');
  ok(/root\.removeEventListener\('pointerdown', onDown\)/.test(src) && /root\.classList\.add\('heartbeat-screen'\)/.test(src) && /root\.classList\.remove\('heartbeat-screen'\)/.test(src), '離開遊戲時拿掉監聽與 class');
  ok(/可點擊畫面任何位置/.test(src), '畫面上有「可點擊畫面任何位置」的提示文字');
  ok(/\.heartbeat-c--blue \.heartbeat-disc \{[^}]*var\(--c-blue\)/.test(css) && /\.heartbeat-c--orange \.heartbeat-disc \{[^}]*var\(--c-orange\)/.test(css) && /\.heartbeat-c--ok \.heartbeat-disc \{[^}]*var\(--c-green\)/.test(css) && /\.heartbeat-c--bad \.heartbeat-disc \{[^}]*var\(--c-red\)/.test(css), '藍色／橘色／綠色（點對）／紅色（點錯）都用 CSS 變數');
  ok(/\.heartbeat-disc \{[^}]*var\(--c-on-accent\)/.test(css) && /\.heartbeat-finger \{[^}]*display: none/.test(css) && /\.heartbeat-c--blue \.heartbeat-finger \{[^}]*display: block/.test(css), '圓預設白色；手指圖示只在藍色的圓裡出現');
  ok(/\.screen\.heartbeat-screen \{[^}]*touch-action: none/.test(css), '整個畫面關掉瀏覽器的觸控手勢（任何位置都能點）'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
