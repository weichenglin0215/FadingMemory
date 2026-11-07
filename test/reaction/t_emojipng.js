// emoji 圖片庫（js/emoji_png.js＋img/emoji/emoji.png，V1.47）：「分類點擊」「草叢找動物」不再用字型 emoji（iPhone 上很寫實、大小也不一樣），改貼 PNG
//   · 清單：不重複、遊戲用到的每一個 emoji 都在裡面（少一個，遊戲就會退回文字 emoji，iPhone 上又變寫實）
//   · key：去掉變體選擇符 U+FE0F，所以 🐿 與 🐿️ 是同一個
//   · 圖集 PNG：檔案存在、尺寸對得上清單（欄數 × 格子邊長）、是「帶透明度」的 PNG（RGBA）、左上角像素是透明的（背景透明才能襯在不同底色上）
//   · 接線：boot.js 有載入、兩款遊戲都用 Reaction.emojiPng、結算說明裡沒有 emoji 字元
const { game } = require('./load.js');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const ROOT = path.resolve(__dirname, '../../');
const EP = Reaction.emojiPng;
const es = game('reaction_emojisort.js').test, fp = game('reaction_forestpeek.js').test;
const VS16 = String.fromCharCode(0xFE0F);

ok(EP && typeof EP.el === 'function' && typeof EP.draw === 'function' && typeof EP.load === 'function', 'Reaction.emojiPng 有 el／draw／load');
ok(EP.LIST.length >= 150 && new Set(EP.LIST).size === EP.LIST.length, '清單不重複（' + EP.LIST.length + ' 個）');
ok(EP.LIST.every(k => k.indexOf(VS16) < 0), '清單的 key 都已經去掉變體選擇符');
ok(EP.key('🐿' + VS16) === '🐿' && EP.has('🐿') && EP.has('🐿' + VS16) && EP.index('🐿') === EP.index('🐿' + VS16), '有沒有變體選擇符都找得到同一格');
ok(!EP.has('❓') && EP.index('❓') === -1, '清單裡沒有的 emoji：index＝−1、has＝false（遊戲會退回文字 emoji）');
// 遊戲用到的 emoji 全部都在圖集裡
es.CATS.forEach(c => { ok(EP.has(c.rep), c.name + ' 的代表圖示 ' + c.rep + ' 在圖集裡'); c.list.forEach(ch => ok(EP.has(ch), c.name + '：' + ch + ' 在圖集裡')); });
fp.ANIMALS.forEach(ch => ok(EP.has(ch), '草叢找動物：' + ch + ' 在圖集裡'));
// 圖集 PNG
const png = fs.readFileSync(path.join(ROOT, 'img/emoji/emoji.png'));
ok(png.slice(0, 8).toString('hex') === '89504e470d0a1a0a', '是 PNG 檔');
const W = png.readUInt32BE(16), H = png.readUInt32BE(20), depth = png[24], ctype = png[25];
const rows = Math.ceil(EP.LIST.length / EP.COLS);
ok(W === EP.COLS * EP.CELL && H === rows * EP.CELL, '圖集尺寸 ' + W + '×' + H + ' ＝ ' + EP.COLS + ' 欄 × ' + rows + ' 排 × ' + EP.CELL + 'px');
ok(depth === 8 && ctype === 6, '8 位元 RGBA（帶透明度）：depth ' + depth + '、colorType ' + ctype);
{
  // 把 IDAT 接起來解壓縮，看第一個像素（第 0 排第 0 個）：第一排沒有「上一排」，第一個像素沒有「左邊」，所以不管濾鏡是哪一種，原始位元組就是像素值
  let off = 8; const idat = [];
  while (off < png.length) { const len = png.readUInt32BE(off), type = png.slice(off + 4, off + 8).toString('latin1'); if (type === 'IDAT') idat.push(png.slice(off + 8, off + 8 + len)); off += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  ok(raw.length === H * (1 + W * 4), '解壓縮後大小正確');
  ok(raw[4] === 0, '左上角像素是透明的（alpha ＝ 0，背景透明）：alpha ' + raw[4]);
  // 每一格的中心附近至少有一點不透明：圖集裡每個 emoji 都有畫出東西（用每格中央那一排找，濾鏡需要還原，這裡用簡化：整排解 Sub／None／Up／Average／Paeth）
  const stride = 1 + W * 4, img = Buffer.alloc(H * W * 4);
  for (let y = 0; y < H; y++) {
    const f = raw[y * stride]; for (let x = 0; x < W * 4; x++) {
      const a = x >= 4 ? img[y * W * 4 + x - 4] : 0, b = y ? img[(y - 1) * W * 4 + x] : 0, c = (x >= 4 && y) ? img[(y - 1) * W * 4 + x - 4] : 0, v = raw[y * stride + 1 + x];
      let p = 0; if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1; else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      img[y * W * 4 + x] = (v + p) & 255;
    }
  }
  let empty = 0;
  EP.LIST.forEach((k, i) => { const x0 = (i % EP.COLS) * EP.CELL, y0 = Math.floor(i / EP.COLS) * EP.CELL; let n = 0; for (let y = 8; y < EP.CELL - 8; y += 2) for (let x = 8; x < EP.CELL - 8; x += 2) if (img[((y0 + y) * W + x0 + x) * 4 + 3] > 40) n++; if (n < 150) { empty++; ok(false, k + '：圖集裡這一格幾乎是空的（' + n + '）'); } });
  ok(empty === 0, '每個 emoji 在圖集裡都有畫出東西');
  // 背景確實透明：整張圖有很多完全透明的像素（不是被塗成白底）
  let clear = 0; for (let i = 3; i < img.length; i += 4 * 97) if (img[i] === 0) clear++;
  ok(clear > (img.length / 4 / 97) * 0.3, '圖集有大片透明區域（' + (clear * 100 / (img.length / 4 / 97)).toFixed(0) + '%）');
}
// 接線
const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8'), boot = rd('js/boot.js');
ok(boot.indexOf("'js/emoji_png.js'") > 0 && boot.indexOf("'js/emoji_png.js'") < boot.indexOf("'js/reaction_emojisort.js'") && boot.indexOf("'js/emoji_png.js'") < boot.indexOf("'js/reaction_forestpeek.js'"), 'boot.js 在兩款遊戲之前載入 emoji_png.js');
const srcE = rd('js/reaction_emojisort.js'), srcF = rd('js/reaction_forestpeek.js');
ok(/Reaction\.emojiPng/.test(srcE) && /EP\.el\(/.test(srcE) && /EP\.load\(/.test(srcE), '分類點擊：用 Reaction.emojiPng 貼圖、載好才開始');
ok(!/text: c\.ch/.test(srcE), '分類點擊：格子不再用文字 emoji');
ok(/Reaction\.emojiPng/.test(srcF) && /EP\.draw\(/.test(srcF) && /EP\.load\(/.test(srcF), '草叢找動物：用 Reaction.emojiPng 貼圖、載好才開始');
// 結算說明不放 emoji 字元（只放分類名稱）：模擬一次失敗
{
  const q = es.makeLevel(12, () => 0.5), t = es.namesOf(q.correct) + es.namesOf(q.wrong);
  ok(!/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(t), 'namesOf 只有名稱、沒有 emoji：' + t);
  ok(es.promptOf(q.correct).length > es.namesOf(q.correct).length, 'promptOf 仍然帶代表圖示（給主控台看）');
}
// 圖集在 sw.js 的離線清單裡
ok(/'img\/emoji\/emoji\.png'/.test(rd('sw.js')) && /'js\/emoji_png\.js'/.test(rd('sw.js')), '離線快取清單（sw.js）有圖集與 emoji_png.js');

console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
process.exitCode = bad ? 1 : 0;
