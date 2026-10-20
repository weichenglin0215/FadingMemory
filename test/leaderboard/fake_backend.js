/* 假的排行榜資料庫（只在瀏覽器裡測畫面時用，不會被任何頁面載入）。
   用法（在 reaction.html?game=任何一款 的 F12 主控台貼上，或請 Claude 的瀏覽器工具注入）：
     fetch('/test/leaderboard/fake_backend.js').then(r => r.text()).then(t => (0, eval)(t))
   它會把 window.fetch 換成一個「假 Supabase」：行為跟 supabase/MF_leaderboard.sql 的函式一樣（簡化版）
   （前 30 名、每人每款一筆、嚴格更好才更新、同分先到先贏、超出範圍就拒絕；V1.35.0 起還有玩家身分：
    暱稱唯一、4 位數密碼、裝置憑證、舊玩家認領、同暱稱同密碼併入、連錯 5 次鎖 10 分鐘、改暱稱一天 2 次、個人最佳同步），
   資料只存在這一頁的記憶體裡，重新整理就消失。
   好處：還沒執行 SQL、沒有網路、或不想弄髒真的排行榜，也能把整個流程（榜單、帳號、進榜煙火、離線）玩過一遍。
   （真正的資料庫行為以 test/leaderboard/identity_sql_test.mjs 與 e2e_client_sql.mjs 為準；這個假的只負責讓畫面測試跑得動。）
   全部遊戲通用：每款遊戲的規格（越小／越大越好、合理範圍）直接讀這一頁遊戲檔案登記的 score 設定，
   第一次用到那款遊戲時才自動生出 34 筆假成績（滿榜後只留前 30）。
   貼上之後預設是「已登入、暱稱 測試」（跟 V1.34 的行為一樣，既有的瀏覽器測試不用改）。要測別的身分：
     __fake.guest()              變成訪客（沒有帳號）；
     __fake.loginAs('小花')       直接變成已登入（帳號會建在假資料庫裡）；
     __fake.legacyDevice('老玩家', { speed: 0.12 })   變成 V1.34 以前的舊玩家（有舊暱稱、榜上有成績、還沒設密碼）；
     __fake.accounts             假資料庫裡的帳號（{ pid: { nick, pin, tokens, … } }）；__fake.legacy 還沒認領的舊玩家；
     __fake.reserve('小明', 7)    把「小明」保留給另一位舊玩家 7 天。
   要「不清掉瀏覽器儲存、也不自動登入」（例如用 Page.addScriptToEvaluateOnNewDocument 在頁面載入前就換掉 fetch）：
     先設 window.__FAKE_OPTS = { keep: true }，再貼上本檔。
   控制：
     __fake.mode = 'down'（模擬沒網路）／'ok'；   __fake.latency = 延遲毫秒；
     __fake.calls = 呼叫紀錄；                       __fake.db = 資料（{遊戲id: [{pid, nick, score, t}]}）；
     __fake.seed('cake', 5)  把某款遊戲重設成只有 5 筆（0＝空榜單，34＝滿榜）；
     __fake.board('cake')    看某款遊戲目前的前 30 名。
   V1.25.0 起也模擬五星評價（MF_submit_rating／MF_get_ratings）與「阿嬤都比你厲害」（MF_get_overtaken），主選單頁也能用：
     __fake.seedRatings()   替每一款遊戲生出假的平均星數；__fake.ratings 這一頁送出的評價；
     __fake.overtaken = [ {game_id:'cake', rank:3, at:'2026-10-13T08:00:00Z'}, … ]  直接指定被超越的清單（不設就從假榜單算）。 */
