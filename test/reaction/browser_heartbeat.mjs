// 心跳複製（heartbeat，V1.57.0 改版）的瀏覽器端驗證：用真的滑鼠事件，而且故意點在「圓形以外」的地方（整個畫面都可以點）。
//   ① 8 個白色圓排成一圈，整圈寬度是遊戲區的 90%；每一拍依序（順時針）亮一個圓：藍色（有手指圖示）或橘色
//   ② 藍色亮的時候點畫面上任何位置（圓以外也行）：那個圓變綠色、「點對」次數 +1；橘色亮的時候點：那個圓變紅色、機會 −1
//   ③ 藍色一直沒點：那個圓閃紅色、機會 −1（漏掉）
//   ④ 機會用完：出結算，成績＝點對次數
//   ⑤ 畫面上寫著「可點擊畫面任何位置」；全程沒有 JS 錯誤
// 前置：本機伺服器已開（例如在專案根目錄執行  python -m http.server 8900 --bind 127.0.0.1）。
// 用法（在專案根目錄）：  FM_PORT=8900 node test/reaction/browser_heartbeat.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
let cdp, bad = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.log('FAIL', m); } };
const J = async (expr) => { const v = await cdp.evalJs('JSON.stringify((function(){ return ' + expr + '; })())'); return v == null ? null : JSON.parse(v); };
const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' || type === 'mouseMoved' ? 0 : 1, clickCount: 1 });
const st = () => J('Reaction.current.debug.state()');
/* 等到這一拍符合條件（cond 是在頁面裡跑的 JS，用 s 代表 state）；回傳那一刻的 state（逾時回傳 null） */
async function waitBeat(cond, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 15000)) {
    const s = await st();
    if (s.cur && eval('(function(s){ return ' + cond + '; })')(s)) return s;
    if (s.cur && s.cur.blue && !s.cur.tapped) await tapAway();                     // 等的時候遇到不是我們要的藍色就先點掉（不然漏掉會扣機會）
    await sleep(15);
  }
  return null;
}
/* 點在圓形以外的地方：遊戲區左上角（離圓圈很遠）；點之前先確認那裡真的沒有圓 */
async function tapAway() {
  const p = await J('(function(){ var f = document.querySelector(".heartbeat-field").getBoundingClientRect(); return { x: f.left + 24, y: f.top + 24 }; })()');
  await mouse('mouseMoved', p.x, p.y); await mouse('mousePressed', p.x, p.y); await sleep(30); await mouse('mouseReleased', p.x, p.y);
  return p;
}

