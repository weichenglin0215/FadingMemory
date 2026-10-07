/* ═══════════════════════════════════════════════════════════════════
   leaderboard.js — 秒反應「世界排行榜」核心（資料、網路、判斷；不含畫面）
   ───────────────────────────────────────────────────────────────────
   【這個檔案做什麼】
   · 每款遊戲結束時呼叫 Leaderboard.submit(遊戲id, 成績)：
       1. 玩家還沒有暱稱 → 請 js/leaderboard_ui.js 跳出「輸入暱稱」彈窗（暱稱存在這支瀏覽器）；
       2. 拿「進場時就抓好的前 30 名」跟這次成績比，看有沒有機會進榜——
          明顯進不了榜就「完全不連網」（省流量、省資料庫）；
       3. 有機會才呼叫資料庫函式 MF_submit_score，由資料庫「最後裁定」並回傳最新榜單；
       4. 真的進榜 → 請 UI 放「恭喜＋煙火＋歡呼音樂」。
   · 進場時 Leaderboard.prefetch(遊戲) 先把該款遊戲的前 30 名抓回來存著，
     玩家看完玩法說明、按下一步時，榜單通常已經在手上，不用等網路。
   · 沒網路、連線逾時都不會影響遊戲：成績先存在這支手機，下次開頁面時補送。

   【為什麼不用 supabase-js（官方 SDK）】
   LoveIsABitMessy 是用 SDK（createClient）。這裡改成直接用 fetch 呼叫同一個 Supabase
   專案的 REST 介面（SDK 底層做的也是這件事），原因有三：
     1. 少載一個約 40KB（壓縮後）的外部 JS，頁面開得快，也少一個 CDN 當掉的風險；
     2. SDK 會讀寫瀏覽器 localStorage 裡的「登入狀態」（sb-…-auth-token）。
        如果 LoveIsABitMessy 與本遊戲放在同一個網域（例如都在 xxx.github.io 底下），
        兩邊會共用同一份 localStorage，SDK 可能會把管理者的登入狀態讀走或洗掉；
        直接用 fetch 只帶 anon key，完全不碰登入狀態，兩個專案互不影響；
     3. 這裡只需要呼叫兩個函式，用 fetch 只要約 20 行。

   【資料流（網路效能設計）】
     進場：1 次讀取（約 2KB）→ 存在記憶體與 localStorage（60 秒內再進同一款遊戲不重抓）
     結束：先在本機判斷能不能進榜 → 不能就 0 次連線；可以才 1 次寫入，
           寫入的回應裡「直接附上最新榜單」，所以寫完不用再多讀一次。
     重送同一筆成績是安全的（資料庫只在「嚴格更好」時才會更新），所以失敗時放心重試。

   【每款遊戲怎麼接上來】（以零秒出手為例，見 js/reaction_speed.js）
     1. 在 Reaction.register({...}) 加一個 score 設定：
          score: { better: 'min', decimals: 4, format: '{v} 秒', label: '與 0 秒的差', min: 0, max: 60 }
        better：'min'＝越小越好、'max'＝越大越好；decimals：成績小數位數（整數型填 0）；
        format：成績怎麼顯示，{v} 會換成數字；label：榜單成績欄的小標；
        min／max：合理範圍（要跟資料庫 MF_games 那一列一致，見 supabase/MF_leaderboard.sql）。
     2. 小數型成績：結算時用 Leaderboard.fake4(數字) 產生「最終成績」（見下面的說明），
        之後顯示、存最佳紀錄、送排行榜全部用同一個數字。
     3. 結算時送成績：用共用的 kit.result 顯示結算卡片的遊戲，在 kit.result 的設定裡多給一行
        score: 最終成績，卡片出現之後就會自動送（時機正確、不會漏）；自己畫結算卡片的遊戲
        （神準落下、不可能任務等）在卡片加進畫面「之後」呼叫 Leaderboard.submit(ID, 最終成績)。
        ★ 只送「真的算成績」的結果：越小越好的遊戲，失敗時算出來的數字可能很小（例如不可能任務摔到警戒線＝0 公分），
          一定要先判斷成功再送，不能只靠 min～max 範圍擋（範圍只擋「明顯不可能」的數字）。
     4. 資料庫 MF_games 要有這款遊戲那一列（better／min／max 要一致）：
        執行 node test/leaderboard/gen_games_sql.cjs --write，會從全部遊戲檔案重新產生
        supabase/MF_leaderboard.sql 裡的登記列；再到 Supabase 的 SQL Editor 重新執行整份 SQL（可重複執行）。
        （test/reaction/t_leaderboard.js 會檢查兩邊是否一致，忘了做測試會失敗。）
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    /* ═══ 設定（要改就改這裡） ═══
       URL／KEY：Supabase 專案網址與 anon（公開）金鑰，跟 LoveIsABitMessy 是同一個專案
       （見 LoveIsABitMessy/web/js/supabaseClient.js）。anon key 本來就設計成可以公開放在
       網頁裡，真正的保護是資料庫端的 RLS 與函式（見 supabase/MF_leaderboard.sql）。
       ★ 絕對不要把 service_role 金鑰放進任何網頁程式碼。 */
    var CFG = {
        URL: 'https://tpdznlutkzeficitudac.supabase.co',
        KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwZHpubHV0a3plZmljaXR1ZGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMzI2NTMsImV4cCI6MjA5MTgwODY1M30.Cid4HYePpAHA0oYffdm_5ZlthWt_nyAPpFjFcy4hsik',
        NICK_MAX: 8,                 /* 暱稱最多幾個字（資料庫函式裡的 c_nick_len 也是 8，兩邊要一致） */
        LIMIT_DEFAULT: 30,           /* 榜單預設保留幾名（實際以資料庫回傳的 limit 為準） */
        CACHE_TTL_MS: 60 * 1000,     /* 榜單快取多久之內不重抓：越短越即時、越長越省流量 */
        READ_TIMEOUT_MS: 8000,       /* 讀榜單最多等幾毫秒（逾時就當作連不上） */
        WRITE_TIMEOUT_MS: 10000,     /* 寫成績最多等幾毫秒 */
        OFFLINE_COOLDOWN_MS: 60000   /* 連線失敗後，這段時間內不再嘗試連線（成績先存著，之後補送） */
    };

    /* localStorage 的 key（全部用 fm.lb. 開頭，不會跟 fm.reaction.best.* 或 LoveIsABitMessy 的資料混在一起） */
    var KEY_PID = 'fm.lb.pid';           /* 這支瀏覽器的隨機玩家代號（不是帳號） */
    var KEY_NICK = 'fm.lb.nick';         /* 暱稱 */
    var KEY_PENDING = 'fm.lb.pending';   /* 還沒送出的成績：{ 遊戲id: {score, nick, at} } */
    var KEY_BOARD = 'fm.lb.board.';      /* 榜單快取：fm.lb.board.<遊戲id> */

    var Leaderboard = {};

    /* ═══════════════════════════════════════════════════════════════
       一、純函式（不碰網路、不碰畫面，Node 測試直接呼叫：見 test/reaction/t_leaderboard.js）
       ═══════════════════════════════════════════════════════════════ */

    /* 偽造到小數點後 4 位：回傳「小數 4 位、而且第 3、4 位都不是 0」的數字。
       用意（使用者的要求）：讓玩家覺得分數非常精確，產生更強烈的挑戰感——
       「1.2300」看起來像四捨五入過，「1.2347」看起來像真的量到 0.1 毫秒。
       做法：
         1. 先把數字換成「以 0.0001 為單位的整數」n（不直接用小數運算，避免 0.1+0.2 這種浮點誤差）；
         2. 取出 n 的個位（＝小數第 4 位）與十位（＝小數第 3 位）；
         3. 哪一位是 0，就換成 1～9 的隨機數字（只動那一位，其他位數照原樣）。
       注意：
         · 這是「顯示用的假精度」：換上去的數字只是亂數，最多讓成績差 0.0099（第 3 位補 9、第 4 位補 9）。
         · 真正的 0（完全精準、毫無誤差）不偽造，維持 0，不然「完美」會變成 0.0xyz。
         · 只在「結算那一刻」呼叫一次，之後畫面、最佳紀錄、排行榜都用回傳的同一個數字；
           不要每次顯示都重新呼叫，不然同一個成績會看到不同的尾數。
       rand：可以傳入自己的亂數函式（測試用），預設 Math.random。 */
    function fake4(v, rand) {
        rand = rand || Math.random;
        var sign = v < 0 ? -1 : 1;
        var n = Math.round(Math.abs(v) * 10000);
        if (!isFinite(n)) return v;
        if (n === 0) return 0;
        var d4 = n % 10;                       /* 小數第 4 位 */
        var d3 = Math.floor(n / 10) % 10;      /* 小數第 3 位 */
        if (d4 === 0) n += 1 + Math.floor(rand() * 9);
        if (d3 === 0) n += 10 * (1 + Math.floor(rand() * 9));
        return sign * n / 10000;
    }

    /* 把數字轉成固定小數位數的字串（decimals 是 0 就是整數字串）；group 為 true 時整數部分加千分位逗號（例如 117,681） */
    function fmtNum(v, decimals, group) {
        var s = Number(v).toFixed(decimals || 0);
        if (group) s = s.replace(/^(-?\d+)/, function (m) { return m.replace(/\B(?=(\d{3})+(?!\d))/g, ','); });
        return s;
    }

    /* 依遊戲的 score 設定，把成績轉成要顯示的文字（例如 '{v} 秒' → '0.1237 秒'、'第 {v} 關' → '第 21 關'） */
    function fmt(spec, v) {
        return String((spec && spec.format) || '{v}').replace('{v}', fmtNum(v, spec && spec.decimals, spec && spec.group));
    }

    /* a 是不是「嚴格」比 b 好（better：'min'＝越小越好、'max'＝越大越好） */
    function isBetter(a, b, better) {
        return better === 'min' ? a < b : a > b;
    }

    /* 暱稱清理：去掉控制字元、零寬字元、文字方向控制字元，連續空白變一個空格，
       去頭尾空白，最多 CFG.NICK_MAX 個「字」。
       用 Array.from 切字（不是 slice）：emoji 或少見的漢字在 JavaScript 字串裡佔兩個單位，
       直接 slice 可能把一個字切成兩半變亂碼。 */
    function cleanNick(raw) {
        var s = String(raw == null ? '' : raw)
            .replace(/[\u{0}-\u{1f}\u{7f}-\u{9f}\u{200b}-\u{200f}\u{2028}-\u{202e}\u{2060}-\u{2064}\u{feff}]+/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return Array.from(s).slice(0, CFG.NICK_MAX).join('').trim();
    }

    /* 這次成績有沒有機會進榜？（只是「在本機先篩一下」，最後以資料庫為準）
       board：之前抓到的榜單（可能是 null＝不知道）；score：這次成績；better：'min' 或 'max'。
       · 不知道榜單 → true（交給資料庫判斷）。
       · 榜上已經有「我」的紀錄 → 必須比我自己的紀錄「嚴格更好」才有意義（沒更好就不用送）。
       · 榜上不到 limit 名 → 一定進得去。
       · 榜滿了 → 要「嚴格」勝過最後一名（同分的話先達成的人排前面，後到的擠不掉）。
       榜單的最後一名只會越來越強（成績只會被更好的取代），所以就算手上的榜單有點舊，
       這個判斷也只會「多送」、不會「錯擋」。 */
    function qualifies(board, score, better) {
        if (!board || !board.top) return true;
        var rows = board.top;
        var limit = board.limit || CFG.LIMIT_DEFAULT;
        for (var i = 0; i < rows.length; i++) {
            if (rows[i].mine) return isBetter(score, rows[i].score, better);
        }
        if (rows.length < limit) return true;
        return isBetter(score, rows[rows.length - 1].score, better);
    }

    /* 產生隨機玩家代號（UUID v4）。優先用瀏覽器內建的 crypto.randomUUID，
       舊瀏覽器退回 getRandomValues，再不行才用 Math.random。 */
    function newUuid() {
        try { if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID(); } catch (e) { }
        var b = new Array(16), i;
        try {
            var u = new Uint8Array(16);
            global.crypto.getRandomValues(u);
            for (i = 0; i < 16; i++) b[i] = u[i];
        } catch (e) {
            for (i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
        }
        b[6] = (b[6] & 0x0f) | 0x40;      /* 版本 4 */
        b[8] = (b[8] & 0x3f) | 0x80;      /* 變體 */
        var hex = b.map(function (x) { return (x + 256).toString(16).slice(1); }).join('');
        return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
    }

    /* ═══════════════════════════════════════════════════════════════
       二、狀態與小工具
       ═══════════════════════════════════════════════════════════════ */

    /* state：這一頁（reaction.html）執行期間的暫存資料
       boards：各款遊戲目前手上的榜單 { id: board }；inflight：正在抓的請求（避免同一款重複抓）；
       netDownUntil：連線失敗後，這個時間之前不再嘗試；nickPromise：正在問暱稱的 Promise；
       nickSkipped：玩家按了「先不要」，這一頁就不再追問。 */
    var state = { boards: {}, inflight: {}, netDownUntil: 0, nickPromise: null, nickSkipped: false };

    function log() {
        if (global.console && console.log) console.log.apply(console, ['[排行榜]'].concat([].slice.call(arguments)));
    }

    function store() { return global.UI.store; }

    /* 找出遊戲物件：可以傳 id 字串，也可以傳 Reaction.register 登記的遊戲物件 */
    function resolveGame(ref) {
        if (ref && typeof ref === 'object') return ref;
        var list = (global.Reaction && Reaction.list && Reaction.list()) || [];
        for (var i = 0; i < list.length; i++) if (list[i].id === ref) return list[i];
        return null;
    }

    /* 這款遊戲有沒有接排行榜（有 score 設定才有） */
    function supports(ref) {
        var g = resolveGame(ref);
        return !!(g && g.score && g.score.better);
    }

    /* 玩家代號：第一次用到才產生，之後固定存在 localStorage */
    function getPid() {
        var pid = store().get(KEY_PID, null);
        if (!pid || typeof pid !== 'string') {
            pid = newUuid();
            store().set(KEY_PID, pid);
        }
        return pid;
    }

    function getNick() {
        var n = store().get(KEY_NICK, '');
        return typeof n === 'string' ? cleanNick(n) : '';
    }

    /* 設定暱稱：存到瀏覽器，並（盡力）通知資料庫把這位玩家已上榜的名字一起換掉。
       換名字失敗也沒關係：下次這位玩家刷新成績時，資料庫會順便用新暱稱更新。 */
    function setNick(raw) {
        var n = cleanNick(raw);
        if (!n) return '';
        store().set(KEY_NICK, n);
        rpc('MF_rename_player', { p_player_id: getPid(), p_nickname: n }, CFG.WRITE_TIMEOUT_MS)
            .then(function (r) { log('改暱稱', n, r.ok ? '已同步到資料庫' : '（連不上，先只存在本機）'); });
        return n;
    }

    /* ═══════════════════════════════════════════════════════════════
       三、網路：呼叫 Supabase 的 RPC（資料庫函式）
       ═══════════════════════════════════════════════════════════════ */

    /* 呼叫資料庫函式。永遠不會丟例外，結果一律是下面兩種之一：
         { ok: true,  data: 函式回傳的 JSON }
         { ok: false, error: 'timeout' | 'network' | 'http_4xx/5xx' | ... }
       · AbortController：逾時就中止請求，不讓玩家一直等。
       · 沒有用 fetch 的 keepalive 選項：它搭配跨網域的預檢請求（CORS preflight）在部分瀏覽器不支援。
         「玩家剛送出就離開頁面」的情況改由 submit() 的「先寫入待送佇列、收到答覆才刪」處理。 */
    function rpc(name, args, timeoutMs) {
        if (!global.fetch) return Promise.resolve({ ok: false, error: 'nofetch' });
        var ctl = global.AbortController ? new global.AbortController() : null;
        var timer = ctl ? global.setTimeout(function () { ctl.abort(); }, timeoutMs) : null;
        var t0 = Date.now();
        return global.fetch(CFG.URL + '/rest/v1/rpc/' + name, {
            method: 'POST',
            headers: { 'apikey': CFG.KEY, 'Authorization': 'Bearer ' + CFG.KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify(args),
            signal: ctl ? ctl.signal : undefined
        }).then(function (res) {
            return res.json().then(function (data) {
                return res.ok ? { ok: true, data: data } : { ok: false, error: 'http_' + res.status, detail: data };
            }, function () { return { ok: false, error: 'badjson' }; });
        }).catch(function (e) {
            return { ok: false, error: (e && e.name === 'AbortError') ? 'timeout' : 'network' };
        }).then(function (r) {
            if (timer) global.clearTimeout(timer);
            r.ms = Date.now() - t0;
            return r;
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       四、榜單：讀取與快取
       ═══════════════════════════════════════════════════════════════ */

    /* 把資料庫回傳的榜單存起來（記憶體＋localStorage），之後都從這裡拿 */
    function putBoard(id, data) {
        var b = { id: id, better: data.better, limit: data.limit || CFG.LIMIT_DEFAULT, top: data.top || [], at: Date.now(), stale: false };
        state.boards[id] = b;
        store().set(KEY_BOARD + id, { at: b.at, data: { better: b.better, limit: b.limit, top: b.top } });
        return b;
    }

    /* 讀 localStorage 裡的榜單快取（沒有或壞掉回傳 null） */
    function diskBoard(id) {
        var d = store().get(KEY_BOARD + id, null);
        if (!d || !d.data || !d.data.top) return null;
        return { id: id, better: d.data.better, limit: d.data.limit || CFG.LIMIT_DEFAULT, top: d.data.top, at: d.at || 0, stale: false };
    }

    /* 手上目前的榜單（同步，不連網；可能是 null） */
    function cachedBoard(id) {
        return state.boards[id] || diskBoard(id);
    }

    /* 讀取某款遊戲的榜單，回傳 Promise（一定 resolve，不會 reject）：
         · 快取還新鮮（CACHE_TTL_MS 之內）→ 直接用，不連網；
         · 否則連網抓；同一款遊戲同時有多個人要，只會真的連一次；
         · 連不上 → 有舊快取就用舊的（board.stale = true），完全沒有就回傳 null。
       opts.force：不管快取，強制重抓。 */
    function load(ref, opts) {
        opts = opts || {};
        var g = resolveGame(ref);
        if (!g || !supports(g)) return Promise.resolve(null);
        var id = g.id, now = Date.now();
        if (!opts.force) {
            var fresh = state.boards[id] || diskBoard(id);
            if (fresh && now - fresh.at < CFG.CACHE_TTL_MS) {
                state.boards[id] = fresh;
                return Promise.resolve(fresh);
            }
        }
        if (state.inflight[id]) return state.inflight[id];
        if (now < state.netDownUntil) return Promise.resolve(cachedBoardStale(id));
        var p = rpc('MF_get_top', { p_game_id: id, p_player_id: getPid() }, CFG.READ_TIMEOUT_MS).then(function (r) {
            delete state.inflight[id];
            if (r.ok && r.data && r.data.top) {
                var b = putBoard(id, r.data);
                log('讀到榜單', id, '共', b.top.length, '名', '（' + r.ms + ' ms）');
                return b;
            }
            if (r.ok) {
                log('資料庫沒有登記這款遊戲：', id, '→ 請確認 MF_games 裡有這一列');
                return null;
            }
            if (r.error !== 'http_404') state.netDownUntil = Date.now() + CFG.OFFLINE_COOLDOWN_MS;
            log('讀不到榜單', id, r.error, '→ 改用舊快取' + (cachedBoardStale(id) ? '' : '（沒有，榜單暫時空白）'));
            return cachedBoardStale(id);
        });
        state.inflight[id] = p;
        return p;
    }

    /* 連不上網路時用的「舊榜單」：標記 stale，畫面可以提示「這是舊資料」 */
    function cachedBoardStale(id) {
        var b = state.boards[id] || diskBoard(id);
        if (!b) return null;
        b.stale = true;
        return b;
    }

    /* 進場時呼叫：先把榜單抓回來放著（不等結果，也不顯示任何東西） */
    function prefetch(ref) {
        return load(ref);
    }

    /* ═══════════════════════════════════════════════════════════════
       五、送出成績
       ═══════════════════════════════════════════════════════════════ */

    /* 還沒送出去的成績（連不上網路時）：每款遊戲只留最好的一筆 */
    function savePending(id, nick, score, better) {
        var p = store().get(KEY_PENDING, {}) || {};
        var cur = p[id];
        if (!cur || isBetter(score, cur.score, better)) p[id] = { score: score, nick: nick, at: Date.now() };
        store().set(KEY_PENDING, p);
    }

    /* 補送之前沒送出去的成績。資料庫有給出明確答覆（不管收不收）就刪掉那一筆；連線失敗就留著，下次再說。 */
    function flushPending() {
        var p = store().get(KEY_PENDING, {}) || {};
        var ids = Object.keys(p);
        if (!ids.length || !getNick()) return Promise.resolve();
        var i = 0;
        function next() {
            if (i >= ids.length) { store().set(KEY_PENDING, p); return Promise.resolve(); }
            var id = ids[i++], it = p[id];
            return rpc('MF_submit_score', { p_game_id: id, p_player_id: getPid(), p_nickname: getNick() || it.nick, p_score: it.score }, CFG.WRITE_TIMEOUT_MS)
                .then(function (r) {
                    if (!r.ok && r.error !== 'http_400' && r.error !== 'http_404') {
                        store().set(KEY_PENDING, p);
                        log('補送失敗（', r.error, '），下次再試');
                        return null;                         /* 連不上就先停，不要連續失敗好幾次 */
                    }
                    log('補送成績', id, it.score, r.ok && r.data ? (r.data.saved ? '→ 已進榜' : '→ 沒有進榜') : '→ 被資料庫拒絕');
                    if (r.ok && r.data && r.data.top) putBoard(id, r.data);
                    delete p[id];
                    return next();
                });
        }
        return next();
    }

    /* 問暱稱（有就直接回傳；沒有就請 UI 跳彈窗）。回傳 Promise<暱稱或 ''>。
       · 玩家按「先不要」→ 這一頁不再追問（回傳 ''），下一次開遊戲頁面才會再問。
       · 延遲 700 毫秒才跳彈窗：讓玩家先看到結算畫面與過關音效，再被打斷。 */
    function ensureNick() {
        var n = getNick();
        if (n) return Promise.resolve(n);
        if (state.nickSkipped || !Leaderboard.ui || !Leaderboard.ui.askNickname) return Promise.resolve('');
        if (state.nickPromise) return state.nickPromise;
        state.nickPromise = global.UI.wait(700).then(function () {
            return Leaderboard.ui.askNickname();
        }).then(function (name) {
            state.nickPromise = null;
            var c = name ? setNick(name) : '';
            if (!c) state.nickSkipped = true;
            return c;
        });
        return state.nickPromise;
    }

    /* 現在畫面上有沒有結算卡片（reaction.js 提供）。沒有＝玩家已經開始下一局，不要再彈大視窗打斷他 */
    function resultShowing() {
        return global.Reaction && global.Reaction.resultShowing ? global.Reaction.resultShowing() : true;
    }

    /* 遊戲結束時呼叫。value 是這一局的最終成績（要跟畫面上顯示的是同一個數字）。
       回傳 Promise，resolve 一個 { status } 物件（status：skip／no-nick／not-qualified／offline／rejected／saved／not-saved），
       遊戲本身不需要等它，也不需要處理它——整個過程失敗最多就是榜上沒有這一筆，不會影響遊戲。 */
    function submit(ref, value) {
        var g = resolveGame(ref);
        if (!supports(g) || typeof value !== 'number' || !isFinite(value)) return Promise.resolve({ status: 'skip' });
        var spec = g.score, id = g.id;
        var score = Math.round(value * 10000) / 10000;
        log('結算', g.name, '成績', fmt(spec, score), '（原始數字 ' + score + '）');
        /* 超出這款遊戲 score.min～max 的成績不送（例如 0 關、沒成功的不可能任務）：
           資料庫也會用同一個範圍擋掉，在這裡先擋可以省一次連線，而且不會問暱稱 */
        if (typeof spec.min === 'number' && score < spec.min || typeof spec.max === 'number' && score > spec.max) {
            log('成績不在這款遊戲的有效範圍（' + spec.min + '～' + spec.max + '）→ 不送排行榜');
            return Promise.resolve({ status: 'skip' });
        }
        return ensureNick().then(function (nick) {
            if (!nick) { log('沒有暱稱，這次不送排行榜'); return { status: 'no-nick' }; }
            var board = cachedBoard(id);
            var can = qualifies(board, score, spec.better);
            log('本機判斷', can ? '有機會進榜 → 送出' : '進不了榜 → 不連網', board ? '（手上榜單 ' + board.top.length + ' 名）' : '（手上沒有榜單）');
            if (!can) return { status: 'not-qualified' };
            if (Date.now() < state.netDownUntil) {
                savePending(id, nick, score, spec.better);
                log('剛剛連線失敗過，成績先存在本機');
                return { status: 'offline' };
            }
            /* 先寫進待送佇列再連網（寫在前面）：就算玩家這時按「返回」離開頁面、請求被中斷，
               下次開頁面也會補送；收到資料庫的明確答覆之後才把它刪掉。重送是安全的。 */
            savePending(id, nick, score, spec.better);
            return rpc('MF_submit_score', { p_game_id: id, p_player_id: getPid(), p_nickname: nick, p_score: score }, CFG.WRITE_TIMEOUT_MS)
                .then(function (r) {
                    if (!r.ok) {
                        state.netDownUntil = Date.now() + CFG.OFFLINE_COOLDOWN_MS;
                        log('送出失敗（', r.error, '），成績先存在本機，下次補送');
                        if (Leaderboard.ui && Leaderboard.ui.toast) Leaderboard.ui.toast('連不上排行榜，成績先記在這支手機，下次連線時補送');
                        return { status: 'offline' };
                    }
                    /* 收到資料庫的明確答覆（不管收不收這筆）：待送佇列裡「不比這筆好」的紀錄就可以刪了。
                       被拒絕的成績重送也一樣會被拒絕，留著只會每次開頁面白白重試。 */
                    var pend = (store().get(KEY_PENDING, {}) || {});
                    if (pend[id] && !isBetter(pend[id].score, score, spec.better)) { delete pend[id]; store().set(KEY_PENDING, pend); }
                    var d = r.data;
                    if (!d || d.ok === false) {
                        log('資料庫拒絕這筆成績：', d && d.error, '→ 請確認 MF_games 的設定（範圍、遊戲代號）');
                        return { status: 'rejected', error: d && d.error };
                    }
                    putBoard(id, d);
                    log('資料庫回覆：', d.saved ? '已進榜，名次 ' + d.rank : '沒有進榜', '（' + r.ms + ' ms）');
                    if (d.saved) {
                        var info = { game: g, spec: spec, score: score, rank: d.rank, board: state.boards[id] };
                        if (Leaderboard.ui) {
                            if (resultShowing() && Leaderboard.ui.celebrate) Leaderboard.ui.celebrate(info);
                            else if (Leaderboard.ui.toast) Leaderboard.ui.toast('上一局進榜了！世界第 ' + d.rank + ' 名');
                        }
                        return { status: 'saved', rank: d.rank };
                    }
                    return { status: 'not-saved' };
                });
        });
    }

    /* 頁面載入時呼叫一次：稍等一下（不跟進場的榜單讀取搶頻寬）再補送沒送出去的成績 */
    function init() {
        global.UI.wait(1500).then(flushPending);
    }

    /* ═══════════════════════════════════════════════════════════════
       六、對外介面
       ═══════════════════════════════════════════════════════════════ */
    Leaderboard.CFG = CFG;
    Leaderboard.fake4 = fake4;
    Leaderboard.fmt = fmt;
    Leaderboard.fmtNum = fmtNum;
    Leaderboard.isBetter = isBetter;
    Leaderboard.supports = supports;
    Leaderboard.load = load;
    Leaderboard.cached = cachedBoard;
    Leaderboard.prefetch = prefetch;
    Leaderboard.submit = submit;
    Leaderboard.getNick = getNick;
    Leaderboard.setNick = setNick;
    Leaderboard.cleanNick = cleanNick;
    Leaderboard.init = init;
    Leaderboard.ui = null;       /* js/leaderboard_ui.js 載入後會把畫面功能掛在這裡 */
    /* 給 Node 測試用的內部函式與狀態 */
    Leaderboard.test = {
        fake4: fake4, fmt: fmt, isBetter: isBetter, qualifies: qualifies, cleanNick: cleanNick, newUuid: newUuid,
        state: state, rpc: rpc, putBoard: putBoard, savePending: savePending, flushPending: flushPending,
        KEY_PID: KEY_PID, KEY_NICK: KEY_NICK, KEY_PENDING: KEY_PENDING, KEY_BOARD: KEY_BOARD
    };

    global.Leaderboard = Leaderboard;
})(window);
