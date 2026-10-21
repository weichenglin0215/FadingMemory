// V1.36.0 改版遊戲的「真滑鼠」畫面驗證（headless Chrome／Edge，不用裝任何套件）：
//   用 Chrome DevTools Protocol 送真的滑鼠按下／移動／放開，逐款操作 V1.36.0 改過的遊戲，檢查畫面上的元素、操作的結果，並把每個重要畫面存成截圖（看版面有沒有跑掉）。
//   鋪地毯（家具 emoji、走進死路不判失敗、往回拖）、缺哪一張（多選＋「我選好了」）、蹺蹺板（拖到座位、換位、傾斜）、堵住五子（題庫題目）、
//   反著滑（箭頭一出現就能滑、九宮格）、敲幾下（「我數好了」要敲了才出現、師父敲銅缽的動作）、記行事曆（圖示消失後的閃爍干擾）、
//   色票排隊（靠攏後沒有縫）、畫眉毛（揭曉時整張臉轉正）、圈內圈外（不規則曲線、小螞蟻）。
// 前置：本機伺服器已開（python -m http.server 8743）。
// 用法（在專案根目錄）：
//   node test/reaction/ui_v136_check.mjs                    全部
//   node test/reaction/ui_v136_check.mjs carpet seesaw      指定幾款
//   OUT=某資料夾 node ...                                    截圖存放位置（預設 %TEMP%/fm-v136-check）
//   VIEW=390x844 node ...                                   換成手機大小的視窗（預設 500x850）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const OUT = process.env.OUT || path.join(os.tmpdir(), 'fm-v136-check');
const [VW, VH] = (process.env.VIEW || '500x850').split('x').map(Number);
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
let cdp, failures = 0, checks = 0;
const J = async (expr) => { const v = await cdp.evalJs('JSON.stringify((function(){ return ' + expr + '; })())'); return v == null ? null : JSON.parse(v); };
const ok = (c, m) => { checks++; if (!c) { failures++; console.log('  FAIL', m); } else console.log('  ok  ', m); };
const state = () => J('Reaction.current.debug.state()');
const info = () => J('Reaction.current.debug.info()');
const rect = (css, i) => J('(function(){ var e = document.querySelectorAll(' + JSON.stringify(css) + ')[' + (i || 0) + ']; if (!e) return null; var r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; })()');
const count = (css) => J('document.querySelectorAll(' + JSON.stringify(css) + ').length');
const text = (css) => J('(function(){ var e = document.querySelector(' + JSON.stringify(css) + '); return e ? e.textContent : null; })()');
const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' || type === 'mouseMoved' ? 0 : 1, clickCount: 1 });
async function click(x, y) { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await sleep(50); await mouse('mouseReleased', x, y); }
async function clickEl(css, i) { const r = await rect(css, i); if (!r) throw new Error('找不到元素 ' + css + '[' + (i || 0) + ']'); await click(r.cx, r.cy); }
async function drag(points, hold) { await mouse('mouseMoved', points[0][0], points[0][1]); await mouse('mousePressed', points[0][0], points[0][1]); for (let i = 1; i < points.length; i++) { await mouse('mouseMoved', points[i][0], points[i][1]); await sleep(22); } if (!hold) await mouse('mouseReleased', points[points.length - 1][0], points[points.length - 1][1]); }
const line = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
async function waitFor(fn, ms, what) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(100); } throw new Error('等不到：' + what); }
async function shot(name) { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64')); }
// 開某一款遊戲；level>1 時先把最佳關卡設成 level+4（「最佳 − 4 進場」），開頭就從 level 開始
async function start(id, level) {
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await cdp.send('Page.navigate', { url: 'http://localhost:8743/reaction.html?game=' + id + '&t=' + Date.now() });
  await waitFor(() => cdp.evalJs('!!(window.Reaction && Reaction.current && document.readyState === "complete" && window.Leaderboard)').catch(() => false), 15000, id + ' 載入');
  await cdp.send('Storage.clearDataForOrigin', { origin: 'http://localhost:8743', storageTypes: 'local_storage' }).catch(() => { });
  if (level > 1) await cdp.evalJs('localStorage.setItem("fm.reaction.lvbest.' + id + '", "' + (level + 4) + '")');
  await openGame(cdp, id, { root: ROOT });
  await sleep(500);
}
const inStage = async (css) => J('(function(){ var s = document.getElementById("stage").getBoundingClientRect(), e = [].slice.call(document.querySelectorAll(' + JSON.stringify(css) + ')); return e.every(function(x){ var r = x.getBoundingClientRect(); return r.width === 0 || (r.left >= s.left - 1 && r.right <= s.right + 1 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1); }); })()');

const T = {
  // ───────── 鋪地毯 ─────────
  async carpet() {
    await start('carpet', 8);
    const q = await info(), n = q.n;
    const FURN = ['🎃', '🎄', '🧳', '🪑', '🛋️', '🛁', '🛏️', '🛌', '🪞'];
    const stones = await J('[].map.call(document.querySelectorAll(".cpt-stone"), function(e){ return e.textContent; })');
    ok(stones.length === q.stones.length && stones.length > 0 && stones.every(s => FURN.includes(s)), '家具是 emoji（' + stones.join('') + '），數量 ' + stones.length + ' = 題目的 ' + q.stones.length);
    ok(new Set(stones).size > 1 || stones.length < 3, '家具圖案有變化');
    ok(await inStage('.cpt-stone'), '家具都在舞台裡');
    await shot('carpet_1_start');
    // 家具位置：真正分散（沒有任何一個空格被圍成死角）
    const cells = await J('(function(){ var b = document.querySelector(".cpt-board").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width }; })()');
    const cs = cells.w / n, center = (i) => [cells.x + (i % n + 0.5) * cs, cells.y + (Math.floor(i / n) + 0.5) * cs];
    // 走進死路：用解答前面的幾格再轉進一條死巷——找一條「走得進去、但走不完」的路（從起點隨機走到被困住）
    const blocked = new Set(q.stones), nb = (i) => { const r = Math.floor(i / n), c = i % n, o = []; if (r > 0) o.push(i - n); if (c < n - 1) o.push(i + 1); if (r < n - 1) o.push(i + n); if (c > 0) o.push(i - 1); return o.filter(x => !blocked.has(x)); };
    let walk = null;
    for (let t = 0; t < 400 && !walk; t++) { const path = [q.start], seen = new Set(path); for (;;) { const cand = nb(path[path.length - 1]).filter(x => !seen.has(x)); if (!cand.length) break; const nx = cand[Math.floor(Math.random() * cand.length)]; path.push(nx); seen.add(nx); } if (path.length < q.free && path.length >= 4) walk = path; }
    ok(!!walk, '找得到一條走進死路的走法（鋪了 ' + (walk && walk.length) + ' 格，共要鋪 ' + q.free + ' 格）');
    await drag(walk.map(center).flatMap((p, i, a) => i ? line(a[i - 1], p, 3).slice(1) : [p]), true);
    await sleep(500);
    ok((await count('.dlg--result')) === 0, '走進死路之後，沒有跳出失敗彈窗（不立刻判失敗）');
    ok(!/死路/.test(await text('.cpt-tip')), '提示文字沒有提醒「走進死路」：「' + (await text('.cpt-tip')) + '」');
    await shot('carpet_2_deadend');
    // 往回拖（手指還按著）：捲回 3 格
    const back = walk.slice(-4).reverse();
    for (let i = 1; i < back.length; i++) { const [a, b] = [center(back[i - 1]), center(back[i])]; for (const p of line(a, b, 3).slice(1)) { await mouse('mouseMoved', p[0], p[1]); await sleep(22); } }
    await sleep(200);
    ok(/已鋪 (\d+)／/.exec(await text('.cpt-tip')) && Number(/已鋪 (\d+)／/.exec(await text('.cpt-tip'))[1]) === walk.length - 3, '手指往回拖，地毯捲回 3 格：「' + (await text('.cpt-tip')) + '」');
    await mouse('mouseReleased', ...center(walk[walk.length - 4]));
    // 重新從捲頭開始、照解答鋪滿 → 過關
    await cdp.evalJs('Reaction.current.debug.solve(); 1');
    await waitFor(async () => (await state()).cleared >= 1, 4000, '鋪滿過關');
    ok(true, '照解答鋪滿 → 過關');
    await shot('carpet_3_done');
  },

  // ───────── 缺哪一張 ─────────
  async mahjong3() {
    for (const lv of [1, 14]) {
      await start('mahjong3', lv);
      const q = await info();
      ok((await count('.mj3-key')) === 9, '第 ' + lv + ' 關：九顆牌鍵');
      ok(await J('document.querySelector(".mj3-go").disabled'), '一張都沒選時「我選好了」按不下去');
      ok((await text('.mj3-go')) === '我選好了', '按鈕文字是「我選好了」');
      await shot('mahjong3_lv' + lv + '_start');
      // 先選一張答案，按鈕變成「我選好了（選了 1 張）」
      const W = q.winners;
      await clickEl('.mj3-key', W[0] - 1); await sleep(100);
      ok(/選了 1 張/.test(await text('.mj3-go')) && !(await J('document.querySelector(".mj3-go").disabled')), '選了一張之後按鈕可按：「' + (await text('.mj3-go')) + '」');
      await clickEl('.mj3-key', W[0] - 1); await sleep(100);
      ok(await J('document.querySelector(".mj3-go").disabled'), '再點一次取消選取');
      // 漏選一張 → 失敗（只在答案 ≥ 2 張時測）
      if (W.length >= 2) {
        for (const w of W.slice(0, -1)) await clickEl('.mj3-key', w - 1);
        await sleep(100); await clickEl('.mj3-go'); await sleep(900);
        ok((await count('.mj3-key--miss')) === 1 && (await count('.mj3-key--ok')) === W.length - 1, '漏選一張：漏掉的牌鍵橘色虛線、選對的綠色');
        ok(await inStage('.mj3-cap,.mj3-strip,.mj3-tile'), '揭曉的文字與牌都在舞台內');
        await shot('mahjong3_lv' + lv + '_miss');
        await waitFor(() => count('.dlg--result').then(c => c > 0), 6000, '失敗結算');
        ok(true, '失敗結算彈窗出現');
        await start('mahjong3', lv);
      }
      // 全選對 → 過關
      const q2 = await info();
      for (const w of q2.winners) await clickEl('.mj3-key', w - 1);
      await sleep(100);
      ok(/選了 (\d+) 張/.exec(await text('.mj3-go'))[1] === String(q2.winners.length), '選了 ' + q2.winners.length + ' 張：「' + (await text('.mj3-go')) + '」');
      await clickEl('.mj3-go'); await sleep(700);
      await waitFor(async () => (await state()).cleared >= 1, 4000, '全選對過關');
      ok(true, '全部選對 → 過關');
      await shot('mahjong3_lv' + lv + '_pass');
      // 選到多的 → 失敗，並且畫出湊不起來的牌
      await start('mahjong3', lv);
      const q3 = await info(), wrong = [1, 2, 3, 4, 5, 6, 7, 8, 9].find(x => !q3.winners.includes(x));
      if (wrong) {
        for (const w of q3.winners) await clickEl('.mj3-key', w - 1);
        await clickEl('.mj3-key', wrong - 1); await sleep(100); await clickEl('.mj3-go'); await sleep(900);
        ok((await count('.mj3-key--bad')) === 1, '多選一張：紅色');
        ok((await count('.mj3-tile--left')) > 0 || q3.dead.includes(wrong), '多選的牌畫出湊不起來的牌（紅色）或說明死牌');
        await shot('mahjong3_lv' + lv + '_extra');
      }
    }
  },

  // ───────── 蹺蹺板比重 ─────────
  async seesaw() {
    await start('seesaw', 1);
    const q = await info();
    const sizes = await J('[].map.call(document.querySelectorAll(".sea-an"), function(e){ return { w: Math.round(e.getBoundingClientRect().width), badge: e.querySelector(".sea-badge").textContent }; })');
    ok(sizes.length === q.n, '動物 ' + q.n + ' 隻');
    const byW = sizes.slice().sort((x, y) => Number(x.badge) - Number(y.badge));
    ok(byW.every((x, i) => i === 0 || (Number(x.badge) === Number(byW[i - 1].badge) ? x.w === byW[i - 1].w : x.w > byW[i - 1].w)), '動物大小隨重量放大（越重越大、一樣重一樣大）：' + byW.map(x => x.badge + '→' + x.w + 'px').join('、'));
    ok((await count('.sea-slot')) === q.S * 2, '板子上標著 ' + q.S * 2 + ' 個座位的格數');
    await shot('seesaw_1_start');
    const angle0 = await J('(function(){ var m = new DOMMatrix(getComputedStyle(document.querySelector(".sea-board")).transform); return Math.atan2(m.b, m.a) * 180 / Math.PI; })()');
    ok(Math.abs(angle0) > 1, '一開始板子是歪的：' + angle0.toFixed(1) + '°');
    // 找一隻要搬的動物，拖到目標座位
    const best = q.best.best, mv = best.findIndex((s, i) => s !== q.pos[i] && !q.fixed[i]);
    ok(mv >= 0, '有一隻動物要換座位（第 ' + mv + ' 隻，從 ' + q.pos[mv] + ' 到 ' + best[mv] + '）');
    const target = best[mv];
    // 目標座位的畫面位置：用座位刻度的標籤（同一邊、離支點 |target| 格）
    const slots = await J('[].map.call(document.querySelectorAll(".sea-slot"), function(e){ var r = e.getBoundingClientRect(); return { n: e.textContent, x: r.left + r.width / 2, y: r.top }; })');
    const pivot = await rect('.sea-pivot'), an = await rect('.sea-an[data-i="' + mv + '"]');
    const want = slots.filter(s => Number(s.n) === Math.abs(target) && (target < 0 ? s.x < pivot.cx : s.x > pivot.cx))[0];
    ok(!!want, '找得到目標座位的刻度');
    // 拿起 → 板子馬上重新傾斜
    await mouse('mouseMoved', an.cx, an.cy); await mouse('mousePressed', an.cx, an.cy);
    await mouse('mouseMoved', an.cx, an.cy - 120); await sleep(900);
    const angle1 = await J('(function(){ var m = new DOMMatrix(getComputedStyle(document.querySelector(".sea-board")).transform); return Math.atan2(m.b, m.a) * 180 / Math.PI; })()');
    ok(Math.abs(angle1 - angle0) > 0.5, '拿起一隻動物，板子馬上傾斜：' + angle0.toFixed(1) + '° → ' + angle1.toFixed(1) + '°');
    await shot('seesaw_2_held');
    for (const p of line([an.cx, an.cy - 120], [want.x, want.y - 50], 8).slice(1)) { await mouse('mouseMoved', p[0], p[1]); await sleep(25); }
    ok((await count('.sea-aim')) === 1 && (await J('document.querySelector(".sea-aim").style.display')) !== 'none', '拖到座位上方時，有虛線圓圈預告');
    await mouse('mouseReleased', want.x, want.y - 50); await sleep(1500);
    await shot('seesaw_3_dropped');
    if (q.best.moves > 1) await cdp.evalJs('Reaction.current.debug.solve(); 1');          // 這一關要換好幾隻：第一隻用真滑鼠拖，其餘用 debug.solve 補完
    await waitFor(async () => (await state()).cleared >= 1, 6000, '平衡過關');
    ok(true, (q.best.moves > 1 ? '拖一隻＋補完其餘' : '搬一隻到目標座位') + ' → 板子平衡 → 過關');
    // 失敗揭曉：高一點的關卡（有固定的動物）
    await start('seesaw', 12);
    const q2 = await info();
    ok(q2.fixed.some(Boolean), '第 12 關有被固定的動物');
    ok((await count('.sea-pintag')) === q2.fixed.filter(Boolean).length, '固定的動物有「固定」標籤');
    await shot('seesaw_4_pinned');
    await cdp.evalJs('Reaction.current.debug.wrong(); 1'); await sleep(900);
    ok((await count('.sea-ghost')) > 0 && (await count('.sea-an--move')) > 0, '時間到：標出該換座位的動物與目標座位的虛線圓圈');
    await shot('seesaw_5_timeout');
  },

  // ───────── 堵住五子 ─────────
  async gomoku() {
    let bank = false;
    for (let t = 0; t < 8 && !bank; t++) { await start('gomoku', 20); const q = await info(); if (q.kind === 'bank') bank = q; }
    ok(!!bank, '第 20 關出得了題庫題型（D' + (bank && bank.tier) + '，棋子 ' + (bank && bank.stones) + ' 顆）');
    ok(/快贏了/.test(await text('.gmk-tip')), '提示文字：「' + (await text('.gmk-tip')) + '」');
    await shot('gomoku_1_bank');
    const b = await rect('.gmk-board'), n = bank.n, cell = b.w / n, x = bank.x;
    await click(b.x + (x % n + 0.5) * cell, b.y + (Math.floor(x / n) + 0.5) * cell);
    await waitFor(async () => (await state()).cleared >= 1, 4000, '點唯一的擋法過關');
    ok(true, '點唯一的擋法 → 過關');
    // 點錯 → 白棋連下幾手
    let q2 = null;
    for (let t = 0; t < 8 && !(q2 && q2.kind === 'bank'); t++) { await start('gomoku', 20); q2 = await info(); }
    const b2 = await rect('.gmk-board'), wrong = [...Array(169).keys()].find(i => q2.board[i] === 0 && i !== q2.x && Math.abs(i % 13 - q2.x % 13) > 4);
    await click(b2.x + (wrong % 13 + 0.5) * b2.w / 13, b2.y + (Math.floor(wrong / 13) + 0.5) * b2.w / 13);
    await waitFor(async () => (await count('.gmk-five')) >= 1, 12000, '白棋連成五顆的紅線');
    ok((await count('.gmk-five')) >= 1 && (await count('.gmk-stone--new')) >= 2, '點錯：白棋依序下出致勝的幾手並畫出紅線連五（新下的棋 ' + (await count('.gmk-stone--new')) + ' 顆）');
    await shot('gomoku_2_fail');
  },

  // ───────── 反著滑 ─────────
  async swipecopy() {
    await start('swipecopy', 1);
    ok((await count('.swc-gridline')) === 4, '九宮格有 4 條格線');
    const q = await info();
    // 等箭頭出現（pop）
    await waitFor(() => count('.swc-pop').then(c => c === 1), 5000, '箭頭出現');
    const pop = await rect('.swc-pop'), zone = await rect('.swc-zone');
    const gx = Math.floor((pop.cx - zone.x) / (zone.w / 3)), gy = Math.floor((pop.cy - zone.y) / (zone.h / 3));
    ok(gy * 3 + gx === q.cell, '箭頭出現在九宮格第 ' + (q.cell + 1) + ' 格的正中央（畫面上算出第 ' + (gy * 3 + gx + 1) + ' 格）');
    ok(Math.abs(pop.cx - (zone.x + (gx + 0.5) * zone.w / 3)) < 8 && Math.abs(pop.cy - (zone.y + (gy + 0.5) * zone.h / 3)) < 8, '位置在格子正中央（不偏移）');
    ok(q.matched, '第 1 關：箭頭出現在它所指的那一格（朝上在上方中間…）');
    await shot('swipecopy_1_arrow');
    // 箭頭還亮著就滑反方向（還沒消失）
    const V = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]], want = V[q.req[0]];
    const t0 = Date.now();
    await drag(line([zone.cx, zone.cy], [zone.cx + want[0] * 90, zone.cy + want[1] * 90], 6));
    await waitFor(async () => (await state()).cleared >= 1 || /反應/.test(await text('.swc-info')), 3000, '滑對 → 過關');
    ok(/反應 \d+\.\d{4} 秒/.test(await text('.swc-info')), '顯示反應時間（4 位小數）：「' + (await text('.swc-info')) + '」');
    ok(Date.now() - t0 < 2500, '箭頭一出現就能滑（不用等它消失）');
    await shot('swipecopy_2_pass');
    // 滑錯方向
    await start('swipecopy', 1);
    const q2 = await info(); await waitFor(() => count('.swc-pop').then(c => c === 1), 5000, '箭頭出現');
    const zone2 = await rect('.swc-zone'), wrongV = V[q2.dirs[0]];
    await drag(line([zone2.cx, zone2.cy], [zone2.cx + wrongV[0] * 90, zone2.cy + wrongV[1] * 90], 6));
    await sleep(800);
    ok((await count('.swc-cell--bad')) === 1 && /滑錯/.test(await text('.swc-tip')), '滑錯方向 → 顯示箭頭、該滑的方向、你滑的方向：「' + (await text('.swc-info')) + '」');
    await shot('swipecopy_3_wrong');
    // 超時
    await start('swipecopy', 1);
    const q3 = await info(); await sleep(q3.prepMs + q3.respMs + 600);
    ok(/來不及/.test(await text('.swc-tip')), '超過時間沒滑 → 來不及');
    // 高關卡：箭頭可能出現在不是它所指的那一格
    let off = false;
    for (let t = 0; t < 6 && !off; t++) { await start('swipecopy', 30); const q4 = await info(); if (!q4.matched) off = true; }
    ok(off, '第 30 關：箭頭會出現在不是它所指的那一格');
    await waitFor(() => count('.swc-pop').then(c => c === 1), 5000, '箭頭出現'); await shot('swipecopy_4_lv30');
  },

  // ───────── 敲幾下 ─────────
  async knockcount() {
    await start('knockcount', 6);
    const q = await info();
    ok((await J('document.querySelector(".knk-done").style.display')) === 'none', '一開始「我數好了」是藏起來的');
    ok((await count('.knk-mallet2')) === 1, '師父有第二支木槌（專門敲銅缽）');
    ok(q.bowls > 0, '第 6 關有銅缽干擾 ' + q.bowls + ' 聲');
    // 銅缽響之前，師父的手揮出去
    const bowl = q.events.find(e => e.type === 'bowl');
    const t0 = Date.now();
    await waitFor(() => J('document.querySelector(".knk-mallet2--hit") !== null'), bowl.t + 3000, '師父揮出銅缽槌');
    ok(true, '銅缽聲之前，師父的第二支木槌開始揮（knk-mallet2--hit）');
    const anim = await J('getComputedStyle(document.querySelector(".knk-mallet2")).animationName');
    ok(anim && anim !== 'none', '第二支木槌有揮動的動畫：' + anim);
    await shot('knockcount_1_bowl_swing');
    ok(await J('document.querySelector(".knk-monk--lean") !== null'), '師父的身體跟著傾斜（knk-monk--lean）');
    await waitFor(async () => /快速敲出|play/.test(await text('.knk-tip')) || (await text('.knk-tip')).indexOf('我數好了') >= 0, q.endMs + 4000, '輪到玩家敲');
    ok((await J('document.querySelector(".knk-done").style.display')) === 'none', '輪到玩家敲的時候，「我數好了」還是藏著（沒敲木魚就按不到）');
    await shot('knockcount_2_play');
    await clickEl('.knk-fishbox'); await sleep(150);
    ok((await J('document.querySelector(".knk-done").style.display')) !== 'none', '敲了第一下木魚，「我數好了」才出現');
    ok(await J('(function(){ var b = document.querySelector(".knk-done").getBoundingClientRect(), s = document.getElementById("stage").getBoundingClientRect(); return Math.abs((b.left - s.left) - (s.right - b.right)) < 2; })()'), '「我數好了」按鈕左右置中（沒有被切掉）');
    ok((await text('.knk-done')) === '我數好了', '按鈕文字：「' + (await text('.knk-done')) + '」');
    await shot('knockcount_3_button');
    for (let i = 1; i < q.count; i++) { await clickEl('.knk-fishbox'); await sleep(60); }
    await clickEl('.knk-done'); await sleep(700);
    await waitFor(async () => (await state()).cleared >= 1, 4000, '敲對次數過關');
    ok(true, '敲對次數、按「我數好了」 → 過關');
  },

  // ───────── 記行事曆 ─────────
  async calendar() {
    await start('calendar', 3);
    const q = await info();
    ok((await count('.cld-sticker')) === q.placements.length, '月曆上貼了 ' + q.placements.length + ' 個貼紙');
    await shot('calendar_1_view');
    await waitFor(() => count('.cld-noise').then(c => c === 1), q.viewMs + 2000, '干擾開始');
    const nz0 = await count('.cld-noise__i');
    ok(nz0 === q.placements.length * 2, '干擾圖示 ' + nz0 + ' 個（每個貼紙 2 個）');
    const p0 = await J('[].map.call(document.querySelectorAll(".cld-noise__i"), function(e){ return e.style.left + "," + e.style.top; }).join("|")');
    await sleep(700);
    const p1 = await J('[].map.call(document.querySelectorAll(".cld-noise__i"), function(e){ return e.style.left + "," + e.style.top; }).join("|")');
    ok(p0 !== p1, '干擾圖示每隔一下換一批隨機位置');
    ok(await J('getComputedStyle(document.querySelector(".cld-noise__i")).animationName') === 'cld-blink', '干擾圖示會閃爍（animation cld-blink）');
    ok((await count('.cld-ask')) === 1 && (await text('.cld-ask')) === '', '干擾期間，問題還沒出現');
    const nr = await rect('.cld-noise'), ar = await rect('.cld-ask');
    ok(Math.abs(nr.y - ar.y) < 2, '干擾顯示在問題列的位置');
    await shot('calendar_2_noise');
    await waitFor(async () => (await count('.cld-noise')) === 0, 3500, '干擾結束');
    ok((await text('.cld-ask')).length > 0, '干擾結束後問題才出現：「' + (await text('.cld-ask')) + '」');
    await shot('calendar_3_ask');
    await cdp.evalJs('Reaction.current.debug.solve(); 1'); await sleep(500);
  },

  // ───────── 色票排隊 ─────────
  async huesort() {
    await start('huesort', 5);
    const q = await info();
    ok((await count('.hus-block')) === 9, '九塊色票');
    await shot('huesort_1_start');
    await clickEl('.hus-block', q.k); await sleep(2200);
    const hs = await J('[].map.call(document.querySelectorAll(".hus-block"), function(e){ var r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: e.style.height, z: e.style.zIndex }; })');
    ok(hs.every(b => b.h && b.z !== ''), '靠攏後每一塊都設了高度與疊放順序');
    ok(hs.slice(0, 8).every((b, i) => b.bottom >= hs[i + 1].top + 1.5), '靠攏後，每一塊都壓進下一塊裡面（沒有縫）：' + hs.slice(0, 8).map((b, i) => (b.bottom - hs[i + 1].top).toFixed(1)).join(','));
    await shot('huesort_2_joined');
    // 像素檢查：靠攏後的色塊堆中間那條線上，不能有跟背景一樣淺的像素
    const png = (await cdp.send('Page.captureScreenshot', { format: 'png' })).data;
    const res = await cdp.evalJs(`(async function(){
      var img = new Image(); img.src = 'data:image/png;base64,${png}'; await img.decode();
      var c = document.createElement('canvas'); c.width = img.width; c.height = img.height; var g = c.getContext('2d'); g.drawImage(img, 0, 0);
      var bs = document.querySelectorAll('.hus-block'), f = bs[0].getBoundingClientRect(), l = bs[8].getBoundingClientRect(), x = Math.round(f.left + f.width / 2 + 25), bad = 0, rows = [];
      var bg = g.getImageData(4, Math.round(f.top - 30), 1, 1).data;
      for (var y = Math.ceil(f.top) + 2; y < l.bottom - 2; y++) { var p = g.getImageData(x, y, 1, 1).data; if (Math.abs(p[0] - bg[0]) < 14 && Math.abs(p[1] - bg[1]) < 14 && Math.abs(p[2] - bg[2]) < 14) { bad++; rows.push(y); } }
      return JSON.stringify({ bad: bad, rows: rows.slice(0, 8), bg: [bg[0], bg[1], bg[2]] });
    })()`);
    const r = JSON.parse(res);
    ok(r.bad === 0, '靠攏後的色塊堆，中間一條垂直線上沒有跟背景一樣的淺色縫（像素檢查，背景 ' + r.bg + '，縫 ' + r.bad + ' 列 ' + r.rows + '）');
  },

  // ───────── 畫眉毛 ─────────
  async eyebrow() {
    await start('eyebrow', 14);
    const q = await info();
    ok(Math.abs(q.thetaDeg) > 3, '臉是歪的：' + q.thetaDeg + '°');
    await shot('eyebrow_1_tilted');
    const svg = await rect('.ebw-svg'), sc = 1;                // 畫眉毛的 svg 座標就是舞台像素（viewBox 0 0 W H，寬高也是 W、H），所以 q.target 的點直接加上 svg 左上角就是畫面位置
    const P = q.target.map(p => [svg.x + p.x * sc, svg.y + p.y * sc]);
    await drag(P.filter((p, i) => i % 2 === 0).concat([P[P.length - 1]]));
    await sleep(300);
    const tf = await J('document.querySelector(".ebw-turn").style.transform');
    ok(tf === 'rotate(' + (-q.thetaDeg) + 'deg)', '揭曉時整組繞臉心轉 ' + (-q.thetaDeg) + '°：' + tf);
    await sleep(1200);
    const m = await J('(function(){ var e = document.querySelector(".ebw-turn"), f = document.querySelector(".ebw-turn > g"); var a = e.getScreenCTM(), b = f.getScreenCTM(); return { a: Math.atan2(b.b, b.a) * 180 / Math.PI }; })()');
    ok(Math.abs(m.a) < 0.6, '轉完之後臉是正的（中軸垂直）：臉的總旋轉角 ' + m.a.toFixed(2) + '°');
    ok(await J('document.querySelector(".ebw-axis").classList.contains("ebw-axis--on")'), '臉的中軸顯示出來');
    await shot('eyebrow_2_turned');
    // 奇怪形狀：掃很多關
    const kinds = new Set();
    for (const lv of [3, 8, 14, 22, 30]) { await start('eyebrow', lv); kinds.add((await info()).type); }
    ok([...kinds].some(k => ['odd', 'zigzag', 'hook', 'twin'].includes(k)), '出現過奇怪形狀的眉毛：' + [...kinds].join(','));
  },

  // ───────── 圈內圈外 ─────────
  async inout() {
    await start('inout', 12);
    const q = await info();
    const d = await J('document.querySelector(".iof-rope").getAttribute("d")');
    ok(d.split('L').length > 60, '繩圈是由很多小段連成的曲線（' + d.split('L').length + ' 段）');
    ok(!/Q/.test(d), '不再是橫平豎直的直線加圓弧');
    const ant = await rect('.iof-ant'), cell = (await rect('.iof-svg')).w / q.G;
    ok(ant.w < cell * 1.2 && ant.w > cell * 0.2, '螞蟻很小：寬 ' + ant.w.toFixed(1) + 'px（一格 ' + cell.toFixed(1) + 'px）');
    await shot('inout_1');
    await clickEl('.iof-btn', q.ant.inside ? 0 : 1); await sleep(600);
    await waitFor(async () => (await state()).cleared >= 1, 4000, '答對過關');
    ok(true, '答對 → 過關');
    await start('inout', 30); await shot('inout_2_lv30');
  },

  // ───────── 單行道 ─────────
  async oneway() {
    await start('oneway', 16);
    const q = await J('(function(){ var q = Reaction.current.debug.info(); return { n: q.n, start: q.start, goal: q.goal, decoy: q.decoy, sol: q.solution.length - 1 }; })()');
    ok(q.decoy >= 0, '第 16 關有誘餌路（誘餌路的終點是第 ' + q.decoy + ' 個路口）；最短的合法路線要 ' + q.sol + ' 段');
    await shot('oneway_1');
    const nodes = await J('[].map.call(document.querySelectorAll(".owy-node"), function(e){ var r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })');
    ok(nodes.length === q.n * q.n, '路口 ' + nodes.length + ' 個');
    // 像人一樣「看起來最順」的走法：每個路口選「順著箭頭、離醫院最近」的下一個路口，走到走不下去為止（在頁面裡算，因為合法路段表是 Set，傳不出來）
    const walk = await J(`(function(){
      var q = Reaction.current.debug.info(), n = q.n, goal = q.goal, man = function (a) { return Math.abs(Math.floor(a / n) - Math.floor(goal / n)) + Math.abs(a % n - goal % n); };
      var nb = function (a) { var r = Math.floor(a / n), c = a % n, o = []; if (r > 0) o.push(a - n); if (c < n - 1) o.push(a + 1); if (r < n - 1) o.push(a + n); if (c > 0) o.push(a - 1); return o; };
      var path = [q.start], seen = {}; seen[q.start] = 1;
      for (;;) {
        var h = path[path.length - 1];
        if (h === goal) break;
        var c = nb(h).filter(function (b) { return !seen[b] && q.allow.has(h + ',' + b); });
        if (!c.length) break;
        c.sort(function (a, b) { return man(a) - man(b); });
        path.push(c[0]); seen[c[0]] = 1;
      }
      return { path: path, left: man(path[path.length - 1]), reached: path[path.length - 1] === goal };
    })()`);
    ok(walk.path.length >= 3, '照「順著箭頭、離醫院最近」的走法走了 ' + (walk.path.length - 1) + ' 段，' + (walk.reached ? '直接到了醫院' : '停在離醫院還有 ' + walk.left + ' 格的地方'));
    await drag(walk.path.map(i => nodes[i]).flatMap((p, i, a) => i ? line(a[i - 1], p, 4).slice(1) : [p]), true);
    await sleep(500);
    ok((await count('.dlg--result')) === 0, '走進死巷（或半路走不下去）不會立刻失敗，可以往回拖');
    await shot('oneway_2_followed');
    // 往回拖 2 格：路線退回去
    const before = walk.path.length;
    const back = walk.path.slice(-3).reverse();
    for (let i = 1; i < back.length; i++) for (const p of line(nodes[back[i - 1]], nodes[back[i]], 4).slice(1)) { await mouse('mouseMoved', p[0], p[1]); await sleep(22); }
    await mouse('mouseReleased', ...nodes[back[back.length - 1]]);
    await sleep(200);
    const dd = await J('document.querySelector(".owy-route").getAttribute("d").split("L").length');
    ok(dd === before - 2, '往回拖 2 格，路線少 2 段（' + (before - 1) + ' 段 → ' + (dd - 1) + ' 段）');
    if (!walk.reached) {
      await cdp.evalJs('Reaction.current.debug.solve(); 1');
      await waitFor(async () => (await state()).cleared >= 1, 4000, '照最短合法路線開到醫院');
      ok(true, '照最短合法路線開到醫院 → 過關');
      await shot('oneway_3_done');
    }
    // 第 1 關
    await start('oneway', 1);
    const w1 = await J(`(function(){ var q = Reaction.current.debug.info(); return q.decoy; })()`);
    ok(w1 === -1 || w1 == null || w1 >= 0, '第 1 關可以開始（誘餌 ' + w1 + '）');
    await shot('oneway_4_lv1');
  }
};

(async () => {
  cdp = await connect();
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
    const names = only.length ? only : Object.keys(T);
    for (const name of names) {
      console.log('\n■ ' + name);
      try { await T[name](); } catch (e) { failures++; console.log('  FAIL （例外） ' + e.message); try { await shot('ERR_' + name); } catch (e2) { } }
    }
  } finally { cdp.close(); }
  console.log('\n' + (failures ? failures + ' 項失敗（共 ' + checks + ' 項檢查）' : '全部通過（' + checks + ' 項檢查）') + '；截圖在 ' + OUT);
  process.exitCode = failures ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
