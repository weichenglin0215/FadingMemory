// 從「遊戲檔案裡的 score 設定」產生資料庫 MF_games 的登記列（insert 的 values 那幾行）。
//   為什麼要產生而不是手寫：成績規格（越小／越大越好、合理範圍、遊戲名稱）的唯一來源是各遊戲檔案
//   裡的 SCORE，資料庫那一份是「抄過去的」；手抄 50 列很容易抄錯，所以用程式產生，
//   測試（test/reaction/t_leaderboard.js）再逐列檢查兩邊一致。
//
// 用法（在專案根目錄）：
//   node test/leaderboard/gen_games_sql.cjs            只把產生的 values 列印出來給你看
//   node test/leaderboard/gen_games_sql.cjs --write    直接改寫 supabase/MF_leaderboard.sql 裡
//                                                     「自動產生開始／結束」兩行標記之間的內容
//   node test/leaderboard/gen_games_sql.cjs --check    只檢查 SQL 檔跟遊戲檔案是否同步（不同步回傳 1）
//   node test/leaderboard/gen_games_sql.cjs --table    印出 Markdown 表格（每款遊戲的成績規格），貼進 note/世界排行榜說明.md 用
// 改完之後，到 Supabase 的 SQL Editor 重新貼上執行整份 supabase/MF_leaderboard.sql（可重複執行）。
const fs = require('fs');
const path = require('path');
const { loadAllGames, ROOT } = require('./all_games.cjs');

const SQL_FILE = ROOT + 'supabase/MF_leaderboard.sql';
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

module.exports = { buildRows, buildBlock, buildTable, patch, rowOf, SQL_FILE, BEGIN, END };

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
    if (arg === '--check') {
      if (next === cur) console.log('OK：MF_leaderboard.sql 與遊戲檔案同步（' + buildRows(games).length + ' 款）');
      else { console.log('不同步：請執行 node test/leaderboard/gen_games_sql.cjs --write'); process.exit(1); }
    } else if (arg === '--table') {
      console.log(buildTable(games));
    } else if (arg === '--write') {
      fs.writeFileSync(SQL_FILE, crlf ? next.replace(/\n/g, '\r\n') : next, 'utf8');
      console.log('已更新 ' + path.relative(ROOT, SQL_FILE) + '：' + buildRows(games).length + ' 款遊戲');
    } else { console.log('不認得的參數：' + arg); process.exit(2); }
  }
}
