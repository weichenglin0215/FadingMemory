// 用「看不見視窗」的 Chrome 驗證「下次進場從個人最佳關卡 − 4 開始」（V1.34.0；ENTRY_BACK ＝ 4，最佳第 30 關 → 第 26 關）。
//   做法：先在頁面的 localStorage 替每一款遊戲寫入「到過第 12 關」，再逐款打開遊戲、按完說明與排行榜彈窗，
//   讀取遊戲自己回報的關卡（G.debug.state().level，沒有就讀畫面上「第 N 關」的字）。闖關遊戲應該都從第 8 關開始；
//   不是闖關的（單回合、累計分數）應該不受影響（顯示第 1 關或沒有關卡）。
// 前置：專案用本機伺服器開起來（python -m http.server 8743）。用法（專案根目錄）：node test/reaction/browser_entry.mjs [id…]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const PORT = 8743;
const want = process.argv.slice(2);

(async () => {
  const cdp = await connect();
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: 'http://localhost:' + PORT + '/reaction.html?game=speed&t=' + Date.now() });
    for (let i = 0; i < 100; i++) { if (await cdp.evalJs('document.readyState === "complete" && !!window.Reaction').catch(() => false)) break; await sleep(100); }
    // 遊戲檔案是一個一個動態載入的：readyState 完成時清單可能還沒登記完，所以等「款數連續 5 次不變」再讀清單
    for (let i = 0, prev = -1, same = 0; i < 200 && same < 5; i++) { const n = Number(await cdp.evalJs('window.Reaction ? Reaction.list().length : 0').catch(() => 0)); same = (n === prev && n > 0) ? same + 1 : 0; prev = n; await sleep(100); }
    const ids = want.length ? want : JSON.parse(await cdp.evalJs('JSON.stringify(Reaction.list().map(function (g) { return g.id; }))'));
    const rows = [];
    for (const id of ids) {
      // 每款遊戲都先寫入「到過第 12 關」（localStorage 同一個網站共用，不用每次重寫，但每次進場前清掉不相干的最佳成績，避免干擾）
      await cdp.send('Page.navigate', { url: 'http://localhost:' + PORT + '/reaction.html?game=' + id + '&t=' + Date.now() });
      for (let i = 0; i < 100; i++) { if (await cdp.evalJs('document.readyState === "complete" && !!window.Reaction && !!Reaction.current').catch(() => false)) break; await sleep(100); }
      await cdp.evalJs('localStorage.clear(); localStorage.setItem("fm.reaction.lvbest.' + id + '", "12"); 1');
      const errs = [];
      await openGame(cdp, id, { port: PORT, root: ROOT });
      await sleep(600);
      const info = JSON.parse(await cdp.evalJs(`JSON.stringify((function () {
        var g = Reaction.current, lv = null, st = null;
        try { st = g.debug && g.debug.state && g.debug.state(); lv = st && st.level != null ? st.level : null; } catch (e) { }
        var head = document.querySelector('.rx-head__lv'), t = head ? head.textContent : '';
        var meta = document.getElementById('bar-meta') ? document.getElementById('bar-meta').textContent : '';
        var toast = document.querySelector('.dlg-toast') ? document.querySelector('.dlg-toast').textContent : '';
        var m = /第\\s*(\\d+)\\s*(關|題)/.exec(t + ' ' + meta);
        return { lv: lv, head: t, meta: meta, toast: toast, shown: m ? Number(m[1]) : null, stored: localStorage.getItem('fm.reaction.lvbest.' + g.id) };
      })())`));
      rows.push({ id, ...info });
      const level = info.lv != null ? info.lv : info.shown;
      console.log(id.padEnd(12) + ' 關卡 ' + String(level).padEnd(5) + ' 畫面「' + (info.head || info.meta) + '」' + (info.toast ? ' 提示「' + info.toast + '」' : ''));
    }
    const lv8 = rows.filter(r => (r.lv != null ? r.lv : r.shown) === 8).length;
    console.log('\n從第 8 關開始的遊戲 ' + lv8 + ' 款；其他 ' + (rows.length - lv8) + ' 款');
  } finally { cdp.close(); }
})().catch(e => { console.error(e); process.exit(1); });
