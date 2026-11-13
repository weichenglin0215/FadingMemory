// 主選單的遊戲清單（js/menu.js 的 GAME_CELLS／GAME_TABS，V1.23.0）：
//   · 190 款（V1.57 新增翻牌湊百、翻三湊百、瞬間識字；V1.33 起 109 款，V1.34 新增 51 款，V1.41 新增深思篇 14 款，V1.42 新增原創篇 8 款，V1.43.1 刪除「按鍵搶三十」，V1.45 新增砲打飛機、草叢找動物、火箭回收，V1.46 新增泡泡掃射、分類點擊，V1.50 新增六角著色）、id 不重複、名稱最多 5 個字（格子下方的名稱列只放得下 5 個字）、縮圖檔存在且高 256 像素
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
const wid = (s) => Array.from(s).reduce((a, c) => a + (c.charCodeAt(0) < 128 ? 0.5 : 1), 0);   // 名稱列的寬度：英數字只有中文的一半寬

// ═══ 1. 清單本身 ═══
ok(CELLS.length === 190, '共 190 款（' + CELLS.length + '）');
const ids = new Set(CELLS.map(c => c.id));
ok(ids.size === CELLS.length, 'id 不重複');
CELLS.forEach(c => {
  ok(/^[a-z0-9]+$/.test(c.id), c.id + ' id 只有小寫英數');
  ok(typeof c.name === 'string' && len(c.name) >= 2 && wid(c.name) <= 5, c.id + ' 名稱「' + c.name + '」2～5 個字（英數字算半個字：' + wid(c.name) + '）');
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
ok(catTabs.reduce((a, id) => a + (counts[id] || 0), 0) === 190, '七個分類加起來剛好 190 款');
console.log('各分類款數：' + TABS.slice(2).map(t => t.name + ' ' + counts[t.id]).join('、'));
const tg = (t) => M.tabGames(t).map(c => c.id);
ok(tg('all').join() === CELLS.map(c => c.id).join(), '「全部」＝清單順序');
catTabs.forEach(id => ok(tg(id).join() === CELLS.filter(c => c.cat === id).map(c => c.id).join(), id + ' 頁籤的順序同「全部」'));
const seen = new Set(); let overlap = 0;
catTabs.forEach(id => tg(id).forEach(x => { if (seen.has(x)) overlap++; seen.add(x); }));
ok(overlap === 0 && seen.size === 190, '分類之間沒有重複、也沒有漏掉（' + seen.size + '）');
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

// ═══ 5. 「阿嬤都比你厲害」要顯示哪幾格（V1.25.0：資料庫回傳的被超越清單 → 格子）═══
const gi = (list) => M.grandmaItems(list).map(x => x.cell.id + ':' + x.rank).join(',');
ok(M.GRANDMA_MAX === 6, '最多顯示 6 款');
ok(gi(null) === '' && gi([]) === '' && gi('garbage') === '', '沒有資料 → 一格都沒有（不跳彈窗）');
ok(gi([{ game_id: 'cake', rank: 3 }, { game_id: 'speed', rank: 2 }]) === 'cake:3,speed:2', '照資料庫的順序（最近被超越的在前）');
ok(gi([{ game_id: 'nope', rank: 2 }, { game_id: 'zz_test', rank: 2 }, { game_id: 'spot', rank: 4 }]) === 'spot:4', '選單裡沒有的遊戲（測試用 zz_test、已移除的遊戲）略過');
ok(gi([{ game_id: 'spot', rank: 1 }, { game_id: 'drop', rank: 0 }, { game_id: 'cake' }, null, { game_id: 'pour', rank: 2 }]) === 'pour:2', '名次不是 2 以上（第一名、壞資料）略過');
ok(gi([{ game_id: 'cake', rank: 3 }, { game_id: 'cake', rank: 5 }]) === 'cake:3', '同一款只出現一次');
const many = CELLS.slice(0, 10).map((c, i) => ({ game_id: c.id, rank: i + 2 }));
ok(M.grandmaItems(many).length === 6 && gi(many) === many.slice(0, 6).map(x => x.game_id + ':' + x.rank).join(','), '超過 6 款只取前 6 款');
ok(M.grandmaItems([{ game_id: 'spot', rank: 4 }])[0].cell === CELLS.filter(c => c.id === 'spot')[0], '每一格用的是選單同一份遊戲資料（縮圖、名稱）');

// ═══ 6. 搜尋遊戲（V1.43.0：關鍵字是名稱的一部分就算符合）═══
const sg = (q) => M.searchGames(q).map(c => c.id);
ok(sg('').length === CELLS.length && sg('   ').length === CELLS.length && sg(null).length === CELLS.length, '關鍵字是空的 → 全部');
ok(sg('數獨').length >= 6 && M.searchGames('數獨').every(c => c.name.indexOf('數獨') >= 0), '「數獨」→ 名稱都含「數獨」（' + sg('數獨').length + ' 款）');
ok(sg('鬼腳圖').join() === CELLS.filter(c => c.name.indexOf('鬼腳圖') >= 0).map(c => c.id).join(), '「鬼腳圖」→ 鬼腳圖與鬼腳圖減一');
ok(sg('零秒').join() === 'speed', '只打一部分「零秒」→ 零秒出手');
ok(sg('出手').join() === 'speed', '名稱後半段「出手」也找得到');
ok(sg('零秒出手').join() === 'speed', '打全名也找得到');
ok(sg('  零秒  ').join() === 'speed', '前後空白略過');
ok(sg('xyz不存在').length === 0, '找不到 → 空陣列');
ok(sg('SUDOKU4').join() === 'sudoku4' && sg('Ｓudoku4').join() === 'sudoku4', '英文 id 也找得到，大小寫、全形半形不分，名稱比對沒中時才用 id');
ok(sg('數獨 入門').length >= 1 && M.searchGames('數獨 入門').every(c => c.name.indexOf('數獨') >= 0 && c.name.indexOf('入門') >= 0), '空白隔開 → 每一段都要符合');
ok(sg('入門 數獨').join() === sg('數獨 入門').join(), '多段的順序不拘');
ok(M.searchGames('數').every(c => c.name.indexOf('數') >= 0 || c.id.indexOf('數') >= 0), '單一個字也行');
CELLS.forEach(c => ok(sg(c.name).indexOf(c.id) >= 0, c.id + '「' + c.name + '」用自己的全名一定搜得到'));
const nameFirst = M.searchGames('sudoku').map(c => c.id);
ok(nameFirst.length >= 6, '搜尋 id 片段 sudoku 會找到數獨系列（' + nameFirst.length + ' 款）');

// ═══ 世界前三名徽章（V1.53）：遊戲格子右上角的金／銀／銅牌＋名次數字 ═══
{ const mm = (l) => JSON.stringify(M.medalMap(l));
  ok(M.MEDAL_MAX === 3, '前 3 名才有徽章');
  ok(mm([{ game_id: 'spot', rank: 1 }, { game_id: 'speed', rank: 2 }, { game_id: 'rainbow', rank: 3 }]) === JSON.stringify({ spot: 1, speed: 2, rainbow: 3 }), '第 1、2、3 名都有徽章');
  ok(mm([{ game_id: 'spot', rank: 4 }, { game_id: 'speed', rank: 30 }]) === '{}', '第 4 名以後沒有徽章');
  ok(mm([{ game_id: 'nogame', rank: 1 }, { game_id: 'spot', rank: 0 }, { game_id: 'speed', rank: 1.5 }, { game_id: 'rainbow', rank: -1 }, null, undefined, { game_id: 'spot' }]) === '{}', '不在選單裡的遊戲、名次不合理的列都忽略');
  ok(mm(null) === '{}' && mm(undefined) === '{}' && mm([]) === '{}' && mm('x') === '{}', '沒有資料（沒登入、連不上）就沒有徽章');
  ok(mm([{ game_id: 'spot', rank: 3 }, { game_id: 'spot', rank: 1 }]) === JSON.stringify({ spot: 1 }), '同一款有兩列時以後面的為準（資料庫一款只會有一列）');
  const src = fs.readFileSync(ROOT + 'js/menu.js', 'utf8'), lbCss = fs.readFileSync(ROOT + 'css/leaderboard.css', 'utf8').replace(/[ 	]*\/\*[\s\S]*?\*\//g, ''), menuCss = fs.readFileSync(ROOT + 'css/menu.css', 'utf8').replace(/[ 	]*\/\*[\s\S]*?\*\//g, '');
  ok(/'lb-medal lb-medal--r' \+ rank \+ ' game-cell__medal /.test(src), '徽章用世界前 30 名彈窗同一個圓形牌子 .lb-medal');
  ok(/apply\(lb\.cachedMyRanks \? lb\.cachedMyRanks\(\) : null\);\s*lb\.myRanks\(\)\.then/.test(src) && /refreshMedals\(\);\s*checkPopup\(\)/.test(src), '列表一打開先畫上次存的名次、再背景更新（不讓玩家等網路）');
  ok(/paintMedal\(el, c\.id\);\s*grid\.appendChild\(el\)/.test(src), '切換頁籤、搜尋時新做的格子也有徽章');
  ok(!/paintMedal/.test(src.split('function popupCell')[1].split('function closePopup')[0]), '推薦彈窗的格子不加徽章（右上角已經是表情）');
  ok(/\.lb-medal--r1\s*\{[^}]*--lb-gold-bg/.test(lbCss) && /\.lb-medal--r2\s*\{[^}]*--lb-silver-bg/.test(lbCss) && /\.lb-medal--r3\s*\{[^}]*--lb-bronze-bg/.test(lbCss), '金、銀、銅三種顏色');
  ok(/if \(rank === 1\) medal\.appendChild\(h\('span', \{ 'class': 'lb-crown', html: window\.UI\.icon\('crown'\) \}\)\)/.test(src), '第一名的徽章多一頂皇冠（跟世界前 30 名彈窗同一個 .lb-crown）');
  ok(/\.lb-medal\.game-cell__medal--r1\s*\{[^}]*top:\s*20px/.test(menuCss) && /\.game-cell__medal \.lb-crown\s*\{[^}]*top:\s*-17px[^}]*font-size:\s*26px/.test(menuCss), '第一名的牌子往下移、皇冠縮小，放得進格子裡');
  ok(/\.lb-medal\.game-cell__medal\s*\{[^}]*position:\s*absolute;[^}]*top:\s*4px;[^}]*right:\s*4px;/.test(menuCss) && /\.lb-medal\.game-cell__medal\s*\{[^}]*pointer-events:\s*none/.test(menuCss), '徽章貼在格子右上角、不擋點擊'); }

console.log(bad ? 'FAILED ' + bad + ' / ' + total : 'ALL PASS (' + total + ' checks)');
process.exitCode = bad ? 1 : 0;
