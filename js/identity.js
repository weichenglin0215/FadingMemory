/* ═══════════════════════════════════════════════════════════════════
   identity.js — 秒反應「玩家身分」（V1.35.0）：暱稱全站唯一＋4 位數密碼、登入、改暱稱、個人最佳跨裝置同步
   ───────────────────────────────────────────────────────────────────
   【為什麼要有玩家身分】
   以前只輸入暱稱：不同玩家可以用同一個暱稱（排行榜分不清誰是誰）；同一位玩家換手機、換瀏覽器，
   暱稱一樣但 player_id 不一樣，變成兩份紀錄。現在每位玩家有一個「資料庫發的、永遠不變的 player_id」，
   暱稱全站唯一，密碼是 4 位數字（資料庫只存雜湊，連管理者都看不到）。

   【兩樣東西要分清楚】
     player_id   玩家編號：成績、意見、評價、個人最佳都用它連結；改暱稱不會變；不公開。
     裝置憑證    登入成功時資料庫發的隨機字串（資料庫只存雜湊），存在這支瀏覽器；之後送成績、改暱稱、同步都靠它，
                 所以日常不必每次輸入密碼。密碼只在「建立、認領、登入」那一刻送出。
   這支瀏覽器的 player_id／憑證／暱稱存在 js/leaderboard.js（getPid／getToken／getNick／setSession…）；
   這個檔案負責「流程」：呼叫資料庫、把錯誤代碼翻成玩家看得懂的話、同步個人最佳。畫面在 js/identity_ui.js。

   【這支瀏覽器的四種身分】（Leaderboard.identityState）
     guest    訪客：還沒有帳號。玩的時候完全不問；成績進前 30 名的那一刻才請他「建立暱稱與密碼」（兩樣一次填妥）。
     legacy   V1.34 以前的舊玩家（有暱稱、還沒設密碼）：一進 index.html（或直接開 reaction.html）就跳「建立暱稱與密碼」，
              帶入原本的暱稱、游標在密碼欄；沒有「稍後再說」。暱稱沒人用 → 直接建立（player_id 沿用舊代號，成績全部照舊）；
              暱稱已被別的帳號用了 → 玩家輸入「同一組密碼」就認定是同一個人的另一台裝置，兩台共用同一個帳號；
              密碼不同 → 當成不同的人，請他換個暱稱（系統建議「原暱稱＋隨機 3 位數」）。
     in       已登入。
     relogin  有帳號，但這支瀏覽器的憑證失效了（例如在別台改了密碼）：不擋遊戲，等到需要時（要送進榜成績、
              打開帳號面板）才跳登入彈窗，暱稱已帶入。

   【個人最佳同步】每款遊戲的最佳成績（fm.reaction.best.<id>）與最佳關卡（fm.reaction.lvbest.<id>）都會同步到帳號，
   換裝置登入後馬上帶得走（V1.34 的「最佳關卡 − 4 進場」也就跟著生效）。合併規則永遠是「取較好的」，所以先後順序不影響結果。
   ★ 單位陷阱：有些遊戲改版時改過成績單位（例如毫秒改成秒），舊紀錄會在「進那款遊戲」時換算（Reaction.migrateBest）。
     所以本機的最佳成績「要確認是現行單位」才會上傳：Reaction.setBest 寫入時、或進遊戲 mount 完成之後（gameMounted），
     會在 fm.reaction.best.<id>.sync 做記號；從帳號下載下來的最佳成績也會做記號（migrateBest 看到記號就不再換算）。
     （將來如果又改了某款遊戲的成績單位，要連同資料庫裡的 MF_player_bests 一起處理。）
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var LB = global.Leaderboard;
    var Identity = {};

    /* ═══ 設定 ═══ */
    var CFG = {
        TIMEOUT_MS: 10000,               /* 呼叫資料庫最多等幾毫秒 */
        BEST_DEBOUNCE_MS: 3000,          /* 破個人紀錄之後，等幾毫秒才批次上傳（連續破紀錄只會送一次） */
        SYNC_TTL_MS: 60 * 60 * 1000,     /* 已登入：開頁面時，距離上次同步超過這麼久才重新同步（多台裝置的紀錄才會過來） */
        WHOAMI_TTL_MS: 60 * 60 * 1000,   /* 已登入：多久確認一次憑證還有效、暱稱有沒有被改 */
        BOOT_DELAY_MS: 500,              /* 開頁面之後等一下才檢查（讓畫面先出來） */
        PIN_LEN: 4,
        RENAME_PER_DAY: 2                /* 要跟資料庫 MF_rename 的 c_rename_per_day 一致 */
    };
    var KEY_BESTPEND = 'fm.lb.bestpending';     /* 還沒上傳的個人最佳：{ 遊戲id: 1 } */
    var KEY_SYNCAT = 'fm.lb.syncat';            /* 上次同步成功的時間 */
    var KEY_WHOAMIAT = 'fm.lb.whoamiat';        /* 上次確認憑證的時間 */
    var KEY_HINT = 'fm.lb.nickhint';            /* 舊暱稱的提示：資料庫沒有這個舊代號的紀錄（早就掉出榜外）時，保留他以前的暱稱當建立帳號的預設值 */
    var PREFIX_BEST = 'fm.reaction.best.';
    var PREFIX_LV = 'fm.reaction.lvbest.';
    var ID_RE = /^[a-z0-9_]{1,32}$/;

    function store() { return global.UI.store; }
    function log() {
        if (global.console && console.log) console.log.apply(console, ['[身分]'].concat([].slice.call(arguments)));
    }
    function del(key) {
        var s = store();
        if (s.remove) s.remove(key); else s.set(key, null);
    }

    /* ═══════════════════════════════════════════════════════════════
       一、純函式（不碰網路、不碰畫面；Node 測試直接呼叫：test/reaction/t_identity.js）
       ═══════════════════════════════════════════════════════════════ */

    /* 密碼輸入框的內容整理：只留數字、最多 4 個（貼上、全形數字之外的字元都丟掉） */
    function cleanPin(raw) {
        return String(raw == null ? '' : raw).replace(/[^0-9]/g, '').slice(0, CFG.PIN_LEN);
    }
    function validPin(p) {
        return typeof p === 'string' && /^[0-9]{4}$/.test(p);
    }

    /* 等待時間（秒）說成玩家看得懂的話：「1 分鐘」「8 分鐘」「2 小時 40 分鐘」 */
    function fmtWait(sec) {
        var m = Math.max(1, Math.ceil((Number(sec) || 0) / 60));
        if (m < 60) return m + ' 分鐘';
        var hh = Math.floor(m / 60), mm = m % 60;
        return hh + ' 小時' + (mm ? ' ' + mm + ' 分鐘' : '');
    }

    /* 「保留到何時」說成「M 月 D 日」（台灣時間） */
    function fmtDate(iso) {
        var t = new Date(iso).getTime();
        if (!isFinite(t)) return '';
        var d = new Date(t + 8 * 3600 * 1000);
        return (d.getUTCMonth() + 1) + ' 月 ' + d.getUTCDate() + ' 日';
    }

    /* 把「資料庫的錯誤代碼」翻成給玩家看的話。
       err：錯誤代碼（identity 的呼叫結果的 error；網路問題一律是 'network'）；data：資料庫回傳的整包 JSON（有些錯誤附帶細節）；
       nick：玩家輸入的暱稱（訊息裡要用）。 */
    function errorText(err, data, nick) {
        data = data || {};
        var n = nick ? '「' + nick + '」' : '這個暱稱';
        switch (err) {
            case 'wrong_pin': return '密碼不對，還可以試 ' + (data.attempts_left != null ? data.attempts_left : 1) + ' 次';
            case 'locked': return '密碼輸入錯誤太多次，請 ' + fmtWait(data.wait_seconds) + '後再試';
            case 'bad_pin': return '密碼要剛好 4 個數字';
            case 'bad_nick': return '暱稱要 1～' + LB.CFG.NICK_MAX + ' 個字，也不能使用這個名字';
            case 'nick_taken': return n + '已經有人使用了';
            case 'nick_reserved': return n + '目前保留給另一位舊玩家' + (data.until ? '（到 ' + fmtDate(data.until) + '）' : '') + '，請換一個暱稱';
            case 'no_such_player': return '找不到這個暱稱，請確認有沒有打錯';
            case 'busy': return '現在建立帳號的人太多，請過一會兒再試';
            case 'not_qualified': return '剛剛有人比你快一步，這次沒有進榜，帳號先不建立';
            case 'rename_too_many': return '今天已經改了 ' + (data.limit || CFG.RENAME_PER_DAY) + ' 次暱稱，明天再改吧';
            case 'bad_token': return '登入已經失效，請重新登入';
            case 'same_player': return '這就是目前登入的帳號';
            case 'already_claimed': return '這個帳號已經建立過了，請改用登入';
            case 'unknown_legacy': return '找不到你以前的紀錄';
            case 'network': case 'timeout': case 'unsupported': return '連不上網路，請稍後再試';
            default: return '這次沒有成功，請稍後再試';
        }
    }

    /* 資料庫呼叫的結果（{ok, error, data}）是不是「連不上網路」這一類（不是資料庫明確拒絕） */
    function isNetworkError(err) {
        return err === 'network' || err === 'timeout' || err === 'unsupported';
    }

    /* 兩個「最佳」誰比較好（better：'min' 越小越好、'max' 越大越好；a 是 null 當作最差） */
    function betterOf(a, b, better) {
        if (a == null) return b;
        if (b == null) return a;
        return LB.isBetter(a, b, better) ? a : b;
    }

    /* 資料庫回傳的一項最佳 { g, b, s, lv }：格式正確才收（防止壞資料寫進本機） */
    function cleanServerItem(it) {
        if (!it || typeof it.g !== 'string' || !ID_RE.test(it.g)) return null;
        var out = { g: it.g, b: it.b === 'min' ? 'min' : 'max' };
        if (typeof it.s === 'number' && isFinite(it.s)) out.s = it.s;
        if (typeof it.lv === 'number' && isFinite(it.lv) && it.lv >= 1 && it.lv === Math.floor(it.lv)) out.lv = it.lv;
        return (out.s == null && out.lv == null) ? null : out;
    }

    /* ═══════════════════════════════════════════════════════════════
       二、呼叫資料庫（全部包成「永遠不丟例外」，結果一律是 { ok, error, data }）
       ═══════════════════════════════════════════════════════════════ */

    /* ok:true → data 是函式回傳的 JSON；ok:false → error 是代碼：資料庫明確拒絕＝它回的 error；
       連不上／逾時／函式不存在（404，例如還沒執行新版 SQL）＝ 'network'／'timeout'／'unsupported'。 */
    function call(name, args) {
        return LB.rpc(name, args, CFG.TIMEOUT_MS).then(function (r) {
            if (!r.ok) return { ok: false, error: r.error === 'http_404' ? 'unsupported' : (r.error === 'timeout' ? 'timeout' : 'network'), raw: r };
            var d = r.data;
            if (d && d.ok === false) return { ok: false, error: d.error || 'unknown', data: d };
            return { ok: true, data: d };
        });
    }

    function checkNick(nick, legacyPid) {
        return call('MF_check_nick', { p_nick: nick, p_legacy_pid: legacyPid || null });
    }
    function legacyStatus(pid) {
        return call('MF_legacy_status', { p_player_id: pid });
    }

    /* 新玩家：建立帳號＋寫入第一筆成績（同一個動作；成績進不了榜就不建帳號） */
    function register(nick, pin, gameId, score) {
        return call('MF_register', { p_nick: nick, p_pin: pin, p_game_id: gameId, p_score: score });
    }
    /* 舊玩家認領：把暱稱＋密碼設在他原本的舊代號上；暱稱已被帳號使用時＝輸入同一組密碼就併入那個帳號 */
    function claim(nick, pin) {
        return call('MF_claim_legacy', { p_legacy_pid: LB.peekPid(), p_nick: nick, p_pin: pin });
    }
    /* 登入：舊玩家（還沒認領）登入時，帶上這支瀏覽器的舊代號，榜上的舊成績一併併進帳號 */
    function login(nick, pin) {
        return call('MF_login', { p_nick: nick, p_pin: pin, p_legacy_pid: LB.identityState() === 'legacy' ? LB.peekPid() : null });
    }
    /* 後悔藥：把目前登入的帳號合併到另一個帳號（暱稱＋密碼證明我是它） */
    function loginAndMerge(nick, pin) {
        return call('MF_login_and_merge', { p_player_id: LB.peekPid(), p_token: LB.token(), p_nick: nick, p_pin: pin });
    }

    /* 登入／建立／認領成功之後的收尾：存下身分 → 同步個人最佳 → 補送待送成績（opts.skipFlush：由呼叫的人自己處理，避免同一筆成績送兩次） */
    function finishSession(d, opts) {
        opts = opts || {};
        if (!LB.setSession(d)) return Promise.resolve(false);
        del(KEY_HINT);
        store().set(KEY_SYNCAT, 0);
        LB.forgetOvertaken();
        log('已登入', d.nick);
        return syncBests({ all: true }).then(function () {
            if (!opts.skipFlush) LB.flushPending();
            return true;
        });
    }

    function rename(nick) {
        return call('MF_rename', { p_player_id: LB.peekPid(), p_token: LB.token(), p_nick: nick }).then(function (r) {
            if (r.ok && r.data && r.data.nick) LB.cacheNick(r.data.nick);
            if (!r.ok && r.error === 'bad_token') LB.markRelogin();
            return r;
        });
    }
    function changePin(pin) {
        return call('MF_change_pin', { p_player_id: LB.peekPid(), p_token: LB.token(), p_new_pin: pin }).then(function (r) {
            if (!r.ok && r.error === 'bad_token') LB.markRelogin();
            return r;
        });
    }
    /* 確認憑證還有效、順便更新暱稱快取（別台改了暱稱，這台才會跟著變）；憑證失效就標記需要重新登入 */
    function whoami() {
        if (!LB.isLoggedIn()) return Promise.resolve({ ok: false, error: 'bad_token' });
        return call('MF_whoami', { p_player_id: LB.peekPid(), p_token: LB.token() }).then(function (r) {
            if (r.ok) { if (r.data.nick) LB.cacheNick(r.data.nick); store().set(KEY_WHOAMIAT, Date.now()); }
            else if (r.error === 'bad_token') LB.markRelogin();
            return r;
        });
    }

    /* 登出：刪掉這把憑證，並清掉這支瀏覽器上的帳號資料與個人最佳（家人共用一支手機時，不會把前一位的紀錄混進下一位的帳號；
       都存在帳號裡了，本人下次登入就會全部回來）。連不上網路也照樣在這支瀏覽器登出。 */
    function logout() {
        var pid = LB.peekPid(), tok = LB.token();
        var p = tok ? call('MF_logout', { p_player_id: pid, p_token: tok }) : Promise.resolve({ ok: true });
        return p.then(function (r) {
            LB.clearIdentity();
            clearLocalBests();
            return r;
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       三、個人最佳同步
       ═══════════════════════════════════════════════════════════════ */

    /* 這支瀏覽器上有哪些遊戲有個人最佳（掃 localStorage 的 key；只認格式正確的遊戲代號，遷移旗標 .v2 之類的不算） */
    function localGameIds() {
        var ids = {};
        try {
            Object.keys(global.localStorage).forEach(function (k) {
                var rest = k.indexOf(PREFIX_BEST) === 0 ? k.slice(PREFIX_BEST.length) : (k.indexOf(PREFIX_LV) === 0 ? k.slice(PREFIX_LV.length) : null);
                if (rest && ID_RE.test(rest)) ids[rest] = 1;
            });
        } catch (e) { }
        return Object.keys(ids);
    }
    function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
    function localBest(id) { return num(store().get(PREFIX_BEST + id, null)); }
    function localLv(id) {
        var v = num(store().get(PREFIX_LV + id, 0));
        return v && v > 0 ? Math.floor(v) : 0;
    }
    /* 這款遊戲的本機最佳成績確認是現行單位（可以上傳、也不用換算）嗎 */
    function trusted(id) { return !!store().get(PREFIX_BEST + id + '.sync', false); }
    function markTrusted(id) { store().set(PREFIX_BEST + id + '.sync', true); }

    /* 要上傳的項目：最佳關卡（V1.34 起才有，一定是現行單位）一律上傳；最佳成績只傳「確認是現行單位」的。 */
    function collect(ids) {
        var items = [];
        (ids || localGameIds()).forEach(function (id) {
            if (!ID_RE.test(id)) return;
            var it = { g: id }, s = localBest(id), lv = localLv(id);
            if (s != null && trusted(id)) it.s = s;
            if (lv > 0) it.lv = lv;
            if (it.s != null || it.lv != null) items.push(it);
        });
        return items;
    }

    /* 把資料庫回傳的最佳合併進這支瀏覽器：
         · 這款遊戲的本機最佳還沒確認過單位（沒有 .sync 記號）→ 直接採用資料庫的（本機那份可能是舊單位，不能比）；
         · 已確認 → 取較好的；最佳關卡一律取較大的。 */
    function applyServer(items) {
        var changed = 0;
        (items || []).forEach(function (raw) {
            var it = cleanServerItem(raw);
            if (!it) return;
            if (it.s != null) {
                var cur = localBest(it.g);
                if (cur == null || !trusted(it.g) || LB.isBetter(it.s, cur, it.b)) {
                    if (cur !== it.s) changed++;
                    store().set(PREFIX_BEST + it.g, it.s);
                }
                markTrusted(it.g);
            }
            if (it.lv != null && it.lv > localLv(it.g)) { store().set(PREFIX_LV + it.g, it.lv); changed++; }
        });
        return changed;
    }

    /* 同步：opts.all＝全部（登入、定期）；opts.ids＝只同步這幾款。上傳本機的、下載資料庫的，合併到本機。回傳 Promise<{ok,…}> */
    function syncBests(opts) {
        opts = opts || {};
        if (!LB.isLoggedIn()) return Promise.resolve({ ok: false, error: 'bad_token' });
        var items = collect(opts.ids || null);
        return call('MF_sync_bests', { p_player_id: LB.peekPid(), p_token: LB.token(), p_items: items }).then(function (r) {
            if (!r.ok) {
                if (r.error === 'bad_token') LB.markRelogin();
                log('個人最佳同步失敗：', r.error);
                return r;
            }
            var n = applyServer(r.data.items);
            if (opts.all) store().set(KEY_SYNCAT, Date.now());
            /* 這次上傳過的項目，從「待上傳」名單拿掉 */
            var pend = store().get(KEY_BESTPEND, {}) || {};
            items.forEach(function (it) { delete pend[it.g]; });
            store().set(KEY_BESTPEND, pend);
            log('個人最佳同步完成：上傳', items.length, '項、本機更新', n, '項' + (r.data.rejected && r.data.rejected.length ? '、被拒收 ' + r.data.rejected.join('／') : ''));
            return r;
        });
    }

    var bestTimer = null;
    /* 某款遊戲破了個人紀錄（Reaction.setBest／kit.noteLevel 呼叫）：記進待上傳名單，3 秒後批次上傳（連續破紀錄只送一次）。
       還沒登入就不用記：登入的時候會把本機全部上傳。 */
    function noteBest(id) {
        if (!id || !ID_RE.test(id) || !LB.isLoggedIn()) return;
        var pend = store().get(KEY_BESTPEND, {}) || {};
        pend[id] = 1;
        store().set(KEY_BESTPEND, pend);
        if (bestTimer) return;
        bestTimer = global.setTimeout(function () { bestTimer = null; flushBests(); }, CFG.BEST_DEBOUNCE_MS);
    }
    function flushBests() {
        var pend = store().get(KEY_BESTPEND, {}) || {};
        var ids = Object.keys(pend);
        if (!ids.length || !LB.isLoggedIn()) return Promise.resolve(null);
        return syncBests({ ids: ids });
    }

    /* 進遊戲：這款遊戲的 mount 已經跑完（舊單位的遷移都做完了），本機的最佳成績可以信任了——做記號；已登入就同步這一款 */
    function gameMounted(id) {
        if (!id || !ID_RE.test(id)) return;
        if (localBest(id) != null && !trusted(id)) markTrusted(id);
        if (LB.isLoggedIn()) syncBests({ ids: [id] });
    }

    /* 登出時清掉本機個人最佳：只清「最佳成績本身」與 .sync 記號、最佳關卡（遷移旗標 .v2 之類的要留著，不然舊單位的遷移會再跑一次） */
    function clearLocalBests() {
        try {
            Object.keys(global.localStorage).forEach(function (k) {
                if (k.indexOf(PREFIX_BEST) === 0) {
                    var rest = k.slice(PREFIX_BEST.length);
                    if (ID_RE.test(rest) || (/\.sync$/.test(rest) && ID_RE.test(rest.slice(0, -5)))) global.localStorage.removeItem(k);
                } else if (k.indexOf(PREFIX_LV) === 0 && ID_RE.test(k.slice(PREFIX_LV.length))) {
                    global.localStorage.removeItem(k);
                }
            });
        } catch (e) { }
        [KEY_BESTPEND, KEY_SYNCAT, KEY_WHOAMIAT, KEY_HINT].forEach(del);
    }

    /* ═══════════════════════════════════════════════════════════════
       四、流程：舊玩家認領、成績進榜時建立帳號／重新登入、開頁面時的檢查
       畫面由 js/identity_ui.js 的 Identity.ui.accountDialog 負責，這裡決定「現在該跳哪一個、結果怎麼接」。
       accountDialog 的結果 kind：
         'registered'（新玩家建好帳號、成績也寫進去了，data 是資料庫回傳的榜單）／'logged-in'／'cancel'／'not-qualified'／'offline'
       ═══════════════════════════════════════════════════════════════ */

    var legacyBusy = null;

    /* 舊玩家認領。先問資料庫這個舊代號是什麼情況：
         unclaimed → 跳「建立暱稱與密碼」（沒有關閉鈕）；
         claimed   → 這個代號已經有帳號、只是這支瀏覽器沒憑證 → 轉成「需要重新登入」；
         unknown   → 資料庫沒有這個代號的紀錄（早就掉出所有前 30 名）→ 當新玩家：清掉舊代號與舊暱稱（暱稱留作預設值）；
         連不上網路 → 這次略過（不卡住玩家，下次進來再跳）。
       回傳 Promise<{kind: 'logged-in'|'offline'|'relogin'|'guest'}>。 */
    function ensureLegacy(opts) {
        opts = opts || {};
        if (LB.identityState() !== 'legacy') return Promise.resolve({ kind: LB.identityState() === 'in' ? 'logged-in' : LB.identityState() });
        if (legacyBusy) return legacyBusy;
        var pid = LB.peekPid(), localNick = LB.getNick();
        legacyBusy = legacyStatus(pid).then(function (r) {
            if (!r.ok) { log('舊玩家狀態查不到（', r.error, '）→ 這次先略過'); return { kind: 'offline' }; }
            var st = r.data.state;
            if (st === 'claimed') { LB.markRelogin(); return { kind: 'relogin' }; }
            if (st === 'unknown') {
                store().set(KEY_HINT, localNick);
                LB.dropLegacy();                  /* 舊代號與舊暱稱丟掉、當新玩家（待送的成績與意見留著，帳號建好之後補送） */
                return { kind: 'guest' };
            }
            if (!Identity.ui) return { kind: 'offline' };
            return Identity.ui.accountDialog({
                mode: 'legacy', cancelable: false, initialNick: r.data.nick || localNick, skipFlush: !!opts.skipFlush
            });
        }).then(function (res) { legacyBusy = null; return res; }, function () { legacyBusy = null; return { kind: 'offline' }; });
        return legacyBusy;
    }

    /* 成績有機會進前 30 名、但這支瀏覽器還沒有可用的帳號：依身分決定跳哪個彈窗（Leaderboard.submit 呼叫）。
       回傳 Promise<{kind}>，kind 見上面。 */
    function gateForScore(g, spec, score) {
        if (!Identity.ui) return Promise.resolve({ kind: 'cancel' });
        var st = LB.identityState();
        if (st === 'legacy') {
            return ensureLegacy({ skipFlush: true }).then(function (r) {
                if (r.kind === 'relogin' || r.kind === 'guest') return gateForScore(g, spec, score);
                return r;
            });
        }
        if (st === 'relogin') {
            return Identity.ui.accountDialog({ mode: 'login', cancelable: true, initialNick: LB.getNick(), skipFlush: true });
        }
        if (st === 'in') return Promise.resolve({ kind: 'logged-in' });
        return Identity.ui.accountDialog({
            mode: 'new', cancelable: true, game: g, spec: spec, score: score, initialNick: store().get(KEY_HINT, '') || '', skipFlush: true
        });
    }

    /* 玩家主動要登入（世界排行榜彈窗的「我已有帳號，登入」、帳號面板）。回傳 Promise<{kind}> */
    function askLogin() {
        if (!Identity.ui) return Promise.resolve({ kind: 'cancel' });
        return Identity.ui.accountDialog({ mode: 'login', cancelable: true, initialNick: LB.getNick() || store().get(KEY_HINT, '') || '' });
    }

    /* 開頁面時呼叫一次（index.html 與 reaction.html 都會；稍等一下讓畫面先出來）：
         舊玩家 → 立刻跳認領彈窗；已登入 → 背景確認憑證、補送待送的成績與最佳紀錄、定期同步個人最佳。 */
    var booted = false;
    function boot() {
        if (booted) return;
        booted = true;
        global.UI.wait(CFG.BOOT_DELAY_MS).then(function () {
            var st = LB.identityState();
            if (st === 'legacy') {
                ensureLegacy({}).then(function (r) { log('舊玩家認領結果：', r.kind); });
            } else if (st === 'in') {
                var now = Date.now();
                var last = store().get(KEY_WHOAMIAT, 0) || 0;
                var p = (now - last > CFG.WHOAMI_TTL_MS || last > now) ? whoami() : Promise.resolve({ ok: true });
                p.then(function (r) {
                    if (!r.ok) return null;
                    var synced = store().get(KEY_SYNCAT, 0) || 0;
                    if (Date.now() - synced > CFG.SYNC_TTL_MS || synced > Date.now()) return syncBests({ all: true });
                    return flushBests();
                });
            }
        });
    }

    /* ═══ 對外介面 ═══ */
    Identity.CFG = CFG;
    Identity.state = function () { return LB.identityState(); };
    Identity.checkNick = checkNick;
    Identity.legacyStatus = legacyStatus;
    Identity.register = register;
    Identity.claim = claim;
    Identity.login = login;
    Identity.loginAndMerge = loginAndMerge;
    Identity.finishSession = finishSession;
    Identity.rename = rename;
    Identity.changePin = changePin;
    Identity.whoami = whoami;
    Identity.logout = logout;
    Identity.syncBests = syncBests;
    Identity.noteBest = noteBest;
    Identity.flushBests = flushBests;
    Identity.gameMounted = gameMounted;
    Identity.ensureLegacy = ensureLegacy;
    Identity.gateForScore = gateForScore;
    Identity.askLogin = askLogin;
    Identity.boot = boot;
    Identity.cleanPin = cleanPin;
    Identity.validPin = validPin;
    Identity.errorText = errorText;
    Identity.isNetworkError = isNetworkError;
    Identity.nickHint = function () { return store().get(KEY_HINT, '') || ''; };
    Identity.ui = null;          /* js/identity_ui.js 載入後把畫面功能掛在這裡 */
    Identity.test = {
        cleanPin: cleanPin, validPin: validPin, fmtWait: fmtWait, fmtDate: fmtDate, errorText: errorText, isNetworkError: isNetworkError,
        betterOf: betterOf, cleanServerItem: cleanServerItem, localGameIds: localGameIds, collect: collect, applyServer: applyServer,
        clearLocalBests: clearLocalBests, call: call, KEY_BESTPEND: KEY_BESTPEND, KEY_SYNCAT: KEY_SYNCAT, KEY_HINT: KEY_HINT, KEY_WHOAMIAT: KEY_WHOAMIAT,
        PREFIX_BEST: PREFIX_BEST, PREFIX_LV: PREFIX_LV, flushBests: flushBests, trusted: trusted
    };

    global.Identity = Identity;
    LB.identity = Identity;

    /* 開頁面就開始檢查（等 DOM 準備好、其他檔案載入完）。測試環境（Node）沒有 document，不會自動跑。 */
    if (global.document && global.document.readyState !== 'loading') boot();
    else if (global.document) global.document.addEventListener('DOMContentLoaded', boot);
})(window);
