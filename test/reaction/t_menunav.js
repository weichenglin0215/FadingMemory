// 主選單左上角的漢堡選單（V1.38.0）：js/menu_nav.js、css/menu_nav.css、index.html、js/score_specs.js、Leaderboard.myRanks（MF_get_my_ranks）
//   · 純函式 buildRows：「成績」彈窗的列表——世界名次由前到後（同名次照選單順序）、玩過但沒進榜的接在後面（最近玩的在前）、不認得的遊戲／壞資料丟掉
//   · score_specs.js 與各遊戲檔案的 score 設定同步（node test/leaderboard/gen_games_sql.cjs --write 產生），scoreText 用它把數字說成「12.3456 秒」
//   · Leaderboard.myRanks：沒登入不連網、快取 30 秒、同時問只連一次、404（資料庫還沒更新）回傳 null、名次變了（forgetOvertaken）快取清掉
//   · 頁面接線：HTML 結構、boot.js 的載入清單、設定彈窗（暱稱、修改暱稱、音樂音效勾選框）、SQL 函式
// 實際點擊、捲動、勾選的流程在瀏覽器驗證。
const fs = require('fs');
const path = require('path');
const { game } = require('./load.js');                  // 設定好 window／UI／Sfx，並載入 js/leaderboard.js
const { loadAllGames, ROOT } = require('../leaderboard/all_games.cjs');
const gen = require('../leaderboard/gen_games_sql.cjs');

let bad = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { bad++; console.log('FAIL', m); } };
const rd = p => fs.readFileSync(ROOT + p, 'utf8');

// 用「記在記憶體裡」的假 localStorage（Leaderboard 的快取、登入狀態都靠它）
const mem = new Map();
global.UI.store = { get: (k, f) => (mem.has(k) ? JSON.parse(mem.get(k)) : f), set: (k, v) => mem.set(k, JSON.stringify(v)), remove: k => mem.delete(k) };
global.UI.ready = () => { };
const games = loadAllGames();
require(ROOT + 'js/menu.js');
require(ROOT + 'js/score_specs.js');
require(ROOT + 'js/menu_nav.js');
const M = global.FMMenu, N = global.FMNav, LB = global.Leaderboard, T = LB.test;
const order = M.GAME_CELLS.map(c => c.id);

// ═══ 1. buildRows ═══
{
  const r = N.buildRows({
    order, recent: ['beans', 'chicks'],
    ranks: [{ game_id: 'beans', rank: 7, score: 41 }, { game_id: 'speed', rank: 1, score: 0.1237 }, { game_id: 'carpet', rank: 3, score: 8 }, { game_id: 'chicks', rank: 3, score: 12 },
      { game_id: 'nope', rank: 2, score: 5 }, { game_id: 'speed', rank: 9, score: 9 }, { game_id: 'drop', rank: 0, score: 5 }, { game_id: 'spot', rank: 4, score: NaN }, { game_id: 'cups', rank: 2.5, score: 3 }, null],
    bests: { speed: 0.12, spot: 14, chicks: 9, minus7: 21, drop: 120, nope: 3, beans: 30, bad: 'x', change: Infinity }
  });
  ok(r.ranked.map(x => x.id + ':' + x.rank).join() === 'speed:1,chicks:3,carpet:3,beans:7' || r.ranked.map(x => x.id + ':' + x.rank).join() === 'speed:1,carpet:3,chicks:3,beans:7', '名次由前到後：' + r.ranked.map(x => x.id + ':' + x.rank).join());
  const ids = r.ranked.map(x => x.id), iC = ids.indexOf('chicks'), iK = ids.indexOf('carpet');
  ok((order.indexOf('chicks') < order.indexOf('carpet')) === (iC < iK), '同名次的照選單順序');
  ok(!ids.includes('nope') && ids.filter(x => x === 'speed').length === 1 && r.ranked.find(x => x.id === 'speed').rank === 1, '不認得的遊戲丟掉；同一款只留第一筆');
  ok(!ids.includes('drop') && !ids.includes('spot') && !ids.includes('cups'), '壞資料（名次 0、成績不是數字、名次不是整數）丟掉');
  const pl = r.played.map(x => x.id);
  ok(!pl.includes('speed') && !pl.includes('beans') && !pl.includes('chicks'), '已經有名次的不再列在「玩過的」裡：' + pl);
  ok(!pl.includes('nope') && !pl.includes('bad') && !pl.includes('change'), '不認得、不是數字、無限大的丟掉：' + pl);
  ok(pl.join() === 'spot,minus7,drop' || pl.join() === 'spot,drop,minus7' || pl.slice().sort().join() === 'drop,minus7,spot', '玩過但沒進榜的：' + pl);
  ok(r.played.find(x => x.id === 'spot').score === 14, '帶著個人最佳');
  // 最近玩的排前面
  const r2 = N.buildRows({ order, recent: ['minus7', 'spot'], ranks: [], bests: { spot: 1, minus7: 2, drop: 3, speed: 4 } });
  ok(r2.played.map(x => x.id).slice(0, 2).join() === 'minus7,spot', '最近玩的在前面：' + r2.played.map(x => x.id));
  ok(r2.played.slice(2).map(x => x.id).join() === order.filter(i => i === 'speed' || i === 'drop').join(), '沒玩過「最近」的照選單順序');
  ok(N.buildRows({}).ranked.length === 0 && N.buildRows({}).played.length === 0 && N.buildRows(null).ranked.length === 0, '沒資料也不會當掉');
  // 名次相同時的穩定性：每次結果一樣
  ok(JSON.stringify(N.buildRows({ order, ranks: [{ game_id: 'carpet', rank: 5, score: 1 }, { game_id: 'chicks', rank: 5, score: 2 }, { game_id: 'beans', rank: 5, score: 3 }] }).ranked.map(x => x.id)) === JSON.stringify(['chicks', 'carpet', 'beans'].sort((a, b) => order.indexOf(a) - order.indexOf(b))), '同名次的順序固定');
}

