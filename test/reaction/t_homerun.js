// 全壘打（homerun，企劃 362）的純函式檢查：難度線性、球路（速球／變速球／曲球／壞球的位置）、判定（早／晚／壞球／好球不揮）、球的畫面位置、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_homerun.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261206), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（線性）──
ok(near(T.flyFor(1), T.FLY_S[0]) && near(T.flyFor(T.RAMP_LEVELS), T.FLY_S[1]) && near(T.flyFor(99), T.FLY_S[1]), '速球飛行時間 ' + T.FLY_S);
ok(near(T.winFor(1), T.HIT_WIN[0]) && near(T.winFor(T.RAMP_LEVELS), T.HIT_WIN[1]), '打擊窗口 ' + T.HIT_WIN);
ok(near(T.pBallFor(1), T.P_BALL[0]) && near(T.pBallFor(T.RAMP_LEVELS), T.P_BALL[1]), '壞球機率 ' + T.P_BALL);
ok(near(T.ballDistFor(1), T.BALL_DIST[0]) && near(T.ballDistFor(T.RAMP_LEVELS), T.BALL_DIST[1]), '壞球離邊緣 ' + T.BALL_DIST);
ok(near(T.pChangeFor(1), T.P_CHANGE[0]) && near(T.pChangeFor(T.RAMP_LEVELS), T.P_CHANGE[1]) && near(T.pCurveFor(1), T.P_CURVE[0]) && near(T.pCurveFor(T.RAMP_LEVELS), T.P_CURVE[1]), '變速球／曲球機率 ' + T.P_CHANGE + ' ' + T.P_CURVE);
for (let n = 2; n <= T.RAMP_LEVELS + 2; n++) ok(T.flyFor(n) <= T.flyFor(n - 1) && T.winFor(n) <= T.winFor(n - 1) && T.pBallFor(n) >= T.pBallFor(n - 1) && T.ballDistFor(n) <= T.ballDistFor(n - 1) && T.pChangeFor(n) >= T.pChangeFor(n - 1) && T.pCurveFor(n) >= T.pCurveFor(n - 1), '單調 ' + n);
{ const d = []; for (let n = 2; n <= T.RAMP_LEVELS; n++) d.push(T.flyFor(n - 1) - T.flyFor(n)); ok(Math.max(...d) - Math.min(...d) <= 0.002, '飛行時間線性縮短：每關 −' + Math.min(...d).toFixed(4) + '～−' + Math.max(...d).toFixed(4) + ' 秒'); }
ok(T.winFor(T.RAMP_LEVELS) >= 0.04, '到頂窗口 ±' + T.winFor(T.RAMP_LEVELS) + ' 秒（人還打得到）');
ok(T.CHANGE_X === undefined || T.CHANGE_X >= 1.3, '變速球至少慢 30%');

// ── 好球帶判定與壞球落點 ──
ok(T.inZone({ x: 0, y: 0 }) && T.inZone({ x: 1, y: -1 }) && !T.inZone({ x: 1.01, y: 0 }) && !T.inZone({ x: 0, y: -1.2 }), 'inZone');
for (let i = 0; i < 5000; i++) { const d = 0.1 + rnd() * 1.5, pt = T.outsidePoint(d, rnd), m = Math.max(Math.abs(pt.x), Math.abs(pt.y)); ok(near(m, 1 + d, 0.0015) && !T.inZone(pt), '壞球落點在框外：離邊緣 ' + d.toFixed(3) + ' → ' + m.toFixed(3)); }

