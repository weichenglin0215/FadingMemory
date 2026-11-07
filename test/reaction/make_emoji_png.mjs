// 幫「分類點擊」「草叢找動物」用到的 emoji 拍成一張 PNG 圖集：img/emoji/emoji.png（V1.47）。
//
// 為什麼要有這個：emoji 是「字型」畫出來的，每個平台長得不一樣——iPhone 的 emoji 比較寫實、失去卡通圖示的風格，
// 而且在 canvas 裡畫出來的大小跟電腦差很多（草叢找動物在 iPhone 上動物只剩一半大）。
// 所以改成在「電腦的瀏覽器」把 emoji 畫下來存成 PNG（背景保持透明，才能襯在不同的底色上），遊戲直接貼圖，每個平台看到的都一樣。
//
// 做法：自己啟動一個「看不見視窗」的 Edge／Chrome（headless），用 Chrome DevTools Protocol 遙控它（不用安裝任何 npm 套件，見 cdp.mjs），
//       在一張透明的 canvas 上，把每個 emoji 用「Segoe UI Emoji」（Windows 內建的卡通風格 emoji 字型）畫在一格 CELL×CELL 的格子裡，
//       存成 PNG（canvas.toDataURL 預設就是透明背景），再把「有哪些 emoji、排在第幾格」寫進 js/emoji_png.js 的自動產生區塊。
//
// 哪些 emoji：把「分類點擊」的五種分類（reaction_emojisort.js 的 CATS，含題目用的代表圖示）＋「草叢找動物」的動物（reaction_forestpeek.js 的 ANIMALS）全部收進來，
//       用「去掉變體選擇符 U+FE0F 之後的字串」當 key（所以 🐿 與 🐿️ 算同一個）。新增 emoji 之後重跑一次這支程式就好。
//
// 用法（在專案根目錄；不需要本機伺服器）：
//   node test/reaction/make_emoji_png.mjs              只檢查：畫一遍、印出檢查報告（缺字、單色、被切到的），不寫檔
//   node test/reaction/make_emoji_png.mjs --write      檢查通過就寫入 img/emoji/emoji.png 與 js/emoji_png.js
//
// 檢查項目：① 每個 emoji 都有畫出東西（不是空白）；② 不是「缺字方塊」（跟一個不存在的字元畫出來的長得一樣就是缺字）；
//          ③ 有顏色（卡通 emoji 都是彩色的；黑白的熊貓、斑馬、企鵝用「黑白灰的比例」另外放寬）；④ 沒有被格子切到（邊緣留白至少 1px）。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const require = createRequire(import.meta.url);
const { game } = require('./load.js');
const WRITE = process.argv.includes('--write');

// ─── 圖集規格（要跟 js/emoji_png.js 的常數一致；這裡寫進去的就是那邊的值）───
const CELL = 128;       // 圖集每一格的邊長（px）
const COLS = 16;        // 圖集一排幾格
const FONT = 100;       // 畫的時候用的字級（px）：emoji 在一格 CELL 裡佔約 FONT × 1.17 寬，周圍留白

const VS16 = String.fromCharCode(0xFE0F);                   // 變體選擇符（寫成程式算出來的，免得檔案裡出現看不見的字元）
const strip = ch => ch.split(VS16).join('');            // key：去掉變體選擇符
// ─── 收集要拍的 emoji（順序固定：分類點擊的分類 → 代表圖示 → 草叢找動物）───
const list = [];
const add = ch => { const k = strip(ch); if (!list.includes(k)) list.push(k); };
const es = game('reaction_emojisort.js').test, fp = game('reaction_forestpeek.js').test;
es.CATS.forEach(c => c.list.forEach(add));
es.CATS.forEach(c => add(c.rep));
fp.ANIMALS.forEach(add);
console.log('要拍的 emoji：' + list.length + ' 個（分類點擊 ' + es.CATS.reduce((a, c) => a + c.list.length, 0) + ' ＋ 代表圖示、草叢找動物補上其餘）');