// ═══ 2. 成績格式表 score_specs.js ═══
{
  const specs = global.FM_SCORE_SPECS, scored = games.filter(g => g.score);
  ok(specs && Object.keys(specs).length === scored.length && scored.length === 190, '每一款有 score 設定的遊戲都有格式（' + scored.length + ' 款）');
  scored.forEach(g => {
    const s = specs[g.id];
    ok(!!s && s.format === g.score.format && s.decimals === (g.score.decimals || 0) && s.better === g.score.better && !!s.group === !!g.score.group, g.id + '：格式與遊戲檔案一致');
    ok(typeof s.format === 'string' && s.format.indexOf('{v}') >= 0, g.id + '：格式裡有 {v}');
    ok(LB.fmt(s, 12.34567) === LB.fmt(g.score, 12.34567), g.id + '：顯示的字跟遊戲裡一樣');
  });
  ok(N.scoreText('speed', 0.1237) === '0.1237 秒' && N.scoreText('chicks', 12) === '12 關' && N.scoreText('unknown_game', 3.5) === '3.5', 'scoreText：數字說成「0.1237 秒」「12 關」；沒有格式的照數字');
  // 檔案跟產生器同步（忘了執行 node test/leaderboard/gen_games_sql.cjs --write 會在這裡失敗）
  const cur = rd('js/score_specs.js').replace(/\r\n/g, '\n');
  ok(cur === gen.buildSpecs(games), 'js/score_specs.js 與遊戲檔案同步：請執行 node test/leaderboard/gen_games_sql.cjs --write');
}

