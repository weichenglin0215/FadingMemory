// 搭一座橋：判定用「真的物理」（兩塊方塊都頂住橫板＋重心有被撐住）、出題保證有成功時機、兩塊方塊不會碰在一起、難度隨關卡線性加大
// V1.30：BW、OVERLAP、INDEXLINE 由玩家指定（目前的值見 js/reaction_bridge.js；測試跟著參數走）
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_bridge.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 30) console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const W = 472, SEED = seedOf(20261016), rnd = rng(SEED);

// ═══ 玩家指定的參數 ═══
ok(T.INDEXLINE.join() === '1,0', '參數 INDEXLINE=[1,0]；BW=' + T.BW + '、OVERLAP=' + T.OVERLAP);
ok(near(T.bwAt(1), T.BW[0]) && near(T.bwAt(T.RAMP_LEVELS), T.BW[1]) && near(T.bwAt(T.RAMP_LEVELS + 20), T.BW[1]), '方塊寬度第 1 關 ' + T.BW[0] + '、到頂 ' + T.BW[1] + '（之後維持）');
ok(near(T.overlapAt(1), T.OVERLAP[0]) && near(T.overlapAt(T.RAMP_LEVELS), T.OVERLAP[1]) && near(T.overlapAt(60), T.OVERLAP[1]), '進入橫板的深度 ' + T.OVERLAP[0] + ' → ' + T.OVERLAP[1]);
ok(near(T.lineAt(1), 1) && near(T.lineAt(T.RAMP_LEVELS), 0) && near(T.lineAt(60), 0), '虛線長度比例 100% → 0%');
for (let l = 1; l < T.RAMP_LEVELS; l++) ok(T.bwAt(l + 1) < T.bwAt(l) && T.overlapAt(l + 1) < T.overlapAt(l) && T.lineAt(l + 1) < T.lineAt(l) && T.omegaAt(l + 1) > T.omegaAt(l) && T.asymAt(l + 1) > T.asymAt(l) && T.offsetAt(l + 1) > T.offsetAt(l), '線性變難 ' + l);
{ const d = T.bwAt(1) - T.bwAt(2); for (let l = 1; l < T.RAMP_LEVELS; l++) ok(near(T.bwAt(l) - T.bwAt(l + 1), d, 1e-9), '方塊寬度線性 ' + l); }

// ═══ 判定：橫板 100～300（中心 200），方塊寬 bw ═══
const pl = { x0: 100, w: 200 }, BW0 = 48, J = (L, R, bw) => T.judge(pl, L, R, undefined, bw == null ? BW0 : bw);
// 1. 玩家回報的情況：方塊整塊進到橫板下面（左右兩側都在橫板的寬度範圍內）→ 以前被判失敗，現在要成功
{ let r = J(100 + 30 + BW0 / 2, 300 - 30 - BW0 / 2); ok(r.ok && r.reason === 'ok' && near(r.ovL, BW0) && near(r.ovR, BW0), '兩塊方塊整塊進入橫板下面（距離端點 30px）→ 成功：' + r.reason);
  r = J(100 + BW0 / 2, 300 - BW0 / 2); ok(r.ok, '方塊剛好貼齊橫板兩端、整塊在橫板下面 → 成功');
  r = J(100 + 80, 300 - 80); ok(r.ok, '兩塊方塊都往橫板中間靠（各離中心 20px 以上）→ 成功');
  r = J(100 + 60, 300 - 60, 10); ok(r.ok && near(r.ovL, 10), '窄方塊（寬 10）整塊在橫板下面 → 成功'); }
// 2. 方塊只有一部分頂住橫板端點
{ let r = J(100 - BW0 / 2 + 20, 300 + BW0 / 2 - 20); ok(r.ok && near(r.ovL, 20) && near(r.ovR, 20), '各頂住橫板端點 20px → 成功');
  r = J(100 - BW0 / 2 + 1, 300 + BW0 / 2 - 1); ok(r.ok && near(r.ovL, 1), '各頂住 1px（END_MARGIN）→ 成功（剛好）');
  r = J(100 - BW0 / 2 + 0.9, 300 + BW0 / 2 - 0.9); ok(!r.ok && r.reason === 'none', '只頂住 0.9px（不到 END_MARGIN）→ 沒頂住：' + r.reason); }
