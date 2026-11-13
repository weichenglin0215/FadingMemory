// 半邊字（V1.57.0 旋轉遮片）的瀏覽器端驗證：
//   ① 開局有畫布、遮片在轉（隔一段時間畫面不一樣）、選項、時間條
//   ② 六種遮片（比薩／條紋／黑白格／波紋／螺旋／emoji 方陣）各畫一次（白色與彩色），畫布有畫出東西、不會丟錯誤
//   ③ 答對：拿掉遮片、整個字亮出來（畫布跟遮住時不一樣）、框變綠、有解說
//   ④ 全程沒有 JS 錯誤
// 前置：本機伺服器已開（例如在專案根目錄執行  python -m http.server 8900 --bind 127.0.0.1）。
// 用法（在專案根目錄）：  FM_PORT=8900 node test/reaction/browser_halfchar.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
let cdp, bad = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.log('FAIL', m); } };
const J = async (expr) => { const v = await cdp.evalJs('JSON.stringify((function(){ return ' + expr + '; })())'); return v == null ? null : JSON.parse(v); };
const hash = () => J('(function(){ var c = document.querySelector(".halfchar-canvas"); if (!c) return null; var d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, s = 0; for (var i = 0; i < d.length; i += 97) s = (s * 31 + d[i]) | 0; return s; })()');
const inkPixels = () => J('(function(){ var c = document.querySelector(".halfchar-canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, n = 0; for (var i = 0; i < d.length; i += 4) if (d[i] < 60 && d[i + 1] < 60 && d[i + 2] < 60) n++; return n; })()');

