// 大合照（groupphoto，企劃 360）的純函式檢查：難度線性、眨眼時間表（區間不重疊、一定有「全員睜眼」窗口）、低頭看手機不算閉眼、排版
const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_groupphoto.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261204), rnd = rng(SEED);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-9 : e);

// ── 難度（線性）──
ok(T.peopleFor(1) === T.PEOPLE[0] && T.peopleFor(T.RAMP_LEVELS) === T.PEOPLE[1] && T.peopleFor(99) === T.PEOPLE[1], '人數 ' + T.PEOPLE);
ok(near(T.winFor(1), T.OPEN_WIN[0]) && near(T.winFor(T.RAMP_LEVELS), T.OPEN_WIN[1]), '拍得到的全員睜眼空檔最短 ' + T.OPEN_WIN + ' 秒');
ok(T.nWinFor(1) === T.N_WIN[0] && T.nWinFor(T.RAMP_LEVELS) === T.N_WIN[1] && T.N_WIN[1] >= 2, '每關拍得到的空檔 ' + T.N_WIN + ' 段（到頂至少 2 段）');
ok(near(T.pOpenFor(1), T.P_OPEN[0]) && near(T.pOpenFor(T.RAMP_LEVELS), T.P_OPEN[1]), '隨機瞬間全員睜眼的機率 ' + T.P_OPEN);
ok(T.phoneFor(1) === 0 && T.phoneFor(T.RAMP_LEVELS) === T.PHONE[1], '低頭看手機 ' + T.PHONE);
ok(T.timeMs() === T.TIME_S * 1000 && G.rule.indexOf('限時 ' + T.TIME_S + ' 秒') >= 0, '限時 ' + T.TIME_S + ' 秒（玩法說明寫的秒數跟參數一樣）');
for (let n = 2; n <= T.RAMP_LEVELS + 3; n++) ok(T.peopleFor(n) >= T.peopleFor(n - 1) && T.winFor(n) <= T.winFor(n - 1) && T.pOpenFor(n) <= T.pOpenFor(n - 1) && T.phoneFor(n) >= T.phoneFor(n - 1) && T.nWinFor(n) <= T.nWinFor(n - 1), '單調 ' + n);
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