// 3. 失敗種類
{ let r = J(100 + 30 + BW0 / 2, 450); ok(!r.ok && r.reason === 'one' && r.side === 'R' && r.okL && !r.okR, '右邊的方塊離板子很遠 → 只有左邊頂住，右端沒撐住：' + r.reason + r.side);
  ok(r.support[0] === 100 + 30 && near(r.pivot, 100 + 30 + BW0), '只有一塊頂住：轉軸是那塊方塊離沒撐住那端最近的接觸點');
  r = J(20, 300 - 30 - BW0 / 2); ok(!r.ok && r.reason === 'one' && r.side === 'L' && near(r.pivot, 300 - 30 - BW0), '左邊的方塊沒頂住 → 只有右邊頂住');
  r = J(20, 450); ok(!r.ok && r.reason === 'none', '兩塊都沒頂住橫板 → 掉到地上');
  r = J(60, 340); ok(!r.ok && r.reason === 'none', '兩塊方塊都在橫板外面（各只差一點點沒碰到）→ 掉到地上');
  // 兩塊都頂住、但重心沒被撐住 → 翻倒：兩塊方塊都擠在橫板的左半邊
  r = J(120, 170); ok(!r.ok && r.reason === 'tip' && r.side === 'R' && near(r.pivot, 170 + BW0 / 2) && r.com === 200, '兩塊都在橫板左半邊（重心 200 在最右接觸點 194 的右邊）→ 往右翻倒：' + JSON.stringify([r.reason, r.side, r.pivot]));
  r = J(230, 280); ok(!r.ok && r.reason === 'tip' && r.side === 'L' && near(r.pivot, 230 - BW0 / 2), '兩塊都在橫板右半邊 → 往左翻倒');
  r = J(150, 180); ok(r.reason === 'ok' || r.reason === 'tip', '兩塊靠得很近：依重心判斷'); }
// 4. 重心剛好在接觸範圍最外側的邊界（等於算被撐住）
{ const r = T.judge({ x0: 0, w: 100 }, 20, 80, 1, 40); ok(r.ok && r.hull[0] === 0 && r.hull[1] === 100, '重心在兩接觸範圍之間：' + JSON.stringify(r.hull)); }
// 5. 與暴力法對照：隨機位置，judge 的結果必須同時符合「兩塊都頂住」與「重心在最外側接觸點之間」
for (let i = 0; i < 20000; i++) {
  const bw = 4 + rnd() * 44, p0 = 50 + rnd() * 150, pw = 100 + rnd() * 150, L = rnd() * W, R = rnd() * W, plank = { x0: p0, w: pw };
  const r = T.judge(plank, L, R, 1, bw);
  const cL = [Math.max(p0, L - bw / 2), Math.min(p0 + pw, L + bw / 2)], cR = [Math.max(p0, R - bw / 2), Math.min(p0 + pw, R + bw / 2)];
  const tl = cL[1] - cL[0] >= 1, tr = cR[1] - cR[0] >= 1, com = p0 + pw / 2;
  const exp = tl && tr ? (com >= cL[0] && com <= cR[1] ? 'ok' : 'tip') : (tl || tr ? 'one' : 'none');
  ok(r.reason === exp && r.ok === (exp === 'ok') && r.okL === tl && r.okR === tr, '暴力核對 #' + i + '：' + r.reason + ' vs ' + exp);
  if (r.reason === 'tip' || r.reason === 'one') ok(Number.isFinite(r.pivot) && (r.side === 'L' || r.side === 'R'), '失敗時有轉軸與方向');
}
ok(T.overlap(0, 10, 10, 20) === null && T.overlap(0, 10, 5, 20)[0] === 5, '區間重疊');

