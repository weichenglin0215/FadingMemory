// 用「看不見視窗」的 Chrome／Edge 跑瀏覽器端的驗證（不用手動開瀏覽器、貼指令）。
//   · new  ：browser_new28.js 的功能驗證——每款遊戲放進隱形 iframe，用各遊戲的 G.debug（solve＝答對、wrong＝答錯）一路玩到結算卡片，
//            檢查有沒有 JS 錯誤、有沒有結算、送榜的成績是不是有限數字。'mixed'＝先答對 3 關再答錯（關卡很多的遊戲用）。
//   · hints：browser_hints.js 的操作提示驗證——提示的模式、短文字、位置、碰一下會消失。
// 前置：先把專案用本機伺服器開起來（例如在專案根目錄執行  python -m http.server 8743）。
// 用法（在專案根目錄）：
//   node test/reaction/run_browser.mjs new23                       V1.22.0 的 23 款，各玩「答對 3 關再答錯」
//   node test/reaction/run_browser.mjs new23 solve|wrong|both      改成一直答對（要小心不會結束）／一開始就答錯／兩種都跑
//   node test/reaction/run_browser.mjs new copycurve isequal       指定幾款（mixed）
//   node test/reaction/run_browser.mjs hints                       全部有操作提示的遊戲（browser_hints.js 的 LIST）
//   node test/reaction/run_browser.mjs hints copycurve isequal     指定幾款
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const PORT = 8743;
const [kind, ...rest] = process.argv.slice(2);
if (!/^(new|new23|hints)$/.test(kind || '')) { console.log('用法：node test/reaction/run_browser.mjs new23|new <id…>|hints [<id…>]'); process.exit(1); }
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

(async () => {
  const cdp = await connect();
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: 'http://localhost:' + PORT + '/reaction.html?game=speed&runner=' + Date.now() });
    for (let i = 0; i < 100; i++) { if (await cdp.evalJs('document.readyState === "complete" && !!window.Reaction').catch(() => false)) break; await sleep(100); }
    if (kind === 'hints') {
      await cdp.evalJs('(0, eval)(' + JSON.stringify(read('test/reaction/browser_hints.js')) + ')');
      const ids = rest.length ? JSON.stringify(rest) : 'null';
      await cdp.evalJs('window.__job = __hintsAll(' + ids + '); 1');
      let rows = [];
      for (let i = 0; i < 600; i++) {
        rows = JSON.parse(await cdp.evalJs('JSON.stringify(window.__hrows)'));
        if (rows.length && rows[rows.length - 1].done) break;
        await sleep(1000);
      }
      let bad = 0;
      rows.filter(r => !r.done).forEach(r => {
        if (!r.ok) bad++;
        console.log((r.ok ? 'OK   ' : 'FAIL ') + r.id.padEnd(12) + ' 模式 ' + String(r.found) + '（要 ' + String(r.want) + '）' + (r.label ? '「' + r.label + '」' : '') + (r.errors.length ? ' 錯誤：' + r.errors.join(';') : '') + (r.ok ? '' : ' inside=' + r.inside + ' labelInside=' + r.labelInside + ' goneAfterTap=' + r.goneAfterTap));
      });
      console.log(bad ? '\n' + bad + ' 款提示檢查失敗' : '\n全部 ' + rows.filter(r => !r.done).length + ' 款提示檢查通過');
      process.exitCode = bad ? 1 : 0;
    } else {
      await cdp.evalJs('(0, eval)(' + JSON.stringify(read('test/reaction/browser_new28.js')) + ')');
      let mode = 'mixed', ids = rest;
      if (kind === 'new23') { ids = await cdp.evalJs('window.__NEW23'); if (/^(solve|wrong|both)$/.test(rest[0] || '')) mode = rest[0]; }
      const fn = mode === 'both' ? '__new28Both' : '__new28All';
      await cdp.evalJs('window.__job = ' + fn + '(' + JSON.stringify(ids) + (mode === 'both' ? '' : ', ' + JSON.stringify(mode)) + '); 1');
      let rows = [], shown = 0;
      for (let i = 0; i < 3000; i++) {
        rows = JSON.parse(await cdp.evalJs('JSON.stringify(window.__rows)'));
        while (shown < rows.length) { const r = rows[shown++]; if (!r.done) console.log((r.ok ? 'OK   ' : 'FAIL ') + r.id.padEnd(12) + (r.mode ? r.mode.padEnd(6) : '') + ' 成績 ' + String(r.sub).slice(0, 10).padEnd(10) + ' ' + (r.ms / 1000).toFixed(1) + 's  ' + (r.result || '').slice(0, 60) + (r.errs && r.errs.length ? ' 錯誤：' + r.errs.join(';') : '')); }
        const done = mode === 'both' ? rows.length && rows[rows.length - 1].done : rows.length >= ids.length;
        if (done) break;
        await sleep(1000);
      }
      const real = rows.filter(r => !r.done), bad = real.filter(r => !r.ok).length;
      console.log(bad ? '\n' + bad + ' 款失敗' : '\n全部 ' + real.length + ' 筆通過');
      process.exitCode = bad ? 1 : 0;
    }
  } finally { cdp.close(); }
})().catch(e => { console.error(e); process.exit(1); });
