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
require(ROOT + 'js/leaderboard.js');       // 遊戲的結算流程會呼叫 Leaderboard.fake4／fmtNum／submit（測試只呼叫純函式，但要找得到它）
exports.game = function (file) {
  const before = Reaction.list().length;
  require(ROOT + 'js/' + file);
  return Reaction.list()[before];
};

// 可重現的亂數產生器（mulberry32）：同一個 seed 永遠產生同一串「看起來隨機」的數字。
//   為什麼需要：出題函式（plan、makeLevel、makeTray、makeQuestion…）預設用 Math.random，
//   測試如果拿隨機出的題目去統計（例如「150 題裡有幾題有陷阱」），門檻再寬鬆，每跑幾十次還是會有一次運氣不好而失敗；
//   這類測試改傳 rng(seed) 當亂數來源，每次跑的題目都一模一樣，結果就固定了——要換一組題目只要換 seed。
//   用法：const { game, rng } = require('./load.js');  const rnd = rng(SEED);  T.plan(level, rnd);
//   出題函式的最後一個參數就是亂數函式（rand），不傳才會用 Math.random（遊戲真正在玩的時候就是這樣）。
//   seed 預設固定，也可以用環境變數換：在 Windows PowerShell 打  $env:SEED = 123; node test/reaction/t_coins.js
//   （想檢查「換任何 seed 都不會失敗」，就用不同的 SEED 連續跑很多次）。
exports.rng = function (seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
// 取得這次測試要用的 seed：環境變數 SEED 有給就用它，否則用 fallback（每支測試自己選一個固定的數字）。
exports.seedOf = function (fallback) {
  const raw = process.env.SEED;
  return raw !== undefined && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : fallback;
};
