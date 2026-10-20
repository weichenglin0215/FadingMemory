// 大合照（groupphoto，企劃 360）的純函式檢查：難度線性、眨眼時間表（區間不重疊、一定有「全員睜眼」窗口）、低頭看手機不算閉眼、排版
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_groupphoto.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261204), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（線性）──
ok(T.peopleFor(1) === T.PEOPLE[0] && T.peopleFor(T.RAMP_LEVELS) === T.PEOPLE[1] && T.peopleFor(99) === T.PEOPLE[1], '人數 ' + T.PEOPLE);
ok(near(T.winFor(1), T.OPEN_WIN[0]) && near(T.winFor(T.RAMP_LEVELS), T.OPEN_WIN[1]), '全員睜眼的最短窗口 ' + T.OPEN_WIN + ' 秒');
ok(near(T.pOpenFor(1), T.P_OPEN[0]) && near(T.pOpenFor(T.RAMP_LEVELS), T.P_OPEN[1]), '隨機瞬間全員睜眼的機率 ' + T.P_OPEN);
ok(T.phoneFor(1) === 0 && T.phoneFor(T.RAMP_LEVELS) === T.PHONE[1], '低頭看手機 ' + T.PHONE);
ok(T.timeMs() === 10000, '限時 10 秒');
for (let n = 2; n <= T.RAMP_LEVELS + 3; n++) ok(T.peopleFor(n) >= T.peopleFor(n - 1) && T.winFor(n) <= T.winFor(n - 1) && T.pOpenFor(n) <= T.pOpenFor(n - 1) && T.phoneFor(n) >= T.phoneFor(n - 1), '單調 ' + n);
{ const d = []; for (let n = 2; n <= T.RAMP_LEVELS; n++) d.push(T.winFor(n - 1) - T.winFor(n)); ok(Math.max(...d) - Math.min(...d) <= 0.002, '窗口線性縮短：每關 −' + Math.min(...d).toFixed(4) + '～−' + Math.max(...d).toFixed(4) + ' 秒'); }

// ── 閉眼比例的算式 ──
for (const [n, p] of [[3, 0.45], [8, 0.3], [15, 0.1], [1, 0.5]]) { const c = T.closedFraction(n, p); ok(near(Math.pow(1 - c, n), p, 1e-9) && c > 0 && c < 1, 'n=' + n + ' 全員睜眼機率 ' + p + ' → 每人閉眼比例 ' + c.toFixed(3)); }

// ── 眨眼時間表 ──
for (let i = 0; i < 300; i++) {
  const d = 0.2, g = 0.5 + rnd() * 2, bl = T.makeBlinks(d, g, 11, rnd);
  ok(bl.length >= 2 && bl.every(iv => near(iv[1] - iv[0], d, 1e-9)), '每次閉眼 d 秒');
  for (let k = 1; k < bl.length; k++) ok(bl[k][0] >= bl[k - 1][1] + g * 0.7 - 1e-9, '兩次眨眼之間至少隔 gap×0.7（區間不重疊）');
  ok(bl[bl.length - 1][0] < 11 && bl[0][0] >= 0 && bl[0][0] <= g, '起點在 [0, gap]');
}
{ const bl = [[1, 2], [3, 4], [5, 6]]; ok(JSON.stringify(T.clearWindow(bl, 3.5, 5.2)) === '[[1,2]]' && JSON.stringify(T.clearWindow(bl, 2, 3)) === '[[1,2],[3,4],[5,6]]' && T.clearWindow(bl, 0, 10).length === 0, 'clearWindow：有碰到的拿掉、剛好貼著的不拿'); }

