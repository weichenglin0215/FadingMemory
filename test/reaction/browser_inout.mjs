// 圈內圈外（inout，V1.57.0 指紋螺旋）的瀏覽器端驗證：用真的滑鼠事件點「裡面／外面」。
//   ① 繩圈是一整條封閉的指紋螺旋（一個 <path>），畫得進方形的畫面；螞蟻就在畫面正中央（跟 svg 的中心重合）
//   ② 第 1、10、30 關都能畫；越後面線越細越密（線的粗細跟著紋路的疏密走）
//   ③ 點對：過關進下一關、揭曉時「裡面」塗上淡綠色；點錯：失敗、標出正確答案
//   ④ 全程沒有 JS 錯誤
// 前置：本機伺服器已開（例如在專案根目錄執行  python -m http.server 8900 --bind 127.0.0.1）。
// 用法（在專案根目錄）：  FM_PORT=8900 node test/reaction/browser_inout.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
let cdp, bad = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.log('FAIL', m); } };
const J = async (expr) => { const v = await cdp.evalJs('JSON.stringify((function(){ return ' + expr + '; })())'); return v == null ? null : JSON.parse(v); };
const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mouseReleased' || type === 'mouseMoved' ? 0 : 1, clickCount: 1 });
async function click(x, y) { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await sleep(40); await mouse('mouseReleased', x, y); await sleep(60); }
const btn = (i) => J('(function(){ var r = document.querySelectorAll(".inout-btn")[' + i + '].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()');
const geo = () => J(`(function(){ var s = document.querySelector('.inout-svg').getBoundingClientRect(), st = document.querySelector('.rx-stage').getBoundingClientRect(), a = document.querySelector('.inout-ant').getBoundingClientRect(), p = document.querySelector('.inout-rope'), bb = p.getBBox(), d = p.getAttribute('d'), sw = parseFloat(getComputedStyle(p).strokeWidth);
  return { sx: s.left + s.width / 2, sy: s.top + s.height / 2, sw: s.width, sh: s.height, inStage: s.left >= st.left - 1 && s.right <= st.right + 1 && s.top >= st.top - 1 && s.bottom <= st.bottom + 1,
    ax: a.left + a.width / 2, ay: a.top + a.height / 2, aw: a.width, pts: (d.match(/[ML]/g) || []).length, closed: /Z$/.test(d), subpaths: (d.match(/M/g) || []).length, bbW: bb.width, bbH: bb.height, stroke: sw, svgW: Number(document.querySelector('.inout-svg').getAttribute('width')) }; })()`);