// ═══ 3. Leaderboard.myRanks ═══
(async () => {
  const PID = '22222222-2222-4222-8222-222222222222', TOK = 'tok-menunav-0123456789';
  const calls = []; let mode = 'ok', latency = 0;
  const server = [{ game_id: 'speed', rank: 1, score: 0.1237 }, { game_id: 'beans', rank: 7, score: 41 }, { game_id: '壞資料', rank: 3, score: 1 }, { game_id: 'drop', rank: 0, score: 5 }];
  global.fetch = (url, opt) => {
    const name = url.split('/rpc/')[1], body = JSON.parse(opt.body); calls.push({ name, body });
    return new Promise(r => setTimeout(r, latency)).then(() => {
      if (mode === 'down') throw new TypeError('Failed to fetch');
      if (name === 'MF_get_my_ranks') return mode === '404' ? { ok: false, status: 404, json: () => Promise.resolve({}) } : { ok: true, status: 200, json: () => Promise.resolve(server) };
      return { ok: false, status: 404, json: () => Promise.resolve({}) };
    });
  };
  const reset = () => { mem.clear(); calls.length = 0; mode = 'ok'; latency = 0; T.state.netDownUntil = 0; T.state.myRanksP = null; };

  ok(T.cleanMyRanks(server).map(x => x.game_id).join() === 'speed,beans' && T.cleanMyRanks(null).length === 0 && T.cleanMyRanks([{ game_id: 'a', rank: 1, score: '3' }]).length === 0, 'cleanMyRanks：格式不對的丟掉');
  // 沒登入（訪客）：不連網、回傳空陣列
  reset();
  let list = await LB.myRanks();
  ok(Array.isArray(list) && list.length === 0 && calls.length === 0, '沒登入：不連網');
  ok(LB.cachedMyRanks() === null, '沒登入：沒有快取');
  // 登入之後：連一次、帶 p_player_id
  LB.setSession({ player_id: PID, token: TOK, nick: '測試員' });
  list = await LB.myRanks();
  ok(calls.length === 1 && calls[0].name === 'MF_get_my_ranks' && calls[0].body.p_player_id === PID && Object.keys(calls[0].body).join() === 'p_player_id', '登入：呼叫 MF_get_my_ranks，只帶 p_player_id：' + JSON.stringify(calls[0] && calls[0].body));
  ok(list.length === 2 && list[0].game_id === 'speed' && list[1].rank === 7, '回傳清理過的名次');
  list = await LB.myRanks();
  ok(calls.length === 1, '30 秒內再問：用快取、不連網');
  ok(LB.cachedMyRanks().length === 2, 'cachedMyRanks：同步拿得到上次的名次');
  await LB.myRanks({ force: true });
  ok(calls.length === 2, 'force：強制重抓');
  // 同時問好幾次，只連一次
  reset(); LB.setSession({ player_id: PID, token: TOK, nick: '測試員' }); latency = 20;
  const all = await Promise.all([LB.myRanks(), LB.myRanks(), LB.myRanks()]);
  ok(calls.length === 1 && all.every(l => l.length === 2), '同時問 3 次只連 1 次');
  // 名次變了（自己的成績進榜、登入登出）：快取清掉
  LB.forgetOvertaken();
  ok(LB.cachedMyRanks() === null, 'forgetOvertaken 也清掉各遊戲名次的快取');
  // 換一位玩家：不能拿到別人的快取
  reset(); LB.setSession({ player_id: PID, token: TOK, nick: 'A' }); await LB.myRanks();
  LB.setSession({ player_id: '33333333-3333-4333-8333-333333333333', token: TOK, nick: 'B' });
  ok(LB.cachedMyRanks() === null, '換玩家：舊玩家的名次不會顯示給新玩家');
  // 連不上網路、資料庫還沒更新（404）：回傳 null，不當掉
  reset(); LB.setSession({ player_id: PID, token: TOK, nick: 'A' }); mode = '404';
  list = await LB.myRanks();
  ok(list === null, '404（資料庫還沒有 MF_get_my_ranks）：回傳 null');
  reset(); LB.setSession({ player_id: PID, token: TOK, nick: 'A' }); mode = 'down';
  list = await LB.myRanks();
  ok(list === null && calls.length === 1, '連不上網路：回傳 null');
  await LB.myRanks();
  ok(calls.length === 1, '連線失敗之後一小段時間內不再嘗試連線');

  // ═══ 4. 頁面接線 ═══
  const html = rd('index.html'), boot = rd('js/boot.js'), css = rd('css/menu_nav.css').split(/\s+/).join(' '), nav = rd('js/menu_nav.js'), idui = rd('js/identity_ui.js'), sql = rd('supabase/MF_leaderboard.sql');
  ok(/<button class="nav-btn" id="nav-btn" type="button" aria-label="選單" aria-haspopup="true" aria-expanded="false" aria-controls="nav-pop">/.test(html), 'index.html：左上角漢堡按鈕');
  ok(/<div class="nav-pop" id="nav-pop" role="menu" hidden>/.test(html) && /id="nav-settings"[\s\S]*?<span>設定<\/span>/.test(html) && /id="nav-scores"[\s\S]*?<span>成績<\/span>/.test(html), 'index.html：往下展開的選單有「設定」「成績」兩項');
  ok(html.indexOf('id="nav-btn"') < html.indexOf('id="share-btn"') || html.indexOf('id="nav-btn"') < html.indexOf('class="menu__head"'), '漢堡按鈕在標題之前（左上角）');
  const menuJs = /menu: \{[\s\S]*?js: BASE_JS\.concat\(\[([^\]]*)\]\)/.exec(boot)[1], menuCss = /menu: \{\s*css: BASE_CSS\.concat\(\[([^\]]*)\]\)/.exec(boot)[1];
  const jsList = [...menuJs.matchAll(/'([^']+)'/g)].map(m => m[1]), cssList = [...menuCss.matchAll(/'([^']+)'/g)].map(m => m[1]);
  ok(jsList.indexOf('js/sfx.js') >= 0 && jsList.indexOf('js/sfx.js') < jsList.indexOf('js/dialog.js'), 'boot.js 選單頁：載入 sfx.js（設定裡的音樂音效要用；在 dialog.js 之前）');
  ok(jsList.indexOf('js/score_specs.js') >= 0 && jsList.indexOf('js/score_specs.js') < jsList.indexOf('js/menu_nav.js') && jsList.indexOf('js/menu.js') < jsList.indexOf('js/menu_nav.js') && jsList.indexOf('js/scroller.js') >= 0 && jsList.indexOf('js/identity_ui.js') >= 0 && jsList.indexOf('js/leaderboard.js') < jsList.indexOf('js/menu_nav.js'), 'boot.js 選單頁：menu_nav.js 在 menu.js、score_specs.js、leaderboard.js 之後');
  ok(cssList.indexOf('css/menu_nav.css') > cssList.indexOf('css/menu.css') && cssList.indexOf('css/leaderboard.css') >= 0 && cssList.indexOf('css/leaderboard.css') < cssList.indexOf('css/menu_nav.css'), 'boot.js 選單頁：menu_nav.css 與 leaderboard.css（成績列表沿用它的樣式）');
  ok(/function openSettings\(\)/.test(nav) && /function openScores\(\)/.test(nav) && /nav-settings/.test(nav) && /nav-scores/.test(nav), 'menu_nav.js：設定、成績兩個彈窗');
  ok(/'修改暱稱'/.test(nav) && /ID\.ui\.renameDialog\(\)/.test(nav) && /renameDialog: renameDialog/.test(idui) && /renameDialog\(\)\.then/.test(idui), '設定：「修改暱稱」用身分彈窗的 renameDialog（我的帳號面板共用同一個）');
  ok(/'音樂音效'/.test(nav) && /role: 'switch'/.test(nav) && !/checkbox/.test(nav) && /global\.UI\.icon\(on \? 'volume' : 'mute'\)/.test(nav) && /global\.Sfx\.setMuted\(!global\.Sfx\.isMuted\(\)\)/.test(nav), '設定：音樂音效是喇叭圖示（開＝volume、關＝mute），點一下切換，跟遊戲裡的喇叭同一個開關（Sfx.setMuted）');
  ok(/var muted = false;/.test(rd('js/sfx.js')) && /getItem\(KEY_MUTED\) === '1'/.test(rd('js/sfx.js')), '音效預設是開（沒存過靜音設定＝開，存了 1 才靜音）');
  ok(/icons?\b/.test('icons') && /volume: '/.test(rd('js/ui.js')) && /mute: '/.test(rd('js/ui.js')) && /download: '/.test(rd('js/ui.js')), 'ui.js 有喇叭（volume）、靜音（mute）、下載（download）圖示');
  // 兩個彈窗最下面的「關閉」：白底藍框藍字（kind line）、高度 2/3
  ok((nav.match(/text: '關閉', kind: 'line', cls: 'nav-close'/g) || []).length === 2 && !/text: '關閉', kind: 'sky'/.test(nav), '設定、成績的「關閉」都是白底藍框藍字（line）＋ nav-close');
  ok(/\.btn\.nav-close \{ height: calc\(var\(--btn-h\) \* 2 \/ 3\);/.test(css), '.nav-close：高度是 --btn-h 的 2/3（84px → 56px）');
  // 成績：沒有「名次 遊戲與成績」欄位標題；名稱與成績左右排
  ok(!/lb-cols/.test(nav) && !/sc-cols/.test(css) && !/遊戲與成績/.test(nav), '成績：刪除「名次　遊戲與成績」欄位標題');
  ok(/\.sc-main \{[^}]*display: flex;[^}]*justify-content: space-between;/.test(css) && /\.sc-name \{[^}]*flex: 1 1 auto;/.test(css) && /\.sc-score \{[^}]*flex: 0 0 auto;[^}]*text-align: right;/.test(css), '成績：遊戲名稱（靠左）與成績（靠右）左右排，不再上下兩行');
  // 選單第三項「安裝與離線」
  ok(/id="nav-offline"[\s\S]*?<span>安裝與離線<\/span>/.test(html) && /byId\('nav-offline'\)\.addEventListener\('click'[^\n]*OfflineDialog\.show\(\)/.test(nav) && /byId\('icon-nav-offline'\)\.innerHTML = global\.UI\.icon\('download'\)/.test(nav), '漢堡選單第三項「安裝與離線」→ OfflineDialog.show()');
  ok(jsList.indexOf('js/offline.js') > jsList.indexOf('js/pwa.js') && jsList.indexOf('js/offline_ui.js') > jsList.indexOf('js/offline.js') && jsList.indexOf('js/scroller.js') >= 0, 'boot.js 選單頁：載入 offline.js、offline_ui.js（在 pwa.js、scroller.js 之後）');
  ok(/Scroller\.make\(viewport, list, thumb, \{ threshold: SCROLL_THRESHOLD \}\)/.test(nav) && /class': 'sc-play'/.test(nav) && /M\.pickGame\(r\.id\)/.test(nav) && /text: '玩'/.test(nav), '成績：用 Scroller（慣性捲動）、每列右邊有「玩」按鈕、點了進那款遊戲（pickGame）');
  ok(/LB\.myRanks\(\)/.test(nav) && /LB\.cachedMyRanks/.test(nav) && /KEY_BEST \+ c\.id \+ '\.sync'/.test(nav), '成績：世界名次來自 Leaderboard.myRanks；個人最佳只收確認過單位（.sync）的');
  ok(/\.nav-btn \{[^}]*position: absolute;[^}]*top: var\(--sp-4\);[^}]*left: var\(--sp-4\)/.test(css) && /\.nav-pop\[hidden\] \{ display: none;/.test(css) && /\.menu~\.dlg--stage \{ top: 0;/.test(css), 'CSS：左上角的按鈕、選單隱藏、主選單的彈窗蓋滿整個畫面');
  ok(/\.set-sound \{[^}]*background: var\(--c-card-alt\)/.test(css) && /\.set-sound__ico \{[^}]*color: var\(--c-blue\)/.test(css) && /\.set-sound\.is-off \.set-sound__ico \{[^}]*var\(--c-ink-soft\)/.test(css) && /\.sc-play \{[^}]*var\(--btn-go-bg\)/.test(css), 'CSS：喇叭圖示（開藍、關灰）、「玩」按鈕用主題變數');
  ok(/create or replace function public\."MF_get_my_ranks"\(p_player_id uuid\)/.test(sql) && /grant execute on function public\."MF_get_my_ranks"\(uuid\) to anon, authenticated;/.test(sql) && /revoke all on function public\."MF_get_my_ranks"\(uuid\) from public;/.test(sql), 'SQL：MF_get_my_ranks 只開放執行權限給 anon／authenticated');
  const fn = /create or replace function public\."MF_get_my_ranks"[\s\S]*?\$\$;/.exec(sql)[0];
  ok(/security definer/.test(fn) && /set search_path = ''/.test(fn) && /where m\.player_id = p_player_id/.test(fn) && !/'player_id'/.test(fn) && /'game_id', x\.game_id, 'rank', x\.rank, 'score', x\.score/.test(fn), 'SQL：只查這位玩家自己的列、只回傳 game_id／rank／score（不回傳任何人的 player_id）');
  ok(/\(o\.rank_key, o\.achieved_at, o\.id\) < \(m\.rank_key, m\.achieved_at, m\.id\)/.test(fn), 'SQL：名次算法跟 MF_get_top／MF_get_overtaken 一樣（rank_key、達成時間、id）');
  ok(/MF_get_my_ranks/.test(rd('js/leaderboard.js')), 'leaderboard.js 呼叫 MF_get_my_ranks');

  console.log((bad ? bad + ' FAIL / ' : '') + total + ' checks');
  console.log(bad ? 'SOME FAILED' : 'ALL PASS');
  process.exit(bad ? 1 : 0);
})();
