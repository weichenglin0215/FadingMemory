// 後台資料分析頁（admin/stats.html，V1.39.0）的靜態檢查（不開瀏覽器；實際操作畫面的測試在 test/admin/check_stats_viewer.mjs，資料庫函式的測試在 test/leaderboard/stats_sql_test.mjs）：
//   · 頁面裡「自動產生」的遊戲資料（七個分類、184 款的順序／名稱／分類／成績格式）跟 js/menu.js、各遊戲檔案同步（node test/leaderboard/gen_games_sql.cjs --write）
//   · 頁面呼叫的資料庫函式（MF_stats_games／MF_stats_daily／MF_stats_players）在 SQL 裡真的有，而且開放給 anon、對 public 收回；
//     遊戲端回報次數用的 MF_log_plays 與資料表 MF_play_days 也都在、表是鎖住的
//   · 安全：有內容安全政策（只准連 Supabase 與本機）、不載入外部程式或樣式、只用公開的 anon 金鑰、不用 innerHTML 放資料庫來的文字
//   · 版面規格：三個頁籤、分析參數的預設值（30 天前～今天）、遊戲分析的欄位順序與可排序的欄位
const fs = require('fs');
const path = require('path');
const { loadAllGames, ROOT } = require('../leaderboard/all_games.cjs');
const gen = require('../leaderboard/gen_games_sql.cjs');

let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };
const rd = p => fs.readFileSync(ROOT + p, 'utf8').replace(/\r\n/g, '\n');

const games = loadAllGames();
const menu = gen.loadMenu();
const page = rd('admin/stats.html'), sql = rd('supabase/MF_leaderboard.sql'), lb = rd('js/leaderboard.js');

// ═══ 1. 自動產生的遊戲資料與遊戲同步 ═══
ok(gen.patchStats(page, gen.buildStatsBlock(games, menu)) === page, 'admin/stats.html 的遊戲資料與遊戲同步（不同步請執行 node test/leaderboard/gen_games_sql.cjs --write）');
{
  const m = /var CATS = (\[.*?\]);\n\s*var ORDER = (\[.*?\]);\n\s*var GAMES = (\{[\s\S]*?\n\s*\});/.exec(page);
  ok(!!m, '找得到 CATS／ORDER／GAMES');
  const CATS = JSON.parse(m[1]), ORDER = JSON.parse(m[2]), GAMES = JSON.parse(m[3]);
  ok(CATS.length === 7 && CATS.map(c => c.name).join() === '記憶,視覺,反應,數字,邏輯,手感,目測', '七種遊戲類型：' + CATS.map(c => c.name));
  ok(ORDER.length === 184 && new Set(ORDER).size === 184 && Object.keys(GAMES).length === 184, '184 款、順序不重複');
  ok(ORDER.join() === menu.GAME_CELLS.map(c => c.id).join(), '順序＝主選單的順序');
  ok(ORDER.every(id => GAMES[id] && CATS.some(c => c.id === GAMES[id].cat)), '每一款都有名稱與屬於七種分類之一');
  const byId = Object.fromEntries(games.map(g => [g.id, g]));
  ok(ORDER.every(id => GAMES[id].name === byId[id].name), '名稱跟遊戲檔案登記的一致');
  ok(ORDER.every(id => { const s = byId[id].score; return s ? (GAMES[id].better === s.better && GAMES[id].format === (s.format || '{v}') && GAMES[id].decimals === (s.decimals || 0) && !!GAMES[id].group === !!s.group) : GAMES[id].format === undefined; }), '成績格式（better／decimals／format／group）跟遊戲檔案的 score 設定一致');
  const counts = {}; ORDER.forEach(id => { counts[GAMES[id].cat] = (counts[GAMES[id].cat] || 0) + 1; });
  ok(CATS.every(c => counts[c.id] > 0), '每個分類都有遊戲：' + JSON.stringify(counts));
}
ok(gen.patchStats(page.replace('var CATS = [{', 'var CATS = [{"x":1},{'), gen.buildStatsBlock(games, menu)) === page, '產生器會把標記之間被手改過的內容蓋回來');
{ let threw = false; try { gen.patchStats('<html></html>', 'x'); } catch (e) { threw = /找不到/.test(e.message); } ok(threw, '找不到標記時丟出明確的錯誤'); }

