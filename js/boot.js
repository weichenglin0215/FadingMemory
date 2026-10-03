/* ═══════════════════════════════════════════════════════════════════
   boot.js — 版本檢查＋載入所有遊戲檔案
   ───────────────────────────────────────────────────────────────────
   1. 每次開頁面都（不經快取）讀 version.json 的版本號。
   2. 所有 CSS / JS 都加上 ?v=版本號 載入：
      版本號一改，網址就變了，瀏覽器一定會重新下載最新檔案；
      版本號沒變，就照常用快取（省流量、開得快）。
   3. boot.js 本身由 HTML 用時間戳載入，所以它永遠是最新的。
   4. 用 file:// 雙擊開啟時讀不到 version.json，就每次都用新的時間戳（本機檔案本來就沒有快取問題）。
   ★ 發佈新版本：改 version.json 的 version（並在 README 的「版本更新紀錄」寫一筆）。
   ★ 新增檔案：加到下面的 PAGES 清單。
   ═══════════════════════════════════════════════════════════════════ */

/* 整個檔案包在 (function(global){ ... })(window) 這個「立即執行函式」裡：
   目的是讓裡面宣告的 THREE_CDN／BASE_CSS／PAGES…等變數，都只存在這個函式的
   局部範圍（local scope），不會變成全域變數、污染到其他 <script> 檔案可能用到
   的同名變數。真正需要被外部看到的東西（例如下面會設定的 global.FM_VERSION），
   刻意透過參數 global（就是呼叫時傳進來的 window）掛上去，是「特意公開」的，
   不是不小心漏出去的。 */
