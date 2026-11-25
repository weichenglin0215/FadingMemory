// 瀏覽器實測：數字方格系列共用的介面（連號長龍 numchain、拖曳湊十 sumten）。用無頭 Chrome 開真的遊戲，用「真的滑鼠事件」操作：
//   一、版面：第 1 關 5×7、第 20 關 8×11、每格正方形、數字高度約格子高度的 85%（量畫出來的像素）、數字字色（連號長龍雙數紅；拖曳湊十 1～4 綠、5 橘、6～9 黑）；
//        得分「得分 X／XX」在標題列右邊；介面最下方只有「浮窗」勾選框（預設不勾），沒有「快速拖曳」「確定」
//   二、拖曳：手指一離開就計算（收走、得分、上面的方格往下掉補滿）；掉的時候拖不起來；拖回上一格收回；只點一下什麼都不發生；收不走的串清掉挑選
//   三、浮窗九宮格：預設不出現；勾選之後浮在手指上方兩格處（不蓋住手指上面那一格）、左右不超出畫面、手指離開就消失；選擇會記住；舊版存的設定不沿用
//   四、拖曳湊十：拖的時候對的串和錯的串底色一樣（不提示）；放開才知道，失敗閃紅、不計分
//   五、各個關卡（第 1、8、20、30 關）：每次拖盤面上最長的一串，一直到達標 → 過關
//   六、時間到（debug.wrong）：結算有說明
// 用法：node test/reaction/browser_numgrid.mjs [埠號] [numchain|sumten]   （先在專案根目錄開本機伺服器：python -m http.server 埠號；不指定遊戲就是 numchain）
import { connect, openGame, sleep } from './cdp.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..').replace(/\\/g, '/');
const PORT = process.argv[2] || '8743';
const GAME = process.argv[3] || 'numchain';                        // numchain＝連號長龍、sumten＝拖曳湊十
const SUM = GAME === 'sumten';
process.env.FM_PORT = PORT;
let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };
const cdp = await connect();
const js = (e) => cdp.evalJs(e);
const waitFor = async (expr, ms) => { for (let t = 0; t < (ms || 15000); t += 100) { if (await js(expr)) return true; await sleep(100); } return false; };
const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
// 這一關的畫面資料：盤面在視窗裡的位置、目前的數字、挑選的格子（等兩次量到的位置一樣才算穩定）
const geom1 = () => js(`JSON.stringify((function () { var a = Reaction.current.debug.api(), b = document.querySelector('.numgrid-board'); if (!a || !a.info || !a.game || !b) return null; var r = b.getBoundingClientRect(), s = document.querySelector('.rx-stage').getBoundingClientRect();
  return { left: r.left, top: r.top, w: r.width, h: r.height, stageLeft: s.left, stageRight: s.right, stageTop: s.top, stageBottom: s.bottom, cols: a.info.w, rows: a.info.h, vals: a.game.vals, sel: a.game.sel, score: a.game.score, target: a.info.target, level: a.info.level }; })())`).then(JSON.parse);
