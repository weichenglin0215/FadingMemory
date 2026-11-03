/* ═══════════════════════════════════════════════════════════════════
   offline.js — 「安裝與離線」的資料與動作（FMOffline；V1.38.0，只在主選單載入）
   ───────────────────────────────────────────────────────────────────
   參考花月的 offline.js／offlineDialog.js（C:\3D_prj\VS_2022_prj\FlowerMoon_web）。花月自己有一套 Service Worker 流程（預快取清單＋完整離線包＋省流量模式），
   這個專案的 Service Worker（sw.js）比較簡單：網路優先、整個專案一次備份、版本變了就整份重新備份，所以這裡不需要「離線包」「省流量」那幾塊。
   畫面（彈窗）在 js/offline_ui.js；這個檔案只管：
     · status()       彙整要顯示的所有資訊：有沒有加到主畫面、Service Worker 備份了幾個檔案、雲端同步、儲存空間
     · buildRows(s)   把 status 變成要顯示的幾列（純函式，Node 測試直接驗證 test/reaction/t_offline.js）
     · checkUpdate()  檢查有沒有新版本（讀 version.json、也請瀏覽器檢查 sw.js）
     · applyUpdate()  請 Service Worker 把全部檔案重新備份一次，再重新載入
     · clearAll()     清掉離線資料（取消 Service Worker、刪掉備份）再重新載入；成績、暱稱、設定（localStorage）完全不動
     · syncNow()      立刻補送還沒上傳的成績／意見／個人最佳
   跟 Service Worker 講話的方式：sw.js 有 message 事件，收到 STATUS 回「清單有幾個檔案、備份裡已經有幾個」，收到 REFRESH 就整份重新備份（refreshAll）。
   所有文字都用 textContent 寫進畫面，不拼 HTML。
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var CACHE_PREFIX = 'fm-';            /* sw.js 的快取名字都以 fm- 開頭（現在只有 fm-cache-v1）；清除時只動這一類 */
    var SW_ASK_MS = 3000;                /* 問 Service Worker 狀態最多等幾毫秒 */
    var SW_REFRESH_MS = 30000;           /* 請它整份重新備份最多等幾毫秒（大約 5 MB，慢網路要久一點） */
    var UPDATE_MS = 8000;                /* 讀 version.json 最多等幾毫秒 */

    /* ═══ 一、純函式（Node 測試用）═══ */

    function formatBytes(n) {
        if (typeof n !== 'number' || !isFinite(n)) return '?';
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
        if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
        return (n / 1073741824).toFixed(2) + ' GB';
    }

    /* 這個環境為什麼「不能」離線？回傳原因代碼；可以的話回傳 ''。
       env：{ hasSW 瀏覽器有沒有 Service Worker、inApp 內建瀏覽器的名字（沒有＝''）、secure 是不是安全環境（https 或 localhost）} */
    function blockedReason(env) {
        if (!env.hasSW) return 'unsupported';
        if (env.inApp) return 'inapp';
        if (!env.secure) return 'insecure';
        return '';
    }

    /* 還沒上傳的東西，說成人話：「3 筆成績、1 筆個人最佳、2 則意見」；都沒有回傳 '' */
    function pendingText(p) {
        var out = [];
        if (p && p.scores) out.push(p.scores + ' 筆成績');
        if (p && p.bests) out.push(p.bests + ' 筆個人最佳');
        if (p && p.feedback) out.push(p.feedback + ' 則意見');
        return out.join('、');
    }

    /* 把 status 變成要顯示的列。回傳 [ { id, title, text, ok, action: { label, act } | null }, … ]
       act 是動作代號，畫面（offline_ui.js）依它決定按下去要做什麼：
         guide 打開「加到主畫面」說明｜inapp 打開「請改用瀏覽器」說明｜recheck 重新檢查｜sync 立即同步｜login 登入｜relogin 重新登入｜legacy 建立密碼｜
         update 檢查更新｜apply 立即更新｜clear 清除離線資料
       upd：「檢查更新」的結果（沒按過是 null）：{ kind: 'latest'｜'newer'｜'offline'｜'error', latest: 新版本號 } */
    function buildRows(s, upd) {
        var rows = [], text, ok = false, action = null;

        /* 加到主畫面 */
        if (s.standalone) { text = '✓ 已經加到主畫面了'; ok = true; }
        else if (s.inApp) { text = '目前在「' + s.inApp + '」內建瀏覽器裡，無法加到主畫面，也無法離線遊玩。請改用手機的瀏覽器開啟。'; action = { label: '怎麼辦？', act: 'inapp' }; }
        else if (s.canGuide) { text = '還沒有加到主畫面。加了之後，點一下圖示就能玩，不必再找連結。'; action = { label: '加到主畫面', act: 'guide' }; }
        else text = '還沒有加到主畫面。用手機的瀏覽器開啟這個網址，就能加到主畫面。';
        rows.push({ id: 'install', title: '加到主畫面', text: text, ok: ok, action: action });

        /* 離線遊玩 */
        ok = false; action = null;
        var why = s.blocked;
        if (why === 'inapp') text = '內建瀏覽器不支援離線遊玩，請改用手機的瀏覽器開啟。';
        else if (why === 'unsupported') text = '這個瀏覽器不支援離線遊玩。';
        else if (why === 'insecure') text = '需要 https 連線才能離線遊玩。';
        else if (s.cache.precache > 0 && s.cache.cached >= s.cache.precache) {
            text = '✓ 已就緒（版本 ' + s.version + '）：' + s.cache.precache + ' 個遊戲檔案都存在這支手機裡，沒有網路時也可以玩（排行榜與雲端同步除外）。'; ok = true;
        } else if (s.cache.precache > 0) {
            text = '正在把遊戲檔案存進手機…（已存 ' + s.cache.cached + '／' + s.cache.precache + '），請稍候再回來看。'; action = { label: '重新檢查', act: 'recheck' };
        } else {
            text = '第一次開啟時，遊戲會在背景把檔案存進手機，完成後就能離線遊玩。'; action = { label: '重新檢查', act: 'recheck' };
        }
        rows.push({ id: 'offline', title: '離線遊玩', text: text, ok: ok, action: action });

        /* 雲端同步 */
        ok = false; action = null;
        var y = s.sync || { state: 'guest', nick: '', pending: {} }, pend = pendingText(y.pending);
        if (y.state === 'in') {
            if (pend) {
                text = '還有 ' + pend + ' 沒上傳' + (s.online ? '。' : '，連上網路後會自動上傳。');
                if (s.online) action = { label: '立即同步', act: 'sync' };
            } else { text = '✓ 已登入' + (y.nick ? '「' + y.nick + '」' : '') + '，成績與最佳紀錄都已同步。'; ok = true; }
        } else if (y.state === 'relogin') { text = '登入已經失效，成績先存在這支手機，登入後會補上傳。'; action = { label: '重新登入', act: 'relogin' }; }
        else if (y.state === 'legacy') { text = '你的暱稱還沒有設密碼，設好之後成績才能跨手機同步。'; action = { label: '建立密碼', act: 'legacy' }; }
        else {
            text = '還沒有帳號，成績只存在這支手機。成績進世界前 30 名時會請你取暱稱、設密碼，之後換手機也帶得走。' + (pend ? '\n還有 ' + pend + ' 等你建立帳號後上傳。' : '');
            action = { label: '登入帳號', act: 'login' };
        }
        rows.push({ id: 'sync', title: '雲端同步', text: text, ok: ok, action: action });

        /* 儲存空間 */
        var st = s.storage || {};
        if (st.usage == null) text = '這個瀏覽器沒有提供儲存空間的資訊。';
        else {
            text = '已使用 ' + formatBytes(st.usage) + (st.quota ? '（上限約 ' + formatBytes(st.quota) + '）' : '');
            if (st.persisted === true) text += '\n✓ 已申請長期保留，不容易被系統清掉';
            else if (st.persisted === false) text += '\n還沒有取得長期保留；加到主畫面後最穩定';
        }
        rows.push({ id: 'storage', title: '儲存空間', text: text, ok: st.persisted === true, action: null });

        /* 檢查更新 */
        action = { label: '檢查更新', act: 'update' }; ok = false;
        text = '目前版本 ' + (s.version || '？');
        if (upd && upd.kind === 'latest') { text = '✓ 已是最新版本（' + s.version + '）'; ok = true; }
        else if (upd && upd.kind === 'newer') { text = '有新版本 ' + upd.latest + '，目前是 ' + s.version + '。'; action = { label: '立即更新', act: 'apply' }; }
        else if (upd && upd.kind === 'offline') text = '目前沒有網路，無法檢查。目前版本 ' + s.version;
        else if (upd && upd.kind === 'error') text = '這次沒有檢查成功，請稍後再試。目前版本 ' + s.version;
        rows.push({ id: 'update', title: '檢查更新', text: text, ok: ok, action: action });

        /* 清除離線資料 */
        rows.push({
            id: 'clear', title: '清除離線資料',
            text: '清掉存在手機裡的遊戲檔案並重新載入，之後會重新下載。你的成績、暱稱與設定都不會被清掉。',
            ok: false, action: { label: '清除離線資料', act: 'clear' }
        });
        return rows;
    }

    /* 版本比較：兩個版本字串不一樣就算「有新版」（version.json 只會往前走；本機版是 local-時間戳記，一定不同，不當成有新版——呼叫端先排除） */
    function isNewer(latest, current) {
        if (latest == null || current == null) return false;
        if (/^local-/.test(String(current))) return false;
        return String(latest) !== String(current);
    }

    /* ═══ 二、跟 Service Worker 講話 ═══ */

    function getReg() {
        if (!(global.navigator && 'serviceWorker' in global.navigator)) return Promise.resolve(null);
        return global.navigator.serviceWorker.getRegistration().then(function (r) { return r || null; }, function () { return null; });
    }

    /* 問正在運作的 Service Worker（type：'STATUS'｜'REFRESH'），回傳它的回覆；沒有 Service Worker、逾時、出錯都回傳 null */
    function ask(type, ms) {
        return getReg().then(function (reg) {
            var w = reg && (reg.active || reg.waiting || reg.installing);
            if (!w || !global.MessageChannel) return null;
            return new Promise(function (resolve) {
                var ch = new global.MessageChannel(), done = false;
                var finish = function (v) { if (!done) { done = true; resolve(v); } };
                ch.port1.onmessage = function (e) { finish(e.data || null); };
                global.setTimeout(function () { finish(null); }, ms);
                try { w.postMessage({ type: type }, [ch.port2]); } catch (e) { finish(null); }
            });
        });
    }

    /* ═══ 三、狀態 ═══ */
    function status() {
        var nav = global.navigator, LB = global.Leaderboard, PWA = global.PWA;
        var env = PWA && PWA.state ? PWA.state() : { inApp: '', standalone: false };
        var s = {
            online: nav.onLine !== false,
            standalone: !!env.standalone,
            inApp: env.inApp || '',
            canGuide: !!(PWA && PWA.canGuide && PWA.canGuide()),
            version: (global.FM_VERSION && global.FM_VERSION.version) || '',
            cache: { precache: 0, cached: 0 },
            storage: { usage: null, quota: null, persisted: null },
            sync: { state: LB ? LB.identityState() : 'guest', nick: LB ? LB.getNick() : '', pending: LB && LB.pendingCount ? LB.pendingCount() : {} },
            blocked: ''
        };
        s.blocked = blockedReason({ hasSW: 'serviceWorker' in nav, inApp: s.inApp, secure: global.isSecureContext !== false });
        var tasks = [];
        if (!s.blocked) {
            tasks.push(ask('STATUS', SW_ASK_MS).then(function (r) {
                if (r && r.type === 'STATUS' && !r.error) { s.cache.precache = r.precache | 0; s.cache.cached = r.cached | 0; }
            }));
        }
        if (nav.storage && nav.storage.estimate) {
            tasks.push(nav.storage.estimate().then(function (e) { s.storage.usage = e.usage; s.storage.quota = e.quota; }, function () { }));
            if (nav.storage.persisted) tasks.push(nav.storage.persisted().then(function (p) { s.storage.persisted = p; }, function () { }));
        }
        return Promise.all(tasks).then(function () { return s; });
    }

    /* ═══ 四、動作 ═══ */

    /* 檢查更新：讀 version.json（不吃快取）跟目前的版本比；順便請瀏覽器檢查 sw.js 有沒有新的。回傳 { kind, latest } */
    function checkUpdate() {
        if (global.navigator.onLine === false) return Promise.resolve({ kind: 'offline' });
        var current = (global.FM_VERSION && global.FM_VERSION.version) || '';
        var get = global.fetch('version.json?_=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; });  /* Date.now()：現在的時間（毫秒），拿來算「經過了多久」 */
        var timeout = new Promise(function (resolve) { global.setTimeout(function () { resolve(null); }, UPDATE_MS); });
        return getReg().then(function (reg) { if (reg && reg.update) reg.update().catch(function () { }); }).then(function () {  /* catch：Promise（承諾）失敗時才執行的函式，這裡用來吞掉錯誤，避免整個程式中斷 */
            return Promise.race([get, timeout]);
        }).then(function (latest) {
            if (!latest || latest.version == null) return { kind: 'error' };
            return isNewer(latest.version, current) ? { kind: 'newer', latest: String(latest.version) } : { kind: 'latest', latest: String(latest.version) };
        }, function () { return { kind: 'error' }; });
    }

    /* 立即更新：請 Service Worker 把全部檔案重新備份（它用 cache:'no-cache' 重新拿），完成之後重新載入就是最新版；Service Worker 沒回應也照樣重新載入 */
    function applyUpdate() {
        return ask('REFRESH', SW_REFRESH_MS).then(function () { global.location.reload(); });
    }

    /* 清除離線資料：取消 Service Worker、刪掉 fm- 開頭的快取，然後重新載入（會重新註冊、重新備份）。localStorage 完全不碰。 */
    function clearAll() {
        var p = Promise.resolve();
        if ('serviceWorker' in global.navigator) {
            p = global.navigator.serviceWorker.getRegistrations().then(function (regs) {
                return Promise.all(regs.map(function (r) { return r.unregister(); }));  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            }).catch(function () { });
        }
        return p.then(function () {
            if (!global.caches) return;
            return global.caches.keys().then(function (names) {
                return Promise.all(names.filter(function (n) { return n.indexOf(CACHE_PREFIX) === 0; }).map(function (n) { return global.caches.delete(n); }));  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
            });
        }).catch(function () { }).then(function () { global.location.reload(); });
    }

    /* 立刻同步：補送成績與意見、已登入的話再同步個人最佳。回傳 Promise（一定 resolve） */
    function syncNow() {
        var LB = global.Leaderboard, ID = global.Identity;
        if (!LB || !LB.flushAll) return Promise.resolve();
        return LB.flushAll().then(function () {
            return ID && ID.syncBests && LB.isLoggedIn() ? ID.syncBests({ all: true }) : null;
        }).catch(function () { });
    }

    global.FMOffline = {
        status: status, buildRows: buildRows, checkUpdate: checkUpdate, applyUpdate: applyUpdate, clearAll: clearAll, syncNow: syncNow,
        formatBytes: formatBytes, blockedReason: blockedReason, pendingText: pendingText, isNewer: isNewer,
        test: { ask: ask }
    };
})(window);