(function (global) {
    'use strict';

    /* 本機沒有 vendor/three.min.js（或載入失敗）時，依序改試這兩個 CDN 來源 */
    var THREE_CDN = [
        'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.158.0/three.min.js'
    ];

    /* 每一頁都共用的基礎 CSS／JS（版面縮放、共用元件），所以獨立出來，
       下面 PAGES 裡每一頁用 .concat() 接上自己專屬的檔案 */
    var BASE_CSS = ['css/theme.css', 'css/stage.css'];
    var BASE_JS = ['js/stage.js', 'js/ui.js'];

    /* 每個頁面要載入的檔案清單。css 的載入順序不重要（全部平行載入）；
       js 的順序很重要——陣列裡「字串」的項目會照順序一個一個執行完才載下一個
       （例如 quiz 頁要先有 quiz_pools.js 的題庫資料，quiz_gen.js 才能用），
       「巢狀陣列」的項目（只有 world 頁的 three.min.js 用到）則是「依序嘗試
       這幾個來源，第一個成功就用它」的備援清單，不是全部都載入。 */
    var PAGES = {
        menu: {
            css: BASE_CSS.concat(['css/menu.css']),
            js: BASE_JS.concat(['js/menu.js', 'js/share.js'])
        },
        reaction: {
            css: BASE_CSS.concat(['css/reaction.css']),
            js: BASE_JS.concat(['js/sfx.js', 'js/reaction_core.js', 'js/reaction_kit.js', 'js/reaction_speed.js', 'js/reaction_drop.js', 'js/reaction_spot.js', 'js/reaction_impossible.js', 'js/reaction_shapes.js', 'js/reaction_matchcolor.js', 'js/reaction_rainbow.js', 'js/reaction_pendulum.js', 'js/reaction_tissue.js', 'js/reaction_landolt.js', 'js/reaction_lights.js', 'js/reaction_cups.js', 'js/reaction_pattern.js', 'js/reaction_illusion.js', 'js/reaction_pour.js', 'js/reaction_coins.js', 'js/reaction_invoice.js', 'js/reaction_paint.js', 'js/reaction_diff.js', 'js/reaction_bread.js', 'js/reaction_candy.js', 'js/reaction_curves.js', 'js/reaction_rps.js', 'js/reaction_balloon.js', 'js/reaction_price.js', 'js/reaction_heartbeat.js', 'js/reaction.js'])
        },
        quiz: {
            css: BASE_CSS.concat(['css/quiz.css']),
            js: BASE_JS.concat(['js/quiz_pools.js', 'js/quiz_gen.js', 'js/quiz_happyBirthday.js', 'js/quiz_travel.js', 'js/quiz_health.js', 'js/quiz_dining.js', 'js/quiz.js'])
        },
        world: {
            css: BASE_CSS.concat(['css/world.css']),
            js: [['vendor/three.min.js'].concat(THREE_CDN)].concat(BASE_JS, [
                'js/world/config.js',
                'js/world/hud.js',
                'js/world/kit.js',
                'js/world/core.js',
                'js/world/scenes.js',
                'js/world/story.js'
            ])
        }
    };

    /* window.FM_PAGE 是每一頁自己在 <head> 裡用一行 <script> 設定的字串
       （例如 index.html 設 'menu'、quiz.html 設 'quiz'），boot.js 靠這個字串
       去 PAGES 裡找出「這一頁該載入哪些檔案」。 */
    var pageName = global.FM_PAGE || 'menu';
    var page = PAGES[pageName];

    /* 判斷網址是不是 http(s):// 開頭的外部連結（CDN）——是的話不能再加上
       ?v=版本號 的 query string（那是給本地檔案做快取破壞用的，外部網址
       本來就有自己的版本號在路徑裡，加了反而可能造成 CDN 回應錯誤或變成
       另一個快取不到的網址）。 */
    function isRemote(u) { return /^https?:\/\//.test(u); }

    /* 動態插入一個 <link rel="stylesheet">，回傳一個「CSS 載入完成（或失敗）
       就會 resolve」的 Promise，讓外面可以用 .then() 接著做事。CSS 載入失敗
       也刻意 resolve（不是 reject）：單一 CSS 檔案掛掉，讓畫面能照樣跑、只是
       樣式不完整，好過整頁直接卡住。 */
    function loadCss(href) {
        return new Promise(function (resolve) {
            var l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = href;
            l.onload = l.onerror = function () { resolve(); };
            document.head.appendChild(l);
        });
    }

    /* 動態插入一個 <script src="...">。ordered=true 時設定 async=false：
       瀏覽器對 async=false 的動態 script 會保證「照插入的順序」依序執行，
       這樣 PAGES 清單裡那些有先後依賴關係的檔案（例如 quiz_pools.js 要比
       quiz_gen.js 先跑）才不會因為下載完成的時間不同而執行順序跑掉。
       跟 loadCss 不同，這裡載入失敗是真的 reject：缺一個 JS 檔案遊戲可能
       整個跑不動，要讓外層的 .catch() 接住、顯示錯誤畫面（見 fail()）。 */
    function loadJs(src, ordered) {
        return new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src;
            s.async = !ordered ? true : false;
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(src); };
            document.head.appendChild(s);
        });
    }

    /* 依序嘗試多個來源（例如本地 three.min.js 失敗就改用 CDN）：
       從 list[0] 開始試，失敗（.catch）就換下一個，直到成功或整份清單都
       試過還是失敗（最後一個失敗時把錯誤繼續往外丟出去）。 */
    function loadWithFallback(list, q) {
        var i = 0;
        function next() {
            var src = list[i];
            var url = isRemote(src) ? src : src + q;
            return loadJs(url, true).catch(function (e) {
                i++;
                if (i < list.length) return next();
                throw e;
            });
        }
        return next();
    }

    /* 讀 version.json，拿到裡面的版本號／日期／更新說明。
       file:// 開啟（雙擊 index.html）時，Chrome 會直接擋掉對本機其他檔案的 fetch()
       （file:// 的跨來源限制），擋下來的時候主控台一定會印出一行刺眼的紅字錯誤
       ——即使程式碼用 .catch 接住、不影響遊戲照常執行，那行錯誤還是會出現在
       主控台（這是瀏覽器自己印的，不是 JS 丟出來的例外，程式碼攔不住）。
       與其每次 file:// 開啟都讓玩家看到一次這種嚇人的錯誤訊息，不如直接偵測到
       file:// 協定就不要嘗試，一律使用「目前的時間戳記」當版本號（見下面主流程）
       ——一樣能做到「每次都載入最新檔案」，只是沒辦法顯示真正的版本號文字，
       主控台也乾乾淨淨。用本機伺服器（http://localhost:...）開啟完全不受影響。 */
    function fetchVersion() {
        if (location.protocol === 'file:' || !global.fetch) return Promise.resolve(null);
        return fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
    }

    /* localStorage 包一層 try/catch：有些瀏覽器環境（例如無痕模式、使用者關掉
       網站資料儲存）存取 localStorage 會直接拋出例外，不包起來的話會讓整個
       boot 流程中斷。這裡只是記錄「上一次看到的版本號」，讀不到/存不了都
       不影響遊戲能不能玩，所以失敗就安靜地回傳 null／什麼都不做即可。 */
    function storeGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
    function storeSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) { } }

    /* 檔案真的載不出來時的最後防線：先把畫面「解除隱藏」（不然使用者只會看到
       一片空白，見 HTML 裡 html:not(.stage-ready) body{visibility:hidden} 那條
       規則），再疊一個全螢幕的錯誤訊息方塊上去。 */
    function fail(what) {
        document.documentElement.classList.add('stage-ready');
        var box = document.createElement('div');
        box.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;' +
            'background:#FBF3D9;color:#4A3B1E;font:700 20px/1.6 sans-serif;text-align:center;z-index:99';
        box.textContent = '檔案載入失敗（' + what + '）。請確認網路連線後重新整理。';
        document.body ? document.body.appendChild(box) : document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(box); });
    }

    /* ═══ 主流程：這個檔案真正開始「做事」的地方 ═══
       1. 先讀版本號（或用時間戳記代替）。
       2. 把版本號記到 global.FM_VERSION，讓其他頁面（例如主選單想顯示
          「目前版本：1.13.3」）可以直接讀這個全域變數，不用自己再讀一次
          version.json。updated 旗標表示「這次讀到的版本號跟上次存的不一樣」，
          可以用來提示使用者「剛更新過」。
       3. 組出 ?v=版本號 這段 query string，所有本地 CSS/JS 檔名後面都接這個——
          這就是整個快取破壞機制的核心：版本號沒變，網址沒變，瀏覽器照常用
          快取；版本號一變，網址跟著變，瀏覽器就認定是全新的檔案要重新下載。
       4. 先把這一頁需要的 CSS 全部平行載入、等全部完成；CSS 跑完才開始載 JS
          （避免畫面在還沒套上樣式前就被 JS 動到）。JS 的部分：陣列型態的項目
          （目前只有 three.js）用 loadWithFallback 依序處理，其餘的 JS 檔案
          才平行下載（但靠 async=false 保證還是依照清單順序執行）。 */
    fetchVersion().then(function (info) {
        var ver = info && info.version ? String(info.version) : 'local-' + Date.now();
        var prev = storeGet('fm.version');
        global.FM_VERSION = { version: ver, date: info && info.date, notes: info && info.notes, previous: prev };
        if (info && info.version) {
            if (prev && prev !== ver) global.FM_VERSION.updated = true;
            storeSet('fm.version', ver);
        }
        var q = '?v=' + encodeURIComponent(ver);

        return Promise.all(page.css.map(function (h) { return loadCss(h + q); })).then(function () {
            /* 有備援來源的（three.js）先載好，其餘平行下載、照順序執行 */
            var chain = Promise.resolve();
            var rest = [];
            page.js.forEach(function (entry) {
                if (Array.isArray(entry)) chain = chain.then(function () { return loadWithFallback(entry, q); });
                else rest.push(entry);
            });
            return chain.then(function () {
                return Promise.all(rest.map(function (src) { return loadJs(isRemote(src) ? src : src + q, true); }));
            });
        });
    }).catch(function (e) { fail(e); });

    /* 停在主選單時，切回這個頁面就檢查一次；有新版本就自動重新整理。
       只在 menu 頁做這件事：使用者如果正在 quiz/reaction 頁答題答到一半，
       切回來就被強制重新整理會把正在做的事情打斷，體驗很差；主選單本身
       沒有「正在進行中」的狀態，重新整理完全無感，適合拿來做這個檢查。 */
    if (pageName === 'menu') {
        document.addEventListener('visibilitychange', function () {
            if (document.hidden || !global.FM_VERSION) return;
            fetchVersion().then(function (info) {
                if (info && info.version && String(info.version) !== global.FM_VERSION.version) location.reload();
            });
        });
    }
})(window);
