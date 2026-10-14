const { game, rng, seedOf } = require('./load.js');
const G = game('reaction_stamp.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const SEED = seedOf(20261014); const rnd = rng(SEED);
const rad = d => d * Math.PI / 180;
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
// V1.27 玩家意見：改名「心在正中央」、評分看中心距離、愛心印章（虛線、不同顏色／粗細／間隔、不寫字、大小隨機）
ok(G.name === '心在正中央', '遊戲名稱：' + G.name);
{ const src = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/reaction_stamp.js'), 'utf8');
  const menu = require('fs').readFileSync(require('path').resolve(__dirname, '../../js/menu.js'), 'utf8');
  ok(/id: 'stamp', name: '心在正中央'/.test(menu), '選單名稱同步改成「心在正中央」');
  ok(src.indexOf("'class': 'st-text'") < 0 && src.indexOf('核准') < 0 && src.indexOf('createTextNode') < 0 && src.indexOf("kit.svg('text'") < 0, '愛心上不寫任何字');
  ok(src.indexOf('stroke-dasharray') > 0, '愛心是虛線');
  ok(src.indexOf("migrateBest(ID, function () { return null; }, '.v127')") > 0, '舊的最佳紀錄清掉一次（.v127）'); }
// 紅框／角標／紙張歪斜仍維持 V1.25 的難度
ok(T.FW * T.FH >= 220 * 140 * 1.33, '紅框面積至少原本的 133%：' + (T.FW * T.FH / (220 * 140)).toFixed(2) + ' 倍');
ok(T.MARK_LEG < 24, '角標每隻腳比原本短：' + T.MARK_LEG);
ok(T.PAPER_TILT > 8 && T.PAPER_TILT_MIN >= 4, '紙張歪斜比原本（±8°）大：±' + T.PAPER_TILT);
// corners：未旋轉時四個角在 ±w/2、±h/2
const c0 = T.corners(100, 200, 0, 220, 140);
ok(c0[0].x === -10 && c0[0].y === 130 && c0[2].x === 210 && c0[2].y === 270, 'corners 未旋轉');
const c90 = T.corners(0, 0, 90, 220, 140); ok(Math.abs(c90[0].x - 70) < 1e-9 && Math.abs(c90[0].y + 110) < 1e-9, 'corners 旋轉 90°');
// 愛心形狀：外框正中央是 (0,0)、寬度＝w、上下左右對稱（左右對稱）、有凹口（頂部中央比兩側的峰低）
for (const w of [110, 200, 300]) {
  const sh = T.heartShape(w), xs = sh.pts.map(p => p[0]), ys = sh.pts.map(p => p[1]);
  ok(near(Math.min(...xs), -w / 2, 1e-6) && near(Math.max(...xs), w / 2, 1e-6), '寬 ' + w + '：左右對稱貼齊 ±w/2');
  ok(near((Math.min(...ys) + Math.max(...ys)) / 2, 0, 1e-6) && near(Math.max(...ys) - Math.min(...ys), sh.h, 0.5), '外框垂直置中，高度 ' + sh.h.toFixed(1));
  ok(sh.h > 0.8 * w && sh.h < 1.0 * w, '高約為寬的 0.9 倍：' + (sh.h / w).toFixed(3));
  ok(sh.pts.length === T.HEART_N, '取樣點數');
  // 左右鏡像：每個點 (x,y) 在另一邊有 (−x,y)
  let worst = 0; for (const p of sh.pts) { let best = 1e9; for (const q of sh.pts) best = Math.min(best, Math.hypot(q[0] + p[0], q[1] - p[1])); worst = Math.max(worst, best); }
  ok(worst < w * 0.03, '左右對稱 ' + worst.toFixed(2));
  // 頂部凹口：x=0 附近的最高點（y 最小）比兩側峰頂（y 最小）低（y 數值較大）
  const mid = sh.pts.filter(p => Math.abs(p[0]) < w * 0.03), top = Math.min(...ys);
  ok(mid.length > 0 && Math.min(...mid.map(p => p[1])) > top + sh.h * 0.1, '頂部中央有凹口');
  // 底部尖端在 x=0 附近、y 最大
  const bot = sh.pts.reduce((a, p) => p[1] > a[1] ? p : a); ok(Math.abs(bot[0]) < w * 0.03, '底部尖端在中線上');
}
// 中心距離：重合 → 0；平移 d → d；紅框座標的偏移（紙歪 20°）
{ const f = { x: 236, y: 240, rot: 20 };
  ok(near(T.centerErr({ x: 236, y: 240 }, f).dist, 0), '中心重合 → 0');
  const d = 12, ca = Math.cos(rad(20)), sa = Math.sin(rad(20));
  let r = T.centerErr({ x: 236 + d * ca, y: 240 + d * sa }, f); ok(near(r.dist, d, 1e-9) && near(r.dx, d, 1e-9) && near(r.dy, 0, 1e-9), '沿紅框 x 軸 12px：' + JSON.stringify(r));
  r = T.centerErr({ x: 236 - d * sa, y: 240 + d * ca }, f); ok(near(r.dist, d, 1e-9) && near(r.dx, 0, 1e-9) && near(r.dy, d, 1e-9), '沿紅框 y 軸 12px：' + JSON.stringify(r));
  r = T.centerErr({ x: 236 - 30, y: 240 - 40 }, { x: 236, y: 240, rot: 0 }); ok(near(r.dist, 50) && near(r.dx, -30) && near(r.dy, -40), '3-4-5：' + JSON.stringify(r)); }
// 成績不受印章大小影響：同樣的中心距離，不管愛心多大成績一樣
{ const f = { x: 236, y: 240, rot: 12 }; const a = T.centerErr({ x: 250, y: 255 }, f).dist; for (let i = 0; i < 50; i++) { const lk = T.makeStamp(rnd); ok(lk.w >= T.HEART_W[0] && lk.w <= T.HEART_W[1], '愛心寬在範圍內'); ok(T.centerErr({ x: 250, y: 255 }, f).dist === a, '距離與大小無關'); } }
ok(T.toMm(4) === 1, '4px = 1 公釐');
// 印章外觀：外圈／內圈顏色不同、虛線樣式不同、大小隨機、每次都不一樣
{ const widths = new Set(), colors = new Set(), pairs = new Set(), sizes = new Set(), ws = new Set(), ks = [];
  for (let i = 0; i < 3000; i++) {
    const lk = T.makeStamp(rnd);
    ok(lk.outer.color !== lk.inner.color, '外圈與內圈顏色不同');
    ok(lk.outer.dash !== lk.inner.dash || lk.outer.gap !== lk.inner.gap, '外圈與內圈虛線間隔不同');
    ok(T.COLORS.indexOf(lk.outer.color) >= 0 && T.COLORS.indexOf(lk.inner.color) >= 0 && T.WIDTHS.indexOf(lk.outer.width) >= 0 && T.WIDTHS.indexOf(lk.inner.width) >= 0, '用的是設定表裡的值');
    ok(lk.k2 >= T.INNER_K[0] && lk.k2 <= T.INNER_K[1], '內圈比例在範圍內');
    ok(near(lk.h, T.heartShape(lk.w).h, 1e-6), 'h 與形狀一致');
    widths.add(lk.outer.width); colors.add(lk.outer.color); pairs.add(lk.outer.dash + '/' + lk.outer.gap); sizes.add(Math.round(lk.w)); ks.push(lk.w);
  }
  ok(widths.size === T.WIDTHS.length && colors.size === T.COLORS.length && pairs.size >= 15 && sizes.size > 100, '每次外觀不同：粗細 ' + widths.size + '、顏色 ' + colors.size + '、虛線 ' + pairs.size + '、大小 ' + sizes.size);
  const minW = Math.min(...ks), maxW = Math.max(...ks); ok(minW < 130 && maxW > 280, '大小範圍涵蓋小愛心與大愛心：' + minW.toFixed(0) + '～' + maxW.toFixed(0));
  ok(minW < T.FH && maxW > T.FH && maxW > T.FW * 0.85, '愛心可以比紅框小很多，也可以接近紅框寬度'); }
// 出題：紙張歪斜在範圍、不太接近 0；紅框整個（含角標）在紙張內；框的旋轉＝紙張
for (let i = 0; i < 4000; i++) {
  const c = T.makeRound(rnd);
  ok(Math.abs(c.phi) >= T.PAPER_TILT_MIN - 1e-9 && Math.abs(c.phi) <= T.PAPER_TILT + 1e-9, '紙張歪斜範圍');
  ok(c.frame.rot === c.phi, '紅框與紙同角度');
  const cs = T.corners(c.frame.x, c.frame.y, c.frame.rot, T.FW + 2 * 18, T.FH + 2 * 18);   // 連角標（間距 6＋腳長 12）一起算
  const cp = Math.cos(rad(-c.phi)), sp = Math.sin(rad(-c.phi));
  ok(cs.every(p => { const dx = p.x - T.PAPER.x, dy = p.y - T.PAPER.y, lx = dx * cp - dy * sp, ly = dx * sp + dy * cp; return Math.abs(lx) <= T.PAPER.w / 2 && Math.abs(ly) <= T.PAPER.h / 2; }), '紅框（含角標）在紙張範圍內');
  ok(Math.hypot(c.frame.x - T.PAPER.x, c.frame.y - T.PAPER.y) <= Math.hypot(T.FRAME_OFF.x, T.FRAME_OFF.y) + 1e-9, '位移範圍');
  ok(cs.every(p => p.x > 2 && p.x < 470 && p.y > 2 && p.y < 480), '紅框（含角標）整個在舞台可見範圍內');
}
// 起始位置：愛心在畫面內、離紅框中心很遠（不會一開始就蓋對）、整個愛心不超出舞台底部
{ let min = 1e9; for (let i = 0; i < 3000; i++) { const c = T.makeRound(rnd), lk = T.makeStamp(rnd), s = T.startOf(lk, 472, 640);
    min = Math.min(min, T.centerErr(s, c.frame).dist);
    ok(s.x - lk.w / 2 >= 0 && s.x + lk.w / 2 <= 472 && s.y + lk.h / 2 <= 640 - T.STAMP_BOTTOM + 1e-9 && s.y - lk.h / 2 >= 0, '起始愛心整個在畫面內：' + JSON.stringify(s)); }
  ok(min > 80, '起始位置離答案很遠：' + min.toFixed(1)); }
// insideStamp：用愛心外框（再多留 GRAB 的邊）來抓
{ const lk = { w: 200, h: 180 }, st = { x: 236, y: 400 };
  ok(T.insideStamp({ x: 236, y: 400 }, st, lk) && T.insideStamp({ x: 236 + 100 + T.GRAB - 1, y: 400 }, st, lk) && !T.insideStamp({ x: 236 + 100 + T.GRAB + 2, y: 400 }, st, lk) && !T.insideStamp({ x: 236, y: 400 - 90 - T.GRAB - 2 }, st, lk), 'insideStamp 外框＋容許範圍'); }
ok(T.zoomFor(100) === 1 && T.zoomFor(30) >= 2 && T.zoomFor(1) > T.zoomFor(10) && T.zoomFor(0) === 25, 'ZOOM 倍率');
ok(T.rating(0.1) !== T.rating(0.6) && T.rating(0.6) !== T.rating(1.5) && T.rating(1.5) !== T.rating(4) && T.rating(4) !== T.rating(9), '評語分級');
// 最壞的中心距離（舞台對角）要在排行榜範圍內
ok(T.toMm(T.centerErr({ x: 30, y: 540 }, { x: 436, y: 30, rot: -30 }).dist) <= G.score.max && T.toMm(Math.hypot(472, 640)) <= G.score.max, '最壞偏差在排行榜範圍內');
console.log(bad ? 'FAILED ' + bad + '（seed ' + SEED + '）' : 'ALL PASS');