// ── 出題：全部關卡掃一遍（V1.51：取消「一大段保證空檔」，改成 nWin 段短空檔＋整局沒有太長的全員睜眼）──
const ST = { n: 0, openFrac: {}, longest: {}, play: {}, retry: 0, phoneN: 0, phoneUp: 0, phoneBlink: 0, tailLong: 0 };
for (let lv = 1; lv <= 40; lv++) { let sum = 0, cnt = 0, lg = 0, pl = 0;
  for (let rep = 0; rep < 60; rep++) {
    const q = T.makeLevel(lv, rnd); ST.n++;
    ok(q.people.length === q.n && q.n === T.peopleFor(lv) && q.phone.length === Math.min(T.phoneFor(lv), q.n - 1), '人數與低頭看手機人數');
    ok(new Set(q.phone).size === q.phone.length && q.phone.every(i => i >= 0 && i < q.n), '低頭看手機的編號不重複');
    ok(q.nWin === T.nWinFor(lv) && near(q.win, T.winFor(lv)) && near(q.winMax, T.winFor(lv) * T.WIN_MAX_K, 0.001), '這關的空檔規格');
    ok(T.checkLevel(q), '第 ' + lv + ' 關通過驗證（拍得到的空檔夠多、沒有太長的全員睜眼）');
    q.people.forEach((p, i) => {
      ok(p.d >= T.BLINK_D[0] && p.d <= T.BLINK_D[1], '每人閉眼時間在範圍內');
      const isPh = q.phone.includes(i);
      ok(isPh ? Array.isArray(p.ups) && p.ups.length > 0 : p.ups == null && p.blinks.length > 0, isPh ? '低頭看手機的人有抬頭時段' : '一般人會眨眼、永遠抬著頭');
      for (let k = 0; k < p.blinks.length; k++) { ok(p.blinks[k][1] > p.blinks[k][0] + 0.1, '區間有長度'); if (k) ok(p.blinks[k][0] >= p.blinks[k - 1][1] - 1e-9, '同一個人的區間不重疊、照時間排'); }
      if (isPh) {
        ST.phoneN++; if (p.ups[0][0] < q.timeS) ST.phoneUp++; if (p.blinks.some(iv => iv[0] < q.timeS)) ST.phoneBlink++;
        ok(p.ups[0][0] >= 1 - 1e-9 && p.ups[0][0] <= T.PHONE_DOWN[1] + 1e-9, '一開始在低頭，第一次抬頭在 1～' + T.PHONE_DOWN[1] + ' 秒');
        p.ups.forEach((u, k) => { ok(u[1] - u[0] >= T.PHONE_UP[0] - 1e-9 && u[1] - u[0] <= T.PHONE_UP[1] + 1e-9, '抬頭時間在範圍內'); if (k) { const dn = u[0] - p.ups[k - 1][1]; ok(dn >= T.PHONE_DOWN[0] - 1e-9 && dn <= T.PHONE_DOWN[1] + 1e-9, '低頭時間在範圍內'); } });
        // 低頭的時候一定不會眨眼（眨眼整個落在抬頭時段裡）
        p.blinks.forEach(iv => ok(p.ups.some(u => iv[0] >= u[0] - 1e-9 && iv[1] <= u[1] + 1e-9), '低頭看手機的人只在抬頭時眨眼'));
      }
    });
    // 挖出來的空檔：長度 win～winMax、整段沒人閉眼、前後緊貼著有人閉眼（剛好這麼長，不會往兩邊延伸）、位置在 WIN_FROM～限時 − WIN_TAIL
    ok(q.wins.length === q.nWin, '挖了 ' + q.nWin + ' 段空檔');
    q.wins.forEach((w, k) => {
      ok(w.end - w.start >= q.win - 1e-9 && w.end - w.start <= q.winMax + 1e-9, '空檔長度 ' + (w.end - w.start).toFixed(3) + ' 在 ' + q.win + '～' + q.winMax);
      ok(w.start >= T.WIN_FROM - 1e-9 && w.end <= q.timeS - T.WIN_TAIL + 1e-9, '空檔在 ' + T.WIN_FROM + '～' + (q.timeS - T.WIN_TAIL) + ' 秒之間');
      let allOpen = true; for (let t = w.start; t < w.end; t += 0.01) if (T.closedAt(q, t).length) allOpen = false;
      ok(allOpen, '空檔裡全員睜眼');
      ok(T.closedAt(q, w.start - 0.005).length > 0 && T.closedAt(q, w.end + 0.005).length > 0, '空檔前後緊貼著有人閉眼');
      if (k) ok(w.start - q.wins[k - 1].end >= 2 * 0.35, '各段空檔分散開來（不擠在一起）');
    });
    const ws = T.openWindows(q), longest = ws.reduce((m, w) => Math.max(m, w.end - w.start), 0);
    ok(longest <= q.winMax + 1e-6, '整局沒有比 ' + q.winMax + ' 秒長的全員睜眼（最長 ' + longest.toFixed(3) + '）——不會有「大家一直睜眼不閉」');
    // 玩家意見的 BUG：時間快到的最後 3 秒，不會變成一大段大家都不閉眼
    if (ws.some(w => w.end > q.timeS - 3 && w.end - w.start > q.winMax + 1e-6)) ST.tailLong++;
    ws.forEach((w, k) => { ok(w.end > w.start && w.start >= 0 && w.end <= q.timeS + 1e-9, '窗口在 [0, T]'); if (k) ok(w.start >= ws[k - 1].end - 1e-9, '窗口不重疊'); });
    const open = ws.reduce((s, w) => s + (w.end - w.start), 0) / q.timeS; sum += open; cnt++; lg += longest; pl += T.playable(q).length;
    // 每個時間點「有人閉眼」跟 closedAt 的結果一致（取樣驗證 openWindows）
    for (let k = 0; k < 40; k++) { const t = rnd() * q.timeS, isOpen = ws.some(w => t >= w.start && t < w.end); ok(isOpen === (T.closedAt(q, t).length === 0), 'openWindows 與 closedAt 一致 t=' + t.toFixed(3)); }
  }
  ST.openFrac[lv] = sum / cnt; ST.longest[lv] = lg / cnt; ST.play[lv] = pl / cnt; }
