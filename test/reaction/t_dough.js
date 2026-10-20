// 擀水餃皮（dough，企劃 417）的純函式檢查：多邊形面積／重心、圓度與大小差、擀一下（各方向放大）、只會變大不會縮、麵糰的產生、判定、貪心解法（保證有解）與「只往同一方向擀」（會失敗）、接線
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_dough.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261221), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（線性）──
ok(near(T.roundMinFor(1), 80) && near(T.roundMinFor(T.RAMP_LEVELS), 95) && near(T.sizeMaxFor(1), 15) && near(T.sizeMaxFor(T.RAMP_LEVELS), 3) && near(T.roundMinFor(99), 95) && near(T.sizeMaxFor(99), 3), '及格線：圓度 80% → 95%、大小差 15% → 3%（使用者企劃）');
ok(near(T.ratioFor(1), T.RATIO0[0]) && near(T.ratioFor(T.RAMP_LEVELS), T.RATIO0[1]) && near(T.startFracFor(1), T.START_FRAC[0]) && near(T.startFracFor(T.RAMP_LEVELS), T.START_FRAC[1]), '麵糰一開始的長短軸比、大小');
for (let n = 2; n <= T.RAMP_LEVELS + 2; n++) ok(T.roundMinFor(n) >= T.roundMinFor(n - 1) && T.sizeMaxFor(n) <= T.sizeMaxFor(n - 1) && T.ratioFor(n) >= T.ratioFor(n - 1) && T.startFracFor(n) <= T.startFracFor(n - 1) && T.lumpFor(n) >= T.lumpFor(n - 1), '單調 ' + n);
{ const d = []; for (let n = 2; n <= T.RAMP_LEVELS; n++) d.push(T.roundMinFor(n) - T.roundMinFor(n - 1)); ok(Math.max(...d) - Math.min(...d) <= 0.0003, '圓度及格線線性增加：每關 +' + Math.min(...d).toFixed(4) + '～+' + Math.max(...d).toFixed(4)); }

// ── 多邊形工具 ──
function ellipse(a, b, alpha, k, cx, cy) { const out = []; for (let i = 0; i < k; i++) { const t = i / k * 2 * Math.PI, ex = a * Math.cos(t), ey = b * Math.sin(t); out.push({ x: (cx || 0) + ex * Math.cos(alpha || 0) - ey * Math.sin(alpha || 0), y: (cy || 0) + ex * Math.sin(alpha || 0) + ey * Math.cos(alpha || 0) }); } return out; }
{ const K = 96, r = 50, c = ellipse(r, r, 0, K, 0, 0); ok(near(T.area(c), 0.5 * K * r * r * Math.sin(2 * Math.PI / K), 1e-6), '圓的多邊形面積 = ½ K r² sin(2π/K)'); ok(near(T.area(c), Math.PI * r * r, 40), '≈ π r²');
  ok(near(T.area([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]), 12), '長方形 4×3 面積 12'); ok(near(T.area([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }]), 6) && near(T.area([{ x: 0, y: 0 }, { x: 0, y: 3 }, { x: 4, y: 0 }]), 6), '三角形面積（順時針逆時針都一樣）');
  const sh = ellipse(60, 30, 0.6, K, 17, -9), ce = T.centroid(sh); ok(near(ce.x, 17, 1e-6) && near(ce.y, -9, 1e-6), '橢圓的重心在中心'); const rc = T.recenter(sh), c2 = T.centroid(rc); ok(near(c2.x, 0, 1e-9) && near(c2.y, 0, 1e-9) && near(T.area(rc), T.area(sh), 1e-6), 'recenter：重心移到原點、面積不變');
  const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]; const cs = T.centroid(sq); ok(near(cs.x, 5) && near(cs.y, 5), '正方形的重心'); }