(async () => {
  cdp = await connect();
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
    for (let i = 0; i < 4; i++) {                                // 本機 python 伺服器偶爾漏回 css／js：確認樣式有載入，沒有就重開
      await openGame(cdp, 'halfchar', { port: Number(process.env.FM_PORT) || 8900, root: ROOT });
      for (let k = 0; k < 60 && !(await J('!!document.querySelector(".halfchar-canvas")')); k++) await sleep(100);
      if (await J('!!document.querySelector(".halfchar-canvas") && getComputedStyle(document.querySelector(".halfchar-box")).display === "flex"' + ' && getComputedStyle(document.documentElement).getPropertyValue("--c-ink").trim() !== ""')) break;
      console.log('（頁面沒載好，重開）'); await sleep(1000);
    }
    await J('(window.__errs = [], window.addEventListener("error", function (e) { window.__errs.push(e.message); }), 1)');
    for (let k = 0; k < 50 && (await J('Reaction.current.debug.state().state')) !== 'ask'; k++) await sleep(100);
    ok((await J('Reaction.current.debug.state().state')) === 'ask', '① 出第一題了');
    const cv = await J('(function(){ var c = document.querySelector(".halfchar-canvas"), r = c.getBoundingClientRect(), b = document.querySelector(".halfchar-box").getBoundingClientRect(); return { w: c.width, h: c.height, cw: r.width, ch: r.height, inBox: r.left >= b.left && r.right <= b.right && r.top >= b.top && r.bottom <= b.bottom }; })()');
    ok(cv.w >= 200 && cv.w === cv.h && cv.cw === cv.ch && cv.inBox, '① 畫布是正方形（' + cv.cw + '×' + cv.ch + '）、放得進字框');
    ok((await J('document.querySelectorAll(".halfchar-opt").length')) === 6, '① 有 6 個選項');
    ok((await J('!!document.querySelector(".rx-timebar, .ld-time")')), '① 有時間條');
    // V1.57.0：題目字盡量放大（畫面寬度的 90%）、版面都放得進畫面
    const big = await J('(function(){ var st = Reaction.current.debug.state(), b = document.querySelector(".halfchar-box").getBoundingClientRect(), s = document.querySelector(".rx-stage, .screen").getBoundingClientRect(), o = document.querySelector(".halfchar-opts").getBoundingClientRect(), t = document.querySelector(".halfchar-tip").getBoundingClientRect(), hd = document.querySelector(".halfchar-head").getBoundingClientRect(), scr = document.querySelector(".screen").getBoundingClientRect(); return { U: st.U, side: st.side, boxW: b.width, boxH: b.height, optsB: o.bottom, tipB: t.bottom, scrB: scr.bottom, headH: hd.height, W: Number(window.Stage && 0) || 472, hasPrompt: !!document.querySelector(".halfchar-prompt") }; })()');
    ok(big.U >= Math.floor(0.9 * big.boxW) - 1 || big.U === big.side, '① 題目字的大小 ' + big.U + ' px ＝ 畫面寬 ' + Math.round(big.boxW) + ' 的 ' + (big.U / big.boxW * 100).toFixed(0) + '%（目標 90%，放不下才縮）');
    ok(big.U >= 0.85 * big.boxW, '① 題目字至少是畫面寬度的 85%（' + (big.U / big.boxW * 100).toFixed(0) + '%）：畫布 ' + big.side + ' px、字框高 ' + Math.round(big.boxH) + ' px');
    ok(big.optsB <= big.scrB + 1 && big.tipB <= big.scrB + 1, '① 選項與解說都放得進畫面（選項底 ' + Math.round(big.optsB) + '、解說底 ' + Math.round(big.tipB) + '／畫面底 ' + Math.round(big.scrB) + '）');
    ok(!big.hasPrompt && big.headH < 60, '① 標題（兼題目提示）只有一行（高 ' + Math.round(big.headH) + ' px），沒有單獨一行的題目提示');
    // 遮片在轉：把轉速固定成很快、隔一下畫面不一樣（用 setMask 指定一個條紋遮片）
    const spec = 'var T = Reaction.list().find(function (g) { return g.id === "halfchar"; }).test; var m = T.makeMask(40); m.shape = "stripes"; m.colorful = false; m.open = 0.3; m.pitch = 0.12; m.speed = 90; m.dir = 1; m.theta0 = 0.2; Reaction.current.debug.setMask(m); 1';
    await J('(function(){ ' + spec + '; })()');
    const h1 = await hash(); await sleep(350); const h2 = await hash();
    ok(h1 != null && h1 !== h2, '① 遮片在轉：隔 0.35 秒畫面不一樣');
    ok((await inkPixels()) > 200, '① 透過遮片的空隙看得到黑色的字（' + (await inkPixels()) + ' 個黑色點）');
    // ② 六種遮片各畫一次
    for (const shape of ['pizza', 'stripes', 'checker', 'wave', 'spiral', 'emoji']) for (const colorful of [false, true]) {
      if (shape === 'emoji' && colorful) continue;
      await J('(function(){ var T = Reaction.list().find(function (g) { return g.id === "halfchar"; }).test, m = T.makeMask(40); m.shape = ' + JSON.stringify(shape) + '; m.colorful = ' + colorful + '; m.open = 0.3; m.speed = 0; m.theta0 = 0.4; if (' + JSON.stringify(shape) + ' === "emoji") { m.n = 4; m.cat = "fruits"; m.cells = []; for (var i = 0; i < 16; i++) m.cells.push(T.EMOJI_CATS.fruits[i]); } else { m.pitch = (T.PITCH[m.shape] || [0.12])[0] + 0.02; } if (m.shape === "wave") { m.amp = m.pitch * 0.8; m.lambda = 0.4; m.phase = 0.5; } if (m.shape === "pizza") m.cuts = 5; Reaction.current.debug.setMask(m); return 1; })()');
      await sleep(120);
      const ink = await inkPixels(), tag = shape + (colorful ? '（彩色）' : '');
      ok(ink > 30, '② ' + tag + '：透過空隙看得到字（黑色點 ' + ink + '）');
      const colors = await J('(function(){ var c = document.querySelector(".halfchar-canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, set = {}; for (var i = 0; i < d.length; i += 4 * 211) set[(d[i] >> 5) + "," + (d[i + 1] >> 5) + "," + (d[i + 2] >> 5)] = 1; return Object.keys(set).length; })()');
      if (colorful || shape === 'emoji') ok(colors >= 8, '② ' + tag + '：很多種顏色（' + colors + '）'); else ok(colors <= 30, '② ' + tag + '：白色遮片＋灰底＋黑字，顏色很少（' + colors + '）');
    }
    // ③ 答對：拿掉遮片、整個字亮出來
    await J('(function(){ var T = Reaction.list().find(function (g) { return g.id === "halfchar"; }).test, m = T.makeMask(40); m.shape = "stripes"; m.colorful = false; m.open = 0.15; m.pitch = 0.12; m.speed = 0; m.theta0 = 0; Reaction.current.debug.setMask(m); return 1; })()');
    await sleep(100);
    const inkMasked = await inkPixels(), hMasked = await hash();
    await J('Reaction.current.debug.answerRight()'); await sleep(150);
    const inkFull = await inkPixels(), hFull = await hash();
    ok(inkFull > inkMasked * 2 && hFull !== hMasked, '③ 答對：拿掉遮片後黑色的字多很多（' + inkMasked + ' → ' + inkFull + '）');
    ok(await J('document.querySelector(".halfchar-box").classList.contains("halfchar-box--ok")'), '③ 框變綠');
    ok(await J('/大家都有/.test(document.querySelector(".halfchar-tip").textContent)'), '③ 有解說：' + (await J('document.querySelector(".halfchar-tip").textContent')));
    await sleep(1600);                                           // 下一題
    ok((await J('Reaction.current.debug.state().q')) === 2 && (await J('Reaction.current.debug.state().state')) === 'ask', '③ 1.3 秒後出第 2 題');
    // 答錯：字也亮出來、結算
    await J('Reaction.current.debug.answerWrong()'); await sleep(150);
    ok(await J('document.querySelector(".halfchar-box").classList.contains("halfchar-box--bad")'), '③ 答錯：框變橘');
    ok((await J('window.__errs.length')) === 0, '④ 沒有 JS 錯誤 ' + JSON.stringify(await J('window.__errs')));
  } finally { cdp.close(); }
  console.log(checks + ' checks');
  console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); try { cdp && cdp.close(); } catch (x) { } process.exit(1); });