// ── 出球：全部關卡掃一遍 ──
const ST = { n: 0, ball: 0, curve: 0, change: 0, fast: 0, strikeChange: 0, minBallDist: 9, curveEarly: 0 };
for (let lv = 1; lv <= 40; lv++) for (let rep = 0; rep < 300; rep++) {
  const p = T.makePitch(lv, rnd); ST.n++;
  ok(['fast', 'change', 'curve'].includes(p.type), '球種'); ST[p.type]++;
  ok(p.win === T.winFor(lv), '窗口跟關卡一致');
  const base = T.flyFor(lv); ok(near(p.tFly, p.type === 'change' ? Math.round(base * T.CHANGE_X * 1000) / 1000 : base, 0.0011), '飛行時間：速球／曲球 ' + base + '、變速球 ×' + T.CHANGE_X + '：' + p.tFly);
  if (p.strike) {
    ok(T.inZone(p.F) && Math.abs(p.F.x) <= T.STRIKE_EDGE + 1e-9 && Math.abs(p.F.y) <= T.STRIKE_EDGE + 1e-9 && p.dist === 0, '好球落在好球帶中央的範圍內：(' + p.F.x + ',' + p.F.y + ')');
    ok(p.type !== 'curve' && p.S.x === p.F.x && p.S.y === p.F.y, '好球不是曲球'); if (p.type === 'change') ST.strikeChange++;
  } else {
    ST.ball++; const m = Math.max(Math.abs(p.F.x), Math.abs(p.F.y)) - 1;
    ok(!T.inZone(p.F) && m >= T.ballDistFor(lv) - 0.0015 && m <= T.ballDistFor(lv) + T.BALL_DIST_MAX + 0.0015, '壞球離邊緣 ' + m.toFixed(3) + ' 在 [' + T.ballDistFor(lv) + ', ' + (T.ballDistFor(lv) + T.BALL_DIST_MAX).toFixed(3) + ']'); ST.minBallDist = Math.min(ST.minBallDist, m);
    if (p.type === 'curve') { ok(T.inZone(p.S) && Math.abs(p.S.x) <= T.STRIKE_EDGE + 1e-9 && Math.abs(p.S.y) <= T.STRIKE_EDGE + 1e-9, '曲球一開始飛向好球帶裡的一點 S'); ST.curveEarly += T.inZone(T.targetAt(p, 0.5)) || (Math.hypot(T.targetAt(p, 0.5).x - p.S.x, T.targetAt(p, 0.5).y - p.S.y) <= Math.hypot(p.F.x - p.S.x, p.F.y - p.S.y) * 0.13 + 1e-9) ? 1 : 0; }
  }
  ok(!(p.type === 'curve' && p.strike), '曲球一定是壞球');
  // 路徑：u=0 在出手位置附近（目標 S）、u=1 在 F
  const t1 = T.targetAt(p, 1); ok(near(t1.x, p.F.x, 1e-9) && near(t1.y, p.F.y, 1e-9), 'u=1 時目標就是 F');
  if (p.type !== 'curve') { const t5 = T.targetAt(p, 0.5); ok(t5.x === p.F.x && t5.y === p.F.y, '直球的目標不會變'); }
}
console.log('共 ' + ST.n + ' 球：速球 ' + ST.fast + '、變速球 ' + ST.change + '、曲球 ' + ST.curve + '；壞球 ' + ST.ball + '；壞球最貼近 ' + ST.minBallDist.toFixed(3));
ok(ST.curve > 500 && ST.change > 1000 && ST.fast > 3000, '各種球都會出現');
ok(ST.strikeChange > 200, '好球也會有變速球');
ok(ST.curveEarly === ST.curve, '曲球飛到一半時，離一開始飛向的點 S 還不到偏移量的 13%（一開始像好球）');
// 第 1 關：沒有變速球、沒有曲球
{ let c = 0, ch = 0, bl = 0; for (let i = 0; i < 3000; i++) { const p = T.makePitch(1, rnd); if (p.type === 'curve') c++; if (p.type === 'change') ch++; if (!p.strike) bl++; } ok(c === 0 && ch === 0 && Math.abs(bl / 3000 - T.P_BALL[0]) < 0.03, '第 1 關：只有速球；壞球約 ' + (100 * bl / 30).toFixed(0) + '%'); }
// 到頂：壞球比例、變速球比例、曲球在壞球裡的比例
{ let b = 0, ch = 0, cv = 0, N = 20000; for (let i = 0; i < N; i++) { const p = T.makePitch(T.RAMP_LEVELS, rnd); if (!p.strike) b++; if (p.type === 'change') ch++; if (p.type === 'curve') cv++; }
  ok(Math.abs(b / N - T.P_BALL[1]) < 0.02 && Math.abs(cv / b - T.P_CURVE[1]) < 0.03, '到頂：壞球 ' + (100 * b / N).toFixed(1) + '%，曲球佔壞球 ' + (100 * cv / b).toFixed(1) + '%'); ok(ch / N > 0.15 && ch / N < T.P_CHANGE[1], '到頂：變速球 ' + (100 * ch / N).toFixed(1) + '%（只出現在非曲球裡，所以小於 ' + T.P_CHANGE[1] + '）'); }