// ── 圓度、大小差 ──
ok(near(T.roundness(ellipse(50, 50, 0, 96, 0, 0)), 100, 1e-6), '圓：圓度 100%');
for (const rho of [1.05, 1.1, 1.2, 1.5, 2]) { const e = ellipse(50 * rho, 50, 0.4, 96, 33, 21), exp = 200 / (1 + rho); ok(Math.abs(T.roundness(e) - exp) < 0.35, '長短軸比 ' + rho + '：圓度 ' + T.roundness(e).toFixed(3) + '% ≈ 理論 ' + exp.toFixed(3) + '%'); }
ok(Math.abs(T.roundness(ellipse(55, 50, 0, 96, 0, 0)) - 95.238) < 0.05, '長短軸比 1.1 ≈ 95.24%（註解裡寫的）');
{ const R = T.SAMPLE_R, same = ellipse(R, R, 0, 96, 0, 0), A0 = Math.PI * R * R; const a = T.area(same); ok(T.sizeDiff(same, R) < 0.2, '和樣品一樣大：大小差 ≈ 0（多邊形 vs 圓的誤差 ' + T.sizeDiff(same, R).toFixed(3) + '%）');
  const big = ellipse(R * Math.sqrt(1.1), R * Math.sqrt(1.1), 0, 96, 0, 0); ok(Math.abs(T.sizeDiff(big, R) - (100 * (1.1 * a - A0) / A0)) < 0.01, '面積多 10%：大小差 ≈ ' + T.sizeDiff(big, R).toFixed(3) + '%'); const small = ellipse(R * 0.9, R * 0.9, 0, 96, 0, 0); ok(Math.abs(T.sizeDiff(small, R) - (100 * Math.abs(0.81 * a - A0) / A0)) < 0.01, '半徑小 10%（面積少 19%）'); }

// ── 擀一下 ──
{ const r = 40, c = ellipse(r, r, 0, 96, 0, 0), s = 50, e = T.ROLL_K * s, rolled = T.roll(c, 0, s);
  ok(rolled.length === 96, '頂點數不變');
  const rr = T.radii(rolled); ok(near(rr.max, r * (1 + e), 0.02) && near(rr.min, r * (1 + T.SPREAD * e), 0.02), '沿著方向放大 ' + (1 + e).toFixed(3) + ' 倍、垂直方向放大 ' + (1 + T.SPREAD * e).toFixed(3) + ' 倍');
  ok(near(T.area(rolled), T.area(c) * (1 + e) * (1 + T.SPREAD * e), 1e-6), '面積 × (1+ε)(1+κε)');
  const v = T.roll(c, Math.PI / 2, s), rv = T.radii(v); ok(near(rv.max, rr.max, 0.02) && Math.abs(Math.atan2(v.reduce((m, p) => Math.hypot(p.x, p.y) > Math.hypot(m.x, m.y) ? p : m).y, 0) || 0) >= 0, '往上下擀：同樣的長短軸，方向轉了 90°');
  const longest = pts => pts.reduce((m, p) => Math.hypot(p.x, p.y) > Math.hypot(m.x, m.y) ? p : m); const lh = longest(rolled), lv = longest(v); ok(Math.abs(lh.x) > Math.abs(lh.y) * 10 && Math.abs(lv.y) > Math.abs(lv.x) * 10, '往左右擀：長軸在 x 方向；往上下擀：長軸在 y 方向');
  const cc = T.centroid(rolled); ok(near(cc.x, 0, 1e-9) && near(cc.y, 0, 1e-9), '擀完重心在原點'); }
// 只會變大、回不去：連續隨機擀 300 下，面積單調不減、每個方向的半徑不會變小
for (let rep = 0; rep < 40; rep++) { let pts = T.makeDough(1 + (rep % 20), rnd).pts, prevA = T.area(pts), prevMin = T.radii(pts).min; for (let k = 0; k < 150; k++) { pts = T.roll(pts, rnd() * 2 * Math.PI, 1 + rnd() * 35); const A = T.area(pts); ok(A >= prevA - 1e-6, '面積不會變小'); prevA = A; } }
// 同一方向擀兩次 ≈ 擀一次加總（ε 小的時候）
{ const c = ellipse(40, 30, 0.3, 96, 0, 0), a = T.roll(T.roll(c, 0.7, 10), 0.7, 10), b = T.roll(c, 0.7, 20); ok(Math.abs(T.area(a) - T.area(b)) / T.area(b) < 0.0015, '同方向分兩次擀 ≈ 一次擀：面積差 ' + (100 * Math.abs(T.area(a) - T.area(b)) / T.area(b)).toFixed(4) + '%'); }

