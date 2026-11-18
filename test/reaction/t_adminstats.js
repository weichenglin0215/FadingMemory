// 後台資料分析頁（admin/stats.html，V1.39.0）的靜態檢查（不開瀏覽器；實際操作畫面的測試在 test/admin/check_stats_viewer.mjs，資料庫函式的測試在 test/leaderboard/stats_sql_test.mjs）：
//   · 頁面裡「自動產生」的遊戲資料（七個分類、190 款的順序／名稱／分類／成績格式）跟 js/menu.js、各遊戲檔案同步（node test/leaderboard/gen_games_sql.cjs --write）
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
  ok(ORDER.length === 190 && new Set(ORDER).size === 190 && Object.keys(GAMES).length === 190, '190 款、順序不重複');
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
ok(/id="tab-games"[^>]*>遊戲分析</.test(page) && /id="tab-players"[^>]*>玩家分析</.test(page) && /id="tab-time"[^>]*>時間分析</.test(page), '頁籤：遊戲分析、玩家分析、時間分析');
ok(/role="tablist"/.test(page) && (page.match(/role="tabpanel"/g) || []).length === 4 && (page.match(/role="tab"/g) || []).length === 4, '頁籤的無障礙標記（tablist／tab／tabpanel，四個）');
ok(/<label class="name" for="dFrom">起始日期<\/label>/.test(page) && /<label class="name" for="dTo">結束日期<\/label>/.test(page), '最上方有「起始日期」「結束日期」兩個分析參數');
ok(/var DEFAULT_DAYS = 30;/.test(page) && /setDays\(DEFAULT_DAYS\);/.test(page), '預設：30 天前到今天');
ok(/\{ key: 'name', label: '遊戲名稱'[^}]*\},\s*\{ key: 'cat', label: '遊戲類型', sortable: true[^}]*\},\s*\{ key: 'players', label: '進行遊戲的人數', sortable: true[^}]*\},\s*\{ key: 'plays', label: '遊戲總次數', sortable: true[^}]*\},\s*\{ key: 'stars', label: '星星數量平均值', sortable: true[^}]*\},\s*\{ key: 'best', label: '最佳成績', sortable: false[^}]*\},\s*\{ key: 'bestNick', label: '第一名的玩家', sortable: false/.test(page), '遊戲分析的欄位順序，以及只有類型、人數、次數、星星平均可以排序');
ok(/sort: \{ key: 'plays', dir: 'desc' \}/.test(page), '遊戲分析預設依「遊戲總次數」由多到少');
ok(/玩家暱稱/.test(page) && /前 ' \+ TOP_N \+ ' 名次數/.test(page), '玩家分析：左邊是暱稱、依前 30 名的次數排');
ok(/每天遊戲總次數/.test(page) && /每天遊戲總人數/.test(page) && /drawChart\(host, days, 'plays'/.test(page) && /drawChart\(host, days, 'players'/.test(page), '時間分析：兩張圖，縱軸分別是當天遊戲總次數、當天遊戲總人數（不共用同一條縱軸）');
ok(!/dual[- ]axis|雙軸|yAxis2|secondary axis/i.test(page), '沒有雙縱軸');
ok(/prefers-color-scheme: dark/.test(page) && /--s-plays: #2a78d6/.test(page) && /--s-players: #eb6834/.test(page) && /--s-plays: #3987e5; --s-players: #d95926/.test(page), '深色模式有自己的一組顏色（圖表兩個系列色在淺色與深色底都通過色差檢查）');
ok(/<details class="tv card"/.test(page) && /表格檢視/.test(page), '有「表格檢視」（不靠滑鼠也看得到每天的數字）');

// ═══ 5. 清除玩家遊戲歷程（第四個頁籤，V1.57.1.0；SQL 第 7C 節）═══
ok(page.indexOf('id="tab-time"') < page.indexOf('id="tab-clear"') && /id="tab-clear"[^>]*data-tab="clear"[^>]*>清除玩家遊戲歷程</.test(page) && /var TABS = \['games', 'players', 'time', 'clear'\]/.test(page), '第四個頁籤「清除玩家遊戲歷程」在「時間分析」的右邊');
ok(/id="panel-clear"[^>]*role="tabpanel"/.test(page) && /id="cNick"/.test(page) && /id="cPid"/.test(page) && /id="cFrom"/.test(page) && /id="cTo"/.test(page), '頁籤內容有暱稱、player_id、起始日期、結束日期四個輸入欄');
ok(/for="cNick">玩家暱稱（nickname）</.test(page) && /for="cPid">player_id</.test(page) && /for="cFrom">起始日期</.test(page) && /for="cTo">結束日期</.test(page), '輸入欄的標籤文字');
ok(/id="btnView">查看玩家遊戲歷程</.test(page) && /id="btnClear">刪除玩家遊戲歷程</.test(page), '兩個按鈕：查看玩家遊戲歷程、刪除玩家遊戲歷程');
const devPid = /var CLEAR_DEFAULT_PID = '([0-9a-f-]+)'/.exec(page);
ok(/var CLEAR_DEFAULT_NICK = '阿公好開心';/.test(page) && devPid && devPid[1] === '49a65eea-1af7-4220-accf-7d0de93cc2a3' && /var CLEAR_DEFAULT_DAYS = 7;/.test(page), '預設值：暱稱 阿公好開心、player_id 49a65eea-…、起始日期是 7 天前（結束日期是今天）');
ok(/addDays\(t, -CLEAR_DEFAULT_DAYS\); cEls\.to\.value = t;/.test(page) && /resetClearForm\(\);/.test(page), '開頁面時把預設值填進去');
ok(/rpc\('MF_dev_player_history'/.test(page) && /rpc\('MF_dev_clear_player_history'/.test(page), '頁面呼叫 MF_dev_player_history（查看）與 MF_dev_clear_player_history（刪除）');
{
  const script = page.slice(page.indexOf('<script>')), iClr = script.indexOf('async function clearHistory'), body = script.slice(iClr, script.indexOf('// ───────── 八、頁籤', iClr));
  ok(body.indexOf('fetchHistory(f)') > 0 && body.indexOf('window.confirm(') > body.indexOf('fetchHistory(f)') && body.indexOf("rpc('MF_dev_clear_player_history'") > body.indexOf('window.confirm('), '刪除的順序：先查一次 → 跳出確認視窗 → 確定才呼叫刪除函式');
  ok(/if \(!window\.confirm\(msg\)\) \{[^}]*return;/.test(body) && /沒有東西可以刪/.test(body), '按「取消」就不刪；沒有紀錄也不呼叫刪除');
  ok(/UUID_RE\.test\(pid\)/.test(script) && /MAX_DAYS/.test(script.slice(script.indexOf('function readClearForm'), script.indexOf('function historyArgs'))), '送出前檢查：暱稱不能空、player_id 要是 UUID 格式、日期範圍最長 400 天');
  ok(/if \(tab !== 'clear'\) saveSettings\(\{ tab: tab \}\)/.test(script) && /saved = \['games', 'players', 'time'\]/.test(script), '下次打開網頁不會自己停在「清除」頁籤（只有網址是 #clear 才會）');
  ok(/els\.form\.hidden = tab === 'clear'/.test(script), '在清除頁籤，上面共用的分析日期參數列會隱藏（避免跟清除頁籤自己的日期混淆）');
}
{
  const fnHead = (f) => { const b = sql.slice(sql.indexOf('create or replace function public."' + f + '"')); return b.slice(0, b.indexOf('$$;', b.indexOf('as $$')) + 3); };
  for (const [f, sig, vol] of [['MF_dev_player_history', 'text, uuid, date, date', 'stable'], ['MF_dev_clear_player_history', 'text, uuid, date, date', 'volatile']]) {
    ok(new RegExp('create or replace function public\\."' + f + '"\\(p_nick text, p_player_id uuid, p_from date, p_to date\\)').test(sql), 'SQL 有 ' + f + '（暱稱、玩家編號、起、迄）');
    ok(new RegExp('revoke all on function public\\."' + f + '"\\(' + sig + '\\)\\s+from public;').test(sql) && new RegExp('grant execute on function public\\."' + f + '"\\(' + sig + '\\)\\s+to anon, authenticated;').test(sql), f + '：對 public 收回、開放給 anon／authenticated');
    const h = fnHead(f);
    ok(/security definer/.test(h) && /set search_path = ''/.test(h) && new RegExp('\\b' + vol + '\\b').test(h), f + '：security definer、固定 search_path、' + vol);
    ok(/p_nick is null or btrim\(p_nick\) = '' or p_player_id is null or p_from is null or p_to is null/.test(h) && /"MF__dev_target"\(p_nick, p_player_id\)/.test(h) && /"MF__stats_range"\(p_from, p_to\)/.test(h), f + '：參數檢查、要通過測試帳號檢查（MF__dev_target）、日期範圍最長 400 天');
  }
  ok(/create table if not exists public\."MF_dev_accounts"/.test(sql) && /alter table public\."MF_dev_accounts" enable row level security;/.test(sql) && /revoke all on table public\."MF_dev_accounts" from public, anon, authenticated;/.test(sql), 'MF_dev_accounts（開發者測試帳號清單）：開 RLS、收回 anon 的所有權限（只有 SQL Editor 能改）');
  ok(/revoke all on function public\."MF__dev_target"\(text, uuid\)\s+from public, anon, authenticated;/.test(sql) && /'not_allowed'/.test(fnHead('MF__dev_target')) && /'not_found'/.test(fnHead('MF__dev_target')), '內部函式 MF__dev_target 不開放給 anon；不在清單回 not_allowed、暱稱對不上回 not_found');
  const seeded = /insert into public\."MF_dev_accounts" \(player_id, note\)\s+values \('([0-9a-f-]+)'/.exec(sql);
  ok(seeded && devPid && seeded[1] === devPid[1], 'SQL 預先放進測試帳號清單的編號，跟網頁預設的 player_id 是同一個');
  const clr = fnHead('MF_dev_clear_player_history');
  ok(/delete from public\."MF_scores" s\s+where s\.player_id = p_player_id/.test(clr) && /update public\."MF_player_bests" b\s+set best_score = null, best_level = null, reject_rev = b\.reject_rev \+ 1\s+where b\.player_id = p_player_id/.test(clr) && /delete from public\."MF_play_days" d\s+where d\.player_id = p_player_id/.test(clr), '刪除只動這一位玩家（where player_id = 他）的三種紀錄：世界榜成績與遊玩統計刪列；個人最佳清空並把否定本機版本加 1（V1.57.2.0，本機最佳才會跟著被清）');
  ok(!/delete from public\."MF_players"|delete from public\."MF_ratings"|delete from public\."MF_feedback"/.test(clr), '不刪帳號、評價、意見');
  ok(/第 7C 節/.test(sql.slice(0, 3200)), 'SQL 檔頭的說明有提到第 7C 節');
}

console.log((bad ? bad + ' FAIL / ' : '') + total + ' checks');
console.log(bad ? 'SOME FAILED' : 'ALL PASS');
process.exit(bad ? 1 : 0);
