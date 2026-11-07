// 產生 sw.js 裡的「預先快取清單」PRECACHE（離線要用到的所有檔案）。
//   node test/pwa/gen_sw.cjs            檢查 sw.js 裡的清單跟專案現況一不一樣（不一樣就印出差異、回傳錯誤碼 1）
//   node test/pwa/gen_sw.cjs --write    重新產生並寫回 sw.js（新增／刪除／改名檔案之後要跑一次）
//
// 清單怎麼來的：
//   · 四個頁面（menu／reaction／quiz／world）各自需要的 CSS／JS：直接「執行」js/boot.js、把它想載入的檔案記下來
//     （所以 boot.js 的 PAGES 清單一改，這裡自動跟著變，不會有兩份清單對不上）；
//   · 四個 HTML 頁、manifest、version.json、boot.js 本身、vendor/ 的程式庫、App 圖示、不可能任務的圖、全部遊戲縮圖（img/reaction/*.png）、emoji 圖集（img/emoji/*.png，V1.47：分類點擊、草叢找動物貼圖用）。
//   不放：admin/、test/、note/、supabase/、screen_adaptive.*、README（開發用）；icons/og.png（只有貼連結預覽用，玩遊戲用不到）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../../') + '/';
const SW = ROOT + 'sw.js';
const BEGIN = '/* PRECACHE-BEGIN';
const END = '/* PRECACHE-END */';
const PAGES = ['menu', 'reaction', 'quiz', 'world'];

// 在假的瀏覽器環境裡執行 boot.js，回傳它對這一頁「想載入」的本機檔案（去掉 ?v=…）
async function bootFiles(page) {
  const out = [];
  const win = {
    FM_PAGE: page,
    location: { protocol: 'http:' },
    addEventListener() { },
    document: null
  };
  const el = () => ({});
  win.document = {
    readyState: 'complete', hidden: false, body: null,
    documentElement: { classList: { add() { } } },
    createElement: el,
    addEventListener() { },
    head: {
      appendChild(e) {
        out.push(e.href || e.src);
        Promise.resolve().then(() => { if (e.onload) e.onload(); });   // 假裝每個檔案都載入成功
      }
    }
  };
  win.window = win;
  const ctx = vm.createContext(win);        // 沒有 fetch／localStorage：boot.js 會用 'local-時間戳' 當版本號，照樣往下載
  vm.runInContext(fs.readFileSync(ROOT + 'js/boot.js', 'utf8'), ctx);
  for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 15));
  return out.filter(u => u && !/^https?:\/\//.test(u)).map(u => u.replace(/\?.*$/, ''));
}

function listDir(dir, re) {
  return fs.readdirSync(ROOT + dir).filter(f => re.test(f)).map(f => dir + '/' + f);
}

async function build() {
  const set = new Set([
    'index.html', 'quiz.html', 'reaction.html', 'world.html',
    'manifest.webmanifest', 'version.json', 'js/boot.js',
    'vendor/three.min.js', 'vendor/qrcode.min.js',
    'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
    'images/Impossible.png'
  ]);
  for (const p of PAGES) (await bootFiles(p)).forEach(f => set.add(f));
  listDir('img/reaction', /\.png$/i).forEach(f => set.add(f));
  listDir('img/emoji', /\.png$/i).forEach(f => set.add(f));          // emoji 圖集（V1.47）：沒有它，離線時這兩款遊戲的圖就出不來
  return Array.from(set).sort();
}

function render(list, nl) {
  return 'var PRECACHE = [' + nl + list.map(f => "    '" + f + "'").join(',' + nl) + nl + '];';
}

// 取出 sw.js 目前的清單（標記之間的那段），回傳 { before, block, after, nl }
function split(src) {
  const nl = src.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const b = src.indexOf(BEGIN), e = src.indexOf(END);
  if (b < 0 || e < 0 || e < b) throw new Error('sw.js 裡找不到 PRECACHE-BEGIN／PRECACHE-END 標記');
  const bEnd = src.indexOf('\n', b) + 1;                     // 標記那一行的下一行開始
  const eStart = src.lastIndexOf('\n', e) + 1;               // 結束標記那一行的開頭
  return { before: src.slice(0, bEnd), block: src.slice(bEnd, eStart), after: src.slice(eStart), nl };
}

function current(src) {
  const sp = split(src);
  return Array.from(sp.block.matchAll(/'([^']+)'/g)).map(m => m[1]);
}

module.exports = { build, render, split, current, ROOT };

if (require.main === module) {
  (async () => {
    const list = await build();
    const src = fs.readFileSync(SW, 'utf8');
    const have = current(src);
    const add = list.filter(f => !have.includes(f)), del = have.filter(f => !list.includes(f));
    if (process.argv.includes('--write')) {
      const sp = split(src);
      fs.writeFileSync(SW, sp.before + render(list, sp.nl) + sp.nl + sp.after);
      console.log('已寫入 sw.js：' + list.length + ' 個檔案（新增 ' + add.length + '、移除 ' + del.length + '）');
      return;
    }
    if (add.length || del.length) {
      console.log('sw.js 的清單跟專案不同步：缺 ' + add.length + ' 個、多 ' + del.length + ' 個');
      add.slice(0, 20).forEach(f => console.log('  缺 ' + f));
      del.slice(0, 20).forEach(f => console.log('  多 ' + f));
      console.log('請執行：node test/pwa/gen_sw.cjs --write');
      process.exit(1);
    }
    console.log('sw.js 的清單與專案同步（' + list.length + ' 個檔案）');
  })().catch(e => { console.error(e); process.exit(1); });
}
