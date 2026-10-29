// 零錢入筒（coinsort，企劃 359 依使用者修改）的純函式檢查：難度線性、硬幣大小、滑的方向判定、出硬幣的規則、說明文字、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_coinsort.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261203), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 使用者的對應：銅大 50 → 左、銅小 5 → 下（見檔頭說明）、銀大 10 → 右 ──
ok(T.DIR_OF.c50 === 'left' && T.DIR_OF.c10 === 'right' && T.DIR_OF.c5 === 'down', '50 元往左、10 元往右、5 元往下');
ok(T.COIN.c50.metal === 'copper' && T.COIN.c50.big && T.COIN.c5.metal === 'copper' && !T.COIN.c5.big && T.COIN.c10.metal === 'silver' && T.COIN.c10.big, '50 元＝銅色大、5 元＝銅色小、10 元＝銀色大');
ok(T.TYPES.length === 3 && new Set(T.TYPES.map(t => T.DIR_OF[t])).size === 3, '三種硬幣各自有一個不同的筒子');
ok(T.TUBE_X.left < T.TUBE_X.down && T.TUBE_X.down < T.TUBE_X.right && near(T.TUBE_X.left + T.TUBE_X.right, 1) && near(T.TUBE_X.down, 0.5), '筒子位置：左下、正下方、右下（左右對稱）');
ok(T.isRight('c50', 'left') && !T.isRight('c50', 'down') && !T.isRight('c50', 'right') && T.isRight('c5', 'down') && !T.isRight('c5', 'left') && T.isRight('c10', 'right') && !T.isRight('c10', 'left'), 'isRight');

// ── 難度（線性，依分對幾枚）──
ok(T.fallMsFor(0) === T.FALL_S[0] * 1000 && T.fallMsFor(T.RAMP_COINS) === T.FALL_S[1] * 1000 && T.fallMsFor(9999) === T.FALL_S[1] * 1000, '掉落時間 ' + T.FALL_S + ' 秒');
ok(near(T.backPFor(0), T.BACK_P[0]) && near(T.backPFor(T.RAMP_COINS), T.BACK_P[1]), '背面機率 ' + T.BACK_P);
ok(near(T.ratio5For(0), T.RATIO5[0]) && near(T.ratio5For(T.RAMP_COINS), T.RATIO5[1]), '5 元的大小比 ' + T.RATIO5);
{ const d = []; for (let n = 1; n <= T.RAMP_COINS; n++) { ok(T.fallMsFor(n) <= T.fallMsFor(n - 1) && T.backPFor(n) >= T.backPFor(n - 1) && T.ratio5For(n) >= T.ratio5For(n - 1), '單調 ' + n); d.push(T.fallMsFor(n - 1) - T.fallMsFor(n)); }
  ok(Math.max(...d) - Math.min(...d) <= 1, '掉落時間線性縮短：每枚 −' + Math.min(...d) + '～−' + Math.max(...d) + ' 毫秒'); }
ok(T.fallMsFor(T.RAMP_COINS) >= 800, '到頂時硬幣還有 ' + T.fallMsFor(T.RAMP_COINS) + ' 毫秒可以滑（人反應得過來）');
ok(T.prog(-5) === 0 && T.prog(T.RAMP_COINS * 3) === 1, 'prog 夾在 0～1');

// ── 硬幣大小：50 和 10 一樣大；5 元比較小，而且越後面越接近 ──
for (const W of [472, 440, 500]) for (const n of [0, 10, 20, 40, 80]) {
  const d50 = T.diameterOf('c50', n, W), d10 = T.diameterOf('c10', n, W), d5 = T.diameterOf('c5', n, W);
  ok(d50 === d10 && d50 === Math.round(W * T.COIN_D), '50 元和 10 元一樣大：' + d50);
  ok(d5 < d50 && d5 >= Math.round(d50 * 0.6), '5 元比較小（' + d5 + ' < ' + d50 + '）但還看得出差別：到頂 ' + (d5 / d50).toFixed(2));
}
ok(T.diameterOf('c5', T.RAMP_COINS, 472) / T.diameterOf('c50', T.RAMP_COINS, 472) <= 0.82, '到頂時 5 元仍比 50 元小至少約 20%（看得出差別，不會變成猜的）');

// ── 滑的判定 ──
{ const m = T.SWIPE_MIN;
  ok(T.classifySwipe(m - 1, 0) === null && T.classifySwipe(0, 0) === null && T.classifySwipe(20, 20) === null, '位移太短不算');
  ok(T.classifySwipe(-80, 0) === 'left' && T.classifySwipe(80, 0) === 'right' && T.classifySwipe(0, 80) === 'down' && T.classifySwipe(0, -80) === 'up', '四個方向');
  ok(T.classifySwipe(-60, 40) === 'left' && T.classifySwipe(60, 40) === 'right', '斜下方但偏水平算左／右（拇指會往下偏）');
  ok(T.classifySwipe(-60, 60) === 'left' && T.classifySwipe(60, 60) === 'right', '正好 45° 往下偏的，算左／右');
  ok(T.classifySwipe(-30, 80) === 'down' && T.classifySwipe(30, 80) === 'down' && T.classifySwipe(0, 41) === 'down', '偏垂直的算下');
  ok(T.classifySwipe(-80, -30) === 'left' && T.classifySwipe(80, -30) === 'right' && T.classifySwipe(10, -80) === 'up', '往上偏的：水平分量夠大還是算左右，主要往上就是 up（不算數）');
  // 窮舉 360 度：任何方向都有唯一的結果；水平扇形 ≥ 100°、下扇形 ≈ 74°
  let cnt = { left: 0, right: 0, down: 0, up: 0 };
  for (let a = 0; a < 360; a++) { const r = a * Math.PI / 180, dx = 100 * Math.cos(r), dy = 100 * Math.sin(r), d = T.classifySwipe(dx, dy); ok(['left', 'right', 'down', 'up'].includes(d), '方向 ' + a + '° 有結果'); cnt[d]++; }
  console.log('360 度的方向分布：' + JSON.stringify(cnt));
  ok(cnt.left >= 100 && cnt.right >= 100 && cnt.left === cnt.right && cnt.down >= 60 && cnt.down <= 80 && cnt.up >= 60 && cnt.up <= 80, '左右各一個寬扇形、下扇形 ' + cnt.down + '°');
  ok(T.classifySwipe(-30, 0, 10) === 'left' && T.classifySwipe(-9, 0, 10) === null, '可以指定最短位移'); }