// ═══ 2. 頁面呼叫的函式在 SQL 裡 ═══
const FN = ['MF_stats_games', 'MF_stats_daily', 'MF_stats_players'];
FN.forEach(f => {
  ok(new RegExp("MF_stats_" + f.slice(9) + "\\b").test(page) && page.includes("'" + f + "'"), '頁面呼叫 ' + f);
  ok(new RegExp('create or replace function public\\."' + f + '"\\(p_from date default null, p_to date default null\\)').test(sql), 'SQL 有 ' + f + '（兩個日期參數，都可以不給）');
  ok(new RegExp('grant execute on function public\\."' + f + '"\\(date, date\\)\\s+to anon, authenticated;').test(sql) && new RegExp('revoke all on function public\\."' + f + '"\\(date, date\\)\\s+from public;').test(sql), f + '：對 public 收回、開放給 anon／authenticated');
  const body = sql.slice(sql.indexOf('create or replace function public."' + f + '"'));
  const head = body.slice(0, body.indexOf('$$;', body.indexOf('as $$')) + 3);
  ok(/security definer/.test(head) && /set search_path = ''/.test(head) && /\bstable\b/.test(head), f + '：security definer、固定 search_path、stable（只讀）');
});
ok(/create table if not exists public\."MF_play_days"/.test(sql) && /alter table public\."MF_play_days" enable row level security;/.test(sql) && /revoke all on table public\."MF_play_days" from public, anon, authenticated;/.test(sql), 'MF_play_days 資料表存在、開 RLS、收回 anon 的所有權限');
ok(/primary key \(day, game_id, player_id\)/.test(sql), 'MF_play_days：同一天、同一款、同一個人只有一列（資料量有上限）');
ok(/create or replace function public\."MF_log_plays"\(p_player_id uuid, p_items jsonb\)/.test(sql) && /grant execute on function public\."MF_log_plays"\(uuid, jsonb\)\s+to anon, authenticated;/.test(sql) && /revoke all on function public\."MF_log_plays"\(uuid, jsonb\)\s+from public;/.test(sql), 'MF_log_plays：對 public 收回、開放給 anon');
ok(/revoke all on function public\."MF__stats_range"\(date, date\)\s+from public, anon, authenticated;/.test(sql), '內部函式 MF__stats_range 不開放給 anon');
ok(/c_site_cap\s+constant int\s*:= 3000;/.test(sql) && /'error', 'busy'/.test(sql) && /c_back\s+constant int\s*:= 3;/.test(sql), 'MF_log_plays 有全站每分鐘上限與日期窗');
ok(/MF_log_plays/.test(rd('js/plays.js')) && /p_items/.test(rd('js/plays.js')) && /p_player_id/.test(rd('js/plays.js')), '遊戲端 js/plays.js 呼叫 MF_log_plays（p_player_id、p_items）');
ok(/第 7B 節/.test(sql.slice(0, 2500)), 'SQL 檔頭的說明有提到第 7B 節');