// ═══ 出題 ═══
const shares = {}; let fallback = 0, nul = 0;
for (let lv = 1; lv <= 40; lv++) {
  let minShare = 1, sum = 0; const N = lv % 3 === 1 ? 120 : 60; let cnt = 0;
  for (let k = 0; k < N; k++) {
    const cfg = T.makeLevel(lv, W, rnd);
    if (!cfg) { nul++; continue; }
    const st = T.motionStats(cfg, W);
    if (st.minGap < T.MIN_GAP - 1e-6) { fallback++; continue; }          // 方塊移出畫面是允許的（st.inside 只是統計）
    cnt++;
    ok(near(cfg.bw, T.bwAt(lv)) && cfg.ov >= T.END_MARGIN && cfg.ov <= T.overlapAt(lv) + 1e-9 && cfg.ov <= (cfg.plank.w - T.MIN_GAP) / 2 + 1e-9 && near(cfg.line, T.lineAt(lv)), '方塊寬度／進入深度／虛線比例 lv' + lv);
    const p = T.posAt(cfg, cfg.tStar); ok(T.judge(cfg.plank, p.L, p.R, T.END_MARGIN, cfg.bw).ok, '成功時刻一定成功 lv' + lv);
    for (const k2 of [1, 2, 5]) { const q = T.posAt(cfg, cfg.tStar + k2 * cfg.T); ok(T.judge(cfg.plank, q.L, q.R, T.END_MARGIN, cfg.bw).ok, '每個週期都會再出現成功時機'); }
    ok(cfg.plank.w >= T.PLANK_W[0] && cfg.plank.w <= T.PLANK_W[1] && cfg.plank.x0 >= T.EDGE_X && cfg.plank.x0 + cfg.plank.w <= W - T.EDGE_X, '橫板在畫面內 lv' + lv);
    ok(cfg.L.A > 0 && cfg.R.A > 0, '振幅為正');
    // 方塊往中間移動時進入橫板的最深處 ＝ ov（左邊方塊的右邊緣在橫板左端內側 ov、右邊方塊的左邊緣在橫板右端內側 ov）
    let maxInL = -1e9, maxInR = -1e9, minOutL = 1e9, minOutR = 1e9;
    for (let i = 0; i < 720; i++) { const q = T.posAt(cfg, cfg.T * i / 720); const inL = q.L + cfg.bw / 2 - cfg.plank.x0, inR = cfg.plank.x0 + cfg.plank.w - (q.R - cfg.bw / 2); maxInL = Math.max(maxInL, inL); maxInR = Math.max(maxInR, inR); minOutL = Math.min(minOutL, inL); minOutR = Math.min(minOutR, inR); }
    ok(near(maxInL, cfg.ov, 0.5) && near(maxInR, cfg.ov, 0.5), '最靠近中間時進入橫板 ' + cfg.ov.toFixed(1) + 'px：左 ' + maxInL.toFixed(1) + '／右 ' + maxInR.toFixed(1));
    ok(minOutL <= -T.AMIN_EXTRA + 0.5 && minOutR <= -T.AMIN_EXTRA + 0.5, '往外移動時完全離開橫板至少 ' + T.AMIN_EXTRA + 'px：' + minOutL.toFixed(1) + '／' + minOutR.toFixed(1));
    // 方塊「完全照參數」動：振幅 ＝ AMP 漸變值 × (1 ± ASYM×0.6～1)，只有下限 ov/2 + AMIN_EXTRA，沒有被畫面邊緣壓小；頻率 ＝ omegaAt
    const Amp = T.ampAt(lv), Amin = cfg.ov / 2 + T.AMIN_EXTRA, asy = T.asymAt(lv);
    // 頻率照參數：快的方塊 ＝ OMEGA，慢的 ＝ OMEGA × p／q；Tc ＝ q × 快的週期（兩塊同時回到同一個姿勢）
    const wF = Math.max(cfg.L.w, cfg.R.w), wS = Math.min(cfg.L.w, cfg.R.w), [rp, rq] = cfg.ratio;
    ok(near(cfg.omega, T.omegaAt(lv)) && near(wF, T.omegaAt(lv)) && near(wS, T.omegaAt(lv) * rp / rq) && near(cfg.T, 2 * Math.PI / T.omegaAt(lv) * rq), '頻率照參數：快 ' + wF.toFixed(2) + '、慢 ' + wS.toFixed(2) + '（' + rp + '/' + rq + '）、Tc ' + cfg.T.toFixed(2));
    ok(T.FREQ_RATIO.some(r => r[0] === rp && r[1] === rq), '頻率比來自 FREQ_RATIO');
    ok(cfg.tStar >= T.FIRST_MIN_S - 1e-9 && cfg.tStar <= T.FIRST_MIN_S + cfg.T + 1e-9, '第一次同時頂住的時刻在 FIRST_MIN_S 之後、一個 Tc 之內：' + cfg.tStar.toFixed(2));
    for (let te = 0; te <= T.FIRST_MIN_S; te += 0.05) { const pe = T.posAt(cfg, te); if (T.judge(cfg.plank, pe.L, pe.R, T.END_MARGIN, cfg.bw).ok) { ok(false, '開局前 ' + T.FIRST_MIN_S + ' 秒不能有同時頂住（t=' + te.toFixed(2) + '）lv' + lv); break; } }
    const s = T.successShare(cfg); minShare = Math.min(minShare, s); sum += s;
    ok(s > 0.004, '每一關都有可以成功的時機（佔週期 ' + (s * 100).toFixed(2) + '%）lv' + lv);
  }
  shares[lv] = { min: minShare, avg: sum / Math.max(1, cnt) };
}
console.log('成功時機佔週期的比例（平均／最小）：lv1', (shares[1].avg * 100).toFixed(1) + '%/' + (shares[1].min * 100).toFixed(1) + '%', 'lv10', (shares[10].avg * 100).toFixed(1) + '%', 'lv20', (shares[20].avg * 100).toFixed(1) + '%', 'lv30', (shares[30].avg * 100).toFixed(1) + '%/' + (shares[30].min * 100).toFixed(1) + '%');
ok(shares[1].avg > shares[30].avg + 0.1, '後面的關卡成功時機比較短（平均）：' + shares[1].avg.toFixed(2) + ' → ' + shares[30].avg.toFixed(2));
ok(shares[30].min > 0.004, '最難的一關也至少有 0.4% 的週期可以成功（約 ' + (shares[30].min * 100).toFixed(2) + '%）');
ok(fallback === 0 && nul === 0, '每一關都找得到合格題目：fallback ' + fallback + '、null ' + nul);

