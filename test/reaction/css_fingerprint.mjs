// 樣式指紋：把每款遊戲「剛開始」的畫面，每個元素的計算後樣式（getComputedStyle）和位置大小，全部壓成指紋，存成檔案。
//   用途：改 CSS 檔案的組織方式（拆檔、class 改名）之前先拍一份、之後再拍一份，兩份比對——
//         指紋一樣＝畫面上每個元素的每個樣式都沒變（class 名稱不納入指紋，所以改名不影響）。
//   做法：①Math.random 換成固定種子的亂數（每次出一樣的題目）；②關掉動畫與轉場（不然動到一半的值每次不同）；
//         ③走到「遊戲開始」那一刻，依 DOM 順序走訪全部元素，每個元素算一個雜湊。
//   注意：遊戲是「走到開始」的畫面，之後才出現的元素（結算、答錯後的畫面）不在指紋裡；那些由規則層級的比對負責（見 css_split.cjs 的檢查）。
// 前置：本機伺服器已開（例如在專案根目錄執行  python -m http.server 8743）。
// 用法（在專案根目錄）：
//   node test/reaction/css_fingerprint.mjs save 輸出檔.json [id…]     拍一份（不給 id＝全部遊戲）
//   node test/reaction/css_fingerprint.mjs diff 甲.json 乙.json        比對兩份，列出有差異的遊戲
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, openGame, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const [cmd, ...args] = process.argv.slice(2);

function allIds() {
  return fs.readdirSync(path.join(ROOT, 'js'))
    .filter(f => /^reaction_.+\.js$/.test(f) && !/^reaction_(core|kit\d*)\.js$/.test(f))
    .map(f => f.replace(/^reaction_|\.js$/g, '')).sort();
}

// 在頁面裡執行的函式：回傳 [每個元素的「標籤|雜湊」…]
const FP_SRC = `(function () {
  var style = document.createElement('style');
  style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
  document.head.appendChild(style);
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  var out = [];
  var all = document.body.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    if (/^(SCRIPT|STYLE|LINK|META)$/.test(e.tagName)) continue;
    var cs = getComputedStyle(e), parts = [];
    for (var k = 0; k < cs.length; k++) { var p = cs[k]; parts.push(p + ':' + cs.getPropertyValue(p)); }
    var r = e.getBoundingClientRect();
    parts.push('rect:' + Math.round(r.left * 10) + ',' + Math.round(r.top * 10) + ',' + Math.round(r.width * 10) + ',' + Math.round(r.height * 10));
    parts.sort();      /* 自訂屬性（--xxx）在 getComputedStyle 裡的順序每次不同，排序後指紋才穩定 */
    out.push(e.tagName + '|' + hash(parts.join(';')));
    var bs = ['::before', '::after'];
    for (var b = 0; b < 2; b++) {
      var ps = getComputedStyle(e, bs[b]);
      if (ps.content && ps.content !== 'none' && ps.content !== 'normal') {
        var q = [];
        for (var m = 0; m < ps.length; m++) q.push(ps[m] + ':' + ps.getPropertyValue(ps[m]));
        q.sort();
        out.push(e.tagName + bs[b] + '|' + hash(q.join(';')));
      }
    }
  }
  return out;
})()`;

const SEED_SRC = `(function () {
  var a = 20261101;
  Math.random = function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
})();`;

if (cmd === 'save') {
  const out = args[0];
  const ids = args.length > 1 ? args.slice(1) : allIds();
  const res = {};
  (async () => {
    const cdp = await connect();
    try {
      await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 850, deviceScaleFactor: 1, mobile: false });
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: SEED_SRC });
      for (const id of ids) {
        try {
          await openGame(cdp, id, { root: ROOT });
          await sleep(500);
          const fp = JSON.parse(await cdp.evalJs('JSON.stringify(' + FP_SRC + ')'));
          res[id] = fp;
          process.stdout.write(id + ':' + fp.length + ' ');
        } catch (e) { res[id] = ['ERROR ' + e.message]; process.stdout.write('\n' + id + ' 失敗：' + e.message + '\n'); }
      }
      fs.writeFileSync(out, JSON.stringify(res));
      console.log('\n已存 ' + Object.keys(res).length + ' 款 → ' + out);
    } finally { cdp.close(); }
  })().catch(e => { console.error(e); process.exit(1); });
} else if (cmd === 'diff') {
  const A = JSON.parse(fs.readFileSync(args[0], 'utf8')), B = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  let bad = 0;
  Object.keys(A).forEach(id => {
    const a = A[id], b = B[id];
    if (!b) { bad++; console.log('只在甲：' + id); return; }
    if (a.length === 1 && /^ERROR/.test(a[0])) { console.log('（甲就失敗，略過）' + id + ' ' + a[0]); return; }
    let first = -1, n = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { n++; if (first < 0) first = i; }
    if (a.length !== b.length || n) { bad++; console.log('DIFF ' + id.padEnd(14) + '元素 ' + a.length + ' → ' + b.length + '，不同的有 ' + n + ' 個，第一個在第 ' + first + ' 個（' + (a[first] || '無') + ' → ' + (b[first] || '無') + '）'); }
  });
  Object.keys(B).forEach(id => { if (!A[id]) console.log('只在乙：' + id); });
  console.log(bad ? '\n' + bad + ' 款有差異' : '\n全部相同（' + Object.keys(A).length + ' 款）');
  process.exitCode = bad ? 1 : 0;
} else { console.log('用法：save 輸出檔.json [id…]｜diff 甲.json 乙.json'); }