// ═══ 3. 安全 ═══
ok(/Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src https:\/\/\*\.supabase\.co http:\/\/localhost:\* http:\/\/127\.0\.0\.1:\*; img-src data:; base-uri 'none'; form-action 'none'"/.test(page), '內容安全政策：只准連 Supabase 與本機、其他來源一律不准');
ok(!/<script[^>]+src=/i.test(page) && !/<link[^>]+href=["']https?:/i.test(page) && !/@import|url\(\s*["']?https?:/i.test(page), '不載入任何外部程式、樣式或字型');
const key = /var ANON_KEY = '([^']+)'/.exec(page)[1], gameKey = /KEY:\s*'([^']+)'/.exec(lb)[1];
ok(key === gameKey && JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon', '只用公開的 anon 金鑰（跟遊戲同一把）');
ok(!/service_role['"]?\s*[:=]\s*['"]eyJ/.test(page) && !/sb_secret_/.test(page), '沒有 service_role／secret 金鑰');
{
  // 資料庫來的文字（暱稱、遊戲名稱）只能用 textContent；innerHTML／insertAdjacentHTML 只准放「數字」組成的字串
  const script = page.slice(page.indexOf('<script>'));
  ok(!/\.innerHTML\s*=/.test(script) && !/document\.write/.test(script) && !/\beval\(|new Function\(/.test(script), '不用 innerHTML／document.write／eval');
  const adj = script.match(/insertAdjacentHTML\([^)]*\)/g) || [];
  ok(adj.length === 1 && /'beforeend', cells\)/.test(adj[0]), '只有一處 insertAdjacentHTML（玩家矩陣的數字格子）');
  const cellsBuild = script.slice(script.indexOf("var cells = ''"), script.indexOf("tr.insertAdjacentHTML"));
  ok(/\(r \| 0\)/.test(cellsBuild) && /rankAlpha\(r\)\.toFixed\(3\)/.test(cellsBuild) && !/nick|name/.test(cellsBuild), '那一處只放名次（整數）與底色深淺（小數），不含暱稱、名稱');
}

// ═══ 4. 版面規格 ═══
ok(/id="tab-games"[^>]*>遊戲分析</.test(page) && /id="tab-players"[^>]*>玩家分析</.test(page) && /id="tab-time"[^>]*>時間分析</.test(page), '三個頁籤：遊戲分析、玩家分析、時間分析');
ok(/role="tablist"/.test(page) && (page.match(/role="tabpanel"/g) || []).length === 3 && (page.match(/role="tab"/g) || []).length === 3, '頁籤的無障礙標記（tablist／tab／tabpanel）');
ok(/<label class="name" for="dFrom">起始日期<\/label>/.test(page) && /<label class="name" for="dTo">結束日期<\/label>/.test(page), '最上方有「起始日期」「結束日期」兩個分析參數');
ok(/var DEFAULT_DAYS = 30;/.test(page) && /setDays\(DEFAULT_DAYS\);/.test(page), '預設：30 天前到今天');
ok(/\{ key: 'name', label: '遊戲名稱'[^}]*\},\s*\{ key: 'cat', label: '遊戲類型', sortable: true[^}]*\},\s*\{ key: 'players', label: '進行遊戲的人數', sortable: true[^}]*\},\s*\{ key: 'plays', label: '遊戲總次數', sortable: true[^}]*\},\s*\{ key: 'stars', label: '星星數量平均值', sortable: true[^}]*\},\s*\{ key: 'best', label: '最佳成績', sortable: false[^}]*\},\s*\{ key: 'bestNick', label: '第一名的玩家', sortable: false/.test(page), '遊戲分析的欄位順序，以及只有類型、人數、次數、星星平均可以排序');
ok(/sort: \{ key: 'plays', dir: 'desc' \}/.test(page), '遊戲分析預設依「遊戲總次數」由多到少');
ok(/玩家暱稱/.test(page) && /前 ' \+ TOP_N \+ ' 名次數/.test(page), '玩家分析：左邊是暱稱、依前 30 名的次數排');
ok(/每天遊戲總次數/.test(page) && /每天遊戲總人數/.test(page) && /drawChart\(host, days, 'plays'/.test(page) && /drawChart\(host, days, 'players'/.test(page), '時間分析：兩張圖，縱軸分別是當天遊戲總次數、當天遊戲總人數（不共用同一條縱軸）');
ok(!/dual[- ]axis|雙軸|yAxis2|secondary axis/i.test(page), '沒有雙縱軸');
ok(/prefers-color-scheme: dark/.test(page) && /--s-plays: #2a78d6/.test(page) && /--s-players: #eb6834/.test(page) && /--s-plays: #3987e5; --s-players: #d95926/.test(page), '深色模式有自己的一組顏色（圖表兩個系列色在淺色與深色底都通過色差檢查）');
ok(/<details class="tv card"/.test(page) && /表格檢視/.test(page), '有「表格檢視」（不靠滑鼠也看得到每天的數字）');

console.log((bad ? bad + ' FAIL / ' : '') + total + ' checks');
console.log(bad ? 'SOME FAILED' : 'ALL PASS');
process.exit(bad ? 1 : 0);