// ═══ 不論 PLANK_W／AMIN_EXTRA／OFFSET 怎麼設，都要出得了題（玩家回報：PLANK_W 大於 140 畫面一片空白＝makeLevel 回傳 null）═══
{ const configs = [{ plankW: [60, 60] }, { plankW: [100, 100] }, { plankW: [140, 140] }, { plankW: [141, 141] }, { plankW: [150, 150] }, { plankW: [200, 250] }, { plankW: [300, 300] }, { plankW: [400, 460] }, { plankW: [472, 472] },
    { plankW: [140, 140], aminExtra: 100 }, { plankW: [250, 250], aminExtra: 200 }, { plankW: [130, 250], offset: 0.45 }, { plankW: [130, 250], offset: 0 }, { plankW: [150, 150], aminExtra: 40, offset: 0.33 }];
  for (const o of configs) for (const lv of [1, 2, 3, 5, 10, 15, 20, 30, 45]) for (let k = 0; k < 15; k++) {
    const cfg = T.makeLevel(lv, W, rnd, o), tag = JSON.stringify(o) + ' lv' + lv;
    if (!cfg) { ok(false, '回傳 null（畫面會一片空白）：' + tag); continue; }
    const st = T.motionStats(cfg, W), p = T.posAt(cfg, cfg.tStar);
    ok(st.minGap >= T.MIN_GAP - 1e-6, '兩塊方塊不互撞：' + tag + ' minGap ' + st.minGap.toFixed(1));
    ok(T.judge(cfg.plank, p.L, p.R, T.END_MARGIN, cfg.bw).ok, '成功時刻一定成功：' + tag);
    ok(cfg.plank.x0 >= T.EDGE_X && cfg.plank.x0 + cfg.plank.w <= W - T.EDGE_X + 1e-9 && cfg.plank.w >= 26, '橫板在畫面內：' + tag + ' x0=' + cfg.plank.x0 + ' w=' + cfg.plank.w);
  } }