(async () => {
  cdp = await connect();
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
    for (let i = 0; i < 4; i++) {                                // 本機 python 伺服器偶爾漏回 css／js：樣式沒載入就重開
      await openGame(cdp, 'heartbeat', { port: Number(process.env.FM_PORT) || 8900, root: ROOT });
      for (let k = 0; k < 40 && !(await J('!!document.querySelector(".heartbeat-field")')); k++) await sleep(100);
      if (await J('!!document.querySelector(".heartbeat-field") && getComputedStyle(document.querySelector(".heartbeat-field")).position === "relative"' + ' && getComputedStyle(document.documentElement).getPropertyValue("--c-ink").trim() !== ""')) break;
      console.log('（頁面沒載好，重開）'); await sleep(1000);
    }
    await J('(window.__errs = [], window.addEventListener("error", function (e) { window.__errs.push(e.message); }), 1)');
    // ① 版面
    const lay = await J(`(function(){ var f = document.querySelector('.heartbeat-field').getBoundingClientRect(), cs = [].slice.call(document.querySelectorAll('.heartbeat-disc')).map(function (c) { var r = c.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 }; }); return { fl: f.left, fw: f.width, ft: f.top, fh: f.height, cs: cs, scr: getComputedStyle(document.querySelector('.screen')).touchAction, white: getComputedStyle(document.querySelector('.heartbeat-disc')).fill }; })()`);
    ok(lay.cs.length === 8, '① 8 個圓');
    const minL = Math.min(...lay.cs.map(c => c.l)), maxR = Math.max(...lay.cs.map(c => c.r));
    ok(Math.abs((maxR - minL) / lay.fw - 0.9) < 0.02, '① 整圈的寬度是遊戲區寬度的 ' + ((maxR - minL) / lay.fw * 100).toFixed(1) + '%（90%）');
    ok(lay.cs.every(c => c.l >= lay.fl && c.r <= lay.fl + lay.fw && c.t >= lay.ft && c.b <= lay.ft + lay.fh), '① 8 個圓都在遊戲區裡');
    ok(lay.cs[0].cy < lay.cs[2].cy && lay.cs[2].cx > lay.cs[0].cx && lay.cs[4].cy > lay.cs[2].cy && lay.cs[6].cx < lay.cs[4].cx, '① 排列：第 0 個在上、2 在右、4 在下、6 在左（順時針）');
    ok(lay.white === 'rgb(255, 255, 255)', '① 圓是白色（' + lay.white + '）');
    ok(lay.scr === 'none', '⑤ 整個畫面關掉瀏覽器的觸控手勢');
    ok(/可點擊畫面任何位置/.test(await J('document.querySelector(".heartbeat-tip").textContent')), '⑤ 畫面上寫著「可點擊畫面任何位置」');
    // ② 依序亮圓、藍色有手指圖示
    const seen = [];
    let s = await waitBeat('true', 6000);
    ok(s != null, '② 開局後第一拍出現');
    for (let k = 0; k < 5; k++) {                                // 看 5 拍：每一拍亮的圓是順時針的下一個；亮起的顏色 class 對（藍／橘）
      const cur = await waitBeat('s.cur.n > ' + (seen.length ? seen[seen.length - 1].n : 0), 4000);
      if (!cur) break;
      const cls = await J('Reaction.current.debug.circleClass(' + cur.cur.idx + ')'), fingerShown = await J('getComputedStyle(document.querySelectorAll(".heartbeat-finger")[' + cur.cur.idx + ']).display');
      seen.push({ n: cur.cur.n, idx: cur.cur.idx, blue: cur.cur.blue });
      ok(cls.indexOf(cur.cur.blue ? 'heartbeat-c--blue' : 'heartbeat-c--orange') >= 0, '② 第 ' + cur.cur.n + ' 拍：第 ' + cur.cur.idx + ' 個圓亮' + (cur.cur.blue ? '藍色' : '橘色') + '（' + cls + '）');
      ok((fingerShown === 'block') === cur.cur.blue, '② 第 ' + cur.cur.n + ' 拍：' + (cur.cur.blue ? '藍色的圓有手指圖示' : '橘色的圓沒有手指'));
      ok(cur.cur.idx === (cur.cur.n - 1) % 8, '② 第 ' + cur.cur.n + ' 拍亮第 ' + cur.cur.idx + ' 個（順時針繞圈）');
      if (cur.cur.blue) await tapAway();                         // 藍色就點（不然漏掉會扣機會）
      await sleep(30);
    }
    // ③ 藍色亮的時候，點圓以外的地方 → 綠色、點對 +1
    const before = await st();
    const sb = await waitBeat('s.cur.blue && !s.cur.tapped && s.cur.n > ' + before.beatNo, 12000);
    ok(sb != null, '③ 等到一個藍色的圓');
    if (sb) {
      const p = await tapAway(); await sleep(60);
      const after = await st(), cls = await J('Reaction.current.debug.circleClass(' + sb.cur.idx + ')');
      ok(after.cleared === before.cleared + 1 && cls.indexOf('heartbeat-c--ok') >= 0, '③ 點在圓以外（' + Math.round(p.x) + ',' + Math.round(p.y) + '）：點對 ' + before.cleared + ' → ' + after.cleared + '，圓變綠色（' + cls + '）');
      await tapAway(); await sleep(60);
      ok((await st()).cleared === after.cleared && (await st()).lives === after.lives, '③ 同一拍再點一下：不重複計分、不扣機會');
    }
    // ② 橘色亮的時候點 → 紅色、機會 −1
    const b2 = await st();
    const so = await waitBeat('!s.cur.blue && !s.cur.bad && s.cur.n > ' + b2.beatNo, 20000);
    ok(so != null, '② 等到一個橘色的圓');
    if (so) {
      const l0 = (await st()).lives;
      await tapAway(); await sleep(60);
      const a = await st(), cls = await J('Reaction.current.debug.circleClass(' + so.cur.idx + ')');
      ok(a.lives === l0 - 1 && cls.indexOf('heartbeat-c--bad') >= 0, '② 橘色亮的時候點：機會 ' + l0 + ' → ' + a.lives + '，圓變紅色（' + cls + '）');
    }
    // ③ 漏掉：藍色一直不點 → 下一拍扣機會
    const b3 = await st();
    const sm = await waitBeat('s.cur.blue && !s.cur.tapped && s.cur.n > ' + b3.beatNo, 20000);
    if (sm && b3.lives > 1) {
      const l1 = (await st()).lives;
      for (let w = 0; w < 200 && (await st()).beatNo === sm.beatNo; w++) await sleep(20);
      await sleep(120);
      const a = await st();
      ok(a.lives === l1 - 1, '③ 藍色的圓一直沒點：這一拍結束時機會 ' + l1 + ' → ' + a.lives + '（漏掉也算失誤）');
    }
    // ④ 機會用完 → 結算；成績＝點對次數
    for (let w = 0; w < 400 && (await st()).state !== 'over'; w++) { const cs = await st(); if (cs.cur && !cs.cur.blue && !cs.cur.bad) await tapAway(); await sleep(30); }
    ok((await st()).state === 'over', '④ 機會用完：遊戲結束');
    await sleep(1300);
    ok(await J('/點對|次/.test(document.body.innerText)'), '④ 出結算畫面');
    ok((await J('window.__errs.length')) === 0, '⑤ 沒有 JS 錯誤 ' + JSON.stringify(await J('window.__errs')));
  } finally { cdp.close(); }
  console.log(checks + ' checks');
  console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); try { cdp && cdp.close(); } catch (x) { } process.exit(1); });