console.log('共 ' + ST.n + ' 關；各關「全員睜眼」佔限時的比例（平均）：' + [1, 5, 10, 15, 20, 30].map(l => l + '→' + ST.openFrac[l].toFixed(2)).join('、'));
console.log('最長的全員睜眼（平均秒）：' + [1, 5, 10, 15, 20, 30].map(l => l + '→' + ST.longest[l].toFixed(2)).join('、') + '；拍得到的空檔（平均段數）：' + [1, 10, 20, 30].map(l => l + '→' + ST.play[l].toFixed(1)).join('、'));
console.log('低頭看手機的人 ' + ST.phoneN + ' 位：限時內有抬頭 ' + ST.phoneUp + '、抬頭時有眨眼 ' + ST.phoneBlink);
ok(ST.tailLong === 0, '最後 3 秒不會出現一大段全員睜眼');
ok(ST.longest[1] <= T.OPEN_WIN[0] * T.WIN_MAX_K + 1e-6 && ST.longest[1] < 1.5, '第 1 關最長的全員睜眼平均 ' + ST.longest[1].toFixed(2) + ' 秒（舊版約 2.5 秒）');
ok(ST.openFrac[1] > ST.openFrac[10] && ST.openFrac[10] > ST.openFrac[T.RAMP_LEVELS] - 0.02 && ST.openFrac[1] > 0.3, '越後面全員睜眼的時間越少：' + ST.openFrac[1].toFixed(2) + ' → ' + ST.openFrac[10].toFixed(2) + ' → ' + ST.openFrac[20].toFixed(2));
ok(ST.openFrac[T.RAMP_LEVELS] < 0.3 && ST.openFrac[T.RAMP_LEVELS] >= 0.04, '到頂關卡全員睜眼只佔 ' + ST.openFrac[T.RAMP_LEVELS].toFixed(2));
ok(ST.phoneN > 100 && ST.phoneUp / ST.phoneN > 0.95 && ST.phoneBlink / ST.phoneN > 0.6, '低頭看手機的人限時內幾乎都會抬頭（' + ST.phoneUp + '/' + ST.phoneN + '），抬頭時大多會眨眼（' + ST.phoneBlink + '）');
// 低頭看手機的人：低頭的時候不算閉眼；抬頭的時候跟一般人一樣
{ let upClosed = 0; for (let r = 0; r < 20; r++) { const q = T.makeLevel(25, rnd); for (let t = 0; t < q.timeS; t += 0.02) T.closedAt(q, t).forEach(i => { if (q.phone.includes(i)) { ok(T.isUp(q.people[i], t), '低頭看手機（還沒抬頭）的人不會出現在閉眼名單'); upClosed++; } }); }
  ok(upClosed > 0, '抬頭的人眨眼時算閉眼（' + upClosed + ' 個取樣點）'); }
{ const p = { ups: [[1, 2], [5, 6]] }; ok(!T.isUp(p, 0.5) && T.isUp(p, 1) && T.isUp(p, 1.99) && !T.isUp(p, 2) && T.isUp(p, 5.5) && !T.isUp(p, 7) && T.isUp({ ups: null }, 3), 'isUp'); }
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
{ const rd = p => require('fs').readFileSync(require('path').resolve(__dirname, p), 'utf8'), src = rd('../../js/reaction_groupphoto.js'), css = rd('../../css/games/reaction_groupphoto.css').split(/\s+/).join(' '), boot = rd('../../js/boot.js');
  ok(/api\.fail\(\{ delay: 3800/.test(src) && /groupphoto-ring/.test(src) && /closedAt\(q, t\)/.test(src) && /groupphoto-photo--wall/.test(src), '失敗：閉眼的人圈紅圈、停格 2 秒以上；成功：照片掛上牆；判定用 closedAt');
  ok(/api\.timer\(timeMs\(\)/.test(src) && /timeout\(\)/.test(src) && /api\.solve = /.test(src) && /api\.wrong = /.test(src), '有限時、時間到失敗、solve／wrong 只在對的瞬間按');
  ok(/\.groupphoto-person--phone \.groupphoto-lid/.test(css) && /\.groupphoto-ring \{[^}]*var\(--gph-ring\)/.test(css) && /\.groupphoto-photo \{[^}]*var\(--gph-bg\)/.test(css) && /\.groupphoto-shirt0 \{[^}]*var\(--gph-shirt0\)/.test(css), '低頭的人畫閉眼線、紅圈、牆面、衣服顏色用 CSS 變數');
  ok(boot.indexOf("'js/reaction_groupphoto.js'") > 0 && /低頭看手機/.test(G.rule) && /快門/.test(G.rule), 'boot.js 有載入、玩法說明提到低頭看手機和快門');
  ok(/抬頭/.test(G.rule) && /isUp\(q\.people\[i\], t\)/.test(src) && /groupphoto-phonegrp/.test(src) && /\.groupphoto-person--phone \.groupphoto-phonegrp \{/.test(css) && !/winAt/.test(src), 'V1.51：玩法說明寫抬頭、畫面依 isUp 切換低頭／抬頭、手機會放下；沒有舊的保證窗口 winAt'); }
ok(T.rating(1) !== T.rating(3) && T.rating(3) !== T.rating(6) && T.rating(6) !== T.rating(12) && T.rating(12) !== T.rating(18), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
