// 從「遊戲檔案裡的 score 設定」產生資料庫 MF_games 的登記列（insert 的 values 那幾行）。
//   為什麼要產生而不是手寫：成績規格（越小／越大越好、合理範圍、遊戲名稱）的唯一來源是各遊戲檔案
//   裡的 SCORE，資料庫那一份是「抄過去的」；手抄 50 列很容易抄錯，所以用程式產生，
//   測試（test/reaction/t_leaderboard.js）再逐列檢查兩邊一致。
//
// 用法（在專案根目錄）：
//   node test/leaderboard/gen_games_sql.cjs            只把產生的 values 列印出來給你看
//   node test/leaderboard/gen_games_sql.cjs --write    直接改寫 supabase/MF_leaderboard.sql 裡
//                                                     「自動產生開始／結束」兩行標記之間的內容；
//                                                     同時重寫 js/score_specs.js 與 admin/stats.html 裡的遊戲資料（V1.39.0：
//                                                     後台統計頁自己是一個獨立的 html，遊戲名稱、分類、成績格式要靠這裡抄進去）
//   node test/leaderboard/gen_games_sql.cjs --check    只檢查 SQL 檔跟遊戲檔案是否同步（不同步回傳 1）
//   node test/leaderboard/gen_games_sql.cjs --table    印出 Markdown 表格（每款遊戲的成績規格），貼進 note/世界排行榜說明.md 用
// 改完之後，到 Supabase 的 SQL Editor 重新貼上執行整份 supabase/MF_leaderboard.sql（可重複執行）。
const fs = require('fs');
const path = require('path');
const { loadAllGames, ROOT } = require('./all_games.cjs');

const SQL_FILE = ROOT + 'supabase/MF_leaderboard.sql';
// 另外一份產物：js/score_specs.js（每款遊戲的成績顯示格式；主選單「成績」彈窗沒有載入遊戲檔案，要靠它把數字說成「12.3456 秒」「第 21 關」）
const SPECS_FILE = ROOT + 'js/score_specs.js';
// 第三份產物：admin/stats.html 裡「自動產生開始／結束」標記之間的遊戲資料（分類、順序、名稱、成績格式）。
//   後台統計頁（V1.39.0）是獨立的單一 html（雙擊就能開、不載入遊戲的任何 js），所以這些資料用抄的；跟遊戲不同步時 --check 與 t_adminstats.js 會失敗。
const STATS_FILE = ROOT + 'admin/stats.html';
const STATS_BEGIN = '/* >>> 自動產生開始';
const STATS_END = '/* <<< 自動產生結束 */';
const BEGIN = '-- >>> 自動產生開始';
const END = '-- <<< 自動產生結束';

// SQL 字串用單引號包起來，裡面如果有單引號要寫成兩個（''）
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// 一款遊戲 → 一列 values：('id', '遊戲名稱', 'min'|'max', 最小值, 最大值),
function rowOf(g) {
  const s = g.score;
  return '    (' + (q(g.id) + ',').padEnd(16) + q(g.name) + ', ' + q(s.better) + ', ' + s.min + ', ' + s.max + ')';
}

// 沒有 score 設定的遊戲不登記（它就不會有排行榜）
function buildRows(games) {
  return games.filter(g => g.score).map(rowOf);
}

// 產生「標記之間」要放的全部文字（每一列後面都有逗號，最後一列後面接 zz_test 那一列）
function buildBlock(games) {
  return BEGIN + '（node test/leaderboard/gen_games_sql.cjs --write 會重寫這兩行標記之間的內容，請不要手改）\n'
    + buildRows(games).map(r => r + ',').join('\n') + '\n    ' + END;
}

// 把 SQL 檔裡兩個標記之間的內容換成 block；回傳新的檔案內容（找不到標記就丟錯）
function patch(sql, block) {
  const a = sql.indexOf('    ' + BEGIN), b = sql.indexOf(END);
  if (a < 0 || b < 0 || b < a) throw new Error('MF_leaderboard.sql 找不到「' + BEGIN + '」與「' + END + '」標記');
  return sql.slice(0, a) + '    ' + block + sql.slice(b + END.length);
}

