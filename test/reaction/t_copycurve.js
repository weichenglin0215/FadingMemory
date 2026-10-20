const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_copycurve.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const SEED = seedOf(20261033); const rnd = rng(SEED);

// 難度：要求的相似度與限時線性
ok(near(T.reqSim(1), T.REQ[0]) && near(T.reqSim(T.RAMP_LEVELS), T.REQ[1]) && near(T.reqSim(60), T.REQ[1]), '要求 ' + T.REQ + '％（頭 → 到頂，之後維持）');
ok(T.timeMs(1) === T.TIME_S[0] * 1000 && T.timeMs(T.RAMP_LEVELS) === T.TIME_S[1] * 1000, '限時 ' + T.TIME_S + ' 秒');
for (let l = 2; l <= 60; l++) ok(T.reqSim(l) >= T.reqSim(l - 1) - 1e-12 && T.timeMs(l) <= T.timeMs(l - 1), '單調 ' + l);
ok(near(T.reqSim(13) - (T.REQ[0] + T.REQ[1]) / 2, 0, 1e-9), '中點（線性）');
// 曲線種類隨關卡解鎖
// 玩家自己調過 TYPE_RANGE：S 形只有第 1～3 關，第 4 關起絕不再出現（V1.27 修掉保底退回 S 形的問題）
// （V1.34 多了「繩子曲線」rope：從第 1 關起都有）
ok(T.typesFor(1).join() === 'scurve,rope' && T.typesFor(3).join() === 'scurve,rope,wave' && T.typesFor(4).join() === 'rope,wave' && T.typesFor(6).includes('right') && T.typesFor(9).includes('bolt') && T.typesFor(12).includes('spiral') && T.typesFor(15).includes('clip') && !T.typesFor(14).includes('clip'), '種類解鎖');
for (let lv = 4; lv <= 60; lv++) ok(!T.typesFor(lv).includes('scurve'), '第 ' + lv + ' 關起沒有 S 形');
{ let sc = 0; for (let lv = 4; lv <= 60; lv++) for (let i = 0; i < 150; i++) if (T.makeCurve(lv, rnd, null).type === 'scurve') sc++; ok(sc === 0, '第 4 關起出了 ' + sc + ' 條 S 形（應該 0）'); }
// 幾何函式
ok(near(T.polyLen([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }]), 11), 'polyLen');
{ const r = T.resample([{ x: 0, y: 0 }, { x: 100, y: 0 }], 11); ok(r.length === 11 && near(r[0].x, 0) && near(r[10].x, 100) && near(r[5].x, 50, 1e-6), 'resample 等距'); }
{ const d = T.densify([{ x: 0, y: 0 }, { x: 10, y: 0 }], 3); ok(d.length === 5 && near(d[4].x, 10), 'densify'); }
ok(near(T.distToPoly({ x: 5, y: 3 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }]), 3) && near(T.distToPoly({ x: 14, y: 3 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }]), 5), 'distToPoly');
// 螺旋：起點在外圈（半徑 76）、終點在圓心（半徑 7）
for (let i = 0; i < 20; i++) { const sp = T.genSpiral(rnd(), rnd); const f = sp[0], l = sp[sp.length - 1]; ok(Math.hypot(f.x, f.y) > 70 && Math.hypot(l.x, l.y) < 10, '螺旋起點外圈終點中心'); }
// 迴紋針：一條不自交的長線，大小合理
{ const c = T.genClip(); ok(c.length > 100, '迴紋針點數'); const pts = T.fit(c); ok(T.polyLen(pts) > 900 && T.polyLen(pts) < 1400, '迴紋針長度 ' + T.polyLen(pts).toFixed(0)); }
// 整批曲線驗證
const seen = {}; let prevT = null, consecSame = 0;
for (let i = 0; i < 4000; i++) {
  const lv = 1 + (i % 60), q = T.makeCurve(lv, rnd, prevT);
  seen[q.type] = (seen[q.type] || 0) + 1;
  ok(T.typesFor(lv).includes(q.type), '種類在解鎖範圍 ' + q.type + ' lv' + lv);
  ok(q.pts.length > 50 && q.pts.every(p => isFinite(p.x) && isFinite(p.y)), '點數與有限');
  ok(q.pts.every(p => p.x >= T.MG - 1 && p.x <= T.PW - T.MG + 1 && p.y >= T.MG - 1 && p.y <= T.PH - T.MG + 1), '全部點在長方格內（含邊界 1 像素誤差）：' + q.type);
  ok(Math.hypot(q.start.x - q.end.x, q.start.y - q.end.y) >= T.MIN_SEP - 1e-6, '起點終點相距 ≥ ' + T.MIN_SEP + '：' + q.type);
  ok(q.len >= (T.LEN_MIN_TYPE[q.type] || T.LEN_RANGE[0]) && q.len <= T.LEN_RANGE[1], '長度範圍 ' + q.type + ' ' + q.len.toFixed(0));
  ok(q.start === q.pts[0] && q.end === q.pts[q.pts.length - 1], '起點終點就是頭尾');
  // 相鄰點間距不超過 STEP＋一點點
  let maxGap = 0; for (let k = 1; k < q.pts.length; k++) maxGap = Math.max(maxGap, Math.hypot(q.pts[k].x - q.pts[k - 1].x, q.pts[k].y - q.pts[k - 1].y)); ok(maxGap <= 3.01, '點距 ≤ 3：' + maxGap);
  if (prevT === q.type && q.type !== 'rope' && T.typesFor(lv).filter(t => t !== 'rope').length > 1) consecSame++;      // 繩子曲線每一條都不一樣，可以連續出現
  prevT = lv === 60 ? null : q.type;
}
ok(Object.keys(seen).length === 7 && seen.rope > 0, '七種曲線（含繩子曲線）都出現過：' + JSON.stringify(seen));
ok(seen.scurve > 0, 'S 形只在前 3 關出現過');
ok(consecSame === 0, '有多種可選時，非繩子的種類不會連續兩關同一種：' + consecSame);
// 相似度的性質
for (let i = 0; i < 300; i++) {
  const lv = 1 + (i % 40), q = T.makeCurve(lv, rnd);
  const same = T.similarity(q.pts, q.pts), rev = T.similarity(q.pts, q.pts.slice().reverse());
  ok(near(same, 100, 1e-9) && near(rev, 100, 1e-9), '相同曲線 100％、反向畫也是 100％');
  // 平移 6 像素：平均距離 ≤ 6 → 相似度 ≥ 85
  const shifted = q.pts.map(p => ({ x: p.x + 6, y: p.y }));
  ok(T.similarity(q.pts, shifted) >= 100 * (1 - 6 / T.D0) - 1e-6, '平移 6 像素相似度 ≥ 85：' + T.similarity(q.pts, shifted).toFixed(2));
  // 手抖：每個點隨機 ±2.5 像素：相似度 > 90
  const jit = q.pts.filter((p, k) => k % 3 === 0).map(p => ({ x: p.x + (rnd() - 0.5) * 5, y: p.y + (rnd() - 0.5) * 5 }));
  ok(T.similarity(q.pts, jit) > 90, '輕微抖動仍 > 90：' + T.similarity(q.pts, jit).toFixed(2) + ' ' + q.type);
  // 故意亂畫（偵錯用的 wrong 路徑）一定過不了第 1 關的要求
  const badp = T.densify([q.start, { x: T.PW - 6, y: T.PH / 2 }, { x: 6, y: T.PH - 6 }, q.end], 3);
  ok(T.similarity(q.pts, badp) < T.reqSim(1), '亂畫過不了：' + T.similarity(q.pts, badp).toFixed(1) + ' ' + q.type);
}
// 難度：複雜曲線隨便畫一條直線過不了（第 7 關起的曲線，直線相似度 < 要求）
let lineFail = 0, lineTot = 0;
for (let i = 0; i < 1500; i++) {
  const lv = 7 + (i % 54), q = T.makeCurve(lv, rnd), line = T.densify([q.start, q.end], 3);
  lineTot++; if (T.similarity(q.pts, line) < T.reqSim(lv)) lineFail++;
}
ok(lineFail / lineTot > 0.97, '第 7 關起的曲線，直線過不了：' + (lineFail / lineTot).toFixed(3));
// 算得夠快（一次相似度要在 5 毫秒內，遊戲才不會卡）
{ const q = T.makeCurve(25, rnd); const t0 = Date.now(); for (let i = 0; i < 100; i++) T.similarity(q.pts, q.pts); ok((Date.now() - t0) / 100 < 5, '相似度計算夠快'); }
// ───────── V1.34 玩家意見：①第 3 關突然彎很多、第 4 關又變簡單（難度忽高忽低） ②手指離開螢幕才判定 ③抄「誰先到？」的曲線畫法 ─────────
// ① 彎數只由關卡決定（線性、單調），而且每一種曲線都照這個彎數出
ok(T.BENDS[0] === 2 && T.BENDS[1] === 10 && T.bendsFor(1) === T.BENDS[0] && T.bendsFor(T.RAMP_LEVELS) === T.BENDS[1] && T.bendsFor(60) === T.BENDS[1], '彎數 ' + T.BENDS + '：第 1 關 → 第 ' + T.RAMP_LEVELS + ' 關線性，之後維持');
for (let l = 2; l <= 60; l++) ok(T.bendsFor(l) >= T.bendsFor(l - 1) && T.bendsFor(l) - T.bendsFor(l - 1) <= 1, '彎數單調、每關最多 +1：第 ' + l + ' 關 ' + T.bendsFor(l));
console.log('彎數：' + [1, 3, 5, 8, 12, 16, 20, 25].map(l => '第' + l + '關 ' + T.bendsFor(l)).join('　'));
{ // 實際量：沿曲線走，每隔約 12 像素取一點，數「轉向方向（左轉／右轉）的左右換邊次數」＝彎數；各種類（有彎數的）的平均彎數都隨關卡上升
  const bends = pts => { const r = T.resample(pts, 90); let last = 0, n = 0; for (let i = 2; i < r.length; i++) { const a = r[i - 2], b = r[i - 1], c = r[i], cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x); if (Math.abs(cr) < 8) continue; const s = cr > 0 ? 1 : -1; if (last && s !== last) n++; last = s; } return n; };
  const avg = (lv, type) => { const xs = []; for (let i = 0; i < 400 && xs.length < 60; i++) { const q = T.makeCurve(lv, rnd, null); if (q.type === type) xs.push(bends(q.pts)); } return xs.length >= 10 ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  for (const type of ['rope', 'wave', 'bolt']) { const row = [6, 10, 14, 18, 22, 25].map(l => avg(l, type)).filter(v => v != null); let up = true; for (let i = 1; i < row.length; i++) if (row[i] < row[i - 1] - 0.6) up = false; ok(row.length >= 4 && up && row[row.length - 1] > row[0] + 2, type + ' 的實測彎數隨關卡上升：' + row.map(v => v.toFixed(1)).join(' → ')); console.log(type + ' 實測彎數（第 6/10/14/18/22/25 關）：' + row.map(v => v.toFixed(1)).join(' → ')); }
  // 重點：相鄰兩關（任何種類）的「名義彎數」不會往回掉（第 3 關十個彎、第 4 關又變簡單這種事不會發生）
  let bad2 = 0; for (let lv = 2; lv <= 40; lv++) for (let i = 0; i < 40; i++) { const a = T.makeCurve(lv - 1, rnd, null), b = T.makeCurve(lv, rnd, null); if (a.bends != null && b.bends != null && b.bends < a.bends) bad2++; } ok(bad2 === 0, '有彎數的種類：下一關的彎數永遠 ≥ 上一關：退步 ' + bad2 + ' 次');
  // 第 3 關最複雜也只有 b ＝ bendsFor(3) 個彎（不會冒出十個彎）
  let maxL3 = 0; for (let i = 0; i < 400; i++) { const q = T.makeCurve(3, rnd, null); if (q.bends != null) maxL3 = Math.max(maxL3, q.bends); const bb = bends(q.pts); maxL3 = Math.max(maxL3, bb); } ok(maxL3 <= T.bendsFor(3) + 1, '第 3 關曲線的彎數最多 ' + maxL3 + '（名義 ' + T.bendsFor(3) + '）'); }