async function geom() { let prev = null; for (let i = 0; i < 40; i++) { const g = await geom1(); if (g && prev && g.left === prev.left && g.top === prev.top && g.w === prev.w) return g; prev = g; await sleep(150); } return prev; }
const centerOf = (g, k) => { const cell = g.w / g.cols; return { x: g.left + ((k % g.cols) + 0.5) * cell, y: g.top + (Math.floor(k / g.cols) + 0.5) * cell }; };
async function move(g, from, to) { const p0 = centerOf(g, from), p1 = centerOf(g, to); await mouse('mouseMoved', (p0.x + p1.x) / 2, (p0.y + p1.y) / 2); await mouse('mouseMoved', p1.x, p1.y); }
async function hold(g, p) { const a = centerOf(g, p[0]); await mouse('mousePressed', a.x, a.y); for (let i = 1; i < p.length; i++) await move(g, p[i - 1], p[i]); }
async function release(g, k) { const e = centerOf(g, k); await mouse('mouseReleased', e.x, e.y); }
async function drag(g, p) { await hold(g, p); await release(g, p[p.length - 1]); }
async function tap(g, k) { const c = centerOf(g, k); await mouse('mousePressed', c.x, c.y); await mouse('mouseReleased', c.x, c.y); }
// 盤面上最好的一串（連號長龍：最長的連號；拖曳湊十：得分最高的湊十）
const best = (vals) => js(`JSON.stringify(Reaction.current.test.${SUM ? 'bestMove' : 'bestChain'}(Reaction.current.debug.api().info.gr, ${JSON.stringify(vals)}, 0, 20000))`).then(JSON.parse);
// 這一串能得幾分：連號長龍＝1＋2＋…＋n；拖曳湊十＝總和
const gainOf = (vals, p) => SUM ? p.reduce((a, k) => a + vals[k], 0) : p.length * (p.length + 1) / 2;
// 一對相鄰、拖得起來、但收不走的兩格（連號長龍：差 1 但不到 3 格；拖曳湊十：總和不是 10 的倍數）
const badPair = (g) => { for (let k = 0; k < g.vals.length; k++) for (const m of [k + 1, k + g.cols]) { if (m >= g.vals.length || (m === k + 1 && (k + 1) % g.cols === 0)) continue; if (SUM ? (g.vals[k] + g.vals[m]) % 10 !== 0 : Math.abs(g.vals[k] - g.vals[m]) === 1) return [k, m]; } return null; };
const head = () => js(`JSON.stringify((function () { var lv = document.querySelector('.rx-head__lv'), inf = document.querySelector('.rx-head__info'), hd = document.querySelector('.rx-head'); var a = lv.getBoundingClientRect(), b = inf.getBoundingClientRect(), c = hd.getBoundingClientRect(); return { lv: lv.textContent, info: inf.textContent, lvRight: a.right, infoLeft: b.left, infoRight: b.right, headRight: c.right, headBottom: c.bottom }; })())`).then(JSON.parse);
const rect = (sel, i) => js(`JSON.stringify((function () { var e = document.querySelectorAll(${JSON.stringify(sel)})[${i || 0}]; if (!e) return null; var r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2, disp: getComputedStyle(e).display, dis: !!e.disabled, text: e.textContent, checked: !!e.checked }; })())`).then(JSON.parse);
async function clickAt(x, y) { await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); }
async function gotoLevel(n) { await js('Reaction.current.debug.goto(' + n + '); 1'); await waitFor('(function () { var a = Reaction.current.debug.api(); return !!a && a.level === ' + n + ' && !!a.info && !!a.game && !!document.querySelector(".numgrid-board"); })()'); await sleep(300); }
const calm = () => sleep(800);                          // 收走之後等方格掉完（消失 0.15 秒＋掉落 0.38 秒＋緩衝）
const checks = () => js('JSON.stringify([].map.call(document.querySelectorAll(".numgrid-check"), function (e) { return { text: e.textContent, on: e.querySelector("input").checked }; }))').then(JSON.parse);