// Markdown 表格：每款遊戲的成績規格（寫進 note/世界排行榜說明.md 的第 5 節；規格改了就重新產生）
function buildTable(games) {
  const lines = ['| 遊戲（id） | 主成績 | 越大／越小越好 | 顯示範例 | 合理範圍（超出不送、資料庫也拒絕） |', '|---|---|---|---|---|'];
  games.filter(g => g.score).forEach(g => {
    const s = g.score;
    // 用跟遊戲裡一樣的格式化函式，所以千分位、小數位數都跟畫面一致
    const ex = (v) => Leaderboard.fmt(s, v);
    const sample = s.better === 'min' ? s.min + (s.max - s.min) * 0.002 : s.max * 0.1;
    lines.push('| ' + g.name + '（' + g.id + '） | ' + s.label + ' | ' + (s.better === 'min' ? '越小越好' : '越大越好') + ' | ' + ex(sample) + ' | ' + ex(s.min) + ' ～ ' + ex(s.max) + ' |');
  });
  return lines.join('\n');
}

// js/score_specs.js 的全部內容（一款一行；只放顯示成績需要的欄位 format／decimals／group，加上 better 讓畫面知道越大還是越小越好）
function buildSpecs(games) {
  const lines = games.filter(g => g.score).map(g => {
    const s = g.score;
    const o = { better: s.better, decimals: s.decimals || 0, format: s.format || '{v}' };
    if (s.group) o.group = true;
    return '    ' + JSON.stringify(g.id) + ': ' + JSON.stringify(o);
  });
  return '/* ═══ score_specs.js — 每款遊戲的成績顯示格式（自動產生，請勿手改）═══\n'
    + '   來源：各遊戲檔案 Reaction.register 的 score 設定；重新產生：node test/leaderboard/gen_games_sql.cjs --write\n'
    + '   用途：主選單（index.html）沒有載入遊戲檔案，「成績」彈窗（js/menu_nav.js）用這份表把成績數字說成 \'12.3456 秒\'、\'第 21 關\'\n'
    + '        （格式化函式是 Leaderboard.fmt，跟遊戲裡、世界排行榜用的同一個）。 */\n'
    + 'window.FM_SCORE_SPECS = {\n' + lines.join(',\n') + '\n};\n';
}

// 載入 js/menu.js 拿到 FMMenu（遊戲清單與分類；menu.js 載入時只會呼叫 UI.h／UI.ready，用假的就行）。要先 loadAllGames()（它會設好 window／UI）
function loadMenu() {
  global.UI.ready = global.UI.ready || (() => { });
  global.UI.art = global.UI.art || (() => '');
  if (!global.FMMenu) require(ROOT + 'js/menu.js');
  return global.FMMenu;
}

// admin/stats.html 的遊戲資料：CATS（七個分類）、ORDER（選單裡的順序）、GAMES（id → 名稱、分類、成績格式）。menu＝FMMenu
function buildStatsBlock(games, menu) {
  const byId = {};
  games.forEach(g => { byId[g.id] = g; });
  const cats = menu.GAME_TABS.filter(t => t.id !== 'all' && t.id !== 'recent').map(t => ({ id: t.id, name: t.name }));
  const lines = menu.GAME_CELLS.map(c => {
    const o = { name: c.name, cat: c.cat };
    const s = byId[c.id] && byId[c.id].score;
    if (s) { o.better = s.better; o.decimals = s.decimals || 0; o.format = s.format || '{v}'; if (s.group) o.group = true; }
    return '        ' + JSON.stringify(c.id) + ': ' + JSON.stringify(o);
  });
  return STATS_BEGIN + '（node test/leaderboard/gen_games_sql.cjs --write 會重寫這兩行標記之間的內容，請不要手改；來源：js/menu.js 的分類與遊戲清單、各遊戲檔案的 score 設定） */\n'
    + '    var CATS = ' + JSON.stringify(cats) + ';\n'
    + '    var ORDER = ' + JSON.stringify(menu.GAME_CELLS.map(c => c.id)) + ';\n'
    + '    var GAMES = {\n' + lines.join(',\n') + '\n    };\n'
    + '    ' + STATS_END;
}