(async () => {
  cdp = await connect();
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
    for (let i = 0; i < 4; i++) {                                // 本機 python 伺服器偶爾漏回 css／js：樣式沒載入就重開
      await openGame(cdp, 'inout', { port: Number(process.env.FM_PORT) || 8900, root: ROOT });
      for (let k = 0; k < 40 && !(await J('!!document.querySelector(".inout-svg")')); k++) await sleep(100);
      if (await J('!!document.querySelector(".inout-svg") && getComputedStyle(document.querySelector(".inout-svg")).position === "absolute" && getComputedStyle(document.documentElement).getPropertyValue("--c-ink").trim() !== ""')) break;
      console.log('（頁面沒載好，重開）'); await sleep(1000);
    }
    await J('(window.__errs = [], window.addEventListener("error", function (e) { window.__errs.push(e.message); }), 1)');
    const strokes = {};
    for (const lv of [1, 10, 30]) {
      await J('(Reaction.current.debug.goto(' + lv + '), 1)'); await sleep(250);
      const g = await geo(), q = await J('(function(){ var z = Reaction.current.debug.api().info; return { K: z.K, inside: z.ant.inside, revs: z.revs, minRay: z.minRay, meanRay: z.meanRay, needRay: z.needRay, viewR: z.viewR, dnear: z.dnear, extent: z.extent }; })()');
      strokes[lv] = g.stroke;
      ok(g.pts > 100 && g.closed && g.subpaths === 1, '① 第 ' + lv + ' 關：繩圈是一整條封閉的曲線（' + g.pts + ' 個點、' + g.subpaths + ' 條路徑）');
      ok(g.inStage && g.sw >= 400, '① 第 ' + lv + ' 關：方形畫面放得進遊戲區（' + Math.round(g.sw) + '×' + Math.round(g.sh) + '）');
      ok(Math.hypot(g.ax - g.sx, g.ay - g.sy) < 2, '① 第 ' + lv + ' 關：螞蟻在畫面正中央（離 svg 中心 ' + Math.hypot(g.ax - g.sx, g.ay - g.sy).toFixed(2) + ' px）');
      ok(g.bbW > g.svgW * 0.55 && q.viewR <= q.extent + 1e-9 && q.dnear + 3 <= q.viewR + 1e-9 + (q.viewR >= q.extent - 1e-9 ? 99 : 0), '② 第 ' + lv + ' 關：指紋夠大（寬 ' + Math.round(g.bbW) + '／畫面 ' + g.svgW + '）；畫面半邊長 ' + q.viewR.toFixed(1) + ' 圈距、最近的外面在 ' + q.dnear.toFixed(1) + '＋3 之內＝看得到（遠的一邊可以被裁掉）');
      ok(q.K >= 6 && q.minRay >= q.needRay, '② 第 ' + lv + ' 關：' + q.K + ' 圈、往任何方向至少穿過 ' + q.minRay + ' 條線（要求 ' + q.needRay + '、平均 ' + q.meanRay.toFixed(1) + '）、迴轉 ' + q.revs + ' 次');
      ok(g.aw > 3 && g.aw < 80, '② 第 ' + lv + ' 關：螞蟻大小 ' + g.aw.toFixed(1) + ' px');
    }
    ok(strokes[30] < strokes[1] && strokes[30] >= 1.3 && strokes[1] <= 5, '② 線的粗細跟著疏密走：第 1 關 ' + strokes[1].toFixed(2) + ' px → 第 30 關 ' + strokes[30].toFixed(2) + ' px');
    // ③ 點對 → 過關、塗綠；點錯 → 失敗
    await J('(Reaction.current.debug.goto(10), 1)'); await sleep(250);
    let q = await J('Reaction.current.debug.api().info'), b = await btn(q.ant.inside ? 0 : 1); await click(b.x, b.y); await sleep(200);
    ok(await J('document.querySelector(".inout-fill").classList.contains("inout-fill--show") && getComputedStyle(document.querySelector(".inout-fill")).fill !== "none"'), '③ 點對：揭曉，「裡面」塗上淡綠色');
    ok(await J('document.querySelectorAll(".inout-btn--ok").length === 1 && /答對了/.test(document.querySelector(".inout-info").textContent)'), '③ 點對：正確答案標綠、寫「答對了」');
    await sleep(1700);
    ok((await J('Reaction.current.debug.state().level')) === 11 && (await J('Reaction.current.debug.state().cleared')) >= 1, '③ 1.5 秒後進第 11 關');
    q = await J('Reaction.current.debug.api().info'); b = await btn(q.ant.inside ? 1 : 0); await click(b.x, b.y); await sleep(200);
    ok(await J('Reaction.current.debug.state().over') && await J('document.querySelectorAll(".inout-btn--bad").length === 1 && document.querySelectorAll(".inout-btn--ok").length === 1'), '③ 點錯：失敗，標出正確答案與選錯的');
    ok((await J('window.__errs.length')) === 0, '④ 沒有 JS 錯誤 ' + JSON.stringify(await J('window.__errs')));
  } finally { cdp.close(); }
  console.log(checks + ' checks');
  console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); try { cdp && cdp.close(); } catch (x) { } process.exit(1); });
