/* 假的排行榜資料庫（只在瀏覽器裡測畫面時用，不會被任何頁面載入）。
   用法（在 reaction.html?game=任何一款 的 F12 主控台貼上，或請 Claude 的瀏覽器工具注入）：
     fetch('/test/leaderboard/fake_backend.js').then(r => r.text()).then(t => (0, eval)(t))
   它會把 window.fetch 換成一個「假 Supabase」：行為跟 supabase/MF_leaderboard.sql 的三個函式一樣
   （前 30 名、每人每款一筆、嚴格更好才更新、同分先到先贏、超出範圍就拒絕），資料只存在這一頁的記憶體裡，重新整理就消失。
   好處：還沒執行 SQL、沒有網路、或不想弄髒真的排行榜，也能把整個流程（榜單、暱稱、進榜煙火、離線）玩過一遍。
   全部 50 款遊戲通用：每款遊戲的規格（越小／越大越好、合理範圍）直接讀這一頁遊戲檔案登記的 score 設定，
   第一次用到那款遊戲時才自動生出 34 筆假成績（滿榜後只留前 30）。
   控制：
     __fake.mode = 'down'（模擬沒網路）／'ok'；   __fake.latency = 延遲毫秒；
     __fake.calls = 呼叫紀錄；                       __fake.db = 資料（{遊戲id: [{pid, nick, score, t}]}）；
     __fake.seed('cake', 5)  把某款遊戲重設成只有 5 筆（0＝空榜單，34＝滿榜）；
     __fake.board('cake')    看某款遊戲目前的前 30 名。 */
