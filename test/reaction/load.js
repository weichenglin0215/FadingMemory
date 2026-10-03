// Node 測試用載入器：把遊戲檔案當純 <script> 載入（UI／Sfx／Stage 用假物件頂替），拿到 Reaction.register 登記的遊戲物件，
// 測試只呼叫各遊戲的 G.test（純函式：出題、判定、難度曲線…），不需要瀏覽器。
const path = require('path');
const ROOT = path.resolve(__dirname, '../../') + '/';      // 專案根目錄
global.window = global;
global.UI = { h: () => ({}), store: { get: (k, f) => f, set() { } }, wait: ms => new Promise(r => setTimeout(r, ms)) };
global.Sfx = { play() { }, bgm() { }, stopBgm() { }, unlock() { } };
global.Stage = { toLogical: (x, y) => ({ x, y }) };
global.crypto = require('crypto').webcrypto;
require(ROOT + 'js/reaction_core.js');
require(ROOT + 'js/reaction_kit.js');
exports.game = function (file) {
  const before = Reaction.list().length;
  require(ROOT + 'js/' + file);
  return Reaction.list()[before];
};
