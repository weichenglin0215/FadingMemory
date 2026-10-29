/* ═══════════════════════════════════════════════════════════════════
   pwa.js — 主選單的「別讓玩家找不到遊戲」三件事（只在 index.html 載入）
   ───────────────────────────────────────────────────────────────────
   背景：朋友掃 QR Code 或在 LINE 點連結玩過一次，之後找不到連結就再也玩不到。解法是讓遊戲「住」在手機上：
     1. 加到主畫面（PWA）：桌面出現「記憶模糊」圖示，點開像 App；sw.js 把遊戲檔案存在手機裡，沒網路也能玩。
     2. LINE／臉書／Instagram／微信的「內建瀏覽器」不能安裝、成績記錄也跟 Safari／Chrome 分開 →
        偵測到就跳一個提示，請玩家改用瀏覽器開（分享出去的連結另外帶 ?openExternalBrowser=1，見 js/share.js，
        但舊的 QR Code／連結沒有這個參數，所以這裡的偵測是必要的退路）。
     3. 適當的時機提醒「加到主畫面」：不在第一次，而是玩家第 3 次回到選單時提示一次（之後 14 天內不再煩人）；
        另外分享彈窗裡有常駐的「加到手機主畫面」按鈕（js/share.js 呼叫 PWA.openGuide）。
   各平台的安裝方式不一樣：
     · Android Chrome／Edge：瀏覽器會送 beforeinstallprompt 事件，存起來，按「安裝」時再呼叫 prompt()，一鍵安裝；
     · iPhone／iPad Safari：沒有程式可以觸發，只能教玩家「分享 → 加入主畫面」；
     · iPhone 上的 Chrome／Firefox／Edge：iOS 16.4 起也有「加入主畫面」，但能不能離線要看瀏覽器，說明裡不保證；
     · 已經是從主畫面開的（standalone）：什麼都不用提示。
   【對外介面】全域 PWA：
     PWA.canGuide()    現在適合給「加到主畫面」的說明嗎（手機、還沒安裝、不在內建瀏覽器裡）
     PWA.openGuide()   打開對應平台的說明彈窗（Android 有一鍵安裝按鈕）
     PWA.state()       目前偵測到的環境（除錯用）
     PWA.test.detect(env)  純函式（不碰 DOM），Node 測試直接驗證（test/reaction/t_pwa.js）
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    var KEY_VISITS = 'fm.pwa.visits';      /* 玩家回到選單的次數（每個瀏覽器工作階段算一次） */
    var KEY_ASKED = 'fm.pwa.asked';        /* 上次自動跳出「加到主畫面」提示的時間（毫秒） */
    var SS_COUNTED = 'fm.pwa.counted';     /* sessionStorage：這次工作階段已經算過一次回訪了 */
    var SS_INAPP = 'fm.pwa.inapp';         /* sessionStorage：這次工作階段已經提醒過「請用瀏覽器開」了 */
    var PROMPT_VISITS = 3;                 /* 第幾次回到選單才自動提示 */
    var SNOOZE_MS = 14 * 24 * 3600 * 1000; /* 提示過之後，至少隔幾天才會再自動跳出來 */
    var PROMPT_DELAY_MS = 1800;            /* 選單畫好後等一下才提示（Android 的 beforeinstallprompt 事件常常晚一點才來） */

    /* ═══ 一、環境偵測（純函式）═══
       env：{ ua, platform, maxTouchPoints, standalone }（standalone＝已經是從主畫面開的）
       回傳：
         inApp   內建瀏覽器的名字（'LINE'、'Facebook'、'Instagram'、'微信'），不是的話是 ''
         os      'ios'｜'android'｜'other'
         iosSafari  iPhone／iPad 上的 Safari（不是 Chrome／Firefox／Edge／Google App）
         standalone 原樣帶回 */
    function detect(env) {
        var ua = String(env.ua || '');
        var inApp = '';
        if (/\bLine\//i.test(ua)) inApp = 'LINE';
        else if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) inApp = 'Facebook';
        else if (/Instagram/i.test(ua)) inApp = 'Instagram';
        else if (/MicroMessenger/i.test(ua)) inApp = '微信';
        /* iPadOS 13 起 Safari 預設送「桌面版」的 UA（寫成 Macintosh），要靠 MacIntel＋多點觸控才認得出是 iPad */
        var ios = /iPad|iPhone|iPod/.test(ua) || (env.platform === 'MacIntel' && env.maxTouchPoints > 1);
        var os = ios ? 'ios' : (/Android/i.test(ua) ? 'android' : 'other');
        return {
            inApp: inApp,
            os: os,
            iosSafari: ios && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua) && !inApp,
            standalone: !!env.standalone
        };
    }

    function readEnv() {
        var standalone = false;
        try { standalone = !!(global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) || global.navigator.standalone === true; } catch (e) { }
        return detect({ ua: global.navigator.userAgent, platform: global.navigator.platform, maxTouchPoints: global.navigator.maxTouchPoints || 0, standalone: standalone });
    }

    var deferred = null;    /* Android Chrome 送來的安裝事件（按「安裝」時才呼叫它的 prompt()） */

    /* preventDefault：擋掉瀏覽器自己的小橫幅，改由我們挑時機提示 */
    global.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; });
    global.addEventListener('appinstalled', function () { deferred = null; });

    function canGuide() {
        var d = readEnv();
        return !d.standalone && !d.inApp && (!!deferred || d.os === 'ios' || d.os === 'android');
    }

    /* ═══ 二、小工具 ═══ */
    function sGet(k) { try { return global.sessionStorage.getItem(k); } catch (e) { return null; } }
    function sSet(k, v) { try { global.sessionStorage.setItem(k, v); } catch (e) { } }

    /* 這個頁面所在資料夾的網址（不含 ?openExternalBrowser 這類參數），複製給玩家貼到瀏覽器用 */
    function cleanUrl() { return global.location.origin + global.location.pathname.replace(/[^/]*$/, ''); }

    /* 複製文字：優先用 clipboard API（要 HTTPS），失敗或逾時就用看不見的 textarea＋execCommand（跟 js/share.js 同一套） */
    function copyText(text) {
        return new Promise(function (resolve) {
            function fallback() {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;left:-9999px';
                document.body.appendChild(ta);
                ta.select();
                var ok = false;
                try { ok = document.execCommand('copy'); } catch (e) { }
                document.body.removeChild(ta);
                resolve(ok);
            }
            if (global.navigator.clipboard && global.isSecureContext) {
                var settled = false;
                var once = function (fn) { return function () { if (!settled) { settled = true; fn(); } }; };
                global.navigator.clipboard.writeText(text).then(once(function () { resolve(true); }), once(fallback));
                global.setTimeout(once(fallback), 600);
            } else {
                fallback();
            }
        });
    }

    function dlgOpen(o) { return global.Dlg ? global.Dlg.open(o) : null; }
    function rich(t) { return global.Dlg.richText(t); }

    /* ═══ 三、LINE 等內建瀏覽器：請玩家改用瀏覽器開 ═══ */
    function showInAppNotice(name) {
        if (!global.Dlg || sGet(SS_INAPP)) return;
        sSet(SS_INAPP, '1');
        dlgOpen({
            title: '用瀏覽器開啟比較好',
            children: [rich(
                '你現在是在**' + name + ' 裡面**開啟遊戲。\n' +
                name + ' 的內建瀏覽器**不能加到手機桌面**，而且成績記錄跟瀏覽器是分開的，之後很容易找不到、玩不到。\n' +
                '請點畫面角落的「⋯」選單，選**「用瀏覽器開啟」**（Safari 或 Chrome）。\n' +
                '也可以先複製連結，再貼到瀏覽器。'
            )],
            buttons: [
                {
                    text: '複製連結', kind: 'go', keep: true,
                    onClick: function (ctl, el) {
                        copyText(cleanUrl()).then(function (ok) {
                            el.textContent = ok ? '已經複製，去瀏覽器貼上' : '複製失敗，請長按網址複製';
                        });
                    }
                },
                { text: '先在這裡玩', kind: 'line' }
            ]
        });
    }

    /* ═══ 四、加到主畫面：依平台給不同說明 ═══ */
    function openGuide() {
        if (!global.Dlg) return;
        var d = readEnv();
        var shareIcon = global.UI.h('span', { 'class': 'pwa-ico', html: global.UI.icon('share') });
        var title = '加到手機主畫面';
        var intro = '桌面會多一個「記憶模糊」圖示，點一下就能玩，不用再找連結。';
        var children, buttons;

        if (deferred) {
            /* Android Chrome／Edge：一鍵安裝（prompt() 一定要在點擊的當下呼叫，所以直接寫在按鈕的 onClick 裡） */
            children = [rich(intro + '\n**沒有網路也能玩**（排行榜除外）。')];
            buttons = [
                {
                    text: '安裝', kind: 'go',
                    onClick: function () {
                        var ev = deferred;
                        deferred = null;
                        try { ev.prompt(); } catch (e) { }
                    }
                },
                { text: '先不要', kind: 'line' }
            ];
        } else if (d.os === 'ios') {
            var steps;
            if (d.iosSafari) {
                steps = '①　點畫面下方（或上方）的**「分享」圖示**\n②　往下找，點**「加入主畫面」**\n③　按右上角的**「加入」**';
                children = [rich(intro + '\n**沒有網路也能玩**（排行榜除外）。'), shareIcon, rich(steps)];
            } else {
                steps = '點網址列旁的**「分享」圖示**，再點**「加入主畫面」**。\n如果找不到這個選項，請改用 **Safari** 開啟這個網址再加入。';
                children = [rich(intro), shareIcon, rich(steps)];
            }
            buttons = [{ text: '知道了', kind: 'go' }];
        } else {
            children = [rich(intro + '\n請點瀏覽器右上角的**「⋮」選單**，選**「加到主畫面」**或**「安裝應用程式」**。')];
            buttons = [{ text: '知道了', kind: 'go' }];
        }
        dlgOpen({ title: title, children: children, buttons: buttons });
    }

    /* 玩家第 3 次回到選單時，自動提示一次：已經安裝／在內建瀏覽器裡／還不到次數／14 天內提示過，都不跳 */
    function maybePrompt() {
        var visits = global.UI.store.get(KEY_VISITS, 0) || 0;
        if (!sGet(SS_COUNTED)) {
            sSet(SS_COUNTED, '1');
            visits += 1;
            global.UI.store.set(KEY_VISITS, visits);
        }
        if (visits < PROMPT_VISITS) return;
        var asked = global.UI.store.get(KEY_ASKED, 0) || 0;
        if (asked && Date.now() - asked < SNOOZE_MS) return;
        global.UI.wait(PROMPT_DELAY_MS).then(function () {
            if (!canGuide()) return;
            /* 已經有別的彈窗開著（玩家正在選遊戲、看分享…）就不打擾，下次再說 */
            if (document.querySelector('.dlg, .share-dlg:not([hidden]), .theme-dlg:not([hidden]), .game-dlg:not([hidden])')) return;
            global.UI.store.set(KEY_ASKED, Date.now());
            openGuide();
        });
    }

    global.PWA = {
        canGuide: canGuide,
        openGuide: openGuide,
        state: function () { var d = readEnv(); d.hasPrompt = !!deferred; d.visits = global.UI.store.get(KEY_VISITS, 0); return d; },
        test: { detect: detect }
    };

    global.UI.ready(function () {
        var d = readEnv();
        if (d.standalone) {
            /* 已經安裝：請瀏覽器盡量別清掉這個 App 的資料（Chrome／Safari 15.2+；只在安裝後才問，Firefox 會跳權限詢問） */
            try { if (global.navigator.storage && global.navigator.storage.persist) global.navigator.storage.persist(); } catch (e) { }
            return;
        }
        if (d.inApp) { global.UI.wait(500).then(function () { showInAppNotice(d.inApp); }); return; }
        maybePrompt();
    });
})(window);