// ─── 在瀏覽器裡畫圖＋檢查（這段字串會被送進頁面執行）───
const PAGE_JS = `(async function (list, CELL, COLS, FONT) {
  var rows = Math.ceil(list.length / COLS);
  var cv = document.createElement('canvas'); cv.width = COLS * CELL; cv.height = rows * CELL;
  var ctx = cv.getContext('2d', { willReadFrequently: true });
  var FAM = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  // 單一碼位的字（不含 ZWJ 連接符）補上 U+FE0F，強迫用彩色圖案而不是黑白的文字符號；多碼位（例如 🐕‍🦺）照原樣
  function text(ch) { return Array.from(ch).length === 1 ? ch + String.fromCharCode(0xFE0F) : ch; }
  function draw(dy) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = FONT + 'px ' + FAM;
    list.forEach(function (ch, i) { ctx.fillText(text(ch), (i % COLS) * CELL + CELL / 2, Math.floor(i / COLS) * CELL + CELL / 2 + dy); });
  }
  function bbox(i) {
    var x0 = (i % COLS) * CELL, y0 = Math.floor(i / COLS) * CELL, d = ctx.getImageData(x0, y0, CELL, CELL).data;
    var l = CELL, r = -1, t = CELL, b = -1, n = 0, col = 0;
    for (var y = 0; y < CELL; y++) for (var x = 0; x < CELL; x++) {
      var k = (y * CELL + x) * 4, a = d[k + 3];
      if (a > 16) { n++; if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; if (Math.max(d[k], d[k + 1], d[k + 2]) - Math.min(d[k], d[k + 1], d[k + 2]) > 28) col++; }
    }
    return { l: l, r: r, t: t, b: b, n: n, col: col };
  }
  // 第一遍：量全部 emoji 的垂直中心，算出要往上或往下移多少，才會整體置中（只用一個整體的位移，不是每個各自置中——這樣每個 emoji 的基準線才一致）
  draw(0);
  var sum = 0, cnt = 0;
  for (var i = 0; i < list.length; i++) { var b0 = bbox(i); if (b0.n) { sum += (b0.t + b0.b) / 2 - CELL / 2; cnt++; } }
  var dy = cnt ? -Math.round(sum / cnt) : 0;
  draw(dy);
  // 缺字方塊：拿一個不存在的字元（私人使用區）畫一遍，當作「缺字」的樣子
  var tofu = (function () { var c2 = document.createElement('canvas'); c2.width = CELL; c2.height = CELL; var x2 = c2.getContext('2d', { willReadFrequently: true }); x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.font = FONT + 'px ' + FAM; x2.fillText(String.fromCodePoint(0x10FFFD), CELL / 2, CELL / 2 + dy); return x2.getImageData(0, 0, CELL, CELL).data; })();
  var rep = [];
  for (var j = 0; j < list.length; j++) {
    var bb = bbox(j), x0 = (j % COLS) * CELL, y0 = Math.floor(j / COLS) * CELL, d = ctx.getImageData(x0, y0, CELL, CELL).data, same = true;
    for (var q = 0; q < d.length; q++) if (d[q] !== tofu[q]) { same = false; break; }
    rep.push({ ch: list[j], n: bb.n, colorRatio: bb.n ? bb.col / bb.n : 0, l: bb.l, r: bb.r, t: bb.t, b: bb.b, tofu: same });
  }
  return { dy: dy, rows: rows, png: cv.toDataURL('image/png'), rep: rep };
})(${JSON.stringify(list)}, ${CELL}, ${COLS}, ${FONT})`;

const cdp = await connect();
let res;
try {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: 'about:blank' });
  res = await cdp.evalJs(PAGE_JS);
} finally { cdp.close(); }

// ─── 檢查報告 ───
let problems = 0;
const warn = (m) => { problems++; console.log('  ✗ ' + m); };
const info = [];
res.rep.forEach(r => {
  const nm = r.ch + '（' + Array.from(r.ch).map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase()).join(' ') + '）';
  if (r.n < 200) warn(nm + '：幾乎是空白（' + r.n + ' 個像素）——字型可能沒有這個 emoji');
  else if (r.tofu) warn(nm + '：是「缺字方塊」——字型沒有這個 emoji');
  else if (r.l < 1 || r.t < 1 || r.r > CELL - 2 || r.b > CELL - 2) warn(nm + '：被格子切到（邊界 ' + r.l + ',' + r.t + ' → ' + r.r + ',' + r.b + '）');
  else if (r.colorRatio < 0.12) info.push(nm + ' 彩色比例只有 ' + (r.colorRatio * 100).toFixed(0) + '%（黑白灰為主；熊貓、斑馬、企鵝這類正常，其他請看一下圖）');
});
console.log('垂直置中位移 dy = ' + res.dy + 'px；圖集 ' + COLS * CELL + '×' + res.rows * CELL + ' px');
const widths = res.rep.map(r => r.r - r.l + 1), heights = res.rep.map(r => r.b - r.t + 1);
console.log('每個 emoji 實際畫出的寬度 ' + Math.min(...widths) + '～' + Math.max(...widths) + ' px、高度 ' + Math.min(...heights) + '～' + Math.max(...heights) + ' px（格子 ' + CELL + '）');
info.forEach(m => console.log('  · ' + m));
console.log(problems ? '有 ' + problems + ' 個問題，請先處理（把有問題的 emoji 從遊戲的清單換掉）' : '檢查通過');

if (WRITE) {
  if (problems) { console.log('有問題，不寫檔'); process.exit(1); }
  const png = Buffer.from(res.png.replace(/^data:image\/png;base64,/, ''), 'base64');
  const dir = path.join(ROOT, 'img/emoji');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'emoji.png'), png);
  console.log('寫入 img/emoji/emoji.png（' + (png.length / 1024).toFixed(0) + ' KB）');
  // 把清單寫進 js/emoji_png.js 的自動產生區塊（BEGIN／END 兩行標記之間）
  const jsPath = path.join(ROOT, 'js/emoji_png.js');
  let src = fs.readFileSync(jsPath, 'utf8');
  const crlf = src.includes('\r\n'); src = src.replace(/\r\n/g, '\n');
  const BEGIN = '/* EMOJI-LIST-BEGIN', END = '/* EMOJI-LIST-END */';
  const a = src.indexOf(BEGIN), b = src.indexOf(END);
  if (a < 0 || b < 0) throw new Error('js/emoji_png.js 找不到 EMOJI-LIST-BEGIN／END 標記');
  const aEnd = src.indexOf('\n', a) + 1;
  const lines = [];
  for (let i = 0; i < list.length; i += 12) lines.push('        ' + list.slice(i, i + 12).map(s => "'" + s + "'").join(', '));
  const block = "    EP.CELL = " + CELL + ";\n    EP.COLS = " + COLS + ";\n    EP.FONT = " + FONT + ";\n    EP.LIST = [\n" + lines.join(',\n') + "\n    ];\n    ";
  src = src.slice(0, aEnd) + block + src.slice(b);
  fs.writeFileSync(jsPath, crlf ? src.replace(/\n/g, '\r\n') : src, 'utf8');
  console.log('寫入 js/emoji_png.js 的清單（' + list.length + ' 個）');
}