// ── 出硬幣：種類、背面、不會連續太多枚 ──
{ const st = { c50: 0, c5: 0, c10: 0, back: 0, runMax: 0 }, N = 60000; let hist = [], run = 0, prev = null;
  for (let i = 0; i < N; i++) { const n = i % 60, c = T.nextCoin(hist, n, rnd); ok(T.TYPES.includes(c.type) && typeof c.back === 'boolean', '硬幣種類'); st[c.type]++; if (c.back) st.back++; hist.push(c.type); if (hist.length > 8) hist.shift(); run = c.type === prev ? run + 1 : 1; prev = c.type; st.runMax = Math.max(st.runMax, run); }
  console.log('硬幣分布 ' + JSON.stringify(st));
  ok(T.TYPES.every(t => st[t] > N * 0.3 && st[t] < N * 0.37), '三種硬幣各約 1/3');
  ok(st.runMax <= T.MAX_SAME, '最多連續 ' + T.MAX_SAME + ' 枚同一種：' + st.runMax);
  // 背面機率隨分對枚數增加
  function backRate(n) { let k = 0, M = 20000; for (let i = 0; i < M; i++) if (T.nextCoin([], n, rnd).back) k++; return k / M; }
  const a = backRate(0), b = backRate(20), c = backRate(40); ok(a === 0 && b > 0.3 && b < 0.4 && c > 0.66 && c < 0.74, '背面朝上的比例 ' + a + ' → ' + b.toFixed(2) + ' → ' + c.toFixed(2)); }
// 一直都是同一種的歷史：下一枚一定換
{ for (const t of T.TYPES) { const hist = [t, t, t]; for (let i = 0; i < 300; i++) ok(T.nextCoin(hist, 5, rnd).type !== t, '連 3 枚 ' + t + ' 之後換別種'); } }

// ── 結束時的說明 ──
ok(/來不及了/.test(T.whyText('c5', 'miss')) && /5 元/.test(T.whyText('c5', 'miss')) && /銅色、小/.test(T.whyText('c5', 'miss')) && /往下滑/.test(T.whyText('c5', 'miss')), 'miss 的說明');
ok(/滑錯了/.test(T.whyText('c50', 'wrong', 'right')) && /50 元/.test(T.whyText('c50', 'wrong', 'right')) && /往左滑/.test(T.whyText('c50', 'wrong', 'right')) && /你滑了右/.test(T.whyText('c50', 'wrong', 'right')), 'wrong 的說明');
ok(/銀色、大/.test(T.whyText('c10', 'wrong', 'down')) && /往右滑/.test(T.whyText('c10', 'wrong', 'down')) && /你滑了下/.test(T.whyText('c10', 'wrong', 'down')), '10 元說明');

// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_coinsort.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3800/.test(src) && /cns-bigcoin--show/.test(src) && /coinSvg\(c\.type, false, BD\)/.test(src), '失敗：硬幣放大、翻到正面（不是背面）、停格 2 秒以上');
  ok(/scoreOf/.test(src) && /resume: false/.test(src) && /max: 300/.test(src) && /SOLVE_CAP/.test(src), '成績用 scoreOf、不從前幾關繼續、成績上限 300、solve 有上限');
  ok(/pointerdown/.test(src) && /pointermove/.test(src) && /pointerup/.test(src) && /pointercancel/.test(src), '滑：pointerdown／move／up／cancel');
  ok(/\.cns-coin--copper \.cns-face \{[^}]*var\(--cns-copper\)/.test(css) && /\.cns-coin--silver \.cns-face \{[^}]*var\(--cns-silver\)/.test(css) && /\.cns-tube--right \{[^}]*var\(--c-ok/.test(css) && /\.cns-tube--wrong \{[^}]*var\(--c-bad-light\)/.test(css), '銅色、銀色、對錯的筒子用 CSS 變數');
  ok(boot.indexOf("'js/reaction_coinsort.js'") > 0 && /50 元/.test(G.rule) && /往左滑/.test(G.rule) && /往下滑/.test(G.rule) && /往右滑/.test(G.rule), 'boot.js 有載入、玩法說明寫出三種硬幣的方向'); }
ok(T.rating(2) !== T.rating(10) && T.rating(10) !== T.rating(25) && T.rating(25) !== T.rating(50) && T.rating(50) !== T.rating(90), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