// ── 球的畫面位置 ──
const geom = { V: { x: 236, y: 190 }, C: { x: 236, y: 400 }, hw: 80, hh: 92 };
for (let i = 0; i < 2000; i++) {
  const p = T.makePitch(1 + (i % 25), rnd), b0 = T.ballAt(p, 0, geom), b1 = T.ballAt(p, 1, geom);
  ok(near(b0.x, geom.V.x, 1e-9) && near(b0.y, geom.V.y, 1e-9) && near(b0.r, T.BALL_R[0], 1e-9), 'u=0：球在投手出手的位置、最小');
  ok(near(b1.x, geom.C.x + p.F.x * geom.hw, 1e-6) && near(b1.y, geom.C.y + p.F.y * geom.hh, 1e-6) && near(b1.r, T.BALL_R[1], 1e-9), 'u=1：球在 F 對應的畫面位置、最大');
  let prevY = -1e9, prevR = 0; for (let u = 0; u <= 1.0001; u += 0.02) { const b = T.ballAt(p, u, geom); ok(b.r >= prevR - 1e-9, '球越來越大'); prevR = b.r; if (p.F.y > 0 && p.S.y > 0) { /* 往下的球 y 單調 */ } }
  if (p.type !== 'curve') for (let u = 0.1; u <= 1; u += 0.1) { const b = T.ballAt(p, u, geom), e = T.easeU(u), tx = geom.V.x + (geom.C.x + p.F.x * geom.hw - geom.V.x) * e; ok(near(b.x, tx, 1e-6), '直球在 V 到終點的直線上'); }
}
ok(near(T.easeU(1), 1) && near(T.easeU(0), 0) && T.easeU(0.5) < 0.5 && T.easeU(-1) === 0, 'easeU：越近越快（0.5 時還沒到一半）');
// 變速球和速球：同一個進度 u 的位置完全一樣（只差時間）
{ const a = { type: 'fast', F: { x: 0.3, y: -0.2 }, S: { x: 0.3, y: -0.2 }, strike: true }, b = { type: 'change', F: { x: 0.3, y: -0.2 }, S: { x: 0.3, y: -0.2 }, strike: true }; for (let u = 0; u <= 1; u += 0.1) { const pa = T.ballAt(a, u, geom), pb = T.ballAt(b, u, geom); ok(near(pa.x, pb.x) && near(pa.y, pb.y) && near(pa.r, pb.r), '變速球和速球路徑相同'); } }
// 曲球：一開始跟「直接飛向 S 的速球」幾乎一樣，最後落在 F
{ const c = { type: 'curve', F: { x: 1.6, y: 0.3 }, S: { x: 0.2, y: 0.1 }, strike: false }, s = { type: 'fast', F: { x: 0.2, y: 0.1 }, S: { x: 0.2, y: 0.1 }, strike: true };
  const early = T.ballAt(c, 0.4, geom), ref = T.ballAt(s, 0.4, geom); ok(Math.hypot(early.x - ref.x, early.y - ref.y) < 6, '曲球 40% 的時候和直球差不到 6px：' + Math.hypot(early.x - ref.x, early.y - ref.y).toFixed(2));
  const late = T.ballAt(c, 1, geom); ok(near(late.x, geom.C.x + 1.6 * geom.hw, 1e-6), '曲球最後落在 F'); }