(function () {
    var OPTS = window.__FAKE_OPTS || {};
    var NAMES = ['快樂阿嬤', '小明', '王大同', '愛爬山的快樂老李', 'Amy', '阿花', '林美玲', '陳志明', '開心花', 'Lucy', '老王', '小美', '阿嬤的孫子', '呂布', '張三', '李四', '王五', '趙六', '錢七', '孫八', '周九', '吳十', '鄭十一', '王十二', '馮十三', '陳十四', '褚十五', '衛十六', '蔣十七', '沈十八', '韓十九', '楊二十'];
    var db = {};                     /* 每款遊戲各自一份假資料，第一次用到才建立 */
    var clock = 1000, calls = [], tokenSeq = 1, pidSeq = 1;
    var F = { mode: 'ok', latency: 150, calls: calls, db: db, accounts: {}, legacy: {}, reservedKeys: {}, bests: {} };

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

    /* 榜上的暱稱一律用「玩家現在的暱稱」（帳號改名、舊玩家被自動改名，榜上立刻跟著變）：帳號與舊玩家各自有 nick */
    function nickOfRow(r) {
        if (F.accounts[r.pid]) return F.accounts[r.pid].nick;
        if (F.legacy[r.pid]) return F.legacy[r.pid].nick;
        return r.nick;
    }
    function board(g, pid) {
        return { game_id: g, better: specOf(g).better, limit: 30, top: sorted(g).slice(0, 30).map(function (r, i) { return { rank: i + 1, nick: nickOfRow(r), score: r.score, mine: r.pid === pid }; }) };
    }
    /* 暱稱清理：連續空白變一個、去頭尾、最多 8 個字 */
    var GARBAGE = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(8203) + '-' + String.fromCharCode(8207) + String.fromCharCode(8232) + '-' + String.fromCharCode(8238) + String.fromCharCode(8288) + '-' + String.fromCharCode(8292) + String.fromCharCode(65279) + ']', 'g');    /* 控制字元、零寬字元、文字方向控制字元（用編碼組出來，檔案裡不放看不見的字元） */
    function clean(n) { return Array.from(String(n || '').replace(GARBAGE, ' ').replace(/ +/g, ' ').trim()).slice(0, 8).join('').trim(); }
    /* 比對鍵：全形轉半形、小寫、去掉所有空白（跟 SQL 的 MF__nick_key 一樣的意思） */
    function nickKey(n) { return clean(n).normalize('NFKC').toLowerCase().replace(/\s+/g, ''); }
    var RESERVED_WORDS = ['管理員', '官方', '系統', '客服', '小編', '站長', 'admin', 'administrator', 'system', 'root', 'moderator', 'support'];
    function isReservedWord(k) { return RESERVED_WORDS.indexOf(k.replace(/[0-9]+$/, '')) >= 0; }
    function validPin(p) { return typeof p === 'string' && /^[0-9]{4}$/.test(p); }

    /* 遊戲代號合不合法：秒反應頁看遊戲檔案的 score 設定；主選單頁（沒有遊戲檔案）看選單的遊戲清單 */
    function validGame(g) {
        if (specOf(g)) return true;
        return !!(window.FMMenu && FMMenu.GAME_CELLS.some(function (c) { return c.id === g; }));
    }
    function taipeiDay() { return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); }
    /* 平均星數：{ id: [平均（小數 2 位）, 次數] }，跟 SQL 的 MF_get_ratings 同一個格式 */
    function ratingStats() {
        var sum = {};
        Object.keys(F.ratingBase).forEach(function (g) { sum[g] = { t: F.ratingBase[g].t, n: F.ratingBase[g].n }; });
        F.ratings.forEach(function (x) { sum[x.game] = sum[x.game] || { t: 0, n: 0 }; sum[x.game].t += x.stars; sum[x.game].n++; });
        var out = {};
        Object.keys(sum).forEach(function (g) { if (sum[g].n > 0) out[g] = [Math.round(sum[g].t / sum[g].n * 100) / 100, sum[g].n]; });
        return out;
    }
    /* 照 SQL 的 MF_get_overtaken：這位玩家在榜上、而且有人在他創紀錄「之後」才排到他前面（＝被超越）的遊戲；最近被超越的排前面 */
    function overtakenOf(pid) {
        var out = [];
        Object.keys(db).forEach(function (g) {
            var rows = sorted(g).slice(0, 30), i = rows.map(function (r) { return r.pid; }).indexOf(pid);
            if (i <= 0) return;
            var me = rows[i], later = rows.slice(0, i).filter(function (r) { return r.t > me.t; }).map(function (r) { return r.t; });
            if (!later.length) return;          /* 前面的人都比他早創紀錄：不算被超越 */
            out.push({ game_id: g, rank: i + 1, at: new Date(1.7e12 + Math.max.apply(null, later) * 1000).toISOString() });
        });
        return out.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)) || a.rank - b.rank; });
    }

    /* ═══ 玩家身分（簡化版）═══ */
    function newToken() { return 'fake-token-' + (tokenSeq++) + '-' + Math.random().toString(16).slice(2, 10); }
    function newPid() { var n = String(pidSeq++); return '00000000-0000-4000-8000-' + ('000000000000' + n).slice(-12); }
    /* 已建立帳號的人用了這個比對鍵嗎？回傳帳號的 pid */
    function accountByKey(k) { return Object.keys(F.accounts).filter(function (p) { return F.accounts[p].key === k; })[0] || null; }
    /* 這個比對鍵有沒有被「別的」尚未認領的舊玩家保留中 */
    function reservedBy(k, exceptPid) {
        var hit = Object.keys(F.legacy).filter(function (p) { return p !== exceptPid && F.legacy[p].key === k && F.legacy[p].reserved !== false; })[0];
        if (hit) return F.legacy[hit].until || new Date(Date.now() + 30 * 86400000).toISOString();
        if (F.reservedKeys[k]) return F.reservedKeys[k];
        return null;
    }
    function nickState(k, legacyPid) {
        if (accountByKey(k)) return 'taken';
        if (legacyPid && F.legacy[legacyPid] && F.legacy[legacyPid].key === k) return 'free';
        return reservedBy(k, legacyPid) ? 'reserved' : 'free';
    }
    function takenAnywhere(k) { return !!accountByKey(k) || Object.keys(F.legacy).some(function (p) { return F.legacy[p].key === k; }) || !!F.reservedKeys[k]; }
    function suggest(nick, exceptPid) {
        var base = Array.from(clean(nick) || '玩家').slice(0, 5).join('');
        for (var i = 0; i < 60; i++) {
            var cand = base + (100 + Math.floor(Math.random() * 900));
            if (!takenAnywhere(nickKey(cand)) && !isReservedWord(nickKey(cand))) return cand;
        }
        return base + '999';
    }
    /* 有人（已認領）拿到某暱稱之後，其他尚未認領、暱稱一樣的舊玩家在榜上自動改成「原暱稱＋隨機數字」 */
    function resolveDups(k, winner) {
        Object.keys(F.legacy).forEach(function (p) {
            if (p !== winner && F.legacy[p].key === k) { var n = suggest(F.legacy[p].nick, p); F.legacy[p].nick = n; F.legacy[p].key = nickKey(n); }
        });
    }
    /* 密碼限速（簡化版）：連錯 5 次鎖 10 分鐘（之後每錯一次加倍，上限 24 小時） */
    function checkPin(acc, pin) {
        var now = Date.now();
        if (acc.lockedUntil && acc.lockedUntil > now) return { ok: false, error: 'locked', wait_seconds: Math.ceil((acc.lockedUntil - now) / 1000) };
        if (acc.pin === pin) { acc.fail = 0; acc.level = 0; acc.lockedUntil = 0; return { ok: true }; }
        acc.fail = (acc.fail || 0) + 1;
        if (acc.level > 0 || acc.fail >= 5) {
            acc.level = (acc.level || 0) + 1;
            var min = Math.min(1440, 10 * Math.pow(2, Math.min(acc.level - 1, 10)));
            acc.lockedUntil = now + min * 60000;
            return { ok: false, error: 'locked', wait_seconds: min * 60 };
        }
        return { ok: false, error: 'wrong_pin', attempts_left: 5 - acc.fail };
    }
    function authed(pid, token) { var a = F.accounts[pid]; return !!(a && token && a.tokens[token]); }
    function startSession(pid) { var t = newToken(); F.accounts[pid].tokens[t] = 1; return t; }
    function qualifiesFor(g, score) {
        var rows = sorted(g);
        return rows.length < 30 || key(g, score) < key(g, rows[rows.length - 1].score);
    }
    function writeScore(g, pid, s) {
        var old = ensure(g).filter(function (r) { return r.pid === pid; })[0], saved = false;
        if (old) { if (key(g, s) < key(g, old.score)) { old.score = s; old.t = clock++; saved = true; } }
        else {
            var rows = sorted(g);
            if (rows.length < 30 || key(g, s) < key(g, rows[rows.length - 1].score)) { db[g].push({ pid: pid, nick: '', score: s, t: clock++ }); saved = true; prune(g); }
        }
        var me = sorted(g).map(function (r) { return r.pid; }).indexOf(pid);
        var out = board(g, pid); out.ok = true; out.saved = saved; out.rank = me >= 0 ? me + 1 : null;
        return out;
    }
    /* 把「來源」併進「目標」：成績每款取較好的、個人最佳取較好的 */
    function mergeInto(src, dst) {
        Object.keys(db).forEach(function (g) {
            var a = db[g].filter(function (r) { return r.pid === src; })[0], b = db[g].filter(function (r) { return r.pid === dst; })[0];
            if (!a) return;
            if (b) { if (key(g, a.score) < key(g, b.score)) { b.score = a.score; b.t = a.t; } db[g] = db[g].filter(function (r) { return r !== a; }); }
            else a.pid = dst;
        });
        var sb = F.bests[src] || {}, db2 = F.bests[dst] = F.bests[dst] || {};
        Object.keys(sb).forEach(function (g) {
            var x = sb[g], y = db2[g] = db2[g] || {};
            if (x.s != null) y.s = (y.s == null) ? x.s : (specOf(g) && specOf(g).better === 'min' ? Math.min(x.s, y.s) : Math.max(x.s, y.s));
            if (x.lv != null) y.lv = Math.max(y.lv || 0, x.lv);
        });
        delete F.bests[src]; delete F.legacy[src]; delete F.accounts[src];
    }
    function respond(obj, ms) { return new Promise(function (res) { setTimeout(function () { res({ ok: true, status: 200, json: function () { return Promise.resolve(obj); } }); }, ms); }); }

    window.__realFetch = window.__realFetch || window.fetch;
    window.fetch = function (url, opt) {
        if (String(url).indexOf('/rest/v1/rpc/MF_') < 0) return window.__realFetch(url, opt);
        var name = String(url).split('/rpc/')[1], b = JSON.parse(opt.body);
        calls.push({ name: name, body: b, at: Date.now() });
        if (F.mode === 'down') return new Promise(function (_, rej) { setTimeout(function () { rej(new TypeError('Failed to fetch')); }, F.latency); });
        var L = F.latency, e = function (error, extra) { var o = { ok: false, error: error }; for (var k in (extra || {})) o[k] = extra[k]; return respond(o, L); };
        if (name === 'MF_get_top') return respond(specOf(b.p_game_id) ? board(b.p_game_id, b.p_player_id) : null, L);

        /* ─── 玩家身分 ─── */
        if (name === 'MF_check_nick') {
            var n1 = clean(b.p_nick), k1 = nickKey(b.p_nick);
            if (!n1 || !k1 || isReservedWord(k1)) return respond({ ok: true, state: 'bad', nick: n1 }, L);
            var st1 = nickState(k1, b.p_legacy_pid);
            if (st1 === 'free') return respond({ ok: true, state: 'free', nick: n1 }, L);
            return respond({ ok: true, state: st1, nick: n1, suggestion: suggest(n1, b.p_legacy_pid), until: st1 === 'reserved' ? reservedBy(k1, b.p_legacy_pid) : null }, L);
        }
        if (name === 'MF_legacy_status') {
            var lp = F.legacy[b.p_player_id], ap = F.accounts[b.p_player_id];
            return respond(ap ? { ok: true, state: 'claimed', nick: ap.nick } : lp ? { ok: true, state: 'unclaimed', nick: lp.nick } : { ok: true, state: 'unknown' }, L);
        }
        if (name === 'MF_register') {
            var g0 = b.p_game_id, sp0 = specOf(g0), n2 = clean(b.p_nick), k2 = nickKey(b.p_nick);
            if (!sp0) return e('unknown_game');
            var s0 = Math.round(b.p_score * 10000) / 10000;
            if (!(s0 >= sp0.min && s0 <= sp0.max)) return e('out_of_range');
            if (!validPin(b.p_pin)) return e('bad_pin');
            if (!n2 || !k2 || isReservedWord(k2)) return e('bad_nick');
            var st2 = nickState(k2, null);
            if (st2 !== 'free') return e(st2 === 'taken' ? 'nick_taken' : 'nick_reserved', { suggestion: suggest(n2, null), until: reservedBy(k2, null) });
            if (!qualifiesFor(g0, s0)) return e('not_qualified');
            var pid2 = newPid();
            F.accounts[pid2] = { pid: pid2, nick: n2, key: k2, pin: b.p_pin, tokens: {}, fail: 0, level: 0, lockedUntil: 0, renameDay: '', renameCount: 0 };
            resolveDups(k2, pid2);
            var out2 = writeScore(g0, pid2, s0); out2.player_id = pid2; out2.token = startSession(pid2); out2.nick = n2;
            return respond(out2, L);
        }
        if (name === 'MF_claim_legacy') {
            var lg = F.legacy[b.p_legacy_pid], n3 = clean(b.p_nick), k3 = nickKey(b.p_nick);
            if (!validPin(b.p_pin)) return e('bad_pin');
            if (!n3 || !k3 || isReservedWord(k3)) return e('bad_nick');
            if (!lg) return e(F.accounts[b.p_legacy_pid] ? 'already_claimed' : 'unknown_legacy');
            var owner = accountByKey(k3);
            if (owner) {
                var ck = checkPin(F.accounts[owner], b.p_pin);
                if (!ck.ok) return e(ck.error, ck);
                mergeInto(b.p_legacy_pid, owner); resolveDups(k3, owner);
                return respond({ ok: true, player_id: owner, token: startSession(owner), nick: F.accounts[owner].nick, joined: true }, L);
            }
            if (nickState(k3, b.p_legacy_pid) !== 'free') return e('nick_reserved', { suggestion: suggest(n3, b.p_legacy_pid), until: reservedBy(k3, b.p_legacy_pid) });
            delete F.legacy[b.p_legacy_pid];
            F.accounts[b.p_legacy_pid] = { pid: b.p_legacy_pid, nick: n3, key: k3, pin: b.p_pin, tokens: {}, fail: 0, level: 0, lockedUntil: 0, renameDay: '', renameCount: 0 };
            resolveDups(k3, b.p_legacy_pid);
            return respond({ ok: true, player_id: b.p_legacy_pid, token: startSession(b.p_legacy_pid), nick: n3, joined: false }, L);
        }
        if (name === 'MF_login') {
            var k4 = nickKey(b.p_nick);
            if (!k4) return e('bad_args');
            if (!validPin(b.p_pin)) return e('bad_pin');
            var o4 = accountByKey(k4);
            if (!o4) return e('no_such_player');
            var ck4 = checkPin(F.accounts[o4], b.p_pin);
            if (!ck4.ok) return e(ck4.error, ck4);
            if (b.p_legacy_pid && F.legacy[b.p_legacy_pid]) { mergeInto(b.p_legacy_pid, o4); resolveDups(k4, o4); }
            return respond({ ok: true, player_id: o4, token: startSession(o4), nick: F.accounts[o4].nick }, L);
        }
        if (name === 'MF_login_and_merge') {
            if (!authed(b.p_player_id, b.p_token)) return e('bad_token');
            var k5 = nickKey(b.p_nick);
            if (!validPin(b.p_pin)) return e('bad_pin');
            var o5 = accountByKey(k5);
            if (!o5) return e('no_such_player');
            if (o5 === b.p_player_id) return e('same_player');
            var ck5 = checkPin(F.accounts[o5], b.p_pin);
            if (!ck5.ok) return e(ck5.error, ck5);
            mergeInto(b.p_player_id, o5);
            return respond({ ok: true, player_id: o5, token: startSession(o5), nick: F.accounts[o5].nick }, L);
        }
        if (name === 'MF_whoami') return authed(b.p_player_id, b.p_token) ? respond({ ok: true, nick: F.accounts[b.p_player_id].nick }, L) : e('bad_token');
        if (name === 'MF_logout') {
            if (!authed(b.p_player_id, b.p_token)) return e('bad_token');
            delete F.accounts[b.p_player_id].tokens[b.p_token];
            return respond({ ok: true }, L);
        }
        if (name === 'MF_change_pin') {
            if (!authed(b.p_player_id, b.p_token)) return e('bad_token');
            if (!validPin(b.p_new_pin)) return e('bad_pin');
            var a6 = F.accounts[b.p_player_id]; a6.pin = b.p_new_pin; a6.fail = 0; a6.level = 0; a6.lockedUntil = 0;
            Object.keys(a6.tokens).forEach(function (t) { if (t !== b.p_token) delete a6.tokens[t]; });
            return respond({ ok: true }, L);
        }
        if (name === 'MF_rename') {
            if (!authed(b.p_player_id, b.p_token)) return e('bad_token');
            var a7 = F.accounts[b.p_player_id], n7 = clean(b.p_nick), k7 = nickKey(b.p_nick), day = taipeiDay();
            if (!n7 || !k7 || isReservedWord(k7)) return e('bad_nick');
            if (a7.nick === n7) return respond({ ok: true, nick: n7, changed: false, left: a7.renameDay === day ? Math.max(0, 2 - a7.renameCount) : 2 }, L);
            var cnt = a7.renameDay === day ? a7.renameCount : 0;
            if (cnt >= 2) return e('rename_too_many', { limit: 2 });
            var o7 = accountByKey(k7);
            if (o7 && o7 !== b.p_player_id) return e('nick_taken', { suggestion: suggest(n7, b.p_player_id) });
            if (reservedBy(k7, null)) return e('nick_reserved', { suggestion: suggest(n7, b.p_player_id), until: reservedBy(k7, null) });
            a7.nick = n7; a7.key = k7; a7.renameDay = day; a7.renameCount = cnt + 1; resolveDups(k7, b.p_player_id);
            return respond({ ok: true, nick: n7, changed: true, left: 2 - (cnt + 1) }, L);
        }
        if (name === 'MF_sync_bests') {
            if (!authed(b.p_player_id, b.p_token)) return e('bad_token');
            var mine = F.bests[b.p_player_id] = F.bests[b.p_player_id] || {}, rej = [];
            (b.p_items || []).forEach(function (it) {
                var sp = specOf(it.g) || { better: 'max', min: -1e9, max: 1e9 };
                if (!validGame(it.g)) { rej.push(it.g); return; }
                var y = mine[it.g] = mine[it.g] || {};
                if (typeof it.s === 'number') { if (it.s < sp.min || it.s > sp.max) { rej.push(it.g); } else y.s = y.s == null ? it.s : (sp.better === 'min' ? Math.min(y.s, it.s) : Math.max(y.s, it.s)); }
                if (typeof it.lv === 'number') { if (it.lv < 1 || it.lv > 200 || it.lv !== Math.floor(it.lv)) rej.push(it.g); else y.lv = Math.max(y.lv || 0, it.lv); }
            });
            var items = Object.keys(mine).map(function (g) { var sp = specOf(g); var o = { g: g, b: sp ? sp.better : 'max' }; if (mine[g].s != null) o.s = mine[g].s; if (mine[g].lv != null) o.lv = mine[g].lv; return o; });
            return respond({ ok: true, items: items, rejected: rej }, L);
        }

        /* ─── 成績（要憑證）─── */
        if (name === 'MF_submit_score') {
            var g = b.p_game_id, sp = specOf(g);
            if (!sp) return e('unknown_game');
            var s = Math.round(b.p_score * 10000) / 10000;
            if (s < sp.min || s > sp.max) return e('out_of_range');
            if (!authed(b.p_player_id, b.p_token)) return e('bad_token');
            return respond(writeScore(g, b.p_player_id, s), L);
        }
        /* 五星評價（V1.25.0）：跟 SQL 的 MF_submit_rating 一樣——同一位玩家、同一款遊戲、同一天（台灣時間）只算一次；
           平均＝F.ratingBase（假的既有評價，F.seedRatings() 產生）＋這一頁真的送出的 F.ratings。V1.35.0：沒帶憑證＝匿名，但不能冒用已建立帳號的編號 */
        if (name === 'MF_submit_rating') {
            var rg = b.p_game_id, st = b.p_stars, day2 = taipeiDay();
            if (!validGame(rg)) return e('unknown_game');
            if (!b.p_player_id || !(st >= 1 && st <= 5) || st !== Math.floor(st)) return e('bad_args');
            if (b.p_token ? !authed(b.p_player_id, b.p_token) : !!F.accounts[b.p_player_id]) return e('bad_token');
            var dup = F.ratings.some(function (x) { return x.game === rg && x.player === b.p_player_id && x.day === day2; });
            if (!dup) F.ratings.push({ game: rg, player: b.p_player_id, stars: st, day: day2, at: Date.now() });
            var one = ratingStats()[rg];
            return respond({ ok: true, saved: !dup, day: day2, avg: one ? one[0] : null, cnt: one ? one[1] : 0 }, L);
        }
        if (name === 'MF_get_ratings') return respond(ratingStats(), L);
        /* 阿嬤都比你厲害（V1.25.0）：F.overtaken 有設定（陣列）就直接回傳它（主選單沒有遊戲檔案、算不出名次，用這個測）；
           沒設定就照 SQL 的 MF_get_overtaken 從這一頁的假榜單算 */
        if (name === 'MF_get_overtaken') return respond(F.overtaken || overtakenOf(b.p_player_id), L);
        /* 玩家意見（結算彈窗的「我有話要說」）：跟 SQL 的 MF_submit_feedback 一樣檢查，記在 F.feedback；暱稱由帳號帶入 */
        if (name === 'MF_submit_feedback') {
            var fg = b.p_game_id, msg = String(b.p_message || '').trim();
            if (!specOf(fg) && !validGame(fg)) return e('unknown_game');
            if (Array.from(msg).length < 2) return e('bad_args');
            if (b.p_token ? !authed(b.p_player_id, b.p_token) : !!F.accounts[b.p_player_id]) return e('bad_token');
            F.feedback = F.feedback || [];
            if (F.feedback.filter(function (x) { return x.player === b.p_player_id; }).length >= 20) return e('too_many');
            F.feedback.push({ game: fg, player: b.p_player_id, nick: b.p_token && F.accounts[b.p_player_id] ? F.accounts[b.p_player_id].nick : null, message: msg.slice(0, 300), version: b.p_version, at: Date.now() });
            return respond({ ok: true, saved: true }, L);
        }
        return respond(null, 10);
    };
    F.feedback = [];
    F.ratings = [];            /* 這一頁送出的五星評價 */
    F.ratingBase = {};         /* 假的既有評價：{ id: { t: 總星數, n: 次數 } }（F.seedRatings() 產生） */
    F.overtaken = null;        /* 設成陣列 [ {game_id, rank, at}, … ] 就直接當作 MF_get_overtaken 的回傳 */
    /* 替選單（或這一頁登記的）每一款遊戲生出假的平均星數：大部分 3～5 顆，偶爾有沒人評過的 */
    F.seedRatings = function () {
        var ids = (window.FMMenu ? FMMenu.GAME_CELLS.map(function (c) { return c.id; }) : (Reaction.list() || []).map(function (g) { return g.id; }));
        F.ratingBase = {};
        ids.forEach(function (id, i) {
            if (i % 9 === 4) return;
            var n = 1 + (i * 7) % 23, avg = 2.2 + ((i * 37) % 29) / 10;
            F.ratingBase[id] = { t: Math.round(Math.min(5, avg) * n), n: n };
        });
        return Object.keys(F.ratingBase).length + ' 款有假評價';
    };
    F.seed = seed;
    F.board = function (g) { return board(g, null).top; };
    F.reserve = function (nick, days) { F.reservedKeys[nickKey(nick)] = new Date(Date.now() + (days || 7) * 86400000).toISOString(); };

    /* ═══ 這支瀏覽器的身分（測試用的捷徑）═══ */
    function wipeIdentity() {
        Object.keys(localStorage).filter(function (k) { return k.indexOf('fm.lb.') === 0 || k.indexOf('fm.rate.') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
        if (window.Leaderboard) { var s = Leaderboard.test.state; s.boards = {}; s.inflight = {}; s.netDownUntil = 0; s.gate = null; }
    }
    /* 直接建立一個已登入的帳號（假資料庫裡有、這支瀏覽器也存好憑證） */
    F.loginAs = function (nick, pin) {
        wipeIdentity();
        var pid = newPid(), k = nickKey(nick);
        F.accounts[pid] = { pid: pid, nick: clean(nick), key: k, pin: pin || '1234', tokens: {}, fail: 0, level: 0, lockedUntil: 0, renameDay: '', renameCount: 0 };
        var tok = startSession(pid);
        if (window.Leaderboard) Leaderboard.setSession({ player_id: pid, token: tok, nick: clean(nick) });
        return pid;
    };
    F.guest = function () { wipeIdentity(); return 'guest'; };
    /* 假資料庫裡直接多一個已建立的帳號（不改這支瀏覽器的身分）；回傳 player_id */
    F.addAccount = function (nick, pin) {
        var pid = newPid();
        F.accounts[pid] = { pid: pid, nick: clean(nick), key: nickKey(nick), pin: pin || '1234', tokens: {}, fail: 0, level: 0, lockedUntil: 0, renameDay: '', renameCount: 0 };
        return pid;
    };
    /* V1.34 以前的舊玩家：假資料庫裡有「尚未認領」的舊玩家（還有成績），這支瀏覽器存著他的舊代號與舊暱稱 */
    F.legacyDevice = function (nick, scores) {
        wipeIdentity();
        var pid = newPid();
        F.legacy[pid] = { nick: clean(nick), key: nickKey(nick) };
        Object.keys(scores || {}).forEach(function (g) { if (!specOf(g)) return; ensure(g); db[g].push({ pid: pid, nick: '', score: scores[g], t: clock++ }); prune(g); });   /* 主選單頁沒有遊戲檔案、不知道規格，就不放成績 */
        localStorage.setItem('fm.lb.pid', JSON.stringify(pid));
        localStorage.setItem('fm.lb.nick', JSON.stringify(clean(nick)));
        return pid;
    };
    window.__fake = F;
    if (OPTS.keep) return 'fake server ready（保留瀏覽器儲存，沒有自動登入）';
    /* 預設：清掉這支瀏覽器上的排行榜資料（暱稱、玩家代號、憑證、待送成績、榜單快取）與「目前這款遊戲」的最佳紀錄，模擬「第一次來」；
       不碰其他遊戲的最佳紀錄，萬一貼在自己平常玩的瀏覽器上也不會洗掉別款的紀錄。然後直接變成「已登入、暱稱 測試」 */
    var curId = window.Reaction && Reaction.current && Reaction.current.id, bestKey = 'fm.reaction.best.' + curId;
    Object.keys(localStorage).filter(function (k) { return k.indexOf('fm.lb.') === 0 || k.indexOf('fm.rate.') === 0 || (curId && (k === bestKey || k.indexOf(bestKey + '.') === 0)); }).forEach(function (k) { localStorage.removeItem(k); });
    if (window.Leaderboard) { var st0 = Leaderboard.test.state; st0.boards = {}; st0.inflight = {}; st0.netDownUntil = 0; st0.gate = null; }
    F.loginAs('測試');
    return 'fake server ready（全部遊戲通用，第一次用到才生出假成績；目前是已登入、暱稱「測試」）';
})();