(function () {
    var NAMES = ['快樂阿嬤', '小明', '王大同', '愛爬山的快樂老李', 'Amy', '阿花', '林美玲', '陳志明', '開心花', 'Lucy', '老王', '小美', '阿嬤的孫子', '呂布', '張三', '李四', '王五', '趙六', '錢七', '孫八', '周九', '吳十', '鄭十一', '王十二', '馮十三', '陳十四', '褚十五', '衛十六', '蔣十七', '沈十八', '韓十九', '楊二十'];
    var db = {};                     /* 每款遊戲各自一份假資料，第一次用到才建立 */
    var clock = 1000, calls = [];
    var F = { mode: 'ok', latency: 150, calls: calls, db: db };

    /* 這款遊戲的規格：讀這一頁已經登記的遊戲（跟真資料庫的 MF_games 是同一份資料來源）；沒有 score 設定的遊戲回 null */
    function specOf(g) {
        var list = (window.Reaction && Reaction.list && Reaction.list()) || [];
        for (var i = 0; i < list.length; i++) if (list[i].id === g && list[i].score) return list[i].score;
        return null;
    }
    function key(g, s) { return specOf(g).better === 'min' ? s : -s; }
    function sorted(g) { return ensure(g).slice().sort(function (a, b) { return key(g, a.score) - key(g, b.score) || a.t - b.t; }); }
    function prune(g) { db[g] = sorted(g).slice(0, 30); }

    /* 第 i 筆（0 是最好）假成績：落在這款遊戲的合法範圍內、而且大小「像真的玩家」（不是貼著範圍的邊） */
    function seedScore(sp, i) {
        var v;
        if (sp.better === 'max') {
            var top = Math.min(sp.max, Math.max(sp.min + 8, sp.max * 0.12));
            v = Math.max(sp.min, top * (1 - i * 0.027));
        } else {
            var span = (sp.max - sp.min) * 0.02;
            v = sp.min + span * (0.01 + i / 34 * 0.99);
        }
        var d = sp.decimals === 0 ? 0 : 4, p = Math.pow(10, d);
        return Math.min(sp.max, Math.max(sp.min, Math.round(v * p) / p));
    }
    function seed(g, n) {
        var sp = specOf(g);
        db[g] = [];
        for (var i = 0; i < n; i++) db[g].push({ pid: 'seed-' + i, nick: NAMES[i % NAMES.length], score: seedScore(sp, i), t: clock++ });
        prune(g);
    }
    function ensure(g) { if (!db[g]) seed(g, 34); return db[g]; }

    function board(g, pid) {
        return { game_id: g, better: specOf(g).better, limit: 30, top: sorted(g).slice(0, 30).map(function (r, i) { return { rank: i + 1, nick: r.nick, score: r.score, mine: r.pid === pid }; }) };
    }
    function clean(n) { return Array.from(String(n || '').replace(/\s+/g, ' ').trim()).slice(0, 8).join(''); }
    function respond(obj, ms) { return new Promise(function (res) { setTimeout(function () { res({ ok: true, status: 200, json: function () { return Promise.resolve(obj); } }); }, ms); }); }
    window.__realFetch = window.__realFetch || window.fetch;
    window.fetch = function (url, opt) {
        if (String(url).indexOf('/rest/v1/rpc/MF_') < 0) return window.__realFetch(url, opt);
        var name = String(url).split('/rpc/')[1], b = JSON.parse(opt.body);
        calls.push({ name: name, body: b, at: Date.now() });
        if (F.mode === 'down') return new Promise(function (_, rej) { setTimeout(function () { rej(new TypeError('Failed to fetch')); }, F.latency); });
        if (name === 'MF_get_top') return respond(specOf(b.p_game_id) ? board(b.p_game_id, b.p_player_id) : null, F.latency);
        if (name === 'MF_rename_player') {
            var nn = clean(b.p_nickname), c = 0;
            Object.keys(db).forEach(function (g) { db[g].forEach(function (r) { if (r.pid === b.p_player_id) { r.nick = nn; c++; } }); });
            return respond({ ok: true, rows: c }, F.latency);
        }
        if (name === 'MF_submit_score') {
            var g = b.p_game_id, sp = specOf(g);
            if (!sp) return respond({ ok: false, error: 'unknown_game' }, F.latency);
            var s = Math.round(b.p_score * 10000) / 10000, nick = clean(b.p_nickname);
            if (s < sp.min || s > sp.max) return respond({ ok: false, error: 'out_of_range' }, F.latency);
            var rows0 = ensure(g);
            var old = rows0.filter(function (r) { return r.pid === b.p_player_id; })[0], saved = false;
            if (old) { if (key(g, s) < key(g, old.score)) { old.score = s; old.nick = nick; old.t = clock++; saved = true; } else old.nick = nick; }
            else {
                var rows = sorted(g);
                if (rows.length < 30 || key(g, s) < key(g, rows[rows.length - 1].score)) { db[g].push({ pid: b.p_player_id, nick: nick, score: s, t: clock++ }); saved = true; prune(g); }
            }
            var me = sorted(g).map(function (r) { return r.pid; }).indexOf(b.p_player_id);
            var out = board(g, b.p_player_id); out.ok = true; out.saved = saved; out.rank = me >= 0 ? me + 1 : null;
            return respond(out, F.latency);
        }
        return respond(null, 10);
    };
    F.seed = seed;
    F.board = function (g) { return board(g, null).top; };
    window.__fake = F;
    /* 清掉這支瀏覽器上的排行榜資料（暱稱、玩家代號、待送成績、榜單快取）與「目前這款遊戲」的最佳紀錄，模擬「第一次來」；
       不碰其他遊戲的最佳紀錄，萬一貼在自己平常玩的瀏覽器上也不會洗掉別款的紀錄 */
    var curId = window.Reaction && Reaction.current && Reaction.current.id, bestKey = 'fm.reaction.best.' + curId;
    Object.keys(localStorage).filter(function (k) { return k.indexOf('fm.lb.') === 0 || (curId && (k === bestKey || k.indexOf(bestKey + '.') === 0)); }).forEach(function (k) { localStorage.removeItem(k); });
    if (window.Leaderboard) { var st = Leaderboard.test.state; st.boards = {}; st.inflight = {}; st.netDownUntil = 0; st.nickPromise = null; st.nickSkipped = false; }
    return 'fake server ready（全部遊戲通用，第一次用到才生出假成績）';
})();