// ── 判定 ──
{ const p = { strike: true, tFly: 1.0, win: 0.1, type: 'fast', F: { x: 0, y: 0 }, S: { x: 0, y: 0 } };
  const r = t => T.judgeSwing(p, t).result;
  ok(r(-0.2) === 'pre' && r(-0.0001) === 'pre' && r(0) === 'early' && r(0.5) === 'early' && r(0.8999) === 'early', '太早');
  ok(r(0.9) === 'hit' && r(1.0) === 'hit' && r(1.1) === 'hit', '窗口內（含邊界）＝打到');
  ok(r(1.1001) === 'late' && r(2) === 'late', '太晚');
  ok(near(T.judgeSwing(p, 0.8679).err, -0.1321, 1e-9) && T.judgeSwing(p, 1.2).err > 0, '誤差＝點的時間 − 到達時間');
  const q = Object.assign({}, p, { strike: false }); ok(T.judgeSwing(q, 1.0).result === 'ball' && T.judgeSwing(q, 0.2).result === 'ball' && T.judgeSwing(q, -0.5).result === 'pre', '壞球揮了＝失敗（不管時間）；還沒出手揮＝pre'); }
// 說明文字
{ const p = { strike: true, tFly: 1.0, win: 0.02, type: 'fast', F: { x: 0, y: 0 }, S: { x: 0, y: 0 } };
  ok(T.whyText(T.judgeSwing(p, 0.9679), p) === '早了 0.0321 秒！要在球到好球帶的瞬間揮（窗口 ±0.0200 秒）', '早了 0.0321 秒（X.XXXX 四位小數）：' + T.whyText(T.judgeSwing(p, 0.9679), p));
  ok(/晚了 0.0700 秒/.test(T.whyText(T.judgeSwing(p, 1.07), p)) && /全壘打/.test(T.whyText(T.judgeSwing(p, 1.01), p)) && /壞球/.test(T.whyText({ result: 'ball' }, Object.assign({}, p, { strike: false }))) && /彎出好球帶/.test(T.whyText({ result: 'ball' }, { type: 'curve' })) && /沒有揮棒/.test(T.whyText({ result: 'strike' }, p)) && /忍住/.test(T.whyText({ result: 'pass' }, p)) && /還沒出手/.test(T.whyText({ result: 'pre' }, p)), '各種說明'); }
// 重播時間
for (let lv = 1; lv <= 25; lv++) for (let k = 0; k < 20; k++) { const p = T.makePitch(lv, rnd), ms = T.replayMs(p); ok(ms >= T.REPLAY_MIN_MS && ms <= T.REPLAY_MAX_MS && ms === Math.round(Math.max(T.REPLAY_MIN_MS, Math.min(T.REPLAY_MAX_MS, p.tFly / T.REPLAY_SPEED * 1000))), '重播 ' + ms + ' 毫秒'); }

// ── 程式裡的接線 ──
{ const rd = pth => require('fs').readFileSync(require('path').resolve(__dirname, pth), 'utf8'), src = rd('../../js/reaction_homerun.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: replayMs\(p\) \+ 1700/.test(src) && /replay\(r, tS\)/.test(src) && /hmr-final--show/.test(src) && /hmr-swingmark/.test(src), '失敗：慢動作重播、標出球最後的位置與你揮棒的時間、停格夠久');
  ok(/judgeSwing\(p, tS\)/.test(src) && /AFTER_MS/.test(src) && /result: p\.strike \? 'strike' : 'pass'/.test(src), '判定用 judgeSwing；球到了沒揮：好球失敗、壞球過關');
  ok(/pointerdown/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src) && /armed/.test(src), '點一下揮棒；solve／wrong 只排一次');
  ok(/\.hmr-zone \{[^}]*var\(--hmr-zone-line\)/.test(css) && /\.hmr-grass \{[^}]*var\(--hmr-grass\)/.test(css) && /\.hmr-final--ball \{[^}]*var\(--hmr-final-bad\)/.test(css) && /\.hmr-bat--swing/.test(css), '好球帶、草地、記號用 CSS 變數');
  ok(boot.indexOf("'js/reaction_homerun.js'") > 0 && /變速球/.test(G.rule) && /曲球/.test(G.rule), 'boot.js 有載入、玩法說明提到變速球和曲球'); }
ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(6) && T.rating(6) !== T.rating(12) && T.rating(12) !== T.rating(19), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
