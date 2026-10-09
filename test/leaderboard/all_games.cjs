// 載入「秒反應」頁面實際會載入的全部遊戲，回傳遊戲物件陣列（順序＝頁面載入順序）。
//   · 遊戲檔案清單直接讀 js/boot.js 的 reaction 清單——那是「哪些遊戲真的會出現在頁面上」的唯一來源，
//     新增遊戲只要照規矩加進 boot.js，這裡、資料庫產生器、測試就自動涵蓋，不用另外維護第二份名單。
//   · 用 test/reaction/load.js 的假 UI／假 Sfx 載入，所以只能拿到遊戲物件（id、name、score、mount…），不能真的跑畫面。
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../') + '/';
const { game } = require('../reaction/load.js');

// 有些遊戲檔案在「載入的當下」就會碰 document（例如配色遊戲載入時設定一個 CSS 變數）。
// 這裡只想拿到遊戲物件，所以放一個「什麼都接得住」的假 document：讀任何屬性、呼叫任何方法都不會出錯、也不做任何事。
// 載入完就拿掉（loadAllGames 裡），不留在全域，免得後面的測試以為自己在瀏覽器裡。
const quiet = () => new Proxy(function () { }, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => '' : quiet()),
  apply: () => quiet(),
  set: () => true,
});

// 從 boot.js 抓出 reaction 頁面要載入的 js/reaction_*.js（排除共用的 core／kit／kit2，它們不是遊戲）
function gameFiles() {
  const boot = fs.readFileSync(ROOT + 'js/boot.js', 'utf8');
  const block = boot.match(/reaction:\s*\{[\s\S]*?js:\s*BASE_JS\.concat\(\[([\s\S]*?)\]\)/);
  if (!block) throw new Error('boot.js 找不到 reaction 的 js 清單');
  return [...block[1].matchAll(/'js\/(reaction_[a-z0-9_]+\.js)'/g)]
    .map(m => m[1])
    .filter(f => f !== 'reaction_core.js' && f !== 'reaction_kit.js' && f !== 'reaction_kit2.js');
}

function loadAllGames() {
  const fakeDoc = typeof global.document === 'undefined';
  if (fakeDoc) global.document = quiet();
  try {
    return gameFiles().map(f => { const g = game(f); g.file = f; return g; });
  } finally {
    if (fakeDoc) delete global.document;
  }
}

module.exports = { loadAllGames, gameFiles, ROOT };