// ── 出題：全部關卡掃一遍 ──
const ST = { n: 0, minWin: 99, winOK: 0, openFrac: {}, phoneTot: 0, firstOpen: [] };
for (let lv = 1; lv <= 40; lv++) { let sum = 0, cnt = 0;
  for (let rep = 0; rep < 80; rep++) {
    const q = T.makeLevel(lv, rnd); ST.n++;
    ok(q.people.length === q.n && q.n === T.peopleFor(lv) && q.phone.length === Math.min(T.phoneFor(lv), q.n - 1), '人數與低頭看手機人數');
    ok(new Set(q.phone).size === q.phone.length && q.phone.every(i => i >= 0 && i < q.n), '低頭看手機的編號不重複');
    q.people.forEach((p, i) => { ok(p.d >= T.BLINK_D[0] && p.d <= T.BLINK_D[1], '每人閉眼時間在範圍內'); const isPh = q.phone.includes(i); ok(isPh ? p.blinks.length === 0 : p.blinks.length > 0, isPh ? '低頭看手機的人不眨眼' : '其他人會眨眼');
      for (let k = 0; k < p.blinks.length; k++) { ok(p.blinks[k][1] > p.blinks[k][0], '區間有長度'); if (k) ok(p.blinks[k][0] >= p.blinks[k - 1][1], '同一個人的區間不重疊'); } });
    ok(q.winAt >= T.WIN_FROM - 1e-9 && q.winAt + q.win <= q.timeS - T.WIN_TAIL + 1e-9, '保證的窗口位置 ' + q.winAt.toFixed(2) + '＋' + q.win + ' 在限時之內、結束後還有 ' + T.WIN_TAIL + ' 秒');
    // 保證有解：在 [winAt, winAt+win] 之間任何時間點都沒人閉眼
    let allOpen = true; for (let t = q.winAt; t <= q.winAt + q.win + 1e-9; t += 0.01) if (T.closedAt(q, Math.min(t, q.winAt + q.win - 1e-9)).length) allOpen = false;
    ok(allOpen, '保證窗口內全員睜眼');
    const ws = T.openWindows(q), longest = ws.reduce((m, w) => Math.max(m, w.end - w.start), 0), inWin = ws.some(w => w.start <= q.winAt + 1e-9 && w.end >= q.winAt + q.win - 1e-9);
    ok(inWin && longest >= q.win - 1e-9, '窗口列表包含保證窗口');
    ws.forEach((w, k) => { ok(w.end > w.start && w.start >= 0 && w.end <= q.timeS + 1e-9, '窗口在 [0, T]'); if (k) ok(w.start >= ws[k - 1].end - 1e-9, '窗口不重疊'); });
    ST.minWin = Math.min(ST.minWin, longest - q.win); const open = ws.reduce((s, w) => s + (w.end - w.start), 0) / q.timeS; sum += open; cnt++;
    // 窗口外：每個時間點「有人閉眼」跟 closedAt 的結果一致（取樣驗證 openWindows）
    for (let k = 0; k < 40; k++) { const t = rnd() * q.timeS, isOpen = ws.some(w => t >= w.start && t < w.end); ok(isOpen === (T.closedAt(q, t).length === 0), 'openWindows 與 closedAt 一致 t=' + t.toFixed(3)); }
  }
  ST.openFrac[lv] = sum / cnt; }
console.log('共 ' + ST.n + ' 關；各關「全員睜眼」佔限時的比例（平均）：' + [1, 5, 10, 15, 20, 30].map(l => l + '→' + ST.openFrac[l].toFixed(2)).join('、'));
ok(ST.minWin >= -1e-9, '每一關最長的全員睜眼窗口都 ≥ 保證值');
ok(ST.openFrac[1] > ST.openFrac[10] && ST.openFrac[10] > ST.openFrac[20] - 0.02 && ST.openFrac[1] > 0.45, '越後面全員睜眼的時間越少：' + ST.openFrac[1].toFixed(2) + ' → ' + ST.openFrac[10].toFixed(2) + ' → ' + ST.openFrac[20].toFixed(2));
ok(ST.openFrac[20] < 0.3 && ST.openFrac[20] >= 0.6 / 10 - 1e-9, '到頂關卡全員睜眼只佔 ' + ST.openFrac[20].toFixed(2));
// 低頭看手機的人：不管什麼時候都不算閉眼
{ const q = T.makeLevel(20, rnd); for (let t = 0; t < 10; t += 0.05) T.closedAt(q, t).forEach(i => ok(!q.phone.includes(i), '低頭看手機的人不會出現在閉眼名單')); }
// 同種子同題目
{ const a = T.makeLevel(9, rng(77)), b = T.makeLevel(9, rng(77)); ok(JSON.stringify(a) === JSON.stringify(b), '同種子同題目'); }
// 沒有任何人閉眼的瞬間，按下去一定成功；有人閉眼的瞬間一定失敗（判定 = closedAt）
{ const q = T.makeLevel(12, rnd); const ws = T.openWindows(q).filter(w => w.end - w.start > 0.05); ok(ws.length > 0 && T.closedAt(q, (ws[0].start + ws[0].end) / 2).length === 0, '窗口中間沒人閉眼');
  const cl = q.people.find(p => p.blinks.length && p.blinks[0][0] > 0.1); if (cl) ok(T.closedAt(q, (cl.blinks[0][0] + cl.blinks[0][1]) / 2).length >= 1, '有人閉眼的瞬間 closedAt 不是空的'); }

