/* ═══════════════════════════════════════════════════════════════════
   plays.js — 「玩過哪些遊戲、什麼時候玩的」（V1.39.0）
   ───────────────────────────────────────────────────────────────────
   【兩件事】
   1. 本機紀錄（localStorage 的 fm.plays）：每款遊戲 { n 完成了幾局, first 第一次玩的日期, last 最近一次玩的日期 }。
      日期用這支瀏覽器的本地日期（YYYY-MM-DD）。只存在這支瀏覽器，換手機就從頭記（不用太精確，只是拿來挑「該推薦哪幾款」）。
      用途：主選單打開「選一個想玩的遊戲」時，輪流跳出的三種推薦彈窗（js/menu.js）：
        · 「阿嬤都比你厲害」：被別人超越的遊戲（資料來自資料庫，跟這個檔案無關）；
        · 「來都來了，快開一局」：沒玩過的遊戲、或很久（STALE_DAYS 天）沒玩的遊戲 → suggestFresh；
        · 「從從容容、游刃有餘」：最擅長的遊戲（世界名次最前面的，不夠再用玩最多局的補）→ suggestMaster。
      第一次載入時（還沒有紀錄）會用「有最佳紀錄的」「最近玩過的」遊戲補一份起始紀錄（bootstrap），日期算成當天，
      所以更新前玩過的遊戲不會一更新就被當成「沒玩過」。
   2. 遊玩次數回報（給 admin/stats.html 的統計）：每完成一局，記一筆「(台灣日期, 遊戲) 次數 +1」（fm.plays.q），
      稍後（3 秒後、或下次開頁面時）一次批次送給資料庫函式 MF_log_plays；送不出去（沒網路、函式還沒建）就留著下次再送。
      只送「哪一天、哪款遊戲、幾局、玩家代號」，不送成績、不送任何個人資料；玩家代號跟五星評價用的是同一個（Leaderboard.pid）。
   「一局」＝結算畫面出現一次（js/reaction.js 偵測，多關卡遊戲每一關的小結算不算）；只開了遊戲沒玩完不算一局（但算「玩過」，見 noteStart）。
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var KEY = 'fm.plays';                /* { g: { <遊戲id>: { n, first, last, boot? } } } */
    var KEY_BOOT = 'fm.plays.boot';      /* 已經用舊紀錄補過起始資料 */
    var KEY_Q = 'fm.plays.q';            /* 還沒送出的次數：{ 'YYYY-MM-DD|<遊戲id>': 次數 }（日期是台灣日期） */
    var STALE_DAYS = 7;                  /* 幾天沒玩算「很久沒玩」 */
    var SEND_DELAY_MS = 3000;            /* 完成一局之後，等多久再批次送出（這段時間內再完成的一起送） */
    var SEND_TIMEOUT_MS = 8000;
    var RETRY_MS = 60 * 1000;            /* 送失敗之後多久再試 */
    var MISSING_RETRY_MS = 30 * 60 * 1000;   /* 資料庫還沒有 MF_log_plays（404）時，隔很久再試 */
    var Q_MAX_KEYS = 300;                /* 佇列最多幾筆（太多就丟掉最舊的日子）*/
    var Q_MAX_AGE_DAYS = 3;              /* 超過幾天沒送出去的就不送了（資料庫也只收最近幾天）*/
    var BATCH_MAX = 40;                  /* 一次最多送幾筆（資料庫上限 50）*/
    var TAIPEI_MS = 8 * 3600 * 1000;

    var Plays = {};
    var state = { busy: false, downUntil: 0, timer: null };

    function store() { return global.UI && global.UI.store; }
    function sget(k, f) { var s = store(); return s ? s.get(k, f) : f; }
    function sset(k, v) { var s = store(); if (s) s.set(k, v); }
    function p2(n) { return n < 10 ? '0' + n : '' + n; }

    /* ═══ 日期的純函式 ═══ */
    /* 這支瀏覽器的本地日期 'YYYY-MM-DD' */
    function localDay(now) {
        var d = new Date(now == null ? Date.now() : now);  /* Date.now()：現在的時間（毫秒），拿來算「經過了多久」 */
        return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
    }
    /* 台灣日期 'YYYY-MM-DD'（跟資料庫一樣用台灣時間算一天；js/rating.js 也是 +8 小時） */
    function taipeiDay(now) {
        return new Date((now == null ? Date.now() : now) + TAIPEI_MS).toISOString().slice(0, 10);  /* Date.now()：現在的時間（毫秒），拿來算「經過了多久」 */
    }
    /* 兩個 'YYYY-MM-DD' 相差幾天（b − a）；格式不對回傳 NaN */
    function daysBetween(a, b) {
        var ra = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a || ''), rb = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b || '');
        if (!ra || !rb) return NaN;
        return Math.round((Date.UTC(+rb[1], +rb[2] - 1, +rb[3]) - Date.UTC(+ra[1], +ra[2] - 1, +ra[3])) / 86400000);  /* Math.round：四捨五入成整數 */
    }

    /* ═══ 本機紀錄 ═══ */
    /* 讀紀錄：{ <id>: { n, first, last } }，格式不對的列丟掉（localStorage 可能被改壞） */
    function all() {
        var raw = sget(KEY, null), out = {};
        var g = raw && typeof raw === 'object' && raw.g && typeof raw.g === 'object' ? raw.g : {};
        Object.keys(g).forEach(function (id) {          /* forEach：對陣列的每個元素各做一次 */
            var e = g[id];
            if (!/^[a-z0-9_]{1,32}$/.test(id) || !e || typeof e !== 'object') return;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(e.last || '')) return;
            out[id] = { n: e.n >= 0 ? Math.floor(e.n) : 0, first: /^\d{4}-\d{2}-\d{2}$/.test(e.first || '') ? e.first : e.last, last: e.last };  /* Math.floor：無條件捨去成整數 */
            if (e.boot) out[id].boot = true;
        });
        return out;
    }
    function save(map) { sset(KEY, { g: map }); }

    /* 玩家按了「開始挑戰」：這款算「玩過」，最近一次是今天（局數不變，要玩完一局才 +1） */
    function noteStart(id, now) {
        if (!id) return;
        var m = all(), day = localDay(now), e = m[id];
        if (e) { e.last = day; delete e.boot; } else m[id] = { n: 0, first: day, last: day };
        save(m);
    }
    /* 完成一局：局數 +1、最近一次是今天，並記一筆要回報給資料庫的次數 */
    function noteDone(id, now) {
        if (!id) return;
        var m = all(), day = localDay(now), e = m[id];
        if (!e) e = m[id] = { n: 0, first: day, last: day };
        e.n += 1; e.last = day; delete e.boot;
        save(m);
        queueAdd(taipeiDay(now), id);
        flushSoon();
    }
    /* 第一次載入（還沒補過起始紀錄）：有本機最佳紀錄的、最近玩過的遊戲，補成「在今天玩過 1 局」；已經有紀錄的不動 */
    function bootstrap(ids, now) {
        if (sget(KEY_BOOT, false)) return false;
        sset(KEY_BOOT, true);
        var m = all(), day = localDay(now), recent = sget('fm.menu.recent', null), last = sget('fm.menu.lastGame', null), changed = false;
        (ids || []).forEach(function (id) {             /* forEach：對陣列的每個元素各做一次 */
            if (m[id]) return;
            var played = sget('fm.reaction.best.' + id, null) != null || (Array.isArray(recent) && recent.indexOf(id) >= 0) || last === id;  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
            if (played) { m[id] = { n: 1, first: day, last: day, boot: true }; changed = true; }
        });
        if (changed) save(m);
        return changed;
    }

    /* ═══ 推薦（純函式，Node 測試直接呼叫）═══ */
    /* 洗牌（Fisher-Yates），不動原陣列 */
    function shuffle(list, rand) {
        var a = list.slice();                           /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(rand() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;  /* Math.floor：無條件捨去成整數 */
        }
        return a;
    }
    /* 「來都來了，快開一局」：沒玩過的（kind:'new'）＋ 很久沒玩的（kind:'stale'，days 天沒玩，最久的在前）。
       ids：選單裡所有遊戲的 id；plays：all() 的內容。
       最多 o.n 款（預設 6）：沒玩過的優先（隨機挑），但至少留 o.staleMin 個（預設 2）名額給很久沒玩的（有的話）；某一邊不夠就由另一邊補。
       o.today：今天的本地日期；o.rand：亂數函式（測試用）；o.staleDays：幾天算很久。 */
    function suggestFresh(ids, plays, o) {
        o = o || {};
        var n = o.n || 6, staleDays = o.staleDays || STALE_DAYS, rand = o.rand || Math.random, today = o.today || localDay(), staleMin = o.staleMin == null ? 2 : o.staleMin;
        var fresh = [], stale = [];
        (ids || []).forEach(function (id) {
            var e = plays && plays[id];
            if (!e) { fresh.push({ id: id, kind: 'new', days: null }); return; }
            var d = daysBetween(e.last, today);
            if (d >= staleDays) stale.push({ id: id, kind: 'stale', days: d });
        });
        fresh = shuffle(fresh, rand);
        stale.sort(function (a, b) { return b.days - a.days || (a.id < b.id ? -1 : 1); });  /* sort：排序；比較函式回傳負數代表 a 排前面、回傳正數代表 b 排前面 */
        var takeStale = Math.min(stale.length, Math.max(staleMin, n - fresh.length));
        var takeFresh = Math.min(fresh.length, n - takeStale);
        takeStale = Math.min(stale.length, n - takeFresh);
        return fresh.slice(0, takeFresh).concat(stale.slice(0, takeStale));
    }
    /* 「從從容容、游刃有餘」：最擅長的遊戲。ranks：[{ game_id, rank }]（世界名次，只有登入的玩家才有）。
       先放世界名次最前面的（同名次最近玩的在前），不夠 o.n 款再用「玩最多局」的補（至少 o.minPlays 局，預設 3）；
       湊不到 o.minItems 款（預設 3）就回傳空陣列（不推薦）。回傳 [{ id, rank（沒有名次是 null）, n（玩過幾局）}]。 */
    function suggestMaster(ids, plays, ranks, o) {
        o = o || {};
        var n = o.n || 6, minPlays = o.minPlays || 3, minItems = o.minItems || 3;
        var inIds = {}, seen = {}, out = [];
        (ids || []).forEach(function (id) { inIds[id] = true; });
        var lastOf = function (id) { return (plays && plays[id] && plays[id].last) || ''; };
        (Array.isArray(ranks) ? ranks : []).filter(function (r) { return r && inIds[r.game_id] && r.rank >= 1; })  /* filter：留下符合條件的元素，回傳新陣列 */
            .sort(function (a, b) { return a.rank - b.rank || (lastOf(b.game_id) > lastOf(a.game_id) ? 1 : lastOf(b.game_id) < lastOf(a.game_id) ? -1 : 0) || (a.game_id < b.game_id ? -1 : 1); })  /* sort：排序；比較函式回傳負數代表 a 排前面、回傳正數代表 b 排前面 */
            .forEach(function (r) {
                if (out.length >= n || seen[r.game_id]) return;
                seen[r.game_id] = true;
                out.push({ id: r.game_id, rank: r.rank, n: (plays && plays[r.game_id] && plays[r.game_id].n) || 0 });
            });
        if (out.length < n) {
            Object.keys(plays || {}).filter(function (id) { return inIds[id] && !seen[id] && plays[id].n >= minPlays; })  /* filter：留下符合條件的元素，回傳新陣列 */
                .sort(function (a, b) { return plays[b].n - plays[a].n || (plays[b].last > plays[a].last ? 1 : plays[b].last < plays[a].last ? -1 : 0) || (a < b ? -1 : 1); })
                .slice(0, n - out.length)
                .forEach(function (id) { out.push({ id: id, rank: null, n: plays[id].n }); });
        }
        return out.length >= minItems ? out : [];
    }

    /* ═══ 回報給資料庫 ═══ */
    function readQ() {
        var raw = sget(KEY_Q, null), q = {};
        if (raw && typeof raw === 'object') Object.keys(raw).forEach(function (k) {
            if (/^\d{4}-\d{2}-\d{2}\|[a-z0-9_]{1,32}$/.test(k) && raw[k] >= 1) q[k] = Math.min(1000, Math.floor(raw[k]));
        });
        return q;
    }
    function writeQ(q) { sset(KEY_Q, Object.keys(q).length ? q : null); }
    function queueAdd(day, id) {
        var q = readQ(), k = day + '|' + id;
        q[k] = (q[k] || 0) + 1;
        var keys = Object.keys(q);
        if (keys.length > Q_MAX_KEYS) {
            keys.sort().slice(0, keys.length - Q_MAX_KEYS).forEach(function (x) { delete q[x]; });     /* 日期字串在最前面，sort 就是最舊的在前 */
        }
        writeQ(q);
    }
    function pending() { return readQ(); }

    /* 把佇列裡的次數送出去（Promise，一定 resolve，回傳 { sent: 幾筆, error?: 字串 }）：
       太舊的（超過 Q_MAX_AGE_DAYS 天）直接丟掉；一次最多 BATCH_MAX 筆；成功才從佇列扣掉「送出去的那些次數」（送的途中新增的不受影響） */
    function flush() {
        var lb = global.Leaderboard;
        if (!lb || !lb.rpc || !lb.pid) return Promise.resolve({ sent: 0, error: 'nolb' });
        if (state.busy) return Promise.resolve({ sent: 0, error: 'busy' });
        if (Date.now() < state.downUntil) return Promise.resolve({ sent: 0, error: 'cooldown' });
        var today = taipeiDay(), q = readQ(), items = [];
        Object.keys(q).sort().forEach(function (k) {
            var day = k.slice(0, 10), id = k.slice(11);
            if (daysBetween(day, today) > Q_MAX_AGE_DAYS || daysBetween(day, today) < -1) { delete q[k]; return; }
            if (items.length < BATCH_MAX) items.push({ day: day, game_id: id, n: q[k] });
        });
        writeQ(q);
        if (!items.length) return Promise.resolve({ sent: 0 });
        state.busy = true;
        return lb.rpc('MF_log_plays', { p_player_id: lb.pid(), p_items: items }, SEND_TIMEOUT_MS).then(function (r) {
            state.busy = false;
            var res = r && r.ok && r.data;
            if (res && res.ok) {
                var cur = readQ();
                items.forEach(function (it) {
                    var k = it.day + '|' + it.game_id;
                    if (cur[k]) { cur[k] -= it.n; if (cur[k] <= 0) delete cur[k]; }
                });
                writeQ(cur);
                return { sent: items.length };
            }
            if (res && res.error === 'bad_args') { var c2 = readQ(); items.forEach(function (it) { delete c2[it.day + '|' + it.game_id]; }); writeQ(c2); return { sent: 0, error: 'bad_args' }; }
            state.downUntil = Date.now() + (r && r.error === 'http_404' ? MISSING_RETRY_MS : RETRY_MS);
            return { sent: 0, error: (r && r.error) || (res && res.error) || 'fail' };
        }, function () { state.busy = false; state.downUntil = Date.now() + RETRY_MS; return { sent: 0, error: 'fail' }; });
    }
    function flushSoon(ms) {
        if (state.timer || !global.setTimeout) return;
        state.timer = global.setTimeout(function () { state.timer = null; flush(); }, ms == null ? SEND_DELAY_MS : ms);
    }

    Plays.STALE_DAYS = STALE_DAYS;
    Plays.all = all;
    Plays.get = function (id) { return all()[id] || null; };
    Plays.noteStart = noteStart;
    Plays.noteDone = noteDone;
    Plays.bootstrap = bootstrap;
    Plays.suggestFresh = suggestFresh;
    Plays.suggestMaster = suggestMaster;
    Plays.pending = pending;
    Plays.flush = flush;
    Plays.flushSoon = flushSoon;
    Plays.localDay = localDay;
    Plays.taipeiDay = taipeiDay;
    Plays.daysBetween = daysBetween;
    Plays.test = {
        KEY: KEY, KEY_BOOT: KEY_BOOT, KEY_Q: KEY_Q, shuffle: shuffle, state: state, readQ: readQ, queueAdd: queueAdd,
        Q_MAX_KEYS: Q_MAX_KEYS, Q_MAX_AGE_DAYS: Q_MAX_AGE_DAYS, BATCH_MAX: BATCH_MAX, MISSING_RETRY_MS: MISSING_RETRY_MS, RETRY_MS: RETRY_MS
    };

    global.FMPlays = Plays;

    /* 頁面載入一下子之後，把上次沒送出去的次數補送（要是有的話） */
    if (global.UI && global.UI.ready && global.document) {
        global.UI.ready(function () { if (Object.keys(readQ()).length) flushSoon(4000); });
    }
})(window);