// ═══ 玩家回報：一開局兩塊同時向內靠近（或同時向外），半秒就能算準按下 → 改成一開局位置、方向都是隨機的，兩塊的頻率也不一樣 ═══
{ const N = 4000, dirs = { '++': 0, '+-': 0, '-+': 0, '--': 0 }, dist = [], fastLeft = [0, 0], pressEarly = { ok: 0, tries: 0 }, ratios = {};
  for (let i = 0; i < N; i++) {
    const lv = 1 + (i % 40), cfg = T.makeLevel(lv, W, rnd), p0 = T.posAt(cfg, 0), p1 = T.posAt(cfg, 0.05);
    // 開局的移動方向：L 往右（＋，靠攏中間）／往左（−）；R 往左（＋，靠攏中間）／往右（−）
    const inL = p1.L > p0.L, inR = p1.R < p0.R; dirs[(inL ? '+' : '-') + (inR ? '+' : '-')]++;
    dist.push(p0.L - (cfg.plank.x0)); fastLeft[cfg.fastLeft ? 1 : 0]++; ratios[cfg.ratio.join('/')] = (ratios[cfg.ratio.join('/')] || 0) + 1;
    // 以前的作弊法：開局後大約 0.3～1.0 秒就按放下。現在不管哪個時間點都不應該一定過關
    for (const tp of [0.3, 0.5, 0.7, 1.0]) { const q = T.posAt(cfg, tp); pressEarly.tries++; if (T.judge(cfg.plank, q.L, q.R, T.END_MARGIN, cfg.bw).ok) pressEarly.ok++; }
  }
  ok(Object.values(dirs).every(c => c > N * 0.06 && c < N * 0.40), '開局兩塊的移動方向：同時向內／同時向外／一內一外四種都會出現（同時向內比較少，因為那種開局很容易一下子就對準，出題時會排除）：' + JSON.stringify(dirs));
  ok(dirs['--'] > N * 0.2 && dirs['+-'] > N * 0.2 && dirs['-+'] > N * 0.2, '同時向外、一內一外都很常見');
  ok(pressEarly.ok === 0, '開局 0.3～1.0 秒按放下一次都不會過關：' + pressEarly.ok + '／' + pressEarly.tries);
  const mean = dist.reduce((a, b) => a + b, 0) / dist.length, sd = Math.sqrt(dist.reduce((a, b) => a + (b - mean) ** 2, 0) / dist.length);
  ok(sd > 60, '開局時左邊方塊的位置分散（標準差 ' + sd.toFixed(1) + 'px）');
  ok(fastLeft[0] > N * 0.4 && fastLeft[1] > N * 0.4, '左邊快／右邊快各一半：' + fastLeft);
  ok(Object.keys(ratios).length === T.FREQ_RATIO.length && ratios['1/2'] > N * 0.2, '各種頻率比都會出現（越後面越多種）：' + JSON.stringify(ratios));
  // 第 1 關只用第一個頻率比；到頂的那一關三種都用
  { const s1 = new Set(), s30 = new Set(); for (let i = 0; i < 300; i++) { s1.add(T.makeLevel(1, W, rnd).ratio.join('/')); s30.add(T.makeLevel(30, W, rnd).ratio.join('/')); } ok(s1.size === 1 && s30.size === T.FREQ_RATIO.length, '第 1 關 ' + [...s1] + '、第 30 關 ' + [...s30]); }
  // 同時頂住的時機每隔 Tc 重複（兩塊同時回到同一個姿勢）；兩塊「同時」頂住不是每個週期都剛好對準，快的跑 q 圈慢的跑 p 圈
  for (let i = 0; i < 300; i++) { const cfg = T.makeLevel(1 + (i % 30), W, rnd); for (const k of [1, 2, 3]) { const a = T.posAt(cfg, cfg.tStar), b = T.posAt(cfg, cfg.tStar + k * cfg.T); ok(near(a.L, b.L, 1e-6) && near(a.R, b.R, 1e-6), '每隔 Tc 回到同一個姿勢'); } } }

// ═══ 方塊不被畫面限制：橫板靠邊、振幅大時，方塊會移出畫面（玩家要求），振幅仍然照 AMP ═══
{ let outCount = 0, total = 0, maxA = 0;
  for (let lv = 1; lv <= 40; lv++) for (let k = 0; k < 40; k++) { const cfg = T.makeLevel(lv, W, rnd, { offset: 0.45 }); total++; const st = T.motionStats(cfg, W); if (!st.inside) outCount++; maxA = Math.max(maxA, cfg.L.A, cfg.R.A);
    const Amp = T.ampAt(lv), asy = T.asymAt(lv), Amin = cfg.ov / 2 + T.AMIN_EXTRA; for (const A of [cfg.L.A, cfg.R.A]) ok(A <= Math.max(Amin, Amp * (1 + asy)) + 1e-6 && A >= Math.max(Amin, Amp * (1 - asy)) - 1e-6, '振幅就是參數算出來的值（沒有被邊緣壓小）lv' + lv + ' A=' + A.toFixed(1)); }
  ok(outCount > total * 0.1, '橫板靠邊時方塊會移出畫面（' + outCount + '／' + total + '）——允許，不再被限縮');
  ok(maxA > T.AMP[1] * 0.9, '最大振幅可以到 AMP 的上限附近：' + maxA.toFixed(1)); }

// ═══ 接線（原始碼／樣式）═══
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_bridge.js'), 'utf8');
  ok(src.indexOf('guideY2 = guideY1 + (BTOP - guideY1) * cfg.line') > 0 && src.indexOf("y1: guideY1, y2: guideY2") > 0, '虛線：上緣貼著橫板、下緣依比例縮短');
  ok(src.indexOf('makeLevel(level, W, api.rand) || makeLevel(1, W, api.rand)') > 0, '萬一出不了題，退回第 1 關而不是空白');
  ok(src.indexOf('judge(cfg.plank, p.L, p.R, END_MARGIN, BW_L)') > 0 && src.indexOf('width: BW_L') > 0, '放下時用這一關的方塊寬度判定、方塊用這一關的寬度畫'); }
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
