// 主選單的遊戲清單（js/menu.js 的 GAME_CELLS／GAME_TABS，V1.23.0）：
//   · 108 款、id 不重複、名稱最多 5 個字（格子下方的名稱列只放得下 5 個字）、縮圖檔存在且高 256 像素
//   · 每一款都有分類（七個分類加起來剛好是全部，不重疊、沒有空的分類）、頁籤是「全部、最近＋七個分類」共 9 個、名稱都是 2 個字
//   · 清單裡的 id 與名稱跟各遊戲檔案 Reaction.register 登記的完全一致（改名忘了改一邊，這裡會失敗）
//   · 「最近」頁籤：最新的在最前面、去掉不存在與重複的、最多 12 款、沒有紀錄時用「上次玩的」當第一筆
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../') + '/';
const { loadAllGames } = require('../leaderboard/all_games.cjs');

let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };

const games = loadAllGames();                      // 會把 UI／Sfx 換成假物件
// menu.js 是 IIFE，載入時只會呼叫 UI.h（取得函式）與 UI.ready（排進等待）；用假的 UI 載入，再從 window.FMMenu 拿資料
const mem = new Map();
global.UI = {
  h: () => ({}), ready() { }, icon: () => '', art: () => '',
  store: { get: (k, f) => (mem.has(k) ? mem.get(k) : f), set: (k, v) => mem.set(k, v) }
};
require(ROOT + 'js/menu.js');
const M = global.FMMenu;
const CELLS = M.GAME_CELLS, TABS = M.GAME_TABS;
const len = (s) => Array.from(s).length;

// ═══ 1. 清單本身 ═══
ok(CELLS.length === 108, '共 108 款（' + CELLS.length + '）');
const ids = new Set(CELLS.map(c => c.id));
ok(ids.size === CELLS.length, 'id 不重複');
CELLS.forEach(c => {
  ok(/^[a-z0-9]+$/.test(c.id), c.id + ' id 只有小寫英數');
  ok(typeof c.name === 'string' && len(c.name) >= 2 && len(c.name) <= 5, c.id + ' 名稱「' + c.name + '」2～5 個字（' + len(c.name) + '）');
  ok(!/\s/.test(c.name), c.id + ' 名稱沒有空白');
  ok(c.img === 'img/reaction/' + c.id + '.png', c.id + ' 縮圖路徑固定是 img/reaction/<id>.png：' + c.img);
  const f = ROOT + c.img;
  ok(fs.existsSync(f), c.id + ' 縮圖檔存在');
  if (fs.existsSync(f)) {
    const b = fs.readFileSync(f);
    const isPng = b.length > 24 && b.readUInt32BE(0) === 0x89504e47;
    ok(isPng, c.id + ' 是 PNG');
    if (isPng) {
      const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
      ok(h === 256, c.id + ' 縮圖高 256 像素（' + h + '）');
      ok(w >= 120 && w <= 200, c.id + ' 縮圖寬度合理（' + w + '）');
    }
  }
});

// ═══ 2. 跟各遊戲檔案登記的一致 ═══
const byId = {}; games.forEach(g => { byId[g.id] = g; });
ok(games.length === CELLS.length, '遊戲檔案登記了 ' + games.length + ' 款，選單有 ' + CELLS.length + ' 款');
CELLS.forEach(c => {
  ok(!!byId[c.id], c.id + ' 有對應的遊戲檔案');
  if (byId[c.id]) ok(byId[c.id].name === c.name, c.id + ' 名稱一致：選單「' + c.name + '」／遊戲「' + byId[c.id].name + '」');
});
games.forEach(g => ok(ids.has(g.id), g.id + ' 有出現在選單裡'));
// 使用者指定的改名
const want = { maxexpr: '拼出最大數', twinsock: '雙胞胎襪子', fillop: '挑加減乘除', farpair: '哪對離最遠', alignchar: '對準才看到' };
Object.keys(want).forEach(id => ok(CELLS.filter(c => c.id === id)[0].name === want[id], id + ' 名稱是「' + want[id] + '」'));

// ═══ 3. 頁籤與分類 ═══
ok(TABS.length === 9, '9 個頁籤（' + TABS.length + '）');
ok(TABS.map(t => t.name).join(',') === '全部,最近,記憶,視覺,反應,數字,邏輯,手感,目測', '頁籤順序：' + TABS.map(t => t.name).join(','));
ok(TABS[0].id === 'all' && TABS[1].id === 'recent', '前兩個是「全部」「最近」');
ok(TABS.every(t => len(t.name) === 2), '頁籤名稱都是 2 個字（直式排列才整齊）');
ok(new Set(TABS.map(t => t.id)).size === 9, '頁籤 id 不重複');
const catTabs = TABS.slice(2).map(t => t.id);
ok(catTabs.length === 7, '除了「全部」「最近」，有七種分類');
const counts = {};
CELLS.forEach(c => { ok(catTabs.indexOf(c.cat) >= 0, c.id + ' 的分類「' + c.cat + '」是七個分類之一'); counts[c.cat] = (counts[c.cat] || 0) + 1; });
catTabs.forEach(id => ok((counts[id] || 0) >= 5, id + ' 分類至少有 5 款（' + (counts[id] || 0) + '）'));
ok(catTabs.reduce((a, id) => a + (counts[id] || 0), 0) === 108, '七個分類加起來剛好 108 款');
console.log('各分類款數：' + TABS.slice(2).map(t => t.name + ' ' + counts[t.id]).join('、'));
const tg = (t) => M.tabGames(t).map(c => c.id);
ok(tg('all').join() === CELLS.map(c => c.id).join(), '「全部」＝清單順序');
catTabs.forEach(id => ok(tg(id).join() === CELLS.filter(c => c.cat === id).map(c => c.id).join(), id + ' 頁籤的順序同「全部」'));
const seen = new Set(); let overlap = 0;
catTabs.forEach(id => tg(id).forEach(x => { if (seen.has(x)) overlap++; seen.add(x); }));
ok(overlap === 0 && seen.size === 108, '分類之間沒有重複、也沒有漏掉（' + seen.size + '）');
ok(CELLS.filter(c => c.id === 'speed')[0].cat === 'reaction' && CELLS.filter(c => c.id === 'lights')[0].cat === 'memory' && CELLS.filter(c => c.id === 'remainder')[0].cat === 'number', '幾款代表性遊戲的分類');

// ═══ 4. 「最近」頁籤 ═══
const K = M.keys;
mem.clear();
ok(tg('recent').length === 0, '什麼紀錄都沒有 → 空的');
mem.set(K.last, 'spot');
ok(tg('recent').join() === 'spot', '只有「上次玩的」→ 它當第一筆');
mem.set(K.recent, ['hangpic', 'speed', 'nonexistent', 'hangpic', 'spot']);
ok(tg('recent').join() === 'hangpic,speed,spot', '最新在前、去掉不存在與重複的：' + tg('recent').join());
mem.set(K.recent, []);
ok(tg('recent').length === 0, '「最近」存成空陣列 → 空的（不退回上次玩的）');
mem.set(K.recent, 'garbage');
ok(tg('recent').join() === 'spot', '存檔壞掉（不是陣列）→ 退回「上次玩的」');
mem.set(K.recent, CELLS.slice(0, 30).map(c => c.id));
ok(tg('recent').length === M.RECENT_MAX && M.RECENT_MAX === 12, '最多 12 款（' + tg('recent').length + '）');

console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS (' + total + ' checks)');
process.exitCode = bad ? 1 : 0;