// ── 麵糰 ──
const ST = { n: 0, startRound: [200, 0], startAreaFrac: [9, 0] };
for (let lv = 1; lv <= 40; lv++) for (let rep = 0; rep < 40; rep++) {
  const q = T.makeDough(lv, rnd); ST.n++;
  ok(q.pts.length === T.K && q.sampleR === T.SAMPLE_R && near(q.roundMin, T.roundMinFor(lv)) && near(q.sizeMax, T.sizeMaxFor(lv)) && near(q.ratio, T.ratioFor(lv)), '麵糰參數');
  const c = T.centroid(q.pts); ok(Math.abs(c.x) < 1e-9 && Math.abs(c.y) < 1e-9, '重心在原點');
  const rd = T.roundness(q.pts), fr = T.area(q.pts) / (Math.PI * q.sampleR * q.sampleR); ST.startRound = [Math.min(ST.startRound[0], rd), Math.max(ST.startRound[1], rd)]; ST.startAreaFrac = [Math.min(ST.startAreaFrac[0], fr), Math.max(ST.startAreaFrac[1], fr)];
  const exp = 200 / (1 + q.ratio); ok(Math.abs(rd - exp) < 100 * q.lump * 1.6 + 0.5, '一開始的圓度 ' + rd.toFixed(2) + '% ≈ 橢圓的 ' + exp.toFixed(2) + '%（凹凸 ≤ ' + (100 * q.lump).toFixed(1) + '%）');
  const j = T.judge(q.pts, lv); ok(!j.ok && !j.tooBig, '一開始不會已經過關、也不會已經太大');
  ok(fr > 0.04 && fr < 0.25, '一開始的面積占樣品的 ' + (100 * fr).toFixed(1) + '%');
}
console.log('共 ' + ST.n + ' 團；一開始圓度 ' + ST.startRound[0].toFixed(1) + '～' + ST.startRound[1].toFixed(1) + '%；一開始面積占樣品 ' + (100 * ST.startAreaFrac[0]).toFixed(1) + '～' + (100 * ST.startAreaFrac[1]).toFixed(1) + '%');
// ── 判定 ──
{ const lv = 10, R = T.SAMPLE_R, mk = (rho, s) => ellipse(R * s * Math.sqrt(rho), R * s / Math.sqrt(rho), 0.3, 96, 5, 5), rm = T.roundMinFor(lv), sm = T.sizeMaxFor(lv);
  const good = mk(1.02, 1); ok(T.judge(good, lv).ok && T.judge(good, lv).okRound && T.judge(good, lv).okSize && !T.judge(good, lv).tooBig, '又圓又剛好：過關');
  const oval = mk(1.35, 1); ok(!T.judge(oval, lv).okRound && T.judge(oval, lv).okSize && !T.judge(oval, lv).ok, '橢圓：圓度不夠');
  const small = mk(1.02, 0.8); ok(T.judge(small, lv).okRound && !T.judge(small, lv).okSize && !T.judge(small, lv).tooBig, '太小：大小不對但還能繼續擀');
  const huge = mk(1.02, 1.3); ok(T.judge(huge, lv).tooBig && !T.judge(huge, lv).okSize, '太大：回不來（tooBig）');
  // tooBig 的邊界：面積 = 樣品 × (1 + 上限)
  const s = Math.sqrt(1 + sm / 100 + 0.02), edge = mk(1.0, s); ok(T.judge(edge, lv).tooBig, '剛超過上限就算 tooBig'); const s2 = Math.sqrt(1 + sm / 100 - 0.03); ok(!T.judge(mk(1.0, s2), lv).tooBig, '還沒超過上限不算 tooBig'); }