// ── 排版 ──
for (const [pw, ph] of [[448, 400], [440, 380], [472, 340]]) for (let n = 3; n <= 15; n++) {
  const L = T.layout(n, pw, ph);
  ok(L.faces.length === n && L.cols * L.rows >= n && L.cols >= 1, 'n=' + n + ' 排成 ' + L.cols + '×' + L.rows);
  L.faces.forEach((f, i) => { ok(f.x >= 0 && f.y >= 0 && f.x + f.w <= pw && f.y + f.h <= ph, '第 ' + i + ' 個人在相片區裡（n=' + n + '，' + pw + '×' + ph + '）'); ok(f.w >= 40, '臉夠大（' + f.w + 'px）才看得出眨眼'); });
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const a = L.faces[i], b = L.faces[j]; ok(a.x + a.w <= b.x + 1e-9 || b.x + b.w <= a.x + 1e-9 || a.y + a.h <= b.y + 1e-9 || b.y + b.h <= a.y + 1e-9, '兩張臉不重疊（n=' + n + '）'); }
}
{ const L = T.layout(15, 448, 400); console.log('15 人：' + L.cols + '×' + L.rows + '，臉 ' + L.fw + '×' + L.fh); ok(L.cols === 5 && L.rows === 3 && L.fw >= 70, '15 人排 5×3，臉 ≥ 70px'); }
{ const L = T.layout(7, 448, 400); ok(L.cols === 4 && L.rows === 2, '7 人排 4＋3，最後一排置中'); const last = L.faces.slice(4), cx = last.reduce((s, f) => s + f.x + f.w / 2, 0) / last.length; ok(Math.abs(cx - 224) <= 2, '最後一排置中：' + cx.toFixed(1)); }

// ── 程式裡的接線 ──
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_groupphoto.js'), css = rd('../../css/reaction6.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3800/.test(src) && /gph-ring/.test(src) && /closedAt\(q, t\)/.test(src) && /gph-photo--wall/.test(src), '失敗：閉眼的人圈紅圈、停格 2 秒以上；成功：照片掛上牆；判定用 closedAt');
  ok(/api\.timer\(timeMs\(\)/.test(src) && /timeout\(\)/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src), '有限時、時間到失敗、solve／wrong 只在對的瞬間按');
  ok(/\.gph-person--phone \.gph-lid/.test(css) && /\.gph-ring \{[^}]*var\(--gph-ring\)/.test(css) && /\.gph-photo \{[^}]*var\(--gph-bg\)/.test(css) && /\.gph-shirt0 \{[^}]*var\(--gph-shirt0\)/.test(css), '低頭的人畫閉眼線、紅圈、牆面、衣服顏色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_groupphoto.js'") > 0 && /低頭看手機/.test(G.rule) && /快門/.test(G.rule), 'boot.js 有載入、玩法說明提到低頭看手機和快門'); }
ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(6) && T.rating(6) !== T.rating(12) && T.rating(12) !== T.rating(18), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