try {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
  for (let tr = 0; tr < 3; tr++) { await openGame(cdp, GAME, { root: ROOT }); if (await js('!!(window.Reaction && Reaction.current && Reaction.current.debug && Reaction.current.test && document.querySelector(".numgrid-board"))')) break; }
  // 舊版存過「浮窗打勾」：新版不沿用（玩家指定浮窗預設改成不勾）
  await js('localStorage.removeItem("fm.numgrid.loupe"); localStorage.setItem("fm.numgrid.opts", JSON.stringify({ loupe: true, fast: false })); localStorage.setItem("fm.numchain.opts", JSON.stringify({ loupe: true })); 1');
  await openGame(cdp, GAME, { root: ROOT });                    // 重開：看預設值
  await waitFor('!!document.querySelector(".numgrid-board")'); await sleep(600);
  // ═══ 一、版面 ═══
  let g = await geom();
  ok(g.cols === 5 && g.rows === 7, '第 1 關盤面 5×7（玩家指定）：' + g.cols + '×' + g.rows);
  let cell = g.w / g.cols;
  ok(Math.abs(g.h / g.rows - cell) < 0.6, '每格是正方形（' + cell.toFixed(1) + '×' + (g.h / g.rows).toFixed(1) + '）');
  const hd = await head();
  ok(g.top - hd.headBottom < 40, '上方很緊：盤面離標題列底部 ' + (g.top - hd.headBottom).toFixed(0) + 'px（沒有說明列）');
  ok(!(await js('!!document.querySelector(".numgrid-tip")')), '沒有盤面上方的說明列');
  ok(/^得分 0／\d+$/.test(hd.info) && hd.info.indexOf('剩') < 0 && hd.info.indexOf('次') < 0, '標題列右邊：「' + hd.info + '」（沒有剩 X／X 次）');
  ok(hd.infoLeft > hd.lvRight && hd.headRight - hd.infoRight < 6, '得分在「' + hd.lv + '」的右方、靠在介面右邊（右緣離標題列右緣 ' + (hd.headRight - hd.infoRight).toFixed(1) + 'px）');
  // 介面最下方：只有「浮窗」
  const cks = await checks(), cL = await rect('.numgrid-check input', 0);
  ok(cks.length === 1 && cks[0].text === '浮窗', '介面最下方只剩一個勾選框「浮窗」：' + cks.map(c => c.text).join('、'));
  ok(cks[0].on === false, '「浮窗」預設不勾（舊版存過打勾也不沿用）');
  ok(!(await js('!!document.querySelector(".numgrid-ok") || [].some.call(document.querySelectorAll(".numgrid-bar button, .rx-stage button"), function (b) { return /確定/.test(b.textContent); })')), '沒有「確定」按鈕');
  ok(cL.top > g.top + g.h - 1 && cL.bottom <= g.stageBottom + 1 && g.stageBottom - cL.bottom < 20, '「浮窗」在盤面下方、介面最下面（離舞台下緣 ' + (g.stageBottom - cL.bottom).toFixed(0) + 'px）');
  // 數字高度：量格子內深色像素的上下範圍
  const ink = await js(`JSON.stringify((function () { var cv = document.querySelector('.numgrid-board'), g = cv.getContext('2d'), c = cv.width / ${g.cols}, out = [];
    for (var k = 0; k < 10; k++) { var x = (k % ${g.cols}) * c, y = Math.floor(k / ${g.cols}) * c, d = g.getImageData(x + 3, y + 3, c - 6, c - 6), top = -1, bot = -1;
      for (var j = 0; j < d.height; j++) for (var i = 0; i < d.width; i++) { var p = (j * d.width + i) * 4; if (d.data[p] + d.data[p + 1] + d.data[p + 2] < 400 && d.data[p + 3] > 200) { if (top < 0) top = j; bot = j; } }
      if (top >= 0) out.push((bot - top + 1) / c); } return out; })())`).then(JSON.parse);
  const avg = ink.reduce((a, b) => a + b, 0) / ink.length;
  ok(ink.length >= 8 && avg > 0.78 && avg < 0.92, '數字的高度約為格子高度的 ' + (avg * 100).toFixed(0) + '%（要求 85%）');
  // 數字字色：統計第 1 關與第 20 關盤面上每種數字的字色（每一格出現最多的非背景色）
  const inkColors = (cols) => js(`JSON.stringify((function () { var cv = document.querySelector('.numgrid-board'), g = cv.getContext('2d'), c = cv.width / ${cols}, vals = Reaction.current.debug.api().game.vals, out = {};
    for (var k = 0; k < vals.length; k++) { var x = (k % ${cols}) * c, y = Math.floor(k / ${cols}) * c, d = g.getImageData(x + 3, y + 3, c - 6, c - 6), cnt = {}, best = null;
      for (var j = 0; j < d.data.length; j += 4) { if (d.data[j + 3] < 250) continue; var key = d.data[j] + ',' + d.data[j + 1] + ',' + d.data[j + 2]; if (d.data[j] + d.data[j + 1] + d.data[j + 2] > 600) continue; cnt[key] = (cnt[key] || 0) + 1; }
      Object.keys(cnt).forEach(function (q) { if (!best || cnt[q] > cnt[best]) best = q; });
      (out[vals[k]] = out[vals[k]] || []).push(best); } return out; })())`).then(JSON.parse);
  const checkColors = (colors, tag) => {
    const seen = Object.keys(colors).map(Number).sort();
    if (SUM) {
      const want = n => n < 5 ? '0,128,0' : (n === 5 ? '230,115,0' : '0,0,0');
      ok(seen.every(n => colors[n].every(c => c === want(n))), tag + '字色：1～4 綠 (0,128,0)、5 橘 (230,115,0)、6～9 黑 (0,0,0)（出現的數字 ' + seen.join('') + '；' + seen.map(n => n + ':' + colors[n][0]).join(' ') + '）');
    } else {
      ok(seen.every(n => colors[n].every(c => (c === '180,0,0') === (n % 2 === 0))), tag + '雙數數字（2、4、6、8）是紅色 RGB(180,0,0)、單數不是（出現的數字：' + seen.join('') + '）');
    }
    return seen;
  };
  checkColors(await inkColors(g.cols), '第 1 關');
  // 第 20 關：8×11
  await gotoLevel(20);
  g = await geom(); cell = g.w / g.cols;
  ok(g.cols === 8 && g.rows === 11 && Math.abs(g.h / g.rows - cell) < 0.6 && cell >= 44, '第 20 關盤面 8×11（玩家指定）、每格 ' + cell.toFixed(1) + 'px');
  const bar2 = await rect('.numgrid-bar');
  ok(g.top + g.h <= bar2.top + 1, '8×11 的盤面完整放進舞台，沒有壓到最下面那一排（盤面下緣 ' + (g.top + g.h).toFixed(0) + '、那一排上緣 ' + bar2.top.toFixed(0) + '）');
  ok(checkColors(await inkColors(g.cols), '第 20 關').length === 9, '第 20 關盤面上 1～9 都出現過（字色全部檢查到了）');
  // ═══ 二、拖曳：手指一離開就計算 ═══
  const p0 = await best(g.vals);
  ok(p0.length >= 3, '盤面上最好的一串有 ' + p0.length + ' 格（' + (SUM ? '得 ' + gainOf(g.vals, p0) + ' 分' : '最長連號') + '）');
  // 只點一下：什麼都不發生
  await tap(g, p0[0]); await sleep(150);
  let g2 = await geom1(), info = (await head()).info;
  ok(g2.sel.length === 0 && g2.score === 0 && g2.vals.join() === g.vals.join() && info === '得分 0／' + g2.target, '只點一下：不挑選、不計分、不跳提醒（' + info + '）');
  // 按住拖三格再拖回起點
  await hold(g, p0.slice(0, 3)); await sleep(100);
  ok((await geom1()).sel.join() === p0.slice(0, 3).join(), '按著拖 3 格：3 格都挑到');
  await move(g, p0[2], p0[1]); await sleep(60);
  ok((await geom1()).sel.join() === p0.slice(0, 2).join(), '拖回上一格＝收回一格');
  await move(g, p0[1], p0[0]); await sleep(60); await release(g, p0[0]); await sleep(150);
  g2 = await geom1(); ok(g2.sel.length === 0 && g2.score === 0, '拖回起點才放開：什麼都沒收');
  // 收不走的兩格
  const bp0 = badPair(g);
  await drag(g, bp0); await sleep(120);
  g2 = await geom1(); info = (await head()).info;
  ok(g2.sel.length === 0 && g2.score === 0 && g2.vals.join() === g.vals.join(), '只拖 2 格（' + (SUM ? '總和不是 10' : '連號不到 3 格') + '）：放開就清掉挑選、不計分、盤面不動');
  ok(SUM ? /失敗/.test(info) : /至少連 3 格/.test(info), '標題列右邊提醒：' + info);
  await sleep(900);
  // 對的串：放開就收走
  const sc = gainOf(g.vals, p0);
  await hold(g, p0); await sleep(100);
  g2 = await geom1();
  ok(g2.sel.length === p0.length && g2.score === 0 && g2.vals.join() === g.vals.join(), '手指還沒離開：不計算（挑到 ' + g2.sel.length + ' 格、得分 0）');
  await release(g, p0[p0.length - 1]); await sleep(60);
  g2 = await geom1();
  ok(g2.score === sc && g2.sel.length === 0, '手指一離開就收走 ' + p0.length + ' 格、得 ' + g2.score + ' 分（不用按任何按鈕）');
  ok((await head()).info === '得分 ' + g2.score + '／' + g2.target, '標題列右邊跟著更新：' + (await head()).info);
  // 掉落中拖不起來
  const k1 = 3 * g.cols + 3, c1 = centerOf(g, k1);
  await mouse('mousePressed', c1.x, c1.y);
  ok((await geom1()).sel.length === 0, '方格還在往下掉時，手指按下去挑選不起來');
  await mouse('mouseReleased', c1.x, c1.y);
  await calm();
  g2 = await geom1();
  ok(g2.vals.every(v => v >= 1 && v <= 9) && g2.vals.length === 88, '掉完之後盤面每一格都有數字（上面補了新的方格）');
  // ═══ 三、浮窗九宮格 ═══
  g = await geom(); cell = g.w / g.cols;
  const fingerRow = 8, fingerCol = 0, fk = fingerRow * g.cols + fingerCol, fc = centerOf(g, fk);
  await mouse('mousePressed', fc.x, fc.y); await sleep(100);
  let lp = await rect('.numgrid-loupe');
  ok(lp.disp === 'none', '預設不勾「浮窗」：手指按著不會出現九宮格');
  await mouse('mouseReleased', fc.x, fc.y); await sleep(100);
  let cl = await rect('.numgrid-check input', 0); await clickAt(cl.x, cl.y); await sleep(100);
  ok((await checks())[0].on === true, '點「浮窗」勾選框 → 勾選');
  ok((await js('localStorage.getItem("fm.numgrid.loupe")')) === 'true', '選擇存起來了');
  await mouse('mousePressed', fc.x, fc.y); await sleep(120);
  lp = await rect('.numgrid-loupe');
  ok(lp && lp.disp === 'block', '勾了之後，手指按在盤面上：浮窗九宮格出現');
  ok(lp.left >= g.stageLeft - 0.5 && lp.right <= g.stageRight + 0.5, '手指在最左邊：浮窗左右不超出畫面（' + lp.left.toFixed(0) + '～' + lp.right.toFixed(0) + '，畫面 ' + g.stageLeft.toFixed(0) + '～' + g.stageRight.toFixed(0) + '）');
  const aboveTop = g.top + (fingerRow - 1) * cell;
  ok(lp.bottom <= aboveTop + 1, '浮窗在手指上方兩格處：下緣 ' + lp.bottom.toFixed(0) + ' ≤ 手指上面那一格的上緣 ' + aboveTop.toFixed(0) + '（沒有蓋住它）');
  ok(lp.bottom > aboveTop - cell * 0.6 - 4, '而且貼近手指（只空一格，下緣離那一格的上緣只差 ' + (aboveTop - lp.bottom).toFixed(1) + 'px）');
  ok(Math.abs(lp.w - 3 * Math.min(cell, 64) - 4) < 3, '浮窗是 3×3 格（寬 ' + lp.w.toFixed(0) + 'px）');
  const shotA = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await mouse('mouseMoved', fc.x + 3, fc.y); await mouse('mouseReleased', fc.x, fc.y); await sleep(120);
  lp = await rect('.numgrid-loupe'); ok(lp.disp === 'none', '手指離開：浮窗消失');
  // 手指在最右邊
  const kr = 9 * g.cols + (g.cols - 1), cr = centerOf(g, kr);
  await mouse('mousePressed', cr.x, cr.y); await sleep(100);
  lp = await rect('.numgrid-loupe'); ok(lp.right <= g.stageRight + 0.5 && lp.left >= g.stageLeft - 0.5, '手指在最右邊：浮窗不超出畫面（' + lp.left.toFixed(0) + '～' + lp.right.toFixed(0) + '）');
  await mouse('mouseReleased', cr.x, cr.y); await sleep(100);
  // 手指在上方：上面放不下，改放手指下方
  const kt = 1 * g.cols + 4, ct = centerOf(g, kt);
  await mouse('mousePressed', ct.x, ct.y); await sleep(100);
  lp = await rect('.numgrid-loupe');
  ok(lp.top >= g.top + 3 * cell - 1 && lp.top >= g.stageTop - 0.5, '手指在上面幾列：浮窗放不下上方，改放手指下方（上緣 ' + lp.top.toFixed(0) + ' ≥ ' + (g.top + 3 * cell).toFixed(0) + '）');
  await mouse('mouseReleased', ct.x, ct.y); await sleep(100);
  ok((await geom1()).sel.length === 0, '（點幾下之後沒有殘留的挑選）');
  // 重開之後還是勾著（記住）；再取消勾選
  await openGame(cdp, GAME, { root: ROOT }); await waitFor('!!document.querySelector(".numgrid-board")'); await sleep(500);
  ok((await checks())[0].on === true, '重新進遊戲：「浮窗」維持上次的選擇（勾選）');
  cl = await rect('.numgrid-check input', 0); await clickAt(cl.x, cl.y); await sleep(100);
  ok((await checks())[0].on === false && (await js('localStorage.getItem("fm.numgrid.loupe")')) === 'false', '再點一次 → 取消勾選，也記住');
  g = await geom(); const fc2 = centerOf(g, 2 * g.cols + 2);
  await mouse('mousePressed', fc2.x, fc2.y); await sleep(100);
  ok((await rect('.numgrid-loupe')).disp === 'none', '取消勾選之後手指按著不出現九宮格');
  await mouse('mouseReleased', fc2.x, fc2.y);
  // ═══ 四、拖曳湊十專屬：照順序剛好湊成段才算；多拖一格就整串失敗；畫面不提示對不對 ═══
  if (SUM) {
    await gotoLevel(12); g = await geom();
    const pb = await best(g.vals), last = pb[pb.length - 1];
    const extra = await js(`JSON.stringify(Reaction.current.test.neighbors(Reaction.current.debug.api().info.gr, ${last}).filter(function (k) { return ${JSON.stringify(pb)}.indexOf(k) < 0; })[0])`).then(JSON.parse);
    // 量挑選格子的底色：對的串（還按著）跟錯的串（再多拖一格）顏色一樣、沒有第二種顏色
    const bgOf = (cells) => js(`JSON.stringify((function () { var cv = document.querySelector('.numgrid-board'), x = cv.getContext('2d'), c = cv.width / ${g.cols}; return ${JSON.stringify(cells)}.map(function (k) { var d = x.getImageData(Math.round((k % ${g.cols}) * c + c * 0.12), Math.round(Math.floor(k / ${g.cols}) * c + c * 0.12), 1, 1).data; return d[0] + ',' + d[1] + ',' + d[2]; }); })())`).then(JSON.parse);
    const before0 = (await geom1()).score, vals0 = (await geom1()).vals;
    await hold(g, pb); await sleep(150);
    const goodBg = await bgOf(pb), goodInfo = (await head()).info;
    await move(g, last, extra); await sleep(150);
    const badBg = await bgOf(pb.concat([extra])), badInfo = (await head()).info;
    ok(new Set(goodBg.concat(badBg)).size === 1, '拖的時候，對的串和錯的串挑選格子的底色完全一樣（不提示）：' + [...new Set(goodBg.concat(badBg))].join(' / '));
    ok(goodInfo === badInfo && /^得分/.test(goodInfo), '標題列在兩種情況也一樣：' + goodInfo);
    await release(g, extra); await sleep(120);
    g2 = await geom1();
    const red = await bgOf(pb.concat([extra]));
    ok(g2.score === before0 && g2.sel.length === 0 && g2.vals.join() === vals0.join(), '多拖一格（最後一段湊不滿 10）→ 放開後整串失敗：完全不計分、盤面不動、挑選清掉');
    ok(red.every(c => { const [r, gg, b] = c.split(',').map(Number); return r > 150 && gg < 110 && b < 110; }), '失敗的那幾格閃紅：' + red[0]);
    ok(/失敗/.test((await head()).info), '標題列右邊寫失敗：' + (await head()).info);
    const shotD = await cdp.send('Page.captureScreenshot', { format: 'png' });
    if (process.env.SHOT) (await import('node:fs')).writeFileSync(process.env.SHOT + '_fail.png', Buffer.from(shotD.data, 'base64'));
    await sleep(900);
    const after = await bgOf(pb);
    ok(after.every(c => { const [r, gg] = c.split(',').map(Number); return r > 230 && gg > 230; }), '閃紅約 0.65 秒後恢復原本的格子：' + after[0]);
    await drag(g, pb); await calm();
    ok((await geom1()).score === before0 + gainOf(vals0, pb), '同一串正確地拖（不多拖）→ 放開就得 ' + gainOf(vals0, pb) + ' 分');
  }
  // ═══ 五、各個關卡：每次拖最長的一串，一直到達標 ═══
  for (const lv of [1, 8, 20, 30]) {
    await gotoLevel(lv);
    g = await geom();
    ok(g && g.level === lv && g.w / g.cols >= 44, '第 ' + lv + ' 關：棋盤 ' + g.cols + '×' + g.rows + '、目標 ' + g.target + ' 分；每格 ' + (g.w / g.cols).toFixed(0) + 'px');
    let used = 0, done = false;
    for (let i = 0; i < 220 && !done; i++) {     // 目標分數是玩家自己調的（高關卡要收幾十串），上限放寬
      if (await js('Reaction.current.debug.api().over')) break;
      g = await geom1();
      const p = await best(g.vals);
      if (p.length < 3) break;
      await drag(g, p); used++; await calm();
      done = (await head()).info.replace(/^得分 /, '').split('／').map(Number).reduce((a, b) => a >= b) || await js('Reaction.current.debug.api().over');
    }
    const h2 = await head();
    const [sc2, tg] = h2.info.replace('得分 ', '').split('／').map(Number);
    ok(sc2 >= tg, '第 ' + lv + ' 關：用滑鼠每次拖最長的一串（放開就算），拖 ' + used + ' 次 → 達標（' + h2.info + '）');
    ok(await waitFor('Reaction.current.debug.state().level === ' + (lv + 1), 6000), '第 ' + lv + ' 關：過關後進下一關');
  }
  // 版面截圖
  await gotoLevel(20); await sleep(300);
  g = await geom();
  const pz = await best(g.vals); await drag(g, pz.slice(0, 5));
  const c5 = centerOf(g, pz[4]); await mouse('mousePressed', c5.x, c5.y); await mouse('mouseMoved', c5.x + 1, c5.y); await sleep(150);
  const shotC = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await mouse('mouseReleased', c5.x, c5.y);
  const fs = await import('node:fs');
  if (process.env.SHOT) { fs.writeFileSync(process.env.SHOT + '_loupe.png', Buffer.from(shotA.data, 'base64')); fs.writeFileSync(process.env.SHOT + '_sel.png', Buffer.from(shotC.data, 'base64')); }
  // ═══ 六、時間到 ═══
  await openGame(cdp, GAME, { root: ROOT });
  await waitFor('!!document.querySelector(".numgrid-board")'); await sleep(500);
  await js('Reaction.current.debug.wrong(); 1'); await sleep(700);
  ok(await waitFor('!!document.querySelector(".dlg--result")', 12000), '時間到之後跳出結算');
  const card = await js('JSON.stringify([].map.call(document.querySelectorAll(".dlg--result .rx-result__line"), function (e) { return e.textContent; }))').then(JSON.parse);
  ok(card.join('｜').indexOf('時間到') >= 0 && card.join('｜').indexOf('目標') >= 0, '結算說明：' + card.join('｜'));
  const stg = await js('JSON.stringify((function () { var e = document.querySelector(".dlg--result .rx-result__label .rx-result__stage"), l = document.querySelector(".dlg--result .rx-result__label"); return e ? { stage: e.textContent, label: l.textContent, border: getComputedStyle(e).borderTopWidth, color: getComputedStyle(e).color, radius: getComputedStyle(e).borderTopLeftRadius } : null; })())').then(JSON.parse);
  ok(stg && ['小學', '中學', '高中', '大學', '碩士', '博士'].includes(stg.stage) && stg.label.length > stg.stage.length, '結算：評價「' + (stg && stg.label.replace(stg.stage, '')) + '」後面加上學歷階段「' + (stg && stg.stage) + '」');
  ok(stg && stg.border === '1px' && stg.color === 'rgb(0, 0, 0)' && parseFloat(stg.radius) > 100, '階段是藥丸形狀：細黑框、黑字（' + JSON.stringify(stg) + '）');
  await js('localStorage.removeItem("fm.numgrid.loupe"); localStorage.removeItem("fm.numgrid.opts"); localStorage.removeItem("fm.numchain.opts"); 1');
} finally { cdp.close(); }
console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS（' + total + ' 項檢查）');
process.exit(bad ? 1 : 0);