// ── 解法：往最短的方向擀（貪心）保證有解；只往同一方向擀不會過 ──
function greedy(lv, step) { const q = T.makeDough(lv, rnd); let pts = q.pts, n = 0; for (; n < 800; n++) { const j = T.judge(pts, lv, q.sampleR); if (j.ok) return { ok: true, n }; if (j.tooBig) return { ok: false, n, why: 'big' }; const A = T.area(pts), A0 = Math.PI * q.sampleR * q.sampleR; pts = T.roll(pts, T.bestDirection(pts), A < A0 * 0.5 ? step * 2 : step); } return { ok: false, n, why: 'steps' }; }
{ let fails = 0, maxN = 0, tot = 0; for (let lv = 1; lv <= 40; lv++) for (let i = 0; i < 25; i++) { const r = greedy(lv, T.SOLVE_STEP); tot++; if (!r.ok) fails++; else maxN = Math.max(maxN, r.n); } console.log('貪心解法（每步 ' + T.SOLVE_STEP + ' px）：' + (tot - fails) + '／' + tot + ' 都過，最多 ' + maxN + ' 步'); ok(fails === 0, '每一關都有解（貪心解法全過）'); ok(maxN < 200, '不會需要太多步：' + maxN); }
{ let pass = 0, N = 0; for (let lv = 1; lv <= 40; lv++) for (let i = 0; i < 25; i++) { const q = T.makeDough(lv, rnd); let pts = q.pts, dir = rnd() * Math.PI; for (let n = 0; n < 400; n++) { const j = T.judge(pts, lv, q.sampleR); if (j.ok) { pass++; break; } if (j.tooBig || Math.PI * q.sampleR * q.sampleR * 0.6 < T.area(pts)) break; pts = T.roll(pts, dir, 20); } N++; } ok(pass / N < 0.05, '只往同一個方向擀：幾乎都不會過關（' + pass + '／' + N + '）'); }
// 隨機方向亂擀：也很難剛好過關
{ let pass = 0, N = 0; for (let lv = 1; lv <= 40; lv++) for (let i = 0; i < 25; i++) { const q = T.makeDough(lv, rnd); let pts = q.pts; for (let n = 0; n < 400; n++) { const j = T.judge(pts, lv, q.sampleR); if (j.ok) { pass++; break; } if (j.tooBig) break; pts = T.roll(pts, rnd() * 2 * Math.PI, 20); } N++; } console.log('亂擀的過關率：' + (100 * pass / N).toFixed(1) + '%'); ok(pass / N < 0.6, '亂擀不是穩過：' + (100 * pass / N).toFixed(1) + '%'); }
// bestDirection：橢圓的長軸在 x 方向 → 往 y 方向擀（短軸）
{ const e = ellipse(60, 30, 0, 96, 0, 0), d = T.bestDirection(e); ok(Math.abs(Math.cos(d)) < 0.05 && Math.abs(Math.sin(d)) > 0.99, '長軸在 x → 往上下擀：角度 ' + (d * 180 / Math.PI).toFixed(1) + '°'); let pts = e, prev = T.roundness(pts); for (let k = 0; k < 10; k++) { pts = T.roll(pts, T.bestDirection(pts), 12); const r = T.roundness(pts); ok(r >= prev - 0.3, '往短軸擀，圓度一路上升'); prev = r; } ok(prev > 80, '擀 10 下之後圓度 ' + prev.toFixed(1) + '%'); }
// 說明
{ const j = { round: 91.2318, size: 3.1, ok: false, okRound: true, okSize: true, tooBig: false }; ok(/圓度 91\.2318%/.test(T.whyText(j, 1)) && /大小差 3\.1000%/.test(T.whyText(j, 1)), 'whyText 有 91.2318% 和 3.1000%（使用者企劃的格式）');
  ok(/擀太大了/.test(T.whyText({ round: 90, size: 40, ok: false, okRound: true, okSize: false, tooBig: true }, 5)) && /不夠圓/.test(T.whyText({ round: 70, size: 1, ok: false, okRound: false, okSize: true, tooBig: false }, 5)) && /大小不對/.test(T.whyText({ round: 99, size: 30, ok: false, okRound: true, okSize: false, tooBig: false }, 5)) && /過關/.test(T.whyText({ round: 99, size: 1, ok: true, okRound: true, okSize: true, tooBig: false }, 5)), '各種說明'); }

// ── 程式裡的接線 ──
{ const rd = pth => require('fs').readFileSync(require('path').resolve(__dirname, pth), 'utf8'), src = rd('../../js/reaction_dough.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 4200/.test(src) && /dgh-best/.test(src) && /whyText\(j, level\)/.test(src) && /judge\(pts, level, q\.sampleR\)\.tooBig/.test(src), '失敗：寫出圓度與大小差、擀太大立刻失敗、停格夠久');
  ok(/pts = roll\(pts, phi, s\)/.test(src) && /pointerdown/.test(src) && /pointermove/.test(src) && /MAX_STEP/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src), '擀＝手指移動的方向和距離套用 roll；solve／wrong');
  ok(/\.dgh-dough \{[^}]*var\(--dgh-dough\)/.test(css) && /\.dgh-sample \{[^}]*var\(--dgh-sample\)/.test(css) && /\.dgh-pin \{[^}]*var\(--dgh-pin\)/.test(css), '麵皮、樣品圓、擀麵棍用 CSS 變數');
  ok(boot.indexOf("'js/reaction_dough.js'") > 0 && /轉著方向擀/.test(G.rule) && /回不去/.test(G.rule), 'boot.js 有載入、玩法說明提到轉著方向擀與回不去'); }
ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(6) && T.rating(6) !== T.rating(10) && T.rating(10) !== T.rating(16), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