// 把 html 裡兩個標記之間的內容換成 block；回傳新的內容（找不到標記就丟錯）
function patchStats(html, block) {
  const a = html.indexOf('    ' + STATS_BEGIN), b = html.indexOf(STATS_END);
  if (a < 0 || b < 0 || b < a) throw new Error('admin/stats.html 找不到「' + STATS_BEGIN + '」與「' + STATS_END + '」標記');
  return html.slice(0, a) + '    ' + block + html.slice(b + STATS_END.length);
}

module.exports = { buildRows, buildBlock, buildTable, buildSpecs, buildStatsBlock, patchStats, loadMenu, patch, rowOf, SQL_FILE, SPECS_FILE, STATS_FILE, BEGIN, END, STATS_BEGIN, STATS_END };

if (require.main === module) {
  const games = loadAllGames();
  const arg = process.argv[2];
  if (!arg) {
    console.log(buildRows(games).join(',\n'));
    console.log('\n共 ' + buildRows(games).length + ' 款遊戲（另外還有一列測試用的 zz_test，在 SQL 檔裡手寫）');
  } else {
    // 檔案可能是 CRLF：先統一成 LF 做取代，寫回去再還原，不要改變整份檔案的換行風格
    const raw = fs.readFileSync(SQL_FILE, 'utf8');
    const crlf = raw.includes('\r\n');
    const cur = raw.replace(/\r\n/g, '\n');
    const next = patch(cur, buildBlock(games));
    // 成績格式表：整份檔案都是產生的，直接比對全文（換行風格先統一成 LF）
    const specsNext = buildSpecs(games);
    const specsRaw = fs.existsSync(SPECS_FILE) ? fs.readFileSync(SPECS_FILE, 'utf8') : '';
    const specsCrlf = specsRaw.includes('\r\n');
    const specsCur = specsRaw.replace(/\r\n/g, '\n');
    // 後台統計頁的遊戲資料
    const statsRaw = fs.existsSync(STATS_FILE) ? fs.readFileSync(STATS_FILE, 'utf8') : null;
    const statsCrlf = !!statsRaw && statsRaw.includes('\r\n');
    const statsNext = statsRaw == null ? null : patchStats(statsRaw.replace(/\r\n/g, '\n'), buildStatsBlock(games, loadMenu()));
    const statsCur = statsRaw == null ? null : statsRaw.replace(/\r\n/g, '\n');
    if (arg === '--check') {
      if (next === cur && specsNext === specsCur && statsNext === statsCur) console.log('OK：MF_leaderboard.sql、js/score_specs.js、admin/stats.html 都與遊戲檔案同步（' + buildRows(games).length + ' 款）');
      else { console.log('不同步：請執行 node test/leaderboard/gen_games_sql.cjs --write'); process.exit(1); }
    } else if (arg === '--table') {
      console.log(buildTable(games));
    } else if (arg === '--write') {
      fs.writeFileSync(SQL_FILE, crlf ? next.replace(/\n/g, '\r\n') : next, 'utf8');
      fs.writeFileSync(SPECS_FILE, specsCrlf || !specsRaw ? specsNext.replace(/\n/g, '\r\n') : specsNext, 'utf8');
      if (statsNext != null) fs.writeFileSync(STATS_FILE, statsCrlf ? statsNext.replace(/\n/g, '\r\n') : statsNext, 'utf8');
      console.log('已更新 ' + path.relative(ROOT, SQL_FILE) + '：' + buildRows(games).length + ' 款遊戲；已更新 ' + path.relative(ROOT, SPECS_FILE) + (statsNext != null ? '、' + path.relative(ROOT, STATS_FILE) : ''));
    } else { console.log('不認得的參數：' + arg); process.exit(2); }
  }
}