// ③ 繩子曲線（抄誰先到）：各關、各彎數都做得出來，不退回保底、不自己交叉、夠快
{ const fb0 = T.fallbackCount(); let ropeN = 0; const t0 = Date.now(); let slowest = 0;
  for (let i = 0; i < 1800; i++) { const lv = 1 + (i % 60), t1 = Date.now(), q = T.makeCurve(lv, rnd, null); slowest = Math.max(slowest, Date.now() - t1); if (q.type === 'rope') { ropeN++; ok(q.bends === T.bendsFor(lv), '繩子曲線的彎數＝bendsFor：' + q.bends + ' vs ' + T.bendsFor(lv)); } }
  const per = (Date.now() - t0) / 1800; console.log('出題平均 ' + per.toFixed(2) + ' 毫秒、最慢 ' + slowest + ' 毫秒；進保底 ' + (T.fallbackCount() - fb0) + ' 次；繩子曲線 ' + ropeN + ' 條');
  ok(ropeN > 500 && T.fallbackCount() - fb0 === 0, '繩子曲線約一半機率、而且不用保底：' + ropeN + '／進保底 ' + (T.fallbackCount() - fb0));
  ok(per < 30 && slowest < 400, '出題夠快：平均 ' + per.toFixed(2) + ' 毫秒、最慢 ' + slowest + ' 毫秒'); }
{ // 繩子曲線：轉折點左右交替、上下被打亂（會往回走）、起點終點的左右位置不是永遠在正中間、曲線不自己貼自己
  let backUp = 0, tot = 0, startXs = new Set(), selfNear = 0;
  const okRate = {}, tryRate = {};
  for (let i = 0; i < 900; i++) { const b = 2 + (i % 9), raw = T.genRope(b, rnd, (i % 10) / 9); tryRate[b] = (tryRate[b] || 0) + 1; if (!raw) continue; okRate[b] = (okRate[b] || 0) + 1; ok(raw.length > 50, '點數'); if (b > 7) continue; tot++;
    // 往回走：y 方向出現「往上」的一段（打亂的效果）
    let up = false; for (let k = 5; k < raw.length; k += 5) if (raw[k].y < raw[k - 5].y - 6) up = true; if (up) backUp++;
    startXs.add(Math.round(raw[0].x / 10)); const pts = T.densify(raw, 3);
    // 不自己貼自己：路徑上相隔 > 70 像素的兩點，距離 ≥ 24（取樣檢查）
    const s = [0]; for (let k = 1; k < pts.length; k++) s.push(s[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    for (let a = 0; a < pts.length; a += 4) for (let c = a + 1; c < pts.length; c += 4) if (s[c] - s[a] > 70 + 6 && Math.hypot(pts[a].x - pts[c].x, pts[a].y - pts[c].y) < 24 - 3) selfNear++; }
  // 彎數 ≤ 8 一定做得出來；彎數 9、10 是長方格能放下的極限（成功率較低，makeCurve 會重抽，實際出題測試過不會進保底）
  for (let b = 2; b <= 8; b++) ok(okRate[b] === tryRate[b], '做得出 ' + b + ' 個彎的繩子曲線：' + (okRate[b] || 0) + '/' + tryRate[b]);
  for (let b = 9; b <= 10; b++) ok((okRate[b] || 0) / tryRate[b] > 0.3, '彎數 ' + b + ' 的繩子曲線成功率 ' + ((okRate[b] || 0) / tryRate[b]).toFixed(2) + '（極限，要 > 0.3）');
  ok(startXs.size >= 6, '起點的左右位置有變化（不是永遠正中間）：' + startXs.size + ' 種');
  ok(backUp / tot > 0.08, '路線有時會往回走（不是工整的上下單向）：' + (backUp / tot).toFixed(2) + '（彎數 2～7）');
  ok(selfNear === 0, '繩子曲線不會自己貼自己：' + selfNear); }
// ② 手指離開螢幕才判定：原始碼接線檢查（pointermove 不再自動判定、pointerup 才判定、離開位置要在另一端點附近）
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_copycurve.js'), 'utf8');
  const a = src.indexOf("R.el.addEventListener('pointermove'"), b = src.indexOf('/* 手指離開螢幕才判定'), mv = src.slice(a, b);
  ok(mv.indexOf('finishWith') < 0, 'pointermove 裡不會呼叫 finishWith（手指經過端點附近不會自動判定）');
  const c = src.indexOf('function up(e)'), d = src.indexOf("R.el.addEventListener('pointerup', up)"), up = src.slice(c, d);
  ok(up.indexOf("e.type === 'pointerup'") > 0 && up.indexOf('<= END_R') > 0 && up.indexOf('>= MIN_DRAW') > 0 && up.indexOf('finishWith(mine.pts, mine.anchor)') > 0, 'pointerup：放開的位置在另一個端點 END_R 以內、而且畫夠長才判定（pointercancel 一律當沒畫完）');
  ok(up.indexOf('放開的地方不在另一個端點上') > 0 && up.indexOf('cur = null; render();') > 0, '放開在別處＝清掉筆跡、可以重畫');
  ok(src.indexOf("classList.toggle('cpc-near'") > 0 && /\.cpc-near \{ stroke: var\(--c-ok\)/.test(require('fs').readFileSync(require('path').resolve(__dirname, '../../css/reaction5.css'), 'utf8').split(/\s+/).join(' ')), '手指靠近另一端點時端點亮綠框（CSS 變數）');
  ok(/手指離開螢幕才會判定/.test(G.rule), '玩法說明有寫手指離開螢幕才判定'); }
ok(T.rating(2) !== T.rating(5) && T.rating(5) !== T.rating(8) && T.rating(8) !== T.rating(14) && T.rating(14) !== T.rating(25), '評語分級');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
